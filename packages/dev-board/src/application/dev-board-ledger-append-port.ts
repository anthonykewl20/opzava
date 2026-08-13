import type { TenantTransaction } from "@opzava/adapters";
import type { Result } from "@opzava/shared-kernel";

export interface AppendPlanningDecisionEntryInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly commandId: string;
  readonly aggregateId: string;
  readonly entryKind: string;
  readonly subject: string;
  readonly contentHash: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface AppendActivityEventInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly eventName: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly actor: {
    readonly kind: string;
    readonly stableId: string;
    readonly role: string;
  };
  readonly source: {
    readonly kind: string;
    readonly ref: string;
  };
  readonly authorizationVersion: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly planningDecisionEntryId?: string;
}

/**
 * Transaction-scoped append primitives. Callers appending both ledger kinds must acquire them in
 * planning-decision-entry then activity-event order to preserve the global advisory-lock order.
 */
export interface DevBoardLedgerAppendPort {
  appendPlanningDecisionEntry(
    tx: TenantTransaction,
    input: AppendPlanningDecisionEntryInput
  ): Promise<Result<{ readonly entrySequence: number }>>;
  appendActivityEvent(
    tx: TenantTransaction,
    input: AppendActivityEventInput
  ): Promise<Result<{ readonly eventSequence: number }>>;
}
