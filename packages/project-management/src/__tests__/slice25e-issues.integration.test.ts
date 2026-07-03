import {
  createPostgresPool,
  db,
  pool,
  sql,
  withTenant,
} from "@opzava/adapters";
import type { IssueTrackerPort } from "@opzava/ports";
import { DomainError, err, ok } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createTrackedIssue,
  enqueueIssueCloseForTask,
  listIssueProjections,
  processIssueCloseOutbox,
} from "../application/issues.js";
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

function fakeIssueTracker(input: {
  readonly closedNumbers: number[];
  readonly fail?: boolean;
  readonly delayMs?: number;
}): IssueTrackerPort {
  return {
    listIssues: async () => ok([]),
    getIssue: async () =>
      err(new DomainError({ code: "fake.notFound", message: "not found" })),
    createIssue: async () =>
      err(new DomainError({ code: "fake.createUnsupported", message: "not used" })),
    closeIssue: async (request) => {
      input.closedNumbers.push(request.ref.number);
      if (input.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, input.delayMs));
      }
      if (input.fail === true) {
        return err(new DomainError({ code: "fake.rateLimited", message: "retry later" }));
      }

      return ok({
        ref: request.ref,
        title: `Issue ${request.ref.number}`,
        state: "closed",
        labels: [],
        assignee: null,
        updatedAt: new Date().toISOString(),
      });
    },
  };
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

async function adminInsertTask(input: {
  readonly tenant: TenantFixture;
  readonly taskId: string;
  readonly cardNumber: number;
  readonly issueNumber: number;
}): Promise<void> {
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
    values ($1, $2, $3, $4, $5, '', 'done', 'normal', '{}'::text[], $6, 'github', $7)`,
    [
      input.taskId,
      input.tenant.organizationId,
      input.tenant.workspaceId,
      input.cardNumber,
      `Linked issue ${input.issueNumber}`,
      input.cardNumber,
      `github:anthonykewl20/opzava#${input.issueNumber}`,
    ],
  );
}

async function adminInsertCloseOutbox(input: {
  readonly tenant: TenantFixture;
  readonly taskId: string;
  readonly issueNumber: number;
  readonly state?: "pending" | "processing" | "failed";
  readonly attempts?: number;
  readonly claimedAt?: string | null;
}): Promise<void> {
  await adminPool.query(
    `insert into public.issue_close_outbox (
      organization_id,
      workspace_id,
      task_id,
      repository,
      issue_number,
      issue_url,
      dedupe_key,
      state,
      attempts,
      next_attempt_at,
      claimed_at
    )
    values ($1, $2, $3, 'anthonykewl20/opzava', $4, $5, $6, $7, $8, now(), $9)`,
    [
      input.tenant.organizationId,
      input.tenant.workspaceId,
      input.taskId,
      input.issueNumber,
      `https://github.com/anthonykewl20/opzava/issues/${input.issueNumber}`,
      `${input.tenant.organizationId}:${input.taskId}:${input.issueNumber}:close`,
      input.state ?? "pending",
      input.attempts ?? 0,
      input.claimedAt ?? null,
    ],
  );
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
      "delete from public.issue_create_intent where organization_id = any($1::uuid[])",
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

  it("deduplicates issue creation by workspace idempotency key", async () => {
    const tenant = await adminCreateTenant("create-idempotent");
    let createCalls = 0;
    const tracker: IssueTrackerPort = {
      listIssues: async () => ok([]),
      getIssue: async () =>
        err(new DomainError({ code: "fake.notFound", message: "not found" })),
      createIssue: async () => {
        createCalls += 1;
        return ok({
          ref: {
            provider: "github",
            repository: "anthonykewl20/opzava",
            number: 88,
            url: "https://github.com/anthonykewl20/opzava/issues/88",
          },
          title: "Idempotent issue",
          state: "open",
          labels: ["ready-for-agent"],
          assignee: null,
          updatedAt: "2026-07-03T00:00:00.000Z",
        });
      },
      closeIssue: async () =>
        err(new DomainError({ code: "fake.closeUnsupported", message: "not used" })),
    };
    const input = {
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: { userId: tenant.userId, roleKeys: ["admin"] },
      repository: "anthonykewl20/opzava",
      title: "Idempotent issue",
      labels: ["ready-for-agent"],
      idempotencyKey: "web.issue.create:test-key",
    } as const;

    const first = await createTrackedIssue(input, { issueTrackerPort: tracker });
    const second = await createTrackedIssue(input, { issueTrackerPort: tracker });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error("expected idempotent create success");
    }
    expect(createCalls).toBe(1);
    expect(second.value.number).toBe(first.value.number);
  });

  it("lists one issue projection row when multiple tasks link the same issue", async () => {
    const tenant = await adminCreateTenant("multi-link");
    const olderTaskId = randomUUID();
    const newerTaskId = randomUUID();
    await adminInsertTask({ tenant, taskId: olderTaskId, cardNumber: 7301, issueNumber: 89 });
    await adminInsertTask({ tenant, taskId: newerTaskId, cardNumber: 7302, issueNumber: 89 });
    await adminPool.query(
      `update public.tasks
       set updated_at = now() + interval '1 minute'
       where id = $1`,
      [newerTaskId],
    );
    await withTenant(tenant.organizationId, async (tx) =>
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
          ${tenant.organizationId},
          ${tenant.workspaceId},
          'anthonykewl20/opzava',
          89,
          'Multi-linked issue',
          'open',
          '{}'::text[],
          null,
          now(),
          now(),
          'https://github.com/anthonykewl20/opzava/issues/89'
        )
      `),
    );

    const listed = await listIssueProjections({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: { userId: tenant.userId, roleKeys: ["admin"] },
      repository: "anthonykewl20/opzava",
    });

    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      throw listed.error;
    }
    expect(listed.value.map((issue) => issue.number)).toEqual([89]);
    expect(listed.value[0]?.linkedTaskId).toBe(newerTaskId);
  });

  it("claims active-close rows with skip-locked concurrency semantics", async () => {
    const tenant = await adminCreateTenant("outbox-concurrent");
    const taskA = randomUUID();
    const taskB = randomUUID();
    await adminInsertTask({ tenant, taskId: taskA, cardNumber: 7101, issueNumber: 81 });
    await adminInsertTask({ tenant, taskId: taskB, cardNumber: 7102, issueNumber: 82 });
    await adminInsertCloseOutbox({ tenant, taskId: taskA, issueNumber: 81 });
    await adminInsertCloseOutbox({ tenant, taskId: taskB, issueNumber: 82 });

    const closedNumbers: number[] = [];
    const tracker = fakeIssueTracker({ closedNumbers, delayMs: 25 });
    const input = {
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      actor: { userId: tenant.userId, roleKeys: ["admin"] },
      repository: "anthonykewl20/opzava",
      limit: 1,
    } as const;

    const [first, second] = await Promise.all([
      processIssueCloseOutbox(input, { issueTrackerPort: tracker }),
      processIssueCloseOutbox(input, { issueTrackerPort: tracker }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(new Set(closedNumbers).size).toBe(2);
    expect(closedNumbers.sort()).toEqual([81, 82]);
  });

  it("reclaims stale processing rows for active-close", async () => {
    const tenant = await adminCreateTenant("outbox-stale");
    const taskId = randomUUID();
    await adminInsertTask({ tenant, taskId, cardNumber: 7201, issueNumber: 83 });
    await adminInsertCloseOutbox({
      tenant,
      taskId,
      issueNumber: 83,
      state: "processing",
      claimedAt: "2026-07-03T00:00:00.000Z",
    });

    const closedNumbers: number[] = [];
    const result = await processIssueCloseOutbox(
      {
        orgId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        actor: { userId: tenant.userId, roleKeys: ["admin"] },
        repository: "anthonykewl20/opzava",
        limit: 1,
        processingTimeoutMs: 1,
      },
      { issueTrackerPort: fakeIssueTracker({ closedNumbers }) },
    );

    expect(result.ok).toBe(true);
    expect(closedNumbers).toEqual([83]);
    if (!result.ok) {
      throw new Error("expected stale row reclaim");
    }
    expect(result.value[0]?.state).toBe("closed");
  });

  it("rejects stale active-close finalizers after a row is reclaimed", async () => {
    const tenant = await adminCreateTenant("outbox-claim-token");
    const taskId = randomUUID();
    await adminInsertTask({ tenant, taskId, cardNumber: 7251, issueNumber: 85 });
    await adminInsertCloseOutbox({ tenant, taskId, issueNumber: 85 });

    let workerAClaimToken: string | null = null;
    let workerBClaimToken: string | null = null;
    const tracker: IssueTrackerPort = {
      listIssues: async () => ok([]),
      getIssue: async () =>
        err(new DomainError({ code: "fake.notFound", message: "not found" })),
      createIssue: async () =>
        err(new DomainError({ code: "fake.createUnsupported", message: "not used" })),
      closeIssue: async () => {
        const claimed = await adminPool.query(
          `select claim_token
           from public.issue_close_outbox
           where task_id = $1`,
          [taskId],
        );
        workerAClaimToken = String(claimed.rows[0]?.["claim_token"] ?? "");

        const reclaimed = await adminPool.query(
          `update public.issue_close_outbox
           set state = 'closed',
               claim_token = gen_random_uuid(),
               claimed_at = now(),
               closed_at = now(),
               last_error = null,
               updated_at = now()
           where task_id = $1
           returning claim_token`,
          [taskId],
        );
        workerBClaimToken = String(reclaimed.rows[0]?.["claim_token"] ?? "");

        return err(new DomainError({ code: "fake.rateLimited", message: "stale worker failed" }));
      },
    };

    const result = await processIssueCloseOutbox(
      {
        orgId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        actor: { userId: tenant.userId, roleKeys: ["admin"] },
        repository: "anthonykewl20/opzava",
        limit: 1,
      },
      { issueTrackerPort: tracker },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected stale finalizer to be dropped");
    }
    expect(result.value).toEqual([]);
    expect(workerAClaimToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(workerBClaimToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(workerBClaimToken).not.toBe(workerAClaimToken);

    const row = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select state, last_error, claim_token::text as claim_token
        from public.issue_close_outbox
        where task_id = ${taskId}
      `),
    );
    expect(rowsFromExecuteResult(row)[0]).toMatchObject({
      state: "closed",
      last_error: null,
      claim_token: workerBClaimToken,
    });
  });

  it("dead-letters active-close rows that exceed max attempts", async () => {
    const tenant = await adminCreateTenant("outbox-dead");
    const taskId = randomUUID();
    await adminInsertTask({ tenant, taskId, cardNumber: 7301, issueNumber: 84 });
    await adminInsertCloseOutbox({
      tenant,
      taskId,
      issueNumber: 84,
      state: "failed",
      attempts: 8,
    });

    const closedNumbers: number[] = [];
    const result = await processIssueCloseOutbox(
      {
        orgId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        actor: { userId: tenant.userId, roleKeys: ["admin"] },
        repository: "anthonykewl20/opzava",
        maxAttempts: 8,
      },
      { issueTrackerPort: fakeIssueTracker({ closedNumbers }) },
    );

    expect(result.ok).toBe(true);
    expect(closedNumbers).toEqual([]);

    const row = await withTenant(tenant.organizationId, async (tx) =>
      tx.execute(sql`
        select state
        from public.issue_close_outbox
        where task_id = ${taskId}
      `),
    );
    expect(rowsFromExecuteResult(row)[0]?.["state"]).toBe("dead");
  });
});
