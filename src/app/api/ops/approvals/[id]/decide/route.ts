import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { transitionApprovalStatus } from '@/opzava/core/approvals/contracts'

const DECISIONS = ['approved', 'rejected'] as const

export async function POST(
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
