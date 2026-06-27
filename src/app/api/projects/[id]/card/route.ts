import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { readProjectCard } from '@/opzava/modules/projects'

// GET /api/projects/[id]/card — the Home-lineup / project-header view:
// inherited project identity + Engine-B overlay + live task counts.
// Unknown project → 404; all other sources degrade inside readProjectCard.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const card = readProjectCard(getDatabase(), id)
  if (!card) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  return NextResponse.json({ card })
}
