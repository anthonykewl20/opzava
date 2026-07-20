import type { AvailabilityState, EvidenceEnvelope } from "@/lib/admin-evidence";
import {
  projectGatewayReadiness,
  type ReadinessProjectionContext,
} from "@/lib/admin-overview/readiness-projections";
import type { ConnectionsPageData } from "@/lib/connections";

export type GatewayTone = "healthy" | "attention" | "unknown";

export interface GatewayConnectionView {
  readonly statusLabel: string;
  readonly tone: GatewayTone;
  readonly live: boolean;
  readonly stale: boolean;
  readonly region: string | null;
  readonly authLabel: string | null;
  readonly heartbeatLabel: string;
  readonly retainedLabel: string | null;
}

export interface GatewayOrchestratorView {
  readonly agentId: string;
  readonly model: string | null;
  readonly providerId: string | null;
  readonly providerLabel: string | null;
  readonly delegationMode: "prefer";
  readonly electionLabel: string;
  readonly electionTone: GatewayTone;
  readonly updatedLabel: string;
  readonly emptyLabel: string | null;
  readonly toolPolicy: readonly string[];
}

export interface GatewaySubagentView {
  readonly agentId: string;
  readonly providerId: string;
  readonly providerLabel: string;
  readonly model: string;
  readonly strength: string;
  readonly whenToUse: string;
}

export interface GatewayRuntimeView {
  readonly version: string | null;
  readonly uptimeLabel: string | null;
}

export interface GatewaySessionsView {
  readonly count: number | null;
  readonly recentCount: number;
  readonly evidenceLabel: string;
}

export interface GatewayOperatorAuthView {
  readonly statusLabel: string;
  readonly tone: GatewayTone;
  readonly authLabel: string | null;
  readonly policyScopes: readonly {
    readonly label: "write" | "approvals" | "admin";
    readonly qualifier: string;
  }[];
}

export interface GatewayPageViewModel {
  readonly availability: AvailabilityState;
  readonly freshnessState: EvidenceEnvelope<unknown>["freshnessState"];
  readonly freshnessLabel: string;
  readonly isFreshLive: boolean;
  readonly connection: GatewayConnectionView;
  readonly orchestrator: GatewayOrchestratorView;
  readonly subagents: readonly GatewaySubagentView[];
  readonly runtime: GatewayRuntimeView;
  readonly sessions: GatewaySessionsView;
  readonly operatorAuth: GatewayOperatorAuthView;
  readonly modelsHref: "/connections/providers";
  readonly usage: {
    readonly href: "/usage";
    readonly available: false;
  };
  readonly sessionsHref: "/sessions";
}

function relativeTime(value: string | null, evaluatedAt: string): string {
  if (value === null) return "not observed";

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

function formatUptime(uptimeMs: number | null): string | null {
  if (uptimeMs === null || !Number.isFinite(uptimeMs) || uptimeMs < 0) return null;
  const totalHours = Math.floor(uptimeMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours.toString().padStart(2, "0")}h`;
  if (totalHours > 0) return `${totalHours}h`;
  return `${Math.floor(uptimeMs / 60_000)}m`;
}

function freshnessLabel(
  availability: AvailabilityState,
  heartbeatAt: string | null,
  evaluatedAt: string,
): string {
  const observed = relativeTime(heartbeatAt, evaluatedAt);
  if (availability === "not-configured") return "Not configured";
  if (availability === "unavailable") return "Unavailable · no current heartbeat";
  if (availability === "unknown") return `Unknown · ${observed}`;
  if (availability === "stale") return `Stale · heartbeat ${observed}`;
  return `Live · checked ${observed}`;
}

function connectionView(
  data: ConnectionsPageData,
  availability: AvailabilityState,
  evaluatedAt: string,
): GatewayConnectionView {
  const gateway = data.snapshot.gateway;
  const retained = gateway.region !== null || gateway.lastHeartbeatAt !== null;

  if (availability === "not-configured") {
    return {
      statusLabel: "Not configured",
      tone: "unknown",
      live: false,
      stale: false,
      region: null,
      authLabel: null,
      heartbeatLabel: "Provisioning worker setup is required",
      retainedLabel: null,
    };
  }
  if (availability === "unavailable" || gateway.status === "unavailable") {
    return {
      statusLabel: "Unavailable",
      tone: "attention",
      live: false,
      stale: retained,
      region: gateway.region,
      authLabel: retained ? gateway.authLabel : null,
      heartbeatLabel:
        gateway.lastHeartbeatAt === null
          ? "No last-known heartbeat retained"
          : `Last heartbeat ${relativeTime(gateway.lastHeartbeatAt, evaluatedAt)}`,
      retainedLabel: retained ? "Last-known snapshot · stale" : null,
    };
  }
  if (availability === "stale") {
    return {
      statusLabel: "Evidence stale",
      tone: "unknown",
      live: false,
      stale: true,
      region: gateway.region,
      authLabel: gateway.authLabel,
      heartbeatLabel: `Last heartbeat ${relativeTime(gateway.lastHeartbeatAt, evaluatedAt)}`,
      retainedLabel: "Observed snapshot · stale",
    };
  }
  if (availability === "unknown") {
    return {
      statusLabel: "Unknown",
      tone: "unknown",
      live: false,
      stale: false,
      region: null,
      authLabel: null,
      heartbeatLabel: "Current heartbeat could not be verified",
      retainedLabel: null,
    };
  }
  return {
    statusLabel: "Active",
    tone: "healthy",
    live: true,
    stale: false,
    region: gateway.region,
    authLabel: gateway.authLabel,
    heartbeatLabel: `Heartbeat ${relativeTime(gateway.lastHeartbeatAt, evaluatedAt)}`,
    retainedLabel: null,
  };
}

function providerLabel(data: ConnectionsPageData, providerId: string | null): string | null {
  if (providerId === null) return null;
  const provider = data.snapshot.providerCatalog.find((entry) => entry.id === providerId);
  if (provider !== undefined) return provider.label;
  const projected = data.providers.find(
    (entry) => entry.id === providerId || entry.connectionProviderId === providerId,
  );
  if (projected !== undefined) return projected.label;
  const subagent = data.snapshot.orchestrator.subagents.find(
    (entry) => entry.providerId === providerId,
  );
  return subagent?.providerLabel ?? providerId;
}

function electionState(
  data: ConnectionsPageData,
  availability: AvailabilityState,
): Pick<GatewayOrchestratorView, "electionLabel" | "electionTone"> {
  if (data.snapshot.orchestrator.orchestratorModel === null) {
    return { electionLabel: "No election", electionTone: "unknown" };
  }
  if (availability === "not-configured") {
    return { electionLabel: "Not configured", electionTone: "unknown" };
  }
  if (availability === "unavailable" || availability === "stale") {
    return { electionLabel: "Stale snapshot", electionTone: "unknown" };
  }
  if (availability === "unknown") {
    return { electionLabel: "Election unverified", electionTone: "unknown" };
  }

  const reconcile = data.snapshot.orchestrator.reconcile;
  if (reconcile.status === "running") {
    return { electionLabel: "Election in progress", electionTone: "unknown" };
  }
  if (reconcile.status === "failed") {
    return { electionLabel: "Reconcile needs attention", electionTone: "attention" };
  }
  return { electionLabel: "Current election", electionTone: "healthy" };
}

function evidenceLabel(availability: AvailabilityState): string {
  if (availability === "live") return "Live evidence";
  if (availability === "stale") return "Stale evidence";
  if (availability === "not-configured") return "Not configured";
  if (availability === "unavailable") return "Unavailable";
  return "Unknown";
}

function operatorAuthView(
  connection: GatewayConnectionView,
  availability: AvailabilityState,
): GatewayOperatorAuthView {
  const status =
    availability === "live"
      ? { statusLabel: "Current", tone: "healthy" as const }
      : availability === "stale"
        ? { statusLabel: "Stale", tone: "unknown" as const }
        : availability === "unavailable"
          ? { statusLabel: "Unavailable", tone: "attention" as const }
          : availability === "not-configured"
            ? { statusLabel: "Not configured", tone: "unknown" as const }
            : { statusLabel: "Unknown", tone: "unknown" as const };

  return {
    ...status,
    authLabel: connection.authLabel,
    policyScopes: [
      { label: "write", qualifier: "hot path" },
      { label: "approvals", qualifier: "hot path" },
      { label: "admin", qualifier: "JIT worker only" },
    ],
  };
}

export function buildGatewayPageViewModel(
  data: ConnectionsPageData,
  context: ReadinessProjectionContext,
): GatewayPageViewModel {
  const readiness = projectGatewayReadiness(data, context);
  const connection = connectionView(data, readiness.state, context.evaluatedAt);
  const orchestrator = data.snapshot.orchestrator;
  const currentRuntimeEvidence = readiness.state === "live" || readiness.state === "stale";

  return {
    availability: readiness.state,
    freshnessState: readiness.freshnessState,
    freshnessLabel: freshnessLabel(
      readiness.state,
      data.snapshot.gateway.lastHeartbeatAt,
      context.evaluatedAt,
    ),
    isFreshLive:
      readiness.state === "live" &&
      readiness.freshnessState === "within-budget" &&
      data.snapshot.gateway.lastHeartbeatAt !== null,
    connection,
    orchestrator: {
      agentId: orchestrator.orchestratorAgentId,
      model: orchestrator.orchestratorModel,
      providerId: orchestrator.orchestratorProviderId,
      providerLabel: providerLabel(data, orchestrator.orchestratorProviderId),
      delegationMode: orchestrator.delegationMode,
      ...electionState(data, readiness.state),
      updatedLabel:
        orchestrator.updatedAt === null
          ? "election time unknown"
          : `set ${relativeTime(orchestrator.updatedAt, context.evaluatedAt)}`,
      emptyLabel:
        orchestrator.orchestratorModel === null ? "No main orchestrator elected yet" : null,
      toolPolicy: [...orchestrator.toolPolicyExpansion.allow],
    },
    subagents: orchestrator.subagents.map((subagent) => ({
      agentId: subagent.agentId,
      providerId: subagent.providerId,
      providerLabel: subagent.providerLabel,
      model: subagent.model,
      strength: subagent.strength,
      whenToUse: subagent.whenToUse,
    })),
    runtime: {
      version: currentRuntimeEvidence ? data.snapshot.openclawHealth.runtime.version : null,
      uptimeLabel: currentRuntimeEvidence
        ? formatUptime(data.snapshot.openclawHealth.runtime.uptimeMs)
        : null,
    },
    sessions: {
      count: currentRuntimeEvidence ? data.snapshot.openclawHealth.sessions.count : null,
      recentCount: currentRuntimeEvidence ? data.snapshot.openclawHealth.sessions.recent.length : 0,
      evidenceLabel: evidenceLabel(readiness.state),
    },
    operatorAuth: operatorAuthView(connection, readiness.state),
    modelsHref: "/connections/providers",
    usage: { href: "/usage", available: false },
    sessionsHref: "/sessions",
  };
}
