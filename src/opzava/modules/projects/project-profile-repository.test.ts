import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createProjectProfileRepository } from './project-profile-repository'
import { type ProjectProfile } from './project-profile'

function profile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    schemaVersion: 1,
    projectId: 'proj-1',
    type: 'blank',
    enabledTiles: ['todos', 'board', 'docs', 'updates'],
    updatedAt: '2026-06-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('createProjectProfileRepository', () => {
  let db: Database.Database
  let repo: ReturnType<typeof createProjectProfileRepository>

  beforeEach(() => {
    db = new Database(':memory:')
    repo = createProjectProfileRepository(db)
    repo.ensureSchema()
  })

  it('round-trips saveProfile + getProfileByProjectId', () => {
    const p = profile()
    repo.saveProfile(p)
    expect(repo.getProfileByProjectId('proj-1')).toEqual(p)
    expect(repo.getProfileByProjectId('missing')).toBeNull()
  })

  it('round-trips the optional cover + blurb overlay fields', () => {
    const p = profile({ cover: 'cover.png', blurb: 'Q3 launch workspace' })
    repo.saveProfile(p)
    expect(repo.getProfileByProjectId('proj-1')).toEqual(p)
  })

  it('upserts by projectId — second save wins, no duplicate row', () => {
    repo.saveProfile(profile({ type: 'blank' }))
    repo.saveProfile(profile({ type: 'marketing', enabledTiles: ['marketing'] }))
    const fetched = repo.getProfileByProjectId('proj-1')
    expect(fetched?.type).toBe('marketing')
    expect(repo.listProfiles()).toHaveLength(1)
  })

  it('listProfiles returns every saved profile', () => {
    repo.saveProfile(profile({ projectId: 'a' }))
    repo.saveProfile(profile({ projectId: 'b' }))
    expect(repo.listProfiles().map((p) => p.projectId).sort()).toEqual(['a', 'b'])
  })

  it('is idempotent across repository instances on the same db (schema CREATE IF NOT EXISTS)', () => {
    repo.saveProfile(profile())
    const repo2 = createProjectProfileRepository(db)
    repo2.ensureSchema()
    expect(repo2.getProfileByProjectId('proj-1')).toEqual(profile())
  })
})
