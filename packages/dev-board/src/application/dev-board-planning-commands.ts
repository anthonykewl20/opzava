import { randomUUID } from "node:crypto";
import {
  db,
  withTenant,
  type TenantTransaction,
  type createPostgresDatabase,
} from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import type { CommandReceiptRepository, CommandReceiptResult } from "./command-receipt-store.js";
import type { DevBoardLedgerAppendPort } from "./dev-board-ledger-append-port.js";
import type { DevBoardPlanningStore } from "./dev-board-planning-store.js";
import type { CommandEnvelope, CommandExpectedVersion } from "../domain/command-envelope.js";
import {
  computeReadyContractContentHash,
  parseReadyContractContent,
} from "../domain/dev-ticket.js";
import { normalizeDiscoverySummary, parseBlockingAssessment } from "../domain/proposal.js";

type Database = ReturnType<typeof createPostgresDatabase>;
export interface CommandResult {
  readonly commandId: string;
  readonly resultingVersions: readonly CommandExpectedVersion[];
  readonly proposalId?: string;
  readonly devTicketId?: string;
}
export interface DevBoardPlanningCommandDependencies {
  readonly commandReceiptRepository: CommandReceiptRepository;
  readonly ledger: DevBoardLedgerAppendPort;
  readonly planningStore: DevBoardPlanningStore;
  readonly database?: Database;
}
export interface DraftProposalInput {
  readonly discoverySummary: string;
  readonly blockingAssessment: unknown;
  readonly suggestedContract?: Readonly<Record<string, unknown>>;
}
export interface SubmitProposalInput {
  readonly proposalId: string;
}
export interface AcceptProposalInput {
  readonly proposalId: string;
  readonly humanOwnerUserId: string;
  readonly initialContractContent?: Readonly<Record<string, unknown>>;
}
export interface ApproveReadyToTodoInput {
  readonly devTicketId: string;
  readonly readyContractContent: Readonly<Record<string, unknown>>;
  readonly expectedContractVersion: number;
  readonly expectedContractContentHash: string;
}

function failure(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}
function expected(envelope: CommandEnvelope, kind: string, id: string): number | null {
  const values = envelope.expectedVersions.filter(
    (value) => value.recordKind === kind && value.recordId === id,
  );
  return envelope.expectedVersions.length === 1 && values.length === 1 ? values[0]!.version : null;
}
async function reject(
  tx: TenantTransaction,
  repository: CommandReceiptRepository,
  envelope: CommandEnvelope,
  code: string,
  message: string,
): Promise<Result<never>> {
  const result = await repository.finalizeTransaction(tx, {
    organizationId: envelope.organizationId,
    commandId: envelope.commandId,
    outcome: "rejected",
    outcomeCode: code,
  });
  if (!result.ok) throw result.error;
  return err(failure(code, message));
}
function replay(receipt: CommandReceiptResult): Result<CommandResult> {
  if (receipt.state === "accepted") {
    const summary = receipt.resultSummary ?? {};
    return ok({
      commandId: receipt.commandId,
      resultingVersions: receipt.resultingVersions ?? [],
      ...(typeof summary["proposalId"] === "string" ? { proposalId: summary["proposalId"] } : {}),
      ...(typeof summary["devTicketId"] === "string" ? { devTicketId: summary["devTicketId"] } : {}),
    });
  }
  return err(
    failure(
      receipt.outcomeCode ?? "dev_board.command_rejected",
      receipt.state === "reserved"
        ? "The command is already in progress."
        : "The command was rejected.",
    ),
  );
}
async function planning(
  tx: TenantTransaction,
  ledger: DevBoardLedgerAppendPort,
  envelope: CommandEnvelope,
  aggregateId: string,
  entryKind: string,
  subject: string,
  content: Readonly<Record<string, unknown>>,
): Promise<void> {
  const result = await ledger.appendPlanningDecisionEntry(tx, {
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    commandId: envelope.commandId,
    aggregateId,
    entryKind,
    subject,
    contentHash: computeReadyContractContentHash({ ...content }),
    content,
  });
  if (!result.ok) throw result.error;
}
async function activity(
  tx: TenantTransaction,
  ledger: DevBoardLedgerAppendPort,
  envelope: CommandEnvelope,
  aggregateId: string,
  aggregateVersion: number,
  eventName: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  const result = await ledger.appendActivityEvent(tx, {
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    aggregateId,
    aggregateVersion,
    eventName,
    commandId: envelope.commandId,
    idempotencyKey: envelope.idempotencyKey,
    actor: envelope.actorRef,
    source: envelope.sourceRef,
    authorizationVersion: envelope.authorizationVersion,
    correlationId: envelope.correlationId,
    ...(envelope.causationId === undefined ? {} : { causationId: envelope.causationId }),
    occurredAt: new Date(),
    payload,
  });
  if (!result.ok) throw result.error;
}
async function accept(
  tx: TenantTransaction,
  repository: CommandReceiptRepository,
  envelope: CommandEnvelope,
  outcomeCode: string,
  resultRef: string,
  resultingVersions: readonly CommandExpectedVersion[],
  ids: Readonly<Record<string, string>>,
): Promise<Result<CommandResult>> {
  const finalized = await repository.finalizeTransaction(tx, {
    organizationId: envelope.organizationId,
    commandId: envelope.commandId,
    outcome: "accepted",
    outcomeCode,
    resultRef,
    resultSummary: ids,
    resultingVersions,
  });
  if (!finalized.ok) throw finalized.error;
  return ok({
    commandId: envelope.commandId,
    resultingVersions,
    ...(ids["proposalId"] === undefined ? {} : { proposalId: ids["proposalId"] }),
    ...(ids["devTicketId"] === undefined ? {} : { devTicketId: ids["devTicketId"] }),
  });
}
async function reserve(
  tx: TenantTransaction,
  repository: CommandReceiptRepository,
  envelope: CommandEnvelope,
): Promise<CommandReceiptResult | Result<CommandResult>> {
  const result = await repository.reserveOrReplayTransaction(tx, envelope);
  return !result.ok
    ? err(result.error)
    : result.value.state === "reserved"
      ? result.value
      : replay(result.value);
}

export async function draftProposal(
  envelope: CommandEnvelope,
  input: DraftProposalInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const summary = normalizeDiscoverySummary(input.discoverySummary);
      if (!summary.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          summary.error.code,
          summary.error.message,
        );
      const assessment = parseBlockingAssessment(input.blockingAssessment);
      if (!assessment.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          assessment.error.code,
          assessment.error.message,
        );
      const contract = parseReadyContractContent(input.suggestedContract ?? {});
      if (!contract.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          contract.error.code,
          contract.error.message,
        );
      const proposal = await deps.planningStore.insertProposal(tx, {
        id: envelope.targetAggregateId,
        organizationId: envelope.organizationId,
        workspaceId: envelope.workspaceId,
        discoverySummary: summary.value,
        blockingAssessment: assessment.value,
        suggestedContract: contract.value,
        createdCommandId: envelope.commandId,
      });
      await planning(
        tx,
        deps.ledger,
        envelope,
        proposal.id,
        "ProposalDrafted",
        "Proposal drafted",
        {
          discoverySummary: proposal.discoverySummary,
          blockingAssessment: proposal.blockingAssessment,
          suggestedContract: proposal.suggestedContract,
        },
      );
      await activity(tx, deps.ledger, envelope, proposal.id, proposal.version, "ProposalDrafted", {
        lifecycleState: proposal.lifecycleState,
      });
      return accept(
        tx,
        deps.commandReceiptRepository,
        envelope,
        "dev_board.proposal_drafted",
        proposal.id,
        [{ recordKind: "proposal", recordId: proposal.id, version: proposal.version }],
        { proposalId: proposal.id },
      );
    },
    deps.database ?? db,
  );
}

export async function submitProposal(
  envelope: CommandEnvelope,
  input: SubmitProposalInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const version = expected(envelope, "proposal", input.proposalId);
      const proposal = await deps.planningStore.selectProposalForUpdate(
        tx,
        envelope.organizationId,
        envelope.workspaceId,
        input.proposalId,
      );
      if (version === null || proposal === null || proposal.version !== version)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.expected_version_drift",
          "Proposal version has changed.",
        );
      if (proposal.lifecycleState !== "draft" || proposal.archivedAt !== null)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.proposal_not_draft",
          "Proposal is not a decision draft.",
        );
      const updated = await deps.planningStore.updateProposal(tx, {
        organizationId: envelope.organizationId,
        workspaceId: envelope.workspaceId,
        proposalId: proposal.id,
        expectedVersion: version,
        lifecycleState: "awaiting_decision",
        acceptedCommandId: null,
        acceptedDevTicketId: null,
      });
      if (updated === null)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.expected_version_drift",
          "Proposal version has changed.",
        );
      await activity(tx, deps.ledger, envelope, updated.id, updated.version, "ProposalSubmitted", {
        lifecycleState: updated.lifecycleState,
      });
      return accept(
        tx,
        deps.commandReceiptRepository,
        envelope,
        "dev_board.proposal_submitted",
        updated.id,
        [{ recordKind: "proposal", recordId: updated.id, version: updated.version }],
        { proposalId: updated.id },
      );
    },
    deps.database ?? db,
  );
}

/**
 * GitHub binding and mirror intent are deliberately deferred to TB-GH1 for this slice.
 * Active-membership validation is not pre-checked here because the `memberships` RLS restricts
 * opzava_app to self-rows; the `human_owner_user_id → memberships` FK enforces membership
 * existence. A governed active-membership pre-check (AuthorizationPort or a SECURITY DEFINER
 * helper) is deferred to a follow-up slice.
 */
export async function acceptProposal(
  envelope: CommandEnvelope,
  input: AcceptProposalInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const version = expected(envelope, "proposal", input.proposalId);
      const proposal = await deps.planningStore.selectProposalForUpdate(
        tx,
        envelope.organizationId,
        envelope.workspaceId,
        input.proposalId,
      );
      if (version === null || proposal === null || proposal.version !== version)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.expected_version_drift",
          "Proposal version has changed.",
        );
      if (proposal.lifecycleState !== "awaiting_decision" || proposal.archivedAt !== null)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.proposal_not_awaiting_decision",
          "Proposal is not awaiting a decision.",
        );
      const contract = parseReadyContractContent(input.initialContractContent ?? {});
      if (!contract.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          contract.error.code,
          contract.error.message,
        );
      const devTicket = await deps.planningStore.insertDevTicket(tx, {
        id: randomUUID(),
        organizationId: envelope.organizationId,
        workspaceId: envelope.workspaceId,
        originKind: "proposal",
        sourceProposalId: proposal.id,
        humanOwnerUserId: input.humanOwnerUserId,
        readyContractContent: contract.value,
        readyContractContentHash: computeReadyContractContentHash({ ...contract.value }),
        createdCommandId: envelope.commandId,
      });
      const updated = await deps.planningStore.updateProposal(tx, {
        organizationId: envelope.organizationId,
        workspaceId: envelope.workspaceId,
        proposalId: proposal.id,
        expectedVersion: version,
        lifecycleState: "accepted",
        acceptedCommandId: envelope.commandId,
        acceptedDevTicketId: devTicket.id,
      });
      if (updated === null)
        throw failure("dev_board.expected_version_drift", "Proposal version has changed.");
      await planning(
        tx,
        deps.ledger,
        envelope,
        updated.id,
        "ProposalAccepted",
        "Proposal accepted",
        { devTicketId: devTicket.id },
      );
      await planning(
        tx,
        deps.ledger,
        envelope,
        devTicket.id,
        "ContractVersionCreated",
        "Initial ready contract",
        {
          version: devTicket.readyContractVersion,
          content: devTicket.readyContractContent,
          contentHash: devTicket.readyContractContentHash,
        },
      );
      await activity(tx, deps.ledger, envelope, updated.id, updated.version, "ProposalAccepted", {
        devTicketId: devTicket.id,
      });
      await activity(
        tx,
        deps.ledger,
        envelope,
        devTicket.id,
        devTicket.version,
        "DevTicketCreated",
        { lane: devTicket.lane, humanOwnerUserId: devTicket.humanOwnerUserId },
      );
      return accept(
        tx,
        deps.commandReceiptRepository,
        envelope,
        "dev_board.proposal_accepted",
        devTicket.id,
        [
          { recordKind: "proposal", recordId: updated.id, version: updated.version },
          { recordKind: "dev_ticket", recordId: devTicket.id, version: devTicket.version },
        ],
        { proposalId: updated.id, devTicketId: devTicket.id },
      );
    },
    deps.database ?? db,
  );
}

export async function approveReadyToTodo(
  envelope: CommandEnvelope,
  input: ApproveReadyToTodoInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const version = expected(envelope, "dev_ticket", input.devTicketId);
      const ticket = await deps.planningStore.selectDevTicketForUpdate(
        tx,
        envelope.organizationId,
        envelope.workspaceId,
        input.devTicketId,
      );
      if (version === null || ticket === null || ticket.version !== version)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.expected_version_drift",
          "DevTicket version has changed.",
        );
      if (ticket.lane !== "backlog" || ticket.readyState !== "draft" || ticket.archivedAt !== null)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.dev_ticket_not_ready_for_approval",
          "DevTicket is not an active Backlog draft.",
        );
      if (
        ticket.readyContractVersion !== input.expectedContractVersion ||
        ticket.readyContractContentHash !== input.expectedContractContentHash
      )
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.stale_ready_contract",
          "Ready contract head has changed.",
        );
      const contract = parseReadyContractContent(input.readyContractContent);
      if (!contract.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          contract.error.code,
          contract.error.message,
        );
      const hash = computeReadyContractContentHash({ ...contract.value });
      const updated = await deps.planningStore.updateDevTicketForReadyApproval(tx, {
        organizationId: envelope.organizationId,
        workspaceId: envelope.workspaceId,
        devTicketId: ticket.id,
        expectedVersion: version,
        readyContractVersion: ticket.readyContractVersion + 1,
        readyContractContent: contract.value,
        readyContractContentHash: hash,
        readyApprovedByUserId: envelope.actorRef.stableId,
        readyApprovalCommandId: envelope.commandId,
      });
      if (updated === null)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.expected_version_drift",
          "DevTicket version has changed.",
        );
      await planning(
        tx,
        deps.ledger,
        envelope,
        updated.id,
        "ContractVersionCreated",
        "Ready contract approved",
        {
          version: updated.readyContractVersion,
          content: updated.readyContractContent,
          contentHash: updated.readyContractContentHash,
        },
      );
      await activity(
        tx,
        deps.ledger,
        envelope,
        updated.id,
        updated.version,
        "ReadyApprovedToTodo",
        {
          lane: updated.lane,
          readyApprovalContractVersion: updated.readyApprovalContractVersion,
          readyApprovalContentHash: updated.readyApprovalContentHash,
        },
      );
      return accept(
        tx,
        deps.commandReceiptRepository,
        envelope,
        "dev_board.ready_approved_to_todo",
        updated.id,
        [{ recordKind: "dev_ticket", recordId: updated.id, version: updated.version }],
        { devTicketId: updated.id },
      );
    },
    deps.database ?? db,
  );
}
