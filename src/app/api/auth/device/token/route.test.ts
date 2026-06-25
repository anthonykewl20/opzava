import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

import { runMigrations } from '@/lib/migrations'

// Shared in-memory DB the route's getDatabase() returns (device_tokens via migration 058).
const holder = vi.hoisted(() => ({ db: null as Database.Database | null }))

vi.mock('@/lib/db', () => ({ getDatabase: () => holder.db }))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: () => null }))
vi.mock('@/lib/request-context', () => ({ withRequestContext: (fn: unknown) => fn }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { issueForDevice } from '@/opzava/core/auth/token-service'
import { POST } from './route'

describe('POST /api/auth/device/token (D3 refresh grant)', () => {
  beforeAll(() => {
    holder.db = new Database(':memory:')
    runMigrations(holder.db)
  })

  const post = (body: unknown) =>
    POST(new NextRequest('http://localhost/api/auth/device/token', {
      method: 'POST',
      body: JSON.stringify(body),
    }))

  it('rejects an unsupported grant_type', async () => {
    const res = await post({ grant_type: 'device_code', device_code: 'x' })
    expect(res.status).toBe(400)
  })

  it('rejects a missing refresh_token', async () => {
    const res = await post({ grant_type: 'refresh_token' })
    expect(res.status).toBe(400)
  })

  it('rotates a valid refresh token into a fresh pair', async () => {
    const db = holder.db as Database.Database
    const pair = issueForDevice(
      { db, now: () => 1_700_000_000, deriveRole: () => 'viewer' },
      { userId: 1, workspaceId: 1, deviceId: 'd-rotate', scopes: ['viewer'] },
    )
    const res = await post({ grant_type: 'refresh_token', refresh_token: pair.refreshToken })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token_type).toBe('Bearer')
    expect(body.access_token).toBeTruthy()
    expect(body.refresh_token).not.toBe(pair.refreshToken)
    expect(typeof body.expires_in).toBe('number')
  })

  it('returns 409 already_rotated for a legit concurrent re-presentation', async () => {
    const db = holder.db as Database.Database
    const pair = issueForDevice(
      { db, now: () => 1_700_000_000, deriveRole: () => 'viewer' },
      { userId: 2, workspaceId: 1, deviceId: 'd-concurrent', scopes: ['viewer'] },
    )
    // First rotate wins.
    await post({ grant_type: 'refresh_token', refresh_token: pair.refreshToken })
    // Re-present the same (now-rotated) refresh token immediately -> 409, NOT revoked.
    const res = await post({ grant_type: 'refresh_token', refresh_token: pair.refreshToken })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('already_rotated')
  })

  it('returns 401 invalid_grant for an unknown refresh token', async () => {
    const res = await post({ grant_type: 'refresh_token', refresh_token: 'mc_rt_unknown' })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid_grant')
  })
})
