import { sql } from "drizzle-orm";
import {
  mapTenantStoreError,
  rowsFromExecuteResult,
  type TenantTransaction
} from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  AppendActivityEventInput,
  AppendPlanningDecisionEntryInput,
  DevBoardLedgerAppendPort
} from "../../application/dev-board-ledger-append-port.js";

function appendFailed(cause: Error): DomainError {
  return new DomainError({
    code: "dev_board.ledger_append_failed",
    message: "The Dev Board ledger entry could not be appended.",
    cause
  });
}

function sequenceFrom(value: unknown): number | null {
  const sequence = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

export class PostgresDevBoardLedgerAppendStore implements DevBoardLedgerAppendPort {
  public async appendPlanningDecisionEntry(
    tx: TenantTransaction,
    input: AppendPlanningDecisionEntryInput
  ): Promise<Result<{ readonly entrySequence: number }>> {
    try {
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtext('dev_board_planning_entry:' || ${input.workspaceId})
        )
      `);
      const inserted = await tx.execute(sql`
        insert into public.dev_board_planning_decision_entry (
          organization_id, workspace_id, entry_sequence, command_id, aggregate_id,
          entry_kind, subject, content_hash, content
        )
        select ${input.organizationId}::uuid, ${input.workspaceId}::uuid,
          coalesce(max(entry_sequence), 0) + 1, ${input.commandId}::uuid,
          ${input.aggregateId}::uuid, ${input.entryKind}, ${input.subject}, ${input.contentHash},
          ${JSON.stringify(input.content)}::jsonb
        from public.dev_board_planning_decision_entry
        where organization_id = ${input.organizationId}::uuid
          and workspace_id = ${input.workspaceId}::uuid
        returning entry_sequence
      `);
      const sequence = sequenceFrom(rowsFromExecuteResult(inserted)[0]?.["entry_sequence"]);
      return sequence === null
        ? err(appendFailed(new Error("Planning entry insert returned no sequence.")))
        : ok({ entrySequence: sequence });
    } catch (error) {
      const mapped = mapTenantStoreError(error);
      return err(mapped instanceof DomainError ? mapped : appendFailed(mapped));
    }
  }

  public async appendActivityEvent(
    tx: TenantTransaction,
    input: AppendActivityEventInput
  ): Promise<Result<{ readonly eventSequence: number }>> {
    try {
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtext('dev_board_activity_event:' || ${input.workspaceId})
        )
      `);
      const inserted = await tx.execute(sql`
        insert into public.dev_board_activity_event (
          organization_id, workspace_id, event_sequence, aggregate_id, aggregate_version,
          event_name, command_id, idempotency_key, planning_decision_entry_id,
          actor_kind, actor_stable_id, actor_role, source_kind, source_ref,
          authorization_version, correlation_id, causation_id, occurred_at, payload
        )
        select ${input.organizationId}::uuid, ${input.workspaceId}::uuid,
          coalesce(max(event_sequence), 0) + 1, ${input.aggregateId}::uuid,
          ${input.aggregateVersion}, ${input.eventName}, ${input.commandId}::uuid,
          ${input.idempotencyKey}, ${input.planningDecisionEntryId ?? null}::uuid,
          ${input.actor.kind}, ${input.actor.stableId}, ${input.actor.role},
          ${input.source.kind}, ${input.source.ref}, ${input.authorizationVersion},
          ${input.correlationId}::uuid, ${input.causationId ?? null}::uuid,
          ${input.occurredAt.toISOString()}::timestamptz, ${JSON.stringify(input.payload)}::jsonb
        from public.dev_board_activity_event
        where organization_id = ${input.organizationId}::uuid
          and workspace_id = ${input.workspaceId}::uuid
        returning event_sequence
      `);
      const sequence = sequenceFrom(rowsFromExecuteResult(inserted)[0]?.["event_sequence"]);
      return sequence === null
        ? err(appendFailed(new Error("Activity event insert returned no sequence.")))
        : ok({ eventSequence: sequence });
    } catch (error) {
      const mapped = mapTenantStoreError(error);
      return err(mapped instanceof DomainError ? mapped : appendFailed(mapped));
    }
  }
}
