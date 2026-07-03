import { createPostgresPool, db, mapDatabaseError, pool, sql, withTenant } from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  issueLinkToken,
  listLinkTokens,
  revokeLinkToken,
  verifyLinkToken,
} from "../application/link-tokens.js";

interface TenantFixture {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionId: string;
}

const testRunId = randomUUID();
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for slice 2.5b link token tests.");
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
  const sessionId = `session-${testRunId}-${label}`;
  const sessionToken = `token-${testRunId}-${label}`;
  const slug = `slice25b-${testRunId}-${label}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `Slice 2.5b ${label}`],
  );
  await adminPool.query(
    `insert into public.workspaces (id, organization_id, slug, name)
     values ($1, $2, $3, $4)`,
    [workspaceId, organizationId, "admin", "Admin"],
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [userId, `MCP ${label}`, `${label}-${testRunId}@example.test`],
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

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];
  const sessionIds = [...createdSessionIds];

  if (organizationIds.length > 0) {
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
      `Slice 2.5b link-token integration test must run as non-owner opzava_app; got ${JSON.stringify(
        row,
      )}`,
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

describe("slice 2.5b link tokens", () => {
  it("issues a hashed token, verifies authority, lists metadata, and revokes it", async () => {
    const tenant = await adminCreateTenant("happy");

    const issued = await issueLinkToken({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      sessionId: tenant.sessionId,
      scopes: ["tasks:write", "tasks:read"],
      ttlSeconds: 300,
      now: new Date("2026-07-03T00:00:00.000Z"),
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) {
      throw issued.error;
    }

    const row = await adminPool.query(
      "select token_hash, jti, scopes from public.link_tokens where id = $1",
      [issued.value.record.id],
    );
    expect(row.rows[0]?.["token_hash"]).not.toBe(issued.value.token);
    expect(String(row.rows[0]?.["token_hash"])).toMatch(/^[a-f0-9]{64}$/);
    expect(row.rows[0]?.["jti"]).toBe(issued.value.claims.jti);
    expect(row.rows[0]?.["scopes"]).toEqual(["tasks:read", "tasks:write"]);

    const verified = await verifyLinkToken({
      token: issued.value.token,
      now: new Date("2026-07-03T00:01:00.000Z"),
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      throw verified.error;
    }
    expect(verified.value).toMatchObject({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      clientId: "claude-code",
      scopes: ["tasks:read", "tasks:write"],
      actor: { userId: tenant.userId, roleKeys: ["member"] },
    });

    const listed = await listLinkTokens({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
    });
    expect(listed).toMatchObject({
      ok: true,
      value: [{ id: issued.value.record.id, lastUsedAt: "2026-07-03T00:01:00.000Z" }],
    });

    const revoked = await revokeLinkToken({
      orgId: tenant.organizationId,
      userId: tenant.userId,
      tokenId: issued.value.record.id,
      now: new Date("2026-07-03T00:02:00.000Z"),
    });
    expect(revoked).toMatchObject({
      ok: true,
      value: { revokedAt: "2026-07-03T00:02:00.000Z" },
    });

    const afterRevoke = await verifyLinkToken({
      token: issued.value.token,
      now: new Date("2026-07-03T00:03:00.000Z"),
    });
    expect(afterRevoke).toMatchObject({
      ok: false,
      error: { code: "identityAccess.linkTokenRevoked" },
    });
  });

  it("fails closed for invalid scopes, expiry, and membership-version drift", async () => {
    const tenant = await adminCreateTenant("sad-paths");

    const invalidScope = await issueLinkToken({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      sessionId: tenant.sessionId,
      scopes: ["tasks:admin"],
      ttlSeconds: 300,
    });
    expect(invalidScope).toMatchObject({
      ok: false,
      error: { code: "identityAccess.invalidLinkTokenScope" },
    });

    const expired = await issueLinkToken({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      sessionId: tenant.sessionId,
      scopes: ["tasks:read"],
      ttlSeconds: 60,
      now: new Date("2026-07-03T00:00:00.000Z"),
    });
    expect(expired.ok).toBe(true);
    if (!expired.ok) {
      throw expired.error;
    }
    await expect(
      verifyLinkToken({
        token: expired.value.token,
        now: new Date("2026-07-03T00:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "identityAccess.linkTokenExpired" },
    });

    const drift = await issueLinkToken({
      orgId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      sessionId: tenant.sessionId,
      scopes: ["tasks:read"],
      ttlSeconds: 300,
    });
    expect(drift.ok).toBe(true);
    if (!drift.ok) {
      throw drift.error;
    }

    await adminPool.query(
      `update public.memberships
       set membership_version = membership_version + 1
       where organization_id = $1 and user_id = $2`,
      [tenant.organizationId, tenant.userId],
    );

    await expect(verifyLinkToken({ token: drift.value.token })).resolves.toMatchObject({
      ok: false,
      error: { code: "identityAccess.linkTokenSessionDrift" },
    });
  });

  it("proves 0005 RLS hides, rejects, and fails closed without tenant context", async () => {
    const tenantA = await adminCreateTenant("rls-a");
    const tenantB = await adminCreateTenant("rls-b");

    const issued = await issueLinkToken({
      orgId: tenantA.organizationId,
      workspaceId: tenantA.workspaceId,
      userId: tenantA.userId,
      sessionId: tenantA.sessionId,
      scopes: ["tasks:read"],
      ttlSeconds: 300,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) {
      throw issued.error;
    }

    const tenantBRead = await withTenant(tenantB.organizationId, async (tx) =>
      tx.execute(sql`
        select id
        from public.link_tokens
        where id = ${issued.value.record.id}
      `),
    );
    expect(rowsFromExecuteResult(tenantBRead)).toHaveLength(0);

    await expect(
      withTenant(tenantB.organizationId, async (tx) => {
        await tx.execute(sql`
          insert into public.link_tokens (
            organization_id,
            workspace_id,
            user_id,
            session_id,
            client_id,
            scopes,
            token_hash,
            jti,
            membership_version,
            expires_at
          )
          values (
            ${tenantA.organizationId},
            ${tenantA.workspaceId},
            ${tenantA.userId},
            ${tenantA.sessionId},
            'claude-code',
            array['tasks:read']::text[],
            '0000000000000000000000000000000000000000000000000000000000000000',
            ${randomUUID()},
            1,
            now() + interval '5 minutes'
          )
        `);
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      (async () => {
        try {
          await db.execute(sql`
            insert into public.link_tokens (
              organization_id,
              workspace_id,
              user_id,
              session_id,
              client_id,
              scopes,
              token_hash,
              jti,
              membership_version,
              expires_at
            )
            values (
              ${tenantA.organizationId},
              ${tenantA.workspaceId},
              ${tenantA.userId},
              ${tenantA.sessionId},
              'claude-code',
              array['tasks:read']::text[],
              '1111111111111111111111111111111111111111111111111111111111111111',
              ${randomUUID()},
              1,
              now() + interval '5 minutes'
            )
          `);
        } catch (error) {
          throw mapDatabaseError(error);
        }
      })(),
    ).rejects.toMatchObject({ status: 403 });
  });
});
