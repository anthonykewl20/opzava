import type { TenantTransaction } from "@opzava/adapters";
import type { Result } from "@opzava/shared-kernel";

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

export interface DependencyEdgeRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly dependentDevTicketId: string;
  readonly blockerDevTicketId: string;
  readonly lifecycleState: "active" | "retired";
  readonly createdCommandId: string;
  readonly retiredCommandId: string | null;
}

export interface DependencyLockStatus {
  readonly locked: boolean;
  readonly blockers: readonly { readonly devTicketId: string; readonly done: boolean }[];
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
  /** Undefined preserves the overlay; a date applies an archive overlay. */
  readonly archivedAt?: Date | null;
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

export interface InsertDependencyEdgeInput {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly dependentDevTicketId: string;
  readonly blockerDevTicketId: string;
  readonly createdCommandId: string;
}

export interface DevBoardPlanningStore {
  /**
   * Runs a persistence operation behind a transaction savepoint where the adapter supports one.
   * Constraint failures are returned as stable domain errors so the reserved receipt can be
   * finalized instead of losing the entire transaction and retrying forever.
   */
  executeRiskyMutation<T>(
    tx: TenantTransaction,
    mutation: () => Promise<T>,
  ): Promise<Result<T>>;
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
  /** Serializes all graph traversals and mutations for one workspace transaction. */
  lockDependencyGraph(tx: TenantTransaction, workspaceId: string): Promise<void>;
  selectDependencyEdge(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    edgeId: string,
  ): Promise<DependencyEdgeRow | null>;
  selectActiveDependencyEdge(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    dependentDevTicketId: string,
    blockerDevTicketId: string,
  ): Promise<DependencyEdgeRow | null>;
  dependencyCreatesCycle(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    dependentDevTicketId: string,
    blockerDevTicketId: string,
  ): Promise<boolean>;
  insertDependencyEdge(tx: TenantTransaction, input: InsertDependencyEdgeInput): Promise<DependencyEdgeRow>;
  retireDependencyEdge(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly edgeId: string; readonly expectedVersion: number; readonly retiredCommandId: string },
  ): Promise<DependencyEdgeRow | null>;
  /** Bumps the dependent version; Todo additionally loses Ready and returns to Backlog. */
  applyDependencyChangeToDependent(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number },
  ): Promise<DevTicketRow | null>;
  dependencyLockStatus(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    devTicketId: string,
  ): Promise<DependencyLockStatus>;
}
