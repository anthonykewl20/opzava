import type { TenantTransaction } from "@opzava/adapters";
import { ok, type Result } from "@opzava/shared-kernel";

import type {
  AppendActivityEventInput,
  AppendPlanningDecisionEntryInput,
  DevBoardLedgerAppendPort
} from "../application/dev-board-ledger-append-port.js";

export interface InMemoryPlanningDecisionEntry extends AppendPlanningDecisionEntryInput {
  readonly entrySequence: number;
}

export interface InMemoryActivityEvent extends AppendActivityEventInput {
  readonly eventSequence: number;
}

export class InMemoryDevBoardLedgerAppendStore implements DevBoardLedgerAppendPort {
  public readonly planningDecisionEntries: InMemoryPlanningDecisionEntry[] = [];
  public readonly activityEvents: InMemoryActivityEvent[] = [];

  public async appendPlanningDecisionEntry(
    _tx: TenantTransaction,
    input: AppendPlanningDecisionEntryInput
  ): Promise<Result<{ readonly entrySequence: number }>> {
    const entrySequence =
      Math.max(
        0,
        ...this.planningDecisionEntries
          .filter((entry) => entry.workspaceId === input.workspaceId)
          .map((entry) => entry.entrySequence)
      ) + 1;
    this.planningDecisionEntries.push({ ...input, entrySequence });
    return ok({ entrySequence });
  }

  public async appendActivityEvent(
    _tx: TenantTransaction,
    input: AppendActivityEventInput
  ): Promise<Result<{ readonly eventSequence: number }>> {
    const eventSequence =
      Math.max(
        0,
        ...this.activityEvents
          .filter((event) => event.workspaceId === input.workspaceId)
          .map((event) => event.eventSequence)
      ) + 1;
    this.activityEvents.push({ ...input, eventSequence });
    return ok({ eventSequence });
  }
}
