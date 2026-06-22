import { describe, it, expect } from 'vitest'
import {
  evaluateDirectConnectionHealth,
  evaluateProviderReadiness,
  DIRECT_CONNECTION_STALE_SECONDS,
} from '@/lib/connectivity-health'

describe('evaluateDirectConnectionHealth', () => {
  const now = 1_000_000

  it('is healthy with no connections', () => {
    const r = evaluateDirectConnectionHealth([], now, 120)
    expect(r.name).toBe('Direct Connections')
    expect(r.status).toBe('healthy')
    expect(r.message).toMatch(/no active/i)
  })

  it('ignores disconnected rows (a disconnected stale row is not a warning)', () => {
    const r = evaluateDirectConnectionHealth(
      [{ status: 'disconnected', last_heartbeat: now - 10_000 }],
      now,
      120,
    )
    expect(r.status).toBe('healthy')
    expect(r.message).toMatch(/no active/i)
  })

  it('is healthy when all connected rows have a fresh heartbeat', () => {
    const r = evaluateDirectConnectionHealth(
      [
        { status: 'connected', last_heartbeat: now - 5 },
        { status: 'connected', last_heartbeat: now - 119 },
      ],
      now,
      120,
    )
    expect(r.status).toBe('healthy')
    expect(r.detail).toEqual({ active: 2, stale: 0 })
  })

  it('warns when a connected row has not heart-beat within the threshold', () => {
    const r = evaluateDirectConnectionHealth(
      [
        { status: 'connected', last_heartbeat: now - 5 },
        { status: 'connected', last_heartbeat: now - 121 },
      ],
      now,
      120,
    )
    expect(r.status).toBe('warning')
    expect(r.detail).toEqual({ active: 2, stale: 1 })
    expect(r.message).toMatch(/stale/i)
  })

  it('treats a null heartbeat (registered, never beat) as stale', () => {
    const r = evaluateDirectConnectionHealth(
      [{ status: 'connected', last_heartbeat: null }],
      now,
      120,
    )
    expect(r.status).toBe('warning')
    expect(r.detail).toEqual({ active: 1, stale: 1 })
  })

  it('exports a sensible default stale threshold (> recommended 30s heartbeat)', () => {
    expect(DIRECT_CONNECTION_STALE_SECONDS).toBeGreaterThan(30)
  })
})

describe('evaluateProviderReadiness', () => {
  it('is healthy when every configured provider is ready', () => {
    const r = evaluateProviderReadiness([
      { provider: 'resend', ok: true },
      { provider: 'wordpress', ok: true },
    ])
    expect(r.name).toBe('Provider Connectivity')
    expect(r.status).toBe('healthy')
    expect(r.message).toMatch(/ready/i)
  })

  it('treats an unconfigured provider as healthy (a provider may be unused)', () => {
    const r = evaluateProviderReadiness([
      { provider: 'resend', ok: false, reason: 'from-address-missing' },
      { provider: 'wordpress', ok: false, reason: 'site-url-missing' },
    ])
    expect(r.status).toBe('healthy')
    expect(r.message).toMatch(/not configured/i)
  })

  it('warns when a provider is configured but its secret is unavailable', () => {
    const r = evaluateProviderReadiness([
      { provider: 'resend', ok: false, reason: 'secret-unavailable' },
      { provider: 'wordpress', ok: true },
    ])
    expect(r.status).toBe('warning')
    expect(r.message).toMatch(/resend/i)
    expect(r.message).toMatch(/secret/i)
  })

  it('reports per-provider readiness in the detail', () => {
    const r = evaluateProviderReadiness([
      { provider: 'resend', ok: true },
      { provider: 'wordpress', ok: false, reason: 'secret-unavailable' },
    ])
    expect(r.detail).toEqual({
      resend: 'ready',
      wordpress: 'misconfigured',
    })
  })

  it('is healthy with no providers passed', () => {
    const r = evaluateProviderReadiness([])
    expect(r.status).toBe('healthy')
  })
})
