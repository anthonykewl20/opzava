# ADR-017: Dev Board authority, synchronization, and execution receipts

## Status

Accepted — target architecture, 2026-07-15. Implementation and migration are not yet complete.

This ADR explicitly supersedes the following material **as active guidance for Opzava
platform-development work**, while retaining it as historical evidence:

- Q17, “Admin Tasks board as AI-Workforce dev pipeline,” in `docs/plan/grilling-decisions.md`.
- `docs/plan/consensus/tasks-ai-workforce-design.md`.
- The Tasks-first control framing and the separate native Tasks/Issues surface assumptions in
  `docs/plan/EXECUTION.md`.
- The platform-development Tasks/Issues portions of PRD-006, PRD-012, and PRD-013 where
  they conflict with PRD-019.
- Tracker issues #147–#157 as directly executable slices. They remain open historical/quarantined
  records and require replacement or explicit many-to-many mapping before implementation.

This ADR does **not** supersede ADR-004's transactional outbox, projection, idempotency, or
runtime-truth principles; ADR-008's general AI Workforce and `AgentDispatch` principles outside the
Dev Board bounded context; ADR-013's Incident/ErrorGroup authority; ADR-015's local-to-Dokploy
parity; or ADR-016's tracked Mainframe boundary. It narrows and extends those decisions for the
dedicated Dev Board.

## Context

The current product has two admin surfaces and two adjacent models for Opzava development. `/tasks`
is backed by a generic Project Management `Task` with statuses `todo`, `in_progress`, `blocked`, and
`done`, plus comments, steps, watchers, evidence, and quality records. `/issues` is backed by a
GitHub issue projection and issue create/close outbox behavior. Runtime-Control exposes
task-oriented tools, and the Q17 plan treats GitHub Issue, Task, PR, execution, and Review as a
linked pipeline.

The new product direction makes Opzava the primary operating surface and GitHub the durable
synchronized record. It adds a strict Ready contract, six guarded lanes, dependency rules,
independent Review, local runner enrollment, fenced execution receipts, Slack approvals, local
Docker verification, goal-driven Sprints, Docs, Development, and Releases views. Renaming current
`Task` to “DevTicket” would not be sufficient: the target has different identity, ownership,
authority, lifecycle, concurrency, revision, and retention semantics.

The design must prevent five forms of drift:

- **Identity drift:** a DevTicket must not become interchangeable with `pm.Card`, current `Task`,
  GitHub Issue, OpenClaw `workboard.Card`, or Incident/ErrorGroup.
- **Authority drift:** GitHub edits, labels, Actions, Slack buttons, local tools, and orchestrator
  commands must not bypass Opzava gates.
- **Execution drift:** an offline or stale runner must not continue under an expired lease or
  produce trusted receipts for changed work.
- **Ordering drift:** webhook delivery, runner receipts, Slack approvals, and Opzava events do not
  share a reliable global order.
- **History drift:** planning rationale, Card activity, runtime checkpoints, and synchronization
  conflicts have different meanings and must not be compressed into one ambiguous “activity” log.

The system also needs usable degradation. GitHub outages must not erase cached work, but gates that
require confirmed durable history must wait. A disconnected local machine must pause rather than
automatically fail over to cloud execution. Secret exposure and an unhealthy or unverifiable GitHub
integration are absolute stops, while other exceptions may become explicit Needs Human Approval
requests.

## Decision

Create a dedicated **Dev Board** bounded context. Its aggregate root is **DevTicket**. A **Card** is
a DevTicket projection used by Board, List, and detail views. A **GitHub Issue** is the durable
synchronized mirror of an accepted DevTicket. A **Proposal** is a pre-acceptance discovery and is
not mirrored until accepted. DevTicket is not generic Project Management `pm.Card`, current `Task`,
GitHub Issue, OpenClaw `workboard.Card`, or Incident/ErrorGroup.

The authority matrix is:

| Concern                                                                        | Authoritative owner                                    | Accepted projection or input                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Workflow lane and transition decision                                          | Opzava Dev Board                                       | GitHub status labels, Slack actions, UI drag/drop, agent tools, and runner messages are command requests only      |
| Ready contract and approved version/hash                                       | Opzava Dev Board                                       | Human-readable managed block mirrored to GitHub; GitHub edits become proposed revisions                            |
| Human Owner, Execution Assignee, Lead Orchestrator, Reviewer, Runner selection | Opzava Dev Board                                       | External identities and runtime refs are validated mappings, never authority by assertion                          |
| Dependencies and Sprint plans                                                  | Opzava Dev Board                                       | GitHub labels, Milestones, and tracking issues are synchronized projections                                        |
| Human approvals and conflict decisions                                         | Opzava Dev Board                                       | Slack can carry bounded decisions from an authenticated Admin; GitHub cannot approve a gate directly               |
| GitHub issue number and URL                                                    | GitHub                                                 | Stored on DevTicket as external identity and primary visible reference                                             |
| Pull request, commit, check, repository review, merge, tag, and release facts  | GitHub                                                 | Read and projected into Opzava; commands execute through the GitHub App and must confirm repository truth          |
| OpenClaw session, task, run, tool, and runtime health facts                    | OpenClaw                                               | Sanitized refs and projections accepted through the broker ACL                                                     |
| Process, worktree, branch, command, and checkpoint facts                       | Explicitly admitted local or orchestrator/cloud Runner | Signed receipts accepted only under the runner protocol below; local Docker Review facts remain local-runner-owned |
| Incident/ErrorGroup lifecycle                                                  | Notifications/Admin-Observability                      | Attention projection and linked remediation DevTickets in Dev Board                                                |

Use six lanes: `Backlog`, `Todo`, `Blocked`, `In Progress`, `Review`, and `Done`. Backlog is shaping
only. Todo requires an approved Ready snapshot. Claim atomically installs an Execution Assignee and
fenced lease before In Progress. Blocked records reason, last lane, and checkpoint and returns to
Todo after resolution. Review is mandatory and independent. Done is admitted only after the
applicable Review and approval have passed and the exact reviewed change is merged into
`development`. Staging and production are separate Releases concerns.

The Ready snapshot is version-bound and contains outcome, bounded scope, sad paths, edge cases,
acceptance criteria, dependencies, user-level E2E expectations, final behavioral contract, required
human inputs, named secret references, Human Owner, Type, Work Areas, Priority, optional Severity,
and Change Risk. Material changes invalidate approval and any evidence tied to the old contract.
Harmless comments and non-semantic metadata do not. Governed changes use a proposed revision with a
field-level diff, reason, actor, and consequences.

Represent blocking dependencies as explicit directed edges and reject cycles. A dependent DevTicket
cannot be claimed until every required dependency is Done. Review changes-requested returns the work
to Todo. It goes to the bottom by default and to the top when it blocks another DevTicket or the
Active Sprint Goal.

Use these classifications:

- Type: Feature, Bug, Improvement, Technical Task, Research/Spike, or Maintenance.
- Work Area: one or more of UI/UX, Frontend, Backend/API, Data/Database, Infrastructure, GitHub
  Integration, Agent Runtime, Security, and Documentation.
- Priority: P0, P1, P2, or P3.
- Severity: S0, S1, S2, or S3 where Bug or incident-impact semantics require it.
- Change Risk: Low, Medium, High, or Critical. Policy computes the minimum; actors may raise but not
  lower it. High and Critical require human approval.

Incident/ErrorGroup remains outside Dev Board authority. It may appear as an attention projection,
but it is never persisted as a DevTicket Type and is never Sprint eligible. Permanent remediation is
a linked Bug or Technical Task that follows the complete Dev Board workflow.

Use one GitHub App for deterministic two-way synchronization with the single Opzava repository in
v1. The issue body has a human-editable summary/context region and an Opzava-managed, human-readable
`Work Contract vN` region. Namespaced managed labels represent Dev Board classification and status
while unrelated repository labels remain untouched. A GitHub edit to a governed field or managed
contract is a proposed command/revision, not an authoritative mutation.

Comments and worklogs are append-oriented. Human comments synchronize one-to-one. Agent milestones,
pauses, failures, handoffs, and completion create immutable, attributed worklog comments. Review
emits a structured summary containing contract version, locked SHA, checks, verdict, and evidence
refs. High-volume execution telemetry stays in Opzava. Corrections append a new record rather than
rewriting relied-upon history.

Synchronization uses per-aggregate monotonic versions, GitHub delivery-ID deduplication, Opzava
event-ID deduplication, a durable outbound outbox, and snapshot reconciliation. There is no global
event order. Different-field concurrent changes auto-merge. Same-field governed changes create a
visible Sync Conflict. Contract, dependency, assignment, approval, and Sprint conflicts pause
affected execution. Human Owner resolves governed conflicts in Opzava and the selected state is
mirrored back.

GitHub integration health is capability-based: App authentication, repository access, required
read/write permissions, webhook freshness and verification, rate-limit state, outbox/replay lag, and
snapshot-reconciliation state. Retryable writes wait in the outbox. A gate that requires confirmed
GitHub history waits until the relevant write and reconciliation are confirmed. Suspected secret
exposure and unhealthy or unverifiable GitHub integration are absolute, unbypassable stops. Other
exceptions are explicit, version-bound Needs Human Approval decisions.

Enroll each local machine with an Admin-owned machine identity and public key. Tool selection is
explicit: Codex Desktop, Codex CLI, or Claude Code. An orchestrator/cloud Runner is a separate
explicitly admitted service identity bound from the start to the same lease, receipt, checkpoint,
branch, and worktree rules; it is never an implicit failover target and cannot perform the
local-only Review. Runner identity and execution-assignee identity remain distinct. Each DevTicket
execution uses its own worktree and branch.

A Runner receipt is trusted only when all of the following match:

- enrolled, non-revoked local machine key or explicitly admitted cloud service identity, with
  authenticated tenant/Admin binding;
- active lease ID plus current fencing token;
- one-time command nonce;
- monotonically increasing receipt sequence for that lease;
- exact DevTicket and Ready contract version/hash;
- expected repository, worktree, branch, and commit SHA identity;
- admitted tool/model capability and current policy.

Heartbeats renew liveness but do not replace receipts. Checkpoints record last confirmed
repository/process/Docker state and evidence refs. When a local runner disconnects or its lease
expires, fence the lease, revoke preview access, preserve the checkpoint, mark the execution
`Blocked — Connection Lost / Execution Unknown`, and notify the Admin through Slack with a
continuation summary. Do not automatically fail over to a cloud runner. On reconnect, reconcile
process, worktree, branch, SHA, dirty state, Docker, GitHub, lease, nonce, and sequence before
permitting resume.

Slack Personal Assistant is a notification and bounded approval channel. An actionable Slack
approval is bound to authenticated Admin identity, target aggregate, exact version/hash, allowed
action, one-time nonce, expiry, and audit record. Replay, expiry, role revocation, or target change
invalidates it. Slack never carries secret values. Machine enrollment, secret entry, and
security/integration trust changes require the secure Opzava UI.

The DevTicket stores named secret references and health; the Card displays them. Actual values
remain in an approved keyring or vault and are resolved under policy for the active lease. Values
must never enter GitHub, Slack, Cards, Docs, comments, worklogs, Review summaries, logs, preview
URLs, or audit payloads.

Review uses a configured fresh independent local Reviewer tool/model and the shared local Docker
stack. Evidence is bound to exact Ready contract version and commit SHA. A temporary preview tunnel
is authenticated, expiring, revocable, and bound to the runner lease and exact build. Detailed
Review Gate internals remain a separate specification; until it exists, Done fails closed.

Sprint is a versioned Goal and ordered DevTicket plan for `autonomous_serial` execution, not a Board
lane. Permit many Draft Sprints, at most one Approved and Queued Sprint, and at most one Active
Sprint. Approval snapshots Goal, Plan, membership/order, each Ready contract, dependency graph,
risk/approval state, runner/Reviewer policy, and named-secret readiness. Material changes produce
Needs Re-approval. Temporary health failures merely block activation and keep the Sprint Queued.

Activation preflight requires all planned work Ready, external dependencies Done, GitHub healthy and
synchronized, selected runner and Reviewer available, local Docker healthy, named secret references
resolvable, and no absolute stop. An Active Sprint permits one implementation DevTicket In Progress.
After that ticket enters Review, the next planned item may begin. Review WIP is limited to three; at
the limit, implementation stops claiming and Slack notifies the Admin. Scope changes use an approved
Plan revision. Sprint history is immutable and is mirrored to a GitHub Milestone plus tracking
issue.

Keep four separate ledgers:

1. **Planning decision ledger:** questions, recommendations, human decisions, rejected alternatives,
   unresolved items, contract and Plan revisions, and document versions.
2. **Dev Board activity/history ledger:** accepted product commands, lane changes, assignments,
   approvals, comments, dependencies, Review verdicts, and Done facts.
3. **Runner execution/checkpoint ledger:** leases, fences, command nonces, signed receipts,
   monotonic sequences, heartbeats, checkpoints, worktree/branch/SHA, Docker state, and reconnect
   reconciliation.
4. **Synchronization/outbox/conflict ledger:** webhook deliveries, provider events, deduplication,
   outbound attempts, confirmations, reconciliation, health changes, and conflict decisions.

Persist the planning decision ledger in Opzava Postgres under Dev Board Docs/Planning, with
versioned Markdown mirrors; it is durable and has no routine TTL. Persist the Dev Board
activity/history ledger in Dev Board-owned Postgres storage with a human-readable GitHub mirror; it
is immutable and durable. The Runner owns raw execution facts, while Dev Board persists accepted
receipts, checkpoints, and evidence references in Postgres; accepted records relied upon by gates or
history are durable, while high-volume raw telemetry may expire under a defined TTL. The Dev Board
integration module owns the synchronization ledger's Postgres outbox, delivery deduplication, and
conflict records; conflict decisions and final delivery confirmations are durable, while sanitized
raw webhook and retry payloads may age out after the replay and audit window.

No ledger stores secret values or raw unredacted provider payloads. When legal or security policy
requires redaction of a durable record, retain an attributable tombstone and integrity hash rather
than silently erasing history.

Cross-link these ledgers by stable IDs without pretending they have one ordering or retention
policy.

Migrate from current Tasks and Issues through expand-contract. Preserve Task UUIDs, card numbers,
GitHub links, comments, steps, watchers, evidence, quality records, activity, and timestamps.
Dual-read is temporary and exists only to compare old and new projections. Switch writes only after
reconciliation and acceptance checks. Redirect `/tasks` and `/issues` to `/dev-board` only after
verified cutover, then retire legacy routes, tables, tools, and active guidance. Never erase the
historical docs or tracker records that explain the pivot.

## Consequences

The administrator receives one primary operating surface without sacrificing GitHub's durable
repository record. GitHub remains useful independently because issue bodies, labels, comments,
worklogs, Review summaries, Milestones, and tracking issues are human-readable. Opzava can provide
stronger workflow, Sprint, local-runner, approval, and conflict semantics without claiming authority
over repository-native facts.

Dev Board becomes a new bounded context rather than a cosmetic rename. That increases initial
migration work but prevents Project Management, GitHub integration, OpenClaw Workboard, Incident,
and local execution concepts from collapsing into a single shallow model. Existing Task and Issue
code can be reused only behind explicit migration/adaptation seams; it is not the target domain
contract.

Synchronization is eventually consistent but deterministic and recoverable. Users may see pending
sync, stale projection, conflict, or reconciliation states. A GitHub outage does not erase readable
Opzava state, but gates requiring a confirmed mirror wait. Retry and reconciliation complexity is
accepted in exchange for no silent last-write-wins behavior.

Local autonomous work pauses when its machine disappears. This sacrifices automatic continuity in
exchange for avoiding duplicate writers, divergent worktrees, and competing leases. Recovery takes
an explicit reconciliation step and produces a useful Slack summary.

Independent local Review and Docker verification make completion more expensive than moving a card.
That cost is intentional. Until the separate Review contract is implemented, no DevTicket may reach
Done. Done ends at merge into `development`; staging and production remain separate and cannot be
inferred.

Slack improves away-from-machine responsiveness but is intentionally not a general administration or
secret channel. Expiring, version-bound nonces and secure-UI-only actions add friction where stale
or leaked messages would be dangerous.

Four ledgers add storage and cross-linking requirements, but they keep planning rationale, accepted
workflow history, runtime receipts, and integration reconciliation independently auditable.
Retention can expire raw logs without deleting contracts, approvals, relied-upon evidence, or
synchronized work history.

Migration must be staged and measurable. Old routes and models remain available long enough to prove
record completeness; they must not remain permanent competing authorities. Historical documents and
issues are retained with explicit supersession rather than rewritten to imply the new model always
existed.
