# PRD-019: Dev Board — governed Opzava platform-development workspace

> **WF-231 amendment status:** GitHub bootstrap/mirror details added by the #231 resolution are a
> prepared inactive candidate until parent map #228 records verified closure and the migration
> manifest designates the memo current for #237. The previously approved PRD remains current; these
> staged additions do not become implementation authority early.

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
DevTicket. Opzava owns the workflow, current immutable work contract, explicit draft or
Ready-approved state, assignments, dependencies, Sprint plans, approvals, and conflict decisions. A
synchronized GitHub Issue is the durable secondary mirror and supplies the visible issue number and
URL. GitHub remains authoritative for repository-native pull request, branch/ref/SHA, commit, check,
repository-review, and merge facts. Opzava owns Runner selection and Execution Lease authorization/
binding/fence plus the governed execution branch/purpose binding. Enrolled Runners own only signed
local process, worktree, branch, command, heartbeat, and checkpoint observations under that
authority; correlation to GitHub refs transfers none. OpenClaw remains authoritative only for its
own runtime facts.

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
7. As an Opzava administrator, I want accepting a Proposal to atomically create one Backlog
   DevTicket and either reserve a stable create intent pending provider identity or reserve a
   freshly observed existing Issue identity before commit and queue its link mirror, so that each
   path shows truthful asynchronous state.
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
78. As an Opzava administrator, I want verified mapped-human comments synchronized one-to-one in
    both directions while bot/App/unknown comments retain their external attribution, so that either
    surface keeps the discussion without granting automation a human or agent identity.
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
99. As a Runner, I want every capacity admission to create a fenced execution lease bound to my
    enrolled Runner identity, heartbeat, command nonce, monotonic receipt sequence, exact DevTicket
    contract/version, worktree, branch, and SHA, so that capacity is Runner-local and stale,
    replayed, or mismatched work is rejected.
100. As an Opzava administrator, I want every DevTicket executed in its own branch and worktree, so
     that future parallel work has an isolation boundary.
101. As an Opzava administrator, I want local-runner disconnection to choose Pre-Start Admission
     Loss when no start occurred or Blocked when start is ambiguous/accepted, without automatic
     cloud failover, so that two environments cannot continue the same lease.
102. As an Opzava administrator, I want a disconnect to preserve exact no-start proof or the last
     confirmed checkpoint and create a Slack continuation summary, so that recovery reflects what
     actually ran.
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
124. As a Sprint planner, I want the internal ordered Plan to be dependency-compatible and every
     external dependency Done before Sprint activation, so that autonomous serial execution cannot
     deadlock on a later blocker or begin with a known external lock.
125. As an Opzava administrator, I want a queued Sprint to auto-start only after Ready, GitHub,
     runner, Reviewer, Docker, dependency, and secret-reference preflight passes, so that autonomy
     begins from a verified state.
126. As an Opzava administrator, I want temporary health failures to leave a Sprint Queued while
     blocking activation, so that availability drift does not erase plan approval.
127. As a Sprint planner, I want material Goal, plan, contract, dependency, risk, or policy changes
     to produce Needs Re-approval, so that queued approval cannot apply to changed work.
128. As an execution agent, I want `autonomous_serial` to allow at most one Active Sprint
     implementation DevTicket In Progress, so that Sprint order remains serial even when the Runner
     has separately governed ordinary-work capacity.
129. As an execution agent, I want an accepted exact submission to enter Review as a contained
     Preparing Review member, with implementation lease, capacity, and worktree released only after
     no-process or stopped/quarantined proof and every credential/tunnel confirmation, so that the
     next ordered Sprint item never starts on reusable authority that may still be live.
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
164. As an Opzava administrator, I want implementation capacity configured per enrolled Runner with
     Focused, Balanced, and capability-bounded Custom presets, so that one machine's admission
     policy does not become an organization-global slot.
165. As an Opzava administrator, I want Balanced to be the default two-lease preset, reserving at
     most one lease for the Active Sprint and admitting at most one explicitly claimed ordinary
     DevTicket while that Sprint is active, so that ordinary work can progress without making the
     Sprint parallel.
166. As an execution agent, I want an ordinary lease admitted only for a Ready non-Sprint DevTicket
     with an explicit governed claim, resolved dependencies, no exclusive-resource conflict, and its
     own branch/worktree, so that parallel admission remains deliberate and isolated.
167. As an Opzava administrator, I want declared scope collisions to trigger coordination rather
     than pretending file sets can be proven disjoint, so that safe work may continue and later
     merge conflicts remain agent-remediated.
168. As an Opzava administrator, I want Balanced to admit up to two ordinary tickets when no Sprint
     is active, so that idle Sprint-reserved capacity is not wasted.
169. As a Sprint planner, I want Sprint activation to wait for capacity rather than kill either of
     two running ordinary leases, so that an Active Sprint begins only after completion or an
     approved checkpoint/pause frees capacity.
170. As an Opzava administrator, I want Focused to allow one total implementation lease and queue
     new contenders without silently preempting admitted work, so that starts and priority changes
     use governed checkpoint, pause, and preemption decisions.
171. As an Opzava administrator, I want Custom available only inside Runner-advertised and
     platform-policy-approved safe limits, so that missing or invalid capability data is rejected
     rather than guessed.
172. As an Opzava administrator, I want a capacity downgrade to preserve current leases and block
     new admissions until usage returns within the limit, so that a settings change never kills
     active work.
173. As a Sprint planner, I want Sprint automation forbidden from borrowing ordinary capacity for a
     second Sprint DevTicket, so that there is still only one Active Sprint and one serial Sprint
     implementation at a time.
174. As a Reviewer, I want Reviewer execution capacity and Review WIP separated from implementation
     leases, with one exclusive fenced lease for the shared local Docker Review stack, so that only
     stack-mutating or locked-SHA-invalidating work queues while unrelated coding may continue.
175. As an auditor, I want Runner admission, preset changes, governed pause/preemption, disconnect
     fencing, and reconciliation authorized and recorded, so that neither settings nor recovery can
     silently create competing execution.
176. As an Opzava administrator, I want Admin Overview to project Runner capacity and waiting states
     without owning Dev Board admission, so that PRD-020 can explain operational state while this
     contract remains authoritative.
177. As a release manager, I want a mutable Draft sealed into an immutable Release Candidate and
     Release Manifest, so that promotion cannot change the reviewed source or artifact bundle.
178. As a release manager, I want the trusted pipeline to build each Release image once and staging
     and production to deploy the same OCI digests, so that staging evidence proves the production
     artifact.
179. As a release manager, I want deterministic staging verification followed by distinct human
     Staging and Production Approvals, so that each environment and decision has current evidence.
180. As a release manager, I want protected-main and immutable RC/stable tag facts reconciled from
     GitHub before deployment or publication advances, so that source history cannot be forged by
     workflow state.
181. As an operator, I want current per-service deployment facts and Last Known Good kept separate,
     so that mixed or unknown provider state never appears successful.
182. As an operator, I want rollback to deploy a previously verified immutable manifest without
     rewriting `main`, tags, GitHub Releases, or historical Release state, so that recovery
     preserves the audit record.
183. As a security operator, I want suspected secret exposure and unhealthy or unverifiable GitHub
     to remain unbypassable while safety-reducing containment remains available, so that approval
     cannot weaken absolute safeguards.
184. As an auditor, I want Release commands, approvals, provider attempts, evidence, notification
     delivery, reconciliation, and Incident links cross-referenced without a fabricated global
     order, so that history remains truthful.
185. As a DevTicket owner, I want release membership, failure, rollback, or supersession to leave my
     Card Done, so that development completion is not conflated with environment state.

## Implementation Decisions

- Establish a dedicated Dev Board bounded context. `DevTicket` is the aggregate root and `Card` is
  its UI projection. DevTicket is not an alias for Project Management `pm.Card`, the current `Task`,
  a GitHub Issue, OpenClaw `workboard.Card`, or `Incident`/`ErrorGroup`.
- Treat current Tasks and Issues as migration sources. Use expand-contract migration, preserve
  existing UUIDs and card numbers as aliases/history, and preserve GitHub links, comments, steps,
  evidence, quality records, activity, and timestamps. Do not maintain indefinite dual-write
  authority.
- Target every accepted DevTicket to exactly one confirmed GitHub Issue Binding in the single
  configured Opzava repository for v1. A verified-link acceptance reserves its freshly observed
  provider Issue identity before commit; a create acceptance reserves only a stable create intent
  until later provider confirmation. Until the applicable mirror write confirms, show truthful
  synchronization pending and keep the Card out of Ready. Display `GH #<number>` only after a known
  provider identity; retain the DevTicket UUID as internal identity and any migrated card number as
  a historical alias.
- Model Proposal separately from DevTicket. A Proposal records discovery, evidence, blocking impact,
  suggested work, and actor. `AcceptProposal` creates one Backlog DevTicket plus the exact
  create-or-link reservation/intent above; provider transport is asynchronous. `MergeProposal`
  appends discovery/evidence to an existing DevTicket's planning history and opens a proposed
  Revision only when governed work changes; it creates no DevTicket, GitHub Issue Binding,
  create/link intent, or provider outbox effect. Blocking Proposals may pause an affected Sprint and
  notify Slack but do not create GitHub noise before acceptance.
- Use six workflow lanes: Backlog, Todo, Blocked, In Progress, Review, and Done. Backlog is
  non-executable shaping. Todo requires a complete Ready Contract Version plus its exact Ready
  Approval. In Progress requires verified execution start for the active Claim Attempt and Execution
  Lease, not assignment or claim creation alone. Blocked requires a reason and prior state/
  checkpoint metadata. Review is mandatory. Done requires successful independent Review and merge
  into `development`.
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
- Use a GitHub App and webhook integration. Opzava owns workflow, gates, the current immutable
  contract and its explicit draft or Ready-approved state, assignments, dependencies, Sprints,
  approvals, and conflict decisions. GitHub owns issue number/URL and repository-native PR, branch/
  ref/SHA, commit, check, repository-review, and merge facts. Shared descriptive fields synchronize
  deterministically. Opzava owns Runner selection, Execution Lease authorization/binding/fence, and
  the governed execution branch/purpose binding. The Runner owns only signed local process,
  worktree, branch, command, heartbeat, and checkpoint observations under that authority;
  correlation never transfers authority to GitHub or the Runner.
- Bind the tenant to the provider-verified App installation and exactly one production repository by
  immutable provider IDs. Treat owner/name as mutable routing/display data, setup callback values as
  untrusted until provider-corroborated, and installation tokens as short-lived credentials that
  never become product truth or persistent connection identity.
- Require the same authenticated Admin to complete an ephemeral GitHub App user-authorization proof
  that the selected installation/repository is accessible to that GitHub user. App authentication
  alone does not associate a spoofable callback ID with a tenant. Resolve the required GitHub App
  client secret from its platform vault ref only inside the bounded server-side authorization-code
  exchange with the exact redirect URI and PKCE verifier; never expose or persist its value outside
  the vault. Require expiring GitHub App user tokens. Hold user/refresh credentials only as
  encrypted, non-exportable cleanup handles, obtain provider confirmation of revocation or expiry
  for each, and only then destroy/zero local handles. An unknown outcome or required provider-side
  human action remains fail-closed and blocks final binding rather than treating local deletion as
  revocation. The final binding transaction must revalidate that same Admin's live session,
  membership, current integration-admin authorization/policy version, and completed token cleanup;
  demotion, revocation, expiry, tenant change, policy denial, or cleanup uncertainty fails closed
  with no binding.
- Keep App registration IDs and private-key/client-secret/webhook-secret refs, ref versions, and
  rotation state as platform-owned configuration behind provisioning/security-service policy and
  audit, never tenant RLS data or a browser projection. Tenant-scoped GitHub Installation Binding,
  GitHub Repository Binding, and receipt records retain only an opaque public App configuration/
  rotation version; they never expose a platform vault ref, secret-ref version, or secret value.
- Admit webhooks in one security order: bound raw bytes, verify the exact-body HMAC, read
  `X-GitHub-Event` only as an untrusted bounded schema hint, then strictly parse the corresponding
  non-persisting signed payload envelope: installation ID only for `installation`/
  `installation_target` lifecycle, action plus installation/repository IDs for action-bearing
  repository events, installation/repository IDs with no required or invented action for actionless
  `create`/`delete`/`push`/`status`, or installation plus bounded added/removed repository-ID sets
  for `installation_repositories`. Resolve the server-owned binding from those signed IDs, fully
  parse the subscribed event schema and its schema-specific action presence/value, cross-check the
  envelope and header-selected event family, run Secret-Safe Ingress, durably persist a normalized
  safe receipt, then return `2xx`. Nothing parses before signature verification; never persist the
  raw provider payload.
- Split a GitHub Issue body into human-readable summary/context and a managed
  `Opzava Work Contract vN` block. Edits to the managed block become proposed revisions. Namespaced
  managed labels encode type, priority, risk, optional severity, areas, status, and Sprint while
  preserving unrelated repository labels.
- Render the current immutable contract version with explicit `Draft · Not Ready approved` or exact
  `Ready approved` status and Ready Approval identity. Backlog missing fields remain visible shaping
  state; GitHub mirror creation or echo never implies readiness or approval.
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
- Reconcile every synchronized field against its last mutually confirmed Mirror Shadow. Because
  GitHub mutations have no general compare-and-swap or exactly-once guarantee, a lost create,
  comment, body, or label response enters outcome-unknown reconciliation and never blind-retries.
  For identity-bearing Issue/comment effects, zero matches after any number of complete scans do not
  prove absence and never trigger an automatic reissue. Only a version-bound, single-use Human Owner
  resolution may explicitly accept duplicate risk and authorize a numbered reattempt; any late
  original is reconciled and deterministically contained by its immutable correlation.
- Make `ResolveUnknownMirrorEffect` the only zero-match terminalization/reattempt command for an
  ambiguous Issue/comment effect. Bind it to the unknown-effect/version, stable intent/correlation,
  App/install/repository/DevTicket, safe request hash, every complete observation epoch shown,
  binding/shadow/health/reconciliation versions, exact choice and duplicate-risk acknowledgement,
  actor/session/policy, single-use approval nonce, and idempotency key. It rejects stale,
  incomplete, unhealthy, already-resolved, candidate-now-present, or racing requests atomically.
  Keep-waiting retains unknown; abandon records visible non-publication without claiming absence;
  reattempt consumes approval and creates one numbered outbox attempt without confirming or
  advancing shadow.
- Treat GitHub Issue body writes as whole-value writes with no documented conditional-write/CAS.
  Double-fetch immediately before one serialized write, append only Secret-Safe normalized pre-write
  evidence, re-read the result, and expose a `potential_body_overwrite` conflict with side-by-side
  recovery whenever an intervening edit is observable. Never promise lossless preservation for an
  edit GitHub never exposed inside the final race window.
- Confirm identity-creating Issue/comment operations only through stable correlation plus verified
  App/provider identity. Idempotent set-field projections such as labels, milestone, state, and
  managed-body digest may converge after a permanently missed webhook only from a complete fresh
  snapshot, expected outbox state, and three-way authority validation; never invent an actor or
  event.
- Give every Issue create intent one immutable public-safe `create` UUID and retain it in every
  managed-body render/parser, Mirror Shadow, and pending/confirmed GitHub Issue Binding. Keep
  delivery `event` UUIDs separate and mutable; they can never recover create identity. Unknown
  create outcome recovery requires the immutable create UUID plus expected App/installation/request
  facts, even after later body/contract renders.
- Give a linked-existing Issue `origin=link`, `create=none`, and one immutable public-safe link UUID
  retained through every render/parser/shadow/binding. A link never fabricates App-create
  provenance, and no later body event may convert origin or replace either correlation identity.
- Classify every provider comment actor as `mapped_human`, `expected_opzava_app`,
  `third_party_app_or_bot`, or `unknown_or_deleted`, preserving immutable provider actor identity,
  kind, and mapping evidence. Only a mapped human becomes a Human Comment; only the fully correlated
  expected App confirms an outbox record. Every other class remains an attributed provider-backed
  external comment with zero human, agent, assignment, approval, or workflow authority.
- Map GitHub assignees by immutable provider user identity. Only an explicitly mapped human
  Execution Assignee is provider-projectable; AI agents, local/orchestrator identities, and humans
  without a GitHub-user mapping remain Opzava-only. Zero mapped provider users is therefore
  converged for an unassigned or Opzava-only-assigned DevTicket. One differing mapped user requests
  the ordinary exact-version assignment command; more than one opens a cardinality conflict and
  blocks start. Preserve every unmapped GitHub collaborator and apply only add/remove deltas for
  mapped identities; never replace the assignee array, fabricate an agent mapping, unassign an
  Opzava-only agent from provider absence, or infer Human Owner.
- Auto-merge concurrent changes to different shared fields. Append comments/worklogs. For concurrent
  changes to the same governed field, create a visible Sync Conflict. Contract, dependency,
  assignment, approval, and Sprint conflicts pause affected execution; harmless display metadata
  does not. Human Owner resolves governed conflicts in Opzava and the result mirrors to GitHub.
- Make `ResolveSyncConflict` the only same-field selection command. Bind it to the exact conflict
  version, field/bindings, base shadow, current Opzava aggregate/value version, complete fresh
  provider observation, selected safe value/digest, actor/session, authorization/policy versions,
  nonce, idempotency key, and request hash. Choices are keep exact Opzava, accept exact GitHub
  through the ordinary field owner, or apply an explicit Secret-Safe merge through that owner.
  Ordinary Revision/approval/gate rules still apply; a required decision keeps the conflict blocking
  and emits no mirror write. Atomically record one decision and `resolution_pending_mirror` outbox
  intent, but advance the Mirror Shadow and mark resolved only after exact provider confirmation.
  Reject stale versions/observations and racing decisions with no partial owner command, shadow, or
  outbox effect.
- Persist retryable outbound writes in a durable sync outbox with attempts, claims, backoff, last
  error, and confirmation. GitHub health reports authentication, repository access, required
  read/write permissions, webhook delivery freshness, rate limit state, replay/outbox lag, and
  reconciliation status.
- Scope health and recovery by App, installation, repository, capability, and affected DevTicket or
  fact. A successful probe alone never resolves unhealthy/unverifiable state: recovery also requires
  no ambiguous mutation or binding conflict and one complete post-repair reconciliation with
  dead/unknown inbox and outbox work explicitly drained, superseded, or conflict-bound.
- Treat suspected secret exposure and unhealthy or unverifiable GitHub integration as unbypassable
  Absolute Stops for affected execution and workflow gates. Other policy exceptions become
  version-bound Needs Human Approval Requests; approval never changes the two Absolute Stop classes.
- Automate agent-authored merge-conflict resolution in an isolated worktree, then rerun affected
  checks and independent Review. Do not give an execution agent a general-purpose ungoverned merge
  authority.
- Never expose a raw write-capable installation token to a Runner or worktree. A trusted Git
  transport broker validates the signed lease, nonce, exact ref, old/new SHAs, and pack/bundle hash,
  then performs the single authorized provider push; repository rulesets are defense in depth. A
  lost response enters the same Authorized Git Ref Update record: exact intended SHA confirms,
  unchanged old SHA stays bounded unresolved without blind retry, and any third SHA becomes a
  visible ref conflict requiring fresh authorization. No reconciliation path launches a duplicate
  remediation run.
- Accept Actions-originated command requests only through a short-lived GitHub OIDC protocol bound
  to an Opzava-specific audience, immutable repository, allowlisted workflow/reusable-workflow and
  SHA, run/attempt, actor/event, ref/SHA, DevTicket/action/expected versions, payload hash, and
  one-use nonce. Webhooks, labels, comments, actor names, and temporal matching are not command
  authentication. Atomically reserve unique issuer/token ID, scoped nonce, canonical request hash,
  and the corresponding ordinary command receipt so concurrent replay cannot produce a second or
  partial semantic request. Enforce the exhaustive `wf230` v1 Actions source policy: append native
  provider facts (including deployment facts as observations), request field-code-only
  `ready.validate`, or open an eligible Needs Human Approval Request. Reject generic governed
  commands and deployment/rollback/release mutations unless their owning domain and `wf230`
  explicitly add a versioned policy row; adapter configuration cannot widen it.
- Implement `DisconnectGitHub` as one idempotent saga per exact binding generation. Fence token mint
  and outbound claims, drain or retain unknown effects, and record provider uninstall/revocation/
  expiry separately from local cleanup. Lost provider responses remain `provider_outcome_unknown`;
  account-owner actions remain `revocation_required` in secure UI. Local deletion never proves
  provider revocation, reconnect stays disabled until terminal provider confirmation and cleanup,
  and a later reconnect creates a new binding generation while preserving prior history.
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
- Scope implementation capacity to each enrolled Runner, never to the organization as one global
  slot. Every admitted implementation consumes one fenced lease tied to the exact DevTicket
  contract/version, Runner, worktree, branch, and SHA. Admission and preset changes require an
  authorized command and durable audit record.
- Offer three implementation-capacity presets per Runner. **Focused** permits one total lease.
  **Balanced**, the default, permits two. **Custom** is available only within both the Runner's
  advertised capabilities and platform policy; missing, stale, or invalid capability data makes
  Custom unavailable rather than causing Opzava to guess a limit.
- Under Focused, keep the currently admitted work running and queue new contenders. Starting a
  different item or changing priority cannot silently preempt it: interruption requires the governed
  checkpoint, pause, and preemption rules. P0 follows the same command boundary.
- Under Balanced with an Active Sprint, reserve at most one lease for the Sprint's current serial
  DevTicket and admit at most one ordinary lease. An ordinary candidate must be Ready, outside the
  Sprint, explicitly claimed through policy, free of unresolved dependencies and exclusive-resource
  conflicts, and isolated on its own branch/worktree. A declared scope collision is a visible
  warning and coordination signal, not a promise that file sets are disjoint; later merge conflicts
  remain agent-remediated and must rerun affected checks and Review.
- Under Balanced with no Active Sprint, admit up to two ordinary DevTickets. If a Sprint is
  activated while both leases are running, do not terminate either: the Sprint enters Waiting for
  capacity until one completes or a human or authorized assistant approves a governed
  checkpoint/pause. After activation, do not admit a second ordinary lease.
- A Custom preset may admit only its safe, policy-approved total. With an Active Sprint it still
  reserves at most one serial Sprint lease; every remaining lease is ordinary. Reducing capacity
  never kills an admitted lease and instead blocks new admission until usage is within the new
  limit. No preset permits a second Active Sprint or lets Sprint automation use ordinary capacity
  for a second Sprint DevTicket.
- Do not automatically fail over an offline local runner to cloud execution. Lock the Claim Attempt
  and start-delivery evidence. If it is still `credential_provisioning` and exact evidence proves no
  start outbox/marker/process, create or reuse **Pre-Start Admission Loss**, stay Todo without
  Blocked, fence/revoke, and hold capacity/worktree until every grant/tunnel confirmation. If final
  activation/start enqueue won first, `start_pending` ambiguity—or started execution—produces
  `Blocked — Connection Lost / Execution Unknown`, preserves the last trusted checkpoint, and
  requires process/worktree reconciliation. Notify Slack with the branch-accurate continuation
  summary.
- Use Slack Personal Assistant as notification and bounded approval/control channel. Approvals are
  tied to the authenticated enrolled Admin, exact target/version/hash, one-time nonce, expiry,
  action, and audit record. Machine enrollment, raw secret entry, security configuration, and
  integration trust changes require Opzava's secure UI.
- Store no secret value on a Card, in GitHub, Slack, comments, logs, evidence summaries, or audit
  payloads. Cards contain named secret references and readiness/health only. Resolve values from an
  approved local keyring or vault under the active policy and lease.
- Configure one independent local Reviewer tool and model in Admin. Review must run on the user's
  local machine against the shared local Docker stack and an exact commit SHA. An accepted exact
  checkpoint/receipt moves a DevTicket into Review / Preparing Review and increments membership-only
  Review WIP, but retains its implementation lease, capacity, and worktree until no-process or
  stopped/quarantined proof and every lease-credential/tunnel revocation confirmation finalize the
  Review Handoff. Only then may fresh Reviewer provisioning or launch begin. Reviewer execution
  capacity and Review WIP are separate. The shared local Docker Review stack has one exclusive
  fenced lease. Queue only work that uses or mutates that stack, or would invalidate its locked-SHA
  evidence; unrelated coding may continue. Review evidence belongs on the Card and stays SHA-bound;
  Slack carries only notification and bounded decisions.
- Permit an authenticated, expiring, revocable preview tunnel to the local Docker stack. Bind it to
  Admin identity, DevTicket, Review, runner lease, exact build/SHA, and expiry. Revoke it on
  disconnect, lease loss, expiry, Absolute Stop, or explicit close.
- Define Sprint as a Goal plus versioned ordered plan for `autonomous_serial` execution, not a lane
  or a label applied to all work. Allow many Draft Sprints, at most one Approved and Queued Sprint,
  and at most one Active Sprint.
- Bind Sprint approval to Goal version, Plan version, ordered membership, each Ready contract
  version/hash, dependency graph, risk/approval state, runner and Reviewer policy, and named-secret
  readiness. Under exact graph/Plan/member versions, reject any order where an earlier member
  directly or transitively depends on a later member; the ordered Plan must be a topological order
  of its internal dependency subgraph. Material changes produce Needs Re-approval. Temporary
  liveness or integration health failures leave it Queued and block preflight.
- Require activation preflight: approved Goal and Plan, every member Ready, external dependencies
  Done, dependency-compatible internal order revalidated under the exact current graph/Plan
  versions, GitHub healthy and synchronized, chosen runner and Reviewer available, local Docker
  healthy, required named secret references resolvable, and no Absolute Stop.
- Permit exactly one Sprint implementation DevTicket In Progress in an Active Sprint. When its
  accepted exact checkpoint/receipt moves it to Review / Preparing Review, count it in Review WIP
  but retain implementation lease, capacity, and worktree until the Review Handoff finalizes from
  verified containment and every credential/tunnel confirmation. Only then may the next ordered Todo
  item be admitted subject to the Runner preset and admission policy. Ordinary leases never
  authorize a second Sprint DevTicket. Limit concurrent Review to three; when full, stop all new
  implementation claims and notify Slack without killing already admitted leases.
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
- Expose a read projection of Runner capacity, lease use, and waiting reasons to the Admin Overview
  specified by PRD-020. That surface may request authorized Dev Board commands but does not own
  admission, preset, lease, or Sprint state.
- Base Board on approved prototype Variant B with compact collapsible Backlog; base Card detail on
  Variant A with top-to-bottom reading flow and optional preview; base Sprints on Variant A with
  Sprint history. Follow Jira's information-architecture concept, not its proprietary styling.
  Support global light and dark themes.
- Make Card activity tabs Comments, History, Worklog, Agent Execution, and Review Evidence. Surface
  repository-native PR, branch/ref/SHA, commit, check, repository-review, and merge facts separately
  from Opzava-owned lease/binding/fence state and Runner-signed local process, worktree, branch,
  heartbeat, checkpoint, and Docker observations. Opzava is neither the source of GitHub-native or
  Runner-observed facts nor does accepting those facts transfer their source authority.
- End Development at merge into `development`. Keep Releases as a separate view governed by a
  distinct Release aggregate with lifecycle `Draft`, `Candidate`, `Staging`, `StagingApproved`,
  `ProductionReady`, `Released`, `Superseded`, and `Cancelled`. Release attention is a derived set,
  not lifecycle, and may independently include `NeedsHumanApproval`, `AbsoluteStop`,
  `HealthUnavailable`, `DeploymentUnknown`, `PublicationPending`, `RollbackRequired`, and
  `IncidentActive`. Never move Done cards backward because of release state.
- Seal an immutable Release Manifest from one Trusted Build Request bound to the exact frozen Draft
  revision, candidate SHA/tree, full DAG composition, deployment/config fingerprint, included Done
  DevTickets, trusted build provenance, per-service OCI digests, signatures/attestations, SBOM,
  Compose/config hashes, migrations/compatibility, named secret refs, required checks, and evidence.
  Observe the candidate reachable from protected `development`, and derive the base only from the
  immediately preceding governed Released tree or the one-time adopted baseline; reject
  caller-selected later bases, non-ancestry, rewrites, and ref drift. Build once in the trusted
  pipeline and deploy the same digest bundle to staging and production without rebuild. Local Docker
  Review artifacts are not Release artifacts. An RC-tag request freezes its Draft; terminal failure
  may continue only after trusted GitHub reconciliation proves the tag was never created and an
  explicit atomic command abandons the request/revision and creates a successor revision with a new
  RC reservation. Unknown, partial, existing, or possibly created tag state remains on the same
  frozen request. A terminal failed build may continue only after trusted proof that no artifact was
  published and an explicit atomic command that abandons the frozen request/revision and creates a
  successor revision with a new RC reservation. Partial or unknown artifacts remain quarantined on
  the same request and forbid parallel rebuild or RC reuse.
- Require deterministic observed staging verification followed by distinct explicit human Staging
  Approval and Production Approval. Promote protected `main`, confirm immutable RC/stable tags,
  deploy and observe exact production digests/health/smoke/stabilization, then confirm the native
  GitHub Release before `Released`. A provider `2xx` is never success. If production is live while
  publication is pending, stay `ProductionReady` with `PublicationPending` and retry publication
  without redeploying.
- Use environment-scoped fenced Deployment Leases and append-only attempts. Lease expiry revokes
  worker authority, not its fence; trusted reconciliation or confirmed provider cancellation must
  terminalize Unknown state before a higher fence is admitted. Successful staging retains a
  separately fenced Staging Occupancy. A newer sealed candidate requires an atomic higher-fence
  transfer after Released plus current observation, Cancelled/Superseded plus accepted
  `RestoreStaging`/non-current proof, or irreversibly bound ProductionReady plus an authorized
  linked forward fix, terminal known attempts, and exact current observation. Current per-service
  deployment truth remains separate from Last Known Good. Rollback is a new attempt to a previously
  verified immutable manifest and never rewrites `main`, tags, GitHub Releases, or old Release
  history.
- Treat GitHub Actions and Slack as request/relay surfaces only. The exhaustive v1 Actions policy
  does not include Release deployment/rollback commands; only a future versioned Release-owner and
  `wf230` policy amendment may add one. Suspected secret exposure and unhealthy or unverifiable
  GitHub reject ordinary release operations without bypass while safety-reducing containment remains
  authorized. Release and Incident lifecycles stay separate. The full command, evidence, saga,
  failure, approval, history, and test contract is canonical in
  `docs/plan/research/wf236-releases-gate-contract.md`.
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
- Keep Review internals fail-closed until its separately grilled contract is implemented. Apply the
  specified Releases Gate fail-closed until its aggregate, adapter, evidence, and UI behavior is
  implemented. No release behavior may be inferred from Done.

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
  as proposal, spoofed setup callback, exact-body signature failure, response-loss/unknown mutation,
  copied correlation marker, silently dropped provider mutation, permission loss, rate exhaustion,
  incomplete reconciliation, and recovery.
- Prove setup cannot bind another user's valid installation, Backlog mirror text cannot claim Ready
  without the exact approval, an Actions OIDC token/request cannot replay or cross repository/
  workflow/run/SHA, and a malicious Runner cannot obtain the write token or push any ref outside one
  authorized old/new-SHA broker operation. Also prove Actions provider-fact append (including
  deployment observations), field-code-only `ready.validate`, and eligible Needs Human Approval
  Request families work while a generic governed command or deployment/rollback/release request
  leaves zero integration/command receipt or domain mutation.
- Through the real local-Docker secure UI and the fixed scratch GitHub App, complete install with
  expiring user tokens, inject a lost user/refresh-token revocation response, and prove no binding
  or local zeroing occurs until GitHub confirms revocation/expiry. Inspect tenant HTTP/DB/browser
  projections and prove they expose only an opaque public App configuration key/rotation version,
  never a platform App registration ID, vault ref, secret-ref identity, or secret-ref version.
- Through the same real UI/provider seam, disconnect with a lost provider response and a separate
  provider-action-required case. Refresh/retry and prove one saga, outbound fencing, visible
  `provider_outcome_unknown`/`revocation_required` status and secure action, no false disconnected
  state or local cleanup, and no reconnect. After provider confirmation, prove terminal cleanup and
  a reconnect that creates a new binding generation while retaining prior evidence.
- Fault-inject an Authorized Git Ref Update response loss, then separately observe the intended new
  SHA, unchanged old SHA, and a third SHA. Prove confirmation, bounded unresolved escalation, and
  visible ref conflict respectively, with no blind push and exactly one remediation run/update
  record.
- Prove a complete reconciliation detects deletion of an old bound comment even when its webhook was
  missed. Because provider pagination is mutable, require two consecutive identical complete
  comment-ID/content-fingerprint traversals with stable available start/end collection observations;
  concurrent add/delete/edit or page drift restarts the proof and cannot declare absence/health.
  Also prove concurrent same/different-hash reuse of one Actions OIDC token/nonce yields exactly one
  atomic integration-plus-command receipt result.
- Prove create-response loss followed by a later contract/body render still recovers exactly one
  Issue through the unchanged `create` UUID, and that a changed/dropped create marker cannot fall
  back to a delivery `event` UUID.
- Fault-inject an Issue create and comment post whose provider objects appear only after repeated
  complete zero-match scans. Prove neither effect is automatically reissued, the late exact
  correlation binds once, and a separately approved numbered reattempt records its single-use Human
  Owner decision and contains any eventual duplicate deterministically.
- Prove linking a pre-existing Issue retains `origin=link`, `create=none`, and one immutable link
  UUID across every render/parser/shadow/binding without fabricating create history or permitting
  origin conversion.
- Prove copied markers from mapped humans, the expected Opzava App, third-party Apps/bots, and
  unknown/deleted actors retain exact actor classification: only mapped humans create Human
  Comments, only a fully correlated expected-App write confirms an outbox record, and external
  automation has no human/agent/approval authority.
- Prove a human edit in the final whole-body no-CAS window never receives a false lossless claim and
  exposes any detectable overwrite evidence for recovery; a permanently missed set-field webhook
  converges only from complete snapshot/authority proof; and zero/one/multiple/mixed mapped GitHub
  assignees preserve unmapped collaborators and block start deterministically when required. Prove
  an AI-agent/local-orchestrator Execution Assignee remains authoritative and converged when GitHub
  has zero mapped users, without fabricated mapping or false unassignment.
- Prove installation, repository-set, and repository-scoped webhook envelopes admit only their exact
  signed immutable IDs; action-bearing schemas require a valid action while actionless
  `create`/`delete`/`push`/`status` accept no invented action and reject schema/action disagreement;
  final setup fails after Admin demotion/session revocation; and platform App private-key,
  client-secret, and webhook-secret refs/values never enter tenant/browser data. Prove missing/
  wrong/retired client-secret exchange fails closed and audited rotation selects only an active
  version without exposing it.
- Prove concurrent `ResolveSyncConflict` requests, stale conflict/domain/provider observations,
  owner-command decision requirements, pending-mirror provider drift, and stale outbox finalizers
  yield one decision/intent, no premature shadow advance, and a visible fresh conflict.
- Prove concurrent `ResolveUnknownMirrorEffect` requests, stale observations/health/bindings,
  consumed approvals, and late provider appearance racing an approved numbered reattempt yield one
  decision/attempt, no automated absence inference, and deterministic correlation-based containment.
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
  material invalidation, exactly one serial Sprint implementation, Review WIP three, blocking
  Proposal, non-blocking Proposal, direct and transitive dependency ordering (including rejection of
  an earlier member that depends on a later member), pause, cancellation, abortion, completion, and
  immutable history.
- Test Runner-local capacity and preset transitions deterministically. Cover Focused contention and
  governed preemption; Balanced with one Sprint plus one ordinary lease; Balanced with two ordinary
  leases and no Sprint; Sprint activation waiting behind two existing ordinary leases; rejection of
  a second ordinary admission after activation; Custom safe-range validation and unavailability when
  capabilities are missing or invalid; and a downgrade that preserves leases while blocking new
  admission.
- Test ordinary eligibility and isolation: Ready and non-Sprint membership, explicit governed claim,
  dependencies, exclusive-resource conflicts, separate branch/worktree, visible declared-scope
  collision warning, agent-remediated merge conflict, and rerun checks/Review. Assert no preset can
  admit a second Active Sprint or a second concurrent Sprint DevTicket.
- Test material Revision while Todo credential provisioning is pending as live containment: fence
  the claim/lease, revoke pending or active credential/tunnel authority, retain capacity/worktree,
  and delay Backlog apply until no-process or stopped/quarantined proof plus every confirmation.
  Verify only a zero-grant Todo with no live claim/grant/tunnel uses the idle atomic path.
  Separately test disconnect/key/lease loss while still provisioning: prove no start was enqueued,
  remain Todo with a visible failed request and no Blocked Episode, hold resources until every
  confirmation, and race the same locks against final activation/start enqueue.
- Test Review Handoff separately from reviewer capacity: accepted exact checkpoint/receipt
  atomically freezes/fences the candidate, enters Review / Preparing Review, and increments
  membership-only WIP; implementation lease, capacity, and worktree remain held until no-process or
  stopped/quarantined proof and every credential/tunnel confirmation finalizes the Review Handoff.
  Assert reviewer provisioning/launch occurs only after finalization, evidence stays
  contract/SHA-bound, and the shared local Docker Review lease serializes only stack-mutating,
  stack-using, or locked-SHA-invalidating work while unrelated coding continues. At Review WIP
  three, assert new implementation claims stop without terminating already admitted leases. Cover
  prepared-candidate rebinding after a proven non-semantic correction, cancellation versus material
  Revision/execution-loss terminal races, immutable finalized history, and archive rejection for
  every Review member without WIP leakage. A material Revision after handoff finalization must keep
  finalized history immutable, require the exact #229-authenticated **Review Containment Proof** for
  stale Reviewer/Docker/tunnel/evidence authority, and then exit Review/decrement WIP/apply without
  stranding the interruption. Assert changes-requested and Done reject while that interruption is
  pending; if a verdict wins first, a later Revision re-evaluates from Todo or Done. An Absolute
  Stop affecting a finalized Review Handoff must preserve the handoff/Review WIP and require that
  same #229-owned proof over the distinct Reviewer process/lease, shared Docker session/lease,
  preview tunnel, and evidence authority before stop resolution. Normal changes-requested and Done
  must consume a distinct #229-authenticated Review Exit Containment Proof for the exact run/result/
  candidate and every Reviewer process/lease, shared Docker lease/session, test grant/tunnel, and
  artifact/evidence writer before Review exit and WIP decrement. PR/base-branch facts begin at #229
  reviewer launch, never at #230 Review admission.
- Test authorized/audited admission and settings changes plus disconnect fencing and reconciliation;
  assert no automatic local-to-cloud failover and no silent preemption. Verify the PRD-020 Admin
  Overview projection cannot mutate admission state outside the Dev Board command boundary.
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
- Test the two Absolute Stops separately from ordinary Needs Human Approval. Secret-exposure and
  unverifiable-GitHub states must reject bypass attempts through UI, Slack, GitHub labels, agent
  tools, runner receipts, and direct command APIs.
- Test the Releases Gate through deterministic command seams and a real authenticated Releases view:
  version reservation, exact composition, immutable RC/manifest/tag identities, trusted build-once
  facts, same-digest staging/production, fenced attempts, staging verification, separate human
  Staging/Production Approvals, protected-main promotion, publication pending, `Released`, unknown
  and mixed provider state, rollback, Incident links, and Cards remaining Done. Model output is not
  a release correctness oracle.
- Test secret absence across Release evidence, activity, outbox, provider logs, GitHub, Slack,
  exports, and UI. Test the two absolute stops against every request surface while still permitting
  only sanitized safety-reducing containment.

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
- Provider-specific implementation choices that the Releases Gate deliberately leaves for validated
  adapter work: the trusted builder/registry/signing products, exact Dokploy observation seams,
  approval expiry defaults, retention, and migration backup/restore implementation. Unknown provider
  behavior remains fail-closed and cannot weaken the canonical contract.
- Automatic cloud failover from a disconnected local runner. Pre-Start Admission Loss finalizes
  confirmation-gated no-start containment; a process-bearing lease pauses and reconciles before
  resume.
- A second Active Sprint or parallel implementation of two DevTickets from the Active Sprint. Runner
  presets govern ordinary-work concurrency but never weaken `autonomous_serial` Sprint order.
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
- The Releases Gate is specified by `docs/plan/research/wf236-releases-gate-contract.md`; its target
  implementation remains unbuilt. Until Review is specified and implemented, the system must fail
  closed before Done. Until Release mechanics and provider adapters are implemented, Releases must
  fail closed after Done rather than infer deployment state.
