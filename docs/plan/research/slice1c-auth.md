# Slice 1c Better Auth admin authentication design memo

Planning memo only. This slice designs Better Auth admin sign-up/login behind `AuthPort`, DB-revocable sessions, and first-owner workspace setup. It does not implement application code, install packages, or run migrations.

## Decision summary

Slice 1c uses **Better Auth core only** for the Admin Tasks MVP: `user`, `session`, `account`, and `verification`, mapped to Opzava-prefixed physical tables. It does **not** enable Better Auth's organization plugin in 1c.

The reason is source-of-truth control. Slice 1b already shipped canonical `organizations` and `workspaces`, plus `withTenant(orgId, fn)` and RLS around `app.current_org`. ADR-006 says Better Auth is behind `AuthPort` and cannot become a domain dependency; ADR-007 says `AuthorizationPort` owns fine-grained roles and Postgres RLS is fail-closed; PRD-001 says first setup creates the first owner, Organization, membership, Owner role grant, default workspace, and setup/provisioning records with a run-once guard. Better Auth's organization plugin creates its own `organization`, `member`, and `invitation` tables and exposes org create/update/delete/list APIs, with active organization stored on the Better Auth session ([https://better-auth.com/docs/plugins/organization](https://better-auth.com/docs/plugins/organization)). That is useful later for multi-org invite UI, but it is more moving state than 1c needs and would duplicate the canonical tenancy that 1b already owns.

The 1c implementation therefore creates Opzava-owned `memberships`, `role_catalog`, and `role_grants` tables in Identity & Access. They link Better Auth core `user` rows to canonical `organizations.id` and carry ADR-007 role data. Domain code never imports Better Auth directly. The Better Auth organization plugin remains a later optional subordinate mirror, not a rewrite: if later PRD-001 invitation UX needs its client endpoints, its plugin tables must map back to canonical `organizations` and sync into Opzava membership/role-grant rows transactionally.

Official Better Auth 1.6 checks used here:

- Install package: `better-auth`; secret/base URL env vars are `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` ([https://better-auth.com/docs/installation](https://better-auth.com/docs/installation)).
- Drizzle adapter package and import: official adapter docs say install `@better-auth/drizzle-adapter`, import `drizzleAdapter` from `@better-auth/drizzle-adapter`, and use `provider: "pg"` for Postgres ([https://better-auth.com/docs/adapters/drizzle](https://better-auth.com/docs/adapters/drizzle)). This repo currently has no installed `node_modules/@better-auth/drizzle-adapter/package.json`; 1c must install/pin the package, read that manifest's `exports`, and fail CI if it does not expose the package root. Do not use the stale path `better-auth/adapters/drizzle`.
- Core schema is `user`, `session`, `account`, `verification`; Better Auth's CLI `auth generate` creates adapter schema, then Drizzle owns `drizzle-kit generate` and `drizzle-kit migrate` ([https://better-auth.com/docs/concepts/database](https://better-auth.com/docs/concepts/database), [https://better-auth.com/docs/adapters/drizzle](https://better-auth.com/docs/adapters/drizzle)).
- Email/password auth is enabled with `emailAndPassword.enabled: true`; `signUpEmail`, `signInEmail`, `signOut`, password reset, and password-change session revocation are server/client APIs ([https://better-auth.com/docs/authentication/email-password](https://better-auth.com/docs/authentication/email-password)).
- Better Auth sessions are database-backed by default when a database is configured; revocation APIs include `revokeSession`, `revokeOtherSessions`, and `revokeSessions`; cookie cache must stay disabled because the docs warn revoked sessions may remain valid until cache expiry when it is enabled ([https://better-auth.com/docs/concepts/session-management](https://better-auth.com/docs/concepts/session-management)).
- Cookies are `httpOnly` and `secure` in production; force `advanced.useSecureCookies: true`, keep CSRF/origin checks enabled, and set explicit cookie attributes for the PWA path ([https://better-auth.com/docs/concepts/cookies](https://better-auth.com/docs/concepts/cookies), [https://better-auth.com/docs/reference/options](https://better-auth.com/docs/reference/options)).
- Next App Router mounts `/api/auth/[...all]/route.ts` with `toNextJsHandler(auth)` and exports `{ GET, POST }`; the client is created from `better-auth/react`; server code can call `auth.api.getSession({ headers })` ([https://better-auth.com/docs/integrations/next](https://better-auth.com/docs/integrations/next)).

## Auth configuration shape

The Better Auth instance lives behind the Identity & Access adapter, not in domain code.

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@opzava/adapters/postgres";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    modelName: "auth_sessions",
    storeSessionInDatabase: true,
    cookieCache: { enabled: false },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: true,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    },
    database: { generateId: "uuid" },
  },
  user: { modelName: "auth_users" },
  account: { modelName: "auth_accounts" },
  verification: { modelName: "auth_verifications" },
});
```

Implementation note: keep model naming, expiry, DB-backed sessions, and `cookieCache` under the same `session` object in the real config.

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, OAuth client ids/secrets, and SMTP/provider secrets come only from the existing environment/secrets mechanism. No auth secret or provider token is stored in source.

## Schema DDL for 0001

The generated Drizzle schema should be reviewed against Better Auth's `auth generate` output, then folded into one reviewed migration: `packages/identity-access/drizzle/0001_slice1c_auth.sql`. Names below are physical table names; Better Auth model names remain core `user`, `session`, `account`, and `verification` through `modelName`/field mapping.

### Global Better Auth core tables

These tables are global identity/authentication state. They are **not tenant-scoped** and must not receive tenant RLS policies. They get explicit `opzava_app` grants only.

```sql
create table public.auth_users (
  id text primary key,
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index auth_users_email_unique on public.auth_users (lower(email));

create table public.auth_sessions (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  active_organization_id uuid references public.organizations(id) on delete set null,
  membership_version integer not null default 0,
  mfa_satisfied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auth_sessions_user_id_idx on public.auth_sessions (user_id);
create index auth_sessions_active_organization_id_idx on public.auth_sessions (active_organization_id);

create table public.auth_accounts (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  id_token text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);

create index auth_accounts_user_id_idx on public.auth_accounts (user_id);

create table public.auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auth_verifications_identifier_idx on public.auth_verifications (identifier);
```

`auth_sessions.token` is the Better Auth session token. Opzava code must never log it. If a session revocation audit row is needed, store a hash of the token, not the token.

### Opzava setup and authorization tables

`first_owner_setup` is a global singleton guard. It is not tenant-scoped because it exists before the first tenant is usable. Its only runtime mutation is the first-owner setup command.

```sql
create table public.first_owner_setup (
  singleton_id boolean primary key default true,
  setup_attempt_id text not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_user_id text not null references public.auth_users(id) on delete restrict,
  completed_at timestamptz not null default now(),
  check (singleton_id is true)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id text not null references public.auth_users(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended', 'removed')),
  membership_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_organization_id_status_idx on public.memberships (organization_id, status);

create table public.role_catalog (
  role_key text primary key,
  scope_type text not null check (scope_type in ('organization', 'project')),
  display_name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.role_catalog (role_key, scope_type, display_name) values
  ('owner', 'organization', 'Owner'),
  ('admin', 'organization', 'Admin'),
  ('member', 'organization', 'Member')
on conflict (role_key) do nothing;

create table public.role_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subject_type text not null default 'user' check (subject_type in ('user')),
  subject_id text not null references public.auth_users(id) on delete restrict,
  role_key text not null references public.role_catalog(role_key) on delete restrict,
  scope_type text not null check (scope_type in ('organization', 'project')),
  scope_id uuid not null,
  granted_by_user_id text references public.auth_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, subject_type, subject_id, role_key, scope_type, scope_id)
);

create index role_grants_subject_idx on public.role_grants (subject_type, subject_id);
create index role_grants_organization_scope_idx on public.role_grants (organization_id, scope_type, scope_id);
```

### RLS and the pre-tenant membership read path

Membership is tenant-scoped because it carries `organization_id`, but the app must read a user's memberships immediately after authentication to know which orgs can be selected. Requiring `withTenant(orgId)` for that discovery would create a chicken-and-egg. The 1c design adds a narrow authenticated-user context separate from tenant context:

```sql
create or replace function app.current_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.current_user', true), '')
$$;

alter function app.current_user_id() owner to opzava_owner;
grant execute on function app.current_user_id() to opzava_app;
```

Identity discovery uses a new adapter helper, `withAuthenticatedIdentity(userId, fn)`, that opens a transaction, runs `select set_config('app.current_user', userId, true)`, and only permits the org-selection queries listed here. Product repositories still use `withTenant(orgId, fn)`.

Because 1b created restrictive `*_tenant_context_required` policies, 0001 must replace the `organizations` restrictive policy with command-specific policies so user-keyed reads are possible without weakening writes.

```sql
drop policy if exists organizations_tenant_context_required on public.organizations;

create policy organizations_select_context_required on public.organizations
  as restrictive
  for select
  to opzava_app
  using (app.current_org_id() is not null or app.current_user_id() is not null);

create policy organizations_insert_tenant_context_required on public.organizations
  as restrictive
  for insert
  to opzava_app
  with check (app.current_org_id() is not null);

create policy organizations_update_tenant_context_required on public.organizations
  as restrictive
  for update
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

create policy organizations_delete_tenant_context_required on public.organizations
  as restrictive
  for delete
  to opzava_app
  using (app.current_org_id() is not null);

create policy organizations_identity_membership_select on public.organizations
  as permissive
  for select
  to opzava_app
  using (
    exists (
      select 1
      from public.memberships m
      where m.organization_id = public.organizations.id
        and m.user_id = app.current_user_id()
        and m.status = 'active'
    )
  );

alter table public.memberships enable row level security;
alter table public.memberships force row level security;

create policy memberships_tenant_isolation on public.memberships
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

create policy memberships_identity_self_select on public.memberships
  as permissive
  for select
  to opzava_app
  using (user_id = app.current_user_id() and status = 'active');

create policy memberships_insert_tenant_context_required on public.memberships
  as restrictive
  for insert
  to opzava_app
  with check (app.current_org_id() is not null);

create policy memberships_update_tenant_context_required on public.memberships
  as restrictive
  for update
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

create policy memberships_delete_tenant_context_required on public.memberships
  as restrictive
  for delete
  to opzava_app
  using (app.current_org_id() is not null);

alter table public.role_grants enable row level security;
alter table public.role_grants force row level security;

create policy role_grants_tenant_isolation on public.role_grants
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

create policy role_grants_tenant_context_required on public.role_grants
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);
```

The result is explicit:

- Global auth tables: `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, and `first_owner_setup` have no tenant RLS.
- Tenant tables: `organizations`, `workspaces`, `memberships`, and `role_grants` remain RLS protected.
- The only pre-tenant exception is a bounded identity read path keyed by `app.current_user`, used to list the authenticated user's active memberships and basic organization metadata.
- All tenant-scoped work after active org selection still enters `withTenant(orgId, fn)`. RLS denial or `AuthorizationPort` denial is a hard 403, matching ADR-007 and the existing `packages/adapters/src/postgres/errors.ts` mapping.

### Explicit grants

0001 must retain 1b's no-blanket-grants discipline. Add explicit runtime grants only:

```sql
grant select, insert, update, delete on table
  public.auth_users,
  public.auth_sessions,
  public.auth_accounts,
  public.auth_verifications,
  public.memberships,
  public.role_grants
to opzava_app;

grant select, insert on table public.first_owner_setup to opzava_app;
grant select on table public.role_catalog to opzava_app;
```

Do not add new `alter default privileges` grants in the migration. `db/init/00-roles.sql` currently has local-default privileges for fresh Compose databases, but the reviewed migrations must continue to grant each table explicitly so shared/live deployments do not accidentally inherit runtime access.

## First-owner setup transaction

PRD-001 says setup runs once and creates the owner user, Organization, owner membership, Owner role grant, workspace defaults, audit/outbox, and provisioning handoff. For 1c, the provisioning job may be a planned handoff row or command boundary if the provisioning tables are not yet implemented, but the owner/org/membership/workspace portion must be atomic.

Flow:

1. `FirstOwnerSetupService.setup(input)` lives in `packages/identity-access`. It is an application use case, not `AuthPort.signUp`, because it spans authentication, canonical tenancy, authorization seed data, workspace creation, and setup run-once state.
2. Generate `organizationId`, `workspaceId`, `setupAttemptId`, and a slug before opening the transaction.
3. Open one database transaction as `opzava_app`; acquire `pg_advisory_xact_lock(hashtext('opzava:first-owner-setup'))` to serialize concurrent first-owner attempts.
4. Check `first_owner_setup`. If a row exists, return the PRD-001 already-set-up state and create no auth user.
5. Set `app.current_org = organizationId` immediately after the guard check so canonical `organizations`, `workspaces`, `memberships`, and `role_grants` writes satisfy RLS.
6. Create the Better Auth `auth_users` and credential `auth_accounts` rows through the Better Auth adapter bound to the same transaction, with `emailAndPassword.autoSignIn: false`. Do not issue a session until after commit. The implementation must prove this transaction-bound adapter path in the acceptance test; do not use a provider callback or post-commit hook for first-owner authority.
7. Insert canonical `organizations` with lifecycle state `provisioning`, insert the default `workspaces` row, insert active `memberships`, and insert `role_grants` with `role_key='owner'` and `scope_id=organizationId`.
8. Insert `first_owner_setup(singleton_id=true, setup_attempt_id, organization_id, owner_user_id)` after the owner user exists and before commit. The advisory lock plus singleton row make setup both serialized and permanently run-once.
9. Commit.
10. Publish a setup-completed event through `EventBusPort` after the transaction commits; later audit/outbox tables can subscribe without changing the setup transaction's canonical writes.
11. After commit, call the AuthPort adapter sign-in path to issue the Better Auth DB-backed session. Then resolve memberships through `withAuthenticatedIdentity(userId)` and set `auth_sessions.active_organization_id` plus `membership_version` for the selected org. If session creation fails after commit, the setup is still complete; the UI returns a sign-in-required state rather than retrying setup.

AuthPort boundary:

- `AuthPort` owns sign-in, sign-out, get-session, list sessions, revoke one session, and sign out everywhere.
- The first-owner setup use case owns the atomic creation of canonical org/workspace/membership/role data.
- The Better Auth adapter may have internal transaction-bound helpers, but only Identity & Access use cases call them. Domain code and other bounded contexts see only `AuthPort`, `AuthorizationPort`, and Opzava IDs.

## AuthPort adapter shape

Place the adapter in Identity & Access because it owns auth product semantics and Opzava membership records:

```text
packages/identity-access/src/adapters/better-auth/
  auth-config.ts
  auth-port-adapter.ts
  auth-client.ts
  first-owner-setup.ts
  session-principal.ts
  schema/
    better-auth.ts
    access.ts
```

`apps/web` wires framework handlers only:

```text
apps/web/src/app/api/auth/[...all]/route.ts
apps/web/src/lib/auth-client.ts
```

`route.ts` imports the configured auth instance from the Identity & Access adapter and exports `{ GET, POST } = toNextJsHandler(auth)` as the official Next.js integration shows. Client components import the Better Auth React client only through `apps/web/src/lib/auth-client.ts`, not from domain packages.

The current `packages/ports/src/auth.ts` contract is close but should be revised in the 1c implementation because setup has no `tenantId`/`orgId` before creation and `revokeSession` in Better Auth uses a session token. The port should expose Opzava-shaped methods:

- `signIn(email, password) -> AuthSession | MfaChallenge`
- `getSession(headers/sessionToken) -> AuthSession | null`
- `listSessions(userId)`
- `revokeSession(sessionToken or sessionId, actorUserId)`
- `logoutAll(userId, keepSessionId?)`
- `createFirstOwnerSetup(input)` is **not** part of the generic auth port; it is an Identity & Access use case that uses the adapter internally.

`getSession` must always re-check:

- Better Auth session exists in `auth_sessions` and is not expired.
- Cookie cache is disabled, so the DB is consulted for session state.
- `auth_sessions.active_organization_id` is set or the request is an org-selection/setup route.
- The user has an active `memberships` row for the active org.
- The session `membership_version` still matches the membership row. Role/membership changes bump membership version and revoke affected sessions in the same transaction.
- Organization lifecycle allows product access.
- MFA state satisfies current policy when MFA lands in a later slice.

## Session to tenant resolution

Request flow:

1. Route handler/server action calls `AuthPort.getSession`.
2. If there is no session, return 401 or the login/setup state.
3. If session has no active org, call the bounded `withAuthenticatedIdentity(userId)` read path to list active memberships and organization summaries. If exactly one org exists, set it active; if multiple later exist, require explicit selection.
4. Build an `AuthorizationSubject` with `userId`, `tenantId`, `orgId`, and workspace ids.
5. For tenant work, call `AuthorizationPort.can(subject, action, resource)`. A denial returns hard 403.
6. Enter `withTenant(orgId, fn)` and call tenant repositories. Missing or mismatched `app.current_org`, RLS denial, or FK/RLS write denial maps to hard 403 through the existing Postgres adapter error path.

No route accepts caller-provided org id as authority by itself. The requested org must be among active memberships read for the authenticated user, then all tenant tables must still pass `withTenant` and RLS.

## Migration plan

1. Add Better Auth dependencies to the owning packages without floating ranges: `better-auth` and `@better-auth/drizzle-adapter`. Read `node_modules/@better-auth/drizzle-adapter/package.json` and record the root export/import path in the implementation notes.
2. Add the Better Auth config and Drizzle schema mapping under Identity & Access. Use `provider: "pg"` and physical table names above.
3. Run `auth generate` to generate Better Auth Drizzle schema for the configured core models.
4. Review and fold the generated schema into `packages/identity-access/src/adapters/postgres/schema/auth.ts` or `packages/identity-access/src/adapters/better-auth/schema/better-auth.ts`, plus `access.ts` for memberships/grants.
5. Run `drizzle-kit generate` and manually inspect the SQL.
6. Create/review `packages/identity-access/drizzle/0001_slice1c_auth.sql`; include global auth tables, setup/membership/grant tables, `app.current_user_id()`, RLS policy changes, explicit grants, and no blanket grants.
7. Update `packages/identity-access/drizzle/manifest.json` with the 0001 SHA-256 hash so `packages/adapters/src/postgres/migration-gate.ts` continues to fail closed on drift.
8. Apply through the existing one-shot migration path as `opzava_owner`. Runtime `apps/web`, broker, and workers continue to connect as `opzava_app`.

## Acceptance proof for 1c

Add an integration/e2e check at the highest seam, not against Better Auth internals:

1. Start from a migrated empty database.
2. Submit first-owner setup with owner email/password, org name, workspace name, timezone, and idempotency key.
3. Assert one `auth_users` row, one credential `auth_accounts` row, one canonical `organizations` row, one default `workspaces` row, one active `memberships` row, one Owner `role_grants` row, and one `first_owner_setup` singleton row exist.
4. Assert setup is atomic by forcing a failure after user creation but before membership insert; no user/account/org/workspace/membership/grant rows remain after rollback.
5. Sign in through `AuthPort.signIn`; assert `auth_sessions` contains the session, `AuthPort.getSession` returns an Opzava `AuthSession`, and the active org resolves through membership.
6. Call a tenant-scoped proof route/use case; assert it enters `withTenant(orgId)` and succeeds for the owner.
7. Revoke the session through `AuthPort.revokeSession` or sign out everywhere through `AuthPort.logoutAll`; assert the next `getSession` fails because the DB session is gone/invalid and cookie cache did not preserve access.
8. Submit first-owner setup again with a different email; assert the singleton guard rejects it before any second auth user, organization, membership, or owner grant is created.
9. Try to query membership/org discovery without `app.current_user`; assert hard 403 or no rows according to the adapter path. Then query with `withAuthenticatedIdentity(ownerUserId)` and assert only that user's active memberships/org summaries are visible.
10. Try a tenant read under the wrong org or no `withTenant`; assert hard 403, never `200` with an empty targeted resource.

## Files to create or modify in implementation

Mapped to ADR-001 module ownership:

- `packages/identity-access/src/adapters/better-auth/auth-config.ts` - Better Auth server config behind Identity & Access.
- `packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts` - `AuthPort` implementation.
- `packages/identity-access/src/application/first-owner-setup.ts` - setup use case and transaction orchestration.
- `packages/identity-access/src/adapters/postgres/schema/auth.ts` - Better Auth core table mappings.
- `packages/identity-access/src/adapters/postgres/schema/access.ts` - `memberships`, `role_catalog`, `role_grants`, setup guard schema.
- `packages/identity-access/src/adapters/postgres/schema/index.ts` - exports for tenancy + auth/access schema.
- `packages/identity-access/drizzle/0001_slice1c_auth.sql` - reviewed migration.
- `packages/identity-access/drizzle/manifest.json` - append 0001 hash.
- `packages/adapters/src/postgres/identity-context.ts` - `withAuthenticatedIdentity(userId, fn)` helper for pre-tenant membership discovery.
- `packages/ports/src/auth.ts` - adjust the port away from requiring tenant/org on first sign-up.
- `apps/web/src/app/api/auth/[...all]/route.ts` - Next App Router Better Auth handler.
- `apps/web/src/lib/auth-client.ts` - Better Auth React client boundary.
- `apps/web/src/app/(auth)/setup/actions.ts` or equivalent - first-owner setup server action that calls Identity & Access, not Better Auth directly.

## Non-goals

1c does not build the app shell/nav from 1d, Task domain from 1e, passkeys/TOTP setup, multi-org invitation UI, Guest-Client magic links, billing, provisioning worker details, or provider invitation callbacks. The design preserves the hooks for those later slices: AuthPort remains the auth boundary, AuthorizationPort remains the fine-grained policy boundary, and canonical `organizations` remains the tenant source of truth.
