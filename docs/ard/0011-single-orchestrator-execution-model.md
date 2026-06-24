# ARD 0011 — Single-Orchestrator Execution Model

- **Status:** Accepted
- **Date:** 2026-06-24
- **Relates to:** ARD 0006 (Postgres compatibility), ARD 0007 (engine separation & surface unification), ARD 0010 (Opzava layering realignment), `docs/architecture/orchestration-hardening/MASTER-PLAN.md` (Tracks C + G), `docs/architecture/system-map/91-remediation-plan.md` (prior remediation — prerequisite, not superseded)

## Context

The orchestration layer has **three concurrent dispatch state machines with no shared execution linkage**, runs on a substrate that **contradicts its own horizontal-scale mandate**, and **writes cost as zero on the only path that produces it** — three structural defects surfaced by the adversarial review and the dual-engine deep-read (digest `review.*`). Each is verified against the code below.

### 1. Three dispatch engines, no execution linkage (the seam-defect / god-module finding)

Opzava inherits an in-process scheduler (`src/lib/scheduler.ts`) that drives three **independent** dispatch state machines, all living in one 1753-line god-module (`src/lib/task-dispatch.ts`):

1. **`dispatchAssignedTasks`** (`task-dispatch.ts:1251`) — claims `assigned`→`in_progress` via a guarded UPDATE (`:1288`, `WHERE id=? AND status='assigned'`) and invokes the agent/gateway/direct-API. **No lease; no `claimed_at`.**
2. **`runAegisReviews`** (`:980`) — claims `review`→`quality_review` (`:1005`) and runs the Aegis model verdict.
3. **`requeueStaleTasks`** (`:1160`) — the sole reclamation worker, which selects **only** `in_progress` (`WHERE t.status = 'in_progress'`, `:1171`) and gates requeue on the flaky `agents.status` heartbeat (`:1191-1195`).

The scheduler tick runs the chain at `scheduler.ts:57-67` (`runTaskDispatchChain`), with `runAegisReviews` and `requeueStaleTasks` as separate scheduled tasks (`:172`, `:190`), each invoked once globally via `makeDefaultDeps()`. This produces two dead-zones and one coupling defect:

- **The `quality_review` dead-zone.** `requeueStaleTasks` reclaims `in_progress`; `runAegisReviews` re-selects `review`. A task claimed into `quality_review` that crashes/hangs mid-model-call is **invisible to every worker** — `requeueStaleTasks` skips it and `runAegisReviews` never re-selects it. `quality_review` is permanently stranded until manual intervention.
- **Reclamation coupled to a flaky signal.** `requeueStaleTasks` only requeues when `agent_status` is `offline`/unknown (`:1191-1195`); a busy-but-unresponsive agent holds its task forever.
- **The durable runner is wired to one subsystem only.** The Opzava durable runner (`src/opzava/platform/runner/`) is the **real** lease/retry/dead-letter execution model (`runner/MODULE.md`: `Job`→`Attempt`→`DeadLetter`, lease-governed, crash-recovery via `executeExpiredLeaseRecovery`, retry policy in `retry-policy.ts`). But `createJobKindExecutor` (`src/opzava/modules/content/workflow/job-kind-executor.ts:9`) dispatches over a `Record<string, RunnerExecutor>` keyed by `resolveKind(job)`, and **only `CAMPAIGN_SEND_JOB_KIND` is registered** (`runner/MODULE.md`: "not a general per-step runner"). Task dispatch and Aegis review bypass the runner entirely — they execute inline in the scheduler thread with **no lease, no retry policy, no dead-letter record, no crash recovery**. Three engines, three reclaim loops, zero shared execution linkage.

The runner's own maintenance daemon even documents the split: it "runs on an interval, **beside** the inherited scheduler (ARD 0007: the two timers coexist; **engines are not merged**)" (`src/opzava/platform/runner/maintenance-daemon.ts:9-12`).

### 2. The horizontal-scale contradiction

`CLAUDE.md` (Critical Constraints, line ~20) mandates **"ENFORCE … horizontal scalability"** as non-negotiable. `docs/deployment.md:625` states verbatim: **"SQLite … does not support multiple writers. Ensure only one instance is running against the same `.data/` directory."** The scheduler runs `dispatchAssignedTasks` on every replica's bare `setInterval` (`scheduler.ts:498`; `TICK_MS = 60 * 1000` at `:20`) with **no leader election and no advisory lock**.

At two replicas, the `dispatch_attempts` read-modify-write TOCTOU (`task-dispatch.ts:1077`, `:1198`, `:1542` — `SELECT`-then-`UPDATE`, no atomic conditional) ceases to be a low-probability race and becomes a **guaranteed double-dispatch every tick**: both schedulers read the same counter, both write `currentAttempts+1`, an increment is lost, and both claim the same task. A third claim site exists outside the scheduler entirely — the polling queue (`src/app/api/tasks/queue/route.ts:117-129`) — with the same lease-less flaw.

A multi-tenancy soft-spot compounds this: `reconcileDeferredTaskCompletions` defaults `const workspaceId = options.workspaceId ?? 1` (`task-dispatch.ts:399`), and `runAegisReviews` (`:980`) takes **no `workspaceId` parameter at all** — its SELECT (`:983-992`) has **no `WHERE t.workspace_id` filter** and scans **all workspaces**. A forgotten or defaulting caller runs reconcile/review against tenant 1 (or every tenant) regardless of which workspace's tasks are in play.

### 3. The cost-attribution gap (the product's reason-to-exist)

Opzava is an **AI operations control plane** whose headline value is cost attribution. Yet `recordUsage` (`task-dispatch.ts:614-638`) — the only writer on the dispatch path — **hardcodes `cost = 0`** (line `:633`), runs as a separate autocommit INSERT **outside any transaction**, and swallows all errors (`catch { /* non-fatal */ }`, `:637`). A crash/OOM between the dispatch UPDATE and this INSERT silently loses the cost row. Worse, the read API does `Number(record.cost ?? calculateTokenCost(...))` (`src/app/api/tokens/route.ts:119`) — but **`0` is not nullish**, so the stored `0` short-circuits the pricing fallback and **every `token_usage` row reports `$0.00`** in the cost API. The unified read model sums `cost_usd` (`src/opzava/platform/costs/unified-cost-reader.ts`), a column **no writer on the dispatch path ever populates**. The whole costs subsystem — the optimizer, the unified-cost reader, the dashboard — reads zeros. This gap is coupled to the dispatch seam: it is invisible until dispatch is unified behind a transactional write path that owns cost recording.

## Decision

Opzava adopts a **single-active-writer execution model with one canonical orchestration path.**

1. **Single active writer via a leader-lock seam — now.** A leader-election / advisory-lock seam gates the scheduler so that **exactly one replica's tick** runs the dispatch chain (`dispatchAssignedTasks` + `runAegisReviews` + `requeueStaleTasks` + `reconcileDeferredTaskCompletions`); all other replicas run read-only. This honors SQLite's single-writer reality (`deployment.md:625`) without a Postgres migration. **Postgres remains a tracked future state, not P0** (ARD 0006).

2. **`src/opzava/platform/runner` becomes the canonical execution path for all three engines.** Generalize `createJobKindExecutor`'s kind registry (`job-kind-executor.ts:9`) to register `task-dispatch` and `content-step` (Aegis review) job kinds alongside `CAMPAIGN_SEND_JOB_KIND`. `task-dispatch.ts` **enqueues** jobs instead of executing inline; the runner owns claim, lease, retry policy (`retry-policy.ts`), and dead-letter (`dead-letter-queries.ts`). A `task_id` foreign key is added on the runner job table (migration `opzava_runner_004`) so the runner can resolve back to the task it executes.

3. **The lease is the sole reclamation authority.** Add `claimed_at` (and a derived `lease_expires_at`) to `tasks`. `requeueStaleTasks` reclaims **any** `in_progress` **and** `quality_review` whose lease has expired (default 10 min), **decoupled from the flaky `agents.status` heartbeat**. A startup sweep reclaims `quality_review` rows orphaned by a pre-lease crash. The claim is stamped at **all three** claim sites (`dispatchAssignedTasks` `:1288`, `runAegisReviews` `:1005`, and the polling queue `src/app/api/tasks/queue/route.ts:117-129`).

4. **Honest scaling posture + cross-tenant closure.** Require an **explicit `workspaceId`** everywhere: remove the `workspaceId ?? 1` default (`:399`) and thread `workspaceId` through `runAegisReviews` and `requeueStaleTasks` (both currently unscoped cross-tenant SELECTs). Reframe the `CLAUDE.md` / `deployment.md` horizontal-scale claims to "single-active-writer over SQLite; Postgres (ARD 0006) is the path to true multi-writer scale."

### Sequencing

This is sequenced as a **multi-phase track** (MASTER-PLAN **Track C**: `C1` extract Aegis as a deep module → `C2` split `task-dispatch.ts` so dispatch enqueues and the runner executes → `C3` runner canonical path + `task_id` FK + read-only stuck-task detector), **explicitly gated behind** the Track A (write-spine safety / lease) and Track B (principal-binding authz) fixes. The runner cannot absorb dispatch until dispatch is transactional and principal-bound. The leader-lock seam is MASTER-PLAN **Track G** (`G1`), P0, gated behind Track A.

## Rationale

- **One execution seam, not three.** Today the scheduler, the runner, and the per-route handlers all mutate task state through different write paths with different (or absent) reclaim loops. Concentrating execution behind the runner's lease/retry/dead-letter primitives converts three ad-hoc reclaim loops into one bounded, self-healing lease — and extends the runner's existing `repository-lease` / `repository-recovery` test coverage to dispatch.
- **The lease kills two leaks at once.** The `in_progress` leak (claimed-but-abandoned, heartbeat-coupled) and the `quality_review` dead-zone (invisible to every worker) are the same defect — **no lease primitive**. One column resolves both and decouples reclamation from the flaky `agents.status` signal.
- **Single-active-writer is the correct, honest answer for SQLite today.** A leader-lock seam is medium effort and makes the existing scheduler safe at N replicas immediately; a Postgres migration (large) is deferred to ARD 0006 and tracked as a future state, not forced. The lock-TTL < lease-TTL invariant (`G1`: lock 90s, lease 10 min) bounds double-dispatch to zero when honored and failover downtime to lock TTL.
- **Unifying execution surfaces the cost gap.** Routing cost recording behind the runner's transactional write path is the precondition to fixing `cost = 0` — the runner already emits cost events via its operational-event store (`platform/costs/contracts.ts`), so the canonical path makes priced cost the default rather than the exception.
- **Code wins over the mandate.** The CLAUDE.md horizontal-scale mandate is aspirational against the SQLite single-writer substrate (`deployment.md:625`). Reframing it honestly removes a structural contradiction without reneging on the long-term Postgres path (ARD 0006).

## Consequences

**Positive**

- Bounded, self-healing reclaim for every in-flight task; one retry/dead-letter policy for all three engines.
- The `quality_review` dead-zone and the `in_progress` heartbeat-coupled leak are both closed by the single lease primitive.
- The runner's existing lease/recovery test coverage (`repository-lease`, `repository-recovery`) extends to dispatch and Aegis review.
- Horizontal scale becomes **safe at N read replicas + 1 elected writer** today; the read path stays multi-replica while writes serialize through one leader.
- A read-only stuck-task detector becomes possible (`listStuckTasks`), populated once `claimed_at` is armed — the diagnostic v1's detector read a column nothing populated.
- Cost attribution is unblocked behind a transactional write path that can record priced cost instead of `0`.

**Negative**

- Writes are serialized through one replica (acceptable for a control plane with low write volume; the read path stays multi-replica).
- A leader-lock failure mode (split-brain on lock expiry without release) must be covered by the lease timeout; the **lock-TTL < lease-TTL invariant** (`G1`: lock 90s, lease 10 min) is load-bearing — a crashed leader's lock must expire *before* any in-flight task's lease, so a reclaiming replica is guaranteed the prior lease has expired (no double-dispatch). The post-provider completion write must be guarded (`WHERE id=? AND status='in_progress' AND claimed_at=?`) so a deposed leader cannot clobber a reclaiming leader's in-flight task.
- New schema: `claimed_at` column on `tasks` (migration `055`), a leader-lock table, and the runner kind-registry extension + `task_id` FK (`opzava_runner_004`). The leader-lock heartbeat is a new high-frequency write point, accounted in the wal_checkpoint cadence (Track A0).
- The runner's maintenance daemon and the inherited scheduler remain **two timers** post-C3 unless explicitly gated behind `acquireLeadership()` — the runner is lease-correct and won't double-execute, but C3 must state which daemon is leader-gated once task-dispatch enqueues into the runner.

**Neutral**

- The Postgres path (ARD 0006) is unchanged: single-active-writer is an additive safety seam, not a commitment against future multi-writer scale. The leader-lock seam is removable without a data migration once Postgres `SELECT … FOR UPDATE SKIP LOCKED` claim semantics arrive.
- ARD 0007's "separate engines, unified surfaces" is preserved: this ARD unifies the **execution path** behind the runner; it does **not** merge the `tasks` Kanban (Engine A) and `WorkflowRun → StepRun` (Engine B) data models, nor the two agent models.

## Alternatives considered

- **Postgres now — migrate the write spine to `SELECT … FOR UPDATE SKIP LOCKED` claim semantics (ARD 0006).** This is the correct end state for true horizontal scale, but it is the **largest** possible build: it changes the durability model, requires a driver-swap across every repository interface, and is **not required** to make the current scheduler safe. The leader-lock seam delivers the safety property (no double-dispatch at N replicas) at medium effort and keeps the Postgres option open. **Rejected as the immediate path; tracked as a future state.**

- **Merge the two task tables into the runner's `WorkflowRun → StepRun` model.** Rejected: it contradicts ARD 0007's "separate engines, unified surfaces" doctrine and the project guardrail that "the generic upstream task model must not become the artifact model." A full schema merge is a large cross-cutting migration with high regression surface — exactly the entropy risk the project guards against. The runner becomes the **execution** home while the two data models stay separate.

- **Status quo — keep three inline state machines, add per-machine leases without unifying on the runner.** Rejected: it preserves the god-module (`task-dispatch.ts`, 1753 lines), the duplicated reclaim logic, and re-invents lease/retry/dead-letter that the runner **already owns and tests**. It would leave the `quality_review` dead-zone as a special case and the durable runner under-used. Reuse, don't re-invent.

- **Leader election via an external coordinator (etcd / Redis).** Rejected for a self-hosted SQLite control plane: it adds a hard runtime dependency and a new failure mode, breaking the zero-dependency standalone/docker contract. The advisory-lock / leader-lock-table seam keeps the deployment dependency-free and survives the existing single-process model.

## References

- **Scheduler / dispatch chain:** `src/lib/scheduler.ts:57-67` (`runTaskDispatchChain`), `:20` (`TICK_MS`), `:172` (`runAegisReviews` task), `:190` (`requeueStaleTasks` task), `:498` (`setInterval(tick, TICK_MS)`).
- **God-module / three engines:** `src/lib/task-dispatch.ts:980` (`runAegisReviews`, no `workspaceId`, unscoped SELECT `:983-992`), `:1005` (Aegis claim), `:1160-1175` (`requeueStaleTasks`, `in_progress`-only `:1171`, heartbeat-gated `:1191-1195`), `:1251`/`:1288` (`dispatchAssignedTasks` claim, guarded but lease-less), `:399` (`workspaceId ?? 1`), `:1077`/`:1198`/`:1542` (`dispatch_attempts` TOCTOU).
- **Cost-attribution gap:** `src/lib/task-dispatch.ts:614-638` (`recordUsage`, `cost = 0` at `:633`, error-swallowing catch at `:637`), `src/app/api/tokens/route.ts:119` (`record.cost ?? …` — `0` short-circuits the fallback), `src/opzava/platform/costs/unified-cost-reader.ts` (sums a never-populated column).
- **Third claim site:** `src/app/api/tasks/queue/route.ts:117-129` (polling-queue claim, lease-less).
- **Runner / canonical path:** `src/opzava/modules/content/workflow/job-kind-executor.ts:9` (`createJobKindExecutor` — the kind-registry seam), `src/opzava/platform/runner/MODULE.md` (campaign-send-only wiring; lease/retry/dead-letter invariants), `src/opzava/platform/runner/maintenance-daemon.ts:9-12` ("engines are not merged"), `src/opzava/platform/runner/{worker,retry-policy,repository,migrations}.ts` (reuse surface; `opzava_runner_001/002/003` exist).
- **Horizontal-scale reality:** `docs/deployment.md:625` (SQLite single-writer), `CLAUDE.md` (Critical Constraints — "ENFORCE … horizontal scalability").
- **Related ARDs:** ARD 0006 (Postgres compatibility — future state), ARD 0007 (engine separation & surface unification — preserved), ARD 0010 (Opzava layering realignment).
- **Plan / remediation:** `docs/architecture/orchestration-hardening/MASTER-PLAN.md` (Track C `C1/C2/C3`, Track G `G1/G2`, Track A0/A1/A3/A5), `docs/architecture/system-map/91-remediation-plan.md` (prior engine-separation remediation — prerequisite, not superseded).
