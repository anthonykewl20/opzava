# Slice: WHOLE-CODEBASE standardization + full documentation (frontend + backend + database + app)

Status: authoritative spec for the standardization slice (user directive 2026-07-04: "shadcn standardized
as a global project, reusable/organized; centralized GLOBAL design tokens; well-architected frontend — and
the SAME for BACKEND, DATABASE, and the OVERALL APP; no hand-waving — all codes, routes, paths, processes,
functions, dependencies fully documented + standardized so any AI agent debugging/changing/fixing/testing
is NOT blinded"). Scope = the ENTIRE codebase, not just frontend. Acceptance is at the bottom; every
deliverable is concrete + verifiable. Codegen/docs (codex-exec) implement against this; architecture
decisions + acceptance are owned here.

Programme shape: this is a multi-pass programme (large), executed slice-by-slice and deeply verified, NOT a
single fire-and-forget. Each layer below (A frontend, B backend, C database, D docs/app) is standardized
first (ONE canonical way, drift removed), then documented so the standard is legible.

## Grounded current state (verified, not assumed)
- shadcn IS a project: `apps/web/components.json` (style new-york, rsc, aliases `@/components/ui`, lucide),
  Tailwind v4 (CSS-based; NO js config), `cn()` at `apps/web/lib/utils.ts`, `components/ui/button.tsx`
  (cva + shadcn theme vars).
- Token mapping EXISTS but is SPREAD across 4 files imported by `apps/web/app/globals.css`:
  `app/mockup/tokens.css`, `app/mockup/app.css`, `app/mockup/shadcn.css`, `app/legacy-globals.css`.
  `globals.css` maps shadcn theme vars -> brand tokens (`@theme inline` + `@layer tokens`;
  e.g. `--primary: var(--accent)`).
- TWO parallel styling systems coexist: ported mockup pages use mockup classes (`.btn`, `.card` from
  `app.css`); shadcn components use Tailwind + theme vars. This is the drift to remove.

## Part A — Design-system single-source (well-architected frontend)

A1. TOKEN SINGLE-SOURCE. Consolidate the 4 CSS files into ONE documented, layered token source of truth.
    - One file (e.g. `app/tokens.css`) owns the raw brand tokens (color/space/radius/type/shadow) as CSS
      custom properties, with a light + dark set. `globals.css` keeps ONLY: tailwind import, the token
      import, the `@theme inline` shadcn-var -> brand-token mapping, and font setup.
    - shadcn theme vars (`--background/--foreground/--card/--primary/--secondary/--muted/--accent/
      --destructive/--border/--input/--ring/--radius/--popover/--sidebar*/--chart*`) MUST all be defined
      and mapped to brand tokens (fill any missing shadcn var so every shadcn component themes correctly).
    - Remove `legacy-globals.css` and fold the mockup CSS: keep ONLY the mockup utility classes still used
      by not-yet-migrated pages, in ONE clearly-labelled `legacy-mockup.css` marked deprecated + slated for
      migration; everything else is deleted. No orphan/duplicate token declarations.

A2. ONE CANONICAL COMPONENT SYSTEM. shadcn/ui (`components/ui/*`) is THE way; there is one Button, one Card,
    one Input, one Dialog, one Tabs, one Badge, one Table, etc. Populate the canonical set actually used by
    the app (button [exists], tabs, dialog, badge, input, label, card, table, select, tooltip, separator,
    skeleton, sonner/toast) via the shadcn pattern into `components/ui/`, styled by the token single-source.
    No parallel primitives. Install the matching `@radix-ui/*` deps in `apps/web/package.json`.

A3. DESIGN-SYSTEM DOC. `docs/frontend/design-system.md`: the token single-source (names, light/dark, how to
    add/change a token), the shadcn-var mapping, the component catalog (each `components/ui/*`: what it is,
    when to use, key props), and the conventions (server-by-default + `'use client'` only on leaves;
    one-canonical-way; a11y floor WCAG 2.2 AA; token-driven, no raw hex; testing = semantic queries).

A4. SURFACE MIGRATION (incremental, per surface, screenshot-verified): migrate each admin surface off the
    mockup `.btn/.card/...` classes to the canonical `components/ui/*` + tokens, preserving behavior + live
    data. Order: Connections (done via v2) -> Issues -> Tasks/card -> CRM -> Ask Admin -> shell/nav. Each
    migration is behavior-preserving (black-box tests stay green) + visually verified.

## Part B — Backend standardization (services / ports / adapters)

B-svc. ONE application-service pattern (already the CRM/PM shape) enforced everywhere:
    `assertKnownIds -> normalize/validate (Result-returning) -> authorize(AuthorizationPort) ->
    withTenant(orgId, tx => ...) -> idempotent replay-before-insert -> Result<Dto>`. Context
    `{orgId, workspaceId, actor:{userId, roleKeys}}`. Document the pattern; grep-audit that every service
    conforms (no ad-hoc query paths that skip withTenant/authorize).
B-err. ONE error model: `DomainError` + `Result<T>` (ok/error), stable dotted codes (`<context>.<name>`),
    the sanitized error mapper (RLS SQLSTATE -> hard 403; forbidden vs not_found split). No thrown-string
    or ad-hoc error shapes. Document the taxonomy.
B-port. Agnostic PORTS catalog documented one place: OpenClawGateway, EventBus, GatewayRuntime, Billing,
    Push, Realtime, Auth, Authorization, KnowledgeIndex/Source, SkillCatalog, SecretsVault, ObjectStore,
    ErrorCapture, EmbeddingProvider, IssueTracker, ConnectionsProvisioning. For each: interface location,
    the shipped adapter(s), and the "NO vendor types in core domain" boundary. Verify no OpenClaw/vendor
    type leaks past the broker/adapters.
B-svcs. Runtime services standardized + documented: gateway-broker (v4 two-token WS client, internal
    HTTP/SSE), provisioning-worker (JIT operator.admin, socket-proxy, onboard-exec connect, connections
    endpoints), mcp-server (tool registry + link-token auth), workers (seed/provisioning). Each: entry,
    env schema (one place), endpoints/protocol, failure modes.
B-conv. Package conventions enforced: `type: module`, `tsconfig.build` rootDir src + tests excluded,
    `vitest.config` include `src/**/*.test.ts`, barrel `src/index.ts` re-exports domain+application,
    pnpm workspace build gate. Grep-audit + document.

## Part C — Database standardization + documentation

C-rls. ONE RLS pattern on EVERY tenant table (grep-verified): `enable`+`FORCE row level security`; the trio
    `_tenant_isolation` (permissive `organization_id = app.current_org_id()`), `_tenant_context_required`
    (restrictive `app.current_org_id() is not null`), `_owner_admin` (to owner role); composite tenant FK to
    `organizations(id)` + `workspaces(id, organization_id)`; `uniqueIndex(id, organization_id)`; per-org
    idempotency unique; explicit grants to `opzava_app`; non-empty `check()`s. Any table missing a policy is
    a bug. Two-role model (`opzava_owner` migrates / `opzava_app` runs, NOSUPERUSER NOBYPASSRLS).
C-mig. Migration conventions: `packages/identity-access/drizzle/NNNN_sliceN_<name>.sql`, hand-written raw SQL
    (Drizzle schemas are typing-only, not diffed), lock/statement timeouts, idempotent `do $$` guards,
    `create ... if not exists`, guarded `alter ... add constraint`. Document + a migration index
    (`docs/architecture/migrations.md`: NNNN -> what it created/changed).
C-model. DATA MODEL doc (`docs/architecture/data-model.md`): every table by bounded context — columns/types,
    constraints, FKs (incl. coherence FKs), the versioned-reference-data pattern (pipelines/stages with
    `key`+`version`), append-only Activity pattern, per-workspace human-readable numbers. An ER-level map so
    the schema is legible without reading SQL.
C-access. The `withTenant` transaction wrapper (SET LOCAL app.current_org), PgBouncer transaction-pooling
    requirement, prepared-statements-off, and the sanitized-error path — documented as THE only tenant-data
    access route.

## Part D — Documentation of the OVERALL APP (no agent blinded)

B1. PER-PACKAGE/APP README. Every `packages/*` and `apps/*` gets a `README.md`: purpose (bounded context),
    directory structure (key modules + what each owns), public surface (exports/ports/endpoints),
    dependencies (which workspace packages + why), and run/build/test commands. A short, skimmable map.

B2. ROUTES + ENDPOINTS MAP. `docs/architecture/routes-and-endpoints.md`: every web App-Router route
    (`apps/web/app/**`), every API route (`app/api/**`), every worker HTTP endpoint
    (`/internal/connections/*`, provisioning), every broker endpoint (`/internal/assistant/*`,
    `/internal/gateway/*`), and the MCP tool registry. Columns: path -> purpose -> auth/scope -> handler
    file:symbol.

B3. PROCESS/FLOW DOCS. `docs/architecture/flows/*.md` for the load-bearing flows, each a short sequence +
    the exact files/functions involved + failure modes: auth/session, task lifecycle, Ask-Admin broker path
    (web -> broker -> gateway v4 handshake -> stream), Connections provider-connect (worker -> config.patch
    allowlist -> onboard exec -> models status), Issues/GitHub sync + active-close, MCP task tools.

B4. DEPENDENCY GRAPH. `docs/architecture/dependency-graph.md`: the workspace package/app dependency structure
    (who imports whom), the agnostic ports layer, and the "no vendor types in core domain" boundary — so the
    layering is legible at a glance.

## Acceptance (verifiable)
- [ ] ONE token source-of-truth file; `legacy-globals.css` gone; mockup CSS reduced to one labelled
      deprecated `legacy-mockup.css`; every shadcn theme var defined + mapped. No duplicate token decls
      (grep proves it).
- [ ] Canonical `components/ui/*` set present + used; zero parallel Button/Card/Input/Dialog; radix deps
      installed. `docs/frontend/design-system.md` documents tokens + catalog + conventions.
- [ ] Migrated surfaces render byte-parity vs before (authenticated side-by-side screenshots) with live data
      intact; behavior tests green.
- [ ] BACKEND: every application service conforms to the one pattern (grep-audit); one `DomainError`/`Result`
      error model + dotted-code taxonomy documented; ports catalog documented; NO vendor/OpenClaw types leak
      into the core domain (grep-verified past the adapters/broker).
- [ ] DATABASE: every tenant table has the RLS trio + FORCE RLS + composite tenant FK + grants (grep-verified,
      none missing); migration index + `data-model.md` accurate vs the SQL; `withTenant` is the sole
      tenant-data access route.
- [ ] Every `packages/*` + `apps/*` has a README; `routes-and-endpoints.md`, `flows/*`,
      `dependency-graph.md`, `data-model.md`, `migrations.md` exist and are accurate (spot-checked vs code).
- [ ] `pnpm --filter @opzava/web typecheck+lint+build` green; nothing else regressed.
- [ ] EXECUTION.md updated; committed.

## Sequencing
v2 (Connections shadcn + real connect backend) lands first and is folded in as the reference migration.
Then A1->A3 (token single-source + catalog + doc), then A4 surface migrations, then B1->B4 docs. Heavy
codegen/docs via codex-exec against THIS spec; architecture + acceptance owned here.
