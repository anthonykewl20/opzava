# S2 (#148) transition services + policy design decisions

Codebase-design artifact for Q17 slice S2.
Implements `tasks-ai-workforce-design.md` section 5.2 (+ 6.1 outbox, 6.3 superseded by Amendment A).
Depends on S1 (lane model, agent_identity, task fields). Frozen for the S2 codex dispatches.

## Context discovered

Lane model + `review_state`/`merge_state`/`ci_state` columns + `agent_identity` (kind orchestrator|gateway_subagent|local_tool) landed in S1.
No task audit or task-transition outbox table exists yet; only `issue_close_outbox` (the ADR-004 template: id, org, ws, task_id, dedupe_key, state, attempts, next_attempt_at, last_error, claimed_at, claim_token, timestamps).
Existing `AuthorizationPort.can(subject, action, resource)` is TENANT-ROLE based (owner/admin/member/guest) - it answers "may this human touch this workspace", NOT transition ownership. S2 adds a transition-ownership layer ON TOP of that.
Existing status write paths: `createTask` (both status+lane), `moveTask` (both), field-only `updateTask` (neither). S2 adds lane-transition services alongside these; `moveTask` stays the legacy status-move path.

## D1 - Transition actor model

New domain type `TransitionActor`:
- `{ kind: "human", userId, roleKeys }`  (human admin/member from the Better Auth session + tenant grants)
- `{ kind: "agent", agentIdentityId, agentKind: "orchestrator" | "gateway_subagent" | "local_tool", tokenId }`
Resolved by the caller (S3 tool registry / web server action) and passed in; NEVER trusted from client text (authority is the session/token, per Q16). S2 services take a TransitionActor and enforce ownership; the tenant `AuthorizationPort` still gates workspace access first.

## D2 - Transition state machine + ownership (section 5.2)

Pure domain function `canTransition(from: TaskLane, to: TaskLane, ctx): Result<void>` plus per-transition ownership. Allowed edges and owners:
- Backlog -> Todo : human admin only (agent of ANY kind denied).
- Todo -> In Progress : the ASSIGNED doer only, via claim (actor.agentIdentityId must equal task.assigned_agent_identity_id, or a human self-claim path if assigned to a human).
- In Progress -> Review : the assigned doer only, via request_review; HARD-GATED (see D3).
- Review -> In Progress : Lead Orchestrator identity only (agentKind orchestrator), via request_changes; note required; same doer stays assigned (do NOT clear assignment).
- Review -> Done : human admin only (the CI-green + merge execution is S9; S2 enforces only the human-only + review_state='passed' precondition, and fails closed otherwise).
- Review -> Review : Lead Orchestrator only, via record_check / pass (pass sets review_state='passed' but does NOT move to Done).
Forbidden (explicit deny, audit the denial): doer touching Backlog; doer Backlog->Todo; doer set Done; doer merge; doer calling reviewer transitions; orchestrator auto-Done; human Done while review_state != 'passed'. All denials return a 403-class DomainError (never a silent no-op / empty result).

## D3 - Hard gates (structural; verification logic deferred)

`request_review` (In Progress -> Review) FAILS CLOSED unless: `change_type` is set (visual|non_visual) AND at least one matching evidence row exists (evidence presence + type match to change_type at the STRUCTURAL level). The rich evidence-SUFFICIENCY verification (screenshot really matches, tests really ran) is S8 (#154) and layers on top; S2 provides the presence/type gate + the `review_state` transitions the S8 reviewer drives.
`Review -> Done` precondition: `review_state = 'passed'`. CI-green + merge is S9.

## D4 - New tables (migration 0018), standard RLS

- `task_transition_outbox` (ADR-004): mirror issue_close_outbox shape. Columns: id, organization_id, workspace_id, task_id, event_type (enum task_transition_event: moved_to_todo|claimed|review_requested|changes_requested|review_passed|assigned_orchestrator|mention), from_lane task_lane, to_lane task_lane, actor_kind, actor_ref, payload jsonb, dedupe_key text, state (pending|claimed|processed|failed), attempts int, next_attempt_at, last_error, claimed_at, claim_token, created_at, updated_at. Unique (organization_id, dedupe_key). Consumed by the S6 dispatcher.
- `task_transition_audit`: id, organization_id, workspace_id, task_id, event_type, from_lane, to_lane, blocked_before/after, actor_kind, actor_ref, note, created_at. Append-only history.
Both get the standard 3-policy RLS + owner + opzava_app grant (mirror the S1b/0007 template).

## D5 - Transition = single transaction (ADR-004)

Each transition service writes, in ONE `withTenant` transaction: the tasks-row update (lane/blocked/review_state/assignment as applicable), the audit row, and the outbox row. Result-typed; on any failure the whole transaction rolls back (no partial transition, no orphan outbox). Outbox `dedupe_key` = deterministic from (task_id, event_type, transition sequence) so a replay collapses.

## D6 - Amendment A (opt-in dispatch) - CRITICAL

DO NOT implement superseded section 6.3 ("if no doer assigned, dispatcher asks Ask Admin to choose one"). Instead: a Todo with NO assigned doer is NOT auto-dispatched and emits NO gateway-push outbox event. The orchestrator is engaged ONLY by an explicit `Assign To = Lead Orchestrator` (a human action that sets assigned_agent_identity_id to the orchestrator identity and emits the `assigned_orchestrator` outbox event) or an @mention to it. An unassigned Todo transition emits an audit row but no push-intent outbox event.

## D7 - Acceptance (section 14 failable checks)

Each an independent test (unit for the pure state machine + integration for the services on the live DB):
- doer cannot Backlog->Todo; human admin can.
- doer can claim an assigned Todo; a non-assigned actor cannot claim.
- doer cannot request_review without change_type + matching evidence (fails closed 403/precondition).
- orchestrator request_changes returns Review->In Progress with the SAME doer still assigned; note required.
- human Done blocked while review_state != 'passed'.
- unassigned Todo does NOT emit a gateway-push outbox event (Amendment A); assigning to Lead Orchestrator DOES.
- every transition writes exactly one audit row and (where a push is intended) one outbox row in the same transaction; RLS cross-tenant denial on both new tables.

## Dispatch decomposition

S2a = D1-D4 tables + pure domain state machine + ownership policy + TransitionActor (migration 0018, domain, no services). Gate: unit tests for canTransition/ownership (all 5.2 edges + forbidden); typecheck; migration applies; RLS denial on both new tables.
S2b = D5/D6 application transition services (claim, request_review, request_changes, record_check/pass, promote_backlog_to_todo, request_done-precondition) writing tasks+audit+outbox in one tx, Amendment A opt-in. Gate: section-14 integration tests on the live DB (each failable), all green.
