# packages/identity-access - Identity and Access bounded context
> Part of the Opzava architecture (see ../README.md). Vocabulary: codebase-design.

## Overview
This package is the Identity and Access bounded context: it owns tenant bootstrap, session-based authentication, role/membership identity, and link-token issuance for headless clients.
It is a DDD layer split into a thin domain (`src/domain/tenancy.ts`), deep application services (`src/application/*`), Better Auth and session adapters (`src/adapters/better-auth/*`), and a Postgres+RLS schema (`src/adapters/postgres/schema/*`).
The load-bearing invariants are that authentication and link-token operations are tenant-isolated by Postgres RLS keyed on `app.current_org_id()` / `app.current_user_id()`, that link tokens bind to a live membership version so revocation propagates, and that first-owner setup is a one-shot singleton guarded by a Postgres advisory lock rather than RLS.

## Modules

### Package entry - `packages/identity-access/src/index.ts`, `packages/identity-access/package.json`
- **Interface (the seam):** `index.ts` re-exports the public surface: `FirstOwnerSetupService`, `firstOwnerSetupService`, the link-token operations (`issueLinkToken`, `verifyLinkToken`, `revokeLinkToken`, `listLinkTokens`), the link-token claim helpers (`linkTokenAudience`, `linkTokenClientId`, `linkTokenScopes`), and the tenancy types (`Organization`, `Workspace`, `organizationLifecycleStates`) (`packages/identity-access/src/index.ts:1-30`).
  The second seam is the package.json `exports` map, which publishes two entry points: `.` mapped to `src/index.ts` (types) / `dist/index.js` (runtime), and `./better-auth` mapped to the adapter folder (`packages/identity-access/package.json:9-18`).
  Callers must know that the package root intentionally hides the Better Auth adapter behind a separate subpath; importing `@opzava/identity-access` does not expose `auth` or `authPort`.
- **Behind the seam (implementation):** There is no behavior; the entry is pure wiring that re-exports five other modules.
- **Adapters:** The entry consumes no ports itself.
  The `./better-auth` subpath is the route by which the package's sole AuthPort adapter (`authPort`) reaches consumers, but that adapter is covered under the better-auth module below.
- **Depth:** Shallow.
  Deletion test: removing `index.ts` only forces callers to import from the deeper paths; no complexity concentrates or disappears.
- **Seams:** The seam is external (the npm package boundary) and split into two subpaths, which keeps the Better Auth integration out of the default import graph.
  Coupling note: the root re-export couples the package's public name to the application and domain modules, so any rename in those modules is a breaking change at this seam.
- **Testing through the interface:** The entry is exercised indirectly through the two integration suites that import the application and adapter symbols it re-exports.
  Existing tests: `packages/identity-access/src/__tests__/slice1c-auth.integration.test.ts`, `packages/identity-access/src/__tests__/slice25b-link-tokens.integration.test.ts`.
  Gaps: no test asserts the export map itself (that `.` excludes adapter symbols and `./better-auth` exposes them), so a mis-typed subpath would not be caught until a consumer imports it.
- **Deepening opportunity:** None - already appropriately shallow; barrel files are meant to be thin.

### Tenancy domain - `packages/identity-access/src/domain/tenancy.ts`
- **Interface (the seam):** Exports `organizationLifecycleStates` (the literal tuple `provisioning`, `active`, `suspended`, `deprovisioning`, `deleted`), the `OrganizationLifecycleState` union derived from it, and two readonly data interfaces `Organization` and `Workspace` whose fields are typed with shared-kernel branded IDs (`packages/identity-access/src/domain/tenancy.ts:3-29`).
  The only invariant the module encodes is field typing; lifecycle state is a flat enumerable list with no transition rules.
- **Behind the seam (implementation):** None beyond the type and constant declarations; no functions, no validation, no persistence.
- **Adapters:** None.
- **Depth:** Shallow.
  Deletion test: removing the file only moves the type and constant definitions into their callers; the interface is the model itself, so nothing is hidden.
- **Seams:** Internal only; consumed by the application services and the Postgres schema (the schema imports `organizationLifecycleStates` to build its enum at `packages/identity-access/src/adapters/postgres/schema/tenancy.ts:13,18-21`).
  Coupling note: because the schema enum is generated from this constant, the list is a shared contract between domain and infrastructure, and any new state must be added in both layers or migrations drift.
- **Testing through the interface:** No dedicated unit tests; the values are exercised indirectly when the schema and application modules are tested.
  Gaps: lifecycle transitions (for example, `active` to `suspended`) have no policy here and no test, so any transition rule must be encoded elsewhere and is currently unverified at this layer.
- **Deepening opportunity:** None at the type level, but a `transition(from, to)` guard would be a small deepening that centralizes the lifecycle policy now spread across callers (unverified - no such caller exists in this package yet).

### Application services - `packages/identity-access/src/application/first-owner-setup.ts`, `packages/identity-access/src/application/link-tokens.ts`
- **Interface (the seam):** First-owner setup exposes `FirstOwnerSetupService` and its singleton `firstOwnerSetupService`, with one method `setup(input)` returning `Result<FirstOwnerSetupResult>` whose `status` is `created`, `created-sign-in-required`, or `already-set-up` (`packages/identity-access/src/application/first-owner-setup.ts:20-41,184-364`).
  Link tokens expose four free functions: `issueLinkToken`, `verifyLinkToken`, `revokeLinkToken`, `listLinkTokens`, plus the constants `linkTokenAudience` (`"opzava:mcp"`), `linkTokenClientId` (`"claude-code"`), and `linkTokenScopes` (`["tasks:read","tasks:write"]`) (`packages/identity-access/src/application/link-tokens.ts:19-23,386-737`).
  Callers must know the ordering and error modes: setup validates first, then takes a Postgres advisory lock, then writes rows in a fixed order, then publishes an event, then attempts sign-in; link-token verify re-checks membership version and session currency on every call and returns `identityAccess.linkTokenSessionDrift` if either has moved.
- **Behind the seam (implementation):** The complexity concentrates here.
  `setup()` hides input validation including a three-character-class password policy stronger than the 12-character floor (`packages/identity-access/src/application/first-owner-setup.ts:91-147`), slug derivation, a `pg_advisory_xact_lock(hashtext('opzava:first-owner-setup'))` for mutual exclusion (`:219`), a singleton pre-existence check against `public.first_owner_setup` that returns `already-set-up` idempotently (`:221-229`), manual tenant-context seeding via `set_config('app.current_org', ...)` plus `assertCurrentTenant` because RLS cannot be used at bootstrap (`:231-232`), six ordered inserts (auth_users, auth_accounts, organizations, workspaces, memberships, role_grants with `owner` key, first_owner_setup singleton) (`:234-306`), a fault-injection hook for testing partial-failure idempotency (`:239-241`), and an auto sign-in via `AuthPort` to return a live session (`:342-362`).
  `link-tokens.ts` hides a self-contained token format: claims are base64url-encoded into the token body with a 32-byte random secret suffix (`:107,261-264`), the full token is sha256-hashed and stored as `token_hash` for lookup (`:233-235`), and there is no cryptographic signature - the database row plus the unguessable secret are the authority.
  Verify re-derives the hash, looks up the row by `token_hash` and `jti`, cross-checks every claim against the stored row, rejects revoked or expired rows, reloads the live membership and fails on version drift, re-checks the backing session is still current, and updates `last_used_at` (`:502-627`).
- **Adapters:** Consumes `AuthPort`, `AuthSession`, and `MfaChallenge` from `@opzava/ports` (`packages/identity-access/src/application/first-owner-setup.ts:2`). It no longer publishes a domain event: `EventBusPort` had zero adapters, so `identity-access.first-owner-setup.completed` was never actually emitted, and both the port and the publish path were deleted in #160 (zero adapters, zero consumers — the optional dependency made the missing adapter a silent no-op) (#160), and resolves `AuthPort` to the package-local adapter `defaultAuthPort` unless overridden (`:14,192`).
  The AuthPort seam is repo-wide hypothetical: one adapter total (`packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts`), so this package is both the only consumer and the home of the only implementation.
  Link tokens do not consume a port; they use the `@opzava/adapters` `withTenant` / `TenantTransaction` helpers directly.
- **Depth:** Deep.
  Deletion test: deleting these two files would delete the entire bootstrap saga and the entire link-token lifecycle, collapsing a large amount of transactional, idempotency, and revocation behavior that has nowhere else to live; the small public signatures hide a transaction, an event, six writes, and a sign-in (setup) or claim validation plus four DB round-trips (verify).
- **Seams:** Internal seams to the better-auth adapter (password hashing, email normalization, credential provider id) and to the Postgres schema (raw table names are string-embedded in SQL).
  External seam via the package entry's re-export.
  Coupling notes: setup hard-codes the `owner` role key and the `email-password` credential provider by importing them from the adapter layer (`:14-16`), so the application layer is not port-pure - it reaches across to adapter helpers, and the SQL embeds table names, meaning schema renames break the application silently at runtime.
- **Testing through the interface:** The interface is the test surface and it is well covered.
  Existing tests: `packages/identity-access/src/__tests__/slice1c-auth.integration.test.ts` (setup idempotency, fault injection, sign-in, tenant RLS via `withTenantForSession`) and `packages/identity-access/src/__tests__/slice25b-link-tokens.integration.test.ts` (issue, verify, revoke, list, and session drift).
  Gaps: the `created-sign-in-required` branch in `setup()` is reachable only if `signIn` returns an `MfaChallenge`, which the current adapter can never produce (see better-auth module), so that status is effectively dead and unverified against real behavior.
- **Deepening opportunity:** `FirstOwnerSetupService.setup()` mixes validation, slug generation, persistence orchestration, event publishing, and authentication in one method; the auto sign-in couples bootstrap to `AuthPort`.
  A concrete refactor is to extract a `FirstOwnerBootstrapPort` (create-org, create-membership, grant-owner-role) so setup orchestrates a port instead of issuing six raw SQL inserts, which would also make the bootstrap testable without a live database.

### Better-auth adapters - `packages/identity-access/src/adapters/better-auth/`
- **Interface (the seam):** The barrel `index.ts` exports the Better Auth library instance (`auth`, `createBetterAuth`, `BetterAuthConfigOptions`), the AuthPort adapter (`BetterAuthPortAdapter`, `authPort`), the password helpers (`hashPassword`, `verifyPassword`), and the session/tenant helpers (`resolveSessionPrincipal`, `withTenantForSession`, `listActiveMembershipsForUser`, `normalizeEmail`, `sessionTokenFromHeaders`, `activeOrgId`, `activeTenantId`, `userIdFromSession`, `credentialProviderId`) (`packages/identity-access/src/adapters/better-auth/index.ts:1-12`).
   Callers must know that `authPort` and `auth` are two different things: `authPort` satisfies `AuthPort` and is the only application auth surface, while `auth` supplies Better Auth configuration/schema conventions and has no mounted HTTP route.
- **Behind the seam (implementation):** `auth-config.ts` builds the Better Auth instance with the Drizzle adapter over `betterAuthSchema`, email-and-password auth with `autoSignIn: false` and `revokeSessionsOnPasswordReset: true`, seven-day sessions, secure cookies, and explicit model-name overrides pointing at the `auth_*` tables (`packages/identity-access/src/adapters/better-auth/auth-config.ts:16-67`).
  `auth-port-adapter.ts` implements `AuthPort` but does so in raw SQL, not by delegating to the Better Auth instance: `signIn` selects the credential, verifies the password, loads the active membership, inserts a row into `auth_sessions`, and resolves the principal (`:104-174`); the other methods (`getSession`, `revokeSession`, `listSessions`, `logoutAll`) are likewise hand-written SQL over the same tables (`:176-261`).
  `password-hasher.ts` is a versioned scrypt scheme (`opzava_scrypt_v1`, N=16384, r=8, p=1, 64-byte key) that round-trips its own params and uses `timingSafeEqual` on the verify path (`packages/identity-access/src/adapters/better-auth/password-hasher.ts:3-10,65-95`).
  `session-principal.ts` carries the real tenant-binding complexity: `resolveSessionPrincipal` reads the session and fails closed (returns null) if the stored `membership_version` no longer matches the live membership, `listActiveMembershipsForUser` joins `organizations` and filters lifecycle state to provisioning/active, and `withTenantForSession` is the critical helper that opens a transaction, sets both `app.current_org` and `app.current_user`, asserts both, then runs caller work (`packages/identity-access/src/adapters/better-auth/session-principal.ts:143-190,192-265,267-298`).
- **Adapters:** This module is the repo's only `AuthPort` adapter (`packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts:101`); the AuthPort seam is therefore hypothetical (one adapter, hypothetical by the authoritative map).
  It also consumes `AuthPort` types and the shared-kernel branded IDs, and it depends on the generated Drizzle schema in `../postgres/schema/auth.ts`.
- **Depth:** Moderate overall, with deep pockets.
  Deletion test: deleting the folder would delete the only authentication implementation in the repo, concentrating credential verification, session resolution, and tenant binding into nowhere; however the seam surface is broad (many exported helpers), which keeps the folder from being uniformly deep.
  The deepest file is `session-principal.ts`, whose `resolveSessionPrincipal` and `withTenantForSession` hide the membership-version and RLS-context contract; `password-hasher.ts` is deep for its size (versioned KDF plus constant-time compare behind two functions).
- **Seams:** The external seam is the `./better-auth` package subpath; the internal seam to the Postgres schema is tight because `auth-config.ts` maps Better Auth to `betterAuthSchema` and any schema column rename is externally visible to auth bootstrapping.
   Coupling notes: the Better Auth configuration and `BetterAuthPortAdapter` share the `betterAuthSchema`; schema changes must preserve both the Better Auth conventions and the adapter's raw-SQL assumptions.
- **Testing through the interface:** `slice1c-auth.integration.test.ts` exercises `BetterAuthPortAdapter`, `withTenantForSession`, and `FirstOwnerSetupService` against a real Postgres.
   Gaps: `auth-config.ts` (the Better Auth instance configuration) has no direct test.
- **Deepening opportunity:** MFA, passkey, reset, invitation, and guest-session operations are now owned by `AuthPort`; keep their browser and provider boundaries out of the adapter's public surface.

### Postgres schema - `packages/identity-access/src/adapters/postgres/schema/`
- **Interface (the seam):** The barrel `index.ts` re-exports all tables from `access.ts`, `auth.ts`, `link-tokens.ts`, and `tenancy.ts` (`packages/identity-access/src/adapters/postgres/schema/index.ts:1-4`).
  The real seam is the set of tables, the `betterAuthSchema` mapping (which exposes both camelCase and snake_case keys so Better Auth and raw SQL agree) (`packages/identity-access/src/adapters/postgres/schema/auth.ts:92-101`), the CHECK constraints that mirror application-layer rules, and the RLS policies that encode tenant isolation.
  Callers must know that almost every table enforces `organization_id = app.current_org_id()` and that the `opzava_owner` role is an all-rows escape hatch.
- **Behind the seam (implementation):** `tenancy.ts` declares the lifecycle enum (sourced from the domain constant), the `organizations`, `workspaces`, and `tenant_rls_probes` tables, and the two Postgres roles `opzava_app` and `opzava_owner`; each tenant table carries a permissive `*_owner_admin` policy plus restrictive `*_tenant_context_required` policies so a null tenant context denies rather than leaks (`packages/identity-access/src/adapters/postgres/schema/tenancy.ts:15-163`).
  `access.ts` declares the bootstrap and identity tables: `first_owner_setup` is a singleton (boolean primary key constrained to true, unique `setup_attempt_id`) and notably does not call `enableRLS()`, so it is the only table outside RLS and relies on the advisory lock in the application layer; `memberships` adds a `*_identity_self_select` policy (`user_id = app.current_user_id()`), a status CHECK, and tenant-isolation policies; `role_grants` enforces a unique grant index and limits `subject_type` to `user` (`packages/identity-access/src/adapters/postgres/schema/access.ts:18-208`).
  `link-tokens.ts` is the densest contract: unique indexes on `token_hash` and `jti`, and CHECK constraints pinning `client_id = 'claude-code'`, scope cardinality to 1-2, the scope subset to `tasks:read`/`tasks:write`, the `token_hash` to a 64-hex shape, `membership_version > 0`, and `expires_at > created_at` (`packages/identity-access/src/adapters/postgres/schema/link-tokens.ts:17-87`).
- **Adapters:** None directly; this module supports the AuthPort adapter and Better Auth config but consumes no port.
- **Depth:** Moderate.
  Deletion test: deleting the schema deletes the storage contract and the tenant-isolation policy, but the tables themselves are declarative; the depth lives in the RLS policies and CHECK constraints, which are behavior dressed as declaration.
- **Seams:** Internal seam to the domain (the lifecycle enum) and to the application layer (table and column names are embedded as strings in application SQL).
  Coupling notes: the schema is the persistence boundary for the tenancy domain objects, and the link-token table couples session identity, workspace membership, and revocation state into one storage seam, so changes ripple to both `link-tokens.ts` application code and `auth_sessions`.
- **Testing through the interface:** Both integration suites run against a migrated Postgres and implicitly assert the RLS and CHECK behavior (for example, setup must set `app.current_org` before inserts or RLS rejects them).
  Gaps: there is no isolated test of the `first_owner_setup` no-RLS property or of the `opzava_owner` escape hatch; the duplicate-scope CHECK (`link_tokens_scopes_unique_check`) is a defensive invariant with no targeted test.
- **Deepening opportunity:** The scope whitelist is now enforced at three layers (the `linkTokenScopes` constant, `normalizeScopes` in application, and the `link_tokens_scopes_subset_check` DB constraint) that must stay aligned; a single source-of-truth constant consumed by migration generation would remove the three-way drift risk.

## Cross-cutting notes
- Depth heat: one deep module (application services, ~1103 LOC behind small signatures), two moderate modules (better-auth adapters, postgres schema), and two shallow modules (package entry, tenancy domain).
- The deepest behavior in the package is the membership-version revocation mechanism: it spans `auth_sessions.membership_version`, `link_tokens.membership_version`, `resolveSessionPrincipal`'s drift check, and `verifyLinkToken`'s drift check, so a membership version bump invalidates both live sessions and link tokens atomically.
- Shared coupling and blast radius: the `membership`/`role_grants` SQL query is duplicated between `session-principal.ts` (`listActiveMembershipsForUser`, which joins `organizations` and filters lifecycle state) and `link-tokens.ts` (`loadMembershipPrincipal`, which does not), so a change to role resolution must be made in two places or the two paths will disagree about a user's role keys.
- Patterns observed: RLS/`withTenant` is pervasive and every tenant table follows the same permissive-owner-plus-restrictive-context policy shape; the package is projections-are-cache-neutral here because it owns truth tables, not projections; tool-policy-first is not in scope for this package; agnostic-ports shows up as the AuthPort seam, though with a single adapter it is hypothetical; the two-token boundary is adjacent (link tokens are the headless-client analogue to the session cookie) but the two-token split itself lives in the gateway-broker, not here.
- Friction clusters: Better Auth configuration and the hand-rolled port adapter share tables; the three-layer scope whitelist can drift; and the application layer reaches past ports into adapter helpers (`hashPassword`, `normalizeEmail`, `credentialProviderId`) and embeds table names as SQL strings.

## File map
- `packages/identity-access/src/index.ts` - public package barrel; re-exports setup, link-token, and tenancy symbols.
- `packages/identity-access/package.json` - npm package with `.` and `./better-auth` export subpaths.
- `packages/identity-access/src/domain/tenancy.ts` - organization/workspace value types and the lifecycle state list.
- `packages/identity-access/src/application/first-owner-setup.ts` - transactional, idempotent owner/org/workspace bootstrap with event and auto sign-in.
- `packages/identity-access/src/application/link-tokens.ts` - issue, verify, revoke, list for `claude-code` MCP link tokens with membership-drift revocation.
- `packages/identity-access/src/adapters/better-auth/auth-config.ts` - Better Auth library instance wired to the Drizzle schema.
- `packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts` - the sole `AuthPort` adapter; raw-SQL sign-in and session operations.
- `packages/identity-access/src/adapters/better-auth/session-principal.ts` - session resolution, active-membership loading, and `withTenantForSession` tenant binding.
- `packages/identity-access/src/adapters/better-auth/password-hasher.ts` - versioned scrypt hash and timing-safe verify.
- `packages/identity-access/src/adapters/better-auth/index.ts` - adapter barrel exposing the auth instance, port adapter, and session helpers.
- `packages/identity-access/src/adapters/better-auth/first-owner-setup.ts` - re-export shim redirecting the better-auth subpath to the application setup service.
- `packages/identity-access/src/adapters/postgres/schema/tenancy.ts` - organizations, workspaces, lifecycle enum, RLS roles and policies.
- `packages/identity-access/src/adapters/postgres/schema/access.ts` - first-owner singleton, memberships, role catalog, role grants, and identity RLS.
- `packages/identity-access/src/adapters/postgres/schema/auth.ts` - Better Auth tables and the dual-key `betterAuthSchema` mapping.
- `packages/identity-access/src/adapters/postgres/schema/link-tokens.ts` - link-token table with hash/jti uniqueness and scope CHECK constraints.
- `packages/identity-access/src/adapters/postgres/schema/index.ts` - schema barrel.
