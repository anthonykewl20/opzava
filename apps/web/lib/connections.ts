import type {
  ConnectionsProvisioningPort,
  ConnectionsSnapshot,
  ConnectionProvisioningPrincipal,
  DeviceFlowChallenge,
  DeviceFlowPollState,
  GitHubConnectionState,
  ModelProviderApiKeyConnectPollState,
  ModelProviderApiKeyConnectStart,
  ModelProviderDisconnectPollState,
  ModelProviderDisconnectStart,
  OrchestratorDelegationState,
  ProviderConnectionState,
  SetupTokenFlowPollState,
  SetupTokenFlowStart,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  connectedProviderIds,
  connectionHealthSummary,
  githubConnectionSummary,
  providerConnectionSummary,
  projectProviderConnections,
  type ConnectionHealthSummary,
  type ProviderConnectionSummary,
  type ProviderConnectionView,
} from "@/lib/connections-state";
import type { AppSessionContext } from "@/lib/session";

export interface ConnectionsPageData {
  readonly snapshot: ConnectionsSnapshot;
  readonly health: ConnectionHealthSummary;
  readonly providerSummary: ProviderConnectionSummary;
  readonly providers: readonly ProviderConnectionView[];
  readonly githubSummary: string;
  readonly provisioningAvailable: boolean;
}

export interface ConnectionsDependencies {
  readonly provisioningPort: ConnectionsProvisioningPort;
  readonly now?: () => Date;
}

interface InternalProvisioningConfig {
  readonly url: string;
  readonly token: string;
}

const workerRequestTimeoutMs = 20_000;
// The model toggle op verifies routability against a possibly-reloading gateway before answering
// (bounded by its own 12s wall-clock budget plus one read round-trip), so its request window must
// sit ABOVE the worker's worst case — a shorter window would abort a mutation that then commits
// server-side, which is the sync-cliff this route exists to avoid.
const modelToggleRequestTimeoutMs = 30_000;

function connectionsError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function principalFromContext(context: AppSessionContext): ConnectionProvisioningPrincipal {
  return {
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actorUserId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

export function requireConnectionMutationRole(context: AppSessionContext): Result<void> {
  if (context.roleKeys.includes("owner") || context.roleKeys.includes("admin")) {
    return ok(undefined);
  }

  return err(
    connectionsError(
      "web.connectionsForbidden",
      "Only workspace owners and admins can manage provider connections.",
    ),
  );
}

function readGitHubIssuesRepository(source: NodeJS.ProcessEnv = process.env): string {
  const value = source["GITHUB_ISSUES_REPOSITORY"] ?? "anthonykewl20/opzava";
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error("Invalid GitHub issues repository: expected owner/name.");
  }

  return normalized;
}

function readProvisioningConfig(
  source: NodeJS.ProcessEnv = process.env,
): Result<InternalProvisioningConfig> {
  const url =
    source["PROVISIONING_WORKER_URL"]?.trim() ?? source["PROVISIONING_INTERNAL_URL"]?.trim();
  const token =
    source["PROVISIONING_WORKER_TOKEN"]?.trim() ?? source["PROVISIONING_INTERNAL_TOKEN"]?.trim();
  if (url === undefined || url === "" || token === undefined || token === "") {
    return err(
      connectionsError(
        "web.connectionsProvisioningNotConfigured",
        "PROVISIONING_WORKER_URL and PROVISIONING_WORKER_TOKEN are not configured.",
      ),
    );
  }

  try {
    return ok({
      url: new URL(url).toString().replace(/\/$/, ""),
      token,
    });
  } catch (error) {
    return err(
      connectionsError(
        "web.connectionsProvisioningInvalidConfig",
        "Provisioning worker URL is invalid.",
        error,
      ),
    );
  }
}

function unavailableSnapshot(input: {
  readonly repository: string;
  readonly now: Date;
}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "unavailable",
      region: null,
      authLabel: "Opzava Gateway unavailable",
      lastHeartbeatAt: null,
      message:
        "Configure PROVISIONING_WORKER_URL and PROVISIONING_WORKER_TOKEN to connect providers.",
    },
    providerCatalog: [],
    providerConnections: [],
    pendingDeviceFlows: [],
    github: {
      status: "not_connected",
      accountLabel: null,
      scopes: [],
      repository: input.repository,
      lastCheckedAt: null,
      message: "GitHub connection is managed by the provisioning worker.",
    },
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5.5",
      orchestratorProviderId: null,
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
      },
      updatedAt: null,
    },
    refreshedAt: input.now.toISOString(),
  };
}

class UnavailableConnectionsProvisioningPort implements ConnectionsProvisioningPort {
  public constructor(private readonly now: () => Date) {}

  public async getConnectionsSnapshot(): Promise<Result<ConnectionsSnapshot>> {
    return ok(unavailableSnapshot({ repository: readGitHubIssuesRepository(), now: this.now() }));
  }

  public async startModelProviderApiKeyConnect(): Promise<Result<ModelProviderApiKeyConnectStart>> {
    return err(this.error());
  }

  public async pollModelProviderApiKeyConnect(): Promise<
    Result<ModelProviderApiKeyConnectPollState>
  > {
    return err(this.error());
  }

  public async startModelProviderSetupTokenFlow(): Promise<Result<SetupTokenFlowStart>> {
    return err(this.error());
  }

  public async pollModelProviderSetupTokenFlow(): Promise<Result<SetupTokenFlowPollState>> {
    return err(this.error());
  }

  public async submitModelProviderSetupTokenCode(): Promise<
    Result<{ readonly status: "pending" }>
  > {
    return err(this.error());
  }

  public async startModelProviderDeviceFlow(): Promise<Result<DeviceFlowChallenge>> {
    return err(this.error());
  }

  public async pollDeviceFlow(): Promise<Result<DeviceFlowPollState>> {
    return err(this.error());
  }

  public async startModelProviderDisconnect(): Promise<Result<ModelProviderDisconnectStart>> {
    return err(this.error());
  }

  public async pollModelProviderDisconnect(): Promise<Result<ModelProviderDisconnectPollState>> {
    return err(this.error());
  }

  public async setModelProviderModelEnabled(): Promise<Result<ProviderConnectionState>> {
    return err(this.error());
  }

  public async applyOrchestratorDelegation(): Promise<Result<OrchestratorDelegationState>> {
    return err(this.error());
  }

  public async setMainOrchestrator(): Promise<Result<OrchestratorDelegationState>> {
    return err(this.error());
  }

  public async startGitHubDeviceFlow(): Promise<Result<DeviceFlowChallenge>> {
    return err(this.error());
  }

  public async disconnectGitHub(): Promise<Result<GitHubConnectionState>> {
    return err(this.error());
  }

  private error(): DomainError {
    return connectionsError(
      "web.connectionsProvisioningNotConfigured",
      "PROVISIONING_WORKER_URL and PROVISIONING_WORKER_TOKEN are not configured.",
    );
  }
}

class InternalConnectionsProvisioningClient implements ConnectionsProvisioningPort {
  public constructor(private readonly config: InternalProvisioningConfig) {}

  public async getConnectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<ConnectionsSnapshot>> {
    return this.request<ConnectionsSnapshot>("/internal/connections/snapshot", input);
  }

  public async startModelProviderApiKeyConnect(input: {
    readonly orgId: string;
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly roleKeys: readonly string[];
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly apiKey: string;
  }): Promise<Result<ModelProviderApiKeyConnectStart>> {
    return this.request<ModelProviderApiKeyConnectStart>(
      "/internal/connections/model/api-key",
      input,
    );
  }

  public async pollModelProviderApiKeyConnect(
    input: ConnectionProvisioningPrincipal & { readonly opId: string },
  ): Promise<Result<ModelProviderApiKeyConnectPollState>> {
    return this.request<ModelProviderApiKeyConnectPollState>(
      "/internal/connections/model/api-key/poll",
      input,
    );
  }

  public async startModelProviderSetupTokenFlow(
    input: ConnectionProvisioningPrincipal & { readonly providerId: string },
  ): Promise<Result<SetupTokenFlowStart>> {
    return this.request<SetupTokenFlowStart>("/internal/connections/model/setup-token", input);
  }

  public async pollModelProviderSetupTokenFlow(
    input: ConnectionProvisioningPrincipal & { readonly flowId: string },
  ): Promise<Result<SetupTokenFlowPollState>> {
    return this.request<SetupTokenFlowPollState>(
      "/internal/connections/model/setup-token/poll",
      input,
    );
  }

  public async submitModelProviderSetupTokenCode(
    input: ConnectionProvisioningPrincipal & { readonly flowId: string; readonly code: string },
  ): Promise<Result<{ readonly status: "pending" }>> {
    return this.request<{ readonly status: "pending" }>(
      "/internal/connections/model/setup-token/code",
      input,
    );
  }

  public async startModelProviderDeviceFlow(input: {
    readonly orgId: string;
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly roleKeys: readonly string[];
    readonly providerId: string;
    readonly authChoiceId: string;
  }): Promise<Result<DeviceFlowChallenge>> {
    return this.request<DeviceFlowChallenge>("/internal/connections/model/device-flow", input);
  }

  public async pollDeviceFlow(
    input: ConnectionProvisioningPrincipal & { readonly flowId: string },
  ): Promise<Result<DeviceFlowPollState>> {
    return this.request<DeviceFlowPollState>("/internal/connections/device-flow/poll", input);
  }

  public async startModelProviderDisconnect(input: {
    readonly orgId: string;
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly roleKeys: readonly string[];
    readonly providerId: string;
  }): Promise<Result<ModelProviderDisconnectStart>> {
    return this.request<ModelProviderDisconnectStart>(
      "/internal/connections/model/disconnect",
      input,
    );
  }

  public async pollModelProviderDisconnect(
    input: ConnectionProvisioningPrincipal & { readonly opId: string },
  ): Promise<Result<ModelProviderDisconnectPollState>> {
    return this.request<ModelProviderDisconnectPollState>(
      "/internal/connections/model/disconnect/poll",
      input,
    );
  }

  public async setModelProviderModelEnabled(
    input: ConnectionProvisioningPrincipal & {
      readonly providerId: string;
      readonly modelId: string;
      readonly enabled: boolean;
    },
  ): Promise<Result<ProviderConnectionState>> {
    return this.request<ProviderConnectionState>("/internal/connections/model/models", input, {
      timeoutMs: modelToggleRequestTimeoutMs,
    });
  }

  public async applyOrchestratorDelegation(input: {
    readonly orgId: string;
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly roleKeys: readonly string[];
    readonly connectedProviderIds: readonly string[];
  }): Promise<Result<OrchestratorDelegationState>> {
    return this.request<OrchestratorDelegationState>(
      "/internal/connections/orchestrator/apply",
      input,
    );
  }

  public async setMainOrchestrator(
    input: ConnectionProvisioningPrincipal & { readonly providerId: string },
  ): Promise<Result<OrchestratorDelegationState>> {
    return this.request<OrchestratorDelegationState>(
      "/internal/connections/orchestrator/set-main",
      input,
    );
  }

  public async startGitHubDeviceFlow(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<DeviceFlowChallenge>> {
    return this.request<DeviceFlowChallenge>("/internal/connections/github/device-flow", input);
  }

  public async disconnectGitHub(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<GitHubConnectionState>> {
    return this.request<GitHubConnectionState>("/internal/connections/github/disconnect", input);
  }

  private async request<T>(
    path: string,
    body: unknown,
    options?: { readonly timeoutMs?: number },
  ): Promise<Result<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? workerRequestTimeoutMs,
    );
    try {
      const response = await fetch(`${this.config.url}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        const payloadCode =
          typeof payload === "object" && payload !== null && "code" in payload
            ? (payload as { readonly code?: unknown }).code
            : null;
        const payloadDetails =
          typeof payload === "object" && payload !== null && "details" in payload
            ? (payload as { readonly details?: unknown }).details
            : undefined;
        return err(
          new DomainError({
            code:
              typeof payloadCode === "string" ? payloadCode : "web.connectionsProvisioningFailed",
            message:
              typeof payload === "object" && payload !== null && "message" in payload
                ? String((payload as { readonly message?: unknown }).message)
                : "Provisioning worker request failed.",
            ...(typeof payloadDetails === "object" && payloadDetails !== null
              ? { details: payloadDetails as Readonly<Record<string, unknown>> }
              : {}),
          }),
        );
      }

      return ok(payload as T);
    } catch (error) {
      return err(
        connectionsError(
          "web.connectionsProvisioningFailed",
          error instanceof DOMException && error.name === "AbortError"
            ? "Provisioning worker request timed out."
            : "Provisioning worker request failed.",
          error,
        ),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function defaultConnectionsProvisioningPort(
  now: () => Date = () => new Date(),
): ConnectionsProvisioningPort {
  const config = readProvisioningConfig();
  return config.ok
    ? new InternalConnectionsProvisioningClient(config.value)
    : new UnavailableConnectionsProvisioningPort(now);
}

export function defaultConnectionsDependencies(): ConnectionsDependencies {
  return {
    provisioningPort: defaultConnectionsProvisioningPort(),
  };
}

export async function loadConnectionsPageData(
  context: AppSessionContext,
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ConnectionsPageData>> {
  const snapshot = await dependencies.provisioningPort.getConnectionsSnapshot(
    principalFromContext(context),
  );
  if (!snapshot.ok) {
    const code = errorCode(snapshot.error);
    if (
      code === "web.connectionsProvisioningFailed" ||
      code === "web.connectionsProvisioningNotConfigured"
    ) {
      const fallback = unavailableSnapshot({
        repository: readGitHubIssuesRepository(),
        now: dependencies.now?.() ?? new Date(),
      });
      const providers = projectProviderConnections(fallback);
      const providerSummary = providerConnectionSummary(fallback);
      return ok({
        snapshot: fallback,
        health: connectionHealthSummary(fallback),
        providerSummary,
        providers,
        githubSummary: githubConnectionSummary(fallback.github),
        provisioningAvailable: false,
      });
    }

    return err(snapshot.error);
  }

  const providers = projectProviderConnections(snapshot.value);
  const providerSummary = providerConnectionSummary(snapshot.value);
  return ok({
    snapshot: snapshot.value,
    health: connectionHealthSummary(snapshot.value),
    providerSummary,
    providers,
    githubSummary: githubConnectionSummary(snapshot.value.github),
    provisioningAvailable: snapshot.value.gateway.status === "active",
  });
}

export async function startModelProviderApiKeyConnectForContext(
  input: {
    readonly context: AppSessionContext;
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly apiKey: string;
  },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ModelProviderApiKeyConnectStart>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  const apiKey = input.apiKey.trim();
  if (apiKey.length === 0) {
    return err(
      connectionsError("web.connectionsApiKeyRequired", "Provider credential is required."),
    );
  }

  return dependencies.provisioningPort.startModelProviderApiKeyConnect({
    ...principalFromContext(input.context),
    providerId: input.providerId,
    authChoiceId: input.authChoiceId,
    apiKey,
  });
}

export async function pollModelProviderApiKeyConnectForContext(
  input: { readonly context: AppSessionContext; readonly opId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ModelProviderApiKeyConnectPollState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.pollModelProviderApiKeyConnect({
    ...principalFromContext(input.context),
    opId: input.opId,
  });
}

export async function startModelProviderSetupTokenFlowForContext(
  input: { readonly context: AppSessionContext; readonly providerId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<SetupTokenFlowStart>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.startModelProviderSetupTokenFlow({
    ...principalFromContext(input.context),
    providerId: input.providerId,
  });
}

export async function pollModelProviderSetupTokenFlowForContext(
  input: { readonly context: AppSessionContext; readonly flowId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<SetupTokenFlowPollState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.pollModelProviderSetupTokenFlow({
    ...principalFromContext(input.context),
    flowId: input.flowId,
  });
}

export async function submitModelProviderSetupTokenCodeForContext(
  input: { readonly context: AppSessionContext; readonly flowId: string; readonly code: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<{ readonly status: "pending" }>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.submitModelProviderSetupTokenCode({
    ...principalFromContext(input.context),
    flowId: input.flowId,
    code: input.code,
  });
}

export async function startModelProviderDeviceFlowForContext(
  input: {
    readonly context: AppSessionContext;
    readonly providerId: string;
    readonly authChoiceId: string;
  },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<DeviceFlowChallenge>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.startModelProviderDeviceFlow({
    ...principalFromContext(input.context),
    providerId: input.providerId,
    authChoiceId: input.authChoiceId,
  });
}

export async function pollConnectionDeviceFlowForContext(
  input: { readonly context: AppSessionContext; readonly flowId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<DeviceFlowPollState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.pollDeviceFlow({
    ...principalFromContext(input.context),
    flowId: input.flowId,
  });
}

export async function startModelProviderDisconnectForContext(
  input: { readonly context: AppSessionContext; readonly providerId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ModelProviderDisconnectStart>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.startModelProviderDisconnect({
    ...principalFromContext(input.context),
    providerId: input.providerId,
  });
}

export async function pollModelProviderDisconnectForContext(
  input: { readonly context: AppSessionContext; readonly opId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ModelProviderDisconnectPollState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.pollModelProviderDisconnect({
    ...principalFromContext(input.context),
    opId: input.opId,
  });
}

export async function setModelProviderModelEnabledForContext(
  input: {
    readonly context: AppSessionContext;
    readonly providerId: string;
    readonly modelId: string;
    readonly enabled: boolean;
  },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ProviderConnectionState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.setModelProviderModelEnabled({
    ...principalFromContext(input.context),
    providerId: input.providerId,
    modelId: input.modelId,
    enabled: input.enabled,
  });
}

export async function applyOrchestratorRolesForContext(
  context: AppSessionContext,
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<OrchestratorDelegationState>> {
  const allowed = requireConnectionMutationRole(context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  const snapshot = await dependencies.provisioningPort.getConnectionsSnapshot(
    principalFromContext(context),
  );
  if (!snapshot.ok) {
    return err(snapshot.error);
  }

  return dependencies.provisioningPort.applyOrchestratorDelegation({
    ...principalFromContext(context),
    connectedProviderIds: connectedProviderIds(snapshot.value),
  });
}

export async function setMainOrchestratorForContext(
  context: AppSessionContext,
  providerId: string,
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<OrchestratorDelegationState>> {
  const allowed = requireConnectionMutationRole(context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.setMainOrchestrator({
    ...principalFromContext(context),
    providerId,
  });
}

export async function startGitHubDeviceFlowForContext(
  context: AppSessionContext,
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<DeviceFlowChallenge>> {
  const allowed = requireConnectionMutationRole(context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.startGitHubDeviceFlow(principalFromContext(context));
}

export async function disconnectGitHubForContext(
  context: AppSessionContext,
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<GitHubConnectionState>> {
  const allowed = requireConnectionMutationRole(context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.disconnectGitHub(principalFromContext(context));
}
