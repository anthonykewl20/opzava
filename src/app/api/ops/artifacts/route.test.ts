import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { createArtifactRepository } from '@/opzava/modules/content/artifacts/artifact-repository'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbRef.db,
}))

import { GET } from './route'

function artifact(id: string, type: string, createdAt: string, run: string): any {
  return {
    artifact: {
      schemaVersion: 1,
      artifactId: id,
      artifactType: type,
      sourceStepRunId: 'step-1',
      content: { k: 'v' },
      validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
      lineage: { inputArtifactIds: ['idea-1'] },
    },
    ctx: { workflowRunId: run, createdAt },
  }
}

function seed(id: string, type: string, createdAt: string, run: string) {
  const repo = createArtifactRepository(dbRef.db)
  repo.ensureSchema()
  const a = artifact(id, type, createdAt, run)
  repo.saveArtifact(a.artifact, a.ctx)
}

function req(qs?: string) {
  return new NextRequest(`http://localhost/api/ops/artifacts${qs || ''}`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/artifacts', () => {
  it('returns an empty list when there are no artifacts', async () => {
    createArtifactRepository(dbRef.db).ensureSchema()
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.artifacts).toEqual([])
  })

  it('returns artifact summaries newest-first without content', async () => {
    seed('a-old', 'seo-brief', '2026-07-01T00:00:00.000Z', 'wf-1')
    seed('a-new', 'article-draft', '2026-07-03T00:00:00.000Z', 'wf-1')
    const res = await GET(req())
    const body = await res.json()
    expect(body.artifacts.length).toBe(2)
    expect(body.artifacts[0].artifactId).toBe('a-new')
    expect(body.artifacts[0]).not.toHaveProperty('content')
    expect(body.artifacts[0].validationStatus).toBe('valid')
    expect(body.artifacts[0].inputArtifactIds).toEqual(['idea-1'])
  })

  it('filters by ?type', async () => {
    seed('a-1', 'seo-brief', '2026-07-01T00:00:00.000Z', 'wf-1')
    seed('a-2', 'article-draft', '2026-07-02T00:00:00.000Z', 'wf-1')
    const res = await GET(req('?type=seo-brief'))
    const body = await res.json()
    expect(body.artifacts.length).toBe(1)
    expect(body.artifacts[0].artifactType).toBe('seo-brief')
  })

  it('filters by ?run', async () => {
    seed('a-1', 'seo-brief', '2026-07-01T00:00:00.000Z', 'wf-1')
    seed('a-2', 'seo-brief', '2026-07-02T00:00:00.000Z', 'wf-2')
    const res = await GET(req('?run=wf-2'))
    const body = await res.json()
    expect(body.artifacts.length).toBe(1)
    expect(body.artifacts[0].artifactId).toBe('a-2')
  })
})
