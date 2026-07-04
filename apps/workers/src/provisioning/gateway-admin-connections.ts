import { createHash, randomUUID } from "node:crypto";

import { LocalFileSecretsVault } from "@opzava/adapters";
import {
  CANONICAL_LLM_PROVIDER_IDS,
  CANONICAL_PROVIDER_LABELS,
  GITHUB_ISSUES_TOKEN_SECRET_LABEL,
  type ApplyOrchestratorDelegationInput,
  classifyModelProvider,
  type ConnectModelProviderApiKeyInput,
  type ConnectedAuthMode,
  type ConnectionsProvisioningPort,
  type ConnectionsSnapshot,
  type ConnectionProvisioningPrincipal,
  type DeviceFlowChallenge,
  type DeviceFlowPollState,
  type DisconnectGitHubInput,
  type DisconnectModelProviderInput,
  type GetSecretRefInput,
  type GitHubConnectionState,
  type ModelSummary,
  type ModelProviderAuthChoice,
  type ModelProviderCatalogEntry,
  type OrchestratorDelegationState,
  type OrchestratorSubagentRole,
  type ProviderAuthHealth,
  type ProviderConnectionState,
  type ResolveSecretInput,
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
  type OpenClawOperatorScope,
  type OpenClawAdminRpcPort,
} from "./openclaw-admin-client.js";

type Fetch = typeof fetch;

interface MutableSecretsVault extends SecretsVaultPort {
  resolveSecretValue?(input: ResolveSecretInput): Promise<Result<string>>;
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
  readonly gatewayRuntime?: GatewayRuntimePort;
  readonly fetch?: Fetch;
  readonly now?: () => Date;
}

interface GatewayRuntimeAuthChoice {
  readonly id: string;
  readonly label: string;
  readonly mode: "api-key" | "device-flow";
  readonly keyFlag?: string;
}

interface GatewayRuntimeCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface GatewayRuntimeDeviceCodeLogin {
  readonly execId: string;
  readonly logPath: string;
}

interface GatewayRuntimePort {
  listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>>;
  modelStatus(): Promise<Result<unknown>>;
  connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>>;
  startDeviceCodeLogin(providerId: string): Promise<Result<GatewayRuntimeDeviceCodeLogin>>;
  readDeviceCodeLog(logPath: string): Promise<Result<string>>;
  stopDeviceCodeLogin(execId: string, logPath: string): Promise<void>;
}

interface PendingGitHubDeviceFlow {
  readonly flowId: string;
  readonly deviceCode: string;
  readonly expiresAt: Date;
  readonly intervalSeconds: number;
  readonly repository: string;
  readonly principal: ConnectionProvisioningPrincipal;
}

interface PendingModelProviderDeviceFlow {
  readonly flowId: string;
  /** Owning tenant — a flow may only be polled by the principal that started it (multi-tenant scope). */
  readonly orgId: string;
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly verificationUri?: string;
  readonly userCode?: string;
  readonly expiresAt: Date;
  readonly intervalSeconds: number;
  readonly execId: string;
  readonly logPath: string;
}

const modelDeviceFlowRequiredMessage =
  "That provider auth method uses OAuth device flow. Start the browser device-flow sign-in instead.";
const modelDeviceFlowStartPollDelayMs = 1_500;
const modelDeviceFlowStartMaxAttempts = 4;
const modelDeviceFlowExpiresMs = 15 * 60 * 1000;
const modelDeviceFlowPollIntervalSeconds = 5;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function stripAnsi(value: string): string {
  // The device-code CLI is a TTY prompter (ANSI escapes + spinners); strip CSI sequences so the
  // verification URL + code parse cleanly. ESC (0x1B) is intentional here.
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, "");
}

function parseDeviceCodeLog(value: string): {
  readonly verificationUri: string;
  readonly userCode: string;
} | null {
  const stripped = stripAnsi(value);
  const verificationUri =
    stripped.match(/https?:\/\/[^\s"']*device[^\s"']*/i)?.[0] ??
    stripped.match(/https?:\/\/auth\.[^\s"']+/i)?.[0] ??
    null;
  const userCode =
    stripped.match(/Code:\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ??
    stripped.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/i)?.[1] ??
    null;

  if (verificationUri === null || userCode === null) {
    return null;
  }

  return { verificationUri, userCode: userCode.toUpperCase() };
}

function deviceCodeLogTerminalFailure(logValue: string): boolean {
  // Deliberately narrow: connected + expiry are the reliable terminals, so match only
  // unambiguous OAuth-denial signals absent from normal prompter output (a broad
  // /error|expired|invalid/ would false-kill valid flows: the "Code expires in N minutes"
  // countdown, stray "error" in the spinner UI, etc.).
  return /\b(access[_ ]denied|authorization[_ ](denied|declined)|expired[_ ]token|invalid[_ ]grant|invalid[_ ]client|denied by (the )?user|sign[- ]?in (failed|was denied|declined))\b/i.test(
    stripAnsi(logValue).slice(-4096),
  );
}

function configBaseHash(value: unknown): string | null {
  const root = recordValue(value);
  return root === null ? null : stringValue(root["hash"]);
}

function configPatchParams(input: {
  readonly configGetPayload: unknown;
  readonly patch: Record<string, unknown>;
  readonly replacePaths?: readonly string[];
}): Result<Record<string, unknown>> {
  const baseHash = configBaseHash(input.configGetPayload);
  if (baseHash === null) {
    return err(
      provisioningError(
        "provisioning.connections.configBaseHashMissing",
        "Opzava Gateway config.get did not return the base hash required by config.patch.",
      ),
    );
  }

  return ok({
    raw: JSON.stringify(input.patch),
    baseHash,
    ...(input.replacePaths === undefined || input.replacePaths.length === 0
      ? {}
      : { replacePaths: input.replacePaths }),
  });
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
    modeValue === "device-flow" || modeValue === "oauth" || modeValue === "token"
      ? "device-flow"
      : authModeFromChoiceId(id);
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

function modelProviderId(modelRef: string): string | null {
  const [providerId] = modelRef.trim().split("/", 1);
  return providerId === undefined || providerId === "" ? null : providerId;
}

function modelRefMatchesProvider(modelRef: string, providerId: string): boolean {
  return modelProviderId(modelRef)?.toLowerCase() === providerId.toLowerCase();
}

function modelSelectorPrimary(value: unknown): string | null {
  if (typeof value === "string") {
    return stringValue(value);
  }

  const record = recordValue(value);
  return record === null ? null : stringValue(record["primary"]);
}

function providerModelRef(providerId: string, modelId: string): string {
  return modelId.includes("/") ? modelId : `${providerId}/${modelId}`;
}

function firstConfiguredProviderModel(
  providerId: string,
  config: Record<string, unknown>,
): string | null {
  const modelsConfig = recordValue(config["models"]);
  const providers = recordValue(modelsConfig?.["providers"]);
  const provider = recordValue(providers?.[providerId]);
  if (provider === null) {
    return null;
  }

  const direct =
    modelSelectorPrimary(provider["model"]) ??
    modelSelectorPrimary(provider["default"]) ??
    stringValue(provider["primary"]) ??
    stringValue(provider["defaultModel"]) ??
    stringValue(provider["defaultModelId"]) ??
    stringValue(provider["modelId"]);
  if (direct !== null) {
    return providerModelRef(providerId, direct);
  }

  const configuredModel = arrayValue(provider["models"])
    .map((entry) =>
      typeof entry === "string"
        ? stringValue(entry)
        : isRecord(entry)
          ? (stringValue(entry["id"]) ?? stringValue(entry["model"]) ?? stringValue(entry["name"]))
          : null,
    )
    .find((value): value is string => value !== null);
  return configuredModel === undefined ? null : providerModelRef(providerId, configuredModel);
}

// All model refs the gateway is CONFIGURED to route to, from the agent config where they actually
// live: `agents.defaults.model.primary`, `agents.defaults.models` keys, and each agent's model +
// `models` keys (e.g. "openai/gpt-5.5", "zai/glm-5.2"). This is the real enabled set — NOT the full
// `models.list` catalog.
function configuredModelRefs(config: Record<string, unknown>): readonly string[] {
  const refs = new Set<string>();
  const agents = recordValue(config["agents"]);
  const collect = (agentLike: unknown): void => {
    const rec = recordValue(agentLike);
    if (rec === null) {
      return;
    }
    const primary = modelSelectorPrimary(rec["model"]);
    if (primary !== null) {
      refs.add(primary);
    }
    for (const key of Object.keys(recordValue(rec["models"]) ?? {})) {
      refs.add(key);
    }
  };
  collect(recordValue(agents?.["defaults"]));
  for (const agent of arrayValue(agents?.["list"])) {
    collect(agent);
  }
  // A connected auth profile can pin the routed model directly (auth.profiles[<id>].model) — this is
  // where an api-key provider's active model lives (e.g. zai -> "zai/glm-5.2").
  for (const profile of Object.values(authProfiles(config))) {
    const model = isRecord(profile) ? modelSelectorPrimary(profile["model"]) : null;
    if (model !== null) {
      refs.add(model);
    }
  }
  return [...refs];
}

// The configured models for one provider (e.g. openai -> [gpt-5.5], zai -> [glm-5.2]).
function configuredModelsForProvider(
  providerId: string,
  config: Record<string, unknown>,
): readonly ModelSummary[] {
  const seen = new Map<string, ModelSummary>();
  for (const ref of configuredModelRefs(config)) {
    if (!modelRefMatchesProvider(ref, providerId)) {
      continue;
    }
    const id = ref.includes("/") ? ref.slice(ref.indexOf("/") + 1) : ref;
    if (id !== "" && !seen.has(id)) {
      seen.set(id, { id, label: id });
    }
  }
  return [...seen.values()];
}

function configuredModelForProvider(input: {
  readonly providerId: string;
  readonly config: Record<string, unknown>;
  readonly models?: readonly ModelSummary[] | undefined;
}): string | null {
  const configured = configuredModelsForProvider(input.providerId, input.config);
  if (configured[0] !== undefined) {
    return providerModelRef(input.providerId, configured[0].id);
  }

  const defaults = recordValue(recordValue(input.config["agents"])?.["defaults"]);
  const primary = modelSelectorPrimary(defaults?.["model"]);
  if (primary !== null && modelRefMatchesProvider(primary, input.providerId)) {
    return primary;
  }

  return (
    firstConfiguredProviderModel(input.providerId, input.config) ?? input.models?.[0]?.id ?? null
  );
}

function withModelProviderClassification(
  provider: ModelProviderCatalogEntry,
  config: Record<string, unknown>,
): ModelProviderCatalogEntry {
  const classification = classifyModelProvider(provider.id);

  return {
    ...provider,
    label: classification.canonicalLabel ?? provider.label,
    category: classification.category,
    parentId: classification.parentId,
    runtimeLabel: classification.runtimeLabel,
    // Models come ONLY from the gateway CONFIG (the models it actually routes to) — never a raw
    // `models.list` catalog dump. Agnostic (no hardcoding) + aligned: a connected provider shows its
    // configured model(s); an unconfigured/unconnected provider shows none.
    models: configuredModelsForProvider(provider.id, config),
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
  // Model entries are used only to DISCOVER providers (which providers exist), never to populate the
  // per-provider model list — that comes from config (configuredModelsForProvider), keeping the
  // Models column agnostic and config-driven.
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

  return [...catalog.values()].map((provider) => {
    const withAuthChoices =
      provider.authChoices.length === 0
        ? {
            ...provider,
            authChoices: authChoicesFromConfig(provider.id, config),
          }
        : provider;

    return withModelProviderClassification(withAuthChoices, config);
  });
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
  const model = configuredModelForProvider({
    providerId: input.provider.id,
    config: input.config,
    models: input.provider.models,
  });
  if (id === null || profile === null) {
    return {
      providerId: input.provider.id,
      status: "not_connected",
      authChoiceId: null,
      accountLabel: null,
      scopes: [],
      model,
      usageLabel: null,
      lastCheckedAt: input.now.toISOString(),
      message: null,
      connectedAuthMode: null,
    };
  }

  return {
    providerId: input.provider.id,
    status: "connected",
    authChoiceId: authChoiceIdFromProfile(id, profile),
    accountLabel: stringValue(profile["accountLabel"]) ?? stringValue(profile["label"]),
    scopes: stringArrayValue(profile["scopes"]),
    model,
    usageLabel: stringValue(profile["usageLabel"]),
    lastCheckedAt: input.now.toISOString(),
    message: "Opzava Gateway auth profile is present.",
    // The config profile records its own auth mode (e.g. {mode:"api_key"}); surface it so Manage
    // renders the right form (rotate key vs subscription) instead of a dead "no auth method" state.
    connectedAuthMode: connectedAuthMode(profile["mode"]) ?? connectedAuthMode(profile["type"]),
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
      authLabel: "Opzava Gateway admin RPC unavailable",
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

function readRequestedOperatorScopes(
  env: NodeJS.ProcessEnv,
): readonly OpenClawOperatorScope[] | undefined {
  const raw = env["OPENCLAW_OPERATOR_SCOPES"]?.trim();
  if (raw === undefined || raw === "") {
    return undefined;
  }

  const scopes = raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope): scope is OpenClawOperatorScope => scope.startsWith("operator."));

  return scopes.length === 0 ? undefined : scopes;
}

function readDockerHost(env: NodeJS.ProcessEnv): string | null {
  const value = env["DOCKER_HOST"]?.trim();
  return value === undefined || value === "" ? null : value;
}

function readGatewayContainerName(env: NodeJS.ProcessEnv): string | null {
  const value =
    env["OPENCLAW_GATEWAY_CONTAINER_NAME"]?.trim() ?? env["OPENCLAW_GATEWAY_CONTAINER"]?.trim();
  return value === undefined || value === "" ? null : value;
}

function dockerHttpBaseUrl(dockerHost: string): Result<string> {
  if (!dockerHost.startsWith("tcp://")) {
    return err(
      provisioningError(
        "provisioning.docker.unsupportedHost",
        "DOCKER_HOST must use tcp:// for the provisioning worker docker-socket-proxy path.",
      ),
    );
  }

  try {
    return ok(new URL(dockerHost.replace(/^tcp:\/\//, "http://")).toString().replace(/\/$/, ""));
  } catch (error) {
    return err(
      provisioningError("provisioning.docker.invalidHost", "DOCKER_HOST is invalid.", {
        error: String(error),
      }),
    );
  }
}

function dockerMultiplexedOutput(buffer: Buffer): {
  readonly stdout: string;
  readonly stderr: string;
} {
  let offset = 0;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const next = offset + 8 + size;
    if (size < 0 || next > buffer.length) {
      return { stdout: buffer.toString("utf8"), stderr: "" };
    }

    const chunk = buffer.subarray(offset + 8, next);
    if (stream === 2) {
      stderr.push(chunk);
    } else {
      stdout.push(chunk);
    }
    offset = next;
  }

  if (offset !== buffer.length) {
    return { stdout: buffer.toString("utf8"), stderr: "" };
  }

  return {
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function authChoiceMode(choiceId: string, keyFlag: string | null): "api-key" | "device-flow" {
  if (keyFlag !== null) {
    return "api-key";
  }

  const normalized = choiceId.toLowerCase();
  return normalized.includes("oauth") ||
    normalized.includes("device") ||
    normalized.includes("cli") ||
    normalized.includes("claude-max") ||
    normalized === "openai" ||
    normalized === "github-copilot"
    ? "device-flow"
    : "api-key";
}

function authChoiceLabel(choiceId: string, mode: "api-key" | "device-flow"): string {
  if (mode === "api-key") {
    return "API key";
  }

  if (choiceId.includes("claude-max") || choiceId.includes("claude")) {
    return "Claude Max proxy subscription";
  }

  if (choiceId.includes("cli")) {
    return "Interactive CLI";
  }

  return "OAuth device flow";
}

function parseOnboardAuthChoiceIds(helpText: string): readonly string[] {
  const match = helpText.match(/--auth-choice <choice>\s+Auth:\s+([^\n]+)/);
  if (match === null || match[1] === undefined) {
    return [];
  }

  return match[1]
    .split("|")
    .map((choice) => choice.trim())
    .filter((choice) => choice !== "");
}

function parseOnboardApiKeyFlags(helpText: string): readonly string[] {
  const flags = new Set<string>();
  for (const line of helpText.split("\n")) {
    const match = line.match(/^\s+--([a-z0-9-]+-api-key)\s+<key>\s+/i);
    if (match?.[1] !== undefined) {
      flags.add(match[1]);
    }
  }

  return [...flags].sort((left, right) => left.localeCompare(right));
}

function providerChoiceRoots(providerId: string): readonly string[] {
  const roots = new Set<string>([providerId]);
  if (providerId === "anthropic") {
    roots.add("claude-max-api-proxy");
    roots.add("claude");
  }
  if (providerId.endsWith("-plan")) {
    roots.add(providerId.replace(/-plan$/, ""));
  }
  if (providerId.includes("-token-plan")) {
    roots.add(providerId.replace(/-token-plan.*$/, ""));
  }
  const [first] = providerId.split("-");
  if (first !== undefined && first !== "") {
    roots.add(first);
  }

  return [...roots];
}

function choiceMatchesProvider(input: {
  readonly providerId: string;
  readonly choiceId: string;
  readonly keyFlag: string | null;
}): boolean {
  const roots = providerChoiceRoots(input.providerId);
  return roots.some(
    (root) =>
      input.choiceId === root ||
      input.choiceId.startsWith(`${root}-`) ||
      input.keyFlag === `${root}-api-key` ||
      input.keyFlag?.startsWith(`${root}-`) === true,
  );
}

function deviceCodeProviderArg(input: {
  readonly providerId: string;
  readonly authChoiceId: string;
}): string {
  return (
    providerChoiceRoots(input.providerId).find(
      (root) => input.authChoiceId === root || input.authChoiceId.startsWith(`${root}-`),
    ) ?? input.providerId
  );
}

function authChoicesForProvider(input: {
  readonly providerId: string;
  readonly choices: readonly GatewayRuntimeAuthChoice[];
}): readonly ModelProviderAuthChoice[] {
  const matches = input.choices.filter((choice) =>
    choiceMatchesProvider({
      providerId: input.providerId,
      choiceId: choice.id,
      keyFlag: choice.keyFlag ?? null,
    }),
  );
  const apiKeyLegacy = input.choices.find((choice) => choice.id === "apiKey");
  const roots = providerChoiceRoots(input.providerId);
  const legacyKeyFlag = roots
    .map((root) => `${root}-api-key`)
    .find((flag) => input.choices.some((choice) => choice.keyFlag === flag));
  const withLegacy =
    apiKeyLegacy !== undefined &&
    legacyKeyFlag !== undefined &&
    matches.every((choice) => choice.keyFlag !== legacyKeyFlag)
      ? [...matches, { ...apiKeyLegacy, keyFlag: legacyKeyFlag, mode: "api-key" as const }]
      : matches;

  return withLegacy.map((choice) => ({
    id: choice.id,
    label: choice.label,
    mode: choice.mode,
    providerId: input.providerId,
    ...(choice.keyFlag === undefined ? {} : { keyFlag: choice.keyFlag }),
  }));
}

function mergeRuntimeAuthChoices(input: {
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly choices: readonly GatewayRuntimeAuthChoice[];
}): readonly ModelProviderCatalogEntry[] {
  return input.catalog.map((provider) => {
    const authChoices = authChoicesForProvider({
      providerId: provider.id,
      choices: input.choices,
    });
    if (authChoices.length === 0) {
      return provider;
    }

    const merged = new Map<string, ModelProviderAuthChoice>();
    for (const choice of [...provider.authChoices, ...authChoices]) {
      merged.set(`${choice.providerId}:${choice.mode}:${choice.id}`, choice);
    }

    return { ...provider, authChoices: [...merged.values()] };
  });
}

// Ensure the well-known LLM connect targets surface even when they have NO bundled models yet
// (zai/openrouter/moonshot/qwen/deepseek/groq/xai/google have onboard auth-choices but no models
// until connected, so `models.list` alone omits them). Presence stays GATEWAY-DRIVEN: a canonical
// provider is added ONLY if the live `onboard --help` list advertises a matching auth-choice.
function ensureCanonicalLlmProviders(input: {
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly choices: readonly GatewayRuntimeAuthChoice[];
}): readonly ModelProviderCatalogEntry[] {
  // Compare case-insensitively so a mixed-case catalog id (e.g. "OpenAI") is not treated as absent
  // and duplicated by the lowercase canonical id (glm review LOW #2). Ids used for gateway writes are
  // left untouched — this normalizes only the dedupe comparison.
  const present = new Set(input.catalog.map((provider) => provider.id.toLowerCase()));
  const additions: ModelProviderCatalogEntry[] = [];

  for (const rootId of CANONICAL_LLM_PROVIDER_IDS) {
    if (present.has(rootId.toLowerCase())) {
      continue;
    }

    // Only ever ADD top-level LLM parents. A canonical id that folds under a parent (e.g. an
    // alias/plan/proxy like claude-max-api-proxy -> anthropic) must NOT become its own row — it
    // merges into its parent via the web projection instead.
    if (classifyModelProvider(rootId).parentId !== null) {
      continue;
    }

    const authChoices = authChoicesForProvider({ providerId: rootId, choices: input.choices });
    if (authChoices.length === 0) {
      continue;
    }

    const label = CANONICAL_PROVIDER_LABELS[rootId] ?? rootId;
    additions.push({
      id: rootId,
      label,
      vendor: label,
      authChoices,
      suggestedModel: rootId,
      roleStrength: "Gateway-advertised provider",
      whenToUse: "Connect to route the fleet to this provider.",
      category: "llm",
      parentId: null,
      runtimeLabel: null,
      models: [],
    });
  }

  return [...input.catalog, ...additions];
}

function parseOnboardAuthChoices(helpText: string): readonly GatewayRuntimeAuthChoice[] {
  const choiceIds = parseOnboardAuthChoiceIds(helpText);
  const keyFlags = parseOnboardApiKeyFlags(helpText);
  const byId = new Map<string, GatewayRuntimeAuthChoice>();

  for (const choiceId of choiceIds) {
    const keyFlag =
      keyFlags.find((flag) => flag === choiceId || flag === `${choiceId}-api-key`) ?? null;
    const mode = authChoiceMode(choiceId, keyFlag);
    byId.set(choiceId, {
      id: choiceId,
      label: authChoiceLabel(choiceId, mode),
      mode,
      ...(keyFlag === null ? {} : { keyFlag }),
    });
  }

  for (const keyFlag of keyFlags) {
    const choiceId = choiceIds.includes(keyFlag)
      ? keyFlag
      : choiceIds.includes(keyFlag.replace(/-api-key$/, ""))
        ? keyFlag.replace(/-api-key$/, "")
        : keyFlag;
    if (!byId.has(choiceId)) {
      byId.set(choiceId, {
        id: choiceId,
        label: "API key",
        mode: "api-key",
        keyFlag,
      });
    }
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function modelStatusAllowedModels(status: unknown): readonly string[] {
  const root = recordValue(status);
  return stringArrayValue(root?.["allowed"]);
}

function modelStatusProvider(status: unknown, providerId: string): Record<string, unknown> | null {
  const auth = recordValue(recordValue(status)?.["auth"]);
  const providers = arrayValue(auth?.["providers"]).filter(isRecord);
  return (
    providers.find((provider) => stringValue(provider["provider"]) === providerId) ??
    providers.find(
      (provider) => stringValue(provider["provider"]) === providerIdFromModel(providerId),
    ) ??
    null
  );
}

function providerIdFromModel(providerId: string): string {
  return providerId.split("/", 1)[0] ?? providerId;
}

function modelStatusProfileCount(provider: Record<string, unknown> | null): number {
  const profiles = recordValue(provider?.["profiles"]);
  const count = profiles?.["count"];
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function modelStatusProfileLabels(provider: Record<string, unknown> | null): readonly string[] {
  const profiles = recordValue(provider?.["profiles"]);
  return stringArrayValue(profiles?.["labels"]);
}

// Derive the real connected auth mode from the CLI `models status` profile counts
// (e.g. openai → {oauth:1} → "oauth"), the store the authStatus RPC under-reports.
function connectedAuthModeFromModelStatus(
  statusProvider: Record<string, unknown> | null,
): ConnectedAuthMode | null {
  const profiles = recordValue(statusProvider?.["profiles"]);
  if (profiles === null) {
    return null;
  }
  if ((numberValue(profiles["oauth"]) ?? 0) > 0) {
    return "oauth";
  }
  if ((numberValue(profiles["token"]) ?? 0) > 0) {
    return "token";
  }
  if ((numberValue(profiles["apiKey"]) ?? 0) > 0) {
    return "api_key";
  }
  return null;
}

function providerConnectionFromModelStatus(input: {
  readonly provider: ModelProviderCatalogEntry;
  readonly config: Record<string, unknown>;
  readonly modelStatus: unknown;
  readonly now: Date;
}): ProviderConnectionState | null {
  const statusProvider = modelStatusProvider(input.modelStatus, input.provider.id);
  const profileCount = modelStatusProfileCount(statusProvider);
  if (profileCount <= 0) {
    return null;
  }

  const allowedModels = modelStatusAllowedModels(input.modelStatus);
  const providerAllowed = allowedModels.some((model) => model.startsWith(`${input.provider.id}/`));
  const labels = modelStatusProfileLabels(statusProvider);
  const firstLabel = labels[0] ?? null;
  const id = firstProfileIdForProvider(input.provider.id, input.config);
  const profile = id === null ? null : recordValue(authProfiles(input.config)[id]);

  return {
    providerId: input.provider.id,
    status: providerAllowed ? "connected" : "needs_attention",
    authChoiceId: id === null || profile === null ? null : authChoiceIdFromProfile(id, profile),
    accountLabel: firstLabel === null ? stringValue(statusProvider?.["provider"]) : firstLabel,
    scopes: [],
    model: configuredModelForProvider({
      providerId: input.provider.id,
      config: input.config,
      models: input.provider.models,
    }),
    usageLabel: profileCount === 1 ? "1 auth profile" : `${profileCount} auth profiles`,
    lastCheckedAt: input.now.toISOString(),
    message: providerAllowed
      ? "Gateway model auth profile is usable."
      : "Provider has credentials but no allowed model in the Gateway model allowlist.",
    connectedAuthMode: connectedAuthModeFromModelStatus(statusProvider),
  };
}

interface ModelAuthStatusConnection {
  readonly providerId: string;
  readonly status: ProviderConnectionState["status"];
  readonly authHealth: ProviderAuthHealth;
  readonly connectedAuthMode: ConnectedAuthMode | null;
  readonly expiryLabel: string | null;
  readonly planLabel: string | null;
  readonly usageLabel: string | null;
  readonly accountLabel: string | null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function providerAuthHealth(value: unknown): ProviderAuthHealth | null {
  const status = stringValue(value);
  if (
    status === "ok" ||
    status === "expiring" ||
    status === "expired" ||
    status === "missing" ||
    status === "static"
  ) {
    return status;
  }

  return null;
}

function connectedAuthMode(value: unknown): ConnectedAuthMode | null {
  const mode = stringValue(value);
  if (mode === "oauth" || mode === "token" || mode === "api_key") {
    return mode;
  }

  return null;
}

function connectedAuthModeFromProfiles(value: unknown): ConnectedAuthMode | null {
  const profiles = arrayValue(value).filter(isRecord);
  const ranked = [
    "ok",
    "expiring",
    "static",
    "expired",
    "missing",
  ] as const satisfies readonly ProviderAuthHealth[];

  for (const status of ranked) {
    const profile = profiles.find((entry) => stringValue(entry["status"]) === status);
    const mode = connectedAuthMode(profile?.["type"]);
    if (mode !== null) {
      return mode;
    }
  }

  return (
    profiles.map((profile) => connectedAuthMode(profile["type"])).find((mode) => mode !== null) ??
    null
  );
}

function connectionStatusFromAuthHealth(
  status: ProviderAuthHealth,
): ProviderConnectionState["status"] {
  if (status === "expired" || status === "missing") {
    return "needs_attention";
  }

  return "connected";
}

function cleanOptionalLabel(value: unknown): string | null {
  const label = stringValue(value);
  return label === null || label.toLowerCase() === "unknown" ? null : label;
}

function usageLabelFromAuthStatus(usage: Record<string, unknown> | null): string | null {
  if (usage === null) {
    return null;
  }

  const windows = arrayValue(usage["windows"])
    .filter(isRecord)
    .map((window) => numberValue(window["usedPercent"]))
    .filter((usedPercent): usedPercent is number => usedPercent !== null)
    .map((usedPercent) => Math.max(0, Math.min(100, 100 - Math.round(usedPercent))))
    .sort((left, right) => left - right);
  const lowestRemaining = windows[0];
  if (lowestRemaining !== undefined) {
    return `${lowestRemaining}% window left`;
  }

  return stringValue(usage["summary"]);
}

function modelAuthStatusMap(payload: unknown): ReadonlyMap<string, ModelAuthStatusConnection> {
  const root = recordValue(payload) ?? {};
  const providers = arrayValue(root["providers"]).filter(isRecord);
  const byProvider = new Map<string, ModelAuthStatusConnection>();

  for (const provider of providers) {
    const providerId = stringValue(provider["provider"]) ?? stringValue(provider["providerId"]);
    const authHealth = providerAuthHealth(provider["status"]);
    if (providerId === null || authHealth === null) {
      continue;
    }

    const expiry = recordValue(provider["expiry"]);
    const usage = recordValue(provider["usage"]);
    byProvider.set(providerId, {
      providerId,
      status: connectionStatusFromAuthHealth(authHealth),
      authHealth,
      connectedAuthMode: connectedAuthModeFromProfiles(provider["profiles"]),
      expiryLabel: cleanOptionalLabel(expiry?.["label"]),
      planLabel: stringValue(usage?.["plan"]),
      usageLabel: usageLabelFromAuthStatus(usage),
      accountLabel: stringValue(provider["displayName"]),
    });
  }

  return byProvider;
}

function providerPluginId(providerId: string): string {
  return providerId;
}

function pluginAllowPatch(input: {
  readonly providerId: string;
  readonly configGetPayload: unknown;
}): { readonly patch: Record<string, unknown>; readonly replacePaths: readonly string[] } | null {
  const config = configPayload(input.configGetPayload);
  const plugins = recordValue(config["plugins"]);
  const allow = plugins?.["allow"];
  if (!Array.isArray(allow)) {
    return null;
  }

  const current = stringArrayValue(allow);
  const pluginId = providerPluginId(input.providerId);
  if (current.includes(pluginId)) {
    return null;
  }

  return {
    patch: {
      plugins: {
        allow: [...current, pluginId],
      },
    },
    replacePaths: ["plugins.allow"],
  };
}

function gatewayRuntimeUnavailableError(): DomainError {
  return provisioningError(
    "provisioning.connections.gatewayRuntimeUnavailable",
    "Gateway container exec is not configured for model-provider credential writes.",
  );
}

function commandFailureError(input: {
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly result: GatewayRuntimeCommandResult;
}): DomainError {
  // SECURITY (codex review HIGH): `onboard` is a credential-bearing command — its stderr/stdout can
  // echo the SUBMITTED API key (e.g. "invalid key sk-live-..."). Classify from the raw output
  // internally, but NEVER surface it: the returned message reaches the browser via action state.
  // Only code-derived, metadata-safe copy leaves this function.
  const normalized = `${input.result.stderr}\n${input.result.stdout}`.toLowerCase();
  const code =
    normalized.includes("allow") && normalized.includes("plugin")
      ? "provisioning.connections.providerBlockedByAllowlist"
      : normalized.includes("invalid") ||
          normalized.includes("unauthorized") ||
          normalized.includes("401") ||
          normalized.includes("403")
        ? "provisioning.connections.invalidProviderCredential"
        : "provisioning.connections.gatewayOnboardFailed";

  const message =
    code === "provisioning.connections.providerBlockedByAllowlist"
      ? `Gateway blocked ${input.providerId} on the plugin allowlist.`
      : code === "provisioning.connections.invalidProviderCredential"
        ? `Gateway rejected the ${input.providerId} credential (invalid or unauthorized).`
        : `Gateway onboard failed for ${input.providerId} with exit code ${input.result.exitCode}.`;

  return provisioningError(code, message, {
    providerId: input.providerId,
    authChoiceId: input.authChoiceId,
    exitCode: input.result.exitCode,
  });
}

function authLogoutUnavailable(error: DomainError): boolean {
  const text = `${error.code} ${error.message}`.toLowerCase();
  return (
    text.includes("methodnotfound") ||
    text.includes("method not found") ||
    text.includes("not advertised") ||
    text.includes("unknown method")
  );
}

function profileUsesApiKeyAuth(profileIdValue: string, profile: Record<string, unknown>): boolean {
  const mode =
    stringValue(profile["type"]) ?? stringValue(profile["mode"]) ?? stringValue(profile["auth"]);
  if (mode === "oauth" || mode === "token") {
    return false;
  }

  if (mode === "api_key" || mode === "api-key") {
    return true;
  }

  const authChoiceId = authChoiceIdFromProfile(profileIdValue, profile);
  return authChoiceId === null ? false : authModeFromChoiceId(authChoiceId) === "api-key";
}

function disconnectedProviderState(input: {
  readonly providerId: string;
  readonly now: Date;
  readonly message: string;
}): ProviderConnectionState {
  return {
    providerId: input.providerId,
    status: "not_connected",
    authChoiceId: null,
    accountLabel: null,
    scopes: [],
    model: null,
    usageLabel: null,
    lastCheckedAt: input.now.toISOString(),
    message: input.message,
    connectedAuthMode: null,
  };
}

class DockerOpenClawGatewayRuntime implements GatewayRuntimePort {
  private readonly baseUrlResult: Result<string>;

  public constructor(
    private readonly options: {
      readonly dockerHost: string;
      readonly containerName?: string;
      readonly fetch?: Fetch;
    },
  ) {
    this.baseUrlResult = dockerHttpBaseUrl(options.dockerHost);
  }

  public async listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>> {
    const result = await this.exec(["node", "openclaw.mjs", "onboard", "--help"]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: "catalog",
          authChoiceId: "onboard-help",
          result: result.value,
        }),
      );
    }

    return ok(parseOnboardAuthChoices(`${result.value.stdout}\n${result.value.stderr}`));
  }

  public async modelStatus(): Promise<Result<unknown>> {
    const result = await this.exec(["node", "openclaw.mjs", "models", "status", "--json"]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: "status",
          authChoiceId: "models-status",
          result: result.value,
        }),
      );
    }

    try {
      return ok(JSON.parse(result.value.stdout) as unknown);
    } catch (error) {
      return err(
        provisioningError(
          "provisioning.connections.modelStatusInvalidJson",
          "models status JSON was invalid.",
          {
            error: String(error),
          },
        ),
      );
    }
  }

  public async connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>> {
    console.log(
      `provisioning-worker running gateway onboard for provider ${input.providerId} authChoice ${input.authChoiceId}`,
    );
    return this.exec([
      "node",
      "openclaw.mjs",
      "onboard",
      "--non-interactive",
      "--accept-risk",
      "--flow",
      "manual",
      "--auth-choice",
      input.authChoiceId,
      `--${input.keyFlag}`,
      input.apiKey,
      "--json",
    ]);
  }

  public async startDeviceCodeLogin(
    providerId: string,
  ): Promise<Result<GatewayRuntimeDeviceCodeLogin>> {
    const logPath = `/tmp/opzava-df-${randomUUID()}.log`;
    const command = `node openclaw.mjs models auth login --provider ${shellQuote(
      providerId,
    )} --device-code`;
    const shellCommand = `/usr/bin/script -qfc ${shellQuote(command)} ${shellQuote(logPath)}`;
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }

    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdout: false,
          AttachStderr: false,
          Tty: false,
          Cmd: ["sh", "-lc", shellCommand],
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }

    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }

    const started = await this.dockerRawRequest(`/exec/${encodeURIComponent(execId)}/start`, {
      method: "POST",
      body: {
        Detach: true,
        Tty: false,
      },
    });
    if (!started.ok) {
      await this.stopDeviceCodeLogin(execId, logPath);
      return err(started.error);
    }

    return ok({ execId, logPath });
  }

  public async readDeviceCodeLog(logPath: string): Promise<Result<string>> {
    const result = await this.exec(["sh", "-lc", `cat ${shellQuote(logPath)} 2>/dev/null || true`]);
    if (!result.ok) {
      return err(result.error);
    }

    return ok(result.value.stdout);
  }

  public async stopDeviceCodeLogin(_execId: string, logPath: string): Promise<void> {
    await this.exec(["sh", "-lc", `rm -f ${shellQuote(logPath)}`]).catch(() => undefined);
  }

  private async exec(cmd: readonly string[]): Promise<Result<GatewayRuntimeCommandResult>> {
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }

    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: cmd,
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }

    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }

    const started = await this.dockerRawRequest(`/exec/${encodeURIComponent(execId)}/start`, {
      method: "POST",
      body: {
        Detach: false,
        Tty: false,
      },
    });
    if (!started.ok) {
      return err(started.error);
    }

    const inspected = await this.dockerRequest<{ readonly ExitCode?: unknown }>(
      `/exec/${encodeURIComponent(execId)}/json`,
      { method: "GET" },
    );
    if (!inspected.ok) {
      return err(inspected.error);
    }

    const output = dockerMultiplexedOutput(started.value);
    const exitCode = inspected.value.ExitCode;
    return ok({
      exitCode: typeof exitCode === "number" && Number.isFinite(exitCode) ? exitCode : 1,
      stdout: output.stdout,
      stderr: output.stderr,
    });
  }

  private async resolveContainerId(): Promise<Result<string>> {
    if (this.options.containerName !== undefined && this.options.containerName !== "") {
      return ok(this.options.containerName);
    }

    const filters = encodeURIComponent(
      JSON.stringify({ label: ["com.docker.compose.service=openclaw-platform-gateway"] }),
    );
    const containers = await this.dockerRequest<readonly { readonly Id?: unknown }[]>(
      `/containers/json?filters=${filters}`,
      { method: "GET" },
    );
    if (!containers.ok) {
      return err(containers.error);
    }

    const id = containers.value
      .map((container) => stringValue(container.Id))
      .find((value): value is string => value !== null);
    if (id === undefined) {
      return err(
        provisioningError(
          "provisioning.docker.gatewayContainerNotFound",
          "Could not find the openclaw-platform-gateway container through docker-socket-proxy.",
        ),
      );
    }

    return ok(id);
  }

  private async dockerRequest<T>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<Result<T>> {
    const response = await this.dockerRawResponse(path, init);
    if (!response.ok) {
      return err(response.error);
    }

    try {
      return ok((await response.value.json()) as T);
    } catch (error) {
      return err(
        provisioningError("provisioning.docker.invalidJson", "Docker API returned invalid JSON.", {
          error: String(error),
        }),
      );
    }
  }

  private async dockerRawRequest(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<Result<Buffer>> {
    const response = await this.dockerRawResponse(path, init);
    if (!response.ok) {
      return err(response.error);
    }

    return ok(Buffer.from(await response.value.arrayBuffer()));
  }

  private async dockerRawResponse(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<Result<Response>> {
    if (!this.baseUrlResult.ok) {
      return err(this.baseUrlResult.error);
    }

    let response: Response;
    try {
      const requestInit: RequestInit = {
        method: init.method,
        ...(init.body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(init.body),
            }),
      };
      response = await (this.options.fetch ?? fetch)(
        `${this.baseUrlResult.value}${path}`,
        requestInit,
      );
    } catch (error) {
      return err(
        provisioningError("provisioning.docker.requestFailed", "Docker API request failed.", {
          error: String(error),
        }),
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return err(
        provisioningError(
          "provisioning.docker.requestRejected",
          `Docker API request failed with HTTP ${response.status}.`,
          { body },
        ),
      );
    }

    return ok(response);
  }
}

function githubTokenScopes(value: unknown): readonly string[] {
  return splitScope(value);
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toISOString();
  }

  return null;
}

function firstNestedString(value: unknown, keys: readonly string[], depth = 0): string | null {
  if (depth > 4 || !isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const direct = stringValue(value[key]);
    if (direct !== null) {
      return direct;
    }
  }

  for (const nested of Object.values(value)) {
    const found = firstNestedString(nested, keys, depth + 1);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function firstNestedTimestamp(value: unknown, depth = 0): string | null {
  if (depth > 4) {
    return null;
  }

  const direct = isoTimestamp(value);
  if (direct !== null) {
    return direct;
  }

  if (!isRecord(value)) {
    return null;
  }

  const timestampKeys = [
    "lastHeartbeatAt",
    "lastHeartbeat",
    "heartbeatAt",
    "lastSeenAt",
    "updatedAt",
    "timestamp",
    "time",
  ] as const;
  for (const key of timestampKeys) {
    const timestamp = isoTimestamp(value[key]);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  for (const nested of Object.values(value)) {
    const found = firstNestedTimestamp(nested, depth + 1);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function healthPayloadIsUnavailable(value: unknown): boolean {
  const root = recordValue(value);
  if (root === null) {
    return false;
  }

  if (root["ok"] === false || root["healthy"] === false) {
    return true;
  }

  const status = stringValue(root["status"])?.toLowerCase();
  return (
    status === "down" || status === "failed" || status === "unavailable" || status === "unhealthy"
  );
}

function gatewayRegion(input: {
  readonly config: Record<string, unknown>;
  readonly healthPayload: unknown;
  readonly heartbeatPayload: unknown;
}): string | null {
  return (
    firstNestedString(input.healthPayload, ["region", "gatewayRegion", "location"]) ??
    firstNestedString(input.heartbeatPayload, ["region", "gatewayRegion", "location"]) ??
    stringValue(input.config["region"]) ??
    stringValue(input.config["gatewayRegion"])
  );
}

function gatewayConnectionState(input: {
  readonly config: Record<string, unknown>;
  readonly healthResult: Result<unknown>;
  readonly heartbeatResult: Result<unknown>;
  readonly modelsResult: Result<unknown>;
  readonly grantedScopes: readonly string[] | null;
  readonly now: Date;
}): ConnectionsSnapshot["gateway"] {
  const healthPayload = input.healthResult.ok ? input.healthResult.value : {};
  const heartbeatPayload = input.heartbeatResult.ok ? input.heartbeatResult.value : {};
  const messages = [
    input.healthResult.ok ? null : input.healthResult.error.message,
    input.heartbeatResult.ok ? null : input.heartbeatResult.error.message,
    input.modelsResult.ok ? null : input.modelsResult.error.message,
  ].filter((message): message is string => message !== null);

  return {
    status: healthPayloadIsUnavailable(healthPayload) ? "unavailable" : "active",
    region: gatewayRegion({
      config: input.config,
      healthPayload,
      heartbeatPayload,
    }),
    authLabel:
      input.grantedScopes === null || input.grantedScopes.length === 0
        ? "Opzava Gateway operator.read"
        : `Opzava Gateway ${input.grantedScopes.join(", ")}`,
    lastHeartbeatAt:
      firstNestedTimestamp(heartbeatPayload) ??
      firstNestedTimestamp(healthPayload) ??
      input.now.toISOString(),
    message: messages.length === 0 ? null : messages.join(" "),
  };
}

export class GatewayAdminConnectionsProvisioningPort implements ConnectionsProvisioningPort {
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private readonly githubFlows = new Map<string, PendingGitHubDeviceFlow>();
  private readonly modelDeviceFlows = new Map<string, PendingModelProviderDeviceFlow>();

  public constructor(private readonly options: GatewayAdminConnectionsOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async refreshedProviderConnection(
    input: ConnectionProvisioningPrincipal & { readonly providerId: string },
    fallbackMessage: string,
  ): Promise<ProviderConnectionState> {
    const snapshot = await this.getConnectionsSnapshot(input);
    if (snapshot.ok) {
      const connection = snapshot.value.providerConnections.find(
        (entry) => entry.providerId === input.providerId,
      );
      if (connection !== undefined) {
        return connection;
      }
    }

    return disconnectedProviderState({
      providerId: input.providerId,
      now: this.now(),
      message: fallbackMessage,
    });
  }

  private async modelAuthStatus(): Promise<ReadonlyMap<string, ModelAuthStatusConnection> | null> {
    try {
      const result = await this.options.adminClient.request("models.authStatus", {
        refresh: false,
      });
      if (!result.ok) {
        console.warn("connections.authStatus.fallback");
        return null;
      }

      // An ok-but-unparseable/empty payload must ALSO fall back to the CLI status path, not silently
      // degrade to config-only (codex/Claude review LOW-5). Treat an empty parse as unavailable.
      const map = modelAuthStatusMap(result.value);
      if (map.size === 0) {
        console.warn("connections.authStatus.fallback");
        return null;
      }

      return map;
    } catch {
      console.warn("connections.authStatus.fallback");
      return null;
    }
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

    const [
      healthResult,
      heartbeatResult,
      modelsResult,
      authChoicesResult,
      modelStatusResult,
      authStatus,
    ] = await Promise.all([
      this.options.adminClient.request("health", {}),
      this.options.adminClient.request("last-heartbeat", {}),
      this.options.adminClient.request("models.list", { view: "all" }),
      this.options.gatewayRuntime?.listAuthChoices() ?? ok<readonly GatewayRuntimeAuthChoice[]>([]),
      // `models status` (CLI) sees the REAL profile stores — incl. the Codex/OAuth store that the
      // `models.authStatus` RPC under-reports as "missing" for openai. It is the connected-truth.
      this.options.gatewayRuntime?.modelStatus() ??
        ok<unknown>({ auth: { providers: [] }, allowed: [] }),
      this.modelAuthStatus(),
    ]);
    const config = configPayload(configResult.value);
    const runtimeChoices = authChoicesResult.ok ? authChoicesResult.value : [];
    const catalog = ensureCanonicalLlmProviders({
      catalog: mergeRuntimeAuthChoices({
        catalog: providerCatalogFromModels(modelsResult.ok ? modelsResult.value : {}, config),
        choices: runtimeChoices,
      }),
      choices: runtimeChoices,
    });
    const providerConnections = catalog.map((provider) => {
      // Base connection = the profile-truth: CLI `models status` first, then config auth profiles.
      const baseConnection =
        (modelStatusResult.ok
          ? providerConnectionFromModelStatus({
              provider,
              config,
              modelStatus: modelStatusResult.value,
              now,
            })
          : null) ?? providerConnectionFromConfig({ provider, config, now });
      const authState = authStatus?.get(provider.id);
      if (authState === undefined) {
        return baseConnection;
      }

      // authStatus ENRICHES (expiry/plan/usage/authMode) but does not get to demote a provider the
      // profile stores show as connected — except on a hard `expired` (a real re-auth signal). Its
      // `missing` is a store-visibility gap (openai/Codex), never a disconnect.
      const connectedByProfiles = baseConnection.status === "connected";
      const status: ProviderConnectionState["status"] = connectedByProfiles
        ? authState.authHealth === "expired"
          ? "needs_attention"
          : "connected"
        : authState.status;

      return {
        ...baseConnection,
        status,
        authHealth: authState.authHealth,
        connectedAuthMode: authState.connectedAuthMode ?? baseConnection.connectedAuthMode ?? null,
        expiryLabel: authState.expiryLabel,
        planLabel: authState.planLabel,
        usageLabel: authState.usageLabel ?? baseConnection.usageLabel,
        accountLabel: authState.accountLabel ?? baseConnection.accountLabel,
      };
    });
    // Connections stay catalog-aligned by construction: a provider the model catalog does not
    // advertise is not routable as a model, so we do not synthesize a phantom connection row for it
    // (review: authStatus is a subset of models.list in practice). The projection is catalog-driven.
    const github = await this.githubState(input, now);

    return ok({
      gateway: gatewayConnectionState({
        config,
        healthResult,
        heartbeatResult,
        modelsResult,
        grantedScopes: this.options.adminClient.grantedScopes(),
        now,
      }),
      providerCatalog: catalog,
      providerConnections,
      pendingDeviceFlows: [
        ...[...this.modelDeviceFlows.values()].map((flow) => this.challengeFromModelFlow(flow)),
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

    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    const authChoices = await gatewayRuntime.listAuthChoices();
    if (!authChoices.ok) {
      return err(authChoices.error);
    }

    const authChoice = authChoicesForProvider({
      providerId: input.providerId,
      choices: authChoices.value,
    }).find((choice) => choice.id === input.authChoiceId);
    if (authChoice === undefined) {
      return err(
        provisioningError(
          "provisioning.connections.authChoiceUnavailable",
          "The live Opzava Gateway auth-choice catalog does not expose that provider auth method.",
          { providerId: input.providerId, authChoiceId: input.authChoiceId },
        ),
      );
    }

    if (authChoice.mode !== "api-key" || authChoice.keyFlag === undefined) {
      return err(
        provisioningError(
          "provisioning.connections.deviceFlowAuthChoiceRequired",
          modelDeviceFlowRequiredMessage,
          { providerId: input.providerId, authChoiceId: input.authChoiceId },
        ),
      );
    }

    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const allowPatch = pluginAllowPatch({
      providerId: input.providerId,
      configGetPayload: configResult.value,
    });
    if (allowPatch !== null) {
      const patchParams = configPatchParams({
        configGetPayload: configResult.value,
        patch: allowPatch.patch,
        replacePaths: allowPatch.replacePaths,
      });
      if (!patchParams.ok) {
        return err(patchParams.error);
      }

      const patchResult = await this.options.adminClient.request(
        "config.patch",
        patchParams.value,
        {
          requiredScope: "operator.admin",
        },
      );
      if (!patchResult.ok) {
        return err(patchResult.error);
      }
    }

    const onboard = await gatewayRuntime.connectApiKey({
      providerId: input.providerId,
      authChoiceId: input.authChoiceId,
      keyFlag: authChoice.keyFlag,
      apiKey: input.apiKey,
    });
    if (!onboard.ok) {
      return err(onboard.error);
    }
    if (onboard.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: input.providerId,
          authChoiceId: input.authChoiceId,
          result: onboard.value,
        }),
      );
    }

    const status = await gatewayRuntime.modelStatus();
    if (!status.ok) {
      return err(status.error);
    }

    const config = configPayload(configResult.value);
    const catalogProvider =
      mergeRuntimeAuthChoices({
        catalog: providerCatalogFromModels({}, config),
        choices: authChoices.value,
      }).find((provider) => provider.id === input.providerId) ??
      ({
        id: input.providerId,
        label: input.providerId,
        vendor: input.providerId,
        authChoices: [authChoice],
        suggestedModel: input.providerId,
        roleStrength: "Gateway-advertised provider",
        whenToUse: "Use when this connected model is appropriate.",
      } satisfies ModelProviderCatalogEntry);
    const connection = providerConnectionFromModelStatus({
      provider: catalogProvider,
      config,
      modelStatus: status.value,
      now: this.now(),
    });
    if (connection === null || connection.status !== "connected") {
      return err(
        provisioningError(
          "provisioning.connections.providerStatusNotConnected",
          "Gateway onboard completed, but models status did not report a usable provider credential.",
          { providerId: input.providerId, authChoiceId: input.authChoiceId },
        ),
      );
    }

    return ok({ ...connection, authChoiceId: input.authChoiceId });
  }

  public async startModelProviderDeviceFlow(
    input: StartModelProviderDeviceFlowInput,
  ): Promise<Result<DeviceFlowChallenge>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    const authChoices = await gatewayRuntime.listAuthChoices();
    if (!authChoices.ok) {
      return err(authChoices.error);
    }

    const authChoice = authChoicesForProvider({
      providerId: input.providerId,
      choices: authChoices.value,
    }).find((choice) => choice.id === input.authChoiceId);
    if (authChoice === undefined) {
      return err(
        provisioningError(
          "provisioning.connections.authChoiceUnavailable",
          "The live Opzava Gateway auth-choice catalog does not expose that provider auth method.",
          { providerId: input.providerId, authChoiceId: input.authChoiceId },
        ),
      );
    }

    if (authChoice.mode !== "device-flow") {
      return err(
        provisioningError(
          "provisioning.connections.deviceFlowAuthChoiceRequired",
          "That provider auth method does not support OAuth device flow.",
          { providerId: input.providerId, authChoiceId: input.authChoiceId },
        ),
      );
    }

    const login = await gatewayRuntime.startDeviceCodeLogin(
      deviceCodeProviderArg({
        providerId: input.providerId,
        authChoiceId: input.authChoiceId,
      }),
    );
    if (!login.ok) {
      return err(login.error);
    }

    const baseFlow: PendingModelProviderDeviceFlow = {
      flowId: `model:${randomUUID()}`,
      orgId: input.orgId,
      providerId: input.providerId,
      authChoiceId: input.authChoiceId,
      expiresAt: new Date(this.now().getTime() + modelDeviceFlowExpiresMs),
      intervalSeconds: modelDeviceFlowPollIntervalSeconds,
      execId: login.value.execId,
      logPath: login.value.logPath,
    };

    for (let attempt = 0; attempt < modelDeviceFlowStartMaxAttempts; attempt += 1) {
      const log = await gatewayRuntime.readDeviceCodeLog(login.value.logPath);
      if (!log.ok) {
        await gatewayRuntime.stopDeviceCodeLogin(login.value.execId, login.value.logPath);
        return err(log.error);
      }

      const parsed = parseDeviceCodeLog(log.value);
      if (parsed !== null) {
        const flow: PendingModelProviderDeviceFlow = {
          ...baseFlow,
          verificationUri: parsed.verificationUri,
          userCode: parsed.userCode,
        };
        this.modelDeviceFlows.set(flow.flowId, flow);
        return ok(this.challengeFromModelFlow(flow));
      }

      await sleep(modelDeviceFlowStartPollDelayMs);
    }

    this.modelDeviceFlows.set(baseFlow.flowId, baseFlow);
    return ok(this.challengeFromModelFlow(baseFlow));
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
      return this.pollModelProviderFlow(input, modelFlow);
    }

    if (input.flowId.startsWith("model:")) {
      return ok({
        status: "expired",
        message: "Model-provider device code expired or has already completed.",
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
    // A provider's credential can live in EITHER store, so disconnect must clear BOTH:
    //  (1) models.authLogout — the OAuth/token/managed store (e.g. openai/Codex OAuth).
    //  (2) config.auth.profiles — config-file api-key profiles (e.g. zai). authLogout returns ok
    //      but removes 0 profiles for a config api-key, so clearing only via authLogout leaves the
    //      key in place and the provider still "connected" (the zai disconnect-does-nothing bug).
    const logout = await this.options.adminClient.request(
      "models.authLogout",
      { provider: input.providerId },
      { requiredScope: "operator.admin" },
    );
    if (!logout.ok && !authLogoutUnavailable(logout.error)) {
      return err(logout.error);
    }

    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const config = configPayload(configResult.value);
    const apiKeyProfileIds = Object.entries(authProfiles(config))
      .filter(
        ([id, profile]) =>
          isRecord(profile) &&
          providerIdFromProfile(id, profile) === input.providerId &&
          profileUsesApiKeyAuth(id, profile),
      )
      .map(([id]) => id);

    if (apiKeyProfileIds.length > 0) {
      const patchParams = configPatchParams({
        configGetPayload: configResult.value,
        patch: {
          auth: {
            profiles: Object.fromEntries(apiKeyProfileIds.map((id) => [id, null])),
            order: { [input.providerId]: [] },
          },
        },
      });
      if (!patchParams.ok) {
        return err(patchParams.error);
      }
      const result = await this.options.adminClient.request("config.patch", patchParams.value, {
        requiredScope: "operator.admin",
      });
      if (!result.ok) {
        return err(result.error);
      }
    }

    // If neither store held anything, authLogout was genuinely unavailable AND there was no config
    // profile — surface that rather than pretending we disconnected.
    if (!logout.ok && apiKeyProfileIds.length === 0) {
      return err(
        provisioningError(
          "provisioning.connections.authLogoutUnavailable",
          "Gateway models.authLogout is unavailable and no API-key config profile was found to remove.",
          { providerId: input.providerId },
        ),
      );
    }

    return ok(
      await this.refreshedProviderConnection(input, "Opzava Gateway provider credentials removed."),
    );
  }

  public async applyOrchestratorDelegation(
    input: ApplyOrchestratorDelegationInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const modelsResult = await this.options.adminClient.request("models.list", { view: "all" });
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
    const patchParams = configPatchParams({
      configGetPayload: configResult.value,
      patch: {
        agents: {
          list: [...existingAgents, ...agentConfig.agents.list],
        },
      },
    });
    if (!patchParams.ok) {
      return err(patchParams.error);
    }

    const result = await this.options.adminClient.request("config.patch", patchParams.value, {
      requiredScope: "operator.admin",
    });
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

    if (ref.value === null) {
      return {
        status: "not_connected",
        accountLabel: null,
        scopes: [],
        repository: this.options.githubRepository,
        lastCheckedAt: now.toISOString(),
        message: "GitHub is not connected.",
      };
    }

    const resolver = this.options.secretsVault.resolveSecretValue;
    if (resolver === undefined) {
      return {
        status: "connected",
        accountLabel: "GitHub token",
        scopes: [],
        repository: this.options.githubRepository,
        lastCheckedAt: now.toISOString(),
        message: "GitHub token vault reference is present.",
      };
    }

    const resolved = await resolver.call(this.options.secretsVault, {
      ref: ref.value,
      requestedBy: input.actorUserId,
      reason: "connections.github.status",
    });
    if (!resolved.ok) {
      return {
        status: "needs_attention",
        accountLabel: null,
        scopes: [],
        repository: this.options.githubRepository,
        lastCheckedAt: now.toISOString(),
        message: resolved.error.message,
      };
    }

    return this.verifiedGitHubState(resolved.value, now);
  }

  private async verifiedGitHubState(token: string, now: Date): Promise<GitHubConnectionState> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.github.com/user", {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
      });
    } catch (error) {
      return {
        status: "needs_attention",
        accountLabel: null,
        scopes: [],
        repository: this.options.githubRepository,
        lastCheckedAt: now.toISOString(),
        message: `GitHub token validation failed before response: ${String(error)}`,
      };
    }

    if (!response.ok) {
      return {
        status: "needs_attention",
        accountLabel: null,
        scopes: splitScope(response.headers.get("x-oauth-scopes")),
        repository: this.options.githubRepository,
        lastCheckedAt: now.toISOString(),
        message: `GitHub token validation failed with HTTP ${response.status}.`,
      };
    }

    const payload = await response.json().catch(() => null);
    const login = isRecord(payload) ? stringValue(payload["login"]) : null;
    return {
      status: "connected",
      accountLabel: login === null ? "GitHub token" : `@${login}`,
      scopes: splitScope(response.headers.get("x-oauth-scopes")),
      repository: this.options.githubRepository,
      lastCheckedAt: now.toISOString(),
      message: "GitHub token validated from SecretsVaultPort.",
    };
  }

  private challengeFromModelFlow(flow: PendingModelProviderDeviceFlow): DeviceFlowChallenge {
    const codePending = flow.verificationUri === undefined || flow.userCode === undefined;
    return {
      flowId: flow.flowId,
      kind: "model_provider",
      providerId: flow.providerId,
      authChoiceId: flow.authChoiceId,
      verificationUri: flow.verificationUri ?? "",
      userCode: flow.userCode ?? "",
      codePending,
      expiresAt: flow.expiresAt.toISOString(),
      intervalSeconds: flow.intervalSeconds,
    };
  }

  private async cleanupModelProviderFlow(flow: PendingModelProviderDeviceFlow): Promise<void> {
    this.modelDeviceFlows.delete(flow.flowId);
    await this.options.gatewayRuntime?.stopDeviceCodeLogin(flow.execId, flow.logPath);
  }

  private async pollModelProviderFlow(
    input: { readonly flowId: string } & ConnectionProvisioningPrincipal,
    flow: PendingModelProviderDeviceFlow,
  ): Promise<Result<DeviceFlowPollState>> {
    // A device flow belongs to the principal that started it; never let another tenant poll it.
    if (flow.orgId !== input.orgId) {
      return ok({ status: "expired", message: "Device sign-in not found." });
    }
    if (this.now().getTime() >= flow.expiresAt.getTime()) {
      await this.cleanupModelProviderFlow(flow);
      return ok({
        status: "expired",
        message:
          flow.verificationUri === undefined || flow.userCode === undefined
            ? "Could not get a device code, try again."
            : "Model-provider device code expired.",
      });
    }

    const connection = await this.refreshedProviderConnection(
      { ...input, providerId: flow.providerId },
      "Waiting for gateway device-code authorization.",
    );
    if (connection.status === "connected") {
      await this.cleanupModelProviderFlow(flow);
      return ok({
        status: "connected",
        message: `${flow.providerId} connected in Opzava Gateway.`,
        connection: {
          ...connection,
          authChoiceId: connection.authChoiceId ?? flow.authChoiceId,
        },
      });
    }

    let currentFlow = flow;
    const log = await this.options.gatewayRuntime?.readDeviceCodeLog(flow.logPath);
    if (log !== undefined && !log.ok) {
      return err(log.error);
    }
    if (
      log !== undefined &&
      (currentFlow.verificationUri === undefined || currentFlow.userCode === undefined)
    ) {
      const parsed = parseDeviceCodeLog(log.value);
      if (parsed !== null) {
        currentFlow = {
          ...currentFlow,
          verificationUri: parsed.verificationUri,
          userCode: parsed.userCode,
        };
        this.modelDeviceFlows.set(currentFlow.flowId, currentFlow);
      }
    }
    if (log !== undefined && deviceCodeLogTerminalFailure(log.value)) {
      await this.cleanupModelProviderFlow(currentFlow);
      return ok({
        status: "failed",
        message: "Gateway device-code authorization failed or was denied.",
      });
    }

    if (currentFlow.verificationUri !== undefined && currentFlow.userCode !== undefined) {
      return ok({
        status: "pending",
        message: "Waiting for gateway device-code authorization.",
        intervalSeconds: currentFlow.intervalSeconds,
        verificationUri: currentFlow.verificationUri,
        userCode: currentFlow.userCode,
        codePending: false,
      });
    }

    return ok({
      status: "pending",
      message: "Requesting device code...",
      intervalSeconds: currentFlow.intervalSeconds,
      codePending: true,
    });
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
      return ok({
        status: "pending",
        message: "Waiting for GitHub device approval.",
        intervalSeconds: flow.intervalSeconds,
      });
    }

    if (errorCode === "slow_down") {
      const slowedFlow = { ...flow, intervalSeconds: Math.min(flow.intervalSeconds + 5, 60) };
      this.githubFlows.set(flow.flowId, slowedFlow);
      return ok({
        status: "pending",
        message: "GitHub asked us to slow polling.",
        intervalSeconds: slowedFlow.intervalSeconds,
      });
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
    const connection = await this.githubState(flow.principal, this.now());
    return ok({
      status: "connected",
      message: "GitHub token stored in SecretsVaultPort.",
      connection:
        connection.status === "connected"
          ? connection
          : {
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
  const operatorDeviceToken = env["OPENCLAW_OPERATOR_DEVICE_TOKEN"]?.trim();
  const requestedScopes = readRequestedOperatorScopes(env);
  const privateKeyPem = readPrivateKeyPem(env);
  const hasAdminCredential =
    (operatorDeviceToken !== undefined && operatorDeviceToken !== "") ||
    (gatewayToken !== undefined && gatewayToken !== "");

  if (
    gatewayUrl === undefined ||
    gatewayUrl === "" ||
    !hasAdminCredential ||
    privateKeyPem === null
  ) {
    return new UnavailableConnectionsProvisioningPort(
      "OPENCLAW_GATEWAY_URL, OPENCLAW_OPERATOR_DEVICE_TOKEN or OPENCLAW_GATEWAY_TOKEN, and OPENCLAW_DEVICE_PRIVATE_KEY_PEM(_BASE64) are required for Connections provisioning.",
      repository,
    );
  }

  const explicitDeviceId = env["OPENCLAW_DEVICE_ID"]?.trim();
  const explicitPublicKey = env["OPENCLAW_DEVICE_PUBLIC_KEY"]?.trim();
  const githubOAuthClientId = env["GITHUB_OAUTH_CLIENT_ID"]?.trim();
  const dockerHost = readDockerHost(env);
  const gatewayContainerName = readGatewayContainerName(env);
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
      ...(gatewayToken === undefined || gatewayToken === "" ? {} : { gatewayToken }),
      ...(operatorDeviceToken === undefined || operatorDeviceToken === ""
        ? {}
        : { operatorDeviceToken }),
      ...(requestedScopes === undefined ? {} : { requestedScopes }),
      keypair,
    }),
    secretsVault: vault,
    githubRepository: repository,
    ...(dockerHost === null
      ? {}
      : {
          gatewayRuntime: new DockerOpenClawGatewayRuntime({
            dockerHost,
            ...(gatewayContainerName === null ? {} : { containerName: gatewayContainerName }),
          }),
        }),
    ...(githubOAuthClientId === undefined || githubOAuthClientId === ""
      ? {}
      : { githubOAuthClientId }),
  });
}
