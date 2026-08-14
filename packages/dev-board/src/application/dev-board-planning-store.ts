import type { TenantTransaction } from "@opzava/adapters";
import type { Result } from "@opzava/shared-kernel";

import type { DevTicketLane, OriginKind, ReadyState } from "../domain/dev-ticket.js";
import type { ChangeRisk, DevTicketType, Priority, Severity, WorkArea } from "../domain/classification.js";
import type { BlockingAssessment, ProposalLifecycleState } from "../domain/proposal.js";

export interface ProposalRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly lifecycleState: ProposalLifecycleState;
  readonly archivedAt: Date | null;
  readonly archivedByUserId: string | null;
  readonly archivedReason: string | null;
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
  readonly archivedByUserId: string | null;
  readonly archivedReason: string | null;
  readonly lastActiveLane: DevTicketLane | null;
  readonly humanOwnerUserId: string;
  readonly devTicketType: DevTicketType | null;
  readonly workAreas: readonly WorkArea[];
  readonly priority: Priority | null;
  readonly severity: Severity | null;
  readonly declaredChangeRisk: ChangeRisk | null;
  readonly minimumChangeRisk: ChangeRisk | null;
  readonly changeRiskPolicyVersion: string | null;
  readonly changeRiskPolicyHash: string | null;
  readonly readyContractVersion: number;
  readonly readyContractContent: Readonly<Record<string, unknown>>;
  readonly readyContractContentHash: string;
  readonly readyState: ReadyState;
  readonly readyApprovalContractVersion: number | null;
  readonly readyApprovalContentHash: string | null;
  readonly readyApprovedByUserId: string | null;
  readonly readyApprovalCommandId: string | null;
  readonly createdCommandId: string;
}

export interface ArchivedDevTicketProjection {
  readonly recordClass: "archived_dev_ticket";
  readonly devTicketId: string;
  readonly lastActiveLane: DevTicketLane | null;
  readonly archivedAt: Date;
  readonly archivedByUserId: string | null;
  readonly archivedReason: string | null;
  readonly activityAggregateId: string;
  readonly planningAggregateId: string;
}

export interface ArchivedProposalProjection {
  readonly recordClass: "archived_proposal";
  readonly proposalId: string;
  readonly archivedAt: Date;
  readonly archivedByUserId: string | null;
  readonly archivedReason: string | null;
  readonly activityAggregateId: string;
  readonly planningAggregateId: string;
}

export interface LaneQueueHeaderRow {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly lane: "todo";
  readonly version: number;
}

export interface TodoQueueMembershipRow {
  readonly devTicketId: string;
  readonly rank: bigint;
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
  /** Archive provenance is only changed by archive/restore commands. */
  readonly archivedByUserId?: string | null;
  readonly archivedReason?: string | null;
}

export interface ArchiveDevTicketInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly devTicketId: string;
  readonly expectedVersion: number;
  readonly archivedByUserId: string;
  readonly archivedReason: string;
}

export interface RestoreDevTicketInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly devTicketId: string;
  readonly expectedVersion: number;
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
export interface UpdateDevTicketClassificationInput {
  readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number;
  readonly humanOwnerUserId: string; readonly devTicketType: DevTicketType; readonly workAreas: readonly WorkArea[];
  readonly priority: Priority; readonly severity: Severity | null; readonly declaredChangeRisk: ChangeRisk;
  readonly minimumChangeRisk: ChangeRisk; readonly changeRiskPolicyVersion: string; readonly changeRiskPolicyHash: string;
  readonly readyContractContent: Readonly<Record<string, unknown>>; readonly readyContractContentHash: string;
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
  /** Queue-header serialization makes this safe for anchor-version observation without a row lock. */
  selectDevTicket(
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
  updateDevTicketClassification(tx: TenantTransaction, input: UpdateDevTicketClassificationInput): Promise<DevTicketRow | null>;
  /** One statement clears every current Ready-approval field while moving the archive overlay to Backlog. */
  archiveDevTicket(tx: TenantTransaction, input: ArchiveDevTicketInput): Promise<DevTicketRow | null>;
  restoreDevTicket(tx: TenantTransaction, input: RestoreDevTicketInput): Promise<DevTicketRow | null>;
  isActiveMember(tx: TenantTransaction, organizationId: string, userId: string): Promise<boolean>;
  hasOrganizationRole(tx: TenantTransaction, organizationId: string, userId: string, roleKey: "owner" | "admin"): Promise<boolean>;
  hasActiveDependencies(tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<boolean>;
  bumpDevTicketVersion(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number },
  ): Promise<DevTicketRow | null>;
  /** Creates the Todo header on demand, then holds its row lock through the transaction. */
  getOrLockTodoQueueHeader(tx: TenantTransaction, organizationId: string, workspaceId: string): Promise<LaneQueueHeaderRow>;
  casBumpTodoQueueVersion(tx: TenantTransaction, organizationId: string, workspaceId: string, expectedVersion: number): Promise<LaneQueueHeaderRow | null>;
  todoQueueMembership(tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<TodoQueueMembershipRow | null>;
  insertTodoQueueMembership(tx: TenantTransaction, input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly rank: bigint }): Promise<void>;
  updateTodoQueueMembershipRank(tx: TenantTransaction, input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly rank: bigint }): Promise<boolean>;
  deleteTodoQueueMembership(tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<boolean>;
  /** Stable committed order: rank, then DevTicket UUID. */
  listTodoQueueRanks(tx: TenantTransaction, organizationId: string, workspaceId: string): Promise<readonly TodoQueueMembershipRow[]>;
  rebalanceTodoBand(tx: TenantTransaction, organizationId: string, workspaceId: string, orderedDevTicketIds: readonly string[]): Promise<void>;
  /**
   * Canonical mutation lock order: affected DevTicket rows (UUID sorted), dependency graph
   * advisory lock, then lane queue header/membership rows. Queue-only reorders take ticket then
   * queue locks; Ready admission takes ticket then header.
   */
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
  /** Active edges for which this ticket is the blocker; archive must not strand dependents. */
  selectActiveBlockerEdges(tx: TenantTransaction, organizationId: string, workspaceId: string, blockerDevTicketId: string): Promise<readonly DependencyEdgeRow[]>;
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
  listArchivedDevTickets(tx: TenantTransaction, organizationId: string, workspaceId: string): Promise<readonly ArchivedDevTicketProjection[]>;
  listArchivedProposals(tx: TenantTransaction, organizationId: string, workspaceId: string): Promise<readonly ArchivedProposalProjection[]>;
}
