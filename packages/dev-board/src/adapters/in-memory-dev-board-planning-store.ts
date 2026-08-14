import type { TenantTransaction } from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  DevBoardPlanningStore,
  DependencyEdgeRow,
  DependencyLockStatus,
  DevTicketRow,
  InsertDependencyEdgeInput,
  InsertDevTicketInput,
  InsertProposalInput,
  LaneQueueHeaderRow,
  ProposalRow,
  TodoQueueMembershipRow,
  UpdateDevTicketClassificationInput,
  UpdateDevTicketForReadyApprovalInput,
  UpdateProposalInput,
} from "../application/dev-board-planning-store.js";

function key(organizationId: string, workspaceId: string, id: string): string {
  return `${organizationId}:${workspaceId}:${id}`;
}

export class InMemoryDevBoardPlanningStore implements DevBoardPlanningStore {
  public readonly proposals = new Map<string, ProposalRow>();
  public readonly devTickets = new Map<string, DevTicketRow>();
  public readonly dependencyEdges = new Map<string, DependencyEdgeRow>();
  public readonly todoQueueHeaders = new Map<string, LaneQueueHeaderRow>();
  public readonly todoQueueMemberships = new Map<string, TodoQueueMembershipRow>();
  /** Deterministic authorization fixtures; production authorization is always DB-derived. */
  public readonly activeMembers = new Set<string>();
  public readonly organizationRoles = new Set<string>();

  public grantActiveMembership(organizationId: string, userId: string): void { this.activeMembers.add(`${organizationId}:${userId}`); }
  public grantOrganizationRole(organizationId: string, userId: string, role: "owner" | "admin"): void { this.organizationRoles.add(`${organizationId}:${userId}:${role}`); }

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

  public async selectDevTicket(
    _tx: TenantTransaction, organizationId: string, workspaceId: string, ticketId: string,
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
      devTicketType: null, workAreas: [], priority: null, severity: null, declaredChangeRisk: null,
      minimumChangeRisk: null, changeRiskPolicyVersion: null, changeRiskPolicyHash: null,
      readyContractVersion: 1,
      readyContractContent: input.readyContractContent,
      readyContractContentHash: input.readyContractContentHash,
      readyState: "draft",
      readyApprovalContractVersion: null,
      readyApprovalContentHash: null,
      readyApprovedByUserId: null,
      readyApprovalCommandId: null,
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
    };
    this.devTickets.set(mapKey, row);
    return row;
  }

  public async updateDevTicketClassification(_tx: TenantTransaction, input: UpdateDevTicketClassificationInput): Promise<DevTicketRow | null> {
    const mapKey = key(input.organizationId, input.workspaceId, input.devTicketId);
    const current = this.devTickets.get(mapKey);
    if (current === undefined || current.version !== input.expectedVersion) return null;
    const row: DevTicketRow = { ...current, version: current.version + 1, humanOwnerUserId: input.humanOwnerUserId,
      devTicketType: input.devTicketType, workAreas: [...input.workAreas], priority: input.priority, severity: input.severity,
      declaredChangeRisk: input.declaredChangeRisk, minimumChangeRisk: input.minimumChangeRisk,
      changeRiskPolicyVersion: input.changeRiskPolicyVersion, changeRiskPolicyHash: input.changeRiskPolicyHash,
      readyContractVersion: current.readyContractVersion + 1, readyContractContent: input.readyContractContent,
      readyContractContentHash: input.readyContractContentHash };
    this.devTickets.set(mapKey, row);
    return row;
  }

  public async isActiveMember(_tx: TenantTransaction, organizationId: string, userId: string): Promise<boolean> { return this.activeMembers.has(`${organizationId}:${userId}`); }
  public async hasOrganizationRole(_tx: TenantTransaction, organizationId: string, userId: string, roleKey: "owner" | "admin"): Promise<boolean> { return this.organizationRoles.has(`${organizationId}:${userId}:${roleKey}`); }
  public async hasActiveDependencies(_tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<boolean> {
    return [...this.dependencyEdges.values()].some((edge) => edge.organizationId === organizationId && edge.workspaceId === workspaceId && edge.dependentDevTicketId === devTicketId && edge.lifecycleState === "active");
  }

  public async bumpDevTicketVersion(
    _tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number },
  ): Promise<DevTicketRow | null> {
    const mapKey = key(input.organizationId, input.workspaceId, input.devTicketId);
    const current = this.devTickets.get(mapKey);
    if (current === undefined || current.version !== input.expectedVersion) return null;
    const row = { ...current, version: current.version + 1 };
    this.devTickets.set(mapKey, row);
    return row;
  }

  public async getOrLockTodoQueueHeader(_tx: TenantTransaction, organizationId: string, workspaceId: string): Promise<LaneQueueHeaderRow> {
    const mapKey = key(organizationId, workspaceId, "todo");
    const current = this.todoQueueHeaders.get(mapKey);
    if (current !== undefined) return current;
    const header: LaneQueueHeaderRow = { organizationId, workspaceId, lane: "todo", version: 1 };
    this.todoQueueHeaders.set(mapKey, header);
    return header;
  }

  public async casBumpTodoQueueVersion(_tx: TenantTransaction, organizationId: string, workspaceId: string, expectedVersion: number): Promise<LaneQueueHeaderRow | null> {
    const mapKey = key(organizationId, workspaceId, "todo");
    const current = this.todoQueueHeaders.get(mapKey);
    if (current === undefined || current.version !== expectedVersion) return null;
    const header = { ...current, version: current.version + 1 };
    this.todoQueueHeaders.set(mapKey, header);
    return header;
  }

  public async todoQueueMembership(_tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<TodoQueueMembershipRow | null> {
    return this.todoQueueMemberships.get(key(organizationId, workspaceId, devTicketId)) ?? null;
  }

  public async insertTodoQueueMembership(_tx: TenantTransaction, input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly rank: bigint }): Promise<void> {
    const mapKey = key(input.organizationId, input.workspaceId, input.devTicketId);
    if (this.todoQueueMemberships.has(mapKey)) throw { code: "23505" };
    this.todoQueueMemberships.set(mapKey, { devTicketId: input.devTicketId, rank: input.rank });
  }

  public async updateTodoQueueMembershipRank(_tx: TenantTransaction, input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly rank: bigint }): Promise<boolean> {
    const mapKey = key(input.organizationId, input.workspaceId, input.devTicketId);
    if (!this.todoQueueMemberships.has(mapKey)) return false;
    this.todoQueueMemberships.set(mapKey, { devTicketId: input.devTicketId, rank: input.rank });
    return true;
  }

  public async deleteTodoQueueMembership(_tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<boolean> {
    return this.todoQueueMemberships.delete(key(organizationId, workspaceId, devTicketId));
  }

  public async listTodoQueueRanks(_tx: TenantTransaction, organizationId: string, workspaceId: string): Promise<readonly TodoQueueMembershipRow[]> {
    return [...this.todoQueueMemberships.entries()]
      .filter(([mapKey]) => mapKey.startsWith(`${organizationId}:${workspaceId}:`))
      .map(([, row]) => row)
      .sort((left, right) => left.rank === right.rank ? left.devTicketId.localeCompare(right.devTicketId) : left.rank < right.rank ? -1 : 1);
  }

  public async rebalanceTodoBand(tx: TenantTransaction, organizationId: string, workspaceId: string, orderedDevTicketIds: readonly string[]): Promise<void> {
    for (const [index, devTicketId] of orderedDevTicketIds.entries()) {
      await this.updateTodoQueueMembershipRank(tx, {
        organizationId, workspaceId, devTicketId, rank: (BigInt(index) + 2n) * 1_000_000n,
      });
    }
  }

  public async lockDependencyGraph(tx: TenantTransaction, workspaceId: string): Promise<void> {
    void tx;
    void workspaceId;
  }

  public async selectDependencyEdge(
    _tx: TenantTransaction, organizationId: string, workspaceId: string, edgeId: string,
  ): Promise<DependencyEdgeRow | null> {
    return this.dependencyEdges.get(key(organizationId, workspaceId, edgeId)) ?? null;
  }

  public async selectActiveDependencyEdge(
    _tx: TenantTransaction, organizationId: string, workspaceId: string,
    dependentDevTicketId: string, blockerDevTicketId: string,
  ): Promise<DependencyEdgeRow | null> {
    return [...this.dependencyEdges.values()].find((edge) =>
      edge.organizationId === organizationId && edge.workspaceId === workspaceId &&
      edge.dependentDevTicketId === dependentDevTicketId && edge.blockerDevTicketId === blockerDevTicketId &&
      edge.lifecycleState === "active",
    ) ?? null;
  }

  public async dependencyCreatesCycle(
    _tx: TenantTransaction, organizationId: string, workspaceId: string,
    dependentDevTicketId: string, blockerDevTicketId: string,
  ): Promise<boolean> {
    const seen = new Set<string>();
    const visit = (ticketId: string): boolean => {
      if (ticketId === dependentDevTicketId) return true;
      if (seen.has(ticketId)) return false;
      seen.add(ticketId);
      return [...this.dependencyEdges.values()].some((edge) =>
        edge.organizationId === organizationId && edge.workspaceId === workspaceId &&
        edge.lifecycleState === "active" && edge.dependentDevTicketId === ticketId && visit(edge.blockerDevTicketId),
      );
    };
    return visit(blockerDevTicketId);
  }

  public async insertDependencyEdge(
    _tx: TenantTransaction, input: InsertDependencyEdgeInput,
  ): Promise<DependencyEdgeRow> {
    if (input.dependentDevTicketId === input.blockerDevTicketId ||
      await this.selectActiveDependencyEdge(_tx, input.organizationId, input.workspaceId, input.dependentDevTicketId, input.blockerDevTicketId) !== null) {
      throw { code: "23505" };
    }
    if (this.devTickets.get(key(input.organizationId, input.workspaceId, input.dependentDevTicketId)) === undefined ||
      this.devTickets.get(key(input.organizationId, input.workspaceId, input.blockerDevTicketId)) === undefined) {
      throw { code: "23503" };
    }
    const row: DependencyEdgeRow = {
      id: input.id, organizationId: input.organizationId, workspaceId: input.workspaceId, version: 1,
      dependentDevTicketId: input.dependentDevTicketId, blockerDevTicketId: input.blockerDevTicketId,
      lifecycleState: "active", createdCommandId: input.createdCommandId, retiredCommandId: null,
    };
    this.dependencyEdges.set(key(input.organizationId, input.workspaceId, input.id), row);
    return row;
  }

  public async retireDependencyEdge(
    _tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly edgeId: string; readonly expectedVersion: number; readonly retiredCommandId: string },
  ): Promise<DependencyEdgeRow | null> {
    const mapKey = key(input.organizationId, input.workspaceId, input.edgeId);
    const current = this.dependencyEdges.get(mapKey);
    if (current === undefined || current.lifecycleState !== "active" || current.version !== input.expectedVersion) return null;
    const row = { ...current, lifecycleState: "retired" as const, version: current.version + 1, retiredCommandId: input.retiredCommandId };
    this.dependencyEdges.set(mapKey, row);
    return row;
  }

  public async applyDependencyChangeToDependent(
    _tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number },
  ): Promise<DevTicketRow | null> {
    const mapKey = key(input.organizationId, input.workspaceId, input.devTicketId);
    const current = this.devTickets.get(mapKey);
    if (current === undefined || current.version !== input.expectedVersion) return null;
    const todo = current.lane === "todo";
    const row: DevTicketRow = {
      ...current, version: current.version + 1,
      ...(todo ? {
        lane: "backlog", readyState: "draft", readyApprovalContractVersion: null,
        readyApprovalContentHash: null, readyApprovedByUserId: null, readyApprovalCommandId: null,
      } : {}),
    };
    this.devTickets.set(mapKey, row);
    return row;
  }

  public async dependencyLockStatus(
    _tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string,
  ): Promise<DependencyLockStatus> {
    const blockers = [...this.dependencyEdges.values()]
      .filter((edge) => edge.organizationId === organizationId && edge.workspaceId === workspaceId && edge.dependentDevTicketId === devTicketId && edge.lifecycleState === "active")
      .map((edge) => ({
        devTicketId: edge.blockerDevTicketId,
        done: this.devTickets.get(key(organizationId, workspaceId, edge.blockerDevTicketId))?.lane === "done",
      }));
    return { locked: blockers.some((blocker) => !blocker.done), blockers };
  }
}
