# packages/config - shared build configs
> Part of the Opzava architecture (see ../README.md). Vocabulary: codebase-design.

## Overview
`packages/config` is the build-time configuration layer, private to the monorepo (`private: true`, `package.json:3`) and consumed by composition roots and library packages through a declared `exports` map (`packages/config/package.json:5-12`).
It owns six shared modules: one ESLint policy, one PostCSS plugin set, one Tailwind preset, and three TypeScript compiler profiles that together form the repo-wide compiler baseline.
The key invariant is "one source of truth for build discipline": every app and package extends the same ESLint rules and the same `tsconfig` chain so that import restrictions and compiler strictness cannot drift per package.

## Modules

### ESLint base - `packages/config/eslint/base.mjs`
- **Interface (the seam):** a default-exported ESLint flat-config array (`packages/config/eslint/base.mjs:7-94`).
  Callers consume it by re-exporting it as their entire `eslint.config.mjs`, as the repo root does (`eslint.config.mjs:4-6`).
  Invariants: the array is ordered (ignores first, then `@eslint/js` recommended, then `typescript-eslint` recommended, then the boundary/restricted-imports block); the boundary block applies only to `apps/**` and `packages/**` source files (`base.mjs:5,20`); unknown cross-element imports are errors by default (`base.mjs:52` `default: "disallow"`).
  Error modes: a wrong element pattern silently fails to match rather than throwing, so mis-typed package types degrade to "no rule fires."
- **Behind the seam (implementation):** two behavioral policies live here.
  First, an `eslint-plugin-boundaries` element map of 17 patterns split into types `app`, `shared-kernel`, `ports`, `adapters`, `config`, and `bounded-context` (`base.mjs:26-46`), paired with an allow-list that enforces the agnostic-ports layering: apps may import adapters, bounded-contexts, config, ports, shared-kernel; ports may import only shared-kernel; adapters and bounded-contexts may import ports and shared-kernel; config and shared-kernel may import nothing internal (`base.mjs:49-75`).
  Second, a `no-restricted-imports` rule that bans importing app packages (`apps/*`, `@opzava/web`, `@opzava/gateway-broker`, `@opzava/workers`) and bans deep `*/src/*` imports so packages are reached only through their public barrel (`base.mjs:77-91`).
  External libs: `@eslint/js`, `eslint-plugin-boundaries`, `typescript-eslint` (`base.mjs:1-3`).
- **Adapters:** consumes none.
  Satisfies no Port; this is configuration data, not an adapter (`packages/config/package.json:18-21` declares `eslint` and `typescript` only as peer dependencies).
  The complexity it hides is the entire import-discipline policy that would otherwise have to be re-stated in every app and package.
- **Depth:** moderate.
  Deletion test: deleting it forces the 17-element boundary map plus the two restricted-import rule groups to be re-stated in every consumer, so it concentrates real policy even though its shape is "a config object."
  It is the deepest module in this package because it is the only one that carries behavior rather than declarative plumbing.
- **Seams:** one external seam (the default export) consumed by exactly one caller, the repo-root `eslint.config.mjs` (`eslint.config.mjs:4`), which re-exports it unchanged.
  Internal coupling: the `boundaries/elements` patterns are coupled to the on-disk package layout and to the bounded-context plan, so any package rename or addition must be mirrored here.
- **Testing through the interface:** the interface is the test surface; a contract would assert that a forbidden import (an app imported from a port) triggers `boundaries/element-types` and that a `*/src/*` deep import triggers `no-restricted-imports`.
  No test file exists for this module (unverified claim from inventory; `packages/config` has only `lint`, `format`, `format:check` scripts, `package.json:13-17`).
  Gap: the boundary map is asserted only incidentally, by lint runs on real code, never by a focused test.
- **Deepening opportunity:** extract the `boundaries/elements` list and the allow-rules into a data file derived from the workspace catalog (pnpm `catalog` or `pnpm-workspace.yaml` package list) so the element map cannot drift ahead of the real packages; the flat-config array then reads from that source of truth.
  Today this is already the canonical deepening target because the map has drifted (see Cross-cutting notes).

### PostCSS next - `packages/config/postcss/next.mjs`
- **Interface (the seam):** a default-exported PostCSS config object with a single plugin entry `{ "@tailwindcss/postcss": {} }` (`packages/config/postcss/next.mjs:1-7`).
  Invariant: exactly one plugin is registered; the export is a plain object consumed by `postcss.config.mjs` via Node module resolution.
  Error mode: a renamed or missing `@tailwindcss/postcss` package surfaces as a build-time resolution error at the consumer, not here.
- **Behind the seam (implementation):** no hidden behavior; the object literal is the whole implementation.
  External lib: `@tailwindcss/postcss` (`postcss/next.mjs:3`).
- **Adapters:** none; configuration data, not a Port adapter (`packages/config/package.json:7`).
  The complexity it hides is trivial: it standardizes the Tailwind PostCSS pipeline name across Next.js apps.
- **Depth:** shallow.
  Deletion test: deleting it moves one object literal into the single consumer `apps/web/postcss.config.mjs:1`, so no complexity is concentrated.
- **Seams:** one external seam consumed by exactly one caller, `apps/web/postcss.config.mjs`, which re-exports it as `export { default } from "@opzava/config/postcss/next"` (`apps/web/postcss.config.mjs:1`).
  This is the only consumer in the repo that reaches a config module through the declared `@opzava/config` package name.
- **Testing through the interface:** no test surface is meaningful beyond asserting the export shape equals `{ plugins: { "@tailwindcss/postcss": {} } }`.
  No test file exists (matches inventory).
  Gap: none worth closing; the module is below the threshold where a test pays back.
- **Deepening opportunity:** none - already as shallow as it can be, and correctly so for a one-plugin PostCSS config.

### Tailwind preset - `packages/config/tailwind/preset.css`
- **Interface (the seam):** a single CSS statement `@import "tailwindcss"` intended to be imported by downstream app stylesheets (`packages/config/tailwind/preset.css:1`).
  Exported as `"./tailwind/preset.css": "./tailwind/preset.css"` in the package `exports` map (`packages/config/package.json:8`).
  Invariant: the file is a stylesheet seam, resolved by the Tailwind/PostCSS pipeline at build time.
- **Behind the seam (implementation):** no implementation beyond the import statement; all behavior is external to this file.
  External lib: `tailwindcss` (resolved transitively through the `@import`).
- **Adapters:** none; stylesheet configuration, not a Port adapter.
- **Depth:** shallow.
  Deletion test: deleting it removes one import line that no consumer references, so nothing in the repo changes.
- **Seams:** the export is declared but currently has zero consumers.
  `apps/web/app/globals.css:1` writes `@import "tailwindcss"` directly instead of importing `@opzava/config/tailwind/preset.css` (`apps/web/app/globals.css:1-5`), and a repo-wide grep for `config/tailwind` or `preset` returns only the `package.json` export declaration.
  The seam is therefore hypothetical, not real, by the "one adapter = hypothetical seam" rule.
- **Testing through the interface:** no test surface; a stylesheet import is exercised only by a build.
  No test file exists (matches inventory).
  Gap: the module is unused, so the gap is "decide whether to wire it into `globals.css` or delete the export."
- **Deepening opportunity:** none.
  The actionable step is the opposite of deepening: either consume this preset from `apps/web/app/globals.css` so the Tailwind entry point has one source of truth, or remove the orphan export from `packages/config/package.json:8`.

### tsconfig base - `packages/config/tsconfig/base.json`
- **Interface (the seam):** a `tsconfig` object that extends the repo-root `tsconfig.base.json` (`packages/config/tsconfig/base.json:3` resolves to `../../../tsconfig.base.json`, i.e. the file at `tsconfig.base.json`) and adds `declaration`, `declarationMap`, and `sourceMap` (`base.json:4-8`).
  Invariant: this file is the shared mid-point in the extends chain `consumer -> nextjs.json|node-lib.json -> base.json -> repo-root tsconfig.base.json`.
  Error mode: a wrong `extends` path breaks every consumer at once because the chain is single-rooted.
- **Behind the seam (implementation):** three flags layered on top of the strict baseline defined at the repo root (`tsconfig.base.json:1-23` sets `target`, `module`, `moduleResolution`, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and the rest of the repo-wide strictness).
  The real complexity is in the repo-root file, not here; this file is a thin declaration-emitting layer.
- **Adapters:** none; compiler configuration, not a Port adapter.
  No external libs are declared here (`base.json` adds none beyond what the repo root sets).
- **Depth:** shallow.
  Deletion test: deleting it folds three flags into `nextjs.json` and `node-lib.json` (which both already repeat `declaration`/`declarationMap`/`sourceMap`, so the duplication already exists today - see `nextjs.json:6-7` is absent but `node-lib.json:6-8` duplicates them), so no net complexity concentrates or disperses.
- **Seams:** one internal seam consumed only by `nextjs.json` (`nextjs.json:3`) and `node-lib.json` (`node-lib.json:3`); no consumer extends `base.json` directly.
  Coupling note: the relative `extends` path couples this file to its position in the tree, so moving `packages/config` would break the chain.
- **Testing through the interface:** the test surface is "TypeScript still type-checks every consumer"; there is no unit test for a JSON config.
  No test file exists (matches inventory).
  Gap: no `tsconfig`-level guard asserts that the strict flags in the repo-root baseline survive the extends chain, so a regression to `strict: false` somewhere in the chain would be caught only by a full type-check.
- **Deepening opportunity:** none - already appropriately thin.
  Worth noting as friction: `nextjs.json` and `node-lib.json` redeclare `declaration`/`declarationMap`/`sourceMap` that `base.json` already sets, so those three keys could be dropped from the children to keep one source of truth in `base.json`.

### tsconfig nextjs - `packages/config/tsconfig/nextjs.json`
- **Interface (the seam):** a `tsconfig` profile extending `./base.json` (`packages/config/tsconfig/nextjs.json:3`) with Next.js-specific compiler options: `allowJs: false`, `incremental: true`, `jsx: "preserve"`, DOM libs, `noEmit: true`, and the `next` TypeScript plugin (`nextjs.json:4-11`).
  Invariant: `noEmit: true` means Next.js owns emission; this profile only type-checks.
  Error mode: the `next` plugin reference (`nextjs.json:10`) is a build-time seam that must stay aligned with the consuming Next.js toolchain version.
- **Behind the seam (implementation):** declarative compiler plumbing; no behavior beyond option values.
  External lib: `next` (via the plugin entry).
- **Adapters:** none; compiler configuration.
  The complexity it hides is the Next.js-tuned subset of strictness + the JSX/plugin wiring that every Next.js app would otherwise repeat.
- **Depth:** shallow.
  Deletion test: deleting it forces the one Next.js consumer (`apps/web`) to redeclare the DOM libs, JSX mode, and plugin entry, a small amount of duplicated plumbing.
- **Seams:** one external seam consumed by exactly one caller, `apps/web/tsconfig.json:2`, which extends it via a relative path (`../../packages/config/tsconfig/nextjs.json`) rather than the `@opzava/config` package name.
  Coupling note: only one Next.js app exists today, so this profile is single-consumer; a second Next.js app would promote it from "shared baseline" to "real shared seam."
- **Testing through the interface:** test surface is the Next.js build and type-check.
  No test file exists (matches inventory).
  Gap: no contract asserts that `noEmit` stays true (a flip would cause `tsc` to emit into the app, conflicting with Next.js).
- **Deepening opportunity:** none - correctly declarative.
  Friction: `apps/web/tsconfig.json` reaches this file by relative path, bypassing the `@opzava/config/tsconfig/nextjs.json` export declared in `packages/config/package.json:10`; standardizing on the package name would make the consumer resolver-managed.

### tsconfig node-lib - `packages/config/tsconfig/node-lib.json`
- **Interface (the seam):** a `tsconfig` profile extending `./base.json` (`packages/config/tsconfig/node-lib.json:3`) with Node-library options: `lib: ["ES2022"]`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, and `types: ["node"]` (`node-lib.json:4-9`).
  Invariant: this is the shared compiler contract for every library package and Node-side app that emits `dist`.
  Error mode: an incorrect `lib` or `types` setting ripples to every library package at once.
- **Behind the seam (implementation):** declarative option values; the `types: ["node"]` entry pulls in `@types/node` so Node globals are visible without per-package configuration.
  External lib: `node` types (`node-lib.json:9`).
- **Adapters:** none; compiler configuration.
  The complexity it hides is the declaration-emitting, Node-typed compiler shape shared across the worker apps and library packages.
- **Depth:** shallow but load-bearing.
  Deletion test: deleting it forces 10 consumers to redeclare the same five options, so it concentrates a real, repeated compiler contract even though each option is trivial.
  It is the second-most-load-bearing module in this package after `eslint/base.mjs`.
- **Seams:** one external seam consumed by 10 callers, the heaviest tsconfig seam in the repo.
  Consumers are `apps/gateway-broker`, `apps/workers`, `apps/mcp-server`, `packages/project-management`, `packages/identity-access`, `packages/shared-kernel`, `packages/ports`, `packages/adapters`, and `packages/runtime-control` (each `tsconfig.json` extends it, confirmed by grep). CRM was removed and is deferred to the future user-side dashboard (GitHub issue #200).
  Consumer style is inconsistent: `packages/ports/tsconfig.json:2` reaches it via the `@opzava/config/tsconfig/node-lib.json` package name, while the other nine extend it by relative path (`../../packages/config/...` or `../config/...`), so the declared `exports` entry (`packages/config/package.json:11`) is bypassed in most cases.
- **Testing through the interface:** test surface is the per-package `tsc` type-check and build.
  No test file exists (matches inventory).
  Gap: nothing asserts that every library package extends this profile; a package could add a hand-rolled `tsconfig.json` and silently diverge from the strictness baseline.
- **Deepening opportunity:** none at the option level.
  The high-value change is consistency, not depth: pick one resolution style (package name vs relative path) for all 10 consumers so the `exports` map is either authoritative or removed, removing the current mixed-access friction.

## Cross-cutting notes
- **Depth heat:** one moderate module (`eslint/base.mjs`, the only behavior-bearing file), five shallow modules (`postcss/next.mjs`, `tailwind/preset.css`, the three `tsconfig` files).
  `tsconfig/node-lib.json` is shallow per the deletion test but is the load-bearing tsconfig because of its 10 consumers.
  No module in this package is deep, which is correct for a build-config layer: depth belongs in `packages/ports` and the bounded contexts, not here.
- **Shared coupling and blast radius:** the tsconfig extends chain is single-rooted at the repo-root `tsconfig.base.json` (`tsconfig.base.json:1-23`), so a change to its strict flags is the highest blast-radius change in the package, touching every app and library at once.
  `eslint/base.mjs` has the next-highest blast radius because it is the only ESLint entry point.
  `tailwind/preset.css` has zero blast radius today because it has no consumers.
- **Patterns observed:** agnostic-ports is enforced mechanically by the `boundaries/element-types` allow-rules in `eslint/base.mjs:49-75` (apps may depend on ports/adapters/bounded-contexts; ports may depend only on shared-kernel; this is the lint expression of the architecture's port discipline).
  The two-token boundary and tool-policy-first patterns are not expressed here; they live in runtime code, not build config.
- **Friction clusters:**
  - The `boundaries/elements` map in `eslint/base.mjs:26-46` declares 17 element patterns, but only 7 packages exist on disk (`packages/` contains `adapters`, `config`, `identity-access`, `ports`, `project-management`, `runtime-control`, `shared-kernel`). The removed CRM package is deferred to the future user-side dashboard (GitHub issue #200).
  Ten declared bounded-context patterns (`tenant-provisioning`, `platform-ops`, `internal-collaboration`, `ai-workforce`, `knowledge-management`, `department-workflows`, `finance`, `notifications-admin-observability`, `billing`, `external-channels`) have no on-disk package, so the import map has drifted ahead of the real repo layout toward the planned bounded-context set.
  - Consumer access style is mixed: only `apps/web/postcss.config.mjs:1` and `packages/ports/tsconfig.json:2` use the declared `@opzava/config` package name; the root ESLint config (`eslint.config.mjs:4`) and every other tsconfig consumer reach the modules by relative path, partly bypassing the `exports` map.
  The root ESLint config comment explains why for its own case: the repo root is not a workspace package, so pnpm does not symlink `@opzava/config` into root `node_modules` (`eslint.config.mjs:1-3`).
  - `tailwind/preset.css` is an orphan export (see its module note).
  - `tsconfig/base.json` redeclares `declaration`/`declarationMap`/`sourceMap`, and `tsconfig/node-lib.json:6-8` redeclares them again, so the same three keys live in two files; one source of truth would be cleaner.

## File map
- `packages/config/package.json` - private workspace package declaring the six-entry `exports` map and `eslint`/`typescript` peer deps.
- `packages/config/eslint/base.mjs` - repo-wide ESLint flat config: boundaries element map, allow-rules, and restricted-imports.
- `packages/config/postcss/next.mjs` - Next.js PostCSS config registering `@tailwindcss/postcss`.
- `packages/config/tailwind/preset.css` - single-line Tailwind preset stylesheet (currently unconsumed).
- `packages/config/tsconfig/base.json` - mid-chain tsconfig adding declaration/source-map flags over the repo-root baseline.
- `packages/config/tsconfig/nextjs.json` - Next.js tsconfig profile (DOM libs, JSX preserve, `noEmit`, `next` plugin).
- `packages/config/tsconfig/node-lib.json` - Node-library tsconfig profile (ES2022 lib, declaration emit, `@types/node`).
- `tsconfig.base.json` (repo root) - the strict compiler baseline that `base.json` extends; the true single root of the tsconfig chain.
- `eslint.config.mjs` (repo root) - the only ESLint entry point, re-exporting `packages/config/eslint/base.mjs` by relative path.
