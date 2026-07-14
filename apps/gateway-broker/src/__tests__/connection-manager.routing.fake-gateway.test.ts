import type { OpenClawGatewayRouteId, StartAssistantStreamInput } from "@opzava/ports";
import { makeOrgId, makeTenantId, makeUserId, makeWorkspaceId } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { FakeOpenClawGateway } from "../acl/openclaw/fake-gateway.js";
import { HmacDeviceKeypair, deriveDeviceIdFromPublicKey } from "../acl/openclaw/signing.js";
import { GatewayConnectionManager } from "../routing/connection-manager.js";
import { StaticGatewayRoutingTable, type GatewayRouteConfig } from "../routing/routes.js";

const pairedDeviceToken = "paired-device-token";
const fakeRawPublicKey = Buffer.from(
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  "hex",
);

const managers: GatewayConnectionManager[] = [];
const gateways: FakeOpenClawGateway[] = [];

function createDeviceKeypair(): HmacDeviceKeypair {
  const publicKey = fakeRawPublicKey.toString("base64url");

  return new HmacDeviceKeypair({
    deviceId: deriveDeviceIdFromPublicKey(publicKey),
    publicKey,
    secret: randomUUID(),
  });
}

async function createGateway(): Promise<{
  readonly gateway: FakeOpenClawGateway;
  readonly deviceKeypair: HmacDeviceKeypair;
}> {
  const deviceKeypair = createDeviceKeypair();
  const gateway = new FakeOpenClawGateway({ deviceKeypair, pairedDeviceToken });
  await gateway.ready;
  gateways.push(gateway);

  return { gateway, deviceKeypair };
}

function createBroker(routes: readonly GatewayRouteConfig[]): GatewayConnectionManager {
  const broker = new GatewayConnectionManager({
    idleDisconnectMs: 10_000,
    routingTable: new StaticGatewayRoutingTable(routes),
    clientOptions: {
      challengeTimeoutMs: 500,
      connectBudgetMs: 1_000,
      requestTimeoutMs: 500,
    },
  });
  managers.push(broker);

  return broker;
}

function startInput(input: {
  readonly routeId: OpenClawGatewayRouteId;
  readonly tenantId: string;
  readonly conversationId: string;
}): StartAssistantStreamInput {
  return {
    routeId: input.routeId,
    assistantKey: "ask-admin-opzava",
    conversationId: input.conversationId,
    turnId: "turn-1",
    prompt: "Create a task",
    idempotencyKey: `idem-${randomUUID()}`,
    actingPrincipal: {
      tenantId: makeTenantId(input.tenantId),
      orgId: makeOrgId(`org-${input.tenantId}`),
      workspaceId: makeWorkspaceId(`workspace-${input.tenantId}`),
      userId: makeUserId(`user-${input.tenantId}`),
      roleKeys: ["admin"],
    },
  };
}

const expectedToolNames = [
  "opzava_tasks_list",
  "opzava_tasks_create",
  "opzava_tasks_update",
];

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    manager.disconnectAll();
  }

  for (const gateway of gateways.splice(0)) {
    await gateway.close();
  }
});

describe("GatewayConnectionManager route isolation", () => {
  it("does not grant a route handle to a principal from another tenant", async () => {
    const route = "tenant-a-openclaw" as OpenClawGatewayRouteId;
    const a = await createGateway();
    const broker = createBroker([
      {
        routeId: route,
        tenantId: makeTenantId("tenant-a"),
        url: a.gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair: a.deviceKeypair,
        clientVersion: "0.0.0",
      },
    ]);
    const mismatched = startInput({
      routeId: route,
      tenantId: "tenant-b",
      conversationId: "conversation-b",
    });

    const access = await broker.forPrincipal({
      routeId: route,
      actingPrincipal: mismatched.actingPrincipal,
    });

    expect(access).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.tenantMismatch" },
    });
    expect("startAssistantStream" in broker).toBe(false);
    expect("getEffectiveTools" in broker).toBe(false);
    expect(a.gateway.connectionCount).toBe(0);
  });

  it("asks only the addressed tenant's Gateway for effective tools", async () => {
    const routeA = "tenant-a-openclaw" as OpenClawGatewayRouteId;
    const routeB = "tenant-b-openclaw" as OpenClawGatewayRouteId;
    const a = await createGateway();
    const b = await createGateway();

    const broker = createBroker([
      {
        routeId: routeA,
        tenantId: makeTenantId("tenant-a"),
        url: a.gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair: a.deviceKeypair,
        clientVersion: "0.0.0",
      },
      {
        routeId: routeB,
        tenantId: makeTenantId("tenant-b"),
        url: b.gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair: b.deviceKeypair,
        clientVersion: "0.0.0",
      },
    ]);

    // Tenant B connects first, so it is the first client the manager iterates.
    const inputB = startInput({
      routeId: routeB,
      tenantId: "tenant-b",
      conversationId: "conversation-b",
    });
    const inputA = startInput({
      routeId: routeA,
      tenantId: "tenant-a",
      conversationId: "conversation-a",
    });
    const accessB = await broker.forPrincipal({
      routeId: inputB.routeId,
      actingPrincipal: inputB.actingPrincipal,
    });
    const accessA = await broker.forPrincipal({
      routeId: inputA.routeId,
      actingPrincipal: inputA.actingPrincipal,
    });
    expect(accessB.ok).toBe(true);
    expect(accessA.ok).toBe(true);
    if (!accessB.ok) {
      throw accessB.error;
    }
    if (!accessA.ok) {
      throw accessA.error;
    }

    const { routeId: _routeB, actingPrincipal: _principalB, ...streamInputB } = inputB;
    const { routeId: _routeA, actingPrincipal: _principalA, ...streamInputA } = inputA;
    void _routeB;
    void _principalB;
    void _routeA;
    void _principalA;
    const streamB = await accessB.value.startAssistantStream(streamInputB);
    const streamA = await accessA.value.startAssistantStream(streamInputA);
    expect(streamB.ok).toBe(true);
    expect(streamA.ok).toBe(true);
    if (!streamA.ok) {
      throw streamA.error;
    }

    const tools = await accessA.value.getEffectiveTools({
      sessionRef: streamA.value.sessionRef,
      toolNames: expectedToolNames,
    });

    expect(tools).toMatchObject({ ok: true, value: { toolNames: expectedToolNames } });
    expect(a.gateway.toolsEffectiveSessionKeys).toEqual(["agent:ask-admin-opzava:conversation-a"]);
    expect(b.gateway.toolsEffectiveSessionKeys).toEqual([]);
  });

  it("keeps one connection per route when a tenant has two routes", async () => {
    const primary = "tenant-a-primary" as OpenClawGatewayRouteId;
    const secondary = "tenant-a-secondary" as OpenClawGatewayRouteId;
    const a = await createGateway();
    const b = await createGateway();
    const tenantId = makeTenantId("tenant-a");

    const broker = createBroker([
      {
        routeId: primary,
        tenantId,
        url: a.gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair: a.deviceKeypair,
        clientVersion: "0.0.0",
      },
      {
        routeId: secondary,
        tenantId,
        url: b.gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair: b.deviceKeypair,
        clientVersion: "0.0.0",
      },
    ]);

    const firstInput = startInput({
      routeId: primary,
      tenantId: "tenant-a",
      conversationId: "conversation-1",
    });
    const secondInput = startInput({
      routeId: secondary,
      tenantId: "tenant-a",
      conversationId: "conversation-2",
    });
    const firstAccess = await broker.forPrincipal({
      routeId: firstInput.routeId,
      actingPrincipal: firstInput.actingPrincipal,
    });
    const secondAccess = await broker.forPrincipal({
      routeId: secondInput.routeId,
      actingPrincipal: secondInput.actingPrincipal,
    });
    expect(firstAccess.ok).toBe(true);
    expect(secondAccess.ok).toBe(true);
    if (!firstAccess.ok) {
      throw firstAccess.error;
    }
    if (!secondAccess.ok) {
      throw secondAccess.error;
    }

    const {
      routeId: _firstRoute,
      actingPrincipal: _firstPrincipal,
      ...firstStreamInput
    } = firstInput;
    const {
      routeId: _secondRoute,
      actingPrincipal: _secondPrincipal,
      ...secondStreamInput
    } = secondInput;
    void _firstRoute;
    void _firstPrincipal;
    void _secondRoute;
    void _secondPrincipal;
    const first = await firstAccess.value.startAssistantStream(firstStreamInput);
    const second = await secondAccess.value.startAssistantStream(secondStreamInput);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    expect(a.gateway.sessionRequestCount).toBe(1);
    expect(b.gateway.sessionRequestCount).toBe(1);
  });

  it("exposes per-route health only through the explicit ops capability", async () => {
    const route = "tenant-a-openclaw" as OpenClawGatewayRouteId;
    const a = await createGateway();
    const broker = createBroker([
      {
        routeId: route,
        tenantId: makeTenantId("tenant-a"),
        url: a.gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair: a.deviceKeypair,
        clientVersion: "0.0.0",
      },
    ]);

    const health = await broker.getHealthForOps(route);

    expect(health).toMatchObject({
      ok: true,
      value: { routeId: route, reachable: false, circuitOpen: false },
    });
  });
});
