<!-- agent-context: read this before editing the module -->

# core/model-tier — Model Capability Tier Registry (ARD 0026 H8)

## Purpose
The trust-root classification for a model id: `frontier | standard | economy`. This is the
**frontier-lock's single source of truth** — the `MainOrchestrator` calls `isFrontier()` to
confirm the orchestrating model is frontier-tier before permitting external-effecting actions.
Config-as-data (a `ModelTierSeed` map) injected by the PLATFORM at call-time; pure `core/` —
no `platform/`, `modules/`, or `src/lib` imports. See CONTEXT.md: ModelTier.

## Public surface
- `contracts.ts` — `MODEL_TIER` const object, `ModelTier` type, `modelTierSchema` (Zod enum),
  `ModelTierSeed` type (`Readonly<Record<string, ModelTier>>`).
- `model-tier.ts` — `tierOf(modelId, seed?): ModelTier` (resolution + heuristic); `isFrontier(modelId, seed?): boolean` (frontier-lock predicate).

## Invariants
1. **Pure `core/`.** No `platform/`, `modules/`, or `src/lib` imports (architecture test). No
   gateway, DB, clock, or side effects. `tierOf()` and `isFrontier()` are pure functions over
   `(modelId, seed?)`.
2. **Unknown ⇒ economy (safe floor).** An unrecognised model id is NEVER accidentally classified
   as frontier. The frontier-lock cannot be defeated by a novel or misspelled model id.
3. **Seed wins unconditionally.** An explicit `seed[modelId]` overrides the family heuristic.
   Operator overrides are carried here by the platform (audited upstream — a tier edit emits a
   `security.event`; that audit lives in platform, not here).
4. **`isFrontier` is the lock predicate.** Callers must use `isFrontier()`, not compare the
   `tierOf()` result directly, to preserve the single enforcement point.
5. **The precise id⇒tier seed is injected by platform, never hardcoded in core.** The family
   heuristic (`opus/sonnet/haiku`) is a fallback for well-known Anthropic model families only.
   Third-party or future model ids must arrive through a seed.

## Editor guardrails
- Do NOT add a `src/lib`/`platform/`/`modules/` import — breaks the layering guard.
- Do NOT hardcode a model-id table here; that is `ModelTierSeed` data owned by the platform.
- Do NOT bypass `isFrontier()` with a direct `tierOf()` === comparison at a lock site — use the
  named predicate so the enforcement point stays singular.
- Do NOT add async variants or side effects; better-sqlite3 is synchronous and these are called
  in the critical gate path.
