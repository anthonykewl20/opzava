import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase, createPostgresPool } from "@opzava/adapters";

import { PostgresCommandReceiptRepository } from "../adapters/postgres/postgres-command-receipt-repository.js";
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
});

if (!enabled) {
  describe("Dev Board command receipt real-Postgres idempotency and RLS", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0020 applied", () => {});
  });
}
