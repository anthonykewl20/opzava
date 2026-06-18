import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createCampaignRepository } from './campaign-repository'
import { parseCampaign, type Campaign } from './campaign'
import { runApprovedCampaign, type RunApprovedCampaignDeps } from './run-approved-campaign'
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

function makeCampaign(status: Campaign['status']): Campaign {
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
      recipients: ['a@x.com', 'b@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
  return parseCampaign(draft)
}

function seedCampaign(db: Database.Database, status: Campaign['status']): void {
  const repo = createCampaignRepository(db)
  const c = makeCampaign(status)
  repo.saveCampaign(c)
}

describe('runApprovedCampaign', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it("drains an approved campaign to 'sent'", async () => {
    seedCampaign(db, 'approved')
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

  it("marks the campaign 'failed' when sends fail", async () => {
    seedCampaign(db, 'approved')
    const sender: CampaignEmailSender = async () => ({ ok: false, messageId: null })
    const deps = makeDeps(db, sender)
    const res = await runApprovedCampaign(deps, { campaignId: 'camp-1' })
    expect(res.status).toBe('failed')
    expect(res.sent).toBe(0)
    const stored = createCampaignRepository(db).getCampaignById('camp-1')
    expect(stored?.status).toBe('failed')
  })

  it('throws when the campaign does not exist', async () => {
    const sender: CampaignEmailSender = async () => ({ ok: true, messageId: 'm' })
    const deps = makeDeps(db, sender)
    await expect(runApprovedCampaign(deps, { campaignId: 'nope' })).rejects.toThrow(/not found/)
  })
})
