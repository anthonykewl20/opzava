# Opzava

Self-hosted AI operations control plane for building an internal AI team. Forked from an open-source agent-orchestration base and heavily customized: the inherited dashboard/operators layer is preserved, with all new product logic under the `src/opzava/` namespace. See `CONTEXT.md` for the product/brand contract (`Mission Control` is allowed only as a historical upstream reference).

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind CSS 3, Zustand, pnpm

## Prerequisites

- Node.js >= 22 (LTS recommended; 24.x also supported)
- pnpm (`corepack enable` to auto-install)

## Setup

```bash
pnpm install
pnpm build
```

Secrets (AUTH_SECRET, API_KEY) auto-generate on first run if not set.
Visit `http://localhost:3000/setup` to create an admin account, or set `AUTH_USER`/`AUTH_PASS` in `.env` for headless/CI seeding.

## Run

```bash
pnpm dev              # development (localhost:3000)
pnpm start            # production
node .next/standalone/server.js   # standalone mode (after build)
```

## Docker

```bash
docker compose up                 # zero-config
bash install.sh --docker          # full guided setup
```

Production hardening: `docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d`

## Tests

```bash
pnpm test             # unit tests (vitest) — 247 files / 1783 tests
pnpm test:e2e         # end-to-end (playwright)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint (0 errors)
pnpm test:all         # lint + typecheck + test + build + e2e
```

Governance checks (branding, folder-structure, code-simplicity, complexity, ARD presence) live in `test/*.test.mjs` and run via `node --test`.

## Key Directories

```
src/app/          Next.js pages + API routes (App Router)
src/app/api/      Inherited MC routes + Opzava-native ops/campaigns/team/connections routes
src/components/   UI panels (44) and shared components
src/lib/          Inherited application logic, database, utilities
src/opzava/       Opzava product namespace (new domain code lives here)
  ├─ core/        workflows, artifacts, approvals contracts
  ├─ modules/     content, team, social, general-va feature modules
  └─ platform/    runner, providers, admin-config, audit, costs
.data/            SQLite database + runtime state (gitignored)
scripts/          Install, deploy, diagnostics, mc CLI/MCP/TUI
docs/             Architecture, ARDs, discovery notes, benchmarks, plans
test/             Governance tests (node:test)
```

Path alias: `@/*` maps to `./src/*`. New product code goes under `src/opzava/modules/<feature>/` (see `docs/architecture/folder-structure.md`); route handlers and panels stay thin and call into `@/opzava/...`.

## Data Directory

Set `MISSION_CONTROL_DATA_DIR` to change the data location (defaults to `.data/`). Database path: `MISSION_CONTROL_DB_PATH`, or `<MISSION_CONTROL_DATA_DIR>/mission-control.db` by default. (These names are inherited from the upstream base and still used by the code.)

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`)
- **No AI attribution**: Never add `Co-Authored-By` or similar trailers to commits
- **Package manager**: pnpm only (no npm/yarn)
- **Brand**: Product-facing surfaces use `Opzava`, never `Mission Control` (enforced for app source by `test/branding.test.mjs`)
- **Icons**: No icon libraries -- use raw text/emoji in components
- **Standalone output**: `next.config.js` sets `output: 'standalone'`
- **No hardcoded secrets/config**: Provider credentials, model choices, endpoints, and operator-tunable values belong in admin settings + secret references, not source (see `docs/golden-principles.md`)

## Agent Control Interfaces

Opzava provides three interfaces for autonomous agents:

### MCP Server (recommended for agents)
```bash
# Add to any Claude Code agent:
claude mcp add opzava -- node /path/to/opzava/scripts/mc-mcp-server.cjs

# Environment config:
MC_URL=http://127.0.0.1:3000 MC_API_KEY=<key>
```
Tools cover agents, tasks, sessions, memory, soul, comments, tokens, skills, cron, status. See `docs/cli-agent-control.md`.

### CLI
```bash
pnpm mc agents list --json
pnpm mc tasks queue --agent Aegis --max-capacity 2 --json
pnpm mc events watch --types agent,task
```

### REST API
OpenAPI spec: `openapi.json`. Interactive docs at `/docs` when running. Opzava-native operational surfaces are under `/api/ops/*` (runs, artifacts, approvals, costs, dead-letters, maintenance), `/api/campaigns/*`, and `/api/team/*`.

## Common Pitfalls

- **Standalone mode**: Use `node .next/standalone/server.js`, not `pnpm start` (which requires full `node_modules`)
- **better-sqlite3**: Native addon -- needs rebuild when switching Node versions (`pnpm rebuild better-sqlite3`)
- **AUTH_PASS with `#`**: Quote it (`AUTH_PASS="my#pass"`) or use `AUTH_PASS_B64` (base64-encoded)
- **Gateway optional**: Set `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` for standalone deployments without gateway connectivity
