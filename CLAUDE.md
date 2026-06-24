# Opzava

Self-hosted AI operations control plane for an internal AI team — a heavily-customized fork of an agent-orchestration base. The inherited dashboard/operators layer is preserved; all new product logic lives under `src/opzava/`. `CONTEXT.md` is the product/brand contract (`Mission Control` = historical upstream reference only).

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind 3, Zustand, pnpm. Node ≥ 22.

## Operating discipline (always)

- **Ultrathink.** Reason at maximum depth on design/refactor/security/debug work — enumerate options, cite `file:line`, verify before claiming done. Default to max effort; don't stop at the first plausible answer.
- **Use the skills; don't ad-hoc.** Step 0 of any task: scan the available skills (the harness lists them each session) and invoke the matching one(s). The skill's discipline beats improvisation. Project routing:
  - edit `src/opzava/**` → read the sibling `MODULE.md` + `docs/architecture/dependency-graph.md` + `docs/architecture/system-map/92-stale-findings.md` first (no blind edits);
  - feature/bug → `/tdd` (red-green-refactor);
  - refactor/deepening → `/improve-codebase-architecture` → `/grilling` → `/codebase-design` (design-it-twice); big multi-step refactor → `/request-refactor-plan`;
  - review a diff → `/code-review` (+`/simplify`); security-sensitive change → `/security-review`;
  - multi-source question → `/deep-research`; confirm in the real app → `/run`/`/verify`; domain terms → `/domain-modeling` (keep `CONTEXT.md` current).
- **Sequence, don't pile.** One skill's output feeds the next; clear a gate before starting the next one.

## Critical Constraints (non-negotiable — govern all code)

1. **ENFORCE**: idempotency, thread-safe concurrency, modular architecture, horizontal scalability.
2. **REJECT**: over-engineering, race conditions, dead code, unnecessary abstractions.
3. **OUTPUT**: minimal, deterministic, production-ready code with zero structural entropy.

## Completion Standard

No half-baked work. Wire UI/API/data end-to-end as applicable, handle failure + empty states, remove placeholders/stubs/TODO-driven logic, update affected docs/config, and run the verification commands before reporting done. If an external blocker prevents completion, state it plainly — never present partial work as done.

## Commands

```bash
pnpm install && pnpm build      # setup (AUTH_SECRET/API_KEY auto-generate on first run)
pnpm dev                        # dev — localhost:3000
node .next/standalone/server.js # standalone (next.config.js output:'standalone'); NOT pnpm start
pnpm test | pnpm test:e2e       # vitest unit | playwright e2e
pnpm typecheck | pnpm lint      # tsc --noEmit | eslint (must be 0 errors)
pnpm test:all                   # lint + typecheck + test + build + e2e
docker compose up               # zero-config; guided: bash install.sh --docker; hardened: -f docker-compose.hardened.yml
```

First run: visit `/setup` to create an admin, or set `AUTH_USER`/`AUTH_PASS` in `.env` for CI seeding. Governance gates (branding, folder-structure, complexity, ARD presence, stepid-coupling) live in `test/*.test.mjs` → `node --test`, folded into `test:all`.

## Layout

```
src/app/        pages + API routes (inherited MC + Opzava ops/campaigns/team/connections)
src/components/ 44 UI panels + shared components
src/lib/        inherited app logic, database, utilities (Engine A)
src/opzava/     core/ (approvals,artifacts,workflows,secrets) · modules/ (content,team,social,general-va) · platform/ (runner,providers,admin-config,audit,costs,observability)
scripts/        install, deploy, diagnostics, mc CLI/MCP/TUI
docs/, test/    architecture + ARDs + plans · governance tests
```

Path alias `@/*` → `./src/*`. New product code goes under `src/opzava/modules/<feature>/` (see `docs/architecture/folder-structure.md`); routes/panels stay thin and call into `@/opzava/...`.

## AI navigability (read before editing `src/opzava`)

Before changing a `src/opzava` module, orient on its colocated `MODULE.md` (purpose/public-surface/invariants/editor-guardrails), `docs/architecture/dependency-graph.md` (import DAG + string-coupling + read-seam edges), and `docs/architecture/system-map/92-stale-findings.md` (CONFIRMED/PARTIAL/REFUTED traps — never regress a CONFIRMED one). Layering is enforced by `test/folder-structure.test.mjs`, `src/opzava/architecture.test.ts`, `test/engine-boundary.test.mjs`, `test/stepid-coupling.test.mjs`. Where doc and code disagree, **code wins** — the mismatch is a doc defect.

## Conventions

- **Commits**: Conventional Commits (`feat:`/`fix:`/`docs:`/`test:`/`refactor:`/`chore:`). **Never** add `Co-Authored-By` or AI-attribution trailers.
- **pnpm only** (no npm/yarn). **Brand**: product surfaces say `Opzava`, never `Mission Control` (enforced by `test/branding.test.mjs`). **Icons**: raw text/emoji, no icon libraries.
- **No hardcoded secrets/config**: provider creds, model choices, endpoints, operator-tunable values live in admin settings + `SecretReference`, not source (`docs/golden-principles.md`).

## Data & agent control

- Data dir: `MISSION_CONTROL_DATA_DIR` (default `.data/`, gitignored); DB: `MISSION_CONTROL_DB_PATH` or `<data-dir>/mission-control.db`. (Env names inherited from upstream.)
- Agent interfaces: **MCP** (`claude mcp add opzava -- node <abs-path>/scripts/mc-mcp-server.cjs`; absolute path required — run outside the repo; env `MC_URL`/`MC_API_KEY`), **CLI** (`pnpm mc ...`), **REST** (`openapi.json`, docs at `/docs`; Opzava surfaces under `/api/ops/*`, `/api/campaigns/*`, `/api/team/*`). See `docs/cli-agent-control.md`.

## Pitfalls

- **Standalone**: use `node .next/standalone/server.js`, not `pnpm start` (which needs full `node_modules`).
- **better-sqlite3**: native addon — `pnpm rebuild better-sqlite3` when switching Node versions.
- **AUTH_PASS with `#`**: quote it (`AUTH_PASS="my#pass"`) or use `AUTH_PASS_B64`.
- **Gateway optional**: `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` for standalone deployments without gateway connectivity.
