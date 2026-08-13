import type { TenantTransaction } from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  CommandReceiptLookup,
  CommandReceiptRecord,
  CommandReceiptRepository,
  CommandReceiptResult,
  FinalizeCommandReceiptInput
} from "../application/command-receipt-store.js";
import type { CommandEnvelope } from "../domain/command-envelope.js";

function receiptKey(input: CommandReceiptLookup): string {
  return JSON.stringify([
    input.organizationId,
    input.workspaceId,
    input.commandName,
    input.idempotencyKey
  ]);
}

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

export class InMemoryCommandReceiptRepository implements CommandReceiptRepository {
  public constructor(private readonly receipts = new Map<string, CommandReceiptRecord>()) {}

  public async reserveOrReplay(
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>> {
    return this.reserve(envelope);
  }

  public async reserveOrReplayTransaction(
    _tx: TenantTransaction,
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>> {
    return this.reserve(envelope);
  }

  public async finalizeTransaction(
    _tx: TenantTransaction,
    input: FinalizeCommandReceiptInput
  ): Promise<Result<void>> {
    const match = [...this.receipts.entries()].find(
      ([, receipt]) =>
        receipt.organizationId === input.organizationId && receipt.commandId === input.commandId
    );
    if (match === undefined || match[1].state !== "reserved") return err(invalidReceipt());

    const [key, receipt] = match;
    this.receipts.set(key, {
      ...receipt,
      state: input.outcome,
      ...(input.outcomeCode === undefined ? {} : { outcomeCode: input.outcomeCode }),
      ...(input.resultRef === undefined ? {} : { resultRef: input.resultRef }),
      resultSummary: input.resultSummary ?? {},
      resultingVersions: input.resultingVersions ?? []
    });
    return ok(undefined);
  }

  private reserve(envelope: CommandEnvelope): Result<CommandReceiptResult> {
    const key = receiptKey(envelope);
    const existing = this.receipts.get(key);
    if (existing !== undefined) {
      return existing.requestHash === envelope.requestHash
        ? ok(receiptResult(existing))
        : err(idempotencyConflict());
    }

    const receipt: CommandReceiptRecord = {
      organizationId: envelope.organizationId,
      workspaceId: envelope.workspaceId,
      commandName: envelope.commandName,
      idempotencyKey: envelope.idempotencyKey,
      requestHash: envelope.requestHash,
      commandId: envelope.commandId,
      state: "reserved"
    };
    this.receipts.set(key, receipt);
    return ok({ commandId: envelope.commandId, state: "reserved" });
  }

  public async readReceipt(lookup: CommandReceiptLookup): Promise<CommandReceiptRecord | null> {
    return this.receipts.get(receiptKey(lookup)) ?? null;
  }
}
