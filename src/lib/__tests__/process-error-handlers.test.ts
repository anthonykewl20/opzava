import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PROC-1: process-level unhandledRejection / uncaughtException handlers must
 * exist (registered once at app bootstrap) and emit a structured pino line
 * carrying the rejection reason / error stack BEFORE default termination.
 * Without these, a stray rejection crashes the process with no structured
 * diagnostic.
 *
 * db.ts owns the process lifecycle listeners (exit/SIGINT/SIGTERM ->
 * closeDatabase); the fatal handlers live alongside those. Registration is
 * idempotent (module-scoped guard on globalThis) so repeated imports —
 * including hot-reload — never stack duplicate handlers.
 *
 * The handlers run on the real `process` emitter. We capture them, spy the
 * shared pino logger singleton (the same object the handler closed over), and
 * stub process.exit to assert the structured payload without terminating the
 * test process.
 */

import { logger } from '@/lib/logger'
import * as dbModule from '@/lib/db'

type FatalHandler = (reason: unknown, promise?: unknown) => void

function opzavaHandlers(event: string): FatalHandler[] {
  // Filter to handlers whose source is db.ts (named handleFatal*).
  return process
    .listeners(event as NodeJS.Signals)
    .filter((h): h is FatalHandler => h.name === 'handleFatalRejection' || h.name === 'handleFatalException')
}

describe('process fatal error handlers (PROC-1)', () => {
  beforeAll(() => {
    // Ensure the side-effect registration from importing db has run.
    void dbModule
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers exactly one unhandledRejection and one uncaughtException handler', () => {
    expect(opzavaHandlers('unhandledRejection')).toHaveLength(1)
    expect(opzavaHandlers('uncaughtException')).toHaveLength(1)
  })

  it('does not double-register handlers on repeated import (idempotent)', async () => {
    vi.resetModules()
    await import('@/lib/db')
    expect(opzavaHandlers('unhandledRejection')).toHaveLength(1)
    expect(opzavaHandlers('uncaughtException')).toHaveLength(1)
  })

  it('logs unhandledRejection reason + stack as a structured pino error line, then exits non-zero', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit_stub__')
    }) as never)

    const handler = opzavaHandlers('unhandledRejection')[0]
    expect(handler).toBeDefined()

    const reason = new Error('proc-1-rejection')
    expect(() => handler(reason, Promise.resolve())).toThrow('__exit_stub__')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [payload, msg] = errorSpy.mock.calls[0] as [{ err: Error }, string]
    expect(msg).toMatch(/unhandled rejection/i)
    // pino serializes { err } with the stack; the raw Error is passed through.
    expect(payload).toMatchObject({ err: expect.any(Error) })
    expect(payload.err).toBe(reason)
    expect(payload.err.stack).toContain('proc-1-rejection')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('logs uncaughtException error + stack as a structured pino error line, then exits non-zero', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit_stub__')
    }) as never)

    const handler = opzavaHandlers('uncaughtException')[0]
    expect(handler).toBeDefined()

    const err = new Error('proc-1-uncaught')
    expect(() => handler(err)).toThrow('__exit_stub__')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [payload, msg] = errorSpy.mock.calls[0] as [{ err: Error }, string]
    expect(msg).toMatch(/uncaught exception/i)
    expect(payload).toMatchObject({ err: expect.any(Error) })
    expect(payload.err).toBe(err)
    expect(payload.err.stack).toContain('proc-1-uncaught')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
