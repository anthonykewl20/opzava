import { beforeEach, describe, expect, it, vi } from "vitest";

const framework = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const session = vi.hoisted(() => ({
  getAppSessionContext: vi.fn(),
}));

const connections = vi.hoisted(() => ({
  applyOrchestratorRolesForContext: vi.fn(),
  disconnectGitHubForContext: vi.fn(),
  refreshConnectionsPageData: vi.fn(),
  requireConnectionMutationRole: vi.fn(),
  startGitHubDeviceFlowForContext: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => framework);
vi.mock("@/lib/session", () => session);
vi.mock("@/lib/connections", () => connections);

import {
  applyOrchestratorRolesAction,
  startGitHubDeviceFlowAction,
} from "../app/(app)/connections/actions";

const context = {
  sessionId: "session-1",
  user: { id: "user-1", email: "admin@example.test", name: "Admin" },
  orgId: "org-1",
  organizationName: "Opzava",
  organizationLifecycleState: "active",
  workspaceId: "workspace-1",
  workspaceName: "Admin",
  roleKeys: ["admin"],
};

describe("connections action domain notices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.getAppSessionContext.mockResolvedValue(context);
    connections.requireConnectionMutationRole.mockReturnValue({ ok: true, value: undefined });
  });

  it("keeps operator-admin-required as a notice redirect", async () => {
    connections.applyOrchestratorRolesForContext.mockResolvedValue({
      ok: false,
      error: { code: "provisioning.openclawAdmin.operatorAdminRequired" },
    });

    await expect(applyOrchestratorRolesAction()).rejects.toThrow(
      "NEXT_REDIRECT:/connections?notice=operator-admin-required",
    );
  });

  it("keeps GitHub not-configured as a scoped notice redirect", async () => {
    connections.startGitHubDeviceFlowForContext.mockResolvedValue({
      ok: false,
      error: { cause: { code: "provisioning.githubOAuth.notConfigured" } },
    });

    await expect(startGitHubDeviceFlowAction("/connections/github")).rejects.toThrow(
      "NEXT_REDIRECT:/connections/github?notice=github-not-configured",
    );
  });
});
