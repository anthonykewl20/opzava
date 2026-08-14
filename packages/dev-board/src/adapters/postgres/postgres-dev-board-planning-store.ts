import { sql } from "drizzle-orm";
import { rowsFromExecuteResult, type QueryRow, type TenantTransaction } from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type {
  DevBoardPlanningStore,
  DependencyEdgeRow,
  DependencyLockStatus,
  ArchivedDevTicketProjection,
  ArchivedProposalProjection,
  ArchiveDevTicketInput,
  DevTicketRow,
  InsertDependencyEdgeInput,
  InsertDevTicketInput,
  InsertProposalInput,
  LaneQueueHeaderRow,
  ProposalRow,
  TodoQueueMembershipRow,
  UpdateDevTicketClassificationInput,
  UpdateDevTicketForReadyApprovalInput,
  RestoreDevTicketInput,
  UpdateProposalInput,
} from "../../application/dev-board-planning-store.js";
import type { DevTicketLane, OriginKind, ReadyState } from "../../domain/dev-ticket.js";
import type { ChangeRisk, DevTicketType, Priority, Severity, WorkArea } from "../../domain/classification.js";
import type { BlockingAssessment, ProposalLifecycleState } from "../../domain/proposal.js";

function number(value: unknown): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Dev Board row contained an invalid integer.");
  return result;
}

function bigint(value: unknown): bigint {
  try {
    const result = typeof value === "bigint" ? value : BigInt(String(value));
    if (result <= 0n) throw new Error();
    return result;
  } catch {
    throw new Error("Dev Board row contained an invalid positive bigint.");
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Dev Board row contained invalid JSON content.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function nullableDate(value: unknown): Date | null {
  if (value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new Error("Dev Board row contained an invalid timestamp.");
}

const sqlStatePattern = /^[0-9A-Z]{5}$/;

function sqlState(error: unknown): string | undefined {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const code = (current as { readonly code?: unknown }).code;
    if (typeof code === "string" && sqlStatePattern.test(code)) return code;
    current = (current as { readonly cause?: unknown }).cause;
  }
  return undefined;
}

function proposal(row: QueryRow): ProposalRow {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    version: number(row["version"]),
    lifecycleState: row["lifecycle_state"] as ProposalLifecycleState,
    archivedAt: nullableDate(row["archived_at"]),
    archivedByUserId: typeof row["archived_by_user_id"] === "string" ? row["archived_by_user_id"] : null,
    archivedReason: typeof row["archived_reason"] === "string" ? row["archived_reason"] : null,
    discoverySummary: String(row["discovery_summary"]),
    blockingAssessment: row["blocking_assessment"] as BlockingAssessment,
    suggestedContract: record(row["suggested_contract"]),
    createdCommandId: String(row["created_command_id"]),
    acceptedCommandId:
      typeof row["accepted_command_id"] === "string" ? row["accepted_command_id"] : null,
    acceptedDevTicketId:
      typeof row["accepted_dev_ticket_id"] === "string" ? row["accepted_dev_ticket_id"] : null,
  };
}

function ticket(row: QueryRow): DevTicketRow {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    version: number(row["version"]),
    originKind: row["origin_kind"] as OriginKind,
    sourceProposalId:
      typeof row["source_proposal_id"] === "string" ? row["source_proposal_id"] : null,
    lane: row["lane"] as DevTicketLane,
    archivedAt: nullableDate(row["archived_at"]),
    archivedByUserId: typeof row["archived_by_user_id"] === "string" ? row["archived_by_user_id"] : null,
    archivedReason: typeof row["archived_reason"] === "string" ? row["archived_reason"] : null,
    lastActiveLane: row["last_active_lane"] === null ? null : row["last_active_lane"] as DevTicketLane,
    humanOwnerUserId: String(row["human_owner_user_id"]),
    devTicketType: row["dev_ticket_type"] as DevTicketType | null,
    workAreas: Array.isArray(row["work_areas"]) ? row["work_areas"].map(String) as WorkArea[] : [],
    priority: row["priority"] as Priority | null,
    severity: row["severity"] as Severity | null,
    declaredChangeRisk: row["declared_change_risk"] as ChangeRisk | null,
    minimumChangeRisk: row["minimum_change_risk"] as ChangeRisk | null,
    changeRiskPolicyVersion: typeof row["change_risk_policy_version"] === "string" ? row["change_risk_policy_version"] : null,
    changeRiskPolicyHash: typeof row["change_risk_policy_hash"] === "string" ? row["change_risk_policy_hash"] : null,
    readyContractVersion: number(row["ready_contract_version"]),
    readyContractContent: record(row["ready_contract_content"]),
    readyContractContentHash: String(row["ready_contract_content_hash"]),
    readyState: row["ready_state"] as ReadyState,
    readyApprovalContractVersion:
      row["ready_approval_contract_version"] === null
        ? null
        : number(row["ready_approval_contract_version"]),
    readyApprovalContentHash:
      typeof row["ready_approval_content_hash"] === "string"
        ? row["ready_approval_content_hash"]
        : null,
    readyApprovedByUserId:
      typeof row["ready_approved_by_user_id"] === "string"
        ? row["ready_approved_by_user_id"]
        : null,
    readyApprovalCommandId:
      typeof row["ready_approval_command_id"] === "string"
        ? row["ready_approval_command_id"]
        : null,
    createdCommandId: String(row["created_command_id"]),
  };
}

function edge(row: QueryRow): DependencyEdgeRow {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    version: number(row["version"]),
    dependentDevTicketId: String(row["dependent_dev_ticket_id"]),
    blockerDevTicketId: String(row["blocker_dev_ticket_id"]),
    lifecycleState: row["lifecycle_state"] as "active" | "retired",
    createdCommandId: String(row["created_command_id"]),
    retiredCommandId: typeof row["retired_command_id"] === "string" ? row["retired_command_id"] : null,
  };
}

const proposalColumns = sql`id, organization_id, workspace_id, version, lifecycle_state, archived_at,
  archived_by_user_id, archived_reason,
  discovery_summary, blocking_assessment, suggested_contract, created_command_id, accepted_command_id,
  accepted_dev_ticket_id`;
const ticketColumns = sql`t.id, t.organization_id, t.workspace_id, t.version, t.origin_kind, t.source_proposal_id,
  t.lane, t.archived_at, t.archived_by_user_id, t.archived_reason, t.last_active_lane, t.human_owner_user_id, t.dev_ticket_type, t.priority, t.severity, t.declared_change_risk, t.minimum_change_risk, t.change_risk_policy_version, t.change_risk_policy_hash,
  coalesce((select array_agg(wa.work_area order by wa.work_area) from public.dev_board_dev_ticket_work_area wa where wa.organization_id = t.organization_id and wa.workspace_id = t.workspace_id and wa.dev_ticket_id = t.id), array[]::text[]) as work_areas, t.ready_contract_version, t.ready_contract_content,
  t.ready_contract_content_hash, t.ready_state, t.ready_approval_contract_version,
  t.ready_approval_content_hash, t.ready_approved_by_user_id, t.ready_approval_command_id,
    t.created_command_id`;
const edgeColumns = sql`id, organization_id, workspace_id, version, dependent_dev_ticket_id,
  blocker_dev_ticket_id, lifecycle_state, created_command_id, retired_command_id`;

export class PostgresDevBoardPlanningStore implements DevBoardPlanningStore {
  public async executeRiskyMutation<T>(
    tx: TenantTransaction,
    mutation: () => Promise<T>,
  ): Promise<Result<T>> {
    await tx.execute(sql.raw("savepoint dev_board_risky_mutation"));
    try {
      const value = await mutation();
      await tx.execute(sql.raw("release savepoint dev_board_risky_mutation"));
      return ok(value);
    } catch (error) {
      try {
        await tx.execute(sql.raw("rollback to savepoint dev_board_risky_mutation"));
      } catch {
        // Preserve the mutation failure: cleanup errors cannot change its disposition.
      }
      try {
        await tx.execute(sql.raw("release savepoint dev_board_risky_mutation"));
      } catch {
        // Preserve the mutation failure: cleanup errors cannot change its disposition.
      }
      const code = sqlState(error);
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
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    proposalId: string,
  ): Promise<ProposalRow | null> {
    const result = await tx.execute(sql`
      select ${proposalColumns} from public.dev_board_proposal
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${proposalId}::uuid
      for update
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : proposal(row);
  }

  public async insertProposal(
    tx: TenantTransaction,
    input: InsertProposalInput,
  ): Promise<ProposalRow> {
    const result = await tx.execute(sql`
      insert into public.dev_board_proposal (
        id, organization_id, workspace_id, lifecycle_state, discovery_summary, blocking_assessment,
        suggested_contract, created_command_id
      ) values (
        ${input.id}::uuid, ${input.organizationId}::uuid, ${input.workspaceId}::uuid, 'draft',
        ${input.discoverySummary}, ${input.blockingAssessment}, ${JSON.stringify(input.suggestedContract)}::jsonb,
        ${input.createdCommandId}::uuid
      ) returning ${proposalColumns}
    `);
    const row = rowsFromExecuteResult(result)[0];
    if (row === undefined) throw new Error("Proposal insert returned no row.");
    return proposal(row);
  }

  public async updateProposal(
    tx: TenantTransaction,
    input: UpdateProposalInput,
  ): Promise<ProposalRow | null> {
    const archivedAt = input.archivedAt === undefined ? sql`archived_at` : sql`${input.archivedAt}`;
    const archivedByUserId = input.archivedByUserId === undefined ? sql`archived_by_user_id` : sql`${input.archivedByUserId}`;
    const archivedReason = input.archivedReason === undefined ? sql`archived_reason` : sql`${input.archivedReason}`;
    const result = await tx.execute(sql`
      update public.dev_board_proposal
      set lifecycle_state = ${input.lifecycleState}, accepted_command_id = ${input.acceptedCommandId}::uuid,
        accepted_dev_ticket_id = ${input.acceptedDevTicketId}::uuid, archived_at = ${archivedAt},
        archived_by_user_id = ${archivedByUserId}, archived_reason = ${archivedReason},
        version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.proposalId}::uuid and version = ${input.expectedVersion}
      returning ${proposalColumns}
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : proposal(row);
  }

  public async selectDevTicketForUpdate(
    tx: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    ticketId: string,
  ): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      select ${ticketColumns} from public.dev_board_dev_ticket t
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${ticketId}::uuid
      for update
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : ticket(row);
  }

  public async selectDevTicket(
    tx: TenantTransaction, organizationId: string, workspaceId: string, ticketId: string,
  ): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      select ${ticketColumns} from public.dev_board_dev_ticket t
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${ticketId}::uuid
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : ticket(row);
  }

  public async insertDevTicket(
    tx: TenantTransaction,
    input: InsertDevTicketInput,
  ): Promise<DevTicketRow> {
    const result = await tx.execute(sql`
      insert into public.dev_board_dev_ticket (
        id, organization_id, workspace_id, origin_kind, source_proposal_id, lane, human_owner_user_id,
        ready_contract_content, ready_contract_content_hash, created_command_id
      ) values (
        ${input.id}::uuid, ${input.organizationId}::uuid, ${input.workspaceId}::uuid,
        ${input.originKind}, ${input.sourceProposalId}::uuid, 'backlog', ${input.humanOwnerUserId},
        ${JSON.stringify(input.readyContractContent)}::jsonb, ${input.readyContractContentHash},
        ${input.createdCommandId}::uuid
      ) returning id
    `);
    const row = rowsFromExecuteResult(result)[0]; if (row === undefined) throw new Error("DevTicket insert returned no row.");
    const inserted = await this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, String(row["id"])); if (inserted === null) throw new Error("DevTicket insert could not be read."); return inserted;
  }

  public async updateDevTicketForReadyApproval(
    tx: TenantTransaction,
    input: UpdateDevTicketForReadyApprovalInput,
  ): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket
      set ready_contract_version = ${input.readyContractVersion},
        ready_contract_content = ${JSON.stringify(input.readyContractContent)}::jsonb,
        ready_contract_content_hash = ${input.readyContractContentHash}, ready_state = 'approved',
        ready_approval_contract_version = ${input.readyContractVersion},
        ready_approval_content_hash = ${input.readyContractContentHash},
        ready_approved_by_user_id = ${input.readyApprovedByUserId}, ready_approved_at = now(),
        ready_approval_command_id = ${input.readyApprovalCommandId}::uuid, lane = 'todo',
        version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion}
      returning id
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, input.devTicketId);
  }

  public async updateDevTicketClassification(tx: TenantTransaction, input: UpdateDevTicketClassificationInput): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket set human_owner_user_id = ${input.humanOwnerUserId}, dev_ticket_type = ${input.devTicketType}, priority = ${input.priority}, severity = ${input.severity}, declared_change_risk = ${input.declaredChangeRisk}, minimum_change_risk = ${input.minimumChangeRisk}, change_risk_policy_version = ${input.changeRiskPolicyVersion}, change_risk_policy_hash = ${input.changeRiskPolicyHash}, ready_contract_version = ready_contract_version + 1, ready_contract_content = ${JSON.stringify(input.readyContractContent)}::jsonb, ready_contract_content_hash = ${input.readyContractContentHash}, version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion} returning id
    `);
    if (rowsFromExecuteResult(result)[0] === undefined) return null;
    await tx.execute(sql`delete from public.dev_board_dev_ticket_work_area where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid and dev_ticket_id = ${input.devTicketId}::uuid`);
    for (const workArea of input.workAreas) await tx.execute(sql`insert into public.dev_board_dev_ticket_work_area (organization_id, workspace_id, dev_ticket_id, work_area) values (${input.organizationId}::uuid, ${input.workspaceId}::uuid, ${input.devTicketId}::uuid, ${workArea})`);
    return this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, input.devTicketId);
  }

  public async archiveDevTicket(tx: TenantTransaction, input: ArchiveDevTicketInput): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket
      set archived_at = now(), archived_by_user_id = ${input.archivedByUserId}, archived_reason = ${input.archivedReason},
        last_active_lane = lane, lane = 'backlog', ready_state = 'draft',
        ready_approval_contract_version = null, ready_approval_content_hash = null,
        ready_approved_by_user_id = null, ready_approved_at = null, ready_approval_command_id = null,
        version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion} and archived_at is null
      returning id
    `);
    return rowsFromExecuteResult(result)[0] === undefined ? null : this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, input.devTicketId);
  }

  public async restoreDevTicket(tx: TenantTransaction, input: RestoreDevTicketInput): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket
      set archived_at = null, archived_by_user_id = null, archived_reason = null,
        lane = 'backlog', ready_state = 'draft',
        ready_approval_contract_version = null, ready_approval_content_hash = null,
        ready_approved_by_user_id = null, ready_approved_at = null, ready_approval_command_id = null,
        version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion} and archived_at is not null
      returning id
    `);
    return rowsFromExecuteResult(result)[0] === undefined ? null : this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, input.devTicketId);
  }

  public async isActiveMember(tx: TenantTransaction, organizationId: string, userId: string): Promise<boolean> { const result = await tx.execute(sql`select app.is_active_member(${organizationId}::uuid, ${userId}) as allowed`); return rowsFromExecuteResult(result)[0]?.["allowed"] === true; }
  public async hasOrganizationRole(tx: TenantTransaction, organizationId: string, userId: string, roleKey: "owner" | "admin"): Promise<boolean> { const result = await tx.execute(sql`select app.has_organization_role(${organizationId}::uuid, ${userId}, ${roleKey}) as allowed`); return rowsFromExecuteResult(result)[0]?.["allowed"] === true; }
  public async hasActiveDependencies(tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string): Promise<boolean> { const result = await tx.execute(sql`select exists(select 1 from public.dev_board_dependency_edge where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid and dependent_dev_ticket_id = ${devTicketId}::uuid and lifecycle_state = 'active') as active`); return rowsFromExecuteResult(result)[0]?.["active"] === true; }

  public async bumpDevTicketVersion(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number },
  ): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion}
      returning id
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, input.devTicketId);
  }

  public async getOrLockTodoQueueHeader(
    tx: TenantTransaction, organizationId: string, workspaceId: string,
  ): Promise<LaneQueueHeaderRow> {
    await tx.execute(sql`
      insert into public.dev_board_lane_queue_version (organization_id, workspace_id, lane)
      values (${organizationId}::uuid, ${workspaceId}::uuid, 'todo') on conflict do nothing
    `);
    const result = await tx.execute(sql`
      select organization_id, workspace_id, lane, version
      from public.dev_board_lane_queue_version
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid and lane = 'todo'
      for update
    `);
    const row = rowsFromExecuteResult(result)[0];
    if (row === undefined) throw new Error("Todo lane queue header was not available.");
    return { organizationId: String(row["organization_id"]), workspaceId: String(row["workspace_id"]), lane: "todo", version: number(row["version"]) };
  }

  public async casBumpTodoQueueVersion(
    tx: TenantTransaction, organizationId: string, workspaceId: string, expectedVersion: number,
  ): Promise<LaneQueueHeaderRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_lane_queue_version set version = version + 1, updated_at = now()
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and lane = 'todo' and version = ${expectedVersion}
      returning organization_id, workspace_id, lane, version
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : { organizationId: String(row["organization_id"]), workspaceId: String(row["workspace_id"]), lane: "todo", version: number(row["version"]) };
  }

  public async todoQueueMembership(
    tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string,
  ): Promise<TodoQueueMembershipRow | null> {
    const result = await tx.execute(sql`
      select dev_ticket_id, rank from public.dev_board_lane_queue
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and lane = 'todo' and dev_ticket_id = ${devTicketId}::uuid for update
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : { devTicketId: String(row["dev_ticket_id"]), rank: bigint(row["rank"]) };
  }

  public async insertTodoQueueMembership(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly rank: bigint },
  ): Promise<void> {
    await tx.execute(sql`
      insert into public.dev_board_lane_queue (organization_id, workspace_id, lane, dev_ticket_id, rank)
      values (${input.organizationId}::uuid, ${input.workspaceId}::uuid, 'todo', ${input.devTicketId}::uuid, ${input.rank})
    `);
  }

  public async updateTodoQueueMembershipRank(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly rank: bigint },
  ): Promise<boolean> {
    const result = await tx.execute(sql`
      update public.dev_board_lane_queue set rank = ${input.rank}, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and lane = 'todo' and dev_ticket_id = ${input.devTicketId}::uuid returning dev_ticket_id
    `);
    return rowsFromExecuteResult(result).length === 1;
  }

  public async deleteTodoQueueMembership(
    tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string,
  ): Promise<boolean> {
    const result = await tx.execute(sql`
      delete from public.dev_board_lane_queue
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and lane = 'todo' and dev_ticket_id = ${devTicketId}::uuid returning dev_ticket_id
    `);
    return rowsFromExecuteResult(result).length === 1;
  }

  public async listTodoQueueRanks(
    tx: TenantTransaction, organizationId: string, workspaceId: string,
  ): Promise<readonly TodoQueueMembershipRow[]> {
    const result = await tx.execute(sql`
      select dev_ticket_id, rank from public.dev_board_lane_queue
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid and lane = 'todo'
      order by rank, dev_ticket_id for update
    `);
    return rowsFromExecuteResult(result).map((row) => ({ devTicketId: String(row["dev_ticket_id"]), rank: bigint(row["rank"]) }));
  }

  public async rebalanceTodoBand(
    tx: TenantTransaction, organizationId: string, workspaceId: string, orderedDevTicketIds: readonly string[],
  ): Promise<void> {
    for (const [index, devTicketId] of orderedDevTicketIds.entries()) {
      const updated = await this.updateTodoQueueMembershipRank(tx, {
        organizationId, workspaceId, devTicketId, rank: (BigInt(index) + 2n) * 1_000_000n,
      });
      if (!updated) throw new Error("Todo membership disappeared during rebalance.");
    }
  }

  public async lockDependencyGraph(tx: TenantTransaction, workspaceId: string): Promise<void> {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtext('dev_board_dependency_graph:' || ${workspaceId}))
    `);
  }

  public async selectDependencyEdge(
    tx: TenantTransaction, organizationId: string, workspaceId: string, edgeId: string,
  ): Promise<DependencyEdgeRow | null> {
    const result = await tx.execute(sql`
      select ${edgeColumns} from public.dev_board_dependency_edge
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${edgeId}::uuid
      for update
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : edge(row);
  }

  public async selectActiveDependencyEdge(
    tx: TenantTransaction, organizationId: string, workspaceId: string,
    dependentDevTicketId: string, blockerDevTicketId: string,
  ): Promise<DependencyEdgeRow | null> {
    const result = await tx.execute(sql`
      select ${edgeColumns} from public.dev_board_dependency_edge
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and dependent_dev_ticket_id = ${dependentDevTicketId}::uuid
        and blocker_dev_ticket_id = ${blockerDevTicketId}::uuid and lifecycle_state = 'active'
      limit 1
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : edge(row);
  }

  public async selectActiveBlockerEdges(
    tx: TenantTransaction, organizationId: string, workspaceId: string, blockerDevTicketId: string,
  ): Promise<readonly DependencyEdgeRow[]> {
    const result = await tx.execute(sql`
      select ${edgeColumns} from public.dev_board_dependency_edge
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and blocker_dev_ticket_id = ${blockerDevTicketId}::uuid and lifecycle_state = 'active'
      order by id
    `);
    return rowsFromExecuteResult(result).map(edge);
  }

  public async dependencyCreatesCycle(
    tx: TenantTransaction, organizationId: string, workspaceId: string,
    dependentDevTicketId: string, blockerDevTicketId: string,
  ): Promise<boolean> {
    const result = await tx.execute(sql`
      with recursive traversal(dev_ticket_id) as (
        select ${blockerDevTicketId}::uuid
        union
        select edge.blocker_dev_ticket_id
        from public.dev_board_dependency_edge edge
        join traversal on edge.dependent_dev_ticket_id = traversal.dev_ticket_id
        where edge.organization_id = ${organizationId}::uuid
          and edge.workspace_id = ${workspaceId}::uuid
          and edge.lifecycle_state = 'active'
      )
      select exists(select 1 from traversal where dev_ticket_id = ${dependentDevTicketId}::uuid) as creates_cycle
    `);
    return rowsFromExecuteResult(result)[0]?.["creates_cycle"] === true;
  }

  public async insertDependencyEdge(
    tx: TenantTransaction, input: InsertDependencyEdgeInput,
  ): Promise<DependencyEdgeRow> {
    const result = await tx.execute(sql`
      insert into public.dev_board_dependency_edge (
        id, organization_id, workspace_id, dependent_dev_ticket_id, blocker_dev_ticket_id, created_command_id
      ) values (
        ${input.id}::uuid, ${input.organizationId}::uuid, ${input.workspaceId}::uuid,
        ${input.dependentDevTicketId}::uuid, ${input.blockerDevTicketId}::uuid, ${input.createdCommandId}::uuid
      ) returning ${edgeColumns}
    `);
    const row = rowsFromExecuteResult(result)[0];
    if (row === undefined) throw new Error("Dependency edge insert returned no row.");
    return edge(row);
  }

  public async retireDependencyEdge(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly edgeId: string; readonly expectedVersion: number; readonly retiredCommandId: string },
  ): Promise<DependencyEdgeRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dependency_edge
      set lifecycle_state = 'retired', retired_command_id = ${input.retiredCommandId}::uuid,
        retired_at = now(), version = version + 1
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.edgeId}::uuid and lifecycle_state = 'active' and version = ${input.expectedVersion}
      returning ${edgeColumns}
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : edge(row);
  }

  public async applyDependencyChangeToDependent(
    tx: TenantTransaction,
    input: { readonly organizationId: string; readonly workspaceId: string; readonly devTicketId: string; readonly expectedVersion: number },
  ): Promise<DevTicketRow | null> {
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket
      set lane = case when lane = 'todo' then 'backlog' else lane end,
        ready_state = case when lane = 'todo' then 'draft' else ready_state end,
        ready_approval_contract_version = case when lane = 'todo' then null else ready_approval_contract_version end,
        ready_approval_content_hash = case when lane = 'todo' then null else ready_approval_content_hash end,
        ready_approved_by_user_id = case when lane = 'todo' then null else ready_approved_by_user_id end,
        ready_approved_at = case when lane = 'todo' then null else ready_approved_at end,
        ready_approval_command_id = case when lane = 'todo' then null else ready_approval_command_id end,
        version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion}
      returning id
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : this.selectDevTicketForUpdate(tx, input.organizationId, input.workspaceId, input.devTicketId);
  }

  public async dependencyLockStatus(
    tx: TenantTransaction, organizationId: string, workspaceId: string, devTicketId: string,
  ): Promise<DependencyLockStatus> {
    const result = await tx.execute(sql`
      select edge.blocker_dev_ticket_id as dev_ticket_id, (ticket.lane = 'done') as done
      from public.dev_board_dependency_edge edge
      join public.dev_board_dev_ticket ticket
        on ticket.id = edge.blocker_dev_ticket_id and ticket.organization_id = edge.organization_id
        and ticket.workspace_id = edge.workspace_id
      where edge.organization_id = ${organizationId}::uuid and edge.workspace_id = ${workspaceId}::uuid
        and edge.dependent_dev_ticket_id = ${devTicketId}::uuid and edge.lifecycle_state = 'active'
      order by edge.blocker_dev_ticket_id
    `);
    const blockers = rowsFromExecuteResult(result).map((row) => ({
      devTicketId: String(row["dev_ticket_id"]),
      done: row["done"] === true,
    }));
    return { locked: blockers.some((blocker) => !blocker.done), blockers };
  }

  public async listArchivedDevTickets(
    tx: TenantTransaction, organizationId: string, workspaceId: string,
  ): Promise<readonly ArchivedDevTicketProjection[]> {
    const result = await tx.execute(sql`
      select id, last_active_lane, archived_at, archived_by_user_id, archived_reason
      from public.dev_board_dev_ticket
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and archived_at is not null
      order by archived_at desc, id
    `);
    return rowsFromExecuteResult(result).map((row) => ({
      recordClass: "archived_dev_ticket" as const, devTicketId: String(row["id"]),
      lastActiveLane: row["last_active_lane"] === null ? null : row["last_active_lane"] as DevTicketLane,
      archivedAt: nullableDate(row["archived_at"])!,
      archivedByUserId: typeof row["archived_by_user_id"] === "string" ? row["archived_by_user_id"] : null,
      archivedReason: typeof row["archived_reason"] === "string" ? row["archived_reason"] : null,
      activityAggregateId: String(row["id"]), planningAggregateId: String(row["id"]),
    }));
  }

  public async listArchivedProposals(
    tx: TenantTransaction, organizationId: string, workspaceId: string,
  ): Promise<readonly ArchivedProposalProjection[]> {
    const result = await tx.execute(sql`
      select id, archived_at, archived_by_user_id, archived_reason
      from public.dev_board_proposal
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and archived_at is not null
      order by archived_at desc, id
    `);
    return rowsFromExecuteResult(result).map((row) => ({
      recordClass: "archived_proposal" as const, proposalId: String(row["id"]),
      archivedAt: nullableDate(row["archived_at"])!,
      archivedByUserId: typeof row["archived_by_user_id"] === "string" ? row["archived_by_user_id"] : null,
      archivedReason: typeof row["archived_reason"] === "string" ? row["archived_reason"] : null,
      activityAggregateId: String(row["id"]), planningAggregateId: String(row["id"]),
    }));
  }
}
