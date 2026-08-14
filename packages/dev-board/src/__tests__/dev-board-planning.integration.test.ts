import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase, createPostgresPool, withTenant } from "@opzava/adapters";
import { PostgresCommandReceiptRepository } from "../adapters/postgres/postgres-command-receipt-repository.js";
import { PostgresDevBoardLedgerAppendStore } from "../adapters/postgres/postgres-dev-board-ledger-append-store.js";
import { PostgresDevBoardPlanningStore } from "../adapters/postgres/postgres-dev-board-planning-store.js";
import {
  acceptProposal,
  addDependency,
  admitDone,
  approveReadyToTodo,
  archiveProposal,
  claim,
  draftProposal,
  mergeProposal,
  removeDependency,
  rejectProposal,
  reorderTodo,
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
  async function createWorkspace(label: string) {
    const id = randomUUID();
    await adminPool!.query(
      "insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, $3, $4)",
      [id, organizationId, `dev-board-${id}`, label],
    );
    return id;
  }
  async function createBacklogTicket(
    summary: string,
    testWorkspaceId: CommandEnvelope["workspaceId"] = workspaceId,
  ): Promise<string> {
    const proposalId = randomUUID();
    const command = (commandName: string, targetAggregateId: string, expectedVersions: CommandEnvelope["expectedVersions"] = []) =>
      envelope(commandName, targetAggregateId, expectedVersions, { workspaceId: testWorkspaceId });
    expect((await draftProposal(command("DraftProposal", proposalId), {
      discoverySummary: summary, blockingAssessment: "non_blocking",
    }, deps!)).ok).toBe(true);
    expect((await submitProposal(command("SubmitProposal", proposalId, [
      { recordKind: "proposal", recordId: proposalId, version: 1 },
    ]), { proposalId }, deps!)).ok).toBe(true);
    const accepted = await acceptProposal(command("AcceptProposal", proposalId, [
      { recordKind: "proposal", recordId: proposalId, version: 2 },
    ]), { proposalId, humanOwnerUserId: ownerId, initialContractContent: { outcome: summary } }, deps!);
    expect(accepted).toMatchObject({ ok: true });
    if (!accepted.ok) throw accepted.error;
    return accepted.value.devTicketId!;
  }
  async function currentTodoQueueVersion(
    testWorkspaceId: CommandEnvelope["workspaceId"] = workspaceId,
  ): Promise<number> {
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select version from public.dev_board_lane_queue_version
      where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and lane = 'todo'
    `))[0], database!);
    return state === undefined ? 1 : Number(state["version"]);
  }
  async function approveTicket(
    summary: string,
    testWorkspaceId: CommandEnvelope["workspaceId"] = workspaceId,
  ): Promise<string> {
    const ticketId = await createBacklogTicket(summary, testWorkspaceId);
    const result = await approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: ticketId,
      readyContractContent: { outcome: summary },
      expectedContractVersion: 1,
      expectedContractContentHash: computeReadyContractContentHash({ outcome: summary }),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!);
    expect(result).toMatchObject({ ok: true });
    return ticketId;
  }
  async function seedTodoRanks(
    testWorkspaceId: CommandEnvelope["workspaceId"],
    summariesAndRanks: readonly (readonly [string, bigint])[],
  ): Promise<readonly string[]> {
    const ticketIds: string[] = [];
    for (const [summary] of summariesAndRanks) {
      ticketIds.push(await approveTicket(summary, testWorkspaceId));
    }
    await withTenant(organizationId, async (tx) => {
      for (const [index, ticketId] of ticketIds.entries()) {
        const [, rank] = summariesAndRanks[index]!;
        const updated = await deps!.planningStore.updateTodoQueueMembershipRank(tx, {
          organizationId, workspaceId: testWorkspaceId, devTicketId: ticketId, rank,
        });
        expect(updated).toBe(true);
      }
    }, database!);
    return ticketIds;
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
      await client.query("select set_config('app.current_org', $1, true)", [organizationId]);
      await client.query("delete from public.dev_board_lane_queue where organization_id = $1", [
        organizationId,
      ]);
      await client.query("delete from public.dev_board_lane_queue_version where organization_id = $1", [
        organizationId,
      ]);
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
    const testWorkspaceId = await createWorkspace("Ready approval isolated workspace");
    const proposalId = randomUUID();
    const drafted = envelope("DraftProposal", proposalId, [], { workspaceId: testWorkspaceId });
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
    ], { workspaceId: testWorkspaceId });
    expect((await submitProposal(submitted, { proposalId }, deps!)).ok).toBe(true);
    const accepted = await acceptProposal(
      envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 2 },
      ], { workspaceId: testWorkspaceId }),
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
      ], { workspaceId: testWorkspaceId }),
      {
        devTicketId: ticketId,
        readyContractContent: approvedContent,
        expectedContractVersion: 1,
        expectedContractContentHash: computeReadyContractContentHash({ outcome: "Ship" }),
        expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
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
        expectedTodoQueueVersion: await currentTodoQueueVersion(),
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
  it("invalidates Todo Ready approval and records one DependencyAdded activity event", async () => {
    const testWorkspaceId = await createWorkspace("Dependency add Todo workspace");
    const testEnvelope = (name: string, target: string, versions: CommandEnvelope["expectedVersions"] = []) =>
      envelope(name, target, versions, { workspaceId: testWorkspaceId });
    const dependent = await createBacklogTicket("Todo dependent added dependency", testWorkspaceId);
    const blocker = await createBacklogTicket("Todo dependency blocker", testWorkspaceId);
    const approvalContent = { outcome: "Todo dependent added dependency", scope: "dependency invalidation" };
    expect((await approveReadyToTodo(testEnvelope("ApproveReadyToTodo", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 1 },
    ]), {
      devTicketId: dependent,
      readyContractContent: approvalContent,
      expectedContractVersion: 1,
      expectedContractContentHash: computeReadyContractContentHash({ outcome: "Todo dependent added dependency" }),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!)).ok).toBe(true);

    const command = testEnvelope("AddDependency", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 2 },
      { recordKind: "dev_ticket", recordId: blocker, version: 1 },
      { recordKind: "lane_queue", recordId: "todo", version: await currentTodoQueueVersion(testWorkspaceId) },
    ]);
    expect((await addDependency(command, {
      dependentDevTicketId: dependent, blockerDevTicketId: blocker, reason: "This work now requires the blocker.",
    }, deps!)).ok).toBe(true);

    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, t.lane, t.ready_state, t.ready_approval_contract_version,
        t.ready_approved_by_user_id, t.ready_approval_content_hash,
        (select count(*) from public.dev_board_lane_queue q where q.dev_ticket_id = t.id) as queue_memberships,
        (select count(*) from public.dev_board_activity_event e
          where e.aggregate_id = t.id and e.aggregate_version = t.version) as new_version_event_count,
        (select count(*) from public.dev_board_activity_event e
          where e.aggregate_id = t.id and e.aggregate_version = t.version
            and e.event_name = 'DependencyAdded'
            and e.payload @> '{"readyInvalidated":true,"laneChanged":{"from":"todo","to":"backlog"}}'::jsonb) as invalidation_event_count
      from public.dev_board_dev_ticket t where t.id = ${dependent}::uuid
    `))[0], database!);
    expect(Number(state!["version"])).toBe(3);
    expect(state!["lane"]).toBe("backlog");
    expect(state!["ready_state"]).toBe("draft");
    expect(state!["ready_approval_contract_version"]).toBeNull();
    expect(state!["ready_approved_by_user_id"]).toBeNull();
    expect(state!["ready_approval_content_hash"]).toBeNull();
    expect(Number(state!["queue_memberships"])).toBe(0);
    expect(Number(state!["new_version_event_count"])).toBe(1);
    expect(Number(state!["invalidation_event_count"])).toBe(1);
  });
  it("invalidates Todo Ready approval and records one DependencyRemoved activity event", async () => {
    const testWorkspaceId = await createWorkspace("Dependency remove Todo workspace");
    const testEnvelope = (name: string, target: string, versions: CommandEnvelope["expectedVersions"] = []) =>
      envelope(name, target, versions, { workspaceId: testWorkspaceId });
    const dependent = await createBacklogTicket("Todo dependent removed dependency", testWorkspaceId);
    const blocker = await createBacklogTicket("Todo removal blocker", testWorkspaceId);
    const added = await addDependency(testEnvelope("AddDependency", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 1 },
      { recordKind: "dev_ticket", recordId: blocker, version: 1 },
    ]), {
      dependentDevTicketId: dependent, blockerDevTicketId: blocker, reason: "The dependency exists before approval.",
    }, deps!);
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) return;
    const approvalContent = { outcome: "Todo dependent removed dependency", scope: "dependency invalidation" };
    expect((await approveReadyToTodo(testEnvelope("ApproveReadyToTodo", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 2 },
    ]), {
      devTicketId: dependent,
      readyContractContent: approvalContent,
      expectedContractVersion: 1,
      expectedContractContentHash: computeReadyContractContentHash({ outcome: "Todo dependent removed dependency" }),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!)).ok).toBe(true);

    const command = testEnvelope("RemoveDependency", added.value.dependencyEdgeId!, [
      { recordKind: "lane_queue", recordId: "todo", version: await currentTodoQueueVersion(testWorkspaceId) },
    ]);
    expect((await removeDependency(command, {
      edgeId: added.value.dependencyEdgeId!, expectedEdgeVersion: 1, reason: "The dependency is no longer required.",
    }, deps!)).ok).toBe(true);

    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, t.lane, t.ready_state, t.ready_approval_contract_version,
        t.ready_approved_by_user_id, t.ready_approval_content_hash,
        (select count(*) from public.dev_board_lane_queue q where q.dev_ticket_id = t.id) as queue_memberships,
        (select count(*) from public.dev_board_activity_event e
          where e.aggregate_id = t.id and e.aggregate_version = t.version) as new_version_event_count,
        (select count(*) from public.dev_board_activity_event e
          where e.aggregate_id = t.id and e.aggregate_version = t.version
            and e.event_name = 'DependencyRemoved'
            and e.payload @> '{"readyInvalidated":true,"laneChanged":{"from":"todo","to":"backlog"}}'::jsonb) as invalidation_event_count
      from public.dev_board_dev_ticket t where t.id = ${dependent}::uuid
    `))[0], database!);
    expect(Number(state!["version"])).toBe(4);
    expect(state!["lane"]).toBe("backlog");
    expect(state!["ready_state"]).toBe("draft");
    expect(state!["ready_approval_contract_version"]).toBeNull();
    expect(state!["ready_approved_by_user_id"]).toBeNull();
    expect(state!["ready_approval_content_hash"]).toBeNull();
    expect(Number(state!["queue_memberships"])).toBe(0);
    expect(Number(state!["new_version_event_count"])).toBe(1);
    expect(Number(state!["invalidation_event_count"])).toBe(1);
  });
  it("serializes dependency edges, rejects cycles, retains retired history, and applies the live completion lock", async () => {
    const [a, b, c, dependent] = await Promise.all([
      createBacklogTicket("dependency A"), createBacklogTicket("dependency B"),
      createBacklogTicket("dependency C"), createBacklogTicket("locked dependent"),
    ]);
    const selfEdge = await addDependency(envelope("AddDependency", c), {
      dependentDevTicketId: c, blockerDevTicketId: c, reason: "Self edge is invalid.",
    }, deps!);
    expect(selfEdge).toMatchObject({ ok: false });
    if (!selfEdge.ok) expect(selfEdge.error.code).toBe("dev_board.dependency_cycle_rejected");
    const missingBlockerId = randomUUID();
    const missingBlocker = await addDependency(envelope("AddDependency", a, [
      { recordKind: "dev_ticket", recordId: a, version: 1 },
      { recordKind: "dev_ticket", recordId: missingBlockerId, version: 1 },
    ]), { dependentDevTicketId: a, blockerDevTicketId: missingBlockerId, reason: "Missing edge target." }, deps!);
    expect(missingBlocker).toMatchObject({ ok: false });
    if (!missingBlocker.ok) expect(missingBlocker.error.code).toBe("dev_board.constraint_reference_invalid");
    const first = await addDependency(envelope("AddDependency", a, [
      { recordKind: "dev_ticket", recordId: a, version: 1 },
      { recordKind: "dev_ticket", recordId: b, version: 1 },
    ]), { dependentDevTicketId: a, blockerDevTicketId: b, reason: "A needs B." }, deps!);
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;
    const edgeId = first.value.dependencyEdgeId!;
    const duplicate = await addDependency(envelope("AddDependency", a), {
      dependentDevTicketId: a, blockerDevTicketId: b, reason: "Duplicate edge.",
    }, deps!);
    expect(duplicate).toMatchObject({ ok: true, value: { dependencyEdgeId: edgeId } });
    expect((await addDependency(envelope("AddDependency", b, [
      { recordKind: "dev_ticket", recordId: b, version: 1 },
      { recordKind: "dev_ticket", recordId: c, version: 1 },
    ]), { dependentDevTicketId: b, blockerDevTicketId: c, reason: "B needs C." }, deps!)).ok).toBe(true);
    const cycle = await addDependency(envelope("AddDependency", c, [
      { recordKind: "dev_ticket", recordId: c, version: 1 },
      { recordKind: "dev_ticket", recordId: a, version: 2 },
    ]), { dependentDevTicketId: c, blockerDevTicketId: a, reason: "Must reject cycle." }, deps!);
    expect(cycle).toMatchObject({ ok: false });
    if (!cycle.ok) expect(cycle.error.code).toBe("dev_board.dependency_cycle_rejected");
    const staleRemoval = await removeDependency(envelope("RemoveDependency", edgeId), {
      edgeId, expectedEdgeVersion: 99, reason: "Wrong version.",
    }, deps!);
    expect(staleRemoval).toMatchObject({ ok: false });
    if (!staleRemoval.ok) expect(staleRemoval.error.code).toBe("dev_board.dependency_identity_conflict");
    const absentEdgeId = randomUUID();
    const absentRemoval = await removeDependency(envelope("RemoveDependency", absentEdgeId), {
      edgeId: absentEdgeId, expectedEdgeVersion: 1, reason: "Not active.",
    }, deps!);
    expect(absentRemoval).toMatchObject({ ok: false });
    if (!absentRemoval.ok) expect(absentRemoval.error.code).toBe("dev_board.dependency_not_active");
    const removeRequest = envelope("RemoveDependency", edgeId);
    const removed = await removeDependency(removeRequest, {
      edgeId, expectedEdgeVersion: 1, reason: "No longer required.",
    }, deps!);
    expect(removed).toMatchObject({ ok: true });
    expect(await removeDependency({ ...removeRequest, commandId: randomUUID() }, {
      edgeId, expectedEdgeVersion: 1, reason: "No longer required.",
    }, deps!)).toMatchObject({ ok: true, value: { commandId: removeRequest.commandId } });
    const alreadyRemoved = await removeDependency(envelope("RemoveDependency", edgeId), {
      edgeId, expectedEdgeVersion: 2, reason: "No second removal.",
    }, deps!);
    expect(alreadyRemoved).toMatchObject({ ok: false });
    if (!alreadyRemoved.ok) expect(alreadyRemoved.error.code).toBe("dev_board.already_removed");
    const readded = await addDependency(envelope("AddDependency", a, [
      { recordKind: "dev_ticket", recordId: a, version: 3 },
      { recordKind: "dev_ticket", recordId: b, version: 2 },
    ]), { dependentDevTicketId: a, blockerDevTicketId: b, reason: "Needed again." }, deps!);
    expect(readded).toMatchObject({ ok: true });
    if (!readded.ok) return;
    expect(readded.value.dependencyEdgeId).not.toBe(edgeId);
    const addLocked = await addDependency(envelope("AddDependency", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 1 },
      { recordKind: "dev_ticket", recordId: b, version: 2 },
    ]), { dependentDevTicketId: dependent, blockerDevTicketId: b, reason: "Blocks completion." }, deps!);
    expect(addLocked).toMatchObject({ ok: true });
    const lockedApprovalContent = { outcome: "locked dependent", scope: "can remain Todo while locked" };
    const approvedWhileLocked = await approveReadyToTodo(envelope("ApproveReadyToTodo", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 2 },
    ]), {
      devTicketId: dependent,
      readyContractContent: lockedApprovalContent,
      expectedContractVersion: 1,
      expectedContractContentHash: computeReadyContractContentHash({ outcome: "locked dependent" }),
      expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    expect(approvedWhileLocked).toMatchObject({ ok: true });
    const lockedStatus = await withTenant(organizationId, (tx) => deps!.planningStore.dependencyLockStatus(tx, organizationId, workspaceId, dependent), database!);
    expect(lockedStatus).toEqual({ locked: true, blockers: [{ devTicketId: b, done: false }] });
    const crossTenantStatus = await withTenant(otherOrganizationId, (tx) => deps!.planningStore.dependencyLockStatus(tx, otherOrganizationId, workspaceId, dependent), database!);
    expect(crossTenantStatus).toEqual({ locked: false, blockers: [] });
    const lockedClaim = await claim(envelope("Claim", dependent), deps!);
    expect(lockedClaim).toMatchObject({ ok: false });
    if (!lockedClaim.ok) expect(lockedClaim.error.code).toBe("dev_board.dependency_locked");
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select count(*) from public.dev_board_dependency_edge where dependent_dev_ticket_id = ${a}::uuid and blocker_dev_ticket_id = ${b}::uuid) as retained_edges,
        (select count(*) from public.dev_board_dependency_edge where dependent_dev_ticket_id = ${c}::uuid and blocker_dev_ticket_id = ${a}::uuid) as cycle_edges,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${a}::uuid and event_name = 'DependencyAdded') as added_events,
        (select count(*) from public.dev_board_planning_decision_entry where aggregate_id = ${a}::uuid and entry_kind = 'DependencyDecisionRationaleRecorded') as planning_entries
    `))[0], database!);
    expect(Number(state!["retained_edges"])).toBe(2);
    expect(Number(state!["cycle_edges"])).toBe(0);
    expect(Number(state!["added_events"])).toBe(2);
    expect(Number(state!["planning_entries"])).toBe(3);
  });
  it("places before the first Todo member with one ticket and queue-version bump", async () => {
    const testWorkspaceId = await createWorkspace("Todo before anchor workspace");
    const first = await approveTicket("before first", testWorkspaceId);
    await approveTicket("before second", testWorkspaceId);
    const moved = await approveTicket("before moved", testWorkspaceId);
    const queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    const result = await reorderTodo(envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: moved,
      sourceQueue: { lane: "todo", version: queueVersion },
      targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "before", neighborDevTicketId: first, neighborVersion: 2 },
    }, deps!);
    expect(result).toMatchObject({ ok: true });
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select rank from public.dev_board_lane_queue where dev_ticket_id = ${first}::uuid) as first_rank,
        (select rank from public.dev_board_lane_queue where dev_ticket_id = ${moved}::uuid) as moved_rank,
        (select version from public.dev_board_lane_queue_version where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and lane = 'todo') as queue_version,
        (select aggregate_version from public.dev_board_activity_event where aggregate_id = ${moved}::uuid and event_name = 'TodoReordered') as event_version
    `))[0], database!);
    expect(BigInt(String(state!["moved_rank"]))).toBe(BigInt(String(state!["first_rank"])) - 1_000_000n);
    expect(Number(state!["queue_version"])).toBe(queueVersion + 1);
    expect(Number(state!["event_version"])).toBe(3);
  });
  it("accepts empty_band for the only Todo member", async () => {
    const testWorkspaceId = await createWorkspace("Todo empty band workspace");
    const moved = await approveTicket("only Todo", testWorkspaceId);
    const queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    expect(await reorderTodo(envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: moved,
      sourceQueue: { lane: "todo", version: queueVersion },
      targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "empty_band" },
    }, deps!)).toMatchObject({ ok: true });
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select q.rank, h.version as queue_version,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${moved}::uuid and event_name = 'TodoReordered') as event_count
      from public.dev_board_lane_queue q join public.dev_board_lane_queue_version h
        on (h.organization_id, h.workspace_id, h.lane) = (q.organization_id, q.workspace_id, q.lane)
      where q.dev_ticket_id = ${moved}::uuid
    `))[0], database!);
    expect(BigInt(String(state!["rank"]))).toBe(2_000_000n);
    expect(Number(state!["queue_version"])).toBe(queueVersion + 1);
    expect(Number(state!["event_count"])).toBe(1);
  });
  it("rejects empty_band when another Todo member exists without queue writes", async () => {
    const testWorkspaceId = await createWorkspace("Todo nonempty band workspace");
    const moved = await approveTicket("nonempty moved", testWorkspaceId);
    await approveTicket("nonempty neighbor", testWorkspaceId);
    const queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    const before = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select dev_ticket_id, rank from public.dev_board_lane_queue where workspace_id = ${testWorkspaceId}::uuid order by rank, dev_ticket_id
    `)), database!);
    const rejected = await reorderTodo(envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: moved,
      sourceQueue: { lane: "todo", version: queueVersion },
      targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "empty_band" },
    }, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.todo_anchor_invalid");
    const after = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select jsonb_agg(jsonb_build_object('id', dev_ticket_id, 'rank', rank) order by rank, dev_ticket_id) from public.dev_board_lane_queue where workspace_id = ${testWorkspaceId}::uuid) as memberships,
        (select version from public.dev_board_lane_queue_version where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and lane = 'todo') as queue_version,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${moved}::uuid and event_name = 'TodoReordered') as event_count
    `))[0], database!);
    expect(after!["memberships"]).toEqual(before.map((row) => ({ id: row["dev_ticket_id"], rank: Number(row["rank"]) })));
    expect(Number(after!["queue_version"])).toBe(queueVersion);
    expect(Number(after!["event_count"])).toBe(0);
  });
  it("rebalances the whole Todo band after midpoint exhaustion with one activity event", async () => {
    const testWorkspaceId = await createWorkspace("Todo rebalance workspace");
    const [left, right, moved] = await seedTodoRanks(testWorkspaceId, [
      ["rebalance left", 3_000_000n], ["rebalance right", 3_000_001n], ["rebalance moved", 4_000_000n],
    ]);
    const queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    const result = await reorderTodo(envelope("ReorderTodo", moved!, [
      { recordKind: "dev_ticket", recordId: moved!, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: moved!, sourceQueue: { lane: "todo", version: queueVersion }, targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "after", neighborDevTicketId: left!, neighborVersion: 2 },
    }, deps!);
    expect(result).toMatchObject({ ok: true });
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select q.dev_ticket_id, q.rank,
        (select payload from public.dev_board_activity_event where aggregate_id = ${moved!}::uuid and event_name = 'TodoReordered') as payload,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${moved!}::uuid and event_name = 'TodoReordered') as event_count,
        (select version from public.dev_board_lane_queue_version where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and lane = 'todo') as queue_version
      from public.dev_board_lane_queue q where q.workspace_id = ${testWorkspaceId}::uuid order by q.rank, q.dev_ticket_id
    `)), database!);
    expect(state.map((row) => String(row["dev_ticket_id"]))).toEqual([left, moved, right]);
    expect(state.map((row) => BigInt(String(row["rank"])))).toEqual([2_000_000n, 3_000_000n, 4_000_000n]);
    expect(state[0]!["payload"]).toMatchObject({ rebalancedDevTicketIds: [left, moved, right] });
    expect(Number(state[0]!["event_count"])).toBe(1);
    expect(Number(state[0]!["queue_version"])).toBe(queueVersion + 1);
  });
  it("uses stride math at both Todo queue boundaries", async () => {
    const testWorkspaceId = await createWorkspace("Todo boundary workspace");
    const first = await approveTicket("boundary first", testWorkspaceId);
    const movedBefore = await approveTicket("boundary before", testWorkspaceId);
    const last = await approveTicket("boundary last", testWorkspaceId);
    const movedAfter = await approveTicket("boundary after", testWorkspaceId);
    let queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    expect(await reorderTodo(envelope("ReorderTodo", movedBefore, [
      { recordKind: "dev_ticket", recordId: movedBefore, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: movedBefore, sourceQueue: { lane: "todo", version: queueVersion }, targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "before", neighborDevTicketId: first, neighborVersion: 2 },
    }, deps!)).toMatchObject({ ok: true });
    queueVersion += 1;
    expect(await reorderTodo(envelope("ReorderTodo", movedAfter, [
      { recordKind: "dev_ticket", recordId: movedAfter, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: movedAfter, sourceQueue: { lane: "todo", version: queueVersion }, targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "after", neighborDevTicketId: last, neighborVersion: 2 },
    }, deps!)).toMatchObject({ ok: true });
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select dev_ticket_id, rank from public.dev_board_lane_queue
      where workspace_id = ${testWorkspaceId}::uuid and dev_ticket_id in (${first}::uuid, ${movedBefore}::uuid, ${last}::uuid, ${movedAfter}::uuid)
    `)), database!);
    const ranks = new Map(state.map((row) => [String(row["dev_ticket_id"]), BigInt(String(row["rank"]))]));
    expect(ranks.get(movedBefore)).toBe(ranks.get(first)! - 1_000_000n);
    expect(ranks.get(movedAfter)).toBe(ranks.get(last)! + 1_000_000n);
  });
  it("replays a rejected stale reorder and accepts a new key only at the current queue version", async () => {
    const testWorkspaceId = await createWorkspace("Todo rejected replay workspace");
    const moved = await approveTicket("rejected replay moved", testWorkspaceId);
    const neighbor = await approveTicket("rejected replay neighbor", testWorkspaceId);
    const currentVersion = await currentTodoQueueVersion(testWorkspaceId);
    const staleVersion = currentVersion - 1;
    const request = envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: staleVersion },
    ], { workspaceId: testWorkspaceId });
    const staleInput = {
      devTicketId: moved, sourceQueue: { lane: "todo" as const, version: staleVersion }, targetQueue: { lane: "todo" as const, version: staleVersion },
      anchor: { kind: "after" as const, neighborDevTicketId: neighbor, neighborVersion: 2 },
    };
    const rejected = await reorderTodo(request, staleInput, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.lane_queue_version_drift");
    const replay = await reorderTodo({ ...request, commandId: randomUUID() }, staleInput, deps!);
    expect(replay).toMatchObject({ ok: false });
    if (!replay.ok && !rejected.ok) expect(replay.error.message).toBe(rejected.error.message);
    const afterRejected = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select version from public.dev_board_lane_queue_version where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and lane = 'todo') as queue_version,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${moved}::uuid and event_name = 'TodoReordered') as event_count,
        (select version from public.dev_board_dev_ticket where id = ${moved}::uuid) as ticket_version
    `))[0], database!);
    expect(Number(afterRejected!["queue_version"])).toBe(currentVersion);
    expect(Number(afterRejected!["event_count"])).toBe(0);
    expect(Number(afterRejected!["ticket_version"])).toBe(2);
    expect(await reorderTodo(envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: currentVersion },
    ], { workspaceId: testWorkspaceId }), {
      ...staleInput,
      sourceQueue: { lane: "todo", version: currentVersion },
      targetQueue: { lane: "todo", version: currentVersion },
    }, deps!)).toMatchObject({ ok: true });
  });
  it("enforces Todo membership integrity in the deferred trigger with tenant context", async () => {
    const testWorkspaceId = await createWorkspace("Todo trigger workspace");
    const ticketId = await approveTicket("trigger enforcement", testWorkspaceId);
    await expect(withTenant(organizationId, async (tx) => {
      await tx.execute(sql`
        update public.dev_board_dev_ticket set lane = 'backlog'
        where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and id = ${ticketId}::uuid
      `);
    }, database!)).rejects.toThrow();
    await expect(withTenant(organizationId, async (tx) => {
      await tx.execute(sql`
        delete from public.dev_board_lane_queue
        where organization_id = ${organizationId}::uuid and workspace_id = ${testWorkspaceId}::uuid and dev_ticket_id = ${ticketId}::uuid
      `);
    }, database!)).rejects.toThrow();
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.lane, count(q.dev_ticket_id) as membership_count
      from public.dev_board_dev_ticket t left join public.dev_board_lane_queue q on q.dev_ticket_id = t.id
      where t.id = ${ticketId}::uuid group by t.lane
    `))[0], database!);
    expect(state!["lane"]).toBe("todo");
    expect(Number(state!["membership_count"])).toBe(1);
  });
  it("reorders Todo by its authoritative versioned queue and replays without a second mutation", async () => {
    const testWorkspaceId = await createWorkspace("Todo replay workspace");
    const first = await approveTicket("queue first", testWorkspaceId);
    const moved = await approveTicket("queue moved", testWorkspaceId);
    const last = await approveTicket("queue last", testWorkspaceId);
    const queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    const request = envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 2 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId });
    const input = {
      devTicketId: moved,
      sourceQueue: { lane: "todo" as const, version: queueVersion },
      targetQueue: { lane: "todo" as const, version: queueVersion },
      anchor: { kind: "after" as const, neighborDevTicketId: first, neighborVersion: 2 },
    };
    const result = await reorderTodo(request, input, deps!);
    expect(result).toMatchObject({ ok: true, value: { resultingVersions: expect.arrayContaining([
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion + 1 },
    ]) } });
    expect(await reorderTodo({ ...request, commandId: randomUUID() }, input, deps!)).toMatchObject({
      ok: true, value: { commandId: request.commandId },
    });
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select dev_ticket_id, rank from public.dev_board_lane_queue
      where workspace_id = ${testWorkspaceId}::uuid and dev_ticket_id in (${first}::uuid, ${moved}::uuid, ${last}::uuid)
      order by dev_ticket_id
    `)), database!);
    const ranks = new Map(state.map((row) => [String(row["dev_ticket_id"]), BigInt(String(row["rank"]))]));
    expect(ranks.get(moved)).toBe((ranks.get(first)! + ranks.get(last)!) / 2n);
    const crossTenantQueueRows = await withTenant(otherOrganizationId, (tx) => tx.execute(sql`
      select dev_ticket_id from public.dev_board_lane_queue where dev_ticket_id = ${moved}::uuid
    `), database!);
    expect(rows(crossTenantQueueRows)).toHaveLength(0);
    const events = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select count(*) as count from public.dev_board_activity_event
      where aggregate_id = ${moved}::uuid and event_name = 'TodoReordered'
    `))[0], database!);
    expect(Number(events!["count"])).toBe(1);
  });
});

if (!enabled)
  describe("Dev Board planning lifecycle real-Postgres", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0021 applied", () => {});
  });
