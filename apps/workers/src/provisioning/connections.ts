import { GITHUB_ISSUES_TOKEN_SECRET_LABEL } from "@opzava/adapters";
import { type ModelProviderAuthChoice, type OrchestratorSubagentRole } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { ASK_ADMIN_AGENT_ID, ASK_ADMIN_AGENT_MODEL } from "./ask-admin-agent.js";

export interface GatewayConfigPatchInvocation {
  readonly method: "config.patch";
  readonly params: {
    readonly raw: string;
    readonly baseHash: string;
  };
  readonly secretPath: readonly ["auth", "profiles", string, "key"];
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

export function gatewayApiKeyConfigPatchInvocation(input: {
  readonly authChoice: ModelProviderAuthChoice;
  readonly apiKey: string;
  readonly configBaseHash: string;
}): Result<GatewayConfigPatchInvocation> {
  if (input.authChoice.mode !== "api-key") {
    return err(
      provisioningError(
        "provisioning.connections.invalidAuthMode",
        "Only API-key auth choices can be provisioned through config.patch.",
      ),
    );
  }

  if (input.apiKey.trim() === "") {
    return err(
      provisioningError("provisioning.connections.emptyKey", "Provider API key is required."),
    );
  }

  const profileId = `${input.authChoice.providerId}-${input.authChoice.id}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const patch = {
    auth: {
      profiles: {
        [profileId]: {
          id: profileId,
          providerId: input.authChoice.providerId,
          authChoiceId: input.authChoice.id,
          type: "api-key",
          key: input.apiKey,
        },
      },
      order: {
        [input.authChoice.providerId]: [profileId],
      },
    },
  };

  return ok({
    method: "config.patch",
    params: {
      raw: JSON.stringify(patch),
      baseHash: input.configBaseHash,
    },
    secretPath: ["auth", "profiles", profileId, "key"],
  });
}

export function redactedGatewayConfigPatchInvocation(
  invocation: GatewayConfigPatchInvocation,
): string {
  const patch = JSON.parse(invocation.params.raw) as Record<string, unknown>;
  const profileId = invocation.secretPath[2];
  const authBlock = patch["auth"] as Record<string, unknown>;
  const profiles = authBlock["profiles"] as Record<string, unknown>;
  const profile = profiles[profileId] as Record<string, unknown>;
  profile["key"] = "<redacted>";

  return `${invocation.method} ${JSON.stringify({
    ...invocation.params,
    raw: JSON.stringify(patch),
  })}`;
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
