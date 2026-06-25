import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  ACCESS_SKEW_SEC,
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_SEC,
  capRole,
  DEVICE_TOKEN_MAX_ROLE,
  type DevicePrincipal,
  type DeviceTokenRole,
  type IssuedTokenPair,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_SEC,
  ROTATION_GRACE_SEC,
} from './contracts'
import { hashToken, newOpaqueToken } from './crypto'

/**
 * Device-token service — issuance, validation, rotation, revocation. Dependency-injected
 * (db / clock / role-derivation) so this stays a pure `core/` module with no platform or
 * src/lib import (the wiring lands in B1b, src/lib/auth.ts).
 *
 * ROTATION GUARD (the load-bearing correctness property). Refresh-token rotation is the
 * #1 subtle-bug surface: a naive "loser revokes the family" locks the user out on every
 * legitimate concurrent retry (two shims, a retrying proxy). The guard here is:
 *   1. A conditional UPDATE (`WHERE revoked_at IS NULL AND rotated_at IS NULL`) is the
 *      cross-instance lock — exactly one concurrent refresh wins.
 *   2. On a loss (changes===0), disambiguate by rotation_seq (NOT by rotated_at-presence):
 *      revoked -> invalid_grant; seq == chain-max -> legit concurrent loser (already_rotated,
 *      NO revoke); seq < chain-max -> genuine reuse -> family revoke.
 * Cross-REPLICA races are bounded by the single-active-writer leader-lock (G1) — SQLite is
 * single-writer, so within-process concurrency is what this guard resolves.
 */

export interface DeviceTokenDeps {
  db: Database.Database
  /** Unix seconds. */
  now: () => number
  /** Derive a role from scopes; the result is capped at operator (device tokens are never admin). */
  deriveRole: (scopes: string[]) => 'viewer' | 'operator' | 'admin'
  /** Optional instant-revoke denylist (MC_DEVICE_INSTANT_REVOKE=1). */
  isAccessHashRevoked?: (accessHash: string) => boolean
}

interface DeviceTokenRow {
  id: number
  user_id: number
  workspace_id: number
  device_id: string
  scopes: string
  rotation_chain_id: string
  rotation_seq: number
  access_expires_at: number
  refresh_expires_at: number
  revoked_at: number | null
  rotated_at: number | null
}

function parseScopes(raw: string): string[] {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export interface IssueForDeviceInput {
  userId: number
  workspaceId: number // REQUIRED — no default (closes the cross-tenant trap at the caller)
  deviceId: string
  deviceLabel?: string | null
  scopes: string[]
  audience?: string | null
}

/**
 * Issue a fresh access (8h) + refresh (30d) pair for an approved device. REQUIRES an
 * explicit workspaceId (throws if missing) and caps the role at operator regardless of
 * the approver's scopes. Raw tokens are returned ONCE; only hashes are persisted.
 */
export function issueForDevice(deps: DeviceTokenDeps, input: IssueForDeviceInput): IssuedTokenPair {
  if (!input.workspaceId || input.workspaceId <= 0) {
    throw new Error('issueForDevice: explicit workspaceId is required (no default)')
  }
  const now = deps.now()
  const accessToken = newOpaqueToken(ACCESS_TOKEN_PREFIX)
  const refreshToken = newOpaqueToken(REFRESH_TOKEN_PREFIX)
  const rotationChainId = randomUUID()

  deps.db
    .prepare(
      `INSERT INTO device_tokens (
         user_id, workspace_id, device_id, device_label, client_kind, scopes,
         access_token_hash, refresh_token_hash, rotation_chain_id, rotation_seq,
         access_expires_at, refresh_expires_at, audience
       ) VALUES (?, ?, ?, ?, 'public', ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.workspaceId,
      input.deviceId,
      input.deviceLabel ?? null,
      JSON.stringify(input.scopes),
      hashToken(accessToken),
      hashToken(refreshToken),
      rotationChainId,
      now + ACCESS_TOKEN_TTL_SEC,
      now + REFRESH_TOKEN_TTL_SEC,
      input.audience ?? null,
    )

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: now + ACCESS_TOKEN_TTL_SEC,
    refreshExpiresAt: now + REFRESH_TOKEN_TTL_SEC,
    rotationChainId,
    rotationSeq: 1,
  }
}

/**
 * Resolve a bearer access token to a principal (or null). Hashes the bearer, looks up by
 * access_token_hash, validates expiry (with skew grace) + not-revoked + (optional) denylist,
 * caps the role at operator, and stamps last_seen. Never returns admin.
 */
export function resolveDeviceToken(deps: DeviceTokenDeps, bearer: string): DevicePrincipal | null {
  const accessHash = hashToken(bearer)
  const row = deps.db
    .prepare(
      `SELECT id, user_id, workspace_id, device_id, scopes, rotation_chain_id,
              access_expires_at, revoked_at
       FROM device_tokens WHERE access_token_hash = ?`,
    )
    .get(accessHash) as Pick<DeviceTokenRow, 'id' | 'user_id' | 'workspace_id' | 'device_id' | 'scopes' | 'rotation_chain_id' | 'access_expires_at' | 'revoked_at'> & {
    access_expires_at: number
    revoked_at: number | null
  } | undefined

  if (!row) return null
  if (row.revoked_at !== null) return null
  if (deps.isAccessHashRevoked?.(accessHash)) return null
  if (row.access_expires_at <= deps.now() - ACCESS_SKEW_SEC) return null

  const role = capRole(deps.deriveRole(parseScopes(row.scopes)))
  deps.db.prepare('UPDATE device_tokens SET last_seen_at = ? WHERE id = ?').run(deps.now(), row.id)

  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
    agentName: null,
    role,
    deviceId: row.device_id,
    rotationChainId: row.rotation_chain_id,
  }
}

export type RotateOutcome =
  | { kind: 'rotated'; tokens: IssuedTokenPair }
  | { kind: 'already_rotated' } // legit concurrent loser — the current token is still valid
  | { kind: 'invalid_grant' } // unknown / revoked refresh token
  | { kind: 'reuse_detected' } // stale token replayed after a newer rotation -> family revoked

/**
 * Rotate a refresh token into a fresh pair with the server-safe guard. Each rotation
 * INSERTs a NEW row (fresh pair, seq+1, same chain) and marks the presented row rotated_at
 * — the old row's refresh_token_hash is PRESERVED so a later replay is detectable as reuse.
 * (An in-place update would destroy that mapping and make every replay look unknown.) A
 * lost claim is disambiguated by a GRACE WINDOW, not rotation_seq — a legit concurrent
 * loser also has an older seq than the new winner, so seq alone would false-revoke it.
 */
export function rotate(deps: DeviceTokenDeps, refreshToken: string): RotateOutcome {
  const db = deps.db
  const now = deps.now()
  const presentedHash = hashToken(refreshToken)

  const current = db
    .prepare(
      'SELECT id, user_id, workspace_id, device_id, scopes, rotation_chain_id, rotation_seq, revoked_at FROM device_tokens WHERE refresh_token_hash = ?',
    )
    .get(presentedHash) as
    | (Pick<DeviceTokenRow, 'id' | 'user_id' | 'workspace_id' | 'device_id' | 'scopes' | 'rotation_chain_id' | 'rotation_seq'> & { revoked_at: number | null })
    | undefined
  if (!current || current.revoked_at !== null) return { kind: 'invalid_grant' }

  // 1) Atomic claim: only the CURRENT (unrotated, unrevoked) token wins. Mark it rotated;
  //    its refresh_token_hash stays intact for later reuse detection.
  const claim = db
    .prepare(
      'UPDATE device_tokens SET rotated_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL AND rotated_at IS NULL',
    )
    .run(now, now, current.id)

  if (claim.changes === 0) {
    // Lost the race — another refresh won moments ago. Disambiguate by grace window.
    const fresh = db
      .prepare('SELECT rotated_at FROM device_tokens WHERE id = ?')
      .get(current.id) as { rotated_at: number | null } | undefined
    const rotatedAt = fresh?.rotated_at ?? null
    if (rotatedAt === null) return { kind: 'invalid_grant' } // revoked concurrently
    if (now - rotatedAt <= ROTATION_GRACE_SEC) {
      // Legit concurrent loser — the current token is still valid; do NOT revoke.
      return { kind: 'already_rotated' }
    }
    // Stale replay past the grace window -> genuine reuse (RFC 6749 §10.4) -> family revoke.
    revokeChain(db, current.rotation_chain_id, now, 'rotation_reuse')
    return { kind: 'reuse_detected' }
  }

  // 2) Won. INSERT a fresh row (seq+1, same chain). The old row stays rotated with its hash
  //    preserved so a replay of the old refresh token is detectable later.
  const newAccess = newOpaqueToken(ACCESS_TOKEN_PREFIX)
  const newRefresh = newOpaqueToken(REFRESH_TOKEN_PREFIX)
  const nextSeq = current.rotation_seq + 1
  db.prepare(
    `INSERT INTO device_tokens (
       user_id, workspace_id, device_id, device_label, client_kind, scopes,
       access_token_hash, refresh_token_hash, refresh_token_prev_hash,
       rotation_chain_id, rotation_seq, access_expires_at, refresh_expires_at, audience
     ) VALUES (?, ?, ?, ?, 'public', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    current.user_id,
    current.workspace_id,
    current.device_id,
    null,
    current.scopes,
    hashToken(newAccess),
    hashToken(newRefresh),
    presentedHash,
    current.rotation_chain_id,
    nextSeq,
    now + ACCESS_TOKEN_TTL_SEC,
    now + REFRESH_TOKEN_TTL_SEC,
    null,
  )

  return {
    kind: 'rotated',
    tokens: {
      accessToken: newAccess,
      refreshToken: newRefresh,
      accessExpiresAt: now + ACCESS_TOKEN_TTL_SEC,
      refreshExpiresAt: now + REFRESH_TOKEN_TTL_SEC,
      rotationChainId: current.rotation_chain_id,
      rotationSeq: nextSeq,
    },
  }
}

/** Revoke every token in a rotation chain (idempotent on already-revoked rows). */
export function revokeChain(
  db: Database.Database,
  rotationChainId: string,
  now: number,
  reason: string,
): number {
  const r = db
    .prepare('UPDATE device_tokens SET revoked_at = ?, revoke_reason = ?, updated_at = ? WHERE rotation_chain_id = ? AND revoked_at IS NULL')
    .run(now, reason, now, rotationChainId)
  return r.changes
}

/** Revoke a single device by its DB id (used by the admin /api/auth/devices/[id]/revoke). */
export function revokeDevice(deps: DeviceTokenDeps, deviceId: number, reason: string): number {
  return revokeChain(deps.db, lookupChainByDeviceId(deps.db, deviceId), deps.now(), reason)
}

function lookupChainByDeviceId(db: Database.Database, deviceId: number): string {
  const row = db.prepare('SELECT rotation_chain_id FROM device_tokens WHERE id = ?').get(deviceId) as { rotation_chain_id: string } | undefined
  if (!row) throw new Error(`revokeDevice: device token ${deviceId} not found`)
  return row.rotation_chain_id
}

export { DEVICE_TOKEN_MAX_ROLE }
export type { DeviceTokenRole }
