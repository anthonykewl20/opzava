# 21 — Team / Social / General-VA Modules (deep)

> Zones: `src/opzava/modules/{team,social,general-va}/`. Marks: ✅✅ = double-verified (F2 had a fresh
> pass), 🔎 = pass-1 research, ⚠️ = nuance.

## Team module — the org chart

The only one of the three with its own table and HTTP surface.

**Agent role contract** (`team/agent-role.ts`, 🔎): `.strict()` Zod, `schemaVersion:1`,
`agentId` slug `/^[a-z0-9-]+$/`, `name`, `department`, `status ∈ {active, planned, paused}`,
`ownedStepIds[]`, `responsibilities`. `superRefine`: an `active` role must own ≥1 step; `ownedStepIds`
unique. **12 default roles** across 4 departments (Content Marketing ×8, Email ×1, Social ×2, General VA ×1).

**Status state machine** (`team/agent-status.ts`, 🔎):
```
active ⇄ paused          planned: (no transitions — inert)
```
`transitionAgentStatus` throws on illegal moves and **re-parses** through `parseAgentRole` (so flipping a
no-step role to `active` would throw the `active⇒owns≥1` refine). The PATCH route only allows
`active`/`paused`; `planned` is unreachable via API.

**Profiles** (`team/agent-profile.ts`, 🔎): optional display layer (`displayName`, `avatarEmoji`, `charter`,
`preferredModel ∈ {opus,sonnet,haiku}`). Import-time guard throws if a profile's `agentId` isn't a known
role — profiles are a strict subset of roles.

**Repository** (`team/agent-role-repository.ts`, 🔎): table `opzava_agent_roles`
(`agent_id` PK · `name` · `department` · `status` · `record_json`; indexes department/status). UPSERT;
`seedDefaults()` inserts the 12 defaults only when the table is empty.

**Activity** (`team/agent-activity.ts`, 🔎): `summarizeAgentActivity` reads the **content** artifact table
(`opzava_content_artifacts`) and attributes artifact counts to roles by `ownedStepIds → artifactType`
(identity map except `fact-check → fact-check-report`). So "activity" = artifact-count-by-owned-step.

**Department pipeline** (`team/department-pipeline.ts`, 🔎): static per-department step orderings mapped to
`{stepId, agentId|null, agentName|null}`; unowned steps surface `agentId:null`.

### F2 — two unreconciled agent models ✅✅ (triple-checked: pass1 + fresh agent + grep)

| | Inherited `agents` | opzava `opzava_agent_roles` |
|---|---|---|
| PK | `id INTEGER AUTOINCREMENT` | `agent_id TEXT` slug |
| Status | `offline\|idle\|busy\|error` | `active\|planned\|paused` |
| Owns | gateway/runtime/session coupling | workflow step ids |

`src/opzava/modules/team/**` never touches `agents`; `src/lib/**` never references `opzava_agent_roles`.
No join, sync, or shared status. They share only the SQLite connection (the `/api/team/agents` route passes
`getDatabase()` into the opzava repo, which reads only `opzava_agent_roles` + `opzava_content_artifacts`).
→ Top parity item; see [F2](./90-parity-findings.md). Decision Q1 (converge or not) is yours.

⚠️ **Orphaned step `va-task-review`** 🔎: it has an artifact type and sits in `GENERAL_VA_PIPELINE_ORDER`,
but **no default role owns it** — `buildDepartmentPipeline('General VA')` yields a step with `agentId:null`,
and activity attributes its artifacts to no one. Likely a missing role/ownership entry.

## Social module — a step library 🔎

`social/` = a typed artifact factory (`social-*` types) + four **pure DI step services**:
`social-post-draft`, `social-review` (passed\|rejected verdict, issue-validated), `social-approval`
(emits a terminal core `Approval`, `requestedAction:'social-publish'`), `social-schedule-request`
(**hard gate**: throws `social scheduling requires a granted approval` if `approvalGranted===false`; output
status only ever `scheduled|draft` — never "published"). Reuses **core only** (`parseArtifact`,
`parseApproval`); no runner/repository/providers; **no own tables**.

## General-VA module — a step library 🔎

`general-va/` mirrors social: `va-task-draft`, `va-task-review` (passed\|rejected), `va-approval`
(terminal `Approval`, `requestedAction:'va-task-complete'`). Same core-only reuse; no tables.

## ⚠️ Social + General-VA step services are dead-wired ✅✅ (grep-confirmed)

No runner, worker, registry, daemon, or route imports `createSocialPostDraftStepService`,
`createVaTaskReviewStepService`, etc. They are fully unit-tested **library code with no production caller**;
the team `department-pipeline` references their step ids only as **strings** for display ordering. Another
"built but not wired" instance (theme of [F5](./90-parity-findings.md)).

⚠️ Both modules' approval steps mint **terminal** approvals (`approved`/`rejected`) directly rather than
creating a `requested` row and transitioning it — so they bypass the approval state machine's
`requested→…` lifecycle (relevant if a human-in-the-loop UI expects pending approvals). 🔎

## Persistence

| table | owner | columns |
|-------|-------|---------|
| `opzava_agent_roles` | team | `agent_id` PK · `name` · `department` · `status` · `record_json` (indexes dept/status) |

Social and General-VA own **no tables**; their artifacts (when a caller persists them) would land in the
content module's `opzava_content_artifacts`.

## Dependencies

**Inbound**: `GET /api/team/agents` (roles + activity + per-dept pipelines; seeds defaults),
`PATCH /api/team/agents/[id]` (status active↔paused, 409 on illegal); `team-dashboard-panel`. Social/VA step
services have **no inbound importers** outside their own modules + tests.
**Outbound**: team → content artifact repo (activity) + `@/lib/{auth,db,rate-limit}` (via routes);
social/VA → core artifacts + approvals only.

## Subtleties for parity comparison

1. The team model is a clean, validated **org chart** — but it's an island; the inherited runtime `agents`
   model is what the dispatch engine actually uses (F2).
2. Social + General-VA are coherent step libraries that **nothing executes** — designed feature surface
   ahead of wiring.
3. Approval gates here emit terminal approvals directly, sidestepping the `requested` lifecycle.
4. `va-task-review` is an orphaned step (no owner).
