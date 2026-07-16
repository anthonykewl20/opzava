# Dev Board foundation decisions

Status: **Locked foundation — approved through the 2026-07-16 Admin/capacity grilling session**

This is the canonical planning decision ledger for the Dev Board foundation. It records the
decisions that replace the stale “Tasks plus Issues” product direction. PRD-019 expresses the
user-facing requirements and ADR-017 expresses authority and execution architecture; this ledger
preserves the finer product and workflow choices used to create them.

This file describes target behavior. It does not claim that the Dev Board, migration,
synchronization, runner protocol, Sprints, Review, Docs mirror, or Releases workflow is already
implemented.

## 1. Canonical language and boundary

| ID      | Locked decision                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-001 | The product name is **Dev Board**. Do not rename it Tickets, Tasks, Issues, Workboard, or Project Board.                                                                        |
| DBF-002 | Dev Board is an **admin-only Opzava platform-development workspace** for building the Opzava platform. It is not a user-side project-management or CRM feature.                 |
| DBF-003 | **DevTicket** is the canonical unit of governed development work.                                                                                                               |
| DBF-004 | **Card** is the visual representation of a DevTicket, not a second aggregate.                                                                                                   |
| DBF-005 | **GitHub Issue** is the durable synchronized mirror of an accepted DevTicket and supplies the primary visible issue number and URL.                                             |
| DBF-006 | **Proposal** is an agent-discovered candidate before human acceptance. It is not a DevTicket and does not create GitHub history until accepted.                                 |
| DBF-007 | DevTicket is not generic Project Management `pm.Card`, the current generic `Task`, a GitHub Issue, OpenClaw `workboard.Card`, a support ticket, or Incident/ErrorGroup.         |
| DBF-008 | Current Tasks and Issues models, routes, tables, tools, tests, and docs are migration sources. The pivot is not a cosmetic rename.                                              |
| DBF-009 | V1 supports one production repository only: the Opzava repository. Multiple repository support is deferred. A fixed scratch repository may be used only as test infrastructure. |

## 2. Product objective and authority

| ID      | Locked decision                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-010 | Opzava is the primary day-to-day operating surface. A human must be able to plan, assign, supervise, review, approve, and inspect repository delivery without routinely opening GitHub.                                                           |
| DBF-011 | GitHub remains the durable secondary record and repository-native truth. Two-way synchronization prevents history from depending only on Opzava.                                                                                                  |
| DBF-012 | Opzava owns workflow lanes, transition gates, Ready contracts, assignments, dependencies, Sprint plans, approvals, and conflict resolution.                                                                                                       |
| DBF-013 | GitHub owns issue number/URL and repository-native pull request, commit, check, repository review, merge, tag, and release facts.                                                                                                                 |
| DBF-014 | OpenClaw owns its sessions, runs, tools, task/runtime state, and health facts. Those facts project into Dev Board but do not become DevTicket identity.                                                                                           |
| DBF-015 | An explicitly admitted Runner owns only its process, worktree, branch, command, and checkpoint observations; local Docker facts remain local-runner-owned. Opzava admits authenticated signed receipts and never accepts self-asserted authority. |
| DBF-016 | UI drag/drop, Slack buttons, GitHub labels, webhooks, local tools, the Lead Orchestrator, and AI agents all request the same Opzava application commands. None is an alternate gate implementation.                                               |
| DBF-017 | GitHub Actions may request an exception, but the DevTicket becomes **Needs Human Approval**. An Action cannot directly bypass a gate or forge Done.                                                                                               |

## 3. Board lifecycle

| ID      | Locked decision                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-018 | The Board has six lanes: **Backlog, Todo, Blocked, In Progress, Review, Done**.                                                                                                                                                                         |
| DBF-019 | Backlog is shaping and grilling only. Missing scope, sad paths, edge cases, acceptance, dependencies, E2E, behavior, human inputs, or approval keeps work in Backlog.                                                                                   |
| DBF-020 | Todo is the only available-work queue. Every Todo DevTicket has an approved Ready contract.                                                                                                                                                             |
| DBF-021 | Todo may be unassigned, but In Progress may not. A successful claim atomically assigns the claimant and acquires the execution lease.                                                                                                                   |
| DBF-022 | An ordinary, non-Sprint DevTicket never starts merely because it is in Todo. It moves to In Progress only after an explicit assignment/claim, such as the human asking a local tool to work on `GH #407` or an eligible agent deliberately claiming it. |
| DBF-023 | An Active Sprint is the only mode that continuously selects the next ordered Todo DevTicket under `autonomous_serial` rules.                                                                                                                            |
| DBF-024 | Blocked is a visible lane/state for work that cannot proceed. It requires reason, blocking category, responsible actor or dependency, last confirmed checkpoint, and notification state.                                                                |
| DBF-025 | Clearing Blocked returns the DevTicket to Todo for a fresh claim. It does not silently resume a stale assignment or runner lease.                                                                                                                       |
| DBF-026 | A Todo DevTicket with an incomplete dependency remains dependency-locked and cannot be claimed. It may remain visible in Todo with the lock rather than pretending work began.                                                                          |
| DBF-027 | In Progress means an assigned actor and admitted runner are actually working. Merely planning, waiting, or opening the Card is not In Progress.                                                                                                         |
| DBF-028 | Review is mandatory for every implementation. No direct In Progress-to-Done transition exists.                                                                                                                                                          |
| DBF-029 | Review changes-requested returns the DevTicket to Todo. It goes to the bottom by default and to the top when it blocks another DevTicket or the Active Sprint Goal.                                                                                     |
| DBF-030 | Done means the exact reviewed change has passed required approval and merged into `development`. Done does not mean deployed to staging or production.                                                                                                  |
| DBF-031 | Backlog-to-Todo opens Ready approval. Todo-to-In-Progress opens Assign & Start. Review and Done moves are system-controlled. Invalid drops snap back with a reason.                                                                                     |
| DBF-032 | Every pointer drag action has a keyboard and action-menu equivalent using the same commands and policy.                                                                                                                                                 |

## 4. Ready contract and revisions

| ID      | Locked decision                                                                                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-033 | Required Ready fields are clear outcome, bounded scope, sad paths, edge cases, acceptance criteria, dependency state, user-level E2E expectations, final behavioral contract, required human inputs, named secret references, Human Owner, Type, Work Areas, Priority, and Change Risk. |
| DBF-034 | A request to execute an incomplete Backlog item does not start work. The agent identifies the missing fields and tells the human that deep grilling/planning is required.                                                                                                               |
| DBF-035 | The human may choose **Approve -> Todo** or **Approve & Start** only after the Ready validator passes.                                                                                                                                                                                  |
| DBF-036 | Ready approval is bound to an exact contract version and content hash.                                                                                                                                                                                                                  |
| DBF-037 | Backlog contract content is freely editable and versioned.                                                                                                                                                                                                                              |
| DBF-038 | The approved contract is read-only in Todo. In Progress and Review changes use **Propose revision** with a field diff, reason, actor, and downstream effect.                                                                                                                            |
| DBF-039 | A material edit to an unclaimed Todo contract invalidates Ready and returns the DevTicket to Backlog.                                                                                                                                                                                   |
| DBF-040 | A material edit during In Progress pauses and checkpoints execution, invalidates the lease's contract authority, and requires reapproval.                                                                                                                                               |
| DBF-041 | A material edit during Review makes prior evidence stale and requires verification against the new contract.                                                                                                                                                                            |
| DBF-042 | Comments, typo fixes, display-only metadata, and other non-semantic changes do not invalidate Ready.                                                                                                                                                                                    |
| DBF-043 | Material approved-document revisions invalidate dependent Ready or Sprint approval when the referenced requirement changes.                                                                                                                                                             |

## 5. Dependencies and ordering

| ID      | Locked decision                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-044 | Dependencies are explicit directed edges with stable IDs and cycle prevention.                                                            |
| DBF-045 | If `GH #111` depends on `GH #110`, `#111` cannot start until `#110` is Done, including its independent Review and merge to `development`. |
| DBF-046 | Dependency status is part of Ready and Sprint preflight, not a hint shown only in the UI.                                                 |
| DBF-047 | A dependency change is material and invalidates the affected Ready/Sprint approval.                                                       |
| DBF-048 | Completed DevTickets retain historical dependency and Sprint links even after the active graph changes.                                   |

## 6. Roles, identities, and attribution

| ID      | Locked decision                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-049 | Every DevTicket has a required **Human Owner**.                                                                                                                                                                  |
| DBF-050 | A DevTicket has at most one current **Execution Assignee**. Todo may be unassigned; In Progress may not.                                                                                                         |
| DBF-051 | **Lead Orchestrator** is a coordination role separate from Human Owner and Execution Assignee. It cannot silently acquire their authority.                                                                       |
| DBF-052 | **Reviewer** is fresh and independent from the implementation actor. Its tool and model are configured in Admin.                                                                                                 |
| DBF-053 | **Runner** identifies where work executes. Local or orchestrator/cloud location is not the same thing as the agent identity.                                                                                     |
| DBF-054 | Human avatars are circular. AI agent avatars are visually distinct, such as square/bot-styled, and display agent identity even when work is local or orchestrated.                                               |
| DBF-055 | Every command, comment, worklog, Review, sync event, and GitHub App post records the real actor role, named identity, source surface, and runner where applicable.                                               |
| DBF-056 | Example attribution remains human-readable: `Human Owner · Anthony — via Slack Assistant`, `Execution Assignee · Codex CLI — via local-runner-01`, or `Lead Orchestrator · Ask Admin Opzava — via Opzava Cloud`. |

## 7. Engineering classification and policy

| ID      | Locked decision                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-057 | Required Type uses standard engineering terms: Feature, Bug, Improvement, Technical Task, Research/Spike, or Maintenance.                                                                            |
| DBF-058 | UI and Optimization are not Types. They are represented through Work Area and, where appropriate, Performance or another standard area.                                                              |
| DBF-059 | Work Area is multi-valued and initially includes UI/UX, Frontend, Backend/API, Data/Database, Infrastructure, GitHub Integration, Agent Runtime, Security, and Documentation.                        |
| DBF-060 | “Mainframe” becomes a Work Area only if it is intentionally established as an engineering domain; it is not added merely because the repository contains `mainframe/`.                               |
| DBF-061 | Priority uses P0–P3: P0 active critical production/security condition; P1 urgent or Sprint-blocking; P2 normal; P3 low. Priority orders work and does not grant approval.                            |
| DBF-062 | Severity uses S0–S3 and is required only where Bug impact or Incident projection needs it.                                                                                                           |
| DBF-063 | Change Risk uses Low, Medium, High, Critical and controls approval policy independently of Priority and Severity.                                                                                    |
| DBF-064 | Explicit policy computes a minimum Change Risk. Humans and agents may raise risk but cannot lower it below matched policy.                                                                           |
| DBF-065 | High and Critical Change Risk require human approval. Other actions may also require approval by policy.                                                                                             |
| DBF-066 | Suspected secret exposure and unhealthy or unverifiable GitHub integration are absolute unbypassable stops. All other admitted exceptions are labeled Needs Human Approval and remain version-bound. |

## 8. Incident boundary

| ID      | Locked decision                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-067 | Incident/ErrorGroup is not a DevTicket Type. It remains an operational aggregate owned by Notifications/Admin-Observability.              |
| DBF-068 | Incident lifecycle is `Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem`.                                        |
| DBF-069 | Dev Board may project an Incident into Summary, List, or attention UI, but it never persists the Incident as Sprint work.                 |
| DBF-070 | A permanent Incident fix is a linked Bug or Technical Task that enters Backlog and passes Ready, execution, Review, and Done normally.    |
| DBF-071 | P0/P1 Incident interruption of ordinary work uses governed pause/checkpoint/lease fencing; it does not authorize an unrecorded side task. |

## 9. Agent discoveries and Proposal flow

| ID      | Locked decision                                                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-072 | An agent-discovered issue first creates an Opzava Proposal rather than a GitHub Issue.                                                                                                                                                               |
| DBF-073 | The Proposal form includes discovery summary, evidence, blocking/non-blocking assessment, affected Goal/DevTickets, impact if ignored, suggested Type/Work Areas/Priority/Severity/Risk, proposed scope, dependencies, and requested human decision. |
| DBF-074 | The Proposal is self-contained in Opzava. The Admin and Personal Assistant do not need another tab to understand or decide it.                                                                                                                       |
| DBF-075 | The agent notifies the Lead Orchestrator. The Lead Orchestrator notifies Slack and clearly states whether the finding is blocking or non-blocking.                                                                                                   |
| DBF-076 | The human may accept to Backlog, merge into an existing DevTicket, reject, or archive. Acceptance creates/links the GitHub Issue and starts two-way synchronization.                                                                                 |
| DBF-077 | A blocking Proposal may pause affected Sprint progress while awaiting decision; it still does not become scope without an approved Plan revision.                                                                                                    |
| DBF-078 | An accepted non-blocking Proposal remains Backlog and does not silently join the Active Sprint.                                                                                                                                                      |

## 10. GitHub App, mirror, and health

| ID      | Locked decision                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DBF-079 | “Connect GitHub” lives under Add Integration and uses a GitHub App, not a human token pasted into a Card.                                                                                  |
| DBF-080 | Admin exposes GitHub health: authentication, repository access, required permissions, webhook signature/delivery freshness, rate limits, outbox lag, replay lag, and reconciliation state. |
| DBF-081 | Every accepted DevTicket has one primary GitHub Issue in the Opzava repository. The issue number is the primary visible ID.                                                                |
| DBF-082 | A GitHub Issue body contains a human-editable summary/context region and a deterministic managed `Opzava Work Contract vN` block.                                                          |
| DBF-083 | Editing the managed block in GitHub creates a proposed revision. It never silently replaces the approved contract.                                                                         |
| DBF-084 | Managed namespaced labels represent Type, Priority, Change Risk, optional Severity, Work Areas, workflow status, and Sprint. Existing repository labels are not deleted or repurposed.     |
| DBF-085 | A GitHub status-label change is a transition request and must pass the same Opzava gate as UI, Slack, or agent commands.                                                                   |
| DBF-086 | GitHub Project is not required in v1. Namespaced labels, Milestones, issues, PRs, checks, and tracking issues are sufficient.                                                              |
| DBF-087 | Human comments synchronize one-to-one in both directions.                                                                                                                                  |
| DBF-088 | Agent worklogs append one immutable GitHub comment for each meaningful milestone, pause, failure, handoff, and completion—not each tool call or token.                                     |
| DBF-089 | Review appends a structured evidence summary with contract version, locked SHA, checks, verdict, and artifact refs.                                                                        |
| DBF-090 | Live elapsed time, token stream, raw tool calls, and noisy execution telemetry stay in Opzava's Agent Execution view.                                                                      |
| DBF-091 | Corrections append a new record and refer to the superseded record. Relied-upon history is not rewritten.                                                                                  |
| DBF-092 | GitHub App posts explicitly identify the actual human or agent and source even though the provider account is the App bot.                                                                 |
| DBF-093 | PR, CI, repository review, commit, merge, and branch facts appear on the Card and in Development so the Admin need not routinely open GitHub.                                              |
| DBF-094 | Agent-generated merge conflicts are assigned to agents for isolated resolution and full re-verification.                                                                                   |

## 11. Synchronization, conflicts, and ordering

| ID      | Locked decision                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-095 | Two-way synchronization is deterministic application code and webhooks. It does not consume model tokens.                                                   |
| DBF-096 | Per-aggregate monotonic versions order Opzava changes. GitHub delivery IDs and Opzava event IDs deduplicate provider and application retries.               |
| DBF-097 | There is no global order across Opzava, GitHub, Slack, OpenClaw, and local runners. A missing sequence or inconsistent snapshot triggers reconciliation.    |
| DBF-098 | Comments and worklogs append. Concurrent edits to different shared fields auto-merge. Concurrent edits to the same governed field create a Sync Conflict.   |
| DBF-099 | Contract, dependency, assignment, approval, and Sprint conflicts pause affected execution. Harmless display metadata conflicts do not block unrelated work. |
| DBF-100 | Human Owner resolves governed conflicts in Opzava. The chosen value mirrors to GitHub with audit; there is no blanket last-write-wins.                      |
| DBF-101 | Retryable outbound writes live in a durable outbox with claim, attempt, backoff, confirmation, and last-error state.                                        |
| DBF-102 | GitHub downtime leaves last confirmed Opzava data readable. Any gate that requires confirmed GitHub history waits for successful sync/reconciliation.       |

## 12. Local machine enrollment and execution

| ID      | Locked decision                                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-103 | Admin includes a Local Machines setup page for enrollment, authorization, key lifecycle, status, Docker readiness, supported capabilities, and tool selection.                                                                                                    |
| DBF-104 | Supported tool choices are explicit: Codex Desktop, Codex CLI, and Claude Code. The selector must not assume a desktop app exists on Linux or another unsupported platform.                                                                                       |
| DBF-105 | Local and orchestrator/cloud execution are explicit runner choices. A Sprint or DevTicket binds to its admitted runner rather than switching implicitly.                                                                                                          |
| DBF-106 | Every execution uses a separate git branch and worktree. This is required even while v1 implementation concurrency is conservative.                                                                                                                               |
| DBF-107 | Runner trust requires an enrolled non-revoked local machine key or explicitly admitted cloud service identity, active fenced lease, one-time command nonce, monotonic receipt sequence, exact contract version/hash, and repository/worktree/branch/SHA identity. |
| DBF-108 | Heartbeats establish liveness only. Signed receipts and checkpoints establish accepted execution facts.                                                                                                                                                           |
| DBF-109 | Checkpoints include last confirmed command state, process state, worktree/branch/HEAD/dirty summary, Docker state, evidence refs, and sync state.                                                                                                                 |
| DBF-110 | Local disconnect fences the lease, revokes any preview tunnel, preserves the checkpoint, marks `Blocked — Connection Lost / Execution Unknown`, and creates a Slack continuation summary.                                                                         |
| DBF-111 | There is no automatic cloud failover after a local disconnect because it would create competing execution histories and merge conflicts.                                                                                                                          |
| DBF-112 | Reconnect reconciles lease, process, worktree, branch, SHA, dirty state, Docker, GitHub, command nonce, and receipt sequence before resume. It never blindly restarts.                                                                                            |
| DBF-113 | If execution was deliberately started on an orchestrator/cloud runner, that choice is recorded from the beginning. It does not eliminate the local-only Review requirement.                                                                                       |

## 13. Personal Assistant, Slack, and human approval

| ID      | Locked decision                                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-114 | The admin-facing assistant is **Personal Assistant / Ask Admin Opzava** and uses Slack for v1 away-from-machine interaction, not WhatsApp.                                                      |
| DBF-115 | V1 is Admin-only. Modular RBAC for other roles is future work.                                                                                                                                  |
| DBF-116 | Slack notifies on approvals, blocking/non-blocking Proposals, runner disconnect, GitHub health, Review WIP, Review failures, required human inputs, and paused Sprints.                         |
| DBF-117 | A Slack approval is bound to enrolled Admin identity, exact target and version/hash, one-time nonce, action, expiry, and audit. Replays, stale versions, expiry, and role revocation fail.      |
| DBF-118 | Ordinary version-bound workflow approvals may complete in Slack. Machine enrollment, raw secret entry, security policy changes, and GitHub trust/permission changes require Opzava's secure UI. |
| DBF-119 | Slack contains concise evidence and deep links, but the self-contained evidence package lives on the Card.                                                                                      |
| DBF-120 | Slack never carries raw secret values. A response that supplies a credential routes the Admin to a secure input bound to a named secret reference.                                              |

## 14. Secrets and human inputs

| ID      | Locked decision                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-121 | Human-required inputs are identified during Backlog shaping and resolved before Todo wherever predictable.                                                                                                          |
| DBF-122 | The DevTicket stores a named secret reference, purpose, scope, readiness, owner, and health; the Card displays them but never the secret value.                                                                     |
| DBF-123 | Values remain in a local keyring or approved vault and are resolved only under the active actor, runner lease, and policy.                                                                                          |
| DBF-124 | Raw secret values never appear in Card fields, GitHub issues/comments, Slack, Docs, worklogs, evidence, preview URLs, logs, exports, or audit payloads.                                                             |
| DBF-125 | Secret exposure is an absolute stop: pause execution, fence relevant leases, revoke preview and credentials where applicable, notify the Admin, and begin contained redaction/rotation. It cannot be approved away. |

## 15. Review foundation and local Docker

| ID      | Locked decision                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-126 | Every DevTicket passes independent Review. The implementation agent cannot be its Reviewer.                                                                                                 |
| DBF-127 | Admin configures which local agent tool and model performs Review. Reviewer execution is local-only.                                                                                        |
| DBF-128 | Review always validates against the user's shared local Docker stack because it is the closest development environment to Dokploy.                                                          |
| DBF-129 | Review is bound to exact Ready contract version and commit SHA and checks required sad paths, edge cases, acceptance, behavioral contract, and user-level E2E behavior.                     |
| DBF-130 | The Card contains the full evidence package. Personal Assistant only notifies and carries bounded decisions.                                                                                |
| DBF-131 | An authenticated expiring tunnel may expose the exact local Docker preview to the Admin while away. It is not a permanent public development environment.                                   |
| DBF-132 | Tunnel authorization is bound to Admin identity, runner lease, DevTicket, Review, build/SHA, and expiry and is revoked on disconnect, lease loss, expiry, security stop, or explicit close. |
| DBF-133 | Passing Review leads to PR/merge into `development` under approval policy. It never deploys staging or production.                                                                          |
| DBF-134 | The exact adversarial Reviewer workflow, complete check catalog, escalation, and merge choreography require a separate deep grilling. Until then, Done fails closed.                        |

## 16. Sprint model

| ID      | Locked decision                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-135 | A Sprint is a clear Goal plus versioned ordered Plan for autonomous serial work. It is not a lane and not every DevTicket belongs to one.                                                                                       |
| DBF-136 | Ordinary work remains manual claim-on-command or deliberate pickup. Sprint work alone continuously selects the next ordered Todo DevTicket.                                                                                     |
| DBF-137 | Allow any number of Draft Sprints, at most one Approved and Queued Sprint, and at most one Active Sprint. Drafts hold no execution lease.                                                                                       |
| DBF-138 | A DevTicket belongs to at most one non-archived Sprint at a time. Moving it between Drafts revises both Plans; moving Active scope requires approval.                                                                           |
| DBF-139 | A Sprint's approved snapshot includes Goal version, Plan version, ordered membership, each contract version/hash, dependency graph, risk/approval state, selected runner and Reviewer policy, and named-secret readiness.       |
| DBF-140 | Material Goal, scope, order, contract, dependency, risk, approval, runner-policy, Reviewer-policy, or required-secret changes produce **Needs Re-approval** and disable auto-start.                                             |
| DBF-141 | Temporary GitHub, runner, Reviewer, Docker, or secret-reference health failures do not erase approval. The Sprint stays Queued and activation waits.                                                                            |
| DBF-142 | Auto-start preflight requires approved Goal/Plan, every member Ready, external dependencies Done, GitHub healthy/synchronized, runner/Reviewer online, local Docker healthy, named secret refs available, an available Sprint lease under the selected Runner preset, and no absolute stop.                        |
| DBF-143 | The Active Sprint permits at most one Sprint implementation DevTicket In Progress. Once its checkpoint/receipt is accepted and it enters Review, its implementation lease is released and the next ordered Todo item may be admitted under the Runner preset. Ordinary capacity never admits a second Sprint item. |
| DBF-144 | Review WIP limit is three and is separate from implementation and reviewer execution capacity. At three, no new implementation work is claimed and Slack notifies the Admin; already admitted leases are not killed.                                                                                               |
| DBF-145 | A blocking accepted discovery proposes a Plan revision with reason, insertion position, affected dependencies, and impact on Goal. It joins only after human approval.                                                          |
| DBF-146 | An accepted non-blocking discovery stays in Backlog. Removing, deferring, or reordering an Active member also requires Plan revision and rationale.                                                                             |
| DBF-147 | A local-runner disconnect pauses the Active Sprint, checkpoints work, and notifies Slack. It does not automatically fail over.                                                                                                  |
| DBF-148 | Sprint mirrors to one GitHub Milestone and a managed tracking issue containing Goal, order, current Plan, revisions, pauses, discoveries, and final report.                                                                     |
| DBF-149 | The tracking issue/Milestone closes only after all work remaining in the approved Plan is Done.                                                                                                                                 |
| DBF-150 | Sprint history preserves Completed, Cancelled, and Aborted outcomes, final Plan, reasons, unfinished scope, interruptions, dates, Docs snapshots, GitHub refs, and audit. Paused remains Active.                                |

## 17. Views and selected UX

| ID      | Locked decision                                                                                                                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-151 | Top-level Dev Board views are `Summary · List · Board · Sprints · Docs · Development · Releases`.                                                                                                                                                                                   |
| DBF-152 | Jira informs information architecture and reading flow only. Opzava does not copy Jira styling or implementation.                                                                                                                                                                   |
| DBF-153 | Summary leads with **What needs me**, then **What's happening**, then **Recent changes**. Approvals, blockers, incidents, sync conflicts, integration health, offline runners, Active Sprint Goal, implementation, Review WIP, and delivery changes appear before optional metrics. |
| DBF-154 | List is one canonical DevTicket table grouped by Work Area by default. It can regroup by Type, Sprint, lane, Human Owner, or Execution Assignee.                                                                                                                                    |
| DBF-155 | Saved List views include All Work, Active Sprint, Unscheduled Work, Bugs, Incidents (projection), Blocked, Needs Human Approval, and My Work.                                                                                                                                       |
| DBF-156 | List columns include ID, Type, title, Work Areas, Priority, Severity, Change Risk, lane, Sprint, Human Owner, Execution Assignee, dependencies, Review/CI, GitHub sync, and updated time.                                                                                           |
| DBF-157 | Board uses approved prototype Variant B, “Agent Command Center,” with high-density cards and compact collapsible Backlog.                                                                                                                                                           |
| DBF-158 | Card detail uses approved prototype Variant A, Jira Workspace, with top-to-bottom reading flow and simple click-to-preview rather than forcing side-to-side scanning.                                                                                                               |
| DBF-159 | Card Activity tabs are Comments, History, Worklog, Agent Execution, and Review Evidence. Details expose roles, taxonomy, dependencies, CI, PR, Review, Docker, approval, merge, and sync.                                                                                           |
| DBF-160 | Sprints uses approved prototype Variant A, a dedicated Sprints view with native Sprint history. Sprint does not appear as a second Board below ordinary lanes.                                                                                                                      |
| DBF-161 | Development aggregates the single repo's PRs, merge readiness, branches/worktrees, CI/logs, `development` branch health, GitHub sync/webhooks, runner/Reviewer health, local Docker/preview, and security/dependency alerts.                                                        |
| DBF-162 | Releases is separate from Development and Done. Target high-level states are Candidate, Staging, Staging Approved, Production Ready, and Released; detailed mechanics are deferred.                                                                                                 |
| DBF-163 | Dev Board follows the global light/dark theme. There is no per-Card theme selector.                                                                                                                                                                                                 |

## 18. Docs and planning history

| ID      | Locked decision                                                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-164 | Docs is a first-class Dev Board view. It holds PRDs, planning, research, RFC/design specs, ADRs, runbooks, postmortems, Sprint Plans, and Sprint Reports.                                                                         |
| DBF-165 | Opzava is the primary authoring/reading surface. Every document mirrors as deterministic human-readable Markdown in the GitHub repository without model tokens.                                                                   |
| DBF-166 | Every document has immutable ID, version, content hash, state, type, relations, and GitHub path. GitHub edits synchronize back or create a conflict; there is no last-write-wins.                                                 |
| DBF-167 | A document may relate to multiple Sprints, DevTickets, Incidents, and Work Areas by metadata without copying content.                                                                                                             |
| DBF-168 | Grilling produces both a Planning Session Log and a synthesized final Planning Brief/PRD.                                                                                                                                         |
| DBF-169 | Planning Session Log records each question, recommendation, human decision, rejected alternative, unresolved item, participant, and timestamp. It excludes hidden model reasoning, raw tool output, secrets, and noisy telemetry. |
| DBF-170 | Document lifecycle is Draft, In Review, Approved, Superseded, Archived. Approved versions are immutable; changes create a new Draft revision.                                                                                     |
| DBF-171 | PRD, RFC, ADR, Sprint Plan, and Runbook require Human Owner approval. Research Notes and Planning Logs may publish without that approval but remain versioned.                                                                    |
| DBF-172 | Final Sprint docs are immutable snapshots. Corrections create a new version rather than rewriting the final report.                                                                                                               |

## 19. Four ledgers

| ID      | Locked decision                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-173 | The **planning decision ledger** records questions, recommendations, human decisions, rejected alternatives, unresolved items, contract/Plan revisions, and document versions.                                        |
| DBF-174 | The **Dev Board activity/history ledger** records accepted product commands, transitions, assignments, dependencies, approvals, comments, Review verdicts, and Done facts.                                            |
| DBF-175 | The **runner execution/checkpoint ledger** records leases, fences, nonces, signed receipts, sequences, heartbeats, commands, worktree/branch/SHA, Docker state, checkpoints, and reconciliation.                      |
| DBF-176 | The **synchronization/outbox/conflict ledger** records webhook deliveries, event dedupe, outbound attempts, provider confirmations, health, reconciliation, and conflict decisions.                                   |
| DBF-177 | Ledgers cross-link by stable IDs but do not share a fictional global order or identical retention. Narrative planning, accepted business facts, runner telemetry, and integration recovery remain separately legible. |

## 20. Archive, retention, and exceptional removal

| ID      | Locked decision                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-178 | Archive is the normal reversible removal path for Proposals, DevTickets, Sprints, and Docs.                                                                                                                               |
| DBF-179 | Approved contracts, comments/worklogs, Sprint history, approvals, conflict decisions, and Review evidence relied on for Done remain durable.                                                                              |
| DBF-180 | Raw logs, token/tool telemetry, temporary previews, and large transient artifacts use configurable retention and may expire without erasing durable summaries.                                                            |
| DBF-181 | Legal or secret-exposure removal coordinates redaction in Opzava and GitHub, revokes affected secrets/tunnels/leases, and leaves a non-sensitive audit tombstone. It does not rewrite history to imply no event occurred. |

## 21. Migration and stale-context cleanup

| ID      | Locked decision                                                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-182 | Migration uses expand-contract. Preserve current Task IDs, card numbers, GitHub links, comments, steps, watchers, evidence, quality records, activity, and timestamps.                                                        |
| DBF-183 | Existing task card numbers remain historical aliases; GitHub issue number becomes the primary visible ID for accepted DevTickets.                                                                                             |
| DBF-184 | Dual-read exists only during migration to compare legacy and Dev Board projections. It is not an enduring two-authority architecture.                                                                                         |
| DBF-185 | `/tasks` and `/issues` redirect to `/dev-board` only after verified data, behavior, and link cutover. Then retire legacy writes, routes, tools, tables, and stale active guidance.                                            |
| DBF-186 | Old docs, issues, and worklogs are not deleted simply because they are stale. They are classified, superseded, frozen, or migrated with explicit pointers.                                                                    |
| DBF-187 | Tracker issues #147–#157 are superseded/quarantined many-to-many. Do not implement them verbatim and do not invent replacement issue numbers before decomposition.                                                            |
| DBF-188 | Tracker issue #215 is the capture bridge from this grilling session. #210, #216, #218, #219, and #220 remain active dependent Ask Admin planning work and must consume the canonical Dev Board terms.                         |
| DBF-189 | ADR/PRD pointer issues #91, #95, #100, #104, #105, #107, #108, #109, #114, and #115 remain historical/active pointers whose conflicting Tasks/Issues guidance is amended by PRD-019 and ADR-017, not silently rewritten away. |

## 22. Foundation closure decisions

The final seven foundation questions were pre-approved by the user using the recommendations below.

| ID      | Locked decision                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBF-190 | Approved/Queued Sprint approval is version-bound. Material Goal, Plan, membership/order, contract, dependency, risk, approval, runner/Reviewer policy, or named-secret requirement changes produce Needs Re-approval. Temporary liveness failures only block activation.                                                              |
| DBF-191 | Capacity is per enrolled Runner, not organization-global. Every implementation lease is fenced and bound to the exact DevTicket contract/version, Runner, worktree, branch, and SHA. The Active Sprint may reserve at most one serial Sprint lease; it never owns the whole Runner and never gains a second Sprint lease.                 |
| DBF-192 | Runner disconnect produces `Blocked — Connection Lost / Execution Unknown`, preserves the checkpoint, fences authority, revokes preview, and reconciles before resume. No blind restart or automatic cloud failover.                                                                                                                  |
| DBF-193 | Slack workflow approvals require enrolled Admin identity, one-time nonce, exact version/hash, expiry, and audit. Secrets, machine enrollment, and security/integration trust changes stay in secure Opzava UI.                                                                                                                        |
| DBF-194 | GitHub health is capability-based. Retryable writes use the durable outbox; gates requiring confirmed GitHub history wait through synchronization and reconciliation.                                                                                                                                                                 |
| DBF-195 | Archive is the reversible default. Durable contracts/worklogs/Sprint/approval/evidence history remains; raw logs use retention; exceptional redaction is coordinated and leaves a tombstone.                                                                                                                                          |
| DBF-196 | The final edge audit covers readiness invalidation, leases, dependencies, discoveries, Review rework, Incidents, Slack authorization, Docs revisions, GitHub recovery, runner reconnect, Sprint completion/cancellation, and history. Failures block only affected capabilities unless an absolute stop requires broader containment. |
| DBF-197 | Runner presets are **Focused**, **Balanced**, and **Custom**. Balanced is the default. Admission, settings changes, pause/preemption, and recovery are authorized Dev Board commands with durable audit.                                                                                                                                  |
| DBF-198 | Focused permits one total implementation lease. Contention queues new work without killing the admitted lease; starting or reprioritizing different work requires the governed checkpoint/pause/preemption path. P0 uses the same boundary and cannot silently preempt.                                                                   |
| DBF-199 | Balanced permits two total implementation leases. With an Active Sprint, at most one lease is reserved for its serial Sprint DevTicket and at most one is ordinary.                                                                                                                                                                       |
| DBF-200 | An ordinary admission requires a Ready non-Sprint DevTicket, explicit governed claim, no unresolved dependency or exclusive-resource conflict, and a separate branch/worktree. Declared scope collision is a warning and coordination signal, not a guarantee of disjoint files; merge conflicts remain agent-remediated and revalidated. |
| DBF-201 | With no Active Sprint, Balanced may admit up to two ordinary DevTickets. Activating a Sprint while both run kills neither; Sprint waits for capacity until one finishes or a human/authorized assistant approves checkpoint/pause. Once Active, no second ordinary lease is admitted.                                                     |
| DBF-202 | Custom is available only inside the Runner-advertised and platform-policy-approved safe range. Missing, stale, or invalid capability data makes it unavailable. With an Active Sprint, it still reserves at most one serial Sprint lease and treats every other admitted lease as ordinary.                                               |
| DBF-203 | Lowering Runner capacity never kills an admitted lease. New admissions remain blocked until usage is within the new limit.                                                                                                                                                                                                                |
| DBF-204 | Exactly one Active Sprint remains the global Sprint invariant. Sprint automation never borrows ordinary capacity to run a second Sprint DevTicket, regardless of preset.                                                                                                                                                                  |
| DBF-205 | Entering Review releases the implementation lease only after the checkpoint/receipt is accepted. Reviewer execution capacity and Review WIP three are independent resources.                                                                                                                                                              |
| DBF-206 | Shared local Docker Review has one exclusive fenced lease. Work that uses or mutates the stack, or would invalidate its locked-SHA evidence, queues behind it; unrelated coding may continue. Review evidence stays bound to exact contract version and SHA.                                                                              |
| DBF-207 | Disconnect makes affected execution unknown and fenced until reconciliation; there is no automatic local-to-cloud failover. PRD-020 Admin Overview may project capacity and waiting state but owns no admission, preset, lease, Sprint, or Review authority.                                                                              |

## 23. Visual decision references

- Board Variant B — `prototype/dev-board-v1` commit `27aa4660`.
- Card detail Variant A — `prototype/dev-board-v1` commit `a4ecf553`.
- Sprints Variant A with Sprint history — `prototype/dev-board-v1` commit `8ebfecf5`.
- These are throwaway planning prototypes and not production implementation.

## 24. Deliberately deferred decisions

- Deep adversarial Review Gate internals, final check catalog, reviewer escalation, change-request
  loop details, and exact PR/merge approval choreography.
- Releases candidate composition, staging promotion, staging approval, production readiness,
  production deployment, rollback, tag/release rules, and live incident linkage.
- Multiple production repositories and cross-repository dependency/Sprint behavior.
- Modular non-Admin RBAC for Personal Assistant and Dev Board.
- A second Active Sprint or parallel implementation of multiple DevTickets from the Active Sprint.
  The locked Runner presets allow bounded ordinary parallelism but preserve one serial Sprint item
  and Review WIP three.

Until the first two deferred workflows are specified and implemented, the system fails closed: no
Done without independent Review and no inference that Done means staged or released.
