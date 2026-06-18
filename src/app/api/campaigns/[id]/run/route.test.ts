import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { createCampaignRepository, parseCampaign } from '@/opzava/modules/content'

const { dbRef } = vi.hoisted(() => ({
  dbRef: { db: null as any },
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbRef.db,
}))

import { POST } from './route'

function seedSettings(db: any) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
  )
  const ins = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
  )
  ins.run('resend_from_address', 'news@example.com')
  ins.run('resend_api_key', 're_test_123')
}

function seedCampaign(db: any, status: string) {
  const repo = createCampaignRepository(db)
  repo.ensureSchema()
  const c = parseCampaign({
    schemaVersion: 1,
    campaignId: 'camp-1',
    name: 'Launch',
    status,
    startAt: '2020-01-01T00:00:00.000Z',
    steps: [
      { stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 },
    ],
    audience: {
      schemaVersion: 1,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  })
  repo.saveCampaign(c)
}

function req(id: string) {
  return new NextRequest(
    `http://localhost/api/campaigns/${id}/run`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  )
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  dbRef.db = new Database(':memory:')
  dbRef.db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 're_1' }),
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/campaigns/[id]/run', () => {
  it('400 when Resend is not configured', async () => {
    seedCampaign(dbRef.db, 'approved')
    const res = await POST(req('camp-1'), ctx('camp-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Resend is not configured')
  })

  it('404 for an unknown campaign', async () => {
    seedSettings(dbRef.db)
    const res = await POST(req('nope'), ctx('nope'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/)
  })

  it('409 for a non-approved campaign', async () => {
    seedSettings(dbRef.db)
    seedCampaign(dbRef.db, 'draft')
    const res = await POST(req('camp-1'), ctx('camp-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not approved/)
  })

  it('200 and status sent for an approved campaign', async () => {
    seedSettings(dbRef.db)
    seedCampaign(dbRef.db, 'approved')
    const res = await POST(req('camp-1'), ctx('camp-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('sent')
    expect(global.fetch).toHaveBeenCalled()
  })
})
