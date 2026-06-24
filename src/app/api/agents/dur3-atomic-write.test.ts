import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// DUR-3: Hermes profile provisioning writes persistent config.yaml and
// SOUL.md. These config-file mutations must go through the shared
// writeFileAtomic helper so a crash mid-write never truncates the profile.

const atomic = vi.hoisted(() => ({ calls: [] as Array<{ file: string; data: string }> }))

vi.mock('@/lib/atomic-write', () => ({
  writeFileAtomic: vi.fn(async (file: string, data: string) => {
    atomic.calls.push({ file, data })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(file, data, 'utf-8')
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: () => ({ user: { id: 1, username: 'admin', workspace_id: 1 } }),
}))

vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: () => null }))

vi.mock('@/lib/validation', () => ({
  validateBody: async (req: { json: () => Promise<unknown> }, _schema: unknown) => ({
    data: await req.json(),
  }),
  createAgentSchema: {},
}))

vi.mock('@/lib/command', () => ({ runOpenClaw: vi.fn() }))

vi.mock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))

vi.mock('@/lib/agent-templates', () => ({
  getTemplate: () => null,
  buildAgentConfig: () => ({}),
}))

vi.mock('@/lib/agent-sync', () => ({
  writeAgentToConfig: vi.fn(),
  enrichAgentConfigFromWorkspace: (c: any) => c,
}))

vi.mock('@/lib/model-config', () => ({ DISPATCH_MODEL_DEFAULT: 'claude-sonnet' }))

vi.mock('@/lib/paths', () => ({ resolveWithin: (base: string, ...segs: string[]) => path.join(base, ...segs) }))

const { dbHolder, cfgSpy } = vi.hoisted(() => ({
  dbHolder: { db: null as any, lastId: 1 },
  cfgSpy: { home: '', openclaw: '/state' },
}))

function makeDb() {
  return {
    prepare: (sql: string) => {
      if (/SELECT id FROM agents WHERE name/.test(sql)) return { get: () => undefined }
      if (/INSERT INTO agents/.test(sql)) return { run: () => ({ lastInsertRowid: dbHolder.lastId }) }
      if (/SELECT \* FROM agents WHERE id/.test(sql)) {
        return { get: () => ({ id: dbHolder.lastId, name: 'hermes-1', role: 'agent', config: '{}' }) }
      }
      return { get: () => undefined, run: () => ({ changes: 0 }) }
    },
  }
}

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbHolder.db,
  db_helpers: { logActivity: vi.fn() },
  logAuditEvent: vi.fn(),
}))

vi.mock('@/lib/config', () => ({
  config: {
    get openclawStateDir() {
      return cfgSpy.openclaw
    },
    get homeDir() {
      return cfgSpy.home
    },
  },
}))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('DUR-3: /api/agents provisions Hermes config.yaml + SOUL.md atomically', () => {
  let baseDir: string

  beforeEach(async () => {
    atomic.calls = []
    baseDir = await mkdtemp(path.join(tmpdir(), 'dur3-agents-'))
    cfgSpy.home = baseDir
    dbHolder.lastId = 1
    dbHolder.db = makeDb()
  })

  it('writes config.yaml via writeFileAtomic, never a bare/truncating write', async () => {
    const res = await POST(
      req({
        name: 'hermes-1',
        role: 'agent',
        status: 'offline',
        runtime_type: 'hermes',
        config: { model: 'claude-sonnet', provider: 'anthropic' },
      }),
    )
    expect(res.status).toBe(201)

    const configYaml = path.join(baseDir, '.hermes', 'profiles', 'hermes-1', 'config.yaml')
    expect(atomic.calls.some((c) => c.file === configYaml)).toBe(true)
    expect(await readFile(configYaml, 'utf-8')).toContain('model: claude-sonnet')
    await expect(stat(`${configYaml}.tmp`)).rejects.toThrow()
  })

  it('writes SOUL.md via writeFileAtomic when soul_content is provided', async () => {
    const res = await POST(
      req({
        name: 'hermes-1',
        role: 'agent',
        status: 'offline',
        runtime_type: 'hermes',
        soul_content: 'You are careful and precise.',
        config: { model: 'claude-sonnet' },
      }),
    )
    expect(res.status).toBe(201)

    const soul = path.join(baseDir, '.hermes', 'profiles', 'hermes-1', 'SOUL.md')
    expect(atomic.calls.some((c) => c.file === soul)).toBe(true)
    expect(await readFile(soul, 'utf-8')).toBe('You are careful and precise.')
    await expect(stat(`${soul}.tmp`)).rejects.toThrow()
  })
})
