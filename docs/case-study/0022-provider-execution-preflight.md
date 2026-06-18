# 0022: Provider Execution Preflight Before Adapter Calls

Date: 2026-06-15
Status: Draft
Thread: Composing runtime request defaults and credential resolution before provider adapter execution.

## Hook

The safest provider call is the one that can fail before it reaches the provider.

Opzava now has a preflight boundary that proves settings and credentials are valid before adapter execution is even in scope.

## Product Stakes

Opzava can now build provider requests from runtime settings and resolve live credentials through an injected resolver. The next product risk is allowing execution code to decide the order of those checks itself.

This slice centralizes the ordering: settings first, request validation second, credential resolution third, adapter execution later.

## Industry Counterfactual

The common shortcut is to put all provider preparation inside the adapter call path.

That means a missing setting, invalid operation, or unavailable credential is discovered at the same place as a network call. The failure becomes harder to classify, harder to redact, and harder to test.

Opzava now has a typed preflight result before live provider execution exists.

## What We Built

We added `createProviderExecutionPreflight`.

The preflight boundary:

- builds the provider request through `createRuntimeProviderAdapterRequest`
- returns a closed `runtime-settings-unavailable` error before credential resolution
- resolves credentials only after request construction succeeds
- returns a closed `secret-resolution-failed` error for typed secret failures
- lets request construction and unexpected resolver invariant errors throw as programmer errors
- returns the constructed request and resolved credential for later execution

## What We Refused To Fake

We did not call provider adapters.

We did not call live providers.

We did not add a concrete secret store.

We did not read environment variables or files.

We did not log or serialize credentials.

We did not generate request IDs or idempotency keys.

## Evidence

Files changed:

- `src/opzava/platform/providers/preflight-runtime.ts`
- `src/opzava/platform/providers/preflight-runtime.test.ts`

The tests cover:

- unavailable runtime settings return before resolver calls
- mock provider requests preflight without credential resolution
- live provider requests resolve credentials once
- preflight uses runtime provider timeout and retry defaults
- typed secret resolution failures return typed preflight errors
- invalid operations throw before resolver calls
- unexpected resolver throws surface as credential invariant errors
- preflight error kinds are closed for callers
- the module source does not import provider execution, filesystem reads, env reads, logging, or ID generation

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/preflight-runtime.test.ts: failed before implementation because ./preflight-runtime did not exist
pnpm vitest run src/opzava/platform/providers/preflight-runtime.test.ts: passed 8/8 after implementation
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 32/32
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 42/42
pnpm test: passed 126 files / 1216 tests
```

MiniMax-M3 reviewed the slice before implementation and flagged must-fix coverage for closed preflight error kinds, typed causes, explicit throwing-vs-returning behavior, resolver ordering, request provenance, and no execution/env/fs/logging/ID side effects.

## The Automation Lesson

Preflight is where automation earns permission to execute.

Provider execution should only begin after settings are present, the operation is allowed, idempotency is pinned, and credentials resolve through the approved boundary.

## Next Case Study Thread

The next build thread should connect preflight to provider execution events without enabling live adapters by default:

- blocked preflight failures become redacted operational events
- successful preflight can call mock adapters only
- live adapters remain gated by explicit approval and provider profile mode
- no external provider side effects until approvals are proven
