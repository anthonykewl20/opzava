# 0012: Provider Adapter Contracts Before Live Calls

Date: 2026-06-15
Status: Draft
Thread: Defining the provider boundary before connecting real external systems.

## Hook

The dangerous part of a provider adapter is not the HTTP call.

It is what crosses the boundary.

## Product Stakes

Opzava is getting close to live provider work: LLM generation, publishing, search, email, and gateway calls. The risk is letting each adapter invent its own input shape, credential handling, retry metadata, and logging behavior.

That would turn every integration into a new security and observability exception.

## Industry Counterfactual

The common shortcut is to pass a provider SDK whatever object is convenient, then log whatever comes back.

That works until a credential, raw prompt, provider error body, or tenant-specific payload lands in an audit trail.

Opzava now has a provider adapter boundary before any live adapter exists.

## What We Built

We added provider adapter request and result contracts.

The contracts:

- keep live credentials represented as `SecretReference`
- require provider-scoped `allowedOperations` before adapter dispatch
- reject secret references inside provider input and persisted summaries
- require bounded retry and timeout metadata at the provider boundary
- require failed provider results to carry a bounded error summary
- turn adapter results into `ExternalCallRecord` without serializing credential references
- provide an audit-safe adapter request view that redacts provider credential references

We also defined a typed `ProviderAdapter` interface without adding any live provider implementation.

## What We Refused To Fake

We did not call a live provider.

We did not hard-code a model, endpoint, API key, or publishing URL.

We did not store raw provider payloads in `ExternalCallRecord`.

We did not treat provider errors as safe to persist by default.

We did not allow arbitrary string dispatch to provider operations; the operation must be present in the provider profile allowlist.

This slice only defines the contract that live providers must obey later.

## Evidence

Files changed:

- `src/opzava/platform/providers/contracts.ts`
- `src/opzava/platform/providers/contracts.test.ts`

The tests cover:

- live adapter requests can carry provider credentials only as `SecretReference`
- external call records built from adapter results do not leak credential reference IDs or purposes
- audit-safe adapter request serialization redacts provider credential references
- provider operations must be allowed by the profile before dispatch
- provider input cannot smuggle secret references
- provider output summaries cannot contain secret references
- failed provider results must include a bounded error summary
- existing provider profile and external call record validations remain intact

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/contracts.test.ts: failed before implementation because adapter contract functions did not exist
pnpm vitest run src/opzava/platform/providers/contracts.test.ts: passed 10/10 after implementation and MMX hardening
pnpm vitest run src/opzava/platform/providers/contracts.test.ts src/opzava/platform/admin-config/contracts.test.ts src/opzava/platform/audit/contracts.test.ts src/opzava/platform/runner/repository-contracts.test.ts: passed 21/21
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 22/22
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 32/32
pnpm test: passed 116 files / 1159 tests
```

## The Automation Lesson

Provider integrations should be boring by the time they touch the network.

The boundary should already know what is allowed in, what is safe to persist, and what must never be logged.

## Next Case Study Thread

The next build thread should move from contracts toward execution plumbing:

- redacted external call event emission from provider execution
- daemon polling cadence
- admin-managed retry and timeout settings
- provider-specific retry policy selection
- sustained multi-worker contention and throughput measurements
