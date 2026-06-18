# 0029: Provider Execution Cost Events Before Live Wiring

Date: 2026-06-16
Status: Draft
Thread: Turning an executed live provider action into a redacted cost operational event before any cost wiring touches the execution boundary.

## Hook

A control plane that executes real provider actions but cannot say what they cost is half-blind.

Opzava now turns an executed provider action into a durable, redacted cost operational event without persisting it, executing anything, or leaking the payload that produced it.

## Product Stakes

Slice 0028 built the boundary that executes an approved live action exactly once and returns its external-call record. That boundary knows the call happened, but it does not yet record what the call consumed.

This slice supplies the cost receipt: a typed record of the units a caller measured and the cost the caller estimated, carried on the existing runner operational-event contract. Operators get spend evidence per provider action without the slice inventing pricing or storing the prompt.

## Industry Counterfactual

The common shortcut is to compute cost inside the execution path by reaching for a hard-coded price table and multiplying it by whatever the provider returned.

That buries a pricing model in the hot path, drifts the moment a provider changes rates, and tends to log the raw usage object next to the request payload.

Opzava refuses to invent pricing. The factory records only the units and the cost the caller already measured, on the same `cost` operational-event kind the repository contract already supports, with no path back to the prompt.

## What We Built

We added `createProviderExecutionCostOperationalEvent`.

The factory:

- accepts caller-supplied event identity (`recordId`, `costEventId`, `actorId`, `occurredAt`) and caller-supplied correlation fields (`requestId`, `providerId`, `operation`, `workflowRunId`, `stepRunId`, `externalCallId`)
- accepts caller-measured cost-bearing data: a `units` map, an `estimatedCostCents`, an optional `actualCostCents`, and a `currency`
- builds a `CostEvent` through the existing `costs/contracts.ts` parse function, rebuilding a fresh allow-listed `units` map rather than spreading caller input
- wraps that `CostEvent` in a `cost`-kind operational event through the existing `parseOperationalEventStorageRecord`, with `recordedAt` and `occurredAt` aligned so the repository timestamp index validates
- returns a frozen record and is deterministic for identical inputs
- owns no persistence, no clock, no id generation, and no pricing

## What We Refused To Fake

We did not invent a pricing model; only caller-measured units and caller-supplied cents are recorded.

We did not execute a provider adapter or import the execution path.

We did not persist the event.

We did not read environment variables or files.

We did not generate event ids, cost ids, or timestamps.

We did not log the action.

We did not store prompts, payloads, request summaries beyond ids, credentials, headers, or secret references; the `CostEvent` contract has no field that could carry them.

## Evidence

Files changed:

- `src/opzava/platform/providers/cost-events.ts`
- `src/opzava/platform/providers/cost-events.test.ts`
- `test/check-plan.test.mjs`
- `docs/case-study/0029-provider-execution-cost-events.md`
- `docs/case-study/README.md`

The tests cover:

- an executed result produces a parseable `cost` operational event carrying only allow-listed fields
- a caller-supplied `actualCostCents` is recorded while the default is `null`
- a serialized record never contains a sample prompt, secret id, credential reference, header, or request summary
- identical inputs produce deeply equal output
- the returned record is frozen
- the module source does not read files or env, generate ids, call fetch, use nondeterministic time, or import the execution path

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/cost-events.test.ts: failed before implementation because ./cost-events did not exist
node_modules/.bin/vitest run src/opzava/platform/providers/cost-events.test.ts: passed 6/6 after implementation
node --test test/check-plan.test.mjs: passed 40/40
node --test test/folder-structure.test.mjs: passed 1/1
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (both new files): passed with 0 errors
node_modules/.bin/vitest run (full suite): passed 133 files / 1265 tests
```

The implementation was written test-first under the sanctioned orchestrator gate override after a fleet build-agent reported success but did not persist the file; every gate was then verified independently.

## The Automation Lesson

Cost belongs on a receipt, not in the hot path. The execution boundary should know an action happened; a separate pure factory should turn measured usage into a redacted spend record. Keeping pricing out of the boundary keeps the boundary honest and keeps the cost record free of the payload that produced it.

## Next Case Study Thread

The next build thread should record the audit event for an executed live action and then wire the 0027 approval guard's allow path into the 0028 execution boundary:

- an executed live action appends a redacted audit operational event alongside its external-call and cost events
- the 0027 guard allow path calls `executeApprovedLiveProviderActionOnce` instead of returning `live-execution-disabled`
- the external-call, cost, and audit events are appended through the existing operational-event sink in one execution flow
- live execution stays gated behind validated admin settings and resolved secret references
