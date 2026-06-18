# 0015: Admin Settings Contracts Before Runtime Wiring

Date: 2026-06-15
Status: Draft
Thread: Making operator-controlled runner and provider variables typed, bounded, redacted, and compatible before persistence or live providers.

## Hook

Configuration is code once it can change production behavior.

If runner delays, retry budgets, provider timeouts, or credentials are just loose settings, the system has a second untyped code path hiding in the admin panel.

## Product Stakes

Opzava already has a durable runner, provider execution receipts, and a bounded daemon loop. The next risk is letting operator-controlled values bypass those contracts.

The plan forbids hard-coded provider credentials, model choices, workflow limits, retry settings, and tunable values. That means admin settings need real schema boundaries before they are persisted or wired into execution.

## Industry Counterfactual

The common shortcut is to add a settings form and parse values where they are used.

That creates stringly typed runtime behavior: `"30000"` works somewhere, fails somewhere else, and eventually a cleartext token slips into logs or audit diffs.

Opzava now has a typed admin settings value object before runtime wiring.

## What We Built

We added `parseOpzavaAdminSettings` and `defaultOpzavaAdminSettings`.

The settings contract covers:

- runner polling delays and shutdown grace
- retry timing and max attempts
- provider request timeout
- provider rate and burst limits
- provider cost thresholds
- provider selection by operation
- provider credentials as `SecretReference` values only

The contract also adds:

- `redactOpzavaAdminSettingsForAudit`
- `diffOpzavaAdminSettings`

Diffs intentionally emit paths and value kinds only. They do not emit `from` or `to` values, so credential identifiers and purposes cannot leak through audit summaries.

## What We Refused To Fake

We did not add persistence.

We did not resolve secrets.

We did not wire settings into the daemon or provider execution path yet.

We did not add a settings UI.

We did not add live provider adapters.

This slice only proves the value object that future persistence and runtime wiring must consume.

## Evidence

Files changed:

- `src/opzava/platform/admin-config/settings.ts`
- `src/opzava/platform/admin-config/settings.test.ts`

The tests cover:

- default settings parse through the schema unchanged
- runner delay and shutdown bounds reject unsafe values
- retry bounds reject invalid policy settings
- provider timeout, rate, burst, and cost bounds reject unsafe values
- stringly typed numbers are rejected instead of coerced
- cleartext provider credentials are rejected in favor of `SecretReference`
- audit redaction removes secret reference ids and purposes
- diffs contain setting paths and kinds only, not secret-bearing values
- parsed defaults are compatible with the existing retry policy, daemon loop, and provider request contracts

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/admin-config/settings.test.ts: failed before implementation because ./settings did not exist
pnpm vitest run src/opzava/platform/admin-config/settings.test.ts: passed 8/8 after implementation
pnpm vitest run src/opzava/platform/admin-config/*.test.ts: passed 12/12
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 25/25
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 35/35
pnpm test: passed 119 files / 1176 tests
```

MMX reviewed the slice and found no grounded must-fix issues. Advisory follow-ups were persistence round-trip, secret resolution boundary tests, provider registry consistency, and runtime wiring semantics.

## The Automation Lesson

Admin settings are not a dumping ground for loose values.

They are the contract that lets operators change behavior without bypassing safety, redaction, retries, and timeout rules.

## Next Case Study Thread

The next build thread should wire settings into durable storage and runtime boundaries:

- persistence round-trip for `OpzavaAdminSettings`
- audit event emission for settings changes
- daemon construction from validated settings
- provider request construction from validated settings
- secret resolution boundary tests before live providers
