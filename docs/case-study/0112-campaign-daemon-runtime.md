# 0112: Campaign Daemon Runtime

## Problem

The campaign worker and drain daemon existed and were tested in isolation, but there was no production entrypoint wiring them together with real timer-based sleep and a flag-based stop signal. A deployment needed a single function to start the daemon loop and shut it down cleanly on SIGTERM — without sacrificing unit-testability.

## Approach

Three small, composable primitives:

- **`createTimerSleep(setTimeoutFn)`** — returns `(ms) => Promise` wrapping `setTimeout`. The timer source is injected, so tests never wait.
- **`createStopSignal()`** — returns `{ stop(), shouldStop() }`, a tiny mutable flag a deployment flips on SIGTERM.
- **`runCampaignDaemon(deps)`** — builds the campaign runner worker, hands it to the drain daemon with `sleep` defaulting to the timer sleep and `shouldStop` defaulting to a never-stop predicate, and returns a report `{ iterations, processed, idleSweeps }`.

The entrypoint does zero I/O itself; it only sequences existing components.

## Contract

```ts
createTimerSleep(sett?: typeof setTimeout): (ms: number) => Promise<void>
createStopSignal(): { stop(): void; shouldStop(): boolean }
runCampaignDaemon(deps?: {
  sleep?: (ms: number) => Promise<void>
  shouldStop?: () => boolean
}): Promise<{ iterations: number; processed: number; idleSweeps: number }>
```

`runCampaignDaemon` resolves when `shouldStop()` returns true. All dependencies are optional with sensible defaults.

## Validation

Five tests, **none using real timers**:

1. `createStopSignal` — `shouldStop()` is false initially, true after `stop()`.
2. `createTimerSleep` — resolves via an injected fake timer and forwards the delay value.
3. `runCampaignDaemon` — drains an empty queue to idle, then stops via a counter-based `shouldStop` with an injected sleep. Asserts `processed === 0`, `idleSweeps > 0`, sender never called.
4. `runCampaignDaemon` — does nothing when `shouldStop` is already true. Asserts zeroed report, sleep never called.
5. Default timer-sleep path — exercised without a real wait by stopping immediately after the first iteration.

## Security & Audit

No secret values, private credentials, tokens are introduced by the entrypoint — it only sequences the worker and sleep; each job's content and the provider secret stay inside the worker/sender boundary. Injecting sleep + stop keeps the loop testable and lets a deployment shut down cleanly without a busy-spin.

## Next Case Study Thread

A thin process/CLI launcher that resolves the live Resend sender from saved settings and calls `runCampaignDaemon` with a SIGTERM-bound stop signal. Plus a behavior-preserving complexity cleanup pass on the oversized settings/setup UI files.
