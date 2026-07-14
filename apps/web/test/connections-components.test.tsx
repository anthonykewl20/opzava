import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ConnectionsError from "../app/(app)/connections/error";
import ConnectionsLoading from "../app/(app)/connections/loading";
import { ConnectionsOverview } from "../components/connections/connections-overview";
import { HealthStatusBreakdown } from "../components/connections/health-status-breakdown";
import { ModelProvidersPanel } from "../components/connections/model-providers-panel";
import { ProviderConnectedActions } from "../components/connections/provider-card";
import { DisconnectConfirm } from "../components/connections/provider-disconnect-confirm";
import { SetMainOrchestratorConfirm } from "../components/connections/provider-set-main-confirm";
import {
  overviewHealthGroups,
  overviewIntegrations,
  overviewProviders,
} from "../lib/connections-overview";
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

  it("renders an explicit three-state health breakdown without progress semantics", () => {
    const html = renderToStaticMarkup(
      createElement(HealthStatusBreakdown, { healthy: 2, attention: 1, notChecked: 1 }),
    );
    const unknownHtml = renderToStaticMarkup(
      createElement(HealthStatusBreakdown, { healthy: 0, attention: 0, notChecked: 3 }),
    );

    expect(html).toContain('<dl data-health-breakdown="true"');
    expect(html).toContain('data-health-state="healthy"');
    expect(html).toContain('data-health-state="attention"');
    expect(html).toContain('data-health-state="not-checked"');
    expect(html).toContain(">Healthy<");
    expect(html).toContain(">Needs attention<");
    expect(html).toContain(">Not checked<");
    expect(html).toContain(">2<");
    expect(html).toContain(">1<");
    expect(html).toContain("Probe succeeded");
    expect(html).toContain("Reported a problem");
    expect(html).toContain("No probe result");
    expect(html).toContain("border-[var(--warning)] bg-[var(--warning-soft)]");
    expect(html).not.toContain("bg-warning/5");
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("%");
    expect(unknownHtml).toContain('data-health-state-count="3"');
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
    expect(groups.map((group) => group.href)).toEqual([
      "/connections/system#system-group-system-core",
      "/connections/system#system-group-channels",
      "/connections/system#system-group-agents",
    ]);
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
    expect(html).toContain('aria-label="System Core: 1 healthy, 0 need attention, 0 not checked"');
    expect(html).toContain('aria-label="Channels: 0 healthy, 1 needs attention, 0 not checked"');
    expect(html).toContain('aria-label="Agents: 0 healthy, 0 need attention, 1 not checked"');
    expect(html).toContain("1 needs attention");
    expect(html).toContain("1 not checked");
    expect(html).toContain("1 component not checked");
    expect(html).toContain("Unknown does not mean failed");
    expect(html).toContain('href="/connections/system#system-group-agents"');
    expect(html).toContain("Agents: 1 not checked");
    const channelsPill = html.match(/<a[^>]*data-health-group="channels"[^>]*>/)?.[0];
    expect(channelsPill).toContain('data-slot="button"');
    expect(html).toContain(">Refresh</button>");
    expect(html).toContain("Pricing refresh failed.");
    expect(html).toContain("Health warning");
    expect(html).toContain("Inspect channel");
    expect(html).toContain("Opzava Gateway");
    expect(html).toContain("Opzava reports agent schedule configuration");
    expect(html).not.toContain("OpenClaw");
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
    expect(html).toContain('data-provider-icon="brand"');
    expect(html).toContain('data-provider-brand="openrouter"');
    expect(html).not.toContain('data-provider-icon="generic"');
    expect(html).not.toContain("lucide-sparkles");
    expect(html).toContain(">Fix</a>");
  });

  it("shows the first affected component detail without inventing a repair action", () => {
    const first = {
      ...healthComponent("channel:slack", "channel", "attention"),
      label: "Slack workspace",
      detail: "Probe timed out after 5 seconds.",
    };
    const second = {
      ...healthComponent("plugins", "plugins", "attention"),
      label: "Plugins",
      detail: "One plugin failed to load.",
    };
    const data = overviewData({
      openclawHealth: {
        components: [first, second],
        warnings: [],
        runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
        sessions: { count: null, recent: [] },
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

    expect(html).toContain("Slack workspace");
    expect(html).toContain("Probe timed out after 5 seconds.");
    expect(html).toContain("and 1 more component");
    expect(html).toContain("Inspect channel");
    expect(html).toContain("No repair metadata is available for this component.");
    expect(html).toContain('data-slot="alert"');
    expect(html).not.toContain(">Fix</a>");
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
    expect(html).not.toContain("Opzava unreachable");
    expect(html).toContain(
      "0 components healthy. 0 components need attention. 1 component not checked.",
    );
    expect(html).not.toContain("healthy (0%)");
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("View details");
  });

  it("explains configured agents without claiming Refresh can obtain liveness", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData({
          openclawHealth: {
            components: [
              healthComponent("research-worker", "agent", "not_checked"),
              healthComponent("qa-agent", "agent", "not_checked"),
              healthComponent("release-coordinator", "agent", "not_checked"),
            ],
            warnings: [],
            runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
            sessions: { count: null, recent: [] },
            checkedAt: "2026-07-14T00:00:00.000Z",
            lastKnownHealthy: null,
          },
        }),
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain("3 components not checked");
    expect(html).toContain("Agents: 3 not checked");
    expect(html).toContain(
      "Opzava reports agent schedule configuration but does not expose a live liveness result for those agents.",
    );
    expect(html).toContain("Unknown does not mean failed.");
    expect(html).not.toContain("Refresh retries the missing probe");
    expect(html).not.toContain("Refresh retries available probes");
    expect(html).not.toContain("subagent-zai");
  });

  it("separates retryable probes from unavailable agent liveness in a mixed unknown state", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData({
          openclawHealth: {
            components: [
              healthComponent("channel:matrix", "channel", "not_checked"),
              healthComponent("research-worker", "agent", "not_checked"),
            ],
            warnings: [],
            runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
            sessions: { count: null, recent: [] },
            checkedAt: "2026-07-14T00:00:00.000Z",
            lastKnownHealthy: null,
          },
        }),
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain("Channels: 1 not checked");
    expect(html).toContain("Agents: 1 not checked");
    expect(html).toContain(
      "Opzava reports agent schedule configuration but does not expose a live liveness result for those agents.",
    );
    expect(html).toContain(
      "Refresh retries available probes while agent liveness may remain unavailable.",
    );
    expect(html).not.toContain("Refresh retries the missing probe");
  });

  it("keeps last-known-good aggregate separate when the live Gateway is unavailable", () => {
    const data = overviewData({
      gateway: {
        status: "unavailable",
        region: null,
        authLabel: "Opzava Gateway unavailable",
        lastHeartbeatAt: null,
        message: "Gateway could not be reached.",
      },
      openclawHealth: {
        components: [healthComponent("gateway", "gateway", "not_checked")],
        warnings: [],
        runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
        sessions: { count: null, recent: [] },
        checkedAt: null,
        lastKnownHealthy: {
          checkedAt: "2026-07-13T23:59:00.000Z",
          healthy: 8,
          total: 8,
        },
      },
    });
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data,
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain("Opzava unreachable");
    expect(html).not.toContain("System health is not fully checked");
    expect(html).toContain("The Gateway is unavailable");
    expect(html).toContain("Opzava will retry automatically");
    expect(html).not.toContain("OpenClaw");
    expect(html).toContain("Refresh retries the missing probe");
    expect(html).toContain("Last known fully healthy snapshot");
    expect(html).toContain("8 of 8 components healthy");
    expect(html).toContain('data-last-known-checked-at="2026-07-13T23:59:00.000Z"');
    expect(html).not.toContain("healthy (0%)");
  });

  it("uses direct healthy and empty-group wording", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData(),
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain(
      "1 component healthy. 0 components need attention. 0 components not checked.",
    );
    expect(html).toContain("All systems healthy");
    expect(html).toContain("1 healthy");
    expect(html).toContain("No channels reported");
    expect(html).toContain("No agents reported");
    expect(html).toContain('aria-label="Channels: No channels reported"');
    expect(html).toContain('aria-label="Agents: No agents reported"');
    expect(html).not.toContain('aria-label="Channels: 0 healthy, 0 need attention, 0 not checked"');
    expect(html).not.toContain('aria-label="Agents: 0 healthy, 0 need attention, 0 not checked"');
    expect(html).not.toContain("component not checked");
  });

  it("shows every nonzero state in a mixed group summary", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData({
          openclawHealth: {
            components: [
              healthComponent("channel:slack", "channel", "healthy"),
              healthComponent("channel:whatsapp", "channel", "attention"),
              healthComponent("channel:telegram", "channel", "not_checked"),
            ],
            warnings: [],
            runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
            sessions: { count: null, recent: [] },
            checkedAt: "2026-07-14T00:00:00.000Z",
            lastKnownHealthy: null,
          },
        }),
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain("1 healthy · 1 needs attention · 1 not checked");
    expect(html).toContain('aria-label="Channels: 1 healthy, 1 needs attention, 1 not checked"');
    expect(html).toContain('href="/connections/system#system-group-channels"');
    expect(html).toContain("Channels: 1 not checked");
    expect(html).toContain(
      "One or more live probes returned no result. No live result means unknown, not failed. Refresh retries the missing probe.",
    );
    expect(html.indexOf("channel:whatsapp needs attention")).toBeLessThan(
      html.indexOf('data-health-missing-guidance="true"'),
    );
    // The not-checked notice is informational ("unknown, not failed") — role="status", never an
    // assertive role="alert" (which also reads as an error state to the gate's sweep).
    const missingGuidance = html.match(/<div[^>]*data-health-missing-guidance="true"[^>]*>/)?.[0];
    expect(missingGuidance).toContain('role="status"');
    const channelsLink = html.match(/<a[^>]*data-health-group="channels"[^>]*>/)?.[0];
    expect(channelsLink).toContain("min-w-0");
    expect(channelsLink).toContain("whitespace-normal");
    expect(channelsLink).toContain("text-left");
  });

  it("pluralizes multi-count group and outage guidance without inventing words", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData({
          openclawHealth: {
            components: [
              healthComponent("channel:slack", "channel", "healthy"),
              healthComponent("channel:teams", "channel", "healthy"),
              healthComponent("channel:whatsapp", "channel", "attention"),
              healthComponent("channel:discord", "channel", "attention"),
              healthComponent("channel:telegram", "channel", "not_checked"),
              healthComponent("channel:signal", "channel", "not_checked"),
            ],
            warnings: [],
            runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
            sessions: { count: null, recent: [] },
            checkedAt: "2026-07-14T00:00:00.000Z",
            lastKnownHealthy: null,
          },
        }),
        refreshAction: async () => undefined,
      }),
    );

    expect(html).toContain("2 healthy · 2 need attention · 2 not checked");
    expect(html).toContain("2 components not checked");
    expect(html).toContain("Channels: 2 not checked");
    expect(html).not.toContain("healthys");
    expect(html).not.toContain("not checkeds");
  });

  it("renders only real GitHub integration states", () => {
    const emptyState = overviewData().snapshot.github;
    const connectedState = {
      status: "connected" as const,
      accountLabel: "opzava-bot",
      scopes: ["repo"],
      repository: "anthonykewl20/opzava",
      lastCheckedAt: "2026-07-14T00:00:00.000Z",
      message: null,
    };
    const emptyHtml = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData(),
        refreshAction: async () => undefined,
      }),
    );
    const connectedHtml = renderToStaticMarkup(
      createElement(ConnectionsOverview, {
        data: overviewData({
          github: connectedState,
        }),
        refreshAction: async () => undefined,
      }),
    );

    expect(overviewIntegrations(emptyState)).toEqual([]);
    expect(overviewIntegrations(connectedState)).toEqual([
      expect.objectContaining({ id: "github", label: "GitHub", status: "connected" }),
    ]);

    expect(emptyHtml).toContain("No integrations connected");
    expect(emptyHtml).toContain("Add integration");
    expect(emptyHtml).not.toContain("Slack");
    expect(connectedHtml).toContain("GitHub");
    expect(connectedHtml).toContain("Connected");
    expect(connectedHtml).toContain("anthonykewl20/opzava");
    expect(connectedHtml).toContain('href="/connections/github"');
    expect(connectedHtml).not.toContain("integration-logo-strip");
  });

  it("renders provider cards with host roles, status badges, models, and repair guidance", () => {
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
            enabledModels: [{ id: "openai/gpt-5.5", label: "GPT-5.5" }],
            connectedAuthMode: "oauth",
          }),
          provider({
            id: "zai",
            label: "z.ai / GLM",
            status: "connected",
            statusLabel: "Connected",
            roleLabel: "Subagent",
            model: "zai/glm-5.2",
            enabledModels: [{ id: "zai/glm-5.2", label: "GLM-5.2" }],
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

    expect(html).toContain("Lead orchestrator");
    expect(html).toContain("Subagent");
    expect(html).toContain('data-provider-id="openai"');
    expect(html).toContain('data-provider-status="connected"');
    expect(html).toContain("data-model=");
    expect(html).toContain("Action required");
    expect(html).toContain("Credential expired.");
    expect(html).toContain('data-provider-id="qwen"');
    expect(html).not.toMatch(/data-provider-id="qwen"[\s\S]*Subagent/);
  });

  it("keeps pending device authorization and OpenRouter's model fallback on cards", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "openai",
            label: "OpenAI",
            status: "pending",
            statusLabel: "Waiting for approval",
            pendingFlow: {
              flowId: "flow-1",
              kind: "model_provider",
              providerId: "openai",
              authChoiceId: "openai-device-code",
              verificationUri: "https://example.test/device",
              userCode: "ABCD-EFGH",
              expiresAt: "2099-07-03T00:10:00.000Z",
              intervalSeconds: 2,
            },
          }),
          provider({ id: "openrouter", label: "OpenRouter", models: [], enabledModels: [] }),
        ],
        summary: {
          total: 2,
          available: 2,
          connected: 0,
          needsAttention: 0,
          pending: 1,
          notConnected: 1,
        },
      }),
    );

    expect(html).toContain('data-provider-id="openai"');
    expect(html).toContain('data-provider-status="pending"');
    expect(html).toContain("ABCD-EFGH");
    expect(html).toContain("Routes many");
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

  it("renders visible Manage and connected card menus while keeping available Connect visible", () => {
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
    expect(html).toContain("Lead orchestrator");
    expect(html).toMatch(/<button[^>]*>Manage<\/button>/);
    expect(html).toMatch(/<button[^>]*>Connect<\/button>/);
  });

  it("mounts the extracted disconnect, set-main, and connected-action owners", () => {
    const connectedProvider = provider({
      id: "zai",
      label: "Z.AI (GLM)",
      status: "connected",
      statusLabel: "Connected",
      connectedAuthMode: "api_key",
      roleLabel: "Subagent",
    });
    const disconnectHtml = renderToStaticMarkup(
      createElement(DisconnectConfirm, { provider: connectedProvider }),
    );
    const setMainHtml = renderToStaticMarkup(
      createElement(SetMainOrchestratorConfirm, {
        provider: connectedProvider,
        onSetMainSuccess: () => undefined,
      }),
    );
    const actionsHtml = renderToStaticMarkup(
      createElement(ProviderConnectedActions, {
        provider: connectedProvider,
        canSetMainOrchestrator: true,
        isLeadOrchestrator: false,
        onSetMainOrchestratorSuccess: () => undefined,
      }),
    );

    expect(disconnectHtml).toContain(">Disconnect</button>");
    expect(setMainHtml).toContain(">Set as main orchestrator</button>");
    expect(actionsHtml).toContain(">Manage</button>");
    expect(actionsHtml).toContain('aria-label="Row actions for Z.AI (GLM)"');
  });

  it("disables Connect and explains providers with no live auth method", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "local-only",
            label: "Local only",
            primaryAuthChoice: null,
            apiKeyChoices: [],
            deviceFlowChoices: [],
          }),
        ],
        summary: { ...emptySummary, total: 1, available: 1, notConnected: 1 },
      }),
    );

    expect(html).toContain("No live auth method");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Connect<\/button>/);
  });

  it("disables Fix with copy when a needs-attention provider has no live auth method", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        orchestratorReconcile: { status: "idle" },
        providers: [
          provider({
            id: "moonshot",
            label: "Moonshot (Kimi)",
            status: "needs_attention",
            statusLabel: "Needs attention",
            message: "Credential expired.",
            primaryAuthChoice: null,
            apiKeyChoices: [],
            deviceFlowChoices: [],
          }),
        ],
        summary: { ...emptySummary, total: 1, needsAttention: 1 },
      }),
    );

    // Never an enabled dead Fix, never a stray Connect from the choice-less dialog fallback.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Fix<\/button>/);
    expect(html).toContain("No live auth method");
    expect(html).not.toMatch(/<button[^>]*>Connect<\/button>/);
    expect(html).toContain('aria-label="Row actions for Moonshot (Kimi)"');
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

    expect(html).toContain("Lead orchestrator");
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
    expect(loadingHtml).toContain("Loading current Opzava health and connections");
    expect(loadingHtml).not.toContain("OpenClaw");
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
