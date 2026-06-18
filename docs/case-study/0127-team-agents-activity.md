# 0127: Team Agents Activity

## Problem
The `GET /api/team/agents` route returned the team roster grouped by department, but lacked visibility into agent productivity. Stakeholders needed to know how many content artifacts each agent had produced without querying the artifact store directly.

## Approach
Extended the existing TDD slice with a `summarizeAgentActivity` function that queries the artifact store for each agent's owned steps, counts their persisted artifacts, and merges the `artifactCount` integer onto each agent object before grouping. The route remains read-only and continues to seed the default roster on first run.

## Contract
- **Route:** `GET /api/team/agents` (admin-gated via `requireRole`)
- **Query params:** optional `?dept` and `?status` filters
- **Response shape:** `{ agents, byDepartment }` where each agent includes `artifactCount: number`
- `groupAgentRolesByDepartment` reads only department metadata; the extra count field passes through untouched

## Validation
Four tests backed by a real in-memory `better-sqlite3` database via `getDatabase`:

1. Every returned agent carries a numeric `artifactCount` property
2. Seeded `article-draft` + `outline` artifacts attribute count `2` to the copywriter and `0` to the email-specialist
3. Count carries through `byDepartment` grouping — seo-specialist shows `1` for a seeded `seo-brief`
4. The `?status` filter continues to work correctly alongside the enriched data

## Security & Audit
No secret values, private credentials, tokens pass through this route — it returns role metadata plus an integer artifact count only. Activity is derived from artifact types, never their content. The endpoint is admin-gated and strictly read-only; no mutation of agents or artifacts occurs.

## Next Case Study Thread
Surface `artifactCount` on the Team Dashboard agent cards (a codex-spark card update reviewed strictly by Opus), followed by department project views and agent enable/pause controls.
