# 0110: Approval Decide Route

## Problem

Opzava's ops panels were read-only. Admins could view persisted approvals but had no interactive way to act on them. We needed the first server-side mutation — a route that lets an admin approve or reject a requested approval, enforced by the existing `transitionApprovalStatus` state machine so no inconsistent transition can be hand-built.

## Approach

TDD slice. A single POST endpoint gated behind `requireRole('admin')` and rate-limiting. The route validates the body, loads the approval, constructs an `ApprovalDecision` object from the authenticated admin's identity and the current timestamp, then delegates to `transitionApprovalStatus`. That function owns all transition legality; if the approval is not in `requested` status it throws, and the route surfaces `409`. Happy path: save and return the decided approval.

## Contract

```
POST /api/ops/approvals/[id]/decide
Body: { decision: "approved" | "rejected", decisionReason?: string }
Auth: admin role required, rate-limited

200 — decided approval object (status, approverId, decisionReason, decidedAt)
400 — invalid decision value or other validation error
404 — approval id not found
409 — approval not in requested state (e.g. already decided)
```

When `decisionReason` is omitted the route supplies a default such as `"No reason provided"`.

## Validation

Five integration tests backed by a real in-memory `better-sqlite3` database via `getDatabase`:

1. **Approve a requested approval** — `200`, response status is `approved`, `approverId`, `decisionReason`, and `decidedAt` are persisted.
2. **Reject a requested approval** — `200`, default reason stored when none supplied.
3. **Unknown id** — `404`.
4. **Double-decision** — first decide succeeds, second call returns `409` because the approval is no longer `requested`.
5. **Invalid decision value** — body `{ decision: "maybe" }` returns `400`.

## Security & Audit

No secret values, private credentials, tokens pass through this route — it records the decision (status, approver, reason, time) only. The route is admin-gated, rate-limited, and routes every decision through the approval state machine, so the `requested → approved/rejected` edge is the only way to decide and a double-decision fails closed with `409`.

## Next Case Study Thread

Approve/Reject buttons on requested rows in the Opus Approval Queue panel that call this route, followed by legacy complexity cleanup of the oversized settings/setup files and a daemon entrypoint.
