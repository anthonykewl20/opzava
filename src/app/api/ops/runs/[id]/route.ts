import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { applyOpzavaRunnerRepositorySchema } from '@/opzava/platform/runner/migrations'

// GET /api/ops/runs/:id — a single opzava WorkflowRun (Engine B), reconstructed
// from its operational events. Mirrors the list route's auth (requireRole admin)
// and repository (opzava_runner_operational_events). 404 when the run has no
// recorded events. Sibling to /api/ops/artifacts/:id.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await params
  const db = getDatabase()
  applyOpzavaRunnerRepositorySchema(db)

  const summary = db
    .prepare(
      `SELECT workflow_run_id AS workflowRunId,
        COUNT(*) AS eventCount,
        MAX(occurred_at) AS lastEventAt,
        SUM(CASE WHEN kind = 'external-call' THEN 1 ELSE 0 END) AS externalCallCount,
        SUM(CASE WHEN kind = 'cost' THEN 1 ELSE 0 END) AS costCount,
        SUM(CASE WHEN kind = 'audit' THEN 1 ELSE 0 END) AS auditCount
      FROM opzava_runner_operational_events
      WHERE workflow_run_id = ?`
    )
    .get(id) as
    | {
        workflowRunId: string
        eventCount: number
        lastEventAt: string
        externalCallCount: number
        costCount: number
        auditCount: number
      }
    | undefined

  if (!summary || Number(summary.eventCount) === 0) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const events = (
    db
      .prepare(
        `SELECT record_id AS recordId, kind, workflow_run_id AS workflowRunId,
          step_run_id AS stepRunId, occurred_at AS occurredAt, record_json AS recordJson
        FROM opzava_runner_operational_events
        WHERE workflow_run_id = ?
        ORDER BY occurred_at DESC, record_id ASC`
      )
      .all(id) as Array<{
        recordId: string
        kind: string
        workflowRunId: string
        stepRunId: string | null
        occurredAt: string
        recordJson: string
      }>
  ).map((e) => ({
    ...e,
    recordJson: undefined,
    record: safeParseRecord(e.recordJson),
  }))

  const run = {
    workflowRunId: summary.workflowRunId,
    eventCount: Number(summary.eventCount),
    lastEventAt: summary.lastEventAt,
    externalCallCount: Number(summary.externalCallCount),
    costCount: Number(summary.costCount),
    auditCount: Number(summary.auditCount),
  }

  return NextResponse.json({ run, events })
}

function safeParseRecord(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
