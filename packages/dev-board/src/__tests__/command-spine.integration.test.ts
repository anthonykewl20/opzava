import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase, createPostgresPool, withTenant } from "@opzava/adapters";

import { PostgresCommandReceiptRepository } from "../adapters/postgres/postgres-command-receipt-repository.js";
import { PostgresDevBoardLedgerAppendStore } from "../adapters/postgres/postgres-dev-board-ledger-append-store.js";
import type { CommandEnvelope } from "../domain/command-envelope.js";

const enabled = Boolean(process.env["DATABASE_URL"] && process.env["DATABASE_MIGRATION_URL"]);
const describePostgres = enabled ? describe : describe.skip;

function rows(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) return result as ReadonlyArray<Record<string, unknown>>;
  if (typeof result !== "object" || result === null || !("rows" in result)) return [];
  const value = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(value) ? (value as ReadonlyArray<Record<string, unknown>>) : [];
}

describePostgres("Dev Board command receipt real-Postgres idempotency and RLS", () => {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const otherOrganizationId = randomUUID();
  const appPool = enabled ? createPostgresPool(process.env["DATABASE_URL"]) : undefined;
  const adminPool = enabled
    ? createPostgresPool(process.env["DATABASE_MIGRATION_URL"])
    : undefined;
  const appDatabase = appPool === undefined ? undefined : createPostgresDatabase(appPool);
  const repository =
    appDatabase === undefined ? undefined : new PostgresCommandReceiptRepository(appDatabase);
  const ledger = new PostgresDevBoardLedgerAppendStore();

  function envelope(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
    return {
      commandId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: "a".repeat(64),
      organizationId,
      workspaceId,
      commandName: "CreateDevTicket",
      targetAggregateId: randomUUID(),
      actorRef: { kind: "human", stableId: "owner-1", role: "owner" },
      sourceRef: { kind: "admin_ui", ref: "session-1" },
      authorizationVersion: 1,
      correlationId: randomUUID(),
      expectedVersions: [],
      ...overrides
    };
  }

  beforeAll(async () => {
    const roleResult = await appDatabase!.execute(sql`
      select current_user as session_role, rolsuper as is_super, rolbypassrls as bypass_rls
      from pg_roles
      where rolname = current_user
    `);
    const role = rows(roleResult)[0];
    if (
      role?.["session_role"] !== "opzava_app" ||
      role?.["is_super"] === true ||
      role?.["bypass_rls"] === true
    ) {
      throw new Error(
        `RLS integration test must run as non-owner opzava_app; got ${JSON.stringify(role)}`
      );
    }

    await adminPool!.query(
      "insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')",
      [organizationId, `dev-board-${organizationId}`, "Dev Board command spine integration"]
    );
    await adminPool!.query(
      "insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')",
      [otherOrganizationId, `dev-board-${otherOrganizationId}`, "Other Dev Board organization"]
    );
    await adminPool!.query(
      "insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, $3, $4)",
      [workspaceId, organizationId, `dev-board-${workspaceId}`, "Dev Board workspace"]
    );
  });

  afterAll(async () => {
    if (adminPool === undefined || appPool === undefined) return;
    await adminPool.query(
      "delete from public.dev_board_activity_event where organization_id = $1",
      [organizationId]
    );
    await adminPool.query(
      "delete from public.dev_board_planning_decision_entry where organization_id = $1",
      [organizationId]
    );
    await adminPool.query(
      "delete from public.dev_board_command_receipt where organization_id = $1",
      [organizationId]
    );
    await adminPool.query("delete from public.workspaces where organization_id = $1", [
      organizationId
    ]);
    await adminPool.query("delete from public.organizations where id = $1", [organizationId]);
    await adminPool.query("delete from public.organizations where id = $1", [otherOrganizationId]);
    await appPool.end();
    await adminPool.end();
  });

  it("reserves and replays the same command id for the same hash", async () => {
    const first = envelope();
    const replay = envelope({ ...first, commandId: randomUUID() });

    const reserved = await repository!.reserveOrReplay(first);
    const replayed = await repository!.reserveOrReplay(replay);

    expect(reserved).toEqual({
      ok: true,
      value: { commandId: first.commandId, state: "reserved" }
    });
    expect(replayed).toEqual(reserved);
  });

  it("returns a conflict for the same key and a different hash", async () => {
    const first = envelope();
    await repository!.reserveOrReplay(first);

    const result = await repository!.reserveOrReplay(
      envelope({ ...first, commandId: randomUUID(), requestHash: "b".repeat(64) })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("dev_board.idempotency_conflict");
  });

  it("rejects a cross-tenant organization insert with a hard forbidden error", async () => {
    await expect(
      repository!.reserveOrReplay(envelope({ organizationId: otherOrganizationId }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it("reads back a reserved receipt", async () => {
    const command = envelope();
    await repository!.reserveOrReplay(command);

    await expect(
      repository!.readReceipt({
        organizationId,
        workspaceId,
        commandName: command.commandName,
        idempotencyKey: command.idempotencyKey
      })
    ).resolves.toMatchObject({
      commandId: command.commandId,
      requestHash: command.requestHash,
      state: "reserved"
    });
  });

  it("atomically reserves, appends both ledgers, and finalizes", async () => {
    const command = envelope();
    const resultingVersions = [
      { recordKind: "dev_ticket", recordId: command.targetAggregateId, version: 1 }
    ];

    const sequences = await withTenant(
      organizationId,
      async (tx) => {
        const reserved = await repository!.reserveOrReplayTransaction(tx, command);
        expect(reserved.ok).toBe(true);
        const entry = await ledger.appendPlanningDecisionEntry(tx, {
          organizationId,
          workspaceId,
          commandId: command.commandId,
          aggregateId: command.targetAggregateId,
          entryKind: "ticket_created",
          subject: "Create ticket",
          contentHash: "c".repeat(64),
          content: { title: "Atomic ticket" }
        });
        const event = await ledger.appendActivityEvent(tx, {
          organizationId,
          workspaceId,
          aggregateId: command.targetAggregateId,
          aggregateVersion: 1,
          eventName: "DevTicketCreated",
          commandId: command.commandId,
          idempotencyKey: command.idempotencyKey,
          actor: command.actorRef,
          source: command.sourceRef,
          authorizationVersion: command.authorizationVersion,
          correlationId: command.correlationId,
          occurredAt: new Date(),
          payload: { title: "Atomic ticket" }
        });
        expect(entry.ok).toBe(true);
        expect(event.ok).toBe(true);
        const finalized = await repository!.finalizeTransaction(tx, {
          organizationId,
          commandId: command.commandId,
          outcome: "accepted",
          outcomeCode: "dev_board.accepted",
          resultRef: command.targetAggregateId,
          resultSummary: { title: "Atomic ticket" },
          resultingVersions
        });
        expect(finalized.ok).toBe(true);
        if (!entry.ok || !event.ok) throw new Error("Ledger append failed.");
        return { entry: entry.value.entrySequence, event: event.value.eventSequence };
      },
      appDatabase!
    );

    expect(sequences.entry).toBeGreaterThan(0);
    expect(sequences.event).toBeGreaterThan(0);
    await expect(
      repository!.readReceipt({
        organizationId,
        workspaceId,
        commandName: command.commandName,
        idempotencyKey: command.idempotencyKey
      })
    ).resolves.toMatchObject({
      commandId: command.commandId,
      state: "accepted",
      resultRef: command.targetAggregateId,
      resultSummary: { title: "Atomic ticket" },
      resultingVersions
    });
    const persisted = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select
              (select count(*) from public.dev_board_planning_decision_entry
                where command_id = ${command.commandId}::uuid) as entry_count,
              (select count(*) from public.dev_board_activity_event
                where command_id = ${command.commandId}::uuid) as event_count
          `)
        )[0],
      appDatabase!
    );
    expect(Number(persisted?.["entry_count"])).toBe(1);
    expect(Number(persisted?.["event_count"])).toBe(1);
  });

  it("rolls back reservation and ledger appends when finalization fails", async () => {
    const command = envelope();

    await expect(
      withTenant(
        organizationId,
        async (tx) => {
          await repository!.reserveOrReplayTransaction(tx, command);
          await ledger.appendPlanningDecisionEntry(tx, {
            organizationId,
            workspaceId,
            commandId: command.commandId,
            aggregateId: command.targetAggregateId,
            entryKind: "ticket_created",
            subject: "Rollback ticket",
            contentHash: "d".repeat(64),
            content: {}
          });
          await ledger.appendActivityEvent(tx, {
            organizationId,
            workspaceId,
            aggregateId: command.targetAggregateId,
            aggregateVersion: 1,
            eventName: "DevTicketCreated",
            commandId: command.commandId,
            idempotencyKey: command.idempotencyKey,
            actor: command.actorRef,
            source: command.sourceRef,
            authorizationVersion: 1,
            correlationId: command.correlationId,
            occurredAt: new Date(),
            payload: {}
          });
          const finalized = await repository!.finalizeTransaction(tx, {
            organizationId,
            commandId: randomUUID(),
            outcome: "accepted"
          });
          expect(finalized.ok).toBe(false);
          throw new Error("Abort command transaction.");
        },
        appDatabase!
      )
    ).rejects.toThrow("Abort command transaction.");

    const counts = await withTenant(
      organizationId,
      async (tx) =>
        rows(
          await tx.execute(sql`
            select
              (select count(*) from public.dev_board_command_receipt
                where command_id = ${command.commandId}::uuid) as receipt_count,
              (select count(*) from public.dev_board_planning_decision_entry
                where command_id = ${command.commandId}::uuid) as entry_count,
              (select count(*) from public.dev_board_activity_event
                where command_id = ${command.commandId}::uuid) as event_count
          `)
        )[0],
      appDatabase!
    );
    expect(Number(counts?.["receipt_count"])).toBe(0);
    expect(Number(counts?.["entry_count"])).toBe(0);
    expect(Number(counts?.["event_count"])).toBe(0);
  });

  it("replays a finalized receipt with its terminal result", async () => {
    const command = envelope();
    const resultSummary = { status: "ready" };
    const resultingVersions = [
      { recordKind: "dev_ticket", recordId: command.targetAggregateId, version: 2 }
    ];

    const replay = await withTenant(
      organizationId,
      async (tx) => {
        await repository!.reserveOrReplayTransaction(tx, command);
        await repository!.finalizeTransaction(tx, {
          organizationId,
          commandId: command.commandId,
          outcome: "accepted",
          resultSummary,
          resultingVersions
        });
        return repository!.reserveOrReplayTransaction(
          tx,
          envelope({ ...command, commandId: randomUUID() })
        );
      },
      appDatabase!
    );

    expect(replay).toEqual({
      ok: true,
      value: {
        commandId: command.commandId,
        state: "accepted",
        resultSummary,
        resultingVersions
      }
    });
  });

  it("allocates sequential planning and activity ledger sequences per workspace", async () => {
    const first = envelope();
    const second = envelope();
    const allocated = await withTenant(
      organizationId,
      async (tx) => {
        await repository!.reserveOrReplayTransaction(tx, first);
        await repository!.reserveOrReplayTransaction(tx, second);
        const planningOne = await ledger.appendPlanningDecisionEntry(tx, {
          organizationId,
          workspaceId,
          commandId: first.commandId,
          aggregateId: first.targetAggregateId,
          entryKind: "first",
          subject: "First",
          contentHash: "e".repeat(64),
          content: {}
        });
        const planningTwo = await ledger.appendPlanningDecisionEntry(tx, {
          organizationId,
          workspaceId,
          commandId: second.commandId,
          aggregateId: second.targetAggregateId,
          entryKind: "second",
          subject: "Second",
          contentHash: "f".repeat(64),
          content: {}
        });
        const activityOne = await ledger.appendActivityEvent(tx, {
          organizationId,
          workspaceId,
          aggregateId: first.targetAggregateId,
          aggregateVersion: 1,
          eventName: "First",
          commandId: first.commandId,
          idempotencyKey: first.idempotencyKey,
          actor: first.actorRef,
          source: first.sourceRef,
          authorizationVersion: 1,
          correlationId: first.correlationId,
          occurredAt: new Date(),
          payload: {}
        });
        const activityTwo = await ledger.appendActivityEvent(tx, {
          organizationId,
          workspaceId,
          aggregateId: second.targetAggregateId,
          aggregateVersion: 1,
          eventName: "Second",
          commandId: second.commandId,
          idempotencyKey: second.idempotencyKey,
          actor: second.actorRef,
          source: second.sourceRef,
          authorizationVersion: 1,
          correlationId: second.correlationId,
          occurredAt: new Date(),
          payload: {}
        });
        if (!planningOne.ok || !planningTwo.ok || !activityOne.ok || !activityTwo.ok) {
          throw new Error("Sequence append failed.");
        }
        return {
          planning: [planningOne.value.entrySequence, planningTwo.value.entrySequence],
          activity: [activityOne.value.eventSequence, activityTwo.value.eventSequence]
        };
      },
      appDatabase!
    );

    expect(allocated.planning[1]).toBe(allocated.planning[0]! + 1);
    expect(allocated.activity[1]).toBe(allocated.activity[0]! + 1);
  });
});

if (!enabled) {
  describe("Dev Board command receipt real-Postgres idempotency and RLS", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0020 applied", () => {});
  });
}
