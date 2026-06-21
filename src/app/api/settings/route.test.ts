import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type StoredSetting = {
  key: string
  value: string
  description: string | null
  category: string
  updated_by: string | null
  updated_at: number
}

const { store, logAuditEventMock } = vi.hoisted(() => ({
  store: new Map<string, StoredSetting>(),
  logAuditEventMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => {
      if (sql.includes('SELECT * FROM settings')) {
        return { all: () => Array.from(store.values()) }
      }
      if (sql.includes('SELECT value FROM settings WHERE key = ?')) {
        return { get: (key: string) => store.get(key) }
      }
      if (sql.includes('INSERT INTO settings')) {
        return {
          run: (key: string, value: string, description: string | null, category: string, updatedBy: string) => {
            store.set(key, {
              key,
              value,
              description,
              category,
              updated_by: updatedBy,
              updated_at: 1,
            })
          },
        }
      }
      throw new Error(`Unhandled SQL: ${sql}`)
    },
    transaction: (fn: () => void) => fn,
  }),
  logAuditEvent: logAuditEventMock,
}))

import { GET, PUT } from './route'

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/settings', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('/api/settings provider connections', () => {
  beforeEach(() => {
    store.clear()
    logAuditEventMock.mockClear()
  })

  // ARD 0008: provider secrets are environment-provided. The settings route stores only the
  // non-secret connection fields; no cleartext secret setting is defined.
  it('does not define provider secrets as stored settings on GET', async () => {
    const body = await (await GET(request('GET'))).json()
    const keys = body.settings.map((s: { key: string }) => s.key)
    expect(keys).not.toContain('resend_api_key')
    expect(keys).not.toContain('wordpress_app_password')
    expect(keys).toContain('wordpress_site_url')
    expect(keys).toContain('resend_from_address')
  })

  it('stores non-secret provider connection fields', async () => {
    const res = await PUT(request('PUT', {
      settings: {
        wordpress_site_url: 'https://example.com',
        resend_from_address: 'news@example.com',
        resend_from_name: 'News Desk',
      },
    }))

    expect(res.status).toBe(200)
    expect(store.get('wordpress_site_url')?.value).toBe('https://example.com')
    expect(store.get('resend_from_address')?.value).toBe('news@example.com')
    expect(store.get('resend_from_name')?.value).toBe('News Desk')
  })

  it('rejects malformed provider connection values', async () => {
    const badUrl = await PUT(request('PUT', { settings: { wordpress_site_url: 'not-a-url' } }))
    const badEmail = await PUT(request('PUT', { settings: { resend_from_address: 'not-email' } }))

    expect(badUrl.status).toBe(400)
    expect(badEmail.status).toBe(400)
    expect(store.has('wordpress_site_url')).toBe(false)
    expect(store.has('resend_from_address')).toBe(false)
  })
})
