import { createHash, randomUUID } from "node:crypto";

import { LocalFileSecretsVault, PostgresObservabilityAdapter } from "@opzava/adapters";
import {
  canonicalModelProviderAuthId,
  canonicalProviderLabel,
  type AppendAuditInput,
  type ApplyOrchestratorDelegationInput,
  type AuditConfigSnapshot,
  type AuditIntent,
  type AuditResult,
  type AuditTargetKind,
  type AuditTransition,
  type ErrorCapturePort,
  classifyModelProvider,
  type ConnectModelProviderApiKeyInput,
  type ConnectedAuthMode,
  type ConnectionsProvisioningPort,
  type ConnectionsSnapshot,
  type ConnectionProvisioningPrincipal,
  type DeviceFlowChallenge,
  type DeviceFlowCancelState,
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
  type OrchestratorReconcileState,
  type OrchestratorSubagentRole,
  type PollModelProviderApiKeyConnectInput,
  type PollModelProviderDisconnectInput,
  type PollModelProviderSetupTokenFlowInput,
  type ProviderAuthHealth,
  type ProviderConnectionState,
  type SecretsVaultPort,
  type SetModelProviderModelEnabledInput,
  type SetMainOrchestratorInput,
  type StartGitHubDeviceFlowInput,
  type StartModelProviderDeviceFlowInput,
  type StartModelProviderSetupTokenFlowInput,
  type SetupTokenFlowPollState,
  type SetupTokenFlowStart,
  type SubmitModelProviderSetupTokenCodeInput,
  type OpenClawOperatorScope,
  type OpenClawAdminRpcPort,
  type OpenClawHealth,
  type OpenClawHealthComponent,
  type OpenClawLastKnownHealthy,
} from "@opzava/ports";
import { DomainError, err, makeOrgId, ok, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_ID,
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
  AskAdminStartupReconciler,
  type AskAdminStartupReconciliationReceipt,
  type StartupOrchestratorConfigPort,
} from "./startup-reconciler.js";
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
  /**
   * Observability seam (#192): records append-only compliance audit rows for every
   * connections/provider governance mutation. Real deployments inject the Postgres adapter;
   * tests inject the in-memory fake. If omitted, appends log a loud warning so missing wiring
   * is visible instead of silently dropping governance events.
   */
  readonly audit?: ErrorCapturePort;
}

// Default observability sink used only when no adapter is injected. `capture` is a true no-op;
// `appendAudit` logs a loud warning so a deployment that forgot to wire the Postgres compliance
// sink is visible instead of silently dropping governance events.
const noopAuditSink: ErrorCapturePort = {
  async capture() {
    return ok(undefined);
  },
  async appendAudit(input) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "observability.complianceSinkNotConfigured",
        message:
          "Governance audit append called without a configured observability adapter; install PostgresObservabilityAdapter for a durable compliance sink.",
        intent: input.intent,
        transition: input.transition,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
      }),
    );
    return ok({ eventId: `noop_${randomUUID()}` });
  },
};

export interface ConnectionsProvisioningRuntimePort
  extends ConnectionsProvisioningPort, StartupOrchestratorConfigPort {
  reconcileStartup(): Promise<Result<AskAdminStartupReconciliationReceipt>>;
  close(): void;
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
  /** Device codes are bearer-like capabilities, so only the initiating user may resume them. */
  readonly actorUserId: string;
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly verificationUri?: string;
  readonly userCode?: string;
  readonly expiresAt: Date;
  readonly intervalSeconds: number;
  readonly execId: string;
  readonly logPath: string;
  /** Unique lifecycle identity. Post-await writers must still own this generation. */
  readonly generation: string;
  readonly lifecycle: "active" | "cancelling";
  readonly timeout: ReturnType<typeof setTimeout>;
}

interface PendingModelProviderApiKeyConnect {
  readonly opId: string;
  readonly orgId: string;
  /**
   * The principal that started the connect. Carried because a credential the provider REJECTS has
   * to be removed again on that same principal's behalf (#183), and the removal runs long after the
   * request that authorized it has returned.
   */
  readonly principal: ConnectionProvisioningPrincipal;
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
  /** Carried so the fire-and-forget post-disconnect reconcile can attribute its system actor. */
  readonly actorUserId: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly timeout: ReturnType<typeof setTimeout>;
  outcome?: ModelProviderDisconnectPollState;
}

interface PendingModelProviderSetupTokenFlow {
  readonly flowId: string;
  readonly orgId: string;
  /** See {@link PendingModelProviderApiKeyConnect.principal} — the completion funnels into it. */
  readonly principal: ConnectionProvisioningPrincipal;
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
const modelDeviceFlowCleanupRetryMs = 5_000;
const modelDeviceFlowIdPattern =
  /^model:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modelDeviceFlowPollIntervalSeconds = 5;
// A connect is no longer just a write: it ends with a live auth probe, and a probe that comes back
// REJECTED then removes the credential again (#183) — a removal that paces one gateway logout per
// agent and can run well past the old 120s. Expiring the op mid-rollback would replace the loud
// "the provider rejected your key" the admin needs to see with a bland "operation not found". Match
// the disconnect flow's window, which is long for exactly this reason.
const modelApiKeyConnectExpiresMs = 15 * 60 * 1000;
const modelSetupTokenFlowExpiresMs = 10 * 60 * 1000;
const setupTokenCodeExchangeTimeoutMs = 30_000;
const modelApiKeyPostCheckMaxWaitMs = 30 * 1000;
const modelApiKeyPostCheckDelayMs = 500;
const disconnectTransientMaxAttempts = 3;
// Budget for UNPLANNED waits only (rate-limit backoff, closed-before-response, post-check retries).
// The deliberate inter-logout pacing below is planned work and must NOT be charged against it —
// doing so made any tenant with 8+ agents fail with disconnectRetryExhausted (#168).
const disconnectTransientMaxTotalWaitMs = 150_000;
// A model toggle is a config-only patch (no credential writes, no per-agent logouts), so its
// post-check budget must fit inside the BFF's synchronous request window — a toggle that waits
// out a full gateway restart would commit server-side while the browser has already given up,
// which is the disconnect sync-cliff all over again. Beyond this budget the op reports honestly
// ambiguous and the UI refreshes from the gateway instead of trusting its optimistic state.
const modelToggleTransientMaxTotalWaitMs = 12_000;
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
const disconnectGatewayReadyRetryDelayMs = 1_000;
// The gateway rate-limits control-plane writes, and a disconnect has already spent that budget by
// the time the orchestrator reconcile wants its own config.patch (live: "rate limit exceeded for
// config.patch; retry after 36s"). Losing that patch leaves the orchestrator pointing at the
// credential we just removed -- the very state #186 is about -- so the reconcile waits the gateway
// out rather than giving up on it.
const orchestratorReconcileMaxAttempts = 3;
const orchestratorReconcileMaxWaitMs = 150_000;
const orchestratorReconcileRateLimitMarginMs = 1_000;
// Mainframe's config.patch protects every array independently, including arrays nested below an
// array wildcard. Canonical orchestrator rebuilds intentionally shrink all of these when policy or
// provider delegation is removed, so every patch site that writes the canonical agents list must
// carry the same complete declaration.
const canonicalAgentListReplacePaths = [
  "agents.list",
  "agents.list[].skills",
  "agents.list[].tools.allow",
  "agents.list[].tools.deny",
  "agents.list[].subagents.allowAgents",
] as const;
// A status read taken while the gateway is reloading reports the credential we just removed. Give
// those reads a few chances to converge on the durable store before calling the disconnect failed:
// a credential that genuinely survived keeps reporting forever, so it still fails closed (#172).
const disconnectStaleStatusMaxAttempts = 3;
const modelToggleMaxMutationAttempts = 3;
// The only store that persists a credential. The other two are live reads of a running gateway, so
// they can be stale; this one cannot.
const durableCredentialStore = "config.auth.profiles";

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

interface StoredProviderCredential {
  /** The auth profile the gateway wrote, or `null` when it would not name one. */
  readonly profileId: string | null;
  /** The provider id the gateway FILED it under, which is not always the one we sent. */
  readonly providerId: string;
}

function configWriteKey(orgId: string): string {
  return orgId.toLowerCase();
}

function canReadPendingDeviceFlowCapabilities(principal: ConnectionProvisioningPrincipal): boolean {
  return principal.roleKeys.includes("owner") || principal.roleKeys.includes("admin");
}

function providerConnectInFlightError(providerId: string): DomainError {
  return provisioningError(
    "provisioning.connections.providerConnectInFlight",
    `A connect for ${providerId} is already running. Wait for it to finish before starting another.`,
    { providerId },
  );
}

function connectionPrincipal(
  input: ConnectionProvisioningPrincipal,
): ConnectionProvisioningPrincipal {
  return {
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    roleKeys: input.roleKeys,
  };
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

/**
 * The URLs the CLI prints are OSC-8 hyperlinks: `ESC]8;id=..;<URL>BEL <label> ESC]8;;BEL`.
 *
 * The escape payload carries the URL WHOLE. The visible label next to it is ordinary text, so the
 * terminal WRAPS it at the window width -- which means the rendered URL is broken across lines and
 * any line-oriented reader truncates it (a sign-in link cut off mid-query-string is worse than no
 * link: it looks usable and is not). Read the hyperlink target and the wrapping never applies.
 *
 * Escapes are zero-width, so they are never themselves wrapped.
 */
function hyperlinkTargets(value: string): readonly string[] {
  const targets: string[] = [];
  // eslint-disable-next-line no-control-regex
  const pattern = /\x1B\]8;[^;]*;([^\x07\x1B]+)(?:\x07|\x1B\\)/g;
  let match = pattern.exec(value);
  while (match !== null) {
    const target = match[1]?.trim();
    if (target !== undefined && target !== "" && !targets.includes(target)) {
      targets.push(target);
    }
    match = pattern.exec(value);
  }

  return targets;
}

function terminalLines(value: string): readonly string[] {
  // A lone CR returns the cursor to column 0 (spinner repaint), so it separates renders just as a
  // newline does. Normalising both keeps the line-oriented parsers below from fusing two lines.
  return stripAnsi(value).replace(/\r\n?/g, "\n").split("\n");
}

function parseDeviceCodeLog(value: string): {
  readonly verificationUri: string;
  readonly userCode: string;
} | null {
  const stripped = stripAnsi(value);
  // Prefer the hyperlink target: the printed URL is wrapped at the window width, so reading it from
  // the visible text truncates it mid-query-string.
  const linked = hyperlinkTargets(value);
  const verificationUri =
    linked.find((target) => /device/i.test(target)) ??
    linked.find((target) => /^https?:\/\/auth\./i.test(target)) ??
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

const authorizeUrlHost = /oauth|claude\.ai|claude\.com|anthropic\.com/i;

function setupTokenAuthorizeUrl(logValue: string): string | null {
  // The hyperlink target FIRST: this URL is ~300 characters, so the copy the CLI renders is wrapped
  // across terminal lines and reading it from the visible text yields a link cut off mid-query-string
  // (no code_challenge -> the sign-in cannot complete). The escape payload is never wrapped (#127).
  const linked = hyperlinkTargets(logValue).find(
    (target) => /^https?:\/\//i.test(target) && authorizeUrlHost.test(target),
  );
  if (linked !== undefined) {
    return linked;
  }

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

function canonicalProviderIdentity(providerId: string): string {
  return canonicalModelProviderAuthId(providerId);
}

function providerIdentitiesMatch(left: string | null, right: string): boolean {
  return left !== null && canonicalProviderIdentity(left) === canonicalProviderIdentity(right);
}

function providerIdentityEntries<T>(
  record: Readonly<Record<string, T>>,
  providerId: string,
): {
  readonly exact: readonly (readonly [string, T])[];
  readonly aliases: readonly (readonly [string, T])[];
} {
  const entries = Object.entries(record);
  const normalizedProviderId = providerId.trim().toLowerCase();
  return {
    exact: entries.filter(([candidate]) => candidate.trim().toLowerCase() === normalizedProviderId),
    aliases: entries.filter(
      ([candidate]) =>
        candidate.trim().toLowerCase() !== normalizedProviderId &&
        providerIdentitiesMatch(candidate, providerId),
    ),
  };
}

function authOrderEntry(
  config: Record<string, unknown>,
  providerId: string,
): { readonly present: boolean; readonly value: unknown; readonly ambiguous: boolean } {
  const entries = providerIdentityEntries(authOrder(config), providerId);
  // Mainframe currently accepts the first canonical-equivalent key in insertion order. The worker
  // is intentionally stricter: prefer one exact catalog key, accept one alias fallback, and fail
  // closed when same-priority keys disagree about which profile is selectable.
  if (entries.exact.length > 1 || entries.aliases.length > 1) {
    return { present: true, value: undefined, ambiguous: true };
  }
  const exact = entries.exact[0];
  const alias = entries.aliases[0];
  if (exact !== undefined && alias !== undefined) {
    return JSON.stringify(exact[1]) === JSON.stringify(alias[1])
      ? { present: true, value: exact[1], ambiguous: false }
      : { present: true, value: undefined, ambiguous: true };
  }
  const candidate = exact ?? alias;
  return candidate === undefined
    ? { present: false, value: undefined, ambiguous: false }
    : { present: true, value: candidate[1], ambiguous: false };
}

function providerHasBlockingAuthOrder(
  config: Record<string, unknown>,
  providerId: string,
): boolean {
  const order = authOrderEntry(config, providerId);
  return (
    order.ambiguous || (order.present && firstProfileIdForProvider(providerId, config) === null)
  );
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

function providerIdFromProfilePrefix(id: string): string | null {
  return id.includes(":") ? (id.split(":", 1)[0] ?? null) : null;
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

function modelSelectorRefs(value: unknown): readonly string[] {
  if (typeof value === "string") {
    const ref = stringValue(value);
    return ref === null ? [] : [ref];
  }

  const record = recordValue(value);
  if (record === null) {
    return [];
  }
  const primary = stringValue(record["primary"]);
  const fallbacks = arrayValue(record["fallbacks"])
    .map((entry) => stringValue(entry))
    .filter((entry): entry is string => entry !== null);
  return primary === null ? fallbacks : [primary, ...fallbacks];
}

const agentModelSelectorKeys = [
  "model",
  "imageModel",
  "imageGenerationModel",
  "videoGenerationModel",
  "musicGenerationModel",
  "voiceModel",
  "pdfModel",
] as const;

function gatewayPrimaryModel(config: Record<string, unknown>): string | null {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return modelSelectorPrimary(defaults?.["model"]);
}

/** The routable set: `agents.defaults.models` keys are exactly what the gateway will route to. */
function gatewayDefaultModels(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return recordValue(defaults?.["models"]) ?? {};
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

// All protected/configured model refs from primaries, fallbacks, model maps, and auth profiles.
// This is deliberately broader than the enabled/routable set: only `agents.defaults.models` keys
// are enabled, while these references prevent disabling a model that another selector still uses.
function configuredModelRefs(config: Record<string, unknown>): readonly string[] {
  const refs = new Set<string>();
  const agents = recordValue(config["agents"]);
  const collect = (agentLike: unknown): void => {
    const rec = recordValue(agentLike);
    if (rec === null) {
      return;
    }
    for (const key of agentModelSelectorKeys) {
      for (const ref of modelSelectorRefs(rec[key])) {
        refs.add(ref);
      }
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

function enabledDefaultModelEntries(config: Record<string, unknown>): readonly {
  readonly key: string;
  readonly value: unknown;
}[] {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return Object.entries(recordValue(defaults?.["models"]) ?? {}).map(([key, value]) => ({
    key,
    value,
  }));
}

function protectedModelRefs(config: Record<string, unknown>): ReadonlySet<string> {
  const refs = new Set<string>();
  const agents = recordValue(config["agents"]);
  const collect = (agentLike: unknown): void => {
    const record = recordValue(agentLike);
    if (record === null) {
      return;
    }
    for (const key of agentModelSelectorKeys) {
      for (const ref of modelSelectorRefs(record[key])) {
        refs.add(ref.toLowerCase());
      }
    }
  };
  collect(recordValue(agents?.["defaults"]));
  for (const agent of arrayValue(agents?.["list"])) {
    collect(agent);
  }
  for (const profile of Object.values(authProfiles(config))) {
    if (!isRecord(profile)) {
      continue;
    }
    for (const ref of modelSelectorRefs(profile["model"])) {
      refs.add(ref.toLowerCase());
    }
  }
  return refs;
}

function providerHasAuthProfile(config: Record<string, unknown>, providerId: string): boolean {
  return Object.entries(authProfiles(config)).some(
    ([profileId, profile]) =>
      isRecord(profile) &&
      providerIdentitiesMatch(providerIdFromProfile(profileId, profile), providerId),
  );
}

function configProviderEntry(input: {
  readonly config: Record<string, unknown>;
  readonly providerId: string;
}): { readonly key: string; readonly value: Record<string, unknown> } | null {
  const providers = recordValue(recordValue(input.config["models"])?.["providers"]);
  if (providers === null) {
    return null;
  }
  const entry = Object.entries(providers).find(
    ([key]) => key.toLowerCase() === input.providerId.toLowerCase(),
  );
  return entry === undefined || !isRecord(entry[1]) ? null : { key: entry[0], value: entry[1] };
}

interface PluginModelProviderCatalog {
  readonly baseUrl?: string;
  readonly api?: string;
  readonly models: readonly Record<string, unknown>[];
}

interface PluginModelCatalogDiscovery {
  readonly catalogs: readonly {
    readonly pluginId: string;
    readonly providers: Readonly<Record<string, PluginModelProviderCatalog>>;
  }[];
  readonly plugins: readonly { readonly id: string; readonly enabled: boolean }[];
}

function modelsListRecords(payload: unknown): readonly Record<string, unknown>[] {
  const root = recordValue(payload) ?? {};
  return [...arrayValue(root["models"]), ...(Array.isArray(payload) ? payload : [])].filter(
    isRecord,
  );
}

function modelRecordProviderId(model: Record<string, unknown>): string | null {
  const id = stringValue(model["id"]) ?? stringValue(model["model"]);
  return (
    stringValue(model["providerId"]) ??
    stringValue(model["provider"]) ??
    (id?.includes("/") === true ? (id.split("/", 1)[0] ?? null) : null)
  );
}

function modelRecordId(model: Record<string, unknown>, providerId: string): string | null {
  const raw = stringValue(model["id"]) ?? stringValue(model["model"]);
  if (raw === null) {
    return null;
  }
  const prefix = `${providerId}/`;
  return raw.toLowerCase().startsWith(prefix.toLowerCase()) ? raw.slice(prefix.length) : raw;
}

function modelSummaryFromRecord(
  model: Record<string, unknown>,
  providerId: string,
): ModelSummary | null {
  const id = modelRecordId(model, providerId);
  if (id === null || id === "") {
    return null;
  }
  return {
    id,
    label: stringValue(model["name"]) ?? stringValue(model["label"]) ?? id,
  };
}

function enabledPluginCatalogProvider(input: {
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
}): PluginModelProviderCatalog | null {
  if (input.discovery === null) {
    return null;
  }
  const normalizedProvider = input.providerId.toLowerCase();
  const enabledPlugins = new Set(
    input.discovery.plugins
      .filter((plugin) => plugin.enabled)
      .map((plugin) => plugin.id.toLowerCase()),
  );
  for (const catalog of input.discovery.catalogs) {
    if (
      catalog.pluginId.toLowerCase() !== normalizedProvider ||
      !enabledPlugins.has(catalog.pluginId.toLowerCase())
    ) {
      continue;
    }
    const providerEntry = Object.entries(catalog.providers).find(
      ([providerId]) => providerId.toLowerCase() === normalizedProvider,
    );
    if (providerEntry !== undefined) {
      return providerEntry[1];
    }
  }
  return null;
}

function catalogModelsForProvider(input: {
  readonly modelsPayload: unknown;
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
}): readonly ModelSummary[] {
  const seen = new Map<string, ModelSummary>();
  for (const model of modelsListRecords(input.modelsPayload)) {
    if (modelRecordProviderId(model)?.toLowerCase() !== input.providerId.toLowerCase()) {
      continue;
    }
    const summary = modelSummaryFromRecord(model, input.providerId);
    if (summary !== null) {
      seen.set(summary.id.toLowerCase(), summary);
    }
  }
  const pluginProvider = enabledPluginCatalogProvider({
    discovery: input.discovery,
    providerId: input.providerId,
  });
  for (const model of pluginProvider?.models ?? []) {
    const summary = modelSummaryFromRecord(model, input.providerId);
    if (summary !== null && !seen.has(summary.id.toLowerCase())) {
      seen.set(summary.id.toLowerCase(), summary);
    }
  }
  return [...seen.values()];
}

function pluginModelRecord(input: {
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
  readonly modelId: string;
}): {
  readonly provider: PluginModelProviderCatalog;
  readonly model: Record<string, unknown>;
} | null {
  const provider = enabledPluginCatalogProvider(input);
  const model = provider?.models.find(
    (entry) =>
      modelRecordId(entry, input.providerId)?.toLowerCase() === input.modelId.toLowerCase(),
  );
  return provider === null || model === undefined ? null : { provider, model };
}

function providerRegistryPatchForModel(input: {
  readonly config: Record<string, unknown>;
  readonly modelsPayload: unknown;
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
  readonly modelId: string;
}): Result<Record<string, unknown> | null> {
  const modelsListHasDefinition = modelsListRecords(input.modelsPayload).some(
    (model) =>
      modelRecordProviderId(model)?.toLowerCase() === input.providerId.toLowerCase() &&
      modelRecordId(model, input.providerId)?.toLowerCase() === input.modelId.toLowerCase(),
  );
  if (modelsListHasDefinition) {
    return ok(null);
  }

  const pluginRecord = pluginModelRecord(input);
  if (pluginRecord === null) {
    return err(
      provisioningError(
        "provisioning.connections.modelDefinitionUnavailable",
        "The model catalog did not provide the registry definition required to enable it.",
        { providerId: input.providerId, modelId: input.modelId },
      ),
    );
  }

  const existingProvider = configProviderEntry({
    config: input.config,
    providerId: input.providerId,
  });
  const existingModels = arrayValue(existingProvider?.value["models"]);
  const alreadyRegistered = existingModels.some((model) => {
    if (typeof model === "string") {
      return model.toLowerCase() === input.modelId.toLowerCase();
    }
    return (
      isRecord(model) &&
      modelRecordId(model, input.providerId)?.toLowerCase() === input.modelId.toLowerCase()
    );
  });
  if (alreadyRegistered) {
    return ok(null);
  }

  const providerKey = existingProvider?.key ?? input.providerId;
  return ok({
    [providerKey]: {
      ...(existingProvider === null && pluginRecord.provider.baseUrl !== undefined
        ? { baseUrl: pluginRecord.provider.baseUrl }
        : {}),
      ...(existingProvider === null && pluginRecord.provider.api !== undefined
        ? { api: pluginRecord.provider.api }
        : {}),
      models: [...existingModels, pluginRecord.model],
    },
  });
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

function enabledModelsForProvider(
  providerId: string,
  config: Record<string, unknown>,
): readonly ModelSummary[] {
  const seen = new Map<string, ModelSummary>();
  for (const { key } of enabledDefaultModelEntries(config)) {
    if (!modelRefMatchesProvider(key, providerId)) {
      continue;
    }
    const id = key.slice(key.indexOf("/") + 1);
    if (id !== "" && !seen.has(id.toLowerCase())) {
      seen.set(id.toLowerCase(), { id, label: id });
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
  modelsPayload: unknown,
  discovery: PluginModelCatalogDiscovery | null,
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
    // `agents.defaults.models` is the gateway's routable allow-list. Primaries and fallbacks are
    // protected references, but they do not become enabled choices merely by being referenced.
    models: enabledModelsForProvider(provider.id, config),
    catalogModels: catalogModelsForProvider({
      modelsPayload,
      discovery,
      providerId: provider.id,
    }),
  };
}

function providerCatalogFromModels(
  payload: unknown,
  config: Record<string, unknown>,
  discovery: PluginModelCatalogDiscovery | null = null,
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

    return withModelProviderClassification(withAuthChoices, config, payload, discovery);
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
  const order = authOrderEntry(config, providerId);
  const orderValue = order.value;
  if (Array.isArray(orderValue)) {
    const profiles = authProfiles(config);
    const ordered = orderValue.find((entry): entry is string => {
      if (typeof entry !== "string") {
        return false;
      }
      const profile = recordValue(profiles[entry]);
      return (
        profile !== null &&
        providerIdentitiesMatch(providerIdFromProfile(entry, profile), providerId)
      );
    });
    if (ordered !== undefined) {
      return ordered;
    }
    // Empty, ambiguous, missing, or cross-provider orders disable selection. Falling through to
    // inventory would make a provider look connected when the runtime cannot select its credential.
    return null;
  }

  if (typeof orderValue === "string" && orderValue.trim() !== "") {
    const profile = recordValue(authProfiles(config)[orderValue]);
    return profile !== null &&
      providerIdentitiesMatch(providerIdFromProfile(orderValue, profile), providerId)
      ? orderValue
      : null;
  }

  if (order.present) {
    return null;
  }

  for (const [id, profile] of Object.entries(authProfiles(config))) {
    const profileProviderId = isRecord(profile) ? providerIdFromProfile(id, profile) : null;
    if (providerIdentitiesMatch(profileProviderId, providerId)) {
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

function connectedProviderIdForModel(input: {
  readonly model: string | null;
  readonly providerConnections: readonly ProviderConnectionState[];
}): string | null {
  if (input.model === null) {
    return null;
  }

  const providerId = orchestratorProviderIdFromConnections({
    primaryModel: input.model,
    providerConnections: input.providerConnections,
  });
  return providerId !== null &&
    input.providerConnections.some(
      (connection) => connection.providerId === providerId && connection.status === "connected",
    )
    ? providerId
    : null;
}

function currentOrchestratorState(input: {
  readonly config: Record<string, unknown>;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly reconcile: OrchestratorReconcileState;
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
  const selectedModel = modelSelectorPrimary(askAdmin?.["model"]);
  const selectedProviderId = connectedProviderIdForModel({
    model: selectedModel,
    providerConnections: input.providerConnections,
  });
  const primaryProviderId = connectedProviderIdForModel({
    model: primaryModel,
    providerConnections: input.providerConnections,
  });
  const orchestratorModel =
    selectedProviderId !== null ? selectedModel : primaryProviderId !== null ? primaryModel : null;

  return {
    orchestratorAgentId: ASK_ADMIN_AGENT_ID,
    orchestratorModel,
    orchestratorProviderId: selectedProviderId ?? primaryProviderId,
    delegationMode: "prefer",
    allowAgents,
    subagents,
    toolPolicyExpansion: {
      allow: ["sessions_spawn", "subagents", "group:sessions"],
      receiptId: askAdmin === undefined ? null : "openclaw-config",
    },
    reconcile: input.reconcile,
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

/**
 * Is the live config already the config the reconcile would write?
 *
 * Compares only what the reconcile OWNS, but compares ALL of it. The previous id/model-only check
 * let removed Opzava tools survive forever because policy drift looked current. Unrelated agents
 * and root config remain somebody else's business and must not make a reconcile look necessary.
 */
function orchestratorConfigIsCurrent(input: {
  readonly config: Record<string, unknown>;
  readonly orchestratorModel: string;
  readonly primaryModel: string | null;
  readonly subagents: readonly OrchestratorSubagentRole[];
}): boolean {
  if (input.orchestratorModel !== input.primaryModel) {
    return false;
  }
  if (
    !enabledDefaultModelEntries(input.config).some(
      ({ key }) => key.toLowerCase() === input.orchestratorModel.toLowerCase(),
    )
  ) {
    return false;
  }

  const canonical = buildOrchestratorAgentConfig({
    orchestratorModel: input.orchestratorModel,
    subagents: input.subagents,
  });
  if (!canonical.ok) {
    return false;
  }

  const agents = agentsList(input.config);
  const ownedIds = new Set(canonical.value.agents.list.map((agent) => agent.id));
  const liveOwned = agents.filter((agent) => {
    const id = stringValue(agent["id"]);
    return id === ASK_ADMIN_AGENT_ID || id?.startsWith("subagent-") === true;
  });
  if (
    liveOwned.length !== canonical.value.agents.list.length ||
    liveOwned.some((agent) => {
      const id = stringValue(agent["id"]);
      return id === null || !ownedIds.has(id);
    })
  ) {
    return false;
  }

  return canonical.value.agents.list.every((wanted) => {
    const live = liveOwned.find((agent) => stringValue(agent["id"]) === wanted.id);
    return live !== undefined && ownedConfigValueEquals(live, wanted);
  });
}

function ownedConfigValueEquals(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => ownedConfigValueEquals(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && ownedConfigValueEquals(left[key], right[rightKeys[index]!]),
    )
  );
}

/**
 * The model the orchestrator should route to when it is a given provider. Same resolution
 * `setMainOrchestrator` uses (configured model first, catalog suggestion second) so the two ways of
 * becoming the orchestrator cannot pick different models for the same provider.
 */
function orchestratorModelForProvider(input: {
  readonly providerId: string | null;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly config: Record<string, unknown>;
}): string | null {
  if (input.providerId === null) {
    return null;
  }

  const provider = input.catalog.find((entry) => entry.id === input.providerId);
  const configuredModel = configuredModelForProvider({
    providerId: input.providerId,
    config: input.config,
    models: provider?.models,
  });
  if (configuredModel !== null) {
    return providerModelRef(input.providerId, configuredModel);
  }

  return provider?.suggestedModel === undefined
    ? null
    : providerModelRef(input.providerId, provider.suggestedModel);
}

function orchestratorDelegationState(input: {
  readonly orchestratorModel: string | null;
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
    reconcile: { status: "idle" },
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

  public connectionMetadata() {
    return this.inner?.connectionMetadata() ?? null;
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
  const requestedProviderId = providerIdFromModel(providerId);
  return (
    providers.find(
      (provider) =>
        stringValue(provider["provider"])?.toLowerCase() === requestedProviderId.toLowerCase(),
    ) ??
    providers.find((provider) =>
      providerIdentitiesMatch(stringValue(provider["provider"]), requestedProviderId),
    ) ??
    null
  );
}

function modelStatusOAuthProvider(
  status: unknown,
  providerId: string,
): Record<string, unknown> | null {
  const auth = recordValue(recordValue(status)?.["auth"]);
  const oauth = recordValue(auth?.["oauth"]);
  return (
    arrayValue(oauth?.["providers"])
      .filter(isRecord)
      .find((provider) => providerIdentitiesMatch(stringValue(provider["provider"]), providerId)) ??
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

type ProviderAuthUsability = "usable" | "blocked" | "absent" | "unknown";

interface ModelStatusAuthEvidence {
  readonly usability: ProviderAuthUsability;
  readonly provider: Record<string, unknown> | null;
  readonly profileCount: number;
}

function modelStatusAuthEvidence(input: {
  readonly status: unknown;
  readonly providerId: string;
  readonly config: Record<string, unknown>;
}): ModelStatusAuthEvidence {
  const provider = modelStatusProvider(input.status, input.providerId);
  const profileCount = modelStatusProfileCount(provider);
  const evidence = (usability: ProviderAuthUsability): ModelStatusAuthEvidence => ({
    usability,
    provider,
    profileCount,
  });
  const root = recordValue(input.status);
  const auth = recordValue(root?.["auth"]);
  if (root === null || auth === null) {
    return evidence(
      providerHasBlockingAuthOrder(input.config, input.providerId) ? "blocked" : "unknown",
    );
  }

  const providerMatches = (value: unknown): boolean =>
    providerIdentitiesMatch(stringValue(value), input.providerId);
  if (stringArrayValue(auth["missingProvidersInUse"]).some(providerMatches)) {
    return evidence("blocked");
  }

  const routes = arrayValue(auth["runtimeAuthRoutes"])
    .filter(isRecord)
    .filter((route) => providerMatches(route["provider"]));
  if (routes.length > 0) {
    return evidence(
      routes.some((route) => stringValue(route["status"]) === "usable") ? "usable" : "blocked",
    );
  }

  const effectiveKind = stringValue(recordValue(provider?.["effective"])?.["kind"]);
  if (effectiveKind === "env" || effectiveKind === "models.json" || effectiveKind === "synthetic") {
    return evidence("usable");
  }

  const oauthProvider = modelStatusOAuthProvider(input.status, input.providerId);
  if (oauthProvider !== null && Object.hasOwn(oauthProvider, "effectiveProfiles")) {
    const effectiveProfiles = arrayValue(oauthProvider["effectiveProfiles"]).filter(isRecord);
    if (effectiveProfiles.length === 0) {
      return evidence("blocked");
    }
    return evidence(
      effectiveProfiles.some((profile) => {
        const status = stringValue(profile["status"]);
        return status === "ok" || status === "expiring" || status === "static";
      })
        ? "usable"
        : "blocked",
    );
  }

  if (effectiveKind === "profiles") {
    return evidence(profileCount > 0 ? "usable" : "blocked");
  }
  if (effectiveKind === "missing") {
    return evidence(profileCount > 0 ? "blocked" : "absent");
  }

  const providersPresent = Object.hasOwn(auth, "providers");
  if (provider !== null) {
    if (providerHasBlockingAuthOrder(input.config, input.providerId)) {
      return evidence("blocked");
    }
    return evidence(profileCount > 0 ? "usable" : "absent");
  }
  return evidence(providersPresent ? "absent" : "unknown");
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
  const authEvidence = modelStatusAuthEvidence({
    status: input.modelStatus,
    providerId: input.provider.id,
    config: input.config,
  });
  const hasConfigInventory = providerHasAuthProfile(input.config, input.provider.id);
  if (
    authEvidence.usability === "unknown" ||
    (authEvidence.usability === "absent" && authEvidence.profileCount <= 0 && !hasConfigInventory)
  ) {
    return null;
  }

  const allowedModels = modelStatusAllowedModels(input.modelStatus);
  const providerAllowed = allowedModels.some((model) => model.startsWith(`${input.provider.id}/`));
  const id = firstProfileIdForProvider(input.provider.id, input.config);
  const profile = id === null ? null : recordValue(authProfiles(input.config)[id]);
  const model = configuredModelForProvider({
    providerId: input.provider.id,
    config: input.config,
    models: input.provider.models,
  });
  const hasRoutableModel = providerAllowed || model !== null;
  const connected = authEvidence.usability === "usable" && hasRoutableModel;

  return {
    providerId: input.provider.id,
    status: connected ? "connected" : "needs_attention",
    authChoiceId: id === null || profile === null ? null : authChoiceIdFromProfile(id, profile),
    // CLI labels may embed a profile id (often an email address). Inventory labels never cross the
    // worker boundary; models.authStatus can overlay its provider-safe display name when available.
    accountLabel: stringValue(authEvidence.provider?.["provider"]),
    scopes: [],
    model,
    usageLabel:
      authEvidence.profileCount === 1
        ? "1 auth profile"
        : `${authEvidence.profileCount} auth profiles`,
    lastCheckedAt: input.now.toISOString(),
    message:
      authEvidence.usability === "usable"
        ? hasRoutableModel
          ? "Gateway model authentication is usable."
          : "Provider has credentials but no routable Gateway model."
        : "Gateway reports credentials, but none are eligible for runtime use.",
    connectedAuthMode: connectedAuthModeFromModelStatus(authEvidence.provider),
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

function staleConfigBaseHashError(error: DomainError): boolean {
  const text = `${error.code} ${error.message}`.toLowerCase();
  return (
    text.includes("stalebasehash") ||
    (text.includes("basehash") &&
      (text.includes("stale") ||
        text.includes("mismatch") ||
        text.includes("changed") ||
        text.includes("conflict") ||
        text.includes("rejected")))
  );
}

function ambiguousConfigPatchOutcome(error: DomainError): boolean {
  return closedBeforeResponseError(error, "config.patch") || disconnectPostCheckTransient(error);
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
        providerIdentitiesMatch(providerIdFromProfile(id, profile), providerId) &&
        profileUsesGatewayCredentialAuth(id, profile),
    )
    .map(([id]) => id);
}

/**
 * Auth profile ids the gateway's plugins declare per provider (`models.authStatus.ownership`).
 * Absent on gateways older than the ownership patch — callers must degrade, not fail.
 */
type ProviderProfileOwnership = Readonly<Record<string, readonly string[]>>;

function ownedProfileIdsForProvider(
  ownership: ProviderProfileOwnership | null,
  providerId: string,
): readonly string[] {
  const entries = providerIdentityEntries(ownership ?? {}, providerId);
  return [
    ...new Set([...entries.exact, ...entries.aliases].flatMap(([, profileIds]) => profileIds)),
  ];
}

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
  for (const profileId of ownedProfileIdsForProvider(input.ownership, input.providerId)) {
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
  ownership: ProviderProfileOwnership | null,
  disconnectedProviderId: string,
): ReadonlyMap<string, string> {
  const profiles = authProfiles(config);
  const owners = new Map<string, string>();
  for (const profileId of profileIds) {
    const profile = profiles[profileId];
    const ownershipEntries = Object.entries(ownership ?? {}).filter(([, ownedProfileIds]) =>
      ownedProfileIds.includes(profileId),
    );
    const identityEntries = providerIdentityEntries(
      Object.fromEntries(ownershipEntries),
      disconnectedProviderId,
    );
    const declaredOwnerId =
      identityEntries.exact[0]?.[0] ??
      identityEntries.aliases[0]?.[0] ??
      ownershipEntries[0]?.[0] ??
      null;
    const providerId = isRecord(profile)
      ? providerIdFromProfile(profileId, profile)
      : (providerIdFromProfilePrefix(profileId) ??
        declaredOwnerId ??
        providerIdFromProfile(profileId, {}));
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
    const authStatusProviders = [...(input.authStatus?.values() ?? [])].filter((provider) =>
      providerIdentitiesMatch(provider.providerId, providerId),
    );
    const survivingAuthStatusProvider = authStatusProviders.find(
      (provider) =>
        provider.connectedAuthMode === "oauth" ||
        provider.connectedAuthMode === "token" ||
        (provider.authHealth !== "missing" && provider.status !== "not_connected"),
    );
    const managedCredentialSurvived = survivingAuthStatusProvider !== undefined;
    if (managedCredentialSurvived && !stores.includes("models.authStatus")) {
      stores.push("models.authStatus");
      connectedAuthMode = survivingAuthStatusProvider.connectedAuthMode;
    }

    const statusProviders = arrayValue(
      recordValue(recordValue(input.modelStatus)?.["auth"])?.["providers"],
    )
      .filter(isRecord)
      .filter((provider) => providerIdentitiesMatch(stringValue(provider["provider"]), providerId));
    const survivingStatusProvider = statusProviders.find(
      (provider) => modelStatusProfileCount(provider) > 0,
    );
    if (survivingStatusProvider !== undefined && !stores.includes("models.status")) {
      stores.push("models.status");
      connectedAuthMode ??= connectedAuthModeFromModelStatus(survivingStatusProvider);
    }
  }

  // The profile-id check is what catches an orphaned SIBLING: it survives under a provider id that
  // is not in `providerIds`, so a provider-scoped read alone reports "clean" while the key lives on.
  const profiles = authProfiles(input.config);
  const survivingProfileIds = input.profileIds.filter((profileId) => isRecord(profiles[profileId]));
  const idMatchedSurvives = input.providerIds.some(
    (providerId) => configCredentialProfileIdsForProvider(input.config, providerId).length > 0,
  );
  const equivalentOrderSurvives = input.providerIds.some((providerId) => {
    const entries = providerIdentityEntries(authOrder(input.config), providerId);
    return [...entries.exact, ...entries.aliases].some(
      ([, value]) =>
        (Array.isArray(value) && value.some((entry) => typeof entry === "string")) ||
        (typeof value === "string" && value.trim() !== ""),
    );
  });
  if (
    (survivingProfileIds.length > 0 || idMatchedSurvives || equivalentOrderSurvives) &&
    !stores.includes(durableCredentialStore)
  ) {
    stores.push(durableCredentialStore);
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

const coreHealthComponents = [
  { id: "gateway", kind: "gateway", label: "Gateway" },
  { id: "event-loop", kind: "event-loop", label: "Event loop" },
  { id: "plugins", kind: "plugins", label: "Plugins" },
  { id: "context-engines", kind: "context-engines", label: "Context engines" },
] as const;

function healthComponent(input: {
  readonly id: string;
  readonly kind: OpenClawHealthComponent["kind"];
  readonly label: string;
  readonly status: OpenClawHealthComponent["status"];
  readonly detail: string | null;
  readonly lastCheckedAt: string | null;
}): OpenClawHealthComponent {
  return input;
}

function unknownCoreHealthComponents(): readonly OpenClawHealthComponent[] {
  return coreHealthComponents.map((component) =>
    healthComponent({
      ...component,
      status: "not_checked",
      detail: "Health data was not available.",
      lastCheckedAt: null,
    }),
  );
}

function channelAccountRecords(
  channel: Record<string, unknown>,
): readonly [string, Record<string, unknown>][] {
  const accounts = recordValue(channel["accounts"]);
  if (accounts !== null) {
    return Object.entries(accounts)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
      .filter(([, account]) => account["configured"] === true);
  }

  const accountId = stringValue(channel["accountId"]);
  return accountId !== null && channel["configured"] === true ? [[accountId, channel]] : [];
}

const positiveChannelHealthStates = new Set([
  "linked",
  "connected",
  "configured",
  "healthy",
  "ok",
  "ready",
  "running",
  "unmanaged",
]);
const negativeChannelHealthStates = new Set([
  "not-linked",
  "disconnected",
  "unstable",
  "unconfigured",
  "failed",
  "error",
  "unhealthy",
]);

function channelAccountComponent(input: {
  readonly channelId: string;
  readonly channelLabel: string;
  readonly accountId: string;
  readonly account: Record<string, unknown>;
  readonly healthCheckedAt: string;
}): OpenClawHealthComponent {
  const probe = recordValue(input.account["probe"]);
  const healthState = stringValue(input.account["healthState"])?.toLowerCase() ?? null;
  const statusState = stringValue(input.account["statusState"])?.toLowerCase() ?? null;
  const explicitlyUnhealthy =
    input.account["linked"] === false ||
    input.account["running"] === false ||
    input.account["connected"] === false ||
    probe?.["ok"] === false ||
    (healthState !== null && negativeChannelHealthStates.has(healthState)) ||
    (statusState !== null && negativeChannelHealthStates.has(statusState));
  const explicitlyHealthy =
    input.account["linked"] === true ||
    input.account["running"] === true ||
    input.account["connected"] === true ||
    probe?.["ok"] === true ||
    (healthState !== null && positiveChannelHealthStates.has(healthState)) ||
    (statusState !== null && positiveChannelHealthStates.has(statusState));
  const lastCheckedAt = isoTimestamp(input.account["lastProbeAt"]);

  return healthComponent({
    id: `channel:${input.channelId}:${input.accountId}`,
    kind: "channel",
    label: `${input.channelLabel} (${input.accountId})`,
    status: explicitlyUnhealthy ? "attention" : explicitlyHealthy ? "healthy" : "not_checked",
    detail: explicitlyUnhealthy
      ? "The configured channel account reported an unhealthy state."
      : explicitlyHealthy
        ? "The configured channel account is healthy."
        : "The configured channel account has not been probed.",
    lastCheckedAt:
      explicitlyUnhealthy || explicitlyHealthy ? (lastCheckedAt ?? input.healthCheckedAt) : null,
  });
}

function projectOpenClawComponents(healthResult: Result<unknown>): {
  readonly components: readonly OpenClawHealthComponent[];
  readonly warnings: OpenClawHealth["warnings"];
  readonly checkedAt: string | null;
} {
  if (!healthResult.ok) {
    return { components: unknownCoreHealthComponents(), warnings: [], checkedAt: null };
  }
  const health = recordValue(healthResult.value);
  const checkedAt = isoTimestamp(health?.["ts"]);
  if (health === null || health["ok"] !== true || checkedAt === null) {
    return { components: unknownCoreHealthComponents(), warnings: [], checkedAt: null };
  }

  const components: OpenClawHealthComponent[] = [
    healthComponent({
      ...coreHealthComponents[0],
      status: "healthy",
      detail: "The Gateway health RPC responded successfully.",
      lastCheckedAt: checkedAt,
    }),
  ];
  const eventLoop = recordValue(health["eventLoop"]);
  components.push(
    healthComponent({
      ...coreHealthComponents[1],
      status:
        eventLoop?.["degraded"] === true
          ? "attention"
          : eventLoop?.["degraded"] === false
            ? "healthy"
            : "not_checked",
      detail:
        eventLoop?.["degraded"] === true
          ? "The Gateway reported degraded event-loop health."
          : eventLoop?.["degraded"] === false
            ? "Event-loop health is within limits."
            : "Event-loop health was not checked.",
      lastCheckedAt: typeof eventLoop?.["degraded"] === "boolean" ? checkedAt : null,
    }),
  );

  const plugins = health["plugins"];
  const pluginRecord = recordValue(plugins);
  const pluginLoaded = pluginRecord?.["loaded"];
  const pluginErrors = pluginRecord?.["errors"];
  const validPluginFacts =
    plugins === undefined ||
    (pluginRecord !== null &&
      Array.isArray(pluginLoaded) &&
      pluginLoaded.every((entry) => typeof entry === "string") &&
      Array.isArray(pluginErrors) &&
      pluginErrors.every(
        (entry) =>
          isRecord(entry) &&
          stringValue(entry["id"]) !== null &&
          stringValue(entry["origin"]) !== null &&
          typeof entry["activated"] === "boolean" &&
          stringValue(entry["error"]) !== null,
      ));
  const pluginErrorCount = Array.isArray(pluginErrors) ? pluginErrors.length : 0;
  components.push(
    healthComponent({
      ...coreHealthComponents[2],
      status: !validPluginFacts ? "not_checked" : pluginErrorCount > 0 ? "attention" : "healthy",
      detail: !validPluginFacts
        ? "Plugin health could not be read."
        : pluginErrorCount > 0
          ? `${pluginErrorCount} plugin error${pluginErrorCount === 1 ? "" : "s"} reported.`
          : "No plugin errors were reported.",
      lastCheckedAt: validPluginFacts ? checkedAt : null,
    }),
  );

  const contextEngines = health["contextEngines"];
  const contextRecord = recordValue(contextEngines);
  const quarantined = contextRecord?.["quarantined"];
  const validContextFacts =
    contextEngines === undefined ||
    (contextRecord !== null &&
      Array.isArray(quarantined) &&
      quarantined.every(
        (entry) =>
          isRecord(entry) &&
          stringValue(entry["engineId"]) !== null &&
          stringValue(entry["operation"]) !== null &&
          stringValue(entry["reason"]) !== null &&
          numberValue(entry["failedAt"]) !== null,
      ));
  const quarantineCount = Array.isArray(quarantined) ? quarantined.length : 0;
  components.push(
    healthComponent({
      ...coreHealthComponents[3],
      status: !validContextFacts ? "not_checked" : quarantineCount > 0 ? "attention" : "healthy",
      detail: !validContextFacts
        ? "Context-engine health could not be read."
        : quarantineCount > 0
          ? `${quarantineCount} context engine${quarantineCount === 1 ? " is" : "s are"} quarantined.`
          : "No context engines are quarantined.",
      lastCheckedAt: validContextFacts ? checkedAt : null,
    }),
  );

  const channels = recordValue(health["channels"]);
  if (channels !== null) {
    const order = Array.isArray(health["channelOrder"])
      ? health["channelOrder"].filter((entry): entry is string => typeof entry === "string")
      : [];
    const channelIds = [
      ...order.filter((id) => channels[id] !== undefined),
      ...Object.keys(channels)
        .filter((id) => !order.includes(id))
        .sort(),
    ];
    const labels = recordValue(health["channelLabels"]);
    for (const channelId of channelIds) {
      const channel = recordValue(channels[channelId]);
      if (channel === null) continue;
      for (const [accountId, account] of [...channelAccountRecords(channel)].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        components.push(
          channelAccountComponent({
            channelId,
            channelLabel: stringValue(labels?.[channelId]) ?? channelId,
            accountId,
            account,
            healthCheckedAt: checkedAt,
          }),
        );
      }
    }
  }

  if (Array.isArray(health["agents"])) {
    const agents = health["agents"]
      .filter((agent): agent is Record<string, unknown> => isRecord(agent))
      .map((agent) => ({ agent, agentId: stringValue(agent["agentId"]) }))
      .filter(
        (entry): entry is { agent: Record<string, unknown>; agentId: string } =>
          entry.agentId !== null,
      )
      .sort((left, right) => left.agentId.localeCompare(right.agentId));
    for (const { agent, agentId } of agents) {
      components.push(
        healthComponent({
          id: `agent:${agentId}`,
          kind: "agent",
          label: stringValue(agent["name"]) ?? agentId,
          status: "not_checked",
          detail: "Agent schedule configuration is available, but liveness was not checked.",
          lastCheckedAt: null,
        }),
      );
    }
  }

  const pricing = recordValue(health["modelPricing"]);
  const warnings =
    pricing?.["state"] === "degraded"
      ? [
          {
            id: "model-pricing",
            label: "Model pricing",
            detail: "Model pricing refresh is degraded; runtime health is unaffected.",
          },
        ]
      : [];
  return { components, warnings, checkedAt };
}

function projectOpenClawRuntimeAndSessions(input: {
  readonly statusResult: Result<unknown>;
  readonly healthResult: Result<unknown>;
  readonly metadata: ReturnType<OpenClawAdminRpcPort["connectionMetadata"]>;
}): Pick<OpenClawHealth, "runtime" | "sessions"> {
  const status = input.statusResult.ok ? recordValue(input.statusResult.value) : null;
  const sessions = recordValue(status?.["sessions"]);
  const count = sessions?.["count"];
  const recent = sessions?.["recent"];
  const validStatus =
    status !== null &&
    sessions !== null &&
    typeof count === "number" &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    Array.isArray(recent);
  const health = input.healthResult.ok ? recordValue(input.healthResult.value) : null;
  const healthSessions = recordValue(health?.["sessions"]);
  const healthCount = healthSessions?.["count"];
  const healthRecent = healthSessions?.["recent"];
  const validHealthSessions =
    health?.["ok"] === true &&
    healthSessions !== null &&
    typeof healthCount === "number" &&
    Number.isSafeInteger(healthCount) &&
    healthCount >= 0 &&
    Array.isArray(healthRecent);
  const sessionRows = validStatus ? recent : validHealthSessions ? healthRecent : [];

  return {
    runtime: {
      version:
        (status === null ? null : stringValue(status["runtimeVersion"])) ??
        input.metadata?.serverVersion ??
        null,
      uptimeMs: input.metadata?.uptimeMs ?? null,
      hostUptimeMs: null,
      updateAvailable: input.metadata?.updateAvailable ?? null,
    },
    sessions: {
      count: validStatus ? count : validHealthSessions ? healthCount : null,
      recent:
        validStatus || validHealthSessions
          ? sessionRows.filter(isRecord).map((entry) => {
              const ageMs = numberValue(entry["ageMs"] ?? entry["age"]);
              return {
                agentId: validStatus ? stringValue(entry["agentId"]) : null,
                updatedAt: isoTimestamp(entry["updatedAt"]),
                ageMs: ageMs !== null && ageMs >= 0 ? ageMs : null,
              };
            })
          : [],
    },
  };
}

export class GatewayAdminConnectionsProvisioningPort implements ConnectionsProvisioningRuntimePort {
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private readonly githubFlows = new Map<string, PendingGitHubDeviceFlow>();
  private readonly modelDeviceFlows = new Map<string, PendingModelProviderDeviceFlow>();
  private readonly modelDeviceFlowFinalizations = new Map<
    string,
    Promise<Result<DeviceFlowPollState>>
  >();
  private readonly modelDeviceFlowCancellations = new Map<
    string,
    Promise<Result<DeviceFlowCancelState>>
  >();
  private readonly modelDeviceFlowStops = new Map<string, Promise<void>>();
  private readonly modelApiKeyConnects = new Map<string, PendingModelProviderApiKeyConnect>();
  private readonly modelSetupTokenFlows = new Map<string, PendingModelProviderSetupTokenFlow>();
  private readonly modelProviderDisconnects = new Map<string, PendingModelProviderDisconnect>();
  private orchestratorReconcileState: OrchestratorReconcileState = { status: "idle" };
  private orchestratorReconcileTail: Promise<void> = Promise.resolve();
  private orchestratorReconcileQueued = 0;
  /** Ref-counted organization-wide reservations. One async owner may release only itself. */
  private readonly providerCredentialWrites = new Map<string, number>();
  private readonly lastFullyHealthy = new Map<
    string,
    { readonly value: OpenClawLastKnownHealthy; readonly expiresAt: number }
  >();

  public constructor(private readonly options: GatewayAdminConnectionsOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.audit = options.audit ?? noopAuditSink;
  }

  private readonly audit: ErrorCapturePort;

  public reconcileStartup(): Promise<Result<AskAdminStartupReconciliationReceipt>> {
    return new AskAdminStartupReconciler({
      adminClient: this.options.adminClient,
      configPort: this,
    }).reconcile();
  }

  public close(): void {
    this.options.adminClient.close();
  }

  // ---------------------------------------------------------------------------
  // Governance audit (#192). Every connections/provider mutation emits an append-only
  // state-transition event keyed by DOMAIN INTENT (not RPC). The fire-and-forget reconcile
  // re-election records actor=system with a `trigger` linking the human whose credential change
  // necessitated it, so literal and causal truth stay distinct (#192 comment 2). Audit appends
  // are best-effort relative to the gateway mutation (they cannot share a transaction — the
  // gateway is a remote system), but never block or fail the mutation itself (#192 comment 4).
  // ---------------------------------------------------------------------------

  private recordAudit(input: AppendAuditInput): void {
    void this.audit.appendAudit(input).then((result) => {
      if (!result.ok) {
        const failure = result.error as { message?: unknown; cause?: unknown } | undefined;
        const causeOf = (value: unknown): string =>
          value instanceof Error
            ? `${value.name}: ${value.message}`
            : typeof value === "string"
              ? value
              : value === undefined
                ? ""
                : JSON.stringify(value);
        console.error(
          JSON.stringify({
            level: "error",
            code: "observability.auditAppendFailed",
            intent: input.intent,
            transition: input.transition,
            targetKind: input.targetKind,
            targetRef: input.targetRef,
            detail: causeOf(failure?.message ?? failure),
            cause: causeOf(failure?.cause),
          }),
        );
      }
    });
  }

  private auditUserEvent(params: {
    readonly principal: ConnectionProvisioningPrincipal;
    readonly intent: AuditIntent;
    readonly transition: AuditTransition;
    readonly targetKind: AuditTargetKind;
    readonly targetRef: string;
    readonly result: AuditResult;
    readonly resultCode?: string;
    readonly resultMessage?: string;
    readonly configSnapshot?: AuditConfigSnapshot;
  }): void {
    this.recordAudit({
      organizationId: makeOrgId(params.principal.orgId),
      intent: params.intent,
      transition: params.transition,
      targetKind: params.targetKind,
      targetRef: params.targetRef,
      actorId: params.principal.actorUserId,
      actorType: "user",
      result: params.result,
      ...(params.resultCode === undefined ? {} : { resultCode: params.resultCode }),
      ...(params.resultMessage === undefined ? {} : { resultMessage: params.resultMessage }),
      ...(params.configSnapshot === undefined ? {} : { configSnapshot: params.configSnapshot }),
    });
  }

  private auditSystemEvent(params: {
    readonly organizationId: string;
    readonly intent: AuditIntent;
    readonly transition: AuditTransition;
    readonly targetKind: AuditTargetKind;
    readonly targetRef: string;
    readonly result: AuditResult;
    readonly resultCode?: string;
    readonly resultMessage?: string;
    readonly triggeredByActorId?: string;
    readonly triggeredByAction?: string;
  }): void {
    const hasTrigger =
      params.triggeredByActorId !== undefined && params.triggeredByAction !== undefined;
    this.recordAudit({
      organizationId: makeOrgId(params.organizationId),
      intent: params.intent,
      transition: params.transition,
      targetKind: params.targetKind,
      targetRef: params.targetRef,
      actorId: "system",
      actorType: "system",
      result: params.result,
      ...(params.resultCode === undefined ? {} : { resultCode: params.resultCode }),
      ...(params.resultMessage === undefined ? {} : { resultMessage: params.resultMessage }),
      ...(hasTrigger
        ? {
            trigger: {
              triggeredByActorId: params.triggeredByActorId!,
              triggeredByAction: params.triggeredByAction!,
            },
          }
        : {}),
    });
  }

  /** Builds a safe, secret-free routing snapshot whose hash lets governance be reconstructed. */
  private routingSnapshot(
    targetKind: AuditTargetKind,
    targetRef: string,
    content: Readonly<Record<string, unknown>>,
  ): AuditConfigSnapshot {
    return {
      targetKind,
      targetRef,
      content,
      versionHash: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
    };
  }

  private acquireProviderWrite(key: string): void {
    this.providerCredentialWrites.set(key, (this.providerCredentialWrites.get(key) ?? 0) + 1);
  }

  private releaseProviderWrite(key: string): void {
    const count = this.providerCredentialWrites.get(key) ?? 0;
    if (count <= 1) {
      this.providerCredentialWrites.delete(key);
      return;
    }
    this.providerCredentialWrites.set(key, count - 1);
  }

  private providerWriteReserved(key: string): boolean {
    return (this.providerCredentialWrites.get(key) ?? 0) > 0;
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

  /**
   * Block until the gateway is answering RPCs again after a config.patch reload.
   *
   * `health` is an idempotent read the RPC client already retries across a dropped socket, so
   * polling it is how we learn the new process is serving. Returns false when it never comes back
   * inside the caller's wait budget -- the caller must then report that it could not VERIFY the
   * disconnect, not that the credential survived (#172): those are different claims, and only one
   * of them sends an operator to re-run a destructive action against a provider that is already
   * disconnected.
   */
  private async waitForGatewayReady(
    waitForTransient: (delayMs: number) => Promise<boolean>,
  ): Promise<boolean> {
    let health = await this.options.adminClient.request("health", {});
    while (!health.ok) {
      if (!(await waitForTransient(disconnectGatewayReadyRetryDelayMs))) {
        return false;
      }
      health = await this.options.adminClient.request("health", {});
    }

    return true;
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
          providerIdentitiesMatch(
            stringValue(provider["provider"]) ?? stringValue(provider["providerId"]),
            providerId,
          ),
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
    return this.connectionsSnapshot(input, false);
  }

  public async refreshConnectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
  ): Promise<Result<ConnectionsSnapshot>> {
    return this.connectionsSnapshot(input, true);
  }

  private lastKnownHealthy(input: {
    readonly principal: ConnectionProvisioningPrincipal;
    readonly components: readonly OpenClawHealthComponent[];
    readonly checkedAt: string | null;
    readonly now: Date;
  }): OpenClawLastKnownHealthy | null {
    const key = `${input.principal.orgId}\u0000${input.principal.workspaceId}`;
    const nowMs = input.now.getTime();
    for (const [candidateKey, entry] of this.lastFullyHealthy) {
      if (entry.expiresAt <= nowMs) this.lastFullyHealthy.delete(candidateKey);
    }

    if (
      input.checkedAt !== null &&
      input.components.length > 0 &&
      input.components.every((component) => component.status === "healthy")
    ) {
      const value = {
        checkedAt: input.checkedAt,
        healthy: input.components.length,
        total: input.components.length,
      } satisfies OpenClawLastKnownHealthy;
      this.lastFullyHealthy.delete(key);
      this.lastFullyHealthy.set(key, { value, expiresAt: nowMs + 24 * 60 * 60 * 1_000 });
      while (this.lastFullyHealthy.size > 256) {
        const oldest = this.lastFullyHealthy.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.lastFullyHealthy.delete(oldest);
      }
      return value;
    }

    return this.lastFullyHealthy.get(key)?.value ?? null;
  }

  private async connectionsSnapshot(
    input: ConnectionProvisioningPrincipal,
    probeHealth: boolean,
  ): Promise<Result<ConnectionsSnapshot>> {
    const now = this.now();
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      if (probeHealth) {
        return err(
          provisioningError(
            "provisioning.connections.healthProbeUnavailable",
            "OpenClaw did not return a checked result for the live health probe.",
          ),
        );
      }
      const unavailable = unavailableSnapshot({
        now,
        repository: this.options.githubRepository,
        message: configResult.error.message,
      });
      return ok({
        ...unavailable,
        orchestrator: {
          ...unavailable.orchestrator,
          reconcile: this.orchestratorReconcileState,
        },
        openclawHealth: {
          ...unavailable.openclawHealth,
          lastKnownHealthy: this.lastKnownHealthy({
            principal: input,
            components: unavailable.openclawHealth.components,
            checkedAt: null,
            now,
          }),
        },
      });
    }

    const [
      healthResult,
      heartbeatResult,
      modelsResult,
      authChoicesResult,
      modelStatusResult,
      pluginDiscoveryResult,
      authStatus,
      statusResult,
    ] = await Promise.all([
      this.options.adminClient.request("health", probeHealth ? { probe: true } : {}),
      this.options.adminClient.request("last-heartbeat", {}),
      this.options.adminClient.request("models.list", { view: "all" }),
      this.options.gatewayRuntime?.listAuthChoices() ?? ok<readonly GatewayRuntimeAuthChoice[]>([]),
      // `models status` (CLI) sees the REAL profile stores — incl. the Codex/OAuth store that the
      // `models.authStatus` RPC under-reports as "missing" for openai. It is the connected-truth.
      this.options.gatewayRuntime?.modelStatus() ?? ok<unknown>(null),
      this.options.gatewayRuntime?.readPluginModelDiscovery() ??
        ok<PluginModelCatalogDiscovery>({ catalogs: [], plugins: [] }),
      this.modelAuthStatus(),
      this.options.adminClient.request(
        "status",
        { includeSensitive: true },
        { requiredScope: "operator.admin" },
      ),
    ]);
    const projectedHealth = projectOpenClawComponents(healthResult);
    if (probeHealth && projectedHealth.checkedAt === null) {
      return err(
        provisioningError(
          "provisioning.connections.healthProbeUnavailable",
          "OpenClaw did not return a checked result for the live health probe.",
        ),
      );
    }
    if (!pluginDiscoveryResult.ok) {
      console.warn("connections.pluginModelDiscovery.unavailable", {
        code: pluginDiscoveryResult.error.code,
      });
    }
    const config = configPayload(configResult.value);
    const runtimeChoices = authChoicesResult.ok ? authChoicesResult.value : [];
    const catalog = ensureCanonicalLlmProviders({
      catalog: mergeRuntimeAuthChoices({
        catalog: providerCatalogFromModels(
          modelsResult.ok ? modelsResult.value : {},
          config,
          pluginDiscoveryResult.ok ? pluginDiscoveryResult.value : null,
        ),
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
    const runtimeAndSessions = projectOpenClawRuntimeAndSessions({
      statusResult,
      healthResult,
      metadata: this.options.adminClient.connectionMetadata(),
    });
    const openclawHealth: OpenClawHealth = {
      components: projectedHealth.components,
      warnings: projectedHealth.warnings,
      ...runtimeAndSessions,
      checkedAt: projectedHealth.checkedAt,
      lastKnownHealthy: this.lastKnownHealthy({
        principal: input,
        components: projectedHealth.components,
        checkedAt: projectedHealth.checkedAt,
        now,
      }),
    };

    return ok({
      gateway: gatewayConnectionState({
        config,
        healthResult,
        heartbeatResult,
        modelsResult,
        grantedScopes: this.options.adminClient.grantedScopes(),
        now,
      }),
      openclawHealth,
      providerCatalog: catalog,
      providerConnections,
      pendingDeviceFlows: canReadPendingDeviceFlowCapabilities(input)
        ? [
            ...[...this.githubFlows.values()]
              .filter(
                (flow) =>
                  flow.principal.orgId === input.orgId &&
                  flow.principal.actorUserId === input.actorUserId,
              )
              .map((flow) => this.challengeFromGitHubFlow(flow)),
            ...[...this.modelDeviceFlows.values()]
              .filter(
                (flow) =>
                  flow.orgId === input.orgId &&
                  flow.actorUserId === input.actorUserId &&
                  flow.lifecycle === "active",
              )
              .map((flow) => this.challengeFromModelFlow(flow)),
          ]
        : [],
      github,
      orchestrator: currentOrchestratorState({
        config,
        catalog,
        providerConnections,
        reconcile: this.orchestratorReconcileState,
        now,
      }),
      refreshedAt: now.toISOString(),
    });
  }

  private modelToggleConnectionState(input: {
    readonly providerId: string;
    readonly config: Record<string, unknown>;
    readonly modelsPayload: unknown;
    readonly discovery: PluginModelCatalogDiscovery | null;
    readonly modelStatus: unknown | null;
    readonly authStatus: ReadonlyMap<string, ModelAuthStatusConnection> | null;
  }): Result<ProviderConnectionState> {
    const provider = providerCatalogFromModels(
      input.modelsPayload,
      input.config,
      input.discovery,
    ).find((entry) => entry.id.toLowerCase() === input.providerId.toLowerCase());
    if (provider === undefined) {
      return err(
        provisioningError(
          "provisioning.connections.providerStateUnavailable",
          "The refreshed gateway catalog no longer exposes that provider.",
          { providerId: input.providerId },
        ),
      );
    }
    // Config alone under-reports connection state (an OAuth provider's profiles live in the
    // runtime agent store), so the returned row is assembled from the same sources the snapshot
    // uses — otherwise a successful toggle would flip a Connected row back to Available.
    return ok(
      providerConnectionFromConnectionSources({
        provider,
        config: input.config,
        modelStatus: input.modelStatus,
        authStatus: input.authStatus,
        now: this.now(),
      }),
    );
  }

  private async modelTogglePostCheck(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly enabled: boolean;
    readonly registryDefWritten: boolean;
    readonly waitForTransient: (delayMs: number) => Promise<boolean>;
  }): Promise<
    Result<{ readonly config: Record<string, unknown>; readonly modelStatus: unknown | null }>
  > {
    const ref = `${input.providerId}/${input.modelId}`.toLowerCase();
    while (true) {
      const [result, statusResult] = await Promise.all([
        this.options.adminClient.request("config.get", {}),
        this.options.gatewayRuntime?.modelStatus() ?? ok<unknown>(null),
      ]);
      if (!result.ok) {
        if (
          disconnectPostCheckTransient(result.error) &&
          (await input.waitForTransient(disconnectPostCheckRetryDelayMs))
        ) {
          continue;
        }
        return err(
          provisioningError(
            "provisioning.connections.modelTogglePostCheckUnavailable",
            "Gateway model setting could not be verified after the config reload.",
            { providerId: input.providerId, modelId: input.modelId },
          ),
        );
      }

      const config = configPayload(result.value);
      const present = enabledDefaultModelEntries(config).some(({ key }) => {
        if (!modelRefMatchesProvider(key, input.providerId)) {
          return false;
        }
        const id = key.slice(key.indexOf("/") + 1);
        return id.toLowerCase() === input.modelId.toLowerCase();
      });
      // The defaults key alone is not routability. When this call had to register the model's
      // definition, prove the def survived under models.providers; and in both directions prove
      // the gateway's own `models status` allowed set agrees — an enabled-but-unroutable model is
      // exactly the lie #184 exists to kill. A missing/failed status read stays a soft signal
      // (older gateways), never a fake pass on the config half.
      const registryOk =
        !input.registryDefWritten ||
        arrayValue(
          configProviderEntry({ config, providerId: input.providerId })?.value["models"],
        ).some(
          (model) =>
            (typeof model === "string" && model.toLowerCase() === input.modelId.toLowerCase()) ||
            (isRecord(model) &&
              modelRecordId(model, input.providerId)?.toLowerCase() ===
                input.modelId.toLowerCase()),
        );
      const modelStatus = statusResult.ok ? statusResult.value : null;
      const allowedRefs = modelStatusAllowedModels(modelStatus).map((entry) => entry.toLowerCase());
      const allowedOk =
        modelStatus === null || allowedRefs.length === 0
          ? true
          : allowedRefs.includes(ref) === input.enabled;
      if (present === input.enabled && registryOk && allowedOk) {
        return ok({ config, modelStatus });
      }
      // A successful read can still be the old process answering during the reload window. Treat
      // the undesired value as stale evidence until the same bounded cadence disconnect uses is
      // exhausted; only then is it proof that the mutation did not stick.
      if (await input.waitForTransient(disconnectPostCheckRetryDelayMs)) {
        continue;
      }
      return err(
        provisioningError(
          "provisioning.connections.modelTogglePostCheckFailed",
          "Gateway config did not retain the requested model setting.",
          {
            providerId: input.providerId,
            modelId: input.modelId,
            enabled: input.enabled,
            defaultsKeyPresent: present,
            registryOk,
            allowedOk,
          },
        ),
      );
    }
  }

  public async setModelProviderModelEnabled(
    input: SetModelProviderModelEnabledInput,
  ): Promise<Result<ProviderConnectionState>> {
    const result = await this.setModelProviderModelEnabledInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "provider_model_toggled",
      transition: result.ok ? "completed" : "failed",
      targetKind: "model_provider",
      targetRef: `${input.providerId}:${input.modelId}`,
      result: result.ok ? "success" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
      ...(result.ok
        ? {
            configSnapshot: this.routingSnapshot("model_provider", input.providerId, {
              providerId: input.providerId,
              modelId: input.modelId,
              enabled: input.enabled,
              resultingStatus: result.value.status,
            }),
          }
        : {}),
    });
    return result;
  }

  private async setModelProviderModelEnabledInner(
    input: SetModelProviderModelEnabledInput,
  ): Promise<Result<ProviderConnectionState>> {
    const guardKey = configWriteKey(input.orgId);
    const busy = this.providerConnectInFlight(input.orgId, input.providerId);
    if (busy !== null) {
      return err(busy);
    }
    this.acquireProviderWrite(guardKey);

    try {
      for (let attempt = 1; attempt <= modelToggleMaxMutationAttempts; attempt += 1) {
        const [configResult, modelsResult, discoveryResult, modelStatusResult, authStatus] =
          await Promise.all([
            this.options.adminClient.request("config.get", {}),
            this.options.adminClient.request("models.list", { view: "all" }),
            this.options.gatewayRuntime?.readPluginModelDiscovery() ??
              ok<PluginModelCatalogDiscovery>({ catalogs: [], plugins: [] }),
            this.options.gatewayRuntime?.modelStatus() ?? ok<unknown>(null),
            this.modelAuthStatus(),
          ]);
        if (!configResult.ok) {
          return err(configResult.error);
        }
        if (!modelsResult.ok) {
          return err(modelsResult.error);
        }
        if (!discoveryResult.ok) {
          console.warn("connections.pluginModelDiscovery.unavailable", {
            code: discoveryResult.error.code,
          });
        }

        const config = configPayload(configResult.value);
        // Model repair needs usable auth, not an already-routable model. The authoritative status
        // path admits env/synthetic auth without profiles and rejects stored-but-excluded inventory;
        // only an unavailable/legacy status falls back to the configured profile selection.
        const authEvidence = modelStatusAuthEvidence({
          status: modelStatusResult.ok ? modelStatusResult.value : null,
          providerId: input.providerId,
          config,
        });
        const legacyConfigConnected = firstProfileIdForProvider(input.providerId, config) !== null;
        const providerConnected =
          authEvidence.usability === "usable" ||
          (authEvidence.usability === "unknown" && legacyConfigConnected);
        if (!providerConnected) {
          return err(
            provisioningError(
              "provisioning.connections.providerNotConnected",
              "Connect the provider before changing its enabled models.",
              { providerId: input.providerId },
            ),
          );
        }

        const discovery = discoveryResult.ok ? discoveryResult.value : null;
        const catalogModels = catalogModelsForProvider({
          modelsPayload: modelsResult.value,
          discovery,
          providerId: input.providerId,
        });
        const requestedModelId = input.modelId
          .toLowerCase()
          .startsWith(`${input.providerId.toLowerCase()}/`)
          ? input.modelId.slice(input.providerId.length + 1)
          : input.modelId;
        const catalogModel = catalogModels.find(
          (model) => model.id.toLowerCase() === requestedModelId.toLowerCase(),
        );
        if (input.enabled && catalogModel === undefined) {
          return err(
            provisioningError(
              "provisioning.connections.modelNotInCatalog",
              "The live gateway catalog does not advertise that model for this provider.",
              { providerId: input.providerId, modelId: input.modelId },
            ),
          );
        }

        const enabledEntries = enabledDefaultModelEntries(config).filter(({ key }) =>
          modelRefMatchesProvider(key, input.providerId),
        );
        const existingEnabled = enabledEntries.find(({ key }) => {
          const id = key.slice(key.indexOf("/") + 1);
          return id.toLowerCase() === requestedModelId.toLowerCase();
        });
        const canonicalModelId = catalogModel?.id ?? requestedModelId;
        const canonicalRef = `${input.providerId}/${canonicalModelId}`;

        // The idempotent no-op returns BEFORE the disable guardrails run: disabling an
        // already-absent model must succeed without mutation even when the ref is still a
        // configured primary or fallback — the guardrails exist to protect an actual removal,
        // not to reject a request that changes nothing.
        if (
          (input.enabled && existingEnabled !== undefined) ||
          (!input.enabled && existingEnabled === undefined)
        ) {
          return this.modelToggleConnectionState({
            providerId: input.providerId,
            config,
            modelsPayload: modelsResult.value,
            discovery,
            modelStatus: modelStatusResult.ok ? modelStatusResult.value : null,
            authStatus,
          });
        }

        if (!input.enabled) {
          const protectedRef = existingEnabled?.key ?? canonicalRef;
          if (protectedModelRefs(config).has(protectedRef.toLowerCase())) {
            return err(
              provisioningError(
                "provisioning.connections.modelInUse",
                "That model is a configured primary or fallback and cannot be disabled.",
                { providerId: input.providerId, modelId: requestedModelId },
              ),
            );
          }
          if (enabledEntries.length <= 1) {
            return err(
              provisioningError(
                "provisioning.connections.lastEnabledModel",
                "A connected provider must keep at least one model enabled.",
                { providerId: input.providerId, modelId: requestedModelId },
              ),
            );
          }
        }

        const modelsListHasDefinition = modelsListRecords(modelsResult.value).some(
          (model) =>
            modelRecordProviderId(model)?.toLowerCase() === input.providerId.toLowerCase() &&
            modelRecordId(model, input.providerId)?.toLowerCase() ===
              canonicalModelId.toLowerCase(),
        );
        let providerRegistryPatch: Record<string, unknown> | undefined;
        if (input.enabled && !modelsListHasDefinition) {
          const pluginRecord = pluginModelRecord({
            discovery,
            providerId: input.providerId,
            modelId: canonicalModelId,
          });
          if (pluginRecord === null) {
            return err(
              provisioningError(
                "provisioning.connections.modelDefinitionUnavailable",
                "The model catalog did not provide the registry definition required to enable it.",
                { providerId: input.providerId, modelId: canonicalModelId },
              ),
            );
          }
          const existingProvider = configProviderEntry({ config, providerId: input.providerId });
          const existingModels = arrayValue(existingProvider?.value["models"]);
          const alreadyRegistered = existingModels.some((model) => {
            if (typeof model === "string") {
              return model.toLowerCase() === canonicalModelId.toLowerCase();
            }
            return (
              isRecord(model) &&
              modelRecordId(model, input.providerId)?.toLowerCase() ===
                canonicalModelId.toLowerCase()
            );
          });
          if (!alreadyRegistered) {
            const providerKey = existingProvider?.key ?? input.providerId;
            providerRegistryPatch = {
              [providerKey]: {
                ...(existingProvider === null && pluginRecord.provider.baseUrl !== undefined
                  ? { baseUrl: pluginRecord.provider.baseUrl }
                  : {}),
                ...(existingProvider === null && pluginRecord.provider.api !== undefined
                  ? { api: pluginRecord.provider.api }
                  : {}),
                models: [...existingModels, pluginRecord.model],
              },
            };
          }
        }

        const targetRef = existingEnabled?.key ?? canonicalRef;
        const patch = {
          agents: {
            defaults: {
              models: {
                [targetRef]: input.enabled ? {} : null,
              },
            },
          },
          ...(providerRegistryPatch === undefined
            ? {}
            : { models: { providers: providerRegistryPatch } }),
        };
        // Disabling deliberately leaves models.providers metadata in place: registry visibility is
        // not routability, which is controlled solely by agents.defaults.models.
        const patchParams = configPatchParams({ configGetPayload: configResult.value, patch });
        if (!patchParams.ok) {
          return err(patchParams.error);
        }
        const patchResult = await this.options.adminClient.request(
          "config.patch",
          patchParams.value,
          { requiredScope: "operator.admin" },
        );
        let patchOutcomeWasAmbiguous = false;
        if (!patchResult.ok) {
          if (staleConfigBaseHashError(patchResult.error)) {
            if (attempt < modelToggleMaxMutationAttempts) {
              continue;
            }
            return err(
              provisioningError(
                "provisioning.connections.configConflict",
                "Gateway config changed repeatedly while updating the model setting.",
                { providerId: input.providerId, modelId: canonicalModelId },
              ),
            );
          }
          if (!ambiguousConfigPatchOutcome(patchResult.error)) {
            return err(patchResult.error);
          }
          patchOutcomeWasAmbiguous = true;
          console.warn("connections.modelToggle.configPatch.ambiguous", {
            providerId: input.providerId,
            modelId: canonicalModelId,
            code: patchResult.error.code,
          });
        }

        // WALL-CLOCK deadline, not a sleep budget: the reads between retries (config.get +
        // modelStatus, up to 15s each against a restarting container) must count too, or the
        // op could keep verifying long after the BFF's request window aborted — committing a
        // toggle the browser was already told failed.
        const deadlineAt = Date.now() + modelToggleTransientMaxTotalWaitMs;
        const waitForTransient = async (delayMs: number): Promise<boolean> => {
          const boundedDelayMs = Math.max(0, Math.ceil(delayMs));
          if (Date.now() + boundedDelayMs > deadlineAt) {
            return false;
          }
          await sleep(boundedDelayMs);
          return true;
        };
        const gatewayReady = await this.waitForGatewayReady(waitForTransient);
        if (!gatewayReady) {
          return err(
            provisioningError(
              "provisioning.connections.modelTogglePostCheckUnavailable",
              "Gateway model setting could not be verified after the config reload.",
              {
                providerId: input.providerId,
                modelId: canonicalModelId,
                patchOutcomeWasAmbiguous,
              },
            ),
          );
        }
        const postCheck = await this.modelTogglePostCheck({
          providerId: input.providerId,
          modelId: canonicalModelId,
          enabled: input.enabled,
          registryDefWritten: providerRegistryPatch !== undefined,
          waitForTransient,
        });
        if (!postCheck.ok) {
          return err(postCheck.error);
        }
        // The returned row must reflect the POST-mutation gateway, not the pre-patch reads: the
        // catalog, allowed set, and runtime auth stores all just changed under this op's feet.
        // Past the deadline the refresh is skipped — the post-check already proved the mutation,
        // and one more read round-trip would spend the BFF window on cosmetics.
        const [refreshedModels, refreshedStatus] =
          Date.now() < deadlineAt
            ? await Promise.all([
                this.options.adminClient.request("models.list", { view: "all" }),
                this.options.gatewayRuntime?.modelStatus() ?? ok<unknown>(null),
              ])
            : [null, null];
        // Status fallback chain: fresh read → post-check read → PRE-mutation read. Never null when
        // an earlier read succeeded — a runtime-store-connected provider projected from config
        // alone would falsely flip its row to not_connected on a transient status failure.
        const fallbackStatus =
          postCheck.value.modelStatus ?? (modelStatusResult.ok ? modelStatusResult.value : null);
        return this.modelToggleConnectionState({
          providerId: input.providerId,
          config: postCheck.value.config,
          modelsPayload: refreshedModels?.ok === true ? refreshedModels.value : modelsResult.value,
          discovery,
          modelStatus:
            refreshedStatus?.ok === true && refreshedStatus.value !== null
              ? refreshedStatus.value
              : fallbackStatus,
          authStatus,
        });
      }

      return err(
        provisioningError(
          "provisioning.connections.configConflict",
          "Gateway config changed repeatedly while updating the model setting.",
        ),
      );
    } finally {
      this.releaseProviderWrite(guardKey);
    }
  }

  public async startModelProviderApiKeyConnect(
    input: ConnectModelProviderApiKeyInput,
  ): Promise<Result<ModelProviderApiKeyConnectStart>> {
    const result = await this.startModelProviderApiKeyConnectInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "provider_connected",
      transition: result.ok ? "requested" : "failed",
      targetKind: "model_provider",
      targetRef: input.providerId,
      result: result.ok ? "pending" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async startModelProviderApiKeyConnectInner(
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

    const busy = this.providerConnectInFlight(input.orgId, input.providerId);
    if (busy !== null) {
      return err(busy);
    }

    const opId = `model-api-key:${randomUUID()}`;
    const op: PendingModelProviderApiKeyConnect = {
      opId,
      orgId: input.orgId,
      principal: connectionPrincipal(input),
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
    const result = await this.startModelProviderSetupTokenFlowInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "provider_connected",
      transition: result.ok ? "requested" : "failed",
      targetKind: "model_provider",
      targetRef: input.providerId,
      result: result.ok ? "pending" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async startModelProviderSetupTokenFlowInner(
    input: StartModelProviderSetupTokenFlowInput,
  ): Promise<Result<SetupTokenFlowStart>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    // A setup-token completion funnels into the same credential write and the same #183 rollback as
    // an API-key connect, so it races an in-flight connect for the provider exactly as another
    // connect would.
    const busy = this.providerConnectInFlight(input.orgId, input.providerId);
    if (busy !== null) {
      return err(busy);
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
      principal: connectionPrincipal(input),
      providerId: input.providerId,
      authChoiceId: "setup-token",
      execId: login.value.execId,
      logPath: login.value.logPath,
      stdinPath: login.value.stdinPath,
      expiresAt: new Date(this.now().getTime() + modelSetupTokenFlowExpiresMs),
      timeout: setTimeout(() => {
        const current = this.modelSetupTokenFlows.get(flowId);
        // A completion that is still running owns this flow: it is writing, probing, and possibly
        // ROLLING BACK a credential (#183), which takes minutes. Reaping the flow underneath it
        // would throw away the outcome and show the operator "expired" in place of the loud
        // provider rejection they need to see. Let it finish and record its own verdict.
        if (current !== undefined && current.completionInFlight !== true) {
          void this.cleanupSetupTokenFlow(current).catch(() => undefined);
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
    // The deadline is for the OPERATOR's half of the flow — authorizing in the browser. Once a
    // completion is running, the flow is no longer waiting on anybody, and its credential write and
    // possible #183 rollback can legitimately outlast the window. Reporting "expired" here would
    // strand a credential mid-rollback and hide the reason the connect failed.
    if (this.now().getTime() >= flow.expiresAt.getTime() && flow.completionInFlight !== true) {
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
        principal: flow.principal,
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

  /**
   * The critical section. Everything inside writes, proves, or removes ONE provider's credential,
   * and two of them running at once for the same provider would fight over the same auth profile —
   * see {@link providerConnectInFlight}. The API-key start path already refuses to queue a second
   * one, but a setup-token completion arrives here on its own schedule, so the lock is taken HERE,
   * where the write actually happens, rather than only at the doors.
   */
  private async completeModelProviderApiKeyConnect(input: {
    readonly op: PendingModelProviderApiKeyConnect;
    readonly apiKey: string;
    readonly authChoice: ModelProviderAuthChoice;
    readonly authChoices: readonly GatewayRuntimeAuthChoice[];
  }): Promise<Result<ProviderConnectionState>> {
    const writeKey = configWriteKey(input.op.orgId);
    if (this.providerWriteReserved(writeKey)) {
      return err(providerConnectInFlightError(input.op.providerId));
    }

    this.acquireProviderWrite(writeKey);
    try {
      const result = await this.writeAndProveProviderCredential(input);
      // Terminal transition for the connect intent. This single point covers both the api-key
      // flow and the setup-token flow, which both funnel through this critical section.
      this.auditUserEvent({
        principal: input.op.principal,
        intent: "provider_connected",
        transition: result.ok ? "completed" : "failed",
        targetKind: "model_provider",
        targetRef: input.op.providerId,
        result: result.ok ? "success" : "failure",
        ...(result.ok ? {} : { resultCode: result.error.code }),
      });
      return result;
    } finally {
      this.releaseProviderWrite(writeKey);
    }
  }

  private async writeAndProveProviderCredential(input: {
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
    const resolvable = await this.assertProviderResolvableByAgents(input.op.providerId);
    if (!resolvable.ok) {
      return err(resolvable.error);
    }

    // Everything above proves the credential is STORED and ROUTABLE. None of it proves it WORKS —
    // a stored-but-401 key satisfies every one of those checks, which is how two providers were
    // connected with deliberately bogus keys and reported Connected (#183). Spend one real model
    // call finding out before telling the admin they are connected.
    const proven = await this.assertProviderCredentialAuthenticates({
      // The credential as the GATEWAY filed it — see StoredProviderCredential. Probing the ids we
      // sent instead would quietly probe nothing for any provider it canonicalizes.
      stored: shared.value,
      // Disconnect is keyed on the provider the operator actually connected, so a rollback uses
      // ours, not the gateway's canonical alias.
      providerId: input.op.providerId,
      principal: input.op.principal,
    });
    if (!proven.ok) {
      return err(proven.error);
    }

    // The onboard above may have moved `agents.defaults.model.primary` onto this provider. Bring the
    // orchestrator agent and the subagents with it, or the gateway routes on one provider while Ask
    // Admin still asks for another (#186).
    await this.reconcileOrchestratorAfterCredentialChange({
      reason: "connect",
      providerId: input.op.providerId,
      originatingPrincipal: input.op.principal,
      originatingIntent: "provider_connected",
    });

    return ok(connection.value);
  }

  /**
   * Proves the credential this connect just stored actually authenticates, and removes it if the
   * provider says no.
   *
   * Only an explicit authentication rejection fails the connect. A rate limit, a timeout, a
   * provider outage, or a probe we could not run at all leave the credential UNPROVEN, not invalid
   * — and an unproven credential is allowed through, loudly. That asymmetry is deliberate (#183):
   * wrongly rejecting a VALID credential would break every honest connect, which is a worse failure
   * than the one this guard exists to catch.
   */
  private async assertProviderCredentialAuthenticates(input: {
    readonly stored: StoredProviderCredential;
    readonly providerId: string;
    readonly principal: ConnectionProvisioningPrincipal;
  }): Promise<Result<void>> {
    const gatewayRuntime = this.options.gatewayRuntime;
    if (gatewayRuntime === undefined) {
      return err(gatewayRuntimeUnavailableError());
    }

    const profileId = input.stored.profileId;
    if (profileId === null) {
      // The gateway did not name the profile it wrote, so there is no way to probe THIS credential
      // rather than some other one the provider owns. Probing by provider alone could let a stale
      // profile reject a good new key, so do not probe at all.
      console.warn("connections.authProbe.unproven", {
        providerId: input.providerId,
        reason: "the gateway did not name the auth profile it wrote",
      });
      return ok(undefined);
    }

    const probe = await gatewayRuntime.probeProviderAuth({
      agentId: sharedCredentialAgentId,
      providerId: input.stored.providerId,
      profileId,
    });
    if (!probe.ok) {
      console.warn("connections.authProbe.unproven", {
        providerId: input.providerId,
        profileId,
        code: probe.error.code,
      });
      return ok(undefined);
    }

    if (probe.value.verdict !== "rejected") {
      console.info("connections.authProbe.result", {
        providerId: input.providerId,
        profileId,
        verdict: probe.value.verdict,
        reason: probe.value.reason,
      });
      return ok(undefined);
    }

    console.warn("connections.authProbe.rejected", {
      providerId: input.providerId,
      profileId,
      reason: probe.value.reason,
    });

    // The credential does not authenticate, so it must not survive the connect that submitted it.
    // `onboard` has already overwritten whatever was there before — it is the writer — so there is
    // no earlier credential left to restore, and "provider not connected" is the only honest end
    // state available.
    const removed = await this.disconnectModelProvider({
      ...input.principal,
      providerId: input.providerId,
    });
    if (!removed.ok) {
      console.error("connections.authProbe.rollbackFailed", {
        providerId: input.providerId,
        code: removed.error.code,
      });
      return err(
        provisioningError(
          "provisioning.connections.providerCredentialRejectedNotRemoved",
          `The provider rejected the credential (${probe.value.reason}), and Opzava could not remove it again. Disconnect ${input.providerId} before retrying.`,
          { providerId: input.providerId, rollbackCode: removed.error.code ?? null },
        ),
      );
    }

    // The rejected connect has already removed the bad credential. Re-election must remain
    // observable even though the connect operation reports the provider rejection first.
    void this.reconcileOrchestratorAfterCredentialChange({
      reason: "disconnect",
      providerId: input.providerId,
      originatingPrincipal: input.principal,
      originatingIntent: "provider_connected",
    });

    return err(
      provisioningError(
        "provisioning.connections.providerCredentialRejected",
        `The provider rejected the credential (${probe.value.reason}). It has not been kept, and ${input.providerId} is not connected.`,
        { providerId: input.providerId },
      ),
    );
  }

  /**
   * Places the SUBMITTED credential in the shared `main` store so every agent inherits it, and
   * resolves to the auth profile the gateway wrote.
   *
   * This write is unconditional. It used to be skipped when `main` could already resolve the
   * provider, on the reasoning that the credential must then be config-reachable (a genuine config
   * api-key like zai) and a second copy would only be one more thing to revoke. That reasoning
   * holds on a FIRST connect and breaks on a re-connect: on a key rotation, what `main` already
   * resolves is the OLD credential, so the skip left it there — the fleet kept using the previous
   * key while the UI reported the new one connected, and the #183 liveness probe below would have
   * dutifully proven a credential nobody submitted.
   *
   * Writing every time is safe because the gateway UPSERTS a deterministic profile id per provider
   * (`<provider>:manual`), so the write overwrites in place and cannot pile up duplicate copies —
   * and disconnect already fans `models.authLogout` out across `main`, so the copy is revoked.
   */
  /**
   * Is a credential write for this provider already running?
   *
   * Two overlapping writes for the same provider target the SAME deterministic auth profile, so
   * they cannot both win — and a REJECTED one now removes that profile (#183). Without this, a
   * bogus key submitted first could finish last and roll back the good key submitted second,
   * deleting a credential it never wrote: the guard against storing a bad credential would have
   * become a way to destroy a good one.
   *
   * Deliberately does NOT count a setup-token flow that is merely waiting for the operator to
   * authorize in their browser. That one has written nothing yet, and starting a fresh flow is
   * meant to supersede it (see `cleanupSetupTokenFlowsForProvider`).
   */
  private providerConnectInFlight(
    orgId: string,
    providerId: string,
    options: { readonly includeDeviceFlows?: boolean } = {},
  ): DomainError | null {
    const pendingConnect = [...this.modelApiKeyConnects.values()].some(
      (op) =>
        op.orgId.toLowerCase() === orgId.toLowerCase() &&
        op.providerId.toLowerCase() === providerId.toLowerCase() &&
        op.outcome === undefined,
    );
    const activeDeviceConnect =
      options.includeDeviceFlows !== false &&
      [...this.modelDeviceFlows.values()].some(
        (flow) =>
          flow.orgId.toLowerCase() === orgId.toLowerCase() &&
          flow.providerId.toLowerCase() === providerId.toLowerCase(),
      );
    if (
      !pendingConnect &&
      !activeDeviceConnect &&
      !this.providerWriteReserved(configWriteKey(orgId))
    ) {
      return null;
    }

    return providerConnectInFlightError(providerId);
  }

  private async storeSharedProviderCredential(input: {
    readonly providerId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<StoredProviderCredential>> {
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

    return ok({
      profileId: written.value.profileId,
      // The gateway's own id for the provider, not ours. It canonicalizes some on the way in
      // (`codex` -> `openai`), and a probe addressed to the id we sent would find nothing.
      providerId: written.value.providerId ?? input.providerId,
    });
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
    const result = await this.startModelProviderDeviceFlowInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "provider_connected",
      transition: result.ok ? "requested" : "failed",
      targetKind: "model_provider",
      targetRef: input.providerId,
      result: result.ok ? "pending" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async startModelProviderDeviceFlowInner(
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

    const busy = this.providerConnectInFlight(input.orgId, input.providerId, {
      includeDeviceFlows: false,
    });
    if (busy !== null) {
      return err(busy);
    }
    const reservationKey = configWriteKey(input.orgId);
    this.acquireProviderWrite(reservationKey);

    try {
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
        actorUserId: input.actorUserId,
        providerId: input.providerId,
        authChoiceId: input.authChoiceId,
        expiresAt: new Date(this.now().getTime() + modelDeviceFlowExpiresMs),
        intervalSeconds: modelDeviceFlowPollIntervalSeconds,
        execId: login.value.execId,
        logPath: login.value.logPath,
        generation: randomUUID(),
        lifecycle: "active",
        timeout: setTimeout(() => {
          const flow = this.modelDeviceFlows.get(flowId);
          if (flow !== undefined) {
            void this.cleanupModelProviderFlow(flow).catch(() => {
              // A failed verified stop stays mapped and retryable. The public poll/cancel path will
              // surface a redacted failure; the timeout must not create an unhandled rejection.
            });
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
        if (!this.isCurrentActiveModelFlow(baseFlow)) {
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
          if (!this.isCurrentActiveModelFlow(baseFlow)) {
            return err(
              provisioningError(
                "provisioning.connections.deviceFlowCancelled",
                "Device-code sign-in was cancelled before it completed.",
                { providerId: input.providerId, authChoiceId: input.authChoiceId },
              ),
            );
          }
          this.modelDeviceFlows.set(flow.flowId, flow);
          return ok(this.challengeFromModelFlow(flow));
        }

        await sleep(modelDeviceFlowStartPollDelayMs);
      }

      if (!this.isCurrentActiveModelFlow(baseFlow)) {
        return err(
          provisioningError(
            "provisioning.connections.deviceFlowCancelled",
            "Device-code sign-in was cancelled before it completed.",
            { providerId: input.providerId, authChoiceId: input.authChoiceId },
          ),
        );
      }
      return ok(this.challengeFromModelFlow(baseFlow));
    } finally {
      this.releaseProviderWrite(reservationKey);
    }
  }

  public async pollDeviceFlow(
    input: { readonly flowId: string } & ConnectionProvisioningPrincipal,
  ): Promise<Result<DeviceFlowPollState>> {
    const githubFlow = this.githubFlows.get(input.flowId);
    if (githubFlow !== undefined) {
      if (
        githubFlow.principal.orgId !== input.orgId ||
        githubFlow.principal.actorUserId !== input.actorUserId
      ) {
        return ok({ status: "expired", message: "Device sign-in not found." });
      }
      const result = await this.pollGitHubFlow(githubFlow);
      this.auditDeviceFlowTerminal(input, "github_connected", this.options.githubRepository, result);
      return result;
    }

    const modelFlow = this.modelDeviceFlows.get(input.flowId);
    if (modelFlow !== undefined) {
      const result = await this.pollModelProviderFlow(input, modelFlow);
      this.auditDeviceFlowTerminal(input, "provider_connected", modelFlow.providerId, result);
      return result;
    }

    if (input.flowId.startsWith("model:")) {
      return ok({ status: "expired", message: "Device sign-in not found." });
    }

    return input.flowId.startsWith("github:")
      ? ok({ status: "expired", message: "Device sign-in not found." })
      : ok({
          status: "failed",
          message: "Device flow is not known or has already completed.",
        });
  }

  /**
   * Records the terminal transition of a device flow (provider or GitHub) only when the poll
   * resolves to connected/failed/expired — pending ticks emit nothing (#192: audit the intent's
   * terminal state, not the polling ticks).
   */
  private auditDeviceFlowTerminal(
    principal: ConnectionProvisioningPrincipal,
    intent: AuditIntent,
    targetRef: string,
    result: Result<DeviceFlowPollState>,
  ): void {
    if (!result.ok) {
      this.auditUserEvent({
        principal,
        intent,
        transition: "failed",
        targetKind: intent === "github_connected" ? "github_connection" : "model_provider",
        targetRef,
        result: "failure",
        resultCode: result.error.code,
      });
      return;
    }
    const status = result.value.status;
    if (status === "connected") {
      this.auditUserEvent({
        principal,
        intent,
        transition: "completed",
        targetKind: intent === "github_connected" ? "github_connection" : "model_provider",
        targetRef,
        result: "success",
      });
    } else if (status === "failed" || status === "expired") {
      this.auditUserEvent({
        principal,
        intent,
        transition: "failed",
        targetKind: intent === "github_connected" ? "github_connection" : "model_provider",
        targetRef,
        result: "failure",
        ...(typeof result.value.message === "string"
          ? { resultMessage: result.value.message }
          : {}),
      });
    }
    // "pending" is a polling tick — intentionally not audited.
  }

  public async cancelModelProviderDeviceFlow(
    input: { readonly flowId: string } & ConnectionProvisioningPrincipal,
  ): Promise<Result<DeviceFlowCancelState>> {
    const result = await this.cancelModelProviderDeviceFlowInner(input);
    // Only a real cancellation is a governance mutation; an unknown/invalid flow id changed nothing.
    if (result.ok && result.value.status === "cancelled") {
      this.auditUserEvent({
        principal: input,
        intent: "provider_connected",
        transition: "cancelled",
        targetKind: "model_provider",
        targetRef: input.flowId,
        result: "success",
      });
    }
    return result;
  }

  private async cancelModelProviderDeviceFlowInner(
    input: { readonly flowId: string } & ConnectionProvisioningPrincipal,
  ): Promise<Result<DeviceFlowCancelState>> {
    if (!modelDeviceFlowIdPattern.test(input.flowId)) {
      return err(
        provisioningError(
          "provisioning.connections.invalidDeviceFlowId",
          "The model-provider device flow id is invalid.",
        ),
      );
    }

    const flow = this.modelDeviceFlows.get(input.flowId);
    // Unknown and cross-tenant ids are deliberately indistinguishable and mutation-free.
    if (
      flow === undefined ||
      flow.orgId !== input.orgId ||
      flow.actorUserId !== input.actorUserId
    ) {
      return ok({ status: "not_found", message: "Device sign-in was already finished." });
    }

    const existing = this.modelDeviceFlowCancellations.get(input.flowId);
    if (existing !== undefined) {
      return existing;
    }

    const cancellation = (async (): Promise<Result<DeviceFlowCancelState>> => {
      try {
        await this.cleanupModelProviderFlow(flow);
        return ok({ status: "cancelled", message: "Device sign-in cancelled." });
      } catch {
        return err(
          provisioningError(
            "provisioning.connections.deviceFlowCancellationFailed",
            "Could not confirm that device sign-in stopped. Try again.",
          ),
        );
      }
    })();
    this.modelDeviceFlowCancellations.set(input.flowId, cancellation);
    try {
      return await cancellation;
    } finally {
      if (this.modelDeviceFlowCancellations.get(input.flowId) === cancellation) {
        this.modelDeviceFlowCancellations.delete(input.flowId);
      }
    }
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
    const result = await this.startModelProviderDisconnectInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "provider_disconnected",
      transition: result.ok ? "requested" : "failed",
      targetKind: "model_provider",
      targetRef: input.providerId,
      result: result.ok ? "pending" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async startModelProviderDisconnectInner(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ModelProviderDisconnectStart>> {
    // A credential write in flight is already mutating this provider's auth stores, and a #183
    // rollback inside one is itself a disconnect. Letting a second, operator-initiated disconnect
    // interleave with that makes the outcome last-writer-wins, which can land opposite to what the
    // operator is watching. The write always finishes in bounded time; make the disconnect wait for
    // it rather than fight it. (The rollback calls `disconnectModelProvider` directly and so does
    // not gate itself here.)
    const busy = this.providerConnectInFlight(input.orgId, input.providerId);
    if (busy !== null) {
      return err(busy);
    }

    const writeKey = configWriteKey(input.orgId);
    this.acquireProviderWrite(writeKey);
    const opId = `model-disconnect:${randomUUID()}`;
    const op: PendingModelProviderDisconnect = {
      opId,
      orgId: input.orgId,
      providerId: input.providerId,
      actorUserId: input.actorUserId,
      startedAt: this.now(),
      expiresAt: new Date(this.now().getTime() + modelProviderDisconnectExpiresMs),
      timeout: setTimeout(() => {
        this.modelProviderDisconnects.delete(opId);
      }, modelProviderDisconnectExpiresMs),
    };
    this.modelProviderDisconnects.set(opId, op);
    void this.runModelProviderDisconnect({ op, input, writeKey });

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
    readonly writeKey: string;
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
      if (result.ok) {
        // The browser may consume and delete the terminal op immediately. Snapshot state owns the
        // slower re-election phase, so publish the disconnect before starting that continuation.
        void this.reconcileOrchestratorAfterCredentialChange({
          reason: "disconnect",
          providerId: op.providerId,
          originatingPrincipal: {
            orgId: op.orgId,
            workspaceId: input.input.workspaceId,
            actorUserId: op.actorUserId,
            roleKeys: input.input.roleKeys,
          },
          originatingIntent: "provider_disconnected",
        });
      }
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
    } finally {
      this.releaseProviderWrite(input.writeKey);
    }
  }

  public async disconnectModelProvider(
    input: DisconnectModelProviderInput,
  ): Promise<Result<ProviderConnectionState>> {
    const result = await this.disconnectModelProviderInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "provider_disconnected",
      transition: result.ok ? "completed" : "failed",
      targetKind: "model_provider",
      targetRef: input.providerId,
      result: result.ok ? "success" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async disconnectModelProviderInner(
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
    // A provider with no credential must have no routable models. Revoke both in one patch because
    // the gateway caps control-plane writes at 3/60s and a second write could interleave with connect.
    const prunedModelKeys = enabledDefaultModelEntries(config)
      .filter((entry) => modelRefMatchesProvider(entry.key, input.providerId))
      .map((entry) => entry.key);
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
    const profileOwners = profileOwnersForDisconnect(
      config,
      profileIds,
      ownership,
      input.providerId,
    );
    const siblingProfileIdsByProvider = new Map<string, string[]>();
    for (const [profileId, ownerId] of profileOwners) {
      // The Gateway resolves auth aliases before removing profiles. A profile whose raw owner is an
      // alias of the requested provider is therefore covered by the primary provider-wide logout,
      // not a distinct sibling that needs another rate-limited control-plane write.
      const canonicalOwnerId = canonicalProviderIdentity(ownerId);
      if (providerIdentitiesMatch(canonicalOwnerId, input.providerId)) {
        continue;
      }
      siblingProfileIdsByProvider.set(canonicalOwnerId, [
        ...(siblingProfileIdsByProvider.get(canonicalOwnerId) ?? []),
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
    const disconnectedOrderEntries = providerIdentityEntries(authOrder(config), input.providerId);
    const nextAuthOrder = new Map<string, readonly string[] | null>([[input.providerId, []]]);
    for (const [providerId] of [
      ...disconnectedOrderEntries.exact,
      ...disconnectedOrderEntries.aliases,
    ]) {
      if (providerId !== input.providerId) {
        nextAuthOrder.set(providerId, null);
      }
    }
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

    if (profileIds.length > 0 || orderHasProviderEntries || prunedModelKeys.length > 0) {
      const patchParams = configPatchParams({
        configGetPayload: configResult.value,
        patch: {
          auth: {
            profiles: Object.fromEntries(profileIds.map((id) => [id, null])),
            order: Object.fromEntries(nextAuthOrder),
          },
          ...(prunedModelKeys.length === 0
            ? {}
            : {
                agents: {
                  defaults: {
                    models: Object.fromEntries(prunedModelKeys.map((key) => [key, null])),
                  },
                },
              }),
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

      // #196: revoking a disconnected provider's routable models is its own governance fact
      // (the routable allow-list changed). Record it with the surviving projection and an honest
      // `unknown` result when the patch was closed-before-response — the state-transition model,
      // not a falsified outcome (#192 comment 4).
      if (prunedModelKeys.length > 0) {
        this.auditUserEvent({
          principal: input,
          intent: "gateway_config_pruned",
          transition: "completed",
          targetKind: "gateway_config",
          targetRef: input.providerId,
          result: result.closedBeforeResponse ? "unknown" : "success",
          configSnapshot: this.routingSnapshot("gateway_config", input.providerId, {
            providerId: input.providerId,
            prunedRoutableModels: prunedModelKeys,
          }),
        });
      }

      // Removing an auth profile makes the gateway reload, and it drops the operator WS before
      // answering the RPC. Anything read from a half-restarted gateway is not evidence: models
      // .authStatus / models.status still report the credential that is already gone, which
      // fail-closed the post-check and told the operator their disconnect had failed when it had
      // succeeded (#172). Wait for the gateway to answer again before believing anything it says.
      const gatewayReady = await this.waitForGatewayReady(waitForDisconnectTransient);
      if (!gatewayReady) {
        console.warn("connections.modelProviderDisconnect.failClosed", {
          providerId: input.providerId,
          reason: "gatewayNotReadyAfterConfigPatch",
        });
        return err(
          provisioningError(
            "provisioning.connections.providerPostCheckUnavailable",
            "Gateway provider credential post-check failed.",
            { providerId: input.providerId },
          ),
        );
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

    const disconnectGatewayRuntime = this.options.gatewayRuntime;
    const readCredentialState = async (): Promise<
      Result<{
        readonly lingering: ReturnType<typeof providerStillHasCredentials>;
        readonly refreshedConfig: Record<string, unknown>;
      }>
    > => {
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
      return ok({
        lingering: providerStillHasCredentials({
          providerIds: [input.providerId],
          profileIds,
          authStatus: refreshedAuth.value,
          config: refreshedConfig,
          modelStatus: refreshedModelStatus?.value ?? null,
        }),
        refreshedConfig,
      });
    };

    let credentialState = await readCredentialState();
    if (!credentialState.ok) {
      return err(credentialState.error);
    }
    // `config.auth.profiles` is the durable store: if the credential is THERE, it survived, full
    // stop. models.authStatus and models.status are live reads of a gateway that has just reloaded,
    // so on their own they may simply be stale -- and #172 was exactly that: a disconnect that had
    // already succeeded, failed because two status reads had not caught up. Let them converge on the
    // durable store before ruling. A credential that really did survive never converges, so it still
    // fails closed; it just takes a few seconds longer to say so.
    for (
      let attempt = 1;
      attempt < disconnectStaleStatusMaxAttempts &&
      credentialState.ok &&
      credentialState.value.lingering.stores.length > 0 &&
      !credentialState.value.lingering.stores.includes(durableCredentialStore) &&
      (await waitForDisconnectTransient(disconnectPostCheckRetryDelayMs));
      attempt += 1
    ) {
      console.info("connections.modelProviderDisconnect.postCheck.staleStatusRetry", {
        providerId: input.providerId,
        attempt,
        credentialStores: credentialState.value.lingering.stores,
      });
      credentialState = await readCredentialState();
    }
    if (!credentialState.ok) {
      return err(credentialState.error);
    }

    const { lingering, refreshedConfig } = credentialState.value;
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

    // The models patch is an ambiguous write we deliberately do not retry. Proving the credential
    // is gone is not enough when an uncommitted patch leaves its unauthenticated routes advertised.
    const lingeringModelKeys = enabledDefaultModelEntries(refreshedConfig)
      .filter((entry) => modelRefMatchesProvider(entry.key, input.providerId))
      .map((entry) => entry.key);
    if (lingeringModelKeys.length > 0) {
      console.warn("connections.modelProviderDisconnect.failClosed", {
        providerId: input.providerId,
        reason: "routableModelsSurvived",
        lingeringModelKeys,
      });
      return err(
        provisioningError(
          "provisioning.connections.providerModelsStillRoutable",
          "Disconnect incomplete: the Gateway still routes to this provider's models.",
          { providerId: input.providerId, lingeringModelKeys },
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
    const result = await this.applyOrchestratorDelegationInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "orchestrator_delegation_applied",
      transition: result.ok ? "completed" : "failed",
      targetKind: "orchestrator",
      targetRef: "orchestrator",
      result: result.ok ? "success" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
      ...(result.ok
        ? {
            configSnapshot: this.routingSnapshot("orchestrator", "orchestrator", {
              allowAgents: result.value.allowAgents,
              subagents: result.value.subagents.map((sub) => ({
                agentId: sub.agentId,
                providerId: sub.providerId,
                model: sub.model,
              })),
            }),
          }
        : {}),
    });
    return result;
  }

  private async applyOrchestratorDelegationInner(
    input: ApplyOrchestratorDelegationInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const writeKey = configWriteKey(input.orgId);
    if (this.providerWriteReserved(writeKey)) {
      return err(providerConnectInFlightError("gateway config"));
    }
    this.acquireProviderWrite(writeKey);
    try {
      const reconciled = await this.reconcileOrchestrator({
        connectedProviderIds: input.connectedProviderIds,
      });
      if (reconciled.ok) {
        this.orchestratorReconcileState = { status: "idle" };
      }
      return reconciled;
    } finally {
      this.releaseProviderWrite(writeKey);
    }
  }

  /** Internal fail-closed startup repair; never exposed through the tenant-facing HTTP surface. */
  public async reconcileStartupOrchestrator(): Promise<Result<void>> {
    const reconciled = await this.reconcileOrchestrator({ strict: true });
    if (!reconciled.ok) {
      return err(reconciled.error);
    }
    const state = reconciled.value;
    if (state.orchestratorModel === null || state.orchestratorProviderId === null) {
      return err(
        provisioningError(
          "provisioning.connections.startupOrchestratorUnresolved",
          "Ask Admin startup has no connected, routable orchestrator model.",
        ),
      );
    }

    // config.patch reloads the Gateway and drops the socket. This read therefore doubles as the
    // reconnect boundary; the admin client retries idempotent config.get on a fresh socket.
    const verified = await this.options.adminClient.request("config.get", {});
    if (!verified.ok) {
      return err(verified.error);
    }
    const config = configPayload(verified.value);
    if (
      !orchestratorConfigIsCurrent({
        config,
        orchestratorModel: state.orchestratorModel,
        primaryModel: gatewayPrimaryModel(config),
        subagents: state.subagents,
      })
    ) {
      return err(
        provisioningError(
          "provisioning.connections.startupOrchestratorVerifyFailed",
          "Ask Admin startup config did not match the canonical owned fields after reload.",
        ),
      );
    }
    return ok(undefined);
  }

  /**
   * Rebuild the orchestrator wiring from the CONNECTED set: which provider Ask Admin routes to, and
   * one subagent per other connected provider.
   *
   * This must run after every credential change, because a credential change silently moves half the
   * orchestrator on its own. OpenClaw's `onboard` rewrites `agents.defaults.model.primary` when a
   * provider connects -- observed live in the gateway's reload log:
   *
   *   [reload] config change detected (agents.defaults.model.primary, auth.profiles.anthropic:default)
   *
   * Nothing reconciled the other half, so the primary pointed at the newly connected provider while
   * the ask-admin agent still carried the model of the OLD one. Connect Anthropic on a stack whose
   * OpenAI was disconnected and Ask Admin died outright ("Codex app-server auth profile was not
   * found") while the UI cheerfully labelled Anthropic the main orchestrator -- and the only action
   * that would have repaired it was hidden precisely BECAUSE the row already claimed to be the lead
   * (#186).
   *
   * The Ask Admin model is the operator's selection and remains authoritative while its provider
   * holds a credential. `onboard` may rewrite the gateway primary during any later connect, so
   * trusting that primary would silently undo a deliberate model choice. When the selected
   * credential is gone, the connected catalog supplies a deterministic fallback and the gateway is
   * never left routing to a credential we just removed.
   */
  private async reconcileOrchestrator(
    input: {
      readonly connectedProviderIds?: readonly string[];
      /** Startup cannot fall back around malformed discovery or an unresolved route. */
      readonly strict?: boolean;
      /**
       * Repair only an orchestrator that already exists. PROVISIONING one is bootstrap's job
       * (`bootstrap-platform-gateway`), not a side effect of connecting a credential -- a gateway
       * with no ask-admin agent is not a gateway whose orchestrator drifted, and writing one from
       * here would mean every connect and disconnect patched (and therefore RELOADED) a gateway
       * that never asked for an orchestrator.
       */
      readonly repairOnly?: boolean;
    } = {},
  ): Promise<Result<OrchestratorDelegationState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }
    const config = configPayload(configResult.value);

    // Decide this BEFORE the catalog/status reads: a gateway with no orchestrator has nothing to
    // reconcile, and a connect should not pay for three more gateway reads (one of them a CLI exec)
    // just to discover that.
    if (
      input.repairOnly === true &&
      !agentsList(config).some((agent) => stringValue(agent["id"]) === ASK_ADMIN_AGENT_ID)
    ) {
      return ok(
        orchestratorDelegationState({
          orchestratorModel: null,
          orchestratorProviderId: null,
          subagents: [],
          now: this.now(),
        }),
      );
    }

    const [modelsResult, discoveryResult, modelStatusResult, authStatus] = await Promise.all([
      this.options.adminClient.request("models.list", { view: "all" }),
      this.options.gatewayRuntime?.readPluginModelDiscovery() ??
        ok<PluginModelCatalogDiscovery>({ catalogs: [], plugins: [] }),
      this.options.gatewayRuntime?.modelStatus() ?? ok<unknown>(null),
      this.modelAuthStatus(),
    ]);
    if (input.strict === true) {
      if (!modelsResult.ok) {
        return err(modelsResult.error);
      }
      if (!discoveryResult.ok) {
        return err(discoveryResult.error);
      }
      if (!modelStatusResult.ok) {
        return err(modelStatusResult.error);
      }
    }
    const discovery = discoveryResult.ok ? discoveryResult.value : null;
    const catalog = providerCatalogFromModels(
      modelsResult.ok ? modelsResult.value : {},
      config,
      discovery,
    );
    const providerConnections = catalog.map((provider) =>
      providerConnectionFromConnectionSources({
        provider,
        config,
        modelStatus: modelStatusResult.ok ? modelStatusResult.value : null,
        authStatus,
        now: this.now(),
      }),
    );
    // Caller-supplied ids win (the explicit apply passes the set it saw), but the post-credential
    // reconcile has no caller to ask, so it reads the connected set from the gateway itself.
    const connectedProviders = new Set(
      input.connectedProviderIds ??
        providerConnections
          .filter((connection) => connection.status === "connected")
          .map((connection) => connection.providerId),
    );

    const primaryModel = gatewayPrimaryModel(config);
    const askAdmin = agentsList(config).find(
      (agent) => stringValue(agent["id"]) === ASK_ADMIN_AGENT_ID,
    );
    const operatorSelectedModel = modelSelectorPrimary(askAdmin?.["model"]);
    const operatorSelectedProviderId = connectedProviderIdForModel({
      model: operatorSelectedModel,
      providerConnections,
    });
    const operatorSelectionIsConnected =
      operatorSelectedProviderId !== null && connectedProviders.has(operatorSelectedProviderId);
    // With no operator selection the gateway's own primary still stands: `onboard` sets it, and
    // overriding it with "whatever provider sorts first" would silently re-route a tenant that never
    // asked for it. The selection only OUTRANKS it — it does not replace it as the fallback.
    const primaryProviderId = connectedProviderIdForModel({
      model: primaryModel,
      providerConnections,
    });
    const primaryIsConnected =
      primaryProviderId !== null && connectedProviders.has(primaryProviderId);
    // Catalog order, not Set order: the last-resort fallback must be deterministic.
    const fallbackProviderId =
      providerConnections.find(
        (connection) =>
          connection.status === "connected" && connectedProviders.has(connection.providerId),
      )?.providerId ?? null;

    const orchestratorProviderId = operatorSelectionIsConnected
      ? operatorSelectedProviderId
      : primaryIsConnected
        ? primaryProviderId
        : fallbackProviderId;
    const orchestratorModel =
      operatorSelectionIsConnected && operatorSelectedModel !== null
        ? operatorSelectedModel
        : primaryIsConnected && primaryModel !== null
          ? primaryModel
          : orchestratorModelForProvider({ providerId: orchestratorProviderId, catalog, config });

    // With no connected provider there is no valid orchestrator model. Preserve the gateway's own
    // stale/default config rather than inventing a credential-backed route that does not exist.
    if (orchestratorModel === null || orchestratorProviderId === null) {
      if (input.strict === true) {
        return err(
          provisioningError(
            "provisioning.connections.startupOrchestratorUnresolved",
            "Ask Admin startup has no connected, routable orchestrator model.",
          ),
        );
      }
      return ok(
        orchestratorDelegationState({
          orchestratorModel: null,
          orchestratorProviderId: null,
          subagents: [],
          now: this.now(),
        }),
      );
    }

    const subagents = connectedProviderSubagents({
      catalog,
      providerConnections,
      connectedProviderIds: connectedProviders,
      orchestratorProviderId,
    });
    const agentConfigResult = buildOrchestratorAgentConfig({
      subagents,
      orchestratorModel,
    });
    if (!agentConfigResult.ok) {
      return err(agentConfigResult.error);
    }
    const agentConfig = agentConfigResult.value;
    const orchestratorCatalogModel = catalog
      .find((provider) => provider.id === orchestratorProviderId)
      ?.catalogModels?.find(
        (model) =>
          providerModelRef(orchestratorProviderId, model.id).toLowerCase() ===
          orchestratorModel.toLowerCase(),
      );
    const providerRegistryPatch =
      orchestratorCatalogModel === undefined
        ? ok<Record<string, unknown> | null>(null)
        : providerRegistryPatchForModel({
            config,
            modelsPayload: modelsResult.ok ? modelsResult.value : {},
            discovery,
            providerId: orchestratorProviderId,
            modelId: orchestratorCatalogModel.id,
          });
    if (!providerRegistryPatch.ok) {
      return err(providerRegistryPatch.error);
    }
    const existingAgents = agentsList(config).filter((agent) => {
      const id = stringValue(agent["id"]);
      return id !== ASK_ADMIN_AGENT_ID && id?.startsWith("subagent-") !== true;
    });

    // Every config.patch RELOADS the gateway and drops the operator socket (the restart window that
    // #172 is about). A reconcile that runs after every credential change must therefore be silent
    // when it has nothing to say, or it doubles the reloads and re-opens that race for no reason.
    const state = orchestratorDelegationState({
      orchestratorModel,
      orchestratorProviderId,
      subagents,
      now: this.now(),
    });
    if (
      orchestratorConfigIsCurrent({
        config,
        orchestratorModel,
        primaryModel,
        subagents,
      })
    ) {
      return ok(state);
    }

    // The rebuilt list can be SHORTER than the live one (a disconnect drops a subagent), and the
    // gateway rejects a patch that removes array entries unless the path is declared a replacement.
    const patchParams = configPatchParams({
      configGetPayload: configResult.value,
      patch: {
        agents: {
          defaults: {
            ...(orchestratorModel === primaryModel
              ? {}
              : { model: { primary: orchestratorModel } }),
            models: { [orchestratorModel]: {} },
          },
          list: [...existingAgents, ...agentConfig.agents.list],
        },
        ...(providerRegistryPatch.value === null
          ? {}
          : { models: { providers: providerRegistryPatch.value } }),
      },
      replacePaths: canonicalAgentListReplacePaths,
    });
    if (!patchParams.ok) {
      return err(patchParams.error);
    }

    const result = await this.patchOrchestratorConfig(patchParams.value);
    if (!result.ok) {
      return err(result.error);
    }

    return ok(state);
  }

  /**
   * The reconcile's own config.patch, with the gateway's write rate limit waited out.
   *
   * A disconnect issues its profile-removing patch and a paced `models.authLogout` per agent, which
   * exhausts the gateway's control-plane write budget. The reconcile's patch then lands on
   * "rate limit exceeded for config.patch; retry after 36s" and, on the first cut of this fix, was
   * simply dropped -- leaving Ask Admin routed at the provider the operator had just disconnected.
   * The gateway tells us exactly how long to wait; wait.
   */
  private async patchOrchestratorConfig(params: Record<string, unknown>): Promise<Result<unknown>> {
    let waitedMs = 0;

    for (let attempt = 1; ; attempt += 1) {
      const result = await this.options.adminClient.request("config.patch", params, {
        requiredScope: "operator.admin",
      });
      if (result.ok) {
        return result;
      }

      const retryAfterMs = rateLimitRetryAfterMs(result.error, "config.patch");
      const delayMs =
        retryAfterMs === null ? null : retryAfterMs + orchestratorReconcileRateLimitMarginMs;
      if (
        delayMs === null ||
        attempt >= orchestratorReconcileMaxAttempts ||
        waitedMs + delayMs > orchestratorReconcileMaxWaitMs
      ) {
        return result;
      }

      console.info("connections.orchestrator.reconcileRateLimited", { attempt, delayMs });
      waitedMs += delayMs;
      await sleep(delayMs);
    }
  }

  /**
   * Reconcile after a credential change, without failing the change itself.
   *
   * The connect or disconnect already succeeded against the gateway; a reconcile that cannot run
   * must not retroactively report that as a failure. The snapshot retains the failure because the
   * consequence is real: the orchestrator can be left pointing at a credential that no longer
   * exists.
   */
  private reconcileOrchestratorAfterCredentialChange(context: {
    readonly reason: "disconnect" | "connect";
    readonly providerId: string;
    /**
     * The tenant principal whose credential change necessitated this fire-and-forget system
     * re-election, plus the intent that caused it. Carried so the compliance audit records
     * actor=system with a `trigger` linking the originating human — literal truth (the system
     * executed the re-election) without falsely attributing the routing change to that human
     * (#192 comment 2).
     */
    readonly originatingPrincipal?: ConnectionProvisioningPrincipal;
    readonly originatingIntent?: AuditIntent;
  }): Promise<void> {
    const tracked = { ...context, startedAt: this.now().toISOString() };
    this.orchestratorReconcileQueued += 1;
    if (
      this.orchestratorReconcileQueued === 1 &&
      this.orchestratorReconcileState.status !== "failed"
    ) {
      this.orchestratorReconcileState = { status: "running", ...tracked };
    }

    const auditReconcile = (outcome: "completed" | "failed", result: AuditResult): void => {
      const principal = context.originatingPrincipal;
      const intent = context.originatingIntent;
      // A system re-election with no tenant principal (e.g. a future platform-initiated path)
      // cannot form a tenant-scoped audit row; only the tenant-attributed path is auditable here.
      if (principal === undefined || intent === undefined) {
        return;
      }
      this.auditSystemEvent({
        organizationId: principal.orgId,
        intent: "orchestrator_reconciled",
        transition: outcome,
        targetKind: "orchestrator",
        targetRef: "orchestrator",
        result,
        triggeredByActorId: principal.actorUserId,
        triggeredByAction: intent,
      });
    };

    const continuation = this.orchestratorReconcileTail.then(async () => {
      // A recorded failure is a safety warning, not transient progress copy. Keep it visible while
      // a later repair runs and clear it only once that reconcile has actually succeeded.
      if (this.orchestratorReconcileState.status !== "failed") {
        this.orchestratorReconcileState = { status: "running", ...tracked };
      }
      try {
        const reconciled = await this.reconcileOrchestrator({ repairOnly: true });
        if (!reconciled.ok) {
          const failure = redactedDomainError(reconciled.error);
          console.warn("connections.orchestrator.reconcileFailed", {
            reason: context.reason,
            providerId: context.providerId,
            code: failure.code,
          });
          this.orchestratorReconcileState = {
            status: "failed",
            ...tracked,
            message: failure.message,
          };
          auditReconcile("failed", "failure");
          return;
        }

        console.info("connections.orchestrator.reconciled", {
          reason: context.reason,
          providerId: context.providerId,
          orchestratorProviderId: reconciled.value.orchestratorProviderId,
          orchestratorModel: reconciled.value.orchestratorModel,
          subagents: reconciled.value.allowAgents,
        });
        this.orchestratorReconcileState = { status: "idle" };
        auditReconcile("completed", "success");
      } catch {
        console.error("connections.orchestrator.reconcileFailed", {
          reason: context.reason,
          providerId: context.providerId,
          code: "provisioning.connections.orchestratorReconcileFailed",
        });
        this.orchestratorReconcileState = {
          status: "failed",
          ...tracked,
          message: "Orchestrator re-election failed unexpectedly in the provisioning worker.",
        };
        auditReconcile("failed", "failure");
      } finally {
        this.orchestratorReconcileQueued -= 1;
      }
    });
    this.orchestratorReconcileTail = continuation;
    return continuation;
  }

  public async setMainOrchestrator(
    input: SetMainOrchestratorInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const result = await this.setMainOrchestratorInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "orchestrator_set",
      transition: result.ok ? "completed" : "failed",
      targetKind: "orchestrator",
      targetRef: input.providerId,
      result: result.ok ? "success" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
      ...(result.ok
        ? {
            configSnapshot: this.routingSnapshot("orchestrator", input.providerId, {
              orchestratorProviderId: result.value.orchestratorProviderId,
              orchestratorModel: result.value.orchestratorModel,
              allowAgents: result.value.allowAgents,
            }),
          }
        : {}),
    });
    return result;
  }

  private async setMainOrchestratorInner(
    input: SetMainOrchestratorInput,
  ): Promise<Result<OrchestratorDelegationState>> {
    const configResult = await this.options.adminClient.request("config.get", {});
    if (!configResult.ok) {
      return err(configResult.error);
    }

    const [modelsResult, modelStatusResult, authStatus] = await Promise.all([
      this.options.adminClient.request("models.list", { view: "all" }),
      this.options.gatewayRuntime?.modelStatus() ?? ok<unknown>(null),
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
    // The operator's choice wins over the derived default, but only after the gateway's own catalog
    // vouches for it: a model id we cannot see in the catalog is refused rather than written blindly,
    // because electing a model the provider cannot serve would route the orchestrator into a wall.
    const electedModel = input.model?.trim();
    if (electedModel !== undefined && electedModel !== "") {
      const known = (provider?.catalogModels ?? provider?.models ?? []).some(
        (model) =>
          model.id.trim().toLowerCase() === electedModel.toLowerCase() ||
          providerModelRef(input.providerId, model.id).toLowerCase() === electedModel.toLowerCase(),
      );
      if (!known) {
        return err(
          provisioningError(
            "provisioning.connections.orchestratorModelUnknown",
            "The selected model is not in this provider's catalog.",
            { providerId: input.providerId, model: electedModel },
          ),
        );
      }
    }
    const derivedModel =
      configuredModel === null
        ? provider?.suggestedModel === undefined
          ? null
          : providerModelRef(input.providerId, provider.suggestedModel)
        : providerModelRef(input.providerId, configuredModel);
    const orchestratorModel =
      electedModel === undefined || electedModel === ""
        ? derivedModel
        : providerModelRef(input.providerId, electedModel);
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
    const agentConfigResult = buildOrchestratorAgentConfig({ subagents, orchestratorModel });
    if (!agentConfigResult.ok) {
      return err(agentConfigResult.error);
    }
    const agentConfig = agentConfigResult.value;
    const existingAgents = agentsList(config).filter((agent) => {
      const id = stringValue(agent["id"]);
      return id !== ASK_ADMIN_AGENT_ID && id?.startsWith("subagent-") !== true;
    });
    // Electing a model must also make it ROUTABLE — `agents.defaults.models` is what the gateway
    // will actually route to, so a primary that is absent from it points at nothing. Both land in
    // ONE patch: the gateway caps control-plane writes (3/60s), and two writes could interleave with
    // a concurrent connect and leave the primary and the routable set disagreeing.
    const patchParams = configPatchParams({
      configGetPayload: configResult.value,
      patch: {
        agents: {
          defaults: {
            model: {
              primary: orchestratorModel,
            },
            models: {
              ...gatewayDefaultModels(config),
              [orchestratorModel]: gatewayDefaultModels(config)[orchestratorModel] ?? {},
            },
          },
          list: [...existingAgents, ...agentConfig.agents.list],
        },
      },
      replacePaths: canonicalAgentListReplacePaths,
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

    // A manual set-main writes the same primary/agent wiring the failed continuation was meant to
    // repair. Keeping the stale warning after this authoritative repair would tell the operator the
    // gateway is still unsafe when it is not.
    this.orchestratorReconcileState = { status: "idle" };
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
    const result = await this.startGitHubDeviceFlowInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "github_connected",
      transition: result.ok ? "requested" : "failed",
      targetKind: "github_connection",
      targetRef: this.options.githubRepository,
      result: result.ok ? "pending" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async startGitHubDeviceFlowInner(
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
    const result = await this.disconnectGitHubInner(input);
    this.auditUserEvent({
      principal: input,
      intent: "github_disconnected",
      transition: result.ok ? "completed" : "failed",
      targetKind: "github_connection",
      targetRef: this.options.githubRepository,
      result: result.ok ? "success" : "failure",
      ...(result.ok ? {} : { resultCode: result.error.code }),
    });
    return result;
  }

  private async disconnectGitHubInner(
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

  private isCurrentActiveModelFlow(flow: PendingModelProviderDeviceFlow): boolean {
    const current = this.modelDeviceFlows.get(flow.flowId);
    return current?.generation === flow.generation && current.lifecycle === "active";
  }

  private async cleanupModelProviderFlow(flow: PendingModelProviderDeviceFlow): Promise<void> {
    const activeStop = this.modelDeviceFlowStops.get(flow.flowId);
    if (activeStop !== undefined) {
      return activeStop;
    }

    const current = this.modelDeviceFlows.get(flow.flowId);
    if (current === undefined || current.generation !== flow.generation) {
      return;
    }
    const cancelling: PendingModelProviderDeviceFlow = {
      ...current,
      generation: randomUUID(),
      lifecycle: "cancelling",
    };
    // Publish cancellation synchronously before the first await. Initial log parsing and polls use
    // the same generation+lifecycle guard, so neither can resurrect a stopped flow.
    this.modelDeviceFlows.set(flow.flowId, cancelling);
    const reservationKey = configWriteKey(flow.orgId);
    this.acquireProviderWrite(reservationKey);
    const stop = (async (): Promise<void> => {
      try {
        const runtime = this.options.gatewayRuntime;
        if (runtime === undefined) {
          throw new Error("Gateway runtime is unavailable.");
        }
        await runtime.stopDeviceCodeLogin(cancelling.execId, cancelling.logPath);
        const mapped = this.modelDeviceFlows.get(flow.flowId);
        if (mapped?.generation === cancelling.generation && mapped.lifecycle === "cancelling") {
          clearTimeout(mapped.timeout);
          this.modelDeviceFlows.delete(flow.flowId);
        }
      } catch (error) {
        const mapped = this.modelDeviceFlows.get(flow.flowId);
        if (mapped?.generation === cancelling.generation && mapped.lifecycle === "cancelling") {
          if (this.now().getTime() >= mapped.expiresAt.getTime()) {
            const retryFlow: PendingModelProviderDeviceFlow = {
              ...mapped,
              lifecycle: "active",
              timeout: setTimeout(() => {
                const retry = this.modelDeviceFlows.get(flow.flowId);
                if (retry !== undefined) {
                  void this.cleanupModelProviderFlow(retry).catch(() => undefined);
                }
              }, modelDeviceFlowCleanupRetryMs),
            };
            this.modelDeviceFlows.set(flow.flowId, retryFlow);
          } else {
            this.modelDeviceFlows.set(flow.flowId, { ...mapped, lifecycle: "active" });
          }
        }
        throw provisioningError(
          "provisioning.connections.deviceFlowStopUnverified",
          "Could not confirm that the device-code sign-in stopped.",
          { causeCode: error instanceof DomainError ? error.code : "runtime_stop_failed" },
        );
      } finally {
        this.releaseProviderWrite(reservationKey);
      }
    })();
    this.modelDeviceFlowStops.set(flow.flowId, stop);
    try {
      await stop;
    } finally {
      if (this.modelDeviceFlowStops.get(flow.flowId) === stop) {
        this.modelDeviceFlowStops.delete(flow.flowId);
      }
    }
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
    const runtime = this.options.gatewayRuntime;
    if (runtime === undefined) {
      throw new Error("Gateway runtime is unavailable.");
    }
    await runtime.stopSetupTokenLogin(flow.execId, flow.logPath);
    if (this.modelSetupTokenFlows.get(flow.flowId)?.execId === flow.execId) {
      this.modelSetupTokenFlows.delete(flow.flowId);
      clearTimeout(flow.timeout);
    }
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
    // A device flow belongs to the user who started it; a role peer cannot read its bearer code.
    if (flow.orgId !== input.orgId || flow.actorUserId !== input.actorUserId) {
      return ok({ status: "expired", message: "Device sign-in not found." });
    }
    if (!this.isCurrentActiveModelFlow(flow)) {
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
    if (!this.isCurrentActiveModelFlow(flow)) {
      return ok({ status: "expired", message: "Device sign-in not found." });
    }
    if (connection.status === "connected") {
      const activeFinalization = this.modelDeviceFlowFinalizations.get(flow.flowId);
      if (activeFinalization !== undefined) {
        return activeFinalization;
      }
      const finalization = this.finalizeModelProviderFlow(flow, connection);
      this.modelDeviceFlowFinalizations.set(flow.flowId, finalization);
      try {
        return await finalization;
      } finally {
        if (this.modelDeviceFlowFinalizations.get(flow.flowId) === finalization) {
          this.modelDeviceFlowFinalizations.delete(flow.flowId);
        }
      }
    }

    let currentFlow = flow;
    const log = await this.options.gatewayRuntime?.readDeviceCodeLog(flow.logPath);
    if (!this.isCurrentActiveModelFlow(flow)) {
      return ok({ status: "expired", message: "Device sign-in not found." });
    }
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
        if (this.isCurrentActiveModelFlow(flow)) {
          this.modelDeviceFlows.set(currentFlow.flowId, currentFlow);
        }
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

  private async finalizeModelProviderFlow(
    flow: PendingModelProviderDeviceFlow,
    connection: ProviderConnectionState,
  ): Promise<Result<DeviceFlowPollState>> {
    const reservationKey = configWriteKey(flow.orgId);
    this.acquireProviderWrite(reservationKey);
    try {
      // Overlapping browser polls share this whole finalization through modelDeviceFlowFinalizations;
      // one successful login must reconcile and stop its runtime exactly once.
      await this.reconcileOrchestratorAfterCredentialChange({
        reason: "connect",
        providerId: flow.providerId,
      });
      return ok({
        status: "connected",
        message: `${flow.providerId} connected in Opzava Gateway.`,
        connection: {
          ...connection,
          authChoiceId: connection.authChoiceId ?? flow.authChoiceId,
        },
      });
    } finally {
      try {
        await this.cleanupModelProviderFlow(flow);
      } finally {
        this.releaseProviderWrite(reservationKey);
      }
    }
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

export class UnavailableConnectionsProvisioningPort implements ConnectionsProvisioningRuntimePort {
  public constructor(
    private readonly reason: string,
    private readonly repository: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async reconcileStartup(): Promise<Result<AskAdminStartupReconciliationReceipt>> {
    return err(this.error());
  }

  public async reconcileStartupOrchestrator(): Promise<Result<void>> {
    return err(this.error());
  }

  public close(): void {}
  public async getConnectionsSnapshot(): Promise<Result<ConnectionsSnapshot>> {
    return ok(
      unavailableSnapshot({
        now: this.now(),
        repository: this.repository,
        message: this.reason,
      }),
    );
  }

  public async refreshConnectionsSnapshot(): Promise<Result<ConnectionsSnapshot>> {
    return err(this.error());
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

  public async cancelModelProviderDeviceFlow(): Promise<Result<DeviceFlowCancelState>> {
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

  public async setModelProviderModelEnabled(): Promise<Result<ProviderConnectionState>> {
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
): ConnectionsProvisioningRuntimePort {
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
    // #192: every connections/provider governance mutation appends a durable compliance row.
    audit: new PostgresObservabilityAdapter(),
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
