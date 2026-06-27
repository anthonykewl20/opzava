import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireRole = vi.fn()
const fetchMock = vi.fn()

vi.mock('@/lib/auth', () => ({ requireRole }))
vi.mock('@/lib/config', () => ({
  config: {
    gatewayHost: 'mc-openclaw-gateway',
    gatewayPort: 18789,
  },
}))

const fakeRequest = () => new Request('http://localhost/api/openclaw/doctor')

describe('GET /api/openclaw/doctor - Docker sidecar health', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    requireRole.mockReturnValue({ user: { id: 1, username: 'admin', role: 'admin', workspace_id: 1 } })
    delete process.env.NEXT_PUBLIC_GATEWAY_OPTIONAL
    delete process.env.OPENCLAW_ENABLED
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('reports healthy-disabled when the sidecar is not enabled', async () => {
    const { GET } = await import('@/app/api/openclaw/doctor/route')

    const res = await GET(fakeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.healthy).toBe(true)
    expect(body.summary).toMatch(/sidecar is disabled/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('probes the Docker sidecar health endpoint when enabled', async () => {
    process.env.OPENCLAW_ENABLED = '1'
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))

    const { GET } = await import('@/app/api/openclaw/doctor/route')

    const res = await GET(fakeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.healthy).toBe(true)
    expect(body.summary).toMatch(/sidecar is healthy/i)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://mc-openclaw-gateway:18789/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('reports a warning when the enabled sidecar is unreachable', async () => {
    process.env.OPENCLAW_ENABLED = '1'
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const { GET } = await import('@/app/api/openclaw/doctor/route')

    const res = await GET(fakeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.healthy).toBe(false)
    expect(body.level).toBe('warning')
    expect(body.issues.join('\n')).toMatch(/OPENCLAW_ENABLED=1 make up openclaw/i)
  })

  it('rejects unauthenticated requests before probing the sidecar', async () => {
    requireRole.mockReturnValue({ error: 'Unauthorized', status: 401 })

    const { GET } = await import('@/app/api/openclaw/doctor/route')

    const res = await GET(fakeRequest())
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects local doctor fixes because OpenClaw is Docker-managed', async () => {
    process.env.OPENCLAW_ENABLED = '1'

    const { POST } = await import('@/app/api/openclaw/doctor/route')

    const res = await POST(fakeRequest())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Docker-managed/i)
    expect(body.detail).toMatch(/doctor --fix is disabled/i)
  })
})
