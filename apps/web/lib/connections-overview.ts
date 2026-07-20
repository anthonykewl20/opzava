import type { GitHubConnectionState, OpenClawHealthComponent } from "@opzava/ports";

import type { ProviderConnectionView } from "@/lib/connections-state";

export type OverviewHealthStatus = "healthy" | "attention" | "unknown";

export interface OverviewHealthGroup {
  readonly id: "system-core" | "channels" | "agents";
  readonly label: "System Core" | "Channels" | "Agents";
  readonly href:
    | "/connections/system#system-group-system-core"
    | "/connections/system#system-group-channels"
    | "/connections/system#system-group-agents";
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
  readonly total: number;
  readonly status: OverviewHealthStatus;
}

export interface OverviewProviderRow {
  readonly id: string;
  readonly label: string;
  readonly status: ProviderConnectionView["status"];
  readonly authHealth: ProviderConnectionView["authHealth"];
  readonly authLabel: string | null;
  readonly statusLabel: string;
  readonly actionLabel: "Setup" | "Fix" | "Manage";
  readonly href: "/connections/providers";
}

export interface OverviewIntegrationRow {
  readonly id: "github";
  readonly label: "GitHub";
  readonly status: Exclude<GitHubConnectionState["status"], "not_connected">;
  readonly statusLabel: string;
  readonly detail: string;
  readonly href: "/connections/github";
}

const groupDefinitions = [
  {
    id: "system-core",
    label: "System Core",
    href: "/connections/system#system-group-system-core",
  },
  {
    id: "channels",
    label: "Channels",
    href: "/connections/system#system-group-channels",
  },
  {
    id: "agents",
    label: "Agents",
    href: "/connections/system#system-group-agents",
  },
] as const;

export function overviewHealthGroupId(
  kind: OpenClawHealthComponent["kind"],
): OverviewHealthGroup["id"] {
  if (kind === "channel") return "channels";
  if (kind === "agent") return "agents";
  return "system-core";
}

function rollupStatus(attention: number, notChecked: number, total: number): OverviewHealthStatus {
  return attention > 0 ? "attention" : notChecked > 0 || total === 0 ? "unknown" : "healthy";
}

export function overviewHealthGroups(
  components: readonly OpenClawHealthComponent[],
): readonly OverviewHealthGroup[] {
  return groupDefinitions.map((definition) => {
    const grouped = components.filter(
      (component) => overviewHealthGroupId(component.kind) === definition.id,
    );
    const healthy = grouped.filter((component) => component.status === "healthy").length;
    const attention = grouped.filter((component) => component.status === "attention").length;
    const notChecked = grouped.filter((component) => component.status === "not_checked").length;

    return {
      id: definition.id,
      label: definition.label,
      href: definition.href,
      healthy,
      attention,
      notChecked,
      total: grouped.length,
      status: rollupStatus(attention, notChecked, grouped.length),
    };
  });
}

function providerPriority(provider: ProviderConnectionView): number {
  if (
    provider.status === "needs_attention" ||
    provider.authHealth === "expired" ||
    provider.authHealth === "missing"
  ) {
    return 0;
  }

  if (provider.status === "pending" || provider.authHealth === "expiring") return 1;
  return provider.status === "connected" ? 2 : 3;
}

function providerStatusLabel(provider: ProviderConnectionView): string {
  if (provider.authHealth === "expired") return "Credential expired";
  if (provider.authHealth === "missing") return "Credential missing";
  if (provider.authHealth === "expiring") return "Credential expiring";
  return provider.statusLabel;
}

function providerActionLabel(provider: ProviderConnectionView): OverviewProviderRow["actionLabel"] {
  if (
    provider.status === "needs_attention" ||
    provider.authHealth === "expired" ||
    provider.authHealth === "missing"
  ) {
    return "Fix";
  }

  return provider.status === "not_connected" ? "Setup" : "Manage";
}

function providerAuthLabel(provider: ProviderConnectionView): string | null {
  if (provider.connectedAuthMode === "oauth") return "OAuth";
  if (provider.connectedAuthMode === "token") return "Token";
  if (provider.connectedAuthMode === "api_key") return "API key";
  return provider.authSummary.trim() === "" ? null : provider.authSummary;
}

export function overviewProviders(
  providers: readonly ProviderConnectionView[],
): readonly OverviewProviderRow[] {
  return [...providers]
    .sort((left, right) => {
      const priority = providerPriority(left) - providerPriority(right);
      return priority === 0 ? left.label.localeCompare(right.label) : priority;
    })
    .slice(0, 4)
    .map((provider) => ({
      id: provider.id,
      label: provider.label,
      status: provider.status,
      authHealth: provider.authHealth,
      authLabel: providerAuthLabel(provider),
      statusLabel: providerStatusLabel(provider),
      actionLabel: providerActionLabel(provider),
      href: "/connections/providers",
    }));
}

export function overviewIntegrations(
  github: GitHubConnectionState,
): readonly OverviewIntegrationRow[] {
  if (github.status === "not_connected") return [];

  const statusLabel =
    github.status === "connected"
      ? "Connected"
      : github.status === "pending"
        ? "Connecting"
        : "Needs attention";

  return [
    {
      id: "github",
      label: "GitHub",
      status: github.status,
      statusLabel,
      detail: github.repository,
      href: "/connections/github",
    },
  ];
}
