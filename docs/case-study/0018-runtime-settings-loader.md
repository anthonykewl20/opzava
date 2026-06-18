# 0018: Runtime Settings Loader Before Runtime Wiring

Date: 2026-06-15
Status: Draft
Thread: Loading persisted admin settings into runtime option projections without starting execution.

## Hook

Persisted settings are still inert until runtime code has one safe way to load them.

But the loader must not quietly invent defaults when settings are missing.

## Product Stakes

Opzava now has typed settings, durable settings storage, value-free settings audit, and pure runtime projections. The next risk is runtime construction code reading persistence directly and each caller deciding what “missing settings” means.

This slice gives future daemon and provider wiring one typed loading boundary.

## Industry Counterfactual

The common shortcut is to call `getSettings()` wherever settings are needed and fallback to defaults if nothing is stored.

That hides misconfiguration. In a system that controls provider calls, retries, timeouts, and future side effects, missing settings should be explicit.

Opzava now returns a typed unavailable result when settings have not been persisted.

## What We Built

We added `createRuntimeSettingsLoader`.

The loader:

- depends only on a repository `getSettings()` method
- returns `{ ok: false, error: { kind: 'unavailable', reason: 'not_persisted' } }` when settings are absent
- validates persisted metadata before use
- projects persisted settings through `projectRuntimeOptions`
- propagates repository failures without wrapping them

## What We Refused To Fake

We did not start the daemon.

We did not build provider requests.

We did not resolve secrets.

We did not create defaults when persisted settings are missing.

We did not add a settings UI or API route.

This slice only proves the loader boundary future runtime wiring will consume.

## Evidence

Files changed:

- `src/opzava/platform/admin-config/runtime-loader.ts`
- `src/opzava/platform/admin-config/runtime-loader.test.ts`

The tests cover:

- missing persisted settings return a typed unavailable result
- persisted settings load into projected runtime options
- projection outputs match the existing runtime projection functions
- source settings are not mutated by loading
- invalid persisted version metadata is rejected
- invalid persisted update timestamps are rejected
- repository failures propagate unwrapped

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/admin-config/runtime-loader.test.ts: failed before implementation because ./runtime-loader did not exist
pnpm vitest run src/opzava/platform/admin-config/*.test.ts: passed 29/29 after implementation
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 28/28
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 38/38
pnpm test: passed 122 files / 1193 tests
```

MMX reviewed the slice and found no grounded must-fix issues. Advisory follow-ups were a named corrupt-settings error, stricter timestamp parsing, and future observer/loader expansion.

## The Automation Lesson

Missing configuration is not a default.

The runtime should know the difference between “settings are not persisted yet” and “settings are corrupt,” because those failures require different operator responses.

## Next Case Study Thread

The next build thread should wire loaded runtime options into execution construction:

- daemon construction from loaded settings
- explicit failure when settings are unavailable
- provider request defaults from loaded settings
- secret resolution boundary tests before live providers
