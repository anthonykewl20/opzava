import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import {
  resolveWordpressLiveConnection,
  resolveResendLiveConnection,
  type SettingsReader,
} from '@/opzava/modules/content/providers/connection-settings-resolver'
import {
  verifyWordpressConnection,
  verifyResendConnection,
  type FetchLike,
} from '@/opzava/modules/content/providers/connection-verifier'

const fetchImpl = fetch as unknown as FetchLike

/**
 * POST /api/connections/test - Verify a saved provider connection.
 * Body: { provider: 'wordpress' | 'resend' }
 * Reads saved settings, resolves the live connection, and performs a lightweight
 * reachability/credential check. Never returns or logs the stored secret.
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
  const read: SettingsReader = (key) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value

  if (body.provider === 'wordpress') {
    const conn = resolveWordpressLiveConnection(read)
    if (!conn) return NextResponse.json({ ok: false, message: 'WordPress is not configured yet' })
    return NextResponse.json(await verifyWordpressConnection(conn, fetchImpl))
  }

  if (body.provider === 'resend') {
    const conn = resolveResendLiveConnection(read)
    if (!conn) return NextResponse.json({ ok: false, message: 'Resend is not configured yet' })
    return NextResponse.json(await verifyResendConnection(conn, fetchImpl))
  }

  return NextResponse.json({ error: "provider must be 'wordpress' or 'resend'" }, { status: 400 })
}
