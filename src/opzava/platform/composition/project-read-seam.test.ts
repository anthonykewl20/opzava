import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  createSqliteProjectReadSeam,
  NULL_PROJECT_READ_SEAM,
} from './project-read-seam'

function dbWithProjects(): Database.Database {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, ' +
      'color TEXT, description TEXT);',
  )
  db.prepare(
    'INSERT INTO projects (id, name, color, description) VALUES (?,?,?,?)',
  ).run(1, 'Launch', '#3b82f6', 'Q3 launch')
  return db
}

describe('createSqliteProjectReadSeam', () => {
  it('reads inherited projects by value, keyed by string id', () => {
    const seam = createSqliteProjectReadSeam(dbWithProjects())
    expect(seam.readProjectsByIds(['1'])['1']).toEqual({
      name: 'Launch',
      color: '#3b82f6',
      description: 'Q3 launch',
    })
  })

  it('returns undefined for unknown ids (degrade, never throw)', () => {
    const seam = createSqliteProjectReadSeam(dbWithProjects())
    expect(seam.readProjectsByIds(['999'])['999']).toBeUndefined()
  })

  it('degrades to empty when the inherited projects table is absent', () => {
    const seam = createSqliteProjectReadSeam(new Database(':memory:'))
    expect(seam.readProjectsByIds(['1'])).toEqual({})
  })

  it('handles an empty id list without a query', () => {
    expect(createSqliteProjectReadSeam(dbWithProjects()).readProjectsByIds([])).toEqual({})
  })

  it('NULL seam reads nothing', () => {
    expect(NULL_PROJECT_READ_SEAM.readProjectsByIds(['1'])).toEqual({})
  })
})
