import type { Result } from "@opzava/shared-kernel";

import type { CommandEnvelope } from "../domain/command-envelope.js";

export interface CommandReceiptResult {
  readonly commandId: string;
  readonly state: "reserved" | "accepted" | "rejected";
  readonly outcomeCode?: string;
}

export interface CommandReceiptRecord extends CommandReceiptResult {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly commandName: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export interface CommandReceiptLookup {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly commandName: string;
  readonly idempotencyKey: string;
}

export interface CommandReceiptRepository {
  reserveOrReplay(envelope: CommandEnvelope): Promise<Result<CommandReceiptResult>>;
  readReceipt(lookup: CommandReceiptLookup): Promise<CommandReceiptRecord | null>;
}
