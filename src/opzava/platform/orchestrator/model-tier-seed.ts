import { modelTierSchema, type ModelTier, type ModelTierSeed } from '@/opzava/core/model-tier/contracts'

/**
 * `buildModelTierSeed` — the orchestrator's platform-owned `ModelTierSeed` (ARD 0026 GP2 / H8 / S2).
 *
 * The seed is the trust root of the frontier-lock for **third-party / future** model ids — the ones the
 * pure `core/model-tier` family heuristic deliberately does NOT recognise (it covers only well-known
 * Anthropic families: `opus`→frontier, `sonnet`→standard, `haiku`→economy). So the Lead's GPT-Plus
 * frontier model reaches `frontier` tier ONLY through this seed (per `core/model-tier/MODULE.md` inv.5).
 *
 * The GPT frontier model id is **never hardcoded here** — it arrives in `overrides` (operator config,
 * sourced from AdminConfig and audited upstream per H8). This keeps the golden principle (no model
 * choices in source) intact and the design provider-agnostic: the same mechanism elevates a GPT, a GLM,
 * or any future model to frontier purely by config.
 *
 * `overrides` is runtime-untrusted (it originates as AdminConfig JSON), so each value is validated against
 * `modelTierSchema`; an invalid value or blank id is dropped — falling back to the heuristic/safe-floor
 * (a bad override can therefore never *elevate* a model, only fail to, which halts orchestration safely).
 * The result is frozen so the trust-root seed cannot be mutated after construction.
 */
export function buildModelTierSeed(overrides: Readonly<Record<string, ModelTier>> = {}): ModelTierSeed {
  const seed: Record<string, ModelTier> = {}
  for (const [modelId, tier] of Object.entries(overrides)) {
    const parsed = modelTierSchema.safeParse(tier)
    if (modelId.trim() && parsed.success) seed[modelId] = parsed.data
  }
  return Object.freeze(seed)
}
