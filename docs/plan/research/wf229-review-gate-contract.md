# WF-229: Independent Review Gate contract

> **Independent Review Gate contract for #229; consumed by #237 TB-RV1. Reconciled with landed
> #230/#231/#232/#236 + ADR-017/PRD-019.**

**Issue:**
[Grill and lock the independent Review Gate contract](https://github.com/anthonykewl20/opzava/issues/229)

**Parent map:**
[Wayfinder: Dev Board implementation delivery graph](https://github.com/anthonykewl20/opzava/issues/228)

**Consumed by:** #237 synthesis graph tracer bullet **`TB-RV1`** (Review Gate implementation; Vertical G)
— `docs/plan/research/wf237-devboard-implementation-graph.md`.

**Prepared:** 2026-07-17 · **Landed/reconciled:** 2026-07-18

**Status:** **Landed #229 contract — designated current input for parent map #228, consumed by #237
`TB-RV1`.** This is target-behavior authority for the independent Review Gate; it does not claim that
the Review context, Reviewer process, exclusive Docker Review Lease, evidence store, containment-proof
machinery, governed merge saga, or the #230 external-result command extensions are implemented.
Review-Gate code paths — and `AdmitDone`, governed merge, `TB-GH7`, and `TB-RL1` — remain fail-closed
until `TB-RV1` ships, the #230 compatibility correction below is absorbed by `TB-01`/`TB-02`, and the
behavioral/cutover tests pass (`wf237:584-602`; `wf230:1538-1547, 2104-2106`; `DBF-134`;
`PRD-019:949`).

## Resolution

Every implementation must pass a fresh, independently operated local Review Gate before a governed
merge or Done admission. Review is performed by a separately authorized Reviewer in a clean,
dedicated review worktree against the user's enrolled shared local Docker stack. It evaluates one
immutable Review Attempt Snapshot through a versioned, deterministic, additive Review Check Manifest
and produces one immutable Review Evidence Package and terminal decision: `Pass`,
`Changes Requested`, or `Inconclusive`.

`Pass` is proof, not merge authority. Low- or Medium-risk work may be merged automatically only when
current policy permits. High- or Critical-risk work and eligible policy exceptions require a
single-use exact Merge Authorization. No approval can rewrite a Review decision, waive independent
Review, bypass suspected secret exposure, or bypass an unhealthy or unverifiable GitHub integration.
Done is admitted only after GitHub confirms that the exact reviewed merge result was merged into
`development` (`ADR-017:101-103`; `PRD-019:18-19, 28`).

This memo builds on the locked foundation and the DevTicket command boundary. It specifies Review
policy, resources, evidence, and owner facts. It does not create another lane implementation or a
second command surface.

## Source authority and landing reconciliation

This memo is the landed contract for Wayfinder issue #229. It is designated a **current input** of
parent map #228 and is consumed by the #237 synthesis graph as tracer bullet `TB-RV1`
(`wf237:584-602`). Per `CLAUDE.md`, a resolved memo stays current only while an active map designates
it current input until a named synthesis consumes it; #237's `TB-RV1` is that named consumer, and on
#237 resolution this memo freezes as planning evidence rather than parallel implementation authority
(`wf237:1037-1038`). A consumed or frozen disposition always wins; only a new replacement artifact may
later be explicitly designated current. Otherwise the accepted PRD, ADR, and foundation ledger remain
canonical.

**Landing reconciliation (2026-07-18).** The branch resolution this memo lands from was verified
against the now-landed siblings. The substantive Review Gate contract is consistent with all of them;
one forward-looking correction remains an open dependency on the DevTicket command model:

- `wf231` (`CodeHostMergePort`) dispatches **only** a #229-authorized exact merge, and its merge
  outbox exists **only after** #229 locks the Review Exit Containment Proof (`wf231:186, 914`);
  `Review issue #229 owns independent verdict and governed merge authorization` (`wf231:48, 168,
  331-332`). This memo defines the full merge-saga / PR-readiness / Merge-Authorization machinery that
  `wf231`'s merge outbox consumes — additive, not contradictory.
- `wf232` owns the enrolled Runner, the OS-supervised Lease Enforcer outside both Runner and daemon,
  per-attempt worktree generation, and signed Runner observations; it names the **exclusive
  shared-Docker Review lease** as a #229-owned resource (`wf232:41-49, 174`). This memo's exclusive
  Docker Review Lease and signed-Runner containment facts consume that boundary; a Runner receipt is
  trusted only under enrolled key + lease + nonce + monotonic sequence + exact contract version +
  repo/worktree/branch/SHA (`wf232:447-466`).
- `wf236` (Releases) is a separate gate that begins only after a DevTicket reaches Done; no staging
  or production behavior is inferred from Review, merge to `development`, or Done (`wf236:122-127`;
  `ADR-017:101-105`). A local Review image that verifies a locked SHA is Review evidence, not a
  Release artifact (`wf236:129-132`).
- `ADR-017` locks `Review is mandatory and independent` and `Done is admitted only after the
  applicable Review and approval have passed and the exact reviewed change is merged into
  development`, and that `Review #229 remains the only owner of independent verdict and exact merge
  authorization` (`ADR-017:101-103, 331-332`).
- `PRD-019` stories `18-19` (Done = reviewed + merged into `development`), `26` (system-controlled
  transitions), `42` (material contract change invalidates evidence), `65`/`69` (role separation;
  fresh independent Reviewer per Review), `80` (structured evidence summary + locked SHA), `92`
  (suspected secret exposure = unbypassable stop), `112-117` (Admin Reviewer tool/model config, all
  Reviews against the local Docker stack, evidence locked to exact commit SHA + contract version,
  self-contained evidence on the Card, authenticated expiring preview tunnel revoked on expiry/lease
  loss/runner disconnect/close), and `129-131` (Review WIP/Sprint serial, Slack at Review WIP limit)
  are the product authority this contract implements.

**One open #230 amendment (recommendation; owned by `TB-01`/`TB-02`).** The landed `wf230` still
carries (a) the pre-#229 `ReviewMergeAuthorization` umbrella placeholder (`wf230:154-155, 494`) rather
than the chronological record split this contract requires, (b) the earlier `global Review WIP
counter` wording (`wf230:486, 1114, 1458`) rather than the `(tenant_id, workspace_id)`-keyed counter,
and (c) none of the external-result command families (`PrepareExternalResultReview`,
`BlockExternalResultForRemediation`, `ReconcileExternalResultDone`, …) or the singleton Per-PR
Provider Action Mutex. The "#230 compatibility correction" section below is the authoritative target
that supersedes those; `TB-01`/`TB-02` must absorb it, and #237 must preserve the split before any
merge/Done path is enabled. Until then, `AdmitDone`/merge stay fail-closed (`wf237:598-600`;
`DBF-134`; `PRD-019:949`).

## Scope and ownership

| Concern                                                                                                                                                                                                               | Owner                                       | #229 contract                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In Progress-to-Review admission, Review Handoff containment, Review WIP membership, `ReviewChangesRequested`, `AdmitDone`, lane/queue transactions, idempotency, and aggregate locks                                  | DevTicket command boundary resolved by #230 | This memo supplies Review-specific preconditions, authenticated owner facts, decisions, evidence bindings, and failure dispositions consumed by those commands. It never writes a lane directly. |
| Review policy, Reviewer independence, Review Attempt lifecycle, check selection, evidence, Review access, Docker Review Lease, Review decision, exit containment, Merge Authorization, and governed merge eligibility | Review Gate                                 | Specified here.                                                                                                                                                                                  |
| Reviewer tool/model selection and Admin setup presentation                                                                                                                                                            | Admin Control Center investigation #244     | This memo defines the required configuration snapshot and authority, not its UI.                                                                                                                 |
| Signed local process, worktree, receipt, and enrolled-machine observations                                                                                                                                            | Runner boundary                             | Review accepts authenticated facts; it does not infer Runner truth.                                                                                                                              |
| PR, commit, check, repository review, merge, and branch facts                                                                                                                                                         | GitHub                                      | Review projects authenticated provider facts and never fabricates them.                                                                                                                          |
| Workflow, Ready contract, approvals, dependency/Sprint impact, and Done                                                                                                                                               | Opzava Dev Board                            | External actions are requests or facts, not alternate authority.                                                                                                                                 |

Review WIP, Reviewer Execution Capacity, and the exclusive Docker Review Lease are different
resources. A DevTicket may consume Review WIP while it waits for reviewer or Docker capacity.
Acquiring one never implies the others.

### #230 compatibility correction

#230's pre-#229 umbrella term **Review Merge Authorization** (`ReviewMergeAuthorization`) is not one
persisted owner fact and cannot bind a provider confirmation that does not yet exist (the landed
`wf230` still carries this placeholder at `wf230:154-155, 494`). This contract supersedes that
placeholder with distinct chronological records: Review Exit Containment Requirement/Proof; Provider
Result Deepening Capture; Mark Pull Request Ready Request; Convert Pull Request to Draft Request;
their provider facts and singleton Per-PR Provider Action Mutex; discriminated Merge Authorization
Requirement; Merge Authorization Request/Authorization when required; Merge Request; Provider Merge
Attestation; Post-Merge Remediation Wait Edge; and the separate External Result Reconciliation
Authorization Request/Authorization. The corresponding command families are
`PrepareMarkPullRequestReady`/`ReconcileMarkPullRequestReady`,
`PrepareConvertPullRequestToDraft`/`ReconcileConvertPullRequestToDraft`,
`AcceptReviewExitContainment`, `EvaluateMergeAuthorizationRequirement`,
`RequestMergeAuthorization`/`DecideMergeAuthorization`, `PrepareReviewMerge`/`ReconcileReviewMerge`,
and `RequestExternalResultReconciliationAuthorization`/
`DecideExternalResultReconciliationAuthorization`. Each command requires the applicable exact
records; no command reads a mutable or future-bearing umbrella authorization.

This contract's #230 command catalog names `ReviewChangesRequested`, `AdmitDone`,
`BlockExternalResultForRemediation`, and `ReconcileExternalResultDone` as the only exit-proof
consumers (the landed `wf230:1887-1888` carries the first two; the external-result pair is not yet
shipped). Successor launch only references and locks the proof under the generation CAS.
`FinalizeStoppedReviewAttempt` may create a distinct exit proof only for a nonterminal stopped
Attempt; it never consumes or rewrites a terminal Attempt. #237 (`TB-RV1`, and the `TB-01`/`TB-02`
DevTicket command model) must preserve the record split, allowed-command matrix, and idempotent
lock/consumption rules before any path, merge, or Done implementation is activated; any missing
integration fails closed.

#230's earlier "global" Review WIP wording is also corrected here (the landed `wf230` still reads
`global Review WIP counter` at `wf230:486, 1114, 1458`): the membership counter and every
admission/exit lock are keyed by exact `(tenant_id, workspace_id)`. The maximum remains three per
key. No tenant/workspace reads, blocks on, mutates, or discloses another key's membership or
saturation. The corresponding `wf230` amendment is an open dependency on `TB-01`/`TB-02`; #237 must
preserve that key in the final schema and command graph.

## Domain records

These are Review-internal records unless a later cross-context contract promotes them to the
ubiquitous language.

### Frozen Implementation Candidate and Review Attempt Snapshot

#230 first owns the **Frozen Implementation Candidate**: the immutable accepted implementation
checkpoint/SHA, original claim/lease contract binding, current contract head/equivalence lineage,
and exact Review Handoff identity. It is created with the prepared handoff; later `ReviewRequested`
proves that same handoff finalized without mutating the candidate. It exists before fresh Reviewer
authority and local Docker resources may be provisioned. #229 never rewrites it or requires GitHub
base/Reviewer/Docker facts inside `SubmitForReview`.

Before any code-producing source may reach Review, #230 also owns the source-discriminated current
**Deepening Module Artifact** admission pointer. The immutable artifact body is a governed Docs
document. Its `pre_merge` variant binds the exact Ready Contract Version plus Revision/carry-forward
lineage, Frozen Implementation Candidate commit/tree, changed/generated module inventory,
engineering-skill/tool/version, architectural findings, accepted actions or explicit no-change
disposition, signed implementation-harness receipt, and Docs ID/version/content hash. Its
`provider_result` variant binds the same governed fields to the Post-Merge Review Snapshot's
provider commit/tree/parents/target and signed capture Runner receipt, with no implementation
checkpoint. Dev Board owns the code-producing applicability decision, exact source-discriminated
current pointer, and stale/superseded disposition; Docs owns and exposes the immutable document
version; the Runner ledger owns only the signed tool receipt and component observations. Any bound
source, contract, module inventory, required skill, or policy drift stales the pointer. An explicit
non-code classification is version-bound, conflicts with any generated-code fact, and requires
explicit current absence of the Capture/artifact/receipt branch. The artifact is a pre-Review input,
never Review evidence, a Review Decision, or permission to Pass.

An already-observed provider result has no implementation final checkpoint. For code-producing
`provider_result` admission, #230 instead owns one durable **Provider Result Deepening Capture**.
Its prepare command binds the authenticated Provider Merge Attestation and exact repository,
commit/tree/parents/`development`, Sync Conflict, current Ready/Revision/equivalence lineage,
required Deepening skill/tool/policy, trusted Secret-Safe Repository Preflight and security-scan
generations, enrolled local Runner, dedicated source-read-only worktree, and process/grant/fence/
receipt generation. The Runner fetches and verifies that exact tree, runs Deepening locally through
the governed harness, and cannot mutate source or call a provider-write port. Finalization requires
the process stopped, worktree removed or quarantined cleanly, every grant revoked, and one immutable
governed Docs `provider_result` Deepening Module Artifact plus signed Runner receipt. Only then does
Dev Board select its current provider-result artifact/applicability pointer. Drift, cancellation,
disconnect, or Absolute Stop enters containment; no admission finalizer may release resources or
create Review authority until the capture is terminal and current. The capture artifact remains
architecture documentation, never Review evidence or Pass.

Every Review Handoff is discriminated. `pre_merge` binds the Frozen Implementation Candidate plus
implementation containment; `external_result` binds the Provider Merge Attestation, Sync Conflict,
Post-Merge Review Snapshot, adoption/preparation source, and exact containment disposition. Both use
the same prepared/cancelling/finalized/terminal lifecycle and neither grants Reviewer authority by
itself.

The transaction that finalizes the Review Handoff and emits `ReviewRequested`, or the governed
external-result admission transaction described below, also allocates one stable Review Attempt ID,
`attempt_generation`, and source-snapshot reference under exact `ReviewMembership` fields. The
Attempt begins `Queued`; the outbox is only a launch hint, never the creator of the run identity.
#230/#237 must add that atomic allocation to `FinalizeSubmitForReview` before Review admission is
enabled (open: `TB-01`/`TB-02` + `TB-RV1`). Therefore there is no finalized-handoff/no-Attempt
interval: a Material Revision or Absolute Stop that wins immediately after finalization can bind the
exact Queued Attempt and produce an authenticated explicit-no-resource containment observation when
no external authority was activated.

Each Queued Attempt references exactly one immutable source snapshot:

- `pre_merge` references the Frozen Implementation Candidate; or
- `provider_result` references a Post-Merge Review Snapshot for an already-observed result in
  `development`.

Only when Reviewer and Docker resources are available does launch atomically create one immutable,
discriminated **Review Attempt Snapshot**. Both kinds bind:

- `tenant_id`, `workspace_id`, DevTicket, aggregate version, and exact finalized source handoff
  (ordinary Review Handoff or external-result handoff);
- current Ready Contract Version, Ready Approval, content hash, and any approved non-semantic
  equivalence/carry-forward lineage, plus exact current Deepening Module Artifact ID/version/hash
  for `pre_merge`, or for `provider_result` either completed Provider Result Deepening Capture/
  artifact/receipt binding or the exact version-bound non-code fact plus explicit current
  Capture/artifact/receipt absence;
- Review policy version/hash and Review Check Manifest version/hash;
- Reviewer configuration snapshot, Reviewer principal, tool/model/version, and fresh session;
- enrolled local Runner and review-worktree identity;
- Review Access Grant identities and scopes, never their secret values;
- local Docker environment ID and generation plus image, Compose/configuration, schema/migration,
  seed/fixture, build, and relevant dependency-lock digests;
- clean runtime/data baseline attestation for every governed database, volume, object-store prefix,
  cache namespace, queue, and external test fixture, including reset/isolation policy, baseline
  generation/hash, fence, and residue scan; and
- snapshot creation/cutoff policy, expiry policy, and monotonic version.

The `pre_merge` variant additionally binds the configured repository, confirmed draft pull request,
target `development`, merge strategy/version, confirmed PR head, exact target-base, merge-base, and
deterministic strategy-specific merge-tree/result digest. The confirmed PR head must equal the
Frozen Implementation Candidate SHA exactly. Contract/Ready carry-forward lineage is bound
separately and never authorizes a descendant commit; any SHA difference stops provisioning, makes
the source fact stale, and requires a new Frozen Implementation Candidate. The `provider_result`
variant instead binds the exact Post-Merge Review Snapshot, Provider Merge Attestation, actual
repository, commit/tree/parents/target, provider delivery/snapshot identity, original
candidate/PR/strategy when known (otherwise explicit `not_available`), synchronization conflict, and
violation provenance. It never invents prospective base or merge-result fields for an action that
already occurred. Its manifest replaces prospective merge eligibility checks with authenticated
actual-result integrity and reconciliation checks; every other applicable
contract/security/local-stack check remains.

Provisioning is staged without circular authority:

1. Under the Review Membership lock, lock and reuse the already allocated Attempt ID/generation;
   reserve only its Snapshot ID, Reviewer slot, inactive grant IDs, Docker request ID,
   source/manifest/policy hashes, and one semantic launch key. No process or check starts.
2. The Docker reservation advances a fence and permits only the enrolled local Runner to attest the
   exact environment generation/digests. Grant reservations remain inactive and bind the Attempt,
   reserved Snapshot ID, requested scopes, and source/input digest.
3. One compare-and-swap transaction verifies every signed reservation/version, writes the final
   Snapshot and hash, binds the preallocated grants and Docker lease to that hash, emits their
   activation outbox, and remains `Provisioning`; it does not pretend external activation completed.
4. Only matching signed Runner/port activation receipts under those final bindings may atomically
   move the Attempt to `Running`. The first check is rejected before that transition.
5. Failure before final Snapshot commit performs bounded reservation cleanup and leaves no active
   authority; after exhaustion the Attempt becomes `Cancelled` with safe provisioning evidence and
   applicable containment, not a fabricated Review Decision. Failure after Snapshot commit but
   before `Running` also follows `Provisioning -> Containing -> Cancelled`: it persists the Snapshot
   and activation-failure evidence, revokes every reserved/partially activated resource, and
   produces no Review Decision. Only a failure after `Running` may reach the normal cutoff,
   `Inconclusive`, and completed containment path.

No check launches before final activation commits. A source or required launch fact that changes
while Queued/Provisioning supersedes that Attempt after containment; it never mutates an already
running snapshot. For `pre_merge`, the deterministic merge result is materialized from confirmed PR
head and exact confirmed base using the bound strategy; Review never tests only the feature branch.

Before the evidence cutoff, a change to any variant-required GitHub/source fact, contract authority,
policy, mandatory manifest, Review Attempt Snapshot, access grant, or Docker environment makes the
active Attempt stale and starts containment. After a Review Evidence Package commits, ordinary reuse
or mutation of the shared Docker stack and a default Reviewer-setting change do not rewrite or stale
historical proof. They expire live preview only. A completed package becomes ineligible for its
governed next action when its discriminated source snapshot or variant-required provider facts,
Ready lineage, merge strategy/version where applicable, current Review policy or mandatory-check
version changes; its policy freshness window expires; or an explicit security/integrity revocation
invalidates the bound Reviewer, tool, grant, environment, or evidence. Those invalidations are
separate append-only dispositions, never edits to the package.

### Review Attempt

A Review Attempt is the durable operational lifecycle for evaluating exactly one discriminated
source snapshot and one manifest. It has one of these operational states:

- `Queued`: admitted to Review WIP and waiting for a current Reviewer/configuration or resources.
- `Provisioning`: fresh Reviewer authority, clean worktree, and required local resources are being
  established.
- `Running`: checks are executing and authenticated evidence may be accepted until the cutoff.
- `Containing`: prior execution, Docker, tunnel, or artifact authority is uncertain or being
  revoked; Review Membership and Review WIP remain held.
- `Completed`: an immutable terminal Review Decision and Review Evidence Package were committed and
  every Attempt resource has authenticated Review Exit Containment Proof.
- `Cancelled`: no decision was produced; the applicable authenticated containment proof and cleanup
  completed.
- `Superseded`: source-snapshot or policy authority became stale and the applicable authenticated
  containment proof completed; immutable history remains. A stale Attempt waiting for that proof
  stays `Containing`.

One `ReviewMembership` record is `active` or `inactive`. While active it owns exactly
`current_handoff_id`, `current_handoff_version`, `attempt_generation`, nullable
`current_attempt_id`, and nullable `current_attempt_row_version`; the two current-Attempt fields are
null or non-null together. A prepared/cancelling ordinary Handoff is the current Handoff while the
Attempt pointer is explicitly absent. Finalizing ordinary admission atomically advances both Handoff
version and Attempt generation/pointer when `ReviewRequested` is emitted; external-result admission
atomically switches both pointers to its new Handoff/Attempt. A successor compare-and-swaps the
exact predecessor Handoff ID/version and Attempt ID/generation only after its terminal disposition,
applicable containment proof, no live inspection, no active External Result Review Preparation or
External Result Adoption Intent, no unresolved provider-result conflict, exact current
provider-attestation/source versions, and no `reserved`, `submitted`, or `outcome_unknown` Merge
Request. A `confirmed_merged` predecessor advances only through the governed `provider_result`
preparation path. Creation increments the generation and uses semantic identity
`(tenant_id, workspace_id, DevTicket, generation, source-snapshot hash, manifest hash, policy hash, purpose)`.
A uniqueness constraint on `(tenant_id, workspace_id, DevTicket, generation)` prevents duplicate
generation identities. The Review Membership's atomically paired `current_attempt_id`,
`current_attempt_row_version`, and `attempt_generation` permit exactly one current Attempt. Exact
replay returns that Attempt; a losing CAS or different payload creates no row, grant, lease, or
process. Historical Attempts remain addressable but never compete with the pointer.

Every terminal Review lane/Review WIP exit—including `ReviewChangesRequested`, `AdmitDone`,
`BlockExternalResultForRemediation`, and `ReconcileExternalResultDone`—atomically marks
`ReviewMembership` inactive, clears its current Handoff/Attempt IDs and row versions, and retains
the last `attempt_generation` plus exact terminal Handoff/Attempt references in the consuming
Activity, Blocked Episode, or Done fact. #230/#237 must apply that invariant in the same transaction
as lane change and keyed Review WIP decrement (open: `TB-01`/`TB-02`). A later governed re-entry
creates fresh active Review Membership using a generation greater than the retained historical
generation; it never treats a Blocked or Done ticket as still having a current Review pointer.

Operational state is not a Board lane. There is no `Review Waiting` or `Failed Review` lane.
Temporary unavailability before execution remains `Review / Queued`. An active Reviewer, Docker
lease, or preview becoming uncertain moves the Attempt to `Containing`, retains Review Membership
and Review WIP, atomically advances the fence, freezes the last accepted monotonic receipt
sequence/cutoff, and rejects every old-fence or post-cutoff receipt. A receipt racing the transition
counts only if its validation and acceptance commit before that same transition transaction; arrival
time alone is not authority. Active Reviewer, Docker, access, or tunnel loss normally produces
`Inconclusive` at a safe cutoff; Attempt completion and successor authority wait for containment.
The DevTicket stays in Review/Review WIP and may launch a successor Attempt after repair. It never
invents a Review-to-Blocked command. A Material Revision Interruption or Absolute Stop against
finalized Review uses #230's existing contextual Review Containment Proof/finalizer instead. Nothing
infers containment from a missed heartbeat alone.

On reaching an evidence cutoff, a Running Attempt atomically locks and rechecks its current Handoff/
Attempt pointer tuple and generation; source/policy/manifest versions; trusted repository-preflight
and security-scan result generations; exact Absolute Stop scope ID/version/generation or explicit
absence; and exact GitHub-health observation/version/generation. Only that CAS may freeze the last
accepted sequence, commit the immutable decision/Review Evidence Package, advance fences, and enter
`Containing`. If a suspected-secret or unhealthy/unverifiable-GitHub transition wins first, it opens
or advances the Absolute Stop and the cutoff writes no ordinary decision/package. If the cutoff wins
first, its immutable package remains history and a later stop/health/security transition appends its
exact disposition and contains later authority; it never rewrites the decision. Completed still
requires authenticated Review Exit Containment Proof. Every retry is a successor Review Attempt with
a fresh ID and snapshot; it never edits or resumes a terminal Attempt.

### Review Decision

Exactly one immutable terminal decision may be committed per Attempt that reaches a decision cutoff:

- `Pass`: every applicable mandatory check conclusively passed against the exact discriminated
  source snapshot and its variant-required facts.
- `Changes Requested`: implementation behavior, code, or evidence conclusively violates the still
  valid Ready contract and requires implementation rework.
- `Inconclusive`: infrastructure, authority, applicability, evidence, or a required real seam could
  not establish Pass or Changes Requested.

`Inconclusive` is not failure evidence against the implementation, is never coerced to `Pass`, and
does not return the DevTicket to Todo. Resolve the cause and create a successor Attempt while the
DevTicket stays in Review. If safe recovery requires leaving Review, containment and the #230
workflow command must complete first.

Decision precedence is deterministic:

1. An active or suspected Absolute Stop emits no ordinary Review Decision. It starts/retains
   Absolute Stop containment and safely records only the triggering check disposition.
2. Unverifiable source-snapshot identity, Reviewer/access authority, evidence integrity, mandatory
   policy applicability, or required owner fact yields `Inconclusive`; a possibly failing result
   cannot be attributed to an untrusted snapshot.
3. With identity and evidence integrity intact, any conclusive mandatory implementation/contract
   failure yields `Changes Requested`; other unknown checks remain listed and must run again on the
   successor source snapshot.
4. With no conclusive failure, any unknown, timeout after bounded retry, missing required evidence,
   or unsupported mandatory seam yields `Inconclusive`.
5. Only conclusive Pass for every applicable mandatory check yields `Pass`.

The first committed terminal decision under the exact Attempt/cutoff versions wins. Parallel or late
check completions return the recorded disposition and cannot change it.

### Review Check Manifest

The manifest is an immutable, versioned set of checks derived deterministically from:

- Ready outcome, scope, sad paths, edge cases, acceptance criteria, final behavioral contract, and
  user-level E2E expectations;
- Type, Work Areas, Priority, Severity where applicable, and computed Change Risk;
- dependency and Active Sprint bindings;
- diff/file/build/deployment classifications and generated-code indicators;
- security, data, migration, integration, accessibility, and compatibility flags;
- required GitHub checks/reviews and confirmed provider facts; and
- the current Review policy and supported local adapters/seams.

Each check declares a stable ID, applicability predicate, executor and real observation seam,
required inputs, timeout, bounded retry policy, evidence schema, and exact pass semantics. Policy
checks are additive. A Reviewer may record an advisory suggested check, but it cannot affect the
current decision. Any new decision-bearing check must be derived by versioned policy before the
Snapshot commits; a discovery after launch requires a policy/manifest revision and successor
Attempt. No Reviewer may delete or weaken a mandatory check. Unknown applicability, an unavailable
required adapter, a skipped mandatory check, missing evidence, or an unverifiable real seam yields
`Inconclusive`.

Universal categories are:

1. Ready contract/spec conformance, including every acceptance criterion and behavioral contract;
2. sad-path, edge-case, dependency, regression, and error-state behavior;
3. secret and sensitive-data scanning plus artifact/log safety;
4. repository integrity, exact source-snapshot identity and variant-required GitHub facts (pre-merge
   PR/base/result or provider-result commit/tree/parents/target);
5. user-level E2E expectations against the real authenticated local stack where the contract names a
   user-visible behavior; and
6. evidence completeness, provenance, and reproducibility.

Conditional categories include unit/contract/integration tests, database/RLS/migration behavior, API
compatibility, CI, accessibility, responsive/theme behavior, performance, security, GitHub
webhook/reconciliation behavior, Runner protocol, and deployment parity. Code-producing work also
requires independent Standards and Spec code review and a fresh architecture-deepening/harmony
assessment weighted toward the modules changed or generated. The Reviewer validates the exact
Deepening Module Artifact binding and independently re-evaluates the changed/generated modules; the
artifact may be linked as input provenance but cannot itself satisfy a check, become Review
evidence, or support Pass. Docs-only and Research/Spike work use an explicit manifest tailored to
their deliverable; they do not pretend code or browser checks ran.

Model judgment may explain risk and propose extra checks, but it is never the sole correctness
oracle. HTTP, browser, database row, file, CLI, log, websocket, GitHub provider, and signed Runner
facts are the authoritative observation seams as applicable.

## Reviewer independence and least privilege

Reviewer independence is enforced by identity and capability, not an avatar or tool name
(`PRD-019:65, 69`):

- The Reviewer principal and fresh session differ from the implementation principal/session and are
  re-authorized for every Attempt.
- The Review worktree is clean, dedicated, disposable, bound to the source snapshot, and
  source-read-only to Reviewer authority. Ephemeral test artifacts may be written only in approved
  locations.
- Reviewer authority inherits no implementation lease, named-secret grant, credential, environment
  variable, tunnel, shell context, agent conversation, or mutable workspace from implementation.
- The Reviewer may run manifest checks and emit signed observations. It cannot edit reviewed source,
  commit, push, force-push, rebase, resolve a conflict, change the manifest/policy, approve its own
  exception, invoke merge, or admit Done.
- The configured tool/model may match the implementation tool/model only when the principal,
  session, worktree, grants, and capabilities remain separately established. A different model is
  preferred, not an authority substitute.
- A mid-Attempt Reviewer configuration change does not mutate or falsify the unchanged source
  snapshot. Policy either lets the current Attempt finish under its frozen configuration or marks
  that Attempt stale/superseded after containment and requires a successor Attempt.

Any source mutation, generated fix, rebase, conflict resolution, force-push, changed merge result,
or changed observed provider result requires a new applicable source snapshot and fresh independent
Attempt. Pre-merge repair returns to implementation authority; a provider-result repair follows the
governed remediation path below.

### Review Access Grant

Real authenticated checks use fresh least-privilege Review Access Grants; they never reuse the
implementation actor's account, session, browser context, environment, or secret grant. Each grant
binds `tenant_id`, `workspace_id`, Attempt and snapshot, Reviewer principal/session, check IDs,
source-snapshot/manifest/policy hashes, local Runner, worktree, Docker fence, one-time nonce,
monotonic sequence, exact capabilities, approved SecretRef IDs and immutable credential versions,
opaque grant/activation hashes, issue/expiry, and revocation state.

Authenticated browser/E2E checks use a dedicated non-production test principal. `AuthPort` must be
extended to mint/revoke its short-lived session; `AuthorizationPort` admits the exact tenant,
workspace, role, manifest-check capabilities, and expiry; and `SecretsVaultPort` resolves only the
Ready-approved, version-bound SecretRefs into opaque injection grants. The enrolled local Runner
uses a trusted adapter outside Reviewer-controlled shell/browser authority to perform only the
required operation, denies raw credential, cookie/storage, environment, process-inspection, debug,
and arbitrary-egress access, sanitizes all output before model access, and returns signed
activation/revocation confirmation without exposing a value to the Reviewer/model or Opzava
payloads. The `gateway-broker` participates only if a check invokes OpenClaw and remains solely its
hot-path ACL; it is not the general session or credential owner.

The test principal has only the minimum role/capabilities for each check; an Admin-role fixture is
permitted only for Admin-only behavior and remains distinct from the Human Owner's account. Values
never appear in prompts, command lines, environment dumps, screenshots, evidence, or logs. A check
that cannot obtain or activate its required safe grant before `Running` is contained and Cancelled
with no Review Decision. If a Running check loses or cannot renew the bound grant, it may reach
Inconclusive after authenticated cutoff and containment. Implementation must add the named port
methods and owner-fact schemas before authenticated Review is enabled (open dependency on `TB-RV1`);
no adapter-local shortcut may mint a session or read a secret.

Grant reservation, activation, expiry, revocation, and external confirmation are durable facts.
Source/policy drift, Attempt containment, cutoff, completion, cancellation, Runner loss, an Absolute
Stop, or explicit revocation fences every grant. The applicable Review Containment Proof or Review
Exit Containment Proof must name each grant and prove AuthPort and SecretsVaultPort revocation plus
signed local Runner closure and every required upstream confirmation before a successor Attempt,
lane exit, Review WIP decrement, or Docker reuse.

### Review containment proof variants

Both proof envelopes reference the same immutable resource-containment fact: Attempt and reserved
Snapshot ID/final Snapshot when present, decision/package when present, local Runner, old/new
fences, process and worktree disposition, every grant/tunnel/lease/artifact-writer disposition,
confirmation-set hash, one-use nonce, monotonic cutoff/sequence, and policy version. A Queued
Attempt that never activated authority uses signed explicit-none observations for process, grant,
lease, tunnel, and artifact-writer resources; absence is never inferred merely because launch did
not start. They are not interchangeable:

- **Review Containment Proof** additionally binds one finalized Review Handoff, its discriminated
  `pre_merge` Frozen Implementation Candidate or `provider_result` Post-Merge Review Snapshot and
  variant-required PR/head/base or provider commit/tree/parents/target facts, and the exact Material
  Revision Interruption or Absolute Stop requirement. It authorizes only the corresponding #230
  finalizer/stop resolution, never an ordinary Review Decision exit, successor, merge, Done, or
  Review WIP release.
- **Review Exit Containment Proof** binds the exact Handoff/Attempt, the same discriminated source
  Snapshot and variant-required facts, and terminal decision/package when present. It is required
  for an ordinary cancelled or non-materially superseded Attempt, successor Attempt, Changes
  Requested exit, governed merge, or Done, and never substitutes for a Material Revision/Absolute
  Stop proof.

Each command locks the envelope kind, context ID, resource-fact hash, nonce, and current versions it
requires. Reusing the same cleanup observations through a differently bound envelope is allowed only
when both envelopes are independently authorized and persisted; one proof cannot be renamed into the
other.

For an Absolute Stop, the chronology is explicit. `ResolveAbsoluteStop` may consume only the
contextual Review Containment Proof and record the exact stop generation remediated; it retains the
DevTicket in Review/Review WIP and cannot start a successor. If the stop interrupted a nonterminal
Queued, Provisioning, Running, or Containing Attempt, new #230 command
`FinalizeStoppedReviewAttempt` locks the same Attempt/generation, consumed contextual proof,
remediation owner fact, immutable cleanup-observation hash, exact decision/package presence or
absence, no newer stop/Revision, no live inspection or resource authority, and current
Ready/source/policy facts. It independently persists a distinct Review Exit Containment Proof with
its own context/nonce. With no committed decision/package it terminalizes as
`Cancelled(reason=absolute_stop_remediated)`; with a decision/package already committed at cutoff it
preserves both unchanged and terminalizes as `Completed`. It records whether a successor is
eligible. A normal successor CAS then references and locks that exit proof while generation
advancement prevents a second successor; if source/Ready changed, ordinary Revision/Ready promotion
must finish first.

If the Attempt was already Completed, Cancelled, or Superseded when the stop opened, neither command
rewrites its terminal state or immutable decision/history. Stop resolution appends only
stop-remediation facts and, only when a Review Evidence Package exists, a new Evidence Disposition.
It creates no new containment finalizer or proof: Completed, Cancelled, and non-materially
Superseded Attempts retain any already-authorized Review Exit Containment Proof, while a materially
Superseded Attempt retains its contextual proof. A no-package Attempt receives no fabricated
disposition. Any required fresh successor uses the ordinary generation CAS after current
Ready/source/policy revalidation. A new stop recurrence, Material Revision, or successor race locks
the same Attempt/stop generations so exactly one path wins. Reusing cleanup observations does not
reuse either proof's authority, and no stop resolution can strand a nonterminal Attempt.

For ordinary Review lifecycle containment, mutable `ReviewExitContainmentRequirement` is the exact
request/acceptance record. It binds tenant/workspace, DevTicket, `current_handoff_id`,
`current_handoff_version`, `current_attempt_id`, `current_attempt_row_version`,
`attempt_generation`, purpose, required resource set, one-use nonce, and version. Its states are
`pending`, `accepted`, `cancelled`, or `superseded`. Only `accepted` names exact
`accepted_exit_proof_id`, `accepted_exit_proof_version`, proof nonce, and resource-fact hash. A
contextual `ReviewContainmentProof` for Material Revision or Absolute Stop remains a different
record and never fills these fields. When no ordinary exit requirement exists, commands lock the
explicit absence of any active `ReviewExitContainmentRequirement` for the exact tuple; they do not
use an umbrella "Review proof" fact.

The lifecycle is owned, not assumed. Every ordinary decision cutoff that starts containment
atomically creates or reuses one pending
`ReviewExitContainmentRequirement(purpose=ordinary_attempt_exit)` with the exact target terminal
disposition and decision/package presence. Every pre-Running cancellation or non-material
supersession does the same with explicit decision/package absence, including a Queued or
Provisioning Attempt that activated no Review resource. In the zero-resource branch the required
resource set names signed explicit-none slots for process, grant, lease, tunnel, and artifact
writer; it is never represented by requirement absence. The cleanup worker issues no external order
for an explicit-none slot and may otherwise issue only the bounded stop, revoke, close, and
reconcile orders named by the requirement. Signed Runner component observations and authenticated
Secrets, tunnel, Docker, and provider confirmations accumulate beneath it; none is independently the
proof.

`AcceptReviewExitContainment` locks the current Membership/Handoff/Attempt generation, requirement,
resource fences, monotonic cutoff/receipt sequence, confirmation set, target disposition, and
decision/package facts or explicit absences. In one CAS it composes and persists the immutable
Review Exit Containment Proof, marks the requirement accepted, and terminalizes the Attempt to the
exact target. Replay returns the same proof. Stale, missing, mismatched, or partial input leaves the
Attempt Containing and writes no proof, terminal state, resource release, lane, or Review WIP fact.
The Review Gate/Dev Board owns the composed proof; the Runner owns only its signed observations.

For a Material Revision, the matching #230 finalizer consumes only the exact contextual Review
Containment Proof and locks the Attempt, Handoff, Revision, Review Membership, Review WIP counter,
and generation. In the same transaction that moves Review to Backlog and decrements Review WIP, it
terminalizes a nonterminal Attempt as `Superseded(reason=material_revision)`, appends a stale
Evidence Disposition when a package exists, and advances the generation so no late receipt or
successor can revive it. An already-terminal Attempt is not rewritten. No Material Revision exit may
release lane/Review WIP while the #229 Attempt remains nonterminal.

### Review Exit Containment Proof

Every ordinary Pass, Changes Requested, Inconclusive, cancelled, or non-materially superseded
Attempt must contain its Reviewer process/session, review-worktree writers, Review Access Grants,
Docker Review Lease, any Attempt-owned tunnel, and artifact writers through an authenticated Review
Exit Containment Proof.

Database fencing or a missed heartbeat is not containment. The local Runner must sign
stopped/quarantined/no-process and worktree-writer facts; each owning port/provider inbox must
confirm grant and tunnel revocation; Docker cleanup must confirm the exact environment generation
and new fence. A stale, partial, unauthenticated, or replayed proof leaves the Attempt Containing
and Review WIP held. Post-package human inspection uses its own Inspection Record, lease, tunnel,
fence, and revocation lifecycle; it cannot reopen, rewrite, or become a resource of the
already-completed Attempt.

Normal completion follows `Running → Containing → Completed`. At cutoff the Review Gate commits the
immutable decision/package, creates/reuses the exact pending requirement, fences all authority, and
requests cleanup. `Completed` is reached only inside `AcceptReviewExitContainment`. Only after the
exact proof commits may:

- `pre_merge` Changes Requested invoke #230's Review-to-Todo transaction;
- Inconclusive launch a successor Attempt;
- `pre_merge` Pass request/consume Merge Authorization or submit a merge request;
- `pre_merge` `AdmitDone` perform Review-to-Done; or
- `provider_result` Changes Requested or a qualified persistent Inconclusive use
  `BlockExternalResultForRemediation`, while `provider_result` Pass uses
  `ReconcileExternalResultDone`.

The `pre_merge`-only `ReviewChangesRequested` and `AdmitDone` commands declare, lock, and consume
the exact Review Exit Containment Proof atomically with terminal Review Membership and Review WIP
exit, as #230 requires. The new external-result exits specified below require #237 to add
`BlockExternalResultForRemediation` and `ReconcileExternalResultDone` as exact allowed consumers
under their own atomic Review WIP-exit/Done transactions (open: `TB-RV1` + `TB-01`/`TB-02`); they
remain disabled until that command-schema extension ships. A successor Attempt and Merge
Authorization/outbox only reference and lock the predecessor/current proof; successor launch also
advances the Attempt generation so the proof cannot authorize another successor from the old
version. Confirmed-not-merged retry may reference the still-current proof but never reuse a consumed
Merge Authorization. Successor launch, `pre_merge` `ReviewChangesRequested`, merge dispatch, and
`pre_merge` `AdmitDone` also lock current Inspection Record/lease/tunnel explicit-none or
authenticated-closure versions, because post-package inspection is separate authority created after
the Attempt proof. No Review exit decrements Review WIP first and cleans up later.

## Review admission and preparation

#230 owns the transactional handoff. Review-specific admission requires:

1. an accepted final implementation checkpoint/receipt, clean committed head, and the locked current
   Secret-Safe Repository Preflight and security-scan result generations plus immutable accepted
   result IDs/hashes for the exact candidate tree; if either is unavailable, submission remains In
   Progress with no Review Membership, Review WIP, Handoff, Attempt, or Review Decision;
2. for code-producing work, one current immutable Deepening Module Artifact whose exact Docs
   version/hash, signed execution receipt, Ready/Revision lineage, candidate commit/tree,
   changed/generated module inventory, and required skill/policy binding match; otherwise one exact
   version-bound non-code applicability fact with no generated-code evidence. After authentication,
   authorization, and Secret-Safe Ingress, missing/stale/forged input leaves In Progress, persists
   or replays one terminal rejected command receipt, and writes no retry or Review authority;
3. enough repository identity to create/confirm a draft PR before Reviewer launch; PR/base/merge
   facts are not falsely asserted inside #230's admission transaction;
4. current Ready Approval/equivalence lineage and no live material Revision/interruption;
5. a reserved Review WIP slot from the `(tenant_id, workspace_id)`-keyed counter (maximum three);
6. a selected, currently permitted local Reviewer configuration and enrolled local Runner;
7. a provisionally derivable manifest; unsupported mandatory execution discovered before `Running`
   cancels the Attempt after containment with no Review Decision, while an authenticated mandatory
   check that discovers the unsupported seam after `Running` may reach Inconclusive;
8. no active Absolute Stop; and
9. containment of the implementation lease, credentials, tunnel, and process through #230's
   finalized Review Handoff before reviewer authority is provisioned.

Entering Review / Preparing Review does not release implementation resources. #230 first freezes and
fences the Frozen Implementation Candidate, binds the exact current Deepening Module Artifact/
applicability fact into that Candidate and the prepared Review Handoff, moves the lane, and
increments Review WIP. Only `FinalizeSubmitForReview`, after authenticated process/worktree
containment and every implementation credential/tunnel confirmation, releases implementation lease,
capacity, and worktree and emits `ReviewRequested`. #229 then confirms the draft PR/base/strategy,
reserves Reviewer Execution Capacity, inactive Review Access Grants, and the Docker Review Lease,
freezes and binds them through the final Review Attempt Snapshot CAS, activates the resulting
authority from authenticated receipts, starts the Reviewer process, and only then launches checks.

The Secret-Safe Repository Preflight is a trusted, deterministic, non-model scanner owned by the
repository/GitHub boundary. Every candidate tree and generated patch is scanned before any push or
draft-PR creation and again before Reviewer/model source access. If the first pre-admission scan is
unavailable, the submission remains In Progress with no Review Handoff/Review WIP/Attempt/decision;
it is not an Inconclusive Review. If the second scan is unavailable after Attempt allocation but
before `Running`, provisioning is contained and Cancelled with no Review Decision. After `Running`,
scanner unavailability may be Inconclusive. Suspected secret material at any point opens the
Absolute Stop; the raw value is never persisted or sent to GitHub, a prompt, or evidence. The local
Runner similarly scans and sanitizes stdout/stderr, browser storage, screenshots, traces, uploads,
and artifacts before model or evidence ingress. A later secret check in the Review Check Manifest
proves the complete reviewed result and artifact set; it does not replace these ingress boundaries.
#237 must bind preflight scanner/version, candidate tree hash, safe result hash, and expiry into the
handoff and Snapshot before the flow is enabled (open: `TB-RV1`).

When the tenant/workspace Review WIP counter is three, the submission remains In Progress and
mutable under #230's one durable retry intent; it does not enter a hidden lane and does not release
implementation authority. Once a slot is admitted, the DevTicket counts against its exact
tenant/workspace counter while Reviewer or Docker resources queue. Reaching three also blocks every
new ordinary or Sprint implementation claim in that same tenant/workspace through #230's locked
membership counter and sends one bounded safe Slack notification (`PRD-019:129-131`); it does not
affect another tenant/workspace or disclose its saturation, and it does not kill or preempt already
admitted implementation leases. Review exit and a competing claim/admission use the same keyed
counter version, so the counter always equals exact active Review Membership records and never
admits a stale fourth member or claim based on an old projection.

## Exclusive local Docker contract

Every Review uses the enrolled user's shared local Docker stack (`PRD-019:113`). Only one Attempt or
short human inspection may hold the **Docker Review Lease** at a time (`wf232:174`). The lease binds
environment ID and generation, Review Attempt Snapshot hash, local Runner, fencing token, command
nonce, monotonic receipt sequence, acquisition/heartbeat/expiry, clean baseline attestation, and
cleanup disposition.

Before any Attempt observes source behavior, the fenced holder must either create a disposable
Attempt-scoped runtime/data namespace or reset every governed shared store to the exact approved
baseline, then prove the baseline generation/hash and an empty residue scan. Residual database rows,
object-store objects, cache entries, queues, volumes, containers, ports, or external fixture state
outside that baseline reject launch and require contained cleanup plus a successor attestation.
Authorized writes produced after baseline attestation and before the evidence cutoff inside its
bound namespace are recorded as within-Attempt effects and do not self-stale evidence. Writes after
the evidence cutoff, plus unregistered or cross-Attempt writes, are rejected and contained.

Deterministic non-stack preparation—manifest derivation, repository hashing, static scanning, and
provider-fact collection—may occur before acquiring the lease. Anything that starts, stops,
rebuilds, seeds, migrates, resets, mutates, or observes source-snapshot behavior in the shared stack
requires the current fence.

Queue order is durable FIFO within policy priority, with a stable request ID as final tie-breaker.
Policy may reserve urgent security containment ahead of ordinary Review but cannot starve an older
request indefinitely; age-based promotion and a visible waiting reason are required. A lease is not
released on a missed heartbeat or process exit alone. Fence first, obtain authenticated process,
stack, tunnel, and artifact cleanup/reconciliation, then release. A stale fence, replayed nonce,
regressed sequence, mismatched generation, or late result is rejected and cannot contribute
evidence.

Heartbeat renewal, expiry detection, and cleanup are durable jobs, not in-memory timers. An expired
or crashed holder becomes a zombie lease: advance the fence, retain the lease and Review WIP, and
request signed local Runner attestations for process absence/quarantine, exact environment
generation and stack isolation/cleanup, tunnel revocation, and artifact-writer closure. Cleanup must
also prove the Attempt namespace destroyed or every governed shared store reset to a fresh verified
baseline with no residue before another lease can acquire the environment. Each proof binds Attempt,
environment, old/new fence, one-use nonce, monotonic sequence, and observed state. An offline or
unverifiable host remains `Containing` with human attention; no timeout force-releases the stack to
a successor.

Before decision cutoff/package commit, stack redeploy/restart, image/config/schema/fixture drift, DB
reset, untracked mutation, lease loss, or another writer changes the generation: the Attempt enters
containment and its partial evidence cannot contribute to a decision. After an immutable Evidence
Package commits, ordinary fenced stack reuse or later generation change expires live preview but
preserves the historical package and decision-time proof; source, policy, manifest, or unauthorized
mutation may still append a stale Evidence Disposition under their owning rule. Evidence from
different generations is never combined. Unrelated code work outside the shared stack continues.

Human preview does not hold the Review lease indefinitely (`PRD-019:116-117`). After a Review
Evidence Package exists, a preview authorized for the exact current Human Owner identity/version
acting through the exact current Admin authority identity/version reacquires a short exclusive
Docker inspection lease. If the original environment generation no longer exists, the system may
reconstruct the exact reviewed source in a new verified generation, but records a separate immutable
**Inspection Record** labeled reproduction; it never mutates the package or claims to be the
original Review environment. The tunnel is bound to the exact current Human Owner identity/version
acting through the exact current Admin authority identity/version, DevTicket, Attempt/package hash,
source hash, Runner, inspection lease, environment generation, and expiry. The preview response
re-verifies those hashes. Every request and stream renewal also reauthorizes tenant/workspace, the
exact current Human Owner identity/version acting through the exact current Admin authority
identity/version, lease/fence/generation, package disposition, and expiry, so source substitution or
lost authority cannot appear current. It is an authenticated Opzava deep link, never a bearer URL
copied to Slack. Admin authority revocation or Human Owner identity/version change, expiry,
disconnect, lease loss, source drift, Evidence Disposition invalidation, Absolute Stop, or close
revokes it and requires signed closure. Later stack reuse expires live preview but does not
invalidate historical Review proof.

## Review Evidence Package

The Card-visible Review Evidence Package is immutable, content-addressed, and secret-safe
(`PRD-019:80, 114-115`). Its commit atomically creates the initial `current` Evidence Disposition and
a CAS-protected current-disposition pointer `(package, disposition ID, disposition version)`. It
records:

- package/schema version, Attempt and decision IDs, source kind/Snapshot/hash, variant source
  identity (Frozen Implementation Candidate or Post-Merge Review Snapshot), and manifest hash;
- DevTicket, Ready Approval/equivalence lineage, repository, and the Snapshot variant's exact GitHub
  bindings: pre-merge PR/head/base/merge-base/result/strategy or provider-result attestation and
  actual commit/tree/parents/target;
- exact Review Attempt Snapshot, policy/manifest, Reviewer principal, tool/model/version,
  configuration/session, Review Access Grant/SecretRef-version, opaque activation, and trusted
  ingress-scanner bindings;
- local Runner, review worktree, Docker environment/generation and all required digests;
- each check's applicability, executor/seam, start/end, result, receipt cutoff, bounded retries,
  safe evidence refs, and artifact hashes;
- decision, safe reason, and whether policy requires later Merge Authorization or External Result
  Reconciliation Authorization; and
- creation/cutoff times, provenance, RLS scope, retention class, and its own content hash.

Evidence accepted after the cutoff may inform a successor Attempt but cannot rewrite a terminal
decision. Nothing later is appended to or re-hashes the package. Later facts are separate immutable,
linked records:

- an **Evidence Disposition** records `current`, `stale`, `superseded`, or `redacted_tombstone`,
  exact cause/versions, actor/owner fact, time, and predecessor; the package transaction creates the
  initial `current` row, each successor CASes the exact current pointer, first invalidation wins,
  and dispositions append rather than edit the package;
- a **Merge Authorization Request/Authorization** records the later human decision without becoming
  Review evidence;
- a **Merge Request/Provider Merge Attestation** records the separate request and authenticated
  GitHub outcome, exact commit/tree/parents/target/strategy, and relation to the package; the
  attestation is later for pre-merge Review and an immutable prior source for `provider_result`;
- an **Inspection Record**, **Post-Merge Review Snapshot**, or **External Result Reconciliation
  Authorization** records its later, separately governed inspection or reconciliation purpose; and
- the Dev Board's immutable completion fact records the exact package, containment proof,
  authorization branch, provider attestation, and a discriminated completion command kind/ID/
  version/receipt: `AdmitDone` for `pre_merge` or `ReconcileExternalResultDone` for
  `provider_result`.

The Card's Review Evidence view composes those immutable records by stable refs and labels their
different owners/times; "self-contained on the Card" never means mutating one historical object.
Exceptional redaction replaces forbidden artifact/content access with a separately authorized safe
tombstone/disposition while preserving the prior package identity and audit relationship.

The durable minimum needed to justify a Review decision and Done survives raw-log/artifact TTL.
Review-generated raw-log copies, copied raw diffs, tokens, credentials, secret values, signed
preview URLs, unredacted provider payloads, and sensitive environment output never enter the
package, Card, GitHub comments, Slack, comments, worklogs, or audit. GitHub continues to own its
repository-native source and PR diff; this rule forbids mirroring private Review copies/evidence
into GitHub. Tenant admission, authorization, and RLS apply to every package/artifact read. GitHub
receives only a sanitized structured Review summary and safe references, not the private artifact
bundle. The non-expiring minimum is the package/schema and Attempt/decision IDs; source/candidate,
Ready, manifest/policy, Reviewer, Runner and Docker binding hashes; per-mandatory-check
ID/applicability/result/seam and safe artifact hash; cutoff/fence/sequence; decision and safe
reason; provenance and timestamps. The linked non-expiring minimum also retains every Evidence
Disposition, applicable Review Containment Proof and Review Exit Containment Proof, Authorization
Request/Authorization, Merge Request/Provider Merge Attestation, applicable Inspection
Record/Post-Merge Review Snapshot/External Result Reconciliation Authorization, completion fact, and
supersession/redaction relation needed to audit current versus historical truth. Each record has its
own immutable schema/version/hash.

Content addressing is internal integrity, not a public lookup interface. Browser/API callers use
opaque tenant-scoped artifact IDs; hashes are returned only inside an already-authorized package.
Authorization and RLS run before lookup, cache, existence, size, or timing disclosure, and denial
never confirms whether another tenant or package holds a matching hash. Storage may blind or encrypt
cross-tenant deduplication keys; no global raw-hash endpoint exists.

## Review Decision and rework behavior

### Changes Requested (`pre_merge` only)

When the implementation violates a still-valid Ready contract, the decision supplies structured,
actionable findings: manifest check, contract clause, safe evidence ref, severity, expected
behavior, observed behavior, and suggested verification. Only an exact `pre_merge` Review Handoff,
Review Attempt Snapshot, and source-kind binding may use #230's `ReviewChangesRequested`, which owns
the atomic Review-to-Todo/Review WIP transaction, clears live execution authority, and requires a
fresh claim. A `provider_result` Changes Requested Review Decision is ineligible for that command
and uses only governed `BlockExternalResultForRemediation` Review-to-Blocked handling below.

The server derives Todo placement; the Reviewer cannot assert it:

- `ordinary_bottom` is the deterministic bottom of the exact dependency/Priority band in the last
  rework tier.
- `blocking_top` is permitted only when current graph/Sprint facts prove the rework blocks another
  DevTicket or the approved Active Sprint Goal; it is the deterministic front of the exact band in
  the first tier.

Stable dependency impact, criticality, Priority, queue versions, rank anchor, and DevTicket ID break
ties as defined by #230. Prior Attempts and evidence remain immutable.

A discovered defect in the Ready contract is not ordinary implementation rework. It creates a
governed material Revision, invalidates stale approval/evidence, completes required Review
containment, and normally returns to Backlog for shaping and Ready reapproval under #230. Repeated
Changes Requested decisions create an attention item offering continue, revise scope/contract, or
change implementation assignee through commands available in the then-current lane. Repetition never
approves, merges, lowers the manifest, or invents a finalized-Review cancel/archive exit.

### Pass and Inconclusive

Pass freezes one decision/package identity for merge evaluation. It does not decrement Review WIP,
merge, or admit Done. Inconclusive retains Review and Review WIP, records a safe cause and recovery
owner, and permits a fresh successor Attempt only after the cause is repaired and prior authority is
contained.

Every Changes Requested or Inconclusive decision atomically writes one deduplicated safe Slack
notification intent for the current Human Owner. Delivery failure retries independently and cannot
change the decision, Review/Review WIP, rework placement, or successor eligibility.

### Reviewer discoveries outside the bound contract

A Reviewer finding that is not a failure of the current Ready Contract or mandatory manifest does
not silently enlarge the current decision. The Reviewer invokes canonical `DraftProposal` with a
safe discovery summary/evidence, blocking or non-blocking assessment, affected Goal/DevTickets,
impact if ignored, suggested classification, bounded scope, dependencies, and requested human
decision. Its idempotency identity adds the exact Attempt ID/generation and stable finding
fingerprint to #230's source request/delivery plus draft intent ID, so replay cannot create a second
Proposal. The resulting `ProposalDrafted` owner event notifies the Lead Orchestrator. After the
required decision form is complete, the Lead Orchestrator invokes canonical `SubmitProposal`; its
transaction moves `Draft → AwaitingDecision`, emits `ProposalSubmitted`, and appends the
deduplicated safe Slack notification intent for that submitted event. The Notifications boundary
alone delivers Slack. The Lead Orchestrator never performs an untracked side effect, Draft is never
decision-ready, and neither actor may accept the Proposal by assertion.

The Human Owner may accept, merge, reject, or archive an AwaitingDecision Proposal. `AcceptProposal`
creates one Backlog DevTicket and creates or claims its verified GitHub Issue binding;
`MergeProposal` instead applies the Proposal to one existing DevTicket and creates no second ticket.
The Proposal itself has no lane and never becomes a DevTicket in place. New accepted work follows
ordinary shaping, GitHub binding, Ready Approval, and Backlog-to-Todo promotion. A non-blocking
finding therefore becomes new Backlog work only through Accept, or affects existing work only
through Merge. A blocking finding may place only an owner-supplied Sprint coordination hold while
the human decides; it joins or reorders an Active Sprint only through an approved versioned Sprint
Plan revision under #233. It cannot mutate the current Review Attempt, fabricate Changes Requested,
or preempt admitted work merely because the Reviewer called it blocking.

## Pull request readiness and repository review

The pre-merge pull request stays draft while independent Review runs. A draft pull request is never
merge-eligible. After a current `pre_merge` Pass and Review Exit Containment Proof, Opzava uses one
system-owned idempotent **Mark Pull Request Ready Request** before repository-review or merge
eligibility. It binds tenant/workspace, DevTicket/aggregate, Attempt, decision/package and exact
current Evidence Disposition, Review Exit Containment Proof, repository/PR, candidate-equal head,
base/merge result/strategy, Ready lineage, Review Handoff and current Review Membership and Review
WIP, Revision/interruption explicit-none versions, Inspection explicit-none/closure, Absolute Stop
explicit-none/remediated version, policy/mandatory-manifest versions, action, and semantic request
identity.

Its states are `reserved`, `submitted`, `outcome_unknown`, `confirmed_ready`, `confirmed_not_ready`,
`suppressed`, or `violated`. Reservation and pre-I/O dispatch independently lock and recheck every
binding, GitHub capability health, no Absolute Stop or live inspection, and the exact current
provider PR state. Drift suppresses without I/O; timeout after I/O reconciles the same request
through authenticated webhook/snapshot truth and never blind-retries. An already-ready exact PR
reconciles idempotently to `confirmed_ready`, including an external provider-ready fact, but that
provider fact grants no Review, approval, or merge authority. A later conversion back to draft,
head/base change, or source-affecting repository review invalidates eligibility and follows the
ordinary stale-evidence path.

Only authenticated `confirmed_ready` provider truth lets Opzava treat policy-required repository
reviews and merge protection as eligibility evidence. Opzava then re-reads required checks/reviews
and exact head/base facts; CODEOWNERS/requested-review behavior is never inferred from the earlier
draft state. Merge reservation, dispatch, and `AdmitDone` require the same current ready-state
generation and repository review facts. Provider uncertainty or a permanent inability to make the PR
ready retains Review/Review WIP, opens safe attention, and cannot be bypassed by human Merge
Authorization.

`confirmed_not_ready` is terminal for that request generation, not a retry signal. It appends one
safe repair owner/reason. Only a new authenticated provider-state or GitHub-health fact, or an
explicit governed repair disposition, may create a bounded successor generation. The successor locks
the terminal predecessor ID/version, current PR/head/base, policy/stop/inspection facts, and the
singleton per-PR mutex; its semantic identity includes predecessor and next generation. Exhaustion
retains Review/Review WIP and attention. There is no timer-only or blind provider retry.

If source/Ready, Evidence Disposition, policy/manifest, inspection, or Absolute Stop authority
invalidates a `confirmed_ready` PR before merge submission, the same GitHub command boundary creates
one idempotent **Convert Pull Request to Draft Request**. It binds the ready generation,
invalidating owner fact, exact PR/head/base, and semantic request identity; its lifecycle is
`reserved`, `submitted`, `outcome_unknown`, `confirmed_draft`, `confirmed_still_ready`,
`suppressed`, or `violated`. Reservation/dispatch recheck the invalidation and share the singleton
**Per-PR Provider Action Mutex**, keyed by tenant/workspace/installation/repository/PR, with ready
and merge reservation. Action kind or request identity does not create a second mutex. An
already-draft provider fact converges idempotently. Response loss reconciles authenticated provider
truth without blind retry. If merge submission won first, merge-result reconciliation owns the
interval and conversion cannot pretend cancellation. While draft conversion is unknown or
confirmed-still-ready, every merge path remains suppressed and safe attention/Absolute Stop policy
applies; no human Authorization can bypass it.

`confirmed_still_ready` is terminal for its request generation. A bounded successor requires a new
authenticated provider/health fact or governed repair disposition and binds the terminal predecessor
plus next generation under the same singleton mutex. Exhaustion retains Review and suppresses merge.
A material source Revision, correlated merge submission, or stronger stop may supersede the repair
path, but no negative terminal state is silently reopened.

## Merge Authorization

Only a current `pre_merge` Pass enters this section. A `provider_result` Pass cannot request a
future-merge authorization for an action already observed; it requires the distinct External Result
Reconciliation Authorization below. For pre-merge Review, current policy writes a current versioned
**Merge Authorization Requirement** for the exact Pass/package/disposition, exit proof,
confirmed-ready/repository-review facts, Ready/Revision/stop/inspection, the exact current Human
Owner identity/version acting through the exact current Admin authority identity/version, policy,
merge action, and strategy. Its discriminated result is exactly `required` or `not_required`; policy
or any bound-fact drift supersedes it. Missing request/authorization rows are never interpreted as
`not_required`. The evaluation follows:

- Low or Medium risk with a clean Pass, no admitted exception, no current attention requirement, and
  every repository policy fact satisfied may request policy-controlled automatic merge.
- High or Critical risk, or an eligible bypassable policy exception, requires an authenticated
  **Merge Authorization** from the exact current Human Owner identity/version acting through the
  exact current Admin authority identity/version. V1 has no second approver role.

The `required` branch is the only branch that may create a Merge Authorization Request and later
bind its exact Authorization. The `not_required` branch must prove explicit absence of both records
under the same locks. Merge reservation binds the discriminated requirement branch: required
consumes the exact approved Request/Authorization for that one semantic provider action;
not-required binds the current evaluation and absence. `AdmitDone` revalidates the same requirement
and its required consumed-human-record disposition or not-required absence. Neither branch may fall
back to the other.

Authorization is a separate, single-use, expiring record bound to tenant/workspace, the exact
current Human Owner identity/version acting through the exact current Admin authority
identity/version, DevTicket and aggregate version, Ready Approval/equivalence lineage, Review
Decision and Review Evidence Package hash, exact current Evidence Disposition ID/version/status,
Review Exit Containment Proof ID/version/resource-fact hash, repository/PR/head/base/merge-tree,
confirmed-ready generation, merge strategy/version and expected parent semantics, required GitHub
check/review fact-set ID/version/hash, policy and check-manifest versions, exact approved Request
ID/version/decision receipt, exact allowed merge action, nonce, issue/expiry, and audit record.
Replay, expiry, Admin authority revocation, Human Owner identity/version drift, candidate or policy
drift, a new Evidence Disposition, changed required checks, or a live Revision/interruption revokes
it.

Each exact binding has at most one active **Merge Authorization Request** with states `pending`,
`approved`, `rejected`, `expired`, `revoked`, or `consumed`. `approved` is active and nonterminal:
`pending → approved → consumed|revoked|expired`; the other terminal paths are
`pending → rejected|expired|revoked`. The first valid transition from each current state/version and
nonce wins; duplicate or losing delivery returns the recorded result. A request can be created only
after Pass, Review Exit Containment Proof, authenticated `confirmed_ready`, and current required
repository checks/reviews. Reject, refusal, expiry, or revocation retains the DevTicket in Review
and Review WIP, creates one visible attention item, and grants no merge authority. The Human Owner
may wait, request a new exact authorization after current-fact revalidation and a new
nonce/rationale, or initiate a governed material Revision. A terminal request is never reopened. Two
consecutive reject/expiry cycles require explicit Human Owner attention before another request; no
response is ever treated as approval.

The `pending → approved` transaction itself locks/revalidates the exact current Human Owner
identity/version acting through the exact current Admin authority identity/version,
candidate/Ready/aggregate, Pass/package and exact `current` disposition, exit proof, confirmed-ready
generation, required check/review fact set, policy/manifest, no live
Revision/interruption/inspection, and no Absolute Stop. It atomically writes the approved Request
transition and immutable Authorization. Binding drift terminalizes the request as `revoked` with a
safe `stale_binding` cause and no Authorization; the later merge reservation may never rely only on
what was true when the request was created.

Creating an approval request and every reject, expiry, or revocation owner fact writes one tenant/
recipient/source-event/version/kind-deduplicated safe Slack notification intent in the same
transaction. Its outbox carries only a safe summary and Opzava deep link; delivery failure retries
without changing Review, Review WIP, decision, request, or approval state.

Authorization never edits the decision. A bypassable exception changes policy input and produces a
new manifest/evaluation or successor Attempt; it cannot turn `Inconclusive` or `Changes Requested`
into `Pass`. Independent Review is never bypassable. Suspected secret exposure and unhealthy or
unverifiable GitHub integration are Absolute Stops and cannot create or consume a Merge
Authorization (`PRD-019:92`; `ADR-017:101-103`).

The Review Attempt Snapshot binds the repository policy-selected merge strategy and policy version,
including exact parent and expected tree semantics. Low/Medium automatic-merge eligibility exists
only as the current `not_required` Merge Authorization Requirement and is rechecked under lock;
strategy or policy drift stales Pass and supersedes that requirement. A `required` Authorization and
its approved Request are validated and consumed atomically with reservation of the one semantic
provider merge request. Expiry or role revocation before reservation rejects the request.
Reservation terminalizes the Authorization Request as `consumed`, but provider authority still has
not been exercised. Before provider I/O, the outbox rechecks the bound expiry and exact current
Human Owner identity/version acting through the exact current Admin authority identity/version. If
any are invalid, the Merge Request becomes `suppressed` without I/O; the consumed authorization
retains an append-only unused/suppressed disposition and is never reusable. Once provider I/O
begins, later expiry or role loss cannot erase that exact audit authority or authorize another
request; reconciliation may accept only the matching provider result. A provider result not caused
by that reserved request follows the external/mismatched-merge violation path.

The durable notification outbox records and attempts delivery for every approval request and
Review-failure notification; an eligible request may also carry an exact approve/reject action using
the existing authenticated Admin, target/hash, nonce, expiry, and audit contract. Slack carries safe
summaries and authenticated Opzava deep links only. It cannot configure a Reviewer, enroll a
machine, change GitHub or security trust, enter credentials/secrets, resolve an Absolute Stop, carry
raw logs/diffs, or expose a preview bearer token.

## Governed merge and Done

The governed merge saga accepts only a current `pre_merge` Pass; `provider_result` uses
reconciliation below. Merge is system-owned and idempotent behind the GitHub App, dispatched only
through `wf231`'s `CodeHostMergePort` (`wf231:186, 914`). A Merge Request has states `reserved`,
`suppressed`, `submitted`, `outcome_unknown`, `confirmed_not_merged`, `confirmed_merged`, or
`violated`; all provider deliveries reduce into that one state machine by semantic request ID. A
definitive provider rejection is `confirmed_not_merged`, not a second ambiguous terminal.

1. Lock/reload the current candidate, Attempt, decision/package, Ready Approval, active
   Revision/interruption explicit-none versions, Review Handoff, Review WIP, current discriminated
   Merge Authorization Requirement, current Review policy owner version and mandatory-manifest
   eligibility version, current Secret-Safe Repository Preflight and security-scan current-result/
   current-pointer generations plus their immutable accepted result IDs/hashes, exact authenticated
   Review Exit Containment Proof, exact latest Evidence Disposition ID/version with status
   `current`, current Inspection Record/lease/tunnel explicit-none or authenticated closure
   versions, exact current Mark Pull Request Ready Request/`confirmed_ready` provider generation,
   exact approved Request/Authorization plus the exact current Human Owner identity/version acting
   through the exact current Admin authority identity/version when `required`, or their explicit
   absence when `not_required`, the singleton Per-PR Provider Action Mutex, and GitHub health/
   reconciliation facts. Human records and the governed outbox reference and lock the exact proof
   and disposition; they do not consume either. #230's `AdmitDone` consumes the proof only at
   terminal Review exit.
2. Reconfirm the ready PR identity/generation, exact head/base/merge-base/merge result, required
   GitHub checks and repository reviews after ready, no return-to-draft, no force-push/base drift,
   and no Absolute Stop.
3. Reserve the singleton Per-PR Provider Action Mutex generation and one semantic merge request/
   idempotency identity. Immediately before provider I/O, the outbox worker locks and rechecks every
   step-one/two version, including both preflight/security-scan pointer generations and accepted
   result IDs/hashes, the exact latest Evidence Disposition remains the bound `current` record, the
   bound Authorization expiry and exact current Human Owner identity/version acting through the
   exact current Admin authority identity/version where required, the current policy owner version
   and mandatory-manifest eligibility, plus no active inspection authority. If drift, evidence
   invalidation, authorization invalidity, a Material Revision, an Absolute Stop, GitHub
   degradation, or new inspection wins first, it performs no provider I/O and terminalizes the
   request as `suppressed`; consumed human Authorization is not reusable. Otherwise it marks/submits
   once. A timeout or transport failure after I/O begins is `outcome_unknown`, never a safe retry.
4. Reconcile authenticated provider truth with bounded exponential-backoff attempts. Exhaustion
   opens human attention and continues lower-frequency reconciliation while the DevTicket remains
   Review; it never emits Pass failure, Inconclusive, Done, or a second merge request. Only GitHub
   confirmation of merged or confirmed-not-merged resolves the unknown provider outcome.
5. Verify the provider merge target is `development` and the merge commit/tree matches the reviewed
   deterministic result. #230's `AdmitDone` must again lock the exact latest Evidence Disposition as
   the same `current` record, current policy owner/mandatory-manifest eligibility, the same current
   preflight/security-scan pointer generations and accepted result IDs/hashes, and every other
   current authority fact including the same confirmed-ready generation/repository-review facts and
   the exact current Human Owner identity/version acting through the exact current Admin authority
   identity/version when human Authorization was required. Only then may it atomically decrement
   Review WIP and move Review to Done (`ADR-017:101-103`; `PRD-019:18-19`). Human Owner transfer or
   Admin authority revocation before this final CAS rejects the transition with zero proof
   consumption, Review Membership mutation, Review WIP decrement, or Done effect; immutable merge
   and authorization history remain auditable and provider truth follows governed reconciliation
   rather than stale authority.

If reservation, dispatch, or `AdmitDone` observes that the package's policy or mandatory-manifest
eligibility is no longer current, the same command CAS-appends a stale Evidence Disposition and
advances the current pointer before returning or suppressing. It performs no provider I/O or Done in
that transaction, so asynchronous projection lag can never leave a stale Pass actionable.

Neither Reviewer nor Execution Assignee has merge or Done authority. A crash after GitHub accepts
the merge but before Opzava persists confirmation is recovered by delivery/snapshot reconciliation
using the same semantic request; no second merge is attempted.

Once submission begins, provider-outcome reconciliation owns the merge-pending interval.
Candidate-affecting, Revision, archive, and ordinary Review-exit commands may prepare/fence as their
own policy requires but cannot finalize against an unknown provider result. An Absolute Stop starts
containment immediately and blocks Done; it cannot pretend the already-submitted request was
cancelled. Reconciliation closes the provider interval first, then:

- `confirmed_not_merged` lets the prepared winning command re-evaluate under current locks;
- `confirmed_merged` for the exact reviewed result may use ordinary `AdmitDone` only when the same
  candidate, Ready/Revision/interruption explicit-none versions, proof, Inspection explicit-none or
  authenticated closure, exact latest Evidence Disposition, policy, authorization, and GitHub health
  remain current; or
- any exact merge whose authority was made stale by a winning Material Revision, Absolute Stop, or
  other current-fact change becomes a governed-but-stale result conflict. It preserves the pending
  command, freezes a Post-Merge Review Snapshot, and follows the External Result Review Preparation
  path after the Absolute Stop is resolved and/or the new Ready authority is current. It never uses
  stale `AdmitDone`. A different tree already in `development` follows the mismatched
  external-result path. A result on any other target is not a `provider_result`; it remains a
  wrong-target conflict and must produce a governed candidate plus ordinary `pre_merge` Review
  before entering `development`.

`suppressed` or `confirmed_not_merged` terminalizes that request. Before any new request, Opzava
revalidates the exact candidate, package/disposition, strategy/policy, checks, PR/base/merge result,
Review Exit Containment Proof, and GitHub health. Candidate or merge-result drift requires a new
Review Attempt. An automatic path performs a fresh current policy evaluation; a human-authorized
path requires a new single-use Authorization because the prior one was consumed at reservation.
Attempts are bounded by versioned policy; exhaustion retains Review/Review WIP and opens attention
rather than looping.

Base/head movement, force-push, rebase, conflict repair, changed merge tree, invalidated check,
policy change, or material Revision stales Pass and Authorization before merge. Automated
merge-conflict repair is implementation work in an isolated worktree and must produce a new
candidate and fresh Review.

An external/manual merge, GitHub Action merge, wrong target, or provider result that differs from
the reviewed tree creates a visible policy violation, synchronization conflict, and **Needs Human
Approval** attention. It cannot retroactively forge Pass or Done. A merge to a wrong target remains
outside Done, never creates a Post-Merge Review Snapshot for that target, and requires a governed
candidate/ordinary `pre_merge` Review and merge to `development`. Only an actual result already in
`development` may enter the `provider_result` path below.

An actual result already in `development` uses explicit downstream extensions to #230; this memo
does not claim those commands already exist. One **`external_result` Review Handoff** is the
`ReviewHandoff(kind=external_result)` subtype. It binds the provider attestation, sync conflict,
source lane/handoff, implementation or prior-Review containment owner, Post-Merge Review Snapshot,
and the exact Human Owner decision where adoption is required. It is not reusable ordinary
implementation authority.

As soon as authenticated provider truth identifies an actual code-producing result in `development`,
Opzava may prepare its Provider Result Deepening Capture independently of either handoff/adoption
saga. The capture must complete and remain the current applicability pointer before any
external-result finalizer below; no command may demand an implementation checkpoint for this source.
Capture failure or drift leaves the existing lane/Review Membership/intent state intact and grants
no token consumption, resource release, or Review authority.

For an existing Review member, `PrepareExternalResultReview` creates one durable **External Result
Review Preparation** (`ExternalResultReviewPreparation`) and drives its prepare/finalize/cancel
saga. Prepare creates exactly one live branch state, `containing_implementation` for a
prepared/cancelling Handoff with an explicit-null Attempt pointer or `containing_review` for a
finalized Handoff with the exact current Attempt. Either live state transitions once to terminal
`finalized` or `cancelled`; finalize/cancel race on the same record version, and a stale/conflicting
request writes no replacement record or terminal fiction:

1. The prepare transaction first requires the correlated Merge Request to be absent, atomically
   terminal `violated`, or terminal `confirmed_merged` with the exact Provider Merge Attestation
   already classified as a governed-but-stale result. It never rewrites that terminal provider
   truth. A `submitted` or `outcome_unknown` request remains exclusively owned by its provider
   reducer. It always locks the DevTicket, Review/Review WIP, Ready/Revision/interruption versions,
   sync conflict, provider attestation, Inspection authority, exact Absolute Stop explicit-none or
   remediated version; membership `current_handoff_id`, `current_handoff_version`, and
   `attempt_generation`; and the named Handoff row/state. For a finalized Handoff it additionally
   locks non-null `current_attempt_id`, `current_attempt_row_version`, the named Attempt row, and
   either one existing compatible pending or accepted `ReviewExitContainmentRequirement` ID/version
   and its accepted-proof fields, or the explicit absence of any active requirement for the tuple. A
   compatible requirement is either (a) `purpose=external_result_switch` bound to this exact
   Preparation intent or (b) `purpose=ordinary_attempt_exit` from the exact ordinary cutoff, with
   the same membership/Handoff/Attempt tuple, required-resource set, target terminal disposition,
   and decision/package presence. Preparation adopts the second branch by immutable reference; it
   never reparents it, changes its purpose/nonce, or cancels it. Any other active purpose, intent,
   tuple, resource set, or terminal binding is a hard conflict. It also locks one phase-specific
   evidence branch: before a decision cutoff/package exists, explicit absence of decision, package,
   Evidence Disposition, and current-disposition pointer; after cutoff/package, the exact latest
   Evidence Disposition and current pointer. For a prepared/cancelling Handoff it instead locks null
   `current_attempt_id` and `current_attempt_row_version`, explicit absence of an Attempt row,
   Review Attempt Snapshot, decision/package, Evidence Disposition, current-disposition pointer, and
   any active `ReviewExitContainmentRequirement` for that current tuple; those facts cannot be
   invented before finalization.
2. If the ordinary Review Handoff is `prepared` or `cancelling`, the intent becomes
   `containing_implementation`; the Preparation records that branch while the existing Handoff
   remains the durable owner of its implementation Runner stop/quarantine, credential/tunnel
   revocation, capacity, and worktree confirmations. No Review Attempt is assumed. If the Handoff is
   `finalized`, the intent instead contains the current Attempt by atomically creating a pending
   `ReviewExitContainmentRequirement(purpose=external_result_switch)` when prepare locked explicit
   absence, or reusing an exact compatible same-intent or ordinary-cutoff requirement under the
   rules above; its accepted proof must later name `accepted_exit_proof_id`,
   `accepted_exit_proof_version`, proof nonce, and resource-fact hash. The prepare transaction also
   installs its active Preparation ID/version as the Handoff guard. Both branches retain Review
   Membership and Review WIP and reject new Reviewer launch, `ReviewChangesRequested`, merge, Done,
   implementation claims, material-Revision acceptance/finalization, execution-loss transition, and
   every ordinary Handoff finalize/cancel/expire/finalize-cancel command until Preparation finalize
   or cancel clears that exact guard. Neither Revision nor loss may terminalize the guarded Handoff,
   clear Membership pointers, decrement Review WIP, or take over the Preparation's requirement/proof
   or containment resources.
3. `FinalizePrepareExternalResultReview` uses a distinct phase idempotency key and one CAS after the
   signed confirmations arrive. It rechecks every prepare version, the exact completed current
   Provider Result Deepening Capture/artifact/receipt/Docs binding for the authenticated provider-
   result commit/tree or its exact current non-code applicability fact plus explicit
   Capture/artifact/receipt absence, current preflight/security-scan generations, current Ready,
   resolved interruption/stop, current provider attestation, no active inspection, contained
   implementation or Review authority; old membership `current_handoff_id`,
   `current_handoff_version`, and `attempt_generation`; and the branch-specific
   `current_attempt_id`, `current_attempt_row_version`, Attempt row, plus pre-cutoff absence or
   post-cutoff disposition facts. A finalized-Handoff branch also requires an accepted
   `ReviewExitContainmentRequirement` and its exact `accepted_exit_proof_id`,
   `accepted_exit_proof_version`, proof nonce, and resource-fact hash; the prepared/cancelling
   branch requires explicit absence of `ReviewExitContainmentRequirement` and any Attempt proof. An
   `external_result_switch` Requirement created from absence binds target
   `Superseded(reason=provider_result_observed)` when no decision/package exists or `Completed` when
   immutable decision/package facts exist. `AcceptReviewExitContainment` reaches that exact terminal
   state before this finalizer. The finalizer applies exactly one branch: (a) for a
   prepared/cancelling Handoff with the locked no-Attempt facts, it changes that old Handoff to
   terminal `superseded`, binds the provider-attestation/external-result ref after implementation
   containment, and in the same CAS finalizes the old Execution Lease fence and releases its
   capacity/worktree exactly once from signed stopped/quarantined or explicit-no-process
   confirmations; it invents no old Attempt and preserves any preassignment; (b) for a finalized
   Handoff with an accepted proof and an exact already-terminal pre-cutoff no-decision Attempt at
   `Superseded(reason=provider_result_observed)`, it preserves that terminal Attempt; or (c) for a
   finalized Handoff with an accepted proof and an exact already-terminal post-cutoff
   decision/package Attempt at `Completed`, it preserves that terminal Attempt and its immutable
   facts. Any nonterminal or differently terminal Attempt is a stale-binding conflict with zero
   writes. For every old Review Evidence Package, the same transaction appends a stale Evidence
   Disposition bound to the authenticated provider result and advances the old package's current-
   disposition pointer; a no-package Attempt has no fabricated disposition. A finalized old Handoff
   remains immutable. The same CAS creates the finalized `external_result` Review Handoff,
   Post-Merge Review Snapshot, and allocated Queued `provider_result` Attempt/generation, then sets
   membership `current_handoff_id`, `current_handoff_version`, `current_attempt_id`,
   `current_attempt_row_version`, and `attempt_generation` to those exact new records. A stale or
   losing finalizer returns the recorded conflict with zero writes; only the separately authorized
   cancel/reconciler may later terminalize the prepared intent after its resources are contained. No
   partial external handoff survives. After authenticated authorization and Secret-Safe Ingress, a
   missing/stale/forged capture persists or replays one terminal rejected command receipt and
   performs none of the containment-release or pointer effects above.
4. `CancelPrepareExternalResultReview` has a distinct semantic key and may terminalize that prepared
   intent only after its implementation/Review containment owner and all grants, Docker, tunnel, and
   artifact writers are confirmed closed. It preserves Review Membership and Review WIP and the
   provider violation, restores no old Attempt or authority, and requires a fresh versioned prepare
   or the governed remediation path. Cancel/finalize race on one intent version and exactly one
   wins. Cancellation marks only a pending/accepted
   `ReviewExitContainmentRequirement(purpose=external_result_switch)` owned by this intent terminal
   `cancelled` while retaining its proof/history. An adopted `ordinary_attempt_exit` requirement and
   proof remain unchanged and available to their ordinary consumer. Cancellation clears the
   active-preparation guard and leaves membership `current_handoff_id`, `current_handoff_version`,
   `current_attempt_id`, `current_attempt_row_version`, and `attempt_generation` unchanged; only
   then may the ordinary successor CAS re-evaluate current provider/conflict versions.

Adoption from outside Review uses a separate durable **External Result Adoption Intent** and never
borrows #230's Blocked/Absolute Stop-only containment purpose. Its lifecycle is `preparing`,
`containing`, `waiting_for_wip`, or `cancelling`, followed by exactly one terminal `finalized` or
`cancelled` outcome. `preparing` may finalize immediately only with every exact explicit-none or
contained fact; any fence/stop effect first makes it `containing`; Review WIP saturation records
`waiting_for_wip`; cancellation after side effects remains `cancelling` until the same authenticated
containment set closes:

1. `PrepareAdoptExternalResultForReview` is permitted only from ordinary, non-Sprint `Todo` or
   `In Progress`. Backlog is ineligible because it has no current Ready Approval. The command
   requires current Ready Approval, every dependency Done, no archive overlay, Absolute Stop
   explicit-none/remediated, no Blocked Episode, a Needs Human Approval Request approved by the
   exact current Human Owner identity/version acting through the exact current Admin authority
   identity/version, and a free or waitable Review WIP path. A Todo source additionally locks exact
   Pre-Start Admission Loss and Start Rejection Containment explicit-none or terminal-contained
   versions plus explicit-none/closed process, grant, tunnel, worktree-writer, artifact-writer,
   Claim Attempt, Execution Lease, and claim-created capacity facts. It creates one durable External
   Result Adoption Intent in `preparing`, binds but does not consume the exact approved
   Request/token ID/version and exact current Human Owner identity/version acting through the
   exact current Admin authority identity/version, locks the sync conflict/provider attestation/source
   versions, and projects `External Result Adoption Pending` while preserving the visible source
   lane. This pending record owns a new #230 `external_result_adoption` containment purpose and
   blocks any new claim/start.
2. Its worker may fence/stop uncertain execution and revoke credentials/tunnels through only that
   bound Adoption Intent and signed Runner/port receipts. It never performs external I/O inside a
   domain transaction and never interprets a timeout as containment.
3. `FinalizeAdoptExternalResultForReview` has its own semantic key and atomically rechecks the exact
   current Human Owner identity/version acting through the exact current Admin authority
   identity/version and its bound approval, the exact completed current Provider Result Deepening
   Capture/artifact/receipt/Docs binding for the authenticated provider-result commit/tree or its
   exact current non-code applicability fact plus explicit Capture/artifact/receipt absence, current
   preflight/security-scan generations, Ready, dependency graph/completions, lane/queue, assignment,
   Claim Attempt, Execution Lease/fence/capacity/worktree, Pre-Start Admission Loss, Start Rejection
   Containment, every process/grant/tunnel/worktree-writer/artifact-writer disposition,
   Revision/interruption, Sprint memberships, sync conflict/provider attestation, Absolute Stop,
   containment confirmations, aggregate version, and Review WIP. Only then does it consume the same
   bound approved Needs Human Approval Request's single-use exception token in the same transaction.
   For an In Progress or execution-uncertain source it terminalizes the exact Claim Attempt as
   `fenced`, advances/finalizes the Execution Lease fence, and releases only after signed
   stopped/quarantined process, revoked grant/tunnel, contained worktree-writer, and
   capacity-release confirmations. For Todo it requires no live Pre-Start Admission Loss or Start
   Rejection Containment and the exact explicit-none/terminal-contained resource facts bound during
   prepare; it never infers absence from the lane. The current assignee may remain as implementation
   attribution on the Review Card, but assignment grants no execution or Reviewer authority; the
   transaction records that non-authoritative disposition explicitly. It then enters Review,
   increments Review WIP, releases the contained lease/capacity/worktree, consumes the Adoption
   Intent, creates the finalized `external_result` Review Handoff, Post-Merge Review Snapshot, and
   Queued `provider_result` Attempt, and creates one active `ReviewMembership` with a generation
   greater than any retained historical generation and exact `current_handoff_id`,
   `current_handoff_version`, `current_attempt_id`, and `current_attempt_row_version` for those new
   records. All of those writes and the token consumption share one CAS. At Review WIP three it
   remains pending outside Review with no token consumption, claim/lease terminalization, assignment
   change, resource release, or Review WIP increment; a monotonic retry revalidates all owner facts.
   Revoked, expired, drifted, or already-consumed approval leaves the Intent contained and requires
   a fresh exact request/rebind command or governed cancellation; it cannot inherit a replacement
   token silently. After authenticated authorization and Secret-Safe Ingress, an invalid capture
   writes one terminal rejected command receipt and no token, resource-release, lane, Membership,
   Handoff, Attempt, or Review WIP effect. A replay returns the committed finalization; a different
   adoption or any token replay is rejected. `CancelAdoptExternalResultForReview` has its own phase
   key and never restores old execution authority. Before any fence/stop effect, it atomically
   terminalizes the Intent and bound Request as `revoked(reason=adoption_cancelled)`, leaves the
   original Todo/In Progress lane, assignment, claim, lease, and resources unchanged, and leaves the
   token unconsumed but revoked/unusable with that Request so it cannot be rebound or reused. After
   any In Progress fence/stop effect, cancellation may finalize only after the same signed
   containment and revocation set required by adoption: it leaves the Claim Attempt terminal
   `fenced`, finalizes the Execution Lease fence, releases capacity/worktree, clears only a
   claim-created assignment, preserves a preassignment, returns the source to Todo only when the
   exact Ready Approval and dependencies remain current, revokes the unconsumed Request/token, and
   records the terminal cancellation disposition. Otherwise it stays `cancelling` under its
   containment owner until the governing Revision/stop path resolves; expiry or drift never releases
   uncertain resources. A Todo source stays Todo after the explicit-none facts are rechecked. Exact
   replay returns the recorded branch; cancel/finalize race on one Intent version and exactly one
   wins.

Blocked, Sprint-member, Backlog, archived, and Done records cannot use ordinary adoption. A Sprint
member first uses its governed Sprint Plan command; an archive overlay preserves history. An
already-Done matching provider attestation is an idempotent no-op. A different result associated
with Done or archived history appends the violation and drafts a remediation/revert Proposal (and
Incident when security policy requires it), but #229 never reopens Done or archive. Any other source
state is a hard conflict with no lane/resource write.

Every prepare/finalize/cancel phase uses
`(tenant_id, workspace_id, DevTicket, provider attestation, transition-record kind, phase, generation)`
as its base semantic identity. An External Result Adoption Intent additionally binds
`(human_owner_identity, human_owner_version, admin_authority_identity, admin_authority_version, approval_request_id, approval_request_version)`;
an existing-Review External Result Review Preparation records the adoption-authority branch
explicitly `not_applicable` and never invents human approval. The fresh Attempt uses independent
grants, Docker, manifest, decision-time package, and appropriate containment. Human Owner transfer
or Admin authority revocation CAS-stales/revokes an adoption Request/token and leaves the
Intent/source lane, Review Membership, Review WIP, proof, and resource authority unchanged; a later
adoption needs a fresh exact Request and semantic identity.

A `provider_result` `Changes Requested` result never returns already-merged code to Todo. The same
is true for a threshold-qualified persistent `Inconclusive` result only after the exact current
Human Owner identity/version acting through the exact current Admin authority identity/version
grants the exact remediation decision/request described below. Before Review WIP can be released,
that same exact authority must either select an existing Ready-approved remediation DevTicket
already in Todo or accept a bounded remediation/revert Proposal. Acceptance first creates the linked
Backlog DevTicket; that ticket then completes ordinary GitHub binding, shaping, Ready
validation/Approval, and Backlog-to-Todo promotion. A Proposal itself never enters Backlog and this
path never manufactures a Ready-complete Todo DevTicket.

The remediation Request semantic identity binds tenant/workspace, DevTicket, provider-result Review
Attempt/Decision/package/disposition, the selected remediation DevTicket, threshold/policy version,
the exact current Human Owner identity/version acting through the exact current Admin authority
identity/version, nonce, and request generation. Approval and final consumption each lock/recheck
that exact identity. Human Owner transfer or Admin authority revocation CAS-revokes the Request;
Review/Review WIP, Membership, proof, decision/package, and lane remain unchanged, and no Blocked
Episode or Wait Edge is created.

After the exact linked remediation DevTicket is Ready-approved and in Todo, new #230 command
`BlockExternalResultForRemediation` locks active `ReviewMembership` `current_handoff_id`,
`current_handoff_version`, `current_attempt_id`, `current_attempt_row_version`, and
`attempt_generation`; the named Handoff/Attempt rows; either `Changes Requested` or the qualified
`Inconclusive` decision plus its exact approved remediation Request and exact current Human Owner
identity/version acting through the exact current Admin authority identity/version, and the Review
Evidence Package; exact latest Evidence Disposition/current-disposition pointer; Post-Merge Review
Snapshot; Provider Merge Attestation and sync-conflict/provider-source versions; current
Ready/Approval, Revision/interruption, Absolute Stop, and Inspection
explicit-none/authenticated-closure versions; the Review Exit Containment Proof
ID/version/nonce/resource-fact hash; current dependency graph/completion and Sprint Plan/membership
versions; both DevTickets; and exact tenant/workspace Review WIP. It rejects self-linking, any
direct or transitive path from the remediation DevTicket to the reviewed DevTicket, any unresolved
gating dependency that makes the remediation ticket unclaimable, and any Sprint membership/order
lacking the required approved Plan revision. Only an independently claimable remediation ticket may
let the command consume Review Exit Containment Proof and, for Inconclusive, the exact approved
remediation Request only after rechecking its exact Human Owner identity/version acting through the
exact current Admin authority identity/version, atomically move Review to Blocked, decrement Review
WIP, mark `ReviewMembership` inactive, clear its current Handoff/Attempt IDs and row versions,
preserve the sync conflict/attestation/failed package, and open one exact Blocked Episode that
copies the terminal Handoff/Attempt IDs, row versions, and historical generation plus references
that remediation DevTicket. The same transaction persists a non-removable Post-Merge Remediation
Wait Edge from the reviewed DevTicket to the remediation DevTicket. The canonical dependency cycle
checker treats that wait relation as an active directed edge for every later `AddDependency`,
`RemoveDependency`, Revision, Ready, claim, and Sprint Plan mutation until the Episode closes; an
attempt to make the remediation DevTicket depend directly or transitively on the reviewed DevTicket
is therefore rejected after the Blocked transition too. Graph/Plan drift and the Blocked transition
share locks. The transition releases the keyed tenant/workspace Review WIP before remediation
implementation is claimed without pretending repository state changed. `ResumeExternalResultReview`
is the sole special Blocked-to-Review path: only after the linked remediation/revert DevTicket is
Done, authenticated GitHub truth shows the resulting `development` state, current Ready/Approval,
Revision/interruption, Absolute Stop, dependency and graph/Plan authority passes, Inspection is
explicit-none or authentically closed, the exact completed current Provider Result Deepening
Capture/artifact/receipt/Docs binding for that provider-result source (or the exact current non-code
applicability fact plus explicit Capture/artifact/receipt absence) and current
preflight/security-scan generations match, no prior Attempt authority is live, and a Review WIP slot
is available may the command proceed. It locks those facts plus the exact Episode-bound historical
Handoff/Attempt IDs, row versions, and generation; inactive `ReviewMembership` with null current
IDs; provider attestation/sync conflict; remediation result; Blocked Episode; Wait Edge; and keyed
Review WIP. In one version-locked transaction it creates a fresh active `ReviewMembership` whose
generation is greater than the Episode-bound historical generation, freezes a fresh Post-Merge
Review Snapshot binding the authenticated remediation-produced `development`
commit/tree/parents/target and provenance, closes the exact Post-Merge Remediation Wait Edge,
resolves the exact Blocked Episode, increments Review WIP, finalizes a new `external_result` Review
Handoff, creates/binds the next Queued `provider_result` Attempt to that new Snapshot, and sets the
new membership's exact current Handoff/Attempt IDs, row versions, and generation; it never requires
an already-resolved Episode or revives the old Attempt. Its semantic identity binds
tenant/workspace, DevTicket, Episode/version, remediation Done/provider facts, Ready, graph/Plan,
Wait Edge/version, Review WIP generation, and next Attempt generation. At Review WIP three or on
drift it retains Blocked plus the Wait Edge and records/reuses one retry intent with no partial
write. After authenticated authorization and Secret-Safe Ingress, an invalid capture writes one
terminal rejected command receipt and no partial effect.

An Inconclusive post-merge Attempt normally retains Review and may use a contained successor.
Repeated same-cause or policy-threshold persistent Inconclusive may use the remediation path only
after the exact current Human Owner identity/version acting through the exact current Admin
authority identity/version approves an exact Needs Human Approval remediation decision/request
selecting the Ready-approved Todo remediation DevTicket. `BlockExternalResultForRemediation` then
locks and consumes that request with the same exit-proof/Membership/graph/Plan transaction while
preserving the immutable Inconclusive decision; it never relabels it Changes Requested. Without the
approved request, Inconclusive stays Review/Review WIP. These commands and exact locks must be added
to #230 before the path is enabled (open: `TB-01`/`TB-02` + `TB-RV1`).

After current `provider_result` Pass and Review Exit Containment Proof, the exact current Human
Owner identity/version acting through the exact current Admin authority identity/version must grant
a distinct single-use **External Result Reconciliation Authorization**. It binds tenant/workspace,
the exact current Human Owner identity/version acting through the exact current Admin authority
identity/version, DevTicket/aggregate version, actual provider result, Post-Merge Review
Snapshot/decision/package, exact latest `current` Evidence Disposition, containment proof,
Inspection explicit-none/closure versions, violation/sync conflict, Ready/Revision/interruption
versions, exact approved Request ID/version/decision receipt, current Review-policy owner version,
mandatory-manifest eligibility version/hash, action, nonce, issue, expiry, role-revocation versions,
a discriminated Deepening applicability branch, and the current Secret-Safe Repository
Preflight/security-scan current-pointer generations plus exact accepted result IDs and hashes. The
`code_producing` branch binds the current Provider Result Deepening Capture applicability pointer
generation plus immutable governed Docs artifact/signed Runner receipt IDs and hashes. The
`non_code` branch instead binds the exact current version-bound non-code applicability fact
ID/version/hash and explicit current absence of Capture applicability pointer, governed Docs
artifact, and signed Runner receipt. It authorizes only reconciliation of an already-observed result
and never retroactively authorizes the merge.

Each exact binding has at most one active **External Result Reconciliation Authorization Request**.
It uses the same `pending → approved → consumed|revoked|expired` and
`pending → rejected|expired|revoked` current-state-wins semantics as Merge Authorization, but has a
distinct kind and semantic identity over every bound owner-fact ID, provider-result hash, aggregate
version, request generation, action, Deepening applicability discriminator, the applicable
`code_producing` Capture/artifact/receipt pointer generations, IDs, and hashes or `non_code` fact
ID, version, and hash plus explicit current Capture/artifact/receipt absence, and
preflight/security-scan pointer generations plus accepted result IDs and hashes. Exact replay
returns the recorded request; mismatched replay is rejected. Create/reject/expiry/revocation
atomically appends its deduplicated safe notification intent. Reject/expiry/revocation retains
Review/Review WIP and the synchronization conflict; a later request requires current-fact
revalidation plus a new nonce/rationale, and silence never approves. Slack may carry only the same
bounded exact approve/reject action and cannot reinterpret reconciliation as Merge Authorization.

Its `pending → approved` transaction locks/revalidates every Authorization binding, including the
exact current Human Owner identity/version acting through the exact current Admin authority
identity/version, provider-result/package/disposition/proof, sync conflict, current Ready and
Revision/interruption, inspection, current Review-policy owner version, mandatory-manifest
eligibility, GitHub health, Absolute Stop, the exact Deepening applicability discriminator and
branch binding, and the current Secret-Safe Repository Preflight/security-scan pointer generations
plus accepted result IDs and hashes. For `code_producing`, it locks the current Capture pointer and
immutable artifact/receipt IDs/hashes; for `non_code`, it locks the current non-code applicability
fact ID/version/hash plus explicit Capture/artifact/receipt absence. It atomically records the
approval transition plus immutable Authorization only when every bound fact is still current.
Policy, mandatory-manifest, applicability-branch, Capture/artifact/receipt, non-code-fact/absence,
preflight, or security-scan drift makes the same approval transaction CAS-append a stale Evidence
Disposition, advance the current pointer, set the Request to `revoked` with safe `stale_binding`
cause, and create no Authorization. Other binding drift likewise revokes the Request with a safe
cause and no Authorization.

New #230 command `ReconcileExternalResultDone` atomically rechecks every bound owner fact including
the exact current Human Owner identity/version acting through the exact current Admin authority
identity/version, aggregate, exact latest Evidence Disposition/current pointer, current
Review-policy owner version, mandatory-manifest eligibility, GitHub health, Review/Review WIP, the
exact discriminated Deepening applicability branch, current Secret-Safe Repository Preflight and
security-scan current-result/current-pointer generations plus immutable accepted result IDs/hashes,
exact Absolute Stop explicit-none/remediated version, and the approved current Request and
Authorization. The `code_producing` branch rechecks current Capture applicability plus immutable
artifact/receipt IDs/hashes; the `non_code` branch rechecks the exact current non-code fact
ID/version/hash and explicit Capture/artifact/receipt absence. Policy, manifest, applicability-
branch, Capture/artifact/receipt, non-code-fact/absence, or scan/preflight drift CAS-appends a stale
Evidence Disposition and advances the current pointer before returning with no Done, just as the
ordinary merge path does; the conflict and Review/Review WIP remain. Otherwise it consumes the
proof, Request, and Authorization, decrements Review WIP, resolves the conflict with violation
provenance, and admits Done. Human Owner transfer or Admin authority revocation before this CAS
atomically revokes the still-applicable reconciliation Request with a safe `authority_drift` cause,
appends an unused/stale disposition for its immutable Authorization, and preserves Review, active
Review Membership/WIP, the proof, resources, and every consumption counter. Other expiry, evidence/
aggregate/applicability/scan drift, replay, or a losing version rejects without Done. Its
idempotency identity binds all named owner-fact IDs and hashes, policy/manifest/applicability/scan
versions, and aggregate version. No external-result path is enabled until these #230 extensions and
their behavioral tests ship (open: `TB-01`/`TB-02` + `TB-RV1`).

If GitHub is unhealthy or unverifiable at any point, preparation/reconciliation/Done opens or
retains the Absolute Stop and waits fail-closed.

A provider merge observed before the exact Review Exit Containment Proof is accepted or before the
governed merge outbox dispatch is an external-merge synchronization conflict. Opzava fences any
remaining Review authority, retains Review/Review WIP, records the violation without claiming merge
authorization, and follows the applicable prepare/adopt `provider_result` Review path above. If it
was not yet a Review member, execution containment and the adoption decision by the exact current
Human Owner identity/version acting through the exact current Admin authority identity/version occur
before Review admission. That early provider fact can never satisfy ordinary `AdmitDone`.

## Bounded waiting and escalation

The versioned Review policy binds warning and attention thresholds into the Review Attempt Snapshot.
**V1 defaults (recommendation; operator-configurable within safe bounds):** Queued warning at 10
minutes and attention at 30; Containing warning at 5 minutes and attention at 15; provider
`outcome_unknown` warning at 5 minutes and attention at 15 followed by low-frequency
reconciliation; and attention after two same-cause Inconclusive Attempts or three consecutive
Inconclusive Attempts total. Two authorization reject/expiry cycles use the rule above. Configuration
may tighten these thresholds within safe bounds but never force-releases resources, infers a
decision, bypasses Review, or blind-retries a merge.

Attention offers only bounded governed choices: wait; repair health and start a successor Attempt;
switch to an already approved Reviewer configuration through a new Attempt; repair/reseed Docker;
request a fresh exact authorization; or initiate a material Revision through #230. Containment
failure, persistent queueing, provider uncertainty, and repeated Inconclusive remain visible in
Review/Review WIP until an owner fact resolves them. Apart from the exact Post-Merge
`BlockExternalResultForRemediation` path above, #229 defines no finalized-Review cancel/archive/
Blocked exit; such a command cannot be offered until a later command-model extension specifies its
locks and containment.

### Durable Review notifications

The command that owns a Review condition atomically appends one secret-safe notification intent; the
Notifications boundary alone owns delivery, read/dismiss state, and Slack retries. Its semantic
identity is `(tenant_id, recipient_id, source_owner, source_event_id, source_event_version, kind)`.
Replaying, redelivering, or observing the same owner fact cannot create a second logical
notification. An intent contains only a safe summary, severity, occurred/observed time, and an
authenticated Opzava deep link—never source, diff, log, evidence, credential, or secret content.

Required intents cover: a Merge Authorization or External Result Reconciliation Authorization
request and its reject/expiry/revocation; Reviewer-discovery `ProposalSubmitted`; Review WIP
saturation that rejects new claims or handoffs; provisioning or Reviewer/Docker launch failure;
containment failure or timeout; Changes Requested or Inconclusive; and provider outcome uncertainty
or an external/mismatched merge. Threshold-based conditions bind the policy and episode generation,
so one continuing episode notifies once while a genuinely new recurrence can notify again.

Delivery uses durable `pending → delivering → delivered | terminal_failed` state, bounded
exponential retry, an idempotency key derived from the semantic identity, and an append-only attempt
history. Timeout/duplicate/out-of-order callbacks reconcile to that same intent. Exhausting delivery
records `terminal_failed` and a safe in-product delivery-health fact; it never changes Review/Review
WIP, Attempt, containment, authorization, merge, provider reconciliation, rework, or Done state.
Slack is therefore an optional delivery and bounded-action adapter, never a workflow dependency or
authority.

## Races and sad paths

| Scenario                                                                                                               | Required outcome                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review WIP is three when handoff is requested                                                                          | #230 retains In Progress and one exact retry intent; no Review Membership, release, fourth member, or hidden lane.                                                                                                                                                                                                                                                  |
| Code-producing source lacks its exact current Deepening binding or presents a forged/stale/non-code binding            | Retain In Progress/existing external-result state; after auth+Secret-Safe Ingress persist/replay one terminal rejected receipt and no retry/Handoff/Membership/WIP/Attempt/grant/lease/lane/token write. Provider results require completed Capture, never an implementation checkpoint.                                                                            |
| Provider Result Deepening Capture loses source/policy/Runner authority or containment                                  | Enter/reuse containing; fence the exact process/worktree/grants and require signed/authenticated closure before cancel/supersede. No artifact pointer, admission, source mutation, provider write, or resource release.                                                                                                                                             |
| Review WIP reaches three while other implementation work exists                                                        | Reject every new ordinary/Sprint claim under the same locked counter, notify Slack once, and preserve already admitted leases.                                                                                                                                                                                                                                      |
| Reviewer or Docker capacity is unavailable after Review admission                                                      | Attempt remains Queued in Review and consumes Review WIP; waiting reason and fair queue position are visible.                                                                                                                                                                                                                                                       |
| Two workers reserve or launch the same Review generation                                                               | The membership-pointer CAS and generation uniqueness choose one; losing or different-payload work creates no grant, lease, process, or second Attempt.                                                                                                                                                                                                              |
| Provisioning fails before Snapshot, after Snapshot, or after Running                                                   | Before Snapshot: clean reservations. After Snapshot but before Running: contain/cancel with no decision. After Running: cutoff may be Inconclusive.                                                                                                                                                                                                                 |
| Reviewer crash, disconnect, lease expiry, or tunnel uncertainty while active                                           | Fence and enter Containing; reject late receipts; retain Review/Review WIP until authenticated containment.                                                                                                                                                                                                                                                         |
| Decision cutoff races a late check receipt                                                                             | The cutoff sequence wins; reject the late receipt or attach it only to a successor Attempt.                                                                                                                                                                                                                                                                         |
| Decision cutoff races security-scan, Absolute Stop, or GitHub-health generation change                                 | One CAS wins the exact generations. Safety/health first emits no ordinary decision/package; cutoff first preserves immutable history and the later winner appends disposition/containment without rewriting it.                                                                                                                                                     |
| Review Access Grant fails, expires, is revoked, or returns an invalid principal                                        | Before Running, contain/cancel with no decision; after Running, fence all Attempt access, contain, and produce Inconclusive unless an Absolute Stop applies.                                                                                                                                                                                                        |
| Docker restart, mutation, schema/seed drift, or fence mismatch                                                         | Before cutoff/package, contain and reject partial evidence. After package commit, ordinary fenced reuse expires live preview but preserves historical proof; unauthorized/source/policy/manifest drift follows its stale-disposition rule. Never combine generations.                                                                                               |
| Material Revision races a running/finishing Attempt                                                                    | Canonical locks choose one owner; require Review Containment Proof, then atomically supersede any nonterminal Attempt, stale any package, advance generation, move to Backlog, and decrement keyed Review WIP. Emit no stale decision or partial lane exit.                                                                                                         |
| Absolute Stop resolution races recurrence, Revision, or successor finalization                                         | Contextual proof resolves only the exact stop; a separate idempotent finalizer persists exit proof, then cancels a no-decision Attempt or completes a decision-bearing one. Already-terminal history is unchanged; shared generations admit one winner.                                                                                                             |
| A command presents the other containment-proof envelope                                                                | Reject it: proof kind, context ID, nonce, resource-fact hash, and allowed command must all match; one envelope never substitutes for the other.                                                                                                                                                                                                                     |
| Changes Requested races Pass, merge request, or Done                                                                   | Exact candidate/decision/Revision/handoff/Review WIP locks choose one terminal path; loser returns the committed disposition with no second effect.                                                                                                                                                                                                                 |
| Missing mandatory check, unknown applicability, unsupported adapter, timeout after bounded retry                       | Before `Running`, contain/cancel with no decision; after `Running` and authenticated cutoff, unresolved mandatory applicability/execution/proof is Inconclusive, never Pass.                                                                                                                                                                                        |
| Secret suspected in diff, log, artifact, or evidence ingress                                                           | Persist no raw content; open/retain Absolute Stop containment using safe hash/ref, revoke eligible authority, and reject approval/merge/Done.                                                                                                                                                                                                                       |
| Pre-push/pre-model trusted secret scan fails or suspects a secret                                                      | Do not push, create PR, or expose source/output to the model; fail closed, with suspected exposure opening Absolute Stop.                                                                                                                                                                                                                                           |
| GitHub becomes unhealthy/unverifiable before decision cutoff                                                           | Trigger Absolute Stop containment; persist only safe partial historical artifacts and no ordinary decision/package.                                                                                                                                                                                                                                                 |
| GitHub becomes unhealthy/unverifiable after package cutoff                                                             | Open/retain Absolute Stop and append a stale disposition; preserve the package but forbid authorization/merge/Done until remediation and a current Attempt.                                                                                                                                                                                                         |
| PR force-push, head/base/merge-tree movement, rebase, or conflict repair after Pass/approval                           | Mark evidence/authorization stale and require a new candidate/Attempt.                                                                                                                                                                                                                                                                                              |
| Mark Pull Request Ready Request is replayed, times out, or races an external ready/draft change                        | Reuse one semantic request and reconcile authenticated PR truth; only current `confirmed_ready` continues, never a blind second mutation or inferred repository review.                                                                                                                                                                                             |
| Ready/draft negative terminal outcome is retried without a new provider/health fact or repair disposition              | Reject a successor generation; retain Review and attention. Terminal predecessor plus bounded policy remain authoritative and no blind provider mutation occurs.                                                                                                                                                                                                    |
| Ready invalidation races Convert Pull Request to Draft Request, merge reservation/submission, or provider response     | One singleton tenant/workspace/installation/repository/PR mutex chooses ready, conversion, or merge regardless of action kind/request ID; unknown effects reconcile truth, stale merge stays suppressed, and submission-first follows `provider_result` reconciliation.                                                                                             |
| Automatic merge is attempted without a current `not_required` Merge Authorization Requirement                          | Retain Review; reject reservation/dispatch. Missing request/authorization records never imply consent, and the required/not-required branches cannot fall back to each other.                                                                                                                                                                                       |
| Human Owner identity/version changes or Admin authority is revoked after an authorization request or merge reservation | Revoke/reject before reservation, suppress before provider I/O, or reject `AdmitDone`; a later human-authorized attempt requires the new exact current Human Owner identity/version acting through exact current Admin authority identity/version and a new exact request/nonce.                                                                                    |
| Review policy/mandatory manifest drifts before reservation, dispatch, or Done                                          | The winning locked command appends a stale Evidence Disposition before returning/suppressing; no stale provider I/O or Done. A merge already accepted by GitHub follows governed `provider_result` reconciliation.                                                                                                                                                  |
| Approval replay, expiry, role revocation, or binding drift                                                             | Reject without merge; preserve prior authorization audit.                                                                                                                                                                                                                                                                                                           |
| Human rejects or lets a Merge Authorization Request expire                                                             | Retain Review/Review WIP, terminalize the request, raise attention, and require a new nonce/current revalidation for any later request.                                                                                                                                                                                                                             |
| Post-package inspection opens while successor, Review exit, merge dispatch, or Done races                              | The locked Inspection explicit-none/closure version chooses one path; no command crosses live inspection authority.                                                                                                                                                                                                                                                 |
| Authority drifts after merge reservation but before provider I/O                                                       | The dispatch recheck suppresses the semantic request without provider I/O; any consumed human Authorization is not reusable.                                                                                                                                                                                                                                        |
| Bound authorization expires or Admin role is revoked after reservation but before provider I/O                         | Suppress with no provider I/O; preserve consumed-plus-unused audit, retain Review/Review WIP, and require a fresh authorization after current revalidation.                                                                                                                                                                                                         |
| Revision, Review exit, or Absolute Stop races a submitted/unknown merge                                                | Provider reconciliation owns the interval; the stop contains immediately, no other exit finalizes, and current locks re-evaluate after provider truth.                                                                                                                                                                                                              |
| Submitted request confirms exact merge after Revision/Absolute Stop made authority stale                               | Do not use stale AdmitDone; preserve the winning command and require governed `provider_result` Review/reconciliation after current Ready/stop remediation.                                                                                                                                                                                                         |
| Provider merge appears before Review Exit Containment Proof or governed outbox dispatch                                | Open a fail-closed synchronization conflict, contain Review authority, retain Review/Review WIP, and require `provider_result` Review reconciliation; never ordinary Done.                                                                                                                                                                                          |
| Merge API times out with unknown outcome                                                                               | Reconcile provider truth by request/PR/commit identity; never issue a blind second merge.                                                                                                                                                                                                                                                                           |
| Provider confirms the semantic request did not merge                                                                   | Terminalize it as confirmed-not-merged; revalidate all bindings and obtain new policy evaluation/Authorization before a bounded new request.                                                                                                                                                                                                                        |
| Provider confirms a different tree in `development` or an external merge there                                         | Visible policy violation; no inferred Done; fresh `provider_result` Review/remediation of the actual result.                                                                                                                                                                                                                                                        |
| Provider confirms a merge to the wrong target                                                                          | Preserve the conflict outside Done; do not create a wrong-target Post-Merge Review Snapshot. Require a governed candidate, ordinary `pre_merge` Review, and confirmed merge to `development`.                                                                                                                                                                       |
| External result arrives in ordinary non-Sprint Todo/In Progress                                                        | Prepare durable adoption, require the exact current Human Owner identity/version acting through the exact current Admin authority identity/version plus Ready/dependencies/containment/no-stop, then finalize once into Review; Backlog is ineligible.                                                                                                              |
| External result appears during prepared/cancelling Review Handoff                                                      | Retain Review/Review WIP, contain implementation under that Handoff, then finalize the external-result subtype without assuming an Attempt exists.                                                                                                                                                                                                                  |
| External adoption waits on Runner confirmation or Review WIP                                                           | Retain a versioned pending Adoption Intent in the visible source lane, block new claims, retry by new phase key, and never infer containment or membership.                                                                                                                                                                                                         |
| Adoption cancel wins before any fence/stop effect                                                                      | Revoke the unconsumed Request/token so it is unusable, terminalize the Intent, and preserve source lane, active execution, assignment, claim, lease, and resources exactly; replay returns that branch.                                                                                                                                                             |
| Adoption cancel wins after an In Progress source was fenced                                                            | Remain under the named containment owner until signed closure; then keep claim/lease terminal, release once, clear only claim-created assignment, preserve preassignment, and return Todo only under current Ready/dependencies.                                                                                                                                    |
| Adoption cancel races finalization or ordinary successor                                                               | Intent/version and membership locks admit one winner; loser returns the recorded branch with no second token, lane, assignment, resource, Handoff, or Attempt mutation.                                                                                                                                                                                             |
| Human Owner transfer or Admin authority revocation races adoption, remediation Block, or reconciliation Done           | CAS-revoke/stale the applicable human Request/token and retain the existing source/Review lane, Membership/WIP, proof, and resources with no partial effect; a transition that already consumed the exact current authority is the sole winner.                                                                                                                     |
| `provider_result` Review returns Changes Requested while Review WIP is full                                            | Retain Review/Review WIP until the exact current Human Owner identity/version acting through the exact current Admin authority identity/version selects an existing Ready-approved Todo remediation DevTicket or accepts a Proposal whose new Backlog DevTicket completes normal Ready/Todo promotion; only then create the Blocked Episode and release Review WIP. |
| Persistent `provider_result` Inconclusive lacks its threshold-qualified exact-authority remediation Request            | Preserve immutable Inconclusive and retain Review/Review WIP. Do not coerce Changes Requested, open Blocked/Wait Edge, consume proof, or decrement WIP.                                                                                                                                                                                                             |
| Selected post-merge remediation depends on the reviewed ticket or graph/Plan drifts                                    | Reject without Blocked/Review WIP release; lock both tickets and current graph/Plan, require an independently claimable remediation ticket, and retry only after a safe graph/Plan decision.                                                                                                                                                                        |
| A later dependency mutation would make remediation depend on the blocked reviewed ticket                               | The active Post-Merge Remediation Wait Edge participates in the canonical cycle check, so reject the mutation; the edge closes only atomically with successful `ResumeExternalResultReview`.                                                                                                                                                                        |
| External reconciliation authorization is replayed, rejected, expired, revoked, or races Done                           | One distinct request/version wins; retain Review/Review WIP/conflict on non-approval, notify safely, and consume the current request/authorization/proof exactly once only with reconciled Done.                                                                                                                                                                    |
| External result targets Blocked, Sprint member, archived, or Done history                                              | Reject adoption; use the existing owner command or remediation Proposal/Incident. Matching Done attestation is an idempotent no-op; history never reopens.                                                                                                                                                                                                          |
| Preview expires or Runner/inspection lease is lost                                                                     | Revoke tunnel and label preview unavailable; historical evidence remains, but no stale preview is presented as current.                                                                                                                                                                                                                                             |
| Raw evidence expires after Done                                                                                        | Preserve the durable decision-time package plus linked authorization, provider attestation, disposition, containment, and completion minimum.                                                                                                                                                                                                                       |
| Repeated Changes Requested                                                                                             | Preserve every Attempt; raise human attention and bounded choices; no lowered checks, silent reorder, or bypass.                                                                                                                                                                                                                                                    |
| Reviewer discovers an issue outside the current Ready contract                                                         | Draft a separate blocking/non-blocking Proposal, notify Lead Orchestrator/Slack, and require human decision; no implicit decision, DevTicket, Sprint membership, or Plan mutation.                                                                                                                                                                                  |
| A notification producer or worker retries the same owner fact                                                          | Reuse the semantic notification identity; one logical notice and append-only delivery attempts, never duplicate workflow effects.                                                                                                                                                                                                                                   |
| Slack times out, sends duplicate/out-of-order callbacks, or permanently fails                                          | Reconcile or terminalize only delivery state; retain the in-product attention and prove Review, Review WIP, containment, approval, merge, and Done are unchanged.                                                                                                                                                                                                   |

All commands and owner facts are tenant-bound, versioned, idempotent, and secret-safe. Unauthorized
or cross-tenant requests are a hard 403 and reveal no existence, queue, evidence, approval, or prior
idempotent result.

## Ledger routing

- Planning decision ledger: manifest/policy rationale, human exception/authorization rationale,
  rejected alternatives, and material contract-revision decisions.
- Dev Board activity/history: Review admission/request, Attempt status summaries, decision,
  changes-requested placement, Evidence Disposition, authorization request/status, Post-Merge
  Remediation Wait Edge/Blocked Episode refs, governed merge request, Provider Merge Attestation,
  violation, Done, and the Deepening Module applicability/current-pointer decision plus exact Docs
  ID/version/hash used by admission. Provider Result Deepening Capture lifecycle and current-pointer
  selection are activity facts; its immutable document remains in Docs.
- Runner execution/checkpoint: signed Reviewer/Docker/worktree/process receipts, fences, heartbeats,
  and component cleanup/containment/artifact observations only—never a Review Containment Proof or
  Review Exit Containment Proof envelope, acceptance, consumption, or lifecycle. A pre-Review
  Deepening Module run—including Provider Result Deepening Capture—contributes only its signed
  skill/tool receipt and component observations. Requirement/proof composition remains Review Gate
  authority.
- Synchronization/outbox/conflict: draft PR/provider facts, GitHub checks/reviews, merge request and
  confirmation/reconciliation, sanitized Review summary outbox, deduplication, and health.

Governed Docs owns and exposes the immutable secret-safe Deepening Module Artifact document. Neither
that document nor its Runner receipt is current until the Dev Board pointer command accepts the
exact binding, and neither is Review evidence or Pass.

The ledgers cross-link stable IDs but retain separate authority, ordering, and retention. No model
output or UI projection becomes an owner fact.

## Migration and cutover

Legacy `quality`, reviewer, evidence, check, Task completion, GitHub issue-close, or historical Done
rows are preserved as historical evidence. They cannot satisfy the Review Gate merely because they
contain a pass flag or reviewer name. Current eligibility requires explicit reconciliation proving
the exact Ready lineage; the discriminated pre-merge repository/PR/head/base/result/strategy facts
or provider-result commit/tree/parents/`development` target; independent Reviewer authority;
manifest/policy; local Docker generation; artifact hashes; containment; current Evidence
Disposition; and provider-confirmed merge/reconciliation. A `provider_result` reconciliation never
invents prospective PR/base/merge-tree fields. Missing proof remains `legacy_unverified` and never
unlocks a dependency or current Done.

No UI, Slack action, GitHub label/Action, agent tool, Runner receipt, import path, or direct API may
reach Done until the Review Gate, evidence store, containment facts, merge saga, and #230 command
integration pass the cutover tests below.

## Open decisions and recommendations (owned here; not lifted into #237)

These are recommendation/open-dependency items owned by the Review Gate contract. #237 carries #229
as a named dependency and does not re-derive them (`wf237:28-31, 584-602`); they are locked at
implementation by `TB-RV1` and the `TB-01`/`TB-02` DevTicket command model, with human sign-off where
the readiness review requires.

1. **#230 compatibility correction (open dependency on `TB-01`/`TB-02`).** Supersede the landed
   `wf230` `ReviewMergeAuthorization` umbrella placeholder (`wf230:154-155, 494`) with the
   chronological record split; replace the `global Review WIP counter` wording (`wf230:486, 1114,
   1458`) with the `(tenant_id, workspace_id)`-keyed counter (maximum three per key); and add the
   not-yet-shipped external-result command families (`PrepareExternalResultReview`,
   `FinalizePrepareExternalResultReview`, `CancelPrepareExternalResultReview`,
   `PrepareAdoptExternalResultForReview`, `FinalizeAdoptExternalResultForReview`,
   `CancelAdoptExternalResultForReview`, `BlockExternalResultForRemediation`,
   `ResumeExternalResultReview`, `ReconcileExternalResultDone`,
   `AcceptReviewExitContainment`, `EvaluateMergeAuthorizationRequirement`) plus the singleton
   Per-PR Provider Action Mutex and scan-result lock families before any merge/Done path is enabled.
2. **V1 notification/waiting thresholds (recommendation).** The Queued/Containing/`outcome_unknown`
   warning/attention windows and the two-same-cause / three-consecutive Inconclusive attention rule
   in "Bounded waiting and escalation" are V1 defaults; operators may tighten them within safe bounds.
3. **V1 approver model.** V1 has no second approver role; High/Critical-risk merge and eligible
   exceptions require a single authenticated Merge Authorization from the exact current Human Owner
   identity/version acting through the exact current Admin authority identity/version.
4. **Credential-port extensions (open dependency on `TB-RV1`).** `AuthPort` mint/revoke,
   `AuthorizationPort` tenant/workspace/role/capability/expiry admission, and `SecretsVaultPort`
   opaque named-reference resolution must be added before authenticated Review is enabled; no
   adapter-local shortcut may mint a session or read a secret.
5. **Preflight binding (open dependency on `TB-RV1`).** #237 must bind preflight scanner/version,
   candidate tree hash, safe result hash, and expiry into the Review Handoff and Snapshot before the
   flow is enabled.
6. **No finalized-Review cancel/archive/Blocked exit.** Apart from the Post-Merge
   `BlockExternalResultForRemediation` path, #229 defines no such exit; it cannot be offered until a
   later command-model extension specifies its locks and containment.

## Behavioral contracts and user-level validation

The delivery graph must require these observable tests. Model calls are not correctness oracles. The
state-machine, security, lease, evidence, and merge-saga tests are implementation-qualification and
cutover gates before either `AdmitDone` or `ReconcileExternalResultDone` is enabled. Each production
Review then executes its own versioned source-snapshot-specific manifest; it does not rerun
migration/system-qualification suites unless that manifest selects them for the change.

1. **Real authenticated vertical story:** using ordinary Admin login and real tenant/workspace data
   on `http://web.opzava.localhost:18088`, take a Ready DevTicket from final implementation
   checkpoint through confirmed draft PR, fresh local Review, Docker evidence, eligible
   authorization, governed merge, GitHub provider confirmation, and Done. The Card shows truthful
   PR/check/Review/approval/Docker/merge state and an immutable Review Evidence Package without
   opening GitHub. Verify keyboard/menu equivalents and truthful loading/degraded/error states.
2. **Real local Docker seam:** materialize the exact merge result; prove environment digests, a
   clean database/object-store/cache/volume/queue/fixture baseline, authenticated user-level
   behavior, sad paths, cleanup, fence rejection, generation drift, fair queuing, preview expiry,
   and no concurrent stack mutation. Seed residue before acquisition and prove launch rejects it;
   then prove authorized pre-cutoff within-Attempt E2E writes remain valid evidence, a post-cutoff
   write is rejected and contained, and cleanup leaves a fresh residue-free postcondition before the
   next lease.
3. **Real Postgres command seam:** prove tenant/RLS denial, exact versions/idempotency, Review
   WIP-three race; Deepening Module Artifact acceptance/current-pointer idempotency, immutable Docs
   binding, signed Runner receipt correlation,
   stale-on-contract/Revision/SHA/tree/module/skill-policy drift, forged receipt rejection, false
   non-code rejection, and zero Review authority from every missing/stale loser; Provider Result
   Deepening Capture prepare/run/contain/finalize/cancel/replay with an authenticated exact provider
   tree, source-read-only worktree, no implementation checkpoint, complete grant/process/worktree
   containment, and terminal rejected receipts for stale admission finalizers; Attempt-generation
   uniqueness/CAS/replay, staged Snapshot/grant/Docker activation and pre/post-Snapshot failure,
   material Revision and Review Decision races, Inconclusive retry, changes-requested ordering,
   fresh Review Access Grant scoping/revocation, ordinary Review Exit Containment Requirement
   creation at cutoff, bounded cleanup, `AcceptReviewExitContainment` proof composition/Attempt
   terminalization/replay, contextual versus exit containment-proof envelope non-substitutability,
   post-package Inspection TOCTOU, Merge Authorization Requirement `required`/`not_required`
   evaluation, supersession, and explicit-absence enforcement, authorization request
   approve/reject/expiry/replay/revocation, reserved-before-dispatch expiry/role loss, reservation
   suppression, submitted-outcome ownership, confirmed-not-merged re-request, Review Evidence
   Package plus initial-current-disposition atomicity, disposition-pointer CAS races, immutability,
   Human Owner transfer and Admin authority revocation at authorization
   request/reservation/dispatch/Done, adoption prepare/finalize, persistent-Inconclusive remediation
   approval/Block consumption, and preview, policy and mandatory manifest drift before reservation,
   between reservation and dispatch, and after provider merge before Done (including
   stale-disposition CAS and `provider_result` reconciliation), Absolute Stop contextual-proof
   resolution followed by the separately authorized exit-proof finalizer (including
   recurrence/Revision/successor races), External Result Reconciliation Authorization Request
   approve/reject/expiry/revoke/replay/Done races including `code_producing` Capture/artifact/
   receipt drift, `non_code` fact/explicit-absence drift, applicability-discriminator drift, and
   preflight/security-scan drift at approval and again at Done, post-merge remediation graph cycles
   and graph/Plan drift, persistent-Inconclusive remediation approval/no-approval branches, every
   external-result prepare/finalize/cancel and adoption-intent command with its allowed/rejected
   source-lane matrix, and atomic ordinary or reconciliation Done only after confirmed exact merge
   and the applicable proof/authorization. Race cutoff against a security-scan generation, Absolute
   Stop generation, and GitHub-health generation; prove stop-first emits no ordinary package and
   cutoff-first preserves history while later authority is contained. Race competing prepares from
   explicit active-requirement absence. For a prepared/cancelling Handoff, prove one Preparation may
   win while **zero** Review Exit Containment Requirements are created; for a
   finalized-Handoff/current-Attempt tuple, prove one winner creates or reuses exactly one
   compatible requirement while an incompatible purpose gets zero writes. Race two external-result
   finalizers from the same prepared intent, drift the exact membership Handoff/Attempt tuple before
   one executes, and race cancellation against ordinary successor launch; prove exactly one CAS may
   switch pointers and every stale finalizer performs zero writes. Use equal
   DevTicket/generation/hash inputs in two workspaces and prove identities, Review WIP, and results
   do not collide or disclose. Prove a provider result appends the old package's stale disposition
   before the new snapshot/Attempt commits. For outside-Review adoption, prove admission atomically
   creates one active membership with the new pointer tuple/higher generation and increments keyed
   Review WIP; replay or a losing token/Review WIP CAS creates no membership or partial handoff.
   Exercise adoption cancellation before any side effect (execution unchanged, token unconsumed but
   unusable) and after fencing (signed containment, terminal claim/lease, one release,
   claim-created-assignment clear, valid Todo return or named containment wait), including
   cancel/finalize replay. Exercise `BlockExternalResultForRemediation` against successor/finalizer
   races and prove one transaction marks membership inactive, clears current pointers, copies exact
   terminal references into the Blocked Episode, and decrements Review WIP. Then race
   `ResumeExternalResultReview` against Review WIP saturation and graph, Inspection, provider, or
   remediation-result drift; success alone creates a fresh higher-generation active membership,
   fresh Post-Merge Review Snapshot, exact pointer tuple, and Review WIP increment, while every
   loser has zero partial writes. Prove ready/draft `confirmed_not_ready`/`confirmed_still_ready`
   generations cannot reopen without a new authenticated provider/health fact or governed repair
   disposition; bounded exhaustion retains Review. Race ready, draft, and merge actions and prove
   the singleton `(tenant, workspace, installation, repository, PR)` mutex admits only one holder
   regardless of action kind/request ID. Prove `ReconcileExternalResultDone` atomically consumes
   both its approved Request and Authorization with the proof, and a stale or missing member of that
   pair consumes nothing.
4. **Real GitHub adapter/webhook seam:** one fixed scratch repository and real GitHub App
   installation are mandatory for two actual provider journeys. First, perform an external/manual
   merge into `development` from Todo or In Progress, then complete Provider Result Deepening
   Capture, adoption, independent local Review Pass, exact reconciliation Request+Authorization, and
   `ReconcileExternalResultDone`. Second, introduce an actual external/manual result while the
   DevTicket is already Review, exercise the branch-correct Preparation path, reach Changes
   Requested or threshold-approved persistent Inconclusive, Block on a real governed remediation,
   merge that remediation, Resume, Pass, authorize reconciliation, and reach Done. The same real
   seam also proves signed delivery, draft PR, checks/reviews, a governed pre-merge merge, and
   authenticated snapshot reconciliation. Use a faithful HTTP stub only as supplemental
   deterministic failure injection for timeout, confirmed-not-merged, duplicate/out-of-order
   delivery, force-push/base drift, unhealthy/unverifiable stop, and external/wrong-tree outcomes; a
   stub never substitutes for the real provider cutover story. Prove draft-to-ready request
   reservation/dispatch, authenticated ready-state confirmation, response-loss reconciliation,
   external ready/draft races, invalidation-to-draft reservation/dispatch/reconciliation and merge
   race, required repository review after ready, independent `provider_result` Review
   reconciliation, and sanitized Review summary at the applicable real or supplemental seam.
5. **Security seam:** introduce synthetic secret-like values at diff/log/artifact/evidence inputs;
   assert raw values never enter Postgres product/audit rows, GitHub, Slack, Card, logs, errors, or
   preview URLs and that no approval path bypasses containment.
6. **Independence seam:** assert implementation credentials/session/worktree cannot invoke Review,
   Reviewer capability cannot mutate/push/merge, source mutation invalidates Pass, and same
   tool/model is accepted only through a distinct fresh Reviewer identity/session/config snapshot.
7. **Credential ports seam:** prove `AuthPort` mint/revoke, `AuthorizationPort` tenant/workspace/
   role/capability/expiry admission, `SecretsVaultPort` opaque named-reference resolution, and
   signed local Runner injection/closure. Assert the Reviewer/model and broker payloads never
   observe a value and no adapter-local shortcut can mint or resolve authority.
8. **Notification seam:** at a real outbox/Notifications/Slack-adapter boundary, trigger every
   mandatory Review notification, then inject duplicate producer events, transaction replay,
   timeout, retry, duplicate/out-of-order delivery callbacks, and permanent provider failure. Prove
   semantic deduplication, bounded terminal delivery, safe payloads, durable in-product attention,
   and zero mutation of Review/Review WIP, Attempt, containment, authorization, provider, rework, or
   Done.
9. **Discovery seam:** have the independent Reviewer report one in-contract failure, one unrelated
   non-blocking finding, and one unrelated blocking finding during an Active Sprint. Prove only the
   first affects the Review decision; the others create deduplicated Proposals, traverse Lead
   Orchestrator and Slack notification, require Human Owner accept/merge/reject/archive, create one
   Backlog DevTicket only through `AcceptProposal` or update one existing DevTicket only through
   `MergeProposal`, and never alter Sprint membership/order without an approved Plan revision.
10. **User-visible recovery seam:** in the authenticated local stack, resolve synthetic Absolute
    Stops across all three terminal branches and show the contextual proof. For a nonterminal
    no-decision Attempt, the separate finalizer creates the independently authorized exit proof and
    makes it Cancelled; for a nonterminal decision/package committed after cutoff, it creates that
    proof, preserves the package, and makes the Attempt Completed. An already-terminal Attempt gets
    no finalizer/new proof/state rewrite: Completed reuses its existing exit proof, while a
    Cancelled/no-package Attempt gets no fabricated disposition. Then create a fresh successor
    without leaving Review stranded. Exercise a `provider_result` Pass through
    reconciliation-request reject, expiry, replay, and final approval; then exercise post-merge
    Changes Requested with a cyclic/unclaimable remediation candidate and prove the Card retains
    Review/Review WIP until an independently claimable Ready Todo remediation ticket is selected.

Done-gate validation includes crash after provider merge before Opzava confirmation, actual result
mismatch, and a dependency attempting to claim before the predecessor is provider-confirmed Done.

## Rejected alternatives

- **Reviewer equals implementation agent/session:** rejected; self-review cannot provide independent
  authority even when the prompt says "review."
- **Head-SHA-only evidence:** rejected; base movement and merge-result drift make it stale.
- **One static checklist:** rejected; it misses type/risk/work-area-specific proof. The adaptive
  manifest remains deterministic and additive rather than model-selected authority.
- **One capacity counter for implementation, Review, and Docker:** rejected; it either blocks
  unrelated coding or allows concurrent stack mutation.
- **Inconclusive means Changes Requested/Todo:** rejected; infrastructure uncertainty is not proof
  that implementation is wrong.
- **Human approval converts a failure to Pass:** rejected; approval is separate merge authority and
  cannot rewrite evidence.
- **External merge retroactively means Done:** rejected; repository action is a fact, not proof the
  workflow gate passed.
- **Append approval or merge facts into the Review Evidence Package:** rejected; those later owner
  facts are immutable linked records so the decision-time package remains chronologically truthful.
- **Release Review WIP before ordinary cleanup:** rejected; ordinary successful and failed paths use
  authenticated Review Exit Containment Proof before successor authority or lane exit. Material
  Revision/Absolute Stop instead requires its separately bound Review Containment Proof.
- **Hold preview open on the Review lease:** rejected; it can starve all Reviews and make a mutated
  stack look current.
- **Mirror raw evidence to GitHub/Slack:** rejected; durable history needs a sanitized summary, not
  secrets or high-volume private artifacts.

## Downstream constraints

The final implementation graph must:

1. integrate the pre-Review Deepening Module applicability/current-pointer commands, including the
   provider-result prepare/finalize/cancel Capture lifecycle with exact immutable governed Docs,
   signed Runner receipt, source-read-only worktree, and containment bindings, then Review records
   and owner facts behind #230's command/idempotency/locking boundary, including the not-yet-shipped
   `PrepareExternalResultReview`, `FinalizePrepareExternalResultReview`,
   `CancelPrepareExternalResultReview`, `PrepareAdoptExternalResultForReview`,
   `FinalizeAdoptExternalResultForReview`, `CancelAdoptExternalResultForReview`,
   `BlockExternalResultForRemediation`, `ResumeExternalResultReview`, and
   `AcceptReviewExitContainment`, `EvaluateMergeAuthorizationRequirement`,
   `ReconcileExternalResultDone` variants, singleton Per-PR Provider Action Mutex, and scan-result
   lock families, and preserve the chronological record split that supersedes the
   `ReviewMergeAuthorization` placeholder before enabling merge/Done;
2. extend `AuthPort`, `AuthorizationPort`, and `SecretsVaultPort`; after a finalized Review Handoff,
   reserve fresh inactive least-privilege Review Access Grants, bind them through the final Snapshot
   CAS, and activate them only afterward; release every Reviewer, worktree-writer, Docker, tunnel,
   artifact-writer, and credential grant only after the applicable authenticated containment proof;
3. implement Review WIP, Reviewer Execution Capacity, and Docker Review Lease as distinct resources,
   with one current Attempt generation and staged Snapshot/grant/Docker reservation/activation CAS;
4. ship both Snapshot variants, candidate/evidence/manifest identity, and invalidation before
   enabling `AdmitDone`;
5. add the idempotent GitHub merge/reconciliation saga before automatic or human-authorized merge;
6. route Slack through the bounded existing approval contract, never an alternate gate;
7. preserve legacy evidence without treating it as current proof;
8. make the Card Review Evidence view self-contained by composing the immutable package and linked
   dispositions, containment, authorization, provider attestation, and completion facts while
   keeping the GitHub mirror sanitized; and
9. include every behavior test above as ticket-level acceptance, including real authenticated local
   Docker validation, the two mandatory external/manual-result journeys in one fixed real GitHub
   scratch repository, and command-discriminated final provider-confirmed Done.

With these decisions, the independent Review Gate contract is specified and landed. The contract is
target-behavior authority only; Review-Gate code paths remain disabled until `TB-RV1` ships, the #230
compatibility correction is absorbed by `TB-01`/`TB-02`, and the behavioral/cutover tests above pass.
Releases remain a separate gate; no staging or production behavior is inferred from Review, merge to
`development`, or Done (`wf236:122-127`; `ADR-017:101-105`).

---

## Prototype evidence (throwaway)

A runnable Review-Gate test bench at `prototypes/wf229-review-gate/` proves the load-bearing
admission invariants in-memory (no real Docker/runner/GitHub): Done is admitted **only** after a
current (non-superseded) candidate, an independent reviewer (≠ execution assignee, re-checked at
admission), a passed review + Review Exit Containment Proof, a confirmed merge whose tuple + target
match, and an unexpired, target-bound, single-use merge authorization consumed atomically — and it
fails closed on reviewer/runner unavailability at every gate step. 16 scenarios (S1–S16) pass; the
harness gates on `scenarioResults.every(Boolean)` (verified by fault injection).

Hardened via concurrent DeepSeek + Codex-sol review — Codex-sol returned **BLOCKED** with four real
holes (a superseded candidate could still reach Done; the merge authorization had no expiry or
merge-target binding; reviewer/evidence state was mutable after the checks; the Docker lease was
per-instance, not globally exclusive) plus a late-unavailability warning — all fixed and confirmed
**APPROVED** on re-review, with adversarial scenarios S9–S16 added to lock each. Throwaway evidence
for the contract above and #237 `TB-RV1`; not production code.
