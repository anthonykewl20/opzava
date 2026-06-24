import type Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'

/**
 * Leader-election / advisory lock for single-active-writer scheduling (G1 foundation).
 *
 * WHY: the scheduler runs dispatchAssignedTasks / runAegisReviews / requeueStaleTasks on
 * a bare setInterval with no coordination, so at 2 replicas BOTH claim the same tasks
 * (guaranteed double-dispatch). This module is the SQLite advisory-lock primitive that
 * lets at most one replica run the dispatch chain.
 *
 * INVARIANT — lock TTL < lease TTL: the leadership lock (LEADER_LOCK_TTL_MS, 90s) MUST
 * expire before any in-flight task's lease (the claimed_at lease, default 10min from A5).
 * That way, when a leader crashes, its lock expires (≤90s) while every task it had in
 * flight still holds its (≤10min) lease — so the failover replica is guaranteed the prior
 * lease has not yet elapsed and cannot double-dispatch. Do not invert this.
 *
 * SCOPE: this file is the lock primitive + schema ONLY. The scheduler gating that calls
 * acquireLeadership() is wired separately — deferred because (a) it changes single-replica
 * dispatch semantics and (b) the multi-replica correctness needs 2-replica validation the
 * user should witness. See PROGRESS.md / MASTER-PLAN G1.
 */

export const LEADER_LOCK_TTL_MS = 90 * 1000 // < task lease TTL (10min); see invariant above
const SINGLE_ROW_ID = 1

let _nodeId: string | null = null

/** A stable per-process node id (generated once on first use). */
export function getNodeId(): string {
  if (_nodeId === null) _nodeId = randomBytes(8).toString('hex')
  return _nodeId
}

/** Idempotently create the single-row leader_locks table. */
export function ensureLeaderLockSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leader_locks (
      id INTEGER PRIMARY KEY CHECK (id = ${SINGLE_ROW_ID}),
      holder TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `)
}

/**
 * Atomically acquire or renew the single-writer leadership lock. Returns true when
 * this node is the leader after the call.
 *
 * One conditional upsert + a read-back makes the decision atomic across replicas with
 * no external coordinator:
 *   - INSERT when the row is absent (cold start).
 *   - On conflict, take over ONLY when the row is already ours (renew) or has expired
 *     (failover). If another live leader holds it, the WHERE is false, the row is
 *     untouched, and the read-back returns the other holder -> false.
 */
export function acquireLeadership(
  db: Database.Database,
  nodeId: string,
  now: number,
  ttlMs: number = LEADER_LOCK_TTL_MS,
): boolean {
  const expiresAt = now + ttlMs
  db.prepare(`
    INSERT INTO leader_locks (id, holder, acquired_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      holder = excluded.holder,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
    WHERE leader_locks.holder = ? OR leader_locks.expires_at <= ?
  `).run(SINGLE_ROW_ID, nodeId, now, expiresAt, nodeId, now)
  const row = db
    .prepare('SELECT holder FROM leader_locks WHERE id = ?')
    .get(SINGLE_ROW_ID) as { holder: string } | undefined
  return row?.holder === nodeId
}

/** Release leadership on graceful shutdown. No-op if this node is not the holder. */
export function releaseLeadership(db: Database.Database, nodeId: string): void {
  db.prepare('DELETE FROM leader_locks WHERE id = ? AND holder = ?').run(SINGLE_ROW_ID, nodeId)
}
