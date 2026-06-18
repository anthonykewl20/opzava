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
- `platform/`: cross-feature infrastructure such as durable runner, database repositories, migrations, provider registry, admin config, secret references, audit, costs, logging, and redaction.
- `modules/`: product feature modules. Each module owns one business capability and its contracts, application services, workflow steps, UI, tests, and fixtures.
- `testing/`: cross-module test harness helpers and fake platform services only. Feature-specific fixtures stay with the feature module.

Do not add new folders under `src/opzava/` without updating this contract.

## `src/lib` Boundary

`src/lib` is inherited Mission Control code only. It may be edited when customizing or hardening inherited Mission Control behavior, but new Opzava product behavior belongs in `src/opzava/`.

Do not create global helper dumping grounds. If a helper is needed by one feature, keep it inside that feature module. If it is framework-independent and needed by multiple modules, put it in `src/opzava/core/`. If it touches runtime infrastructure, persistence, providers, config, secrets, audit, costs, or logging, put it in `src/opzava/platform/`.

Do not add new `src/lib/utils.ts`, `src/lib/helpers.ts`, `src/lib/services.ts`, or similarly vague files.

## Platform Subfolders

Allowed `src/opzava/platform/` folders:

- `db/`: database connection wrappers, repositories shared across modules, and migration helpers.
- `runner/`: durable runner, jobs, attempts, retries, locks, replay, and dead letters.
- `providers/`: provider registry, provider contracts, shared retry/timeout/idempotency plumbing, and mock/live adapter wiring.
- `admin-config/`: admin settings schema, typed config validation, secret references, secret resolution boundary, and redaction.
- `audit/`: audit-event writing and audit queries.
- `costs/`: cost-event writing and usage accounting.
- `logging/`: structured logging, correlation IDs, and redaction utilities.
- `module-registry/`: module registration and service composition.

Do not add `platform` folders without updating this contract.

## Module Registry And Composition

The module registry is the composition layer. It wires feature modules into the app without forcing modules to import each other's internals.

- Feature modules register public capabilities through their `index.ts`.
- `src/opzava/platform/module-registry/` may import public module APIs.
- `src/opzava/platform/module-registry/` must not import module internals such as `data/`, `steps/`, `providers/`, or private UI files.
- Route handlers, pages, panels, and runner code use composed services from the registry or a module public API.
- Cross-module behavior must go through public module APIs, shared `core` contracts, or platform composition. It must not use deep relative imports.
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

Initial feature modules:

- `src/opzava/modules/content/`: content workflow, SEO briefs, outlines, article drafts, source provenance, fact-check reports, brand reviews, anti-slop reviews, and WordPress draft requests.
- `src/opzava/modules/outreach/`: deferred until the content workflow proves the runner, artifacts, approvals, audit, admin config, and integration contracts.

Allowed folders inside `src/opzava/modules/<feature>/`:

- `contracts/`: feature artifact schemas, state machines, DTOs, and validation.
- `application/`: feature use cases and application services. This is where route handlers and UI actions call into the feature.
- `workflows/`: workflow definitions and orchestration-facing feature configuration.
- `steps/`: workflow step implementations.
- `data/`: feature repositories, persistence mappers, and feature-owned queries.
- `providers/`: feature-specific provider adapters or provider mappers. Shared provider plumbing stays in `src/opzava/platform/`.
- `ui/`: feature UI components. Client islands must be small and explicit.
- `testing/`: feature fixtures, fake adapters, builders, and test harness helpers.
- `index.ts`: the module's public API.
- `README.md`: required when a module has more than one folder or any non-obvious boundary.

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
