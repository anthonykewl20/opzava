# 0037: The Lookup Only Counts Successes

Date: 2026-06-16
Status: Draft
Thread: Making the idempotency lookup ignore non-succeeded external calls so a failed action genuinely retries.

## Hook

A failed attempt that the system remembers as "done" is the quietest way to lose work. This slice makes the idempotency check count only what actually succeeded.

## Product Stakes

Slice 0036 released the reservation when an action failed, but the boundary still had a second gate: the fast-path lookup returned any external-call record for the key, including a failed one. So a retry's lookup found the failed record and short-circuited to `already-executed` before it could re-run.

This slice closes that gate. With the reservation released and the failed record ignored, a failed action now round-trips to a real retry.

## Industry Counterfactual

The common shortcut is to treat "we have a record for this key" as "this is done."

That conflates "attempted" with "succeeded," and the first transient failure becomes permanent.

Opzava distinguishes them: only a `succeeded` external call means the action happened.

## What We Built

We added one clause to the lookup query: `AND json_extract(record_json, '$.event.status') = 'succeeded'`.

- A succeeded external call is still found and still short-circuits the boundary to `already-executed`.
- A failed or timed-out external call is ignored, so the boundary does not treat it as completed.

Combined with slice 0036, the full failure-and-retry path now works: a failed action releases its reservation, the lookup ignores its failed record, and the next attempt reserves and executes again. A succeeded action still short-circuits and still holds its reservation, so genuine duplicates lose.

## What We Refused To Fake

We did not treat an attempt as a completion.

We did not change what a succeeded record means; slice 0033's test that stores a succeeded call and finds it still passes.

We did not silently swallow failed records elsewhere; they remain durably stored as evidence, they simply no longer count as "already executed."

## Evidence

Files changed:

- `src/opzava/platform/providers/external-call-lookup.ts`
- `src/opzava/platform/providers/external-call-lookup.test.ts`
- `test/check-plan.test.mjs`

The tests use a real in-memory `better-sqlite3` database and cover:

- a failed external call returns `null` from the lookup, so it does not block a retry
- a succeeded external call is still found and returned
- a missing or non-matching key still returns `null`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run external-call-lookup.test.ts: passed 4/4 (failed before: a failed external call was returned)
node_modules/.bin/vitest run live-execution-runtime.reservation.test.ts: passed 6/6 (unchanged)
node --test test/check-plan.test.mjs: passed 47/47
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (changed files): passed with 0 errors
node --test test/*.test.mjs: passed 57/57
vitest run (full suite): passed 138 files / 1291 tests
```

This is a one-clause query change pinned by a failed-returns-null test and the existing succeeded-is-found test, so a separate council pass was not run; the behavior is fully covered by tests against a real database.

## The Automation Lesson

Idempotency must key on success, not on existence. A system that remembers attempts as completions will, sooner or later, refuse to finish the very work it failed at.

## Milestone

Slices 0027 through 0037 complete a durable, concurrency-safe, exactly-once execution substrate for live provider actions: approval guard, idempotent execution boundary, atomic reservation, reserve-before-execute, release-on-failure, and a success-only idempotency lookup — all test-first, all with live adapters still disabled.

## Next Case Study Thread

With the execution substrate complete, the next build thread begins Layer 6, the content workflow, under `src/opzava/modules/content/`:

- define the first content-workflow artifact or step contract (for example idea intake and its structured artifact) before any step logic
- keep each step's output a validated, versioned artifact, per the implementation-layers plan
- run the content workflow on mock providers through the existing durable runner and exactly-once boundary
- end the first workflow at an approval-blocked WordPress draft, with no live publish
