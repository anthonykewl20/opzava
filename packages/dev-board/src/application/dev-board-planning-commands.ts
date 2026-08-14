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
import { parseCommandActorRef, type CommandEnvelope, type CommandExpectedVersion } from "../domain/command-envelope.js";
import {
  canonicalJson,
  computeReadyContractContentHash,
  parseReadyContractContent,
} from "../domain/dev-ticket.js";
import { compareChangeRisk, normalizeWorkAreas, parseChangeRisk, parseDevTicketType, parsePriority, parseSeverity } from "../domain/classification.js";
import { evaluateChangeRisk } from "../domain/change-risk-policy.js";
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
  readonly expectedTodoQueueVersion: number;
}
export interface SetDevTicketClassificationInput {
  readonly devTicketId: string;
  readonly type: unknown;
  readonly workAreas: unknown;
  readonly priority: unknown;
  readonly severity?: unknown;
  readonly declaredChangeRisk: unknown;
  readonly humanOwnerUserId?: string;
}
export type TodoReorderAnchor =
  | { kind: "before" | "after"; neighborDevTicketId: string; neighborVersion: number }
  | { kind: "empty_band" };
export interface ReorderTodoInput {
  readonly devTicketId: string;
  readonly sourceQueue: { readonly lane: "todo"; readonly version: number };
  readonly targetQueue: { readonly lane: "todo"; readonly version: number };
  readonly anchor: TodoReorderAnchor;
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

export const RANK_STRIDE = 1_000_000n;
const FIRST_TODO_RANK = 2n * RANK_STRIDE;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

/**
 * TB-01b-5 has no classification fields yet, so every Todo ticket is in this one band. This is the
 * deliberate forward-compatibility seam for the classifications slice; callers never set a tier.
 */
function deriveTodoOrderingBand(ticket: { readonly lane: string }): "all_todo" {
  void ticket;
  return "all_todo";
}

function validTodoAnchor(anchor: TodoReorderAnchor): boolean {
  if (anchor.kind === "empty_band") return Object.keys(anchor).length === 1;
  return (anchor.kind === "before" || anchor.kind === "after") &&
    typeof anchor.neighborDevTicketId === "string" && anchor.neighborDevTicketId.length > 0 &&
    Number.isSafeInteger(anchor.neighborVersion) && anchor.neighborVersion > 0;
}

function forbiddenTodoOrderingField(input: ReorderTodoInput): "tier" | "numeric" | null {
  const candidate = input as unknown as Readonly<Record<string, unknown>>;
  if (["reviewReworkPlacement", "orderingTier", "tier"].some((field) => field in candidate)) return "tier";
  if (["rank", "position", "priority", "placement"].some((field) => field in candidate)) return "numeric";
  return null;
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
  if (!result.ok) return err(result.error);
  if (result.value.state !== "reserved") return replay(result.value);
  const actor = parseCommandActorRef(envelope.actorRef);
  if (!actor.ok) {
    const finalized = await repository.finalizeTransaction(tx, { organizationId: envelope.organizationId, commandId: envelope.commandId, outcome: "rejected", outcomeCode: actor.error.code, resultSummary: { message: actor.error.message } });
    if (!finalized.ok) throw finalized.error;
    return err(actor.error);
  }
  return result.value;
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
      if (!await deps.planningStore.isActiveMember(tx, envelope.organizationId, input.humanOwnerUserId))
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.human_owner_not_active_member", "Human Owner must be an active organization member.");
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
      if (input.dependentDevTicketId === input.blockerDevTicketId) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_cycle_rejected", "A DevTicket cannot depend on itself.");
      }
      const dependentExpected = expected(envelope, "dev_ticket", input.dependentDevTicketId);
      const blockerExpected = expected(envelope, "dev_ticket", input.blockerDevTicketId);
      const endpointIds = [input.dependentDevTicketId, input.blockerDevTicketId].sort();
      const endpointRows = new Map<string, Awaited<ReturnType<DevBoardPlanningStore["selectDevTicketForUpdate"]>>>();
      for (const endpointId of endpointIds) {
        endpointRows.set(endpointId, await deps.planningStore.selectDevTicketForUpdate(
          tx, envelope.organizationId, envelope.workspaceId, endpointId,
        ));
      }
      const dependent = endpointRows.get(input.dependentDevTicketId) ?? null;
      const blocker = endpointRows.get(input.blockerDevTicketId) ?? null;
      if (dependent === null || blocker === null) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.constraint_reference_invalid", "A dependency endpoint does not exist.");
      }
      await deps.planningStore.lockDependencyGraph(tx, envelope.workspaceId);
      const duplicate = await deps.planningStore.selectActiveDependencyEdge(
        tx, envelope.organizationId, envelope.workspaceId, input.dependentDevTicketId, input.blockerDevTicketId,
      );
      if (duplicate !== null) {
        return accept(tx, deps.commandReceiptRepository, envelope, "dev_board.dependency_already_active", duplicate.id,
          [{ recordKind: "dependency_edge", recordId: duplicate.id, version: duplicate.version }],
          { dependencyEdgeId: duplicate.id, devTicketId: duplicate.dependentDevTicketId },
        );
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
      const expectedTodoQueueVersion = expected(envelope, "lane_queue", "todo");
      let todoQueueVersion: number | null = null;
      if (dependent.lane === "todo") {
        const header = await deps.planningStore.getOrLockTodoQueueHeader(tx, envelope.organizationId, envelope.workspaceId);
        if (expectedTodoQueueVersion === null || header.version !== expectedTodoQueueVersion) {
          return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.lane_queue_version_drift", "Todo queue changed; reload and submit a new command/key.");
        }
      }
      const dependentVersionDrift = new Error("Dependent DevTicket version has changed.");
      let mutation;
      try {
        mutation = await deps.planningStore.executeRiskyMutation(tx, async () => {
          const edge = await deps.planningStore.insertDependencyEdge(tx, {
            id: randomUUID(), organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
            dependentDevTicketId: dependent.id, blockerDevTicketId: blocker.id, createdCommandId: envelope.commandId,
          });
          if (dependent.lane === "todo") {
            const deleted = await deps.planningStore.deleteTodoQueueMembership(
              tx, envelope.organizationId, envelope.workspaceId, dependent.id,
            );
            if (!deleted) throw dependentVersionDrift;
            const bumped = await deps.planningStore.casBumpTodoQueueVersion(
              tx, envelope.organizationId, envelope.workspaceId, expectedTodoQueueVersion!,
            );
            if (bumped === null) throw dependentVersionDrift;
            todoQueueVersion = bumped.version;
          }
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
          ...(todoQueueVersion === null ? [] : [{ recordKind: "lane_queue" as const, recordId: "todo", version: todoQueueVersion }]),
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
      const endpointIds = [edge.dependentDevTicketId, edge.blockerDevTicketId].sort();
      const endpointRows = new Map<string, Awaited<ReturnType<DevBoardPlanningStore["selectDevTicketForUpdate"]>>>();
      for (const endpointId of endpointIds) {
        endpointRows.set(endpointId, await deps.planningStore.selectDevTicketForUpdate(
          tx, envelope.organizationId, envelope.workspaceId, endpointId,
        ));
      }
      const dependent = endpointRows.get(edge.dependentDevTicketId) ?? null;
      const blocker = endpointRows.get(edge.blockerDevTicketId) ?? null;
      if (dependent === null || blocker === null) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.constraint_reference_invalid", "A dependency endpoint does not exist.");
      }
      const endpointFailure = dependencyEndpointFailure(dependent) ?? dependencyEndpointFailure(blocker);
      if (endpointFailure !== null) return reject(tx, deps.commandReceiptRepository, envelope, endpointFailure.code, endpointFailure.message);
      if (hasLiveSprintMembership(dependent.id) || hasLiveSprintMembership(blocker.id)) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.sprint_coordination_required", "Dependency changes for Sprint members require Sprint coordination.");
      }
      await deps.planningStore.lockDependencyGraph(tx, envelope.workspaceId);
      const expectedTodoQueueVersion = expected(envelope, "lane_queue", "todo");
      let todoQueueVersion: number | null = null;
      if (dependent.lane === "todo") {
        const header = await deps.planningStore.getOrLockTodoQueueHeader(tx, envelope.organizationId, envelope.workspaceId);
        if (expectedTodoQueueVersion === null || header.version !== expectedTodoQueueVersion) {
          return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.lane_queue_version_drift", "Todo queue changed; reload and submit a new command/key.");
        }
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
          if (dependent.lane === "todo") {
            const deleted = await deps.planningStore.deleteTodoQueueMembership(
              tx, envelope.organizationId, envelope.workspaceId, dependent.id,
            );
            if (!deleted) throw dependentVersionDrift;
            const bumped = await deps.planningStore.casBumpTodoQueueVersion(
              tx, envelope.organizationId, envelope.workspaceId, expectedTodoQueueVersion!,
            );
            if (bumped === null) throw dependentVersionDrift;
            todoQueueVersion = bumped.version;
          }
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
          ...(todoQueueVersion === null ? [] : [{ recordKind: "lane_queue" as const, recordId: "todo", version: todoQueueVersion }]),
        ],
        { dependencyEdgeId: mutation.value.edge.id, devTicketId: mutation.value.updated.id },
      );
    },
    deps.database ?? db,
  );
}

export async function reorderTodo(
  envelope: CommandEnvelope,
  input: ReorderTodoInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(envelope.organizationId, async (tx) => {
    const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
    if ("ok" in reservation) return reservation;
    const forbiddenField = forbiddenTodoOrderingField(input);
    if (forbiddenField === "tier") {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_ordering_tier_server_derived", "Todo ordering tier is server-derived.");
    }
    if (forbiddenField === "numeric") {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_numeric_position_forbidden", "Todo rank and numeric position are server-derived.");
    }
    if (
      input.sourceQueue.lane !== "todo" || input.targetQueue.lane !== "todo" ||
      input.sourceQueue.version !== input.targetQueue.version || !validTodoAnchor(input.anchor)
    ) {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_anchor_invalid", "Todo reorder requires one valid Todo anchor and matching queue versions.");
    }
    const expectedTicketVersion = expected(envelope, "dev_ticket", input.devTicketId);
    const moved = await deps.planningStore.selectDevTicketForUpdate(
      tx, envelope.organizationId, envelope.workspaceId, input.devTicketId,
    );
    if (moved === null || expectedTicketVersion === null || moved.version !== expectedTicketVersion) {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "DevTicket version has changed.");
    }
    if (moved.lane !== "todo") {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dev_ticket_not_in_todo", "DevTicket is not in Todo.");
    }
    const band = deriveTodoOrderingBand(moved);
    const header = await deps.planningStore.getOrLockTodoQueueHeader(tx, envelope.organizationId, envelope.workspaceId);
    // Do not persist a version bump for a rejected anchor: the locked header makes this precheck
    // equivalent to the later CAS while preserving the zero-write rejection contract.
    if (header.version !== input.sourceQueue.version) {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.lane_queue_version_drift", "Todo queue changed; reload and submit a new command/key.");
    }
    const movedMembership = await deps.planningStore.todoQueueMembership(
      tx, envelope.organizationId, envelope.workspaceId, moved.id,
    );
    if (movedMembership === null) {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.dev_ticket_not_in_todo", "DevTicket has no Todo queue membership.");
    }
    const members = await deps.planningStore.listTodoQueueRanks(tx, envelope.organizationId, envelope.workspaceId);
    const others = members.filter((member) => member.devTicketId !== moved.id);
    const anchor = input.anchor;
    let insertionIndex: number;
    if (anchor.kind === "empty_band") {
      if (others.length !== 0) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_anchor_invalid", "The Todo ordering band is not empty.");
      }
      insertionIndex = 0;
    } else {
      const neighbor = await deps.planningStore.selectDevTicket(
        tx, envelope.organizationId, envelope.workspaceId, anchor.neighborDevTicketId,
      );
      const neighborIndex = others.findIndex((member) => member.devTicketId === anchor.neighborDevTicketId);
      if (neighbor === null || neighbor.lane !== "todo" || neighborIndex < 0) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_anchor_invalid", "Todo anchor is no longer available.");
      }
      if (neighbor.version !== anchor.neighborVersion) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "Todo anchor version has changed.");
      }
      if (deriveTodoOrderingBand(neighbor) !== band) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_anchor_band_mismatch", "Todo anchor is in another ordering band.");
      }
      insertionIndex = anchor.kind === "before" ? neighborIndex : neighborIndex + 1;
    }
    const orderedIds = [...others.map((member) => member.devTicketId)];
    orderedIds.splice(insertionIndex, 0, moved.id);
    const lower = insertionIndex === 0 ? undefined : others[insertionIndex - 1]?.rank;
    const upper = insertionIndex === others.length ? undefined : others[insertionIndex]?.rank;
    let rank: bigint;
    let rebalancedDevTicketIds: readonly string[] = [];
    if (lower === undefined && upper === undefined) {
      rank = FIRST_TODO_RANK;
    } else if (lower === undefined) {
      rank = upper! - RANK_STRIDE;
    } else if (upper === undefined) {
      rank = lower + RANK_STRIDE;
    } else if (upper - lower >= 2n) {
      rank = lower + (upper - lower) / 2n;
    } else {
      rank = 0n;
    }
    let shouldRebalance = false;
    if (rank <= 0n || rank > POSTGRES_BIGINT_MAX) {
      if ((BigInt(orderedIds.length) + 1n) * RANK_STRIDE > POSTGRES_BIGINT_MAX) {
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_rank_capacity_exhausted", "Todo rank capacity is exhausted.");
      }
      shouldRebalance = true;
    }
    const bumpedQueue = await deps.planningStore.casBumpTodoQueueVersion(
      tx, envelope.organizationId, envelope.workspaceId, input.sourceQueue.version,
    );
    if (bumpedQueue === null) {
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.lane_queue_version_drift", "Todo queue changed; reload and submit a new command/key.");
    }
    if (shouldRebalance) {
      await deps.planningStore.rebalanceTodoBand(tx, envelope.organizationId, envelope.workspaceId, orderedIds);
      rebalancedDevTicketIds = orderedIds;
    } else {
      const updatedMembership = await deps.planningStore.updateTodoQueueMembershipRank(tx, {
        organizationId: envelope.organizationId, workspaceId: envelope.workspaceId, devTicketId: moved.id, rank,
      });
      if (!updatedMembership) throw new Error("Todo membership disappeared after being locked.");
    }
    const updated = await deps.planningStore.bumpDevTicketVersion(tx, {
      organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
      devTicketId: moved.id, expectedVersion: expectedTicketVersion,
    });
    if (updated === null) throw new Error("Todo DevTicket disappeared after being locked.");
    const rankPolicy = anchor.kind === "empty_band"
      ? { anchorKind: anchor.kind }
      : { anchorKind: anchor.kind, neighborDevTicketId: anchor.neighborDevTicketId };
    await activity(tx, deps.ledger, envelope, updated.id, updated.version, "TodoReordered", {
      rankPolicy,
      queueVersion: bumpedQueue.version,
      ...(rebalancedDevTicketIds.length === 0 ? {} : { rebalancedDevTicketIds }),
    });
    return accept(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_reordered", updated.id, [
      { recordKind: "dev_ticket", recordId: updated.id, version: updated.version },
      { recordKind: "lane_queue", recordId: "todo", version: bumpedQueue.version },
    ], { devTicketId: updated.id });
  }, deps.database ?? db);
}

export async function setDevTicketClassification(
  envelope: CommandEnvelope,
  input: SetDevTicketClassificationInput,
  deps: DevBoardPlanningCommandDependencies,
): Promise<Result<CommandResult>> {
  return withTenant(envelope.organizationId, async (tx) => {
    const reservation = await reserve(tx, deps.commandReceiptRepository, envelope);
    if ("ok" in reservation) return reservation;
    const version = expected(envelope, "dev_ticket", input.devTicketId);
    const ticket = await deps.planningStore.selectDevTicketForUpdate(tx, envelope.organizationId, envelope.workspaceId, input.devTicketId);
    if (version === null || ticket === null || ticket.version !== version)
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "DevTicket version has changed.");
    if (ticket.lane !== "backlog")
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_revision_required", "Classification changes require a governed revision outside Backlog.");
    const type = parseDevTicketType(input.type); if (!type.ok) return reject(tx, deps.commandReceiptRepository, envelope, type.error.code, type.error.message);
    const areas = normalizeWorkAreas(input.workAreas); if (!areas.ok) return reject(tx, deps.commandReceiptRepository, envelope, areas.error.code, areas.error.message);
    const priority = parsePriority(input.priority); if (!priority.ok) return reject(tx, deps.commandReceiptRepository, envelope, priority.error.code, priority.error.message);
    const declared = parseChangeRisk(input.declaredChangeRisk); if (!declared.ok) return reject(tx, deps.commandReceiptRepository, envelope, declared.error.code, declared.error.message);
    const severity = input.severity === undefined ? null : parseSeverity(input.severity);
    if (severity !== null && !severity.ok) return reject(tx, deps.commandReceiptRepository, envelope, severity.error.code, severity.error.message);
    if (severity !== null && type.value !== "bug") return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_invalid", "Severity is permitted only for Bug DevTickets.");
    const owner = input.humanOwnerUserId ?? ticket.humanOwnerUserId;
    if (owner !== ticket.humanOwnerUserId && !await deps.planningStore.isActiveMember(tx, envelope.organizationId, owner))
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.human_owner_not_active_member", "Human Owner must be an active organization member.");
    const evaluation = evaluateChangeRisk({ type: type.value, workAreas: areas.value, hasActiveDependencies: await deps.planningStore.hasActiveDependencies(tx, envelope.organizationId, envelope.workspaceId, ticket.id) });
    if (compareChangeRisk(declared.value, evaluation.minimumChangeRisk) < 0)
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.change_risk_below_policy_minimum", "Declared Change Risk is below the policy minimum.");
    const sameAreas = ticket.workAreas.length === areas.value.length && ticket.workAreas.every((area, index) => area === areas.value[index]);
    // Deliberately unlike addDependency's duplicate-active accept: an unchanged SET is a
    // client error. Both outcomes are replayable terminal receipts.
    if (ticket.humanOwnerUserId === owner && ticket.devTicketType === type.value && sameAreas && ticket.priority === priority.value && ticket.severity === (severity === null ? null : severity.value) && ticket.declaredChangeRisk === declared.value && ticket.minimumChangeRisk === evaluation.minimumChangeRisk && ticket.changeRiskPolicyVersion === evaluation.policyVersion && ticket.changeRiskPolicyHash === evaluation.policyHash)
      return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_unchanged", "Classification is unchanged.");
    const classification = { type: type.value, workAreas: areas.value, priority: priority.value, ...(severity === null ? {} : { severity: severity.value }), declaredChangeRisk: declared.value };
    const content = { ...ticket.readyContractContent, humanOwnerUserId: owner, classification, changeRiskPolicy: evaluation };
    const hash = computeReadyContractContentHash(content);
    const mutation = await deps.planningStore.executeRiskyMutation(tx, () => deps.planningStore.updateDevTicketClassification(tx, {
      organizationId: envelope.organizationId, workspaceId: envelope.workspaceId, devTicketId: ticket.id, expectedVersion: ticket.version,
      humanOwnerUserId: owner, devTicketType: type.value, workAreas: areas.value, priority: priority.value, severity: severity === null ? null : severity.value,
      declaredChangeRisk: declared.value, minimumChangeRisk: evaluation.minimumChangeRisk, changeRiskPolicyVersion: evaluation.policyVersion,
      changeRiskPolicyHash: evaluation.policyHash, readyContractContent: content, readyContractContentHash: hash,
    }));
    if (!mutation.ok) return reject(tx, deps.commandReceiptRepository, envelope, mutation.error.code, mutation.error.message);
    if (mutation.value === null) return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.expected_version_drift", "DevTicket version has changed.");
    const updated = mutation.value;
    const reasonCodes: string[] = [];
    if (ticket.humanOwnerUserId !== owner) reasonCodes.push("human_owner_changed");
    if (ticket.priority !== priority.value) reasonCodes.push("priority_changed");
    if (ticket.declaredChangeRisk !== declared.value) reasonCodes.push("change_risk_changed");
    if (ticket.devTicketType !== type.value) reasonCodes.push("type_changed");
    if (!sameAreas) reasonCodes.push("work_areas_changed");
    await planning(tx, deps.ledger, envelope, updated.id, "ClassificationMaterialityAssessed", "Classification materiality assessed", {
      base: { contractVersion: ticket.readyContractVersion, contentHash: ticket.readyContractContentHash }, result: { contractVersion: updated.readyContractVersion, contentHash: updated.readyContractContentHash },
      old: { humanOwnerUserId: ticket.humanOwnerUserId, type: ticket.devTicketType, workAreas: ticket.workAreas, priority: ticket.priority, severity: ticket.severity, declaredChangeRisk: ticket.declaredChangeRisk },
      next: { humanOwnerUserId: owner, ...classification }, policyEvaluation: evaluation, material: true, reasonCodes,
    });
    await activity(tx, deps.ledger, envelope, updated.id, updated.version, "DevTicketClassificationChanged", { classification, humanOwnerUserId: owner, policyEvaluation: evaluation, consequences: { readyContractVersion: updated.readyContractVersion } });
    return accept(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_set", updated.id,
      [{ recordKind: "dev_ticket", recordId: updated.id, version: updated.version }], { devTicketId: updated.id });
  }, deps.database ?? db);
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
      const authorized = envelope.actorRef.kind === "user" && (
        envelope.actorRef.stableId === ticket.humanOwnerUserId ||
        await deps.planningStore.hasOrganizationRole(tx, envelope.organizationId, envelope.actorRef.stableId, "owner") ||
        await deps.planningStore.hasOrganizationRole(tx, envelope.organizationId, envelope.actorRef.stableId, "admin")
      );
      if (!authorized)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.ready_approval_human_authorization_required", "Ready approval requires the Human Owner or an authorized admin.");
      if (ticket.devTicketType === null)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_type_required", "DevTicket type is required before Ready approval.");
      if (ticket.workAreas.length === 0)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_work_areas_required", "At least one work area is required before Ready approval.");
      if (ticket.priority === null)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.classification_priority_required", "Priority is required before Ready approval.");
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
      const submittedClassification = contract.value["classification"];
      const submittedPolicy = contract.value["changeRiskPolicy"];
      const expectedClassification = {
        type: ticket.devTicketType, workAreas: ticket.workAreas, priority: ticket.priority,
        ...(ticket.severity === null ? {} : { severity: ticket.severity }), declaredChangeRisk: ticket.declaredChangeRisk,
      };
      if (submittedClassification === undefined || submittedPolicy === undefined ||
        canonicalJson(submittedClassification) !== canonicalJson(expectedClassification) ||
        contract.value["humanOwnerUserId"] !== ticket.humanOwnerUserId)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.ready_contract_missing_classification", "Ready contract must bind the current classification and Human Owner.");
      if (ticket.declaredChangeRisk === null || ticket.minimumChangeRisk === null || ticket.changeRiskPolicyVersion === null || ticket.changeRiskPolicyHash === null)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.ready_contract_missing_classification", "Ready contract must bind the current Change Risk policy.");
      const currentPolicy = evaluateChangeRisk({ type: ticket.devTicketType, workAreas: ticket.workAreas, hasActiveDependencies: await deps.planningStore.hasActiveDependencies(tx, envelope.organizationId, envelope.workspaceId, ticket.id) });
      if (compareChangeRisk(ticket.declaredChangeRisk, currentPolicy.minimumChangeRisk) < 0)
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.change_risk_below_policy_minimum", "Declared Change Risk is below the policy minimum.");
      if (ticket.minimumChangeRisk !== currentPolicy.minimumChangeRisk || ticket.changeRiskPolicyVersion !== currentPolicy.policyVersion || ticket.changeRiskPolicyHash !== currentPolicy.policyHash || canonicalJson(submittedPolicy) !== canonicalJson(currentPolicy))
        return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.change_risk_policy_drift", "Change Risk policy evaluation has drifted.");
      const hash = computeReadyContractContentHash({ ...contract.value });
      const header = await deps.planningStore.getOrLockTodoQueueHeader(
        tx, envelope.organizationId, envelope.workspaceId,
      );
      if (header.version !== input.expectedTodoQueueVersion) {
        return reject(
          tx, deps.commandReceiptRepository, envelope, "dev_board.lane_queue_version_drift",
          "Todo queue changed; reload and submit a new command/key.",
        );
      }
      const members = await deps.planningStore.listTodoQueueRanks(tx, envelope.organizationId, envelope.workspaceId);
      const last = members.at(-1);
      let rank = last === undefined ? FIRST_TODO_RANK : last.rank + RANK_STRIDE;
      let rebalanceBeforeAppend = false;
      if (rank > POSTGRES_BIGINT_MAX) {
        if ((BigInt(members.length) + 2n) * RANK_STRIDE > POSTGRES_BIGINT_MAX) {
          return reject(tx, deps.commandReceiptRepository, envelope, "dev_board.todo_rank_capacity_exhausted", "Todo rank capacity is exhausted.");
        }
        rebalanceBeforeAppend = true;
        rank = (BigInt(members.length) + 2n) * RANK_STRIDE;
      }
      const changed = await deps.planningStore.executeRiskyMutation(tx, async () => {
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
        if (updated === null) return null;
        if (rebalanceBeforeAppend) {
          await deps.planningStore.rebalanceTodoBand(
            tx, envelope.organizationId, envelope.workspaceId, members.map((member) => member.devTicketId),
          );
        }
        await deps.planningStore.insertTodoQueueMembership(tx, {
          organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
          devTicketId: updated.id, rank,
        });
        return updated;
      });
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
      const bumpedQueue = await deps.planningStore.casBumpTodoQueueVersion(
        tx, envelope.organizationId, envelope.workspaceId, input.expectedTodoQueueVersion,
      );
      if (bumpedQueue === null) throw new Error("Todo queue header drifted while locked.");
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
        [
          { recordKind: "dev_ticket", recordId: updated.id, version: updated.version },
          { recordKind: "lane_queue", recordId: "todo", version: bumpedQueue.version },
        ],
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
