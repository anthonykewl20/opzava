# 0017: Runtime Settings Projections Before Runtime Wiring

Date: 2026-06-15
Status: Draft
Thread: Projecting validated admin settings into runner, retry, and provider option shapes without side effects.

## Hook

Validated settings are not useful until runtime code can consume them without reinterpreting them.

But wiring settings directly into execution too early creates a hidden coupling point.

## Product Stakes

Opzava now persists typed operator settings with value-free audit events. The next risk is runtime drift: daemon, retry, and provider request code each need a different subset of the settings object.

If every caller picks fields manually, settings safety becomes copy-paste policy. Opzava needs one projection boundary before actual runtime wiring.

## Industry Counterfactual

The common shortcut is to pass the whole settings object everywhere.

That leaks unrelated knobs into modules that should not know about them and makes future changes harder to reason about.

Opzava now has pure projections that return only the fields each runtime boundary consumes.

## What We Built

We added runtime option projections:

- `projectRunnerDaemonOptions`
- `projectRetryPolicyOptions`
- `projectProviderAdapterDefaults`
- `projectRuntimeOptions`

The projections are pure and synchronous. They do not read the database, resolve secrets, start the daemon, or call providers.

## What We Refused To Fake

We did not add a repository loader.

We did not construct a live daemon.

We did not construct live provider requests.

We did not resolve secrets.

We did not add partial-setting merge behavior or environment overrides.

This slice only proves the shape transformation from validated settings to runtime option objects.

## Evidence

Files changed:

- `src/opzava/platform/admin-config/runtime-options.ts`
- `src/opzava/platform/admin-config/runtime-options.test.ts`

The tests cover:

- runner projection returns only `idleDelayMs` and `errorDelayMs`
- retry projection returns only the options consumed by `createExponentialRetryPolicy`
- provider projection returns timeout and max-attempt defaults only
- composed runtime options have stable `{ runner, retry, provider }` shape
- projections do not mutate the source settings object
- projected options are accepted by existing runner and retry constructors

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/admin-config/runtime-options.test.ts: failed before implementation because ./runtime-options did not exist
pnpm vitest run src/opzava/platform/admin-config/*.test.ts: passed 23/23 after implementation
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 27/27
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 37/37
pnpm test: passed 121 files / 1187 tests
```

MMX reviewed the slice and found no grounded must-fix issues. One advisory parity test for provider projection exact keys was added before documenting this entry.

## The Automation Lesson

Do not pass a giant settings object into every runtime component.

Projection functions keep runtime modules narrow: each boundary receives only the knobs it owns.

## Next Case Study Thread

The next build thread should load persisted settings through these projections:

- repository-backed runtime settings loader
- explicit behavior when settings are missing
- daemon construction from loaded projections
- provider request construction from loaded projections
- secret resolution boundary tests before live providers
