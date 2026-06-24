import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// DUR-3: the token-usage file written by /api/cleanup must be mutated through
// writeFileAtomic (tmp + rename), never a bare writeFile that could leave the
// file truncated mid-write.

const atomic = vi.hoisted(() => ({ calls: [] as Array<{ file: string; data: string }> }))

vi.mock('@/lib/atomic-write', () => ({
  writeFileAtomic: vi.fn(async (file: string, data: string) => {
    atomic.calls.push({ file, data })
    await writeFile(file, data, 'utf-8')
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: () => ({ user: { id: 1, username: 'admin', workspace_id: 1 } }),
}))

vi.mock('@/lib/rate-limit', () => ({
  heavyLimiter: () => null,
}))

vi.mock('@/lib/sessions', () => ({
  countStaleGatewaySessions: () => 0,
  pruneGatewaySessionsOlderThan: () => ({ deleted: 0, filesTouched: 0 }),
}))

const { dbSpy, tokensSpy } = vi.hoisted(() => ({
  dbSpy: { db: null as any },
  tokensSpy: { path: '' as string },
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbSpy.db,
  logAuditEvent: vi.fn(),
}))

vi.mock('@/lib/config', () => ({
  config: {
    retention: {
      activities: 0,
      auditLog: 0,
      notifications: 0,
      pipelineRuns: 0,
      tokenUsage: 7,
      gatewaySessions: 0,
    },
    get tokensPath() {
      return tokensSpy.path
    },
  },
}))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('DUR-3: /api/cleanup writes the token file atomically', () => {
  let baseDir: string

  beforeEach(async () => {
    atomic.calls = []
    baseDir = await mkdtemp(path.join(tmpdir(), 'dur3-cleanup-'))
    tokensSpy.path = path.join(baseDir, 'tokens.json')
    // A stub DB whose prepared queries are no-ops (retention targets days<=0
    // are skipped; only the token-file path runs here).
    dbSpy.db = {
      prepare: () => ({ get: () => ({ c: 0 }), run: () => ({ changes: 0 }) }),
    }
  })

  it('replaces the token file via writeFileAtomic, not a bare writeFile', async () => {
    const staleTs = Date.now() - 30 * 86400000
    const freshTs = Date.now()
    const data = [
      { timestamp: staleTs, tokens: 100 },
      { timestamp: freshTs, tokens: 5 },
    ]
    await writeFile(tokensSpy.path, JSON.stringify(data, null, 2), 'utf-8')

    const res = await POST(req({ dry_run: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total_deleted).toBe(1)

    expect(atomic.calls).toHaveLength(1)
    expect(atomic.calls[0].file).toBe(tokensSpy.path)

    const kept = JSON.parse(await readFile(tokensSpy.path, 'utf-8'))
    expect(kept).toEqual([{ timestamp: freshTs, tokens: 5 }])
    await expect(stat(`${tokensSpy.path}.tmp`)).rejects.toThrow()
  })

  it('does not rewrite when nothing was pruned (idempotent no-op)', async () => {
    const freshTs = Date.now()
    const data = [{ timestamp: freshTs, tokens: 5 }]
    await writeFile(tokensSpy.path, JSON.stringify(data, null, 2), 'utf-8')

    const res = await POST(req({ dry_run: false }))
    expect(res.status).toBe(200)
    expect(atomic.calls).toHaveLength(0)
  })
})
