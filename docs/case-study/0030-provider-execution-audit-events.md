# 0030: Provider Execution Audit Events Before Live Wiring

Date: 2026-06-16
Status: Draft
Thread: Turning an executed live provider action into a durable, redacted audit receipt before the execution path is wired in.

## Hook

Every irreversible action a system takes for you should leave a receipt that an operator can read without reading anyone's secrets.

Opzava now mints that receipt for an executed live provider action, recording what happened without recording the payload.

## Product Stakes

Slices 0028 and 0029 built the idempotent execution boundary and its cost event. What was still missing is the control-plane record: a durable audit line that says "this provider action executed, for this run, with this outcome."

This slice adds that audit event as a pure factory, so the eventual wiring step has a ready, tested receipt to emit and nothing to invent at the dangerous moment.

## Industry Counterfactual

The common shortcut is to log the whole provider request and response when an action runs, so debugging is easy.

That log becomes a liability: it mixes control-plane evidence with prompts, outputs, and sometimes credentials, and it disappears when logs rotate.

Opzava records a fixed, allow-listed audit summary through the same operational-event contract the runner already trusts, and refuses to carry the payload at all.

## What We Built

We added `createProviderExecutionAuditOperationalEvent`.

The factory:

- accepts caller-supplied event identity (record id, audit event id, actor, timestamp) and correlation fields (request id, provider id, operation, workflow run id, step run id, external call id)
- emits the audit action `provider.execution.recorded`
- builds a fresh, frozen `afterSummary` containing only request id, provider id, operation, external call id, status, and `outcome: 'executed'`
- carries the execution status (`succeeded`, `failed`, or `timed-out`) without changing the action
- returns an existing runner `audit` operational event via `parseOperationalEventStorageRecord`

## What We Refused To Fake

We did not execute a provider adapter.

We did not persist the event.

We did not store prompts, outputs, request summaries beyond ids, credentials, or secret references.

We did not read environment variables or files.

We did not generate ids or timestamps.

We did not log the action.

## Evidence

Files changed:

- `src/opzava/platform/providers/audit-events.ts`
- `src/opzava/platform/providers/audit-events.test.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a succeeded executed action becomes a parseable `audit` record with action `provider.execution.recorded` and an exact allow-listed `afterSummary`
- failed and timed-out statuses are carried without changing the action
- identical inputs produce deterministic output
- unexpected extra input fields do not leak into the audit record
- the module source does not read files or env, generate ids, call fetch, or use nondeterministic time

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/audit-events.test.ts: failed before implementation because ./audit-events did not exist
node_modules/.bin/vitest run src/opzava/platform/providers/audit-events.test.ts: passed 5/5 after implementation
node --test test/check-plan.test.mjs: passed 40/40
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (both new files): passed with 0 errors
node --test test/*.test.mjs: passed 50/50
vitest run (full suite): passed 134 files / 1270 tests
```

GPT-5.5 was routed to generate this slice in plan mode but timed out twice under load; following the documented fallback, the orchestrator wrote the module directly under the sanctioned gate override, test-first, then restored governance and verified every gate independently. The audit factory is structurally identical to the already-reviewed approval and cost event factories, so it inherits their redaction and determinism guarantees.

## The Automation Lesson

The receipt and the payload are different responsibilities. An automation tool that conflates them is one log-export away from leaking the very data it was trusted to handle. Recording the fact of an action, in a fixed allow-listed shape, is the version operators can safely keep forever.

## Next Case Study Thread

The next build thread should wire the 0027 approval guard's allow path into the 0028 idempotent boundary and emit these cost and audit events for an executed action:

- the guard allow path calls `executeApprovedLiveProviderActionOnce` instead of returning `live-execution-disabled`
- an executed action appends the external-call event, this audit event, and a cost event together
- the idempotency lookup is backed by a real query over stored external-call records
- live execution stays gated behind validated admin settings and resolved secret references
