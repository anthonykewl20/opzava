# 0102: Ops Costs Route

## Problem
Operators need visibility into recent durable-runner cost events to monitor spending. The existing read model provides the data, but there is no admin-only HTTP endpoint to surface it for a Costs panel.

## Approach
This slice adds a single, read-only route: `GET /api/ops/costs`. It is protected by `requireRole('admin')` and delegates to two pure read-model functions: `listRecentCostEvents` and `summarizeCostEvents`. The route accepts an optional `?limit` query parameter, which is clamped by the read model to a safe maximum. It returns a JSON object containing the event list and a summary. No mutations occur.

## Contract
- **Endpoint:** `GET /api/ops/costs`
- **Auth:** Admin role required.
- **Query:** `?limit` (optional, numeric).
- **Response:** `{ events: CostEvent[], summary: { count, estimatedCostCents, actualCostCents } }`
- **Events Order:** Newest-first.

## Validation
Three tests using a real in-memory `better-sqlite3` database via `getDatabase()`:
1. **Empty State:** Returns an empty `events` array and a zeroed summary (`count: 0`, costs `0`).
2. **Seeded Data:** With cost events inserted, returns them newest-first. The summary correctly aggregates `count`, `estimatedCostCents`, and `actualCostCents`.
3. **Limit Parameter:** A `?limit=2` query returns only the two most recent events, and the summary reflects only those two.

## Security & Audit
The route is admin-gated and read-only. No secret values, private credentials, tokens leave through this endpoint — cost events carry provider id, operation, unit counts, and cents only.

## Next Case Study Thread
The operator **Costs panel (Opus UI)** displaying the summary total and a per-event breakdown (provider/operation/cents/time). Following that, an **Approval Queue** panel for pending actions.
