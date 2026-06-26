import { describe, expect, it, vi } from 'vitest'

import { MODEL_TIER } from '@/opzava/core/model-tier/contracts'
import { isFrontier } from '@/opzava/core/model-tier/model-tier'
import { makeInMemoryProvider } from '@/opzava/platform/execution/in-memory-provider'

import { proposeDecomposition } from './propose-decomposition'
import { buildModelTierSeed } from './model-tier-seed'

// A placeholder GPT frontier id — operators set their real ChatGPT-Plus model id via config.
// The point under test is the MECHANISM (override → frontier), never a specific model name.
const GPT_FRONTIER = 'openai/gpt-frontier'
const card = { id: 9, title: 'Add rate limiting', description: 'throttle the public API' }
const validGraphJson = JSON.stringify({
  steps: [
    { id: 's1', kind: 'dispatch', data: {} },
    { id: 's2', kind: 'review', data: {} },
  ],
  edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
})

describe('buildModelTierSeed', () => {
  it('carries the operator overrides as a frozen seed', () => {
    const seed = buildModelTierSeed({ [GPT_FRONTIER]: MODEL_TIER.FRONTIER })
    expect(seed[GPT_FRONTIER]).toBe(MODEL_TIER.FRONTIER)
    expect(Object.isFrozen(seed)).toBe(true)
  })

  it('returns a frozen empty seed when there are no overrides (Anthropic families use the core heuristic)', () => {
    const seed = buildModelTierSeed()
    expect(Object.keys(seed)).toHaveLength(0)
    expect(Object.isFrozen(seed)).toBe(true)
  })

  it('drops an invalid tier value and a blank id (safe-floor: a bad override can never elevate)', () => {
    const seed = buildModelTierSeed({
      [GPT_FRONTIER]: MODEL_TIER.FRONTIER,
      'bad-model': 'super-frontier' as unknown as typeof MODEL_TIER.FRONTIER,
      '   ': MODEL_TIER.FRONTIER,
    })
    expect(seed[GPT_FRONTIER]).toBe(MODEL_TIER.FRONTIER)
    expect(seed['bad-model']).toBeUndefined()
    expect(seed['   ']).toBeUndefined()
  })

  it('feeds isFrontier: an overridden GPT id resolves frontier; an un-seeded one does not', () => {
    const seed = buildModelTierSeed({ [GPT_FRONTIER]: MODEL_TIER.FRONTIER })
    expect(isFrontier(GPT_FRONTIER, seed)).toBe(true)
    expect(isFrontier('openai/gpt-mini-cheap', seed)).toBe(false) // not seeded, not a Claude family → economy floor
  })
})

describe('frontier-lock live-check (S2) — through proposeDecomposition', () => {
  it('ACCEPTS a GPT model that the platform seed marks frontier', async () => {
    const seed = buildModelTierSeed({ [GPT_FRONTIER]: MODEL_TIER.FRONTIER })
    const outcome = await proposeDecomposition(
      { card, model: GPT_FRONTIER },
      { provider: makeInMemoryProvider(() => ({ text: validGraphJson })), modelTierSeed: seed },
    )
    expect(outcome.kind).toBe('proposed')
  })

  it('REJECTS a non-frontier GPT model (not-frontier) WITHOUT calling the provider', async () => {
    const seed = buildModelTierSeed({ [GPT_FRONTIER]: MODEL_TIER.FRONTIER })
    const invoke = vi.fn(async () => ({ text: validGraphJson }))
    const outcome = await proposeDecomposition(
      { card, model: 'openai/gpt-mini-cheap' }, // un-seeded → economy safe-floor
      { provider: { invoke, isAvailable: () => true }, modelTierSeed: seed },
    )
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') expect(outcome.reason).toBe('not-frontier')
    expect(invoke).not.toHaveBeenCalled()
  })
})
