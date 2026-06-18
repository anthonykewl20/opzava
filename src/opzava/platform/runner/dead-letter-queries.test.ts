import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { listRecentDeadLetters } from './dead-letter-queries'
import { applyOpzavaRunnerRepositorySchema } from './migrations'
import { parseDeadLetterStorageRecord } from './repository-contracts'

function rec(overrides: {
  deadLetterId: string
  recordId: string
  storedAt: string
  workflowRunId: string
}) {
  return {
    schemaVersion: 1,
    recordId: overrides.recordId,
    storedAt: overrides.storedAt,
    workflowRunId: overrides.workflowRunId,
    stepRunId: 'step-1',
    replayEligible: true,
    deadLetter: {
      schemaVersion: 1,
      deadLetterId: overrides.deadLetterId,
      jobId: 'job-1',
      workflowRunId: overrides.workflowRunId,
      stepRunId: 'step-1',
      finalError: { class: 'provider-error', message: 'send failed' },
      replay: { eligible: true, source: 'failed-step', reason: 'retries exhausted' },
      jobSnapshot: { idempotencyKey: 'idem-1', payload: { to: 'a@x.com' } },
      createdAt: overrides.storedAt,
    },
  }
}

function seed(db: Database.Database, overrides: Parameters<typeof rec>[0]) {
  applyOpzavaRunnerRepositorySchema(db)
  const parsed = parseDeadLetterStorageRecord(rec(overrides))
  db.prepare(
    `INSERT INTO opzava_runner_dead_letters
       (dead_letter_id, job_id, workflow_run_id, step_run_id, replay_eligible, stored_at, record_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    parsed.deadLetter.deadLetterId,
    parsed.deadLetter.jobId,
    parsed.workflowRunId,
    parsed.stepRunId,
    parsed.replayEligible ? 1 : 0,
    parsed.storedAt,
    JSON.stringify(parsed)
  )
}

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
})

describe('listRecentDeadLetters', () => {
  it('returns an empty array on a fresh db', () => {
    const result = listRecentDeadLetters(db)
    expect(result).toEqual([])
  })

  it('returns seeded dead letters', () => {
    seed(db, {
      deadLetterId: 'dl-1',
      recordId: 'rec-1',
      storedAt: '2026-07-01T00:00:00.000Z',
      workflowRunId: 'wf-1',
    })
    seed(db, {
      deadLetterId: 'dl-2',
      recordId: 'rec-2',
      storedAt: '2026-07-02T00:00:00.000Z',
      workflowRunId: 'wf-2',
    })

    const result = listRecentDeadLetters(db)
    expect(result).toHaveLength(2)
    for (const item of result) {
      expect(item).toHaveProperty('deadLetter.deadLetterId')
    }
  })

  it('orders newest first by storedAt DESC', () => {
    seed(db, {
      deadLetterId: 'dl-old',
      recordId: 'rec-old',
      storedAt: '2026-07-01T00:00:00.000Z',
      workflowRunId: 'wf-1',
    })
    seed(db, {
      deadLetterId: 'dl-new',
      recordId: 'rec-new',
      storedAt: '2026-07-03T00:00:00.000Z',
      workflowRunId: 'wf-2',
    })

    const result = listRecentDeadLetters(db)
    expect(result[0].deadLetter.deadLetterId).toBe('dl-new')
  })

  it('respects the limit', () => {
    seed(db, {
      deadLetterId: 'dl-1',
      recordId: 'rec-1',
      storedAt: '2026-07-01T00:00:00.000Z',
      workflowRunId: 'wf-1',
    })
    seed(db, {
      deadLetterId: 'dl-2',
      recordId: 'rec-2',
      storedAt: '2026-07-02T00:00:00.000Z',
      workflowRunId: 'wf-2',
    })
    seed(db, {
      deadLetterId: 'dl-3',
      recordId: 'rec-3',
      storedAt: '2026-07-03T00:00:00.000Z',
      workflowRunId: 'wf-3',
    })

    const result = listRecentDeadLetters(db, { limit: 2 })
    expect(result).toHaveLength(2)
  })

  it('clamps a huge or tiny limit', () => {
    seed(db, {
      deadLetterId: 'dl-1',
      recordId: 'rec-1',
      storedAt: '2026-07-01T00:00:00.000Z',
      workflowRunId: 'wf-1',
    })

    const huge = listRecentDeadLetters(db, { limit: 9999 })
    expect(huge).toHaveLength(1)

    const tiny = listRecentDeadLetters(db, { limit: 0 })
    expect(tiny).toHaveLength(1)
  })
})
