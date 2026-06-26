import type {
  AuthoritativeOverride,
  ComputeUsageInput,
  ConfiguredWindow,
  UsageSample,
  UsageUnit,
  UsageView,
  UsageWindowView,
  WindowSpec,
} from './contracts'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const MONTH_MS_APPROX = 30 * DAY_MS

/** What one sample contributes in a given unit. `credits` is a vendor unit — self-tracking can't measure it. */
function amountOf(sample: UsageSample, unit: UsageUnit): number {
  if (unit === 'requests') return 1
  if (unit === 'tokens') return sample.tokens
  if (unit === 'usd') return sample.costUsd
  return 0 // 'credits' — the overlay carries the real balance; the fleet baseline reads 0
}

/** Start (epoch ms) of the current calendar period. `override.resetAt` supersedes the anchor arithmetic. */
function calendarStart(
  spec: Extract<WindowSpec, { kind: 'calendar' }>,
  now: Date,
  override?: AuthoritativeOverride,
): number {
  if (override?.resetAt) {
    return override.resetAt.getTime() - (spec.period === 'weekly' ? WEEK_MS : MONTH_MS_APPROX)
  }
  if (spec.period === 'weekly') {
    const anchorDay = spec.anchor ?? 1 // day-of-week (0=Sun); default Monday
    const back = (now.getUTCDay() - anchorDay + 7) % 7
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back)
  }
  const dom = spec.anchor ?? 1 // day-of-month; default the 1st
  const thisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dom)
  return thisMonth > now.getTime() ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, dom) : thisMonth
}

function inWindow(sample: UsageSample, spec: WindowSpec, now: Date, override?: AuthoritativeOverride): boolean {
  if (spec.kind === 'rolling-duration') return sample.occurredAt.getTime() >= now.getTime() - spec.durationMs
  if (spec.kind === 'credit-balance') return true
  return sample.occurredAt.getTime() >= calendarStart(spec, now, override)
}

function fleetUsed(samples: readonly UsageSample[], spec: WindowSpec, now: Date, override?: AuthoritativeOverride): number {
  let total = 0
  for (const sample of samples) if (inWindow(sample, spec, now, override)) total += amountOf(sample, spec.unit)
  return total
}

function computeWindow(
  window: ConfiguredWindow,
  samples: readonly UsageSample[],
  now: Date,
  override: AuthoritativeOverride | undefined,
): UsageWindowView {
  // `used` is ALWAYS the fleet count — an override NEVER replaces it (honesty-model i).
  const used = fleetUsed(samples, window.spec, now, override)
  const base = { windowId: window.windowId, label: window.label, unit: window.spec.unit, used }

  if (!override) {
    return { ...base, provenance: 'self-tracked', vendorLimit: null, vendorRemaining: null, resetAt: null, limitReached: false }
  }
  return {
    ...base,
    provenance: 'authoritative',
    vendorLimit: override.vendorLimit,
    vendorRemaining: override.vendorRemaining,
    resetAt: override.resetAt,
    limitReached: override.limitReached,
  }
}

/**
 * `computeUsageView` — pure. Per window: `used` = fleet samples within the window's spec (aggregated by
 * unit); an override (if present) attaches the vendor numbers + flips `limitReached`. No I/O.
 */
export function computeUsageView(input: ComputeUsageInput): UsageView {
  const windows = input.windows.map((w) => computeWindow(w, input.samples, input.now, input.overrides.get(w.windowId)))
  return {
    accountProfileId: input.accountProfileId,
    billingMode: input.billingMode,
    windows,
    limitReached: windows.some((w) => w.limitReached),
    asOf: input.now,
  }
}
