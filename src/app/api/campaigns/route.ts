import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { createCampaignRepository, parseCampaign } from '@/opzava/modules/content'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const repo = createCampaignRepository(getDatabase())
  repo.ensureSchema()
  return NextResponse.json({ campaigns: repo.listCampaigns() })
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = mutationLimiter(request)
  if (limited) return limited
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }
  const now = new Date().toISOString()
  try {
    const campaign = parseCampaign({
      schemaVersion: 1,
      campaignId: randomUUID(),
      name: body?.name,
      status: 'draft',
      startAt: body?.startAt,
      steps: body?.steps,
      audience: body?.audience,
      createdAt: now,
      updatedAt: now,
    })
    const repo = createCampaignRepository(getDatabase())
    repo.saveCampaign(campaign)
    return NextResponse.json(campaign, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid campaign' },
      { status: 400 },
    )
  }
}
