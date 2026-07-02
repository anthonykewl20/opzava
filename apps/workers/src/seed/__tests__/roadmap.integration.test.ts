import { createPostgresPool, db, pool, sql } from "@opzava/adapters";
import { listTasks } from "@opzava/project-management";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { roadmapTaskTitles, seedRoadmapTasks, type SeedRoadmapTasksReceipt } from "../roadmap.js";

const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());

let lastReceipt: SeedRoadmapTasksReceipt | undefined;
let cleanupFirstOwner = false;

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for roadmap seed tests.");
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

async function adminCountFirstOwnerSetups(): Promise<number> {
  const result = await adminPool.query(
    "select count(*)::int as count from public.first_owner_setup",
  );
  return Number(result.rows[0]?.["count"] ?? 0);
}

async function cleanupCreatedRows(receipt: SeedRoadmapTasksReceipt): Promise<void> {
  if (!cleanupFirstOwner) {
    await adminPool.query(
      "delete from public.tasks where organization_id = $1 and title = any($2::text[])",
      [receipt.organizationId, receipt.createdTitles],
    );
    return;
  }

  await adminPool.query("delete from public.tasks where organization_id = $1", [
    receipt.organizationId,
  ]);
  await adminPool.query("delete from public.auth_sessions where user_id = $1", [
    receipt.ownerUserId,
  ]);
  await adminPool.query("delete from public.auth_accounts where user_id = $1", [
    receipt.ownerUserId,
  ]);
  await adminPool.query("delete from public.first_owner_setup where organization_id = $1", [
    receipt.organizationId,
  ]);
  await adminPool.query("delete from public.role_grants where organization_id = $1", [
    receipt.organizationId,
  ]);
  await adminPool.query("delete from public.memberships where organization_id = $1", [
    receipt.organizationId,
  ]);
  await adminPool.query("delete from public.workspaces where organization_id = $1", [
    receipt.organizationId,
  ]);
  await adminPool.query("delete from public.organizations where id = $1", [receipt.organizationId]);
  await adminPool.query("delete from public.auth_users where id = $1", [receipt.ownerUserId]);
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
      `Roadmap seed integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
    );
  }
});

afterEach(async () => {
  if (lastReceipt !== undefined) {
    await cleanupCreatedRows(lastReceipt);
  }

  lastReceipt = undefined;
  cleanupFirstOwner = false;
});

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});

describe("roadmap task seed", () => {
  it("creates the remaining roadmap once and skips it on the second run", async () => {
    cleanupFirstOwner = (await adminCountFirstOwnerSetups()) === 0;

    // Self-heal: an aborted earlier run can leave canonical roadmap tasks
    // behind (its cleanup only removes titles from its own receipt), which
    // would break the fresh-run assertions below.
    const existingSetup = await adminPool.query(
      "select organization_id from public.first_owner_setup limit 1",
    );
    const existingOrgId = (existingSetup.rows[0] as { organization_id?: string } | undefined)
      ?.organization_id;
    if (existingOrgId !== undefined) {
      await adminPool.query(
        "delete from public.tasks where organization_id = $1 and title = any($2::text[])",
        [existingOrgId, [...roadmapTaskTitles]],
      );
    }

    const first = await seedRoadmapTasks({ logger: null });
    lastReceipt = first;

    expect(first.roadmapTitles).toEqual([
      "Slice 2 - Ask Admin Opzava on Tasks",
      "Slice 3 - CRM core (thin)",
      "Slice 4 - Marketing content pipeline (thin)",
      "P1 - AI Workforce",
      "P2 - Realtime + PWA",
      "P3 - Knowledge",
      "P4 - CRM",
      "P5 - Dept-Workflows + Marketing",
      "P6 - Finance + Billing",
      "P7 - Notifications + Admin + Error Pipeline",
      "P8 - External Channels + Guest + Polish",
      "Real OpenClaw operator WS handshake",
      "Wildcard TLS issuance and DNS lifecycle",
      "Readiness and reconnect hardening",
      "Gateway reaper leases and fencing",
      "Lazy-start and idle-stop cost model",
      "Secrets lifecycle for Gateway credentials",
      "Dokploy Compose deployer mapping",
    ]);
    expect(first.totalCount).toBe(18);
    expect(first.createdCount).toBe(first.totalCount);
    expect(first.skippedCount).toBe(0);

    const second = await seedRoadmapTasks({ logger: null });
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.workspaceId).toBe(first.workspaceId);
    expect(second.ownerUserId).toBe(first.ownerUserId);
    expect(second.totalCount).toBe(first.totalCount);
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(first.totalCount);

    const listed = await listTasks({
      orgId: first.organizationId,
      workspaceId: first.workspaceId,
      actor: {
        userId: first.ownerUserId,
        roleKeys: first.ownerRoleKeys,
      },
    });

    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      throw listed.error;
    }

    const roadmapTasks = listed.value.filter(
      (task) => task.labels.includes("roadmap") && first.roadmapTitles.includes(task.title),
    );

    expect(roadmapTasks).toHaveLength(first.totalCount);
    expect(roadmapTasks.map((task) => task.title).sort()).toEqual([...first.roadmapTitles].sort());
  });
});
