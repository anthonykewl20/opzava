# 0036: Reservation Lifecycle On Failure

Date: 2026-06-16
Status: Draft
Thread: Releasing the reservation when an action does not succeed, so a failure cannot poison the idempotency key.

## Hook

An exactly-once guarantee that also blocks every retry of a failed action is just a different way to lose work. This slice makes a failure give the key back.

## Product Stakes

Slice 0035 made the boundary reserve before executing. But a winner whose action failed kept its reservation, so a retry saw `reserved-elsewhere` and could never run. The previous council flagged exactly this liveness gap.

This slice closes it: a reserved action that does not succeed releases its reservation, so a later retry can win the key again, while a success keeps the reservation so genuine duplicates still lose.

## Industry Counterfactual

The common shortcut is a reservation with a fixed time-to-live, hoping the TTL outlives a failure but not a duplicate.

That trades one race for another and makes correctness depend on a guessed timeout.

Opzava ties the reservation's fate to the action's outcome: succeeded keeps it, anything else releases it, and a thrown execution releases it too.

## What We Built

We added `releaseExternalCall` to the reservation (a delete by primary key) and wired the boundary to use it.

After a won reservation executes:

- a `succeeded` result keeps the reservation, so concurrent or duplicate reservations still lose
- a `failed` or `timed-out` result releases the reservation, so a retry can win again
- a thrown execution (for example an event-sink write failure, where the outcome is unknown) releases the reservation and re-throws, so the key is not poisoned

Release is gated on a supplied reservation and only runs on the won-and-executed path; lost-reservation and no-reservation paths never release.

## What We Refused To Fake

We did not use a guessed time-to-live; the reservation's lifecycle follows the real outcome.

We did not leave the thrown-execution path unguarded. The review panel split two-to-one flagging that release sat only on the post-await success path; we adopted their prescribed fix and added a regression test that forces an event-sink throw and proves the key is released.

We did not change the success path's duplicate protection, and proved a kept reservation still makes a duplicate reserve lose.

We did not claim full end-to-end retry yet: a failed execution still leaves a failed external-call record, and the lookup must learn to ignore non-succeeded records before a retry round-trips through the boundary. That is the next thread.

## Evidence

Files changed:

- `src/opzava/platform/providers/external-call-reservation.ts`
- `src/opzava/platform/providers/external-call-reservation.test.ts`
- `src/opzava/platform/providers/live-execution-runtime.ts`
- `src/opzava/platform/providers/live-execution-runtime.reservation.test.ts`
- `test/check-plan.test.mjs`

The tests use a real in-memory `better-sqlite3` database and cover:

- a released reservation can be reserved again
- a failed execution releases the reservation so a subsequent reserve wins
- a successful execution keeps the reservation so a subsequent reserve loses
- a thrown execution releases the reservation and re-throws, so the key is not poisoned

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run external-call-reservation.test.ts: passed 5/5
node_modules/.bin/vitest run live-execution-runtime.reservation.test.ts: passed 6/6 (failed before: release path missing)
node --test test/check-plan.test.mjs: passed 46/46
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (changed files): passed with 0 errors
node --test test/*.test.mjs: passed 56/56
vitest run (full suite): passed 138 files / 1290 tests
```

A three-model council (GPT-5.5, GLM-5.2, MiniMax-M3) returned one SOUND and two FLAW. The two FLAW verdicts agreed on a real defect: the release fired only on the returned-result path, so a thrown execution would leak the reservation. Their prescribed fix — release on the throw path as well — was adopted and locked in with a regression test before integration.

## The Automation Lesson

A correctness primitive needs a lifecycle, not just a creation. Reserving without a principled release turns a duplicate-prevention tool into a work-prevention tool the first time something fails.

## Next Case Study Thread

The next build thread should make the lookup ignore non-succeeded external calls so a failed action round-trips to a real retry:

- `findExistingExternalCall` returns only `succeeded` external-call records
- a failed external-call record no longer short-circuits the boundary to `already-executed`
- a full retry: failed action releases reservation and is ignored by the lookup, so the next attempt reserves and executes again
- a succeeded action still short-circuits and still holds its reservation
