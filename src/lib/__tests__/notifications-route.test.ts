import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const routeState = vi.hoisted(() => ({
  broadcasts: [] as Array<{ type: string; data: any }>,
  requireRole: vi.fn(() => ({
    user: {
      id: 1,
      username: 'operator',
      role: 'admin',
      workspace_id: 1,
    },
  })),
  prepare: vi.fn((sql: string) => {
    if (sql.includes('SELECT id FROM notifications') && sql.includes('WHERE id IN')) {
      return {
        all: (...args: any[]) => args.slice(0, -1).filter((id) => id === 10).map((id) => ({ id })),
      }
    }
    if (sql.includes('UPDATE notifications')) {
      return {
        run: vi.fn(() => ({ changes: 1 })),
      }
    }
    return {
      all: vi.fn(() => []),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
    }
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: routeState.requireRole,
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: routeState.prepare,
  }),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: {
    broadcast: (type: string, data: any) => {
      routeState.broadcasts.push({ type, data })
    },
  },
}))

describe('PUT /api/notifications realtime broadcasts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    routeState.broadcasts.length = 0
  })

  it('broadcasts notification.read only for notifications changed from unread', async () => {
    const { PUT } = await import('../../app/api/notifications/route')
    const request = new NextRequest('http://localhost/api/notifications', {
      method: 'PUT',
      body: JSON.stringify({ ids: [10, 11] }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PUT(request)

    expect(response.status).toBe(200)
    expect(routeState.broadcasts).toEqual([
      {
        type: 'notification.read',
        data: { id: 10, read_at: expect.any(Number), workspace_id: 1 },
      },
    ])
  })
})
