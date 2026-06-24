import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getStatusAction } from '@/lib/status-actions'

/**
 * GET /api/status — thin HTTP adapter over the status-action registry.
 *
 * All action handling lives behind {@link getStatusAction} (`@/lib/status-actions`).
 * This route only enforces the two things that belong at the HTTP edge:
 *   1. anonymous probes (`action=health`) run before auth — Docker/Kubernetes
 *      health probes must work without cookies;
 *   2. viewer auth for every other action, then uniform dispatch + error handling.
 *
 * Add or change a surface by editing the registry, not this route.
 */
export async function GET(request: NextRequest) {
  const action = new URL(request.url).searchParams.get('action') || 'overview'
  const handler = getStatusAction(action)

  // Anonymous probes run before auth.
  if (handler && !handler.requiresAuth) {
    try {
      return NextResponse.json(await handler.run({ workspaceId: 1, request }))
    } catch (error) {
      logger.error({ err: error }, 'Status API error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!handler) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    const data = await handler.run({ workspaceId: auth.user.workspace_id ?? 1, request })
    return NextResponse.json(data)
  } catch (error) {
    logger.error({ err: error }, 'Status API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
