# 0075: Live WordPress Draft Publisher
Date: 2026-06-17
Status: Draft
Thread: The first live external publisher in Opzava, creating WordPress drafts via the REST API with a hard-coded `status:'draft'` invariant. This slice establishes the injected-HTTP pattern for all future live publishers.

## Hook
For months, Opzava could resolve connections, prepare content, and simulate publishing — but never actually touch the outside world. Slice 0075 changes that. It is the first function that makes a real HTTP call to a real external service, and it does so under a constraint that matters more than the call itself: it can only ever create a draft.

## Product Stakes
A user who connects their WordPress site and approves a piece of content expects to see a draft appear in their WordPress admin. If that draft never materializes, the entire upstream pipeline — connection resolution, content preparation, approval gating — is theater. Conversely, if the system ever publishes without explicit user action, trust is destroyed instantly. The `status:'draft'` hard-coding is not a shortcut; it is the product contract.

## Industry Counterfactual
Most content automation tools blur the line between "prepare" and "publish." They offer a toggle, a checkbox, a "publish immediately" default that one mis-click activates. The result is premature posts, retracted articles, and eroded confidence. Opzava refuses this pattern entirely: the function signature itself makes publishing impossible.

## What We Built
`createWordpressDraft` in `src/opzava/modules/content/providers/wordpress-live-publisher.ts` accepts a `WordpressLiveConnection` (slice 0073), a `WordpressDraftRequest` artifact (slice 0061), an injected `HttpClient`, and an optional `username`. It POSTs to `${siteUrl}/wp-json/wp/v2/posts` with HTTP Basic auth (`user:appPassword` base64-encoded) and a body containing `{title, content: bodyMarkdown, status: 'draft'}`. The `status` field is a string literal, not a parameter — the compiler enforces the invariant.

The function never throws. It returns a typed `WordpressDraftCreateResult` with `{ok, status: 'draft', externalPostId, message}`. A 401 or 403 maps to `"credentials rejected"`. Any other non-OK status maps to the status message. A thrown error (network failure) maps to `"could not reach"`. Every failure path is a value, never an exception.

## What We Refused To Fake
Four invariants, each carried into the live call deliberately:

1. **Cannot publish.** The `status:'draft'` literal is hard-coded. There is no parameter, no override, no environment variable. The no-auto-publish invariant from the design layer is enforced at the call site.
2. **No real network in tests.** The `HttpClient` is injected as a typed dependency. Unit tests supply a fake that records the call and returns controlled responses. No HTTP server is started. No DNS is resolved.
3. **Never throws.** Every caller can pattern-match on `ok` without wrapping in try/catch. This is a deliberate ergonomic and safety choice.
4. **Credentials used, never exposed.** The app password is used to construct the Authorization header and then exists nowhere in the return value, logs, or error messages.

## Evidence
- 4/4 targeted tests pass: successful draft creation with `externalPostId` returned and body containing `"status":"draft"`; 401 rejection; 500 error status; network failure.
- Full Vitest suite: ~1520 tests across ~191 files, all green.
- `tsc` clean, zero type errors.
- ESLint: zero warnings, zero errors.

## Validation
The test suite validates the contract, not the implementation. Each test asserts on the returned shape and message, not on internal HTTP client call details (though the fake records them for debugging). The 401 test proves credential rejection is surfaced to the caller. The 500 test proves arbitrary server errors are mapped cleanly. The network failure test proves thrown exceptions are caught and converted. The success test proves the `externalPostId` is extracted and the body literal contains `"status":"draft"`.

## The Automation Lesson
The hardest part of building a live publisher is not the HTTP call — it is deciding what the call is not allowed to do. By hard-coding `status:'draft'` and injecting the HTTP client, we made two commitments simultaneously: this function touches the real world, and it does so under constraints that no configuration, environment variable, or future refactor can accidentally violate. The injected client means tests are fast and deterministic. The never-throw contract means callers compose cleanly. The draft-only invariant means the user is always in control.

## Next Case Study Thread
The live Resend email sender follows the same injected-HTTP shape, then both publishers are wired behind the provider-adapter contract with idempotency reservation (exactly-once semantics) so a live draft or email is created at most once, gated on a granted approval and a resolved connection. The CampaignWorkflow (ARD 0004) orchestrates the full sequence.
