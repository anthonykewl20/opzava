import type { ConnectionsSnapshot } from "@opzava/ports";
import type { IssueProjectionDto, TaskDto } from "@opzava/project-management";
import { ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import type { ConnectionsPageData } from "../lib/connections";
import {
  buildCommandPaletteItems,
  loadAdminShellState,
  openIssueCount,
  openTaskCount,
  shellHealthView,
  type AdminShellStateDependencies,
} from "../lib/shell-state";
import type { AppSessionContext } from "../lib/session";

function context(): AppSessionContext {
  return {
    sessionId: "session-1",
    user: { id: "user-1", email: "anthony@example.test", name: "Anthony" },
    orgId: "org-1",
    organizationName: "Opzava",
    organizationLifecycleState: "active",
    workspaceId: "workspace-1",
    workspaceName: "Admin",
    roleKeys: ["admin"],
  };
}

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: "task-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    cardNumber: 42,
    title: "Audit launch tasks",
    description: "Check real task state",
    status: "todo",
    priority: "normal",
    assigneeUserId: null,
    assigneeName: null,
    labels: [],
    position: 1,
    dueAt: null,
    provenanceSource: "manual",
    provenanceExternalRef: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function issue(overrides: Partial<IssueProjectionDto> = {}): IssueProjectionDto {
  return {
    id: "issue-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    repository: "anthonykewl20/opzava",
    number: 12,
    title: "Fix shell parity",
    state: "open",
    labels: [],
    assignee: null,
    updatedAt: "2026-07-03T00:00:00.000Z",
    syncedAt: "2026-07-03T00:00:00.000Z",
    url: "https://github.com/anthonykewl20/opzava/issues/12",
    linkedTaskId: null,
    linkedTaskStatus: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<ConnectionsSnapshot> = {}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "local",
      authLabel: "JIT operator.admin",
      lastHeartbeatAt: "2026-07-03T00:00:00.000Z",
      message: null,
    },
    providerCatalog: [],
    providerConnections: [],
    pendingDeviceFlows: [],
    github: {
      status: "not_connected",
      accountLabel: null,
      scopes: [],
      repository: "anthonykewl20/opzava",
      lastCheckedAt: null,
      message: null,
    },
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5.5",
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
      },
      updatedAt: null,
    },
    refreshedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function connectionsPageData(current: ConnectionsSnapshot): ConnectionsPageData {
  return {
    snapshot: current,
    health: {
      total: 1,
      connected: 1,
      needsAttention: 0,
      pending: 0,
    },
    providerSummary: {
      total: 0,
      available: 0,
      connected: 0,
      needsAttention: 0,
      pending: 0,
      notConnected: 0,
    },
    providers: [],
    orchestratorPlan: {
      agents: { list: [] },
      receipt: {
        delegationMode: "prefer",
        allowAgents: [],
        toolPolicyExpansion: ["sessions_spawn", "subagents", "group:sessions"],
      },
    },
    githubSummary: "GitHub",
    provisioningAvailable: true,
  };
}

describe("Admin shell state", () => {
  it("counts only open tasks and open issue projections", () => {
    expect(openTaskCount([task(), task({ id: "task-2", status: "done" })])).toBe(1);
    expect(openIssueCount([issue(), issue({ id: "issue-2", number: 13, state: "closed" })])).toBe(
      1,
    );
  });

  it("maps real health checks into the shell pill states", () => {
    expect(shellHealthView({ databaseReachable: true, gatewayReachable: true })).toMatchObject({
      status: "healthy",
      text: "All systems healthy",
      dotClassName: "dot dot-success",
    });
    expect(shellHealthView({ databaseReachable: true, gatewayReachable: false })).toMatchObject({
      status: "degraded",
      text: "Systems degraded",
      dotClassName: "dot dot-warning",
    });
    expect(shellHealthView({ databaseReachable: true, gatewayReachable: null })).toMatchObject({
      status: "unknown",
      text: "Health unknown",
      dotClassName: "dot",
    });
    expect(shellHealthView({ databaseReachable: null, gatewayReachable: null })).toMatchObject({
      status: "unknown",
      text: "Health unknown",
      dotClassName: "dot",
    });
  });

  it("builds command palette entries from nav routes, task titles, and issue titles", () => {
    const items = buildCommandPaletteItems({
      tasks: [task()],
      issues: [issue()],
      workspaceName: "Admin",
    });

    expect(items).toContainEqual(
      expect.objectContaining({ id: "nav.tasks", label: "Tasks", href: "/tasks" }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "task.task-1",
        label: "Audit launch tasks",
        href: "/tasks/42",
        meta: "Task AD-42",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "issue.anthonykewl20/opzava.12",
        label: "Fix shell parity",
        href: "https://github.com/anthonykewl20/opzava/issues/12",
        external: true,
      }),
    );
  });

  it("loads healthy shell health from an active gateway snapshot even when the broker is idle", async () => {
    const dependencies = {
      listTasks: async () => ok([task(), task({ id: "task-2", status: "done" })]),
      listIssueProjections: async () =>
        ok([issue(), issue({ id: "issue-2", number: 13, state: "closed" })]),
      loadConnectionsPageData: async () =>
        ok(
          connectionsPageData(
            snapshot({
              providerConnections: [
                {
                  providerId: "openai",
                  status: "connected",
                  authChoiceId: "openai-device-code",
                  accountLabel: "GPT Pro",
                  scopes: ["chatgpt"],
                  model: "openai/gpt-5.5",
                  usageLabel: "within limits",
                  lastCheckedAt: "2026-07-03T00:00:00.000Z",
                  message: null,
                },
              ],
            }),
          ),
        ),
      countActiveAskOpzavaTurns: async () => 1,
      checkDatabaseHealth: async () => true,
      checkGatewayHealth: async () => false,
    };

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.nav).toEqual({
      openTasksCount: 1,
      openIssuesCount: 1,
      askOpzavaActive: true,
      connectionsConnected: true,
    });
    expect(state.health.status).toBe("healthy");
    expect(state.health.text).toBe("All systems healthy");
    expect(state.commandItems.map((item) => item.id)).toEqual(
      expect.arrayContaining(["nav.tasks", "task.task-1", "issue.anthonykewl20/opzava.12"]),
    );
  });

  it("degrades shell health when the gateway snapshot is unavailable", async () => {
    const current = snapshot();
    const dependencies = {
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () =>
        ok(
          connectionsPageData(
            snapshot({
              gateway: {
                ...current.gateway,
                status: "unavailable",
                lastHeartbeatAt: null,
                message: "Operator RPC unavailable.",
              },
            }),
          ),
        ),
      countActiveAskOpzavaTurns: async () => 0,
      checkDatabaseHealth: async () => true,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("degraded");
    expect(state.health.gatewayReachable).toBe(false);
  });

  it("degrades shell health when the connections snapshot cannot be loaded", async () => {
    const dependencies = {
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () => {
        throw new Error("connections unavailable");
      },
      countActiveAskOpzavaTurns: async () => 0,
      checkDatabaseHealth: async () => true,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("degraded");
    expect(state.health.gatewayReachable).toBe(false);
  });

  it("degrades shell health when the database is unreachable", async () => {
    const dependencies = {
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () => ok(connectionsPageData(snapshot())),
      countActiveAskOpzavaTurns: async () => 0,
      checkDatabaseHealth: async () => false,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("degraded");
    expect(state.health.databaseReachable).toBe(false);
    expect(state.health.gatewayReachable).toBe(true);
  });
});
