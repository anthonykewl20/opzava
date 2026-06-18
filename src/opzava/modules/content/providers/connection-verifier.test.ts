import { describe, expect, it } from 'vitest'
import {
  verifyWordpressConnection,
  verifyResendConnection,
  type FetchLike
} from './connection-verifier'

describe('connection-verifier', () => {
  const wp = { siteUrl: 'https://blog.example.com', appPassword: 'pw' }
  const resend = { fromAddress: 'a@b.com', apiKey: 're_1' }

  const okFetch: FetchLike = async () => ({ ok: true, status: 200 })
  const authFetch: FetchLike = async () => ({ ok: false, status: 401 })
  const throwFetch: FetchLike = async () => {
    throw new Error('network')
  }

  it('verifies a reachable wordpress site', async () => {
    const r = await verifyWordpressConnection(wp, okFetch)
    expect(r.ok).toBe(true)
  })

  it('reports rejected wordpress credentials', async () => {
    const r = await verifyWordpressConnection(wp, authFetch)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/credential/i)
  })

  it('handles wordpress network failure', async () => {
    const r = await verifyWordpressConnection(wp, throwFetch)
    expect(r.ok).toBe(false)
  })

  it('verifies a valid resend key', async () => {
    const r = await verifyResendConnection(resend, okFetch)
    expect(r.ok).toBe(true)
  })

  it('reports a rejected resend key', async () => {
    const r = await verifyResendConnection(resend, authFetch)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/rejected/i)
  })
})
