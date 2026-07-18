import { sql } from "drizzle-orm";

import type {
  AppendAuditInput,
  AppendAuditReceipt,
  CaptureErrorInput,
  ErrorCapturePort,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { withTenant } from "./tenant-context.js";

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

function auditAppendFailure(cause: unknown): DomainError {
  return new DomainError({
    code: "observability.auditAppendFailed",
    message: "Governance audit append failed.",
    ...(cause === undefined ? {} : { cause }),
  });
}

/**
 * Postgres-backed observability seam (#192). Compliance audit rows are appended directly to
 * Postgres (the system of record for the audit event itself — no outbox, per #192 comment 4),
 * inside the tenant-scoped `withTenant` transaction so RLS pins every row to the acting org.
 * The config snapshot, when supplied, is written to the immutable `governance_config_version`
 * table in the SAME transaction and linked by id, so an audit row and its referenced version
 * appear atomically. Diagnostics (`capture`) are best-effort structured logs only — droppable,
 * never the source of truth; the durable diagnostics sink is the pending ADR-013 GlitchTip.
 */
export class PostgresObservabilityAdapter implements ErrorCapturePort {
  public async capture(input: CaptureErrorInput): Promise<Result<void>> {
    const payload = {
      level: input.severity,
      source: input.source,
      operation: input.operation,
      message: input.message,
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    };
    if (input.severity === "error") {
      console.error(JSON.stringify(payload));
    } else {
      console.warn(JSON.stringify(payload));
    }
    return ok(undefined);
  }

  public async appendAudit(input: AppendAuditInput): Promise<Result<AppendAuditReceipt>> {
    try {
      const receipt = await withTenant(input.organizationId, async (tx) => {
        let configVersionId: string | undefined;

        if (input.configSnapshot !== undefined) {
          const snapshot = input.configSnapshot;
          const versionRow = rowsFromExecuteResult(
            await tx.execute(sql`
              insert into public.governance_config_version (
                organization_id, target_kind, target_ref, version_hash, content
              )
              values (
                ${input.organizationId},
                ${snapshot.targetKind},
                ${snapshot.targetRef},
                ${snapshot.versionHash ?? null},
                ${JSON.stringify(snapshot.content)}::jsonb
              )
              returning id
            `),
          )[0];
          configVersionId = versionRow === undefined ? undefined : String(versionRow["id"]);
        }

        const auditRow = rowsFromExecuteResult(
          await tx.execute(sql`
            insert into public.governance_audit (
              organization_id,
              workspace_id,
              intent,
              transition,
              target_kind,
              target_ref,
              actor_id,
              actor_type,
              triggered_by_actor_id,
              triggered_by_action,
              correlation_id,
              config_version_id,
              authorization_decision,
              policy_decision,
              entitlement_decision,
              result,
              result_code,
              result_message
            )
            values (
              ${input.organizationId},
              ${input.workspaceId ?? null},
              ${input.intent},
              ${input.transition},
              ${input.targetKind},
              ${input.targetRef},
              ${input.actorId},
              ${input.actorType},
              ${input.trigger?.triggeredByActorId ?? null},
              ${input.trigger?.triggeredByAction ?? null},
              ${input.correlationId ?? null},
              ${configVersionId ?? null},
              ${input.authorizationDecision ?? null},
              ${input.policyDecision ?? null},
              ${input.entitlementDecision ?? null},
              ${input.result},
              ${input.resultCode ?? null},
              ${input.resultMessage ?? null}
            )
            returning id, config_version_id
          `),
        )[0];

        const linkedConfigVersionId =
          auditRow === undefined || auditRow["config_version_id"] === null
            ? configVersionId
            : String(auditRow["config_version_id"]);

        return {
          eventId: String(auditRow?.["id"]),
          ...(linkedConfigVersionId === undefined
            ? {}
            : { configVersionId: linkedConfigVersionId }),
        } satisfies AppendAuditReceipt;
      });
      return ok(receipt);
    } catch (error) {
      return err(auditAppendFailure(error));
    }
  }
}
