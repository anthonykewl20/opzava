import type {
  AccountLiveState,
  AvailabilityLadderConfig,
  AvailabilityOutcome,
  AvailabilityRequest,
} from '@/opzava/core/routing/availability/contracts'
import { resolveAvailability } from '@/opzava/core/routing/availability/resolve'

/**
 * `makeAvailabilityResolver` (S6 / ARD 0026 GP3) — the impure gatherer for the availability dimension.
 * It aggregates the injected live readers into the per-account `AccountLiveState` snapshot the pure
 * `resolveAvailability` consumes, then delegates. The readers are INJECTED (the composition root wires
 * them from `provider-subscriptions` / `sessions` / `AccountCapacity` / the GP4 health store), so this
 * platform module never imports `src/lib` — layering stays clean and the assembly stays unit-testable.
 */

/** The metadata needed to resolve one account's live state. From the `AgentAccountProfile` config. */
export interface AccountProfileMeta {
  readonly profileId: string
  readonly provider: string // keys `getAuthFlags`
  readonly gatewayAgentName?: string // keys `getGatewayLiveness`; absent ⇒ direct-API (always gateway-live)
}

export interface AvailabilityResolver {
  resolve(request: AvailabilityRequest): AvailabilityOutcome
}

export interface AvailabilityResolverDeps {
  readonly getLadderConfig: () => AvailabilityLadderConfig
  readonly getProfiles: () => readonly AccountProfileMeta[]
  readonly getAuthFlags: () => Readonly<Record<string, boolean>> // provider → detected subscription auth
  readonly getGatewayLiveness: () => ReadonlyMap<string, { status: 'active' | 'idle' | 'offline' }>
  readonly getAtCapProfiles: (workspaceId: number) => ReadonlySet<string>
  readonly getHealthSignals: () => ReadonlyMap<string, 'ok' | 'degraded' | 'outage'>
}

export function makeAvailabilityResolver(deps: AvailabilityResolverDeps): AvailabilityResolver {
  return {
    resolve: (request: AvailabilityRequest): AvailabilityOutcome => {
      const authFlags = deps.getAuthFlags()
      const liveness = deps.getGatewayLiveness()
      const atCap = deps.getAtCapProfiles(request.workspaceId)
      const health = deps.getHealthSignals()

      const liveState = new Map<string, AccountLiveState>()
      for (const profile of deps.getProfiles()) {
        const gatewayLive = profile.gatewayAgentName
          ? (liveness.get(profile.gatewayAgentName)?.status ?? 'offline') !== 'offline'
          : true // a direct-API account has no gateway agent to be offline
        liveState.set(profile.profileId, {
          authenticated: authFlags[profile.provider] === true,
          gatewayLive,
          atCap: atCap.has(profile.profileId),
          health: health.get(profile.profileId) ?? 'ok',
        })
      }

      return resolveAvailability(request, deps.getLadderConfig(), liveState)
    },
  }
}
