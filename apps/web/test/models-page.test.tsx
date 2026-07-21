import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ModelsPage } from "../components/models/models-page";
import type { ModelsPageViewModel } from "../lib/models/models-view-model";

function view(): ModelsPageViewModel {
  return {
    availability: "live",
    freshnessState: "within-budget",
    freshnessLabel: "Live · checked 30s ago",
    isFreshLive: true,
    lastKnownGood: false,
    stateTitle: null,
    stateDescription: null,
    glance: {
      connected: 1,
      providersTotal: 2,
      needsAttention: 1,
      routableModels: 2,
      leadModel: "openai/gpt-main",
      leadProvider: "OpenAI",
      leadKnown: true,
      stale: false,
    },
    providerCount: 2,
    attentionItems: [
      {
        providerId: "zai",
        title: "Z.AI authorization expires in 2d",
        detail: "Re-authorize before it lapses so routed model calls keep working.",
        actionLabel: "Re-authorize",
        href: "/connections/providers",
        stale: false,
      },
    ],
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        vendor: "OpenAI",
        status: "connected",
        statusLabel: "Connected",
        tone: "healthy",
        roleLabel: "Lead orchestrator",
        model: "openai/gpt-main",
        auth: {
          modeLabel: "OAuth",
          healthLabel: "Healthy",
          health: "ok",
          tone: "healthy",
          expiryLabel: "6d",
        },
        routable: { enabled: 2, catalog: 3, ratio: 2 / 3, label: "2 of 3" },
        planLabel: "Pro",
        strength: "Orchestration",
        whenToUse: "Main orchestration",
        stale: false,
        lastKnownGood: false,
        primaryActionLabel: "Manage",
        canSetAsMain: false,
        managementHref: "/connections/providers",
      },
      {
        id: "google",
        label: "Google Gemini",
        vendor: "Google",
        status: "not_connected",
        statusLabel: "Not connected",
        tone: "muted",
        roleLabel: "Subagent",
        model: null,
        auth: {
          modeLabel: "Auth mode not reported",
          healthLabel: "Not connected",
          health: null,
          tone: "muted",
          expiryLabel: null,
        },
        routable: { enabled: 0, catalog: 18, ratio: 0, label: "18 advertised" },
        planLabel: null,
        strength: "Long context",
        whenToUse: "Long-context analysis",
        stale: false,
        lastKnownGood: false,
        primaryActionLabel: "Connect Google Gemini",
        canSetAsMain: false,
        managementHref: "/connections/providers",
      },
    ],
    managementHref: "/connections/providers",
  };
}

describe("Models page", () => {
  it("renders attention before the premium provider grid with decorative provider emblems", () => {
    const html = renderToStaticMarkup(createElement(ModelsPage, { view: view() }));

    expect(html).toContain("Models &amp; Providers");
    expect(html.indexOf("Needs your attention")).toBeLessThan(html.indexOf("Providers</h2>"));
    expect(html).toContain("Z.AI authorization expires in 2d");
    expect(html).toContain('data-provider-brand="openai"');
    expect(html).toContain('data-provider-brand="google"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Lead orchestrator");
    expect(html).toContain("2 of 3");
    expect(html).toContain("18 advertised");
    expect(html).toContain("Connect Google Gemini");
    expect(html.match(/href="\/connections\/providers"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("api_key=");
    expect(html).not.toMatch(/sk-[a-z0-9]/i);
  });

  it("omits the attention surface when no provider needs attention", () => {
    const subject = view();
    const html = renderToStaticMarkup(
      createElement(ModelsPage, {
        view: {
          ...subject,
          glance: { ...subject.glance, needsAttention: 0 },
          attentionItems: [],
        },
      }),
    );

    expect(html).not.toContain("Needs your attention");
    expect(html).toContain("Providers</h2>");
  });

  it("renders unavailable evidence without fabricating healthy zeroes or no election", () => {
    const subject = view();
    const html = renderToStaticMarkup(
      createElement(ModelsPage, {
        view: {
          ...subject,
          availability: "unavailable",
          freshnessState: "unknown",
          freshnessLabel: "Unavailable · last check could not complete",
          isFreshLive: false,
          stateTitle: "Current models data is unavailable",
          stateDescription: "No last-known provider catalog is available.",
          glance: {
            connected: null,
            providersTotal: null,
            needsAttention: null,
            routableModels: null,
            leadModel: null,
            leadProvider: null,
            leadKnown: false,
            stale: false,
          },
          attentionItems: [],
          providers: [],
          providerCount: null,
        },
      }),
    );

    expect(html).toContain("Current auth health unavailable");
    expect(html).toContain("No current election evidence");
    expect(html).toContain("unavailable</span>");
    expect(html).not.toContain("No provider auth risks reported");
    expect(html).not.toContain("No provider is set as main");
  });
});
