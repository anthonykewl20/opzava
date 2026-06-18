import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { applyOpzavaRunnerRepositorySchema } from '@/opzava/platform/runner/migrations'

const { dbRef } = vi.hoisted(() => ({ dbRef: { db: null as any } }))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => ({ user: { id: 1, username: 'admin' } })),
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => dbRef.db,
}))

import { POST } from './route'

function ev(id: string, occurredAt: string) {
  applyOpzavaRunnerRepositorySchema(dbRef.db)
  dbRef.db
    .prepare(
      'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)'
    )
    .run(id, 'audit', 'wf-1', 'step-1', occurredAt, '{}')
}

function job(id: string, status: string, updatedAt: string) {
  applyOpzavaRunnerRepositorySchema(dbRef.db)
  dbRef.db
    .prepare(
      'INSERT INTO opzava_runner_jobs (job_id, workflow_run_id, step_run_id, status, priority, idempotency_key, scheduled_at, lease_expires_at, record_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    )
    .run(id, 'wf-1', 'step-1', status, 50, `idem-${id}`, updatedAt, null, '{}', updatedAt, updatedAt)
}

function count(table: string): number {
  return (dbRef.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/ops/maintenance/prune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  dbRef.db = new Database(':memory:')
})

describe('POST /api/ops/maintenance/prune', () => {
  it('prunes rows older than an explicit olderThan cutoff', async () => {
    ev('e-old', '2000-01-01T00:00:00.000Z')
    ev('e-new', '2999-01-01T00:00:00.000Z')
    const res = await POST(req({ olderThan: '2026-01-01T00:00:00.000Z' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.report.operationalEvents).toBe(1)
    expect(body.cutoff).toBe('2026-01-01T00:00:00.000Z')
    expect(count('opzava_runner_operational_events')).toBe(1)
  })

  it('default 90-day window prunes far-past rows and keeps far-future', async () => {
    ev('e-old', '2000-01-01T00:00:00.000Z')
    ev('e-future', '2999-01-01T00:00:00.000Z')
    const body = await (await POST(req({}))).json()
    expect(body.report.operationalEvents).toBe(1)
    expect(count('opzava_runner_operational_events')).toBe(1)
    expect(typeof body.prunedAt).toBe('string')
  })

  it('retentionDays:0 prunes everything strictly before now', async () => {
    ev('e-old', '2000-01-01T00:00:00.000Z')
    const body = await (await POST(req({ retentionDays: 0 }))).json()
    expect(body.report.operationalEvents).toBe(1)
  })

  it('only succeeded jobs are pruned (queued kept)', async () => {
    job('j-succ', 'succeeded', '2000-01-01T00:00:00.000Z')
    job('j-queued', 'queued', '2000-01-01T00:00:00.000Z')
    const body = await (await POST(req({}))).json()
    expect(body.report.succeededJobs).toBe(1)
    expect(count('opzava_runner_jobs')).toBe(1)
  })

  it('handles a missing/empty body (defaults to 90d)', async () => {
    applyOpzavaRunnerRepositorySchema(dbRef.db)
    const res = await POST(req(undefined))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.report).toEqual({ operationalEvents: 0, deadLetters: 0, succeededJobs: 0 })
  })
})
