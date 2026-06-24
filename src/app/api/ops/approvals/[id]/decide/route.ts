import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { transitionApprovalStatus } from '@/opzava/core/approvals/contracts'
import { withRequestContext } from '@/lib/request-context'

const DECISIONS = ['approved', 'rejected'] as const

/**
 * SEC-2: returns true when the caller's identity matches the approval's requester,
 * i.e. the same agent/user that opened the workflow gate is trying to decide it.
 * Candidates: the caller's username (which is `agent:<name>` for agent-scoped API
 * keys), and — for agent-authenticated callers — the bare agent name (some workflow
 * paths store the requester as the raw agent name rather than the `agent:` form).
 */
function isRequester(
  requesterId: string,
  user: { username?: string | null; agent_id?: number | null; agent_name?: string | null }
): boolean {
  if (!requesterId) return false
  if (user.username && user.username === requesterId) return true
  if (user.agent_id != null) {
    if (user.agent_name && user.agent_name === requesterId) return true
    if (`agent:${user.agent_name ?? ''}` === requesterId) return true
  }
  return false
}

async function handleApproveDecide(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = mutationLimiter(request)
  if (limited) return limited

  const { id } = await params

  let body: { decision?: string; decisionReason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  if (!DECISIONS.includes(body.decision as (typeof DECISIONS)[number])) {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 }
    )
  }

  const repo = createApprovalRepository(getDatabase())
  repo.ensureSchema()

  const existing = repo.getApprovalById(id)
  if (!existing) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })

  // SEC-2: an approver must not be the same identity that requested the gate.
  // Matches on the caller's username (also covers `agent:<name>` for agent-scoped keys)
  // and, when the caller authenticated as an agent, the bare agent name.
  if (isRequester(existing.requesterId, auth.user)) {
    return NextResponse.json(
      { error: 'cannot approve own request' },
      { status: 403 }
    )
  }

  const decision = {
    status: body.decision as (typeof DECISIONS)[number],
    approverId: auth.user.username ?? 'admin',
    decisionReason:
      body.decisionReason && body.decisionReason.trim()
        ? body.decisionReason.trim()
        : '(no reason given)',
    decidedAt: new Date().toISOString(),
  }

  try {
    const decided = transitionApprovalStatus(existing, decision)
    repo.saveApproval(decided)
    return NextResponse.json(decided)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not decide'
    if (/invalid approval transition/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// Correlate the approval-decision log/audit lines to the request via x-request-id.
export const POST = withRequestContext(handleApproveDecide)
