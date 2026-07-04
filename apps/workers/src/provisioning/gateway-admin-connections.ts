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

interface GatewayRuntimePort {
  listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>>;
  modelStatus(): Promise<Result<unknown>>;
  connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>>;
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
  "Model-provider device-flow OAuth requires an interactive gateway login. Use the Gateway CLI runbook for this provider.";

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
    message: "Opzava Gateway auth profile is present.",
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
    normalized === "openai" ||
    normalized === "github-copilot"
    ? "device-flow"
    : "api-key";
}

function authChoiceLabel(choiceId: string, mode: "api-key" | "device-flow"): string {
  if (mode === "api-key") {
    return "API key";
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
    if (provider.authChoices.length > 0) {
      return provider;
    }

    const authChoices = authChoicesForProvider({
      providerId: provider.id,
      choices: input.choices,
    });

    return authChoices.length === 0 ? provider : { ...provider, authChoices };
  });
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
    model:
      allowedModels.find((model) => model.startsWith(`${input.provider.id}/`)) ??
      input.provider.suggestedModel,
    usageLabel: profileCount === 1 ? "1 auth profile" : `${profileCount} auth profiles`,
    lastCheckedAt: input.now.toISOString(),
    message: providerAllowed
      ? "Gateway model auth profile is usable."
      : "Provider has credentials but no allowed model in the Gateway model allowlist.",
  };
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
  const output = `${input.result.stderr}\n${input.result.stdout}`.trim();
  const normalized = output.toLowerCase();
  const code =
    normalized.includes("allow") && normalized.includes("plugin")
      ? "provisioning.connections.providerBlockedByAllowlist"
      : normalized.includes("invalid") ||
          normalized.includes("unauthorized") ||
          normalized.includes("401") ||
          normalized.includes("403")
        ? "provisioning.connections.invalidProviderCredential"
        : "provisioning.connections.gatewayOnboardFailed";

  return provisioningError(
    code,
    output === ""
      ? `Gateway onboard failed for ${input.providerId} with exit code ${input.result.exitCode}.`
      : output,
    {
      providerId: input.providerId,
      authChoiceId: input.authChoiceId,
      exitCode: input.result.exitCode,
    },
  );
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

    const [healthResult, heartbeatResult, modelsResult, modelStatusResult, authChoicesResult] =
      await Promise.all([
        this.options.adminClient.request("health", {}),
        this.options.adminClient.request("last-heartbeat", {}),
        this.options.adminClient.request("models.list", { view: "all" }),
        this.options.gatewayRuntime?.modelStatus() ??
          ok<unknown>({ auth: { providers: [] }, allowed: [] }),
        this.options.gatewayRuntime?.listAuthChoices() ??
          ok<readonly GatewayRuntimeAuthChoice[]>([]),
      ]);
    const config = configPayload(configResult.value);
    const catalog = mergeRuntimeAuthChoices({
      catalog: providerCatalogFromModels(modelsResult.ok ? modelsResult.value : {}, config),
      choices: authChoicesResult.ok ? authChoicesResult.value : [],
    });
    const providerConnections = catalog.map(
      (provider) =>
        (modelStatusResult.ok
          ? providerConnectionFromModelStatus({
              provider,
              config,
              modelStatus: modelStatusResult.value,
              now,
            })
          : null) ?? providerConnectionFromConfig({ provider, config, now }),
    );
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
          "provisioning.connections.deviceFlowRequiresInteractive",
          modelDeviceFlowUnsupportedMessage,
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
    return err(
      provisioningError(
        "provisioning.connections.deviceFlowRequiresInteractive",
        modelDeviceFlowUnsupportedMessage,
        { providerId: input.providerId, authChoiceId: input.authChoiceId },
      ),
    );
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
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const config = configPayload(configResult.value);
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
    const patchParams = configPatchParams({
      configGetPayload: configResult.value,
      patch: {
        auth: {
          profiles: profilePatch,
          order: {
            [input.providerId]: [],
          },
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
      providerId: input.providerId,
      status: "not_connected",
      authChoiceId: null,
      accountLabel: null,
      scopes: [],
      model: null,
      usageLabel: null,
      lastCheckedAt: this.now().toISOString(),
      message: "Opzava Gateway auth profile removed.",
    });
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
