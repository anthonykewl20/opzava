# 0006: Atomic Lease Acquisition Before Worker Execution

Date: 2026-06-15
Status: Draft
Thread: Letting workers claim work only when the attempt record exists too.

## Hook

The first dangerous moment in a runner is not execution. It is claiming the work.

If a worker marks a job as leased but crashes before creating an attempt record, the system has already lost part of the story. Opzava now treats leasing and attempt creation as one repository operation.

## Product Stakes

Opzava needs a worker to answer a simple question after every restart: what was claimed, by whom, and what attempt was running?

That means a lease cannot be just a status flip. It must create durable execution context at the same time. The attempt number must advance, the worker lease must have an expiry, and future-scheduled or exhausted jobs must remain untouched.

## Industry Counterfactual

The common shortcut is a queue query that does this in loose steps:

- select a queued row
- update it to running
- later insert an attempt log
- hope nothing crashes between those lines

That creates orphaned work. A job can be “running” with no attempt, no retry basis, and no clear recovery story.

Opzava is taking the stricter path: `leaseNextJobForAttempt` leases a job and inserts the running attempt inside one transaction.

## What We Built

We added atomic lease acquisition to the runner repository.

The repository now supports:

- selecting the highest-priority due queued job
- ignoring future-scheduled jobs
- ignoring jobs that exhausted `maxAttempts`
- transitioning the job from `queued` to `leased`
- attaching worker lease metadata and expiry
- incrementing `attemptCount`
- inserting a running `Attempt` record in the same transaction

The lease query required a denormalized `priority` column. We added an additive migration, `opzava_runner_002_job_priority_index`, so databases that already applied the first runner migration can upgrade safely.

## What We Refused To Fake

We did not execute the leased job.

We did not call providers.

We did not schedule retries.

We did not mark attempts succeeded or failed.

We did not mutate expired leases during recovery.

This slice only proves that a worker can claim work without losing the attempt context.

## Evidence

Files changed:

- `src/opzava/platform/runner/repository.ts`
- `src/opzava/platform/runner/repository-lease.test.ts`
- `src/opzava/platform/runner/migrations.ts`
- `src/opzava/platform/runner/migrations.test.ts`

The tests cover:

- highest-priority due job selection
- future-scheduled jobs staying queued
- exhausted retry-budget jobs staying queued
- leased job status and worker lease metadata
- durable running attempt creation
- migration upgrade for runner job priority indexing

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/repository-lease.test.ts: passed 3/3
pnpm vitest run src/opzava/platform/runner/migrations.test.ts: passed 2/2
```

Red-first evidence was observed:

- Lease tests failed first because `leaseNextJobForAttempt` did not exist.
- After implementation, the test failed again because the jobs table had no `priority` column.
- We added the denormalized priority column and a second migration for databases that already applied the first runner migration.

## The Automation Lesson

Atomic leasing is where durability starts becoming execution.

A runner is not safe because it can pick a job. It is safe when the act of picking a job creates the durable record needed to explain, retry, and recover that work later.

## Next Case Study Thread

The next build thread should complete attempt outcomes:

- mark attempt succeeded
- mark job succeeded
- mark attempt failed
- schedule retry when retry budget remains
- create dead letter when retry budget is exhausted
- keep all outcome writes transactional

That is where Opzava starts closing the loop from claimed work to completed or safely failed work.
