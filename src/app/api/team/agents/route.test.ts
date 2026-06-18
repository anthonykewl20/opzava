import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { DEFAULT_AGENT_ROLES } from '@/opzava/modules/team/agent-role'
import { createArtifactRepository } from '@/opzava/modules/content/artifacts/artifact-repository'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))
vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET } from './route'

function art(id: string, type: string): any {
  return {
    schemaVersion: 1,
    artifactId: id,
    artifactType: type,
    sourceStepRunId: 'step-1',
    content: { k: id },
    validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
    lineage: { inputArtifactIds: ['idea-1'] },
  }
}

function seedArtifact(id: string, type: string) {
  const repo = createArtifactRepository(dbRef.db)
  repo.ensureSchema()
  repo.saveArtifact(art(id, type), { workflowRunId: 'wf-1', createdAt: '2026-07-01T00:00:00.000Z' })
}

function req(qs?: string) {
  return new NextRequest(`http://localhost/api/team/agents${qs || ''}`)
}

function find(agents: any[], id: string) {
  return agents.find((a) => a.agentId === id)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/team/agents', () => {
  it("merges each agent's persona profile", async () => {
    const res = await GET(req())
    const body = await res.json()
    const cw = find(body.agents, 'copywriter')
    expect(cw).toBeDefined()
    expect(cw.displayName).toBeTruthy()
    expect(cw.avatarEmoji).toBeTruthy()
    expect(cw.charter).toBeTruthy()
    expect(['opus', 'sonnet', 'haiku']).toContain(cw.preferredModel)
  })

  it('still returns artifactCount and attributes seeded artifacts', async () => {
    seedArtifact('a1', 'article-draft')
    const res = await GET(req())
    const body = await res.json()
    const cw = find(body.agents, 'copywriter')
    expect(typeof cw.artifactCount).toBe('number')
    expect(cw.artifactCount).toBe(1)
  })

  it('still returns pipelines and byDepartment', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.pipelines['Content Marketing'].length).toBeGreaterThan(0)
    expect(Object.keys(body.byDepartment)).toContain('General VA')
  })

  it('every agent has a displayName', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.agents.length).toBe(DEFAULT_AGENT_ROLES.length)
    expect(body.agents.every((a: any) => typeof a.displayName === 'string' && a.displayName.length > 0)).toBe(true)
  })
})
