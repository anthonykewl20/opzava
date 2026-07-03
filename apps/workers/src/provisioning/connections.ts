import {
  GITHUB_ISSUES_TOKEN_SECRET_LABEL,
  type ModelProviderAuthChoice,
  type OrchestratorSubagentRole,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { ASK_ADMIN_AGENT_ID, ASK_ADMIN_AGENT_MODEL } from "./ask-admin-agent.js";

export interface GatewayOnboardInvocation {
  readonly executable: "node";
  readonly args: readonly string[];
  readonly secretArgumentIndex: number;
}

export interface DelegationProvisioningReceipt {
  readonly agentId: typeof ASK_ADMIN_AGENT_ID;
  readonly delegationMode: "prefer";
  readonly allowAgents: readonly string[];
  readonly subagents: readonly OrchestratorSubagentRole[];
  readonly toolPolicyExpansion: readonly ["sessions_spawn", "subagents", "group:sessions"];
  readonly note: "delegation-engine-deferred-to-p1";
}

export interface GitHubConnectionProvisioningReceipt {
  readonly provider: "github";
  readonly repository: string;
  readonly secretLabel: typeof GITHUB_ISSUES_TOKEN_SECRET_LABEL;
  readonly storage: "SecretsVaultPort";
  readonly tokenMaterialIncluded: false;
}

function provisioningError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

export function gatewayApiKeyOnboardInvocation(input: {
  readonly authChoice: ModelProviderAuthChoice;
  readonly apiKey: string;
}): Result<GatewayOnboardInvocation> {
  if (input.authChoice.mode !== "api-key") {
    return err(
      provisioningError(
        "provisioning.connections.invalidAuthMode",
        "Only API-key auth choices can use non-interactive key onboarding.",
      ),
    );
  }

  const keyFlag = input.authChoice.keyFlag ?? input.authChoice.id;
  if (input.apiKey.trim() === "") {
    return err(
      provisioningError("provisioning.connections.emptyKey", "Provider API key is required."),
    );
  }

  return ok({
    executable: "node",
    args: [
      "openclaw.mjs",
      "onboard",
      "--non-interactive",
      "--auth-choice",
      input.authChoice.id,
      `--${keyFlag}`,
      input.apiKey,
    ],
    secretArgumentIndex: 6,
  });
}

export function redactedGatewayOnboardCommand(invocation: GatewayOnboardInvocation): string {
  return [
    invocation.executable,
    ...invocation.args.map((arg, index) =>
      index === invocation.secretArgumentIndex ? "<redacted>" : arg,
    ),
  ].join(" ");
}

export function buildDelegationProvisioningReceipt(input: {
  readonly subagents: readonly OrchestratorSubagentRole[];
}): DelegationProvisioningReceipt {
  return {
    agentId: ASK_ADMIN_AGENT_ID,
    delegationMode: "prefer",
    allowAgents: input.subagents.map((subagent) => subagent.agentId),
    subagents: input.subagents,
    toolPolicyExpansion: ["sessions_spawn", "subagents", "group:sessions"],
    note: "delegation-engine-deferred-to-p1",
  };
}

export function buildGitHubConnectionProvisioningReceipt(input: {
  readonly repository: string;
}): GitHubConnectionProvisioningReceipt {
  return {
    provider: "github",
    repository: input.repository,
    secretLabel: GITHUB_ISSUES_TOKEN_SECRET_LABEL,
    storage: "SecretsVaultPort",
    tokenMaterialIncluded: false,
  };
}

export function buildOrchestratorAgentConfig(input: {
  readonly subagents: readonly OrchestratorSubagentRole[];
  readonly orchestratorModel?: string;
}) {
  const receipt = buildDelegationProvisioningReceipt({ subagents: input.subagents });
  return {
    agents: {
      list: [
        {
          id: ASK_ADMIN_AGENT_ID,
          model: input.orchestratorModel ?? ASK_ADMIN_AGENT_MODEL,
          default: true,
          subagents: {
            delegationMode: receipt.delegationMode,
            allowAgents: receipt.allowAgents,
          },
          tools: {
            allow: receipt.toolPolicyExpansion,
          },
        },
        ...input.subagents.map((subagent) => ({
          id: subagent.agentId,
          model: subagent.model,
        })),
      ],
    },
    receipt,
  };
}
