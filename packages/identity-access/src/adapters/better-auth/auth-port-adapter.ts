import { db } from "@opzava/adapters";
import {
  DomainError,
  err,
  ok,
  type Result
} from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";

import type {
  AuthPort,
  AuthSession,
  ListSessionsInput,
  LogoutAllInput,
  MfaChallenge,
  RevokeSessionInput,
  SignInInput
} from "@opzava/ports";

import { verifyPassword } from "./password-hasher.js";
import {
  credentialProviderId,
  listActiveMembershipsForUser,
  normalizeEmail,
  resolveSessionPrincipal,
  sessionTokenFromHeaders
} from "./session-principal.js";

type RootDatabase = typeof db;

interface CredentialRow {
  readonly userId: string;
  readonly email: string;
  readonly passwordHash: string;
}

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

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

function invalidCredentials(): DomainError {
  return new DomainError({
    code: "auth.invalidCredentials",
    message: "Invalid email or password."
  });
}

function sessionError(cause: unknown): DomainError {
  return new DomainError({
    code: "auth.sessionOperationFailed",
    message: "Auth session operation failed.",
    cause
  });
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function rowToCredential(row: Record<string, unknown> | undefined): CredentialRow | null {
  if (row === undefined || typeof row["password"] !== "string") {
    return null;
  }

  return {
    userId: String(row["user_id"]),
    email: String(row["email"]),
    passwordHash: row["password"]
  };
}

async function selectCredential(
  email: string,
  database: RootDatabase
): Promise<CredentialRow | null> {
  const result = await database.execute(sql`
    select u.id as user_id, u.email, a.password
    from public.auth_users u
    join public.auth_accounts a on a.user_id = u.id
    where lower(u.email) = ${email}
      and a.provider_id = ${credentialProviderId}
      and a.account_id = ${email}
    limit 1
  `);

  return rowToCredential(rowsFromExecuteResult(result)[0]);
}

export class BetterAuthPortAdapter implements AuthPort {
  public constructor(private readonly database: RootDatabase = db) {}

  public async signIn(input: SignInInput): Promise<Result<AuthSession | MfaChallenge>> {
    try {
      const email = normalizeEmail(input.email);
      const credential = await selectCredential(email, this.database);

      if (credential === null) {
        return err(invalidCredentials());
      }

      const passwordMatches = await verifyPassword({
        hash: credential.passwordHash,
        password: input.password
      });

      if (!passwordMatches) {
        return err(invalidCredentials());
      }

      const memberships = await listActiveMembershipsForUser(credential.userId, this.database);
      const activeMembership = memberships[0];

      if (activeMembership === undefined) {
        return err(
          new DomainError({
            code: "auth.noActiveMembership",
            message: "No active organization membership is available for this user."
          })
        );
      }

      const sessionId = randomUUID();
      const sessionToken = randomToken();
      const expiresAt = new Date(Date.now() + sessionTtlMs);

      await this.database.execute(sql`
        insert into public.auth_sessions (
          id,
          user_id,
          token,
          expires_at,
          ip_address,
          user_agent,
          active_organization_id,
          membership_version
        )
        values (
          ${sessionId},
          ${credential.userId},
          ${sessionToken},
          ${expiresAt},
          ${input.ipAddress ?? null},
          ${input.userAgent ?? null},
          ${activeMembership.orgId},
          ${activeMembership.membershipVersion}
        )
      `);

      const resolved = await resolveSessionPrincipal(sessionToken, this.database);
      if (!resolved.ok || resolved.value === null) {
        return err(
          resolved.ok
            ? sessionError("Created session could not be resolved.")
            : resolved.error
        );
      }

      return ok(resolved.value);
    } catch (error) {
      return err(sessionError(error));
    }
  }

  public async getSession(input: {
    readonly sessionToken?: string;
    readonly headers?: Headers;
  }): Promise<Result<AuthSession | null>> {
    const sessionToken = input.sessionToken ?? sessionTokenFromHeaders(input.headers);

    if (sessionToken === undefined || sessionToken.trim() === "") {
      return ok(null);
    }

    return resolveSessionPrincipal(sessionToken, this.database);
  }

  public async revokeSession(input: RevokeSessionInput): Promise<Result<void>> {
    try {
      if (input.sessionId === undefined && input.sessionToken === undefined) {
        return err(
          new DomainError({
            code: "auth.sessionRevocationTargetRequired",
            message: "A session id or token is required to revoke a session."
          })
        );
      }

      const actorUserId = input.actorUserId as string;
      await this.database.execute(sql`
        delete from public.auth_sessions
        where user_id = ${actorUserId}
          and (
            (${input.sessionId ?? null}::text is not null and id = ${input.sessionId ?? null})
            or (${input.sessionToken ?? null}::text is not null and token = ${input.sessionToken ?? null})
          )
      `);

      return ok(undefined);
    } catch (error) {
      return err(sessionError(error));
    }
  }

  public async listSessions(input: ListSessionsInput): Promise<Result<readonly AuthSession[]>> {
    try {
      const result = await this.database.execute(sql`
        select token
        from public.auth_sessions
        where user_id = ${input.userId as string}
          and expires_at > now()
        order by created_at desc
      `);

      const sessions: AuthSession[] = [];
      for (const row of rowsFromExecuteResult(result)) {
        const token = String(row["token"]);
        const resolved = await resolveSessionPrincipal(token, this.database);
        if (resolved.ok && resolved.value !== null) {
          sessions.push(resolved.value);
        }
      }

      return ok(sessions);
    } catch (error) {
      return err(sessionError(error));
    }
  }

  public async logoutAll(input: LogoutAllInput): Promise<Result<number>> {
    try {
      const result = await this.database.execute(sql`
        delete from public.auth_sessions
        where user_id = ${input.userId as string}
          and (${input.keepSessionId ?? null}::text is null or id <> ${input.keepSessionId ?? null})
      `);

      const rowCount =
        typeof result === "object" &&
        result !== null &&
        "rowCount" in result &&
        typeof (result as { readonly rowCount?: unknown }).rowCount === "number"
          ? (result as { readonly rowCount: number }).rowCount
          : 0;

      return ok(rowCount);
    } catch (error) {
      return err(sessionError(error));
    }
  }
}

export const authPort = new BetterAuthPortAdapter();
