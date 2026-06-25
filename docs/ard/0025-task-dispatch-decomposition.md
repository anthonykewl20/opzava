# ARD 0025 — `task-dispatch.ts` Decomposition (γ-spine hybrid)

- **Status:** Proposed (design ratified by design-it-twice; the **C2 refinement** in §Decision amends the grilled MASTER-PLAN and is the one item awaiting explicit sign-off)
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0007](0007-engine-separation-and-surface-unification.md) (engines separate), [ARD 0011](0011-single-orchestrator-execution-model.md) (single orchestrator), [ARD 0014](0014-workflow-engine.md) (graph core), [ARD 0015](0015-team-execution-and-surfaces-architecture.md) (typed execution), [MASTER-PLAN](../architecture/orchestration-hardening/MASTER-PLAN.md) Track C, [deep-module-map](../architecture/orchestration-hardening/deep-module-map.md), [CONTEXT.md](../../CONTEXT.md)

## Context

`src/lib/task-dispatch.ts` is a 1790-line god-module holding **eight orthogonal concerns** behind one `TaskDispatchDeps` DI seam (`:38-49`, the file's one real seam — two adapters: `makeDefaultDeps` prod + test literals):

| Concern | Lines | What it does |
|---|---|---|
| Deferred-completion reconcile | `:181-513` (333) | poll gateway runs, recover text from transcripts, promote `in_progress→review` |
| Direct dispatch (3 providers) + `recordUsage` | `:519-903` (385) | Anthropic API / Claude CLI / OpenAI-compatible + cost row |
| Aegis quality review | `:988-1163` (259) | build prompt, parse VERDICT, claim `review→quality_review`, model call |
| Stale-task reap | `:1169-1286` (122) | lease reclamation, offline-agent requeue |
| Dispatch loop | `:1288-1636` (349) | claim `assigned→in_progress`, gateway/direct routing, retry budget |
| Auto-routing | `:1694-1790` (149) | inbox→assigned scoring + capacity |
| Model routing | `:116-174` | `resolveTaskDispatchModelOverride`, `buildTaskPrompt` |
| DI seam | `:38-94` | `TaskDispatchDeps` + `makeDefaultDeps` |

The three **lease-arming claim sites** (`:1013`, `:1325`, `tasks/queue/route.ts:118`) plus three more guarded `WHERE id=? AND status=?` writes (`:1191`, `:1241`, `:1256`, `:1769`) are the atomic-guarded transitions; A5 arms `claimed_at` at the claim sites.

Two **fixed points** already exist as deep modules and must be composed *with*, not reinvented: `core/execution-policy` (`plan(task, routing, deps) → ExecutionPlan`) and `core/workflow-engine` (`executeGraph`, `StepContract`, `ReviewStrategy`, `EngineLayer`, `RunContext`). Two more — `core/auth` (device-auth) and `platform/runner` (the job/attempt/dead-letter FSM) — are already deep.

**The tension this ARD resolves.** MASTER-PLAN C2/C3 say "runner-canonical for all three engines — dispatch enqueues, runner executes." ARD 0014 says "graph-canonical — the lifecycle is a `WorkflowGraph`; the runner executes per-Step." Neither composes the other, and *nobody has designed where the eight responsibilities land*. A design-it-twice pass (four parallel designs — runner-canonical α / graph-canonical β / hybrid-spine γ / ports-&-adapters δ) produced this decision.

## Decision

**Adopt the γ-spine hybrid**, grafted with δ's port discipline, α's runner-as-executor, and β's "claim-as-one-mechanism" realized as a concrete spine. Five provisions:

1. **Lifecycle owner = a thin `TaskKanban` spine** (concrete module, *not* a port) owning *only* claim / lease / transition / reclaim. All six guarded writes collapse into `claimNext` / `transition` / `reclaimExpiredLeases`. This is β's `LeaseLayer` insight without a graph dependency.

2. **Execution = a deep `TaskExecutor`** behind δ's explicit `ProviderPort` (4 prod adapters: gateway / direct-anthropic / openai-compatible / claude-cli + in-memory). `execute({task, plan}) → TaskOutcome` hides the 385-line provider fan-out + prompt building + usage capture. The per-task dispatch path becomes `claim → plan → execute → transition`.

3. **Review = `ReviewStrategy` adapters** (the latent seam in `core/workflow-engine` has zero adapters today). Aegis becomes an adapter (impure, lives in `platform`); pure prompt/verdict fns move to `core/reviews` (= MASTER-PLAN C1); a `rule-gate` adapter closes the unconditional-review tax.

4. **Durable execution = the runner**, invoked by the executor when `plan.engine === 'B'` (content/social/ops). The runner *executes*; it does **not** own the kanban FSM.

5. **The graph core is spent on the content pipeline only**, where topology genuinely varies — *not* on the linear kanban. **(C2 refinement — see below.)**

### Why γ over β (the clincher)

The codebase-design seam discipline: *"one adapter = a hypothetical seam; two = a real one — don't introduce a seam unless something varies across it."* The kanban has **one topology** (a linear FSM, `inbox→assigned→in_progress→review→quality_review→done|failed`, one branch at review). A graph is a seam for *varying* topology. Forcing `executeGraph` onto a linked list is indirection where nothing varies — the shallow-module trap at graph scale (one `StepContract` per status, ~zero lifecycle-specific logic per node). The graph earns its seam in the **content pipeline** (11 steps, future branching). Spend the deep machinery where the structure varies.

### Why γ over α (runner-canonical)

α collapses the scheduler 5→1 by making every concern a runner job *kind*. But it fuses the `tasks` table and `opzava_runner_jobs` into one logical lifecycle with no join — a crash between `recordAttemptSuccess` and the `tasks` UPDATE leaves a succeeded job + a stuck task. That is a **new structural consistency seam that does not exist today.** Keeping the kanban in `tasks` (γ) and using the runner only as the durable executor for Engine-B work avoids it. α's depth is real — for durable Engine-B execution — but not as the lifecycle owner.

### C2 refinement (AMENDS MASTER-PLAN C2/C3 — await sign-off)

C2 says "runner canonical for *all three* engines." This ARD refines it: **the runner executes durable Engine-B work; Engine-A synchronous direct-dispatch stays in the `TaskExecutor`.** A synchronous Anthropic/OpenAI/CLI call either succeeds (→review) or fails (→retry budget in the spine); it is neither long-running nor cross-process, so routing it through the runner buys no durability and costs the two-table consistency seam. This honors C2's *spirit* (runner is the canonical durable executor; Aegis is a strategy/kind; `task_id` FK links them) while refining its *letter*. C1 (Aegis→`core/reviews`) and C3's `task_id` FK + `listStuckTasks()` stand untouched.

## Interface (the resulting module shapes)

```
┌─ src/opzava/platform/task-state/        (the spine — concrete, owns the `tasks` table)
│  TaskKanban {
│    claimNext({from, workspaceId, limit, orderBy?}): ClaimedTask[]      // guarded UPDATE + lease
│    transition(task, to, patch?): {result:'won'|'lost'}                 // guarded WHERE id AND status
│    touchLease(task): void                                               // claimed_at heartbeat
│    reclaimExpiredLeases({workspaceId, statuses, staleAfter}): {taskId,from,to}[]
│  }
│
├─ src/opzava/platform/execution/         (the depth)
│  ProviderPort {                                                         // 4 adapters + in-memory
│    invoke({task, prompt, plan, signal}): {text, sessionId, runId?, deferred, usage?}
│    waitForRun(runId): {complete, text}
│    isAvailable(): boolean
│  }
│  TaskExecutor.execute({task, plan, rejectionFeedback?}, signal): Promise<TaskOutcome>
│    TaskOutcome { kind:'completed'|'deferred'|'failed', resultText, usage,
│                  sessionId, deferredMeta?, errorClass?, errorMessage? }
│  UsageSink { record(task, model, usage): void }                        // cross-cutting (replaces recordUsage)
│
├─ src/opzava/core/reviews/               (= MASTER-PLAN C1 — pure fns)
│  review(task, deps): Promise<ReviewVerdict>   · buildReviewPrompt(task) · parseReviewVerdict(text)
│  (impure Aegis adapter + rule-gate live in platform/execution/review/, satisfying core/workflow-engine.ReviewStrategy)
│
└─ src/opzava/platform/task-state/        (thin modules — glue over the spine)
   reconcile-deferred.ts (333→thin) · auto-route.ts (149→thin, scoring→core/routing) · run-dispatch.ts (the claim→plan→execute→transition glue)
```

Invariants: (1) every status transition is one guarded write through the spine; (2) `plan()` is the routing authority — `isGatewayAvailable()` is health-only, never the engine selector; (3) the executor never touches the `tasks` row (it returns `TaskOutcome`; the spine transitions); (4) the runner is invoked only for `plan.engine==='B'`; (5) `core/` stays pure.

## Consequences

- **Positive:** the god-module's 8 concerns get one home each; `TaskExecutor.execute()` is a textbook deep module (one method, 385+ lines hidden); the 6 guarded writes become one mechanism; Aegis is auditable in isolation; provider swap is a new adapter not a new branch; each module is testable through its interface with in-memory adapters (no `vi.mock`, no real DB); the graph core is spent where it earns its keep.
- **Negative:** two kanban-touching altitudes to maintain (spine + thin orchestrators); `core/execution-policy` gains its first consumer (the `classifyDirectModel` heuristics migrate in — a behavior-preserving move with ~45 lines of surface); Engine-B path retains the `tasks`↔`runner_jobs` consistency concern (the reconcile module is the repair path).
- **Neutral:** ARD 0007 holds (engines separate — the runner executes, doesn't own the kanban); ARD 0014 holds (graph core built + used for content, not the kanban); the inherited `tasks` state machine continues as the human-facing projection.

## Alternatives considered (design-it-twice)

- **α — runner-canonical (minimize interface).** Scheduler 5→1; every concern a runner job kind. Rejected as lifecycle-owner: introduces the `tasks`↔`runner_jobs` consistency seam for no durability gain on synchronous Engine-A calls. Adopted in part: the runner is the Engine-B executor.
- **β — graph-canonical (maximize flexibility).** Lifecycle = `WorkflowGraph`; `LeaseLayer` collapses the claims. Rejected for the kanban: spends a DAG engine on a linear FSM (shallow-module trap); gated on four graph-core completions (cycle detection, persistence, HITL resume, workspace-guard). The `LeaseLayer`/claim-as-one-mechanism idea is adopted, realized as the concrete spine. β remains the **long-term hedge**: if Aegis becomes multi-step, content/social get type-specific sub-graphs, or HITL inserts pauses, revisit spending the graph on the kanban. — **Now triggered by [ARD 0026](0026-agent-fleet-and-main-orchestrator.md) H4:** the `MainOrchestrator`'s `decompose` action *makes a Card's topology vary*, so the graph is spent on **decomposed** Cards (promoted off the linear spine) while the spine still owns **simple** Cards. The hedge is a live boundary, not a hypothetical — and it does *not* reverse this ARD: the linear kanban stays graph-free; only a decomposed Card crosses into the graph.
- **δ — ports & adapters.** Three explicit ports + thin orchestrator. Adopted in full for execution + review (the port discipline + "interface is the test surface" + facade migration). Its `TaskStateRepository` port is rejected in favor of γ's concrete spine (one storage = not a real production seam; making it a port risks a passthrough).

## References

- Design-it-twice artifacts: α/β/γ/δ interface designs (this session).
- [deep-module-map](../architecture/orchestration-hardening/deep-module-map.md) — the cluster inventory + the phased migration sequence (Slices 0–4).
- MASTER-PLAN Track C (C1 Aegis→`core/reviews`; C2 split — refined here; C3 runner canonical + `task_id` FK + `listStuckTasks`).
- CONTEXT.md: Task, TaskType, Engine A/B, Aegis, Step, WorkflowGraph, ReviewStrategy, ExecutionPlan.
