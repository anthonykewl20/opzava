import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { applyOpzavaRunnerRepositorySchema } from '../runner/migrations'
import { parseOperationalEventStorageRecord } from '../runner/repository-contracts'
import { readEngineACostContribution, readUnifiedCostSummary } from './unified-cost-reader'

function seedOpzavaCost(db: Database.Database, id: string, estimated: number, actual: number | null): void {
  const record = parseOperationalEventStorageRecord({
    schemaVersion: 1,
    recordId: `r-${id}`,
    kind: 'cost',
    workflowRunId: 'wf-1',
    stepRunId: 'step-1',
    occurredAt: '2026-07-05T00:00:00.000Z',
    event: {
      schemaVersion: 1,
      costEventId: id,
      workflowRunId: 'wf-1',
      stepRunId: 'step-1',
      externalCallId: null,
      providerId: 'live-resend',
      operation: 'resend-email-send',
      units: { requests: 1 },
      estimatedCostCents: estimated,
      actualCostCents: actual,
      currency: 'USD',
      recordedAt: '2026-07-05T00:00:00.000Z',
    },
  })
  db.prepare(
    'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)',
  ).run(record.recordId, record.kind, record.workflowRunId, record.stepRunId, record.occurredAt, JSON.stringify(record))
}

function createEngineATokenUsage(db: Database.Database): void {
  db.exec('CREATE TABLE token_usage (id INTEGER PRIMARY KEY, model TEXT, cost_usd REAL)')
}

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  applyOpzavaRunnerRepositorySchema(db)
})

describe('readEngineACostContribution', () => {
  it('sums priced token_usage rows into a cents contribution, ignoring null costs', () => {
    createEngineATokenUsage(db)
    db.prepare('INSERT INTO token_usage (model, cost_usd) VALUES (?, ?)').run('m', 1.5)
    db.prepare('INSERT INTO token_usage (model, cost_usd) VALUES (?, ?)').run('m', 2.5)
    db.prepare('INSERT INTO token_usage (model, cost_usd) VALUES (?, ?)').run('m', null) // unpriced — ignored
    expect(readEngineACostContribution(db)).toEqual({ count: 2, costCents: 400 })
  })

  it('degrades to a zero contribution when the inherited table is absent', () => {
    expect(readEngineACostContribution(db)).toEqual({ count: 0, costCents: 0 })
  })
})

describe('readUnifiedCostSummary', () => {
  it('merges both engine cost stores into one summary', () => {
    seedOpzavaCost(db, 'c1', 500, 420)
    seedOpzavaCost(db, 'c2', 300, null)
    createEngineATokenUsage(db)
    db.prepare('INSERT INTO token_usage (model, cost_usd) VALUES (?, ?)').run('m', 1.5)
    db.prepare('INSERT INTO token_usage (model, cost_usd) VALUES (?, ?)').run('m', 2.5)

    const unified = readUnifiedCostSummary(db)
    expect(unified.opzava).toEqual({ count: 2, estimatedCostCents: 800, actualCostCents: 420 })
    expect(unified.inherited).toEqual({ count: 2, costCents: 400 })
    expect(unified.totalCount).toBe(4) // 2 opzava + 2 inherited
    expect(unified.totalCostCents).toBe(820) // 420 opzava actual + 400 inherited
  })
})
