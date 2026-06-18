# 0146: General VA Activation

## Problem

Opzava's org chart defined four departments: Content Marketing, Email, Social Media, and General VA. The first three were active with live agents and pipelines. General VA remained a *planned* persona — its agent existed in the roster but owned zero steps and rendered no pipeline on the Team Dashboard. A task-draft step and artifact envelope were already built; the missing piece was wiring the persona to its steps and registering the pipeline so the department became visible and operational.

## Approach

A pure data/wiring change — no new steps, no new artifacts.

1. **Activate the persona.** In `DEFAULT_AGENT_ROLES`, flip `general-va` from `planned` with an empty step list to `active` owning `['va-task-intake', 'va-task-draft']`.
2. **Register the pipeline.** In `department-pipeline.ts`, add `GENERAL_VA_PIPELINE_ORDER` (`va-task-intake → va-task-draft → va-task-review`) keyed under `'General VA'`.
3. **Relax the test.** The agent-role test previously hard-coded a specific planned example. With no planned agents remaining, replace it with a general invariant: *every active agent owns ≥ 1 step; every planned agent owns 0.*

Because `va-task-draft`'s `artifactType` equals its step id, per-agent activity attributes draft artifacts to the General VA agent with zero additional code.

## Contract

| Surface | Expectation |
|---|---|
| `DEFAULT_AGENT_ROLES['general-va']` | `status: 'active'`, `steps: ['va-task-intake', 'va-task-draft']` |
| `GENERAL_VA_PIPELINE_ORDER` | `['va-task-intake', 'va-task-draft', 'va-task-review']` |
| Team Dashboard | Four department columns, all active |
| Agent-role invariant | active → owns ≥ 1 step; planned → owns 0 |

## Validation

- **Agent-role test** — asserts `general-va` is active owning `va-task-intake` and enforces the planned/active invariant across the full roster.
- **Department-pipeline test** — asserts the General VA pipeline builds with `va-task-draft` owned by `general-va`.
- **Repository, activity, and team route tests** — remain green; counts are relative so the new department does not break existing assertions.
- **Static analysis** — `tsc` and `eslint` pass clean.
- **Build** — compiles without warnings.
- **Check-plan assertion** — verifies the roster and pipeline wiring match the intended four-department scope.

All four departments now render as active on the Team Dashboard.

## Security & Audit

Activating an agent is a status change only. No secret values, private credentials, tokens are introduced. What changes: the agent's status flips from `planned` to `active`, its owned step ids are listed, and its responsibilities are declared. The General VA agent is a worker; the system still owns sequence, validation, and approval for every department.

## Next Case Study Thread

**Per-agent KPIs and persona depth.** Introduce `lastActive`, `approvalCount`, and `taskThroughput` metrics across all four departments, then enrich each persona with `displayName`, `avatar`, `soul` (charter/personality), and `preferredModel` — giving the Team Dashboard a richer, more human-readable roster.
