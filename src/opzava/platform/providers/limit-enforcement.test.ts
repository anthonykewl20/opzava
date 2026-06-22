import { describe, expect, it } from 'vitest'
import { evaluateProviderLimits, type ProviderUsageSnapshot } from './limit-enforcement'
import { projectProviderLimits, type ProviderLimitsProjection } from '../admin-config/runtime-options'
import { defaultOpzavaAdminSettings } from '../admin-config/settings'

const LIMITS: ProviderLimitsProjection = {
  requestsPerMinute: 60,
  burst: 90,
  usdPerHourLimit: 100,
  usdPerDayLimit: 1_000,
}

const ZERO_USAGE: ProviderUsageSnapshot = {
  requestsInLastMinute: 0,
  usdSpentThisHour: 0,
  usdSpentThisDay: 0,
}

describe('projectProviderLimits', () => {
  it('projects the four rate/cost ceilings from admin settings', () => {
    const settings = defaultOpzavaAdminSettings()
    expect(projectProviderLimits(settings)).toEqual({
      requestsPerMinute: settings.providers.requestsPerMinute,
      burst: settings.providers.burst,
      usdPerHourLimit: settings.providers.usdPerHourLimit,
      usdPerDayLimit: settings.providers.usdPerDayLimit,
    })
  })
})

describe('evaluateProviderLimits', () => {
  it('allows a request when every window is under its ceiling', () => {
    expect(evaluateProviderLimits(LIMITS, { requestsInLastMinute: 59, usdSpentThisHour: 99.99, usdSpentThisDay: 999.99 })).toEqual({ ok: true })
  })

  it('rate-limits at the inclusive ceiling (>= requestsPerMinute), not one below', () => {
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, requestsInLastMinute: 59 })).toEqual({ ok: true })
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, requestsInLastMinute: 60 })).toEqual({
      ok: false, reason: 'rate-limited', limit: 60, observed: 60,
    })
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, requestsInLastMinute: 61 })).toMatchObject({ ok: false, reason: 'rate-limited' })
  })

  it('blocks at the hourly budget ceiling (>= usdPerHourLimit)', () => {
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, usdSpentThisHour: 99.99 })).toEqual({ ok: true })
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, usdSpentThisHour: 100 })).toEqual({
      ok: false, reason: 'hourly-budget-exceeded', limit: 100, observed: 100,
    })
  })

  it('blocks at the daily budget ceiling (>= usdPerDayLimit)', () => {
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, usdSpentThisDay: 999.99 })).toEqual({ ok: true })
    expect(evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, usdSpentThisDay: 1_000 })).toEqual({
      ok: false, reason: 'daily-budget-exceeded', limit: 1_000, observed: 1_000,
    })
  })

  it('reports the first breach in priority order: rate, then hourly, then daily', () => {
    // all three breached → rate wins
    expect(evaluateProviderLimits(LIMITS, { requestsInLastMinute: 60, usdSpentThisHour: 100, usdSpentThisDay: 1_000 }))
      .toMatchObject({ reason: 'rate-limited' })
    // hourly + daily breached, rate ok → hourly wins
    expect(evaluateProviderLimits(LIMITS, { requestsInLastMinute: 0, usdSpentThisHour: 100, usdSpentThisDay: 1_000 }))
      .toMatchObject({ reason: 'hourly-budget-exceeded' })
    // only daily breached → daily
    expect(evaluateProviderLimits(LIMITS, { requestsInLastMinute: 0, usdSpentThisHour: 0, usdSpentThisDay: 1_000 }))
      .toMatchObject({ reason: 'daily-budget-exceeded' })
  })

  it('carries the breached ceiling and the observed value on a denial', () => {
    const decision = evaluateProviderLimits(LIMITS, { ...ZERO_USAGE, requestsInLastMinute: 75 })
    expect(decision).toEqual({ ok: false, reason: 'rate-limited', limit: 60, observed: 75 })
  })
})
