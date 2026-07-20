import { describe, expect, it, vi } from "vitest";

const framework = vi.hoisted(() => ({
  forbidden: vi.fn((): never => {
    throw new Error("NEXT_FORBIDDEN");
  }),
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const session = vi.hoisted(() => ({
  roleKeys: ["owner"] as readonly string[],
}));

const shell = vi.hoisted(() => ({
  loadAdminShellState: vi.fn(async () => ({
    nav: {},
    health: {
      status: "unknown" as const,
      text: "Health unknown",
      dotClassName: "dot",
      ariaLabel: "System health: Health unknown",
      attentionCount: 0,
      checkedAt: null,
      gatewayReachable: null,
    },
    commandItems: [],
  })),
}));

vi.mock("next/navigation", () => framework);
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/lib/session", () => ({
  isFirstOwnerSetupComplete: async () => true,
  getAppSessionContext: async () => ({
    sessionId: "session-1",
    user: { id: "user-1", email: "admin@example.test", name: "Admin" },
    orgId: "org-1",
    organizationName: "Opzava",
    organizationLifecycleState: "active",
    workspaceId: "workspace-1",
    workspaceName: "Admin",
    roleKeys: session.roleKeys,
  }),
}));
vi.mock("@/lib/shell-state", () => shell);
vi.mock("@/components/shell/admin-nav", () => ({ AdminNav: () => null }));
vi.mock("@/components/shell/command-palette", () => ({
  AskOpzavaAgentStatus: () => null,
  CommandPalette: () => null,
  TopbarRouteSearchOrBreadcrumb: () => null,
}));
vi.mock("@/components/shell/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/shell/sidebar-toggle", () => ({ SidebarToggle: () => null }));
vi.mock("@/components/shell/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/shell/user-menu", () => ({ UserMenu: () => null }));

import AppLayout from "../app/(app)/layout";

describe("Admin shell root admission", () => {
  it("recomputes admission from each live session and forbids a revoked principal before shell work", async () => {
    session.roleKeys = ["owner"];
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    expect(shell.loadAdminShellState).toHaveBeenCalledTimes(1);

    session.roleKeys = ["member"];
    await expect(AppLayout({ children: null })).rejects.toThrow("NEXT_FORBIDDEN");

    expect(framework.forbidden).toHaveBeenCalledTimes(1);
    expect(shell.loadAdminShellState).toHaveBeenCalledTimes(1);
    expect(framework.redirect).not.toHaveBeenCalled();
  });
});
