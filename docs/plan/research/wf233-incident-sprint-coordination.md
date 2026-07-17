# WF-233 — Incident, Sprint, and ordinary-work coordination contract

**Ticket:**
[#233 — Reconcile Incident projections, governed interruption, strict Sprint order, and ordinary-work preemption](https://github.com/anthonykewl20/opzava/issues/233)
· map [#228](https://github.com/anthonykewl20/opzava/issues/228)<br> **Date:** 2026-07-17<br>
**Status:** resolution candidate; target planning contract only; no product code or production
schema is implemented by this memo

## Decision summary

1. **Notifications/Admin-Observability keeps Incident authority.** Incident identity, severity,
   visibility, lifecycle, evidence, and remediation remain outside Dev Board. Dev Board stores only
   a redacted, versioned Incident reference/projection and an admitted coordination request. An
   Incident is never a DevTicket, Sprint member, Todo item, or source of workflow authority.
2. **Sprint coordination is a narrow part of the Sprint write model.** It owns the active Plan
   binding, coordinator epoch, Runner admission preset binding, Sprint-capacity entitlement,
   deterministic selection state, selection holds, and typed wait reasons. It never owns a DevTicket
   claim, Execution Lease, process, containment, Review slot, or Incident lifecycle.
3. **WF-230 remains the only execution-admission and containment owner.** A coordination command
   references the applicable `ClaimAdmissionDeferred`, `PreStartAdmissionLoss`,
   `StartRejectionContainment`, `BlockedEpisode`, `RunnerContainmentRequest`, Material Revision
   Interruption, or #229 Review proof. It cannot create a competing lease, stop request, resource
   release, or finalizer.
4. **`autonomous_serial` means one exact Sprint implementation at a time.** The selector is
   version-bound and deterministic: eligible blocking rework first; then the first never-admitted
   remaining Plan member; then ordinary-bottom rework. It never scans past a selected member that is
   temporarily ineligible. Review members are not selected again unless changes-requested returns
   them to Todo.
5. **Review WIP is a global admission gate, not a Sprint-owned counter.** At WIP three, WF-230
   defers new claims and #233 records why the Sprint is waiting. Existing work is not killed. A
   later WIP gate-open event re-evaluates waits under fresh authority and state; it does not mint
   ordinary claimant authority or stampede retries.
6. **Ordinary work is never autonomous.** A Ready non-Sprint DevTicket starts only from its own
   explicit governed claim. Balanced may admit one ordinary implementation beside the one serial
   Sprint implementation; Focused and Custom follow their exact per-Runner entitlement. No scheduler
   invents an ordinary claim because a slot became free.
7. **P0/P1 requests are attention and ordering inputs, not authority.** Incident severity remains
   `S0`–`S3`; a redacted Incident request may recommend coordination priority `P0` or `P1`. Priority
   or severity alone cannot pause, preempt, insert scope, or approve a change. Dev Board
   reauthorizes the exact target action through its ordinary command policy.
8. **A pause stops new selection before it tries to stop work.** Advancing the coordinator epoch
   invalidates any unconsumed Sprint selection. If claim/start or execution already won, the target
   is contained through the WF-230 phase-specific owner. Started or ambiguous work is truthful
   Blocked during containment and returns to Todo only after proof-gated safe closure; continuation
   always uses a fresh claim, lease, fence, nonce, and start receipt.
9. **A blocking discovery is a Proposal plus a selection hold, never silent Sprint scope.** The hold
   may stop future selection while the human decides. Acceptance creates or links Backlog work;
   adding, removing, deferring, or reordering Sprint scope still requires an approved Plan revision
   and reapproval. A non-blocking accepted Proposal remains Backlog.
10. **Runner loss pauses coordination without failover.** Reconnect supplies a Reconciliation
    Observation and contains old authority under WF-232. `ResumeSprint` is a separate authorized
    command that revalidates Plan, Ready, dependency, Review-WIP, Runner, capability, capacity,
    health, secret-reference, GitHub, and Absolute Stop gates. Incident resolution or Runner
    liveness never resumes a Sprint by itself.
11. **Changes-requested reopens selection without rewriting the Plan.** Proven dependency/Goal-
    blocking rework enters the blocking tier. Other rework enters the bottom tier. If a later Sprint
    implementation already won admission, no second Sprint lease starts and no silent kill occurs;
    an immediate selection hold applies, while preemption requires its own authorized command.
12. **Correctness is deterministic.** State-machine, concurrency, signed Runner, RLS, Slack, and
    real local-stack acceptance tests do not invoke a model. Model-backed agent execution may be an
    optional compatibility smoke only and cannot prove the coordination contract.

## Authority and scope

This memo consumes rather than reopens:

- [WF-230](wf230-devticket-command-model.md), which owns DevTicket commands, trusted command
  envelopes, Ready/claim/start, phase arbitration, dependencies, Blocked, containment, fresh
  recovery, Review handoff admission, and the four-ledger split;
- [WF-232](wf232-runner-control-protocol.md), which owns enrolled Runner identity, hard-safe
  capability facts, typed delivery, signed observations, Lease Enforcer behavior, process/worktree
  containment, checkpoint outcomes, reconnect, and no automatic failover;
- ADR-013, PRD-012, and PRD-018, which own Incident/ErrorGroup, operational remediation, redaction,
  blast radius, and lifecycle;
- PRD-019, ADR-017, and the Dev Board foundation ledger, which lock one Active Sprint, strict serial
  Sprint implementation, per-Runner presets, explicit ordinary claims, Review WIP three, and the
  Proposal/human-decision boundary; and
- #229 as the only owner of reviewer execution, Review verdict, shared local Docker lease, Review
  containment/exit proof, merge authorization, and Done.

The ticket resolves coordination between those owners. It does not define a generic dispatcher,
arbitrary remote shell, another work queue, another process supervisor, or another Incident or
Review state machine.

### Authority matrix

| Concern                                                                           | Authoritative owner                                    | What #233 may hold                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Incident identity, severity, visibility, lifecycle, remediation                   | Notifications/Admin-Observability                      | immutable Incident ref/version, redacted impact and request refs only |
| DevTicket lane, Ready, assignment, claim, lease, fence, Blocked, resource release | WF-230 Execution Admission / Dev Board activity        | exact refs and accepted command outcomes only                         |
| Runner capability, delivery, checkpoint/process facts, reconnect                  | WF-232 Runner Registry/Protocol/Supervisor             | admitted fact and containment-owner refs only                         |
| Review WIP, Review containment/verdict/exit/Done                                  | WF-230 admission plus #229 Review owner                | current counter/version, gate-open epoch, verdict effect refs only    |
| Sprint Goal, approved Plan, membership/order, active condition                    | Sprint aggregate / Sprint Coordination                 | authoritative versioned coordination state                            |
| Per-Runner preset and Sprint-capacity entitlement                                 | Dev Board Execution Admission plus Sprint Coordination | effective policy/capability binding and entitlement state             |
| Ordinary claim intent                                                             | authenticated Human/agent requester through WF-230     | no scheduler-owned claimant authority                                 |
| Slack delivery                                                                    | notification outbox/provider adapter                   | delivery receipt only; never approval or state authority              |

Cross-context Incident state arrives as a Secret-Safe admitted fact through an outbox/inbox seam. No
transaction holds an Incident aggregate lock while holding Dev Board rows. Dev Board rechecks the
current Incident reference where required, but a stale, duplicated, or out-of-order Incident fact
cannot directly mutate a Sprint or execution.

## Sprint coordination records and invariants

These are target records inside the Dev Board/Sprint boundary. Names may change during
implementation, but their authority and uniqueness may not.

| Record                            | Required content                                                                                                                                                                                   | Must never own                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `SprintCoordination`              | Sprint/Goal/approved Plan versions; active Runner/preset/capability-policy refs; coordinator epoch; condition; exact current/last selection refs; active hold set digest; monotonic version        | DevTicket lane, claim, lease, Review verdict, Incident state  |
| `SprintCapacityEntitlement`       | one Sprint, Runner, effective preset/max, capability/policy digests, entitlement generation, state `barrier`, `held`, `released_for_exact_replacement`, or `ended`, optional exact replacement ref | an Execution Lease or proof capacity is physically free       |
| `SprintActivationWait`            | one unique wait per Sprint activation generation; current preflight/capacity reason; exact policy/Plan/Runner versions; retry sequence; terminal disposition                                       | a claim, lease, reservation, or permission to skip preflight  |
| `SprintSelectionAttempt`          | immutable attempt ID/sequence, coordinator epoch, approved Plan and graph versions, chosen selection class/member, all gate versions, outcome and child WF-230 command ref                         | mutable cursor truth or claimant authority                    |
| `SprintSelectionWait`             | one mutable wait per active selection generation; selected member; typed reason; exact binding versions; next retry key; notification ref                                                          | a second candidate, a claim, or a reusable stale decision     |
| `SprintSelectionHold`             | source kind/ref/version, affected Sprint/scope, safe reason hash/ref, creator/authority, created/expiry times, status and resolution ref                                                           | Plan mutation, process stop, Incident resolution, or approval |
| `CoordinationInterruptionRequest` | one immutable request with source, redacted evidence, coordination priority, exact target-set snapshot, policy/approval refs, per-target dispositions, and overall partial/terminal state          | a lease, containment request, finalizer, or claim             |

`SprintCoordination.condition` is orthogonal to terminal Sprint lifecycle. Its closed vocabulary is:

- `Running` — eligible to select under the current epoch;
- `WaitingForActivationCapacity` — still Queued; no Active Sprint exists yet;
- `WaitingForSelectionGate` — Active but stopped at one typed gate such as dependency, WIP, health,
  capacity, or exact replacement;
- `SelectionHeld` — one or more admitted holds prevent selection;
- `Pausing` — pause won but one or more already-admitted targets have not reached safe containment;
- `Paused` — Active Sprint remains nonterminal and selection is disabled;
- `ReconciliationRequired` — Runner/execution state is not safe enough to resume;
- `NeedsReapproval` — current Goal/Plan/Ready/dependency/policy binding is invalid; and
- `Completing` — every current Plan member is Done and only deterministic terminalization/mirror
  work remains.

The condition is not a Board lane. `Paused` does not mean completed, cancelled, or aborted. A Sprint
remains Active while Paused, so a second Sprint cannot activate.

### Lock order and concurrency extension

#233 extends WF-230's canonical total lock order; it does not replace it. Before any Sprint member,
queue, claim, or execution row, acquire in this order:

1. one-active/one-queued Sprint workspace guard;
2. Sprint aggregate, current approved Goal/Plan, membership and Plan-revision grant rows;
3. `SprintCoordination`, active hold-set digest rows, capacity entitlement, and the current
   activation/selection wait or attempt generation;
4. exact Runner preset/effective-capability policy and global Review-WIP gate version; then
5. continue with WF-230's canonical DevTicket, Revision/interruption, dependency graph, lane queue,
   Claim Attempt, lease/fence, grant/tunnel, outbox/inbox, and containment ordering.

Only one row of each mutable wait kind exists per generation. `SprintSelectionAttempt` is immutable
evidence; it never becomes the authoritative cursor. Same key/hash/authority returns the original
outcome. A changed payload or expected-version mismatch is a conflict with no partial mutation.
Every retry uses a new monotonic retry identity while reauthorizing and revalidating current state.

## Per-Runner admission presets and capacity

Execution Admission computes an `effectiveImplementationMax` from the minimum of verified Runner
safe maximum, platform policy maximum, current resource policy, and requested preset. Missing,
stale, revoked, downgraded, or contradictory capability evidence is unavailable, never guessed.

### Focused

- One total implementation entitlement on the Runner.
- Existing admitted work is never killed because a Sprint, P0/P1 request, or higher-priority
  DevTicket appears.
- A queued Sprint installs a capacity barrier and waits for the existing lease to complete or an
  authorized checkpoint/pause to contain it.
- While an Active Sprint is Paused, its entitlement remains held by default. A separately authorized
  pause may release it only for one exact replacement DevTicket or bounded operational action ref;
  it never opens a general autonomous queue. Sprint resume then waits for that exact replacement to
  finish or undergo its own governed preemption.

### Balanced

- Balanced is selectable only when current verified safe maximum is at least two. If not, the UI
  requires explicit Focused selection before admission; it must not display an unsafe limit as
  Balanced.
- With no Active Sprint, up to two ordinary DevTickets may be admitted from separate explicit
  claims.
- When a Sprint is Active, one entitlement belongs to its single serial implementation and at most
  one entitlement may serve one explicitly claimed ordinary DevTicket.
- If activation finds two ordinary leases, the Sprint remains Queued and creates one
  `SprintActivationWait` plus a reservation barrier. Existing leases continue; the barrier prevents
  a replacement ordinary admission from perpetually extending the wait. When one lease safely
  releases, activation rechecks every preflight gate and atomically moves Queued to Active while
  converting the barrier into the Sprint entitlement.
- Pausing never silently lends the Sprint entitlement to a second ordinary claim. An exact, approved
  replacement may use only the entitlement disposition recorded by the pause command; the
  ordinary-side limit remains one while the Sprint is Active.

### Custom

- Custom must fit within the same verified safe maximum and a versioned platform-policy range.
- One entitlement remains the only Sprint entitlement; all other permitted entitlements are ordinary
  and require explicit claims.
- No Custom value permits a second Active Sprint, a second concurrent Sprint DevTicket, an ordinary
  scheduler, or local/cloud lease migration.

A preset/capacity downgrade never kills an admitted lease. It advances the policy version, prevents
new admissions until usage is within the new limit, and records a typed wait. A capability loss
during live work invokes WF-230/WF-232 loss and containment; a settings row alone never proves a
process stopped.

## Queued activation and the strict selector

### `ActivateQueuedSprint`

The authorized command requires the one queued Sprint and no Active Sprint; exact approved Goal and
Plan; every Plan member's exact Ready Approval; dependency-compatible Plan order; external blockers
Done; healthy/reconciled GitHub; selected Runner and admitted capability; configured Reviewer and
healthy local Docker; resolvable named secret refs; Review WIP below three; no Absolute Stop; and an
available Sprint entitlement under current preset policy.

A temporary health, WIP, or capacity failure leaves the Sprint Queued. It creates or updates one
versioned `SprintActivationWait`; it does not invalidate Plan approval unless the bound contract,
membership, graph, risk, policy, runner/Reviewer selection, or required input materially changed.
When capacity is the reason, the barrier rules above prevent replacement ordinary claims from
starving activation. An internal retry has no authority of its own and rederives the original
approved activation authority and all current gates.

Successful activation atomically creates/holds the Sprint entitlement, moves the Sprint to Active,
creates coordinator epoch one, records `Running`, and enqueues deterministic selection. It does not
create a DevTicket claim or Execution Lease in the activation transaction.

### `SelectNextSprintImplementation`

The internal selector has no actor authority beyond the exact approved Active Sprint policy. Under
the lock order above it recomputes, rather than trusting a stored numeric cursor:

1. **Blocking rework:** the earliest eligible Todo Plan member with changes-requested placement
   `blocking_top`. Dependency-critical status comes from the current graph. Active-Goal-blocking
   status requires an exact Plan-bound Human Owner decision or deterministic approved Goal policy; a
   reviewer/model label alone is insufficient.
2. **Remaining planned implementation:** the first current Plan member in approved Plan order that
   has never completed an implementation admission generation through finalized Review Handoff.
3. **Ordinary-bottom rework:** the earliest eligible Todo Plan member with changes-requested
   placement `ordinary_bottom`, ordered by the WF-230 deterministic band/rank rules.

Within each class, exact Plan order and then DevTicket UUID break ties unless WF-230's already
locked review-rework band defines a stricter rank. A Review member is not selectable. A prior member
whose Review Handoff finalized no longer blocks later independent implementation merely because it
is still in Review; a later member that directly or transitively depends on it waits until it is
Done. Done members are complete, not skipped candidates.

The chosen member must still have the exact Plan/Ready/graph versions, Todo membership, no live or
containing claim, no unresolved dependency, no selection hold, no exclusive-resource conflict,
Review WIP below three, current Runner capability/health, available Sprint entitlement, healthy
required GitHub state, and no Absolute Stop. Failure records one typed `SprintSelectionWait` for
that exact candidate and stops. It never scans ahead to make the Sprint look busy.

An eligible choice submits WF-230 `ClaimAndStart` as `sprint_controller`, naming the exact Sprint,
Plan, coordinator epoch, selection attempt, entitlement, and candidate. The WF-230 claim/start saga
still owns assignment, capacity consumption, process registration, Enforcer arm, grant activation,
start arbitration, lease, lane, and receipt. Until its accepted start receipt moves the Card, the
Sprint has a pending selection, not a second active implementation.

The next selection can run only after the current member's Review Handoff finalizes and releases its
implementation resources, or after an interruption safely returns it to Todo. Completion is admitted
only when every member in the current approved Plan is Done, no rework is outstanding, no
claim/wait/containment/hold remains, and the exact Plan/Goal versions still match. GitHub tracking-
issue/milestone closure may remain a truthful synchronization-pending effect; it cannot fabricate
completion.

## Review-WIP backpressure and admission fairness

WF-230 owns the global Review-WIP counter and `ClaimAdmissionDeferred` behavior. #233 only consumes
the exact counter/version and records Sprint waiting state.

- At WIP three, all new implementation claim admission stops. Existing claims, leases, Sprint work,
  ordinary work, and Review work continue under their owners.
- The original ordinary `ClaimAndStart` key returns a terminal deferred result. Its retry retains
  and reauthorizes the original requester/source; the scheduler cannot substitute itself.
- A Sprint selection at WIP three records one selection wait and its own immutable attempt. It does
  not create a generic Admission Wait or duplicate the ordinary deferred record.
- A #229 Review exit that decrements WIP emits one durable monotonic `ReviewWipGateOpened` epoch.
  Consumers claim that epoch idempotently and re-evaluate current waits. A retry does not reserve a
  slot before the ordinary WF-230 admission transaction wins it.
- Per entitlement class, the oldest eligible committed wait sequence wins; exact IDs break ties. A
  held Sprint entitlement is considered only for the Sprint class, while ordinary waits arbitrate
  only ordinary entitlements. This prevents a Sprint retry from consuming ordinary capacity and
  prevents ordinary retries from stealing the reserved Sprint entitlement.
- If more work remains than newly available WIP, exactly the winning transactions admit; losers
  receive a fresh gate/version and remain waiting. No broadcast retry storm, silent starvation, or
  auto-created ordinary claim is allowed.

## Incident and blocking-discovery coordination

### Admitted Incident request

Notifications/Admin-Observability may emit a `RequestDevelopmentCoordination` fact through its
durable outbox. The Secret-Safe fact binds Incident ID and exact lifecycle/version, visibility,
source evidence digest/ref, affected repository/service/Runner and optional DevTicket/Sprint refs,
requested coordination priority, safe impact summary, issued/expiry times, source command/audit ID,
and idempotency identity. It carries no raw log, secret, stack trace, or Incident mutation
authority.

The Dev Board inbox authenticates and deduplicates the owner fact, resolves only allowed visible
targets, and reauthorizes the requested action under current Dev Board policy. Incident `S0`/`S1`
severity may inform a request for Dev Board coordination priority `P0`/`P1`, but the concepts remain
distinct. No severity or priority grants an approval.

An accepted request may create:

- a `SprintSelectionHold`, which immediately prevents future selection but does not touch live
  execution;
- one `CoordinationInterruptionRequest` with an immutable exact target set and the current approval
  requirement; and/or
- a Needs Human Approval Request/Slack action bound to that exact target set, source Incident
  version, proposed pause/interruption action, policy version, nonce, and expiry.

P0 changes notification urgency and ordering only. P0 and P1 both require the same command
authorization unless an independently versioned policy explicitly pre-authorized that exact safe
action. Only Absolute Stop containment may bypass ordinary approval, and it uses the existing
Absolute Stop owner rather than an Incident shortcut.

### Blocking Proposal

Submitting a Proposal records the agent's blocking/non-blocking assessment as evidence, not truth.
For an affected Active Sprint, a policy-authorized, exact `InstallBlockingDiscoveryHold` command may
create a selection hold so no new Sprint member starts while the human decides. It does not kill the
current member. If stopping current work is necessary, the Human Owner/Admin or a version-bound
Slack approval must authorize a separate interruption request.

Holds deduplicate by Sprint, source Proposal/version, affected Plan version, and hold purpose.
Multiple holds coexist; selection resumes only after every active hold is resolved or expires under
its explicit policy. A stale decision cannot clear a newer hold generation. Outcomes are:

- **reject/archive Proposal:** close only that hold after current-version confirmation;
- **reclassify non-blocking:** close only that hold; an accepted Proposal remains Backlog;
- **merge into existing work:** use WF-230 Revision rules and, where Plan-bound, an exact Sprint
  Plan Revision Grant; or
- **accept as blocking Backlog work:** preserve the hold until the new DevTicket is Ready and an
  approved Plan revision adds/reorders it, or until the Human Owner makes a separate exact decision
  to resume without it.

Acceptance never inserts a DevTicket into Sprint scope. A Plan revision revalidates Goal,
membership/order, dependency graph, Ready versions, risk/approval, Runner/Reviewer policy, and
secrets, and moves Approved/Queued/Active coordination to Needs Reapproval before any new selection.

### Permanent Incident remediation

Operational mitigation stays a PRD-018 `RemediationAction` and may execute only through its own
blast-radius, dry-run, approval, and audit boundary. A lasting code/configuration fix is a
separately linked Proposal or Backlog DevTicket of Type Bug or Technical Task. It passes Human
Owner, Ready, GitHub mirror, dependency, claim, Review, and Done normally. Joining the Active Sprint
requires an approved Plan revision. Incident resolution never marks that DevTicket Done, and
DevTicket Done never resolves the Incident.

## Governed pause and preemption

### `RequestSprintPause`

The command binds the exact Sprint/Plan/coordinator epoch, safe reason, source request/Incident/
Proposal refs where applicable, target Runner and target claim set, requested entitlement
disposition, authorization/policy versions, idempotency key, and notification policy.

One transaction advances the coordinator epoch, installs the selection hold, invalidates any
unconsumed selection attempt, and records `Pausing` or `Paused`. It does not call an external Runner
inside the transaction and never declares already-admitted work stopped.

Pause versus start linearizes on the same coordinator epoch, selection, entitlement, DevTicket,
Claim Attempt, and start-arbitration rows:

- pause wins before claim preparation: selection is stale; no claim/lease/resource exists;
- pause wins during `credential_provisioning`: use WF-230 governed pre-start cancellation and its
  one `PreStartAdmissionLoss`; only its finalizer may release;
- start activation/enqueue wins: pause treats presence as ambiguous until the exact start/rejection/
  loss arbitration proves otherwise; a possibly live process takes the WF-230 Blocked and
  containment path;
- accepted start/In Progress wins: use WF-230 `BlockExecution`, one `BlockedEpisode`, and one
  `RunnerContainmentRequest`;
- material Revision interruption wins: append the coordination cause to that existing owner and
  leave its sole finalizer in control;
- Review submission/handoff wins: #233 holds future Sprint selection; #229 owns any Reviewer/
  Docker/evidence containment and Review exit; and
- an Absolute Stop wins: its containment remains unbypassable and the coordination request only
  cross-links to it.

The losing path records one deterministic already-paused, selection-stale, or owner-selected
outcome. It creates no second fence, stop request, Blocked Episode, or resource release.

### Existing phase-specific containment

For a started or possibly started target, the accepted WF-230 path atomically fences old receipt
authority, revokes local lease-grant and preview-tunnel authority, opens/reuses the truthful Blocked
Episode, and enqueues one WF-232 typed bounded checkpoint-plus-stop/quarantine order. The Runner
must continue cleanup when checkpointing fails or its deadline expires: it signs
`checkpoint_not_recorded`, preserves the last trusted checkpoint binding, disposes grants/tunnel
authority, and stops or quarantines the full registered containment set.

No database fence, transport ACK, heartbeat loss, credential revocation, or checkpoint alone proves
containment. Safe closure requires authenticated stopped/quarantined disposition for process and
descendants; reconciled worktree/common-dir/branch/HEAD/dirty and GitHub-write state; exact grant
disposition plus upstream confirmation; preview-tunnel closure/revocation; and the selected owner
nonce/fence/versions. Unknown or partial state retains Blocked and held resources.

After proof, the coordination path uses WF-230 `ResolveOrSupersedeBlock`:

- `resolved` only when the named execution condition ended; or
- `superseded` when the execution episode is deliberately ended but the Incident/Proposal/Sprint
  condition remains, preserving those unresolved refs in history.

Either valid disposition returns the still-Ready DevTicket to Todo, clears claim-created assignment
unless an explicit preassignment is retained, releases per-item resources exactly once, and requires
a fresh claim. If Ready is no longer valid, the existing WF-230 command moves it to Backlog. It
never resumes In Progress.

### Multi-target interruption

One Incident or policy request may name several exact current leases, but external containment is
not falsely atomic. The parent `CoordinationInterruptionRequest` freezes the target-set snapshot and
fans out to independent per-target WF-230 owners. Each target records `pending`, `containing`,
`safe_todo`, `backlog`, `review_owned`, `failed_unknown`, `not_applicable`, or `superseded`, with
owner refs and versions. A duplicate request replays those dispositions; a changed target set is a
new request.

Partial failure is visible. The Sprint remains held while any required Sprint target is unsafe;
ordinary unaffected work continues unless separately targeted, capacity/policy prevents it, or an
Absolute Stop applies. One safe target never releases another target's capacity, and a global
notification cannot claim every process stopped.

### Capacity entitlement while paused

Proof-gated containment releases the per-item lease/capacity/worktree only. The Active Sprint's
capacity entitlement remains held by default. `release_for_exact_replacement` requires explicit
Human Owner/Admin authorization and one exact Ready replacement DevTicket or PRD-018 remediation
ref; it does not create a general pool or allow a second ordinary lease beyond the preset's Active-
Sprint limit. Resume must reacquire/convert that entitlement and may wait for the replacement to
finish. It cannot silently preempt the replacement.

## Runner loss, reconciliation, and resume

Runner disconnect, lease/key/capability loss, daemon/Enforcer loss, or start timeout uses the exact
WF-230/WF-232 phase branch. #233 adds one Sprint selection hold and coordination reason only:

- loss during `credential_provisioning` stays Todo through Pre-Start Admission Loss and opens no
  Blocked Episode;
- loss after start may exist opens/reuses Blocked / Connection Lost / Execution Unknown and retains
  resources until containment;
- no local lease migrates to cloud and no old lease resurrects;
- reconnect first records a signed Reconciliation Observation, contains old process/grants/tunnel,
  and resolves or quarantines worktree/GitHub state; and
- recovery returns the interrupted DevTicket to Todo. A verified worktree may be adopted only by a
  new `ClaimAndStart` with a new lease, fence, nonce, process registration, Enforcer arm, grant
  activation, and accepted start receipt.

`ResumeSprint` is an explicit authenticated command. It names the current pause/hold and coordinator
epoch, disposition of every interruption target, current Runner enrollment/capability and selected
preset, exact approved Plan and graph, Human decision/approval refs, and one-use nonce. It rejects
until every required containment is safe and revalidates:

- Goal/Plan approval, membership/order, Ready versions, and dependency graph;
- active selection/rework tiers and no duplicate Sprint implementation;
- current Human Owner/authorization and any Needs Human Approval decision;
- Review WIP, Runner capability/health, entitlement/capacity, Reviewer/local Docker health;
- GitHub health/synchronization, secret-reference readiness, exclusive resources, and Absolute
  Stops; and
- every active Incident/Proposal/manual hold's exact resolution or separately authorized waiver.

Incident `Resolved`, linked fix Done, Slack delivery, restored heartbeat, or a clean-looking Runner
snapshot can trigger reevaluation/attention only. None consumes `ResumeSprint`. Successful resume
advances the coordinator epoch, records `Running`, and lets the strict selector begin with the
interrupted/rework member required by current ordering. It does not directly claim a ticket in the
same command.

## Changes-requested and dependency effects

#229 owns the verdict and exact Review Exit Containment Proof. Once WF-230 commits
`ReviewChangesRequested`, Review WIP decrements and the DevTicket returns to Todo with one
placement:

- `blocking_top` when the current dependency graph proves it blocks another eligible DevTicket, or
  an exact Plan-bound Human Owner/approved Goal policy proves it blocks the Active Sprint Goal; or
- `ordinary_bottom` otherwise.

The verdict does not revise Plan membership/order or Ready content. The coordinator recomputes its
selection tiers under the exact current Plan/graph versions.

Race with a later Sprint selection is linearized:

1. changes-requested commits before a later selection is consumed: the old selection generation is
   invalidated; eligible blocking rework is next, while ordinary-bottom rework waits behind the
   remaining initial Plan order;
2. a later Sprint Claim Attempt/start already won: never admit rework concurrently and never kill
   the later item silently. Install an immediate selection hold after that item. If rework blocks a
   dependency or Goal and cannot wait, require a separately authorized governed preemption; and
3. verdict and start race on stale versions: exactly one commits; the loser reloads the resulting
   coordinator/claim/Review-WIP versions and takes case one or two.

The selector never scans past an exact candidate whose blocker is still in Review. It waits for Done
because dependency authority is stronger than implementation-order progress. A new or changed
dependency/Plan/contract remains a material governed revision and moves coordination to Needs
Reapproval; no runtime rank adjustment substitutes for that decision.

## Commands and deterministic outcomes

| Command                             | Required inputs/locks                                                                | Result                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `SetRunnerAdmissionPreset`          | Admin authority; Runner/capability/policy/current leases; exact versions             | persist effective Focused/Balanced/Custom binding; downgrade blocks new admission and never kills leases |
| `ActivateQueuedSprint`              | queued Sprint; approved Plan/Goal; all activation gates; capacity barrier            | temporary failure updates one wait; success creates Active coordination/entitlement without a claim      |
| `RetrySprintActivation`             | active wait; monotonic retry; original authority and fresh gates                     | cancel/supersede stale wait, retain wait, or activate once                                               |
| `SelectNextSprintImplementation`    | Active/Running epoch; exact Plan/graph/tiers/holds/WIP/entitlement                   | one immutable attempt; exact wait or one WF-230 Sprint `ClaimAndStart` request                           |
| `RetrySprintSelection`              | exact wait/generation; gate-open/recovery fact; fresh versions                       | no scan-ahead; update wait or submit at most one claim                                                   |
| `InstallSprintSelectionHold`        | exact source fact/version/scope and policy/authority                                 | advance epoch, stop future selection, preserve live work                                                 |
| `ResolveSprintSelectionHold`        | exact hold/current source disposition/authority                                      | close one hold only; never mutate Plan or Incident                                                       |
| `RequestSprintPause`                | exact coordinator epoch/targets/reason/approval/entitlement disposition              | selection stops atomically; already-admitted work delegates to existing containment owners               |
| `RequestOrdinaryInterruption`       | exact ordinary target/request/policy/approval                                        | no Sprint mutation; target delegates to WF-230 phase owner                                               |
| `ReconcileCoordinationInterruption` | exact parent/target owner refs and authenticated dispositions                        | update per-target/partial state only; no resource release                                                |
| `ResumeSprint`                      | current pause/holds/target dispositions and complete fresh preflight                 | new Running epoch; strict selector may run; no direct claim or old-lease reuse                           |
| `ApplyReviewReworkToCoordination`   | accepted #229/WF-230 changes-requested event and current Plan/graph                  | recompute tier; invalidate pending selection or hold behind already-admitted member                      |
| `CompleteSprint`                    | every current Plan member Done; no wait/hold/rework/live/containment; exact versions | immutable Completed history plus mirror outbox; no Incident mutation                                     |

Every public command derives actor/source from authenticated transport, applies Secret-Safe Ingress,
requires tenant/workspace and exact expected versions, and writes a namespaced idempotent command
receipt only after authorization. UI, Slack, Ask Admin, GitHub, agents, and internal workers all
request these same commands. Internal retry/select workers have no independent Human, claimant, or
Incident authority.

## Events, notifications, and ledger routing

Authoritative Dev Board activity events include:

- `RunnerAdmissionPresetChanged`, `SprintActivationDeferred`, `SprintActivated`;
- `SprintSelectionAttempted`, `SprintSelectionDeferred`, `SprintSelectionHeld`,
  `SprintSelectionHoldResolved`;
- `SprintPauseRequested`, `SprintPausing`, `SprintPaused`, `SprintResumeRejected`, `SprintResumed`;
- `CoordinationInterruptionRequested`, `CoordinationTargetDispositionChanged`,
  `CoordinationInterruptionPartial`, `CoordinationInterruptionCompleted`;
- `SprintReworkPlaced`, `SprintReworkPreemptionRequired`, `SprintNeedsReapproval`; and
- `SprintCompleted`.

They cross-link, but do not duplicate, WF-230 claim/lane/Blocked facts, WF-232 signed Runner facts,
#229 Review facts, Incident lifecycle events, or GitHub synchronization receipts.

| Ledger                          | #233 content                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning decision               | Proposal assessment and human decision, Plan/pause/resume rationale, rejected alternatives, Incident coordination recommendation, approvals and waivers    |
| Dev Board activity/history      | preset, entitlement, activation/selection/hold/pause/resume commands, coordinator versions, parent interruption target dispositions, lane/claim owner refs |
| Runner execution/checkpoint     | only signed checkpoint/process/Enforcer/reconciliation facts produced by WF-232; no coordinator decision or Incident payload                               |
| Synchronization/outbox/conflict | Secret-Safe Incident request delivery, Slack/GitHub outbox attempts and confirmations, dedupe/reconciliation/conflicts                                     |

Slack notification uses a durable outbox and never participates in the state transaction's success.
Notify on activation waiting, WIP backpressure, blocking discovery, P0/P1 coordination request,
pause requested, each unsafe/partial target, checkpoint failure, Runner loss/no failover, Paused,
resume rejected, and resumed. The message carries safe reason, exact Card/Sprint/Incident links,
last trusted checkpoint summary, next human action, and freshness. It contains no raw secret,
unredacted Incident evidence, local path, tunnel credential, or false claim that work stopped.
Delivery failure retries the same message intent and never rolls back or advances coordination.

## Sad paths and race contracts

| Scenario                                                         | Required observable outcome                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| duplicate/out-of-order Incident request                          | exact duplicate replays; changed/stale version cannot clear or mutate newer coordination; no second hold/target saga              |
| Incident request names unauthorized/cross-tenant target          | reject before target disclosure or command receipt; no Sprint/lease effect                                                        |
| P0/S0 label or model says “preempt”                              | attention/request only; no pause, plan insertion, claim, fence, or approval                                                       |
| pause races unconsumed selection                                 | coordinator epoch winner invalidates selection; no claim                                                                          |
| pause races `credential_provisioning`                            | same phase-owner locks choose start activation or one Pre-Start loss; no second finalizer                                         |
| pause races `start_pending` receipt/rejection/loss               | exact WF-230 arbitration selects no-process containment or Blocked unknown; late loser is evidence only                           |
| pause races accepted In Progress                                 | start may become truthful first, then one Blocked/containment path; no invisible start or double lane move                        |
| pause races material Revision/Absolute Stop                      | existing owner wins; pause only cross-links and holds selection                                                                   |
| pause races Submit for Review                                    | exact lock winner yields implementation containment or #229-owned Review; no orphan WIP/lease                                     |
| checkpoint fails or expires                                      | signed `checkpoint_not_recorded`; continue stop/quarantine and cleanup; preserve last trusted checkpoint                          |
| database fence/ACK/heartbeat says stopped                        | reject safe closure; require exact process/worktree/grant/tunnel proof                                                            |
| one target of multi-target request remains unknown               | parent stays partial; unsafe target/resources remain; safe targets are not rolled back or conflated                               |
| Blocking Proposal label changes without current decision         | newer hold remains; no Plan mutation or scope admission                                                                           |
| selection candidate dependency is in Review                      | wait on selected member until blocker Done; never scan to later Plan member                                                       |
| Review WIP reaches three after selection read                    | WF-230 transaction rejects/defers under locked counter; no lease or retry stampede                                                |
| WIP gate reopens for several waits                               | deterministic per-entitlement arbitration; only winning current transactions admit; ordinary auth is rechecked                    |
| changes-requested races next start                               | verdict-first invalidates selection; start-first creates hold and optional separately approved preemption; never two Sprint items |
| Runner reconnect appears healthy                                 | reconciliation only; no resume, old lease, failover, or In Progress transition                                                    |
| Incident resolves or reopens after resume                        | neither directly mutates Sprint; exact request/hold/resume commands preserve independent histories                                |
| paused entitlement is released without exact replacement         | reject; no general pool or second ordinary admission                                                                              |
| capacity policy downgrades below live use                        | existing leases continue; all new admission waits; no process kill                                                                |
| Sprint completion races changes-requested/Plan revision          | exact versions let only one win; completion rejects unless every current member remains Done and no rework/hold exists            |
| GitHub or Slack delivery fails                                   | workflow remains truthful; outbox retries; no fabricated mirror/notification success                                              |
| Incident identity appears in Sprint membership or DevTicket type | invariant violation; transaction rejects and audit/alert records sanitized attempted misuse                                       |

## Deterministic conformance and real-user evidence

This memo specifies future tests; it does not claim they pass today.

### Pure state and contract suites

- Exhaustively model Sprint lifecycle/condition, coordinator epochs, one-active/one-queued guards,
  Plan versions, selection tiers, holds, WIP values, entitlement/preset states, Review effects, and
  interruption target states. Assert no reachable state has two Active Sprints, two concurrent
  Sprint DevTickets, an Incident member, a direct Incident lifecycle mutation, or an old lease
  resume.
- Generate direct/transitive dependency DAGs, Review/Done states, blocking/bottom rework, and Plan
  revisions. Prove exact selection, no scan-ahead, and completion only when every current member is
  Done.
- Test exact idempotency and changed-payload collisions for every command, selection/activation
  retry, hold, Incident request, parent/target interruption, Slack action, and gate-open epoch.

### Real Postgres/RLS concurrency

- Use the application role and real tenant RLS. Race activation against ordinary replacement claims,
  pause against selection/claim/start/Review, changes-requested against next start, WIP decrement
  against multiple waits, Plan revision against selection, runner loss against resume, and
  completion against verdict/revision.
- Assert one coordinator epoch winner, one selection/claim owner, one phase-specific containment
  owner/finalizer, no cross-tenant disclosure, and state plus outbox atomicity.
- Prove Balanced-unavailable/Focused-required, Custom bounds, downgrade behavior, and activation
  barrier starvation prevention under current capability versions.

### Signed Runner and containment suite

- Use WF-232's real loopback WSS, deterministic no-model Harness Adapter, actual Git worktree and
  process descendants, Lease Enforcer, grant Broker, and preview fixture.
- Drive pause at pre-claim, provisioning, start-pending, just-started, running, Review handoff, and
  disconnect boundaries. Include lost ACKs, late receipts, sequence collision/gap, daemon/Enforcer
  death, `checkpoint_not_recorded`, partial grant/tunnel cleanup, dirty/diverged worktree, and
  multi-target partial failure.
- Require Blocked while execution may exist, Todo only after complete proof, and a fresh
  lease/fence/nonce/start receipt before In Progress. Assert no automatic cloud selection.

### Incident, Proposal, Slack, and mirror contracts

- Send signed, redacted Incident outbox fixtures with duplicate, stale, reordered, expired,
  cross-tenant, visibility-denied, changed-target, severity/priority mismatch, resolve, and reopen
  cases. Incident state never becomes a DevTicket/Sprint row.
- Drive blocking Proposal hold, concurrent human reclassification, accept-to-Backlog, merge
  Revision, Plan-revision grant, rejection/archive, hold expiry, and stale Slack decision. No path
  silently joins scope or mutates Incident.
- Use real signed Slack HTTP fixtures for approval/deny/replay/expiry/role loss/delivery retry. One
  exact action nonce may produce one Dev Board command; free text is discussion only.
- Verify the GitHub Sprint tracking issue and milestone contain only governed Goal/Plan/member and
  safe interruption summaries; no Incident is mirrored as Sprint work and no provider label starts
  or resumes execution.

### Canonical local-stack user acceptance

Run one authenticated Admin story through the production-equivalent local Docker stack at
`http://web.opzava.localhost:18088`, real Traefik, real Postgres/RLS/outbox/inbox, signed local
Runner, real Git worktree/process fixture, configured local Reviewer, GitHub/Slack fixtures, and the
real browser UI:

1. Configure a verified Balanced Runner, approve/queue/activate one Sprint, and explicitly claim one
   ordinary Ready DevTicket. Show one Sprint implementation plus one ordinary implementation with
   distinct worktrees, leases, assignees, and evidence.
2. Fill Review WIP to three. Prove the next Sprint selection and a separately requested ordinary
   claim wait without killing active leases; show the single Slack alert. Free one slot and prove
   deterministic, authorization-preserving retry with no duplicate claim.
3. Admit a redacted P1 coordination request from a visible Incident. In Opzava—without opening
   GitHub—inspect the Incident projection, exact affected work, evidence, requested action, and
   approval. Approve through the version-bound Slack fixture. Observe selection hold, checkpoint/
   fence/stop, truthful partial state, and the interrupted Card returning Todo only after complete
   containment; confirm there is no Incident DevTicket or Sprint membership.
4. Create the permanent fix as a separate Bug/Technical Task in Backlog. Prove it cannot start or
   join the Sprint before Ready and a Plan revision. Exercise a blocking Proposal and human decision
   in the same self-contained UI.
5. Return changes-requested for an earlier Plan member while the next member races admission. Prove
   deterministic top/bottom placement, no second Sprint implementation, and governed preemption only
   when separately approved.
6. Cut the local Runner network. Show Blocked/Execution Unknown, Slack summary, no cloud failover,
   signed reconnect reconciliation, old-process containment, explicit Resume, and a fresh claim/
   lease/fence/nonce/start receipt before the same Card returns In Progress.
7. Complete Review/Done for every current Plan member and show immutable Sprint history. Incident
   lifecycle remains separately controlled even if the linked fix is Done.

Screenshots alone, direct database writes, model narration, a heartbeat, or a mocked process cannot
satisfy this gate. The behavior evidence package belongs on the relevant Card/Sprint/Incident view
and includes exact contract/Plan versions, actor/source, command receipts, Runner facts, Review
refs, and safe provider/notification refs.

## Downstream #237 constraints

Final implementation graph #237 must create tracer-bullet slices that preserve these edges:

1. Sprint write model, coordinator epochs, holds, entitlement, activation wait, and deterministic
   selector depend on WF-230's aggregate/graph/command foundation.
2. Preset/capacity admission and live interruption depend on WF-232 enrollment/capability, delivery,
   Enforcer, process/worktree/grant containment, and reconnect.
3. Review-WIP retry and changes-requested coordination depend on the approved #229 Review contract;
   #233 does not implement a substitute.
4. Incident request/projection and operational remediation adapters depend on ADR-013/PRD-012/
   PRD-018 and must remain separate from DevTicket/Sprint storage.
5. GitHub Sprint mirror/worklog behavior depends on WF-231 health/outbox/reconciliation and cannot
   become authority.
6. Each implementation ticket must declare sad paths, races, behavioral contracts, real user-level
   local-stack evidence, human approval/Slack gates, and exact blocking edges. Deterministic state/
   protocol tests use no model tokens.
7. The graph must include reciprocal mappings for legacy dispatcher/Sprint/Incident assumptions in
   #147–#157 and must not close them before exact replacement coverage is audited.

## Rejected alternatives

| Alternative                                                  | Why rejected                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Persist Incident as DevTicket/Sprint work                    | merges independent lifecycles, leaks authority, and contradicts the locked boundary             |
| Let S0/P0 automatically preempt                              | priority/severity is not authorization and could kill unrelated work from stale or spoofed data |
| Create a new generic interruption finalizer                  | competes with WF-230/#229 ownership and risks double release or false containment               |
| Scan past a blocked Plan member                              | violates strict order and hides dependency/Plan defects behind apparent progress                |
| Restore an interrupted lease                                 | revives stale fence, process, credential, and worktree authority                                |
| Auto-claim ordinary work when capacity opens                 | replaces explicit human/agent claim authority with scheduler authority                          |
| Kill work on preset downgrade or Sprint activation           | turns policy/configuration into unrecorded preemption                                           |
| Treat Review WIP as Sprint-local                             | allows ordinary/Sprint admission to disagree about the same global gate                         |
| Treat Proposal blocking label as Plan truth                  | lets a model or label silently add/reorder approved scope                                       |
| Resume on Incident resolution or Runner heartbeat            | bypasses containment, Plan, dependency, WIP, health, and human decision checks                  |
| Atomically claim multi-target external containment succeeded | external stop/cleanup is a saga and partial failure must remain visible                         |

## Review methodology note

Two independent architecture plan audits challenged this resolution against WF-230, WF-232, ADR-017,
PRD-019, and the Incident owner documents. Their corrections are reflected in the final ownership,
lock, selector, pause/start, WIP, changes-requested, multi-target, and evidence contracts.

Short read-only advisory calls to `opencode-go/qwen3.7-max` and `opencode-go/deepseek-v4-pro` were
each hard-timeboxed. Both exited with timeout status `124` and returned no substantive payload, so
this memo attributes no finding or approval to either model.

## Resolution

#233 is resolved by the narrow Sprint Coordination model, per-Runner entitlement and activation
barrier, deterministic strict selector, Review-WIP-aware admission, explicit ordinary claim
boundary, versioned Incident/Proposal selection holds, phase-safe governed pause/preemption through
existing WF-230/#229 owners, Runner reconciliation with no failover, and explicit proof-gated resume
and fresh claim. Incident remains operational authority and never becomes Sprint work.

The contract is intentionally strict at the races: a pause can stop selection immediately, but it
cannot claim an already-admitted process stopped; changes-requested can reopen ordering, but it
cannot create a second Sprint lease; and a restored Runner or resolved Incident can invite
reevaluation, but neither can restart autonomous work without the current command gates.
