# 0021: Provider Credential Resolution Boundary Before Live Providers

Date: 2026-06-15
Status: Draft
Thread: Resolving provider credential references through an injected boundary without calling adapters.

## Hook

The safest secret is the one the runtime cannot reach by accident.

Before Opzava can call live providers, credential resolution has to be explicit, injected, typed, and value-free in audit paths.

## Product Stakes

Opzava now builds provider adapter requests from persisted runtime defaults. The next risk is letting provider execution code reach directly into environment variables, files, or a future secret store.

This slice gives future live execution one credential boundary: mock providers skip resolution; live providers resolve only the `SecretReference` already attached to the typed provider profile.

## Industry Counterfactual

The common shortcut is to read `process.env.PROVIDER_API_KEY` inside the adapter or request builder.

That hides credential provenance, bypasses admin settings, and makes it hard to audit why a provider call was allowed.

Opzava now requires an injected resolver before an in-memory provider credential can exist.

## What We Built

We added `resolveProviderCredentialForRequest`.

The boundary:

- validates the provider profile before resolver calls
- skips the resolver for mock provider requests
- calls the resolver exactly once for live provider requests
- passes the exact request `SecretReference` to the resolver
- returns typed `SecretResolutionFailure` values when resolution fails
- wraps throwing resolvers in a generic invariant error without leaking resolver error text
- returns the same request reference so downstream correlation remains stable

## What We Refused To Fake

We did not implement a concrete secret store.

We did not read environment variables.

We did not read secret files.

We did not log or serialize secret values.

We did not call provider adapters.

We did not call live providers.

## Evidence

Files changed:

- `src/opzava/platform/providers/credentials-runtime.ts`
- `src/opzava/platform/providers/credentials-runtime.test.ts`

The tests cover:

- mock provider requests do not call the resolver
- live provider requests call the resolver exactly once with the request credential reference
- resolved credentials include provider id, reference, and in-memory secret value
- failed resolution returns a typed failure
- audit redaction hides secret reference id and purpose
- malformed live profiles throw before resolver calls
- throwing resolvers are wrapped without leaking raw resolver error text
- the module source does not import provider execution, filesystem reads, env reads, logging, or ID generation

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/credentials-runtime.test.ts: failed before implementation because ./credentials-runtime did not exist
pnpm vitest run src/opzava/platform/providers/credentials-runtime.test.ts: passed 6/6 after implementation
node --test test/check-plan.test.mjs: passed 31/31
pnpm run typecheck: passed
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 41/41
pnpm test: passed 125 files / 1208 tests
```

MiniMax-M3 reviewed the slice before implementation and flagged must-fix coverage for profile validation before resolver calls, exact resolver call count, credential-reference provenance, typed invariant errors, throwing resolver handling, audit redaction, and structural no-env/no-fs/no-log/no-provider side effects.

## The Automation Lesson

Live provider credentials should enter the runtime through one controlled seam.

That seam must be injectable and testable before the product is allowed to know where secrets are physically stored.

## Next Case Study Thread

The next build thread should combine provider request construction and credential resolution into a preflight boundary before adapter execution:

- return unavailable settings before resolving credentials
- return secret resolution failures before calling adapters
- preserve redacted operational events for blocked live provider calls
- keep actual live provider adapters disabled until approvals are proven
