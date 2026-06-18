import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { createAgentRoleRepository } from '@/opzava/modules/team/agent-role-repository'
import { transitionAgentStatus } from '@/opzava/modules/team/agent-status'

const TARGET_STATUSES = ['active', 'paused'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(request)
  if (limited) return limited

  const { id } = await params

  let body: { status?: string }
  try {
    body = (await request.json()) as { status?: string }
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  if (!TARGET_STATUSES.includes(body.status as (typeof TARGET_STATUSES)[number])) {
    return NextResponse.json(
      { error: "status must be 'active' or 'paused'" },
      { status: 400 }
    )
  }

  const repo = createAgentRoleRepository(getDatabase())
  repo.ensureSchema()
  repo.seedDefaults()

  const existing = repo.getAgentRoleById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  try {
    const updated = transitionAgentStatus(
      existing,
      body.status as (typeof TARGET_STATUSES)[number]
    )
    repo.saveAgentRole(updated)
    return NextResponse.json({ agent: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not update the agent'
    if (/illegal agent status transition/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
