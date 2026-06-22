import type { CostSummary } from '../runner/cost-queries'

/**
 * F2b — unify the two engines' cost surfaces (ARD 0007: *separate engines, unified surfaces*).
 *
 * The opzava runner reports cost in integer **cents** (`CostSummary`). Engine A (the inherited
 * Mission Control engine) reports token spend in **USD**. This module owns the pure projection that
 * merges them into one read model — and the USD→cents normaliser that makes the units comparable —
 * WITHOUT either engine importing the other: the composition layer reads Engine A's spend from
 * `src/lib`, normalises it here, and hands it in. The engines stay separate; only the surface unifies.
 */

// Engine A's cost contribution, already normalised to the opzava cents unit by `engineACostFromUsd`.
export type EngineACostContribution = Readonly<{
  count: number
  costCents: number
}>

export type UnifiedCostSummary = Readonly<{
  opzava: CostSummary
  inherited: EngineACostContribution
  totalCount: number
  /** Actual spend across both engines, in cents (opzava actual + inherited). */
  totalCostCents: number
}>

/** Normalise a USD amount to whole cents (banker-agnostic round-half-up). */
export function usdToCents(usd: number): number {
  return Math.round(usd * 100)
}

/** Build Engine A's contribution from its native USD total. */
export function engineACostFromUsd(count: number, totalUsd: number): EngineACostContribution {
  return Object.freeze({ count, costCents: usdToCents(totalUsd) })
}

/** Merge the opzava cost summary with Engine A's contribution into one unified surface. */
export function projectUnifiedCostSummary(
  opzava: CostSummary,
  inherited: EngineACostContribution,
): UnifiedCostSummary {
  return Object.freeze({
    opzava,
    inherited,
    totalCount: opzava.count + inherited.count,
    totalCostCents: opzava.actualCostCents + inherited.costCents,
  })
}
