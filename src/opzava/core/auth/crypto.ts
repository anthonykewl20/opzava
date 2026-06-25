import { createHash, randomBytes } from 'node:crypto'
import { ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX } from './contracts'

/**
 * Token crypto — pure helpers. Raw tokens are generated once, returned to the caller,
 * and only their SHA-256 hash is ever persisted/compared (mirrors src/lib/auth.ts
 * hashApiKey/hashSessionToken). No raw token crosses into a log, artifact, or DB row.
 */

/** SHA-256 hex of a raw token. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** A new opaque token: prefix + 32 random bytes hex (256 bits). */
export function newOpaqueToken(prefix: typeof ACCESS_TOKEN_PREFIX | typeof REFRESH_TOKEN_PREFIX): string {
  return `${prefix}_${randomBytes(32).toString('hex')}`
}

/** Log/UI mask — never reveals the raw token. */
export function maskToken(raw: string): string {
  return raw.length > 8 ? `${raw.slice(0, 4)}…${raw.slice(-2)}` : '…'
}
