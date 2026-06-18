# 0024: Mock-Only Provider Execution Before Live Provider Approval

Date: 2026-06-16
Status: Draft
Thread: Connecting successful provider preflight to adapter execution while live profiles remain blocked.

## Hook

The first provider execution path should prove the gate, not bypass it.

Opzava now allows provider adapters to run only after preflight succeeds and only when the selected provider profile is `mock`.

## Product Stakes

Opzava has request construction, runtime settings, credential resolution, preflight composition, and redacted blocked-preflight events. The next risk is accidentally turning those foundations into a live external call path before approvals exist.

This slice creates a controlled execution seam: mock adapters can run through the existing external-call event wrapper, while live profiles produce a durable blocked audit event and never reach the adapter.

## Industry Counterfactual

The common shortcut is to wire the adapter interface directly once preflight exists.

That makes the first working demo also the first possible real provider side effect. In automation systems, this is how test prompts become paid calls, drafts become sends, and operator intent becomes ambiguous.

Opzava keeps the adapter seam useful for tests and fixtures without pretending live execution is approved.

## What We Built

We added `executeMockProviderAfterPreflight`.

The boundary:

- runs provider preflight before any adapter call
- appends `provider.preflight.blocked` audit events for preflight failures
- blocks successful live-profile preflight with `provider.execution.blocked.live-profile`
- calls `executeProviderAdapterWithEvents` only for mock provider profiles
- preserves the existing external-call operational event path for mock adapter success and normalized adapter failure
- keeps IDs, clock values, settings loader, resolver, adapter, event sink, and abort signal injected by the caller

## What We Refused To Fake

We did not call live providers.

We did not allow live profiles to reach adapters.

We did not resolve secrets inside the execution module.

We did not read environment variables or files.

We did not generate IDs.

We did not log raw preflight or adapter failures.

We did not add approval semantics before implementing the approval gate.

## Evidence

Files changed:

- `src/opzava/platform/providers/mock-execution-runtime.ts`
- `src/opzava/platform/providers/mock-execution-runtime.test.ts`

The tests cover:

- unavailable runtime settings append a redacted preflight-blocked audit event and skip the adapter
- secret resolution failures preserve typed failure causes while redacting audit records
- successful live-profile preflight appends a live-profile blocked audit event and skips the adapter
- preflight failures take precedence over live-profile blocking and do not double-emit live-block events
- unrecordable external call ids block before mock adapter execution
- mock profiles execute through `executeProviderAdapterWithEvents`
- mock adapter throws are normalized through the provider execution wrapper
- the module source does not read files, read env, generate IDs, or log

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/mock-execution-runtime.test.ts: failed before implementation because ./mock-execution-runtime did not exist
pnpm vitest run src/opzava/platform/providers/mock-execution-runtime.test.ts: passed 8/8 after implementation and review hardening
node --test test/check-plan.test.mjs: passed 34/34
pnpm run typecheck: passed
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 44/44
pnpm test: passed 128 files / 1228 tests
```

MiniMax-M3 shaped the slice before implementation and flagged the must-fix boundary: preflight first, live profiles blocked before adapter dispatch, mock profiles only through the existing execution wrapper, and no env/files/logging/ID generation.

MiniMax-M3 reviewed the hardened slice after implementation and returned no remaining must-fix or should-fix issues.

## The Automation Lesson

A safe adapter interface is not the same as a safe execution policy.

Opzava separates those concerns: adapters describe how a provider call would run, while this boundary decides whether a call is allowed to run at all.

## Next Case Study Thread

The next build thread should add explicit live-provider approval semantics before any live adapter can execute:

- approval requests are durable and operator-visible
- approval decisions are audit-recorded without secret values
- live execution requires a matching approval token or decision record
- denied or missing approval blocks before adapter dispatch
