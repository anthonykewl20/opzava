import { db, sql } from "@opzava/adapters";
import { authPort, withTenantForSession } from "@opzava/identity-access/better-auth";
import type { AuthSession } from "@opzava/ports";

type QueryRow = Record<string, unknown>;

export interface AppSessionContext {
  readonly sessionId: string;
  /** First-class opaque authorization version used for cache discrimination. */
  readonly authorizationVersion?: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
  };
  readonly orgId: string;
  readonly organizationName: string;
  readonly organizationLifecycleState: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaces?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly roleKeys: readonly string[];
}

function rowsFromExecuteResult(result: unknown): readonly QueryRow[] {
  if (Array.isArray(result)) {
    return result as readonly QueryRow[];
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as readonly QueryRow[]) : [];
}

function stringValue(row: QueryRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

async function requestHeaders(): Promise<Headers> {
  const { headers: nextHeaders } = await import("next/headers");
  return new Headers(await nextHeaders());
}

export async function isFirstOwnerSetupComplete(): Promise<boolean> {
  const result = await db.execute(sql`
    select 1
    from public.first_owner_setup
    limit 1
  `);

  return rowsFromExecuteResult(result).length > 0;
}

export async function getCurrentAuthSession(
  requestHeaderInput?: Headers,
): Promise<AuthSession | null> {
  const requestHeaderSnapshot = requestHeaderInput ?? (await requestHeaders());
  const result = await authPort.getSession({ headers: requestHeaderSnapshot });

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

async function resolveTenantContextForSession(
  session: AuthSession,
): Promise<AppSessionContext | null> {
  const orgId = session.identity.activeMembership.orgId;
  const result = await withTenantForSession(session, orgId, async (tx) =>
    tx.execute(sql`
      select
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        o.id as organization_id,
        o.name as organization_name,
        o.lifecycle_state as organization_lifecycle_state,
        w.id as workspace_id,
        w.name as workspace_name
      from public.auth_users u
      join public.organizations o on o.id = ${orgId}
      join public.workspaces w on w.organization_id = o.id
      where u.id = ${String(session.identity.userId)}
      order by w.created_at asc
    `),
  );

  const rows = rowsFromExecuteResult(result);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  const userId = stringValue(row, "user_id");
  const userName = stringValue(row, "user_name");
  const userEmail = stringValue(row, "user_email");
  const organizationId = stringValue(row, "organization_id");
  const organizationName = stringValue(row, "organization_name");
  const organizationLifecycleState = stringValue(row, "organization_lifecycle_state");
  const workspaceId = stringValue(row, "workspace_id");
  const workspaceName = stringValue(row, "workspace_name");

  if (
    userId === null ||
    userName === null ||
    userEmail === null ||
    organizationId === null ||
    organizationName === null ||
    organizationLifecycleState === null ||
    workspaceId === null ||
    workspaceName === null
  ) {
    return null;
  }

  const workspaces = rows
    .map((workspaceRow) => {
      const id = stringValue(workspaceRow, "workspace_id");
      const name = stringValue(workspaceRow, "workspace_name");
      return id === null || name === null ? null : { id, name };
    })
    .filter(
      (workspace): workspace is { readonly id: string; readonly name: string } =>
        workspace !== null,
    );

  if (workspaces.length === 0) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    authorizationVersion: session.identity.activeMembership.authorizationVersion,
    user: {
      id: userId,
      email: userEmail,
      name: userName,
    },
    orgId: organizationId,
    organizationName,
    organizationLifecycleState,
    workspaceId,
    workspaceName,
    workspaces,
    roleKeys: session.identity.activeMembership.roleKeys,
  };
}

export async function getAppSessionContext(
  requestHeaderInput?: Headers,
): Promise<AppSessionContext | null> {
  const requestHeaderSnapshot = requestHeaderInput ?? (await requestHeaders());
  const session = await getCurrentAuthSession(requestHeaderSnapshot);

  // Fail closed: only a verified AuthPort session (which enforces expiry,
  // membership_version, revocation, and org lifecycle) may produce a shell
  // context. There is deliberately NO raw-cookie fallback, so a session the
  // AuthPort rejected can never be revived from another active membership.
  if (session === null) {
    return null;
  }

  return resolveTenantContextForSession(session);
}
