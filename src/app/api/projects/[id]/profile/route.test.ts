import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'op' } })),
}))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET, PUT } from './route'

function req(id: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/projects/${id}/profile`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/projects/[id]/profile', () => {
  it('synthesizes the blank default when no overlay exists', async () => {
    const res = await GET(req('7', 'GET'), ctx('7'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isDefault).toBe(true)
    expect(body.profile.type).toBe('blank')
    expect(body.profile.enabledTiles).toEqual(['todos', 'board', 'docs', 'updates'])
  })
})

describe('PUT /api/projects/[id]/profile', () => {
  it('saves a valid overlay and reads it back (isDefault false)', async () => {
    const put = await PUT(
      req('7', 'PUT', { type: 'marketing', enabledTiles: ['marketing', 'assets'] }),
      ctx('7'),
    )
    expect(put.status).toBe(200)
    const saved = (await put.json()).profile
    expect(saved.type).toBe('marketing')
    expect(saved.projectId).toBe('7')

    const got = await (await GET(req('7', 'GET'), ctx('7'))).json()
    expect(got.isDefault).toBe(false)
    expect(got.profile.enabledTiles).toEqual(['marketing', 'assets'])
  })

  it('lets the path id win over a conflicting body projectId', async () => {
    const put = await PUT(
      req('7', 'PUT', { projectId: '999', type: 'blank', enabledTiles: ['todos'] }),
      ctx('7'),
    )
    expect((await put.json()).profile.projectId).toBe('7')
  })

  it('400s on an unknown project type', async () => {
    const res = await PUT(req('7', 'PUT', { type: 'nope', enabledTiles: [] }), ctx('7'))
    expect(res.status).toBe(400)
  })

  it('400s on unknown keys (strict — e.g. a stray color)', async () => {
    const res = await PUT(
      req('7', 'PUT', { type: 'blank', enabledTiles: ['todos'], color: '#fff' }),
      ctx('7'),
    )
    expect(res.status).toBe(400)
  })

  it('400s on a missing body', async () => {
    const res = await PUT(req('7', 'PUT'), ctx('7'))
    expect(res.status).toBe(400)
  })
})
