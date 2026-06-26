import { describe, expect, it } from 'vitest'

import { MODEL_TIER } from '@/opzava/core/model-tier/contracts'
import { makeAvailabilityResolver, type AvailabilityResolverDeps } from './resolver'

const FRONTIER_REQ = { requiredTier: MODEL_TIER.FRONTIER, workspaceId: 1 }

function deps(over: Partial<AvailabilityResolverDeps> = {}): AvailabilityResolverDeps {
  return {
    getLadderConfig: () => ({ byTier: { frontier: [{ accountProfileId: 'gpt-plus', modelId: 'gpt-frontier' }] } }),
    getProfiles: () => [{ profileId: 'gpt-plus', provider: 'openai', gatewayAgentName: 'lead-orchestrator' }],
    getAuthFlags: () => ({ openai: true }),
    getGatewayLiveness: () => new Map([['lead-orchestrator', { status: 'active' }]]),
    getAtCapProfiles: () => new Set<string>(),
    getHealthSignals: () => new Map<string, 'ok' | 'degraded' | 'outage'>(),
    ...over,
  }
}

describe('makeAvailabilityResolver — gatherer', () => {
  it('assembles live state and delegates → assigned when the account is live', () => {
    const out = makeAvailabilityResolver(deps()).resolve(FRONTIER_REQ)
    expect(out.kind).toBe('assigned')
    if (out.kind === 'assigned') expect(out.rung.accountProfileId).toBe('gpt-plus')
  })

  it('a direct-API account (no gatewayAgentName) is gateway-live even with an empty liveness map', () => {
    const out = makeAvailabilityResolver(
      deps({ getProfiles: () => [{ profileId: 'gpt-plus', provider: 'openai' }], getGatewayLiveness: () => new Map() }),
    ).resolve(FRONTIER_REQ)
    expect(out.kind).toBe('assigned')
  })

  it('an offline gateway agent → not live → frontier halts (never downgrades)', () => {
    const out = makeAvailabilityResolver(
      deps({ getGatewayLiveness: () => new Map([['lead-orchestrator', { status: 'offline' }]]) }),
    ).resolve(FRONTIER_REQ)
    expect(out.kind).toBe('halt')
  })

  it('provider auth false → account down → frontier halts', () => {
    const out = makeAvailabilityResolver(deps({ getAuthFlags: () => ({ openai: false }) })).resolve(FRONTIER_REQ)
    expect(out.kind).toBe('halt')
  })

  it('an at-cap profile is skipped → halt reason is all-accounts-at-cap', () => {
    const out = makeAvailabilityResolver(deps({ getAtCapProfiles: () => new Set(['gpt-plus']) })).resolve(FRONTIER_REQ)
    expect(out).toEqual({ kind: 'halt', reason: 'all-accounts-at-cap' })
  })

  it('a missing health signal defaults to ok (the account stays eligible)', () => {
    const out = makeAvailabilityResolver(deps({ getHealthSignals: () => new Map() })).resolve(FRONTIER_REQ)
    expect(out.kind).toBe('assigned')
  })

  it("an 'outage' health signal makes the account ineligible", () => {
    const out = makeAvailabilityResolver(
      deps({ getHealthSignals: () => new Map([['gpt-plus', 'outage']]) }),
    ).resolve(FRONTIER_REQ)
    expect(out.kind).toBe('halt')
  })

  it('passes the request workspaceId through to getAtCapProfiles', () => {
    let seen = -1
    makeAvailabilityResolver(deps({ getAtCapProfiles: (ws) => { seen = ws; return new Set() } }))
      .resolve({ requiredTier: MODEL_TIER.FRONTIER, workspaceId: 42 })
    expect(seen).toBe(42)
  })
})
