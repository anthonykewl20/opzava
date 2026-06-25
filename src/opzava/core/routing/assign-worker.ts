import type { AgentCapability, Assignment } from './contracts'

/**
 * Role → affinity keywords. Formalizes the inherited `ROLE_AFFINITY` table (task-dispatch.ts:1643)
 * as data; a declared `AgentCapability.capabilities` match scores higher (the explicit signal).
 */
const ROLE_AFFINITY: Record<string, readonly string[]> = {
  coder: ['code', 'implement', 'build', 'fix', 'bug', 'test', 'refactor', 'feature', 'api', 'endpoint', 'function', 'module', 'deploy'],
  researcher: ['research', 'investigate', 'analyze', 'compare', 'find', 'audit', 'benchmark', 'evaluate', 'competitor', 'market'],
  reviewer: ['review', 'audit', 'check', 'verify', 'validate', 'quality', 'security', 'compliance', 'approve'],
  writer: ['write', 'draft', 'summarize', 'translate', 'document', 'docs', 'readme', 'email', 'report'],
}

const ROLE_KEYWORD_SCORE = 10
const CAPABILITY_SCORE = 15

/** Score an agent's fit for the work text: role-affinity keywords + declared-capability matches. */
export function scoreAgent(agent: AgentCapability, text: string): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of ROLE_AFFINITY[agent.role] ?? []) {
    if (lower.includes(kw)) score += ROLE_KEYWORD_SCORE
  }
  for (const cap of agent.capabilities) {
    if (cap && lower.includes(cap.toLowerCase())) score += CAPABILITY_SCORE
  }
  return score
}

/** Pick the best-fit agent for the work text. Highest score wins; ties → first; null if no agents. */
export function assignWorker(text: string, agents: readonly AgentCapability[]): Assignment | null {
  let best: Assignment | null = null
  for (const agent of agents) {
    const score = scoreAgent(agent, text)
    if (best === null || score > best.score) best = { agent, score }
  }
  return best
}
