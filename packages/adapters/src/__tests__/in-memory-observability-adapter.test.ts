import { describe, expect, it } from "vitest";

import {
  auditIntents,
  auditTargetKinds,
  auditTransitions,
  type AppendAuditInput,
  type AuditIntent,
  type AuditTargetKind,
  type AuditTransition,
} from "@opzava/ports";

import { InMemoryObservabilityAdapter } from "../in-memory-observability-adapter.js";

const ORG_ID = "00000000-0000-4000-8000-000000000001" as AppendAuditInput["organizationId"];

function appendInput(overrides: Partial<AppendAuditInput> = {}): AppendAuditInput {
  return {
    organizationId: ORG_ID,
    intent: "provider_model_toggled",
    transition: "completed",
    targetKind: "model_provider",
    targetRef: "anthropic:claude",
    actorId: "user-1",
    actorType: "user",
    result: "success",
    ...overrides,
  };
}

describe("InMemoryObservabilityAdapter", () => {
  it("records diagnostics via capture without surfacing them as compliance events", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    const result = await adapter.capture({
      source: "test",
      operation: "op",
      severity: "warning",
      message: "boom",
    });

    expect(result.ok).toBe(true);
    expect(adapter.diagnostics).toHaveLength(1);
    expect(adapter.auditEvents).toHaveLength(0);
  });

  it("appends a compliance event and returns an event id", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    const receipt = await adapter.appendAudit(appendInput());

    expect(receipt.ok).toBe(true);
    if (!receipt.ok) {
      return;
    }
    expect(receipt.value.eventId).toEqual(expect.any(String));
    expect(receipt.value.configVersionId).toBeUndefined();

    expect(adapter.auditEvents).toHaveLength(1);
    const event = adapter.auditEvents[0]!;
    expect(event).toMatchObject({
      intent: "provider_model_toggled",
      transition: "completed",
      targetKind: "model_provider",
      targetRef: "anthropic:claude",
      actorId: "user-1",
      actorType: "user",
      result: "success",
    });
    // No idempotency-key-like field exists on a recorded event (#192 comment 3a).
    expect(event).not.toHaveProperty("idempotencyKey");
  });

  it("links an immutable config version when a secret-free snapshot is supplied", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    const receipt = await adapter.appendAudit(
      appendInput({
        configSnapshot: {
          targetKind: "orchestrator",
          targetRef: "orchestrator",
          content: { orchestratorProviderId: "anthropic", allowAgents: ["ask-admin"] },
          versionHash: "a".repeat(64),
        },
      }),
    );

    expect(receipt.ok).toBe(true);
    if (!receipt.ok) {
      return;
    }
    expect(receipt.value.configVersionId).toEqual(expect.any(String));

    expect(adapter.configVersions).toHaveLength(1);
    const version = adapter.configVersions[0]!;
    expect(version.content).toEqual({
      orchestratorProviderId: "anthropic",
      allowAgents: ["ask-admin"],
    });
    expect(version.versionHash).toBe("a".repeat(64));

    const event = adapter.auditEvents[0]!;
    expect(event.configVersionId).toBe(receipt.value.configVersionId);
  });

  it("records the actor/triggered_by split for a system-initiated transition", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    await adapter.appendAudit(
      appendInput({
        intent: "orchestrator_reconciled",
        transition: "completed",
        targetKind: "orchestrator",
        targetRef: "orchestrator",
        actorId: "system",
        actorType: "system",
        result: "success",
        trigger: {
          triggeredByActorId: "user-1",
          triggeredByAction: "provider_connected",
        },
      }),
    );

    const event = adapter.auditEvents[0]!;
    expect(event.actorId).toBe("system");
    expect(event.actorType).toBe("system");
    expect(event.triggeredByActorId).toBe("user-1");
    expect(event.triggeredByAction).toBe("provider_connected");
  });

  it("omits triggered_by when no trigger is supplied", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    await adapter.appendAudit(appendInput());

    const event = adapter.auditEvents[0]!;
    expect(event.triggeredByActorId).toBeUndefined();
    expect(event.triggeredByAction).toBeUndefined();
  });

  it("preserves append order across many events", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    for (let i = 0; i < 3; i += 1) {
      await adapter.appendAudit(appendInput({ targetRef: `p:${i}` }));
    }
    expect(adapter.auditEvents.map((event) => event.targetRef)).toEqual(["p:0", "p:1", "p:2"]);
  });

  it("accepts every declared audit intent, transition, and target kind", async () => {
    const adapter = new InMemoryObservabilityAdapter();
    for (const intent of auditIntents) {
      await adapter.appendAudit(appendInput({ intent: intent as AuditIntent }));
    }
    for (const transition of auditTransitions) {
      await adapter.appendAudit(appendInput({ transition: transition as AuditTransition }));
    }
    for (const targetKind of auditTargetKinds) {
      await adapter.appendAudit(appendInput({ targetKind: targetKind as AuditTargetKind }));
    }
    const intents = new Set(adapter.auditEvents.map((event) => event.intent));
    for (const intent of auditIntents) {
      expect(intents.has(intent)).toBe(true);
    }
  });
});
