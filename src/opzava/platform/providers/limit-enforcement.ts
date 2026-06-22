import type { ProviderLimitsProjection } from '../admin-config/runtime-options'

/**
 * F6b — enforce the operator-set provider rate/cost ceilings.
 *
 * Operators can already *set* `requestsPerMinute` / `usdPerHourLimit` / `usdPerDayLimit` (admin
 * settings, projected by `projectProviderLimits`). This is the pure decision that turns those
 * ceilings into a pre-execution gate: given a usage snapshot, decide whether one more live provider
 * call is allowed. It is fail-closed — a request is denied as soon as a window is at or over its
 * ceiling, and the first breach (rate, then hourly, then daily) wins.
 *
 * The snapshot is supplied by the caller (the provider-execution layer reads it from the cost/
 * external-call store); this function owns no state, so it is deterministic and fully testable.
 * `burst` is the token-bucket capacity for the sub-minute limiter and is not part of this per-minute
 * window gate.
 */

export type ProviderUsageSnapshot = Readonly<{
  /** Live provider requests recorded in the trailing 60 seconds. */
  requestsInLastMinute: number
  /** USD spent on live provider calls in the trailing hour. */
  usdSpentThisHour: number
  /** USD spent on live provider calls in the trailing day. */
  usdSpentThisDay: number
}>

export type ProviderLimitBreachReason =
  | 'rate-limited'
  | 'hourly-budget-exceeded'
  | 'daily-budget-exceeded'

export type ProviderLimitDecision =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: ProviderLimitBreachReason; limit: number; observed: number }>

function breach(reason: ProviderLimitBreachReason, limit: number, observed: number): ProviderLimitDecision {
  return Object.freeze({ ok: false, reason, limit, observed })
}

export function evaluateProviderLimits(
  limits: ProviderLimitsProjection,
  usage: ProviderUsageSnapshot,
): ProviderLimitDecision {
  if (usage.requestsInLastMinute >= limits.requestsPerMinute) {
    return breach('rate-limited', limits.requestsPerMinute, usage.requestsInLastMinute)
  }
  if (usage.usdSpentThisHour >= limits.usdPerHourLimit) {
    return breach('hourly-budget-exceeded', limits.usdPerHourLimit, usage.usdSpentThisHour)
  }
  if (usage.usdSpentThisDay >= limits.usdPerDayLimit) {
    return breach('daily-budget-exceeded', limits.usdPerDayLimit, usage.usdSpentThisDay)
  }
  return Object.freeze({ ok: true })
}
