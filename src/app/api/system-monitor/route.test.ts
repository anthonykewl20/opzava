import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import os from 'node:os'

/**
 * Dedup guard (Gap C): system-monitor must reuse the shared `getMemorySnapshot`
 * exported from @/lib/status-actions — not a copy-pasted local duplicate. The
 * shared impl must also preserve the route's existing memory shape, including
 * swap fields that the system-monitor panel renders.
 */

const { runCommandMock } = vi.hoisted(() => ({
  // Default: every shell probe the snapshot uses resolves to empty output so the
  // pure-os.freemem()/os.totalmem() path is exercised deterministically.
  runCommandMock: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
}))

vi.mock('@/lib/command', () => ({
  runCommand: runCommandMock,
}))

vi.mock('@/lib/auth', () => ({
  requireRole: () => ({ user: { id: 1, username: 'admin' } }),
}))

import * as statusActions from '@/lib/status-actions'

import { GET } from './route'

function req() {
  return new NextRequest('http://localhost/api/system-monitor')
}

describe('system-monitor route — shared getMemorySnapshot', () => {
  beforeEach(() => {
    runCommandMock.mockReset()
    runCommandMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
  })

  it('GET routes memory through the shared getMemorySnapshot from @/lib/status-actions', async () => {
    // The dedup contract: the route must NOT carry its own copy-pasted
    // getMemorySnapshot. Spy on the shared export; if the route re-introduces a
    // local duplicate, this spy never fires and the assertion fails.
    const sentinel = {
      totalBytes: 1122334455,
      availableBytes: 100000000,
      usedBytes: 1022334455,
      usagePercent: 91,
      swapTotalBytes: 999,
      swapUsedBytes: 111,
    }
    const spy = vi
      .spyOn(statusActions, 'getMemorySnapshot')
      .mockResolvedValue(sentinel)

    const res = await GET(req())
    const body = await res.json()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(body.memory).toEqual(sentinel)
    spy.mockRestore()
  })

  it('GET memory shape includes swap fields sourced from the shared impl', async () => {
    // The shared impl uses os.totalmem() for the total and parses only the
    // `available` column from `free -b`'s Mem: line plus swap from Swap:.
    // Pin that the route's response reflects the shared implementation (parses
    // both Mem: available and Swap:) — this fails if the route re-introduces a
    // local copy lacking swap parsing or drops the import.
    runCommandMock.mockImplementation((cmd: string) => {
      if (cmd === 'free') {
        return Promise.resolve({
          stdout: [
            '              total        used        free      shared  buff/cache   available',
            'Mem:       16106127360  8053063680  2013265920          0  6039797760  7832883200',
            'Swap:      2147483648   536870912  1610612736',
          ].join('\n'),
          stderr: '',
          code: 0,
        })
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 0 })
    })

    const res = await GET(req())
    const body = await res.json()

    const totalBytes = os.totalmem()
    const availableBytes = 7832883200
    const usedBytes = Math.max(0, totalBytes - availableBytes)

    // Memory fields preserved (route response shape contract).
    expect(body.memory).toEqual(
      expect.objectContaining({
        totalBytes,
        availableBytes,
        usedBytes,
        usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
        // Swap must come along — the panel renders it. A local copy without swap
        // parsing would leave these at 0.
        swapTotalBytes: 2147483648,
        swapUsedBytes: 536870912,
      }),
    )
  })
})
