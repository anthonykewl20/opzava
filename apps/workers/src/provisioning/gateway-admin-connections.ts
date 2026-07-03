import { createHash, randomUUID } from "node:crypto";

import { LocalFileSecretsVault } from "@opzava/adapters";
import {
  GITHUB_ISSUES_TOKEN_SECRET_LABEL,
  type ApplyOrchestratorDelegationInput,
  type ConnectModelProviderApiKeyInput,
  type ConnectionsProvisioningPort,
  type ConnectionsSnapshot,
  type ConnectionProvisioningPrincipal,
  type DeviceFlowChallenge,
  type DeviceFlowPollState,
  type DisconnectGitHubInput,
  type DisconnectModelProviderInput,
  type GetSecretRefInput,
  type GitHubConnectionState,
  type ModelProviderAuthChoice,
  type ModelProviderCatalogEntry,
  type OrchestratorDelegationState,
  type OrchestratorSubagentRole,
  type ProviderConnectionState,
  type SecretReference,
  type SecretsVaultPort,
  type StartGitHubDeviceFlowInput,
  type StartModelProviderDeviceFlowInput,
} from "@opzava/ports";
import { DomainError, err, ok, type Result, type TenantId } from "@opzava/shared-kernel";

import { ASK_ADMIN_AGENT_ID, ASK_ADMIN_AGENT_MODEL } from "./ask-admin-agent.js";
import { buildDelegationProvisioningReceipt, buildOrchestratorAgentConfig } from "./connections.js";
import {
  Ed25519OpenClawAdminDeviceKeypair,
  OpenClawAdminRpcClient,
  type OpenClawAdminRpcPort,
} from "./openclaw-admin-client.js";

type Fetch = typeof fetch;

interface MutableSecretsVault extends SecretsVaultPort {
  putSecret(input: {
    readonly tenantId: TenantId;
    readonly purpose: SecretReference["purpose"];
    readonly label: string;
    readonly value: string;
    readonly version?: string;
  }): Promise<Result<SecretReference>>;
  deleteSecret(input: GetSecretRefInput): Promise<Result<void>>;
}

interface GatewayAdminConnectionsOptions {
  readonly adminClient: OpenClawAdminRpcPort;
  readonly secretsVault: MutableSecretsVault;
  readonly githubRepository: string;
  readonly githubOAuthClientId?: string;
  readonly fetch?: Fetch;
  readonly now?: () => Date;
}

interface PendingGitHubDeviceFlow {
  readonly flowId: string;
  readonly deviceCode: string;
  readonly expiresAt: Date;
  readonly intervalSeconds: number;
  readonly repository: string;
  readonly principal: ConnectionProvisioningPrincipal;
}

const modelDeviceFlowUnsupportedMessage =
  "OpenClaw 2026.6.11 exposes no admin RPC for model-provider device-code OAuth; use docs/runbooks/platform-gateway.md for GPT-Pro/Codex.";

function provisioningError(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): DomainError {
  return new DomainError({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function profileId(providerId: string, authChoiceId: string): string {
  return normalizeId(`${providerId}-${authChoiceId}`);
}

function secretRef(input: ConnectionProvisioningPrincipal): GetSecretRefInput {
  return {
    tenantId: input.orgId as TenantId,
    purpose: "provider",
    label: GITHUB_ISSUES_TOKEN_SECRET_LABEL,
  };
}

function splitScope(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter((scope) => scope !== "");
  }

  return stringArrayValue(value);
}

function configPayload(payload: unknown): Record<string, unknown> {
  const root = recordValue(payload);
  if (root === null) {
    return {};
  }

  return recordValue(root["config"]) ?? root;
}

function authConfig(config: Record<string, unknown>): Record<string, unknown> {
  return recordValue(config["auth"]) ?? {};
}

function authProfiles(config: Record<string, unknown>): Record<string, unknown> {
  return recordValue(authConfig(config)["profiles"]) ?? {};
}

function authOrder(config: Record<string, unknown>): Record<string, unknown> {
  return recordValue(authConfig(config)["order"]) ?? {};
}

function agentsList(config: Record<string, unknown>): readonly Record<string, unknown>[] {
  const agents = recordValue(config["agents"]);
  return arrayValue(agents?.["list"]).filter(isRecord);
}

function providerIdFromProfile(id: string, profile: Record<string, unknown>): string | null {
  return (
    stringValue(profile["providerId"]) ??
    stringValue(profile["provider"]) ??
    (id.includes("-") ? (id.split("-", 1)[0] ?? null) : null)
  );
}

function authChoiceIdFromProfile(id: string, profile: Record<string, unknown>): string | null {
  return (
    stringValue(profile["authChoiceId"]) ??
    stringValue(profile["authChoice"]) ??
    stringValue(profile["choice"]) ??
    (id.includes("-") ? id.slice(id.indexOf("-") + 1) : null)
  );
}

function authModeFromChoiceId(choiceId: string): "api-key" | "device-flow" {
  const normalized = choiceId.toLowerCase();
  return normalized.includes("oauth") || normalized.includes("device") ? "device-flow" : "api-key";
}

function authChoiceFromUnknown(value: unknown, providerId: string): ModelProviderAuthChoice | null {
  if (typeof value === "string") {
    return {
      id: value,
      label: value,
      mode: authModeFromChoiceId(value),
      providerId,
      ...(authModeFromChoiceId(value) === "api-key" ? { keyFlag: value } : {}),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value["id"]) ?? stringValue(value["authChoiceId"]);
  if (id === null) {
    return null;
  }

  const modeValue = stringValue(value["mode"]) ?? stringValue(value["type"]);
  const mode =
    modeValue === "device-flow" || modeValue === "oauth" ? "device-flow" : authModeFromChoiceId(id);
  const keyFlag = stringValue(value["keyFlag"]);
  const docsPath = stringValue(value["docsPath"]);
  return {
    id,
    label: stringValue(value["label"]) ?? id,
    mode,
    providerId,
    ...(keyFlag === null ? {} : { keyFlag }),
    ...(docsPath === null ? {} : { docsPath }),
  };
}

function providerCatalogFromModels(
  payload: unknown,
  config: Record<string, unknown>,
): readonly ModelProviderCatalogEntry[] {
  const root = recordValue(payload) ?? {};
  const providerSources = [
    ...arrayValue(root["providers"]),
    ...arrayValue(root["authProviders"]),
    ...arrayValue(root["authChoices"]),
  ];
  const modelSources = [...arrayValue(root["models"]), ...(Array.isArray(payload) ? payload : [])];
  const catalog = new Map<string, ModelProviderCatalogEntry>();

  for (const providerSource of providerSources) {
    if (!isRecord(providerSource)) {
      continue;
    }

    const id = stringValue(providerSource["id"]) ?? stringValue(providerSource["providerId"]);
    if (id === null) {
      continue;
    }

    const authChoices = [
      ...arrayValue(providerSource["authChoices"]),
      ...arrayValue(providerSource["auth"]),
      ...arrayValue(providerSource["choices"]),
    ]
      .map((choice) => authChoiceFromUnknown(choice, id))
      .filter((choice): choice is ModelProviderAuthChoice => choice !== null);

    catalog.set(id, {
      id,
      label: stringValue(providerSource["label"]) ?? stringValue(providerSource["name"]) ?? id,
      vendor: stringValue(providerSource["vendor"]) ?? id,
      ...(stringValue(providerSource["docsPath"]) === null
        ? {}
        : { docsPath: stringValue(providerSource["docsPath"]) ?? "" }),
      authChoices,
      suggestedModel:
        stringValue(providerSource["suggestedModel"]) ?? stringValue(providerSource["model"]) ?? id,
      roleStrength: stringValue(providerSource["roleStrength"]) ?? "Gateway-advertised provider",
      whenToUse:
        stringValue(providerSource["whenToUse"]) ?? "Use when this connected model is appropriate.",
    });
  }

  for (const modelSource of modelSources) {
    if (!isRecord(modelSource)) {
      continue;
    }

    const modelId = stringValue(modelSource["id"]) ?? stringValue(modelSource["model"]);
    const providerId =
      stringValue(modelSource["providerId"]) ??
      stringValue(modelSource["provider"]) ??
      (modelId?.includes("/") === true ? (modelId.split("/", 1)[0] ?? null) : null);
    if (providerId === null) {
      continue;
    }

    const existing = catalog.get(providerId);
    if (existing !== undefined) {
      if (existing.suggestedModel === providerId && modelId !== null) {
        catalog.set(providerId, { ...existing, suggestedModel: modelId });
      }
      continue;
    }

    catalog.set(providerId, {
      id: providerId,
      label: stringValue(modelSource["providerLabel"]) ?? providerId,
      vendor: stringValue(modelSource["vendor"]) ?? providerId,
      authChoices: [],
      suggestedModel: modelId ?? providerId,
      roleStrength: "Gateway-advertised provider",
      whenToUse: "Use when this connected model is appropriate.",
    });
  }

  for (const [id, profile] of Object.entries(authProfiles(config))) {
    if (!isRecord(profile)) {
      continue;
    }

    const providerId = providerIdFromProfile(id, profile);
    if (providerId === null || catalog.has(providerId)) {
      continue;
    }

    const authChoiceId = authChoiceIdFromProfile(id, profile) ?? id;
    catalog.set(providerId, {
      id: providerId,
      label: providerId,
      vendor: providerId,
      authChoices: [
        {
          id: authChoiceId,
          label: authChoiceId,
          mode: authModeFromChoiceId(authChoiceId),
          providerId,
          ...(authModeFromChoiceId(authChoiceId) === "api-key" ? { keyFlag: authChoiceId } : {}),
        },
      ],
      suggestedModel: stringValue(profile["model"]) ?? providerId,
      roleStrength: "Connected provider",
      whenToUse: "Use when this connected model is appropriate.",
    });
  }

  return [...catalog.values()].map((provider) =>
    provider.authChoices.length === 0
      ? {
          ...provider,
          authChoices: authChoicesFromConfig(provider.id, config),
        }
      : provider,
  );
}

function authChoicesFromConfig(
  providerId: string,
  config: Record<string, unknown>,
): readonly ModelProviderAuthChoice[] {
  const choices = arrayValue(authConfig(config)["choices"])
    .map((choice) => authChoiceFromUnknown(choice, providerId))
    .filter(
      (choice): choice is ModelProviderAuthChoice =>
        choice !== null && choice.providerId === providerId,
    );

  return choices;
}

function firstProfileIdForProvider(
  providerId: string,
  config: Record<string, unknown>,
): string | null {
  const orderValue = authOrder(config)[providerId];
  if (Array.isArray(orderValue)) {
    const ordered = orderValue.find((entry): entry is string => typeof entry === "string");
    if (ordered !== undefined) {
      return ordered;
    }
  }

  if (typeof orderValue === "string" && orderValue.trim() !== "") {
    return orderValue;
  }

  for (const [id, profile] of Object.entries(authProfiles(config))) {
    if (isRecord(profile) && providerIdFromProfile(id, profile) === providerId) {
      return id;
    }
  }

  return null;
}

function providerConnectionFromConfig(input: {
  readonly provider: ModelProviderCatalogEntry;
  readonly config: Record<string, unknown>;
  readonly now: Date;
}): ProviderConnectionState {
  const id = firstProfileIdForProvider(input.provider.id, input.config);
  const profile = id === null ? null : recordValue(authProfiles(input.config)[id]);
  if (id === null || profile === null) {
    return {
      providerId: input.provider.id,
      status: "not_connected",
      authChoiceId: null,
      accountLabel: null,
      scopes: [],
      model: input.provider.suggestedModel,
      usageLabel: null,
      lastCheckedAt: input.now.toISOString(),
      message: null,
    };
  }

  return {
    providerId: input.provider.id,
    status: "connected",
    authChoiceId: authChoiceIdFromProfile(id, profile),
    accountLabel: stringValue(profile["accountLabel"]) ?? stringValue(profile["label"]),
    scopes: stringArrayValue(profile["scopes"]),
    model: stringValue(profile["model"]) ?? input.provider.suggestedModel,
    usageLabel: stringValue(profile["usageLabel"]),
    lastCheckedAt: input.now.toISOString(),
    message: "OpenClaw Gateway auth profile is present.",
  };
}

function currentOrchestratorState(input: {
  readonly config: Record<string, unknown>;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly now: Date;
}): OrchestratorDelegationState {
  const askAdmin = agentsList(input.config).find(
    (agent) => stringValue(agent["id"]) === ASK_ADMIN_AGENT_ID,
  );
  const subagents = agentsList(input.config)
    .filter((agent) => stringValue(agent["id"])?.startsWith("subagent-") === true)
    .map((agent): OrchestratorSubagentRole | null => {
      const agentId = stringValue(agent["id"]);
      const providerId = agentId?.replace(/^subagent-/, "") ?? null;
      if (agentId === null || providerId === null) {
        return null;
      }

      const provider = input.catalog.find((entry) => entry.id === providerId);
      return {
        agentId,
        providerId,
        providerLabel: provider?.label ?? providerId,
        model: stringValue(agent["model"]) ?? provider?.suggestedModel ?? providerId,
        strength: provider?.roleStrength ?? "Connected provider",
        whenToUse: provider?.whenToUse ?? "Use when this connected model is appropriate.",
      };
    })
    .filter((entry): entry is OrchestratorSubagentRole => entry !== null);
  const subagentConfig = recordValue(askAdmin?.["subagents"]);
  const allowAgents = stringArrayValue(subagentConfig?.["allowAgents"]);

  return {
    orchestratorAgentId: ASK_ADMIN_AGENT_ID,
    orchestratorModel: stringValue(askAdmin?.["model"]) ?? ASK_ADMIN_AGENT_MODEL,
    delegationMode: "prefer",
    allowAgents,
    subagents,
    toolPolicyExpansion: {
      allow: ["sessions_spawn", "subagents", "group:sessions"],
      receiptId: askAdmin === undefined ? null : "openclaw-config",
    },
    updatedAt: askAdmin === undefined ? null : input.now.toISOString(),
  };
}

function receiptId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function unavailableSnapshot(input: {
  readonly now: Date;
  readonly repository: string;
  readonly message: string;
}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "unavailable",
      region: null,
      authLabel: "OpenClaw admin RPC unavailable",
      lastHeartbeatAt: null,
      message: input.message,
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
      message: "GitHub connection state is unavailable until provisioning is configured.",
    },
    orchestrator: {
      orchestratorAgentId: ASK_ADMIN_AGENT_ID,
      orchestratorModel: ASK_ADMIN_AGENT_MODEL,
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

function idempotencyKey(action: string): string {
  return `connections:${action}:${randomUUID()}`;
}

function readPrivateKeyPem(env: NodeJS.ProcessEnv): string | null {
  const base64Value = env["OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64"]?.trim();
  if (base64Value !== undefined && base64Value !== "") {
    return Buffer.from(base64Value, "base64").toString("utf8");
  }

  const pemValue = env["OPENCLAW_DEVICE_PRIVATE_KEY_PEM"]?.trim();
  return pemValue === undefined || pemValue === "" ? null : pemValue.replaceAll("\\n", "\n");
}

function readRepository(env: NodeJS.ProcessEnv): string {
  return env["GITHUB_ISSUES_REPOSITORY"]?.trim() || "anthonykewl20/opzava";
}

function githubTokenScopes(value: unknown): readonly string[] {
  return splitScope(value);
}

export class GatewayAdminConnectionsProvisioningPort implements ConnectionsProvisioningPort {
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private readonly githubFlows = new Map<string, PendingGitHubDeviceFlow>();
  private readonly modelDeviceFlows = new Map<string, DeviceFlowChallenge>();

  public constructor(private readonly options: GatewayAdminConnectionsOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  public async getConnectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<ConnectionsSnapshot>> {
    const now = this.now();
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return ok(
        unavailableSnapshot({
          now,
          repository: this.options.githubRepository,
          message: configResult.error.message,
        }),
      );
    }

    const modelsResult = await this.options.adminClient.request("models.list", {});
    const config = configPayload(configResult.value);
    const catalog = providerCatalogFromModels(modelsResult.ok ? modelsResult.value : {}, config);
    const providerConnections = catalog.map((provider) =>
      providerConnectionFromConfig({ provider, config, now }),
    );
    const github = await this.githubState(input, now);

    return ok({
      gateway: {
        status: "active",
        region: stringValue(config["region"]),
        authLabel: "OpenClaw operator.admin RPC",
        lastHeartbeatAt: now.toISOString(),
        message: modelsResult.ok ? null : modelsResult.error.message,
      },
      providerCatalog: catalog,
      providerConnections,
      pendingDeviceFlows: [
        ...this.modelDeviceFlows.values(),
        ...[...this.githubFlows.values()].map((flow) => this.challengeFromGitHubFlow(flow)),
      ],
      github,
      orchestrator: currentOrchestratorState({
        config,
        catalog,
        now,
      }),
      refreshedAt: now.toISOString(),
    });
  }

  public async connectModelProviderApiKey(
    input: ConnectModelProviderApiKeyInput,
  ): Promise<Result<ProviderConnectionState>> {
    if (input.apiKey.trim() === "") {
      return err(
        provisioningError("provisioning.connections.emptyKey", "Provider API key is required."),
      );
    }

    const id = profileId(input.providerId, input.authChoiceId);
    const result = await this.options.adminClient.request(
      "config.patch",
      {
        patch: {
          auth: {
            profiles: {
              [id]: {
                id,
                providerId: input.providerId,
                authChoiceId: input.authChoiceId,
                type: "api-key",
                key: input.apiKey,
                updatedBy: input.actorUserId,
              },
            },
            order: {
              [input.providerId]: [id],
            },
          },
        },
      },
      { idempotencyKey: idempotencyKey(`model-api-key:${input.providerId}`) },
    );
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      providerId: input.providerId,
      status: "connected",
      authChoiceId: input.authChoiceId,
      accountLabel: null,
      scopes: [],
      model: null,
      usageLabel: null,
      lastCheckedAt: this.now().toISOString(),
      message: "Provider API key stored in the OpenClaw Gateway auth profile.",
    });
  }

  public async startModelProviderDeviceFlow(
    input: StartModelProviderDeviceFlowInput,
  ): Promise<Result<DeviceFlowChallenge>> {
    const challenge: DeviceFlowChallenge = {
      flowId: `model:${randomUUID()}`,
      kind: "model_provider",
      providerId: input.providerId,
      authChoiceId: input.authChoiceId,
      verificationUri: "docs/runbooks/platform-gateway.md",
      userCode: "unsupported-via-gui",
      expiresAt: new Date(this.now().getTime() + 5 * 60_000).toISOString(),
      intervalSeconds: 30,
    };
    this.modelDeviceFlows.set(challenge.flowId, challenge);
    return ok(challenge);
  }

  public async pollDeviceFlow(
    input: { readonly flowId: string } & ConnectionProvisioningPrincipal,
  ): Promise<Result<DeviceFlowPollState>> {
    const githubFlow = this.githubFlows.get(input.flowId);
    if (githubFlow !== undefined) {
      return this.pollGitHubFlow(githubFlow);
    }

    const modelFlow = this.modelDeviceFlows.get(input.flowId);
    if (modelFlow !== undefined) {
      this.modelDeviceFlows.delete(input.flowId);
      return ok({
        status: "failed",
        message: modelDeviceFlowUnsupportedMessage,
      });
    }

    return ok({
      status: "failed",
      message: "Device flow is not known or has already completed.",
    });
  }

  public async disconnectModelProvider(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ProviderConnectionState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    const config = configResult.ok ? configPayload(configResult.value) : {};
    const matchingProfileIds = Object.entries(authProfiles(config))
      .filter(
        ([id, profile]) =>
          isRecord(profile) && providerIdFromProfile(id, profile) === input.providerId,
      )
      .map(([id]) => id);
    const profileIds =
      matchingProfileIds.length === 0
        ? [profileId(input.providerId, "api-key")]
        : matchingProfileIds;
    const profilePatch = Object.fromEntries(profileIds.map((id) => [id, null]));
    const result = await this.options.adminClient.request(
      "config.patch",
      {
        patch: {
          auth: {
            profiles: profilePatch,
            order: {
              [input.providerId]: [],
            },
          },
        },
      },
      { idempotencyKey: idempotencyKey(`model-disconnect:${input.providerId}`) },
    );
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      providerId: input.providerId,
      status: "not_connected",
      authChoiceId: null,
      accountLabel: null,
      scopes: [],
      model: null,
      usageLabel: null,
      lastCheckedAt: this.now().toISOString(),
      message: "OpenClaw Gateway auth profile removed.",
    });
  }

  public async applyOrchestratorDelegation(
    input: ApplyOrchestratorDelegationInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const modelsResult = await this.options.adminClient.request("models.list", {});
    const config = configPayload(configResult.value);
    const catalog = providerCatalogFromModels(modelsResult.ok ? modelsResult.value : {}, config);
    const providerConnections = catalog.map((provider) =>
      providerConnectionFromConfig({ provider, config, now: this.now() }),
    );
    const connectedProviders = new Set(input.connectedProviderIds);
    const subagents = providerConnections
      .filter(
        (connection) =>
          connection.providerId !== "openai" &&
          connection.status === "connected" &&
          connectedProviders.has(connection.providerId),
      )
      .map((connection): OrchestratorSubagentRole => {
        const provider = catalog.find((entry) => entry.id === connection.providerId);
        return {
          agentId: `subagent-${connection.providerId}`,
          providerId: connection.providerId,
          providerLabel: provider?.label ?? connection.providerId,
          model: connection.model ?? provider?.suggestedModel ?? connection.providerId,
          strength: provider?.roleStrength ?? "Connected provider",
          whenToUse: provider?.whenToUse ?? "Use when this connected model is appropriate.",
        };
      });
    const orchestrator = catalog.find((entry) => entry.id === "openai");
    const agentConfig = buildOrchestratorAgentConfig({
      subagents,
      orchestratorModel: orchestrator?.suggestedModel ?? ASK_ADMIN_AGENT_MODEL,
    });
    const receipt = buildDelegationProvisioningReceipt({ subagents });
    const existingAgents = agentsList(config).filter((agent) => {
      const id = stringValue(agent["id"]);
      return id !== ASK_ADMIN_AGENT_ID && id?.startsWith("subagent-") !== true;
    });
    const result = await this.options.adminClient.request(
      "config.patch",
      {
        patch: {
          agents: {
            list: [...existingAgents, ...agentConfig.agents.list],
          },
        },
        receipt: {
          ...receipt,
          tokenMaterialIncluded: false,
        },
      },
      { idempotencyKey: idempotencyKey("orchestrator-delegation") },
    );
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      orchestratorAgentId: ASK_ADMIN_AGENT_ID,
      orchestratorModel: orchestrator?.suggestedModel ?? ASK_ADMIN_AGENT_MODEL,
      delegationMode: "prefer",
      allowAgents: subagents.map((subagent) => subagent.agentId),
      subagents,
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: receiptId(receipt),
      },
      updatedAt: this.now().toISOString(),
    });
  }

  public async startGitHubDeviceFlow(
    input: StartGitHubDeviceFlowInput,
  ): Promise<Result<DeviceFlowChallenge>> {
    if (this.options.githubOAuthClientId === undefined || this.options.githubOAuthClientId === "") {
      return err(
        provisioningError(
          "provisioning.githubOAuth.notConfigured",
          "GITHUB_OAUTH_CLIENT_ID is required to start GitHub device flow.",
        ),
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl("https://github.com/login/device/code", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.options.githubOAuthClientId,
          scope: "repo",
        }),
      });
    } catch (error) {
      return err(
        provisioningError(
          "provisioning.githubOAuth.network",
          "GitHub device flow request failed before response.",
          { error: String(error) },
        ),
      );
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      return err(
        provisioningError(
          "provisioning.githubOAuth.requestFailed",
          `GitHub device flow request failed with HTTP ${response.status}.`,
        ),
      );
    }

    const deviceCode = stringValue(payload["device_code"]);
    const userCode = stringValue(payload["user_code"]);
    const verificationUri =
      stringValue(payload["verification_uri"]) ?? stringValue(payload["verification_uri_complete"]);
    const expiresIn = typeof payload["expires_in"] === "number" ? payload["expires_in"] : null;
    const interval = typeof payload["interval"] === "number" ? payload["interval"] : 5;
    if (
      deviceCode === null ||
      userCode === null ||
      verificationUri === null ||
      expiresIn === null
    ) {
      return err(
        provisioningError(
          "provisioning.githubOAuth.invalidResponse",
          "GitHub device flow response was missing required fields.",
        ),
      );
    }

    const flow: PendingGitHubDeviceFlow = {
      flowId: `github:${randomUUID()}`,
      deviceCode,
      expiresAt: new Date(this.now().getTime() + expiresIn * 1000),
      intervalSeconds: interval,
      repository: this.options.githubRepository,
      principal: input,
    };
    this.githubFlows.set(flow.flowId, flow);

    return ok({
      flowId: flow.flowId,
      kind: "github",
      providerId: "github",
      authChoiceId: "github-device-flow",
      verificationUri,
      userCode,
      expiresAt: flow.expiresAt.toISOString(),
      intervalSeconds: flow.intervalSeconds,
    });
  }

  public async disconnectGitHub(
    input: DisconnectGitHubInput,
  ): Promise<Result<GitHubConnectionState>> {
    const deleted = await this.options.secretsVault.deleteSecret(secretRef(input));
    if (!deleted.ok) {
      return err(deleted.error);
    }

    return ok({
      status: "not_connected",
      accountLabel: null,
      scopes: [],
      repository: this.options.githubRepository,
      lastCheckedAt: this.now().toISOString(),
      message: "GitHub token vault reference revoked.",
    });
  }

  private async githubState(
    input: ConnectionProvisioningPrincipal,
    now: Date,
  ): Promise<GitHubConnectionState> {
    const ref = await this.options.secretsVault.getRef(secretRef(input));
    if (!ref.ok) {
      return {
        status: "needs_attention",
        accountLabel: null,
        scopes: [],
        repository: this.options.githubRepository,
        lastCheckedAt: now.toISOString(),
        message: ref.error.message,
      };
    }

    return {
      status: ref.value === null ? "not_connected" : "connected",
      accountLabel: ref.value === null ? null : "GitHub token",
      scopes: [],
      repository: this.options.githubRepository,
      lastCheckedAt: now.toISOString(),
      message:
        ref.value === null
          ? "GitHub is not connected."
          : "GitHub token vault reference is present.",
    };
  }

  private challengeFromGitHubFlow(flow: PendingGitHubDeviceFlow): DeviceFlowChallenge {
    return {
      flowId: flow.flowId,
      kind: "github",
      providerId: "github",
      authChoiceId: "github-device-flow",
      verificationUri: "https://github.com/login/device",
      userCode: "pending",
      expiresAt: flow.expiresAt.toISOString(),
      intervalSeconds: flow.intervalSeconds,
    };
  }

  private async pollGitHubFlow(
    flow: PendingGitHubDeviceFlow,
  ): Promise<Result<DeviceFlowPollState>> {
    if (this.now().getTime() >= flow.expiresAt.getTime()) {
      this.githubFlows.delete(flow.flowId);
      return ok({ status: "expired", message: "GitHub device code expired." });
    }

    let response: Response;
    try {
      response = await this.fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.options.githubOAuthClientId ?? "",
          device_code: flow.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
    } catch (error) {
      return err(
        provisioningError(
          "provisioning.githubOAuth.network",
          "GitHub device flow poll failed before response.",
          { error: String(error) },
        ),
      );
    }

    const payload = await response.json().catch(() => null);
    if (!isRecord(payload)) {
      return ok({ status: "failed", message: "GitHub device flow returned invalid JSON." });
    }

    const errorCode = stringValue(payload["error"]);
    if (errorCode === "authorization_pending") {
      return ok({ status: "pending", message: "Waiting for GitHub device approval." });
    }

    if (errorCode === "slow_down") {
      return ok({ status: "pending", message: "GitHub asked us to slow polling." });
    }

    if (errorCode === "expired_token") {
      this.githubFlows.delete(flow.flowId);
      return ok({ status: "expired", message: "GitHub device code expired." });
    }

    if (errorCode === "access_denied") {
      this.githubFlows.delete(flow.flowId);
      return ok({ status: "failed", message: "GitHub device authorization was denied." });
    }

    const accessToken = stringValue(payload["access_token"]);
    if (!response.ok || accessToken === null) {
      return ok({ status: "failed", message: "GitHub device flow failed." });
    }

    const stored = await this.options.secretsVault.putSecret({
      ...secretRef(flow.principal),
      value: accessToken,
    });
    if (!stored.ok) {
      return err(stored.error);
    }

    this.githubFlows.delete(flow.flowId);
    return ok({
      status: "connected",
      message: "GitHub token stored in SecretsVaultPort.",
      connection: {
        status: "connected",
        accountLabel: "GitHub token",
        scopes: githubTokenScopes(payload["scope"]),
        repository: flow.repository,
        lastCheckedAt: this.now().toISOString(),
        message: "GitHub token vault reference is present.",
      },
    });
  }
}

export class UnavailableConnectionsProvisioningPort implements ConnectionsProvisioningPort {
  public constructor(
    private readonly reason: string,
    private readonly repository: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getConnectionsSnapshot(): Promise<Result<ConnectionsSnapshot>> {
    return ok(
      unavailableSnapshot({
        now: this.now(),
        repository: this.repository,
        message: this.reason,
      }),
    );
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
    return provisioningError("provisioning.connections.notConfigured", this.reason);
  }
}

export function createDefaultConnectionsProvisioningPort(
  env: NodeJS.ProcessEnv = process.env,
): ConnectionsProvisioningPort {
  const repository = readRepository(env);
  const gatewayUrl = env["OPENCLAW_GATEWAY_URL"]?.trim();
  const gatewayToken = env["OPENCLAW_GATEWAY_TOKEN"]?.trim();
  const privateKeyPem = readPrivateKeyPem(env);

  if (
    gatewayUrl === undefined ||
    gatewayUrl === "" ||
    gatewayToken === undefined ||
    gatewayToken === "" ||
    privateKeyPem === null
  ) {
    return new UnavailableConnectionsProvisioningPort(
      "OPENCLAW_GATEWAY_URL, OPENCLAW_GATEWAY_TOKEN, and OPENCLAW_DEVICE_PRIVATE_KEY_PEM(_BASE64) are required for Connections provisioning.",
      repository,
    );
  }

  const explicitDeviceId = env["OPENCLAW_DEVICE_ID"]?.trim();
  const explicitPublicKey = env["OPENCLAW_DEVICE_PUBLIC_KEY"]?.trim();
  const githubOAuthClientId = env["GITHUB_OAUTH_CLIENT_ID"]?.trim();
  const keypair = new Ed25519OpenClawAdminDeviceKeypair({
    privateKeyPem,
    ...(explicitDeviceId === undefined || explicitDeviceId === ""
      ? {}
      : { deviceId: explicitDeviceId }),
    ...(explicitPublicKey === undefined || explicitPublicKey === ""
      ? {}
      : { publicKey: explicitPublicKey }),
  });
  const vault = new LocalFileSecretsVault({
    filePath: env["OPENCLAW_DEV_SECRETS_FILE"]?.trim() || "/tmp/opzava-openclaw-dev-secrets.json",
  });

  return new GatewayAdminConnectionsProvisioningPort({
    adminClient: new OpenClawAdminRpcClient({
      url: gatewayUrl,
      gatewayToken,
      keypair,
    }),
    secretsVault: vault,
    githubRepository: repository,
    ...(githubOAuthClientId === undefined || githubOAuthClientId === ""
      ? {}
      : { githubOAuthClientId }),
  });
}
