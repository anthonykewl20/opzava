import { NextRequest, NextResponse } from 'next/server'
import { withRequestContext } from '@/lib/request-context'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { issueDeviceCode } from '@/opzava/core/auth/device-code'
import { hashToken } from '@/opzava/core/auth/crypto'
import { DEVICE_SESSION_TTL_SEC } from '@/opzava/core/auth/contracts'

/**
 * POST /api/auth/device/code — RFC 8628 §3.1 device-authorization request (D4).
 *
 * A local agent tool requests a device code + user code. The device_code (>=128 bits) is
 * hashed before storage (never persisted raw); the user_code is stored canonical. The
 * session is created `pending`; the user approves it at the verification_uri (/device) in
 * a browser, and the agent polls POST /api/auth/device/token grant_type=device_code (D4).
 *
 * Returns { device_code, user_code, verification_uri, expires_in, interval } per RFC 8628 §3.2.
 */
async function handlePost(request: NextRequest) {
  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  let body: { client_id?: string; client_label?: string; scopes?: string[] }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const { deviceCode, userCode, userCodeCanonical } = issueDeviceCode()
  const now = Math.floor(Date.now() / 1000)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

  const db = getDatabase()
  db.prepare(
    `INSERT INTO oauth_device_sessions
       (user_code_canonical, device_code_hash, status, scopes, client_label, requested_by_ip, expires_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
  ).run(
    userCodeCanonical,
    hashToken(deviceCode),
    body.scopes ? JSON.stringify(body.scopes) : null,
    body.client_label ?? null,
    ip,
    now + DEVICE_SESSION_TTL_SEC,
  )

  const origin = process.env.MC_DEVICE_ORIGIN || new URL(request.url).origin
  logger.info({ userCode: userCodeCanonical.slice(0, 2) }, 'device-authorization flow started')

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${origin}/device`,
    expires_in: DEVICE_SESSION_TTL_SEC,
    interval: 5,
  })
}

export const POST = withRequestContext(handlePost)
