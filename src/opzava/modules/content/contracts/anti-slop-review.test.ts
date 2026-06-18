import { describe, expect, it } from 'vitest'

import { ANTI_SLOP_REVIEW_SCHEMA_VERSION, parseAntiSlopReview } from './anti-slop-review'

describe('Opzava content anti-slop review contract', () => {
  it('parses a valid passed review with no detected patterns', () => {
    const parsed = parseAntiSlopReview(validReview())

    expect(parsed.schemaVersion).toBe(ANTI_SLOP_REVIEW_SCHEMA_VERSION)
    expect(parsed.reviewId).toBe('asr_001')
    expect(parsed.draftId).toBe('dft_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.status).toBe('passed')
    expect(parsed.detectedPatterns).toHaveLength(0)
    expect(parsed.reviewedAt).toBe('2026-06-16T00:00:00.000Z')
  })

  it('parses a valid rejected review that cites at least one slop finding', () => {
    const detectedPatterns = [
      {
        pattern: 'formulaic',
        severity: 'high',
        excerpt: 'In today\'s fast-paced digital landscape...',
        requiredFix: 'Open with the specific claim instead of a generic framing.',
      },
    ]
    const parsed = parseAntiSlopReview({ ...validReview(), status: 'rejected', detectedPatterns })

    expect(parsed.status).toBe('rejected')
    expect(parsed.detectedPatterns[0].pattern).toBe('formulaic')
    expect(parsed.detectedPatterns[0].requiredFix).toBe('Open with the specific claim instead of a generic framing.')
  })

  it('rejects a passed review that lists detected patterns (the passed rule)', () => {
    const detectedPatterns = [
      {
        pattern: 'generic',
        severity: 'low',
        excerpt: 'This is a great solution for everyone.',
        requiredFix: 'Name the specific audience and the specific value.',
      },
    ]
    expect(() => parseAntiSlopReview({ ...validReview(), status: 'passed', detectedPatterns })).toThrow()
  })

  it('rejects a rejected review with no detected patterns (the rejection rule)', () => {
    expect(() => parseAntiSlopReview({ ...validReview(), status: 'rejected', detectedPatterns: [] })).toThrow()
  })

  it('rejects an invalid pattern enum', () => {
    const detectedPatterns = [
      {
        pattern: 'boring',
        severity: 'low',
        excerpt: 'Some excerpt.',
        requiredFix: 'Some fix.',
      },
    ]
    expect(() => parseAntiSlopReview({ ...validReview(), status: 'rejected', detectedPatterns })).toThrow()
  })

  it('rejects an invalid severity enum', () => {
    const detectedPatterns = [
      {
        pattern: 'generic',
        severity: 'critical',
        excerpt: 'Some excerpt.',
        requiredFix: 'Some fix.',
      },
    ]
    expect(() => parseAntiSlopReview({ ...validReview(), status: 'rejected', detectedPatterns })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseAntiSlopReview({ ...validReview(), reviewer: 'automaton' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseAntiSlopReview({ ...validReview(), schemaVersion: 2 })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseAntiSlopReview(validReview())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseAntiSlopReview(validReview())).toEqual(parsed)
  })
})

function validReview() {
  return {
    schemaVersion: ANTI_SLOP_REVIEW_SCHEMA_VERSION,
    reviewId: 'asr_001',
    draftId: 'dft_001',
    ideaId: 'idea_001',
    status: 'passed',
    detectedPatterns: [],
    reviewedAt: '2026-06-16T00:00:00.000Z',
  }
}
