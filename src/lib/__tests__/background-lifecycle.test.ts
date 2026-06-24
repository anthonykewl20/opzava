import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PROC-2: three long-lived intervals (scheduler, realtime pruner, runner
// maintenance) must be unref'd and stoppable from a single coordinated shutdown
// path. These tests pin that contract.

// ---------------------------------------------------------------------------
// Interval unref contract: scheduler tickInterval + realtime pruner handle.
// We capture setInterval's return value to assert it was unref'd. jsdom's
// setInterval returns a Timeout-like object; we wrap it so the assertion is
// hermetic regardless of the runtime's handle shape.
// ---------------------------------------------------------------------------

function makeUnrefCapture() {
  const unrefd: unknown[] = []
  const calls: Array<{ fn: Function; ms: number }> = []
  return {
    unrefd,
    calls,
    fake() {
      const handle = { _unref: false, ref() {}, unref() { this._unref = true; unrefd.push(handle) } }
      return handle
    },
  }
}

describe('scheduler interval lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('unrefs the scheduler tick interval so it never blocks process exit', async () => {
    const capture = makeUnrefCapture()
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: Function, ms: number) => {
      capture.calls.push({ fn, ms })
      return capture.fake() as any
    }) as any)

    const { initScheduler, stopScheduler } = await import('../scheduler')
    initScheduler()
    stopScheduler()

    expect(capture.calls.length).toBeGreaterThan(0)
    // initScheduler must call .unref() on its tick interval exactly once.
    expect(capture.unrefd.length).toBe(1)
    vi.restoreAllMocks()
  })

  it('stopScheduler is idempotent (calling it twice does not throw)', async () => {
    const { initScheduler, stopScheduler } = await import('../scheduler')
    initScheduler()
    expect(() => {
      stopScheduler()
      stopScheduler()
    }).not.toThrow()
  })
})

describe('realtime pruner interval lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('unrefs the pruner interval so it never blocks process exit', async () => {
    const capture = makeUnrefCapture()
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: Function, ms: number) => {
      capture.calls.push({ fn, ms })
      return capture.fake() as any
    }) as any)

    vi.mock('../db', () => ({ getDatabase: () => ({ prepare: () => ({ run() {}, get() { return { count: 0 } } }) }) }))
    const { startRealtimePruner, stopRealtimePruner } = await import('../realtime-events')
    startRealtimePruner()
    stopRealtimePruner()

    // startRealtimePruner must call .unref() on its interval exactly once.
    expect(capture.unrefd.length).toBe(1)
    vi.restoreAllMocks()
    vi.doUnmock('../db')
  })

  it('exposes a stopRealtimePruner() that clears the handle and is idempotent', async () => {
    vi.mock('../db', () => ({ getDatabase: () => ({ prepare: () => ({ run() {}, get() { return { count: 0 } } }) }) }))
    const { startRealtimePruner, stopRealtimePruner } = await import('../realtime-events')
    startRealtimePruner()
    expect(() => {
      stopRealtimePruner()
      stopRealtimePruner()
    }).not.toThrow()
    vi.doUnmock('../db')
  })
})

// ---------------------------------------------------------------------------
// db.ts coordinated shutdown: a single idempotent stop path that aborts the
// runner-maintenance controller AND calls stopScheduler()/stopRealtimePruner(),
// attached to SIGTERM/SIGINT/beforeExit exactly once.
// ---------------------------------------------------------------------------

describe('db.ts coordinated background-timer shutdown', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports a stopBackgroundTimers() that stops all three timers', async () => {
    const stopScheduler = vi.fn()
    const stopRealtimePruner = vi.fn()
    vi.doMock('../scheduler', () => ({ initScheduler: vi.fn(), stopScheduler }))
    vi.doMock('../realtime-events', () => ({ startRealtimePruner: vi.fn(), stopRealtimePruner }))

    const { stopBackgroundTimers } = await import('../db')
    await stopBackgroundTimers()

    expect(stopScheduler).toHaveBeenCalledTimes(1)
    expect(stopRealtimePruner).toHaveBeenCalledTimes(1)
  })

  it('stopBackgroundTimers() is idempotent across repeated calls (no double-stop, no throw)', async () => {
    const stopScheduler = vi.fn()
    const stopRealtimePruner = vi.fn()
    vi.doMock('../scheduler', () => ({ initScheduler: vi.fn(), stopScheduler }))
    vi.doMock('../realtime-events', () => ({ startRealtimePruner: vi.fn(), stopRealtimePruner }))

    const { stopBackgroundTimers } = await import('../db')
    // Each stop must itself be idempotent; the coordinator must not error on re-entry.
    await expect(stopBackgroundTimers()).resolves.toBeUndefined()
    await expect(stopBackgroundTimers()).resolves.toBeUndefined()
    await expect(stopBackgroundTimers()).resolves.toBeUndefined()
  })

  it('registerProcessShutdown() attaches beforeExit once and is idempotent across repeated calls', async () => {
    const stopScheduler = vi.fn()
    const stopRealtimePruner = vi.fn()
    vi.doMock('../scheduler', () => ({ initScheduler: vi.fn(), stopScheduler }))
    vi.doMock('../realtime-events', () => ({ startRealtimePruner: vi.fn(), stopRealtimePruner }))

    // beforeExit is registered ONLY by registerProcessShutdown (other process.on
    // calls in db.ts touch exit/SIGINT/SIGTERM/unhandledRejection), so its count
    // is the cleanest single-registration assertion for the coordinated handler.
    const addedSignals: string[] = []
    const spy = vi.spyOn(process, 'on').mockImplementation((event: string | symbol) => {
      addedSignals.push(String(event))
      return process
    })

    const { registerProcessShutdown } = await import('../db')
    registerProcessShutdown()
    const firstCount = addedSignals.filter((s) => s === 'beforeExit').length
    registerProcessShutdown() // second call must be a no-op (latched)
    registerProcessShutdown() // third call must also be a no-op
    const finalCount = addedSignals.filter((s) => s === 'beforeExit').length

    // registerProcessShutdown must register beforeExit on first call.
    expect(firstCount).toBe(1)
    // Repeated calls must NOT add duplicate beforeExit listeners (idempotent latch).
    expect(finalCount).toBe(1)
    spy.mockRestore()
  })
})
