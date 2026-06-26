import { describe, expect, it } from 'vitest'

import { MODEL_TIER, type ModelTierSeed } from '../../model-tier/contracts'
import type { AccountLiveState, AvailabilityLadderConfig, LadderRung } from './contracts'
import { resolveAvailability, validateLadderConfig } from './resolve'

// ── helpers ──────────────────────────────────────────────────────────────────
const live = (over: Partial<AccountLiveState> = {}): AccountLiveState => ({
  authenticated: true, gatewayLive: true, atCap: false, health: 'ok', ...over,
})
const liveMap = (entries: Record<string, AccountLiveState>) =>
  new Map<string, AccountLiveState>(Object.entries(entries))
const rung = (accountProfileId: string, modelId = `${accountProfileId}-m`, label?: string): LadderRung =>
  ({ accountProfileId, modelId, label })

describe('resolveAvailability', () => {
  // AC1
  it('AC1: frontier happy path → assigned the first live frontier rung (rungIndex 0)', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { frontier: [rung('gpt-plus')] } }
    const out = resolveAvailability({ requiredTier: MODEL_TIER.FRONTIER, workspaceId: 1 }, cfg, liveMap({ 'gpt-plus': live() }))
    expect(out.kind).toBe('assigned')
    if (out.kind === 'assigned') {
      expect(out.rung.accountProfileId).toBe('gpt-plus')
      expect(out.rung.rungIndex).toBe(0)
    }
  })

  // AC2 — never downgrade
  it('AC2: frontier exhausted → halt; NEVER falls to a lower-tier ladder', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { frontier: [rung('gpt-plus')], standard: [rung('cheap')] } }
    const out = resolveAvailability(
      { requiredTier: MODEL_TIER.FRONTIER, workspaceId: 1 }, cfg,
      liveMap({ 'gpt-plus': live({ authenticated: false }), cheap: live() }), // standard rung is live but must NOT be used
    )
    expect(out.kind).toBe('halt')
  })

  // AC3
  it('AC3: worker ladder walks external → in-family (first eligible wins, rungIndex 1)', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { standard: [rung('external'), rung('in-family')] } }
    const out = resolveAvailability(
      { requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg,
      liveMap({ external: live({ health: 'outage' }), 'in-family': live() }),
    )
    expect(out.kind).toBe('assigned')
    if (out.kind === 'assigned') {
      expect(out.rung.accountProfileId).toBe('in-family')
      expect(out.rung.rungIndex).toBe(1)
    }
  })

  // AC4
  it('AC4: worker exhausted → queue; NEVER halt', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { standard: [rung('a'), rung('b')] } }
    const out = resolveAvailability(
      { requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg,
      liveMap({ a: live({ authenticated: false }), b: live({ gatewayLive: false }) }),
    )
    expect(out.kind).toBe('queue')
  })

  // AC5 — terminus is derived from tier, not config
  it('AC5: identical exhausted ladder → halt when frontier, queue when standard', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { frontier: [rung('x')], standard: [rung('x')] } }
    const dead = liveMap({ x: live({ health: 'outage' }) })
    expect(resolveAvailability({ requiredTier: MODEL_TIER.FRONTIER, workspaceId: 1 }, cfg, dead).kind).toBe('halt')
    expect(resolveAvailability({ requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg, dead).kind).toBe('queue')
  })

  // AC6 — eligibility predicates
  it('AC6: outage/auth/atCap/missing are skipped; degraded is selected (accountHealth: degraded)', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { economy: [rung('a'), rung('b'), rung('c'), rung('d'), rung('e')] } }
    const out = resolveAvailability(
      { requiredTier: MODEL_TIER.ECONOMY, workspaceId: 1 }, cfg,
      liveMap({
        a: live({ health: 'outage' }),
        b: live({ authenticated: false }),
        c: live({ atCap: true }),
        // d: missing from the map entirely
        e: live({ health: 'degraded' }),
      }),
    )
    expect(out.kind).toBe('assigned')
    if (out.kind === 'assigned') {
      expect(out.rung.accountProfileId).toBe('e')
      expect(out.rung.accountHealth).toBe('degraded')
    }
  })

  // AC7
  it('AC7: no ladder for the slot → not-configured (halt if frontier, queue if worker)', () => {
    const cfg: AvailabilityLadderConfig = { byTier: {} }
    expect(resolveAvailability({ requiredTier: MODEL_TIER.FRONTIER, workspaceId: 1 }, cfg, new Map()))
      .toEqual({ kind: 'halt', reason: 'not-configured' })
    expect(resolveAvailability({ requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg, new Map()))
      .toEqual({ kind: 'queue', reason: 'not-configured' })
  })

  // AC8
  it('AC8: byCategory[cat][tier] overrides byTier[tier]', () => {
    const cfg: AvailabilityLadderConfig = {
      byTier: { standard: [rung('tier-default')] },
      byCategory: { writing: { standard: [rung('writing-model')] } },
    }
    const out = resolveAvailability(
      { requiredTier: MODEL_TIER.STANDARD, taskCategory: 'writing', workspaceId: 1 }, cfg,
      liveMap({ 'tier-default': live(), 'writing-model': live() }),
    )
    expect(out.kind === 'assigned' && out.rung.accountProfileId).toBe('writing-model')
  })

  // AC9 — reason discrimination
  it('AC9: all rungs at-cap → *-at-cap; any down → *-down', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { standard: [rung('a'), rung('b')] } }
    const atCap = resolveAvailability(
      { requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg,
      liveMap({ a: live({ atCap: true }), b: live({ atCap: true }) }),
    )
    expect(atCap).toEqual({ kind: 'queue', reason: 'all-rungs-at-cap' })
    const down = resolveAvailability(
      { requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg,
      liveMap({ a: live({ authenticated: false }), b: live({ atCap: true }) }),
    )
    expect(down).toEqual({ kind: 'queue', reason: 'all-rungs-down' })
  })

  // AC10 — single-account = same code path (external rung simply absent)
  it('AC10: single-account config (one in-family rung) resolves through the identical path', () => {
    const cfg: AvailabilityLadderConfig = { byTier: { standard: [rung('only-account')] } }
    const out = resolveAvailability({ requiredTier: MODEL_TIER.STANDARD, workspaceId: 1 }, cfg, liveMap({ 'only-account': live() }))
    expect(out.kind === 'assigned' && out.rung.rungIndex).toBe(0)
  })
})

describe('validateLadderConfig', () => {
  const seed: ModelTierSeed = { 'frontier-m': MODEL_TIER.FRONTIER, 'econo-m': MODEL_TIER.ECONOMY }
  const known = new Set(['gpt-plus', 'cheap'])

  // AC12
  it('AC12: flags unknown profile, a model below the slot tier, and an empty frontier ladder', () => {
    const cfg: AvailabilityLadderConfig = {
      byTier: {
        frontier: [{ accountProfileId: 'ghost', modelId: 'frontier-m' }], // unknown profile
        standard: [{ accountProfileId: 'cheap', modelId: 'econo-m' }],     // econo model under a standard slot
      },
      byCategory: { writing: { frontier: [] } }, // empty frontier ladder
    }
    const r = validateLadderConfig(cfg, known, seed)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes("unknown accountProfileId 'ghost'"))).toBe(true)
    expect(r.errors.some((e) => e.includes('below the standard slot'))).toBe(true)
    expect(r.errors.some((e) => e.includes('frontier ladder is empty'))).toBe(true)
  })

  it('AC12: a well-formed config validates clean', () => {
    const cfg: AvailabilityLadderConfig = {
      byTier: { frontier: [{ accountProfileId: 'gpt-plus', modelId: 'frontier-m' }], standard: [{ accountProfileId: 'cheap', modelId: 'frontier-m' }] },
    }
    expect(validateLadderConfig(cfg, known, seed)).toEqual({ valid: true, errors: [] })
  })
})
