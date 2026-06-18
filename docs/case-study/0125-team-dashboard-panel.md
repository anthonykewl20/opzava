# 0125: Team Dashboard Panel

## Problem

Opzava's architecture treats AI agents as employees of a virtual company, but this organizational model was invisible in the UI. Operators had no single view answering "who works here, what do they own, and are they online?" Without a staff roster, onboarding new agents or diagnosing ownership gaps required digging through config files and API responses.

## Approach

A new `TeamDashboardPanel` renders the org chart by fetching `/api/team/agents` and grouping results into department sections: **Content Marketing**, **Email Marketing**, **Social Media**, and **General VA**. Each section is a responsive grid of agent cards.

To stay under the component complexity budget, the panel was split into three focused subcomponents:

- **StatusPill** — renders a colored badge (`emerald` for active, `amber` for paused, dimmed/muted for planned).
- **AgentCard** — displays agent name, status pill, owned workflow step IDs as chips, and a responsibilities summary.
- **DepartmentSection** — groups cards under a department heading with loading, error, and empty states plus a Refresh action.

Planned agents are visually dimmed to signal "not yet live" without hiding them.

Wiring: a `team` nav item with a `TeamIcon` was added to the **CORE** group in `nav-rail.tsx` (distinct from the base product's `agents` and `overview` entries). A `case 'team'` routes to `TeamDashboardPanel` in the `ContentRouter`.

## Contract

| Aspect | Detail |
|---|---|
| Endpoint | `GET /api/team/agents` — admin-gated, read-only |
| Response shape | Array of `{ id, name, department, status, ownedStepIds[], responsibilities }` |
| Status enum | `active` · `paused` · `planned` |
| UI authority | **Zero.** The dashboard reflects the org; it changes no permissions. Agents remain workers; every approval gate and exactly-once guarantee stays system-enforced. |

## Validation

- TypeScript: `tsc --noEmit` — clean.
- ESLint: 0 errors, 0 warnings.
- Production build: compiles successfully.
- **Check-plan assertion** verifies the panel exists and is wired into both the nav rail (`id: 'team'`) and the `ContentRouter` (`case 'team'` → `TeamDashboardPanel`).
- All tests pass; panel is strictly read-only.

## Security & Audit

No secret values, private credentials, tokens are shown by the panel — only agent names, departments, status, owned step IDs, and responsibilities from an admin-gated read route. Naming WHO owns a step grants no new authority; the approval gate and exactly-once guarantees stay system-enforced. The `/api/team/agents` endpoint requires an authenticated admin session and returns no credentials or internal system state.

## Next Case Study Thread

**Per-agent activity attribution** — each agent card expands to show its runs, artifacts, and cost broken down by the steps it owns. This builds on the roster by answering "what has this agent actually done?" Followed by **department project views** (grouping agents and their activity by initiative) and **agent enable/pause controls** (the first write path, still gated behind the system approval layer).
