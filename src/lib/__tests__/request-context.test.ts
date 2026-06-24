import { describe, expect, it } from 'vitest'
import pino from 'pino'
import { runRequestContext, getRequestContext, getRequestId } from '../request-context'

describe('request-context (AsyncLocalStorage)', () => {
  it('returns undefined outside a context', () => {
    expect(getRequestContext()).toBeUndefined()
    expect(getRequestId()).toBeUndefined()
  })

  it('exposes the context inside runRequestContext', () => {
    runRequestContext({ requestId: 'req-1', workspaceId: 7 }, () => {
      expect(getRequestId()).toBe('req-1')
      expect(getRequestContext()?.workspaceId).toBe(7)
    })
    expect(getRequestId()).toBeUndefined()
  })

  it('does not leak across nested contexts', async () => {
    await runRequestContext({ requestId: 'outer' }, async () => {
      expect(getRequestId()).toBe('outer')
      await runRequestContext({ requestId: 'inner' }, async () => {
        expect(getRequestId()).toBe('inner')
      })
      expect(getRequestId()).toBe('outer')
    })
    expect(getRequestId()).toBeUndefined()
  })

  it('a pino mixin correlates a log line to the active request_id (end-to-end)', () => {
    const lines: string[] = []
    // Same mixin shape the production logger uses (logger.ts REQUEST_ID_MIXIN).
    const log = pino(
      {
        mixin: () => {
          const ctx = getRequestContext()
          return ctx?.requestId ? { request_id: ctx.requestId } : {}
        },
      },
      { write: (s) => lines.push(s) },
    )
    runRequestContext({ requestId: 'r-9' }, () => log.info('inside'))
    log.info('outside')
    expect(JSON.parse(lines[0]).request_id).toBe('r-9')
    expect(JSON.parse(lines[1]).request_id).toBeUndefined()
  })
})
