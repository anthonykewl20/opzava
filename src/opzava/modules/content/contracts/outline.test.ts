import { describe, expect, it } from 'vitest'

import { OUTLINE_SCHEMA_VERSION, parseOutline } from './outline'

describe('Opzava content outline contract', () => {
  it('parses a valid outline with multiple sections and key points', () => {
    const parsed = parseOutline(validOutline())

    expect(parsed.schemaVersion).toBe(OUTLINE_SCHEMA_VERSION)
    expect(parsed.outlineId).toBe('out_001')
    expect(parsed.briefId).toBe('brf_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.title).toBe('Self-Hosted AI Operations: A Practical Guide')
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0].heading).toBe('What self-hosted AI operations means')
    expect(parsed.sections[0].keyPoints).toEqual([
      'orchestration of local agent fleets',
      'cost and task visibility without vendor lock-in',
    ])
    expect(parsed.sections[1].keyPoints).toHaveLength(1)
    expect(parsed.createdAt).toBe('2026-06-16T00:00:00.000Z')
  })

  it('rejects an empty sections list', () => {
    expect(() => parseOutline({ ...validOutline(), sections: [] })).toThrow()
  })

  it('rejects a section with an empty keyPoints list', () => {
    const sections = [
      { heading: 'Heading One', keyPoints: [] },
      ...validOutline().sections.slice(1),
    ]
    expect(() => parseOutline({ ...validOutline(), sections })).toThrow()
  })

  it('rejects duplicate section headings', () => {
    const sections = [
      { heading: 'Same Heading', keyPoints: ['first point'] },
      { heading: 'Same Heading', keyPoints: ['second point'] },
    ]
    expect(() => parseOutline({ ...validOutline(), sections })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseOutline({ ...validOutline(), region: 'us' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseOutline({ ...validOutline(), schemaVersion: 2 })).toThrow()
  })

  it('rejects an empty required string', () => {
    expect(() => parseOutline({ ...validOutline(), title: '' })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseOutline(validOutline())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseOutline(validOutline())).toEqual(parsed)
  })
})

function validOutline() {
  return {
    schemaVersion: OUTLINE_SCHEMA_VERSION,
    outlineId: 'out_001',
    briefId: 'brf_001',
    ideaId: 'idea_001',
    title: 'Self-Hosted AI Operations: A Practical Guide',
    sections: [
      {
        heading: 'What self-hosted AI operations means',
        keyPoints: [
          'orchestration of local agent fleets',
          'cost and task visibility without vendor lock-in',
        ],
      },
      {
        heading: 'Why orchestration matters',
        keyPoints: ['coordination prevents duplicate work and wasted spend'],
      },
    ],
    createdAt: '2026-06-16T00:00:00.000Z',
  }
}
