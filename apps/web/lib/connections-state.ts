import {
  classifyModelProvider,
  listProviderTierIds,
  providerTierLabel,
  providerTier,
  type ConnectedAuthMode,
  type ConnectionsSnapshot,
  type ConnectionStatus,
  type DeviceFlowChallenge,
  type DeviceFlowPollState,
  type GitHubConnectionState,
  type ModelSummary,
  type ModelProviderAuthChoice,
  type ModelProviderCatalogEntry,
  type OrchestratorDelegationState,
  type ProviderAuthHealth,
  type ProviderCategory,
  type ProviderConnectionState,
  type ProviderTier,
} from "@opzava/ports";

export interface ConnectionHealthSummary {
  readonly total: number;
  readonly connected: number;
  readonly needsAttention: number;
  readonly pending: number;
}

export interface ProviderConnectionSummary extends ConnectionHealthSummary {
  readonly available: number;
  readonly notConnected: number;
}

export interface ProviderConnectionView {
  readonly id: string;
  /** The RAW gateway provider id that resolved this row's connection state (the folded child when a
   * runtime backs the parent). Disconnect targets THIS, not the display/group id. */
  readonly connectionProviderId: string;
  readonly label: string;
  readonly vendor: string;
  readonly status: ConnectionStatus;
  readonly statusLabel: string;
  readonly statusClassName: string;
  readonly authSummary: string;
  readonly primaryAuthChoice: ModelProviderAuthChoice | null;
  readonly apiKeyChoices: readonly ModelProviderAuthChoice[];
  readonly deviceFlowChoices: readonly ModelProviderAuthChoice[];
  readonly roleLabel: "Lead orchestrator" | "Subagent";
  readonly model: string | null;
  readonly runtimeLabels: readonly string[];
  readonly models: readonly ModelSummary[];
  readonly authHealth: ProviderAuthHealth | null;
  readonly expiryLabel: string | null;
  readonly planLabel: string | null;
  readonly connectedAuthMode: ConnectedAuthMode | null;
  readonly accountLabel: string | null;
  readonly usageLabel: string | null;
  readonly message: string | null;
  readonly strength: string;
  readonly whenToUse: string;
  readonly pendingFlow: DeviceFlowChallenge | null;
  readonly tier: ProviderTier;
  readonly tierLabel: string;
}

export interface ProviderConnectionTierView {
  readonly id: ProviderTier;
  readonly label: string;
  readonly collapsed: boolean;
  readonly providers: readonly ProviderConnectionView[];
}

export interface DeviceFlowUiState {
  readonly status: "idle" | "pending" | "connected" | "expired" | "failed";
  readonly message: string;
  readonly verificationUri?: string;
  readonly userCode?: string;
  readonly codePending?: boolean;
}

export interface DeviceFlowPollSchedule {
  readonly stop: boolean;
  readonly nextDelayMs: number;
  readonly expired: boolean;
}

export function statusLabel(status: ConnectionStatus): string {
  if (status === "connected") {
    return "Connected";
  }

  if (status === "pending") {
    return "Waiting for approval";
  }

  if (status === "needs_attention") {
    return "Needs attention";
  }

  return "Not connected";
}

export function statusClassName(status: ConnectionStatus): string {
  if (status === "connected") {
    return "dot dot-success dot-beat";
  }

  if (status === "pending" || status === "needs_attention") {
    return "dot dot-warning";
  }

  return "dot";
}

export function authBranchForChoice(choice: ModelProviderAuthChoice): "api-key" | "device-flow" {
  return choice.mode;
}

export function preferredAuthChoice(
  provider: ModelProviderCatalogEntry,
): ModelProviderAuthChoice | null {
  return (
    provider.authChoices.find((choice) =>
      `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token"),
    ) ??
    provider.authChoices.find((choice) => choice.mode === "device-flow") ??
    provider.authChoices.find((choice) => choice.mode === "api-key") ??
    null
  );
}

export function connectionHealthSummary(snapshot: ConnectionsSnapshot): ConnectionHealthSummary {
  const statuses: ConnectionStatus[] = [
    ...projectModelProviders(snapshot).map((provider) => provider.status),
    snapshot.github.status,
    snapshot.gateway.status === "active" ? "connected" : "needs_attention",
  ];

  return {
    total: statuses.length,
    connected: statuses.filter((status) => status === "connected").length,
    needsAttention: statuses.filter((status) => status === "needs_attention").length,
    pending: statuses.filter((status) => status === "pending").length,
  };
}

export function providerConnectionSummary(
  snapshot: Pick<
    ConnectionsSnapshot,
    "providerCatalog" | "providerConnections" | "pendingDeviceFlows"
  >,
): ProviderConnectionSummary {
  const statuses = projectProviderConnections(snapshot).map((provider) => provider.status);

  return {
    total: statuses.length,
    available: statuses.filter((status) => status !== "connected").length,
    connected: statuses.filter((status) => status === "connected").length,
    needsAttention: statuses.filter((status) => status === "needs_attention").length,
    pending: statuses.filter((status) => status === "pending").length,
    notConnected: statuses.filter((status) => status === "not_connected").length,
  };
}

export function projectProviderConnections(
  snapshot: Pick<
    ConnectionsSnapshot,
    "providerCatalog" | "providerConnections" | "pendingDeviceFlows"
  > & { readonly orchestrator?: Pick<OrchestratorDelegationState, "orchestratorProviderId"> },
): readonly ProviderConnectionView[] {
  return projectModelProviders(snapshot);
}

interface ProviderClassificationView {
  readonly category: ProviderCategory;
  readonly parentId: string | null;
  readonly runtimeLabel: string | null;
  readonly canonicalLabel: string | null;
}

interface ProviderGroupAccumulator {
  readonly id: string;
  label: string;
  vendor: string;
  suggestedModel: string;
  roleStrength: string;
  whenToUse: string;
  readonly authChoices: Map<string, ModelProviderAuthChoice>;
  readonly runtimeLabels: Set<string>;
  readonly models: Map<string, ModelSummary>;
  readonly providerIds: Set<string>;
}

function providerClassification(provider: ModelProviderCatalogEntry): ProviderClassificationView {
  const fallback = classifyModelProvider(provider.id);

  return {
    category: provider.category ?? fallback.category,
    parentId: provider.parentId === undefined ? fallback.parentId : provider.parentId,
    runtimeLabel:
      provider.runtimeLabel === undefined ? fallback.runtimeLabel : provider.runtimeLabel,
    canonicalLabel: fallback.canonicalLabel,
  };
}

function createProviderGroup(
  provider: ModelProviderCatalogEntry,
  classification: ProviderClassificationView,
): ProviderGroupAccumulator {
  return {
    id: provider.id,
    label: classification.canonicalLabel ?? provider.label,
    vendor: provider.vendor,
    suggestedModel: provider.suggestedModel,
    roleStrength: provider.roleStrength,
    whenToUse: provider.whenToUse,
    authChoices: new Map(),
    runtimeLabels: new Set(),
    models: new Map(),
    providerIds: new Set([provider.id]),
  };
}

function addProviderToGroup(
  group: ProviderGroupAccumulator,
  provider: ModelProviderCatalogEntry,
  classification: ProviderClassificationView,
  folded: boolean,
): void {
  group.providerIds.add(provider.id);

  if (!folded) {
    group.label = classification.canonicalLabel ?? provider.label;
    group.vendor = provider.vendor;
    group.suggestedModel = provider.suggestedModel;
    group.roleStrength = provider.roleStrength;
    group.whenToUse = provider.whenToUse;
  }

  for (const choice of provider.authChoices) {
    group.authChoices.set(`${choice.mode}:${choice.id}`, choice);
  }

  for (const model of provider.models ?? []) {
    group.models.set(model.id, model);
  }

  if (folded) {
    const runtimeLabel =
      classification.runtimeLabel ?? classification.canonicalLabel ?? provider.label;
    if (runtimeLabel.trim() !== "") {
      group.runtimeLabels.add(runtimeLabel);
    }
  }
}

function providerStateForGroup(
  providerIds: ReadonlySet<string>,
  parentId: string,
  states: readonly ProviderConnectionState[],
): ProviderConnectionState | null {
  // A REAL parent signal (connected / needs_attention / pending) is authoritative: a folded runtime
  // being connected must never mask a parent that needs_attention (codex review #3). But the worker
  // synthesizes a `not_connected` row for EVERY catalog provider, so a bare not_connected parent must
  // NOT mask a connected folded runtime that genuinely backs it (codex convergence re-review). So:
  // parent wins only when it carries a real signal; otherwise a connected/attention/pending child does.
  const parentState = states.find((state) => state.providerId === parentId) ?? null;
  if (parentState !== null && parentState.status !== "not_connected") {
    return parentState;
  }

  const groupedStates = states.filter((state) => providerIds.has(state.providerId));
  return (
    groupedStates.find((state) => state.status === "connected") ??
    groupedStates.find((state) => state.status === "needs_attention") ??
    groupedStates.find((state) => state.status === "pending") ??
    parentState ??
    groupedStates[0] ??
    null
  );
}

function pendingFlowForGroup(
  providerIds: ReadonlySet<string>,
  flows: readonly DeviceFlowChallenge[],
): DeviceFlowChallenge | null {
  return (
    flows.find((flow) => flow.kind === "model_provider" && providerIds.has(flow.providerId)) ?? null
  );
}

function providerGroupToCatalogEntry(group: ProviderGroupAccumulator): ModelProviderCatalogEntry {
  return {
    id: group.id,
    label: group.label,
    vendor: group.vendor,
    authChoices: [...group.authChoices.values()],
    suggestedModel: group.suggestedModel,
    roleStrength: group.roleStrength,
    whenToUse: group.whenToUse,
    models: [...group.models.values()],
  };
}

export function projectModelProviders(
  snapshot: Pick<
    ConnectionsSnapshot,
    "providerCatalog" | "providerConnections" | "pendingDeviceFlows"
  > & { readonly orchestrator?: Pick<OrchestratorDelegationState, "orchestratorProviderId"> },
): readonly ProviderConnectionView[] {
  const orchestratorProviderId = snapshot.orchestrator?.orchestratorProviderId ?? null;
  const classifications = new Map(
    snapshot.providerCatalog.map((provider) => [provider.id, providerClassification(provider)]),
  );
  const parentIds = new Set(
    snapshot.providerCatalog
      .filter((provider) => {
        const classification = classifications.get(provider.id);
        return classification?.category === "llm" && classification.parentId === null;
      })
      .map((provider) => provider.id),
  );
  const catalogById = new Map(snapshot.providerCatalog.map((provider) => [provider.id, provider]));
  const groups = new Map<string, ProviderGroupAccumulator>();

  for (const provider of snapshot.providerCatalog) {
    const classification = classifications.get(provider.id) ?? providerClassification(provider);
    if (classification.category !== "llm") {
      continue;
    }

    const parentId = classification.parentId;
    const foldsIntoCatalogParent = parentId !== null && parentIds.has(parentId);
    const groupId = foldsIntoCatalogParent ? parentId : provider.id;
    const groupSource = catalogById.get(groupId) ?? provider;
    const groupClassification =
      classifications.get(groupSource.id) ?? providerClassification(groupSource);
    const existing = groups.get(groupId) ?? createProviderGroup(groupSource, groupClassification);
    groups.set(groupId, existing);

    addProviderToGroup(existing, provider, classification, foldsIntoCatalogParent);
  }

  return [...groups.values()]
    .map((group): ProviderConnectionView => {
      const state = providerStateForGroup(
        group.providerIds,
        group.id,
        snapshot.providerConnections,
      );
      const provider = providerGroupToCatalogEntry(group);
      const apiKeyChoices = provider.authChoices.filter((choice) => choice.mode === "api-key");
      const deviceFlowChoices = provider.authChoices.filter(
        (choice) => choice.mode === "device-flow",
      );
      const pendingFlow = pendingFlowForGroup(group.providerIds, snapshot.pendingDeviceFlows);
      const status = pendingFlow === null ? (state?.status ?? "not_connected") : "pending";
      const models = [...group.models.values()]
        .sort(
          (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
        )
        .slice(0, 6);
      const model = state?.model ?? models[0]?.id ?? null;
      const tier = providerTier(group.id);
      const connectionProviderId = state?.providerId ?? group.id;

      return {
        id: group.id,
        connectionProviderId,
        label: group.label,
        vendor: group.vendor,
        status,
        statusLabel: statusLabel(status),
        statusClassName: statusClassName(status),
        authSummary: provider.authChoices.map((choice) => choice.label).join(" / "),
        primaryAuthChoice: preferredAuthChoice(provider),
        apiKeyChoices,
        deviceFlowChoices,
        roleLabel:
          orchestratorProviderId !== null && connectionProviderId === orchestratorProviderId
            ? "Lead orchestrator"
            : "Subagent",
        model,
        runtimeLabels: [...group.runtimeLabels].sort((left, right) => left.localeCompare(right)),
        models,
        authHealth: state?.authHealth ?? null,
        expiryLabel: state?.expiryLabel ?? null,
        planLabel: state?.planLabel ?? null,
        connectedAuthMode: state?.connectedAuthMode ?? null,
        accountLabel: state?.accountLabel ?? null,
        usageLabel: state?.usageLabel ?? null,
        message: state?.message ?? null,
        strength: group.roleStrength,
        whenToUse: group.whenToUse,
        pendingFlow,
        tier,
        tierLabel: providerTierLabel(tier),
      };
    })
    .sort((left, right) => {
      const leftConnected = left.status === "connected" ? 0 : 1;
      const rightConnected = right.status === "connected" ? 0 : 1;
      return leftConnected === rightConnected
        ? left.label.localeCompare(right.label)
        : leftConnected - rightConnected;
    });
}

export function groupProviderConnectionsByTier(
  providers: readonly ProviderConnectionView[],
): readonly ProviderConnectionTierView[] {
  return listProviderTierIds().map((id): ProviderConnectionTierView => ({
    id,
    label: providerTierLabel(id),
    collapsed: id === "other",
    providers: providers.filter((provider) => provider.tier === id),
  })).filter((group) => group.providers.length > 0);
}

export function connectedProviderIds(snapshot: ConnectionsSnapshot): readonly string[] {
  // Must return RAW gateway provider ids: the worker's applyOrchestratorDelegation matches these
  // against `providerConnections[].providerId` (e.g. a CLI-synced `claude-cli`). Returning grouped
  // parent ids here silently dropped folded runtimes from delegation (codex/Claude review MED-1).
  return snapshot.providerConnections
    .filter((connection) => connection.status === "connected")
    .map((connection) => connection.providerId);
}

export function hasConnectedProviderOrGitHub(
  snapshot: Pick<ConnectionsSnapshot, "providerConnections" | "github">,
): boolean {
  // "Any connection" for the shell gate: GitHub, or any connected provider that is a canonical LLM.
  // A connected non-LLM provider (curated out of the surface) must never claim a connection the user
  // cannot see. Kept catalog-independent so it holds even before the catalog snapshot resolves.
  return (
    snapshot.github.status === "connected" ||
    snapshot.providerConnections.some(
      (connection) =>
        connection.status === "connected" &&
        classifyModelProvider(connection.providerId).category === "llm",
    )
  );
}

function deviceFlowCodeFields(input: {
  readonly current: DeviceFlowUiState;
  readonly event: DeviceFlowPollState;
}): Pick<DeviceFlowUiState, "verificationUri" | "userCode"> {
  const verificationUri = input.event.verificationUri ?? input.current.verificationUri;
  const userCode = input.event.userCode ?? input.current.userCode;
  return {
    ...(verificationUri === undefined ? {} : { verificationUri }),
    ...(userCode === undefined ? {} : { userCode }),
  };
}

export function deviceFlowReducer(
  current: DeviceFlowUiState,
  event: DeviceFlowPollState,
): DeviceFlowUiState {
  if (event.status === "connected") {
    return {
      status: "connected",
      message: event.message ?? "Connected.",
      ...deviceFlowCodeFields({ current, event }),
      codePending: false,
    };
  }

  if (event.status === "expired") {
    return {
      status: "expired",
      message: event.message ?? "Device code expired.",
      ...deviceFlowCodeFields({ current, event }),
      codePending: false,
    };
  }

  if (event.status === "failed") {
    return {
      status: "failed",
      message: event.message ?? "Connection failed.",
      ...deviceFlowCodeFields({ current, event }),
      codePending: false,
    };
  }

  const verificationUri = event.verificationUri ?? current.verificationUri;
  const userCode = event.userCode ?? current.userCode;
  const codePending =
    event.codePending ?? (verificationUri === undefined || userCode === undefined);

  return {
    status: "pending",
    message: event.message ?? (codePending ? "Requesting device code..." : current.message),
    ...(verificationUri === undefined ? {} : { verificationUri }),
    ...(userCode === undefined ? {} : { userCode }),
    codePending,
  };
}

export function isTerminalDeviceFlowStatus(
  status: DeviceFlowUiState["status"] | DeviceFlowPollState["status"] | "error",
): boolean {
  return (
    status === "connected" || status === "expired" || status === "failed" || status === "error"
  );
}

export function nextDeviceFlowPollDelayMs(input: {
  readonly baseIntervalSeconds: number;
  readonly previousDelayMs: number;
  readonly event?: DeviceFlowPollState;
}): number {
  const hintedSeconds = input.event?.intervalSeconds;
  if (typeof hintedSeconds === "number" && Number.isFinite(hintedSeconds) && hintedSeconds > 0) {
    return Math.min(Math.max(Math.ceil(hintedSeconds) * 1000, 2_000), 60_000);
  }

  return Math.min(
    Math.max(input.previousDelayMs * 2, Math.max(input.baseIntervalSeconds, 2) * 1000),
    60_000,
  );
}

export function deviceFlowPollSchedule(input: {
  readonly status: DeviceFlowUiState["status"] | DeviceFlowPollState["status"] | "error";
  readonly expiresAt: string;
  readonly nowMs: number;
  readonly baseIntervalSeconds: number;
  readonly previousDelayMs: number;
  readonly event?: DeviceFlowPollState;
}): DeviceFlowPollSchedule {
  const expiresAtMs = Date.parse(input.expiresAt);
  const expired = Number.isFinite(expiresAtMs) && input.nowMs >= expiresAtMs;
  if (expired || isTerminalDeviceFlowStatus(input.status)) {
    return {
      stop: true,
      expired,
      nextDelayMs: 0,
    };
  }

  return {
    stop: false,
    expired: false,
    nextDelayMs: nextDeviceFlowPollDelayMs({
      baseIntervalSeconds: input.baseIntervalSeconds,
      previousDelayMs: input.previousDelayMs,
      ...(input.event === undefined ? {} : { event: input.event }),
    }),
  };
}

export function githubConnectionSummary(github: GitHubConnectionState): string {
  if (github.status !== "connected") {
    return github.message ?? "Connect GitHub to sync and close issues.";
  }

  const scopeLabel = github.scopes.length === 0 ? "scopes unknown" : github.scopes.join(", ");
  return `${github.accountLabel ?? "GitHub"} · ${scopeLabel} · ${github.repository}`;
}
