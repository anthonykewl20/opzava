import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { createAgentRoleRepository } from '@/opzava/modules/team/agent-role-repository'
import { groupAgentRolesByDepartment, AGENT_STATUSES, type AgentRole } from '@/opzava/modules/team/agent-role'
import { summarizeAgentActivity } from '@/opzava/modules/team/agent-activity'
import { buildDepartmentPipeline } from '@/opzava/modules/team/department-pipeline'
import { getAgentProfile } from '@/opzava/modules/team/agent-profile'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const url = new URL(request.url)
  const department = url.searchParams.get('dept') || undefined
  const statusParam = url.searchParams.get('status')
  const status = AGENT_STATUSES.includes(statusParam as (typeof AGENT_STATUSES)[number])
    ? (statusParam as (typeof AGENT_STATUSES)[number])
    : undefined
  const db = getDatabase()
  const repo = createAgentRoleRepository(db)
  repo.ensureSchema()
  repo.seedDefaults()
  const roles = repo.listAgentRoles({ department, status })
  const activity = summarizeAgentActivity(db, roles)
  const activityById = new Map(activity.map((a) => [a.agentId, a]))
  const agents = roles.map((r: AgentRole) => {
    const profile = getAgentProfile(r.agentId)
    return {
      ...r,
      artifactCount: activityById.get(r.agentId)?.artifactCount ?? 0,
      lastActiveAt: activityById.get(r.agentId)?.lastActiveAt ?? null,
      displayName: profile?.displayName ?? r.name,
      avatarEmoji: profile?.avatarEmoji ?? null,
      charter: profile?.charter ?? null,
      preferredModel: profile?.preferredModel ?? null,
    }
  })
  const byDepartment = groupAgentRolesByDepartment(agents as unknown as AgentRole[])
  const pipelines: Record<string, ReturnType<typeof buildDepartmentPipeline>> = {}
  for (const dept of Object.keys(byDepartment)) {
    pipelines[dept] = buildDepartmentPipeline(roles, dept)
  }
  return NextResponse.json({ agents, byDepartment, pipelines })
}
