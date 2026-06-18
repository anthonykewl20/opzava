import Database from 'better-sqlite3'
import { parseOperationalEventStorageRecord, type OperationalEventStorageRecord } from './repository-contracts'
import { applyOpzavaRunnerRepositorySchema } from './migrations'

export type RecentCostQuery = Readonly<{ limit?: number }>

type CostEventFields = Readonly<{ estimatedCostCents: number; actualCostCents: number | null }>

export function listRecentCostEvents(
  db: Database.Database,
  query: RecentCostQuery = {}
): OperationalEventStorageRecord[] {
  applyOpzavaRunnerRepositorySchema(db)
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200)
  const rows = db
    .prepare(
      "SELECT record_json FROM opzava_runner_operational_events WHERE kind = 'cost' ORDER BY occurred_at DESC, record_id DESC LIMIT ?"
    )
    .all(limit) as Array<{ record_json: string }>
  return rows.map((r) => parseOperationalEventStorageRecord(JSON.parse(r.record_json)))
}

export type CostSummary = Readonly<{
  count: number
  estimatedCostCents: number
  actualCostCents: number
}>

export function summarizeCostEvents(
  records: readonly OperationalEventStorageRecord[]
): CostSummary {
  let estimatedCostCents = 0
  let actualCostCents = 0
  for (const r of records) {
    const e = r.event as CostEventFields
    estimatedCostCents += e.estimatedCostCents
    if (typeof e.actualCostCents === 'number') {
      actualCostCents += e.actualCostCents
    }
  }
  return Object.freeze({ count: records.length, estimatedCostCents, actualCostCents })
}
