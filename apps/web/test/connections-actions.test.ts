import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionContext } from "../lib/session";

const context: AppSessionContext = {
  sessionId: "session-1",
  user: { id: "user-1", email: "anthony@example.test", name: "Anthony" },
  orgId: "org-1",
  organizationName: "Opzava",
  organizationLifecycleState: "active",
  workspaceId: "workspace-1",
  workspaceName: "Admin",
  roleKeys: ["admin"],
};

const mocks = vi.hoisted(() => ({
  startModelProviderDisconnectForContext: vi.fn(),
  pollModelProviderSetupTokenFlowForContext: vi.fn(),
  getAppSessionContext: vi.fn(),
  startModelProviderSetupTokenFlowForContext: vi.fn(),
  submitModelProviderSetupTokenCodeForContext: vi.fn(),
  pollConnectionDeviceFlowForContext: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getAppSessionContext: mocks.getAppSessionContext,
}));

vi.mock("@/lib/connections", () => ({
  startModelProviderDisconnectForContext: mocks.startModelProviderDisconnectForContext,
  pollModelProviderSetupTokenFlowForContext: mocks.pollModelProviderSetupTokenFlowForContext,
  startModelProviderSetupTokenFlowForContext: mocks.startModelProviderSetupTokenFlowForContext,
  submitModelProviderSetupTokenCodeForContext: mocks.submitModelProviderSetupTokenCodeForContext,
  pollConnectionDeviceFlowForContext: mocks.pollConnectionDeviceFlowForContext,
}));

function disconnectRequest(body: unknown): Request {
  return new Request("http://web.test/api/connections/model/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function routeRequest(path: string, body: unknown): Request {
  return new Request(`http://web.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("connections model disconnect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Disconnect is start-then-poll (#168): the route hands back an opId immediately rather than
  // holding the request open for the 60-120s of paced gateway logouts it would otherwise take.
  it("starts the disconnect through the provisioning port and returns the pending op", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValueOnce(context);
    mocks.startModelProviderDisconnectForContext.mockResolvedValueOnce({
      ok: true,
      value: { opId: "model-disconnect:op-1", status: "pending" },
    });

    const response = await POST(disconnectRequest({ providerId: "openai" }));

    expect(mocks.startModelProviderDisconnectForContext).toHaveBeenCalledWith({
      context,
      providerId: "openai",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      opId: "model-disconnect:op-1",
      status: "pending",
    });
  });

  it("returns 401 without a session and never calls provisioning", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValueOnce(null);

    const response = await POST(disconnectRequest({ providerId: "openai" }));

    expect(response.status).toBe(401);
    expect(mocks.startModelProviderDisconnectForContext).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing providerId and for malformed JSON", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValue(context);

    const missing = await POST(disconnectRequest({}));
    expect(missing.status).toBe(400);

    const malformed = await POST(disconnectRequest("{not json"));
    expect(malformed.status).toBe(400);
    expect(mocks.startModelProviderDisconnectForContext).not.toHaveBeenCalled();
  });

  it("maps role denials to 403 and provisioning failures to 502 with redacted payloads", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValue(context);
    mocks.startModelProviderDisconnectForContext.mockResolvedValueOnce({
      ok: false,
      error: { code: "web.connectionsForbidden", message: "Admins only." },
    });

    const forbidden = await POST(disconnectRequest({ providerId: "openai" }));
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: "web.connectionsForbidden" });

    mocks.startModelProviderDisconnectForContext.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "provisioning.connections.providerStillConnected",
        message: "Disconnect failed: Gateway still reports provider credentials.",
      },
    });
    const failed = await POST(disconnectRequest({ providerId: "openai" }));
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({
      code: "provisioning.connections.providerStillConnected",
    });
  });
});

describe("connections device-flow poll route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("polls the device flow through the provisioning port", async () => {
    const { POST } = await import("../app/api/connections/device-flow/route");
    mocks.getAppSessionContext.mockResolvedValueOnce(context);
    mocks.pollConnectionDeviceFlowForContext.mockResolvedValueOnce({
      ok: true,
      value: { status: "pending" },
    });

    const response = await POST(
      routeRequest("/api/connections/device-flow", { flowId: "model:flow-1" }),
    );

    expect(mocks.pollConnectionDeviceFlowForContext).toHaveBeenCalledWith({
      context,
      flowId: "model:flow-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "pending" });
  });

  // #159: this handler was the one of eight that hand-rolled its error prologue instead of calling
  // connectionsMutationErrorResponse, so an RBAC denial — which pollConnectionDeviceFlowForContext
  // really does raise — went out as 502 "gateway failure" rather than the 403 the browser client's
  // contract (lib/connections-route-errors.ts) says a role denial owes.
  it("maps a role denial to 403, not the 502 it owes a gateway failure", async () => {
    const { POST } = await import("../app/api/connections/device-flow/route");
    mocks.getAppSessionContext.mockResolvedValue(context);
    mocks.pollConnectionDeviceFlowForContext.mockResolvedValueOnce({
      ok: false,
      error: { code: "web.connectionsForbidden", message: "Admins only." },
    });

    const forbidden = await POST(
      routeRequest("/api/connections/device-flow", { flowId: "model:flow-1" }),
    );
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: "web.connectionsForbidden" });

    mocks.pollConnectionDeviceFlowForContext.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "provisioning.connections.deviceFlowLogUnavailable",
        message: "Gateway device-code log could not be read.",
      },
    });
    const failed = await POST(
      routeRequest("/api/connections/device-flow", { flowId: "model:flow-1" }),
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({
      code: "provisioning.connections.deviceFlowLogUnavailable",
    });
  });

  it("returns 401 with the shared unauthorized code, 400 for a missing flowId and malformed JSON", async () => {
    const { POST } = await import("../app/api/connections/device-flow/route");
    mocks.getAppSessionContext.mockResolvedValueOnce(null);

    const unauthorized = await POST(
      routeRequest("/api/connections/device-flow", { flowId: "model:flow-1" }),
    );
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({ code: "web.unauthorized" });

    mocks.getAppSessionContext.mockResolvedValue(context);
    const missing = await POST(routeRequest("/api/connections/device-flow", {}));
    expect(missing.status).toBe(400);

    const malformed = await POST(routeRequest("/api/connections/device-flow", "{not json"));
    expect(malformed.status).toBe(400);
    expect(mocks.pollConnectionDeviceFlowForContext).not.toHaveBeenCalled();
  });
});

describe("connections setup-token routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts, polls, and submits setup-token flows through the provisioning port", async () => {
    const startRoute = await import("../app/api/connections/model/setup-token/route");
    const pollRoute = await import("../app/api/connections/model/setup-token/poll/route");
    const codeRoute = await import("../app/api/connections/model/setup-token/code/route");
    mocks.getAppSessionContext.mockResolvedValue(context);
    mocks.startModelProviderSetupTokenFlowForContext.mockResolvedValueOnce({
      ok: true,
      value: { flowId: "setup:flow-1", status: "pending" },
    });
    mocks.pollModelProviderSetupTokenFlowForContext.mockResolvedValueOnce({
      ok: true,
      value: { status: "awaiting_code", authorizeUrl: "https://claude.ai/oauth/authorize" },
    });
    mocks.submitModelProviderSetupTokenCodeForContext.mockResolvedValueOnce({
      ok: true,
      value: { status: "pending" },
    });

    const start = await startRoute.POST(
      routeRequest("/api/connections/model/setup-token", { providerId: "anthropic" }),
    );
    const poll = await pollRoute.POST(
      routeRequest("/api/connections/model/setup-token/poll", { flowId: "setup:flow-1" }),
    );
    const code = await codeRoute.POST(
      routeRequest("/api/connections/model/setup-token/code", {
        flowId: "setup:flow-1",
        code: "oauth-code",
      }),
    );

    expect(start.status).toBe(200);
    expect(poll.status).toBe(200);
    expect(code.status).toBe(200);
    expect(mocks.startModelProviderSetupTokenFlowForContext).toHaveBeenCalledWith({
      context,
      providerId: "anthropic",
    });
    expect(mocks.pollModelProviderSetupTokenFlowForContext).toHaveBeenCalledWith({
      context,
      flowId: "setup:flow-1",
    });
    expect(mocks.submitModelProviderSetupTokenCodeForContext).toHaveBeenCalledWith({
      context,
      flowId: "setup:flow-1",
      code: "oauth-code",
    });
  });

  it("returns setup-token 401, 400, 403, and 502 route errors", async () => {
    const startRoute = await import("../app/api/connections/model/setup-token/route");
    const pollRoute = await import("../app/api/connections/model/setup-token/poll/route");
    const codeRoute = await import("../app/api/connections/model/setup-token/code/route");

    mocks.getAppSessionContext.mockResolvedValueOnce(null);
    const unauthorized = await startRoute.POST(
      routeRequest("/api/connections/model/setup-token", { providerId: "anthropic" }),
    );
    expect(unauthorized.status).toBe(401);

    mocks.getAppSessionContext.mockResolvedValue(context);
    const badStart = await startRoute.POST(routeRequest("/api/connections/model/setup-token", {}));
    const badPoll = await pollRoute.POST(
      routeRequest("/api/connections/model/setup-token/poll", {}),
    );
    const badCode = await codeRoute.POST(
      routeRequest("/api/connections/model/setup-token/code", {
        flowId: "setup:flow-1",
        code: "",
      }),
    );
    expect([badStart.status, badPoll.status, badCode.status]).toEqual([400, 400, 400]);

    mocks.startModelProviderSetupTokenFlowForContext.mockResolvedValueOnce({
      ok: false,
      error: { code: "web.connectionsForbidden", message: "Admins only." },
    });
    const forbidden = await startRoute.POST(
      routeRequest("/api/connections/model/setup-token", { providerId: "anthropic" }),
    );
    expect(forbidden.status).toBe(403);

    mocks.startModelProviderSetupTokenFlowForContext.mockResolvedValueOnce({
      ok: false,
      error: { code: "provisioning.connections.setupTokenLoginFailed", message: "Failed." },
    });
    const failed = await startRoute.POST(
      routeRequest("/api/connections/model/setup-token", { providerId: "anthropic" }),
    );
    expect(failed.status).toBe(502);
  });
});
