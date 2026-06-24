# Opzava Folder Structure

This contract exists so AI agents do not reinvent directories, scatter files, or create folders that hide complexity.

It is based on the confirmed upstream folder audit in `docs/discovery/0001-mission-control-folder-audit.md` and the official Next.js project-structure guidance at `https://nextjs.org/docs/app/getting-started/project-structure`.

## Goals

- Preserve the real Mission Control Next.js structure.
- Keep `opzava` domain code easy to discover.
- Stop new flat-file sprawl in `src/lib`.
- Make file placement a gate before code is written.
- Keep route handlers and UI panels thin.
- Make each feature a modular slice that can grow without spreading across unrelated folders.

## Allowed Roots

After Mission Control is imported, allowed top-level roots are the inherited upstream roots plus `CONTEXT.md` and `docs/architecture/`.

- `.github/`: GitHub metadata and workflows.
- `docs/`: plans, ARDs, architecture contracts, discovery notes, benchmarks, and project docs.
- `examples/`: inherited examples only unless an ARD accepts new examples.
- `messages/`: i18n message catalogs.
- `ops/`: operational support scripts and templates.
- `public/`: static assets.
- `scripts/`: project scripts.
- `skills/`: agent skill assets inherited or intentionally added.
- `src/`: application source.
- `tests/`: integration, API, workflow, and end-to-end style tests.
- `wiki/`: inherited documentation if retained.

Allowed top-level operational files include the root `Dockerfile`, `docker-compose*.yml` variants,
`Makefile`, `playwright*.config.ts`, installer scripts, package/toolchain config, `AGENTS.md` agent
instructions, and the explicit `OPZAVA-DOCKER-HANDOFF.md` operator handoff. These files are root-level
because Docker, Dokploy, Playwright, package managers, agent tools, and operator handoff workflows discover
them there; new variants must be narrowly named for a real deployment/test mode, not a vague experiment.

New top-level folders require an ARD and an update to this contract before any files are added.

## Source Layout

Mission Control uses `src/` as the source root. Do not create top-level `app/`, `components/`, `lib/`, or `pages/` folders.

Allowed `src/` roots:

- `src/app/`: Next.js App Router pages, layouts, route handlers, app assets, and global CSS.
- `src/app/api/`: API route handlers only. Route files validate HTTP boundaries and call application services; they do not own workflow policy.
- `src/components/`: shared UI components and thin panel shells that match the existing Mission Control component structure.
- `src/i18n/`: internationalization config.
- `src/lib/`: inherited Mission Control library code only. New Opzava behavior does not go here.
- `src/opzava/`: new `opzava` foundations, platform services, and feature modules.
- `src/store/`: client store entry points.
- `src/test/`: test setup.
- `src/types/`: shared type entry points.

## `src/opzava/` Namespace

All substantial new `opzava` product logic belongs under `src/opzava/` unless this contract says otherwise.

Allowed `src/opzava/` folders:

- `core/`: framework-independent primitives, IDs, result types, errors, base contracts, state-machine helpers, and shared validation utilities.
- `platform/`: cross-feature infrastructure such as the durable runner, provider execution engine, admin config, secret references, audit, costs, observability, and redaction.
- `modules/`: product feature modules. Each module owns one business capability and its contracts, application services, workflow steps, UI, tests, and fixtures.
- `testing/`: cross-module test harness helpers and fake platform services only. Feature-specific fixtures stay with the feature module.

Do not add new folders under `src/opzava/` without updating this contract.

## `src/lib` Boundary

`src/lib` is inherited Mission Control code only. It may be edited when customizing or hardening inherited Mission Control behavior, but new Opzava product behavior belongs in `src/opzava/`.

Do not create global helper dumping grounds. If a helper is needed by one feature, keep it inside that feature module. If it is framework-independent and needed by multiple modules, put it in `src/opzava/core/`. If it touches runtime infrastructure, persistence, providers, config, secrets, audit, costs, or logging, put it in `src/opzava/platform/`.

Do not add new `src/lib/utils.ts`, `src/lib/helpers.ts`, `src/lib/services.ts`, or similarly vague files.

## Platform Subfolders

Allowed `src/opzava/platform/` folders:

- `admin-config/`: admin settings schema, typed config validation, secret references, secret resolution boundary, and redaction.
- `runner/`: durable runner — jobs, attempts, leases, retries, replay, dead letters, retention, and the operational-event store.
- `providers/`: provider contracts and the live/mock execution engine (preflight → credentials → approval → limits → adapter call), plus shared retry/timeout/idempotency plumbing and mock/live adapter wiring.
- `audit/`: audit-event contract and the unified audit read surface.
- `costs/`: cost-event contract and the unified cost read surface.
- `observability/`: centralized log shipping to an external aggregator (pure policy core + IO shipper). Structured logging itself is the inherited `pino` logger in `src/lib/logger.ts`.

There is no `platform/db/` folder (the database connection lives in the inherited `src/lib/db.ts`; repositories are per-module or in `runner/`), no `platform/logging/` folder, and no `platform/module-registry/` folder (composition is call-site — see *Module Registry And Composition*).

Do not add `platform` folders without updating this contract.

## Module Registry And Composition

There is no registry indirection in `src/opzava`. Composition is **call-site**: route handlers, panels, the runner worker, and daemons construct services by importing a module's public `index.ts` and the relevant `platform/` factories, then wiring them together at the point of use. The canonical example is `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`, which composes the runner repository, the provider live-execution runtime, and the runtime-settings loader.

- Feature modules expose public capabilities only through their `index.ts`.
- Route handlers, pages, panels, and runner code use composed services from a module public API or a `platform/` factory.
- Cross-module behavior must go through public module APIs, shared `core` contracts, or platform composition. It must **not** use deep relative imports into another module's internals.
- `src/opzava/platform/` must not depend on feature modules.
- Breaking a public module API requires updating dependent tests and documenting the change in the module README or an ARD when the impact is architectural.

## Path Alias Policy

The upstream Mission Control base already maps `@/*` to `./src/*`. Opzava code should use stable aliases rather than deep relative imports when crossing boundaries.

Required aliases once app source exists:

- `@/opzava/core/*` for framework-independent foundations.
- `@/opzava/platform/*` for cross-feature infrastructure.
- `@/opzava/modules/<feature>` for a module public API.
- `@/opzava/modules/<feature>/*` only inside that same module or its tests.

Do not use deep relative imports such as `../../../modules/content/data/...` across module boundaries.

## Feature Module Contract

Feature modules are the default unit of growth. A new product capability belongs under `src/opzava/modules/<feature>/` unless it is truly cross-feature infrastructure.

Feature modules that exist today:

- `src/opzava/modules/content/`: the SEO content pipeline (idea → keyword research → source capture → SEO brief → outline → article draft → fact-check → brand review → anti-slop review → human approval → WordPress draft) plus the email-campaign send engine. The largest module.
- `src/opzava/modules/team/`: agent roles, statuses, profiles, per-agent activity, and the cross-department pipeline ordering. The only module with its own table (`opzava_agent_roles`) and the only one that couples (via string step-ids) to the other three.
- `src/opzava/modules/social/`: social-media workflow step library (brief → post draft → review → schedule request). Step library only — no tables, no live providers.
- `src/opzava/modules/general-va/`: general-VA workflow step library (task intake → draft → review). Step library only — no tables, no live providers.

Allowed folders inside `src/opzava/modules/<feature>/`:

- `contracts/`: feature artifact schemas, state machines, DTOs, and validation.
- `artifacts/`: feature artifact factories and the feature's artifact repository.
- `workflow/`: workflow definitions and orchestration-facing configuration (singular `workflow/`, as in `content/workflow/`).
- `steps/`: workflow step services — one `*-service.ts` per step, plus the step-executor factory.
- `providers/`: feature-specific provider adapters and execution. Shared provider plumbing stays in `src/opzava/platform/`.
- `campaign/`: a feature's campaign/send orchestration subsystem (only `content` has this today).
- `index.ts`: the module's public API.
- `README.md` / `MODULE.md`: required when a module has more than one folder or any non-obvious boundary. `MODULE.md` is the richer per-module context doc for editing agents (see `docs/architecture/module-doc-template.md`).

A module uses only the folders it needs: `team` is flat files with no subfolders; `social` and `general-va` use only `artifacts/` + `steps/`; `content` is the fullest. The Next.js-conventional folders `application/`, `data/`, `ui/`, and `testing/` are permitted only when a real boundary warrants them — none of the current modules use them. Feature fixtures stay colocated as `*.test.ts` siblings or under `src/opzava/testing/`.

Modules expose public APIs through `index.ts`. Other modules must not import from another module's internals.

Route and UI adapters stay thin. Files under `src/app/`, `src/app/api/`, and `src/components/panels/` may import a module's public API, but they must not own workflow policy, persistence policy, provider calls, or secret resolution.

Module dependency rules:

- Feature modules may import from `src/opzava/core/`.
- Feature modules may call approved interfaces from `src/opzava/platform/`.
- Feature modules may expose events, contracts, or application services through their own `index.ts`.
- Feature modules must not import another feature module's `data/`, `steps/`, `providers/`, or private UI internals.
- `src/opzava/platform/` must not depend on feature modules.
- Cross-feature behavior requires an explicit contract in `core/` or an application service that depends only on public module APIs.

Next.js boundary rules for modules:

- Default module UI to Server Components.
- Put client-only module components under `ui/client/` or give them a clear `*.client.tsx` suffix.
- Server-only module code in `data/`, live `providers/`, `admin-config`, runner, secret resolution, and persistence code must be protected with server-only boundaries during implementation.
- Do not pass secrets, provider responses with sensitive fields, database handles, class instances, or non-serializable objects from server code into client components.

## File Placement Gate

Before creating a file, answer these questions:

1. Is this a Next.js page, layout, or route handler? Put it in `src/app/`.
2. Is this an HTTP API boundary? Put only the boundary in `src/app/api/` and call `src/opzava/` services.
3. Is this generic shared UI? Put it in the existing `src/components/` structure.
4. Is this feature-specific UI? Put the real implementation in `src/opzava/modules/<feature>/ui/` and use a thin adapter under `src/components/` only when Mission Control navigation needs it.
5. Is this `opzava` feature logic, workflow logic, provider mapping, artifact contract, source provenance, content quality, or approval behavior? Put it in `src/opzava/modules/<feature>/`.
6. Is this durable runner, database infrastructure, admin config, secret reference, provider registry, audit, cost, or redaction infrastructure shared by features? Put it in `src/opzava/platform/`.
7. Is this framework-independent base contract or state-machine helper used by multiple modules? Put it in `src/opzava/core/`.
8. Is this a test for API or workflow behavior? Put it in `tests/`.
9. Is this a feature fixture or fake? Put it in `src/opzava/modules/<feature>/testing/`.
10. Is this a unit test for inherited Mission Control library code? Use the existing `src/lib/__tests__/` pattern only for inherited `src/lib` code.
11. Is this a discovery note, benchmark, ARD, or architecture contract? Put it under the matching `docs/` folder.

If none of these answers fit, stop and update this contract before creating the file.

## Folder Rules

- Do not create folders for vibes, vague categories, or one-off files.
- Do not create `src/utils/`, `src/helpers/`, `src/common/`, `src/shared/`, or `src/services/` as catch-all folders.
- Do not add more flat `src/lib/*.ts` files for `opzava` domain behavior.
- Do not create global helper dumping grounds.
- Do not create feature code outside `src/opzava/modules/<feature>/` unless this contract explicitly allows it.
- Do not create technical-layer sprawl inside a feature when the code belongs to one module.
- Do not put workflow policy in route handlers or React components.
- Do not put provider-specific code inside workflow steps.
- Do not put secret resolution outside `src/opzava/platform/` admin-config or approved provider boundaries.
- Do not put generated artifacts, logs, benchmarks, or discovery outputs in source folders.

## Exception Process

New top-level folders require an ARD.

New `src/` roots require an ARD and an update to this contract.

New `src/opzava/` folders require a contract update explaining what belongs there and what does not.

New feature modules require a module README, public `index.ts`, owner, first workflow or use case, tests, and placement in `src/opzava/modules/<feature>/`.

Temporary folders must include an owner, removal trigger, and cleanup date in a discovery note.

## Garbage Collection Checks

Recurring cleanup must scan for:

- New folders not listed in this contract.
- New `src/lib/*.ts` files that should be under `src/opzava/`.
- New feature code outside `src/opzava/modules/<feature>/`.
- Cross-module imports into another module's internals.
- Route handlers containing workflow policy.
- React components containing provider calls or persistence logic.
- Secret resolution outside approved folders.
- Catch-all folders with names like `utils`, `helpers`, `common`, `shared`, or `services`.
- Test fixtures placed outside `tests/fixtures/`, `src/opzava/testing/`, or an approved colocated test folder.
