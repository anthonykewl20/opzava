import { describe, expect, it } from 'vitest'

import { SOURCE_CAPTURE_SCHEMA_VERSION, parseSourceCapture } from './source-capture'

describe('Opzava content source-capture contract', () => {
  it('parses a valid source capture artifact with optionals', () => {
    const parsed = parseSourceCapture(validCapture())

    expect(parsed.schemaVersion).toBe(SOURCE_CAPTURE_SCHEMA_VERSION)
    expect(parsed.captureId).toBe('src_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.sources).toHaveLength(2)
    expect(parsed.sources[0]?.origin).toBe('https://example.com/serp-result')
    expect(parsed.sources[0]?.trustNotes).toBe('first-party documentation')
    expect(parsed.sources[0]?.supportsClaims).toEqual(['primary keyword volume'])
  })

  it('parses a single minimal source carrying only required fields', () => {
    const parsed = parseSourceCapture({
      ...validCapture(),
      sources: [
        {
          sourceId: 'src_only',
          origin: 'https://example.com/minimal',
          capturedAt: '2026-06-16T00:00:00.000Z',
          extractionSummary: 'only the required provenance fields',
        },
      ],
    })

    expect(parsed.sources).toHaveLength(1)
    expect(parsed.sources[0]?.trustNotes).toBeUndefined()
    expect(parsed.sources[0]?.supportsClaims).toBeUndefined()
  })

  it('rejects an empty sources list', () => {
    expect(() => parseSourceCapture({ ...validCapture(), sources: [] })).toThrow()
  })

  it('rejects duplicate source ids within sources', () => {
    expect(() => parseSourceCapture({
      ...validCapture(),
      sources: [
        { ...validCapture().sources[0]! },
        { ...validCapture().sources[0]! },
      ],
    })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseSourceCapture({ ...validCapture(), operator: 'seo-team' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseSourceCapture({ ...validCapture(), schemaVersion: 2 })).toThrow()
  })

  it('rejects an empty required string such as extractionSummary', () => {
    expect(() => parseSourceCapture({
      ...validCapture(),
      sources: [{ ...validCapture().sources[0]!, extractionSummary: '' }],
    })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseSourceCapture(validCapture())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseSourceCapture(validCapture())).toEqual(parsed)
  })
})

function validCapture() {
  return {
    schemaVersion: SOURCE_CAPTURE_SCHEMA_VERSION,
    captureId: 'src_001',
    ideaId: 'idea_001',
    sources: [
      {
        sourceId: 'serp_a',
        origin: 'https://example.com/serp-result',
        capturedAt: '2026-06-16T00:00:00.000Z',
        extractionSummary: 'Top-ranking page describing the primary keyword and its variants.',
        trustNotes: 'first-party documentation',
        supportsClaims: ['primary keyword volume'],
      },
      {
        sourceId: 'serp_b',
        origin: 'https://example.com/competitor',
        capturedAt: '2026-06-16T00:01:00.000Z',
        extractionSummary: 'Competitor page covering the same topic with a different angle.',
      },
    ],
    createdAt: '2026-06-16T00:02:00.000Z',
  }
}
