# 0133: Team Pipelines Route

## Problem
The Team Dashboard needed to visualize departments as project pipelines, not just agent rosters. The existing `GET /api/team/agents` endpoint returned agents grouped by department with `artifactCount`, but lacked the workflow structure showing how work flows through each department.

## Approach
Extended the existing route with TDD to include pipeline data. The `buildDepartmentPipeline` function maps each department to its ordered workflow steps with owning agents. The route computes per-agent activity (preserving `artifactCount` enrichment) and per-department pipelines, returning `{ agents, byDepartment, pipelines }`.

## Contract
```
GET /api/team/agents
Authorization: Bearer <admin-token>

Response 200:
{
  agents: [{ id, name, role, department, artifactCount }],
  byDepartment: { [department]: [agentIds] },
  pipelines: { [department]: [{ step, owner }] }
}
```

## Validation
Four tests with real in-memory better-sqlite3 database:
1. Returns roster with `artifactCount` on every agent
2. Seeded `article-draft` + `outline` attributes to copywriter
3. Content Marketing pipeline returns in canonical order (`idea-intake` → `wordpress-draft`) with `article-draft` owned by copywriter
4. Email Marketing pipeline shows `campaign-send` owned by email-specialist

## Security & Audit
No secret values, private credentials, tokens pass through this route — it returns role metadata, integer counts, and step→owner pipelines only. Admin-gated and read-only.

## Next Case Study Thread
Render the per-department pipeline on the Team Dashboard (numbered steps with owning agents and connectors), then optional eslint complexity rules and the R&D queue.
