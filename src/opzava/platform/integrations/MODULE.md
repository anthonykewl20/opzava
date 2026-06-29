<!-- agent-context: read this before editing the module -->

# platform/integrations

## Purpose
Owns the integration **read domain** that previously lived inside the `src/app/api/integrations/route.ts`
HTTP boundary: the integration catalog (`INTEGRATIONS[]`) + category metadata, the `.env` line model
(parse/serialize), and the **security-sensitive** redaction / blocked-var / effective-value /
configured-check logic. Extracted so these rules — which prevent secret leakage in API responses and
gate which env vars may be written — have a single owner and a direct test surface, instead of being
untested inside a 1017-line route.

This owns the read domain (registry + env-read), the probe domain (sub-slice 1b: `op`/`xint`/`ollama`/`gws`
detection behind exec/fs/fetch/env ports), the `.env` write domain (sub-slice 2: `env-store`) — file IO +
the blocked-var-gated write mutation + an in-process mutex that serializes concurrent writers so two admins
editing different keys cannot lose updates (issue #61 edge #8) — AND the 1Password pull domain (sub-slice 3:
`one-password` — the `op item get` + secret parsing behind exec/env ports). Only **connection testing**
(`handleTest`) remains in the route.

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

**`env-store.ts`** (the `.env` read + write domain behind injected ports):
- `interface EnvSnapshot` — `{ lines: EnvLine[]; raw: string }`.
- `type EnvWriteOutcome` — `{ ok: true; affected: string[] } | { ok: false; reason: "not-configured" } | { ok: false; reason: "blocked"; key } | { ok: false; reason: "invalid-name"; key }`.
- `interface EnvStoreDeps { stateDir; readFile; writeFileAtomic }`, `createEnvStore(deps)` →
  `{ envPath(): string|null; readEnv(): Promise<EnvSnapshot|null>; setEnvVars(vars): Promise<EnvWriteOutcome>; deleteEnvVars(keys): Promise<EnvWriteOutcome> }`.
- `setEnvVars`/`deleteEnvVars` enforce the blocked-var gate (+ the `^[A-Z_][A-Z0-9_]*$/i` name rule on SET) INSIDE, then do the atomic read-modify-write under the store's mutex.

**`one-password.ts`** (the 1Password pull domain behind injected ports):
- `type PullSecretOutcome` — `{ ok: true; value: string } | { ok: false; reason: "empty" } | { ok: false; reason: "op-error"; detail: string }`.
- `interface OnePasswordDeps { execFile; env }`, `createOnePassword(deps)` → `{ pullSecret(vaultItem, opEnv): PullSecretOutcome }`.
- `pullSecret` runs `op item get <vaultItem> --vault <OP_VAULT_NAME|default> --fields password --format json` (no shell; 15000ms timeout), parses JSON/scalar/raw (`parsed.value || parsed`), rejects empty — never throws (op failure is an outcome).

## Dependencies
- **NO `@/lib` imports (Engine-B purity).** `process.env`, `execFileSync`, `existsSync`, `fetch`, `os`,
  `Date.now`, the OpenClaw state dir, `readFile`, and `writeFileAtomic` all enter as injected ports
  (`createEnvReader`, `createProbes`, `createEnvStore`, `createOnePassword`); the route constructs all four
  with the real ports. Only the node `path` builtin (`join`, in `probes.ts` + `env-store.ts`) is imported
  directly, plus the sibling `./env-read` (pure logic).
  **Enforcement caveat:** purity here is a code-review + folder-structure allowlist invariant — NOT yet a
  hard gate. `test/engine-boundary.test.mjs` scans only `src/opzava/modules/team` ↔ `src/lib` (the ARD 0007
  bridge), and `src/opzava/architecture.test.ts`'s `resolveSpec` ignores any spec outside `src/opzava`, so a
  stray `@/lib` import in this folder would pass BOTH. Keep it pure by convention; follow-up: extend
  `engine-boundary.test.mjs` to walk `src/opzava/platform/` for `@/lib` imports.
- **Inbound** (do not silently break): `src/app/api/integrations/route.ts` — the sole caller (imports the
  registry + `redactValue`/`createEnvReader` + `createProbes`/`resolveOllamaBaseUrl` + `createEnvStore` +
  `createOnePassword`).

## Invariants
1. **Redaction is load-bearing for security.** `redactValue` masks everything but the last 4 characters
   (≤4 → fully masked). API responses surface redacted values to the operator UI; never weaken this
   without a deliberate decision.
2. **The blocked-var policy protects process-essential + dynamic-linker vars.** `BLOCKED_VARS`
   (PATH/HOME/USER/SHELL/LANG/TERM/PWD/LOGNAME/HOSTNAME) and `BLOCKED_PREFIXES` (LD_/DYLD_) must never
   be writable via the integrations API. `isVarBlocked` is the single gate — now enforced INSIDE
   `env-store`'s `setEnvVars`/`deleteEnvVars` (the route delegates and maps the `blocked` outcome to
   403); the route no longer pre-checks. Do not move the gate back out or skip it.
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
9. **Writes are serialized — no lost update (issue #61 edge #8).** `env-store`'s in-process promise-chain
   mutex (`serialized`) ensures every `setEnvVars`/`deleteEnvVars` read-modify-write runs to completion
   before the next starts, so concurrent writers for different keys both persist. The route wires ONE
   module-level `createEnvStore` singleton, so the mutex is shared process-wide (per-request construction
   would defeat it). A failed write is swallowed IN THE CHAIN (the caller still sees the rejection) so
   one bad op cannot deadlock the next.
10. **Validation precedes IO.** `setEnvVars` validates every key (blocked, then `^[A-Z_][A-Z0-9_]*$/i`)
    BEFORE reading or writing the file — a blocked/invalid-name request does no IO and returns its
    outcome with zero reads/writes.
11. **Read consistency relies on `writeFileAtomic`'s POSIX-rename atomicity.** `readEnv` is NOT
    serialized (it's a pure read); it never observes a partial `.env` only because `writeFileAtomic`
    atomically renames. Do NOT swap `writeFileAtomic` for a non-atomic write without revisiting this.
12. **Not-configured is `null`/`not-configured`, not an error.** `envPath()`/`readEnv()` return `null`
    and `setEnvVars`/`deleteEnvVars` return `{ reason: "not-configured" }` when the state dir is unset;
    the route maps that to 404. A missing `.env` (ENOENT) is NOT not-configured — it reads as empty
    (`{ lines: [], raw: "" }`).
13. **`pullSecret` never throws — op failure is an outcome.** A missing/unauthenticated `op`, a timeout,
    or a bad vault surfaces as `{ ok: false; reason: "op-error"; detail }`, not an exception.
    `handlePullAll` relies on this (its loop has no try/catch around the pull — a throw would 500 the
    whole batch).
14. **Empty secret is a reason, not an error status.** `pullSecret` returns
    `{ ok: false; reason: "empty" }` for an empty/whitespace secret; the route maps it (handlePull → 400,
    handlePullAll → per-integration `detail:"Empty value"`).
15. **The pulled cleartext value flows ONLY to `envStore.setEnvVars` + `redactValue` — never logged.** No
    audit detail, error message, or response metadata carries the secret. `handlePull` returns
    `redacted: redactValue(value)`; `handlePullAll`'s `results` carry only `{id, envVar, ok, detail}`. The
    audit `detail` is `{integration, env_var}` / counts — never the value.
16. **Port contract: `execFile` returns `string | Buffer` (never `undefined`/`null`).** `pullSecret`
    coerces via `String(...)`; a non-coercible return would yield a bogus `"undefined"`/`"null"` secret.
    The real port is `execFileSync` (Buffer|string) — do not wire a port that can return undefined.

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
- `env-store`: keep the blocked-var gate INSIDE `setEnvVars`/`deleteEnvVars` (invariant 2), keep writes
  serialized through the one module-level singleton's mutex (invariant 9 — per-request construction
  reintroduces the lost-update bug), and keep `writeFileAtomic` as the write port (invariant 11 — read
  consistency depends on its atomic rename).
