import { type OrchestratorSubagentRole } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_ID,
  ASK_ADMIN_DELEGATION_TOOL_ALLOW,
  buildAskAdminAgentEntry,
  buildSubagentAgentEntry,
  SUBAGENT_TOOL_POLICY_ALLOW,
  SUBAGENT_TOOL_POLICY_DENY,
} from "./ask-admin-agent.js";

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

function provisioningError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
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
