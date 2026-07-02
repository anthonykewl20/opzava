import { sql, type SQL } from "drizzle-orm";

import { db } from "./client.js";
import {
  mapDatabaseError,
  RuntimeDatabaseRoleError,
  TenantContextMissingError
} from "./errors.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RootDatabase = typeof db;

// The transaction handle Drizzle passes to db.transaction(cb), extracted directly
// from the client type so it stays in sync with the installed Drizzle/pg version.
export type TenantTransaction = Parameters<Parameters<RootDatabase["transaction"]>[0]>[0];

export interface TenantQueryable {
  execute(query: SQL): Promise<unknown>;
}

export function assertValidTenantUuid(orgId: string): void {
  if (!uuidPattern.test(orgId)) {
    throw new TenantContextMissingError();
  }
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

export async function assertCurrentTenant(
  client: TenantQueryable,
  expectedOrgId: string
): Promise<void> {
  assertValidTenantUuid(expectedOrgId);

  try {
    const result = await client.execute(sql`select app.current_org_id() as current_org_id`);
    const row = rowsFromExecuteResult(result)[0];
    const currentOrgId = row?.["current_org_id"];

    if (
      typeof currentOrgId !== "string" ||
      currentOrgId.toLowerCase() !== expectedOrgId.toLowerCase()
    ) {
      throw new TenantContextMissingError();
    }
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function assertRuntimeDatabaseRole(client: TenantQueryable): Promise<void> {
  try {
    const result = await client.execute(sql`
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
      throw new RuntimeDatabaseRoleError();
    }
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function withTenant<T>(
  orgId: string,
  fn: (tx: TenantTransaction) => Promise<T> | T,
  database: RootDatabase = db
): Promise<T> {
  assertValidTenantUuid(orgId);

  try {
    const result = await database.transaction(async (tx) => {
      await assertRuntimeDatabaseRole(tx);
      // Invariant: the tenant GUC is set only after Drizzle has opened BEGIN for
      // this transaction, so it scopes to fn()'s queries and cannot leak across
      // PgBouncer transaction-pooled connections. set_config(..., true) binds the
      // value as a bound parameter (SET LOCAL cannot be parameterized) and is
      // transaction-local, so no untyped string is interpolated into SQL.
      await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
      await assertCurrentTenant(tx, orgId);
      return fn(tx as TenantTransaction);
    });

    return result as T;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}
