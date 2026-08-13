import { sql } from "drizzle-orm";
import {
  db,
  rowsFromExecuteResult,
  withTenant,
  type QueryRow,
  type createPostgresDatabase
} from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  CommandReceiptLookup,
  CommandReceiptRecord,
  CommandReceiptRepository,
  CommandReceiptResult
} from "../../application/command-receipt-store.js";
import type { CommandEnvelope } from "../../domain/command-envelope.js";

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
  return {
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    commandName: String(row["command_name"]),
    idempotencyKey: String(row["idempotency_key"]),
    requestHash: String(row["request_hash"]),
    commandId: String(row["command_id"]),
    state,
    ...(typeof outcomeCode === "string" ? { outcomeCode } : {})
  };
}

function receiptResult(receipt: CommandReceiptRecord): CommandReceiptResult {
  return {
    commandId: receipt.commandId,
    state: receipt.state,
    ...(receipt.outcomeCode === undefined ? {} : { outcomeCode: receipt.outcomeCode })
  };
}

export class PostgresCommandReceiptRepository implements CommandReceiptRepository {
  public constructor(private readonly database: PostgresDatabase = db) {}

  public async reserveOrReplay(
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>> {
    return withTenant(
      envelope.organizationId,
      async (tx) => {
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
            command_id, state, outcome_code
        `);
        const insertedRow = rowsFromExecuteResult(inserted)[0];
        if (insertedRow !== undefined) return ok(receiptResult(rowToReceipt(insertedRow)));

        const selected = await tx.execute(sql`
          select organization_id, workspace_id, command_name, idempotency_key, request_hash,
            command_id, state, outcome_code
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
      },
      this.database
    );
  }

  public async readReceipt(lookup: CommandReceiptLookup): Promise<CommandReceiptRecord | null> {
    return withTenant(
      lookup.organizationId,
      async (tx) => {
        const selected = await tx.execute(sql`
          select organization_id, workspace_id, command_name, idempotency_key, request_hash,
            command_id, state, outcome_code
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
