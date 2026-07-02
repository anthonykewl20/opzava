import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase, db, pool } from "../client.js";
import { readMigrationDatabaseUrl } from "../env.js";
import { assertCurrentTenant, withTenant } from "../tenant-context.js";

const { Pool } = pg;

interface OrganizationFixture {
  readonly id: string;
  readonly slug: string;
}

const adminPool = new Pool({
  connectionString: readMigrationDatabaseUrl(),
  application_name: "opzava-tenant-rls-test-admin"
});

const testRunId = randomUUID();
const createdOrganizationIds: string[] = [];

function rowsFromExecuteResult(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as ReadonlyArray<Record<string, unknown>>;
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as ReadonlyArray<Record<string, unknown>>) : [];
}

async function adminCreateOrganization(label: string): Promise<OrganizationFixture> {
  const id = randomUUID();
  const slug = `slice1b-${testRunId}-${label}-${createdOrganizationIds.length}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [id, slug, `Slice 1b ${label}`]
  );

  createdOrganizationIds.push(id);
  return { id, slug };
}

async function selectWorkspacesWithoutWithTenant(
  expectedOrgId: string
): Promise<ReadonlyArray<Record<string, unknown>>> {
  await assertCurrentTenant(db, expectedOrgId);
  const result = await db.execute(sql`select id, organization_id, slug from public.workspaces`);
  return rowsFromExecuteResult(result);
}

afterEach(async () => {
  if (createdOrganizationIds.length === 0) {
    return;
  }

  const ids = [...createdOrganizationIds];
  await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [
    ids
  ]);
  await adminPool.query(
    "delete from public.tenant_rls_probes where organization_id = any($1::uuid[])",
    [ids]
  );
  await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [ids]);
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});

beforeAll(async () => {
  // Guard: this proof is only meaningful if `db` connects as the non-owner,
  // non-superuser, non-BYPASSRLS opzava_app role. If DATABASE_URL were mis-set
  // to an owner/superuser role, RLS would be bypassed and every assertion below
  // would false-pass. Fail the suite loudly instead of proving nothing.
  const result = await db.execute(sql`
    select current_user as session_role, rolsuper as is_super, rolbypassrls as bypass_rls
    from pg_roles
    where rolname = current_user
  `);
  const row = rowsFromExecuteResult(result)[0];
  if (
    row?.["session_role"] !== "opzava_app" ||
    row?.["is_super"] === true ||
    row?.["bypass_rls"] === true
  ) {
    throw new Error(
      `RLS integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`
    );
  }
});

describe("tenant RLS integration", () => {
  it("rejects tenant units of work when the database role is not opzava_app", async () => {
    const org = await adminCreateOrganization("role-guard");
    const adminDb = createPostgresDatabase(adminPool);

    await expect(
      withTenant(
        org.id,
        async (tx) => {
          await tx.execute(sql`select 1`);
        },
        adminDb
      )
    ).rejects.toMatchObject({
      status: 403,
      code: "postgres.runtimeDatabaseRoleMismatch"
    });
  });

  it("isolates tenant rows by app.current_org", async () => {
    const orgA = await adminCreateOrganization("read-a");
    const orgB = await adminCreateOrganization("read-b");

    await withTenant(orgA.id, async (tx) => {
      await tx.execute(sql`
        insert into public.workspaces (organization_id, slug, name)
        values (${orgA.id}, ${`${orgA.slug}-workspace`}, 'A Workspace')
      `);
    });

    await withTenant(orgB.id, async (tx) => {
      const result = await tx.execute(sql`
        select id, organization_id, slug
        from public.workspaces
        order by slug
      `);

      expect(rowsFromExecuteResult(result)).toHaveLength(0);
    });
  });

  it("rejects cross-tenant writes with a hard forbidden error", async () => {
    const orgA = await adminCreateOrganization("write-a");
    const orgB = await adminCreateOrganization("write-b");

    await expect(
      withTenant(orgB.id, async (tx) => {
        await tx.execute(sql`
          insert into public.workspaces (organization_id, slug, name)
          values (${orgA.id}, 'wrong-tenant', 'Wrong Tenant')
        `);
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing tenant context before tenant table access", async () => {
    const org = await adminCreateOrganization("missing-context");

    await expect(selectWorkspacesWithoutWithTenant(org.id)).rejects.toMatchObject({ status: 403 });
  });
});
