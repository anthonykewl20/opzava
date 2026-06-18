import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { applyOpzavaRunnerRepositorySchema } from '@/opzava/platform/runner/migrations'
import { parseDeadLetterStorageRecord } from '@/opzava/platform/runner/repository-contracts'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbRef.db,
}))

import { GET } from './route'

function rec(id: string, storedAt: string) {
  return {
    schemaVersion: 1,
    recordId: `r-${id}`,
    storedAt,
    workflowRunId: 'wf-1',
    stepRunId: 'step-1',
    replayEligible: true,
    deadLetter: {
      schemaVersion: 1,
      deadLetterId: id,
      jobId: `job-${id}`,
      workflowRunId: 'wf-1',
      stepRunId: 'step-1',
      finalError: { class: 'provider-error', message: 'send failed' },
      replay: { eligible: true, source: 'failed-step', reason: 'retries exhausted' },
      jobSnapshot: { idempotencyKey: `idem-${id}`, payload: { to: 'a@x.com' } },
      createdAt: storedAt,
    },
  }
}

function seed(db: any, id: string, storedAt: string) {
  applyOpzavaRunnerRepositorySchema(db)
  const parsed = parseDeadLetterStorageRecord(rec(id, storedAt))
  db
    .prepare(
      'INSERT INTO opzava_runner_dead_letters (dead_letter_id, job_id, workflow_run_id, step_run_id, replay_eligible, stored_at, record_json) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      parsed.deadLetter.deadLetterId,
      parsed.deadLetter.jobId,
      parsed.workflowRunId,
      parsed.stepRunId,
      parsed.replayEligible ? 1 : 0,
      parsed.storedAt,
      JSON.stringify(parsed),
    )
}

function req(qs?: string) {
  return new NextRequest(`http://localhost/api/ops/dead-letters${qs || ''}`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/dead-letters', () => {
  it('returns an empty list when there are no dead letters', async () => {
    applyOpzavaRunnerRepositorySchema(dbRef.db)
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deadLetters).toEqual([])
  })

  it('returns seeded dead letters newest-first', async () => {
    seed(dbRef.db, 'dl-old', '2026-07-01T00:00:00.000Z')
    seed(dbRef.db, 'dl-new', '2026-07-03T00:00:00.000Z')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deadLetters.length).toBe(2)
    expect(body.deadLetters[0].deadLetter.deadLetterId).toBe('dl-new')
    expect(body.deadLetters[1].deadLetter.deadLetterId).toBe('dl-old')
  })

  it('respects a limit query param', async () => {
    seed(dbRef.db, 'dl-a', '2026-07-01T00:00:00.000Z')
    seed(dbRef.db, 'dl-b', '2026-07-02T00:00:00.000Z')
    seed(dbRef.db, 'dl-c', '2026-07-03T00:00:00.000Z')
    const res = await GET(req('?limit=2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deadLetters.length).toBe(2)
  })
})
