# 62 — Tooling · Build · Tests · Governance (deep)

> Zone: `scripts/` (CLI/MCP/TUI + ops), root build/deploy files, `test/` (governance gates), `tests/`
> (e2e), test configs. Marks: ✅✅ double-verified (F8 had a fresh pass) · 🔎 pass-1 research · ⚠️ flag.

## Agent control interfaces 🔎

All three wrap the same REST API; auth via `x-api-key` (preferred for agents) or session cookie; config from
`~/.mission-control/profiles/<name>.json` or `MC_URL`/`MC_API_KEY` env.

- **MCP server** (`scripts/mc-mcp-server.cjs`, the recommended agent path): zero-dep JSON-RPC 2.0 over
  stdio; `serverInfo.name='mission-control'` (⚠️ inherited brand — `scripts/` is not scanned by the branding
  gate). **40+ tools** grouped: agents, agent-memory, knowledge-base (FTS5), SOUL, tasks, comments, sessions,
  connections, tokens/costs, skills/cron/status, and **runs** (`/api/v1/*`). Registered with
  `claude mcp add opzava -- node /path/to/scripts/mc-mcp-server.cjs`.
- **CLI** (`scripts/mc-cli.cjs`, `pnpm mc`): group→action map → REST; stable exit codes (OK=0, USAGE=2,
  AUTH=3, FORBIDDEN=4, NETWORK=5, SERVER=6); `events watch` streams SSE; `raw` escape hatch.
- **TUI** (`scripts/mc-tui.cjs`, `pnpm mc:tui`): zero-dep ANSI dashboard.

```
external agent ──stdio JSON-RPC──► mc-mcp-server.cjs ──x-api-key──► REST API ──► SQLite
human ──► mc-cli.cjs / mc-tui.cjs ──► same REST API
```

## Scripts inventory 🔎

`mc-server.cjs` (standalone wrapper adding `/ws/pty`), `check-node-version.mjs` (Node ≥22 floor, prepended
to most scripts), `check-api-contract-parity.mjs` (`api:parity`, in CI), `generate-env.sh`,
`start-standalone.sh`, `deploy-standalone.sh`, `station-doctor.sh`, `security-audit.sh`,
`agent-heartbeat.sh`, `notification-daemon.sh`, `smoke-staging.mjs`, `take-screenshots.ts`, plus
`scripts/e2e-openclaw/*` (offline mock-gateway harness).

## Build & deploy 🔎

- `next.config.js`: `output:'standalone'`; ⚠️ `outputFileTracingExcludes` for `.git`/`.data` is load-bearing
  (keeps the self-update endpoint's clean-tree check honest); transpiles ESM `react-markdown`/`remark-gfm`;
  security headers; CSP set per-request with a nonce in `src/proxy.ts`.
- ⚠️ **Standalone caveat** (CLAUDE.md): run `node .next/standalone/server.js` (or `mc-server.cjs`), **not**
  `pnpm start` (which needs full `node_modules`). `mc-server.cjs` exists to add the `/ws/pty` upgrade bare
  `server.js` lacks.
- `Dockerfile` (4-stage; pins pnpm 10.29.3; builds better-sqlite3 native; manually copies the `node-pty`
  addon the tracer omits; non-root `nextjs:nodejs`; inline healthcheck). `docker-compose.yml` is **hardened by
  default** (`read_only`, `cap_drop ALL`, `no-new-privileges`, tmpfs, limits); `docker-compose.hardened.yml`
  overlay adds log rotation + stricter cookie/HSTS + internal network. `docker-entrypoint.sh` auto-generates
  `AUTH_SECRET`/`API_KEY`.
- **CI** `.github/workflows/quality-gate.yml`: `api:parity → lint → typecheck → test (vitest) →
  cp .env.test .env → build → playwright → test:e2e`. `docker-publish.yml` fires on a green quality gate.

## Governance gates — golden-principles-as-tests 🔎

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

## Test architecture 🔎

- **vitest** (unit): jsdom, `include: src/**/*.test.ts(x)` — 248 test files (CLAUDE.md cites 247/1783 tests).
  Coverage scoped to `src/lib/**` only (60% thresholds) — ⚠️ `src/opzava/**` and `src/app/**` are not in the
  coverage include, so new product code isn't constrained by coverage.
- **node:test** (governance): the 9 gates above — orphaned from CI (F8).
- **playwright** (e2e): `tests/` (66 specs), serial, against an offline OpenClaw harness
  (`scripts/e2e-openclaw/`, mock gateway + PATH-shadowed mock CLIs + fixture-seeded SQLite).
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
2. **CI env file**: `quality-gate.yml` does `cp .env.test .env`, but `.env.test` is **not committed** (only
   `.env.example` is) — a fresh checkout could fail the e2e copy step. Doc/CI inconsistency on which env file
   is authoritative (`tests/README.md` says `.env.local`).
3. **Coverage asymmetry**: only `src/lib/**` is measured; `src/opzava/**` (the new code) has no coverage
   floor — the complexity ratchet + entropy guard are its only automated constraints.
4. **Inherited-brand residue in `scripts/`** (MCP server self-names `mission-control`) — not covered by the
   branding gate, which scans only `src/` + `messages/`.
5. **`api:parity` ignore file** lets routes/openapi diverge silently for listed entries.

## Subtleties for parity comparison

1. The project has a sophisticated **governance-as-code** system — but its two code-policing gates are not
   wired into CI; only the architecture entropy guard (vitest) actually runs on merge.
2. Three agent-control interfaces (MCP/CLI/TUI) all funnel through the same REST API — a clean uniform surface.
3. Build is standalone-first with a custom server wrapper for PTY; hardened Docker by default.
