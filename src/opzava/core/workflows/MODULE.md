<!-- agent-context: read this before editing the module -->

# core/workflows

## Purpose
Defines the versioned contract for Opzava workflow *definitions* and (provisionally) workflow runs and step runs: Zod schemas that validate a step graph, plus parse/transition helpers. It is a pure schema/state-machine domain — **it does not execute workflows**. The durable execution model lives in `platform/runner` (`Job`/`Attempt`).

## Public surface
This module has **no `index.ts`**; `src/opzava/core/workflows/contracts.ts` is the public surface and is truth. The directory contains only `contracts.ts` and `contracts.test.ts`. 14 exports, grouped:

- **Constants**
  - `WORKFLOW_CONTRACT_SCHEMA_VERSION` (`1` as const) — pinned by `z.literal` in every schema.
- **Schemas** (Zod)
  - `workflowDefinitionSchema` — `.strict()` + `.superRefine()` (the DAG guard; see Invariants).
  - `workflowRunSchema`, `stepRunSchema` — `.strict()`.
  - `workflowRunStatusSchema` (`queued | running | blocked | succeeded | failed | cancelled`).
  - `stepRunStatusSchema` (`pending | running | blocked | succeeded | failed | skipped`).
- **Types** (all `Readonly<z.infer<...>>`)
  - `WorkflowDefinition`, `WorkflowRun`, `StepRun`, `WorkflowRunStatus`, `StepRunStatus`.
- **Parse/factory functions** (all `Object.freeze(...)` the result — instances are immutable)
  - `parseWorkflowDefinition(input: unknown): WorkflowDefinition`
  - `parseWorkflowRun(input: unknown): WorkflowRun`
  - `parseStepRun(input: unknown): StepRun`
- **State-machine transitions** (throw on illegal edge)
  - `transitionWorkflowRunStatus(run, nextStatus): WorkflowRun`
  - `transitionStepRunStatus(stepRun, nextStatus): StepRun`

Anything not listed here (the internal `hasCycle`/`visitStep` helpers and the `workflowStepSchema`/transition tables) is internal.

## Dependencies
- **Outbound**: only `zod`. Pure domain — no `core/secrets`, no platform, no I/O. This is the dependency-floor: it must stay importable by every layer without pulling infra.
- **Inbound**: a single production consumer — `src/opzava/modules/content/workflow/content-workflow.ts` imports `WORKFLOW_CONTRACT_SCHEMA_VERSION`, `parseWorkflowDefinition`, and the `WorkflowDefinition` type to build and validate the content step graph. (`content-workflow.test.ts` also imports the version constant.) The `transitionWorkflowRunStatus` / `transitionStepRunStatus` / `parseWorkflowRun` / `parseStepRun` exports have **no production callers** (see Editor guardrails). Layering: this is a `core` domain consumed inward by `modules/content` only (Dependency Rule, `docs/architecture/dependency-graph.md`).

## Invariants
1. **Every validated definition is a well-formed, acyclic DAG with no dangling edges.** `workflowDefinitionSchema.superRefine` rejects, in order: (a) duplicate `stepId`; (b) `entryStepId` not present in `steps`; (c) any `nextStepIds` element not present in `steps`; (d) any cycle (three-color DFS via `hasCycle`/`visitStep`). Each produces a distinct custom issue (`duplicate step ID`, `entry step points at an unknown step`, `unknown step edge`, `workflow step graph contains a cycle`) — these messages are asserted by `contracts.test.ts`, so do not reword them.
2. **`.strict()` on all three object schemas.** Unknown keys are a parse error — adding a field to a workflow definition/run/step-run requires a matching schema change, not just a caller change.
3. **Parsed/transitioned instances are frozen.** `parseWorkflowDefinition/Run/StepRun` and both `transition*` helpers return `Object.freeze(...)`; types are `Readonly<...>`. Editors must not mutate in place — return a new instance.
4. **Transitions are a closed enum per status.** `workflowRunTransitions`/`stepRunTransitions` are `satisfies Record<Status, readonly Status[]>`; terminal states (`succeeded`/`failed`/`cancelled` for runs; `succeeded`/`failed`/`skipped` for steps) allow **no** outgoing edge. `transitionWorkflowRunStatus`/`transitionStepRunStatus` throw `Error('invalid {workflow,step} transition: ${from} -> ${to}')` on any non-listed move. Note `blocked -> running` is allowed; `blocked -> succeeded` is **not** (a blocked run must resume via `running` first).

## Harmony rules
- **Which engine**: opzava canonical (`src/opzava`). This is a core domain under `src/opzava/core/` with zero `src/lib` imports — fully on the opzava side of the ARD 0007 boundary (`test/engine-boundary.test.mjs`).
- **Dead-surface / dead-wired**: the run/step-run machinery is **dead surface**. `parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` have zero production consumers; only `parseWorkflowDefinition` is wired. Do not extend the transition state machine assuming it drives execution — the runner's `Job`/`Attempt` is the execution model (see the CONFIRMED guardrail below).

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`:

> ## ✅ CONFIRMED — core `WorkflowRun`/`StepRun` machinery is dead surface
>
> `parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` in
> `src/opzava/core/workflows/contracts.ts` have **zero production consumers** (only their own
> `.test.ts`). `parseWorkflowDefinition` is the only wired export — used solely by
> `src/opzava/modules/content/workflow/content-workflow.ts:7,117`.
>
> **Guardrail (core/workflows MODULE.md):** do not "fix" or extend the run/step-run transition
> machinery assuming it drives execution — it does not. The runner's `Job`/`Attempt` is the execution
> model.

Related (adjoining subsystem, not in this file, but bounds this module's role):

> ## ⚠️ PARTIAL — "the durable runner was built but is unused"
>
> The durable runner IS used — but only by the **campaign-send subsystem**, not as a general
> per-step runner across the whole content workflow.
>
> **Guardrail (runner MODULE.md):** `Job`/`Attempt` is the real durable-execution model for campaign
> sends; the broader workflow steps do not yet run through it. Do not assume every workflow step is
> durable.
