<!-- agent-context: read this before editing the module -->

# core/secrets

## Purpose
Owns the framework-independent model for a *pointer to a stored secret* — the `SecretReference` domain primitive. It is the root of the opzava dependency graph (no dependencies) and the single contract every layer validates against to reject embedded secrets. Pure zod; no infrastructure.

## Public surface
This is a **core domain** — it has **no `index.ts`** barrel. `contracts.ts` is the public surface (truth: `src/opzava/core/secrets/contracts.ts`). 5 exports, in one group:

- **Contract**
  - `SECRET_REFERENCE_KIND` — the `'SecretReference'` const discriminator.
  - `secretReferenceSchema` — `z.object({ kind, id, scope, purpose }).strict()`.
  - `SecretReference` — `Readonly<z.infer<typeof secretReferenceSchema>>` (a frozen, readonly type alias).

- **Factories / guards**
  - `createSecretReference(input: Omit<SecretReference, 'kind'>): SecretReference`
  - `isSecretReference(value: unknown): value is SecretReference`

`scope` is the closed enum `['provider-credential', 'webhook-secret', 'gateway-credential', 'operator-secret']`. `purpose` is `min(1).max(200)`. Anything not listed here is internal (none currently — both files in this folder are `contracts.ts` and its test).

## Dependencies
- **Outbound**: `zod` only. No `core`, `platform`, `modules`, or `src/lib` imports. This is the **root** of the opzava graph — `docs/architecture/dependency-graph.md` documents it as the node with no incoming-from-below edges; the architecture test enforces "core does not import platform" / "no cross-module internals" (ARD 0010).
- **Inbound** (callers an editor must not silently break):
  - `src/opzava/core/artifacts/contracts.ts:3` — imports `isSecretReference`, uses it in `containsSecretReference` (line 49) to reject any `SecretReference` embedded in artifact `content`.
  - `src/opzava/platform/admin-config/contracts.ts:7,17` — re-exports the full surface and consumes `isSecretReference` for its own no-secret validation (`record.sensitivity === 'secret' && !isSecretReference(record.value)` → `secret config records must store a SecretReference value`) and for `AdminConfigValue` / `adminConfigValueSchema`. The runner/providers/audit layers reach `SecretReference` *through* this re-export, not by importing `core/secrets` directly.

## Invariants
1. **Frozen + readonly by construction.** `createSecretReference` calls `Object.freeze(secretReferenceSchema.parse(...))`; the `SecretReference` type is `Readonly<...>`. A reference is immutable once created — do not introduce a mutating path.
2. **`strict()` object.** `secretReferenceSchema` is `.strict()` — unknown fields are rejected, not stripped (`contracts.test.ts:38-42`). The `extra: 1` parse fails. Do not loosen to `.passthrough()`/strip.
3. **Discriminator required for `isSecretReference` to return true.** The guard parses via the schema, so a structurally-identical object missing `kind: 'SecretReference'` is **not** detected (`contracts.test.ts:24-25`). The discriminator is load-bearing, not cosmetic.
4. **`kind` is stamped by the factory, never caller-supplied.** `createSecretReference` takes `Omit<SecretReference,'kind'>` and injects `SECRET_REFERENCE_KIND` itself — callers cannot forge or mistype the kind. The 4-value `scope` enum and non-empty `id`/`purpose` are enforced by `z` constraints (`contracts.test.ts:30-36`).

## Harmony rules
- **Which engine**: opzava canonical — `src/opzava`. This is pure domain, part of the `src/opzava` engine; it has zero `src/lib` (inherited) coupling. See ARD 0007 and `test/engine-boundary.test.mjs`.
- **Relocation (ARD 0010).** This model was *relocated here from `platform/admin-config`* precisely so `core` stops importing `platform` (the former `core/artifacts → platform/admin-config` leak). `admin-config` now imports `core/secrets` (inward edge) and re-exports it for ~40 existing importers. New code should import `@/opzava/core/secrets/contracts` (canonical); the `@/opzava/platform/admin-config/contracts` re-export remains for compatibility. Do not move it back to platform.
- **Dead-surface / dead-wired warnings**: none. This module has a live consumer (`core/artifacts`) plus a re-export consumer (`admin-config`) — it is *not* dead surface. (No entry in `92-stale-findings.md` targets `core/secrets` specifically.)

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`. The applicable entries are the layering-leak notes, since `core/secrets` is the fix-point of the core→platform realignment:

- **❌→✅ core→platform leak:** `src/opzava/core/artifacts/contracts.ts` imported `isSecretReference` from `platform/admin-config/contracts` — an upward domain→infrastructure edge violating the Dependency Rule. Fixed by relocating the pure `SecretReference` model to `core/secrets` (see the realignment ARD).
- **✅ CONFIRMED — core `WorkflowRun`/`StepRun` machinery is dead surface** — `parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` in `src/opzava/core/workflows/contracts.ts` have **zero production consumers**. *(Adjacent core domain — keep in mind: dead run/step machinery in a sibling does not mean `core/secrets` is unused; this module is the opposite case.)*

No CONFIRMED/PARTIAL/REFUTED entry in `92-stale-findings.md` names `core/secrets` itself. The relocation it triggered is the load-bearing guardrail: **do not reintroduce a `core` → `platform/admin-config` edge for the secret model** (enforced by `src/opzava/architecture.test.ts`).
