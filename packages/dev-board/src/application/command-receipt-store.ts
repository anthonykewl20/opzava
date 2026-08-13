import type { TenantTransaction } from "@opzava/adapters";
import type { Result } from "@opzava/shared-kernel";

import type {
  CommandEnvelope,
  CommandExpectedVersion
} from "../domain/command-envelope.js";

export interface CommandReceiptResult {
  readonly commandId: string;
  readonly state: "reserved" | "accepted" | "rejected";
  readonly outcomeCode?: string;
  readonly resultRef?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
  readonly resultingVersions?: readonly CommandExpectedVersion[];
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

export interface FinalizeCommandReceiptInput {
  readonly organizationId: string;
  readonly commandId: string;
  readonly outcome: "accepted" | "rejected";
  readonly outcomeCode?: string;
  readonly resultRef?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
  readonly resultingVersions?: readonly CommandExpectedVersion[];
}

export interface CommandReceiptRepository {
  reserveOrReplay(envelope: CommandEnvelope): Promise<Result<CommandReceiptResult>>;
  reserveOrReplayTransaction(
    tx: TenantTransaction,
    envelope: CommandEnvelope
  ): Promise<Result<CommandReceiptResult>>;
  finalizeTransaction(
    tx: TenantTransaction,
    input: FinalizeCommandReceiptInput
  ): Promise<Result<void>>;
  readReceipt(lookup: CommandReceiptLookup): Promise<CommandReceiptRecord | null>;
}
