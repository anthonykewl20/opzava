import { describe, expect, it, vi, beforeEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'

// DUR-2: tokens.json must be written atomically (temp-file + rename) so that a
// crash mid-write can never truncate the file and destroy all historical token
// data. The test simulates a process crash during the write and confirms the
// prior file is left byte-for-byte intact.

const TOKENS_FILE = join(tmpdir(), `dur2-tokens-${process.pid}-${Date.now()}.json`)

// Hoisted call log so the vi.mock factories (which run before the test body)
// can record every fs/promises invocation.
const calls = vi.hoisted(() => ({
  writeFilePaths: [] as string[],
  renameCalls: [] as Array<{ from: string; to: string }>,
  crashOnWrite: false,
}))

vi.mock('fs/promises', () => {
  const readFile = vi.fn(async (path: string) => {
    // Pretend a prior valid tokens.json exists on disk.
    if (path === TOKENS_FILE) return '[{"id":"historic"}]'
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  })
  const writeFile = vi.fn(async (path: string) => {
    calls.writeFilePaths.push(path)
    if (calls.crashOnWrite) {
      // Simulate the process dying partway through writing this path.
      throw new Error('ECONNRESET: process killed mid-write')
    }
  })
  const rename = vi.fn(async (from: string, to: string) => {
    calls.renameCalls.push({ from, to })
  })
  const access = vi.fn(async () => undefined)
  return { default: { readFile, writeFile, rename, access }, readFile, writeFile, rename, access }
})

vi.mock('@/lib/config', () => ({
  config: { tokensPath: TOKENS_FILE },
  ensureDirExists: vi.fn(),
}))

// These modules are imported by the route at module load but are not exercised
// by saveTokenData; stub them so importing the route stays side-effect free.
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/sessions', () => ({ getAllGatewaySessions: vi.fn(() => []) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/db', () => ({ getDatabase: vi.fn() }))
vi.mock('@/lib/token-pricing', () => ({ calculateTokenCost: vi.fn(() => 0) }))
vi.mock('@/lib/provider-subscriptions', () => ({ getProviderSubscriptionFlags: vi.fn(() => ({})) }))
vi.mock('@/lib/task-costs', () => ({ buildTaskCostReport: vi.fn(() => ({})) }))

const { saveTokenData } = await import('./route')

describe('DUR-2: saveTokenData — atomic temp-file + rename', () => {
  beforeEach(() => {
    calls.writeFilePaths = []
    calls.renameCalls = []
    calls.crashOnWrite = false
  })

  it('writes to a temp path then atomically renames over tokens.json', async () => {
    await saveTokenData([{ id: 'new' } as never])

    // writeFile must NEVER touch the final tokens.json path directly.
    expect(calls.writeFilePaths).not.toContain(TOKENS_FILE)
    expect(calls.writeFilePaths.length).toBe(1)
    expect(calls.writeFilePaths[0]).toMatch(/\.tmp$/)

    // The temp file is renamed onto the canonical path in one atomic step.
    expect(calls.renameCalls).toEqual([{ from: expect.stringMatching(/\.tmp$/), to: TOKENS_FILE }])
  })

  it('leaves the prior file intact when the write crashes mid-flight', async () => {
    calls.crashOnWrite = true

    // saveTokenData should reject because the underlying write failed...
    await expect(saveTokenData([{ id: 'doomed' } as never])).rejects.toThrow('process killed')

    // ...but the canonical path was never written directly and never renamed,
    // so the historic file on disk is untouched and remains valid JSON.
    expect(calls.writeFilePaths).not.toContain(TOKENS_FILE)
    expect(calls.renameCalls).toEqual([])

    const { readFile } = await import('fs/promises')
    const surviving = await (readFile as unknown as (p: string) => Promise<string>)(TOKENS_FILE)
    expect(() => JSON.parse(surviving)).not.toThrow()
    expect(JSON.parse(surviving)).toEqual([{ id: 'historic' }])
  })
})
