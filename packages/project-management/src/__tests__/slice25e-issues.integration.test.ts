import {
  createPostgresPool,
  db,
  pool,
  sql,
  withTenant,
} from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { enqueueIssueCloseForTask } from "../application/issues.js";
import type { TaskDto } from "../application/tasks.js";

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
    throw new Error("DATABASE_MIGRATION_URL is required for slice 2.5e issue tests.");
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
  const slug = `slice25e-${testRunId}-${label}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `Slice 2.5e ${label}`],
  );
  await adminPool.query(
    `insert into public.workspaces (id, organization_id, slug, name)
     values ($1, $2, $3, $4)`,
    [workspaceId, organizationId, "admin", "Admin"],
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [userId, `Member ${label}`, `${label}-${testRunId}@example.test`],
  );
  await adminPool.query(
    `insert into public.memberships (organization_id, user_id, status, membership_version)
     values ($1, $2, 'active', 1)`,
    [organizationId, userId],
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
    [organizationId, userId],
  );

  createdOrganizationIds.push(organizationId);
  createdUserIds.push(userId);
  return { organizationId, workspaceId, userId };
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.issue_close_outbox where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.issue_projection where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query("delete from public.tasks where organization_id = any($1::uuid[])", [
      organizationIds,
    ]);
    await adminPool.query(
      "delete from public.role_grants where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.memberships where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [
      organizationIds,
    ]);
    await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [
      organizationIds,
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
      `Slice 2.5e issue integration test must run as opzava_app; got ${JSON.stringify(row)}`,
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

describe("slice 2.5e issue RLS", () => {
  it("keeps cross-tenant issue projections invisible and denies missing context writes", async () => {
    const tenantA = await adminCreateTenant("a");
    const tenantB = await adminCreateTenant("b");

    await withTenant(tenantA.organizationId, async (tx) =>
      tx.execute(sql`
        insert into public.issue_projection (
          organization_id,
          workspace_id,
          repository,
          number,
          title,
          state,
          labels,
          assignee,
          updated_at,
          synced_at,
          url
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          'anthonykewl20/opzava',
          100,
          'Tenant A issue',
          'open',
          '{}'::text[],
          null,
          now(),
          now(),
          'https://github.com/anthonykewl20/opzava/issues/100'
        )
      `),
    );

    const crossTenant = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`select title from public.issue_projection`),
    );
    expect(rowsFromExecuteResult(crossTenant)).toHaveLength(0);

    await expect(
      withTenant(tenantB.organizationId, async (tx) =>
        tx.execute(sql`
          insert into public.issue_projection (
            organization_id,
            workspace_id,
            repository,
            number,
            title,
            state,
            labels,
            assignee,
            updated_at,
            synced_at,
            url
          )
          values (
            ${tenantA.organizationId},
            ${tenantA.workspaceId},
            'anthonykewl20/opzava',
            101,
            'Cross tenant write',
            'open',
            '{}'::text[],
            null,
            now(),
            now(),
            'https://github.com/anthonykewl20/opzava/issues/101'
          )
        `),
      ),
    ).rejects.toThrow();

    await expect(
      db.execute(sql`
        insert into public.issue_projection (
          organization_id,
          workspace_id,
          repository,
          number,
          title,
          state,
          labels,
          assignee,
          updated_at,
          synced_at,
          url
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          'anthonykewl20/opzava',
          102,
          'No context write',
          'open',
          '{}'::text[],
          null,
          now(),
          now(),
          'https://github.com/anthonykewl20/opzava/issues/102'
        )
      `),
    ).rejects.toThrow();
  });

  it("deduplicates active-close outbox rows for a linked task", async () => {
    const tenant = await adminCreateTenant("active-close");
    const taskId = randomUUID();
    const task: TaskDto = {
      id: taskId,
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      cardNumber: 7001,
      title: "Linked GitHub task",
      description: "",
      status: "done",
      priority: "normal",
      assigneeUserId: null,
      assigneeName: null,
      labels: [],
      position: 1,
      dueAt: null,
      provenanceSource: "github",
      provenanceExternalRef: "github:anthonykewl20/opzava#77",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await adminPool.query(
      `insert into public.tasks (
        id,
        organization_id,
        workspace_id,
        card_number,
        title,
        description,
        status,
        priority,
        labels,
        position,
        provenance_source,
        provenance_external_ref
      )
      values ($1, $2, $3, $4, $5, '', 'done', 'normal', '{}'::text[], 1, 'github', $6)`,
      [
        task.id,
        task.organizationId,
        task.workspaceId,
        task.cardNumber,
        task.title,
        task.provenanceExternalRef,
      ],
    );

    const first = await enqueueIssueCloseForTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: { userId: tenant.userId, roleKeys: ["admin"] },
      task,
    });
    const second = await enqueueIssueCloseForTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: { userId: tenant.userId, roleKeys: ["admin"] },
      task,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error("expected active-close enqueue success");
    }
    expect(first.value?.dedupeKey).toBe(second.value?.dedupeKey);

    const count = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select count(*)::integer as count
        from public.issue_close_outbox
        where task_id = ${task.id}
      `),
    );
    expect(rowsFromExecuteResult(count)[0]?.["count"]).toBe(1);
  });
});
