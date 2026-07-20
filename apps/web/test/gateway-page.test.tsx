import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GatewayPage } from "../components/gateway/gateway-page";
import type { GatewayPageViewModel } from "../lib/gateway/gateway-view-model";

function view(): GatewayPageViewModel {
  return {
    availability: "live",
    freshnessState: "within-budget",
    freshnessLabel: "Live · checked 12s ago",
    isFreshLive: true,
    connection: {
      statusLabel: "Active",
      tone: "healthy",
      live: true,
      stale: false,
      region: "ap-southeast-1",
      authLabel: "operator.write + approvals",
      heartbeatLabel: "Heartbeat 12s ago",
      retainedLabel: null,
    },
    orchestrator: {
      agentId: "ask-admin-opzava",
      model: "openai/gpt-5.6-sol",
      providerId: "openai",
      providerLabel: "OpenAI",
      delegationMode: "prefer",
      electionLabel: "Current election",
      electionTone: "healthy",
      updatedLabel: "set 2d ago",
      emptyLabel: null,
      toolPolicy: ["sessions_spawn", "subagents", "group:sessions"],
    },
    subagents: [
      {
        agentId: "subagent-deepseek",
        providerId: "deepseek",
        providerLabel: "DeepSeek",
        model: "deepseek/deepseek-r1",
        strength: "Risk audit",
        whenToUse: "Independent security review",
      },
    ],
    runtime: { version: "2026.7.2", uptimeLabel: "11h" },
    sessions: { count: 3, recentCount: 1, evidenceLabel: "Live evidence" },
    operatorAuth: {
      statusLabel: "Current",
      tone: "healthy",
      authLabel: "operator.write + approvals",
      policyScopes: [
        { label: "write", qualifier: "hot path" },
        { label: "approvals", qualifier: "hot path" },
        { label: "admin", qualifier: "JIT worker only" },
      ],
    },
    modelsHref: "/connections/providers",
    usage: { href: "/usage", available: false },
    sessionsHref: "/sessions",
  };
}

describe("Gateway page", () => {
  it("renders the real orchestration map and keeps unlanded destinations disabled", () => {
    const html = renderToStaticMarkup(createElement(GatewayPage, { view: view() }));

    expect(html).toContain("Who&#x27;s driving");
    expect(html).toContain("openai/gpt-5.6-sol");
    expect(html).toContain("deepseek/deepseek-r1");
    expect(html).toContain("Independent security review");
    expect(html).toContain('href="/connections/providers"');
    expect(html).not.toContain('href="/usage"');
    expect(html).not.toContain('href="/sessions"');
    expect(html).toContain('data-destination="/usage"');
    expect(html).toContain('data-destination="/sessions"');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).not.toMatch(/tokens?\s*[:=]\s*\d+/i);
  });

  it("renders explicit empty and unavailable states without a fabricated active claim", () => {
    const live = view();
    const html = renderToStaticMarkup(
      createElement(GatewayPage, {
        view: {
          ...live,
          availability: "unavailable",
          freshnessState: "unknown",
          freshnessLabel: "Unavailable · no current heartbeat",
          isFreshLive: false,
          connection: {
            ...live.connection,
            statusLabel: "Unavailable",
            tone: "attention",
            live: false,
            stale: true,
            retainedLabel: "Last-known snapshot · stale",
          },
          orchestrator: {
            ...live.orchestrator,
            model: null,
            providerId: null,
            providerLabel: null,
            electionLabel: "No election",
            electionTone: "unknown",
            emptyLabel: "No main orchestrator elected yet",
          },
          subagents: [],
          sessions: { count: null, recentCount: 0, evidenceLabel: "Unavailable" },
        },
      }),
    );

    expect(html).toContain("No main orchestrator elected yet");
    expect(html).toContain("No subagents enrolled");
    expect(html).toContain("Last-known snapshot · stale");
    expect(html).not.toContain(">Active<");
  });
});
