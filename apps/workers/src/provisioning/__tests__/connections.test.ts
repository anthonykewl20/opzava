import type { AddressInfo } from "node:net";

import {
  GITHUB_ISSUES_TOKEN_SECRET_LABEL,
  type ConnectionsProvisioningPort,
  type ConnectionsSnapshot,
  type DeviceFlowChallenge,
  type GitHubConnectionState,
  type ModelProviderAuthChoice,
  type OrchestratorDelegationState,
  type OrchestratorSubagentRole,
  type ProviderConnectionState,
  type SecretReference,
} from "@opzava/ports";
import { DomainError, err, ok, type Result, type TenantId } from "@opzava/shared-kernel";
import { describe, expect, it, vi } from "vitest";

import {
  buildGitHubConnectionProvisioningReceipt,
  buildOrchestratorAgentConfig,
  gatewayApiKeyConfigPatchInvocation,
  redactedGatewayConfigPatchInvocation,
} from "../connections.js";
import { createConnectionsInternalHttpServer } from "../connections-http-server.js";
import { GatewayAdminConnectionsProvisioningPort } from "../gateway-admin-connections.js";
import { resolveProvisioningWorkerRuntimeConfig } from "../../main.js";
import {
  OpenClawAdminRpcClient,
  openClawOperatorScopeGranted,
  type OpenClawAdminDeviceKeypair,
  type OpenClawAdminRpcPort,
  type OpenClawAdminWebSocket,
  type OpenClawAdminWebSocketFactory,
  type OpenClawOperatorScope,
} from "../openclaw-admin-client.js";

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
    providerCatalog: [],
    providerConnections: [providerConnection()],
    pendingDeviceFlows: [],
    github: githubConnection(),
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5.5",
      delegationMode: "prefer",
      allowAgents: ["subagent-zai"],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: "receipt-1",
      },
      updatedAt: "2026-07-03T00:00:00.000Z",
    },
    refreshedAt: "2026-07-03T00:00:00.000Z",
  };
}

function fakeProvisioningPort(): ConnectionsProvisioningPort {
  return {
    getConnectionsSnapshot: async () => ok(connectionsSnapshot()),
    connectModelProviderApiKey: async () => ok(providerConnection()),
    startModelProviderDeviceFlow: async () => ok(deviceFlowChallenge()),
    pollDeviceFlow: async () =>
      ok({ status: "connected", message: "Connected.", connection: providerConnection() }),
    disconnectModelProvider: async () => ok({ ...providerConnection(), status: "not_connected" }),
    applyOrchestratorDelegation: async () =>
      ok({
        orchestratorAgentId: "ask-admin-opzava",
        orchestratorModel: "openai/gpt-5.5",
        delegationMode: "prefer",
        allowAgents: ["subagent-zai"],
        subagents: [],
        toolPolicyExpansion: {
          allow: ["sessions_spawn", "subagents", "group:sessions"],
          receiptId: "receipt-2",
        },
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

class RecordingAdminClient implements OpenClawAdminRpcPort {
  public readonly calls: {
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly idempotencyKey?: string;
  }[] = [];

  public constructor(
    private readonly responses: Record<string, Result<unknown>>,
    private readonly scopes: readonly OpenClawOperatorScope[] = ["operator.read", "operator.admin"],
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

    return this.responses[method] ?? ok({});
  }

  public grantedScopes(): readonly OpenClawOperatorScope[] {
    return this.scopes;
  }

  public close(): void {}
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

class RecordingGatewayRuntime {
  public readonly connectCalls: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }[] = [];
  public readonly deviceLoginCalls: string[] = [];
  public readonly deviceLogReads: string[] = [];
  public readonly deviceStops: {
    readonly execId: string;
    readonly logPath: string;
  }[] = [];
  public connectedDeviceProviderId: string | null = null;
  public modelStatusCalls = 0;

  public constructor(
    private readonly options: {
      readonly choices?: readonly {
        readonly id: string;
        readonly label: string;
        readonly mode: "api-key" | "device-flow";
        readonly keyFlag?: string;
      }[];
      readonly status?: unknown | (() => unknown);
      readonly connectResult?: Result<{
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
      }>;
      readonly deviceCodeLog?: string | (() => string);
    } = {},
  ) {}

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
    if (typeof this.options.status === "function") {
      return ok(this.options.status());
    }

    if (this.options.status !== undefined) {
      return ok(this.options.status);
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
    return this.options.connectResult ?? ok({ exitCode: 0, stdout: "{}", stderr: "" });
  }

  public async startDeviceCodeLogin(
    providerId: string,
  ): Promise<Result<{ readonly execId: string; readonly logPath: string }>> {
    this.deviceLoginCalls.push(providerId);
    return ok({ execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" });
  }

  public async readDeviceCodeLog(logPath: string): Promise<Result<string>> {
    this.deviceLogReads.push(logPath);
    const value =
      typeof this.options.deviceCodeLog === "function"
        ? this.options.deviceCodeLog()
        : this.options.deviceCodeLog;
    return ok(
      value ?? "\u001B[32mOpen https://auth.openai.com/codex/device\u001B[0m\nCode: NRK5-7IPKG\n",
    );
  }

  public async stopDeviceCodeLogin(execId: string, logPath: string): Promise<void> {
    this.deviceStops.push({ execId, logPath });
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
    ];
    const config = buildOrchestratorAgentConfig({ subagents });

    expect(config.receipt).toMatchObject({
      delegationMode: "prefer",
      allowAgents: ["subagent-zai"],
      toolPolicyExpansion: ["sessions_spawn", "subagents", "group:sessions"],
      note: "delegation-engine-deferred-to-p1",
    });
    expect(config.agents.list[0]).toMatchObject({
      id: "ask-admin-opzava",
      subagents: { delegationMode: "prefer", allowAgents: ["subagent-zai"] },
      tools: { allow: ["sessions_spawn", "subagents", "group:sessions"] },
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
    const server = createConnectionsInternalHttpServer({
      provisioningPort: fakeProvisioningPort(),
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
            defaults: { model: { primary: "zai/glm-5.2" } },
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
      // configured model (agents.defaults.model.primary zai/glm-5.2), not the raw catalog list
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
      status: "needs_attention",
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
  });

  it("falls back to models status CLI when models.authStatus is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const admin = new RecordingAdminClient({
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

    const result = await port.connectModelProviderApiKey({
      ...principal(),
      providerId: "zai",
      authChoiceId: "zai-api-key",
      apiKey: "secret-provider-key",
    });

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
      providerId: "zai",
      status: "connected",
      authChoiceId: "zai-api-key",
      usageLabel: "1 auth profile",
    });
    expect(JSON.stringify(admin.calls)).not.toContain("secret-provider-key");
    expect(JSON.stringify(result)).not.toContain("secret-provider-key");
  });

  it("never leaks the submitted API key when the gateway onboard command fails", async () => {
    const admin = new RecordingAdminClient({
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

    const result = await port.connectModelProviderApiKey({
      ...principal(),
      providerId: "zai",
      authChoiceId: "zai-api-key",
      apiKey: "sk-live-secret-provider-key",
    });

    expect(result.ok).toBe(false);
    // The raw onboard output (which contains the submitted key) must NOT reach the result/browser.
    expect(JSON.stringify(result)).not.toContain("sk-live-secret-provider-key");
    expect(result.ok ? null : result.error.code).toBe(
      "provisioning.connections.invalidProviderCredential",
    );
    expect(result.ok ? null : result.error.message).not.toContain("sk-live");
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

    const result = await port.connectModelProviderApiKey({
      ...principal(),
      providerId: "zai",
      authChoiceId: "zai-api-key",
      apiKey: "secret-provider-key",
    });

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
    const admin = new RecordingAdminClient({
      "models.authLogout": ok({
        provider: "openai",
        removedProfiles: ["openai:chatgpt"],
        abortedRunIds: [],
      }),
      "config.get": ok({ hash: "config-hash-logout", auth: { profiles: {}, order: {} } }),
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
    expect(admin.calls[0]).toMatchObject({
      method: "models.authLogout",
      params: { provider: "openai" },
    });
    expect(admin.calls.some((call) => call.method === "config.patch")).toBe(false);
  });

  it("clears an api-key config profile even when authLogout succeeds but removed nothing", async () => {
    // The zai regression: authLogout returns ok with removedProfiles:[] (the key lives in
    // config.auth.profiles, not the managed store), so disconnect must ALSO config.patch it away.
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

    const result = await port.disconnectModelProvider({ ...principal(), providerId: "zai" });

    expect(result.ok).toBe(true);
    expect(admin.calls[0]).toMatchObject({
      method: "models.authLogout",
      params: { provider: "zai" },
    });
    const patch = admin.calls.find((call) => call.method === "config.patch");
    expect(patch).toBeDefined();
    expect(rawPatch(patch!.params)).toEqual({
      auth: { profiles: { "zai-zai-api-key": null }, order: { zai: [] } },
    });
  });

  it("falls back to config.patch API-key profile deletion when authLogout is unavailable", async () => {
    const admin = new RecordingAdminClient({
      "models.authLogout": err(
        new DomainError({
          code: "openclaw.methodNotFound",
          message: "models.authLogout is not advertised.",
        }),
      ),
      "config.get": ok({
        hash: "config-hash-2",
        auth: {
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
    expect(admin.calls[0]).toMatchObject({
      method: "models.authLogout",
      params: { provider: "zai" },
    });
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
        list: expect.arrayContaining([
          expect.objectContaining({ id: "other-agent" }),
          expect.objectContaining({
            id: "ask-admin-opzava",
            subagents: {
              delegationMode: "prefer",
              allowAgents: ["subagent-zai"],
            },
            tools: { allow: ["sessions_spawn", "subagents", "group:sessions"] },
          }),
          expect.objectContaining({ id: "subagent-zai", model: "zai/glm-5.2" }),
        ]),
      },
    });
    expect(patchCall?.params).not.toHaveProperty("patch");
    expect(patchCall?.params).not.toHaveProperty("receipt");
    expect(patchCall?.idempotencyKey).toBeUndefined();
  });

  it("starts model-provider device flow by parsing the gateway device-code log", async () => {
    const gatewayRuntime = new RecordingGatewayRuntime({
      choices: [{ id: "openai-device-code", label: "OpenAI OAuth", mode: "device-flow" }],
      deviceCodeLog:
        "\u001B[36mAuthorize at https://auth.openai.com/codex/device\u001B[0m\nCode: NRK5-7IPKG\nrefresh_token=secret-device-token\n",
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

      await vi.runAllTimersAsync();
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
      await vi.runAllTimersAsync();
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
      await vi.runAllTimersAsync();
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
      await vi.runAllTimersAsync();
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
      message: "Gateway device-code authorization failed or was denied.",
    });
    expect(gatewayRuntime.deviceStops).toEqual([
      { execId: "exec-device-1", logPath: "/tmp/opzava-df-test.log" },
    ]);
    expect(JSON.stringify(failed)).not.toContain("secret-terminal-token");
    expect(JSON.stringify(failed)).not.toContain("authorization denied");
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
});
