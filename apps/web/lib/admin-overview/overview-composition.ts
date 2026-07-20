import type {
  OpenClawAuditActivityPage,
  OpenClawAuditEvent,
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
} from "@opzava/ports";
import { err, makeTenantId, type Result } from "@opzava/shared-kernel";

import {
  ADMIN_FRESHNESS_BUDGET_MS,
  CompositionCache,
  composeState,
  deriveAvailabilityState,
  type AvailabilityState,
  type CompositePart,
  type CompositeState,
  type EvidenceEnvelope,
  type EvidenceInput,
  type EvidenceProvenance,
} from "@/lib/admin-evidence";
import {
  projectGatewayReadiness,
  projectHealthReadiness,
  projectIntegrationsReadiness,
  projectModelsReadiness,
  type GatewayReadiness,
  type HealthReadiness,
  type IntegrationsReadiness,
  type ModelsReadiness,
} from "@/lib/admin-overview/readiness-projections";
import { askAdminRouteId } from "@/lib/ask-admin-history";
import { readBrokerInternalEnv } from "@/lib/broker-internal-env";
import { loadConnectionsPageDataForRequest, type ConnectionsPageData } from "@/lib/connections";
import { overviewProviders } from "@/lib/connections-overview";
import { openclawHealthSummary } from "@/lib/connections-state";
import { createBrokerOpenClawGatewayPort } from "@/lib/openclaw-gateway-broker";
import type { AppSessionContext } from "@/lib/session";

const COMPOSITION_SCHEMA_VERSION = "admin-overview.variant-a.v1";
const RECENT_ACTIVITY_LIMIT = 15;

export type AdminOverviewSectionId =
  "needs-your-attention" | "active-delivery" | "development-readiness" | "recent-activity";

export interface AdminOverviewAttentionRow {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: "Fix" | "Waiting for approval" | "Inspect";
  readonly href: "/connections" | "/connections/providers";
  readonly state: AvailabilityState;
  readonly freshnessState: EvidenceEnvelope<unknown>["freshnessState"];
  readonly observedAt: string;
  readonly sourceOwner: string;
}

interface AttentionRowValue {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: AdminOverviewAttentionRow["actionLabel"];
  readonly href: AdminOverviewAttentionRow["href"];
}

export interface AdminOverviewActivityRow {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorLabel: "Agent run" | "Tool action" | "Inbound message" | "Outbound message";
  readonly summary: string;
  readonly sourceLabel: "OpenClaw audit";
  readonly href: "/connections";
  readonly state: AvailabilityState;
  readonly freshnessState: EvidenceEnvelope<unknown>["freshnessState"];
}

interface ActivityRowValue {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorLabel: AdminOverviewActivityRow["actorLabel"];
  readonly summary: string;
  readonly sourceLabel: AdminOverviewActivityRow["sourceLabel"];
  readonly href: AdminOverviewActivityRow["href"];
}

interface AdminOverviewEvidenceValueMap {
  readonly "attention-providers": readonly AttentionRowValue[];
  readonly "attention-health": readonly AttentionRowValue[];
  readonly "active-delivery": never;
  readonly "readiness-health": HealthReadiness;
  readonly "readiness-gateway": GatewayReadiness;
  readonly "readiness-models": ModelsReadiness;
  readonly "readiness-integrations": IntegrationsReadiness;
  readonly "recent-activity": readonly ActivityRowValue[];
}

type AdminOverviewEvidenceKind = keyof AdminOverviewEvidenceValueMap;

type CachedEvidenceFor<K extends AdminOverviewEvidenceKind> = {
  readonly kind: K;
  readonly value: AdminOverviewEvidenceValueMap[K];
};

export interface AdminOverviewCachedEvidence {
  readonly kind: AdminOverviewEvidenceKind;
  readonly value: AdminOverviewEvidenceValueMap[AdminOverviewEvidenceKind];
}

type ReadinessValue = HealthReadiness | GatewayReadiness | ModelsReadiness | IntegrationsReadiness;

export interface AdminOverviewReadinessRow {
  readonly id: "health" | "gateway" | "models" | "integrations";
  readonly label: "OpenClaw health" | "Gateway" | "Model providers" | "GitHub integration";
  readonly href: "/connections/system" | "/connections/providers" | "/connections/github";
  readonly envelope: EvidenceEnvelope<ReadinessValue>;
}

interface SectionBase {
  readonly id: AdminOverviewSectionId;
  readonly title: string;
  readonly note: string;
  readonly status: CompositeState<CompositePart>;
}

export interface NeedsYourAttentionSection extends SectionBase {
  readonly id: "needs-your-attention";
  readonly title: "Needs Your Attention";
  readonly envelopes: readonly EvidenceEnvelope<readonly AttentionRowValue[]>[];
  readonly rows: readonly AdminOverviewAttentionRow[];
  readonly empty: boolean;
}

export interface ActiveDeliverySection extends SectionBase {
  readonly id: "active-delivery";
  readonly title: "Active Delivery";
  readonly envelope: EvidenceEnvelope<never>;
  readonly rows: readonly [];
  readonly message: string;
}

export interface DevelopmentReadinessSection extends SectionBase {
  readonly id: "development-readiness";
  readonly title: "Development Readiness";
  readonly envelopes: readonly EvidenceEnvelope<ReadinessValue>[];
  readonly rows: readonly AdminOverviewReadinessRow[];
}

export interface RecentActivitySection extends SectionBase {
  readonly id: "recent-activity";
  readonly title: "Recent Activity";
  readonly envelope: EvidenceEnvelope<readonly ActivityRowValue[]>;
  readonly rows: readonly AdminOverviewActivityRow[];
  readonly empty: boolean;
}

export type AdminOverviewSection =
  | NeedsYourAttentionSection
  | ActiveDeliverySection
  | DevelopmentReadinessSection
  | RecentActivitySection;

export interface AdminOverview {
  readonly evaluatedAt: string;
  readonly needsYourAttention: NeedsYourAttentionSection;
  readonly activeDelivery: ActiveDeliverySection;
  readonly developmentReadiness: DevelopmentReadinessSection;
  readonly recentActivity: RecentActivitySection;
  readonly sections: readonly [
    NeedsYourAttentionSection,
    ActiveDeliverySection,
    DevelopmentReadinessSection,
    RecentActivitySection,
  ];
}

export interface AdminOverviewDependencies {
  readonly loadConnectionsPageData: typeof loadConnectionsPageDataForRequest;
  readonly readRecentActivity: (
    context: AppSessionContext,
  ) => Promise<Result<OpenClawAuditActivityPage>>;
  readonly now: () => Date;
  readonly observationGeneration: number;
  readonly authorizationVersion: string;
  readonly cache?: CompositionCache<AdminOverviewCachedEvidence>;
}

const defaultCache = new CompositionCache<AdminOverviewCachedEvidence>();

function staleAfter(observedAt: string, freshnessBudgetMs: number): string {
  const observedAtMs = Date.parse(observedAt);
  return Number.isFinite(observedAtMs)
    ? new Date(observedAtMs + freshnessBudgetMs).toISOString()
    : observedAt;
}

function evidenceIdentity(input: {
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly sourceTimestamp: string | null;
  readonly observedAt: string;
  readonly freshnessBudgetMs: number;
  readonly observationGeneration: number;
  readonly sourceVersion?: EvidenceInput<unknown>["sourceVersion"];
}) {
  return {
    sourceOwner: input.sourceOwner,
    sourceId: input.sourceId,
    provenance: input.provenance,
    sourceVersion: input.sourceVersion ?? null,
    sourceTimestamp: input.sourceTimestamp,
    observedAt: input.observedAt,
    staleAfter: staleAfter(input.observedAt, input.freshnessBudgetMs),
    observationGeneration: input.observationGeneration,
  } as const;
}

function liveInput<K extends AdminOverviewEvidenceKind>(input: {
  readonly kind: K;
  readonly value: AdminOverviewEvidenceValueMap[K];
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly sourceTimestamp: string | null;
  readonly observedAt: string;
  readonly freshnessBudgetMs: number;
  readonly observationGeneration: number;
  readonly sourceVersion?: EvidenceInput<unknown>["sourceVersion"];
}): EvidenceInput<AdminOverviewCachedEvidence> {
  return {
    ...evidenceIdentity(input),
    kind: "snapshot",
    declaredState: "live",
    value: { kind: input.kind, value: input.value },
    lastKnownGood: false,
  };
}

function unavailableInput(input: {
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly evaluatedAt: string;
  readonly freshnessBudgetMs: number;
  readonly observationGeneration: number;
}): EvidenceInput<AdminOverviewCachedEvidence> {
  return {
    ...evidenceIdentity({
      ...input,
      sourceTimestamp: null,
      observedAt: input.evaluatedAt,
    }),
    kind: "read-failure",
    state: "unavailable",
    value: null,
  };
}

function unknownInput(input: {
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly sourceTimestamp: string | null;
  readonly observedAt: string;
  readonly freshnessBudgetMs: number;
  readonly observationGeneration: number;
}): EvidenceInput<AdminOverviewCachedEvidence> {
  return {
    ...evidenceIdentity(input),
    kind: "no-evidence",
    value: null,
  };
}

function notConfiguredInput(input: {
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly evaluatedAt: string;
  readonly freshnessBudgetMs: number;
  readonly observationGeneration: number;
}): EvidenceInput<AdminOverviewCachedEvidence> {
  return {
    ...evidenceIdentity({
      ...input,
      sourceTimestamp: null,
      observedAt: input.evaluatedAt,
    }),
    kind: "snapshot",
    declaredState: "not-configured",
    value: null,
    lastKnownGood: false,
  };
}

function envelopeInput<K extends AdminOverviewEvidenceKind>(
  envelope: EvidenceEnvelope<AdminOverviewEvidenceValueMap[K]>,
  kind: K,
  requiredFactPresent: boolean,
): EvidenceInput<AdminOverviewCachedEvidence> {
  const identity = {
    sourceOwner: envelope.sourceOwner,
    sourceId: envelope.sourceId,
    provenance: envelope.provenance,
    sourceVersion: envelope.sourceVersion,
    sourceTimestamp: envelope.sourceTimestamp,
    observedAt: envelope.observedAt,
    staleAfter: envelope.staleAfter,
    observationGeneration: envelope.observationGeneration,
  } as const;

  if (!requiredFactPresent) {
    return { ...identity, kind: "no-evidence", value: null };
  }
  if (envelope.state === "unavailable") {
    return { ...identity, kind: "read-failure", state: "unavailable", value: null };
  }
  if (envelope.state === "unknown" && envelope.value === null) {
    return { ...identity, kind: "no-evidence", value: null };
  }
  if (envelope.state === "not-configured") {
    return {
      ...identity,
      kind: "snapshot",
      declaredState: "not-configured",
      value: null,
      lastKnownGood: false,
    };
  }
  if (envelope.value === null) {
    return { ...identity, kind: "no-evidence", value: null };
  }
  return {
    ...identity,
    kind: "snapshot",
    declaredState: "live",
    value: { kind, value: envelope.value },
    lastKnownGood: envelope.lastKnownGood,
  };
}

function providerAttentionRows(pageData: ConnectionsPageData): readonly AttentionRowValue[] {
  return overviewProviders(pageData.providers)
    .filter((provider) => provider.status === "needs_attention" || provider.status === "pending")
    .map((provider) => ({
      id: `provider:${provider.id}`,
      title: provider.label,
      detail:
        provider.status === "pending"
          ? "Provider connection is waiting for approval."
          : "Provider connection needs attention before it can be relied on.",
      actionLabel: provider.status === "pending" ? "Waiting for approval" : "Fix",
      href: provider.href,
    }));
}

function healthAttentionRows(pageData: ConnectionsPageData): readonly AttentionRowValue[] {
  const health = pageData.snapshot.openclawHealth;
  const summary = openclawHealthSummary(health);
  if (summary.attention === 0) return [];

  return health.components
    .filter((component) => component.status === "attention")
    .map((component) => ({
      id: `health:${component.id}`,
      title: component.label,
      detail: "OpenClaw health check needs inspection.",
      actionLabel: "Inspect",
      href: "/connections",
    }));
}

const readinessFailureDefinitions = [
  {
    sourceOwner: "OpenClaw/Platform",
    sourceId: "openclaw-health-readiness",
    provenance: {
      label: "OpenClaw system health",
      href: "/connections/system",
      diagnosticRef: "openclaw-health",
    },
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
  },
  {
    sourceOwner: "OpenClaw Gateway",
    sourceId: "gateway-readiness",
    provenance: {
      label: "Gateway connection",
      href: "/connections/system",
      diagnosticRef: "gateway-connection",
    },
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
  },
  {
    sourceOwner: "OpenClaw Models",
    sourceId: "models-readiness",
    provenance: {
      label: "Model providers",
      href: "/connections/providers",
      diagnosticRef: "model-provider-connections",
    },
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
  },
  {
    sourceOwner: "GitHub",
    sourceId: "github-integration-readiness",
    provenance: {
      label: "GitHub integration",
      href: "/connections/github",
      diagnosticRef: "github-connection",
    },
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
  },
] as const;

function connectionEvidence(
  pageData: ConnectionsPageData,
  evaluatedAt: string,
  observationGeneration: number,
): readonly EvidenceInput<AdminOverviewCachedEvidence>[] {
  const snapshot = pageData.snapshot;
  const attentionInputs: readonly EvidenceInput<AdminOverviewCachedEvidence>[] =
    !pageData.provisioningAvailable || snapshot.gateway.status !== "active"
      ? [
          unavailableInput({
            sourceOwner: "OpenClaw Models",
            sourceId: "overview-provider-attention",
            provenance: {
              label: "Model provider connections",
              href: "/connections/providers",
              diagnosticRef: "model-provider-connections",
            },
            evaluatedAt,
            freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
            observationGeneration,
          }),
          unavailableInput({
            sourceOwner: "OpenClaw/Platform",
            sourceId: "overview-health-attention",
            provenance: {
              label: "OpenClaw system health",
              href: "/connections/system",
              diagnosticRef: "openclaw-health",
            },
            evaluatedAt,
            freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
            observationGeneration,
          }),
        ]
      : [
          liveInput({
            kind: "attention-providers",
            value: providerAttentionRows(pageData),
            sourceOwner: "OpenClaw Models",
            sourceId: "overview-provider-attention",
            provenance: {
              label: "Model provider connections",
              href: "/connections/providers",
              diagnosticRef: "model-provider-connections",
            },
            sourceTimestamp: snapshot.refreshedAt,
            observedAt: snapshot.refreshedAt,
            freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
            observationGeneration,
          }),
          ...(snapshot.openclawHealth.checkedAt === null
            ? [
                unknownInput({
                  sourceOwner: "OpenClaw/Platform",
                  sourceId: "overview-health-attention",
                  provenance: {
                    label: "OpenClaw system health",
                    href: "/connections/system",
                    diagnosticRef: "openclaw-health",
                  },
                  sourceTimestamp: null,
                  observedAt: snapshot.refreshedAt,
                  freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
                  observationGeneration,
                }),
              ]
            : [
                liveInput({
                  kind: "attention-health",
                  value: healthAttentionRows(pageData),
                  sourceOwner: "OpenClaw/Platform",
                  sourceId: "overview-health-attention",
                  provenance: {
                    label: "OpenClaw system health",
                    href: "/connections/system",
                    diagnosticRef: "openclaw-health",
                  },
                  sourceTimestamp: snapshot.openclawHealth.checkedAt,
                  observedAt: snapshot.refreshedAt,
                  freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
                  observationGeneration,
                }),
              ]),
        ];

  const projectionContext = { evaluatedAt, observationGeneration };
  const health = projectHealthReadiness(pageData, projectionContext);
  const gateway = projectGatewayReadiness(pageData, projectionContext);
  const models = projectModelsReadiness(pageData, projectionContext);
  const integrations = projectIntegrationsReadiness(pageData, projectionContext);

  return [
    ...attentionInputs,
    envelopeInput(
      health,
      "readiness-health",
      health.value === null || health.value.componentsTotal !== 0,
    ),
    envelopeInput(
      gateway,
      "readiness-gateway",
      gateway.value === null || gateway.value.lastHeartbeatAt !== null,
    ),
    envelopeInput(models, "readiness-models", true),
    envelopeInput(integrations, "readiness-integrations", true),
  ];
}

function failedConnectionEvidence(
  evaluatedAt: string,
  observationGeneration: number,
): readonly EvidenceInput<AdminOverviewCachedEvidence>[] {
  const attention = [
    {
      sourceOwner: "OpenClaw Models",
      sourceId: "overview-provider-attention",
      provenance: {
        label: "Model provider connections",
        href: "/connections/providers",
        diagnosticRef: "model-provider-connections",
      },
      freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
    },
    {
      sourceOwner: "OpenClaw/Platform",
      sourceId: "overview-health-attention",
      provenance: {
        label: "OpenClaw system health",
        href: "/connections/system",
        diagnosticRef: "openclaw-health",
      },
      freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
    },
  ] as const;

  return [...attention, ...readinessFailureDefinitions].map((definition) =>
    unavailableInput({ ...definition, evaluatedAt, observationGeneration }),
  );
}

function errorCode(error: unknown, depth = 0): string | null {
  if (depth > 5 || typeof error !== "object" || error === null) return null;
  const code = (error as { readonly code?: unknown }).code;
  if (typeof code === "string") return code;
  return errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function auditFailureState(error: unknown): "not-configured" | "unavailable" {
  const code = errorCode(error) ?? "";
  return code.endsWith(".auditUnsupported") ? "not-configured" : "unavailable";
}

function activityActor(event: OpenClawAuditEvent): AdminOverviewActivityRow["actorLabel"] {
  if (event.eventType === "agent_run") return "Agent run";
  if (event.eventType === "tool_action") return "Tool action";
  return event.eventType === "inbound_message" ? "Inbound message" : "Outbound message";
}

function activitySummary(event: OpenClawAuditEvent): string {
  const status = event.status.replaceAll("_", " ");
  if (event.eventType === "inbound_message") {
    return `Inbound message ${event.outcome.replaceAll("_", " ")} · ${status}`;
  }
  if (event.eventType === "outbound_message") {
    return `Outbound message ${event.outcome.replaceAll("_", " ")} · ${status}`;
  }
  return `${event.eventType === "agent_run" ? "Agent run" : "Tool action"} ${status}`;
}

function safeActivityRows(events: readonly OpenClawAuditEvent[]): readonly ActivityRowValue[] {
  return [...events]
    .sort(
      (left, right) =>
        right.occurredAt - left.occurredAt ||
        left.eventId.localeCompare(right.eventId) ||
        right.sequence - left.sequence,
    )
    .map((event) => ({
      id: `audit-${event.sequence}`,
      occurredAt: new Date(event.occurredAt).toISOString(),
      actorLabel: activityActor(event),
      summary: activitySummary(event),
      sourceLabel: "OpenClaw audit",
      href: "/connections",
    }));
}

function activityEvidence(
  result: Result<OpenClawAuditActivityPage>,
  evaluatedAt: string,
  observationGeneration: number,
): EvidenceInput<AdminOverviewCachedEvidence> {
  const definition = {
    sourceOwner: "OpenClaw Audit",
    sourceId: "overview-recent-activity",
    provenance: {
      label: "OpenClaw audit activity",
      href: "/connections",
      diagnosticRef: "audit.activity.list",
    },
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
    evaluatedAt,
    observationGeneration,
  } as const;

  if (!result.ok) {
    return auditFailureState(result.error) === "not-configured"
      ? notConfiguredInput(definition)
      : unavailableInput(definition);
  }

  const rows = safeActivityRows(result.value.events);
  const newest = rows[0]?.occurredAt ?? null;
  const newestSequence = result.value.events.reduce(
    (current, event) => Math.max(current, event.sequence),
    0,
  );
  return liveInput({
    ...definition,
    kind: "recent-activity",
    value: rows,
    sourceTimestamp: newest,
    observedAt: evaluatedAt,
    sourceVersion: { kind: "sequence", value: String(newestSequence) },
  });
}

async function readRecentActivity(
  context: AppSessionContext,
): Promise<Result<OpenClawAuditActivityPage>> {
  const env = readBrokerInternalEnv();
  const gateway: OpenClawGatewayPort = createBrokerOpenClawGatewayPort({
    baseUrl: env.BROKER_INTERNAL_URL,
    internalToken: env.BROKER_INTERNAL_TOKEN,
  });
  const route = await gateway.forPrincipal({
    routeId: askAdminRouteId as OpenClawGatewayRouteId,
    actingPrincipal: { tenantId: makeTenantId(context.orgId) },
  });
  if (!route.ok) return err(route.error);
  return route.value.auditActivityList({ limit: RECENT_ACTIVITY_LIMIT });
}

function defaultDependencies(context: AppSessionContext): AdminOverviewDependencies {
  const now = new Date();
  return {
    loadConnectionsPageData: loadConnectionsPageDataForRequest,
    readRecentActivity,
    now: () => now,
    observationGeneration: now.getTime(),
    // The session resolver supplies membership-version + issued-at. The session id fallback keeps
    // older injected contexts isolated until X1 makes authorizationVersion a first-class contract.
    authorizationVersion: context.authorizationVersion ?? `session:${context.sessionId}`,
    cache: defaultCache,
  };
}

function cachedEnvelope<K extends AdminOverviewEvidenceKind>(
  envelope: EvidenceEnvelope<AdminOverviewCachedEvidence>,
  kind: K,
): EvidenceEnvelope<AdminOverviewEvidenceValueMap[K]> {
  const value =
    envelope.value?.kind === kind ? (envelope.value as CachedEvidenceFor<K>).value : null;
  return { ...envelope, value };
}

function envelopePart(
  id: string,
  envelope: EvidenceEnvelope<unknown>,
  freshnessBudgetMs: number,
): CompositePart {
  return {
    id,
    required: true,
    state: envelope.state,
    freshnessBudgetMs,
    lastKnownGood: envelope.lastKnownGood,
  };
}

function envelopeBySourceId(
  evidence: readonly EvidenceEnvelope<AdminOverviewCachedEvidence>[],
  sourceId: string,
): EvidenceEnvelope<AdminOverviewCachedEvidence> {
  const envelope = evidence.find((candidate) => candidate.sourceId === sourceId);
  if (envelope === undefined) {
    throw new Error(`Admin Overview cache is missing required evidence: ${sourceId}`);
  }
  return envelope;
}

function composeFromEvidence(
  evidence: readonly EvidenceEnvelope<AdminOverviewCachedEvidence>[],
  evaluatedAt: string,
): AdminOverview {
  const providerAttention = cachedEnvelope(
    envelopeBySourceId(evidence, "overview-provider-attention"),
    "attention-providers",
  );
  const healthAttention = cachedEnvelope(
    envelopeBySourceId(evidence, "overview-health-attention"),
    "attention-health",
  );
  const attentionEnvelopes = [providerAttention, healthAttention] as const;
  const attentionRows = [...attentionEnvelopes]
    .sort((left, right) => {
      const leftTime = left.sourceTimestamp === null ? 0 : Date.parse(left.sourceTimestamp);
      const rightTime = right.sourceTimestamp === null ? 0 : Date.parse(right.sourceTimestamp);
      return rightTime - leftTime || left.sourceId.localeCompare(right.sourceId);
    })
    .flatMap((envelope) =>
      (envelope.value ?? []).map((row) => ({
        ...row,
        state: envelope.state,
        freshnessState: envelope.freshnessState,
        observedAt: envelope.observedAt,
        sourceOwner: envelope.sourceOwner,
      })),
    );
  const needsYourAttention: NeedsYourAttentionSection = {
    id: "needs-your-attention",
    title: "Needs Your Attention",
    note: "Provider approvals and degraded platform capabilities that need an owner response.",
    envelopes: attentionEnvelopes,
    rows: attentionRows,
    empty: attentionRows.length === 0 && attentionEnvelopes.every((item) => item.state === "live"),
    status: composeState([
      envelopePart(
        "provider-attention",
        providerAttention,
        ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill,
      ),
      envelopePart("health-attention", healthAttention, ADMIN_FRESHNESS_BUDGET_MS.gatewaySession),
    ]),
  };

  const activeDeliveryEnvelope = cachedEnvelope(
    envelopeBySourceId(evidence, "overview-active-delivery"),
    "active-delivery",
  );
  const activeDelivery: ActiveDeliverySection = {
    id: "active-delivery",
    title: "Active Delivery",
    note: "Dev Board delivery and Runner execution will appear here when their owner source lands.",
    envelope: activeDeliveryEnvelope,
    rows: [],
    message: "Active Delivery is not yet available. No delivery counts are inferred.",
    status: composeState([
      envelopePart(
        "active-delivery",
        activeDeliveryEnvelope,
        ADMIN_FRESHNESS_BUDGET_MS.opzavaRecordAndReceipt,
      ),
    ]),
  };

  const health = cachedEnvelope(
    envelopeBySourceId(evidence, "openclaw-health-readiness"),
    "readiness-health",
  );
  const gateway = cachedEnvelope(
    envelopeBySourceId(evidence, "gateway-readiness"),
    "readiness-gateway",
  );
  const models = cachedEnvelope(
    envelopeBySourceId(evidence, "models-readiness"),
    "readiness-models",
  );
  const integrations = cachedEnvelope(
    envelopeBySourceId(evidence, "github-integration-readiness"),
    "readiness-integrations",
  );
  const readinessEnvelopes: readonly EvidenceEnvelope<ReadinessValue>[] = [
    health,
    gateway,
    models,
    integrations,
  ];
  const developmentReadiness: DevelopmentReadinessSection = {
    id: "development-readiness",
    title: "Development Readiness",
    note: "Current evidence for the capabilities required to continue development work.",
    envelopes: readinessEnvelopes,
    rows: [
      { id: "health", label: "OpenClaw health", href: "/connections/system", envelope: health },
      { id: "gateway", label: "Gateway", href: "/connections/system", envelope: gateway },
      { id: "models", label: "Model providers", href: "/connections/providers", envelope: models },
      {
        id: "integrations",
        label: "GitHub integration",
        href: "/connections/github",
        envelope: integrations,
      },
    ],
    status: composeState([
      envelopePart("health", health, ADMIN_FRESHNESS_BUDGET_MS.gatewaySession),
      envelopePart("gateway", gateway, ADMIN_FRESHNESS_BUDGET_MS.gatewaySession),
      envelopePart("models", models, ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill),
      envelopePart("integrations", integrations, ADMIN_FRESHNESS_BUDGET_MS.providerAuthAndSkill),
    ]),
  };

  const activityEnvelope = cachedEnvelope(
    envelopeBySourceId(evidence, "overview-recent-activity"),
    "recent-activity",
  );
  const activityRows = (activityEnvelope.value ?? []).map((row) => ({
    ...row,
    state: activityEnvelope.state,
    freshnessState: activityEnvelope.freshnessState,
  }));
  const recentActivity: RecentActivitySection = {
    id: "recent-activity",
    title: "Recent Activity",
    note: "Recent metadata-only runtime events from the OpenClaw audit ledger.",
    envelope: activityEnvelope,
    rows: activityRows,
    empty: activityRows.length === 0 && activityEnvelope.state === "live",
    status: composeState([
      envelopePart("recent-activity", activityEnvelope, ADMIN_FRESHNESS_BUDGET_MS.gatewaySession),
    ]),
  };

  return {
    evaluatedAt,
    needsYourAttention,
    activeDelivery,
    developmentReadiness,
    recentActivity,
    sections: [needsYourAttention, activeDelivery, developmentReadiness, recentActivity],
  };
}

export async function composeAdminOverview(
  context: AppSessionContext,
  overrides: Partial<AdminOverviewDependencies> = {},
): Promise<AdminOverview> {
  const deps = { ...defaultDependencies(context), ...overrides };
  const evaluatedAt = deps.now().toISOString();
  const cache = deps.cache ?? defaultCache;
  const cacheKey = {
    tenantId: context.orgId,
    userId: context.user.id,
    authorizationVersion: deps.authorizationVersion,
    compositionSchemaVersion: COMPOSITION_SCHEMA_VERSION,
  } as const;
  const cached = cache.get(cacheKey, evaluatedAt);
  if (cached !== null && cached.every((envelope) => envelope.freshnessState === "within-budget")) {
    return composeFromEvidence(cached, evaluatedAt);
  }

  const [connections, activity] = await Promise.allSettled([
    Promise.resolve().then(() => deps.loadConnectionsPageData(context)),
    Promise.resolve().then(() => deps.readRecentActivity(context)),
  ]);
  const connectionInputs =
    connections.status === "fulfilled" && connections.value.ok
      ? connectionEvidence(connections.value.value, evaluatedAt, deps.observationGeneration)
      : failedConnectionEvidence(evaluatedAt, deps.observationGeneration);
  const activityInput =
    activity.status === "fulfilled"
      ? activityEvidence(activity.value, evaluatedAt, deps.observationGeneration)
      : unavailableInput({
          sourceOwner: "OpenClaw Audit",
          sourceId: "overview-recent-activity",
          provenance: {
            label: "OpenClaw audit activity",
            href: "/connections",
            diagnosticRef: "audit.activity.list",
          },
          evaluatedAt,
          freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.gatewaySession,
          observationGeneration: deps.observationGeneration,
        });
  const activeDeliveryInput = notConfiguredInput({
    sourceOwner: "Dev Board",
    sourceId: "overview-active-delivery",
    provenance: {
      label: "Dev Board delivery",
      href: "/dev-board",
      diagnosticRef: null,
    },
    evaluatedAt,
    freshnessBudgetMs: ADMIN_FRESHNESS_BUDGET_MS.opzavaRecordAndReceipt,
    observationGeneration: deps.observationGeneration,
  });
  const inputs = [...connectionInputs, activeDeliveryInput, activityInput];
  cache.set(cacheKey, inputs);

  return composeFromEvidence(
    inputs.map((input) => deriveAvailabilityState(input, evaluatedAt)),
    evaluatedAt,
  );
}
