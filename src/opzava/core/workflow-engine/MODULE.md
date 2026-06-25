<!-- agent-context: read this before editing the module -->

# core/workflow-engine — Shared Graph Execution Core (ARD 0014)

## Purpose
The framework-independent edge-state DAG scheduler + typed step contracts that BOTH Opzava
engines (the inherited scheduler-dispatch AND the durable runner) compile workflows to +
execute against. Pure `core/` — no `platform/`/`modules/`/`src/lib` imports (layering-guarded).
This is the unification surface ARD 0011 anticipates, battle-tested by the Haystack/Sim/CrewAI/
Dify teardown (all four converge on this shape; Dify extracted its own engine into `graphon`).

## Public surface
- `contracts.ts` — `StepContract`, `NodeRunResult`, `StepRunContext`, `StepSocket`,
  `WorkflowGraph` (+ Zod `workflowGraphSchema`), `StepEdge`/`EdgeHandle`/`EdgeState`/`edgeKey`,
  `ReviewStrategy`/`ReviewVerdict`, `EngineLayer`, `validateGraph`, `EDGE_HANDLE`, `EDGE_STATE`.
- `engine.ts` — `executeGraph(graph, opts): AsyncGenerator<EngineEvent>` (the edge-state
  scheduler), `EngineOptions`, `EngineEvent`.
- `run-context.ts` — `RunContext` (the inter-step data: `set`/`get`/`getStep`/`resolve`/
  `resolveTemplate` with `{{#scope.name#}}` + reserved `sys`/`env` scopes).

## Invariants
1. **Pure `core/`.** No `platform/`, `modules/`, or `src/lib` imports (architecture test).
   DB/clock/provider are dependency-injected via `StepContract.run` + `EngineLayer` + `RunContext`.
2. **Edge-state is the sole scheduling mechanism.** A Step is ready iff ≥1 in-edge `taken`
   AND 0 in-edge `unknown`. One mechanism = parallelism + branching + skip-propagation.
   Do not add a second scheduler path.
3. **The Engine is primitive.** It knows nothing about WHAT a Step does (that's the
   `StepContract`). Persistence, quota, cost, audit, tracing are `EngineLayer`s, not engine
   internals. The runner is the executor the Engine invokes per-Step (via the StepContract).
4. **The interface is the test surface.** Every module is testable through its interface
   (`executeGraph` + `RunContext` + `StepContract.run`), not its internals.
5. **`StepContract` is the single shape.** Both engines compile to `WorkflowGraph` + provide
   `StepContract` adapters; they stop diverging because the contract is the only place the
   step shape is defined. Two+ adapters per seam = a real seam (codebase-design).

## Editor guardrails
- Do NOT add a `src/lib` or `platform/ import — breaks the layering guard + engine boundary.
- Do NOT add provider/DB/persistence logic to the Engine — use an `EngineLayer` or inject via
  the `StepContract`.
- Conditional branching is DATA (`edgeSourceHandle` on `NodeRunResult`), not a control-flow
  Step type. Do not add if/else polymorphism to the Engine.
- ReviewStrategy is a SEAM (Aegis + rule gates are adapters); do not hardcode Aegis into it.
