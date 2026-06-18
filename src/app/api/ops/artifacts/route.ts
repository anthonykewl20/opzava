import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { createArtifactRepository } from '@/opzava/modules/content/artifacts/artifact-repository'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const url = new URL(request.url)
  const type = url.searchParams.get('type') || undefined
  const run = url.searchParams.get('run') || undefined
  const repo = createArtifactRepository(getDatabase())
  repo.ensureSchema()
  const artifacts = repo.listArtifacts({ artifactType: type, workflowRunId: run })
  const items = artifacts.map((a) => ({
    artifactId: a.artifactId,
    artifactType: a.artifactType,
    sourceStepRunId: a.sourceStepRunId,
    validationStatus: a.validation.status,
    inputArtifactIds: a.lineage.inputArtifactIds,
  }))
  return NextResponse.json({ artifacts: items })
}
