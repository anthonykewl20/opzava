import {
  assertCurrentUser,
  mapDatabaseError,
  sql,
  withTenant,
  type TenantTransaction,
} from "@opzava/adapters";
import {
  DomainError,
  err,
  makeOrgId,
  makeUserId,
  makeWorkspaceId,
  ok,
  type Result,
} from "@opzava/shared-kernel";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export const linkTokenAudience = "opzava:mcp";
export const linkTokenClientId = "claude-code";
export const linkTokenScopes = ["tasks:read", "tasks:write"] as const;

export type LinkTokenScope = (typeof linkTokenScopes)[number];

export interface LinkTokenClaims {
  readonly aud: typeof linkTokenAudience;
  readonly scope: string;
  readonly sid: string;
  readonly tenant_id: string;
  readonly exp: number;
  readonly jti: string;
}

export interface LinkTokenDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly clientId: typeof linkTokenClientId;
  readonly scopes: readonly LinkTokenScope[];
  readonly jti: string;
  readonly membershipVersion: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly lastUsedAt: string | null;
}

export interface LinkTokenPrincipal {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly clientId: typeof linkTokenClientId;
  readonly scopes: readonly LinkTokenScope[];
  readonly tokenId: string;
  readonly membershipVersion: number;
  readonly actor: {
    readonly userId: string;
    readonly roleKeys: readonly string[];
  };
}

export interface IssueLinkTokenInput {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly scopes: readonly string[];
  readonly ttlSeconds: number;
  readonly clientId?: typeof linkTokenClientId;
  readonly now?: Date;
}

export interface IssuedLinkToken {
  readonly token: string;
  readonly claims: LinkTokenClaims;
  readonly record: LinkTokenDto;
}

export interface VerifyLinkTokenInput {
  readonly token: string;
  readonly now?: Date;
}

export interface RevokeLinkTokenInput {
  readonly orgId: string;
  readonly userId: string;
  readonly tokenId: string;
  readonly now?: Date;
}

export interface ListLinkTokensInput {
  readonly orgId: string;
  readonly workspaceId?: string;
  readonly userId: string;
}

interface MembershipPrincipal {
  readonly membershipVersion: number;
  readonly roleKeys: readonly string[];
}

type QueryRow = Record<string, unknown>;

const tokenPrefix = "opzava_link_";
const allowedScopes = new Set<string>(linkTokenScopes);

function linkTokenError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
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

function parseDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw linkTokenError(
    "identityAccess.invalidLinkTokenRecord",
    "Link token record contains an invalid timestamp.",
  );
}

function parseNullableDate(value: unknown): string | null {
  return value === null || value === undefined ? null : parseDate(value);
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function rowToLinkTokenDto(row: QueryRow): LinkTokenDto {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    userId: String(row["user_id"]),
    sessionId: String(row["session_id"]),
    clientId: linkTokenClientId,
    scopes: stringArray(row["scopes"]) as readonly LinkTokenScope[],
    jti: String(row["jti"]),
    membershipVersion: Number(row["membership_version"]),
    createdAt: parseDate(row["created_at"]),
    expiresAt: parseDate(row["expires_at"]),
    revokedAt: parseNullableDate(row["revoked_at"]),
    lastUsedAt: parseNullableDate(row["last_used_at"]),
  };
}

function normalizeScopes(scopes: readonly string[]): Result<readonly LinkTokenScope[]> {
  const normalized = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];

  if (normalized.length === 0 || normalized.length > linkTokenScopes.length) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenScope",
        "Link token scope must include tasks:read, tasks:write, or both.",
      ),
    );
  }

  const invalid = normalized.find((scope) => !allowedScopes.has(scope));
  if (invalid !== undefined) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenScope",
        "Link token scope must be limited to tasks:read and tasks:write.",
      ),
    );
  }

  return ok(linkTokenScopes.filter((scope) => normalized.includes(scope)));
}

function validateIssueInput(input: IssueLinkTokenInput): Result<readonly LinkTokenScope[]> {
  try {
    makeOrgId(input.orgId);
    makeWorkspaceId(input.workspaceId);
    makeUserId(input.userId);
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenContext",
        "Link token context contains an invalid organization, workspace, or user id.",
        error,
      ),
    );
  }

  if (input.clientId !== undefined && input.clientId !== linkTokenClientId) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenClient",
        "Link tokens are currently limited to the claude-code client.",
      ),
    );
  }

  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 86400) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenTtl",
        "Link token TTL must be 60-86400 seconds.",
      ),
    );
  }

  return normalizeScopes(input.scopes);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function scopeClaim(scopes: readonly LinkTokenScope[]): string {
  return scopes.join(" ");
}

function parseScopeClaim(scope: string): Result<readonly LinkTokenScope[]> {
  return normalizeScopes(scope.split(/\s+/));
}

function nowDate(inputNow: Date | undefined): Date {
  return inputNow === undefined ? new Date() : inputNow;
}

function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

function tokenFromClaims(claims: LinkTokenClaims): string {
  const secret = randomBytes(32).toString("base64url");
  return `${tokenPrefix}${base64UrlJson(claims)}.${secret}`;
}

function parseToken(token: string): Result<{
  readonly claims: LinkTokenClaims;
  readonly tokenHash: string;
}> {
  if (!token.startsWith(tokenPrefix)) {
    return err(linkTokenError("identityAccess.linkTokenInvalid", "Link token is invalid."));
  }

  const body = token.slice(tokenPrefix.length);
  const [claimsPart, secretPart] = body.split(".");
  if (
    claimsPart === undefined ||
    secretPart === undefined ||
    claimsPart.trim() === "" ||
    secretPart.trim() === ""
  ) {
    return err(linkTokenError("identityAccess.linkTokenInvalid", "Link token is invalid."));
  }

  try {
    const claims = parseBase64UrlJson<LinkTokenClaims>(claimsPart);
    if (
      claims.aud !== linkTokenAudience ||
      typeof claims.scope !== "string" ||
      typeof claims.sid !== "string" ||
      typeof claims.tenant_id !== "string" ||
      typeof claims.exp !== "number" ||
      typeof claims.jti !== "string"
    ) {
      return err(linkTokenError("identityAccess.linkTokenInvalid", "Link token is invalid."));
    }

    makeOrgId(claims.tenant_id);

    return ok({ claims, tokenHash: hashToken(token) });
  } catch (error) {
    return err(linkTokenError("identityAccess.linkTokenInvalid", "Link token is invalid.", error));
  }
}

async function setCurrentUser(tx: TenantTransaction, userId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.current_user', ${userId}, true)`);
  await assertCurrentUser(tx, userId);
}

async function loadMembershipPrincipal(
  tx: TenantTransaction,
  orgId: string,
  userId: string,
): Promise<MembershipPrincipal | null> {
  const result = await tx.execute(sql`
    select
      m.membership_version,
      coalesce(
        array_agg(rg.role_key order by rg.role_key)
          filter (where rg.role_key is not null),
        array[]::text[]
      ) as role_keys
    from public.memberships m
    left join public.role_grants rg
      on rg.organization_id = m.organization_id
     and rg.subject_type = 'user'
     and rg.subject_id = m.user_id
     and rg.scope_type = 'organization'
     and rg.scope_id = m.organization_id
    where m.organization_id = ${orgId}
      and m.user_id = ${userId}
      and m.status = 'active'
    group by m.membership_version
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined
    ? null
    : {
        membershipVersion: Number(row["membership_version"]),
        roleKeys: stringArray(row["role_keys"]),
      };
}

async function assertSessionCurrent(
  tx: TenantTransaction,
  input: {
    readonly sessionId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly membershipVersion: number;
  },
): Promise<boolean> {
  const result = await tx.execute(sql`
    select id
    from public.auth_sessions
    where id = ${input.sessionId}
      and user_id = ${input.userId}
      and active_organization_id = ${input.orgId}
      and membership_version = ${input.membershipVersion}
      and expires_at > now()
    limit 1
  `);

  return rowsFromExecuteResult(result)[0] !== undefined;
}

async function assertWorkspaceInTenant(
  tx: TenantTransaction,
  orgId: string,
  workspaceId: string,
): Promise<boolean> {
  const result = await tx.execute(sql`
    select id
    from public.workspaces
    where id = ${workspaceId}
      and organization_id = ${orgId}
    limit 1
  `);

  return rowsFromExecuteResult(result)[0] !== undefined;
}

export async function issueLinkToken(input: IssueLinkTokenInput): Promise<Result<IssuedLinkToken>> {
  const scopes = validateIssueInput(input);
  if (!scopes.ok) {
    return err(scopes.error);
  }

  const issuedAt = nowDate(input.now);
  const expiresAt = new Date(issuedAt.getTime() + input.ttlSeconds * 1000);
  const claims: LinkTokenClaims = {
    aud: linkTokenAudience,
    scope: scopeClaim(scopes.value),
    sid: input.sessionId,
    tenant_id: input.orgId,
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti: randomUUID(),
  };
  const token = tokenFromClaims(claims);

  try {
    return await withTenant(input.orgId, async (tx) => {
      await setCurrentUser(tx, input.userId);

      const workspaceExists = await assertWorkspaceInTenant(tx, input.orgId, input.workspaceId);
      if (!workspaceExists) {
        return err(linkTokenError("identityAccess.workspaceNotFound", "Workspace was not found."));
      }

      const membership = await loadMembershipPrincipal(tx, input.orgId, input.userId);
      if (membership === null) {
        return err(
          linkTokenError(
            "identityAccess.linkTokenSessionDrift",
            "Link token cannot be issued because the session membership is no longer current.",
          ),
        );
      }

      const sessionCurrent = await assertSessionCurrent(tx, {
        sessionId: input.sessionId,
        orgId: input.orgId,
        userId: input.userId,
        membershipVersion: membership.membershipVersion,
      });
      if (!sessionCurrent) {
        return err(
          linkTokenError(
            "identityAccess.linkTokenSessionDrift",
            "Link token cannot be issued because the session membership is no longer current.",
          ),
        );
      }

      const result = await tx.execute(sql`
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
          created_at,
          expires_at
        )
        values (
          ${input.orgId},
          ${input.workspaceId},
          ${input.userId},
          ${input.sessionId},
          ${linkTokenClientId},
          ${sql.param(scopes.value)}::text[],
          ${hashToken(token)},
          ${claims.jti},
          ${membership.membershipVersion},
          ${issuedAt.toISOString()},
          ${expiresAt.toISOString()}
        )
        returning
          id,
          organization_id,
          workspace_id,
          user_id,
          session_id,
          client_id,
          scopes,
          jti,
          membership_version,
          created_at,
          expires_at,
          revoked_at,
          last_used_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined
        ? err(
            linkTokenError(
              "identityAccess.linkTokenIssueFailed",
              "Link token could not be issued.",
            ),
          )
        : ok({ token, claims, record: rowToLinkTokenDto(row) });
    });
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.linkTokenIssueFailed",
        "Link token could not be issued.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function verifyLinkToken(
  input: VerifyLinkTokenInput,
): Promise<Result<LinkTokenPrincipal>> {
  const parsed = parseToken(input.token);
  if (!parsed.ok) {
    return err(parsed.error);
  }

  const scopeResult = parseScopeClaim(parsed.value.claims.scope);
  if (!scopeResult.ok) {
    return err(scopeResult.error);
  }

  const now = nowDate(input.now);
  const claimExpiresAt = new Date(parsed.value.claims.exp * 1000);
  if (isExpired(claimExpiresAt, now)) {
    return err(linkTokenError("identityAccess.linkTokenExpired", "Link token has expired."));
  }

  try {
    return await withTenant(parsed.value.claims.tenant_id, async (tx) => {
      const result = await tx.execute(sql`
        select
          id,
          organization_id,
          workspace_id,
          user_id,
          session_id,
          client_id,
          scopes,
          jti,
          membership_version,
          created_at,
          expires_at,
          revoked_at,
          last_used_at
        from public.link_tokens
        where token_hash = ${parsed.value.tokenHash}
          and jti = ${parsed.value.claims.jti}
        limit 1
      `);

      const row = rowsFromExecuteResult(result)[0];
      if (row === undefined) {
        return err(linkTokenError("identityAccess.linkTokenInvalid", "Link token is invalid."));
      }

      const record = rowToLinkTokenDto(row);
      await setCurrentUser(tx, record.userId);

      if (
        record.organizationId !== parsed.value.claims.tenant_id ||
        record.sessionId !== parsed.value.claims.sid ||
        record.jti !== parsed.value.claims.jti ||
        record.clientId !== linkTokenClientId ||
        scopeClaim(record.scopes) !== scopeClaim(scopeResult.value)
      ) {
        return err(linkTokenError("identityAccess.linkTokenInvalid", "Link token is invalid."));
      }

      if (record.revokedAt !== null) {
        return err(
          linkTokenError("identityAccess.linkTokenRevoked", "Link token has been revoked."),
        );
      }

      if (isExpired(new Date(record.expiresAt), now)) {
        return err(linkTokenError("identityAccess.linkTokenExpired", "Link token has expired."));
      }

      const membership = await loadMembershipPrincipal(tx, record.organizationId, record.userId);
      if (membership === null || membership.membershipVersion !== record.membershipVersion) {
        return err(
          linkTokenError(
            "identityAccess.linkTokenSessionDrift",
            "Link token session membership is no longer current.",
          ),
        );
      }

      const sessionCurrent = await assertSessionCurrent(tx, {
        sessionId: record.sessionId,
        orgId: record.organizationId,
        userId: record.userId,
        membershipVersion: record.membershipVersion,
      });
      if (!sessionCurrent) {
        return err(
          linkTokenError(
            "identityAccess.linkTokenSessionDrift",
            "Link token session membership is no longer current.",
          ),
        );
      }

      await tx.execute(sql`
        update public.link_tokens
        set last_used_at = ${now.toISOString()}
        where id = ${record.id}
      `);

      return ok({
        orgId: record.organizationId,
        workspaceId: record.workspaceId,
        userId: record.userId,
        sessionId: record.sessionId,
        clientId: record.clientId,
        scopes: record.scopes,
        tokenId: record.id,
        membershipVersion: record.membershipVersion,
        actor: {
          userId: record.userId,
          roleKeys: membership.roleKeys,
        },
      });
    });
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.linkTokenVerifyFailed",
        "Link token could not be verified.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function revokeLinkToken(
  input: RevokeLinkTokenInput,
): Promise<Result<LinkTokenDto | null>> {
  try {
    makeOrgId(input.orgId);
    makeUserId(input.userId);
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenContext",
        "Link token context contains an invalid organization or user id.",
        error,
      ),
    );
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      await setCurrentUser(tx, input.userId);
      const result = await tx.execute(sql`
        update public.link_tokens
        set revoked_at = coalesce(revoked_at, ${nowDate(input.now).toISOString()})
        where id = ${input.tokenId}
          and user_id = ${input.userId}
        returning
          id,
          organization_id,
          workspace_id,
          user_id,
          session_id,
          client_id,
          scopes,
          jti,
          membership_version,
          created_at,
          expires_at,
          revoked_at,
          last_used_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return ok(row === undefined ? null : rowToLinkTokenDto(row));
    });
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.linkTokenRevokeFailed",
        "Link token could not be revoked.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function listLinkTokens(
  input: ListLinkTokensInput,
): Promise<Result<readonly LinkTokenDto[]>> {
  try {
    makeOrgId(input.orgId);
    makeUserId(input.userId);
    if (input.workspaceId !== undefined) {
      makeWorkspaceId(input.workspaceId);
    }
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.invalidLinkTokenContext",
        "Link token context contains an invalid organization, workspace, or user id.",
        error,
      ),
    );
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      await setCurrentUser(tx, input.userId);
      const result = await tx.execute(sql`
        select
          id,
          organization_id,
          workspace_id,
          user_id,
          session_id,
          client_id,
          scopes,
          jti,
          membership_version,
          created_at,
          expires_at,
          revoked_at,
          last_used_at
        from public.link_tokens
        where user_id = ${input.userId}
          ${input.workspaceId === undefined ? sql`` : sql`and workspace_id = ${input.workspaceId}`}
        order by created_at desc, id desc
      `);

      return ok(rowsFromExecuteResult(result).map(rowToLinkTokenDto));
    });
  } catch (error) {
    return err(
      linkTokenError(
        "identityAccess.linkTokenListFailed",
        "Link tokens could not be loaded.",
        mapDatabaseError(error),
      ),
    );
  }
}
