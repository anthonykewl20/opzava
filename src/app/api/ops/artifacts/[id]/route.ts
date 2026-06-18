import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { createArtifactRepository } from '@/opzava/modules/content/artifacts/artifact-repository'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const repo = createArtifactRepository(getDatabase())
  repo.ensureSchema()
  const artifact = repo.getArtifactById(id)
  if (!artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
  return NextResponse.json({ artifact })
}
