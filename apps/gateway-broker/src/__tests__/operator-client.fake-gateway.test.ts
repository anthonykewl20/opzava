import type {
  OpenClawGatewayRouteId,
  OpenClawStreamEvent,
  StartAssistantStreamInput
} from "@opzava/ports";
import { makeOrgId, makeTenantId, makeUserId, makeWorkspaceId } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  FakeOpenClawGateway,
  type FakeGatewayMode
} from "../acl/openclaw/fake-gateway.js";
import { HmacDeviceKeypair } from "../acl/openclaw/signing.js";
import { GatewayConnectionManager } from "../routing/connection-manager.js";
import type { GatewayAuthMode } from "../routing/routes.js";
import { StaticGatewayRoutingTable } from "../routing/routes.js";

const routeId = "platform-openclaw" as OpenClawGatewayRouteId;
const tenantId = makeTenantId("tenant-platform");
const orgId = makeOrgId("org-platform");
const workspaceId = makeWorkspaceId("workspace-admin");
const userId = makeUserId("user-admin");
const pairedDeviceToken = "paired-device-token";

const managers: GatewayConnectionManager[] = [];
const gateways: FakeOpenClawGateway[] = [];

interface BrokerFixture {
  readonly gateway: FakeOpenClawGateway;
  readonly broker: GatewayConnectionManager;
}

function createDeviceKeypair(): HmacDeviceKeypair {
  return new HmacDeviceKeypair({
    deviceId: "opzava-broker-device",
    publicKey: "opzava-broker-public-key",
    secret: randomUUID()
  });
}

async function createBrokerFixture(input: {
  readonly mode?: FakeGatewayMode;
  readonly authMode?: GatewayAuthMode;
} = {}): Promise<BrokerFixture> {
  const deviceKeypair = createDeviceKeypair();
  const gateway = new FakeOpenClawGateway({
    deviceKeypair,
    pairedDeviceToken,
    ...(input.mode !== undefined ? { mode: input.mode } : {})
  });
  await gateway.ready;
  gateways.push(gateway);

  const broker = new GatewayConnectionManager({
    idleDisconnectMs: 10_000,
    maxFailuresBeforeOpen: 2,
    routingTable: new StaticGatewayRoutingTable([
      {
        routeId,
        tenantId,
        url: gateway.url,
        authMode: input.authMode ?? "paired-device",
        pairedDeviceToken,
        deviceKeypair,
        clientVersion: "0.0.0"
      }
    ]),
    clientOptions: {
      challengeTimeoutMs: 500,
      connectBudgetMs: 1_000,
      requestTimeoutMs: 500
    }
  });
  managers.push(broker);

  return { gateway, broker };
}

function startInput(idempotencyKey = `idem-${randomUUID()}`): StartAssistantStreamInput {
  return {
    routeId,
    assistantKey: "ask-admin-opzava",
    conversationId: "conversation-1",
    turnId: "turn-1",
    prompt: "Create a task",
    idempotencyKey,
    actingPrincipal: {
      tenantId,
      orgId,
      workspaceId,
      userId,
      roleKeys: ["admin"]
    }
  };
}

async function collectUntilTerminal(
  events: AsyncIterable<OpenClawStreamEvent>
): Promise<readonly OpenClawStreamEvent[]> {
  const collected: OpenClawStreamEvent[] = [];

  await Promise.race([
    (async () => {
      for await (const event of events) {
        collected.push(event);
        if (event.type === "final" || event.type === "failed") {
          break;
        }
      }
    })(),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for stream terminal event.")), 1_000);
    })
  ]);

  return collected;
}

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    manager.disconnectAll();
  }

  for (const gateway of gateways.splice(0)) {
    await gateway.close();
  }
});

describe("[fake-gateway] broker operator client", () => {
  it("negotiates protocol v4 and streams one idempotent session request", async () => {
    const { broker, gateway } = await createBrokerFixture();
    const first = await broker.startAssistantStream(startInput("same-idempotency-key"));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }

    const firstEvents = await collectUntilTerminal(first.value.events);
    expect(firstEvents).toEqual([
      { type: "queued", turnId: "turn-1" },
      { type: "delta", turnId: "turn-1", deltaText: "Created " },
      { type: "delta", turnId: "turn-1", deltaText: "the task." },
      {
        type: "final",
        turnId: "turn-1",
        content: { text: "Created the task." },
        sessionRef: { system: "openclaw", kind: "session", value: "conversation-1" },
        runRef: { system: "openclaw", kind: "run", value: "run:same-idempotency-key" }
      }
    ]);

    const tools = await broker.getEffectiveTools({
      sessionRef: first.value.sessionRef,
      toolNames: ["opzava_tasks_list", "opzava_tasks_create", "opzava_tasks_update"]
    });
    expect(tools).toMatchObject({
      ok: true,
      value: {
        toolNames: ["opzava_tasks_list", "opzava_tasks_create", "opzava_tasks_update"]
      }
    });

    const replay = await broker.startAssistantStream(startInput("same-idempotency-key"));
    expect(replay).toMatchObject({
      ok: true,
      value: {
        runRef: { value: "run:same-idempotency-key" }
      }
    });
    expect(gateway.sessionRequestCount).toBe(2);

    const driftedTools = await broker.getEffectiveTools({
      sessionRef: first.value.sessionRef,
      toolNames: ["opzava_tasks_list"]
    });
    expect(driftedTools).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.toolInventoryMismatch" }
    });
  });

  it("streams scripted task tool-call intents without exposing OpenClaw frames", async () => {
    const { broker } = await createBrokerFixture({ mode: "scripted-task-tool-call" });
    const result = await broker.startAssistantStream(startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events).toContainEqual({
      type: "tool.call",
      turnId: "turn-1",
      toolCallId: "tool-call-create-task",
      toolName: "opzava_tasks_create",
      args: {
        title: "Scripted fake-lane task",
        description: "Created through Ask Admin Opzava.",
        priority: "normal",
        status: "todo",
        labels: ["ask-admin"]
      }
    });
  });

  it("retries startup-sidecars UNAVAILABLE within the connection budget", async () => {
    const { broker, gateway } = await createBrokerFixture({ mode: "startup-sidecars-once" });
    const result = await broker.startAssistantStream(startInput());

    expect(result.ok).toBe(true);
    expect(gateway.connectionCount).toBeGreaterThanOrEqual(2);
  });

  it("rejects shared-secret hot-path configuration before connecting", async () => {
    const { broker, gateway } = await createBrokerFixture({ authMode: "shared-secret" });
    const result = await broker.startAssistantStream(startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.authModeForbidden" }
    });
    expect(gateway.connectionCount).toBe(0);
  });

  it("rejects caller tenant drift before connecting", async () => {
    const { broker, gateway } = await createBrokerFixture();
    const input = startInput();
    const result = await broker.startAssistantStream({
      ...input,
      actingPrincipal: {
        ...input.actingPrincipal,
        tenantId: makeTenantId("tenant-other")
      }
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.tenantMismatch" }
    });
    expect(gateway.connectionCount).toBe(0);
  });

  it("maps AUTH_SCOPE_MISMATCH without treating it as a bad-token retry", async () => {
    const { broker } = await createBrokerFixture({ mode: "auth-scope-mismatch" });
    const result = await broker.startAssistantStream(startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.authScopeMismatch" }
    });
  });

  it("fails closed when hello-ok scopes are inflated", async () => {
    const { broker } = await createBrokerFixture({ mode: "scope-inflated" });
    const result = await broker.startAssistantStream(startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.scopeMismatch" }
    });
  });

  it("fails closed on protocol range mismatch", async () => {
    const { broker } = await createBrokerFixture({ mode: "protocol-mismatch" });
    const result = await broker.startAssistantStream(startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.protocolMismatch" }
    });
  });

  it("turns unknown event families into sanitized failed stream events", async () => {
    const { broker } = await createBrokerFixture({ mode: "unknown-event-family" });
    const result = await broker.startAssistantStream(startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.unknownEventFamily"
    });
  });

  it("fails the stream when the socket dies mid-stream", async () => {
    const { broker } = await createBrokerFixture({ mode: "mid-stream-close" });
    const result = await broker.startAssistantStream(startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events).toContainEqual({ type: "delta", turnId: "turn-1", deltaText: "Created " });
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.connectionClosed"
    });
  });

  it("fails safe on duplicate response ids", async () => {
    const { broker } = await createBrokerFixture({ mode: "duplicate-response" });
    const result = await broker.startAssistantStream(startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.duplicateResponse"
    });
  });
});
