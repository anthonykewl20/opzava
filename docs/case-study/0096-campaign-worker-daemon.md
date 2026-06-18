# 0096: Campaign Worker Daemon

## Problem

Opzava's campaign run route drains a single campaign on demand, but a deployment also needs a continuous background drain so scheduled sends fire as they come due. The SYSTEM owns scheduling and draining; a durable `RunnerWorker` exposes `runNext()` which leases and executes ONE due job or returns idle. This slice provides the long-running daemon that keeps that worker fed.

## Approach

A factory function `createCampaignWorkerDaemon` returns a `{ run }` handle. `run()` loops while `!shouldStop()`: it awaits `worker.runNext()`, counts the result, and if the status is `'idle'` it increments `idleSweeps` and awaits `sleep(idleDelayMs)`; otherwise it increments `processed`. The loop is fully deterministic because sleep and the stop signal are injected — production wires a `setTimeout`-based sleep and a SIGTERM/flag-based `shouldStop`, while tests use fakes with no real timers.

## Contract

```ts
createCampaignWorkerDaemon({
  worker:        { runNext(): Promise<RunResult> },
  sleep:         (ms: number) => Promise<void>,
  shouldStop:    () => boolean,
  idleDelayMs?:  number,          // default 1 000
  onResult?:     (r: RunResult) => void,
}): { run(): Promise<Report> }

Report = { iterations: number, processed: number, idleSweeps: number }
```

## Validation

Four tests using a `vi.fn` worker, fake sleep, and a counter-driven `shouldStop`:

1. **Drains two queued jobs then idles** — iterations 4, processed 2, idleSweeps 2, sleep called twice with the idle delay.
2. **Does nothing when `shouldStop` is already true** — worker never called, report is all zeros.
3. **Counts `failed-retry` and `failed-dead-letter` as processed, not idle** — no sleep invoked.
4. **Invokes `onResult` for every `runNext`** — callback receives each result in order.

No real timers.

## Security & Audit

No secret values, private credentials, tokens are touched by the daemon — it only sequences `runNext` calls; each job's content and the provider secret stay inside the worker/sender boundary. Injecting sleep and the stop signal keeps the loop testable and lets a deployment shut it down cleanly without a busy-spin (it sleeps only when idle).

## Next Case Study Thread

A thin daemon entrypoint/wiring that builds the real worker, a `setTimeout` sleep, and a process-signal stop — plus Layer-9 ops panels (content runs, failures/dead-letters, costs) and Layer-10 entropy/complexity guardrails.
