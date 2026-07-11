import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ConnectionsError from "../app/(app)/connections/error";
import ConnectionsLoading from "../app/(app)/connections/loading";
import { ModelProvidersPanel } from "../components/connections/model-providers-panel";
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

function provider(overrides: Partial<ProviderRow> & Pick<ProviderRow, "id" | "label">): ProviderRow {
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
  it("renders provider states with host roles and repair guidance", () => {
    const html = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
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
    expect(html).toContain("Credential expired. Fix: reconnect the account or rotate the credential.");
    expect(html).toContain("Available to connect.");
  });

  it("renders distinct empty copy for active and unavailable gateways", () => {
    const activeHtml = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "active",
        providers: [],
        summary: emptySummary,
      }),
    );
    const unavailableHtml = renderToStaticMarkup(
      createElement(ModelProvidersPanel, {
        gatewayStatus: "unavailable",
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
