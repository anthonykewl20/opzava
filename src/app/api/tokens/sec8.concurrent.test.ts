import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, existsSync } from 'fs'

// Resolve the per-run temp tokens path eagerly at module load (after imports are
// initialized — vi.hoisted runs too early to call node:fs).
const TOKENS_DIR = mkdtempSync(join(tmpdir(), 'sec8-tokens-'))
const TOKENS_FILE = join(TOKENS_DIR, 'tokens.json')

// SEC-8: POST /api/tokens must not lose a record when two manual posts race in
// the same workspace. The acceptance criterion from the production-completion
// spec: "two concurrent POST /api/tokens in the same workspace -> both records
// present in a subsequent GET."
//
// The bug: the POST handler did a non-atomic read-modify-write on tokens.json
// (loadTokenDataFromFile -> unshift -> saveTokenData). Two concurrent POSTs
// both read the same array, each prepend their own record, then each write the
// whole array. The second atomic temp+rename clobbers the first, so one record
// vanishes from the canonical store. The fix makes the token_usage DB row the
// sole canonical store for manual posts (SQLite serializes the INSERTs).

const { dbRef } = vi.hoisted(() => ({
  dbRef: { db: null as Database.Database | null },
}))

vi.mock('@/lib/config', () => ({
  config: { tokensPath: TOKENS_FILE },
  ensureDirExists: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn((req: NextRequest, _role: string) => {
    // Distinguish GET (viewer) from POST (operator) by method; both resolve to
    // the same workspace so the records land in the same scope.
    return { user: { id: 1, username: 'admin', workspace_id: 1 } }
  }),
}))

vi.mock('@/lib/sessions', () => ({ getAllGatewaySessions: vi.fn(() => []) }))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/token-pricing', () => ({ calculateTokenCost: vi.fn(() => 0.001) }))
vi.mock('@/lib/provider-subscriptions', () => ({
  getProviderSubscriptionFlags: vi.fn(() => ({})),
}))
vi.mock('@/lib/task-costs', () => ({ buildTaskCostReport: vi.fn(() => ({})) }))

const { GET, POST } = await import('./route')

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(action = 'list') {
  return new NextRequest(`http://localhost/api/tokens?action=${action}&timeframe=all`)
}

/** Create the token_usage table with every column the route INSERTs into. */
function migrateTokenUsage(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      session_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      workspace_id INTEGER NOT NULL DEFAULT 1,
      task_id INTEGER,
      cost_usd REAL,
      agent_name TEXT
    );
  `)
  // The POST handler validates taskId against the tasks table; create a stub so
  // a real taskId would resolve (not used by the no-task case, but keeps the
  // validation query from throwing if a test passes one).
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, workspace_id INTEGER)`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
  migrateTokenUsage(dbRef.db!)
})

afterEach(() => {
  dbRef.db?.close()
  dbRef.db = null
})

describe('SEC-8: concurrent POST /api/tokens never loses a record', () => {
  it('two concurrent same-workspace posts both survive a subsequent GET', async () => {
    // Distinct sessions so the records are unambiguously two separate events
    // (the GET dedup would otherwise collapse byte-identical same-second rows).
    const bodies = [
      { model: 'claude-x', sessionId: 'agent-alpha:chat', inputTokens: 100, outputTokens: 50 },
      { model: 'claude-x', sessionId: 'agent-beta:chat', inputTokens: 200, outputTokens: 75 },
    ]

    // Fire both POSTs concurrently — the exact race the spec calls out.
    const results = await Promise.all(bodies.map((body) => POST(postReq(body))))
    for (const res of results) {
      expect(res.status).toBe(200)
    }

    const getRes = await GET(getRequest('list'))
    expect(getRes.status).toBe(200)
    const payload = await getRes.json()
    const sessions = (payload.usage as Array<{ sessionId: string }>).map((r) => r.sessionId)

    // Both records must be present — neither lost to the RMW race.
    expect(sessions).toContain('agent-alpha:chat')
    expect(sessions).toContain('agent-beta:chat')
    expect(sessions.filter((s) => s === 'agent-alpha:chat')).toHaveLength(1)
    expect(sessions.filter((s) => s === 'agent-beta:chat')).toHaveLength(1)
  })

  it('two concurrent identical posts in the same second both persist to the DB', async () => {
    // Identical shape, same second: the JSON RMW would lose one under the old
    // code, and even the DB-backed GET dedup could collapse them. Assert at the
    // storage layer — both INSERTs must land as distinct token_usage rows.
    const body = { model: 'claude-x', sessionId: 'agent-same:chat', inputTokens: 300, outputTokens: 40 }

    await Promise.all([POST(postReq(body)), POST(postReq(body))])

    const rows = dbRef.db!
      .prepare('SELECT session_id, input_tokens FROM token_usage WHERE session_id = ?')
      .all('agent-same:chat') as Array<{ session_id: string; input_tokens: number }>

    // Two concurrent identical posts -> two persisted rows. The DB is the
    // canonical store; nothing is dropped.
    expect(rows).toHaveLength(2)
  })

  it('does not touch tokens.json from the POST path (DB is the sole canonical store)', async () => {
    // After the fix, manual posts must not perform a JSON read-modify-write at
    // all — the file is reserved for legacy data and the DB is canonical.
    await POST(
      postReq({ model: 'claude-x', sessionId: 'agent-gamma:chat', inputTokens: 10, outputTokens: 5 }),
    )

    // No JSON file should have been created or mutated by the manual post.
    expect(existsSync(TOKENS_FILE)).toBe(false)
  })
})
