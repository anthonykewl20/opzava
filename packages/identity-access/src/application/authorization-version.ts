import { ForbiddenError, type TenantTransaction } from "@opzava/adapters";
import type { OrgId, UserId } from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";

export interface BumpAuthorizationVersionInput {
  readonly orgId: OrgId;
  readonly userId: UserId;
}

export function authorizationVersionFrom(membershipVersion: number): string {
  return `av:${membershipVersion}`;
}

function rowsFromExecuteResult(result: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as readonly Record<string, unknown>[];
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as readonly Record<string, unknown>[]) : [];
}

/**
 * Bumps the principal's authorization state inside the caller's tenant transaction.
 *
 * Future membership, role-grant, and policy writers must call this in the same
 * tenant transaction as their authorization mutation. The helper deliberately does
 * not open a transaction. Under the current session-pin contract, committing a bump
 * makes existing sessions fail closed and requires re-authentication; any softer
 * re-resolution behavior is a Wave-2 decision.
 */
export async function bumpAuthorizationVersion(
  tx: TenantTransaction,
  input: BumpAuthorizationVersionInput,
): Promise<void> {
  const result = await tx.execute(sql`
    update public.memberships
    set
      membership_version = membership_version + 1,
      updated_at = now()
    where organization_id = ${input.orgId}
      and user_id = ${input.userId}
    returning membership_version
  `);

  if (rowsFromExecuteResult(result).length !== 1) {
    throw new ForbiddenError();
  }
}
