# 0051: Content Idea Intake Step Service

Date: 2026-06-17
Status: Draft
Thread: The step-output map (0050) declared *what* each content step owes the run on completion, but nothing yet *produces* an output and runs through the durable job runner to be checked. This slice adds the first content **step service** — `idea-intake` — as a pure application service that validates manual input into a frozen `IdeaIntake` root record, plus the generic `ContentStepService` contract and a `createContentStepExecutor` bridge that runs any step service through the existing durable runner and verifies the produced output against `getContentStepOutput(stepId)`. It is the first step whose completion the runner actually checks, executed end-to-end on an in-memory job repository.

## Hook

A declared output map (0050) that no step ever exercises is a contract no one has signed. The map says `idea-intake` owes an `intake-record`; until a real step service produces one and a real runner accepts or rejects it, the binding is untested theory. The risk is the gap between "we declared the expected output" and "the producing boundary actually enforces it" — a gap where a step service can emit the wrong thing, or emit nothing, and the run advances anyway. This slice closes that gap for the first step: a service that produces the declared output, a bridge that refuses any output not matching `getContentStepOutput`, and an integration test that drives the whole thing through the durable runner on a real (in-memory) job repository.

## Product Stakes

Every prior content slice (0041–0050) was pure declaration: contracts, a workflow graph, an artifact envelope, an output map. None of them *ran*. A workflow platform whose steps never execute through its own runner has not proven its central claim — that the system, not the agent, owns sequence, validation, and verification. This slice is the first execution: `idea-intake` produces a validated record, and the runner leases the job, executes the step, verifies the output kind, and records success or a bounded failure.

It adds `src/opzava/modules/content/steps/`:

- `step-service.ts` — the generic `ContentStepService<TInput, TRecord>` contract (`stepId` + a pure `run(input)` returning `{ stepId, output, record }`), and `createContentStepExecutor`, which adapts any step service into a `RunnerExecutor` the durable worker can drive. The bridge parses the job payload, runs the service, asserts the produced `output` deep-equals `getContentStepOutput(service.stepId)`, and hands the result to an injected `onResult` sink. Every failure is converted into a single bounded `RunnerExecutionError('validation-error', …)`.
- `idea-intake-service.ts` — `ideaIntakeStepService`, the first concrete service: `run(input)` calls `parseIdeaIntake(input)` and returns the frozen `IdeaIntake` record bound to its declared `intake-record` output.

The point is the *boundary*: the runner verifies the step emitted its declared output type before the job is marked succeeded. A step that returns the wrong kind fails loudly, at the producing edge, not three steps downstream.

## Industry Counterfactual

The common shortcut is to let a step "just call the function and trust the return" — the orchestrator invokes a handler, gets back whatever object the handler chose to build, and assumes it is right. There is no check that the handler produced the *kind* of output the workflow declared for that step, and there is no uniform failure contract: one handler throws a raw provider error, another returns `null`, a third leaks a multi-kilobyte validation dump straight into the job's error record.

That last failure is not hypothetical. The first draft of this bridge propagated the raw `ZodError` message as the runner's `retryDecision.reason`; the runner's attempt schema caps that reason at 500 characters, and the unbounded zod dump blew the cap — the *failure-handling path itself* failed validation. The integration test caught it because the malformed-input case was run through the real runner, not a mock. The fix bounds the detail to 200 characters behind a stable `step <id> input validation failed:` prefix.

Opzava makes the step-service contract uniform and the bridge the single place where output verification and failure normalization happen. Each of the eleven steps will implement the same `ContentStepService` shape and run through the same executor, so output-kind verification and bounded-error handling are structural, not per-handler discipline that drifts.

## What We Built

We added `src/opzava/modules/content/steps/`:

- `step-service.ts`:
  - `ContentStepServiceResult<TRecord>` — `Readonly<{ stepId; output: ContentStepOutput; record: TRecord }>`
  - `ContentStepService<TInput, TRecord>` — `Readonly<{ stepId; run(input): ContentStepServiceResult<TRecord> }>`
  - `createContentStepExecutor({ service, parseInput, onResult }): RunnerExecutor` — parses `job.payload`, runs the service, asserts `result.output` deep-equals `getContentStepOutput(service.stepId)` (else `RunnerExecutionError('validation-error', …)`), then calls `onResult`. Any non-`RunnerExecutionError` thrown (e.g. a zod failure from `parseInput`/`run`) is rethrown as a bounded `RunnerExecutionError('validation-error', …)`; an existing `RunnerExecutionError` passes through unchanged.
- `idea-intake-service.ts`:
  - `ideaIntakeStepService: ContentStepService<unknown, IdeaIntake>` — `stepId: 'idea-intake'`, `run` validates via `parseIdeaIntake` and binds the record to `getContentStepOutput('idea-intake')`.

The module index re-exports `createContentStepExecutor`, `ContentStepService`, `ContentStepServiceResult`, and `ideaIntakeStepService` after the step-output map.

## What We Refused To Fake

We did not call a live provider; `idea-intake` is manual input, and the slice runs on the in-memory job repository — no network, no credentials, no live adapters (those remain intentionally disabled).

We did not let the failure path leak an unbounded error; the bridge bounds the validation detail so a step failure can never violate the runner's own attempt-record schema. We proved this by running the malformed-input case through the real runner, where the original unbounded message failed.

We did not silently accept a wrong output kind; the bridge compares the produced output against the declared `getContentStepOutput(stepId)` and rejects a mismatch, so the 0050 declaration is now *enforced* at the producing boundary for this step, not merely declared.

We did not change the runner's retry policy; a malformed-input job follows the existing `validation-error` retry path (failed-retry, then dead-letter on exhaustion) rather than inventing a bespoke terminal-failure rule in the step bridge. Whether input-validation errors should be non-retryable is a runner-policy question, deliberately left out of this slice.

We did not hand-author the implementation; the two source modules were generated by the local fleet (Qwen3-Coder and MiniMax-M3 independently, in agreement on the core logic), transcribed, then cross-reviewed (MiMo + Gemma) and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/step-service.ts`
- `src/opzava/modules/content/steps/step-service.test.ts`
- `src/opzava/modules/content/steps/idea-intake-service.ts`
- `src/opzava/modules/content/steps/idea-intake-service.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `ideaIntakeStepService.run(validInput)` returns the validated `IdeaIntake` record and the `{ kind: 'intake-record', recordType: 'idea-intake' }` output; invalid input throws (zod)
- INTEGRATION through the durable runner: a queued job carrying valid idea-intake input is leased, executed via `createContentStepExecutor`, and recorded `succeeded`; the captured result holds the validated record and the declared output
- INTEGRATION failure path: a job with malformed payload drives the worker to `failed-retry` and leaves the job `queued` for retry, with the bounded validation error fitting the attempt schema's 500-char reason cap

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 4/4 across 2 files (failed before implementation: module "./step-service" unresolvable; then failed on the malformed-input case until the error message was bounded)
node_modules/.bin/vitest run src/opzava: passed 332/332 across 55 files (+4 over the 328 baseline)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/check-plan.test.mjs: passed 61/61
```

The first content step now executes end-to-end through the durable runner, and the runner verifies its output against the declared step-output binding before recording success.

## The Automation Lesson

The bridge is the place to centralize what every step must do identically, and the value of a *real* integration test is that it exercises the boundaries a mock would paper over. Running the malformed-input case through the actual runner surfaced a defect in the failure-handling path itself — an unbounded error message that violated the runner's own schema — which a unit test against a stubbed runner would have missed entirely. The lesson for the remaining ten step services: each must run through this same executor and be tested through the real runner, so output-kind verification and bounded failure handling stay structural. The next layer to close is the *derived* case — a step whose output is an `artifact` envelope (0049), not a root record — where the produced payload must additionally be schema-valid and lineage-complete before the runner accepts it.

## Next Case Study Thread

This adds the first step service and the runner bridge that verifies its declared output.

The next build thread should:

- add the second content **step service** — `keyword-research` — executed through the durable runner as the first *derived* step, consuming the `idea-intake` record and emitting a `keyword-research` `Artifact` envelope (per 0049) on a mock keyword provider, the first step whose completion the runner verifies against an `{ kind: 'artifact', artifactType: 'keyword-research' }` output rather than an intake record.
