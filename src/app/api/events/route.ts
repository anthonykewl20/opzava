import { NextRequest , NextResponse } from 'next/server'
import { eventBus, ServerEvent } from '@/lib/event-bus'
import { requireRole } from '@/lib/auth'
import {
  formatSseFrame,
  formatSseRetryFrame,
  minRealtimeEventId,
  parseLastEventId,
  readServerEventsAfter,
  serverEventWorkspaceId,
  SSE_HEARTBEAT_MS,
  SSE_POLL_MS,
} from '@/lib/realtime-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const SSE_STREAM_HIGH_WATER_MARK = 256

/**
 * GET /api/events - Server-Sent Events stream for real-time DB mutations.
 * Clients connect via EventSource and receive JSON-encoded events.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const encoder = new TextEncoder()
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
  let lastSentId = parseLastEventId(headerLastEventId || queryLastEventId)
  const requestedLastEventId = lastSentId

  // Cleanup function, set in start(), called in cancel()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      let stopped = false
      let handler: ((event: ServerEvent) => void) | null = null
      let poll: ReturnType<typeof setInterval> | null = null
      let heartbeat: ReturnType<typeof setInterval> | null = null
      let resyncSentinelEmitted = false

      const stop = () => {
        if (stopped) return
        stopped = true
        if (handler) eventBus.off('server-event', handler)
        if (poll) clearInterval(poll)
        if (heartbeat) clearInterval(heartbeat)
      }

      const safeEnqueue = (frame: string): boolean => {
        if (stopped) return false
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          stop()
          try {
            controller.close()
          } catch {
            // stream may already be closed/cancelled
          }
          return false
        }
        try {
          controller.enqueue(encoder.encode(frame))
          return true
        } catch {
          stop()
          return false
        }
      }

      const sendEvent = (event: ServerEvent, advanceFilteredReplay = false): void => {
        if (serverEventWorkspaceId(event) !== userWorkspaceId) return
        // Chat DM ACL: only a real DM (to_agent is a string) is private — delivered to
        // its two participants (or an operator/admin). Broadcasts (to_agent null/absent)
        // are workspace-wide and pass to all viewers, parity with GET /api/chat/conversations.
        if (event.type.startsWith('chat.') && event.data && typeof event.data === 'object') {
          const { from_agent, to_agent } = event.data as { from_agent?: unknown; to_agent?: unknown }
          if (typeof to_agent === 'string'
            && viewerRole !== 'operator' && viewerRole !== 'admin'
            && viewerName !== from_agent && viewerName !== to_agent) {
            // ACL membership is stable per connection, so a replay-dropped DM can never
            // become deliverable later — advance the cursor past it so the 1s poll does
            // not re-fetch and re-test it on every tick.
            if (advanceFilteredReplay && typeof event.id === 'number') lastSentId = event.id
            return
          }
        }
        const typeMatches = typeFilters.size === 0 || typeFilters.has(event.type)
        if (typeof event.id === 'number') {
          if (event.id <= lastSentId) return
          if (!typeMatches) {
            if (advanceFilteredReplay) lastSentId = event.id
            return
          }
          lastSentId = event.id
        }
        if (!typeMatches) return
        safeEnqueue(formatSseFrame(event))
      }

      const replayFromStore = (): void => {
        if (stopped) return
        try {
          // Resync sentinel: if the client's cursor predates the earliest retained
          // event for this workspace, there is a retention gap. Emit ONE control
          // frame (no numeric id, so it never advances the durable cursor) and jump
          // the cursor to minId-1 to avoid partial-replaying across the gap.
          if (requestedLastEventId > 0 && !resyncSentinelEmitted) {
            const minId = minRealtimeEventId(userWorkspaceId)
            if (minId !== null && lastSentId < minId) {
              resyncSentinelEmitted = true
              safeEnqueue(formatSseFrame({ type: 'resync.required', data: { reason: 'retention-gap' }, timestamp: Date.now() }))
              lastSentId = minId - 1
            }
          }
          const events = readServerEventsAfter({ afterId: lastSentId, workspaceId: userWorkspaceId })
          for (const event of events) sendEvent(event, true)
        } catch {
          // Keep the live stream open; the in-process bus can still deliver events.
        }
      }

      if (!safeEnqueue(formatSseRetryFrame())) return
      if (!safeEnqueue(formatSseFrame({ type: 'connected', data: null, timestamp: Date.now() }))) return
      replayFromStore()
      if (stopped) return

      // Forward workspace-scoped server events to this SSE client
      handler = (event: ServerEvent) => {
        sendEvent(event)
      }

      eventBus.on('server-event', handler)

      // Polling closes the horizontal gap: events recorded by another process
      // sharing the same DB are delivered even if this process never saw emit().
      poll = setInterval(replayFromStore, SSE_POLL_MS)

      // Heartbeat every 15s to keep connection alive through proxies.
      heartbeat = setInterval(() => {
        safeEnqueue(': heartbeat\n\n')
      }, SSE_HEARTBEAT_MS)

      cleanup = stop
    },

    cancel() {
      if (cleanup) {
        cleanup()
        cleanup = null
      }
    },
  }, { highWaterMark: SSE_STREAM_HIGH_WATER_MARK })

  // Defense-in-depth: if the request is aborted (proxy timeout, network drop)
  // ensure we clean up the event listener even if cancel() doesn't fire.
  request.signal.addEventListener('abort', () => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  }, { once: true })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
