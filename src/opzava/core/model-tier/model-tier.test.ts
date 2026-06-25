import { describe, expect, it } from 'vitest'

import { MODEL_TIER } from './contracts'
import type { ModelTierSeed } from './contracts'
import { isFrontier, tierOf } from './model-tier'

describe('ModelTier.tierOf — family heuristic', () => {
  it('classifies an opus model as frontier', () => {
    expect(tierOf('claude-opus-4')).toBe(MODEL_TIER.FRONTIER)
  })

  it('classifies a sonnet model as standard', () => {
    expect(tierOf('claude-sonnet-4-6')).toBe(MODEL_TIER.STANDARD)
  })

  it('classifies a haiku model as economy', () => {
    expect(tierOf('claude-haiku-3-5')).toBe(MODEL_TIER.ECONOMY)
  })
})

describe('ModelTier.tierOf — unknown model safe-floor', () => {
  it('returns economy for a completely unknown model id', () => {
    expect(tierOf('totally-unknown-model-xyz')).toBe(MODEL_TIER.ECONOMY)
  })

  it('returns economy for an empty string', () => {
    expect(tierOf('')).toBe(MODEL_TIER.ECONOMY)
  })
})

describe('ModelTier.tierOf — seed override wins over heuristic', () => {
  it('seed entry overrides an opus id to economy', () => {
    const seed: ModelTierSeed = { 'claude-opus-4': MODEL_TIER.ECONOMY }
    expect(tierOf('claude-opus-4', seed)).toBe(MODEL_TIER.ECONOMY)
  })

  it('seed entry overrides a haiku id to frontier', () => {
    const seed: ModelTierSeed = { 'claude-haiku-3-5': MODEL_TIER.FRONTIER }
    expect(tierOf('claude-haiku-3-5', seed)).toBe(MODEL_TIER.FRONTIER)
  })

  it('seed entry for an unknown id overrides the safe-floor economy', () => {
    const seed: ModelTierSeed = { 'gpt-5-turbo': MODEL_TIER.STANDARD }
    expect(tierOf('gpt-5-turbo', seed)).toBe(MODEL_TIER.STANDARD)
  })

  it('a missing seed entry falls back to heuristic (not all seeds are exhaustive)', () => {
    const seed: ModelTierSeed = { 'gpt-4o': MODEL_TIER.STANDARD }
    // claude-sonnet-4-6 not in seed → heuristic → standard
    expect(tierOf('claude-sonnet-4-6', seed)).toBe(MODEL_TIER.STANDARD)
  })
})

describe('ModelTier.isFrontier — frontier-lock predicate', () => {
  it('returns true only for a frontier-tier model', () => {
    expect(isFrontier('claude-opus-4')).toBe(true)
  })

  it('returns false for a standard-tier model', () => {
    expect(isFrontier('claude-sonnet-4-6')).toBe(false)
  })

  it('returns false for an economy-tier model', () => {
    expect(isFrontier('claude-haiku-3-5')).toBe(false)
  })

  it('safe-floor: isFrontier("totally-unknown-model") === false', () => {
    expect(isFrontier('totally-unknown-model')).toBe(false)
  })

  it('seed can elevate a model to frontier and isFrontier returns true', () => {
    const seed: ModelTierSeed = { 'gpt-5': MODEL_TIER.FRONTIER }
    expect(isFrontier('gpt-5', seed)).toBe(true)
  })
})
