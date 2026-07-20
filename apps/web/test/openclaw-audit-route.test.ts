import type { OpenClawAuditActivityFilters, OpenClawGatewayPort } from "@opzava/ports";
import { DomainError, ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { createOpenClawAuditPostHandler } from "../app/api/admin/audit/activity/route";
import type { AppSessionContext } from "../lib/session";

const context: AppSessionContext = {
  sessionId: "s",
  user: { id: "u", email: "a@b.c", name: "Admin" },
  orgId: "org-1",
  organizationName: "Org",
  organizationLifecycleState: "active",
  workspaceId: "w",
  workspaceName: "Admin",
  roleKeys: ["admin"],
};
const page = { events: [], nextCursor: "next" } as const;

function gateway(
  capture?: (binding: unknown, filters: OpenClawAuditActivityFilters) => void,
  error?: DomainError,
): OpenClawGatewayPort {
  return {
    async forPrincipal(binding) {
      return ok({
        async startAssistantStream() {
          throw new Error("not used");
        },
        async getEffectiveTools() {
          throw new Error("not used");
        },
        async auditActivityList(filters) {
          capture?.(binding, filters);
          return error === undefined ? ok(page) : { ok: false, error };
        },
      });
    },
    async getHealthForOps() {
      throw new Error("not used");
    },
  };
}

function request(body: unknown = {}): Request {
  return new Request("http://web.test/api/admin/audit/activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin audit activity route", () => {
  it("returns 401 without a session and hard-403s a member before parsing or adapter creation", async () => {
    let created = 0;
    const absent = createOpenClawAuditPostHandler({
      getSessionContext: async () => null,
      createGatewayPort: () => {
        created++;
        return gateway();
      },
    });
    expect((await absent(request())).status).toBe(401);
    const member = createOpenClawAuditPostHandler({
      getSessionContext: async () => ({ ...context, roleKeys: ["member"] }),
      createGatewayPort: () => {
        created++;
        return gateway();
      },
    });
    expect(
      (await member(new Request("http://web.test", { method: "POST", body: "not json" }))).status,
    ).toBe(403);
    expect(created).toBe(0);
  });

  it("uses session tenant/server route, normalizes timestamps, and passes pagination", async () => {
    let captured: [unknown, OpenClawAuditActivityFilters] | undefined;
    const handler = createOpenClawAuditPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        gateway((binding, filters) => {
          captured = [binding, filters];
        }),
    });
    const response = await handler(
      request({ after: "2026-07-20T00:00:00Z", before: 1784505600000, limit: 1, cursor: "cursor" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(captured?.[0]).toEqual({
      routeId: "platform-openclaw",
      actingPrincipal: { tenantId: "org-1" },
    });
    expect(captured?.[1]).toEqual({
      after: 1784505600000,
      before: 1784505600000,
      limit: 1,
      cursor: "cursor",
    });
    await expect(response.json()).resolves.toEqual(page);
  });

  it("allows Owner and distinguishes lawful empty from Member denial", async () => {
    const owner = createOpenClawAuditPostHandler({
      getSessionContext: async () => ({ ...context, roleKeys: ["owner"] }),
      createGatewayPort: () => gateway(undefined),
    });
    const allowed = await owner(request());
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toEqual(page);

    const member = createOpenClawAuditPostHandler({
      getSessionContext: async () => ({ ...context, roleKeys: ["member"] }),
      createGatewayPort: () => gateway(),
    });
    expect((await member(request())).status).toBe(403);
  });

  it("rejects browser-owned binding and maps 501/502/503 with sanitized bodies", async () => {
    const valid = createOpenClawAuditPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () => gateway(),
    });
    expect(await valid(request({ routeId: "evil" }))).toMatchObject({ status: 400 });
    expect(await valid(request({ tenantId: "evil" }))).toMatchObject({ status: 400 });
    for (const [code, status] of [
      ["webGateway.auditUnsupported", 501],
      ["webGateway.invalidAuditPayload", 502],
      ["webGateway.gatewayUnavailable", 503],
    ] as const) {
      const handler = createOpenClawAuditPostHandler({
        getSessionContext: async () => context,
        createGatewayPort: () =>
          gateway(undefined, new DomainError({ code, message: "sessionKey=private" })),
      });
      const response = await handler(request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("private");
    }
  });

  it("enforces bounded, correlated filter validation before fan-out", async () => {
    let created = 0;
    const handler = createOpenClawAuditPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () => {
        created += 1;
        return gateway();
      },
    });
    for (const body of [
      { agent: "x".repeat(2049) },
      { channel: "x".repeat(129) },
      { cursor: "x".repeat(513) },
      { limit: 501 },
      { after: 2, before: 1 },
      { after: "not-a-time" },
      { kind: "agent_run", direction: "inbound" },
      { kind: "message", session: "private" },
    ]) {
      expect((await handler(request(body))).status).toBe(400);
    }
    expect(created).toBe(0);
  });
});
