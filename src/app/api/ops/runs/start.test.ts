import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))
vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: () => null }))

import { requireRole } from '@/lib/auth'
import { listRecentWorkflowRuns } from '@/opzava/platform/runner/run-queries'
import { POST } from './route'

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

function req(body: unknown) {
  return new NextRequest('http://localhost/api/ops/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ops/runs (start content run)', () => {
  it('starts a content run, records 8 artifacts, and returns the run id + draft request', async () => {
    const res = await POST(req({
      title: 'Cold Brew Guide',
      topic: 'Cold Brew',
      targetAudience: 'Coffee lovers',
      requestedBy: 'ed@opzava.test',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.workflowRunId).toMatch(/^content-workflow:idea_/)
    expect(body.artifactIds).toHaveLength(8)
    expect(body.wordpressDraftRequest).toBeDefined()
  })

  it('persists operational events so the run is listable via the ops runs query', async () => {
    await POST(req({ title: 'Serious SEO Piece', topic: 'SEO basics' }))
    const runs = listRecentWorkflowRuns(dbRef.db)
    expect(runs.some((r) => r.workflowRunId.startsWith('content-workflow:'))).toBe(true)
  })

  it('rejects an invalid body with 400', async () => {
    const res = await POST(req({ topic: 'x' }))
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(requireRole).mockReturnValueOnce({ error: 'unauthorized', status: 401 } as any)
    const res = await POST(req({ title: 'A real title', topic: 'topic' }))
    expect(res.status).toBe(401)
  })
})
