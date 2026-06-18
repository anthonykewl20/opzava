# 0020: Provider Request Runtime Defaults Before Live Execution

Date: 2026-06-15
Status: Draft
Thread: Building provider adapter requests from persisted runtime defaults without resolving secrets or calling providers.

## Hook

A provider request can look harmless while smuggling unsafe defaults.

Before Opzava calls any live provider, the request boundary has to prove where timeout and retry values come from.

## Product Stakes

Opzava now loads persisted admin settings and can construct a runner daemon from those settings. Provider execution needs the same discipline: runtime settings must decide provider timeouts and retry ceilings, not hard-coded call sites.

This slice gives future provider execution one request-construction boundary that snapshots persisted runtime defaults into the typed provider adapter request contract.

## Industry Counterfactual

The common shortcut is to build provider requests inline next to the adapter call, with a magic `30000` timeout and a guessed retry count.

That makes each integration drift. One provider call retries three times, another retries forever, and a third silently ignores operator settings.

Opzava now centralizes provider request defaults before any live adapter exists.

## What We Built

We added `createRuntimeProviderAdapterRequest`.

The factory:

- calls `loadRuntimeSettings()` exactly once
- returns `not_persisted` unavailable without parsing a provider request
- uses runtime provider `timeoutMs`
- uses runtime provider `retry.maxAttempts`
- forwards caller-owned request identity, operation, workflow run, step run, idempotency key, attempt number, input, summary, and timestamp
- delegates provider request validation to `parseProviderAdapterRequest`

## What We Refused To Fake

We did not resolve provider credentials.

We did not call provider adapters.

We did not call live providers.

We did not read environment variables.

We did not generate request IDs or idempotency keys.

We did not bypass operation allowlists or secret-free request validation.

## Evidence

Files changed:

- `src/opzava/platform/providers/request-runtime.ts`
- `src/opzava/platform/providers/request-runtime.test.ts`

The tests cover:

- missing persisted settings return the typed unavailable result
- missing settings do not parse/build a provider request
- runtime timeout and retry max attempts are used in the request
- caller-owned fields are forwarded without mutation
- `stepRunId: null` is valid while `undefined` is rejected by the contract
- operation allowlist violations bubble from provider contract validation
- `SecretReference` inside adapter input is rejected by provider contract validation
- attempts beyond runtime `maxAttempts` are rejected by provider contract validation
- the module source does not import provider execution, secret resolution, env reads, or ID generation

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/request-runtime.test.ts: failed before implementation because ./request-runtime did not exist
pnpm vitest run src/opzava/platform/providers/request-runtime.test.ts: passed 7/7 after implementation
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 30/30
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 40/40
pnpm test: passed 124 files / 1202 tests
```

MiniMax-M3 reviewed the slice before implementation and flagged must-fix coverage for field provenance, parser-owned retry validation, `stepRunId` null versus undefined, and structural no-secret/no-env/no-ID/no-provider side effects.

## The Automation Lesson

Provider calls should start from an operator-approved runtime snapshot, not hidden constants.

The request boundary is where Opzava proves a future live call carries the right timeout, retry ceiling, idempotency key, and operation allowlist before execution can happen.

## Next Case Study Thread

The next build thread should add the secret resolution boundary before live providers:

- resolve `SecretReference` only through an injected secret resolver
- return typed secret resolution failures without calling adapters
- redact failed secret resolution events
- keep live provider calls blocked until approvals and credentials are proven
