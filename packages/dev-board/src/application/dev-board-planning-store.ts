import type { TenantTransaction } from "@opzava/adapters";

import type { DevTicketLane, OriginKind, ReadyState } from "../domain/dev-ticket.js";
import type { BlockingAssessment, ProposalLifecycleState } from "../domain/proposal.js";

export interface ProposalRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly lifecycleState: ProposalLifecycleState;
  readonly archivedAt: Date | null;
  readonly discoverySummary: string;
  readonly blockingAssessment: BlockingAssessment;
  readonly suggestedContract: Readonly<Record<string, unknown>>;
  readonly createdCommandId: string;
  readonly acceptedCommandId: string | null;
  readonly acceptedDevTicketId: string | null;
}

export interface DevTicketRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly originKind: OriginKind;
  readonly sourceProposalId: string | null;
  readonly lane: DevTicketLane;
  readonly archivedAt: Date | null;
  readonly humanOwnerUserId: string;
  readonly readyContractVersion: number;
  readonly readyContractContent: Readonly<Record<string, unknown>>;
  readonly readyContractContentHash: string;
  readonly readyState: ReadyState;
  readonly readyApprovalContractVersion: number | null;
  readonly readyApprovalContentHash: string | null;
  readonly readyApprovedByUserId: string | null;
  readonly readyApprovalCommandId: string | null;
  readonly todoRank: number | null;
  readonly createdCommandId: string;
}

export interface InsertProposalInput {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly discoverySummary: string;
  readonly blockingAssessment: BlockingAssessment;
  readonly suggestedContract: Readonly<Record<string, unknown>>;
  readonly createdCommandId: string;
}

export interface UpdateProposalInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly expectedVersion: number;
  readonly lifecycleState: ProposalLifecycleState;
  readonly acceptedCommandId: string | null;
  readonly acceptedDevTicketId: string | null;
}

export interface InsertDevTicketInput {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly originKind: OriginKind;
  readonly sourceProposalId: string | null;
  readonly humanOwnerUserId: string;
  readonly readyContractContent: Readonly<Record<string, unknown>>;
  readonly readyContractContentHash: string;
  readonly createdCommandId: string;
}

export interface UpdateDevTicketForReadyApprovalInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly devTicketId: string;
  readonly expectedVersion: number;
  readonly readyContractVersion: number;
  readonly readyContractContent: Readonly<Record<string, unknown>>;
  readonly readyContractContentHash: string;
  readonly readyApprovedByUserId: string;
  readonly readyApprovalCommandId: string;
}

export interface DevBoardPlanningStore {
  selectProposalForUpdate(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    proposalId: string,
  ): Promise<ProposalRow | null>;
  insertProposal(tx: TenantTransaction, input: InsertProposalInput): Promise<ProposalRow>;
  updateProposal(tx: TenantTransaction, input: UpdateProposalInput): Promise<ProposalRow | null>;
  selectDevTicketForUpdate(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    ticketId: string,
  ): Promise<DevTicketRow | null>;
  insertDevTicket(tx: TenantTransaction, input: InsertDevTicketInput): Promise<DevTicketRow>;
  updateDevTicketForReadyApproval(
    tx: TenantTransaction,
    input: UpdateDevTicketForReadyApprovalInput,
  ): Promise<DevTicketRow | null>;
}
