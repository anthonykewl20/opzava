# 0073: Connection Settings Resolver
Date: 2026-06-17
Status: Draft
Thread: This case study bridges the gap between saved admin settings and the future LIVE adapters. It establishes a pure, testable layer that validates configuration before any real-world API call is attempted.

## Hook
We had the settings saved (slices 0070-0072), but we needed a way to know if they were actually *usable*. The resolver is the gatekeeper: it takes raw key-value pairs and decides if a connection is ready for production, or if it should remain safely in draft mode.

## Product Stakes
If the resolver is wrong, the product either fails silently (a campaign goes out with a broken link) or blocks the user unnecessarily. By returning `null` for "not configured," we treat missing credentials as a normal state, not an error. This keeps the workflow fluid until the user is ready to go live.

## Industry Counterfactual
Most systems either throw an exception on missing config (breaking the UI) or, worse, try to connect and fail at runtime. We chose a third path: a pure function that answers "is this ready?" without side effects, making the state predictable and the UI responsive.

## What We Built
A dependency-injected resolver (`connection-settings-resolver.ts`) that reads settings via a `read(key)` function. It validates URLs and email formats, returning a typed connection object or `null`. Helper functions like `isWordpressConfigured` wrap this for easy checks.

## What We Refused To Fake
We refused to couple the resolver to the database. By injecting the `read` function, we made it pure and unit-testable. We also refused to treat "not configured" as an exception—it's a valid, expected state. The resolver validates but never logs or persists secrets.

## Evidence
- `resolveWordpressLiveConnection` and `resolveResendLiveConnection` return correct objects or `null`.
- `null` is returned for missing secrets, invalid URLs, or invalid email addresses.
- Full test suite: 1511/1511 passing; TypeScript clean; ESLint zero errors.

## Validation
The resolver is the single source of truth for connection readiness. It's tested in isolation, ensuring that when we later build the LIVE adapters, they can trust the input they receive. This is the foundation for reliable, real-world integrations.

## The Automation Lesson
Automation requires trust. By building a pure, testable resolver, we create a component we can trust completely. This allows us to build the next layers (adapters, workflows) with confidence, knowing the configuration layer is solid.

## Next Case Study Thread
Next, we build a "test connection" affordance—a backend route and a UI button to verify credentials work in practice. Then, the LIVE WordPress and Resend adapters will consume these resolved connections to make real calls, gated on idempotency and secret-redaction tests, leading into the Opzava-owned CampaignWorkflow (ARD 0004).
