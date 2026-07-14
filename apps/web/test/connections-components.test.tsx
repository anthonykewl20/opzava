import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ConnectionsError from "../app/(app)/connections/error";
import ConnectionsLoading from "../app/(app)/connections/loading";
import { ConnectionsOverview } from "../components/connections/connections-overview";
import { HealthBar } from "../components/connections/health-bar";
import { ModelProvidersPanel } from "../components/connections/model-providers-panel";
import { overviewHealthGroups, overviewProviders } from "../lib/connections-overview";
import type { ConnectionsPageData } from "../lib/connections";

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

type ProviderRow = ConnectionsPageData["providers"][number];

const emptySummary: ConnectionsPageData["providerSummary"] = {
  total: 0,
  available: 0,
  connected: 0,
  needsAttention: 0,
  pending: 0,
  notConnected: 0,
};

function provider(
  overrides: Partial<ProviderRow> & Pick<ProviderRow, "id" | "label">,
): ProviderRow {
  return {
    connectionProviderId: overrides.id,
    vendor: overrides.label,
    status: "not_connected",
    statusLabel: "Not connected",
    statusClassName: "dot",
    authSummary: "API key",
    primaryAuthChoice: null,
    apiKeyChoices: [
      {
        id: `${overrides.id}-api-key`,
        label: "API key",
        mode: "api-key",
        providerId: overrides.id,
      },
    ],
    deviceFlowChoices: [],
    roleLabel: "Subagent",
    model: null,
    runtimeLabels: [],
    models: [{ id: `${overrides.id}/default`, label: `${overrides.label} default` }],
    authHealth: null,
    expiryLabel: null,
    planLabel: null,
    connectedAuthMode: null,
    accountLabel: null,
    usageLabel: null,
    message: null,
    strength: "Gateway-advertised provider",
    whenToUse: "Use when this connected model is appropriate.",
    pendingFlow: null,
    tier: "frontier",
    tierLabel: "Frontier",
    ...overrides,
  };
}

describe("Connections components", () => {
  it("renders orchestrator re-election as a separate non-blocking phase", () => {
    const runningHtml = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        providers: [],
        summary: emptySummary,
        orchestratorReconcile: {
          status: "running",
          reason: "disconnect",
          providerId: "anthropic",
          startedAt: "2026-07-14T00:00:00.000Z",
        },
      }),
    );
    const failedHtml = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        providers: [],
        summary: emptySummary,
        orchestratorReconcile: {
          status: "failed",
          reason: "disconnect",
          providerId: "anthropic",
          message: "Gateway rejected the orchestrator patch.",
          startedAt: "2026-07-14T00:00:00.000Z",
        },
      }),
    );

    expect(runningHtml).toContain("Re-electing the main orchestrator - this can take a minute.");
    expect(runningHtml).toContain('role="status"');
    expect(failedHtml).toContain("Main orchestrator re-election failed");
    expect(failedHtml).toContain("may still point to a disconnected provider");
    expect(failedHtml).toContain("Gateway rejected the orchestrator patch.");
    expect(failedHtml).toContain('role="alert"');
  });

  it("renders honest health counts and keeps not-checked components neutral", () => {
    const html = renderToStaticMarkup(
      createElement(HealthBar, { healthy: 2, attention: 1, notChecked: 1 }),
    );
    const unknownHtml = renderToStaticMarkup(
      createElement(HealthBar, { healthy: 0, attention: 0, notChecked: 3 }),
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="2 healthy, 1 needs attention, 1 not checked"');
    expect(html).toContain('data-health-segment="not-checked"');
    expect(html).toContain("border-dashed");
    expect(unknownHtml).toContain('aria-label="0 healthy, 0 need attention, 3 not checked"');
    expect(unknownHtml).not.toContain('data-health-segment="attention"');
  });

  it("groups health facts into linked System Core, Channels, and Agents summaries", () => {
    const groups = overviewHealthGroups([
      healthComponent("gateway", "gateway", "healthy"),
      healthComponent("plugins", "plugins", "healthy"),
      healthComponent("channel:slack", "channel", "attention"),
      healthComponent("agent:writer", "agent", "not_checked"),
    ]);

    expect(groups).toEqual([
      expect.objectContaining({ label: "System Core", healthy: 2, total: 2, status: "healthy" }),
      expect.objectContaining({ label: "Channels", healthy: 0, total: 1, status: "attention" }),
      expect.objectContaining({ label: "Agents", healthy: 0, total: 1, status: "unknown" }),
    ]);
    expect(groups.every((group) => group.href === "/connections/system")).toBe(true);
  });

  it("orders useful provider rows by attention, connected, then available suggestion", () => {
    const rows = overviewProviders([
      provider({ id: "zai", label: "z.ai", status: "not_connected" }),
      provider({ id: "openai", label: "OpenAI", status: "connected", authHealth: "ok" }),
      provider({
        id: "anthropic",
        label: "Anthropic",
        status: "connected",
        authHealth: "expiring",
      }),
      provider({
        id: "openrouter",
        label: "OpenRouter",
        status: "needs_attention",
        authHealth: "expired",
      }),
      provider({ id: "qwen", label: "Qwen", status: "not_connected" }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["openrouter", "anthropic", "openai", "qwen"]);
    expect(rows.map((row) => row.actionLabel)).toEqual(["Fix", "Manage", "Manage", "Setup"]);
    expect(rows.find((row) => row.id === "openai")?.authLabel).toBe("API key");
  });

  it("renders the two-panel Overview contract with warnings separate from failures", () => {
    const data = overviewData({
      openclawHealth: {
        components: [
          healthComponent("gateway", "gateway", "healthy"),
          healthComponent("channel:slack", "channel", "attention"),
          healthComponent("agent:writer", "agent", "not_checked"),
        ],
        warnings: [{ id: "pricing", label: "Pricing", detail: "Pricing refresh failed." }],
        runtime: {
          version: "2026.7.1",
          uptimeMs: 65_000,
          hostUptimeMs: null,
          updateAvailable: null,
        },
        sessions: { count: 2, recent: [] },
        checkedAt: "2026-07-14T00:00:00.000Z",
        lastKnownHealthy: null,
      },
    });
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data,
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain("System health");
    expect(html).toContain('<h2 id="system-health-title"');
    expect(html).toContain('<h2 id="gateway-card-title"');
    expect(html).toContain('data-health-status="attention"');
    expect(html).toContain('data-health-attention-count="1"');
    expect(html).toContain('data-health-checked-at="2026-07-14T00:00:00.000Z"');
    expect(html).toContain('href="/connections/system"');
    expect(html).toContain("Pricing refresh failed.");
    expect(html).toContain("Health warning");
    expect(html).toContain("View details");
    expect(html).toContain("Opzava Gateway");
    expect(html).toContain("Model Providers");
    expect(html).toContain("Third-Party Integrations");
    expect(html).toContain("Run health check");
    expect(html).toContain("Version");
    expect(html).toContain("2026.7.1");
    expect(html).not.toContain("Host uptime");
    expect(html).not.toContain("Active connections handled");
    expect(html).not.toContain('href="/connections/gateway"');
  });

  it("renders prioritized provider status and auth facts as stable row metadata", () => {
    const base = overviewData();
    const data: ConnectionsPageData = {
      ...base,
      providers: [
        provider({
          id: "openrouter",
          label: "OpenRouter",
          status: "needs_attention",
          authHealth: "expired",
        }),
      ],
      providerSummary: {
        total: 1,
        connected: 0,
        available: 1,
        needsAttention: 1,
        pending: 0,
        notConnected: 0,
      },
    };
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data,
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain('data-provider-id="openrouter"');
    expect(html).toContain('data-provider-status="needs_attention"');
    expect(html).toContain('data-provider-auth-health="expired"');
    expect(html).toContain("Credential expired");
    expect(html).toContain("Credential expired · API key");
    expect(html).toContain(">Fix</a>");
  });

  it("never presents an unprobed system as zero-percent unhealthy", () => {
    const data = overviewData({
      openclawHealth: {
        components: [healthComponent("agent:writer", "agent", "not_checked")],
        warnings: [],
        runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
        sessions: { count: null, recent: [] },
        checkedAt: null,
        lastKnownHealthy: null,
      },
    });
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data,
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain('data-health-status="unknown"');
    expect(html).toContain("System health is not fully checked");
    expect(html).toContain("No health percentage is available");
    expect(html).not.toContain("healthy (0%)");
    expect(html).not.toContain("View details");
  });

  it("renders only real GitHub integration states", () => {
    const emptyHtml = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData(),
        refreshAction: async () => undefined,
      }),
    );
    const connectedHtml = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData({
          github: {
            status: "connected",
            accountLabel: "opzava-bot",
            scopes: ["repo"],
            repository: "anthonykewl20/opzava",
            lastCheckedAt: "2026-07-14T00:00:00.000Z",
            message: null,
          },
        }),
        refreshAction: async () => undefined,
      }),
    );

    expect(emptyHtml).toContain("No integrations connected");
    expect(emptyHtml).toContain("Add integration");
    expect(emptyHtml).not.toContain("Slack");
    expect(connectedHtml).toContain("GitHub");
    expect(connectedHtml).toContain("Connected");
    expect(connectedHtml).toContain("anthonykewl20/opzava");
    expect(connectedHtml).toContain('href="/connections/github"');
    expect(connectedHtml).not.toContain("integration-logo-strip");
  });

  it("renders provider states with host roles and repair guidance", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "openai",
            label: "OpenAI / Codex",
            status: "connected",
            statusLabel: "Connected",
            roleLabel: "Lead orchestrator",
            model: "openai/gpt-5.5",
            connectedAuthMode: "oauth",
          }),
          provider({
            id: "zai",
            label: "z.ai / GLM",
            status: "connected",
            statusLabel: "Connected",
            roleLabel: "Subagent",
            model: "zai/glm-5.2",
            connectedAuthMode: "api_key",
          }),
          provider({
            id: "openrouter",
            label: "OpenRouter",
            status: "needs_attention",
            statusLabel: "Needs attention",
            authHealth: "expired",
            message: "Credential expired.",
          }),
          provider({ id: "qwen", label: "Alibaba / Qwen" }),
        ],
        summary: {
          total: 4,
          available: 2,
          connected: 2,
          needsAttention: 1,
          pending: 0,
          notConnected: 1,
        },
      }),
    );

    expect(html).toContain("LEAD ORCHESTRATOR");
    expect(html).toContain("SUBAGENT");
    expect(html).toContain("Needs attention");
    expect(html).toContain(
      "Credential expired. Fix: reconnect the account or rotate the credential.",
    );
    expect(html).toContain("Available to connect.");
  });

  it("hides credential-looking provider account labels", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "anthropic",
            label: "Anthropic",
            status: "connected",
            statusLabel: "Connected",
            accountLabel: "anthropic:default=token:sk-ant-o...securely",
          }),
          provider({
            id: "claude",
            label: "Claude",
            status: "connected",
            statusLabel: "Connected",
            accountLabel: "Claude Max",
          }),
        ],
        summary: {
          total: 2,
          available: 0,
          connected: 2,
          needsAttention: 0,
          pending: 0,
          notConnected: 0,
        },
      }),
    );

    expect(html).not.toContain("anthropic:default=token:sk-ant-o...securely");
    expect(html).toContain("Claude Max");
  });

  it("renders connected row actions as a menu while keeping available connect visible", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "openai",
            label: "OpenAI / Codex",
            status: "connected",
            statusLabel: "Connected",
            roleLabel: "Lead orchestrator",
            connectedAuthMode: "oauth",
          }),
          provider({
            id: "zai",
            label: "z.ai / GLM",
            status: "connected",
            statusLabel: "Connected",
            roleLabel: "Subagent",
            connectedAuthMode: "api_key",
          }),
          provider({ id: "qwen", label: "Alibaba / Qwen" }),
        ],
        summary: {
          total: 3,
          available: 3,
          connected: 2,
          needsAttention: 0,
          pending: 0,
          notConnected: 1,
        },
      }),
    );

    expect(html).toContain('aria-label="Row actions for OpenAI / Codex"');
    expect(html).toContain('aria-label="Row actions for z.ai / GLM"');
    expect(html).not.toContain('aria-label="Row actions for Alibaba / Qwen"');
    expect(html).toContain("Main orchestrator");
    expect(html).toMatch(/<button[^>]*>Connect<\/button>/);
  });

  it("does not expose set-main copy for the current lead row", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "openai",
            label: "OpenAI / Codex",
            status: "connected",
            statusLabel: "Connected",
            roleLabel: "Lead orchestrator",
            connectedAuthMode: "oauth",
          }),
        ],
        summary: {
          total: 1,
          available: 1,
          connected: 1,
          needsAttention: 0,
          pending: 0,
          notConnected: 0,
        },
      }),
    );

    expect(html).toContain("Main orchestrator");
    expect(html).not.toContain("Set as main orchestrator");
  });

  it("renders distinct empty copy for active and unavailable gateways", () => {
    const activeHtml = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [],
        summary: emptySummary,
      }),
    );
    const unavailableHtml = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "unavailable",
        orchestratorReconcile: { status: "idle" },
        providers: [],
        summary: emptySummary,
      }),
    );

    expect(activeHtml).toContain("No model providers in the live catalog");
    expect(unavailableHtml).toContain("Gateway unavailable - retrying automatically");
    expect(unavailableHtml).toContain("This is not a zero-provider configuration.");
  });

  it("renders loading and actionable error states", () => {
    const loadingHtml = renderToStaticMarkup(createElement(ConnectionsLoading));
    const errorHtml = renderToStaticMarkup(
      createElement(ConnectionsError, {
        error: new Error("worker failed token=secret-value sk-live-secret"),
        reset: () => undefined,
      }),
    );

    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain('data-slot="skeleton"');
    expect(errorHtml).toContain("Connections could not load");
    expect(errorHtml).toContain("Retry");
    expect(errorHtml).toContain("token=[redacted]");
    expect(errorHtml).not.toContain("secret-value");
    expect(errorHtml).not.toContain("sk-live-secret");
  });
});

function healthComponent(
  id: string,
  kind: ConnectionsPageData["snapshot"]["openclawHealth"]["components"][number]["kind"],
  status: ConnectionsPageData["snapshot"]["openclawHealth"]["components"][number]["status"],
): ConnectionsPageData["snapshot"]["openclawHealth"]["components"][number] {
  return { id, kind, label: id, status, detail: null, lastCheckedAt: "2026-07-14T00:00:00.000Z" };
}

function overviewData(
  overrides: Partial<ConnectionsPageData["snapshot"]> = {},
): ConnectionsPageData {
  return {
    snapshot: {
      gateway: {
        status: "active",
        region: "local",
        authLabel: "operator.admin",
        lastHeartbeatAt: "2026-07-14T00:00:00.000Z",
        message: null,
      },
      openclawHealth: {
        components: [healthComponent("gateway", "gateway", "healthy")],
        warnings: [],
        runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
        sessions: { count: null, recent: [] },
        checkedAt: "2026-07-14T00:00:00.000Z",
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
        orchestratorProviderId: null,
        reconcile: { status: "idle" },
        delegationMode: "prefer",
        allowAgents: [],
        subagents: [],
        toolPolicyExpansion: {
          allow: ["sessions_spawn", "subagents", "group:sessions"],
          receiptId: null,
        },
        updatedAt: null,
      },
      refreshedAt: "2026-07-14T00:00:00.000Z",
      ...overrides,
    },
    providerSummary: emptySummary,
    providers: [],
    githubSummary: "Not connected",
    provisioningAvailable: true,
  };
}
