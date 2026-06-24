import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { type ServerEvent } from '@/lib/event-bus'
import { createSseStream, type SseFilterResult } from '@/lib/sse-stream'
import { parseLastEventId } from '@/lib/realtime-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RUN_EVENT_TYPES = new Set([
  'run.created',
  'run.updated',
  'run.completed',
  'run.eval_attached',
])

/**
 * GET /api/v1/runs/stream — SSE stream of Agent-Run-Protocol events.
 *
 * Narrow feed: only the four `RUN_EVENT_TYPES` are delivered. Shares the SSE
 * transport with `/api/events` via `createSseStream`; the per-route surface is
 * just this type predicate plus the protocol response header. Now carries the
 * retention-gap resync sentinel (parity with `/api/events`, P1-4).
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const userWorkspaceId = auth.user.workspace_id ?? 1
  const headerLastEventId = request.headers.get('last-event-id')
  const queryLastEventId = request.nextUrl.searchParams.get('lastEventId')

  const filter = (event: ServerEvent): SseFilterResult => {
    const include = RUN_EVENT_TYPES.has(event.type)
    return include ? { include: true } : { include: false, advanceable: true }
  }

  return createSseStream({
    request,
    workspaceId: userWorkspaceId,
    lastEventId: parseLastEventId(headerLastEventId || queryLastEventId),
    filter,
    connectedData: { stream: 'runs' },
    emitResyncSentinel: true,
    responseHeaders: { 'X-Agent-Run-Protocol': '0.1.0' },
  })
}
