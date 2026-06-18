# 0108: Ops Runs Route

## Problem

Operators need a quick, aggregated view of recent workflow runs to monitor system health and activity. Without this, diagnosing issues requires direct database queries or parsing raw event logs, which is slow and error-prone.

## Approach

A single, admin-only, read-only API endpoint (`GET /api/ops/runs`) was added. It delegates to the `listRecentWorkflowRuns` aggregate read model, which queries the operational events table, groups by `workflow_run_id`, and returns a summary row per run. An optional `?limit` query parameter is supported and clamped by the read model to prevent excessive data retrieval.

## Contract

**Endpoint:** `GET /api/ops/runs`
**Auth:** `requireRole('admin')`
**Query Params:** `limit` (optional, positive integer)
**Response:** `{ runs: RunSummary[] }`
**RunSummary:** `{ workflow_run_id: string, kind: string, event_count: number, last_activity_at: string }`
**Order:** Newest runs first (`last_activity_at` descending).

## Validation

Three tests were implemented using a real, in-memory `better-sqlite3` database behind `getDatabase()`.

1.  **Empty State:** Returns an empty `runs` array when no operational events exist.
2.  **Aggregation:** Given events for multiple runs, returns one summary row per `workflow_run_id` with the correct `event_count` and sorted newest-first.
3.  **Limit Parameter:** The `?limit=1` query parameter correctly restricts the result set to a single run.

## Security & Audit

The endpoint is gated by the `requireRole('admin')` middleware. It is strictly read-only. **No secret values, private credentials, tokens** leave through this endpoint. The runs summary aggregates only `kind`, `workflow_run_id`, and timestamps; no event payload is read.

## Next Case Study Thread

The next slice will build the operator **Content Runs** panel in the Opus UI. This will list each run from the `/api/ops/runs` endpoint, displaying its per-kind event counts and last activity timestamp. Following that, a guarded "approval decide" endpoint and corresponding UI action will be implemented to allow operators to manually intervene in workflow runs.
