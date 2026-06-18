# 0027: Live Provider Approval Guard Before Live Adapter Execution

Date: 2026-06-16
Status: Draft
Thread: Connecting approval evaluation and approval audit events to the live-profile preflight-success path while live adapters stay disabled.

## Hook

The most dangerous moment in an automation tool is the first time it is allowed to act for real.

Opzava now reaches that moment on the live-profile path, evaluates approval, records the decision, and then deliberately stops — before any live adapter exists to run.

## Product Stakes

Earlier slices proved each piece in isolation: a preflight that resolves runtime settings and credentials, a mock-only execution path, an approval predicate, and an approval audit-event factory. In isolation, none of them stops a live side effect.

This slice composes them on the real branch — a live provider profile that passed preflight — so an allowed approval produces a receipt and a denied approval produces a receipt, but neither produces a live call.

## Industry Counterfactual

The common shortcut is to wire the live adapter first and bolt the approval check on at the call site later.

That leaves a window where the dangerous path is reachable without a recorded decision, and it scatters approval logic into provider code.

Opzava builds the guarded junction first. The live execution boundary still does not exist, so the only thing that can happen on the live path is "evaluate, record, refuse."

## What We Built

We added `guardLiveProviderExecutionAfterPreflight`.

The function:

- runs the existing provider execution preflight and, on failure, appends a redacted `provider.preflight.blocked` operational event and returns `preflight-failed`
- rejects a mock provider profile as the wrong runtime with `unexpected-mock-profile` and emits no event
- evaluates a live provider profile through the existing `evaluateProviderExecutionApproval` predicate
- appends exactly one approval operational event for the decision — `provider.execution.approval.allowed` or `provider.execution.approval.denied`
- returns `approval-denied` when the decision is not granted
- returns `live-execution-disabled` carrying the approval id and expiry when the decision is granted, because no live adapter may run yet
- never returns an `ok: true` result, because nothing executes

## What We Refused To Fake

We did not execute a live provider adapter.

We did not execute a mock provider adapter.

We did not enable an `ok: true` execution outcome.

We did not persist events.

We did not resolve or log secrets, payloads, request summaries, or credentials.

We did not read environment variables or files.

We did not generate event ids, approval ids, or timestamps.

## Evidence

Files changed:

- `src/opzava/platform/providers/live-approval-runtime.ts`
- `src/opzava/platform/providers/live-approval-runtime.test.ts`
- `test/check-plan.test.mjs`

The tests cover:

- preflight failure appends a `provider.preflight.blocked` audit event and returns `preflight-failed` without evaluating approval
- a mock provider profile returns `unexpected-mock-profile` and appends zero operational events
- a live profile with a missing approval appends a `provider.execution.approval.denied` audit event and returns `approval-denied` with cause `approval-missing`
- a live profile with a granted approval appends a `provider.execution.approval.allowed` audit event and returns `live-execution-disabled`, never `ok: true`
- identical inputs produce deeply equal results
- the module source does not import provider or mock adapter execution, filesystem reads, env reads, logging, fetch, ID generation, or current-time access

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.test.ts: failed before implementation because ./live-approval-runtime did not exist
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.test.ts: passed 6/6 after implementation
node --test test/check-plan.test.mjs: passed 37/37
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed 47/47
vitest run (full suite): passed 131 files / 1253 tests
```

GLM-5.2 implemented this slice under a fully specified contract: compose the existing preflight, approval predicate, and approval-event factory on the live-profile path, append exactly one operational event per outcome, and refuse every adapter execution path.

The implemented slice was cross-checked by a GPT-5.5, GLM-5.2, and MiniMax-M3 review panel for redaction, no-execution, and determinism. Two reviewers returned SOUND; the third raised dependency-contract concerns that were closed by verifying directly that the preflight composition imports no adapter execution and that the approval and preflight event factories build fresh allow-listed summaries with explicit secret redaction.

## The Automation Lesson

A control plane earns trust at the junctions, not in the isolated parts.

The approval predicate and the audit event were already correct alone. The risk lived in how they meet the live path — so that junction is exactly where this slice forces "record and refuse" before any live adapter can change it.

## Next Case Study Thread

The next build thread should define the dedicated live execution boundary that a granted approval finally unlocks:

- a live execution boundary consumes a granted approval decision instead of returning `live-execution-disabled`
- live adapter execution writes external-call, cost, and audit records with redaction
- idempotency keys prevent a retried granted approval from creating duplicate live external actions
- live execution stays gated behind validated admin settings and resolved secret references
