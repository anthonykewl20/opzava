import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { defaultOpzavaAdminSettings } from '@/opzava/platform/admin-config/settings'

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

import { GET, PUT } from './route'

function getReq() {
  return new NextRequest('http://localhost/api/ops/admin-settings', { method: 'GET' })
}
function putReq(body: unknown) {
  return new NextRequest('http://localhost/api/ops/admin-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET/PUT /api/ops/admin-settings', () => {
  it('GET returns the defaults at version 0 when nothing is persisted', async () => {
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBe(0)
    expect(body.settings).toBeTruthy()
  })

  it('PUT persists valid settings and bumps the version; GET reflects it', async () => {
    const res = await PUT(putReq({ settings: defaultOpzavaAdminSettings(), reason: 'tune runner' }))
    expect(res.status).toBe(200)
    const saved = await res.json()
    expect(saved.version).toBe(1)
    expect(saved.updatedBy).toBe('admin')

    const after = await GET(getReq())
    const body = await after.json()
    expect(body.version).toBe(1)
  })

  it('PUT rejects invalid settings with 400', async () => {
    const res = await PUT(putReq({ settings: { not: 'valid' } }))
    expect(res.status).toBe(400)
  })

  it('PUT also accepts a bare settings object (no wrapper)', async () => {
    const res = await PUT(putReq(defaultOpzavaAdminSettings()))
    expect(res.status).toBe(200)
  })
})
