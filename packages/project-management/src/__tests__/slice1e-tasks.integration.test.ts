import {
  assertCurrentTenant,
  createPostgresPool,
  db,
  mapDatabaseError,
  pool,
  sql,
  withTenant,
} from "@opzava/adapters";
import type { AuthorizationPort } from "@opzava/ports";
import { ok } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  addComment,
  addQualityCheck,
  addTaskEvidenceFile,
  addTaskEvidenceLink,
  approveQualityReview,
  createStep,
  createTask,
  ensureTaskQualityReview,
  getCardDetail,
  getTask,
  issueDoneConfirmation,
  listTaskEvidence,
  listTasks,
  markTaskDone,
  markCommentsRead,
  moveTask,
  reorderSteps,
  setDue,
  setWatchers,
  toggleQualityCheck,
  toggleStep,
  updateTask,
} from "../application/tasks.js";

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
    [organizationId, slug, `Slice 1e ${label}`],
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

function actor(userId: string) {
  return { userId, roleKeys: ["member"] };
}

const denyingAuthorizationPort: AuthorizationPort = {
  async can() {
    return ok({ allowed: false, reason: "test-denied" });
  },
  async hasTenantGrant() {
    return ok({ allowed: false, reason: "test-denied" });
  },
  async hasProjectGrant() {
    return ok({ allowed: false, reason: "test-denied" });
  },
};

async function insertDoneConfirmationFixture(input: {
  readonly tenant: TenantFixture;
  readonly taskId: string;
  readonly issuedForUserId?: string;
  readonly issuedAt?: Date;
  readonly expiresAt?: Date;
}): Promise<string> {
  const nonce = randomUUID();
  await withTenant(input.tenant.organizationId, async (tx) => {
    await tx.execute(sql`
      insert into public.task_done_confirmation (
        id,
        task_id,
        organization_id,
        workspace_id,
        issued_for_user_id,
        issued_at,
        expires_at
      )
      values (
        ${nonce},
        ${input.taskId},
        ${input.tenant.organizationId},
        ${input.tenant.workspaceId},
        ${input.issuedForUserId ?? input.tenant.userId},
        ${input.issuedAt ?? new Date()},
        ${input.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000)}
      )
    `);
  });
  return nonce;
}

async function approveTaskReview(tenant: TenantFixture, taskId: string): Promise<string> {
  const review = await ensureTaskQualityReview({
    orgId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    actor: actor(tenant.userId),
    taskId,
  });
  expect(review.ok).toBe(true);
  if (!review.ok) {
    throw review.error;
  }

  const approved = await approveQualityReview({
    orgId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    actor: actor(tenant.userId),
    taskId,
  });
  expect(approved.ok).toBe(true);
  if (!approved.ok) {
    throw approved.error;
  }
  return approved.value.id;
}

async function selectStepsWithoutWithTenant(
  expectedOrgId: string,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  await assertCurrentTenant(db, expectedOrgId);
  const result = await db.execute(sql`select id from public.task_steps`);
  return rowsFromExecuteResult(result);
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.task_done_confirmation where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_quality_reviewer where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_quality_check where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_quality_review where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_evidence where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_comment_read_markers where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_comments where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.task_watchers where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query("delete from public.task_steps where organization_id = any($1::uuid[])", [
      organizationIds,
    ]);
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
      `Slice 1e task integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
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
      labels: ["Slice 1e", "Tasks"],
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
      labels: ["Tasks", "Board"],
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
      status: "in_progress",
      position: 1,
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      throw moved.error;
    }
    expect(moved.value.status).toBe("in_progress");

    const loaded = await getTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: created.value.id,
    });
    expect(loaded).toMatchObject({ ok: true, value: { status: "in_progress" } });

    const listed = await listTasks({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
    });
    expect(listed).toMatchObject({ ok: true, value: [{ title: "Ship the admin Tasks board" }] });
  });

  it("rejects terminal status through the shared create and move setters", async () => {
    const tenant = await adminCreateTenant("terminal-shared-setters");
    const created = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Cannot bypass Done on create",
      status: "done",
    });
    expect(created).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
    });

    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Cannot bypass Done on move",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }

    const moved = await moveTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      status: "done",
      position: 9,
    });
    expect(moved).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
    });

    const loaded = await getTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(loaded).toMatchObject({ ok: true, value: { status: "todo", position: 1 } });

    const doneRows = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select id from public.tasks
        where workspace_id = ${tenant.workspaceId}
          and status = 'done'::public.task_status
      `),
    );
    expect(rowsFromExecuteResult(doneRows)).toHaveLength(0);
  });

  it("marks Done only with an approved review and a fresh single-use confirmation", async () => {
    const tenant = await adminCreateTenant("done-confirmation-success");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Admit Done through the governed command",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }
    const reviewId = await approveTaskReview(tenant, task.value.id);
    const nonce = await insertDoneConfirmationFixture({ tenant, taskId: task.value.id });
    const command = {
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      position: 4,
      humanCommand: {
        confirmedByUserId: tenant.userId,
        confirmSource: "admin-web" as const,
        confirmNonce: nonce,
      },
    };

    const completed = await markTaskDone(command);
    expect(completed).toMatchObject({ ok: true, value: { status: "done", position: 4 } });

    const audit = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select
          consumed_at as "consumedAt",
          consumed_by_user_id as "consumedByUserId",
          quality_review_id as "qualityReviewId"
        from public.task_done_confirmation
        where id = ${nonce}
      `),
    );
    expect(rowsFromExecuteResult(audit)[0]).toMatchObject({
      consumedByUserId: tenant.userId,
      qualityReviewId: reviewId,
    });
    expect(rowsFromExecuteResult(audit)[0]?.["consumedAt"]).not.toBeNull();

    const replay = await markTaskDone(command);
    expect(replay).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
    });
  });

  it("consumes one Done confirmation exactly once across concurrent commands", async () => {
    const tenant = await adminCreateTenant("done-confirmation-concurrent");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Admit one concurrent Done command",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }
    await approveTaskReview(tenant, task.value.id);

    const issued = await issueDoneConfirmation({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) {
      throw issued.error;
    }

    const command = {
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      position: 6,
      humanCommand: {
        confirmedByUserId: tenant.userId,
        confirmSource: "admin-web" as const,
        confirmNonce: issued.value,
      },
    };
    const results = await Promise.all([markTaskDone(command), markTaskDone(command)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(results.find((result) => result.ok)).toMatchObject({
      ok: true,
      value: { status: "done", position: 6 },
    });
    expect(results.find((result) => !result.ok)).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
    });

    const state = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select
          t.status,
          count(c.id) filter (where c.consumed_at is not null)::int as "consumedCount"
        from public.tasks t
        left join public.task_done_confirmation c on c.task_id = t.id
        where t.id = ${task.value.id}
        group by t.status
      `),
    );
    expect(rowsFromExecuteResult(state)).toEqual([{ status: "done", consumedCount: 1 }]);
  });

  it("rejects Done without an approved review before consuming the confirmation", async () => {
    const tenant = await adminCreateTenant("done-review-required");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Review must be approved",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }
    const nonce = await insertDoneConfirmationFixture({ tenant, taskId: task.value.id });

    const completed = await markTaskDone({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      position: 3,
      humanCommand: {
        confirmedByUserId: tenant.userId,
        confirmSource: "admin-web",
        confirmNonce: nonce,
      },
    });
    expect(completed).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresApprovedReview" },
    });

    const state = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select
          t.status,
          c.consumed_at as "consumedAt"
        from public.tasks t
        join public.task_done_confirmation c on c.task_id = t.id
        where c.id = ${nonce}
      `),
    );
    expect(rowsFromExecuteResult(state)[0]).toMatchObject({ status: "todo", consumedAt: null });
  });

  it("rejects expired, mismatched, unknown, and unauthorized Done confirmations", async () => {
    const tenant = await adminCreateTenant("done-confirmation-rejections");
    const otherTenant = await adminCreateTenant("done-confirmation-other-user");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Reject invalid confirmations",
    });
    const otherTask = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Wrong confirmation target",
    });
    expect(task.ok && otherTask.ok).toBe(true);
    if (!task.ok || !otherTask.ok) {
      throw new Error("expected task fixtures");
    }
    await approveTaskReview(tenant, task.value.id);

    const expiredNonce = await insertDoneConfirmationFixture({
      tenant,
      taskId: task.value.id,
      issuedAt: new Date(Date.now() - 2 * 60_000),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const wrongUserNonce = await insertDoneConfirmationFixture({
      tenant,
      taskId: task.value.id,
      issuedForUserId: otherTenant.userId,
    });
    const wrongTaskNonce = await insertDoneConfirmationFixture({
      tenant,
      taskId: otherTask.value.id,
    });
    const unknownNonce = randomUUID();

    for (const confirmNonce of [expiredNonce, wrongUserNonce, wrongTaskNonce, unknownNonce]) {
      const result = await markTaskDone({
        orgId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        actor: actor(tenant.userId),
        taskId: task.value.id,
        position: 5,
        humanCommand: {
          confirmedByUserId: tenant.userId,
          confirmSource: "admin-web",
          confirmNonce,
        },
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
      });
    }

    const shapeMismatch = await markTaskDone({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      position: 5,
      humanCommand: {
        confirmedByUserId: otherTenant.userId,
        confirmSource: "admin-web",
        confirmNonce: await insertDoneConfirmationFixture({ tenant, taskId: task.value.id }),
      },
    });
    expect(shapeMismatch).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
    });

    const validNonce = await insertDoneConfirmationFixture({ tenant, taskId: task.value.id });
    const unauthorized = await markTaskDone(
      {
        orgId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        actor: actor(tenant.userId),
        taskId: task.value.id,
        position: 5,
        humanCommand: {
          confirmedByUserId: tenant.userId,
          confirmSource: "admin-web",
          confirmNonce: validNonce,
        },
      },
      { authorizationPort: denyingAuthorizationPort },
    );
    expect(unauthorized).toMatchObject({
      ok: false,
      error: { code: "projectManagement.forbidden" },
    });

    const loaded = await getTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(loaded).toMatchObject({ ok: true, value: { status: "todo" } });
  });

  it("allocates human-readable card numbers per workspace without consuming replays", async () => {
    const tenant = await adminCreateTenant("card-number-sequence");
    const otherWorkspaceId = randomUUID();
    await adminPool.query(
      `insert into public.workspaces (id, organization_id, slug, name)
       values ($1, $2, $3, $4)`,
      [otherWorkspaceId, tenant.organizationId, "service", "Service"],
    );

    const first = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "First workspace card",
      priority: "normal",
      idempotencyKey: "task:create:first-card",
    });
    const replay = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "First workspace card replay",
      priority: "urgent",
      idempotencyKey: "task:create:first-card",
    });
    const second = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Second workspace card",
      priority: "normal",
    });
    const otherWorkspaceTask = await createTask({
      orgId: tenant.organizationId,
      workspaceId: otherWorkspaceId,
      actor: actor(tenant.userId),
      title: "Other workspace first card",
      priority: "normal",
    });
    const burst = await Promise.all(
      [1, 2, 3].map((index) =>
        createTask({
          orgId: tenant.organizationId,
          workspaceId: tenant.workspaceId,
          actor: actor(tenant.userId),
          title: `Concurrent workspace card ${index}`,
          priority: "normal",
        }),
      ),
    );

    expect(first.ok && replay.ok && second.ok && otherWorkspaceTask.ok).toBe(true);
    if (!first.ok || !replay.ok || !second.ok || !otherWorkspaceTask.ok) {
      throw new Error("expected per-workspace card number allocation success");
    }
    const burstCardNumbers = burst.map((result) => {
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw result.error;
      }

      return result.value.cardNumber;
    });

    expect(first.value.cardNumber).toBe(1);
    expect(replay.value.id).toBe(first.value.id);
    expect(replay.value.cardNumber).toBe(1);
    expect(second.value.cardNumber).toBe(2);
    expect(otherWorkspaceTask.value.cardNumber).toBe(1);
    expect(new Set(burstCardNumbers).size).toBe(3);
  });

  it("idempotently returns existing create rows when a stable key is retried", async () => {
    const tenant = await adminCreateTenant("idempotent-creators");

    const firstTask = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Create task with a stable key",
      priority: "normal",
      idempotencyKey: "task:create:same",
    });
    const retriedTask = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Create task retry must not duplicate",
      priority: "urgent",
      idempotencyKey: "task:create:same",
    });
    const differentTask = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Create task with a different key",
      priority: "normal",
      idempotencyKey: "task:create:different",
    });
    expect(firstTask.ok && retriedTask.ok && differentTask.ok).toBe(true);
    if (!firstTask.ok || !retriedTask.ok || !differentTask.ok) {
      throw new Error("expected task creator idempotency success");
    }
    expect(retriedTask.value.id).toBe(firstTask.value.id);
    expect(differentTask.value.id).not.toBe(firstTask.value.id);

    const firstStep = await createStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      text: "Create step with a stable key",
      idempotencyKey: "step:create:same",
    });
    const retriedStep = await createStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      text: "Create step retry must not duplicate",
      idempotencyKey: "step:create:same",
    });
    const differentStep = await createStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      text: "Create step with a different key",
      idempotencyKey: "step:create:different",
    });
    expect(firstStep.ok && retriedStep.ok && differentStep.ok).toBe(true);
    if (!firstStep.ok || !retriedStep.ok || !differentStep.ok) {
      throw new Error("expected step creator idempotency success");
    }
    expect(retriedStep.value.id).toBe(firstStep.value.id);
    expect(differentStep.value.id).not.toBe(firstStep.value.id);

    const firstComment = await addComment({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      body: "Create comment with a stable key.",
      idempotencyKey: "comment:create:same",
    });
    const retriedComment = await addComment({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      body: "Create comment retry must not duplicate.",
      idempotencyKey: "comment:create:same",
    });
    const differentComment = await addComment({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      body: "Create comment with a different key.",
      idempotencyKey: "comment:create:different",
    });
    expect(firstComment.ok && retriedComment.ok && differentComment.ok).toBe(true);
    if (!firstComment.ok || !retriedComment.ok || !differentComment.ok) {
      throw new Error("expected comment creator idempotency success");
    }
    expect(retriedComment.value.id).toBe(firstComment.value.id);
    expect(differentComment.value.id).not.toBe(firstComment.value.id);

    const firstCheck = await addQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      label: "Create check with a stable key",
      idempotencyKey: "quality:create:same",
    });
    const retriedCheck = await addQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      label: "Create check retry must not duplicate",
      idempotencyKey: "quality:create:same",
    });
    const differentCheck = await addQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: firstTask.value.id,
      label: "Create check with a different key",
      idempotencyKey: "quality:create:different",
    });
    expect(firstCheck.ok && retriedCheck.ok && differentCheck.ok).toBe(true);
    if (!firstCheck.ok || !retriedCheck.ok || !differentCheck.ok) {
      throw new Error("expected quality check creator idempotency success");
    }
    expect(retriedCheck.value.checks).toHaveLength(1);
    expect(differentCheck.value.checks).toHaveLength(2);
    expect(retriedCheck.value.checks[0]?.id).toBe(firstCheck.value.checks[0]?.id);
  });

  it("replays an idempotent quality check even after the review is approved", async () => {
    // A retry (at-least-once) of a check that already landed must return the
    // existing review, NOT fail with qualityReviewConflict just because the
    // review was approved after the original check. The approved-is-terminal
    // gate applies only to genuinely new checks.
    const tenant = await adminCreateTenant("quality-approved-replay");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Quality approved replay",
      priority: "normal",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }

    const check = await addQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      label: "Reply reviewed and approved",
      state: "pass",
      idempotencyKey: "quality:approved:replay",
    });
    expect(check.ok).toBe(true);
    if (!check.ok) {
      throw check.error;
    }

    const approved = await approveQualityReview({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      throw approved.error;
    }

    // Same key after approval -> idempotent replay returns the existing review.
    const replay = await addQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      label: "Reply reviewed and approved",
      state: "pass",
      idempotencyKey: "quality:approved:replay",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) {
      throw replay.error;
    }
    expect(replay.value.status).toBe("approved");
    expect(replay.value.checks).toHaveLength(1);
  });

  it("allows moving a task to an already-occupied board position (reorder is not blocked)", async () => {
    // Guards against re-introducing a UNIQUE(workspace,status,position) index:
    // moveTask sets an absolute position with no make-room shift, so a unique
    // index would raise 23505 on any move to an occupied slot. Position is a
    // best-effort display order, intentionally non-unique.
    const tenant = await adminCreateTenant("position-reorder");

    const first = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Board card A",
      status: "todo",
      priority: "normal",
    });
    const second = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Board card B",
      status: "todo",
      priority: "normal",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error("expected both creates to succeed");
    }

    // Move A onto B's occupied position — must succeed, not raise a unique violation.
    const moved = await moveTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: first.value.id,
      status: "todo",
      position: second.value.position,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      throw moved.error;
    }
    expect(moved.value.position).toBe(second.value.position);
  });

  it("manages live-card detail data through the application seam", async () => {
    const tenant = await adminCreateTenant("card-detail");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Build the card detail data layer",
      description: "Add steps, comments, watchers, and due date.",
      priority: "high",
      dueAt: "2026-07-10T12:00:00.000Z",
      provenanceSource: "Claude Code",
      provenanceExternalRef: "local-dev",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }

    const first = await createStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      text: "Define card tables",
    });
    const second = await createStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      text: "Write application services",
    });
    const third = await createStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      text: "Prove ordering",
    });
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) {
      throw new Error("Expected all steps to be created.");
    }

    const reordered = await reorderSteps({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      stepIds: [third.value.id, first.value.id, second.value.id],
    });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) {
      throw reordered.error;
    }
    expect(reordered.value.map((step) => step.text)).toEqual([
      "Prove ordering",
      "Define card tables",
      "Write application services",
    ]);
    expect(reordered.value.map((step) => step.position)).toEqual([1, 2, 3]);

    const toggled = await toggleStep({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      stepId: third.value.id,
      done: true,
    });
    expect(toggled).toMatchObject({ ok: true, value: { done: true } });

    const comment = await addComment({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      body: "Card data layer is ready for UI wiring.",
    });
    expect(comment.ok).toBe(true);
    if (!comment.ok) {
      throw comment.error;
    }

    const readComments = await markCommentsRead({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      commentIds: [comment.value.id],
    });
    expect(readComments).toMatchObject({
      ok: true,
      value: [{ readByUserIds: [tenant.userId] }],
    });

    const due = await setDue({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      dueAt: null,
    });
    expect(due).toMatchObject({ ok: true, value: { dueAt: null } });

    const watchers = await setWatchers({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      userIds: [tenant.userId],
    });
    expect(watchers).toMatchObject({ ok: true, value: [{ userId: tenant.userId }] });

    const detail = await getCardDetail({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) {
      throw detail.error;
    }
    expect(detail.value.task).toMatchObject({
      cardNumber: task.value.cardNumber,
      provenanceSource: "Claude Code",
      provenanceExternalRef: "local-dev",
    });
    expect(detail.value.steps.map((step) => `${step.position}:${step.text}:${step.done}`)).toEqual([
      "1:Prove ordering:true",
      "2:Define card tables:false",
      "3:Write application services:false",
    ]);
    expect(detail.value.comments).toHaveLength(1);
    expect(detail.value.watchers).toHaveLength(1);
  });

  it("manages evidence and quality review data through the application seam", async () => {
    const tenant = await adminCreateTenant("evidence-quality");
    const task = await createTask({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      title: "Attach evidence and approve quality",
      priority: "normal",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }

    const file = await addTaskEvidenceFile({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      objectRef: `tasks/${task.value.id}/trace.txt`,
      filename: "trace.txt",
      contentType: "text/plain",
      sizeBytes: 12,
      provenance: "Attached from upload",
    });
    const link = await addTaskEvidenceLink({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      url: "https://example.test/evidence",
      title: "Evidence link",
      provenance: "Attached from link",
    });
    expect(file).toMatchObject({ ok: true, value: { kind: "file" } });
    expect(link).toMatchObject({ ok: true, value: { kind: "link" } });

    const evidence = await listTaskEvidence({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      throw evidence.error;
    }
    expect(evidence.value.map((item) => item.kind).sort()).toEqual(["file", "link"]);

    const ensured = await ensureTaskQualityReview({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(ensured).toMatchObject({ ok: true, value: { status: "open" } });

    const addedCheck = await addQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      label: "Verify uploaded evidence",
      kind: "human",
      state: "pending",
    });
    expect(addedCheck.ok).toBe(true);
    if (!addedCheck.ok) {
      throw addedCheck.error;
    }
    const check = addedCheck.value.checks[0];
    if (check === undefined) {
      throw new Error("expected quality check");
    }

    const failed = await toggleQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      checkId: check.id,
      state: "fail",
    });
    expect(failed).toMatchObject({ ok: true, value: { status: "changes_requested" } });

    const passed = await toggleQualityCheck({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      checkId: check.id,
      state: "pass",
    });
    expect(passed).toMatchObject({ ok: true, value: { status: "open" } });

    const approved = await approveQualityReview({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
      expectedReviewId: addedCheck.value.id,
    });
    expect(approved).toMatchObject({
      ok: true,
      value: {
        status: "approved",
        approvedByUserId: tenant.userId,
        reviewers: [{ reviewerUserId: tenant.userId, state: "approved" }],
      },
    });

    const detail = await getCardDetail({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: actor(tenant.userId),
      taskId: task.value.id,
    });
    expect(detail).toMatchObject({
      ok: true,
      value: {
        evidence: expect.arrayContaining([
          expect.objectContaining({ filename: "trace.txt" }),
          expect.objectContaining({ filename: "Evidence link" }),
        ]),
        qualityReview: expect.objectContaining({ status: "approved" }),
      },
    });
  });

  it("proves tenant RLS hides and rejects cross-tenant task access as opzava_app", async () => {
    const tenantA = await adminCreateTenant("tenant-a");
    const tenantB = await adminCreateTenant("tenant-b");

    const created = await createTask({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantA.userId),
      title: "Tenant A task",
      priority: "normal",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw created.error;
    }

    const tenantBList = await listTasks({
      orgId: tenantB.organizationId,
      workspaceId: tenantB.workspaceId,
      actor: actor(tenantB.userId),
    });
    expect(tenantBList).toMatchObject({ ok: true, value: [] });

    const tenantBCrossWorkspaceList = await listTasks({
      orgId: tenantB.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantB.userId),
    });
    expect(tenantBCrossWorkspaceList).toMatchObject({ ok: true, value: [] });

    const rawTenantBRead = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.tasks
        where id = ${created.value.id}
      `),
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
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("proves card child-table RLS hides, rejects, and fails closed without tenant context", async () => {
    const tenantA = await adminCreateTenant("card-rls-a");
    const tenantB = await adminCreateTenant("card-rls-b");

    const task = await createTask({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantA.userId),
      title: "Tenant A card",
      priority: "normal",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }

    const step = await createStep({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantA.userId),
      taskId: task.value.id,
      text: "Tenant A only",
    });
    expect(step.ok).toBe(true);
    if (!step.ok) {
      throw step.error;
    }

    const tenantBRead = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.task_steps
        where id = ${step.value.id}
      `),
    );
    expect(rowsFromExecuteResult(tenantBRead)).toHaveLength(0);

    await expect(
      withTenant(tenantB.organizationId, async (tx) => {
        await tx.execute(sql`
          insert into public.task_steps (
            task_id,
            organization_id,
            workspace_id,
            text,
            position
          )
          values (
            ${task.value.id},
            ${tenantA.organizationId},
            ${tenantA.workspaceId},
            'Wrong tenant step',
            2
          )
        `);
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(selectStepsWithoutWithTenant(tenantA.organizationId)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("proves evidence and quality RLS hides, rejects, and fails closed", async () => {
    const tenantA = await adminCreateTenant("quality-rls-a");
    const tenantB = await adminCreateTenant("quality-rls-b");

    const task = await createTask({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantA.userId),
      title: "Tenant A evidence",
      priority: "normal",
    });
    expect(task.ok).toBe(true);
    if (!task.ok) {
      throw task.error;
    }

    const evidence = await addTaskEvidenceLink({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      actor: actor(tenantA.userId),
      taskId: task.value.id,
      url: "https://example.test/tenant-a",
      title: "Tenant A link",
    });
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      throw evidence.error;
    }

    const tenantBRead = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.task_evidence
        where id = ${evidence.value.id}
      `),
    );
    expect(rowsFromExecuteResult(tenantBRead)).toHaveLength(0);

    await expect(
      withTenant(tenantB.organizationId, async (tx) => {
        await tx.execute(sql`
          insert into public.task_evidence (
            task_id,
            organization_id,
            workspace_id,
            kind,
            url,
            filename,
            provenance
          )
          values (
            ${task.value.id},
            ${tenantA.organizationId},
            ${tenantA.workspaceId},
            'link',
            'https://example.test/wrong-tenant',
            'Wrong tenant',
            'Attached from link'
          )
        `);
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      (async () => {
        try {
          await db.execute(sql`
            insert into public.task_quality_review (
              task_id,
              organization_id,
              workspace_id,
              status
            )
            values (
              ${task.value.id},
              ${tenantA.organizationId},
              ${tenantA.workspaceId},
              'open'
            )
          `);
        } catch (error) {
          throw mapDatabaseError(error);
        }
      })(),
    ).rejects.toMatchObject({ status: 403 });
  });
});
