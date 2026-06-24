import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getChatMetrics } from '@/lib/realtime-metrics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ops/chat-metrics — best-effort, no-SLA gauges for the realtime/SSE
 * subsystem. Admin-gated. Reuses the gauge pattern from dead-letters/route.ts.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  return NextResponse.json(getChatMetrics())
}
