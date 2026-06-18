# 0132: Department Pipeline

## Problem
The Team Dashboard needs to visualize a department's workflow as an ordered sequence of steps, each attributed to its owning agent. Without this, stakeholders cannot see the canonical process flow or identify ownership gaps.

## Approach
A pure function over the roster composes two data sources: the canonical step order per department and the agents' declared `ownedStepIds`. The first agent claiming a step wins. Steps with no owner map to `null`.

## Contract
- **CONTENT_PIPELINE_ORDER**: `idea-intake → article-draft → outline → fact-check → seo-brief → wordpress-draft`
- **EMAIL_PIPELINE_ORDER**: `campaign-send`
- **DEPARTMENT_PIPELINE_ORDER**: maps department name to its canonical order
- **buildDepartmentPipeline(roles, department)**: returns `[{stepId, agentId|null, agentName|null}]` in canonical order; unknown department yields `[]`

## Validation
1. Content Marketing pipeline renders in canonical order
2. `article-draft` + `outline` → `copywriter`
3. `fact-check` → `fact-checker`
4. `seo-brief` → `seo-specialist`
5. `wordpress-draft` → `publisher`
6. `idea-intake` → `content-strategist`
7. Owner's `displayName` is carried in the result
8. Unowned step maps to `{agentId: null, agentName: null}`
9. Email Marketing pipeline: `campaign-send` → `email-specialist`
10. Unknown department yields `[]`

## Security & Audit
No secret values, private credentials, tokens are read by this function — it composes a public step order with the roster's owned step ids only. It visualizes who owns what; it grants no authority and the system still owns every gate.

## Next Case Study Thread
Render the pipeline per department on the Team Dashboard — a numbered step list with the owning agent and connectors. Then add optional eslint complexity rules for the builder and the R&D queue slice.
