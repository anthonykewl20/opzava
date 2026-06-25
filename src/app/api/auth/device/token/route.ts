import { NextRequest, NextResponse } from 'next/server'
import { withRequestContext } from '@/lib/request-context'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { rotate, issueForDevice, type DeviceTokenDeps } from '@/opzava/core/auth/token-service'
import { hashToken } from '@/opzava/core/auth/crypto'

/**
 * POST /api/auth/device/token — OAuth2 token endpoint for device authorization (D3).
 *
 * grant_type=refresh_token: rotate a refresh token into a fresh pair via the core/auth
 * server-safe guard (concurrent loser -> 409 already_rotated, NOT revoked; stale replay
 * -> 401 + chain revoked). grant_type=device_code (the polling/approval grant) is
 * accepted grant-type-agnostically but implemented with D4 (the /device approval flow).
 *
 * The endpoint is grant-type-agnostic by design (D-1): the HTTP-MCP authorization_code+PKCE
 * future grant reuses this route without a rewrite.
 */
async function handlePost(request: NextRequest) {
  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  let body: { grant_type?: string; refresh_token?: string; device_code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (body.grant_type === 'device_code') {
    return handleDeviceCodeGrant(body)
  }
  if (body.grant_type !== 'refresh_token') {
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'refresh_token is required' },
      { status: 400 },
    )
  }

  const deps: DeviceTokenDeps = {
    db: getDatabase(),
    now: () => Math.floor(Date.now() / 1000),
    // rotate() does not derive a role; the mapping satisfies the deps type. (resolveDeviceToken
    // is the only consumer of deriveRole, and it is wired in B1b with the real mapper.)
    deriveRole: (scopes) =>
      scopes.includes('admin') ? 'admin' : scopes.includes('operator') ? 'operator' : 'viewer',
  }

  const outcome = rotate(deps, body.refresh_token)

  if (outcome.kind === 'rotated') {
    return NextResponse.json({
      access_token: outcome.tokens.accessToken,
      refresh_token: outcome.tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: outcome.tokens.accessExpiresAt - Math.floor(Date.now() / 1000),
    })
  }
  if (outcome.kind === 'already_rotated') {
    // Legit concurrent loser — the current token is still valid; the client keeps it.
    return NextResponse.json(
      { error: 'already_rotated', error_description: 'a concurrent refresh won; keep using the current token' },
      { status: 409 },
    )
  }
  // invalid_grant (unknown/revoked) or reuse_detected (chain revoked) — both 401.
  if (outcome.kind === 'reuse_detected') {
    logger.warn('device-token rotation reuse detected — chain revoked')
  }
  return NextResponse.json({ error: 'invalid_grant' }, { status: 401 })
}

/**
 * device_code grant (RFC 8628 §3.4-3.5): the agent tool polls with its device_code.
 * pending → authorization_pending; approved → issue tokens + consume (atomic claim); denied →
 * access_denied; expired/unknown → expired_token.
 */
function handleDeviceCodeGrant(body: { device_code?: string }): NextResponse {
  if (typeof body.device_code !== 'string' || !body.device_code) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'device_code is required' }, { status: 400 })
  }

  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const session = db
    .prepare('SELECT id, status, user_id, expires_at, scopes FROM oauth_device_sessions WHERE device_code_hash = ?')
    .get(hashToken(body.device_code)) as { id: number; status: string; user_id: number; expires_at: number; scopes: string | null } | undefined

  if (!session || session.expires_at < now) {
    return NextResponse.json({ error: 'expired_token' }, { status: 400 })
  }
  if (session.status === 'pending') {
    return NextResponse.json({ error: 'authorization_pending' }, { status: 400 })
  }
  if (session.status === 'denied') {
    return NextResponse.json({ error: 'access_denied' }, { status: 401 })
  }
  if (session.status !== 'approved') {
    return NextResponse.json({ error: 'expired_token' }, { status: 400 })
  }

  // Atomic claim: only one poll can consume the approved session (prevents double-issue).
  const claim = db
    .prepare("UPDATE oauth_device_sessions SET status = 'consumed' WHERE id = ? AND status = 'approved'")
    .run(session.id)
  if (claim.changes === 0) return NextResponse.json({ error: 'authorization_pending' }, { status: 400 })

  // Look up the approving user's workspace for the device-token scope.
  const user = db.prepare('SELECT workspace_id FROM users WHERE id = ?').get(session.user_id) as { workspace_id: number } | undefined
  if (!user) return NextResponse.json({ error: 'invalid_grant' }, { status: 401 })

  let scopes: string[] = []
  try { scopes = session.scopes ? JSON.parse(session.scopes) : [] } catch { /* empty */ }
  const pair = issueForDevice(
    { db, now: () => now, deriveRole: (s) => s.includes('admin') ? 'admin' : s.includes('operator') ? 'operator' : 'viewer' },
    { userId: session.user_id, workspaceId: user.workspace_id, deviceId: `device-${session.id}`, scopes },
  )

  return NextResponse.json({
    access_token: pair.accessToken,
    refresh_token: pair.refreshToken,
    token_type: 'Bearer',
    expires_in: pair.accessExpiresAt - now,
  })
}

export const POST = withRequestContext(handlePost)
