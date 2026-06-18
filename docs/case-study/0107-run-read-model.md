# 0107: Run Read Model

## Problem

Opzava's durable runner records operational events (external-call, cost, audit) in `opzava_runner_operational_events`, keyed by `workflow_run_id`. There is no top-level workflow-run status table. Operators need a "recent runs" summary panel showing one row per run with aggregate event counts and last activity time.

## Approach

New read-only module that aggregates the operational events table via `GROUP BY workflow_run_id`. Pure SQL query — never parses `record_json`. The big repository file is untouched. Returns a flat array of summary rows ordered by most-recent event first, clamped to 1–200.

## Contract

```ts
listRecentWorkflowRuns(
  db: Database,
  opts?: { limit?: number }
): WorkflowRunSummary[]

// WorkflowRunSummary shape:
{
  workflowRunId: string
  eventCount: number
  lastEventAt: string        // ISO timestamp from MAX(occurred_at)
  externalCallCount: number
  costCount: number
  auditCount: number
}
```

Ensures the schema exists on call. `limit` defaults to 50, clamped `[1, 200]`.

## Validation

~5 tests against a real in-memory `better-sqlite3` database:

1. **Empty db** → returns `[]`.
2. **Single run, mixed kinds** → one row with correct `externalCallCount`, `costCount`, `auditCount`, and `lastEventAt`.
3. **Multiple runs** → ordered by most-recent event first.
4. **Limit respected** → requesting `limit: 1` returns only the most recent run.
5. **Kind filtering** → only `external-call`, `cost`, and `audit` kinds are counted; stray kinds are ignored.

Rows are seeded directly via `INSERT` because the query aggregates columns only — no JSON parsing required.

## Security & Audit

No secret values, private credentials, tokens are read by this view — it touches only the `kind`, `workflow_run_id`, and `occurred_at` columns, never `record_json`, so no event payload (and no credential) is exposed by the runs summary.

## Next Case Study Thread

An admin-only `GET /api/ops/runs` route returning the recent run summaries, then an operator Content Runs panel in the Opus UI listing each run with its event counts and last activity timestamp.
