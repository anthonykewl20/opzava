import { sql } from "drizzle-orm";

import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { withTenant } from "./tenant-context.js";

export type TaskTerminalAttemptSurface = "web" | "runtime_control_tool" | "mcp" | "other";
export type TaskTerminalAttemptAction = "create" | "move" | "mark_done";
export type TaskTerminalAttemptHardReason =
  | "create_with_terminal_status"
  | "terminal_transition_requires_governed_admission"
  | "attestation_invalid"
  | "attestation_principal_mismatch"
  | "nonce_not_found"
  | "nonce_expired"
  | "nonce_conflict"
  | "nonce_bound_to_other_task"
  | "nonce_scope_mismatch"
  | "review_missing"
  | "review_scope_mismatch"
  | "review_not_approved";

export interface AppendTaskTerminalAttemptInput {
  readonly organizationId: string;
  readonly workspaceId?: string | null;
  readonly surface: TaskTerminalAttemptSurface;
  readonly attemptedAction: TaskTerminalAttemptAction;
  readonly targetTaskId?: string | null;
  readonly actorUserId?: string | null;
  readonly hardReason: TaskTerminalAttemptHardReason;
  readonly nonceConfirmationId?: string | null;
  readonly detail?: Readonly<Record<string, boolean | string>> | null;
}

function taskTerminalAttemptAppendFailure(cause: unknown): DomainError {
  return new DomainError({
    code: "projectManagement.taskTerminalAttemptAuditAppendFailed",
    message: "Task terminal-transition attempt audit append failed.",
    ...(cause === undefined ? {} : { cause }),
  });
}

/**
 * Durable, append-only audit adapter for legacy Task Done rejections. It intentionally opens its
 * own tenant transaction: rejection auditing is independent of the rejected command transaction.
 */
export class PostgresTaskTerminalAttemptAuditAdapter {
  public async appendTerminalAttempt(input: AppendTaskTerminalAttemptInput): Promise<Result<void>> {
    try {
      await withTenant(input.organizationId, async (tx) => {
        await tx.execute(sql`
          insert into public.task_terminal_transition_attempt (
            organization_id,
            workspace_id,
            surface,
            attempted_action,
            target_task_id,
            actor_user_id,
            hard_reason,
            nonce_confirmation_id,
            detail
          )
          values (
            ${input.organizationId},
            ${input.workspaceId ?? null},
            ${input.surface},
            ${input.attemptedAction},
            ${input.targetTaskId ?? null},
            ${input.actorUserId ?? null},
            ${input.hardReason},
            ${input.nonceConfirmationId ?? null},
            ${input.detail === undefined || input.detail === null
              ? null
              : JSON.stringify(input.detail)}::jsonb
          )
        `);
      });
      return ok(undefined);
    } catch (error) {
      return err(taskTerminalAttemptAppendFailure(error));
    }
  }
}
