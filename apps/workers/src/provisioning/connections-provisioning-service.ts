import { createHash, randomUUID } from "node:crypto";

import { LocalFileSecretsVault } from "@opzava/adapters";
import {
  canonicalProviderLabel,
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
  type GatewayRuntimeAuthChoice,
  type GatewayRuntimeCommandResult,
  type GatewayRuntimePort,
  type GetSecretRefInput,
  type GitHubConnectionState,
  type ModelProviderApiKeyConnectPollState,
  type ModelProviderApiKeyConnectStart,
  type ModelProviderDisconnectPollState,
  type ModelProviderDisconnectStart,
  listCanonicalLlmProviderIds,
  type ModelSummary,
  type ModelProviderAuthChoice,
  type ModelProviderCatalogEntry,
  type OrchestratorDelegationState,
  type OrchestratorSubagentRole,
  type PollModelProviderApiKeyConnectInput,
  type PollModelProviderDisconnectInput,
  type PollModelProviderSetupTokenFlowInput,
  type ProviderAuthHealth,
  type ProviderConnectionState,
  type SecretsVaultPort,
  type SetMainOrchestratorInput,
  type StartGitHubDeviceFlowInput,
  type StartModelProviderDeviceFlowInput,
  type StartModelProviderSetupTokenFlowInput,
  type SetupTokenFlowPollState,
  type SetupTokenFlowStart,
  type SubmitModelProviderSetupTokenCodeInput,
  type OpenClawOperatorScope,
  type OpenClawAdminRpcPort,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_ID,
  ASK_ADMIN_AGENT_MODEL,
  ASK_ADMIN_WORKER_ADMIN_OPERATOR_SCOPES,
  ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
} from "./ask-admin-agent.js";
import { buildDelegationProvisioningReceipt, buildOrchestratorAgentConfig } from "./connections.js";
import {
  Ed25519OpenClawAdminDeviceKeypair,
  OpenClawAdminRpcClient,
  type OpenClawAdminLogger,
} from "./openclaw-admin-client.js";
import { DockerOpenClawGatewayRuntime } from "./docker-gateway-runtime.js";
import {
  configPatchParams,
  consoleAdminLogger,
  gatewayRuntimeUnavailableError,
  readDockerHost,
  readGatewayContainerName,
  readPrivateKeyPem,
  readRepository,
  readRequestedOperatorScopes,
  secretRef,
  unavailableSnapshot,
  vaultTokenRef,
} from "./gateway-config-mutation.js";

type Fetch = typeof fetch;

interface MutableSecretsVault extends SecretsVaultPort {
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
  readonly timeout: ReturnType<typeof setTimeout>;
}

interface PendingModelProviderApiKeyConnect {
  readonly opId: string;
  readonly orgId: string;
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly timeout: ReturnType<typeof setTimeout>;
  outcome?: ModelProviderApiKeyConnectPollState;
}

interface PendingModelProviderDisconnect {
  readonly opId: string;
  readonly orgId: string;
  readonly providerId: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly timeout: ReturnType<typeof setTimeout>;
  outcome?: ModelProviderDisconnectPollState;
}

interface PendingModelProviderSetupTokenFlow {
  readonly flowId: string;
  readonly orgId: string;
  readonly providerId: string;
  readonly authChoiceId: "setup-token";
  readonly execId: string;
  readonly logPath: string;
  readonly stdinPath: string;
  readonly expiresAt: Date;
  readonly timeout: ReturnType<typeof setTimeout>;
  phase: "starting" | "awaiting_code" | "completing";
  authorizeUrl?: string;
  codeSubmittedAt?: Date;
  completionInFlight?: boolean;
  outcome?: SetupTokenFlowPollState;
}

const modelDeviceFlowRequiredMessage =
  "That provider auth method uses OAuth device flow. Start the browser device-flow sign-in instead.";
const modelDeviceFlowStartPollDelayMs = 1_500;
const modelDeviceFlowStartMaxAttempts = 4;
const modelDeviceFlowExpiresMs = 15 * 60 * 1000;
const modelDeviceFlowPollIntervalSeconds = 5;
const modelApiKeyConnectExpiresMs = 120 * 1000;
const modelSetupTokenFlowExpiresMs = 10 * 60 * 1000;
const setupTokenCodeExchangeTimeoutMs = 30_000;
const modelApiKeyPostCheckMaxWaitMs = 30 * 1000;
const modelApiKeyPostCheckDelayMs = 500;
const disconnectTransientMaxAttempts = 3;
// Budget for UNPLANNED waits only (rate-limit backoff, closed-before-response, post-check retries).
// The deliberate inter-logout pacing below is planned work and must NOT be charged against it —
// doing so made any tenant with 8+ agents fail with disconnectRetryExhausted (#168).
const disconnectTransientMaxTotalWaitMs = 150_000;
const disconnectAuthLogoutInterCallDelayMs = 20_000;
// Raised by exactly one because disconnect now always carries one extra target — the shared `main`
// store that connect writes the credential into. Shifting the threshold in step keeps the pacing
// behaviour identical at every fleet size rather than silently adding 20s to ordinary disconnects.
const disconnectAuthLogoutUnpacedLimit = 4;
// The paced logouts run 60-120s+, so the operation is polled rather than awaited in one request.
// Keep the worker's TTL above the browser's poll window so a slow disconnect still lands.
const modelProviderDisconnectExpiresMs = 15 * 60 * 1000;
const disconnectClosedBeforeResponseRetryDelayMs = 500;
const disconnectPostCheckRetryDelayMs = 1_000;

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

function stripAnsi(value: string): string {
  // The provider CLIs are TTY prompters, and they lay text out by MOVING THE CURSOR rather than by
  // emitting spaces: `Store\x1b[9Gthis\x1b[14Gtoken` renders as "Store this token". Deleting every
  // escape (the old behaviour) therefore CONCATENATED words -- which is how "Store this token
  // securely" fused onto a captured setup-token and produced a 130-char credential where the real
  // one is 108 (#145). Cursor movement is layout, so it becomes a space; only decoration is dropped.
  // ESC (0x1B) is intentional here.
  /* eslint-disable no-control-regex */
  return (
    value
      // OSC (hyperlinks): \x1B] ... BEL or ST. These wrap a URL around its own label, so leaving
      // them in duplicated the authorize URL and appended a fragment of it to the parsed value.
      .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
      // CSI cursor positioning (CHA/CUF/CUP/HVP/HPA/HPR/VPA): a gap the CLI drew, so keep a gap.
      .replace(/\x1B\[[0-9;?]*[GCHfad`]/g, " ")
      // Every other CSI: colour, erase, cursor show/hide, spinner repaint. Pure decoration.
      .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, "")
  );
  /* eslint-enable no-control-regex */
}

function terminalLines(value: string): readonly string[] {
  // A lone CR returns the cursor to column 0 (spinner repaint), so it separates renders just as a
  // newline does. Normalising both keeps the line-oriented parsers below from fusing two lines.
  return stripAnsi(value)
    .replace(/\r\n?/g, "\n")
    .split("\n");
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
  const stripped = stripAnsi(logValue);
  // The device-code CLI prints a distinct failure headline when the provider blocks,
  // rate-limits, or errors the request (e.g. "OpenAI device code failed", "device code
  // request failed: HTTP 429", "Trouble with device code login?"). None of these appear in
  // a healthy prompt, so scan the WHOLE log: a provider Cloudflare/429 block pushes the
  // headline before ~4KB of trailing challenge HTML, out of the recent-tail window below.
  // Without this the poller stalls on "Requesting device code..." until flow expiry.
  if (
    /\bdevice[_ ]code(?:[_ ]request)?[_ ]failed\b|\btrouble with device[_ ]code login\b/i.test(
      stripped,
    )
  ) {
    return true;
  }
  // Deliberately narrow: connected + expiry are the reliable terminals, so match only
  // unambiguous OAuth-denial signals absent from normal prompter output (a broad
  // /error|expired|invalid/ would false-kill valid flows: the "Code expires in N minutes"
  // countdown, stray "error" in the spinner UI, etc.).
  return /\b(access[_ ]denied|authorization[_ ](denied|declined)|expired[_ ]token|invalid[_ ]grant|invalid[_ ]client|denied by (the )?user|sign[- ]?in (failed|was denied|declined))\b/i.test(
    stripped.slice(-4096),
  );
}

// A minted Claude setup-token is a single unbroken run of token characters, and it is a FIXED
// length: `sk-ant-oat01-` + 95 payload characters. The length is the only thing that proves the
// token is whole, because both ways the terminal can damage it leave a value that still looks like
// a token: prose fused onto the end (the 130-char credential of #145) and a PTY hard-wrap that
// truncates it mid-token both match prefix-and-charset perfectly. Verified live against
// api.anthropic.com in #145: the 108-char value authenticates, the 130-char value 401s.
//
// If Anthropic ever changes the format this rejects the token and says so, which is a connect that
// fails loudly and is fixed in one line -- the alternative is storing a secret we cannot prove and
// discovering it weeks later as an unexplained 401 on every delegation.
const setupTokenLength = 108;
const setupTokenPattern = /(?:^|\s)(sk-ant-oat01-[A-Za-z0-9_-]+)(?=\s|$)/;

function setupTokenFromLog(logValue: string): string | null {
  // Scan LINE BY LINE, and require whitespace on both sides of the match. The predecessor joined
  // every line in the log before matching, which put the CLI's "Store this token securely." notice
  // straight against the token and let the charset run swallow it (#145). Nothing here reassembles
  // a token from fragments.
  for (const line of terminalLines(logValue)) {
    const candidate = line.match(setupTokenPattern)?.[1];
    if (candidate === undefined) {
      continue;
    }
    if (candidate.length === setupTokenLength) {
      return candidate;
    }

    console.warn("connections.setupToken.rejectedMalformedToken", {
      reason: candidate.length > setupTokenLength ? "tooLong" : "tooShort",
      expectedLength: setupTokenLength,
      observedLength: candidate.length,
    });
  }

  return null;
}

function setupTokenAuthorizeUrl(logValue: string): string | null {
  for (const line of terminalLines(logValue)) {
    const urls = line.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
    for (const url of urls) {
      const haystack = `${line} ${url}`.toLowerCase();
      if (
        haystack.includes("oauth") ||
        haystack.includes("claude.ai") ||
        haystack.includes("anthropic.com")
      ) {
        return url;
      }
    }
  }
  return null;
}

function setupTokenTerminalFailure(logValue: string): boolean {
  const stripped = stripAnsi(logValue);
  return (
    /setup[- ]token.*(failed|error|denied)/i.test(stripped) ||
    /\binvalid[ _](authorization[ _])?(code|grant|request)\b/i.test(stripped) ||
    /login failed/i.test(stripped)
  );
}

function redactDeviceCodeLog(value: string): string {
  return value
    .replace(
      /(["']?(?:refresh_token|access_token|id_token|api[_-]?key|token)["']?\s*:\s*)["'][^"']+["']/gi,
      '$1"[redacted]"',
    )
    .replace(
      /\b(refresh_token|access_token|id_token|api[_-]?key|token)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[redacted]");
}

function deviceCodeLogReadError(providerId: string): DomainError {
  return provisioningError(
    "provisioning.connections.deviceFlowLogUnavailable",
    "Gateway device-code log could not be read.",
    { providerId },
  );
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

// Every agent read-through-inherits auth profiles from ONE store, and OpenClaw resolves that store
// from an EMPTY config — so it is literally the `main` agent dir, never the configured default
// agent. Onboard writes to the *configured default* agent, which for Opzava is the orchestrator.
// The two disagree, so a credential onboard stores is invisible to every other agent, and Q17
// delegation dies with `No API key found` while the UI reports Connected (issue #169). Connect must
// therefore place the credential in `main` explicitly; nothing else is inherited.
const sharedCredentialAgentId = "main";

function configuredLogoutAgentIds(config: Record<string, unknown>): readonly string[] {
  const seen = new Set<string>();
  const agentIds: string[] = [];

  // `main` is NOT skipped. It used to be, on the assumption that the un-agented logout (which
  // targets the *default* agent) already covered it — true only while default === main, which
  // Opzava is not. Now that connect writes the shared credential into `main`, a disconnect that
  // skipped it would leave a live credential behind: disconnected-but-still-usable.
  for (const agent of agentsList(config)) {
    const agentId = stringValue(agent["id"]);
    if (agentId === null || seen.has(agentId)) {
      continue;
    }
    seen.add(agentId);
    agentIds.push(agentId);
  }

  return agentIds;
}

function logoutTarget(params: { readonly provider: string; readonly agent?: string }): string {
  return typeof params.agent === "string" && params.agent.trim() !== "" ? params.agent : "default";
}

function authLogoutSuccessSummary(payload: unknown): {
  readonly removedProfilesCount: number;
  readonly abortedRunIdsCount: number;
} {
  const root = recordValue(payload);
  return {
    removedProfilesCount: arrayValue(root?.["removedProfiles"]).length,
    abortedRunIdsCount: arrayValue(root?.["abortedRunIds"]).length,
  };
}

function providerIdFromProfile(id: string, profile: Record<string, unknown>): string | null {
  return (
    stringValue(profile["providerId"]) ??
    stringValue(profile["provider"]) ??
    (id.includes(":") ? (id.split(":", 1)[0] ?? null) : null) ??
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

function setupTokenKeyFlag(choiceId: string): string | null {
  return choiceId.toLowerCase() === "setup-token" ? "token" : null;
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
  const keyFlag = stringValue(value["keyFlag"]) ?? setupTokenKeyFlag(id);
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

function gatewayPrimaryModel(config: Record<string, unknown>): string | null {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return modelSelectorPrimary(defaults?.["model"]);
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

  const primary = gatewayPrimaryModel(input.config);
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

  const hasRoutableModel = model !== null;
  return {
    providerId: input.provider.id,
    status: hasRoutableModel ? "connected" : "needs_attention",
    authChoiceId: authChoiceIdFromProfile(id, profile),
    accountLabel: stringValue(profile["accountLabel"]) ?? stringValue(profile["label"]),
    scopes: stringArrayValue(profile["scopes"]),
    model,
    usageLabel: stringValue(profile["usageLabel"]),
    lastCheckedAt: input.now.toISOString(),
    message: hasRoutableModel
      ? "Opzava Gateway auth profile is present."
      : "Provider has credentials but no routable Gateway model.",
    // The config profile records its own auth mode (e.g. {mode:"api_key"}); surface it so Manage
    // renders the right form (rotate key vs subscription) instead of a dead "no auth method" state.
    connectedAuthMode: connectedAuthMode(profile["mode"]) ?? connectedAuthMode(profile["type"]),
  };
}

function orchestratorProviderIdFromConnections(input: {
  readonly primaryModel: string | null;
  readonly providerConnections: readonly ProviderConnectionState[];
}): string | null {
  if (input.primaryModel === null) {
    return null;
  }

  const primaryModel = input.primaryModel.trim();
  const connection = input.providerConnections.find(
    (entry) =>
      entry.status === "connected" && entry.model !== null && entry.model.trim() === primaryModel,
  );
  return connection?.providerId ?? modelProviderId(input.primaryModel);
}

function currentOrchestratorState(input: {
  readonly config: Record<string, unknown>;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly now: Date;
}): OrchestratorDelegationState {
  const primaryModel = gatewayPrimaryModel(input.config);
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
    orchestratorModel: primaryModel ?? ASK_ADMIN_AGENT_MODEL,
    orchestratorProviderId: orchestratorProviderIdFromConnections({
      primaryModel,
      providerConnections: input.providerConnections,
    }),
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

function connectedProviderSubagents(input: {
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly connectedProviderIds: ReadonlySet<string>;
  readonly orchestratorProviderId: string | null;
}): readonly OrchestratorSubagentRole[] {
  return input.providerConnections
    .filter(
      (connection) =>
        connection.status === "connected" &&
        input.connectedProviderIds.has(connection.providerId) &&
        connection.providerId !== input.orchestratorProviderId,
    )
    .map((connection): OrchestratorSubagentRole => {
      const provider = input.catalog.find((entry) => entry.id === connection.providerId);
      return {
        agentId: `subagent-${connection.providerId}`,
        providerId: connection.providerId,
        providerLabel: provider?.label ?? connection.providerId,
        model: connection.model ?? provider?.suggestedModel ?? connection.providerId,
        strength: provider?.roleStrength ?? "Connected provider",
        whenToUse: provider?.whenToUse ?? "Use when this connected model is appropriate.",
      };
    });
}

function orchestratorDelegationState(input: {
  readonly orchestratorModel: string;
  readonly orchestratorProviderId: string | null;
  readonly subagents: readonly OrchestratorSubagentRole[];
  readonly now: Date;
}): OrchestratorDelegationState {
  const receipt = buildDelegationProvisioningReceipt({ subagents: input.subagents });
  return {
    orchestratorAgentId: ASK_ADMIN_AGENT_ID,
    orchestratorModel: input.orchestratorModel,
    orchestratorProviderId: input.orchestratorProviderId,
    delegationMode: "prefer",
    allowAgents: input.subagents.map((subagent) => subagent.agentId),
    subagents: input.subagents,
    toolPolicyExpansion: {
      allow: ["sessions_spawn", "subagents", "group:sessions"],
      receiptId: receiptId(receipt),
    },
    updatedAt: input.now.toISOString(),
  };
}

function receiptId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

class VaultBackedOpenClawAdminRpcClient implements OpenClawAdminRpcPort {
  private readonly logger: OpenClawAdminLogger;
  private inner: OpenClawAdminRpcClient | null = null;

  public constructor(
    private readonly input: {
      readonly env: NodeJS.ProcessEnv;
      readonly url: string;
      readonly gatewayToken?: string;
      readonly requestedScopes: readonly OpenClawOperatorScope[];
      readonly keypair: Ed25519OpenClawAdminDeviceKeypair;
      readonly vault: SecretsVaultPort;
      readonly logger?: OpenClawAdminLogger;
    },
  ) {
    this.logger = input.logger ?? consoleAdminLogger();
  }

  public async request(
    method: string,
    params: Record<string, unknown>,
    options?: {
      readonly idempotencyKey?: string;
      readonly requiredScope?: OpenClawOperatorScope;
    },
  ): Promise<Result<unknown>> {
    const client = await this.client();
    if (!client.ok) {
      return err(client.error);
    }

    return client.value.request(method, params, options);
  }

  public grantedScopes(): readonly OpenClawOperatorScope[] | null {
    return this.inner?.grantedScopes() ?? null;
  }

  public close(): void {
    this.inner?.close();
    this.inner = null;
  }

  private async client(): Promise<Result<OpenClawAdminRpcClient>> {
    if (this.inner !== null) {
      return ok(this.inner);
    }

    const directToken = this.input.env["OPENCLAW_OPERATOR_DEVICE_TOKEN"]?.trim();
    let operatorDeviceToken =
      directToken === undefined || directToken === "" ? undefined : directToken;
    if (operatorDeviceToken === undefined) {
      const resolved = await this.input.vault.resolveSecretValue({
        ref: vaultTokenRef(this.input.env),
        requestedBy: "provisioning-worker",
        reason: "openclaw-worker-admin-device-token",
      });
      if (resolved.ok) {
        operatorDeviceToken = resolved.value;
      } else if (this.input.gatewayToken === undefined) {
        this.logger.error("provisioning.openclawAdmin.operatorWsHandshakeFailed", {
          code: "provisioning.openclawAdmin.operatorWsHandshakeFailed",
          cause: "missing_token",
          requestedScopes: this.input.requestedScopes,
          vaultLabel:
            this.input.env["OPENCLAW_DEVICE_TOKEN_VAULT_LABEL"]?.trim() ||
            ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
        });
        return err(
          provisioningError(
            "provisioning.openclawAdmin.deviceTokenUnavailable",
            "OpenClaw worker admin device token was not found in the configured SecretsVault.",
            {
              vaultLabel:
                this.input.env["OPENCLAW_DEVICE_TOKEN_VAULT_LABEL"]?.trim() ||
                ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
            },
          ),
        );
      }
    }

    this.inner = new OpenClawAdminRpcClient({
      url: this.input.url,
      ...(this.input.gatewayToken === undefined ? {} : { gatewayToken: this.input.gatewayToken }),
      ...(operatorDeviceToken === undefined ? {} : { operatorDeviceToken }),
      requestedScopes: this.input.requestedScopes,
      keypair: this.input.keypair,
      logger: this.logger,
    });

    return ok(this.inner);
  }
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
  if (input.providerId === "anthropic" && input.choiceId === "setup-token") {
    return true;
  }

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

  for (const rootId of listCanonicalLlmProviderIds()) {
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

    const label = canonicalProviderLabel(rootId);
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
  if (typeof count === "number" && Number.isFinite(count)) {
    return count;
  }

  const typedCount = ["oauth", "token", "apiKey", "api_key", "api-key"]
    .map((key) => numberValue(profiles?.[key]) ?? 0)
    .reduce((sum, value) => sum + value, 0);
  return typedCount > 0 ? typedCount : modelStatusProfileLabels(provider).length;
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
  if (
    (numberValue(profiles["apiKey"]) ?? 0) > 0 ||
    (numberValue(profiles["api_key"]) ?? 0) > 0 ||
    (numberValue(profiles["api-key"]) ?? 0) > 0
  ) {
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
  const model = configuredModelForProvider({
    providerId: input.provider.id,
    config: input.config,
    models: input.provider.models,
  });
  const hasRoutableModel = providerAllowed || model !== null;

  return {
    providerId: input.provider.id,
    status: hasRoutableModel ? "connected" : "needs_attention",
    authChoiceId: id === null || profile === null ? null : authChoiceIdFromProfile(id, profile),
    accountLabel: firstLabel === null ? stringValue(statusProvider?.["provider"]) : firstLabel,
    scopes: [],
    model,
    usageLabel: profileCount === 1 ? "1 auth profile" : `${profileCount} auth profiles`,
    lastCheckedAt: input.now.toISOString(),
    message: hasRoutableModel
      ? "Gateway model auth profile is usable."
      : "Provider has credentials but no routable Gateway model.",
    connectedAuthMode: connectedAuthModeFromModelStatus(statusProvider),
  };
}

function providerConnectionFromConnectionSources(input: {
  readonly provider: ModelProviderCatalogEntry;
  readonly config: Record<string, unknown>;
  readonly modelStatus: unknown | null;
  readonly authStatus: ReadonlyMap<string, ModelAuthStatusConnection> | null;
  readonly now: Date;
}): ProviderConnectionState {
  const baseConnection =
    (input.modelStatus === null
      ? null
      : providerConnectionFromModelStatus({
          provider: input.provider,
          config: input.config,
          modelStatus: input.modelStatus,
          now: input.now,
        })) ??
    providerConnectionFromConfig({
      provider: input.provider,
      config: input.config,
      now: input.now,
    });
  const authState = input.authStatus?.get(input.provider.id);
  if (authState === undefined) {
    return baseConnection;
  }

  const status: ProviderConnectionState["status"] =
    authState.authHealth === "missing"
      ? baseConnection.status
      : authState.authHealth === "expired"
        ? "needs_attention"
        : baseConnection.status;

  return {
    ...baseConnection,
    status,
    authHealth: authState.authHealth,
    connectedAuthMode:
      status === "not_connected"
        ? (baseConnection.connectedAuthMode ?? null)
        : (authState.connectedAuthMode ?? baseConnection.connectedAuthMode ?? null),
    expiryLabel: authState.expiryLabel,
    planLabel: authState.planLabel,
    usageLabel: authState.usageLabel ?? baseConnection.usageLabel,
    accountLabel: authState.accountLabel ?? baseConnection.accountLabel,
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

function commandFailureError(input: {
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly result: GatewayRuntimeCommandResult;
  readonly submittedCredential?: string;
}): DomainError {
  // SECURITY: `onboard` is credential-bearing and can echo the submitted key/token. Classify from
  // raw output internally, but only surface a bounded, redacted reason to the browser.
  const rawOutput = `${input.result.stderr}\n${input.result.stdout}`;
  const normalized = rawOutput.toLowerCase();
  const code =
    normalized.includes("allow") && normalized.includes("plugin")
      ? "provisioning.connections.providerBlockedByAllowlist"
      : normalized.includes("auth choice") ||
          normalized.includes("auth method") ||
          normalized.includes("not matched") ||
          normalized.includes("unsupported")
        ? "provisioning.connections.authMethodMismatch"
        : normalized.includes("invalid") ||
            normalized.includes("unauthorized") ||
            normalized.includes("401") ||
            normalized.includes("403")
          ? "provisioning.connections.invalidProviderCredential"
          : "provisioning.connections.gatewayOnboardFailed";

  const sanitizedReason = sanitizedCommandFailureReason(rawOutput, input.submittedCredential);
  const message =
    code === "provisioning.connections.providerBlockedByAllowlist"
      ? `Gateway blocked ${input.providerId} on the plugin allowlist.`
      : code === "provisioning.connections.authMethodMismatch"
        ? `Gateway rejected the ${input.providerId} auth method: ${sanitizedReason}.`
        : code === "provisioning.connections.invalidProviderCredential"
          ? `Gateway rejected the ${input.providerId} credential: ${sanitizedReason}.`
          : `Gateway onboard failed for ${input.providerId}: ${sanitizedReason}.`;

  return provisioningError(code, message, {
    providerId: input.providerId,
    authChoiceId: input.authChoiceId,
    exitCode: input.result.exitCode,
  });
}

function sanitizedCommandFailureReason(rawOutput: string, submittedCredential?: string): string {
  const withoutAnsi = stripAnsi(rawOutput)
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
  const fallback = "command exited non-zero";
  let reason = withoutAnsi ?? fallback;
  if (submittedCredential !== undefined && submittedCredential.trim() !== "") {
    reason = reason.replaceAll(submittedCredential, "[redacted]");
  }
  reason = reason
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/(--(?:api-)?key|--token)\s+\S+/gi, "$1 [redacted]")
    .replace(/\s+/g, " ")
    .slice(0, 240)
    .trim();

  return reason === "" ? fallback : reason;
}

function disconnectPostCheckTransient(error: DomainError): boolean {
  // The disconnect config.patch triggers an in-process gateway restart (auth config change), so
  // post-check reads that land inside the restart window fail with handshake/timeout/closed
  // transport errors and succeed on retry once the gateway is back.
  const text = `${error.code} ${error.message}`.toLowerCase();
  return (
    text.includes("operatorwshandshakefailed") ||
    text.includes("requesttimeout") ||
    text.includes("closed before") ||
    text.includes("connection closed") ||
    text.includes("socket closed") ||
    text.includes("service restart") ||
    text.includes("econnrefused") ||
    text.includes("circuitopen")
  );
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

function authLogoutNonFatal(error: DomainError): boolean {
  const text = `${error.code} ${error.message}`.toLowerCase();
  if (
    rateLimitRetryAfterMs(error, "models.authLogout") !== null ||
    closedBeforeResponseError(error, "models.authLogout")
  ) {
    return false;
  }

  return (
    authLogoutUnavailable(error) ||
    text.includes("notfound") ||
    text.includes("not found") ||
    text.includes("not-found") ||
    text.includes("not_found") ||
    text.includes("unavailable") ||
    text.includes("no profiles") ||
    text.includes("no profile")
  );
}

function rateLimitRetryAfterMs(error: DomainError, method: string): number | null {
  const text = `${error.code} ${error.message}`;
  const rateLimitMatch = text.match(/rate limit exceeded for\s+([^;]+);\s*retry after\s+(\d+)s/i);
  if (rateLimitMatch === null || rateLimitMatch[1] !== method) {
    return null;
  }

  const retryAfterMs = error.details?.["retryAfterMs"];
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.ceil(retryAfterMs);
  }

  return Number.parseInt(rateLimitMatch[2] ?? "0", 10) * 1000;
}

function closedBeforeResponseError(error: DomainError, method: string): boolean {
  const text = `${error.code} ${error.message}`.toLowerCase();
  return text.includes(method.toLowerCase()) && text.includes("closed before a response");
}

function redactedDetailValue(key: string, value: unknown): unknown {
  if (/api[_-]?key|token|secret|credential|password/i.test(key)) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    return redactDeviceCodeLog(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactedDetailValue(key, entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactedDetailValue(entryKey, entryValue),
      ]),
    );
  }

  return value;
}

function redactedDomainError(error: DomainError): DomainError {
  return new DomainError({
    code: error.code,
    message: redactDeviceCodeLog(error.message),
    cause: error.cause,
    ...(error.details === undefined
      ? {}
      : {
          details: Object.fromEntries(
            Object.entries(error.details).map(([key, value]) => [
              key,
              redactedDetailValue(key, value),
            ]),
          ),
        }),
  });
}

function profileUsesGatewayCredentialAuth(
  profileIdValue: string,
  profile: Record<string, unknown>,
): boolean {
  const mode =
    stringValue(profile["type"]) ?? stringValue(profile["mode"]) ?? stringValue(profile["auth"]);
  if (mode === "oauth" || mode === "token" || mode === "api_key" || mode === "api-key") {
    return true;
  }

  const authChoiceId = authChoiceIdFromProfile(profileIdValue, profile);
  return authChoiceId === null ? false : authModeFromChoiceId(authChoiceId) === "api-key";
}

function configCredentialProfileIdsForProvider(
  config: Record<string, unknown>,
  providerId: string,
): readonly string[] {
  return Object.entries(authProfiles(config))
    .filter(
      ([id, profile]) =>
        isRecord(profile) &&
        providerIdFromProfile(id, profile) === providerId &&
        profileUsesGatewayCredentialAuth(id, profile),
    )
    .map(([id]) => id);
}

/**
 * Auth profile ids the gateway's plugins declare per provider (`models.authStatus.ownership`).
 * Absent on gateways older than the ownership patch — callers must degrade, not fail.
 */
type ProviderProfileOwnership = Readonly<Record<string, readonly string[]>>;

/**
 * Every profile id whose credential a disconnect of `providerId` must remove.
 *
 * OpenClaw's onboarding writes a SET of profile ids per auth method and derives each profile's
 * provider from the profile-id PREFIX, so one connect can create profiles under provider ids that
 * are not the catalog id — OpenCode deliberately shares one key across the `opencode` (Zen) and
 * `opencode-go` (Go) catalogs. Matching on provider id alone removes the id-matching profile and
 * ORPHANS the siblings, leaving a live key the Connections UI can neither see nor revoke (#174).
 *
 * The gateway reports the authoritative set; the id-match stays as the floor so a connection made
 * outside Opzava (gateway CLI) or an older gateway with no ownership block still disconnects.
 */
function disconnectProfileIdsForProvider(input: {
  readonly config: Record<string, unknown>;
  readonly providerId: string;
  readonly ownership: ProviderProfileOwnership | null;
}): readonly string[] {
  const profiles = authProfiles(input.config);
  const ids = new Set(configCredentialProfileIdsForProvider(input.config, input.providerId));
  for (const profileId of input.ownership?.[input.providerId] ?? []) {
    const profile = profiles[profileId];
    // A declared profile MISSING from config is exactly the state a half-completed disconnect
    // leaves: the config entry is gone but the secret is still in the auth store. Include it so the
    // logout below still revokes it — filtering on config presence would re-orphan it.
    if (!isRecord(profile) || profileUsesGatewayCredentialAuth(profileId, profile)) {
      ids.add(profileId);
    }
  }

  return [...ids];
}

/**
 * profileId -> the provider that owns it.
 *
 * Falls back to the profile-id prefix when the profile is absent from config: a previous
 * half-completed disconnect (or a doctor prune) can leave a secret in the auth STORE with no config
 * entry, and skipping it there would re-orphan the very credential this fix exists to revoke.
 */
function profileOwnersForDisconnect(
  config: Record<string, unknown>,
  profileIds: readonly string[],
): ReadonlyMap<string, string> {
  const profiles = authProfiles(config);
  const owners = new Map<string, string>();
  for (const profileId of profileIds) {
    const profile = profiles[profileId];
    const providerId = isRecord(profile)
      ? providerIdFromProfile(profileId, profile)
      : providerIdFromProfile(profileId, {});
    if (providerId !== null) {
      owners.set(profileId, providerId);
    }
  }

  return owners;
}

/**
 * profileId -> masked key label from `models.status` (e.g. `sk-rq6uU...NZBTexJR`).
 *
 * Used ONLY to DETECT an orphaned shared credential when the gateway reports no ownership, never
 * to decide what to delete: a masked label is a display artifact (first/last chars), so two
 * distinct keys could collide and two providers may legitimately share one key. Deleting on that
 * evidence risks destroying a credential the operator never asked to revoke.
 */
function modelStatusProfileKeyLabels(modelStatus: unknown): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const auth = recordValue(recordValue(modelStatus)?.["auth"]);
  for (const provider of arrayValue(auth?.["providers"]).filter(isRecord)) {
    const profiles = recordValue(provider["profiles"]);
    for (const entry of arrayValue(profiles?.["labels"])) {
      const label = stringValue(entry);
      const separator = label === null ? -1 : label.indexOf("=");
      if (label === null || separator <= 0) {
        continue;
      }
      labels.set(label.slice(0, separator), label.slice(separator + 1));
    }
  }

  return labels;
}

function providerStillHasCredentials(input: {
  readonly providerIds: readonly string[];
  readonly profileIds: readonly string[];
  readonly authStatus: ReadonlyMap<string, ModelAuthStatusConnection> | null;
  readonly config: Record<string, unknown>;
  readonly modelStatus: unknown | null;
}): {
  readonly stores: readonly string[];
  readonly connectedAuthMode: ConnectedAuthMode | null;
  readonly survivingProfileIds: readonly string[];
} {
  const stores: string[] = [];
  let connectedAuthMode: ConnectedAuthMode | null = null;

  for (const providerId of input.providerIds) {
    const authStatusProvider = input.authStatus?.get(providerId) ?? null;
    const managedCredentialSurvived =
      authStatusProvider !== null &&
      (authStatusProvider.connectedAuthMode === "oauth" ||
        authStatusProvider.connectedAuthMode === "token" ||
        (authStatusProvider.authHealth !== "missing" &&
          authStatusProvider.status !== "not_connected"));
    if (managedCredentialSurvived && !stores.includes("models.authStatus")) {
      stores.push("models.authStatus");
      connectedAuthMode = authStatusProvider.connectedAuthMode;
    }

    if (
      input.modelStatus !== null &&
      modelStatusProfileCount(modelStatusProvider(input.modelStatus, providerId)) > 0 &&
      !stores.includes("models.status")
    ) {
      stores.push("models.status");
      connectedAuthMode ??= connectedAuthModeFromModelStatus(
        modelStatusProvider(input.modelStatus, providerId),
      );
    }
  }

  // The profile-id check is what catches an orphaned SIBLING: it survives under a provider id that
  // is not in `providerIds`, so a provider-scoped read alone reports "clean" while the key lives on.
  const profiles = authProfiles(input.config);
  const survivingProfileIds = input.profileIds.filter((profileId) =>
    isRecord(profiles[profileId]),
  );
  const idMatchedSurvives = input.providerIds.some(
    (providerId) => configCredentialProfileIdsForProvider(input.config, providerId).length > 0,
  );
  if ((survivingProfileIds.length > 0 || idMatchedSurvives) && !stores.includes("config.auth.profiles")) {
    stores.push("config.auth.profiles");
  }

  return { stores, connectedAuthMode, survivingProfileIds };
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
  private readonly modelApiKeyConnects = new Map<string, PendingModelProviderApiKeyConnect>();
  private readonly modelSetupTokenFlows = new Map<string, PendingModelProviderSetupTokenFlow>();
  private readonly modelProviderDisconnects = new Map<string, PendingModelProviderDisconnect>();

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

  private async modelAuthStatus(
    input: {
      readonly refresh: boolean;
    } = { refresh: false },
  ): Promise<ReadonlyMap<string, ModelAuthStatusConnection> | null> {
    try {
      const result = await this.options.adminClient.request("models.authStatus", {
        refresh: input.refresh,
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

  /**
   * The gateway's declaration of which auth profiles each provider's auth methods write.
   *
   * Never fatal: a gateway without the ownership block (or a failed read) returns null and the
   * caller falls back to provider-id matching plus orphan detection, so a disconnect degrades to
   * the old behavior instead of refusing to run.
   */
  private async modelAuthProfileOwnership(): Promise<ProviderProfileOwnership | null> {
    try {
      // No `refresh`: ownership is static plugin metadata, so a cached snapshot is authoritative and
      // this must not cost the disconnect a forced auth-store rescan.
      const result = await this.options.adminClient.request("models.authStatus", {});
      if (!result.ok) {
        return null;
      }

      const ownership = recordValue(recordValue(result.value)?.["ownership"]);
      if (ownership === null) {
        return null;
      }

      const parsed: Record<string, readonly string[]> = {};
      for (const [providerId, profileIds] of Object.entries(ownership)) {
        const ids = arrayValue(profileIds)
          .map((value) => stringValue(value))
          .filter((value): value is string => value !== null);
        if (ids.length > 0) {
          parsed[providerId] = ids;
        }
      }

      return Object.keys(parsed).length > 0 ? parsed : null;
    } catch {
      // A thrown transport error must not fail the disconnect: fall back to id-matching plus the
      // orphan detection below, exactly as on a gateway that reports no ownership.
      return null;
    }
  }

  private async modelAuthStatusPostCheck(
    providerId: string,
  ): Promise<Result<ReadonlyMap<string, ModelAuthStatusConnection>>> {
    try {
      const result = await this.options.adminClient.request("models.authStatus", {
        refresh: true,
      });
      if (!result.ok) {
        return err(result.error);
      }

      const root = recordValue(result.value);
      if (root === null || !Array.isArray(root["providers"])) {
        return err(
          provisioningError(
            "provisioning.connections.providerPostCheckUnavailable",
            "Gateway provider credential post-check returned an unexpected payload.",
          ),
        );
      }
      const targetProvider = root["providers"].find(
        (provider) =>
          isRecord(provider) &&
          (stringValue(provider["provider"]) ?? stringValue(provider["providerId"])) === providerId,
      );
      if (targetProvider !== undefined && providerAuthHealth(targetProvider["status"]) === null) {
        return err(
          provisioningError(
            "provisioning.connections.providerPostCheckUnavailable",
            "Gateway provider credential post-check returned an unexpected provider entry.",
          ),
        );
      }

      return ok(modelAuthStatusMap(result.value));
    } catch (error) {
      return err(
        provisioningError(
          "provisioning.connections.providerPostCheckUnavailable",
          "Gateway provider credential post-check failed.",
          { error: String(error) },
        ),
      );
    }
  }

  private async requestDisconnectIdempotentRpc(input: {
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly options?: {
      readonly idempotencyKey?: string;
      readonly requiredScope?: OpenClawOperatorScope;
    };
    readonly retryClosedBeforeResponse: boolean;
    readonly waitForTransient: (delayMs: number) => Promise<boolean>;
  }): Promise<{
    readonly result: Result<unknown>;
    readonly attempts: number;
    readonly closedBeforeResponse: boolean;
  }> {
    let closedBeforeResponse = false;

    for (let attempt = 1; attempt <= disconnectTransientMaxAttempts; attempt += 1) {
      const result = await this.options.adminClient.request(
        input.method,
        input.params,
        input.options,
      );
      if (result.ok) {
        return { result, attempts: attempt, closedBeforeResponse };
      }

      const retryAfterMs = rateLimitRetryAfterMs(result.error, input.method);
      if (retryAfterMs !== null) {
        if (
          attempt < disconnectTransientMaxAttempts &&
          (await input.waitForTransient(retryAfterMs))
        ) {
          continue;
        }

        return {
          result: err(redactedDomainError(result.error)),
          attempts: attempt,
          closedBeforeResponse,
        };
      }

      if (closedBeforeResponseError(result.error, input.method)) {
        closedBeforeResponse = true;
        if (
          input.retryClosedBeforeResponse &&
          attempt < disconnectTransientMaxAttempts &&
          (await input.waitForTransient(disconnectClosedBeforeResponseRetryDelayMs))
        ) {
          continue;
        }

        return {
          result: err(redactedDomainError(result.error)),
          attempts: attempt,
          closedBeforeResponse,
        };
      }

      return {
        result: err(redactedDomainError(result.error)),
        attempts: attempt,
        closedBeforeResponse,
      };
    }

    return {
      result: err(
        provisioningError(
          "provisioning.connections.disconnectRetryExhausted",
          "Disconnect write retry attempts were exhausted.",
        ),
      ),
      attempts: disconnectTransientMaxAttempts,
      closedBeforeResponse,
    };
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
    const providerConnections = catalog.map((provider) =>
      providerConnectionFromConnectionSources({
        provider,
        config,
        modelStatus: modelStatusResult.ok ? modelStatusResult.value : null,
        authStatus,
        now,
      }),
    );
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
        ...[...this.githubFlows.values()].map((flow) => this.challengeFromGitHubFlow(flow)),
      ],
      github,
      orchestrator: currentOrchestratorState({
        config,
        catalog,
        providerConnections,
        now,
      }),
      refreshedAt: now.toISOString(),
    });
  }

  public async startModelProviderApiKeyConnect(
    input: ConnectModelProviderApiKeyInput,
  ): Promise<Result<ModelProviderApiKeyConnectStart>> {
    if (input.apiKey.trim() === "") {
      return err(
        provisioningError("provisioning.connections.emptyKey", "Provider credential is required."),
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

    const opId = `model-api-key:${randomUUID()}`;
    const op: PendingModelProviderApiKeyConnect = {
      opId,
      orgId: input.orgId,
      providerId: input.providerId,
      authChoiceId: input.authChoiceId,
      startedAt: this.now(),
      expiresAt: new Date(this.now().getTime() + modelApiKeyConnectExpiresMs),
      timeout: setTimeout(() => {
        this.modelApiKeyConnects.delete(opId);
      }, modelApiKeyConnectExpiresMs),
    };
    this.modelApiKeyConnects.set(opId, op);
    void this.runModelProviderApiKeyConnect({
      op,
      apiKey: input.apiKey,
      authChoice,
      authChoices: authChoices.value,
    });

    return ok({ opId, status: "pending" });
  }

  public async pollModelProviderApiKeyConnect(
    input: PollModelProviderApiKeyConnectInput,
  ): Promise<Result<ModelProviderApiKeyConnectPollState>> {
    const op = this.modelApiKeyConnects.get(input.opId);
    if (op === undefined || op.orgId !== input.orgId) {
      return err(
        provisioningError(
          "provisioning.connections.apiKeyConnectNotFound",
          "API-key connection operation was not found.",
        ),
      );
    }

    if (this.now().getTime() >= op.expiresAt.getTime()) {
      this.modelApiKeyConnects.delete(op.opId);
      clearTimeout(op.timeout);
      return ok({
        status: "expired",
        message: "API-key connection operation expired.",
        code: "provisioning.connections.apiKeyConnectExpired",
      });
    }

    if (op.outcome === undefined) {
      return ok({ status: "pending" });
    }

    this.modelApiKeyConnects.delete(op.opId);
    clearTimeout(op.timeout);
    return ok(op.outcome);
  }

  public async startModelProviderSetupTokenFlow(
    input: StartModelProviderSetupTokenFlowInput,
  ): Promise<Result<SetupTokenFlowStart>> {
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
    }).find((choice) => choice.id === "setup-token");
    if (authChoice === undefined) {
      return err(
        provisioningError(
          "provisioning.connections.authChoiceUnavailable",
          "The live Opzava Gateway auth-choice catalog does not expose setup-token for that provider.",
          { providerId: input.providerId, authChoiceId: "setup-token" },
        ),
      );
    }

    await this.cleanupSetupTokenFlowsForProvider(input.providerId, input.orgId);
    const login = await gatewayRuntime.startSetupTokenLogin();
    if (!login.ok) {
      return err(login.error);
    }

    const flowId = `setup:${randomUUID()}`;
    const flow: PendingModelProviderSetupTokenFlow = {
      flowId,
      orgId: input.orgId,
      providerId: input.providerId,
      authChoiceId: "setup-token",
      execId: login.value.execId,
      logPath: login.value.logPath,
      stdinPath: login.value.stdinPath,
      expiresAt: new Date(this.now().getTime() + modelSetupTokenFlowExpiresMs),
      timeout: setTimeout(() => {
        const current = this.modelSetupTokenFlows.get(flowId);
        if (current !== undefined) {
          void this.cleanupSetupTokenFlow(current);
        }
      }, modelSetupTokenFlowExpiresMs),
      phase: "starting",
    };
    this.modelSetupTokenFlows.set(flowId, flow);
    return ok({ flowId, status: "pending" });
  }

  public async pollModelProviderSetupTokenFlow(
    input: PollModelProviderSetupTokenFlowInput,
  ): Promise<Result<SetupTokenFlowPollState>> {
    const flow = this.modelSetupTokenFlows.get(input.flowId);
    if (flow === undefined || flow.orgId !== input.orgId) {
      return err(
        provisioningError(
          "provisioning.connections.setupTokenFlowNotFound",
          "Setup-token connection flow was not found.",
        ),
      );
    }
    if (this.now().getTime() >= flow.expiresAt.getTime()) {
      await this.cleanupSetupTokenFlow(flow);
      return ok({
        status: "expired",
        message: "Claude setup-token sign-in expired. Start again and approve the browser prompt.",
        code: "provisioning.connections.setupTokenFlowExpired",
      });
    }
    if (flow.outcome !== undefined) {
      const outcome = flow.outcome;
      await this.cleanupSetupTokenFlow(flow);
      return ok(outcome);
    }

    const log = await this.options.gatewayRuntime?.readSetupTokenLog(flow.logPath);
    if (log === undefined || !log.ok) {
      await this.cleanupSetupTokenFlow(flow);
      return err(deviceCodeLogReadError(flow.providerId));
    }
    // Re-check AFTER the async log read: a concurrent poll may have set completionInFlight
    // during the await, so a pre-await guard alone would double-submit the onboard.
    if (flow.completionInFlight === true) {
      return ok({ status: "pending" });
    }

    const mintedToken = setupTokenFromLog(log.value);
    if (mintedToken !== null) {
      flow.phase = "completing";
      flow.completionInFlight = true;
      void this.runSetupTokenCompletion(flow, mintedToken);
      return ok({ status: "pending" });
    }

    if (setupTokenTerminalFailure(log.value)) {
      await this.cleanupSetupTokenFlow(flow);
      return ok({
        status: "failed",
        message:
          "Claude setup-token sign-in was denied or the authorization code was invalid. Start again and paste the newest code.",
        code: "provisioning.connections.setupTokenLoginFailed",
      });
    }

    const authorizeUrl = setupTokenAuthorizeUrl(log.value);
    if (authorizeUrl !== null && flow.phase !== "completing") {
      flow.phase = "awaiting_code";
      flow.authorizeUrl = authorizeUrl;
      return ok({ status: "awaiting_code", authorizeUrl });
    }
    if (flow.phase === "completing") {
      // A code was already written to the CLI. Never return awaiting_code here: the authorize URL
      // still sits in the append-only log, and awaiting_code would silently reset the browser form
      // to empty with no error (the original "nothing happens" symptom). Stay pending while the
      // CLI has a chance to mint a token, then surface a real failure once the exchange window
      // elapses so the user sees the rejection instead of a dead form.
      const submittedAtMs = flow.codeSubmittedAt?.getTime() ?? 0;
      if (this.now().getTime() - submittedAtMs < setupTokenCodeExchangeTimeoutMs) {
        return ok({ status: "pending" });
      }
      await this.cleanupSetupTokenFlow(flow);
      return ok({
        status: "failed",
        message:
          "Claude did not accept the authorization code. Copy a fresh code from Claude and retry.",
        code: "provisioning.connections.setupTokenLoginFailed",
      });
    }

    return ok({ status: "pending" });
  }

  public async submitModelProviderSetupTokenCode(
    input: SubmitModelProviderSetupTokenCodeInput,
  ): Promise<Result<{ readonly status: "pending" }>> {
    const flow = this.modelSetupTokenFlows.get(input.flowId);
    if (flow === undefined || flow.orgId !== input.orgId) {
      return err(
        provisioningError(
          "provisioning.connections.setupTokenFlowNotFound",
          "Setup-token connection flow was not found.",
        ),
      );
    }
    const code = input.code.trim();
    if (code.length === 0 || code.length > 512) {
      return err(
        provisioningError(
          "provisioning.connections.invalidSetupTokenCode",
          "Paste the authorization code Claude shows after browser approval.",
        ),
      );
    }
    const written = await this.options.gatewayRuntime?.writeSetupTokenInput(flow.stdinPath, code);
    if (written === undefined || !written.ok) {
      return written === undefined ? err(gatewayRuntimeUnavailableError()) : err(written.error);
    }
    flow.phase = "completing";
    flow.codeSubmittedAt = this.now();
    return ok({ status: "pending" });
  }

  private async runModelProviderApiKeyConnect(input: {
    readonly op: PendingModelProviderApiKeyConnect;
    readonly apiKey: string;
    readonly authChoice: ModelProviderAuthChoice;
    readonly authChoices: readonly GatewayRuntimeAuthChoice[];
  }): Promise<void> {
    const result = await this.completeModelProviderApiKeyConnect(input);
    const current = this.modelApiKeyConnects.get(input.op.opId);
    if (current === undefined || current.outcome !== undefined) {
      return;
    }

    current.outcome = result.ok
      ? { status: "connected", connection: result.value }
      : {
          status: "failed",
          message: redactedDomainError(result.error).message,
          code: redactedDomainError(result.error).code,
        };
  }

  private async runSetupTokenCompletion(
    flow: PendingModelProviderSetupTokenFlow,
    mintedToken: string,
  ): Promise<void> {
    const result = await this.completeModelProviderApiKeyConnect({
      op: {
        opId: flow.flowId,
        orgId: flow.orgId,
        providerId: flow.providerId,
        authChoiceId: flow.authChoiceId,
        startedAt: this.now(),
        expiresAt: flow.expiresAt,
        timeout: flow.timeout,
      },
      apiKey: mintedToken,
      authChoice: {
        id: "setup-token",
        label: "Anthropic setup-token",
        mode: "api-key",
        providerId: flow.providerId,
        keyFlag: "token",
      },
      authChoices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
    });
    const current = this.modelSetupTokenFlows.get(flow.flowId);
    if (current === undefined || current.outcome !== undefined) {
      return;
    }

    current.outcome = result.ok
      ? { status: "connected", connection: result.value }
      : {
          status: "failed",
          message: redactedDomainError(result.error).message,
          code: redactedDomainError(result.error).code,
        };
  }

  private async completeModelProviderApiKeyConnect(input: {
    readonly op: PendingModelProviderApiKeyConnect;
    readonly apiKey: string;
    readonly authChoice: ModelProviderAuthChoice;
    readonly authChoices: readonly GatewayRuntimeAuthChoice[];
  }): Promise<Result<ProviderConnectionState>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const allowPatch = pluginAllowPatch({
      providerId: input.op.providerId,
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
      providerId: input.op.providerId,
      authChoiceId: input.op.authChoiceId,
      keyFlag: input.authChoice.keyFlag!,
      apiKey: input.apiKey,
    });
    if (!onboard.ok) {
      return err(onboard.error);
    }
    if (onboard.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: input.op.providerId,
          authChoiceId: input.op.authChoiceId,
          result: onboard.value,
          submittedCredential: input.apiKey,
        }),
      );
    }

    const shared = await this.storeSharedProviderCredential({
      providerId: input.op.providerId,
      keyFlag: input.authChoice.keyFlag!,
      apiKey: input.apiKey,
    });
    if (!shared.ok) {
      return err(shared.error);
    }

    const connection = await this.modelStatusPostCheckAfterApiKeyConnect(input);
    if (!connection.ok) {
      return err(connection.error);
    }

    // `models status` reports the ORCHESTRATOR's effective store, so it says "connected" even when
    // no other agent can resolve the credential — that is exactly how #169 stayed invisible. A
    // provider is only really connected once the agents that will use it can resolve it.
    if (shared.value) {
      const resolvable = await this.assertProviderResolvableByAgents(input.op.providerId);
      if (!resolvable.ok) {
        return err(resolvable.error);
      }
    }

    return ok(connection.value);
  }

  /**
   * Places the credential in the shared `main` store so every agent inherits it. Resolves to `true`
   * when a shared copy was needed and written.
   *
   * Whether a provider needs one is settled by ASKING the gateway, not by reading the config's
   * shape. The obvious-looking shortcut — "skip providers that have a `config.auth.profiles` entry,
   * their credential is global anyway" — is wrong: an Anthropic setup-token writes a `mode: "token"`
   * profile entry into the config while the token itself lives in an agent store, so that test
   * would skip the one provider #169 is actually about. A resolvability probe cannot be fooled by
   * the entry's shape.
   */
  private async storeSharedProviderCredential(input: {
    readonly providerId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<boolean>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    // Re-read: onboard is the writer that decides where this provider's credential landed.
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const sharedAgent = await this.ensureSharedCredentialAgent(configResult.value);
    if (!sharedAgent.ok) {
      return err(sharedAgent.error);
    }

    // `main` holds no credential of its own here, so if it can already resolve the provider the
    // credential must be reachable from the config for every agent (a genuine config api-key, e.g.
    // zai). Nothing to share, and no second copy to have to revoke later.
    const shared = await gatewayRuntime.listAgentProviderProfiles({
      agentId: sharedCredentialAgentId,
      providerId: input.providerId,
    });
    if (!shared.ok) {
      return err(shared.error);
    }
    if (shared.value.length > 0) {
      return ok(false);
    }

    const written = await gatewayRuntime.writeAgentCredential({
      agentId: sharedCredentialAgentId,
      providerId: input.providerId,
      keyFlag: input.keyFlag,
      apiKey: input.apiKey,
    });
    if (!written.ok) {
      return err(written.error);
    }
    if (written.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: input.providerId,
          authChoiceId: "shared-credential-write",
          result: written.value,
          submittedCredential: input.apiKey,
        }),
      );
    }

    return ok(true);
  }

  /**
   * `--agent main` is rejected unless `main` is a configured agent, so the shared store is only
   * addressable once the entry exists. It is added non-default: the orchestrator keeps `default:
   * true`, so this does not move the agent that un-agented gateway calls resolve to.
   */
  private async ensureSharedCredentialAgent(configGetPayload: unknown): Promise<Result<void>> {
    const config = configPayload(configGetPayload);
    const agents = agentsList(config);
    if (agents.some((agent) => stringValue(agent["id"]) === sharedCredentialAgentId)) {
      return ok(undefined);
    }

    const patchParams = configPatchParams({
      configGetPayload,
      patch: {
        agents: {
          list: [...agents, { id: sharedCredentialAgentId }],
        },
      },
      replacePaths: ["agents.list"],
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

    return ok(undefined);
  }

  private async assertProviderResolvableByAgents(providerId: string): Promise<Result<void>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const configuredAgentIds = new Set(
      agentsList(configPayload(configResult.value))
        .map((agent) => stringValue(agent["id"]))
        .filter((agentId): agentId is string => agentId !== null),
    );
    // `main` is the load-bearing one: proving it resolves proves every present AND future agent
    // inherits the credential. The orchestrator and any already-provisioned subagent for this
    // provider are checked too, since those are the agents that run the delegation today.
    const requiredAgentIds = [
      sharedCredentialAgentId,
      ASK_ADMIN_AGENT_ID,
      `subagent-${providerId}`,
    ].filter((agentId) => configuredAgentIds.has(agentId));

    for (const agentId of requiredAgentIds) {
      const profiles = await gatewayRuntime.listAgentProviderProfiles({ agentId, providerId });
      if (!profiles.ok) {
        return err(profiles.error);
      }
      if (profiles.value.length === 0) {
        return err(
          provisioningError(
            "provisioning.connections.providerCredentialUnresolvable",
            "The provider credential was stored but the agents that run this provider cannot resolve it, so delegation would fail. The provider was not marked connected.",
            { providerId, agentId },
          ),
        );
      }
    }

    return ok(undefined);
  }

  private async modelStatusPostCheckAfterApiKeyConnect(input: {
    readonly op: PendingModelProviderApiKeyConnect;
    readonly authChoice: ModelProviderAuthChoice;
    readonly authChoices: readonly GatewayRuntimeAuthChoice[];
  }): Promise<Result<ProviderConnectionState>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    let waitedMs = 0;
    let lastError: DomainError | null = null;
    let sawModelStatus = false;
    while (waitedMs <= modelApiKeyPostCheckMaxWaitMs) {
      const status = await gatewayRuntime.modelStatus();
      if (status.ok) {
        sawModelStatus = true;

        // Onboard can be the writer of agents.defaults.model.primary, so the pre-onboard
        // config snapshot is stale for routability classification.
        const configResult = await this.options.adminClient.request("config.get", {});
        if (!configResult.ok) {
          return err(configResult.error);
        }

        const config = configPayload(configResult.value);
        const catalogProvider =
          mergeRuntimeAuthChoices({
            catalog: providerCatalogFromModels({}, config),
            choices: input.authChoices,
          }).find((provider) => provider.id === input.op.providerId) ??
          ({
            id: input.op.providerId,
            label: input.op.providerId,
            vendor: input.op.providerId,
            authChoices: [input.authChoice],
            suggestedModel: input.op.providerId,
            roleStrength: "Gateway-advertised provider",
            whenToUse: "Use when this connected model is appropriate.",
          } satisfies ModelProviderCatalogEntry);
        const connection = providerConnectionFromModelStatus({
          provider: catalogProvider,
          config,
          modelStatus: status.value,
          now: this.now(),
        });
        if (connection !== null && connection.status === "connected") {
          return ok({ ...connection, authChoiceId: input.op.authChoiceId });
        }
      } else {
        lastError = redactedDomainError(status.error);
      }

      await sleep(modelApiKeyPostCheckDelayMs);
      waitedMs += modelApiKeyPostCheckDelayMs;
    }

    if (sawModelStatus) {
      return err(
        provisioningError(
          "provisioning.connections.providerStatusNotConnected",
          "Gateway onboard completed, but models status did not report a usable provider credential.",
          { providerId: input.op.providerId, authChoiceId: input.op.authChoiceId },
        ),
      );
    }

    return err(
      provisioningError(
        "provisioning.connections.providerPostCheckUnavailable",
        "Gateway provider credential post-check failed after retrying the gateway restart window.",
        { providerId: input.op.providerId, lastError: lastError?.code ?? null },
      ),
    );
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

    // The device-code login writes the OAuth profile itself when the user finishes authorizing, so
    // the shared store has to exist and be named BEFORE the flow starts — there is no later hook to
    // move the credential from wherever the CLI decided to put it.
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }
    const sharedAgent = await this.ensureSharedCredentialAgent(configResult.value);
    if (!sharedAgent.ok) {
      return err(sharedAgent.error);
    }

    await this.cleanupModelProviderFlowsForProvider(input.providerId, input.orgId);
    const login = await gatewayRuntime.startDeviceCodeLogin(
      deviceCodeProviderArg({
        providerId: input.providerId,
        authChoiceId: input.authChoiceId,
      }),
      sharedCredentialAgentId,
    );
    if (!login.ok) {
      return err(login.error);
    }

    const flowId = `model:${randomUUID()}`;
    const baseFlow: PendingModelProviderDeviceFlow = {
      flowId,
      orgId: input.orgId,
      providerId: input.providerId,
      authChoiceId: input.authChoiceId,
      expiresAt: new Date(this.now().getTime() + modelDeviceFlowExpiresMs),
      intervalSeconds: modelDeviceFlowPollIntervalSeconds,
      execId: login.value.execId,
      logPath: login.value.logPath,
      timeout: setTimeout(() => {
        const flow = this.modelDeviceFlows.get(flowId);
        if (flow !== undefined) {
          void this.cleanupModelProviderFlow(flow);
        }
      }, modelDeviceFlowExpiresMs),
    };
    this.modelDeviceFlows.set(baseFlow.flowId, baseFlow);

    for (let attempt = 0; attempt < modelDeviceFlowStartMaxAttempts; attempt += 1) {
      const log = await gatewayRuntime.readDeviceCodeLog(login.value.logPath);
      if (!log.ok) {
        await this.cleanupModelProviderFlow(baseFlow);
        return err(deviceCodeLogReadError(input.providerId));
      }
      if (!this.modelDeviceFlows.has(baseFlow.flowId)) {
        return err(
          provisioningError(
            "provisioning.connections.deviceFlowCancelled",
            "Device-code sign-in was cancelled before it completed.",
            { providerId: input.providerId, authChoiceId: input.authChoiceId },
          ),
        );
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

    if (!this.modelDeviceFlows.has(baseFlow.flowId)) {
      return err(
        provisioningError(
          "provisioning.connections.deviceFlowCancelled",
          "Device-code sign-in was cancelled before it completed.",
          { providerId: input.providerId, authChoiceId: input.authChoiceId },
        ),
      );
    }
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

  /**
   * Begin a disconnect and return immediately. The work itself takes 60-120s+ for a tenant with
   * several agents (one paced `models.authLogout` per agent against the gateway's 3-writes-per-60s
   * cap), which no HTTP client will wait for — so callers poll {@link pollModelProviderDisconnect}
   * instead of holding the request open. Same start-then-poll shape as the api-key connect flow.
   */
  public async startModelProviderDisconnect(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ModelProviderDisconnectStart>> {
    const opId = `model-disconnect:${randomUUID()}`;
    const op: PendingModelProviderDisconnect = {
      opId,
      orgId: input.orgId,
      providerId: input.providerId,
      startedAt: this.now(),
      expiresAt: new Date(this.now().getTime() + modelProviderDisconnectExpiresMs),
      timeout: setTimeout(() => {
        this.modelProviderDisconnects.delete(opId);
      }, modelProviderDisconnectExpiresMs),
    };
    this.modelProviderDisconnects.set(opId, op);
    void this.runModelProviderDisconnect({ op, input });

    return ok({ opId, status: "pending" });
  }

  public async pollModelProviderDisconnect(
    input: PollModelProviderDisconnectInput,
  ): Promise<Result<ModelProviderDisconnectPollState>> {
    const op = this.modelProviderDisconnects.get(input.opId);
    if (op === undefined || op.orgId !== input.orgId) {
      return err(
        provisioningError(
          "provisioning.connections.disconnectNotFound",
          "Disconnect operation was not found.",
        ),
      );
    }

    if (this.now().getTime() >= op.expiresAt.getTime()) {
      this.modelProviderDisconnects.delete(op.opId);
      clearTimeout(op.timeout);
      return ok({
        status: "expired",
        message: "Disconnect operation expired.",
        code: "provisioning.connections.disconnectExpired",
      });
    }

    if (op.outcome === undefined) {
      return ok({ status: "pending" });
    }

    this.modelProviderDisconnects.delete(op.opId);
    clearTimeout(op.timeout);
    return ok(op.outcome);
  }

  private async runModelProviderDisconnect(input: {
    readonly op: PendingModelProviderDisconnect;
    readonly input: DisconnectModelProviderInput;
  }): Promise<void> {
    const { op } = input;
    // The disconnect is the unit of work; it outlives the request that started it. A throw here
    // would otherwise be an unhandled rejection that leaves the op pending until it expires.
    try {
      const result = await this.disconnectModelProvider(input.input);
      op.outcome = result.ok
        ? { status: "disconnected", connection: result.value }
        : {
            status: "failed",
            message: result.error.message,
            ...(result.error.code === undefined ? {} : { code: result.error.code }),
          };
    } catch (error) {
      console.error("connections.modelProviderDisconnect.unhandled", {
        providerId: op.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      op.outcome = {
        status: "failed",
        message: "Disconnect failed unexpectedly in the provisioning worker.",
        code: "provisioning.connections.disconnectFailed",
      };
    }
  }

  public async disconnectModelProvider(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ProviderConnectionState>> {
    console.info("connections.modelProviderDisconnect.start", { providerId: input.providerId });
    await this.cleanupModelProviderFlowsForProvider(input.providerId, input.orgId);
    await this.cleanupSetupTokenFlowsForProvider(input.providerId, input.orgId);
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }
    const config = configPayload(configResult.value);
    // A provider's credential can live in EITHER store, so disconnect must clear BOTH:
    //  (1) models.authLogout — the OAuth/token/managed store (e.g. openai/Codex OAuth).
    //  (2) config.auth.profiles — config-file api-key profiles (e.g. zai). authLogout returns ok
    //      but removes 0 profiles for a config api-key, so clearing only via authLogout leaves the
    //      key in place and the provider still "connected" (the zai disconnect-does-nothing bug).
    //
    // And the profiles are NOT all under this provider's id: one connect can write a shared set
    // spanning several provider ids, so removal is driven by the gateway's ownership declaration
    // rather than by id equality (#174).
    const ownership = await this.modelAuthProfileOwnership();
    const profileIds = disconnectProfileIdsForProvider({
      config,
      providerId: input.providerId,
      ownership,
    });
    // Every provider owning one of those profiles needs its own authLogout — the gateway removes
    // stored secrets BY PROVIDER ID, so logging out only the catalog id leaves the siblings' keys in
    // the auth store even after their config entries are nulled (#174).
    //
    // But a sibling is only pulled in because it SHARES this connect's profile: a provider-wide
    // logout would also destroy any unrelated credential it holds, which is worse than the orphan.
    // So the sibling logout is narrowed to the shared profile ids, while the provider the operator
    // actually disconnected gets the full provider-wide logout they asked for.
    const profileOwners = profileOwnersForDisconnect(config, profileIds);
    const siblingProfileIdsByProvider = new Map<string, string[]>();
    for (const [profileId, ownerId] of profileOwners) {
      if (ownerId === input.providerId) {
        continue;
      }
      siblingProfileIdsByProvider.set(ownerId, [
        ...(siblingProfileIdsByProvider.get(ownerId) ?? []),
        profileId,
      ]);
    }
    const credentialProviderIds = [input.providerId, ...siblingProfileIdsByProvider.keys()];
    // Every configured agent is logged out, including `main` and including providers that have a
    // config profile entry. That entry does NOT prove the credential lives in the config: an
    // Anthropic setup-token has one while its token sits in an agent store, so the old
    // "config profile => skip the per-agent logout" shortcut left the token behind in every agent
    // store and only removed the routing entry (#169). An agent that holds no profile for the
    // provider just removes 0 of them, which is why fanning out unconditionally is safe.
    //
    // The siblings need that same fan-out: connect writes the shared key into the `main` store too,
    // so a config-only sweep would leave it resolvable for every agent that inherits from `main`.
    const logoutAgentIds = configuredLogoutAgentIds(config);
    const logoutParams = [
      { provider: input.providerId },
      ...logoutAgentIds.map((agent) => ({ provider: input.providerId, agent })),
      ...[...siblingProfileIdsByProvider].flatMap(([provider, sharedProfileIds]) => [
        { provider, profileIds: sharedProfileIds },
        ...logoutAgentIds.map((agent) => ({ provider, agent, profileIds: sharedProfileIds })),
      ]),
    ];
    // Masked labels snapshotted BEFORE the mutation, so the post-check can still recognise an
    // orphaned sibling on a gateway that reports no ownership.
    const preDisconnectModelStatus =
      ownership === null ? await this.options.gatewayRuntime?.modelStatus() : undefined;
    const preDisconnectKeyLabels = modelStatusProfileKeyLabels(
      preDisconnectModelStatus?.ok === true ? preDisconnectModelStatus.value : null,
    );
    console.info("connections.modelProviderDisconnect.plan", {
      providerId: input.providerId,
      profileIds,
      credentialProviderIds,
      ownershipReported: ownership !== null,
    });
    let disconnectTransientWaitMs = 0;
    const waitForDisconnectTransient = async (delayMs: number): Promise<boolean> => {
      const boundedDelayMs = Math.max(0, Math.ceil(delayMs));
      if (disconnectTransientWaitMs + boundedDelayMs > disconnectTransientMaxTotalWaitMs) {
        return false;
      }

      disconnectTransientWaitMs += boundedDelayMs;
      await sleep(boundedDelayMs);
      return true;
    };
    console.info("connections.modelProviderDisconnect.logout.attempt", {
      providerId: input.providerId,
      targets: logoutParams.map(logoutTarget),
    });
    const logoutResults: Record<string, unknown>[] = [];
    const paceAuthLogout = logoutParams.length > disconnectAuthLogoutUnpacedLimit;
    for (const [index, params] of logoutParams.entries()) {
      // Planned pacing, not a retry: the gateway caps control-plane writes at 3 per 60s, so each
      // extra logout target has to be spaced out. Charging this to the transient budget capped the
      // whole disconnect at 150s and hard-failed tenants with 8+ agents (#168).
      if (paceAuthLogout && index > 0) {
        await sleep(disconnectAuthLogoutInterCallDelayMs);
      }
      // No secret material is sent here. Let the gateway authoritatively accept or reject this
      // mutation so a disconnect cannot be hidden by the client's cached scope preflight.
      const logout = await this.requestDisconnectIdempotentRpc({
        method: "models.authLogout",
        params,
        retryClosedBeforeResponse: true,
        waitForTransient: waitForDisconnectTransient,
      });
      const logoutResult = logout.result;
      if (logoutResult.ok) {
        logoutResults.push({
          target: logoutTarget(params),
          ok: true,
          attempts: logout.attempts,
          ...authLogoutSuccessSummary(logoutResult.value),
        });
        continue;
      }

      const nonFatal = logout.closedBeforeResponse || authLogoutNonFatal(logoutResult.error);
      logoutResults.push({
        target: logoutTarget(params),
        ok: false,
        nonFatal,
        attempts: logout.attempts,
        code: logoutResult.error.code,
        message: logoutResult.error.message,
      });
      if (!nonFatal) {
        console.warn("connections.modelProviderDisconnect.logout.results", {
          providerId: input.providerId,
          results: logoutResults,
        });
        console.warn("connections.modelProviderDisconnect.failClosed", {
          providerId: input.providerId,
          reason: "authLogoutFailed",
          code: logoutResult.error.code,
        });
        return err(logoutResult.error);
      }
    }
    console.info("connections.modelProviderDisconnect.logout.results", {
      providerId: input.providerId,
      results: logoutResults,
    });

    // Clear the auth order of every provider that owned one of the removed profiles — a sibling's
    // order entry left pointing at a nulled profile is exactly the half-disconnected state that
    // makes the surface lie about what is connected.
    // The disconnected provider loses its whole auth order. A sibling only loses the SHARED profile
    // ids: wiping its order would strand any unrelated credential it still legitimately holds.
    const nextAuthOrder = new Map<string, readonly string[]>([[input.providerId, []]]);
    for (const providerId of siblingProfileIdsByProvider.keys()) {
      const orderValue = authOrder(config)[providerId];
      const existingOrder = Array.isArray(orderValue)
        ? orderValue.filter((entry): entry is string => typeof entry === "string")
        : [];
      nextAuthOrder.set(
        providerId,
        existingOrder.filter((profileId) => !profileIds.includes(profileId)),
      );
    }
    const orderHasProviderEntries = [...nextAuthOrder.keys()].some((providerId) => {
      const orderValue = authOrder(config)[providerId];
      return (
        (Array.isArray(orderValue) && orderValue.length > 0) ||
        (typeof orderValue === "string" && orderValue.trim() !== "")
      );
    });

    if (profileIds.length > 0 || orderHasProviderEntries) {
      const patchParams = configPatchParams({
        configGetPayload: configResult.value,
        patch: {
          auth: {
            profiles: Object.fromEntries(profileIds.map((id) => [id, null])),
            order: Object.fromEntries(nextAuthOrder),
          },
        },
        replacePaths: [...nextAuthOrder.keys()].map((providerId) => `auth.order.${providerId}`),
      });
      if (!patchParams.ok) {
        return err(patchParams.error);
      }
      const result = await this.requestDisconnectIdempotentRpc({
        method: "config.patch",
        params: patchParams.value,
        options: {
          requiredScope: "operator.admin",
        },
        retryClosedBeforeResponse: false,
        waitForTransient: waitForDisconnectTransient,
      });
      if (!result.result.ok) {
        if (result.closedBeforeResponse) {
          console.warn("connections.modelProviderDisconnect.configPatch.transient", {
            providerId: input.providerId,
            reason: "closedBeforeResponse",
            attempts: result.attempts,
          });
        } else {
          return err(result.result.error);
        }
      }
    }

    // The config.patch above restarts the gateway when auth config changed, so post-check reads
    // retry transient restart-window failures within the shared disconnect wait budget.
    const disconnectPostCheckRead = async <T>(
      read: () => Promise<Result<T>>,
    ): Promise<Result<T>> => {
      let result = await read();
      while (
        !result.ok &&
        disconnectPostCheckTransient(result.error) &&
        (await waitForDisconnectTransient(disconnectPostCheckRetryDelayMs))
      ) {
        result = await read();
      }
      return result;
    };

    const refreshedAuth = await disconnectPostCheckRead(() =>
      this.modelAuthStatusPostCheck(input.providerId),
    );
    if (!refreshedAuth.ok) {
      console.warn("connections.modelProviderDisconnect.failClosed", {
        providerId: input.providerId,
        reason: "postCheckUnavailable",
        code: refreshedAuth.error.code,
      });
      return err(
        provisioningError(
          "provisioning.connections.providerPostCheckUnavailable",
          "Gateway provider credential post-check failed.",
          { providerId: input.providerId },
        ),
      );
    }
    const refreshedConfigResult = await disconnectPostCheckRead(() =>
      this.options.adminClient.request("config.get", {}),
    );
    if (!refreshedConfigResult.ok) {
      console.warn("connections.modelProviderDisconnect.failClosed", {
        providerId: input.providerId,
        reason: "configPostCheckUnavailable",
        code: refreshedConfigResult.error.code,
      });
      return err(refreshedConfigResult.error);
    }
    const disconnectGatewayRuntime = this.options.gatewayRuntime;
    const refreshedModelStatus =
      disconnectGatewayRuntime === undefined
        ? undefined
        : await disconnectPostCheckRead(() => disconnectGatewayRuntime.modelStatus());
    if (refreshedModelStatus !== undefined && !refreshedModelStatus.ok) {
      console.warn("connections.modelProviderDisconnect.failClosed", {
        providerId: input.providerId,
        reason: "modelsStatusPostCheckUnavailable",
        code: refreshedModelStatus.error.code,
      });
      return err(refreshedModelStatus.error);
    }
    const refreshedConfig = configPayload(refreshedConfigResult.value);
    // Provider-level emptiness is asserted ONLY for the provider the operator disconnected. A
    // sibling may still legitimately hold unrelated credentials, so asserting it too would fail a
    // disconnect that actually succeeded. The sibling is covered by the profile-level check below:
    // its shared profile must be gone.
    const lingering = providerStillHasCredentials({
      providerIds: [input.providerId],
      profileIds,
      authStatus: refreshedAuth.value,
      config: refreshedConfig,
      modelStatus: refreshedModelStatus?.value ?? null,
    });
    if (lingering.stores.length > 0) {
      console.warn("connections.modelProviderDisconnect.failClosed", {
        providerId: input.providerId,
        reason: "credentialSurvived",
        credentialStores: lingering.stores,
        connectedAuthMode: lingering.connectedAuthMode,
        survivingProfileIds: lingering.survivingProfileIds,
      });
      return err(
        provisioningError(
          "provisioning.connections.providerStillConnected",
          "Disconnect failed: Gateway still reports provider credentials.",
          {
            providerId: input.providerId,
            credentialStores: lingering.stores,
            connectedAuthMode: lingering.connectedAuthMode,
          },
        ),
      );
    }

    // Backstop for a gateway that reports no ownership: a profile still holding the SAME masked key
    // as one we just removed is the shared sibling this bug orphans. We cannot safely delete on that
    // evidence (a masked label is not a credential identity, and two providers may legitimately
    // share a key), so fail closed and tell the operator — never report a revoked key as gone.
    const orphanedProfileIds =
      ownership !== null || preDisconnectKeyLabels.size === 0
        ? []
        : Object.keys(authProfiles(refreshedConfig)).filter((survivingProfileId) => {
            const survivingKey = preDisconnectKeyLabels.get(survivingProfileId);
            return (
              survivingKey !== undefined &&
              profileIds.some((removed) => preDisconnectKeyLabels.get(removed) === survivingKey)
            );
          });
    if (orphanedProfileIds.length > 0) {
      console.warn("connections.modelProviderDisconnect.failClosed", {
        providerId: input.providerId,
        reason: "sharedCredentialOrphaned",
        orphanedProfileIds,
      });
      return err(
        provisioningError(
          "provisioning.connections.providerCredentialOrphaned",
          "Disconnect incomplete: the Gateway still holds this credential under another provider.",
          { providerId: input.providerId, orphanedProfileIds },
        ),
      );
    }

    return ok(
      disconnectedProviderState({
        providerId: input.providerId,
        now: this.now(),
        message: "Opzava Gateway provider credentials removed.",
      }),
    );
  }

  public async applyOrchestratorDelegation(
    input: ApplyOrchestratorDelegationInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const [modelsResult, modelStatusResult, authStatus] = await Promise.all([
      this.options.adminClient.request("models.list", { view: "all" }),
      this.options.gatewayRuntime?.modelStatus() ??
        ok<unknown>({ auth: { providers: [] }, allowed: [] }),
      this.modelAuthStatus(),
    ]);
    const config = configPayload(configResult.value);
    const catalog = providerCatalogFromModels(modelsResult.ok ? modelsResult.value : {}, config);
    const providerConnections = catalog.map((provider) =>
      providerConnectionFromConnectionSources({
        provider,
        config,
        modelStatus: modelStatusResult.ok ? modelStatusResult.value : null,
        authStatus,
        now: this.now(),
      }),
    );
    const primaryModel = gatewayPrimaryModel(config);
    const orchestratorModel = primaryModel ?? ASK_ADMIN_AGENT_MODEL;
    const orchestratorProviderId = orchestratorProviderIdFromConnections({
      primaryModel,
      providerConnections,
    });
    const connectedProviders = new Set(input.connectedProviderIds);
    const subagents = connectedProviderSubagents({
      catalog,
      providerConnections,
      connectedProviderIds: connectedProviders,
      orchestratorProviderId,
    });
    const agentConfig = buildOrchestratorAgentConfig({
      subagents,
      orchestratorModel,
    });
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

    return ok(
      orchestratorDelegationState({
        orchestratorModel,
        orchestratorProviderId,
        subagents,
        now: this.now(),
      }),
    );
  }

  public async setMainOrchestrator(
    input: SetMainOrchestratorInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const [modelsResult, modelStatusResult, authStatus] = await Promise.all([
      this.options.adminClient.request("models.list", { view: "all" }),
      this.options.gatewayRuntime?.modelStatus() ??
        ok<unknown>({ auth: { providers: [] }, allowed: [] }),
      this.modelAuthStatus(),
    ]);
    const config = configPayload(configResult.value);
    const catalog = providerCatalogFromModels(modelsResult.ok ? modelsResult.value : {}, config);
    const providerConnections = catalog.map((provider) =>
      providerConnectionFromConnectionSources({
        provider,
        config,
        modelStatus: modelStatusResult.ok ? modelStatusResult.value : null,
        authStatus,
        now: this.now(),
      }),
    );
    const connection = providerConnections.find((entry) => entry.providerId === input.providerId);
    if (connection?.status !== "connected") {
      return err(
        provisioningError(
          "provisioning.connections.orchestratorProviderNotConnected",
          "The selected main orchestrator provider is not connected.",
          { providerId: input.providerId },
        ),
      );
    }

    const provider = catalog.find((entry) => entry.id === input.providerId);
    const configuredModel = configuredModelForProvider({
      providerId: input.providerId,
      config,
      models: provider?.models,
    });
    const orchestratorModel =
      configuredModel === null
        ? provider?.suggestedModel === undefined
          ? null
          : providerModelRef(input.providerId, provider.suggestedModel)
        : providerModelRef(input.providerId, configuredModel);
    if (orchestratorModel === null) {
      return err(
        provisioningError(
          "provisioning.connections.orchestratorModelUnavailable",
          "The selected main orchestrator provider has no routable model.",
          { providerId: input.providerId },
        ),
      );
    }

    const connectedProviders = new Set(
      providerConnections
        .filter((entry) => entry.status === "connected")
        .map((entry) => entry.providerId),
    );
    const subagents = connectedProviderSubagents({
      catalog,
      providerConnections,
      connectedProviderIds: connectedProviders,
      orchestratorProviderId: input.providerId,
    });
    const agentConfig = buildOrchestratorAgentConfig({ subagents, orchestratorModel });
    const existingAgents = agentsList(config).filter((agent) => {
      const id = stringValue(agent["id"]);
      return id !== ASK_ADMIN_AGENT_ID && id?.startsWith("subagent-") !== true;
    });
    const patchParams = configPatchParams({
      configGetPayload: configResult.value,
      patch: {
        agents: {
          defaults: {
            model: {
              primary: orchestratorModel,
            },
          },
          list: [...existingAgents, ...agentConfig.agents.list],
        },
      },
      replacePaths: ["agents.list"],
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

    return ok(
      orchestratorDelegationState({
        orchestratorModel,
        orchestratorProviderId: input.providerId,
        subagents,
        now: this.now(),
      }),
    );
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
    clearTimeout(flow.timeout);
    await this.options.gatewayRuntime?.stopDeviceCodeLogin(flow.execId, flow.logPath);
  }

  private async cleanupModelProviderFlowsForProvider(
    providerId: string,
    orgId?: string,
  ): Promise<void> {
    const flows = [...this.modelDeviceFlows.values()].filter(
      (flow) => flow.providerId === providerId && (orgId === undefined || flow.orgId === orgId),
    );
    await Promise.all(flows.map((flow) => this.cleanupModelProviderFlow(flow)));
  }

  private async cleanupSetupTokenFlow(flow: PendingModelProviderSetupTokenFlow): Promise<void> {
    this.modelSetupTokenFlows.delete(flow.flowId);
    clearTimeout(flow.timeout);
    await this.options.gatewayRuntime?.stopSetupTokenLogin(flow.execId, flow.logPath);
  }

  private async cleanupSetupTokenFlowsForProvider(
    providerId: string,
    orgId?: string,
  ): Promise<void> {
    const flows = [...this.modelSetupTokenFlows.values()].filter(
      (flow) => flow.providerId === providerId && (orgId === undefined || flow.orgId === orgId),
    );
    await Promise.all(flows.map((flow) => this.cleanupSetupTokenFlow(flow)));
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
      await this.cleanupModelProviderFlow(flow);
      return err(deviceCodeLogReadError(flow.providerId));
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
        message:
          "The provider blocked, rate-limited, or denied the device-code request. Wait a minute and retry, or connect with an API key.",
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

  public async startModelProviderDisconnect(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ModelProviderDisconnectStart>> {
    console.warn("connections.modelProviderDisconnect.unavailable", {
      providerId: input.providerId,
      reason: this.reason,
    });
    return err(this.error());
  }

  public async pollModelProviderDisconnect(): Promise<Result<ModelProviderDisconnectPollState>> {
    return err(this.error());
  }

  public async applyOrchestratorDelegation(): Promise<Result<OrchestratorDelegationState>> {
    return err(this.error());
  }

  public async setMainOrchestrator(): Promise<Result<OrchestratorDelegationState>> {
    return err(gatewayRuntimeUnavailableError());
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
  const requestedScopes =
    readRequestedOperatorScopes(env) ?? ASK_ADMIN_WORKER_ADMIN_OPERATOR_SCOPES;
  const privateKeyPem = readPrivateKeyPem(env);
  const hasAdminCredential =
    (operatorDeviceToken !== undefined && operatorDeviceToken !== "") ||
    (gatewayToken !== undefined && gatewayToken !== "") ||
    (env["OPENCLAW_DEV_SECRETS_FILE"]?.trim() ?? "") !== "";

  if (
    gatewayUrl === undefined ||
    gatewayUrl === "" ||
    !hasAdminCredential ||
    privateKeyPem === null
  ) {
    return new UnavailableConnectionsProvisioningPort(
      "OPENCLAW_GATEWAY_URL, an OpenClaw worker admin token source, and OPENCLAW_DEVICE_PRIVATE_KEY_PEM(_BASE64) are required for Connections provisioning.",
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
  const vault: MutableSecretsVault = new LocalFileSecretsVault({
    filePath: env["OPENCLAW_DEV_SECRETS_FILE"]?.trim() || "/tmp/opzava-openclaw-dev-secrets.json",
  });

  return new GatewayAdminConnectionsProvisioningPort({
    adminClient: new VaultBackedOpenClawAdminRpcClient({
      env,
      url: gatewayUrl,
      ...(gatewayToken === undefined || gatewayToken === "" ? {} : { gatewayToken }),
      requestedScopes,
      keypair,
      vault,
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
