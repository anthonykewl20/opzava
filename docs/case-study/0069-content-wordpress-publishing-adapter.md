# 0069: Content WordPress Publishing Adapter
Date: 2026-06-17
Status: Draft
Thread: The content pipeline's four generation providers (`kw`, `source`, `draft`, `fact-check`) all terminate at the `wordpress-draft` external action, but nothing executed that action. This case study adds the first non-generation provider on the Layer-7 boundary: a mock publishing adapter that creates draft-only receipts, completing the provider-side contract for the terminal step.

## Hook
The content pipeline emits a `wordpress-draft` external action. Without a publishing adapter, that action is a dead letter — the pipeline produces a draft request that nothing consumes. The mock adapter makes the boundary real.

## Product Stakes
Operators see a "publish to WordPress" step in the content pipeline. If that step silently drops, trust collapses. The adapter must prove the step works end-to-end (draft-only) before any live connection exists.

## Industry Counterfactual
Most teams wire a live WordPress client immediately, then scramble when credentials, rate limits, and error handling surface late. We invert: mock the boundary first, prove the contract, then layer live credentials via admin config.

## What We Built
- `wordpress-publishing-adapter.ts`: `WORDPRESS_DRAFT_CREATE_OPERATION='wordpress-draft-create'`. `createMockWordpressPublishingProviderProfile()` returns a `ProviderProfile` with `kind:'publishing'`, `mode:'mock'`, `allowedOperations:['wordpress-draft-create']`. `createMockWordpressPublishingProviderAdapter({now})` returns a `ProviderAdapter` whose `execute` parses a `WordpressDraftRequest` via `parseWordpressDraftRequest`, then returns a succeeded `ProviderAdapterResult` with output `{ externalDraftId:'wp-draft-<requestId>', status:'draft', sourceRequestId, title }`. The literal `'draft'` status means the mock can only create a draft — never publish.
- `wordpress-publishing-execution.ts`: `runWordpressPublishingCall(deps,input)` builds a `ProviderAdapterRequest`, routes through `executeProviderAdapterWithEvents` (emits `external-call`), appends `cost` + `audit` operational events. Same execution template as the four content providers, applied to publishing.
- Re-exports in `index.ts`.

## What We Refused To Fake
Publishing is structurally impossible: `output.status` is the literal `'draft'`, no publish path exists. We did not invent a new boundary — reuses the platform `ProviderAdapter`. We did not hardcode connection details — mock needs none; live will use admin-config + `SecretReference`. We did not skip cost/audit events. Fleet-built (mimo) + mimo-reviewed + verified.

## Evidence
- `vitest run src/opzava/modules/content/providers`: 27/27 across 10 files.
- Full repo `vitest run`: 1491/1491 across 184 files.
- `tsc` clean; `eslint` 0 errors; `node --test test/*.test.mjs` passed.

## Validation
Tests cover: adapter creates a draft-only result (`output.status` `'draft'`, `externalDraftId`/`sourceRequestId` from request); valid `ExternalCallRecord` (`providerId` `'mock-wordpress'`, operation `'wordpress-draft-create'`); profile is `publishing`-kind/mock scoped to the operation; malformed input rejects; `runWordpressPublishingCall` routes through the platform path and emits `external-call` + `cost` + `audit` (3 events).

## The Automation Lesson
A mock boundary adapter is cheap to build and expensive to skip. Without it, the pipeline's terminal action is untestable. With it, every upstream change (keyword selection, source fetching, draft generation, fact-checking) can be validated against a real provider contract — even before a live WordPress site exists.

## Next Case Study Thread
Add a WordPress-connection `AdminConfig` entry: site URL + credential as a `SecretReference`, editable via admin settings, surfaced in the setup wizard. This is the operator-config prerequisite for the live WordPress adapter. The live adapter itself remains gated on admin-config + secret-redaction + idempotency tests — still draft-only, never auto-publishing.
The Automation Lesson
Mocks should never bypass platform architecture. By forcing the mock publishing provider through the same event-driven `ProviderAdapter` routing as generation providers, we validate the execution pipeline's versatility. We test the exact operational constraints without risking external state changes.

## Next Case Study Thread
Implement the WordPress-connection `AdminConfig` entry. This must capture the site URL and credentials (as a `SecretReference`), editable via admin settings and surfaced in the setup wizard. Enabling the live adapter is gated on this admin-config prerequisite, alongside strict secret-redaction and idempotency tests, to safely enable live (but still draft-only) publishing.
