import { describe, expect, it } from 'vitest'

import { KEYWORD_RESEARCH_SCHEMA_VERSION, parseKeywordResearch } from './keyword-research'

describe('Opzava content keyword-research contract', () => {
  it('parses a valid keyword research artifact', () => {
    const parsed = parseKeywordResearch(validResearch())

    expect(parsed.schemaVersion).toBe(KEYWORD_RESEARCH_SCHEMA_VERSION)
    expect(parsed.researchId).toBe('kwr_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.primaryKeyword).toBe('self-hosted ai ops')
    expect(parsed.candidates).toHaveLength(3)
    expect(parsed.candidates[0]?.searchVolume).toBe(1200)
  })

  it('parses candidates that only carry a term', () => {
    const parsed = parseKeywordResearch({
      ...validResearch(),
      primaryKeyword: 'only term',
      candidates: [{ term: 'only term' }],
    })

    expect(parsed.candidates[0]?.term).toBe('only term')
    expect(parsed.candidates[0]?.searchVolume).toBeUndefined()
  })

  it('rejects an empty candidate list', () => {
    expect(() => parseKeywordResearch({ ...validResearch(), candidates: [] })).toThrow()
  })

  it('rejects a primary keyword that is not among the candidates', () => {
    expect(() => parseKeywordResearch({ ...validResearch(), primaryKeyword: 'not a candidate' })).toThrow()
  })

  it('rejects a non-finite search volume', () => {
    expect(() => parseKeywordResearch({
      ...validResearch(),
      primaryKeyword: 'self-hosted ai ops',
      candidates: [{ term: 'self-hosted ai ops', searchVolume: Infinity }],
    })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseKeywordResearch({ ...validResearch(), region: 'us' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseKeywordResearch({ ...validResearch(), schemaVersion: 2 })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseKeywordResearch(validResearch())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseKeywordResearch(validResearch())).toEqual(parsed)
  })
})

function validResearch() {
  return {
    schemaVersion: KEYWORD_RESEARCH_SCHEMA_VERSION,
    researchId: 'kwr_001',
    ideaId: 'idea_001',
    primaryKeyword: 'self-hosted ai ops',
    candidates: [
      { term: 'self-hosted ai ops', searchVolume: 1200, difficulty: 42 },
      { term: 'ai operations dashboard', searchVolume: 800 },
      { term: 'open source agent orchestration' },
    ],
    createdAt: '2026-06-16T00:00:00.000Z',
  }
}
