# 0028: Live Provider Execution Boundary With Idempotency

Date: 2026-06-16
Status: Draft
Thread: Building the execution boundary that an approved live action reaches, so a retried approval cannot fire a duplicate external action.

## Hook

The second-most dangerous moment in an automation tool is the retry after the first real action already happened.

Opzava now has the boundary that executes an approved live provider action exactly once and returns the prior result instead of acting again.

## Product Stakes

Slice 0027 proved that a granted approval still stops at `live-execution-disabled` because no execution boundary existed. This slice supplies that boundary without wiring it into the guard yet.

The product risk it removes is the classic double-charge, double-publish, double-send failure: a worker retries, the approval is still valid, and the system performs the same irreversible external action twice. The boundary refuses that by consulting an idempotency record before it touches the adapter.

## Industry Counterfactual

The common shortcut is to make external calls idempotent "later," after the integration already works, usually by hoping the provider deduplicates.

That pushes a correctness guarantee onto a third party and leaves a window where retries duplicate real actions.

Opzava makes the idempotency check a precondition of execution, proven with a fake adapter before any live provider is ever enabled.

## What We Built

We added `executeApprovedLiveProviderActionOnce`.

The boundary:

- requires a `ProviderExecutionApprovalGrant`, and rejects a grant whose provider or operation does not match the request it authorizes
- consults an injected `findExistingExternalCall` lookup keyed by the request idempotency key
- returns an `already-executed` outcome carrying the prior `ExternalCallRecord` without invoking the adapter when a record exists
- executes the adapter exactly once through the existing `executeProviderAdapterWithEvents` path when no prior record exists, returning an `executed` outcome
- owns no persistence, no lookup logic, and no clock of its own

## What We Refused To Fake

We did not enable a live provider by default; the adapter under test is a fake.

We did not implement the idempotency store; it is an injected port.

We did not wire this boundary into the approval guard yet.

We did not generate idempotency keys, external-call ids, or timestamps.

We did not read environment variables or files.

We did not log the action or its payload.

## Evidence

Files changed:

- `src/opzava/platform/providers/live-execution-runtime.ts`
- `src/opzava/platform/providers/live-execution-runtime.test.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a prior external call returns `already-executed` with that record, invoking the adapter zero times and appending zero events
- a missing prior call executes the adapter exactly once and appends exactly one `external-call` operational event
- a grant whose provider does not match the request returns `grant-provider-mismatch` and never reaches the idempotency lookup or the adapter
- a grant whose operation does not match the request returns `grant-operation-mismatch` and never reaches the adapter
- identical already-executed inputs produce deeply equal results
- the module source does not read files or env, generate ids, call fetch, or use nondeterministic time

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/live-execution-runtime.test.ts: failed before implementation because ./live-execution-runtime did not exist
node_modules/.bin/vitest run src/opzava/platform/providers/live-execution-runtime.test.ts: passed 6/6 after implementation
node --test test/check-plan.test.mjs: passed 38/38
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (both new files): passed with 0 errors
node --test test/*.test.mjs: passed 48/48
vitest run (full suite): passed 132 files / 1259 tests
```

This slice was implemented directly against a fully specified contract after two fleet build attempts failed to persist files; the orchestrator wrote it under the sanctioned gate override, test-first, and verified every gate independently.

## The Automation Lesson

Approval answers "may this happen." Idempotency answers "did this already happen." A trustworthy control plane needs both, and the second one has to live at the execution boundary, not in the provider's hope of deduplication.

## Next Case Study Thread

The next build thread should wire the 0027 approval guard's allow path into this boundary and record the live action as cost and audit events:

- the guard allow path calls `executeApprovedLiveProviderActionOnce` instead of returning `live-execution-disabled`
- executed live actions append a redacted cost event and an audit event alongside the external-call event
- the idempotency lookup is backed by a real query over stored external-call records
- live execution stays gated behind validated admin settings and resolved secret references
