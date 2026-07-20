import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminOverviewContent } from "../app/(app)/page";
import type { EvidenceEnvelope } from "../lib/admin-evidence";
import type { AdminOverview } from "../lib/admin-overview/overview-composition";

function envelope<T>(
  sourceId: string,
  value: T | null,
  state: EvidenceEnvelope<T>["state"] = "live",
): EvidenceEnvelope<T> {
  return {
    sourceOwner: "Test source",
    sourceId,
    provenance: { label: "Test evidence", href: "/connections", diagnosticRef: null },
    sourceVersion: null,
    sourceTimestamp: "2026-07-20T00:00:00.000Z",
    observedAt: "2026-07-20T00:00:00.000Z",
    staleAfter: "2026-07-20T00:01:00.000Z",
    observationGeneration: 1,
    value,
    state,
    lastKnownGood: false,
    evidenceRole: "current",
    freshnessState: "within-budget",
    evaluatedAt: "2026-07-20T00:00:30.000Z",
  };
}

function overview(): AdminOverview {
  const providerAttention = envelope<readonly []>("overview-provider-attention", []);
  const healthAttention = envelope<readonly []>("overview-health-attention", []);
  const activeDeliveryEnvelope = envelope<never>(
    "overview-active-delivery",
    null,
    "not-configured",
  );
  const health = envelope("openclaw-health-readiness", {
    overall: "healthy" as const,
    componentsTotal: 1,
    healthy: 1,
    attention: 0,
    notChecked: 0,
    gatewayActive: true,
  });
  const gateway = envelope("gateway-readiness", {
    status: "active" as const,
    region: "ap-southeast-1",
    authLabel: "Workspace admin",
    lastHeartbeatAt: "2026-07-20T00:00:00.000Z",
  });
  const models = envelope("models-readiness", {
    providersTotal: 1,
    connected: 1,
    needsAttention: 0,
    pending: 0,
    routable: true,
  });
  const integrations = envelope("github-integration-readiness", {
    github: { connected: true, accountLabel: "opzava-bot", repository: "opzava" },
  });
  const activity = envelope<readonly []>("overview-recent-activity", []);
  const liveStatus = {
    state: "live" as const,
    partial: false,
    freshnessBudgetMs: 60_000,
    parts: [],
  };
  const needsYourAttention = {
    id: "needs-your-attention" as const,
    title: "Needs Your Attention" as const,
    note: "Attention note",
    status: liveStatus,
    envelopes: [providerAttention, healthAttention],
    rows: [],
    empty: true,
  };
  const activeDelivery = {
    id: "active-delivery" as const,
    title: "Active Delivery" as const,
    note: "Delivery note",
    status: { ...liveStatus, state: "not-configured" as const },
    envelope: activeDeliveryEnvelope,
    rows: [] as const,
    message: "Active Delivery is not yet available.",
  };
  const developmentReadiness = {
    id: "development-readiness" as const,
    title: "Development Readiness" as const,
    note: "Readiness note",
    status: liveStatus,
    envelopes: [health, gateway, models, integrations],
    rows: [
      {
        id: "health" as const,
        label: "OpenClaw health" as const,
        href: "/connections/system" as const,
        envelope: health,
      },
      {
        id: "gateway" as const,
        label: "Gateway" as const,
        href: "/connections/system" as const,
        envelope: gateway,
      },
      {
        id: "models" as const,
        label: "Model providers" as const,
        href: "/connections/providers" as const,
        envelope: models,
      },
      {
        id: "integrations" as const,
        label: "GitHub integration" as const,
        href: "/connections/github" as const,
        envelope: integrations,
      },
    ],
  };
  const recentActivity = {
    id: "recent-activity" as const,
    title: "Recent Activity" as const,
    note: "Activity note",
    status: liveStatus,
    envelope: activity,
    rows: [],
    empty: true,
  };

  return {
    evaluatedAt: "2026-07-20T00:00:30.000Z",
    needsYourAttention,
    activeDelivery,
    developmentReadiness,
    recentActivity,
    sections: [needsYourAttention, activeDelivery, developmentReadiness, recentActivity],
  };
}

describe("Admin Overview page", () => {
  it("renders the four Variant A section headings in landmark order", () => {
    const markup = renderToStaticMarkup(<AdminOverviewContent overview={overview()} />);
    const headings = [
      "Needs Your Attention",
      "Active Delivery",
      "Development Readiness",
      "Recent Activity",
    ];
    const positions = headings.map((heading) => markup.indexOf(`>${heading}</h2>`));

    expect(markup).toContain("<h1>Overview</h1>");
    for (const heading of headings) expect(markup).toContain(`>${heading}</h2>`);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });
});
