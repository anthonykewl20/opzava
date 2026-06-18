# 0026: Provider Approval Operational Events Before Live Execution

Date: 2026-06-16
Status: Draft
Thread: Recording provider approval allow and deny decisions as redacted operational audit events.

## Hook

An approval decision that is not recorded is just a branch in memory.

Opzava now turns provider execution approval decisions into durable, redacted audit records without calling a live adapter.

## Product Stakes

The previous slice made provider approval a runtime predicate. That is necessary, but operators also need a durable receipt for why a live provider action was allowed or denied.

This slice records the decision class without storing prompts, payloads, credentials, request summaries, or secret references.

## Industry Counterfactual

The common shortcut is to log approval failures as raw request objects.

That mixes control-plane evidence with sensitive payloads and disappears when logs rotate.

Opzava uses the existing runner operational-event contract instead.

## What We Built

We added `createProviderExecutionApprovalOperationalEvent`.

The factory:

- accepts a caller-supplied approval decision and caller-supplied event identity fields
- emits `provider.execution.approval.denied` for denied decisions
- emits `provider.execution.approval.allowed` for allowed decisions
- stores denied reason codes and approval ids when present
- stores allowed approval id and expiry
- stores request id, provider id, operation, workflow run id, and step run id
- returns an existing runner `audit` operational event

## What We Refused To Fake

We did not evaluate approvals.

We did not execute provider adapters.

We did not persist events.

We did not read environment variables or files.

We did not generate event ids.

We did not log decisions.

We did not store request payloads, request summaries, credentials, headers, or secret references.

## Evidence

Files changed:

- `src/opzava/platform/providers/approval-events.ts`
- `src/opzava/platform/providers/approval-events.test.ts`

The tests cover:

- denied decisions with approval ids become parseable audit operational events
- denied decisions without approval ids omit the approval id field entirely
- allowed decisions record approval id and expiry without a reason field
- unexpected fields on decision objects do not leak into audit records
- identical inputs produce deterministic output
- the module source does not import approval execution, provider execution, adapters, filesystem reads, env reads, logging, fetch, ID generation, or full-decision serialization

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/approval-events.test.ts: failed before implementation because ./approval-events did not exist
pnpm vitest run src/opzava/platform/providers/approval-events.test.ts: passed 6/6 after implementation
node --test test/check-plan.test.mjs: passed 36/36
pnpm run typecheck: passed
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 46/46
pnpm test: passed 130 files / 1247 tests
```

MiniMax-M3 shaped this slice before implementation. Its key constraints were to build a fresh allow-listed summary, never spread a full decision, never include request payloads or secret references, and leave persistence to the caller.

MiniMax-M3 reviewed the implemented slice and found no must-fix blockers. Its non-blocking test-tightening feedback was addressed by asserting deterministic output on both allow and deny branches, blocking `Date.now`/`crypto`/full-decision spread in the source scan, and checking nested unexpected fields do not leak.

## The Automation Lesson

Approval gates need two outputs: a decision for the runtime and a receipt for the operator.

Those are different responsibilities. This slice records the receipt without expanding the execution surface.

## Next Case Study Thread

The next build thread should connect approval guard decisions and approval decision events to the live-profile blocked path while still keeping live adapters disabled:

- live profile preflight success evaluates approval before returning blocked outcomes
- approval deny decisions append redacted approval audit events
- approval allow decisions append redacted approval audit events but still stop before adapter execution
- live adapter execution remains disabled until a dedicated live execution boundary exists
