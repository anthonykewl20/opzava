import Database from 'better-sqlite3'

/**
 * F2b (audit half) — the unified AUDIT surface (ARD 0007: separate engines, unified surfaces).
 *
 * Symmetric to the unified cost surface: opzava records audit events as runner operational events of
 * kind 'audit'; Engine A (inherited) records them in its own `audit_log` table. This module owns the
 * pure count projection and the sanctioned read that touches both stores and merges them — neither
 * engine importing the other, the boundary gate (team ↔ src/lib, the `agents` table) untouched.
 */

export type UnifiedAuditSummary = Readonly<{
  opzavaCount: number
  inheritedCount: number
  totalCount: number
}>

/** Pure: merge the two engines' audit counts into one summary. */
export function projectUnifiedAuditSummary(opzavaCount: number, inheritedCount: number): UnifiedAuditSummary {
  return Object.freeze({
    opzavaCount,
    inheritedCount,
    totalCount: opzavaCount + inheritedCount,
  })
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { ok: number } | undefined
  return row !== undefined
}

/** Count opzava audit events (runner operational events of kind 'audit'); zero when the table is absent. */
export function readOpzavaAuditCount(db: Database.Database): number {
  if (!tableExists(db, 'opzava_runner_operational_events')) {
    return 0
  }
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM opzava_runner_operational_events WHERE kind = 'audit'")
    .get() as { count: number }
  return row.count
}

/** Count Engine A audit events (`audit_log`); zero when the inherited table is absent. */
export function readInheritedAuditCount(db: Database.Database): number {
  if (!tableExists(db, 'audit_log')) {
    return 0
  }
  const row = db.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as { count: number }
  return row.count
}

/** Read both engines' audit counts and project the unified summary. */
export function readUnifiedAuditSummary(db: Database.Database): UnifiedAuditSummary {
  return projectUnifiedAuditSummary(readOpzavaAuditCount(db), readInheritedAuditCount(db))
}
