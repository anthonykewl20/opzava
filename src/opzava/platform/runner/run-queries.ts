import Database from 'better-sqlite3'
import { applyOpzavaRunnerRepositorySchema } from './migrations'

export type RecentRunsQuery = Readonly<{ limit?: number }>

export type WorkflowRunSummary = Readonly<{
  workflowRunId: string
  eventCount: number
  lastEventAt: string
  externalCallCount: number
  costCount: number
  auditCount: number
}>

type RawRow = {
  workflowRunId: string
  eventCount: number
  lastEventAt: string
  externalCallCount: number
  costCount: number
  auditCount: number
}

export function listRecentWorkflowRuns(
  db: Database.Database,
  query: RecentRunsQuery = {},
): WorkflowRunSummary[] {
  applyOpzavaRunnerRepositorySchema(db)
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200)
  const rows = db
    .prepare(
      `SELECT workflow_run_id AS workflowRunId,
        COUNT(*) AS eventCount,
        MAX(occurred_at) AS lastEventAt,
        SUM(CASE WHEN kind = 'external-call' THEN 1 ELSE 0 END) AS externalCallCount,
        SUM(CASE WHEN kind = 'cost' THEN 1 ELSE 0 END) AS costCount,
        SUM(CASE WHEN kind = 'audit' THEN 1 ELSE 0 END) AS auditCount
      FROM opzava_runner_operational_events
      GROUP BY workflow_run_id
      ORDER BY lastEventAt DESC, workflow_run_id ASC
      LIMIT ?`,
    )
    .all(limit) as RawRow[]
  return rows.map((r) =>
    Object.freeze({
      workflowRunId: r.workflowRunId,
      eventCount: Number(r.eventCount),
      lastEventAt: r.lastEventAt,
      externalCallCount: Number(r.externalCallCount),
      costCount: Number(r.costCount),
      auditCount: Number(r.auditCount),
    }),
  )
}
