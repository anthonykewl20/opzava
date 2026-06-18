# 0025: Provider Execution Approval Guard Before Live Adapter Enablement

Date: 2026-06-16
Status: Draft
Thread: Adding explicit approval semantics for live provider execution without enabling live adapters.

## Hook

An approval gate is only real if it can say no before the dangerous code path exists.

Opzava now has a pure provider execution approval guard that can allow or deny a live provider action without calling any adapter.

## Product Stakes

Opzava already validates provider requests, resolves live credentials through an injected boundary, records blocked preflight events, and only executes mock providers. The next product risk is treating "approval" as a UI label instead of a runtime contract.

This slice makes approval a machine-readable decision before any live adapter can be enabled.

## Industry Counterfactual

The common shortcut is to add an approval queue after a live integration already works.

That turns approval into a workflow decoration. The dangerous path exists first, and the control is retrofitted later.

Opzava does the reverse: prove the approval decision contract while live execution is still inert.

## What We Built

We added `evaluateProviderExecutionApproval`.

The guard:

- consumes the existing core `Approval` contract
- requires an `external-action` target supplied by the caller
- requires a caller-supplied requested action string
- denies missing, non-granted, mismatched, expired, and expiry-free approvals
- returns an allow decision only for an approved, matching, unexpired approval
- returns structured data only; it does not emit events or call adapters
- keeps current time injected by the caller

## What We Refused To Fake

We did not enable live provider execution.

We did not call provider adapters.

We did not add approval persistence or approval queue UI.

We did not resolve secrets.

We did not generate approval IDs, target IDs, or action names.

We did not read environment variables or files.

We did not log approval decisions.

## Evidence

Files changed:

- `src/opzava/platform/providers/approval-runtime.ts`
- `src/opzava/platform/providers/approval-runtime.test.ts`

The tests cover:

- missing approval denies with `approval-missing`
- requested, rejected, and cancelled approvals deny with `approval-not-granted`
- expired approvals deny with `approval-expired`
- target mismatches deny with `approval-target-mismatch`
- requested action mismatches deny with `approval-action-mismatch`
- approved approvals without expiry deny with `approval-expiry-required`
- matching approved approvals allow without adapter execution
- expiry equal to injected current time is still allowed
- malformed caller target ids deny before allow decisions
- the module source does not import provider execution, adapters, filesystem reads, env reads, logging, fetch, or ID generation

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/approval-runtime.test.ts: failed before implementation because ./approval-runtime did not exist
pnpm vitest run src/opzava/platform/providers/approval-runtime.test.ts: passed 13/13 after implementation
node --test test/check-plan.test.mjs: passed 35/35
pnpm run typecheck: passed
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 45/45
pnpm test: passed 129 files / 1241 tests
```

MiniMax-M3 shaped this slice before implementation. Its key constraint was to prove approval allow/deny semantics without enabling provider execution, resolving secrets, reading environment/files, logging, generating IDs, or importing adapters.

MiniMax-M3 reviewed the implemented slice and returned no must-fix issues. Its non-blocking documentation suggestions were addressed by making the target-id bounds and expiry-boundary policy explicit in code comments.

## The Automation Lesson

Approval is not a modal; it is a runtime predicate.

The UI can ask for approval later, but the system first needs a deterministic rule that blocks external side effects unless a matching decision exists.

## Next Case Study Thread

The next build thread should turn denied approval decisions into redacted operational audit events:

- missing and denied approval decisions become durable audit records
- allowed decisions can be recorded without leaking payloads or credentials
- live adapters remain disabled until approval decisions are wired into a controlled live execution boundary
