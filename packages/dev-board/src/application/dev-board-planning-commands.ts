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
  readonly dependencyEdgeId?: string;
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
export interface MergeProposalInput {
  readonly proposalId: string;
  readonly existingDevTicketId: string;
  readonly reason: string;
}
export interface RejectProposalInput {
  readonly proposalId: string;
  readonly reason: string;
}
export interface ArchiveProposalInput {
  readonly proposalId: string;
  readonly reason: string;
}
export interface ApproveReadyToTodoInput {
  readonly devTicketId: string;
  readonly readyContractContent: Readonly<Record<string, unknown>>;
  readonly expectedContractVersion: number;
  readonly expectedContractContentHash: string;
}
export interface AddDependencyInput {
  readonly dependentDevTicketId: string;
  readonly blockerDevTicketId: string;
  readonly reason: string;
}
export interface RemoveDependencyInput {
  readonly edgeId: string;
  readonly expectedEdgeVersion: number;
  readonly reason: string;
}
export interface DependencyLockStatusInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly devTicketId: string;
}

function failure(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}
function expected(envelope: CommandEnvelope, kind: string, id: string): number | null {
  const values = envelope.expectedVersions.filter(
    (value) => value.recordKind === kind && value.recordId === id,
  );
  return values.length === 1 ? values[0]!.version : null;
}
async function reject(
  tx: TenantTransaction,
  repository: CommandReceiptRepository,
  envelope: CommandEnvelope,
  code: string,
  message: string,
  extra: Readonly<Record<string, unknown>> = {},
  resultRef?: string,
): Promise<Result<never>> {
  const result = await repository.finalizeTransaction(tx, {
    organizationId: envelope.organizationId,
    commandId: envelope.commandId,
    outcome: "rejected",
    outcomeCode: code,
    resultSummary: { message, ...extra },
    ...(resultRef === undefined ? {} : { resultRef }),
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
        ...(typeof summary["dependencyEdgeId"] === "string" ? { dependencyEdgeId: summary["dependencyEdgeId"] } : {}),
    });
  }
  return err(
    failure(
      receipt.outcomeCode ?? "dev_board.command_rejected",
      receipt.state === "reserved"
        ? "The command is already in progress."
        : typeof receipt.resultSummary?.["message"] === "string"
          ? receipt.resultSummary["message"]
          : "The command was rejected.",
    ),
  );
}
function decisionReason(value: string): Result<string> {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length === 0
    ? err(failure("dev_board.decision_reason_required", "A decision reason is required."))
    : normalized.length > 4000
      ? err(failure("dev_board.decision_reason_too_long", "Decision reason must be 4000 characters or fewer."))
      : ok(normalized);
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
    ...(ids["dependencyEdgeId"] === undefined ? {} : { dependencyEdgeId: ids["dependencyEdgeId"] }),
  });
}

/** Live read gate; it intentionally creates no command receipt or projection cache. */
export async function dependencyLockStatus(
  input: DependencyLockStatusInput,
  deps: Pick<DevBoardPlanningCommandDependencies, "planningStore" | "database">,
): Promise<import("./dev-board-planning-store.js").DependencyLockStatus> {
  return withTenant(
    input.organizationId,
    (tx) => deps.planningStore.dependencyLockStatus(tx, input.organizationId, input.workspaceId, input.devTicketId),
    deps.database ?? db,
  );
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
      const inserted = await deps.planningStore.executeRiskyMutation(tx, () =>
        deps.planningStore.insertProposal(tx, {
          id: envelope.targetAggregateId,
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          discoverySummary: summary.value,
          blockingAssessment: assessment.value,
          suggestedContract: contract.value,
          createdCommandId: envelope.commandId,
        }),
      );
      if (!inserted.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          inserted.error.code,
          inserted.error.message,
        );
      const proposal = inserted.value;
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
      const changed = await deps.planningStore.executeRiskyMutation(tx, () =>
        deps.planningStore.updateProposal(tx, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          proposalId: proposal.id,
          expectedVersion: version,
          lifecycleState: "awaiting_decision",
          acceptedCommandId: null,
          acceptedDevTicketId: null,
        }),
      );
      if (!changed.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          changed.error.code,
          changed.error.message,
        );
      const updated = changed.value;
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
      const mutation = await deps.planningStore.executeRiskyMutation(tx, async () => {
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
        return { devTicket, updated };
      });
      if (!mutation.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          mutation.error.code,
          mutation.error.message,
        );
      const { devTicket, updated } = mutation.value;
      if (updated === null)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          "dev_board.expected_version_drift",
          "Proposal version has changed.",
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

export async function mergeProposal(
  envelope: CommandEnvelope,
  input: MergeProposalInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const reason = decisionReason(input.reason);
      if (!reason.ok)
        return reject(tx, deps.commandReceiptRepository, envelope, reason.error.code, reason.error.message);
      const proposalVersion = expected(envelope, "proposal", input.proposalId);
      const ticketVersion = expected(envelope, "dev_ticket", input.existingDevTicketId);
      const proposal = await deps.planningStore.selectProposalForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, input.proposalId,
      );
      const ticket = await deps.planningStore.selectDevTicketForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, input.existingDevTicketId,
      );
      if (
        proposalVersion === null || proposal === null || proposal.version !== proposalVersion ||
        ticketVersion === null || ticket === null || ticket.version !== ticketVersion
      )
        return reject(
          tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift",
          "Proposal or DevTicket version has changed.",
        );
      if (proposal.lifecycleState !== "awaiting_decision" || proposal.archivedAt !== null)
        return reject(
          tx, deps.commandReceiptRepository, envelope, "dev_board.proposal_not_awaiting_decision",
          "Proposal is not awaiting a decision.",
        );
      if (ticket.archivedAt !== null)
        return reject(
          tx, deps.commandReceiptRepository, envelope, "dev_board.dev_ticket_not_active",
          "DevTicket is archived and cannot receive a Proposal merge.",
        );
      const changed = await deps.planningStore.executeRiskyMutation(tx, () =>
        deps.planningStore.updateProposal(tx, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          proposalId: proposal.id,
          expectedVersion: proposalVersion,
          lifecycleState: "merged",
          acceptedCommandId: null,
          acceptedDevTicketId: null,
        }),
      );
      if (!changed.ok)
        return reject(tx, deps.commandReceiptRepository, envelope, changed.error.code, changed.error.message);
      const updated = changed.value;
      if (updated === null)
        return reject(
          tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift",
          "Proposal version has changed.",
        );
      await planning(tx, deps.ledger, envelope, ticket.id, "ProposalDecisionRationaleRecorded", "Proposal merged into DevTicket", {
        proposalId: proposal.id,
        discoverySummary: proposal.discoverySummary,
        blockingAssessment: proposal.blockingAssessment,
        reason: reason.value,
      });
      await activity(tx, deps.ledger, envelope, updated.id, updated.version, "ProposalMerged", {
        devTicketId: ticket.id,
      });
      return accept(
        tx, deps.commandReceiptRepository, envelope, "dev_board.proposal_merged", updated.id,
        [
          { recordKind: "proposal", recordId: updated.id, version: updated.version },
          { recordKind: "dev_ticket", recordId: ticket.id, version: ticket.version },
        ],
        { proposalId: updated.id, devTicketId: ticket.id },
      );
    },
    deps.database ?? db,
  );
}

export async function rejectProposal(
  envelope: CommandEnvelope,
  input: RejectProposalInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return decideProposal(envelope, input, deps, "rejected", "ProposalRejected", "dev_board.proposal_rejected", "Proposal rejected");
}

export async function archiveProposal(
  envelope: CommandEnvelope,
  input: ArchiveProposalInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const reason = decisionReason(input.reason);
      if (!reason.ok)
        return reject(tx, deps.commandReceiptRepository, envelope, reason.error.code, reason.error.message);
      const version = expected(envelope, "proposal", input.proposalId);
      const proposal = await deps.planningStore.selectProposalForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, input.proposalId,
      );
      if (version === null || proposal === null || proposal.version !== version)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "Proposal version has changed.");
      if (proposal.archivedAt !== null)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.proposal_already_archived", "Proposal is already archived.");
      const changed = await deps.planningStore.executeRiskyMutation(tx, () =>
        deps.planningStore.updateProposal(tx, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          proposalId: proposal.id,
          expectedVersion: version,
          lifecycleState: proposal.lifecycleState,
          acceptedCommandId: proposal.acceptedCommandId,
          acceptedDevTicketId: proposal.acceptedDevTicketId,
          archivedAt: new Date(),
        }),
      );
      if (!changed.ok)
        return reject(tx, deps.commandReceiptRepository, envelope, changed.error.code, changed.error.message);
      const updated = changed.value;
      if (updated === null)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "Proposal version has changed.");
      await planning(tx, deps.ledger, envelope, updated.id, "ProposalDecisionRationaleRecorded", "Proposal archived", { reason: reason.value });
      await activity(tx, deps.ledger, envelope, updated.id, updated.version, "ProposalArchived", {
        lifecycleState: updated.lifecycleState,
      });
      return accept(
        tx, deps.commandReceiptRepository, envelope, "dev_board.proposal_archived", updated.id,
        [{ recordKind: "proposal", recordId: updated.id, version: updated.version }], { proposalId: updated.id },
      );
    },
    deps.database ?? db,
  );
}

async function decideProposal(
  envelope: CommandEnvelope,
  input: RejectProposalInput,
  deps: DevBoardPlanningCommandDependencies,
  lifecycleState: "rejected",
  eventName: "ProposalRejected",
  outcomeCode: string,
  subject: string,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const reason = decisionReason(input.reason);
      if (!reason.ok)
        return reject(tx, deps.commandReceiptRepository, envelope, reason.error.code, reason.error.message);
      const version = expected(envelope, "proposal", input.proposalId);
      const proposal = await deps.planningStore.selectProposalForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, input.proposalId,
      );
      if (version === null || proposal === null || proposal.version !== version)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "Proposal version has changed.");
      if (proposal.lifecycleState !== "awaiting_decision" || proposal.archivedAt !== null)
        return reject(
          tx, deps.commandReceiptRepository, envelope, "dev_board.proposal_not_awaiting_decision",
          "Proposal is not awaiting a decision.",
        );
      const changed = await deps.planningStore.executeRiskyMutation(tx, () =>
        deps.planningStore.updateProposal(tx, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          proposalId: proposal.id,
          expectedVersion: version,
          lifecycleState,
          acceptedCommandId: null,
          acceptedDevTicketId: null,
        }),
      );
      if (!changed.ok)
        return reject(tx, deps.commandReceiptRepository, envelope, changed.error.code, changed.error.message);
      const updated = changed.value;
      if (updated === null)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "Proposal version has changed.");
      await planning(tx, deps.ledger, envelope, updated.id, "ProposalDecisionRationaleRecorded", subject, { reason: reason.value });
      await activity(tx, deps.ledger, envelope, updated.id, updated.version, eventName, {
        lifecycleState: updated.lifecycleState,
      });
      return accept(
        tx, deps.commandReceiptRepository, envelope, outcomeCode, updated.id,
        [{ recordKind: "proposal", recordId: updated.id, version: updated.version }], { proposalId: updated.id },
      );
    },
    deps.database ?? db,
  );
}

/**
 * A dependency set is currently unbound from Sprint storage (TB-SP1); therefore no live Sprint
 * membership can exist in this schema. This guard stays beside the graph command so a future Sprint
 * store cannot accidentally make the standalone path permissive.
 */
function hasLiveSprintMembership(ticketId: string): boolean {
  void ticketId;
  return false;
}

function dependencyEndpointFailure(
  endpoint: { readonly archivedAt: Date | null; readonly lane: string } | null,
): { readonly code: string; readonly message: string } | null {
  if (endpoint === null) {
    return { code: "dev_board.constraint_reference_invalid", message: "A dependency endpoint does not exist." };
  }
  if (endpoint.archivedAt !== null) {
    return { code: "dev_board.dev_ticket_not_active", message: "Archived DevTickets cannot be dependency endpoints." };
  }
  if (endpoint.lane === "done") {
    return { code: "dev_board.dev_ticket_done_immutable", message: "Done DevTickets cannot be changed in place." };
  }
  return null;
}

async function appendDependencyEffects(
  tx: TenantTransaction,
  envelope: CommandEnvelope,
  deps: DevBoardPlanningCommandDependencies,
  edge: { readonly id: string; readonly dependentDevTicketId: string; readonly blockerDevTicketId: string },
  reason: string,
  eventName: "DependencyAdded" | "DependencyRemoved",
  previousDependentLane: string,
  dependent: { readonly id: string; readonly version: number; readonly lane: string },
): Promise<void> {
  await planning(
    tx, deps.ledger, envelope, edge.dependentDevTicketId, "DependencyDecisionRationaleRecorded",
    eventName === "DependencyAdded" ? "Dependency added" : "Dependency removed",
    { reason, dependentId: edge.dependentDevTicketId, blockerId: edge.blockerDevTicketId, edgeId: edge.id },
  );
  /*
   * The activity ledger enforces one event per aggregate version. The dependency decision is the
   * authoritative event at the dependent's bumped version; its payload carries the atomic Ready and
   * lane consequence rather than manufacturing additional versions for one state transition.
   */
  await activity(tx, deps.ledger, envelope, dependent.id, dependent.version, eventName, {
    edgeId: edge.id,
    dependentId: edge.dependentDevTicketId,
    blockerId: edge.blockerDevTicketId,
    ...(previousDependentLane === "todo" && dependent.lane === "backlog"
      ? { readyInvalidated: true, laneChanged: { from: "todo", to: "backlog" } }
      : {}),
  });
}

export async function addDependency(
  envelope: CommandEnvelope,
  input: AddDependencyInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const reason = decisionReason(input.reason);
      if (!reason.ok) return reject(tx, deps.commandReceiptRepository, envelope, reason.error.code, reason.error.message);
      await deps.planningStore.lockDependencyGraph(tx, envelope.workspaceId);
      if (input.dependentDevTicketId === input.blockerDevTicketId) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_cycle_rejected", "A DevTicket cannot depend on itself.");
      }
      const duplicate = await deps.planningStore.selectActiveDependencyEdge(
        tx, envelope.organizationId, envelope.workspaceId, input.dependentDevTicketId, input.blockerDevTicketId,
      );
      if (duplicate !== null) {
        return accept(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_already_active", duplicate.id,
          [{ recordKind: "dependency_edge", recordId: duplicate.id, version: duplicate.version }],
          { dependencyEdgeId: duplicate.id, devTicketId: duplicate.dependentDevTicketId },
        );
      }
      const dependentExpected = expected(envelope, "dev_ticket", input.dependentDevTicketId);
      const blockerExpected = expected(envelope, "dev_ticket", input.blockerDevTicketId);
      const dependent = await deps.planningStore.selectDevTicketForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, input.dependentDevTicketId,
      );
      const blocker = await deps.planningStore.selectDevTicketForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, input.blockerDevTicketId,
      );
      if (dependent === null || blocker === null) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.constraint_reference_invalid", "A dependency endpoint does not exist.");
      }
      if (dependentExpected === null || blockerExpected === null || dependent.version !== dependentExpected || blocker.version !== blockerExpected) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "Dependency endpoint version has changed.");
      }
      const endpointFailure = dependencyEndpointFailure(dependent) ?? dependencyEndpointFailure(blocker);
      if (endpointFailure !== null) return reject(tx, deps.commandReceiptRepository, envelope, endpointFailure.code, endpointFailure.message);
      if (hasLiveSprintMembership(dependent.id) || hasLiveSprintMembership(blocker.id)) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.sprint_coordination_required", "Dependency changes for Sprint members require Sprint coordination.");
      }
      if (await deps.planningStore.dependencyCreatesCycle(tx, envelope.organizationId, envelope.workspaceId, input.dependentDevTicketId, input.blockerDevTicketId)) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_cycle_rejected", "The dependency would create a cycle.");
      }
      const dependentVersionDrift = new Error("Dependent DevTicket version has changed.");
      let mutation;
      try {
        mutation = await deps.planningStore.executeRiskyMutation(tx, async () => {
          const edge = await deps.planningStore.insertDependencyEdge(tx, {
            id: randomUUID(), organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
            dependentDevTicketId: dependent.id, blockerDevTicketId: blocker.id, createdCommandId: envelope.commandId,
          });
          const updated = await deps.planningStore.applyDependencyChangeToDependent(tx, {
            organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
            devTicketId: dependent.id, expectedVersion: dependent.version,
          });
          if (updated === null) throw dependentVersionDrift;
          return { edge, updated };
        });
      } catch (error) {
        if (error === dependentVersionDrift)
          return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", dependentVersionDrift.message);
        throw error;
      }
      if (!mutation.ok) return reject(tx, deps.commandReceiptRepository, envelope, mutation.error.code, mutation.error.message);
      await appendDependencyEffects(tx, envelope, deps, mutation.value.edge, reason.value, "DependencyAdded", dependent.lane, mutation.value.updated);
      return accept(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_added", mutation.value.edge.id,
        [
          { recordKind: "dependency_edge", recordId: mutation.value.edge.id, version: mutation.value.edge.version },
          { recordKind: "dev_ticket", recordId: mutation.value.updated.id, version: mutation.value.updated.version },
          { recordKind: "dev_ticket", recordId: blocker.id, version: blocker.version },
        ],
        { dependencyEdgeId: mutation.value.edge.id, devTicketId: mutation.value.updated.id },
      );
    },
    deps.database ?? db,
  );
}

export async function removeDependency(
  envelope: CommandEnvelope,
  input: RemoveDependencyInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      const reason = decisionReason(input.reason);
      if (!reason.ok) return reject(tx, deps.commandReceiptRepository, envelope, reason.error.code, reason.error.message);
      await deps.planningStore.lockDependencyGraph(tx, envelope.workspaceId);
      const edge = await deps.planningStore.selectDependencyEdge(tx, envelope.organizationId, envelope.workspaceId, input.edgeId);
      if (edge === null) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_not_active", "The dependency edge is not active.");
      }
      if (edge.lifecycleState === "retired") {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.already_removed", "The dependency edge was already removed.",
          { dependencyEdgeId: edge.id, originalRemovalCommandId: edge.retiredCommandId }, edge.retiredCommandId ?? edge.id,
        );
      }
      if (edge.version !== input.expectedEdgeVersion) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_identity_conflict", "The dependency edge identity or version has changed.");
      }
      const dependent = await deps.planningStore.selectDevTicketForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, edge.dependentDevTicketId,
      );
      const blocker = await deps.planningStore.selectDevTicketForUpdate(
        tx, envelope.organizationId, envelope.workspaceId, edge.blockerDevTicketId,
      );
      if (dependent === null || blocker === null) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.constraint_reference_invalid", "A dependency endpoint does not exist.");
      }
      const endpointFailure = dependencyEndpointFailure(dependent) ?? dependencyEndpointFailure(blocker);
      if (endpointFailure !== null) return reject(tx, deps.commandReceiptRepository, envelope, endpointFailure.code, endpointFailure.message);
      if (hasLiveSprintMembership(dependent.id) || hasLiveSprintMembership(blocker.id)) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.sprint_coordination_required", "Dependency changes for Sprint members require Sprint coordination.");
      }
      const dependentVersionDrift = new Error("Dependent DevTicket version has changed.");
      let mutation;
      try {
        mutation = await deps.planningStore.executeRiskyMutation(tx, async () => {
          const retired = await deps.planningStore.retireDependencyEdge(tx, {
            organizationId: envelope.organizationId, workspaceId: envelope.workspaceId, edgeId: edge.id,
            expectedVersion: input.expectedEdgeVersion, retiredCommandId: envelope.commandId,
          });
          if (retired === null) return null;
          const updated = await deps.planningStore.applyDependencyChangeToDependent(tx, {
            organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
            devTicketId: dependent.id, expectedVersion: dependent.version,
          });
          if (updated === null) throw dependentVersionDrift;
          return { edge: retired, updated };
        });
      } catch (error) {
        if (error === dependentVersionDrift)
          return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", dependentVersionDrift.message);
        throw error;
      }
      if (!mutation.ok) return reject(tx, deps.commandReceiptRepository, envelope, mutation.error.code, mutation.error.message);
      if (mutation.value === null) return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_identity_conflict", "The dependency edge identity or version has changed.");
      await appendDependencyEffects(tx, envelope, deps, mutation.value.edge, reason.value, "DependencyRemoved", dependent.lane, mutation.value.updated);
      return accept(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_removed", mutation.value.edge.id,
        [
          { recordKind: "dependency_edge", recordId: mutation.value.edge.id, version: mutation.value.edge.version },
          { recordKind: "dev_ticket", recordId: mutation.value.updated.id, version: mutation.value.updated.version },
        ],
        { dependencyEdgeId: mutation.value.edge.id, devTicketId: mutation.value.updated.id },
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
      const changed = await deps.planningStore.executeRiskyMutation(tx, () =>
        deps.planningStore.updateDevTicketForReadyApproval(tx, {
          organizationId: envelope.organizationId,
          workspaceId: envelope.workspaceId,
          devTicketId: ticket.id,
          expectedVersion: version,
          readyContractVersion: ticket.readyContractVersion + 1,
          readyContractContent: contract.value,
          readyContractContentHash: hash,
          readyApprovedByUserId: envelope.actorRef.stableId,
          readyApprovalCommandId: envelope.commandId,
        }),
      );
      if (!changed.ok)
        return reject(
          tx,
          deps.commandReceiptRepository,
          envelope,
          changed.error.code,
          changed.error.message,
        );
      const updated = changed.value;
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
        "ReadyApproved",
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

/** TB-01 declares these workflow commands but must not grant execution/review authority yet. */
export async function claim(
  envelope: CommandEnvelope,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return rejectUntilGate(envelope, deps, "dev_board.gate.claim_disabled_until_tb02", "Claim is disabled until TB-02 ships.", true);
}

export async function start(
  envelope: CommandEnvelope,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return rejectUntilGate(envelope, deps, "dev_board.gate.start_disabled_until_tb02", "Start is disabled until TB-02 ships.", true);
}

export async function submitForReview(
  envelope: CommandEnvelope,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return rejectUntilGate(
    envelope,
    deps,
    "dev_board.gate.submit_for_review_disabled_until_tb-rv1",
    "Submit for Review is disabled until TB-RV1 ships.",
  );
}

export async function admitDone(
  envelope: CommandEnvelope,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return rejectUntilGate(envelope, deps, "dev_board.gate.admit_done_disabled_until_tb-rv1", "Done admission is disabled until TB-RV1 ships.");
}

async function rejectUntilGate(
  envelope: CommandEnvelope,
  deps: DevBoardPlanningCommandDependencies,
  code: string,
  message: string,
  checkDependencyLock = false,
): Promise<Result<CommandResult>> {
  return withTenant(
    envelope.organizationId,
    async (tx) => {
      const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
      if ("ok" in reservation) return reservation;
      if (checkDependencyLock) {
        const status = await deps.planningStore.dependencyLockStatus(
          tx, envelope.organizationId, envelope.workspaceId, envelope.targetAggregateId,
        );
        if (status.locked) {
          const blockerIds = status.blockers.filter((blocker) => !blocker.done).map((blocker) => blocker.devTicketId);
          return reject(
            tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_locked",
            `DevTicket is locked by unfinished dependencies: ${blockerIds.join(", ")}.`,
            { blockerDevTicketIds: blockerIds },
          );
        }
      }
      return reject(tx, deps.commandReceiptRepository, envelope, code, message);
    },
    deps.database ?? db,
  );
}
