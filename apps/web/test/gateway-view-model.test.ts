import type { ConnectionsSnapshot } from "@opzava/ports";
import { describe, expect, it } from "vitest";

import type { ConnectionsPageData } from "../lib/connections";
import { providerConnectionSummary } from "../lib/connections-state";
import { buildGatewayPageViewModel } from "../lib/gateway/gateway-view-model";

const observedAt = "2026-07-21T00:00:00.000Z";

function snapshot(overrides: Partial<ConnectionsSnapshot> = {}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "ap-southeast-1",
      authLabel: "operator.write + approvals",
      lastHeartbeatAt: observedAt,
      message: null,
    },
    openclawHealth: {
      components: [],
      warnings: [],
      runtime: {
        version: "2026.7.2",
        uptimeMs: 39_600_000,
        hostUptimeMs: null,
        updateAvailable: null,
      },
      sessions: {
        count: 3,
        recent: [{ agentId: "writer", updatedAt: observedAt, ageMs: 10_000 }],
      },
      checkedAt: observedAt,
      lastKnownHealthy: null,
    },
    providerCatalog: [
      {
        id: "openai",
        label: "OpenAI",
        vendor: "OpenAI",
        authChoices: [],
        suggestedModel: "openai/gpt-5.6-sol",
        roleStrength: "orchestration",
        whenToUse: "main orchestration",
      },
    ],
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
      orchestratorModel: "openai/gpt-5.6-sol",
      orchestratorProviderId: "openai",
      delegationMode: "prefer",
      allowAgents: ["subagent-zai", "subagent-deepseek"],
      subagents: [
        {
          agentId: "subagent-zai",
          providerId: "zai",
          providerLabel: "Z.AI",
          model: "zai/glm-5.2",
          strength: "Implementation",
          whenToUse: "Substantial implementation work",
        },
        {
          agentId: "subagent-deepseek",
          providerId: "deepseek",
          providerLabel: "DeepSeek",
          model: "deepseek/deepseek-r1",
          strength: "Risk audit",
          whenToUse: "Independent security review",
        },
      ],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: "receipt-1",
      },
      reconcile: { status: "idle" },
      updatedAt: observedAt,
    },
    refreshedAt: observedAt,
    ...overrides,
  };
}

function pageData(
  current: ConnectionsSnapshot = snapshot(),
  provisioningAvailable = true,
): ConnectionsPageData {
  return {
    snapshot: current,
    providerSummary: providerConnectionSummary(current),
    providers: [],
    githubSummary: "Not connected",
    provisioningAvailable,
  };
}

const liveContext = {
  evaluatedAt: "2026-07-21T00:00:30.000Z",
  observationGeneration: 1,
} as const;

describe("Gateway page view model", () => {
  it("maps the elected orchestrator and each real subagent into browser-safe display fields", () => {
    const view = buildGatewayPageViewModel(pageData(), liveContext);

    expect(view.availability).toBe("live");
    expect(view.orchestrator).toMatchObject({
      agentId: "ask-admin-opzava",
      model: "openai/gpt-5.6-sol",
      providerId: "openai",
      providerLabel: "OpenAI",
      delegationMode: "prefer",
      electionLabel: "Current election",
    });
    expect(view.subagents).toEqual([
      {
        agentId: "subagent-zai",
        providerId: "zai",
        providerLabel: "Z.AI",
        model: "zai/glm-5.2",
        strength: "Implementation",
        whenToUse: "Substantial implementation work",
      },
      {
        agentId: "subagent-deepseek",
        providerId: "deepseek",
        providerLabel: "DeepSeek",
        model: "deepseek/deepseek-r1",
        strength: "Risk audit",
        whenToUse: "Independent security review",
      },
    ]);
    expect(view.sessions).toEqual({ count: 3, recentCount: 1, evidenceLabel: "Live evidence" });
    expect(view.runtime).toEqual({ version: "2026.7.2", uptimeLabel: "11h" });
  });

  it("keeps a missing election and an empty subagent roster honest", () => {
    const current = snapshot({
      orchestrator: {
        ...snapshot().orchestrator,
        orchestratorModel: null,
        orchestratorProviderId: null,
        allowAgents: [],
        subagents: [],
      },
    });
    const view = buildGatewayPageViewModel(pageData(current), liveContext);

    expect(view.orchestrator).toMatchObject({ model: null, providerId: null, providerLabel: null });
    expect(view.subagents).toEqual([]);
    expect(view.orchestrator.emptyLabel).toBe("No main orchestrator elected yet");
  });

  it("distinguishes live, not-configured, unavailable retained evidence, and stale", () => {
    const live = buildGatewayPageViewModel(pageData(), liveContext);
    const notConfigured = buildGatewayPageViewModel(pageData(snapshot(), false), liveContext);
    const unavailable = buildGatewayPageViewModel(
      pageData(
        snapshot({
          gateway: {
            status: "unavailable",
            region: "ap-southeast-1",
            authLabel: "operator.write + approvals",
            lastHeartbeatAt: observedAt,
            message: "Gateway could not be reached.",
          },
        }),
      ),
      liveContext,
    );
    const stale = buildGatewayPageViewModel(pageData(), {
      ...liveContext,
      evaluatedAt: "2026-07-21T00:01:00.001Z",
    });

    expect(live.connection).toMatchObject({ statusLabel: "Active", live: true, stale: false });
    expect(notConfigured).toMatchObject({
      availability: "not-configured",
      connection: { statusLabel: "Not configured", live: false },
    });
    expect(unavailable).toMatchObject({
      availability: "unavailable",
      connection: {
        statusLabel: "Unavailable",
        live: false,
        stale: true,
        region: "ap-southeast-1",
      },
      sessions: { count: null },
    });
    expect(unavailable.connection.statusLabel).not.toBe("Active");
    expect(stale).toMatchObject({
      availability: "stale",
      connection: { statusLabel: "Evidence stale", live: false, stale: true },
    });
  });

  it("exposes usage only as an unavailable rollout destination and never invents metrics", () => {
    const view = buildGatewayPageViewModel(pageData(), liveContext);

    expect(view.usage).toEqual({ href: "/usage", available: false });
    expect(Object.keys(view.usage)).toEqual(["href", "available"]);
  });
});
