# 0124: Team Agents Route

## Problem
The Opzava control plane needs a Team Dashboard to visualize its virtual agent roster. Without a dedicated API endpoint, the frontend cannot display agent information grouped by department, nor can it filter by operational status. The system requires an idempotent way to seed a default roster on first run without overwriting operator customizations.

## Approach
Implemented a TDD slice adding an admin-only `GET /api/team/agents` route. The handler validates optional `?dept` and `?status` query parameters, initializes the database schema, and seeds default agents if the table is empty. It returns the full roster grouped by department using `groupAgentRolesByDepartment`.

## Contract
**Endpoint:** `GET /api/team/agents`
**Auth:** `requireRole('admin')`
**Query Params:** `?dept` (string), `?status` (string, validated)
**Response:** `{ agents: AgentRole[], byDepartment: Record<string, AgentRole[]> }`
**Default Departments:** Content Marketing, Email Marketing, Social Media, General VA.

## Validation
Four tests pass against a real in-memory `better-sqlite3` database:
1.  **Full Roster:** Seeds and returns all agents, grouped correctly (e.g., `Email Marketing` contains `email-specialist`).
2.  **Dept Filter:** `?dept=Social Media` returns only agents from that department.
3.  **Status Filter:** `?status=planned` returns the `social-media-manager`.
4.  **Invalid Status:** An invalid `?status` is ignored, returning the full roster.

## Security & Audit
No secret values, private credentials, tokens pass through this route. The agent role object is strictly limited to `id`, `name`, `department`, `status`, `ownedStepIds`, and `responsibilities`. The `seedDefaults` function is idempotent and only populates an empty table, preserving any operator-edited roster. Access is admin-gated.

## Next Case Study Thread
The next slice will build the Opus Team Dashboard panel. This will render department sections containing agent cards displaying name, a status pill (e.g., active/planned), chips for owned steps, and a list of responsibilities. Planned agents will be visually dimmed. Following that, we'll implement per-agent activity attribution to track their contributions.
