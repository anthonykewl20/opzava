import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useServerEvents, useResyncRefetch } from '@/lib/use-server-events'
import { useMissionControl } from '@/store'

/**
 * Minimal EventSource stub. The hook only depends on `onmessage`/`onopen`/
 * `onerror` handlers and `close()`. We expose a way for the test to fire
 * synthetic SSE messages.
 */
interface FakeEventSource {
  url: string
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  close: () => void
}

let current: FakeEventSource | null = null
const instances: FakeEventSource[] = []

class MockEventSource {
  url: string
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  close = vi.fn(() => {})
  constructor(url: string) {
    this.url = url
    current = this
    instances.push(this)
  }
}

function sendMessage(payload: unknown, lastEventId?: string) {
  const es = current
  if (!es || !es.onmessage) throw new Error('no active EventSource')
  const ev = {
    data: JSON.stringify(payload),
    lastEventId: lastEventId ?? '',
  } as MessageEvent
  act(() => {
    es.onmessage!(ev)
  })
}

describe('useServerEvents', () => {
  beforeEach(() => {
    current = null
    instances.length = 0
    // Reset the store to a clean baseline before each test.
    const store = useMissionControl.getState()
    useMissionControl.setState({
      tasks: [],
      agents: [],
      notifications: [],
      unreadNotificationCount: 0,
      activities: [],
      chatMessages: [],
      connection: { isConnected: false, url: '', reconnectAttempts: 0 },
    })
    // Re-bind the original actions (setState above preserved them via merge, but
    // ensure resyncNeeded flag is unset).
    store.setConnection({ resyncNeeded: undefined } as any)
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    current = null
    instances.length = 0
  })

  it('handles a resync.required control frame by setting the connection resyncNeeded flag', () => {
    renderHook(() => useServerEvents())

    // Sanity: flag unset before the frame.
    expect(useMissionControl.getState().connection.resyncNeeded).toBeFalsy()

    sendMessage({
      type: 'resync.required',
      data: { reason: 'retention-gap' },
      timestamp: Date.now(),
    })

    expect(useMissionControl.getState().connection.resyncNeeded).toBe(true)
  })

  it('does not crash and still dispatches subsequent events after a resync.required frame', () => {
    renderHook(() => useServerEvents())

    sendMessage({
      type: 'resync.required',
      data: { reason: 'retention-gap' },
      timestamp: Date.now(),
    })

    // A normal id-bearing event after the control frame still lands.
    sendMessage(
      { type: 'task.created', data: { id: 42, title: 't' }, timestamp: Date.now() },
      '42',
    )
    expect(useMissionControl.getState().tasks.some((t) => t.id === 42)).toBe(true)
  })

  it('dispatches an id-less volatile event instead of dropping it via the dedup set', () => {
    renderHook(() => useServerEvents())

    // Prime the dedup Set with a numeric id (e.g. a prior durable event's id).
    sendMessage(
      { id: 7, type: 'task.created', data: { id: 7, title: 'first' }, timestamp: Date.now() },
      '7',
    )

    // An id-less volatile event whose `lastEventId` (the prior durable frame's
    // id '7') would, under the buggy fallback, collide with the Set entry and
    // be mis-dropped. After the fix it must reach dispatch and insert the task.
    sendMessage(
      { type: 'task.created', data: { id: 5, title: 'volatile' }, timestamp: Date.now() },
      '7', // browser surfaces the prior frame's id here
    )

    const task = useMissionControl.getState().tasks.find((t) => t.id === 5)
    expect(task).toBeDefined()
    expect(task?.title).toBe('volatile')
  })

  it('useResyncRefetch fires the refetch callback when resyncNeeded flips true, then clears the flag', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useResyncRefetch(refetch))

    // No refetch while the flag is unset.
    expect(refetch).not.toHaveBeenCalled()
    expect(useMissionControl.getState().connection.resyncNeeded).toBeFalsy()

    // Flip the flag exactly as the SSE producer does (via setConnection). This
    // isolates the consumer contract from the SSE hook's internal dispatch.
    await act(async () => {
      useMissionControl.getState().setConnection({ resyncNeeded: true })
    })

    // The resync effect must run the refetch exactly once and clear the flag.
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(useMissionControl.getState().connection.resyncNeeded).toBe(false)
  })

  it('useResyncRefetch reacts to a live resync.required control frame', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useResyncRefetch(refetch))
    renderHook(() => useServerEvents())

    await act(async () => {
      sendMessage({
        type: 'resync.required',
        data: { reason: 'retention-gap' },
        timestamp: Date.now(),
      })
    })

    // End-to-end: control frame → flag → refetch → cleared.
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(useMissionControl.getState().connection.resyncNeeded).toBe(false)
  })

  it('useResyncRefetch does not refetch when the flag is cleared without ever being set', () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useResyncRefetch(refetch))

    // Flag stays falsy → no refetch, idempotent.
    expect(refetch).not.toHaveBeenCalled()
    expect(useMissionControl.getState().connection.resyncNeeded).toBeFalsy()
  })

  it('a chat.message.read event sets read_at on the matching chat message (CHAT-5)', () => {
    renderHook(() => useServerEvents())

    // Seed a chat message that is currently unread.
    useMissionControl.setState({
      chatMessages: [
        {
          id: 77,
          conversation_id: 'conv_x',
          from_agent: 'Beatrice',
          to_agent: 'Carol',
          content: 'hi',
          message_type: 'text',
          read_at: undefined,
          created_at: 1700000000,
        },
      ],
    })

    // The realtime layer broadcasts a chat.message.read carrying the message id + read_at.
    sendMessage({
      id: 9001,
      type: 'chat.message.read',
      data: { id: 77, workspace_id: 1, read_at: 1700000500 },
      timestamp: Date.now(),
    })

    const msg = useMissionControl.getState().chatMessages.find((m) => m.id === 77)
    expect(msg?.read_at).toBe(1700000500)
  })

  it('a chat.message.read event for an unknown message is a safe no-op (CHAT-5)', () => {
    renderHook(() => useServerEvents())
    useMissionControl.setState({
      chatMessages: [
        {
          id: 77,
          conversation_id: 'conv_x',
          from_agent: 'Beatrice',
          to_agent: 'Carol',
          content: 'hi',
          message_type: 'text',
          read_at: 1700000001,
          created_at: 1700000000,
        },
      ],
    })

    // read-state for a message that is not in the local cache must not throw or mutate.
    sendMessage({
      id: 9002,
      type: 'chat.message.read',
      data: { id: 9999, workspace_id: 1, read_at: 1700000600 },
      timestamp: Date.now(),
    })

    const msg = useMissionControl.getState().chatMessages.find((m) => m.id === 77)
    expect(msg?.read_at).toBe(1700000001) // unchanged
  })

  it('still deduplicates genuinely repeated id-bearing durable events', () => {
    renderHook(() => useServerEvents())

    sendMessage(
      { id: 100, type: 'task.created', data: { id: 100, title: 'once' }, timestamp: Date.now() },
      '100',
    )
    // Same id replayed — must be dropped.
    sendMessage(
      { id: 100, type: 'task.created', data: { id: 100, title: 'twice' }, timestamp: Date.now() },
      '100',
    )

    const tasks = useMissionControl.getState().tasks.filter((t) => t.id === 100)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('once')
  })
})
