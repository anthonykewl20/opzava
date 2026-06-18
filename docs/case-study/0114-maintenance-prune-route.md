# 0114: Maintenance Prune Route

## Problem
Opzava's durable-runner tables accumulate completed job data indefinitely. Without a retention policy, storage grows unbounded and queries slow down. Operators need a safe, admin-only endpoint to prune stale records without risking in-flight work or exposing sensitive payloads.

## Approach
This slice (TDD, Layer 12 GC) adds `POST /api/ops/maintenance/prune` — a mutating admin route that wraps the existing `pruneRunnerData` function. It is role-gated (`requireRole('admin')`) and rate-limited to prevent abuse. The route computes a cutoff date from the request body, delegates deletion to the conservative pruner, and returns a summary report.

## Contract
```
POST /api/ops/maintenance/prune
Auth: admin role required, rate-limited

Body (optional):
{
  "olderThan"?: string,      // ISO 8601 date
  "retentionDays"?: number   // default 90
}

Response 200:
{
  "prunedAt": string,        // ISO timestamp of execution
  "cutoff": string,          // ISO date used for pruning
  "report": { deleted: number }
}
```
**Cutoff resolution:** `body.olderThan` when valid ISO → else `now - retentionDays` (default 90). Malformed or missing body falls back safely.

## Validation
Five tests against a real in-memory `better-sqlite3` database via `getDatabase()`:

1. **Explicit olderThan** — seeds far-past (2000) and far-future (2999) rows; explicit cutoff prunes old rows and echoes the cutoff in response.
2. **Default 90-day window** — no body; far-past rows deleted, far-future rows retained.
3. **retentionDays: 0** — prunes everything before `now`.
4. **Only succeeded jobs pruned** — queued/running rows survive; only terminal-status rows are deleted.
5. **Empty database, missing body** — defaults safely, returns `{ deleted: 0 }` with zeroed report.

## Security & Audit
No secret values, private credentials, tokens pass through this route — it returns only delete counts, the cutoff, and a timestamp. It is admin-gated and rate-limited, and it delegates to the conservative `pruneRunnerData`, so it can never delete in-flight work or read a row's payload. The pruner itself filters by job status, ensuring only completed records are eligible for deletion.

## Next Case Study Thread
**0115: Opus Admin Maintenance Panel** — a UI slice adding a Run-cleanup button and last-report display to the admin dashboard, calling this prune endpoint and persisting the most recent report for visibility. Followed by **0116: Artifact-Detail Operator Views**, revisiting how operators inspect individual job artifacts and outputs.
