# 0016: Admin Settings Persistence Before Runtime Wiring

Date: 2026-06-15
Status: Draft
Thread: Persisting validated operator settings with value-free audit events before daemon or provider wiring.

## Hook

A setting is not operationally safe until it survives restart and leaves an audit trail.

But the audit trail cannot become a second place where settings values or credential references leak.

## Product Stakes

Opzava now has typed admin settings for runner polling, retries, provider timeouts, rate limits, cost limits, provider selection, and credential references. The next risk is persistence.

If settings are only in memory, operators cannot trust restarts. If settings audits store full values, credential references and operational knobs become leakable history.

## Industry Counterfactual

The common shortcut is to save a JSON blob and log the before/after values.

That works until a credential reference, endpoint, or sensitive operational setting lands in an audit payload that lasts forever.

Opzava now persists settings and emits audit events that record changed paths, not values.

## What We Built

We added `createAdminSettingsRepository`.

The repository:

- creates idempotent SQLite schema for the singleton settings record and settings audit events
- returns `null` before settings are saved
- persists parsed `OpzavaAdminSettings` with a monotonic version
- round-trips `SecretReference` values without resolving them
- inserts one `admin.settings.updated` audit event per save
- stores audit summaries with `versionBefore`, `versionAfter`, and `changedPaths` only

We also hardened `diffOpzavaAdminSettings` so a changed `SecretReference` is detected even when the scope stays the same, while diff output still contains only path and kind.

## What We Refused To Fake

We did not resolve secrets.

We did not wire persisted settings into the daemon.

We did not wire persisted settings into provider request creation.

We did not build a settings UI or HTTP route.

We did not add live providers.

This slice only proves durable storage and value-free audit for validated settings.

## Evidence

Files changed:

- `src/opzava/platform/admin-config/repository.ts`
- `src/opzava/platform/admin-config/repository.test.ts`
- `src/opzava/platform/admin-config/settings.ts`
- `src/opzava/platform/admin-config/settings.test.ts`

The tests cover:

- fresh repositories return no settings
- settings round-trip with `SecretReference` records intact
- save operations emit one audit event with expected action, actor, target, correlation id, and version summary
- audit events omit secret reference ids, purposes, and setting values
- later saves increment the version and audit only changed paths
- schema creation is idempotent
- secret reference changes are detected without exposing reference identity in diffs

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/admin-config/*.test.ts: failed before implementation because ./repository did not exist
pnpm vitest run src/opzava/platform/admin-config/*.test.ts: passed 18/18 after implementation
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 26/26
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 36/36
pnpm test: passed 120 files / 1182 tests
```

MMX reviewed the slice and found no grounded must-fix issues. Advisory follow-ups were redacted forensic snapshots, migration story, authenticated actor identity, audit pagination, and shared clock sourcing.

## The Automation Lesson

Auditability is not the same as dumping state into logs.

For settings, the safe receipt is who changed the settings, which paths changed, and which version resulted, not the values themselves.

## Next Case Study Thread

The next build thread should connect persisted settings to runtime boundaries:

- construct daemon options from validated persisted settings
- construct provider request defaults from validated persisted settings
- emit audit events when runtime settings are loaded or rejected
- add secret resolution boundary tests before live providers
