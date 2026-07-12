import {
  createPostgresPool,
  db,
  pool,
  sql,
  withTenant,
  type TenantTransaction,
} from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

interface TenantFixture {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

interface SeededAiWorkforceRows {
  readonly taskId: string;
  readonly agentIdentityId: string;
  readonly taskAgentAssignmentId: string;
  readonly agentDispatchId: string;
  readonly taskRunStepId: string;
  readonly taskPullQueueId: string;
  readonly taskPrLinkId: string;
}

const testRunId = randomUUID();
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for S1b AI workforce RLS tests.");
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
  const slug = `s1b-${testRunId}-${label}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `S1b ${label}`],
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

async function adminSeedAiWorkforceRows(tenant: TenantFixture): Promise<SeededAiWorkforceRows> {
  const taskId = randomUUID();
  const agentIdentityId = randomUUID();
  const taskAgentAssignmentId = randomUUID();
  const agentDispatchId = randomUUID();
  const taskRunStepId = randomUUID();
  const taskPullQueueId = randomUUID();
  const taskPrLinkId = randomUUID();

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
      position
    )
    values ($1, $2, $3, 1, 'Tenant A task', '', 'todo', 'normal', '{}'::text[], 1)`,
    [taskId, tenant.organizationId, tenant.workspaceId],
  );
  await adminPool.query(
    `insert into public.agent_identity (
      id,
      organization_id,
      workspace_id,
      name,
      kind
    )
    values ($1, $2, $3, 'orchestrator-a', 'orchestrator')`,
    [agentIdentityId, tenant.organizationId, tenant.workspaceId],
  );
  await adminPool.query(
    `insert into public.task_agent_assignment (
      id,
      organization_id,
      workspace_id,
      task_id,
      agent_identity_id
    )
    values ($1, $2, $3, $4, $5)`,
    [taskAgentAssignmentId, tenant.organizationId, tenant.workspaceId, taskId, agentIdentityId],
  );
  await adminPool.query(
    `insert into public.agent_dispatch (
      id,
      organization_id,
      workspace_id,
      task_id,
      outbox_id,
      channel
    )
    values ($1, $2, $3, $4, 'outbox-a', 'gateway_push')`,
    [agentDispatchId, tenant.organizationId, tenant.workspaceId, taskId],
  );
  await adminPool.query(
    `insert into public.task_run_step (
      id,
      organization_id,
      workspace_id,
      task_id,
      agent_identity_id,
      sequence,
      summary
    )
    values ($1, $2, $3, $4, $5, 1, 'Started work')`,
    [taskRunStepId, tenant.organizationId, tenant.workspaceId, taskId, agentIdentityId],
  );
  await adminPool.query(
    `insert into public.task_pull_queue (
      id,
      organization_id,
      workspace_id,
      task_id,
      agent_identity_id,
      reason
    )
    values ($1, $2, $3, $4, $5, 'poll')`,
    [taskPullQueueId, tenant.organizationId, tenant.workspaceId, taskId, agentIdentityId],
  );
  await adminPool.query(
    `insert into public.task_pr_link (
      id,
      organization_id,
      workspace_id,
      task_id,
      pr_ref,
      ci_state,
      merge_state
    )
    values ($1, $2, $3, $4, 'owner/repo#1', 'unknown', 'none')`,
    [taskPrLinkId, tenant.organizationId, tenant.workspaceId, taskId],
  );

  return {
    taskId,
    agentIdentityId,
    taskAgentAssignmentId,
    agentDispatchId,
    taskRunStepId,
    taskPullQueueId,
    taskPrLinkId,
  };
}

async function expectReadHidden(
  tenantBOrgId: string,
  read: (tx: TenantTransaction) => Promise<unknown>,
): Promise<void> {
  const result = await withTenant(tenantBOrgId, read);
  expect(rowsFromExecuteResult(result)).toHaveLength(0);
}

async function expectInsertRejected(
  tenantBOrgId: string,
  insert: (tx: TenantTransaction) => Promise<unknown>,
): Promise<void> {
  await expect(withTenant(tenantBOrgId, insert)).rejects.toMatchObject({ status: 403 });
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.task_pr_link where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_pull_queue where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_run_step where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.agent_dispatch where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_agent_assignment where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.agent_identity where organization_id = any($1::uuid[])",
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
      `S1b AI workforce RLS test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
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

describe("S1b AI workforce RLS", () => {
  it("hides tenant-A rows from tenant B and rejects tenant-B inserts with tenant-A organization_id", async () => {
    const tenantA = await adminCreateTenant("tenant-a");
    const tenantB = await adminCreateTenant("tenant-b");
    const seeded = await adminSeedAiWorkforceRows(tenantA);

    await expectReadHidden(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        select id
        from public.agent_identity
        where id = ${seeded.agentIdentityId}
      `),
    );
    await expectInsertRejected(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        insert into public.agent_identity (
          organization_id,
          workspace_id,
          name,
          kind
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          'wrong-tenant-agent',
          'local_tool'
        )
      `),
    );

    await expectReadHidden(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        select id
        from public.task_agent_assignment
        where id = ${seeded.taskAgentAssignmentId}
      `),
    );
    await expectInsertRejected(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        insert into public.task_agent_assignment (
          organization_id,
          workspace_id,
          task_id,
          agent_identity_id,
          active
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          ${seeded.taskId},
          ${seeded.agentIdentityId},
          false
        )
      `),
    );

    await expectReadHidden(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        select id
        from public.agent_dispatch
        where id = ${seeded.agentDispatchId}
      `),
    );
    await expectInsertRejected(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        insert into public.agent_dispatch (
          organization_id,
          workspace_id,
          task_id,
          outbox_id,
          channel
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          ${seeded.taskId},
          'wrong-tenant-outbox',
          'local_poll'
        )
      `),
    );

    await expectReadHidden(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        select id
        from public.task_run_step
        where id = ${seeded.taskRunStepId}
      `),
    );
    await expectInsertRejected(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        insert into public.task_run_step (
          organization_id,
          workspace_id,
          task_id,
          agent_identity_id,
          sequence,
          summary
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          ${seeded.taskId},
          ${seeded.agentIdentityId},
          2,
          'Wrong tenant step'
        )
      `),
    );

    await expectReadHidden(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        select id
        from public.task_pull_queue
        where id = ${seeded.taskPullQueueId}
      `),
    );
    await expectInsertRejected(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        insert into public.task_pull_queue (
          organization_id,
          workspace_id,
          task_id,
          agent_identity_id,
          reason
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          ${seeded.taskId},
          ${seeded.agentIdentityId},
          'wrong tenant poll'
        )
      `),
    );

    await expectReadHidden(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        select id
        from public.task_pr_link
        where id = ${seeded.taskPrLinkId}
      `),
    );
    await expectInsertRejected(tenantB.organizationId, (tx) =>
      tx.execute(sql`
        insert into public.task_pr_link (
          organization_id,
          workspace_id,
          task_id,
          pr_ref,
          ci_state,
          merge_state
        )
        values (
          ${tenantA.organizationId},
          ${tenantA.workspaceId},
          ${seeded.taskId},
          'owner/repo#2',
          'unknown',
          'none'
        )
      `),
    );
  });
});
