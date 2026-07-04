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
  deviceFlowPollSchedule,
  deviceFlowReducer,
  isTerminalDeviceFlowStatus,
  providerConnectionSummary,
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
        roleStrength: "orchestration",
        whenToUse: "front-door chat",
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
        roleStrength: "review",
        whenToUse: "critique and synthesis",
      },
    ],
    providerConnections: [
      providerState(),
      providerState({
        providerId: "zai",
        authChoiceId: "zai-api-key",
        accountLabel: "Z.AI plan",
        model: "zai/glm-5.2",
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
  it("projects the gateway-driven catalog without hardcoding page rows", () => {
    const views = projectProviderConnections(snapshot());
    expect(views.map((view) => view.id)).toEqual([
      "openai",
      "zai",
      "opencode-go",
      "moonshot",
      "qwen",
      "openrouter",
      "anthropic",
    ]);
    expect(authBranchForChoice(views[0]?.deviceFlowChoices[0] ?? views[0]!.apiKeyChoices[0]!)).toBe(
      "device-flow",
    );
    expect(authBranchForChoice(views[1]!.apiKeyChoices[0]!)).toBe("api-key");
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
    const route = await readRepoFile("app/api/connections/device-flow/route.ts");
    const nav = await readRepoFile("components/shell/admin-nav.tsx");

    expect(page).toContain("Model providers");
    expect(page).toContain("Provider connection status");
    expect(page).toContain("Opzava Gateway");
    expect(page).toContain("Gateway health");
    expect(page).toContain("Provider catalog unavailable");
    expect(page).not.toContain("OpenClaw gateway");
    expect(page).not.toContain("OpenClaw ·");
    expect(page).not.toContain("Gateway catalog unavailable");
    expect(page).not.toContain('?? "unknown"');
    expect(page).not.toContain("Region: unknown");
    expect(page).toContain("connections-provider-list");
    expect(page).toContain("modelProviderCountLabel");
    expect(page).toContain("Counts only model providers from the live gateway catalog");
    expect(page).toContain("ProviderActions");
    expect(page).toContain("Connect OAuth");
    expect(page).toContain("Connect API key");
    expect(page).toContain("Admin device required");
    expect(page).toContain("HealthCheckSubmitButton");
    expect(healthCheckButton).toContain("Checking...");
    expect(actions).toContain("operator-admin-required");
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
