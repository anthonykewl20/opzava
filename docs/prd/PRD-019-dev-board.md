# PRD-019: Dev Board — governed Opzava platform-development workspace

## Problem Statement

Opzava platform development is currently split across an internal Tasks board and a separate GitHub
Issues page. The current `Task` model is a generic four-state work record, GitHub issues are
projections beside it, and runtime execution is surfaced through task-specific tools and activity
views. A human administrator therefore has to reconstruct one piece of work from multiple screens,
infer whether Opzava or GitHub is authoritative for each field, and leave Opzava to inspect pull
requests, checks, reviews, merge state, and durable agent work history.

That split no longer matches the product direction. Opzava is meant to be the primary place where
the administrator plans, assigns, supervises, reviews, and completes work on the Opzava repository.
GitHub must remain a durable synchronized record, but it must not force the administrator to juggle
two operating surfaces. AI agents also need a precise, machine-enforceable contract: incomplete
ideas must not become executable work; execution must be attributed to an enrolled identity and
runner; dependencies and approvals must fail closed; and no card may be declared Done before
independent review and merge into `development`.

The existing language also conflates materially different concepts. A Dev Board `DevTicket` is not a
generic Project Management `pm.Card`, a current `Task`, a GitHub Issue, an OpenClaw
`workboard.Card`, or an operational `Incident`/`ErrorGroup`. Keeping those identities blurred would
make migration unsafe, let runtime state become product truth, and perpetuate the stale Tasks/Issues
architecture under a new label.

## Solution

Create a dedicated admin-only **Dev Board** bounded context for developing the Opzava platform. Its
canonical work unit is a **DevTicket**; a **Card** is only the visual representation of that
DevTicket. Opzava owns the workflow, approved work contract, assignments, dependencies, Sprint
plans, approvals, and conflict decisions. A synchronized GitHub Issue is the durable secondary
mirror and supplies the visible issue number and URL. GitHub remains authoritative for
repository-native pull request, commit, check, review, and merge facts. OpenClaw and enrolled local
runners remain authoritative only for their own runtime facts.

The main Board has six guarded lanes: `Backlog`, `Todo`, `Blocked`, `In Progress`, `Review`, and
`Done`. Backlog is for shaping and grilling. Todo contains only work whose versioned Ready contract
is complete and approved. Starting work is an atomic assignment-and-claim operation. Blocked records
a real inability to proceed and returns to Todo after resolution rather than silently resuming.
Review is mandatory and independent. Done means the reviewed change has been merged into
`development`; staging and production belong to a separate Releases workflow.

The Dev Board is the administrator's complete operating surface for one Opzava repository in v1. It
includes GitHub synchronization and health, repository delivery facts, human and AI attribution,
local machine enrollment, local tool selection, governed Slack Personal Assistant approvals, named
secret references, local Docker review evidence and preview access, goal-driven autonomous serial
Sprints, versioned Docs, immutable histories, and migration from the current Tasks and Issues
implementations without losing identifiers, comments, evidence, or worklogs.

## User Stories

1. As an Opzava administrator, I want one Dev Board for internal work and GitHub issues, so that I
   do not juggle between Opzava and GitHub.
2. As an Opzava administrator, I want every accepted DevTicket mirrored to GitHub, so that a durable
   repository-adjacent record remains available outside Opzava.
3. As an Opzava administrator, I want the GitHub issue number to be the primary visible ticket
   identifier, so that conversations use one recognizable reference.
4. As an Opzava administrator, I want an unsynchronized internal UUID to remain hidden, so that
   implementation identity does not clutter the operating surface.
5. As an Opzava administrator, I want agent discoveries to begin as Proposals rather than GitHub
   issues, so that speculative findings do not pollute repository history.
6. As an Opzava administrator, I want to accept, merge, reject, or archive a Proposal, so that I
   control what becomes durable work.
7. As an Opzava administrator, I want accepting a Proposal to create or link its GitHub Issue, so
   that accepted work immediately enters the synchronized record.
8. As an Opzava administrator, I want the Board to show Backlog, Todo, Blocked, In Progress, Review,
   and Done, so that the development lifecycle is visible at a glance.
9. As an Opzava administrator, I want Backlog reserved for shaping and grilling, so that incomplete
   work cannot be accidentally executed.
10. As an Opzava administrator, I want Todo reserved for Ready DevTickets, so that every available
    ticket is safe to claim.
11. As an execution agent, I want to see only Ready Todo work as claimable, so that I do not infer
    missing requirements while coding.
12. As an execution agent, I want assignment and claim to occur atomically, so that two agents
    cannot start the same DevTicket.
13. As an Opzava administrator, I want Todo DevTickets to be optionally preassigned, so that I can
    reserve work for a specific tool or agent.
14. As an execution agent, I want an unassigned Todo DevTicket to become assigned to me during a
    successful claim, so that In Progress never lacks an assignee.
15. As an Opzava administrator, I want a DevTicket moved to In Progress only when work actually
    begins, so that lane state reflects reality.
16. As an Opzava administrator, I want a genuinely stalled active DevTicket moved to Blocked with a
    reason and evidence, so that stalled work is visible.
17. As an execution agent, I want a resolved Blocked DevTicket returned to Todo for a fresh claim,
    so that work does not resume under a stale lease.
18. As an Opzava administrator, I want every implementation to pass through Review, so that no agent
    can self-declare completion.
19. As an Opzava administrator, I want Done to mean reviewed and merged into `development`, so that
    Board completion has one behavioral meaning.
20. As a release manager, I want staging and production excluded from Done, so that code completion
    and release promotion are not conflated.
21. As an Opzava administrator, I want drag-and-drop transitions to invoke the same guarded commands
    as menus and keyboard actions, so that visual movement cannot bypass policy.
22. As a keyboard user, I want every drag action to have a keyboard and action-menu equivalent, so
    that the Board is operable without a pointer.
23. As an Opzava administrator, I want invalid drops to snap back with a precise explanation, so
    that failures are understandable rather than silent.
24. As an Opzava administrator, I want a Backlog-to-Todo move to open the Ready approval, so that
    promotion is deliberate and version-bound.
25. As an Opzava administrator, I want a Todo-to-In-Progress move to open Assign & Start, so that
    assignment and execution location are explicit.
26. As an Opzava administrator, I want Review and Done transitions system-controlled, so that
    cosmetic lane movement cannot forge verification or merge.
27. As an Opzava administrator, I want every DevTicket to have a clear outcome, so that the result
    can be judged rather than guessed.
28. As an Opzava administrator, I want every DevTicket to have bounded scope, so that an agent
    cannot expand the task indefinitely.
29. As an Opzava administrator, I want every DevTicket to list sad paths, so that expected failures
    are designed before implementation.
30. As an Opzava administrator, I want every DevTicket to list edge cases, so that uncommon but
    important behavior is not deferred accidentally.
31. As an Opzava administrator, I want every DevTicket to have measurable acceptance criteria, so
    that completion is falsifiable.
32. As an Opzava administrator, I want every DevTicket's dependency state declared, so that unsafe
    starts are blocked.
33. As an Opzava administrator, I want every DevTicket to state user-level end-to-end verification
    expectations, so that tests prove behavior users can observe.
34. As an Opzava administrator, I want every DevTicket to contain a final behavioral contract, so
    that implementation and Review share the same definition of correct.
35. As an Opzava administrator, I want required human inputs and named secret references resolved
    before Todo, so that execution does not stop for predictable omissions.
36. As an Opzava administrator, I want a mandatory Human Owner on every DevTicket, so that
    accountability never belongs only to an agent.
37. As an execution agent, I want an incomplete Backlog request to trigger a grilling-needed
    response rather than execution, so that I do not invent policy.
38. As an Opzava administrator, I want Approve and Approve & Start options when a contract is Ready,
    so that I can queue or immediately begin work deliberately.
39. As an Opzava administrator, I want Ready approval bound to an exact contract version and hash,
    so that later edits cannot inherit stale approval.
40. As an Opzava administrator, I want material changes to an unclaimed Todo contract to return it
    to Backlog, so that it is reshaped and reapproved.
41. As an execution agent, I want a material contract change during In Progress to pause and
    checkpoint the run, so that I do not continue against superseded instructions.
42. As a Reviewer, I want a material contract change during Review to invalidate existing evidence,
    so that I verify the current behavior rather than an old version.
43. As an Opzava administrator, I want typo fixes and non-semantic comments not to invalidate
    approval, so that harmless edits do not create churn.
44. As an Opzava administrator, I want Backlog content freely editable, so that planning remains
    fluid before approval.
45. As an execution agent, I want the approved Todo contract read-only, so that the target cannot
    drift silently.
46. As an execution agent, I want to propose a governed revision with a diff and reason, so that
    newly discovered requirements can be considered transparently.
47. As an Opzava administrator, I want dependency links to identify blocking and dependent
    DevTickets, so that execution order is enforced.
48. As an execution agent, I want a dependent DevTicket prevented from starting until every required
    dependency is Done, so that incomplete foundations are not assumed.
49. As an Opzava administrator, I want Review changes-requested work returned to Todo, so that it
    re-enters an executable queue with a fresh claim.
50. As an Opzava administrator, I want ordinary Review rework placed at the bottom of Todo, so that
    it does not starve planned work.
51. As an Opzava administrator, I want blocking or dependency-critical Review rework placed at the
    top of Todo, so that it unblocks downstream work quickly.
52. As an Opzava administrator, I want a required Type selected from Feature, Bug, Improvement,
    Technical Task, Research/Spike, or Maintenance, so that engineering work is classified
    consistently.
53. As an Opzava administrator, I want multiple Work Areas independent of Type, so that
    cross-cutting work can be found without corrupting taxonomy.
54. As an Opzava administrator, I want Work Areas such as UI/UX, Frontend, Backend/API,
    Data/Database, Infrastructure, GitHub Integration, Agent Runtime, Security, and Documentation,
    so that List grouping is useful.
55. As an Opzava administrator, I want Priority expressed as P0 through P3, so that queue order uses
    standard engineering terms.
56. As an Opzava administrator, I want Severity S0 through S3 required only where a Bug or incident
    projection needs impact classification, so that severity is not misused as priority.
57. As an Opzava administrator, I want Change Risk expressed as Low, Medium, High, or Critical, so
    that approval policy follows the danger of the change.
58. As an Opzava administrator, I want policy to compute a minimum Change Risk, so that an agent
    cannot underrate dangerous work.
59. As an Opzava administrator, I want humans and agents able to raise but not lower policy-derived
    risk, so that caution is always permitted without weakening controls.
60. As an Opzava administrator, I want High and Critical risk to require human approval, so that
    dangerous changes cannot auto-merge.
61. As an incident responder, I want Incident/ErrorGroup to remain an operational aggregate rather
    than a DevTicket Type, so that incident response and development work retain separate
    lifecycles.
62. As an incident responder, I want incident projections visible from Dev Board, so that
    operational impact informs planning without corrupting DevTicket state.
63. As an incident responder, I want permanent remediation linked as a Bug or Technical Task, so
    that code fixes still pass normal Ready and Review gates.
64. As a Sprint planner, I want Incidents excluded from Sprint membership, so that an operational
    event cannot masquerade as planned implementation work.
65. As an Opzava administrator, I want Human Owner, Execution Assignee, Lead Orchestrator, Reviewer,
    and Runner shown as distinct roles, so that authority and execution location are clear.
66. As an Opzava administrator, I want human avatars circular and AI avatars visibly distinct, so
    that mixed human-agent assignments are scannable.
67. As an Opzava administrator, I want local and orchestrator execution shown as a separate
    runner/location badge, so that agent identity is not confused with where it runs.
68. As a Lead Orchestrator, I want to coordinate work without silently inheriting owner, assignee,
    or reviewer authority, so that role separation remains enforceable.
69. As an Opzava administrator, I want a fresh independent Reviewer for each Review, so that the
    implementing agent cannot approve its own output.
70. As an Opzava administrator, I want GitHub connected through a GitHub App under Add Integration,
    so that synchronization uses a dedicated application boundary.
71. As an Opzava administrator, I want a GitHub integration health check in Admin, so that
    authentication, permissions, webhooks, rates, and lag are visible.
72. As an Opzava administrator, I want GitHub Issue body summary text editable from either system,
    so that normal collaboration remains natural.
73. As an Opzava administrator, I want an Opzava-managed versioned Work Contract block in the issue
    body, so that GitHub holds a readable durable copy of approved requirements.
74. As an Opzava administrator, I want GitHub edits to the managed contract treated as proposed
    revisions, so that they cannot silently replace an approved contract.
75. As an Opzava administrator, I want namespaced labels for type, priority, risk, severity, area,
    status, and Sprint, so that GitHub remains searchable without taking workflow authority.
76. As a repository maintainer, I want existing non-Opzava labels left untouched, so that the
    integration does not damage repository conventions.
77. As an Opzava administrator, I want a GitHub status-label edit treated as a transition request,
    so that GitHub actions still pass Opzava gates.
78. As an Opzava administrator, I want human comments synchronized one-to-one in both directions, so
    that either surface retains the same discussion.
79. As an execution agent, I want each meaningful milestone, pause, failure, handoff, and completion
    appended as an immutable GitHub worklog comment, so that agent activity has durable history.
80. As a Reviewer, I want the Review result mirrored as a structured evidence summary with contract
    version and locked SHA, so that the repository record explains the verdict.
81. As an Opzava administrator, I want live token and tool telemetry kept in Opzava rather than
    copied to GitHub, so that the durable record stays useful.
82. As an auditor, I want corrections appended instead of silently rewriting prior worklogs, so that
    history remains trustworthy.
83. As an auditor, I want every synchronized record attributed to the human, agent, orchestrator,
    source surface, and runner, so that a GitHub App account does not hide the real actor.
84. As an integration developer, I want GitHub delivery IDs and Opzava event IDs deduplicated, so
    that retries do not create duplicate comments or transitions.
85. As an integration developer, I want independent fields merged deterministically, so that
    harmless concurrent edits do not require human intervention.
86. As an Opzava administrator, I want concurrent edits to the same governed field shown as a Sync
    Conflict, so that no blanket last-write-wins policy destroys intent.
87. As an execution agent, I want contract, dependency, assignment, and approval conflicts to pause
    execution, so that unsafe ambiguity fails closed.
88. As an Opzava administrator, I want to resolve governed conflicts in Opzava and mirror the chosen
    value back to GitHub, so that workflow authority remains clear.
89. As an integration operator, I want retryable GitHub writes stored in a durable outbox, so that
    transient outages do not lose history.
90. As an integration operator, I want sequence gaps trigger snapshot reconciliation, so that
    webhook ordering is not mistaken for global truth.
91. As an Opzava administrator, I want an unhealthy or unverifiable GitHub integration to be an
    unbypassable stop for gates requiring confirmed history, so that the backup record cannot
    silently diverge.
92. As a security reviewer, I want suspected secret exposure to be an unbypassable stop, so that
    workflow convenience never overrides containment.
93. As an Opzava administrator, I want other policy exceptions labeled Needs Human Approval rather
    than Policy Bypassed, so that the required action is clear.
94. As an Opzava administrator, I want merge conflicts assigned to agents for automated resolution
    and re-verification, so that agent-generated code does not create unnecessary manual work.
95. As an Opzava administrator, I want v1 limited to the Opzava repository, so that repository
    identity and sync policy remain bounded.
96. As an Opzava administrator, I want to enroll a local machine in Admin, so that Opzava can trust
    execution receipts from my development environment.
97. As a Linux user, I want a clear selector for Codex Desktop, Codex CLI, and Claude Code, so that
    enrollment does not assume an unavailable desktop application.
98. As an Opzava administrator, I want local machine keys revocable and health visible, so that lost
    or stale runners cannot keep authority.
99. As a Runner, I want a fenced execution lease with heartbeat, command nonce, monotonic receipt
    sequence, contract version, worktree, branch, and SHA identity, so that stale or spoofed
    receipts are rejected.
100. As an Opzava administrator, I want every DevTicket executed in its own branch and worktree, so
     that future parallel work has an isolation boundary.
101. As an Opzava administrator, I want local-runner disconnection to pause work without automatic
     cloud failover, so that two environments cannot continue the same lease.
102. As an Opzava administrator, I want a disconnect to preserve the last confirmed checkpoint and
     create a Slack notification with a continuation summary, so that I can recover safely when the
     machine returns.
103. As a Runner, I want reconnect reconciliation of process, worktree, branch, SHA, Docker, GitHub,
     lease, and receipt sequence before resume, so that Opzava never performs a blind restart.
104. As an Opzava administrator, I want local execution and orchestrator-delegated execution
     available as explicit choices, so that the hybrid model is visible rather than inferred.
105. As an Opzava administrator, I want a Slack Personal Assistant to notify me about approvals,
     blockers, discoveries, runner failures, and integration failures, so that work can continue
     while I am away.
106. As an Opzava administrator, I want Slack approval actions bound to my enrolled identity, a
     one-time nonce, exact object version, expiry, and audit entry, so that stale messages cannot
     authorize changed work.
107. As an Opzava administrator, I want ordinary workflow approvals possible directly from Slack, so
     that I can unblock safe work without opening another screen.
108. As a security reviewer, I want machine enrollment, secret entry, and security or integration
     changes completed only in Opzava's secure UI, so that Slack never becomes a secret or trust
     bootstrap channel.
109. As an Opzava administrator, I want Slack to contain references and summaries but never secret
     values, so that channel history does not become a credential store.
110. As an Opzava administrator, I want human-provided credentials represented by named secret
     references, so that a resolved prerequisite can be reused without putting raw secrets on a
     Card.
111. As an execution agent, I want access to a secret reference admitted only for the current lease
     and policy, so that secrets are not generally readable.
112. As an Opzava administrator, I want Reviewer tool and model selected in Admin, so that
     independent Review uses an explicit local configuration.
113. As an Opzava administrator, I want all Reviews to run against the local Docker stack, so that
     validation uses the closest available environment to Dokploy.
114. As a Reviewer, I want Review evidence locked to an exact commit SHA and contract version, so
     that results cannot drift after validation.
115. As an Opzava administrator, I want a self-contained evidence package on the Card, so that Slack
     is only the notification and control surface.
116. As an Opzava administrator away from my machine, I want an authenticated expiring preview
     tunnel to the local Docker stack, so that I can inspect behavior without exposing it
     permanently.
117. As a security reviewer, I want the preview tunnel revoked on expiry, lease loss, runner
     disconnect, or explicit close, so that temporary access cannot linger.
118. As a Sprint planner, I want a Sprint defined by a clear Goal and versioned ordered plan, so
     that autonomous work has a bounded destination.
119. As a Sprint planner, I want ordinary DevTickets to remain outside a Sprint unless deliberately
     planned, so that not all work is mislabeled as a Sprint.
120. As a Sprint planner, I want any number of Draft Sprints but only one Approved and Queued Sprint
     and at most one Active Sprint, so that future planning does not create concurrent autonomous
     execution.
121. As a Sprint planner, I want a DevTicket to belong to only one non-archived Sprint at a time, so
     that scope ownership is unambiguous.
122. As a Sprint planner, I want moving a DevTicket between Draft Sprints to revise both plans, so
     that history and ordering remain accurate.
123. As a Sprint planner, I want Active Sprint membership changes to require an approved Plan
     revision, so that agents cannot silently expand scope.
124. As a Sprint planner, I want external dependencies Done before Sprint activation, so that
     autonomous execution does not begin with known locks.
125. As an Opzava administrator, I want a queued Sprint to auto-start only after Ready, GitHub,
     runner, Reviewer, Docker, dependency, and secret-reference preflight passes, so that autonomy
     begins from a verified state.
126. As an Opzava administrator, I want temporary health failures to leave a Sprint Queued while
     blocking activation, so that availability drift does not erase plan approval.
127. As a Sprint planner, I want material Goal, plan, contract, dependency, risk, or policy changes
     to produce Needs Re-approval, so that queued approval cannot apply to changed work.
128. As an execution agent, I want autonomous serial execution to allow exactly one implementation
     DevTicket In Progress, so that worktree conflicts are minimized.
129. As an execution agent, I want to claim the next Todo DevTicket while the prior one is in
     Review, so that independent Review does not idle implementation unnecessarily.
130. As an Opzava administrator, I want Review work in progress limited to three, so that
     implementation pauses instead of overwhelming Review.
131. As an Opzava administrator, I want Slack notified when Review reaches its WIP limit, so that a
     growing verification bottleneck receives attention.
132. As a Sprint planner, I want a blocking discovery to propose a Plan revision with reason,
     position, and affected dependencies, so that urgent additions remain governed.
133. As a Sprint planner, I want an accepted non-blocking discovery left in Backlog, so that the
     active Goal is not diluted.
134. As an Opzava administrator, I want a Sprint paused—not cloud-failed-over—when its bound local
     runner disappears, so that autonomous work cannot fork.
135. As a Sprint planner, I want Completed, Cancelled, and Aborted Sprints preserved with final
     plan, reasons, unfinished scope, and audit links, so that Sprint history is immutable.
136. As a Sprint planner, I want Paused to remain an Active Sprint condition rather than historical
     completion, so that temporary interruption is not misreported.
137. As a repository maintainer, I want a Sprint mirrored to a GitHub Milestone and managed tracking
     issue, so that Goal, order, revisions, pauses, and final report are durable.
138. As an Opzava administrator, I want Summary to prioritize what needs me, what is happening, and
     recent changes, so that attention comes before vanity metrics.
139. As an Opzava administrator, I want one canonical List grouped by Work Area by default, so that
     UI, Frontend, Backend, Data, Infrastructure, GitHub, Agent Runtime, Security, and Docs work
     stay organized.
140. As an Opzava administrator, I want List regrouping by Type, Sprint, lane, owner, or assignee
     plus saved views, so that one dataset supports different operating questions.
141. As an Opzava administrator, I want Board to use the selected agent command-center layout with a
     compact collapsible Backlog, so that active work remains dense and scannable.
142. As an Opzava administrator, I want a dedicated Sprints view with Sprint history, so that a Goal
     is distinct from ordinary lane flow.
143. As an Opzava administrator, I want Docs as a first-class view, so that PRDs, plans, research,
     decisions, runbooks, and reports are available without opening another product.
144. As an Opzava administrator, I want Development to aggregate PRs, branches, worktrees, CI,
     `development` health, sync health, runners, Reviewers, Docker, and security alerts, so that
     repository delivery status stays in Opzava.
145. As a release manager, I want Releases separate from Development and Done, so that Candidate,
     Staging, Staging Approved, Production Ready, and Released have their own evidence and
     approvals.
146. As an Opzava administrator, I want both light and dark modes following the global theme, so
     that Dev Board is consistent with the rest of Opzava.
147. As an Opzava administrator, I want Card details to follow a top-to-bottom Jira-workspace
     reading flow with an optional preview, so that requirements and activity are easy to scan.
148. As an Opzava administrator, I want Card activity separated into Comments, History, Worklog,
     Agent Execution, and Review Evidence, so that human discussion and machine activity do not blur
     together.
149. As an Opzava administrator, I want PR, CI, behavioral, E2E, Docker, approval, and merge status
     on the Card, so that GitHub does not need to be open for routine supervision.
150. As a document author, I want Opzava to be the primary authoring UI while Markdown mirrors to
     the repository, so that planning is usable and durable.
151. As a document author, I want PRD, Planning Brief, RFC/Design Spec, Research Note, ADR, Runbook,
     Postmortem, Sprint Plan, and Sprint Report types, so that development knowledge has consistent
     form.
152. As a document author, I want documents linked by metadata to multiple Sprints, DevTickets,
     incidents, and Work Areas, so that content is reused rather than duplicated.
153. As an Opzava administrator, I want each grilling session preserved as a Planning Session Log
     and synthesized final brief, so that decisions and rejected alternatives are not lost.
154. As an auditor, I want Planning Session Logs to record questions, recommendations, human
     decisions, rejected alternatives, unresolved items, participants, and timestamps without hidden
     model reasoning, raw tool output, or secrets, so that the record is useful and safe.
155. As a document approver, I want Draft, In Review, Approved, Superseded, and Archived states with
     immutable Approved versions, so that cited planning cannot change silently.
156. As an execution agent, I want a material approved-document revision to invalidate dependent
     readiness or Sprint approval, so that implementation does not rely on superseded policy.
157. As a migration operator, I want current Task IDs, card numbers, GitHub links, comments,
     evidence, reviews, and activity preserved, so that the pivot does not erase history.
158. As a migration operator, I want dual-read only during a bounded migration period, so that two
     long-lived sources of truth do not emerge.
159. As an Opzava administrator, I want `/tasks` and `/issues` redirected to `/dev-board` only after
     verified cutover, so that existing links remain useful without hiding migration failures.
160. As an auditor, I want planning decisions, Dev Board activity, runner execution/checkpoints, and
     synchronization/outbox/conflicts kept as four distinct ledgers, so that narrative, workflow,
     runtime, and integration evidence remain intelligible.
161. As an Opzava administrator, I want archive to be the normal reversible removal path, so that
     durable development history is not casually deleted.
162. As a compliance operator, I want raw logs and large artifacts governed by configurable
     retention, so that high-volume evidence does not grow without limit.
163. As a security operator, I want exceptional redaction coordinated across Opzava and GitHub with
     a non-sensitive audit tombstone, so that exposed secrets can be removed without pretending no
     record existed.

## Implementation Decisions

- Establish a dedicated Dev Board bounded context. `DevTicket` is the aggregate root and `Card` is
  its UI projection. DevTicket is not an alias for Project Management `pm.Card`, the current `Task`,
  a GitHub Issue, OpenClaw `workboard.Card`, or `Incident`/`ErrorGroup`.
- Treat current Tasks and Issues as migration sources. Use expand-contract migration, preserve
  existing UUIDs and card numbers as aliases/history, and preserve GitHub links, comments, steps,
  evidence, quality records, activity, and timestamps. Do not maintain indefinite dual-write
  authority.
- Give every accepted DevTicket one linked GitHub Issue in the single configured Opzava repository
  for v1. Display `GH #<number>` as the primary user-facing ID; retain the DevTicket UUID as
  internal identity and any migrated card number as a historical alias.
- Model Proposal separately from DevTicket. A Proposal records discovery, evidence, blocking impact,
  suggested work, and actor. Only acceptance creates or links a DevTicket and GitHub Issue. Blocking
  Proposals may pause an affected Sprint and notify Slack but do not create GitHub noise before
  acceptance.
- Use six workflow lanes: Backlog, Todo, Blocked, In Progress, Review, and Done. Backlog is
  non-executable shaping. Todo requires a Ready snapshot. In Progress requires an active assigned
  claim. Blocked requires a reason and prior-state/checkpoint metadata. Review is mandatory. Done
  requires successful independent Review and merge into `development`.
- Resolve a Blocked execution by returning the DevTicket to Todo after the blocking condition is
  cleared. Do not silently resume a prior lease. A Todo DevTicket whose dependency is not Done
  remains visibly dependency-locked and cannot be claimed.
- Apply all transitions through commands. Drag-and-drop, keyboard, menus, Slack, GitHub label
  requests, local tools, and orchestrator tools are adapters to the same command and policy layer.
- Store a versioned Ready contract containing outcome, bounded scope, sad paths, edge cases,
  acceptance criteria, dependency state, user-level E2E expectations, behavioral contract,
  human-input state, named secret references, Human Owner, and structured classification. The Ready
  approval stores exact contract version and hash.
- Separate free shaping from governed revision. Backlog is editable. Todo contract fields are
  immutable. In Progress and Review accept proposed revisions with field-level diff and reason.
  Material revisions invalidate Ready and stale evidence; comments and non-semantic metadata do not.
- Use explicit dependency edges with cycle detection. A dependency must be Done before the dependent
  can be claimed or before a Sprint containing the dependent can activate. Completed work retains
  historical edge and Sprint membership.
- Keep roles distinct: required Human Owner; optional Execution Assignee in Todo but required before
  In Progress; Lead Orchestrator; independent Reviewer; and Runner. Runner/location is not an actor
  identity. Human and AI visual treatments must remain distinguishable.
- Use DevTicket Types Feature, Bug, Improvement, Technical Task, Research/Spike, and Maintenance.
  Incident is not a Type. Use multi-valued Work Areas UI/UX, Frontend, Backend/API, Data/Database,
  Infrastructure, GitHub Integration, Agent Runtime, Security, and Documentation; new standard
  engineering areas require an explicit taxonomy change.
- Use Priority P0–P3 for queue urgency, Severity S0–S3 for Bug impact and incident projections, and
  Change Risk Low/Medium/High/Critical for approval policy. Policy computes a minimum risk; actors
  may raise but not lower it. High/Critical requires human approval.
- Keep Incident/ErrorGroup in Notifications/Admin-Observability with lifecycle
  `Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem`. Project it into Dev
  Board for attention. Link permanent remediation as a Bug or Technical Task. Never persist an
  Incident as a DevTicket Type or include it directly in a Sprint.
- Use a GitHub App and webhook integration. Opzava owns workflow, gates, approved contract,
  assignments, dependencies, Sprints, approvals, and conflict decisions. GitHub owns issue
  number/URL and repository-native PR, commit, check, review, and merge facts. Shared descriptive
  fields synchronize deterministically.
- Split a GitHub Issue body into human-readable summary/context and a managed
  `Opzava Work Contract vN` block. Edits to the managed block become proposed revisions. Namespaced
  managed labels encode type, priority, risk, optional severity, areas, status, and Sprint while
  preserving unrelated repository labels.
- Synchronize human comments one-to-one. Append immutable agent worklog comments at meaningful
  milestones, pauses, failures, handoffs, and completion. Append a structured Review summary
  carrying contract version, locked SHA, checks, verdict, and artifact references. Keep high-volume
  live execution telemetry only in Opzava.
- Attribute GitHub App posts in their body to actor role, named identity, source, and runner, for
  example `Execution Assignee · Codex CLI — via local-runner-01`. Include stable hidden event
  identity for deduplication without leaking secrets.
- Use per-aggregate monotonic versions, GitHub delivery-ID deduplication, Opzava event-ID
  deduplication, and snapshot reconciliation after sequence gaps. There is no global order across
  GitHub, Opzava, Slack, and runners.
- Auto-merge concurrent changes to different shared fields. Append comments/worklogs. For concurrent
  changes to the same governed field, create a visible Sync Conflict. Contract, dependency,
  assignment, approval, and Sprint conflicts pause affected execution; harmless display metadata
  does not. Human Owner resolves governed conflicts in Opzava and the result mirrors to GitHub.
- Persist retryable outbound writes in a durable sync outbox with attempts, claims, backoff, last
  error, and confirmation. GitHub health reports authentication, repository access, required
  read/write permissions, webhook delivery freshness, rate limit state, replay/outbox lag, and
  reconciliation status.
- Treat suspected secret exposure and unhealthy or unverifiable GitHub integration as absolute
  unbypassable stops for affected execution and workflow gates. Other policy exceptions become
  version-bound Needs Human Approval requests; approval never changes the two absolute-stop classes.
- Automate agent-authored merge-conflict resolution in an isolated worktree, then rerun affected
  checks and independent Review. Do not give an execution agent a general-purpose ungoverned merge
  authority.
- Support one production repository in v1: the Opzava repository. A fixed scratch repository may be
  used only as test infrastructure. Multiple repository product behavior is deferred.
- Enroll local machines in Admin with machine identity, public key, owner, OS, supported tool,
  capabilities, health, last seen, revocation, and Docker readiness. Offer explicit Codex Desktop,
  Codex CLI, and Claude Code selection without assuming platform availability.
- Treat an orchestrator/cloud Runner as a separate explicitly admitted execution service bound from
  the start to the same lease, receipt, checkpoint, branch, and worktree rules. It is never an
  implicit failover target and cannot satisfy the local-only Review requirement.
- Accept a runner receipt only when signed by an enrolled local machine key or explicitly admitted
  cloud service identity and bound to an active fenced lease, command nonce, monotonic sequence,
  exact DevTicket contract version, worktree, branch, and SHA. Reject stale leases, repeated nonces,
  regressed sequences, mismatched identity, and receipts after revocation.
- Create a dedicated worktree and branch for each executing DevTicket. Bind checkpoints to
  repository, worktree, branch, HEAD SHA, dirty state summary, command state, Docker state, evidence
  refs, and last confirmed receipt.
- Do not automatically fail over an offline local runner to cloud execution. Fence the lease, revoke
  preview access, mark `Blocked — Connection Lost / Execution Unknown`, preserve the checkpoint, and
  notify Slack with a continuation summary. On reconnect, reconcile lease, process, worktree,
  branch, SHA, Docker, GitHub, and monotonic receipt state before a human-approved or
  policy-admitted resume.
- Use Slack Personal Assistant as notification and bounded approval/control channel. Approvals are
  tied to the authenticated enrolled Admin, exact target/version/hash, one-time nonce, expiry,
  action, and audit record. Machine enrollment, raw secret entry, security configuration, and
  integration trust changes require Opzava's secure UI.
- Store no secret value on a Card, in GitHub, Slack, comments, logs, evidence summaries, or audit
  payloads. Cards contain named secret references and readiness/health only. Resolve values from an
  approved local keyring or vault under the active policy and lease.
- Configure one independent local Reviewer tool and model in Admin. Review must run on the user's
  local machine against the shared local Docker stack and an exact commit SHA. Review evidence
  belongs on the Card; Slack carries only notification and bounded decisions.
- Permit an authenticated, expiring, revocable preview tunnel to the local Docker stack. Bind it to
  Admin identity, DevTicket, Review, runner lease, exact build/SHA, and expiry. Revoke it on
  disconnect, lease loss, expiry, security stop, or explicit close.
- Define Sprint as a Goal plus versioned ordered plan for `autonomous_serial` execution, not a lane
  or a label applied to all work. Allow many Draft Sprints, at most one Approved and Queued Sprint,
  and at most one Active Sprint.
- Bind Sprint approval to Goal version, Plan version, ordered membership, each Ready contract
  version/hash, dependency graph, risk/approval state, runner and Reviewer policy, and named-secret
  readiness. Material changes produce Needs Re-approval. Temporary liveness or integration health
  failures leave it Queued and block preflight.
- Require activation preflight: approved Goal and Plan, every member Ready, external dependencies
  Done, GitHub healthy and synchronized, chosen runner and Reviewer available, local Docker healthy,
  required named secret references resolvable, and no security stop.
- Permit exactly one implementation DevTicket In Progress in an Active Sprint. When it reaches
  Review, the execution assignee may claim the next ordered Todo item. Limit concurrent Review to
  three; when full, stop claiming and notify Slack.
- Require an approved Plan revision for Active Sprint add, remove, defer, reorder, or material
  contract changes. A blocking accepted Proposal may propose a revision; a non-blocking accepted
  Proposal remains Backlog. Do not let an agent silently mutate Sprint scope.
- Mirror each Sprint to a GitHub Milestone and one managed tracking issue containing Goal, ordered
  scope, policy, current Plan version, revisions, pauses, blocking discoveries, and final report.
  Close only when all items remaining in the approved Plan are Done.
- Preserve immutable Sprint history for Completed, Cancelled, and Aborted outcomes, including final
  Plan, dates, reason, unfinished scope, interruptions, metrics, Docs snapshot, GitHub refs, and
  audit. Paused remains an Active condition.
- Provide top-level views `Summary`, `List`, `Board`, `Sprints`, `Docs`, `Development`, and
  `Releases`. Summary prioritizes attention, active work, and changes before metrics. List is one
  canonical dataset grouped by Work Area by default and regroupable by Type, Sprint, lane, Human
  Owner, or Execution Assignee.
- Base Board on approved prototype Variant B with compact collapsible Backlog; base Card detail on
  Variant A with top-to-bottom reading flow and optional preview; base Sprints on Variant A with
  Sprint history. Follow Jira's information-architecture concept, not its proprietary styling.
  Support global light and dark themes.
- Make Card activity tabs Comments, History, Worklog, Agent Execution, and Review Evidence. Surface
  repository-native PR, branch, worktree, commit, check, Review, approval, merge, Docker, and sync
  facts without making Opzava the source of those GitHub facts.
- End Development at merge into `development`. Keep Releases as a separate view and future workflow
  for Candidate, Staging, Staging Approved, Production Ready, and Released. Do not move Done cards
  backward merely because a release has not promoted.
- Make Opzava the primary Docs authoring and reading surface and mirror human-readable Markdown
  under a stable repository tree. Give each document immutable ID, version, content hash, state,
  type, relations, and GitHub path.
- Support document types PRD, Planning Brief, RFC/Design Spec, Research Note, ADR, Runbook,
  Postmortem, Sprint Plan, and Sprint Report. Preserve Planning Session Logs with questions,
  recommendations, human decisions, rejected alternatives, unresolved items, participants, and
  timestamps; exclude hidden reasoning, raw tool output, secrets, and noisy telemetry.
- Use document lifecycle Draft, In Review, Approved, Superseded, and Archived. Approved versions are
  immutable; edits create new Draft revisions. PRD, RFC, ADR, Sprint Plan, and Runbook require Human
  Owner approval. A material revision invalidates dependent Ready or Sprint approval.
- Separate four ledgers: planning decisions; immutable Dev Board activity/history; runner
  execution/checkpoints; and synchronization/outbox/conflicts. Cross-link them by stable refs, but
  do not collapse their different ordering, retention, or authority semantics.
- Use reversible archive as the default removal action. Preserve contracts, comments, worklogs,
  Sprint history, approvals, relied-upon Review evidence, and audit. Apply configurable retention to
  raw logs and large transient artifacts. For legal or secret-exposure removal, coordinate redaction
  in Opzava and GitHub and retain a non-sensitive tombstone.
- Migrate with expand-contract and bounded dual-read. Verify record counts, identity mapping,
  comments, evidence, workflow mapping, GitHub links, and route behavior before switching writes.
  Redirect `/tasks` and `/issues` to `/dev-board` only after verified cutover, then retire legacy
  code and adapters.
- Keep Review internals and Releases promotion mechanics fail-closed until separately grilled and
  specified. No DevTicket can reach Done until the mandatory Review contract is implemented; no
  release behavior may be inferred from Done.

## Testing Decisions

- Test observable behavior and authority decisions, not React component structure, SQL helper
  internals, webhook library calls, model output phrasing, or raw runner implementation details.
- The primary acceptance seam is one real authenticated browser vertical story against the real
  local Docker stack. An Admin shapes a Proposal or Backlog item, obtains a synchronized GitHub
  Issue, completes and approves the Ready contract, assigns and claims it on an enrolled local
  runner, observes worklogs and repository facts, submits locked-SHA evidence to an independent
  local Review, handles approval if required, and reaches Done only after merge into `development`.
- The real browser story must use ordinary authentication and real tenant/workspace records, not
  minted sessions, mocked page data, or fake GitHub state. It must cover both light and dark themes,
  keyboard-equivalent transitions, narrow viewport behavior, and truthful degraded states.
- Use a real Postgres application-command seam for DevTicket transitions and the transactional
  outbox. Cover Ready version binding, material invalidation, atomic claim, duplicate claim, lease
  fencing, dependency locks, Blocked recovery, Review rework ranking, Done gate, RLS, idempotency,
  and outbox replay.
- Use a signed GitHub App webhook and adapter seam against Opzava-repository test records or one
  fixed scratch repository used strictly as test infrastructure. Cover issue creation/linking,
  managed body block, label ownership, comments, worklogs, delivery dedupe, out-of-order delivery,
  sequence gap reconciliation, retry outbox, same-field conflict, different-field merge, GitHub edit
  as proposal, permission loss, rate exhaustion, and recovery.
- Use a deterministic runner-protocol seam for enrolled machine signatures, leases, fencing tokens,
  command nonces, monotonic receipt sequences, contract versions, worktree/branch/SHA identity,
  checkpointing, heartbeat expiry, disconnect, stale receipt rejection, reconnect reconciliation,
  and resume.
- No model token is required for synchronization, protocol, migration, or state-machine tests. Use
  deterministic fixtures and signed events. Model-backed execution may be tested separately but
  cannot be the correctness oracle for sync or gates.
- Test Slack approval contracts deterministically: enrolled Admin identity, exact object and
  version, nonce single use, expiry, replay, rejection after material change, role revocation, audit
  attribution, and prohibition on secret values. Verify secure-UI-only operations cannot be approved
  through Slack.
- Test secret-reference behavior with opaque test references, never production values. Cover
  missing, expired, revoked, policy-denied, runner-mismatched, and resolved states and assert values
  never enter Card, webhook, GitHub, Slack, worklog, evidence, audit, or error output.
- Test Sprint plan and execution behavior through commands: one Active, one Approved/Queued, many
  Drafts, single non-archived membership, Plan revisions, queued preflight, health drift versus
  material invalidation, one implementation slot, Review WIP three, blocking Proposal, non-blocking
  Proposal, dependency ordering, pause, cancellation, abortion, completion, and immutable history.
- Test local Docker Review and preview behavior at the user seam: exact SHA, contract version,
  independent reviewer identity, Docker health, evidence attachment, preview tunnel authorization,
  expiry, runner disconnect revocation, and no stale preview after a new build.
- Test migration through forward-only fixtures representing current Tasks, issue projections,
  comments, steps, watchers, evidence, quality records, issue outbox state, card numbers, external
  refs, and activity. Verify every source record has a mapped target or explicit quarantine
  disposition before cutover.
- Test `/tasks` and `/issues` redirects only after a cutover flag or completed migration state.
  Before cutover, legacy reads remain available for reconciliation and no redirect may hide missing
  DevTickets.
- Test archival, retention, and exceptional redaction behavior: archive/restore, immutable
  relied-upon evidence, raw-log expiry, GitHub coordinated redaction, and preserved non-sensitive
  tombstone.
- Test the two absolute stops separately from ordinary Needs Human Approval. Secret-exposure and
  unverifiable-GitHub states must reject bypass attempts through UI, Slack, GitHub labels, agent
  tools, runner receipts, and direct command APIs.

## Out of Scope

- Multiple product repositories. V1 operates only on the Opzava repository; a scratch repository may
  exist only for fixed test infrastructure.
- Reusing DevTicket as the generic Project Management `pm.Card`, OpenClaw `workboard.Card`, current
  `Task`, GitHub Issue, Incident, support ticket, CRM ticket, or other company work unit.
- Persisting Incident as a DevTicket Type or running an Incident directly as Sprint scope. Only
  linked remediation DevTickets use the normal workflow.
- Full internals of the adversarial Review Gate, including its final check catalog, escalation
  model, approval thresholds beyond the locked foundation, and merge choreography. These require a
  dedicated grilling and specification.
- Full Releases promotion mechanics, staging and production deployment policy, rollback
  implementation, release-candidate composition rules, and production approval matrix. These require
  a separate grilling and specification.
- Automatic cloud failover from a disconnected local runner. The active lease pauses and reconciles
  before resume.
- Raw secret storage or display in Dev Board, Slack, GitHub, Docs, comments, worklogs, evidence,
  preview links, or audit.
- General project management for customers or other departments. Dev Board is an admin-only Opzava
  platform-development workspace.
- Copying Jira's styling or product implementation. Jira informs the selected information
  architecture and reading flow only.
- Treating GitHub Actions, GitHub labels, or GitHub edits as a bypass around Opzava workflow gates.
- Using model calls for deterministic synchronization, webhook processing, lease handling, protocol
  validation, migrations, or automated state transitions.
- Immediate deletion of the current Tasks/Issues implementation or its history. Retirement follows
  verified expand-contract cutover.

## Further Notes

- Canonical vocabulary: **Dev Board** is the admin platform-development workspace; **DevTicket** is
  its canonical work unit; **Card** is a visual representation; **GitHub Issue** is its durable
  synchronized mirror; **Proposal** is a pre-acceptance agent discovery.
- This PRD defines target behavior. It does not claim that the target Dev Board, two-way sync,
  runner protocol, local Review, Sprints, Docs mirror, or Releases view is implemented today.
- The authority and synchronization architecture is recorded in ADR-017. The full locked decision
  record is `docs/plan/dev-board-foundation-decisions.md`. Migration and stale-context disposition
  are recorded in `docs/plan/dev-board-migration-manifest.md`.
- Existing Q17 material and tracker issues remain historical evidence but are superseded as active
  Dev Board guidance where they conflict with this PRD and ADR-017.
- Approved throwaway visual prototypes are preserved on `prototype/dev-board-v1`: Board Variant B at
  commit `27aa4660`, Card detail Variant A at `a4ecf553`, and Sprints Variant A with history at
  `8ebfecf5`. Prototype code is a visual decision aid, not production implementation.
- Product navigation target: `Summary · List · Board · Sprints · Docs · Development · Releases`.
- The next design sessions should grill Review Gate internals first and Releases promotion mechanics
  second. Until Review is specified and implemented, the system must fail closed before Done.
