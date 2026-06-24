import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  listPtySessions,
  registerPtySessionProvider,
  resetPtySessionProvider,
  type PtyLiveSession,
} from '@/lib/pty-manager'

describe('pty-manager live session provider', () => {
  afterEach(() => {
    resetPtySessionProvider()
  })

  it('returns the live PTY sessions from the registered runtime provider', () => {
    // The .cjs standalone owns the real PTYs; it registers itself as the
    // provider so GET /api/pty/attach surfaces sessions from the runtime that
    // actually owns them, not the always-empty in-process TS pool.
    registerPtySessionProvider(() => [
      {
        sessionId: 'agent-7',
        kind: 'claude-code',
        mode: 'readonly',
        createdAt: 1_700_000_000_0,
      },
    ])

    const sessions = listPtySessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'agent-7',
      kind: 'claude-code',
      mode: 'readonly',
    })
  })

  it('survives a provider that throws — returns the local pool instead of 500ing', () => {
    registerPtySessionProvider(() => {
      throw new Error('IPC gone')
    })

    // Must not propagate: the route's GET handler should never crash because
    // the live-runtime reader faulted.
    expect(() => listPtySessions()).not.toThrow()
    expect(listPtySessions()).toEqual([])
  })

  it('returns an empty list (local pool only) when no provider is registered', () => {
    resetPtySessionProvider()

    expect(listPtySessions()).toEqual([])
  })

  it('returns a fresh snapshot each call (idempotent reads, no shared mutable refs)', () => {
    const live: PtyLiveSession[] = [{ sessionId: 's1', kind: 'codex-cli', mode: 'interactive', createdAt: 1 }]
    registerPtySessionProvider(() => live)

    const a = listPtySessions()
    const b = listPtySessions()

    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('does not leak the provider across reset', () => {
    const provider = vi.fn((): PtyLiveSession[] => [
      { sessionId: 'x', kind: 'claude-code', mode: 'readonly', createdAt: 1 },
    ])
    registerPtySessionProvider(provider)
    listPtySessions()
    expect(provider).toHaveBeenCalledOnce()

    resetPtySessionProvider()
    provider.mockClear()
    listPtySessions()
    expect(provider).not.toHaveBeenCalled()
  })
})
