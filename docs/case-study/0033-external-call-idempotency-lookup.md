# 0033: Backing The Idempotency Lookup With A Real Query

Date: 2026-06-16
Status: Draft
Thread: Replacing the injected idempotency port with a real query over stored external-call records — the read half, before the atomic reserve half.

## Hook

An idempotency check is only as real as the store behind it. Until now Opzava's was an injected function with no storage. This slice gives it a real query.

## Product Stakes

Slice 0028 designed the execution boundary against an injected `findExistingExternalCall` port so the duplicate-prevention seam could be tested before any database existed. That port now needs a real implementation: a query that, given an idempotency key, returns the external-call record that already ran for it.

The 0031 council flagged that a check-then-act idempotency check is not atomic under concurrency. This slice deliberately delivers only the read query and is explicit that it does not yet close that window.

## Industry Counterfactual

The common shortcut is to keep idempotency state in memory or in the worker process.

That state evaporates on restart, exactly when retries happen, so the "exactly once" guarantee dies with the process.

Opzava reads from the same durable operational-event store the runner already persists, so a restart sees the same history.

## What We Built

We added `createExternalCallIdempotencyLookup`.

The lookup:

- queries `opzava_runner_operational_events` for rows of kind `external-call`
- matches on `json_extract(record_json, '$.event.idempotencyKey')`, because external-call records are persisted as operational events with the `ExternalCallRecord` nested at `$.event`
- returns the parsed `ExternalCallRecord` for the earliest matching row, or `null` when none match
- prepares its statement lazily so it can be constructed before the runner schema is applied
- satisfies the existing `ExistingExternalCallLookup` port consumed by the execution boundary

## What We Refused To Fake

We did not claim concurrency-safe atomicity. This is a read query: two callers can both read `null` before either writes. Atomic reserve-or-skip (a unique-constraint reservation) is the next slice. Until then, the runner's atomic job lease from slice 0006 keeps same-step execution sequential, so retries do not race here.

We did not add a new table or migration; the read uses the existing operational-event store.

We did not store or expose secrets; the lookup returns only the already-redacted external-call record.

We did not invent matches; a missing key returns `null`.

## Evidence

Files changed:

- `src/opzava/platform/providers/external-call-lookup.ts`
- `src/opzava/platform/providers/external-call-lookup.test.ts`
- `test/check-plan.test.mjs`

The tests use a real in-memory `better-sqlite3` database and cover:

- a missing idempotency key returns `null` against an initialized runner schema
- a stored external-call event is found and returned with its idempotency key, provider id, and operation
- a non-matching idempotency key returns `null`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/external-call-lookup.test.ts: failed before implementation because ./external-call-lookup did not exist
node_modules/.bin/vitest run src/opzava/platform/providers/external-call-lookup.test.ts: passed 3/3 after implementation
node --test test/check-plan.test.mjs: passed 43/43
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (both new files): passed with 0 errors
node --test test/*.test.mjs: passed 53/53
vitest run (full suite): passed 136 files / 1279 tests
```

A three-model council (GPT-5.5, GLM-5.2, MiniMax-M3) reviewed the query semantics against five checks — correct key match, correct null behavior, kind filter, no secret leak, and no false atomicity claim — and returned a unanimous SOUND.

## The Automation Lesson

Durable idempotency starts with durable reads. Putting the check on the same store that survives a restart is the difference between "exactly once" and "exactly once until the worker crashes."

## Next Case Study Thread

The next build thread should add the atomic reservation that closes the concurrency window:

- a reserve operation inserts the idempotency key under a unique constraint, returning whether this caller won the reservation
- two concurrent reserves for the same key cannot both win, so only one live action executes
- the execution boundary reserves before running the adapter and treats a lost reservation as `already-executed`
- once provider usage and operator pricing are modeled, the cost event is emitted on the executed path
