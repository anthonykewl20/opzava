import { describe, expect, it } from 'vitest'

import { BRAND_REVIEW_SCHEMA_VERSION, parseBrandReview } from './brand-review'

describe('Opzava content brand review contract', () => {
  it('parses a valid passed review where every dimension check passes', () => {
    const parsed = parseBrandReview(validReview())

    expect(parsed.schemaVersion).toBe(BRAND_REVIEW_SCHEMA_VERSION)
    expect(parsed.reviewId).toBe('brv_001')
    expect(parsed.draftId).toBe('dft_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.status).toBe('passed')
    expect(parsed.checks).toHaveLength(2)
    expect(parsed.checks[0].dimension).toBe('voice')
    expect(parsed.checks[0].verdict).toBe('pass')
    expect(parsed.checks[1].dimension).toBe('clarity')
    expect(parsed.checks[1].verdict).toBe('pass')
    expect(parsed.reviewedAt).toBe('2026-06-16T00:00:00.000Z')
  })

  it('parses a valid changes-requested review that contains a failed check with a note', () => {
    const checks = [
      { dimension: 'voice', verdict: 'pass' },
      { dimension: 'tone', verdict: 'fail', note: 'Reads as sarcastic in paragraph 2.' },
    ]
    const parsed = parseBrandReview({ ...validReview(), status: 'changes-requested', checks })

    expect(parsed.status).toBe('changes-requested')
    expect(parsed.checks[1].verdict).toBe('fail')
    expect(parsed.checks[1].note).toBe('Reads as sarcastic in paragraph 2.')
  })

  it('rejects a passed review that contains a failed check (the passed rule)', () => {
    const checks = [
      { dimension: 'voice', verdict: 'pass' },
      { dimension: 'tone', verdict: 'fail', note: 'Off-brand tone.' },
    ]
    expect(() => parseBrandReview({ ...validReview(), status: 'passed', checks })).toThrow()
  })

  it('rejects a failed check without a note (the note rule)', () => {
    const checks = [
      { dimension: 'voice', verdict: 'pass' },
      { dimension: 'tone', verdict: 'fail' },
    ]
    expect(() => parseBrandReview({ ...validReview(), status: 'changes-requested', checks })).toThrow()
  })

  it('rejects an empty checks list', () => {
    expect(() => parseBrandReview({ ...validReview(), checks: [] })).toThrow()
  })

  it('rejects an invalid dimension', () => {
    const checks = [
      { dimension: 'pizzazz', verdict: 'pass' },
    ]
    expect(() => parseBrandReview({ ...validReview(), status: 'passed', checks })).toThrow()
  })

  it('rejects an invalid verdict', () => {
    const checks = [
      { dimension: 'voice', verdict: 'maybe', note: 'unsure' },
    ]
    expect(() => parseBrandReview({ ...validReview(), status: 'changes-requested', checks })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseBrandReview({ ...validReview(), reviewer: 'automaton' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseBrandReview({ ...validReview(), schemaVersion: 2 })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseBrandReview(validReview())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseBrandReview(validReview())).toEqual(parsed)
  })
})

function validReview() {
  return {
    schemaVersion: BRAND_REVIEW_SCHEMA_VERSION,
    reviewId: 'brv_001',
    draftId: 'dft_001',
    ideaId: 'idea_001',
    status: 'passed',
    checks: [
      { dimension: 'voice', verdict: 'pass' },
      { dimension: 'clarity', verdict: 'pass' },
    ],
    reviewedAt: '2026-06-16T00:00:00.000Z',
  }
}
