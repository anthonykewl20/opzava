<!-- agent-context: read this before editing the module -->

# core/workflows

## Purpose
Defines the versioned contract for Opzava workflow *definitions*: a Zod schema that validates a step graph, plus a parse helper. It is a pure schema domain — **it does not execute workflows and has no run/step-run state machine**. The durable execution model lives in `platform/runner` (`Job`/`Attempt`).

## Public surface
This module has **no `index.ts`**; `src/opzava/core/workflows/contracts.ts` is the public surface and is truth. The directory contains only `contracts.ts` and `contracts.test.ts`. 3 exports, grouped:

- **Constants**
  - `WORKFLOW_CONTRACT_SCHEMA_VERSION` (`1` as const) — pinned by `z.literal` in the definition schema.
- **Schemas** (Zod)
  - `workflowDefinitionSchema` — `.strict()` + `.superRefine()` (the DAG guard; see Invariants).
- **Types** (`Readonly<z.infer<...>>`)
  - `WorkflowDefinition`.
- **Parse/factory functions** (`Object.freeze(...)` the result — instances are immutable)
  - `parseWorkflowDefinition(input: unknown): WorkflowDefinition`

Anything not listed here (the internal `hasCycle`/`visitStep` helpers and the `workflowStepSchema`) is internal.

## Dependencies
- **Outbound**: only `zod`. Pure domain — no `core/secrets`, no platform, no I/O. This is the dependency-floor: it must stay importable by every layer without pulling infra.
- **Inbound**: a single production consumer — `src/opzava/modules/content/workflow/content-workflow.ts` imports `WORKFLOW_CONTRACT_SCHEMA_VERSION`, `parseWorkflowDefinition`, and the `WorkflowDefinition` type to build and validate the content step graph. (`content-workflow.test.ts` also imports the version constant.) Layering: this is a `core` domain consumed inward by `modules/content` only (Dependency Rule, `docs/architecture/dependency-graph.md`).

## Invariants
1. **Every validated definition is a well-formed, acyclic DAG with no dangling edges.** `workflowDefinitionSchema.superRefine` rejects, in order: (a) duplicate `stepId`; (b) `entryStepId` not present in `steps`; (c) any `nextStepIds` element not present in `steps`; (d) any cycle (three-color DFS via `hasCycle`/`visitStep`). Each produces a distinct custom issue (`duplicate step ID`, `entry step points at an unknown step`, `unknown step edge`, `workflow step graph contains a cycle`) — these messages are asserted by `contracts.test.ts`, so do not reword them.
2. **`.strict()` on the definition object schema.** Unknown keys are a parse error — adding a field to a workflow definition requires a matching schema change, not just a caller change.
3. **Parsed instances are frozen.** `parseWorkflowDefinition` returns `Object.freeze(...)`; the type is `Readonly<...>`. Editors must not mutate in place — return a new instance.

## Harmony rules
- **Which engine**: opzava canonical (`src/opzava`). This is a core domain under `src/opzava/core/` with zero `src/lib` imports — fully on the opzava side of the ARD 0007 boundary (`test/engine-boundary.test.mjs`).
- **Removed dead surface**: the run/step-run machinery was **dead surface** (zero production consumers) and has been **removed**. `parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` and their schemas/types/transition tables no longer exist; only `parseWorkflowDefinition` is wired. Do not re-introduce a run/step-run state machine here — the runner's `Job`/`Attempt` is the execution model (see the RESOLVED guardrail below).

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`:

> ## ✅ RESOLVED — core `WorkflowRun`/`StepRun` machinery was dead surface, now removed
>
> `parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` in
> `src/opzava/core/workflows/contracts.ts` **had zero production consumers** (only their own
> `.test.ts`) and have been **removed**. `parseWorkflowDefinition` is the only wired export — used
> solely by `src/opzava/modules/content/workflow/content-workflow.ts`.
>
> **Guardrail (core/workflows MODULE.md):** do not re-introduce a run/step-run transition state
> machine here assuming it drives execution — it does not. The runner's `Job`/`Attempt` is the
> execution model.

Related (adjoining subsystem, not in this file, but bounds this module's role):

> ## ⚠️ PARTIAL — "the durable runner was built but is unused"
>
> The durable runner IS used — but only by the **campaign-send subsystem**, not as a general
> per-step runner across the whole content workflow.
>
> **Guardrail (runner MODULE.md):** `Job`/`Attempt` is the real durable-execution model for campaign
> sends; the broader workflow steps do not yet run through it. Do not assume every workflow step is
> durable.
