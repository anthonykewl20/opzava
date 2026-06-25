import { NextRequest, NextResponse } from 'next/server'
import { withRequestContext } from '@/lib/request-context'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { rotate, type DeviceTokenDeps } from '@/opzava/core/auth/token-service'

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

  if (body.grant_type !== 'refresh_token') {
    // device_code is acknowledged but lands with D4; authorization_code with the HTTP-MCP future.
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

export const POST = withRequestContext(handlePost)
