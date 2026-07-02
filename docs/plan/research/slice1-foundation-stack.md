# Slice 1 foundation stack research memo

Scope: official-doc validation for the Opzava foundation scaffold as of 2026-07. This memo is for planning only; it does not install dependencies or add application code.

## Version pins

| tech | pinned version | official doc URL |
| --- | --- | --- |
| Node.js LTS | `24.18.0` LTS (`node:24.18.0` / `node:24.18.0-bookworm-slim` for containers) | https://nodejs.org/en/download |
| pnpm | `11.9.0`; set `packageManager: "pnpm@11.9.0"` | https://pnpm.io/installation |
| pnpm workspaces | `pnpm-workspace.yaml` with `apps/*` and `packages/*` | https://pnpm.io/workspaces |
| Turborepo | current stable `turbo` from the v3 docs line; pin exact patch when package metadata is resolved during scaffold | https://turborepo.com/docs/getting-started/installation |
| TypeScript | `6.0.3` | https://www.typescriptlang.org/download/ |
| Next.js App Router | `16.2.9` | https://nextjs.org/docs/app/getting-started/installation |
| React / React DOM | `19.2.7` | https://react.dev/learn/installation |
| Drizzle ORM | `drizzle-orm@0.45.2` stable; `1.0.0-rc.4` is latest pre-release | https://github.com/drizzle-team/drizzle-orm/releases |
| drizzle-kit | pair with the Drizzle stable line; re-check exact stable patch before scaffold because official current getting-started uses `@rc` | https://orm.drizzle.team/docs/get-started/postgresql-new |
| node-postgres driver | `pg` current stable, with `@types/pg` dev dependency | https://orm.drizzle.team/docs/get-started/postgresql-new |
| PostgreSQL | `18.4`; Docker image `postgres:18.4-bookworm` or `postgres:18.4` | https://www.postgresql.org/docs/current/index.html |
| PostgreSQL Docker image | `postgres:18.4-bookworm` for explicit Debian base; avoid floating `latest` | https://hub.docker.com/_/postgres |
| Better Auth core | `better-auth` v1.6 docs line; pin exact patch during scaffold | https://better-auth.com/docs/installation |
| Better Auth Drizzle adapter | `@better-auth/drizzle-adapter` v1.6 docs line | https://better-auth.com/docs/adapters/drizzle |
| Better Auth organization plugin | server `organization()` from `better-auth/plugins`; client `organizationClient()` from `better-auth/client/plugins` | https://better-auth.com/docs/plugins/organization |
| Better Auth 2FA/TOTP plugin | server `twoFactor()` from `better-auth/plugins`; client `twoFactorClient()` from `better-auth/client/plugins` | https://better-auth.com/docs/plugins/2fa |
| Better Auth passkey plugin | `@better-auth/passkey` with server `passkey()` and client `passkeyClient()` | https://better-auth.com/docs/plugins/passkey |
| shadcn/ui CLI | `shadcn@latest` at scaffold time; commit generated source instead of depending on a runtime component package | https://ui.shadcn.com/docs/cli |
| Tailwind CSS | `4.3` docs line; use `tailwindcss`, `@tailwindcss/postcss`, and `postcss` | https://tailwindcss.com/docs/installation/framework-guides/nextjs |
| Traefik | `traefik:v3.6.1` minimum; keep same image as Dokploy where possible | https://github.com/traefik/traefik/releases/tag/v3.6.1 |
| Docker Engine API floor for Traefik check | Docker Engine 29 requires API `v1.44+` | https://docs.docker.com/engine/release-notes/29/ |

## Setup and gotchas

### Node.js

- Use Node 24 LTS, not Node 26 Current. Node's release docs say production apps should use Active LTS or Maintenance LTS, and the current LTS download is `v24.18.0`.
- Minimal config: root `.nvmrc` or `.node-version` with `24.18.0`, package `engines.node` compatible with `>=24 <25`, and Docker base images pinned to the same major/patch line.
- Gotcha: Next 16 only requires Node `20.9+`, but pnpm 11 requires Node `>=22`; Node 24 LTS satisfies both and keeps the repo on a single runtime line.

### pnpm workspaces

- Canonical setup: root `pnpm-workspace.yaml` is required. Use:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- Use `corepack enable pnpm` and `corepack use pnpm@11.9.0` during scaffold to write the root `packageManager`.
- Use `workspace:*` for internal dependencies so pnpm refuses accidental registry resolution.
- Gotcha: pnpm no longer links arbitrary workspace packages by default unless `linkWorkspacePackages` is enabled; `workspace:` is the safer monorepo contract.

### Turborepo

- Canonical init: `pnpm dlx create-turbo@latest`, or for an existing repo `pnpm add turbo --save-dev --ignore-workspace-root-check`.
- Minimal config: root `turbo.json` with tasks such as `build`, `typecheck`, `lint`, and `dev`, each declaring `dependsOn`, `outputs`, and cache behavior.
- Official docs still recommend installing `turbo` both globally and as a root devDependency, but the repository pin is what matters for reproducibility.
- Gotcha: design task outputs explicitly. Do not cache `.env`, generated secrets, runtime upload folders, local database files, or Docker state.

### TypeScript

- Install per project/workspace as a dev dependency, not globally: `pnpm add -D typescript`.
- Minimal config: a shared base config package or root `tsconfig.base.json`, then app/package configs extending it.
- Gotcha: Next App Router has built-in TypeScript support and currently documents minimum TypeScript `5.1.0`, but pinning TypeScript 6 requires checking downstream types for Drizzle, Better Auth, and Next plugin compatibility before scaffold lock-in.

### Next.js App Router

- Canonical init: `pnpm create next-app@latest apps/web --typescript --eslint --app`.
- Manual install: `pnpm i next@16.2.9 react@19.2.7 react-dom@19.2.7`.
- Minimal App Router files: `app/layout.tsx` with `<html>` and `<body>`, `app/page.tsx`, `app/api/.../route.ts` for route handlers.
- Server actions/data mutation: use the App Router docs for `use server` actions, route handlers, and cache revalidation. Keep BFF APIs in route handlers when the call is an external integration boundary, streaming endpoint, webhook, or non-form API.
- Gotcha: Turbopack is the default bundler in Next 16. `next build` no longer runs lint automatically; wire lint as a separate package script and turbo task.

### React

- Use React 19 with Next 16. The Next docs say App Router uses React canary releases internally for framework-validated features, but `react` and `react-dom` must still be declared for tooling and ecosystem compatibility.
- Minimal config: `react@19.2.7`, `react-dom@19.2.7`, matching `@types/react` / `@types/react-dom` only if needed by the scaffold.
- Gotcha: Server Components remain the default in the App Router. Mark browser-only component roots with `"use client"` sparingly.

### Drizzle ORM and drizzle-kit

- Official PostgreSQL setup installs `drizzle-orm`, `pg`, `dotenv`, plus dev `drizzle-kit`, `tsx`, and `@types/pg`.
- Minimal `drizzle.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- Use `drizzle-kit generate` to create SQL migrations and `drizzle-kit migrate` to apply them. Avoid `push` for shared environments because it bypasses explicit migration review.
- For RLS-friendly access, use Drizzle transactions and set tenant/session context inside the same transaction before tenant-scoped queries. Drizzle supports nested transactions/savepoints; keep the tenant transaction wrapper in an adapter/composition layer rather than exporting raw tables from domain packages.
- Gotcha: Drizzle's official docs currently emphasize the `@rc` v1 path while GitHub marks `v1.0.0-rc.4` as a pre-release. For a strict "stable only" scaffold, pin the latest stable `0.45.2` line and schedule a deliberate v1 upgrade ADR when v1 is no longer pre-release.

### PostgreSQL

- Pin `postgres:18.4-bookworm` or `postgres:18.4`. Do not use `postgres`, `postgres:latest`, or `postgres:18`.
- Minimal Compose config: set `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD_FILE` or equivalent secret-file mechanism. Use a durable volume.
- Gotcha: the official Postgres image changed `PGDATA` behavior in PostgreSQL 18+: the version-specific data directory is `/var/lib/postgresql/18/docker`, and the declared volume is `/var/lib/postgresql`. Mount volumes accordingly.
- Gotcha: use Docker secrets or local ignored secret files for passwords. The official image supports `_FILE` variants for `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_INITDB_ARGS`.

### Better Auth

- Install core: `pnpm add better-auth`.
- Required env: `BETTER_AUTH_SECRET` with at least 32 high-entropy characters and `BETTER_AUTH_URL`.
- Next App Router handler:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

- Drizzle adapter: install `@better-auth/drizzle-adapter`, import `drizzleAdapter` from that package, and set `provider: "pg"`.
- Plugin names confirmed:
  - Organization: `organization()` and `organizationClient()`.
  - Two-factor/TOTP: `twoFactor()` and `twoFactorClient()`.
  - Passkey: package `@better-auth/passkey`, server `passkey()`, client `passkeyClient()`.
- Migration flow with Drizzle: run `auth generate`, then `drizzle-kit generate`, then `drizzle-kit migrate`. Do not rely on Better Auth's direct `migrate` command for Drizzle; docs state direct migrate is for the built-in Kysely adapter.
- Gotchas:
  - The Drizzle adapter package path has changed from older examples. Current adapter docs use `@better-auth/drizzle-adapter`; the installation page still shows `better-auth/adapters/drizzle`, so prefer the dedicated adapter page for scaffold code.
  - Organization legacy `organizationCreation` hooks are deprecated; use `organizationHooks`.
  - 2FA only gates credential sign-in endpoints by default. Passwordless/OAuth/passkey flows need custom enforcement if Opzava requires universal step-up MFA.
  - When chaining server-side `auth.api.*` calls during 2FA, forward cookies/headers from one response to the next so pending 2FA state is preserved.
  - Passkey registration and sign-in responses do not honor `throw: true` the same way normal auth calls do; handle returned error objects explicitly.

### shadcn/ui

- Existing app setup: `pnpm dlx shadcn@latest init` from `apps/web`, or `pnpm dlx shadcn@latest init -c apps/web` from the repo root.
- Monorepo setup: `pnpm dlx shadcn@latest init -t next --monorepo`.
- Add components with `pnpm dlx shadcn@latest add button -c apps/web`.
- Minimal config: `components.json`, `@/*` alias, Tailwind CSS configured first, and generated components committed under the selected UI package/app path.
- Gotcha: shadcn/ui is source-generation, not a traditional component runtime package. Keep generated UI code in Opzava's repo and review diffs like normal source.

### Tailwind CSS

- Tailwind v4 is current in the official docs (`v 4.3`).
- Correct Next.js integration is PostCSS with `tailwindcss`, `@tailwindcss/postcss`, and `postcss`.
- Minimal `postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- Minimal global CSS: `@import "tailwindcss";`.
- Gotcha: v4 no longer starts with the v3 `tailwind.config.js` + `content` setup as the default path. Only add a Tailwind config when Opzava has real theme/plugin needs.

### Traefik

- Pin at least `traefik:v3.6.1`. The official Traefik release notes for v3.6.1 include the Docker API auto-negotiation fix, and Docker Engine 29's official release notes state the daemon requires API `v1.44+`.
- Minimal Docker provider flags:

```yaml
command:
  - "--providers.docker=true"
  - "--providers.docker.exposedbydefault=false"
  - "--providers.docker.network=dokploy-network"
  - "--entrypoints.web.address=:80"
  - "--entrypoints.websecure.address=:443"
```

- Runtime Gateway containers must include explicit labels: `traefik.enable=true`, `traefik.docker.network=dokploy-network`, router rule, TLS resolver, middleware chain, and service port.
- Gotcha: Traefik's Docker provider defaults `exposedByDefault` to `true`; ADR-015 correctly requires `false`.
- Gotcha: Docker-provider discovery is distinct from Swarm-provider discovery. ADR-015 is correct that plain runtime tenant containers require Docker-provider visibility.

## Deltas vs ADR-001

- Confirmed: the `apps/*` plus `packages/*` layout matches pnpm workspace and Turborepo conventions.
- Confirmed: `apps/web`, `apps/gateway-broker`, and `apps/workers` are a sound deployable split for Next BFF, broker ACL, and background work.
- Confirmed: internal domain package dependencies should use `workspace:*`; this should be made explicit in ADR-001 or scaffold standards.
- Adjust: add a root `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.node-version`, and package-manager pin to the foundation scaffold checklist.
- Adjust: add `packages/ui` if Opzava uses shadcn's monorepo mode. shadcn's monorepo docs expect shared UI imports such as `@workspace/ui/...`; keeping UI only under `apps/web/components` is acceptable only if we deliberately avoid shared UI packages.
- Adjust: add `packages/config` or equivalent shared config packages for TypeScript, lint, and Tailwind/PostCSS if multiple apps/packages need the same settings.
- Adjust: treat Drizzle v1 as a future migration decision, not an automatic greenfield default, until the official release is stable rather than `rc`.
- Adjust: ADR-015's Traefik `>=3.6.1` note is correct for Docker Engine 29 / Docker API 1.44; pin the image rather than expressing only a range in Compose.

## Consensus resolutions (codex-exec + mmx, 2026-07-02)

Reconciled scaffold contract. codex validated versions against official docs; mmx ran an adversarial design review; both agreed on the load-bearing calls. Where noted, these override the raw pins above.

Locked pins for the Slice 1 scaffold:

- TypeScript: pin `5.9.x`, NOT `6.0.3`. Both reviewers flag the TS6 major bump as the top scaffold risk (peer-range lag across Next 16, Drizzle 0.45, Better Auth 1.6, and test-runner types). Upgrade to TS6 later behind a dedicated ADR once peers declare support.
- Drizzle ORM: `0.45.2` stable (confirmed by both); never pin the `1.0.0-rc.4` pre-release in greenfield. Pin `drizzle-kit` to the matching stable patch.
- Better Auth: `1.6.x` core, exact-pinned. Resolve the Drizzle adapter import path from the INSTALLED package manifest (`node_modules/@better-auth/drizzle-adapter/package.json` `exports`), not the stale installation docs page, and add a CI check that the adapter import resolves inside the adapter package. Smoke-test `auth.api.getSession` in a server action before adopting passkey/twoFactor.
- Everything else per the version table above (Node 24.18.0, pnpm 11.9.0, Turborepo stable, Next 16.2.9, React 19.2.7, Postgres 18.4-bookworm, shadcn source-gen, Tailwind 4.3, Traefik v3.6.1).

Day-one foundation additions (must be scaffolded, not retrofitted):

- Env schema validation: zod schema in `apps/web/lib/env.ts`, fail-fast at boot via `instrumentation.ts`. Passkey RP-ID + origin allowlist and all secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`) flow through it.
- Pooler-aware DB client: Drizzle over `pg` behind PgBouncer TRANSACTION mode. RLS uses `SET LOCAL app.current_org` per request, so prepared statements / statement cache MUST be disabled and every tenant query wrapped in a transaction (the `withTenant` wrapper). Document why session pooling is incompatible with per-request RLS.
- Migration gating: `better-auth generate` -> `drizzle-kit generate` -> `drizzle-kit migrate` in one hash-checked one-shot/CI job; never run migrations from app/broker/worker containers; `--force`/`push` forbidden for shared envs.
- DDD boundary enforcement: ESLint flat config (Next 16 removed `next lint`) + Prettier + `eslint-plugin-boundaries` enforcing `apps/* -> packages/*` directionality and the ADR-001 rule that bounded-context packages export only commands/queries/events/DTOs.
- Test runner: Vitest workspaces (unit) + Playwright (web e2e). No Jest.
- Secrets: no `.env` committed; docker-compose `secrets:` + `_FILE` env for Postgres; Traefik file provider for TLS material.
- Turbo: explicit `dependsOn: ["^build"]` and an env passthrough allowlist (`DATABASE_URL`, `BETTER_AUTH_SECRET`, ...); never inherit env blindly.
- Postgres 18 volume target `/var/lib/postgresql` (data dir is `/var/lib/postgresql/18/docker`); pin `postgres:18.4-bookworm`.
- pnpm: `workspace:*` for internal deps; `pnpm.overrides` to defeat phantom-version drift on stale-doc deps.

Exact patch pins for Turborepo, Better Auth 1.6 packages, shadcn CLI, and drizzle-kit are resolved during `pnpm install` lockfile creation (codex open-question), then committed.
