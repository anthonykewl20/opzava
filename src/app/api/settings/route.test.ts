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

describe('/api/settings provider connection secrets', () => {
  beforeEach(() => {
    store.clear()
    logAuditEventMock.mockClear()
  })

  it('redacts sensitive settings and reports configured state on GET', async () => {
    store.set('resend_api_key', {
      key: 'resend_api_key',
      value: 're_secret_123',
      description: 'Resend API key',
      category: 'Provider Connections',
      updated_by: 'admin',
      updated_at: 1,
    })

    const body = await (await GET(request('GET'))).json()
    const resendApiKey = body.settings.find((setting: { key: string }) => setting.key === 'resend_api_key')
    const wordpressPassword = body.settings.find((setting: { key: string }) => setting.key === 'wordpress_app_password')

    expect(JSON.stringify(body)).not.toContain('re_secret_123')
    expect(resendApiKey).toMatchObject({ value: '[redacted]', sensitive: true, configured: true })
    expect(wordpressPassword).toMatchObject({ value: '', sensitive: true, configured: false })
  })

  it('stores sensitive settings and ignores empty sensitive updates when already configured', async () => {
    const createRes = await PUT(request('PUT', {
      settings: {
        wordpress_site_url: 'https://example.com',
        wordpress_app_password: 'wp-app-password',
        resend_from_address: 'news@example.com',
        resend_api_key: 're_secret_123',
      },
    }))

    expect(createRes.status).toBe(200)
    expect(store.get('wordpress_app_password')?.value).toBe('wp-app-password')
    expect(store.get('resend_api_key')?.value).toBe('re_secret_123')

    const updateRes = await PUT(request('PUT', {
      settings: {
        resend_from_name: 'News Desk',
        resend_api_key: '',
      },
    }))

    expect(updateRes.status).toBe(200)
    expect(store.get('resend_from_name')?.value).toBe('News Desk')
    expect(store.get('resend_api_key')?.value).toBe('re_secret_123')
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
