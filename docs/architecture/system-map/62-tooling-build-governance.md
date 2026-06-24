# 62 — Tooling · Build · Tests · Governance (deep)

> Zone: `scripts/` (CLI/MCP/TUI + ops), root build/deploy files including Docker/Dokploy Compose,
> `test/` (governance gates), `tests/`
> (e2e), test configs. Marks: ✅✅ double-verified (F8 had a fresh pass) · 🔎→✅ pass-1 research **confirmed in the second pass** · ⚠️ flag. See [`99-verification-register.md`](./99-verification-register.md).

## Agent control interfaces ✅

All three wrap the same REST API; auth via `x-api-key` (preferred for agents) or session cookie; config from
`~/.mission-control/profiles/<name>.json` or `MC_URL`/`MC_API_KEY` env.

- **MCP server** (`scripts/mc-mcp-server.cjs`, the recommended agent path): zero-dep JSON-RPC 2.0 over
  stdio; `serverInfo.name='mission-control'` (⚠️ inherited brand — `scripts/` is not scanned by the branding
  gate). **40+ tools** grouped: agents, agent-memory, knowledge-base (FTS5), SOUL, tasks, comments, sessions,
  connections, tokens/costs, skills/cron/status, and **runs** (`/api/v1/*`). Registered with
  `claude mcp add opzava -- node /path/to/scripts/mc-mcp-server.cjs`.
- **CLI** (`scripts/mc-cli.cjs`, `pnpm mc`): group→action map → REST; stable exit codes (OK=0, USAGE=2,
  AUTH=3, FORBIDDEN=4, NETWORK=5, SERVER=6); `events watch` streams SSE and parses spec fields across chunks
  (`data:`, comments, `id:`, `retry:`); `raw` escape hatch.
- **TUI** (`scripts/mc-tui.cjs`, `pnpm mc:tui`): zero-dep ANSI dashboard.

```
external agent ──stdio JSON-RPC──► mc-mcp-server.cjs ──x-api-key──► REST API ──► SQLite
human ──► mc-cli.cjs / mc-tui.cjs ──► same REST API
```

## Scripts inventory ✅

`mc-server.cjs` (standalone wrapper adding `/ws/pty`), `check-node-version.mjs` (Node ≥22 floor, prepended
to most scripts), `check-api-contract-parity.mjs` (`api:parity`, in CI), `generate-env.sh`,
`start-standalone.sh`, `deploy-standalone.sh`, `station-doctor.sh`, `security-audit.sh`,
`agent-heartbeat.sh`, `notification-daemon.sh`, `smoke-staging.mjs`, `take-screenshots.ts`, plus
`scripts/e2e-openclaw/*` (offline mock-gateway harness).

## Build & deploy ✅

- `next.config.js`: `output:'standalone'`; ⚠️ `outputFileTracingExcludes` for `.git`/`.data` is load-bearing
  (keeps the self-update endpoint's clean-tree check honest); transpiles ESM `react-markdown`/`remark-gfm`;
  security headers; CSP set per-request with a nonce in `src/proxy.ts`.
- ⚠️ **Standalone caveat**: run `scripts/start-standalone.sh` / `pnpm start:standalone` or
  `scripts/mc-server.cjs`, not bare `node .next/standalone/server.js`. The wrapper patches Next's standalone
  HTTP(S) server creation so `/ws/pty` upgrades are served while all non-PTY upgrades still go to Next.
- `Dockerfile` (4-stage; pins pnpm 10.29.3; builds better-sqlite3 native; installs runtime `tmux`; manually
  copies the `node-pty` native addon, `ws`, and the standalone PTY wrapper scripts the tracer can omit;
  runtime uses the Node base-image user uid/gid `1000`, `HOME=/home/nextjs`, and a user-writable CLI path;
  inline healthcheck). `docker-entrypoint.sh` auto-generates `AUTH_SECRET`/`API_KEY` and starts
  `node scripts/mc-server.cjs`.
- `docker-compose.yml` is **hardened by default** (`read_only`, `cap_drop ALL`, `no-new-privileges`, tmpfs,
  limits) and carries build args for all `NEXT_PUBLIC_*` values that are baked into the Next bundle. Overlays:
  `docker-compose-dev.yml` bind-mounts the repo and runs `pnpm dev`; `docker-compose-openclaw.yml` adds the
  optional OpenClaw gateway sidecar; `docker-compose.host-cli.yml` opt-in mounts host CLI state for local-agent
  parity; `docker-compose.hardened.yml` adds log rotation + stricter cookie/HSTS + internal network.
- `Makefile` is the operator wrapper around Compose: `make <verb> [all|mc|openclaw] [dev|prod]` with verbs
  `up/down/restart/status/update/rebuild/upgrade`; `.env` + `.env.openclaw` decide mode, endpoints, and
  gateway inclusion.
- `docker-compose.dokploy.yml` is the **local Dokploy-parity stack**: production image behind a local Traefik
  service, `env_file: .env`, app `expose` only (no direct host-published app port), Traefik labels for
  `opzava.localhost`, `DOKPLOY_TRAEFIK_IMAGE` defaulting to `traefik:v3.7.5` for Docker 29+ provider
  compatibility, forwarded-header trust on the local HTTP entrypoint so the smoke can model TLS termination,
  sticky app-service affinity for PTY attach/upgrade locality, no fixed app `container_name` so
  `--scale mission-control=N` remains valid, read-only runtime with writable `.data`, and optional `mc-openclaw-gateway` profile for
  gateway routing. `scripts/dokploy-parity-test.sh` verifies the routed health check, no direct app port,
  uid/home/filesystem invariants, forwarded-HTTPS secure session-cookie behavior, the Traefik-routed
  `/api/events` stream contract (`text/event-stream`, `retry: 5000`, initial `connected` frame), and a
  Traefik-routed `/ws/pty` upgrade that reaches the app wrapper and returns the deterministic missing-tmux-session
  error after authentication.
- **CI** `.github/workflows/quality-gate.yml`: `api:parity → lint → typecheck → test (vitest) →
  cp .env.test .env → build → playwright → test:e2e`. `docker-publish.yml` fires on a green quality gate.

## Governance gates — golden-principles-as-tests ✅

9 `test/*.test.mjs` files run under **node:test**: `branding.test.mjs` (recursive scan of `src/app`,
`src/components`, `messages` for the forbidden `Mission Control` pattern + required doc headings),
`folder-structure.test.mjs` (live check: no unsanctioned top-level entry), `project-directory-name.test.mjs`
(root dir === `anito-opzava`), `code-simplicity`, `production-grade-complexity`, `context`, `opzava-ard`,
`check-plan` (~85 assertions), `check-plan-content-steps` (~197 assertions). Most are doc-presence assertions
that make the contract docs *load-bearing*; the two that police **code** are the branding recursive scan and
the folder-structure live check.

⚠️ **F8 — these gates are NOT enforced on merge** ✅✅ (fresh-agent verified):
- `vitest.config.ts:15` includes only `src/**/*.test.ts(x)` — it does **not** pick up `test/*.test.mjs`.
- No `package.json` script runs `node --test`.
- `quality-gate.yml` has **no governance step**.
So the branding scan + folder-structure check pass only when run manually, never on merge. See
[F8](./90-parity-findings.md).

## Test architecture ✅

- **vitest** (unit): jsdom, `include: src/**/*.test.ts(x)` — 248 test files (CLAUDE.md cites 247/1783 tests).
  Coverage scoped to `src/lib/**` only (60% thresholds) — ⚠️ `src/opzava/**` and `src/app/**` are not in the
  coverage include, so new product code isn't constrained by coverage.
- **node:test** (governance): the 9 gates above — orphaned from CI (F8).
- **playwright** (e2e): `tests/` (66 specs), serial, against an offline OpenClaw harness
  (`scripts/e2e-openclaw/`, mock gateway + PATH-shadowed mock CLIs + fixture-seeded SQLite).
  `playwright.dokploy.config.ts` is a Docker-parity variant with no `webServer`; it targets an already-running
  Traefik-routed Dokploy-parity stack. The parity runner also probes `/api/events` and `/ws/pty` through Traefik
  before any optional Playwright run so SSE buffering/proxy and WebSocket upgrade regressions fail fast.
- **eslint complexity ratchet** (`eslint.config.mjs`): scoped to `src/opzava/**` — `complexity≤20`,
  `max-depth≤4`, `max-nested-callbacks≤5`; thresholds set at today's worst case to gate future decay. A
  `no-restricted-syntax` **warn** discourages bare `fetch('/api/...')` in favor of `apiFetch`.
- ✅ **Architecture entropy guard** (`src/opzava/architecture.test.ts`) — a **vitest** test, so it **does run
  in CI**. Builds an import graph (regex over `@/`/relative specs inside `src/opzava`) and asserts: (1) no
  import cycles, (2) `platform/` must not import `modules/content/`, (3) `modules/content/contracts/` must not
  import sibling content layers (workflow/campaign/steps/providers). This is the only real code-structure-decay
  guard — and it's **scoped to `src/opzava` only** (inherited `src/lib`/`src/app` is not graphed).

## Parity flags ⚠️

1. **Governance gates orphaned from CI** (F8) — the most valuable structural guards (branding scan,
   folder-structure) aren't enforced on merge.
2. ~~**CI env file**: `quality-gate.yml` does `cp .env.test .env`, but `.env.test` is **not committed**~~
   — **RESOLVED** (2026-06-22): the step now falls back to the tracked `.env.example`
   (`cp .env.test .env 2>/dev/null || cp .env.example .env`), so a fresh checkout no longer fails the
   e2e copy step. Playwright's `webServer.env` remains the authoritative source of test-specific values.
3. **Coverage asymmetry**: only `src/lib/**` is measured; `src/opzava/**` (the new code) has no coverage
   floor — the complexity ratchet + entropy guard are its only automated constraints.
4. **Inherited-brand residue in `scripts/`** (MCP server self-names `mission-control`) — not covered by the
   branding gate, which scans only `src/` + `messages/`.
5. **`api:parity` ignore file** lets routes/openapi diverge silently for listed entries.

## Centralized log shipping (observability)

The central pino `logger` (`src/lib/logger.ts`) writes to stdout. Centralized **log shipping/aggregation**
(2026-06-22) lets every stdout record ALSO be forwarded to an external aggregator for one view across runs.
The policy + buffer live in `src/opzava/platform/observability/`:

- `log-shipping.ts` — pure policy: `resolveLogShippingConfig(env)`, `shouldShipLogRecord`, `buildLogShipEnvelope`.
- `log-shipper.ts` — buffered, **fail-open** shipper (a flaky aggregator can never break the app that logs).
- `log-ship-transport.ts` — HTTP transport (injected `fetch`) + `createLogShipperFromConfig`.
- `log-ship-destination.ts` — adapts the shipper into a pino multistream destination; `logger.ts` attaches it.

**Config (env, never hard-coded):** `LOG_SHIP_ENABLED` (off by default), `LOG_SHIP_ENDPOINT` (required to enable),
`LOG_SHIP_MIN_LEVEL` (default `info`). Disabled and the dev pretty-print path are byte-for-byte unchanged. The
policy/buffer/transport are in the scoped Stryker harness (shipper + transport 100%, shipping 98.8% — 1 equivalent).

## Subtleties for parity comparison

1. The project has a sophisticated **governance-as-code** system — but its two code-policing gates are not
   wired into CI; only the architecture entropy guard (vitest) actually runs on merge.
2. Three agent-control interfaces (MCP/CLI/TUI) all funnel through the same REST API — a clean uniform surface.
3. Build is standalone-first with a custom server wrapper for PTY; hardened Docker by default.
