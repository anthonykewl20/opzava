# 0130: Agent Status Route

## Problem
Opzava’s virtual company model needed a safe way for administrators to temporarily disable agents without deleting them. Manual status updates risked invalid state transitions (e.g., jumping from `planned` to `active`), breaking the agent lifecycle.

## Approach
A TDD-driven `PATCH /api/team/agents/[id]` route was added. It enforces admin-only access via `requireRole` and rate-limiting. The route validates the incoming `status` (`active` or `paused`), seeds the default agent roster, and delegates all state changes to `transitionAgentStatus`. This server-side function guarantees only legal transitions occur, returning a `409` for illegal moves.

## Contract
- **Endpoint:** `PATCH /api/team/agents/[id]`
- **Auth:** Admin role required.
- **Body:** `{ "status": "active" | "paused" }`
- **Success:** `200 { "agent": { ... } }`
- **Errors:**
    - `400`: Invalid status value.
    - `404`: Agent not found.
    - `409`: Illegal state transition (e.g., toggling a `planned` agent).

## Validation
Five tests run against a real in-memory `better-sqlite3` database:
1.  **Pause Active:** Successfully pauses the `copywriter` agent.
2.  **Activate Paused:** Re-activates a previously paused agent.
3.  **Not Found:** Returns `404` for an unknown agent ID.
4.  **Illegal Transition:** Returns `409` when attempting to toggle `social-media-manager` (status: `planned`).
5.  **Invalid Input:** Returns `400` for a status value like `"deleted"`.

## Security & Audit
No secret values, private credentials, tokens pass through this route — it changes only an agent's status label, through an admin-gated, rate-limited, server-enforced state machine. Pausing an agent grants no authority and the system still owns every workflow gate.

## Next Case Study Thread
The next slice will implement a **Pause/Activate button** on the dashboard agent cards. This UI will call this `PATCH` route and use an optimistic refresh to update the list instantly. Following that, we'll build **department project views** to group agents and their active workflows.
