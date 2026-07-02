# Official Documentation Registry

Validate against official documentation before coding any API. Training knowledge is a starting point, never the source of truth. Use this registry with `CLAUDE.md`, `ARCHITECTURE.md`, the relevant ADR/PRD, and `docs/openclaw` parity constraints.

| Tech | Official documentation source | Notes |
| --- | --- | --- |
| OpenClaw | `docs/openclaw` | Vendored source of truth for this repo. Design to these docs first. |
| Node.js | https://nodejs.org/docs/latest/api/ | Runtime, standard library, CLI flags, and container/runtime compatibility. |
| pnpm | https://pnpm.io | Package manager, workspaces, Corepack setup, lockfile behavior, and build approvals. |
| Turborepo | https://turborepo.com/docs | Task graph, cache behavior, env passthrough, and monorepo execution. |
| Next.js | https://nextjs.org/docs | App Router and server/client API behavior must match current docs. |
| React | https://react.dev | Hooks, server/client component assumptions, and rendering behavior. |
| TypeScript | https://www.typescriptlang.org/docs | Language and compiler behavior. |
| Postgres | https://www.postgresql.org/docs | RLS, transactions, `LISTEN/NOTIFY`, indexes, and SQL semantics. |
| PgBouncer | https://www.pgbouncer.org/documentation/ | Transaction pooling, prepared statement behavior, and connection-pool constraints. |
| Drizzle | https://orm.drizzle.team | ORM schema/query/migration APIs. |
| node-postgres (`pg`) | https://node-postgres.com | Postgres driver API, query config, pooling, and prepared-statement behavior. |
| Prisma | https://www.prisma.io/docs | Only if selected or used behind a port/adapter. |
| Traefik | https://doc.traefik.io | Use `>= v3.6.1` for Docker Engine 29 / Docker API 1.44 compatibility; verify Dokploy's shipped Traefik image/version. |
| Docker | https://docs.docker.com | Engine/API behavior, Compose, labels, networks, health, and socket access. |
| Dokploy | https://docs.dokploy.com | Compose deployer, Traefik integration, network names, ports, secrets, and deployment constraints. |
| `tecnativa/docker-socket-proxy` | https://github.com/Tecnativa/docker-socket-proxy | README is the source for path/env granularity and denied endpoints. |
| Better Auth | https://better-auth.com/docs | AuthPort adapter, sessions, MFA/passkeys, organizations, and advisories. |
| BullMQ | https://docs.bullmq.io | Queues, retries, idempotency, and worker behavior. |
| Redis | https://redis.io/docs | Pub/sub, streams if used, TTLs, and operational behavior. |
| Tailwind CSS | https://tailwindcss.com/docs | Styling API and configuration. |
| shadcn/ui | https://ui.shadcn.com | Component installation and usage conventions. |
| MinIO | https://min.io/docs | S3-compatible object storage behavior and local/dev operations. |
| `ws` | https://github.com/websockets/ws | Node WebSocket client/server API and backpressure behavior. |
| Vitest | https://vitest.dev | Unit/integration test runner, workspace config, coverage, and watch behavior. |
| Playwright | https://playwright.dev/docs/intro | Browser e2e testing, fixtures, locators, and CI/browser installation. |

## Current locked pins

Pin source: `docs/plan/research/slice1-foundation-stack.md`, especially its "Locked pins for the Slice 1 scaffold" section. That section overrides the raw version table where they conflict.

| Tech | Locked pin |
| --- | --- |
| Node.js | `24.18` |
| pnpm | `11.9` |
| Next.js | `16.2.9` |
| React / React DOM | `19.2.7` |
| TypeScript | `5.9.x` (NOT `6.x`) |
| Drizzle ORM / drizzle-kit | `drizzle-orm@0.45.2` / `drizzle-kit@0.31.10` |
| node-postgres (`pg`) | `8.22.0` |
| Postgres | `18.4` |
| Better Auth / Drizzle adapter | `better-auth@1.6.23` / `@better-auth/drizzle-adapter@1.6.23` |
| Tailwind CSS | `4.3` |
| Traefik | `3.6.1` |
| Turborepo | `2.10.x` |
| Vitest | `4` |

## Validation tools

| Tool | Use |
| --- | --- |
| `prefer-vault-docs` skill | Use when implementing secrets, vault-backed references, token storage, or rotation. |
| `openai-docs` skill | Use for OpenAI product/API questions; restrict fallback browsing to official OpenAI domains. |
| WebFetch / WebSearch | Use to verify current official framework, language, library, Docker, Traefik, Dokploy, and vendor docs when local docs are not enough. Prefer official domains and primary sources. |

## Rule

Before coding any API or integration, record which official docs were checked in the issue/PR notes. If official docs conflict with memory, generated code, examples, or third-party posts, the official docs win.
