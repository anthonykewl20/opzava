import { describe, expect, it } from 'vitest'

import { FACT_CHECK_REPORT_SCHEMA_VERSION, parseFactCheckReport } from './fact-check-report'

describe('Opzava content fact-check report contract', () => {
  it('parses a valid passed report where every claim is supported and sourced', () => {
    const parsed = parseFactCheckReport(validReport())

    expect(parsed.schemaVersion).toBe(FACT_CHECK_REPORT_SCHEMA_VERSION)
    expect(parsed.reportId).toBe('fcr_001')
    expect(parsed.draftId).toBe('dft_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.status).toBe('passed')
    expect(parsed.checks).toHaveLength(2)
    expect(parsed.checks[0].claim).toBe('Self-hosted agents reduce vendor spend.')
    expect(parsed.checks[0].verdict).toBe('supported')
    expect(parsed.checks[0].sourceIds).toEqual(['src_001', 'src_002'])
    expect(parsed.checks[1].verdict).toBe('supported')
    expect(parsed.checks[1].sourceIds).toEqual(['src_003'])
    expect(parsed.checkedAt).toBe('2026-06-16T00:00:00.000Z')
  })

  it('parses a valid failed report that contains an unsupported claim', () => {
    const checks = [
      { claim: 'Supported claim.', verdict: 'supported', sourceIds: ['src_001'] },
      { claim: 'Unsupported claim.', verdict: 'unsupported', sourceIds: [] },
    ]
    const parsed = parseFactCheckReport({ ...validReport(), status: 'failed', checks })

    expect(parsed.status).toBe('failed')
    expect(parsed.checks[1].verdict).toBe('unsupported')
  })

  it('rejects a passed report that contains a non-supported claim', () => {
    const checks = [
      { claim: 'Supported claim.', verdict: 'supported', sourceIds: ['src_001'] },
      { claim: 'Needs review.', verdict: 'needs-review', sourceIds: ['src_002'] },
    ]
    expect(() => parseFactCheckReport({ ...validReport(), status: 'passed', checks })).toThrow()
  })

  it('rejects a supported claim with empty sourceIds (the sourcing rule)', () => {
    const checks = [
      { claim: 'Unsupported claim.', verdict: 'unsupported', sourceIds: [] },
      { claim: 'Supported but unsourced.', verdict: 'supported', sourceIds: [] },
    ]
    expect(() => parseFactCheckReport({ ...validReport(), status: 'failed', checks })).toThrow()
  })

  it('rejects an empty checks list', () => {
    expect(() => parseFactCheckReport({ ...validReport(), checks: [] })).toThrow()
  })

  it('rejects an invalid verdict', () => {
    const checks = [
      { claim: 'A claim.', verdict: 'definitely-true', sourceIds: ['src_001'] },
    ]
    expect(() => parseFactCheckReport({ ...validReport(), status: 'failed', checks })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseFactCheckReport({ ...validReport(), reviewer: 'automaton' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseFactCheckReport({ ...validReport(), schemaVersion: 2 })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseFactCheckReport(validReport())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseFactCheckReport(validReport())).toEqual(parsed)
  })
})

function validReport() {
  return {
    schemaVersion: FACT_CHECK_REPORT_SCHEMA_VERSION,
    reportId: 'fcr_001',
    draftId: 'dft_001',
    ideaId: 'idea_001',
    status: 'passed',
    checks: [
      {
        claim: 'Self-hosted agents reduce vendor spend.',
        verdict: 'supported',
        sourceIds: ['src_001', 'src_002'],
      },
      {
        claim: 'Orchestration prevents duplicate work across agents.',
        verdict: 'supported',
        sourceIds: ['src_003'],
      },
    ],
    checkedAt: '2026-06-16T00:00:00.000Z',
  }
}
