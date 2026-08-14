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
  archiveDevTicket,
  archiveProposal,
  claim,
  draftProposal,
  mergeProposal,
  removeDependency,
  rejectProposal,
  reorderTodo,
  restoreDevTicket,
  restoreProposal,
  setDevTicketClassification,
  start,
  submitForReview,
  submitProposal,
  type DevBoardPlanningCommandDependencies,
} from "../application/dev-board-planning-commands.js";
import { computeReadyContractContentHash } from "../domain/dev-ticket.js";
import { evaluateChangeRisk } from "../domain/change-risk-policy.js";
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
  const auxiliaryUserIds: string[] = [];
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
      actorRef: { kind: "user", stableId: ownerId, role: "human_owner" },
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
  async function ticketVersionAndEventCount(ticketId: string): Promise<Readonly<Record<string, unknown>>> {
    return withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, count(e.id) as event_count
      from public.dev_board_dev_ticket t
      left join public.dev_board_activity_event e on e.aggregate_id = t.id
      where t.id = ${ticketId}::uuid
      group by t.version
    `))[0]!, database!);
  }
  async function seedMember(
    membershipOrganizationId: string,
    status: "active" | "invited" | "suspended" | "removed",
  ): Promise<string> {
    const userId = `member-${randomUUID()}`;
    auxiliaryUserIds.push(userId);
    await adminPool!.query("insert into public.auth_users (id, name, email) values ($1, $2, $3)", [
      userId, "Matrix member", `${userId}@example.test`,
    ]);
    await withTenant(membershipOrganizationId, (tx) => tx.execute(sql`
      insert into public.memberships (organization_id, user_id, status)
      values (${membershipOrganizationId}::uuid, ${userId}, ${status})
    `), database!);
    return userId;
  }
  async function grantOrganizationRole(userId: string, role: "admin" | "owner"): Promise<void> {
    await withTenant(organizationId, (tx) => tx.execute(sql`
      insert into public.role_grants (
        organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id
      ) values (${organizationId}::uuid, 'user', ${userId}, ${role}, 'organization', ${organizationId}::uuid, ${ownerId})
    `), database!);
  }
  async function createDecisionProposal(summary: string): Promise<string> {
    const proposalId = randomUUID();
    expect((await draftProposal(envelope("DraftProposal", proposalId), {
      discoverySummary: summary, blockingAssessment: "non_blocking",
    }, deps!)).ok).toBe(true);
    expect((await submitProposal(envelope("SubmitProposal", proposalId, [
      { recordKind: "proposal", recordId: proposalId, version: 1 },
    ]), { proposalId }, deps!)).ok).toBe(true);
    return proposalId;
  }
  async function approveTicket(
    summary: string,
    testWorkspaceId: CommandEnvelope["workspaceId"] = workspaceId,
  ): Promise<string> {
    const ticketId = await createBacklogTicket(summary, testWorkspaceId);
    const content = await classifyTicket(ticketId, summary, testWorkspaceId);
    const result = await approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: ticketId,
      readyContractContent: content,
      expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(content),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!);
    expect(result).toMatchObject({ ok: true });
    return ticketId;
  }
  async function classifyTicket(ticketId: string, outcome: string, testWorkspaceId: CommandEnvelope["workspaceId"] = workspaceId, hasActiveDependencies = false, expectedVersion = 1): Promise<Readonly<Record<string, unknown>>> {
    const result = await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: expectedVersion }], { workspaceId: testWorkspaceId }), {
      devTicketId: ticketId, type: "feature", workAreas: ["backend_api"], priority: "p1", declaredChangeRisk: hasActiveDependencies ? "medium" : "low",
    }, deps!);
    expect(result).toMatchObject({ ok: true });
    const policy = evaluateChangeRisk({ type: "feature", workAreas: ["backend_api"], hasActiveDependencies });
    return { outcome, humanOwnerUserId: ownerId, classification: { type: "feature", workAreas: ["backend_api"], priority: "p1", declaredChangeRisk: hasActiveDependencies ? "medium" : "low" }, changeRiskPolicy: policy };
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
    const classificationConstraint = rows(await database!.execute(sql`
      select convalidated
      from pg_constraint
      where conname = 'dev_board_dev_ticket_ready_classification_check'
    `))[0];
    expect(classificationConstraint?.["convalidated"]).toBe(true);
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
    await adminPool!.query(
      "insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'admin', 'organization', $1, $2)",
      [organizationId, ownerId],
    );
    const helpersWithoutTenant = rows(await database!.execute(sql`
      select app.is_active_member(${organizationId}::uuid, ${ownerId}) as active_member,
        app.has_organization_role(${organizationId}::uuid, ${ownerId}, 'admin') as has_role
    `))[0];
    expect(helpersWithoutTenant?.["active_member"]).toBe(false);
    expect(helpersWithoutTenant?.["has_role"]).toBe(false);
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
    await adminPool.query("delete from public.role_grants where organization_id = $1 or organization_id = $2", [
      organizationId, otherOrganizationId,
    ]);
    await adminPool.query("delete from public.memberships where organization_id = $1 or organization_id = $2", [
      organizationId, otherOrganizationId,
    ]);
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [[ownerId, ...auxiliaryUserIds]]);
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
    const classifiedContent = await classifyTicket(ticketId, "Ship", testWorkspaceId);
    const approvedContent = { ...classifiedContent, scope: "only Dev Board" };
    const approved = await approveReadyToTodo(
      envelope("ApproveReadyToTodo", ticketId, [
        { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
      ], { workspaceId: testWorkspaceId }),
      {
        devTicketId: ticketId,
        readyContractContent: approvedContent,
        expectedContractVersion: 2,
        expectedContractContentHash: computeReadyContractContentHash(classifiedContent),
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
    expect(Number(state!["ticket_version"])).toBe(3);
    expect(state!["lane"]).toBe("todo");
    expect(Number(state!["ready_approval_contract_version"])).toBe(3);
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
      { aggregate_id: ticketId, aggregate_version: 2, event_name: "DevTicketClassificationChanged" },
      { aggregate_id: ticketId, aggregate_version: 3, event_name: "ReadyApproved" },
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
    await classifyTicket(devTicketId, "Draft");
    const result = await approveReadyToTodo(
      envelope("ApproveReadyToTodo", devTicketId, [
        { recordKind: "dev_ticket", recordId: devTicketId, version: 2 },
      ]),
      {
        devTicketId,
        readyContractContent: { outcome: "Approved" },
        expectedContractVersion: 2,
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
    expect(Number(ticket!["version"])).toBe(2);
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
    if (!result.ok) expect(result.error.code).toBe("dev_board.human_owner_not_active_member");
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
    const classifiedContent = await classifyTicket(dependent, "Todo dependent added dependency", testWorkspaceId);
    const approvalContent = { ...classifiedContent, scope: "dependency invalidation" };
    expect((await approveReadyToTodo(testEnvelope("ApproveReadyToTodo", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 2 },
    ]), {
      devTicketId: dependent,
      readyContractContent: approvalContent,
      expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash({ ...classifiedContent }),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!)).ok).toBe(true);

    const command = testEnvelope("AddDependency", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 3 },
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
    const classifiedContent = await classifyTicket(dependent, "Todo dependent removed dependency", testWorkspaceId, true, 2);
    const approvalContent = { ...classifiedContent, scope: "dependency invalidation" };
    expect((await approveReadyToTodo(testEnvelope("ApproveReadyToTodo", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 3 },
    ]), {
      devTicketId: dependent,
      readyContractContent: approvalContent,
      expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash({ ...classifiedContent }),
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
    expect(Number(state!["version"])).toBe(5);
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
    const lockedClassifiedContent = await classifyTicket(dependent, "locked dependent", workspaceId, true, 2);
    const lockedApprovalContent = { ...lockedClassifiedContent, scope: "can remain Todo while locked" };
    const approvedWhileLocked = await approveReadyToTodo(envelope("ApproveReadyToTodo", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 3 },
    ]), {
      devTicketId: dependent,
      readyContractContent: lockedApprovalContent,
      expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(lockedClassifiedContent),
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
      { recordKind: "dev_ticket", recordId: moved, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: moved,
      sourceQueue: { lane: "todo", version: queueVersion },
      targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "before", neighborDevTicketId: first, neighborVersion: 3 },
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
    expect(Number(state!["event_version"])).toBe(4);
  });
  it("accepts empty_band for the only Todo member", async () => {
    const testWorkspaceId = await createWorkspace("Todo empty band workspace");
    const moved = await approveTicket("only Todo", testWorkspaceId);
    const queueVersion = await currentTodoQueueVersion(testWorkspaceId);
    expect(await reorderTodo(envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 3 },
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
      { recordKind: "dev_ticket", recordId: moved, version: 3 },
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
      { recordKind: "dev_ticket", recordId: moved!, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: moved!, sourceQueue: { lane: "todo", version: queueVersion }, targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "after", neighborDevTicketId: left!, neighborVersion: 3 },
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
      { recordKind: "dev_ticket", recordId: movedBefore, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: movedBefore, sourceQueue: { lane: "todo", version: queueVersion }, targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "before", neighborDevTicketId: first, neighborVersion: 3 },
    }, deps!)).toMatchObject({ ok: true });
    queueVersion += 1;
    expect(await reorderTodo(envelope("ReorderTodo", movedAfter, [
      { recordKind: "dev_ticket", recordId: movedAfter, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: movedAfter, sourceQueue: { lane: "todo", version: queueVersion }, targetQueue: { lane: "todo", version: queueVersion },
      anchor: { kind: "after", neighborDevTicketId: last, neighborVersion: 3 },
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
      { recordKind: "dev_ticket", recordId: moved, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: staleVersion },
    ], { workspaceId: testWorkspaceId });
    const staleInput = {
      devTicketId: moved, sourceQueue: { lane: "todo" as const, version: staleVersion }, targetQueue: { lane: "todo" as const, version: staleVersion },
      anchor: { kind: "after" as const, neighborDevTicketId: neighbor, neighborVersion: 3 },
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
    expect(Number(afterRejected!["ticket_version"])).toBe(3);
    expect(await reorderTodo(envelope("ReorderTodo", moved, [
      { recordKind: "dev_ticket", recordId: moved, version: 3 },
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
      { recordKind: "dev_ticket", recordId: moved, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: queueVersion },
    ], { workspaceId: testWorkspaceId });
    const input = {
      devTicketId: moved,
      sourceQueue: { lane: "todo" as const, version: queueVersion },
      targetQueue: { lane: "todo" as const, version: queueVersion },
      anchor: { kind: "after" as const, neighborDevTicketId: first, neighborVersion: 3 },
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
  it("rejects classification changes after Todo without writes and replays the terminal receipt", async () => {
    const testWorkspaceId = await createWorkspace("Todo classification revision");
    const ticketId = await approveTicket("Todo classification revision", testWorkspaceId);
    const request = envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 3 },
    ], { workspaceId: testWorkspaceId });
    const input = { devTicketId: ticketId, type: "feature", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low" };
    const before = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, count(e.id) as events from public.dev_board_dev_ticket t
      left join public.dev_board_activity_event e on e.aggregate_id = t.id
      where t.id = ${ticketId}::uuid group by t.version
    `))[0], database!);
    const rejected = await setDevTicketClassification(request, input, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.classification_revision_required");
    const replay = await setDevTicketClassification({ ...request, commandId: randomUUID() }, input, deps!);
    expect(replay).toMatchObject({ ok: false });
    if (!replay.ok && !rejected.ok) expect(replay.error.message).toBe(rejected.error.message);
    const after = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, count(e.id) as events from public.dev_board_dev_ticket t
      left join public.dev_board_activity_event e on e.aggregate_id = t.id
      where t.id = ${ticketId}::uuid group by t.version
    `))[0], database!);
    expect(after).toEqual(before);
  });
  it("rejects declared Change Risk below the policy floor during classification without writes", async () => {
    const ticketId = await createBacklogTicket("Bug risk floor");
    const request = envelope("SetDevTicketClassification", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: 1 }]);
    const rejected = await setDevTicketClassification(request, {
      devTicketId: ticketId, type: "bug", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low",
    }, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.change_risk_below_policy_minimum");
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, count(e.id) as event_count from public.dev_board_dev_ticket t
      left join public.dev_board_activity_event e on e.aggregate_id = t.id
      where t.id = ${ticketId}::uuid group by t.version
    `))[0], database!);
    expect(Number(state!["version"])).toBe(1);
    expect(Number(state!["event_count"])).toBe(1);
  });
  it("recomputes the Change Risk floor at Ready approval and requires a fresh classification", async () => {
    const testWorkspaceId = await createWorkspace("Risk drift authority");
    const ticketId = await createBacklogTicket("Risk drift dependent", testWorkspaceId);
    const blockerId = await createBacklogTicket("Risk drift blocker", testWorkspaceId);
    const oldContent = await classifyTicket(ticketId, "Risk drift dependent", testWorkspaceId);
    expect((await addDependency(envelope("AddDependency", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
      { recordKind: "dev_ticket", recordId: blockerId, version: 1 },
    ], { workspaceId: testWorkspaceId }), {
      dependentDevTicketId: ticketId, blockerDevTicketId: blockerId, reason: "The blocker raises delivery risk.",
    }, deps!)).ok).toBe(true);
    const rejectedRequest = envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 3 },
    ], { workspaceId: testWorkspaceId });
    const rejected = await approveReadyToTodo(rejectedRequest, {
      devTicketId: ticketId, readyContractContent: oldContent, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(oldContent),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.change_risk_below_policy_minimum");
    const afterRejection = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, t.lane,
        (select count(*) from public.dev_board_activity_event where command_id = ${rejectedRequest.commandId}::uuid) as rejected_event_count
      from public.dev_board_dev_ticket t where t.id = ${ticketId}::uuid
    `))[0], database!);
    expect(Number(afterRejection!["version"])).toBe(3);
    expect(afterRejection!["lane"]).toBe("backlog");
    expect(Number(afterRejection!["rejected_event_count"])).toBe(0);
    const freshContent = await classifyTicket(ticketId, "Risk drift dependent", testWorkspaceId, true, 3);
    const approved = await approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 4 },
    ], { workspaceId: testWorkspaceId }), {
      devTicketId: ticketId, readyContractContent: freshContent, expectedContractVersion: 3,
      expectedContractContentHash: computeReadyContractContentHash(freshContent),
      expectedTodoQueueVersion: await currentTodoQueueVersion(testWorkspaceId),
    }, deps!);
    expect(approved).toMatchObject({ ok: true });
  });
  it("rejects Ready contracts missing or tampering with the persisted classification", async () => {
    const ticketId = await createBacklogTicket("Ready contract classification binding");
    const content = await classifyTicket(ticketId, "Ready contract classification binding");
    const request = async (readyContractContent: Readonly<Record<string, unknown>>) => approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
    ]), {
      devTicketId: ticketId, readyContractContent, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(content), expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    const missing = await request({ outcome: "No classification blocks" });
    expect(missing).toMatchObject({ ok: false });
    if (!missing.ok) expect(missing.error.code).toBe("dev_board.ready_contract_missing_classification");
    const tampered = await request({ ...content, classification: { ...(content["classification"] as Record<string, unknown>), priority: "p0" } });
    expect(tampered).toMatchObject({ ok: false });
    if (!tampered.ok) expect(tampered.error.code).toBe("dev_board.ready_contract_missing_classification");
  });
  it("requires a trusted user owner or organization role for Ready approval", async () => {
    const ticketId = await createBacklogTicket("Ready authorization role");
    const content = await classifyTicket(ticketId, "Ready authorization role");
    const approverId = await seedMember(organizationId, "active");
    const approval = async (actorRef: CommandEnvelope["actorRef"]) => approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
    ], { actorRef }), {
      devTicketId: ticketId, readyContractContent: content, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(content), expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    const fakeAdmin = await approval({ kind: "user", role: "admin", stableId: approverId });
    expect(fakeAdmin).toMatchObject({ ok: false });
    if (!fakeAdmin.ok) expect(fakeAdmin.error.code).toBe("dev_board.ready_approval_human_authorization_required");
    await grantOrganizationRole(approverId, "admin");
    expect(await approval({ kind: "user", role: "admin", stableId: approverId })).toMatchObject({ ok: true });
  });
  it("rejects an agent that asserts the Human Owner user id for Ready approval", async () => {
    const ticketId = await createBacklogTicket("Agent owner impersonation");
    const content = await classifyTicket(ticketId, "Agent owner impersonation");
    const rejected = await approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
    ], { actorRef: { kind: "agent", role: "agent", stableId: ownerId } }), {
      devTicketId: ticketId, readyContractContent: content, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(content), expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.ready_approval_human_authorization_required");
  });
  it("terminally rejects invalid actor kinds and roles and replays their original rejection", async () => {
    const invalidActors = [
      { kind: "human", role: "human_owner", stableId: ownerId },
      { kind: "user", role: "owner", stableId: ownerId },
    ] as const;
    for (const actorRef of invalidActors) {
      const proposalId = randomUUID();
      const request = envelope("DraftProposal", proposalId, [], { actorRef: actorRef as never });
      const rejected = await draftProposal(request, { discoverySummary: "Invalid actor", blockingAssessment: "non_blocking" }, deps!);
      expect(rejected).toMatchObject({ ok: false });
      if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.invalid_actor_ref");
      const replay = await draftProposal({ ...request, commandId: randomUUID() }, {
        discoverySummary: "Invalid actor", blockingAssessment: "non_blocking",
      }, deps!);
      expect(replay).toMatchObject({ ok: false });
      if (!replay.ok && !rejected.ok) expect(replay.error.message).toBe(rejected.error.message);
    }
  });
  it("requires owner candidates to be active members of the target organization", async () => {
    for (const status of ["invited", "suspended", "removed"] as const) {
      const candidateId = await seedMember(organizationId, status);
      const proposalId = await createDecisionProposal(`Accept ${status} owner`);
      const rejectedAccept = await acceptProposal(envelope("AcceptProposal", proposalId, [
        { recordKind: "proposal", recordId: proposalId, version: 2 },
      ]), { proposalId, humanOwnerUserId: candidateId }, deps!);
      expect(rejectedAccept).toMatchObject({ ok: false });
      if (!rejectedAccept.ok) expect(rejectedAccept.error.code).toBe("dev_board.human_owner_not_active_member");
      const ticketId = await createBacklogTicket(`Classify ${status} owner`);
      const rejectedClassification = await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
        { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
      ]), {
        devTicketId: ticketId, type: "feature", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low",
        humanOwnerUserId: candidateId,
      }, deps!);
      expect(rejectedClassification).toMatchObject({ ok: false });
      if (!rejectedClassification.ok) expect(rejectedClassification.error.code).toBe("dev_board.human_owner_not_active_member");
    }
    const activeId = await seedMember(organizationId, "active");
    const activeProposalId = await createDecisionProposal("Accept active owner");
    expect(await acceptProposal(envelope("AcceptProposal", activeProposalId, [
      { recordKind: "proposal", recordId: activeProposalId, version: 2 },
    ]), { proposalId: activeProposalId, humanOwnerUserId: activeId }, deps!)).toMatchObject({ ok: true });
    const activeTicketId = await createBacklogTicket("Classify active owner");
    expect(await setDevTicketClassification(envelope("SetDevTicketClassification", activeTicketId, [
      { recordKind: "dev_ticket", recordId: activeTicketId, version: 1 },
    ]), {
      devTicketId: activeTicketId, type: "feature", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low",
      humanOwnerUserId: activeId,
    }, deps!)).toMatchObject({ ok: true });
    const crossOrganizationId = await seedMember(otherOrganizationId, "active");
    const crossProposalId = await createDecisionProposal("Cross organization owner");
    const crossAccept = await acceptProposal(envelope("AcceptProposal", crossProposalId, [
      { recordKind: "proposal", recordId: crossProposalId, version: 2 },
    ]), { proposalId: crossProposalId, humanOwnerUserId: crossOrganizationId }, deps!);
    expect(crossAccept).toMatchObject({ ok: false });
    if (!crossAccept.ok) expect(crossAccept.error.code).toBe("dev_board.human_owner_not_active_member");
    const crossTicketId = await createBacklogTicket("Cross organization classification owner");
    const crossClassification = await setDevTicketClassification(envelope("SetDevTicketClassification", crossTicketId, [
      { recordKind: "dev_ticket", recordId: crossTicketId, version: 1 },
    ]), {
      devTicketId: crossTicketId, type: "feature", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low",
      humanOwnerUserId: crossOrganizationId,
    }, deps!);
    expect(crossClassification).toMatchObject({ ok: false });
    if (!crossClassification.ok) expect(crossClassification.error.code).toBe("dev_board.human_owner_not_active_member");
  });
  it("rejects severity on a non-Bug classification", async () => {
    const ticketId = await createBacklogTicket("Feature severity invalid");
    const rejected = await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
    ]), {
      devTicketId: ticketId, type: "feature", workAreas: ["documentation"], priority: "p1", severity: "s1", declaredChangeRisk: "low",
    }, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.classification_invalid");
  });
  it("pins unchanged classification as a terminal zero-write rejection", async () => {
    const ticketId = await createBacklogTicket("Classification unchanged");
    const input = { devTicketId: ticketId, type: "feature", workAreas: ["backend_api"], priority: "p1", declaredChangeRisk: "low" };
    expect((await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
    ]), input, deps!)).ok).toBe(true);
    const request = envelope("SetDevTicketClassification", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: 2 }]);
    const rejected = await setDevTicketClassification(request, input, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.classification_unchanged");
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, count(e.id) as classification_events from public.dev_board_dev_ticket t
      left join public.dev_board_activity_event e on e.aggregate_id = t.id and e.event_name = 'DevTicketClassificationChanged'
      where t.id = ${ticketId}::uuid group by t.version
    `))[0], database!);
    expect(Number(state!["version"])).toBe(2);
    expect(Number(state!["classification_events"])).toBe(1);
  });
  it("writes sorted work areas, materiality reasons, and one classification event atomically", async () => {
    const ticketId = await createBacklogTicket("Classification atomicity");
    expect((await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
    ]), {
      devTicketId: ticketId, type: "feature", workAreas: ["backend_api"], priority: "p1", declaredChangeRisk: "low",
    }, deps!)).ok).toBe(true);
    expect((await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
    ]), {
      devTicketId: ticketId, type: "feature", workAreas: ["frontend", "documentation"], priority: "p2", declaredChangeRisk: "low",
    }, deps!)).ok).toBe(true);
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select jsonb_agg(work_area order by work_area) from public.dev_board_dev_ticket_work_area where dev_ticket_id = ${ticketId}::uuid) as work_areas,
        (select content->'reasonCodes' from public.dev_board_planning_decision_entry where aggregate_id = ${ticketId}::uuid and entry_kind = 'ClassificationMaterialityAssessed' order by created_at desc limit 1) as reason_codes,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${ticketId}::uuid and aggregate_version = 3 and event_name = 'DevTicketClassificationChanged') as new_version_events
    `))[0], database!);
    expect(state!["work_areas"]).toEqual(["documentation", "frontend"]);
    expect(state!["reason_codes"]).toEqual(["priority_changed", "work_areas_changed"]);
    expect(Number(state!["new_version_events"])).toBe(1);
  });
  it("rejects each incomplete Ready classification without ticket or event writes", async () => {
    const absentTicketId = await createBacklogTicket("Classification completeness absent");
    const absentContent = { outcome: "Classification completeness absent" };
    const absentBefore = await ticketVersionAndEventCount(absentTicketId);
    const absent = await approveReadyToTodo(envelope("ApproveReadyToTodo", absentTicketId, [
      { recordKind: "dev_ticket", recordId: absentTicketId, version: 1 },
    ]), {
      devTicketId: absentTicketId, readyContractContent: absentContent, expectedContractVersion: 1,
      expectedContractContentHash: computeReadyContractContentHash(absentContent),
      expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    expect(absent).toMatchObject({ ok: false });
    if (!absent.ok) expect(absent.error.code).toBe("dev_board.classification_type_required");
    expect(await ticketVersionAndEventCount(absentTicketId)).toEqual(absentBefore);

    const workAreaTicketId = await createBacklogTicket("Classification completeness work areas");
    const workAreaContent = await classifyTicket(workAreaTicketId, "Classification completeness work areas");
    // Deliberate state simulation: commands set classifications atomically, so remove the
    // persisted work-area row to exercise the otherwise unreachable incomplete legacy state.
    await withTenant(organizationId, (tx) => tx.execute(sql`
      delete from public.dev_board_dev_ticket_work_area
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and dev_ticket_id = ${workAreaTicketId}::uuid
    `), database!);
    const workAreaBefore = await ticketVersionAndEventCount(workAreaTicketId);
    const workAreas = await approveReadyToTodo(envelope("ApproveReadyToTodo", workAreaTicketId, [
      { recordKind: "dev_ticket", recordId: workAreaTicketId, version: 2 },
    ]), {
      devTicketId: workAreaTicketId, readyContractContent: workAreaContent, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(workAreaContent),
      expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    expect(workAreas).toMatchObject({ ok: false });
    if (!workAreas.ok) expect(workAreas.error.code).toBe("dev_board.classification_work_areas_required");
    expect(await ticketVersionAndEventCount(workAreaTicketId)).toEqual(workAreaBefore);

    const priorityTicketId = await createBacklogTicket("Classification completeness priority");
    const priorityContent = await classifyTicket(priorityTicketId, "Classification completeness priority");
    // Deliberate state simulation: null the persisted priority after a normal full command.
    await withTenant(organizationId, (tx) => tx.execute(sql`
      update public.dev_board_dev_ticket set priority = null
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${priorityTicketId}::uuid
    `), database!);
    const priorityBefore = await ticketVersionAndEventCount(priorityTicketId);
    const priority = await approveReadyToTodo(envelope("ApproveReadyToTodo", priorityTicketId, [
      { recordKind: "dev_ticket", recordId: priorityTicketId, version: 2 },
    ]), {
      devTicketId: priorityTicketId, readyContractContent: priorityContent, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(priorityContent),
      expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    expect(priority).toMatchObject({ ok: false });
    if (!priority.ok) expect(priority.error.code).toBe("dev_board.classification_priority_required");
    expect(await ticketVersionAndEventCount(priorityTicketId)).toEqual(priorityBefore);
  });
  it("rejects a deliberately tampered persisted Change Risk policy stamp without writes", async () => {
    const ticketId = await createBacklogTicket("Policy stamp drift");
    const input = {
      devTicketId: ticketId, type: "bug", workAreas: ["documentation"], priority: "p1",
      declaredChangeRisk: "medium",
    } as const;
    expect((await setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
    ]), input, deps!)).ok).toBe(true);
    const policy = evaluateChangeRisk({ type: input.type, workAreas: input.workAreas, hasActiveDependencies: false });
    const content = {
      outcome: "Policy stamp drift", humanOwnerUserId: ownerId,
      classification: { type: input.type, workAreas: input.workAreas, priority: input.priority, declaredChangeRisk: input.declaredChangeRisk },
      changeRiskPolicy: policy,
    };
    // Deliberate state simulation: a direct write lowers the stored policy floor.
    await withTenant(organizationId, (tx) => tx.execute(sql`
      update public.dev_board_dev_ticket set minimum_change_risk = 'low'
      where organization_id = ${organizationId}::uuid and workspace_id = ${workspaceId}::uuid
        and id = ${ticketId}::uuid
    `), database!);
    const before = await ticketVersionAndEventCount(ticketId);
    const rejected = await approveReadyToTodo(envelope("ApproveReadyToTodo", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
    ]), {
      devTicketId: ticketId, readyContractContent: content, expectedContractVersion: 2,
      expectedContractContentHash: computeReadyContractContentHash(content),
      expectedTodoQueueVersion: await currentTodoQueueVersion(),
    }, deps!);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.change_risk_policy_drift");
    expect(await ticketVersionAndEventCount(ticketId)).toEqual(before);
  });
  it("serializes owner membership validation across two database connections", async () => {
    const ticketId = await createBacklogTicket("Membership lock serialization");
    const candidateId = await seedMember(organizationId, "active");
    const locker = await adminPool!.connect();
    try {
      await locker.query("begin");
      await locker.query("update public.memberships set status = 'suspended' where organization_id = $1 and user_id = $2", [organizationId, candidateId]);
      const pending = setDevTicketClassification(envelope("SetDevTicketClassification", ticketId, [
        { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
      ]), {
        devTicketId: ticketId, type: "feature", workAreas: ["documentation"], priority: "p1",
        declaredChangeRisk: "low", humanOwnerUserId: candidateId,
      }, deps!);
      const observed = await Promise.race([
        pending.then(() => "settled"),
        new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 75)),
      ]);
      expect(observed).toBe("blocked");
      await locker.query("commit");
      const rejected = await pending;
      expect(rejected).toMatchObject({ ok: false });
      if (!rejected.ok) expect(rejected.error.code).toBe("dev_board.human_owner_not_active_member");
    } finally {
      await locker.query("rollback").catch(() => {});
      locker.release();
    }
  });
  it("replays a successful classification without another version bump or event", async () => {
    const ticketId = await createBacklogTicket("Classification accepted replay");
    const request = envelope("SetDevTicketClassification", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 1 },
    ]);
    const input = { devTicketId: ticketId, type: "feature", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low" } as const;
    const accepted = await setDevTicketClassification(request, input, deps!);
    expect(accepted).toMatchObject({ ok: true });
    const replay = await setDevTicketClassification({ ...request, commandId: randomUUID() }, input, deps!);
    expect(replay).toMatchObject({ ok: true, value: { commandId: request.commandId } });
    const state = await ticketVersionAndEventCount(ticketId);
    expect(Number(state["version"])).toBe(2);
    expect(Number(state["event_count"])).toBe(2);
    const classificationEvents = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select count(*) as count from public.dev_board_activity_event
      where aggregate_id = ${ticketId}::uuid and event_name = 'DevTicketClassificationChanged'
    `))[0], database!);
    expect(Number(classificationEvents!["count"])).toBe(1);
  });
  it("rolls back a work-area replacement constraint failure to the risky-mutation savepoint", async () => {
    const ticketId = await createBacklogTicket("Classification work-area savepoint");
    const content = { outcome: "Classification work-area savepoint" };
    const result = await withTenant(organizationId, (tx) => deps!.planningStore.executeRiskyMutation(tx, () =>
      deps!.planningStore.updateDevTicketClassification(tx, {
        organizationId, workspaceId, devTicketId: ticketId, expectedVersion: 1,
        humanOwnerUserId: ownerId, devTicketType: "feature",
        // Deliberate adapter-level state simulation: command normalization removes duplicates,
        // so this reaches the replacement loop's unique violation directly.
        workAreas: ["documentation", "documentation"] as never,
        priority: "p1", severity: null, declaredChangeRisk: "low", minimumChangeRisk: "low",
        changeRiskPolicyVersion: "1", changeRiskPolicyHash: "a".repeat(64),
        readyContractContent: content, readyContractContentHash: computeReadyContractContentHash(content),
      }),
    ), database!);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.code).toBe("dev_board.constraint_conflict");
    const state = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.version, t.dev_ticket_type,
        (select count(*) from public.dev_board_dev_ticket_work_area where dev_ticket_id = t.id) as work_area_count
      from public.dev_board_dev_ticket t where t.id = ${ticketId}::uuid
    `))[0], database!);
    expect(Number(state!["version"])).toBe(1);
    expect(state!["dev_ticket_type"]).toBeNull();
    expect(Number(state!["work_area_count"])).toBe(0);
  });
  it("replays Ready contract and authorization rejections without ticket or event writes", async () => {
    const ticketId = await createBacklogTicket("Terminal Ready rejections");
    const content = await classifyTicket(ticketId, "Terminal Ready rejections");
    const before = await ticketVersionAndEventCount(ticketId);
    const retryReady = async (
      readyContractContent: Readonly<Record<string, unknown>>,
      actorRef: CommandEnvelope["actorRef"],
      expectedCode: string,
    ) => {
      const request = envelope("ApproveReadyToTodo", ticketId, [
        { recordKind: "dev_ticket", recordId: ticketId, version: 2 },
      ], { actorRef });
      const input = {
        devTicketId: ticketId, readyContractContent, expectedContractVersion: 2,
        expectedContractContentHash: computeReadyContractContentHash(content),
        expectedTodoQueueVersion: await currentTodoQueueVersion(),
      };
      const rejected = await approveReadyToTodo(request, input, deps!);
      expect(rejected).toMatchObject({ ok: false });
      if (!rejected.ok) expect(rejected.error.code).toBe(expectedCode);
      const replay = await approveReadyToTodo({ ...request, commandId: randomUUID() }, input, deps!);
      expect(replay).toMatchObject({ ok: false });
      if (!replay.ok && !rejected.ok) expect(replay.error.message).toBe(rejected.error.message);
      expect(await ticketVersionAndEventCount(ticketId)).toEqual(before);
    };
    // These two inputs deliberately model absent and modified contract classification bindings.
    await retryReady({ outcome: "Missing classification" }, envelope("unused", ticketId).actorRef, "dev_board.ready_contract_missing_classification");
    await retryReady({ ...content, classification: { ...(content["classification"] as Record<string, unknown>), priority: "p0" } }, envelope("unused", ticketId).actorRef, "dev_board.ready_contract_missing_classification");
    const ungrantedAdminId = await seedMember(organizationId, "active");
    await retryReady(content, { kind: "user", role: "admin", stableId: ungrantedAdminId }, "dev_board.ready_approval_human_authorization_required");
    await retryReady(content, { kind: "agent", role: "agent", stableId: ownerId }, "dev_board.ready_approval_human_authorization_required");
  });
  it("replays inactive-owner and invalid-actor rejections without ticket or event writes", async () => {
    const inactiveOwnerId = await seedMember(organizationId, "suspended");
    const ownerTicketId = await createBacklogTicket("Inactive owner replay");
    const ownerRequest = envelope("SetDevTicketClassification", ownerTicketId, [
      { recordKind: "dev_ticket", recordId: ownerTicketId, version: 1 },
    ]);
    const ownerInput = {
      devTicketId: ownerTicketId, type: "feature", workAreas: ["documentation"], priority: "p1",
      declaredChangeRisk: "low", humanOwnerUserId: inactiveOwnerId,
    } as const;
    const ownerBefore = await ticketVersionAndEventCount(ownerTicketId);
    const rejectedOwner = await setDevTicketClassification(ownerRequest, ownerInput, deps!);
    expect(rejectedOwner).toMatchObject({ ok: false });
    if (!rejectedOwner.ok) expect(rejectedOwner.error.code).toBe("dev_board.human_owner_not_active_member");
    const ownerReplay = await setDevTicketClassification({ ...ownerRequest, commandId: randomUUID() }, ownerInput, deps!);
    expect(ownerReplay).toMatchObject({ ok: false });
    if (!ownerReplay.ok && !rejectedOwner.ok) expect(ownerReplay.error.message).toBe(rejectedOwner.error.message);
    expect(await ticketVersionAndEventCount(ownerTicketId)).toEqual(ownerBefore);

    const invalidActorTicketId = await createBacklogTicket("Invalid actor replay");
    const invalidActorRequest = envelope("SetDevTicketClassification", invalidActorTicketId, [
      { recordKind: "dev_ticket", recordId: invalidActorTicketId, version: 1 },
    ], { actorRef: { kind: "user", role: "owner", stableId: ownerId } as never });
    const invalidActorInput = {
      devTicketId: invalidActorTicketId, type: "feature", workAreas: ["documentation"], priority: "p1", declaredChangeRisk: "low",
    } as const;
    const invalidActorBefore = await ticketVersionAndEventCount(invalidActorTicketId);
    const rejectedActor = await setDevTicketClassification(invalidActorRequest, invalidActorInput, deps!);
    expect(rejectedActor).toMatchObject({ ok: false });
    if (!rejectedActor.ok) expect(rejectedActor.error.code).toBe("dev_board.invalid_actor_ref");
    const actorReplay = await setDevTicketClassification({ ...invalidActorRequest, commandId: randomUUID() }, invalidActorInput, deps!);
    expect(actorReplay).toMatchObject({ ok: false });
    if (!actorReplay.ok && !rejectedActor.ok) expect(actorReplay.error.message).toBe(rejectedActor.error.message);
    expect(await ticketVersionAndEventCount(invalidActorTicketId)).toEqual(invalidActorBefore);
  });
  it("archives Todo atomically, restores to Backlog, and exposes the derived Historical Projection", async () => {
    const testWorkspaceId = await createWorkspace("Archive Todo workspace");
    const ticketId = await approveTicket("reversible archive", testWorkspaceId);
    const queueBefore = await currentTodoQueueVersion(testWorkspaceId);
    const archiveRequest = envelope("ArchiveDevTicket", ticketId, [
      { recordKind: "dev_ticket", recordId: ticketId, version: 3 },
      { recordKind: "lane_queue", recordId: "todo", version: queueBefore },
    ], { workspaceId: testWorkspaceId });
    const archived = await archiveDevTicket(archiveRequest, { devTicketId: ticketId, reason: "Superseded by a narrower plan." }, deps!);
    expect(archived).toMatchObject({ ok: true, value: { resultingVersions: expect.arrayContaining([
      { recordKind: "dev_ticket", recordId: ticketId, version: 4 },
      { recordKind: "lane_queue", recordId: "todo", version: queueBefore + 1 },
    ]) } });
    expect(await archiveDevTicket({ ...archiveRequest, commandId: randomUUID() }, { devTicketId: ticketId, reason: "Superseded by a narrower plan." }, deps!)).toMatchObject({ ok: true, value: { commandId: archiveRequest.commandId } });
    const archivedState = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select t.lane, t.last_active_lane, t.ready_state, t.archived_by_user_id, t.archived_reason,
        t.ready_approval_contract_version, t.ready_approval_content_hash, t.ready_approved_by_user_id,
        t.ready_approved_at, t.ready_approval_command_id,
        (select count(*) from public.dev_board_lane_queue q where q.dev_ticket_id = t.id) as membership_count,
        (select count(*) from public.dev_board_activity_event e where e.aggregate_id = t.id and e.aggregate_version = t.version and e.event_name = 'DevTicketArchived') as event_count,
        (select count(*) from public.dev_board_planning_decision_entry p where p.aggregate_id = t.id and p.entry_kind = 'ArchiveRationaleRecorded') as rationale_count
      from public.dev_board_dev_ticket t where t.id = ${ticketId}::uuid
    `))[0], database!);
    expect(archivedState).toMatchObject({ lane: "backlog", last_active_lane: "todo", ready_state: "draft", archived_by_user_id: ownerId, archived_reason: "Superseded by a narrower plan." });
    expect(archivedState!['ready_approval_contract_version']).toBeNull();
    expect(archivedState!['ready_approval_content_hash']).toBeNull();
    expect(archivedState!['ready_approved_by_user_id']).toBeNull();
    expect(archivedState!['ready_approved_at']).toBeNull();
    expect(archivedState!['ready_approval_command_id']).toBeNull();
    expect(Number(archivedState!['membership_count'])).toBe(0);
    expect(Number(archivedState!['event_count'])).toBe(1);
    expect(Number(archivedState!['rationale_count'])).toBe(1);
    const projection = await withTenant(organizationId, (tx) => deps!.planningStore.listArchivedDevTickets(tx, organizationId, testWorkspaceId), database!);
    expect(projection).toEqual([expect.objectContaining({ recordClass: "archived_dev_ticket", devTicketId: ticketId, lastActiveLane: "todo", archivedByUserId: ownerId, archivedReason: "Superseded by a narrower plan.", activityAggregateId: ticketId, planningAggregateId: ticketId })]);
    const restoreRequest = envelope("RestoreDevTicket", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: 4 }], { workspaceId: testWorkspaceId });
    expect(await restoreDevTicket(restoreRequest, { devTicketId: ticketId }, deps!)).toMatchObject({ ok: true, value: { resultingVersions: [{ recordKind: "dev_ticket", recordId: ticketId, version: 5 }] } });
    expect(await archiveDevTicket(envelope("ArchiveDevTicket", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: 5 }], { workspaceId: testWorkspaceId }), { devTicketId: ticketId, reason: "Archived again after restore." }, deps!)).toMatchObject({ ok: true });
    const cycles = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select event_name, aggregate_version from public.dev_board_activity_event
      where aggregate_id = ${ticketId}::uuid and event_name in ('DevTicketArchived', 'DevTicketRestored') order by aggregate_version
    `)), database!);
    expect(cycles.map((event) => ({ ...event, aggregate_version: Number(event["aggregate_version"]) }))).toEqual([
      { event_name: "DevTicketArchived", aggregate_version: 4 },
      { event_name: "DevTicketRestored", aggregate_version: 5 },
      { event_name: "DevTicketArchived", aggregate_version: 6 },
    ]);
  });
  it("rejects active dependents, enforces archive authorization, and round-trips Proposal archive provenance", async () => {
    const testWorkspaceId = await createWorkspace("Archive guards workspace");
    const blocker = await createBacklogTicket("archive blocker", testWorkspaceId);
    const dependent = await createBacklogTicket("archive dependent", testWorkspaceId);
    const added = await addDependency(envelope("AddDependency", dependent, [
      { recordKind: "dev_ticket", recordId: dependent, version: 1 }, { recordKind: "dev_ticket", recordId: blocker, version: 1 },
    ], { workspaceId: testWorkspaceId }), { dependentDevTicketId: dependent, blockerDevTicketId: blocker, reason: "Dependent needs blocker." }, deps!);
    expect(added).toMatchObject({ ok: true });
    const blockedArchiveRequest = envelope("ArchiveDevTicket", blocker, [{ recordKind: "dev_ticket", recordId: blocker, version: 1 }], { workspaceId: testWorkspaceId });
    const blockedArchive = await archiveDevTicket(blockedArchiveRequest, { devTicketId: blocker, reason: "Must not strand dependent." }, deps!);
    expect(blockedArchive).toMatchObject({ ok: false });
    if (!blockedArchive.ok) expect(blockedArchive.error.code).toBe("dev_board.archive_active_dependents");
    const blockedArchiveState = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select count(*) from public.dev_board_command_receipt where command_name = 'ArchiveDevTicket' and idempotency_key = ${blockedArchiveRequest.idempotencyKey}) as receipt_count,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${blocker}::uuid) as activity_count,
        (select count(*) from public.dev_board_planning_decision_entry where aggregate_id = ${blocker}::uuid) as planning_count,
        (select version from public.dev_board_dev_ticket where id = ${blocker}::uuid) as ticket_version
    `))[0], database!);
    const blockedArchiveReplay = await archiveDevTicket(
      { ...blockedArchiveRequest, commandId: randomUUID() },
      { devTicketId: blocker, reason: "Must not strand dependent." },
      deps!,
    );
    expect(blockedArchiveReplay).toMatchObject({ ok: false });
    if (!blockedArchiveReplay.ok && !blockedArchive.ok) expect(blockedArchiveReplay.error.message).toBe(blockedArchive.error.message);
    const blockedArchiveReplayState = await withTenant(organizationId, async (tx) => rows(await tx.execute(sql`
      select
        (select count(*) from public.dev_board_command_receipt where command_name = 'ArchiveDevTicket' and idempotency_key = ${blockedArchiveRequest.idempotencyKey}) as receipt_count,
        (select count(*) from public.dev_board_activity_event where aggregate_id = ${blocker}::uuid) as activity_count,
        (select count(*) from public.dev_board_planning_decision_entry where aggregate_id = ${blocker}::uuid) as planning_count,
        (select version from public.dev_board_dev_ticket where id = ${blocker}::uuid) as ticket_version
    `))[0], database!);
    expect(blockedArchiveReplayState).toEqual(blockedArchiveState);
    expect(Number(blockedArchiveReplayState!["receipt_count"])).toBe(1);
    if (!added.ok) return;
    expect((await removeDependency(envelope("RemoveDependency", added.value.dependencyEdgeId!, [], { workspaceId: testWorkspaceId }), { edgeId: added.value.dependencyEdgeId!, expectedEdgeVersion: 1, reason: "Dependency retired." }, deps!)).ok).toBe(true);
    const stranger = await seedMember(organizationId, "active");
    const unauthorized = await archiveDevTicket(envelope("ArchiveDevTicket", blocker, [{ recordKind: "dev_ticket", recordId: blocker, version: 1 }], { workspaceId: testWorkspaceId, actorRef: { kind: "user", role: "human_owner", stableId: stranger } }), { devTicketId: blocker, reason: "Unauthorized." }, deps!);
    expect(unauthorized).toMatchObject({ ok: false });
    if (!unauthorized.ok) expect(unauthorized.error.code).toBe("dev_board.archive_authorization_required");
    const agentUnauthorized = await archiveDevTicket(envelope("ArchiveDevTicket", blocker, [{ recordKind: "dev_ticket", recordId: blocker, version: 1 }], { workspaceId: testWorkspaceId, actorRef: { kind: "agent", role: "agent", stableId: ownerId } }), { devTicketId: blocker, reason: "Agents cannot archive." }, deps!);
    expect(agentUnauthorized).toMatchObject({ ok: false });
    if (!agentUnauthorized.ok) expect(agentUnauthorized.error.code).toBe("dev_board.archive_authorization_required");
    await grantOrganizationRole(stranger, "admin");
    const adminActor = { kind: "user", role: "human_owner", stableId: stranger } as const;
    expect((await archiveDevTicket(envelope("ArchiveDevTicket", blocker, [{ recordKind: "dev_ticket", recordId: blocker, version: 1 }], { workspaceId: testWorkspaceId, actorRef: adminActor }), { devTicketId: blocker, reason: "Organization admin archive." }, deps!)).ok).toBe(true);
    expect((await restoreDevTicket(envelope("RestoreDevTicket", blocker, [{ recordKind: "dev_ticket", recordId: blocker, version: 2 }], { workspaceId: testWorkspaceId, actorRef: adminActor }), { devTicketId: blocker }, deps!)).ok).toBe(true);
    expect((await archiveDevTicket(envelope("ArchiveDevTicket", blocker, [{ recordKind: "dev_ticket", recordId: blocker, version: 3 }], { workspaceId: testWorkspaceId }), { devTicketId: blocker, reason: "Dependency retired." }, deps!)).ok).toBe(true);
    const proposalId = randomUUID();
    expect((await draftProposal(envelope("DraftProposal", proposalId, [], { workspaceId: testWorkspaceId }), { discoverySummary: "proposal archive restore", blockingAssessment: "non_blocking" }, deps!)).ok).toBe(true);
    expect((await archiveProposal(envelope("ArchiveProposal", proposalId, [{ recordKind: "proposal", recordId: proposalId, version: 1 }], { workspaceId: testWorkspaceId }), { proposalId, reason: "Captured elsewhere." }, deps!)).ok).toBe(true);
    const proposalProjection = await withTenant(organizationId, (tx) => deps!.planningStore.listArchivedProposals(tx, organizationId, testWorkspaceId), database!);
    expect(proposalProjection).toEqual([expect.objectContaining({ recordClass: "archived_proposal", proposalId, archivedByUserId: ownerId, archivedReason: "Captured elsewhere.", activityAggregateId: proposalId, planningAggregateId: proposalId })]);
    expect((await restoreProposal(envelope("RestoreProposal", proposalId, [{ recordKind: "proposal", recordId: proposalId, version: 2 }], { workspaceId: testWorkspaceId }), { proposalId }, deps!)).ok).toBe(true);
    const proposalState = await withTenant(organizationId, (tx) => deps!.planningStore.selectProposalForUpdate(tx, organizationId, testWorkspaceId, proposalId), database!);
    expect(proposalState).toMatchObject({ lifecycleState: "draft", version: 3, archivedAt: null, archivedByUserId: null, archivedReason: null });
  });
  it("keeps archived Done history non-executable and never exposes archive projections across tenants", async () => {
    const testWorkspaceId = await createWorkspace("Done restore archive workspace");
    const ticketId = await approveTicket("Done history", testWorkspaceId);
    await withTenant(organizationId, async (tx) => {
      await deps!.planningStore.deleteTodoQueueMembership(tx, organizationId, testWorkspaceId, ticketId);
      await tx.execute(sql`update public.dev_board_dev_ticket set lane = 'done' where id = ${ticketId}::uuid`);
    }, database!);
    expect((await archiveDevTicket(envelope("ArchiveDevTicket", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: 3 }], { workspaceId: testWorkspaceId }), { devTicketId: ticketId, reason: "Done evidence retained." }, deps!)).ok).toBe(true);
    const restore = await restoreDevTicket(envelope("RestoreDevTicket", ticketId, [{ recordKind: "dev_ticket", recordId: ticketId, version: 4 }], { workspaceId: testWorkspaceId }), { devTicketId: ticketId }, deps!);
    expect(restore).toMatchObject({ ok: false });
    if (!restore.ok) expect(restore.error.code).toBe("dev_board.done_restore_history_only");
    const crossTenantProjection = await withTenant(otherOrganizationId, (tx) => deps!.planningStore.listArchivedDevTickets(tx, otherOrganizationId, testWorkspaceId), database!);
    expect(crossTenantProjection).toEqual([]);
  });
});

if (!enabled)
  describe("Dev Board planning lifecycle real-Postgres", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0021 applied", () => {});
  });
