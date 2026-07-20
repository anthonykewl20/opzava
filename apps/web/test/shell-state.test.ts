import type { ConnectionsSnapshot } from "@opzava/ports";
import type { IssueProjectionDto, TaskDto } from "@opzava/project-management";
import { ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import type { ConnectionsPageData } from "../lib/connections";
import { openclawHealthSummary, providerConnectionSummary } from "../lib/connections-state";
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
    openclawHealth: {
      components: [
        {
          id: "gateway",
          kind: "gateway",
          label: "Gateway",
          status: "healthy",
          detail: null,
          lastCheckedAt: "2026-07-03T00:00:00.000Z",
        },
      ],
      warnings: [],
      runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
      sessions: { count: null, recent: [] },
      checkedAt: null,
      lastKnownHealthy: null,
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
      orchestratorProviderId: "openai",
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
      },
      reconcile: { status: "idle" },
      updatedAt: null,
    },
    refreshedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function connectionsPageData(current: ConnectionsSnapshot): ConnectionsPageData {
  const providerSummary = providerConnectionSummary(current);

  return {
    snapshot: current,
    providerSummary,
    providers: [],
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

  it("maps the canonical OpenClaw rollup into the shell pill states", () => {
    expect(
      shellHealthView({
        summary: {
          total: 1,
          healthy: 1,
          attention: 0,
          notChecked: 0,
          percent: 100,
          status: "healthy",
        },
        checkedAt: "2026-07-03T00:00:00.000Z",
        gatewayReachable: true,
      }),
    ).toMatchObject({
      status: "healthy",
      text: "All systems healthy",
      dotClassName: "dot dot-success",
    });
    expect(
      shellHealthView({
        summary: {
          total: 3,
          healthy: 1,
          attention: 1,
          notChecked: 1,
          percent: 50,
          status: "attention",
        },
        checkedAt: "2026-07-03T00:00:00.000Z",
        gatewayReachable: true,
      }),
    ).toMatchObject({
      status: "attention",
      text: "1 needs attention",
      dotClassName: "dot dot-warning",
    });
    expect(
      shellHealthView({
        summary: {
          total: 4,
          healthy: 1,
          attention: 2,
          notChecked: 1,
          percent: 33,
          status: "attention",
        },
        checkedAt: "2026-07-03T00:00:00.000Z",
        gatewayReachable: true,
      }),
    ).toMatchObject({ text: "2 need attention" });
    expect(
      shellHealthView({
        summary: {
          total: 1,
          healthy: 0,
          attention: 0,
          notChecked: 1,
          percent: null,
          status: "unknown",
        },
        checkedAt: null,
        gatewayReachable: null,
      }),
    ).toMatchObject({
      status: "unknown",
      text: "Health unknown",
      dotClassName: "dot",
    });
  });

  it("keeps hero and shell presentation in agreement for one OpenClaw health DTO", () => {
    const health = {
      ...snapshot().openclawHealth,
      checkedAt: "2026-07-03T00:00:00.000Z",
      components: [
        {
          id: "gateway",
          kind: "gateway" as const,
          label: "Gateway",
          status: "healthy" as const,
          detail: null,
          lastCheckedAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "channel.github",
          kind: "channel" as const,
          label: "GitHub",
          status: "attention" as const,
          detail: "Disconnected",
          lastCheckedAt: "2026-07-03T00:00:00.000Z",
        },
      ],
    };
    const heroSummary = openclawHealthSummary(health);
    const pill = shellHealthView({
      summary: openclawHealthSummary(health),
      checkedAt: health.checkedAt,
      gatewayReachable: true,
    });

    expect(heroSummary).toMatchObject({ status: "attention", attention: 1, percent: 50 });
    expect(pill).toMatchObject({ status: heroSummary.status, text: "1 needs attention" });
  });

  it("builds command palette entries from nav routes, task titles, and issue titles", () => {
    const items = buildCommandPaletteItems({
      principal: context(),
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

  it("returns no palette destinations or records for a root-denied principal", () => {
    expect(
      buildCommandPaletteItems({
        principal: { roleKeys: ["member"] },
        tasks: [task()],
        issues: [issue()],
        workspaceName: "Admin",
      }),
    ).toEqual([]);
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
      checkGatewayHealth: async () => false,
    };

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.nav).toMatchObject({
      openTasksCount: 1,
      openIssuesCount: 1,
      askOpzavaActive: true,
      connectionsConnected: true,
      connections: {
        providersConnected: 0,
        providersTotal: 0,
        githubConnected: false,
      },
    });
    expect(state.nav.model.operate.map((item) => item.label)).toEqual([
      "Overview",
      "Tasks",
      "Issues",
    ]);
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
              openclawHealth: {
                ...current.openclawHealth,
                components: [
                  {
                    id: "gateway",
                    kind: "gateway",
                    label: "Gateway",
                    status: "attention",
                    detail: "Operator RPC unavailable.",
                    lastCheckedAt: "2026-07-03T00:00:00.000Z",
                  },
                ],
              },
            }),
          ),
        ),
      countActiveAskOpzavaTurns: async () => 0,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("attention");
    expect(state.health.gatewayReachable).toBe(false);
  });

  it("derives the rail connections sub-tree status from the loaded snapshot", async () => {
    const dependencies = {
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () =>
        ok(
          connectionsPageData(
            snapshot({
              providerCatalog: [
                {
                  id: "openai",
                  label: "OpenAI",
                  vendor: "OpenAI",
                  authChoices: [],
                  suggestedModel: "openai/gpt-5.5",
                  models: [],
                  roleStrength: "orchestration",
                  whenToUse: "front-door chat",
                },
                {
                  id: "zai",
                  label: "z.ai",
                  vendor: "z.ai",
                  authChoices: [],
                  suggestedModel: "zai/glm-5.2",
                  models: [],
                  roleStrength: "implementation",
                  whenToUse: "coding tasks",
                },
              ],
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
              github: {
                status: "connected",
                accountLabel: "anthonykewl20",
                scopes: ["repo"],
                repository: "anthonykewl20/opzava",
                lastCheckedAt: "2026-07-03T00:00:00.000Z",
                message: null,
              },
            }),
          ),
        ),
      countActiveAskOpzavaTurns: async () => 0,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.nav.connections).toEqual({
      providersConnected: 1,
      providersTotal: 2,
      githubConnected: true,
    });
  });

  it("degrades shell health when the connections snapshot cannot be loaded", async () => {
    const dependencies = {
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () => {
        throw new Error("connections unavailable");
      },
      countActiveAskOpzavaTurns: async () => 0,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("unknown");
    expect(state.health.gatewayReachable).toBe(false);
    expect(state.nav.connections).toEqual({
      providersConnected: 0,
      providersTotal: 0,
      githubConnected: false,
    });
  });

  it("does not mix database reachability into the OpenClaw health pill", async () => {
    const dependencies = {
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () => ok(connectionsPageData(snapshot())),
      countActiveAskOpzavaTurns: async () => 0,
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("healthy");
    expect(state.health.gatewayReachable).toBe(true);
  });
});
