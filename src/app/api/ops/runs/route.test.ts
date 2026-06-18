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
  occurredAt: string
) {
  applyOpzavaRunnerRepositorySchema(dbRef.db)
  dbRef.db
    .prepare(
      'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)'
    )
    .run(recordId, kind, runId, 'step-1', occurredAt, '{}')
}

function req(qs?: string) {
  return new NextRequest(`http://localhost/api/ops/runs${qs || ''}`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/runs', () => {
  it('returns an empty list when there are no events', async () => {
    applyOpzavaRunnerRepositorySchema(dbRef.db)
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runs).toEqual([])
  })

  it('returns one summary row per run, newest-first', async () => {
    ev('e1', 'cost', 'wf-old', '2026-07-01T00:00:00.000Z')
    ev('e2', 'audit', 'wf-new', '2026-07-05T00:00:00.000Z')
    ev('e3', 'external-call', 'wf-new', '2026-07-05T00:01:00.000Z')
    const res = await GET(req())
    const body = await res.json()
    expect(body.runs.length).toBe(2)
    expect(body.runs[0].workflowRunId).toBe('wf-new')
    expect(body.runs[0].eventCount).toBe(2)
  })

  it('respects a limit param', async () => {
    ev('a1', 'cost', 'wf-a', '2026-07-01T00:00:00.000Z')
    ev('a2', 'cost', 'wf-b', '2026-07-02T00:00:00.000Z')
    ev('a3', 'cost', 'wf-c', '2026-07-03T00:00:00.000Z')
    const res = await GET(req('?limit=2'))
    const body = await res.json()
    expect(body.runs.length).toBe(2)
  })
})
