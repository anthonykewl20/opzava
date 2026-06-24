import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const routeState = vi.hoisted(() => ({
  auth: { user: { id: 1, username: 'admin', role: 'admin' } },
  metrics: {
    activeConnections: 3,
    outboxDepth: 12,
    publishToDeliveryLatencyMs: 80,
    listenerCount: 5,
  },
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => routeState.auth),
}))

vi.mock('@/lib/realtime-metrics', () => ({
  getChatMetrics: () => routeState.metrics,
}))

import { GET } from './route'

function req() {
  return new NextRequest('http://localhost/api/ops/chat-metrics')
}

describe('GET /api/ops/chat-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.auth = { user: { id: 1, username: 'admin', role: 'admin' } }
  })

  it('returns the four realtime counters as JSON', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      activeConnections: 3,
      outboxDepth: 12,
      publishToDeliveryLatencyMs: 80,
      listenerCount: 5,
    })
  })

  it('rejects non-admin callers with requireRole', async () => {
    const { requireRole } = await import('@/lib/auth')
    vi.mocked(requireRole).mockReturnValueOnce({
      error: 'Requires admin role or higher',
      status: 403,
    })

    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Requires admin role or higher')
  })
})
