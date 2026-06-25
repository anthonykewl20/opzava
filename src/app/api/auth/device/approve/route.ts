import { NextRequest, NextResponse } from 'next/server'
import { withRequestContext } from '@/lib/request-context'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { canonicalizeUserCode } from '@/opzava/core/auth/device-code'

/**
 * POST /api/auth/device/approve — the browser leg of RFC 8628 (D4b). A logged-in user
 * approves or denies a pending device-authorization session by entering the user_code.
 * The session is atomically claimed (status pending→approved/denied); on approval the
 * user_id is recorded so the token endpoint can issue a workspace-scoped device token.
 */
async function handlePost(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  let body: { user_code?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (!body.user_code || !['approve', 'deny'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'user_code and action (approve|deny) required' }, { status: 400 })
  }

  const canonical = canonicalizeUserCode(body.user_code)
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const session = db
    .prepare('SELECT id, status, expires_at FROM oauth_device_sessions WHERE user_code_canonical = ?')
    .get(canonical) as { id: number; status: string; expires_at: number } | undefined

  if (!session) return NextResponse.json({ error: 'no such session' }, { status: 404 })
  if (session.expires_at < now) return NextResponse.json({ error: 'expired_token' }, { status: 410 })
  if (session.status !== 'pending') return NextResponse.json({ error: 'session already decided' }, { status: 409 })

  const newStatus = body.action === 'deny' ? 'denied' : 'approved'
  const claim = db
    .prepare("UPDATE oauth_device_sessions SET status = ?, approved_at = ?, approved_by = ?, user_id = ? WHERE id = ? AND status = 'pending'")
    .run(newStatus, now, auth.user.username, auth.user.id, session.id)

  if (claim.changes === 0) return NextResponse.json({ error: 'session already decided' }, { status: 409 })

  return NextResponse.json({ status: newStatus })
}

export const POST = withRequestContext(handlePost)
