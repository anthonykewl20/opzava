import { describe, expect, it } from 'vitest'

import { ARTICLE_DRAFT_SCHEMA_VERSION, parseArticleDraft } from './article-draft'

describe('Opzava content article draft contract', () => {
  it('parses a valid draft with multiple sections, each citing a source', () => {
    const parsed = parseArticleDraft(validDraft())

    expect(parsed.schemaVersion).toBe(ARTICLE_DRAFT_SCHEMA_VERSION)
    expect(parsed.draftId).toBe('dft_001')
    expect(parsed.outlineId).toBe('out_001')
    expect(parsed.briefId).toBe('brf_001')
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.title).toBe('Self-Hosted AI Operations: A Practical Guide')
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0].heading).toBe('What self-hosted AI operations means')
    expect(parsed.sections[0].body).toBe('Self-hosted AI operations is the orchestration of local agent fleets.')
    expect(parsed.sections[0].supportingSourceIds).toEqual(['src_001', 'src_002'])
    expect(parsed.sections[1].supportingSourceIds).toEqual(['src_003'])
    expect(parsed.wordCount).toBe(420)
    expect(parsed.createdAt).toBe('2026-06-16T00:00:00.000Z')
  })

  it('rejects an empty sections list', () => {
    expect(() => parseArticleDraft({ ...validDraft(), sections: [] })).toThrow()
  })

  it('rejects a section whose supportingSourceIds is empty (provenance rule)', () => {
    const sections = [
      { heading: 'Heading One', body: 'A body of text.', supportingSourceIds: [] },
      ...validDraft().sections.slice(1),
    ]
    expect(() => parseArticleDraft({ ...validDraft(), sections })).toThrow()
  })

  it('rejects an empty body', () => {
    const sections = [
      { heading: 'Heading One', body: '', supportingSourceIds: ['src_001'] },
      ...validDraft().sections.slice(1),
    ]
    expect(() => parseArticleDraft({ ...validDraft(), sections })).toThrow()
  })

  it('rejects duplicate section headings', () => {
    const sections = [
      { heading: 'Same Heading', body: 'first body.', supportingSourceIds: ['src_001'] },
      { heading: 'Same Heading', body: 'second body.', supportingSourceIds: ['src_002'] },
    ]
    expect(() => parseArticleDraft({ ...validDraft(), sections })).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseArticleDraft({ ...validDraft(), region: 'us' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseArticleDraft({ ...validDraft(), schemaVersion: 2 })).toThrow()
  })

  it('rejects a non-positive word count', () => {
    expect(() => parseArticleDraft({ ...validDraft(), wordCount: 0 })).toThrow()
  })

  it('rejects a non-integer word count', () => {
    expect(() => parseArticleDraft({ ...validDraft(), wordCount: 1.5 })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseArticleDraft(validDraft())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseArticleDraft(validDraft())).toEqual(parsed)
  })
})

function validDraft() {
  return {
    schemaVersion: ARTICLE_DRAFT_SCHEMA_VERSION,
    draftId: 'dft_001',
    outlineId: 'out_001',
    briefId: 'brf_001',
    ideaId: 'idea_001',
    title: 'Self-Hosted AI Operations: A Practical Guide',
    sections: [
      {
        heading: 'What self-hosted AI operations means',
        body: 'Self-hosted AI operations is the orchestration of local agent fleets.',
        supportingSourceIds: ['src_001', 'src_002'],
      },
      {
        heading: 'Why orchestration matters',
        body: 'Coordination prevents duplicate work and wasted spend across agents.',
        supportingSourceIds: ['src_003'],
      },
    ],
    wordCount: 420,
    createdAt: '2026-06-16T00:00:00.000Z',
  }
}
