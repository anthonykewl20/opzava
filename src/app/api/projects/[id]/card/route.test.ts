import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'op' } })),
}))
vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET } from './route'

function seed(db: Database.Database) {
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
}

const req = (id: string) =>
  new NextRequest(`http://localhost/api/projects/${id}/card`)
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/projects/[id]/card', () => {
  it('returns the merged card with live task counts + default profile', async () => {
    seed(dbRef.db)
    const res = await GET(req('1'), ctx('1'))
    expect(res.status).toBe(200)
    const { card } = await res.json()
    expect(card).toMatchObject({
      projectId: '1',
      name: 'Launch',
      color: '#3b82f6',
      type: 'blank',
      taskCounts: { open: 1, total: 2 },
    })
  })

  it('404s when the project does not exist', async () => {
    seed(dbRef.db)
    const res = await GET(req('999'), ctx('999'))
    expect(res.status).toBe(404)
  })
})
