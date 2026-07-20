import type { ConnectionStatus } from "@opzava/ports";

import {
  ADMIN_FRESHNESS_BUDGET_MS,
  deriveAvailabilityState,
  type EvidenceEnvelope,
  type EvidenceInput,
  type EvidenceProvenance,
} from "@/lib/admin-evidence";
import type { ConnectionsPageData } from "@/lib/connections";
import { openclawHealthSummary, providerConnectionSummary } from "@/lib/connections-state";

export interface ReadinessProjectionContext {
  readonly evaluatedAt: string;
  readonly observationGeneration: number;
}

export interface HealthReadiness {
  readonly overall: "healthy" | "degraded" | "unhealthy";
  readonly componentsTotal: number;
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
  readonly gatewayActive: boolean;
}

export interface GatewayReadiness {
  readonly status: "active";
  readonly region: string | null;
  readonly authLabel: string;
  readonly lastHeartbeatAt: string | null;
}

export interface ModelsReadiness {
  readonly providersTotal: number;
  readonly connected: number;
  readonly needsAttention: number;
  readonly pending: number;
  readonly routable: boolean;
}

export interface IntegrationConnectionReadiness {
  readonly connected: boolean;
  readonly accountLabel?: string;
  readonly repository?: string;
}

export interface IntegrationsReadiness {
  readonly github: IntegrationConnectionReadiness;
}

interface ProjectionDefinition<T> {
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly sourceTimestamp: string | null;
  readonly freshnessBudgetMs: number;
  readonly value: T;
}

function staleAfter(observedAt: string, freshnessBudgetMs: number): string {
  const observedAtMs = Date.parse(observedAt);
  return Number.isFinite(observedAtMs)
    ? new Date(observedAtMs + freshnessBudgetMs).toISOString()
    : observedAt;
}

function projectReadiness<T>(
  pageData: ConnectionsPageData,
  ctx: ReadinessProjectionContext,
  definition: ProjectionDefinition<T>,
): EvidenceEnvelope<T> {
  const identity = {
    sourceOwner: definition.sourceOwner,
    sourceId: definition.sourceId,
    provenance: definition.provenance,
    sourceVersion: null,
    sourceTimestamp: definition.sourceTimestamp,
    observedAt: pageData.snapshot.refreshedAt,
    staleAfter: staleAfter(pageData.snapshot.refreshedAt, definition.freshnessBudgetMs),
    observationGeneration: ctx.observationGeneration,
  } as const;
  const input: EvidenceInput<T> = !pageData.provisioningAvailable
    ? {
        ...identity,
        kind: "snapshot",
        declaredState: "not-configured",
        value: null,
        lastKnownGood: false,
      }
    : pageData.snapshot.gateway.status === "unavailable"
      ? {
          ...identity,
          kind: "read-failure",
          state: "unavailable",
          value: null,
        }
      : {
          ...identity,
          kind: "snapshot",
          declaredState: "live",
          value: definition.value,
          lastKnownGood: false,
        };

  return deriveAvailabilityState(input, ctx.evaluatedAt);
}

function healthOverall(
  healthy: number,
  attention: number,
  notChecked: number,
): HealthReadiness["overall"] {
  if (attention > 0 && healthy === 0) return "unhealthy";
  if (attention > 0 || notChecked > 0 || healthy === 0) return "degraded";
  return "healthy";
}

export function projectHealthReadiness(
  pageData: ConnectionsPageData,
  ctx: ReadinessProjectionContext,
): EvidenceEnvelope<HealthReadiness> {
  const summary = openclawHealthSummary(pageData.snapshot.openclawHealth);

  return projectReadiness(pageData, ctx, {
    sourceOwner: "OpenClaw/Platform",
    sourceId: "openclaw-health-readiness",
    provenance: {
      label: "OpenClaw system health",
      href: "/connections/system",
      diagnosticRef: "openclaw-health",
    },
    sourceTimestamp: pageData.snapshot.openclawHealth.checkedAt,
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
    value: {
      overall: healthOverall(summary.healthy, summary.attention, summary.notChecked),
      componentsTotal: summary.total,
      healthy: summary.healthy,
      attention: summary.attention,
      notChecked: summary.notChecked,
      gatewayActive: pageData.snapshot.gateway.status === "active",
    },
  });
}

export function projectGatewayReadiness(
  pageData: ConnectionsPageData,
  ctx: ReadinessProjectionContext,
): EvidenceEnvelope<GatewayReadiness> {
  const gateway = pageData.snapshot.gateway;
  const value: GatewayReadiness = {
    status: "active",
    region: gateway.region,
    authLabel: gateway.authLabel,
    lastHeartbeatAt: gateway.lastHeartbeatAt,
  };

  return projectReadiness(pageData, ctx, {
    sourceOwner: "OpenClaw Gateway",
    sourceId: "gateway-readiness",
    provenance: {
      label: "Gateway connection",
      href: "/connections/system",
      diagnosticRef: "gateway-connection",
    },
    sourceTimestamp: gateway.lastHeartbeatAt,
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
    value,
  });
}

export function projectModelsReadiness(
  pageData: ConnectionsPageData,
  ctx: ReadinessProjectionContext,
): EvidenceEnvelope<ModelsReadiness> {
  const summary = providerConnectionSummary(pageData.snapshot);

  return projectReadiness(pageData, ctx, {
    sourceOwner: "OpenClaw Models",
    sourceId: "models-readiness",
    provenance: {
      label: "Model providers",
      href: "/connections/providers",
      diagnosticRef: "model-provider-connections",
    },
    sourceTimestamp: pageData.snapshot.refreshedAt,
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
    value: {
      providersTotal: summary.total,
      connected: summary.connected,
      needsAttention: summary.needsAttention,
      pending: summary.pending,
      routable: summary.connected > 0,
    },
  });
}

function githubReadiness(
  status: ConnectionStatus,
  accountLabel: string | null,
  repository: string,
): IntegrationConnectionReadiness {
  return {
    connected: status === "connected",
    ...(accountLabel === null ? {} : { accountLabel }),
    ...(status === "not_connected" ? {} : { repository }),
  };
}

export function projectIntegrationsReadiness(
  pageData: ConnectionsPageData,
  ctx: ReadinessProjectionContext,
): EvidenceEnvelope<IntegrationsReadiness> {
  const github = pageData.snapshot.github;

  return projectReadiness(pageData, ctx, {
    sourceOwner: "GitHub",
    sourceId: "github-integration-readiness",
    provenance: {
      label: "GitHub integration",
      href: "/connections/github",
      diagnosticRef: "github-connection",
    },
    sourceTimestamp: github.lastCheckedAt,
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
    value: {
      github: githubReadiness(github.status, github.accountLabel, github.repository),
    },
  });
}
