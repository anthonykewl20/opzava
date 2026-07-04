import { readFile } from "node:fs/promises";

import type {
  ConnectionsProvisioningPort,
  ConnectionsSnapshot,
  DeviceFlowChallenge,
  DeviceFlowPollState,
  GitHubConnectionState,
  OrchestratorDelegationState,
  ProviderConnectionState,
} from "@opzava/ports";
import { ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import {
  connectModelProviderApiKeyForContext,
  loadConnectionsPageData,
  pollConnectionDeviceFlowForContext,
  startGitHubDeviceFlowForContext,
  startModelProviderDeviceFlowForContext,
  type ConnectionsDependencies,
} from "../lib/connections";
import {
  authBranchForChoice,
  buildOrchestratorConfigPlan,
  connectionHealthSummary,
  deviceFlowPollSchedule,
  deviceFlowReducer,
  groupProviderConnectionsByTier,
  isTerminalDeviceFlowStatus,
  providerConnectionSummary,
  projectModelProviders,
  projectProviderConnections,
} from "../lib/connections-state";
import type { AppSessionContext } from "../lib/session";

function context(overrides: Partial<AppSessionContext> = {}): AppSessionContext {
  return {
    sessionId: "session-1",
    user: { id: "user-1", email: "anthony@example.test", name: "Anthony" },
    orgId: "org-1",
    organizationName: "Opzava",
    organizationLifecycleState: "active",
    workspaceId: "workspace-1",
    workspaceName: "Admin",
    roleKeys: ["admin"],
    ...overrides,
  };
}

function providerState(overrides: Partial<ProviderConnectionState> = {}): ProviderConnectionState {
  return {
    providerId: "openai",
    status: "connected",
    authChoiceId: "openai-device-code",
    accountLabel: "GPT Pro",
    scopes: ["chatgpt"],
    model: "openai/gpt-5.5",
    usageLabel: "within limits",
    lastCheckedAt: "2026-07-03T00:00:00.000Z",
    message: null,
    connectedAuthMode: "oauth",
    ...overrides,
  };
}

function githubState(overrides: Partial<GitHubConnectionState> = {}): GitHubConnectionState {
  return {
    status: "not_connected",
    accountLabel: null,
    scopes: [],
    repository: "anthonykewl20/opzava",
    lastCheckedAt: null,
    message: null,
    ...overrides,
  };
}

function challenge(overrides: Partial<DeviceFlowChallenge> = {}): DeviceFlowChallenge {
  return {
    flowId: "flow-1",
    kind: "model_provider",
    providerId: "openai",
    authChoiceId: "openai-device-code",
    verificationUri: "https://example.test/device",
    userCode: "ABCD-EFGH",
    expiresAt: "2026-07-03T00:10:00.000Z",
    intervalSeconds: 2,
    ...overrides,
  };
}

function catalogEntry(
  overrides: Pick<ConnectionsSnapshot["providerCatalog"][number], "id" | "label"> &
    Partial<ConnectionsSnapshot["providerCatalog"][number]>,
): ConnectionsSnapshot["providerCatalog"][number] {
  return {
    vendor: overrides.label,
    authChoices: [
      {
        id: `${overrides.id}-api-key`,
        label: "API key",
        mode: "api-key",
        providerId: overrides.id,
        keyFlag: `${overrides.id}-api-key`,
      },
    ],
    suggestedModel: `${overrides.id}/default`,
    models: [{ id: `${overrides.id}-model`, label: `${overrides.label} model` }],
    roleStrength: "Gateway-advertised provider",
    whenToUse: "Use when this connected model is appropriate.",
    ...overrides,
  };
}

function snapshot(overrides: Partial<ConnectionsSnapshot> = {}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "fra1",
      authLabel: "JIT operator.admin",
      lastHeartbeatAt: "2026-07-03T00:00:00.000Z",
      message: null,
    },
    providerCatalog: [
      {
        id: "openai",
        label: "OpenAI / Codex",
        vendor: "OpenAI",
        authChoices: [
          {
            id: "openai-device-code",
            label: "Device flow",
            mode: "device-flow",
            providerId: "openai",
          },
        ],
        suggestedModel: "openai/gpt-5.5",
        models: [
          { id: "gpt-5.5", label: "GPT 5.5" },
          { id: "gpt-5-codex", label: "GPT 5 Codex" },
        ],
        roleStrength: "orchestration",
        whenToUse: "front-door chat",
      },
      {
        id: "codex",
        label: "Codex CLI",
        vendor: "OpenAI",
        authChoices: [
          {
            id: "codex-device-code",
            label: "Device flow",
            mode: "device-flow",
            providerId: "codex",
          },
        ],
        suggestedModel: "openai/gpt-5-codex",
        models: [{ id: "gpt-5-codex", label: "GPT 5 Codex" }],
        roleStrength: "orchestration runtime",
        whenToUse: "local Codex runtime",
      },
      {
        id: "zai",
        label: "z.ai / GLM",
        vendor: "z.ai",
        authChoices: [
          {
            id: "zai-api-key",
            label: "API key",
            mode: "api-key",
            providerId: "zai",
            keyFlag: "zai-api-key",
          },
        ],
        suggestedModel: "zai/glm-5.2",
        models: [
          { id: "glm-4.7", label: "GLM 4.7" },
          { id: "glm-5.2", label: "GLM 5.2" },
        ],
        roleStrength: "coding plan context",
        whenToUse: "large implementation work",
      },
      {
        id: "opencode-go",
        label: "OpenCode Go",
        vendor: "OpenCode",
        authChoices: [
          {
            id: "opencode-go",
            label: "API key",
            mode: "api-key",
            providerId: "opencode-go",
            keyFlag: "opencode-go-api-key",
          },
        ],
        suggestedModel: "opencode-go/kimi-k2.6",
        models: [{ id: "kimi-k2.6", label: "Kimi K2.6" }],
        roleStrength: "code editing",
        whenToUse: "Go-hosted coding tasks",
      },
      {
        id: "moonshot",
        label: "Kimi / Moonshot",
        vendor: "Moonshot",
        authChoices: [
          {
            id: "moonshot-api-key",
            label: "API key",
            mode: "api-key",
            providerId: "moonshot",
            keyFlag: "moonshot-api-key",
          },
        ],
        suggestedModel: "moonshot/kimi-k2.6",
        models: [{ id: "kimi-k2.6", label: "Kimi K2.6" }],
        roleStrength: "research",
        whenToUse: "long-context analysis",
      },
      {
        id: "qwen",
        label: "Alibaba / Qwen",
        vendor: "Alibaba",
        authChoices: [
          { id: "qwen-oauth", label: "Device flow", mode: "device-flow", providerId: "qwen" },
          {
            id: "qwen-api-key",
            label: "API key",
            mode: "api-key",
            providerId: "qwen",
            keyFlag: "qwen-api-key",
          },
        ],
        suggestedModel: "qwen/qwen3.5-plus",
        models: [{ id: "qwen3.5-plus", label: "Qwen 3.5 Plus" }],
        roleStrength: "multilingual",
        whenToUse: "Qwen-specific coding or translation",
      },
      {
        id: "openrouter",
        label: "OpenRouter",
        vendor: "OpenRouter",
        authChoices: [
          {
            id: "openrouter-oauth",
            label: "Device flow",
            mode: "device-flow",
            providerId: "openrouter",
          },
          {
            id: "openrouter-api-key",
            label: "API key",
            mode: "api-key",
            providerId: "openrouter",
            keyFlag: "openrouter-api-key",
          },
        ],
        suggestedModel: "openrouter/auto",
        models: [],
        roleStrength: "fallback diversity",
        whenToUse: "specialized model access",
      },
      {
        id: "anthropic",
        label: "Anthropic",
        vendor: "Anthropic",
        authChoices: [
          {
            id: "anthropic-api-key",
            label: "API key",
            mode: "api-key",
            providerId: "anthropic",
            keyFlag: "anthropic-api-key",
          },
        ],
        suggestedModel: "anthropic/claude-opus-4-6",
        models: [
          { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
          { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
        ],
        roleStrength: "review",
        whenToUse: "critique and synthesis",
      },
      {
        id: "claude-cli",
        label: "Claude CLI",
        vendor: "Anthropic",
        authChoices: [
          {
            id: "claude-cli-token",
            label: "Setup token",
            mode: "device-flow",
            providerId: "claude-cli",
          },
        ],
        suggestedModel: "anthropic/claude-sonnet-5",
        models: [{ id: "claude-sonnet-5", label: "Claude Sonnet 5" }],
        roleStrength: "review runtime",
        whenToUse: "local Claude CLI runtime",
      },
      {
        id: "deepgram",
        label: "Deepgram",
        vendor: "Deepgram",
        authChoices: [
          {
            id: "deepgram-api-key",
            label: "API key",
            mode: "api-key",
            providerId: "deepgram",
            keyFlag: "deepgram-api-key",
          },
        ],
        suggestedModel: "deepgram/nova-3",
        models: [{ id: "nova-3", label: "Nova 3" }],
        roleStrength: "speech",
        whenToUse: "speech transcription",
      },
    ],
    providerConnections: [
      providerState(),
      providerState({
        providerId: "zai",
        authChoiceId: "zai-api-key",
        accountLabel: "Z.AI plan",
        model: "zai/glm-5.2",
        connectedAuthMode: "api_key",
      }),
    ],
    pendingDeviceFlows: [],
    github: githubState(),
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5.5",
      delegationMode: "prefer",
      allowAgents: ["subagent-zai"],
      subagents: [
        {
          agentId: "subagent-zai",
          providerId: "zai",
          providerLabel: "z.ai / GLM",
          model: "zai/glm-5.2",
          strength: "coding plan context",
          whenToUse: "large implementation work",
        },
      ],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: "receipt-1",
      },
      updatedAt: "2026-07-03T00:00:00.000Z",
    },
    refreshedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function fakePort(): ConnectionsProvisioningPort {
  return {
    getConnectionsSnapshot: async () => ok(snapshot()),
    connectModelProviderApiKey: async (input) =>
      ok(
        providerState({
          providerId: input.providerId,
          authChoiceId: input.authChoiceId,
          accountLabel: "stored in gateway",
          connectedAuthMode: "api_key",
        }),
      ),
    startModelProviderDeviceFlow: async (input) =>
      ok(challenge({ providerId: input.providerId, authChoiceId: input.authChoiceId })),
    pollDeviceFlow: async () =>
      ok({ status: "connected", message: "Connected.", connection: providerState() }),
    disconnectModelProvider: async (input) =>
      ok(providerState({ providerId: input.providerId, status: "not_connected" })),
    applyOrchestratorDelegation: async (input) =>
      ok({
        orchestratorAgentId: "ask-admin-opzava",
        orchestratorModel: "openai/gpt-5.5",
        delegationMode: "prefer",
        allowAgents: input.connectedProviderIds.map((providerId) => `subagent-${providerId}`),
        subagents: [],
        toolPolicyExpansion: {
          allow: ["sessions_spawn", "subagents", "group:sessions"],
          receiptId: "receipt-2",
        },
        updatedAt: "2026-07-03T00:00:00.000Z",
      } satisfies OrchestratorDelegationState),
    startGitHubDeviceFlow: async () =>
      ok(challenge({ kind: "github", providerId: "github", authChoiceId: "github-device-flow" })),
    disconnectGitHub: async () => ok(githubState({ status: "not_connected" })),
  };
}

function dependencies(): ConnectionsDependencies {
  return { provisioningPort: fakePort() };
}

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Connections page state", () => {
  it("projects curated LLM parent providers from the gateway-driven catalog", () => {
    const views = projectModelProviders(snapshot());
    const ids = views.map((view) => view.id);
    const acceptance = {
      hasZai: ids.includes("zai"),
      hasOpenRouter: ids.includes("openrouter"),
      noStandaloneRuntimeRow: !ids.includes("codex") && !ids.includes("claude-cli"),
      noNonLlm: !ids.includes("deepgram"),
    };

    expect(acceptance).toEqual({
      hasZai: true,
      hasOpenRouter: true,
      noStandaloneRuntimeRow: true,
      noNonLlm: true,
    });
    expect(views.find((view) => view.id === "openai")?.runtimeLabels).toContain("Codex CLI");
    expect(views.find((view) => view.id === "anthropic")?.runtimeLabels).toContain("Claude CLI");
    expect(views.find((view) => view.id === "zai")?.models).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "glm-4.7" })]),
    );
    expect(
      authBranchForChoice(views.find((view) => view.id === "openai")!.deviceFlowChoices[0]!),
    ).toBe("device-flow");
    expect(authBranchForChoice(views.find((view) => view.id === "zai")!.apiKeyChoices[0]!)).toBe(
      "api-key",
    );
  });

  it("groups model providers into the Slice 3.7 tiers with other providers folded separately", () => {
    const base = snapshot();
    const views = projectModelProviders(
      snapshot({
        providerCatalog: [
          ...base.providerCatalog,
          catalogEntry({ id: "cloudflare-ai-gateway", label: "Cloudflare AI Gateway" }),
          catalogEntry({ id: "minimax", label: "MiniMax" }),
          catalogEntry({ id: "xiaomi", label: "Xiaomi MiMo" }),
          catalogEntry({ id: "mistral", label: "Mistral" }),
        ],
      }),
    );
    const groups = groupProviderConnectionsByTier(views);
    const byTier = new Map(groups.map((group) => [group.id, group]));

    expect(groups.map((group) => group.label)).toEqual([
      "Frontier",
      "Bundles",
      "Best Subagents",
      "Other providers",
    ]);
    expect(byTier.get("frontier")?.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["openai", "anthropic"]),
    );
    expect(byTier.get("bundles")?.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["opencode-go", "openrouter", "qwen", "cloudflare-ai-gateway"]),
    );
    expect(byTier.get("best-subagents")?.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["zai", "moonshot", "minimax", "xiaomi"]),
    );
    expect(byTier.get("other")).toMatchObject({
      collapsed: true,
      providers: [expect.objectContaining({ id: "mistral" })],
    });
  });

  it("passes through connected auth mode and configured active model for Manage", () => {
    const views = projectModelProviders(
      snapshot({
        providerConnections: [
          providerState({
            providerId: "openai",
            status: "connected",
            connectedAuthMode: "oauth",
            model: "openai/gpt-5.5",
          }),
        ],
      }),
    );

    expect(views.find((view) => view.id === "openai")).toMatchObject({
      connectedAuthMode: "oauth",
      model: "openai/gpt-5.5",
    });
  });

  it("keeps the parent provider's own state authoritative over a connected folded runtime", () => {
    // A connected Codex runtime must NOT mask an OpenAI parent that needs attention (review #3).
    const views = projectModelProviders(
      snapshot({
        providerConnections: [
          providerState({ providerId: "openai", status: "needs_attention", authHealth: "missing" }),
          providerState({ providerId: "codex", status: "connected", authHealth: "ok" }),
        ],
      }),
    );
    const openai = views.find((view) => view.id === "openai");
    expect(openai?.status).toBe("needs_attention");
    expect(openai?.authHealth).toBe("missing");
    expect(openai?.connectionProviderId).toBe("openai");
  });

  it("lets a connected folded runtime back a parent that has no state of its own", () => {
    // Anthropic has no API-key connection, but the Claude CLI runtime is connected → parent shows
    // connected, and disconnect targets the RAW child id that actually holds the credential.
    const views = projectModelProviders(
      snapshot({
        // Realistic worker shape: the parent carries a synthesized not_connected row, and the folded
        // runtime is the one actually connected. The not_connected parent must NOT mask the runtime.
        providerConnections: [
          providerState({ providerId: "anthropic", status: "not_connected", authHealth: null }),
          providerState({ providerId: "claude-cli", status: "connected", authHealth: "static" }),
        ],
      }),
    );
    const anthropic = views.find((view) => view.id === "anthropic");
    expect(anthropic?.status).toBe("connected");
    expect(anthropic?.connectionProviderId).toBe("claude-cli");
    expect(views.some((view) => view.id === "claude-cli")).toBe(false);
  });

  it("summarizes model providers without mixing in GitHub or gateway health", () => {
    const summary = providerConnectionSummary(snapshot());

    expect(summary).toEqual({
      total: 7,
      available: 5,
      connected: 2,
      needsAttention: 0,
      pending: 0,
      notConnected: 5,
    });
  });

  it("counts curated parent providers in overall connection health", () => {
    expect(connectionHealthSummary(snapshot())).toEqual({
      total: 9,
      connected: 3,
      needsAttention: 0,
      pending: 0,
    });
  });

  it("projects auth health, expiry, plan, and usage labels from provider state", () => {
    const providers = projectModelProviders(
      snapshot({
        providerConnections: [
          providerState({
            providerId: "openai",
            status: "connected",
            authHealth: "expiring",
            expiryLabel: "2h",
            planLabel: "Pro",
            usageLabel: "68% window left",
          }),
          providerState({
            providerId: "anthropic",
            status: "needs_attention",
            authHealth: "expired",
            expiryLabel: "expired",
          }),
          providerState({
            providerId: "openrouter",
            status: "needs_attention",
            authHealth: "missing",
          }),
        ],
      }),
    );

    expect(providers.find((provider) => provider.id === "openai")).toMatchObject({
      status: "connected",
      authHealth: "expiring",
      expiryLabel: "2h",
      planLabel: "Pro",
      usageLabel: "68% window left",
    });
    expect(providers.find((provider) => provider.id === "anthropic")).toMatchObject({
      status: "needs_attention",
      authHealth: "expired",
    });
    expect(providers.find((provider) => provider.id === "openrouter")).toMatchObject({
      status: "needs_attention",
      authHealth: "missing",
    });
  });

  it("builds orchestrator delegation config with sessions tool-policy expansion", () => {
    const providers = projectProviderConnections(snapshot());
    const config = buildOrchestratorConfigPlan({ providers });

    expect(config.receipt).toMatchObject({
      delegationMode: "prefer",
      allowAgents: ["subagent-zai"],
      toolPolicyExpansion: ["sessions_spawn", "subagents", "group:sessions"],
    });
    expect(config.agents.list[0]).toMatchObject({
      id: "ask-admin-opzava",
      model: "openai/gpt-5.5",
      subagents: { delegationMode: "prefer", allowAgents: ["subagent-zai"] },
    });
  });

  it("reduces device-flow poll states deterministically", () => {
    const current = { status: "pending", message: "Waiting" } as const;
    const connected: DeviceFlowPollState = {
      status: "connected",
      message: "Connected.",
      connection: providerState(),
    };
    const failed: DeviceFlowPollState = { status: "failed", message: "Denied." };

    expect(deviceFlowReducer(current, connected)).toEqual({
      status: "connected",
      message: "Connected.",
    });
    expect(deviceFlowReducer(current, failed)).toEqual({
      status: "failed",
      message: "Denied.",
    });
  });

  it("stops device-flow polling on terminal states and expiry", () => {
    expect(isTerminalDeviceFlowStatus("expired")).toBe(true);
    expect(isTerminalDeviceFlowStatus("failed")).toBe(true);
    expect(
      deviceFlowPollSchedule({
        status: "pending",
        expiresAt: "2026-07-03T00:00:00.000Z",
        nowMs: new Date("2026-07-03T00:00:01.000Z").getTime(),
        baseIntervalSeconds: 2,
        previousDelayMs: 2_000,
      }),
    ).toEqual({ stop: true, expired: true, nextDelayMs: 0 });
    expect(
      deviceFlowPollSchedule({
        status: "failed",
        expiresAt: "2026-07-03T00:10:00.000Z",
        nowMs: new Date("2026-07-03T00:00:01.000Z").getTime(),
        baseIntervalSeconds: 2,
        previousDelayMs: 2_000,
      }),
    ).toEqual({ stop: true, expired: false, nextDelayMs: 0 });
  });

  it("honors device-flow slow-down hints before bounded backoff", () => {
    expect(
      deviceFlowPollSchedule({
        status: "pending",
        expiresAt: "2026-07-03T00:10:00.000Z",
        nowMs: new Date("2026-07-03T00:00:01.000Z").getTime(),
        baseIntervalSeconds: 2,
        previousDelayMs: 2_000,
        event: { status: "pending", message: "Slow down.", intervalSeconds: 7 },
      }),
    ).toEqual({ stop: false, expired: false, nextDelayMs: 7_000 });
    expect(
      deviceFlowPollSchedule({
        status: "pending",
        expiresAt: "2026-07-03T00:10:00.000Z",
        nowMs: new Date("2026-07-03T00:00:01.000Z").getTime(),
        baseIntervalSeconds: 2,
        previousDelayMs: 2_000,
      }),
    ).toEqual({ stop: false, expired: false, nextDelayMs: 4_000 });
  });

  it("routes web connection actions through a fake provisioning port", async () => {
    const loaded = await loadConnectionsPageData(context(), dependencies());
    const apiKey = await connectModelProviderApiKeyForContext(
      {
        context: context(),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "runtime-secret",
      },
      dependencies(),
    );
    const device = await startModelProviderDeviceFlowForContext(
      { context: context(), providerId: "openai", authChoiceId: "openai-device-code" },
      dependencies(),
    );
    const poll = await pollConnectionDeviceFlowForContext(
      { context: context(), flowId: "flow-1" },
      dependencies(),
    );
    const github = await startGitHubDeviceFlowForContext(context(), dependencies());

    expect(loaded.ok).toBe(true);
    expect(apiKey).toMatchObject({ ok: true, value: { providerId: "zai" } });
    expect(device).toMatchObject({ ok: true, value: { authChoiceId: "openai-device-code" } });
    expect(poll).toMatchObject({ ok: true, value: { status: "connected" } });
    expect(github).toMatchObject({ ok: true, value: { kind: "github" } });
  });

  it("rejects connection mutations for non-admin members before provisioning", async () => {
    let calls = 0;
    const dependenciesWithGuardProbe: ConnectionsDependencies = {
      provisioningPort: {
        ...fakePort(),
        connectModelProviderApiKey: async (input) => {
          calls += 1;
          return ok(providerState({ providerId: input.providerId }));
        },
      },
    };

    const result = await connectModelProviderApiKeyForContext(
      {
        context: context({ roleKeys: ["member"] }),
        providerId: "zai",
        authChoiceId: "zai-api-key",
        apiKey: "runtime-secret",
      },
      dependenciesWithGuardProbe,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected forbidden");
    }
    expect(result.error.code).toBe("web.connectionsForbidden");
    expect(calls).toBe(0);
  });

  it("wires /connections page, actions, API poll route, and sidebar without JSX imports", async () => {
    const page = await readRepoFile("app/(app)/connections/page.tsx");
    const actions = await readRepoFile("app/(app)/connections/actions.ts");
    const healthCheckButton = await readRepoFile("components/connections/health-check-submit.tsx");
    const providersPanel = await readRepoFile("components/connections/model-providers-panel.tsx");
    const route = await readRepoFile("app/api/connections/device-flow/route.ts");
    const nav = await readRepoFile("components/shell/admin-nav.tsx");

    expect(providersPanel).toContain("Model providers");
    expect(providersPanel).toContain("Provider connection status");
    expect(page).toContain("Opzava Gateway");
    expect(page).toContain("Gateway health");
    expect(providersPanel).toContain("Provider catalog unavailable");
    expect(page).not.toContain("OpenClaw gateway");
    expect(page).not.toContain("OpenClaw ·");
    expect(page).not.toContain("Gateway catalog unavailable");
    expect(page).not.toContain('?? "unknown"');
    expect(page).not.toContain("Region: unknown");
    // Full shadcn: the panel is driven by the centralized components/ui primitives, not mockup CSS.
    expect(providersPanel).toContain("@/components/ui/table");
    expect(providersPanel).toContain("@/components/ui/tabs");
    expect(providersPanel).toContain("@/components/ui/card");
    expect(providersPanel).toContain("<TableHead>Models</TableHead>");
    expect(providersPanel).not.toContain("table table-compact table-cards");
    expect(providersPanel).toContain("LLM model providers the gateway can route to");
    expect(providersPanel).not.toContain("connections-provider-list");
    expect(page).toContain("modelProviderCountLabel");
    expect(page).toContain("Counts only model providers from the live gateway catalog");
    expect(page).not.toContain("Connect provider");
    expect(providersPanel).toContain("Dialog");
    expect(providersPanel).toContain("Search providers");
    expect(providersPanel).toContain("Connect provider");
    expect(providersPanel).toContain("connectedWithoutKeyField");
    expect(providersPanel).toContain("Connected via");
    expect(providersPanel).toContain("data-active-model");
    expect(providersPanel).toContain("data-provider-tier");
    expect(providersPanel).toContain("groupProviderConnectionsByTier");
    expect(providersPanel).toContain("DeviceFlowPoller");
    expect(providersPanel).toContain("Disconnect");
    expect(providersPanel).toContain("Admin device required");
    expect(page).toContain("HealthCheckSubmitButton");
    expect(healthCheckButton).toContain("Checking...");
    expect(actions).toContain("operator-admin-required");
    expect(actions).toContain("connectModelProviderApiKeyStateAction");
    expect(actions).toContain("health-check-complete");
    expect(page).toContain("GitHub");
    expect(page).toContain("startGitHubDeviceFlowAction");
    expect(actions).toContain("connectModelProviderApiKeyForContext");
    expect(route).toContain("pollConnectionDeviceFlowForContext");
    expect(nav).toContain('href: "/connections"');
  });

  it("names the production provisioning-worker env boundary", async () => {
    const connections = await readRepoFile("lib/connections.ts");

    expect(connections).toContain("PROVISIONING_WORKER_URL");
    expect(connections).toContain("PROVISIONING_WORKER_TOKEN");
    expect(connections).not.toContain("provisioning worker unavailable");
  });

  it("omits unbacked Connections mockup surfaces behind P8 PRD-013 DESCOPE markers", async () => {
    const page = await readRepoFile("app/(app)/connections/page.tsx");

    expect(page).toContain("DESCOPE(gateway-configuration): P8 PRD-013");
    expect(page).toContain("DESCOPE(provider-policy-catalogs): P8 PRD-013");
    expect(page).toContain("DESCOPE(agent-tools-mcp): P8 PRD-013");
    expect(page).toContain("DESCOPE(channels-services): P8 PRD-013");
    expect(page).not.toContain("Orchestrator and subagents");
    expect(page).not.toContain("Agent tools & MCP");
    expect(page).not.toContain("Channels & services");
  });
});
