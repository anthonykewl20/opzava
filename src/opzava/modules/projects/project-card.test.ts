import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readProjectCard } from './project-card'
import { createProjectProfileRepository } from './project-profile-repository'

function seededDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT, description TEXT);',
  )
  db.exec(
    'CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT NOT NULL, project_id INTEGER);',
  )
  db.prepare(
    'INSERT INTO projects (id, name, color, description) VALUES (?,?,?,?)',
  ).run(1, 'Launch', '#3b82f6', 'Q3 launch')
  const t = db.prepare('INSERT INTO tasks (status, project_id) VALUES (?,?)')
  t.run('inbox', 1)
  t.run('done', 1)
  return db
}

describe('readProjectCard', () => {
  it('merges inherited project + task counts, synthesizing a default profile when absent', () => {
    const card = readProjectCard(seededDb(), '1')
    expect(card).toMatchObject({
      projectId: '1',
      name: 'Launch',
      color: '#3b82f6',
      description: 'Q3 launch',
      type: 'blank',
      enabledTiles: ['todos', 'board', 'docs', 'updates'],
      taskCounts: { open: 1, total: 2 },
    })
  })

  it('uses the saved profile overlay (type + tiles) when present', () => {
    const db = seededDb()
    createProjectProfileRepository(db).saveProfile({
      schemaVersion: 1,
      projectId: '1',
      type: 'marketing',
      enabledTiles: ['marketing', 'assets'],
      updatedAt: '2026-06-27T00:00:00.000Z',
    })
    const card = readProjectCard(db, '1')
    expect(card?.type).toBe('marketing')
    expect(card?.enabledTiles).toEqual(['marketing', 'assets'])
  })

  it('returns null when the project does not exist (degrade)', () => {
    expect(readProjectCard(seededDb(), '999')).toBeNull()
  })

  it('degrades task counts to zero and color to null when unavailable', () => {
    const db = new Database(':memory:')
    db.exec(
      'CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT, description TEXT);',
    )
    db.prepare(
      'INSERT INTO projects (id, name, color, description) VALUES (?,?,?,?)',
    ).run(1, 'Solo', null, null)
    const card = readProjectCard(db, '1')
    expect(card?.taskCounts).toEqual({ open: 0, total: 0 })
    expect(card?.color).toBeNull()
  })
})
