import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  createSqliteTaskReadSeam,
  NULL_TASK_READ_SEAM,
} from './task-read-seam'

function dbWithTasks(): Database.Database {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT NOT NULL, project_id INTEGER);',
  )
  const ins = db.prepare(
    'INSERT INTO tasks (status, project_id) VALUES (?,?)',
  )
  ins.run('inbox', 1)
  ins.run('in_progress', 1)
  ins.run('done', 1)
  ins.run('done', 2)
  return db
}

describe('createSqliteTaskReadSeam.countTasksByProject', () => {
  it('counts open (not-done) and total tasks for a project, by value', () => {
    const seam = createSqliteTaskReadSeam(dbWithTasks())
    expect(seam.countTasksByProject('1')).toEqual({ open: 2, total: 3 })
    expect(seam.countTasksByProject('2')).toEqual({ open: 0, total: 1 })
  })

  it('returns zeros for a project with no tasks', () => {
    expect(createSqliteTaskReadSeam(dbWithTasks()).countTasksByProject('999')).toEqual({
      open: 0,
      total: 0,
    })
  })

  it('degrades to zeros when the inherited tasks table is absent', () => {
    expect(
      createSqliteTaskReadSeam(new Database(':memory:')).countTasksByProject('1'),
    ).toEqual({ open: 0, total: 0 })
  })

  it('NULL seam counts nothing', () => {
    expect(NULL_TASK_READ_SEAM.countTasksByProject('1')).toEqual({ open: 0, total: 0 })
  })
})
