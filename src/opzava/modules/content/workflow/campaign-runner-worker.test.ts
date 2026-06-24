import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'

import { runCampaignSendWithRepository } from './run-campaign-send-with-repository'
import { createCampaignRunnerWorker } from './campaign-runner-worker'
import { defaultOpzavaAdminSettings, parseOpzavaAdminSettings } from '@/opzava/platform/admin-config/settings'
import { projectRetryPolicyOptions } from '@/opzava/platform/admin-config/runtime-options'

function buildInput() {
  return {
    campaignId: 'camp-1',
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [
      { stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 },
      { stepId: 's2', subject: 'Bye', html: '<p>2</p>', offsetHours: 24 },
    ],
    audience: {
      schemaVersion: 1 as const,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com', 'b@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  }
}

function buildDeps(db: Database.Database) {
  let idCounter = 0
  const newId = () => 'id-' + ++idCounter

  let attemptCounter = 0
  const attemptId = () => 'attempt-' + ++attemptCounter
  const deadLetterId = ({ jobId, attemptId: a }: { jobId: string; attemptId: string }) =>
    `dl-${jobId}-${a}`

  return { newId, attemptId, deadLetterId }
}

describe('campaign-runner-worker', () => {
  it('drains every enqueued campaign send through the durable worker', async () => {
    const db = new Database(':memory:')
    const { newId, attemptId, deadLetterId } = buildDeps(db)
    const input = buildInput()

    const enqueue = runCampaignSendWithRepository(
      db,
      { newId, now: () => '2026-07-01T00:00:00.000Z', workflowRunId: 'wf-1', approvalGranted: true },
      input,
    )
    expect(enqueue.enqueued.length).toBe(4)

    const sent: Array<{ to: string }> = []
    const sender = async (m: { to: string }) => {
      sent.push(m)
      return { ok: true, messageId: 'msg-' + sent.length }
    }

    const worker = createCampaignRunnerWorker({
      db,
      sender,
      workerId: 'w-1',
      clock: { now: () => new Date('2026-07-03T00:00:00.000Z') },
      ids: { attemptId, deadLetterId },
    })

    const statuses: string[] = []
    for (let i = 0; i < 6; i++) {
      const r = await worker.runNext()
      statuses.push(r.status)
      if (r.status === 'idle') break
    }

    expect(sent.length).toBe(4)
    expect(statuses.filter((s) => s === 'succeeded').length).toBe(4)
    expect(statuses[statuses.length - 1]).toBe('idle')

    const recipients = new Set(sent.map((m) => m.to))
    expect(recipients.size).toBe(2)
    expect(recipients.has('a@x.com')).toBe(true)
    expect(recipients.has('b@x.com')).toBe(true)
    expect(sent.filter((m) => m.to === 'a@x.com').length).toBe(2)
    expect(sent.filter((m) => m.to === 'b@x.com').length).toBe(2)

    db.close()
  })

  it('sends nothing when the campaign was never enqueued', async () => {
    const db = new Database(':memory:')
    const { attemptId, deadLetterId } = buildDeps(db)

    const sent: Array<{ to: string }> = []
    const sender = async (m: { to: string }) => {
      sent.push(m)
      return { ok: true, messageId: 'msg-' + sent.length }
    }

    const worker = createCampaignRunnerWorker({
      db,
      sender,
      workerId: 'w-2',
      clock: { now: () => new Date('2026-07-03T00:00:00.000Z') },
      ids: { attemptId, deadLetterId },
    })

    const r = await worker.runNext()
    expect(r.status).toBe('idle')
    expect(sent.length).toBe(0)

    db.close()
  })

  it('builds its retry policy from the projected runtime settings, not source literals', async () => {
    const failedAt = new Date('2026-07-03T00:00:00.000Z')
    // An operator tunes retry.initialDelayMs up from the worker's old hardcoded 2 min.
    const settings = parseOpzavaAdminSettings({
      ...defaultOpzavaAdminSettings(),
      retry: { ...defaultOpzavaAdminSettings().retry, initialDelayMs: 5 * 60_000 },
    })

    const db = new Database(':memory:')
    const { newId, attemptId, deadLetterId } = buildDeps(db)
    const input = buildInput()

    runCampaignSendWithRepository(
      db,
      { newId, now: () => '2026-07-01T00:00:00.000Z', workflowRunId: 'wf-1', approvalGranted: true },
      input,
    )

    const failingSender = async () => ({ ok: false, messageId: null })
    const worker = createCampaignRunnerWorker({
      db,
      sender: failingSender,
      workerId: 'w-retry',
      clock: { now: () => failedAt },
      ids: { attemptId, deadLetterId },
      retryOptions: projectRetryPolicyOptions(settings),
    })

    const result = await worker.runNext()
    expect(result.status).toBe('failed-retry')

    // The first retry is scheduled at failedAt + initialDelayMs. With the projected
    // 5 min the base is 00:05:00; per-call jitter (0..25% of base = up to 75s) lands it in
    // [00:05:00, 00:06:15]. The hardcoded 2-min literal would be [00:02:00, 00:02:30], so the
    // floor at 00:05:00 is the RUN-3 discriminator (projected settings, not source literals).
    const scheduledAt = readJobScheduledAt(db, 'id-1')
    expect(scheduledAt >= '2026-07-03T00:05:00.000Z').toBe(true)
    expect(scheduledAt <= '2026-07-03T00:06:15.000Z').toBe(true)

    db.close()
  })
})

function readJobScheduledAt(db: Database.Database, jobId: string): string {
  const row = db.prepare('SELECT record_json FROM opzava_runner_jobs WHERE job_id = ?').get(jobId) as { record_json: string } | undefined
  if (!row) throw new Error(`job not found: ${jobId}`)
  return JSON.parse(row.record_json).job.scheduledAt as string
}
