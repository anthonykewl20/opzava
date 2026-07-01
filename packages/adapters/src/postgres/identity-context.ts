import { sql } from "drizzle-orm";

import { db } from "./client.js";
import { ForbiddenError, mapDatabaseError, TenantContextMissingError } from "./errors.js";
import type { TenantQueryable, TenantTransaction } from "./tenant-context.js";

type RootDatabase = typeof db;

export interface AuthenticatedIdentityInput {
  readonly sessionToken: string;
}

export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly sessionId: string;
}

export type IdentityTransaction = TenantTransaction;

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

async function resetRequestGucs(client: TenantQueryable): Promise<void> {
  await client.execute(sql`
    select
      set_config('app.current_user', '', false),
      set_config('app.current_org', '', false)
  `);
}

async function resolveIdentityFromSession(
  sessionToken: string,
  database: RootDatabase
): Promise<AuthenticatedIdentity> {
  if (sessionToken.trim() === "") {
    throw new ForbiddenError();
  }

  const result = await database.transaction(async (tx) => {
    // Session lookup is global auth state. Clear both Opzava request GUCs before
    // reading it so an authenticated identity can only come from the DB session.
    await resetRequestGucs(tx);

    return tx.execute(sql`
      select id, user_id
      from public.auth_sessions
      where token = ${sessionToken}
        and expires_at > now()
      limit 1
    `);
  });

  const row = rowsFromExecuteResult(result)[0];
  const sessionId = row?.["id"];
  const userId = row?.["user_id"];

  if (typeof sessionId !== "string" || typeof userId !== "string") {
    throw new ForbiddenError();
  }

  return { sessionId, userId };
}

export async function assertCurrentUser(
  client: TenantQueryable,
  expectedUserId: string
): Promise<void> {
  if (expectedUserId.trim() === "") {
    throw new TenantContextMissingError();
  }

  try {
    const result = await client.execute(sql`select app.current_user_id() as current_user_id`);
    const row = rowsFromExecuteResult(result)[0];

    if (row?.["current_user_id"] !== expectedUserId) {
      throw new TenantContextMissingError();
    }
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function withAuthenticatedIdentity<T>(
  input: AuthenticatedIdentityInput,
  fn: (tx: IdentityTransaction, identity: AuthenticatedIdentity) => Promise<T> | T,
  database: RootDatabase = db
): Promise<T> {
  try {
    const identity = await resolveIdentityFromSession(input.sessionToken, database);

    const result = await database.transaction(async (tx) => {
      await resetRequestGucs(tx);
      await tx.execute(sql`select set_config('app.current_user', ${identity.userId}, true)`);
      await assertCurrentUser(tx, identity.userId);
      return fn(tx as IdentityTransaction, identity);
    });

    return result as T;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}
