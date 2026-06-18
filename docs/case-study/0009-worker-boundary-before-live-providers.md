# 0009: Worker Boundary Before Live Providers

Date: 2026-06-15
Status: Draft
Thread: Connecting durable jobs to execution without calling real providers.

## Hook

The runner is finally allowed to execute a job.

But it still is not allowed to improvise.

## Product Stakes

Opzava now has durable jobs, leases, attempts, outcomes, dead letters, and recovery execution. The next risk is the handoff from storage to work: a worker must lease one job, run the execution boundary, and record the result without inventing timing or retry policy in hidden code.

If that boundary is loose, provider calls will later turn into duplicate side effects, stuck attempts, or unbounded waits.

## Industry Counterfactual

The common shortcut is to write a loop that fetches a job and calls the provider directly.

That feels productive until the first timeout or provider exception. Then there is no clean place to abort, classify the failure, schedule retry, or dead-letter the exhausted job.

Opzava now has a worker boundary before live providers are wired in.

## What We Built

We added `createRunnerWorker` and `RunnerExecutionError`.

One `runNext()` call now:

- leases at most one due job
- passes the leased job and running attempt to an injected executor
- passes an `AbortSignal` to the executor
- records success through `recordAttemptSuccess`
- records retryable failures through `recordAttemptFailure`
- records exhausted failures as dead letters through the same repository outcome path
- enforces execution timeout through injected `executionTimeoutMs`
- schedules retries through injected `retryDelayMs`
- generates attempt and dead-letter ids through injected id factories

The worker boundary does not choose live providers. It only coordinates durable state around an injected executor.

## What We Refused To Fake

We did not add live provider adapters.

We did not start a daemon loop.

We did not hard-code operator-owned timeout or retry values.

We did not infer a full exponential backoff policy.

We did not emit recovery or execution metrics yet.

We did not define the daemon polling cadence after an `idle` result.

We did not add lease renewal heartbeats; instead `executionTimeoutMs` is rejected when it exceeds `leaseDurationMs`.

We did not make process crashes cancel external work that has already left the process. Expired lease recovery remains the durability mechanism for that failure mode.

This slice proves the one-job execution boundary. Long-running worker orchestration remains a separate step.

## Evidence

Files changed:

- `src/opzava/platform/runner/worker.ts`
- `src/opzava/platform/runner/worker.test.ts`

The tests cover:

- no due job returns `idle` without calling the executor
- successful execution records a succeeded job and attempt
- provider-classified errors requeue the job using injected retry delay
- exhausted execution failures become dead letters
- timed-out execution aborts the executor signal and records a timeout failure
- worker construction rejects `executionTimeoutMs > leaseDurationMs`

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/worker.test.ts: failed before implementation because ./worker did not exist
pnpm vitest run src/opzava/platform/runner/worker.test.ts: passed 6/6 after implementation and timeout/lease invariant coverage
pnpm vitest run src/opzava/platform/runner/worker.test.ts src/opzava/platform/runner/repository-recovery.test.ts src/opzava/platform/runner/repository-outcome.test.ts src/opzava/platform/runner/repository-lease.test.ts: passed 19/19
pnpm run typecheck: passed
```

## The Automation Lesson

Execution is not a callback.

Execution is a contract around time, cancellation, retry, and durable state. The worker boundary exists so live providers can be plugged in later without changing how Opzava records the truth.

## Next Case Study Thread

The next build thread should harden the execution system around:

- configurable retry/backoff policy
- operational events for worker execution and recovery
- long-running worker loop orchestration
- provider adapter contracts
- sustained multi-worker contention and throughput measurements
