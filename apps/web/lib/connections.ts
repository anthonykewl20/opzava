import type {
  ConnectionsProvisioningPort,
  ConnectionsSnapshot,
  ConnectionProvisioningPrincipal,
  DeviceFlowChallenge,
  DeviceFlowPollState,
  GitHubConnectionState,
  OrchestratorDelegationState,
  ProviderConnectionState,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  buildOrchestratorConfigPlan,
  connectedProviderIds,
  connectionHealthSummary,
  githubConnectionSummary,
  providerConnectionSummary,
  projectProviderConnections,
  type ConnectionHealthSummary,
  type OrchestratorConfigPlan,
  type ProviderConnectionSummary,
  type ProviderConnectionView,
} from "@/lib/connections-state";
import type { AppSessionContext } from "@/lib/session";

export interface ConnectionsPageData {
  readonly snapshot: ConnectionsSnapshot;
  readonly health: ConnectionHealthSummary;
  readonly providerSummary: ProviderConnectionSummary;
  readonly providers: readonly ProviderConnectionView[];
  readonly orchestratorPlan: OrchestratorConfigPlan;
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

  public async connectModelProviderApiKey(): Promise<Result<ProviderConnectionState>> {
    return err(this.error());
  }

  public async startModelProviderDeviceFlow(): Promise<Result<DeviceFlowChallenge>> {
    return err(this.error());
  }

  public async pollDeviceFlow(): Promise<Result<DeviceFlowPollState>> {
    return err(this.error());
  }

  public async disconnectModelProvider(): Promise<Result<ProviderConnectionState>> {
    return err(this.error());
  }

  public async applyOrchestratorDelegation(): Promise<Result<OrchestratorDelegationState>> {
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

  public async connectModelProviderApiKey(input: {
    readonly orgId: string;
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly roleKeys: readonly string[];
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly apiKey: string;
  }): Promise<Result<ProviderConnectionState>> {
    return this.request<ProviderConnectionState>("/internal/connections/model/api-key", input);
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

  public async disconnectModelProvider(input: {
    readonly orgId: string;
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly roleKeys: readonly string[];
    readonly providerId: string;
  }): Promise<Result<ProviderConnectionState>> {
    return this.request<ProviderConnectionState>("/internal/connections/model/disconnect", input);
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

  private async request<T>(path: string, body: unknown): Promise<Result<T>> {
    try {
      const response = await fetch(`${this.config.url}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
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
          "Provisioning worker request failed.",
          error,
        ),
      );
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
        orchestratorPlan: buildOrchestratorConfigPlan({
          providers,
          current: fallback.orchestrator,
        }),
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
    orchestratorPlan: buildOrchestratorConfigPlan({
      providers,
      current: snapshot.value.orchestrator,
    }),
    githubSummary: githubConnectionSummary(snapshot.value.github),
    provisioningAvailable: snapshot.value.gateway.status === "active",
  });
}

export async function connectModelProviderApiKeyForContext(
  input: {
    readonly context: AppSessionContext;
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly apiKey: string;
  },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ProviderConnectionState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  const apiKey = input.apiKey.trim();
  if (apiKey.length === 0) {
    return err(connectionsError("web.connectionsApiKeyRequired", "API key is required."));
  }

  return dependencies.provisioningPort.connectModelProviderApiKey({
    ...principalFromContext(input.context),
    providerId: input.providerId,
    authChoiceId: input.authChoiceId,
    apiKey,
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

export async function disconnectModelProviderForContext(
  input: { readonly context: AppSessionContext; readonly providerId: string },
  dependencies: ConnectionsDependencies = defaultConnectionsDependencies(),
): Promise<Result<ProviderConnectionState>> {
  const allowed = requireConnectionMutationRole(input.context);
  if (!allowed.ok) {
    return err(allowed.error);
  }

  return dependencies.provisioningPort.disconnectModelProvider({
    ...principalFromContext(input.context),
    providerId: input.providerId,
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
