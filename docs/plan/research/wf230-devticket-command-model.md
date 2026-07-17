# WF-230 — DevTicket aggregate and governed command model

**Ticket:**
[#230 — Reconcile DevTicket commands, claims, Blocked, revisions, dependencies, and archive](https://github.com/anthonykewl20/opzava/issues/230)
· map [#228](https://github.com/anthonykewl20/opzava/issues/228)<br> **Date:** 2026-07-16<br>
**Status:** resolved design input; no product code or production schema is implemented by this memo

> **WF-232 compatibility amendment:** The Process Registration → Enforcer arm → typed grant-
> activation → start ordering below is a prepared inactive correction until reviewed #232 landing,
> tracker closure, and the matching #228 pointer designate it current. WF-230's existing accepted
> aggregate authority remains current meanwhile.

## Decision summary

The target is a dedicated Dev Board write model, not an extension of the legacy Project Management
`Task` aggregate.

1. **`DevTicket` is the workflow aggregate root.** It owns the approved work contract binding,
   current lane, Human Owner, current Execution Assignee, current Sprint membership ref, archive
   overlay, current Blocked Episode, and monotonic aggregate version. A Card is a rebuildable read
   projection.
2. **Proposal, Dependency Edge (`DependencyEdge`), and Execution Lease (`ExecutionLease`) are
   separate write-side records with their own invariants.** A Proposal is not executable; an edge
   spans two DevTickets; Dev Board Execution Admission owns a lease's lifecycle, while higher-churn
   signed Runner observations are retained in the separate execution/checkpoint ledger.
3. **Every source invokes the same application command boundary.** The server derives actor and
   source from authenticated transport evidence, evaluates command-specific authorization and
   policy, and never trusts actor/source fields asserted in a payload.
4. **Every mutating command is tenant/workspace-scoped, idempotent, and multi-record
   concurrency-checked.** The same idempotency key and canonical request hash—including the
   authenticated principal, verified source, tenant/workspace, command, and target—replays the first
   result only after current reauthorization; any mismatch is a conflict or authorization failure.
   An explicit expected-version set prevents a stale UI, Slack action, GitHub webhook, or agent from
   overwriting any Proposal, DevTicket, Ready, graph, Runner, Sprint, or resource record the command
   touches.
5. **Opzava state and durable effects commit before external I/O.** Aggregate changes, the accepted
   activity event, relevant planning/Runner records, and provider outbox intents commit in one
   Postgres transaction. GitHub and Runner calls occur only after commit.
6. **Claim and start are a two-phase application saga.** The first transaction atomically assigns
   the actor, reserves Runner capacity, and grants a fenced lease while the Card remains in Todo.
   Every claim enters `credential_provisioning` and remains there through accepted process
   registration, accepted Lease Enforcer arm, and one typed secret-grant activation result; a zero
   grant set uses the same sequence with an empty successful activation. Only that admitted result
   enters `start_pending` with an armed start deadline. A verified `ExecutionStarted` receipt is
   first persisted/deduplicated in the Runner inbox; an internal transition worker, not the Runner,
   loads current lane queues and moves it to In Progress. Unrelated queue churn retries that
   idempotent transition and never loses the truthful receipt. Until transition, the Card remains
   Starting and contained. A signed start rejection proving no process began opens Start Rejection
   Containment; only its confirmation-gated finalizer releases and returns claim-created assignment
   authority to safe Todo. An ambiguous timeout or missing acknowledgement invokes execution loss,
   moves it to Blocked, and retains containment until stopped/quarantined proof.
7. **Blocked is one of the six lanes and requires a Blocked Episode (`BlockedEpisode`).** A
   dependency lock, archive overlay, and Historical Projection are not lanes: an incomplete
   dependency leaves a Card visibly locked in Todo; archive removes the record from active lanes
   while preserving its last lane; imported completion appears only as a read classification in the
   Historical Projection and does not prove the new Done gate.
8. **Ready Approval is an exact version binding.** Validation and approval are separate. Approval
   revalidates under lock and binds contract version/hash, dependency-set version/hash, policy
   version, risk, Human Owner, required-input state, and named-secret-reference set—never secret
   values. A Needs Human Approval Request is a separate exact-action, contract/policy-bound,
   expiring, single-use exception record and cannot represent either Absolute Stop.
9. **Material revisions fail closed.** When credential provisioning, execution start, active work,
   or uncertain presence exists, prepare/finalize creates a pending interruption, fences authority,
   and retains capacity/worktree containment. Contract apply, approval/evidence invalidation, and
   Backlog entry require authenticated `no_process_started` or stopped/quarantined proof plus every
   confirmation. Backlog and Todo with no live claim/grant/tunnel revise atomically under their
   existing rules. A governed non-semantic carry-forward creates a new exact-version approval record
   referencing the prior approval; the old approval is never silently reused.
10. **The four ledgers remain separate.** Accepted commands cross-link planning rationale, workflow
    history, Runner facts, and synchronization facts by stable IDs. They do not manufacture one
    global order or duplicate raw payloads into every stream.

These choices consume the locked boundaries: Opzava owns workflow plus Ready Contract and Ready
Approval authority; GitHub owns its native repository facts; an admitted Runner owns execution
observations; Review remains local and independent; and no adapter may bypass the same commands
(`docs/adr/ADR-017-dev-board-authority-sync-execution.md`,
`docs/plan/dev-board-foundation-decisions.md`).

## Primary evidence and as-built gap

### Locked target evidence

- PRD-019 makes `DevTicket` a dedicated aggregate, Proposal a separate pre-acceptance record, and
  current Tasks/Issues migration inputs rather than target authority
  (`docs/prd/PRD-019-dev-board.md`).
- The target has six guarded lanes, version-bound Ready, governed revisions, explicit dependencies,
  distinct actor/Runner roles, and command adapters rather than direct UI moves
  (`docs/prd/PRD-019-dev-board.md`).
- ADR-017 assigns authority by concern and requires atomic assignment plus a fenced lease before In
  Progress, a reasoned Blocked Episode, fresh recovery through Todo, independent Review, and
  merge-confirmed Done (`docs/adr/ADR-017-dev-board-authority-sync-execution.md`).
- The architecture requires tenant-scoped Postgres transactions, RLS as a fail-closed backstop, and
  a durable outbox in the same transaction as domain state (`ARCHITECTURE.md`).
- Planning, workflow, Runner, and synchronization are explicitly four different ledgers with
  different authorities and retention (`docs/adr/ADR-017-dev-board-authority-sync-execution.md`).
- The foundation decision ledger fixes the Ready fields, material invalidation behavior, dependency
  semantics, actor attribution, archive behavior, and fresh-claim recovery
  (`docs/plan/dev-board-foundation-decisions.md`).

### What exists today and must not become the target by accident

- The legacy `Task` has only `todo`, `in_progress`, `blocked`, and `done`, one user assignee, a flat
  priority, labels, and position (`packages/project-management/src/domain/task.ts:4-27`). It has no
  Ready Contract Version, Human Owner, agent identity, claim, lease, dependency graph, Proposal,
  archive, or gate evidence binding.
- `moveTask` currently authorizes a generic update and writes status/position directly; it has no
  legal-transition graph or gate checks
  (`packages/project-management/src/application/tasks.ts:1745-1824`).
- The legacy role adapter grants Task CRUD to owner/admin/member and exposes only generic
  read/create/update/delete actions
  (`packages/project-management/src/application/authorization.ts:13-74`). The target needs command
  capabilities, source policy, and role separation rather than renaming that adapter.
- Current task events contain only create/update/move fields and are exported without a durable
  event/outbox producer in the Task command path
  (`packages/project-management/src/events/task-events.ts:1-27`). They are not enough to reconstruct
  approval, dependency, lease, Blocked, archive, or attribution decisions.
- Existing Task create shows useful local patterns—`withTenant`, a transaction-scoped advisory lock,
  an idempotency lookup, and a unique constraint—but not the new aggregate contract
  (`packages/project-management/src/application/tasks.ts:1454-1551`).
- The issue-close worker already demonstrates `FOR UPDATE SKIP LOCKED`, stale-claim reclamation, and
  a claim token that fences late finalizers
  (`packages/project-management/src/application/issues.ts:935-1057`,
  `packages/identity-access/drizzle/0009_slice25_outbox_claim_token.sql:1-8`). Reuse the pattern,
  not the table or semantics: a provider-outbox claim token is not a Runner execution lease.
- Current issue creation calls the provider between two database transactions and can leave a failed
  intent after GitHub succeeded (`packages/project-management/src/application/issues.ts:737-799`).
  Proposal acceptance must instead create a durable provider intent in the same transaction as the
  accepted DevTicket so retry/reconciliation, not rollback fiction, repairs the mirror.
- The migration manifest already forbids bulk-promoting old Todo, minting leases around unknown
  processes, or treating legacy Done as proof of the new Review gate
  (`docs/plan/dev-board-migration-manifest.md`).

## Domain and module boundaries

### Write-side aggregates and records

| Boundary                                                     | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Must not own                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proposal` aggregate                                         | discovery summary, evidence refs, blocking assessment, suggested classification/scope/dependencies, affected Goal/DevTickets, discovering agent/Lead Orchestrator author, decision state, decision actor/reason, archive overlay                                                                                                                                                                                                                                                                   | a human-authored direct-work request, workflow lane, Ready Approval, execution assignment/lease, or GitHub Issue identity before acceptance                                                                |
| Revision                                                     | stable ID, target DevTicket, exact base contract/dependency versions, governed diff/hash, reason/source, materiality, exact state (`AwaitingDecision`, `AcceptedPendingApplication`, `Applied`, `Rejected`, or `AbortedAfterAcceptance`), actor/reason                                                                                                                                                                                                                                             | a Ready Contract Version, applied mutation, or Sprint Plan revision                                                                                                                                        |
| `DevTicket` aggregate root                                   | internal UUID, one-repository identity, aggregate version, current contract head and approved Ready binding, active lane, Human Owner, current Execution Assignee, current Blocked Episode ref, current Sprint membership ref, mirror state/ref, queue rank, archive overlay                                                                                                                                                                                                                       | GitHub-native PR/check/merge truth, raw Runner process truth, Incident lifecycle, Sprint Plan/aggregate state, raw ledger payloads                                                                         |
| Ready Contract Version (`ReadyContractVersion`)              | immutable canonical contract document, semantic/governance fields, content hash, author/source, predecessor and version reason                                                                                                                                                                                                                                                                                                                                                                     | mutable approval flags, outside-contract metadata, or live dependency completion state                                                                                                                     |
| Ready Approval (`ReadyApproval`)                             | exact Ready Contract Version/dependency/policy/input binding and approver, approval/carry-forward kind, authorization versions, expiry/revocation where policy requires it                                                                                                                                                                                                                                                                                                                         | a permanent approval that survives a material Revision                                                                                                                                                     |
| Needs Human Approval Request (`PolicyExceptionRequest`)      | exact target/action/contract/policy binding, safe reason/scope, requester/source, state, approver/nonce/expiry, revocation and one-use consumption refs                                                                                                                                                                                                                                                                                                                                            | Ready Approval, a lane, an Absolute Stop bypass, or reusable authority                                                                                                                                     |
| Blocked Episode (`BlockedEpisode`)                           | category, safe reason, prior lane, responsible actor/dependency ref, last trusted checkpoint ref, notification state, opened actor/time, closure disposition (`resolved` or `superseded`) and actor/time                                                                                                                                                                                                                                                                                           | the Runner checkpoint body, Dependency Edge graph, active Execution Lease, or a false claim that a superseded condition resolved                                                                           |
| Dependency Edge (`DependencyEdge`)                           | stable edge ID, dependent ID, blocker ID, edge version, actor/reason, active/retired state                                                                                                                                                                                                                                                                                                                                                                                                         | either DevTicket's whole aggregate; copied blocker status                                                                                                                                                  |
| Claim Attempt (`ClaimAttempt`)                               | claim ID, target contract/approval/dependency versions, claimant, selected Runner, status (`credential_provisioning`, `start_pending`, `started`, `failed`, `fenced`), optional provisioning deadline in provisioning and start deadline only in `start_pending`, retry refs                                                                                                                                                                                                                       | process truth or reusable authority after failure                                                                                                                                                          |
| Claim Admission Deferred (`ClaimAdmissionDeferred`)          | wait ID, terminal original command receipt, original verified claimant/requester and source, authorization policy/version, enrollment/capability refs, exact target/gate refs, monotonic retry sequence, retry/notification refs, and active/consumed/cancelled/superseded disposition                                                                                                                                                                                                             | a Claim Attempt, Execution Lease, reusable original key, or permission after an invalidating change                                                                                                        |
| Claim Requested (`ClaimRequested`)                           | stable request ID, originating approval command, original verified requester/principal and source, intended claimant, authorization policy/version, selected Runner enrollment/capability refs, exact DevTicket/contract/Ready/dependency/assignment/Sprint/health/gate refs, worker key, and active/consumed/cancelled/superseded disposition                                                                                                                                                     | worker-owned claimant authority, a Claim Attempt, reusable authority after drift, or permission to skip current admission checks                                                                           |
| Execution Lease (`ExecutionLease`)                           | lease ID, Runner ID, DevTicket/contract binding, fencing token, capacity class, issue/expiry/release state, last accepted sequence/checkpoint refs                                                                                                                                                                                                                                                                                                                                                 | Human/agent identity, lane, or permission to self-approve Review                                                                                                                                           |
| Runner Containment Request (`RunnerContainmentRequest`)      | stable request ID and purpose (`block_execution` or `absolute_stop`), DevTicket/containment/Blocked Episode/Absolute Stop refs, exact lease ID, old and advanced fence tokens, Runner process registration/version or explicit unknown, worktree identity/path binding, requested checkpoint plus stop-or-quarantine action, one-use request nonce, delivery refs, and authenticated confirmation/disposition refs                                                                                 | proof that a process stopped, permission to infer containment from database fencing, or a caller-authored reconciliation snapshot                                                                          |
| Lease Credential Access Grant (`LeaseCredentialAccessGrant`) | Opzava/Dev Board-owned lease ID, exact Ready-approved named-secret ref IDs, broker/local grant refs (never values), status (`pending`, `active`, `revocation_pending`, `revoked`, `provision_failed`), versions, and activation/revocation confirmation refs                                                                                                                                                                                                                                       | the underlying secret/credential, Secrets authority, or reusable reviewer/successor access                                                                                                                 |
| Review Handoff (`ReviewHandoff`)                             | exact candidate hash/current contract head/equivalence lineage, implementation lease/grant/tunnel disposition refs, expiry, state (`prepared`, `cancelling`, `finalized`, `cancelled`, `superseded`, `failed`), cancellation actor/nonce, terminal Revision or Blocked Episode/detector ref, confirmation refs, and version                                                                                                                                                                        | Review membership, reviewer authority, or reversible implementation credentials                                                                                                                            |
| Review Exit Containment Proof (`ReviewExitContainmentProof`) | authenticated #229 owner fact bound to exact Review Handoff/run/result/candidate and Reviewer process/lease, shared Docker lease/session, test credential grants/tunnel, artifact/evidence writers, terminal dispositions, and proof version                                                                                                                                                                                                                                                       | a Review verdict, Material Revision/Absolute Stop containment proof, PR/base fact created before reviewer launch, or permission to exit/decrement WIP early                                                |
| Review Merge Authorization (`ReviewMergeAuthorization`)      | single-use #229-governed authorization bound to exact Review Exit Containment Proof, Review Handoff/run/result/candidate, contract/evidence and active Revision/interruption versions, reviewed PR/base/head, merge policy, authorization actor/version, dispatch outbox, and provider confirmation                                                                                                                                                                                                | a GitHub merge fact, authority to dispatch before proof, a Review verdict, or permission to admit Done without the matching confirmed dispatch                                                             |
| Review Admission Retry (`ReviewAdmissionRetry`)              | stable job ID bound to original validated submission intent, original verified requester/principal/source plus membership/role/session/enrollment/key authorization refs and versions, exact checkpoint/candidate/SHA/equivalence lineage, active/cancelled/consumed state, monotonic next-attempt sequence, last attempt disposition, and one idempotent Slack notification ref                                                                                                                   | a Review Handoff, worker-owned submission authority, frozen evidence, a reusable command key across changed queue versions, or permission to submit different work                                         |
| Execution Binding Carry-Forward                              | immutable equivalence ID binding original claim/lease/evidence contract version to an exact current Ready Contract Version/Ready Approval, classification policy/hash, and predecessor                                                                                                                                                                                                                                                                                                             | mutation of the original Execution Lease, permission expansion, or proof a protected change is non-semantic                                                                                                |
| Sprint Plan Revision Grant (`SprintPlanRevisionGrant`)       | approved one-use authorization bound to exact old/new contract, dependency graph, Sprint Plan/member/approval versions, policy, approver, and expiry                                                                                                                                                                                                                                                                                                                                               | general Sprint approval, standalone DevTicket authority, or permission for an unrelated mutation                                                                                                           |
| Sprint Plan Binding Carry-Forward                            | immutable equivalence ID binding an approved nonterminal Sprint member's old/new Ready Contract Version and Ready Approval to its exact Plan/member/approval binding and non-semantic classification                                                                                                                                                                                                                                                                                               | a Sprint Plan revision, broad approval reuse, or permission for a material change                                                                                                                          |
| Material Revision Interruption                               | `AcceptedPendingApplication` Revision, affected execution/containment refs, source branch (`live_implementation_handoff`, `finalized_review`, or non-Review), exact Review Handoff/reviewer-containment requirement and proof refs where applicable, optional provisioning-loss/start-rejection source refs plus deterministic no-start/no-process proof, finalization nonce, stop/checkpoint state, and safe terminal disposition                                                                 | an `Applied` Revision, a rewrite of finalized Review Handoff history, a second Pre-Start/Start Rejection finalizer for the same claim, or proof that database fencing stopped a process                    |
| Pre-Start Admission Loss (`PreStartAdmissionLoss`)           | exact `credential_provisioning` claim/lease/fence; initiating cause; provider failure ID, provisioning deadline/retry epoch, authorized cancellation nonce, and detector epoch where applicable; append-only later-cause refs; explicit absence of a Material Revision Interruption for the claim; cancelled provision/start-delivery refs; deterministic `no_start_enqueued`/`no_process_started` proof; grant/tunnel disposition and confirmation refs; failed-request reason; lifecycle/version | a Blocked Episode, evidence that Runner execution started, permission to release before every containment confirmation, or a lifecycle coexisting with a Material Revision Interruption for the same claim |
| Start Rejection Containment (`StartRejectionContainment`)    | exact `start_pending` claim/lease/fence/start nonce, authenticated signed rejection receipt and deterministic `no_process_started` proof, explicit absence of a Material Revision Interruption for the claim, grant/tunnel disposition and confirmation refs, held capacity/worktree and claim-created-assignment refs, failed-request reason, lifecycle (`containing` or `finalized`), version                                                                                                    | a Blocked Episode, Pre-Start Admission Loss, an accepted start, direct release from a revoke confirmation, or a lifecycle coexisting with a Material Revision Interruption for the same claim              |
| GitHub Issue Binding                                         | unique repository/Issue ownership reservation, DevTicket ref, source observation/create intent, provider version, and reconciliation state                                                                                                                                                                                                                                                                                                                                                         | a caller-asserted URL, GitHub workflow authority, or duplicate link                                                                                                                                        |
| Absolute Stop                                                | type, affected scope, safe evidence hash/ref, affected named credential/secret refs, derived LeaseCredentialAccessGrant refs, preview-tunnel refs, existing Blocked containment-owner refs, finalized-Review #229 requirement/proof refs where applicable, active/resolved state, remediation/health/reconciliation refs, actor/policy versions                                                                                                                                                    | a Needs Human Approval Request, second Blocked/Review containment finalizer, bypass token, raw secret payload, or external credential/tunnel system truth                                                  |
| Ledger records                                               | one authoritative immutable fact in the appropriate ledger plus stable cross-ledger refs                                                                                                                                                                                                                                                                                                                                                                                                           | a second mutable copy of the DevTicket aggregate                                                                                                                                                           |
| Card/List/Board projections and Historical Projection        | denormalized display state, counts, source freshness, and imported/frozen/archived read classification                                                                                                                                                                                                                                                                                                                                                                                             | command authority, inferred transitions, an executable aggregate, or proof current gates passed                                                                                                            |

`DevTicket` is the only aggregate that can decide its lane. Dependency Edge is separate because the
invariant spans two DevTickets and requires graph-wide cycle prevention. Execution Lease is separate
because Dev Board's admission/fence/release lifecycle has different invariants from the Runner's
signed heartbeat, process, checkpoint, and receipt observations, which also have a higher write rate
and distinct retention policy. GitHub Issue Binding is the unique ownership registry for provider
identity rather than a field inferred from a mirror projection. The application service coordinates
these records transactionally where an invariant crosses boundaries; no aggregate calls GitHub,
Slack, or a Runner adapter.

The neighboring Sprint boundary owns the versioned Goal, Plan, membership state, and Plan order.
DevTicket stores only its current Sprint membership reference so cross-boundary admission and
archive commands can lock and validate exact membership/Sprint versions without copying or mutating
the Plan.

### Module seams

The delivery graph should create a dedicated Dev Board package/context with these internal seams:

1. **Work Contract module:** Proposal, DevTicket, contract versions, Ready validation/approval,
   revisions, archive, and lane transition policy.
2. **Dependency module:** Dependency Edge mutation, cycle checks, dependency-set version/hash,
   completion lock, and downstream-critical ranking queries.
3. **Execution Admission module:** assignment, Claim Attempt, Runner capacity reservation, Execution
   Lease grants/fencing/releases, and fresh-claim recovery. It depends on a `RunnerControlPort` but
   not a Codex/Claude/OpenClaw client type.
4. **Activity module:** immutable accepted-command/domain-fact journal and projection outbox.
5. **Integration module:** GitHub managed-mirror outbox/inbox/dedupe/conflict records. It implements
   the Dev Board-facing `DevBoardMirrorPort` facade and consumes focused provider capabilities; it
   cannot mutate the DevTicket except by an authenticated command request.
6. **Projection module:** Board/List/Card/history builders with independent checkpoints. It is
   disposable and rebuildable from current write state plus accepted facts.

Sprint, Review, Docs, Incident, Admin Overview, and Releases remain neighboring modules or bounded
contexts. They request DevTicket commands through stable application ports. In particular, #230 does
not invent Review verdict internals that belong to
[#229](https://github.com/anthonykewl20/opzava/issues/229) or release promotion that belongs to
[#236](https://github.com/anthonykewl20/opzava/issues/236).

## Command envelope, authentication, and authorization

### Trusted command envelope

Every command handler receives a server-constructed envelope:

```text
CommandEnvelope {
  commandId
  idempotencyKey
  requestHash
  organizationId, workspaceId
  targetAggregateId
  expectedVersions[] { recordKind, recordId, version }
  actorRef { kind, stableId, role }
  source { kind, verifiedDeliveryOrSessionRef }
  principalAuthorizationRefs[] { membershipOrRoleBindingId, version }
  sourceAuthorizationRefs[] { sessionId, machineEnrollmentId?, keyAuthorizationId?, version }
  authorizationVersion
  correlationId, causationId
  targetContractVersion?
  targetContractHash?
  approvalNonce?
  runnerRef?
  leaseRef?
  receiptSequence?
}
```

The two identifiers are not aliases. `idempotencyKey` is the caller/delivery retry identity scoped
to the verified command namespace. After preliminary authorization succeeds, the server reserves the
first attempt and assigns one immutable `commandId`; every replay of that same authorized key
returns the same `commandId`. Domain events, ledger cross-links, correlation, and audit use
`commandId`, while retry dedupe uses `idempotencyKey`.

The transport adapter may provide raw credentials, delivery IDs, or signatures, but it may not
choose the trusted actor/source fields. The BFF, Slack adapter, GitHub App webhook verifier, Runner
protocol verifier, Sprint controller, and migration tool each map authenticated evidence to a
principal before calling the application service.

### Source and actor policy

The following table is the exhaustive v1 source/principal set. Adding a source or widening a row is
a versioned policy change, not an adapter implementation detail.

| Source/principal                                                                                     | May request                                                                                                                                                                                                                                                                       | Never grants itself                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Secure Admin UI + enrolled Admin session                                                             | all human-authorized shaping, Proposal/Ready/exception decisions, assignment, dependency/Revision decisions, archive/restore, bounded operational control                                                                                                                         | GitHub/Runner facts it has not observed; a Review verdict                                                                   |
| Human Owner                                                                                          | shape owned Backlog work, approve exact Ready, choose assignment, block owned active execution, decide revisions/conflicts, archive safe work                                                                                                                                     | Runner capacity, Reviewer independence exception, Absolute Stop bypass                                                      |
| Authenticated human/agent through an enrolled Runner/local-harness session                           | `ready.validate` with a field-filtered result; ordinary `ClaimAndStart` for eligible Todo matching assignment/capability policy; success makes it Execution Assignee; as original requester only, bounded `WithdrawCredentialProvisioningClaim` for its own exact pre-start claim | Ready Approval, dependency mutation, archive, Review approval, Done, or post-lease authority beyond bounded self-withdrawal |
| Execution Assignee through an authenticated Runner lease                                             | `ready.validate` with a field-filtered result; start receipt, checkpoints/worklogs, block request, propose Revision, Review submission; an agent assignee may draft a Proposal for separately discovered work                                                                     | Ready Approval, dependency mutation, archive, Review approval, Done, or direct DevTicket creation for a discovery           |
| Lead Orchestrator / Personal Assistant                                                               | draft agent-discovered Proposals; request `CreateBacklogDevTicket` only from explicit human shaping; validation requests, notifications, and commands explicitly delegated by policy                                                                                              | bypassing Proposal for an autonomous discovery; Human Owner, Execution Assignee, Reviewer, or unrestricted Admin authority  |
| Slack Personal Assistant                                                                             | exact action or exception decision named by a valid one-time, version/hash-bound, unexpired nonce from the enrolled Admin                                                                                                                                                         | secret entry, machine enrollment, trust/security changes, open-ended command authority                                      |
| GitHub App webhook                                                                                   | append verified GitHub-native facts, request a managed-field command/Revision, and request `ready.validate` with safe field-code-only result under App capability policy                                                                                                          | workflow transition, Ready Approval, assignment, dependency, or Done by label/body assertion                                |
| GitHub Actions through an OIDC-authenticated request corroborated by verified App/provider run facts | open a scoped Needs Human Approval Request for an eligible failed policy gate, report native check/deployment facts, and request `ready.validate` with safe field-code-only result                                                                                                | direct bypass, approval, secret-exposure bypass, unhealthy/unverifiable-integration bypass, or Done                         |
| Local or admitted cloud Runner                                                                       | signed ordered execution observations for its own active lease and `ready.validate` for its bound DevTicket with a field-filtered result                                                                                                                                          | actor identity, a different Runner's capacity, stale-lease continuation, local Review from cloud                            |
| Sprint controller                                                                                    | claim the next exact member in the approved Plan under current admission policy                                                                                                                                                                                                   | plan edits, a second Sprint item, bypass of Ready/dependency/capacity/health gates                                          |
| Reviewer                                                                                             | Review commands defined by the approved Review contract                                                                                                                                                                                                                           | implementation authority, its own implementation's approval, direct merge/Done                                              |
| Runner execution-loss detector                                                                       | the idempotent internal execution-loss command for verified disconnect, lease expiry, or revocation                                                                                                                                                                               | a human decision, an unverified failure assertion, or filesystem/GitHub containment proof                                   |
| Dev Board internal gate/reconciliation workers                                                       | expire/revoke bounded records, open/resolve Absolute Stops from verified evidence, consume verified inbox facts, reconcile imports/projections, and request system-controlled transitions                                                                                         | external facts not present in verified inbox evidence or policy exceptions not already approved                             |
| Migration service                                                                                    | idempotent import commands under an explicit migration epoch and disposition                                                                                                                                                                                                      | new-gate approval or fabricated intermediate history                                                                        |

V1 is Admin-only, but that does not justify one coarse `member:update` permission. Command
capabilities must be distinct (`proposal.decide`, `ready.approve`, `ticket.assign`, `ticket.claim`,
`ticket.block`, `dependency.manage`, `ticket.archive`, and so on). Every decision records the real
actor role, named identity, source surface, applicable Runner, and `authorizationVersion`; role
labels in a request body are audit metadata only after they match the authenticated principal. This
implements the attribution contract in `docs/plan/dev-board-foundation-decisions.md` and the
fail-closed RLS rule in `ARCHITECTURE.md`.

### Needs Human Approval Request is a separate exception record

An eligible policy failure creates a Needs Human Approval Request (`PolicyExceptionRequest`); it
never mutates an ordinary Ready Approval and never changes a lane by itself. The immutable request
binds:

- request ID, target DevTicket and proposed command/action;
- exact contract version/hash, expected-version set, policy ID/version/hash, and current risk;
- safe request reason, requested scope, requesting actor/source, and correlation/command refs;
- state (`pending`, `approved`, `rejected`, `expired`, or `revoked`), approver identity, one-time
  approval nonce, expiry, and decision/revocation reason; and
- the single-use authorization token/ref consumed by the eventual retried command when approved.

`OpenPolicyException` re-evaluates the failed gate and rejects Absolute Stops. Suspected secret
exposure and unhealthy or unverifiable GitHub integration can only produce containment/health
records; they cannot produce an approvable bypass. `ApprovePolicyException` and
`RejectPolicyException` require the enrolled Admin/Human Owner permitted by policy and the exact
version/hash/nonce. Slack can carry that exact bounded decision. GitHub Actions, UI, an agent, or
the Lead Orchestrator may request an eligible exception but cannot approve it by assertion.
`ExpirePolicyException` is time-driven and idempotent; `RevokePolicyException` handles role loss,
policy withdrawal, security containment, or explicit human revocation. Material target/contract or
policy change, approver-role revocation, nonce replay, or expiry invalidates the request before use.

An approved exception authorizes exactly one new execution of the bound command under current
authorization; it is not the command result. The retry consumes the exception token in the same
transaction as the governed state change. Planning owns the request rationale and policy-evaluation
inputs. Dev Board activity/history owns the authoritative open/approve/reject/expire/revoke and
single-use consumption facts. Slack/GitHub delivery attempts live only in the synchronization
ledger. Each ledger cross-links the request ID without copying the decision into multiple sources of
truth.

### Absolute Stop is an explicit unbypassable record

Suspected secret exposure and unhealthy or unverifiable GitHub integration open an Absolute Stop;
they are not represented by a failed validator flag or a Needs Human Approval Request. A verified
internal `OpenAbsoluteStop` command binds the stop type, affected organization/workspace/repository/
DevTicket scope, safe evidence hash and references, affected named credential/secret refs, every
derived Lease Credential Access Grant, and preview-tunnel grant refs where applicable,
detector/policy versions, and actor/source. It never stores a raw secret, credential value, or
tunnel token.

Under the complete expected-version and queue set, opening the stop atomically creates or reuses the
active scoped record, revokes every eligible pending/approved Needs Human Approval Request in scope,
blocks Ready/admission/Review/Done and provider-dependent gates, and fences affected starting or
active execution. Affected execution enters Blocked with a Blocked Episode and unresolved
containment hold. For every possibly live process it also creates or reuses the exact
`RunnerContainmentRequest`, bound to the lease, old/advanced fence, process registration (or
explicit unknown), worktree, stop scope, and one-use nonce, and atomically enqueues its checkpoint
plus stop-or-quarantine Runner delivery. Non-running work remains in its lane but cannot cross a
governed gate. Concurrent exception consumption, claim/start, or lane commands take the same
policy/scope locks: if the stop opens first they fail; if an accepted command commits first, the
stop observes that state and fences or contains it in the same opening transaction. No race creates
bypass authority.

Under the canonical scope-before-Revision order, `OpenAbsoluteStop` also locks the exact Material
Revision Interruption version or explicit none for affected provisioning, `start_pending`, In
Progress, and `prepared`/`cancelling` Review execution. If an interruption already owns that
authority, the stop appends its stable stop/evidence/scope ref to the interruption and reuses its
fence, revocation, checkpoint/stop, Review Handoff, and confirmation set. It preserves the lane and
Review WIP and creates no second Blocked Episode, `RunnerContainmentRequest`, Review containment
request, release owner, or finalizer. Only the interruption Finalize/Abort may release resources or
choose the lane/contract outcome. `ResolveAbsoluteStop` additionally requires the exact no-process/
stopped-or-quarantined proof and confirmations recorded by that owner, but resolves only the stop
and never duplicates release. With explicit no interruption, the ordinary active/finalized-Review
branches apply.

If affected execution is already Blocked, `OpenAbsoluteStop` locks the current Blocked Episode, its
exact containment owner/finalizer, and its `RunnerContainmentRequest` before the stop. It appends
the Absolute Stop cause/scope to that owner and creates/reuses the same request and delivery; it
does not open a second Blocked Episode, containment lifecycle, resource-release owner, or finalizer.
Dev Board's `ReconcileRunnerContainment` command remains the sole process/worktree release decision
and finalizer for an ordinary Blocked containment, using the Runner's signed confirmation only as
proof input (or the already-owning Material Revision finalizer remains sole where applicable).
`ResolveAbsoluteStop` resolves only the stop after shared containment is safe; it never closes the
Blocked Episode or releases the same resources again. `ResolveOrSupersedeBlock` later owns the
separate reasoned Blocked lane exit.

If the affected Card is in Review with a `finalized` Review Handoff, opening the stop preserves that
immutable handoff and Review membership/WIP. It locks the exact handoff/review run and creates or
reuses an `AbsoluteStopReviewContainmentRequired` record/outbox for #229, bound to the distinct
Reviewer lease/process, shared Docker session/lease, preview tunnel, and evidence authority. The
ordinary implementation `RunnerContainmentRequest` cannot stand in for those authorities. Only an
authenticated #229-owned Review Containment Proof matching every binding can mark that requirement
accepted; `ResolveAbsoluteStop` rejects until it consumes that proof plus the stop's other scoped
remediation/confirmation legs. Neither command rewrites finalized Review Handoff history or infers
containment from a database fence.

For secret exposure, that same transaction marks every affected named credential/secret ref revoked
or quarantined; locks and revokes every Lease Credential Access Grant derived from those refs with
distinct lease-grant events and external revocation outboxes; and revokes local preview-tunnel
authority. Underlying credential, lease-grant, and preview authorities remain separate facts.
External credential stores and tunnel controllers confirm those effects asynchronously; no network
call occurs under the transaction. The stop, local authority revocation, execution fence/Blocked
containment, and outbox intents commit together or none commit.

`ResolveAbsoluteStop` requires branch-specific proof: a secret-exposure stop requires confirmed
credential revocation/quarantine or safe rotation plus confirmed derived lease-grant revocations and
preview-tunnel closure/revocation and affected Runner/worktree/GitHub reconciliation. For affected
possibly live execution, that reconciliation must consume the authenticated Runner confirmation for
the exact `RunnerContainmentRequest`; local fence, credential, or tunnel revocation alone is never
stopped/quarantined proof. Finalized-Review scope additionally requires the exact accepted #229
Review Containment Proof above. A GitHub-health stop requires restored verified GitHub capability
health plus reconciliation. It also requires current policy authorization and the exact stop
version. It records resolution but grants no Ready Approval, exception, claim, or lane transition;
callers retry the ordinary governed command under current state. Neither command accepts a bypass
token.

## Idempotency, concurrency, and transaction contract

### Idempotency rules

- Transport authentication and source verification happen before command-receipt reservation. A
  tenant/workspace context that does not match the authenticated principal is a hard 403 before any
  receipt lookup. For both replay and new attempt, the tenant transaction first locks every exact
  principal membership/role binding, source session, machine enrollment, and key-authorization row
  named by the trusted envelope, then reauthenticates the source and authorizes the command family/
  target under those versions before reading or reserving a receipt. Membership/session/enrollment/
  key revocation takes the same locks, so either the command authorizes first under the old version
  or revocation wins and no replay/result is exposed. An authentication/authorization denial never
  claims an idempotency key and never exposes an existing result.
- A required application idempotency key is unique within
  `(organization_id, workspace_id, command_name, idempotency_key)`. Store its canonical
  `requestHash`, target, actor, verified source, accepted/rejected outcome, resulting aggregate
  versions, assigned `commandId`, and result ref. Principal/source/target are also in the canonical
  hash, so namespace and hash both prevent cross-actor replay. The same raw key may be used
  independently in another authorized organization, workspace, or command namespace; it creates or
  replays only that namespace's receipt.
- The canonical hash covers the authenticated principal, verified source, organization/workspace,
  command name, target, expected versions, and semantic payload. Same key + same hash and the same
  principal returns the recorded result only after current authorization to that family/target is
  rechecked; domain policy and external effects are not rerun.
- Inside one authorized namespace, the same key with a different hash, principal, source, target, or
  semantic payload returns `idempotency_conflict` or 403; it never reveals or repurposes the first
  command's result. Different tenant/workspace/command namespaces are never probed for a match.
- After an authorized reservation, a domain-policy/precondition rejection is terminal for that key.
  A caller that intentionally retries after state changes uses a new key.
- UI uses a generated command UUID. Slack uses installation/action ID plus the one-time nonce.
  GitHub uses delivery ID plus event/action. Runner uses lease ID plus command nonce and monotonic
  receipt sequence. Sprint uses Sprint/Plan/member/attempt identity. Migration uses source
  table/record/cutover-epoch.
- Provider delivery dedupe and Runner nonce/sequence checks remain in their own ledgers. They are
  not overloaded into the application command key.

### Optimistic and pessimistic concurrency

- Every command declares an expected-version set for **every mutable record it may touch or rely on
  for authority**: exact principal membership/role bindings, source session, machine enrollment, and
  key authorization; Proposal, DevTicket, current contract/Ready binding, dependency graph or edge
  set, Dev Board Execution Admission for the selected Runner, active admission wait/retry, Review
  Handoff, material/stop reviewer containment requirement/inbox proof, Review Exit Containment
  Proof, global Review WIP counter, Sprint reservation, GitHub Issue Binding, Absolute Stop, lane
  queue/archive membership, and exclusive-resource reservation as applicable. Credential
  provisioning loss also names the active Revision/Material Revision Interruption, Pre-Start
  Admission Loss, exact claim/grant/tunnel versions, provision/start outbox state, and deterministic
  no-start/no-process proof inputs. Signed start rejection names those records plus Start Rejection
  Containment. Immutable version IDs/hashes are still named explicitly. Missing, extra, or
  mismatched expected state is a concurrency conflict with zero partial writes.
- Lock order is fixed across commands: tenant/workspace policy and Absolute Stop scope; exact
  principal membership/role bindings, source sessions, machine enrollments, and key-authorizations
  in kind then sorted-ID order; mutable policy-exception rows in sorted ID order; Proposal;
  DevTickets in sorted UUID order; Ready/current-head rows; Revision/Material Revision Interruption;
  current Blocked Episode; dependency graph/edges; GitHub Issue Binding keys in repository/Issue
  order; GitHub integration health/reconciliation rows; Sprint aggregate, Plan, member, approval,
  grant, then reservation rows in sorted ID order; active Review Handoff rows in sorted ID order,
  then mutable reviewer containment requirements, Review Exit Containment Proof, and verified inbox
  rows, then the global Review WIP counter; durable admission wait/retry rows
  (`ClaimAdmissionDeferred` first by ID, then Review retry intent); Dev Board Execution Admission/
  Claim Attempt arbitration for the selected Runner, then Pre-Start Admission Loss and Start
  Rejection Containment rows in that order; underlying named secret-reference/credential records,
  then lease-scoped credential-access authority/grant rows, then local preview-tunnel
  grant/authority rows, each in sorted ID order; exclusive resources in sorted key order; lane
  queues in canonical lane order; command receipt/outbox append points. Absolute Stop, Ready,
  dependency, Sprint, Review, Runner, and both retry paths use this same order and never acquire
  records in caller order.
- Every membership, role, source-session, enrollment, or key revocation command uses that same
  prefix and bumps the authorization version under lock. No handler may authorize from a cached
  role/source object and acquire its governed domain rows later.
- Dependency mutation also takes one tenant/workspace dependency-graph transaction lock, then runs
  cycle detection against the locked active graph.
- Any accepted material Ready Contract Version/Ready Approval, assignment, lane, or Sprint
  membership/Plan change locks and cancels or supersedes the DevTicket's active
  `ClaimAdmissionDeferred` row in the same transaction. A retry can therefore never claim between
  the invalidating change and wait cancellation.
- An active `PreStartAdmissionLoss(containing)` or `StartRejectionContainment(containing)` is a live
  containment lock even though its Claim Attempt is terminal `failed` and its Execution Lease is
  fenced, and the Card remains Todo. Every command that could change assignment, contract/Ready
  authority, dependencies, lane/queue membership, claim, archive/restore state, or contained
  resources declares and locks the exact loss version or explicit-none state before mutation. While
  containing, assignment/clear, claim, Todo reorder, ordinary lane changes, archive/restore,
  dependency mutation, `ApplyNonSemanticCorrection`, and `AcceptRevision` reject with zero partial
  writes. `AcceptRevision` leaves the Revision `AwaitingDecision`; it never uses the idle Todo path
  or creates a second interruption. The allowed writers are the owning containment's named
  source/confirmation/finalization commands and stricter security containment. Secret-Safe
  comments/worklogs and outside-contract display, watcher, and read metadata may append because they
  touch none of the fenced authority or held resources and cannot clear/finalize containment.
- Material Revision Interruption is mutually exclusive with both no-process containment records for
  one Claim Attempt. Provision-loss and signed-rejection commands lock the active Revision/
  Interruption first. If the Material Revision Interruption already owns that claim, they append the
  exact source identity and deterministic no-start/no-process proof to it and emit only the
  corresponding source fact; they create no Pre-Start Admission Loss or Start Rejection Containment
  and only `FinalizeMaterialRevisionInterruption`/`AbortMaterialRevisionInterruption` may release or
  choose the lane/contract outcome. If either containment record wins first, `AcceptRevision`
  rejects/defer as above. A unique live-containment constraint plus the canonical lock order makes
  two finalizers for one claim impossible.
- Claim preparation declares the DevTicket, Dev Board Execution Admission row for the selected
  Runner, global Review WIP counter, exact Sprint Plan/member/reservation where relevant, and
  conflicting exclusive-resource reservations, then acquires every applicable row only in the
  canonical total order above. Unique partial constraints allow at most one live Claim Attempt/
  Execution Lease per DevTicket, one current fencing token per lease, and one admitted Sprint item.
  Review WIP at three defers the claim without touching admitted leases.
- The versioned global Review WIP counter equals exact Review membership and never exceeds three.
  Submit locks the counter plus Review Handoff and increments with In Progress→Review. Finalize
  changes no lane/counter. FinalizeCancel, changes-requested, Done, material Review exit, and
  Review→Blocked loss decrement exactly once with their lane change. Claim admission locks the same
  counter and rejects at three. Active Review Handoff races lock the Review Handoff and counter
  under canonical order, so no stale count or orphan Review Handoff is possible.
- `ReviewChangesRequested`, `AuthorizeReviewMerge`, and `AdmitDone` declare and lock the exact
  current contract/evidence, active Revision slot, Material Revision Interruption (including
  explicit none), exact #229 Review Exit Containment Proof, and Review Merge Authorization where
  applicable before Review Handoff/WIP/queues. Changes-requested and merge authorization reject
  while a Revision is `AcceptedPendingApplication`, an interruption is live, or the proof is
  missing/stale/mismatched. `AdmitDone` additionally rejects without the exact confirmed merge
  authorization and matching provider fact. The canonical Revision/Interruption-before-Review order
  selects one winner: a verdict transition that commits first leaves no Review member for a later
  command to mutate, so that Revision must re-evaluate from Todo or Done under ordinary lane rules.
- Any material Revision or real dependency mutation locks the target's current Sprint aggregate,
  Plan, member, approval, and grant rows in every lane. A standalone DevTicket command with any
  nonterminal Draft/Approved/Queued/Active membership is a hard rejection. Draft membership may
  change only through an atomic coordinated Draft Sprint Plan/member command under exact versions;
  it stays Draft and needs neither an approved Sprint Plan Revision Grant nor Needs Re-approval.
  Approved/Queued/Active membership requires a coordinating approved Sprint Plan Revision Grant
  bound to exact old/new contract, graph, member, approval, grant, Sprint, and Plan versions; the
  Sprint boundary/member and DevTicket changes commit atomically, auto-start stays paused, and the
  Sprint becomes Needs Re-approval. No standalone DevTicket command mutates Sprint state.
- Each workspace/lane has a monotonic `laneQueueVersion`. Every command entering, leaving, or
  re-ranking a lane declares the source and target `laneQueueVersion` (using explicit `none` plus
  the archive-membership or historical-classification write-model version when one side is not an
  active lane), the source membership, and exactly one deterministic target anchor or policy
  default. It locks all affected queue rows in canonical lane order, validates the anchor aggregate
  version, updates lane membership/rank, and increments every affected queue version in the same
  transaction as the lane change. Order is the committed order key with DevTicket UUID as the final
  tie-breaker. A queue, membership, or anchor mismatch conflicts with zero aggregate/ledger/outbox
  writes; a caller-authored command reloads and submits a new command/key. The internal start worker
  uses only the bounded retry exception below. This rule applies to Ready admission, execution
  start, Blocked entry/resolution, material Revision to Backlog, Review changes, Done,
  archive/restore, and migration/import—not only `ReorderTodo`. Reordering cannot preempt an active
  Execution Lease.

Todo has one canonical sort key: Todo Ordering Band is the exact tuple `reviewReworkPlacement`
(`blocking_top`, then `planned`, then `ordinary_bottom`), dependency-criticality (critical first),
and Priority `P0 -> P1 -> P2 -> P3`; rank within that band and DevTicket UUID follow. `ReorderTodo`
may change rank only inside the exact tuple and cannot set or cross the server-derived placement
tier. An accepted Priority change follows material Revision/Ready invalidation and never directly
crosses Todo Ordering Bands; Priority orders only inside each tier and grants no approval. Fresh
Ready admission sets `planned`; Review changes-requested alone may set `blocking_top` when proven or
`ordinary_bottom` otherwise.

### One transaction, then external effects

After transport authentication, the server first performs a non-persisting tenant-admission and
target/command-family authorization check. An unauthorized caller receives 403 before content
scanning and cannot trigger, probe, or infer Secret-Safe Ingress or an Absolute Stop. For an
authorized target/family, **Secret-Safe Ingress is a universal pre-persistence gate** for every
content-bearing or free-text command field. It scans Proposal titles/summaries/evidence text;
initial and revised Ready Contract content; document/input/approval text; metadata values; Revision
diffs and reasons; dependency, Blocked, archive, rejection, exception, and decision rationales;
comments and worklogs including corrections; and every other human- or agent-authored text payload.
Authorized plaintext exists only transiently for this scan.

Suspected secret content short-circuits the product command before command-receipt reservation,
aggregate mutation, activity/planning/Runner/audit persistence, outbox or GitHub payload creation,
or raw-body logging. The security path stores only a safe hash/ref and non-sensitive detection
metadata, invokes the scoped `OpenAbsoluteStop`, and enqueues a safe notification. No raw
suspected-secret value is durable anywhere, including rejection/audit records. Authorization,
command family, source, and correction status never bypass this gate.

Only after Secret-Safe Ingress passes may any safe replay lookup or command transaction occur. The
non-persisting authorization was admission only: the transaction must recheck tenant/RBAC/source and
target/family authority under its complete record locks before any accepted mutation. For a new
Opzava command, one `withTenant(orgId, fn)` transaction performs:

1. load and lock the complete expected-version set in canonical order, including target
   authorization facts;
2. verify tenant/RBAC/source policy for the command family/target and return a denial **without**
   reserving a receipt when unauthorized;
3. check the receipt again under the locks (to resolve a concurrent duplicate), replay only after
   the same hash/principal/source and current authorization checks, or reserve it and assign its
   `commandId`;
4. verify every expected version, legal transition, Ready/approval, dependencies, Absolute Stops,
   capacity, and command-specific invariants before domain mutation; a conflict has zero partial
   writes, while an authorized domain rejection finalizes only the receipt as its terminal result;
5. mutate the authoritative rows and increment every affected aggregate/graph/queue/resource
   version;
6. append the accepted Dev Board activity fact and any planning/Runner record owned by the command;
7. append internal projection events and GitHub/Runner/Slack outbox intents with stable event IDs;
8. finalize the command receipt with the result; and
9. commit.

No network call occurs while database locks are held. A worker dispatches the committed intent, and
the verified external result enters through an inbox/dedupe boundary. A gate advances only after the
authoritative external fact is confirmed. Temporary transport failure therefore produces pending
sync/start—not a rolled-back human decision or a fabricated success.

Every command that fences, releases, or loses an Execution Lease locks both the exact lease-scoped
credential-access authority/grants and local preview-tunnel grant/authority in canonical order. It
always revokes implementation credential grants and enqueues external revocation; they never become
Review or successor authority. Every implementation exit also revokes preview-tunnel authority.
After Review admission, #229 may provision distinct Reviewer/local-Docker tunnel authority; it never
inherits implementation authority. Capacity, containment, and fresh-claim eligibility remain held
until every required confirmation/reconciliation completes; each path with no applicable credential
grant or preview tunnel records explicit disposition `none`. Ordinary lease containment revokes only
lease-scoped access grants, never the underlying named secret/credential refs; those refs are
revoked or quarantined only by the secret-exposure Absolute Stop path. This applies uniformly to
start rejection/finalization, expiry/loss, manual Blocked entry, material Revision interruption,
Review admission, and the governed stop/reconciliation that must precede archive.

Runner start ingress is a separate authenticated bounded arbitration flow. Trusted ingress assigns
`observed_at` plus a monotonic ingress identity, locks the exact Claim Attempt/start-deadline row,
and durably appends only those values, immutable routing IDs, and a minimal safe envelope hash; no
free text or untrusted body persists. Deadline firing only records `deadline_elapsed` and a
deterministic bounded arbitration cutoff. Until that cutoff, the verifier locks the same row and
safely promotes or rejects candidates. At cutoff, the arbiter considers only markers with trusted
`observed_at <= start_deadline` that committed by the cutoff, orders them by `observed_at` then
monotonic ingress identity, and completes their bounded verification. The first valid candidate
wins; invalid/unverified-at-bound candidates reject. If none wins, loss may commit, and no marker
committed after cutoff can reverse it. This bounded durable marker rule—not physical socket
arrival—is authoritative. The internal start transition then uses worker-loaded current queue
versions/anchor; queue-only conflict retries the same identity and cannot erase verified evidence.

For this one internal transition, the stable job/command identity and canonical semantic hash bind
the verified inbox receipt and start-transition purpose, not the worker-loaded queue-version/anchor
attempt envelope. Every attempt still validates the complete current versions under lock, but a
queue-only conflict records a retriable job attempt rather than finalizing a rejected command
receipt. Success, a substantive gate failure, or a winning fence/loss decision finalizes the job
exactly once. Caller-authored commands do not receive this retry exception.

A database error rolls back the receipt and every domain/ledger/outbox write together. The caller
may retry the same key because no authorized result was committed.

## Exact state distinctions

| Concept                    | Exact meaning                                                                                                                                                                                                                      | What it does **not** mean                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `lane`                     | one active workflow state: Backlog, Todo, Blocked, In Progress, Review, or Done; only a DevTicket command changes it                                                                                                               | Runner liveness, GitHub Issue state, archive state, or queue projection                    |
| `dependency lock`          | live gate computed from active dependency edges whose blockers are not admitted Done                                                                                                                                               | Blocked lane; it leaves the DevTicket in Todo with a visible lock and no claim             |
| `Execution Assignee`       | at most one current human/agent selected to implement; optional in Todo and required before In Progress                                                                                                                            | proof of work, a Runner location, a lease, Human Owner, Reviewer, or Lead Orchestrator     |
| Claim Attempt              | one governed attempt to bind an eligible claimant and Runner to exact approved work; `failed` proves no process began, while `fenced` means possibly-started/started authority was revoked and requires containment reconciliation | In Progress before a trusted start receipt; reusable authority after either terminal state |
| Execution Lease            | Runner-scoped capacity grant and fencing authority bound to ticket, contract, Runner, worktree/branch/SHA, token, and expiry                                                                                                       | actor identity, lane, approval, or permission to merge                                     |
| Blocked Episode            | required reasoned record for admitted/start-attempted work that cannot safely proceed or whose execution presence is unknown, with prior lane and last trusted checkpoint                                                          | a free-form status string, a dependency badge, or a silently paused lease                  |
| `archive`                  | reversible aggregate lifecycle overlay (`archived_at/by/reason/version`) that removes a record from active Board queries while preserving last lane/history                                                                        | Done, delete, cancelled execution, or a seventh lane                                       |
| Historical Projection      | read-only classification/projection for imported/frozen/archived evidence, including legacy completion with its gate provenance                                                                                                    | an executable aggregate or proof that current Ready/Review/Done gates passed               |
| Card/List/Board projection | denormalized display of the above with freshness/provenance                                                                                                                                                                        | write authority; stale projection data cannot satisfy a command precondition               |

An assignee may remain visible for attribution outside In Progress, but no work is active without a
current lease and accepted start receipt. On Blocked resolution or Review changes-requested, the
default is to clear the current assignee; preserving it as a Todo preassignment requires an explicit
authorized choice in that command. Past assignees remain immutable activity facts. This prevents a
stale assignment from turning into an implicit resume while retaining the supported preassigned-Todo
case (`docs/plan/dev-board-foundation-decisions.md`).

Claim Attempt terminal transitions are exact. Pre-Start Admission Loss and signed start rejection
set the Claim Attempt to `failed` only with deterministic `no_start_enqueued`/ `no_process_started`
proof and fence the Execution Lease; their named finalizers release held resources but never change
that terminal claim state. Execution loss after start enqueue, `BlockExecution`, an active-execution
Absolute Stop, or a material interruption with possible/ accepted execution sets the Claim Attempt
to `fenced`, preserves its prior phase and containment owner refs, and cannot be rewritten to
`failed` merely because a later stop succeeds. Its owning reconciler/finalizer records safe release
without erasing the `fenced` history. A Claim Attempt never occupies both terminal states.

## Proposal creation and promotion

### Proposal lifecycle

`Draft -> AwaitingDecision -> Accepted | Merged | Rejected`, with the independent reversible archive
overlay. Only an authenticated agent or the Lead Orchestrator may draft an agent-discovered
Proposal. Authorized humans shape direct work through `CreateBacklogDevTicket` and may accept,
merge, reject, or archive a decision-ready Proposal. `RestoreProposal` removes the archive overlay
and reveals the same underlying state: Draft/AwaitingDecision resumes there, while
Accepted/Merged/Rejected remains terminal. Restore never grants a second decision. A blocking
assessment may pause an affected Sprint through the Sprint command boundary; it does not grant scope
or create GitHub noise (`docs/prd/PRD-019-dev-board.md`).

“Decision-ready” means exactly `AwaitingDecision`: Accept, Merge, and Reject all reject Draft or any
terminal state. A Draft must first pass `SubmitProposal`; no decision command silently submits it.

Drafting records planning-owned `ProposalDrafted`. Submission emits authoritative
`ProposalSubmitted`; each human decision/overlay command emits exactly one corresponding
`ProposalAccepted`, `ProposalMerged`, `ProposalRejected`, `ProposalArchived`, or `ProposalRestored`
activity event.

### `AcceptProposal`

The decision includes `mirrorDisposition=create` or `link_verified_existing`. Create is the normal
path. Link requires a fresh GitHub App observation of an Issue in the single configured repository,
the observed provider version in the command, and a canonical GitHub Issue Binding reservation. The
binding registry enforces unique `(repository_id, issue_number)` ownership across active, archived,
and historical DevTickets. Link attempts take a transaction/advisory lock on that key and claim it
before creating the DevTicket or link intent; a concurrent owner receives a deterministic
`github_issue_already_bound` conflict. A URL/number asserted by a human or agent is not proof. If
integration health changes before commit, the Backlog decision may still be preserved only on the
create path; a link path cannot claim unverified ownership and must be retried after reconciliation.

In one transaction:

1. lock the Proposal and verify it is decision-ready, not already decided/archived, and the command
   actor is authorized;
2. for `link_verified_existing`, lock/reserve the exact GitHub Issue Binding key and verify its
   fresh provider observation and absence; for `create`, reserve a stable create-intent binding
   identity;
3. create one DevTicket in Backlog with a required Human Owner and initial immutable contract
   version;
4. bind the known Issue key to that DevTicket on link, or bind the create-intent identity pending a
   provider number;
5. mark the Proposal Accepted with `acceptedDevTicketId`, decision actor/reason, and version;
6. append the human decision and source Proposal ref to the planning ledger;
7. append `ProposalAccepted` and `DevTicketCreated` to activity/history;
8. enqueue an idempotent `GitHubIssueCreateRequested` or `GitHubIssueLinkRequested` sync record; and
9. record the cross-ledger correlation refs and command result.

The transaction does not call GitHub. Until the GitHub App confirms number/URL and repository
identity, the Card shows `GitHub mirror pending` and is not Ready/claimable because integration
confirmation is missing. Provider-create confirmation takes the same repository/Issue-key lock and
claims the same binding registry before attaching the number. If another binding already owns that
provider identity, confirmation opens a deterministic synchronization conflict and reconciliation;
it never double-links or overwrites either DevTicket. Provider failure keeps the accepted Backlog
DevTicket and retries/reconciles; it never recreates the Proposal or a second DevTicket.

`CreateBacklogDevTicket` is the explicit-human-shaping entry point, but it does not own a shortcut
GitHub path. It requires the same `mirrorDisposition=create | link_verified_existing` and uses the
exact canonical GitHub Issue Binding mechanism above: fresh verified-existing observation plus
unique repository/Issue reservation before link, or a stable create-intent reservation in the
DevTicket transaction followed by the same confirmation lock/conflict reconciliation. The direct
command differs only in source/rationale and absence of a Proposal decision; it cannot create an
unreserved mirror or trust a caller-supplied Issue URL/number.

Backlog shaping may be structurally valid while mandatory Ready fields are incomplete. The command
therefore accepts an initial draft contract whose supplied fields pass type/Secret-Safe validation
and whose omitted Ready fields are explicit missing markers; it creates no Ready Approval. Before
reserving any execute/claim command receipt, the read-only `AssessExecutionReadiness` guard locks
the exact DevTicket/contract and caller authorization versions. For Backlog or an incomplete
contract it returns the exact policy-visible missing-field codes plus `deep_grilling_required` and
`no_start`. It creates no command receipt, Claim Attempt, Execution Lease, assignment,
capacity/worktree, or lane write. Callers must complete deep grilling, create a complete Ready
Contract Version, obtain Ready Approval, and reach Todo before `ClaimAndStart` can reserve a
receipt.

`MergeProposal(existingDevTicketId)` does not create a DevTicket or GitHub Issue. It appends the
discovery/evidence to planning history and, when it changes governed work, opens a proposed Revision
against the existing ticket. Reject and archive retain the evidence and decision reason; restore
removes only the archive overlay. Each command appends its corresponding authoritative Proposal
activity event.

## Ready validation and approval

### Canonical Ready Contract Version content

The immutable Ready Contract Version contains:

- outcome, bounded scope, sad paths, edge cases, acceptance criteria;
- user-level E2E expectations and final behavioral contract;
- exact active dependency edge IDs plus dependency-set version/hash (completion is checked live);
- required human-input decisions and named secret-reference IDs/readiness only;
- Human Owner, Type, Work Areas, Priority, optional Severity, and Change Risk;
- referenced approved document IDs/versions/hashes;
- contract version/hash, policy version, and minimum-risk evaluation.

Secret values, transient Runner/GitHub health, and current dependency completion are not hashed into
the contract. They are live preconditions at claim/Sprint activation. This prevents temporary
liveness from destroying an otherwise approved contract while still failing closed at execution.

### Commands

- `ValidateReady` is deterministic and non-approving. It locks and requires the exact confirmed
  GitHub Issue Binding/version plus the current required integration-health and reconciliation
  versions, then records the validator/policy version, exact inputs, pass/fail, and field-level
  failures. An unconfirmed, unhealthy, stale, or unreconciled binding fails validation. Only a
  source/principal explicitly granted `ready.validate` in the table above may request it. The full
  field-level result is visible only to Admin/Human Owner and policy-authorized planners; enrolled
  agents, assignees, and Runners receive only fields allowed by their target-read policy, while the
  GitHub App/Action receives stable safe field codes. Named-secret and human-input details are
  reduced to authorized readiness/missing booleans—never values or unauthorized metadata. Validation
  never grants Ready Approval, changes lane, or creates execution authority; only a result for the
  current versions can later be approved by a separately authorized command.
- `ApproveReadyToTodo` locks the DevTicket, dependencies, exact confirmed GitHub Issue
  Binding/version, current required health/reconciliation rows, and exact Backlog/Todo queue
  versions; reruns validation; verifies no Absolute Stop/conflict; records approval bound to all
  exact versions/hashes; and changes Backlog to the deterministic Todo anchor in the same
  transaction. There is no validation/approval time-of-check gap.
- `ApproveReadyAndStart` commits that same approval/Backlog-to-Todo membership and, in the **same
  transaction**, persists a correlated idempotent `ClaimRequested` internal intent with a stable
  `claimRequestId`, original verified requester/principal and source, intended claimant, current
  authorization policy/version, Runner choice plus enrollment/capability refs, exact contract/
  approval/dependency/assignment/Sprint/health/gate refs, and its own stable `ClaimAndStart` key.
  The observable state is `Approved / Start Requested`, not In Progress. The internal worker has no
  claimant authority of its own: under canonical locks it rederives and reauthorizes the original
  requester, intended claimant, and source against current role/source policy and authorization
  version, reloads Runner enrollment/capability, and revalidates every target/gate before invoking
  `ClaimAndStart`. Authorization/source/identity/enrollment drift cancels the intent; material
  target or gate drift supersedes it, both with no claim/lease/capacity/worktree. Replay of the
  approval command returns the same approval and `claimRequestId` without duplicating either intent
  or claim. A worker crash leaves the committed intent retryable. Admission/start rejection leaves
  the Card visibly in Todo with the Ready Approval intact and a failed request reason; it is never
  rolled back or falsely active.
- Approval comes only from the Human Owner/Admin in secure UI or an exact bounded Slack action. An
  agent, GitHub edit, GitHub Action, or Runner may request validation but cannot approve.

The planning ledger owns validation inputs/results and the human rationale that led to a decision.
The Dev Board activity/history ledger owns the authoritative Ready Approval, carry-forward,
invalidation, and lane effect. Neither ledger duplicates the other's fact; stable refs connect the
validation/rationale artifact to the accepted approval event.

## Governed revisions and invalidation

### Revision classification

`ReviseBacklogContract` directly appends a new immutable Ready Contract Version under exact ticket,
current-contract, and Backlog queue versions. Todo, In Progress, Blocked, and Review managed
contract content is read-only; edits use `ProposeRevision` with a field-level diff, reason, actor,
source, and declared downstream effect. Planning owns the Revision diff plus decision-rationale
artifact; `AcceptRevision`/`RejectRevision` records the authoritative decision and any
invalidation/lane effect in activity under lock.

Revision state is exact: `AwaitingDecision -> AcceptedPendingApplication | Rejected`. An idle
accepted path may apply atomically and end as `Applied`; an active prepare ends as
`AcceptedPendingApplication`, `FinalizeMaterialRevisionInterruption` ends as `Applied`, and
`AbortMaterialRevisionInterruption` ends as `AbortedAfterAcceptance`. After classification,
`ApplyNonSemanticCorrection` is the accepted non-semantic branch and `AcceptRevision` is the
material branch. Both consume an `AwaitingDecision` Revision and emit one authoritative decision.
`RejectRevision` applies only to `AwaitingDecision`; it cannot reject accepted work.

Watchers, read markers, and display-only metadata **outside** managed Ready Contract content use a
separate metadata command/activity fact. Comments and worklogs use their own append-only, idempotent
record commands: a correction appends a new record with `correctsRecordId` and never updates or
deletes the original. None of these records creates a Ready Contract Version, runs Revision
materiality, invalidates Ready Approval, or creates an approval carry-forward. #231 owns GitHub
synchronization mechanics, not their Opzava write semantics.

Comment/worklog append and correction commands inherit the same universal Secret-Safe Ingress; they
have no narrower or later scanning exception.

Material by default:

- any execution-contract field (outcome, scope, sad paths, edge cases, acceptance, E2E, behavior);
- dependency edge set, required inputs/secret references, approved document dependency, Human Owner,
  Priority, or policy/risk requirement;
- a change the policy cannot prove is non-semantic.

Non-semantic **inside managed contract content**:

- normalization-only whitespace/formatting with identical canonical content; or
- an explicitly authorized typo/wording correction classified under a versioned policy with a reason
  and no changed behavioral meaning.

An agent may raise materiality but cannot downgrade it. A Human Owner may request non-semantic
classification, but the server refuses it when protected fields or policy inputs changed.

### Consequences by lane

| Current state                                                                                 | Accepted material Revision                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backlog                                                                                       | append version under Backlog membership/queue lock; remain Backlog; no active Ready Approval exists                                                                                                                                                                                                                                                                                                |
| Todo, no live claim and no containing Pre-Start Admission Loss or Start Rejection Containment | without nonterminal Sprint membership, append version, invalidate Ready Approval, clear optional preassignment only when requested, and move Backlog atomically; standalone membership rejects; an exact coordinated Draft command stays Draft, while an approved exact Sprint Plan Revision Grant moves Approved/Queued/Active to Needs Re-approval                                               |
| Todo, `PreStartAdmissionLoss(containing)`                                                     | lock the exact loss and reject/defer acceptance until `FinalizePreStartAdmissionLoss`; retain `AwaitingDecision`, Ready Approval, Todo membership, assignment, capacity/worktree, grants/tunnel containment, and failed-request history; never use idle apply or create Material Revision Interruption                                                                                             |
| Todo, `StartRejectionContainment(containing)`                                                 | lock the exact containment and reject/defer acceptance until `FinalizeStartRejectionContainment`; retain `AwaitingDecision`, Ready Approval, Todo membership, assignment, capacity/worktree, grants/tunnel containment, and failed-request history; never use idle apply or create Material Revision Interruption                                                                                  |
| Todo, `credential_provisioning`                                                               | `AcceptRevision` atomically records acceptance, prepares the interruption/fence, revokes pending or active Lease Credential Access Grants and any preview authority, and holds capacity/worktree; Backlog apply waits for no-process or stopped/quarantined proof plus every confirmation                                                                                                          |
| Todo, `start_pending`                                                                         | `AcceptRevision` atomically records acceptance and prepares the interruption/fence; no decision-before-fence gap                                                                                                                                                                                                                                                                                   |
| In Progress                                                                                   | `AcceptRevision` atomically records acceptance and prepares the interruption/fence; do not apply Revision, release capacity, or containment before Finalize succeeds                                                                                                                                                                                                                               |
| Blocked                                                                                       | after stopped/quarantined reconciliation, finalize or atomically apply the Revision, invalidate Ready Approval, move to Backlog, and condition-aware close/clear the current Blocked Episode as resolved or superseded                                                                                                                                                                             |
| Review                                                                                        | prepare one exact branch without exiting Review: a `prepared`/`cancelling` live Review Handoff becomes `superseded` and reuses its containment, while a `finalized` handoff remains immutable and requests #229 Review Containment Proof; only the owning Material Revision Interruption finalizer atomically applies the Revision, invalidates evidence, moves Review→Backlog, and decrements WIP |
| Done                                                                                          | no in-place mutation of relied-upon completion; create a follow-up DevTicket or an exceptional correction/version record under Review policy                                                                                                                                                                                                                                                       |

Every material row above first locks exact current Sprint aggregate, Plan, member, approval, and
grant versions. Any standalone DevTicket command with Draft, Approved, Queued, or Active membership
rejects before Revision acceptance, interruption preparation, or Ready/lane mutation. A coordinated
Draft Sprint Plan/member command may atomically revise/remove the member and DevTicket under exact
versions; the Sprint stays Draft and requires no approved grant or Needs Re-approval. A coordinated
Approved/Queued/Active path instead requires an approved Sprint Plan Revision Grant bound to exact
old/new contract/graph/member/approval/grant/Sprint/Plan versions; it atomically updates both
boundaries, pauses auto-start, and transitions Sprint to Needs Re-approval. `AcceptRevision` never
silently edits or invalidates Sprint approval. The coordinated transaction appends the Sprint
boundary's authoritative Plan/member revision fact and cross-links it to the exact
`RevisionAcceptedPendingApplication` or `RevisionApplied` fact plus the dependency and lane facts;
all commit or none commit.

`ApplyNonSemanticCorrection` still creates a new exact Ready Contract Version/hash and never mutates
the prior version or approval. Where Ready exists, the transaction creates a new exact Ready
Approval plus `ReadyApprovalCarriedForward`, both referencing the prior approval and versioned
classification decision.

For a Draft Sprint member, a non-semantic correction uses an atomic coordinated Draft Plan/member
contract-ref update under exact versions and stays Draft; it creates no Sprint Plan Binding
Carry-Forward or Sprint approval binding because Draft has neither approval. For an
Approved/Queued/Active member, the same correction transaction locks the exact Sprint Plan, member,
and approval binding and appends a Sprint Plan Binding Carry-Forward joining the old/new
contract/Ready Approval to that exact membership and equivalence classification. Approval remains
valid only through this immutable record. Any binding/classification/hash mismatch rejects
carry-forward and routes to the material Sprint Plan Revision Grant path and Needs Re-approval; no
partial contract, Ready, execution, or Sprint binding may commit.

During `credential_provisioning`, `start_pending`, In Progress, Blocked, or Review, that same
transaction also appends an immutable Execution Binding Carry-Forward tied to the original
claim/Execution Lease/evidence binding, old and current Ready Contract Version/Ready Approval
hashes, equivalence policy/hash, and predecessor. It never rewrites the original lease. Later Runner
receipts name the original lease binding **and** current contract head/equivalence ref; Review binds
the entire lineage and exact current head. Any protected field, hash, dependency, or policy mismatch
rejects this branch and routes through the material Revision/interruption policy. Outside-contract
metadata never enters this path. This preserves exact-version authority without reapproval churn
(`docs/prd/PRD-019-dev-board.md`).

`ApplyNonSemanticCorrection` is still a contract-authority mutation, so it locks the exact Pre-Start
Admission Loss state and rejects while one is `containing`; after Finalize, the caller must
reclassify/revalidate and submit a new command key against current versions. In contrast,
Secret-Safe comment/worklog appends and outside-contract display, watcher, and read metadata remain
permitted during containment because they cannot change contract/Ready authority, assignment,
lane/queue state, resources, grants, tunnel state, or the loss lifecycle.

When Review has a `ReviewHandoff(prepared)`, that same correction transaction also locks and
atomically rebinds the Review Handoff from its old current-contract head/equivalence lineage to the
newly carried-forward head/lineage while leaving the frozen candidate checkpoint/SHA unchanged. It
emits `ReviewHandoffCandidateRebound` with both bindings. Finalization accepts only that exact
rebound binding and current aggregate head; therefore it can never emit `ReviewRequested` for stale
contract authority. A `cancelling` Review Handoff rejects non-semantic correction with no mutation;
the caller must finish cancellation and resubmit from the governed lane. A `finalized` Review
Handoff is immutable history: any later permitted Review correction creates new review evidence
authority under #229 and never rewrites the finalized record.

### Durable interruption for a material active Revision

Accepting a material Revision while credential provisioning, start, or execution authority may exist
is a durable two-phase saga, not one optimistic transaction. Pending access delivery is live
containment even when the Card still projects Todo; only Todo with no live claim/grant/tunnel and no
containing Pre-Start Admission Loss or Start Rejection Containment uses the idle atomic path. A
containing record rejects/defer acceptance until its named Finalize; it is never composed into a
second interruption in v1. There is no accepted-but-unfenced interval:

1. **`AcceptRevision` is the prepare transaction:** under the complete expected-version and queue
   set, it atomically moves the Revision from `AwaitingDecision` to `AcceptedPendingApplication`,
   persists a Material Revision Interruption (`MaterialRevisionInterruption`) bound to Revision,
   claim, Execution Lease, Runner, process/worktree, and current contract, advances/fences old
   execution authority, revokes the exact lease-scoped credential-access and local preview-tunnel
   grants and enqueues external revoke/close where applicable, keeps capacity and worktree
   reservations held, and assigns a dedicated finalization nonce. For `credential_provisioning`, it
   cancels pending provision/start delivery, proves no start outbox or accepted start exists, and
   records deterministic `no_process_started`; every later provision confirmation is stale and
   revocation-bound. Other live states enqueue one idempotent checkpoint/stop command. The old
   contract remains current while the Revision is `AcceptedPendingApplication`; no false Backlog
   transition or separate later prepare command is emitted. A Review source selects one exact branch
   under the Review Handoff lock: a `prepared` or `cancelling` implementation Review Handoff becomes
   terminal `superseded`, binds this interruption, and reuses its containment refs; an already
   `finalized` Review Handoff remains immutable while the interruption records
   `sourceBranch=finalized_review`, its exact handoff/review-run binding, and a
   `MaterialRevisionReviewContainmentRequired` fact/outbox for #229.
2. **`FinalizeMaterialRevisionInterruption`:** accept only authenticated deterministic
   `no_process_started` proof or terminal stopped/quarantined process/worktree proof for the exact
   nonce plus every required Lease Credential Access Grant and preview-tunnel confirmation. Under
   fresh complete expected versions and source/Backlog queue locks, release capacity, apply the new
   Ready Contract Version, invalidate Ready Approval/old evidence/unused Needs Human Approval
   Requests, move to the deterministic Backlog anchor, mark the Revision `Applied`, and append the
   final Runner and activity facts in one transaction. A Review source has two legal finalizer
   branches: `live_implementation_handoff` requires the exact handoff already `superseded` by this
   interruption and the reused implementation-containment confirmations; `finalized_review` requires
   the finalized handoff unchanged plus an exact authenticated Review Containment Proof from #229.
   The owning finalizer performs material apply, Review→Backlog, and the WIP decrement atomically in
   one transaction after its branch proof is complete. Neither branch permits an earlier Review
   exit/WIP decrement or mutation of finalized Review Handoff history.

The `ReviewContainmentProof` interface is fail-closed and #229-owned. It binds tenant, DevTicket,
Material Revision Interruption, finalized Review Handoff, exact Review run/candidate SHA and
evidence cutoff, Reviewer identity/lease/fence/process, shared-Docker lease/session/build, preview
tunnel, terminal dispositions, confirmation refs, trusted source/signature, and proof hash/version.
Every applicable Reviewer process/lease, Docker session/lease, tunnel, and stale evidence authority
must be stopped, closed, expired, or reconciled. #230 only consumes that authenticated owner fact;
it does not infer containment from the finalized handoff or define #229's production mechanism.

`AbortMaterialRevisionInterruption` is the only escape from `AcceptedPendingApplication` other than
Finalize; `RejectRevision` applies only while a Revision is `AwaitingDecision`. Abort requires
explicit `revision.interruption.abort` authority, a safe human reason, authenticated
`no_process_started` proof or verified stopped/quarantined process plus reconciled worktree/GitHub
containment, every credential/tunnel confirmation, and one explicit disposition/target anchor. A
`finalized_review` source also requires the same exact Review Containment Proof as Finalize; abort
cannot restore or redirect work while stale Reviewer authority remains. Its complete expected-
version set covers the interruption, Revision, DevTicket, current Ready Contract Version, old Ready
Approval and every bound dependency/policy/input, applicable Absolute Stop, current Blocked Episode,
resources, and exact source plus target Todo/Backlog queues. Its idempotency identity is the
Material Revision Interruption ID, abort-decision nonce, disposition, target anchor, and containment
reconciliation hash.

The command has exactly two atomic dispositions:

- `restore_todo` is allowed only when every exact old Ready Approval binding remains current and
  valid, no applicable Absolute Stop is active, and every Blocked condition is resolved. Under the
  exact Absolute Stop/Blocked Episode/source/Todo queue locks, it marks the candidate Revision
  `AbortedAfterAcceptance`, closes the interruption, discards deferred candidate contract/
  Dependency Edge mutation, preserves the unchanged old Ready Contract Version and Ready Approval,
  releases containment/capacity, and returns to the deterministic Todo anchor.
- `invalidate_to_backlog` is the fail-closed disposition when the old Ready Approval cannot remain
  valid or `restore_todo` gates do not pass. After the same containment proof and locks, it marks
  the candidate `AbortedAfterAcceptance`, discards deferred candidate mutation, keeps the old Ready
  Contract Version as current, invalidates the old Ready Approval into history, releases
  containment/capacity, and moves to the deterministic Backlog anchor. Any applicable active
  Absolute Stop remains active and keeps gating; abort never resolves or bypasses it.

A Review-source abort uses the same `live_implementation_handoff` or `finalized_review` proof branch
as Finalize and atomically decrements Review WIP with Review→Todo/Backlog. It cannot use abort to
escape a missing #229 Review Containment Proof, rewrite finalized history, or leave a WIP member
without Review membership.

Episode closure is source- and condition-aware. A Blocked source always clears
`DevTicket.currentBlockedEpisodeRef` and preserves the episode plus its condition/incident/
dependency refs in history, but it may claim resolution only when the condition is proven resolved:

- when resolved, close with `condition_resolved_before_abort` and emit `BlockedResolved`
  cross-linked to the abort and lane/queue facts; and
- when still unresolved, only `invalidate_to_backlog` may continue. Close the execution episode as
  `superseded_by_contract_invalidation`, emit `BlockedSuperseded`, preserve the unresolved-condition
  refs, and never emit or imply `BlockedResolved`.

`restore_todo` still rejects an unresolved condition. A non-Blocked source has no current Blocked
Episode, so none is created, resolved, or superseded. Planning owns the abort-rationale and
disposition artifact; activity owns the authoritative abort, approval disposition, optional Blocked
resolution/supersession, release, and lane/queue facts; the Runner execution ledger stores only the
signed terminal containment proof used by that decision.

This is one shared Blocked-exit helper, not an abort-only exception. Every material
Blocked-to-Backlog application—including direct safe apply, dependency finalization, and
`FinalizeMaterialRevisionInterruption`—locks the exact current Blocked Episode, clears
`currentBlockedEpisodeRef`, and preserves it in history. It emits `BlockedResolved` only with proof
that the named condition ended; otherwise it closes as `superseded_by_contract_invalidation`, emits
`BlockedSuperseded`, and preserves unresolved condition/Incident/Dependency refs. No material path
may leave a dangling current episode or manufacture resolution.

Timeout, Runner unavailability, disconnect, or ambiguous process state after start enqueue records
`execution_unknown`, invokes the execution-loss command below, and leaves capacity/worktree reserved
until reconciliation proves the process stopped or quarantined. A claim still in
`credential_provisioning` has no start outbox/process and opens no Blocked Episode: it appends proof
to an owning Material Revision Interruption when one exists, otherwise it takes the deterministic
Pre-Start Admission Loss branch. Database fencing prevents accepted receipts but is not proof that
an already-started process cannot still write files or push Git refs. #232 and #233 may choose the
detailed timeout, pause, or preemption policy, but they must implement these stable prepare/finalize
operations and may not reuse capacity between them.

## Dependency graph and Todo ordering

An active edge is directed `dependent -> blocker` and has a stable ID. `AddDependency` requires both
DevTickets to be active, distinct, tenant/repository-compatible, and non-Proposal records. Duplicate
active AddDependency is a true idempotent no-op: return the existing Dependency Edge and write no
graph, contract, aggregate, queue, event, ledger, or outbox change. The graph transaction rejects a
real add if recursive traversal from the proposed blocker reaches the dependent. Self-edges are
always invalid.

`RemoveDependency` names the exact active edge ID/version and endpoint pair. Its first successful
removal retires that edge, records one command receipt and `DependencyRemoved` event, and applies
the governed Revision effects below. Same key/hash replays that receipt/event refs with no new
write. A new authorized key targeting the same already-retired exact edge returns deterministic
`already_removed`, persists only its command receipt cross-reference to the original removal, and
emits no second domain event or graph/contract/queue/outbox write. An absent/never-created edge,
endpoint mismatch, or stale expected active version returns a terminal `dependency_not_active` or
`dependency_identity_conflict` receipt with zero domain events or partial writes. It never silently
removes a different edge selected only by endpoints.

A real add/remove is a material governed Revision. It locks the graph, both endpoint rows, dependent
contract head, affected lane queues, exact Sprint aggregate/Plan/member/approval/grant rows where
relevant, and any execution/Review records in canonical order. Its lane policy is:

- any lane with nonterminal Sprint membership: a standalone DevTicket command rejects before any
  mutation; an exact coordinated Draft Plan/member command may continue while staying Draft with no
  grant, while Approved/Queued/Active requires the exact approved coordinated grant and atomically
  transitions the Sprint boundary to Needs Re-approval;

- Backlog: revalidate graph/cycle and versions, insert/retire the Dependency Edge, append the Ready
  Contract Version, and remain Backlog atomically;
- idle Todo without nonterminal Sprint membership: revalidate, mutate the edge, append the version,
  invalidate Ready Approval, and move Todo to the deterministic Backlog anchor atomically;
- starting, In Progress, or execution-unknown: `AcceptRevision` atomically records the accepted
  decision and prepares the Material Revision Interruption without changing the graph; only
  `FinalizeMaterialRevisionInterruption`, after safe containment, relocks and revalidates the graph,
  cycle, endpoints, and expected versions before inserting/retiring the edge with the contract and
  Backlog transition;
- Blocked: require stopped/quarantined containment and use the same safe finalization plus
  condition-aware Blocked-exit helper before graph mutation;
- Review: prepare the exact handoff branch without exiting Review: supersede/reuse containment for a
  `prepared`/`cancelling` live handoff, or preserve a `finalized` handoff and obtain #229 Review
  Containment Proof; only the owning Material Revision Interruption finalizer revalidates and
  atomically applies the graph/Ready Contract Version, moves Review→Backlog, and decrements WIP; and
- Done: reject in-place dependency mutation and require a follow-up DevTicket/Revision decision.

Any revalidation failure leaves the Dependency Edge, Ready Contract Version, Ready Approval, lane,
queues, ledgers, and outboxes unchanged. Planning owns the proposed diff and decision-rationale
artifact; activity owns the authoritative Revision decision, edge mutation, invalidation, and lane
effect.

Blocker lane changes do not rewrite the edge or its hash. A dependent may be Ready and visible in
Todo while a blocker is unfinished, but `ClaimAndStart` returns `dependency_locked` until every
active blocker is admitted Done. A legacy `done` snapshot is not enough unless migration has
explicitly reconciled it as satisfying current dependency policy. Completed work retains
retired/historical edges (`docs/adr/ADR-017-dev-board-authority-sync-execution.md`).

A Sprint's ordered Plan must be a dependency-compatible topological order of its internal active
dependency subgraph: for every direct or transitive path `dependent -> ... -> blocker` whose
endpoints are both Plan members, the blocker appears earlier than the dependent. Plan approval and
activation acquire the exact dependency-graph and Sprint Plan/member versions in canonical order,
recompute this rule, and bind the successful validation to those versions. An earlier member that
transitively depends on a later member rejects approval/activation rather than waiting forever or
skipping the planned order. Activation separately requires every external blocker Done. A graph,
membership, or order change invalidates the bound proof and follows Sprint Needs Re-approval rules.

Todo order is Todo Ordering Band: `reviewReworkPlacement=blocking_top`, then `planned`, then
`ordinary_bottom`; inside each tier, dependency-critical precedes ordinary, then
`P0 -> P1 -> P2 -> P3`, rank, and DevTicket UUID. `ReorderTodo` changes only `rankWithinBand`: it
cannot set or cross the placement tier, edit Priority or dependency-critical classification,
invalidate Ready, or preempt a lease. It uses the exact `laneQueueVersion` and one
before/after/empty-band anchor from the same exact band.

Review changes-requested uses serialized insertion. Work proven blocking another eligible DevTicket
or the approved Active Sprint Goal gets `reviewReworkPlacement=blocking_top` and the front rank of
its exact dependency/Priority band inside that globally first tier. Ordinary rework gets
`ordinary_bottom` and the bottom rank of its exact dependency/Priority band inside that globally
last tier. Fresh/planned Ready work stays in the middle `planned` tier. Priority still orders P0 to
P3 only inside each tier, remains separate from risk, and grants no approval. Concurrent
insertion/reorder returns the new queue version; a Priority change remains material and enters its
new band only after fresh Ready Approval.

## Claim, start, Blocked, and fresh recovery

### `ClaimAndStart`

The command requires:

- lane Todo, current exact Ready Approval, no archive/conflict/Absolute Stop;
- every active blocker admitted Done;
- no current live Claim Attempt or Execution Lease;
- no `AcceptedPendingApplication` Revision or Material Revision Interruption;
- no unresolved prior-process/worktree containment record for this DevTicket or selected worktree;
- an unassigned ticket or a preassignment matching the claimant;
- authenticated eligible claimant plus explicitly selected admitted Runner/tool capability;
- exact live named SecretRef/credential versions from Ready, verified resolvable, Runner-authorized,
  policy-allowed, and least-privilege scoped; values never enter Opzava;
- available per-Runner preset capacity, Sprint/ordinary class, and exclusive resources;
- exact global Review WIP counter/version is locked; lease grant requires WIP below three;
- ordinary admission has no Draft/Approved/Queued/Active Sprint membership; Sprint-controller
  admission names the exact approved Active Sprint Plan/version, its current reservation, and the
  exact next ordered member (which must be eligible), plus the dependency-order proof bound to the
  current graph/Plan versions, with no other Sprint item admitted;
- GitHub mirror confirmed/healthy where durable-history gates require it; and
- distinct worktree/branch identity reserved for the exact ticket/contract.

Phase A (`PrepareClaim`) is one transaction: lock all admission rows, consume or correlate any
stable `ClaimRequested` intent, install/confirm the Execution Assignee, create Claim Attempt
(`ClaimAttempt(credential_provisioning)`), reserve capacity, grant an Execution Lease with a new
fencing token/nonce scope, reserve exact `LeaseCredentialAccessGrant` rows from the Ready-approved
named secret refs, append `LeaseCredentialAccessReserved`, and enqueue idempotent broker/local
provisioning outboxes. No value enters Opzava. Every claim, including a claim with zero required
grants, remains `credential_provisioning` while the Runner completes the same ordered admission
sequence: accepted Process Registration, accepted Lease Enforcer arm, and one typed secret-grant
activation result. For zero grants that result is `secret_grants_activated` with empty activated-
handle and broker-binding arrays; its signed activation-outcome digest body also carries the empty
disposition array and exact empty-set `grantSetDigest`. It is not a shortcut to start. For a
nonempty set, bounded broker activation must confirm every required grant `active`. Only after the
corresponding activation fact is admitted does one transaction arm the start deadline, change the
Claim Attempt to `start_pending`, emit `LeaseCredentialAccessActivated` (whose set may be empty),
and enqueue Runner start exactly once. No direct Phase-A start delivery exists, and no start
deadline exists during registration, Enforcer arm, or grant activation. Lane remains Todo, and
projections show `Starting`/reserved rather than claimable.

`ConfirmLeaseCredentialAccessProvision` consumes a verified broker delivery under exact named-ref,
grant, Claim Attempt/lease/fence, Ready, and Absolute Stop versions. It activates only a current
pending grant; the final required confirmation makes the complete nonempty grant set eligible for
the Runner's typed `activate_secret_grants` order, but it does not arm a deadline, enter
`start_pending`, or enqueue start. Only the subsequently admitted activation fact does so. Stale,
fenced, stopped, or ref-revoked confirmation is recorded stale and atomically creates/reuses
`revocation_pending` plus its revocation outbox—never reactivating access.
`ConfirmLeaseCredentialAccessDisposition` consumes verified revoke confirmation and releases no
resources itself. It records the exact confirmation; the owning lifecycle finalizer/reconciler may
release only after verified no-process or stopped/quarantined containment plus every required grant
and preview-tunnel confirmation. In particular, Pre-Start Admission Loss releases only through
`FinalizePreStartAdmissionLoss`, Start Rejection Containment only through
`FinalizeStartRejectionContainment`, and a Material Revision Interruption only through its own
Finalize/Abort. Broker facts stay in the integration inbox. Dev Board owns the grant, claim, lease,
fence, containment, and release lifecycle; the Runner ledger stores only signed local access,
process, heartbeat, checkpoint, and disposition observations used as inputs to those decisions.

Permanent provider denial, trusted provisioning deadline/retry exhaustion, governed Human
Owner/Admin pre-start cancellation, authenticated original-requester self-withdrawal, and verified
disconnect/key/lease loss all enter one selected-owner arbitration.
`FailLeaseCredentialAccessProvision`, `CancelLeaseCredentialAccessProvision`,
`ExpireLeaseCredentialAccessProvision`, `WithdrawCredentialProvisioningClaim`, and the provisioning
branch of `DetectExecutionLoss` lock the same Revision/interruption, claim, grants, tunnel, and
start-outbox rows. With no owning interruption they create or reuse the unique
`PreStartAdmissionLoss(containing)` for `ClaimAttempt + pre_start_containment`; its first accepted
cause is the initiating safe failed-request reason and later racing causes append immutable refs.
Provider failure identity, expiry deadline/retry epoch, authorized cancellation nonce, and detector
epoch remain independently idempotent and return the selected containment owner ID.

Those commands first lock the claim's active Revision and Material Revision Interruption under the
canonical order. If an interruption already owns the exact `credential_provisioning` claim, the
source command appends its stable provider/expiry/cancellation/detector identity and deterministic
no-start/no-process proof to that interruption, emits `MaterialRevisionProvisioningLossObserved`
plus its exact source fact, and returns the interruption ID; it does not create
`PreStartAdmissionLossOpened` or another finalizer. If no interruption exists, the unique Pre-Start
Admission Loss path above owns release. Conversely, an existing containing loss makes later
`AcceptRevision` reject/defer until Finalize. Thus loss-first and Revision-first are mutually
exclusive under the same rows rather than two sagas that could independently release or choose Todo
versus Backlog.

`WithdrawCredentialProvisioningClaim` is the only post-claim command an original requester gains
from its pre-lease session. It reauthenticates that principal and source, requires identity equality
with the exact Claim Attempt requester and request ID, locks the current claim/version and common
loss rows, consumes a one-time cancellation nonce, and proves the claim is still exactly
`credential_provisioning` with no start outbox, accepted marker, or process. A different requester,
stale version, replay under another principal, or activation/start-enqueue winner is rejected with
no fence, revocation, lease, lane, or loss write. Human Owner/Admin cancellation remains a separate
governed authorization evaluated only by `CancelLeaseCredentialAccessProvision`; neither it nor
requester withdrawal grants general lease authority. `FailLeaseCredentialAccessProvision` consumes
only verified provider-denial facts.

The shared prepare operation sets the Claim Attempt to terminal `failed`, fences the Execution
Lease, records deterministic `no_start_enqueued`/`no_process_started`, cancels pending provision/
start delivery, marks pending or active grants `revocation_pending` as applicable, revokes the
tunnel, emits `PreStartAdmissionLossOpened` plus `ClaimStartFailed`, and holds capacity/worktree and
the claim-created assignment. Only `FinalizePreStartAdmissionLoss` may release/clear them after
every grant/tunnel confirmation. If admitted Runner activation/start enqueue wins the common locks
first, these pre-start commands are ineligible: provider/expiry/cancellation facts become stale
dispositions and disconnect follows `start_pending` ambiguity to Blocked. There is no unnamed “await
confirmation” lifecycle beside Pre-Start Admission Loss.

When global Review WIP is three, admission creates/reuses a durable `ClaimAdmissionDeferred` wait
fact bound to the original verified claimant/requester and source, authorization policy/version, and
enrollment/capability refs, plus a Slack notification intent; it leaves the Card Ready in Todo and
grants no claim, lease, capacity, or worktree. It does not fence, cancel, or kill already admitted
implementation leases. The original `ClaimAndStart` command key is terminal with that deferred
result.

Internal `RetryDeferredClaimAdmission` uses the wait-record ID plus a monotonic retry key. The
internal worker has no claimant authority of its own: under the canonical locks it rederives and
reauthorizes the original verified claimant/requester and source against the current role/source
policy, enrollment/capability refs, and authorization version, then revalidates current lane/queues,
Ready Contract Version and Ready Approval, assignment, dependency graph, Runner/capacity/resources,
Sprint Plan/member/reservation, GitHub health, containment, and Review WIP. Role revocation,
enrollment loss, source-policy change, or authorization-version mismatch atomically cancels or
supersedes the wait and notification with no claim, lease, capacity, or worktree. Used slots still
full schedules the next monotonic retry without replaying the original key. Eligible success
consumes the wait and creates at most one Claim Attempt, Execution Lease, capacity, and worktree
reservation; unique constraints and terminal wait state prevent duplicates. A material
contract/Ready, assignment, lane, or Sprint membership/Plan change likewise cancels or supersedes
the stale wait and notification before any retry can claim. Ordinary callers cannot claim a
nonterminal Sprint member; only the Sprint controller may do so for the exact next ordered member,
which must be eligible under the dependency-order proof bound to the exact approved Active Plan and
current graph versions, under its single-item reservation.

`CancelDeferredClaimAdmission` lets the Human Owner or authenticated original requester explicitly
withdraw an active future-start intent. It locks the wait row, uses wait ID plus cancellation nonce,
records a safe reason/actor, terminates the wait and pending notification, and leaves the Ready-
approved Todo Card unchanged with no claim, lease, capacity, worktree, or lane mutation. Retry and
cancel serialize on the wait: cancellation cannot revoke a claim after a winning retry. The shared
`ClaimAdmissionCancelled` event distinguishes `explicit_withdrawal` actor/reason from system-owned
`automatic_invalidation`; material replacement may instead emit `ClaimAdmissionSuperseded`.

Phase B begins with `RecordExecutionStartedReceipt`. The Runner ingress authenticates and verifies
the transport, then locks the exact Claim Attempt/start-deadline arbitration row to persist only the
minimal envelope hash, immutable routing IDs, trusted `observed_at`, and monotonic ingress identity.
A bounded verifier under the same row checks the signed ordered receipt's lease, nonce,
DevTicket/contract, Runner, worktree, branch, initial SHA, and sequence, then promotes or safely
rejects it without persisting unsafe free text. A verified fact enters the Runner inbox without lane
queue versions; it does not yet declare the lease started or move the Card.

An internal `AcceptExecutionStarted` transition worker consumes that inbox record. It loads the
current claim/lease/fence plus current Todo/In Progress queue versions and deterministic target
anchor, then submits one idempotent lane command. One transaction marks the claim/lease started,
changes Todo to In Progress, updates both queue memberships/versions, and appends the accepted
receipt/checkpoint, activity transition, and GitHub managed-status/worklog intent. A queue-only
conflict makes the worker reload queues/anchor and retry the same semantic transition identity; it
never rejects or loses the persisted receipt merely because an unrelated Card was reordered. Until
that transaction commits, the Card remains Todo with `Starting`/contained and its capacity/worktree
reservation held. If fencing or execution loss wins before it commits, the worker records the inbox
receipt as rejected/stale Runner evidence and preserves the resulting containment; it cannot move
the Card.

After a non-semantic carry-forward, receipt validation still uses the immutable original lease
binding and additionally requires the exact current Ready Contract Version plus Execution Binding
Carry-Forward equivalence ref. A receipt with only the old binding, or a mismatched lineage/current
head, cannot advance workflow.

`RejectExecutionStart` consumes a signed Runner rejection that proves no process began. Under the
active Revision/Material Revision Interruption, Claim Attempt arbitration, and Start Rejection
Containment locks, it chooses one owner. With no interruption, one prepare transaction sets the
Claim Attempt to terminal `failed`, fences the Execution Lease, and creates or reuses
`StartRejectionContainment(containing)` by `claim + start nonce + signed rejection receipt`, records
deterministic `no_process_started`, revokes local lease-credential and preview-tunnel authority,
enqueues applicable external revoke/close, emits `ExecutionStartRejected`,
`StartRejectionContainmentOpened`, and `ClaimStartFailed`, and holds capacity/worktree plus the
claim-created assignment. A revoke/tunnel confirmation records disposition but releases nothing.
Only `FinalizeStartRejectionContainment` may release capacity/worktree, clear only the claim-created
assignment, mark the record finalized, emit `StartRejectionContainmentFinalized`, and leave
Ready-approved Todo with the failed-request history.

If a Material Revision Interruption already owns that `start_pending` claim, the rejection receipt
and no-process proof are appended to it as `MaterialRevisionStartRejected`; no Start Rejection
Containment or independent finalizer is created, and only the interruption Finalize/Abort chooses
the lane/contract outcome and release. If Start Rejection Containment wins first, a material
Revision acceptance rejects/defer until its Finalize. `AcceptExecutionStarted`, execution loss,
Revision acceptance, and rejection lock the same arbitration/interruption/containment rows: accepted
start first makes rejection stale; rejection first makes later start acceptance stale; ambiguous
loss first owns Blocked containment; replay returns the selected owner without duplicate revoke or
release.

`RecordExecutionStartDeadlineElapsed` locks the same arbitration row and records only elapsed time
plus the bounded cutoff; it never invokes loss. At cutoff, `ExpireExecutionStart` locks the row,
lease, and inbox, orders only eligible committed markers by trusted `observed_at`/ingress identity,
and completes bounded verification. A valid winner acknowledges start even while its lane transition
is queue-blocked, so expiry requeues that transition. With no valid winner it invokes execution
loss, opens Blocked, and retains containment. After that loss commits, a marker committed after
cutoff—or any late processing—remains evidence only and cannot reverse workflow. Neither path
fabricates In Progress.

### `BlockExecution`

In v1, the Blocked lane represents admitted/start-attempted execution that cannot safely proceed or
whose presence is unknown. Ordinary pre-admission dependency/capacity/health waits remain locked or
pending in Todo. Manual `BlockExecution` requires an In Progress ticket and either the active
assignee/Runner, Human Owner, or a policy-authorized orchestrator. It requires a category, safe
reason, responsible actor/dependency where applicable, notification state, and last trusted
checkpoint ref (or explicit `execution_unknown`). Automatic loss may also move an ambiguous
`start_pending` attempt from Todo into Blocked through its dedicated internal command.

`BlockExecution` first locks the exact active Material Revision Interruption version or explicit
none under the canonical order. If an interruption already owns the execution, the command appends
the stable block request/category/safe reason/checkpoint cause to that owner, emits exactly one
`MaterialRevisionBlockCauseAppended`, and returns the owning interruption and event refs. The event
binds the exact interruption ID/version, block request ID, DevTicket/claim/lease/fence versions,
authorized actor/source, category, Secret-Safe reason hash/ref, checkpoint ref or explicit
`execution_unknown`, and resulting interruption version. The same authorized command key and hash
replay the original event ref. The command preserves the current lane, Review Handoff/WIP where
applicable, Claim Attempt state, and the sole interruption finalizer; it creates no `BlockedOpened`,
Blocked Episode, `RunnerContainmentRequest`, lane transition, resource release, or second
reconciler. Only explicit no interruption enters the ordinary Blocked branch below. A concurrent
interruption preparation and block request therefore select one owner under the same rows.

The transaction verifies/fences the active Execution Lease, locks exact In Progress/Blocked queue
versions and the deterministic Blocked anchor, revokes exact lease-scoped credential-access and
local preview-tunnel grants, enqueues applicable external revoke/close, opens the Blocked Episode,
sets the Claim Attempt to terminal `fenced` with its prior `started` phase preserved, and creates or
reuses one `RunnerContainmentRequest` for
`lease + old fence + advanced fence + block request + containment purpose`. That request binds the
exact Runner process registration/version or explicit unknown, worktree identity/path binding,
requested checkpoint plus stop-or-quarantine action, and one-use nonce. The same transaction
enqueues its Runner delivery, changes membership/lane to Blocked, and appends the linked facts/
intents; retry reuses both request and delivery. It releases capacity only after
`ReconcileRunnerContainment` consumes an authenticated Runner confirmation matching every binding,
accepts the last checkpoint or explicit unknown disposition, proves the old process/worktree stopped
or quarantined, and observes required lease-credential revocation plus tunnel closure/revocation
confirmations. Otherwise containment remains held. Category and safe reason are always mandatory.
Failure to obtain a trustworthy checkpoint uses the explicit checkpoint state
`execution_unknown`/`Connection Lost / Execution Unknown`; it never invents a clean checkpoint.

### Automatic execution loss

`DetectExecutionLoss` is a verified internal command consumed from #232's detector for Runner
disconnect, lease expiry, machine/key revocation, start timeout, or other loss of execution
authority. Its idempotency identity is the lease/claim ID plus detector epoch and normalized cause;
the full expected-version set makes it safe against concurrent receipts and human commands.

When the locked Claim Attempt is still `credential_provisioning`, execution has not begun: that
state has no Runner start outbox or accepted start marker. It may already have a reserved process
registration, worktree, containment handle, and armed Enforcer, but never an OS process; the signed
reserved/no-process observations distinguish those preparations from execution.
`DetectExecutionLoss` first locks the active Revision/Material Revision Interruption. If the
interruption already owns this claim, the detector appends its stable epoch/cause and authenticated
`no_start_enqueued`/`no_process_started` proof to that record, emits
`MaterialRevisionProvisioningLossObserved`, reuses its revocation/confirmation set, and returns its
ID. It opens no Pre-Start Admission Loss or Blocked Episode, and only that interruption's
Finalize/Abort may release resources or select Todo/Backlog. With explicit no interruption, the
command atomically sets the Claim Attempt to terminal `failed`, fences the Execution Lease, creates
`PreStartAdmissionLoss(containing)`, records the same proof, cancels pending provisioning and any
not-yet-existing start delivery identity, marks pending/active grants `revocation_pending` as
applicable, revokes local preview authority, and enqueues/reuses external grant/tunnel revocations.
Todo membership does not change and no Blocked Episode opens. The Card immediately shows a safe
failed-request reason from `ClaimStartFailed`; capacity/worktree and only the claim-created
assignment remain held while containment is pending. `FinalizePreStartAdmissionLoss` requires the
exact proof, explicit absence of a Material Revision Interruption for the claim, plus every grant/
tunnel confirmation, then atomically releases capacity/worktree, clears only claim-created
assignment, marks the loss finalized, and leaves Ready-approved Todo eligible for a fresh governed
claim.

The final-grant activation/start-enqueue transaction, Material Revision Interruption, and Pre-Start
Admission Loss lock the same Revision/interruption, Claim Attempt, grants, and outbox identities in
canonical order. If loss wins without an interruption, activation is stale/revocation-bound and no
start is enqueued. If Revision preparation wins, later loss is evidence on its interruption. If
activation/start enqueue wins, state is `start_pending`; the pre-start branch is ineligible and loss
uses the selected-owner rules below. Replays cannot create two containment owners.

For `start_pending` or started execution, `DetectExecutionLoss` first locks the active Material
Revision Interruption and Start Rejection Containment. An interruption-first claim appends the
detector evidence/checkpoint or no-process proof to that owner and reuses its containment; a Start
Rejection owner links the cause as a no-op observation and retains its confirmation-gated Finalize.
Neither case opens Blocked or releases anything. Only explicit absence of both owners permits the
loss transaction to fence ordinary receipt authority, lock source/Blocked queues, open/reuse the
single `BlockedEpisode(Connection Lost / Execution Unknown)`, move started In Progress or ambiguous
start-pending Todo to Blocked, set the Claim Attempt to terminal `fenced` while preserving its prior
phase, preserve the last trusted checkpoint, mark process/worktree containment unresolved, retain
capacity/worktree, revoke affected lease credentials/tunnel authority, and enqueue safe Slack/GitHub
notification plus external revoke/close intents. No raw tunnel token is stored, and database
fencing/local tunnel revocation is never process/filesystem/ GitHub/external-tunnel containment
proof.

Race rules are deterministic under the same locks:

- accepted start transition first, then loss: In Progress is recorded, then loss opens Blocked;
- receipt persisted first but loss/fence commits before the start transition: the inbox fact
  remains, but the stale receipt is rejected and containment wins;
- loss first, then start receipt: ingress retains the verified owner fact, while the transition sees
  the advanced fence and rejects it for workflow authority;
- a valid marker with trusted `observed_at <= deadline` that commits by the bounded cutoff but whose
  transition is still queue-blocked: arbitration treats it as acknowledged, leaves
  Starting/contained, and requeues the same transition identity; it cannot invoke loss;
- signed start rejection first with proof no process began: Start Rejection Containment wins, holds
  resources until its named Finalize, and makes later loss a linked no-op observation;
- timeout/loss first: Blocked and containment hold win; a late rejection/receipt is evidence only
  and cannot release it or open Start Rejection Containment;
- loss races credential-access or preview-tunnel use/refresh: the loss transaction's local authority
  revocations win under the same grant locks; late access/use/refresh is denied, while external
  revocation/closure remains tracked by durable outboxes;
- manual `BlockExecution` first: the detector links its cause/evidence to the existing episode and
  does not create a second lane transition; detector first makes the manual command an idempotent
  enrichment or already-blocked result.
- Material Revision Interruption preparation first, then `BlockExecution`: the block request appends
  its cause to that interruption, preserves the lane, and creates no Blocked Episode, Runner
  request, or second finalizer; Blocked transition first makes a later material Revision re-evaluate
  the existing Blocked containment under its ordinary Blocked branch.

Recovery requires a verified stopped/quarantined process disposition, reconciled worktree, branch,
SHA, dirty state, and GitHub-write state, plus confirmed revocation of every affected Lease
Credential Access Grant and confirmed closure/revocation of the affected preview tunnel. Only then
can containment capacity be released or a fresh claim admitted.

### `ResolveOrSupersedeBlock` and reconnect

`ResolveOrSupersedeBlock` always requires the old lease fenced, the process stopped or quarantined,
the worktree/GitHub disposition reconciled, and affected Lease Credential Access Grant revocation
plus preview-tunnel closure/revocation confirmed. It rejects while an `AcceptedPendingApplication`
Revision or Material Revision Interruption exists; that work must use
`FinalizeMaterialRevisionInterruption` or `AbortMaterialRevisionInterruption` under their own queue
transaction.

With no interruption, the command locks the exact current Blocked Episode, current Ready Approval,
and Blocked plus target Todo/Backlog queues, then requires one exact disposition:

- `resolved` requires proof that the named condition ended. It releases remaining containment,
  closes/clears the Blocked Episode with `BlockedResolved`, and returns to Todo under the
  still-valid exact Ready Approval.
- `superseded` requires explicit authorized abandonment/obsolescence reason and the same safe
  containment proof. It closes/clears with `BlockedSuperseded`, preserves every unresolved
  condition/Incident/Dependency ref, and never claims resolution. If the exact Ready Approval
  remains valid and the work remains executable, it returns Todo; otherwise it invalidates that
  approval and moves Backlog. A later archive is a separate command after this transition.

Neither disposition moves directly to In Progress. The default clears the current Execution
Assignee; retaining the same actor as a Todo preassignment is an explicit Human Owner/Admin option
recorded in the command.

Runner reconnect first writes a reconciliation observation: process identity, old fence, worktree,
branch, SHA, dirty summary, Docker state, GitHub state, last nonce/sequence, and checkpoint. Any old
process is stopped or quarantined and every affected Lease Credential Access Grant revocation and
preview-tunnel closure/revocation is confirmed before new authority is granted. Continuation then
uses a new `ClaimAndStart`, lease ID, fencing token, and command nonce. That command also rechecks
the durable containment disposition; DB lease fencing alone is insufficient. It may adopt the
verified existing worktree/checkpoint, but it never resurrects the old lease or blindly fails over
to cloud. This is the fresh-claim interpretation of
`docs/adr/ADR-017-dev-board-authority-sync-execution.md`.

### Review and Done boundary consumed by this model

`SubmitForReview` requires an accepted final implementation checkpoint/receipt for the exact
contract/SHA. When an Execution Binding Carry-Forward exists, Review evidence binds the immutable
original claim/lease contract, complete equivalence lineage, and exact current contract head. The
command declares exact In Progress/Review queues, active Review Handoff row, and global Review WIP
counter, then acquires every applicable row only in the canonical total order above. If WIP is
three, it leaves the Card as ordinary valid In Progress with its active Claim Attempt, Execution
Lease, capacity/worktree reservation, and mutable implementation evidence unchanged; it emits only
one deduplicated Review-admission retry plus safe Slack notification intent, bound to the request's
exact candidate checkpoint ID, SHA, and equivalence-lineage hash. It freezes no evidence, releases
no authority, creates no intermediate domain state, and does **not** create a fourth Review member.

The hard invariant is `global Review WIP counter = exact Review membership <= 3`. If WIP is below
three, `SubmitForReview` validates the exact final checkpoint/receipt and submission authority, then
in one transaction freezes the candidate, fences/revokes implementation authority, enqueues stop/
revoke intents, creates `ReviewHandoff(prepared)`, moves In Progress→Review, and increments WIP.
Projection shows Review / Preparing Review; it performs no network call and launches no reviewer.
Lease/capacity/worktree remain containment. When no grant/tunnel applies, exact disposition is
`none`. Verified inbox facts feed `FinalizeSubmitForReview`, which locks Review
Handoff/counter/queues, requires no-process or stopped/quarantined process/worktree proof plus every
confirmation, releases resources, marks finalized, and emits ReviewRequested without changing lane
or WIP. Only then may #229 provision fresh Reviewer/local-Docker authority and launch review. A
deferred internal `RetrySubmitForReview` is causally bound to the validated original submission
intent and exact checkpoint/candidate hash through one stable `ReviewAdmissionRetry` job ID. The job
retains the original verified requester/principal/source and exact membership/role/session/
enrollment/key authorization refs and versions. Each worker run first takes those authorization
records in canonical order, reauthenticates the original source, and reauthorizes current submission
authority; revocation or version drift cancels the job and its Slack intent with no submission. Only
then does it atomically claim the next monotonic attempt sequence, load current counter, queues,
target anchor, and evidence, and submit an attempt envelope/key of `retry job ID + attempt sequence`
whose canonical hash includes those freshly loaded versions. A queue conflict is terminal only for
that attempt and schedules the next sequence; it never reuses a command key with a different queue
hash. Slack notification identity is the stable job ID and is not duplicated by attempts. Mutable
evidence may continue changing while deferred, but any checkpoint/ SHA/equivalence-lineage mismatch
cancels the job and requires a fresh explicit `SubmitForReview`; retry can never submit different
work. On an exact match with a slot, it consumes the job and retries the atomic Submit admission. A
still-full counter advances attempt disposition while leaving execution active without a duplicate
job or notification. #229 may launch Reviewer execution only after the finalized `ReviewRequested`
fact commits; `ReviewAdmitted` alone authorizes neither fresh Reviewer authority nor launch.
PR/base-branch and other review-run repository facts begin only when #229 launches the Reviewer and
records their authenticated owner facts; #230 Review admission/request events never fabricate them.

Handoff expiry or stale/mismatched confirmation facts cannot preserve reusable implementation
authority. `CancelReviewHandoff` is authorized only for the exact active requester/assignee, Human
Owner, or policy-authorized orchestrator; expiry/drift is trusted-internal. `ExpireReviewHandoff`
uses `ReviewHandoff ID + exact expiry instant` as its identity. From exactly `prepared`, one
transaction changes `prepared -> cancelling`, emits `ReviewHandoffExpired` and
`ReviewHandoffCancellationRequested` once, and creates/reuses the same containment intents; replay
returns that disposition without another event/outbox. An already cancelling or terminal handoff
returns its recorded disposition and emits neither expiry event. Explicit cancellation emits only
`ReviewHandoffCancellationRequested`. Both paths lock Review Handoff/WIP/Review queues in canonical
order and keep Review membership/WIP while unsafe. `FinalizeCancelReviewHandoff` consumes verified
no-process or stopped/quarantined process/worktree proof plus all grant/tunnel confirmations,
atomically moves Review→Todo, decrements WIP once, releases resources, clears only claim-created
assignment, preserves explicit preassignment, and marks cancelled. Replays and crashes cannot
double-decrement or double-release. No false Review or Blocked membership is fabricated.

While pre-admission retry is deferred, normal In Progress rules apply. After Review entry, an
accepted material Revision that sees a `prepared` or `cancelling` Review Handoff atomically changes
it to terminal `superseded`, binds the exact Material Revision Interruption/Revision ref, emits
`ReviewHandoffSuperseded`, and reuses the Review Handoff's containment intent/confirmation refs; the
governed Review-to-Backlog finalization then decrements WIP once. Execution loss that sees a
`prepared` or `cancelling` Review Handoff atomically changes it to terminal `failed`, binds the
exact Blocked Episode and detector evidence, emits `ReviewHandoffFailed`, reuses rather than
duplicates its containment refs, and moves Review→Blocked with one WIP decrement. Replays return the
recorded terminal disposition and cannot duplicate containment or decrement. A `finalized` Review
Handoff remains immutable history. A later material Revision binds its interruption to that exact
handoff/review run, requests #229's Review Containment Proof, and cannot finalize Review→Backlog
until the authenticated proof confirms every applicable Reviewer lease/process, Docker
session/lease, preview tunnel, and evidence authority stopped/closed/reconciled; later loss records
also cross-reference rather than rewrite it. `BlockExecution` remains In-Progress-only. Archive
rejects every Review member and every live Review Handoff.

The Review Handoff state transition itself selects the winner. Once Revision/loss changes `prepared`
or `cancelling` to `superseded` or `failed`, `FinalizeCancelReviewHandoff` is ineligible and returns
that recorded terminal disposition without a lane, WIP, release, or containment write. Only a row
still exactly `cancelling` may finalize cancellation; the same lock/version prevents two terminal
owners.

Every ordinary changes-requested or Done exit consumes an exact #229-authenticated
`ReviewExitContainmentProof` bound to the Review Handoff/run/result/candidate. It must prove the
Reviewer process/lease, shared Docker lease/session, test credential grants/tunnel, and every
artifact/evidence writer stopped, closed, or reconciled. The proof is a #229 owner fact, not
inferred from a verdict, database fence, or GitHub check. Both verdict commands lock that proof and
decrement the same membership-only WIP counter atomically with the lane change. They also
lock/recheck exact current contract/evidence, active Revision slot, Material Revision Interruption,
Review Handoff, WIP, and queues. A Revision in `AcceptedPendingApplication` or any live interruption
rejects the verdict with zero lane/WIP/event writes; containment must Finalize/Abort first.
`ReviewChangesRequested` returns to Todo with no live claim/lease and clears the assignee by
default; an explicit authorized preassignment is allowed. Work proven blocking another DevTicket or
the approved Active Sprint Goal sets `reviewReworkPlacement=blocking_top` and the front rank of its
exact dependency/Priority band in the globally first tier; ordinary rework gets `ordinary_bottom`
and the bottom rank of its exact dependency/Priority band in the globally last tier. `AdmitDone` is
a system-owned command disabled until #229's contract is implemented; it must also observe the exact
approved Review/Ready Approval and verified GitHub merge into `development` correlated to #229's
proof-bound governed merge authorization/outbox, then decrement WIP with Done admission. An early or
external merge Sync Conflict rejects ordinary Done until fresh Post-Merge Review reconciliation. If
a verdict transition wins first, its event binds the exact active Revision-slot version, confirms no
`AcceptedPendingApplication` Revision or live interruption, and binds the contract/evidence
versions. An `AwaitingDecision` Revision is preserved and deterministically re-evaluates from the
resulting Todo or Done under ordinary lane rules. A UI drop, GitHub label, agent, or stale
projection cannot invoke Done directly.

## Archive, restore, and Historical Projection

### Archive

Archive is an overlay, not a lane transition or delete. `ArchiveDevTicket` requires reason and
authorization and rejects:

- a live/pending claim, lease, or unresolved execution/containment (use governed checkpoint/block,
  stop/quarantine, exact lease-scoped credential-access and local preview-tunnel revocation plus all
  required external confirmations, and reconciliation first; fencing alone is insufficient);
- any `PreStartAdmissionLoss(containing)` or `StartRejectionContainment(containing)`; only its named
  finalizer may release held capacity/worktree or clear the claim-created assignment before a later
  archive command;
- every current Review member and every live Review Handoff; a governed Review exit (including safe
  Review Handoff cancellation where applicable) must finish first, with its WIP decrement in that
  same lane transaction;
- any current Blocked Episode; first use `ResolveOrSupersedeBlock` so the episode is closed and
  `currentBlockedEpisodeRef` cleared, then request archive separately;
- active dependents that would be left with an impossible blocker unless they are revised first;
- any Draft, Approved, Queued, or Active Sprint membership; the Sprint command boundary must
  explicitly remove or revise the member/Plan first;
- an Absolute Stop containment action that has not completed its required redaction/revocation.

The command locks the source lane queue, archive-membership version, exact current Ready Approval
version/binding (or explicit none), current Execution Assignee/preassignment version, current Sprint
membership, and Sprint/Plan versions, then rechecks that no nonterminal Sprint membership, active
containment, or current Blocked Episode remains. It never edits a Sprint Plan as a side effect. On
success it records `archived_at/by/reason/version`, preserves `last_active_lane`, atomically clears/
deactivates the current Ready Approval binding with `ReadyDeactivatedByArchive`, and clears any
current Execution Assignee/preassignment (including safe Todo) with an `ExecutionAssigneeChanged`
archive disposition. Immutable approval and assignment history remain with all contracts/comments/
worklogs/edges/evidence. The same transaction removes the record from the source queue, increments
lane/archive membership versions, and emits mirror/archive intents. Terminal Sprint membership
history remains immutable provenance. Archive does not close a GitHub Issue as “Done”; provider
disposition is an explicit sync policy fact.

### Restore

- A non-Done DevTicket restores under exact archive-membership/Backlog queue versions to the
  deterministic Backlog anchor with no current Execution Assignee/preassignment, claim, lease, or
  active approval. Prior approval and assignment stay historical; restore never reactivates either,
  and current Ready must be validated and approved again before a fresh governed claim.
- A reconciled Done DevTicket may restore to the Done history view only when the exact completion
  evidence and GitHub merge fact remain valid. It never becomes executable by restore.
- Proposal restore only removes its archive overlay. It preserves Draft/AwaitingDecision or the
  terminal Accepted/Merged/Rejected state exactly. A new Proposal is required only when there is new
  work or a genuinely new decision to make, and it references the prior Proposal.

This memo settles only Proposal and DevTicket archive overlays/commands. It does **not** claim
DBF-178 is fully settled: #233 must define Sprint Archive/Restore with Plan/member invariants, #234
owns Docs archive semantics, and #235 owns retention/redaction. Those boundaries must consume these
DevTicket refs without treating this command as authority over their lifecycles.

### Historical Projection

Migration assigns each source record a disposition and gate provenance. Unverified legacy Done may
appear in the Historical Projection with `recordClass=legacy_historical` and
`completionGate=legacy_unverified`; it does not emit current `DevTicketCompleted`, satisfy a new
dependency, or enter quality metrics. A reconciled legacy completion may be promoted only by an
explicit migration command that cites the preserved Review/merge evidence. Projections always expose
their source epoch/freshness so a command never treats display position as authority.

`ImportLegacyDevTicket` may create active-lane membership only with an explicitly confirmed Human
Owner and every current gate for the selected target. A legacy assignee is attribution evidence,
never inferred ownership. Without confirmed ownership/gates, import creates a quarantined record or
Historical Projection candidate with its source disposition. In particular, legacy Todo may become
Backlog only after Human Owner confirmation and Backlog gate validation; it is never imported
directly to Todo or granted Ready Approval.

## Authoritative events and ledger routing

The write model is not required to be event-sourced: normalized aggregate rows are current Opzava
truth. Immutable accepted facts and an outbox make decisions auditable and projections rebuildable.
Only a committed command or a verified owner-fact inbox can emit an authoritative event.

### Event families

- Planning: `ProposalDrafted`, `ProposalDecisionRationaleRecorded`, `ContractVersionCreated`,
  `RevisionProposed`, `RevisionDecisionRationaleRecorded`, `ReadyValidationRecorded`,
  `PolicyExceptionRationaleRecorded`, and `AbsoluteStopEvidenceRecorded`.
- Workflow/activity: `ProposalSubmitted`, `ProposalAccepted`, `ProposalMerged`, `ProposalRejected`,
  `ProposalArchived`, `ProposalRestored`, `DevTicketCreated`, `LaneChanged`,
  `ExecutionAssigneeChanged`, `ReadyApproved`, `ReadyApprovalCarriedForward`, `ReadyInvalidated`,
  `ReadyDeactivatedByArchive`, `ExecutionBindingCarriedForward`, `SprintPlanBindingCarriedForward`,
  `ClaimRequested`, `ClaimRequestConsumed`, `ClaimRequestCancelled`, `ClaimRequestSuperseded`,
  `ClaimPrepared`, `ClaimStartFailed`, `ClaimAdmissionDeferred`, `ClaimAdmissionRetried`,
  `ClaimAdmissionCancelled`, `ClaimAdmissionSuperseded`, `LeaseGranted`, `LeaseStarted`,
  `LeaseFenced`, `LeaseReleased`, `LeaseCredentialAccessReserved`, `LeaseCredentialAccessActivated`,
  `LeaseCredentialAccessProvisionFailed`, `LeaseCredentialAccessProvisionExpired`,
  `LeaseCredentialAccessProvisionCancelled`, `LeaseCredentialAccessRevoked`,
  `RunnerReceiptAccepted`, `RunnerReceiptRejected`, `ExecutionStartDeadlineElapsed`, `StartExpired`,
  `RunnerContainmentRequested`, `RunnerContainmentConfirmationRejected`,
  `PreStartAdmissionLossOpened`, `PreStartAdmissionLossFinalized`,
  `StartRejectionContainmentOpened`, `StartRejectionContainmentFinalized`,
  `MaterialRevisionProvisioningLossObserved`, `MaterialRevisionStartRejected`,
  `PreviewTunnelAuthorityRevoked`, `MaterialRevisionInterruptionPrepared`,
  `MaterialRevisionInterruptionFinalized`, `ContainmentReconciled`, `RunnerReconciled`,
  `RevisionAcceptedPendingApplication`, `RevisionApplied`, `RevisionRejected`,
  `RevisionAbortedAfterAcceptance`, `MaterialRevisionInterruptionAborted`,
  `MaterialRevisionBlockCauseAppended`, `MaterialRevisionReviewContainmentRequired`,
  `MaterialRevisionReviewContainmentAccepted`, `DevTicketMetadataChanged`, `CommentAppended`,
  `CommentCorrectionAppended`, `HumanWorklogAppended`, `HumanWorklogCorrectionAppended`,
  `AgentWorklogAppended`, `AgentWorklogCorrectionAppended`, `AgentWorklogLinked`,
  `AbsoluteStopOpened`, `AbsoluteStopReviewContainmentRequired`,
  `AbsoluteStopReviewContainmentAccepted`, `AbsoluteStopResolved`, `PolicyExceptionOpened`,
  `PolicyExceptionApproved`, `PolicyExceptionRejected`, `PolicyExceptionExpired`,
  `PolicyExceptionRevoked`, `PolicyExceptionConsumed`, `DependencyAdded`, `DependencyRemoved`,
  `TodoReordered`, `BlockedOpened`, `BlockedResolved`, `BlockedSuperseded`, `ReviewAdmitted`,
  `ReviewRequested`, `ReviewHandoffPrepared`, `ReviewHandoffCandidateRebound`,
  `ReviewHandoffFinalized`, `ReviewHandoffCancellationRequested`, `ReviewHandoffExpired`,
  `ReviewHandoffCancelFinalized`, `ReviewHandoffSuperseded`, `ReviewHandoffFailed`,
  `ReviewChangesRequested`, `DevTicketCompleted`, `DevTicketArchived`, `DevTicketRestored`,
  `LegacyDevTicketImported`, and `HistoricalCompletionReconciled`.
- Runner observations/proofs (never lifecycle authority): `ExecutionStartReceiptRecorded`,
  `ExecutionStartRejected`, `CheckpointAccepted`, `ExecutionLossDetected`,
  `RunnerContainmentConfirmed`, `PreStartNoProcessProven`, `ReviewContainmentProofRecorded`,
  `ReviewExitContainmentProofRecorded`, and `RunnerDisconnected`.
- Integration: `GitHubIssueBindingReserved`, `GitHubIssueBindingConfirmed`,
  `GitHubIssueBindingConflict`, `GitHubIssueCreateRequested`, `GitHubIssueLinkRequested`,
  `GitHubIssueCreateConfirmed`, `GitHubFactObserved`, `MirrorWriteQueued`, `MirrorWriteConfirmed`,
  `WebhookDeduplicated`, `SyncConflictOpened`, `SyncConflictResolved`,
  `PolicyExceptionNotificationQueued`, `PolicyExceptionNotificationConfirmed`,
  `IntegrationHealthChanged`, `LeaseCredentialProvisionQueued`, `LeaseCredentialProvisionConfirmed`,
  `LeaseCredentialProvisionCancelled`, `RunnerStartDeliverySuppressed`,
  `LeaseCredentialRevocationQueued`, `LeaseCredentialRevocationConfirmed`,
  `CredentialRevocationQueued`, `CredentialRevocationConfirmed`, `PreviewTunnelRevocationQueued`,
  `PreviewTunnelRevocationConfirmed`, `AdmissionNotificationQueued`,
  `AdmissionNotificationConfirmed`, `ClaimAdmissionRetryQueued`, `ReviewAdmissionRetryQueued`,
  `ReviewAdmissionRetryCancelled`, `ReviewAdmissionNotificationQueued`,
  `ReviewAdmissionNotificationConfirmed`, and `SnapshotReconciled`.

Event-family placement is authority, not merely storage naming. Every claim/lease/grant/binding/
fence/containment/release lifecycle event is a Dev Board workflow/activity fact. A Runner-family
event records only an authenticated signed local observation or proof; it cannot itself grant,
start, fence, release, terminalize, or reconcile lifecycle state. The accepting/rejecting Dev Board
command, where required, emits the corresponding workflow/activity event and links the Runner fact.

Generic `CredentialRevocationQueued/Confirmed` applies only to underlying named-secret or credential
revocation/quarantine in the secret-exposure Absolute Stop path. Ordinary lease lifecycle uses only
the distinct lease-credential provision/revocation events above.

`ReviewContainmentProofRecorded` is an authenticated #229 owner fact, not a #230 inference.
`MaterialRevisionReviewContainmentRequired` binds the interruption to the exact finalized handoff
and review run; `MaterialRevisionReviewContainmentAccepted` is emitted only by the successful
finalizer that consumes the matching proof. `PreStartAdmissionLossOpened` and
`PreStartNoProcessProven` record any terminal pre-start cause and its deterministic absent
start/process evidence; `PreStartAdmissionLossFinalized` records release after every grant/tunnel
confirmation. None of those pre-start events emits `BlockedOpened` or `ExecutionLossDetected` for a
process that never received start delivery. Provider denial, expiry, and authorized cancellation
also emit their exact `LeaseCredentialAccessProvisionFailed`,
`LeaseCredentialAccessProvisionExpired`, or `LeaseCredentialAccessProvisionCancelled` source fact,
all cross-linked to the same Pre-Start Admission Loss.

`ExecutionStartRejected` and `StartRejectionContainmentOpened` bind the exact signed rejection,
claim/start nonce, and no-process proof; `StartRejectionContainmentFinalized` alone records
confirmation-gated release. If a Material Revision Interruption already owns the claim,
`MaterialRevisionProvisioningLossObserved` or `MaterialRevisionStartRejected` records the source/
proof on that interruption and no Pre-Start/Start Rejection opened/finalized event may exist for the
same claim. The unique owner ref is observable proof that only one finalizer can release resources
or choose the lane/contract outcome.

`ReviewExitContainmentProofRecorded` is the distinct #229 owner fact for an ordinary verdict exit.
It binds the exact Review Handoff/run/result/candidate and every Reviewer process/lease, shared
Docker lease/session, test grant/tunnel, and artifact/evidence writer disposition. Only
`ReviewChangesRequested` or `AdmitDone` consumes it, atomically with its Review exit/WIP decrement;
material-Revision or Absolute Stop containment proof cannot substitute.

#229's governed merge authorization/outbox locks and references—without consuming—that same exact
Review Exit Containment Proof **before** any provider merge request may dispatch. A provider merge
observed before proof acceptance or outside that governed outbox is an external-merge Sync Conflict:
retain Review membership/WIP, fence or contain remaining review authority, record the provider fact
without fabricating authorization, and require fresh Post-Merge Review reconciliation. That early
merge can never satisfy ordinary `AdmitDone`.

`AbsoluteStopReviewContainmentRequired` binds the stop to the exact finalized Review Handoff/review
run and distinct Reviewer lease/process, shared Docker session/lease, preview tunnel, and evidence
authority. `AbsoluteStopReviewContainmentAccepted` is emitted only when `ResolveAbsoluteStop`
consumes the exact authenticated #229 Review Containment Proof; it neither rewrites the handoff nor
duplicates a Material Revision or Blocked containment finalizer.

`RunnerContainmentRequested` binds a Blocked Episode or Absolute Stop to the exact lease, old and
advanced fence, process registration/version or explicit unknown, worktree identity/path binding,
requested checkpoint plus stop-or-quarantine action, and one-use nonce. Only an authenticated Runner
confirmation matching every binding emits `RunnerContainmentConfirmed`; an authenticated but
mismatched or replayed confirmation emits/returns the stable rejected disposition and cannot satisfy
`ReconcileRunnerContainment`. Unauthenticated input is denied before receipt/event persistence.
Database fencing and credential/tunnel revocation are separate legs, not substitutes for this
process/worktree owner fact.

`ClaimRequested` carries the original verified requester/principal and source, intended claimant,
authorization policy/version, Runner enrollment/capability refs, and exact target/gate versions. The
worker emits exactly one of `ClaimRequestConsumed`, `ClaimRequestCancelled`, or
`ClaimRequestSuperseded` under current reauthorization/revalidation; none may substitute worker
identity as claimant authority.

`ReviewChangesRequested` and `DevTicketCompleted` carry the exact contract/evidence, active Revision
slot, Material Revision Interruption explicit-none/current version, Review Handoff, and WIP/queue
versions that authorized the verdict transition. Rejection against `AcceptedPendingApplication` or a
live interruption emits neither event—only the normal rejected command receipt. If either event
commits first, it is the inverse-race proof that a later Revision must re-evaluate from Todo or
Done.

`ProposalDrafted` remains a planning-ledger fact owned by the discovering agent/Lead Orchestrator;
it is not a human workflow event. Submission and every authoritative human decision/overlay change
emit the corresponding Proposal workflow/activity event above.

`MaterialRevisionInterruptionAborted` records `restore_todo` or `invalidate_to_backlog` plus its
target anchor. The fallback also emits `ReadyInvalidated`; neither disposition emits
`AbsoluteStopResolved`. For a Blocked source, proven resolution emits `BlockedResolved`; an
unresolved `invalidate_to_backlog` emits `BlockedSuperseded` instead. Either event carries the
Blocked Episode ID plus abort, lane, and source/target queue fact refs, while supersession also
retains the unresolved condition/incident/dependency refs. An abort from another source lane emits
no Blocked lifecycle event because no current Blocked Episode exists.

`MaterialRevisionBlockCauseAppended` is the immutable activity fact for an authorized
`BlockExecution` absorbed by a live Material Revision Interruption. It binds the exact interruption
ID/version, block request ID, DevTicket/claim/lease/fence versions, authorized actor/source,
category, Secret-Safe reason hash/ref, checkpoint ref or explicit `execution_unknown`, and the
resulting interruption version. The same authorized command key and hash replay the original event
ref. It emits no `BlockedOpened`, opens no Blocked Episode, mutates no lane/WIP/claim state, and
creates no second containment request, finalizer, reconciler, or release owner.

Every event contains stable event ID, aggregate ID/version where applicable, occurred/recorded
times, trusted actor/source, `authorizationVersion`, distinct `commandId` and `idempotencyKey`,
correlation/causation refs, and safe hashes/refs rather than secret values. External facts retain
provider delivery/sequence evidence and never masquerade as an Opzava lane decision.

### Four-ledger write matrix

| Action                                                                  | Planning decision ledger                                  | Dev Board activity/history                                                                                                                                | Runner execution/checkpoint                                                                            | Sync/outbox/conflict                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Every content-bearing/free-text command                                 | only Secret-Safe Ingress-passed text                      | only passed text; suspected-secret product/audit records contain no raw value                                                                             | only passed text; security path retains safe hash/ref only                                             | product/GitHub outbox only after pass; safe stop/notification uses safe refs only                                      |
| Draft/revise Proposal or contract                                       | rationale, questions, diff/version                        | accepted command/version or authoritative Revision decision                                                                                               | —                                                                                                      | mirror intent only after acceptance                                                                                    |
| Outside-contract metadata                                               | —                                                         | authoritative watcher/read/display metadata fact                                                                                                          | —                                                                                                      | optional display mirror intent; never contract/approval                                                                |
| Comments and worklogs                                                   | —                                                         | authoritative Secret-Safe immutable human/agent records and corrections; suspected-secret raw bodies never persist                                        | signed agent source observations/refs only; safe hash/ref links rejected/quarantined input             | #231-owned append/correction intents only after ingress pass; safe security notification                               |
| Submit/accept/merge/reject/archive/restore Proposal                     | draft validation or decision rationale + evidence inputs  | authoritative Proposal lifecycle event; DevTicket create only when accepted                                                                               | —                                                                                                      | GitHub Issue Binding plus idempotent create/link intent only on accept                                                 |
| Validate/approve/invalidate Ready                                       | rationale plus versioned validator inputs/result artifact | authoritative approval/carry-forward/invalidation, lane, fence, and release decisions                                                                     | signed process/checkpoint/containment proof refs if active work is invalidated                         | managed contract/status write intent                                                                                   |
| Apply non-semantic correction to Approved/Queued/Active Sprint member   | exact Revision/classification/equivalence rationale       | new contract/Ready Approval plus exact Sprint Plan and Execution Binding Carry-Forwards                                                                   | signed execution-equivalence observation for active/Blocked/Review lineage                             | managed contract/status worklog intent                                                                                 |
| Apply non-semantic correction to Draft Sprint member                    | exact Revision/classification/equivalence rationale       | atomic Draft Plan/member contract-ref update; no Sprint approval carry-forward; any execution equivalence decision                                        | signed execution-equivalence observation only if applicable                                            | managed contract/status worklog intent                                                                                 |
| Approve Ready and request start                                         | validation/rationale refs only                            | Ready Approval, Todo lane, ClaimRequested and any admitted claim/lease/grant/binding state after worker reauthorization/revalidation                      | signed Runner capability/process observations begin only under admitted authority                      | internal claim-request/start-delivery outbox; no duplicate or worker identity substitution                             |
| Needs Human Approval Request lifecycle                                  | request rationale and policy-evaluation inputs            | authoritative open/approve/reject/expire/revoke/consume and any resulting fence decision                                                                  | signed local containment proof ref only when the bound gate pauses execution                           | Slack/GitHub request and decision delivery attempts                                                                    |
| Absolute Stop lifecycle                                                 | safe evidence/remediation rationale refs                  | authoritative open/resolve, gate, fence, credential/tunnel revocation, release, lane effects; reuse existing owner; preserve finalized Review handoff/WIP | signed ordinary Runner proof or distinct #229 Reviewer/Docker/tunnel/evidence proof                    | durable Runner/#229/credential/tunnel intents, confirmations, and health reconciliation                                |
| Fence possibly live execution for Block or Absolute Stop                | safe reason/evidence refs only                            | Blocked Episode/Absolute Stop, fence/containment/release owner, and one bounded Runner Containment Request                                                | authenticated checkpoint plus process stopped/quarantined/unknown confirmation                         | Runner request delivery/retry; credential/tunnel confirmations remain separate                                         |
| Finalized-Review material Revision containment                          | Revision rationale and exact review binding               | containment-required/accepted refs; finalized Review Handoff unchanged; Finalize owns release and Review→Backlog/WIP                                      | #229-authenticated Review Containment Proof                                                            | idempotent #229 containment request and confirmation inbox                                                             |
| Ordinary Review changes-requested/Done exit                             | verdict rationale only where policy requires              | consume exact proof with Review→Todo/Done and WIP decrement atomically                                                                                    | #229 Review Exit Containment Proof for Reviewer/Docker/test grants/tunnel/artifact/evidence writers    | authenticated proof inbox; GitHub PR/base/merge facts begin with #229 reviewer launch, not #230 admission              |
| Abort material interruption                                             | authorized abort disposition/rationale artifact           | authoritative abort/release; preserved approval + Todo or invalidation + Backlog; optional Blocked resolution/supersession; Absolute Stop unchanged       | signed terminal containment proof                                                                      | optional safe status/mirror intent                                                                                     |
| Add/remove dependency                                                   | rationale + contract Revision ref                         | edge/version, invalidation, and any resulting fence/release decision                                                                                      | signed containment proof only if Revision stops active work                                            | managed dependency/status intent/conflict refs                                                                         |
| Claim/start/loss/block/recover/submit/admit Review                      | planning only when a policy decision/Revision occurs      | authoritative claim/lease/grant/binding/fence/containment/release/lane/WIP and Review Handoff lifecycle; WIP-full creates no handoff                      | signed capability/process/receipt/checkpoint/heartbeat/containment/equivalence observations and proofs | provision/revocation/stop confirmations, Review retry/Slack; fresh reviewer tunnel only after finalized Review Handoff |
| Open/finalize Pre-Start Admission Loss from provider/expiry/cancel/loss | —                                                         | Todo unchanged; authoritative failed claim/lease, held/released capacity/worktree, source-linked reason, and assignment cleanup at safe Finalize          | signed no-start/no-process proof                                                                       | provision/start suppression and grant/tunnel revocation confirmations                                                  |
| Open/finalize Start Rejection Containment                               | —                                                         | Todo unchanged; authoritative failed claim/lease, held/released capacity/worktree, signed-rejection reason, and assignment cleanup at named Finalize      | signed rejection/no-process proof                                                                      | grant/tunnel revocation intents and confirmations                                                                      |
| Provision loss/start rejection subordinated to material Revision        | Revision rationale remains owning decision                | one interruption remains `AcceptedPendingApplication`; source is linked; no second lifecycle/lane/finalizer                                               | deterministic signed no-start/no-process proof                                                         | existing interruption revocation/confirmation set reused; no duplicate finalizer                                       |
| Block cause subordinated to material Revision                           | Revision rationale remains owning decision                | one `MaterialRevisionBlockCauseAppended`; source linked; lane/WIP/claim unchanged; no `BlockedOpened`/Episode/new finalizer                               | signed checkpoint/process observation                                                                  | reuse existing containment deliveries; no duplicate outbox; optional notification links the event                      |
| GitHub webhook or mirror write                                          | — unless it proposes a governed Revision                  | accepted command plus authoritative pause/fence decision only if policy admits one                                                                        | signed Runner observation ref only if an admitted command affects execution                            | delivery dedupe, provider fact, attempts, confirmation, conflict/health                                                |
| Archive/restore                                                         | decision/reason                                           | lifecycle fact, Ready archive-deactivation, safe-lane result, and any required fence/release decision                                                     | signed containment proof refs                                                                          | provider archive/restore disposition intents                                                                           |

“Four ledgers” does not mean copying every payload into four tables. Each fact is written once under
its authority; the activity record links the command to optional planning, Runner, and sync record
IDs. Each ledger has its own monotonic ordering/checkpoint. There is no cross-system global sequence
(`docs/prd/PRD-019-dev-board.md`, `docs/plan/dev-board-foundation-decisions.md`).

## Command catalog: preconditions, retry identity, outcome, and ledger

Every row uses the common authorized command-receipt scope and canonical request hash. “Identity”
below is the source-stable semantic part of its `idempotencyKey`; it does not replace the server
`commandId` or provider/Runner dedupe. Every row first requires authenticated, non-persisting
tenant/target/family authorization; only then must all content-bearing/free-text fields pass
Secret-Safe Ingress **before** receipt, ledger, audit, outbox, or GitHub payload persistence. A
suspected secret executes only the safe-hash/ref security path, while transaction locks recheck
authorization before mutation.

For every row below, Opzava/Dev Board owns Runner selection/admission and every claim, lease, grant,
capacity/worktree binding, fence, containment, and release decision. “Runner ledger” means only the
signed local observations and proofs supplied under that authority; neither a Runner message nor a
provider delivery owns or directly mutates those lifecycle states.

| Command                                        | Required preconditions                                                                                                                                                                                                                                  | Idempotency identity                                                                                                  | Transactional outcome                                                                                                                                                                                                                 | Primary ledger effect                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DraftProposal`                                | authenticated agent or Lead Orchestrator discovery source; humans use `CreateBacklogDevTicket` for direct work                                                                                                                                          | source request/delivery + draft intent ID                                                                             | create Proposal Draft/version plus planning-owned `ProposalDrafted`, or replay it                                                                                                                                                     | planning owns content/rationale/draft fact; activity owns accepted command ref                                                |
| `SubmitProposal`                               | agent/Lead-authored active Draft, required decision form valid, expected Proposal/version                                                                                                                                                               | Proposal ID + submitted version                                                                                       | AwaitingDecision + `ProposalSubmitted`                                                                                                                                                                                                | planning owns validation inputs; activity owns lifecycle event                                                                |
| `AcceptProposal`                               | AwaitingDecision, human authority, exact versions/Backlog queue; link path holds fresh provider observation and unowned GitHub Issue Binding key                                                                                                        | Proposal ID + decision version + mirror disposition                                                                   | terminal Accepted + `ProposalAccepted` + one Backlog DevTicket; link binding claimed before link outbox, or create-intent binding reserved                                                                                            | planning owns rationale; activity owns decision/create; sync owns binding/intent                                              |
| `ConfirmGitHubIssueCreated`                    | verified provider-create result, matching create intent, exact unowned repository/Issue binding key                                                                                                                                                     | provider delivery + create intent + repository/Issue                                                                  | claim GitHub Issue Binding and attach mirror; existing owner opens conflict/reconciliation, never overwrite                                                                                                                           | sync owns provider fact/binding/conflict; activity links confirmation only                                                    |
| `MergeProposal`                                | exact AwaitingDecision Proposal, human authority, active target DevTicket and expected versions                                                                                                                                                         | Proposal ID + version + target DevTicket/version                                                                      | terminal Merged + `ProposalMerged` + evidence/Revision proposal on target; no second ticket                                                                                                                                           | planning owns rationale/diff; activity owns terminal decision; sync only if managed content changes                           |
| `RejectProposal`                               | exact AwaitingDecision Proposal, human authority, safe reason                                                                                                                                                                                           | Proposal ID + version + rejection decision                                                                            | terminal Rejected + `ProposalRejected`                                                                                                                                                                                                | planning owns rationale; activity owns decision                                                                               |
| `ArchiveProposal`                              | Proposal exists, human archive authority, no unresolved containment action                                                                                                                                                                              | Proposal ID + current version + archive reason                                                                        | archive overlay + `ProposalArchived`; underlying state unchanged                                                                                                                                                                      | planning owns reason; activity owns archive fact                                                                              |
| `RestoreProposal`                              | archived Proposal, human restore authority                                                                                                                                                                                                              | Proposal ID + archive version                                                                                         | remove overlay + `ProposalRestored`; reveal same Draft/Awaiting/terminal state                                                                                                                                                        | activity owns restore fact                                                                                                    |
| `CreateBacklogDevTicket`                       | explicit human shaping intent, Human Owner, structurally valid draft contract (mandatory Ready fields may be explicit-missing), exact none/Backlog membership; canonical create/link reservation rules                                                  | source request + draft hash + mirror disposition/binding identity                                                     | Backlog DevTicket/draft v1 with no Ready Approval plus canonical GitHub binding reservation; supplied fields validate, missing Ready fields remain shaping state                                                                      | planning owns draft/rationale; activity owns create/membership; sync owns binding/intent/confirmation                         |
| `AssessExecutionReadiness` (pre-receipt guard) | authorized source, exact principal/source authorization plus DevTicket/contract/lane versions; read-only and always runs before execute/claim receipt reservation                                                                                       | none; exact locked snapshot read                                                                                      | incomplete/Backlog returns policy-visible missing-field codes, `deep_grilling_required`, and `no_start`; creates no receipt, claim, lease, assignment, resource, or lane write                                                        | no ledger write; response is a safe read projection                                                                           |
| `ReviseBacklogContract`                        | authorized shaping actor, Backlog, exact DevTicket/current contract/Backlog queue versions                                                                                                                                                              | DevTicket + base version + stable diff hash                                                                           | append immutable Ready Contract Version; remain Backlog with no Ready Approval                                                                                                                                                        | planning owns content/rationale; activity owns accepted command/version ref                                                   |
| `UpdateDevTicketMetadata`                      | metadata authority, exact metadata version; watcher/read/display fields outside managed contract only                                                                                                                                                   | DevTicket + metadata version + patch hash                                                                             | update watcher/read/display metadata only; no comment/worklog or contract mutation                                                                                                                                                    | activity owns metadata fact; optional sync intent only                                                                        |
| `AppendComment` / `CorrectCommentByAppend`     | authorized actor, exact DevTicket/comment stream version, Secret-Safe Ingress pass; correction names an existing visible comment                                                                                                                        | source/delivery + client comment ID + body hash                                                                       | append immutable comment or correction with `correctsRecordId`; suspected secret persists no receipt/body/activity/outbox and invokes safe stop path                                                                                  | activity owns passed comment/correction only; security owns safe rejected/quarantine ref; #231 owns post-pass sync intent     |
| `AppendWorklog` / `CorrectWorklogByAppend`     | authorized actor or signed active Runner source, exact DevTicket/worklog stream and lease/fence where applicable, Secret-Safe Ingress pass                                                                                                              | source/delivery + client worklog ID + body/evidence hash                                                              | append immutable worklog or correction with `correctsRecordId`; suspected secret persists no receipt/body/activity/outbox and invokes safe stop path                                                                                  | activity owns accepted record; Runner ledger stores signed source observation/ref; security owns safe rejection; #231 syncs   |
| `ValidateReady`                                | current Backlog/contract/dependency/policy versions, exact confirmed GitHub Issue Binding/version, current required health/reconciliation versions                                                                                                      | DevTicket + complete input-version set + validator version                                                            | immutable validation artifact; unconfirmed/unhealthy/stale/unreconciled binding fails; no approval/lane change                                                                                                                        | planning owns inputs/result artifact; activity owns accepted-command ref                                                      |
| `ApproveReadyToTodo`                           | Backlog, validator reruns under lock, exact confirmed GitHub Issue Binding and health/reconciliation versions, exact source/target queues, Human Owner/Admin, no Absolute Stop                                                                          | DevTicket + Ready Contract Version hash + Ready Approval nonce                                                        | Ready Approval + deterministic Todo insertion with `reviewReworkPlacement=planned`; Priority grants no extra approval                                                                                                                 | activity owns approval/lane/queues; planning cross-links prior rationale; sync owns mirror intent                             |
| `ApproveReadyAndStart`                         | same as approval plus original verified requester/source, intended claimant, auth policy/version, selected Runner enrollment/capability refs, exact target/gates, and stable claimRequestId                                                             | approval identity + claimRequestId                                                                                    | Ready Approval + Todo + fully bound idempotent ClaimRequested outbox atomically; replay returns both IDs                                                                                                                              | activity owns approval/lane/request; internal outbox owns retry; Runner observations begin only after later admission         |
| `DispatchClaimRequested`                       | active ClaimRequested; rederived current requester/claimant/source authorization; exact auth, Runner enrollment/capability and target/gate refs; stable worker key                                                                                      | claimRequestId + worker attempt                                                                                       | consume and invoke ClaimAndStart only after full reauthorization/revalidation; auth/source/enrollment drift cancels, material target/gate drift supersedes, both without claim/lease/resources                                        | activity owns request and any admitted state; Runner receives bounded orders and may emit signed observations                 |
| `OpenPolicyException`                          | eligible failed policy gate, exact target/contract/policy; never an Absolute Stop                                                                                                                                                                       | target/action + contract/policy hash + request nonce                                                                  | pending version-bound request                                                                                                                                                                                                         | planning owns rationale/evaluation; activity owns opened fact; sync owns notifications                                        |
| `ApprovePolicyException`                       | pending, exact target/hash/nonce, enrolled authorized approver, unexpired/current role                                                                                                                                                                  | exception ID + decision nonce                                                                                         | Approved with one-use authorization token                                                                                                                                                                                             | activity owns authoritative approval; sync owns Slack/UI acknowledgement                                                      |
| `RejectPolicyException`                        | pending and authorized exact decision                                                                                                                                                                                                                   | exception ID + decision nonce                                                                                         | Rejected                                                                                                                                                                                                                              | activity owns authoritative rejection; sync owns acknowledgement                                                              |
| `ExpirePolicyException`                        | pending/approved record past expiry, deterministic clock policy                                                                                                                                                                                         | exception ID + expiry instant                                                                                         | Expired; unused token invalid                                                                                                                                                                                                         | activity owns expiry; sync owns notification                                                                                  |
| `RevokePolicyException`                        | pending/approved plus role/policy/security/human revocation evidence                                                                                                                                                                                    | exception ID + revocation evidence ID                                                                                 | Revoked; unused token invalid                                                                                                                                                                                                         | planning owns revocation rationale input; activity owns revocation                                                            |
| `OpenAbsoluteStop`                             | verified evidence/scope; exact Material Revision Interruption none/current; existing Blocked owner/request or finalized Review/#229 requirement; active lease/process; scoped refs/grants/preview                                                       | stop type + scope + detector epoch + safe evidence hash                                                               | interruption owner→attach/reuse/preserve lane/sole finalizer; otherwise Blocked reuses owner, active claim fences once, finalized Review uses #229; no duplicate request/release                                                      | planning/activity own stop, fence, and release decisions; Runner/#229 supply proof; integration supplies confirmations        |
| `ResolveAbsoluteStop`                          | exact stop/resolver/remediation; shared Blocked containment reconciled by its owner; live execution has exact Runner confirmation; finalized Review has matching accepted #229 proof; all scoped confirmations/health restored                          | Absolute Stop ID/version + remediation evidence hash                                                                  | resolve stop only after every leg; do not close Blocked Episode, rewrite finalized handoff, release shared resources twice, or grant approval/claim/lane                                                                              | planning refs; activity resolution; Runner/#229 process/Docker/tunnel/evidence proof; integration confirmations               |
| `AssignTodo` / `ClearTodoAssignment`           | Todo, no live claim, exact Pre-Start/Start Rejection containment explicit-none/current versions and neither containing, assignment authority, eligible identity                                                                                         | DevTicket/version + assignment decision                                                                               | current Execution Assignee changes only with no active containment; lane unchanged                                                                                                                                                    | activity owns assignment fact                                                                                                 |
| `ClaimAndStart` / `PrepareClaim`               | exact Ready/Approval and live named SecretRef versions; no containing Pre-Start/Start Rejection record; refs are resolvable, Runner-authorized, policy-valid, least-privilege; eligible claimant/assignment and all gates; never secret values          | DevTicket + Ready Contract Version/Ready Approval + claimant/Runner/request ID                                        | every grant set creates a `credential_provisioning` claim/lease/capacity/worktree and completes reserved registration → Enforcer arm → typed activation; zero grants use an empty activation and never shortcut to start              | activity owns claim, assignment, lease, grant, fence, capacity/worktree binding; integration owns provision confirmations     |
| `ConfirmLeaseCredentialAccessProvision`        | verified broker delivery plus exact named-ref/grant/claim/lease/fence/Ready/stop versions                                                                                                                                                               | delivery + grant/version + provision intent                                                                           | activate only current pending grant; the final confirmation only makes the set activation-eligible; only an admitted Runner activation fact arms the deadline, enters `start_pending`, and enqueues start; stale authority revokes    | integration inbox owns broker fact; activity owns grant/claim state; outbox owns activate/revoke intent                       |
| `ConfirmLeaseCredentialAccessDisposition`      | verified revoke delivery plus exact grant/lease/fence/process-or-no-process containment/tunnel versions                                                                                                                                                 | delivery + grant/version + revocation intent                                                                          | mark exact grant revoked; release nothing; owning Pre-Start, Start Rejection, Material Revision, Blocked, or Review finalizer/reconciler requires proof plus all confirmations                                                        | integration inbox owns broker fact; activity owns revocation and gated release; Runner supplies signed containment proof      |
| `FailLeaseCredentialAccessProvision`           | exact `credential_provisioning`; verified permanent provider-denial fact; acquire active Revision/Interruption then shared claim/lease/grant/tunnel/outbox/loss rows in canonical total order                                                           | claim + pre-start purpose + provider failure ID                                                                       | no interruption→Claim Attempt `failed` + lease fenced + Pre-Start loss; interruption owner→claim remains `fenced`, append source/proof; one finalizer                                                                                 | integration owns provider fact; activity owns loss/fence/failure; Runner supplies signed no-process proof                     |
| `CancelLeaseCredentialAccessProvision`         | exact `credential_provisioning`; governed Human Owner/Admin cancellation authority, safe reason, exact principal/source/session authorization versions; acquire common selected-owner rows in canonical total order                                     | claim + pre-start purpose + cancellation nonce                                                                        | no interruption→claim `failed` + lease fenced + Pre-Start loss; interruption owner→claim stays `fenced`, append proof; no provider fiction/second finalizer                                                                           | activity owns cancellation/loss/fence/failure; Runner supplies signed no-process proof; integration owns revocation           |
| `ExpireLeaseCredentialAccessProvision`         | exact `credential_provisioning`, trusted deadline/exhausted retry budget; lock active Revision/Interruption then shared claim/lease/grant/tunnel/outbox/loss rows                                                                                       | claim + pre-start purpose + provisioning deadline/retry epoch                                                         | no interruption→claim `failed` + lease fenced + Pre-Start loss; interruption owner→claim stays `fenced`, append proof; no unnamed lifecycle                                                                                           | activity owns expiry/loss/fence/failure; Runner supplies signed no-process proof; integration owns revocation retries         |
| `WithdrawCredentialProvisioningClaim`          | authenticated original requester through same eligible source; own exact `credential_provisioning` Claim Attempt/request ID/version; no start outbox/marker/process; one-time nonce; lock active Revision/Interruption then common rows                 | claim + requester + claim version + cancellation nonce                                                                | no interruption→claim `failed` + lease fenced + Pre-Start loss; interruption owner→claim stays `fenced`, append proof; no broader authority/second finalizer                                                                          | activity owns withdrawal/loss/fence/failure; Runner supplies signed no-process proof; integration owns revocation             |
| `RetryDeferredClaimAdmission`                  | active wait, retry key, original claimant/source auth, current gates including global Review WIP counter                                                                                                                                                | ClaimAdmissionDeferred ID + monotonic retry key                                                                       | invalid binding cancels; WIP three schedules retry; eligible success consumes wait and creates at most one claim/lease                                                                                                                | activity owns retry/cancel/claim/lease/grant decisions; sync owns retry/notification                                          |
| `CancelDeferredClaimAdmission`                 | active Claim Admission Deferred; Human Owner or authenticated original requester; exact wait version; safe explicit reason                                                                                                                              | ClaimAdmissionDeferred ID + cancellation nonce                                                                        | terminal `explicit_withdrawal`, cancel retry/notification, leave Ready-approved Todo unchanged; no claim/lease/capacity/worktree/lane mutation                                                                                        | activity owns `ClaimAdmissionCancelled` with explicit actor/reason; sync owns notification cancellation                       |
| `RecordExecutionStartedReceipt`                | authenticated transport candidate for exact Claim Attempt; arbitration row lock; minimal envelope has no unsafe free text                                                                                                                               | claim + envelope hash + monotonic ingress identity                                                                    | append minimal IDs/hash/trusted `observed_at`/ingress identity; bounded verifier promotes/rejects; eligibility requires observed by deadline and committed by cutoff; no lane change                                                  | Runner ledger stores signed observation; activity verifier owns accepted/rejected disposition                                 |
| `AcceptExecutionStarted`                       | verified inbox receipt, current unfenced start-pending claim/lease, exact current contract and any Execution Binding Carry-Forward, worker-loaded Todo/In Progress queues/anchor                                                                        | verified inbox receipt ID + start-transition purpose                                                                  | lease/claim Started + atomic Todo-to-In Progress; queue-only conflict retries same identity; carry-forward requires original binding plus current head/equivalence                                                                    | Runner ledger links signed receipt; activity owns claim/lease/lane/queue transition; sync owns status intent                  |
| `RejectExecutionStart`                         | authenticated signed no-process rejection, exact `start_pending` attempt; lock active Revision/Interruption, claim arbitration, Start Rejection containment, grants/tunnel/outbox                                                                       | claim + start nonce + rejection receipt                                                                               | no interruption→claim `failed` + lease fenced + Start Rejection containment; interruption owner→claim stays `fenced`, append proof; never release directly                                                                            | Runner supplies signed rejection/no-process observation; activity owns rejection, containment, fence, and failure             |
| `FinalizeStartRejectionContainment`            | exact containing record, no active Material Revision Interruption for claim, deterministic signed no-process proof, all grant/tunnel confirmations, held assignment/resources                                                                           | StartRejectionContainment ID + proof/confirmation-set hash                                                            | claim remains terminal `failed`; release resources, clear only claim-created assignment, finalize, remain Ready-approved Todo                                                                                                         | Runner supplies final proof; activity owns release/final state/assignment; integration supplies confirmations                 |
| `RecordExecutionStartDeadlineElapsed`          | trusted clock reaches exact Claim Attempt deadline; arbitration row lock                                                                                                                                                                                | claim + deadline epoch                                                                                                | record deadline elapsed plus deterministic bounded arbitration cutoff only; no loss/lane/lease mutation                                                                                                                               | activity owns deadline/cutoff fact; Runner ledger remains observation-only                                                    |
| `ExpireExecutionStart`                         | cutoff reached; same arbitration/lease/inbox locks; eligible markers are `observed_at <= deadline` and committed by cutoff                                                                                                                              | claim/lease + deadline/cutoff epoch                                                                                   | order markers by trusted observed time/sequence and finish bounded verification; valid winner requeues start transition, otherwise invoke loss/tunnel containment; late markers cannot reverse                                        | activity owns arbitration/expiry/containment; Runner supplies signed observations                                             |
| `DetectExecutionLoss`                          | detector evidence, active Revision/Interruption, exact claim/lease/grants/tunnel/outbox and Pre-Start/Start Rejection state; Review locks active Review Handoff + WIP                                                                                   | lease/claim + detector epoch + normalized cause                                                                       | interruption owner→append proof, claim stays `fenced`; rejection owner links only; explicit-none provisioning→`failed`/Pre-Start, post-enqueue→`fenced`/Blocked                                                                       | Runner supplies signed loss observation/proof; activity owns loss selection, fence, Todo failure or Blocked/WIP               |
| `FinalizePreStartAdmissionLoss`                | containing Pre-Start loss, exact Todo/claim/lease/resources, explicit no Material Revision Interruption for claim, authenticated no-start/no-process proof, all grant/tunnel confirmations                                                              | PreStartAdmissionLoss ID + confirmation-set/proof hash                                                                | claim remains terminal `failed`; release resources, clear only claim-created assignment, finalize, leave Todo history; no Blocked/second finalizer                                                                                    | Runner supplies proof; activity owns release/final state/assignment; integration supplies confirmations                       |
| `BlockExecution`                               | In Progress, authority/category/reason/checkpoint, exact Material Revision Interruption none/current, queues/lease/fence/process/worktree/grants, no Review Handoff; lock existing request                                                              | DevTicket + lease/fence + block request ID                                                                            | interruption owner→append cause + emit/replay `MaterialRevisionBlockCauseAppended`; preserve lane/claim/finalizer, no `BlockedOpened`/Episode/request; explicit-none→claim `fenced`, In Progress→Blocked + one request                | activity/interruption owns containment/fence/lane; Runner supplies signed checkpoint/process observations                     |
| `ReconcileRunnerContainment`                   | authenticated Runner confirmation for exact request nonce/lease/fences/process/worktree/action, accepted checkpoint-or-unknown and stopped/quarantined disposition, reconciled GitHub state, and confirmed credential/tunnel revocation where affected  | RunnerContainmentRequest ID + authenticated confirmation ID/hash                                                      | consume confirmation once, emit confirmed/rejected disposition, and release held capacity/fresh-claim gate only when every containment leg is confirmed                                                                               | Runner supplies signed confirmation; activity owns disposition/release; integration owns delivery/access/tunnel confirmations |
| `ResolveOrSupersedeBlock`                      | exact Blocked Episode/Ready/queues, safe containment including confirmed lease credential and preview-tunnel revocation, no pending interruption; resolved needs proof, superseded needs authority/reason                                               | Blocked Episode + disposition + decision nonce                                                                        | condition-aware safe closure clears current ref: resolved returns Todo; superseded preserves unresolved refs and chooses Todo or invalidated Backlog; no fresh claim/capacity until every required confirmation                       | activity owns disposition/lane/release; planning rationale; Runner/integration supply containment/grant confirmation          |
| `ProposeRevision`                              | governed target exists; diff/reason/actor/current version                                                                                                                                                                                               | target + base version + proposed diff hash                                                                            | `AwaitingDecision`                                                                                                                                                                                                                    | planning owns diff plus decision-rationale artifact; activity owns accepted-command ref                                       |
| `ApplyNonSemanticCorrection`                   | authorized non-semantic Revision, exact contract/Ready/execution and Pre-Start/Start Rejection explicit-none/current versions; reject either containing; existing Review/Sprint rules                                                                   | Revision ID + classification/equivalence hash + binding lineage                                                       | no containment→append contract/Ready/carry-forwards; prepared handoff rebinds; containing loss rejects with no mutation                                                                                                               | planning/activity own correction/carry-forward; Runner supplies signed equivalence observation; Sprint coordinates binding    |
| `AcceptRevision`                               | authorized material Revision; exact Pre-Start/Start Rejection explicit-none/current versions; containing rejects/defer; otherwise records/queues/Sprint/authority and Review handoff/WIP/proof locks                                                    | Revision ID + decision nonce + optional Sprint grant                                                                  | no containing record→idle apply or one Material Revision Interruption; containing record→retain AwaitingDecision/zero writes; live/finalized Review exact branches                                                                    | planning/activity own Revision/Review/containment/counter; Sprint coordinates; Runner/integration supply proof/facts          |
| `RejectRevision`                               | authorized current `AwaitingDecision` Revision and exact version                                                                                                                                                                                        | Revision ID + decision nonce                                                                                          | `Rejected`; no contract/approval/lane mutation                                                                                                                                                                                        | planning owns decision-rationale artifact; activity owns rejection                                                            |
| `FinalizeMaterialRevisionInterruption`         | pending sole-owner interruption, including embedded provision-loss/start-rejection refs/proof; authenticated no-process or stopped/quarantined proof/all confirmations; exact Review proof; locks queues/WIP                                            | interruption + source-branch/proof + terminal nonce/reconciliation hash                                               | affected claim remains terminal `fenced`; release once and apply/move Backlog; legal Review exit/decrement atomic; no second finalizer/missing-proof exit                                                                             | planning content; activity owns containment/release/lane/counter; Runner/#229/integration supply proof/facts                  |
| `AbortMaterialRevisionInterruption`            | authority/reason/disposition/anchor, exact rows, authenticated no-process or stopped/quarantined proof, every confirmation; finalized Review also requires exact #229 proof                                                                             | interruption ID + abort nonce + disposition + target anchor + reconciliation hash                                     | affected claim remains `fenced`; restore valid Todo or invalidate Backlog via fresh-claim semantics; Review exit decrements once; active stop remains; safe release; finalized handoff unchanged                                      | planning/activity own abort/release/lane/WIP; Runner/#229/integration supply terminal proof/facts                             |
| `AddDependency`                                | duplicate active add short-circuits; real add locks containment, graph/contract/queues/Sprint/Review/Blocked rows and validates endpoints/cycle                                                                                                         | dependent + blocker + graph version + add decision + optional Sprint grant                                            | duplicate returns receipt/existing edge with zero domain writes; real add follows coordinated material Revision rules                                                                                                                 | planning/activity edge/lane; Sprint state; sync intent                                                                        |
| `RemoveDependency`                             | exact edge ID/version/endpoints; active removal locks same mutation set; absent/retired/stale identities classified before mutation                                                                                                                     | exact edge ID + version + remove decision + optional Sprint grant                                                     | first removal emits once; same key replays; new key on retired writes receipt-only `already_removed`; absent/mismatch writes terminal conflict receipt; no duplicate event/partial writes                                             | planning/activity original edge/Revision; receipt owns no-op/conflict; sync only on first removal                             |
| `ReorderTodo`                                  | exact queue/anchor/ticket and Pre-Start/Start Rejection versions, Todo, neither containing, queue authority, same derived band                                                                                                                          | lane queue version + ticket + before/after/empty-band anchor                                                          | update rank only with no active containment; cannot set/cross tier or edit classification/Priority                                                                                                                                    | activity emits `TodoReordered`                                                                                                |
| `SubmitForReview`                              | accepted exact final checkpoint/receipt, submission authority, In Progress/Review queues, Review Handoff absent, exact locked WIP counter                                                                                                               | validated submission intent + exact checkpoint/candidate hash                                                         | WIP=3 persists/returns one retry job plus idempotent Slack intent with no DevTicket/lane/lease/Review-membership mutation; WIP<3 freezes/fences/revokes, creates prepared handoff, moves Review, increments WIP, enqueues containment | activity owns Review Handoff/lane/WIP/retry/containment; Runner supplies observations; integration owns delivery intents      |
| `RetrySubmitForReview`                         | active job with original requester/principal/source and exact authorization refs; under-lock reauthorization, original validated submission/checkpoint, active In Progress authority, current WIP/queue/evidence versions                               | ReviewAdmissionRetry ID + monotonic attempt sequence                                                                  | auth revocation/drift cancels job+Slack intent; queue conflict advances sequence; still-full retains one job; slot consumes; candidate drift cancels                                                                                  | activity owns auth-checked job/attempt/submit; integration owns one job-keyed Slack intent                                    |
| `FinalizeSubmitForReview`                      | prepared Review Handoff in Review, exact rebound candidate/current-head/lineage binding, exact WIP/queues, containment proof and all confirmations                                                                                                      | ReviewHandoff ID + candidate/binding hash + confirmation-set hash                                                     | prepared→finalized, release implementation resources, emit ReviewRequested; lane/WIP unchanged; stale binding rejects without ReviewRequested                                                                                         | integration inbox and Runner proof are inputs; activity owns release, Review Handoff, and event                               |
| `CancelReviewHandoff`                          | exact authorized actor+nonce; canonical Review Handoff/Review queues/WIP/lease locks                                                                                                                                                                    | ReviewHandoff ID + cancellation nonce                                                                                 | prepared→cancelling; emit cancellation-requested once; keep Review/WIP/resources, enqueue/reuse containment                                                                                                                           | activity owns state/event/containment intents; Runner/integration receive bounded requests                                    |
| `ExpireReviewHandoff`                          | trusted clock at exact expiry; same canonical locks; handoff exactly prepared                                                                                                                                                                           | ReviewHandoff ID + exact expiry instant                                                                               | prepared→cancelling; emit Expired + CancellationRequested once; replay/terminal returns recorded disposition; keep Review/WIP/resources, reuse containment                                                                            | activity owns expiry/cancellation/containment intents; Runner/integration receive bounded requests                            |
| `FinalizeCancelReviewHandoff`                  | Review Handoff is still exactly cancelling (not superseded/failed), exact queues/WIP, containment proof and all confirmations                                                                                                                           | ReviewHandoff ID + confirmation-set hash                                                                              | Review→Todo, decrement WIP once, release, clear only claim-created assignment, preserve preassignment, mark cancelled; a terminal Revision/loss winner returns its recorded disposition with zero writes                              | Runner/integration supply proof; activity owns release/lane/WIP/final state                                                   |
| `ReviewChangesRequested`                       | valid result; exact #229 Review Exit Containment Proof for run/result/candidate and Reviewer/Docker/test-grant/tunnel/writers; contract/evidence, Revision/interruption, handoff, queues/WIP, placement/anchor                                          | Review/verdict + exit-proof + contract/evidence + Revision/interruption + queue versions                              | consume proof and decrement WIP + Todo atomically; emit version-bound verdict; missing/stale proof rejects; later AwaitingDecision Revision re-evaluates Todo                                                                         | #229 Runner fact consumed; activity verdict/lane/queues/WIP; sync summary                                                     |
| `AdmitDone`                                    | exact #229 Review Exit Containment Proof; Review/Ready Approval and verified merge correlated to the proof-bound governed merge outbox; no external-merge conflict; contract/evidence, Revision/interruption explicit-none/current, handoff, queues/WIP | Review decision + exit-proof + governed merge authorization/fact + contract/evidence + Revision/interruption versions | consume proof and decrement WIP + Done atomically; early/external merge rejects until Post-Merge Review reconciliation; event binds exact slot/no pending application                                                                 | #229 Runner fact consumed; activity Done/queues/WIP; sync owns merge correlation/conflict                                     |
| `ArchiveDevTicket`                             | safe archive conditions; exact assignment and Pre-Start/Start Rejection versions; no containing record, live Review Handoff, claim/lease, Blocked Episode, nonterminal Sprint membership, or unreconciled authority                                     | DevTicket/version + Ready Approval/assignment/archive reason/Sprint version                                           | clear active Ready and current assignee/preassignment while preserving histories; archive/remove queue; Review remains separately gated                                                                                               | planning owns reason; activity owns archive/assignment/queue; Runner/integration supply reconciliation facts                  |
| `RestoreDevTicket`                             | archived record with no current Blocked Episode/containment ref, authority, safe disposition, exact archive/target queue versions                                                                                                                       | DevTicket + archive version                                                                                           | non-Done→Backlog with no assignee/preassignment/claim/lease/active Ready and fresh Ready required; reconciled Done only to Done history                                                                                               | activity owns restore/lane/queue classification                                                                               |
| `ImportLegacyDevTicket`                        | migration epoch/source/hash/tenant/exact target versions; active-lane target requires explicitly confirmed Human Owner plus every current target gate; legacy assignee is never owner proof                                                             | source table/record + cutover epoch                                                                                   | eligible source imports to exact target; legacy Todo may enter Backlog only after owner/gates and never Todo; otherwise quarantine or Historical Projection candidate; no fabricated Ready/lease/history                              | activity emits `LegacyDevTicketImported`; other ledgers own only source facts                                                 |
| `ReconcileHistoricalCompletion`                | imported historical record plus exact preserved Review/merge evidence and migration authority                                                                                                                                                           | legacy record + evidence-set hash + reconciliation epoch                                                              | current-gate eligibility only when proven; otherwise remains legacy historical                                                                                                                                                        | activity emits `HistoricalCompletionReconciled`; sync owns verified GitHub facts                                              |

## Sad paths and observable behavioral contracts

| Sad path                                                                                                                          | Required behavior                                                                                                                                                                                                                                                                                                                | Observable evidence                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Same key/payload/principal/source/target inside one authorized namespace                                                          | return original result; no second event/outbox/lease                                                                                                                                                                                                                                                                             | one namespaced command receipt and one effect set                                                                |
| Same raw key in a different authorized organization/workspace/command namespace                                                   | create/replay only that namespace's independent receipt                                                                                                                                                                                                                                                                          | no lookup, conflict, or disclosure across namespaces                                                             |
| Same key inside one namespace with different payload, principal, source, or target                                                | `409 idempotency_conflict` or 403 without revealing another actor's result                                                                                                                                                                                                                                                       | original receipt unchanged; no new domain fact                                                                   |
| Unauthorized caller guesses an existing idempotency key                                                                           | 403 before receipt reservation/replay; reveal no prior result                                                                                                                                                                                                                                                                    | no receipt claimed and no cross-actor result disclosed                                                           |
| Unauthorized caller sends suspected-secret-looking content                                                                        | 403 after non-persisting tenant/target/family check and before Secret-Safe Ingress                                                                                                                                                                                                                                               | no scan result, Absolute Stop, notification, receipt, or raw-content persistence                                 |
| Any touched record is absent from or mismatches the expected-version set                                                          | reject the whole command with a concurrency conflict                                                                                                                                                                                                                                                                             | zero aggregate/ledger/outbox partial writes                                                                      |
| Ready validation/approval sees unconfirmed, stale, unhealthy, or unreconciled GitHub binding                                      | fail validation/approval under the exact binding and health/reconciliation locks                                                                                                                                                                                                                                                 | no Ready Approval, Todo admission, or approval/start request                                                     |
| Caller asserts another actor/source                                                                                               | ignore payload assertion and use verified principal, or 403                                                                                                                                                                                                                                                                      | audit records verified principal and denial reason                                                               |
| Missing/mismatched tenant context                                                                                                 | hard 403, never empty success                                                                                                                                                                                                                                                                                                    | RLS/authorization denial; zero cross-tenant rows                                                                 |
| Caller-authored source/target lane membership, queue, or anchor version races                                                     | reject whole lane command; reload and submit a new key                                                                                                                                                                                                                                                                           | zero partial lane/aggregate/ledger/outbox writes; stable committed order                                         |
| ReorderTodo targets another tier/band or tries to set `reviewReworkPlacement`                                                     | reject; placement is server-derived and Review changes-requested alone selects a rework tier                                                                                                                                                                                                                                     | blocking_top→planned→ordinary_bottom→criticality→Priority→rank→UUID unchanged                                    |
| Accepted Priority change targets a Todo Card                                                                                      | run material Revision/Ready invalidation, then insert only after fresh Ready into deterministic new Todo Ordering Band                                                                                                                                                                                                           | no direct cross-Todo-Ordering-Band reorder or implicit preemption                                                |
| ApproveReadyAndStart worker crashes or replays                                                                                    | retain Ready Approval + Todo + one ClaimRequested intent; worker retries stable ClaimAndStart key                                                                                                                                                                                                                                | same approval/claimRequest IDs; no duplicate claim; visible Start Requested                                      |
| ClaimRequested worker sees requester/claimant/source authorization, policy version, or Runner enrollment/capability drift         | rederive current authority; cancel the intent without substituting worker identity or another claimant                                                                                                                                                                                                                           | `ClaimRequestCancelled`; no claim, lease, assignment, capacity, or worktree                                      |
| ClaimRequested worker sees contract/Ready/dependency/assignment/Sprint/health target drift                                        | supersede the exact intent and require a fresh governed request under current gates                                                                                                                                                                                                                                              | `ClaimRequestSuperseded`; no confused-deputy start or partial reservation                                        |
| Review WIP is three when a new implementation claim arrives                                                                       | terminally defer original key, retain Ready Todo, create one ClaimAdmissionDeferred/retry/Slack intent, leave leases untouched                                                                                                                                                                                                   | no claim/lease/capacity; original replay returns same deferred result                                            |
| Pre-lease claimant session is unenrolled/incapable or conflicts with the Todo preassignment                                       | reject under current claimant/source/capability and assignment policy                                                                                                                                                                                                                                                            | no Execution Assignee, claim, lease, capacity, worktree, or lane mutation                                        |
| Credential provisioning has a transient retryable failure                                                                         | keep grant pending, hold start delivery/capacity, retry under bounded deadline/budget                                                                                                                                                                                                                                            | no LeaseStarted/In Progress; retry facts and deadline visible                                                    |
| Final required provision confirmation succeeds                                                                                    | atomically activate the last broker grant and make the complete set eligible for the typed Runner activation order; do not arm a deadline or enqueue start                                                                                                                                                                       | no deadline during provisioning; start remains impossible until the admitted activation fact                     |
| Final provision confirmation races trusted-clock provisioning expiry                                                              | canonical selected-owner locks choose: confirmation-first only makes the complete grant set activation-eligible while remaining `credential_provisioning`; expiry-first appends to an owning Material Revision Interruption or explicit-none opens/reuses Pre-Start Admission Loss and makes confirmation stale/revocation-bound | exactly one lifecycle/finalizer; confirmation never bypasses the typed Runner activation fact                    |
| DetectExecutionLoss sees `credential_provisioning`                                                                                | lock Revision/Interruption first: interruption-first appends detector/no-start proof to its owner; explicit-none creates/reuses Pre-Start Admission Loss and retains resources                                                                                                                                                   | one owner ID; either `MaterialRevisionProvisioningLossObserved` or `PreStartAdmissionLossOpened`, never both     |
| Pre-Start Admission Loss receives every grant/tunnel confirmation                                                                 | Finalize exact no-start/no-process containment, release capacity/worktree, clear only claim-created assignment, preserve Todo                                                                                                                                                                                                    | one `PreStartAdmissionLossFinalized`; fresh governed claim may proceed                                           |
| Assignment/claim/reorder/archive/non-semantic/material/dependency command sees containing Pre-Start or Start Rejection record     | lock exact containment and reject before assignment, contract, queue, lane, archive, or resource mutation                                                                                                                                                                                                                        | held assignment/resources and Ready/Todo state unchanged; only owning finalizer may release                      |
| Material Revision acceptance races Pre-Start Admission Loss during credential provisioning                                        | canonical Revision/Interruption then claim/loss locks select one owner: loss-first defers Revision in AwaitingDecision; Revision-first embeds later source/no-start proof in its interruption                                                                                                                                    | either one Pre-Start finalizer or one Material Revision finalizer; never both, and never Todo/Backlog divergence |
| Non-semantic correction sees containing Pre-Start or Start Rejection record                                                       | reject/defer and require reclassification against current versions after named Finalize                                                                                                                                                                                                                                          | no carry-forward, contract head, approval, assignment, or containment mutation                                   |
| Outside-contract metadata/comment/worklog appends during no-process containment                                                   | allow only Secret-Safe append/display/read changes that touch no governed authority or held resource                                                                                                                                                                                                                             | containment/lane/assignment/contract versions unchanged                                                          |
| Admitted Runner activation/start enqueue races provisioning-loss arbitration                                                      | same Revision/interruption/claim/grant/outbox locks choose one branch: fact-admission-first becomes `start_pending`; loss-first makes activation stale/revocation-bound and is owned by either Material Revision Interruption or Pre-Start Admission Loss                                                                        | exactly one selected owner; no start plus pre-start containment or duplicate finalizer                           |
| Provision confirmation arrives after fence/stop or named-ref revocation                                                           | record stale and atomically create/reuse `revocation_pending` plus revocation outbox; never activate                                                                                                                                                                                                                             | no start/access resurrection; one stable revoke intent                                                           |
| Permanent denial, trusted-clock expiry, authorized pre-start cancellation, or provisioning loss race                              | stable source identities append to an owning Material Revision Interruption, or explicit-none creates/reuses one Pre-Start Admission Loss whose first cause initiates and later causes append refs                                                                                                                               | one selected owner; Todo/no Blocked; no unnamed lifecycle or duplicate release                                   |
| Authenticated original requester withdraws its own exact `credential_provisioning` claim before start enqueue                     | `WithdrawCredentialProvisioningClaim` rechecks exact requester/request ID/claim version and consumes one cancellation nonce, then appends to an owning interruption or explicit-none opens/reuses Pre-Start Admission Loss                                                                                                       | bounded self-withdrawal only; Todo/no Blocked; no general lease authority or second finalizer                    |
| Self-withdrawal uses a different requester, stale claim/version, replayed nonce under another principal, or loses to activation   | reject before fence/revocation/loss mutation; Human Owner/Admin may use only their separately governed cancellation path                                                                                                                                                                                                         | existing claim/start winner and authority remain unchanged; no cross-request cancellation                        |
| Fail/Expire/Withdraw/Detect pre-start command replays                                                                             | return the same loss/source disposition by independent stable cause key and shared claim-purpose record                                                                                                                                                                                                                          | one Pre-Start Admission Loss, source fact per real cause, no duplicate outbox/finalizer                          |
| Provider stays silent through deadline/retry exhaustion                                                                           | `ExpireLeaseCredentialAccessProvision` opens/reuses Pre-Start Admission Loss; only shared Finalize releases after proof/confirmations                                                                                                                                                                                            | no indefinite hold and no direct expiry release                                                                  |
| Signed start rejection proves no process and no Material Revision Interruption exists                                             | open/reuse Start Rejection Containment, fence/revoke, retain capacity/worktree and claim-created assignment until every confirmation and named Finalize                                                                                                                                                                          | `StartRejectionContainmentOpened`; no Blocked, direct release, or fresh claim                                    |
| Start Rejection Containment receives every required confirmation                                                                  | `FinalizeStartRejectionContainment` alone releases resources, clears only claim-created assignment, finalizes, and leaves Ready-approved Todo                                                                                                                                                                                    | one `StartRejectionContainmentFinalized`; immutable failed-request history                                       |
| Signed start rejection races start acceptance, execution loss, or material Revision                                               | common locks select exactly one owner: accepted start→In Progress, loss→Blocked, rejection→Start Rejection Containment, Revision-first→proof appended to Material Revision Interruption                                                                                                                                          | one lane/containment owner and one release finalizer; late facts are evidence only                               |
| Broker revoke confirmation arrives without process/no-process proof or other grant/tunnel confirmation                            | record exact grant revoked but retain containment/capacity                                                                                                                                                                                                                                                                       | no fresh claim/worktree reuse until every containment leg reconciles                                             |
| Two deferred-claim retry workers race                                                                                             | wait-row lock, monotonic retry key, and unique live-claim constraints allow at most one grant                                                                                                                                                                                                                                    | one consumed wait and at most one Claim Attempt/Execution Lease                                                  |
| Deferred-claim wait sees material Ready/contract, assignment, lane, or Sprint change                                              | cancel/supersede stale wait and notification before admission                                                                                                                                                                                                                                                                    | `ClaimAdmissionCancelled` or `ClaimAdmissionSuperseded`; no lease                                                |
| Deferred-claim retry sees role revocation, enrollment loss, source-policy change, or authorization-version mismatch               | rederive the original claimant/source under lock and atomically cancel or supersede the wait and notification                                                                                                                                                                                                                    | no claim, lease, capacity, worktree, or worker-authority substitution                                            |
| Deferred-claim retry sees WIP or another current gate fail                                                                        | revalidate all gates; schedule next monotonic retry only when still eligible to wait                                                                                                                                                                                                                                             | no replay of original key and no partial reservation                                                             |
| Human Owner/requester cancels an active deferred claim                                                                            | terminally withdraw wait/notification and leave Ready Todo unchanged                                                                                                                                                                                                                                                             | explicit actor/reason in `ClaimAdmissionCancelled`; no claim/lease/lane mutation                                 |
| Explicit cancellation races a successful deferred retry                                                                           | wait-row lock selects one winner; cancellation after consumption cannot revoke the new claim                                                                                                                                                                                                                                     | either terminal cancelled wait or one claim/lease, never both                                                    |
| SubmitForReview sees WIP three                                                                                                    | leave In Progress active/mutable and retain one durable exact retry for the validated intent/candidate                                                                                                                                                                                                                           | no Review move, Review Handoff, fence, or fourth member                                                          |
| SubmitForReview admits with one slot                                                                                              | atomically freeze/fence/revoke, create prepared Review Handoff, move Review/increment WIP, enqueue containment                                                                                                                                                                                                                   | Review / Preparing Review; no implementation release, reviewer launch, or network call                           |
| Prepared Review Handoff finalizes after verified confirmations                                                                    | after no-process or stopped/quarantined proof plus every credential/tunnel confirmation, release implementation containment, mark finalized, emit ReviewRequested                                                                                                                                                                | lane/WIP unchanged; #229 may now provision fresh reviewer authority                                              |
| Prepared Review Handoff cancel/expiry starts                                                                                      | prepared→cancelling, keep Review/WIP/resources, enqueue/reuse containment                                                                                                                                                                                                                                                        | no unsafe Review→Todo or early WIP decrement                                                                     |
| Exact prepared Review Handoff expiry fires or replays                                                                             | first trusted expiry emits `ReviewHandoffExpired` plus `ReviewHandoffCancellationRequested` and reuses containment; replay/terminal state returns recorded disposition                                                                                                                                                           | one event pair/outbox set; no duplicate cancellation or WIP change                                               |
| Cancelling Review Handoff receives every proof                                                                                    | Review→Todo, decrement WIP once, release, mark cancelled                                                                                                                                                                                                                                                                         | no reusable old lease, false Blocked, or double decrement                                                        |
| Valid non-semantic correction races a prepared Review Handoff                                                                     | lock Review Handoff/head/lineage, append carry-forward, atomically rebind candidate authority, emit `ReviewHandoffCandidateRebound`                                                                                                                                                                                              | unchanged checkpoint/SHA; Finalize accepts only new exact binding                                                |
| Non-semantic correction targets a cancelling Review Handoff or stale lineage                                                      | reject with no correction, carry-forward, or Review Handoff mutation                                                                                                                                                                                                                                                             | no stale `ReviewRequested`; caller finishes cancellation or uses material path                                   |
| Material Revision races a prepared/cancelling Review Handoff                                                                      | mark Review Handoff superseded with exact Revision/interruption ref, reuse containment, finalize Review→Backlog, decrement WIP once                                                                                                                                                                                              | `ReviewHandoffSuperseded`; no orphan or duplicate containment                                                    |
| BlockExecution sees an existing Material Revision Interruption                                                                    | append cause/checkpoint, emit one `MaterialRevisionBlockCauseAppended`, preserve lane/Review WIP/claim                                                                                                                                                                                                                           | replay returns same event ref; no `BlockedOpened`, Episode, Runner request, second reconciler/release owner      |
| Execution loss races a prepared/cancelling Review Handoff                                                                         | mark Review Handoff failed with exact Blocked Episode/detector ref, reuse containment, move Review→Blocked, decrement WIP once                                                                                                                                                                                                   | `ReviewHandoffFailed`; replay returns same terminal disposition                                                  |
| Cancellation Finalize races a Revision/loss terminal Review Handoff transition                                                    | same Review Handoff lock/version selects one winner; superseded/failed makes cancellation Finalize ineligible                                                                                                                                                                                                                    | loser returns recorded terminal disposition; zero second lane/WIP/release writes                                 |
| Material Revision occurs after Review Handoff finalization                                                                        | preserve finalized history, create exact #229 containment requirement, retain Review/WIP until authenticated Review Containment Proof finalizes Review→Backlog                                                                                                                                                                   | no stranded interruption, handoff rewrite, early exit, or duplicate release                                      |
| Finalized-Review material Revision lacks exact Review Containment Proof                                                           | retain `AcceptedPendingApplication`, Review membership, WIP, and all stale-review containment requirements                                                                                                                                                                                                                       | no Review→Backlog, WIP decrement, Revision apply, or inferred containment                                        |
| ReviewChangesRequested or AdmitDone sees `AcceptedPendingApplication`/live interruption                                           | reject under exact Revision/interruption/contract/evidence/handoff/WIP locks and retain Review containment                                                                                                                                                                                                                       | no verdict/Done event, lane exit, WIP decrement, or stale evidence decision                                      |
| ReviewChangesRequested or AdmitDone lacks exact #229 Review Exit Containment Proof                                                | retain Review membership/WIP and reject; require proof for the exact run/result/candidate and every Reviewer/Docker/test-grant/tunnel/artifact-writer leg                                                                                                                                                                        | no Review exit, WIP decrement, verdict/Done event, inferred containment, or reuse of material/stop proof         |
| Provider merge is observed before exact Review Exit Containment Proof acceptance or outside #229's governed merge outbox          | open an external-merge Sync Conflict, retain Review/WIP, contain remaining review authority, and require fresh Post-Merge Review reconciliation                                                                                                                                                                                  | provider fact preserved without authorization; no ordinary `AdmitDone` or proof bypass                           |
| Review verdict transition wins before material Revision acceptance                                                                | commit exact version-bound Review→Todo or Review→Done and decrement WIP; later Revision reloads the resulting lane                                                                                                                                                                                                               | Todo follows ordinary material Revision rules; Done requires follow-up/exceptional correction policy             |
| Archive sees any Review member or a live Review Handoff                                                                           | reject until a separate governed Review exit finishes and decrements WIP                                                                                                                                                                                                                                                         | no archive overlay, orphan Review Handoff, or WIP leak                                                           |
| Archive safe Todo with a current preassignment, then restore                                                                      | archive atomically clears current assignee/preassignment and active Ready while retaining immutable histories; restore enters Backlog with no assignee/claim/lease/approval                                                                                                                                                      | fresh Ready validation/approval and fresh governed claim required before execution                               |
| Deferred Review retry sees WIP still full                                                                                         | keep implementation fully active and reuse exact retry identity                                                                                                                                                                                                                                                                  | no intermediate state or duplicate intent                                                                        |
| Review Admission Retry sees requester/source role, session, enrollment, key, or capability revocation                             | under-lock reauthorization cancels the job and its idempotent Slack intent before claiming an attempt                                                                                                                                                                                                                            | no worker-authority substitution, Review admission, fence, or lane/WIP mutation                                  |
| Deferred Review retry races queue churn                                                                                           | terminally record that monotonic attempt, reload versions, and schedule the next attempt key; never reuse a canonical-hash key across queue versions                                                                                                                                                                             | one stable retry job/Slack intent and eventual atomic admission; no idempotency conflict loop                    |
| Deferred Review retry sees candidate checkpoint/SHA/lineage mismatch                                                              | cancel exact-candidate intent; require fresh explicit SubmitForReview                                                                                                                                                                                                                                                            | one `ReviewAdmissionRetryCancelled`; no Review move or different-work submission                                 |
| Review exit races another admission or new claim                                                                                  | same global WIP counter serializes membership changes and claim check                                                                                                                                                                                                                                                            | counter equals exact Review membership; never exceeds three                                                      |
| Ordinary claimant targets a nonterminal Sprint member                                                                             | reject ordinary path; require exact Sprint-controller admission                                                                                                                                                                                                                                                                  | no claim/lease and no Plan/member mutation                                                                       |
| Sprint controller names stale Plan/reservation, non-next member, or second admitted item                                          | reject under exact versions/single-item invariant                                                                                                                                                                                                                                                                                | current Plan/member/reservation and existing Sprint lease unchanged                                              |
| Requested start later fails admission or signed start rejection                                                                   | leave Ready-approved Card visibly Todo with failed request reason                                                                                                                                                                                                                                                                | no rollback and no false In Progress                                                                             |
| Execute/claim is requested for Backlog or an incomplete Ready Contract                                                            | before receipt reservation, read exact contract and authorization versions and return policy-visible missing-field codes plus `deep_grilling_required`/`no_start`                                                                                                                                                                | no command receipt, Claim Attempt, lease, assignment, resource reservation, or lane write                        |
| Two claimants race                                                                                                                | exactly one Claim Attempt/lease/capacity reservation wins; every grant set enters `credential_provisioning` until its reserved registration, Enforcer arm, and typed activation fact are admitted                                                                                                                                | loser gets deterministic conflict; winner follows the same sequence even for an empty grant set                  |
| Runner never acknowledges start                                                                                                   | execution-loss command fences and opens Blocked; retain containment capacity until stopped/quarantined proof                                                                                                                                                                                                                     | no In Progress; one Blocked Episode and unresolved containment                                                   |
| Verified start receipt arrives during unrelated Todo/In Progress queue reorder                                                    | persist/dedupe it first; internal worker reloads queues/anchor and retries the same transition identity                                                                                                                                                                                                                          | one inbox fact; Starting/contained until one Todo-to-In Progress commit                                          |
| Start deadline fires                                                                                                              | record elapsed plus bounded cutoff only; do not decide loss                                                                                                                                                                                                                                                                      | `ExecutionStartDeadlineElapsed`; Starting/containment unchanged                                                  |
| Marker has trusted `observed_at <= deadline`, commits by cutoff, and verifies valid                                               | order by observed time/monotonic identity and let first valid marker win                                                                                                                                                                                                                                                         | verified receipt can win after deadline processing without socket-arrival fiction                                |
| Marker is invalid/unverified at bound or commits after cutoff                                                                     | safely reject/retain as late evidence; finalized loss cannot reverse                                                                                                                                                                                                                                                             | deterministic cutoff disposition and no indefinite timeout suppression                                           |
| Bounded arbitration verifies a winning pre-deadline marker but its transition is pending                                          | count acknowledgment, retain Starting/containment, and requeue the same transition identity; do not invoke loss                                                                                                                                                                                                                  | no StartExpired/loss/Blocked; later disconnect is separate                                                       |
| Verified start receipt loses a race to fence/execution loss                                                                       | retain the inbox fact but reject it for workflow authority; preserve containment                                                                                                                                                                                                                                                 | rejected/stale Runner evidence; no false In Progress or capacity release                                         |
| Stale/replayed Runner receipt                                                                                                     | dedupe a verified owner fact, then reject transition by lease/fence/nonce/sequence/version                                                                                                                                                                                                                                       | one inbox fact plus rejected receipt disposition; lane unchanged                                                 |
| Disconnect/expiry/revocation races provisioning/start/manual block                                                                | canonical locks append provisioning evidence to an owning Material Revision Interruption or explicit-none select Pre-Start Admission Loss; after enqueue, selected interruption/rejection/Blocked ownership wins                                                                                                                 | one selected lifecycle/finalizer, linked evidence, deterministic already-applied result                          |
| Post-enqueue execution loss affects lease-scoped credential-access or an active preview tunnel                                    | atomically revoke both applicable local authorities, fence/move Blocked, retain capacity, and enqueue external revoke/close                                                                                                                                                                                                      | no late access/use; fresh claim waits for every required confirmation                                            |
| Any non-Review lease fence/release path sees an applicable access or tunnel grant                                                 | revoke every lease credential grant and tunnel authority; enqueue external revoke/close and retain capacity until confirmation                                                                                                                                                                                                   | no fresh claim/capacity reuse with unreconciled authority                                                        |
| SubmitForReview exits an implementation lease                                                                                     | revoke credential grants and implementation preview-tunnel authority; #229 provisions fresh Reviewer/local-Docker authority only after finalized `ReviewRequested`                                                                                                                                                               | no inherited implementation authority                                                                            |
| Ordinary lease containment has no secret-exposure evidence                                                                        | revoke lease-scoped access grants only; preserve underlying named secret/credential refs                                                                                                                                                                                                                                         | no named-secret quarantine/revocation outside Absolute Stop                                                      |
| Prepared Review Handoff lacks external confirmations                                                                              | remain Review / Preparing Review and fenced/contained; retain lease/capacity/worktree                                                                                                                                                                                                                                            | no reviewer launch, ReviewRequested, or implementation release                                                   |
| Material-interruption Finalize lacks required access/tunnel confirmation                                                          | retain containment/capacity and `AcceptedPendingApplication`                                                                                                                                                                                                                                                                     | no Backlog apply or resource reuse                                                                               |
| Finalized-Review material Finalize sees missing/stale/mismatched #229 proof                                                       | reject/retain interruption under exact proof requirement and handoff/review-run binding                                                                                                                                                                                                                                          | finalized handoff and Review/WIP unchanged; no false containment-accepted event                                  |
| Archive follows a stop with unreconciled access/tunnel authority                                                                  | reject archive until local revocation and external confirmation are reconciled                                                                                                                                                                                                                                                   | active Card/history remains visible; no hidden execution authority                                               |
| Dependency unfinished                                                                                                             | keep visibly locked in Todo; reject claim                                                                                                                                                                                                                                                                                        | blocker IDs/status from authoritative query                                                                      |
| Exact duplicate active AddDependency                                                                                              | return existing Dependency Edge as a true zero-write no-op                                                                                                                                                                                                                                                                       | unchanged graph/contract/queue/event/ledger/outbox versions                                                      |
| RemoveDependency replays the first successful key/hash                                                                            | return original receipt, edge retirement, and `DependencyRemoved` refs                                                                                                                                                                                                                                                           | no second event, Revision, graph, queue, or outbox write                                                         |
| New RemoveDependency key targets the same already-retired edge                                                                    | persist receipt-only `already_removed` cross-reference to original removal                                                                                                                                                                                                                                                       | no second domain event or graph/contract/queue/outbox change                                                     |
| RemoveDependency names absent edge, wrong endpoints, or stale active version                                                      | terminal `dependency_not_active`/`dependency_identity_conflict` receipt and reject                                                                                                                                                                                                                                               | zero domain events and partial writes; no endpoint-selected deletion                                             |
| Proposed dependency creates cycle                                                                                                 | reject entire graph command                                                                                                                                                                                                                                                                                                      | no edge/version/invalidation writes                                                                              |
| Dependency mutation during starting/active/unknown execution                                                                      | AcceptRevision atomically prepares interruption; defer edge mutation until safe Finalize revalidates graph/cycle                                                                                                                                                                                                                 | no accepted-unfenced gap and no early edge/version write                                                         |
| Standalone material Revision/dependency command targets any nonterminal Sprint member                                             | reject before acceptance/mutation; require an exact coordinated Sprint-boundary command                                                                                                                                                                                                                                          | no silent Sprint or DevTicket partial update                                                                     |
| Coordinated Draft Sprint Plan/member mutation is version-valid                                                                    | atomically update Plan/member and DevTicket, keep Sprint Draft, require no grant or Needs Re-approval                                                                                                                                                                                                                            | one cross-linked transaction; Draft approval state unchanged                                                     |
| Sprint Plan places a dependent before an internal direct or transitive blocker                                                    | under exact graph/Plan/member versions, reject Plan approval or activation; require a dependency-compatible topological order                                                                                                                                                                                                    | no Approved/Active Sprint, reservation, claim, lease, or skipped member                                          |
| Approved/Queued/Active coordinated mutation lacks an exact approved grant or has stale bindings                                   | reject entire transaction; a valid exact grant is required and transitions Sprint to Needs Re-approval                                                                                                                                                                                                                           | old contract/graph/member/approval/grant/Sprint/Plan versions unchanged                                          |
| Dependency mutation targets Done                                                                                                  | reject in-place mutation and require follow-up work                                                                                                                                                                                                                                                                              | Done contract/graph/history unchanged                                                                            |
| Material Revision targets Todo with `credential_provisioning`                                                                     | atomically accept pending application, fence claim/lease, revoke pending or active grants/tunnel, hold capacity/worktree; Finalize only after no-process or stopped/quarantined proof plus every confirmation                                                                                                                    | no idle-path Backlog apply, access resurrection, or premature resource reuse                                     |
| Material Revision targets Todo with no live claim/grant/tunnel                                                                    | apply atomically through the idle Todo path                                                                                                                                                                                                                                                                                      | no unnecessary interruption; one Revision/lane/approval transaction                                              |
| Material Revision during provisioning/start/execution                                                                             | prepare interruption, fence authority, hold capacity/worktree; Finalize/Abort only after authenticated no-process or stopped/quarantined proof plus all confirmations                                                                                                                                                            | no premature Backlog/invalidation, abort, or capacity reuse                                                      |
| Active AcceptRevision crashes                                                                                                     | `AcceptedPendingApplication`, interruption, fence, containment hold, and stop outbox commit together or none commit                                                                                                                                                                                                              | never accepted-but-unfenced                                                                                      |
| Revision interruption times out or Runner is unavailable                                                                          | retain the sole-owner Material Revision Interruption as `AcceptedPendingApplication`; provisioning appends source/no-start proof to it and forbids Pre-Start Admission Loss, while post-enqueue evidence remains on that owner or linked Blocked state                                                                           | exact Revision/interruption and old authority refs remain auditable; no second finalizer                         |
| Claim or ResolveOrSupersedeBlock sees `AcceptedPendingApplication`/interruption                                                   | reject old-contract start/return; require safe Finalize or `AbortMaterialRevisionInterruption`                                                                                                                                                                                                                                   | no fresh Execution Lease on stale Ready Approval                                                                 |
| Abort interruption lacks authority, exact versions, no-process/stopped/quarantined proof, confirmations, or required Review proof | reject with interruption and containment unchanged                                                                                                                                                                                                                                                                               | no candidate discard, capacity release, target transition, approval disposition, or finalized handoff rewrite    |
| `restore_todo` sees invalid old approval, active Absolute Stop, or unresolved Blocked condition                                   | reject that disposition; caller must explicitly submit versioned `invalidate_to_backlog`                                                                                                                                                                                                                                         | no silent disposition/key change and no unsafe Todo return                                                       |
| `invalidate_to_backlog` runs with an active Absolute Stop                                                                         | abort candidate and move Backlog while leaving the stop active/gating                                                                                                                                                                                                                                                            | Ready Approval invalidated; no `AbsoluteStopResolved` or bypass                                                  |
| Abort leaves Blocked after the condition is proven resolved                                                                       | close/clear/preserve the episode and emit linked `BlockedResolved`                                                                                                                                                                                                                                                               | resolution proof plus one source-to-target transition                                                            |
| `invalidate_to_backlog` leaves Blocked while its condition remains unresolved                                                     | close as `superseded_by_contract_invalidation`, clear current ref, preserve unresolved refs, emit `BlockedSuperseded`                                                                                                                                                                                                            | no `BlockedResolved`; episode history retains condition/incident/dependency refs                                 |
| Either abort disposition runs from a non-Blocked source                                                                           | create, resolve, and supersede no Blocked Episode                                                                                                                                                                                                                                                                                | one source-to-selected-target transition; no fabricated episode                                                  |
| Any material apply/finalize leaves Blocked for Backlog                                                                            | run shared condition-aware close/clear: resolve only with proof, otherwise supersede while preserving unresolved refs                                                                                                                                                                                                            | no dangling current ref and no false `BlockedResolved`                                                           |
| Material Review-to-Backlog exit                                                                                                   | lock Review Handoff/WIP and decrement with Review→Backlog transaction                                                                                                                                                                                                                                                            | counter equals exact Review membership                                                                           |
| Non-semantic correction inside managed contract                                                                                   | new Ready Contract Version + exact carry-forward record                                                                                                                                                                                                                                                                          | old/new hashes plus classification reason visible                                                                |
| Non-semantic correction touches protected/hash/dependency/policy input or stale lineage                                           | reject equivalence branch and route material Revision/interruption policy                                                                                                                                                                                                                                                        | no contract/Ready/execution binding partial carry-forward                                                        |
| Draft Sprint member receives a valid non-semantic correction                                                                      | atomically update Draft Plan/member contract ref and DevTicket under exact versions; stay Draft                                                                                                                                                                                                                                  | no Sprint Plan Binding Carry-Forward, approval binding, or Needs Re-approval                                     |
| Active/Blocked/Review non-semantic correction succeeds                                                                            | append exact contract, Ready Approval, and immutable Execution Binding Carry-Forward; never mutate lease                                                                                                                                                                                                                         | later receipts/Review cite original binding plus current head/equivalence lineage                                |
| Review changes-requested proves work blocks another DevTicket or approved Active Sprint Goal                                      | set `reviewReworkPlacement=blocking_top`; insert at front rank of its exact dependency/Priority band in the globally first tier                                                                                                                                                                                                  | exact proof, tier, queue/counter versions, and front anchor                                                      |
| Review changes-requested is ordinary rework                                                                                       | set `reviewReworkPlacement=ordinary_bottom`; insert at deterministic bottom of its exact dependency/Priority band in the last tier                                                                                                                                                                                               | exact queue/counter versions and bottom anchor fact                                                              |
| Caller raises Priority or asserts `reviewReworkPlacement` to bypass approval                                                      | Priority remains material and placement remains server-derived; reject direct assertion                                                                                                                                                                                                                                          | no Ready Approval, tier change, or cross-band reorder                                                            |
| Approved/Queued/Active Sprint member receives valid non-semantic correction                                                       | lock exact Plan/member/approval and append Sprint Plan Binding Carry-Forward with contract/Ready carry-forward                                                                                                                                                                                                                   | Sprint approval stays valid only through exact immutable binding record                                          |
| Sprint Plan/member/approval binding mismatches non-semantic correction                                                            | reject all carry-forward and route material Plan revision/Needs Re-approval                                                                                                                                                                                                                                                      | no partial contract, Ready, execution, or Sprint binding                                                         |
| Watcher/read/display metadata changes outside contract                                                                            | use metadata command/activity only                                                                                                                                                                                                                                                                                               | no Ready Contract Version, invalidation, or carry-forward                                                        |
| Comment/worklog delivery replays                                                                                                  | return the same append result under the stream/idempotency key                                                                                                                                                                                                                                                                   | one immutable record/event and at most one #231 sync intent                                                      |
| Comment/worklog correction requested                                                                                              | append a correction naming the original; never update/delete prior record                                                                                                                                                                                                                                                        | both records remain auditable; projection resolves the correction chain                                          |
| Any content-bearing/free-text field contains a suspected secret                                                                   | reject/quarantine before receipt, product/audit ledger, outbox, GitHub payload, or raw-log persistence; invoke scoped Absolute Stop                                                                                                                                                                                              | no raw value anywhere; safe hash/ref, detection metadata, and stop notification only                             |
| Absolute Stop trigger races exception/claim/lane command                                                                          | scope locks serialize; stop-first blocks/revokes, command-first is immediately fenced/contained                                                                                                                                                                                                                                  | one active stop; no bypass authority or uncontained execution                                                    |
| Absolute Stop sees a live Material Revision Interruption in provisioning/start/In Progress/prepared-or-cancelling Review          | attach stop/evidence to that owner, reuse its fence/revocation/checkpoint/Review containment, preserve lane/WIP, and require its exact terminal proof before stop resolution                                                                                                                                                     | one interruption finalizer; no duplicate Blocked/Runner/#229 request or release                                  |
| Secret-exposure Absolute Stop opens with affected credential-derived lease grants or preview authority                            | atomically revoke/quarantine underlying refs, revoke every derived lease grant with distinct events/outboxes, revoke preview authority, and contain execution                                                                                                                                                                    | stop/credential/grant/preview/Blocked facts commit or none; no raw secret stored                                 |
| Absolute Stop opens over an already-Blocked execution                                                                             | lock its Blocked Episode/containment owner/request, append stop cause, and reuse the same request/delivery/finalizer                                                                                                                                                                                                             | no second episode, overlapping containment owner, duplicate release, or stop-owned Blocked exit                  |
| Absolute Stop affects a finalized Review Handoff                                                                                  | preserve handoff/Review/WIP and create/reuse exact #229 Reviewer/Docker/tunnel/evidence containment requirement                                                                                                                                                                                                                  | resolution waits for matching Review Containment Proof; implementation Runner proof cannot substitute            |
| Finalized-Review Absolute Stop lacks exact #229 proof                                                                             | retain stop and Review containment; reject resolution                                                                                                                                                                                                                                                                            | no `AbsoluteStopResolved`, handoff rewrite, evidence reuse, Done, or inferred containment                        |
| Absolute Stop or BlockExecution fences a possibly live process                                                                    | atomically create/reuse one Runner Containment Request and checkpoint+stop/quarantine delivery bound to lease, old/advanced fence, process/worktree, purpose, and nonce                                                                                                                                                          | Blocked/stop containment commits with its request/outbox or none; no fence-only containment gap                  |
| Runner containment delivery retries or two workers dispatch                                                                       | reuse the same request and delivery identity; Runner executes under the one-use nonce and returns one authenticated confirmation                                                                                                                                                                                                 | no duplicate stop/quarantine authority or conflicting checkpoint request                                         |
| ReconcileRunnerContainment receives missing, unauthenticated, replayed, or mismatched confirmation                                | missing/unauthenticated input is denied without persistence; authenticated replay/mismatch gets one stable rejected disposition; retain containment until exact confirmation and every credential/tunnel leg match                                                                                                               | no inferred stop from database fence, access revocation, or caller snapshot                                      |
| GitHub-health Absolute Stop does not scope a lease credential grant                                                               | preserve that grant; affect lease grants only when the stop's verified scope includes them                                                                                                                                                                                                                                       | no unrelated lease-grant event or revocation outbox                                                              |
| Absolute Stop requests a Needs Human Approval Request                                                                             | reject exception creation and open/retain explicit stop containment                                                                                                                                                                                                                                                              | no approvable request/token; authoritative stop fact                                                             |
| Secret-exposure stop lacks confirmed underlying credential, derived lease-grant, or preview-tunnel remediation                    | reject resolution; local revocations, gates, and containment remain                                                                                                                                                                                                                                                              | no `AbsoluteStopResolved`, approval, exception, claim, or lane grant                                             |
| GitHub-health stop lacks restored verified health/reconciliation                                                                  | reject resolution; gates and containment remain                                                                                                                                                                                                                                                                                  | no `AbsoluteStopResolved`, approval, exception, claim, or lane grant                                             |
| Exception target/policy changes, nonce replays, expires, or approver loses role                                                   | invalidate/expire/revoke before use; governed command remains blocked                                                                                                                                                                                                                                                            | one authoritative activity decision; no lane mutation                                                            |
| Block request lacks category or safe reason                                                                                       | reject; `execution_unknown` is not a substitute for either                                                                                                                                                                                                                                                                       | no Blocked Episode or lane change; security-safe error                                                           |
| Block request has no trusted checkpoint                                                                                           | require explicit `execution_unknown` checkpoint state                                                                                                                                                                                                                                                                            | reason/category preserved; no fabricated clean checkpoint                                                        |
| Block resolved while old process still writes                                                                                     | reconciliation/fencing rejects fresh start                                                                                                                                                                                                                                                                                       | old fence rejected; new lease only after quarantine/stop                                                         |
| `ResolveOrSupersedeBlock(resolved)` lacks condition-resolution proof                                                              | reject with current Blocked Episode and containment unchanged                                                                                                                                                                                                                                                                    | no `BlockedResolved`, Todo move, or cleared current ref                                                          |
| `ResolveOrSupersedeBlock(superseded)` lacks authority/reason or safe containment                                                  | reject; archive remains unavailable                                                                                                                                                                                                                                                                                              | unresolved refs and current Blocked Episode preserved                                                            |
| Authorized supersession succeeds                                                                                                  | preserve unresolved refs, emit `BlockedSuperseded`, clear current ref, and choose Todo/Backlog by exact Ready Approval validity                                                                                                                                                                                                  | no false resolution; archive may be requested separately afterward                                               |
| MergeProposal or RejectProposal targets Draft or terminal state                                                                   | reject; require exact AwaitingDecision and never silently Submit                                                                                                                                                                                                                                                                 | no Proposal decision/lifecycle event or target mutation                                                          |
| Two Proposals concurrently link the same GitHub Issue                                                                             | unique GitHub Issue Binding lock lets one win; loser gets deterministic conflict                                                                                                                                                                                                                                                 | one repository/Issue owner and one link intent                                                                   |
| Direct Backlog creation links/creates a GitHub Issue                                                                              | use the same verified reservation/create-intent confirmation and conflict path as AcceptProposal                                                                                                                                                                                                                                 | one canonical GitHub Issue Binding owner; no URL assertion shortcut                                              |
| Provider-create confirmation finds an existing GitHub Issue Binding                                                               | open sync conflict/reconciliation; never overwrite or double-link                                                                                                                                                                                                                                                                | both DevTickets retain identity/history; one binding owner                                                       |
| GitHub unavailable after Proposal acceptance                                                                                      | keep Backlog + pending mirror, retry/reconcile                                                                                                                                                                                                                                                                                   | accepted decision intact; health/outbox lag visible; no duplicate issue                                          |
| Archive requested during live lease or unresolved containment                                                                     | reject until governed stop/quarantine and reconciliation complete                                                                                                                                                                                                                                                                | Card remains active; no hidden running work                                                                      |
| Archive requested with a current Blocked Episode                                                                                  | reject until `ResolveOrSupersedeBlock` closes/clears it and a separate archive command is submitted                                                                                                                                                                                                                              | no archived/Backlog projection with `currentBlockedEpisodeRef`                                                   |
| Archive sees Draft/Approved/Queued/Active Sprint membership                                                                       | reject; require explicit Sprint member/Plan removal or revision at the Sprint boundary first                                                                                                                                                                                                                                     | Sprint Plan/version and DevTicket archive state remain unchanged                                                 |
| Archive succeeds with a current Ready Approval                                                                                    | atomically clear/deactivate current binding and preserve immutable approval as history                                                                                                                                                                                                                                           | one `ReadyDeactivatedByArchive`; archived Card has no active approval                                            |
| Restore archived Accepted/Rejected Proposal                                                                                       | remove overlay but preserve terminal decision                                                                                                                                                                                                                                                                                    | no second acceptance/DevTicket; same Proposal history                                                            |
| Restore of old active/Ready work                                                                                                  | restore Backlog, never reactivate archived approval, require new validation/approval/claim                                                                                                                                                                                                                                       | prior approval historical only; no active Ready binding or lease                                                 |
| Stale Card projection suggests legal drop                                                                                         | command rechecks write model and rejects/snap-backs                                                                                                                                                                                                                                                                              | precise gate reason and refreshed aggregate version                                                              |
| Legacy import lacks explicit confirmed Human Owner or target gate                                                                 | never infer owner from legacy assignee; quarantine or create Historical Projection candidate                                                                                                                                                                                                                                     | no active-lane membership, Ready Approval, claim, or lease                                                       |
| Legacy Todo has confirmed Human Owner and valid Backlog gates                                                                     | import to deterministic Backlog only; require ordinary Ready flow for Todo                                                                                                                                                                                                                                                       | no automatic Todo membership or fabricated approval                                                              |
| Legacy Done lacks current proof                                                                                                   | display only in the Historical Projection as unverified                                                                                                                                                                                                                                                                          | cannot satisfy dependency or Done metrics                                                                        |

## Rejected alternatives

| Alternative                                                                        | Why rejected                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename/extend `Task` and add two enum values                                       | preserves direct-status mutation, coarse authorization, and missing Ready/lease/dependency/history semantics; contradicts the dedicated-context decision               |
| Put lane, Blocked reason, assignee, lease, archive, and history in one status enum | makes mutually independent state impossible to reason about and allows UI labels to forge execution truth                                                              |
| Move to In Progress as soon as a lease row is inserted                             | contradicts “actually working”; a Runner delivery failure would leave false active work                                                                                |
| Call Runner/GitHub while holding the aggregate transaction                         | creates long locks and cannot atomically include an external system; crash recovery becomes ambiguous                                                                  |
| Let adapters implement their own transitions                                       | Slack/GitHub/UI/agents would become inconsistent alternate policy engines                                                                                              |
| Trust caller-supplied actor/role/source                                            | lets a tool impersonate Human Owner, Reviewer, or secure UI and destroys attribution                                                                                   |
| Reserve/replay an idempotency receipt before current family/target authorization   | lets guessed keys poison a namespace or disclose another principal's result                                                                                            |
| Check only the DevTicket aggregate version in a multi-record command               | permits stale Ready, graph, Runner, Sprint, resource, or queue state to commit beside a fresh ticket row                                                               |
| Use unversioned numeric queue positions                                            | concurrent inserts/reorders create phantom placement and ambiguous retry results                                                                                       |
| One mutable activity stream for all facts                                          | loses authority, ordering, retention, and checkpoint semantics fixed by ADR-017                                                                                        |
| Full event sourcing as a prerequisite                                              | adds migration and operational complexity not required by the locked decision; normalized state plus immutable accepted facts/outbox satisfies audit and rebuild needs |
| Eventual cycle checking after edge insertion                                       | permits a temporarily executable invalid graph and races Ready/claim decisions                                                                                         |
| Reuse a Blocked lease on recovery                                                  | lets an offline/stale process regain authority and violates fresh claim/fencing                                                                                        |
| Treat database lease fencing as process/worktree/GitHub containment                | a stale process can still mutate files or push refs even when later receipts are rejected                                                                              |
| Represent a Needs Human Approval Request as a flag on Ready Approval               | loses exact target/policy/nonce/expiry semantics and risks turning an exception into reusable approval                                                                 |
| Restore to prior Todo/In Progress/Review automatically                             | silently revives stale approval, assignment, lease, and evidence                                                                                                       |
| Treat GitHub status/Issue close as lane/Done authority                             | contradicts Opzava-owned gates and GitHub-native-fact-only authority                                                                                                   |
| Treat imported legacy Done as current Done                                         | fabricates Review/merge history and can incorrectly unlock dependents                                                                                                  |

## Downstream delivery constraints

The final implementation graph produced by #237 must preserve these constraints:

1. Add the dedicated Dev Board write model through expand-contract; do not mutate legacy Task tables
   into the new aggregate in place.
2. Ship the command receipt/idempotency store, aggregate versions, activity facts, and transactional
   outbox with the first write slice. Do not reintroduce a fire-and-forget optional event port.
3. Make the first vertical slice a real Postgres command seam proving tenant/RLS denial, exact Ready
   Approval, duplicate/stale commands, one winning claim, start timeout, and outbox atomicity.
4. Add dependency graph/cycle prevention before allowing ordinary or Sprint claims that consume it.
5. Add Runner Phase A/Phase B admission before any UI or tool can show new In Progress work.
6. Route UI drag/drop, keyboard/menu, Slack, GitHub, local tools, Lead Orchestrator, and Sprint
   automation through the same commands; adapters contain authentication/translation only.
7. Make projections expose provenance, aggregate version, sync freshness, start-pending, dependency
   lock, Blocked Episode, archive class, and legacy gate class so degraded state is not disguised.
8. Preserve legacy IDs/comments/evidence/worklogs and attach explicit migration dispositions; never
   synthesize transitions that source evidence does not prove.
9. Require #229's approved Review contract before enabling its proof-bound governed merge outbox or
   `AdmitDone`; reject an early/external merge into a visible Sync Conflict until Post-Merge Review
   reconciliation. Require #231's mirror health and reconciliation contract before gates rely on
   confirmed GitHub history; require #232's Runner protocol before production claims.
10. Test the observable contract at real seams named by PRD-019: authenticated browser/local Docker,
    real Postgres commands/outbox, signed webhook/conflict, and deterministic Runner protocol
    (`docs/prd/PRD-019-dev-board.md`).

## Resolution

#230 is resolved by the aggregate split, trusted command envelope, exact Ready Contract Version and
Ready Approval bindings, two-phase claim/start saga, graph transaction, revision invalidation
matrix, fresh-claim recovery, archive/Historical Projection distinction, authoritative event
catalog, and four-ledger routing above. The remaining Review, GitHub synchronization, Runner
transport/Slack, retention, and Releases tickets must implement their own mechanisms behind these
boundaries; they do not need to reopen this command model.
