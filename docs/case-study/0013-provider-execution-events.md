# 0013: Provider Execution Events Before Live Providers

Date: 2026-06-15
Status: Draft
Thread: Persisting redacted external-call events from provider execution without calling live providers.

## Hook

A provider call that cannot be audited is not ready to be live.

It is just a side effect.

## Product Stakes

Opzava already has provider adapter contracts that reject secrets in persisted summaries. The next risk is execution plumbing that calls an adapter but forgets to record what happened.

If provider execution is not connected to durable external-call events, operators lose the idempotency key, retry attempt, timeout budget, and safe request/response summaries needed to debug the workflow.

## Industry Counterfactual

The common shortcut is to wrap a provider SDK call and return its output.

That leaves observability as a later task. Later usually means after the first incident.

Opzava now emits a redacted external-call event as part of the provider execution wrapper.

## What We Built

We added `executeProviderAdapterWithEvents`.

The wrapper:

- executes a typed `ProviderAdapter`
- validates the returned `ProviderAdapterResult`
- builds an `ExternalCallRecord` from the request and result
- appends the record as an `external-call` operational event
- stores only safe summaries, not credentials or raw provider error messages

The tests use fake adapters only. No live provider call was added.

## What We Refused To Fake

We did not call a live provider.

We did not add SDK-specific behavior.

We did not persist raw provider responses.

We did not persist raw provider error messages.

We did not add tracing, metrics, dashboards, or admin settings in this slice.

This slice only connects provider execution to the existing durable operational event store.

## Evidence

Files changed:

- `src/opzava/platform/providers/execution.ts`
- `src/opzava/platform/providers/execution.test.ts`

The tests cover:

- successful provider execution persists an `external-call` operational event
- persisted event timing follows the external call finish time
- persisted event includes provider id, operation, idempotency key, retry metadata, and safe summaries
- serialized events do not contain credential reference IDs or credential purposes
- failed provider results persist only `errorClass`, not raw provider error text
- thrown adapter errors persist a safe failed event instead of leaking raw provider exception text
- adapters that ignore abort signals are cut off by `request.timeoutMs` and persist a timed-out event
- provider timeout aborts the adapter-visible signal

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/execution.test.ts: failed before implementation because ./execution did not exist
pnpm vitest run src/opzava/platform/providers/execution.test.ts: passed 2/2 after implementation
pnpm vitest run src/opzava/platform/providers/execution.test.ts: failed after MMX review on thrown-adapter and ignored-signal cases
pnpm vitest run src/opzava/platform/providers/execution.test.ts: passed 4/4 after timeout/error normalization
pnpm vitest run src/opzava/platform/providers/*.test.ts src/opzava/platform/runner/repository-contracts.test.ts src/opzava/platform/runner/repository.test.ts: passed 24/24
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 23/23
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 33/33
pnpm test: passed 117 files / 1163 tests
```

MMX review flagged that the first wrapper only forwarded `AbortSignal`; it did not enforce the provider request timeout or persist an event when an adapter threw. We added those red/green cases before moving on.

## The Automation Lesson

Provider execution should produce its receipt before it becomes real.

The receipt must be safe enough to keep and specific enough to explain what happened.

## Next Case Study Thread

The next build thread should move toward long-running execution control:

- daemon polling cadence
- graceful shutdown for runner loops
- admin-managed retry and timeout settings
- provider-specific retry policy selection
- sustained multi-worker contention and throughput measurements
