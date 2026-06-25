# ARD 0014 — Shared Workflow Engine (graph-based execution core)

- **Status:** Proposed
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0007](0007-engine-separation-and-surface-unification.md) (engines stay separate), [ARD 0011](0011-single-orchestrator-execution-model.md) (runner as canonical path), [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md), [MASTER-PLAN](../architecture/orchestration-hardening/MASTER-PLAN.md) Track C, [CONTEXT.md](../../CONTEXT.md) Orchestration engine terms

## Context

A teardown of four production-hardened orchestration platforms — **Haystack**, **Sim Studio**, **CrewAI**, and **Dify** (whose engine Dify itself extracted into a standalone package, `graphon`) — found that all four converge on the same architecture to solve the two problems Opzava's review flagged as its biggest structural risks:

1. **Two unreconciled execution engines** — the inherited scheduler-dispatch (kanban `tasks` → `assigned` → `in_progress` → `review` → `done`, with the `Aegis` quality gate) and the durable runner (`Job` → `Attempt` → `DeadLetter`, used today only for campaign-send). They share no execution abstraction; the 1790-line `task-dispatch.ts` god-module mediates ad-hoc.
2. **No declarative workflow model** — the content pipeline is a hard-coded linear chain (`content-workflow.ts`); the task lifecycle is an imperative state machine. Neither is a graph.

Every reference platform persists the workflow as a **directed graph of typed steps** and runs it through **one graph executor** (Haystack: typed-component DAG + priority scheduler; Sim: SerializedWorkflow + DAGExecutor; CrewAI: Flow state-machine; Dify/graphon: edge-state DAG). Dify's extraction of `graphon` is the strongest signal: the engine should be **a separable library the host calls**, not fused to either host surface.

ARD 0007 is the governing constraint: the two engines stay separate (unified at the read surface, not merged). This ARD does **not** merge them. It introduces a **third, shared core** that both can express graphs against — the unification surface ARD 0011 anticipates ("runner as canonical path"), now with a battle-tested shape.

## Decision

Build `src/opzava/core/workflow-engine/` — a framework-independent graph-execution core (pure `core/`, no `platform/`/`modules/`/`src/lib` imports; layering-guarded) consisting of five deep modules:

1. **`StepContract`** — the typed unit of work: declared `inputs`/`outputs` (Zod schemas) + `run(ctx): Promise<NodeRunResult> | AsyncGenerator<Event>`. A `Step` is a `StepContract` instance; a `StepRun` is one execution. This is the single shape both engines speak — they stop diverging because the contract is the only place the shape is defined. (Haystack's 2.0 lesson: validate connections at *wiring time*, not runtime.)
2. **`Engine`** — the edge-state DAG scheduler: per-`Edge` state `unknown | taken | skipped`; a Step is ready iff ≥1 in-edge `taken` AND 0 in-edge `unknown`; on success mark out-edges `taken` + enqueue newly-ready, un-chosen branches `skipped`. One mechanism yields parallelism + branching + skip-propagation. (Dify graphon's `GraphStateManager` — the cleanest of the four.) In TS this is an async-generator ready-set (`Promise.all` over ready Steps), not worker-threads.
3. **`RunContext`** — the inter-step data: a `Map<stepId, Map<varName, Segment>>` + a `{{#stepId.varName#}}` template resolver with reserved scopes (`sys`, `env`→AdminConfig/SecretReference). A StepRun reads prior outputs + writes its own. Replaces the ad-hoc context-passing in `reconcileDeferredTaskCompletions`.
4. **`ReviewStrategy`** — the reusable quality-judge contract: `evaluate(output): { valid, feedback?, modifiedParams? }`. `Aegis` and the content-quality rule-gates become ReviewStrategy adapters. Generalizes the approve/reject gate with a third outcome ("modify params + tell the agent why"). Two real adapters (LLM judge + rule gates) = a real seam.
5. **`EngineLayer`** — the cross-cutting hook array (`onStepStart`/`onStepEnd`/`onGraphEnd`): persistence, quota/cost limits, audit, observability, tracing bolt on as layers without coupling to the engine. This is the decomposition path for the god-module: routing/dispatch/review/reconcile/cost-accounting become Steps + Layers around the Engine, not 1790 lines in one file.

Both engines depend on `core/workflow-engine/` (inward, per the layering guard); neither depends on the other. The durable runner remains the **persistence + lease authority**; the Engine calls into it via a `snapshot`/`resume` seam (Dify's `PauseStatePersistenceLayer` for HITL/approval pause-resume; the runner's existing lease-recovery for job-level restart). **Generic crash-recovery is explicitly out of scope** — none of the four reference platforms have it; HITL-pause + lease-retry covers the real need.

## Consequences

- **Positive:** one execution abstraction (the dual-engine drift ends); the god-module decomposes into Steps + Layers (each independently testable through its `StepContract`); Aegis/cost/MCP get clean seams; workflows become editable persisted graphs (admin-UI-editable `WorkflowGraph` JSON); the four-reference convergence is strong evidence the shape is right.
- **Negative:** a new core module to build + maintain; the migration is multi-step (port Aegis → ReviewStrategy; express the content pipeline as a graph; express the task lifecycle as a graph; then retire the god-module's replaced responsibilities); `WorkflowGraph` persistence adds a schema (a `graph` JSON column / table).
- **Neutral:** ARD 0007 holds — engines stay separate; this adds the shared core they both call, it does not merge them. The inherited `task` state machine continues as a *projection* of graph state for the human-facing kanban.

## Alternatives considered

- **Merge the two engines.** Rejected: violates ARD 0007 (separation by design) and Dify's own lesson (engine should be separable from host). High blast radius, low marginal benefit over the shared-core approach.
- **Extend the durable runner to be the workflow engine.** Rejected as the primary path: the runner is a job/lease/retry system (one altitude); the graph executor is a different concern (scheduling/data-flow). They compose (engine calls runner per-Step), they don't subsume. (Track C3 of the MASTER-PLAN keeps the runner as the executor the Engine invokes.)
- **Keep the status quo (two engines + god-module).** Rejected: the god-module is 1790 lines of entangled responsibilities; the engines drift; no graph model. The four-reference convergence shows the status quo is the outlier.

## References

- Cross-repo teardown: Haystack (`@component` sockets + priority scheduler + Agent-as-Tool); Sim (`SerializedWorkflow` + DAGBuilder/Engine/HandlerRegistry + error-as-edge + resume_queue); CrewAI (`LLMGuardrail` + role/goal/backstory + manager-agent + Flow); Dify/graphon (edge-state scheduler + VariablePool + `ModelRuntime` Protocol + Layering + `trace(info)` + PauseStatePersistenceLayer).
- `CONTEXT.md` Orchestration engine terms: `Step`, `WorkflowGraph`, `Edge`/`EdgeHandle`, `RunContext`, `ReviewStrategy`, `ModelInvocation`.
- MASTER-PLAN Track C (god-module split + runner canonical path); B2 (Aegis → ReviewStrategy).
