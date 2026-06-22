import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { applyOpzavaRunnerRepositorySchema } from '@/opzava/platform/runner/migrations'
import { parseOperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/db', () => ({ getDatabase: () => dbRef.db }))

import { GET } from './route'

function costRec(id: string, occurredAt: string, estimated: number, actual: number | null) {
  return {
    schemaVersion: 1,
    recordId: `r-${id}`,
    kind: 'cost',
    workflowRunId: 'wf-1',
    stepRunId: 'step-1',
    occurredAt,
    event: {
      schemaVersion: 1,
      costEventId: id,
      workflowRunId: 'wf-1',
      stepRunId: 'step-1',
      externalCallId: null,
      providerId: 'live-resend',
      operation: 'resend-email-send',
      units: { requests: 1 },
      estimatedCostCents: estimated,
      actualCostCents: actual,
      currency: 'USD',
      recordedAt: occurredAt,
    },
  }
}

function seed(db: any, id: string, occurredAt: string, estimated: number, actual: number | null) {
  applyOpzavaRunnerRepositorySchema(db)
  const p = parseOperationalEventStorageRecord(costRec(id, occurredAt, estimated, actual))
  db.prepare(
    'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)',
  ).run(p.recordId, p.kind, p.workflowRunId, p.stepRunId, p.occurredAt, JSON.stringify(p))
}

function req(qs?: string) {
  return new NextRequest(`http://localhost/api/ops/costs${qs || ''}`)
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('GET /api/ops/costs', () => {
  it('empty when no cost events', async () => {
    applyOpzavaRunnerRepositorySchema(dbRef.db)
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toEqual([])
    expect(body.summary).toEqual({ count: 0, estimatedCostCents: 0, actualCostCents: 0 })
  })

  it('returns cost events newest-first with a summary', async () => {
    seed(dbRef.db, 'c-old', '2026-07-01T00:00:00.000Z', 10, 12)
    seed(dbRef.db, 'c-new', '2026-07-03T00:00:00.000Z', 20, null)
    const body = await (await GET(req())).json()
    expect(body.events.length).toBe(2)
    expect((body.events[0].event as { costEventId: string }).costEventId).toBe('c-new')
    expect(body.summary).toEqual({ count: 2, estimatedCostCents: 30, actualCostCents: 12 })
  })

  it('respects a limit param', async () => {
    seed(dbRef.db, 'a', '2026-07-01T00:00:00.000Z', 5, 5)
    seed(dbRef.db, 'b', '2026-07-02T00:00:00.000Z', 5, 5)
    seed(dbRef.db, 'c', '2026-07-03T00:00:00.000Z', 5, 5)
    const body = await (await GET(req('?limit=2'))).json()
    expect(body.events.length).toBe(2)
  })

  it('returns a unified summary merging opzava and inherited (Engine A) spend (F2b)', async () => {
    seed(dbRef.db, 'c1', '2026-07-01T00:00:00.000Z', 50, 40)
    dbRef.db.exec('CREATE TABLE token_usage (id INTEGER PRIMARY KEY, model TEXT, cost_usd REAL)')
    dbRef.db.prepare('INSERT INTO token_usage (model, cost_usd) VALUES (?, ?)').run('m', 3.0) // $3 -> 300c
    const body = await (await GET(req())).json()
    expect(body.unified.opzava).toEqual({ count: 1, estimatedCostCents: 50, actualCostCents: 40 })
    expect(body.unified.inherited).toEqual({ count: 1, costCents: 300 })
    expect(body.unified.totalCount).toBe(2)
    expect(body.unified.totalCostCents).toBe(340) // 40 opzava actual + 300 inherited
  })
})
