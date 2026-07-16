# ADR-017: Dev Board authority, synchronization, and execution receipts

## Status

Accepted — target architecture, 2026-07-15; Runner-capacity amendment accepted 2026-07-16; Releases
Gate amendment accepted 2026-07-17. Implementation and migration are not yet complete.

The WF-231 GitHub mirror amendment in this document is a **prepared inactive candidate** until
parent map #228 records verified #231 closure and the migration manifest designates it current for
#237. The previously accepted ADR remains current; staging this amendment does not activate it
early.

This ADR explicitly supersedes the following material **as active guidance for Opzava
platform-development work**, while retaining it as historical evidence:

- Q17, “Admin Tasks board as AI-Workforce dev pipeline,” in `docs/plan/grilling-decisions.md`.
- `docs/plan/consensus/tasks-ai-workforce-design.md`.
- The Tasks-first control framing and the separate native Tasks/Issues surface assumptions in
  `docs/plan/EXECUTION.md`.
- The platform-development Tasks/Issues portions of PRD-006, PRD-012, and PRD-013 where they
  conflict with PRD-019.
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
synchronized record. It adds a strict Ready Contract Version, six guarded lanes, dependency rules,
independent Review, local runner enrollment, fenced execution receipts, Slack approvals, local
Docker verification, goal-driven Sprints, Docs, Development, and Releases views. Renaming current
`Task` to “DevTicket” would not be sufficient: the target has different identity, ownership,
authority, lifecycle, concurrency, revision, and retention semantics.

The design must prevent six forms of drift:

- **Identity drift:** a DevTicket must not become interchangeable with `pm.Card`, current `Task`,
  GitHub Issue, OpenClaw `workboard.Card`, or Incident/ErrorGroup.
- **Authority drift:** GitHub edits, labels, Actions, Slack buttons, local tools, and orchestrator
  commands must not bypass Opzava gates.
- **Execution drift:** an offline or stale runner must not continue under an expired lease or
  produce trusted receipts for changed work.
- **Capacity drift:** Runner admission, preset changes, Sprint reservation, and Review resources
  must not be conflated into one organization-wide slot or silently preempt admitted work.
- **Ordering drift:** webhook delivery, runner receipts, Slack approvals, and Opzava events do not
  share a reliable global order.
- **History drift:** planning rationale, Card activity, runtime checkpoints, and synchronization
  conflicts have different meanings and must not be compressed into one ambiguous “activity” log.

The system also needs usable degradation. GitHub outages must not erase cached work, but gates that
require confirmed durable history must wait. A disconnected local machine must pause rather than
automatically fail over to cloud execution. Secret exposure and an unhealthy or unverifiable GitHub
integration are Absolute Stops, while other exceptions may become explicit Needs Human Approval
requests.

## Decision

Create a dedicated **Dev Board** bounded context. Its aggregate root is **DevTicket**. A **Card** is
a DevTicket projection used by Board, List, and detail views. A **GitHub Issue** is the durable
synchronized mirror of an accepted DevTicket. A **Proposal** is a pre-acceptance discovery and is
not mirrored until accepted. DevTicket is not generic Project Management `pm.Card`, current `Task`,
GitHub Issue, OpenClaw `workboard.Card`, or Incident/ErrorGroup.

The authority matrix is:

| Concern                                                                                                                                                         | Authoritative owner                                    | Accepted projection or input                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow lane and transition decision                                                                                                                           | Opzava Dev Board                                       | GitHub status labels, Slack actions, UI drag/drop, agent tools, and runner messages are command requests only                                                                                                                    |
| Ready Contract Version and approved version/hash                                                                                                                | Opzava Dev Board                                       | Human-readable managed block mirrored to GitHub; GitHub edits become proposed revisions                                                                                                                                          |
| Human Owner, Execution Assignee, Lead Orchestrator, Reviewer, Runner selection; Execution Lease authorization/binding/fence and governed branch/purpose binding | Opzava Dev Board                                       | External identities and signed runtime observations are validated inputs, never authority by assertion                                                                                                                           |
| Dependencies and Sprint plans                                                                                                                                   | Opzava Dev Board                                       | GitHub labels, Milestones, and tracking issues are synchronized projections                                                                                                                                                      |
| Human approvals and conflict decisions                                                                                                                          | Opzava Dev Board                                       | Slack can carry bounded decisions from an authenticated Admin; GitHub cannot approve a gate directly                                                                                                                             |
| GitHub issue number and URL                                                                                                                                     | GitHub                                                 | Stored on DevTicket as external identity and primary visible reference                                                                                                                                                           |
| Provider-native pull request, branch/ref/SHA, commit, check, repository review, merge, tag, and release facts                                                   | GitHub                                                 | Read and projected into Opzava; correlation to Runner refs never transfers execution authority; commands execute through the GitHub App and must confirm repository truth                                                        |
| Release desired lifecycle, immutable manifest, approvals, attempts, rollback decision                                                                           | Opzava Dev Board / Releases                            | GitHub Actions, Slack, agents, and provider callbacks are bounded requests/observations only                                                                                                                                     |
| Build provenance, signatures, SBOM, and immutable OCI digests                                                                                                   | Trusted build system and OCI registry                  | Verified and pinned into the immutable Release Manifest                                                                                                                                                                          |
| Deployment, effective per-service digests, routing, and environment health                                                                                      | Dokploy and target runtime                             | Source-versioned observations; Opzava keeps current deployment separate from Last Known Good                                                                                                                                     |
| OpenClaw session, task, run, tool, and runtime health facts                                                                                                     | OpenClaw                                               | Sanitized refs and projections accepted through the broker ACL                                                                                                                                                                   |
| Local process, worktree, branch, command, heartbeat, and checkpoint observations                                                                                | Explicitly admitted local or orchestrator/cloud Runner | Signed receipts are accepted only under the Opzava-owned lease/binding/fence state and runner protocol below; provider ref/SHA observations are separate correlation inputs; local Docker Review facts remain local-runner-owned |
| Incident/ErrorGroup lifecycle                                                                                                                                   | Notifications/Admin-Observability                      | Attention projection and linked remediation DevTickets in Dev Board                                                                                                                                                              |

Use six lanes: `Backlog`, `Todo`, `Blocked`, `In Progress`, `Review`, and `Done`. Backlog is shaping
only. Todo requires an approved Ready Contract Version and Ready Approval. Claim atomically installs
an Execution Assignee and fenced lease before In Progress. Blocked records reason, last lane, and
checkpoint and returns to Todo after resolution. Review is mandatory and independent. Done is
admitted only after the applicable Review and approval have passed and the exact reviewed change is
merged into `development`. Staging and production are separate Releases concerns.

Releases uses a separate `Release` aggregate. A mutable Draft seals into an immutable Release
Candidate and Release Manifest, then follows
`Draft -> Candidate -> Staging -> StagingApproved -> ProductionReady -> Released`, with terminal
`Superseded` and `Cancelled` available only before protected-main promotion/stable-tag creation
begins. Attention is an independently derived set: `NeedsHumanApproval`, `AbsoluteStop`,
`HealthUnavailable`, `DeploymentUnknown`, `PublicationPending`, `RollbackRequired`, and
`IncidentActive`.

The trusted pipeline builds each candidate's service images once from one immutable Trusted Build
Request bound to the exact frozen Draft revision, source SHA/tree, full DAG composition, and
deployment/config fingerprint. The candidate must be observed reachable from the protected
`development` ref/version, and its base is the immediately preceding governed Released tree or the
one-time adopted baseline; callers cannot choose a later base. The manifest binds that identity, OCI
digests, provenance, signatures/attestations, SBOM, deployment contract/config hashes,
migrations/compatibility, named secret refs, checks, Done DevTickets, and Review evidence. Staging
and production deploy the same digest bundle. Local Docker Review builds remain Review evidence and
are never Release artifacts.

A terminal failed RC-tag request does not unfreeze its Draft. Only trusted GitHub reconciliation
that proves the requested tag was never created permits `AbandonFailedFrozenDraftRevision` to close
the old request/revision and atomically create a successor Draft revision with a new RC reservation.
Unknown, partial, existing, or possibly created tag state remains frozen on the same request and
forbids a successor RC.

A terminal failed build with trusted proof that no artifact was published does not unfreeze its
Draft. The explicit `AbandonFailedFrozenDraftRevision` command atomically records abandonment of the
old request/revision and creates a successor Draft revision with a new RC reservation under the same
stable-version lineage. Partial or unknown artifact publication rejects abandonment and remains
quarantined on the same request; no parallel build or RC reuse is allowed.

Environment mutations use one active fenced Deployment Lease/attempt per shared staging or
production environment. Lease expiry revokes worker authority, not the fence; trusted effective
state reconciliation or confirmed provider cancellation must terminalize the attempt before a higher
fence can be admitted. Successful staging retains a separately fenced Staging Occupancy. A newer
sealed candidate requires an atomic higher-fence transfer after Released plus current observation,
Cancelled/Superseded plus accepted restore/non-current proof, or irreversibly bound ProductionReady
plus an authorized linked forward fix, terminal known attempts, and exact current observation.
Unknown or mixed provider state is recorded truthfully and reconciled before retry; current
per-service deployment is separate from Last Known Good. Deterministic staging verification precedes
distinct explicit human Staging and Production Approvals. RC-tag and native GitHub Release facts use
distinct request, observation, and deterministic-confirmation commands. Protected-main and
stable-tag facts use a committed request followed by deterministic confirmation that consumes
independently observed GitHub facts. Every confirmation binds exact provider receipts, times, and
evidence; callbacks and matching manual facts never confirm themselves. A provider `2xx` does not
advance lifecycle. Every content-bearing Release command inherits #230 Secret-Safe Ingress before
receipt, replay, persistence, audit, or outbox creation; pre-admission unauthorized and
suspected-secret content creates no Release receipt/rejection record.

Rollback is a new deployment attempt to a previously verified immutable manifest and never rewrites
`main`, tags, GitHub Releases, old manifests, or historical Release state. Release owns the
deploy/rollback command and Incident owns operational lifecycle. GitHub Actions may request
`NeedsHumanApproval` but cannot approve. Suspected secret exposure and unhealthy or unverifiable
GitHub remain unbypassable for ordinary release operations while sanitized safety-reducing
containment remains available. The complete command, approval, evidence, saga, failure, and test
contract is `docs/plan/research/wf236-releases-gate-contract.md`.

The Ready Contract Version is version-bound and contains outcome, bounded scope, sad paths, edge
cases, acceptance criteria, dependencies, user-level E2E expectations, final behavioral contract,
required human inputs, named secret references, Human Owner, Type, Work Areas, Priority, optional
Severity, and Change Risk. Material changes invalidate approval and any evidence tied to the old
contract. Harmless comments and non-semantic metadata do not. Governed changes use a proposed
revision with a field-level diff, reason, actor, and consequences.

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

The deep GitHub Integration module inside the Dev Board bounded context owns tenant binding
references to the admitted platform App registration, server-verified Installation and Repository
Bindings, ephemeral installation-token minting, provider transport, webhook inbox, mirror outbox,
provider observations, per-field Mirror Shadows, Sync Conflicts, reconciliation, and dimensional
health. The Dev Board owns every workflow command and decision. Installation and repository identity
use immutable provider IDs; callback values and mutable owner/name strings are never identity or
authorization. This module is the same Dev Board integration owner named by the four-ledger
decision, not a new bounded context.

The setup callback cannot bind a tenant from App authentication alone. The same authenticated Admin
must complete a one-time GitHub App user-authorization flow; an ephemeral user access token must
prove that the exact installation and repository are accessible to that GitHub user. The token and
refresh token are destroyed after the immutable association proof. The required GitHub App client
secret is resolved from its platform vault ref only for the bounded server-side authorization-code
exchange with exact redirect URI and PKCE verifier, then not retained by application state; only its
safe config/ref version and audited access outcome remain. App authentication then independently
confirms App, installation, repository, permissions, and events before binding. The final binding
transaction revalidates that same Admin's live session, tenant membership, and current
integration-admin authorization/policy version; demotion, revocation, expiry, tenant change, or
policy denial creates no binding. App registration and private-key/client-secret/webhook-secret ref
versions and rotation state remain platform-owned configuration behind provisioning/security-service
policy and audit, never tenant RLS data or browser output.

Webhook ingress bounds raw bytes and verifies the exact-body HMAC before parsing anything. It then
reads `X-GitHub-Event` only as an untrusted bounded schema hint and strictly parses the
corresponding non-persisting signed payload envelope: installation ID only for `installation`/
`installation_target` lifecycle, action plus installation/repository IDs for action-bearing
repository events, installation/repository IDs with no required or invented action for actionless
`create`/`delete`/`push`/`status`, or installation plus bounded added/removed repository-ID sets for
`installation_repositories`. It resolves the server-owned binding from those signed IDs, fully
parses the subscribed event schema and its schema-specific action presence/value, and cross-checks
both the envelope and header-selected event family. Only then does it apply Secret-Safe Ingress and
durably store a normalized safe receipt before acknowledging. Raw provider payloads are never
persisted. Workers may translate an authenticated provider fact into the same governed Dev Board
command boundary used by other clients, but cannot update the aggregate directly.

Comments and worklogs are append-oriented. Verified mapped-human comments synchronize one-to-one.
Agent milestones, pauses, failures, handoffs, and completion create immutable, attributed worklog
comments. Review emits a structured summary containing contract version, locked SHA, checks,
verdict, and evidence refs. High-volume execution telemetry stays in Opzava. Corrections append a
new record rather than rewriting relied-upon history.

Each Issue create intent owns one immutable public-safe `create` correlation UUID. The managed body,
all later render/parser results, Mirror Shadows, and pending/confirmed Issue Binding retain that
exact identity. Mutable outbox `event` UUIDs identify delivery attempts only and can never recover a
lost create response. Recovery requires the create UUID plus expected App, installation, repository,
and request facts, including after a later body or contract render.

A linked-existing Issue instead stores immutable `origin=link`, `create=none`, and one link
correlation UUID through every render/parser/shadow/binding. It never fabricates provider-create
provenance, and a later event cannot convert origin or replace either identity.

Inbound provider comment actors are classified as mapped human, expected Opzava App, third-party
App/bot, or unknown/deleted while retaining provider actor ID/kind and mapping evidence. Only a
mapped human may become a Human Comment; the expected App may only confirm an exactly correlated
outbox record. Other classes remain attributed provider-backed external comments with no human,
agent, assignment, approval, or workflow authority. Copied markers never upgrade actor class.

Synchronization uses per-aggregate monotonic versions, GitHub delivery-ID deduplication, Opzava
event-ID deduplication, a durable outbound outbox, and snapshot reconciliation. There is no global
event order. Different-field concurrent changes auto-merge. Same-field governed changes create a
visible Sync Conflict. Contract, dependency, assignment, approval, and Sprint conflicts pause
affected execution. Human Owner resolves governed conflicts in Opzava and the selected state is
mirrored back.

Mutable page exhaustion alone is not a complete comment-membership snapshot. Missing/deleted comment
classification requires two consecutive identical full ID/content-fingerprint traversals with stable
available start/end collection observations; concurrent add/delete/edit or page drift restarts the
proof. An incomplete or unstable traversal cannot declare absence or healthy recovery.

Each synchronized field has a last mutually confirmed Mirror Shadow. Reconciliation compares that
base with current Opzava and fresh complete GitHub values; it does not use timestamps, delivery IDs,
or provider-side compare-and-swap as order. The outbox guarantees a durable attempt, not
exactly-once provider mutation. A lost create/comment/body/label response becomes outcome-unknown
and must be resolved by stable correlation plus provider identity before any retry. For
identity-bearing Issue/comment effects, zero matches after any number of complete provider scans do
not prove absence and never authorize an automatic reissue. Only a version-bound, single-use Human
Owner resolution may explicitly accept duplicate risk and authorize a numbered reattempt; a late
original remains subject to immutable-correlation reconciliation and deterministic duplicate
containment.

`ResolveUnknownMirrorEffect` is the sole command for that zero-match decision. It binds the exact
unknown effect/version, immutable intent/correlation, complete observation epochs, current binding/
shadow/health/reconciliation versions, Human Owner authorization, single-use approval and explicit
choice. It atomically keeps waiting, records visible non-publication, or consumes approval to create
one numbered reattempt; it never treats scans as absence proof, confirms an effect, or advances a
Mirror Shadow.

GitHub Issue body updates are whole-value writes without a documented conditional-write/CAS, so
Opzava cannot promise lossless preservation of a human edit that GitHub never exposes inside the
final read/write race. The adapter double-fetches before one serialized write, retains only
Secret-Safe normalized pre-write evidence, re-reads, and exposes any detectable
`potential_body_overwrite` conflict with side-by-side governed recovery. Identity-creating
Issue/comment operations still require stable correlation and verified App/provider identity;
idempotent label/milestone/state/body-digest sets may converge after a permanently missed delivery
only from a complete fresh snapshot, expected outbox state, and three-way authority validation,
without fabricating an actor or event.

GitHub assignees map by immutable provider user identity. Only an explicitly mapped human Execution
Assignee is provider-projectable. An AI agent, local/orchestrator identity, or unmapped human
remains Opzava-only, so zero mapped provider users converges without unassigning it. One differing
mapped identity can request the ordinary exact-version assignment command; multiple mapped
identities create a blocking cardinality conflict. Unmapped collaborators remain provider-native and
preserved. Outbound sync uses mapped add/remove deltas only, never replaces the array, fabricates an
agent mapping, or infers Human Owner.

`ResolveSyncConflict` is the sole same-field selection command. It binds the exact conflict version,
field/bindings, base shadow, current Opzava aggregate/value version, complete fresh provider
observation, selected safe value/digest, actor/session, authorization/policy versions, nonce,
idempotency key, and request hash. Keep-Opzava, accept-GitHub, and explicit-merge choices all pass
through the ordinary field owner and cannot bypass Revision, approval, materiality, or gate rules. A
required owner decision leaves the conflict blocking and emits no mirror write. Once valid, one
transaction records the Human Owner decision and one `resolution_pending_mirror` outbox intent; the
Mirror Shadow advances and the conflict becomes resolved only after exact provider confirmation.
Stale or racing decisions, provider drift, and stale outbox finalizers produce no partial owner/
shadow/outbox effect and refresh the visible conflict.

GitHub integration health is capability-based: App authentication, repository access, required
read/write permissions, webhook freshness and verification, rate-limit state, outbox/replay lag, and
snapshot-reconciliation state. Retryable writes wait in the outbox. A gate that requires confirmed
GitHub history waits until the relevant write and reconciliation are confirmed. Suspected secret
exposure and unhealthy or unverifiable GitHub integration are absolute, unbypassable stops. Other
exceptions are explicit, version-bound Needs Human Approval decisions.

Review #229 remains the only owner of independent verdict and exact merge authorization; the GitHub
integration only dispatches an already-authorized merge and confirms native facts. Runner/trust #232
remains the only owner of fenced worktree/process execution and signed remediation receipts; the
integration may request conflict remediation but cannot launch an agent or grant general merge
authority. A raw write-capable installation token never reaches the Runner. The trusted Git
transport broker verifies one signed lease/nonce/exact-ref/old-SHA/new-SHA bundle request and
performs the provider push. A new remediation SHA invalidates stale evidence and returns through
independent Review.

GitHub webhook facts and labels cannot authenticate an Actions command. An allowlisted workflow uses
a short-lived GitHub OIDC token with an Opzava-specific audience and a canonical request. Opzava
verifies GitHub issuer/JWKS, expiry and single-use token ID, immutable repository,
workflow/reusable-workflow identity and SHA, run/attempt, actor/event, ref/SHA, command target,
expected versions, payload hash, and nonce before the ordinary trusted command boundary. One
transaction uniquely reserves `(issuer, jti)`, the scoped repository/command-family nonce, canonical
request hash, and corresponding trusted command receipt; concurrent reuse cannot commit a partial or
second semantic request. Labels remain projections.

Enroll each local machine with an Admin-owned machine identity and public key. Tool selection is
explicit: Codex Desktop, Codex CLI, or Claude Code. An orchestrator/cloud Runner is a separate
explicitly admitted service identity bound from the start to the same lease, receipt, checkpoint,
branch, and worktree rules; it is never an implicit failover target and cannot perform the
local-only Review. Runner identity and execution-assignee identity remain distinct. Each DevTicket
execution uses its own worktree and branch.

Implementation capacity is scoped to each enrolled Runner, not to the organization. Every admitted
implementation consumes a fenced lease tied to the exact DevTicket Ready Contract Version, Runner,
worktree, branch, and SHA. Admission and settings changes pass through authorized, audited Dev Board
commands. Use three presets:

- **Focused:** one total implementation lease. Current admitted work is not killed when work
  contends; new work queues. Starting a different item or changing priority requires the governed
  checkpoint, pause, and preemption rules. There is no silent preemption, including for P0.
- **Balanced (default):** two total implementation leases. With an Active Sprint, at most one is
  reserved for its single serial Sprint DevTicket and at most one may serve an ordinary DevTicket.
  An ordinary admission requires a Ready non-Sprint DevTicket, an explicit governed claim, no
  unresolved dependency or exclusive-resource conflict, and its own branch/worktree. Declared scope
  collision is a warning and coordination signal rather than a promise of disjoint files; later
  merge conflicts are agent-remediated and revalidated.
- **Custom:** permitted only within both Runner-advertised capability and platform-policy safe
  bounds. Missing, stale, or invalid capability data makes Custom unavailable. With an Active
  Sprint, at most one lease remains the serial Sprint lease and all others are ordinary.

Balanced may admit up to two ordinary DevTickets while no Sprint is active. Activating a Sprint
while both are running does not kill either lease: Sprint enters Waiting for capacity until one
completes or a human or authorized assistant approves a governed checkpoint/pause. Once the Sprint
is active, no second ordinary lease is admitted. A capacity downgrade never kills a lease; it blocks
new admissions until usage is within the limit. No preset admits a second Active Sprint or lets
Sprint automation borrow ordinary capacity for a second Sprint DevTicket.

A Runner receipt is trusted only when all of the following match:

- enrolled, non-revoked local machine key or explicitly admitted cloud service identity, with
  authenticated tenant/Admin binding;
- active lease ID plus current fencing token;
- one-time command nonce;
- monotonically increasing receipt sequence for that lease;
- exact DevTicket and Ready Contract Version/hash;
- expected repository, worktree, branch, and commit SHA identity;
- admitted tool/model capability and current policy.

Heartbeats renew liveness but do not replace receipts. Checkpoints record last confirmed
repository/process/Docker state and evidence refs. When a local runner disconnects or its lease
expires, lock the Claim Attempt and start-delivery evidence before choosing the outcome. If it is
still `credential_provisioning` and exact evidence proves no start outbox, accepted marker, or
process, create/reuse **Pre-Start Admission Loss**, fence/revoke, retain resources until every
grant/tunnel confirmation, and leave Todo without Blocked. If final activation/start enqueue won
first, the claim is `start_pending` and ambiguity produces
`Blocked — Connection Lost / Execution Unknown`; started execution uses the same Blocked path with
its checkpoint preserved. Notify the Admin through Slack and never automatically fail over to a
cloud runner. Reconnect reconciliation applies to any process-bearing branch before resume.

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
stack. An accepted exact submission atomically freezes/fences the candidate, creates a prepared
Review Handoff, moves the DevTicket to Review / Preparing Review, and increments the membership-only
Review WIP counter. Its implementation lease, capacity, and worktree remain held until finalization
proves no process exists or the process/worktree is stopped or quarantined and every
lease-credential and preview-tunnel revocation is confirmed. Only after that finalization may fresh
Reviewer authority be provisioned or launched. Reviewer execution capacity and Review WIP are
separate from implementation capacity. The shared local Docker Review stack has one exclusive fenced
lease: work that uses or mutates the stack, or would invalidate locked-SHA evidence, queues behind
it, while unrelated coding may continue. Evidence is bound to exact Ready Contract Version and
commit SHA. A temporary preview tunnel is authenticated, expiring, revocable, and bound to the
relevant Review/Runner authority and exact build. Detailed Review Gate internals remain a separate
specification; until it exists, Done fails closed.

Sprint is a versioned Goal and ordered DevTicket plan for `autonomous_serial` execution, not a Board
lane. Permit many Draft Sprints, at most one Approved and Queued Sprint, and at most one Active
Sprint. Approval snapshots Goal, Plan, membership/order, each Ready Contract Version, dependency
graph, risk/approval state, runner/Reviewer policy, and named-secret readiness. Material changes
produce Needs Re-approval. Temporary health failures merely block activation and keep the Sprint
Queued.

Activation preflight requires all planned work Ready, external dependencies Done, GitHub healthy and
synchronized, selected runner and Reviewer available, local Docker healthy, named secret references
resolvable, an available Sprint lease under the Runner preset, and no Absolute Stop. An Active
Sprint permits at most one Sprint implementation DevTicket In Progress. After that ticket enters
Review / Preparing Review, the next planned item waits until the Review Handoff finalizes and
releases its implementation lease, capacity, and worktree subject to admission. Review WIP is
independently limited to three; at the limit, no new implementation work is claimed and Slack
notifies the Admin, without killing leases already in progress. Scope changes use an approved Plan
revision. Sprint history is immutable and is mirrored to a GitHub Milestone plus tracking issue.

Admin Overview may project capacity, lease use, and waiting reasons under PRD-020, but it owns none
of the Dev Board admission, preset, lease, Sprint, or Review state described here.

Keep four separate ledgers:

1. **Planning decision ledger:** questions, recommendations, human decisions, rejected alternatives,
   unresolved items, contract and Plan revisions, and document versions.
2. **Dev Board activity/history ledger:** accepted product commands, lane changes, assignments,
   approvals, comments, dependencies, Review verdicts, and Done facts.
3. **Runner execution/checkpoint ledger:** signed local process, worktree/local-branch, command,
   receipt, monotonic-sequence, heartbeat, checkpoint, Docker, and reconnect observations correlated
   to Opzava-owned lease, fence, and command-nonce refs. The lifecycle records and decisions do not
   live in this ledger.
4. **Synchronization/outbox/conflict ledger:** webhook deliveries, provider events, deduplication,
   outbound attempts, confirmations, reconciliation, health changes, and conflict decisions.

Persist the planning decision ledger in Opzava Postgres under Dev Board Docs/Planning, with
versioned Markdown mirrors; it is durable and has no routine TTL. Persist the Dev Board
activity/history ledger in Dev Board-owned Postgres storage with a human-readable GitHub mirror; it
is immutable and durable. The Runner originates and owns only its signed raw local execution
observations under the Opzava-owned lease/binding/fence authority, while Dev Board persists accepted
receipts, checkpoints, and evidence references in Postgres; accepted records relied upon by gates or
history are durable, while high-volume raw telemetry may expire under a defined TTL. The Dev Board
integration module owns the synchronization ledger's Postgres outbox, delivery deduplication, and
conflict records. Conflict decisions, dedupe identity/hash/disposition, and final delivery
confirmations are durable. Only normalized Secret-Safe facts, request hashes, and provider refs may
persist; no raw webhook or retry request body enters a ledger. Non-authoritative normalized
diagnostic detail may age out after its named replay/audit window without deleting those durable
identities or decisions.

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

Runner-local presets admit bounded ordinary parallelism without weakening Sprint serial order.
Balanced uses otherwise idle capacity for one ordinary DevTicket alongside the Active Sprint, or two
ordinary DevTickets when no Sprint is active. Admission may wait during activation or a capacity
downgrade because preserving fenced work is safer than killing it. Declared scope collisions remain
coordination signals and merge conflicts remain agent-remediated; the architecture does not claim it
can prove changing file sets are disjoint.

Independent local Review and Docker verification make completion more expensive than moving a card.
That cost is intentional. Separating implementation capacity, reviewer capacity, Review WIP, and the
one shared-Docker lease prevents unrelated coding from being serialized behind evidence collection
while preserving SHA-bound proof. Until the separate Review contract is implemented, no DevTicket
may reach Done. Done ends at merge into `development`; the separately specified Releases Gate starts
after Done and cannot be inferred from it.

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

The legacy `GITHUB_TOKEN`/PAT Issue path and OAuth App device-flow connection are migration sources,
not alternate target credentials. Cutover drains or classifies every create intent and close-outbox
row, reconciles provider orphans/unknown outcomes, proves App-backed bindings and full convergence,
then revokes provider credentials where possible and removes their local refs and write paths.
