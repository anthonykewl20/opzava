import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET, POST } from './route'
import { POST as APPROVE } from './[id]/approve/route'

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function draftBody() {
  return {
    name: 'Launch',
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [{ stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 }],
    audience: {
      schemaVersion: 1,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  }
}

describe('campaigns api', () => {
  it('POST creates a draft campaign', async () => {
    const res = await POST(req('POST', 'http://localhost/api/campaigns', draftBody()))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.status).toBe('draft')
    expect(typeof json.campaignId).toBe('string')
    expect(json.campaignId.length).toBeGreaterThan(0)
    expect(json.name).toBe('Launch')
  })

  it('GET lists campaigns after a POST', async () => {
    const created = await POST(req('POST', 'http://localhost/api/campaigns', draftBody()))
    const createdJson = await created.json()
    const res = await GET(req('GET', 'http://localhost/api/campaigns'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.campaigns)).toBe(true)
    expect(json.campaigns.length).toBe(1)
    expect(json.campaigns[0].campaignId).toBe(createdJson.campaignId)
  })

  it('POST with missing field returns 400', async () => {
    const bad = { name: 'Launch', startAt: '2026-07-01T09:00:00.000Z', audience: draftBody().audience }
    const res = await POST(req('POST', 'http://localhost/api/campaigns', bad))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(typeof json.error).toBe('string')
  })

  it('approve transitions a draft to approved', async () => {
    const created = await POST(req('POST', 'http://localhost/api/campaigns', draftBody()))
    const createdJson = await created.json()
    const id = createdJson.campaignId
    const res = await APPROVE(
      req('POST', `http://localhost/api/campaigns/${id}/approve`),
      { params: Promise.resolve({ id }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('approved')
    expect(json.campaignId).toBe(id)
  })

  it('approve a non-existent id returns 404', async () => {
    const res = await APPROVE(
      req('POST', 'http://localhost/api/campaigns/nope/approve'),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Campaign not found')
  })

  it('approving an already-approved campaign returns 409', async () => {
    const created = await POST(req('POST', 'http://localhost/api/campaigns', draftBody()))
    const createdJson = await created.json()
    const id = createdJson.campaignId
    const first = await APPROVE(
      req('POST', `http://localhost/api/campaigns/${id}/approve`),
      { params: Promise.resolve({ id }) },
    )
    expect(first.status).toBe(200)
    const second = await APPROVE(
      req('POST', `http://localhost/api/campaigns/${id}/approve`),
      { params: Promise.resolve({ id }) },
    )
    expect(second.status).toBe(409)
    const json = await second.json()
    expect(typeof json.error).toBe('string')
  })
})
