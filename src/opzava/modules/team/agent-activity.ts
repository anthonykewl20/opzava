import Database from 'better-sqlite3'
import { createArtifactRepository } from '@/opzava/modules/content'
import { type AgentRole } from './agent-role'

export const STEP_TO_ARTIFACT_TYPE: Readonly<Record<string, string>> = {
  'fact-check': 'fact-check-report',
}

export function stepToArtifactType(stepId: string): string {
  return STEP_TO_ARTIFACT_TYPE[stepId] ?? stepId
}

export type AgentActivity = Readonly<{
  agentId: string
  artifactCount: number
  lastActiveAt: string | null
}>

export function summarizeAgentActivity(
  db: Database.Database,
  roles: readonly AgentRole[],
): AgentActivity[] {
  const repo = createArtifactRepository(db)
  repo.ensureSchema()
  // Column summaries carry createdAt (newest-first) without parsing record_json.
  const summaries = repo.listArtifactSummaries()

  return roles.map((role) => {
    const ownedTypes = new Set(role.ownedStepIds.map(stepToArtifactType))
    const owned = summaries.filter((s) => ownedTypes.has(s.artifactType))
    const lastActiveAt = owned.length > 0
      ? owned.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), owned[0].createdAt)
      : null
    return { agentId: role.agentId, artifactCount: owned.length, lastActiveAt }
  })
}
