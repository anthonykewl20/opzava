import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { applyOpzavaRunnerRepositorySchema } from '@/opzava/platform/runner/migrations'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET } from './route'

function ev(
  recordId: string,
  kind: string,
  runId: string,
  occurredAt: string,
  recordJson = '{}'
) {
  applyOpzavaRunnerRepositorySchema(dbRef.db)
  dbRef.db
    .prepare(
      'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)'
    )
    .run(recordId, kind, runId, 'step-1', occurredAt, recordJson)
}

function req(id: string) {
  return new NextRequest(`http://localhost/api/ops/runs/${id}`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/runs/:id', () => {
  it('returns 404 when the run has no events', async () => {
    applyOpzavaRunnerRepositorySchema(dbRef.db)
    const res = await GET(req('wf-missing'), { params: Promise.resolve({ id: 'wf-missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns the run summary + its events, newest-first', async () => {
    ev('e1', 'cost', 'wf-x', '2026-07-01T00:00:00.000Z')
    ev('e2', 'audit', 'wf-x', '2026-07-05T00:00:00.000Z')
    ev('e3', 'external-call', 'wf-y', '2026-07-05T00:01:00.000Z')
    const res = await GET(req('wf-x'), { params: Promise.resolve({ id: 'wf-x' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.run.workflowRunId).toBe('wf-x')
    expect(body.run.eventCount).toBe(2)
    expect(body.run.auditCount).toBe(1)
    expect(body.run.costCount).toBe(1)
    // wf-y's event must NOT leak into wf-x's detail
    expect(body.events.length).toBe(2)
    expect(body.events.every((e: any) => e.workflowRunId === 'wf-x')).toBe(true)
    // newest-first
    expect(body.events[0].occurredAt).toBe('2026-07-05T00:00:00.000Z')
  })
})
