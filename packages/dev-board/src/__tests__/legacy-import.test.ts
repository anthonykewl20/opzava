import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InMemoryCommandReceiptRepository } from "../adapters/in-memory-command-receipt-repository.js";
import { InMemoryDevBoardLedgerAppendStore } from "../adapters/in-memory-dev-board-ledger-append-store.js";
import { InMemoryDevBoardPlanningStore } from "../adapters/in-memory-dev-board-planning-store.js";
import {
  dependencyLockStatus,
  importLegacyDevTicket,
  reconcileHistoricalCompletion,
  type DevBoardPlanningCommandDependencies,
} from "../application/dev-board-planning-commands.js";
import type { LegacyTaskSource } from "../application/dev-board-planning-store.js";
import type { CommandEnvelope } from "../domain/command-envelope.js";

const organizationId = randomUUID();
const workspaceId = randomUUID();
const ownerId = "legacy-owner";

// The command layer always enters the same tenant wrapper as production. This narrow test double
// supplies only its role/current-tenant guard queries; the storage path remains the in-memory port.
const inMemoryDatabase = {
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    let call = 0;
    return callback({
      execute: async () => {
        call += 1;
        if (call === 1) return [{ session_role: "opzava_app", is_super: false, bypass_rls: false }];
        if (call === 3) return [{ current_org_id: organizationId }];
        return [];
      },
    });
  },
} as never;

function source(overrides: Partial<LegacyTaskSource> = {}): LegacyTaskSource {
  const id = overrides.id ?? randomUUID();
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const updatedAt = new Date("2026-01-02T00:00:00.000Z");
  return {
    id,
    organizationId,
    workspaceId,
    status: "todo",
    assigneeUserId: "legacy-assignee",
    cardNumber: 41n,
    createdAt,
    updatedAt,
    row: { id, title: "Legacy task", status: "todo", updatedAt: updatedAt.toISOString() },
    evidenceRefs: [],
    ...overrides,
  };
}

function testContext() {
  const planningStore = new InMemoryDevBoardPlanningStore();
  const commandReceiptRepository = new InMemoryCommandReceiptRepository();
  const ledger = new InMemoryDevBoardLedgerAppendStore();
  planningStore.grantActiveMembership(organizationId, ownerId);
  planningStore.grantOrganizationRole(organizationId, ownerId, "admin");
  const deps: DevBoardPlanningCommandDependencies = {
    database: inMemoryDatabase,
    planningStore,
    commandReceiptRepository,
    ledger,
  };
  return { planningStore, commandReceiptRepository, ledger, deps };
}

function envelope(
  targetAggregateId: string,
  overrides: Partial<CommandEnvelope> = {},
): CommandEnvelope {
  return {
    commandId: randomUUID(),
    idempotencyKey: randomUUID(),
    requestHash: "a".repeat(64),
    organizationId,
    workspaceId,
    commandName: "ImportLegacyDevTicket",
    targetAggregateId,
    actorRef: { kind: "user", role: "human_owner", stableId: ownerId },
    sourceRef: { kind: "admin_ui", ref: "legacy-import-test" },
    authorizationVersion: 1,
    correlationId: randomUUID(),
    expectedVersions: [],
    ...overrides,
  };
}

function rejectedCode(result: Awaited<ReturnType<typeof importLegacyDevTicket>> | Awaited<ReturnType<typeof reconcileHistoricalCompletion>>): string {
  expect(result.ok).toBe(false);
  if (!result.ok) return result.error.code;
  throw new Error("Expected a rejected command.");
}

describe("TB-01b-8 legacy import command admission", () => {
  it("rolls legacy source fixtures back with every other risky in-memory mutation", async () => {
    const { planningStore } = testContext();
    const task = source();
    planningStore.legacyTaskSources.set(task.id, task);
    const result = await planningStore.executeRiskyMutation({} as never, async () => {
      planningStore.legacyTaskSources.set(task.id, { ...task, row: { ...task.row, title: "temporary mutation" } });
      throw { code: "23505" };
    });
    expect(result).toMatchObject({ ok: false, error: { code: "dev_board.constraint_conflict" } });
    expect(planningStore.legacyTaskSources.get(task.id)).toEqual(task);
  });

  it("rejects strangers, malformed role strings, and agent actors before reserving a receipt", async () => {
    for (const actorRef of [
      { kind: "user", role: "human_owner", stableId: "stranger" },
      { kind: "user", role: "not-a-role", stableId: ownerId },
      { kind: "agent", role: "agent", stableId: "migration-agent" },
    ]) {
      const { planningStore, commandReceiptRepository, deps } = testContext();
      const task = source();
      planningStore.legacyTaskSources.set(task.id, task);
      const command = envelope(task.id, { actorRef: actorRef as never });
      const result = await importLegacyDevTicket(command, { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps);
      expect(["dev_board.import_authorization_required", "dev_board.invalid_actor_ref"]).toContain(rejectedCode(result));
      await expect(commandReceiptRepository.readReceipt(command)).resolves.toBeNull();
      expect(planningStore.historicalRecords).toHaveLength(0);
    }
  });

  it("rejects missing, cross-organization, cross-workspace, and non-importable sources", async () => {
    const { planningStore, deps } = testContext();
    const missing = await importLegacyDevTicket(envelope(randomUUID()), { legacyTaskId: randomUUID(), humanOwnerUserId: ownerId }, deps);
    expect(rejectedCode(missing)).toBe("dev_board.legacy_task_not_found");

    const otherOrg = source({ organizationId: randomUUID() });
    planningStore.legacyTaskSources.set(otherOrg.id, otherOrg);
    expect(rejectedCode(await importLegacyDevTicket(envelope(otherOrg.id), { legacyTaskId: otherOrg.id, humanOwnerUserId: ownerId }, deps))).toBe("dev_board.legacy_task_not_found");

    const otherWorkspace = source({ workspaceId: randomUUID() });
    planningStore.legacyTaskSources.set(otherWorkspace.id, otherWorkspace);
    expect(rejectedCode(await importLegacyDevTicket(envelope(otherWorkspace.id), { legacyTaskId: otherWorkspace.id, humanOwnerUserId: ownerId }, deps))).toBe("dev_board.legacy_workspace_mismatch");

    const nonImportable = source({ status: "cancelled" });
    planningStore.legacyTaskSources.set(nonImportable.id, nonImportable);
    expect(rejectedCode(await importLegacyDevTicket(envelope(nonImportable.id), { legacyTaskId: nonImportable.id, humanOwnerUserId: ownerId }, deps))).toBe("dev_board.legacy_task_not_found");
  });

  it("preserves the immutable source digest, expected version, and replay activity semantics", async () => {
    const { planningStore, ledger, deps } = testContext();
    const task = source();
    planningStore.legacyTaskSources.set(task.id, task);
    const first = envelope(task.id, { idempotencyKey: "same-import" });
    const imported = await importLegacyDevTicket(first, { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps);
    expect(imported).toMatchObject({ ok: true, value: { devTicketId: task.id } });
    expect(await importLegacyDevTicket(first, { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps)).toEqual(imported);
    expect(ledger.activityEvents).toHaveLength(1);

    planningStore.legacyTaskSources.set(task.id, { ...task, row: { ...task.row, title: "Mutated after import" } });
    expect(rejectedCode(await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps))).toBe("dev_board.idempotency_conflict");

    planningStore.legacyTaskSources.set(task.id, task);
    const historical = [...planningStore.historicalRecords.values()][0]!;
    expect(rejectedCode(await importLegacyDevTicket(envelope(task.id, {
      expectedVersions: [{ recordKind: "historical_record", recordId: historical.historicalRecordId, version: historical.version - 1 }],
    }), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps))).toBe("dev_board.expected_version_drift");
  });

  it("rejects a legacy UUID collision rather than replacing an existing DevTicket", async () => {
    const { planningStore, deps } = testContext();
    const task = source();
    planningStore.legacyTaskSources.set(task.id, task);
    await planningStore.insertDevTicket({} as never, {
      id: task.id, organizationId, workspaceId, originKind: "proposal", sourceProposalId: null,
      humanOwnerUserId: ownerId, readyContractContent: {}, readyContractContentHash: "a".repeat(64), createdCommandId: randomUUID(),
    });
    expect(rejectedCode(await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps))).toBe("dev_board.legacy_ticket_id_collision");
  });

  it("keeps legacy Done historical and outside dependency completion", async () => {
    const { planningStore, deps } = testContext();
    const task = source({ status: "done", row: { id: "done", status: "done" } });
    planningStore.legacyTaskSources.set(task.id, task);
    expect(await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps)).toMatchObject({ ok: true });
    expect(planningStore.devTickets).toHaveLength(0);
    expect([...planningStore.historicalRecords.values()][0]).toMatchObject({ completionGate: "legacy_unverified", sourceDisposition: "historical_candidate" });
    await expect(dependencyLockStatus({ organizationId, workspaceId, devTicketId: randomUUID() }, deps)).resolves.toEqual({ locked: false, blockers: [] });
  });

  it("quarantines a legacy Done record without an owner and creates no DevTicket", async () => {
    const { planningStore, deps } = testContext();
    const task = source({ status: "done", row: { id: "done-no-owner", status: "done" } });
    planningStore.legacyTaskSources.set(task.id, task);

    expect(await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id }, deps)).toMatchObject({ ok: true });
    expect(planningStore.devTickets).toHaveLength(0);
    expect([...planningStore.historicalRecords.values()][0]).toMatchObject({
      completionGate: "legacy_unverified",
      sourceDisposition: "quarantined_no_owner",
    });
  });

  it("rejects reconciliation of a gate-null quarantine without aggregate or ledger writes", async () => {
    const { planningStore, ledger, deps } = testContext();
    const task = source();
    planningStore.legacyTaskSources.set(task.id, task);
    await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id }, deps);
    const historical = [...planningStore.historicalRecords.values()][0]!;
    const before = { version: historical.version, planning: ledger.planningDecisionEntries.length, activity: ledger.activityEvents.length };

    expect(rejectedCode(await reconcileHistoricalCompletion(
      envelope(historical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion" }),
      { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "gate-null" },
      deps,
    ))).toBe("dev_board.reconcile_target_invalid");
    expect(planningStore.historicalRecords.get(historical.historicalRecordId)?.version).toBe(before.version);
    expect(ledger.planningDecisionEntries).toHaveLength(before.planning);
    expect(ledger.activityEvents).toHaveLength(before.activity);
  });

  it("keeps reconciled historical imports terminal on a new idempotency key without ledger churn", async () => {
    const { planningStore, ledger, deps } = testContext();
    const task = source({
      status: "done",
      row: { id: "reimport-reconciled", status: "done" },
      evidenceRefs: [
        { evidenceId: "evidence-reimport", objectRef: "object://legacy/reimport" },
        { taskQualityReview: { reviewId: "review-reimport", status: "approved" } },
      ],
    });
    planningStore.legacyTaskSources.set(task.id, task);
    await importLegacyDevTicket(envelope(task.id, { idempotencyKey: "initial-import" }), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps);
    const historical = [...planningStore.historicalRecords.values()][0]!;
    await reconcileHistoricalCompletion(
      envelope(historical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion", idempotencyKey: "reconcile" }),
      { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "terminal" },
      deps,
    );
    const before = { version: planningStore.historicalRecords.get(historical.historicalRecordId)!.version, planning: ledger.planningDecisionEntries.length, activity: ledger.activityEvents.length };

    expect(await importLegacyDevTicket(envelope(task.id, { idempotencyKey: "reimport-new-key" }), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps)).toMatchObject({ ok: true });
    expect(planningStore.historicalRecords.get(historical.historicalRecordId)).toMatchObject({ completionGate: "reconciled_historical", version: before.version });
    expect(planningStore.legacyTaskAliases).toHaveLength(1);
    expect(planningStore.historicalRecords).toHaveLength(1);
    expect(ledger.planningDecisionEntries).toHaveLength(before.planning);
    expect(ledger.activityEvents).toHaveLength(before.activity);
  });

  it("advances a reconciled no-owner Done record in place without regressing its gate or duplicating import activity", async () => {
    const { planningStore, commandReceiptRepository, ledger, deps } = testContext();
    const task = source({
      status: "done",
      row: { id: "reconciled-no-owner", status: "done" },
      evidenceRefs: [
        { evidenceId: "evidence-reconciled-no-owner", objectRef: "object://legacy/reconciled-no-owner" },
        { taskQualityReview: { reviewId: "review-reconciled-no-owner", status: "approved" } },
      ],
    });
    planningStore.legacyTaskSources.set(task.id, task);
    const first = envelope(task.id, { idempotencyKey: "no-owner-first" });
    await expect(importLegacyDevTicket(first, { legacyTaskId: task.id }, deps)).resolves.toMatchObject({ ok: true });
    const historical = [...planningStore.historicalRecords.values()][0]!;
    await expect(reconcileHistoricalCompletion(
      envelope(historical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion", idempotencyKey: "reconcile-no-owner" }),
      { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "reconciled-no-owner" },
      deps,
    )).resolves.toMatchObject({ ok: true });

    const resolution = envelope(task.id, { idempotencyKey: "owner-reimport" });
    await expect(importLegacyDevTicket(resolution, { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps)).resolves.toMatchObject({ ok: true });
    expect(planningStore.legacyTaskAliases).toHaveLength(1);
    expect(planningStore.historicalRecords).toHaveLength(1);
    expect(planningStore.historicalRecords.get(historical.historicalRecordId)).toMatchObject({
      sourceDisposition: "historical_candidate",
      completionGate: "reconciled_historical",
    });
    expect(ledger.activityEvents.filter((event) => event.eventName === "LegacyDevTicketImported")).toHaveLength(1);
    await expect(commandReceiptRepository.readReceipt(resolution)).resolves.toMatchObject({ state: "accepted" });
  });

  it("does not demote a promoted ticket when a re-import omits its owner", async () => {
    const { planningStore, ledger, deps } = testContext();
    const task = source();
    planningStore.legacyTaskSources.set(task.id, task);
    await importLegacyDevTicket(envelope(task.id, { idempotencyKey: "promote" }), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps);
    const historical = [...planningStore.historicalRecords.values()][0]!;
    const ticket = planningStore.devTickets.get(`${organizationId}:${workspaceId}:${task.id}`)!;
    const before = { historicalVersion: historical.version, ticketVersion: ticket.version, planning: ledger.planningDecisionEntries.length, activity: ledger.activityEvents.length };

    expect(await importLegacyDevTicket(envelope(task.id, { idempotencyKey: "promote-no-owner" }), { legacyTaskId: task.id }, deps)).toMatchObject({ ok: true, value: { devTicketId: task.id } });
    expect(planningStore.historicalRecords.get(historical.historicalRecordId)).toMatchObject({ sourceDisposition: "promoted_backlog", version: before.historicalVersion });
    expect(planningStore.legacyTaskAliases.get(`${organizationId}:${task.id}`)?.devTicketId).toBe(task.id);
    expect(planningStore.devTickets.get(`${organizationId}:${workspaceId}:${task.id}`)).toMatchObject({ humanOwnerUserId: ownerId, version: before.ticketVersion });
    expect(ledger.planningDecisionEntries).toHaveLength(before.planning);
    expect(ledger.activityEvents).toHaveLength(before.activity);
  });

  it("rejects direct historical gate and disposition regressions in the in-memory store", async () => {
    const { planningStore } = testContext();
    const base = {
      organizationId,
      workspaceId,
      sourceTableRowIdentity: randomUUID(),
      sourceEpoch: null,
      sourceRecordedAt: new Date(),
      sourceUpdatedAt: new Date(),
      preservedPayloadDigest: "a".repeat(64),
      evidenceRefs: [],
      promotionCommandId: null,
    } as const;
    const reconciled = await planningStore.insertHistoricalRecord({} as never, {
      ...base, id: randomUUID(), completionGate: "legacy_unverified", sourceDisposition: "historical_candidate",
    });
    const reconciledRow = await planningStore.reconcileHistoricalCompletion({} as never, {
      organizationId, workspaceId, historicalRecordId: reconciled.historicalRecordId, expectedVersion: reconciled.version,
    });
    await expect(planningStore.resolveImportedHistoricalRecord({} as never, {
      organizationId, workspaceId, historicalRecordId: reconciled.historicalRecordId, expectedVersion: reconciledRow!.version,
      sourceDisposition: "historical_candidate", completionGate: "legacy_unverified", promotionCommandId: null, devTicketId: null,
    })).rejects.toMatchObject({ code: "dev_board.historical_transition_invalid" });

    const promoted = await planningStore.insertHistoricalRecord({} as never, {
      ...base, id: randomUUID(), completionGate: null, sourceDisposition: "promoted_backlog",
    });
    await expect(planningStore.resolveImportedHistoricalRecord({} as never, {
      organizationId, workspaceId, historicalRecordId: promoted.historicalRecordId, expectedVersion: promoted.version,
      sourceDisposition: "quarantined_no_owner", completionGate: null, promotionCommandId: null, devTicketId: null,
    })).rejects.toMatchObject({ code: "dev_board.historical_transition_invalid" });
  });

  it("does not treat null frozen evidence fields as a reference", async () => {
    const { planningStore, deps } = testContext();
    const task = source({
      status: "done",
      row: { id: "null-evidence", status: "done" },
      evidenceRefs: [
        { evidenceId: "null-ref", objectRef: null, url: null, filename: null },
        { taskQualityReview: { reviewId: "review-null", status: "approved" } },
      ],
    });
    planningStore.legacyTaskSources.set(task.id, task);
    await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps);
    const historical = [...planningStore.historicalRecords.values()][0]!;
    expect(rejectedCode(await reconcileHistoricalCompletion(
      envelope(historical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion" }),
      { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "null-reference" },
      deps,
    ))).toBe("dev_board.reconcile_evidence_insufficient");
  });

  it("reconciles approved historical evidence once, records its epoch, and rejects insufficient, duplicate, and invalid targets", async () => {
    const { planningStore, ledger, deps } = testContext();
    const task = source({
      status: "done",
      row: { id: "done", status: "done" },
      evidenceRefs: [
        { evidenceId: "evidence-1", objectRef: "object://legacy/evidence-1" },
        { taskQualityReview: { reviewId: "review-1", status: "approved", approvedAt: "2026-01-03T00:00:00.000Z" } },
      ],
    });
    planningStore.legacyTaskSources.set(task.id, task);
    await importLegacyDevTicket(envelope(task.id), { legacyTaskId: task.id, humanOwnerUserId: ownerId }, deps);
    const historical = [...planningStore.historicalRecords.values()][0]!;
    const reconciliation = envelope(historical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion", idempotencyKey: "reconcile-once" });
    const result = await reconcileHistoricalCompletion(reconciliation, { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "epoch-2026-08-15" }, deps);
    expect(result).toMatchObject({ ok: true, value: { resultingVersions: [{ recordKind: "historical_record", recordId: historical.historicalRecordId, version: 2 }] } });
    expect(await reconcileHistoricalCompletion(reconciliation, { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "epoch-2026-08-15" }, deps)).toEqual(result);
    expect(planningStore.historicalRecords.get(historical.historicalRecordId)).toMatchObject({ completionGate: "reconciled_historical", version: 2 });
    expect(ledger.planningDecisionEntries.at(-1)?.content).toMatchObject({ reconciliationEpoch: "epoch-2026-08-15" });
    expect(ledger.activityEvents.at(-1)?.payload).toMatchObject({ reconciliationEpoch: "epoch-2026-08-15" });

    expect(rejectedCode(await reconcileHistoricalCompletion(envelope(historical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion" }), { historicalRecordId: historical.historicalRecordId, reconciliationEpoch: "epoch-new-key" }, deps))).toBe("dev_board.already_reconciled");

    const insufficient = source({ status: "done", row: { id: "insufficient", status: "done" } });
    planningStore.legacyTaskSources.set(insufficient.id, insufficient);
    await importLegacyDevTicket(envelope(insufficient.id), { legacyTaskId: insufficient.id, humanOwnerUserId: ownerId }, deps);
    const insufficientHistorical = [...planningStore.historicalRecords.values()].find((row) => row.sourceTableRowIdentity === insufficient.id)!;
    const stateBefore = { version: insufficientHistorical.version, entries: ledger.planningDecisionEntries.length, events: ledger.activityEvents.length };
    expect(rejectedCode(await reconcileHistoricalCompletion(envelope(insufficientHistorical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion" }), { historicalRecordId: insufficientHistorical.historicalRecordId, reconciliationEpoch: "epoch-insufficient" }, deps))).toBe("dev_board.reconcile_evidence_insufficient");
    expect(planningStore.historicalRecords.get(insufficientHistorical.historicalRecordId)?.version).toBe(stateBefore.version);
    expect(ledger.planningDecisionEntries).toHaveLength(stateBefore.entries);
    expect(ledger.activityEvents).toHaveLength(stateBefore.events);

    const promoted = source();
    planningStore.legacyTaskSources.set(promoted.id, promoted);
    await importLegacyDevTicket(envelope(promoted.id), { legacyTaskId: promoted.id, humanOwnerUserId: ownerId }, deps);
    const promotedHistorical = [...planningStore.historicalRecords.values()].find((row) => row.sourceTableRowIdentity === promoted.id)!;
    expect(rejectedCode(await reconcileHistoricalCompletion(envelope(promotedHistorical.historicalRecordId, { commandName: "ReconcileHistoricalCompletion" }), { historicalRecordId: promotedHistorical.historicalRecordId, reconciliationEpoch: "epoch-promoted" }, deps))).toBe("dev_board.reconcile_target_invalid");
  });
});
