# 0004: Durable Runner Repository Before Worker Execution

Date: 2026-06-15
Status: Draft
Thread: Turning durable contracts into durable storage.

## Hook

A workflow runner that cannot survive a restart is not a workflow runner. It is a long function with better marketing.

The previous slices defined what jobs, attempts, dead letters, external calls, costs, and audit events must look like. This slice gives those records a SQLite-backed storage boundary before any worker loop starts executing them.

## Product Stakes

Opzava needs to coordinate agent work that may fail, retry, pause for approval, or recover after a process restart.

That means the storage layer must preserve more than a final status. It needs the canonical job record, attempt history, dead-letter context, operational events, replay queries, and recovery planning for expired leases.

If those records drift from their indexes, the product becomes untrustworthy. A job can look queued in one query and succeeded in another. A dead letter can look replayable in a list while its stored payload says otherwise. A recovery routine can lose the idempotency key needed to prevent duplicate side effects.

## Industry Counterfactual

The common shortcut is to write a queue table and call it durable.

That misses the hard parts:

- validating writes before they land
- preserving attempt history
- preventing impossible terminal-state transitions
- making replay queries bounded
- keeping operational events correlated with workflow runs
- planning restart-safe recovery without mutating storage accidentally

Opzava is building those behaviors before the worker loop exists.

## What We Built

We added a SQLite-backed repository under `src/opzava/platform/runner/`.

The repository creates and uses these tables:

- `opzava_runner_jobs`
- `opzava_runner_attempts`
- `opzava_runner_dead_letters`
- `opzava_runner_operational_events`

The write path validates every input through the repository contracts before storage. Job updates also check state transitions, so a terminal job cannot be overwritten by an impossible leased state.

The repository supports:

- idempotent schema creation
- job round trips by id and idempotency key
- transactional job saves with transition validation
- append-only attempts
- append-only dead letters
- append-only operational events
- bounded replay queries
- restart-safe recovery planning for expired leases without changing stored jobs

## What We Refused To Fake

We did not start a worker loop.

We did not claim migrations are fully wired into app startup.

We did not execute jobs.

We did not call providers.

We did not make recovery mutate jobs yet.

We did not hide invalid transitions behind upserts.

This slice is storage behavior only: the runner now has a durable place to write, but it still does not run work.

## Evidence

Repository files:

- `src/opzava/platform/runner/repository.ts`
- `src/opzava/platform/runner/repository.test.ts`
- `src/opzava/platform/runner/repository-contracts.ts`
- `src/opzava/platform/runner/repository-contracts.test.ts`

The tests cover:

- idempotent table creation
- job persistence and lookup by idempotency key
- invalid terminal-state update rejection without overwriting the stored record
- attempt, dead-letter, and operational-event persistence
- replay query results
- expired lease recovery planning that preserves idempotency keys and does not mutate storage

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/repository.test.ts: passed 5/5
```

Red-first evidence was observed:

- The new repository implementation test failed first because `src/opzava/platform/runner/repository.ts` did not exist.
- After implementation, one focused test failed because operational events with the same timestamp were sorted by record ID instead of append order.
- The repository query was corrected to preserve append order as the timestamp tiebreaker.

## The Automation Lesson

Durability is a write-path property, not a table name.

The important move here is not just “store jobs in SQLite.” The important move is that storage is forced through contracts, transition checks, bounded queries, and recovery planning before the system is allowed to execute anything.

## Next Case Study Thread

The next build thread should wire the repository into application migrations and then begin the worker execution boundary:

- migration registration or startup integration
- lease acquisition
- attempt creation
- retry scheduling
- dead-letter creation
- recovery execution after restart

That is the point where Opzava can start running work without giving up the safety properties built so far.
