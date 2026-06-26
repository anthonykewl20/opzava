<!-- agent-context: read this before editing the module -->

# platform/availability — AvailabilityResolver gatherer (ARD 0026 GP3 / S6)

## Purpose
The impure half of the third routing dimension. `makeAvailabilityResolver` aggregates the live fleet state
— detected subscription auth + gateway-agent liveness + `AccountCapacity` at-cap + GP4 health — into the
per-account `AccountLiveState` snapshot the pure `core/routing/availability/resolveAvailability` consumes,
then delegates. Mirrors the pure-core/impure-platform split of `core/usage` ↔ `providers/usage`.

## Public surface
- `AvailabilityResolver` — `resolve(request) → AvailabilityOutcome`.
- `makeAvailabilityResolver(deps)` — `deps` **inject** the readers: `getLadderConfig`, `getProfiles`,
  `getAuthFlags`, `getGatewayLiveness`, `getAtCapProfiles`, `getHealthSignals`.
- `AccountProfileMeta` — `{ profileId, provider, gatewayAgentName? }`.

## Invariants
1. **No `src/lib` import.** Readers are injected (the composition root bridges Engine A), so this stays
   Engine-B-clean and unit-testable with stubs.
2. **Direct-API accounts (no `gatewayAgentName`) are always gateway-live** — there's no agent to be offline.
3. All routing logic lives in the pure resolver — this layer only assembles `liveState` and delegates.
4. Pass `getAtCapProfiles` the request's `workspaceId` (capacity is workspace-scoped).

## Status
`makeAvailabilityResolver` built + tested (`resolver.test.ts`, 8). **Follow-on (S5 composition):** wire the
readers to `getProviderSubscriptionFlags` / `getAgentLiveStatuses` / the at-cap set / the GP4 store at the
orchestrator composition root, and feed `resolve` into assign-to-worker. One merged `ModelTier` seed everywhere.
