import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbState = vi.hoisted(() => ({ count: 0 }))
const listenerState = vi.hoisted(() => ({ count: 0 }))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: () => ({
      get: () => ({ count: dbState.count }),
    }),
  }),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: {
    listenerCount: () => listenerState.count,
  },
}))

// Drop the HMR singleton between tests so each starts from a clean counter set.
async function freshMetrics() {
  delete (globalThis as Record<string, unknown>).__realtimeMetrics
  vi.resetModules()
  return await import('../realtime-metrics')
}

describe('realtime-metrics counters', () => {
  beforeEach(() => {
    dbState.count = 0
    listenerState.count = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the four required gauge keys with numeric values', async () => {
    const m = await freshMetrics()
    const snapshot = m.getChatMetrics()
    expect(snapshot).toHaveProperty('activeConnections')
    expect(snapshot).toHaveProperty('outboxDepth')
    expect(snapshot).toHaveProperty('publishToDeliveryLatencyMs')
    expect(snapshot).toHaveProperty('listenerCount')
    for (const value of Object.values(snapshot)) {
      expect(typeof value).toBe('number')
    }
  })

  it('increments and decrements activeConnections via start/stop, idempotently', async () => {
    const m = await freshMetrics()
    expect(m.getChatMetrics().activeConnections).toBe(0)

    const stop1 = m.trackActiveConnection()
    const stop2 = m.trackActiveConnection()
    expect(m.getChatMetrics().activeConnections).toBe(2)

    // Stopping twice (defensive cleanup) must not drive the count negative.
    stop1()
    stop1()
    stop2()
    expect(m.getChatMetrics().activeConnections).toBe(0)
  })

  it('reads outboxDepth from SELECT COUNT(*) on realtime_events', async () => {
    const m = await freshMetrics()
    dbState.count = 42
    expect(m.getChatMetrics().outboxDepth).toBe(42)
  })

  it('reports listenerCount from the eventBus', async () => {
    const m = await freshMetrics()
    listenerState.count = 7
    expect(m.getChatMetrics().listenerCount).toBe(7)
  })

  it('records publishToDeliveryLatencyMs as a rolling sample of latency', async () => {
    const m = await freshMetrics()
    expect(m.getChatMetrics().publishToDeliveryLatencyMs).toBe(0)

    m.recordDeliveryLatency(50)
    m.recordDeliveryLatency(150)
    const sample = m.getChatMetrics().publishToDeliveryLatencyMs
    // Rolling sample is bounded by observed latencies.
    expect(sample).toBeGreaterThanOrEqual(50)
    expect(sample).toBeLessThanOrEqual(150)
  })
})
