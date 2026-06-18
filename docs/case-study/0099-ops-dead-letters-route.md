# 0099: Ops Dead Letters Route

## Problem

Operators need visibility into durable-runner jobs that have permanently failed after exhausting all retries. Without a centralized view, diagnosing systemic workflow failures requires manual database queries or log spelunking, slowing incident response.

## Approach

Add a thin, admin-gated read route `GET /api/ops/dead-letters` that wraps the existing `listRecentDeadLetters` read model. The route is purely read-only — it mutates nothing and delegates all data access to the read model, which owns query logic and ordering. An optional `?limit` query parameter is parsed, coerced to a number, and passed through; the read model itself clamps the value to a safe maximum.

## Contract

**Request**
```
GET /api/ops/dead-letters?limit=25
Authorization: Bearer <admin-token>
```

**Response (200)**
```json
{
  "deadLetters": [
    {
      "id": "dl_abc123",
      "jobId": "job_xyz",
      "workflowRunId": "run_789",
      "finalError": "max retries exceeded: timeout",
      "createdAt": "2025-01-15T08:30:00.000Z"
    }
  ]
}
```

**Errors**: `401` if unauthenticated, `403` if role ≠ `admin`.

## Validation

Three tests backed by a real in-memory `better-sqlite3` database via `getDatabase()`:

1. **Empty state** — no dead letters seeded → `200` with `{ deadLetters: [] }`.
2. **Newest-first ordering** — seed two dead letters with different timestamps → response array is sorted descending by `createdAt`.
3. **Limit parameter** — seed five dead letters, request `?limit=2` → response contains exactly two items.

## Security & Audit

No secret values, private credentials, tokens leave through this endpoint — dead-letter snapshots forbid `SecretReference` payloads at the storage layer and are re-validated by the read model on every read. The route is admin-gated and read-only, so it cannot mutate runner state or expose a credential. Audit logging is inherited from the shared request middleware; every call is attributed to the authenticated admin principal.

## Next Case Study Thread

The operator **Failures / Dead-Letters panel** in Opus UI: a page that calls this route and renders each dead letter's job ID, workflow run, final-error reason, and timestamp, with proper empty, loading, and error states. After that, the **Costs panel** (per-workflow spend breakdown) and the **Approval Queue panel** (pending human-in-the-loop approvals).
