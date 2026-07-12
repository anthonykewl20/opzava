# S1 (#147) data-model design decisions

Codebase-design artifact for Q17 slice S1.
Implements `tasks-ai-workforce-design.md` sections 4.1-4.3.
Frozen decisions the S1 codex dispatches implement; not living truth after landing.

## Context discovered

Task schema: `packages/project-management/src/adapters/postgres/schema/tasks.ts`.
Domain: `packages/project-management/src/domain/task.ts` (`taskStatuses = todo|in_progress|blocked|done`).
Migrations live centrally in `packages/identity-access/drizzle/` (drizzle-kit `_journal.json`); next number is `0015`.
RLS pattern per table: 3 policies (`*_tenant_isolation` permissive on `app.current_org_id()`, `*_tenant_context_required` restrictive `app.current_org_id() is not null`, `*_owner_admin` for `opzava_owner`), plus `alter table ... owner to opzava_owner` and an explicit `grant` to `opzava_app`.
Migration style: `set lock_timeout='3s'; set statement_timeout='30s';` then idempotent `do $$ ... create type if not exists ... end $$;`.

IMPORTANT reuse (do NOT recreate): Slice 2.5 already shipped `task_evidence` (kind file|link), `task_quality_review` (open|approved|changes_requested), `task_quality_check` (ai_precheck|human; pass|fail|pending), `task_quality_reviewer`.
S1 EXTENDS these, it does not recreate them.

## D1 - Lane is the single source of truth

Add enum `task_lane` = `backlog|todo|in_progress|review|done`.
Rename `tasks.status` -> `tasks.lane` and convert the column to `task_lane`.
Add `blocked boolean not null default false` and `blocked_reason text` (orthogonal flag, not a lane).
Data migration from old `status`: `todo->todo`, `in_progress->in_progress`, `done->done`; `blocked` rows become `blocked=true` with `lane = in_progress` when `assignee_user_id is not null` (proxy for active doer) else `lane = todo`.
Every old value is in a known set, so the mapping is total; still guard fail-closed (any unmapped row aborts the migration).
Leave the now-unused `task_status` enum type in place unless nothing references it (codex checks with `pg_depend`); dropping is optional cleanup, not required.

## D2 - Domain change + compat

`Task.status: TaskStatus` becomes `Task.lane: TaskLane`, `Task.blocked: boolean`, `Task.blockedReason: string | null`.
Add `taskLanes` const + `parseTaskLane`.
Keep `taskStatuses`/`parseTaskStatus` exported for now and add pure compat helpers `laneFromLegacyStatus(status)` and `legacyStatusFromLane(lane, blocked)` so the still-legacy MCP task tools keep compiling until S3 reworks them.
Update the repository read/write mapping and any consumer that would not compile otherwise to use `lane`; the 5-column board VISUAL rework stays in S10 (#156).

## D3 - Task 4.2 fields

Add to `tasks`: `overview text`, `assigned_agent_identity_id uuid`, `primary_issue_ref text`, `primary_pr_ref text`, `branch_name text`, `change_type` (`task_change_type` enum `visual|non_visual`, nullable), `review_state` (`task_review_state` enum `not_requested|requested|verifying|passed|changes_requested`, default `not_requested`), `review_requested_at`, `review_requested_by_agent_identity_id uuid`, `review_passed_at`, `review_passed_by_orchestrator_identity_id uuid`, `done_requested_at`, `done_by_user_id text`, `merge_state` (`task_merge_state` enum `none|pending_ci|merging|merged|blocked_ci_red|failed`, default `none`), `ci_state` (`task_ci_state` enum `unknown|pending|green|red`, default `unknown`).
Keep the existing `assignee_user_id` as the human assignee (== spec `assigned_human_user_id`); do NOT rename it (avoids ripple).
Keep external refs opaque text per ADR-004.

## D4/D5 - New aggregate tables (6), standard RLS

Migration `0016`. Each table: `id uuid pk default gen_random_uuid()`, `organization_id uuid not null`, `workspace_id uuid not null`, audit timestamps, the 3-policy RLS + owner + `opzava_app` grant, and a `(id, organization_id)` unique index.

- `agent_identity`: `name`, `kind` (`agent_identity_kind` enum `orchestrator|gateway_subagent|local_tool`), `provider text`, `via_client text`, `issued_to_user_id text`, `token_id text`, `openclaw_agent_ref text`, `status` (`agent_identity_status` enum `active|revoked`). Unique `(organization_id, workspace_id, name)`.
- `task_agent_assignment`: `task_id`, `agent_identity_id`, `run_policy text`, `assigned_by_user_id text`, `active boolean`. Unique active assignment per `(organization_id, task_id)`.
- `agent_dispatch`: `task_id`, `outbox_id text`, `channel` (`agent_dispatch_channel` enum `gateway_push|local_poll`), `state` (`agent_dispatch_state` enum `pending|dispatched|acked|degraded|failed`), `degraded_reason text`, `openclaw_session_ref text`, `openclaw_task_ref text`, `ai_run_ref text`, `idempotency_key text`. Unique `(organization_id, outbox_id)` for idempotent replay collapse.
- `task_run_step`: `task_id`, `agent_identity_id`, `sequence int`, `summary text` (human-readable, NOT raw tool spam), `state` (`task_run_step_state` enum `running|done|failed`), `started_at`, `ended_at`. Index `(organization_id, task_id, sequence)`.
- `task_pull_queue`: `task_id`, `agent_identity_id`, `reason text`, `claimed_at`, `claimed_by_token_id text`. Visible to a local-tool doer on next MCP poll; index `(organization_id, agent_identity_id, created_at)`.
- `task_pr_link`: `task_id`, `pr_ref text`, `branch text`, `ci_state` (`task_ci_state`), `mergeability text`, `checks_url text`, `merge_state` (`task_merge_state`), `merged_by_user_id text`, `merged_at`, `merge_audit text`. Unique `(organization_id, task_id, pr_ref)`.

## D6 - Extend Slice-2.5 evidence/quality (migration 0017)

`task_evidence`: add `evidence_type` enum `task_evidence_type` = `screenshot|e2e|smoke|real_world|mutation|verify_deep|pr` (nullable; orthogonal to the existing `kind` file|link storage dimension).
`task_quality_review`: add `reviewer_orchestrator_identity_id uuid`, `required_note text` (mandatory when changes requested, enforced in S8 app layer), `rerun_refs text[]`, `screenshot_verification_refs text[]`.
Do not break the existing `status` enum; `approved` continues to mean review passed.

## D7 - Acceptance (failable checks)

Board state derives ONLY from Postgres `tasks` (+ issue/pr/runtime ref columns); the read path imports nothing from OpenClaw storage (assert by grep + a projection-rebuild test that reconstructs board rows from the tables).
Every pre-existing `blocked` task ends `blocked=true` with a non-`blocked` lane (migration test on a seeded DB).
`opzava_app` cannot read another tenant's rows in EVERY new table (RLS cross-tenant denial test, one per table, using the existing withTenant/probe harness).

## Dispatch decomposition

S1a = D1-D3 (migration 0015 + domain + repository + keep-compiling). Gate: typecheck all; existing task suites green; 0015 applies on seeded DB; blocked rows migrated.
S1b = D4-D5 (migration 0016 + 6 tables + enums + domain types). Gate: typecheck; RLS cross-tenant denial test per new table.
S1c = D6-D7 (migration 0017 + evidence/quality extension + projection + acceptance tests). Gate: projection rebuild test; evidence-type + QR fields present; full package test suite green.
