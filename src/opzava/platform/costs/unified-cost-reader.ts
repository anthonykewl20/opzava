import Database from 'better-sqlite3'

import { listRecentCostEvents, summarizeCostEvents } from '../runner/cost-queries'
import {
  engineACostFromUsd,
  projectUnifiedCostSummary,
  type EngineACostContribution,
  type UnifiedCostSummary,
} from './unified-cost-summary'

/**
 * F2b composition — the unified-surface READ (ARD 0007: separate engines, unified surfaces).
 *
 * This is the sanctioned read that touches BOTH engines' cost stores and merges them through the pure
 * `projectUnifiedCostSummary`. Engine A's spend lives in its own `token_usage` table (USD); opzava's
 * lives in its runner cost events (cents). Neither engine imports the other — this composition layer
 * reads each store and hands the totals to the projection. The boundary gate (team ↔ src/lib, the
 * `agents` table) is untouched.
 */

type EngineACostRow = Readonly<{ count: number; usd: number }>

function engineACostTableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'")
    .get() as { ok: number } | undefined
  return row !== undefined
}

/**
 * Read Engine A's total priced spend from `token_usage` and normalise it to the opzava cents unit.
 * Returns a zero contribution when the inherited table is absent (e.g. an opzava-only test database),
 * so the unified surface degrades gracefully instead of throwing.
 */
export function readEngineACostContribution(db: Database.Database): EngineACostContribution {
  if (!engineACostTableExists(db)) {
    return engineACostFromUsd(0, 0)
  }
  const row = db
    .prepare('SELECT COUNT(cost_usd) AS count, COALESCE(SUM(cost_usd), 0) AS usd FROM token_usage')
    .get() as EngineACostRow
  return engineACostFromUsd(row.count, row.usd)
}

/**
 * Read both engines' cost and project the unified summary. opzava uses its established recent-window
 * cost surface (`listRecentCostEvents` → `summarizeCostEvents`); Engine A contributes its priced total.
 */
export function readUnifiedCostSummary(db: Database.Database): UnifiedCostSummary {
  const opzava = summarizeCostEvents(listRecentCostEvents(db))
  const inherited = readEngineACostContribution(db)
  return projectUnifiedCostSummary(opzava, inherited)
}
