import { MODEL_TIER, type ModelTier, type ModelTierSeed } from './contracts'

/**
 * `tierOf()` — resolve a model id to its `ModelTier`. Pure: (modelId, seed?) → tier; no side
 * effects. Resolution order (trust root for ARD 0026 H8):
 *   1. Explicit `seed[modelId]` — operator-injected override wins unconditionally.
 *   2. Family heuristic on the id string: `opus` ⇒ frontier, `sonnet` ⇒ standard, `haiku` ⇒ economy.
 *   3. Default `ECONOMY` — the safe floor: an unknown model is NEVER accidentally frontier.
 *
 * The seed is injected by the platform (from `AdminConfig` + model-config) at call-time; it is
 * never imported here so this module stays pure `core/`.
 */
export function tierOf(modelId: string, seed?: ModelTierSeed): ModelTier {
  // 1. Explicit seed override wins.
  if (seed !== undefined) {
    const override = seed[modelId]
    if (override !== undefined) return override
  }

  // 2. Family heuristic — substring match on the lowercased id.
  const id = modelId.toLowerCase()
  if (id.includes('opus')) return MODEL_TIER.FRONTIER
  if (id.includes('sonnet')) return MODEL_TIER.STANDARD
  if (id.includes('haiku')) return MODEL_TIER.ECONOMY

  // 3. Safe floor — unknown models must never be accidentally frontier.
  return MODEL_TIER.ECONOMY
}

/**
 * `isFrontier()` — the frontier-lock predicate (ARD 0026 H8). Returns `true` iff the model
 * resolves to `frontier` tier. Safe-floor guarantee: an unknown model always returns `false`.
 * The `MainOrchestrator` calls this to enforce the frontier-lock; callers must not bypass it by
 * reading `tierOf()` directly with a custom comparison.
 */
export function isFrontier(modelId: string, seed?: ModelTierSeed): boolean {
  return tierOf(modelId, seed) === MODEL_TIER.FRONTIER
}
