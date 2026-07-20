import type {
  ExpectedToolInventory,
  OpenClawAuditActivityFilters,
  OpenClawGatewayRouteId,
  OpenClawStreamEvent,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot,
} from "@opzava/ports";
import { makeTenantId, type Result } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { FakeOpenClawGateway, type FakeGatewayMode } from "../acl/openclaw/fake-gateway.js";
import type { BrokerLogger } from "../acl/openclaw/logger.js";
import { OpenClawOperatorClient } from "../acl/openclaw/operator-client.js";
import {
  EXPECTED_OPERATOR_SCOPES,
  parseOpenClawFrame,
  serializeOpenClawFrame,
  type OpenClawRequestFrame,
  type OpenClawResponseFrame,
} from "../acl/openclaw/protocol.js";
import {
  HmacDeviceKeypair,
  deriveDeviceIdFromPublicKey,
  type DeviceKeypair,
} from "../acl/openclaw/signing.js";
import { GatewayConnectionManager } from "../routing/connection-manager.js";
import type { GatewayAuthMode } from "../routing/routes.js";
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

interface BrokerFixture {
  readonly gateway: FakeOpenClawGateway;
  readonly broker: GatewayConnectionManager;
}

interface RecordingLogger {
  readonly logger: BrokerLogger;
  readonly warnings: Array<{
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly message: string;
  }>;
}

function createRecordingLogger(): RecordingLogger {
  const warnings: RecordingLogger["warnings"] = [];
  return {
    warnings,
    logger: {
      warn(metadata, message) {
        warnings.push({ metadata, message });
      },
      error() {},
    },
  };
}

function createRouteOnlyOperatorClient(logger: BrokerLogger): OpenClawOperatorClient {
  return new OpenClawOperatorClient({
    route: {
      routeId,
      tenantId,
      url: "ws://127.0.0.1:1",
      authMode: "shared-secret",
      pairedDeviceToken,
      deviceKeypair: createDeviceKeypair(),
      clientVersion: "0.0.0",
    },
    logger,
  });
}

function createDeviceKeypair(): HmacDeviceKeypair {
  const publicKey = fakeRawPublicKey.toString("base64url");

  return new HmacDeviceKeypair({
    deviceId: deriveDeviceIdFromPublicKey(publicKey),
    publicKey,
    secret: randomUUID(),
  });
}

function createMismatchedDeviceKeypair(): HmacDeviceKeypair {
  return new HmacDeviceKeypair({
    deviceId: "not-the-sha256-raw-public-key",
    publicKey: fakeRawPublicKey.toString("base64url"),
    secret: randomUUID(),
  });
}

async function createBrokerFixture(
  input: {
    readonly mode?: FakeGatewayMode;
    readonly authMode?: GatewayAuthMode;
    readonly deviceKeypair?: HmacDeviceKeypair;
    readonly idleDisconnectMs?: number;
  } = {},
): Promise<BrokerFixture> {
  const deviceKeypair = input.deviceKeypair ?? createDeviceKeypair();
  const gateway = new FakeOpenClawGateway({
    deviceKeypair,
    pairedDeviceToken,
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
  });
  await gateway.ready;
  gateways.push(gateway);

  const broker = new GatewayConnectionManager({
    idleDisconnectMs: input.idleDisconnectMs ?? 10_000,
    maxFailuresBeforeOpen: 2,
    routingTable: new StaticGatewayRoutingTable([
      {
        routeId,
        tenantId,
        url: gateway.url,
        authMode: input.authMode ?? "paired-device",
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    },
  };
}

async function startAssistantStream(
  broker: GatewayConnectionManager,
  input: StartAssistantStreamInput,
): Promise<Result<StartAssistantStreamReceipt>> {
  const route = await broker.forPrincipal({
    routeId: input.routeId,
    actingPrincipal: input.actingPrincipal,
  });
  if (!route.ok) {
    return route;
  }

  const { routeId: _routeId, actingPrincipal: _actingPrincipal, ...routeInput } = input;
  void _routeId;
  void _actingPrincipal;
  return route.value.startAssistantStream(routeInput);
}

async function getEffectiveTools(
  broker: GatewayConnectionManager,
  input: ExpectedToolInventory,
): Promise<Result<ToolInventorySnapshot>> {
  const route = await broker.forPrincipal({
    routeId: input.routeId,
    actingPrincipal: startInput().actingPrincipal,
  });
  if (!route.ok) {
    return route;
  }

  const { routeId: _routeId, ...routeInput } = input;
  void _routeId;
  return route.value.getEffectiveTools(routeInput);
}

async function getAuditActivity(
  broker: GatewayConnectionManager,
  filters: OpenClawAuditActivityFilters = {},
) {
  const route = await broker.forPrincipal({ routeId, actingPrincipal: { tenantId } });
  if (!route.ok) return route;
  return route.value.auditActivityList(filters);
}

async function collectUntilTerminal(
  events: AsyncIterable<OpenClawStreamEvent>,
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
    }),
  ]);

  return collected;
}

async function waitForReachable(
  client: OpenClawOperatorClient,
  expected: boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (client.health().reachable === expected) {
      return true;
    }
    await sleep(5);
  }

  return client.health().reachable === expected;
}

async function rawConnect(input: {
  readonly gateway: FakeOpenClawGateway;
  readonly deviceKeypair: DeviceKeypair;
  readonly clientId: string;
  readonly clientMode: string;
  readonly auth?: {
    readonly token?: string;
    readonly deviceToken?: string;
    readonly bootstrapToken?: string;
  };
  readonly afterConnectRequest?: OpenClawRequestFrame;
  readonly afterConnectRequests?: readonly OpenClawRequestFrame[];
}): Promise<OpenClawResponseFrame> {
  const socket = new WebSocket(input.gateway.url, { perMessageDeflate: false });

  return await new Promise<OpenClawResponseFrame>((resolve, reject) => {
    let connected = false;
    const queuedRequests = [
      ...(input.afterConnectRequest === undefined ? [] : [input.afterConnectRequest]),
      ...(input.afterConnectRequests ?? []),
    ];
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for raw connect response."));
    }, 1_000);

    socket.on("message", (data) => {
      const frame = parseOpenClawFrame(data.toString());
      if (frame?.type === "event" && frame.event === "connect.challenge") {
        const payload = frame.payload as { readonly nonce?: unknown };
        if (typeof payload.nonce !== "string") {
          clearTimeout(timeout);
          socket.close();
          reject(new Error("Expected connect.challenge nonce."));
          return;
        }

        const signedAt = Date.now();
        const auth = input.auth ?? { deviceToken: pairedDeviceToken };
        const signatureToken = auth.token ?? auth.deviceToken ?? auth.bootstrapToken ?? "";
        void input.deviceKeypair
          .sign({
            clientId: input.clientId,
            clientMode: input.clientMode,
            clientVersion: "0.0.0",
            platform: "node",
            deviceFamily: "server",
            deviceId: input.deviceKeypair.deviceId,
            publicKey: input.deviceKeypair.publicKey,
            role: "operator",
            scopes: EXPECTED_OPERATOR_SCOPES,
            token: signatureToken,
            nonce: payload.nonce,
            signedAt,
          })
          .then((signature) => {
            socket.send(
              serializeOpenClawFrame({
                type: "req",
                id: "connect:raw-test",
                method: "connect",
                params: {
                  minProtocol: 4,
                  maxProtocol: 4,
                  client: {
                    id: input.clientId,
                    version: "0.0.0",
                    platform: "node",
                    mode: input.clientMode,
                  },
                  role: "operator",
                  scopes: EXPECTED_OPERATOR_SCOPES,
                  caps: [],
                  commands: [],
                  permissions: {},
                  auth,
                  locale: "en-US",
                  userAgent: "opzava-gateway-broker/0.0.0",
                  device: {
                    id: input.deviceKeypair.deviceId,
                    publicKey: input.deviceKeypair.publicKey,
                    signature,
                    signedAt,
                    nonce: payload.nonce,
                  },
                },
              }),
            );
          })
          .catch((error: unknown) => {
            clearTimeout(timeout);
            socket.close();
            reject(error);
          });
        return;
      }

      if (frame?.type === "res") {
        if (
          !connected &&
          frame.id === "connect:raw-test" &&
          frame.ok &&
          queuedRequests.length > 0
        ) {
          connected = true;
          socket.send(serializeOpenClawFrame(queuedRequests.shift() as OpenClawRequestFrame));
          return;
        }

        if (connected && frame.ok && queuedRequests.length > 0) {
          socket.send(serializeOpenClawFrame(queuedRequests.shift() as OpenClawRequestFrame));
          return;
        }

        clearTimeout(timeout);
        socket.close();
        resolve(frame);
        return;
      }

      clearTimeout(timeout);
      socket.close();
      reject(new Error("Expected response frame."));
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    manager.disconnectAll();
  }

  for (const gateway of gateways.splice(0)) {
    await gateway.close();
  }
});

describe("[fake-gateway] audit.activity.list ACL", () => {
  it("maps exact read params and projects all four safe variants", async () => {
    const { broker, gateway } = await createBrokerFixture();
    const result = await getAuditActivity(broker, {
      agent: "main",
      session: "agent:main:main",
      run: "run-1",
      kind: "agent_run",
      status: "succeeded",
      after: 1,
      before: 2,
      limit: 4,
      cursor: "cursor-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(gateway.lastAuditActivityParams).toEqual({
      agentId: "main",
      sessionKey: "agent:main:main",
      runId: "run-1",
      kind: "agent_run",
      status: "succeeded",
      after: 1,
      before: 2,
      limit: 4,
      cursor: "cursor-1",
    });
    expect(result.value.events.map((event) => event.eventType)).toEqual([
      "agent_run",
      "tool_action",
      "inbound_message",
      "outbound_message",
    ]);
    expect(JSON.stringify(result.value)).not.toMatch(
      /sessionKey|sessionId|toolCallId|actor|Ref|redaction|schemaVersion|direction|"kind"/,
    );
  });

  it("fails typed without attempting the legacy RPC when the method is unadvertised", async () => {
    const { broker, gateway } = await createBrokerFixture({ mode: "audit-unadvertised" });
    const result = await getAuditActivity(broker);
    expect(result).toMatchObject({ ok: false, error: { code: "gatewayBroker.auditUnsupported" } });
    expect(gateway.lastAuditActivityParams).toBeUndefined();
    const repeated = await getAuditActivity(broker);
    expect(repeated).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.auditUnsupported" },
    });
  });

  it("returns lawful empty and cursor-paginated pages without synthesis", async () => {
    const empty = await createBrokerFixture({ mode: "audit-empty" });
    await expect(getAuditActivity(empty.broker)).resolves.toEqual({
      ok: true,
      value: { events: [] },
    });
    const paginated = await createBrokerFixture();
    const page = await getAuditActivity(paginated.broker, { limit: 1 });
    expect(page).toMatchObject({
      ok: true,
      value: { events: [{ eventId: "evt-run" }], nextCursor: "cursor:next" },
    });
  });

  it("sanitizes an upstream error before returning it", async () => {
    const { broker } = await createBrokerFixture({ mode: "audit-error-leak" });
    const result = await getAuditActivity(broker);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.requestFailed", message: "OpenClaw Gateway request failed." },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|sessionKey|actor|toolCallId|accountRef|conversationRef|messageRef|targetRef|https:\/\//,
    );
  });

  it("rejects a whole malformed or oversized page", async () => {
    for (const mode of ["audit-malformed", "audit-invalid-terminal", "audit-oversized"] as const) {
      const { broker } = await createBrokerFixture({ mode });
      const result = await getAuditActivity(broker, { limit: 500 });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "gatewayBroker.invalidAuditPayload" },
      });
    }
  });
});

describe("[fake-gateway] broker operator client", () => {
  it("rejects unknown client presentation enum values like the live Gateway", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
    });
    await gateway.ready;
    gateways.push(gateway);

    await expect(
      rawConnect({
        gateway,
        deviceKeypair,
        clientId: "opzava-gateway-broker",
        clientMode: "operator",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        details: { reason: "invalid-client-presentation" },
      },
    });
  });

  it("issues then accepts a fresh paired device token from shared gateway-token auth", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
      sharedGatewayToken: "shared-gateway-token",
    });
    await gateway.ready;
    gateways.push(gateway);

    const issuance = await rawConnect({
      gateway,
      deviceKeypair,
      clientId: "cli",
      clientMode: "cli",
      auth: { token: "shared-gateway-token" },
    });

    expect(issuance.ok).toBe(true);
    const issuancePayload = issuance.payload as
      | { readonly auth?: { readonly deviceToken?: string; readonly issuedAtMs?: number } }
      | undefined;
    expect(issuancePayload?.auth?.deviceToken).toMatch(/^issued-device-token-/);
    expect(issuancePayload?.auth?.issuedAtMs).toEqual(expect.any(Number));

    const validation = await rawConnect({
      gateway,
      deviceKeypair,
      clientId: "cli",
      clientMode: "cli",
      auth: { deviceToken: issuancePayload?.auth?.deviceToken ?? "" },
    });

    expect(validation.ok).toBe(true);
  });

  it("rejects stale paired device tokens like the live Gateway", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
    });
    await gateway.ready;
    gateways.push(gateway);

    await expect(
      rawConnect({
        gateway,
        deviceKeypair,
        clientId: "cli",
        clientMode: "cli",
        auth: { deviceToken: "stale-device-token" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "AUTH_DEVICE_TOKEN_MISMATCH",
        message: "device token mismatch (rotate/reissue)",
      },
    });
  });

  it("rejects mismatched shared gateway tokens like the live Gateway", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
      sharedGatewayToken: "shared-gateway-token",
    });
    await gateway.ready;
    gateways.push(gateway);

    await expect(
      rawConnect({
        gateway,
        deviceKeypair,
        clientId: "cli",
        clientMode: "cli",
        auth: { token: "wrong-gateway-token" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "AUTH_TOKEN_MISMATCH",
        message: "gateway token mismatch",
      },
    });
  });

  it("rejects the stale sessions.send wire shape with unexpected properties", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
    });
    await gateway.ready;
    gateways.push(gateway);

    await expect(
      rawConnect({
        gateway,
        deviceKeypair,
        clientId: "cli",
        clientMode: "cli",
        afterConnectRequest: {
          type: "req",
          id: "sessions.send:bad-shape",
          method: "sessions.send",
          params: {
            sessionKey: "conversation-1",
            conversationId: "conversation-1",
            agentId: "ask-admin-opzava",
            message: "Create a task",
            idempotencyKey: "bad-shape-idempotency",
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: 'unexpected property "sessionKey"',
      },
    });
  });

  it("rejects sessions.send when the session was not created first", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
    });
    await gateway.ready;
    gateways.push(gateway);

    await expect(
      rawConnect({
        gateway,
        deviceKeypair,
        clientId: "cli",
        clientMode: "cli",
        afterConnectRequest: {
          type: "req",
          id: "sessions.send:missing-session",
          method: "sessions.send",
          params: {
            key: "agent:ask-admin-opzava:conversation-1",
            agentId: "ask-admin-opzava",
            message: "Create a task",
            idempotencyKey: "missing-session-idempotency",
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "session not found: agent:ask-admin-opzava:conversation-1",
      },
    });
  });

  it("tolerates duplicate sessions.create requests for the same key in the fake lane", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
    });
    await gateway.ready;
    gateways.push(gateway);

    await expect(
      rawConnect({
        gateway,
        deviceKeypair,
        clientId: "cli",
        clientMode: "cli",
        afterConnectRequests: [
          {
            type: "req",
            id: "sessions.create:first",
            method: "sessions.create",
            params: { key: "agent:ask-admin-opzava:conversation-1", agentId: "ask-admin-opzava" },
          },
          {
            type: "req",
            id: "sessions.create:second",
            method: "sessions.create",
            params: { key: "agent:ask-admin-opzava:conversation-1", agentId: "ask-admin-opzava" },
          },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      payload: {
        key: "agent:ask-admin-opzava:conversation-1",
        alreadyExisted: true,
      },
    });
    expect(gateway.sessionCreateCount).toBe(2);
  });

  it("negotiates protocol v4 and streams one idempotent session request", async () => {
    const { broker, gateway } = await createBrokerFixture();
    const first = await startAssistantStream(broker, startInput("same-idempotency-key"));
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
        sessionRef: {
          system: "openclaw",
          kind: "session",
          value: "agent:ask-admin-opzava:conversation-1",
        },
        runRef: { system: "openclaw", kind: "run", value: "run:same-idempotency-key" },
      },
    ]);
    expect(gateway.lastSessionSendParams).toEqual({
      key: "agent:ask-admin-opzava:conversation-1",
      agentId: "ask-admin-opzava",
      message: "Create a task",
      idempotencyKey: "same-idempotency-key",
    });
    expect(gateway.sessionCreateCount).toBe(1);

    const tools = await getEffectiveTools(broker, {
      routeId,
      sessionRef: first.value.sessionRef,
      toolNames: [
        "opzava_tasks_list",
        "opzava_tasks_create",
        "opzava_tasks_update",
      ],
    });
    expect(tools).toMatchObject({
      ok: true,
      value: {
        toolNames: [
          "opzava_tasks_list",
          "opzava_tasks_create",
          "opzava_tasks_update",
        ],
      },
    });

    const replay = await startAssistantStream(broker, startInput("same-idempotency-key"));
    expect(replay).toMatchObject({
      ok: true,
      value: {
        runRef: { value: "run:same-idempotency-key" },
      },
    });
    expect(gateway.sessionRequestCount).toBe(2);
    expect(gateway.sessionCreateCount).toBe(1);

    const driftedTools = await getEffectiveTools(broker, {
      routeId,
      sessionRef: first.value.sessionRef,
      toolNames: ["opzava_tasks_list"],
    });
    expect(driftedTools).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.toolInventoryMismatch" },
    });
  });

  it("rejects a concurrent active turn for the same session while the first completes", async () => {
    const { broker, gateway } = await createBrokerFixture({ mode: "deferred-final" });
    const first = await startAssistantStream(broker, startInput("first-active-turn"));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }

    const second = await startAssistantStream(broker, {
      ...startInput("second-active-turn"),
      turnId: "turn-2",
    });
    expect(second).toMatchObject({
      ok: false,
      error: {
        code: "gatewayBroker.sessionBusy",
        details: { sessionKey: "agent:ask-admin-opzava:conversation-1" },
      },
    });
    expect(gateway.sessionCreateCount).toBe(1);
    expect(gateway.sessionRequestCount).toBe(1);

    gateway.finishDeferredStreams();
    const events = await collectUntilTerminal(first.value.events);
    expect(events.at(-1)).toEqual({
      type: "final",
      turnId: "turn-1",
      content: { text: "Created the task." },
      sessionRef: {
        system: "openclaw",
        kind: "session",
        value: "agent:ask-admin-opzava:conversation-1",
      },
      runRef: { system: "openclaw", kind: "run", value: "run:first-active-turn" },
    });
  });

  it("ignores chat events whose runId does not match the active session run", async () => {
    const { broker } = await createBrokerFixture({ mode: "mismatched-run-event" });
    const result = await startAssistantStream(broker, startInput("run-id-correlation"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events).toEqual([
      { type: "queued", turnId: "turn-1" },
      { type: "delta", turnId: "turn-1", deltaText: "Created " },
      { type: "delta", turnId: "turn-1", deltaText: "the task." },
      {
        type: "final",
        turnId: "turn-1",
        content: { text: "Created the task." },
        sessionRef: {
          system: "openclaw",
          kind: "session",
          value: "agent:ask-admin-opzava:conversation-1",
        },
        runRef: { system: "openclaw", kind: "run", value: "run:run-id-correlation" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("Wrong run text");
  });

  it("does not idle-disconnect an active stream and idles out after it finishes", async () => {
    const { broker, gateway } = await createBrokerFixture({
      mode: "deferred-final",
      idleDisconnectMs: 20,
    });
    const result = await startAssistantStream(broker, startInput("slow-active-turn"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    await sleep(60);
    const activeHealth = await broker.getHealthForOps(routeId);
    expect(activeHealth).toMatchObject({
      ok: true,
      value: { reachable: true },
    });
    expect(gateway.connectionCount).toBe(1);

    gateway.finishDeferredStreams();
    const events = await collectUntilTerminal(result.value.events);
    expect(events.at(-1)).toMatchObject({ type: "final" });

    await sleep(60);
    const idleHealth = await broker.getHealthForOps(routeId);
    expect(idleHealth).toMatchObject({
      ok: true,
      value: { reachable: false },
    });
  });

  it("streams scripted task tool-call intents without exposing OpenClaw frames", async () => {
    const { broker } = await createBrokerFixture({ mode: "scripted-task-tool-call" });
    const result = await startAssistantStream(broker, startInput());
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
        labels: ["ask-admin"],
      },
    });
  });

  it("retries startup-sidecars UNAVAILABLE within the connection budget", async () => {
    const { broker, gateway } = await createBrokerFixture({ mode: "startup-sidecars-once" });
    const result = await startAssistantStream(broker, startInput());

    expect(result.ok).toBe(true);
    expect(gateway.connectionCount).toBeGreaterThanOrEqual(2);
  });

  it("creates once again and retries sessions.send once when the session was pruned", async () => {
    const { broker, gateway } = await createBrokerFixture({
      mode: "session-pruned-once-before-send",
    });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events.at(-1)).toMatchObject({ type: "final" });
    expect(gateway.sessionCreateCount).toBe(2);
    expect(gateway.sessionRequestCount).toBe(2);
  });

  it("does not loop forever when sessions.send keeps reporting session not found", async () => {
    const { broker, gateway } = await createBrokerFixture({
      mode: "session-pruned-always-before-send",
    });
    const result = await startAssistantStream(broker, startInput());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "gatewayBroker.requestFailed",
        details: { message: "session not found" },
      },
    });
    expect(gateway.sessionCreateCount).toBe(2);
    expect(gateway.sessionRequestCount).toBe(2);
  });

  it("maps live chat aborted state to a failed stream event", async () => {
    const { broker } = await createBrokerFixture({ mode: "chat-aborted" });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events).toContainEqual({ type: "delta", turnId: "turn-1", deltaText: "Created " });
    expect(events.at(-1)).toEqual({
      type: "failed",
      turnId: "turn-1",
      code: "aborted",
      message: "OpenClaw run was aborted.",
    });
  });

  it("maps live chat error state to a sanitized failed stream event", async () => {
    const { broker } = await createBrokerFixture({ mode: "chat-error" });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events).toContainEqual({ type: "delta", turnId: "turn-1", deltaText: "Created " });
    expect(events.at(-1)).toEqual({
      type: "failed",
      turnId: "turn-1",
      code: "rate_limit",
      message: "Provider rate limit.",
    });
  });

  it("strips upstream topology detail from a leaky upstream chat error (#252)", async () => {
    const { broker } = await createBrokerFixture({ mode: "chat-error-leak" });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("failed");

    const message = (terminal as { readonly message: string }).message;
    // Semantic, operator-actionable text (the credential was rejected) survives.
    expect(message).toContain("unexpected status 401");
    expect(message).toContain("Missing bearer or basic authentication in header");
    // None of the topology/vendor detail the owner saw live reaches the BFF.
    expect(message).not.toContain("https://");
    expect(message).not.toContain("api.openai.com");
    expect(message).not.toContain("cf-ray");
    expect(message).not.toContain("a1b22d857c3484a5");
    expect(message).not.toContain("request id");
    expect(message).not.toContain("req_73d0");
  });

  it("rejects shared-secret hot-path configuration before connecting", async () => {
    const { broker, gateway } = await createBrokerFixture({ authMode: "shared-secret" });
    const result = await startAssistantStream(broker, startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.authModeForbidden" },
    });
    expect(gateway.connectionCount).toBe(0);
  });

  it("rejects caller tenant drift at the operator-client boundary", async () => {
    const { logger, warnings } = createRecordingLogger();
    const client = createRouteOnlyOperatorClient(logger);
    const input = startInput();
    const result = await client.startAssistantStream({
      ...input,
      actingPrincipal: {
        ...input.actingPrincipal,
        tenantId: makeTenantId("tenant-other"),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected tenant mismatch.");
    }
    expect(result.error.code).toBe("gatewayBroker.tenantMismatch");
    expect(result.error.message).toBe(
      "Gateway route tenant does not match the authenticated principal.",
    );
    expect(result.error.details).toBeUndefined();
    expect(warnings).toEqual([
      {
        metadata: {
          routeId,
          routeTenantId: tenantId,
          principalTenantId: makeTenantId("tenant-other"),
        },
        message: "Gateway route tenant does not match the acting principal.",
      },
    ]);
  });

  it("does not warn when the tenant matches at the operator-client boundary", async () => {
    const { logger, warnings } = createRecordingLogger();
    const client = createRouteOnlyOperatorClient(logger);

    const result = await client.startAssistantStream(startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.authModeForbidden" },
    });
    expect(warnings).toEqual([]);
  });

  it("maps AUTH_SCOPE_MISMATCH without treating it as a bad-token retry", async () => {
    const { broker } = await createBrokerFixture({ mode: "auth-scope-mismatch" });
    const result = await startAssistantStream(broker, startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.authScopeMismatch" },
    });
  });

  it("rejects a device id that is not derived from the raw Ed25519 public key", async () => {
    const { broker } = await createBrokerFixture({
      deviceKeypair: createMismatchedDeviceKeypair(),
    });
    const result = await startAssistantStream(broker, startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.authScopeMismatch" },
    });
  });

  it("fails closed when hello-ok scopes are inflated", async () => {
    const { broker } = await createBrokerFixture({ mode: "scope-inflated" });
    const result = await startAssistantStream(broker, startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.scopeMismatch" },
    });
  });

  it("fails closed on protocol range mismatch", async () => {
    const { broker } = await createBrokerFixture({ mode: "protocol-mismatch" });
    const result = await startAssistantStream(broker, startInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "gatewayBroker.protocolMismatch" },
    });
  });

  it("ignores unknown event families without projecting them and finishes the run", async () => {
    const { broker } = await createBrokerFixture({ mode: "unknown-event-family" });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events.some((event) => "deltaText" in event)).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "final" });
    expect(JSON.stringify(events)).not.toContain("runtime.secret");
  });

  it("fails the stream when the socket dies mid-stream", async () => {
    const { broker } = await createBrokerFixture({ mode: "mid-stream-close" });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events).toContainEqual({ type: "delta", turnId: "turn-1", deltaText: "Created " });
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.connectionClosed",
    });
  });

  it("reconnects and re-acquires the snapshot after a transient socket death (#165 home)", async () => {
    const deviceKeypair = createDeviceKeypair();
    const gateway = new FakeOpenClawGateway({
      deviceKeypair,
      pairedDeviceToken,
      mode: "mid-stream-close",
    });
    await gateway.ready;
    gateways.push(gateway);

    const client = new OpenClawOperatorClient({
      route: {
        routeId,
        tenantId,
        url: gateway.url,
        authMode: "paired-device",
        pairedDeviceToken,
        deviceKeypair,
        clientVersion: "0.0.0",
      },
      challengeTimeoutMs: 500,
      connectBudgetMs: 1_000,
      requestTimeoutMs: 500,
    });

    try {
      const connected = await client.ensureConnected();
      expect(connected.ok).toBe(true);
      // The hello-ok snapshot the Gateway sends is now captured (re-snapshot
      // artifact) instead of parsed and discarded.
      expect(client.snapshot).toBeDefined();
      expect(client.snapshotAcquiredAt).toBeDefined();

      const result = await client.startAssistantStream(startInput());
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw result.error;
      }

      // The mid-stream socket death fails the in-flight run (no resume RPC)...
      const events = await collectUntilTerminal(result.value.events);
      expect(events.at(-1)).toMatchObject({
        type: "failed",
        code: "gatewayBroker.connectionClosed",
      });

      // ...but the broker reconnects the operator connection on its own and
      // re-acquires the snapshot. Reconnect = re-snapshot now has a home.
      await expect(waitForReachable(client, true, 1_000)).resolves.toBe(true);
      expect(client.health().reachable).toBe(true);
      expect(client.snapshot).toBeDefined();
    } finally {
      client.disconnect();
    }
  });

  it("fails safe on duplicate response ids", async () => {
    const { broker } = await createBrokerFixture({ mode: "duplicate-response" });
    const result = await startAssistantStream(broker, startInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = await collectUntilTerminal(result.value.events);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.duplicateResponse",
    });
  });
});
