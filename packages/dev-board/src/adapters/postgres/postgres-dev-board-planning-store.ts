import { sql } from "drizzle-orm";
import { rowsFromExecuteResult, type QueryRow, type TenantTransaction } from "@opzava/adapters";

import type {
  DevBoardPlanningStore,
  DevTicketRow,
  InsertDevTicketInput,
  InsertProposalInput,
  ProposalRow,
  UpdateDevTicketForReadyApprovalInput,
  UpdateProposalInput,
} from "../../application/dev-board-planning-store.js";
import type { DevTicketLane, OriginKind, ReadyState } from "../../domain/dev-ticket.js";
import type { BlockingAssessment, ProposalLifecycleState } from "../../domain/proposal.js";

function number(value: unknown): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Dev Board row contained an invalid integer.");
  return result;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Dev Board row contained invalid JSON content.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function proposal(row: QueryRow): ProposalRow {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    version: number(row["version"]),
    lifecycleState: row["lifecycle_state"] as ProposalLifecycleState,
    archivedAt: row["archived_at"] instanceof Date ? row["archived_at"] : null,
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
    archivedAt: row["archived_at"] instanceof Date ? row["archived_at"] : null,
    humanOwnerUserId: String(row["human_owner_user_id"]),
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
    todoRank: row["todo_rank"] === null ? null : number(row["todo_rank"]),
    createdCommandId: String(row["created_command_id"]),
  };
}

const proposalColumns = sql`id, organization_id, workspace_id, version, lifecycle_state, archived_at,
  discovery_summary, blocking_assessment, suggested_contract, created_command_id, accepted_command_id,
  accepted_dev_ticket_id`;
const ticketColumns = sql`id, organization_id, workspace_id, version, origin_kind, source_proposal_id,
  lane, archived_at, human_owner_user_id, ready_contract_version, ready_contract_content,
  ready_contract_content_hash, ready_state, ready_approval_contract_version,
  ready_approval_content_hash, ready_approved_by_user_id, ready_approval_command_id, todo_rank,
  created_command_id`;

export class PostgresDevBoardPlanningStore implements DevBoardPlanningStore {
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
    const result = await tx.execute(sql`
      update public.dev_board_proposal
      set lifecycle_state = ${input.lifecycleState}, accepted_command_id = ${input.acceptedCommandId}::uuid,
        accepted_dev_ticket_id = ${input.acceptedDevTicketId}::uuid, version = version + 1, updated_at = now()
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
      select ${ticketColumns} from public.dev_board_dev_ticket
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${ticketId}::uuid
      for update
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
      ) returning ${ticketColumns}
    `);
    const row = rowsFromExecuteResult(result)[0];
    if (row === undefined) throw new Error("DevTicket insert returned no row.");
    return ticket(row);
  }

  public async updateDevTicketForReadyApproval(
    tx: TenantTransaction,
    input: UpdateDevTicketForReadyApprovalInput,
  ): Promise<DevTicketRow | null> {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtext('dev_board_todo:' || ${input.workspaceId}))
    `);
    const result = await tx.execute(sql`
      update public.dev_board_dev_ticket
      set ready_contract_version = ${input.readyContractVersion},
        ready_contract_content = ${JSON.stringify(input.readyContractContent)}::jsonb,
        ready_contract_content_hash = ${input.readyContractContentHash}, ready_state = 'approved',
        ready_approval_contract_version = ${input.readyContractVersion},
        ready_approval_content_hash = ${input.readyContractContentHash},
        ready_approved_by_user_id = ${input.readyApprovedByUserId}, ready_approved_at = now(),
        ready_approval_command_id = ${input.readyApprovalCommandId}::uuid, lane = 'todo',
        todo_rank = (select coalesce(max(todo_rank), 0) + 1 from public.dev_board_dev_ticket
          where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid),
        version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}::uuid and workspace_id = ${input.workspaceId}::uuid
        and id = ${input.devTicketId}::uuid and version = ${input.expectedVersion}
      returning ${ticketColumns}
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : ticket(row);
  }
}
