import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { eventBus, type ServerEvent } from '@/lib/event-bus'
import {
  formatSseFrame,
  formatSseRetryFrame,
  parseLastEventId,
  readServerEventsAfter,
  serverEventWorkspaceId,
  SSE_HEARTBEAT_MS,
  SSE_POLL_MS,
} from '@/lib/realtime-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SSE_STREAM_HIGH_WATER_MARK = 256
const RUN_EVENT_TYPES = new Set([
  'run.created',
  'run.updated',
  'run.completed',
  'run.eval_attached',
])

/**
 * GET /api/v1/runs/stream — SSE stream of Agent-Run-Protocol events.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const encoder = new TextEncoder()
  const userWorkspaceId = auth.user.workspace_id ?? 1
  const headerLastEventId = request.headers.get('last-event-id')
  const queryLastEventId = request.nextUrl.searchParams.get('lastEventId')
  let lastSentId = parseLastEventId(headerLastEventId || queryLastEventId)
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      let stopped = false
      let handler: ((event: ServerEvent) => void) | null = null
      let poll: ReturnType<typeof setInterval> | null = null
      let heartbeat: ReturnType<typeof setInterval> | null = null

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
        const typeMatches = RUN_EVENT_TYPES.has(event.type)
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
          const events = readServerEventsAfter({ afterId: lastSentId, workspaceId: userWorkspaceId })
          for (const event of events) sendEvent(event, true)
        } catch {
          // Keep live delivery available even if durable replay is temporarily unavailable.
        }
      }

      if (!safeEnqueue(formatSseRetryFrame())) return
      if (!safeEnqueue(formatSseFrame({
        type: 'connected',
        data: { stream: 'runs' },
        timestamp: Date.now(),
        workspace_id: userWorkspaceId,
      }))) return

      replayFromStore()
      if (stopped) return

      handler = (event: ServerEvent) => {
        sendEvent(event)
      }
      eventBus.on('server-event', handler)

      poll = setInterval(replayFromStore, SSE_POLL_MS)
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
      'X-Accel-Buffering': 'no',
      'X-Agent-Run-Protocol': '0.1.0',
    },
  })
}
