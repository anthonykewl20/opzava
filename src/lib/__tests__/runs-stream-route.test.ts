import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ServerEvent } from '../event-bus'

const routeState = vi.hoisted(() => ({
  handler: null as ((event: ServerEvent) => void) | null,
  readServerEventsAfter: vi.fn(),
  eventBus: {
    on: vi.fn((_event: string, handler: (event: ServerEvent) => void) => {
      routeState.handler = handler
    }),
    off: vi.fn((_event: string, handler: (event: ServerEvent) => void) => {
      if (routeState.handler === handler) routeState.handler = null
    }),
  },
  requireRole: vi.fn(() => ({
    user: {
      id: 1,
      username: 'operator',
      role: 'admin',
      workspace_id: 1,
    },
  })),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: routeState.requireRole,
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: routeState.eventBus,
}))

vi.mock('@/lib/realtime-events', async () => {
  const actual = await vi.importActual<typeof import('../realtime-events')>('../realtime-events')
  return {
    ...actual,
    readServerEventsAfter: routeState.readServerEventsAfter,
  }
})

async function readChunks(response: Response, count: number): Promise<{ text: string; cancel: () => Promise<void> }> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('missing response body')

  const decoder = new TextDecoder()
  let text = ''
  for (let index = 0; index < count; index += 1) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }

  return {
    text,
    cancel: async () => {
      await reader.cancel()
    },
  }
}

describe('GET /api/v1/runs/stream', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    routeState.handler = null
    routeState.readServerEventsAfter.mockReturnValue([])
  })

  it('replays only stored run events for the caller workspace', async () => {
    routeState.readServerEventsAfter.mockReturnValue([
      { id: 11, type: 'run.created', data: { id: 'run-1', workspace_id: '1' }, timestamp: 100, workspace_id: 1 },
      { id: 12, type: 'task.created', data: { id: 2, workspace_id: 1 }, timestamp: 101, workspace_id: 1 },
      { id: 13, type: 'run.updated', data: { id: 'run-2', workspace_id: '2' }, timestamp: 102, workspace_id: 2 },
      { id: 14, type: 'run.completed', data: { id: 'run-3', workspace_id: '1' }, timestamp: 103, workspace_id: 1 },
    ])

    const { GET } = await import('../../app/api/v1/runs/stream/route')
    const response = await GET(new NextRequest('http://localhost/api/v1/runs/stream', {
      headers: { 'last-event-id': '10' },
    }))
    const stream = await readChunks(response, 4)

    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('x-agent-run-protocol')).toBe('0.1.0')
    expect(routeState.readServerEventsAfter).toHaveBeenCalledWith({ afterId: 10, workspaceId: 1 })
    const retryMatch = /^retry: (\d+)\n/m.exec(stream.text)
    expect(retryMatch).not.toBeNull()
    const retryMs = Number(retryMatch![1])
    expect(retryMs).toBeGreaterThanOrEqual(5000)
    expect(retryMs).toBeLessThan(7000)
    expect(stream.text).toContain('"stream":"runs"')
    expect(stream.text).toContain('id: 11')
    expect(stream.text).toContain('id: 14')
    expect(stream.text).not.toContain('task.created')
    expect(stream.text).not.toContain('run-2')

    await stream.cancel()
    expect(routeState.eventBus.off).toHaveBeenCalled()
    expect(routeState.handler).toBeNull()
  })

  it('delivers live run events once and drops unresolved or mismatched workspace events', async () => {
    const { GET } = await import('../../app/api/v1/runs/stream/route')
    const response = await GET(new NextRequest('http://localhost/api/v1/runs/stream'))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('missing response body')

    await reader.read()
    await reader.read()

    routeState.handler?.({ id: 3, type: 'run.created', data: { id: 'run-1', workspace_id: '1' }, timestamp: 100, workspace_id: 1 })
    routeState.handler?.({ id: 3, type: 'run.created', data: { id: 'run-1', workspace_id: '1' }, timestamp: 100, workspace_id: 1 })
    routeState.handler?.({ id: 4, type: 'run.updated', data: { id: 'run-2', workspace_id: '2' }, timestamp: 101, workspace_id: 2 })
    routeState.handler?.({ id: 5, type: 'task.created', data: { id: 1, workspace_id: 1 }, timestamp: 102, workspace_id: 1 })
    routeState.handler?.({ id: 6, type: 'run.completed', data: { id: 'run-3' }, timestamp: 103, workspace_id: null })

    const decoder = new TextDecoder()
    const { value } = await reader.read()
    const text = decoder.decode(value)

    expect(text).toContain('id: 3')
    expect(text).toContain('run-1')
    expect(text).not.toContain('run-2')
    expect(text).not.toContain('task.created')
    expect(text).not.toContain('run-3')

    await reader.cancel()
    expect(routeState.handler).toBeNull()
  })

  it('does not advance the replay cursor for dropped live non-run events', async () => {
    vi.useFakeTimers()
    try {
      const { GET } = await import('../../app/api/v1/runs/stream/route')
      const response = await GET(new NextRequest('http://localhost/api/v1/runs/stream'))
      const reader = response.body?.getReader()
      if (!reader) throw new Error('missing response body')

      await reader.read()
      await reader.read()
      routeState.readServerEventsAfter.mockClear()

      routeState.handler?.({
        id: 50,
        type: 'task.created',
        data: { id: 2, workspace_id: 1 },
        timestamp: 100,
        workspace_id: 1,
      })
      await vi.advanceTimersByTimeAsync(1_000)

      expect(routeState.readServerEventsAfter).toHaveBeenLastCalledWith({ afterId: 0, workspaceId: 1 })

      await reader.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes slow streams instead of buffering run events without bound', async () => {
    const { GET } = await import('../../app/api/v1/runs/stream/route')
    await GET(new NextRequest('http://localhost/api/v1/runs/stream'))

    for (let index = 1; index <= 300; index += 1) {
      routeState.handler?.({
        id: index,
        type: 'run.updated',
        data: { id: `run-${index}`, workspace_id: '1' },
        timestamp: index,
        workspace_id: 1,
      })
    }

    expect(routeState.eventBus.off).toHaveBeenCalled()
    expect(routeState.handler).toBeNull()
  })
})
