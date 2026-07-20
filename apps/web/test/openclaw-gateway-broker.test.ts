import type { OpenClawGatewayRouteId } from "@opzava/ports";
import { makeTenantId } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { createBrokerOpenClawGatewayPort } from "../lib/openclaw-gateway-broker";

const events = [
  {
    eventType: "agent_run",
    eventId: "1",
    sequence: 4,
    sourceSequence: 1,
    occurredAt: 1784505600000,
    action: "agent.run.finished",
    status: "succeeded",
    agentId: "main",
    runId: "run-1",
  },
  {
    eventType: "tool_action",
    eventId: "2",
    sequence: 3,
    sourceSequence: 1,
    occurredAt: 1784505600000,
    action: "tool.action.finished",
    status: "succeeded",
    agentId: "main",
    runId: "run-1",
    toolName: "tool",
  },
  {
    eventType: "inbound_message",
    eventId: "3",
    sequence: 2,
    sourceSequence: 1,
    occurredAt: 1784505600000,
    action: "message.inbound.processed",
    status: "succeeded",
    channel: "telegram",
    conversationKind: "direct",
    outcome: "completed",
  },
  {
    eventType: "outbound_message",
    eventId: "4",
    sequence: 1,
    sourceSequence: 1,
    occurredAt: 1784505600000,
    action: "message.outbound.finished",
    status: "succeeded",
    channel: "telegram",
    conversationKind: "direct",
    outcome: "sent",
    deliveryKind: "text",
  },
];

describe("broker OpenClaw audit adapter", () => {
  it("posts the server binding and independently parses four variants", async () => {
    let request: Request | undefined;
    const port = createBrokerOpenClawGatewayPort({
      baseUrl: "http://broker.internal",
      internalToken: "token",
      fetchImpl: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ events });
      },
    });
    const route = await port.forPrincipal({
      routeId: "platform-openclaw" as OpenClawGatewayRouteId,
      actingPrincipal: { tenantId: makeTenantId("org-1") },
    });
    if (!route.ok) throw route.error;
    const page = await route.value.auditActivityList({ limit: 4 });
    expect(page.ok).toBe(true);
    expect(request?.method).toBe("POST");
    expect(await request?.json()).toEqual({
      routeId: "platform-openclaw",
      principal: { tenantId: "org-1" },
      filters: { limit: 4 },
    });
    if (!page.ok) throw page.error;
    expect(page.value.events.map((event) => event.eventType)).toEqual([
      "agent_run",
      "tool_action",
      "inbound_message",
      "outbound_message",
    ]);
  });

  it("maps unsupported and rejects malformed or over-64-KiB responses", async () => {
    for (const response of [
      new Response("{}", { status: 501 }),
      Response.json({ events: [{ ...events[0], sessionKey: "leak" }] }),
      Response.json({ events, padding: "x".repeat(70_000) }),
    ]) {
      const port = createBrokerOpenClawGatewayPort({
        baseUrl: "http://broker.internal",
        internalToken: "token",
        fetchImpl: async () => response,
      });
      const route = await port.forPrincipal({
        routeId: "platform-openclaw" as OpenClawGatewayRouteId,
        actingPrincipal: { tenantId: makeTenantId("org-1") },
      });
      if (!route.ok) throw route.error;
      const result = await route.value.auditActivityList({ limit: 4 });
      expect(result.ok).toBe(false);
    }
  });

  it("maps internal status classes and accepts lawful empty", async () => {
    for (const [status, code] of [
      [401, "webGateway.internalUnauthorized"],
      [403, "webGateway.tenantMismatch"],
      [501, "webGateway.auditUnsupported"],
      [502, "webGateway.requestFailed"],
      [503, "webGateway.gatewayUnavailable"],
    ] as const) {
      const port = createBrokerOpenClawGatewayPort({
        baseUrl: "http://broker.internal",
        internalToken: "token",
        fetchImpl: async () => new Response("{}", { status }),
      });
      const route = await port.forPrincipal({
        routeId: "platform-openclaw" as OpenClawGatewayRouteId,
        actingPrincipal: { tenantId: makeTenantId("org-1") },
      });
      if (!route.ok) throw route.error;
      expect(await route.value.auditActivityList({})).toMatchObject({
        ok: false,
        error: { code },
      });
    }

    const port = createBrokerOpenClawGatewayPort({
      baseUrl: "http://broker.internal",
      internalToken: "token",
      fetchImpl: async () => Response.json({ events: [] }),
    });
    const route = await port.forPrincipal({
      routeId: "platform-openclaw" as OpenClawGatewayRouteId,
      actingPrincipal: { tenantId: makeTenantId("org-1") },
    });
    if (!route.ok) throw route.error;
    await expect(route.value.auditActivityList({})).resolves.toEqual({
      ok: true,
      value: { events: [] },
    });
  });
});
