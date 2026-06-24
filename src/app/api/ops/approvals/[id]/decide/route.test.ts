import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'

const { dbRef, authRef } = vi.hoisted(() => ({
  dbRef: { db: null as any },
  authRef: { user: { id: 1, username: 'admin' } as any },
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: authRef.user })),
}))
vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: vi.fn(() => null),
}))
vi.mock('@/lib/db', () => ({
  getDatabase: () => dbRef.db,
}))

import { POST } from './route'

function requested(id: string, requesterId = 'system'): any {
  return {
    schemaVersion: 1,
    approvalId: id,
    requestedAction: 'wordpress-draft',
    target: { kind: 'external-action', id: `req-${id}` },
    status: 'requested',
    requesterId,
    approverId: null,
    decisionReason: null,
    requestedAt: '2026-07-01T00:00:00.000Z',
    decidedAt: null,
    expiresAt: null,
  }
}

function seed(a: any) {
  const repo = createApprovalRepository(dbRef.db)
  repo.ensureSchema()
  repo.saveApproval(a)
}

function req(id: string, body?: any) {
  return new NextRequest(`http://localhost/api/ops/approvals/${id}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  dbRef.db = new Database(':memory:')
  authRef.user = { id: 1, username: 'admin' }
})

describe('POST /api/ops/approvals/[id]/decide', () => {
  it('approves a requested approval', async () => {
    seed(requested('apr-1'))
    const res = await POST(
      req('apr-1', { decision: 'approved', decisionReason: 'looks good' }),
      ctx('apr-1')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('approved')
    expect(body.approverId).toBe('admin')
    expect(body.decisionReason).toBe('looks good')
    expect(body.decidedAt).toBeTruthy()

    const persisted = createApprovalRepository(dbRef.db).getApprovalById('apr-1')
    expect(persisted?.status).toBe('approved')
  })

  it('rejects a requested approval', async () => {
    seed(requested('apr-2'))
    const res = await POST(req('apr-2', { decision: 'rejected' }), ctx('apr-2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('rejected')
    expect(body.decisionReason).toBe('(no reason given)')
  })

  it('404 for an unknown approval', async () => {
    const res = await POST(
      req('nope', { decision: 'approved' }),
      ctx('nope')
    )
    expect(res.status).toBe(404)
  })

  it('409 when the approval is not in requested state', async () => {
    seed(requested('apr-3'))
    const first = await POST(
      req('apr-3', { decision: 'approved' }),
      ctx('apr-3')
    )
    expect(first.status).toBe(200)

    const second = await POST(
      req('apr-3', { decision: 'rejected' }),
      ctx('apr-3')
    )
    expect(second.status).toBe(409)
  })

  it('400 for an invalid decision value', async () => {
    seed(requested('apr-4'))
    const res = await POST(
      req('apr-4', { decision: 'maybe' }),
      ctx('apr-4')
    )
    expect(res.status).toBe(400)
  })

  it('403 when the approver is the original requester (same username)', async () => {
    authRef.user = { id: 1, username: 'admin' }
    seed(requested('apr-self', 'admin'))
    const res = await POST(
      req('apr-self', { decision: 'approved' }),
      ctx('apr-self')
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/cannot approve own request/i)

    // Approval must remain undecided (no partial state mutation)
    const persisted = createApprovalRepository(dbRef.db).getApprovalById('apr-self')
    expect(persisted?.status).toBe('requested')
    expect(persisted?.approverId).toBeNull()
  })

  it('403 when the approver is the original requester (same agent identity)', async () => {
    authRef.user = { id: -7, username: 'agent:writer', agent_id: 7, agent_name: 'writer' }
    seed(requested('apr-agent', 'agent:writer'))
    const res = await POST(
      req('apr-agent', { decision: 'approved' }),
      ctx('apr-agent')
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/cannot approve own request/i)
  })

  it('still approves when a different user decides the request', async () => {
    authRef.user = { id: 2, username: 'admin-b' }
    seed(requested('apr-other', 'admin'))
    const res = await POST(
      req('apr-other', { decision: 'approved' }),
      ctx('apr-other')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('approved')
    expect(body.approverId).toBe('admin-b')
  })
})
