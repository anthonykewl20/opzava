# 0105: Ops Approvals Route

## Problem
Operators need a centralized view of all persisted approvals within the Opzava control plane. Without a dedicated read endpoint, the Approval Queue UI cannot display historical or filtered approval data, forcing manual database queries or ad-hoc scripts.

## Approach
A single, admin-gated, read-only GET route (`/api/ops/approvals`) was added. It wraps the existing `ApprovalRepository` and supports an optional `?status` query parameter to filter by known states (`requested|approved|rejected|expired|cancelled`). An unrecognized status value is ignored, returning all approvals. The route mutates no data.

## Contract
- **Method:** `GET`
- **Path:** `/api/ops/approvals`
- **Auth:** `requireRole('admin')`
- **Query:** `?status` (optional, string)
- **Response:** `{ approvals: Approval[] }` (newest-first)
- **Approval Shape:** `{ id, action, targetRef, status, decidedBy, decidedAt, createdAt }`

## Validation
Four integration tests run against a real, in-memory `better-sqlite3` database via `getDatabase()`:
1. Returns an empty list when no approvals exist.
2. Lists all approvals, ordered by `createdAt` descending.
3. `?status=requested` returns only approvals with that status.
4. An invalid `?status` (e.g., `?status=foo`) is ignored, returning all approvals.

## Security & Audit
No secret values, private credentials, tokens leave through this endpoint. The response payload contains only operational metadata: approval IDs, action names, target references, status, and decision context. The route is admin-gated and strictly read-only; it cannot create, decide, or mutate any approval.

## Next Case Study Thread
**0106: Operator Approval Queue UI.** Build an Opus UI panel that calls `GET /api/ops/approvals?status=requested` to render pending approvals (action, target, requester, timestamp). Implement empty, loading, and error states. A subsequent slice will add a guarded server endpoint for the `decide` action.
