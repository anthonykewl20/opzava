import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import type { OpenClawGatewayRouteId } from "@opzava/ports";
import { makeOrgId, makeTenantId, makeUserId, makeWorkspaceId } from "@opzava/shared-kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  FakeOpenClawGateway,
  type FakeGatewayMode
} from "../acl/openclaw/fake-gateway.js";
import { HmacDeviceKeypair } from "../acl/openclaw/signing.js";
import { createBrokerInternalHttpServer } from "../internal/http-server.js";
import { GatewayConnectionManager } from "../routing/connection-manager.js";
import { StaticGatewayRoutingTable } from "../routing/routes.js";

const routeId = "platform-openclaw" as OpenClawGatewayRouteId;
const tenantId = makeTenantId("tenant-platform");
const orgId = makeOrgId("org-platform");
const workspaceId = makeWorkspaceId("workspace-admin");
const userId = makeUserId("user-admin");
const pairedDeviceToken = "paired-device-token";

const managers: GatewayConnectionManager[] = [];
const gateways: FakeOpenClawGateway[] = [];

interface InternalHttpFixture {
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

async function createFixture(mode?: FakeGatewayMode): Promise<InternalHttpFixture> {
  const deviceKeypair = createDeviceKeypair();
  const gateway = new FakeOpenClawGateway({
    deviceKeypair,
    pairedDeviceToken,
    ...(mode === undefined ? {} : { mode })
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

function requestBody(idempotencyKey = `idem-${randomUUID()}`) {
  return {
    routeId,
    assistantKey: "ask-admin-opzava",
    conversationId: "conversation-1",
    turnId: "turn-1",
    prompt: "Create a task",
    idempotencyKey,
    principal: {
      sessionId: "session-1",
      tenantId,
      orgId,
      workspaceId,
      userId,
      roleKeys: ["admin"]
    }
  };
}

async function listen(
  server: ReturnType<typeof createBrokerInternalHttpServer>
): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected HTTP server to listen on TCP.");
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function closeServer(
  server: ReturnType<typeof createBrokerInternalHttpServer>
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
  it("rejects internal stream requests without the shared token", async () => {
    const { broker } = await createFixture();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken: randomUUID()
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody())
      });

      expect(response.status).toBe(401);
    } finally {
      await closeServer(server);
    }
  });

  it("streams normalized events through the authenticated internal endpoint", async () => {
    const { broker } = await createFixture();
    const internalToken = randomUUID();
    const server = createBrokerInternalHttpServer({
      gatewayPort: broker,
      internalToken
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${internalToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(requestBody("internal-http-idempotency"))
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      await expect(readSseTypes(response)).resolves.toEqual([
        "queued",
        "delta",
        "delta",
        "assistant.final"
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
      internalToken
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/internal/assistant/stream`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${internalToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(requestBody("internal-http-scripted-tool-call"))
      });

      expect(response.status).toBe(200);
      await expect(readSseTypes(response)).resolves.toEqual([
        "queued",
        "delta",
        "tool.call",
        "delta",
        "assistant.final"
      ]);
    } finally {
      await closeServer(server);
    }
  });
});
