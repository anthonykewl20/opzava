import type { ModelTier } from '../../model-tier/contracts'

/**
 * core/routing/availability contracts (ARD 0026 GP3 / S3) — the THIRD routing dimension.
 *
 * Pure `core/`: the resolver walks an operator-configured fallback ladder over an injected live-state
 * snapshot and returns a typed outcome (`assigned` | `halt` | `queue`). It is independent of
 * specialization (`assign-worker`) and capacity (`claimNext`) — the three dimensions compose, never fuse.
 * Locked invariants: frontier-required exhaustion ALWAYS halts (never downgrade, D4); worker exhaustion
 * queues (terminus A, GP3). `atCap` is a routing hint — `claimNext` remains the atomic authority.
 */

/** One rung of a fallback ladder. `accountProfileId` is the merge/claim key; `modelId` the ProviderPort model. */
export interface LadderRung {
  readonly accountProfileId: string
  readonly modelId: string
  readonly label?: string // informational ('external-cheap' | 'in-family-cheap' | …); order governs, not the label
}

/** Operator config (AdminConfig): ordered rungs per tier, with optional per-category overrides. */
export interface AvailabilityLadderConfig {
  readonly byTier: Partial<Record<ModelTier, readonly LadderRung[]>>
  readonly byCategory?: Partial<Record<string, Partial<Record<ModelTier, readonly LadderRung[]>>>>
}

/** The injected live state of one account (the platform materializes this; the resolver never probes). */
export interface AccountLiveState {
  readonly authenticated: boolean
  readonly gatewayLive: boolean
  readonly atCap: boolean // routing hint only — claimNext is the authority
  readonly health: 'ok' | 'degraded' | 'outage'
}

/** A per-rung eligibility predicate (pure). v1 ships `STANDARD_PREDICATES`; customs are a v2 extension. */
export type LivePredicate = (live: AccountLiveState) => boolean

export interface AvailabilityRequest {
  readonly requiredTier: ModelTier // 'frontier' ⇒ frontier-required (halts on exhaustion)
  readonly taskCategory?: string // selects `byCategory` before `byTier`
  readonly workspaceId: number
}

export interface ResolvedRung extends LadderRung {
  readonly rungIndex: number
  readonly accountHealth: 'ok' | 'degraded' // 'degraded' ⇒ caller surfaces a warning
}

export type HaltReason = 'not-configured' | 'all-accounts-down' | 'all-accounts-at-cap'
export type QueueReason = 'not-configured' | 'all-rungs-down' | 'all-rungs-at-cap'

export type AvailabilityOutcome =
  | { readonly kind: 'assigned'; readonly rung: ResolvedRung }
  | { readonly kind: 'halt'; readonly reason: HaltReason } // frontier-required; never downgrade
  | { readonly kind: 'queue'; readonly reason: QueueReason } // worker exhausted; terminus A
