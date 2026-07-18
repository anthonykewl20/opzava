import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import type { OpenClawGatewayRouteId } from "@opzava/ports";
import { makeTenantId } from "@opzava/shared-kernel";
import { afterEach, describe, expect, it } from "vitest";

import { FakeOpenClawGateway, type FakeGatewayMode } from "../acl/openclaw/fake-gateway.js";
import { HmacDeviceKeypair, deriveDeviceIdFromPublicKey } from "../acl/openclaw/signing.js";
import { createBrokerInternalHttpServer } from "../internal/http-server.js";
import { GatewayConnectionManager } from "../routing/connection-manager.js";
import { StaticGatewayRoutingTable } from "../routing/routes.js";

const routeId = "platform-openclaw" as OpenClawGatewayRouteId;
const tenantId = makeTenantId("tenant-platform");
const pairedDeviceToken = "paired-device-token";

const managers: GatewayConnectionManager[] = [];
const gateways: FakeOpenClawGateway[] = [];
const fakeRawPublicKey = Buffer.from(
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  "hex",
);

interface InternalHttpFixture {
  readonly gateway: FakeOpenClawGateway;
  readonly broker: GatewayConnectionManager;
}

function createDeviceKeypair(): HmacDeviceKeypair {
  const publicKey = fakeRawPublicKey.toString("base64url");

  return new HmacDeviceKeypair({
    deviceId: deriveDeviceIdFromPublicKey(publicKey),
    publicKey,
    secret: randomUUID(),
  });
}

async function createFixture(mode?: FakeGatewayMode): Promise<InternalHttpFixture> {
  const deviceKeypair = createDeviceKeypair();
  const gateway = new FakeOpenClawGateway({
    deviceKeypair,
    pairedDeviceToken,
    ...(mode === undefined ? {} : { mode }),
  });
  await gateway.ready;
  gateways.push(gateway);

  const broker = new GatewayConnectionManager({
    idleDisconnectMs: 10_000,
    routingTable: new StaticGatewayRoutingTable([
      {
        routeId,
        tenantId,
        url: gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair,
        clientVersion: "0.0.0",
      },
    ]),
    clientOptions: {
      challengeTimeoutMs: 500,
      connectBudgetMs: 1_000,
      requestTimeoutMs: 500,
    },
  });
  managers.push(broker);

  return { gateway, broker };
}

function requestBody(idempotencyKey = `idem-${randomUUID()}`) {
  return {
    routeId,
    assistantKey: "ask-admin-opzava",
    conversationId: "conversation-1",
    turnId: "turn-1",
    prompt: "Create a task",
    idempotencyKey,
    principal: {
      tenantId,
    },
  };
}

async function listen(server: ReturnType<typeof createBrokerInternalHttpServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected HTTP server to listen on TCP.");
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function closeServer(
  server: ReturnType<typeof createBrokerInternalHttpServer>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function readSseTypes(response: Response): Promise<readonly string[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("event: "))
    .map((line) => line.slice("event: ".length));
}

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    manager.disconnectAll();
  }

  for (const gateway of gateways.splice(0)) {
    await gateway.close();
  }
});

describe("[fake-gateway] broker internal assistant stream HTTP endpoint", () => {
  it("serves a lightweight unauthenticated process health endpoint", async () => {
    const { broker } = await createFixture();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken: randomUUID(),
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/healthz`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    } finally {
      await closeServer(server);
    }
  });

  it("returns authenticated gateway health snapshots", async () => {
    const { broker } = await createFixture();
    const internalToken = randomUUID();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken,
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/gateway/health?routeId=${routeId}`, {
        headers: {
          authorization: `Bearer ${internalToken}`,
        },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        routeId,
        reachable: false,
        circuitOpen: false,
      });
    } finally {
      await closeServer(server);
    }
  });

  it("rejects internal stream requests without the shared token", async () => {
    const { broker } = await createFixture();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken: randomUUID(),
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      });

      expect(response.status).toBe(401);
    } finally {
      await closeServer(server);
    }
  });

  it("does not grant a route handle for an asserted principal from another tenant", async () => {
    const { broker, gateway } = await createFixture();
    const internalToken = randomUUID();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken,
    });
    const baseUrl = await listen(server);
    const body = requestBody();

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${internalToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          principal: { ...body.principal, tenantId: makeTenantId("tenant-other") },
        }),
      });
      const responseBody = await response.text();

      expect(response.status).toBe(200);
      expect(responseBody).toContain("gatewayBroker.tenantMismatch");
      expect(gateway.connectionCount).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  it("ignores legacy identity keys in the principal block and streams on tenantId alone", async () => {
    // Deploy-order / backward-compat guard: an older web build still sends
    // sessionId/orgId/workspaceId/userId/roleKeys. The narrowed parser must
    // accept the request on tenantId alone and silently ignore the extras — it
    // must never consume or forward them (ADR-018 Option 0).
    const { broker } = await createFixture();
    const internalToken = randomUUID();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken,
    });
    const baseUrl = await listen(server);

    const legacyBody = {
      ...requestBody("legacy-extra-keys-idempotency"),
      principal: {
        tenantId,
        sessionId: "legacy-session",
        orgId: "attacker-org",
        workspaceId: "attacker-workspace",
        userId: "attacker-user",
        roleKeys: ["superadmin"],
      },
    };

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${internalToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(legacyBody),
      });

      expect(response.status).toBe(200);
      await expect(readSseTypes(response)).resolves.toContain("assistant.final");
    } finally {
      await closeServer(server);
    }
  });

  it("streams normalized events through the authenticated internal endpoint", async () => {
    const { broker } = await createFixture();
    const internalToken = randomUUID();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken,
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${internalToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody("internal-http-idempotency")),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      await expect(readSseTypes(response)).resolves.toEqual([
        "queued",
        "delta",
        "delta",
        "assistant.final",
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it("streams scripted task tool-call intents through the authenticated internal endpoint", async () => {
    const { broker } = await createFixture("scripted-task-tool-call");
    const internalToken = randomUUID();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken,
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${internalToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody("internal-http-scripted-tool-call")),
      });

      expect(response.status).toBe(200);
      await expect(readSseTypes(response)).resolves.toEqual([
        "queued",
        "delta",
        "tool.call",
        "delta",
        "assistant.final",
      ]);
    } finally {
      await closeServer(server);
    }
  });
});
