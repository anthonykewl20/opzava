# 0076: Live Resend Email Sender
Date: 2026-06-17
Status: Draft
Thread: The live email counterpart to 0075. This module sends real emails via the Resend API, consuming the resolved connection from 0073 and injecting the HTTP client to keep production code pure and tests deterministic.

## Hook
Sending an email is the moment the system stops talking to itself and starts talking to a person. If the draft (0075) is the rehearsal, this is opening night. A single malformed header, a leaked key, or an unhandled timeout can break trust with both the recipient and the platform. We needed a sender that was boringly reliable.

## Product Stakes
An email that fails to send is a silent failure. The user sees a "sent" status, but the recipient sees nothing. Worse, an unhandled exception could crash the workflow, leaving the campaign in a broken state. This module is the final gatekeeper before content leaves our control.

## Industry Counterfactual
Most systems couple the HTTP client directly, making tests slow and flaky. They throw exceptions on network errors, forcing callers to write defensive try/catch blocks everywhere. They often log or return sensitive data like API keys in error messages. We refused all of these patterns.

## What We Built
A single function, `sendResendEmail`, that takes a `connection`, a `message`, and an injected `http` client. It constructs the `from` field safely (`fromName ? \`${fromName} <${fromAddress}>\` : fromAddress`), builds the body with `html` or `text`, and POSTs to `api.resend.com/emails` with a `Bearer` token. It never throws. It returns a typed `ResendSendResult` with `ok`, `messageId`, and `message`.

## What We Refused To Fake
1.  **No real network in tests.** The `http` client is injected (`ResendHttpClient`), so unit tests use a fake. No mocking libraries, no environment variables, no flaky integration tests.
2.  **Never throws.** The function signature is `Promise<ResendSendResult>`. All failure modes (401, 500, network down) are captured in the result's `message` field.
3.  **API key is used, not exposed.** The key is used for the `Authorization` header but is never logged, returned, or included in error messages.
4.  **From-name composition is safe.** The template literal handles the presence or absence of `fromName` without string concatenation bugs.

## Evidence
- **Targeted tests:** 5/5 pass.
- **Full suite:** ~1525 tests across ~192 files pass.
- **Type safety:** `tsc` clean.
- **Linting:** `eslint` reports 0 issues.
- **Test cases:** Successful send returns message id and verifies body contains `"Opzava <news@example.com>"`; 401 returns "rejected the API key"; 500 returns status message; network failure returns "could not reach".

## Validation
The module is validated by its test suite, which covers every branch of the `ResendSendResult` logic. The injected `http` client makes the tests fast, deterministic, and free of side effects. The typed result forces callers to handle all outcomes explicitly.

## The Automation Lesson
Dependency injection isn't just for large frameworks. A single injected function parameter (`http`) transformed a potentially flaky, slow, and opaque module into a fast, deterministic, and transparent one. The cost was one extra argument in the function signature. The payoff was a test suite that runs in milliseconds and a production module that cannot leak secrets or throw surprises.

## Next Case Study Thread
Wire both live callers (0075 WP draft + 0076 Resend) behind the platform provider-adapter contract with idempotency reservation (exactly-once — a live draft/email created at most once), gated on a granted approval and a resolved connection. Then, build the Opzava-owned `CampaignWorkflow` for email automation per ARD 0004.
