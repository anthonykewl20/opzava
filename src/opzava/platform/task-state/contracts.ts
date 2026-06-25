/**
 * TaskKanban spine contracts (ARD 0025 Slice 1a + ARD 0026 H5). The concrete lifecycle owner of
 * the inherited `tasks` table: it unifies the claim/lease/transition/reclaim writes that today are
 * scattered across three sites (`task-dispatch.ts` dispatch + auto-route, `tasks/queue/route.ts`)
 * into ONE guarded mechanism, and folds the per-`AgentAccountProfile` concurrency cap INTO the
 * atomic claim (no TOCTOU; replica-safe under the G1 leader lock).
 *
 * Not pure `core/` — it owns the `tasks` storage (platform). No port (ARD 0025: one storage is not
 * a real seam); the spine takes the `db` handle directly. The interface IS the test surface,
 * exercised against a real `:memory:` db (replace-don't-layer).
 *
 * Invariant: `plan()` is the routing authority — the spine NEVER calls `plan()` or reads AdminConfig.
 * Capacity (account + effective cap) arrives as injected data on `claimNext`.
 */

/** The per-`AgentAccountProfile` concurrency cap, resolved upstream (plan + AdminConfig) and injected. */
export interface AccountCapacity {
  readonly accountProfile: string
  readonly workspaceId: number
  /** Effective cap (headroom/quota already applied upstream). The spine just enforces `< cap`. */
  readonly cap: number
}

/** A task row after a successful atomic claim — the identity token to carry through dispatch. */
export interface ClaimedTask {
  readonly id: number
  readonly status: string
  readonly claimedAt: number
  readonly accountProfile: string | null
  readonly assignedTo: string | null
  readonly workspaceId: number
  readonly priority: string
  readonly title: string
  /** The full row for the executor; the spine is schema-agnostic beyond its own columns. */
  readonly row: Record<string, unknown>
}

/** Typed claim outcome — never thrown for expected races/caps. */
export type ClaimResult =
  | { readonly kind: 'claimed'; readonly task: ClaimedTask }
  | { readonly kind: 'empty' } // no row matched the predicate
  | { readonly kind: 'failed'; readonly reason: 'at_cap' } // a candidate existed but the account is full

export interface ClaimNextOptions {
  /** Source statuses to claim FROM (e.g. ['assigned'] or ['inbox']). */
  readonly from: readonly string[]
  /** Target status to claim INTO (e.g. 'in_progress' or 'assigned'). */
  readonly to: string
  readonly workspaceId: number
  /** SET assigned_to on claim (auto-route assigns an agent as it claims). */
  readonly assignTo?: string
  /** WHERE assigned_to = ? (claim only a specific agent's rows). */
  readonly filter?: { readonly assignedTo?: string }
  /** Per-account cap, folded atomically into the guarded UPDATE. Absent ⇒ uncapped claim. */
  readonly capacity?: AccountCapacity
  /** Max rows to claim this call (default 1). */
  readonly limit?: number
  readonly orderBy?: 'priority' | 'created_at'
}

export interface TransitionResult {
  readonly result: 'won' | 'lost'
}

export interface ReclaimedTransition {
  readonly taskId: number
  readonly from: string
  readonly to: string
}

export interface ReclaimOptions {
  readonly workspaceId: number
  readonly statuses: readonly string[]
  /** Rows whose `claimed_at` is strictly older than this (unix seconds) are stale. */
  readonly staleAfter: number
  /** Status to reclaim INTO (e.g. 'assigned' for in_progress, 'review' for quality_review). */
  readonly to: string
}

export interface TaskKanban {
  /** Atomically claim up to `limit` rows from→to, stamping the lease (+ account/assignee), cap-guarded. */
  claimNext(options: ClaimNextOptions): ClaimResult[]
  /** Guarded status transition: UPDATE … WHERE id=? AND status=? — exactly one writer wins. */
  transition(taskId: number, from: string, to: string, patch?: Record<string, string | number | null>): TransitionResult
  /** Lease heartbeat — refresh `claimed_at` for an in-flight task. */
  touchLease(taskId: number): void
  /** Reclaim rows whose lease expired (crashed worker) back to `to`, clearing the lease. */
  reclaimExpiredLeases(options: ReclaimOptions): ReclaimedTransition[]
}
