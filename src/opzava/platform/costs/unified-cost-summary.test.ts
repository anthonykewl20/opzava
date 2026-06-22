import { describe, expect, it } from 'vitest'
import type { CostSummary } from '../runner/cost-queries'
import {
  usdToCents,
  engineACostFromUsd,
  projectUnifiedCostSummary,
} from './unified-cost-summary'

describe('usdToCents', () => {
  it('converts dollars to whole cents', () => {
    expect(usdToCents(0)).toBe(0)
    expect(usdToCents(1.5)).toBe(150)
    expect(usdToCents(0.01)).toBe(1)
    expect(usdToCents(12.34)).toBe(1234)
  })

  it('rounds to the nearest cent (kills a dropped Math.round)', () => {
    expect(usdToCents(1.234)).toBe(123) // 123.4 -> 123
    expect(usdToCents(1.236)).toBe(124) // 123.6 -> 124
  })
})

describe('engineACostFromUsd', () => {
  it('carries the count and normalises the USD total to cents', () => {
    expect(engineACostFromUsd(4, 2.5)).toEqual({ count: 4, costCents: 250 })
    expect(engineACostFromUsd(0, 0)).toEqual({ count: 0, costCents: 0 })
  })
})

describe('projectUnifiedCostSummary', () => {
  // estimated != actual so a mutant that sums the wrong opzava field is caught.
  const opzava: CostSummary = { count: 3, estimatedCostCents: 500, actualCostCents: 420 }
  const inherited = { count: 2, costCents: 80 }

  it('sums counts and actual spend across both engines', () => {
    const unified = projectUnifiedCostSummary(opzava, inherited)
    expect(unified.totalCount).toBe(5) // 3 + 2
    expect(unified.totalCostCents).toBe(500) // 420 (actual, not 500 estimated) + 80
  })

  it('preserves both engine breakdowns on the unified surface', () => {
    const unified = projectUnifiedCostSummary(opzava, inherited)
    expect(unified.opzava).toEqual(opzava)
    expect(unified.inherited).toEqual(inherited)
  })

  it('totals to the opzava-only figures when Engine A contributes nothing', () => {
    const unified = projectUnifiedCostSummary(opzava, { count: 0, costCents: 0 })
    expect(unified.totalCount).toBe(3)
    expect(unified.totalCostCents).toBe(420)
  })
})
