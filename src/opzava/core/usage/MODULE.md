<!-- agent-context: read this before editing the module -->

# core/usage — provider-agnostic usage view (ARD 0026 GP5)

## Purpose
The pure aggregator behind the operator's usage meters. `computeUsageView` folds the FLEET's own
dispatch samples into the plan's window shapes and overlays optional authoritative vendor data.
Config-as-data; pure `core/` (no `platform/`/`modules/`/`src/lib` imports).

## Public surface
- `contracts.ts` — `WindowSpec` (agnostic: `rolling-duration | calendar | credit-balance`), `BillingMode`
  (`subscription | token-plan | pay-per-use`), `UsageSample`, `AuthoritativeOverride`, `UsageWindowView`,
  `UsageView`, `ComputeUsageInput`.
- `compute.ts` — `computeUsageView(input) → UsageView` (pure).

## Invariants
1. **Pure `core/`.** No I/O, no side effects; the interface is the test surface.
2. **Honesty-model (i).** `used` is ALWAYS the FLEET count (Opzava's own dispatches). The vendor's
   `vendorLimit`/`vendorRemaining`/`resetAt` are SEPARATE, account-total fields — **never** `vendorLimit −
   used`. A shared subscription means the operator's interactive use is invisible to the fleet; the meter
   must show the two numbers distinctly.
3. **`limitReached` is single-path.** A baseline window is always `false`; only an `AuthoritativeOverride`
   flips it. `view.limitReached = any(window)`. So a no-signal account reads `false` honestly.
4. **Transparent passthrough.** An absent override ⇒ a `self-tracked` window; vendor fields null.
5. **`credits` is a vendor unit.** The fleet baseline can't measure it (reads 0); the overlay carries it.

## Editor guardrails
Do NOT let an override mutate `used`. Do NOT compute "remaining" as `limit − used`. Do NOT add a window
*kind* without keeping `computeWindow` exhaustive. Impure gathering (event store, balance endpoints, codex
`--json`) lives in `platform/providers/usage`, never here.

## Status
`computeUsageView` + the `WindowSpec` union built + tested (`compute.test.ts`, 10 = SEAM ACs 1–9/13).
The impure `UsageReader` gatherer + `OverlaySource` seam live in `platform/providers/usage`; the concrete
codex / balance overlays are the deferred make-it-live composition.
