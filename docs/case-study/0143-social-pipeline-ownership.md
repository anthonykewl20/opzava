# 0143: Social Pipeline Ownership

## Problem
The Social Media workflow pipeline (brief -> post-draft -> review -> approval -> schedule) was functional but only the `social-post-draft` step had an assigned owner. The Team Dashboard displayed the remaining steps as 'unassigned', creating a visibility gap and preventing clear accountability for task routing and status tracking.

## Approach
This was a surgical data and roster change. The existing `Social Media Manager` agent's ownership was expanded to include `social-brief` and `social-schedule-request`. A new, active `Social Reviewer` agent was added to the `Social Media` department, owning the `social-review` step. The department-pipeline test was updated to assert every social step now resolves to a specific owner. Existing tests for agent-role counts, activity, repository, and team routes were confirmed to pass, as they rely on relative `DEFAULT_AGENT_ROLES.length`.

## Contract
- **Social Media Manager** now owns: `['social-brief', 'social-post-draft', 'social-schedule-request']`.
- **Social Reviewer** (new) owns: `['social-review']`.
- The `Social Media` department now contains two agents.
- The pipeline's approval and schedule steps remain system-enforced gates (draft/scheduled-only).

## Validation
- **Department-Pipeline Test**: Asserts owners for all social steps: `social-brief`, `social-post-draft`, `social-schedule-request` -> `social-media-manager`; `social-review` -> `social-reviewer`.
- **Existing Suite**: Agent-role, agent-activity, repository, and team route tests remain green (counts are relative).
- **Static Analysis**: `tsc` and `eslint` (complexity ratchet) pass cleanly.
- **Build**: Production build compiles successfully.
- **Check-Plan**: Assertion verifies the `social-reviewer` persona and the widened ownership mapping.

## Security & Audit
No secret values, private credentials, tokens are introduced by widening ownership — only roster metadata (an added persona, more owned step ids). Naming owners changes no authority; every social gate (review, approval, draft-only schedule) is still system-enforced.

## Next Case Study Thread
The next slice should establish the General VA department with a minimal cross-cutting task workflow, rounding out the four named departments. Subsequent work can then focus on per-agent KPIs and deepening persona configurations.
