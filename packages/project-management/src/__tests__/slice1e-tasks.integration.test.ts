import { createPostgresPool, db, pool, sql, withTenant } from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTask, getTask, listTasks, moveTask, updateTask } from "../application/tasks.js";

interface TenantFixture {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

const testRunId = randomUUID();
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for slice 1e task tests.");
  }

  return value;
}

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

async function adminCreateTenant(label: string): Promise<TenantFixture> {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const slug = `slice1e-${testRunId}-${label}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `Slice 1e ${label}`]
  );
  await adminPool.query(
    `insert into public.workspaces (id, organization_id, slug, name)
     values ($1, $2, $3, $4)`,
    [workspaceId, organizationId, "admin", "Admin"]
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [userId, `Member ${label}`, `${label}-${testRunId}@example.test`]
  );
  await adminPool.query(
    `insert into public.memberships (organization_id, user_id, status, membership_version)
     values ($1, $2, 'active', 1)`,
    [organizationId, userId]
  );
  await adminPool.query(
    `insert into public.role_grants (
      organization_id,
      subject_type,
      subject_id,
      role_key,
      scope_type,
      scope_id,
      granted_by_user_id
    )
    values ($1, 'user', $2, 'member', 'organization', $1, $2)`,
    [organizationId, userId]
  );

  createdOrganizationIds.push(organizationId);
  createdUserIds.push(userId);
  return { organizationId, workspaceId, userId };
}

function actor(userId: string) {
  return { userId, roleKeys: ["member"] };
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
    await adminPool.query("delete from public.tasks where organization_id = any($1::uuid[])", [
      organizationIds
    ]);
    await adminPool.query("delete from public.role_grants where organization_id = any($1::uuid[])", [
      organizationIds
    ]);
    await adminPool.query("delete from public.memberships where organization_id = any($1::uuid[])", [
      organizationIds
    ]);
    await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [
      organizationIds
    ]);
    await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [
      organizationIds
    ]);
  }

  if (userIds.length > 0) {
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [userIds]);
  }

  createdOrganizationIds.length = 0;
  createdUserIds.length = 0;
}

beforeAll(async () => {
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
      `Slice 1e task integration test must run as non-owner opzava_app; got ${JSON.stringify(
        row
      )}`
    );
  }
});

afterEach(async () => {
  await cleanupCreatedRows();
});

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});

describe("slice 1e tasks", () => {
  it("creates, updates, moves, gets, and lists tasks through the application seam", async () => {
    const tenant = await adminCreateTenant("workflow");

    const created = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "  Write the first admin tasks slice  ",
      description: "Dogfood PM in Opzava.",
      priority: "high",
      assigneeUserId: tenant.userId,
      labels: ["Slice 1e", "Tasks"]
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw created.error;
    }

    expect(created.value.title).toBe("Write the first admin tasks slice");
    expect(created.value.status).toBe("todo");
    expect(created.value.priority).toBe("high");
    expect(created.value.labels).toEqual(["slice 1e", "tasks"]);

    const updated = await updateTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: created.value.id,
      title: "Ship the admin Tasks board",
      description: "List, kanban, create, edit, move, reload.",
      priority: "urgent",
      assigneeUserId: null,
      labels: ["Tasks", "Board"]
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      throw updated.error;
    }
    expect(updated.value.priority).toBe("urgent");
    expect(updated.value.assigneeUserId).toBeNull();

    const moved = await moveTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: created.value.id,
      status: "done",
      position: 1
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      throw moved.error;
    }
    expect(moved.value.status).toBe("done");

    const loaded = await getTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: created.value.id
    });
    expect(loaded).toMatchObject({ ok: true, value: { status: "done" } });

    const listed = await listTasks({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId)
    });
    expect(listed).toMatchObject({ ok: true, value: [{ title: "Ship the admin Tasks board" }] });
  });

  it("proves tenant RLS hides and rejects cross-tenant task access as opzava_app", async () => {
    const tenantA = await adminCreateTenant("tenant-a");
    const tenantB = await adminCreateTenant("tenant-b");

    const created = await createTask({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantA.userId),
      title: "Tenant A task",
      priority: "normal"
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw created.error;
    }

    const tenantBList = await listTasks({
      orgId: tenantB.organizationId,
      workspaceId: tenantB.workspaceId,
      actor: actor(tenantB.userId)
    });
    expect(tenantBList).toMatchObject({ ok: true, value: [] });

    const tenantBCrossWorkspaceList = await listTasks({
      orgId: tenantB.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantB.userId)
    });
    expect(tenantBCrossWorkspaceList).toMatchObject({ ok: true, value: [] });

    const rawTenantBRead = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.tasks
        where id = ${created.value.id}
      `)
    );
    expect(rowsFromExecuteResult(rawTenantBRead)).toHaveLength(0);

    await expect(
      withTenant(tenantB.organizationId, async (tx) => {
        await tx.execute(sql`
          insert into public.tasks (
            organization_id,
            workspace_id,
            title,
            description,
            status,
            priority,
            labels,
            position
          )
          values (
            ${tenantA.organizationId},
            ${tenantA.workspaceId},
            'Wrong tenant task',
            '',
            'todo',
            'normal',
            '{}'::text[],
            1
          )
        `);
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
