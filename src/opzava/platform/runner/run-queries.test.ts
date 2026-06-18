import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { listRecentWorkflowRuns } from './run-queries'
import { applyOpzavaRunnerRepositorySchema } from './migrations'

type EvKind = 'external-call' | 'cost' | 'audit'

function ev(
  db: Database.Database,
  args: { recordId: string; kind: EvKind; runId: string; occurredAt: string },
): void {
  applyOpzavaRunnerRepositorySchema(db)
  db.prepare(
    'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)',
  ).run(args.recordId, args.kind, args.runId, 'step-1', args.occurredAt, '{}')
}

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})

describe('listRecentWorkflowRuns', () => {
  it('returns [] on a fresh db', () => {
    const out = listRecentWorkflowRuns(db)
    expect(out).toEqual([])
  })

  it('groups events into one row per workflow run with counts', () => {
    ev(db, { recordId: 'r-1', kind: 'external-call', runId: 'wf-1', occurredAt: '2026-07-01T00:00:00.000Z' })
    ev(db, { recordId: 'r-2', kind: 'cost', runId: 'wf-1', occurredAt: '2026-07-01T00:01:00.000Z' })
    ev(db, { recordId: 'r-3', kind: 'audit', runId: 'wf-1', occurredAt: '2026-07-01T00:02:00.000Z' })
    const out = listRecentWorkflowRuns(db)
    expect(out.length).toBe(1)
    expect(out[0]).toEqual({
      workflowRunId: 'wf-1',
      eventCount: 3,
      lastEventAt: '2026-07-01T00:02:00.000Z',
      externalCallCount: 1,
      costCount: 1,
      auditCount: 1,
    })
  })

  it('orders runs by most recent event first', () => {
    ev(db, { recordId: 'old-1', kind: 'audit', runId: 'wf-old', occurredAt: '2026-07-01T00:00:00.000Z' })
    ev(db, { recordId: 'old-2', kind: 'cost', runId: 'wf-old', occurredAt: '2026-07-01T00:05:00.000Z' })
    ev(db, { recordId: 'new-1', kind: 'audit', runId: 'wf-new', occurredAt: '2026-07-05T00:00:00.000Z' })
    ev(db, { recordId: 'new-2', kind: 'cost', runId: 'wf-new', occurredAt: '2026-07-05T00:10:00.000Z' })
    const out = listRecentWorkflowRuns(db)
    expect(out[0]?.workflowRunId).toBe('wf-new')
    expect(out[1]?.workflowRunId).toBe('wf-old')
  })

  it('respects the limit', () => {
    ev(db, { recordId: 'a-1', kind: 'audit', runId: 'wf-a', occurredAt: '2026-07-01T00:00:00.000Z' })
    ev(db, { recordId: 'b-1', kind: 'audit', runId: 'wf-b', occurredAt: '2026-07-02T00:00:00.000Z' })
    ev(db, { recordId: 'c-1', kind: 'audit', runId: 'wf-c', occurredAt: '2026-07-03T00:00:00.000Z' })
    const out = listRecentWorkflowRuns(db, { limit: 2 })
    expect(out.length).toBe(2)
  })

  it('counts only the matching kinds', () => {
    ev(db, { recordId: 'mix-1', kind: 'audit', runId: 'wf-mix', occurredAt: '2026-07-01T00:00:00.000Z' })
    ev(db, { recordId: 'mix-2', kind: 'audit', runId: 'wf-mix', occurredAt: '2026-07-01T00:01:00.000Z' })
    const out = listRecentWorkflowRuns(db)
    expect(out.length).toBe(1)
    expect(out[0]?.auditCount).toBe(2)
    expect(out[0]?.externalCallCount).toBe(0)
    expect(out[0]?.costCount).toBe(0)
    expect(out[0]?.eventCount).toBe(2)
  })
})
