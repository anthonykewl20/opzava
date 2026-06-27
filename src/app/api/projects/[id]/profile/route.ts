import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import {
  createProjectProfileRepository,
  defaultTilesForType,
  parseProjectProfile,
  type ProjectProfile,
} from '@/opzava/modules/projects'

// GET /api/projects/[id]/profile — the Engine-B overlay for a project.
// Absence is not an error: a project without a profile yields the synthesized
// 'blank' default so the editor always has a shape (isDefault: true).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const profile = createProjectProfileRepository(
    getDatabase(),
  ).getProfileByProjectId(id)

  if (profile) {
    return NextResponse.json({ profile, isDefault: false })
  }
  return NextResponse.json({
    profile: {
      schemaVersion: 1,
      projectId: id,
      type: 'blank',
      enabledTiles: defaultTilesForType('blank'),
      updatedAt: null,
    },
    isDefault: true,
  })
}

// PUT /api/projects/[id]/profile — upsert the overlay. The path id is
// authoritative; updatedAt is server-stamped. Unknown keys / bad enums →
// 400 via the strict contract. (project.profile_updated SSE = follow-up.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(request)
  if (limited) return limited

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  let profile: ProjectProfile
  try {
    profile = parseProjectProfile({
      ...body,
      projectId: id,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid project profile'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  createProjectProfileRepository(getDatabase()).saveProfile(profile)
  return NextResponse.json({ profile })
}
