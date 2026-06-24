# ARD 0011 — Single-Orchestrator Execution Model

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0006](0006-postgres-compatibility.md) (Postgres path), [ARD 0007](0007-engine-separation-and-surface-unification.md) (engine separation), [ARD 0010](0010-opzava-layering-realignment.md) (layering), [ARD 0012](0012-device-authorization.md) (fused auth cascade), [MASTER-PLAN](../architecture/orchestration-hardening/MASTER-PLAN.md)

## Context

An adversarial, code-verified review found that Opzava does **not** have one orchestrator. It has **three unlinked execution subsystems in one SQLite file**:

- **Engine A** (inherited `src/lib`) — the `tasks` table + the `task-dispatch.ts` scheduler tick (`scheduler.ts:57-67` `runTaskDispatchChain`; handlers at `:163`/`:172`/`:190`), dispatched via the OpenClaw gateway or direct Claude/OpenAI API. This is the live operator-console engine.
- **Engine B** (`src/opzava/platform/runner`) — a genuinely-excellent durable job/attempt/dead-letter state machine, but **campaign-send only**. `createJobKindExecutor` (`job-kind-executor.ts:9`) registers exactly one kind (`CAMPAIGN_SEND_JOB_KIND`); the maintenance daemon states outright "the two engines are not merged" (`maintenance-daemon.ts:9-12`).
- **Engine C** — the 11-step content workflow (`POST /api/ops/runs` → `runAndRecordContentWorkflow`) runs **synchronously inline through MOCK providers** (`createMockContentWorkflowProviderAdapters`); real adapter classes exist but no production route constructs them. It is reachable only from the ops dashboard.

They share **no tables, no foreign keys, no runtime imports, and no lifecycle reconciliation.** `opzava_campaigns` has no `task_id` FK; `grep runner src/lib/task-dispatch.ts` and `grep tasks src/opzava/` are both empty. The cost/audit read surfaces (`unified-cost-reader`, `unified-audit`) compose the two engines read-only — that seam is clean — but nothing reconciles their lifecycles.

Two consequences make this load-bearing:

1. **The horizontal-scale contradiction.** `CLAUDE.md` mandates "ENFORCE horizontal scalability"; `deployment.md:625` states "SQLite uses WAL mode but does not support multiple writers." The scheduler runs `dispatchAssignedTasks` on a bare `setInterval` (`scheduler.ts:498`) with **no leader election**. At 2 replicas both schedulers claim the same tasks, and the `dispatch_attempts` read-modify-write (`task-dispatch.ts:1077`/`:1198`/`:1542`) becomes a **guaranteed** double-dispatch every tick. A third claim site (`tasks/queue/route.ts:117-129`, the polling queue) is similarly lease-less.

2. **The stuck-task / cost-attribution gaps.** `requeueStaleTasks` reclaims only `in_progress` (`task-dispatch.ts:1171`, `WHERE t.status='in_progress'`); `runAegisReviews` selects only `review` (`:989`) — `quality_review` is invisible to every worker. `recordUsage` (`task-dispatch.ts:614`) writes `cost = 0` hardcoded (the 6th INSERT arg at `:625`) as a separate autocommit that swallows errors (`:637`); `unified-cost-reader` sums a never-populated `cost_usd`.

**Code-wins correction to the original review framing:** the review said "remove `workspaceId ?? 1` in `runAegisReviews` (`task-dispatch.ts:399`)." Verified: `:399` is in `reconcileDeferredTaskCompletions`; `runAegisReviews` (`:980`) takes **no** `workspaceId` parameter and its SELECT (`:989`) has **no** `WHERE t.workspace_id` filter — it scans **all** workspaces. Both `runAegisReviews` and `requeueStaleTasks` lack a workspace filter.

## Decision

1. **Make `src/opzava/platform/runner` the canonical execution path for all three engines.** Generalize `createJobKindExecutor` to register `task-dispatch` and `content-step` job kinds alongside `CAMPAIGN_SEND_JOB_KIND`; `task-dispatch.ts` enqueues jobs instead of executing inline; add the missing `task_id` FK (runner migration `opzava_runner_004_task_id`) and a read-only `listStuckTasks()` detector in the unified-surface layer. This converts **one real adapter into three** and turns a hypothetical seam into a real one — without merging tables or violating the ARD 0007 separation invariant. (MASTER-PLAN Track C, gated behind the Track A/B safety fixes.)

2. **Single-active-writer now, via a leader-election/advisory-lock seam.** `acquireLeadership()` (new `src/lib/leader-lock.ts`, backed by a `leader_locks` table) gates the dispatch chain so exactly one replica's scheduler tick runs `runTaskDispatchChain`/`runAegisReviews`/`requeueStaleTasks`; non-leader replicas serve reads and run heartbeat/cleanup only. The **correct invariant is lock TTL < lease TTL** (lock 90s, lease 10min) so a crashed leader's lock expires *before* any in-flight task's lease — guaranteeing no double-dispatch on failover. (Track G.)

3. **The lease is the sole reclamation authority.** Add `claimed_at` (migration `055`), stamp it at **all three** claim sites (`task-dispatch.ts:1288`, `:1005`, and the polling-queue claim `tasks/queue/route.ts:118`), and extend `requeueStaleTasks` + a startup sweep to reclaim both `in_progress` and `quality_review` past lease — decoupling reclamation from the flaky `agents.status` heartbeat. (Track A5.) The completion-write guard is `WHERE id=? AND status='in_progress' AND claimed_at=?`.

4. **Require explicit `workspaceId` everywhere; reframe the docs honestly.** Thread `workspaceId` through `runAegisReviews` and `requeueStaleTasks` (both filter `WHERE t.workspace_id = ?`, throw when unset) and remove the `?? 1` default in `reconcileDeferredTaskCompletions` (`:399`). Reframe `CLAUDE.md` "ENFORCE horizontal scalability" → "single-active-writer over SQLite (leader-elected scheduler); Postgres (ARD 0006) is the path to true horizontal scale." (Track G2.)

## Rationale

- The runner is already a **deep module** (rich transactional job/attempt/dead-letter state machine behind a small interface) — the natural home for a single execution abstraction. Promoting it to canonical is lower-risk than inventing a new one.
- A leader-lock over SQLite is the **honest** enforcement of the horizontal-scale mandate today: it makes multi-replica deploys safe (read replicas + one writer) without a Postgres migration, and it preserves the Postgres path (ARD 0006) as a clean future swap of the claim/lease primitives.
- The lease + workspace-filter fixes are **one column + one WHERE clause** each; they close the stuck-task dead-zone and the cross-tenant leak at minimal cost and are independently shippable.

## Consequences

- **Positive:** one execution seam (three real adapters); bounded double-dispatch (zero when the lock<lease invariant holds); self-healing stuck tasks; cross-tenant isolation; honest docs; a tested restore path.
- **Negative:** failover downtime is bounded by lock TTL (90s) after a leader crash; the lock table is a new high-frequency write point (counted in the `wal_checkpoint` cadence); `runAegisReviews`/`requeueStaleTasks` now throw if a caller forgets `workspaceId` (fail-loud, by design).
- **Neutral:** read replicas serve reads while the elected writer dispatches; the engine tables stay separate (unified at the read layer per ARD 0007).

## Alternatives considered

- **Migrate to Postgres now (ARD 0006).** Rejected for now: `SELECT … FOR UPDATE SKIP LOCKED` claim semantics are the clean long-term answer, but the migration is a large lift and the single-active-writer lock delivers the safety guarantee today. Postgres remains the tracked future state.
- **Merge the engine tables.** Rejected: violates ARD 0007 (separation by design, unified at the read surface); the runner-as-canonical-path achieves orchestration without a merge.
- **Status quo.** Rejected: the horizontal-scale contradiction is a guaranteed double-dispatch at 2 replicas, not a low-probability race.
- **External coordinator (Redis/etcd) for leader election.** Rejected for now: a SQLite advisory lock is dependency-free and sufficient; revisit only if read-replica fan-out exceeds SQLite's limits.

## Durability decision (placeholder — filled when MASTER-PLAN A0 lands)

A0 records the `synchronous` level choice here: **default** keep `synchronous=NORMAL` (`db.ts:56`) + a mandatory default-on `wal_checkpoint` task; **recommended** upgrade to FULL for a control plane that records costs (benchmark-gated). The transactional write spine (A2) + the checkpoint close the residual crash-window either way. *This section is filled by the engineer executing A0.*

## References

- `scheduler.ts:57-67` (runTaskDispatchChain), `:163`/`:172`/`:190` (handlers), `:498` (setInterval)
- `task-dispatch.ts:980` (runAegisReviews, no workspaceId), `:989` (unscoped SELECT), `:1005` (Aegis claim), `:1160-1175` (requeueStaleTasks), `:1171` (in_progress-only WHERE), `:1077`/`:1198`/`:1542` (dispatch_attempts TOCTOU), `:1288` (dispatch claim), `:399` (workspaceId ?? 1), `:614`/`:625`/`:637` (recordUsage cost=0)
- `tasks/queue/route.ts:117-129` (third polling-queue claim site)
- `job-kind-executor.ts:9`, `runner/maintenance-daemon.ts:9-12`
- `CLAUDE.md` (Critical Constraints), `docs/deployment.md:625`
- ARD 0006, ARD 0007, ARD 0010; MASTER-PLAN Tracks A, C, G, H
