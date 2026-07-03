import type { Result } from "@opzava/shared-kernel";

export type ConnectionAuthMode = "api-key" | "device-flow";
export type ConnectionStatus = "connected" | "not_connected" | "pending" | "needs_attention";

export interface ConnectionProvisioningPrincipal {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly roleKeys: readonly string[];
}

export interface ModelProviderAuthChoice {
  readonly id: string;
  readonly label: string;
  readonly mode: ConnectionAuthMode;
  readonly providerId: string;
  readonly keyFlag?: string;
  readonly docsPath?: string;
}

export interface ModelProviderCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  readonly docsPath?: string;
  readonly authChoices: readonly ModelProviderAuthChoice[];
  readonly suggestedModel: string;
  readonly roleStrength: string;
  readonly whenToUse: string;
}

export interface ProviderConnectionState {
  readonly providerId: string;
  readonly status: ConnectionStatus;
  readonly authChoiceId: string | null;
  readonly accountLabel: string | null;
  readonly scopes: readonly string[];
  readonly model: string | null;
  readonly usageLabel: string | null;
  readonly lastCheckedAt: string | null;
  readonly message: string | null;
}

export interface GatewayConnectionState {
  readonly status: "active" | "unavailable";
  readonly region: string | null;
  readonly authLabel: string;
  readonly lastHeartbeatAt: string | null;
  readonly message: string | null;
}

export interface GitHubConnectionState {
  readonly status: ConnectionStatus;
  readonly accountLabel: string | null;
  readonly scopes: readonly string[];
  readonly repository: string;
  readonly lastCheckedAt: string | null;
  readonly message: string | null;
}

export interface DeviceFlowChallenge {
  readonly flowId: string;
  readonly kind: "model_provider" | "github";
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
}

export interface DeviceFlowPollState {
  readonly status: "pending" | "connected" | "expired" | "failed";
  readonly message: string | null;
  readonly intervalSeconds?: number;
  readonly connection?: ProviderConnectionState | GitHubConnectionState;
}

export interface OrchestratorSubagentRole {
  readonly agentId: string;
  readonly providerId: string;
  readonly providerLabel: string;
  readonly model: string;
  readonly strength: string;
  readonly whenToUse: string;
}

export interface OrchestratorDelegationState {
  readonly orchestratorAgentId: string;
  readonly orchestratorModel: string;
  readonly delegationMode: "prefer";
  readonly allowAgents: readonly string[];
  readonly subagents: readonly OrchestratorSubagentRole[];
  readonly toolPolicyExpansion: {
    readonly allow: readonly ["sessions_spawn", "subagents", "group:sessions"];
    readonly receiptId: string | null;
  };
  readonly updatedAt: string | null;
}

export interface ConnectionsSnapshot {
  readonly gateway: GatewayConnectionState;
  readonly providerCatalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly pendingDeviceFlows: readonly DeviceFlowChallenge[];
  readonly github: GitHubConnectionState;
  readonly orchestrator: OrchestratorDelegationState;
  readonly refreshedAt: string;
}

export interface ConnectModelProviderApiKeyInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly apiKey: string;
}

export interface StartModelProviderDeviceFlowInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
  readonly authChoiceId: string;
}

export interface PollDeviceFlowInput extends ConnectionProvisioningPrincipal {
  readonly flowId: string;
}

export interface DisconnectModelProviderInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
}

export interface ApplyOrchestratorDelegationInput extends ConnectionProvisioningPrincipal {
  readonly connectedProviderIds: readonly string[];
}

export type StartGitHubDeviceFlowInput = ConnectionProvisioningPrincipal;
export type DisconnectGitHubInput = ConnectionProvisioningPrincipal;

export interface ConnectionsProvisioningPort {
  getConnectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<ConnectionsSnapshot>>;
  connectModelProviderApiKey(
    input: ConnectModelProviderApiKeyInput,
  ): Promise<Result<ProviderConnectionState>>;
  startModelProviderDeviceFlow(
    input: StartModelProviderDeviceFlowInput,
  ): Promise<Result<DeviceFlowChallenge>>;
  pollDeviceFlow(input: PollDeviceFlowInput): Promise<Result<DeviceFlowPollState>>;
  disconnectModelProvider(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ProviderConnectionState>>;
  applyOrchestratorDelegation(
    input: ApplyOrchestratorDelegationInput,
  ): Promise<Result<OrchestratorDelegationState>>;
  startGitHubDeviceFlow(input: StartGitHubDeviceFlowInput): Promise<Result<DeviceFlowChallenge>>;
  disconnectGitHub(input: DisconnectGitHubInput): Promise<Result<GitHubConnectionState>>;
}
