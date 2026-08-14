import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase, createPostgresPool, withTenant } from "@opzava/adapters";
import { PostgresCommandReceiptRepository } from "../adapters/postgres/postgres-command-receipt-repository.js";
import { PostgresDevBoardLedgerAppendStore } from "../adapters/postgres/postgres-dev-board-ledger-append-store.js";
import { PostgresDevBoardPlanningStore } from "../adapters/postgres/postgres-dev-board-planning-store.js";
import {
  acceptProposal,
  admitDone,
  approveReadyToTodo,
  archiveProposal,
  claim,
  draftProposal,
  mergeProposal,
  rejectProposal,
  start,
  submitForReview,
  submitProposal,
  type DevBoardPlanningCommandDependencies,
} from "../application/dev-board-planning-commands.js";
import { computeReadyContractContentHash } from "../domain/dev-ticket.js";
import type { CommandEnvelope } from "../domain/command-envelope.js";

const enabled = Boolean(process.env["DATABASE_URL"] && process.env["DATABASE_MIGRATION_URL"]);
const describePostgres = enabled ? describe : describe.skip;
function rows(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) return result as ReadonlyArray<Record<string, unknown>>;
  return typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
    ? (result as { rows: ReadonlyArray<Record<string, unknown>> }).rows
    : [];
}

describePostgres("Dev Board planning lifecycle real-Postgres", () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const workspaceId = randomUUID();
  const ownerId = `owner-${randomUUID()}`;
  const appPool = enabled ? createPostgresPool(process.env["DATABASE_URL"]) : undefined;
  const adminPool = enabled ? createPostgresPool(process.env["DATABASE_MIGRATION_URL"]) : undefined;
  const database = appPool === undefined ? undefined : createPostgresDatabase(appPool);
  const deps: DevBoardPlanningCommandDependencies | undefined =
    database === undefined
      ? undefined
      : {
          commandReceiptRepository: new PostgresCommandReceiptRepository(database),
          ledger: new PostgresDevBoardLedgerAppendStore(),
          planningStore: new PostgresDevBoardPlanningStore(),
          database,
        };
  function envelope(
    commandName: string,
    targetAggregateId: string,
    expectedVersions: CommandEnvelope["expectedVersions"] = [],
    overrides: Partial<CommandEnvelope> = {},
  ): CommandEnvelope {
    return {
      commandId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: "a".repeat(64),
      organizationId,
      workspaceId,
      commandName,
      targetAggregateId,
      actorRef: { kind: "human", stableId: ownerId, role: "owner" },
      sourceRef: { kind: "admin_ui", ref: "session-1" },
      authorizationVersion: 1,
      correlationId: randomUUID(),
      expectedVersions,
      ...overrides,
    };
  }
  beforeAll(async () => {
    const role = rows(
      await database!.execute(
        sql`select current_user as session_role, rolsuper as is_super, rolbypassrls as bypass_rls from pg_roles where rolname = current_user`,
      ),
    )[0];
    if (
      role?.["session_role"] !== "opzava_app" ||
      role?.["is_super"] === true ||
      role?.["bypass_rls"] === true
    )
      throw new Error(
        `RLS integration test must run as non-owner opzava_app; got ${JSON.stringify(role)}`,
      );
    await adminPool!.query(
      "insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [
        organizationId,
        `dev-board-${organizationId}`,
        "Dev Board lifecycle",
        otherOrganizationId,
        `dev-board-${otherOrganizationId}`,
        "Other lifecycle",
      ],
    );
    await adminPool!.query(
      "insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, $3, $4)",
      [workspaceId, organizationId, `dev-board-${workspaceId}`, "Dev Board workspace"],
    );
    await adminPool!.query("insert into public.auth_users (id, name, email) values ($1, $2, $3)", [
      ownerId,
      "Owner",
      `${ownerId}@example.test`,
    ]);
    await adminPool!.query(
      "insert into public.memberships (organization_id, user_id, status) values ($1, $2, 'active')",
      [organizationId, ownerId],
    );
  });
  afterAll(async () => {
    if (adminPool === undefined || appPool === undefined) return;
    await adminPool.query(
      "delete from public.dev_board_dependency_edge where organization_id = $1",
      [organizationId],
    );
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("delete from public.dev_board_dev_ticket where organization_id = $1", [
        organizationId,
      ]);
      await client.query("delete from public.dev_board_proposal where organization_id = $1", [
        organizationId,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await adminPool.query(
      "delete from public.dev_board_activity_event where organization_id = $1",
      [organizationId],
    );
    await adminPool.query(
      "delete from public.dev_board_planning_decision_entry where organization_id = $1",
      [organizationId],
    );
    await adminPool.query(
      "delete from public.dev_board_command_receipt where organization_id = $1",
      [organizationId],
    );
    await adminPool.query("delete from public.memberships where organization_id = $1", [
      organizationId,
    ]);
    await adminPool.query("delete from public.auth_users where id = $1", [ownerId]);
    await adminPool.query("delete from public.workspaces where organization_id = $1", [
      organizationId,
    ]);
    await adminPool.query("delete from public.organizations where id = $1 or id = $2", [
      organizationId,
      otherOrganizationId,
    ]);
    await appPool.end();
    await adminPool.end();
  });
  it("runs Draft through Ready approval with state versions mirrored in activity", async () => {
    const proposalId = randomUUID();
    const drafted = envelope("DraftProposal", proposalId);
    expect(
      (
        await draftProposal(
          drafted,
          { discoverySummary: "Find a safe lifecycle", blockingAssessment: "non_blocking" },
          deps!,
        )
      ).ok,
    ).toBe(true);
    const submitted = envelope("SubmitProposal", proposalId, [
      { recordKind: "proposal", recordId: proposalId, version: 1 },
    ]);
    expect((await submitProposal(submitted, { proposalId }, deps!)).ok).toBe(true);
    const accepted = await acceptProposal(
      envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 2 },
      ]),
      { proposalId, humanOwnerUserId: ownerId, initialContractContent: { outcome: "Ship" } },
      deps!,
    );
    expect(accepted).toMatchObject({ ok: true });
    if (!accepted.ok) return;
    const ticketId = accepted.value.devTicketId!;
    const approvedContent = { outcome: "Ship", scope: "only Dev Board" };
    const approved = await approveReadyToTodo(
      envelope("ApproveReadyToTodo", ticketId, [
        { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
      ]),
      {
        devTicketId: ticketId,
        readyContractContent: approvedContent,
        expectedContractVersion: 1,
        expectedContractContentHash: computeReadyContractContentHash({ outcome: "Ship" }),
      },
      deps!,
    );
    expect(approved.ok).toBe(true);
    const state = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(
            sql`select p.version as proposal_version, t.version as ticket_version, t.lane, t.ready_approval_contract_version, t.ready_approval_content_hash, t.ready_contract_content_hash, (select jsonb_agg(jsonb_build_object('aggregate_id', e.aggregate_id, 'aggregate_version', e.aggregate_version, 'event_name', e.event_name) order by e.aggregate_version) from public.dev_board_activity_event e where e.aggregate_id in (p.id, t.id)) as mirrored_events from public.dev_board_proposal p join public.dev_board_dev_ticket t on t.source_proposal_id = p.id where p.id = ${proposalId}::uuid`,
          ),
        )[0],
      database!,
    );
    expect(Number(state!["proposal_version"])).toBe(3);
    expect(Number(state!["ticket_version"])).toBe(2);
    expect(state!["lane"]).toBe("todo");
    expect(Number(state!["ready_approval_contract_version"])).toBe(2);
    expect(state!["ready_approval_content_hash"]).toBe(
      computeReadyContractContentHash(approvedContent),
    );
    expect(state!["ready_contract_content_hash"]).toBe(
      computeReadyContractContentHash(approvedContent),
    );
    expect(state!["mirrored_events"]).toEqual(expect.arrayContaining([
      { aggregate_id: proposalId, aggregate_version: 2, event_name: "ProposalSubmitted" },
      { aggregate_id: proposalId, aggregate_version: 3, event_name: "ProposalAccepted" },
      { aggregate_id: ticketId, aggregate_version: 1, event_name: "DevTicketCreated" },
      { aggregate_id: ticketId, aggregate_version: 2, event_name: "ReadyApproved" },
    ]));
  });
  it("rejects a stale proposal version without aggregate or ledger writes", async () => {
    const proposalId = randomUUID();
    const command = envelope("SubmitProposal", proposalId, [
      { recordKind: "proposal", recordId: proposalId, version: 1 },
    ]);
    const result = await submitProposal(command, { proposalId }, deps!);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("dev_board.expected_version_drift");
    const counts = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(
            sql`select (select count(*) from public.dev_board_proposal where id = ${proposalId}::uuid) as proposal_count, (select count(*) from public.dev_board_activity_event where command_id = ${command.commandId}::uuid) as event_count`,
          ),
        )[0],
      database!,
    );
    expect(Number(counts!["proposal_count"])).toBe(0);
    expect(Number(counts!["event_count"])).toBe(0);
  });
  it("replays an identical idempotency key without a second mutation", async () => {
    const proposalId = randomUUID();
    const first = envelope("DraftProposal", proposalId);
    const replay = envelope("DraftProposal", proposalId, [], {
      commandId: randomUUID(),
      idempotencyKey: first.idempotencyKey,
      requestHash: first.requestHash,
    });

    const firstResult = await draftProposal(
      first,
      { discoverySummary: "Replay this proposal", blockingAssessment: "non_blocking" },
      deps!,
    );
    const replayResult = await draftProposal(
      replay,
      { discoverySummary: "Replay this proposal", blockingAssessment: "non_blocking" },
      deps!,
    );

    expect(firstResult).toMatchObject({ ok: true });
    expect(replayResult).toMatchObject({ ok: true });
    if (!firstResult.ok || !replayResult.ok) return;
    expect(replayResult.value.proposalId).toBe(firstResult.value.proposalId);

    const counts = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select
              (select count(*) from public.dev_board_proposal where id = ${proposalId}::uuid) as proposal_count,
              (select count(*) from public.dev_board_planning_decision_entry where aggregate_id = ${proposalId}::uuid) as planning_entry_count,
              (select count(*) from public.dev_board_activity_event where aggregate_id = ${proposalId}::uuid) as activity_event_count
          `),
        )[0],
      database!,
    );
    expect(Number(counts!["proposal_count"])).toBe(1);
    expect(Number(counts!["planning_entry_count"])).toBe(1);
    expect(Number(counts!["activity_event_count"])).toBe(0);
  });
  it("conflicts on the same idempotency key with a different request hash", async () => {
    const proposalId = randomUUID();
    const first = envelope("DraftProposal", proposalId);
    const conflict = envelope("DraftProposal", proposalId, [], {
      commandId: randomUUID(),
      idempotencyKey: first.idempotencyKey,
      requestHash: "b".repeat(64),
    });

    expect(
      (
        await draftProposal(
          first,
          { discoverySummary: "First request", blockingAssessment: "non_blocking" },
          deps!,
        )
      ).ok,
    ).toBe(true);
    const result = await draftProposal(
      conflict,
      { discoverySummary: "Conflicting request", blockingAssessment: "non_blocking" },
      deps!,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("dev_board.idempotency_conflict");

    const count = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select count(*) as proposal_count
            from public.dev_board_proposal
            where id = ${proposalId}::uuid
          `),
        )[0],
      database!,
    );
    expect(Number(count!["proposal_count"])).toBe(1);
  });
  it("turns a unique violation into one replayable rejected receipt", async () => {
    const proposalId = randomUUID();
    expect(
      (
        await draftProposal(
          envelope("DraftProposal", proposalId),
          { discoverySummary: "Unique proposal", blockingAssessment: "non_blocking" },
          deps!,
        )
      ).ok,
    ).toBe(true);
    const request = envelope("DraftProposal", proposalId);
    const result = await draftProposal(
      request,
      { discoverySummary: "Duplicate proposal", blockingAssessment: "non_blocking" },
      deps!,
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.code).toBe("dev_board.constraint_conflict");
    const replay = await draftProposal(
      { ...request, commandId: randomUUID() },
      { discoverySummary: "Duplicate proposal", blockingAssessment: "non_blocking" },
      deps!,
    );
    expect(replay).toMatchObject({ ok: false });
    if (!replay.ok && !result.ok) expect(replay.error.message).toBe(result.error.message);
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select count(*) from public.dev_board_command_receipt where command_name = 'DraftProposal' and idempotency_key = ${request.idempotencyKey}) as receipt_count,
        (select count(*) from public.dev_board_proposal where id = ${proposalId}::uuid) as proposal_count,
        (select count(*) from public.dev_board_planning_decision_entry where aggregate_id = ${proposalId}::uuid) as planning_entry_count
    `))[0], database!);
    expect(Number(state!["receipt_count"])).toBe(1);
    expect(Number(state!["proposal_count"])).toBe(1);
    expect(Number(state!["planning_entry_count"])).toBe(1);
  });
  it("rejects accepting a Proposal that is not awaiting a decision", async () => {
    const proposalId = randomUUID();
    const drafted = envelope("DraftProposal", proposalId);

    expect(
      (
        await draftProposal(
          drafted,
          { discoverySummary: "Draft only", blockingAssessment: "non_blocking" },
          deps!,
        )
      ).ok,
    ).toBe(true);
    const result = await acceptProposal(
      envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 1 },
      ]),
      { proposalId, humanOwnerUserId: ownerId },
      deps!,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("dev_board.proposal_not_awaiting_decision");

    const count = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select count(*) as ticket_count
            from public.dev_board_dev_ticket
            where source_proposal_id = ${proposalId}::uuid
          `),
        )[0],
      database!,
    );
    expect(Number(count!["ticket_count"])).toBe(0);
  });
  it("accepts a Proposal once and rejects a second accept with no second DevTicket", async () => {
    const proposalId = randomUUID();
    expect(
      (
        await draftProposal(
          envelope("DraftProposal", proposalId),
          { discoverySummary: "Single winner", blockingAssessment: "non_blocking" },
          deps!,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await submitProposal(
          envelope("SubmitProposal", proposalId, [
            { recordKind: "proposal", recordId: proposalId, version: 1 },
          ]),
          { proposalId },
          deps!,
        )
      ).ok,
    ).toBe(true);
    const first = await acceptProposal(
      envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 2 },
      ]),
      { proposalId, humanOwnerUserId: ownerId },
      deps!,
    );
    expect(first).toMatchObject({ ok: true });
    const second = await acceptProposal(
      envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 3 },
      ]),
      { proposalId, humanOwnerUserId: ownerId },
      deps!,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("dev_board.proposal_not_awaiting_decision");

    const count = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select count(*) as ticket_count
            from public.dev_board_dev_ticket
            where source_proposal_id = ${proposalId}::uuid
          `),
        )[0],
      database!,
    );
    expect(Number(count!["ticket_count"])).toBe(1);
  });
  it("rejects Ready approval on a stale contract hash and leaves the ticket in Backlog", async () => {
    const proposalId = randomUUID();
    expect(
      (
        await draftProposal(
          envelope("DraftProposal", proposalId),
          { discoverySummary: "Stale contract", blockingAssessment: "non_blocking" },
          deps!,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await submitProposal(
          envelope("SubmitProposal", proposalId, [
            { recordKind: "proposal", recordId: proposalId, version: 1 },
          ]),
          { proposalId },
          deps!,
        )
      ).ok,
    ).toBe(true);
    const accepted = await acceptProposal(
      envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 2 },
      ]),
      { proposalId, humanOwnerUserId: ownerId, initialContractContent: { outcome: "Draft" } },
      deps!,
    );
    expect(accepted).toMatchObject({ ok: true });
    if (!accepted.ok) return;
    const devTicketId = accepted.value.devTicketId!;
    const result = await approveReadyToTodo(
      envelope("ApproveReadyToTodo", devTicketId, [
        { recordKind: "dev_ticket", recordId: devTicketId, version: 1 },
      ]),
      {
        devTicketId,
        readyContractContent: { outcome: "Approved" },
        expectedContractVersion: 1,
        expectedContractContentHash: "0".repeat(64),
      },
      deps!,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("dev_board.stale_ready_contract");

    const ticket = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select lane, ready_state, version
            from public.dev_board_dev_ticket
            where id = ${devTicketId}::uuid
          `),
        )[0],
      database!,
    );
    expect(ticket!["lane"]).toBe("backlog");
    expect(ticket!["ready_state"]).toBe("draft");
    expect(Number(ticket!["version"])).toBe(1);
  });
  it("merges a decision-ready Proposal into an active DevTicket without creating another ticket", async () => {
    const acceptedProposalId = randomUUID();
    await draftProposal(envelope("DraftProposal", acceptedProposalId), { discoverySummary: "Target", blockingAssessment: "non_blocking" }, deps!);
    await submitProposal(envelope("SubmitProposal", acceptedProposalId, [{ recordKind: "proposal", recordId: acceptedProposalId, version: 1 }]), { proposalId: acceptedProposalId }, deps!);
    const accepted = await acceptProposal(envelope("AcceptProposal", acceptedProposalId, [{ recordKind: "proposal", recordId: acceptedProposalId, version: 2 }]), { proposalId: acceptedProposalId, humanOwnerUserId: ownerId }, deps!);
    expect(accepted).toMatchObject({ ok: true });
    if (!accepted.ok) return;
    const proposalId = randomUUID();
    await draftProposal(envelope("DraftProposal", proposalId), { discoverySummary: "Merge evidence", blockingAssessment: "non_blocking" }, deps!);
    await submitProposal(envelope("SubmitProposal", proposalId, [{ recordKind: "proposal", recordId: proposalId, version: 1 }]), { proposalId }, deps!);
    const mergeRequest = envelope("MergeProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 2 },
        { recordKind: "dev_ticket", recordId: accepted.value.devTicketId!, version: 1 },
      ]);
    const merged = await mergeProposal(mergeRequest, { proposalId, existingDevTicketId: accepted.value.devTicketId!, reason: "Same bounded work." }, deps!);
    expect(merged).toMatchObject({ ok: true });
    expect(await mergeProposal({ ...mergeRequest, commandId: randomUUID() }, { proposalId, existingDevTicketId: accepted.value.devTicketId!, reason: "Same bounded work." }, deps!)).toMatchObject({ ok: true, value: { commandId: mergeRequest.commandId } });
    const conflict = await mergeProposal({ ...mergeRequest, commandId: randomUUID(), requestHash: "b".repeat(64) }, { proposalId, existingDevTicketId: accepted.value.devTicketId!, reason: "Same bounded work." }, deps!);
    expect(conflict).toMatchObject({ ok: false });
    if (!conflict.ok) expect(conflict.error.code).toBe("dev_board.idempotency_conflict");
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select p.lifecycle_state, (select count(*) from public.dev_board_dev_ticket where source_proposal_id = ${proposalId}::uuid) as merged_ticket_count,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${proposalId}::uuid and event_name = 'ProposalMerged') as event_count
      from public.dev_board_proposal p where p.id = ${proposalId}::uuid
    `))[0], database!);
    expect(state!["lifecycle_state"]).toBe("merged");
    expect(Number(state!["merged_ticket_count"])).toBe(0);
    expect(Number(state!["event_count"])).toBe(1);
  });
  it("rejects, archives, and replays Proposal terminal decisions without mutation loops", async () => {
    const rejectedId = randomUUID();
    await draftProposal(envelope("DraftProposal", rejectedId), { discoverySummary: "Reject", blockingAssessment: "non_blocking" }, deps!);
    await submitProposal(envelope("SubmitProposal", rejectedId, [{ recordKind: "proposal", recordId: rejectedId, version: 1 }]), { proposalId: rejectedId }, deps!);
    const rejectedCommand = envelope("RejectProposal", rejectedId, [{ recordKind: "proposal", recordId: rejectedId, version: 2 }]);
    const rejected = await rejectProposal(rejectedCommand, { proposalId: rejectedId, reason: "Not actionable." }, deps!);
    expect(rejected.ok).toBe(true);
    const rejectReplay = await rejectProposal({ ...rejectedCommand, commandId: randomUUID() }, { proposalId: rejectedId, reason: "Not actionable." }, deps!);
    expect(rejectReplay).toMatchObject({ ok: true, value: { commandId: rejectedCommand.commandId } });
    const rejectedAgain = await rejectProposal(envelope("RejectProposal", rejectedId, [{ recordKind: "proposal", recordId: rejectedId, version: 3 }]), { proposalId: rejectedId, reason: "No." }, deps!);
    expect(rejectedAgain).toMatchObject({ ok: false });
    const archivedId = randomUUID();
    await draftProposal(envelope("DraftProposal", archivedId), { discoverySummary: "Archive", blockingAssessment: "non_blocking" }, deps!);
    const archiveRequest = envelope("ArchiveProposal", archivedId, [{ recordKind: "proposal", recordId: archivedId, version: 1 }]);
    const archived = await archiveProposal(archiveRequest, { proposalId: archivedId, reason: "Duplicate evidence." }, deps!);
    expect(archived.ok).toBe(true);
    expect(await archiveProposal({ ...archiveRequest, commandId: randomUUID() }, { proposalId: archivedId, reason: "Duplicate evidence." }, deps!)).toMatchObject({ ok: true, value: { commandId: archiveRequest.commandId } });
    const archiveAgain = await archiveProposal(envelope("ArchiveProposal", archivedId, [{ recordKind: "proposal", recordId: archivedId, version: 2 }]), { proposalId: archivedId, reason: "No longer visible." }, deps!);
    expect(archiveAgain).toMatchObject({ ok: false });
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select lifecycle_state, archived_at is not null as archived, (select count(*) from public.dev_board_activity_event where aggregate_id = ${archivedId}::uuid and event_name = 'ProposalArchived') as event_count
      from public.dev_board_proposal where id = ${archivedId}::uuid
    `))[0], database!);
    expect(state!["lifecycle_state"]).toBe("draft");
    expect(state!["archived"]).toBe(true);
    expect(Number(state!["event_count"])).toBe(1);
  });
  it("finalizes fail-closed workflow stubs and replays their original gate reason", async () => {
    const before = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select (select count(*) from public.dev_board_proposal where organization_id = ${organizationId}::uuid) as proposals,
        (select count(*) from public.dev_board_dev_ticket where organization_id = ${organizationId}::uuid) as tickets,
        (select count(*) from public.dev_board_activity_event where organization_id = ${organizationId}::uuid) as events
    `))[0], database!);
    const commands = [
      ["Claim", claim, "dev_board.gate.claim_disabled_until_tb02"],
      ["Start", start, "dev_board.gate.start_disabled_until_tb02"],
      ["SubmitForReview", submitForReview, "dev_board.gate.submit_for_review_disabled_until_tb-rv1"],
      ["AdmitDone", admitDone, "dev_board.gate.admit_done_disabled_until_tb-rv1"],
    ] as const;
    for (const [name, command, code] of commands) {
      const request = envelope(name, randomUUID());
      const result = await command(request, deps!);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error.code).toBe(code);
      const replay = await command({ ...request, commandId: randomUUID() }, deps!);
      expect(replay).toMatchObject({ ok: false });
      if (!replay.ok) expect(replay.error.message).toBe(result.ok ? "" : result.error.message);
    }
    const after = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select (select count(*) from public.dev_board_proposal where organization_id = ${organizationId}::uuid) as proposals,
        (select count(*) from public.dev_board_dev_ticket where organization_id = ${organizationId}::uuid) as tickets,
        (select count(*) from public.dev_board_activity_event where organization_id = ${organizationId}::uuid) as events
    `))[0], database!);
    expect(after).toEqual(before);
  });
  it("turns an FK violation into one replayable rejected receipt", async () => {
    const proposalId = randomUUID();
    await draftProposal(envelope("DraftProposal", proposalId), { discoverySummary: "Invalid owner", blockingAssessment: "non_blocking" }, deps!);
    await submitProposal(envelope("SubmitProposal", proposalId, [{ recordKind: "proposal", recordId: proposalId, version: 1 }]), { proposalId }, deps!);
    const request = envelope("AcceptProposal", proposalId, [{ recordKind: "proposal", recordId: proposalId, version: 2 }]);
    const result = await acceptProposal(request, { proposalId, humanOwnerUserId: `not-a-member-${randomUUID()}` }, deps!);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.code).toBe("dev_board.constraint_reference_invalid");
    const replay = await acceptProposal({ ...request, commandId: randomUUID() }, { proposalId, humanOwnerUserId: `not-a-member-${randomUUID()}` }, deps!);
    expect(replay).toMatchObject({ ok: false });
    if (!replay.ok && !result.ok) expect(replay.error.message).toBe(result.error.message);
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select (select count(*) from public.dev_board_command_receipt where command_name = 'AcceptProposal' and idempotency_key = ${request.idempotencyKey}) as receipt_count,
        (select count(*) from public.dev_board_dev_ticket where source_proposal_id = ${proposalId}::uuid) as ticket_count
    `))[0], database!);
    expect(Number(state!["receipt_count"])).toBe(1);
    expect(Number(state!["ticket_count"])).toBe(0);
  });
  it("enforces tenant isolation on cross-tenant proposal reads", async () => {
    const proposalId = randomUUID();
    await draftProposal(
      envelope("DraftProposal", proposalId),
      { discoverySummary: "isolated", blockingAssessment: "non_blocking" },
      deps!,
    );
    const result = await withTenant(
      otherOrganizationId,
      (tx) =>
        tx.execute(
          sql`select id from public.dev_board_proposal where id = ${proposalId}::uuid`,
        ),
      database!,
    );
    expect(rows(result)).toHaveLength(0);
  });
});

if (!enabled)
  describe("Dev Board planning lifecycle real-Postgres", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0021 applied", () => {});
  });
