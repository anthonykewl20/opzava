# ARD 0026 — Agent Fleet & Main Orchestrator (frontier-locked coordinator over the graph core)

- **Status:** Proposed (five structural decisions ratified by the first grilling; a second deep-grill **hardening pass** — 2026-06-25, frontier model — resolved **eight gaps, three under *locked* decisions**; see [§Decision — hardening pass](#decision--hardening-pass-deep-grill-2026-06-25). Remaining items in §Open questions are re-scoped, not blockers.)
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0014](0014-workflow-engine.md) (graph core — the execution substrate), [ARD 0015](0015-team-execution-and-surfaces-architecture.md) (single-operator, typed tasks, delegated execution — *extended, not superseded*), [ARD 0025](0025-task-dispatch-decomposition.md) (`TaskExecutor`/`ProviderPort` run the Steps; Aegis reviews), [CONTEXT.md](../../CONTEXT.md) Team execution terms, [MASTER-PLAN](../architecture/orchestration-hardening/MASTER-PLAN.md)

## Context

The operator runs a team of AI agents on one OpenClaw gateway. Two forces, both anticipated by ARD 0015, now demand explicit design:

1. **The capacity wall** — ARD 0015 *predicted* "throughput is capped per-subscription… queueing/pacing is needed once several agents are active; multiple accounts give breadth + failover, not infinite parallelism." The operator is hitting it: a single Claude/GPT Pro/Max subscription cannot carry all automation + AI tasks.
2. **Specialization** — the operator wants work routed to agents by their *strengths*, with a capable coordinator harnessing the fleet ("a frontier model to harness multiple agents").

What already exists (verified against HEAD 2026-06-25):
- **Strength-based assignment is already built in skeleton:** `autoRouteInboxTasks` → `scoreAgentForTask` (`task-dispatch.ts:1653-1688`) scores agents by role-keyword match (+10), idle bonus (+5), and `config.capabilities` match (+15), using a hardcoded `ROLE_AFFINITY` table (`:1643-1651`).
- **`agents.role`** (free text: researcher/developer/analyst) and **`agents.config.capabilities`** already carry the seed of a strength model.
- **The graph core** (`core/workflow-engine/`, ARD 0014) exists as the unification surface for multi-step work, but is **consumed by nothing** and has open gaps (no cycle-detection `contracts.ts:105`; `paused` is a `break` stub).
- **`OrchestratorAction`** (CONTEXT.md) already defines the "propose, confirmed-before-act" pattern.

So this is a *refinement + formalization*, not greenfield. The grilling resolved five structural decisions (below); the genuinely new concept is a **frontier-locked `MainOrchestrator`** that plans work as graphs the existing engine then runs.

## Decision

Five provisions (each ratified):

1. **Two layers, not one fused engine.** The fleet's two motivations — capacity and specialization — are solved by two *composed* layers, not one "pick the best agent" engine:
   - **Capacity** — load-spreading / concurrency / quota / pacing over the `AgentAccountProfile` pool (the "they can't handle them all" fix ARD 0015 flagged).
   - **Specialization** — strength-based assignment of work to agents.
   Fusing them produces an engine that's impossible to reason about under failure (when the best-by-strength agent is rate-limited, who wins?). Two layers fail and reason independently.

2. **`Executor = OpenClawAgent | Operator`** — the first-class target of a Card's assignment. Auto-assigned by default; overridable per-Card (pin a specific agent, pick the model, or **claim it for yourself** → `ExecutionSurface=local`). This makes "AI or myself" an explicit, controllable choice rather than implicit. Distinct from `assigned_to` (storage) and `ExecutionSurface` (the consequence).

3. **`MainOrchestrator` is a *lead worker*, not the brain.** A singleton designated `OpenClawAgent` (one per workspace) that coordinates the fleet by **proposing** `OrchestratorAction`s — `decompose` / `assign-to-worker` / `reassign`. The control plane **confirms, executes, and owns the resulting state.** CONTEXT.md line 17 holds: *"agents are workers, not the brain; the system owns sequence."* The orchestrator is the *lead* cognitive worker; it never unilaterally mutates state.

4. **The frontier-lock is hard, not soft.** The orchestrator's `AgentAccountProfile.model` must resolve to `ModelTier.frontier`. Enforced at **config-save** (reject non-frontier in the slot) **and dispatch** (refuse if downgraded/removed) **and a governance/invariant test**. No silent fallback to a non-frontier model — that is what makes it a *real* lock. **Blast radius = halt-orchestration-only:** when the frontier model is unavailable, *new* decomposition/assignment waits; already-decomposed, in-flight worker tasks run to completion; simple/already-assigned work continues via the `scoreAgentForTask` fallback. The frontier subscription is never a global single-point-of-failure for the fleet's liveness.

5. **Synthesize on the graph core — no parallel fleet executor.** `decompose` *produces a `WorkflowGraph`* (the Card becomes a DAG of Steps); `assign-to-worker` maps each Step to a worker `OpenClawAgent` by strength; the graph `Engine` executes it; Aegis reviews per `ReviewStrategy`. The orchestrator plans; the engine runs — one execution substrate. **v1 constraint:** the orchestrator emits only shapes the engine can validate *today* (linear / fan-out); arbitrary-DAG emission waits on the graph core's cycle-detection/validation (`contracts.ts:105` TODO) becoming load-bearing.

Supporting concept — **`ModelTier`**: a classification (`frontier | standard | economy`) held in a config-as-data registry (AdminConfig); the single source of truth for a model's capability class. It absorbs today's hardcoded `DISPATCH_MODEL_*` / `classifyDirectModel` tier logic (golden principle: no model tiers in source) and is shared by the frontier-lock (#4) and `AccountRouting` (per-`TaskType` tier preference).

## Decision — hardening pass (deep grill, 2026-06-25)

A second grilling (frontier model, max-effort) stress-tested the five ratified provisions and resolved **eight gaps the first pass missed — three under *locked* decisions**. These amend/extend the provisions above (annotated). All eight hang on seams that already exist (**no new primitives**): the `TaskKanban` spine ([ARD 0025](0025-task-dispatch-decomposition.md) Slice 1a), `plan().accountProfile` (`core/execution-policy/contracts.ts:76`), and `acquireLeadership()` ([MASTER-PLAN](../architecture/orchestration-hardening/MASTER-PLAN.md) G1).

**H1 — Confirmation is a deterministic policy gate, not human-per-action; the fleet actions are a new third class. (amends D3.)** The existing `OrchestratorAction` (CONTEXT.md:77) is the *Ask-Opzava chat* registry with two classes — `internal-reversible` (auto) / `external-guarded` (mints an `Approval`); `decompose`/`assign-to-worker`/`reassign` are in **neither** (verified: zero `OrchestratorAction` usages in `src/`), so D3's "reuses the existing seam" was aspirational. Resolution: a **third class `orchestration-plan`** that **auto-executes after a deterministic `OrchestrationPolicyGate`** the control plane owns — (1) graph validates against engine wiring rules; (2) shape ∈ {linear, fan-out} (provision 5); (3) step count ≤ cap; (4) every Step kind has a registered executor; (5) projected cost ≤ budget ceiling; (6) idempotent (H2); (7) audited. The external-action **`Approval` boundary is unchanged** — an external-effecting Step mints an `Approval` *when it runs*, whoever planned it. Net: the orchestrator may propose any *plan* but provably cannot cause any *effect* the gate + Approval boundary wouldn't allow any worker to cause. Frontier-lock guards **competence**; the gate guards **authority** — the same "two layers, reason independently" instinct that won Q1.

**H2 — Every `orchestration-plan` action carries a deterministic idempotency key. (NEW — idempotency is non-negotiable, CLAUDE.md.)** `decompose` keyed `(workspace_id, card_id)` → a Card has **at most one** active `WorkflowGraph`; re-proposal returns the existing graph (`idempotent:true`, the `client_request_id` SELECT-first idiom, MASTER-PLAN A2). `assign-to-worker` keyed `(graph_id, step_id)`. `reassign` is the deliberate exception: monotonic `reassign_seq` + reason, gated by H7. Enforced as guarded writes through the spine, not app-level checks.

**H3 — A deterministic triage decides *whether* a Card is decomposed — upstream of the orchestrator. (amends D4.)** "Halt-orchestration-only" presumes a "simple Cards" set that bypasses decomposition, but nothing defined it — and the orchestrator can't be what decides whether to invoke the orchestrator (circular when frontier is down). Resolution: a Card carries an explicit `needs_decomposition` signal set by the operator or a cheap **economy-tier** classifier at capture, **never** by the frontier model. The orchestrator picks up only flagged Cards; unflagged Cards flow through today's `autoRouteInboxTasks`→`scoreAgentForTask` path (`task-dispatch.ts:1694`) untouched. Frontier-down ⇒ flagged Cards **queue**, simple Cards flow — the degradation set is now well-defined and frontier-independent.

**H4 — A decomposed Card stays ONE Card; `decompose` *promotes* it from the linear spine to a `WorkflowGraph`. (reconciles ARD 0025 ↔ this ARD — the load-bearing structural call.)** ARD 0025 ruled "no graph on the linear kanban; spend it where topology *varies*," and named its own re-open trigger. `decompose` *makes a Card's topology vary* — it **is** that trigger. ARD 0013 (D1) independently fixes the projection: "a `Card` … is the same underlying `tasks` row; do **not** create `opzava_card` tables." Resolution: **two Card execution kinds** — **(1) simple** → `TaskKanban`+`TaskExecutor` linear FSM (ARD 0025, no graph); **(2) decomposed** → a `WorkflowGraph` of Steps run by the engine (ARD 0014). `decompose` is the **promotion** (1)→(2). The Card stays one `tasks` row (the human-facing projection); its Steps execute as `StepRun`s (CONTEXT.md:53), **not** new Cards — the kanban never explodes. The graph references the card's task id **by value** (the `TodoList` composition-join precedent, ARD 0013 D1). The Card status is a **rollup** over its graph's `StepRun`s (rule = open, H-r1). The graph is thus spent exactly where ARD 0025 said it earns its seam — and the linear spine is untouched for simple work.

**H5 — Capacity is a hard, atomic, per-`AgentAccountProfile` concurrency cap enforced in the claim path. (resolves Q1 / the operator's Q6.)** Today's cap is **per-agent, advisory, racy**: a non-atomic `SELECT COUNT(*) … >= 3` then a separate claim (`task-dispatch.ts:1745-1761`) — two ticks each see 2, both assign, overshoot; and it counts *agents*, not the **subscription** that is actually rate-limited (CONTEXT.md:87). Resolution: the cap is **keyed on `plan.accountProfile`** (`core/execution-policy/contracts.ts:76`) and enforced **inside `TaskKanban.claimNext`** as part of the guarded `UPDATE … WHERE` (ARD 0025 Slice 1a) — **replica-safe under the G1 leader lock**, TOCTOU gone. `claimNext` refuses an at-cap account, tries the next under-cap account in `plan.failover`, else the Card waits. Cap **value** = operator AdminConfig (H-r2). Specialization (which agent) and capacity (which account has headroom) stay the **two independent layers** of provision 1 — the racy per-agent fusion in today's code is exactly what provision 1 forbids.

**H6 — The orchestrator singleton IS the G1 leader, and it is subject to the capacity layer it manages. (resolves the self-reference Q1 missed.)** No new singleton: the orchestrator's planning tick runs **only on the elected leader** (`acquireLeadership()`, gated like `runTaskDispatchChain`). Its *own* frontier-model calls go through the same `ProviderPort`+`claimNext` cap as any worker — it can't starve the fleet, and worker traffic on the frontier account is paced to leave the planner headroom (reserved-slot policy = open H-r3).

**H7 — Degradation safety is the *lease*, not the orchestrator — so supervision may defer, but the dependency must be stated. (qualifies the Q4 deferral.)** **Mechanical** stall (a `StepRun` lease expires) → reclaimed deterministically by `reclaimExpiredLeases` (ARD 0025 / MASTER-PLAN A5+G1), **no orchestrator** — this is what makes "halt-orchestration-only" (D4) safe. **Semantic** stall (repeated review-fail, wrong plan) → needs the orchestrator's `reassign`/re-plan, may defer to Q4 *because* the lease prevents permanent strand. The deferral is legitimate **only while the lease is armed** — D4's degradation claim silently depends on A5/G1 landing.

**H8 — `ModelTier` ships a canonical code-seeded default the operator overrides but can't silently corrupt; the lock re-checks at dispatch. (amends D4 — the lock's trust root.)** The hard lock is only as strong as the registry defining "frontier"; operator-editable AdminConfig means a mislabel silently defeats it. Resolution: a **canonical default tier map ships as seeded data** (from today's `DISPATCH_MODEL_*` — opus-class⇒frontier, sonnet⇒standard, haiku⇒economy, `model-config.ts:34-38`) — data not a source conditional (golden principle) yet a known-good floor; AdminConfig **overrides** it but every tier edit emits a `security.event`, a governance test asserts the seed exists, and the lock is **re-evaluated at dispatch** (provision 4 already mandates dispatch-time enforcement — H8 names its data dependency).

## Consequences

- **Positive:** the capacity wall gets a real mechanism (load-spreading) instead of silent rate-limit failures; specialization formalizes the existing `scoreAgentForTask`/`capabilities` seed into a matchable model; the frontier-lock guarantees no under-capable agent ever coordinates; the graph-front-end synthesis means **zero new execution substrate** — the fleet reuses the engine, the runner's lease/retry, and Aegis; graceful degradation (halt-orchestration-only) keeps the fleet productive when the frontier model hiccups.
- **Negative:** a frontier subscription is effectively mandatory for orchestration (a real cost + a dependency); an LLM emitting graphs is error-prone, so v1 is shape-constrained and the graph-core validation gap becomes a tracked prerequisite; cost multiplies (fleet + frontier orchestrator) and needs budgeting (open); a singleton orchestrator is itself a coordination bottleneck to pace.
- **Neutral:** ARD 0015 holds — still single-operator, one OpenClaw, typed tasks, delegated execution. This ARD adds a coordination layer *on top*, it does not change the trust model or the engine separation (ARD 0007). The inherited `tasks` state machine continues as the human-facing projection.

## Alternatives considered (the grilled forks)

- **Brain vs lead-worker orchestrator (Q3).** Rejected "brain": an agent owning task sequence/state would amend CONTEXT.md line 17 and break the audit/approval authority model. Adopted lead-worker (propose, system confirms) — reuses the existing `OrchestratorAction` seam and is what makes the frontier-lock meaningful (the lock guards a *proposer*, not a *dictator*).
- **Halt-all vs halt-orchestration-only (Q4).** Rejected halt-all: it couples the whole fleet's liveness to one account's availability — the exact fragility the fleet exists to escape. Adopted halt-orchestration-only.
- **Separate fleet executor vs synthesize on the graph core (Q5).** Rejected separate: it duplicates the engine, the runner, and Aegis — the two-engine drift ARD 0014/0025 exist to kill. Adopted the synthesis.
- **Capacity-and-specialization fused vs two layers (Q1).** Rejected fused: un-reasonable under failure. Adopted two composed layers.
- **`Executor` implicit (assigned_to=agent only) vs first-class Agent|Operator (Q2).** Rejected implicit: "AI or myself" was not a controllable choice. Adopted first-class `Executor`.

## Open questions — re-scoped after the hardening pass

**Folded into Decisions above:** Q1 capacity → **H5** (shape + enforcement point decided; numbers remain H-r2); Q4 supervision → **H7** (mechanical reclaim is deterministic via the lease; only *semantic* re-plan defers); Q5 graph-core prerequisite → provision 5 + **H4** (the shape-constraint stands; cycle-detection is load-bearing only once the orchestrator emits arbitrary DAGs).

**Genuinely open** (operator/product input, or a later slice — *safe defaults ship; not blockers*):

1. **H-r1 — Card-status rollup** for a decomposed Card over N `StepRun`s (worst-of / slowest / explicit gate-step?).
2. **H-r2 — capacity values:** the per-`AgentAccountProfile` in-flight cap + pacing/backoff numbers — depend on the operator's real subscriptions and rate limits.
3. **H-r3 — orchestrator headroom:** a reserved-slot policy so worker traffic never starves the planner on a shared frontier account.
4. **Q2 (unchanged) — strength-model formalization:** a declared `AgentCapability` model replacing the `ROLE_AFFINITY` keyword-substring scoring (`task-dispatch.ts:1643`), which the orchestrator reads and matches against.
5. **Q3 (sharpened) — cost attribution:** an orchestrator `decompose`/`assign` call needs a `token_usage` row — *proposed:* attribute the planning cost to the Card via a synthetic `step_id='orchestration'`, reusing MASTER-PLAN A4's deterministic idempotency key; per-workspace / per-Card budget ceilings remain product policy.

**CONTEXT.md sync** — the new ubiquitous language (`orchestration-plan` action class, `OrchestrationPolicyGate`, `needs_decomposition` / Card-promotion, per-account capacity cap) is the next **domain-modeling** step, deliberately *not* folded in here so the resolutions can be reviewed before they become the contract.

## References

- Verified code: `scoreAgentForTask`/`ROLE_AFFINITY`/`autoRouteInboxTasks` (`task-dispatch.ts:1643-1700`); `agents.role` + `agents.config.capabilities` (`schema.sql:23-35`); graph core `contracts.ts:105` TODO.
- CONTEXT.md: `Executor`, `MainOrchestrator`, `ModelTier`, `OpenClawAgent`, `AgentAccountProfile`, `AccountRouting`, `OrchestratorAction`, line 17.
- ARD 0014 (graph core), ARD 0015 (single-operator typed execution), ARD 0025 (god-module decomposition — `TaskExecutor`/`ProviderPort`), MASTER-PLAN.
