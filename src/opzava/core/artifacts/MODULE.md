<!-- agent-context: read this before editing the module -->

# core/artifacts

## Purpose
Defines the versioned, immutable contract for an Opzava **Artifact** — a self-describing, lineage-traced JSON payload produced by a workflow step. Owns the schema, the freeze-on-parse factory, and the two cross-cutting content guards (lineage presence and no secret leakage). This is the widest-fan-out core domain: every feature module that emits step output consumes it.

## Public surface
Core domain — **no `index.ts`**. `contracts.ts` is the public surface and is truth (4 exports):

- `ARTIFACT_CONTRACT_SCHEMA_VERSION` (`1 as const`) — schema version constant.
- `artifactSchema` — the `z.object(...).strict().superRefine(...)` Zod schema (the validation + invariant authority).
- `Artifact` — `Readonly<z.infer<typeof artifactSchema>>` (exported type).
- `parseArtifact(input: unknown): Artifact` — `artifactSchema.parse` + `Object.freeze`; the only construction path.

Internal (not exported): `jsonValueSchema`, the `JsonPrimitive`/`JsonValue` types, and `containsSecretReference`.

Anything not listed here is internal.

## Dependencies
- **Outbound** (what this imports): `core/secrets` only — `isSecretReference` from `../secrets/contracts` (`contracts.ts:3`). `core/secrets` is the root of the opzava graph (no deps), so this module adds no further edges. Core must import core only — the Dependency Rule (`docs/architecture/dependency-graph.md`) forbids `core → platform` / `core → modules`.
- **Inbound** (who imports this): the widest fan-out in core — `modules/content`, `modules/social`, and `modules/general-va` all import `Artifact`/`parseArtifact`/`artifactSchema` to model step output. An editor must not change the exported names or the `strict()` field set without updating all three feature modules.

## Invariants
Read from `contracts.ts` — preserve exactly:

1. **Derived artifacts require lineage.** `artifactSchema.superRefine` (`contracts.ts:33-36`) rejects any artifact whose `lineage.inputArtifactIds` is empty (`'derived artifacts require lineage inputs'`). Every produced artifact must declare ≥1 lineage input; there is no "root artifact" exception in this contract.
2. **Content carries no secrets.** `containsSecretReference` (`contracts.ts:49-63`) is a **recursive** scan over the entire `content` JSON tree (arrays + nested objects), using `isSecretReference` from `core/secrets`. `superRefine` (`contracts.ts:38-40`) rejects the artifact (`'artifact content must not contain secret references'`) if any node matches — at any depth.
3. **Schema is `strict()`.** Both `artifactSchema` and its `validation`/`lineage` sub-objects are `.strict()` — unknown keys are a parse error. `schemaVersion` is pinned to `z.literal(ARTIFACT_CONTRACT_SCHEMA_VERSION)` (currently `1`); bumping it is a versioned migration, not an edit.
4. **Parsed artifacts are frozen.** `parseArtifact` returns `Object.freeze(artifactSchema.parse(input))` (`contracts.ts:45-47`) and the `Artifact` type is `Readonly<...>`. Treat artifacts as immutable post-construction; never hand callers a mutable parse result.

## Harmony rules
- **Engine:** opzava canonical `src/opzava` — this is a pure core domain contract, no inherited-`src/lib` coupling. See ARD 0007 and `test/engine-boundary.test.mjs`.
- **Layering-leak history (corrected):** `core/artifacts/contracts.ts` previously imported `isSecretReference` from `platform/admin-config/contracts` — an upward `core → platform` edge. The `SecretReference` model was relocated to `core/secrets` and the import now points there. Do not reintroduce an import of any `platform/*` or `modules/*` module from here.
- **Dead-surface:** none. Unlike `core/workflows` (whose run/step-run machinery is confirmed dead), `core/artifacts` is fully consumed across all three feature modules — assume a live caller exists on every exported symbol.

## Editor guardrails
Verbatim from `docs/architecture/system-map/92-stale-findings.md` (the entry that applies to this module):

> ## Layering leaks (corrected in the realignment)
>
> Real violations of the declared layering; both fixed.
>
> - **❌→✅ core→platform leak:** `src/opzava/core/artifacts/contracts.ts` imported `isSecretReference`
>   from `platform/admin-config/contracts` — an upward domain→infrastructure edge violating the
>   Dependency Rule. Fixed by relocating the pure `SecretReference` model to `core/secrets` (see the
>   realignment ARD).
