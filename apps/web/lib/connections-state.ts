import type {
  ConnectionsSnapshot,
  ConnectionStatus,
  DeviceFlowChallenge,
  DeviceFlowPollState,
  GitHubConnectionState,
  ModelProviderAuthChoice,
  ModelProviderCatalogEntry,
  OrchestratorDelegationState,
  OrchestratorSubagentRole,
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
  readonly model: string;
  readonly accountLabel: string | null;
  readonly usageLabel: string | null;
  readonly message: string | null;
  readonly strength: string;
  readonly whenToUse: string;
  readonly pendingFlow: DeviceFlowChallenge | null;
}

export interface DeviceFlowUiState {
  readonly status: "idle" | "pending" | "connected" | "expired" | "failed";
  readonly message: string;
}

export interface DeviceFlowPollSchedule {
  readonly stop: boolean;
  readonly nextDelayMs: number;
  readonly expired: boolean;
}

export interface OrchestratorConfigPlan {
  readonly agents: {
    readonly list: readonly {
      readonly id: string;
      readonly model: string;
      readonly default?: boolean;
      readonly subagents?: {
        readonly delegationMode: "prefer";
        readonly allowAgents: readonly string[];
      };
      readonly tools?: {
        readonly allow: readonly string[];
      };
    }[];
  };
  readonly receipt: {
    readonly delegationMode: "prefer";
    readonly allowAgents: readonly string[];
    readonly toolPolicyExpansion: readonly ["sessions_spawn", "subagents", "group:sessions"];
  };
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
    provider.authChoices.find((choice) => choice.mode === "device-flow") ??
    provider.authChoices.find((choice) => choice.mode === "api-key") ??
    null
  );
}

export function connectionHealthSummary(snapshot: ConnectionsSnapshot): ConnectionHealthSummary {
  const statuses: ConnectionStatus[] = [
    ...snapshot.providerCatalog.map((provider) => {
      const state = snapshot.providerConnections.find((item) => item.providerId === provider.id);
      return state?.status ?? "not_connected";
    }),
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
  >,
): readonly ProviderConnectionView[] {
  return snapshot.providerCatalog.map((provider) => {
    const state = snapshot.providerConnections.find((item) => item.providerId === provider.id);
    const apiKeyChoices = provider.authChoices.filter((choice) => choice.mode === "api-key");
    const deviceFlowChoices = provider.authChoices.filter(
      (choice) => choice.mode === "device-flow",
    );
    const pendingFlow =
      snapshot.pendingDeviceFlows.find(
        (flow) => flow.kind === "model_provider" && flow.providerId === provider.id,
      ) ?? null;
    const status = pendingFlow === null ? (state?.status ?? "not_connected") : "pending";
    const model = state?.model ?? provider.suggestedModel;

    return {
      id: provider.id,
      label: provider.label,
      vendor: provider.vendor,
      status,
      statusLabel: statusLabel(status),
      statusClassName: statusClassName(status),
      authSummary: provider.authChoices.map((choice) => choice.label).join(" / "),
      primaryAuthChoice: preferredAuthChoice(provider),
      apiKeyChoices,
      deviceFlowChoices,
      roleLabel: provider.id === "openai" ? "Lead orchestrator" : "Subagent",
      model,
      accountLabel: state?.accountLabel ?? null,
      usageLabel: state?.usageLabel ?? null,
      message: state?.message ?? null,
      strength: provider.roleStrength,
      whenToUse: provider.whenToUse,
      pendingFlow,
    };
  });
}

export function connectedProviderIds(snapshot: ConnectionsSnapshot): readonly string[] {
  return snapshot.providerConnections
    .filter((connection) => connection.status === "connected")
    .map((connection) => connection.providerId);
}

export function hasConnectedProviderOrGitHub(
  snapshot: Pick<ConnectionsSnapshot, "providerConnections" | "github">,
): boolean {
  return (
    snapshot.github.status === "connected" ||
    snapshot.providerConnections.some((connection) => connection.status === "connected")
  );
}

export function buildOrchestratorConfigPlan(input: {
  readonly providers: readonly ProviderConnectionView[];
  readonly current?: OrchestratorDelegationState;
}): OrchestratorConfigPlan {
  const orchestrator = input.providers.find((provider) => provider.id === "openai");
  const subagents: OrchestratorSubagentRole[] = input.providers
    .filter((provider) => provider.id !== "openai" && provider.status === "connected")
    .map((provider) => ({
      agentId: `subagent-${provider.id}`,
      providerId: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      strength: provider.strength,
      whenToUse: provider.whenToUse,
    }));
  const allowAgents = subagents.map((subagent) => subagent.agentId);

  return {
    agents: {
      list: [
        {
          id: input.current?.orchestratorAgentId ?? "ask-admin-opzava",
          model: orchestrator?.model ?? input.current?.orchestratorModel ?? "openai/gpt-5.5",
          default: true,
          subagents: {
            delegationMode: "prefer",
            allowAgents,
          },
          tools: {
            allow: ["sessions_spawn", "subagents", "group:sessions"],
          },
        },
        ...subagents.map((subagent) => ({
          id: subagent.agentId,
          model: subagent.model,
        })),
      ],
    },
    receipt: {
      delegationMode: "prefer",
      allowAgents,
      toolPolicyExpansion: ["sessions_spawn", "subagents", "group:sessions"],
    },
  };
}

export function deviceFlowReducer(
  current: DeviceFlowUiState,
  event: DeviceFlowPollState,
): DeviceFlowUiState {
  if (event.status === "connected") {
    return { status: "connected", message: event.message ?? "Connected." };
  }

  if (event.status === "expired") {
    return { status: "expired", message: event.message ?? "Device code expired." };
  }

  if (event.status === "failed") {
    return { status: "failed", message: event.message ?? "Connection failed." };
  }

  return {
    status: "pending",
    message: event.message ?? current.message,
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
