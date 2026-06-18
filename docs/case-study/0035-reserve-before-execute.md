# 0035: Reserve Before Execute

Date: 2026-06-16
Status: Draft
Thread: Wiring the atomic reservation into the execution boundary so a won reservation is the only gateway to running a live action.

## Hook

A reservation nobody checks is just a row. This slice makes the execution boundary ask permission from the reservation before it runs anything.

## Product Stakes

Slice 0034 built an atomic reservation that admits exactly one winner per idempotency key. Slice 0028's boundary still executed after only a read-then-act lookup. This slice connects them: the boundary now reserves before executing, so under concurrency only the reservation winner runs the adapter.

This is the moment the exactly-once guarantee stops depending on the runner's job lease and starts being enforced at the action itself.

## Industry Counterfactual

The common shortcut is to add the lock check at the call site and hope every future caller remembers it.

Opzava makes the boundary itself the only place that runs the adapter, and makes winning the reservation the only way through it. There is no second door.

## What We Built

We extended `executeApprovedLiveProviderActionOnce` with an optional `reservation` dependency (`reserve` plus a `reservedAt` timestamp).

The flow is now: grant check, fast-path existing-call lookup, then — when a reservation is supplied — reserve the idempotency key.

- A won reservation falls through to a single adapter execution.
- A lost reservation never runs the adapter. It re-checks the lookup: if a completed external call now exists it returns `already-executed`; otherwise it returns the new `reserved-elsewhere` outcome.
- When no reservation is supplied, the flow is identical to before, so slices 0028, 0031, and 0032 keep their behavior and tests.

The re-check on the lost path closes the window between the fast-path lookup returning `null` and the reservation attempt losing.

## What We Refused To Fake

We did not run the adapter on a lost reservation, and proved it with a test asserting zero adapter calls.

We did not claim a failed execution is automatically retryable. A winner that reserves and then has its adapter throw leaves the reservation held; a retry would currently see `reserved-elsewhere`. That is a liveness gap on the failure path, not a duplicate-execution defect, and reservation lifecycle on failure is the next thread.

We did not change the behavior of callers that pass no reservation.

We did not invent a record for the loser when none exists; it returns `reserved-elsewhere`, not a fabricated `already-executed`.

## Evidence

Files changed:

- `src/opzava/platform/providers/live-execution-runtime.ts`
- `src/opzava/platform/providers/live-execution-runtime.reservation.test.ts`
- `src/opzava/platform/providers/live-approval-runtime.ts`
- `test/check-plan.test.mjs`

The tests use a real in-memory `better-sqlite3` database and cover:

- a won reservation executes the adapter exactly once
- a lost reservation (a prior holder occupies the key) does not run the adapter and returns `reserved-elsewhere`
- a pre-existing completed external call returns `already-executed` without reserving

The guard in `live-approval-runtime.ts` was updated to forward the new `reserved-elsewhere` outcome so a later slice can wire reservation into the guard without changing the mapping.

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run live-execution-runtime.reservation.test.ts: passed 3/3 (failed before wiring: lost reservation still executed)
node_modules/.bin/vitest run boundary + guard suites (0028, 0031, 0032): passed 21/21 (unchanged)
node --test test/check-plan.test.mjs: passed 45/45
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (changed files): passed with 0 errors
node --test test/*.test.mjs: passed 55/55
vitest run (full suite): passed 138 files / 1286 tests
```

A three-model council (GPT-5.5, GLM-5.2, MiniMax-M3) reviewed the wiring against four invariants — lost reservation never executes, won reservation executes once, backward compatibility, and safe ordering — and returned a unanimous SOUND. GLM-5.2 noted the failure-path liveness gap, which this entry records as the next thread.

## The Automation Lesson

Exactly-once is won at the single chokepoint where the side effect happens. Put the permission check there, make winning the only way through, and the guarantee no longer relies on every caller's good behavior.

## Next Case Study Thread

The next build thread should handle reservation lifecycle on failure so a failed action stays retryable:

- a winner whose adapter fails releases or invalidates its reservation, or ties the reservation's validity to a successful external-call record
- a retry after a failed-but-released attempt can win the reservation again and execute
- a successful execution keeps the reservation so genuine duplicates still lose
- the reservation and the stored external-call record stay consistent on both success and failure
