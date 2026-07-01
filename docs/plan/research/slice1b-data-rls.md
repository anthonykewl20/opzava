# Slice 1b data layer, RLS, and migration design memo

Planning memo only. This slice writes the data-layer design for implementation; it does not build auth, Task domain behavior, or application code.

## Decision summary

Slice 1b builds the Postgres tenant isolation foundation: Opzava-owned tenancy tables, Drizzle schema/migration setup, a shared `withTenant(orgId, fn)` transaction wrapper, RLS policies backed by `SET LOCAL app.current_org`, PgBouncer-compatible `pg` client rules, a one-shot migration pipeline, and one integration proof that cross-tenant reads and writes fail closed.

Better Auth is not the tenancy source of truth. ADR-002 says tenant onboarding creates the Opzava tenant/org record before Gateway provisioning; ADR-004 says Opzava Postgres is the system of record for identity, tenancy, human workflows, and product policy; ADR-006 says Better Auth owns authentication plus coarse org membership only; ADR-007 says `AuthorizationPort` decides fine-grained authorization and RLS is the fail-closed backstop. Therefore:

- `packages/identity-access` owns canonical `organizations`, `workspaces`, future `memberships`, future `role_grants`, and future Opzava `invitations`.
- Better Auth 1c tables are adapter-owned auth tables, not domain tables. The official organization plugin creates `organization`, `member`, `invitation`, optional `organizationRole`, optional `team`/`teamMember`, and adds `session.activeOrganizationId` plus optional `session.activeTeamId` ([official organization schema, exact URL: https://better-auth.com/docs/plugins/organization](https://better-auth.com/docs/plugins/organization)). These tables are subordinate provider state.
- In 1c, map Better Auth model names away from Opzava canonical names, for example `auth_organizations`, `auth_members`, `auth_invitations`, `auth_organization_roles`, `auth_teams`, `auth_team_members`. Add an `opzava_organization_id` FK or an explicit `auth_organization_links` table if the installed adapter schema cannot express that FK cleanly. Better Auth `member.organizationId` points to Better Auth's org row; Opzava `memberships.organization_id` points to canonical `organizations.id`.
- Invitation acceptance must enter through an `AuthPort` use case that revalidates the canonical Opzava `invitations` row, writes Opzava `memberships`/`role_grants`, updates Better Auth's coarse mirror, revokes stale sessions when authority changes, and emits audit/outbox in one transaction. Provider callbacks grant nothing by themselves.
- `AuthorizationPort` remains the Opzava policy evaluator. Better Auth roles, including plugin roles such as owner/admin/member or custom roles, are never the fine-grained authorization authority.

Official-doc validation used here:

- Drizzle Postgres schema/config/client: [https://orm.drizzle.team/docs/get-started/postgresql-new](https://orm.drizzle.team/docs/get-started/postgresql-new), [https://orm.drizzle.team/docs/sql-schema-declaration](https://orm.drizzle.team/docs/sql-schema-declaration), [https://orm.drizzle.team/docs/get-started-postgresql](https://orm.drizzle.team/docs/get-started-postgresql)
- Drizzle raw SQL and transactions: [https://orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql), [https://orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions)
- Drizzle migrations: [https://orm.drizzle.team/docs/drizzle-kit-generate](https://orm.drizzle.team/docs/drizzle-kit-generate), [https://orm.drizzle.team/docs/drizzle-kit-migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- Drizzle RLS API: [https://orm.drizzle.team/docs/rls](https://orm.drizzle.team/docs/rls)
- PostgreSQL RLS and GUCs: [https://www.postgresql.org/docs/current/ddl-rowsecurity.html](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [https://www.postgresql.org/docs/current/sql-set.html](https://www.postgresql.org/docs/current/sql-set.html), [https://www.postgresql.org/docs/current/functions-admin.html](https://www.postgresql.org/docs/current/functions-admin.html), [https://www.postgresql.org/docs/current/runtime-config-custom.html](https://www.postgresql.org/docs/current/runtime-config-custom.html)
- PgBouncer pooling and prepared statement behavior: [https://www.pgbouncer.org/features.html](https://www.pgbouncer.org/features.html), [https://www.pgbouncer.org/config.html](https://www.pgbouncer.org/config.html)
- node-postgres query/prepared statement behavior: [https://node-postgres.com/features/queries](https://node-postgres.com/features/queries), [https://node-postgres.com/apis/client](https://node-postgres.com/apis/client)
- Better Auth Drizzle adapter and schema generation: [https://better-auth.com/docs/adapters/drizzle](https://better-auth.com/docs/adapters/drizzle), [https://better-auth.com/docs/concepts/database](https://better-auth.com/docs/concepts/database)

## Scope split

1b builds now:

- `organizations` as the tenant root. Organization equals tenant and maps one-to-one to a tenant Gateway per ADR-002/ADR-007.
- `workspaces` as the initial tenant-owned child table used to prove RLS. This is not the Task domain and not OpenClaw's employee workspace model.
- `tenant_rls_probes` as an explicit small tenant-owned proof table for RLS denial tests. It is an adapter/test-support table, not a domain aggregate.
- Shared Postgres adapter package with Drizzle `pg` client, transaction helper, RLS error mapping, migration runner entrypoint, and migration hash gate.
- RLS policies with both `USING` and `WITH CHECK`, `ENABLE ROW LEVEL SECURITY`, and `FORCE ROW LEVEL SECURITY`.
- A Vitest integration acceptance test that proves tenant A rows are invisible under tenant B and cross-tenant writes are denied.

1c adds later:

- Better Auth core tables: `user`, `session`, `account`, `verification`, using the official core schema ([exact URL: https://better-auth.com/docs/concepts/database](https://better-auth.com/docs/concepts/database)).
- Better Auth Drizzle adapter from the installed `@better-auth/drizzle-adapter` package manifest. The official adapter page uses `import { drizzleAdapter } from "@better-auth/drizzle-adapter"` and `provider: "pg"` is the Postgres provider option ([exact URL: https://better-auth.com/docs/adapters/drizzle](https://better-auth.com/docs/adapters/drizzle)). The older installation-page path `better-auth/adapters/drizzle` is stale for Opzava; resolve imports from `node_modules/@better-auth/drizzle-adapter/package.json` `exports` after install and gate it in CI.
- Better Auth organization plugin mirror tables and login/session flows. Auth remains behind `AuthPort`; fine-grained access remains behind `AuthorizationPort`.

1e adds later:

- Task/PM domain tables and task workflows. Do not add a `task` table, Task aggregate, or PM-card read model in 1b.

## Initial 1b schema

Use the ADR-001 package ownership rule: Identity & Access owns tenant identity tables, and `packages/adapters/postgres` owns reusable infrastructure. The first implementation should use one canonical SQL stream, but the source Drizzle table definitions live beside the owning bounded context.

Recommended table names use plural snake_case for Opzava-owned canonical tables. Better Auth keeps separate mapped names in 1c to avoid source-of-truth ambiguity.

Core DDL shape:

```sql
create schema if not exists app;

create type organization_lifecycle_state as enum (
  'provisioning',
  'active',
  'suspended',
  'deprovisioning',
  'deleted'
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  lifecycle_state organization_lifecycle_state not null default 'provisioning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table tenant_rls_probes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  marker text not null,
  created_at timestamptz not null default now()
);
```

Use a small helper function so policies do not throw on missing, empty, or malformed context. PostgreSQL accepts custom two-part setting names such as `app.current_org` ([exact URL: https://www.postgresql.org/docs/current/runtime-config-custom.html](https://www.postgresql.org/docs/current/runtime-config-custom.html)); `current_setting(name, true)` returns null instead of raising when missing ([exact URL: https://www.postgresql.org/docs/current/functions-admin.html](https://www.postgresql.org/docs/current/functions-admin.html)).

```sql
create or replace function app.current_org_id()
returns uuid
language sql
stable
as $$
  select case
    when current_setting('app.current_org', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then current_setting('app.current_org', true)::uuid
    else null
  end
$$;
```

RLS must be enabled and forced. PostgreSQL docs state that enabled RLS requires policy permission for normal row access, defaults to deny when no policy exists, superusers and `BYPASSRLS` bypass RLS, and table owners normally bypass RLS unless `FORCE ROW LEVEL SECURITY` is used ([exact URL: https://www.postgresql.org/docs/current/ddl-rowsecurity.html](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).

```sql
alter table organizations enable row level security;
alter table organizations force row level security;

create policy organizations_tenant_isolation on organizations
  for all
  to opzava_app
  using (id = app.current_org_id())
  with check (id = app.current_org_id());

alter table workspaces enable row level security;
alter table workspaces force row level security;

create policy workspaces_tenant_isolation on workspaces
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

alter table tenant_rls_probes enable row level security;
alter table tenant_rls_probes force row level security;

create policy tenant_rls_probes_tenant_isolation on tenant_rls_probes
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());
```

Role model:

- Migration role owns tables and functions, for example `opzava_owner`.
- App containers connect only as `opzava_app`, a non-superuser, non-owner role without `BYPASSRLS`.
- App role receives least privileges: `usage` on schema, DML on application tables, and sequence/default privileges if needed.
- Never connect app, broker, workers, tests, or projectors as migration owner, table owner, superuser, or a role with `BYPASSRLS`.

Drizzle schema sketch:

```ts
import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const appRole = pgRole("opzava_app").existing();

export const organizationLifecycleState = pgEnum("organization_lifecycle_state", [
  "provisioning",
  "active",
  "suspended",
  "deprovisioning",
  "deleted",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    lifecycleState: organizationLifecycleState("lifecycle_state").notNull().default("provisioning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("organizations_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.id} = app.current_org_id()`,
      withCheck: sql`${table.id} = app.current_org_id()`,
    }),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspaces_organization_id_slug_unique").on(table.organizationId, table.slug),
    pgPolicy("workspaces_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
  ],
);
```

Drizzle can express RLS roles/policies and `pgTable.withRLS(...)` ([exact URL: https://orm.drizzle.team/docs/rls](https://orm.drizzle.team/docs/rls)), but the implementation should still add custom SQL migrations for `app.current_org_id()`, `FORCE ROW LEVEL SECURITY`, grants, and role ownership because those are security invariants, not optional generated decoration.

## `withTenant` and RLS pattern

`withTenant(orgId, fn)` lives in `packages/adapters/postgres`, not in a domain package. Domain/application code receives repositories or unit-of-work abstractions; it must not import raw Drizzle tables or create its own transaction context.

Design:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`set local app.current_org = ${orgId}`);
  await assertCurrentTenant(tx, orgId);
  return fn(tx);
});
```

Drizzle supports transactions through `db.transaction(async (tx) => ...)` and raw parameterized SQL through `sql`/`db.execute(...)` ([transactions exact URL: https://orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions), [raw SQL exact URL: https://orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql)). PostgreSQL `SET LOCAL` lasts only until transaction end and has no effect outside a transaction block ([exact URL: https://www.postgresql.org/docs/current/sql-set.html](https://www.postgresql.org/docs/current/sql-set.html)).

Wrapper rules:

- Validate `orgId` as a UUID before entering SQL.
- Open a transaction first, then `SET LOCAL app.current_org`.
- Immediately read `select app.current_org_id()` and throw `TenantContextMissing` if it is null or not equal to the requested org.
- Run `fn(tx)` with a tenant-scoped transaction type, not the root db client.
- Map SQLSTATE `42501` and RLS write failures to Opzava `Forbidden` and HTTP 403.
- For tenant resource reads by id, do not return `200` plus empty data when the route/session expected an org-bound resource. The service maps missing tenant context, authorization denial, and RLS invisibility on targeted resource access to hard 403 per ADR-007 and `docs/plan/grilling-decisions.md`.
- List queries can return an empty list only after valid auth, valid active org, `AuthorizationPort.can(...)`, and `withTenant(...)` have succeeded.

RLS gives the database-level backstop: missing or mismatched `app.current_org` makes `app.current_org_id()` null, so `USING` hides rows and `WITH CHECK` rejects inserts/updates. The application-level contract turns the security sad path into visible 403s instead of product ambiguity.

## PgBouncer and Drizzle client

Use Drizzle over `pg`/node-postgres for the app data layer. The Drizzle Postgres docs show native `node-postgres` support and construction over an existing `pg.Pool` ([exact URL: https://orm.drizzle.team/docs/get-started-postgresql](https://orm.drizzle.team/docs/get-started-postgresql)). The earlier foundation memo locks Drizzle ORM `0.45.2`, `pg`, and prepared statements off for PgBouncer transaction mode.

Client sketch:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  application_name: "opzava-app",
});

export const db = drizzle({ client: pool, schema });
```

Prepared statement policy:

- Use `pg`, not `postgres.js`, because Drizzle notes that `postgres.js` uses prepared statements by default and may require opt-out ([exact URL: https://orm.drizzle.team/docs/get-started-postgresql](https://orm.drizzle.team/docs/get-started-postgresql)).
- node-postgres uses prepared statements when a query config supplies a `name`; unnamed text/parameterized queries do not create a named prepared plan ([exact URL: https://node-postgres.com/features/queries](https://node-postgres.com/features/queries), [QueryConfig exact URL: https://node-postgres.com/apis/client](https://node-postgres.com/apis/client)). Therefore Opzava code must not supply `name` in query configs and must not use Drizzle `.prepare()`/prepared relational query APIs on the PgBouncer path.
- Configure PgBouncer transaction pooling for app traffic. PgBouncer docs define transaction pooling as assigning a server connection only during a transaction and warn that it breaks session-based features; `SET/RESET`, `LISTEN`, SQL `PREPARE`/`DEALLOCATE`, and session advisory locks are incompatible in transaction mode ([exact URL: https://www.pgbouncer.org/features.html](https://www.pgbouncer.org/features.html)).
- Set PgBouncer `pool_mode = transaction` and `max_prepared_statements = 0` for the Opzava app pool. PgBouncer docs explain that nonzero `max_prepared_statements` enables protocol-level prepared statement tracking in transaction/statement pooling; Opzava disables this to keep behavior simple during migrations and RLS debugging ([exact URL: https://www.pgbouncer.org/config.html](https://www.pgbouncer.org/config.html)).

Local dev plan:

- 1b local dev can connect directly to Postgres to reduce moving parts.
- The code path must still use `withTenant`, `SET LOCAL`, unnamed parameterized queries, and non-owner `opzava_app`.
- Add PgBouncer to local compose as a parity service before any shared environment deploy. Do not change repository code when toggling direct Postgres vs PgBouncer; only `DATABASE_URL` changes.

## Migration pipeline and gating

Drizzle official docs define schema files as TypeScript source for migrations and show `drizzle.config.ts` with `schema`, `out`, `dialect: "postgresql"`, and `dbCredentials.url` ([exact URL: https://orm.drizzle.team/docs/get-started/postgresql-new](https://orm.drizzle.team/docs/get-started/postgresql-new)). `drizzle-kit generate` diffs schema snapshots and writes SQL plus snapshot files ([exact URL: https://orm.drizzle.team/docs/drizzle-kit-generate](https://orm.drizzle.team/docs/drizzle-kit-generate)); `drizzle-kit migrate` reads unapplied SQL migrations, runs them, and records them in the Drizzle migrations table ([exact URL: https://orm.drizzle.team/docs/drizzle-kit-migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)).

Recommended file layout:

```text
packages/
  identity-access/
    src/
      adapters/postgres/schema/tenancy.ts
      adapters/postgres/schema/index.ts
    drizzle/
      0000_slice1b_tenancy_rls.sql
      meta/
  adapters/
    postgres/
      src/client.ts
      src/tenant-context.ts
      src/errors.ts
      src/migrate.ts
      src/migration-gate.ts
      drizzle.config.ts
```

`packages/adapters/postgres/drizzle.config.ts` should be the deployable migration entrypoint, with schema globs that import owner package schema files:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "../identity-access/src/adapters/postgres/schema/index.ts",
  ],
  out: "../identity-access/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

Pipeline:

- Generate reviewed migrations from the owning schema: `drizzle-kit generate`.
- Manually inspect generated SQL and add custom SQL for role grants, `app.current_org_id()`, `FORCE ROW LEVEL SECURITY`, and any RLS assertions Drizzle cannot represent.
- Apply migrations only through a one-shot migration job or CI/deploy step running as the migration owner. Never run migrations from `apps/web`, `apps/gateway-broker`, or `apps/workers` containers.
- Store an ordered migration manifest with SHA-256 hashes of every migration file. The one-shot job verifies hashes before `drizzle-kit migrate`; drift fails closed.
- Forbid `drizzle-kit push`, `--force`, ad hoc SQL from app containers, and "fix production by editing the DB" workflows in shared environments.
- Migration role and app role are separate. Migration uses owner privileges; runtime uses `opzava_app`.

1c Better Auth ordering:

1. Resolve `@better-auth/drizzle-adapter` import path from the installed package manifest. The repo currently has no installed `node_modules/@better-auth/drizzle-adapter`, so this must be done during 1c dependency installation, not assumed from stale examples.
2. Add Better Auth config with Drizzle adapter `provider: "pg"` and organization plugin mapped names.
3. Run `auth generate` to generate Better Auth schema, as official docs instruct for Drizzle adapters ([exact URL: https://better-auth.com/docs/adapters/drizzle](https://better-auth.com/docs/adapters/drizzle)).
4. Review/move generated auth tables into the auth adapter schema area without making them canonical domain tables.
5. Run `drizzle-kit generate`, inspect SQL, then one-shot `drizzle-kit migrate`.

## Acceptance test

Create a Vitest integration test under the Postgres adapter package, for example `packages/adapters/postgres/src/__tests__/tenant-rls.integration.test.ts`. It should run against a migrated local test database as non-owner `opzava_app`; setup/teardown can use a separate test admin connection only for fixtures.

Concrete test cases:

```ts
it("isolates tenant rows by app.current_org", async () => {
  const orgA = await adminCreateOrganization("org-a");
  const orgB = await adminCreateOrganization("org-b");

  await withTenant(orgA.id, async (tx) => {
    await tx.insert(workspaces).values({
      organizationId: orgA.id,
      slug: "a-workspace",
      name: "A Workspace",
    });
  });

  await withTenant(orgB.id, async (tx) => {
    const rows = await tx.select().from(workspaces);
    expect(rows).toHaveLength(0);
  });
});

it("rejects cross-tenant writes with a hard forbidden error", async () => {
  const orgA = await adminCreateOrganization("org-a");
  const orgB = await adminCreateOrganization("org-b");

  await expect(
    withTenant(orgB.id, async (tx) => {
      await tx.insert(workspaces).values({
        organizationId: orgA.id,
        slug: "wrong-tenant",
        name: "Wrong Tenant",
      });
    }),
  ).rejects.toMatchObject({ status: 403 });
});

it("rejects missing tenant context before tenant table access", async () => {
  await expect(selectWorkspacesWithoutWithTenant()).rejects.toMatchObject({ status: 403 });
});
```

The first assertion proves the raw RLS visibility rule: org B sees zero org A rows. The second proves `WITH CHECK` denial is surfaced as 403. The third proves the Opzava invariant from ADR-007 and `opzava-conventions`: a missing tenant context is a hard 403, never `200` with an empty list.

## Files to create in implementation

- `packages/identity-access/package.json`: bounded-context package if not already present.
- `packages/identity-access/src/adapters/postgres/schema/tenancy.ts`: canonical Opzava `organizations`, `workspaces`, `tenant_rls_probes`, enums, indexes, and Drizzle policy declarations.
- `packages/identity-access/src/adapters/postgres/schema/index.ts`: exports only schema objects needed by Drizzle Kit; do not export these from the public domain package API.
- `packages/identity-access/drizzle/0000_slice1b_tenancy_rls.sql`: generated and reviewed migration with custom SQL for helper function, force RLS, grants, and role separation.
- `packages/adapters/postgres/package.json`: shared Postgres adapter package.
- `packages/adapters/postgres/src/client.ts`: `pg.Pool` plus Drizzle construction, unnamed-query policy, no prepared query APIs.
- `packages/adapters/postgres/src/tenant-context.ts`: `withTenant(orgId, fn)` transaction wrapper and `assertCurrentTenant`.
- `packages/adapters/postgres/src/errors.ts`: SQLSTATE/RLS to `Forbidden` mapping used by BFF/workers.
- `packages/adapters/postgres/src/migrate.ts`: one-shot migration runner entrypoint used by CI/deploy jobs only.
- `packages/adapters/postgres/src/migration-gate.ts`: hash manifest verification and `push`/`--force` guard.
- `packages/adapters/postgres/drizzle.config.ts`: Drizzle Kit config for schema and migration output.
- `packages/adapters/postgres/src/__tests__/tenant-rls.integration.test.ts`: 1b acceptance proof.

Non-goals for this implementation list: Better Auth login routes, Better Auth auth tables, passkeys/MFA, actual Membership/RoleGrant policy evaluator, Task/PM tables, OpenClaw Gateway provisioning, outbox, and projections.
