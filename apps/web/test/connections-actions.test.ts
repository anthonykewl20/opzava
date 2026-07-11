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
  disconnectModelProviderForContext: vi.fn(),
  pollModelProviderSetupTokenFlowForContext: vi.fn(),
  getAppSessionContext: vi.fn(),
  startModelProviderSetupTokenFlowForContext: vi.fn(),
  submitModelProviderSetupTokenCodeForContext: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getAppSessionContext: mocks.getAppSessionContext,
}));

vi.mock("@/lib/connections", () => ({
  disconnectModelProviderForContext: mocks.disconnectModelProviderForContext,
  pollModelProviderSetupTokenFlowForContext: mocks.pollModelProviderSetupTokenFlowForContext,
  startModelProviderSetupTokenFlowForContext: mocks.startModelProviderSetupTokenFlowForContext,
  submitModelProviderSetupTokenCodeForContext: mocks.submitModelProviderSetupTokenCodeForContext,
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

  it("disconnects through the provisioning port and returns the final provider state", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValueOnce(context);
    mocks.disconnectModelProviderForContext.mockResolvedValueOnce({
      ok: true,
      value: { providerId: "openai", status: "not_connected" },
    });

    const response = await POST(disconnectRequest({ providerId: "openai" }));

    expect(mocks.disconnectModelProviderForContext).toHaveBeenCalledWith({
      context,
      providerId: "openai",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      providerId: "openai",
      status: "not_connected",
    });
  });

  it("returns 401 without a session and never calls provisioning", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValueOnce(null);

    const response = await POST(disconnectRequest({ providerId: "openai" }));

    expect(response.status).toBe(401);
    expect(mocks.disconnectModelProviderForContext).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing providerId and for malformed JSON", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValue(context);

    const missing = await POST(disconnectRequest({}));
    expect(missing.status).toBe(400);

    const malformed = await POST(disconnectRequest("{not json"));
    expect(malformed.status).toBe(400);
    expect(mocks.disconnectModelProviderForContext).not.toHaveBeenCalled();
  });

  it("maps role denials to 403 and provisioning failures to 502 with redacted payloads", async () => {
    const { POST } = await import("../app/api/connections/model/disconnect/route");
    mocks.getAppSessionContext.mockResolvedValue(context);
    mocks.disconnectModelProviderForContext.mockResolvedValueOnce({
      ok: false,
      error: { code: "web.connectionsForbidden", message: "Admins only." },
    });

    const forbidden = await POST(disconnectRequest({ providerId: "openai" }));
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: "web.connectionsForbidden" });

    mocks.disconnectModelProviderForContext.mockResolvedValueOnce({
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
