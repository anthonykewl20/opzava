# 0139: Social Department Activation

## Problem

The Social Media Manager persona existed only as a `planned` placeholder in the agent roster. It owned no steps, so the Social Media department never rendered on the Team Dashboard. With the `social-post-draft` artifact envelope now in place, the department needed to go live.

## Approach

A pure data/wiring change — no new abstractions.

1. **Activate the persona.** In `DEFAULT_AGENT_ROLES`, flip `social-media-manager` from `planned: []` to `active: ['social-post-draft']` with a real `responsibilities` string. (`general-va` remains the canonical planned example.)
2. **Register the pipeline.** In `department-pipeline.ts`, define `SOCIAL_PIPELINE_ORDER` (`social-brief → social-post-draft → social-review → social-schedule-request`) and register it under the `'Social Media'` department key.
3. **Update tests in lockstep.** Adjust every assertion that previously expected the old planned-ness, and add a dedicated Social Media pipeline test.

Because the `social-post-draft` artifact type equals the step id the manager owns, `summarizeAgentActivity` now attributes those artifacts to the Social Media Manager with zero extra code.

## Contract

| Surface | Change |
|---|---|
| `DEFAULT_AGENT_ROLES` | `social-media-manager` → `active`, owns `['social-post-draft']`, real responsibilities |
| `department-pipeline.ts` | `SOCIAL_PIPELINE_ORDER` added; registered as `'Social Media'` pipeline |
| Team Dashboard | Social Media column now renders alongside Content Marketing and Email |

No new types, hooks, or runtime modules were introduced.

## Validation

- **Agent-role test** — asserts `social-media-manager` is `active` owning `social-post-draft`; `general-va` remains `planned`.
- **Department-pipeline test** — asserts the Social Media pipeline builds in canonical order; `social-post-draft` is owned by `social-media-manager`; the unowned `social-brief` step resolves to `null`.
- **Team route tests** — seed the default roster and stay green.
- **Static analysis** — `tsc` and `eslint` (complexity ratchet) pass clean.
- **Production build** — compiles without errors.
- **Check-plan assertion** — verifies roster + pipeline wiring end-to-end.

## Security & Audit

No secret values, private credentials, tokens are introduced by activating an agent — only its status, owned step id, and responsibilities change. The Social Media Manager is a worker; the system still owns sequence, validation, approval, and (when added) the schedule-only/never-auto-publish terminal step.

## Next Case Study Thread

Activate the remaining social pipeline steps:

1. **`social-review`** — automated quality gate.
2. **`social-approval`** — human approval gate before scheduling.
3. **`social-schedule-request`** — terminal step that is schedule/draft-only and **never auto-publishes**.

After the full pipeline is live, introduce **General VA activation** and **per-agent KPIs** (throughput, approval rate, revision count) surfaced on the Team Dashboard.
