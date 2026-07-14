import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ConnectionsSystemStatus } from "../components/connections/connections-system-status";
import type { ConnectionsPageData } from "../lib/connections";

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

type Health = ConnectionsPageData["snapshot"]["openclawHealth"];
type Component = Health["components"][number];
type ProviderCatalog = ConnectionsPageData["snapshot"]["providerCatalog"];

function component(
  id: string,
  kind: Component["kind"],
  status: Component["status"],
  detail: string | null = `${id} detail`,
): Component {
  return {
    id,
    kind,
    label: id,
    status,
    detail,
    lastCheckedAt: "2026-07-14T00:00:00.000Z",
  };
}

function data(openclawHealth: Health, providerCatalog: ProviderCatalog = []): ConnectionsPageData {
  return {
    snapshot: {
      gateway: {
        status: "active",
        region: "fra1",
        authLabel: "JIT operator.admin",
        lastHeartbeatAt: "2026-07-14T00:00:00.000Z",
        message: "Gateway is serving admin reads.",
      },
      openclawHealth,
      providerCatalog,
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
    githubSummary: "Not connected",
    provisioningAvailable: true,
  };
}

function render(health: Health, providerCatalog: ProviderCatalog = []): string {
  return renderToStaticMarkup(
    createElement(ConnectionsSystemStatus, {
      data: data(health, providerCatalog),
      refreshAction: async () => undefined,
    }),
  );
}

function health(overrides: Partial<Health> = {}): Health {
  return {
    components: [
      component("Gateway", "gateway", "healthy"),
      component("Event loop", "event-loop", "healthy"),
      component("Plugins", "plugins", "healthy"),
      component("Context engines", "context-engines", "healthy"),
      component("Slack", "channel", "healthy"),
      component("Writer", "agent", "healthy"),
    ],
    warnings: [],
    runtime: {
      version: "2026.7.1",
      uptimeMs: 65_000,
      hostUptimeMs: null,
      updateAvailable: {
        currentVersion: "2026.7.1",
        latestVersion: "2026.7.2",
        channel: "stable",
      },
    },
    sessions: {
      count: 2,
      recent: [
        {
          agentId: "writer",
          updatedAt: "2026-07-14T00:00:00.000Z",
          ageMs: 5_000,
        },
      ],
    },
    checkedAt: "2026-07-14T00:00:00.000Z",
    lastKnownHealthy: null,
    ...overrides,
  };
}

describe("Connections System status", () => {
  it("renders healthy, attention, and not-checked states without painting unknown as failure", () => {
    const healthyHtml = render(health());
    const attentionHtml = render(
      health({ components: [component("Gateway", "gateway", "attention", "Lag observed.")] }),
    );
    const unknownHtml = render(
      health({
        components: [component("Gateway", "gateway", "not_checked", "Probe unavailable.")],
        checkedAt: null,
      }),
    );

    expect(healthyHtml).toContain('data-health-status="healthy"');
    expect(healthyHtml).toContain("All systems healthy");
    expect(attentionHtml).toContain('data-health-status="attention"');
    expect(attentionHtml).toContain("needs attention");
    expect(attentionHtml).toContain("border-amber");
    expect(unknownHtml).toContain('data-health-status="unknown"');
    expect(unknownHtml).toContain("Health not fully checked");
    expect(unknownHtml).toContain("border-dashed");
    expect(unknownHtml).toContain('data-component-status="not_checked"');
    expect(unknownHtml).not.toContain("border-amber");
    expect(unknownHtml).not.toContain("text-red");
  });

  it("groups exact component kinds and represents missing groups honestly", () => {
    const html = render(health({ components: [component("Gateway", "gateway", "healthy")] }));

    expect(html).toContain("System Core");
    expect(html).toContain("Channels");
    expect(html).toContain("Agents");
    expect(html).toContain("No channel components were reported.");
    expect(html).toContain("No agent components were reported.");
    expect(html).toMatch(
      /<section[^>]*id="system-group-system-core"[^>]*aria-labelledby="system-group-system-core-heading"[^>]*class="scroll-mt-24"/,
    );
    expect(html).toMatch(
      /<section[^>]*id="system-group-channels"[^>]*aria-labelledby="system-group-channels-heading"[^>]*class="scroll-mt-24"/,
    );
    expect(html).toMatch(
      /<section[^>]*id="system-group-agents"[^>]*aria-labelledby="system-group-agents-heading"[^>]*class="scroll-mt-24"/,
    );
    expect(html).toContain('id="system-group-system-core-heading"');
    expect(html).toContain('id="system-group-channels-heading"');
    expect(html).toContain('id="system-group-agents-heading"');
  });

  it("keeps warnings separate from component failures", () => {
    const html = render(
      health({
        warnings: [{ id: "pricing", label: "Pricing", detail: "Pricing refresh failed." }],
      }),
    );

    expect(html).toContain("Health warning");
    expect(html).toContain("Pricing refresh failed.");
    expect(html).toContain('data-health-status="healthy"');
    expect(html).not.toContain('data-component-id="pricing"');
  });

  it("renders exact accordion sections and only the session allowlist", () => {
    const html = render(health());

    expect(html).toContain(">Sessions<");
    expect(html).toContain(">Gateway detail<");
    expect(html).toContain(">Runtime<");
    expect(html).toContain("writer");
    expect(html).toContain("Agent");
    expect(html).toContain("Updated");
    expect(html).toContain("Age");
    expect(html).toContain("2026.7.2");
    expect(html).toContain("stable");
    expect(html).not.toMatch(/session key|raw path|prompt|model/i);
    expect(html).toContain("Host uptime");
    expect(html).toContain("Not reported");
  });

  it("renders the exact live provider catalog count in Gateway detail", () => {
    const catalog: ProviderCatalog = [
      {
        id: "openai",
        label: "OpenAI",
        vendor: "OpenAI",
        authChoices: [],
        suggestedModel: "openai/gpt-5.5",
        roleStrength: "orchestration",
        whenToUse: "Lead orchestration",
      },
      {
        id: "zai",
        label: "z.ai",
        vendor: "z.ai",
        authChoices: [],
        suggestedModel: "zai/glm-5.2",
        roleStrength: "implementation",
        whenToUse: "Implementation",
      },
    ];
    const html = render(health(), catalog);

    expect(html).toContain("Provider catalog");
    expect(html).toContain("2 providers advertised");
  });

  it("renders every Runtime DTO fact honestly when all values are null", () => {
    const html = render(
      health({
        runtime: {
          version: null,
          uptimeMs: null,
          hostUptimeMs: null,
          updateAvailable: null,
        },
      }),
    );

    expect(html).toContain("Version");
    expect(html).toContain("Gateway uptime");
    expect(html).toContain("Host uptime");
    expect(html).toContain("Update available");
    expect(html.match(/Not reported/g)).toHaveLength(3);
    expect(html).toContain("Not checked");
  });

  it("renders partial and empty session facts without inventing rows", () => {
    const partial = render(
      health({ sessions: { count: 3, recent: [{ agentId: null, updatedAt: null, ageMs: null }] } }),
    );
    const empty = render(health({ sessions: { count: null, recent: [] } }));

    expect(partial).toContain("3 sessions reported");
    expect(partial).toContain("Not reported");
    expect(empty).toContain("Session count was not reported.");
    expect(empty).toContain("No recent session details were reported.");
  });

  it("exposes exact checked-at metadata and the Connections breadcrumb", () => {
    const html = render(health());

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/connections"');
    expect(html).toContain("System status");
    expect(html).toContain('data-health-checked-at="2026-07-14T00:00:00.000Z"');
    expect(html).toContain('dateTime="2026-07-14T00:00:00.000Z"');
    expect(html).toContain("Run health check");
  });
});
