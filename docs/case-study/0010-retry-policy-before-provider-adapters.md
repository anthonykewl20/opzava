# 0010: Retry Policy Before Provider Adapters

Date: 2026-06-15
Status: Draft
Thread: Making retry timing explicit before live integrations.

## Hook

Retry is not a sleep.

Retry is product behavior.

## Product Stakes

Opzava already leases jobs, executes one job through a worker boundary, records failures, and can recover expired leases. The next danger is hiding retry timing inside worker code.

If retry timing is hard-coded, operators cannot tune provider behavior, outages can turn into retry storms, and tests cannot explain why a job ran again when it did.

## Industry Counterfactual

The common shortcut is `setTimeout(60000)` or `finishedAt + 60_000`.

That shortcut bakes policy into plumbing. Later, every provider, workflow, and error class inherits the same behavior whether it makes sense or not.

Opzava now makes retry timing an injected policy.

## What We Built

We added `createExponentialRetryPolicy`.

The policy:

- validates `initialDelayMs`, `multiplier`, and `maxDelayMs`
- schedules retries using exponential delay
- caps retries at `maxDelayMs`
- avoids relying on overflowing exponential math for large attempt numbers
- rejects invalid retry timestamps instead of returning invalid `Date` values
- returns a typed retry decision with `scheduledAt`, `delayMs`, and reason

We also changed `createRunnerWorker` to use an injected `retryPolicy` instead of a fixed `retryDelayMs`.

## What We Refused To Fake

We did not hard-code one retry delay for all providers.

We did not add jitter yet.

We did not create admin UI settings yet.

We did not make retry policy provider-specific yet.

We did not claim this prevents retry storms under multi-worker load.

We did not move max-attempt ownership into the retry policy; the durable job budget still owns that boundary.

That boundary is already enforced in worker and repository outcome tests: exhausted attempts dead-letter instead of rescheduling.

We did not make `errorClass` alter retry timing yet; it is currently carried into the decision reason for auditability.

This slice only makes retry scheduling explicit, typed, and injectable.

## Evidence

Files changed:

- `src/opzava/platform/runner/retry-policy.ts`
- `src/opzava/platform/runner/retry-policy.test.ts`
- `src/opzava/platform/runner/worker.ts`
- `src/opzava/platform/runner/worker.test.ts`

The tests cover:

- exponential retry scheduling from attempt number
- maximum retry delay cap
- large attempt numbers cap without depending on infinite delay math
- exact and non-exact cap boundaries stay stable
- invalid policy settings are rejected
- invalid failure timestamps and out-of-range scheduled dates are rejected
- worker failure scheduling uses the injected policy rather than a fixed delay
- worker and repository outcome tests continue to enforce max-attempt dead-letter termination

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/retry-policy.test.ts src/opzava/platform/runner/worker.test.ts: failed before implementation because ./retry-policy did not exist
pnpm vitest run src/opzava/platform/runner/retry-policy.test.ts src/opzava/platform/runner/worker.test.ts: passed 13/13 after implementation and review hardening
pnpm vitest run src/opzava/platform/runner/retry-policy.test.ts src/opzava/platform/runner/worker.test.ts src/opzava/platform/runner/repository-recovery.test.ts src/opzava/platform/runner/repository-outcome.test.ts src/opzava/platform/runner/repository-lease.test.ts: passed 26/26
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 20/20
pnpm run lint: passed with 0 errors and inherited warnings
pnpm test: passed 116 files / 1154 tests
node --test test/*.test.mjs: passed 30/30
```

## The Automation Lesson

Retries are where automation either becomes resilient or becomes noisy.

The difference is whether retry behavior is an explicit policy that can be tested and tuned, or an invisible delay hidden in a worker.

## Next Case Study Thread

The next build thread should connect execution to operations:

- operational events for worker execution and recovery
- provider adapter contracts
- daemon polling cadence
- admin-managed retry and timeout settings
- sustained multi-worker contention and throughput measurements
