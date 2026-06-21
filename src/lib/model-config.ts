/**
 * Model configuration — single source of truth for model IDs and pricing.
 *
 * The project's golden principle bans hardcoded model names/pricing scattered
 * through source (see `docs/golden-principles.md`). This module centralizes the
 * model-id literals and the USD/MTok pricing table that were previously inlined
 * across the inherited `src/lib` dispatch/pricing/template sites.
 *
 * Scope (finding F7, bounded): this file is the SoT for the FOUR core
 * dispatch/pricing sites only —
 *   - `src/lib/agent-templates.ts`  (template primaries + fallback arrays)
 *   - `src/lib/task-dispatch.ts`    (classifyDirectModel routing)
 *   - `src/lib/token-pricing.ts`    (MODEL_PRICING table)
 *   - `src/lib/agent-runtimes.ts`   (AI security-review model)
 * Other inherited sites that still inline model ids/pricing are tracked as debt
 * in `docs/architecture/system-map/90-parity-findings.md` (finding F14) and are
 * intentionally NOT folded in here yet.
 *
 * The governance gate `test/no-hardcoded-models.test.mjs` scans those four files
 * (an explicit allowlist) for Claude model-id literals and fails if any remain,
 * proving they were all moved here. This file is the SoT and is not scanned.
 *
 * IMPORTANT: values here are byte-identical to the literals they replaced — this
 * is a pure refactor. Do not change ids or prices without updating the pricing
 * source of record and the related callers.
 */

// ---------------------------------------------------------------------------
// Model IDs — agent dispatch / templates
// ---------------------------------------------------------------------------

/** Bare model id returned by `classifyDirectModel` for complex/large tasks. */
export const DISPATCH_MODEL_COMPLEX = 'claude-opus-4-6'
/** Bare model id returned by `classifyDirectModel` for routine tasks. */
export const DISPATCH_MODEL_ROUTINE = 'claude-haiku-4-5-20251001'
/** Bare model id returned by `classifyDirectModel` as the default. */
export const DISPATCH_MODEL_DEFAULT = 'claude-sonnet-4-6'

/** Model used for the AI security review of downloaded installer scripts. */
export const AI_REVIEW_MODEL = 'claude-sonnet-4-20250514'

// Provider-prefixed ids used as agent template primaries.
export const TEMPLATE_PRIMARY_OPUS = 'anthropic/claude-opus-4-5'
export const TEMPLATE_PRIMARY_SONNET = 'anthropic/claude-sonnet-4-20250514'
export const TEMPLATE_PRIMARY_HAIKU = 'anthropic/claude-haiku-4-5'

// Fallback model chains by template tier. Preserved verbatim, including the
// non-Anthropic entries, so downstream behavior is unchanged.
export const SONNET_FALLBACKS = [
  'openrouter/anthropic/claude-sonnet-4',
  'moonshot/kimi-k2-thinking',
  'openrouter/moonshotai/kimi-k2.5',
  'nvidia/moonshotai/kimi-k2-instruct',
  'openai/codex-mini-latest',
  'ollama/qwen2.5-coder:14b',
]

export const OPUS_FALLBACKS = [
  'anthropic/claude-sonnet-4-20250514',
  'moonshot/kimi-k2-thinking',
  'nvidia/moonshotai/kimi-k2-instruct',
  'openrouter/moonshotai/kimi-k2.5',
  'openai/codex-mini-latest',
]

export const HAIKU_FALLBACKS = [
  'anthropic/claude-sonnet-4-20250514',
  'ollama/qwen2.5-coder:14b',
  'openai/codex-mini-latest',
]

// ---------------------------------------------------------------------------
// Pricing table — token-pricing.ts MODEL_PRICING source of truth
// ---------------------------------------------------------------------------

export interface ModelPricing {
  inputPerMTok: number
  outputPerMTok: number
}

/**
 * Per-model USD/MTok pricing. Verified 2026-05 against
 * platform.claude.com/docs/en/about-claude/pricing:
 *   Opus 4.5/4.6/4.7 = $5/$25 (only the older Opus 4.1/4 line is $15/$75);
 *   Haiku 4.5 = $1/$5 (Haiku 3.5 retired stays $0.80/$4); Sonnet 4.x = $3/$15.
 * For non-Anthropic models where only one published blended estimate exists, the
 * same rate is applied for both input and output.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'anthropic/claude-3-5-haiku-latest': { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  'anthropic/claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'anthropic/claude-haiku-4-5-20251001': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'anthropic/claude-opus-4-1-20250805': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'anthropic/claude-opus-4-20250514': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'anthropic/claude-opus-4-5': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'anthropic/claude-opus-4-5-20251101': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'anthropic/claude-opus-4-6': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'anthropic/claude-opus-4-7': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'anthropic/claude-sonnet-4-20250514': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'anthropic/claude-sonnet-4-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'anthropic/claude-sonnet-4-5-20250929': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'anthropic/claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-3-5-haiku': { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  'claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'claude-opus-4-1-20250805': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-opus-4-20250514': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-opus-4-5': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'claude-opus-4-5-20251101': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'claude-opus-4-6': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'claude-opus-4-7': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'claude-sonnet-4': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-20250514': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-5-20250929': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0 },

  'groq/llama-3.1-8b-instant': { inputPerMTok: 0.05, outputPerMTok: 0.05 },
  'groq/llama-3.3-70b-versatile': { inputPerMTok: 0.59, outputPerMTok: 0.59 },
  'minimax/minimax-m2.1': { inputPerMTok: 0.3, outputPerMTok: 0.3 },
  'moonshot/kimi-k2.5': { inputPerMTok: 1.0, outputPerMTok: 1.0 },
  'ollama/deepseek-r1:14b': { inputPerMTok: 0.0, outputPerMTok: 0.0 },
  'ollama/qwen2.5-coder:14b': { inputPerMTok: 0.0, outputPerMTok: 0.0 },
  'ollama/qwen2.5-coder:7b': { inputPerMTok: 0.0, outputPerMTok: 0.0 },
  'venice/llama-3.3-70b': { inputPerMTok: 0.7, outputPerMTok: 2.8 },
}
