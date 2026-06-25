import { z } from 'zod'

/**
 * Model-tier contracts (ARD 0026 H8). The trust-root classification for a model id:
 * `frontier | standard | economy`. Config-as-data registry — a `ModelTierSeed` maps the known
 * model ids that the PLATFORM injects at runtime (from `AdminConfig` + model-config); the gate
 * (`isFrontier`) never has to inspect raw ids against a hardcoded table in core.
 *
 * Pure `core/` (layering-guarded: no platform/modules/src-lib imports). The interface IS the test
 * surface — `tierOf()` and `isFrontier()` are pure functions over (modelId, seed?); no DB, no
 * gateway, no side effects. See CONTEXT.md: ModelTier.
 */

/** The three capability tiers (ordered: frontier > standard > economy). */
export const MODEL_TIER = {
  FRONTIER: 'frontier',
  STANDARD: 'standard',
  ECONOMY: 'economy',
} as const

export type ModelTier = (typeof MODEL_TIER)[keyof typeof MODEL_TIER]

export const modelTierSchema = z.enum([
  MODEL_TIER.FRONTIER,
  MODEL_TIER.STANDARD,
  MODEL_TIER.ECONOMY,
])

/**
 * The precise model-id→tier map that the PLATFORM injects. Intentionally not imported from
 * platform here — core stays pure. The platform constructs this from `AdminConfig` + its
 * canonical model-config file and passes it into `tierOf()` / `isFrontier()`.
 */
export type ModelTierSeed = Readonly<Record<string, ModelTier>>
