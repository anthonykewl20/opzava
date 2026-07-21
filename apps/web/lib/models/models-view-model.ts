import type { ConnectedAuthMode, ConnectionStatus, ProviderAuthHealth } from "@opzava/ports";

import type { AvailabilityState, EvidenceEnvelope } from "@/lib/admin-evidence";
import {
  projectModelsReadiness,
  type ReadinessProjectionContext,
} from "@/lib/admin-overview/readiness-projections";
import type { ConnectionsPageData } from "@/lib/connections";
import type { ProviderConnectionView } from "@/lib/connections-state";

export type ModelsTone = "healthy" | "attention" | "danger" | "muted" | "unknown";

export interface ModelsProviderAuthView {
  readonly modeLabel: string;
  readonly healthLabel: string;
  readonly health: ProviderAuthHealth | null;
  readonly tone: ModelsTone;
  readonly expiryLabel: string | null;
}

export interface ModelsRoutableView {
  readonly enabled: number;
  readonly catalog: number | null;
  readonly ratio: number | null;
  readonly label: string;
}

export interface ModelsProviderCardView {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  readonly status: ConnectionStatus;
  readonly statusLabel: string;
  readonly tone: ModelsTone;
  readonly roleLabel: ProviderConnectionView["roleLabel"];
  readonly model: string | null;
  readonly auth: ModelsProviderAuthView;
  readonly routable: ModelsRoutableView;
  readonly planLabel: string | null;
  readonly strength: string;
  readonly whenToUse: string;
  readonly stale: boolean;
  readonly lastKnownGood: boolean;
  readonly primaryActionLabel: string;
  readonly canSetAsMain: boolean;
  readonly managementHref: "/connections/providers";
}

export interface ModelsAttentionItemView {
  readonly providerId: string;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: "Re-authorize" | "Manage";
  readonly href: "/connections/providers";
  readonly stale: boolean;
}

export interface ModelsGlanceView {
  readonly connected: number | null;
  readonly providersTotal: number | null;
  readonly needsAttention: number | null;
  readonly routableModels: number | null;
  readonly leadModel: string | null;
  readonly leadProvider: string | null;
  readonly leadKnown: boolean;
  readonly stale: boolean;
}

export interface ModelsPageViewModel {
  readonly availability: AvailabilityState;
  readonly freshnessState: EvidenceEnvelope<unknown>["freshnessState"];
  readonly freshnessLabel: string;
  readonly isFreshLive: boolean;
  readonly lastKnownGood: boolean;
  readonly stateTitle: string | null;
  readonly stateDescription: string | null;
  readonly glance: ModelsGlanceView;
  readonly attentionItems: readonly ModelsAttentionItemView[];
  readonly providers: readonly ModelsProviderCardView[];
  readonly providerCount: number | null;
  readonly managementHref: "/connections/providers";
}

const managementHref = "/connections/providers" as const;

function relativeTime(value: string, evaluatedAt: string): string {
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

function freshnessLabel(
  availability: AvailabilityState,
  observedAt: string,
  evaluatedAt: string,
): string {
  const observed = relativeTime(observedAt, evaluatedAt);
  if (availability === "not-configured") return "Not configured";
  if (availability === "unavailable") return "Unavailable · last check could not complete";
  if (availability === "unknown") return `Unknown · observed ${observed}`;
  if (availability === "stale") return `Stale · checked ${observed}`;
  return `Live · checked ${observed}`;
}

function authModeLabel(mode: ConnectedAuthMode | null): string {
  if (mode === "oauth") return "OAuth";
  if (mode === "api_key") return "API key";
  if (mode === "token") return "Token";
  return "Auth mode not reported";
}

function authHealthView(provider: ProviderConnectionView): ModelsProviderAuthView {
  const health = provider.authHealth;
  if (health === "ok") {
    return {
      modeLabel: authModeLabel(provider.connectedAuthMode),
      healthLabel: "Healthy",
      health,
      tone: "healthy",
      expiryLabel: provider.expiryLabel,
    };
  }
  if (health === "static") {
    return {
      modeLabel: authModeLabel(provider.connectedAuthMode),
      healthLabel: "Static",
      health,
      tone: "healthy",
      expiryLabel: null,
    };
  }
  if (health === "expiring") {
    return {
      modeLabel: authModeLabel(provider.connectedAuthMode),
      healthLabel: "Expiring",
      health,
      tone: "attention",
      expiryLabel: provider.expiryLabel,
    };
  }
  if (health === "expired") {
    return {
      modeLabel: authModeLabel(provider.connectedAuthMode),
      healthLabel: "Expired",
      health,
      tone: "danger",
      expiryLabel: provider.expiryLabel,
    };
  }
  if (health === "missing") {
    return {
      modeLabel: authModeLabel(provider.connectedAuthMode),
      healthLabel: "Missing",
      health,
      tone: "attention",
      expiryLabel: null,
    };
  }
  return {
    modeLabel: authModeLabel(provider.connectedAuthMode),
    healthLabel: provider.status === "not_connected" ? "Not connected" : "Health unknown",
    health: null,
    tone: "muted",
    expiryLabel: null,
  };
}

function enabledCount(provider: ProviderConnectionView): number {
  return provider.enabledModels?.length ?? provider.models.length;
}

function catalogCount(provider: ProviderConnectionView): number | null {
  if (provider.catalogModels !== undefined) return provider.catalogModels.length;
  return provider.catalogModelCount ?? null;
}

function routableView(provider: ProviderConnectionView): ModelsRoutableView {
  const enabled = enabledCount(provider);
  const catalog = catalogCount(provider);
  if (catalog === null) {
    return { enabled, catalog, ratio: null, label: "Catalog unknown" };
  }
  if (catalog === 0) {
    return { enabled, catalog, ratio: 0, label: "No models advertised" };
  }
  if (provider.status === "not_connected") {
    return { enabled, catalog, ratio: 0, label: `${catalog} advertised` };
  }
  return {
    enabled,
    catalog,
    ratio: Math.min(enabled / catalog, 1),
    label: `${enabled} of ${catalog}`,
  };
}

function providerTone(provider: ProviderConnectionView, stale: boolean): ModelsTone {
  if (stale) return "unknown";
  if (provider.authHealth === "expired") return "danger";
  if (
    provider.authHealth === "expiring" ||
    provider.authHealth === "missing" ||
    provider.status === "needs_attention" ||
    provider.status === "pending"
  ) {
    return "attention";
  }
  if (provider.status === "connected") return "healthy";
  return "muted";
}

function providerStatusLabel(
  provider: ProviderConnectionView,
  stale: boolean,
  lastKnownGood: boolean,
): string {
  if (lastKnownGood) return `Last known ${provider.statusLabel.toLowerCase()}`;
  if (stale) return `Observed ${provider.statusLabel.toLowerCase()} · stale`;
  return provider.statusLabel;
}

function providerSort(left: ProviderConnectionView, right: ProviderConnectionView): number {
  const leftRole = left.roleLabel === "Lead orchestrator" ? 0 : 1;
  const rightRole = right.roleLabel === "Lead orchestrator" ? 0 : 1;
  if (leftRole !== rightRole) return leftRole - rightRole;

  const statusPriority: Readonly<Record<ConnectionStatus, number>> = {
    connected: 0,
    needs_attention: 1,
    pending: 2,
    not_connected: 3,
  };
  return (
    statusPriority[left.status] - statusPriority[right.status] ||
    left.label.localeCompare(right.label)
  );
}

function cardView(
  provider: ProviderConnectionView,
  stale: boolean,
  lastKnownGood: boolean,
): ModelsProviderCardView {
  const auth = authHealthView(provider);
  const primaryActionLabel =
    provider.status === "not_connected"
      ? `Connect ${provider.label}`
      : provider.authHealth === "expiring" || provider.authHealth === "expired"
        ? "Re-authorize"
        : "Manage";

  return {
    id: provider.id,
    label: provider.label,
    vendor: provider.vendor,
    status: provider.status,
    statusLabel: providerStatusLabel(provider, stale, lastKnownGood),
    tone: providerTone(provider, stale),
    roleLabel: provider.roleLabel,
    model: provider.model,
    auth,
    routable: routableView(provider),
    planLabel: provider.planLabel,
    strength: provider.strength,
    whenToUse: provider.whenToUse,
    stale,
    lastKnownGood,
    primaryActionLabel,
    canSetAsMain: !stale && provider.status === "connected" && provider.roleLabel === "Subagent",
    managementHref,
  };
}

function isAttentionProvider(provider: ProviderConnectionView): boolean {
  return (
    provider.authHealth === "expiring" ||
    provider.authHealth === "expired" ||
    provider.status === "needs_attention" ||
    provider.status === "pending"
  );
}

function attentionPriority(provider: ProviderConnectionView): number {
  if (provider.authHealth === "expired") return 0;
  if (provider.authHealth === "expiring") return 1;
  if (provider.status === "needs_attention") return 2;
  return 3;
}

function expiryPhrase(expiryLabel: string | null): string {
  if (expiryLabel === null) return "soon";
  return /^in\b/i.test(expiryLabel) ? expiryLabel : `in ${expiryLabel}`;
}

function staleAttentionDetail(
  lastKnownGood: boolean,
  lastKnownCopy: string,
  staleCopy: string,
): string {
  return lastKnownGood ? lastKnownCopy : staleCopy;
}

function attentionItem(
  provider: ProviderConnectionView,
  stale: boolean,
  lastKnownGood: boolean,
): ModelsAttentionItemView {
  if (provider.authHealth === "expired") {
    return {
      providerId: provider.id,
      title: `${provider.label} authorization has expired`,
      detail: stale
        ? staleAttentionDetail(
            lastKnownGood,
            "This was true in the last-known provider snapshot; current auth health is unavailable.",
            "This was true in the observed snapshot, but that evidence is now stale.",
          )
        : "Re-authorize before routing more work through this provider.",
      actionLabel: "Re-authorize",
      href: managementHref,
      stale,
    };
  }
  if (provider.authHealth === "expiring") {
    return {
      providerId: provider.id,
      title: `${provider.label} authorization expires ${expiryPhrase(provider.expiryLabel)}`,
      detail: stale
        ? staleAttentionDetail(
            lastKnownGood,
            "This countdown came from the last-known provider snapshot; current auth health is unavailable.",
            "This countdown came from stale evidence and may no longer be current.",
          )
        : "Re-authorize before it lapses so routed model calls keep working.",
      actionLabel: "Re-authorize",
      href: managementHref,
      stale,
    };
  }
  if (provider.status === "pending") {
    return {
      providerId: provider.id,
      title: `${provider.label} connection is pending`,
      detail: stale
        ? staleAttentionDetail(
            lastKnownGood,
            "The last-known snapshot retained a pending connection; current state is unavailable.",
            "The observed pending state is stale and may no longer be current.",
          )
        : "Finish or inspect the existing provider connection flow.",
      actionLabel: "Manage",
      href: managementHref,
      stale,
    };
  }
  return {
    providerId: provider.id,
    title: `${provider.label} needs attention`,
    detail: stale
      ? staleAttentionDetail(
          lastKnownGood,
          "The last-known snapshot retained an authorization problem; current state is unavailable.",
          "The observed authorization problem is stale and may no longer be current.",
        )
      : "Inspect the provider connection and restore healthy authorization.",
    actionLabel: "Manage",
    href: managementHref,
    stale,
  };
}

function stateCopy(
  availability: AvailabilityState,
  hasRetainedProviders: boolean,
): Pick<ModelsPageViewModel, "stateTitle" | "stateDescription"> {
  if (availability === "not-configured") {
    return {
      stateTitle: "Models data isn't set up",
      stateDescription:
        "Configure the provisioning worker before relying on provider or model readiness.",
    };
  }
  if (availability === "unavailable") {
    return {
      stateTitle: "Current models data is unavailable",
      stateDescription: hasRetainedProviders
        ? "The last-known provider snapshot is shown below and marked stale."
        : "No last-known provider catalog is available; no connections are inferred.",
    };
  }
  if (availability === "unknown") {
    return {
      stateTitle: "Current models data is unknown",
      stateDescription: "The provider evidence could not be verified, so no current claim is made.",
    };
  }
  if (availability === "stale") {
    return {
      stateTitle: "Models evidence is stale",
      stateDescription: "The observed provider snapshot is retained below but is not current.",
    };
  }
  return { stateTitle: null, stateDescription: null };
}

export function buildModelsPageViewModel(
  data: ConnectionsPageData,
  context: ReadinessProjectionContext,
): ModelsPageViewModel {
  const readiness = projectModelsReadiness(data, context);
  const showProviders = readiness.state !== "not-configured" && readiness.state !== "unknown";
  const sourceProviders = showProviders ? [...data.providers].sort(providerSort) : [];
  const lastKnownGood = sourceProviders.length > 0 && readiness.state === "unavailable";
  const stale = readiness.state === "stale" || lastKnownGood;
  const hasProviderEvidence =
    readiness.state === "live" || readiness.state === "stale" || lastKnownGood;
  const providers = sourceProviders.map((provider) => cardView(provider, stale, lastKnownGood));
  const attentionItems = sourceProviders
    .filter(isAttentionProvider)
    .sort(
      (left, right) =>
        attentionPriority(left) - attentionPriority(right) || left.label.localeCompare(right.label),
    )
    .map((provider) => attentionItem(provider, stale, lastKnownGood));
  const lead = sourceProviders.find((provider) => provider.roleLabel === "Lead orchestrator");
  const routableModels = sourceProviders
    .filter((provider) => provider.status === "connected")
    .reduce((total, provider) => total + enabledCount(provider), 0);
  const connected = lastKnownGood
    ? sourceProviders.filter((provider) => provider.status === "connected").length
    : (readiness.value?.connected ?? null);

  return {
    availability: readiness.state,
    freshnessState: readiness.freshnessState,
    freshnessLabel: freshnessLabel(readiness.state, data.snapshot.refreshedAt, context.evaluatedAt),
    isFreshLive: readiness.state === "live" && readiness.freshnessState === "within-budget",
    lastKnownGood,
    ...stateCopy(readiness.state, sourceProviders.length > 0),
    glance: {
      connected: hasProviderEvidence ? connected : null,
      providersTotal: hasProviderEvidence ? sourceProviders.length : null,
      needsAttention: hasProviderEvidence ? attentionItems.length : null,
      routableModels: hasProviderEvidence ? routableModels : null,
      leadModel: lead?.model ?? null,
      leadProvider: lead?.label ?? null,
      leadKnown: hasProviderEvidence,
      stale,
    },
    attentionItems,
    providers,
    providerCount: hasProviderEvidence ? sourceProviders.length : null,
    managementHref,
  };
}
