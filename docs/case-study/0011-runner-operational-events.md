# 0011: Runner Operational Events Before Provider Adapters

Date: 2026-06-15
Status: Draft
Thread: Making worker and recovery decisions visible before live integrations.

## Hook

If a runner changes state and nobody can audit why, it is not automation.

It is a black box with a queue.

## Product Stakes

Opzava can now lease jobs, execute one job through a worker boundary, retry with an injected policy, and recover expired leases. The next risk is operational invisibility.

Without durable events, an operator can see that a job is queued, succeeded, retried, or dead-lettered, but cannot reconstruct the decision path that got it there.

## Industry Counterfactual

The common shortcut is a console log near the worker.

That disappears on restart, cannot be queried by workflow run, and usually omits the exact retry or recovery decision that mattered during an incident.

Opzava now writes runner decisions into the existing operational event store.

## What We Built

We connected runner state transitions to audit operational events.

The repository now records audit events for:

- successful worker attempts
- retry-scheduled worker failures
- worker dead letters
- recovery requeues for expired leases
- recovery dead letters for exhausted expired leases
- orphaned expired leases that require manual intervention

The events are stored with workflow and step correlation through `listOperationalEventsForWorkflowRun`.

## What We Refused To Fake

We did not add live provider telemetry yet.

We did not invent a metrics backend or dashboard.

We did not claim this is distributed tracing.

We did not hide recovery warnings in process-local logs.

This slice only makes runner decisions durable and queryable through the repository contract that already exists.

## Evidence

Files changed:

- `src/opzava/platform/runner/repository.ts`
- `src/opzava/platform/runner/worker.test.ts`
- `src/opzava/platform/runner/repository-recovery.test.ts`

The tests cover:

- worker success emits `runner.attempt.succeeded`
- retryable worker failure emits `runner.attempt.retry-scheduled`
- exhausted worker failure emits `runner.attempt.dead-lettered`
- timeout failure emits the retry-scheduled event
- recovery requeue emits `runner.recovery.requeued`
- recovery dead letter emits `runner.recovery.dead-lettered`
- orphaned expired lease emits `runner.recovery.orphaned-lease`

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/worker.test.ts src/opzava/platform/runner/repository-recovery.test.ts: failed before implementation because no audit operational events were written
pnpm vitest run src/opzava/platform/runner/worker.test.ts src/opzava/platform/runner/repository-recovery.test.ts: passed 10/10 after implementation
pnpm vitest run src/opzava/platform/runner/*.test.ts: passed 11 files / 49 tests
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 21/21
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 31/31
pnpm test: passed 116 files / 1154 tests
```

## The Automation Lesson

Operational events are not polish.

They are the difference between “the system did something” and “the operator can prove what happened.”

## Next Case Study Thread

The next build thread should connect execution to provider boundaries:

- provider adapter contracts
- provider input and output validation
- redacted external call records
- daemon polling cadence
- admin-managed retry and timeout settings
