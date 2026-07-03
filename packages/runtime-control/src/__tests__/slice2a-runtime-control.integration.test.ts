import {
  assertCurrentTenant,
  createPostgresPool,
  db,
  pool,
  sql,
  withTenant
} from "@opzava/adapters";
import type { AuthorizationPort } from "@opzava/ports";
import { ok } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  appendAssistantDelta,
  appendUserTurn,
  createConversation,
  executeRuntimeControlTaskTool,
  finalizeAssistantTurn,
  recordToolOutcome,
  type ToolExecutionContext,
  startAssistantTurn,
  toolExecutionContextFromSessionPrincipal
} from "../application/index.js";

interface TenantFixture {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

const testRunId = randomUUID();
const testSlugPrefix = `slice2a-${testRunId}-`;
const testEmailSuffix = `-${testRunId}@example.test`;
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];
let tenantSequence = 0;

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for Runtime-Control tests.");
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
  const sequence = tenantSequence;
  tenantSequence += 1;

  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const slug = `${testSlugPrefix}${label}-${sequence}`;
  const userEmail = `${label}-${sequence}${testEmailSuffix}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `Slice 2a ${label}`]
  );
  await adminPool.query(
    `insert into public.workspaces (id, organization_id, slug, name)
     values ($1, $2, $3, $4)`,
    [workspaceId, organizationId, "admin", "Admin"]
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [userId, `Member ${label}`, userEmail]
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

function context(tenant: TenantFixture) {
  return {
    orgId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    actor: {
      userId: tenant.userId,
      roleKeys: ["member"]
    }
  };
}

async function assistantToolContext(
  tenant: TenantFixture,
  label: string
): Promise<ToolExecutionContext> {
  const appContext = context(tenant);
  const conversation = await createConversation({
    ...appContext,
    surface: "tasks.ask_admin",
    assistantKey: "ask-admin-opzava"
  });
  expect(conversation.ok).toBe(true);
  if (!conversation.ok) {
    throw conversation.error;
  }

  const assistantTurn = await startAssistantTurn({
    ...appContext,
    conversationId: conversation.value.id,
    idempotencyKey: `assistant-${label}`,
    assistantKey: "ask-admin-opzava"
  });
  expect(assistantTurn.ok).toBe(true);
  if (!assistantTurn.ok) {
    throw assistantTurn.error;
  }

  const toolContext = toolExecutionContextFromSessionPrincipal({
    principal: {
      ...appContext,
      sessionId: `session-${label}`
    },
    conversationId: conversation.value.id,
    assistantTurnId: assistantTurn.value.id,
    commandIdempotencyKey: `command-${label}`
  });
  expect(toolContext.ok).toBe(true);
  if (!toolContext.ok) {
    throw toolContext.error;
  }

  return toolContext.value;
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
  }
};

async function cleanupCreatedRows(): Promise<void> {
  const organizationResult = await adminPool.query<{ id: string }>(
    `select id::text as id
     from public.organizations
     where slug like $1
        or id = any($2::uuid[])`,
    [`${testSlugPrefix}%`, createdOrganizationIds]
  );
  const userResult = await adminPool.query<{ id: string }>(
    `select id
     from public.auth_users
     where email like $1
        or id = any($2::text[])`,
    [`%${testEmailSuffix}`, createdUserIds]
  );

  const organizationIds = [
    ...new Set([...createdOrganizationIds, ...organizationResult.rows.map((row) => row.id)])
  ];
  const userIds = [...new Set([...createdUserIds, ...userResult.rows.map((row) => row.id)])];

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.tasks where organization_id = any($1::uuid[])",
      [organizationIds]
    );
    await adminPool.query(
      "delete from public.assistant_tool_outcomes where organization_id = any($1::uuid[])",
      [organizationIds]
    );
    await adminPool.query(
      "delete from public.assistant_turns where organization_id = any($1::uuid[])",
      [organizationIds]
    );
    await adminPool.query(
      "delete from public.assistant_conversations where organization_id = any($1::uuid[])",
      [organizationIds]
    );
    await adminPool.query(
      "delete from public.role_grants where organization_id = any($1::uuid[])",
      [organizationIds]
    );
    await adminPool.query(
      "delete from public.memberships where organization_id = any($1::uuid[])",
      [organizationIds]
    );
    await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [
      organizationIds
    ]);
    await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [
      organizationIds
    ]);
  }

  if (userIds.length > 0) {
    await adminPool.query("delete from public.auth_sessions where user_id = any($1::text[])", [
      userIds
    ]);
    await adminPool.query("delete from public.auth_accounts where user_id = any($1::text[])", [
      userIds
    ]);
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [userIds]);
  }

  createdOrganizationIds.length = 0;
  createdUserIds.length = 0;
}

async function selectConversationsWithoutWithTenant(
  expectedOrgId: string
): Promise<ReadonlyArray<Record<string, unknown>>> {
  await assertCurrentTenant(db, expectedOrgId);
  const result = await db.execute(sql`select id from public.assistant_conversations`);
  return rowsFromExecuteResult(result);
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
      `Runtime-Control integration test must run as non-owner opzava_app; got ${JSON.stringify(
        row
      )}`
    );
  }
});

afterEach(async () => {
  await cleanupCreatedRows();
});

afterAll(async () => {
  await cleanupCreatedRows();
  await pool.end();
  await adminPool.end();
});

describe("slice 2a Runtime-Control", () => {
  it("creates conversations and makes turn idempotency conflicts explicit", async () => {
    const tenant = await adminCreateTenant("turns");
    const appContext = context(tenant);

    const conversation = await createConversation({
      ...appContext,
      surface: "tasks.ask_admin",
      assistantKey: "ask-admin-opzava"
    });
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) {
      throw conversation.error;
    }

    const userTurn = await appendUserTurn({
      ...appContext,
      conversationId: conversation.value.id,
      idempotencyKey: "user-turn-1",
      content: { text: "Add a Slice 2 hardening task." }
    });
    expect(userTurn).toMatchObject({
      ok: true,
      value: { role: "user", status: "final" }
    });

    const duplicateUserTurn = await appendUserTurn({
      ...appContext,
      conversationId: conversation.value.id,
      idempotencyKey: "user-turn-1",
      content: { text: "Add a Slice 2 hardening task." }
    });
    expect(duplicateUserTurn).toMatchObject({
      ok: true,
      value: { id: userTurn.ok ? userTurn.value.id : "" }
    });

    const conflictingUserTurn = await appendUserTurn({
      ...appContext,
      conversationId: conversation.value.id,
      idempotencyKey: "user-turn-1",
      content: { text: "Different text under the same key." }
    });
    expect(conflictingUserTurn).toMatchObject({
      ok: false,
      error: { code: "runtimeControl.idempotencyConflict" }
    });

    const assistantTurn = await startAssistantTurn({
      ...appContext,
      conversationId: conversation.value.id,
      idempotencyKey: "assistant-turn-1",
      assistantKey: "ask-admin-opzava"
    });
    expect(assistantTurn).toMatchObject({
      ok: true,
      value: { role: "assistant", status: "queued" }
    });
    if (!assistantTurn.ok) {
      throw assistantTurn.error;
    }

    const streamed = await appendAssistantDelta({
      ...appContext,
      turnId: assistantTurn.value.id,
      deltaText: "Created "
    });
    expect(streamed).toMatchObject({
      ok: true,
      value: { status: "streaming", content: { text: "Created " } }
    });

    const finalized = await finalizeAssistantTurn({
      ...appContext,
      turnId: assistantTurn.value.id,
      content: { text: "Created the task." }
    });
    expect(finalized).toMatchObject({
      ok: true,
      value: { status: "final", content: { text: "Created the task." } }
    });

    const duplicateFinalize = await finalizeAssistantTurn({
      ...appContext,
      turnId: assistantTurn.value.id,
      content: { text: "A duplicate finalize should be a no-op." }
    });
    expect(duplicateFinalize).toMatchObject({
      ok: true,
      value: { id: assistantTurn.value.id, status: "final", content: { text: "Created the task." } }
    });
  });

  it("records tool outcomes receipt-first and replays duplicate tool calls", async () => {
    const tenant = await adminCreateTenant("tools");
    const appContext = context(tenant);
    const conversation = await createConversation({
      ...appContext,
      surface: "tasks.ask_admin",
      assistantKey: "ask-admin-opzava"
    });
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) {
      throw conversation.error;
    }

    const assistantTurn = await startAssistantTurn({
      ...appContext,
      conversationId: conversation.value.id,
      idempotencyKey: "assistant-tool-turn",
      assistantKey: "ask-admin-opzava"
    });
    expect(assistantTurn.ok).toBe(true);
    if (!assistantTurn.ok) {
      throw assistantTurn.error;
    }

    const receipt = await recordToolOutcome({
      ...appContext,
      turnId: assistantTurn.value.id,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-1",
      idempotencyKey: "tool-idem-1",
      status: "started",
      requestSummary: { title: "Add task" },
      targetRef: "task:new"
    });
    expect(receipt).toMatchObject({
      ok: true,
      value: { status: "started", toolCallId: "tool-call-1" }
    });

    const completed = await recordToolOutcome({
      ...appContext,
      turnId: assistantTurn.value.id,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-1",
      idempotencyKey: "tool-idem-1",
      status: "succeeded",
      requestSummary: { title: "Add task" },
      resultSummary: { taskId: "task_123" },
      targetRef: "task:new"
    });
    expect(completed).toMatchObject({
      ok: true,
      value: { status: "succeeded", resultSummary: { taskId: "task_123" } }
    });

    const replay = await recordToolOutcome({
      ...appContext,
      turnId: assistantTurn.value.id,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-1",
      idempotencyKey: "tool-idem-1",
      status: "succeeded",
      requestSummary: { title: "Add task" },
      resultSummary: { taskId: "task_123" },
      targetRef: "task:new"
    });
    expect(replay).toMatchObject({
      ok: true,
      value: { id: completed.ok ? completed.value.id : "", status: "succeeded" }
    });

    const conflictingReplay = await recordToolOutcome({
      ...appContext,
      turnId: assistantTurn.value.id,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-1",
      idempotencyKey: "tool-idem-1",
      status: "started",
      requestSummary: { title: "Different task" },
      targetRef: "task:new"
    });
    expect(conflictingReplay).toMatchObject({
      ok: false,
      error: { code: "runtimeControl.toolOutcomeConflict" }
    });

    const missingReceipt = await recordToolOutcome({
      ...appContext,
      turnId: assistantTurn.value.id,
      toolName: "opzava_tasks_update",
      toolCallId: "tool-call-missing",
      idempotencyKey: "tool-idem-missing",
      status: "succeeded",
      requestSummary: { taskId: "task_123" },
      resultSummary: { taskId: "task_123" }
    });
    expect(missingReceipt).toMatchObject({
      ok: false,
      error: { code: "runtimeControl.toolOutcomeReceiptMissing" }
    });

    const userTurn = await appendUserTurn({
      ...appContext,
      conversationId: conversation.value.id,
      idempotencyKey: "user-tool-turn",
      content: { text: "A user turn cannot own tool receipts." }
    });
    expect(userTurn.ok).toBe(true);
    if (!userTurn.ok) {
      throw userTurn.error;
    }

    const boundToUserTurn = await recordToolOutcome({
      ...appContext,
      turnId: userTurn.value.id,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-user-turn",
      idempotencyKey: "tool-idem-user-turn",
      status: "started",
      requestSummary: { title: "Invalid owner" }
    });
    expect(boundToUserTurn).toMatchObject({
      ok: false,
      error: { code: "runtimeControl.invalidToolOutcomeTurn" }
    });
  });

  it("executes task tools through Project Management services with outcome-first idempotency", async () => {
    const tenant = await adminCreateTenant("task-tools");
    const toolContext = await assistantToolContext(tenant, "task-tools");

    const created = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-create",
      args: {
        title: "Create through Runtime-Control tool",
        description: "Write through the Project Management service.",
        status: "todo",
        priority: "high",
        labels: ["Ask Admin"]
      }
    });
    expect(created).toMatchObject({
      ok: true,
      value: {
        status: "succeeded",
        output: {
          kind: "tasks.create",
          task: {
            title: "Create through Runtime-Control tool",
            status: "todo",
            priority: "high",
            labels: ["ask admin"]
          }
        }
      }
    });
    if (
      !created.ok ||
      created.value.status !== "succeeded" ||
      created.value.output.kind !== "tasks.create"
    ) {
      throw new Error("Task tool create must succeed for replay assertions.");
    }
    const createdTask = created.value.output.task;

    const replay = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-create",
      args: {
        title: "Create through Runtime-Control tool",
        description: "Write through the Project Management service.",
        status: "todo",
        priority: "high",
        labels: ["Ask Admin"]
      }
    });
    expect(replay).toMatchObject({
      ok: true,
      value: {
        status: "succeeded",
        output: {
          kind: "tasks.create",
          task: { id: createdTask.id }
        }
      }
    });

    const conflictingReplay = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-create",
      args: {
        title: "Different title under the same tool call id"
      }
    });
    expect(conflictingReplay).toMatchObject({
      ok: false,
      error: { code: "runtimeControl.toolOutcomeConflict" }
    });

    const listed = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_list",
      toolCallId: "tool-call-list",
      args: { status: "todo", limit: 10 }
    });
    expect(listed).toMatchObject({
      ok: true,
      value: {
        status: "succeeded",
        output: {
          kind: "tasks.list",
          tasks: [{ id: createdTask.id }]
        }
      }
    });

    const updated = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_update",
      toolCallId: "tool-call-update",
      args: {
        taskId: createdTask.id,
        title: "Updated through Runtime-Control tool",
        status: "done",
        priority: "urgent",
        labels: ["Done"]
      }
    });
    expect(updated).toMatchObject({
      ok: true,
      value: {
        status: "succeeded",
        output: {
          kind: "tasks.update",
          task: {
            id: createdTask.id,
            title: "Updated through Runtime-Control tool",
            status: "done",
            priority: "urgent",
            labels: ["done"]
          }
        }
      }
    });

    const afterReplayList = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_list",
      toolCallId: "tool-call-list-after-update",
      args: { limit: 10 }
    });
    expect(afterReplayList).toMatchObject({
      ok: true,
      value: {
        output: {
          tasks: [{ id: createdTask.id }]
        }
      }
    });
    if (
      !afterReplayList.ok ||
      afterReplayList.value.status !== "succeeded" ||
      afterReplayList.value.output.kind !== "tasks.list"
    ) {
      throw new Error("Task tool list must succeed for count assertions.");
    }
    expect(
      afterReplayList.value.output.tasks.filter((task) => task.id === createdTask.id)
    ).toHaveLength(1);
  });

  it("fails task tool execution closed for malformed args, authz denial, and row absence", async () => {
    const tenant = await adminCreateTenant("task-tool-failures");
    const toolContext = await assistantToolContext(tenant, "task-tool-failures");

    const malformed = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_create",
      toolCallId: "tool-call-malformed",
      args: { description: "title is required" }
    });
    expect(malformed).toMatchObject({
      ok: true,
      value: {
        status: "failed",
        code: "malformed_args"
      }
    });

    const denied = await executeRuntimeControlTaskTool(
      {
        context: toolContext,
        toolName: "opzava_tasks_create",
        toolCallId: "tool-call-denied",
        args: { title: "Denied task" }
      },
      { taskAuthorizationPort: denyingAuthorizationPort }
    );
    expect(denied).toMatchObject({
      ok: true,
      value: {
        status: "failed",
        code: "forbidden"
      }
    });

    const malformedId = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_update",
      toolCallId: "tool-call-malformed-id",
      args: {
        taskId: "missing-task",
        title: "Still missing"
      }
    });
    expect(malformedId).toMatchObject({
      ok: true,
      value: {
        status: "failed",
        code: "malformed_args"
      }
    });

    const missing = await executeRuntimeControlTaskTool({
      context: toolContext,
      toolName: "opzava_tasks_update",
      toolCallId: "tool-call-missing",
      args: {
        taskId: randomUUID(),
        title: "Still missing"
      }
    });
    expect(missing).toMatchObject({
      ok: true,
      value: {
        status: "failed",
        code: "not_found"
      }
    });
  });

  it("constructs tool execution context only from a session-derived principal", async () => {
    const tenant = await adminCreateTenant("context");
    const principal = {
      ...context(tenant),
      sessionId: "session_123"
    };

    const toolContext = toolExecutionContextFromSessionPrincipal({
      principal,
      conversationId: "conversation_123",
      assistantTurnId: "turn_123",
      commandIdempotencyKey: "command_123"
    });

    expect(toolContext).toMatchObject({
      ok: true,
      value: {
        orgId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        sessionId: "session_123",
        conversationId: "conversation_123",
        assistantTurnId: "turn_123",
        commandIdempotencyKey: "command_123"
      }
    });
  });

  it("proves Runtime-Control RLS hides and rejects cross-tenant access", async () => {
    const tenantA = await adminCreateTenant("tenant-a");
    const tenantB = await adminCreateTenant("tenant-b");
    const conversation = await createConversation({
      ...context(tenantA),
      surface: "tasks.ask_admin",
      assistantKey: "ask-admin-opzava"
    });
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) {
      throw conversation.error;
    }

    const tenantBRead = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.assistant_conversations
        where id = ${conversation.value.id}
      `)
    );
    expect(rowsFromExecuteResult(tenantBRead)).toHaveLength(0);

    await expect(
      withTenant(tenantB.organizationId, async (tx) => {
        await tx.execute(sql`
          insert into public.assistant_conversations (
            organization_id,
            workspace_id,
            surface,
            assistant_key,
            status,
            created_by_user_id
          )
          values (
            ${tenantA.organizationId},
            ${tenantA.workspaceId},
            'tasks.ask_admin',
            'ask-admin-opzava',
            'open',
            ${tenantA.userId}
          )
        `);
      })
    ).rejects.toMatchObject({ status: 403 });

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
            'Cross-tenant task probe',
            '',
            'todo',
            'normal',
            '{}'::text[],
            1
          )
        `);
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      selectConversationsWithoutWithTenant(tenantA.organizationId)
    ).rejects.toMatchObject({ status: 403 });
  });
});
