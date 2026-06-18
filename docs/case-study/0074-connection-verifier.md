# 0074: Connection Verifier
Date: 2026-06-17
Status: Draft
Thread: A pure, fetch-injected verifier that validates saved provider connections without ever touching a real network in tests. It powers the "Test connection" button in settings and prepares the ground for live adapters.

## Hook
A user saves a WordPress site URL and a Resend API key. They click "Test connection." What happens? If the verifier makes a real HTTP call, the test suite is slow, flaky, and requires live credentials. If it fakes success, the button lies. We built a third path: inject the network layer, verify the truth, and never throw.

## Product Stakes
The "Test connection" button is a trust contract. A green checkmark means the credentials are valid and the endpoint is reachable *right now*. A red X with a clear message—"credentials rejected" or "could not reach"—tells the user exactly what to fix. Getting this wrong means users ship campaigns to broken endpoints or waste time debugging phantom credential issues.

## Industry Counterfactual
Most tools either hard-code `fetch` (making tests brittle) or mock the entire module (hiding integration bugs). We saw teams skip connection verification entirely, discovering failures only when a live campaign fired. Others built elaborate test harnesses with Docker containers for WordPress and fake API servers. We rejected both extremes.

## What We Built
Two functions in `connection-verifier.ts`: `verifyWordpressConnection` and `verifyResendConnection`. Both accept a `FetchLike` interface, so tests inject a mock. WordPress verification GETs `${siteUrl}/wp-json/` and interprets the response: reachable, rejected (401/403), or unreachable (thrown error). Resend verification GETs `api.resend.com/domains` with a Bearer token and applies the same logic. Every path returns a typed `{ok: boolean, message?: string}` result. The functions never throw.

## What We Refused To Fake
- **No real network in tests.** The injected `fetch` means unit tests run in milliseconds with zero external dependencies.
- **Never throw.** Every failure is a typed result object. Callers don't need try/catch.
- **No secret logging or persistence.** The verifier sees the credential, uses it once, and forgets.
- **Distinguish unreachable from rejected.** A 401 is a different problem than a timeout. The message tells the user which.

## Evidence
- 5/5 targeted tests pass: reachable WP, rejected WP creds, WP network failure, valid Resend key, rejected Resend key.
- Full vitest suite: ~1516 tests across ~190 files pass.
- `tsc` clean, zero type errors.
- ESLint: 0 warnings, 0 errors.

## Validation
The verifier is the first consumer of the saved connection objects. It proves the data model holds real credentials correctly. It also proves the `FetchLike` injection pattern works—later adapters will use the same interface. The "Test connection" button in the settings UI (Opus-designed) will call these functions and render the result.

## The Automation Lesson
Injecting the network boundary is not over-engineering. It's the minimum viable honesty. A verifier that can't be tested without live credentials is a verifier that won't be tested. A verifier that throws is a verifier that crashes the UI. Typed results + injected fetch = a component that tells the truth in production and in CI.

## Next Case Study Thread
A `/api/connections/test` route that exposes the verifier to the frontend, an Opus-designed "Test" button and status indicator in the settings UI, then the live WordPress and Resend adapters consuming the resolved connections (gated behind the verification result) plus the CampaignWorkflow (ARD 0004).
