# 0014: Runner Daemon Loop Before Production Process Wiring

Date: 2026-06-15
Status: Draft
Thread: Turning the one-job worker into a bounded long-running loop without over-polling or ignoring shutdown.

## Hook

A worker that can run one job is not yet an operator-safe daemon.

Without a loop contract, it either spins too fast when idle or refuses to stop cleanly when the host asks it to shut down.

## Product Stakes

Opzava already has durable leases, retries, recovery, and provider execution receipts. The next risk is operational: the runner needs to keep polling without becoming a busy loop.

If the daemon polls continuously on idle queues, it wastes CPU and database capacity. If it ignores shutdown, deploys can interrupt leased work and leave recovery to clean up avoidable mess.

## Industry Counterfactual

The common shortcut is `while (true) runNext()`.

That works in a toy queue and fails under real operations: idle queues burn resources, transient database errors spin, and shutdown becomes a race against the process manager.

Opzava now has a small daemon primitive around the one-job worker.

## What We Built

We added `createRunnerDaemon`.

The daemon loop:

- stops before polling if its `AbortSignal` is already aborted
- calls the existing `runNext()` worker boundary one poll at a time
- continues immediately after non-idle work so due jobs are not delayed
- sleeps after idle polls with an injected `idleDelayMs`
- sleeps after worker errors with an injected `errorDelayMs`
- wakes early when shutdown is requested during the sleep
- rejects non-positive polling delays

## What We Refused To Fake

We did not start a real background process.

We did not add a process manager, cron entry, or service supervisor.

We did not add admin-managed polling settings yet.

We did not wire live providers into the daemon.

We did not claim sustained multi-worker throughput.

This slice only creates the bounded loop primitive that future process wiring can use.

## Evidence

Files changed:

- `src/opzava/platform/runner/daemon.ts`
- `src/opzava/platform/runner/daemon.test.ts`

The tests cover:

- already-aborted shutdown signals prevent polling
- idle polls back off and stop when shutdown happens during the wait
- successful or failed worker results continue immediately without sleeping
- worker errors back off instead of tight-looping
- non-positive delay settings are rejected

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/daemon.test.ts: failed before implementation because ./daemon did not exist
pnpm vitest run src/opzava/platform/runner/daemon.test.ts: passed 5/5 after implementation
pnpm vitest run src/opzava/platform/runner/*.test.ts: passed 54/54
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 24/24
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 34/34
pnpm test: passed 118 files / 1168 tests
```

MMX review found no grounded must-fix issues for this slice. Its advisory feedback is carried into the next thread: admin-managed settings and multi-worker measurement.

## The Automation Lesson

Polling is a production behavior, not glue code.

Even before the daemon is wired to a real process, the loop needs evidence that it will not hammer the database or ignore shutdown.

## Next Case Study Thread

The next build thread should move from the daemon primitive toward operator-controlled execution settings:

- admin-managed runner polling delays
- admin-managed retry and timeout settings
- provider-specific retry policy selection
- sustained multi-worker contention and throughput measurements
