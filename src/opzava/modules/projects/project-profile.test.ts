import { describe, expect, it } from 'vitest'
import {
  defaultTilesForType,
  parseProjectProfile,
  PROJECT_TYPES,
  type ProjectProfile,
} from './project-profile'

describe('defaultTilesForType', () => {
  it('returns the per-type default tile layout (95 §A)', () => {
    expect(defaultTilesForType('blank')).toEqual([
      'todos',
      'board',
      'docs',
      'updates',
    ])
    expect(defaultTilesForType('marketing')).toEqual([
      'marketing',
      'schedule',
      'approvals',
      'assets',
      'performance',
      'team',
      'assistant',
    ])
    expect(defaultTilesForType('sales')).toEqual([
      'todos',
      'board',
      'docs',
      'performance',
      'team',
    ])
    expect(defaultTilesForType('support')).toEqual([
      'board',
      'docs',
      'schedule',
      'updates',
    ])
    expect(defaultTilesForType('events')).toEqual([
      'schedule',
      'todos',
      'assets',
      'updates',
    ])
  })

  it('returns a defined non-empty layout for every project type', () => {
    for (const type of PROJECT_TYPES) {
      expect(defaultTilesForType(type).length).toBeGreaterThan(0)
    }
  })
})

function valid(overrides: Partial<ProjectProfile> = {}): unknown {
  return {
    schemaVersion: 1,
    projectId: 'proj-1',
    type: 'blank',
    enabledTiles: ['todos'],
    updatedAt: '2026-06-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('parseProjectProfile', () => {
  it('accepts a valid profile and freezes it', () => {
    const parsed = parseProjectProfile(valid())
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parsed.type).toBe('blank')
  })

  it('rejects an unknown project type', () => {
    expect(() => parseProjectProfile(valid({ type: 'sales-x' } as never))).toThrow()
  })

  it('rejects an unknown tile id', () => {
    expect(() =>
      parseProjectProfile(valid({ enabledTiles: ['nope'] } as never)),
    ).toThrow()
  })

  it('rejects unknown keys (strict — no silent extra fields)', () => {
    expect(() =>
      parseProjectProfile({ ...(valid() as object), color: '#fff' }),
    ).toThrow()
  })

  it('rejects a missing/empty projectId', () => {
    expect(() => parseProjectProfile(valid({ projectId: '' }))).toThrow()
  })
})
