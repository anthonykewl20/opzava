import type { AddressInfo } from "node:net";

import type {
  ConnectionsProvisioningPort,
  ConnectionsSnapshot,
  DeviceFlowChallenge,
  GitHubConnectionState,
  ModelProviderAuthChoice,
  OrchestratorDelegationState,
  OrchestratorSubagentRole,
  ProviderConnectionState,
} from "@opzava/ports";
import { ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import {
  buildGitHubConnectionProvisioningReceipt,
  buildOrchestratorAgentConfig,
  gatewayApiKeyOnboardInvocation,
  redactedGatewayOnboardCommand,
} from "../connections.js";
import { createConnectionsInternalHttpServer } from "../connections-http-server.js";

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
  };
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
    disconnectModelProvider: async () =>
      ok({ ...providerConnection(), status: "not_connected" }),
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
  it("builds a non-interactive OpenClaw onboard invocation without logging the secret", () => {
    const invocation = gatewayApiKeyOnboardInvocation({
      authChoice: apiKeyChoice(),
      apiKey: "runtime-secret",
    });

    expect(invocation.ok).toBe(true);
    if (!invocation.ok) {
      throw invocation.error;
    }

    expect(invocation.value.args).toEqual([
      "openclaw.mjs",
      "onboard",
      "--non-interactive",
      "--auth-choice",
      "zai-api-key",
      "--zai-api-key",
      "runtime-secret",
    ]);
    expect(redactedGatewayOnboardCommand(invocation.value)).toContain("<redacted>");
    expect(redactedGatewayOnboardCommand(invocation.value)).not.toContain("runtime-secret");
  });

  it("rejects device-flow auth choices for API-key onboarding", () => {
    const invocation = gatewayApiKeyOnboardInvocation({
      authChoice: apiKeyChoice({ mode: "device-flow" }),
      apiKey: "runtime-secret",
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
});
