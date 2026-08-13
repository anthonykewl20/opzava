import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  CommandReceiptLookup,
  CommandReceiptRecord,
  CommandReceiptRepository,
  CommandReceiptResult
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

export class InMemoryCommandReceiptRepository implements CommandReceiptRepository {
  public constructor(private readonly receipts = new Map<string, CommandReceiptRecord>()) {}

  public async reserveOrReplay(
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>> {
    const key = receiptKey(envelope);
    const existing = this.receipts.get(key);
    if (existing !== undefined) {
      return existing.requestHash === envelope.requestHash
        ? ok({
            commandId: existing.commandId,
            state: existing.state,
            ...(existing.outcomeCode === undefined ? {} : { outcomeCode: existing.outcomeCode })
          })
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
