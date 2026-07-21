import type { ConnectionsSnapshot } from "@opzava/ports";
import { describe, expect, it } from "vitest";

import { buildHealthPageViewModel } from "../lib/health/health-view-model";
import type { ConnectionsPageData } from "../lib/connections";
import { providerConnectionSummary } from "../lib/connections-state";

const checkedAt = "2026-07-21T00:00:00.000Z";

function snapshot(overrides: Partial<ConnectionsSnapshot> = {}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "ap-southeast-1",
      authLabel: "Workspace admin",
      lastHeartbeatAt: checkedAt,
      message: null,
    },
    openclawHealth: {
      components: [
        {
          id: "gateway",
          kind: "gateway",
          label: "Gateway",
          status: "healthy",
          detail: "Operator session active.",
          lastCheckedAt: checkedAt,
        },
        {
          id: "plugins",
          kind: "plugins",
          label: "Plugins",
          status: "attention",
          detail: "2 plugin errors reported.",
          lastCheckedAt: checkedAt,
        },
        {
          id: "context-engines",
          kind: "context-engines",
          label: "Context engines",
          status: "healthy",
          detail: "No engines are quarantined.",
          lastCheckedAt: checkedAt,
        },
        {
          id: "channel:slack:default",
          kind: "channel",
          label: "Slack",
          status: "attention",
          detail: "The configured channel reported an unhealthy state.",
          lastCheckedAt: checkedAt,
        },
        {
          id: "channel:web:default",
          kind: "channel",
          label: "Web",
          status: "healthy",
          detail: "Inbound webhook reachable.",
          lastCheckedAt: checkedAt,
        },
        {
          id: "agent:reviewer",
          kind: "agent",
          label: "Reviewer",
          status: "not_checked",
          detail: "Agent liveness was not checked.",
          lastCheckedAt: null,
        },
      ],
      warnings: [
        {
          id: "model-pricing",
          label: "Model pricing",
          detail: "Model pricing refresh is degraded; runtime health is unaffected.",
        },
      ],
      runtime: {
        version: "2026.7.2",
        uptimeMs: 532_800_000,
        hostUptimeMs: null,
        updateAvailable: {
          currentVersion: "2026.7.2",
          latestVersion: "2026.7.3",
          channel: "stable",
        },
      },
      sessions: {
        count: 3,
        recent: [
          { agentId: "writer", updatedAt: checkedAt, ageMs: 10_000 },
          { agentId: "reviewer", updatedAt: checkedAt, ageMs: 20_000 },
        ],
      },
      checkedAt,
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
      orchestratorModel: null,
      orchestratorProviderId: null,
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
      },
      reconcile: { status: "idle" },
      updatedAt: checkedAt,
    },
    refreshedAt: checkedAt,
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

describe("Health page view model", () => {
  it("groups every component and derives truthful counts and exception-only attention rows", () => {
    const view = buildHealthPageViewModel(pageData(), liveContext);

    expect(view.availability).toBe("live");
    expect(view.counts).toEqual({ total: 6, healthy: 3, attention: 2, notChecked: 1 });
    expect(view.groups.map((group) => [group.id, group.label, group.components.length])).toEqual([
      ["system-core", "System core", 3],
      ["channels", "Channels", 2],
      ["agents", "Agents", 1],
    ]);
    expect(
      view.groups.flatMap((group) => group.components).map((component) => component.id),
    ).toEqual([
      "gateway",
      "plugins",
      "context-engines",
      "channel:slack:default",
      "channel:web:default",
      "agent:reviewer",
    ]);
    expect(view.attentionItems.map((item) => item.id)).toEqual([
      "component:plugins",
      "component:channel:slack:default",
    ]);
    expect(view.warnings).toEqual([
      {
        id: "model-pricing",
        label: "Model pricing",
        detail: "Model pricing refresh is degraded; runtime health is unaffected.",
      },
    ]);
    expect(view.attentionItems.every((item) => item.href.startsWith("/connections/system"))).toBe(
      true,
    );
  });

  it("keeps not-checked components unknown and out of the healthy count", () => {
    const current = snapshot({
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [
          {
            id: "agent:reviewer",
            kind: "agent",
            label: "Reviewer",
            status: "not_checked",
            detail: "No probe yet.",
            lastCheckedAt: null,
          },
        ],
        warnings: [],
      },
    });
    const view = buildHealthPageViewModel(pageData(current), liveContext);

    expect(view.counts).toEqual({ total: 1, healthy: 0, attention: 0, notChecked: 1 });
    expect(view.overall).toBe("degraded");
    expect(view.verdict).toContain("unknown");
    expect(view.groups[0]?.components[0]?.statusLabel).toContain("Unknown");

    const empty = buildHealthPageViewModel(
      pageData(
        snapshot({
          openclawHealth: {
            ...snapshot().openclawHealth,
            components: [],
            warnings: [],
          },
        }),
      ),
      liveContext,
    );
    expect(empty).toMatchObject({ counts: null, overall: "degraded" });
    expect(empty.verdict).toContain("unknown");

    const unknown = buildHealthPageViewModel(
      pageData(snapshot({ refreshedAt: "2026-07-21T00:01:00.000Z" })),
      liveContext,
    );
    expect(unknown).toMatchObject({
      availability: "unknown",
      counts: null,
      groups: [],
      attentionItems: [],
      warnings: [],
      runtime: { version: null },
      sessions: { count: null },
      gateway: { statusLabel: "Unknown", tone: "unknown", live: false },
    });
  });

  it("lists main as unmanaged while excluding it from every count and attention item", () => {
    const current = snapshot({
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [
          {
            id: "gateway",
            kind: "gateway",
            label: "Gateway",
            status: "healthy",
            detail: "Live.",
            lastCheckedAt: checkedAt,
          },
          {
            id: "agent:main",
            kind: "agent",
            label: "Main",
            status: "attention",
            managed: false,
            detail: "Unmanaged (not an Opzava agent).",
            lastCheckedAt: null,
          },
        ],
        warnings: [],
      },
    });

    const view = buildHealthPageViewModel(pageData(current), liveContext);
    const main = view.groups
      .flatMap((group) => group.components)
      .find((component) => component.id === "agent:main");

    expect(view.counts).toEqual({ total: 1, healthy: 1, attention: 0, notChecked: 0 });
    expect(view.attentionItems).toEqual([]);
    expect(main).toMatchObject({
      statusLabel: "Unmanaged",
      detail: "Unmanaged (not an Opzava agent).",
    });
  });

  it("distinguishes not-configured, unavailable with stale last-known-good, stale, and live", () => {
    const notConfigured = buildHealthPageViewModel(pageData(snapshot(), false), liveContext);
    const unavailableSnapshot = snapshot({
      gateway: {
        status: "unavailable",
        region: null,
        authLabel: "Unavailable",
        lastHeartbeatAt: null,
        message: "Gateway could not be reached.",
      },
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [
          {
            id: "gateway",
            kind: "gateway",
            label: "Gateway",
            status: "not_checked",
            detail: "Health data was not available.",
            lastCheckedAt: null,
          },
        ],
        checkedAt: null,
        lastKnownHealthy: { checkedAt, healthy: 6, total: 6 },
      },
    });
    const unavailable = buildHealthPageViewModel(pageData(unavailableSnapshot), liveContext);
    const stale = buildHealthPageViewModel(pageData(), {
      ...liveContext,
      evaluatedAt: "2026-07-21T00:01:00.001Z",
    });
    const live = buildHealthPageViewModel(pageData(), liveContext);

    expect(notConfigured).toMatchObject({
      availability: "not-configured",
      counts: null,
      verdict: "Health data isn't set up yet",
    });
    expect(unavailable).toMatchObject({
      availability: "unavailable",
      counts: null,
      lastKnownGood: { healthy: 6, total: 6, stale: true },
    });
    expect(unavailable.verdict).toContain("unavailable");
    expect(unavailable.groups).toEqual([]);
    expect(stale).toMatchObject({ availability: "stale", counts: { total: 6, healthy: 3 } });
    expect(live.availability).toBe("live");
  });
});
