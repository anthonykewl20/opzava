import { sql } from "drizzle-orm";
import {
  db,
  rowsFromExecuteResult,
  withTenant,
  type QueryRow,
  type TenantTransaction,
  type createPostgresDatabase
} from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  CommandReceiptLookup,
  CommandReceiptRecord,
  CommandReceiptRepository,
  CommandReceiptResult,
  FinalizeCommandReceiptInput
} from "../../application/command-receipt-store.js";
import type {
  CommandEnvelope,
  CommandExpectedVersion
} from "../../domain/command-envelope.js";

type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;

function idempotencyConflict(): DomainError {
  return new DomainError({
    code: "dev_board.idempotency_conflict",
    message: "The idempotency key was already used for a different request."
  });
}

function invalidReceipt(): DomainError {
  return new DomainError({
    code: "dev_board.invalid_command_receipt",
    message: "The command receipt record is invalid."
  });
}

function rowToReceipt(row: QueryRow): CommandReceiptRecord {
  const state = row["state"];
  if (state !== "reserved" && state !== "accepted" && state !== "rejected") {
    throw invalidReceipt();
  }
  const outcomeCode = row["outcome_code"];
  const resultRef = row["result_ref"];
  const resultSummary = row["result_summary"];
  const resultingVersions = row["resulting_versions"];
  return {
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    commandName: String(row["command_name"]),
    idempotencyKey: String(row["idempotency_key"]),
    requestHash: String(row["request_hash"]),
    commandId: String(row["command_id"]),
    state,
    ...(typeof outcomeCode === "string" ? { outcomeCode } : {}),
    ...(state !== "reserved" && typeof resultRef === "string" ? { resultRef } : {}),
    ...(state !== "reserved" && isRecord(resultSummary) ? { resultSummary } : {}),
    ...(state !== "reserved" && isExpectedVersionArray(resultingVersions)
      ? { resultingVersions }
      : {})
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExpectedVersionArray(
  value: unknown
): value is readonly CommandExpectedVersion[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item["recordKind"] === "string" &&
        typeof item["recordId"] === "string" &&
        typeof item["version"] === "number"
    )
  );
}

function receiptResult(receipt: CommandReceiptRecord): CommandReceiptResult {
  return {
    commandId: receipt.commandId,
    state: receipt.state,
    ...(receipt.outcomeCode === undefined ? {} : { outcomeCode: receipt.outcomeCode }),
    ...(receipt.resultRef === undefined ? {} : { resultRef: receipt.resultRef }),
    ...(receipt.resultSummary === undefined ? {} : { resultSummary: receipt.resultSummary }),
    ...(receipt.resultingVersions === undefined
      ? {}
      : { resultingVersions: receipt.resultingVersions })
  };
}

export class PostgresCommandReceiptRepository implements CommandReceiptRepository {
  public constructor(private readonly database: PostgresDatabase = db) {}

  public async reserveOrReplay(
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>> {
    return withTenant(
      envelope.organizationId,
      (tx) => this.reserveOrReplayTransaction(tx, envelope),
      this.database
    );
  }

  public async reserveOrReplayTransaction(
    tx: TenantTransaction,
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>> {
    const inserted = await tx.execute(sql`
          insert into public.dev_board_command_receipt (
            organization_id, workspace_id, command_id, command_name, idempotency_key,
            request_hash, target_aggregate_id, actor_kind, actor_stable_id, actor_role,
            source_kind, source_ref, authorization_version, correlation_id, causation_id,
            expected_versions
          ) values (
            ${envelope.organizationId}::uuid, ${envelope.workspaceId}::uuid,
            ${envelope.commandId}::uuid, ${envelope.commandName}, ${envelope.idempotencyKey},
            ${envelope.requestHash}, ${envelope.targetAggregateId}::uuid,
            ${envelope.actorRef.kind}, ${envelope.actorRef.stableId}, ${envelope.actorRef.role},
            ${envelope.sourceRef.kind}, ${envelope.sourceRef.ref},
            ${envelope.authorizationVersion}, ${envelope.correlationId}::uuid,
            ${envelope.causationId ?? null}::uuid,
            ${JSON.stringify(envelope.expectedVersions)}::jsonb
          )
          on conflict (organization_id, workspace_id, command_name, idempotency_key)
          do nothing
          returning organization_id, workspace_id, command_name, idempotency_key, request_hash,
            command_id, state, outcome_code, result_ref, result_summary, resulting_versions
    `);
    const insertedRow = rowsFromExecuteResult(inserted)[0];
    if (insertedRow !== undefined) return ok(receiptResult(rowToReceipt(insertedRow)));

    const selected = await tx.execute(sql`
          select organization_id, workspace_id, command_name, idempotency_key, request_hash,
            command_id, state, outcome_code, result_ref, result_summary, resulting_versions
          from public.dev_board_command_receipt
          where organization_id = ${envelope.organizationId}::uuid
            and workspace_id = ${envelope.workspaceId}::uuid
            and command_name = ${envelope.commandName}
            and idempotency_key = ${envelope.idempotencyKey}
          limit 1
    `);
    const existingRow = rowsFromExecuteResult(selected)[0];
    if (existingRow === undefined) throw invalidReceipt();
    const existing = rowToReceipt(existingRow);
    return existing.requestHash === envelope.requestHash
      ? ok(receiptResult(existing))
      : err(idempotencyConflict());
  }

  public async finalizeTransaction(
    tx: TenantTransaction,
    input: FinalizeCommandReceiptInput
  ): Promise<Result<void>> {
    const updated = await tx.execute(sql`
      update public.dev_board_command_receipt
      set state = ${input.outcome},
        finalized_at = now(),
        outcome_code = ${input.outcomeCode ?? null},
        result_ref = ${input.resultRef ?? null}::uuid,
        result_summary = ${JSON.stringify(input.resultSummary ?? {})}::jsonb,
        resulting_versions = ${JSON.stringify(input.resultingVersions ?? [])}::jsonb,
        updated_at = now()
      where organization_id = ${input.organizationId}::uuid
        and command_id = ${input.commandId}::uuid
        and state = 'reserved'
      returning command_id
    `);
    return rowsFromExecuteResult(updated)[0] === undefined ? err(invalidReceipt()) : ok(undefined);
  }

  public async readReceipt(lookup: CommandReceiptLookup): Promise<CommandReceiptRecord | null> {
    return withTenant(
      lookup.organizationId,
      async (tx) => {
        const selected = await tx.execute(sql`
          select organization_id, workspace_id, command_name, idempotency_key, request_hash,
            command_id, state, outcome_code, result_ref, result_summary, resulting_versions
          from public.dev_board_command_receipt
          where organization_id = ${lookup.organizationId}::uuid
            and workspace_id = ${lookup.workspaceId}::uuid
            and command_name = ${lookup.commandName}
            and idempotency_key = ${lookup.idempotencyKey}
          limit 1
        `);
        const row = rowsFromExecuteResult(selected)[0];
        return row === undefined ? null : rowToReceipt(row);
      },
      this.database
    );
  }
}
