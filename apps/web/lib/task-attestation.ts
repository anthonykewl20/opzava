import { mapDatabaseError, sql, withTenant } from "@opzava/adapters";
import type { HumanCommandAttestation } from "@opzava/project-management";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type { AppSessionContext } from "@/lib/session";

type QueryRow = Record<string, unknown>;

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

function attestationError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isAdminContext(context: AppSessionContext): boolean {
  return context.roleKeys.includes("owner") || context.roleKeys.includes("admin");
}

export async function issueDoneConfirmNonce(
  context: AppSessionContext,
  taskId: string,
): Promise<Result<string>> {
  if (!isAdminContext(context)) {
    return err(
      attestationError(
        "projectManagement.forbidden",
        "Only an authenticated owner or admin can confirm a task Done.",
      ),
    );
  }

  try {
    return await withTenant(context.orgId, async (tx) => {
      const result = await tx.execute(sql`
        insert into public.task_done_confirmation (
          task_id,
          organization_id,
          workspace_id,
          issued_for_user_id,
          expires_at
        )
        select
          t.id,
          t.organization_id,
          t.workspace_id,
          ${context.user.id},
          now() + interval '5 minutes'
        from public.tasks t
        where t.id = ${taskId}
          and t.workspace_id = ${context.workspaceId}
        returning id
      `);
      const nonce = rowsFromExecuteResult(result)[0]?.["id"];
      return typeof nonce === "string"
        ? ok(nonce)
        : err(attestationError("projectManagement.taskNotFound", "Task was not found."));
    });
  } catch (error) {
    return err(
      attestationError(
        "web.taskDoneConfirmationFailed",
        "The Done confirmation could not be issued.",
        mapDatabaseError(error),
      ),
    );
  }
}

export function attestHumanCommand(
  context: AppSessionContext,
  nonce: string,
): HumanCommandAttestation {
  return {
    confirmedByUserId: context.user.id,
    confirmSource: "admin-web",
    confirmNonce: nonce,
  };
}
