import {
  assertCurrentTenant,
  assertCurrentUser,
  db,
  ForbiddenError,
  mapDatabaseError
} from "@opzava/adapters";
import type { TenantTransaction } from "@opzava/adapters";
import {
  DomainError,
  err,
  makeOrgId,
  makeTenantId,
  makeUserId,
  ok,
  type OrgId,
  type Result,
  type TenantId,
  type UserId
} from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";

import type { AuthMembership, AuthSession, SessionId, SessionToken } from "@opzava/ports";

import { authorizationVersionFrom } from "../../application/authorization-version.js";

type RootDatabase = typeof db;

export const credentialProviderId = "email-password";

interface SessionRow {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly userId: string;
  readonly email: string;
  readonly activeOrganizationId: string;
  readonly sessionMembershipVersion: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly mfaSatisfiedAt: Date | null;
}

interface MembershipRow {
  readonly organizationId: string;
  readonly membershipVersion: number;
  readonly roleKeys: readonly string[];
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

function parseDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    return new Date(value);
  }

  throw new DomainError({
    code: "auth.invalidSessionRecord",
    message: "Auth session record contains an invalid timestamp."
  });
}

function toTenantId(orgId: string): TenantId {
  return makeTenantId(orgId);
}

function toMembership(row: MembershipRow): AuthMembership {
  const orgId = makeOrgId(row.organizationId);
  return {
    orgId,
    tenantId: toTenantId(row.organizationId),
    membershipVersion: row.membershipVersion,
    authorizationVersion: authorizationVersionFrom(row.membershipVersion),
    roleKeys: row.roleKeys
  };
}

function rowToSession(row: SessionRow, memberships: readonly AuthMembership[]): AuthSession {
  const activeMembership = memberships.find(
    (membership) => membership.orgId.toLowerCase() === row.activeOrganizationId.toLowerCase()
  );

  if (activeMembership === undefined) {
    throw new ForbiddenError();
  }

  return {
    sessionId: row.sessionId as SessionId,
    sessionToken: row.sessionToken as SessionToken,
    identity: {
      userId: makeUserId(row.userId),
      email: row.email,
      activeMembership,
      memberships
    },
    issuedAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.mfaSatisfiedAt === null ? {} : { mfaSatisfiedAt: row.mfaSatisfiedAt })
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function sessionTokenFromHeaders(headers: Headers | undefined): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const cookieHeader = headers.get("cookie");
  if (cookieHeader === null) {
    return undefined;
  }

  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (
      value !== undefined &&
      (name === "better-auth.session_token" ||
        name === "__Secure-better-auth.session_token" ||
        name === "opzava.session_token")
    ) {
      return decodeURIComponent(value);
    }
  }

  return undefined;
}

export async function listActiveMembershipsForUser(
  userId: string,
  database: RootDatabase = db
): Promise<readonly AuthMembership[]> {
  const result = await database.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.current_user', '', false),
        set_config('app.current_org', '', false)
    `);
    await tx.execute(sql`select set_config('app.current_user', ${userId}, true)`);
    await assertCurrentUser(tx, userId);

    return tx.execute(sql`
      select
        m.organization_id,
        m.membership_version,
        coalesce(
          array_agg(rg.role_key order by rg.role_key)
            filter (where rg.role_key is not null),
          array[]::text[]
        ) as role_keys
      from public.memberships m
      join public.organizations o on o.id = m.organization_id
      left join public.role_grants rg
        on rg.organization_id = m.organization_id
       and rg.subject_type = 'user'
       and rg.subject_id = m.user_id
       and rg.scope_type = 'organization'
       and rg.scope_id = m.organization_id
      where m.user_id = ${userId}
        and m.status = 'active'
        and o.lifecycle_state in ('provisioning', 'active')
      group by m.organization_id, m.membership_version
      order by min(m.created_at), m.organization_id
    `);
  });

  return rowsFromExecuteResult(result).map((row) =>
    toMembership({
      organizationId: String(row["organization_id"]),
      membershipVersion: Number(row["membership_version"]),
      roleKeys: Array.isArray(row["role_keys"])
        ? (row["role_keys"] as readonly string[])
        : []
    })
  );
}

export async function resolveSessionPrincipal(
  sessionToken: string,
  database: RootDatabase = db
): Promise<Result<AuthSession | null>> {
  try {
    const result = await database.transaction(async (tx) => {
      await tx.execute(sql`
        select
          set_config('app.current_user', '', false),
          set_config('app.current_org', '', false)
      `);

      return tx.execute(sql`
        select
          s.id as session_id,
          s.token as session_token,
          s.user_id,
          u.email,
          s.active_organization_id,
          s.membership_version as session_membership_version,
          s.created_at,
          s.expires_at,
          s.mfa_satisfied_at
        from public.auth_sessions s
        join public.auth_users u on u.id = s.user_id
        where s.token = ${sessionToken}
          and s.expires_at > now()
          and s.active_organization_id is not null
        limit 1
      `);
    });
    const raw = rowsFromExecuteResult(result)[0];

    if (raw === undefined) {
      return ok(null);
    }

    const row: SessionRow = {
      sessionId: String(raw["session_id"]),
      sessionToken: String(raw["session_token"]),
      userId: String(raw["user_id"]),
      email: String(raw["email"]),
      activeOrganizationId: String(raw["active_organization_id"]),
      sessionMembershipVersion: Number(raw["session_membership_version"]),
      createdAt: parseDate(raw["created_at"]),
      expiresAt: parseDate(raw["expires_at"]),
      mfaSatisfiedAt: raw["mfa_satisfied_at"] === null ? null : parseDate(raw["mfa_satisfied_at"])
    };

    const memberships = await listActiveMembershipsForUser(row.userId, database);
    const activeMembership = memberships.find(
      (membership) => membership.orgId.toLowerCase() === row.activeOrganizationId.toLowerCase()
    );

    if (
      activeMembership === undefined ||
      row.sessionMembershipVersion !== activeMembership.membershipVersion
    ) {
      return ok(null);
    }

    return ok(rowToSession(row, memberships));
  } catch (error) {
    return err(
      error instanceof DomainError
        ? error
        : new DomainError({
            code: "auth.sessionResolutionFailed",
            message: "Unable to resolve the authenticated session.",
            cause: mapDatabaseError(error)
          })
    );
  }
}

export async function withTenantForSession<T>(
  session: AuthSession,
  orgId: OrgId,
  fn: (tx: TenantTransaction) => Promise<T> | T
): Promise<T> {
  const membership = session.identity.memberships.find(
    (candidate) => candidate.orgId.toLowerCase() === orgId.toLowerCase()
  );

  if (membership === undefined) {
    throw new ForbiddenError();
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select
          set_config('app.current_user', '', false),
          set_config('app.current_org', '', false)
      `);
      await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
      await assertCurrentTenant(tx, orgId);
      await tx.execute(sql`select set_config('app.current_user', ${session.identity.userId}, true)`);
      await assertCurrentUser(tx, session.identity.userId);
      return fn(tx as TenantTransaction);
    });

    return result as T;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export function activeOrgId(session: AuthSession): OrgId {
  return session.identity.activeMembership.orgId;
}

export function activeTenantId(session: AuthSession): TenantId {
  return session.identity.activeMembership.tenantId;
}

export function userIdFromSession(session: AuthSession): UserId {
  return session.identity.userId;
}
