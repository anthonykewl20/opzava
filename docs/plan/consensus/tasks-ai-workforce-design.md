# Tasks / AI-Workforce admin dev pipeline: design contract

Status: authoritative build spec for the future `Tasks / AI-Workforce` slice. Codegen implements THIS
contract verbatim. Where this is silent, keep Slice 2.5 task/card conventions, `withTenant` RLS,
hard-403, ports, outcome receipts, and projections-are-cache. Non-negotiables: ADR-003, ADR-004,
ADR-005, ADR-008, ADR-011, ADR-012, PRD-003, PRD-012, Q16, and Q17.

## 0. Prime directive

The admin Tasks board is an **ADMIN-ONLY Opzava-platform development pipeline**. It tracks Opzava's
own slices, fixes, incidents, PRs, and verification work. It is Opzava dogfooding Opzava.

It is not the user-side product PM surface for customers. CRM and Marketing stay separate business
surfaces and are deferred from this slice.

The core invariant:

> A doer can never self-approve, set Done, or merge. Review is adversarial verification by Ask Admin
> Opzava, and Done remains human-only. Evidence gates Review; CI-green gates merge.

## 1. Source map and load-bearing citations

- `docs/plan/grilling-decisions.md` Q17 is the locked product decision for this slice.
- `docs/adr/ADR-008-ai-workforce.md` owns AI Workforce, `AgentDispatch`, `Assignment`,
  `AgentEmployee`, delegate agents, and the distinction between human work and runtime work.
- `docs/adr/ADR-004-data-boundary-cqrs.md` owns Postgres truth, transactional outbox, opaque
  runtime refs, and "projections are rebuildable cache; OpenClaw snapshots are truth."
- `docs/adr/ADR-003-gateway-broker-acl-two-token.md` owns the broker ACL, tenant routing, WS-first
  OpenClaw RPC, and split hot-path `operator.write` + `operator.approvals` vs JIT
  `operator.admin`.
- `docs/adr/ADR-005-tool-policy-security.md` owns "SOUL can lie; tool policy cannot", deny-wins,
  approval rows, and code-capable exception posture.
- `docs/adr/ADR-011-crm-channel-identity.md` and `docs/prd/PRD-012-admin-observability.md` lock
  issue/admin-card projection vocabulary: external issue state is projected, not product truth;
  Opzava owns links, cards, audit, triage, and divergence display.
- `docs/plan/research/slice2.5-cc-mcp-live-card.md` and
  `docs/plan/consensus/slice2.5-verify.codex.md` lock Slice 2.5 link tokens, issue projection,
  active-close, card detail, Evidence/Files, AI Run, and current MCP lessons.
- `docs/openclaw/concepts/session-tool.md` documents `sessions_spawn`, `sessions_send`,
  `sessions_yield`, and `subagents` as native session/subagent tools.
- `docs/openclaw/concepts/agent-runtimes.md` documents the runtime split and why Codex app-server,
  ACP, CLI backends, and external harnesses are different surfaces.
- `docs/openclaw/concepts/parallel-specialist-lanes.md` documents `delegationMode: "prefer"` and
  the lane/concurrency posture for coordinator agents.
- `docs/openclaw/gateway/config-tools.md` documents tool profiles, `group:sessions`, `group:fs`,
  `group:runtime`, MCP/plugin tool exposure, and deny-wins semantics.
- `docs/openclaw/automation/tasks.md` documents detached tasks as the activity ledger for ACP,
  subagents, cron, and CLI operations.
- `docs/openclaw/automation/taskflow.md` documents durable multi-step Task Flow above tasks.
- `docs/openclaw/automation/cron-jobs.md`, `docs/openclaw/automation/standing-orders.md`,
  `docs/openclaw/automation/webhook.md`, and `docs/openclaw/automation/poll.md` remain the native
  automation references when this slice later composes scheduled or proactive work.
- `docs/openclaw/cli/mcp.md` distinguishes OpenClaw as an MCP server from saved outbound MCP
  servers and points ACP-hosted harness work to ACP, not local desktop control.

## 2. Actors and identity

Exactly three actor classes exist in this slice:

1. Human admin: owner, curator, assignee, approver, and final Done actor.
2. Doer agent: either a gateway-side doer or a local-tool doer.
3. Lead Orchestrator: Ask Admin Opzava, dispatcher and reviewer.

Doer variants:

- Gateway-side doer = Ask Admin Opzava dispatches an OpenClaw subagent with `sessions_spawn`,
  `subagents`, and `delegationMode: "prefer"`. It runs on the VPS, in the tenant/platform Gateway
  runtime context.
- Local-tool doer = `claude-code`, `claude-desktop`, or `codex` connected to Opzava's hosted MCP.
  It runs wherever the human starts that tool and polls for work.

Identity invariants:

- Every agent identity is named at provisioning or token issuance time.
- A client-declared name is never authority.
- Attribution records `actor`, `via_client` where applicable, `agent_identity`, issuing human,
  task id, run id, and tool receipt id.
- One hosted MCP token maps to one named agent identity and one issuing human. One token per local
  tool/client is the trustworthy attribution model.
- Token revocation, membership-version change, session-version change, expiry, or explicit revoke
  kills the identity path.

## 3. Scope and non-goals

### Goals

- Convert the admin Tasks board into the five-lane Opzava-platform dev pipeline.
- Add the AI Workforce `AgentDispatch` dispatcher worker for task events.
- Support gateway-side subagent dispatch and local-tool hosted MCP polling against one governed
  task/review tool registry.
- Add hard transition ownership rules, tool-policy gates, and audit.
- Add the Evidence gate for Review.
- Add orchestrator Quality Review automation that independently verifies evidence.
- Add PR/CI evidence and merge-on-human-Done orchestration.
- Add hosted Streamable HTTP MCP behind Traefik while keeping stdio as fallback.
- Keep GitHub issue state as projection truth from GitHub while Tasks remain the execution unit.

### Non-goals

- Do not make this an end-user PM product surface.
- Do not build user-side CRM/Marketing work here.
- Do not remote-control the admin's local desktop apps from the VPS.
- Do not use ACP as the local-tool path. ACP and CLI backends run on the gateway host; that was the
  Q16 rejection reason for local-first dev.
- Do not expose Done, merge, reviewer tools, or Backlog curation tools to doers.
- Do not treat screenshots/tests as checkboxes; orchestrator verification is required.
- Do not store GitHub credentials in source, env examples, task rows, issue projections, or docs.
- Do not make GitHub issues or PRs the Opzava Task source of truth.

## 4. Domain model changes

### 4.1 Task status and blocked flag

Current code has `todo|in_progress|blocked|done` in
`packages/project-management/src/domain/task.ts`. Replace that model with:

```ts
type TaskLane = "backlog" | "todo" | "in_progress" | "review" | "done";
type TaskBlockedState = { blocked: boolean; blockedReason?: string };
```

`blocked` is an orthogonal flag/label, not a lane. Existing rows with status `blocked` migrate to:

- `lane = "in_progress"` when they have an active doer/run.
- `lane = "todo"` when unclaimed.
- `blocked = true` and required blocked reason/audit from the old activity/comment history where
  available.

Fail closed if a migration cannot infer lane safely; write a repair report and keep the task hidden
from dispatcher until repaired.

### 4.2 Task fields

Add or confirm these Task fields/read-model fields:

- `lane`
- `blocked`
- `blocked_reason`
- `overview`
- `assigned_agent_identity_id`
- `assigned_human_user_id`
- `primary_issue_ref`
- `primary_pr_ref`
- `branch_name`
- `change_type`: `visual | non_visual | null`
- `review_state`: `not_requested | requested | verifying | passed | changes_requested`
- `review_requested_at`
- `review_requested_by_agent_identity_id`
- `review_passed_at`
- `review_passed_by_orchestrator_identity_id`
- `done_requested_at`
- `done_by_user_id`
- `merge_state`: `none | pending_ci | merging | merged | blocked_ci_red | failed`
- `ci_state`: `unknown | pending | green | red`

Keep external refs opaque per ADR-004.

### 4.3 New aggregates / process records

- `AgentIdentity`: named agent identity for gateway-side and local-tool doers. Fields:
  `id`, `organization_id`, `workspace_id`, `name`, `kind`, `provider`, `via_client`,
  `issued_to_user_id`, `token_id?`, `openclaw_agent_ref?`, `status`, audit timestamps.
- `TaskAgentAssignment`: binds one Task to the selected doer identity and run policy.
- `AgentDispatch`: ADR-008 bridge record from Task event to OpenClaw session/task/run refs.
- `TaskRunStep`: step-by-step AI Run trace. This is human-readable run trace, not raw every tool
  call.
- `TaskEvidence`: declared evidence artifacts. Kinds:
  `screenshot | e2e | smoke | real_world | mutation | verify_deep | pr`.
- `QualityReview`: orchestrator review record with checks, pass/request-changes decision, evidence
  refs, rerun refs, screenshot verification refs, and required note for changes requested.
- `TaskPullQueue`: queue entries visible to local-tool doers on next MCP poll.
- `TaskPrLink`: PR ref, branch, CI state, mergeability, checks URL/ref, and merge audit.

## 5. Five-lane lifecycle and transition ownership

### 5.1 Lanes

| Lane | Meaning | Who may move into it | Who may work in it |
| --- | --- | --- | --- |
| Backlog | Planning/curation only. Creating agent drafts Overview here. | human admin, orchestrator-as-planner | human admin, orchestrator-as-planner |
| Todo | Actionable work ready for assignment/dispatch. | human admin only from Backlog | human admin, orchestrator dispatcher |
| In Progress | Doer has claimed; AI Run begins. | assigned doer through `task.claim` | assigned doer |
| Review | Doer says work is ready and evidence gate passed. | assigned doer through `task.request_review` only | Lead Orchestrator reviewer |
| Done | Human accepted; merge path may run. | human admin only | no doer work |

### 5.2 Transitions

- `Backlog -> Todo`: human-only actionable gate. No doer tool can perform this.
- `Todo -> In Progress`: assigned doer calls `task.claim`; creates/starts AI Run.
- `In Progress -> Review`: assigned doer calls `task.request_review`; requires declared
  `change_type` and matching evidence.
- `Review -> In Progress`: Lead Orchestrator calls `review.request_changes`; same doer remains
  assigned; note required.
- `Review -> Done`: human-only. This starts orchestrator-internal merge flow if a PR exists.
- `Review -> Review`: Lead Orchestrator may call `review.record_check` and `review.pass`, but pass
  does not move to Done.

Forbidden transitions:

- Doer touching Backlog.
- Doer moving Backlog to Todo.
- Doer setting Done.
- Doer calling merge.
- Doer calling reviewer tools.
- Orchestrator auto-Done.
- Human Done while review has not passed, CI is red, or required evidence is missing.

## 6. Dispatch model

### 6.1 Gateway-side push path

Events:

- card moved to Todo
- assigned doer changed
- comment or `@mention`
- review requested
- changes requested

Flow:

1. Task command writes Task rows and ADR-004 outbox event in one transaction.
2. Dispatcher worker claims outbox event idempotently.
3. Worker resolves task, assignment, agent identity, policy, and tenant route.
4. Worker sends to Ask Admin Opzava through the broker using `sessions.send`.
5. Ask Admin Opzava either handles reviewer work or dispatches a gateway-side subagent using
   `sessions_spawn` with native subagent runtime and `delegationMode: "prefer"`.
6. Broker projects session/task/run refs into `AgentDispatch`, `TaskAgentAssignment`, and AI Run.
7. Subagent reports progress using governed task tools.

OpenClaw citations: `docs/openclaw/concepts/session-tool.md` for `sessions_send`,
`sessions_spawn`, `sessions_yield`, and `subagents`; `docs/openclaw/concepts/parallel-specialist-lanes.md`
for `delegationMode: "prefer"`; `docs/openclaw/automation/tasks.md` for background task lifecycle.

### 6.2 Local-tool poll path

Local tools do not receive real-time push from Opzava unless the client supports it later. The slice
must be honest:

- Local doers poll `list_my_open_items`.
- Comments on local-tool-owned cards are answered on next poll.
- `@mention` to a local identity writes a queue item, notification, and activity row; it does not
  fake instant response.
- Poll responses include card summary, latest human comments, required action, due date, blocked
  flag, evidence requirements, and tool links.

### 6.3 Assignment rules

- A human may pre-assign a specific doer in Todo.
- If no doer is assigned, the dispatcher asks Ask Admin Opzava to choose one.
- `Assigned to` shows a named agent identity plus AI badge for agent doers.
- A changes-requested review returns to the same doer unless a human explicitly reassigns.

## 7. Governed tool registry

The registry is consumer-agnostic. Gateway-side subagents and hosted MCP local tools get the same
task tools, filtered by identity and policy.

### 7.1 Doer tools

- `task.claim({ taskId })`
- `task.report_run_step({ taskId, summary, status, artifactRefs? })`
- `task.attach_evidence({ taskId, kind, artifactRef, summary, changeType? })`
- `task.comment({ taskId, body })`
- `task.reply({ taskId, commentId, body })`
- `task.request_review({ taskId, changeType, evidenceRefs, summary })`
- `task.update({ taskId, overview?, labels?, due?, watchers?, linkIssue?, linkPr? })`

`task.request_review` is hard-gated by Evidence rules. `task.update` cannot set lane Done, perform
Backlog->Todo, set review pass, set merge state, or alter assigned identity unless explicitly
authorized for a human/admin path.

### 7.2 Reviewer-only tools

Only the Lead Orchestrator identity may call:

- `review.record_check({ taskId, checkKind, evidenceRef?, result, summary })`
- `review.pass({ taskId, summary, checkRefs })`
- `review.request_changes({ taskId, note, checkRefs? })`

These tools are denied to doers by tool policy and application authorization. See
`docs/adr/ADR-005-tool-policy-security.md` and `docs/openclaw/gateway/config-tools.md`.

### 7.3 Never exposed to any agent

- `set Done`
- `merge`
- raw Git credential access
- raw CI secret access
- raw repo secret access
- direct DB writes
- direct OpenClaw admin config writes

Done is human-only. Merge is orchestrator-internal after human Done and CI-green.

### 7.4 Local poll read surface

Hosted MCP also exposes `list_my_open_items` for local-tool doers. It is a scoped read/queue tool,
not a transition command. It returns only items assigned to or queued for the named agent identity
bound to the token, plus the required next action and latest human comments.

## 8. Evidence gate and Quality Review

### 8.1 Declaration

Every doer must declare:

```ts
type ChangeType = "visual" | "non_visual";
```

### 8.2 Matching evidence

- `visual`: at least one screenshot artifact showing the changed UI/state.
- `non_visual`: at least one e2e/user-level test, smoke test, real-world test, mutation test, or
  deep-verification artifact.
- PRs can count as evidence only with CI/check status and test/screenshot artifacts attached.

### 8.3 Hard gate

`task.request_review` fails closed when:

- `change_type` is missing.
- visual work lacks screenshot proof.
- non-visual work lacks qualifying verification artifact.
- evidence artifact is missing, inaccessible, wrong tenant/workspace, or not linked to the task.
- the doer is not the assigned doer.

### 8.4 Orchestrator verification

Ask Admin Opzava must independently verify sufficiency/reality:

- Re-run tests or a targeted smoke where possible.
- Check screenshot against the stated visual outcome.
- Check PR diff, CI state, and linked issue claim.
- Record `review.record_check` rows for each verification step.
- Use `review.request_changes` with a required note when evidence is insufficient or behavior fails.

Review pass does not move Done. It only enables the human Done action.

## 9. Issue -> Task -> PR contract

### 9.1 Issue import

- GitHub issues can be imported as Tasks and curated in Backlog.
- Task displays a `#NN` chip for the primary issue.
- A Task has `0..1` primary issue.
- GitHub remains source of truth for issue number, title, labels, assignee, state, and updated time.
- Opzava owns Task, Backlog/Todo curation, execution, links, audit, divergence, and activity.

This follows the Issue projection and active-close posture in
`docs/plan/research/slice2.5-cc-mcp-live-card.md` and PRD-012's issue/admin-card projection
contract.

### 9.2 PRs

Code tasks:

- branch from `development`
- produce a PR
- link PR as `TaskPrLink`
- include `Closes #NN` when a primary issue exists
- attach PR, CI, test, screenshot, and review artifacts as Evidence

Net-new requirements:

- Add PR concept to the issue/provider port area. Today Slice 2.5 has `IssueTrackerPort`, not a PR
  port.
- Gateway-side subagents need a repo clone on the VPS.
- Gateway-side subagents need a governed git credential path to push branches and open PRs.
- No secrets may be embedded in source, docs, or task rows. Use the existing vault/config
  mechanism.

### 9.3 Done and merge

Human Done triggers:

1. Re-check review passed.
2. Re-check required evidence.
3. Re-check PR link if code task.
4. Re-check CI state.
5. If CI green: orchestrator-internal merge through a governed internal command.
6. If CI red/pending/unknown: Done is blocked, task stays in Review, `merge_state = blocked_ci_red`
   or `pending_ci`, and a human-visible comment/activity is written.
7. On merge: linked GitHub issue auto-closes by merge semantics through `Closes #NN`.

No direct agent tool exposes merge.

## 10. Hosted MCP

### 10.1 Service shape

- Promote the MCP server to a first-class compose service.
- Primary transport: hosted Streamable HTTP at `mcp.opzava.<domain>` behind Traefik on the VPS.
- Keep stdio as local fallback only.
- The same task/review registry powers hosted HTTP and stdio fallback.
- Do not duplicate tool logic per transport.

### 10.2 Auth

Use Slice 2.5 scoped/revocable/hashed link tokens:

- `Authorization: Bearer <token>`
- stored hashed only
- shown once
- scoped
- revocable
- expiry-bound
- membership-version and session-version bound
- issuing human RBAC/RLS rechecked on every request

Token resolves to:

- issuing human principal
- organization/workspace
- scopes
- client kind
- named agent identity
- via-client attribution

Named identity is bound at issuance in the UI. The client cannot declare it.

### 10.3 Client support proof

Remote HTTP MCP + bearer support for these clients must be runtime-verified before claiming support:

- `claude-code`
- `claude-desktop`
- `codex`

If a client cannot use hosted Streamable HTTP, use stdio fallback/proxy without changing authority or
duplicating tool logic.

## 11. Surfaces

### 11.1 Tasks board

- Lanes: Backlog, Todo, In Progress, Review, Done.
- `Blocked` renders as label/flag across lanes.
- Backlog has planning/curation affordances and no doer action.
- Todo shows ready/actionable, optional pre-assignment, and dispatcher state.
- In Progress shows assigned doer, AI Run live state, and latest run step.
- Review shows evidence status, Quality Review checks, orchestrator pass/request-changes, and human
  Done eligibility.
- Done shows merge result and linked issue closure state where applicable.

### 11.2 Card detail

- Overview: human-authored or agent-drafted overview, acceptance notes, labels, due date, watchers,
  issue/PR chips.
- Comments: human-readable summaries and replies to human comments/mentions. Not every raw tool call.
- AI Run: full step-by-step run trace with live elapsed ticker.
- Evidence/Files: screenshots, tests, deep-verification artifacts, PRs, CI links, provenance.
- Quality Review: orchestrator checks, pass/request changes, human Done gate state.
- Assigned to: named human or agent identity; AI badge for agent doers.

### 11.3 Comments and mentions

- Comments are product conversation, not raw transcript dump.
- `@mention` resolves server-side against authorized humans/agent identities.
- Gateway-side mention routes to push path.
- Local-tool mention queues for next poll.
- Assistant-authored comments must not trigger assistant loops unless a human explicitly asks.

## 12. Dispatcher worker

The dispatcher worker is the P1 AI-Workforce `AgentDispatch` loop pulled forward for platform dev.

Inputs:

- `TaskMovedToTodo`
- `TaskAssigned`
- `TaskMentioned`
- `TaskCommented`
- `TaskReviewRequested`
- `TaskChangesRequested`

Requirements:

- Consume ADR-004 outbox rows with idempotency.
- Use row locks / claim tokens / SKIP LOCKED pattern consistent with Slice 2.5 outbox hardening.
- Resolve tenant/workspace through application services, not payload trust.
- Respect Backlog/Todo/Review ownership rules.
- De-dupe repeated events by outbox id/idempotency key.
- Emit task activity, notifications, AI Run steps, and `AgentDispatch` projections.
- Surface `GatewayUnavailable`, `CircuitOpen`, `ScopeDenied`, `ProtocolMismatch`, `MissingRuntimeRef`,
  `PolicyDenied`, and `NoEligibleDoer` as normal states.

## 13. Runtime and repository execution

Gateway-side code doers are code-capable exceptions under ADR-005:

- They need a repo clone on the VPS.
- They need a safe git credential/vault path.
- They need branch creation from `development`.
- They need push and PR creation capability through governed commands, not raw exposed secrets.
- They need CI status read.
- They need no direct merge tool.

Tool policy must allow the minimum sessions/subagent and repo tools required for the doer identity,
while denying reviewer-only, Done, merge, raw secrets, and unneeded admin/config surfaces.

The orchestrator itself needs `sessions_spawn`, `sessions_yield`, and `subagents` allowed per
`docs/openclaw/concepts/session-tool.md` and Q16/Q17, but this is an audited expansion, not a broad
`full` profile.

## 14. Acceptance tests and verification

Do not accept the slice unless these pass:

- Migrating existing `blocked` lane data preserves blocked as a flag and no dispatcher sees an
  ambiguous task.
- Doer cannot move Backlog->Todo.
- Human can move Backlog->Todo.
- Doer can claim Todo and enter In Progress.
- Doer cannot request review without declared change type.
- Visual doer cannot request review without screenshot evidence.
- Non-visual doer cannot request review without qualifying verification evidence.
- Orchestrator can request changes with note; same doer remains assigned.
- Orchestrator pass keeps card in Review and does not auto-Done.
- Doer cannot call reviewer-only tools.
- Doer cannot set Done.
- Human Done blocked before review pass.
- Human Done blocked when CI red/pending/unknown for PR task.
- Human Done triggers merge only when review passed and CI green.
- Merge closes linked GitHub issue via `Closes #NN`; externally reopened issue shows divergence.
- Gateway-side task dispatch pushes through broker -> Ask Admin Opzava -> subagent.
- Local-tool task assignment appears in `list_my_open_items` and does not claim instant replies.
- Hosted MCP token attribution uses named identity from issuance, not client text.
- Revoked/expired/membership-version-changed token fails closed.
- PR evidence, screenshots, tests, and deep-verification artifacts render in Evidence/Files.
- AI Run tab shows ordered run steps and elapsed ticker.
- Comments remain human-readable summaries, not raw tool-call transcript spam.
- Projection rebuild from Task/Issue/PR/runtime refs reproduces board state without OpenClaw storage
  reads.

## 15. Build order

1. Data model: five lanes, blocked flag, agent identities, assignment, evidence, quality review,
   PR link.
2. Transition services and policy: ownership rules, hard gates, audit, Result errors.
3. Governed tool registry: doer tools, reviewer tools, deny exposed Done/merge.
4. Hosted MCP: Streamable HTTP service, bearer link tokens, named agent identity issuance, stdio
   fallback.
5. Dispatcher worker: outbox events, push path, poll queue path, `AgentDispatch`.
6. Gateway-side subagent execution: orchestrator `sessions_spawn`, repo clone, git credential path,
   PR creation.
7. Evidence gate and Quality Review automation: artifact checks, rerun/screenshot verification.
8. PR/CI merge path: CI read, human Done gate, orchestrator-internal merge, issue close/divergence.
9. UI: five-lane board, card detail tabs, assigned agent badge, live AI Run, Evidence/Files,
   Quality Review.
10. End-to-end acceptance and runtime MCP client compatibility proof.

## 16. Sad-path ledger

| Sad path | Required response |
| --- | --- |
| Doer tries to self-approve | Tool policy and app auth deny reviewer tools; audit denial. |
| Doer fabricates evidence metadata | Artifact lookup and orchestrator verification fail closed. |
| Visual change has stale/wrong screenshot | Orchestrator records failed check and requests changes. |
| Non-visual change has unit-only proof for user-visible behavior | Review rejects unless e2e/smoke/real-world/mutation/deep-verification suffices. |
| CI turns red after review pass | Human Done blocked; task stays Review. |
| GitHub close/merge fails | Done/merge path records failure, stays Review, shows divergence. |
| Local tool expected instant mention response | Queue for poll and render honest "waiting for local tool" state. |
| Gateway unavailable during dispatch | Dispatcher records degraded state; task remains Todo/Review as appropriate. |
| Token client lies about agent name | Ignore client name; use identity bound to token at issuance. |
| PR exists but issue not linked | PR still evidence; no `Closes #NN` unless primary issue exists. |
| OpenClaw runtime ref disappears | Mark `MissingRuntimeRef`; do not delete Task. |
| Dispatcher replay duplicates a subagent | Idempotency key/dispatch record collapses duplicate. |

## 17. Out of scope for this slice

- User-side Marketing pipeline.
- User-side CRM/support workflows.
- Broad department workflow engine beyond what dispatcher needs here.
- External customer sends.
- Billing or plan enforcement beyond existing platform constraints.
- Full ACP-hosted coding harness as product path.
- Arbitrary third-party issue trackers beyond the current port extension.
- Autonomous merge without human Done.
