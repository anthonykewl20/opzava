<!-- agent-context: read this before editing the module -->

# platform/providers/usage — UsageReader gatherer (ARD 0026 GP5 / S4)

## Purpose
The impure half of the provider-agnostic usage port. `makeUsageReader` assembles the
`(samples, overrides)` snapshot per account — fleet samples from the operational-event store + vendor
overlays — and delegates to the pure `core/usage/computeUsageView`. Mirrors the `AvailabilityResolver`
pure-core/impure-platform split.

## Public surface
- `UsageReader` — `read(accountProfileId) → Promise<UsageView>`.
- `OverlaySource` — the agnostic per-provider seam: `fetch(accountProfileId, windows) → Map<windowId,
  AuthoritativeOverride>`; returns EMPTY for an unsupported account (→ transparent baseline). Adding a
  provider = adding one `OverlaySource`.
- `makeUsageReader(deps)` — `deps`: `getAccountUsageConfig`, `loadSamples`, `overlays[]`, `clock`,
  `compute?` (injected for testability).

## Invariants
1. **Never probe a subscription (GP4).** The codex `OverlaySource` reads STORED `codex --json` rate-limit
   events; only token-plan/pay-per-use overlays hit a FREE balance endpoint, on-demand.
2. **Overlays merge by `windowId`, first non-empty wins** — a given account is served by one overlay.
3. **Unconfigured account ⇒ a safe zero `UsageView`** (never throws).
4. The honesty rules live in the pure core — this layer only gathers; it never computes `used`.

## Status
`makeUsageReader` + `OverlaySource` seam built + tested (`reader.test.ts`, 4 = SEAM AC10 + gatherer).
**Follow-on (deferred make-it-live):** the concrete `OverlaySource`s — a codex rate-limit source (reads
stored events) + a balance-endpoint source — and `loadSamples` extending `provider-usage-reader` into the
plan-shaped windows; plus the AdminConfig usage config.
