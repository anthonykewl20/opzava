# Slice 1a Foundation Scaffold Review (adversarial)

| severity | file:line | issue | fix |
| --- | --- | --- | --- |
| blocker | `apps/web/Dockerfile:10`,`apps/web/Dockerfile:17` | Docker build for web is hard-pinned to `--frozen-lockfile` but `pnpm-lock.yaml` is absent, so `docker compose up`/image build fails on a clean checkout. | Add/check in `pnpm-lock.yaml` and align install mode (or switch to non-frozen install with explicit lockfile verification step). |
| blocker | `docker-compose.yml:69` | Compose mounts `./secrets/postgres_password`, but only `secrets/postgres_password.example` is tracked; without a real file, compose creation/bind-injection fails. | Add a local secret bootstrap path (`secrets/postgres_password` created from `.example`) and/or CI gate to ensure the secret exists before up. |
| blocker | `docker-compose.yml:12` | `--api.insecure=true` is always enabled, while ADR-015 requires the dashboard to be local-only; this breaks Dokploy parity and exposes a privileged endpoint in shared compose usage. | Scope dashboard flags under a `local` profile and disable insecure dashboard for deployment mode. |
| high | `docker-compose.yml:47` | `web` gets `DATABASE_URL` without credentials (`postgres://opzava@postgres...`) while Postgres is started with `POSTGRES_PASSWORD_FILE`, so runtime DB connection is effectively broken unless extra env mutation is happening elsewhere. | Inject DB URL from secret-backed values (`DATABASE_URL_FILE` or secret-derived URL) and keep raw credentials out of config. |
| high | `docker-compose.yml:62` | `dokploy-network` is marked external only; local first-run requires a pre-existing network or compose cannot start. | Create the network in docs/process and/or remove `external: true` unless explicitly attached to Dokploy lifecycle. |
| medium | `package.json:6` | `engines.node` is a broad `>=24 <25` range, which allows patch drift from the pinned `24.18.0` contract. | Pin Node version more strictly in the contract (`24.18.x`/exact), add `.node-version` or `.nvmrc`, and fail if drifted. |
| medium | `apps/web/lib/env.ts:8`,`apps/web/lib/env.ts:10` | `DATABASE_URL` and `BETTER_AUTH_SECRET` are optional in schema; this undercuts the “fail-fast at boot” contract for required secrets once those slices are enabled. | Keep optional now only if truly optional; otherwise require and fail on startup with clear errors. |
| medium | `apps/gateway-broker/package.json:13`,`apps/workers/package.json:13` | `tsc` scripts run but those apps do not declare TypeScript/Vitest/ESLint directly, relying on root dependency hoisting and risking non-deterministic script execution in strict setups. | Declare required dev tooling in workspace package `devDependencies` or document mandatory root-level execution assumptions. |
| low | `vitest.workspace.ts:3`,`vitest.workspace.ts:4` | Workspace test graph points to `apps/*/vitest.config.ts`, but gateway/workers do not have one and are effectively omitted from workspace orchestration. | Add app-level vitest configs if needed, or constrain workspace globs to existing test configs only. |

VERDICT: FIX-FIRST (3 blocker(s))

Scope check: no auth/task-domain/db-schema implementation code appears in 1a; only port contracts + shell UI/env bootstrap are present.
