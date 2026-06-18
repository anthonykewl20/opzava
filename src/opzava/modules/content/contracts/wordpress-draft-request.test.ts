import { describe, expect, it } from 'vitest'

import {
  WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION,
  parseWordpressDraftRequest,
} from './wordpress-draft-request'

describe('Opzava content wordpress draft request contract', () => {
  it('parses a valid draft request', () => {
    const parsed = parseWordpressDraftRequest(validRequest())

    expect(parsed.schemaVersion).toBe(WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION)
    expect(parsed.requestId).toBe('wdr_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.draftId).toBe('dft_001')
    expect(parsed.approvalId).toBe('appr_001')
    expect(parsed.title).toBe('A Specific, Sourced, On-Brand Title')
    expect(parsed.bodyMarkdown).toBe('# Heading\n\nA fact-checked, brand-reviewed, slop-free body.')
    expect(parsed.status).toBe('draft')
    expect(parsed.gateArtifacts.sourceCaptureId).toBe('sc_001')
    expect(parsed.gateArtifacts.factCheckReportId).toBe('fcr_001')
    expect(parsed.gateArtifacts.brandReviewId).toBe('br_001')
    expect(parsed.gateArtifacts.antiSlopReviewId).toBe('asr_001')
    expect(parsed.createdAt).toBe('2026-06-16T00:00:00.000Z')
  })

  it('rejects a status other than draft (publish is structurally impossible)', () => {
    expect(() => parseWordpressDraftRequest({ ...validRequest(), status: 'publish' })).toThrow()
    expect(() => parseWordpressDraftRequest({ ...validRequest(), status: 'published' })).toThrow()
  })

  it('rejects a missing approvalId', () => {
    const { approvalId: _omitted, ...withoutApproval } = validRequest()
    expect(() => parseWordpressDraftRequest(withoutApproval)).toThrow()
  })

  it('rejects a missing gateArtifacts object', () => {
    const { gateArtifacts: _omitted, ...withoutGates } = validRequest()
    expect(() => parseWordpressDraftRequest(withoutGates)).toThrow()
  })

  it.each([
    ['sourceCaptureId', 'sourceCaptureId'],
    ['factCheckReportId', 'factCheckReportId'],
    ['brandReviewId', 'brandReviewId'],
    ['antiSlopReviewId', 'antiSlopReviewId'],
  ] as const)('rejects a gateArtifacts missing the %s id', (_label, key) => {
    const gates = { ...validRequest().gateArtifacts }
    delete gates[key]
    expect(() => parseWordpressDraftRequest({ ...validRequest(), gateArtifacts: gates })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseWordpressDraftRequest({ ...validRequest(), publishedAt: 'never' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseWordpressDraftRequest({ ...validRequest(), schemaVersion: 2 })).toThrow()
  })

  it('rejects an empty bodyMarkdown', () => {
    expect(() => parseWordpressDraftRequest({ ...validRequest(), bodyMarkdown: '' })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseWordpressDraftRequest(validRequest())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseWordpressDraftRequest(validRequest())).toEqual(parsed)
  })
})

function validRequest() {
  return {
    schemaVersion: WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION,
    requestId: 'wdr_001',
    ideaId: 'idea_001',
    draftId: 'dft_001',
    approvalId: 'appr_001',
    title: 'A Specific, Sourced, On-Brand Title',
    bodyMarkdown: '# Heading\n\nA fact-checked, brand-reviewed, slop-free body.',
    status: 'draft',
    gateArtifacts: {
      sourceCaptureId: 'sc_001',
      factCheckReportId: 'fcr_001',
      brandReviewId: 'br_001',
      antiSlopReviewId: 'asr_001',
    },
    createdAt: '2026-06-16T00:00:00.000Z',
  }
}
