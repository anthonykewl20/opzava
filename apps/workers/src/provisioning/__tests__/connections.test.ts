import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GITHUB_ISSUES_TOKEN_SECRET_LABEL, LocalFileSecretsVault } from "@opzava/adapters";
import {
  type ConnectionsProvisioningPort,
  type ConnectionsSnapshot,
  type DeviceFlowChallenge,
  type GatewayRuntimeAgentCredential,
  type GatewayRuntimeAgentCredentialWrite,
  type GitHubConnectionState,
  type ModelProviderAuthChoice,
  type OpenClawAdminConnectionMetadata,
  type OpenClawAdminRpcPort,
  type OpenClawOperatorScope,
  type OrchestratorDelegationState,
  type OrchestratorSubagentRole,
  type PluginModelDiscoveryRead,
  type ProviderAuthProbe,
  type ProviderConnectionState,
  type SecretReference,
} from "@opzava/ports";
import { DomainError, err, ok, type Result, type TenantId } from "@opzava/shared-kernel";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASK_ADMIN_AGENT_ID,
  ASK_ADMIN_AGENT_DIR,
  ASK_ADMIN_AGENT_WORKSPACE,
  ASK_ADMIN_DELEGATION_TOOL_ALLOW,
  ASK_ADMIN_TOOL_POLICY_ALLOW,
  ASK_ADMIN_TOOL_POLICY_DENY,
  SUBAGENT_TOOL_POLICY_DENY,
} from "../ask-admin-agent.js";
import {
  buildGitHubConnectionProvisioningReceipt,
  buildOrchestratorAgentConfig,
  gatewayApiKeyConfigPatchInvocation,
  redactedGatewayConfigPatchInvocation,
} from "../connections.js";
import { createConnectionsInternalHttpServer } from "../connections-http-server.js";
import {
  createDefaultConnectionsProvisioningPort,
  DockerOpenClawGatewayRuntime,
  GatewayAdminConnectionsProvisioningPort,
  UnavailableConnectionsProvisioningPort,
} from "../gateway-admin-connections.js";
import { resolveProvisioningWorkerRuntimeConfig } from "../../main.js";
import {
  OpenClawAdminRpcClient,
  openClawOperatorScopeGranted,
  type OpenClawAdminClock,
  type OpenClawAdminDeviceKeypair,
  type OpenClawAdminWebSocket,
  type OpenClawAdminWebSocketFactory,
} from "../openclaw-admin-client.js";

const tempDirectories: string[] = [];

function testEd25519PrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");

  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function apiKeyChoice(overrides: Partial<ModelProviderAuthChoice> = {}): ModelProviderAuthChoice {
  return {
    id: "zai-api-key",
    label: "API key",
    mode: "api-key",
    providerId: "zai",
    keyFlag: "zai-api-key",
    ...overrides,
  };
}

function providerConnection(): ProviderConnectionState {
  return {
    providerId: "zai",
    status: "connected",
    authChoiceId: "zai-api-key",
    accountLabel: "Z.AI",
    scopes: [],
    model: "zai/glm-5.2",
    usageLabel: "within limits",
    lastCheckedAt: "2026-07-03T00:00:00.000Z",
    message: null,
    connectedAuthMode: "api_key",
  };
}

function rawPatch(params: Record<string, unknown>): Record<string, unknown> {
  const raw = params["raw"];
  if (typeof raw !== "string") {
    throw new Error("expected raw config.patch params");
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

function githubConnection(): GitHubConnectionState {
  return {
    status: "not_connected",
    accountLabel: null,
    scopes: [],
    repository: "anthonykewl20/opzava",
    lastCheckedAt: null,
    message: null,
  };
}

function deviceFlowChallenge(): DeviceFlowChallenge {
  return {
    flowId: "flow-1",
    kind: "model_provider",
    providerId: "openai",
    authChoiceId: "openai-device-code",
    verificationUri: "https://example.test/device",
    userCode: "ABCD-EFGH",
    expiresAt: "2026-07-03T00:10:00.000Z",
    intervalSeconds: 2,
  };
}

function connectionsSnapshot(): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "fra1",
      authLabel: "JIT operator.admin",
      lastHeartbeatAt: "2026-07-03T00:00:00.000Z",
      message: null,
    },
    openclawHealth: {
      components: [],
      warnings: [],
      runtime: { version: null, uptimeMs: null, hostUptimeMs: null, updateAvailable: null },
      sessions: { count: null, recent: [] },
      checkedAt: null,
      lastKnownHealthy: null,
    },
    providerCatalog: [],
    providerConnections: [providerConnection()],
    pendingDeviceFlows: [],
    github: githubConnection(),
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5.5",
      orchestratorProviderId: "openai",
      delegationMode: "prefer",
      allowAgents: ["subagent-zai"],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: "receipt-1",
      },
      reconcile: { status: "idle" },
      updatedAt: "2026-07-03T00:00:00.000Z",
    },
    refreshedAt: "2026-07-03T00:00:00.000Z",
  };
}

function fakeProvisioningPort(): ConnectionsProvisioningPort {
  return {
    getConnectionsSnapshot: async () => ok(connectionsSnapshot()),
    refreshConnectionsSnapshot: async () => ok(connectionsSnapshot()),
    startModelProviderApiKeyConnect: async () => ok({ opId: "op-1", status: "pending" }),
    pollModelProviderApiKeyConnect: async () =>
      ok({ status: "connected", connection: providerConnection() }),
    startModelProviderSetupTokenFlow: async () => ok({ flowId: "setup:flow-1", status: "pending" }),
    pollModelProviderSetupTokenFlow: async () =>
      ok({ status: "connected", connection: providerConnection() }),
    submitModelProviderSetupTokenCode: async () => ok({ status: "pending" }),
    startModelProviderDeviceFlow: async () => ok(deviceFlowChallenge()),
    pollDeviceFlow: async () =>
      ok({ status: "connected", message: "Connected.", connection: providerConnection() }),
    startModelProviderDisconnect: async () =>
      ok({ opId: "model-disconnect:test", status: "pending" }),
    pollModelProviderDisconnect: async () =>
      ok({
        status: "disconnected",
        connection: { ...providerConnection(), status: "not_connected" },
      }),
    setModelProviderModelEnabled: async () => ok(providerConnection()),
    applyOrchestratorDelegation: async () =>
      ok({
        orchestratorAgentId: "ask-admin-opzava",
        orchestratorModel: "openai/gpt-5.5",
        orchestratorProviderId: "openai",
        delegationMode: "prefer",
        allowAgents: ["subagent-zai"],
        subagents: [],
        toolPolicyExpansion: {
          allow: ["sessions_spawn", "subagents", "group:sessions"],
          receiptId: "receipt-2",
        },
        reconcile: { status: "idle" },
        updatedAt: "2026-07-03T00:00:00.000Z",
      } satisfies OrchestratorDelegationState),
    setMainOrchestrator: async (input) =>
      ok({
        orchestratorAgentId: "ask-admin-opzava",
        orchestratorModel: `${input.providerId}/default`,
        orchestratorProviderId: input.providerId,
        delegationMode: "prefer",
        allowAgents: [],
        subagents: [],
        toolPolicyExpansion: {
          allow: ["sessions_spawn", "subagents", "group:sessions"],
          receiptId: "receipt-3",
        },
        reconcile: { status: "idle" },
        updatedAt: "2026-07-03T00:00:00.000Z",
      } satisfies OrchestratorDelegationState),
    startGitHubDeviceFlow: async () =>
      ok({
        ...deviceFlowChallenge(),
        kind: "github",
        providerId: "github",
        authChoiceId: "github-device-flow",
      }),
    disconnectGitHub: async () => ok(githubConnection()),
  };
}

type RecordingAdminResponse = Result<unknown> | (() => Result<unknown>);

class RecordingAdminClient implements OpenClawAdminRpcPort {
  public readonly calls: {
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly idempotencyKey?: string;
  }[] = [];

  public constructor(
    private readonly responses: Record<string, RecordingAdminResponse>,
    private readonly scopes: readonly OpenClawOperatorScope[] = ["operator.read", "operator.admin"],
    private readonly metadata: OpenClawAdminConnectionMetadata | null = null,
  ) {}

  public async request(
    method: string,
    params: Record<string, unknown>,
    options: {
      readonly idempotencyKey?: string;
      readonly requiredScope?: OpenClawOperatorScope;
    } = {},
  ): Promise<Result<unknown>> {
    if (
      options.requiredScope !== undefined &&
      !openClawOperatorScopeGranted(this.scopes, options.requiredScope)
    ) {
      return err(
        new DomainError({
          code: "provisioning.openclawAdmin.operatorAdminRequired",
          message: "operator.admin scope required — pair/upgrade an admin device.",
          details: { requiredScope: options.requiredScope, grantedScopes: this.scopes },
        }),
      );
    }

    this.calls.push({
      method,
      params,
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    });

    const response = this.responses[method] ?? ok({});
    return typeof response === "function" ? response() : response;
  }

  public grantedScopes(): readonly OpenClawOperatorScope[] {
    return this.scopes;
  }

  public connectionMetadata(): OpenClawAdminConnectionMetadata | null {
    return this.metadata;
  }

  public close(): void {}
}

function applyJsonMergePatch(target: unknown, patch: unknown): unknown {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return patch;
  }
  const next: Record<string, unknown> =
    typeof target === "object" && target !== null && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = applyJsonMergePatch(next[key], value);
    }
  }
  return next;
}

function modelToggleAdmin(input: {
  readonly config: Record<string, unknown>;
  readonly models: unknown;
  readonly patchResults?: readonly Result<unknown>[];
  readonly retainPatch?: boolean;
  readonly applyFailedPatch?: boolean;
}): RecordingAdminClient & { currentConfig(): Record<string, unknown> } {
  let config: Record<string, unknown> = input.config;
  let hash = 1;
  let patchAttempt = 0;
  const admin = new RecordingAdminClient({
    "config.get": () => ok({ hash: `toggle-hash-${hash}`, config }),
    "models.list": ok(input.models),
    "config.patch": () => {
      const forced = input.patchResults?.[patchAttempt];
      patchAttempt += 1;
      const call = admin.calls.at(-1);
      const raw = typeof call?.params["raw"] === "string" ? call.params["raw"] : "{}";
      if (
        input.retainPatch !== false &&
        (forced === undefined || forced.ok || input.applyFailedPatch === true)
      ) {
        config = applyJsonMergePatch(config, JSON.parse(raw)) as Record<string, unknown>;
      }
      if (forced !== undefined && !forced.ok) {
        return forced;
      }
      hash += 1;
      return forced ?? ok({ ok: true });
    },
  });
  return Object.assign(admin, { currentConfig: () => config });
}

/**
 * `models status` derived from the toggle admin's LIVE config: `allowed` mirrors the
 * agents.defaults.models keys the last patch wrote. The post-check refuses an allowed set that
 * disagrees with the toggle, so a STATIC fake here would fail honest enables (allowed never gains
 * the ref) or vacuously pass broken ones — the fake must move when the config moves.
 */
function toggleStatusFromAdmin(
  admin: { currentConfig(): Record<string, unknown> },
  providerId = "opencode-go",
): () => Result<unknown> {
  return () => {
    const agents = admin.currentConfig()["agents"] as Record<string, unknown> | undefined;
    const defaults = agents?.["defaults"] as Record<string, unknown> | undefined;
    const models = defaults?.["models"] as Record<string, unknown> | undefined;
    return ok({
      allowed: Object.keys(models ?? {}),
      auth: {
        providers: [
          {
            provider: providerId,
            profiles: { count: 1, apiKey: 1, labels: [`${providerId}:manual=API key`] },
          },
        ],
      },
    });
  };
}

const bundleModelsPayload = {
  providers: [{ id: "opencode-go", label: "OpenCode Go", suggestedModel: "opencode-go/base" }],
  models: [
    { id: "base", name: "Base", provider: "opencode-go" },
    { id: "visible", name: "Registry Visible", provider: "opencode-go" },
  ],
};

const bundleDiscovery: PluginModelDiscoveryRead = {
  plugins: [{ id: "opencode-go", enabled: true }],
  catalogs: [
    {
      pluginId: "opencode-go",
      providers: {
        "opencode-go": {
          baseUrl: "https://opencode.example/v1",
          api: "openai-completions",
          models: [
            { id: "visible", name: "Plugin duplicate must lose" },
            { id: "kimi-k2.6", name: "Kimi K2.6", reasoning: true, custom: { kept: true } },
          ],
        },
      },
    },
  ],
};

function bundleConfig(
  input: {
    readonly enabled?: readonly string[];
    readonly profileModel?: string;
    readonly defaultsModel?: unknown;
    readonly imageModel?: unknown;
    readonly connected?: boolean;
  } = {},
): Record<string, unknown> {
  return {
    auth: {
      profiles:
        input.connected === false
          ? {}
          : {
              "opencode-go:manual": {
                providerId: "opencode-go",
                authChoiceId: "api-key",
                model: input.profileModel ?? "opencode-go/base",
              },
            },
      order: { "opencode-go": ["opencode-go:manual"] },
    },
    agents: {
      defaults: {
        model: input.defaultsModel ?? { primary: "other/default" },
        ...(input.imageModel === undefined ? {} : { imageModel: input.imageModel }),
        models: Object.fromEntries(
          (input.enabled ?? ["base"]).map((id) => [`opencode-go/${id}`, {}]),
        ),
      },
      list: [],
    },
    models: {
      providers: {
        "opencode-go": {
          baseUrl: "https://existing.example/v1",
          models: [{ id: "base", existing: true }],
        },
      },
    },
  };
}

class MemorySecretsVault {
  private secret: SecretReference | null = null;
  private value: string | null = null;

  public async getRef(): Promise<Result<SecretReference | null>> {
    return ok(this.secret);
  }

  public async resolve(): Promise<Result<never>> {
    return err(new DomainError({ code: "test.unsupported", message: "Not used." }));
  }

  public async putSecret(input: {
    readonly tenantId: TenantId;
    readonly purpose: SecretReference["purpose"];
    readonly label: string;
    readonly value: string;
  }): Promise<Result<SecretReference>> {
    this.secret = {
      id: `test:${input.tenantId}:${input.label}` as SecretReference["id"],
      tenantId: input.tenantId,
      purpose: input.purpose,
      label: input.label,
    };
    this.value = input.value;
    return ok(this.secret);
  }

  public async resolveSecretValue(): Promise<Result<string>> {
    if (this.value === null) {
      return err(new DomainError({ code: "test.notFound", message: "Secret not found." }));
    }

    return ok(this.value);
  }

  public async deleteSecret(): Promise<Result<void>> {
    this.secret = null;
    this.value = null;
    return ok(undefined);
  }
}

// The agent OpenClaw resolves un-agented writes to (Opzava marks it `default: true`)...
const orchestratorDefaultAgentId = "ask-admin-opzava";
// ...and the store every agent actually inherits from. That they differ is issue #169.
const sharedCredentialAgentId = "main";

/**
 * A credential the fake provider will reject, the way a real one rejects a key that never
 * authenticated. The #183 probe is the only thing that can tell this apart from a good key: it is
 * stored, it is routable, and every structural check passes.
 */
const bogusApiKey = "sk-bogus-never-authenticates";

function credentialKey(agentId: string, providerId: string): string {
  return `${agentId}:${providerId}`;
}

class RecordingGatewayRuntime {
  public readonly connectCalls: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }[] = [];
  public readonly deviceLoginCalls: string[] = [];
  public readonly deviceLoginAgentIds: string[] = [];
  public readonly deviceLogReads: string[] = [];
  public readonly agentCredentialWrites: {
    readonly agentId: string;
    readonly providerId: string;
  }[] = [];
  public readonly authProbes: {
    readonly agentId: string;
    readonly providerId: string;
    readonly profileId: string;
  }[] = [];
  /** agentId -> providerIds whose credential is physically stored in THAT agent's auth store. */
  public readonly agentStores = new Map<string, Set<string>>();
  /** `${agentId}:${providerId}` -> the credential actually sitting in that store right now. */
  public readonly storedCredentials = new Map<string, string>();
  public writeAgentCredentialResult: Result<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }> | null = null;
  public readonly deviceStops: {
    readonly execId: string;
    readonly logPath: string;
  }[] = [];
  public readonly setupTokenStarts: string[] = [];
  public readonly setupTokenWrites: {
    readonly stdinPath: string;
    readonly value: string;
  }[] = [];
  public readonly setupTokenStops: {
    readonly execId: string;
    readonly logPath: string;
  }[] = [];
  public connectedDeviceProviderId: string | null = null;
  public deviceLogResult: Result<string> | null = null;
  public modelStatusCalls = 0;
  public pluginDiscoveryCalls = 0;

  public constructor(
    private readonly options: {
      readonly choices?: readonly {
        readonly id: string;
        readonly label: string;
        readonly mode: "api-key" | "device-flow";
        readonly keyFlag?: string;
      }[];
      readonly status?: unknown | (() => unknown);
      readonly statusResult?: Result<unknown> | (() => Result<unknown>);
      readonly connectResult?: Result<{
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
      }>;
      readonly connectDelayMs?: number;
      readonly deviceLoginBarrier?: Promise<void>;
      readonly deviceStopBarrier?: Promise<void>;
      readonly deviceCodeLogResult?: Result<string>;
      readonly deviceCodeLog?: string | (() => string);
      readonly setupTokenLog?: string | (() => string);
      /** Force every probe to one verdict, e.g. to simulate a rate-limited provider. */
      readonly authProbeResult?: Result<ProviderAuthProbe> | (() => Result<ProviderAuthProbe>);
      /** Suppress the `Auth profile: ...` line, as an older gateway would. */
      readonly omitWrittenProfileId?: boolean;
      /**
       * Report `models status` from the credentials actually held, so a logout that removes one
       * really does change what the gateway says. Without this the fake would insist a provider is
       * still connected after its credential is gone, and a rollback could not be tested honestly.
       */
      readonly statusFromStores?: { readonly providerId: string; readonly model: string };
      readonly pluginDiscoveryResult?: Result<PluginModelDiscoveryRead>;
    } = {},
  ) {}

  public async readPluginModelDiscovery(): Promise<Result<PluginModelDiscoveryRead>> {
    this.pluginDiscoveryCalls += 1;
    return this.options.pluginDiscoveryResult ?? ok({ catalogs: [], plugins: [] });
  }

  public async listAuthChoices(): Promise<
    Result<
      readonly {
        readonly id: string;
        readonly label: string;
        readonly mode: "api-key" | "device-flow";
        readonly keyFlag?: string;
      }[]
    >
  > {
    return ok(
      this.options.choices ?? [
        { id: "zai-api-key", label: "API key", mode: "api-key", keyFlag: "zai-api-key" },
      ],
    );
  }

  public async modelStatus(): Promise<Result<unknown>> {
    this.modelStatusCalls += 1;
    if (typeof this.options.statusResult === "function") {
      return this.options.statusResult();
    }
    if (this.options.statusResult !== undefined) {
      return this.options.statusResult;
    }

    if (typeof this.options.status === "function") {
      return ok(this.options.status());
    }

    if (this.options.status !== undefined) {
      return ok(this.options.status);
    }

    const fromStores = this.options.statusFromStores;
    if (fromStores !== undefined) {
      const connected =
        this.credentialResolvedBy(orchestratorDefaultAgentId, fromStores.providerId) !== undefined;
      return ok(
        connected
          ? {
              allowed: [fromStores.model],
              auth: {
                providers: [
                  {
                    provider: fromStores.providerId,
                    profiles: {
                      count: 1,
                      apiKey: 1,
                      labels: [`${fromStores.providerId}:manual=API key`],
                    },
                  },
                ],
              },
            }
          : { allowed: [], auth: { providers: [] } },
      );
    }

    if (this.connectedDeviceProviderId !== null) {
      return ok({
        allowed: [`${this.connectedDeviceProviderId}/gpt-5.5`],
        auth: {
          providers: [
            {
              provider: this.connectedDeviceProviderId,
              profiles: {
                count: 1,
                oauth: 1,
                labels: [`${this.connectedDeviceProviderId}:oauth=OAuth`],
              },
            },
          ],
        },
      });
    }

    return ok({
      allowed: ["zai/glm-5.2"],
      auth: {
        providers: [
          {
            provider: "zai",
            profiles: { count: 1, apiKey: 1, labels: ["zai:manual=API key"] },
          },
        ],
      },
    });
  }

  public async connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<
    Result<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>
  > {
    this.connectCalls.push(input);
    if (this.options.connectDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, this.options.connectDelayMs));
    }
    const result = this.options.connectResult ?? ok({ exitCode: 0, stdout: "{}", stderr: "" });
    if (result.ok && result.value.exitCode === 0) {
      // Faithful to the real CLI: `onboard` has no --agent flag and always writes to the CONFIGURED
      // DEFAULT agent — the orchestrator. That store is nobody else's inheritance base (#169).
      this.storeFor(orchestratorDefaultAgentId).add(input.providerId);
      this.storedCredentials.set(
        credentialKey(orchestratorDefaultAgentId, input.providerId),
        input.apiKey,
      );
    }
    return result;
  }

  public async writeAgentCredential(
    input: GatewayRuntimeAgentCredential,
  ): Promise<Result<GatewayRuntimeAgentCredentialWrite>> {
    this.agentCredentialWrites.push({ agentId: input.agentId, providerId: input.providerId });
    if (this.writeAgentCredentialResult !== null) {
      const forced = this.writeAgentCredentialResult;
      return forced.ok ? ok({ ...forced.value, profileId: null, providerId: null }) : forced;
    }
    this.storeFor(input.agentId).add(input.providerId);
    // Faithful to the real CLI: `models auth paste-*` UPSERTS a deterministic profile id per
    // provider, so a re-connect overwrites the credential in place rather than adding a second one.
    this.storedCredentials.set(credentialKey(input.agentId, input.providerId), input.apiKey);
    const profileId = `${input.providerId}:manual`;
    const omit = this.options.omitWrittenProfileId === true;
    return ok({
      exitCode: 0,
      stdout: omit ? "" : `Auth profile: ${profileId} (${input.providerId}/api_key)\n`,
      stderr: "",
      profileId: omit ? null : profileId,
      providerId: omit ? null : input.providerId,
    });
  }

  /**
   * The live check #183 is about: ask the provider whether the credential in a given store actually
   * authenticates. Structural checks cannot answer this — a bogus key is stored and routable just
   * like a good one — so the fake answers from the credential it really holds.
   */
  public async probeProviderAuth(input: {
    readonly agentId: string;
    readonly providerId: string;
    readonly profileId: string;
  }): Promise<Result<ProviderAuthProbe>> {
    this.authProbes.push(input);
    if (typeof this.options.authProbeResult === "function") {
      return this.options.authProbeResult();
    }
    if (this.options.authProbeResult !== undefined) {
      return this.options.authProbeResult;
    }

    const credential = this.storedCredentials.get(credentialKey(input.agentId, input.providerId));
    if (credential === undefined) {
      return ok({ verdict: "unproven", reason: "the gateway had no credential to probe" });
    }

    return ok(
      credential === bogusApiKey
        ? { verdict: "rejected", reason: "auth: invalid api key" }
        : { verdict: "verified", reason: "the provider accepted the credential" },
    );
  }

  public async listAgentProviderProfiles(input: {
    readonly agentId: string;
    readonly providerId: string;
  }): Promise<Result<readonly string[]>> {
    return ok(
      this.resolvableBy(input.agentId, input.providerId) ? [`${input.providerId}:manual`] : [],
    );
  }

  /**
   * OpenClaw's read-through inheritance, as verified against the real CLI: an agent resolves its own
   * profiles PLUS whatever sits in the shared `main` store — and only `main`, never a sibling
   * agent's store. This is the rule that makes a credential parked in the orchestrator unusable.
   */
  public resolvableBy(agentId: string, providerId: string): boolean {
    return (
      this.storeFor(agentId).has(providerId) ||
      this.storeFor(sharedCredentialAgentId).has(providerId)
    );
  }

  public forgetProviderInStore(agentId: string, providerId: string): void {
    this.storeFor(agentId).delete(providerId);
    this.storedCredentials.delete(credentialKey(agentId, providerId));
  }

  /** The credential an agent would actually present for a provider, counting inheritance. */
  public credentialResolvedBy(agentId: string, providerId: string): string | undefined {
    return (
      this.storedCredentials.get(credentialKey(agentId, providerId)) ??
      this.storedCredentials.get(credentialKey(sharedCredentialAgentId, providerId))
    );
  }

  private storeFor(agentId: string): Set<string> {
    const existing = this.agentStores.get(agentId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Set<string>();
    this.agentStores.set(agentId, created);
    return created;
  }

  public async startDeviceCodeLogin(
    providerId: string,
    agentId: string,
  ): Promise<Result<{ readonly execId: string; readonly logPath: string }>> {
    this.deviceLoginCalls.push(providerId);
    this.deviceLoginAgentIds.push(agentId);
    await this.options.deviceLoginBarrier;
    this.storeFor(agentId).add(this.connectedDeviceProviderId ?? providerId);
    return ok({ execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" });
  }

  public async readDeviceCodeLog(logPath: string): Promise<Result<string>> {
    this.deviceLogReads.push(logPath);
    if (this.deviceLogResult !== null) {
      return this.deviceLogResult;
    }
    if (this.options.deviceCodeLogResult !== undefined) {
      return this.options.deviceCodeLogResult;
    }
    if (logPath.includes("opzava-st")) {
      const setupValue =
        typeof this.options.setupTokenLog === "function"
          ? this.options.setupTokenLog()
          : this.options.setupTokenLog;
      return ok(setupValue ?? "Authorize: https://claude.ai/oauth/authorize\n");
    }
    const value =
      typeof this.options.deviceCodeLog === "function"
        ? this.options.deviceCodeLog()
        : this.options.deviceCodeLog;
    return ok(
      value ?? "\u001B[32mOpen https://auth.openai.com/codex/device\u001B[0m\nCode: NRK5-7IPKG\n",
    );
  }

  public async readSetupTokenLog(logPath: string): Promise<Result<string>> {
    return this.readDeviceCodeLog(logPath);
  }

  public async stopDeviceCodeLogin(execId: string, logPath: string): Promise<void> {
    this.deviceStops.push({ execId, logPath });
    await this.options.deviceStopBarrier;
  }

  public async startSetupTokenLogin(): Promise<
    Result<{ readonly execId: string; readonly logPath: string; readonly stdinPath: string }>
  > {
    this.setupTokenStarts.push("start");
    return ok({
      execId: "exec-setup-1",
      logPath: "/tmp/opzava-st-test/setup.log",
      stdinPath: "/tmp/opzava-st-test/stdin",
    });
  }

  public async writeSetupTokenInput(stdinPath: string, value: string): Promise<Result<void>> {
    this.setupTokenWrites.push({ stdinPath, value });
    return ok(undefined);
  }

  public async stopSetupTokenLogin(execId: string, logPath: string): Promise<void> {
    this.setupTokenStops.push({ execId, logPath });
  }
}

function principal(): {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly roleKeys: readonly string[];
} {
  return {
    orgId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    actorUserId: "00000000-0000-4000-8000-000000000003",
    roleKeys: ["admin"],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollApiKeyConnectUntilTerminal(
  port: GatewayAdminConnectionsProvisioningPort,
  opId: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await port.pollModelProviderApiKeyConnect({ ...principal(), opId });
    if (!result.ok || result.value.status !== "pending") {
      return result;
    }
    await Promise.resolve();
  }

  return port.pollModelProviderApiKeyConnect({ ...principal(), opId });
}

function setupTokenPort(input: {
  readonly gatewayRuntime: RecordingGatewayRuntime;
  readonly now?: () => Date;
}): GatewayAdminConnectionsProvisioningPort {
  return new GatewayAdminConnectionsProvisioningPort({
    adminClient: new RecordingAdminClient({
      "config.get": ok({ hash: "config-hash-setup-token", plugins: { allow: ["anthropic"] } }),
    }),
    secretsVault: new MemorySecretsVault(),
    githubRepository: "anthonykewl20/opzava",
    gatewayRuntime: input.gatewayRuntime,
    now: input.now ?? (() => new Date("2026-07-03T00:00:00.000Z")),
  });
}

function fakeAdminSocketFactory(
  seenFrames: unknown[],
  grantedScopes: readonly OpenClawOperatorScope[] = ["operator.read", "operator.admin"],
): OpenClawAdminWebSocketFactory {
  return () => {
    let onMessage: ((data: string) => void) | null = null;
    const socket: OpenClawAdminWebSocket = {
      send(data) {
        const frame = JSON.parse(data) as Record<string, unknown>;
        seenFrames.push(frame);
        if (frame["method"] === "connect") {
          queueMicrotask(() =>
            onMessage?.(
              JSON.stringify({
                type: "res",
                id: frame["id"],
                ok: true,
                payload: {
                  type: "hello-ok",
                  protocol: 4,
                  auth: { role: "operator", scopes: grantedScopes },
                },
              }),
            ),
          );
          return;
        }

        queueMicrotask(() =>
          onMessage?.(
            JSON.stringify({
              type: "res",
              id: frame["id"],
              ok: true,
              payload: { ok: true },
            }),
          ),
        );
      },
      close() {},
      onMessage(listener) {
        onMessage = listener;
        queueMicrotask(() =>
          listener(
            JSON.stringify({
              type: "event",
              event: "connect.challenge",
              payload: { nonce: "nonce-1", ts: 1 },
            }),
          ),
        );
      },
      onClose() {},
      onError() {},
    };
    return socket;
  };
}

class TestClock implements OpenClawAdminClock {
  public readonly delays: number[] = [];
  private current = 0;
  private nextId = 1;
  private readonly timers = new Map<
    number,
    { readonly at: number; readonly callback: () => void }
  >();

  public now(): number {
    return this.current;
  }

  public setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = this.nextId;
    this.nextId += 1;
    this.delays.push(ms);
    this.timers.set(id, { at: this.current + ms, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  }

  public clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    this.timers.delete(timer as unknown as number);
  }

  public advance(ms: number): void {
    this.current += ms;
    for (;;) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= this.current)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined) {
        return;
      }

      this.timers.delete(next[0]);
      next[1].callback();
    }
  }
}

class TestAdminSocket implements OpenClawAdminWebSocket {
  public readonly frames: Record<string, unknown>[] = [];
  public closed = false;
  private messageListener: ((data: string) => void) | null = null;
  private closeListener:
    ((event?: { readonly code?: number; readonly reason?: string }) => void) | null = null;
  private errorListener: ((error: unknown) => void) | null = null;

  public constructor(
    private readonly onRequest: (socket: TestAdminSocket, frame: Record<string, unknown>) => void,
    private readonly grantedScopes: readonly OpenClawOperatorScope[] = [
      "operator.read",
      "operator.admin",
    ],
  ) {}

  public send(data: string): void {
    if (this.closed) {
      throw new Error("socket closed");
    }

    const frame = JSON.parse(data) as Record<string, unknown>;
    this.frames.push(frame);
    if (frame["method"] === "connect") {
      queueMicrotask(() =>
        this.messageListener?.(
          JSON.stringify({
            type: "res",
            id: frame["id"],
            ok: true,
            payload: {
              type: "hello-ok",
              protocol: 4,
              auth: { role: "operator", scopes: this.grantedScopes },
            },
          }),
        ),
      );
      return;
    }

    this.onRequest(this, frame);
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.closeListener?.({ code: 1000 });
  }

  public onMessage(listener: (data: string) => void): void {
    this.messageListener = listener;
    queueMicrotask(() =>
      listener(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "nonce-1", ts: 1 },
        }),
      ),
    );
  }

  public onClose(
    listener: (event?: { readonly code?: number; readonly reason?: string }) => void,
  ): void {
    this.closeListener = listener;
  }

  public onError(listener: (error: unknown) => void): void {
    this.errorListener = listener;
  }

  public respondOk(frame: Record<string, unknown>, payload: unknown = { ok: true }): void {
    queueMicrotask(() =>
      this.messageListener?.(
        JSON.stringify({
          type: "res",
          id: frame["id"],
          ok: true,
          payload,
        }),
      ),
    );
  }

  public closeFromGateway(reason = "restart"): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.closeListener?.({ code: 1012, reason });
  }

  public failFromGateway(error: unknown): void {
    this.errorListener?.(error);
  }
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function stubGlobalAdminWebSocket(
  seenFrames: unknown[],
  grantedScopes: readonly OpenClawOperatorScope[] = ["operator.read", "operator.admin"],
): void {
  vi.stubGlobal(
    "WebSocket",
    class {
      private messageListener: ((event: { readonly data?: unknown }) => void) | null = null;

      public constructor() {}

      public send(data: string): void {
        const frame = JSON.parse(data) as Record<string, unknown>;
        seenFrames.push(frame);
        queueMicrotask(() =>
          this.messageListener?.({
            data: JSON.stringify({
              type: "res",
              id: frame["id"],
              ok: true,
              payload:
                frame["method"] === "connect"
                  ? {
                      type: "hello-ok",
                      protocol: 4,
                      auth: { role: "operator", scopes: grantedScopes },
                    }
                  : { ok: true },
            }),
          }),
        );
      }

      public close(): void {}

      public addEventListener(
        type: string,
        listener: (event: { readonly data?: unknown }) => void,
      ): void {
        if (type !== "message") {
          return;
        }

        this.messageListener = listener;
        queueMicrotask(() =>
          listener({
            data: JSON.stringify({
              type: "event",
              event: "connect.challenge",
              payload: { nonce: "nonce-1", ts: 1 },
            }),
          }),
        );
      }
    },
  );
}

function fakeKeypair(): OpenClawAdminDeviceKeypair {
  return {
    deviceId: "device-1",
    publicKey: "public-key-1",
    sign: async () => "signature-1",
  };
}

function openAiDeviceFlowAdmin(): RecordingAdminClient {
  return new RecordingAdminClient({
    "config.get": ok({
      hash: "config-hash-openai",
      auth: { profiles: {}, order: {} },
      agents: {
        defaults: { model: { primary: "openai/gpt-5.5" } },
        list: [{ id: "ask-admin-opzava", model: "openai/gpt-5.5" }],
      },
    }),
    health: ok({ status: "ok" }),
    "last-heartbeat": ok({ lastHeartbeatAt: "2026-07-03T00:00:00.000Z" }),
    "models.list": ok({
      providers: [
        {
          id: "openai",
          label: "OpenAI",
          vendor: "OpenAI",
          suggestedModel: "openai/gpt-5.5",
          authChoices: [
            {
              id: "openai-device-code",
              label: "OAuth device flow",
              mode: "device-flow",
              providerId: "openai",
            },
          ],
        },
      ],
      models: [{ id: "gpt-5.5", name: "GPT 5.5", provider: "openai", available: true }],
    }),
    "models.authStatus": ok({
      providers: [
        {
          provider: "openai",
          displayName: "OpenAI",
          status: "missing",
          profiles: [],
        },
      ],
    }),
  });
}

async function listen(
  server: ReturnType<typeof createConnectionsInternalHttpServer>,
): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected HTTP server to listen on TCP.");
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function closeServer(
  server: ReturnType<typeof createConnectionsInternalHttpServer>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("Connections provisioning helpers", () => {
  it("serves a lightweight unauthenticated process health endpoint", async () => {
    const server = createConnectionsInternalHttpServer({
      provisioningPort: fakeProvisioningPort(),
      internalToken: "local-provisioning-token",
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/healthz`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    } finally {
      await closeServer(server);
    }
  });

  it("builds an OpenClaw config.patch API-key payload without logging the secret", () => {
    const invocation = gatewayApiKeyConfigPatchInvocation({
      authChoice: apiKeyChoice(),
      apiKey: "runtime-secret",
      configBaseHash: "config-hash-1",
    });

    expect(invocation.ok).toBe(true);
    if (!invocation.ok) {
      throw invocation.error;
    }

    expect(invocation.value).toMatchObject({
      method: "config.patch",
      params: {
        baseHash: "config-hash-1",
        raw: JSON.stringify({
          auth: {
            profiles: {
              "zai-zai-api-key": {
                id: "zai-zai-api-key",
                providerId: "zai",
                authChoiceId: "zai-api-key",
                type: "api-key",
                key: "runtime-secret",
              },
            },
            order: { zai: ["zai-zai-api-key"] },
          },
        }),
      },
    });
    expect(redactedGatewayConfigPatchInvocation(invocation.value)).toContain("<redacted>");
    expect(redactedGatewayConfigPatchInvocation(invocation.value)).not.toContain("runtime-secret");
  });

  it("rejects device-flow auth choices for API-key config.patch provisioning", () => {
    const invocation = gatewayApiKeyConfigPatchInvocation({
      authChoice: apiKeyChoice({ mode: "device-flow" }),
      apiKey: "runtime-secret",
      configBaseHash: "config-hash-1",
    });

    expect(invocation.ok).toBe(false);
  });

  it("renders the orchestrator delegation config and audited tool expansion", () => {
    const subagents: readonly OrchestratorSubagentRole[] = [
      {
        agentId: "subagent-zai",
        providerId: "zai",
        providerLabel: "z.ai / GLM",
        model: "zai/glm-5.2",
        strength: "coding plan context",
        whenToUse: "large implementation work",
      },
      {
        agentId: "subagent-openai",
        providerId: "openai",
        providerLabel: "OpenAI",
        model: "openai/gpt-5.5",
        strength: "general orchestration",
        whenToUse: "cross-provider work",
      },
    ];
    const result = buildOrchestratorAgentConfig({ subagents });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    const config = result.value;

    expect(config.receipt).toMatchObject({
      delegationMode: "prefer",
      allowAgents: ["subagent-zai", "subagent-openai"],
      toolPolicyExpansion: ["sessions_spawn", "subagents", "group:sessions"],
      subagentToolPolicy: {
        profile: "minimal",
        allow: [],
        deny: [...SUBAGENT_TOOL_POLICY_DENY],
        denyWins: true,
      },
      note: "delegation-engine-deferred-to-p1",
    });
    expect(config.agents.list[0]).toMatchObject({
      id: "ask-admin-opzava",
      workspace: ASK_ADMIN_AGENT_WORKSPACE,
      agentDir: ASK_ADMIN_AGENT_DIR,
      subagents: { delegationMode: "prefer", allowAgents: ["subagent-zai", "subagent-openai"] },
      // Delegation ADDS to the canonical policy (#146): the task/CRM allow-list, the minimal
      // profile and the deny-wins lock-down all survive alongside the delegation tools.
      tools: {
        profile: "minimal",
        allow: [...ASK_ADMIN_TOOL_POLICY_ALLOW, ...ASK_ADMIN_DELEGATION_TOOL_ALLOW],
        deny: [...ASK_ADMIN_TOOL_POLICY_DENY],
      },
    });
    for (const entry of config.agents.list) {
      expect(entry.tools).toMatchObject({
        profile: "minimal",
        deny: [...ASK_ADMIN_TOOL_POLICY_DENY],
      });
    }
    for (const entry of config.agents.list.slice(1)) {
      expect(entry.tools.allow).toEqual([]);
      expect(entry.tools.allow).not.toContain("sessions_spawn");
      expect(entry.tools.allow).not.toContain("subagents");
      expect(entry.tools.allow).not.toContain("group:sessions");
    }
  });

  it("rejects subagent ids that would make the canonical agents.list ambiguous", () => {
    const subagent: OrchestratorSubagentRole = {
      agentId: "subagent-zai",
      providerId: "zai",
      providerLabel: "z.ai / GLM",
      model: "zai/glm-5.2",
      strength: "coding plan context",
      whenToUse: "large implementation work",
    };

    expect(buildOrchestratorAgentConfig({ subagents: [subagent, subagent] })).toMatchObject({
      ok: false,
      error: { code: "provisioning.connections.duplicateSubagentAgentId" },
    });
    expect(
      buildOrchestratorAgentConfig({
        subagents: [{ ...subagent, agentId: ASK_ADMIN_AGENT_ID }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "provisioning.connections.reservedSubagentAgentId" },
    });
  });

  it("records the GitHub connection vault label without token material", () => {
    expect(
      buildGitHubConnectionProvisioningReceipt({ repository: "anthonykewl20/opzava" }),
    ).toEqual({
      provider: "github",
      repository: "anthonykewl20/opzava",
      secretLabel: "github-issues-token",
      storage: "SecretsVaultPort",
      tokenMaterialIncluded: false,
    });
  });

  it("serves the internal Connections provisioning endpoint behind the shared token", async () => {
    const refreshInputs: unknown[] = [];
    const server = createConnectionsInternalHttpServer({
      provisioningPort: {
        ...fakeProvisioningPort(),
        refreshConnectionsSnapshot: async (input) => {
          refreshInputs.push(input);
          return ok(connectionsSnapshot());
        },
      },
      internalToken: "local-provisioning-token",
    });
    const baseUrl = await listen(server);

    try {
      const unauthorized = await fetch(`${baseUrl}/internal/connections/snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: "org-1",
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          roleKeys: ["admin"],
        }),
      });
      expect(unauthorized.status).toBe(401);

      const authorized = await fetch(`${baseUrl}/internal/connections/snapshot`, {
        method: "POST",
        headers: {
          authorization: "Bearer local-provisioning-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orgId: "org-1",
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          roleKeys: ["admin"],
        }),
      });
      expect(authorized.status).toBe(200);
      await expect(authorized.json()).resolves.toMatchObject({
        gateway: { status: "active" },
        providerConnections: [{ providerId: "zai" }],
      });

      const refreshed = await fetch(`${baseUrl}/internal/connections/refresh`, {
        method: "POST",
        headers: {
          authorization: "Bearer local-provisioning-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orgId: "org-1",
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          roleKeys: ["admin"],
        }),
      });
      expect(refreshed.status).toBe(200);
      expect(refreshInputs).toEqual([expect.objectContaining({ workspaceId: "workspace-1" })]);
    } finally {
      await closeServer(server);
    }
  });

  it("validates and forwards synchronous model toggle requests", async () => {
    const inputs: unknown[] = [];
    const server = createConnectionsInternalHttpServer({
      provisioningPort: {
        ...fakeProvisioningPort(),
        setModelProviderModelEnabled: async (input) => {
          inputs.push(input);
          return ok(providerConnection());
        },
      },
      internalToken: "local-provisioning-token",
    });
    const baseUrl = await listen(server);
    const request = (enabled: unknown) =>
      fetch(`${baseUrl}/internal/connections/model/models`, {
        method: "POST",
        headers: {
          authorization: "Bearer local-provisioning-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orgId: "org-1",
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          roleKeys: ["admin"],
          providerId: "opencode-go",
          modelId: "kimi-k2.6",
          enabled,
        }),
      });

    try {
      expect((await request("true")).status).toBe(400);
      expect((await request(true)).status).toBe(200);
      expect(inputs).toEqual([
        expect.objectContaining({
          providerId: "opencode-go",
          modelId: "kimi-k2.6",
          enabled: true,
        }),
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it("resolves provisioning-worker runtime config from the production env names", () => {
    expect(
      resolveProvisioningWorkerRuntimeConfig({
        PROVISIONING_WORKER_TOKEN: "worker-token",
        PROVISIONING_WORKER_PORT: "19188",
      }),
    ).toEqual({
      internalToken: "worker-token",
      port: 19188,
    });
  });

  it("connects with least-privilege read scope for read-only admin RPC", async () => {
    const frames: unknown[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      gatewayToken: "gateway-token",
      keypair: fakeKeypair(),
      socketFactory: fakeAdminSocketFactory(frames, [
        "operator.read",
        "operator.write",
        "operator.approvals",
      ]),
      now: () => 1000,
    });

    const result = await client.request("models.list", { view: "all" });

    expect(result.ok).toBe(true);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      method: "connect",
      params: {
        client: { id: "cli", mode: "cli" },
        auth: { token: "gateway-token" },
        scopes: ["operator.read"],
      },
    });
    expect(frames[1]).toMatchObject({
      method: "models.list",
      params: { view: "all" },
    });
    expect(client.grantedScopes()).toEqual([
      "operator.read",
      "operator.write",
      "operator.approvals",
    ]);
  });

  it("uses the provisioning-only OpenClaw admin client for admin-scoped config.patch", async () => {
    const frames: unknown[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      gatewayToken: "gateway-token",
      requestedScopes: ["operator.read", "operator.admin"],
      keypair: fakeKeypair(),
      socketFactory: fakeAdminSocketFactory(frames, ["operator.read", "operator.admin"]),
      now: () => 1000,
    });

    const result = await client.request(
      "config.patch",
      { raw: "{}", baseHash: "config-hash-1" },
      { requiredScope: "operator.admin" },
    );

    expect(result.ok).toBe(true);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      method: "connect",
      params: {
        client: { id: "cli", mode: "cli" },
        auth: { token: "gateway-token" },
        scopes: ["operator.read", "operator.admin"],
      },
    });
    expect(frames[1]).toMatchObject({
      method: "config.patch",
      params: { raw: "{}", baseHash: "config-hash-1" },
    });
    expect(JSON.stringify(frames[1])).not.toContain("idempotencyKey");
  });

  it("returns a structured admin-required error before sending mutating RPCs", async () => {
    const frames: unknown[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      requestedScopes: ["operator.write", "operator.approvals"],
      keypair: fakeKeypair(),
      socketFactory: fakeAdminSocketFactory(frames, [
        "operator.read",
        "operator.write",
        "operator.approvals",
      ]),
      now: () => 1000,
    });

    const result = await client.request(
      "config.patch",
      {
        raw: JSON.stringify({ auth: { profiles: { zai: { key: "runtime-secret" } } } }),
        baseHash: "config-hash-1",
      },
      { requiredScope: "operator.admin" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected admin scope failure");
    }
    expect(result.error).toMatchObject({
      code: "provisioning.openclawAdmin.operatorAdminRequired",
      message: "operator.admin scope required — pair/upgrade an admin device.",
      details: {
        requiredScope: "operator.admin",
        grantedScopes: ["operator.read", "operator.write", "operator.approvals"],
      },
    });
    expect(frames).toHaveLength(1);
    expect(JSON.stringify(frames)).not.toContain("runtime-secret");
  });

  it("prefers the paired operator device token for OpenClaw admin RPC auth", async () => {
    const frames: unknown[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      gatewayToken: "gateway-token",
      operatorDeviceToken: "operator-device-token",
      keypair: fakeKeypair(),
      socketFactory: fakeAdminSocketFactory(frames),
      now: () => 1000,
    });

    const result = await client.request("config.get", {});

    expect(result.ok).toBe(true);
    expect(frames[0]).toMatchObject({
      method: "connect",
      params: {
        auth: { deviceToken: "operator-device-token" },
        scopes: ["operator.read"],
      },
    });
    expect(JSON.stringify(frames[0])).not.toContain("gateway-token");
  });

  it("retries an idempotent read after a mid-request gateway drop", async () => {
    const clock = new TestClock();
    const sockets: TestAdminSocket[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      keypair: fakeKeypair(),
      socketFactory: () => {
        const socket = new TestAdminSocket((activeSocket, frame) => {
          if (sockets.length === 1 && frame["method"] === "config.get") {
            activeSocket.closeFromGateway();
            return;
          }

          activeSocket.respondOk(frame, { hash: "config-hash-recovered" });
        });
        sockets.push(socket);
        return socket;
      },
      clock,
      reconnectInitialBackoffMs: 10,
      reconnectJitterRatio: 0,
    });

    const result = await client.request("config.get", {});

    expect(result).toEqual(ok({ hash: "config-hash-recovered" }));
    expect(sockets).toHaveLength(2);
    expect(sockets.flatMap((socket) => socket.frames.map((frame) => frame["method"]))).toEqual([
      "connect",
      "config.get",
      "connect",
      "config.get",
    ]);
  });

  it("uses exponential jittered capped backoff for reconnect attempts", async () => {
    const clock = new TestClock();
    let attempts = 0;
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      keypair: fakeKeypair(),
      socketFactory: () => {
        attempts += 1;
        throw new Error("gateway down");
      },
      clock,
      random: () => 1,
      reconnectInitialBackoffMs: 100,
      reconnectMaxBackoffMs: 250,
      reconnectMaxAttempts: 4,
      reconnectJitterRatio: 0.5,
      circuitBreakerFailureThreshold: 10,
    });

    const resultPromise = client.request("config.get", {});
    await flushMicrotasks();
    expect(clock.delays).toEqual([150]);
    clock.advance(150);
    await flushMicrotasks();
    expect(clock.delays).toEqual([150, 250]);
    clock.advance(250);
    await flushMicrotasks();
    expect(clock.delays).toEqual([150, 250, 250]);
    clock.advance(250);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(attempts).toBe(4);
  });

  it("opens the gateway circuit breaker then half-opens after cooldown", async () => {
    const clock = new TestClock();
    const sockets: TestAdminSocket[] = [];
    let attempts = 0;
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      keypair: fakeKeypair(),
      socketFactory: () => {
        attempts += 1;
        if (attempts <= 2) {
          throw new Error("gateway down");
        }

        const socket = new TestAdminSocket((activeSocket, frame) =>
          activeSocket.respondOk(frame, { ok: true }),
        );
        sockets.push(socket);
        return socket;
      },
      clock,
      reconnectInitialBackoffMs: 10,
      reconnectJitterRatio: 0,
      reconnectMaxAttempts: 4,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerCooldownMs: 1_000,
    });

    const openedPromise = client.request("config.get", {});
    await flushMicrotasks();
    clock.advance(10);
    const opened = await openedPromise;
    expect(opened.ok).toBe(false);
    expect(opened.ok ? null : opened.error).toMatchObject({
      code: "provisioning.openclawAdmin.gatewayCircuitOpen",
      details: expect.objectContaining({
        reason: "gateway_unreachable_retrying",
        retryAfterMs: 1_000,
      }),
    });

    const fastFailed = await client.request("models.list", { view: "all" });
    expect(fastFailed.ok).toBe(false);
    expect(attempts).toBe(2);

    clock.advance(1_000);
    const recovered = await client.request("models.list", { view: "all" });

    expect(recovered).toEqual(ok({ ok: true }));
    expect(attempts).toBe(3);
    expect(sockets).toHaveLength(1);
  });

  it("does not auto-retry a mutating RPC after a mid-request drop", async () => {
    const clock = new TestClock();
    const sockets: TestAdminSocket[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      requestedScopes: ["operator.read", "operator.admin"],
      keypair: fakeKeypair(),
      socketFactory: () => {
        const socket = new TestAdminSocket((activeSocket, frame) => {
          if (frame["method"] === "config.patch") {
            activeSocket.closeFromGateway();
            return;
          }

          activeSocket.respondOk(frame, { ok: true });
        });
        sockets.push(socket);
        return socket;
      },
      clock,
    });

    const result = await client.request(
      "config.patch",
      { raw: "{}", baseHash: "config-hash-1" },
      { requiredScope: "operator.admin" },
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe(
      "provisioning.openclawAdmin.connectionClosed",
    );
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.frames.map((frame) => frame["method"])).toEqual(["connect", "config.patch"]);
  });

  it("does not recycle an idle socket while a request is in flight", async () => {
    const clock = new TestClock();
    const sockets: TestAdminSocket[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      requestedScopes: ["operator.read", "operator.admin"],
      keypair: fakeKeypair(),
      socketFactory: () => {
        const socket = new TestAdminSocket(() => {});
        sockets.push(socket);
        return socket;
      },
      clock,
      idleTimeoutMs: 100,
      requestTimeoutMs: 250,
    });

    const resultPromise = client.request(
      "config.patch",
      { raw: "{}", baseHash: "config-hash-1" },
      { requiredScope: "operator.admin" },
    );

    await flushMicrotasks();
    clock.advance(100);
    expect(sockets[0]?.closed).toBe(false);

    clock.advance(150);
    const result = await resultPromise;
    expect(result.ok ? null : result.error.code).toBe("provisioning.openclawAdmin.requestTimeout");
    expect(sockets[0]?.closed).toBe(false);

    clock.advance(100);
    expect(sockets[0]?.closed).toBe(true);
  });

  it("recycles an idle socket before the next request uses it", async () => {
    const clock = new TestClock();
    const sockets: TestAdminSocket[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      keypair: fakeKeypair(),
      socketFactory: () => {
        const socket = new TestAdminSocket((activeSocket, frame) =>
          activeSocket.respondOk(frame, { hash: `config-hash-${sockets.length}` }),
        );
        sockets.push(socket);
        return socket;
      },
      clock,
      idleTimeoutMs: 100,
    });

    expect(await client.request("config.get", {})).toEqual(ok({ hash: "config-hash-1" }));
    clock.advance(100);
    await flushMicrotasks();
    expect(sockets[0]?.closed).toBe(true);

    expect(await client.request("config.get", {})).toEqual(ok({ hash: "config-hash-2" }));
    expect(sockets).toHaveLength(2);
  });

  it("redacts gateway close reasons before logging handshake failures", async () => {
    const logs: { readonly message: string; readonly details: Record<string, unknown> }[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "operator-device-token",
      keypair: fakeKeypair(),
      socketFactory: () => {
        let onClose:
          ((event?: { readonly code?: number; readonly reason?: string }) => void) | null = null;
        return {
          send() {
            queueMicrotask(() =>
              onClose?.({ code: 1012, reason: "gateway restart token=secret-token-value" }),
            );
          },
          close() {},
          onMessage(listener) {
            queueMicrotask(() =>
              listener(
                JSON.stringify({
                  type: "event",
                  event: "connect.challenge",
                  payload: { nonce: "nonce-1", ts: 1 },
                }),
              ),
            );
          },
          onClose(listener) {
            onClose = listener;
          },
          onError() {},
        };
      },
      logger: {
        error(message, details) {
          logs.push({ message, details });
        },
      },
    });

    const result = await client.request("config.get", {});

    expect(result.ok).toBe(false);
    expect(logs[0]?.details).toMatchObject({
      closeCode: 1012,
      closeReason: "gateway restart token=[redacted]",
    });
    expect(JSON.stringify(logs)).not.toContain("secret-token-value");
  });

  it("loads the worker admin device token from the vault by worker label", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opzava-worker-vault-"));
    tempDirectories.push(directory);
    const vaultFile = join(directory, "openclaw-secrets.json");
    const workerAdminToken = `worker-admin-token-${randomUUID()}`;
    const stored = await new LocalFileSecretsVault({ filePath: vaultFile }).putSecret({
      tenantId: "platform" as TenantId,
      purpose: "openclaw",
      label: "platform-worker-admin-device-token",
      value: workerAdminToken,
    });
    if (!stored.ok) {
      throw stored.error;
    }

    const frames: unknown[] = [];
    stubGlobalAdminWebSocket(frames);
    const port = createDefaultConnectionsProvisioningPort({
      OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
      OPENCLAW_DEV_SECRETS_FILE: vaultFile,
      OPENCLAW_DEVICE_PRIVATE_KEY_PEM: testEd25519PrivateKeyPem(),
      GITHUB_ISSUES_REPOSITORY: "anthonykewl20/opzava",
    });

    await port.getConnectionsSnapshot(principal());

    expect(frames[0]).toMatchObject({
      method: "connect",
      params: {
        auth: { deviceToken: workerAdminToken },
        scopes: ["operator.read", "operator.admin"],
      },
    });
  });

  it("logs a structured worker admin token error instead of silently returning unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opzava-worker-vault-"));
    tempDirectories.push(directory);
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message) => {
      logs.push(String(message));
    });
    const port = createDefaultConnectionsProvisioningPort({
      OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
      OPENCLAW_DEV_SECRETS_FILE: join(directory, "openclaw-secrets.json"),
      OPENCLAW_DEVICE_PRIVATE_KEY_PEM: testEd25519PrivateKeyPem(),
      GITHUB_ISSUES_REPOSITORY: "anthonykewl20/opzava",
    });

    await port.getConnectionsSnapshot(principal());

    expect(logs.map((entry) => JSON.parse(entry))).toContainEqual(
      expect.objectContaining({
        code: "provisioning.openclawAdmin.operatorWsHandshakeFailed",
        cause: "missing_token",
        vaultLabel: "platform-worker-admin-device-token",
      }),
    );
  });

  it("logs a structured pairing-not-approved handshake rejection", async () => {
    const logs: { readonly message: string; readonly details: Record<string, unknown> }[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      operatorDeviceToken: "unapproved-token",
      requestedScopes: ["operator.read", "operator.admin"],
      keypair: fakeKeypair(),
      socketFactory: () => {
        let onMessage: ((data: string) => void) | null = null;
        return {
          send(data) {
            const frame = JSON.parse(data) as Record<string, unknown>;
            queueMicrotask(() =>
              onMessage?.(
                JSON.stringify({
                  type: "res",
                  id: frame["id"],
                  ok: false,
                  error: { code: "PAIRING_REQUIRED", message: "approval required" },
                }),
              ),
            );
          },
          close() {},
          onMessage(listener) {
            onMessage = listener;
            queueMicrotask(() =>
              listener(
                JSON.stringify({
                  type: "event",
                  event: "connect.challenge",
                  payload: { nonce: "nonce-1", ts: 1 },
                }),
              ),
            );
          },
          onClose() {},
          onError() {},
        };
      },
      logger: {
        error(message, details) {
          logs.push({ message, details });
        },
      },
    });

    const result = await client.request("config.get", {});

    expect(result.ok).toBe(false);
    expect(logs).toContainEqual({
      message: "provisioning.openclawAdmin.operatorWsHandshakeFailed",
      details: expect.objectContaining({
        cause: "pairing_not_approved",
        gatewayCode: "PAIRING_REQUIRED",
        requestedScopes: ["operator.read", "operator.admin"],
      }),
    });
  });

  it("maps config.get and models.list into a Connections snapshot", async () => {
    const admin = new RecordingAdminClient(
      {
        "config.get": ok({
          region: "config-region",
          auth: {
            profiles: {
              "zai-zai-api-key": {
                providerId: "zai",
                authChoiceId: "zai-api-key",
                accountLabel: "Z.AI",
                model: "zai/glm-5.2",
              },
            },
            order: { zai: ["zai-zai-api-key"] },
          },
          agents: {
            defaults: {
              model: { primary: "zai/glm-5.2" },
              models: { "zai/glm-5.2": {} },
            },
            list: [{ id: "ask-admin-opzava", model: "openai/gpt-5.5" }],
          },
          models: {
            providers: {
              openrouter: { model: { primary: "openrouter/auto" } },
            },
          },
        }),
        health: ok({
          status: "ok",
          region: "fra1",
          auth: { role: "operator", scopes: ["operator.read", "operator.write"] },
        }),
        "last-heartbeat": ok({
          gateway: {
            lastHeartbeatAt: "2026-07-02T23:59:00.000Z",
          },
        }),
        "models.list": ok({
          providers: [
            {
              id: "zai",
              label: "z.ai / GLM",
              vendor: "z.ai",
              suggestedModel: "zai/glm-5.2",
              authChoices: [apiKeyChoice()],
            },
            {
              id: "deepgram",
              label: "Deepgram",
              vendor: "Deepgram",
              suggestedModel: "deepgram/nova-3",
              authChoices: [],
            },
            {
              id: "openrouter",
              label: "OpenRouter",
              vendor: "OpenRouter",
              suggestedModel: "openrouter/auto",
              authChoices: [],
            },
          ],
          models: [
            { id: "glm-4.7", name: "GLM 4.7", provider: "zai", available: true },
            { id: "glm-5.2", name: "GLM 5.2", provider: "zai", available: true },
            { id: "nova-3", name: "Nova 3", provider: "deepgram", available: true },
          ],
        }),
        "models.authStatus": ok({
          providers: [
            {
              provider: "zai",
              displayName: "Z.AI Coding",
              status: "expiring",
              profiles: [{ profileId: "zai:manual", type: "api_key", status: "expiring" }],
              expiry: { label: "2h" },
              usage: {
                plan: "Coding",
                windows: [{ label: "daily", usedPercent: 32 }],
              },
            },
            {
              provider: "deepgram",
              displayName: "Deepgram",
              status: "missing",
              profiles: [],
            },
            {
              provider: "openrouter",
              displayName: "OpenRouter",
              status: "expired",
              profiles: [{ profileId: "openrouter:oauth", type: "oauth", status: "expired" }],
              expiry: { label: "expired" },
            },
          ],
        }),
      },
      ["operator.read", "operator.write", "operator.approvals"],
    );
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const snapshot = await port.getConnectionsSnapshot(principal());

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) {
      throw snapshot.error;
    }
    expect(snapshot.value.gateway.status).toBe("active");
    expect(snapshot.value.gateway).toMatchObject({
      region: "fra1",
      authLabel: "Opzava Gateway operator.read, operator.write, operator.approvals",
      lastHeartbeatAt: "2026-07-02T23:59:00.000Z",
    });
    expect(snapshot.value.providerCatalog[0]).toMatchObject({
      id: "zai",
      label: "Z.AI (GLM)",
      category: "llm",
      // Enabled model from agents.defaults.models, not the raw catalog list.
      models: expect.arrayContaining([expect.objectContaining({ id: "glm-5.2" })]),
    });
    expect(
      snapshot.value.providerCatalog.find((provider) => provider.id === "deepgram"),
    ).toMatchObject({
      id: "deepgram",
      category: "non-llm",
      // No configured model in agent config -> Models is empty (never the raw catalog list).
      models: [],
    });
    expect(snapshot.value.providerConnections[0]).toMatchObject({
      providerId: "zai",
      status: "connected",
      authChoiceId: "zai-api-key",
      model: "zai/glm-5.2",
      authHealth: "expiring",
      connectedAuthMode: "api_key",
      expiryLabel: "2h",
      planLabel: "Coding",
      usageLabel: "68% window left",
      accountLabel: "Z.AI Coding",
    });
    expect(
      snapshot.value.providerConnections.find((connection) => connection.providerId === "deepgram"),
    ).toMatchObject({
      providerId: "deepgram",
      status: "not_connected",
      authHealth: "missing",
    });
    expect(
      snapshot.value.providerConnections.find(
        (connection) => connection.providerId === "openrouter",
      ),
    ).toMatchObject({
      providerId: "openrouter",
      status: "needs_attention",
      model: "openrouter/auto",
      authHealth: "expired",
      connectedAuthMode: "oauth",
      expiryLabel: "expired",
    });
    expect(admin.calls.find((call) => call.method === "models.list")?.params).toEqual({
      view: "all",
    });
    expect(admin.calls.find((call) => call.method === "models.authStatus")?.params).toEqual({
      refresh: false,
    });
    expect(snapshot.value.orchestrator).toMatchObject({
      orchestratorModel: "zai/glm-5.2",
      orchestratorProviderId: "zai",
    });
  });

  it("falls back to models status CLI when models.authStatus is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "config.get": ok({
        region: "config-region",
        auth: {
          profiles: {
            "zai-zai-api-key": {
              providerId: "zai",
              authChoiceId: "zai-api-key",
              accountLabel: "Z.AI",
              model: "zai/glm-5.2",
            },
          },
          order: { zai: ["zai-zai-api-key"] },
        },
      }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({ lastHeartbeatAt: "2026-07-03T00:00:00.000Z" }),
      "models.list": ok({
        providers: [
          {
            id: "zai",
            label: "z.ai / GLM",
            vendor: "z.ai",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
        models: [{ id: "glm-4.7", name: "GLM 4.7", provider: "zai", available: true }],
      }),
      "models.authStatus": err(
        new DomainError({
          code: "openclaw.methodNotFound",
          message: "models.authStatus is not advertised.",
        }),
      ),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      status: {
        allowed: ["zai/glm-4.7"],
        auth: {
          providers: [
            {
              provider: "zai",
              profiles: { count: 1, labels: ["zai:manual=API key"] },
            },
          ],
        },
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    try {
      const snapshot = await port.getConnectionsSnapshot(principal());

      expect(snapshot.ok).toBe(true);
      if (!snapshot.ok) {
        throw snapshot.error;
      }
      expect(warn).toHaveBeenCalledWith("connections.authStatus.fallback");
      expect(gatewayRuntime.modelStatusCalls).toBe(1);
      expect(snapshot.value.providerCatalog.map((provider) => provider.id)).toContain("zai");
      expect(snapshot.value.providerConnections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerId: "zai",
            status: "connected",
            // configured model from the connected auth profile (auth.profiles[].model), not catalog
            model: "zai/glm-5.2",
            usageLabel: "1 auth profile",
          }),
        ]),
      );
      expect(JSON.stringify(admin.calls)).not.toContain("secret-provider-key");
      expect(JSON.stringify(snapshot.value)).not.toContain("secret-provider-key");
    } finally {
      warn.mockRestore();
    }
  });

  it("uses CLI api-key profile truth for connected providers and authStatus only for health", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "config.get": ok({
        region: "config-region",
        agents: {
          defaults: {
            models: {
              "openai/gpt-5.5": {},
              "opencode-go/kimi-k2.6": {},
              "zai/glm-5.1": {},
              "qwen/qwen3.5-plus": {},
              "openrouter/auto": {},
            },
          },
        },
      }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({ lastHeartbeatAt: "2026-07-03T00:00:00.000Z" }),
      "models.list": ok({
        providers: [
          { id: "openai", label: "OpenAI", authChoices: [] },
          {
            id: "opencode-go",
            label: "OpenCode Go",
            authChoices: [
              apiKeyChoice({
                id: "opencode-go-api-key",
                providerId: "opencode-go",
                keyFlag: "opencode-go-api-key",
              }),
            ],
          },
          { id: "zai", label: "Z.AI", authChoices: [apiKeyChoice()] },
          {
            id: "qwen",
            label: "Qwen",
            authChoices: [
              apiKeyChoice({ id: "qwen-api-key", providerId: "qwen", keyFlag: "qwen-api-key" }),
            ],
          },
          { id: "moonshot", label: "Moonshot", authChoices: [] },
          { id: "minimax", label: "MiniMax", authChoices: [] },
          { id: "openrouter", label: "OpenRouter", authChoices: [] },
        ],
      }),
      "models.authStatus": ok({
        providers: [
          {
            provider: "openai",
            displayName: "OpenAI OAuth",
            status: "ok",
            profiles: [{ profileId: "openai:oauth", type: "oauth", status: "ok" }],
          },
          {
            provider: "openrouter",
            displayName: "OpenRouter",
            status: "expired",
            profiles: [{ profileId: "openrouter:oauth", type: "oauth", status: "expired" }],
          },
          {
            provider: "qwen",
            displayName: "Qwen OAuth",
            status: "ok",
            profiles: [{ profileId: "qwen:oauth", type: "oauth", status: "ok" }],
          },
          {
            provider: "moonshot",
            displayName: "Moonshot",
            status: "ok",
            profiles: [{ profileId: "moonshot:manual", type: "api_key", status: "ok" }],
          },
        ],
      }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      status: {
        allowed: ["openai/gpt-5.5", "opencode-go/kimi-k2.6", "zai/glm-5.1", "moonshot/kimi-k2.6"],
        auth: {
          providers: [
            {
              provider: "openai",
              profiles: { count: 1, oauth: 1, labels: ["openai:oauth=OAuth"] },
            },
            {
              provider: "opencode-go",
              profiles: { api_key: 1, labels: ["opencode-go:default=API key"] },
            },
            {
              provider: "zai",
              profiles: { count: 1, api_key: 1, labels: ["zai:default=API key"] },
            },
            {
              provider: "moonshot",
              profiles: { count: 1, api_key: 1, labels: ["moonshot:default=API key"] },
            },
            {
              provider: "minimax",
              profiles: { count: 1, api_key: 1, labels: ["minimax:default=API key"] },
            },
          ],
        },
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const snapshot = await port.getConnectionsSnapshot(principal());

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) {
      throw snapshot.error;
    }
    expect(gatewayRuntime.modelStatusCalls).toBe(1);
    expect(snapshot.value.providerConnections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "openai",
          status: "connected",
          authHealth: "ok",
          connectedAuthMode: "oauth",
        }),
        expect.objectContaining({
          providerId: "opencode-go",
          status: "connected",
          model: "opencode-go/kimi-k2.6",
          connectedAuthMode: "api_key",
          usageLabel: "1 auth profile",
        }),
        expect.objectContaining({
          providerId: "zai",
          status: "connected",
          model: "zai/glm-5.1",
          connectedAuthMode: "api_key",
        }),
        expect.objectContaining({
          providerId: "qwen",
          status: "not_connected",
          model: "qwen/qwen3.5-plus",
          connectedAuthMode: null,
        }),
        expect.objectContaining({
          providerId: "moonshot",
          status: "connected",
          connectedAuthMode: "api_key",
          model: null,
        }),
        expect.objectContaining({
          providerId: "minimax",
          status: "needs_attention",
          connectedAuthMode: "api_key",
          model: null,
        }),
        expect.objectContaining({
          providerId: "openrouter",
          status: "needs_attention",
          authHealth: "expired",
          connectedAuthMode: "oauth",
        }),
      ]),
    );
  });

  it("reports the connected runtime provider whose routed model is the gateway primary", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        region: "config-region",
        agents: {
          defaults: {
            model: { primary: "anthropic/claude-sonnet-4.5" },
          },
        },
        models: {
          providers: {
            "claude-cli": { model: "anthropic/claude-sonnet-4.5" },
          },
        },
      }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({ lastHeartbeatAt: "2026-07-03T00:00:00.000Z" }),
      "models.list": ok({
        providers: [
          {
            id: "claude-cli",
            label: "Claude CLI",
            suggestedModel: "anthropic/claude-sonnet-4.5",
            authChoices: [],
          },
          {
            id: "anthropic",
            label: "Anthropic",
            suggestedModel: "anthropic/claude-sonnet-4.5",
            authChoices: [],
          },
        ],
      }),
      "models.authStatus": ok({
        providers: [
          {
            provider: "claude-cli",
            displayName: "Claude CLI",
            status: "ok",
            profiles: [{ profileId: "claude-cli:oauth", type: "oauth", status: "ok" }],
          },
        ],
      }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      status: {
        allowed: ["anthropic/claude-sonnet-4.5"],
        auth: {
          providers: [
            {
              provider: "claude-cli",
              profiles: { count: 1, oauth: 1, labels: ["claude-cli:oauth=OAuth"] },
            },
          ],
        },
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const snapshot = await port.getConnectionsSnapshot(principal());

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) {
      throw snapshot.error;
    }
    expect(snapshot.value.providerConnections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "claude-cli",
          status: "connected",
          model: "anthropic/claude-sonnet-4.5",
        }),
      ]),
    );
    expect(snapshot.value.orchestrator).toMatchObject({
      orchestratorModel: "anthropic/claude-sonnet-4.5",
      orchestratorProviderId: "claude-cli",
    });
  });

  it("surfaces canonical LLM connect targets that have onboard auth-choices but no models yet", async () => {
    // Several provider plugins have no bundled models until connected, so models.list omits them —
    // but the live gateway advertises their onboard auth-choices, so the connect surface MUST still
    // list them with the canonical Slice 3.7 labels.
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "config-hash-1", plugins: { allow: [] } }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({ lastHeartbeatAt: "2026-07-03T00:00:00.000Z" }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        {
          id: "openrouter-api-key",
          label: "OpenRouter API key",
          mode: "api-key",
          keyFlag: "openrouter-api-key",
        },
        { id: "openrouter-oauth", label: "OpenRouter OAuth", mode: "device-flow" },
        {
          id: "opencode-go-api-key",
          label: "OpenCode Go API key",
          mode: "api-key",
          keyFlag: "opencode-go-api-key",
        },
        { id: "qwen-oauth", label: "Qwen OAuth", mode: "device-flow" },
        {
          id: "cloudflare-ai-gateway-api-key",
          label: "Cloudflare AI Gateway API key",
          mode: "api-key",
          keyFlag: "cloudflare-ai-gateway-api-key",
        },
        {
          id: "minimax-api-key",
          label: "MiniMax API key",
          mode: "api-key",
          keyFlag: "minimax-api-key",
        },
        {
          id: "xiaomi-api-key",
          label: "Xiaomi API key",
          mode: "api-key",
          keyFlag: "xiaomi-api-key",
        },
        {
          id: "claude-max-api-proxy",
          label: "Claude Max proxy subscription",
          mode: "device-flow",
        },
        { id: "zai-api-key", label: "Z.AI API key", mode: "api-key", keyFlag: "zai-api-key" },
        { id: "xai-api-key", label: "xAI API key", mode: "api-key", keyFlag: "xai-api-key" },
      ],
      status: { allowed: [], auth: { providers: [] } },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const snapshot = await port.getConnectionsSnapshot(principal());
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) {
      throw snapshot.error;
    }
    const ids = snapshot.value.providerCatalog.map((provider) => provider.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("opencode-go");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("qwen");
    expect(ids).toContain("cloudflare-ai-gateway");
    expect(ids).toContain("minimax");
    expect(ids).toContain("xiaomi");
    expect(ids).toContain("xai");
    const openrouter = snapshot.value.providerCatalog.find(
      (provider) => provider.id === "openrouter",
    );
    expect(openrouter?.authChoices.length).toBeGreaterThan(0);
    expect(openrouter?.models).toEqual([]);
    expect(openrouter?.category).toBe("llm");
    expect(snapshot.value.providerCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "anthropic", label: "Anthropic" }),
        expect.objectContaining({ id: "qwen", label: "Alibaba Model Studio" }),
        expect.objectContaining({ id: "zai", label: "Z.AI (GLM)" }),
        expect.objectContaining({ id: "xiaomi", label: "Xiaomi MiMo" }),
      ]),
    );
  });

  it("patches provider API-key auth profiles without returning the key material", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "config-hash-1", plugins: { allow: ["codex"] } }),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime();
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "zai",
      authChoiceId: "zai-api-key",
      apiKey: "secret-provider-key",
    });
    expect(start).toMatchObject({ ok: true, value: { status: "pending" } });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok).toBe(true);
    expect(admin.calls[0]).toMatchObject({ method: "config.get" });
    expect(admin.calls[1]).toMatchObject({
      method: "config.patch",
      params: {
        baseHash: "config-hash-1",
        replacePaths: ["plugins.allow"],
      },
    });
    expect(rawPatch(admin.calls[1]!.params)).toEqual({
      plugins: {
        allow: ["codex", "zai"],
      },
    });
    expect(admin.calls[1]?.params).not.toHaveProperty("patch");
    expect(admin.calls[1]?.params).not.toHaveProperty("receipt");
    expect(admin.calls[1]?.idempotencyKey).toBeUndefined();
    expect(gatewayRuntime.connectCalls).toEqual([
      {
        providerId: "zai",
        authChoiceId: "zai-api-key",
        keyFlag: "zai-api-key",
        apiKey: "secret-provider-key",
      },
    ]);
    expect(result.ok ? result.value : null).toMatchObject({
      status: "connected",
      connection: {
        providerId: "zai",
        status: "connected",
        authChoiceId: "zai-api-key",
        usageLabel: "1 auth profile",
      },
    });
    expect(JSON.stringify(admin.calls)).not.toContain("secret-provider-key");
    expect(JSON.stringify(result)).not.toContain("secret-provider-key");
  });

  it("connects Anthropic setup-token through onboard token auth instead of device-code", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "config-hash-setup-token", plugins: { allow: ["anthropic"] } }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        {
          id: "setup-token",
          label: "Anthropic setup-token",
          mode: "api-key",
          keyFlag: "token",
        },
      ],
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
            },
          ],
        },
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "anthropic",
      authChoiceId: "setup-token",
      apiKey: `sk-ant-oat01-${"a".repeat(95)}`,
    });
    expect(start).toMatchObject({ ok: true, value: { status: "pending" } });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok).toBe(true);
    expect(gatewayRuntime.connectCalls).toEqual([
      {
        providerId: "anthropic",
        authChoiceId: "setup-token",
        keyFlag: "token",
        apiKey: `sk-ant-oat01-${"a".repeat(95)}`,
      },
    ]);
    expect(gatewayRuntime.deviceLoginCalls).toEqual([]);
    expect(result.ok ? result.value : null).toMatchObject({
      status: "connected",
      connection: {
        providerId: "anthropic",
        status: "connected",
        authChoiceId: "setup-token",
        connectedAuthMode: "token",
      },
    });
    expect(JSON.stringify(result)).not.toContain("sk-ant-oat01");
  });

  // REPRO (bug): "Gateway onboard completed, but models status did not report a usable provider
  // credential." Mirrors the live Opzava Gateway: Anthropic is NOT in agents.defaults.models nor
  // in `models status` -> `allowed`; the ONLY signal that Anthropic is routable is
  // agents.defaults.model.primary (= anthropic/claude-opus-4-8), which the onboard sets WHILE
  // connecting the Claude subscription. completeModelProviderApiKeyConnect reads config.get BEFORE
  // the onboard, so it classifies against the pre-onboard primary (openai) and returns a false
  // negative even though the credential was written and is usable.
  it("connects Anthropic even when the onboard is what sets the default model (stale pre-onboard config)", async () => {
    const preOnboardConfig = {
      hash: "config-hash-stale-pre",
      config: {
        agents: {
          defaults: { models: { "openai/gpt-5.5": {} }, model: { primary: "openai/gpt-5.5" } },
        },
        plugins: { entries: { anthropic: { enabled: true } } },
      },
    };
    const postOnboardConfig = {
      hash: "config-hash-stale-post",
      config: {
        agents: {
          defaults: {
            models: { "openai/gpt-5.5": {} },
            model: { primary: "anthropic/claude-opus-4-8" },
          },
        },
        plugins: { entries: { anthropic: { enabled: true } } },
      },
    };
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      // Real live `models status`: anthropic token profile present, but anthropic is NOT in `allowed`.
      status: {
        allowed: ["openai/gpt-5.5", "opencode-go/kimi-k2.6", "zai/glm-5.1", "zai/glm-5.2"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:default=Setup token"] },
            },
          ],
        },
      },
    });
    // The onboard mutates agents.defaults.model.primary -> anthropic; a config read AFTER the
    // onboard sees it, a read before does not.
    const admin = new RecordingAdminClient({
      "config.get": () =>
        ok(gatewayRuntime.connectCalls.length === 0 ? preOnboardConfig : postOnboardConfig),
      // Connect registers the shared `main` agent so the credential can be written where every
      // agent inherits it (issue #169).
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "anthropic",
      authChoiceId: "setup-token",
      apiKey: `sk-ant-oat01-${"a".repeat(95)}`,
    });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok ? result.value : result.error).toMatchObject({
      status: "connected",
      connection: { providerId: "anthropic", status: "connected" },
    });
  });

  it("moves the orchestrator agent with the primary the onboard just changed (#186)", async () => {
    // The live bug: connecting Anthropic on a stack whose OpenAI was disconnected left the gateway
    // primary on anthropic (the onboard moves it) while the ask-admin agent still carried
    // openai/gpt-5.5 -- so the UI called Anthropic the main orchestrator and Ask Admin died with
    // "Codex app-server auth profile was not found". Connect must bring the orchestrator with it.
    const askAdminEntry = {
      id: "ask-admin-opzava",
      model: "openai/gpt-5.5",
      tools: {
        profile: "minimal",
        allow: ASK_ADMIN_TOOL_POLICY_ALLOW,
        deny: ASK_ADMIN_TOOL_POLICY_DENY,
      },
    };
    const preOnboardConfig = {
      hash: "config-hash-186-pre",
      config: {
        agents: {
          defaults: { models: { "openai/gpt-5.5": {} }, model: { primary: "openai/gpt-5.5" } },
          list: [askAdminEntry],
        },
        plugins: { entries: { anthropic: { enabled: true } } },
      },
    };
    const postOnboardConfig = {
      hash: "config-hash-186-post",
      config: {
        agents: {
          defaults: {
            models: { "openai/gpt-5.5": {} },
            model: { primary: "anthropic/claude-opus-4-8" },
          },
          list: [askAdminEntry],
        },
        plugins: { entries: { anthropic: { enabled: true } } },
      },
    };
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      status: {
        allowed: ["anthropic/claude-opus-4-8"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:default=Setup token"] },
            },
          ],
        },
      },
    });
    const admin = new RecordingAdminClient({
      "config.get": () =>
        ok(gatewayRuntime.connectCalls.length === 0 ? preOnboardConfig : postOnboardConfig),
      "models.list": ok({
        providers: [
          {
            id: "anthropic",
            label: "Anthropic",
            suggestedModel: "claude-opus-4-8",
            authChoices: [
              apiKeyChoice({
                id: "setup-token",
                providerId: "anthropic",
                keyFlag: "token",
              }),
            ],
          },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "anthropic",
      authChoiceId: "setup-token",
      apiKey: `sk-ant-oat01-${"a".repeat(95)}`,
    });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok ? result.value : result.error).toMatchObject({
      status: "connected",
      connection: { providerId: "anthropic", status: "connected" },
    });

    // The reconcile patch, which is the LAST one: connect also rewrites agents.list earlier to
    // register the shared `main` credential agent (#169), and that patch carries the ask-admin entry
    // through UNCHANGED. Reading the first match would assert against the pre-reconcile state.
    const askAdminPatch = admin.calls
      .filter((call) => call.method === "config.patch")
      .map(
        (call) =>
          rawPatch(call.params) as {
            agents?: { list?: readonly { id?: string; model?: string }[] };
          },
      )
      .reverse()
      .find((patch) => patch.agents?.list?.some((agent) => agent.id === "ask-admin-opzava"));

    expect(askAdminPatch).toBeDefined();
    const askAdmin = askAdminPatch?.agents?.list?.find((agent) => agent.id === "ask-admin-opzava");
    expect(askAdmin?.model).toBe("anthropic/claude-opus-4-8");
  });

  it("waits out the gateway write rate limit rather than dropping the reconcile (#186)", async () => {
    // Found by driving the real stack: a disconnect spends the gateway's control-plane write budget
    // (its own config.patch plus a paced models.authLogout per agent), so the reconcile's patch came
    // back "rate limit exceeded for config.patch; retry after 36s" and was dropped -- leaving Ask
    // Admin routed at the provider that had just been disconnected. Exactly the bug, on the path
    // that matters most.
    const askAdminEntry = {
      id: "ask-admin-opzava",
      model: "openai/gpt-5.5",
      tools: {
        profile: "minimal",
        allow: ASK_ADMIN_TOOL_POLICY_ALLOW,
        deny: ASK_ADMIN_TOOL_POLICY_DENY,
      },
    };
    const config = {
      hash: "config-hash-186-rate",
      config: {
        agents: {
          defaults: { model: { primary: "anthropic/claude-opus-4-8" } },
          list: [askAdminEntry],
        },
        plugins: { entries: { anthropic: { enabled: true } } },
      },
    };
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      status: {
        allowed: ["anthropic/claude-opus-4-8"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:default=Setup token"] },
            },
          ],
        },
      },
    });
    let patchAttempts = 0;
    const admin = new RecordingAdminClient({
      "config.get": ok(config),
      "models.list": ok({
        providers: [
          {
            id: "anthropic",
            label: "Anthropic",
            suggestedModel: "claude-opus-4-8",
            authChoices: [
              apiKeyChoice({ id: "setup-token", providerId: "anthropic", keyFlag: "token" }),
            ],
          },
        ],
      }),
      "config.patch": () => {
        patchAttempts += 1;
        // The gateway's real refusal shape; retryAfterMs kept tiny so the test does not sleep 36s.
        return patchAttempts === 1
          ? err(
              new DomainError({
                code: "provisioning.openclawAdmin.requestRejected",
                message: "rate limit exceeded for config.patch; retry after 36s",
                details: { retryAfterMs: 5 },
              }),
            )
          : ok({ ok: true });
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const result = await port.applyOrchestratorDelegation({
      ...principal(),
      connectedProviderIds: ["anthropic"],
    });

    expect(result.ok).toBe(true);
    expect(patchAttempts).toBe(2);
    const patched = admin.calls
      .filter((call) => call.method === "config.patch")
      .map(
        (call) =>
          rawPatch(call.params) as {
            agents?: { list?: readonly { id?: string; model?: string }[] };
          },
      )
      .at(-1)
      ?.agents?.list?.find((agent) => agent.id === "ask-admin-opzava");
    expect(patched?.model).toBe("anthropic/claude-opus-4-8");
  });

  it("fails Anthropic setup-token when onboard never yields a routable provider", async () => {
    vi.useFakeTimers();
    try {
      const gatewayRuntime = new RecordingGatewayRuntime({
        choices: [
          { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
        ],
        status: {
          allowed: ["openai/gpt-5.5"],
          auth: {
            providers: [
              {
                provider: "anthropic",
                profiles: { count: 1, token: 1, labels: ["anthropic:default=Setup token"] },
              },
            ],
          },
        },
      });
      const admin = new RecordingAdminClient({
        "config.get": ok({
          hash: "config-hash-unroutable",
          config: {
            agents: {
              defaults: { models: { "openai/gpt-5.5": {} }, model: { primary: "openai/gpt-5.5" } },
            },
            plugins: { entries: { anthropic: { enabled: true } } },
          },
        }),
        "config.patch": ok({ ok: true }),
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime,
        now: () => new Date("2026-07-11T00:00:00.000Z"),
      });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "anthropic",
        authChoiceId: "setup-token",
        apiKey: `sk-ant-oat01-${"a".repeat(95)}`,
      });
      await vi.advanceTimersByTimeAsync(31_000);
      const result = await port.pollModelProviderApiKeyConnect({
        ...principal(),
        opId: start.ok ? start.value.opId : "",
      });

      expect(result.ok ? result.value : result.error).toMatchObject({
        status: "failed",
        code: "provisioning.connections.providerStatusNotConnected",
      });
      expect(JSON.stringify(result)).not.toContain("sk-ant-oat01");
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts Anthropic setup-token flows pending-fast", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
    });
    const port = setupTokenPort({ gatewayRuntime });

    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    expect(start).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(start.ok ? start.value.flowId : "").toMatch(/^setup:/);
    expect(gatewayRuntime.setupTokenStarts).toEqual(["start"]);
  });

  it("reads the authorize URL from the OSC-8 hyperlink, not the wrapped copy (#127)", async () => {
    // Taken from a REAL `claude setup-token` capture. The CLI prints the URL as an OSC-8 hyperlink
    // (ESC]8;id=..;<URL>BEL <label> ESC]8;;BEL). The escape payload holds the URL whole; the visible
    // label is ordinary text and the terminal WRAPS it, so a line-oriented reader truncates it
    // mid-query-string -- and a sign-in link without its code_challenge looks usable and is not.
    const full =
      "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e" +
      "&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback" +
      "&scope=user%3Ainference&code_challenge=YxO2qn16VcBh7S94u2qKKDKxGYAzZA0ZW9ie-XTa8Qw" +
      "&code_challenge_method=S256&state=QhjQlN3QG1nCCVyvJogj42xu58toIS63iMFyMwBJ6CM";
    const wrapped = `${full.slice(0, 120)}\r\n${full.slice(120, 240)}\r\n${full.slice(240)}`;
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: `Browser\u001b[8Gdidn't\u001b[15Gopen?\r\n\u001b]8;id=1atjmpz;${full}\u0007${wrapped}\u001b]8;;\u0007\r\n`,
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const poll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    const authorizeUrl = poll.ok && "authorizeUrl" in poll.value ? poll.value.authorizeUrl : null;
    expect(authorizeUrl).toBe(full);
    // The failure this guards: a link truncated at the wrap, with no code_challenge.
    expect(authorizeUrl).toContain("code_challenge=");
    expect(authorizeUrl).not.toContain("\u0007");
  });

  it("polls setup-token authorize URLs from ANSI logs", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: "\u001B[32mOpen https://claude.ai/oauth/authorize?state=abc\u001B[0m\n",
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const poll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(poll).toMatchObject({
      ok: true,
      value: {
        status: "awaiting_code",
        authorizeUrl: "https://claude.ai/oauth/authorize?state=abc",
      },
    });
  });

  it("submits setup-token authorization codes to the CLI stdin fifo", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const submitted = await port.submitModelProviderSetupTokenCode({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
      code: "oauth-code-123",
    });

    expect(submitted).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(gatewayRuntime.setupTokenWrites).toEqual([
      { stdinPath: "/tmp/opzava-st-test/stdin", value: "oauth-code-123" },
    ]);
  });

  it("keeps setup-token submitted-code exchanges pending while stale authorize URLs remain", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: "Open https://claude.ai/oauth/authorize?state=abc\n",
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });
    const awaiting = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });
    const submitted = await port.submitModelProviderSetupTokenCode({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
      code: "oauth-code-123",
    });

    const poll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(awaiting.ok ? awaiting.value.status : null).toBe("awaiting_code");
    expect(submitted).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(poll.ok ? poll.value.status : null).toBe("pending");
  });

  it("fails setup-token submitted-code exchanges after the CLI does not mint a token", async () => {
    vi.useFakeTimers();
    let nowMs = new Date("2026-07-03T00:00:00.000Z").getTime();
    try {
      const gatewayRuntime = new RecordingGatewayRuntime({
        choices: [
          { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
        ],
        setupTokenLog: "Open https://claude.ai/oauth/authorize?state=abc\n",
      });
      const port = setupTokenPort({ gatewayRuntime, now: () => new Date(nowMs) });
      const start = await port.startModelProviderSetupTokenFlow({
        ...principal(),
        providerId: "anthropic",
      });
      await port.pollModelProviderSetupTokenFlow({
        ...principal(),
        flowId: start.ok ? start.value.flowId : "",
      });
      await port.submitModelProviderSetupTokenCode({
        ...principal(),
        flowId: start.ok ? start.value.flowId : "",
        code: "oauth-code-123",
      });
      nowMs += 30_001;
      await vi.advanceTimersByTimeAsync(30_001);

      const poll = await port.pollModelProviderSetupTokenFlow({
        ...principal(),
        flowId: start.ok ? start.value.flowId : "",
      });

      expect(poll.ok ? poll.value : null).toMatchObject({
        status: "failed",
        code: "provisioning.connections.setupTokenLoginFailed",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats bare invalid setup-token authorization code logs as terminal failures", async () => {
    const logs = [
      "Error: invalid authorization code\n",
      "Error: invalid_grant\n",
      "Error: invalid_request\n",
    ];
    for (const setupTokenLog of logs) {
      const gatewayRuntime = new RecordingGatewayRuntime({
        choices: [
          { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
        ],
        setupTokenLog,
      });
      const port = setupTokenPort({ gatewayRuntime });
      const start = await port.startModelProviderSetupTokenFlow({
        ...principal(),
        providerId: "anthropic",
      });

      const poll = await port.pollModelProviderSetupTokenFlow({
        ...principal(),
        flowId: start.ok ? start.value.flowId : "",
      });

      expect(poll.ok ? poll.value : null).toMatchObject({
        status: "failed",
        code: "provisioning.connections.setupTokenLoginFailed",
      });
    }
  });

  it("completes setup-token from a minted token log without returning the token", async () => {
    const token = `sk-ant-oat01-${"b".repeat(95)}`;
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: `Done ${token}\n`,
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
            },
          ],
        },
      },
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const firstPoll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(firstPoll).toMatchObject({ ok: true, value: { status: "pending" } });
    await delay(0);
    const terminalPoll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(terminalPoll.ok ? terminalPoll.value : null).toMatchObject({
      status: "connected",
      connection: { providerId: "anthropic", authChoiceId: "setup-token" },
    });
    expect(gatewayRuntime.connectCalls).toEqual([
      { providerId: "anthropic", authChoiceId: "setup-token", keyFlag: "token", apiKey: token },
    ]);
    expect(JSON.stringify([firstPoll, terminalPoll])).not.toContain("sk-ant-oat01");
    expect(gatewayRuntime.setupTokenStops).toEqual([
      { execId: "exec-setup-1", logPath: "/tmp/opzava-st-test/setup.log" },
    ]);
  });

  it("does not double-submit setup-token completion under overlapping polls", async () => {
    const token = `sk-ant-oat01-${"c".repeat(95)}`;
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      connectDelayMs: 25,
      setupTokenLog: `Done ${token}\n`,
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
            },
          ],
        },
      },
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });
    await port.submitModelProviderSetupTokenCode({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
      code: "oauth-code-123",
    });

    const firstPoll = port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });
    const inFlightPoll = port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    const first = await firstPoll;
    const inFlight = await inFlightPoll;
    expect(first).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(inFlight).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(gatewayRuntime.connectCalls).toHaveLength(1);
    expect(gatewayRuntime.setupTokenStops).toEqual([]);

    await delay(30);
    const terminal = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });
    expect(terminal.ok ? terminal.value : null).toMatchObject({
      status: "connected",
      connection: { providerId: "anthropic", authChoiceId: "setup-token" },
    });
    expect(gatewayRuntime.connectCalls).toEqual([
      { providerId: "anthropic", authChoiceId: "setup-token", keyFlag: "token", apiKey: token },
    ]);
    expect(gatewayRuntime.setupTokenStops).toEqual([
      { execId: "exec-setup-1", logPath: "/tmp/opzava-st-test/setup.log" },
    ]);
    expect(JSON.stringify([inFlight, terminal])).not.toContain("sk-ant-oat01");
  });

  it("delivers setup-token completion outcome from a later poll", async () => {
    const token = `sk-ant-oat01-${"d".repeat(95)}`;
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      connectDelayMs: 25,
      setupTokenLog: `Done ${token}\n`,
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
            },
          ],
        },
      },
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const firstPoll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(firstPoll).toMatchObject({ ok: true, value: { status: "pending" } });
    await delay(30);
    const terminalPoll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(terminalPoll.ok ? terminalPoll.value : null).toMatchObject({
      status: "connected",
      connection: { providerId: "anthropic", status: "connected" },
    });
    expect(gatewayRuntime.connectCalls).toEqual([
      { providerId: "anthropic", authChoiceId: "setup-token", keyFlag: "token", apiKey: token },
    ]);
    expect(gatewayRuntime.setupTokenStops).toEqual([
      { execId: "exec-setup-1", logPath: "/tmp/opzava-st-test/setup.log" },
    ]);
    expect(JSON.stringify([firstPoll, terminalPoll])).not.toContain("sk-ant-oat01");
  });

  // Fixtures below are built from a REAL `claude setup-token` PTY capture taken from the running
  // gateway (Claude Code 2.1.207 under `script`), not from a hand-written log. Two properties of
  // that capture are what broke #145 and neither appears in a synthetic fixture:
  //   1. the CLI lays text out by MOVING THE CURSOR (`Store\x1b[9Gthis`), not by writing spaces, so
  //      naive ANSI-stripping concatenates words;
  //   2. the provisioning exec has no TTY, so `script` allocates a 0x0 PTY and Ink renders every
  //      word on its own line -- which is how "Store this token securely" became a 22-char suffix.
  // The token below is the real length (108 = `sk-ant-oat01-` + 95).
  const realSetupToken = `sk-ant-oat01-${"AbC9_x-Z".repeat(11)}TokenEn`;
  const setupTokenNotice = "Store this token securely. You won't be able to see it again.";

  // The success screen as the CLI actually renders it: cursor-positioned words, colour codes,
  // doubled CR line endings, an OSC-8 hyperlink, and the token alone on its line.
  const realPtySuccessLog = [
    "\u001b[?2004l\u001b[1mYour\u001b[6Gtoken\u001b[12G(valid\u001b[19Gfor\u001b[23G1\u001b[25Gyear):\u001b[0m\r\r\n",
    `\u001b[33m${realSetupToken}\u001b[39m\r\r\n`,
    `\u001b[2mStore\u001b[7Gthis\u001b[12Gtoken\u001b[18Gsecurely.\u001b[28GYou\u001b[32Gwon't\u001b[38Gbe\u001b[41Gable\u001b[46Gto\u001b[49Gsee\u001b[53Git\u001b[56Gagain.\u001b[22m\r\r\n`,
    "\u001b[2mUse\u001b[5Gthis\u001b[10Gtoken\u001b[16Gby\u001b[19Gsetting:\u001b[22m\r\r\n",
  ].join("");

  it("captures the minted token from a real PTY render without fusing the CLI notice onto it", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: realPtySuccessLog,
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
            },
          ],
        },
      },
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const firstPoll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(firstPoll).toMatchObject({ ok: true, value: { status: "pending" } });
    await delay(0);
    const terminalPoll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(terminalPoll.ok ? terminalPoll.value : null).toMatchObject({
      status: "connected",
      connection: { providerId: "anthropic", authChoiceId: "setup-token" },
    });
    // The exact token, not the token plus whatever the CLI printed underneath it.
    expect(gatewayRuntime.connectCalls).toEqual([
      {
        providerId: "anthropic",
        authChoiceId: "setup-token",
        keyFlag: "token",
        apiKey: realSetupToken,
      },
    ]);
    const stored = gatewayRuntime.connectCalls[0]?.apiKey ?? "";
    expect(stored).toHaveLength(108);
    expect(stored).not.toContain("Store");
    expect(stored).not.toContain("securely");
  });

  it("does not fuse the notice onto the token when the PTY renders one word per line (#145)", async () => {
    // The 0x0 PTY: Ink puts every word on its own line. The old scraper deleted all line endings to
    // defeat wrapping, glued Store/this/token/securely onto the token, and stored 130 chars where
    // the real credential is 108 -- authentication_error on every Anthropic call, for weeks.
    const zeroWidthLog = [
      "Your\r\ntoken\r\n(valid\r\nfor\r\n1\r\nyear):\r\n",
      `\u001b[33m${realSetupToken}\u001b[39m\r\n`,
      `${setupTokenNotice.split(" ").join("\r\n")}\r\n`,
    ].join("");
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: zeroWidthLog,
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
            },
          ],
        },
      },
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });
    await delay(0);

    expect(gatewayRuntime.connectCalls).toEqual([
      {
        providerId: "anthropic",
        authChoiceId: "setup-token",
        keyFlag: "token",
        apiKey: realSetupToken,
      },
    ]);
    expect(gatewayRuntime.connectCalls[0]?.apiKey).toHaveLength(108);
  });

  it("refuses a PTY-truncated token instead of storing a credential it cannot prove (#145)", async () => {
    // A narrower PTY hard-wraps the token mid-value. The fragment still matches prefix-and-charset,
    // so only the length proves it is whole: store it and the provider 401s on every call.
    const truncated = realSetupToken.slice(0, 80);
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: `\u001b[33m${truncated}\r\n${realSetupToken.slice(80)}\u001b[39m\r\n`,
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const poll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });
    await delay(0);

    expect(poll.ok ? poll.value.status : null).not.toBe("connected");
    expect(gatewayRuntime.connectCalls).toEqual([]);
  });

  it("redacts terminal setup-token failures", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      setupTokenLog: "setup-token failed invalid code oauth-code-secret\n",
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const poll = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(poll.ok ? poll.value : null).toMatchObject({
      status: "failed",
      code: "provisioning.connections.setupTokenLoginFailed",
    });
    expect(JSON.stringify(poll)).not.toContain("oauth-code-secret");
    expect(poll.ok && poll.value.status === "failed" ? poll.value.message : "").toContain(
      "Start again",
    );
  });

  it("expires setup-token flows and clears cleanup state", async () => {
    vi.useFakeTimers();
    let nowMs = new Date("2026-07-03T00:00:00.000Z").getTime();
    try {
      const gatewayRuntime = new RecordingGatewayRuntime({
        choices: [
          { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
        ],
      });
      const port = setupTokenPort({ gatewayRuntime, now: () => new Date(nowMs) });
      const start = await port.startModelProviderSetupTokenFlow({
        ...principal(),
        providerId: "anthropic",
      });
      nowMs += 10 * 60 * 1000;

      const expired = await port.pollModelProviderSetupTokenFlow({
        ...principal(),
        flowId: start.ok ? start.value.flowId : "",
      });
      const second = await port.pollModelProviderSetupTokenFlow({
        ...principal(),
        flowId: start.ok ? start.value.flowId : "",
      });

      expect(expired.ok ? expired.value : null).toMatchObject({
        status: "expired",
        code: "provisioning.connections.setupTokenFlowExpired",
      });
      expect(second.ok).toBe(false);
      expect(gatewayRuntime.setupTokenStops).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps setup-token flows org-scoped", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
    });
    const port = setupTokenPort({ gatewayRuntime });
    const start = await port.startModelProviderSetupTokenFlow({
      ...principal(),
      providerId: "anthropic",
    });

    const crossOrg = await port.pollModelProviderSetupTokenFlow({
      ...principal(),
      orgId: "00000000-0000-4000-8000-000000000099",
      flowId: start.ok ? start.value.flowId : "",
    });

    expect(crossOrg.ok).toBe(false);
    expect(crossOrg.ok ? null : crossOrg.error.code).toBe(
      "provisioning.connections.setupTokenFlowNotFound",
    );
  });

  it("polls API-key connect pending then connected without retaining the raw key", async () => {
    vi.useFakeTimers();
    try {
      const admin: RecordingAdminClient = new RecordingAdminClient({
        "config.get": ok({ hash: "config-hash-1", plugins: { allow: ["zai"] } }),
      });
      const gatewayRuntime = new RecordingGatewayRuntime({ connectDelayMs: 100 });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "secret-provider-key",
      });
      expect(start).toMatchObject({ ok: true, value: { status: "pending" } });
      const opId = start.ok ? start.value.opId : "";
      await expect(port.pollModelProviderApiKeyConnect({ ...principal(), opId })).resolves.toEqual(
        ok({ status: "pending" }),
      );

      await vi.advanceTimersByTimeAsync(100);
      const result = await pollApiKeyConnectUntilTerminal(port, opId);
      expect(result.ok ? result.value : null).toMatchObject({
        status: "connected",
        connection: { providerId: "zai", status: "connected" },
      });
      expect(JSON.stringify(result)).not.toContain("secret-provider-key");
    } finally {
      vi.useRealTimers();
    }
  });

  // #183: connect stored a credential without ever proving it works. A key that cannot possibly
  // authenticate is stored, is routable, and passes every structural post-check there is — so the
  // gateway reported it Connected, and the lie only surfaced weeks later as a delegation failure
  // far from its cause. These cover the guard that spends one real model call finding out instead.
  describe("API-key connect liveness probe (#183)", () => {
    function probePort(input: {
      readonly admin: RecordingAdminClient;
      readonly gatewayRuntime: RecordingGatewayRuntime;
    }): GatewayAdminConnectionsProvisioningPort {
      return new GatewayAdminConnectionsProvisioningPort({
        adminClient: input.admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime: input.gatewayRuntime,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });
    }

    /**
     * A REJECTED connect rolls the credential back through the real disconnect, which paces and
     * retries against the gateway — so unlike a clean connect it does not settle on microtasks
     * alone. Drive its timers rather than giving up on it while it is still working.
     */
    async function pollRejectedConnectUntilTerminal(
      port: GatewayAdminConnectionsProvisioningPort,
      opId: string,
    ) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const result = await port.pollModelProviderApiKeyConnect({ ...principal(), opId });
        if (!result.ok || result.value.status !== "pending") {
          return result;
        }
        await vi.advanceTimersByTimeAsync(1_000);
      }

      return port.pollModelProviderApiKeyConnect({ ...principal(), opId });
    }

    /**
     * `models.authLogout` is what actually removes a credential, so the fake gateway honours it —
     * otherwise a rollback would "succeed" against stores it never touched and the test would pass
     * on a fiction.
     */
    function forgettingAdminClient(
      providerId: string,
      gatewayRuntime: RecordingGatewayRuntime,
    ): RecordingAdminClient {
      const admin: RecordingAdminClient = new RecordingAdminClient({
        "config.get": ok({
          hash: "config-hash-probe",
          plugins: { allow: [providerId] },
          auth: { profiles: {}, order: {} },
          agents: { list: [{ id: orchestratorDefaultAgentId, default: true }, { id: "main" }] },
        }),
        "models.authLogout": () => {
          const params = admin.calls.at(-1)?.params ?? {};
          const agent = params["agent"];
          gatewayRuntime.forgetProviderInStore(
            typeof agent === "string" ? agent : orchestratorDefaultAgentId,
            providerId,
          );
          return ok({ provider: providerId, removedProfiles: [], abortedRunIds: [] });
        },
        // Reported from the credentials really held, for the same reason as `statusFromStores`: a
        // post-check that cannot see a removal would fail every rollback closed.
        "models.authStatus": () =>
          ok({
            providers:
              gatewayRuntime.credentialResolvedBy(orchestratorDefaultAgentId, providerId) ===
              undefined
                ? []
                : [
                    {
                      provider: providerId,
                      status: "ok",
                      profiles: [
                        { profileId: `${providerId}:manual`, type: "api_key", status: "ok" },
                      ],
                    },
                  ],
          }),
      });
      return admin;
    }

    it("refuses to report Connected on a credential the provider rejects, and does not keep it", async () => {
      vi.useFakeTimers();
      try {
        const gatewayRuntime = new RecordingGatewayRuntime({
          choices: [
            {
              id: "moonshot-api-key",
              label: "API key",
              mode: "api-key",
              keyFlag: "moonshot-api-key",
            },
          ],
          statusFromStores: { providerId: "moonshot", model: "moonshot/kimi-k2" },
        });
        const admin = forgettingAdminClient("moonshot", gatewayRuntime);
        const port = probePort({ admin, gatewayRuntime });

        const start = await port.startModelProviderApiKeyConnect({
          ...principal(),
          providerId: "moonshot",
          authChoiceId: "moonshot-api-key",
          apiKey: bogusApiKey,
        });
        const result = await pollRejectedConnectUntilTerminal(
          port,
          start.ok ? start.value.opId : "",
        );

        expect(result.ok ? result.value : null).toMatchObject({
          status: "failed",
          code: "provisioning.connections.providerCredentialRejected",
        });
        // The whole point: it must not survive the connect that submitted it.
        expect(gatewayRuntime.credentialResolvedBy("main", "moonshot")).toBeUndefined();
        expect(
          gatewayRuntime.credentialResolvedBy(orchestratorDefaultAgentId, "moonshot"),
        ).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain(bogusApiKey);
      } finally {
        vi.useRealTimers();
      }
    });

    it("probes the credential it just wrote, in the store the whole fleet reads", async () => {
      const gatewayRuntime = new RecordingGatewayRuntime({
        statusFromStores: { providerId: "zai", model: "zai/glm-5.2" },
      });
      const admin = forgettingAdminClient("zai", gatewayRuntime);
      const port = probePort({ admin, gatewayRuntime });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "a-real-working-key",
      });
      const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

      expect(result.ok ? result.value : null).toMatchObject({
        status: "connected",
        connection: { providerId: "zai", status: "connected" },
      });
      // Scoped to the profile this connect wrote, in `main` — the shared store every agent
      // read-through-inherits. Probing by provider alone could pick up an unrelated stale profile
      // and reject a perfectly good new key.
      expect(gatewayRuntime.authProbes).toEqual([
        { agentId: "main", providerId: "zai", profileId: "zai:manual" },
      ]);
    });

    it("connects on an UNPROVEN probe: a rate limit is not evidence the key is bad", async () => {
      const gatewayRuntime = new RecordingGatewayRuntime({
        statusFromStores: { providerId: "zai", model: "zai/glm-5.2" },
        authProbeResult: ok({
          verdict: "unproven",
          reason: "rate_limit: too many requests",
        }),
      });
      const admin = forgettingAdminClient("zai", gatewayRuntime);
      const port = probePort({ admin, gatewayRuntime });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "a-real-working-key",
      });
      const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

      // Rejecting a VALID credential is worse than the bug this guard exists to catch, so anything
      // short of an explicit authentication rejection has to let the connect through.
      expect(result.ok ? result.value : null).toMatchObject({ status: "connected" });
      expect(gatewayRuntime.credentialResolvedBy("main", "zai")).toBe("a-real-working-key");
    });

    it("connects when the probe itself cannot run — an unprobeable key is unproven, not invalid", async () => {
      const gatewayRuntime = new RecordingGatewayRuntime({
        statusFromStores: { providerId: "zai", model: "zai/glm-5.2" },
        authProbeResult: err(
          new DomainError({
            code: "provisioning.connections.authProbeUnavailable",
            message: "Gateway auth probe did not return a readable probe summary.",
          }),
        ),
      });
      const admin = forgettingAdminClient("zai", gatewayRuntime);
      const port = probePort({ admin, gatewayRuntime });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "a-real-working-key",
      });
      const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

      expect(result.ok ? result.value : null).toMatchObject({ status: "connected" });
    });

    it("does not probe at all when the gateway will not name the profile it wrote", async () => {
      const gatewayRuntime = new RecordingGatewayRuntime({
        statusFromStores: { providerId: "zai", model: "zai/glm-5.2" },
        omitWrittenProfileId: true,
      });
      const admin = forgettingAdminClient("zai", gatewayRuntime);
      const port = probePort({ admin, gatewayRuntime });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "a-real-working-key",
      });
      const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

      // Falling back to a provider-wide probe here would reopen the exact hazard --probe-profile
      // exists to close, so we would rather prove nothing than prove the wrong thing.
      expect(gatewayRuntime.authProbes).toEqual([]);
      expect(result.ok ? result.value : null).toMatchObject({ status: "connected" });
    });

    // The rollback is destructive, so it must only ever destroy what its OWN connect wrote. Two
    // connects racing on one provider target the same deterministic auth profile: if the bogus one
    // finished last it would roll back the good one's credential, and the guard against storing a
    // bad key would have become a way to delete a good one.
    it("refuses a second connect for a provider while one is still running", async () => {
      const gatewayRuntime = new RecordingGatewayRuntime({
        statusFromStores: { providerId: "zai", model: "zai/glm-5.2" },
        connectDelayMs: 5_000,
      });
      const admin = forgettingAdminClient("zai", gatewayRuntime);
      const port = probePort({ admin, gatewayRuntime });

      const first = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: bogusApiKey,
      });
      expect(first.ok).toBe(true);

      const second = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "a-real-working-key",
      });

      expect(second.ok).toBe(false);
      expect(!second.ok && second.error.code).toBe(
        "provisioning.connections.providerConnectInFlight",
      );
      // Only the first connect ever reached the gateway, so there is no second credential for the
      // first one's rollback to destroy.
      expect(gatewayRuntime.connectCalls).toHaveLength(1);
    });

    // The case that makes the probe target load-bearing: `main` already holds a GOOD key, so a
    // probe aimed at "whatever this provider has" would cheerfully pass while the bogus key the
    // admin just submitted sat in the orchestrator's store.
    it("rejects a bogus key pasted over an already-connected provider", async () => {
      vi.useFakeTimers();
      try {
        const gatewayRuntime = new RecordingGatewayRuntime({
          statusFromStores: { providerId: "zai", model: "zai/glm-5.2" },
        });
        const admin = forgettingAdminClient("zai", gatewayRuntime);
        const port = probePort({ admin, gatewayRuntime });

        const first = await port.startModelProviderApiKeyConnect({
          ...principal(),
          providerId: "zai",
          authChoiceId: "zai-api-key",
          apiKey: "the-original-good-key",
        });
        await pollRejectedConnectUntilTerminal(port, first.ok ? first.value.opId : "");
        expect(gatewayRuntime.credentialResolvedBy("main", "zai")).toBe("the-original-good-key");

        const rotation = await port.startModelProviderApiKeyConnect({
          ...principal(),
          providerId: "zai",
          authChoiceId: "zai-api-key",
          apiKey: bogusApiKey,
        });
        const result = await pollRejectedConnectUntilTerminal(
          port,
          rotation.ok ? rotation.value.opId : "",
        );

        expect(result.ok ? result.value : null).toMatchObject({
          status: "failed",
          code: "provisioning.connections.providerCredentialRejected",
        });
        // `onboard` already overwrote the old credential — it is the writer — so there is nothing
        // left to restore and "not connected" is the only honest end state.
        expect(gatewayRuntime.credentialResolvedBy("main", "zai")).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("retries transient API-key post-check failures before reporting connected", async () => {
    vi.useFakeTimers();
    try {
      const admin: RecordingAdminClient = new RecordingAdminClient({
        "config.get": ok({ hash: "config-hash-1", plugins: { allow: ["zai"] } }),
      });
      let statusAttempts = 0;
      const gatewayRuntime = new RecordingGatewayRuntime({
        statusResult: () => {
          statusAttempts += 1;
          if (statusAttempts < 3) {
            return err(
              new DomainError({
                code: "test.closedBeforeResponse",
                message: "models.status closed before a response",
              }),
            );
          }
          return ok({
            allowed: ["zai/glm-5.2"],
            auth: {
              providers: [
                {
                  provider: "zai",
                  profiles: { count: 1, apiKey: 1, labels: ["zai:manual=API key"] },
                },
              ],
            },
          });
        },
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "secret-provider-key",
      });
      // Each transient failure sleeps 500ms before the next post-check attempt.
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);
      const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

      expect(result.ok ? result.value : null).toMatchObject({
        status: "connected",
        connection: { providerId: "zai", status: "connected" },
      });
      expect(statusAttempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires API-key connect operations and rejects cross-org polling", async () => {
    vi.useFakeTimers();
    try {
      const admin: RecordingAdminClient = new RecordingAdminClient({
        "config.get": ok({ hash: "config-hash-1", plugins: { allow: ["zai"] } }),
      });
      // A connect that never finishes. The window it has to finish IN is now 15 minutes, not 120s:
      // a connect ends with a live auth probe, and a REJECTED probe removes the credential again
      // before failing (#183), which takes minutes on a tenant with several agents.
      const apiKeyConnectExpiresMs = 15 * 60 * 1000;
      const gatewayRuntime = new RecordingGatewayRuntime({
        connectDelayMs: apiKeyConnectExpiresMs * 2,
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const start = await port.startModelProviderApiKeyConnect({
        ...principal(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "secret-provider-key",
      });
      const opId = start.ok ? start.value.opId : "";
      const foreign = await port.pollModelProviderApiKeyConnect({
        ...principal(),
        orgId: "00000000-0000-4000-8000-000000000099",
        opId,
      });
      expect(foreign.ok).toBe(false);

      // Still in flight at the OLD deadline — the op must not be reaped out from under a connect
      // that is legitimately still working.
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(port.pollModelProviderApiKeyConnect({ ...principal(), opId })).resolves.toEqual(
        ok({ status: "pending" }),
      );

      await vi.advanceTimersByTimeAsync(apiKeyConnectExpiresMs);
      const expired = await port.pollModelProviderApiKeyConnect({ ...principal(), opId });
      expect(expired.ok).toBe(false);
      expect(gatewayRuntime.connectCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never leaks the submitted API key when the gateway onboard command fails", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "config.get": ok({ hash: "config-hash-1", plugins: { allow: ["codex"] } }),
      "config.patch": ok({ ok: true }),
    });
    // The gateway echoes the submitted key in its failure output (a real onboard behavior).
    const gatewayRuntime = new RecordingGatewayRuntime({
      connectResult: ok({
        exitCode: 1,
        stdout: "",
        stderr: "onboard failed: invalid api key sk-live-secret-provider-key",
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "zai",
      authChoiceId: "zai-api-key",
      apiKey: "sk-live-secret-provider-key",
    });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok).toBe(true);
    const payload = result.ok ? result.value : null;
    expect(payload).toMatchObject({
      status: "failed",
      code: "provisioning.connections.invalidProviderCredential",
    });
    // The raw onboard output (which contains the submitted key) must NOT reach the result/browser.
    expect(JSON.stringify(result)).not.toContain("sk-live-secret-provider-key");
    expect(payload?.status === "failed" ? payload.message : "").not.toContain("sk-live");
    expect(payload?.status === "failed" ? payload.message : "").toContain(
      "invalid api key [redacted]",
    );
  });

  it("does not send provider API-key material when the device lacks operator.admin", async () => {
    const admin = new RecordingAdminClient(
      { "config.get": ok({ hash: "config-hash-1", plugins: { allow: ["codex"] } }) },
      ["operator.read", "operator.write", "operator.approvals"],
    );
    const gatewayRuntime = new RecordingGatewayRuntime();
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "zai",
      authChoiceId: "zai-api-key",
      apiKey: "secret-provider-key",
    });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toMatchObject({
      status: "failed",
      code: "provisioning.openclawAdmin.operatorAdminRequired",
    });
    expect(admin.calls).toEqual([
      {
        method: "config.get",
        params: {},
      },
    ]);
    expect(JSON.stringify(admin.calls)).not.toContain("secret-provider-key");
    expect(gatewayRuntime.connectCalls).toEqual([]);
  });

  it("disconnects model providers through models.authLogout with operator.admin scope", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({
        provider: "openai",
        removedProfiles: ["openai:chatgpt"],
        abortedRunIds: [],
      }),
      "config.get": ok({ hash: "config-hash-logout", auth: { profiles: {}, order: {} } }),
      "models.authStatus": ok({ providers: [] }),
      "models.list": ok({
        providers: [
          {
            id: "openai",
            label: "OpenAI",
            authChoices: [
              {
                id: "openai",
                label: "OAuth device flow",
                mode: "device-flow",
                providerId: "openai",
              },
            ],
          },
        ],
        models: [{ id: "gpt-5.5", name: "GPT 5.5", provider: "openai" }],
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({
      ...principal(),
      providerId: "openai",
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toMatchObject({
      providerId: "openai",
      status: "not_connected",
      connectedAuthMode: null,
    });
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([{ provider: "openai" }]);
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("retries disconnect post-check reads across the gateway restart window", async () => {
    vi.useFakeTimers();
    try {
      let authStatusAttempts = 0;
      const admin = new RecordingAdminClient({
        "models.authLogout": ok({
          provider: "openai",
          removedProfiles: ["openai:chatgpt"],
          abortedRunIds: [],
        }),
        "config.get": ok({ hash: "config-hash-logout", auth: { profiles: {}, order: {} } }),
        // The disconnect config.patch restarts the gateway; the first post-check reads land in the
        // restart window and fail exactly like the live repro (handshake rejected UNAVAILABLE).
        "models.authStatus": () => {
          authStatusAttempts += 1;
          if (authStatusAttempts < 3) {
            return err(
              new DomainError({
                code: "provisioning.openclawAdmin.operatorWsHandshakeFailed",
                message: "operator WS handshake failed: auth_rejected (UNAVAILABLE)",
              }),
            );
          }
          return ok({ providers: [] });
        },
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const pending = port.disconnectModelProvider({ ...principal(), providerId: "openai" });
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await pending;

      expect(result.ok).toBe(true);
      expect(authStatusAttempts).toBe(3);
      expect(result.ok ? result.value : null).toMatchObject({
        providerId: "openai",
        status: "not_connected",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("attempts the gateway authLogout RPC before fail-closed logout errors", async () => {
    const admin = new RecordingAdminClient(
      {
        "models.authLogout": err(
          new DomainError({
            code: "gateway.forbidden",
            message: "operator.admin scope required.",
          }),
        ),
        "config.get": ok({ hash: "config-hash-logout", auth: { profiles: {}, order: {} } }),
      },
      ["operator.read", "operator.write", "operator.approvals"],
    );
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(false);
    // models.authStatus reads the gateway's profile-ownership declaration before any mutation (#174).
    expect(admin.calls.map((call) => call.method)).toEqual([
      "config.get",
      "models.authStatus",
      "models.authLogout",
    ]);
    expect(admin.calls[2]).toMatchObject({
      method: "models.authLogout",
      params: { provider: "openai" },
    });
  });

  it("disconnects OAuth providers from the default agent and configured agents", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": () =>
        ok({
          provider: "openai",
          removedProfiles: admin.calls.some(
            (call) => call.method === "models.authLogout" && !Object.hasOwn(call.params, "agent"),
          )
            ? ["openai:oauth"]
            : [],
          abortedRunIds: [],
        }),
      "config.get": ok({
        hash: "config-hash-openai",
        auth: { profiles: {}, order: {} },
        agents: {
          list: [
            { id: "ask-admin-opzava", model: "openai/gpt-5.5" },
            { id: "ask-admin-opzava", model: "openai/gpt-5.5" },
          ],
        },
      }),
      "models.authStatus": () =>
        ok({
          providers: admin.calls.some(
            (call) => call.method === "models.authLogout" && !Object.hasOwn(call.params, "agent"),
          )
            ? []
            : [
                {
                  provider: "openai",
                  status: "ok",
                  profiles: [{ profileId: "openai:oauth", type: "oauth", status: "ok" }],
                },
              ],
        }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(true);
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([{ provider: "openai" }, { provider: "openai", agent: "ask-admin-opzava" }]);
  });

  // #174: OpenClaw writes a SET of profiles per auth method and derives each profile's provider from
  // the profile-id prefix, so one connect to `opencode-go` also writes `opencode:default`. Matching on
  // provider id removed only the id-matching profile and left the same key live under `opencode` — a
  // provider absent from the catalog, so the orphan was invisible AND unremovable from the UI.
  it("removes every profile a shared-credential connect created, not just the id-matching one", async () => {
    const sharedProfiles = {
      "opencode-go:default": { provider: "opencode-go", mode: "api_key" },
      "opencode:default": { provider: "opencode", mode: "api_key" },
    };
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "opencode-go", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () => {
        const patched = admin.calls.some((call) => call.method === "config.patch");
        return ok({
          hash: "config-hash-opencode",
          auth: {
            profiles: patched ? {} : sharedProfiles,
            order: patched
              ? {}
              : { "opencode-go": ["opencode-go:default"], opencode: ["opencode:default"] },
          },
        });
      },
      "models.authStatus": ok({
        providers: [],
        ownership: { "opencode-go": ["opencode:default", "opencode-go:default"] },
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({
      ...principal(),
      providerId: "opencode-go",
    });

    expect(result.ok).toBe(true);

    // The stored secret leaves the auth store per provider id, so BOTH owners need a logout — the
    // sibling narrowed to the shared profile so its other credentials are not collateral.
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([
      { provider: "opencode-go" },
      { provider: "opencode", profileIds: ["opencode:default"] },
    ]);

    const patch = admin.calls.find((call) => call.method === "config.patch");
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.params["raw"]))).toEqual({
      auth: {
        profiles: { "opencode-go:default": null, "opencode:default": null },
        order: { "opencode-go": [], opencode: [] },
      },
    });
  });

  // A sibling is dragged in only because it SHARES this connect's profile. The gateway's logout is
  // provider-scoped, so a provider-wide logout would also destroy the sibling's unrelated
  // credentials — a worse bug than the orphan. The sibling logout must be profile-scoped.
  it("revokes only the shared profile from a sibling provider, not its unrelated credentials", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "opencode-go", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () => {
        const patched = admin.calls.some((call) => call.method === "config.patch");
        return ok({
          hash: "config-hash-sibling",
          auth: {
            profiles: {
              ...(patched
                ? {}
                : {
                    "opencode-go:default": { provider: "opencode-go", mode: "api_key" },
                    "opencode:default": { provider: "opencode", mode: "api_key" },
                  }),
              // An independent credential on the sibling. It must survive untouched.
              "opencode:personal": { provider: "opencode", mode: "api_key" },
            },
            order: {
              "opencode-go": patched ? [] : ["opencode-go:default"],
              opencode: patched ? ["opencode:personal"] : ["opencode:default", "opencode:personal"],
            },
          },
        });
      },
      "models.authStatus": ok({
        providers: [],
        ownership: { "opencode-go": ["opencode:default", "opencode-go:default"] },
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({
      ...principal(),
      providerId: "opencode-go",
    });

    expect(result.ok).toBe(true);

    // Full logout for the provider the operator disconnected; profile-scoped for the sibling.
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([
      { provider: "opencode-go" },
      { provider: "opencode", profileIds: ["opencode:default"] },
    ]);

    const patch = admin.calls.find((call) => call.method === "config.patch");
    expect(JSON.parse(String(patch?.params["raw"]))).toEqual({
      auth: {
        profiles: { "opencode-go:default": null, "opencode:default": null },
        // The sibling keeps its unrelated profile AND its place in the auth order.
        order: { "opencode-go": [], opencode: ["opencode:personal"] },
      },
    });
  });

  // A previous half-completed disconnect leaves the secret in the auth store with no config entry.
  // Filtering the declared set on config presence would skip its provider's logout and re-orphan it.
  it("still logs out a declared profile that is missing from config", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "opencode-go", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () => {
        const patched = admin.calls.some((call) => call.method === "config.patch");
        return ok({
          hash: "config-hash-store-only",
          auth: {
            // `opencode:default` is declared-owned but absent here — it lives only in the auth store.
            profiles: patched
              ? {}
              : { "opencode-go:default": { provider: "opencode-go", mode: "api_key" } },
            order: { "opencode-go": patched ? [] : ["opencode-go:default"] },
          },
        });
      },
      "models.authStatus": ok({
        providers: [],
        ownership: { "opencode-go": ["opencode:default", "opencode-go:default"] },
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({
      ...principal(),
      providerId: "opencode-go",
    });

    expect(result.ok).toBe(true);
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([
      { provider: "opencode-go" },
      { provider: "opencode", profileIds: ["opencode:default"] },
    ]);
  });

  it("does not remove profiles the gateway does not attribute to the disconnected provider", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () => {
        const patched = admin.calls.some((call) => call.method === "config.patch");
        return ok({
          hash: "config-hash-zai",
          auth: {
            profiles: {
              ...(patched ? {} : { "zai:default": { provider: "zai", mode: "api_key" } }),
              "anthropic:default": { provider: "anthropic", mode: "api_key" },
            },
            order: { zai: patched ? [] : ["zai:default"], anthropic: ["anthropic:default"] },
          },
        });
      },
      "models.authStatus": ok({
        providers: [],
        ownership: { zai: ["zai:default"], anthropic: ["anthropic:default"] },
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(true);
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([{ provider: "zai" }]);

    // A neighbour's credential must survive: over-deleting here destroys a key the operator never
    // asked to revoke, which is strictly worse than the orphan bug we are fixing.
    const patch = admin.calls.find((call) => call.method === "config.patch");
    expect(JSON.parse(String(patch?.params["raw"])).auth.profiles).toEqual({ "zai:default": null });
  });

  it("fails closed when a gateway without ownership metadata orphans a shared credential", async () => {
    const openCodeGoProvider = {
      provider: "opencode-go",
      profiles: { count: 1, apiKey: 1, labels: ["opencode-go:default=sk-abc...xyz"] },
    };
    // Same masked key under both ids — one shared credential, exactly as OpenCode writes it.
    const openCodeProvider = {
      provider: "opencode",
      profiles: { count: 1, apiKey: 1, labels: ["opencode:default=sk-abc...xyz"] },
    };
    const gatewayRuntime = new RecordingGatewayRuntime({
      // Before the patch both are live; after it, only the orphaned sibling remains.
      status: () => ({
        agentDir: "/home/node/.openclaw/agents/main/agent",
        auth: {
          providers: admin.calls.some((call) => call.method === "config.patch")
            ? [openCodeProvider]
            : [openCodeProvider, openCodeGoProvider],
        },
      }),
    });
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "opencode-go", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () => {
        const patched = admin.calls.some((call) => call.method === "config.patch");
        return ok({
          hash: "config-hash-legacy",
          auth: {
            // The id-matched profile goes; the shared sibling survives — the exact orphan.
            profiles: {
              ...(patched
                ? {}
                : { "opencode-go:default": { provider: "opencode-go", mode: "api_key" } }),
              "opencode:default": { provider: "opencode", mode: "api_key" },
            },
            order: { "opencode-go": patched ? [] : ["opencode-go:default"] },
          },
        });
      },
      // Old gateway: no `ownership` block, so Opzava cannot know the sibling set.
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({
      ...principal(),
      providerId: "opencode-go",
    });

    // Never report a still-live key as revoked. We cannot safely auto-delete on a masked-label match
    // (it is not a credential identity), so surface it instead of lying.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe(
      "provisioning.connections.providerCredentialOrphaned",
    );
  });

  it("fails closed when models status still reports OAuth credentials after disconnect", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      status: {
        agentDir: "/home/node/.openclaw/agents/main/agent",
        auth: {
          providers: [
            {
              provider: "openai",
              profiles: { count: 1, oauth: 1, labels: ["openai:oauth=OAuth"] },
            },
          ],
        },
      },
    });
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({
        provider: "openai",
        agentId: "main",
        removedProfiles: [],
        abortedRunIds: [],
      }),
      "config.get": ok({ hash: "config-hash-openai", auth: { profiles: {}, order: {} } }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.providerStillConnected",
      details: {
        providerId: "openai",
        credentialStores: ["models.status"],
        connectedAuthMode: "oauth",
      },
    });
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([{ provider: "openai" }]);
  });

  it("clears an api-key config profile even when authLogout succeeds but removed nothing", async () => {
    vi.useFakeTimers();
    try {
      // The zai regression: authLogout returns ok with removedProfiles:[] (the key lives in
      // config.auth.profiles, not the managed store), so disconnect must ALSO config.patch it away.
      const admin: RecordingAdminClient = new RecordingAdminClient({
        "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
        "config.get": () =>
          ok({
            hash: "config-hash-zai",
            auth: admin.calls.some((call) => call.method === "config.patch")
              ? { profiles: {}, order: { zai: [] } }
              : {
                  profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
                  order: { zai: ["zai-zai-api-key"] },
                },
            agents: {
              list: [
                { id: "agent-one", model: "zai/glm-5.2" },
                { id: "agent-two", model: "zai/glm-5.2" },
                { id: "agent-three", model: "zai/glm-5.2" },
                { id: "agent-four", model: "zai/glm-5.2" },
              ],
            },
          }),
        "config.patch": ok({ ok: true }),
        "models.authStatus": ok({ providers: [] }),
        "models.list": ok({
          providers: [{ id: "zai", label: "Z.AI", authChoices: [apiKeyChoice()] }],
        }),
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const resultPromise = port.disconnectModelProvider({ ...principal(), providerId: "zai" });
      // 5 logout targets now, so the batch is paced; drain the inter-call delays.
      await vi.advanceTimersByTimeAsync(5 * 20_000);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      // The per-agent logouts remove 0 profiles for a config api-key, but disconnect no longer tries
      // to predict that: a provider whose credential DOES sit in an agent store (an Anthropic
      // setup-token also has a config profile entry) would otherwise keep it after disconnect.
      expect(
        admin.calls
          .filter((call) => call.method === "models.authLogout")
          .map((call) => call.params),
      ).toEqual([
        { provider: "zai" },
        { provider: "zai", agent: "agent-one" },
        { provider: "zai", agent: "agent-two" },
        { provider: "zai", agent: "agent-three" },
        { provider: "zai", agent: "agent-four" },
      ]);
      const patch = admin.calls.find((call) => call.method === "config.patch");
      expect(patch).toBeDefined();
      expect(patch?.params).toMatchObject({ replacePaths: ["auth.order.zai"] });
      expect(rawPatch(patch!.params)).toEqual({
        auth: { profiles: { "zai-zai-api-key": null }, order: { zai: [] } },
      });
      expect(JSON.stringify(result)).not.toContain("zai-zai-api-key-secret");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries transient authLogout rate limits while disconnecting OAuth agents", async () => {
    vi.useFakeTimers();
    try {
      let logoutAttempts = 0;
      const admin = new RecordingAdminClient({
        "models.authLogout": () => {
          logoutAttempts += 1;
          return logoutAttempts === 1
            ? err(
                new DomainError({
                  code: "gateway.unavailable",
                  message:
                    "rate limit exceeded for models.authLogout; retry after 2s api_key=sk-rate-secret",
                  details: { retryAfterMs: 2_000, apiKey: "sk-rate-secret" },
                }),
              )
            : ok({ provider: "openai", removedProfiles: [], abortedRunIds: [] });
        },
        "config.get": ok({
          hash: "config-hash-openai",
          auth: { profiles: {}, order: {} },
          agents: {
            list: [
              { id: "agent-one", model: "openai/gpt-5.5" },
              { id: "agent-two", model: "openai/gpt-5.5" },
            ],
          },
        }),
        "models.authStatus": ok({ providers: [] }),
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const resultPromise = port.disconnectModelProvider({ ...principal(), providerId: "openai" });

      await vi.advanceTimersByTimeAsync(1_999);
      expect(admin.calls.filter((call) => call.method === "models.authLogout")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      expect(
        admin.calls
          .filter((call) => call.method === "models.authLogout")
          .map((call) => call.params),
      ).toEqual([
        { provider: "openai" },
        { provider: "openai" },
        { provider: "openai", agent: "agent-one" },
        { provider: "openai", agent: "agent-two" },
      ]);
      expect(JSON.stringify(result)).not.toContain("sk-rate-secret");
    } finally {
      vi.useRealTimers();
    }
  });

  it("paces multi-agent authLogout batches to avoid the gateway write budget", async () => {
    vi.useFakeTimers();
    try {
      const admin = new RecordingAdminClient({
        "models.authLogout": ok({ provider: "openai", removedProfiles: [], abortedRunIds: [] }),
        "config.get": ok({
          hash: "config-hash-openai",
          auth: { profiles: {}, order: {} },
          agents: {
            list: [
              { id: "agent-one", model: "openai/gpt-5.5" },
              { id: "agent-two", model: "openai/gpt-5.5" },
              { id: "agent-three", model: "openai/gpt-5.5" },
              { id: "agent-four", model: "openai/gpt-5.5" },
            ],
          },
        }),
        "models.authStatus": ok({ providers: [] }),
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const resultPromise = port.disconnectModelProvider({ ...principal(), providerId: "openai" });
      await vi.advanceTimersByTimeAsync(0);
      expect(admin.calls.filter((call) => call.method === "models.authLogout")).toHaveLength(1);

      for (const expectedCalls of [2, 3, 4, 5]) {
        await vi.advanceTimersByTimeAsync(19_999);
        expect(admin.calls.filter((call) => call.method === "models.authLogout")).toHaveLength(
          expectedCalls - 1,
        );
        await vi.advanceTimersByTimeAsync(1);
        expect(admin.calls.filter((call) => call.method === "models.authLogout")).toHaveLength(
          expectedCalls,
        );
      }
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      expect(
        admin.calls
          .filter((call) => call.method === "models.authLogout")
          .map((call) => call.params),
      ).toEqual([
        { provider: "openai" },
        { provider: "openai", agent: "agent-one" },
        { provider: "openai", agent: "agent-two" },
        { provider: "openai", agent: "agent-three" },
        { provider: "openai", agent: "agent-four" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts config.patch closed-before-response when post-check proves disconnect", async () => {
    let patchAttempted = false;
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () =>
        ok({
          hash: "config-hash-zai",
          auth: patchAttempted
            ? { profiles: {}, order: { zai: [] } }
            : {
                profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
                order: { zai: ["zai-zai-api-key"] },
              },
        }),
      "config.patch": () => {
        patchAttempted = true;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.connectionClosed",
            message:
              "OpenClaw admin RPC config.patch closed before a response. api_key=sk-config-secret",
          }),
        );
      },
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(true);
    expect(admin.calls.filter((call) => call.method === "config.patch")).toHaveLength(1);
    // One ownership read before the mutation (#174) + one post-check read.
    expect(admin.calls.filter((call) => call.method === "models.authStatus")).toHaveLength(2);
    // The credential-removal seam ends after its post-check. The polled operation schedules the
    // orchestrator continuation only after publishing its terminal outcome, so this direct seam has
    // only the initial config read and the post-check read.
    expect(admin.calls.filter((call) => call.method === "config.get")).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("sk-config-secret");
  });

  it("does not fail a disconnect that succeeded while the gateway was still restarting (#172)", async () => {
    // The live signature of #172: the config.patch reload drops the WS before answering, and the
    // post-check then reads a half-restarted gateway that still reports the credential from BOTH
    // status surfaces -- while the durable store (config.auth.profiles) is already clean. The
    // operator was told "Disconnect failed: Gateway still reports provider credentials" about a
    // disconnect that had worked, and invited to retry an irreversible action.
    let patchAttempted = false;
    let authStatusReads = 0;
    const staleAnthropicAuthStatus = {
      providers: [
        {
          provider: "anthropic",
          status: "static",
          profiles: [{ type: "token", status: "ok" }],
        },
      ],
    };
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "anthropic", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () =>
        ok({
          hash: "config-hash-anthropic",
          auth: patchAttempted
            ? { profiles: {}, order: { anthropic: [] } }
            : {
                profiles: { "anthropic-setup-token": { provider: "anthropic", mode: "token" } },
                order: { anthropic: ["anthropic-setup-token"] },
              },
        }),
      "config.patch": () => {
        patchAttempted = true;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.connectionClosed",
            message: "OpenClaw admin RPC config.patch closed before a response.",
          }),
        );
      },
      "models.authStatus": () => {
        authStatusReads += 1;
        // Read 1 is the pre-mutation ownership read; read 2 lands on the restarting gateway and is
        // stale; by read 3 the gateway is back and tells the truth.
        return ok(authStatusReads >= 3 ? { providers: [] } : staleAnthropicAuthStatus);
      },
    });
    let modelStatusReads = 0;
    const gatewayRuntime = new RecordingGatewayRuntime({
      status: () => {
        modelStatusReads += 1;
        return modelStatusReads >= 2
          ? { allowed: [], auth: { providers: [] } }
          : {
              allowed: ["anthropic/claude-opus-4-8"],
              auth: {
                providers: [{ provider: "anthropic", profiles: { count: 1, token: 1 } }],
              },
            };
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "anthropic" });

    expect(result.ok).toBe(true);
    // It waited for the gateway to answer again rather than believing a restarting process...
    expect(admin.calls.filter((call) => call.method === "health").length).toBeGreaterThanOrEqual(1);
    // ...and it re-read the status surfaces instead of ruling on the first stale answer.
    expect(authStatusReads).toBeGreaterThanOrEqual(3);
  });

  it("waits for the gateway to answer again before post-checking a disconnect (#172)", async () => {
    const callOrder: string[] = [];
    let patchAttempted = false;
    let healthReads = 0;
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () => {
        callOrder.push("config.get");
        return ok({
          hash: "config-hash-zai",
          auth: patchAttempted
            ? { profiles: {}, order: { zai: [] } }
            : {
                profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
                order: { zai: ["zai-zai-api-key"] },
              },
        });
      },
      "config.patch": () => {
        patchAttempted = true;
        callOrder.push("config.patch");
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.connectionClosed",
            message: "OpenClaw admin RPC config.patch closed before a response.",
          }),
        );
      },
      health: () => {
        healthReads += 1;
        callOrder.push("health");
        // The gateway is down while it reloads, then comes back.
        return healthReads >= 3
          ? ok({ status: "ok" })
          : err(
              new DomainError({
                code: "provisioning.openclawAdmin.operatorWsHandshakeFailed",
                message: "connection closed",
              }),
            );
      },
      "models.authStatus": () => {
        callOrder.push("models.authStatus");
        return ok({ providers: [] });
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(true);
    // Every post-check read must come AFTER the gateway has answered health again.
    const readyAt = callOrder.lastIndexOf("health");
    const postCheckAt = callOrder.indexOf("models.authStatus", callOrder.indexOf("config.patch"));
    expect(healthReads).toBe(3);
    expect(postCheckAt).toBeGreaterThan(readyAt);
  });

  it("still fails closed when the credential survives in the durable store (#172 guard)", async () => {
    // The stale-status tolerance must not become a hole: a credential that is really still in
    // config.auth.profiles is survival, and is fatal on sight -- no retries, no waiting.
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": ok({
        hash: "config-hash-zai",
        auth: {
          profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
          order: { zai: ["zai-zai-api-key"] },
        },
      }),
      "config.patch": ok({ ok: true }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe(
      "provisioning.connections.providerStillConnected",
    );
    expect(result.ok ? null : result.error.details?.["credentialStores"]).toContain(
      "config.auth.profiles",
    );
  });

  it("still fails closed when operator.admin is denied for disconnect config.patch", async () => {
    const admin = new RecordingAdminClient(
      {
        "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
        "config.get": ok({
          hash: "config-hash-zai",
          auth: {
            profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
            order: { zai: ["zai-zai-api-key"] },
          },
        }),
        "models.authStatus": ok({ providers: [] }),
      },
      ["operator.read"],
    );
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.openclawAdmin.operatorAdminRequired",
    });
    // The lone authStatus call is the pre-mutation ownership read (#174); the post-check (the only
    // one that passes `refresh`) must never run, so a denied patch cannot be papered over as success.
    expect(
      admin.calls.filter((call) => call.method === "models.authStatus").map((call) => call.params),
    ).toEqual([{}]);
  });

  it("redacts token material from surfaced disconnect write failures", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": ok({
        hash: "config-hash-zai",
        auth: {
          profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
          order: { zai: ["zai-zai-api-key"] },
        },
      }),
      "config.patch": err(
        new DomainError({
          code: "gateway.configInvalid",
          message: "invalid config api_key=sk-surfaced-secret",
          details: { apiKey: "sk-surfaced-secret", token: "refresh-token-secret" },
        }),
      ),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({ code: "gateway.configInvalid" });
    expect(result.ok ? "" : result.error.message).not.toContain("sk-surfaced-secret");
    expect(JSON.stringify(result)).not.toContain("sk-surfaced-secret");
    expect(JSON.stringify(result)).not.toContain("refresh-token-secret");
  });

  it("clears token config profiles and treats already-disconnected providers as a no-op", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "anthropic", removedProfiles: [], abortedRunIds: [] }),
      "config.get": () =>
        ok({
          hash: "config-hash-token",
          auth: admin.calls.some((call) => call.method === "config.patch")
            ? { profiles: {}, order: { anthropic: [], openai: [] } }
            : {
                profiles: { "anthropic:manual": { provider: "anthropic", mode: "token" } },
                order: { anthropic: ["anthropic:manual"] },
              },
        }),
      "config.patch": ok({ ok: true }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const disconnected = await port.disconnectModelProvider({
      ...principal(),
      providerId: "anthropic",
    });
    const noOp = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(disconnected.ok).toBe(true);
    expect(noOp.ok).toBe(true);
    const patch = admin.calls.find((call) => call.method === "config.patch");
    expect(rawPatch(patch!.params)).toEqual({
      auth: { profiles: { "anthropic:manual": null }, order: { anthropic: [] } },
    });
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([{ provider: "anthropic" }, { provider: "openai" }]);
    // Each disconnect reads ownership first (cached, no refresh) and force-refreshes the post-check.
    expect(admin.calls.filter((call) => call.method === "models.authStatus")).toEqual([
      expect.objectContaining({ params: {} }),
      expect.objectContaining({ params: { refresh: true } }),
      expect.objectContaining({ params: {} }),
      expect.objectContaining({ params: { refresh: true } }),
    ]);
  });

  it("falls back to config.patch API-key profile deletion when authLogout is unavailable", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      "models.authLogout": err(
        new DomainError({
          code: "openclaw.methodNotFound",
          message: "models.authLogout is not advertised.",
        }),
      ),
      "config.get": () =>
        ok({
          hash: "config-hash-2",
          auth: admin.calls.some((call) => call.method === "config.patch")
            ? { profiles: {}, order: { zai: [] } }
            : {
                profiles: {
                  "zai-zai-api-key": {
                    providerId: "zai",
                    authChoiceId: "zai-api-key",
                    type: "api_key",
                  },
                },
                order: { zai: ["zai-zai-api-key"] },
              },
        }),
      "config.patch": ok({ ok: true }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({
      ...principal(),
      providerId: "zai",
    });

    expect(result.ok).toBe(true);
    expect(
      admin.calls.filter((call) => call.method === "models.authLogout").map((call) => call.params),
    ).toEqual([{ provider: "zai" }]);
    const patchCall = admin.calls.find((call) => call.method === "config.patch");
    expect(patchCall?.params).toMatchObject({ baseHash: "config-hash-2" });
    expect(rawPatch(patchCall!.params)).toEqual({
      auth: {
        profiles: {
          "zai-zai-api-key": null,
        },
        order: {
          zai: [],
        },
      },
    });
    expect(patchCall?.params).not.toHaveProperty("patch");
    expect(patchCall?.idempotencyKey).toBeUndefined();
  });

  it("fails closed when post-disconnect checks still report managed OAuth credentials", async () => {
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: ["openai:chatgpt"] }),
      "config.get": ok({ hash: "config-hash-openai", auth: { profiles: {}, order: {} } }),
      "models.authStatus": ok({
        providers: [
          {
            provider: "openai",
            status: "missing",
            profiles: [{ type: "oauth", status: "missing" }],
          },
        ],
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.providerStillConnected",
      details: {
        providerId: "openai",
        credentialStores: ["models.authStatus"],
        connectedAuthMode: "oauth",
      },
    });
    expect(JSON.stringify(result)).not.toContain("refresh");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("fails closed when the managed credential post-check cannot run", async () => {
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: ["openai:chatgpt"] }),
      "config.get": ok({ hash: "config-hash-openai", auth: { profiles: {}, order: {} } }),
      "models.authStatus": err(
        new DomainError({
          code: "test.authStatusUnavailable",
          message: "auth status unavailable secret-refresh-token",
        }),
      ),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.providerPostCheckUnavailable",
      details: { providerId: "openai" },
    });
    expect(JSON.stringify(result)).not.toContain("secret-refresh-token");
  });

  it("fails closed when the managed credential post-check returns an unexpected payload", async () => {
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: ["openai:chatgpt"] }),
      "config.get": ok({ hash: "config-hash-openai", auth: { profiles: {}, order: {} } }),
      "models.authStatus": ok({}),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.providerPostCheckUnavailable",
      details: { providerId: "openai" },
    });
  });

  it("fails closed when the managed credential post-check returns a malformed target provider entry", async () => {
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: ["openai:chatgpt"] }),
      "config.get": ok({ hash: "config-hash-openai", auth: { profiles: {}, order: {} } }),
      "models.authStatus": ok({ providers: [{ provider: "openai" }] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.providerPostCheckUnavailable",
      details: { providerId: "openai" },
    });
  });

  it("fails closed when config-profile credentials remain after disconnect", async () => {
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "zai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": ok({
        hash: "config-hash-zai",
        auth: {
          profiles: { "zai-zai-api-key": { provider: "zai", mode: "api_key" } },
          order: { zai: ["zai-zai-api-key"] },
        },
      }),
      "config.patch": ok({ ok: true }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.providerStillConnected",
      details: {
        providerId: "zai",
        credentialStores: ["config.auth.profiles"],
      },
    });
    expect(JSON.stringify(result)).not.toContain("api_key");
  });

  it("applies orchestrator delegation through config.patch with the audited tool expansion", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-3",
        auth: {
          profiles: {
            "zai-zai-api-key": {
              providerId: "zai",
              authChoiceId: "zai-api-key",
              model: "zai/glm-5.2",
            },
          },
          order: { zai: ["zai-zai-api-key"] },
        },
        agents: { list: [{ id: "other-agent", model: "noop/model" }] },
      }),
      "models.list": ok({
        providers: [
          {
            id: "zai",
            label: "z.ai / GLM",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.applyOrchestratorDelegation({
      ...principal(),
      connectedProviderIds: ["zai"],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.toolPolicyExpansion.allow : []).toEqual([
      "sessions_spawn",
      "subagents",
      "group:sessions",
    ]);
    const patchCall = admin.calls.find((call) => call.method === "config.patch");
    expect(patchCall?.params).toMatchObject({
      baseHash: "config-hash-3",
    });
    expect(rawPatch(patchCall!.params)).toMatchObject({
      agents: {
        // zai is the only connected provider and the gateway has no primary, so zai IS the
        // orchestrator: Ask Admin routes to it and the primary moves onto it. The predecessor left
        // Ask Admin on ASK_ADMIN_AGENT_MODEL ("openai/gpt-5.5") -- a provider that is NOT connected
        // -- and demoted the one working provider to a subagent, which is #186 in miniature.
        defaults: { model: { primary: "zai/glm-5.2" } },
        list: expect.arrayContaining([
          expect.objectContaining({ id: "other-agent" }),
          expect.objectContaining({
            id: "ask-admin-opzava",
            model: "zai/glm-5.2",
            subagents: {
              delegationMode: "prefer",
              allowAgents: [],
            },
            tools: {
              profile: "minimal",
              allow: [...ASK_ADMIN_TOOL_POLICY_ALLOW, ...ASK_ADMIN_DELEGATION_TOOL_ALLOW],
              deny: [...ASK_ADMIN_TOOL_POLICY_DENY],
            },
          }),
        ]),
      },
    });
    expect(patchCall?.params).not.toHaveProperty("patch");
    expect(patchCall?.params).not.toHaveProperty("receipt");
    expect(patchCall?.idempotencyKey).toBeUndefined();
  });

  it("applies orchestrator delegation from the gateway primary provider", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-primary",
        auth: {
          profiles: {
            "openai-device": {
              providerId: "openai",
              authChoiceId: "openai-device-code",
            },
            "zai-zai-api-key": {
              providerId: "zai",
              authChoiceId: "zai-api-key",
              model: "zai/glm-5.2",
            },
          },
          order: { openai: ["openai-device"], zai: ["zai-zai-api-key"] },
        },
        agents: {
          defaults: {
            model: { primary: "zai/glm-5.2" },
            models: { "openai/gpt-5.5": {} },
          },
          list: [],
        },
      }),
      "models.list": ok({
        providers: [
          {
            id: "openai",
            label: "OpenAI",
            suggestedModel: "openai/gpt-5.5",
            authChoices: [
              apiKeyChoice({
                id: "openai-device-code",
                providerId: "openai",
                keyFlag: "openai-api-key",
              }),
            ],
          },
          {
            id: "zai",
            label: "z.ai / GLM",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.applyOrchestratorDelegation({
      ...principal(),
      connectedProviderIds: ["openai", "zai"],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toMatchObject({
      orchestratorModel: "zai/glm-5.2",
      orchestratorProviderId: "zai",
      allowAgents: ["subagent-openai"],
    });
    const patchCall = admin.calls.find((call) => call.method === "config.patch");
    expect(rawPatch(patchCall!.params)).toMatchObject({
      agents: {
        list: expect.arrayContaining([
          expect.objectContaining({ id: "ask-admin-opzava", model: "zai/glm-5.2" }),
          expect.objectContaining({ id: "subagent-openai", model: "openai/gpt-5.5" }),
        ]),
      },
    });
    expect(JSON.stringify(rawPatch(patchCall!.params))).not.toContain("subagent-zai");
  });

  // The whole fix stands or falls here. `onboard` moves `agents.defaults.model.primary` on every
  // connect, and reconcile used to copy that gateway-written value back onto Ask Admin — so a model
  // the operator chose was silently reverted by the next connect, while the UI still showed their
  // choice. The operator's selection (the Ask Admin `model`, which only Opzava writes) is the
  // authority while its provider is connected; reconcile must PUSH it into the primary, not read
  // from it.
  it("keeps the operator's elected model when a later connect moves the gateway primary", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-selection-survives",
        auth: {
          profiles: {
            "openai-device": { providerId: "openai", authChoiceId: "openai-device-code" },
            "zai-zai-api-key": {
              providerId: "zai",
              authChoiceId: "zai-api-key",
              model: "zai/glm-5.2",
            },
          },
          order: { openai: ["openai-device"], zai: ["zai-zai-api-key"] },
        },
        agents: {
          defaults: {
            // A later `zai` connect onboarded and dragged the gateway primary onto zai...
            model: { primary: "zai/glm-5.2" },
            models: { "openai/gpt-5.6-sol": {}, "zai/glm-5.2": {} },
          },
          // ...but the operator chose gpt-5.6-sol, and that selection lives here.
          list: [{ id: "ask-admin-opzava", model: "openai/gpt-5.6-sol" }],
        },
      }),
      "models.list": ok({
        providers: [
          {
            id: "openai",
            label: "OpenAI",
            suggestedModel: "openai/gpt-5.5",
            authChoices: [
              apiKeyChoice({
                id: "openai-device-code",
                providerId: "openai",
                keyFlag: "openai-api-key",
              }),
            ],
          },
          {
            id: "zai",
            label: "z.ai / GLM",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
        models: [
          { id: "gpt-5.5", name: "GPT 5.5", provider: "openai", available: true },
          { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", provider: "openai", available: true },
          { id: "glm-5.2", name: "GLM 5.2", provider: "zai", available: true },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-14T00:00:00.000Z"),
    });

    const result = await port.applyOrchestratorDelegation({
      ...principal(),
      connectedProviderIds: ["openai", "zai"],
    });

    expect(result.ok).toBe(true);
    // The selection survives the connect that moved the primary...
    expect(result.ok ? result.value.orchestratorModel : null).toBe("openai/gpt-5.6-sol");
    expect(result.ok ? result.value.orchestratorProviderId : null).toBe("openai");

    // ...and the gateway is corrected back onto it, rather than Ask Admin being dragged onto zai.
    const patchCall = admin.calls.find((call) => call.method === "config.patch");
    expect(rawPatch(patchCall!.params)).toMatchObject({
      agents: {
        defaults: { model: { primary: "openai/gpt-5.6-sol" } },
        list: expect.arrayContaining([
          expect.objectContaining({ id: "ask-admin-opzava", model: "openai/gpt-5.6-sol" }),
        ]),
      },
    });
  });

  it("elects a catalog model through one composite orchestrator patch", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-set-main",
        auth: {
          profiles: {
            "openai-device": {
              providerId: "openai",
              authChoiceId: "openai-device-code",
            },
            "zai-zai-api-key": {
              providerId: "zai",
              authChoiceId: "zai-api-key",
              model: "zai/glm-5.2",
            },
          },
          order: { openai: ["openai-device"], zai: ["zai-zai-api-key"] },
        },
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5.5" },
            models: { "openai/gpt-5.5": {} },
          },
          list: [{ id: "other-agent", model: "noop/model" }],
        },
      }),
      "models.list": ok({
        providers: [
          {
            id: "openai",
            label: "OpenAI",
            suggestedModel: "openai/gpt-5.5",
            authChoices: [
              apiKeyChoice({
                id: "openai-device-code",
                providerId: "openai",
                keyFlag: "openai-api-key",
              }),
            ],
          },
          {
            id: "zai",
            label: "z.ai / GLM",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
        models: [
          { id: "gpt-5.5", name: "GPT 5.5", provider: "openai", available: true },
          { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", provider: "openai", available: true },
          { id: "glm-5.2", name: "GLM 5.2", provider: "zai", available: true },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.setMainOrchestrator({
      ...principal(),
      providerId: "openai",
      model: "gpt-5.6-sol",
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toMatchObject({
      orchestratorModel: "openai/gpt-5.6-sol",
      orchestratorProviderId: "openai",
      allowAgents: ["subagent-zai"],
    });
    const patchCall = admin.calls.find((call) => call.method === "config.patch");
    expect(patchCall?.params).toMatchObject({
      baseHash: "config-hash-set-main",
      replacePaths: ["agents.list"],
    });
    expect(rawPatch(patchCall!.params)).toMatchObject({
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.6-sol" },
          models: { "openai/gpt-5.6-sol": {} },
        },
        list: expect.arrayContaining([
          expect.objectContaining({ id: "other-agent" }),
          expect.objectContaining({ id: "ask-admin-opzava", model: "openai/gpt-5.6-sol" }),
          expect.objectContaining({ id: "subagent-zai", model: "zai/glm-5.2" }),
        ]),
      },
    });
    expect(admin.calls.filter((call) => call.method === "config.patch")).toHaveLength(1);
  });

  it("keeps the Ask Admin tool policy when set-main rebuilds agents.list (#146)", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-set-main-policy",
        auth: {
          profiles: {
            "openai-device": { providerId: "openai", authChoiceId: "openai-device-code" },
            "zai-zai-api-key": {
              providerId: "zai",
              authChoiceId: "zai-api-key",
              model: "zai/glm-5.2",
            },
          },
          order: { openai: ["openai-device"], zai: ["zai-zai-api-key"] },
        },
        agents: {
          defaults: { model: { primary: "openai/gpt-5.5" } },
          list: [
            {
              id: "ask-admin-opzava",
              tools: {
                profile: "minimal",
                allow: ASK_ADMIN_TOOL_POLICY_ALLOW,
                deny: ASK_ADMIN_TOOL_POLICY_DENY,
              },
            },
          ],
        },
      }),
      "models.list": ok({
        providers: [
          {
            id: "openai",
            label: "OpenAI",
            suggestedModel: "openai/gpt-5.5",
            authChoices: [
              apiKeyChoice({
                id: "openai-device-code",
                providerId: "openai",
                keyFlag: "openai-api-key",
              }),
            ],
          },
          {
            id: "zai",
            label: "z.ai / GLM",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.setMainOrchestrator({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(true);
    const patchCall = admin.calls.find((call) => call.method === "config.patch");
    const askAdmin = (
      rawPatch(patchCall!.params) as {
        agents: { list: readonly { id: string; tools?: Record<string, unknown> }[] };
      }
    ).agents.list.find((agent) => agent.id === "ask-admin-opzava");

    // The failable check from #146: enabling delegation must not disarm the orchestrator.
    expect(askAdmin?.tools?.["allow"]).toEqual(
      expect.arrayContaining(["opzava_tasks_list", "sessions_spawn"]),
    );
    expect(askAdmin?.tools?.["profile"]).toBe("minimal");
    expect(askAdmin?.tools?.["deny"]).toEqual([...ASK_ADMIN_TOOL_POLICY_DENY]);
  });

  it("sets the main orchestrator from runtime connection state without config auth profiles", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-runtime-main",
        auth: { profiles: {}, order: {} },
        agents: {
          defaults: {
            models: { "openai/gpt-5.5": {} },
          },
          list: [{ id: "other-agent", model: "noop/model" }],
        },
      }),
      "models.list": ok({
        providers: [
          {
            id: "openai",
            label: "OpenAI",
            suggestedModel: "openai/gpt-5.5",
            authChoices: [
              apiKeyChoice({
                id: "openai-device-code",
                providerId: "openai",
                keyFlag: "openai-api-key",
              }),
            ],
          },
        ],
      }),
      "models.authStatus": ok({
        providers: [
          {
            provider: "openai",
            displayName: "OpenAI OAuth",
            status: "ok",
            profiles: [{ profileId: "openai:oauth", type: "oauth", status: "ok" }],
          },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      status: {
        allowed: ["openai/gpt-5.5"],
        auth: {
          providers: [
            {
              provider: "openai",
              profiles: { count: 1, oauth: 1, labels: ["openai:oauth=OAuth"] },
            },
          ],
        },
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.setMainOrchestrator({ ...principal(), providerId: "openai" });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toMatchObject({
      orchestratorModel: "openai/gpt-5.5",
      orchestratorProviderId: "openai",
    });
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(true);
    expect(result.ok ? null : result.error).not.toMatchObject({
      code: "provisioning.connections.orchestratorProviderNotConnected",
    });
  });

  it("rejects setting the main orchestrator to an unconnected provider", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-unconnected",
        auth: { profiles: {}, order: {} },
        agents: {
          defaults: { model: { primary: "openai/gpt-5.5" } },
          list: [],
        },
      }),
      "models.list": ok({
        providers: [
          {
            id: "zai",
            label: "z.ai / GLM",
            suggestedModel: "zai/glm-5.2",
            authChoices: [apiKeyChoice()],
          },
        ],
      }),
      "config.patch": ok({ ok: true }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.setMainOrchestrator({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      code: "provisioning.connections.orchestratorProviderNotConnected",
      details: { providerId: "zai" },
    });
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("starts model-provider device flow by parsing the gateway device-code log", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog:
        '\u001B[36mAuthorize at https://auth.openai.com/codex/device\u001B[0m\nCode: NRK5-7IPKG\n{"refresh_token":"secret-device-token","access_token":"secret-access-token"}\n',
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(gatewayRuntime.deviceLoginCalls).toEqual(["openai"]);
    expect(result.value).toMatchObject({
      kind: "model_provider",
      providerId: "openai",
      authChoiceId: "openai-device-code",
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "NRK5-7IPKG",
      codePending: false,
      expiresAt: "2026-07-03T00:15:00.000Z",
      intervalSeconds: 5,
    });
    expect(JSON.stringify(result.value)).not.toContain("secret-device-token");
    expect(JSON.stringify(result.value)).not.toContain("secret-access-token");
  });

  it("does not surface model-provider device flows from catalog reads", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog:
        "Open https://auth.openai.com/codex/device\nCode: NRK5-7IPKG\nrefresh_token=secret-dashboard-token\n",
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const challenge = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });
    if (!challenge.ok) {
      throw challenge.error;
    }

    const samePrincipalSnapshot = await port.getConnectionsSnapshot(principal());
    const otherPrincipalSnapshot = await port.getConnectionsSnapshot({
      ...principal(),
      actorUserId: "00000000-0000-4000-8000-000000000099",
    });

    expect(challenge.value).toMatchObject({
      kind: "model_provider",
      userCode: "NRK5-7IPKG",
    });
    expect(samePrincipalSnapshot.ok ? samePrincipalSnapshot.value.pendingDeviceFlows : []).toEqual(
      [],
    );
    expect(
      otherPrincipalSnapshot.ok ? otherPrincipalSnapshot.value.pendingDeviceFlows : [],
    ).toEqual([]);
    expect(JSON.stringify(samePrincipalSnapshot)).not.toContain("secret-dashboard-token");
    expect(JSON.stringify(otherPrincipalSnapshot)).not.toContain("secret-dashboard-token");
  });

  it("starting a new model-provider device flow supersedes and stops the prior flow", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: "Open https://auth.openai.com/codex/device\nCode: NRK5-7IPKG\n",
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const first = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });
    const second = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });
    const toggle = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "openai",
      modelId: "gpt-5.5",
      enabled: true,
    });
    if (!first.ok) {
      throw first.error;
    }
    if (!second.ok) {
      throw second.error;
    }
    const firstPoll = await port.pollDeviceFlow({ ...principal(), flowId: first.value.flowId });
    const secondPoll = await port.pollDeviceFlow({ ...principal(), flowId: second.value.flowId });

    expect(toggle.ok ? null : toggle.error).toMatchObject({
      code: "provisioning.connections.providerConnectInFlight",
    });
    expect(gatewayRuntime.deviceLoginCalls).toEqual(["openai", "openai"]);
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(firstPoll.ok ? firstPoll.value : null).toMatchObject({
      status: "expired",
      message: "Model-provider device code expired or has already completed.",
    });
    expect(secondPoll.ok ? secondPoll.value : null).toMatchObject({
      status: "pending",
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "NRK5-7IPKG",
    });
  });

  it("reserves the provider while a device-code login is starting", async () => {
    let releaseLogin!: () => void;
    const deviceLoginBarrier = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: "Open https://auth.openai.com/codex/device\nCode: NRK5-7IPKG\n",
      deviceLoginBarrier,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const starting = port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });
    while (gatewayRuntime.deviceLoginCalls.length === 0) {
      await Promise.resolve();
    }
    const toggle = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "openai",
      modelId: "gpt-5.5",
      enabled: true,
    });
    const disconnect = await port.startModelProviderDisconnect({
      ...principal(),
      providerId: "openai",
    });
    releaseLogin();
    const started = await starting;

    expect(started.ok).toBe(true);
    expect(toggle.ok ? null : toggle.error.code).toBe(
      "provisioning.connections.providerConnectInFlight",
    );
    expect(disconnect.ok ? null : disconnect.error.code).toBe(
      "provisioning.connections.providerConnectInFlight",
    );
  });

  it("keeps toggle and disconnect blocked until expired device-flow cleanup stops the runtime", async () => {
    let releaseStop!: () => void;
    const deviceStopBarrier = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    let now = new Date("2026-07-03T00:00:00.000Z");
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: "Open https://auth.openai.com/codex/device\nCode: NRK5-7IPKG\n",
      deviceStopBarrier,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => now,
    });
    const started = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });
    if (!started.ok) throw started.error;
    now = new Date("2026-07-03T00:16:00.000Z");

    const cleanup = port.pollDeviceFlow({ ...principal(), flowId: started.value.flowId });
    while (gatewayRuntime.deviceStops.length === 0) {
      await Promise.resolve();
    }
    const toggle = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "openai",
      modelId: "gpt-5.5",
      enabled: true,
    });
    const disconnect = await port.startModelProviderDisconnect({
      ...principal(),
      providerId: "openai",
    });

    expect(toggle.ok ? null : toggle.error.code).toBe(
      "provisioning.connections.providerConnectInFlight",
    );
    expect(disconnect.ok ? null : disconnect.error.code).toBe(
      "provisioning.connections.providerConnectInFlight",
    );
    releaseStop();
    await expect(cleanup).resolves.toMatchObject({ ok: true, value: { status: "expired" } });
  });

  it("cleans up model-provider device-flow exec and log when the first log read fails", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLogResult: err(
        new DomainError({
          code: "test.deviceLogReadFailed",
          message: "Could not read device log.",
        }),
      ),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });

    expect(result.ok).toBe(false);
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("cleans up model-provider device-flow exec and log when polling cannot read the log", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog:
        "Open https://auth.openai.com/codex/device\nCode: NRK5-7IPKG\nrefresh_token=poll-read-secret\n",
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const challenge = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai-device-code",
    });
    if (!challenge.ok) {
      throw challenge.error;
    }
    gatewayRuntime.deviceLogResult = err(
      new DomainError({
        code: "test.deviceLogReadFailed",
        message: "Could not read device log with poll-read-secret.",
      }),
    );

    const result = await port.pollDeviceFlow({ ...principal(), flowId: challenge.value.flowId });

    expect(result.ok).toBe(false);
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(JSON.stringify(result)).not.toContain("poll-read-secret");
  });

  it("returns a pending model-provider device-flow challenge after a short empty-log probe", async () => {
    vi.useFakeTimers();
    try {
      const gatewayRuntime = new RecordingGatewayRuntime({
        choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
        deviceCodeLog: "",
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: openAiDeviceFlowAdmin(),
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const resultPromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });

      await vi.advanceTimersByTimeAsync(6_000);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw result.error;
      }
      expect(result.value).toMatchObject({
        kind: "model_provider",
        providerId: "openai",
        authChoiceId: "openai-device-code",
        verificationUri: "",
        userCode: "",
        codePending: true,
        expiresAt: "2026-07-03T00:15:00.000Z",
        intervalSeconds: 5,
      });
      expect(gatewayRuntime.deviceLogReads).toHaveLength(4);
      expect(gatewayRuntime.deviceStops).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("secret");
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls model-provider device flow from code-pending to code-ready to connected", async () => {
    let deviceCodeLog = "";
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: () => deviceCodeLog,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    vi.useFakeTimers();
    let challenge: Awaited<ReturnType<typeof port.startModelProviderDeviceFlow>> | null = null;
    try {
      const challengePromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });
      await vi.advanceTimersByTimeAsync(6_000);
      challenge = await challengePromise;
    } finally {
      vi.useRealTimers();
    }
    expect(challenge?.ok).toBe(true);
    if (challenge === null) {
      throw new Error("expected device-flow challenge");
    }
    if (!challenge.ok) {
      throw challenge.error;
    }
    expect(challenge.value).toMatchObject({ codePending: true, verificationUri: "", userCode: "" });

    const codePending = await port.pollDeviceFlow({
      ...principal(),
      flowId: challenge.value.flowId,
    });
    expect(codePending.ok ? codePending.value : null).toMatchObject({
      status: "pending",
      message: "Requesting device code...",
      codePending: true,
      intervalSeconds: 5,
    });

    deviceCodeLog =
      "Open https://auth.openai.com/codex/device\nCode: NRK5-7IPKG\nrefresh_token=secret-poll-token\n";
    const codeReady = await port.pollDeviceFlow({
      ...principal(),
      flowId: challenge.value.flowId,
    });
    expect(codeReady.ok ? codeReady.value : null).toMatchObject({
      status: "pending",
      message: "Waiting for gateway device-code authorization.",
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "NRK5-7IPKG",
      codePending: false,
      intervalSeconds: 5,
    });
    expect(JSON.stringify(codeReady)).not.toContain("secret-poll-token");

    deviceCodeLog = "";
    const persistedCode = await port.pollDeviceFlow({
      ...principal(),
      flowId: challenge.value.flowId,
    });
    expect(persistedCode.ok ? persistedCode.value : null).toMatchObject({
      status: "pending",
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "NRK5-7IPKG",
      codePending: false,
    });

    gatewayRuntime.connectedDeviceProviderId = "openai";
    const connected = await port.pollDeviceFlow({
      ...principal(),
      flowId: challenge.value.flowId,
    });

    expect(connected.ok ? connected.value : null).toMatchObject({
      status: "connected",
      message: "openai connected in Opzava Gateway.",
      connection: {
        providerId: "openai",
        status: "connected",
        authChoiceId: "openai-device-code",
        connectedAuthMode: "oauth",
      },
    });
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(JSON.stringify(connected)).not.toContain("secret");
  });

  it("surfaces a provider-blocked device-code request as a terminal failure instead of hanging", async () => {
    let deviceCodeLog = "";
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: () => deviceCodeLog,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    vi.useFakeTimers();
    let challenge: Awaited<ReturnType<typeof port.startModelProviderDeviceFlow>> | null = null;
    try {
      const challengePromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });
      await vi.advanceTimersByTimeAsync(6_000);
      challenge = await challengePromise;
    } finally {
      vi.useRealTimers();
    }
    if (challenge === null || !challenge.ok) {
      throw new Error("expected device-flow challenge");
    }

    // A healthy prompter countdown ("Requesting device code..." + "Code expires in N minutes")
    // must NOT be read as a terminal failure.
    deviceCodeLog = "Requesting device code...\nCode expires in 15 minutes\n";
    const stillPending = await port.pollDeviceFlow({
      ...principal(),
      flowId: challenge.value.flowId,
    });
    expect(stillPending.ok ? stillPending.value : null).toMatchObject({
      status: "pending",
      codePending: true,
    });

    // A provider block (Cloudflare 429): the CLI failure headline is pushed before ~4KB of
    // trailing challenge HTML, out of the recent-tail window, so the whole log must be scanned.
    const trailingHtml = `<!DOCTYPE html><html>${"x".repeat(6000)}</html>`;
    deviceCodeLog =
      "OpenAI device code failed\n" +
      "Trouble with device code login? See https://docs.openclaw.ai/start/faq\n" +
      `Error: OpenAI device code request failed: HTTP 429 ${trailingHtml}\n`;
    const failed = await port.pollDeviceFlow({ ...principal(), flowId: challenge.value.flowId });
    expect(failed.ok ? failed.value : null).toMatchObject({ status: "failed" });
    expect(failed.ok && failed.value.status === "failed" ? failed.value.message : "").toMatch(
      /blocked, rate-limited, or denied/i,
    );
    // The redacted challenge HTML must not leak into the surfaced result.
    expect(JSON.stringify(failed)).not.toContain("<!DOCTYPE html>");
  });

  it("expires pending model-provider device flows and cleans up the gateway log", async () => {
    let nowMs = Date.parse("2026-07-03T00:00:00.000Z");
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: "",
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date(nowMs),
    });

    vi.useFakeTimers();
    let challenge: Awaited<ReturnType<typeof port.startModelProviderDeviceFlow>> | null = null;
    try {
      const challengePromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });
      await vi.advanceTimersByTimeAsync(6_000);
      challenge = await challengePromise;
    } finally {
      vi.useRealTimers();
    }
    expect(challenge?.ok).toBe(true);
    if (challenge === null) {
      throw new Error("expected device-flow challenge");
    }
    if (!challenge.ok) {
      throw challenge.error;
    }

    nowMs += 15 * 60 * 1000 + 1;
    const expired = await port.pollDeviceFlow({ ...principal(), flowId: challenge.value.flowId });

    expect(expired.ok ? expired.value : null).toMatchObject({
      status: "expired",
      message: "Could not get a device code, try again.",
    });
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
  });

  it("cleans up an unpolled model-provider device flow when its timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const gatewayRuntime = new RecordingGatewayRuntime({
        choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
        deviceCodeLog: "",
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: openAiDeviceFlowAdmin(),
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      });

      const challengePromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });
      await vi.advanceTimersByTimeAsync(6_000);
      const challenge = await challengePromise;
      expect(challenge.ok).toBe(true);
      expect(gatewayRuntime.deviceStops).toEqual([]);

      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

      expect(gatewayRuntime.deviceStops).toEqual([
        { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels an in-progress model-provider device flow before disconnecting that provider", async () => {
    let deviceCodeLog = "";
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: () => deviceCodeLog,
    });
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": ok({ hash: "config-hash-openai", auth: { profiles: {}, order: {} } }),
      "models.authStatus": ok({ providers: [] }),
      "models.list": ok({
        providers: [{ id: "openai", label: "OpenAI", authChoices: [] }],
        models: [{ id: "gpt-5.5", name: "GPT 5.5", provider: "openai" }],
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    vi.useFakeTimers();
    let challenge: Awaited<ReturnType<typeof port.startModelProviderDeviceFlow>> | null = null;
    try {
      const challengePromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });
      await vi.advanceTimersByTimeAsync(6_000);
      challenge = await challengePromise;
    } finally {
      vi.useRealTimers();
    }
    expect(challenge?.ok).toBe(true);
    if (challenge === null || !challenge.ok) {
      throw new Error("expected device-flow challenge");
    }

    deviceCodeLog = "refresh_token=secret-race-token";
    const disconnected = await port.disconnectModelProvider({
      ...principal(),
      providerId: "openai",
    });
    const poll = await port.pollDeviceFlow({ ...principal(), flowId: challenge.value.flowId });

    expect(disconnected.ok).toBe(true);
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(poll.ok ? poll.value : null).toMatchObject({
      status: "expired",
      message: "Model-provider device code expired or has already completed.",
    });
    expect(JSON.stringify(disconnected)).not.toContain("secret-race-token");
  });

  it("maps terminal gateway device-flow logs to failed without leaking log contents", async () => {
    let deviceCodeLog = "";
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog: () => deviceCodeLog,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: openAiDeviceFlowAdmin(),
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    vi.useFakeTimers();
    let challenge: Awaited<ReturnType<typeof port.startModelProviderDeviceFlow>> | null = null;
    try {
      const challengePromise = port.startModelProviderDeviceFlow({
        ...principal(),
        providerId: "openai",
        authChoiceId: "openai-device-code",
      });
      await vi.advanceTimersByTimeAsync(6_000);
      challenge = await challengePromise;
    } finally {
      vi.useRealTimers();
    }
    expect(challenge?.ok).toBe(true);
    if (challenge === null) {
      throw new Error("expected device-flow challenge");
    }
    if (!challenge.ok) {
      throw challenge.error;
    }

    deviceCodeLog = "Error: authorization denied refresh_token=secret-terminal-token";
    const failed = await port.pollDeviceFlow({ ...principal(), flowId: challenge.value.flowId });

    expect(failed.ok ? failed.value : null).toMatchObject({
      status: "failed",
      message:
        "The provider blocked, rate-limited, or denied the device-code request. Wait a minute and retry, or connect with an API key.",
    });
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(JSON.stringify(failed)).not.toContain("secret-terminal-token");
    expect(JSON.stringify(failed)).not.toContain("authorization denied");
  });

  it("starts Docker device-flow logging through a private redacted log and securely deletes it", async () => {
    const requests: {
      readonly url: string;
      readonly body: Record<string, unknown> | null;
    }[] = [];
    let execNumber = 0;
    const jsonResponse = (value: unknown) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const fetchImpl: typeof fetch = async (url, init) => {
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      requests.push({ url: String(url), body });

      if (String(url).endsWith("/containers/gateway/exec")) {
        execNumber += 1;
        return jsonResponse({ Id: `exec-${execNumber}` });
      }
      if (String(url).includes("/start")) {
        return new Response(new Uint8Array(), { status: 200 });
      }
      if (String(url).includes("/json")) {
        return jsonResponse({ Pid: 123, Running: true, ExitCode: 0 });
      }
      return new Response("not found", { status: 404 });
    };
    const runtime = new DockerOpenClawGatewayRuntime({
      dockerHost: "tcp://docker-socket-proxy:2375",
      containerName: "gateway",
      fetch: fetchImpl,
    });

    const started = await runtime.startDeviceCodeLogin("openai", "main");
    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw started.error;
    }
    await runtime.stopDeviceCodeLogin(started.value.execId, started.value.logPath);

    const execBodies = requests
      .filter((request) => request.url.endsWith("/containers/gateway/exec"))
      .map((request) => request.body);
    const startShell = execBodies[0]?.["Cmd"];
    expect(Array.isArray(startShell) ? startShell[2] : null).toEqual(expect.any(String));
    const startCommand = Array.isArray(startShell) ? String(startShell[2]) : "";
    expect(started.value.logPath).toMatch(/^\/tmp\/opzava-df-[^/]+\/device\.log$/);
    // The OAuth profile must land in the shared store, not the default agent's private one (#169).
    // The login runs inside `script -qfc '...'`, so its own quoting is escaped once more.
    expect(startCommand).toMatch(
      /models auth --agent .*main.* login --provider .*openai.* --device-code/,
    );
    expect(startCommand).toContain("mkdir -m 700 '/tmp/opzava-df-");
    expect(startCommand).toContain("umask 077");
    expect(startCommand).toContain("/usr/bin/script -qfc");
    expect(startCommand).toContain("/dev/null | sed");
    expect(startCommand).toContain(">> '/tmp/opzava-df-");
    expect(startCommand).not.toContain("secret");

    const cleanupCommand = execBodies
      .map((body) => (Array.isArray(body?.["Cmd"]) ? String(body["Cmd"][2]) : ""))
      .find((command) => command.includes("shred -u"));
    expect(cleanupCommand).toContain("rm -f");
    expect(cleanupCommand).toContain("rmdir");
    expect(cleanupCommand).not.toContain("secret");
  });

  it("returns a structured Docker timeout error instead of hanging an exec request", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: typeof fetch = async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      const runtime = new DockerOpenClawGatewayRuntime({
        dockerHost: "tcp://docker-socket-proxy:2375",
        containerName: "gateway",
        fetch: fetchImpl,
      });

      const resultPromise = runtime.listAuthChoices();
      await vi.advanceTimersByTimeAsync(15_001);
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      expect(result.ok ? null : result.error).toMatchObject({
        code: "provisioning.docker.requestTimeout",
        message: "Docker API request timed out.",
        details: { timeoutMs: 15_000 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs GitHub OAuth device flow against fetch and stores the token in the vault", async () => {
    const vault = new MemorySecretsVault();
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/device/code")) {
        return new Response(
          JSON.stringify({
            device_code: "device-code-1",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            expires_in: 600,
            interval: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          access_token: "github-access-token",
          token_type: "bearer",
          scope: "repo",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: new RecordingAdminClient({}),
      secretsVault: vault,
      githubRepository: "anthonykewl20/opzava",
      githubOAuthClientId: "github-client-id",
      fetch: fetchImpl,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const challenge = await port.startGitHubDeviceFlow(principal());
    expect(challenge.ok).toBe(true);
    if (!challenge.ok) {
      throw challenge.error;
    }

    const poll = await port.pollDeviceFlow({ ...principal(), flowId: challenge.value.flowId });
    expect(poll.ok).toBe(true);
    expect(poll.ok ? poll.value : null).toMatchObject({
      status: "connected",
      connection: {
        status: "connected",
        repository: "anthonykewl20/opzava",
      },
    });

    const ref = await vault.getRef();
    expect(ref.ok && ref.value !== null).toBe(true);
  });

  it("reports vault-backed GitHub status from the live GitHub token probe", async () => {
    const vault = new MemorySecretsVault();
    await vault.putSecret({
      tenantId: principal().orgId as TenantId,
      purpose: "provider",
      label: GITHUB_ISSUES_TOKEN_SECRET_LABEL,
      value: "github-access-token",
    });
    const fetchImpl: typeof fetch = async (_url, init) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer github-access-token",
      });

      return new Response(JSON.stringify({ login: "opzava-admin" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-oauth-scopes": "repo, read:user",
        },
      });
    };
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: new RecordingAdminClient({
        "config.get": ok({}),
        health: ok({ status: "ok" }),
        "last-heartbeat": ok({ lastHeartbeatAt: "2026-07-03T00:00:00.000Z" }),
        "models.list": ok({ providers: [] }),
      }),
      secretsVault: vault,
      githubRepository: "anthonykewl20/opzava",
      fetch: fetchImpl,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.getConnectionsSnapshot(principal());

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.github : null).toMatchObject({
      status: "connected",
      accountLabel: "@opzava-admin",
      scopes: ["repo", "read:user"],
      repository: "anthonykewl20/opzava",
      message: "GitHub token validated from SecretsVaultPort.",
    });
  });

  it("maps GitHub OAuth denial and expiry without storing token material", async () => {
    let pollMode: "denied" | "pending" = "denied";
    let nowMs = Date.parse("2026-07-03T00:00:00.000Z");
    const vault = new MemorySecretsVault();
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/device/code")) {
        return new Response(
          JSON.stringify({
            device_code: "device-code-2",
            user_code: "WXYZ-1234",
            verification_uri: "https://github.com/login/device",
            expires_in: 1,
            interval: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify(
          pollMode === "denied" ? { error: "access_denied" } : { error: "authorization_pending" },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: new RecordingAdminClient({}),
      secretsVault: vault,
      githubRepository: "anthonykewl20/opzava",
      githubOAuthClientId: "github-client-id",
      fetch: fetchImpl,
      now: () => new Date(nowMs),
    });

    const deniedChallenge = await port.startGitHubDeviceFlow(principal());
    expect(deniedChallenge.ok).toBe(true);
    if (!deniedChallenge.ok) {
      throw deniedChallenge.error;
    }
    const denied = await port.pollDeviceFlow({
      ...principal(),
      flowId: deniedChallenge.value.flowId,
    });
    expect(denied.ok ? denied.value : null).toMatchObject({
      status: "failed",
      message: "GitHub device authorization was denied.",
    });

    pollMode = "pending";
    const expiringChallenge = await port.startGitHubDeviceFlow(principal());
    expect(expiringChallenge.ok).toBe(true);
    if (!expiringChallenge.ok) {
      throw expiringChallenge.error;
    }
    nowMs += 2_000;
    const expired = await port.pollDeviceFlow({
      ...principal(),
      flowId: expiringChallenge.value.flowId,
    });
    expect(expired.ok ? expired.value : null).toMatchObject({
      status: "expired",
      message: "GitHub device code expired.",
    });

    const ref = await vault.getRef();
    expect(ref.ok ? ref.value : null).toBeNull();
  });

  // Regression: issue #168. Disconnect logs out the provider itself plus every configured non-main
  // agent, and the gateway caps control-plane writes at 3 per 60s — so the logouts are paced 20s
  // apart and a normal tenant needs 60-120s+. The web BFF aborts every provisioning call at 20s
  // (apps/web/lib/connections.ts: workerRequestTimeoutMs), so the disconnect SUCCEEDED server-side
  // while the user was shown "Provisioning worker request timed out." and a doomed "Retry
  // disconnect". The two budgets can never both be satisfied, so the paced work must not sit inside
  // the request at all: starting the op has to return immediately and the caller polls it.
  //
  // Guard the two budgets against silently drifting apart again.
  const webClientAbortBudgetMs = 20_000;

  function disconnectAdmin(agentCount: number): RecordingAdminClient {
    return new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": ok({
        hash: "config-hash-openai",
        auth: { profiles: {}, order: {} },
        agents: {
          list: Array.from({ length: agentCount }, (_unused, index) => ({
            id: `agent-${index + 1}`,
            model: "openai/gpt-5.5",
          })),
        },
      }),
      "models.authStatus": ok({ providers: [] }),
    });
  }

  function orchestratorDisconnectAdmin(patch: () => Result<unknown>): RecordingAdminClient {
    return new RecordingAdminClient({
      "models.authLogout": ok({ provider: "openai", removedProfiles: [], abortedRunIds: [] }),
      "config.get": ok({
        hash: "config-hash-two-phase-disconnect",
        auth: { profiles: {}, order: {} },
        agents: {
          defaults: { model: { primary: "openai/gpt-5.5" } },
          list: [{ id: "ask-admin-opzava", model: "openai/gpt-5.5" }],
        },
      }),
      "models.authStatus": ok({ providers: [] }),
      "models.list": ok({
        providers: [
          { id: "openai", label: "OpenAI", authChoices: [] },
          { id: "anthropic", label: "Anthropic", authChoices: [] },
        ],
        models: [
          { id: "gpt-5.5", name: "GPT 5.5", provider: "openai" },
          { id: "claude-opus-4-8", name: "Claude Opus 4.8", provider: "anthropic" },
        ],
      }),
      "config.patch": patch,
    });
  }

  function anthropicOnlyRuntime(): RecordingGatewayRuntime {
    return new RecordingGatewayRuntime({
      choices: [],
      status: {
        allowed: ["anthropic/claude-opus-4-8"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:default=Setup token"] },
            },
          ],
        },
      },
    });
  }

  it("publishes disconnected before a rate-limited orchestrator reconcile completes", async () => {
    vi.useFakeTimers();
    try {
      let patchAttempts = 0;
      const admin = orchestratorDisconnectAdmin(() => {
        patchAttempts += 1;
        return patchAttempts === 1
          ? err(
              new DomainError({
                code: "provisioning.openclawAdmin.requestRejected",
                message: "rate limit exceeded for config.patch; retry after 36s",
                details: { retryAfterMs: 5 },
              }),
            )
          : ok({ ok: true });
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime: anthropicOnlyRuntime(),
        now: () => new Date(Date.now()),
      });

      const start = await port.startModelProviderDisconnect({
        ...principal(),
        providerId: "openai",
      });
      if (!start.ok) throw start.error;

      let poll = await port.pollModelProviderDisconnect({ ...principal(), opId: start.value.opId });
      for (
        let attempt = 0;
        attempt < 20 && poll.ok && poll.value.status === "pending";
        attempt += 1
      ) {
        await Promise.resolve();
        poll = await port.pollModelProviderDisconnect({ ...principal(), opId: start.value.opId });
      }
      while (patchAttempts === 0) {
        await Promise.resolve();
      }

      expect(poll.ok ? poll.value.status : null).toBe("disconnected");
      expect(patchAttempts).toBe(1);
      const runningSnapshot = await port.getConnectionsSnapshot(principal());
      expect(
        runningSnapshot.ok ? runningSnapshot.value.orchestrator.reconcile : null,
      ).toMatchObject({
        status: "running",
        reason: "disconnect",
        providerId: "openai",
      });

      await vi.advanceTimersByTimeAsync(1_005);
      expect(patchAttempts).toBe(2);
      const completedSnapshot = await port.getConnectionsSnapshot(principal());
      expect(completedSnapshot.ok ? completedSnapshot.value.orchestrator.reconcile : null).toEqual({
        status: "idle",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a failed post-disconnect reconcile visible in the snapshot", async () => {
    const admin = orchestratorDisconnectAdmin(() =>
      err(
        new DomainError({
          code: "provisioning.openclawAdmin.requestRejected",
          message: "Gateway rejected config.patch with api_key=secret-reconcile-value.",
        }),
      ),
    );
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: anthropicOnlyRuntime(),
      now: () => new Date("2026-07-14T00:00:00.000Z"),
    });

    const start = await port.startModelProviderDisconnect({
      ...principal(),
      providerId: "openai",
    });
    if (!start.ok) throw start.error;

    let snapshotResult = await port.getConnectionsSnapshot(principal());
    for (
      let attempt = 0;
      attempt < 20 &&
      snapshotResult.ok &&
      snapshotResult.value.orchestrator.reconcile.status !== "failed";
      attempt += 1
    ) {
      await Promise.resolve();
      snapshotResult = await port.getConnectionsSnapshot(principal());
    }

    const reconcile = snapshotResult.ok ? snapshotResult.value.orchestrator.reconcile : null;
    expect(reconcile).toMatchObject({
      status: "failed",
      reason: "disconnect",
      providerId: "openai",
      startedAt: "2026-07-14T00:00:00.000Z",
    });
    expect(reconcile?.message).toContain("Gateway rejected config.patch");
    expect(reconcile?.message).not.toContain("secret-reconcile-value");

    await Promise.resolve();
    const laterSnapshot = await port.getConnectionsSnapshot(principal());
    expect(laterSnapshot.ok ? laterSnapshot.value.orchestrator.reconcile.status : null).toBe(
      "failed",
    );
  });

  it.each([1, 2, 3, 4, 6, 10])(
    "starts an OpenAI disconnect inside the web client's abort budget with %i agent(s)",
    async (agentCount) => {
      vi.useFakeTimers();
      try {
        const admin = disconnectAdmin(agentCount);
        const port = new GatewayAdminConnectionsProvisioningPort({
          adminClient: admin,
          secretsVault: new MemorySecretsVault(),
          githubRepository: "anthonykewl20/opzava",
          now: () => new Date(Date.now()),
        });

        const startedAtMs = Date.now();
        const start = await port.startModelProviderDisconnect({
          ...principal(),
          providerId: "openai",
        });
        const startElapsedMs = Date.now() - startedAtMs;

        expect(start.ok).toBe(true);
        // The whole point: the request that STARTS the disconnect never waits for the paced work,
        // however many agents there are. Pre-fix this was (agentCount) x 20_000 for 3+ agents.
        expect(startElapsedMs).toBeLessThan(webClientAbortBudgetMs);

        // The paced work still runs to completion in the background, and every agent is logged out.
        await vi.advanceTimersByTimeAsync(600_000);
        const poll = await port.pollModelProviderDisconnect({
          ...principal(),
          opId: start.ok ? start.value.opId : "",
        });

        expect(poll.ok ? poll.value.status : null).toBe("disconnected");
        expect(admin.calls.filter((call) => call.method === "models.authLogout")).toHaveLength(
          agentCount + 1,
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  // Second cliff (#168): the pacing sleeps used to be charged against the 150s transient-retry
  // budget, so 8+ non-main agents exhausted it and the disconnect hard-failed with
  // disconnectRetryExhausted, leaving the provider half-disconnected. Pacing is planned work, not a
  // retry, so it no longer consumes that budget.
  it("disconnects a provider across 10 agents without exhausting the retry budget", async () => {
    vi.useFakeTimers();
    try {
      const admin = disconnectAdmin(10);
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        now: () => new Date(Date.now()),
      });

      const start = await port.startModelProviderDisconnect({
        ...principal(),
        providerId: "openai",
      });
      await vi.advanceTimersByTimeAsync(600_000);
      const poll = await port.pollModelProviderDisconnect({
        ...principal(),
        opId: start.ok ? start.value.opId : "",
      });

      const state = poll.ok ? poll.value : null;
      expect(state?.status).toBe("disconnected");
      expect(JSON.stringify(state)).not.toContain("disconnectRetryExhausted");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("model-provider credential store scope (issue #169)", () => {
  const anthropicSetupTokenChoice = {
    id: "setup-token",
    label: "Anthropic setup-token",
    mode: "api-key" as const,
    keyFlag: "token",
  };
  const anthropicConnectedStatus = {
    allowed: ["anthropic/claude-sonnet-5"],
    auth: {
      providers: [
        {
          provider: "anthropic",
          profiles: { count: 1, token: 1, labels: ["anthropic:manual=Setup token"] },
        },
      ],
    },
  };
  // The live gateway topology: the orchestrator is the DEFAULT agent (so onboard writes there), and
  // a per-provider subagent runs the Q17 delegation.
  const gatewayConfig = {
    hash: "config-hash-169",
    plugins: { allow: ["anthropic"] },
    agents: {
      list: [
        { id: orchestratorDefaultAgentId, default: true },
        { id: "subagent-anthropic" },
        { id: sharedCredentialAgentId },
      ],
    },
  };
  const setupToken = `sk-ant-oat01-${"a".repeat(95)}`;

  const connectAnthropic = async (
    admin: RecordingAdminClient,
    gatewayRuntime: RecordingGatewayRuntime,
  ) => {
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });
    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "anthropic",
      authChoiceId: "setup-token",
      apiKey: setupToken,
    });
    return pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");
  };

  it("leaves the delegation subagent able to resolve the provider after connect", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok(gatewayConfig),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [anthropicSetupTokenChoice],
      status: anthropicConnectedStatus,
    });

    const result = await connectAnthropic(admin, gatewayRuntime);

    expect(result.ok).toBe(true);
    // Onboard still stores it in the orchestrator's own store — that half was never broken...
    expect(gatewayRuntime.resolvableBy(orchestratorDefaultAgentId, "anthropic")).toBe(true);
    // ...but the shared store is the ONLY thing other agents inherit from, so the credential has to
    // be placed there too. Without this write `subagent-anthropic` fails with
    // `No API key found for provider "anthropic"` while the UI still reports Connected.
    expect(gatewayRuntime.agentCredentialWrites).toContainEqual({
      agentId: sharedCredentialAgentId,
      providerId: "anthropic",
    });
    expect(gatewayRuntime.resolvableBy("subagent-anthropic", "anthropic")).toBe(true);
  });

  it("registers the shared store agent so it is addressable", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "config-hash-169b", plugins: { allow: ["anthropic"] } }),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [anthropicSetupTokenChoice],
      status: anthropicConnectedStatus,
    });

    const result = await connectAnthropic(admin, gatewayRuntime);

    expect(result.ok).toBe(true);
    // `--agent main` is rejected outright unless `main` is a configured agent, so a gateway that has
    // never seen it must have the entry added before the credential can be written there.
    const agentPatches = admin.calls
      .filter((call) => call.method === "config.patch")
      .map((call) => rawPatch(call.params))
      .filter((patch) => (patch as { agents?: unknown }).agents !== undefined);
    expect(agentPatches).toContainEqual({
      agents: { list: [{ id: sharedCredentialAgentId }] },
    });
    expect(JSON.stringify(admin.calls)).not.toContain(setupToken);
  });

  it("fails the connect when an agent that needs the provider cannot resolve it", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok(gatewayConfig),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [anthropicSetupTokenChoice],
      status: anthropicConnectedStatus,
    });
    // Simulate the store-scope drift this bug was: the write reports success but the credential does
    // not land where agents read from. `models status` still says "connected" — it reports the
    // orchestrator's store — so only a resolvability check can catch it.
    gatewayRuntime.writeAgentCredentialResult = ok({ exitCode: 0, stdout: "", stderr: "" });

    const result = await connectAnthropic(admin, gatewayRuntime);

    expect(result.ok ? result.value : result.error).toMatchObject({
      status: "failed",
      code: "provisioning.connections.providerCredentialUnresolvable",
    });
  });

  it("clears the shared store on disconnect", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({
        hash: "config-hash-169c",
        auth: { profiles: {}, order: {} },
        agents: gatewayConfig.agents,
      }),
      "models.authLogout": ok({ provider: "anthropic", removedProfiles: [], abortedRunIds: [] }),
      "models.authStatus": ok({ providers: [] }),
      "models.list": ok({ providers: [], models: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "anthropic" });

    expect(result.ok).toBe(true);
    // Connect writes the credential into the shared store, so a disconnect that skipped it would
    // leave a live credential behind: disconnected in the UI, still usable by every agent.
    const logoutTargets = admin.calls
      .filter((call) => call.method === "models.authLogout")
      .map((call) => (call.params as { readonly agent?: string }).agent ?? "default");
    expect(logoutTargets).toContain(sharedCredentialAgentId);
  });

  it("points the device-code login at the shared store", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok(gatewayConfig),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai", label: "OAuth device flow", mode: "device-flow" }],
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.startModelProviderDeviceFlow({
      ...principal(),
      providerId: "openai",
      authChoiceId: "openai",
    });

    expect(result.ok).toBe(true);
    // The device-code CLI writes the OAuth profile itself, so the store has to be named up front —
    // un-agented it would land in the orchestrator's store and hit this same bug.
    expect(gatewayRuntime.deviceLoginAgentIds).toEqual([sharedCredentialAgentId]);
  });
});

describe("setup-token config profile does not suppress the shared write (issue #169)", () => {
  // The live gateway shape that broke the first cut of this fix: an Anthropic setup-token onboard
  // writes a `mode: "token"` entry into config.auth.profiles while the token itself lives in an
  // agent store. Classifying that entry as "the credential is in the config, so it is already
  // global" skips the shared write for the exact provider this issue is about.
  const configWithTokenProfile = {
    hash: "config-hash-169-token-profile",
    plugins: { allow: ["anthropic"] },
    auth: {
      profiles: { "anthropic:default": { provider: "anthropic", mode: "token" } },
      order: {},
    },
    agents: {
      list: [
        { id: "ask-admin-opzava", default: true },
        { id: "subagent-anthropic" },
        { id: "main" },
      ],
    },
  };

  it("still shares the credential when the provider has a config token profile", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok(configWithTokenProfile),
      "config.patch": ok({ ok: true }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [
        { id: "setup-token", label: "Anthropic setup-token", mode: "api-key", keyFlag: "token" },
      ],
      status: {
        allowed: ["anthropic/claude-sonnet-5"],
        auth: {
          providers: [
            {
              provider: "anthropic",
              profiles: { count: 1, token: 1, labels: ["anthropic:default=Setup token"] },
            },
          ],
        },
      },
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const start = await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "anthropic",
      authChoiceId: "setup-token",
      apiKey: `sk-ant-oat01-${"a".repeat(95)}`,
    });
    const result = await pollApiKeyConnectUntilTerminal(port, start.ok ? start.value.opId : "");

    expect(result.ok).toBe(true);
    expect(gatewayRuntime.agentCredentialWrites).toContainEqual({
      agentId: "main",
      providerId: "anthropic",
    });
    expect(gatewayRuntime.resolvableBy("subagent-anthropic", "anthropic")).toBe(true);
  });

  it("logs the shared store out even for a provider with a config profile", async () => {
    const admin: RecordingAdminClient = new RecordingAdminClient({
      // The config profile is gone once disconnect has patched it away, so the fail-closed
      // post-check sees a genuinely cleared provider.
      "config.get": () =>
        ok({
          ...configWithTokenProfile,
          auth: admin.calls.some((call) => call.method === "config.patch")
            ? { profiles: {}, order: {} }
            : configWithTokenProfile.auth,
        }),
      "config.patch": ok({ ok: true }),
      "models.authLogout": ok({ provider: "anthropic", removedProfiles: [], abortedRunIds: [] }),
      "models.authStatus": ok({ providers: [] }),
      "models.list": ok({ providers: [], models: [] }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "anthropic" });

    expect(result.ok).toBe(true);
    // Previously this provider logged out ONLY the un-agented default target, leaving the token in
    // every other agent store — including the shared one connect now writes to.
    const logoutTargets = admin.calls
      .filter((call) => call.method === "models.authLogout")
      .map((call) => (call.params as { readonly agent?: string }).agent ?? "default");
    expect(logoutTargets).toEqual(
      expect.arrayContaining(["default", "ask-admin-opzava", "subagent-anthropic", "main"]),
    );
  });

  it("unions models.list with only the enabled owning plugin catalog and dedupes by model id", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "catalog-hash", config: bundleConfig() }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({}),
      "models.list": ok(bundleModelsPayload),
      "models.authStatus": ok({ providers: [] }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      pluginDiscoveryResult: ok({
        ...bundleDiscovery,
        plugins: [...bundleDiscovery.plugins, { id: "disabled-provider", enabled: false }],
        catalogs: [
          ...bundleDiscovery.catalogs,
          {
            pluginId: "disabled-provider",
            providers: {
              "disabled-provider": { models: [{ id: "must-not-appear", name: "Disabled" }] },
            },
          },
        ],
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
    });

    const result = await port.getConnectionsSnapshot(principal());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(
      result.value.providerCatalog.find((entry) => entry.id === "opencode-go")?.catalogModels,
    ).toEqual([
      { id: "base", label: "Base" },
      { id: "visible", label: "Registry Visible" },
      { id: "kimi-k2.6", label: "Kimi K2.6" },
    ]);
    expect(result.value.providerCatalog.some((entry) => entry.id === "disabled-provider")).toBe(
      false,
    );
    expect(gatewayRuntime.pluginDiscoveryCalls).toBe(1);
  });

  it("excludes catalog-only models when the matching owning plugin is disabled", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "catalog-hash", config: bundleConfig() }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({}),
      "models.list": ok(bundleModelsPayload),
      "models.authStatus": ok({ providers: [] }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      pluginDiscoveryResult: ok({
        catalogs: bundleDiscovery.catalogs,
        plugins: [{ id: "opencode-go", enabled: false }],
      }),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
    });

    const result = await port.getConnectionsSnapshot(principal());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(
      result.value.providerCatalog.find((entry) => entry.id === "opencode-go")?.catalogModels,
    ).toEqual([
      { id: "base", label: "Base" },
      { id: "visible", label: "Registry Visible" },
    ]);
  });

  it("warns once and falls back to models.list when plugin catalog discovery fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "catalog-hash", config: bundleConfig() }),
      health: ok({ status: "ok" }),
      "last-heartbeat": ok({}),
      "models.list": ok(bundleModelsPayload),
      "models.authStatus": ok({
        providers: [{ provider: "opencode-go", status: "missing", profiles: [] }],
      }),
    });
    const gatewayRuntime = new RecordingGatewayRuntime({
      pluginDiscoveryResult: err(
        new DomainError({ code: "gateway.catalogReadFailed", message: "catalog read failed" }),
      ),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
    });

    const result = await port.getConnectionsSnapshot(principal());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(
      result.value.providerCatalog.find((entry) => entry.id === "opencode-go")?.catalogModels,
    ).toEqual([
      { id: "base", label: "Base" },
      { id: "visible", label: "Registry Visible" },
    ]);
    expect(gatewayRuntime.pluginDiscoveryCalls).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("connections.pluginModelDiscovery.unavailable", {
      code: "gateway.catalogReadFailed",
    });
  });

  it("enables a plugin-catalog model with the full registry definition without clobbering entries", async () => {
    const admin = modelToggleAdmin({ config: bundleConfig(), models: bundleModelsPayload });
    const gatewayRuntime = new RecordingGatewayRuntime({
      pluginDiscoveryResult: ok(bundleDiscovery),
      statusResult: toggleStatusFromAdmin(admin),
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime,
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "kimi-k2.6",
      enabled: true,
    });

    expect(result.ok).toBe(true);
    const patch = JSON.parse(
      String(admin.calls.find((call) => call.method === "config.patch")?.params["raw"]),
    ) as Record<string, unknown>;
    expect(patch).toMatchObject({
      agents: { defaults: { models: { "opencode-go/kimi-k2.6": {} } } },
      models: {
        providers: {
          "opencode-go": {
            models: [
              { id: "base", existing: true },
              {
                id: "kimi-k2.6",
                name: "Kimi K2.6",
                reasoning: true,
                custom: { kept: true },
              },
            ],
          },
        },
      },
    });
  });

  it("enables an already registry-visible model by changing only agents.defaults.models", async () => {
    const admin = modelToggleAdmin({ config: bundleConfig(), models: bundleModelsPayload });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({
        pluginDiscoveryResult: ok(bundleDiscovery),
        statusResult: toggleStatusFromAdmin(admin),
      }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(true);
    const raw = admin.calls.find((call) => call.method === "config.patch")?.params["raw"];
    expect(JSON.parse(String(raw))).toEqual({
      agents: { defaults: { models: { "opencode-go/visible": {} } } },
    });
  });

  it("disables only the defaults key and keeps registry metadata", async () => {
    const admin = modelToggleAdmin({
      config: bundleConfig({ enabled: ["base", "kimi-k2.6"] }),
      models: bundleModelsPayload,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "kimi-k2.6",
      enabled: false,
    });

    expect(result.ok).toBe(true);
    const raw = admin.calls.find((call) => call.method === "config.patch")?.params["raw"];
    expect(JSON.parse(String(raw))).toEqual({
      agents: { defaults: { models: { "opencode-go/kimi-k2.6": null } } },
    });
  });

  it.each([
    [
      "last enabled",
      bundleConfig({ enabled: ["kimi-k2.6"] }),
      "provisioning.connections.lastEnabledModel",
    ],
    [
      "primary",
      bundleConfig({ enabled: ["base", "kimi-k2.6"], defaultsModel: "opencode-go/kimi-k2.6" }),
      "provisioning.connections.modelInUse",
    ],
    [
      "fallback",
      bundleConfig({
        enabled: ["base", "kimi-k2.6"],
        defaultsModel: { primary: "other/default", fallbacks: ["opencode-go/kimi-k2.6"] },
      }),
      "provisioning.connections.modelInUse",
    ],
    [
      "image fallback",
      bundleConfig({
        enabled: ["base", "kimi-k2.6"],
        imageModel: { fallbacks: ["opencode-go/kimi-k2.6"] },
      }),
      "provisioning.connections.modelInUse",
    ],
    [
      "auth profile",
      bundleConfig({
        enabled: ["base", "kimi-k2.6"],
        profileModel: "opencode-go/kimi-k2.6",
      }),
      "provisioning.connections.modelInUse",
    ],
  ])("refuses to disable a %s model", async (_case, config, expectedCode) => {
    const admin = modelToggleAdmin({ config, models: bundleModelsPayload });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "kimi-k2.6",
      enabled: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.error.code).toBe(expectedCode);
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("treats enable and disable requests that already hold as idempotent no-ops", async () => {
    const enableAdmin = modelToggleAdmin({
      config: bundleConfig({ enabled: ["base", "visible"] }),
      models: bundleModelsPayload,
    });
    const disableAdmin = modelToggleAdmin({ config: bundleConfig(), models: bundleModelsPayload });
    const makePort = (admin: RecordingAdminClient) =>
      new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
      });

    const enabled = await makePort(enableAdmin).setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });
    const disabled = await makePort(disableAdmin).setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "kimi-k2.6",
      enabled: false,
    });

    expect(enabled.ok).toBe(true);
    expect(disabled.ok).toBe(true);
    expect(enableAdmin.calls.some((call) => call.method === "config.patch")).toBe(false);
    expect(disableAdmin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("retries a stale base hash but not other mutation failures", async () => {
    const admin = modelToggleAdmin({
      config: bundleConfig(),
      models: bundleModelsPayload,
      patchResults: [
        err(new DomainError({ code: "gateway.staleBaseHash", message: "baseHash is stale" })),
        ok({ ok: true }),
      ],
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({
        pluginDiscoveryResult: ok(bundleDiscovery),
        statusResult: toggleStatusFromAdmin(admin),
      }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(true);
    expect(admin.calls.filter((call) => call.method === "config.patch")).toHaveLength(2);
    expect(admin.calls.filter((call) => call.method === "config.get").length).toBeGreaterThan(2);
  });

  it("returns a typed config conflict after stale base-hash retries are exhausted", async () => {
    const stale = () =>
      err(new DomainError({ code: "gateway.staleBaseHash", message: "baseHash is stale" }));
    const admin = modelToggleAdmin({
      config: bundleConfig(),
      models: bundleModelsPayload,
      patchResults: [stale(), stale(), stale()],
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected config conflict");
    expect(result.error.code).toBe("provisioning.connections.configConflict");
    expect(admin.calls.filter((call) => call.method === "config.patch")).toHaveLength(3);
  });

  it("refuses to enable a model absent from the fresh provider catalog", async () => {
    const admin = modelToggleAdmin({ config: bundleConfig(), models: bundleModelsPayload });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "not-real",
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected catalog refusal");
    expect(result.error.code).toBe("provisioning.connections.modelNotInCatalog");
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("refuses a provider without an owned auth profile", async () => {
    const admin = modelToggleAdmin({
      config: bundleConfig({ connected: false }),
      models: bundleModelsPayload,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.error.code).toBe("provisioning.connections.providerNotConnected");
  });

  it("allows a toggle for a provider connected only through the runtime agent store", async () => {
    // OAuth-style connections keep config.auth.profiles EMPTY; the runtime agent store is the
    // truth (`models status` profiles). The guard must mirror the snapshot's notion of connected
    // or every switch the UI renders for such a provider bounces with providerNotConnected.
    const admin = modelToggleAdmin({
      config: bundleConfig({ connected: false }),
      models: bundleModelsPayload,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({
        pluginDiscoveryResult: ok(bundleDiscovery),
        statusResult: toggleStatusFromAdmin(admin),
      }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    // The RETURNED row must also read the runtime store: projected from config alone it would
    // report not_connected the moment the toggle succeeded.
    expect(result.value.status).toBe("connected");
    const raw = admin.calls.find((call) => call.method === "config.patch")?.params["raw"];
    expect(JSON.parse(String(raw))).toEqual({
      agents: { defaults: { models: { "opencode-go/visible": {} } } },
    });
  });

  it("treats disabling an absent-but-protected model as an idempotent no-op", async () => {
    // The no-op check runs BEFORE the disable guardrails: a model that is already absent from the
    // enabled set must disable successfully without mutation even while a primary/fallback still
    // references it — the guardrails protect a real removal, not a request that changes nothing.
    const admin = modelToggleAdmin({
      config: bundleConfig({ enabled: ["base"], defaultsModel: "opencode-go/kimi-k2.6" }),
      models: bundleModelsPayload,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "kimi-k2.6",
      enabled: false,
    });

    expect(result.ok).toBe(true);
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("fails typed when the allowed set never reflects an enabled model", async () => {
    // The defaults key landing in config is NOT routability: when the gateway's own
    // `models status` allowed set keeps disagreeing past the transient budget, the op must
    // report failure rather than declare an enabled-but-unroutable model connected.
    vi.useFakeTimers();
    try {
      const admin = modelToggleAdmin({ config: bundleConfig(), models: bundleModelsPayload });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime: new RecordingGatewayRuntime({
          pluginDiscoveryResult: ok(bundleDiscovery),
          // Static allowed list that never gains the ref — e.g. the reload dropped the model.
          statusResult: ok({ allowed: ["opencode-go/base"], auth: { providers: [] } }),
        }),
      });

      const pending = port.setModelProviderModelEnabled({
        ...principal(),
        providerId: "opencode-go",
        modelId: "visible",
        enabled: true,
      });
      await vi.advanceTimersByTimeAsync(151_000);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected allowed-set failure");
      expect(result.error.code).toBe("provisioning.connections.modelTogglePostCheckFailed");
      expect(result.error.details).toMatchObject({ allowedOk: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a config patch that committed before the reload closed the response socket", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const admin = modelToggleAdmin({
      config: bundleConfig(),
      models: bundleModelsPayload,
      patchResults: [
        err(
          new DomainError({
            code: "gateway.closedBeforeResponse",
            message: "config.patch closed before a response",
          }),
        ),
      ],
      applyFailedPatch: true,
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({
        pluginDiscoveryResult: ok(bundleDiscovery),
        statusResult: toggleStatusFromAdmin(admin),
      }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(true);
    expect(admin.calls.some((call) => call.method === "health")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "connections.modelToggle.configPatch.ambiguous",
      expect.objectContaining({ providerId: "opencode-go", modelId: "visible" }),
    );
  });

  it("fails typed when an ambiguous config patch never appears in refreshed config", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const admin = modelToggleAdmin({
        config: bundleConfig(),
        models: bundleModelsPayload,
        patchResults: [
          err(
            new DomainError({
              code: "gateway.closedBeforeResponse",
              message: "config.patch closed before a response",
            }),
          ),
        ],
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
      });

      const pending = port.setModelProviderModelEnabled({
        ...principal(),
        providerId: "opencode-go",
        modelId: "visible",
        enabled: true,
      });
      await vi.advanceTimersByTimeAsync(151_000);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected ambiguous failure");
      expect(result.error.code).toBe("provisioning.connections.modelTogglePostCheckFailed");
      expect(admin.calls.filter((call) => call.method === "config.patch")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not post-check a definitive config patch refusal", async () => {
    const admin = modelToggleAdmin({
      config: bundleConfig(),
      models: bundleModelsPayload,
      patchResults: [
        err(new DomainError({ code: "gateway.permissionDenied", message: "permission denied" })),
      ],
    });
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
    });

    const result = await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "opencode-go",
      modelId: "visible",
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected definitive failure");
    expect(result.error.code).toBe("gateway.permissionDenied");
    expect(admin.calls.some((call) => call.method === "health")).toBe(false);
  });

  it("surfaces a typed post-check error when the gateway does not retain the patch", async () => {
    vi.useFakeTimers();
    try {
      const admin = modelToggleAdmin({
        config: bundleConfig(),
        models: bundleModelsPayload,
        retainPatch: false,
      });
      const port = new GatewayAdminConnectionsProvisioningPort({
        adminClient: admin,
        secretsVault: new MemorySecretsVault(),
        githubRepository: "anthonykewl20/opzava",
        gatewayRuntime: new RecordingGatewayRuntime({ pluginDiscoveryResult: ok(bundleDiscovery) }),
      });

      const pending = port.setModelProviderModelEnabled({
        ...principal(),
        providerId: "opencode-go",
        modelId: "visible",
        enabled: true,
      });
      await vi.advanceTimersByTimeAsync(151_000);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected post-check failure");
      expect(result.error.code).toBe("provisioning.connections.modelTogglePostCheckFailed");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OpenClaw connections health snapshot (issue #177)", () => {
  function healthPort(admin: RecordingAdminClient): GatewayAdminConnectionsProvisioningPort {
    return new GatewayAdminConnectionsProvisioningPort({
      adminClient: admin,
      secretsVault: new MemorySecretsVault(),
      githubRepository: "anthonykewl20/opzava",
      now: () => new Date("2026-07-14T12:00:00.000Z"),
    });
  }

  it("projects observable core and channel health while keeping agent schedule config unknown", async () => {
    const admin = new RecordingAdminClient(
      {
        "config.get": ok({ hash: "health-config", config: {} }),
        health: ok({
          ok: true,
          ts: Date.parse("2026-07-14T11:59:30.000Z"),
          eventLoop: { degraded: false, reasons: [], delayP99Ms: 2 },
          plugins: { loaded: ["telegram"], errors: [] },
          contextEngines: { quarantined: [] },
          channels: {
            telegram: {
              accounts: {
                primary: {
                  accountId: "primary",
                  configured: true,
                  linked: true,
                  probe: { ok: true },
                  lastProbeAt: Date.parse("2026-07-14T11:59:25.000Z"),
                },
              },
            },
          },
          channelOrder: ["telegram"],
          channelLabels: { telegram: "Telegram" },
          agents: [
            {
              agentId: "main",
              name: "Main agent",
              heartbeat: { enabled: true, every: "30m", everyMs: 1_800_000 },
            },
          ],
        }),
        status: ok({
          runtimeVersion: "2026.7.14",
          sessions: {
            count: 1,
            recent: [
              {
                agentId: "main",
                key: "agent:main:secret-recipient",
                path: "/secret/session.json",
                model: "secret-model",
                updatedAt: Date.parse("2026-07-14T11:59:00.000Z"),
                age: 60_000,
                arbitrarySecret: "must-not-cross",
              },
            ],
          },
        }),
        "models.list": ok({ providers: [], models: [] }),
        "models.authStatus": ok({ providers: [] }),
      },
      undefined,
      {
        serverVersion: "hello-version",
        uptimeMs: 45_000,
        updateAvailable: {
          currentVersion: "2026.7.14",
          latestVersion: "2026.7.15",
          channel: "stable",
        },
      },
    );

    const result = await healthPort(admin).getConnectionsSnapshot(principal());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.openclawHealth.components).toEqual([
      expect.objectContaining({ id: "gateway", kind: "gateway", status: "healthy" }),
      expect.objectContaining({ id: "event-loop", kind: "event-loop", status: "healthy" }),
      expect.objectContaining({ id: "plugins", kind: "plugins", status: "healthy" }),
      expect.objectContaining({
        id: "context-engines",
        kind: "context-engines",
        status: "healthy",
      }),
      expect.objectContaining({
        id: "channel:telegram:primary",
        kind: "channel",
        status: "healthy",
        lastCheckedAt: "2026-07-14T11:59:25.000Z",
      }),
      expect.objectContaining({
        id: "agent:main",
        kind: "agent",
        status: "not_checked",
        lastCheckedAt: null,
      }),
    ]);
    expect(result.value.openclawHealth.runtime.version).toBe("2026.7.14");
    expect(result.value.openclawHealth.runtime.updateAvailable).toEqual({
      currentVersion: "2026.7.14",
      latestVersion: "2026.7.15",
      channel: "stable",
    });
    expect(result.value.openclawHealth.sessions).toEqual({
      count: 1,
      recent: [
        {
          agentId: "main",
          updatedAt: "2026-07-14T11:59:00.000Z",
          ageMs: 60_000,
        },
      ],
    });
    expect(JSON.stringify(result.value.openclawHealth.sessions)).not.toMatch(
      /secret-recipient|session\.json|secret-model|must-not-cross/,
    );
    expect(admin.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "health", params: {} }),
        expect.objectContaining({ method: "status", params: { includeSensitive: true } }),
      ]),
    );
    expect(admin.calls.some((call) => call.method === "update.status")).toBe(false);
  });

  it("uses probe true only for an explicit live refresh", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "health-config", config: {} }),
      health: ok({
        ok: true,
        ts: Date.parse("2026-07-14T11:59:30.000Z"),
        channels: {},
        channelOrder: [],
        channelLabels: {},
        agents: [],
      }),
      status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = healthPort(admin);

    await port.getConnectionsSnapshot(principal());
    await port.refreshConnectionsSnapshot(principal());

    expect(
      admin.calls.filter((call) => call.method === "health").map((call) => call.params),
    ).toEqual([{}, { probe: true }]);
  });

  it("fails an explicit refresh when the live health probe returns no checked result", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "health-config", config: {} }),
      health: err(new DomainError({ code: "health.failed", message: "health failed" })),
      status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = healthPort(admin);

    const cachedRead = await port.getConnectionsSnapshot(principal());
    const liveRefresh = await port.refreshConnectionsSnapshot(principal());

    expect(cachedRead.ok).toBe(true);
    expect(liveRefresh.ok).toBe(false);
    if (liveRefresh.ok) throw new Error("expected live health probe failure");
    expect(liveRefresh.error).toMatchObject({
      code: "provisioning.connections.healthProbeUnavailable",
    });
  });

  it("marks explicit channel failure as attention and keeps pricing degradation warning-only", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "health-config", config: {} }),
      health: ok({
        ok: true,
        ts: Date.parse("2026-07-14T11:59:30.000Z"),
        eventLoop: { degraded: false },
        plugins: { loaded: [], errors: [] },
        contextEngines: { quarantined: [] },
        modelPricing: { state: "degraded", detail: "credential=must-not-cross" },
        channels: {
          telegram: {
            accounts: {
              dead: {
                accountId: "dead",
                configured: true,
                statusState: "disconnected",
                lastProbeAt: Date.parse("2026-07-14T11:59:20.000Z"),
              },
            },
          },
        },
        channelOrder: ["telegram"],
        channelLabels: { telegram: "Telegram" },
        agents: [],
      }),
      status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });

    const result = await healthPort(admin).getConnectionsSnapshot(principal());

    if (!result.ok) throw result.error;
    expect(result.value.openclawHealth.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "channel:telegram:dead", status: "attention" }),
        expect.objectContaining({ id: "plugins", status: "healthy" }),
        expect.objectContaining({ id: "context-engines", status: "healthy" }),
      ]),
    );
    expect(result.value.openclawHealth.warnings).toEqual([
      expect.objectContaining({ id: "model-pricing" }),
    ]);
    expect(JSON.stringify(result.value.openclawHealth)).not.toContain("must-not-cross");
  });

  it.each([
    { name: "absent", fields: {}, expectedStatus: "healthy" },
    {
      name: "valid empty",
      fields: { plugins: { loaded: [], errors: [] }, contextEngines: { quarantined: [] } },
      expectedStatus: "healthy",
    },
    {
      name: "malformed",
      fields: { plugins: { loaded: [] }, contextEngines: [] },
      expectedStatus: "not_checked",
    },
    {
      name: "malformed entries",
      fields: {
        plugins: { loaded: [42], errors: [] },
        contextEngines: { quarantined: [{ arbitrary: true }] },
      },
      expectedStatus: "not_checked",
    },
    {
      name: "valid issues",
      fields: {
        plugins: {
          loaded: [],
          errors: [{ id: "broken", origin: "extension", activated: true, error: "failed" }],
        },
        contextEngines: {
          quarantined: [
            {
              engineId: "memory",
              operation: "start",
              reason: "failed",
              failedAt: Date.parse("2026-07-14T11:59:20.000Z"),
            },
          ],
        },
      },
      expectedStatus: "attention",
    },
  ])(
    "projects $name plugin and context-engine facts as $expectedStatus",
    async ({ fields, expectedStatus }) => {
      const admin = new RecordingAdminClient({
        "config.get": ok({ hash: "health-config", config: {} }),
        health: ok({
          ok: true,
          ts: Date.parse("2026-07-14T11:59:30.000Z"),
          eventLoop: { degraded: false },
          channels: {},
          channelOrder: [],
          channelLabels: {},
          agents: [],
          ...fields,
        }),
        status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
        "models.list": ok({ providers: [], models: [] }),
        "models.authStatus": ok({ providers: [] }),
      });

      const result = await healthPort(admin).getConnectionsSnapshot(principal());

      if (!result.ok) throw result.error;
      expect(result.value.openclawHealth.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "plugins", status: expectedStatus }),
          expect.objectContaining({ id: "context-engines", status: expectedStatus }),
        ]),
      );
    },
  );

  it("classifies only allowlisted channel status states and leaves unknown states unchecked", async () => {
    const admin = new RecordingAdminClient({
      "config.get": ok({ hash: "health-config", config: {} }),
      health: ok({
        ok: true,
        ts: Date.parse("2026-07-14T11:59:30.000Z"),
        eventLoop: { degraded: false },
        channels: {
          telegram: {
            accounts: {
              linked: { accountId: "linked", configured: true, statusState: "linked" },
              configured: {
                accountId: "configured",
                configured: true,
                healthState: "configured",
              },
              future: { accountId: "future", configured: true, statusState: "future-state" },
            },
          },
        },
        channelOrder: ["telegram"],
        channelLabels: { telegram: "Telegram" },
        agents: [],
      }),
      status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });

    const result = await healthPort(admin).getConnectionsSnapshot(principal());

    if (!result.ok) throw result.error;
    expect(result.value.openclawHealth.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "channel:telegram:linked", status: "healthy" }),
        expect.objectContaining({ id: "channel:telegram:configured", status: "healthy" }),
        expect.objectContaining({ id: "channel:telegram:future", status: "not_checked" }),
      ]),
    );
  });

  it.each([
    {
      name: "health fails",
      health: err(new DomainError({ code: "health.failed", message: "health failed" })),
      status: ok({ runtimeVersion: "2026.7.14", sessions: { count: 0, recent: [] } }),
      expectedVersion: "2026.7.14",
      expectedCount: 0,
    },
    {
      name: "status fails",
      health: ok({
        ok: true,
        ts: Date.parse("2026-07-14T11:59:30.000Z"),
        eventLoop: { degraded: false },
        plugins: { loaded: [], errors: [] },
        contextEngines: { quarantined: [] },
        channels: {},
        channelOrder: [],
        channelLabels: {},
        agents: [],
        sessions: {
          count: 1,
          recent: [{ key: "secret-key", updatedAt: 1_752_493_140_000, age: 60_000 }],
        },
      }),
      status: err(new DomainError({ code: "status.failed", message: "status failed" })),
      expectedVersion: "hello-fallback",
      expectedCount: 1,
    },
    {
      name: "both fail",
      health: err(new DomainError({ code: "health.failed", message: "health failed" })),
      status: err(new DomainError({ code: "status.failed", message: "status failed" })),
      expectedVersion: "hello-fallback",
      expectedCount: null,
    },
    {
      name: "sessions are malformed",
      health: err(new DomainError({ code: "health.failed", message: "health failed" })),
      status: ok({ runtimeVersion: "runtime-independent", sessions: { count: "invalid" } }),
      expectedVersion: "runtime-independent",
      expectedCount: null,
    },
  ])("degrades honestly when $name", async ({ health, status, expectedVersion, expectedCount }) => {
    const admin = new RecordingAdminClient(
      {
        "config.get": ok({ hash: "health-config", config: {} }),
        health,
        status,
        "models.list": ok({ providers: [], models: [] }),
        "models.authStatus": ok({ providers: [] }),
      },
      undefined,
      { serverVersion: "hello-fallback", uptimeMs: null, updateAvailable: null },
    );

    const result = await healthPort(admin).getConnectionsSnapshot(principal());

    if (!result.ok) throw result.error;
    expect(result.value.openclawHealth.runtime.version).toBe(expectedVersion);
    expect(result.value.openclawHealth.sessions.count).toBe(expectedCount);
    if (!health.ok) {
      expect(result.value.openclawHealth.components).toHaveLength(4);
      expect(
        result.value.openclawHealth.components.every((entry) => entry.status === "not_checked"),
      ).toBe(true);
      expect(result.value.openclawHealth.checkedAt).toBeNull();
    }
    expect(JSON.stringify(result.value.openclawHealth.sessions)).not.toContain("secret-key");
  });

  it("does not cache a partially checked snapshot as last-known fully healthy", async () => {
    let configReads = 0;
    const admin = new RecordingAdminClient({
      "config.get": () => {
        configReads += 1;
        return configReads === 1
          ? ok({ hash: "health-config", config: {} })
          : err(new DomainError({ code: "config.failed", message: "gateway unavailable" }));
      },
      health: ok({
        ok: true,
        ts: Date.parse("2026-07-14T11:59:30.000Z"),
        eventLoop: { degraded: false },
        plugins: { loaded: [], errors: [] },
        contextEngines: { quarantined: [] },
        channels: {},
        channelOrder: [],
        channelLabels: {},
        agents: [{ agentId: "main", name: "Main agent" }],
      }),
      status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = healthPort(admin);

    const healthy = await port.getConnectionsSnapshot(principal());
    const unavailable = await port.getConnectionsSnapshot(principal());

    if (!healthy.ok || !unavailable.ok) throw new Error("expected snapshots");
    expect(healthy.value.openclawHealth.lastKnownHealthy).toBeNull();
    expect(
      healthy.value.openclawHealth.components.find((component) => component.id === "agent:main"),
    ).toMatchObject({ status: "not_checked" });
    expect(unavailable.value.openclawHealth.lastKnownHealthy).toBeNull();
    expect(unavailable.value.openclawHealth.sessions).toEqual({ count: null, recent: [] });
  });

  it("retains an all-checked healthy snapshot through a later config outage", async () => {
    let configReads = 0;
    const admin = new RecordingAdminClient({
      "config.get": () => {
        configReads += 1;
        return configReads === 1
          ? ok({ hash: "health-config", config: {} })
          : err(new DomainError({ code: "config.failed", message: "gateway unavailable" }));
      },
      health: ok({
        ok: true,
        ts: Date.parse("2026-07-14T11:59:30.000Z"),
        eventLoop: { degraded: false },
        plugins: { loaded: [], errors: [] },
        contextEngines: { quarantined: [] },
        channels: {},
        channelOrder: [],
        channelLabels: {},
        agents: [],
      }),
      status: ok({ runtimeVersion: null, sessions: { count: 0, recent: [] } }),
      "models.list": ok({ providers: [], models: [] }),
      "models.authStatus": ok({ providers: [] }),
    });
    const port = healthPort(admin);

    const healthy = await port.getConnectionsSnapshot(principal());
    const unavailable = await port.getConnectionsSnapshot(principal());

    if (!healthy.ok || !unavailable.ok) throw new Error("expected snapshots");
    expect(healthy.value.openclawHealth.lastKnownHealthy).toEqual({
      checkedAt: "2026-07-14T11:59:30.000Z",
      healthy: 4,
      total: 4,
    });
    expect(unavailable.value.openclawHealth.lastKnownHealthy).toEqual(
      healthy.value.openclawHealth.lastKnownHealthy,
    );
  });

  it("sanitizes hello metadata before exposing it to snapshot projection", async () => {
    const frames: unknown[] = [];
    const client = new OpenClawAdminRpcClient({
      url: "ws://127.0.0.1:18789",
      gatewayToken: "gateway-token",
      keypair: fakeKeypair(),
      socketFactory: () => {
        let onMessage: ((data: string) => void) | null = null;
        return {
          send(data) {
            const frame = JSON.parse(data) as Record<string, unknown>;
            frames.push(frame);
            queueMicrotask(() =>
              onMessage?.(
                JSON.stringify({
                  type: "res",
                  id: frame["id"],
                  ok: true,
                  payload:
                    frame["method"] === "connect"
                      ? {
                          type: "hello-ok",
                          protocol: 4,
                          server: { version: "2026.7.14", connId: "secret-connection-id" },
                          snapshot: {
                            uptimeMs: 12_345,
                            configPath: "/secret/config.json",
                            stateDir: "/secret/state",
                            authMode: "token",
                            presence: [{ arbitrary: "secret-presence" }],
                            health: { arbitrary: "secret-health" },
                            updateAvailable: {
                              currentVersion: "2026.7.14",
                              latestVersion: "2026.7.15",
                              channel: "stable",
                              arbitrary: "secret-update-field",
                            },
                          },
                          auth: { role: "operator", scopes: ["operator.read"] },
                        }
                      : { ok: true },
                }),
              ),
            );
          },
          close() {},
          onMessage(listener) {
            onMessage = listener;
            queueMicrotask(() =>
              listener(
                JSON.stringify({
                  type: "event",
                  event: "connect.challenge",
                  payload: { nonce: "nonce-1", ts: 1 },
                }),
              ),
            );
          },
          onClose() {},
          onError() {},
        };
      },
    });

    await client.request("health", {});

    expect(client.connectionMetadata()).toEqual({
      serverVersion: "2026.7.14",
      uptimeMs: 12_345,
      updateAvailable: {
        currentVersion: "2026.7.14",
        latestVersion: "2026.7.15",
        channel: "stable",
      },
    });
    expect(JSON.stringify(client.connectionMetadata())).not.toMatch(
      /configPath|stateDir|authMode|presence|health|connId|arbitrary/,
    );
  });

  it("fails a manual refresh when provisioning is unavailable", async () => {
    const port = new UnavailableConnectionsProvisioningPort(
      "OpenClaw admin RPC is not configured.",
      "anthonykewl20/opzava",
    );

    const result = await port.refreshConnectionsSnapshot();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unavailable refresh failure");
    expect(result.error).toMatchObject({ code: "provisioning.connections.notConfigured" });
  });
});
