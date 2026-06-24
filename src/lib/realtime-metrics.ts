import { getDatabase } from './db'
import { eventBus } from './event-bus'

/**
 * Lightweight process-global counters for the realtime/SSE subsystem.
 * Best-effort, no-SLA: surfaced via GET /api/ops/chat-metrics for operators.
 *
 * HMR-safe singleton, mirroring the eventBus pattern in event-bus.ts: the
 * counter state lives on globalThis so a dev-mode module reload does not
 * reset active-connection accounting mid-stream.
 *
 * Horizontal scale note: these counters are per-process. Under multi-instance
 * deploys the reported values describe THIS server only — an operator querying
 * any one instance sees that instance's load, which is the intended
 * diagnostic granularity for a best-effort gauge.
 */
interface RealtimeMetricsState {
  activeConnections: number
  latencySamples: number[]
  latencySum: number
}

const LATENCY_SAMPLE_CAP = 128

function createState(): RealtimeMetricsState {
  return { activeConnections: 0, latencySamples: [], latencySum: 0 }
}

const globalMetrics = globalThis as typeof globalThis & {
  __realtimeMetrics?: RealtimeMetricsState
}

const state: RealtimeMetricsState = globalMetrics.__realtimeMetrics ?? createState()
globalMetrics.__realtimeMetrics = state

/**
 * Register an active SSE connection. Returns an idempotent stop function that
 * decrements the counter at most once, so defensive double-cleanup in
 * stream stop()/cancel()/abort handlers can never drive the count negative.
 */
export function trackActiveConnection(): () => void {
  let closed = false
  state.activeConnections += 1
  return () => {
    if (closed) return
    closed = true
    state.activeConnections = Math.max(0, state.activeConnections - 1)
  }
}

/**
 * Sample the wall-clock latency between a published event's timestamp and its
 * delivery to an SSE client. A rolling capped window keeps the cost bounded
 * on a hot path.
 */
export function recordDeliveryLatency(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return
  state.latencySamples.push(ms)
  state.latencySum += ms
  if (state.latencySamples.length > LATENCY_SAMPLE_CAP) {
    const evicted = state.latencySamples.shift() as number
    state.latencySum -= evicted
  }
}

export interface ChatMetricsSnapshot {
  activeConnections: number
  outboxDepth: number
  publishToDeliveryLatencyMs: number
  listenerCount: number
}

/**
 * Read the current gauge values. outboxDepth and listenerCount are read live
 * (DB COUNT and eventBus.listenerCount) on each call; the latency reading is
 * the rolling mean of recently sampled deliveries.
 */
export function getChatMetrics(): ChatMetricsSnapshot {
  return {
    activeConnections: state.activeConnections,
    outboxDepth: readOutboxDepth(),
    publishToDeliveryLatencyMs: state.latencySamples.length === 0
      ? 0
      : Math.round(state.latencySum / state.latencySamples.length),
    listenerCount: eventBus.listenerCount('server-event'),
  }
}

function readOutboxDepth(): number {
  try {
    const row = getDatabase()
      .prepare('SELECT COUNT(*) as count FROM realtime_events')
      .get() as { count?: number } | undefined
    return typeof row?.count === 'number' ? row.count : 0
  } catch {
    // DB not ready / transient error — best-effort gauge reports 0.
    return 0
  }
}
