import type { NextRequest } from 'next/server'
import { eventBus, type ServerEvent } from './event-bus'
import {
  formatSseFrame,
  formatSseRetryFrame,
  minRealtimeEventId,
  readServerEventsAfter,
  serverEventWorkspaceId,
  SSE_HEARTBEAT_MS,
  SSE_POLL_MS,
} from './realtime-events'
import { trackActiveConnection, recordDeliveryLatency } from './realtime-metrics'

/**
 * Shared Server-Sent Events transport for the two realtime fanout endpoints
 * (`/api/events` and `/api/v1/runs/stream`). Owns the transport skeleton that
 * both routes previously duplicated (~100 lines): stream lifecycle, backpressure
 * teardown, retry/connected frames, heartbeat, the cross-process outbox poll,
 * strict-monotonic cursor discipline (the idempotency primitive), and the
 * retention-gap resync sentinel.
 *
 * Per-route concerns stay per-route via the `filter` predicate (type match +
 * chat DM ACL) and `connectedData`/`responseHeaders`. The workspace
 * authorization boundary is enforced here (identical for both routes) BEFORE
 * `filter`, so it can never be regressed by a route-specific predicate.
 *
 * @see src/app/api/events/MODULE.md — realtime-sse-transport invariants.
 */

const SSE_STREAM_HIGH_WATER_MARK = 256

/**
 * Result of a per-route acceptance predicate.
 * - `{ include: true }` — deliver the event (subject to the shared workspace
 *   gate and cursor discipline).
 * - `{ include: false, advanceable }` — drop the event. When `advanceable` is
 *   true and the event has a numeric id, the shared cursor advances past it
 *   during replay so the filtered type is never re-replayed on the next poll.
 */
export type SseFilterResult =
  | { include: true }
  | { include: false; advanceable: boolean }

export interface SseFilter {
  /**
   * Per-route predicate invoked AFTER the shared workspace gate, for events
   * that have already passed `event.id > lastSentId` (during replay) or are
   * otherwise candidate deliveries. Routes implement ONLY their distinct
   * behavior here: `/api/events` applies the chat DM ACL + `?types=`; the runs
   * feed applies its hardcoded `RUN_EVENT_TYPES`.
   */
  (event: ServerEvent): SseFilterResult
}

export interface CreateSseStreamOptions {
  /** Inbound request — used only to wire the abort signal for defense-in-depth teardown. */
  request: NextRequest
  /** Workspace authorization boundary (auth.user.workspace_id ?? 1). */
  workspaceId: number
  /** Parsed resume cursor (Last-Event-ID / ?lastEventId), 0 when absent. */
  lastEventId: number
  /** Per-route acceptance predicate (type filter + chat ACL). */
  filter: SseFilter
  /** Payload of the cursor-pure `connected` ack frame. */
  connectedData: unknown
  /** Emit the retention-gap resync sentinel (both routes). */
  emitResyncSentinel: boolean
  /** Extra response headers (e.g. X-Agent-Run-Protocol for the runs feed). */
  responseHeaders?: Record<string, string>
}

/**
 * Build the `text/event-stream` response. Returns immediately; the stream runs
 * lazily under the response. Idempotent teardown: `stop()` (latched) fires from
 * backpressure, `cancel()`, OR the request `abort` signal — any and all of them
 * converge on a single listener/timer release.
 */
export function createSseStream(options: CreateSseStreamOptions): Response {
  const { request, workspaceId, filter, connectedData, emitResyncSentinel } = options
  const encoder = new TextEncoder()
  // The durable cursor. Only ever moves forward. The initial value is the
  // client's resume point; the resync sentinel may jump it past a retention gap
  // before the first replay. `requestedLastEventId` is the pre-jump snapshot
  // used only to gate the one-shot sentinel.
  let lastSentId = options.lastEventId
  const requestedLastEventId = options.lastEventId

  let cleanup: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false
      let handler: ((event: ServerEvent) => void) | null = null
      let poll: ReturnType<typeof setInterval> | null = null
      let heartbeat: ReturnType<typeof setInterval> | null = null
      const releaseConnection = trackActiveConnection()
      let resyncSentinelEmitted = false

      const stop = () => {
        if (stopped) return
        stopped = true
        if (handler) eventBus.off('server-event', handler)
        if (poll) clearInterval(poll)
        if (heartbeat) clearInterval(heartbeat)
        releaseConnection()
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
        if (serverEventWorkspaceId(event) !== workspaceId) return
        const result = filter(event)
        if (typeof event.id === 'number') {
          if (event.id <= lastSentId) return
          if (!result.include) {
            if (advanceFilteredReplay && result.advanceable) lastSentId = event.id
            return
          }
          lastSentId = event.id
        }
        if (!result.include) return
        recordDeliveryLatency(Date.now() - event.timestamp)
        safeEnqueue(formatSseFrame(event))
      }

      const replayFromStore = (): void => {
        if (stopped) return
        try {
          // Resync sentinel: if the client's cursor predates the earliest
          // retained event for this workspace, there is a retention gap. Emit
          // ONE control frame (no numeric id, so it never advances the durable
          // cursor) and jump the cursor to minId-1 to avoid partial-replaying
          // across the gap.
          if (emitResyncSentinel && requestedLastEventId > 0 && !resyncSentinelEmitted) {
            const minId = minRealtimeEventId(workspaceId)
            if (minId !== null && lastSentId < minId) {
              resyncSentinelEmitted = true
              safeEnqueue(formatSseFrame({ type: 'resync.required', data: { reason: 'retention-gap' }, timestamp: Date.now() }))
              lastSentId = minId - 1
            }
          }
          const events = readServerEventsAfter({ afterId: lastSentId, workspaceId })
          for (const event of events) sendEvent(event, true)
        } catch {
          // Keep the live stream open; the in-process bus can still deliver events.
        }
      }

      if (!safeEnqueue(formatSseRetryFrame())) return
      if (!safeEnqueue(formatSseFrame({ type: 'connected', data: connectedData, timestamp: Date.now() }))) return

      replayFromStore()
      if (stopped) return

      // Forward workspace-scoped server events to this SSE client.
      handler = (event: ServerEvent) => {
        sendEvent(event)
      }
      eventBus.on('server-event', handler)

      // Polling closes the horizontal gap: events recorded by another process
      // sharing the same DB are delivered even if this process never saw emit().
      poll = setInterval(replayFromStore, SSE_POLL_MS)

      // Heartbeat to keep the connection alive through proxies.
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
      'X-Accel-Buffering': 'no',
      ...options.responseHeaders,
    },
  })
}
