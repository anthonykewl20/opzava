# 0019: Runtime Runner Daemon Construction Before Process Startup

Date: 2026-06-15
Status: Draft
Thread: Constructing the runner daemon from persisted runtime settings without starting execution.

## Hook

Loading settings is not the same as safely starting work.

The next seam had to prove Opzava can build a daemon from persisted settings while still refusing to run when settings are missing.

## Product Stakes

Opzava now has persisted admin settings and runtime projections. The product risk is process wiring that quietly falls back to defaults, starts polling with stale assumptions, or reaches for secrets and providers too early.

This slice gives process startup a small construction boundary: either settings exist and a daemon can be constructed, or startup receives a typed unavailable result.

## Industry Counterfactual

The common shortcut is to instantiate a worker loop with default polling intervals when configuration has not been saved yet.

That makes the system look alive while it is running on assumptions. In an automation control plane, assumed runtime behavior is a safety defect.

Opzava now constructs the runner daemon only after the runtime settings loader returns persisted options.

## What We Built

We added `createRuntimeRunnerDaemon`.

The factory:

- calls `loadRuntimeSettings()` exactly once
- returns `not_persisted` unavailable without constructing a daemon
- does not call the worker while constructing
- passes loaded runner options into `createRunnerDaemon`
- does not start the daemon loop automatically

## What We Refused To Fake

We did not start a process supervisor.

We did not resolve provider credentials or secrets.

We did not build provider requests.

We did not call live providers.

We did not invent fallback daemon defaults when persisted settings are missing.

## Evidence

Files changed:

- `src/opzava/platform/runner/daemon-runtime.ts`
- `src/opzava/platform/runner/daemon-runtime.test.ts`

The tests cover:

- missing settings return the typed unavailable result
- missing settings do not construct a daemon
- missing settings do not call `worker.runNext()`
- successful settings load passes `worker`, `signal`, `idleDelayMs`, and `errorDelayMs` into daemon construction
- successful construction still does not poll the worker

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/daemon-runtime.test.ts: failed before implementation because ./daemon-runtime did not exist
pnpm vitest run src/opzava/platform/runner/daemon-runtime.test.ts: passed 2/2 after implementation
node --test test/check-plan.test.mjs: passed 29/29
pnpm run typecheck: passed
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 39/39
pnpm test: passed 123 files / 1195 tests
```

MMX reviewed the slice before implementation and flagged the must-fix tests for single loader call, no daemon construction on unavailable settings, no worker polling during construction, and no secret/provider/env side effects.

## The Automation Lesson

Construction is a boundary, not a side effect.

If startup cannot load persisted operator settings, it should report that explicitly instead of quietly beginning work with defaults.

## Next Case Study Thread

The next build thread should apply loaded runtime settings to provider request defaults while keeping secret resolution behind a separate boundary:

- provider request default construction from loaded settings
- explicit unavailable behavior before provider execution
- secret resolution boundary tests before live providers
- no live provider calls until credentials and approvals are proven
