import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { InMemoryCommandReceiptRepository } from "../adapters/in-memory-command-receipt-repository.js";
import type { CommandEnvelope } from "../domain/command-envelope.js";
import type { TenantTransaction } from "@opzava/adapters";

function envelope(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    commandId: randomUUID(),
    idempotencyKey: "retry-1",
    requestHash: "a".repeat(64),
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    commandName: "CreateDevTicket",
    targetAggregateId: randomUUID(),
    actorRef: { kind: "user", stableId: "owner-1", role: "human_owner" },
    sourceRef: { kind: "admin_ui", ref: "session-1" },
    authorizationVersion: 1,
    correlationId: randomUUID(),
    expectedVersions: [],
    ...overrides
  };
}

describe("command receipt reservation", () => {
  it("reserves a first command attempt", async () => {
    const repository = new InMemoryCommandReceiptRepository();
    const command = envelope();

    await expect(repository.reserveOrReplay(command)).resolves.toEqual({
      ok: true,
      value: { commandId: command.commandId, state: "reserved" }
    });
  });

  it("replays the original command id for the same key and hash", async () => {
    const repository = new InMemoryCommandReceiptRepository();
    const first = envelope();
    const replay = envelope({
      ...first,
      commandId: randomUUID()
    });

    await repository.reserveOrReplay(first);
    const result = await repository.reserveOrReplay(replay);

    expect(result).toEqual({
      ok: true,
      value: { commandId: first.commandId, state: "reserved" }
    });
  });

  it("returns an idempotency conflict for the same key and a different hash", async () => {
    const repository = new InMemoryCommandReceiptRepository();
    const first = envelope();
    await repository.reserveOrReplay(first);

    const result = await repository.reserveOrReplay(
      envelope({ ...first, commandId: randomUUID(), requestHash: "b".repeat(64) })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("dev_board.idempotency_conflict");
  });

  it("replays terminal fields after transaction-scoped finalization", async () => {
    const repository = new InMemoryCommandReceiptRepository();
    const command = envelope();
    const tx = {} as TenantTransaction;
    const resultingVersions = [
      { recordKind: "dev_ticket", recordId: command.targetAggregateId, version: 1 }
    ];

    await repository.reserveOrReplayTransaction(tx, command);
    await expect(
      repository.finalizeTransaction(tx, {
        organizationId: command.organizationId,
        commandId: command.commandId,
        outcome: "accepted",
        resultSummary: { title: "Accepted" },
        resultingVersions
      })
    ).resolves.toEqual({ ok: true, value: undefined });

    await expect(repository.reserveOrReplayTransaction(tx, command)).resolves.toEqual({
      ok: true,
      value: {
        commandId: command.commandId,
        state: "accepted",
        resultSummary: { title: "Accepted" },
        resultingVersions
      }
    });
    const secondFinalization = await repository.finalizeTransaction(tx, {
      organizationId: command.organizationId,
      commandId: command.commandId,
      outcome: "rejected"
    });
    expect(secondFinalization.ok).toBe(false);
    if (!secondFinalization.ok) {
      expect(secondFinalization.error.code).toBe("dev_board.invalid_command_receipt");
    }
  });
});
