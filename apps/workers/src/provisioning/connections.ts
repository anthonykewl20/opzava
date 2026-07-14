import { GITHUB_ISSUES_TOKEN_SECRET_LABEL } from "@opzava/adapters";
import { type ModelProviderAuthChoice, type OrchestratorSubagentRole } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_ID,
  ASK_ADMIN_DELEGATION_TOOL_ALLOW,
  buildAskAdminAgentEntry,
  buildSubagentAgentEntry,
  SUBAGENT_TOOL_POLICY_ALLOW,
  SUBAGENT_TOOL_POLICY_DENY,
} from "./ask-admin-agent.js";

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
  readonly subagentToolPolicy: {
    readonly profile: "minimal";
    readonly allow: typeof SUBAGENT_TOOL_POLICY_ALLOW;
    readonly deny: typeof SUBAGENT_TOOL_POLICY_DENY;
    readonly denyWins: true;
  };
  readonly note: "delegation-engine-deferred-to-p1";
}

export interface OrchestratorAgentConfig {
  readonly agents: {
    readonly list: readonly [
      ReturnType<typeof buildAskAdminAgentEntry>,
      ...ReturnType<typeof buildSubagentAgentEntry>[],
    ];
  };
  readonly receipt: DelegationProvisioningReceipt;
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
    toolPolicyExpansion: ASK_ADMIN_DELEGATION_TOOL_ALLOW,
    subagentToolPolicy: {
      profile: "minimal",
      allow: SUBAGENT_TOOL_POLICY_ALLOW,
      deny: SUBAGENT_TOOL_POLICY_DENY,
      denyWins: true,
    },
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
}): Result<OrchestratorAgentConfig> {
  const subagentIds = new Set<string>();
  for (const subagent of input.subagents) {
    if (subagent.agentId === ASK_ADMIN_AGENT_ID) {
      return err(
        provisioningError(
          "provisioning.connections.reservedSubagentAgentId",
          "A subagent cannot use the canonical Ask Admin agent id.",
        ),
      );
    }

    if (subagentIds.has(subagent.agentId)) {
      return err(
        provisioningError(
          "provisioning.connections.duplicateSubagentAgentId",
          "Each configured subagent must have a unique agent id.",
        ),
      );
    }

    subagentIds.add(subagent.agentId);
  }

  const receipt = buildDelegationProvisioningReceipt({ subagents: input.subagents });
  return ok({
    agents: {
      list: [
        buildAskAdminAgentEntry({
          ...(input.orchestratorModel === undefined ? {} : { model: input.orchestratorModel }),
          delegation: {
            delegationMode: receipt.delegationMode,
            allowAgents: receipt.allowAgents,
          },
        }),
        ...input.subagents.map(buildSubagentAgentEntry),
      ],
    },
    receipt,
  });
}
