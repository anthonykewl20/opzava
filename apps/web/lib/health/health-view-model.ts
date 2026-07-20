import type { OpenClawHealthComponent, OpenClawHealthStatus } from "@opzava/ports";

import type { AvailabilityState, EvidenceEnvelope } from "@/lib/admin-evidence";
import {
  projectGatewayReadiness,
  projectHealthReadiness,
  type HealthReadiness,
  type ReadinessProjectionContext,
} from "@/lib/admin-overview/readiness-projections";
import type { ConnectionsPageData } from "@/lib/connections";
import { overviewHealthGroupId } from "@/lib/connections-overview";
import { openclawHealthSummary } from "@/lib/connections-state";

export interface HealthCountsView {
  readonly total: number;
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
}

export type HealthComponentGroupId = "system-core" | "channels" | "agents";

export interface HealthComponentView {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly status: OpenClawHealthStatus;
  readonly statusLabel: string;
  readonly checkedLabel: string;
  readonly href: string;
}

export interface HealthComponentGroupView {
  readonly id: HealthComponentGroupId;
  readonly label: string;
  readonly components: readonly HealthComponentView[];
}

export interface HealthAttentionItemView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly actionLabel: string;
}

export interface HealthWarningView {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface HealthLastKnownGoodView {
  readonly checkedAt: string;
  readonly checkedLabel: string;
  readonly healthy: number;
  readonly total: number;
  readonly stale: true;
}

export interface HealthGatewayView {
  readonly statusLabel: string;
  readonly tone: "healthy" | "attention" | "unknown";
  readonly detail: string;
  readonly href: string;
  readonly live: boolean;
}

export interface HealthRuntimeView {
  readonly version: string | null;
  readonly uptimeLabel: string | null;
  readonly update: {
    readonly currentVersion: string;
    readonly latestVersion: string;
    readonly channel: string;
  } | null;
  readonly href: string;
}

export interface HealthSessionsView {
  readonly count: number | null;
  readonly recentCount: number;
  readonly href: string;
}

export interface HealthPageViewModel {
  readonly availability: AvailabilityState;
  readonly freshnessState: EvidenceEnvelope<unknown>["freshnessState"];
  readonly freshnessLabel: string;
  readonly isFreshLive: boolean;
  readonly overall: HealthReadiness["overall"] | "unknown";
  readonly verdict: string;
  readonly description: string;
  readonly counts: HealthCountsView | null;
  readonly attentionItems: readonly HealthAttentionItemView[];
  readonly warnings: readonly HealthWarningView[];
  readonly groups: readonly HealthComponentGroupView[];
  readonly gateway: HealthGatewayView;
  readonly runtime: HealthRuntimeView;
  readonly sessions: HealthSessionsView;
  readonly lastKnownGood: HealthLastKnownGoodView | null;
}

const groupDefinitions = [
  { id: "system-core", label: "System core" },
  { id: "channels", label: "Channels" },
  { id: "agents", label: "Agents" },
] as const;

function ownerHref(groupId: HealthComponentGroupId): string {
  return `/connections/system#system-group-${groupId}`;
}

function relativeTime(value: string | null, evaluatedAt: string): string {
  if (value === null) return "not checked";

  const valueMs = Date.parse(value);
  const evaluatedAtMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(valueMs) || !Number.isFinite(evaluatedAtMs) || valueMs > evaluatedAtMs) {
    return "time unknown";
  }

  const ageMs = evaluatedAtMs - valueMs;
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return `${Math.floor(ageMs / 86_400_000)}d ago`;
}

function statusLabel(status: OpenClawHealthStatus): string {
  if (status === "healthy") return "Healthy";
  if (status === "attention") return "Needs attention";
  return "Unknown · not checked";
}

function componentView(
  component: OpenClawHealthComponent,
  evaluatedAt: string,
): HealthComponentView {
  const groupId = overviewHealthGroupId(component.kind);
  return {
    id: component.id,
    label: component.label,
    detail:
      component.detail ??
      (component.status === "not_checked"
        ? "No probe result is available; this is unknown, not healthy."
        : "No additional detail was reported."),
    status: component.status,
    statusLabel: statusLabel(component.status),
    checkedLabel:
      component.lastCheckedAt === null
        ? "Not checked"
        : `Checked ${relativeTime(component.lastCheckedAt, evaluatedAt)}`,
    href: ownerHref(groupId),
  };
}

function groupComponents(
  components: readonly OpenClawHealthComponent[],
  evaluatedAt: string,
): readonly HealthComponentGroupView[] {
  return groupDefinitions
    .map((definition) => ({
      ...definition,
      components: components
        .filter((component) => overviewHealthGroupId(component.kind) === definition.id)
        .map((component) => componentView(component, evaluatedAt)),
    }))
    .filter((group) => group.components.length > 0);
}

function attentionItems(
  data: ConnectionsPageData,
  includeCurrentSnapshot: boolean,
): readonly HealthAttentionItemView[] {
  if (!includeCurrentSnapshot) return [];

  const componentItems = data.snapshot.openclawHealth.components
    .filter((component) => component.status === "attention")
    .map((component) => {
      const groupId = overviewHealthGroupId(component.kind);
      return {
        id: `component:${component.id}`,
        title: component.label,
        detail: component.detail ?? "A live health check reported a problem.",
        href: ownerHref(groupId),
        actionLabel: component.kind === "plugins" ? "Inspect plugins" : "Open owner",
      };
    });
  return componentItems;
}

function formatUptime(uptimeMs: number | null): string | null {
  if (uptimeMs === null || !Number.isFinite(uptimeMs) || uptimeMs < 0) return null;
  const totalHours = Math.floor(uptimeMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours.toString().padStart(2, "0")}h`;
  if (totalHours > 0) return `${totalHours}h`;
  return `${Math.floor(uptimeMs / 60_000)}m`;
}

function verdictCopy(input: {
  readonly availability: AvailabilityState;
  readonly counts: HealthCountsView | null;
  readonly overall: HealthPageViewModel["overall"];
}): Pick<HealthPageViewModel, "verdict" | "description"> {
  if (input.availability === "not-configured") {
    return {
      verdict: "Health data isn't set up yet",
      description: "Configure the provisioning worker before relying on platform health checks.",
    };
  }
  if (input.availability === "unavailable") {
    return {
      verdict: "Current health is unavailable",
      description:
        "The Gateway could not be reached. Any retained last-known-good result is historical and marked stale.",
    };
  }
  if (input.availability === "unknown") {
    return {
      verdict: "Current health is unknown",
      description:
        "The evidence could not be verified, so this page does not claim the platform is healthy.",
    };
  }
  if (input.availability === "stale") {
    return {
      verdict: "Health evidence is stale",
      description:
        "The observed component counts are shown, but they no longer assert current health.",
    };
  }
  if (input.counts === null || input.counts.total === 0) {
    return {
      verdict: "Current health is unknown",
      description: "No component checks were returned, so there is no healthy zero to report.",
    };
  }
  if (input.overall === "healthy") {
    return {
      verdict: "Platform checks are healthy",
      description: `All ${input.counts.total} checked components reported healthy.`,
    };
  }
  if (input.overall === "unhealthy" || input.counts.attention > 0) {
    return {
      verdict:
        input.counts.attention === 1
          ? "One thing needs your attention"
          : `${input.counts.attention} things need your attention`,
      description: `${input.counts.healthy} of ${input.counts.total} components are healthy; exceptions are listed beside the ring.`,
    };
  }
  if (input.counts.notChecked > 0) {
    return {
      verdict: "Some component checks are unknown",
      description: `${input.counts.healthy} of ${input.counts.total} components are healthy; ${input.counts.notChecked} ${input.counts.notChecked === 1 ? "was" : "were"} not checked.`,
    };
  }
  return {
    verdict: "Platform health is degraded",
    description: "The readiness projection did not classify the current evidence as healthy.",
  };
}

function freshnessLabel(
  availability: AvailabilityState,
  checkedAt: string | null,
  evaluatedAt: string,
): string {
  const checked =
    checkedAt === null ? "checks not completed" : `checked ${relativeTime(checkedAt, evaluatedAt)}`;
  if (availability === "not-configured") return "Not configured";
  if (availability === "unavailable") return "Unavailable · no current check";
  if (availability === "unknown") return `Unknown · ${checked}`;
  if (availability === "stale") return `Stale · ${checked}`;
  return `Live · ${checked}`;
}

function gatewayView(
  data: ConnectionsPageData,
  availability: AvailabilityState,
  evaluatedAt: string,
): HealthGatewayView {
  const gateway = data.snapshot.gateway;
  const href = ownerHref("system-core");
  if (availability === "not-configured") {
    return {
      statusLabel: "Not configured",
      tone: "unknown",
      detail: "Provisioning worker setup is required.",
      href,
      live: false,
    };
  }
  if (gateway.status === "unavailable" || availability === "unavailable") {
    return {
      statusLabel: "Unavailable",
      tone: "attention",
      detail: "No current Gateway heartbeat is available.",
      href,
      live: false,
    };
  }
  if (availability === "stale" || availability === "unknown") {
    return {
      statusLabel: availability === "stale" ? "Evidence stale" : "Unknown",
      tone: "unknown",
      detail: `${gateway.region ?? "Region unknown"} · heartbeat ${relativeTime(gateway.lastHeartbeatAt, evaluatedAt)}`,
      href,
      live: false,
    };
  }
  return {
    statusLabel: "Active",
    tone: "healthy",
    detail: `${gateway.region ?? "Region unknown"} · heartbeat ${relativeTime(gateway.lastHeartbeatAt, evaluatedAt)}`,
    href,
    live: true,
  };
}

export function buildHealthPageViewModel(
  data: ConnectionsPageData,
  context: ReadinessProjectionContext,
): HealthPageViewModel {
  const healthEnvelope = projectHealthReadiness(data, context);
  const gatewayEnvelope = projectGatewayReadiness(data, context);
  const health = data.snapshot.openclawHealth;
  const summary = openclawHealthSummary(health);
  const includeCurrentSnapshot =
    healthEnvelope.value !== null &&
    data.snapshot.gateway.status === "active" &&
    (healthEnvelope.state === "live" || healthEnvelope.state === "stale");
  const counts =
    includeCurrentSnapshot && (healthEnvelope.value?.componentsTotal ?? 0) > 0
      ? {
          total: healthEnvelope.value?.componentsTotal ?? summary.total,
          healthy: healthEnvelope.value?.healthy ?? summary.healthy,
          attention: healthEnvelope.value?.attention ?? summary.attention,
          notChecked: healthEnvelope.value?.notChecked ?? summary.notChecked,
        }
      : null;
  const overall = includeCurrentSnapshot ? (healthEnvelope.value?.overall ?? "unknown") : "unknown";
  const verdict = verdictCopy({ availability: healthEnvelope.state, counts, overall });
  const lastKnownGood = health.lastKnownHealthy;

  return {
    availability: healthEnvelope.state,
    freshnessState: healthEnvelope.freshnessState,
    freshnessLabel: freshnessLabel(healthEnvelope.state, health.checkedAt, context.evaluatedAt),
    isFreshLive:
      healthEnvelope.state === "live" &&
      healthEnvelope.freshnessState === "within-budget" &&
      health.checkedAt !== null,
    overall,
    ...verdict,
    counts,
    attentionItems: attentionItems(data, includeCurrentSnapshot),
    warnings: includeCurrentSnapshot
      ? health.warnings.map((warning) => ({
          id: warning.id,
          label: warning.label,
          detail: warning.detail,
        }))
      : [],
    groups: includeCurrentSnapshot ? groupComponents(health.components, context.evaluatedAt) : [],
    gateway: gatewayView(data, gatewayEnvelope.state, context.evaluatedAt),
    runtime: {
      version: includeCurrentSnapshot ? health.runtime.version : null,
      uptimeLabel: includeCurrentSnapshot ? formatUptime(health.runtime.uptimeMs) : null,
      update: includeCurrentSnapshot ? health.runtime.updateAvailable : null,
      href: ownerHref("system-core"),
    },
    sessions: {
      count: includeCurrentSnapshot ? health.sessions.count : null,
      recentCount: includeCurrentSnapshot ? health.sessions.recent.length : 0,
      href: ownerHref("system-core"),
    },
    lastKnownGood:
      lastKnownGood === null
        ? null
        : {
            checkedAt: lastKnownGood.checkedAt,
            checkedLabel: relativeTime(lastKnownGood.checkedAt, context.evaluatedAt),
            healthy: lastKnownGood.healthy,
            total: lastKnownGood.total,
            stale: true,
          },
  };
}
