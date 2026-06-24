import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createCampaignRepository } from './campaign-repository'
import { parseCampaign, type Campaign } from './campaign'
import { runApprovedCampaign, type RunApprovedCampaignDeps } from './run-approved-campaign'
import { createCampaignSendApproval } from './campaign-send-approval'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { type CampaignEmailSender } from '../workflow/email-campaign'

function makeDb(): Database.Database {
  return new Database(':memory:')
}

function makeIdCounter() {
  let n = 0
  return () => {
    n += 1
    return `id-${n}`
  }
}

function makeAttemptCounter() {
  let n = 0
  return () => {
    n += 1
    return `att-${n}`
  }
}

const NOW_ISO = '2026-07-05T00:00:00.000Z'
const CLOCK_DATE = new Date('2026-07-05T00:00:00.000Z')

function makeDeps(db: Database.Database, sender: CampaignEmailSender): RunApprovedCampaignDeps {
  return {
    db,
    sender,
    newId: makeIdCounter(),
    now: () => NOW_ISO,
    workflowRunId: 'wf-1',
    clock: { now: () => CLOCK_DATE },
    ids: {
      attemptId: makeAttemptCounter(),
      deadLetterId: ({ jobId, attemptId }: { jobId: string; attemptId: string }) =>
        `dl-${jobId}-${attemptId}`,
    },
  }
}

function makeCampaign(status: Campaign['status'], recipients = ['a@x.com', 'b@x.com']): Campaign {
  const draft = {
    schemaVersion: 1 as const,
    campaignId: 'camp-1',
    name: 'Launch',
    status,
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [{ stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 }],
    audience: {
      schemaVersion: 1 as const,
      audienceId: 'aud-1',
      name: 'A',
      recipients,
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
  return parseCampaign(draft)
}

function seedCampaign(
  db: Database.Database,
  status: Campaign['status'],
  recipients?: string[],
): void {
  const repo = createCampaignRepository(db)
  const c = makeCampaign(status, recipients)
  repo.saveCampaign(c)
}

type RunnerJobRow = { status: string; scheduled_at: string; record_json: string }

function listRunnerJobs(db: Database.Database): readonly RunnerJobRow[] {
  return db
    .prepare('SELECT status, scheduled_at, record_json FROM opzava_runner_jobs')
    .all() as RunnerJobRow[]
}

function seedSendApproval(db: Database.Database, campaignId = 'camp-1'): void {
  createApprovalRepository(db).saveApproval(
    createCampaignSendApproval({ campaignId, approverId: 'admin', now: NOW_ISO }),
  )
}

describe('runApprovedCampaign', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it("drains an approved campaign to 'sent'", async () => {
    seedCampaign(db, 'approved')
    seedSendApproval(db)
    const sender: CampaignEmailSender = async () => ({ ok: true, messageId: 'm' })
    const deps = makeDeps(db, sender)
    const res = await runApprovedCampaign(deps, { campaignId: 'camp-1' })
    expect(res.status).toBe('sent')
    expect(res.total).toBe(2)
    expect(res.sent).toBe(2)
    const stored = createCampaignRepository(db).getCampaignById('camp-1')
    expect(stored?.status).toBe('sent')
  })

  it('refuses a non-approved campaign', async () => {
    seedCampaign(db, 'draft')
    const sender: CampaignEmailSender = async () => ({ ok: true, messageId: 'm' })
    const deps = makeDeps(db, sender)
    await expect(runApprovedCampaign(deps, { campaignId: 'camp-1' })).rejects.toThrow(/not approved/)
    const stored = createCampaignRepository(db).getCampaignById('camp-1')
    expect(stored?.status).toBe('draft')
  })

  it("transitions to 'retrying' when sends fail transiently with retry budget remaining", async () => {
    // RUN-4: a provider-error is retryable while attemptCount < maxAttempts, so a failed send must
    // not terminal-mark the campaign. It schedules a retry and leaves the campaign non-terminal.
    seedCampaign(db, 'approved')
    seedSendApproval(db)
    const sender: CampaignEmailSender = async () => ({ ok: false, messageId: null })
    const deps = makeDeps(db, sender)
    const res = await runApprovedCampaign(deps, { campaignId: 'camp-1' })
    expect(res.status).toBe('retrying')
    expect(res.sent).toBe(0)
    const stored = createCampaignRepository(db).getCampaignById('camp-1')
    expect(stored?.status).toBe('retrying')
    // Both jobs are queued for retry, none dead-lettered.
    const jobs = listRunnerJobs(db)
    expect(jobs.filter((j) => j.status === 'queued').length).toBe(2)
    expect(jobs.filter((j) => j.status === 'dead-lettered').length).toBe(0)
  })

  it("terminally marks the campaign 'failed' only when a send exhausts its retry budget", async () => {
    // With maxAttempts: 1 the first failure cannot retry — the job dead-letters and the campaign
    // is terminally 'failed'. This is the one path that warrants a terminal 'failed'.
    seedCampaign(db, 'approved')
    seedSendApproval(db)
    const sender: CampaignEmailSender = async () => ({ ok: false, messageId: null })
    const deps = { ...makeDeps(db, sender), maxAttempts: 1 }
    const res = await runApprovedCampaign(deps, { campaignId: 'camp-1' })
    expect(res.status).toBe('failed')
    expect(res.sent).toBe(0)
    const stored = createCampaignRepository(db).getCampaignById('camp-1')
    expect(stored?.status).toBe('failed')
    const jobs = listRunnerJobs(db)
    expect(jobs.filter((j) => j.status === 'dead-lettered').length).toBe(2)
    expect(jobs.filter((j) => j.status === 'queued').length).toBe(0)
  })

  it('does not terminal-mark the campaign when one recipient fails transiently with retry budget remaining', async () => {
    // RUN-4: a single transient recipient failure is retried by the runner (job re-queued with a
    // future scheduled_at). The inline drain cannot wait out the retry window, so it must NOT
    // terminal-mark the whole campaign 'failed' while a retry job is still queued.
    seedCampaign(db, 'approved', ['a@x.com', 'b@x.com', 'c@x.com'])
    seedSendApproval(db)
    let sends = 0
    const sender: CampaignEmailSender = async (msg) => {
      sends += 1
      // The second recipient fails transiently; the other two succeed. A provider-error is
      // retryable while attemptCount < maxAttempts (default 3).
      if (msg.to === 'b@x.com') return { ok: false, messageId: null }
      return { ok: true, messageId: 'm' }
    }
    const deps = makeDeps(db, sender)
    const res = await runApprovedCampaign(deps, { campaignId: 'camp-1' })

    // The campaign must not be terminal 'failed' with the retry abandoned.
    expect(res.status).not.toBe('failed')
    const stored = createCampaignRepository(db).getCampaignById('camp-1')
    expect(stored?.status).not.toBe('failed')

    // The transiently-failed recipient's job must still be queued for retry (not dead-lettered,
    // not abandoned): status 'queued' with a scheduled_at in the future relative to the run.
    const jobs = listRunnerJobs(db)
    const retryJobs = jobs.filter((j) => j.status === 'queued')
    expect(retryJobs.length).toBe(1)
    const retryJob = retryJobs[0]
    // scheduled_at is strictly after the run's clock instant (the retry policy delays it).
    expect(retryJob.scheduled_at > NOW_ISO).toBe(true)
    // The two successful sends are terminal 'succeeded', not stranded.
    expect(jobs.filter((j) => j.status === 'succeeded').length).toBe(2)
    // No job should be dead-lettered for a retryable failure.
    expect(jobs.filter((j) => j.status === 'dead-lettered').length).toBe(0)
  })

  it('throws when the campaign does not exist', async () => {
    const sender: CampaignEmailSender = async () => ({ ok: true, messageId: 'm' })
    const deps = makeDeps(db, sender)
    await expect(runApprovedCampaign(deps, { campaignId: 'nope' })).rejects.toThrow(/not found/)
  })

  it('refuses an approved campaign that has no granted send approval (F1)', async () => {
    seedCampaign(db, 'approved') // campaign row is approved, but no Approval record was minted
    let sends = 0
    const sender: CampaignEmailSender = async () => {
      sends += 1
      return { ok: true, messageId: 'm' }
    }
    const deps = makeDeps(db, sender)
    await expect(runApprovedCampaign(deps, { campaignId: 'camp-1' })).rejects.toThrow(/approval not granted/)
    expect(sends).toBe(0) // nothing was sent
    // the campaign was not transitioned into 'sending'
    expect(createCampaignRepository(db).getCampaignById('camp-1')?.status).toBe('approved')
  })
})
