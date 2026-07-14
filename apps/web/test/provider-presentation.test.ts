import { describe, expect, it } from "vitest";

import type { ProviderConnectionView } from "@/lib/connections-state";
import {
  actionLabel,
  displayStatusLabel,
  filterProviders,
  providerAuthBadges,
  providerCardMeta,
  providerModelParts,
  providerSubLine,
  safeAccountLabel,
  statusBadgeVariant,
} from "@/lib/provider-presentation";

function provider(overrides: Partial<ProviderConnectionView> = {}): ProviderConnectionView {
  return {
    id: "anthropic",
    connectionProviderId: "anthropic",
    label: "Anthropic",
    vendor: "Anthropic",
    status: "not_connected",
    statusLabel: "Not connected",
    statusClassName: "dot",
    authSummary: "API key",
    primaryAuthChoice: null,
    apiKeyChoices: [],
    deviceFlowChoices: [],
    roleLabel: "Subagent",
    model: null,
    runtimeLabels: [],
    models: [],
    authHealth: null,
    expiryLabel: null,
    planLabel: null,
    connectedAuthMode: null,
    accountLabel: null,
    usageLabel: null,
    message: null,
    strength: "Gateway-advertised provider",
    whenToUse: "Use when appropriate.",
    pendingFlow: null,
    tier: "frontier",
    tierLabel: "Frontier",
    ...overrides,
  };
}

describe("provider presentation", () => {
  it.each([
    ["sk-ant-secret", null],
    ["token:secret", null],
    ["anthropic:default=oauth", null],
    ["api_key=secret", null],
    ["profile (tony@example.com)", "tony@example.com"],
    ["anthropic:tony=oauth", "tony"],
    ["Claude Max", "Claude Max"],
    ["name:value", null],
    ["name=value", null],
    ["default", null],
  ])("sanitizes account label %j", (input, expected) => {
    expect(safeAccountLabel(input)).toBe(expected);
  });

  it("orders and deduplicates auth method badges", () => {
    const subject = provider({
      deviceFlowChoices: [
        {
          id: "subscription-proxy",
          label: "Subscription proxy",
          mode: "device-flow",
          providerId: "anthropic",
        },
        { id: "oauth", label: "OAuth", mode: "device-flow", providerId: "anthropic" },
        { id: "device", label: "Device login", mode: "device-flow", providerId: "anthropic" },
      ],
      apiKeyChoices: [
        { id: "api-key", label: "API key", mode: "api-key", providerId: "anthropic" },
        { id: "setup-token", label: "Setup token", mode: "api-key", providerId: "anthropic" },
      ],
    });

    expect(providerAuthBadges(subject)).toEqual([
      "Subscription",
      "OAuth",
      "Device",
      "API key",
      "Setup token",
    ]);
    expect(providerAuthBadges(provider())).toEqual(["No live auth method"]);
  });

  it.each([
    ["not_connected", "Not connected", "Available"],
    ["pending", "Waiting for approval", "Waiting for approval"],
    ["needs_attention", "Needs attention", "Action required"],
    ["connected", "Connected", "Connected"],
  ] as const)("maps %s to locked status vocabulary", (status, statusLabel, expected) => {
    expect(displayStatusLabel(provider({ status, statusLabel }))).toBe(expected);
  });

  it("builds safe card metadata in account, plan, expiry, usage order", () => {
    expect(
      providerCardMeta(
        provider({
          accountLabel: "tony@example.com",
          planLabel: "Pro",
          expiryLabel: "in 3 days",
          usageLabel: "42% used",
        }),
      ),
    ).toBe("tony@example.com · Pro · expires in 3 days · 42% used");
    expect(providerCardMeta(provider({ accountLabel: "token:sk-secret", planLabel: "Team" }))).toBe(
      "Team",
    );
    expect(providerCardMeta(provider())).toBeNull();
  });

  it.each([
    ["connected", "success"],
    ["needs_attention", "warning"],
    ["pending", "warning"],
    ["not_connected", "muted"],
  ] as const)("uses %s badge styling", (status, expected) => {
    expect(statusBadgeVariant(provider({ status }))).toBe(expected);
  });

  it("deduplicates the vendor and appends folded runtime hints", () => {
    expect(providerSubLine(provider({ label: "Anthropic", vendor: "Anthropic" }))).toBeNull();
    expect(
      providerSubLine(
        provider({ label: "Google", vendor: "Gemini", runtimeLabels: ["Gemini CLI"] }),
      ),
    ).toBe("Gemini · incl. Gemini CLI runtime");
  });

  it("splits model chips into first, rest, and overflow", () => {
    const model = (id: string) => ({ id, label: id });
    expect(
      providerModelParts(
        provider({ enabledModels: [model("one"), model("two"), model("three"), model("four")] }),
      ),
    ).toEqual({ first: "one", rest: ["two", "three"], more: 1 });
    expect(providerModelParts(provider())).toEqual({ first: null, rest: [], more: 0 });
  });

  it.each(["google", "gemini", "active/model", "catalog/model", "gemini cli"])(
    "filters across provider presentation fields with %j",
    (query) => {
      const subject = provider({
        id: "google",
        label: "Google AI",
        vendor: "Gemini",
        model: "active/model",
        models: [{ id: "enabled/model", label: "Enabled" }],
        catalogModels: [{ id: "catalog/model", label: "Catalog" }],
        runtimeLabels: ["Gemini CLI"],
      });
      expect(filterProviders([subject, provider({ id: "other", label: "Other" })], query)).toEqual([
        subject,
      ]);
    },
  );

  it.each([
    ["connected", "Manage"],
    ["needs_attention", "Fix"],
    ["pending", "Connect"],
    ["not_connected", "Connect"],
  ] as const)("labels %s actions", (status, expected) => {
    expect(actionLabel(provider({ status }))).toBe(expected);
  });
});
