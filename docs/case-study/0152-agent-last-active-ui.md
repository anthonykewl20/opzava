# 0152: Agent Last Active UI

## Problem
The Team Dashboard displayed agent personas and output counts but lacked temporal context. Managers couldn't distinguish between recently active agents and dormant ones without checking individual artifact logs, making the roster feel static rather than a living directory.

## Approach
Extended the existing `summarizeAgentActivity` pipeline to compute `lastActiveAt` from artifact metadata timestamps. The team agents route merges this field onto each agent object alongside `artifactCount`. The `AgentCard` footer conditionally renders "active <relative date>" with a full ISO timestamp tooltip when the agent has produced work.

## Contract
- **Route**: `GET /api/teams/:teamId/agents` returns `Agent[]` with `lastActiveAt?: string` (ISO 8601, additive, non-breaking).
- **Component**: `AgentCard` accepts optional `lastActiveAt`; renders date only when `artifactCount > 0`.
- **Tooltip**: Full timestamp on hover; relative format ("2h ago", "3d ago") in footer.

## Validation
- `tsc --noEmit` and `eslint .` pass clean.
- Existing team route tests remain green; `lastActiveAt` is additive to the response shape.
- Production build compiles without warnings.
- Check-plan assertion verifies `lastActiveAt` flows from route through to the `AgentCard` panel.
- UI is strictly read-only.

## Security & Audit
No secret values, private credentials, tokens are shown — only a count and a date derived from artifact metadata. The dashboard displays activity, never content or credentials. All data is scoped to the authenticated team context; no cross-tenant leakage.

## Next Case Study Thread
- **Optional General VA review/approval steps** to align with other department workflows.
- **Postgres-compatibility ARD** for the activity summarization queries.
- **Multi-tenant scoping** hardening for the agents endpoint.
