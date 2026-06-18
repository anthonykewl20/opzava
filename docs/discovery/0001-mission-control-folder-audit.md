# 0001: Mission Control Folder Audit

Date: 2026-06-15
Status: CONFIRMED
Related plan: `docs/plans/opzava-start-plan.md`
Related contract: `docs/architecture/folder-structure.md`

## Question

What folder structure does `builderz-labs/mission-control` actually use, and how should `opzava` organize new files without inventing conflicting folders?

## Local Experiment

The upstream repository was cloned for read-only discovery:

```text
git clone --depth 1 https://github.com/builderz-labs/mission-control /tmp/opencode/mission-control
```

Then the top-level directory and key source directories were inspected locally.

Official Next.js project-structure guidance was checked at `https://nextjs.org/docs/app/getting-started/project-structure` on the documented Next.js 16.2.9 page.

## Confirmed Upstream Top-Level Roots

- `.github/`
- `docs/`
- `examples/`
- `messages/`
- `ops/`
- `public/`
- `scripts/`
- `skills/`
- `src/`
- `tests/`
- `wiki/`

The root also contains project config and operational files such as `package.json`, `pnpm-lock.yaml`, `Dockerfile`, `docker-compose.yml`, `eslint.config.mjs`, `next.config.js`, `openapi.json`, `playwright*.config.ts`, `tailwind.config.js`, and `vitest.config.ts`.

## Confirmed `src/` Layout

- `src/app/`: Next.js App Router pages, layouts, route handlers, app assets, and global CSS.
- `src/app/api/`: API route groups. This contains many resource folders, including `settings/`, `tasks/`, `workflows/`, `webhooks/`, `agents/`, `audit/`, `quality-review/`, and others.
- `src/components/`: UI components grouped into `chat/`, `dashboard/`, `layout/`, `modals/`, `onboarding/`, `panels/`, `settings/`, `terminal/`, and `ui/`.
- `src/lib/`: broad application and server logic. It is currently mostly flat and already contains many files.
- `src/lib/adapters/`: existing provider adapter area.
- `src/lib/enforcement/`: existing enforcement helper area.
- `src/lib/__tests__/`: colocated unit tests for library code.
- `src/store/`: client store entry.
- `src/types/`: shared type entry.
- `src/i18n/`: internationalization config.
- `src/test/`: test setup.

## Confirmed Test Layout

- `tests/*.spec.ts`: Vitest/API/integration-style tests.
- `tests/fixtures/`: test fixtures.
- `src/lib/__tests__/*.test.ts`: library unit tests.
- `src/test/setup.ts`: test setup.

## Confirmed Configuration Facts

- `package.json` uses `pnpm@10.29.3` and Node `>=22`.
- TypeScript path alias maps `@/*` to `./src/*`.
- There is no top-level `app/` or `components/` folder. Those live under `src/`.
- Official Next.js docs state that `src/` is supported, App Router files can live under `src/app/`, route groups can organize routes without changing URLs, private folders can opt implementation details out of routing, and Next.js is unopinionated about project organization.
- Existing settings are exposed through `src/app/api/settings/route.ts` and stored in a `settings` database table.
- Existing secret scanning logic lives in `src/lib/secret-scanner.ts`.

## Findings

- New root-level folders would make discovery worse unless they are explicitly justified.
- New Next.js routes should stay under `src/app/`.
- New API handlers should stay under `src/app/api/` and remain thin.
- New UI should either use existing component groups or an approved `opzava` namespace.
- New domain logic should not continue the flat `src/lib` sprawl.
- `opzava` needs one clear namespace for new product code so agents can find it and avoid scattering files.

## Decision Input

Use the upstream structure as the base, but add a single `src/opzava/` namespace for new `opzava` domain code. Keep route and panel files in the existing Next.js/UI locations as thin adapters that call into `src/opzava/`.

New top-level folders require an ARD and an update to `docs/architecture/folder-structure.md` before code is added.
