import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))
vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET } from './route'

function requested(id: string, requestedAt: string): any {
  return {
    schemaVersion: 1,
    approvalId: id,
    requestedAction: 'wordpress-draft',
    target: { kind: 'external-action', id: `req-${id}` },
    status: 'requested' as const,
    requesterId: 'system',
    approverId: null,
    decisionReason: null,
    requestedAt,
    decidedAt: null,
    expiresAt: null,
  }
}

function approved(id: string, requestedAt: string): any {
  return {
    ...requested(id, requestedAt),
    status: 'approved' as const,
    approverId: 'admin',
    decisionReason: 'ok',
    decidedAt: '2026-07-02T00:00:00.000Z',
  }
}

function seed(a: any) {
  const repo = createApprovalRepository(dbRef.db)
  repo.ensureSchema()
  repo.saveApproval(a)
}

function req(qs?: string) {
  return new NextRequest(`http://localhost/api/ops/approvals${qs || ''}`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/approvals', () => {
  it('returns an empty list when there are no approvals', async () => {
    const repo = createApprovalRepository(dbRef.db)
    repo.ensureSchema()
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect((await res.json()).approvals).toEqual([])
  })

  it('lists all approvals newest-first', async () => {
    seed(requested('a-old', '2026-07-01T00:00:00.000Z'))
    seed(requested('a-new', '2026-07-03T00:00:00.000Z'))
    const body = await (await GET(req())).json()
    expect(body.approvals.length).toBe(2)
    expect(body.approvals[0].approvalId).toBe('a-new')
  })

  it('filters by ?status=requested', async () => {
    seed(requested('a-1', '2026-07-01T00:00:00.000Z'))
    seed(approved('a-2', '2026-07-02T00:00:00.000Z'))
    const body = await (await GET(req('?status=requested'))).json()
    expect(body.approvals.length).toBe(1)
    expect(body.approvals[0].status).toBe('requested')
  })

  it('ignores an invalid ?status and returns all', async () => {
    seed(requested('a-1', '2026-07-01T00:00:00.000Z'))
    seed(approved('a-2', '2026-07-02T00:00:00.000Z'))
    const body = await (await GET(req('?status=bogus'))).json()
    expect(body.approvals.length).toBe(2)
  })
})
