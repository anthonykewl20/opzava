import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyWebhookSignature,
  nextRetryDelay,
  isBlockedWebhookUrl,
  deliverWebhookPublic,
} from '../webhooks'

describe('verifyWebhookSignature', () => {
  const secret = 'test-secret-key-1234'
  const body = '{"event":"test.ping","timestamp":1700000000,"data":{"message":"hello"}}'

  it('returns true for a correct signature', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    expect(verifyWebhookSignature(secret, body, sig)).toBe(true)
  })

  it('returns false for a wrong signature', () => {
    const wrongSig = `sha256=${createHmac('sha256', 'wrong-secret').update(body).digest('hex')}`
    expect(verifyWebhookSignature(secret, body, wrongSig)).toBe(false)
  })

  it('returns false for a tampered body', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    expect(verifyWebhookSignature(secret, body + 'tampered', sig)).toBe(false)
  })

  it('returns false for missing signature header', () => {
    expect(verifyWebhookSignature(secret, body, null)).toBe(false)
    expect(verifyWebhookSignature(secret, body, undefined)).toBe(false)
    expect(verifyWebhookSignature(secret, body, '')).toBe(false)
  })

  it('returns false for empty secret', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    expect(verifyWebhookSignature('', body, sig)).toBe(false)
  })
})

describe('nextRetryDelay', () => {
  // Expected base delays: 30s, 300s, 1800s, 7200s, 28800s
  const expectedBases = [30, 300, 1800, 7200, 28800]

  it('returns delays within ±20% jitter range for each attempt', () => {
    for (let attempt = 0; attempt < expectedBases.length; attempt++) {
      const base = expectedBases[attempt]
      const minExpected = base * 0.8
      const maxExpected = base * 1.2

      // Run multiple times to test jitter randomness
      for (let i = 0; i < 20; i++) {
        const delay = nextRetryDelay(attempt)
        expect(delay).toBeGreaterThanOrEqual(Math.floor(minExpected))
        expect(delay).toBeLessThanOrEqual(Math.ceil(maxExpected))
      }
    }
  })

  it('clamps attempts beyond the backoff array length', () => {
    const lastBase = expectedBases[expectedBases.length - 1]
    const delay = nextRetryDelay(100)
    expect(delay).toBeGreaterThanOrEqual(Math.floor(lastBase * 0.8))
    expect(delay).toBeLessThanOrEqual(Math.ceil(lastBase * 1.2))
  })

  it('returns a rounded integer', () => {
    for (let i = 0; i < 50; i++) {
      const delay = nextRetryDelay(0)
      expect(Number.isInteger(delay)).toBe(true)
    }
  })
})

describe('circuit breaker logic', () => {
  it('consecutive_failures >= maxRetries means circuit is open', () => {
    const maxRetries = 5
    // Simulate the circuit_open derivation used in the API
    const isCircuitOpen = (failures: number) => failures >= maxRetries

    expect(isCircuitOpen(0)).toBe(false)
    expect(isCircuitOpen(3)).toBe(false)
    expect(isCircuitOpen(4)).toBe(false)
    expect(isCircuitOpen(5)).toBe(true)
    expect(isCircuitOpen(10)).toBe(true)
  })
})

describe('isBlockedWebhookUrl (SSRF classification)', () => {
  // Loopback
  it.each([
    'http://127.0.0.1/x',
    'http://127.1.2.3/x',
    'http://localhost/x',
    'http://[::1]/x',
    'http://[::ffff:127.0.0.1]/x', // IPv4-mapped IPv6 → canonicalized to ::ffff:7f00:1 (B4 fix)
    'http://0.0.0.0/x',
  ])('blocks loopback %s', (url) => {
    expect(isBlockedWebhookUrl(url)).toBe(true)
  })

  // Link-local + cloud metadata
  it.each([
    'http://169.254.169.254/latest/meta-data',
    'http://169.254.170.2/x',
    'http://metadata.google.internal/x',
    'http://[::ffff:169.254.169.254]/latest/meta-data', // IPv4-mapped metadata (B4 fix)
  ])('blocks link-local / metadata %s', (url) => {
    expect(isBlockedWebhookUrl(url)).toBe(true)
  })

  // RFC1918 / private
  it.each([
    'http://10.0.0.1/x',
    'http://172.16.0.1/x',
    'http://172.31.255.255/x',
    'http://192.168.1.1/x',
  ])('blocks private RFC1918 %s', (url) => {
    expect(isBlockedWebhookUrl(url)).toBe(true)
  })

  // Encoded IP forms must not bypass the check
  it.each([
    'http://2130706433/x', // decimal 127.0.0.1
    'http://0x7f000001/x', // hex 127.0.0.1
    'http://0177.0.0.1/x', // octal 127.0.0.1
  ])('blocks encoded-IP loopback %s', (url) => {
    expect(isBlockedWebhookUrl(url)).toBe(true)
  })

  it.each(['https://example.com/hook', 'https://1.1.1.1/hook'])(
    'allows public %s',
    (url) => {
      expect(isBlockedWebhookUrl(url)).toBe(false)
    },
  )

  it('rejects non-http(s) schemes as blocked', () => {
    expect(isBlockedWebhookUrl('file:///etc/passwd')).toBe(true)
    expect(isBlockedWebhookUrl('gopher://x')).toBe(true)
  })

  it('allows a blocked host when present in the allowlist env', () => {
    const prev = process.env.MC_WEBHOOK_ALLOW_PRIVATE
    process.env.MC_WEBHOOK_ALLOW_PRIVATE = '10.0.0.1'
    try {
      expect(isBlockedWebhookUrl('http://10.0.0.1/x')).toBe(false)
      // Other private addresses still blocked
      expect(isBlockedWebhookUrl('http://192.168.1.1/x')).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.MC_WEBHOOK_ALLOW_PRIVATE
      else process.env.MC_WEBHOOK_ALLOW_PRIVATE = prev
    }
  })
})

describe('deliverWebhookPublic SSRF protection', () => {
  const fetchMock = vi.fn()
  const warnSpy = vi.fn()
  let dbPrepare: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    dbPrepare = vi.fn(() => ({
      run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
      get: vi.fn().mockReturnValue({ consecutive_failures: 0 }),
      all: vi.fn().mockReturnValue([]),
    })) as ReturnType<typeof vi.fn>

    vi.doMock('@/lib/db', () => ({
      getDatabase: () => ({ prepare: dbPrepare }),
    }))
    vi.doMock('@/lib/logger', () => ({
      logger: { error: vi.fn(), warn: warnSpy, info: vi.fn() },
    }))
    vi.doMock('@/lib/event-bus', () => ({ eventBus: { on: vi.fn() }, type: '' }))
  })

  // Re-import after the mocks above are registered so the module picks up the
  // stubbed logger/db rather than the real ones captured by the top-level import.
  async function loadDeliver() {
    const mod = await import('../webhooks')
    return mod.deliverWebhookPublic
  }

  afterEach(() => {
    vi.doUnmock('@/lib/db')
    vi.doUnmock('@/lib/logger')
    vi.doUnmock('@/lib/event-bus')
    vi.unstubAllGlobals()
  })

  it('blocks a loopback URL at fetch time and does not call fetch', async () => {
    const deliver = await loadDeliver()
    const webhook = {
      id: 1,
      name: 'h',
      url: 'http://127.0.0.1:9999/secret',
      secret: null,
      events: '["*"]',
      enabled: 1,
      workspace_id: 1,
    }

    const result = await deliver(webhook as any, 'test.ping', {})

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.status_code).toBeNull()
    expect(result.error).toMatch(/internal|private|blocked|SSRF/i)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('blocks a cloud-metadata URL at fetch time and does not call fetch', async () => {
    const deliver = await loadDeliver()
    const webhook = {
      id: 2,
      name: 'h',
      url: 'http://169.254.169.254/latest/meta-data/',
      secret: null,
      events: '["*"]',
      enabled: 1,
      workspace_id: 1,
    }

    const result = await deliver(webhook as any, 'test.ping', {})

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/internal|private|blocked|SSRF/i)
  })
})
