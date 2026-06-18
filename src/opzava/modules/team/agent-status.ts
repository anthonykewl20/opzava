import { parseAgentRole, type AgentRole, type AgentStatus } from './agent-role';

export const AGENT_STATUS_TRANSITIONS: Readonly<Record<AgentStatus, readonly AgentStatus[]>> = {
  active: ['paused'],
  paused: ['active'],
  planned: [],
};

export function canTransitionAgentStatus(from: AgentStatus, to: AgentStatus): boolean {
  return AGENT_STATUS_TRANSITIONS[from].includes(to);
}

export function transitionAgentStatus(role: AgentRole, to: AgentStatus): AgentRole {
  if (!canTransitionAgentStatus(role.status, to)) {
    throw new Error(`illegal agent status transition: ${role.status} -> ${to}`);
  }
  return parseAgentRole({ ...role, status: to });
}
