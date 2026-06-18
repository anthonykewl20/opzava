# 0034: Atomic Idempotency Reservation

Date: 2026-06-16
Status: Draft
Thread: Closing the concurrency window the 0031 council flagged with a database-enforced atomic reservation.

## Hook

A read-then-act idempotency check has a gap exactly the width of a race. This slice removes the gap by letting the database, not the application, decide who wins.

## Product Stakes

Slice 0033 backed the idempotency lookup with a real query, but a query is read-then-act: two concurrent callers can both read "nothing here" before either writes, and both execute. For a control plane that triggers real, possibly irreversible actions, that is the difference between "exactly once" and "occasionally twice."

This slice adds the atomic reservation primitive that makes a double-win impossible, so a later slice can reserve before executing.

## Industry Counterfactual

The common shortcut is an application-level lock or a "check if exists, then insert" pair.

Both have a window between the check and the write where a second caller slips through, and distributed variants make it worse.

Opzava pushes the decision into a single SQL statement against a unique constraint, where the database serializes writers and admits exactly one winner.

## What We Built

We added the `opzava_runner_external_call_reservations` table through migration `opzava_runner_003_external_call_reservations`, with `idempotency_key` as a `PRIMARY KEY NOT NULL`, and `createExternalCallReservation`.

The reservation:

- inserts the idempotency key with `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING`
- returns `reserved` when `changes === 1` (this caller won) and `already-reserved` when `changes === 0` (a prior caller holds it)
- never overwrites the winner's row, because `DO NOTHING` performs no write on conflict
- prepares its statement lazily and owns no transaction of its own

The PRIMARY KEY is the serialization point: SQLite admits one writer, so of two concurrent inserts for the same key, exactly one reports a change.

## What We Refused To Fake

We did not wire reservation into the execution boundary yet; reserve-before-execute is the next slice.

We did not use an application-level lock or a check-then-insert pair; the uniqueness is enforced by the database.

We did not let a losing reservation overwrite or mutate the winner's record.

We did not weaken the migration test; we updated its expected migration and table lists to match the new, larger set.

## Evidence

Files changed:

- `src/opzava/platform/runner/migrations.ts`
- `src/opzava/platform/runner/migrations.test.ts`
- `src/opzava/platform/providers/external-call-reservation.ts`
- `src/opzava/platform/providers/external-call-reservation.test.ts`
- `test/check-plan.test.mjs`

The tests use a real in-memory `better-sqlite3` database and cover:

- the first caller reserves a key (`reserved`)
- a second reservation for the same key loses (`already-reserved`)
- distinct keys both reserve
- a losing reservation does not overwrite the winner's external-call id
- the migration registers the new id and table alongside the existing runner schema

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run external-call-reservation.test.ts: passed 4/4 (failed before implementation: module missing)
node_modules/.bin/vitest run runner/migrations.test.ts: passed 2/2 (expected migration + table lists updated)
node --test test/check-plan.test.mjs: passed 44/44
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (changed files): passed with 0 errors
node --test test/*.test.mjs: passed 54/54
vitest run (full suite): passed 137 files / 1283 tests
```

A three-model council (GPT-5.5, GLM-5.2, MiniMax-M3) reviewed the atomicity against four checks — single-winner insert, loser cannot overwrite, per-statement `changes`, and migration safety — and returned a unanimous SOUND. GLM-5.2's one non-blocking note — that a non-integer SQLite PRIMARY KEY does not enforce `NOT NULL` — was adopted by declaring `idempotency_key TEXT PRIMARY KEY NOT NULL`.

## The Automation Lesson

When correctness depends on "only one of us may proceed," do not arbitrate it in application code. Hand the decision to a system that already serializes writers. The shortest correct concurrency primitive here is a unique constraint and a single insert.

## Next Case Study Thread

The next build thread should wire reserve-before-execute into the execution boundary:

- the boundary reserves the idempotency key before running the adapter
- a lost reservation is treated as `already-executed` and the adapter does not run
- a won reservation proceeds to execute exactly once
- the reservation and the stored external-call record stay consistent on success and on failure
