import { describe, expect, expectTypeOf, it } from "vitest";

import {
  acceptCommand,
  aggregate,
  checkBaseHash,
  checkIdempotentReplay,
  reconcile,
  type CommandOutcome,
  type CommandReceipt,
} from "../lib/admin-command";

const receipt: CommandReceipt = {
  opId: "op-1",
  auditRef: "/security-and-audit/op-1",
  submittedAt: "2026-07-20T00:00:00.000Z",
};

describe("Admin command lifecycle", () => {
  it("keeps acceptance distinct from success", () => {
    expect(acceptCommand(receipt)).toEqual({ receipt, state: "accepted" });
    expect(reconcile(receipt, { kind: "not-yet-observed" })).toEqual({
      receipt,
      state: "pending",
      reason: "awaiting-readback",
    });
  });

  it("keeps an ambiguous timeout pending instead of claiming failure or success", () => {
    expect(reconcile(receipt, { kind: "ambiguous-timeout" })).toEqual({
      receipt,
      state: "pending",
      reason: "ambiguous-timeout",
    });
  });

  it("keeps a restart without authoritative readback indeterminate", () => {
    expect(reconcile(receipt, { kind: "restart-without-readback" })).toEqual({
      receipt,
      state: "indeterminate",
      reason: "restart-without-readback",
    });
  });

  it("promotes success only from an authoritative readback", () => {
    const readback = {
      kind: "authoritative",
      state: "succeeded",
      observedAt: "2026-07-20T00:00:05.000Z",
      checkpoint: "checkpoint-2",
    } as const;

    expect(reconcile(receipt, readback)).toEqual({ receipt, state: "succeeded", readback });
    expectTypeOf<
      Extract<CommandOutcome, { state: "succeeded" }>["readback"]["state"]
    >().toEqualTypeOf<"succeeded">();
  });

  it("returns conflict plus fresh state when the expected base hash mismatches", () => {
    expect(
      checkBaseHash("hash-old", {
        baseHash: "hash-current",
        freshState: { enabled: true },
      }),
    ).toEqual({
      status: "conflict",
      expectedBaseHash: "hash-old",
      actualBaseHash: "hash-current",
      freshState: { enabled: true },
    });
  });

  it("aggregates mixed terminal target results as partial while retaining each target", () => {
    const parts = [
      { targetId: "agent-1", state: "succeeded" },
      { targetId: "agent-2", state: "failed" },
    ] as const;

    expect(aggregate(parts)).toEqual({ state: "partial", parts });
    expect(aggregate([{ targetId: "agent-1", state: "succeeded" }])).toMatchObject({
      state: "succeeded",
    });
    expect(aggregate([{ targetId: "agent-1", state: "failed" }])).toMatchObject({
      state: "failed",
    });
  });

  it("reuses an idempotent receipt only for the identical payload", () => {
    const prior = { idempotencyKey: "key-1", payloadHash: "payload-a", receipt } as const;

    expect(
      checkIdempotentReplay(prior, { idempotencyKey: "key-1", payloadHash: "payload-a" }),
    ).toEqual({ status: "reuse", receipt });
    expect(
      checkIdempotentReplay(prior, { idempotencyKey: "key-1", payloadHash: "payload-b" }),
    ).toEqual({ status: "conflict" });
    expect(
      checkIdempotentReplay(prior, { idempotencyKey: "key-2", payloadHash: "payload-a" }),
    ).toEqual({ status: "new-command" });
  });

  it("keeps the browser receipt contract limited to safe references", () => {
    expect(Object.keys(receipt).sort()).toEqual(["auditRef", "opId", "submittedAt"]);
    expectTypeOf<keyof CommandReceipt>().toEqualTypeOf<"opId" | "auditRef" | "submittedAt">();
    expect(JSON.stringify(receipt)).not.toMatch(/credential|secret|token|raw/i);
  });
});
