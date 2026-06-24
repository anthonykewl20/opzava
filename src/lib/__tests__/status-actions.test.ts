import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { STATUS_ACTIONS, getStatusAction } from '@/lib/status-actions'

// The registry mocks the same @/lib/* surface the route does, so handler bodies
// never reach a real DB / network / CLI during these contract assertions.
vi.mock('@/lib/db', () => ({ getDatabase: vi.fn() }))
vi.mock('@/lib/sessions', () => ({ getAllGatewaySessions: vi.fn(() => []), getAgentLiveStatuses: vi.fn(() => []) }))
vi.mock('@/lib/provider-subscriptions', () => ({
  detectProviderSubscriptions: vi.fn(() => ({ active: {} })),
  getPrimarySubscription: vi.fn(() => null),
}))
vi.mock('@/lib/hermes-sessions', () => ({ isHermesInstalled: vi.fn(() => false), scanHermesSessions: vi.fn(() => []) }))
vi.mock('@/lib/gateway-runtime', () => ({ registerMcAsDashboard: vi.fn() }))
vi.mock('@/lib/version', () => ({ APP_VERSION: 'test' }))

describe('status-action registry', () => {
  // The registry is the single source of routed ?action= surfaces. Locking the
  // contract here means adding/removing an action is an intentional, reviewed
  // change — not an accidental edit to the god switch it replaced.
  it('exposes exactly the six routed actions', () => {
    expect(Object.keys(STATUS_ACTIONS).sort()).toEqual(
      ['capabilities', 'dashboard', 'gateway', 'health', 'models', 'overview']
    )
  })

  it('health is the only anonymous action (runs before auth)', () => {
    const anonymous = Object.entries(STATUS_ACTIONS)
      .filter(([, action]) => !action.requiresAuth)
      .map(([name]) => name)
    expect(anonymous).toEqual(['health'])
  })

  it('every action declares requiresAuth and a run function', () => {
    for (const action of Object.values(STATUS_ACTIONS)) {
      expect(typeof action.requiresAuth).toBe('boolean')
      expect(typeof action.run).toBe('function')
    }
  })

  it('getStatusAction resolves known actions and rejects unknown', () => {
    expect(getStatusAction('overview')).toBe(STATUS_ACTIONS.overview)
    expect(getStatusAction('health')?.requiresAuth).toBe(false)
    expect(getStatusAction('nonsense')).toBeUndefined()
    expect(getStatusAction('')).toBeUndefined()
  })

  it('models action envelopes its payload as { models } (preserved contract)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) }),
    )
    const ctx = {
      workspaceId: 1,
      request: new NextRequest('http://localhost/api/status?action=models'),
    }
    const payload = (await STATUS_ACTIONS.models.run(ctx)) as { models: unknown[] }
    expect(payload).toEqual({ models: expect.any(Array) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})
