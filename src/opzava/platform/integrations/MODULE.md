<!-- agent-context: read this before editing the module -->

# platform/integrations

## Purpose
Owns the integration **read domain** that previously lived inside the `src/app/api/integrations/route.ts`
HTTP boundary: the integration catalog (`INTEGRATIONS[]`) + category metadata, the `.env` line model
(parse/serialize), and the **security-sensitive** redaction / blocked-var / effective-value /
configured-check logic. Extracted so these rules — which prevent secret leakage in API responses and
gate which env vars may be written — have a single owner and a direct test surface, instead of being
untested inside a 1017-line route.

This is the read/registry half. The probe logic (`op whoami`, `which`, ollama reachability) and the
write path (`.env` mutation, `handleTest`, `handlePull`) remain in the route for now (later sub-slices).

## Public surface
Platform module — no `index.ts`; the files are truth.

**`registry.ts`** (pure data + types):
- `type BuiltinCategory`, `interface IntegrationDef`.
- `INTEGRATIONS: IntegrationDef[]` — the catalog (id/name/category/envVars/vaultItem/testable/recommendation).
- `CATEGORIES: Record<string, { label; order }>` — category display metadata.

**`env-read.ts`** (pure logic + a port-injected factory):
- `interface EnvLine` — the `.env` line model (`comment | blank | var`).
- `BLOCKED_VARS`, `BLOCKED_PREFIXES` — the write-blocked env-var policy (security).
- `parseEnv(content): EnvLine[]`, `serializeEnv(lines): string` — lossless `.env` round-trip.
- `redactValue(value): string` — secret masking for display (≤4 chars → `****`; else last 4).
- `isVarBlocked(key): boolean`, `isPathLikeEnvVar(key): boolean`.
- `interface EnvReaderDeps { processEnv; exists }`, `createEnvReader(deps)` →
  `{ getEffectiveEnvValue(envMap, key); isConfiguredValue(key, value) }`.

## Dependencies
- **NO `@/lib` imports (Engine-B purity).** `process.env` and `existsSync` enter as injected ports via
  `createEnvReader`; the route constructs the reader with the real `process.env` / `existsSync`. Enforced
  by `test/engine-boundary.test.mjs` + `src/opzava/architecture.test.ts`.
- **Inbound** (do not silently break): `src/app/api/integrations/route.ts` — the sole caller (imports the
  registry + the pure helpers + `createEnvReader`).

## Invariants
1. **Redaction is load-bearing for security.** `redactValue` masks everything but the last 4 characters
   (≤4 → fully masked). API responses surface redacted values to the operator UI; never weaken this
   without a deliberate decision.
2. **The blocked-var policy protects process-essential + dynamic-linker vars.** `BLOCKED_VARS`
   (PATH/HOME/USER/SHELL/LANG/TERM/PWD/LOGNAME/HOSTNAME) and `BLOCKED_PREFIXES` (LD_/DYLD_) must never
   be writable via the integrations API. `isVarBlocked` is the single gate; the route's PUT/DELETE call
   it before any write.
3. **`.env` parse/serialize is lossless for the file shape.** Comments, blanks, ordering, and malformed
   lines (preserved as comments) survive a round-trip. Do not "normalize" away blanks/comments.
4. **Effective-value precedence is file-over-process.** `getEffectiveEnvValue` returns the `.env` file
   value when non-empty, else the live `process.env` value, else `''`. `isConfiguredValue` treats
   path-like vars as configured only if the path exists (`exists` port), all others as configured if
   non-empty.

## Harmony rules
- **Which engine**: ENGINE B. Pure data + pure logic + port-injected process/fs reads; no cross-engine
  import. The boundary gate (team ↔ `src/lib`, the `agents` table) is untouched.
- **Dead-surface / dead-wired**: none — `INTEGRATIONS`/`CATEGORIES`/the env helpers ARE wired (the route
  imports them).

## Editor guardrails
- Preserve invariants 1–4 verbatim. `redactValue` and the `BLOCKED_*` sets are the two places a careless
  edit leaks secrets or clobbers a runtime-essential var.
- Do NOT add a `@/lib` import — add a port to `EnvReaderDeps` (or a new reader factory) and wire it in
  the route. A `@/lib` import here is a layering violation that fails the governance tests.
- `docs/architecture/system-map/92-stale-findings.md` has no dedicated entry for this module. The
  applicable cross-cutting guardrail: read-seams are read-only (ARD 0007).
