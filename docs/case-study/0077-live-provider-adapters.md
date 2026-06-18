# 0077: Live Provider Adapters
Date: 2026-06-17
Status: Draft
Thread: We wrapped the live callers for WordPress and Resend as platform `ProviderAdapter`s, plugging them into the existing exactly-once and approval-guarded execution boundary. This ensures live external actions are safe, auditable, and refuse to run without explicit approval and a resolved connection.

## Hook
The platform had a powerful, safe execution model for internal and mocked actions, but live external calls were still isolated, bespoke functions. We needed to bring them into the fold without compromising the safety guarantees that make the system trustworthy.

## Product Stakes
If live actions bypass the platform's core safety mechanisms (idempotency, approval gates), a single misconfiguration or bug could lead to duplicate posts, spam emails, or unauthorized actions. This erodes user trust and makes the system unpredictable. The stakes are about maintaining a single, consistent contract for all actions, live or not.

## Industry Counterfactual
The common approach is to have "live" and "test" code paths that are fundamentally different. The live path often has its own ad-hoc retry, logging, and error handling, which drifts from the platform's core logic. This creates a maintenance burden and a higher risk surface where the most critical actions (live ones) are the least standardized.

## What We Built
We created two new `ProviderAdapter` implementations:
- `createLiveWordpressProviderAdapter`
- `createLiveResendProviderAdapter`

Each factory takes injected dependencies (`connection`, `http`, `now`) and returns a `ProviderAdapter` whose `execute` method:
1.  Parses the typed `request.input`.
2.  Calls the existing live caller (`createWordpressDraft` or `sendResendEmail`).
3.  Maps the result to a validated `ProviderAdapterResult` (`succeeded` with output `{externalPostId}` or `{messageId}`, or `failed` with error class `'provider-error'`).

We also defined corresponding `ProviderProfile`s (`createLiveWordpressProviderProfile`, `createLiveResendProviderProfile`) with `mode: 'live'`, the correct `kind`, and a `credentialRef` pointing to a `SecretReference`.

## What We Refused To Fake
- **No real network in tests:** The `http` client is injected, allowing tests to use a fake. No live calls are made during testing.
- **No bypassing platform gates:** These live adapters plug directly into the existing `reserve-before-execute` / `approval-guard` / `idempotency boundary` (slices 0028-0037). A live action is exactly-once and refused unless a granted approval and resolved connection exist.
- **No live auto-pilot:** The live kill-switch stays OFF by default. No action runs live without explicit configuration.
- **No secret leakage:** Secrets exist only in the `credentialRef` `SecretReference`, never in adapter outputs or logs.
- **No over-promise:** WordPress remains draft-only. The caller hard-codes `status: 'draft'`, and this constraint is carried through the adapter.

## Evidence
- 6/6 targeted tests pass.
- Full vitest suite: ~1531 tests across ~194 files pass.
- TypeScript compilation clean (`tsc`).
- ESLint reports 0 errors.

## Validation
Tests confirm:
- A successful call returns `succeeded` with the expected ID (`externalPostId` or `messageId`).
- A rejected or 401 response returns `failed` with error class `'provider-error'`.
- The profile is correctly identified as `mode: 'live'` with the right `kind`.

## The Automation Lesson
Standardizing the interface for live actions is not about adding bureaucracy; it's about applying the same hard-won safety guarantees (idempotency, approval, audit) to the most critical operations. The adapter pattern lets us do this without rewriting the underlying callers, creating a single, predictable contract for all platform actions.

## Next Case Study Thread
The Opzava-owned `CampaignWorkflow` for email automation per ARD 0004. Opzava will own the sequence, triggers, and approval logic; the Resend adapter will act as a thin worker. We will mock first, then gate live execution.
