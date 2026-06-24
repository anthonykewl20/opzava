import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { mkdtemp, rm, readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// DUR-3: every persistent memory-doc mutation must go through the shared
// writeFileAtomic helper (tmp + fsync + rename), never a bare writeFile to the
// destination. A crash mid-write must never truncate the destination file.

const atomic = vi.hoisted(() => ({ calls: [] as Array<{ file: string; data: string }> }))

vi.mock('@/lib/atomic-write', () => ({
  writeFileAtomic: vi.fn(async (file: string, data: string) => {
    atomic.calls.push({ file, data })
    // Emulate rename semantics so downstream indexFile/stat can observe it.
    await writeFile(file, data, 'utf-8')
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: () => ({ user: { id: 1, username: 'admin' } }),
}))

vi.mock('@/lib/rate-limit', () => ({
  readLimiter: () => null,
  mutationLimiter: () => null,
}))

vi.mock('@/lib/memory-utils', () => ({
  validateSchema: () => null,
  extractWikiLinks: () => [],
}))

vi.mock('@/lib/memory-search', () => ({
  searchMemory: vi.fn(),
  indexFile: vi.fn(),
  removeFromIndex: vi.fn(),
}))

const { getDatabaseSpy, pathHolder } = vi.hoisted(() => ({
  getDatabaseSpy: { db: null as any },
  pathHolder: { base: '' as string },
}))
vi.mock('@/lib/db', () => ({
  db_helpers: { logActivity: vi.fn() },
  getDatabase: () => getDatabaseSpy.db,
}))

vi.mock('@/lib/memory-path', async () => {
  const actual = await vi.importActual<typeof import('@/lib/memory-path')>('@/lib/memory-path')
  return {
    ...actual,
    // MEMORY_PATH must be truthy so the route's guard proceeds; the real
    // filesystem work is redirected via resolveSafeMemoryPath below.
    get MEMORY_PATH() {
      return pathHolder.base
    },
    MEMORY_ALLOWED_PREFIXES: [],
    isPathAllowed: () => true,
    resolveSafeMemoryPath: (_base: string, rel: string) =>
      Promise.resolve(path.join(pathHolder.base, rel)),
  }
})

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('DUR-3: /api/memory writes go through writeFileAtomic', () => {
  let baseDir: string
  beforeEach(async () => {
    atomic.calls = []
    baseDir = await mkdtemp(path.join(tmpdir(), 'dur3-memory-'))
    pathHolder.base = baseDir
    getDatabaseSpy.db = {}
  })

  it('save action uses the atomic helper, not a direct writeFile to the destination', async () => {
    const rel = 'notes/keeper.md'
    await mkdir(path.join(baseDir, 'notes'), { recursive: true })
    await writeFile(path.join(baseDir, rel), 'OLD', 'utf-8')

    const res = await POST(req({ action: 'save', path: rel, content: 'NEW' }))
    expect(res.status).toBe(200)

    expect(atomic.calls).toHaveLength(1)
    expect(atomic.calls[0].file).toBe(path.join(baseDir, rel))
    expect(atomic.calls[0].data).toBe('NEW')
    expect(await readFile(path.join(baseDir, rel), 'utf-8')).toBe('NEW')
    // No .tmp leftover after a successful atomic write.
    await expect(stat(`${path.join(baseDir, rel)}.tmp`)).rejects.toThrow()
  })

  it('create action uses the atomic helper, not a direct writeFile to the destination', async () => {
    await mkdir(path.join(baseDir, 'docs'), { recursive: true })
    const rel = 'docs/new.md'

    const res = await POST(req({ action: 'create', path: rel, content: 'FRESH' }))
    expect(res.status).toBe(200)

    expect(atomic.calls).toHaveLength(1)
    expect(atomic.calls[0].file).toBe(path.join(baseDir, rel))
    expect(atomic.calls[0].data).toBe('FRESH')
    expect(await readFile(path.join(baseDir, rel), 'utf-8')).toBe('FRESH')
    await expect(stat(`${path.join(baseDir, rel)}.tmp`)).rejects.toThrow()
  })
})
