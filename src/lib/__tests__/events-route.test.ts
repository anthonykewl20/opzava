import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ServerEvent } from '../event-bus'

const routeState = vi.hoisted(() => ({
  handler: null as ((event: ServerEvent) => void) | null,
  readServerEventsAfter: vi.fn(),
  minRealtimeEventId: vi.fn((): number | null => null),
  currentUser: {
    id: 1,
    username: 'operator',
    display_name: 'Operator',
    role: 'admin',
    workspace_id: 1,
  },
  eventBus: {
    on: vi.fn((_event: string, handler: (event: ServerEvent) => void) => {
      routeState.handler = handler
    }),
    off: vi.fn((_event: string, handler: (event: ServerEvent) => void) => {
      if (routeState.handler === handler) routeState.handler = null
    }),
  },
  requireRole: vi.fn(() => ({
    user: routeState.currentUser,
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
    minRealtimeEventId: routeState.minRealtimeEventId,
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

describe('GET /api/events', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    routeState.handler = null
    routeState.currentUser = {
      id: 1,
      username: 'operator',
      display_name: 'Operator',
      role: 'admin',
      workspace_id: 1,
    }
    routeState.readServerEventsAfter.mockReturnValue([])
    routeState.minRealtimeEventId.mockReturnValue(null)
  })

  it('replays stored events after Last-Event-ID and filters by requested type/workspace', async () => {
    routeState.readServerEventsAfter.mockReturnValue([
      { id: 11, type: 'task.created', data: { id: 1, workspace_id: 1 }, timestamp: 100, workspace_id: 1 },
      { id: 12, type: 'agent.created', data: { id: 2, workspace_id: 1 }, timestamp: 101, workspace_id: 1 },
      { id: 13, type: 'task.created', data: { id: 3, workspace_id: 2 }, timestamp: 102, workspace_id: 2 },
    ])

    const { GET } = await import('../../app/api/events/route')
    const response = await GET(new NextRequest('http://localhost/api/events?types=task.created', {
      headers: { 'last-event-id': '10' },
    }))
    const stream = await readChunks(response, 3)

    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(routeState.readServerEventsAfter).toHaveBeenCalledWith({ afterId: 10, workspaceId: 1 })
    const retryMatch = /^retry: (\d+)\n/m.exec(stream.text)
    expect(retryMatch).not.toBeNull()
    const retryMs = Number(retryMatch![1])
    expect(retryMs).toBeGreaterThanOrEqual(5000)
    expect(retryMs).toBeLessThan(7000)
    expect(stream.text).toContain('"type":"connected"')
    expect(stream.text).toContain('id: 11')
    expect(stream.text).toContain('"type":"task.created"')
    expect(stream.text).not.toContain('agent.created')
    expect(stream.text).not.toContain('"id":3')

    await stream.cancel()
    expect(routeState.eventBus.off).toHaveBeenCalled()
    expect(routeState.handler).toBeNull()
  })

  it('delivers live events once and ignores duplicate replay ids', async () => {
    routeState.readServerEventsAfter.mockReturnValue([])

    const { GET } = await import('../../app/api/events/route')
    const response = await GET(new NextRequest('http://localhost/api/events'))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('missing response body')

    await reader.read()
    await reader.read()

    routeState.handler?.({ id: 3, type: 'task.created', data: { id: 9, workspace_id: 1 }, timestamp: 100, workspace_id: 1 })
    routeState.handler?.({ id: 3, type: 'task.created', data: { id: 9, workspace_id: 1 }, timestamp: 100, workspace_id: 1 })
    routeState.handler?.({ id: 4, type: 'task.created', data: { id: 10, workspace_id: 2 }, timestamp: 101, workspace_id: 2 })
    routeState.handler?.({ id: 5, type: 'task.created', data: { id: 11 }, timestamp: 102, workspace_id: null })

    const decoder = new TextDecoder()
    const { value } = await reader.read()
    const text = decoder.decode(value)

    expect(text).toContain('id: 3')
    expect(text).toContain('"id":9')
    expect(text).not.toContain('"id":11')

    await reader.cancel()
    expect(routeState.handler).toBeNull()
  })

  it('does not advance the replay cursor for dropped live type-filtered events', async () => {
    vi.useFakeTimers()
    try {
      const { GET } = await import('../../app/api/events/route')
      const response = await GET(new NextRequest('http://localhost/api/events?types=task.created'))
      const reader = response.body?.getReader()
      if (!reader) throw new Error('missing response body')

      await reader.read()
      await reader.read()
      routeState.readServerEventsAfter.mockClear()

      routeState.handler?.({
        id: 50,
        type: 'agent.created',
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

  it('closes slow streams instead of buffering live events without bound', async () => {
    routeState.readServerEventsAfter.mockReturnValue([])

    const { GET } = await import('../../app/api/events/route')
    await GET(new NextRequest('http://localhost/api/events'))

    for (let index = 1; index <= 300; index += 1) {
      routeState.handler?.({
        id: index,
        type: 'activity.created',
        data: { id: index, workspace_id: 1 },
        timestamp: index,
        workspace_id: 1,
      })
    }

    expect(routeState.eventBus.off).toHaveBeenCalled()
    expect(routeState.handler).toBeNull()
  })

  it('drops chat.message DM events for a non-participating viewer but delivers to participants and operators', async () => {
    async function deliverFor(viewer: typeof routeState.currentUser, events: ServerEvent[]): Promise<string> {
      routeState.currentUser = viewer
      vi.resetModules()
      const { GET } = await import('../../app/api/events/route')
      const response = await GET(new NextRequest('http://localhost/api/events'))
      const reader = response.body?.getReader()
      if (!reader) throw new Error('missing response body')
      await reader.read()
      await reader.read()
      for (const event of events) routeState.handler?.(event)
      // Drain any chunk produced by the handler; tolerate none (dropped event).
      const decoder = new TextDecoder()
      let text = ''
      const drained = await Promise.race([
        reader.read().then((result) => {
          if (!result.done && result.value) text = decoder.decode(result.value)
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 50)),
      ])
      void drained
      await reader.cancel()
      return text
    }

    const outsiderDm: ServerEvent = {
      id: 100,
      type: 'chat.message',
      data: { id: 'm1', workspace_id: 1, from_agent: 'alice', to_agent: 'bob', text: 'secret' },
      timestamp: 1,
      workspace_id: 1,
    }

    // non-participating viewer (role: viewer) sees nothing
    const eavesdropper = await deliverFor(
      { id: 9, username: 'carol', display_name: 'Carol', role: 'viewer', workspace_id: 1 },
      [outsiderDm],
    )
    expect(eavesdropper).not.toContain('"from_agent":"alice"')
    expect(eavesdropper).not.toContain('"type":"chat.message"')

    // participant (to_agent) sees the DM
    const participant = await deliverFor(
      { id: 2, username: 'bob', display_name: 'bob', role: 'viewer', workspace_id: 1 },
      [outsiderDm],
    )
    expect(participant).toContain('"type":"chat.message"')
    expect(participant).toContain('"from_agent":"alice"')

    // operator sees the DM (role escalation)
    const operator = await deliverFor(
      { id: 3, username: 'ops', display_name: 'Ops', role: 'operator', workspace_id: 1 },
      [outsiderDm],
    )
    expect(operator).toContain('"type":"chat.message"')
  })

  it('emits a resync.required control frame when lastEventId predates the retention min id', async () => {
    // Client last saw id=5, but the workspace's earliest retained event is id=10.
    routeState.minRealtimeEventId.mockReturnValue(10)
    routeState.readServerEventsAfter.mockReturnValue([
      { id: 11, type: 'task.created', data: { id: 1, workspace_id: 1 }, timestamp: 100, workspace_id: 1 },
    ])

    const { GET } = await import('../../app/api/events/route')
    const response = await GET(new NextRequest('http://localhost/api/events', {
      headers: { 'last-event-id': '5' },
    }))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('missing response body')
    const decoder = new TextDecoder()
    // retry, connected, resync.required, then the replayed task.created
    let text = ''
    for (let index = 0; index < 4; index += 1) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    await reader.cancel()

    expect(text).toContain('"type":"resync.required"')
    expect(text).toContain('"reason":"retention-gap"')
    // Control frame carries no numeric id (does not advance the durable cursor)
    expect(text).not.toMatch(/id: \d+\ndata: \{"type":"resync.required"/)
    // Cursor jumped past the gap: replay requested from minId-1, not lastEventId=5
    expect(routeState.readServerEventsAfter).toHaveBeenCalledWith({ afterId: 9, workspaceId: 1 })
    // The replayed event after the gap still arrives
    expect(text).toContain('id: 11')
  })

  it('does not emit resync.required when the client cursor is current', async () => {
    routeState.minRealtimeEventId.mockReturnValue(10)
    routeState.readServerEventsAfter.mockReturnValue([
      { id: 12, type: 'task.created', data: { id: 1, workspace_id: 1 }, timestamp: 100, workspace_id: 1 },
    ])

    const { GET } = await import('../../app/api/events/route')
    const response = await GET(new NextRequest('http://localhost/api/events', {
      headers: { 'last-event-id': '11' },
    }))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('missing response body')
    const decoder = new TextDecoder()
    let text = ''
    for (let index = 0; index < 3; index += 1) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    await reader.cancel()

    expect(text).not.toContain('"type":"resync.required"')
    expect(routeState.readServerEventsAfter).toHaveBeenCalledWith({ afterId: 11, workspaceId: 1 })
  })

  it('queries the workspace min id at most once per connection (sentinel fires once)', async () => {
    routeState.minRealtimeEventId.mockReturnValue(10)
    routeState.readServerEventsAfter.mockReturnValue([])

    const { GET } = await import('../../app/api/events/route')
    const response = await GET(new NextRequest('http://localhost/api/events', {
      headers: { 'last-event-id': '9' },
    }))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('missing response body')

    const decoder = new TextDecoder()
    let text = ''
    // Initial replay runs synchronously inside start(); drain the frames it emits,
    // racing each read against a 30ms real timeout (the empty replay yields no chunk).
    for (let index = 0; index < 3; index += 1) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true }>((resolve) => setTimeout(() => resolve({ done: true }), 30)),
      ])
      if ((result as { done: true }).done) break
      const chunk = result as { value?: Uint8Array }
      if (chunk.value) text += decoder.decode(chunk.value, { stream: true })
    }
    await reader.cancel()

    expect(text).toContain('"type":"resync.required"')
    // The boolean guard short-circuits the sentinel: across the initial replay the
    // min-id query fires exactly once, and is never re-queried on later polls.
    expect(routeState.minRealtimeEventId).toHaveBeenCalledTimes(1)
  })
})
