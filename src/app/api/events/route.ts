import { NextRequest, NextResponse } from 'next/server'
import { type ServerEvent } from '@/lib/event-bus'
import { requireRole } from '@/lib/auth'
import { createSseStream, type SseFilterResult } from '@/lib/sse-stream'
import { parseLastEventId } from '@/lib/realtime-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/events - Server-Sent Events stream for real-time DB mutations.
 * Clients connect via EventSource and receive JSON-encoded events.
 *
 * The main multiplexed workspace feed. Shares the SSE transport with
 * `/api/v1/runs/stream` via `createSseStream`; the per-route surface kept here
 * is the chat DM ACL and the `?types=` server-side filter. Both invariants are
 * load-bearing privacy/correctness gates — see MODULE.md.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const userWorkspaceId = auth.user.workspace_id ?? 1
  const viewerName = auth.user.display_name || auth.user.username
  const viewerRole = auth.user.role
  const headerLastEventId = request.headers.get('last-event-id')
  const queryLastEventId = request.nextUrl.searchParams.get('lastEventId')
  const typeFilters = new Set(
    request.nextUrl.searchParams
      .getAll('types')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  )

  const filter = (event: ServerEvent): SseFilterResult => {
    // Chat DM ACL: only a real DM (to_agent is a string) is private — delivered to
    // its two participants (or an operator/admin). Broadcasts (to_agent null/absent)
    // are workspace-wide and pass to all viewers, parity with GET /api/chat/conversations.
    // Identity contract: a participant is identified by display_name OR username,
    // compared case-insensitively so a recipient whose stored name differs in casing
    // (or username-vs-display_name) is not dropped.
    if (event.type.startsWith('chat.') && event.data && typeof event.data === 'object') {
      const { from_agent, to_agent } = event.data as { from_agent?: unknown; to_agent?: unknown }
      if (typeof to_agent === 'string'
        && viewerRole !== 'operator' && viewerRole !== 'admin') {
        const viewer = viewerName.toLowerCase()
        const isParticipant =
          (typeof from_agent === 'string' && viewer === from_agent.toLowerCase()) ||
          viewer === to_agent.toLowerCase()
        if (!isParticipant) {
          // ACL membership is stable per connection, so a replay-dropped DM can never
          // become deliverable later — advance the cursor past it so the 1s poll does
          // not re-fetch and re-test it on every tick.
          return { include: false, advanceable: true }
        }
      }
    }
    const typeMatches = typeFilters.size === 0 || typeFilters.has(event.type)
    return typeMatches ? { include: true } : { include: false, advanceable: true }
  }

  return createSseStream({
    request,
    workspaceId: userWorkspaceId,
    lastEventId: parseLastEventId(headerLastEventId || queryLastEventId),
    filter,
    connectedData: null,
    emitResyncSentinel: true,
  })
}
