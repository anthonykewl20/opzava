# Opzava

Self-hosted AI operations control plane for an internal AI team. A heavily-customized fork of an agent-orchestration base: the inherited dashboard/operators layer is preserved; all new product logic lives under `src/opzava/`. See `CONTEXT.md` for the product/brand contract (`Mission Control` = historical upstream reference only).

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind 3, Zustand, pnpm. Node >= 22.

## Critical Constraints (non-negotiable — govern all code)

1. **ENFORCE**: idempotency, thread-safe concurrency, modular architecture, horizontal scalability.
2. **REJECT**: over-engineering, race conditions, dead code, unnecessary abstractions.
3. **OUTPUT**: minimal, deterministic, production-ready code with zero structural entropy.

## Commands

```bash
pnpm install && pnpm build      # setup (AUTH_SECRET/API_KEY auto-generate on first run)
pnpm dev                        # dev — localhost:3000
pnpm start                      # production
node .next/standalone/server.js # standalone (next.config.js sets output:'standalone')
pnpm test                       # vitest unit tests
pnpm test:e2e                   # playwright e2e
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # eslint (must be 0 errors)
pnpm test:all                   # lint + typecheck + test + build + e2e
docker compose up               # zero-config; guided: bash install.sh --docker; hardened: add -f docker-compose.hardened.yml
```

First run: visit `/setup` to create an admin, or set `AUTH_USER`/`AUTH_PASS` in `.env` for CI seeding.
Governance checks (branding, folder-structure, complexity, ARD presence) live in `test/*.test.mjs` (run via `node --test`, folded into `test:all`).

## Layout

```
src/app/        Next.js pages + API routes; src/app/api/ = inherited MC + Opzava ops/campaigns/team/connections
src/components/  UI panels (44) + shared components
src/lib/         Inherited app logic, database, utilities
src/opzava/      Opzava namespace — core/ (contracts), modules/ (content,team,social,general-va), platform/ (runner,providers,admin-config,audit,costs)
scripts/         Install, deploy, diagnostics, mc CLI/MCP/TUI
docs/, test/     Architecture+ARDs+plans, governance tests
```

Path alias `@/*` → `./src/*`. New product code goes under `src/opzava/modules/<feature>/` (see `docs/architecture/folder-structure.md`); routes/panels stay thin and call into `@/opzava/...`.

## Conventions

- **Commits**: Conventional Commits (`feat:`/`fix:`/`docs:`/`test:`/`refactor:`/`chore:`). **Never** add `Co-Authored-By` or AI-attribution trailers.
- **pnpm only** (no npm/yarn).
- **Brand**: product surfaces say `Opzava`, never `Mission Control` (enforced for app source by `test/branding.test.mjs`).
- **Icons**: no icon libraries — raw text/emoji.
- **No hardcoded secrets/config**: provider creds, model choices, endpoints, operator-tunable values live in admin settings + secret references, not source (`docs/golden-principles.md`).

## Data & agent control

- Data dir: `MISSION_CONTROL_DATA_DIR` (default `.data/`, gitignored); DB: `MISSION_CONTROL_DB_PATH` or `<data-dir>/mission-control.db`. (Env names inherited from upstream.)
- Agent interfaces: **MCP** (`claude mcp add opzava -- node scripts/mc-mcp-server.cjs`; env `MC_URL`/`MC_API_KEY`), **CLI** (`pnpm mc ...`), **REST** (`openapi.json`, docs at `/docs`; Opzava surfaces under `/api/ops/*`, `/api/campaigns/*`, `/api/team/*`). See `docs/cli-agent-control.md`.

## Pitfalls

- **Standalone**: use `node .next/standalone/server.js`, not `pnpm start` (which needs full `node_modules`).
- **better-sqlite3**: native addon — `pnpm rebuild better-sqlite3` when switching Node versions.
- **AUTH_PASS with `#`**: quote it (`AUTH_PASS="my#pass"`) or use `AUTH_PASS_B64`.
- **Gateway optional**: `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` for standalone deployments without gateway connectivity.
