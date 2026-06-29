<!-- agent-context: read this before editing the module -->

# platform/integrations

## Purpose
Owns the integration **read domain** that previously lived inside the `src/app/api/integrations/route.ts`
HTTP boundary: the integration catalog (`INTEGRATIONS[]`) + category metadata, the `.env` line model
(parse/serialize), and the **security-sensitive** redaction / blocked-var / effective-value /
configured-check logic. Extracted so these rules — which prevent secret leakage in API responses and
gate which env vars may be written — have a single owner and a direct test surface, instead of being
untested inside a 1017-line route.

This owns the read domain (registry + env-read) AND the probe domain (sub-slice 1b): detecting
installed CLIs (`op`/`xint`/`ollama`/`gws`), `op` authentication, xint OAuth/env-file presence, and
Ollama daemon reachability — all behind injected exec/fs/fetch/env ports. Only the **write path**
(`.env` mutation, `handleTest`, `handlePull`) remains in the route for a later sub-slice.

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

**`probes.ts`** (the probe domain behind injected ports):
- `interface IntegrationProbeSnapshot` — `{ opAvailable; xint{installed,oauthConfigured,envConfigured}; ollamaInstalled; ollamaReachable; gwsInstalled }`.
- `resolveOllamaBaseUrl(env): string` — pure `OLLAMA_HOST` resolution (default `http://127.0.0.1:11434`; no scheme → `http://` prefix).
- `interface ProbeDeps { execFile; fetch; exists; env; homeDir; now }`, `createProbes(deps)` →
  `{ snapshot(): Promise<IntegrationProbeSnapshot>; isCommandAvailable(cmd); isOpAvailable(); isOpAuthenticated(opEnv?) }`.
- `snapshot()` is the 5000ms-cached orchestrator (cache is per `createProbes` instance, keyed on `now()`).

## Dependencies
- **NO `@/lib` imports (Engine-B purity).** `process.env`, `execFileSync`, `existsSync`, `fetch`, `os`,
  `Date.now` enter as injected ports (`createEnvReader`, `createProbes`); the route constructs both with
  the real ports. Only the node `path` builtin (`join`, in `probes.ts`) is imported directly.
  **Enforcement caveat:** purity here is a code-review + folder-structure allowlist invariant — NOT yet a
  hard gate. `test/engine-boundary.test.mjs` scans only `src/opzava/modules/team` ↔ `src/lib` (the ARD 0007
  bridge), and `src/opzava/architecture.test.ts`'s `resolveSpec` ignores any spec outside `src/opzava`, so a
  stray `@/lib` import in this folder would pass BOTH. Keep it pure by convention; follow-up: extend
  `engine-boundary.test.mjs` to walk `src/opzava/platform/` for `@/lib` imports.
- **Inbound** (do not silently break): `src/app/api/integrations/route.ts` — the sole caller (imports the
  registry + the pure helpers + `createEnvReader` + `createProbes`/`resolveOllamaBaseUrl`).

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
5. **Every probe degrades to a safe boolean — never throws, never 500s.** `isCommandAvailable` /
   `isOpAvailable` / `isOpAuthenticated` / `isOllamaReachable` swallow exec/fs/fetch errors and return
   `false`. A missing CLI, an unauthenticated `op`, a down Ollama daemon, or a network error must read
   as not-available, not crash the request.
6. **The 5000ms snapshot cache is process-lifetime by design.** `snapshot()` caches the full probe
   bundle for `PROBE_TTL_MS` (5000) to avoid re-shelling on every request. The cache lives in the
   `createProbes` closure; the route wires a single module-level instance (matching the prior
   route-local `integrationProbeCache`). The boundary is exclusive: `now - cache.ts < 5000` → at
   exactly 5000ms elapsed it re-probes.
7. **Ports read live state — no value-freezing (the F1 trap).** `env`, `homeDir`, `now`, `execFile`,
   `fetch`, `exists` are passed as live references/functions, so `OLLAMA_HOST`, the home dir, and the
   clock are read per-call. Do not capture their *values* at `createProbes` time.
8. **`op whoami` is lazy — `snapshot()` does NOT run it.** Only `isOpAuthenticated()` shells out to
   `op whoami`; the snapshot only checks `which op` (presence). The route calls `isOpAuthenticated`
   separately, only for the onepassword integration when its key is otherwise unset. Preserve this
   asymmetry.

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
- Preserve the probe timeouts verbatim — `which` / `op whoami` 3000ms, ollama fetch 1200ms — and the
  5000ms cache TTL; they bound subprocess/network exposure. A careless bump widens the blast radius of a
  stuck probe (it is on the admin GET hot path).
