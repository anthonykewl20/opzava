import type { Result } from "@opzava/shared-kernel";

import type { ProviderTier } from "./model-provider-taxonomy.js";

export type ConnectionAuthMode = "api-key" | "device-flow";
export type ConnectionStatus = "connected" | "not_connected" | "pending" | "needs_attention";
export type ConnectedAuthMode = "oauth" | "token" | "api_key";

/** OpenClaw `models.authStatus` per-provider health (5-state). Enriches the coarse ConnectionStatus. */
export type ProviderAuthHealth = "ok" | "expiring" | "expired" | "missing" | "static";

/** Curation axis: only canonical LLM parents are rendered as provider rows (Slice 3.7). */
export type ProviderCategory = "llm" | "non-llm";

/** A real, current model advertised by the gateway (`models.list`). */
export interface ModelSummary {
  readonly id: string;
  readonly label: string;
}

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
  /**
   * Grouping + curation hints (Slice 3.7 Models & Providers port). Optional so existing
   * fixtures keep compiling; the web projection classifies by provider id via
   * `classifyModelProvider` when absent, so these are advisory overrides, never the sole
   * source of truth. Providers still come from the LIVE gateway catalog (no invented list).
   */
  readonly category?: ProviderCategory;
  /** Canonical parent this entry folds under (e.g. runtime `claude-cli` → `anthropic`); undefined/null = it IS a parent. */
  readonly parentId?: string | null;
  /** Human label when this entry is a CLI runtime folded under its parent (e.g. "Claude CLI", "Codex CLI"). */
  readonly runtimeLabel?: string | null;
  /** Models currently enabled for routing in the gateway config; empty allowed, never faked. */
  readonly models?: readonly ModelSummary[];
  /**
   * Full catalog advertised by the gateway (`models.list` plus enabled-plugin generated catalogs).
   * `models` remains the enabled/configured set; absent or empty means honestly unknown, never faked.
   */
  readonly catalogModels?: readonly ModelSummary[];
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
  /**
   * Enrichment from OpenClaw `models.authStatus` (primary source; the `models status` CLI is a
   * degraded fallback). Optional so the coarse `status` stays authoritative when authStatus is
   * unavailable — honest empty, never faked.
   */
  readonly authHealth?: ProviderAuthHealth | null;
  /** Human expiry countdown for OAuth/token profiles (e.g. "10d", "2h"); null for static api-key. */
  readonly expiryLabel?: string | null;
  /** Subscription/plan label from `usage.plan` (e.g. "Pro"); null when the provider reports none. */
  readonly planLabel?: string | null;
  /** Real connected credential type from OpenClaw `models.authStatus.providers[].profiles[].type`. */
  readonly connectedAuthMode?: ConnectedAuthMode | null;
}

export interface ModelProviderTierGroup {
  readonly id: ProviderTier;
  readonly label: string;
  readonly collapsed: boolean;
  readonly providers: readonly string[];
}

export interface GatewayConnectionState {
  readonly status: "active" | "unavailable";
  readonly region: string | null;
  readonly authLabel: string;
  readonly lastHeartbeatAt: string | null;
  readonly message: string | null;
}

export type OpenClawHealthComponentKind =
  "gateway" | "event-loop" | "plugins" | "context-engines" | "channel" | "agent";

export type OpenClawHealthStatus = "healthy" | "attention" | "not_checked";

export interface OpenClawHealthComponent {
  readonly id: string;
  readonly kind: OpenClawHealthComponentKind;
  readonly label: string;
  readonly status: OpenClawHealthStatus;
  readonly detail: string | null;
  readonly lastCheckedAt: string | null;
}

export interface OpenClawHealthWarning {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface OpenClawUpdateAvailable {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly channel: string;
}

export interface OpenClawHealthRuntime {
  readonly version: string | null;
  readonly uptimeMs: number | null;
  readonly hostUptimeMs: number | null;
  readonly updateAvailable: OpenClawUpdateAvailable | null;
}

export interface OpenClawHealthSession {
  readonly agentId: string | null;
  readonly updatedAt: string | null;
  readonly ageMs: number | null;
}

export interface OpenClawHealthSessions {
  readonly count: number | null;
  readonly recent: readonly OpenClawHealthSession[];
}

export interface OpenClawLastKnownHealthy {
  readonly checkedAt: string;
  readonly healthy: number;
  readonly total: number;
}

export interface OpenClawHealth {
  readonly components: readonly OpenClawHealthComponent[];
  readonly warnings: readonly OpenClawHealthWarning[];
  readonly runtime: OpenClawHealthRuntime;
  readonly sessions: OpenClawHealthSessions;
  readonly checkedAt: string | null;
  readonly lastKnownHealthy: OpenClawLastKnownHealthy | null;
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
  readonly codePending?: boolean;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
}

export interface DeviceFlowPollState {
  readonly status: "pending" | "connected" | "expired" | "failed";
  readonly message: string | null;
  readonly intervalSeconds?: number;
  readonly verificationUri?: string;
  readonly userCode?: string;
  readonly codePending?: boolean;
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

export interface OrchestratorReconcileState {
  readonly status: "idle" | "running" | "failed";
  readonly reason?: "disconnect" | "connect";
  readonly providerId?: string;
  readonly message?: string;
  readonly startedAt?: string;
}

export interface OrchestratorDelegationState {
  readonly orchestratorAgentId: string;
  readonly orchestratorModel: string | null;
  readonly orchestratorProviderId: string | null;
  readonly delegationMode: "prefer";
  readonly allowAgents: readonly string[];
  readonly subagents: readonly OrchestratorSubagentRole[];
  readonly toolPolicyExpansion: {
    readonly allow: readonly ["sessions_spawn", "subagents", "group:sessions"];
    readonly receiptId: string | null;
  };
  readonly reconcile: OrchestratorReconcileState;
  readonly updatedAt: string | null;
}

export interface ConnectionsSnapshot {
  readonly gateway: GatewayConnectionState;
  readonly openclawHealth: OpenClawHealth;
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

export interface ModelProviderApiKeyConnectStart {
  readonly opId: string;
  readonly status: "pending";
}

export interface PollModelProviderApiKeyConnectInput extends ConnectionProvisioningPrincipal {
  readonly opId: string;
}

export type ModelProviderApiKeyConnectPollState =
  | { readonly status: "pending" }
  | {
      readonly status: "connected";
      readonly connection: ProviderConnectionState;
    }
  | {
      readonly status: "failed" | "expired";
      readonly message: string;
      readonly code?: string;
    };

export interface StartModelProviderSetupTokenFlowInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
}

export interface SetupTokenFlowStart {
  readonly flowId: string;
  readonly status: "pending";
}

export interface PollModelProviderSetupTokenFlowInput extends ConnectionProvisioningPrincipal {
  readonly flowId: string;
}

export interface SubmitModelProviderSetupTokenCodeInput extends ConnectionProvisioningPrincipal {
  readonly flowId: string;
  readonly code: string;
}

export type SetupTokenFlowPollState =
  | { readonly status: "pending" }
  | { readonly status: "awaiting_code"; readonly authorizeUrl: string }
  | { readonly status: "connected"; readonly connection: ProviderConnectionState }
  | { readonly status: "failed" | "expired"; readonly message: string; readonly code?: string };

export interface StartModelProviderDeviceFlowInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
  readonly authChoiceId: string;
}

export interface PollDeviceFlowInput extends ConnectionProvisioningPrincipal {
  readonly flowId: string;
}

export interface CancelModelProviderDeviceFlowInput extends ConnectionProvisioningPrincipal {
  readonly flowId: string;
}

export interface DeviceFlowCancelState {
  readonly status: "cancelled" | "not_found";
  readonly message: string;
}

export interface DisconnectModelProviderInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
}

export interface SetModelProviderModelEnabledInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
  readonly modelId: string;
  readonly enabled: boolean;
}

// Disconnect logs the provider out of every configured agent, and the gateway caps control-plane
// writes at 3 per 60s — so a tenant with 3+ agents needs 60-120s+ of paced writes. That cannot fit
// in an HTTP request, hence start-then-poll (like the api-key connect flow) rather than one call.
export interface ModelProviderDisconnectStart {
  readonly opId: string;
  readonly status: "pending";
}

export interface PollModelProviderDisconnectInput extends ConnectionProvisioningPrincipal {
  readonly opId: string;
}

export type ModelProviderDisconnectPollState =
  | { readonly status: "pending" }
  | { readonly status: "disconnected"; readonly connection: ProviderConnectionState }
  | { readonly status: "failed" | "expired"; readonly message: string; readonly code?: string };

export interface ApplyOrchestratorDelegationInput extends ConnectionProvisioningPrincipal {
  readonly connectedProviderIds: readonly string[];
}

export interface SetMainOrchestratorInput extends ConnectionProvisioningPrincipal {
  readonly providerId: string;
  readonly model?: string;
}

export type StartGitHubDeviceFlowInput = ConnectionProvisioningPrincipal;
export type DisconnectGitHubInput = ConnectionProvisioningPrincipal;

export interface ConnectionsReadPort {
  getConnectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<ConnectionsSnapshot>>;
  refreshConnectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<ConnectionsSnapshot>>;
}

export interface ModelProviderConnectFlowsPort {
  startModelProviderApiKeyConnect(
    input: ConnectModelProviderApiKeyInput,
  ): Promise<Result<ModelProviderApiKeyConnectStart>>;
  pollModelProviderApiKeyConnect(
    input: PollModelProviderApiKeyConnectInput,
  ): Promise<Result<ModelProviderApiKeyConnectPollState>>;
  startModelProviderSetupTokenFlow(
    input: StartModelProviderSetupTokenFlowInput,
  ): Promise<Result<SetupTokenFlowStart>>;
  pollModelProviderSetupTokenFlow(
    input: PollModelProviderSetupTokenFlowInput,
  ): Promise<Result<SetupTokenFlowPollState>>;
  submitModelProviderSetupTokenCode(
    input: SubmitModelProviderSetupTokenCodeInput,
  ): Promise<Result<{ readonly status: "pending" }>>;
  startModelProviderDeviceFlow(
    input: StartModelProviderDeviceFlowInput,
  ): Promise<Result<DeviceFlowChallenge>>;
  cancelModelProviderDeviceFlow(
    input: CancelModelProviderDeviceFlowInput,
  ): Promise<Result<DeviceFlowCancelState>>;
  pollDeviceFlow(input: PollDeviceFlowInput): Promise<Result<DeviceFlowPollState>>;
  startModelProviderDisconnect(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ModelProviderDisconnectStart>>;
  pollModelProviderDisconnect(
    input: PollModelProviderDisconnectInput,
  ): Promise<Result<ModelProviderDisconnectPollState>>;
  setModelProviderModelEnabled(
    input: SetModelProviderModelEnabledInput,
  ): Promise<Result<ProviderConnectionState>>;
  startGitHubDeviceFlow(input: StartGitHubDeviceFlowInput): Promise<Result<DeviceFlowChallenge>>;
  disconnectGitHub(input: DisconnectGitHubInput): Promise<Result<GitHubConnectionState>>;
}

export interface OrchestratorDelegationPort {
  applyOrchestratorDelegation(
    input: ApplyOrchestratorDelegationInput,
  ): Promise<Result<OrchestratorDelegationState>>;
  setMainOrchestrator(
    input: SetMainOrchestratorInput,
  ): Promise<Result<OrchestratorDelegationState>>;
}

export interface ConnectionsProvisioningPort
  extends ConnectionsReadPort, ModelProviderConnectFlowsPort, OrchestratorDelegationPort {}
