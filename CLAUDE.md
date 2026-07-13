# Opzava

AI-workforce PM/CRM SaaS built on top of OpenClaw. Opzava owns the product system of record (tenants, policy, billing, approvals, audit, UI); OpenClaw owns runtime execution (sessions, channels, skills, memory, Workboard, cron, logs) and is reached only through the `gateway-broker` anti-corruption layer.

## Commands

Node 24 and pnpm 11 (see `.node-version` / `packageManager`). Turborepo drives the workspace scripts.

```bash
make up          # docker compose up -d (creates dokploy-network + local postgres secret first)
make down        # stop the stack
make logs        # follow compose logs
make db-shell    # psql into the local Postgres
pnpm dev         # turbo run dev across apps

pnpm typecheck   # tsc --noEmit everywhere
pnpm lint        # eslint (incl. eslint-plugin-boundaries layering rules)
pnpm format      # prettier --write
pnpm test        # vitest across the workspace
```

Targeted runs use pnpm filters, e.g. `pnpm --filter @opzava/web test`, `pnpm --filter @opzava/adapters test:integration` (Postgres RLS tests, needs the stack up).

E2E: `pnpm --filter @opzava/web test:e2e` — Playwright, tests in `apps/web/e2e`, base URL `http://web.opzava.localhost:18088`.

Migrations: `pnpm --filter @opzava/adapters db:generate` (drizzle-kit) then `db:migrate`.

## Layout

Monorepo (`apps/*`, `packages/*`), one bounded-context package per domain.

**Apps**
- `apps/web` — Next.js App Router; both UI and BFF (server actions / route handlers).
- `apps/gateway-broker` — the only anti-corruption layer to OpenClaw: WS operator client, tenant→Gateway routing, streaming relay, browser WS hub.
- `apps/workers` — projections, metering, jobs, provisioning, seeds.
- `apps/mcp-server` — MCP surface over Opzava.

**Packages**
- `packages/ports` — capability port interfaces. Domain code depends on these, never on vendor SDKs or Gateway DTOs.
- `packages/adapters` — concrete implementations (Postgres/Drizzle, S3, broker clients).
- `packages/identity-access`, `project-management`, `crm`, `runtime-control` — bounded contexts.
- `packages/shared-kernel` — cross-context primitives; `packages/config` — shared lint/ts config.

`mainframe/` is Opzava's tracked fork of OpenClaw; the Platform Gateway image is built from it.

## Architecture invariants

These are enforced by review (and partly by `eslint-plugin-boundaries`); breaking them is a design change, not a fix.

- **Ports, not vendors.** Core domain code imports from `@opzava/ports`. Only `packages/adapters` knows about Drizzle, S3, or OpenClaw DTOs.
- **`gateway-broker` is the only path to OpenClaw.** Nothing else talks to a Gateway.
- **Postgres is the system of record.** Projections are rebuildable caches; RPC snapshots are truth, WS events are only hints.
- **Tenant isolation is RLS-backed.** Queries run inside the tenant wrapper; an RLS denial must surface as a hard 403, never as an empty result set.
- **Tool policy beats agent claims.** What an agent asserts about itself never widens what it may do.
- **Local compose mirrors the Dokploy deployment.** Changes to one belong in the other.

## Docs

- `ARCHITECTURE.md` — system overview, bounded contexts, ports, deployment, ADR index.
- `CONTEXT.md` — canonical glossary; use these terms exactly.
- `docs/adr/` — architecture decisions. `docs/prd/` — product specs.
- `docs/openclaw/` — vendored OpenClaw docs; design against these rather than assumptions.
- `docs/plan/official-docs.md` — registry of official upstream docs. Verify framework/library APIs here before coding; training knowledge is a starting point, not the source of truth.
- `docs/runbooks/` — ops procedures.

## Conventions

- Branch off `development`; that is the PR target.
- Keep scratch work, probes, and generated artifacts out of the repo root — E2E scripts, fixtures, and helpers belong in the standard test areas so later work can reuse them.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`anthonykewl20/opzava`), driven by the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) map to identically named labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
