import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbRef.db,
}))

import { PATCH } from './route'

function req(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/team/agents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('PATCH /api/team/agents/[id]', () => {
  it('pauses an active agent', async () => {
    const res = await PATCH(req('copywriter', { status: 'paused' }), ctx('copywriter'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agent.status).toBe('paused')
    expect(body.agent.agentId).toBe('copywriter')
  })

  it('re-activates a paused agent', async () => {
    await PATCH(req('copywriter', { status: 'paused' }), ctx('copywriter'))
    const res = await PATCH(req('copywriter', { status: 'active' }), ctx('copywriter'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agent.status).toBe('active')
  })

  it('404 for an unknown agent', async () => {
    const res = await PATCH(req('nope', { status: 'paused' }), ctx('nope'))
    expect(res.status).toBe(404)
  })

  it('409 when toggling a planned agent', async () => {
    const res = await PATCH(
      req('social-media-manager', { status: 'active' }),
      ctx('social-media-manager')
    )
    expect(res.status).toBe(409)
  })

  it('400 for an invalid status value', async () => {
    const res = await PATCH(
      req('copywriter', { status: 'archived' }),
      ctx('copywriter')
    )
    expect(res.status).toBe(400)
  })
})
