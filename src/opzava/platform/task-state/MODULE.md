# platform/task-state — the TaskKanban spine

**Purpose.** The concrete lifecycle owner of the inherited `tasks` table. It collapses the claim / lease / transition / reclaim writes — today scattered across `task-dispatch.ts` (dispatch + auto-route) and `tasks/queue/route.ts` — into ONE guarded mechanism, and folds the per-`AgentAccountProfile` concurrency cap (`AccountCapacity`, ARD 0026 H5) **into** the atomic claim. Authority: [ARD 0025](../../../../docs/ard/0025-task-dispatch-decomposition.md) Slice 1a, [ARD 0026](../../../../docs/ard/0026-agent-fleet-and-main-orchestrator.md) H5.

**Public surface** (`contracts.ts` + `makeTaskKanban(db, now?)`):
- `claimNext({from, to, workspaceId, assignTo?, filter?, capacity?, limit?, orderBy?}) → ClaimResult[]` — atomically claim up to `limit` rows `from`→`to`, stamping the lease (`claimed_at`), optionally the account (`account_profile`) and assignee. `ClaimResult = claimed | empty | failed{at_cap}`.
- `transition(taskId, from, to, patch?) → {won|lost}` — guarded `WHERE id=? AND status=?`; exactly one writer wins.
- `touchLease(taskId)` — lease heartbeat.
- `reclaimExpiredLeases({workspaceId, statuses, staleAfter, to}) → ReclaimedTransition[]` — reclaim crashed-worker leases (in_progress + quality_review).

**Invariants (do not regress):**
1. **Capacity is atomic.** The cap is a correlated sub-count folded into the guarded UPDATE — *not* a separate SELECT. Under SQLite's single-writer lock (+ the G1 leader) this is TOCTOU-free; the just-claimed row counts toward the next claim's cap (no overshoot). `quality_review` counts as in-flight (it still holds an account slot).
2. **`plan()` is the routing authority — the spine NEVER calls `plan()` or reads `AdminConfig`.** Capacity (account + *effective* cap, after headroom/quota applied upstream) arrives as injected data on `claimNext`. Failover ordering lives in the caller, not here.
3. **Every status write goes through the spine.** No caller may `UPDATE tasks SET status` directly.
4. **The lease is armed on every claim** (`claimed_at` stamped) so `reclaimExpiredLeases` can always recover a crashed worker.

**CardDecomposition** (`decomposition.ts`, ARD 0026 H4) — the persistence half of the decompose pipeline (the gate confirms, this executes):
- `persist(taskId, workspaceId, graph) → {graphId, created}` — store the Card's active `WorkflowGraph` in `opzava_card_workflow_graph`. Idempotent via the `(task_id) WHERE status='active'` partial-unique index (SELECT-first + unique-race catch).
- `isDecomposed(workspaceId, taskId) → boolean` — the function the gate injects as `isDecompositionDuplicate`.
- `getActiveGraph(taskId) → WorkflowGraph | null` — validated on read.
- `rollupCardStatus(stepStatuses) → CardRollupStatus` (pure, H-r1): `failed > quality_review > in_progress > done`; empty ⇒ `pending`. The Card stays ONE `tasks` row; Steps run as `StepRun`s, never new Cards (ARD 0013 D1).

**Editor guardrails:** no port over the `db` handle (ARD 0025: one storage is not a real seam — a port would be a passthrough). The interface IS the test surface — test against a real `:memory:` db (`runMigrations`), never mock the SQL. `account_profile` is denormalized onto `tasks` (migration 059) so the cap sub-count is an index scan, never an agent→account join.

**Status:** built + tested (`kanban.test.ts` 10 + `decomposition.test.ts` 9). The spine is **not yet wired** into the three live claim sites — that behavior-preserving rewire (golden-parity) is a later slice, properly after the executor extraction. The gate↔`isDecomposed` wiring lands with the decompose-action handler (M1).
