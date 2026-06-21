import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { createCampaignRepository, transitionCampaign, createCampaignSendApproval } from '@/opzava/modules/content'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = mutationLimiter(request)
  if (limited) return limited
  const { id } = await params
  const db = getDatabase()
  const repo = createCampaignRepository(db)
  repo.ensureSchema()
  const existing = repo.getCampaignById(id)
  if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  try {
    const now = new Date().toISOString()
    const approved = transitionCampaign(existing, 'approved', now)
    // Mint a real, persisted approval for the live send (F1): the run path refuses without it.
    const approval = createCampaignSendApproval({ campaignId: id, approverId: auth.user.username, now })
    const approvalRepo = createApprovalRepository(db)
    db.transaction(() => {
      repo.saveCampaign(approved)
      approvalRepo.saveApproval(approval)
    })()
    return NextResponse.json(approved)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cannot approve' },
      { status: 409 },
    )
  }
}
