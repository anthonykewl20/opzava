import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase, createPostgresPool, withTenant } from "@opzava/adapters";

import { PostgresCommandReceiptRepository } from "../adapters/postgres/postgres-command-receipt-repository.js";
import { PostgresDevBoardLedgerAppendStore } from "../adapters/postgres/postgres-dev-board-ledger-append-store.js";
import { PostgresDevBoardPlanningStore } from "../adapters/postgres/postgres-dev-board-planning-store.js";
import { importLegacyDevTicket, reconcileHistoricalCompletion, type DevBoardPlanningCommandDependencies } from "../application/dev-board-planning-commands.js";
import type { CommandEnvelope } from "../domain/command-envelope.js";

const enabled = Boolean(process.env["DATABASE_URL"] && process.env["DATABASE_MIGRATION_URL"]);
const describePostgres = enabled ? describe : describe.skip;
function rows(result: unknown): readonly Record<string, unknown>[] { return Array.isArray(result) ? result as readonly Record<string, unknown>[] : (result as { rows?: readonly Record<string, unknown>[] }).rows ?? []; }

describePostgres("TB-01b-8 legacy import", () => {
  const orgId = randomUUID(); const otherOrgId = randomUUID(); const workspaceId = randomUUID(); const ownerId = `legacy-owner-${randomUUID()}`;
  const appPool = enabled ? createPostgresPool(process.env["DATABASE_URL"]) : undefined;
  const adminPool = enabled ? createPostgresPool(process.env["DATABASE_MIGRATION_URL"]) : undefined;
  const database = appPool === undefined ? undefined : createPostgresDatabase(appPool);
  const deps: DevBoardPlanningCommandDependencies | undefined = database === undefined ? undefined : { database, commandReceiptRepository: new PostgresCommandReceiptRepository(database), ledger: new PostgresDevBoardLedgerAppendStore(), planningStore: new PostgresDevBoardPlanningStore() };
  const envelope = (idempotencyKey: string, taskId: string): CommandEnvelope => ({ commandId: randomUUID(), idempotencyKey, requestHash: "a".repeat(64), organizationId: orgId, workspaceId, commandName: "ImportLegacyDevTicket", targetAggregateId: taskId, actorRef: { kind: "user", role: "human_owner", stableId: ownerId }, sourceRef: { kind: "admin_ui", ref: "legacy-test" }, authorizationVersion: 1, correlationId: randomUUID(), expectedVersions: [] });
  const sourceSnapshot = async (taskId: string) => {
    const result = await adminPool!.query("select to_jsonb(t)::text as snapshot from public.tasks t where t.id = $1", [taskId]);
    const snapshot = result.rows[0]?.["snapshot"];
    if (typeof snapshot !== "string") throw new Error(`Legacy Task ${taskId} was not available for an immutability probe.`);
    return { snapshot, hash: createHash("sha256").update(snapshot).digest("hex") };
  };
  const expectSourceUnchanged = async (taskId: string, before: Awaited<ReturnType<typeof sourceSnapshot>>) => {
    expect(await sourceSnapshot(taskId)).toEqual(before);
  };

  beforeAll(async () => {
    const role = rows(await database!.execute(sql`select current_user as session_role, rolsuper as is_super, rolbypassrls as bypass_rls from pg_roles where rolname = current_user`))[0];
    if (role?.["session_role"] !== "opzava_app" || role?.["is_super"] === true || role?.["bypass_rls"] === true)
      throw new Error(`RLS integration test must run as non-owner opzava_app; got ${JSON.stringify(role)}`);
    await adminPool!.query("insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, 'Legacy import', 'active'), ($3, $4, 'Legacy import non-member', 'active')", [orgId, `legacy-${orgId}`, otherOrgId, `legacy-${otherOrgId}`]);
    await adminPool!.query("insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, $3, 'Legacy workspace')", [workspaceId, orgId, `legacy-${workspaceId}`]);
    await adminPool!.query("insert into public.auth_users (id, name, email) values ($1, 'Owner', $2)", [ownerId, `${ownerId}@example.test`]);
    await adminPool!.query("insert into public.memberships (organization_id, user_id, status) values ($1, $2, 'active')", [orgId, ownerId]);
    await adminPool!.query("insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'admin', 'organization', $1, $2)", [orgId, ownerId]);
  });
  afterAll(async () => { await appPool?.end(); await adminPool?.end(); });

  it("promotes an active-owner Task once, preserving its UUID and alias snapshot", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Import me', 991, 'todo')", [taskId, orgId, workspaceId]);
    const before = await sourceSnapshot(taskId);
    const first = envelope(taskId, taskId);
    const promoted = await importLegacyDevTicket(first, { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!);
    expect(promoted).toMatchObject({ ok: true, value: { devTicketId: taskId } });
    const replay = await importLegacyDevTicket(first, { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!);
    expect(replay).toEqual(promoted);
    expect((await importLegacyDevTicket(envelope(`${taskId}:retry`, taskId), { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!)).ok).toBe(true);
    const state = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`
      select t.origin_kind, t.lane, t.ready_state, t.dev_ticket_type, a.dev_ticket_id, h.source_disposition,
        h.completion_gate, h.preserved_payload_digest, count(e.id) as activity_count
      from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id
      left join public.dev_board_dev_ticket t on t.id = a.dev_ticket_id
      left join public.dev_board_activity_event e on e.command_id = ${first.commandId}::uuid
      where a.organization_id = ${orgId}::uuid and a.legacy_task_id = ${taskId}::uuid
      group by t.origin_kind, t.lane, t.ready_state, t.dev_ticket_type, a.dev_ticket_id, h.source_disposition, h.completion_gate, h.preserved_payload_digest
    `))[0], database!);
    expect(state).toMatchObject({ origin_kind: "legacy", lane: "backlog", ready_state: "draft", dev_ticket_type: null, dev_ticket_id: taskId, source_disposition: "promoted_backlog", completion_gate: null, activity_count: "1" });
    await expectSourceUnchanged(taskId, before);
  });

  it("resolves a quarantined alias in place when a confirmed owner is supplied on a new attempt", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Resolve me', 992, 'blocked')", [taskId, orgId, workspaceId]);
    const sourceBefore = await sourceSnapshot(taskId);
    expect((await importLegacyDevTicket(envelope(taskId, taskId), { legacyTaskId: taskId }, deps!)).ok).toBe(true);
    const before = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.id, h.preserved_payload_digest, h.imported_at from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${taskId}::uuid`))[0], database!);
    const resolution = await importLegacyDevTicket(envelope(`${taskId}:2`, taskId), { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!);
    expect(resolution).toMatchObject({ ok: true, value: { devTicketId: taskId } });
    const after = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select a.dev_ticket_id, h.id, h.source_disposition, h.completion_gate, h.preserved_payload_digest, h.imported_at from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${taskId}::uuid`))[0], database!);
    expect(after).toMatchObject({ dev_ticket_id: taskId, id: before!["id"], source_disposition: "promoted_backlog", completion_gate: null, preserved_payload_digest: before!["preserved_payload_digest"] });
    expect(String(after!["imported_at"])).toBe(String(before!["imported_at"]));
    await expectSourceUnchanged(taskId, sourceBefore);
  });

  it("keeps completed legacy Tasks historical even when an active owner is supplied", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Already done', 993, 'done')", [taskId, orgId, workspaceId]);
    const before = await sourceSnapshot(taskId);
    const imported = await importLegacyDevTicket(envelope(taskId, taskId), { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!);
    expect(imported).toMatchObject({ ok: true });
    const row = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select a.dev_ticket_id, h.source_disposition, h.completion_gate from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${taskId}::uuid`))[0], database!);
    expect(row).toMatchObject({ dev_ticket_id: null, source_disposition: "historical_candidate", completion_gate: "legacy_unverified" });
    await expectSourceUnchanged(taskId, before);
  });

  it("quarantines a completed legacy Task without an owner on real Postgres", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Done without owner', 996, 'done')", [taskId, orgId, workspaceId]);
    const before = await sourceSnapshot(taskId);
    expect(await importLegacyDevTicket(envelope(taskId, taskId), { legacyTaskId: taskId }, deps!)).toMatchObject({ ok: true });
    const row = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`
      select a.dev_ticket_id, h.source_disposition, h.completion_gate
      from public.dev_board_legacy_task_alias a
      join public.dev_board_historical_record h on h.id = a.historical_record_id
      where a.legacy_task_id = ${taskId}::uuid
    `))[0], database!);
    expect(row).toMatchObject({ dev_ticket_id: null, source_disposition: "quarantined_no_owner", completion_gate: "legacy_unverified" });
    await expectSourceUnchanged(taskId, before);
  });

  it("advances a reconciled no-owner completed Task in place while retaining its reconciled gate and single import activity", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Reconciled done without owner', 997, 'done')", [taskId, orgId, workspaceId]);
    await adminPool!.query("insert into public.task_evidence (organization_id, workspace_id, task_id, kind, object_ref, filename, provenance) values ($1, $2, $3, 'file', 'object://legacy/reconciled-no-owner', 'legacy.txt', 'legacy-test')", [orgId, workspaceId, taskId]);
    await adminPool!.query("insert into public.task_quality_review (organization_id, workspace_id, task_id, status, approved_by_user_id, approved_at) values ($1, $2, $3, 'approved', $4, now())", [orgId, workspaceId, taskId, ownerId]);
    const first = envelope(`${taskId}:no-owner`, taskId);
    await expect(importLegacyDevTicket(first, { legacyTaskId: taskId }, deps!)).resolves.toMatchObject({ ok: true });
    const historical = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.id from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${taskId}::uuid`))[0], database!);
    await expect(reconcileHistoricalCompletion(
      { ...envelope(`${taskId}:reconcile`, String(historical!["id"])), commandName: "ReconcileHistoricalCompletion" },
      { historicalRecordId: String(historical!["id"]), reconciliationEpoch: "reconciled-no-owner" },
      deps!,
    )).resolves.toMatchObject({ ok: true });
    const resolution = envelope(`${taskId}:owner`, taskId);
    await expect(importLegacyDevTicket(resolution, { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!)).resolves.toMatchObject({ ok: true });
    const state = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`
      select h.source_disposition, h.completion_gate,
        (select count(*) from public.dev_board_legacy_task_alias where organization_id = ${orgId}::uuid and legacy_task_id = ${taskId}::uuid) as alias_count,
        (select count(*) from public.dev_board_historical_record where organization_id = ${orgId}::uuid and source_table_row_identity = ${taskId}::uuid) as historical_count,
        (select count(*) from public.dev_board_activity_event e where e.event_name = 'LegacyDevTicketImported' and e.payload ->> 'historicalRecordId' = h.id::text) as import_activity_count
      from public.dev_board_historical_record h where h.id = ${historical!["id"]}::uuid
    `))[0], database!);
    expect(state).toMatchObject({ source_disposition: "historical_candidate", completion_gate: "reconciled_historical", alias_count: "1", historical_count: "1", import_activity_count: "1" });
    const receipts = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select state from public.dev_board_command_receipt where command_id = ${resolution.commandId}::uuid`))[0], database!);
    expect(receipts).toMatchObject({ state: "accepted" });
  });

  it("concurrently imports an active Task with and without an owner, resolving the winner in place", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Concurrent import', 998, 'todo')", [taskId, orgId, workspaceId]);
    const noOwner = envelope(`${taskId}:no-owner`, taskId);
    const withOwner = envelope(`${taskId}:with-owner`, taskId);
    const [withoutOwnerResult, withOwnerResult] = await Promise.all([
      importLegacyDevTicket(noOwner, { legacyTaskId: taskId }, deps!),
      importLegacyDevTicket(withOwner, { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!),
    ]);
    expect(withoutOwnerResult).toMatchObject({ ok: true });
    expect(withOwnerResult).toMatchObject({ ok: true });
    const state = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`
      select a.dev_ticket_id, h.id, h.source_disposition,
        (select count(*) from public.dev_board_legacy_task_alias where organization_id = ${orgId}::uuid and legacy_task_id = ${taskId}::uuid) as alias_count,
        (select count(*) from public.dev_board_historical_record where organization_id = ${orgId}::uuid and source_table_row_identity = ${taskId}::uuid) as historical_count,
        (select count(*) from public.dev_board_activity_event e where e.event_name = 'LegacyDevTicketImported' and e.payload ->> 'historicalRecordId' = h.id::text) as import_activity_count
      from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id
      where a.organization_id = ${orgId}::uuid and a.legacy_task_id = ${taskId}::uuid
    `))[0], database!);
    expect(state).toMatchObject({ dev_ticket_id: taskId, source_disposition: "promoted_backlog", alias_count: "1", historical_count: "1", import_activity_count: "1" });
    const receipts = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`
      select state from public.dev_board_command_receipt where command_id in (${noOwner.commandId}::uuid, ${withOwner.commandId}::uuid) order by command_id
    `)), database!);
    expect(receipts).toEqual([{ state: "accepted" }, { state: "accepted" }]);
  });

  it("reconciles approved legacy evidence exactly once and retains the reconciliation epoch in immutable ledgers", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Reconcile done', 994, 'done')", [taskId, orgId, workspaceId]);
    await adminPool!.query("insert into public.task_evidence (organization_id, workspace_id, task_id, kind, object_ref, filename, provenance) values ($1, $2, $3, 'file', 'object://legacy/evidence', 'legacy.txt', 'legacy-test')", [orgId, workspaceId, taskId]);
    await adminPool!.query("insert into public.task_quality_review (organization_id, workspace_id, task_id, status, approved_by_user_id, approved_at) values ($1, $2, $3, 'approved', $4, now())", [orgId, workspaceId, taskId, ownerId]);
    const before = await sourceSnapshot(taskId);
    await expect(importLegacyDevTicket(envelope(taskId, taskId), { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!)).resolves.toMatchObject({ ok: true });
    const historical = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.id, h.version from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${taskId}::uuid`))[0], database!);
    const reconciliation = { ...envelope(`${taskId}:reconcile`, String(historical!["id"])), commandName: "ReconcileHistoricalCompletion" };
    const input = { historicalRecordId: String(historical!["id"]), reconciliationEpoch: "epoch-integration-1" };
    const result = await reconcileHistoricalCompletion(reconciliation, input, deps!);
    expect(result).toMatchObject({ ok: true, value: { resultingVersions: [{ recordKind: "historical_record", recordId: input.historicalRecordId, version: 2 }] } });
    expect(await reconcileHistoricalCompletion(reconciliation, input, deps!)).toEqual(result);
    const state = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`
      select h.completion_gate, h.version, p.content as planning_content, e.payload as activity_payload
      from public.dev_board_historical_record h
      join public.dev_board_planning_decision_entry p on p.command_id = ${reconciliation.commandId}::uuid
      join public.dev_board_activity_event e on e.command_id = ${reconciliation.commandId}::uuid
      where h.id = ${input.historicalRecordId}::uuid
    `))[0], database!);
    expect(state).toMatchObject({ completion_gate: "reconciled_historical", version: 2 });
    expect(state!["planning_content"]).toMatchObject({ reconciliationEpoch: input.reconciliationEpoch });
    expect(state!["activity_payload"]).toMatchObject({ reconciliationEpoch: input.reconciliationEpoch });
    await expectSourceUnchanged(taskId, before);

    const alreadyReconciled = await reconcileHistoricalCompletion({ ...envelope(`${taskId}:reconcile-again`, input.historicalRecordId), commandName: "ReconcileHistoricalCompletion" }, { ...input, reconciliationEpoch: "epoch-integration-2" }, deps!);
    expect(alreadyReconciled).toMatchObject({ ok: false, error: { code: "dev_board.already_reconciled" } });
    await expectSourceUnchanged(taskId, before);
  });

  it("rejects direct Postgres historical disposition and completion-gate regressions", async () => {
    const reconciledTaskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Store guard reconciled', 999, 'done')", [reconciledTaskId, orgId, workspaceId]);
    await adminPool!.query("insert into public.task_evidence (organization_id, workspace_id, task_id, kind, object_ref, filename, provenance) values ($1, $2, $3, 'file', 'object://legacy/store-guard', 'legacy.txt', 'legacy-test')", [orgId, workspaceId, reconciledTaskId]);
    await adminPool!.query("insert into public.task_quality_review (organization_id, workspace_id, task_id, status, approved_by_user_id, approved_at) values ($1, $2, $3, 'approved', $4, now())", [orgId, workspaceId, reconciledTaskId, ownerId]);
    await importLegacyDevTicket(envelope(`${reconciledTaskId}:import`, reconciledTaskId), { legacyTaskId: reconciledTaskId, humanOwnerUserId: ownerId }, deps!);
    const reconciled = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.id, h.version from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${reconciledTaskId}::uuid`))[0], database!);
    await reconcileHistoricalCompletion({ ...envelope(`${reconciledTaskId}:reconcile`, String(reconciled!["id"])), commandName: "ReconcileHistoricalCompletion" }, { historicalRecordId: String(reconciled!["id"]), reconciliationEpoch: "store-guard" }, deps!);
    await expect(withTenant(orgId, (tx) => deps!.planningStore.resolveImportedHistoricalRecord(tx, {
      organizationId: orgId, workspaceId, historicalRecordId: String(reconciled!["id"]), expectedVersion: Number(reconciled!["version"]) + 1,
      sourceDisposition: "historical_candidate", completionGate: "legacy_unverified", promotionCommandId: null, devTicketId: null,
    }), database!)).rejects.toMatchObject({ code: "dev_board.historical_transition_invalid" });

    const promotedTaskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Store guard promoted', 1000, 'todo')", [promotedTaskId, orgId, workspaceId]);
    await importLegacyDevTicket(envelope(`${promotedTaskId}:import`, promotedTaskId), { legacyTaskId: promotedTaskId, humanOwnerUserId: ownerId }, deps!);
    const promoted = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.id, h.version from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${promotedTaskId}::uuid`))[0], database!);
    await expect(withTenant(orgId, (tx) => deps!.planningStore.resolveImportedHistoricalRecord(tx, {
      organizationId: orgId, workspaceId, historicalRecordId: String(promoted!["id"]), expectedVersion: Number(promoted!["version"]),
      sourceDisposition: "quarantined_no_owner", completionGate: null, promotionCommandId: null, devTicketId: null,
    }), database!)).rejects.toMatchObject({ code: "dev_board.historical_transition_invalid" });
  });

  it("rejects insufficient historical evidence with no historical or ledger mutation", async () => {
    const taskId = randomUUID();
    await adminPool!.query("insert into public.tasks (id, organization_id, workspace_id, title, card_number, status) values ($1, $2, $3, 'Insufficient done', 995, 'done')", [taskId, orgId, workspaceId]);
    const before = await sourceSnapshot(taskId);
    await importLegacyDevTicket(envelope(taskId, taskId), { legacyTaskId: taskId, humanOwnerUserId: ownerId }, deps!);
    const historical = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.id, h.version, (select count(*) from public.dev_board_planning_decision_entry) as planning_count, (select count(*) from public.dev_board_activity_event) as activity_count from public.dev_board_legacy_task_alias a join public.dev_board_historical_record h on h.id = a.historical_record_id where a.legacy_task_id = ${taskId}::uuid`))[0], database!);
    const rejected = await reconcileHistoricalCompletion({ ...envelope(`${taskId}:insufficient`, String(historical!["id"])), commandName: "ReconcileHistoricalCompletion" }, { historicalRecordId: String(historical!["id"]), reconciliationEpoch: "epoch-insufficient" }, deps!);
    expect(rejected).toMatchObject({ ok: false, error: { code: "dev_board.reconcile_evidence_insufficient" } });
    const after = await withTenant(orgId, async (tx) => rows(await tx.execute(sql`select h.version, (select count(*) from public.dev_board_planning_decision_entry) as planning_count, (select count(*) from public.dev_board_activity_event) as activity_count from public.dev_board_historical_record h where h.id = ${historical!["id"]}::uuid`))[0], database!);
    expect(after).toEqual({ version: historical!["version"], planning_count: historical!["planning_count"], activity_count: historical!["activity_count"] });
    await expectSourceUnchanged(taskId, before);
  });

  it("enforces RLS on the legacy alias and historical tables", async () => {
    const hidden = await withTenant(otherOrgId, async (tx) => rows(await tx.execute(sql`
      select 'historical' as kind, id::text as id from public.dev_board_historical_record where organization_id = ${orgId}::uuid
      union all
      select 'alias' as kind, legacy_task_id::text as id from public.dev_board_legacy_task_alias where organization_id = ${orgId}::uuid
    `)), database!);
    expect(hidden).toEqual([]);
  });
});
