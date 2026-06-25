import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

import { runMigrations } from '@/lib/migrations'

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }))

vi.mock('@/lib/db', () => ({ getDatabase: () => holder.db }))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: () => null }))
vi.mock('@/lib/request-context', () => ({ withRequestContext: (fn: unknown) => fn }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { POST } from './route'
import { DEVICE_SESSION_TTL_SEC } from '@/opzava/core/auth/contracts'

describe('POST /api/auth/device/code (D4 device-authorization request)', () => {
  beforeAll(() => {
    holder.db = new Database(':memory:')
    runMigrations(holder.db)
  })

  it('returns the RFC 8628 §3.2 response shape', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/auth/device/code', {
        method: 'POST',
        body: JSON.stringify({ client_label: 'claude-code on macbook' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.device_code).toMatch(/^[\w-]{20,}$/) // >=128 bits base64url, never displayed raw to the user
    expect(body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/) // base-20 XXXX-XXXX
    expect(body.verification_uri).toMatch(/\/device$/)
    expect(body.expires_in).toBe(DEVICE_SESSION_TTL_SEC)
    expect(body.interval).toBe(5)
  })

  it('stores a PENDING session with the device_code HASHED (never the raw device_code)', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/auth/device/code', { method: 'POST', body: '{}' }),
    )
    const { device_code } = await res.json()
    const db = holder.db as Database.Database
    const rows = db.prepare('SELECT device_code_hash, status FROM oauth_device_sessions').all() as Array<{
      device_code_hash: string
      status: string
    }>
    // The raw device_code never appears in storage; only its hash.
    expect(rows.some((r) => r.device_code_hash.length === 64)).toBe(true) // sha256 hex
    expect(rows.every((r) => !JSON.stringify(r).includes(device_code))).toBe(true)
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
  })
})
