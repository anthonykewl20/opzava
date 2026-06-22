import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { applyOpzavaRunnerRepositorySchema } from '../runner/migrations'
import { createProviderUsageReader } from './provider-usage-reader'

const NOW = new Date('2026-07-05T12:00:00.000Z')
const clock = { now: () => NOW }

function isoBefore(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
})

function insert(kind: string, occurredAt: string, recordJson: object): void {
  db.prepare(
    'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)',
  ).run(`r-${Math.random()}`, kind, 'wf', 's', occurredAt, JSON.stringify(recordJson))
}

describe('createProviderUsageReader', () => {
  it('reads zero usage when the operational-event store is absent', () => {
    expect(createProviderUsageReader(db, clock)()).toEqual({
      requestsInLastMinute: 0,
      usdSpentThisHour: 0,
      usdSpentThisDay: 0,
    })
  })

  it('counts external calls in the trailing minute and sums cost (cents->USD) per window', () => {
    applyOpzavaRunnerRepositorySchema(db)
    // external calls: one 30s ago (in window), one 2min ago (out)
    insert('external-call', isoBefore(30_000), { event: {} })
    insert('external-call', isoBefore(2 * 60_000), { event: {} })
    // cost: $50 thirty minutes ago (this hour + day), $30 two hours ago (this day, not hour)
    insert('cost', isoBefore(30 * 60_000), { event: { estimatedCostCents: 5_000 } })
    insert('cost', isoBefore(2 * 60 * 60_000), { event: { estimatedCostCents: 3_000 } })

    expect(createProviderUsageReader(db, clock)()).toEqual({
      requestsInLastMinute: 1,
      usdSpentThisHour: 50,
      usdSpentThisDay: 80,
    })
  })
})
