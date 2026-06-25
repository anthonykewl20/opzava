import type Database from 'better-sqlite3'

import type {
  ClaimedTask,
  ClaimNextOptions,
  ClaimResult,
  ReclaimedTransition,
  ReclaimOptions,
  TaskKanban,
  TransitionResult,
} from './contracts'

const PRIORITY_RANK = `CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`

function toClaimedTask(row: Record<string, unknown>): ClaimedTask {
  return {
    id: row.id as number,
    status: row.status as string,
    claimedAt: row.claimed_at as number,
    accountProfile: (row.account_profile as string | null) ?? null,
    assignedTo: (row.assigned_to as string | null) ?? null,
    workspaceId: row.workspace_id as number,
    priority: row.priority as string,
    title: row.title as string,
    row,
  }
}

/**
 * Construct the TaskKanban spine over a better-sqlite3 handle. `now` (unix seconds) is injectable
 * for deterministic tests. See contracts.ts for the invariants. better-sqlite3 is synchronous, so
 * every method is sync — and SQLite's single-writer serialization is what makes the cap atomic.
 */
export function makeTaskKanban(
  db: Database.Database,
  now: () => number = () => Math.floor(Date.now() / 1000),
): TaskKanban {
  const IN_FLIGHT = "('in_progress', 'quality_review')"

  function inFlightCount(accountProfile: string, workspaceId: number): number {
    return (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM tasks WHERE account_profile = ? AND workspace_id = ? AND status IN ${IN_FLIGHT}`,
        )
        .get(accountProfile, workspaceId) as { c: number }
    ).c
  }

  function claimOne(o: ClaimNextOptions): ClaimResult {
    const ts = now()
    const cap = o.capacity
    const fromPlaceholders = o.from.map(() => '?').join(', ')
    const order = o.orderBy === 'created_at' ? 'created_at ASC' : `${PRIORITY_RANK} ASC, created_at ASC`
    const assignedFilter = o.filter?.assignedTo !== undefined ? 'AND assigned_to = ?' : ''
    const setAccount = cap ? ', account_profile = ?' : ''
    const setAssign = o.assignTo !== undefined ? ', assigned_to = ?' : ''
    // The cap is a correlated sub-count folded INTO the guarded UPDATE: it and the row pick are one
    // atomic statement under SQLite's single-writer lock, so there is no count-then-claim TOCTOU.
    const capGuard = cap
      ? `AND (SELECT COUNT(*) FROM tasks t2 WHERE t2.account_profile = ? AND t2.workspace_id = ? AND t2.status IN ${IN_FLIGHT}) < ?`
      : ''

    const sql = `
      UPDATE tasks SET status = ?, updated_at = ?, claimed_at = ?${setAccount}${setAssign}
      WHERE id = (
        SELECT id FROM tasks
        WHERE workspace_id = ? AND status IN (${fromPlaceholders}) ${assignedFilter}
        ORDER BY ${order}
        LIMIT 1
      ) ${capGuard}
      RETURNING *
    `
    const params: Array<string | number> = [o.to, ts, ts]
    if (cap) params.push(cap.accountProfile)
    if (o.assignTo !== undefined) params.push(o.assignTo)
    params.push(o.workspaceId, ...o.from)
    if (o.filter?.assignedTo !== undefined) params.push(o.filter.assignedTo)
    if (cap) params.push(cap.accountProfile, cap.workspaceId, cap.cap)

    const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined
    if (row) return { kind: 'claimed', task: toClaimedTask(row) }

    // changes === 0 → either no candidate (empty) or the account is full (at_cap). One read to
    // disambiguate, paid only on a capped miss; never another claim attempt (so no TOCTOU).
    if (cap && inFlightCount(cap.accountProfile, cap.workspaceId) >= cap.cap) {
      return { kind: 'failed', reason: 'at_cap' }
    }
    return { kind: 'empty' }
  }

  return {
    claimNext(options: ClaimNextOptions): ClaimResult[] {
      const limit = options.limit ?? 1
      const results: ClaimResult[] = []
      for (let i = 0; i < limit; i++) {
        const result = claimOne(options)
        results.push(result)
        if (result.kind !== 'claimed') break
      }
      return results
    },
    transition(taskId, from, to, patch): TransitionResult {
      const sets = ['status = ?', 'updated_at = ?']
      const vals: Array<string | number | null> = [to, now()]
      if (patch) {
        for (const [col, value] of Object.entries(patch)) {
          sets.push(`${col} = ?`)
          vals.push(value)
        }
      }
      const info = db
        .prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND status = ?`)
        .run(...vals, taskId, from)
      return { result: info.changes > 0 ? 'won' : 'lost' }
    },

    touchLease(taskId): void {
      db.prepare('UPDATE tasks SET claimed_at = ? WHERE id = ?').run(now(), taskId)
    },

    reclaimExpiredLeases(options: ReclaimOptions): ReclaimedTransition[] {
      const placeholders = options.statuses.map(() => '?').join(', ')
      const stale = db
        .prepare(
          `SELECT id, status FROM tasks
           WHERE workspace_id = ? AND status IN (${placeholders}) AND claimed_at IS NOT NULL AND claimed_at < ?`,
        )
        .all(options.workspaceId, ...options.statuses, options.staleAfter) as Array<{ id: number; status: string }>

      const ts = now()
      const reclaimed: ReclaimedTransition[] = []
      for (const r of stale) {
        // Guarded per-row: re-check status so a concurrent legitimate transition is never clobbered.
        const info = db
          .prepare('UPDATE tasks SET status = ?, claimed_at = NULL, updated_at = ? WHERE id = ? AND status = ?')
          .run(options.to, ts, r.id, r.status)
        if (info.changes > 0) reclaimed.push({ taskId: r.id, from: r.status, to: options.to })
      }
      return reclaimed
    },
  }
}
