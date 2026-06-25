# Agent Fleet & Main Orchestrator — Full-Spec Completion Plan

> **status:** Approved-for-build · **date:** 2026-06-25 · **owner:** orchestration
> **design authority:** [ARD 0026](../../ard/0026-agent-fleet-and-main-orchestrator.md) (decisions 1–5 + hardening H1–H8) · [ARD 0025](../../ard/0025-task-dispatch-decomposition.md) (spine/executor/review) · [ARD 0014](../../ard/0014-workflow-engine.md) (graph core) · [ARD 0015](../../ard/0015-team-execution-and-surfaces-architecture.md) (single-operator, typed, delegated) · [MASTER-PLAN](MASTER-PLAN.md) (foundational A/G tracks) · codebase-design seam picks (gate + capacity, this session) · [CONTEXT.md](../../../CONTEXT.md)
> **gate before code:** grilling ✅ · domain-modeling ✅ · codebase-design (design-it-twice) ✅ · ARD ✅. This plan is the verified bridge to `/tdd`.

## Progress (updated 2026-06-26)

The **in-memory decompose-and-execute pipeline is complete** — `decomposeAndExecute(card)` runs propose→gate→persist→hydrate→execute end-to-end; full suite 899 tests green, typecheck 0, governance green. 12 commits on `feat/orchestration-hardening`.

**✅ Done (built + TDD'd):** `F1` migration 059 · `F2` core/model-tier · `S0`+`S1` TaskKanban spine + atomic AccountCapacity · `D0` CardDecomposition + rollup · `G0` OrchestrationPolicyGate · `R0` core/reviews (default-DENY) · `X0` TaskExecutor + ProviderPort (prompt-centric) · `E0` dispatch/review step adapters + engine execution · `M1` executeDecompose · `M2` proposeDecomposition (frontier-locked) + runDecomposition · `M3` core/routing strength matcher + hydration wiring · `decomposeAndExecute` capstone + `hydrateGraph`. `L0` leader-lock **primitive** pre-existing (verified).

**◐ Partial:** `S2` lease (armed in the spine; not yet on the live claim sites) · `M4` frontier-lock (enforced at the proposal site; config-save/dispatch enforcement pending) · `V0` governance (architecture/engine-boundary/migration-id green; e2e pending).

**⬜ Remaining (Phase 2 — integration):** `F0` ExecutionPlan-as-routing-authority · `T0` triage · `E1` runner-as-Engine-B · real `ProviderPort` adapters (creds) · `L0` scheduler-gating (2-replica validation) · Slice-3 dispatch rewire · `C0` Executor first-class · `K0` cost · `M5` degradation · API/UI · e2e. `CONTEXT.md` term sync is blocked by the unrelated content-pipeline edit.

## 0. Scope & completion contract

**In scope (the full fleet capability, end-to-end):** the `MainOrchestrator` that plans work as graphs the engine runs, the `OrchestrationPolicyGate` that confirms its plans, the per-`AgentAccountProfile` `AccountCapacity` cap, `ModelTier` + the hard frontier-lock, `CardDecomposition` (simple→graph promotion), the `needs_decomposition` triage, `Executor` first-class, graph execution wired to the runner + Aegis-as-`ReviewStrategy`, cost attribution, and the API + UI surfaces — with failure + empty states, governance invariants, and e2e proof. No stubs, no mock-only paths, no TODO-driven logic.

**Foundational subset consumed (not re-planned here — cite MASTER-PLAN):** `A1` (`claimed_at` + idempotency columns), `A5` (lease arming + `quality_review` reclaim), `G1` (leader-election + workspace-scoped scans). These land as their own commits per the MASTER-PLAN; this plan depends on them and sequences them in.

**Explicitly OUT (separate hardening, not this feature):** device-auth (Track D), MCP hardening (E), client-truthing (F), Dokploy/cookie/TLS (I), SSRF (B4). Tracked in the MASTER-PLAN independently.

**Definition of done (every task):** red→green→refactor; AC list IS the test spec; one Conventional Commit (no AI trailers); `pnpm test:all` green (lint+typecheck+test+build+e2e+governance); affected `MODULE.md`/docs updated; no placeholder left behind.

## 1. Open-item resolutions (so the spec is FULL, not deferred)

| Was open | v1 resolution (operator-tunable where noted) |
|---|---|
| **H-r1 Card-status rollup** (decomposed card over N StepRuns) | Deterministic precedence, mirroring `ProjectHealth`: `failed` (any StepRun terminally failed past its retry budget) > `quality_review`/needs-you (any Step awaits Aegis) > `in_progress` (any Step running/ready) > `done` (ALL StepRuns done). Pure `rollupCardStatus(stepRuns[])`. |
| **H-r2 capacity values** | Default per-`AgentAccountProfile` cap = **3 concurrent**; AdminConfig key `orchestration.capacity.<profileId>` overrides. No daily-quota/token-bucket in v1 (count-cap predicate only); pacing = the existing retry budget. |
| **H-r3 orchestrator headroom** | Reserve **1 slot** on the frontier account for the orchestrator: worker effective-cap on that account = `cap − reserved` (computed upstream, passed as `cap` to `claimNext`). AdminConfig `orchestration.headroom.<profileId>`. |
| **Executor × decompose interaction** | A card whose `Executor=Operator` (claim-for-self, `ExecutionSurface=local`) is **never** decomposed/assigned by the orchestrator; decompose applies only to `OpenClawAgent`-executed cards. |
| **Q3 cost attribution** | Orchestrator `decompose`/`assign` model calls write a `token_usage` row attributed to the card via synthetic `step_id='orchestration'`, reusing MASTER-PLAN A4's deterministic idempotency key. |

## 2. Module map (what gets built, where)

```
core/orchestration-policy/   NEW · pure gate (H1): gate(action,policy,deps)→GateVerdict; structured denial codes
core/model-tier/             NEW · pure ModelTier registry + frontier predicate (H8) over a seeded default map
core/reviews/                NEW · pure buildReviewPrompt/parseReviewVerdict (ARD 0025 C1)
platform/task-state/         NEW · TaskKanban spine (claimNext+AccountCapacity / transition / touchLease / reclaimExpiredLeases)
platform/execution/          NEW · ProviderPort + TaskExecutor + UsageSink (ARD 0025 1b/1c) + Aegis ReviewStrategy adapter
platform/orchestrator/       NEW · MainOrchestrator (leader-gated): propose→gate→execute loop; strength match; frontier-lock; degradation
modules/<card>/decomposition NEW · CardDecomposition: persist WorkflowGraph by-value-linked to the task row; rollup; triage
src/lib/migrations.ts        + tasks.account_profile, card↔graph link, model_tier seed, orchestration audit
src/app/api/ops/orchestrator API surfaces (proposals, graph view, executor, capacity, frontier-lock status)
src/components / app          UI surfaces (plan view, graph, executor picker, capacity glance, degradation banner)
```

## 3. Phases & tasks (dependency-ordered; each = one TDD commit)

### Phase 0 — Foundation (routing authority + tiers + schema)
- **F0 · ExecutionPlan as routing authority** (ARD 0025 Slice 0). Move `classifyDirectModel`/`resolveTaskDispatchModelOverride` into `plan()`; add `AccountRoutingConfig` loader from AdminConfig. *AC:* `plan()` decides engine/account/model (golden before/after parity); `isGatewayAvailable()` is health-only. *deps:* —
- **F1 · Migration: `tasks.account_profile` + card↔graph link + orchestration audit** . Add `account_profile TEXT` + index `(account_profile,workspace_id,status)`; `card_workflow_graph` (task_id by value → graph blob + status); `orchestration_audit`. Idempotent PRAGMA-guarded; id globally unique. *AC:* applies on fresh + existing `.data`; re-run no-op; index present. *deps:* —
- **F2 · `core/model-tier` registry + frontier predicate** (H8). Seeded default map (`opus⇒frontier|sonnet⇒standard|haiku⇒economy` from `model-config.ts:34-38`); `tierOf(modelId)`, `isFrontier(modelId)`; AdminConfig override; tier-edit emits `security.event`. *AC:* unseeded id→economy default; override respected; governance test asserts seed present; pure (no platform import). *deps:* —

### Phase 1 — Spine + capacity (ARD 0025 1a + H5 + A5)
- **S0 · `TaskKanban` spine extraction** (ARD 0025 1a). Unify the 3 claim sites (`task-dispatch.ts:1324`, `:1769`, `tasks/queue:118`) into `claimNext/transition/touchLease/reclaimExpiredLeases`; behavior-preserving (golden snapshot before). *AC:* all 3 sites call the spine; outcomes byte-identical; `:memory:` tests through the interface. *deps:* F1
- **S1 · `AccountCapacity` in `claimNext`** (H5; codebase-design pick). Optional structured `capacity?{accountProfile,workspaceId,cap}`; folds the correlated-subquery cap into the guarded UPDATE; stamps `account_profile`; typed `ClaimResult` (`claimed|empty|failed{lost_race|at_cap}`). *AC:* two concurrent ticks on one at-cap account → exactly one claims, other `at_cap`, never overshoots; absent capacity → bare UPDATE unchanged; cap keyed per-profile not per-agent. *deps:* S0, F1
- **S2 · A5 lease arming + `quality_review` reclaim** (MASTER-PLAN A5). `claimed_at` at all claim sites (via spine); `reclaimExpiredLeases` reclaims `in_progress` AND `quality_review`; startup sweep. *AC:* seeded `quality_review` past lease → reclaimed; within lease → kept. *deps:* S0

### Phase 2 — Leader election (singleton + replica-safe capacity)
- **L0 · Leader-election seam** (MASTER-PLAN G1). `acquireLeadership()` (advisory `leader_locks`); gate dispatch + orchestrator chains behind it; lock TTL < lease TTL; workspace-scoped scans. *AC:* two replicas → one leader; crash → reclaim only after lock+lease TTL; non-leader still heartbeats. *deps:* F1

### Phase 3 — Gate + decomposition (H1, H2, H4, H3)
- **G0 · `core/orchestration-policy` gate** (H1; codebase-design pick). Pure `gate(action,policy,deps)→GateVerdict`; effect-ports injected (`isDecompositionDuplicate`/`registeredStepKinds`/`estimateGraphCostUsd`/`auditAction`); internal checks `validateGraph→shape∈{linear,fan-out}→step-count→kind→cost→idempotency→audit`; structured `GateDenial{code,detail,field?}`. *AC:* valid linear/fan-out decompose passes; cyclic/over-cap/unknown-kind/over-budget each → the right denial code; duplicate `(workspace,card)` → `passed,idempotent:true`; pure (no platform import); tested fully in-memory. *deps:* F2 (tier for cost), `core/workflow-engine`
- **D0 · `CardDecomposition` persistence + rollup** (H4, H-r1). Persist a `WorkflowGraph` to `card_workflow_graph` keyed to the task id by value; `promoteCard` (simple→decomposed); `rollupCardStatus(stepRuns)`; the card stays ONE `tasks` row. *AC:* decompose persists one graph per card (idempotent); promotion sets the card's projected status via rollup precedence; no `opzava_card` table created. *deps:* F1, G0
- **T0 · `needs_decomposition` triage** (H3). Card-level flag set by operator OR a cheap **economy-tier** classifier at capture; the orchestrator reads only flagged cards. *AC:* unflagged card flows through `autoRouteInboxTasks` untouched; flagged card is enqueued for the orchestrator; classifier never uses a frontier model. *deps:* F2

### Phase 4 — Graph execution (consume the engine; ARD 0025 1d/2c)
- **R0 · Aegis → `core/reviews` + `ReviewStrategy` adapter** (ARD 0025 C1/1d). Pure prompt/verdict in `core/reviews`; impure Aegis adapter satisfies `ReviewStrategy`; structural anchored VERDICT regex (default-DENY). *AC:* embedded-mid-text "VERDICT: APPROVED" → REJECTED; clean verdict → approved; adapter pure-delegates. *deps:* —
- **E0 · Wire `workflow-engine` to execute a decomposed graph.** The engine (built, consumed-by-nothing) runs a `CardDecomposition` graph; Steps→`StepRun`s; per-Step `ReviewStrategy`. *AC:* a 3-step linear + a fan-out graph execute end-to-end through the engine with edge-state scheduling; skip-propagation correct. *deps:* D0, R0
- **E1 · Runner as Engine-B executor** (ARD 0025 2c / MASTER-PLAN C3). Register `task-dispatch`+`content-step` kinds; `task_id` FK; `listStuckTasks()` populated by S2's lease. *AC:* durable Step enqueues a runner job resolving its `task_id` FK; stuck `quality_review` row appears in `listStuckTasks()`. *deps:* E0, S2, L0
- **X0 · `ProviderPort` + `TaskExecutor` + `UsageSink`** (ARD 0025 1b/1c). Extract the 4 provider adapters behind `ProviderPort`; `execute({task,plan})→TaskOutcome`; usage capture (incl. Q3 orchestration attribution). *AC:* dispatch path = `claim→plan→execute→transition`; in-memory adapter tests; orchestrator calls attributed via synthetic `step_id`. *deps:* F0, S0

### Phase 5 — MainOrchestrator (ARD 0026 decisions 1–5)
- **M0 · `MainOrchestrator` leader-gated singleton + two layers.** Runs only on the G1 leader; capacity layer (load-spread over the pool) + specialization layer (strength match) compose, fail independently. *AC:* runs only when leader; the two layers are separately testable; orchestrator's own calls obey `claimNext` cap (H6). *deps:* L0, S1
- **M1 · `decompose` action: propose→gate→execute.** Orchestrator emits a `WorkflowGraph` (linear/fan-out only, provision 5); `gate` confirms; on pass → `CardDecomposition.promote`. *AC:* a flagged card → proposed graph → gated → promoted; gate rejection → structured feedback, card unflipped, orchestrator may re-propose; idempotent. *deps:* M0, G0, D0, T0
- **M2 · `assign-to-worker`: strength match + capacity-aware.** Formalize `scoreAgentForTask` into an `AgentCapability` match (Q2); each Step→worker; the claim goes through `claimNext` with the worker's account `capacity`. *AC:* Step routes to the best-strength agent with account headroom; at-cap → failover account (caller loop) → else waits; assignment idempotent `(graph,step)`. *deps:* M1, S1
- **M3 · `reassign` + supervision** (H7 semantic path). Mechanical stall already covered by S2 lease; orchestrator emits `reassign` (monotonic `reassign_seq`+reason) on repeated review-fail/wrong-plan. *AC:* a Step failing review N× triggers exactly one `reassign`; `reassign_seq` monotonic; bounded. *deps:* M2, R0
- **M4 · Frontier-lock (hard)** (decision 4). Enforce at config-save (reject non-frontier in the orchestrator slot), at dispatch (refuse if downgraded), and a governance/invariant test. *AC:* setting a non-frontier model in the slot → rejected; runtime downgrade → orchestration halts (not silent fallback); governance test asserts the invariant. *deps:* F2, M0
- **M5 · Halt-orchestration-only degradation** (decision 4 blast radius). Frontier-unavailable → new decompose/assign waits; in-flight graphs run to completion; simple/unflagged cards continue via `scoreAgentForTask`. *AC:* with the frontier account down, flagged cards queue, in-flight Steps finish, unflagged cards still dispatch; recovery drains the queue. *deps:* M4, T0

### Phase 6 — Executor first-class + cost (decision 2, Q3)
- **C0 · `Executor` first-class on a card** (decision 2). `Executor=OpenClawAgent|Operator`; auto-assign default; per-card override (pin agent / pick model / claim-for-self→`ExecutionSurface=local`). Distinct from `assigned_to`/`ExecutionSurface`. *AC:* claim-for-self sets local surface + excludes from orchestration; pin overrides routing; default auto-assigns. *deps:* F0
- **K0 · Cost attribution complete** (Q3 + MASTER-PLAN A4/A4b idiom). Orchestrator calls + Step calls write `token_usage` with non-zero cost from `model-tier`/pricing, idempotent. *AC:* a decompose call produces one `token_usage` row (cost>0, `step_id='orchestration'`); retry doesn't double-count. *deps:* X0, F2

### Phase 7 — Surfaces (API + UI end-to-end, no stubs)
- **API0 · Orchestrator API surfaces.** `/api/ops/orchestrator` (proposals + status), decomposed-card graph read, executor choice, capacity/headroom read, frontier-lock status. openapi specs (api:parity gate). *AC:* every route has an openapi spec; proposals/graph/executor/capacity return real data. *deps:* M1–M5, C0
- **UI0 · Orchestrator surfaces** (UX-redesign + `AssistiveAI` rules). Surface the proposed plan (provenance, gated), the decomposed card's graph, the `Executor` picker, the capacity/tools-health glance, the frontier-down degradation banner. AI-vs-human by glyph not colour; status=label. *AC:* a decomposed card shows its graph + per-Step status; executor picker works; degradation banner shows on frontier-down; empty states honest. *deps:* API0
- **UI1 · Failure + empty states.** Gate-rejection feedback, at-capacity "waiting for headroom", frontier-unavailable, no-flagged-cards. *AC:* each state renders honestly (no fake success). *deps:* UI0

### Phase 8 — Governance + verification
- **V0 · Governance invariants.** Frontier-lock invariant test; `core/orchestration-policy` + `core/model-tier` layering purity (architecture.test.ts); capacity atomicity concurrency test; gate idempotency; ModelTier seed presence. *AC:* all green; each fails red if its invariant is violated (negative controls). *deps:* all
- **V1 · e2e propose→done.** Playwright on local-docker-parity: flag a card → orchestrator proposes → gate confirms → graph executes → Aegis reviews → rollup → done; + frontier-down degradation path. *AC:* the full flow passes against the parity stack. *deps:* all
- **V2 · Docs.** `MODULE.md` per new module; ARD 0025/0026 status→accepted; `dependency-graph.md` + `system-map` updated; ops-cheatsheet (caps, headroom, frontier-lock, degradation). *AC:* docs match code (code-wins); governance doc tests pass. *deps:* all

## 4. Linearized execution order (valid topological sort)

```
F0 → F1 → F2                       (foundation)
   → S0 → S1, S2                   (spine + capacity + lease)
   → L0                            (leader)
   → G0 → D0, T0                   (gate + decomposition + triage)
   → R0 → E0 → E1 ; X0             (graph execution + executor extraction)
   → M0 → M1 → M2 → M3 ; M4 → M5   (orchestrator + frontier-lock + degradation)
   → C0 ; K0                       (executor first-class + cost)
   → API0 → UI0 → UI1              (surfaces)
   → V0, V1, V2                    (verification)
```

**Critical path:** `F1 → S0 → S1 → G0 → D0 → E0 → M0 → M1 → M2 → API0 → UI0 → V1`.
**First commit (this session):** **G0** — pure, fully-specified, zero prerequisites beyond the built `core/workflow-engine`; the highest-leverage deep module and the trust boundary. Its AC list is already the test spec.

## 5. Execution discipline

- TDD red→green→refactor per task; the AC list IS the test spec. Tests assert through the module interface (replace-don't-layer).
- Tiny Conventional Commits, one task each; **no** `Co-Authored-By`/AI trailers.
- `pnpm test:all` green before each merge; `api:parity` runs first (every new route needs an openapi spec).
- Architecture-critical core (gate, spine, model-tier, orchestrator) built on Opus; mechanical downstream (UI .tsx, route glue, docs) delegable per the build cadence with strict Opus review.
- Code-wins-over-docs: verify every `file:line` before citing; correct stale citations in a follow-up commit.
