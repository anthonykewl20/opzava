import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import {
  resolveResendCampaignConnection,
  resolveWordpressDraftConnection,
} from '@/opzava/modules/content'
import {
  verifyWordpressConnection,
  verifyResendConnection,
  type FetchLike,
} from '@/opzava/modules/content/providers/connection-verifier'
import { createEnvSecretResolver } from '@/opzava/platform/providers/env-secret-resolver'

const fetchImpl = fetch as unknown as FetchLike

/**
 * POST /api/connections/test - Verify a provider connection.
 * Body: { provider: 'wordpress' | 'resend' }
 *
 * Per ARD 0008, provider secrets are environment-provided: non-secret fields come from the saved
 * settings while the secret resolves from the environment through the `SecretReference` boundary.
 * Performs a lightweight reachability/credential check. Never returns or logs the secret.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  let body: { provider?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  const db = getDatabase()
  const readSetting = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value

  // The process.env read stays at this app boundary; the resolver itself never touches the DB.
  const resolver = createEnvSecretResolver({ readEnv: (name) => process.env[name] })

  if (body.provider === 'wordpress') {
    const resolved = await resolveWordpressDraftConnection({ readSetting, resolver })
    if (!resolved.ok) return NextResponse.json({ ok: false, message: 'WordPress is not configured yet' })
    return NextResponse.json(await verifyWordpressConnection(resolved.connection, fetchImpl))
  }

  if (body.provider === 'resend') {
    const resolved = await resolveResendCampaignConnection({ readSetting, resolver })
    if (!resolved.ok) return NextResponse.json({ ok: false, message: 'Resend is not configured yet' })
    return NextResponse.json(await verifyResendConnection(resolved.connection, fetchImpl))
  }

  return NextResponse.json({ error: "provider must be 'wordpress' or 'resend'" }, { status: 400 })
}
