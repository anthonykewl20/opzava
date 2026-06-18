# 0007: Transactional Attempt Outcomes Before Provider Execution

Date: 2026-06-15
Status: Draft
Thread: Closing every leased attempt as success, retry, or dead letter.

## Hook

Leasing a job is only half of the runner story.

The other half is closing the attempt without losing the truth: did the work succeed, should it retry, or has the retry budget been exhausted?

## Product Stakes

Opzava needs attempt outcomes to update multiple durable records together.

When a step succeeds, the running attempt and leased job must close together. When it fails but has retry budget left, the attempt must record the failure and the job must return to the queue at the retry time. When the retry budget is exhausted, the attempt must record the terminal failure and the job must produce a dead letter with replay context.

If those writes split apart, the operator sees a half-truth.

## Industry Counterfactual

The common shortcut is to update the job status first and write the attempt log later.

That creates impossible states: a job marked succeeded with a running attempt, a retry scheduled without a failure record, or a dead letter with no matching final attempt.

Opzava now treats attempt outcomes as transactional repository operations.

## What We Built

We added two outcome methods to the runner repository:

- `recordAttemptSuccess`: marks the running attempt succeeded and transitions the leased job to `succeeded` in one transaction.
- `recordAttemptFailure`: marks the running attempt failed, then either requeues the job at a retry time or dead-letters it when the retry budget is exhausted.

The failure path now preserves:

- retry decision and scheduled retry time when attempts remain
- final error class and message
- dead-letter replay eligibility
- idempotency key and payload snapshot for replay review

We also hardened the outcome methods after review:

- duplicate outcome calls are rejected once the job is no longer leased or the attempt is no longer running
- an attempt cannot be applied to a different job
- retry time must be after the failed attempt finish time
- invalid outcome calls leave the stored job and attempt unchanged
- coordinated job/attempt write paths use `better-sqlite3` immediate transactions so the write lock is acquired at transaction start
- immediate transaction calls retry once on `SQLITE_BUSY`, do not retry non-busy errors, and surface the busy error after the bounded retry budget is exhausted

## What We Refused To Fake

We did not execute provider calls.

We did not infer retry backoff policy.

We did not add blocking sleeps inside the synchronous repository retry path.

We did not tune the combined wall-clock budget created by SQLite's `busy_timeout` and the repository's single retry.

We did not claim sustained multi-worker throughput is proven by one bounded child-process contention scenario.

We did not run a worker loop.

We did not perform recovery mutation.

We did not claim multi-worker concurrency is proven.

This slice only proves the repository can close leased attempts safely once an execution layer reports the outcome.

## Evidence

Files changed:

- `src/opzava/platform/runner/repository.ts`
- `src/opzava/platform/runner/repository-outcome.test.ts`
- `src/opzava/platform/runner/repository-sqlite-contention.test.ts`
- `src/opzava/platform/runner/repository-transaction-mode.test.ts`

Verified implementation detail from the installed dependency:

- `node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3/lib/methods/transaction.js` exposes `.immediate()` and maps it to `BEGIN IMMEDIATE`.
- `node_modules/.pnpm/@types+better-sqlite3@7.6.13/node_modules/@types/better-sqlite3/index.d.ts` types `.immediate()` on transaction functions.
- A live two-connection SQLite lock probe under Node `v22.22.3` returned `{"threw":true,"name":"SqliteError","message":"database is locked","code":"SQLITE_BUSY"}`.
- A repository-level child-process contention test first proves raw `BEGIN IMMEDIATE` fails when the child holds the writer lock beyond `busy_timeout`, then verifies the parent repository leases the job when the external writer releases before two timeout windows elapse.

The tests cover:

- success path: running attempt becomes succeeded and leased job becomes succeeded
- retry path: failed attempt records retry metadata and job returns to queued at retry time
- exhausted path: failed attempt records a dead-letter decision and job becomes dead-lettered
- dead-letter replay context includes the job idempotency key
- duplicate success rejection without changing the original finish time
- mismatched job/attempt rejection without mutating either record
- invalid retry time rejection without requeueing the leased job
- immediate transaction mode for coordinated job/attempt write paths
- bounded `SQLITE_BUSY` retry behavior for immediate transactions
- non-busy transaction errors are not retried
- exhausted `SQLITE_BUSY` retries are surfaced to the caller
- real SQLite file-lock contention with a separate child process holding `BEGIN IMMEDIATE`
- a raw non-retried `BEGIN IMMEDIATE` control path fails under the same lock timing

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/repository-outcome.test.ts: passed 6/6
pnpm vitest run src/opzava/platform/runner/repository-transaction-mode.test.ts: passed 4/4
pnpm vitest run src/opzava/platform/runner/repository-sqlite-contention.test.ts: passed 2/2, then passed 3 repeated runs
```

Red-first evidence was observed:

- Outcome tests failed first because `recordAttemptSuccess`, `recordAttemptFailure`, `getAttemptById`, and `getDeadLetterById` did not exist.
- The repository implementation was added and the focused outcome tests passed.
- Review-driven hardening tests then failed on duplicate success and invalid retry time behavior.
- Explicit stale-state and retry-time guards were added, and the focused outcome tests passed again.
- A transaction-mode regression test failed because lease acquisition used the default transaction function.
- Coordinated write paths were changed to `.immediate()`, and the transaction-mode regression test passed.
- A busy-retry regression test failed because a `SQLITE_BUSY` thrown by `.immediate()` surfaced immediately.
- A bounded retry wrapper was added around immediate transactions, and retry/budget/non-busy guard tests passed.
- A child-process contention test was added to exercise the repository against a real SQLite file lock instead of only mocked transaction functions; after MMX review, a raw `BEGIN IMMEDIATE` control case was added so the test demonstrates the repository changes the observed outcome under the bounded timing window.

## The Automation Lesson

Attempt outcomes are where the runner earns trust.

The important part is not that a status changes. The important part is that the job, attempt, retry decision, and dead-letter context move together or not at all.

## Next Case Study Thread

The next build thread should connect these repository methods to an execution boundary:

- worker loop
- provider-operation adapter interface
- timeout handling
- retry backoff policy
- recovery execution for expired leases
- multi-worker concurrency stress tests
- sustained multi-worker contention and throughput measurements

That is where Opzava starts turning durable repository operations into real workflow execution.
