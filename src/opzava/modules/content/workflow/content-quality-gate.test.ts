import { describe, it, expect } from 'vitest'
import {
  evaluateContentQualityGates,
  assertContentQualityGatesPassed,
} from './content-quality-gate'

const NOW = '2026-07-05T00:00:00.000Z'

const passedFactCheck = {
  schemaVersion: 1, reportId: 'fc-1', draftId: 'd-1', ideaId: 'i-1', status: 'passed',
  checks: [{ claim: 'c', verdict: 'supported', sourceIds: ['s-1'] }], checkedAt: NOW,
}
const failedFactCheck = {
  schemaVersion: 1, reportId: 'fc-1', draftId: 'd-1', ideaId: 'i-1', status: 'failed',
  checks: [{ claim: 'c', verdict: 'contradicted', sourceIds: [] }], checkedAt: NOW,
}
const passedBrand = {
  schemaVersion: 1, reviewId: 'br-1', draftId: 'd-1', ideaId: 'i-1', status: 'passed',
  checks: [{ dimension: 'voice', verdict: 'pass' }], reviewedAt: NOW,
}
const changesRequestedBrand = {
  schemaVersion: 1, reviewId: 'br-1', draftId: 'd-1', ideaId: 'i-1', status: 'changes-requested',
  checks: [{ dimension: 'voice', verdict: 'fail', note: 'off-brand' }], reviewedAt: NOW,
}
const passedAntiSlop = {
  schemaVersion: 1, reviewId: 'as-1', draftId: 'd-1', ideaId: 'i-1', status: 'passed',
  detectedPatterns: [], reviewedAt: NOW,
}
const rejectedAntiSlop = {
  schemaVersion: 1, reviewId: 'as-1', draftId: 'd-1', ideaId: 'i-1', status: 'rejected',
  detectedPatterns: [{ pattern: 'generic', severity: 'high', excerpt: 'x', requiredFix: 'rewrite it' }],
  reviewedAt: NOW,
}

describe('content quality gate', () => {
  it('passes when all three verdicts are passed', () => {
    const input = { factCheck: passedFactCheck, brandReview: passedBrand, antiSlop: passedAntiSlop }
    expect(evaluateContentQualityGates(input)).toEqual([])
    expect(() => assertContentQualityGatesPassed(input)).not.toThrow()
  })

  it('fails on a failed fact-check', () => {
    const input = { factCheck: failedFactCheck, brandReview: passedBrand, antiSlop: passedAntiSlop }
    expect(evaluateContentQualityGates(input)).toEqual([{ gate: 'fact-check', status: 'failed' }])
    expect(() => assertContentQualityGatesPassed(input)).toThrow(/quality gates not passed/)
  })

  it('fails on a changes-requested brand review', () => {
    const input = { factCheck: passedFactCheck, brandReview: changesRequestedBrand, antiSlop: passedAntiSlop }
    expect(() => assertContentQualityGatesPassed(input)).toThrow(/brand-review=changes-requested/)
  })

  it('fails on a rejected anti-slop review', () => {
    const input = { factCheck: passedFactCheck, brandReview: passedBrand, antiSlop: rejectedAntiSlop }
    expect(() => assertContentQualityGatesPassed(input)).toThrow(/anti-slop-review=rejected/)
  })

  it('lists every failing gate in the summary', () => {
    const input = { factCheck: failedFactCheck, brandReview: changesRequestedBrand, antiSlop: rejectedAntiSlop }
    const failures = evaluateContentQualityGates(input)
    expect(failures.map((f) => f.gate)).toEqual(['fact-check', 'brand-review', 'anti-slop-review'])
    expect(() => assertContentQualityGatesPassed(input)).toThrow(
      /fact-check=failed, brand-review=changes-requested, anti-slop-review=rejected/,
    )
  })
})
