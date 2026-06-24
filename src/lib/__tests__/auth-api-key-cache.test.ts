import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * SEC-9: resolveActiveApiKey must not run a DB SELECT on every authenticated
 * request. It must (a) be skipped entirely when no api-key header is present,
 * and (b) cache the settings-stored value with a short TTL, invalidated on
 * settings write.
 *
 * These tests target the DB-read path directly. We mock getDatabase with a
 * prepare() spy and assert the settings SELECT is never issued for
 * cookie-session / headerless requests, and at most once per TTL window for
 * api-key requests.
 */

const prepareMock = vi.fn()
const getMock = vi.fn(() => ({ prepare: prepareMock }))

vi.mock('@/lib/db', () => ({
  getDatabase: () => getMock(),
}))

vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn((p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(() => false),
  verifyPasswordWithRehashCheck: vi.fn(() => ({ valid: false, needsRehash: false })),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn(), on: vi.fn(), emit: vi.fn() },
}))

// Lazy import so module-level mocks are registered first.
async function loadAuth() {
  return await import('@/lib/auth')
}

function newRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers: new Headers(headers) })
}

/** Count how many times the settings SELECT for security.api_key was issued. */
function settingsSelectCount(): number {
  let n = 0
  for (const call of prepareMock.mock.calls) {
    const sql = String(call[0] || '')
    if (sql.includes('FROM settings') && sql.includes('security.api_key')) n++
  }
  return n
}

describe('SEC-9: resolveActiveApiKey DB-read avoidance', () => {
  const originalEnv = process.env

  beforeEach(() => {
    prepareMock.mockReset()
    getMock.mockClear()
    process.env = { ...originalEnv, API_KEY: '' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('does not touch the DB (settings SELECT) when no api-key header is present', async () => {
    const { getUserFromRequest, invalidateActiveApiKeyCache } = await loadAuth()
    invalidateActiveApiKeyCache() // start from a clean cache
    prepareMock.mockClear()

    // Headerless request -> no cookie, no api-key header.
    getUserFromRequest(newRequest())

    expect(settingsSelectCount()).toBe(0)
  })

  it('does not touch the DB for a cookie-session request (cookie present, no api-key header)', async () => {
    const { getUserFromRequest, invalidateActiveApiKeyCache } = await loadAuth()
    invalidateActiveApiKeyCache()
    prepareMock.mockClear()

    // A session cookie is present but validateSession() will miss on the mocked
    // DB. The important assertion is that NO settings SELECT runs — the api-key
    // resolution path must be gated on an api-key header existing at all.
    getUserFromRequest(newRequest({ cookie: 'mc_session=abc' }))

    expect(settingsSelectCount()).toBe(0)
  })

  it('reads the settings value at most once per TTL window across a burst of api-key requests', async () => {
    const { getUserFromRequest, invalidateActiveApiKeyCache } = await loadAuth()
    process.env = { ...originalEnv, API_KEY: '' }
    invalidateActiveApiKeyCache()
    // Pretend a key is stored in the DB settings table.
    prepareMock.mockImplementation(() => ({
      // settings SELECT returns a stored key; other statements (agent keys) no-op.
      get: vi.fn(() => ({ value: 'db-stored-secret' })),
      run: vi.fn(),
      all: vi.fn(() => []),
    }))
    prepareMock.mockClear()

    // Burst of 10 api-key-authenticated requests within the TTL window.
    for (let i = 0; i < 10; i++) {
      getUserFromRequest(newRequest({ 'x-api-key': 'db-stored-secret' }))
    }

    // First call warms the cache; the remaining 9 must hit the cache.
    expect(settingsSelectCount()).toBe(1)
  })

  it('re-reads the settings value after invalidateActiveApiKeyCache is called (settings write)', async () => {
    const { getUserFromRequest, invalidateActiveApiKeyCache } = await loadAuth()
    process.env = { ...originalEnv, API_KEY: '' }
    invalidateActiveApiKeyCache()
    prepareMock.mockImplementation(() => ({
      get: vi.fn(() => ({ value: 'db-stored-secret' })),
      run: vi.fn(),
      all: vi.fn(() => []),
    }))
    prepareMock.mockClear()

    getUserFromRequest(newRequest({ 'x-api-key': 'db-stored-secret' }))
    expect(settingsSelectCount()).toBe(1)

    // Rotate / settings write -> invalidate -> next request re-reads.
    invalidateActiveApiKeyCache()
    prepareMock.mockClear()
    getUserFromRequest(newRequest({ 'x-api-key': 'db-stored-secret' }))
    expect(settingsSelectCount()).toBe(1)
  })
})
