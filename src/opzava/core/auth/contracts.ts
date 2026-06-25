import { z } from 'zod'

/**
 * Device-authorization contracts (RFC 8628) — the framework-independent core of the
 * local-agent-tool <-> cloud-Opzava auth. Lives in `core/` (no platform/modules imports;
 * the layering guard in src/opzava/architecture.test.ts enforces this) so the token
 * model is a domain primitive every layer validates against. The DB/clock/role-derivation
 * are DEPENDENCY-INJECTED by the wiring (B1b in src/lib/auth.ts) — core stays pure.
 *
 * Decisions (ARD 0012): 8h access / 30d rotating refresh; stdio-only (no HTTP-MCP);
 * device tokens are NEVER admin (capped at operator/viewer) regardless of approver;
 * local store 0o600 no-passphrase. See MASTER-PLAN Track D.
 */

export const DEVICE_TOKEN_KIND = 'DeviceToken' as const

export const ACCESS_TOKEN_TTL_SEC = 8 * 60 * 60 // 8 hours
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60 // 30 days
export const ACCESS_SKEW_SEC = 60 // accept up to 60s past expiry (clock drift)
/**
 * Grace window for refresh-token rotation disambiguation. A presented refresh token whose
 * row was rotated within this window is a legitimate CONCURRENT loser (another refresh won
 * the race moments ago) -> already_rotated, NOT revoked. A token rotated longer ago than
 * this is a stale replay -> genuine reuse -> family revoke. Trades a small reuse window
 * for not locking users out on every legitimate concurrent retry.
 */
export const ROTATION_GRACE_SEC = 30

/** Base-20, confusable-free user-code charset (RFC 8628 §6.1 — no 0/O/1/I etc.). */
export const USER_CODE_CHARSET = 'BCDFGHJKLMNPQRSTVWXZ'
export const USER_CODE_LEN = 8 // ~34.5 bits
export const DEVICE_CODE_BYTES = 32 // >=128 bits (RFC 8628 §5.2); never displayed
export const DEVICE_SESSION_TTL_SEC = 15 * 60 // the device/user code pair lifetime

/** Device tokens can never resolve to admin, regardless of approved scopes. */
export const DEVICE_TOKEN_MAX_ROLE = 'operator' as const
export type DeviceTokenRole = 'viewer' | 'operator'

export const deviceScopesSchema = z.array(z.string()).min(0)

/** Raw opaque token shapes (prefix + 32 random bytes hex). */
export const ACCESS_TOKEN_PREFIX = 'mc_dt'
export const REFRESH_TOKEN_PREFIX = 'mc_rt'

export interface IssuedTokenPair {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number // unix seconds
  refreshExpiresAt: number // unix seconds
  rotationChainId: string
  rotationSeq: number
}

export interface DevicePrincipal {
  userId: number
  workspaceId: number
  agentName: string | null
  role: DeviceTokenRole
  deviceId: string
  rotationChainId: string
}

/** Cap an arbitrary role/scopes set at operator — device tokens are never admin. */
export function capRole(role: 'viewer' | 'operator' | 'admin'): DeviceTokenRole {
  return role === 'admin' ? 'operator' : role
}
