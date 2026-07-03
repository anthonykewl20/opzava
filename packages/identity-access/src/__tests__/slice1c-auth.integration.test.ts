import {
  createPostgresPool,
  db,
  mapDatabaseError,
  pool,
  withAuthenticatedIdentity,
} from "@opzava/adapters";
import { makeOrgId } from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { BetterAuthPortAdapter } from "../adapters/better-auth/auth-port-adapter.js";
import { withTenantForSession } from "../adapters/better-auth/session-principal.js";
import { FirstOwnerSetupService } from "../application/first-owner-setup.js";

const testRunId = randomUUID();
const ownerEmail = `owner-${testRunId}@example.test`;
const otherEmail = `other-${testRunId}@example.test`;
const secondSetupEmail = `second-owner-${testRunId}@example.test`;
const ownerPassword = "Correct-Horse-Battery-Staple-1";
const failedSetupIdempotencyKey = `${testRunId}-slice1c-fail`;
const createdSetupIdempotencyKey = `${testRunId}-slice1c-create`;
const secondSetupIdempotencyKey = `${testRunId}-slice1c-second`;
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());

const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for slice 1c auth integration tests.");
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

function slugifyForSetup(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug === "" ? fallback : slug;
}

function setupOrganizationSlug(organizationName: string, idempotencyKey: string): string {
  return `${slugifyForSetup(organizationName, "organization")}-${idempotencyKey.slice(0, 8)}`;
}

const setupEmails = [ownerEmail, secondSetupEmail];
const setupAttemptIds = [
  failedSetupIdempotencyKey,
  createdSetupIdempotencyKey,
  secondSetupIdempotencyKey,
];
const setupOrganizationSlugs = [
  setupOrganizationSlug("Opzava Internal", failedSetupIdempotencyKey),
  setupOrganizationSlug("Opzava Internal", createdSetupIdempotencyKey),
  setupOrganizationSlug("Second Org", secondSetupIdempotencyKey),
];

async function adminCount(table: string): Promise<number> {
  const allowedTables = new Set([
    "auth_users",
    "auth_accounts",
    "auth_sessions",
    "organizations",
    "workspaces",
    "memberships",
    "role_grants",
    "first_owner_setup",
  ]);

  if (!allowedTables.has(table)) {
    throw new Error(`Unexpected count table ${table}`);
  }

  const countQueries: Record<string, { readonly text: string; readonly values: unknown[] }> = {
    auth_users: {
      text: "select count(*)::int as count from public.auth_users where email = any($1::text[])",
      values: [setupEmails],
    },
    auth_accounts: {
      text: `select count(*)::int as count
             from public.auth_accounts a
             join public.auth_users u on u.id = a.user_id
             where u.email = any($1::text[])`,
      values: [setupEmails],
    },
    auth_sessions: {
      text: `select count(*)::int as count
             from public.auth_sessions s
             join public.auth_users u on u.id = s.user_id
             where u.email = any($1::text[])`,
      values: [setupEmails],
    },
    organizations: {
      text: "select count(*)::int as count from public.organizations where slug = any($1::text[])",
      values: [setupOrganizationSlugs],
    },
    workspaces: {
      text: `select count(*)::int as count
             from public.workspaces w
             join public.organizations o on o.id = w.organization_id
             where o.slug = any($1::text[])`,
      values: [setupOrganizationSlugs],
    },
    memberships: {
      text: `select count(*)::int as count
             from public.memberships m
             join public.organizations o on o.id = m.organization_id
             where o.slug = any($1::text[])`,
      values: [setupOrganizationSlugs],
    },
    role_grants: {
      text: `select count(*)::int as count
             from public.role_grants r
             join public.organizations o on o.id = r.organization_id
             where o.slug = any($1::text[])`,
      values: [setupOrganizationSlugs],
    },
    first_owner_setup: {
      text: `select count(*)::int as count
             from public.first_owner_setup
             where setup_attempt_id = any($1::text[])`,
      values: [setupAttemptIds],
    },
  };

  const query = countQueries[table];
  if (query === undefined) {
    throw new Error(`Unexpected count table ${table}`);
  }

  const result = await adminPool.query(query.text, query.values);
  return Number(result.rows[0]?.["count"] ?? 0);
}

async function adminCreateOtherOrganizationMember(): Promise<{
  readonly organizationId: string;
  readonly userId: string;
}> {
  const organizationId = randomUUID();
  const userId = randomUUID();

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, `slice1c-other-${testRunId}`, "Slice 1c Other"],
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, 'Other User', $2, true)`,
    [userId, otherEmail],
  );
  await adminPool.query(
    `insert into public.memberships (organization_id, user_id, status, membership_version)
     values ($1, $2, 'active', 1)`,
    [organizationId, userId],
  );

  createdOrganizationIds.push(organizationId);
  createdUserIds.push(userId);
  return { organizationId, userId };
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = createdOrganizationIds.filter((value) => value !== "");
  const userIds = createdUserIds.filter((value) => value !== "");

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.first_owner_setup where organization_id = any($1::uuid[])",
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

  if (userIds.length > 0) {
    await adminPool.query("delete from public.auth_sessions where user_id = any($1::text[])", [
      userIds,
    ]);
    await adminPool.query("delete from public.auth_accounts where user_id = any($1::text[])", [
      userIds,
    ]);
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [userIds]);
  }

  createdOrganizationIds.length = 0;
  createdUserIds.length = 0;
}

// This suite proves first-owner setup on a never-set-up database, but the
// shared local DB may already hold a completed setup (e.g. the workers
// roadmap seed). Park any existing singleton for the duration of the suite
// and restore it afterwards so other suites keep their expected state.
let parkedFirstOwnerSetup: Record<string, unknown> | null = null;

beforeAll(async () => {
  await adminPool.query(
    "select pg_advisory_lock(hashtext('opzava:first-owner-setup:test-fixture'))",
  );

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
      `Slice 1c auth integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
    );
  }

  const existing = await adminPool.query(
    "select setup_attempt_id, organization_id, owner_user_id, completed_at from public.first_owner_setup",
  );
  parkedFirstOwnerSetup = (existing.rows[0] as Record<string, unknown> | undefined) ?? null;
  await adminPool.query("delete from public.first_owner_setup");
});

afterEach(async () => {
  await cleanupCreatedRows();
});

afterAll(async () => {
  if (parkedFirstOwnerSetup !== null) {
    await adminPool.query(
      `insert into public.first_owner_setup
         (singleton_id, setup_attempt_id, organization_id, owner_user_id, completed_at)
       values (true, $1, $2, $3, $4)
       on conflict (singleton_id) do nothing`,
      [
        parkedFirstOwnerSetup["setup_attempt_id"],
        parkedFirstOwnerSetup["organization_id"],
        parkedFirstOwnerSetup["owner_user_id"],
        parkedFirstOwnerSetup["completed_at"],
      ],
    );
  }
  await adminPool.query(
    "select pg_advisory_unlock(hashtext('opzava:first-owner-setup:test-fixture'))",
  );
  await pool.end();
  await adminPool.end();
});

describe("slice 1c auth acceptance", () => {
  it("proves atomic setup, DB sessions, identity discovery, and tenant denial", async () => {
    const authPort = new BetterAuthPortAdapter(db);

    const failingSetup = new FirstOwnerSetupService({
      database: db,
      authPort,
      fault: async (point) => {
        if (point === "after-auth-user-insert") {
          throw new Error("forced setup rollback");
        }
      },
    });

    const failed = await failingSetup.setup({
      ownerName: "Owner One",
      ownerEmail,
      ownerPassword,
      organizationName: "Opzava Internal",
      workspaceName: "Admin",
      timezone: "Asia/Manila",
      idempotencyKey: failedSetupIdempotencyKey,
    });

    expect(failed.ok).toBe(false);
    await expect(adminCount("auth_users")).resolves.toBe(0);
    await expect(adminCount("auth_accounts")).resolves.toBe(0);
    await expect(adminCount("organizations")).resolves.toBe(0);
    await expect(adminCount("workspaces")).resolves.toBe(0);
    await expect(adminCount("memberships")).resolves.toBe(0);
    await expect(adminCount("role_grants")).resolves.toBe(0);
    await expect(adminCount("first_owner_setup")).resolves.toBe(0);

    const setup = new FirstOwnerSetupService({ database: db, authPort });
    const created = await setup.setup({
      ownerName: "Owner One",
      ownerEmail,
      ownerPassword,
      organizationName: "Opzava Internal",
      workspaceName: "Admin",
      timezone: "Asia/Manila",
      idempotencyKey: createdSetupIdempotencyKey,
    });

    expect(created.ok).toBe(true);
    if (!created.ok || created.value.status !== "created" || created.value.session === undefined) {
      throw new Error("Expected first-owner setup to create and sign in the owner.");
    }

    if (created.value.organizationId !== undefined) {
      createdOrganizationIds.push(created.value.organizationId);
    }
    if (created.value.ownerUserId !== undefined) {
      createdUserIds.push(created.value.ownerUserId);
    }

    await expect(adminCount("auth_users")).resolves.toBe(1);
    await expect(adminCount("auth_accounts")).resolves.toBe(1);
    await expect(adminCount("organizations")).resolves.toBe(1);
    await expect(adminCount("workspaces")).resolves.toBe(1);
    await expect(adminCount("memberships")).resolves.toBe(1);
    await expect(adminCount("role_grants")).resolves.toBe(1);
    await expect(adminCount("first_owner_setup")).resolves.toBe(1);
    await expect(adminCount("auth_sessions")).resolves.toBe(1);

    const second = await setup.setup({
      ownerName: "Second Owner",
      ownerEmail: secondSetupEmail,
      ownerPassword,
      organizationName: "Second Org",
      workspaceName: "Second Workspace",
      timezone: "Asia/Manila",
      idempotencyKey: secondSetupIdempotencyKey,
    });

    expect(second).toMatchObject({ ok: true, value: { status: "already-set-up" } });
    await expect(adminCount("auth_users")).resolves.toBe(1);
    await expect(adminCount("organizations")).resolves.toBe(1);
    await expect(adminCount("memberships")).resolves.toBe(1);
    await expect(adminCount("role_grants")).resolves.toBe(1);

    const session = created.value.session;
    const activeOrgId = session.identity.activeMembership.orgId;
    expect(session.identity.email).toBe(ownerEmail);
    expect(session.identity.memberships).toHaveLength(1);
    expect(activeOrgId).toBe(created.value.organizationId);

    const resolved = await authPort.getSession({ sessionToken: session.sessionToken });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.value === null) {
      throw new Error("Expected DB-backed session to resolve.");
    }
    expect(resolved.value.identity.activeMembership.orgId).toBe(activeOrgId);

    await withTenantForSession(resolved.value, activeOrgId, async (tx) => {
      const result = await tx.execute(sql`
        select id
        from public.workspaces
        where organization_id = ${activeOrgId}
      `);
      expect(rowsFromExecuteResult(result)).toHaveLength(1);
    });

    const other = await adminCreateOtherOrganizationMember();
    await expect(
      withTenantForSession(resolved.value, makeOrgId(other.organizationId), async () => undefined),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      (async () => {
        try {
          await db.execute(sql`
            insert into public.workspaces (organization_id, slug, name)
            values (${activeOrgId}, 'no-context', 'No Context')
          `);
        } catch (error) {
          throw mapDatabaseError(error);
        }
      })(),
    ).rejects.toMatchObject({ status: 403 });

    const noIdentityOrganizations = await db.execute(sql`
      select id
      from public.organizations
      order by id
    `);
    expect(rowsFromExecuteResult(noIdentityOrganizations)).toHaveLength(0);

    const identityOrganizations = await withAuthenticatedIdentity(
      { sessionToken: session.sessionToken },
      async (tx, identity) => {
        expect(identity.userId).toBe(session.identity.userId);
        const result = await tx.execute(sql`
          select o.id
          from public.organizations o
          join public.memberships m on m.organization_id = o.id
          order by o.id
        `);
        return rowsFromExecuteResult(result).map((row) => String(row["id"]));
      },
    );
    expect(identityOrganizations).toEqual([activeOrgId]);

    const listed = await authPort.listSessions({ userId: session.identity.userId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      throw listed.error;
    }
    expect(listed.value).toHaveLength(1);

    const revoked = await authPort.revokeSession({
      actorUserId: session.identity.userId,
      sessionToken: session.sessionToken,
    });
    expect(revoked.ok).toBe(true);
    const revokedSession = await authPort.getSession({ sessionToken: session.sessionToken });
    expect(revokedSession).toMatchObject({ ok: true, value: null });

    const signedInAgain = await authPort.signIn({
      email: ownerEmail,
      password: ownerPassword,
    });
    expect(signedInAgain.ok).toBe(true);
    if (!signedInAgain.ok || "challengeId" in signedInAgain.value) {
      throw new Error("Expected owner sign-in to issue a DB session.");
    }

    const loggedOut = await authPort.logoutAll({
      userId: signedInAgain.value.identity.userId,
    });
    expect(loggedOut.ok).toBe(true);
    const afterLogoutAll = await authPort.getSession({
      sessionToken: signedInAgain.value.sessionToken,
    });
    expect(afterLogoutAll).toMatchObject({ ok: true, value: null });
  });
});
