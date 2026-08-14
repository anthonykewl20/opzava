import type { TenantTransaction } from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  DevBoardPlanningStore,
  DevTicketRow,
  InsertDevTicketInput,
  InsertProposalInput,
  ProposalRow,
  UpdateDevTicketForReadyApprovalInput,
  UpdateProposalInput,
} from "../application/dev-board-planning-store.js";

function key(organizationId: string, workspaceId: string, id: string): string {
  return `${organizationId}:${workspaceId}:${id}`;
}

export class InMemoryDevBoardPlanningStore implements DevBoardPlanningStore {
  public readonly proposals = new Map<string, ProposalRow>();
  public readonly devTickets = new Map<string, DevTicketRow>();

  public async executeRiskyMutation<T>(
    _tx: TenantTransaction,
    mutation: () => Promise<T>,
  ): Promise<Result<T>> {
    try {
      return ok(await mutation());
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { readonly code?: unknown }).code
          : undefined;
      if (code === "23503" || code === "23505") {
        return err(
          new DomainError({
            code:
              code === "23503"
                ? "dev_board.constraint_reference_invalid"
                : "dev_board.constraint_conflict",
            message:
              code === "23503"
                ? "A referenced Dev Board record is not valid."
                : "A Dev Board record with this identity already exists.",
          }),
        );
      }
      throw error;
    }
  }

  public async selectProposalForUpdate(
    _tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    proposalId: string,
  ): Promise<ProposalRow | null> {
    return this.proposals.get(key(organizationId, workspaceId, proposalId)) ?? null;
  }

  public async insertProposal(
    _tx: TenantTransaction,
    input: InsertProposalInput,
  ): Promise<ProposalRow> {
    if (this.proposals.has(key(input.organizationId, input.workspaceId, input.id))) {
      throw { code: "23505" };
    }
    const row: ProposalRow = {
      id: input.id,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      version: 1,
      lifecycleState: "draft",
      archivedAt: null,
      discoverySummary: input.discoverySummary,
      blockingAssessment: input.blockingAssessment,
      suggestedContract: input.suggestedContract,
      createdCommandId: input.createdCommandId,
      acceptedCommandId: null,
      acceptedDevTicketId: null,
    };
    this.proposals.set(key(input.organizationId, input.workspaceId, input.id), row);
    return row;
  }

  public async updateProposal(
    _tx: TenantTransaction,
    input: UpdateProposalInput,
  ): Promise<ProposalRow | null> {
    const mapKey = key(input.organizationId, input.workspaceId, input.proposalId);
    const current = this.proposals.get(mapKey);
    if (current === undefined || current.version !== input.expectedVersion) return null;
    const row = {
      ...current,
      lifecycleState: input.lifecycleState,
      acceptedCommandId: input.acceptedCommandId,
      acceptedDevTicketId: input.acceptedDevTicketId,
      ...(input.archivedAt === undefined ? {} : { archivedAt: input.archivedAt }),
      version: current.version + 1,
    };
    this.proposals.set(mapKey, row);
    return row;
  }

  public async selectDevTicketForUpdate(
    _tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    ticketId: string,
  ): Promise<DevTicketRow | null> {
    return this.devTickets.get(key(organizationId, workspaceId, ticketId)) ?? null;
  }

  public async insertDevTicket(
    _tx: TenantTransaction,
    input: InsertDevTicketInput,
  ): Promise<DevTicketRow> {
    if (
      this.devTickets.has(key(input.organizationId, input.workspaceId, input.id)) ||
      (input.sourceProposalId !== null &&
        [...this.devTickets.values()].some(
          (row) =>
            row.organizationId === input.organizationId &&
            row.sourceProposalId === input.sourceProposalId,
        ))
    ) {
      throw { code: "23505" };
    }
    const row: DevTicketRow = {
      id: input.id,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      version: 1,
      originKind: input.originKind,
      sourceProposalId: input.sourceProposalId,
      lane: "backlog",
      archivedAt: null,
      humanOwnerUserId: input.humanOwnerUserId,
      readyContractVersion: 1,
      readyContractContent: input.readyContractContent,
      readyContractContentHash: input.readyContractContentHash,
      readyState: "draft",
      readyApprovalContractVersion: null,
      readyApprovalContentHash: null,
      readyApprovedByUserId: null,
      readyApprovalCommandId: null,
      todoRank: null,
      createdCommandId: input.createdCommandId,
    };
    this.devTickets.set(key(input.organizationId, input.workspaceId, input.id), row);
    return row;
  }

  public async updateDevTicketForReadyApproval(
    _tx: TenantTransaction,
    input: UpdateDevTicketForReadyApprovalInput,
  ): Promise<DevTicketRow | null> {
    const mapKey = key(input.organizationId, input.workspaceId, input.devTicketId);
    const current = this.devTickets.get(mapKey);
    if (current === undefined || current.version !== input.expectedVersion) return null;
    const todoRank =
      Math.max(
        0,
        ...[...this.devTickets.values()]
          .filter(
            (row) =>
              row.organizationId === input.organizationId && row.workspaceId === input.workspaceId,
          )
          .map((row) => row.todoRank ?? 0),
      ) + 1;
    const row: DevTicketRow = {
      ...current,
      version: current.version + 1,
      lane: "todo",
      readyContractVersion: input.readyContractVersion,
      readyContractContent: input.readyContractContent,
      readyContractContentHash: input.readyContractContentHash,
      readyState: "approved",
      readyApprovalContractVersion: input.readyContractVersion,
      readyApprovalContentHash: input.readyContractContentHash,
      readyApprovedByUserId: input.readyApprovedByUserId,
      readyApprovalCommandId: input.readyApprovalCommandId,
      todoRank,
    };
    this.devTickets.set(mapKey, row);
    return row;
  }
}
