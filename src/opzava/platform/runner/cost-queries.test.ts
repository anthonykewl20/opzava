import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { listRecentCostEvents, summarizeCostEvents } from './cost-queries'
import { applyOpzavaRunnerRepositorySchema } from './migrations'
import { parseOperationalEventStorageRecord } from './repository-contracts'

type CostRecArgs = Readonly<{
  id: string
  occurredAt: string
  estimated: number
  actual: number | null
}>

function costRec(args: CostRecArgs): Record<string, unknown> {
  return {
    schemaVersion: 1,
    recordId: `r-${args.id}`,
    kind: 'cost',
    workflowRunId: 'wf-1',
    stepRunId: 'step-1',
    occurredAt: args.occurredAt,
    event: {
      schemaVersion: 1,
      costEventId: args.id,
      workflowRunId: 'wf-1',
      stepRunId: 'step-1',
      externalCallId: null,
      providerId: 'live-resend',
      operation: 'resend-email-send',
      units: { requests: 1 },
      estimatedCostCents: args.estimated,
      actualCostCents: args.actual,
      currency: 'USD',
      recordedAt: args.occurredAt
    }
  }
}

function seed(db: Database.Database, args: CostRecArgs): void {
  applyOpzavaRunnerRepositorySchema(db)
  const parsed = parseOperationalEventStorageRecord(costRec(args))
  db.prepare(
    'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)'
  ).run(
    parsed.recordId,
    parsed.kind,
    parsed.workflowRunId,
    parsed.stepRunId,
    parsed.occurredAt,
    JSON.stringify(parsed)
  )
}

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})

describe('listRecentCostEvents', () => {
  it('returns [] on a fresh db', () => {
    expect(listRecentCostEvents(db)).toEqual([])
  })

  it('lists only cost events, newest-first', () => {
    seed(db, { id: 'c-old', occurredAt: '2026-07-01T00:00:00.000Z', estimated: 10, actual: 12 })
    seed(db, { id: 'c-new', occurredAt: '2026-07-03T00:00:00.000Z', estimated: 20, actual: null })
    db.prepare(
      'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)'
    ).run('audit-1', 'audit', 'wf-1', 'step-1', '2026-07-02T00:00:00.000Z', '{}')

    const out = listRecentCostEvents(db)

    expect(out).toHaveLength(2)
    expect((out[0].event as { costEventId: string }).costEventId).toBe('c-new')
    expect((out[1].event as { costEventId: string }).costEventId).toBe('c-old')
    for (const r of out) {
      expect(r.kind).toBe('cost')
    }
  })

  it('respects the limit', () => {
    seed(db, { id: 'c-a', occurredAt: '2026-07-01T00:00:00.000Z', estimated: 1, actual: 1 })
    seed(db, { id: 'c-b', occurredAt: '2026-07-02T00:00:00.000Z', estimated: 2, actual: 2 })
    seed(db, { id: 'c-c', occurredAt: '2026-07-03T00:00:00.000Z', estimated: 3, actual: 3 })

    const out = listRecentCostEvents(db, { limit: 2 })

    expect(out).toHaveLength(2)
    expect((out[0].event as { costEventId: string }).costEventId).toBe('c-c')
    expect((out[1].event as { costEventId: string }).costEventId).toBe('c-b')
  })
})

describe('summarizeCostEvents', () => {
  it('totals estimated and actual (skipping null actual)', () => {
    seed(db, { id: 'c-old', occurredAt: '2026-07-01T00:00:00.000Z', estimated: 10, actual: 12 })
    seed(db, { id: 'c-new', occurredAt: '2026-07-03T00:00:00.000Z', estimated: 20, actual: null })

    const out = listRecentCostEvents(db)
    const summary = summarizeCostEvents(out)

    expect(summary.count).toBe(2)
    expect(summary.estimatedCostCents).toBe(30)
    expect(summary.actualCostCents).toBe(12)
  })

  it('returns zeros for an empty list', () => {
    expect(summarizeCostEvents([])).toEqual({
      count: 0,
      estimatedCostCents: 0,
      actualCostCents: 0
    })
  })
})
