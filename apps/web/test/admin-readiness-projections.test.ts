import type { ConnectionsSnapshot } from "@opzava/ports";
import { describe, expect, it } from "vitest";

import {
  projectGatewayReadiness,
  projectHealthReadiness,
  projectIntegrationsReadiness,
  projectModelsReadiness,
} from "../lib/admin-overview/readiness-projections";
import type { ConnectionsPageData } from "../lib/connections";
import { providerConnectionSummary } from "../lib/connections-state";

const observedAt = "2026-07-20T00:00:00.000Z";
const context = {
  evaluatedAt: "2026-07-20T00:00:30.000Z",
  observationGeneration: 7,
} as const;

function snapshot(overrides: Partial<ConnectionsSnapshot> = {}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "ap-southeast-1",
      authLabel: "Workspace admin",
      lastHeartbeatAt: observedAt,
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
          lastCheckedAt: observedAt,
        },
        {
          id: "agents",
          kind: "agent",
          label: "Agents",
          status: "healthy",
          detail: null,
          lastCheckedAt: observedAt,
        },
      ],
      warnings: [],
      runtime: { version: "1.0.0", uptimeMs: 10, hostUptimeMs: 20, updateAvailable: null },
      sessions: { count: 1, recent: [] },
      checkedAt: observedAt,
      lastKnownHealthy: null,
    },
    providerCatalog: [
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
    ],
    providerConnections: [
      {
        providerId: "openai",
        status: "connected",
        authChoiceId: null,
        accountLabel: "team@example.com",
        scopes: [],
        model: "gpt-5",
        usageLabel: null,
        lastCheckedAt: observedAt,
        message: null,
      },
    ],
    pendingDeviceFlows: [],
    github: {
      status: "connected",
      accountLabel: "opzava-bot",
      scopes: ["repo"],
      repository: "anthonykewl20/opzava",
      lastCheckedAt: observedAt,
      message: null,
    },
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5",
      orchestratorProviderId: "openai",
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
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
    githubSummary: "Connected",
    provisioningAvailable,
  };
}

const projections = [
  projectHealthReadiness,
  projectGatewayReadiness,
  projectModelsReadiness,
  projectIntegrationsReadiness,
] as const;

describe("admin readiness projections", () => {
  it("projects healthy browser-safe values into fully identified live envelopes", () => {
    for (const project of projections) {
      expect(project(pageData(), context)).toMatchObject({
        state: "live",
        sourceOwner: expect.any(String),
        sourceId: expect.any(String),
        provenance: {
          label: expect.any(String),
          href: expect.any(String),
          diagnosticRef: expect.any(String),
        },
        sourceVersion: null,
        sourceTimestamp: observedAt,
        observedAt,
        staleAfter: expect.any(String),
        observationGeneration: 7,
      });
    }

    expect(projectHealthReadiness(pageData(), context)).toMatchObject({
      state: "live",
      value: {
        overall: "healthy",
        componentsTotal: 2,
        healthy: 2,
        attention: 0,
        notChecked: 0,
        gatewayActive: true,
      },
      sourceOwner: "OpenClaw/Platform",
      sourceId: "openclaw-health-readiness",
      provenance: {
        label: "OpenClaw system health",
        href: "/connections/system",
        diagnosticRef: "openclaw-health",
      },
      sourceTimestamp: observedAt,
      observedAt,
      staleAfter: "2026-07-20T00:01:00.000Z",
      observationGeneration: 7,
    });

    expect(projectGatewayReadiness(pageData(), context).value).toEqual({
      status: "active",
      region: "ap-southeast-1",
      authLabel: "Workspace admin",
      lastHeartbeatAt: observedAt,
    });
    expect(projectModelsReadiness(pageData(), context).value).toEqual({
      providersTotal: 1,
      connected: 1,
      needsAttention: 0,
      pending: 0,
      routable: true,
    });
    expect(projectIntegrationsReadiness(pageData(), context).value).toEqual({
      github: {
        connected: true,
        accountLabel: "opzava-bot",
        repository: "anthonykewl20/opzava",
      },
    });
  });

  it.each(projections)("keeps an unavailable snapshot unavailable with no value", (project) => {
    const unavailable = snapshot({
      gateway: {
        status: "unavailable",
        region: null,
        authLabel: "Unavailable",
        lastHeartbeatAt: null,
        message: "Worker read failed",
      },
    });

    expect(project(pageData(unavailable), context)).toMatchObject({
      state: "unavailable",
      value: null,
      freshnessState: "unknown",
    });
  });

  it.each(projections)("maps an unconfigured worker to not-configured, never zero", (project) => {
    expect(project(pageData(snapshot(), false), context)).toMatchObject({
      state: "not-configured",
      value: null,
    });
  });

  it("treats GitHub not_connected as a live negative fact", () => {
    const current = snapshot({
      github: {
        status: "not_connected",
        accountLabel: null,
        scopes: [],
        repository: "anthonykewl20/opzava",
        lastCheckedAt: observedAt,
        message: null,
      },
    });

    expect(projectIntegrationsReadiness(pageData(current), context)).toMatchObject({
      state: "live",
      value: { github: { connected: false } },
    });
  });

  it.each(projections)("becomes stale after its budget without changing the value", (project) => {
    const initial = project(pageData(), context);
    const atBoundary = project(pageData(), {
      ...context,
      evaluatedAt: initial.staleAfter,
    });
    const stale = project(pageData(), {
      ...context,
      evaluatedAt: new Date(Date.parse(initial.staleAfter) + 1).toISOString(),
    });

    expect(atBoundary.state).toBe("live");
    expect(stale.state).toBe("stale");
    expect(stale.value).toEqual(initial.value);
  });
});
