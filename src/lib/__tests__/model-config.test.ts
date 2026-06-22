import { describe, expect, it } from 'vitest'
import {
  DISPATCH_MODEL_COMPLEX,
  DISPATCH_MODEL_ROUTINE,
  DISPATCH_MODEL_DEFAULT,
  AI_REVIEW_MODEL,
  TEMPLATE_PRIMARY_OPUS,
  TEMPLATE_PRIMARY_SONNET,
  TEMPLATE_PRIMARY_HAIKU,
  SONNET_FALLBACKS,
  OPUS_FALLBACKS,
  HAIKU_FALLBACKS,
  MODEL_PRICING,
  MODEL_CLAUDE_HAIKU_4_5,
  MODEL_CLAUDE_SONNET_4_5,
  MODEL_ANTHROPIC_SONNET_4_6,
  MODEL_ANTHROPIC_OPUS_4_6,
  MODEL_ANTHROPIC_HAIKU_3_5_LATEST,
} from '@/lib/model-config'

// model-config.ts is the source of truth for the four F7 dispatch/pricing sites.
// Its values are pure data (module-level constants), so a mutation-testing tool
// that switches mutants at call time cannot flag a changed literal — these direct
// assertions are the regression guard against an accidental edit to the SoT.
describe('model-config dispatch + template ids', () => {
  it('pins the bare dispatch model ids', () => {
    expect(DISPATCH_MODEL_COMPLEX).toBe('claude-opus-4-6')
    expect(DISPATCH_MODEL_ROUTINE).toBe('claude-haiku-4-5-20251001')
    expect(DISPATCH_MODEL_DEFAULT).toBe('claude-sonnet-4-6')
  })

  it('pins the AI security-review model', () => {
    expect(AI_REVIEW_MODEL).toBe('claude-sonnet-4-20250514')
  })

  it('pins the provider-prefixed template primaries', () => {
    expect(TEMPLATE_PRIMARY_OPUS).toBe('anthropic/claude-opus-4-5')
    expect(TEMPLATE_PRIMARY_SONNET).toBe('anthropic/claude-sonnet-4-20250514')
    expect(TEMPLATE_PRIMARY_HAIKU).toBe('anthropic/claude-haiku-4-5')
  })

  it('pins the F14 catalog/UI model ids (folded from inherited sites)', () => {
    expect(MODEL_CLAUDE_HAIKU_4_5).toBe('claude-haiku-4-5')
    expect(MODEL_CLAUDE_SONNET_4_5).toBe('claude-sonnet-4-5')
    expect(MODEL_ANTHROPIC_SONNET_4_6).toBe('anthropic/claude-sonnet-4-6')
    expect(MODEL_ANTHROPIC_OPUS_4_6).toBe('anthropic/claude-opus-4-6')
    expect(MODEL_ANTHROPIC_HAIKU_3_5_LATEST).toBe('anthropic/claude-3-5-haiku-latest')
  })

  it('pins the per-tier fallback chains (order matters)', () => {
    expect(SONNET_FALLBACKS).toEqual([
      'openrouter/anthropic/claude-sonnet-4',
      'moonshot/kimi-k2-thinking',
      'openrouter/moonshotai/kimi-k2.5',
      'nvidia/moonshotai/kimi-k2-instruct',
      'openai/codex-mini-latest',
      'ollama/qwen2.5-coder:14b',
    ])
    expect(OPUS_FALLBACKS).toEqual([
      'anthropic/claude-sonnet-4-20250514',
      'moonshot/kimi-k2-thinking',
      'nvidia/moonshotai/kimi-k2-instruct',
      'openrouter/moonshotai/kimi-k2.5',
      'openai/codex-mini-latest',
    ])
    expect(HAIKU_FALLBACKS).toEqual([
      'anthropic/claude-sonnet-4-20250514',
      'ollama/qwen2.5-coder:14b',
      'openai/codex-mini-latest',
    ])
  })
})

describe('model-config pricing table', () => {
  it('encodes the documented Anthropic tier rates (USD/MTok)', () => {
    // Opus 4.5+ is $5/$25; the older Opus 4.1/4 line stays $15/$75.
    expect(MODEL_PRICING['claude-opus-4-6']).toEqual({ inputPerMTok: 5.0, outputPerMTok: 25.0 })
    expect(MODEL_PRICING['claude-opus-4-7']).toEqual({ inputPerMTok: 5.0, outputPerMTok: 25.0 })
    expect(MODEL_PRICING['claude-opus-4-20250514']).toEqual({ inputPerMTok: 15.0, outputPerMTok: 75.0 })
    // Sonnet 4.x = $3/$15, Haiku 4.5 = $1/$5, retired Haiku 3.5 = $0.80/$4.
    expect(MODEL_PRICING['claude-sonnet-4-6']).toEqual({ inputPerMTok: 3.0, outputPerMTok: 15.0 })
    expect(MODEL_PRICING['claude-haiku-4-5']).toEqual({ inputPerMTok: 1.0, outputPerMTok: 5.0 })
    expect(MODEL_PRICING['claude-3-5-haiku']).toEqual({ inputPerMTok: 0.8, outputPerMTok: 4.0 })
  })

  it('keeps bare and anthropic/-prefixed ids at identical rates', () => {
    for (const bare of ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
      expect(MODEL_PRICING[`anthropic/${bare}`]).toEqual(MODEL_PRICING[bare])
    }
  })

  it('has non-negative input/output rates for every entry', () => {
    for (const [model, rate] of Object.entries(MODEL_PRICING)) {
      expect(rate.inputPerMTok, model).toBeGreaterThanOrEqual(0)
      expect(rate.outputPerMTok, model).toBeGreaterThanOrEqual(0)
    }
  })
})
