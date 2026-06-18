# 0008: Expired Lease Recovery Before Worker Execution

Date: 2026-06-15
Status: Draft
Thread: Recovering leased jobs after a worker disappears.

## Hook

A durable runner is not trustworthy because it can start work.

It becomes trustworthy when it can survive work being interrupted.

## Product Stakes

Opzava leases jobs to workers before provider execution exists. That lease is a promise: either the worker finishes the attempt, or the system can recover the job when the lease expires.

Without recovery execution, an expired lease becomes a permanent limbo state: the job is not queued, the attempt is still running, and no operator can tell whether retry or replay is safe.

## Industry Counterfactual

The common shortcut is to clear the lease and put the job back in the queue.

That hides the real failure. The previous running attempt remains running forever, so the retry history lies.

Opzava now recovers expired leases by closing the running attempt and moving the job in the same repository transaction.

## What We Built

We added `executeExpiredLeaseRecovery` to the runner repository.

It scans currently leased jobs whose lease expiry is at or before the recovery cutoff, then:

- requeues jobs that still have retry budget
- marks their running attempt failed with `timeout`
- schedules the retry at the recovery timestamp
- dead-letters jobs whose retry budget is exhausted
- preserves dead-letter replay context with the original idempotency key and payload snapshot

The method returns the same recovery-plan shape as `planExpiredLeaseRecovery`, but it mutates storage atomically.

## What We Refused To Fake

We did not start a worker loop.

We did not call providers.

We did not infer a general backoff policy.

We did not claim recovery handles corrupted storage where a leased job has no running attempt.

We did not add structured recovery logging or metrics yet.

We did not prove concurrent recovery execution across multiple processes.

We assume `generatedAt` is supplied by trusted server-side runner code, not user input.

We did not claim multi-worker throughput is proven.

This slice only proves the repository can execute restart-safe recovery for the normal lease/attempt states it already creates.

## Evidence

Files changed:

- `src/opzava/platform/runner/repository.ts`
- `src/opzava/platform/runner/repository-recovery.test.ts`

The tests cover:

- expired leased jobs are requeued and their running attempts are closed as retryable timeout failures
- fresh leases are not touched
- exhausted expired leases become dead letters
- dead-letter records preserve replay context and the original idempotency key
- running attempts are not left open after recovery
- executing recovery a second time is idempotent because the expired lease is no longer leased
- recovery dead-letter ids are derived from a deterministic hash of the attempt id rather than truncating the attempt id
- orphaned leased jobs with no running attempt are left unchanged for manual intervention

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/repository-recovery.test.ts: failed 3/3 before implementation because executeExpiredLeaseRecovery did not exist
pnpm vitest run src/opzava/platform/runner/repository-recovery.test.ts: passed 4/4 after implementation and orphaned-lease coverage
pnpm vitest run src/opzava/platform/runner/repository-recovery.test.ts src/opzava/platform/runner/repository.test.ts src/opzava/platform/runner/repository-outcome.test.ts src/opzava/platform/runner/repository-lease.test.ts src/opzava/platform/runner/repository-transaction-mode.test.ts: passed 22/22
pnpm run typecheck: passed
```

## The Automation Lesson

Recovery is not cleanup.

Recovery is another state transition that has to tell the truth. A timed-out lease should become a failed attempt plus either a queued retry or a dead letter. Anything less creates silent corruption.

## Next Case Study Thread

The next build thread should connect the durable repository to execution boundaries:

- worker loop
- timeout handling around execution adapters
- retry backoff policy
- operational events for recovery actions
- sustained multi-worker contention and throughput measurements
