import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventType } from '../event-bus'

// Single shared warn spy; the logger mock always returns the same instance so
// every re-import of event-bus (for a fresh singleton) wires up to one spy.
const warn = vi.hoisted(() => vi.fn())

// Type-level membership probe (DS-2). EventType must NOT contain the dead
// literal 'chat.message.deleted': declared but never broadcast, never consumed,
// no DELETE endpoint, no store deleter — deletion is not a committed
// requirement. `MatchesNever` is `true` only when the literal is absent from the
// union. Asserting it against the `true` literal fails to compile while the
// member still exists, and compiles once removed — the durable regression guard.
type IsNever<T> = [T] extends [never] ? true : false
type MatchesNever = IsNever<Extract<EventType, 'chat.message.deleted'>>

vi.mock('../logger', () => ({
  logger: {
    warn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// The event bus persists its durability latch on a process singleton, and the
// DB-backed recordServerEvent is reached via a lazy runtime require that is
// outside vitest's mock graph. We drive durability success/failure by
// overriding the protected recordDurable seam on a freshly-imported singleton
// (no live SQLite needed), and drop the cached singleton between tests so each
// starts from a clean latch.
type EventBusSeam = {
  recordDurable: (event: unknown) => unknown
  broadcast: (type: string, data: unknown) => unknown
}

async function freshBus(record: (event: unknown) => unknown): Promise<EventBusSeam> {
  delete (globalThis as Record<string, unknown>).__eventBus
  vi.resetModules()
  const { eventBus } = await import('../event-bus')
  const seam = eventBus as unknown as EventBusSeam
  seam.recordDurable = record
  return seam
}

describe('ServerEventBus durability latch', () => {
  beforeEach(() => {
    warn.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('logs once per failure when failures are consecutive', async () => {
    const boom = () => {
      throw new Error('boom')
    }
    const eventBus = await freshBus(boom)

    eventBus.broadcast('task.created', { n: 1 })
    eventBus.broadcast('task.created', { n: 2 })

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('re-warns on the next failure after a successful record (latch reset)', async () => {
    let shouldFail = true
    const eventBus = await freshBus(() => {
      if (shouldFail) throw new Error('boom')
      return { durable: true }
    })

    // 1st failure -> warns (latch set)
    eventBus.broadcast('task.created', { n: 1 })
    expect(warn).toHaveBeenCalledTimes(1)

    // success -> latch must reset
    shouldFail = false
    eventBus.broadcast('task.created', { n: 2 })
    expect(warn).toHaveBeenCalledTimes(1)

    // 2nd failure -> must warn AGAIN (this is the regression under test)
    shouldFail = true
    eventBus.broadcast('task.created', { n: 3 })

    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('EventType surface (DS-2)', () => {
  it('does not declare the unbroadcast chat.message.deleted event', () => {
    // DS-2: 'chat.message.deleted' was declared but never broadcast, never
    // consumed, had no DELETE endpoint and no store deleter. Deletion is not a
    // committed requirement, so the dead union member must be removed.
    // MatchesNever is `true` iff the literal is absent; the assignment below
    // fails to compile while it is still present (true !== true is fine, but
    // `true as false` is rejected) and passes once removed.
    const matches: MatchesNever = true
    expect(matches).toBe(true)
  })
})
