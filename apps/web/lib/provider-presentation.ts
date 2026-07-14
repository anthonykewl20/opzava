import type { ModelProviderAuthChoice } from "@opzava/ports";

import { statusLabel, type ProviderConnectionView } from "@/lib/connections-state";

export const UNSAFE_ACCOUNT_LABEL_PATTERN = /token:|sk-[a-z]|:default=|api[-_]?key/i;
export const MAX_VISIBLE_AUTH_BADGES = 2;

export function providerSort(left: ProviderConnectionView, right: ProviderConnectionView): number {
  const leftConnected = left.status === "connected" ? 0 : 1;
  const rightConnected = right.status === "connected" ? 0 : 1;
  if (leftConnected !== rightConnected) return leftConnected - rightConnected;
  const leftKey = left.label.toLowerCase();
  const rightKey = right.label.toLowerCase();
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function connectChoice(provider: ProviderConnectionView) {
  const setupTokenChoice = provider.apiKeyChoices.find((choice) =>
    `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token"),
  );
  if (setupTokenChoice !== undefined) return setupTokenChoice;
  return provider.deviceFlowChoices[0] ?? provider.apiKeyChoices[0] ?? null;
}

export function credentialFormChoice(provider: ProviderConnectionView) {
  return (
    provider.apiKeyChoices.find((choice) =>
      `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token"),
    ) ??
    provider.apiKeyChoices[0] ??
    null
  );
}

export function credentialInputLabel(choice: ModelProviderAuthChoice): string {
  return `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token")
    ? "Setup token"
    : "API key";
}

export function isSetupTokenChoice(choice: ModelProviderAuthChoice | null): boolean {
  return choice !== null && `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token");
}

export function authMethodTypeLabel(choice: ModelProviderAuthChoice): string {
  return choice.mode === "device-flow" ? "OAuth device-flow" : credentialInputLabel(choice);
}

export function filterProviders(
  providers: readonly ProviderConnectionView[],
  query: string,
): readonly ProviderConnectionView[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") return providers;
  return providers.filter((provider) =>
    [
      provider.label,
      provider.vendor,
      provider.model ?? "",
      provider.id,
      ...provider.runtimeLabels,
      ...provider.models.map((model) => model.id),
      ...(provider.catalogModels ?? []).map((model) => model.id),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export function providerAuthBadges(provider: ProviderConnectionView): readonly string[] {
  const labels = new Set<string>();
  for (const choice of [...provider.deviceFlowChoices, ...provider.apiKeyChoices]) {
    const haystack = `${choice.id} ${choice.label} ${choice.mode}`.toLowerCase();
    if (haystack.includes("proxy") || haystack.includes("subscription")) {
      labels.add("Subscription");
      continue;
    }
    if (haystack.includes("setup") || (haystack.includes("token") && !haystack.includes("api"))) {
      labels.add("Setup token");
      continue;
    }
    if (choice.mode === "api-key") {
      labels.add("API key");
      continue;
    }
    labels.add(haystack.includes("oauth") ? "OAuth" : "Device");
  }
  const ordered = ["Subscription", "OAuth", "Device", "API key", "Setup token"].filter((label) =>
    labels.has(label),
  );
  return ordered.length === 0 ? ["No live auth method"] : ordered;
}

export function runtimeHint(provider: ProviderConnectionView): string | null {
  if (provider.runtimeLabels.length === 0) return null;
  const labels = provider.runtimeLabels.map((label) =>
    label.toLowerCase().includes("cli") ? `${label} runtime` : label,
  );
  return `incl. ${labels.join(", ")}`;
}

export function connectedAuthLabel(provider: ProviderConnectionView): string {
  if (provider.connectedAuthMode === "oauth") {
    return provider.id === "openai" ? "ChatGPT/OAuth subscription" : "OAuth subscription";
  }
  if (provider.connectedAuthMode === "token") return "setup token";
  if (provider.connectedAuthMode === "api_key") return "API key";
  return "gateway credential";
}

export function activeModelLabel(provider: ProviderConnectionView): string {
  return provider.model ?? "No configured model";
}

export function actionLabel(provider: ProviderConnectionView): string {
  if (provider.status === "connected") return "Manage";
  return provider.status === "needs_attention" ? "Fix" : "Connect";
}

export function displayStatusLabel(provider: ProviderConnectionView): string {
  if (provider.status === "not_connected") return "Available";
  if (provider.status === "needs_attention") return "Action required";
  return statusLabel(provider.status);
}

export function statusBadgeVariant(
  provider: ProviderConnectionView,
): "success" | "warning" | "muted" | "outline" {
  if (provider.status === "connected") return "success";
  if (provider.status === "needs_attention" || provider.status === "pending") return "warning";
  return "muted";
}

export function authHealthLabel(provider: ProviderConnectionView): string | null {
  if (provider.authHealth === null) return null;
  const labels: Record<NonNullable<ProviderConnectionView["authHealth"]>, string> = {
    ok: "Auth OK",
    expiring: "Auth expiring",
    expired: "Auth expired",
    missing: "Auth missing",
    static: "Static key",
  };
  return labels[provider.authHealth];
}

export function statusGuidance(provider: ProviderConnectionView): string | null {
  if (provider.status === "needs_attention") {
    return `${provider.message ?? "Gateway reported this credential needs attention."} Fix: reconnect the account or rotate the credential.`;
  }
  if (provider.status === "pending") {
    return "Authorization is in progress. Complete the device flow or wait for the next poll.";
  }
  if (provider.status === "not_connected") return "Available to connect.";
  if (provider.authHealth === "expiring") {
    return "Credential is still usable, but it should be refreshed soon.";
  }
  if (provider.authHealth === "expired" || provider.authHealth === "missing") {
    return "Credential cannot route models until it is reconnected.";
  }
  return null;
}

export function actionMessage(message: string): string {
  return /^exit code \d+\.?$/i.test(message.trim())
    ? `Gateway command failed after returning ${message.trim()}. Check provisioning worker logs for the sanitized command output.`
    : message;
}

export function providerSubLine(provider: ProviderConnectionView): string | null {
  const vendor = provider.vendor.trim();
  const showVendor = vendor !== "" && vendor.toLowerCase() !== provider.label.trim().toLowerCase();
  return (
    [showVendor ? vendor : null, runtimeHint(provider)]
      .filter((part): part is string => part !== null && part !== "")
      .join(" · ")
      .trim() || null
  );
}

export function providerModelParts(provider: ProviderConnectionView): {
  readonly first: string | null;
  readonly rest: readonly string[];
  readonly more: number;
} {
  const ids = (provider.enabledModels ?? provider.models).map((model) => model.id);
  return { first: ids[0] ?? null, rest: ids.slice(1, 3), more: Math.max(0, ids.length - 3) };
}

export function safeAccountLabel(label: string | null): string | null {
  const trimmed = label?.trim() ?? "";
  if (
    trimmed === "" ||
    trimmed.toLowerCase() === "default" ||
    UNSAFE_ACCOUNT_LABEL_PATTERN.test(trimmed)
  ) {
    return null;
  }
  const email = trimmed.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email !== null) return email[0];
  const account = trimmed.match(/^[a-z0-9-]+:([^=]+)=/i)?.[1]?.trim();
  if (account !== undefined && account !== "" && account.toLowerCase() !== "default")
    return account;
  return /[:=]/.test(trimmed) ? null : trimmed;
}

export function providerCardMeta(provider: ProviderConnectionView): string | null {
  const parts = [
    safeAccountLabel(provider.accountLabel),
    provider.planLabel,
    provider.expiryLabel ? `expires ${provider.expiryLabel}` : null,
    provider.usageLabel,
  ].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? null : parts.join(" · ");
}
