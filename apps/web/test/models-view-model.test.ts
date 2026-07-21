import type {
  ConnectionsSnapshot,
  ModelProviderCatalogEntry,
  ProviderConnectionState,
} from "@opzava/ports";
import { describe, expect, it } from "vitest";

import type { ConnectionsPageData } from "../lib/connections";
import { projectProviderConnections, providerConnectionSummary } from "../lib/connections-state";
import { buildModelsPageViewModel } from "../lib/models/models-view-model";

const observedAt = "2026-07-21T00:00:00.000Z";

function model(id: string) {
  return { id, label: id } as const;
}

function catalog(
  id: string,
  overrides: Partial<ModelProviderCatalogEntry> = {},
): ModelProviderCatalogEntry {
  return {
    id,
    label: id === "zai" ? "Z.AI" : id[0]!.toUpperCase() + id.slice(1),
    vendor: id === "zai" ? "GLM" : id[0]!.toUpperCase() + id.slice(1),
    authChoices: [],
    suggestedModel: `${id}/suggested`,
    roleStrength: `${id} strength`,
    whenToUse: `Use ${id} for its advertised strength.`,
    models: [],
    catalogModels: [],
    ...overrides,
  };
}

function connection(
  providerId: string,
  overrides: Partial<ProviderConnectionState> = {},
): ProviderConnectionState {
  return {
    providerId,
    status: "connected",
    authChoiceId: null,
    accountLabel: null,
    scopes: [],
    model: `${providerId}/main`,
    usageLabel: null,
    lastCheckedAt: observedAt,
    message: null,
    authHealth: "ok",
    expiryLabel: null,
    planLabel: null,
    connectedAuthMode: "oauth",
    ...overrides,
  };
}

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
        uptimeMs: 3_600_000,
        hostUptimeMs: null,
        updateAvailable: null,
      },
      sessions: { count: 0, recent: [] },
      checkedAt: observedAt,
      lastKnownHealthy: null,
    },
    providerCatalog: [
      catalog("openai", {
        label: "OpenAI",
        models: [model("openai/gpt-main"), model("openai/gpt-fast")],
        catalogModels: [
          model("openai/gpt-main"),
          model("openai/gpt-fast"),
          model("openai/gpt-small"),
        ],
      }),
      catalog("zai", {
        models: [model("zai/glm-main")],
        catalogModels: [model("zai/glm-main"), model("zai/glm-fast")],
      }),
      catalog("anthropic", {
        label: "Anthropic",
        models: [],
        catalogModels: [
          model("anthropic/sonnet"),
          model("anthropic/opus"),
          model("anthropic/haiku"),
          model("anthropic/instant"),
        ],
      }),
    ],
    providerConnections: [
      connection("openai", {
        model: "openai/gpt-main",
        planLabel: "Pro",
        accountLabel: "token:sk-browser-must-never-see-this",
        message: "api_key=also-secret",
        scopes: ["secret:scope"],
      }),
      connection("zai", {
        model: "zai/glm-main",
        authHealth: "expiring",
        expiryLabel: "2d",
      }),
    ],
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
      orchestratorModel: "openai/gpt-main",
      orchestratorProviderId: "openai",
      delegationMode: "prefer",
      allowAgents: ["subagent-zai"],
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
    providers: projectProviderConnections(current),
    githubSummary: "Not connected",
    provisioningAvailable,
  };
}

const liveContext = {
  evaluatedAt: "2026-07-21T00:00:30.000Z",
  observationGeneration: 1,
} as const;

describe("Models page view model", () => {
  it("projects lead and subagent cards with real routable-versus-catalog counts", () => {
    const view = buildModelsPageViewModel(pageData(), liveContext);

    expect(view.availability).toBe("live");
    expect(view.glance).toMatchObject({
      connected: 2,
      providersTotal: 3,
      needsAttention: 1,
      routableModels: 3,
      leadModel: "openai/gpt-main",
      leadProvider: "OpenAI",
    });
    expect(view.providers.map((provider) => provider.id)).toEqual(["openai", "zai", "anthropic"]);
    expect(view.providers[0]).toMatchObject({
      roleLabel: "Lead orchestrator",
      statusLabel: "Connected",
      model: "openai/gpt-main",
      auth: { modeLabel: "OAuth", healthLabel: "Healthy" },
      routable: { enabled: 2, catalog: 3, label: "2 of 3" },
      planLabel: "Pro",
      stale: false,
    });
    expect(view.providers[1]).toMatchObject({
      roleLabel: "Subagent",
      auth: { healthLabel: "Expiring", expiryLabel: "2d" },
      routable: { enabled: 1, catalog: 2, label: "1 of 2" },
    });
    expect(view.providers[2]).toMatchObject({
      status: "not_connected",
      statusLabel: "Not connected",
      routable: { enabled: 0, catalog: 4, label: "4 advertised" },
      primaryActionLabel: "Connect Anthropic",
    });
  });

  it("surfaces only expiring and expired auth among otherwise connected providers", () => {
    const current = snapshot({
      providerCatalog: [catalog("ok"), catalog("static"), catalog("expiring"), catalog("expired")],
      providerConnections: [
        connection("ok", { authHealth: "ok" }),
        connection("static", { authHealth: "static", connectedAuthMode: "api_key" }),
        connection("expiring", { authHealth: "expiring", expiryLabel: "in 3h" }),
        connection("expired", { authHealth: "expired", expiryLabel: "expired" }),
      ],
      orchestrator: {
        ...snapshot().orchestrator,
        orchestratorModel: null,
        orchestratorProviderId: null,
      },
    });

    const view = buildModelsPageViewModel(pageData(current), liveContext);

    expect(view.attentionItems.map((item) => item.providerId)).toEqual(["expired", "expiring"]);
    expect(view.attentionItems.map((item) => item.actionLabel)).toEqual([
      "Re-authorize",
      "Re-authorize",
    ]);
    expect(view.attentionItems[1]?.title).toBe("Expiring authorization expires in 3h");
    expect(view.attentionItems.every((item) => item.href === "/connections/providers")).toBe(true);
  });

  it("also surfaces coarse needs-attention and pending states without treating healthy auth as risk", () => {
    const current = snapshot({
      providerCatalog: [catalog("failing"), catalog("pending"), catalog("healthy")],
      providerConnections: [
        connection("failing", { status: "needs_attention", authHealth: "missing" }),
        connection("healthy", { authHealth: "ok" }),
      ],
      pendingDeviceFlows: [
        {
          flowId: "flow-pending",
          kind: "model_provider",
          providerId: "pending",
          authChoiceId: "pending-oauth",
          verificationUri: "https://example.com/device",
          userCode: "ABCD-EFGH",
          expiresAt: "2026-07-21T00:05:00.000Z",
          intervalSeconds: 5,
        },
      ],
      orchestrator: {
        ...snapshot().orchestrator,
        orchestratorModel: null,
        orchestratorProviderId: null,
      },
    });

    const view = buildModelsPageViewModel(pageData(current), liveContext);

    expect(view.attentionItems.map((item) => item.providerId)).toEqual(["failing", "pending"]);
    expect(view.attentionItems.map((item) => item.actionLabel)).toEqual(["Manage", "Manage"]);
  });

  it("distinguishes not-configured, unavailable retained evidence, stale, and live", () => {
    const notConfigured = buildModelsPageViewModel(pageData(snapshot(), false), liveContext);
    const unavailableSnapshot = snapshot({
      gateway: { ...snapshot().gateway, status: "unavailable" },
    });
    const unavailable = buildModelsPageViewModel(pageData(unavailableSnapshot), liveContext);
    const stale = buildModelsPageViewModel(pageData(), {
      ...liveContext,
      evaluatedAt: "2026-07-21T00:05:00.001Z",
    });

    expect(notConfigured).toMatchObject({
      availability: "not-configured",
      stateTitle: "Models data isn't set up",
      providers: [],
    });
    expect(unavailable).toMatchObject({
      availability: "unavailable",
      stateTitle: "Current models data is unavailable",
      lastKnownGood: true,
    });
    expect(unavailable.providers[0]).toMatchObject({
      statusLabel: "Last known connected",
      stale: true,
    });
    expect(unavailable.glance.connected).toBeNull();
    expect(stale).toMatchObject({ availability: "stale", lastKnownGood: true });
    expect(stale.providers[0]).toMatchObject({
      statusLabel: "Last known connected",
      stale: true,
    });
  });

  it("keeps empty and absent catalogs honest and excludes raw secret-bearing source fields", () => {
    const current = snapshot();
    const projected = projectProviderConnections(current);
    const subject: ConnectionsPageData = {
      ...pageData(current),
      providers: projected.map((provider) => {
        if (provider.id !== "zai") return provider;
        const withoutCatalog = { ...provider };
        delete withoutCatalog.catalogModels;
        delete withoutCatalog.catalogModelCount;
        return withoutCatalog;
      }),
    };

    const view = buildModelsPageViewModel(subject, liveContext);
    const serialized = JSON.stringify(view);

    expect(view.providers.find((provider) => provider.id === "zai")?.routable).toMatchObject({
      catalog: null,
      label: "Catalog unknown",
    });
    expect(view.providers.find((provider) => provider.id === "anthropic")?.routable).toMatchObject({
      enabled: 0,
      catalog: 4,
      label: "4 advertised",
    });
    expect(serialized).not.toContain("sk-browser-must-never-see-this");
    expect(serialized).not.toContain("also-secret");
    expect(serialized).not.toContain("secret:scope");
    expect(serialized).not.toContain("accountLabel");
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("scopes");
  });
});
