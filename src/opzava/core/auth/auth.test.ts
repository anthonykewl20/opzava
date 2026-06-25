import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

import { ACCESS_SKEW_SEC, ACCESS_TOKEN_TTL_SEC, ROTATION_GRACE_SEC } from './contracts'
import { issueForDevice, resolveDeviceToken, rotate, revokeChain, type DeviceTokenDeps } from './token-service'

// D2: the device-auth core. The rotation-guard test is the load-bearing correctness
// property — a legitimate concurrent loser must NOT be revoked (the false-revoke bug a
// naive implementation produces), while a stale replay must revoke the whole chain.

describe('core/auth token-service (D2)', () => {
  let db: Database.Database | null = null
  let nowSec = 1_700_000_000

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    nowSec = 1_700_000_000
  })
  afterEach(() => {
    db?.close()
    db = null
  })

  const deps = (): DeviceTokenDeps => ({
    db: db as Database.Database,
    now: () => nowSec,
    deriveRole: (scopes) =>
      scopes.includes('admin') ? 'admin' : scopes.includes('operator') ? 'operator' : 'viewer',
  })

  it('issueForDevice requires an explicit workspaceId (no cross-tenant default)', () => {
    expect(() =>
      issueForDevice(deps(), { userId: 1, workspaceId: 0, deviceId: 'd', scopes: [] }),
    ).toThrow()
  })

  it('device tokens are never admin — admin scope is capped to operator', () => {
    const pair = issueForDevice(deps(), { userId: 1, workspaceId: 1, deviceId: 'd', scopes: ['admin'] })
    expect(resolveDeviceToken(deps(), pair.accessToken)?.role).toBe('operator')
  })

  it('resolveDeviceToken returns null for an unknown bearer', () => {
    expect(resolveDeviceToken(deps(), 'mc_dt_unknown')).toBeNull()
  })

  it('resolveDeviceToken returns null after the chain is revoked', () => {
    const pair = issueForDevice(deps(), { userId: 1, workspaceId: 1, deviceId: 'd', scopes: ['viewer'] })
    revokeChain(db as Database.Database, pair.rotationChainId, nowSec, 'test')
    expect(resolveDeviceToken(deps(), pair.accessToken)).toBeNull()
  })

  it('resolveDeviceToken rejects an access token past expiry + skew', () => {
    const pair = issueForDevice(deps(), { userId: 1, workspaceId: 1, deviceId: 'd', scopes: ['viewer'] })
    nowSec += ACCESS_TOKEN_TTL_SEC + ACCESS_SKEW_SEC + 1
    expect(resolveDeviceToken(deps(), pair.accessToken)).toBeNull()
  })

  it('rotate: winner rotates; concurrent loser (within grace) is already_rotated NOT revoked; stale replay (past grace) is reuse_detected + family revoked', () => {
    const pair = issueForDevice(deps(), { userId: 1, workspaceId: 1, deviceId: 'd', scopes: ['viewer'] })

    // Winner: r1 -> r2.
    const r1 = rotate(deps(), pair.refreshToken)
    expect(r1.kind).toBe('rotated')
    if (r1.kind !== 'rotated') return
    const pair2 = r1.tokens

    // Legit concurrent loser re-presents r1 within the grace window -> already_rotated.
    expect(rotate(deps(), pair.refreshToken).kind).toBe('already_rotated')
    // The current token (pair2) is still valid — the loser did NOT revoke the chain.
    expect(resolveDeviceToken(deps(), pair2.accessToken)?.userId).toBe(1)

    // Stale replay past the grace window -> genuine reuse -> family revoked.
    nowSec += ROTATION_GRACE_SEC + 1
    expect(rotate(deps(), pair.refreshToken).kind).toBe('reuse_detected')
    expect(resolveDeviceToken(deps(), pair2.accessToken)).toBeNull()
  })

  it('rotate rejects an unknown refresh token with invalid_grant', () => {
    expect(rotate(deps(), 'mc_rt_unknown').kind).toBe('invalid_grant')
  })

  it('the current (unrotated) refresh token keeps rotating forward', () => {
    const pair = issueForDevice(deps(), { userId: 1, workspaceId: 1, deviceId: 'd', scopes: ['viewer'] })
    const r1 = rotate(deps(), pair.refreshToken)
    if (r1.kind !== 'rotated') return
    // The NEW refresh token is the current one -> rotates again (wins).
    expect(rotate(deps(), r1.tokens.refreshToken).kind).toBe('rotated')
  })
})
