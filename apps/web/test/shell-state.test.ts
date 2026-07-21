import type { ConnectionsSnapshot } from "@opzava/ports";
import type { IssueProjectionDto, TaskDto } from "@opzava/project-management";
import { ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import type { ConnectionsPageData } from "../lib/connections";
import { buildAdminNavModel, NAVIGABLE_ROUTES } from "../lib/admin-registry";
import { repairAdminGroupOpenState } from "../lib/admin-sidebar-state";
import { providerConnectionSummary, projectProviderConnections } from "../lib/connections-state";
import {
  attentionInboxView,
  buildCommandPaletteItems,
  loadAdminShellState,
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

const projectionClock = {
  now: () => new Date("2026-07-03T00:00:30.000Z"),
  observationGeneration: 7,
} as const;

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
      checkedAt: "2026-07-03T00:00:00.000Z",
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
    providers: projectProviderConnections(current),
    githubSummary: "GitHub",
    provisioningAvailable: true,
  };
}

describe("Admin shell state", () => {
  it("repairs persisted sidebar group state against the current registry", () => {
    const groups = buildAdminNavModel(context()).groups;

    expect(
      repairAdminGroupOpenState(
        JSON.stringify({ develop: false, "ai-runtime": true, removed: false, operate: "no" }),
        groups,
      ),
    ).toEqual({
      develop: false,
      "ai-runtime": true,
      operate: true,
      configure: true,
    });
    expect(repairAdminGroupOpenState("not-json", groups)).toEqual({
      develop: true,
      "ai-runtime": true,
      operate: true,
      configure: true,
    });
  });

  it("maps readiness independently across healthy, degraded, unhealthy, and unknown health", () => {
    const envelope = {
      state: "live" as const,
      freshnessState: "within-budget" as const,
      sourceTimestamp: "2026-07-03T00:00:00.000Z",
      provenance: {
        label: "OpenClaw system health",
        href: "/connections/system",
        diagnosticRef: "openclaw-health",
      },
      value: {
        overall: "healthy" as const,
        componentsTotal: 1,
        healthy: 1,
        attention: 0,
        notChecked: 0,
        gatewayActive: true,
      },
    };

    expect(shellHealthView(envelope)).toMatchObject({
      status: "healthy",
      text: "Healthy",
      dotClassName: "dot dot-success",
    });
    expect(
      shellHealthView({
        ...envelope,
        value: { ...envelope.value, overall: "degraded", notChecked: 1 },
      }),
    ).toMatchObject({
      status: "degraded",
      text: "Degraded",
      dotClassName: "dot dot-warning",
      ariaLabel:
        "Health: Degraded; OpenClaw system health is degraded; checked 2026-07-03T00:00:00.000Z",
    });
    expect(
      shellHealthView({ ...envelope, value: { ...envelope.value, overall: "unhealthy" } }),
    ).toMatchObject({ status: "unhealthy", text: "Unhealthy", dotClassName: "dot dot-danger" });
    expect(shellHealthView(null)).toMatchObject({
      status: "unknown",
      text: "Unknown",
      dotClassName: "dot",
    });
  });

  it("never renders stale or unavailable readiness as green", () => {
    const unavailable = shellHealthView({
      state: "unavailable",
      freshnessState: "unknown",
      sourceTimestamp: null,
      provenance: {
        label: "OpenClaw system health",
        href: "/connections/system",
        diagnosticRef: "openclaw-health",
      },
      value: null,
    });

    expect(unavailable).toMatchObject({ status: "unknown", text: "Unknown" });
    expect(unavailable.ariaLabel).toContain("freshness unknown");
    expect(unavailable.dotClassName).not.toContain("dot-success");
  });

  it("distinguishes a verified empty attention feed from unavailable evidence", () => {
    expect(attentionInboxView({ rows: [], status: { state: "live", partial: false } })).toEqual({
      count: 0,
      hasItems: false,
      state: "available",
      ariaLabel: "Attention: 0 actionable items",
    });
    expect(
      attentionInboxView({ rows: [], status: { state: "unavailable", partial: false } }),
    ).toEqual({
      count: null,
      hasItems: null,
      state: "unknown",
      ariaLabel: "Attention: actionable items unavailable",
    });
  });

  it("keeps health and attention independent across the four required combinations", async () => {
    const providerCatalog = [
      {
        id: "openai",
        label: "OpenAI",
        vendor: "OpenAI",
        suggestedModel: "gpt-5",
        roleStrength: "General",
        whenToUse: "General work",
        authChoices: [],
        models: [],
      },
    ];
    const actionableProvider = {
      providerId: "openai",
      status: "needs_attention" as const,
      authChoiceId: null,
      accountLabel: null,
      scopes: [],
      model: null,
      usageLabel: null,
      lastCheckedAt: "2026-07-03T00:00:00.000Z",
      message: "Reconnect",
    };
    const healthyWithAttention = snapshot({
      providerCatalog,
      providerConnections: [actionableProvider],
    });
    const healthyEmpty = snapshot();
    const degradedEmpty = snapshot({
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [
          snapshot().openclawHealth.components[0]!,
          {
            id: "optional-channel",
            kind: "channel",
            label: "Optional channel",
            status: "not_checked",
            detail: null,
            lastCheckedAt: null,
          },
        ],
      },
    });
    const unhealthyWithAttention = snapshot({
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [
          {
            id: "gateway",
            kind: "gateway",
            label: "Gateway",
            status: "attention",
            detail: "Unavailable",
            lastCheckedAt: "2026-07-03T00:00:00.000Z",
          },
        ],
      },
    });
    const load = (current: ConnectionsSnapshot) =>
      loadAdminShellState(context(), {
        ...projectionClock,
        listTasks: async () => ok([]),
        listIssueProjections: async () => ok([]),
        loadConnectionsPageData: async () => ok(connectionsPageData(current)),
      });

    const states = await Promise.all(
      [healthyWithAttention, healthyEmpty, degradedEmpty, unhealthyWithAttention].map(load),
    );

    expect(states.map(({ health, attention }) => [health.status, attention.count])).toEqual([
      ["healthy", 1],
      ["healthy", 0],
      ["degraded", 0],
      ["unhealthy", 1],
    ]);
  });

  it("builds command palette entries from navigable registry routes, Connections, tasks, and issues", () => {
    const items = buildCommandPaletteItems({
      principal: context(),
      tasks: [task()],
      issues: [issue()],
      workspaceName: "Admin",
    });

    const destinations = items.filter((item) => item.kind === "destination");
    expect(destinations.map(({ id, label, href }) => ({ id, label, href }))).toEqual([
      { id: "nav.ask-admin-opzava", label: "Ask Admin Opzava", href: "/ask-opzava" },
      { id: "nav.overview", label: "Overview", href: "/" },
      { id: "nav.dev-board", label: "Dev Board", href: "/dev-board" },
      { id: "nav.gateway", label: "Gateway", href: "/gateway" },
      { id: "nav.models", label: "Models & Providers", href: "/models" },
      { id: "nav.health", label: "Health", href: "/health" },
      { id: "nav.connections", label: "Connections", href: "/connections" },
    ]);
    const soonHrefs = buildAdminNavModel(context())
      .groups.flatMap((group) => group.destinations)
      .map((destination) => destination.href)
      .filter((href) => !NAVIGABLE_ROUTES.has(href));
    expect(soonHrefs).toHaveLength(15);
    expect(destinations.some((destination) => soonHrefs.includes(destination.href))).toBe(false);
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
      ...projectionClock,
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
    };

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("healthy");
    expect(state.health.text).toBe("Healthy");
    expect(state.commandItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "nav.overview",
        "nav.connections",
        "task.task-1",
        "issue.anthonykewl20/opzava.12",
      ]),
    );
  });

  it("degrades shell health when the gateway snapshot is unavailable", async () => {
    const current = snapshot();
    const dependencies = {
      ...projectionClock,
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
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("unknown");
    expect(state.health.dotClassName).not.toContain("dot-success");
    expect(state.health.gatewayReachable).toBe(false);
  });

  it("degrades shell health when the connections snapshot cannot be loaded", async () => {
    const dependencies = {
      ...projectionClock,
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () => {
        throw new Error("connections unavailable");
      },
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("unknown");
    expect(state.health.gatewayReachable).toBe(false);
  });

  it("does not mix database reachability into the OpenClaw health pill", async () => {
    const dependencies = {
      ...projectionClock,
      listTasks: async () => ok([]),
      listIssueProjections: async () => ok([]),
      loadConnectionsPageData: async () => ok(connectionsPageData(snapshot())),
    } satisfies AdminShellStateDependencies;

    const state = await loadAdminShellState(context(), dependencies);

    expect(state.health.status).toBe("healthy");
    expect(state.health.gatewayReachable).toBe(true);
  });
});
