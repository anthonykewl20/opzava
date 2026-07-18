import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPostgresPool, db, pool, sql, withTenant } from "@opzava/adapters";
import { issueLinkToken, revokeLinkToken } from "@opzava/identity-access";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createOpzavaMcpServer, type OpzavaMcpRuntime } from "../server.js";

interface TenantFixture {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionId: string;
}

interface ConnectedMcp {
  readonly client: Client;
  readonly runtime: OpzavaMcpRuntime;
  close(): Promise<void>;
}

const testRunId = randomUUID();
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for MCP server integration tests.");
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
  const sessionId = `mcp-session-${testRunId}-${label}`;
  const sessionToken = `mcp-token-${testRunId}-${label}`;
  const slug = `mcp-${testRunId}-${label}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `MCP ${label}`],
  );
  await adminPool.query(
    `insert into public.workspaces (id, organization_id, slug, name)
     values ($1, $2, $3, $4)`,
    [workspaceId, organizationId, "admin", "Admin"],
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [userId, `MCP User ${label}`, `${label}-${testRunId}@example.test`],
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
  await adminPool.query(
    `insert into public.auth_sessions (
      id,
      user_id,
      token,
      expires_at,
      active_organization_id,
      membership_version
    )
    values ($1, $2, $3, now() + interval '1 hour', $4, 1)`,
    [sessionId, userId, sessionToken, organizationId],
  );

  createdOrganizationIds.push(organizationId);
  createdUserIds.push(userId);
  createdSessionIds.push(sessionId);
  return { organizationId, workspaceId, userId, sessionId };
}

async function issueToken(tenant: TenantFixture, scopes: readonly string[]): Promise<string> {
  const issued = await issueLinkToken({
    orgId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    userId: tenant.userId,
    sessionId: tenant.sessionId,
    scopes,
    ttlSeconds: 300,
  });
  if (!issued.ok) {
    throw issued.error;
  }

  return issued.value.token;
}

async function connectMcp(linkToken: string): Promise<ConnectedMcp> {
  const runtime = await createOpzavaMcpServer({ linkToken });
  const client = new Client({ name: "opzava-mcp-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([runtime.server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    runtime,
    async close() {
      await client.close();
      await runtime.server.close();
    },
  };
}

function parseToolPayload(
  result: Awaited<ReturnType<Client["callTool"]>>,
): Record<string, unknown> {
  return JSON.parse(toolText(result)) as Record<string, unknown>;
}

function toolText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = "content" in result && Array.isArray(result.content) ? result.content : [];
  const first = content[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("type" in first) ||
    first.type !== "text" ||
    !("text" in first) ||
    typeof first.text !== "string"
  ) {
    throw new Error("Expected a text tool result.");
  }

  return first.text;
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];
  const sessionIds = [...createdSessionIds];

  if (organizationIds.length > 0) {
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
      "delete from public.link_tokens where organization_id = any($1::uuid[])",
      [organizationIds],
    );
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

  if (sessionIds.length > 0) {
    await adminPool.query("delete from public.auth_sessions where id = any($1::text[])", [
      sessionIds,
    ]);
  }

  if (userIds.length > 0) {
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [userIds]);
  }

  createdOrganizationIds.length = 0;
  createdUserIds.length = 0;
  createdSessionIds.length = 0;
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
      `MCP server integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
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

describe("slice 2.5b Opzava MCP server", () => {
  it("exposes only read tools for a tasks:read token", async () => {
    const tenant = await adminCreateTenant("read-only");
    const token = await issueToken(tenant, ["tasks:read"]);
    const connection = await connectMcp(token);

    try {
      const tools = await connection.client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "opzava_tasks_get",
        "opzava_tasks_list",
      ]);
      expect(tools.tools[0]?.description).toContain("opzava-task-authoring");

      const denied = await connection.client.callTool({
        name: "opzava_tasks_create",
        arguments: { title: "This must not create" },
      });
      expect(denied).toMatchObject({ isError: true });
      expect(toolText(denied)).toMatch(/not found|Tool/);
    } finally {
      await connection.close();
    }
  });

  it("routes a create tool call through project-management under the token principal", async () => {
    const tenant = await adminCreateTenant("create");
    const token = await issueToken(tenant, ["tasks:read", "tasks:write"]);
    const connection = await connectMcp(token);

    try {
      const result = await connection.client.callTool({
        name: "opzava_tasks_create",
        arguments: {
          title: "Create card through MCP",
          description: "This card proves local Claude Code writes through Opzava authority.",
          priority: "high",
          labels: ["mcp"],
          idempotencyKey: "mcp:create:card",
        },
      });
      const payload = parseToolPayload(result);

      expect(payload).toMatchObject({
        ok: true,
        viaClient: "claude-code",
        result: {
          task: {
            organizationId: tenant.organizationId,
            workspaceId: tenant.workspaceId,
            title: "Create card through MCP",
            priority: "high",
            labels: ["mcp"],
            provenanceSource: "claude-code",
          },
        },
      });

      const taskId = (payload["result"] as { task: { id: string } }).task.id;
      const retried = await connection.client.callTool({
        name: "opzava_tasks_create",
        arguments: {
          title: "Create card through MCP retry",
          priority: "normal",
          idempotencyKey: "mcp:create:card",
        },
      });
      const retriedPayload = parseToolPayload(retried);
      expect((retriedPayload["result"] as { task: { id: string } }).task.id).toBe(taskId);

      const rows = await withTenant(tenant.organizationId, async (tx) =>
        tx.execute(sql`
          select id, title
          from public.tasks
          where id = ${taskId}
            and workspace_id = ${tenant.workspaceId}
        `),
      );
      expect(rowsFromExecuteResult(rows)).toEqual([
        { id: taskId, title: "Create card through MCP" },
      ]);

      const firstStep = parseToolPayload(
        await connection.client.callTool({
          name: "opzava_tasks_steps_create",
          arguments: {
            taskId,
            text: "Add an idempotent MCP step",
            idempotencyKey: "mcp:create:step",
          },
        }),
      );
      const retriedStep = parseToolPayload(
        await connection.client.callTool({
          name: "opzava_tasks_steps_create",
          arguments: {
            taskId,
            text: "Duplicate MCP step retry",
            idempotencyKey: "mcp:create:step",
          },
        }),
      );
      expect((retriedStep["result"] as { step: { id: string } }).step.id).toBe(
        (firstStep["result"] as { step: { id: string } }).step.id,
      );

      const firstComment = parseToolPayload(
        await connection.client.callTool({
          name: "opzava_tasks_comments_add",
          arguments: {
            taskId,
            body: "Add an idempotent MCP comment.",
            idempotencyKey: "mcp:create:comment",
          },
        }),
      );
      const retriedComment = parseToolPayload(
        await connection.client.callTool({
          name: "opzava_tasks_comments_add",
          arguments: {
            taskId,
            body: "Duplicate MCP comment retry.",
            idempotencyKey: "mcp:create:comment",
          },
        }),
      );
      expect((retriedComment["result"] as { comment: { id: string } }).comment.id).toBe(
        (firstComment["result"] as { comment: { id: string } }).comment.id,
      );

      const firstQuality = parseToolPayload(
        await connection.client.callTool({
          name: "opzava_tasks_quality_checks_add",
          arguments: {
            taskId,
            label: "Add an idempotent MCP quality check",
            idempotencyKey: "mcp:create:quality",
          },
        }),
      );
      const retriedQuality = parseToolPayload(
        await connection.client.callTool({
          name: "opzava_tasks_quality_checks_add",
          arguments: {
            taskId,
            label: "Duplicate MCP quality retry",
            idempotencyKey: "mcp:create:quality",
          },
        }),
      );
      expect(
        (retriedQuality["result"] as { qualityReview: { checks: { id: string }[] } })
          .qualityReview.checks[0]?.id,
      ).toBe(
        (firstQuality["result"] as { qualityReview: { checks: { id: string }[] } })
          .qualityReview.checks[0]?.id,
      );
    } finally {
      await connection.close();
    }
  });

  it("rejects Done through MCP create and update without mutating task state", async () => {
    const tenant = await adminCreateTenant("done-rejected");
    const token = await issueToken(tenant, ["tasks:read", "tasks:write"]);
    const connection = await connectMcp(token);

    try {
      const created = await connection.client.callTool({
        name: "opzava_tasks_create",
        arguments: { title: "Existing MCP task", status: "todo" },
      });
      const createdPayload = parseToolPayload(created);
      const taskId = (createdPayload["result"] as { task: { id: string } }).task.id;

      const rejectedCreate = await connection.client.callTool({
        name: "opzava_tasks_create",
        arguments: { title: "MCP must not create Done", status: "done" },
      });
      expect(rejectedCreate).toMatchObject({ isError: true });

      const rejectedUpdate = await connection.client.callTool({
        name: "opzava_tasks_update",
        arguments: { taskId, status: "done" },
      });
      expect(rejectedUpdate).toMatchObject({ isError: true });

      const rows = await withTenant(tenant.organizationId, async (tx) =>
        tx.execute(sql`
          select id, title, status
          from public.tasks
          where workspace_id = ${tenant.workspaceId}
          order by title asc
        `),
      );
      expect(rowsFromExecuteResult(rows)).toEqual([
        { id: taskId, title: "Existing MCP task", status: "todo" },
      ]);
    } finally {
      await connection.close();
    }
  });

  it("rejects a revoked token before serving stdio tools", async () => {
    const tenant = await adminCreateTenant("revoked");
    const token = await issueToken(tenant, ["tasks:read"]);
    const listed = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.link_tokens
        where user_id = ${tenant.userId}
        order by created_at desc
        limit 1
      `),
    );
    const tokenId = String(rowsFromExecuteResult(listed)[0]?.["id"]);

    const revoked = await revokeLinkToken({
      orgId: tenant.organizationId,
      userId: tenant.userId,
      tokenId,
    });
    expect(revoked.ok).toBe(true);

    await expect(createOpzavaMcpServer({ linkToken: token })).rejects.toMatchObject({
      code: "identityAccess.linkTokenRevoked",
    });
  });
});
