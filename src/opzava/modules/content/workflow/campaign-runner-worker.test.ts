import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'

import { runCampaignSendWithRepository } from './run-campaign-send-with-repository'
import { createCampaignRunnerWorker } from './campaign-runner-worker'

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
})
