import { describe, expect, it } from 'vitest'

import { SEO_BRIEF_SCHEMA_VERSION, parseSeoBrief } from './seo-brief'

describe('Opzava content seo-brief contract', () => {
  it('parses a valid brief including optional secondary keywords', () => {
    const parsed = parseSeoBrief(validBrief())

    expect(parsed.schemaVersion).toBe(SEO_BRIEF_SCHEMA_VERSION)
    expect(parsed.briefId).toBe('brf_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.keywordResearchId).toBe('kwr_001')
    expect(parsed.sourceCaptureId).toBe('src_001')
    expect(parsed.primaryKeyword).toBe('self-hosted ai ops')
    expect(parsed.secondaryKeywords).toEqual(['ai operations dashboard', 'open source agent orchestration'])
    expect(parsed.targetAudience).toBe('platform engineers running self-hosted agents')
    expect(parsed.searchIntent).toBe('informational')
    expect(parsed.recommendedHeadings).toHaveLength(3)
    expect(parsed.wordCountTarget).toBe(1800)
  })

  it('parses a brief without optional secondary keywords', () => {
    const { secondaryKeywords, ...withoutSecondaries } = validBrief()
    void secondaryKeywords

    const parsed = parseSeoBrief(withoutSecondaries)

    expect(parsed.secondaryKeywords).toBeUndefined()
    expect(parsed.primaryKeyword).toBe('self-hosted ai ops')
  })

  it('rejects an empty recommended headings list', () => {
    expect(() => parseSeoBrief({ ...validBrief(), recommendedHeadings: [] })).toThrow()
  })

  it('rejects an invalid search intent', () => {
    expect(() => parseSeoBrief({ ...validBrief(), searchIntent: 'investigational' })).toThrow()
  })

  it('rejects a non-integer word count target', () => {
    expect(() => parseSeoBrief({ ...validBrief(), wordCountTarget: 1800.5 })).toThrow()
  })

  it('rejects a non-positive word count target', () => {
    expect(() => parseSeoBrief({ ...validBrief(), wordCountTarget: 0 })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseSeoBrief({ ...validBrief(), region: 'us' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseSeoBrief({ ...validBrief(), schemaVersion: 2 })).toThrow()
  })

  it('rejects an empty required string', () => {
    expect(() => parseSeoBrief({ ...validBrief(), primaryKeyword: '' })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseSeoBrief(validBrief())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseSeoBrief(validBrief())).toEqual(parsed)
  })
})

function validBrief() {
  return {
    schemaVersion: SEO_BRIEF_SCHEMA_VERSION,
    briefId: 'brf_001',
    ideaId: 'idea_001',
    keywordResearchId: 'kwr_001',
    sourceCaptureId: 'src_001',
    primaryKeyword: 'self-hosted ai ops',
    secondaryKeywords: ['ai operations dashboard', 'open source agent orchestration'],
    targetAudience: 'platform engineers running self-hosted agents',
    searchIntent: 'informational',
    recommendedHeadings: [
      'What self-hosted AI operations means',
      'Why orchestration matters',
      'Choosing a self-hosted stack',
    ],
    wordCountTarget: 1800,
    createdAt: '2026-06-16T00:00:00.000Z',
  }
}
