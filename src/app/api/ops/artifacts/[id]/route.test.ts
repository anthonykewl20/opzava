import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { createArtifactRepository } from '@/opzava/modules/content/artifacts/artifact-repository'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET } from './route'

function artifact(id: string): any {
  return {
    schemaVersion: 1,
    artifactId: id,
    artifactType: 'seo-brief',
    sourceStepRunId: 'step-1',
    content: { title: 'Hello', sections: [1, 2, 3] },
    validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
    lineage: { inputArtifactIds: ['idea-1', 'kw-1'] },
  }
}

function seed(id: string) {
  const repo = createArtifactRepository(dbRef.db)
  repo.ensureSchema()
  repo.saveArtifact(artifact(id), { workflowRunId: 'wf-1', createdAt: '2026-07-01T00:00:00.000Z' })
}

function req(id: string) {
  return new NextRequest(`http://localhost/api/ops/artifacts/${id}`)
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/artifacts/[id]', () => {
  it('returns the full artifact for a seeded id', async () => {
    seed('art-1')
    const res = await GET(req('art-1'), ctx('art-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.artifact.artifactId).toBe('art-1')
    expect(body.artifact.artifactType).toBe('seo-brief')
    expect(body.artifact.content).toEqual({ title: 'Hello', sections: [1, 2, 3] })
    expect(body.artifact.lineage.inputArtifactIds).toEqual(['idea-1', 'kw-1'])
    expect(body.artifact.validation.status).toBe('valid')
  })

  it('404 for an unknown artifact id', async () => {
    const res = await GET(req('nope'), ctx('nope'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('404 when the table is empty', async () => {
    createArtifactRepository(dbRef.db).ensureSchema()
    const res = await GET(req('any'), ctx('any'))
    expect(res.status).toBe(404)
  })
})
