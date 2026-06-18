import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { pruneRunnerData } from './retention'
import { applyOpzavaRunnerRepositorySchema } from './migrations'

function ev(db: Database.Database, id: string, occurredAt: string): void {
  applyOpzavaRunnerRepositorySchema(db)
  db.prepare(
    'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)'
  ).run(id, 'audit', 'wf-1', 'step-1', occurredAt, '{}')
}

function dl(db: Database.Database, id: string, storedAt: string): void {
  applyOpzavaRunnerRepositorySchema(db)
  db.prepare(
    'INSERT INTO opzava_runner_dead_letters (dead_letter_id, job_id, workflow_run_id, step_run_id, replay_eligible, stored_at, record_json) VALUES (?,?,?,?,?,?,?)'
  ).run(id, `job-${id}`, 'wf-1', 'step-1', 1, storedAt, '{}')
}

function job(
  db: Database.Database,
  id: string,
  status: string,
  updatedAt: string
): void {
  applyOpzavaRunnerRepositorySchema(db)
  db.prepare(
    'INSERT INTO opzava_runner_jobs (job_id, workflow_run_id, step_run_id, status, priority, idempotency_key, scheduled_at, lease_expires_at, record_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id,
    'wf-1',
    'step-1',
    status,
    50,
    `idem-${id}`,
    updatedAt,
    null,
    '{}',
    updatedAt,
    updatedAt
  )
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
}

const CUTOFF = '2026-07-02T00:00:00.000Z'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})

describe('pruneRunnerData', () => {
  it('returns zeros on a fresh db and does not throw', () => {
    expect(pruneRunnerData(db, { olderThan: CUTOFF })).toEqual({
      operationalEvents: 0,
      deadLetters: 0,
      succeededJobs: 0,
    })
  })

  it('throws without a cutoff', () => {
    expect(() =>
      pruneRunnerData(db, { olderThan: '' } as unknown as { olderThan: string })
    ).toThrow()
  })

  it('prunes operational events older than the cutoff, keeps newer', () => {
    ev(db, 'e-old', '2026-07-01T00:00:00.000Z')
    ev(db, 'e-new', '2026-07-03T00:00:00.000Z')
    const r = pruneRunnerData(db, { olderThan: CUTOFF })
    expect(r.operationalEvents).toBe(1)
    expect(countRows(db, 'opzava_runner_operational_events')).toBe(1)
  })

  it('prunes dead letters older than the cutoff', () => {
    dl(db, 'd-old', '2026-07-01T00:00:00.000Z')
    dl(db, 'd-new', '2026-07-05T00:00:00.000Z')
    const r = pruneRunnerData(db, { olderThan: CUTOFF })
    expect(r.deadLetters).toBe(1)
    expect(countRows(db, 'opzava_runner_dead_letters')).toBe(1)
  })

  it('prunes only succeeded jobs older than the cutoff, keeps queued/failed and recent', () => {
    job(db, 'j-succ-old', 'succeeded', '2026-07-01T00:00:00.000Z')
    job(db, 'j-succ-new', 'succeeded', '2026-07-09T00:00:00.000Z')
    job(db, 'j-queued-old', 'queued', '2026-07-01T00:00:00.000Z')
    job(db, 'j-failed-old', 'failed', '2026-07-01T00:00:00.000Z')
    const r = pruneRunnerData(db, { olderThan: CUTOFF })
    expect(r.succeededJobs).toBe(1)
    expect(countRows(db, 'opzava_runner_jobs')).toBe(3)
  })

  it('is idempotent — a second prune deletes nothing', () => {
    ev(db, 'e-old', '2026-07-01T00:00:00.000Z')
    pruneRunnerData(db, { olderThan: CUTOFF })
    const r2 = pruneRunnerData(db, { olderThan: CUTOFF })
    expect(r2).toEqual({
      operationalEvents: 0,
      deadLetters: 0,
      succeededJobs: 0,
    })
  })
})
