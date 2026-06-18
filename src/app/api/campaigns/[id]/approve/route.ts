import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { createCampaignRepository, transitionCampaign } from '@/opzava/modules/content'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = mutationLimiter(request)
  if (limited) return limited
  const { id } = await params
  const repo = createCampaignRepository(getDatabase())
  repo.ensureSchema()
  const existing = repo.getCampaignById(id)
  if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  try {
    const approved = transitionCampaign(existing, 'approved', new Date().toISOString())
    repo.saveCampaign(approved)
    return NextResponse.json(approved)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cannot approve' },
      { status: 409 },
    )
  }
}
