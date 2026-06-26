import { MODEL_TIER, type ModelTier, type ModelTierSeed } from '../../model-tier/contracts'
import { tierOf } from '../../model-tier/model-tier'
import type {
  AccountLiveState,
  AvailabilityLadderConfig,
  AvailabilityOutcome,
  AvailabilityRequest,
  LadderRung,
  LivePredicate,
} from './contracts'

// ── eligibility predicates (pure) ────────────────────────────────────────────
export const authLive: LivePredicate = (l) => l.authenticated
export const gatewayReachable: LivePredicate = (l) => l.gatewayLive
export const hasHeadroom: LivePredicate = (l) => !l.atCap
export const notOutage: LivePredicate = (l) => l.health !== 'outage'

/** The v1 eligibility set. A rung is eligible iff ALL pass. `degraded` health is eligible (passes notOutage). */
export const STANDARD_PREDICATES: readonly LivePredicate[] = Object.freeze([
  authLive,
  gatewayReachable,
  hasHeadroom,
  notOutage,
])

const TIER_RANK: Record<ModelTier, number> = { frontier: 3, standard: 2, economy: 1 }

/** Most-specific ladder wins: `byCategory[category][tier]` → `byTier[tier]` → undefined. */
function selectLadder(
  config: AvailabilityLadderConfig,
  request: AvailabilityRequest,
): readonly LadderRung[] | undefined {
  const byCat = request.taskCategory
    ? config.byCategory?.[request.taskCategory]?.[request.requiredTier]
    : undefined
  return byCat ?? config.byTier[request.requiredTier]
}

/**
 * `resolveAvailability` — pure. Selects the ladder for the request, walks its rungs in order, and returns
 * the first rung whose `AccountLiveState` satisfies all predicates. Terminus is a DERIVED INVARIANT:
 * `requiredTier === 'frontier'` ⇒ `halt`, else ⇒ `queue` (never silent downgrade). A missing live entry
 * is ineligible (down-class). No I/O.
 */
export function resolveAvailability(
  request: AvailabilityRequest,
  ladder: AvailabilityLadderConfig,
  liveState: ReadonlyMap<string, AccountLiveState>,
  predicates: readonly LivePredicate[] = STANDARD_PREDICATES,
): AvailabilityOutcome {
  const isFrontier = request.requiredTier === MODEL_TIER.FRONTIER
  const rungs = selectLadder(ladder, request)

  if (!rungs || rungs.length === 0) {
    return isFrontier
      ? { kind: 'halt', reason: 'not-configured' }
      : { kind: 'queue', reason: 'not-configured' }
  }

  // Track the exhaustion reason: at-cap only if EVERY ineligible rung failed solely on headroom.
  let allFailuresAtCap = true

  for (let i = 0; i < rungs.length; i++) {
    const rung = rungs[i]
    const live = liveState.get(rung.accountProfileId)
    if (!live) {
      allFailuresAtCap = false // a missing live entry is a down-class failure
      continue
    }
    if (predicates.every((p) => p(live))) {
      return {
        kind: 'assigned',
        rung: { ...rung, rungIndex: i, accountHealth: live.health === 'degraded' ? 'degraded' : 'ok' },
      }
    }
    const atCapOnly = live.authenticated && live.gatewayLive && live.health !== 'outage' && live.atCap
    if (!atCapOnly) allFailuresAtCap = false
  }

  if (isFrontier) {
    return { kind: 'halt', reason: allFailuresAtCap ? 'all-accounts-at-cap' : 'all-accounts-down' }
  }
  return { kind: 'queue', reason: allFailuresAtCap ? 'all-rungs-at-cap' : 'all-rungs-down' }
}

// ── config validation (pure; called at AdminConfig-save) ─────────────────────
export interface LadderConfigValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

/**
 * `validateLadderConfig` — pure. Catches operator misconfig before it becomes a routing failure:
 *   - every `accountProfileId` exists in `knownProfileIds`;
 *   - every `modelId` resolves (via the tier seed) to a tier ≥ the slot's tier (a frontier slot needs a
 *     frontier-capable model);
 *   - a `frontier` slot must be non-empty (an empty frontier ladder would always halt).
 */
export function validateLadderConfig(
  config: AvailabilityLadderConfig,
  knownProfileIds: ReadonlySet<string>,
  tierSeed: ModelTierSeed,
): LadderConfigValidationResult {
  const errors: string[] = []

  const checkSlot = (where: string, slotTier: ModelTier, rungs: readonly LadderRung[] | undefined): void => {
    if (slotTier === MODEL_TIER.FRONTIER && (!rungs || rungs.length === 0)) {
      errors.push(`${where}: frontier ladder is empty — it would always halt orchestration`)
    }
    for (const rung of rungs ?? []) {
      if (!knownProfileIds.has(rung.accountProfileId)) {
        errors.push(`${where}: unknown accountProfileId '${rung.accountProfileId}'`)
      }
      const rungTier = tierOf(rung.modelId, tierSeed)
      if (TIER_RANK[rungTier] < TIER_RANK[slotTier]) {
        errors.push(`${where}: model '${rung.modelId}' is ${rungTier} — below the ${slotTier} slot`)
      }
    }
  }

  for (const [tier, rungs] of Object.entries(config.byTier)) {
    checkSlot(`byTier.${tier}`, tier as ModelTier, rungs)
  }
  for (const [category, perTier] of Object.entries(config.byCategory ?? {})) {
    for (const [tier, rungs] of Object.entries(perTier ?? {})) {
      checkSlot(`byCategory.${category}.${tier}`, tier as ModelTier, rungs)
    }
  }

  return { valid: errors.length === 0, errors }
}
