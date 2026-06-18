# 0068: Content Workflow Recording Executor

Date: 2026-06-17
Status: Draft
Thread: We rewired the content workflow so provider-call steps run through the Layer-7 recording adapters built in 0063-0067. A full content WorkflowRun now emits a complete external-call, cost, and audit operational trail.

## Hook
AI workflows historically act as black boxes. You trigger a pipeline, wait, and get an artifact. If something breaks or costs spike, you are left reading fragmented console logs. We wired the provider boundary directly into the execution path. The workflow is no longer just generating content; it is generating its own definitive operational record.

## Product Stakes
Unobserved external calls are an unbounded liability. In content generation, costs accumulate per step and unverified payloads cause silent failures. We needed the 11-step content pipeline to output more than just a WordPress draft. It needed to produce an immutable, replayable trail of exactly what was asked of external models, what they returned, and what they cost. Without this, production automation is blind operation.

## Industry Counterfactual
Most platforms attempt retrospective observability. They wrap API calls in arbitrary logger functions or rely on developers to manually emit events. This creates drift. When a developer bypasses the logger, observability breaks. By routing the four critical provider-call steps through `executeProviderAdapterWithEvents`, we enforce structural observability. If the call didn't emit an operational event, it didn't happen.

## What We Built
We created `src/opzava/modules/content/workflow/content-workflow-recording-executor.ts` (+ `.test.ts`) and exported `runContentWorkflowWithRecording`, `createMockContentWorkflowProviderAdapters`, and types `ContentWorkflowProviderAdapters` / `ContentWorkflowRecordingDeps` from `src/opzava/modules/content/index.ts`.

The executor introduces a new execution topology:
- `runContentWorkflowWithRecording(deps, rawIdea)` runs the 11-step pipeline in graph order.
- For the four provider-call steps (`keyword-research`, `source-capture`, `article-draft`, `fact-check`), it calls the matching `run<Step>ProviderCall`. This routes the call through the platform's `executeProviderAdapterWithEvents`.
- The platform executes the adapter, emits external-call, cost, and audit operational events to `deps.eventSink`, and returns the recorded provider output.
- This recorded output feeds back into the standard step service via a constant provider to build the artifact.
- Non-provider steps (`seo-brief`, `outline`, `brand-review`, `anti-slop-review`, `human-approval`, `wordpress-draft`) run as before. The `human-approval` gate still halts execution before the external action if not granted.

We also fixed a critical serialization bug across the four provider adapters. Adapters serialize output to `JsonValue` and previously set absent optional fields to `?? null`. Contract parsers expect `optional/undefined`, not `null`. Omitting these fields allows the recorded provider output to round-trip cleanly back through the contract parsers into the step service.

## What We Refused To Fake
- **Double-calling providers:** We did not call providers twice just to capture logs. The single recorded provider output feeds the artifact directly.
- **Ignoring serialization drift:** We did not let null-coerced output silently corrupt the round-trip. We fixed the adapters to strictly omit absent fields.
- **Bypassing the approval gate:** We enforced the existing `human-approval` halt.
- **Mutating standard steps:** We did not alter non-provider-call steps.
- **Hardcoding live behavior:** Providers and adapters are strictly injected via `deps`.

## Evidence
This is currently a mock-only implementation, preparing for a live cutover. A full run is now observable as a durable operational trail: exactly 4 external-call events, 4 cost events, and 4 audit events (12 total). The executor was fleet-built using our gpt build-agent and independently verified.

## Validation
Targeted tests confirm the executor topology:
- A full run produces a draft-only WordPress request with all correct artifact types and an approved approval state.
- The event sink captures exactly 12 operational events (4 external-call, 4 cost, 4 audit).
- A rejected human approval makes `runContentWorkflowWithRecording` reject with `/approval not granted/`, ensuring no external action occurs.

Test suite results:
- `vitest run src/opzava/modules/content` = 197/197 across 45 files
- Full repo `vitest run` = 1488/1488 across 183 files
- `tsc` clean
- `eslint` 0 errors
- `node --test test/*.test.mjs` passed

## The Automation Lesson
Observability cannot be an afterthought applied at the edges of a system. It must be woven into the execution graph. When you serialize workflow data through strict contract boundaries, you are forced to confront impedance mismatches—like `null` versus `undefined`—immediately. Fixing these edge cases at the adapter level ensures the entire system remains mathematically replayable.

## Next Case Study Thread
Next, we will add a mock WordPress PUBLISHING provider adapter (`ProviderProfile` kind 'publishing'). This will route the terminal `wordpress-draft` step's external action through the platform provider boundary on a mock. It will be the first non-content-generation provider, paving the way toward the live WordPress draft adapter (which will be gated on admin-config, secret-redaction, and idempotency tests).
