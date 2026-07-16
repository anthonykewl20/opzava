# WF-234 — Governed Docs, planning log, traceability, and invalidation contract

## Status and provenance

**Status:** prepared resolution candidate for the question in
[`Complete the governed Docs type, planning-log, and invalidation matrix`](https://github.com/anthonykewl20/opzava/issues/234).
It becomes current #228 input only after the parent map records verified #234 closure and designates
it for #237 synthesis. Until then it is target contract candidate—not implementation authority—and
does not claim that the Docs view, governed-document aggregate, Git repository mirror, traceability
graph, or invalidation workers are implemented.

The contract consumes, without reopening:

- [`WF-230`](wf230-devticket-command-model.md) for the authenticated command envelope, Secret-Safe
  Ingress, Ready Contract revisions, lane-specific invalidation, Sprint coordination, execution
  containment, idempotency, and ledger ownership;
- [`WF-231`](wf231-github-mirror-contract.md) for GitHub App identity, provider observations,
  dimensional health, durable outbox, unknown-effect reconciliation, and no-last-write-wins
  principles; and
- [`WF-236`](wf236-releases-gate-contract.md) for Release approvals, evidence bindings, irreversible
  promotion boundaries, containment, and immutable Released history.

The final Review mechanics remain owned by Wayfinder ticket #229. This memo defines the exact
document-version compatibility seam that #237 must join to the approved Review contract; it does not
invent Reviewer commands or containment proof types before that ticket lands.

## Decision summary

1. **Opzava is authoritative.** The Dev Board Docs module owns governed content, lifecycle,
   approval, relations, exact reliance, traceability, archive overlay, and invalidation decisions.
   GitHub owns only native blob/tree/commit/ref facts for the human-readable secondary mirror.
2. **Identity, bytes, and state are separate.** A stable `GovernedDocument` points at immutable,
   content-addressed `DocumentRevision` records. Append-only lifecycle decisions derive the current
   approved and working heads; no approved bytes are edited in place.
3. **There are exactly nine governed document types.** Review Gate and Releases Gate contracts are
   profiles of `RFC/Design Spec`, not new types. A Planning Session Log is an authoritative
   append-only planning-ledger stream, not a tenth document type.
4. **A link is not a gate.** `DocumentRelation` is navigation metadata. `DocumentReliance` is an
   exact, version-bound contract used by Ready, Sprint, Review, or Release gates and never follows a
   mutable “current” pointer.
5. **Material replacement fail-closes atomically.** Approval of a material successor swaps the
   approved head, marks all exact active reliances stale, and opens one durable invalidation
   generation in the same transaction. Every dependent gate reads that stale fact immediately.
   Idempotent fan-out then routes each affected aggregate through its own governed commands.
6. **Invalidation never erases history.** Done DevTickets and Released Releases remain immutable.
   The new document's immutable Markdown mirror always proceeds; only stale dependent commands and
   workflow projections block.
7. **GitHub is not approval.** Provider edits may propose a Draft only after authenticated,
   Secret-Safe, three-way reconciliation. A commit, `2xx`, filename, author string, or copied marker
   never approves, supersedes, archives, or carries a reliance forward.

## Authority and module boundary

| Concern                                                     | Authoritative owner                               | Accepted external input or projection                                                         |
| ----------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Stable document identity, type, heads, archive overlay      | Dev Board Docs                                    | UI, assistant, GitHub, or import may request a command                                        |
| Revision canonical bytes, hash, predecessor, attribution    | Dev Board Docs                                    | Secret-Safe author input or admitted provider-backed Draft proposal                           |
| Approval, supersession, equivalence, reliance, invalidation | Dev Board Docs plus the named consuming owner     | Slack may relay one bounded human decision; GitHub cannot approve                             |
| Planning Session Log entries and corrections                | Planning decision ledger                          | UI/assistant session appends through authenticated commands                                   |
| Goal, Plan, membership, order, Sprint approval              | Sprint boundary                                   | Docs stores an exact governed representation and refs only                                    |
| Ready Contract, lane, claim, execution containment          | DevTicket/Dev Board command boundary from WF-230  | Document invalidation requests one governed owner command; Docs never changes a lane directly |
| Review admission, run, verdict, evidence, containment       | Review boundary from final #229                   | Exact approved RFC profile and Document Reliance are policy inputs                            |
| Release lifecycle, manifest, approvals, attempts            | Releases boundary from WF-236                     | Exact approved RFC profile and Document Reliance are policy inputs                            |
| Git blob, tree, commit, ref, author/provider observations   | GitHub                                            | Dedicated Docs integration stores normalized observations and confirmations                   |
| Document mirror desired state, outbox, shadow, conflict     | Dev Board GitHub integration / Docs mirror module | GitHub native facts remain provider truth                                                     |
| Incident lifecycle and Postmortem ownership                 | Incident context                                  | Docs links the governed Postmortem without copying Incident state                             |

The Docs application boundary exposes a dedicated `GovernedDocumentMirrorPort`. It must not reuse
WF-231's Issue-specific `WorkItemMirrorPort`, and it must not borrow the Runner-only authorized Git
ref-update authority. The adapter may use the same platform GitHub App, secret isolation, health,
provider observation, and outbox infrastructure while retaining a distinct command family,
permission policy, path policy, shadow, and conflict identity.

## Domain model

### GovernedDocument

`GovernedDocument` is the stable aggregate root. It owns:

- immutable `documentId`, tenant/workspace/repository binding, canonical `typeKey`, normalized
  immutable path slug, and path-policy/canonicalization versions;
- monotonic aggregate version;
- one current `documentOwnerBindingId` plus owner-binding version. The binding names an
  authenticated verified human accountable for shaping, conflict/archive decisions, and routing the
  type/profile approval slots; it grants no consuming-workflow or unspecified approval role;
- optional `approvedHeadRevisionId` and at most one `workingHeadRevisionId` in Draft or In Review;
- archive overlay, optional `archivedApprovedHeadRevisionId`, archive reason/actor/time, and
  optional restoration predecessor;
- current relation-set version, reliance-set version, and invalidation generation; and
- exact current mirror health/conflict refs without treating them as lifecycle state.

The document type and storage coordinates never change. A type correction creates a new document,
links it as a replacement, and archives or supersedes the old document through the normal governed
path. This prevents a type or title edit from moving an immutable version to a different path.

V1 permits one working head so two competing Drafts cannot both claim to be the successor. The
approved head remains readable and reliance-eligible while its successor is Draft or In Review.
Creating or reviewing a successor does not silently supersede current authority.

`TransferDocumentOwnership` compares and swaps the exact current owner binding and authorization
version and appends the old/new accountable identities and reason. It never transfers specialized
type/profile approval, Incident/Sprint/Release ownership, or consuming-workflow authority. Pending
approval decisions whose policy or role binding no longer matches become `revoked`; the revision
remains In Review until the newly current requirement set is satisfied. A former owner cannot
approve, archive, restore, or resolve a conflict after the transfer commits.

### DocumentRevision

Every `DocumentRevision` owns immutable:

- `revisionId`, `documentId`, monotonic revision number, predecessor revision ID/hash, and creation
  reason;
- canonical UTF-8 Markdown bytes normalized to LF and one terminal newline under an explicit
  `canonicalizationVersion`;
- SHA-256 of those exact canonical bytes;
- verified author/participant attribution, source surface, actor chain, command ID, and created
  time; and
- stable revision-scoped requirement identifiers plus safe structural metadata needed for
  traceability.

The canonical content hash excludes mutable navigation relations, mirror state, Git provider facts,
lifecycle decisions, and display metadata. A sanitized GitHub render has its own
`renderPolicyVersion` and `renderHash`; it can never be substituted for the canonical content hash.
If unsafe active HTML or URL schemes are removed/escaped, Opzava retains only the already
Secret-Safe canonical author content and records that the mirror is a sanitized projection.

Lifecycle is derived from append-only decision facts, not by changing revision bytes:

```text
CreateDocumentRevision -> Draft
Draft -> In Review                 SubmitDocumentRevisionForReview
In Review -> Draft                 ReturnDocumentRevisionToDraft | WithdrawDocumentRevisionReview
Draft -> Superseded                CreateDocumentRevision | AbandonDocumentRevision
In Review -> Superseded            AbandonDocumentRevision
In Review -> Draft                 RejectDocumentRevision
In Review -> Approved              FinalizeDocumentApproval
Approved -> Superseded             atomic approval of its successor
current document -> Archived       ArchiveGovernedDocument overlay
Archived -> Draft successor        RestoreGovernedDocument
```

Request-changes and withdrawal append distinct decisions, revoke every collected approval for that
review round, close the round, and return the same immutable content snapshot to Draft. Rejection
does the same while recording the rejecting slot and safe reason. Subsequent content changes
atomically supersede the prior working snapshot and create one new Draft revision.
`AbandonDocumentRevision` closes/revokes any open review round, is the explicit Draft/In Review
terminal path, and clears the working head without changing the Approved head. Finalizing a
successor and superseding the prior Approved head are one compare-and-swap transaction.

Archive is exact rather than a loose overlay toggle. It rejects while a Draft/In Review working head
exists; the caller must first finish or abandon that revision. With no active reliance it moves the
active Approved pointer, when present, to `archivedApprovedHeadRevisionId`, clears both active
heads, and sets the archive overlay atomically. With active reliance it performs the same pointer
move and material stale-generation transaction defined below or rejects without change. Archived
bytes remain readable as history but are not active, reliance-eligible, or mirror-current.

Archive also creates an exact current-head navigation intent that renders a safe archived marker; it
never deletes or rewrites an immutable version path. That mirror may be degraded while Opzava's
archive authority remains true and any mirror-required gate stays closed.

Restore compares the exact archive and aggregate versions, requires both active heads absent and no
nonterminal invalidation generation, clears the overlay, and creates exactly one new Draft whose
predecessor is the archived Approved revision when one exists, otherwise whose provenance cites the
archive decision for the never-approved document. It does not restore the old Approved pointer,
approvals, or reliances. A stale or concurrent restore cannot create a second working head. There is
no “archive and repair dependents later” window.

### Supporting records

| Record                                  | Owns                                                                                                                                                | Does not own                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `DocumentLifecycleDecision`             | immutable transition, exact versions, actor/source, approval policy/result, reason                                                                  | document bytes or consuming workflow state                     |
| `DocumentApprovalRequirement`           | one stable slot in the exact type/profile policy, required role/binding class, policy version, status and satisfaction rule                         | an approval decision or blanket owner authority                |
| `DocumentApprovalDecision`              | exact requirement/revision/hash/policy/role/authorization versions, approver, nonce, decision, expiry/revocation and reason                         | reuse for another revision, round, slot, or authorization      |
| `DocumentFinalizationAuthorityEnvelope` | exhaustive type/source authority kind, exact revision/round/policy/owner versions, required decisions or cross-owner receipt, nonce and consumption | generic Docs authority or duplicated Incident/Sprint decision  |
| `DocumentRelation`                      | navigational target kind/ID, label, relation type, actor/time, active/retired state                                                                 | gate authority, requirement satisfaction, current target state |
| `DocumentReliance`                      | relying owner/aggregate/version, exact document/revision/version/hash, requirement selectors, purpose, policy version, state                        | a mutable “current” pointer or copied document bytes           |
| `DocumentRelianceCarryForward`          | old/new revisions, old/new reliance versions, equivalence policy/hash, approver, consuming-owner receipts                                           | broad reuse or mutation of the original reliance               |
| `DocumentInvalidationGeneration`        | approved-head transition, materiality, complete reliance snapshot, stale marks, fan-out cursor/results, terminal/blocked state                      | direct lane, Sprint, Review, or Release mutation               |
| `DocumentRelianceInvalidationRequest`   | generation/target/owner kind, exact old reliance set, replacement/cause, owner/gate snapshots, intended effect, idempotency/hash and receipt        | duplicate targets, invented content, or direct Docs mutation   |
| `RelianceInvalidationInterruption`      | DevTicket-owned live-authority fence, cause/request/reliance, claim/lease/grant/tunnel/process snapshots and containment phases                     | an AcceptedPendingApplication, content Revision, or Docs state |
| `RelianceInvalidationContainmentProof`  | exact interruption/request, stopped-or-quarantined process and every grant/tunnel/artifact-writer confirmation, producer/nonce/version              | Ready/lane/Sprint mutation or a generic Review proof           |
| `DocumentMirrorPublication`             | one revision publication, ordered immutable-version/current-head legs, combined health and completion                                               | provider confirmation or lifecycle approval                    |
| `DocumentHeadPublication`               | one monotonic desired-head generation for approval/archive/restore/relation rendering, desired intent, shadow and supersession                      | immutable revision bytes, provider base, or document authority |
| `DocumentMirrorIntent`                  | operation, exact path/ref/bytes/render hash, desired head generation, immutable request identity, dispatch/unknown state                            | provider success by assertion or a force update                |
| `DocumentMirrorAttempt`                 | one intent attempt, freshly reserved base ref/tree/path facts, exact commit parent, claim/fence, provider request and observations                  | permission to overwrite a changed base or alter desired bytes  |
| `DocumentMirrorShadow`                  | last mutually confirmed canonical render/path plus Opzava and provider versions                                                                     | lifecycle authority or last-write-wins timestamp               |
| `DocumentMirrorConflict`                | exact base/Opzava/provider facts, field/path scope, blocking class, version, decision/result                                                        | permission to overwrite either side silently                   |

## Canonical taxonomy and approval matrix

| Type              | Purpose and allowed authority                                                                       | Approval/finalization                                                                                                | Important boundary                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PRD`             | Product outcomes, users, behavioral requirements, acceptance and exclusions                         | current Document Owner slot                                                                                          | Does not specify detailed module shape where an RFC is required                                |
| `Planning Brief`  | Synthesized, bounded answer from grilling/planning, with unresolved items and recommended next step | current Document Owner slot before it becomes an authoritative work input                                            | A session log is source evidence, not the brief itself                                         |
| `RFC/Design Spec` | Cross-module behavior, interfaces, state, failure, security, and verification contract              | current Document Owner slot plus every slot declared by the versioned profile policy                                 | Review Gate and Releases Gate contracts are profiles of this type                              |
| `Research Note`   | Sourced findings, uncertainty, experiments, and recommendations                                     | Author may finalize under policy without a Document Owner approval slot                                              | Evidence only; it cannot change policy or invalidate work by itself                            |
| `ADR`             | Durable architecture decision, context, alternatives, and consequences                              | current Document Owner slot                                                                                          | Does not replace executable acceptance or a runbook                                            |
| `Runbook`         | Bounded operating/recovery procedure, prerequisites, verification, rollback, and escalation         | current Document Owner slot                                                                                          | Cannot grant secrets, bypass a gate, or redefine desired workflow                              |
| `Postmortem`      | Incident timeline, impact, contributing factors, response, learning, and follow-ups                 | Accountable Incident owner or other policy-authorized verified human                                                 | It never resolves the Incident or changes policy; changes require a separate governed document |
| `Sprint Plan`     | Exact Goal, ordered membership, contract/dependency bindings, policy, approval, and revision        | Sprint Human Owner through the authoritative Sprint command                                                          | Sprint owns Goal/Plan/membership/order; Docs is the exact governed representation              |
| `Sprint Report`   | Terminal outcome, final Plan, dates, interruptions, unfinished scope, metrics, refs, and evidence   | system-finalized by the authorized terminal Sprint command; correction is a new Sprint Human Owner-approved revision | Completed/Cancelled/Aborted history is not rewritten                                           |

The `review-gate` and `releases-gate` RFC profiles require the Document Owner slot above **and**
their exact profile-policy slots. In v1 the same Opzava Owner identity may satisfy more than one
slot only when each slot's versioned separation policy permits it; each requirement, authorization
check, decision, and nonce remains distinct. An agent may draft or submit any type allowed by
policy; it cannot fabricate a required human approval, an Incident owner decision, a Sprint terminal
fact, or a profile approval.

Submission materializes the exact `DocumentApprovalRequirement` set for that immutable revision and
review round. Each requirement is independently `pending` or `satisfied`; each decision is
`approved`, `rejected`, `expired`, or `revoked`, with only one current decision per requirement and
round. An approval binds the current requirement, revision/hash, type/profile policy, approver role
and authorization versions, owner binding where applicable, single-use nonce, and expiry. It does
not swap either document head.

`FinalizeDocumentApproval` is the sole transition to Approved. Under one compare-and-swap it proves
every required slot has a current unexpired `approved` decision, validates and consumes the exact
type-specific authority envelope below, then performs the head/mirror/invalidation transaction. A
missing, expired, revoked, role-lost, stale-policy, mismatched envelope/owner receipt, or rejected
slot leaves the revision outside Approved. `RejectDocumentRevision` records the rejecting slot and
safe reason, revokes all approvals collected for that review round, and returns the revision to
Draft. `ExpireDocumentApproval` and `RevokeDocumentApproval` append their reason and prevent
finalization without erasing history. Resubmission creates a new round and fresh nonces; no decision
carries between rounds or revisions.

Finalization also consumes exactly one discriminated `DocumentFinalizationAuthorityEnvelope`; the
allowed kinds are exhaustive:

| Kind                       | Applicable type                                    | Required authority                                                                                                                               |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `document_policy`          | PRD, Planning Brief, RFC/Design Spec, ADR, Runbook | every current Document Owner/type/profile requirement decision                                                                                   |
| `research_author_policy`   | Research Note                                      | exact verified author, author-policy/version and any policy-required decisions; no Document Owner approval slot                                  |
| `incident_owner_receipt`   | Postmortem                                         | single-use Incident-owner receipt binding Incident/version, owner/authorization version, document revision/hash, policy and nonce                |
| `sprint_plan_receipt`      | Sprint Plan                                        | single-use authoritative Sprint command receipt binding Sprint/Plan/member/order/version, Sprint Human Owner approval and document revision/hash |
| `sprint_terminal_receipt`  | first Sprint Report                                | single-use terminal Sprint command receipt binding final lifecycle/Plan/report facts and document revision/hash                                  |
| `sprint_report_correction` | corrected Sprint Report                            | immutable predecessor/terminal receipt plus current Sprint Human Owner approval bound to the correction revision/hash                            |

Any type/kind mismatch rejects. Incident/Sprint commands own their decisions and emit the receipt;
Docs consumes it once and cannot recreate, reinterpret, or bypass it. Finalization always CAS-checks
the current `documentOwnerBindingId/version` as aggregate-concurrency state, but that binding is an
approval gate only when the applicable requirement set says so. It reauthorizes only the envelope's
actual actors/owner receipt and every applicable requirement—never a generic Document Owner in place
of an author, Incident owner, Sprint owner, or terminal command.

A finalized Research Note may be linked or cited. It becomes an invalidating dependency only when a
consuming governed contract explicitly creates an exact `DocumentReliance`; later changes to the
note never silently change that reliance.

## Planning Session Log contract

A Planning Session Log is an authoritative append-only stream in the planning decision ledger. It is
neither a governed document nor a rebuildable projection. Each entry contains:

- session ID, monotonic session sequence, command ID, scoped idempotency key and request hash;
- exact verified participant/actor/source and authorization version;
- source event time plus recorded time, with uncertainty stated when only a date is known;
- one entry kind: `question`, `recommendation`, `human_decision`, `rejected_alternative`,
  `unresolved_item`, `scope_note`, or `correction`;
- Secret-Safe canonical content, content hash, and policy/scanner version; and
- optional `correctsEntryId`, related document/revision/DevTicket/Goal refs, and safe provenance.

Entries never contain hidden model reasoning, chain-of-thought, raw tool output, raw prompts,
secrets, tokens, noisy execution telemetry, or invented quotations/timestamps. Assistant summaries
are attributed as syntheses; human decisions are attributed only to authenticated human actions.

`CorrectPlanningSessionEntry` appends a correction and never changes or deletes the original.
Exceptional legal/security removal follows #235: replace exposed readable material with a safe
tombstone and integrity hash while preserving sequence, actor, reason category, and cross-links.

The Docs UI and deterministic GitHub Markdown log are projections of this authoritative stream. A
content-addressed snapshot records an exact sequence range and entry-set hash but does not gain a
Docs lifecycle or approval. A synthesized Planning Brief or PRD is a separate `DocumentRevision`
whose provenance lists exact session IDs, entry ranges/IDs, and snapshot hash. The synthesis may
exclude noise, but it must preserve decided requirements, rejected alternatives that affect the
answer, and unresolved items.

## Relations, reliance, and traceability

### Navigation is not proof

`DocumentRelation` may connect one document to multiple Goals, Sprints, DevTickets, Incidents, and
Work Areas. It powers search, browsing, backlinks, and context panels. Adding or removing it does
not satisfy a gate, invalidate approval, or prove the target consumed the document.

### Exact reliance

`DocumentReliance` is created only by an authorized command at the consuming owner's boundary. It
binds:

- relying owner namespace, aggregate ID, and exact owner version;
- document ID, revision ID, monotonic revision, canonical hash, and approval/profile-policy refs;
- stable requirement selectors and their revision-scoped IDs;
- reliance purpose such as `ready_input`, `sprint_policy`, `review_gate`, `release_gate`,
  `runbook_prerequisite`, or `evidence_source`;
- materiality/equivalence policy version, created actor/source/time, and state `active`,
  `stale_pending_fanout`, `carried_forward`, `replaced`, or `retired`; and
- current mirror-integrity requirement where GitHub history is a gate prerequisite.

It never follows `approvedHeadRevisionId` or `current.md`. A newer approved revision changes no
consumer until the exact old reliance is carried forward, replaced through its owner command, or
marked stale by material invalidation.

### Requirement-to-evidence chain

Every approved PRD, Planning Brief, or RFC requirement has a stable ID unique inside that immutable
revision. Renumbering display order does not change the ID. A selector removed, split, merged, or
meaningfully changed is material unless a versioned equivalence policy proves otherwise.

The trace graph records exact edges:

```text
Document requirement ID
  -> Ready Contract sad-path / edge-case / acceptance / E2E / evidence-expectation IDs
  -> Ready Contract Version + Ready Approval
  -> Sprint Plan membership/order binding where present
  -> locked candidate SHA + Review run/evidence/result under exact Review RFC profile
  -> Done merge fact
  -> Release Manifest / Release Evidence requirement under exact Release RFC profile where present
```

A missing edge is visible and blocks only the gate that requires it. A link, copied requirement
text, GitHub checkbox, green check, or model assertion is never an edge. Review evidence names the
exact contract/reliance lineage and locked SHA. Release evidence names the exact immutable manifest,
environment/attempt, and relied RFC revision.

Non-semantic carry-forward appends `DocumentRelianceCarryForward` plus every required WF-230 Ready,
Sprint Plan, and Execution Binding Carry-Forward. It never updates the old row in place. Any
protected-field, requirement-set, hash, policy, owner-version, or profile mismatch rejects the
carry-forward and routes to material invalidation.

## Command boundary

### Public and internal commands

| Command                                                                                                        | Required authority and effect                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateGovernedDocument`                                                                                       | authorized author; reserves stable ID/type/path coordinates, first immutable Draft and its version publication                                                              |
| `CreateDocumentRevision`                                                                                       | exact document/working/approved versions; creates one immutable Draft successor and its version publication                                                                 |
| `TransferDocumentOwnership`                                                                                    | current Document Owner or policy administrator; CAS exact owner/authorization versions, revokes stale pending decisions, transfers no other authority                       |
| `SubmitDocumentRevisionForReview`                                                                              | authorized author; Draft → In Review under exact policy                                                                                                                     |
| `ReturnDocumentRevisionToDraft`                                                                                | authorized reviewer/approver; appends changes-requested decision, In Review → Draft                                                                                         |
| `WithdrawDocumentRevisionReview`                                                                               | authenticated submitter or current Document Owner under policy; In Review → Draft                                                                                           |
| `ApproveDocumentRequirement`                                                                                   | exact requirement/round/revision/policy/role/authorization and nonce; records one slot decision but does not swap heads                                                     |
| `RejectDocumentRevision`                                                                                       | authorized required slot; records rejection, revokes collected round decisions, and returns In Review → Draft                                                               |
| `ExpireDocumentApproval` / `RevokeDocumentApproval`                                                            | policy/system or current authorization owner; appends terminal decision state and prevents finalization                                                                     |
| `FinalizeDocumentApproval`                                                                                     | consumes exact type-specific authority envelope, proves every current slot, approves/supersedes, classifies materiality, activates head publication/invalidation atomically |
| `AbandonDocumentRevision`                                                                                      | authorized author/Document Owner; Draft/In Review → Superseded and clears the sole working head                                                                             |
| `ArchiveGovernedDocument`                                                                                      | requires no working head; rejects active reliance or uses exact invalidation, clears active Approved head and advances archived-marker head generation                      |
| `RestoreGovernedDocument`                                                                                      | authorized owner; CAS archived/no-active-head/no-generation state, creates one new Draft/version and advances restoration-marker head generation                            |
| `AddDocumentRelation` / `RemoveDocumentRelation`                                                               | navigation-only relation CAS; advances head generation only when an Approved/archive/restoration head exists, otherwise defers rendering                                    |
| `BindDocumentReliance` / `ReplaceDocumentReliance`                                                             | consuming owner validates exact revision/requirements/policy and current gates                                                                                              |
| `CarryForwardDocumentReliance`                                                                                 | consumes exact equivalence decision and appends immutable carry-forward receipts                                                                                            |
| `StartPlanningSession` / `AppendPlanningSessionEntry` / `CorrectPlanningSessionEntry` / `ClosePlanningSession` | planning-ledger append only; closing prevents ordinary append but permits correction/tombstone                                                                              |
| `AdvanceDocumentInvalidation`                                                                                  | internal worker advances one generation/target under claim token and current owner versions                                                                                 |
| `RetryDocumentInvalidation`                                                                                    | authorized bounded retry of the same generation/target; cannot change intended effect                                                                                       |
| `ApplyDocumentRelianceInvalidation`                                                                            | WF-230 DevTicket owner invalidates exact relied authority and applies lane/claim/containment policy without accepting content                                               |
| `PrepareRelianceInvalidationInterruption` / `FinalizeRelianceInvalidationInterruption`                         | DevTicket owner fences live authority and emits exact containment proof without an AcceptedPendingApplication or workflow mutation                                          |
| `ApplySprintDocumentRelianceInvalidation`                                                                      | Sprint owner coordinates Draft Plan/reliance revision, active approval invalidation, or terminal history according to exact phase                                           |
| `ApplySprintMemberDocumentRelianceInvalidation`                                                                | Sprint coordination owner atomically invalidates exact member/Plan approval plus DevTicket Ready/lane/reliances, consuming containment proof                                |
| final #229 Review invalidation command                                                                         | Review owner applies its final named compatibility/containment behavior; this memo fixes the request/receipt seam, not the command name                                     |
| `ApplyReleaseDocumentRelianceInvalidation`                                                                     | WF-236 Release owner applies exact phase/evidence/approval/containment behavior without Docs mutation                                                                       |
| `ReconcileUnknownDocumentMirrorEffect`                                                                         | compares exact provider facts with the existing unknown intent; no new write identity                                                                                       |
| `ResolveDocumentMirrorConflict`                                                                                | current Document Owner decision bound to exact conflict/base/provider/Opzava versions                                                                                       |
| `RequestDocumentMirrorReplay`                                                                                  | replays the same authorized intent/hash after health and state revalidation                                                                                                 |

`FinalizeDocumentApproval` does **not** call `AcceptRevision` for every DevTicket, rewrite Sprint
Plans, cancel Review, or mutate Release aggregates inside the Docs transaction. It commits the new
document authority, exact stale reliance facts, and one resumable invalidation generation. Each
owner later consumes an idempotent internal invalidation request and applies its already-governed
behavior without manufacturing a human content decision.

### Universal admission and security ordering

All commands inherit WF-230's server-constructed envelope, verified source/principal, complete
expected-version set, scoped idempotency key and canonical request hash, RLS tenant admission,
authorization versions, correlation/causation IDs, and accepted/rejected receipt behavior.

For content-bearing commands the order is:

1. verify transport authenticity and coarse tenant/target-family admission without revealing a
   guessed document or idempotency result;
2. run Secret-Safe Ingress on every title, body, reason, relation label, source excerpt, Markdown
   attribute/URL, and attachment metadata **before** command receipt reservation, replay,
   persistence, logging, notification, outbox, or error echo;
3. on suspected secret content, persist only safe Absolute Stop/containment metadata permitted by
   WF-230—never raw input or an ordinary document rejection containing it;
4. reauthorize exact role/type/profile/target, lock rows in canonical order, validate expected
   versions and policy, reserve/replay the idempotency receipt, then commit domain facts and outbox;
   and
5. render GitHub Markdown with active HTML escaped/removed, unsafe schemes rejected, link targets
   normalized, and no path traversal, Unicode/case collision, or repository-root escape.

Same authorized key plus same canonical request hash returns the original result. Same key with a
different actor/source/target/hash is a conflict or authorization denial without disclosing the
other result. Unauthenticated or pre-admission requests create no command/document/planning record.

## GitHub Markdown mirror

### Deterministic paths and render

Each immutable revision renders to:

```text
docs/dev-board/<type-key>/<immutable-slug>--<document-id>/versions/v000001-<sha256>.md
```

The same document has one navigation-only head:

```text
docs/dev-board/<type-key>/<immutable-slug>--<document-id>/current.md
```

`type-key`, slug, and document ID are path-safe immutable coordinates. The slug is normalized once
with a versioned algorithm; title edits change front matter/display only. Reject `..`, separators,
device names, control/bidi tricks, invalid Unicode, case-fold collisions, duplicate normalized
paths, and any path outside the managed root.

The version file contains deterministic safe front matter and sanitized Markdown. It names the
document/revision/type/version/canonical hash, immutable creation facts, safe attribution/
provenance, requirement IDs, and immutable correlation marker. It does not embed a mutable lifecycle
snapshot. Mutable approval/lifecycle, relations, current mirror health, and provider timestamps do
not enter its canonical content hash. `current.md` points/readably renders the optional Approved
head or exact archived/restoration marker plus current navigation metadata and has a separate
render/shadow hash. It is never a reliance target or proof that approval exists.

Planning Session Log snapshots use exact separate paths:

```text
docs/dev-board/planning-sessions/<session-id>/snapshots/e000001-e000123-<entry-set-sha256>.md
docs/dev-board/planning-sessions/<session-id>/current.md
```

The immutable snapshot binds the exact sequence range and entry-set hash. Its navigation head is a
ledger projection, not a mutable entry or a governed-document head. Checkpoint/close commands create
ordered snapshot/head intents through a separate planning-log command family on the same dedicated
Docs mirror infrastructure. They use the provider confirmation, unknown-effect, base-CAS, and
head-generation rules below. Provider edits are conflict/evidence only and can never import or
attribute a planning decision.

### Ordered publication, provider confirmation, and unknown effects

Creating every immutable `DocumentRevision`, including a Draft, creates one
`DocumentMirrorPublication` whose immutable-version leg starts `pending` and whose current-head leg
is `not_applicable`. This preserves draft/abandoned history without claiming approval. Finalization
CAS-activates that same revision's head leg as `waiting_version`; it cannot dispatch until the exact
version intent is independently confirmed and it never creates a duplicate version intent. The
publication state is derived as `version_pending`, `head_pending`, `complete`, `degraded`, or
`conflict`. Confirmation of the immutable version followed by an unknown or conflicting head leaves
the publication `degraded` or `conflict`, never green. A gate requiring a confirmed Docs mirror
accepts only `complete` for its exact publication. The immutable version leg continues despite stale
dependents or a head conflict because durable history must remain inspectable.

Each leg has one exact ref/path/bytes/render hash/request identity. Only when a leg is dispatchable
does a worker atomically create `DocumentMirrorAttempt`, claim the intent, and reserve a complete
fresh provider base ref SHA, tree, and affected-path blob/absence observations. For an ordered head
leg, dispatchability requires its version confirmation and a base that contains that exact version
blob; the base may be a verified descendant containing other confirmed disjoint App writes. The
worker re-fetches and compares the reservation immediately before send, constructs the commit with
that exact base as its sole parent, and requests a non-force ref advance.

If the ref changes before send, the attempt sends nothing. If it changes during send, the
non-fast-forward advance fails. Reconciliation may reserve a new attempt base under the same desired
intent only after complete B/O/G classification proves all intervening writes are confirmed,
authorized, and disjoint from its managed path/fields. The one same-path exception is an exact
correlated expected-App write from a superseded lower `headGeneration` of the same aggregate: the
latest desired generation may use that observed commit as base and repair it, while the older
generation never advances the current shadow. Any other same-path/field or unverifiable change opens
conflict. It never blindly rebuilds on “latest.” Provider `2xx`, a commit message, or a returned SHA
is an attempt, not success. The version leg confirms before the same publication's head leg is
admitted; retries never combine the two paths into one ambiguous write.

Every desired `current.md` change—approval, archive, restore, a relation-set change on an existing
Approved/archive/restoration head, or planning-log head—atomically increments a monotonic
`headGeneration` and creates one `DocumentHeadPublication` bound to document/log aggregate version,
relation-set version, and desired render hash. A relation change on a brand-new never-approved Draft
changes only the relation set; no `current.md` exists and first approval renders the then-current
relation version. Any head generation referencing an Approved revision waits for that exact version
confirmation. Before dispatch and before finalization, a worker CAS-checks that it is still the
latest desired generation. A late intent becomes `superseded` and cannot write; a provider-base CAS
failure opens conflict. Archive followed by restore, or a relation edit racing approval, cannot let
an older worker overwrite the newer head.

If an older attempt was already sent and is unknown, the newer generation stays
`waiting_prior_reconciliation` until complete observation resolves that attempt; it never races a
second same-path write. A later confirmed superseded App write is repaired only by the exact
lower-generation rule above.

Derived mirror health is truthful for the latest desired state and requires every immutable version
publication through the current aggregate version confirmed. A never-approved Draft has no head
requirement; an active Approved head additionally requires its version and latest head generation;
an archived/restoration-without-Approved state additionally requires its latest marker generation. A
superseded old intent does not degrade a confirmed newer generation, while a pending/unknown/
conflicting current version or latest generation reports degraded/conflict.

Confirmation requires a fresh authenticated observation of the expected repository and protected
mirror ref, exact path, blob bytes/hash, containing tree, commit, App/installation actor, and
correlation/request facts. Only then may the intent confirm and its `DocumentMirrorShadow` advance.

Timeout, disconnect, ambiguous response, worker crash after send, or uncertain ref state marks the
attempt `outcome_unknown` and blocks its stable intent. The intent retains desired identity/bytes
and the attempt retains its exact base/request; no new-base attempt is allowed until complete
observation confirms the original effect or proves the exact old base remained and the effect did
not occur. Complete fetch/reconciliation yields exactly one of:

- expected path/blob/commit correlation: confirm the original intent;
- previous shadow unchanged with provider identity/ordering still ambiguous: keep waiting until the
  bounded escalation policy requires Document Owner reconciliation, never infer absence; or
- different/multiple path, blob, ref, or actor facts: open/reuse a versioned conflict.

A later observation compares-and-sets against that same intent; it cannot confirm a superseded
intent or launch a duplicate write. An unknown version leg leaves the head leg waiting. An exact
version confirmation admits the head leg once. A confirmed version plus unknown/conflicting head
preserves the version shadow and reports combined publication degradation until the exact head
shadow converges.

### Inbound edits and conflicts

An immutable version-path modification, move, or deletion is an integrity/tamper conflict. It is
never imported as a revision and never rewrites history. Recovery re-establishes the exact immutable
bytes through an authorized intent or records exceptional #235 removal/tombstone; it does not bless
provider content by timestamp.

For `current.md`, compare per managed field/render region using:

- `B`: last confirmed mirror shadow;
- `O`: current Opzava approved/navigation render; and
- `G`: fresh complete provider render/observation.

The complete three-way matrix is:

| Comparison                                                                   | Classification and allowed next action                                                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `O == B` and `G == B`                                                        | converged; no write and no proposal                                                                                                 |
| `O != B` and `G == B`                                                        | Opzava-only change; queue/reconcile the exact current-head intent after its version leg confirms                                    |
| `O == B` and `G != B`                                                        | provider-only change; a verified mapped-human edit may propose a Draft after all admission checks, otherwise conflict/evidence only |
| `O == G` and both differ from `B`                                            | validate exact App/correlation or authorized provider proposal, then CAS the shadow; equality alone grants no authority             |
| disjoint managed fields changed on `O` and `G`                               | open conflict and permit an owner-validated deterministic merge proposal; never silently merge                                      |
| same managed field changed differently, path changed, or snapshot incomplete | open/retain conflict or degraded unknown; no write, import, or timestamp winner                                                     |

The `O == B, G != B` proposal path requires a complete fresh provider snapshot, a verified mapped
human, Secret-Safe Ingress, exact parser/path/front matter, and current authorization. It grants no
approval. Expected App echo confirms only the correlated intent. Third-party App/bot,
unknown/deleted actor, copied marker, malformed front matter, or unmanaged region is external
evidence/conflict with zero actor authority. A missing path is not deletion proof until a complete
stable provider traversal and health evidence distinguish first creation, expected absence, or
tamper; absence and timestamps never resolve authority.

The proposal also CAS-checks the one-working-head invariant. If a Draft/In Review head already
exists, it opens/reuses a conflict and never creates a competing Draft.

`DocumentMirrorConflict` progresses
`open -> decision_required -> resolution_pending_mirror -> resolved`. The current Document Owner
binds one decision to exact B/O/G, conflict, owner, policy, and provider-observation versions:

- **Keep Opzava:** queue the exact current-head render; resolve only after fresh provider
  confirmation advances the shadow.
- **Propose provider Draft:** allowed only for the verified mapped-human/Secret-Safe path above;
  normal review and approval still apply, and the conflict resolves only when provider/current
  shadow converges.
- **Merge disjoint changes:** create a deterministic owner-validated Opzava proposal, then resolve
  only after exact provider confirmation.
- **Immutable version recovery:** restore only the exact Opzava version bytes or follow #235's
  sanitized tombstone path; provider content never wins or imports into immutable history.

A partial or unverifiable observation leaves the conflict and publication degraded. The decision
fact alone never advances a shadow or reports resolution.

GitHub unhealthy or unverifiable keeps last-confirmed documents readable with explicit freshness,
but blocks gates whose policy requires confirmed mirror integrity. It never changes Approved to
Draft/Superseded. Suspected secret exposure opens the unbypassable Absolute Stop and #235
redaction/revocation path.

## Materiality and invalidation protocol

### Classification

No invalidation:

- creating/editing/submitting/returning/withdrawing a Draft or In Review successor;
- appending/correcting/closing a Planning Session Log;
- adding/removing `DocumentRelation` navigation metadata;
- finalizing a Research Note that no current aggregate relies on; or
- a mirror retry/confirmation that proves the same bytes and authority.

Non-semantic replacement requires a versioned policy to prove unchanged meaning, requirement set,
profile inputs, safety, and behavior. It always creates a new immutable approved revision and exact
carry-forward receipts. Whitespace normalization or a typo may qualify; a caller or model cannot
downgrade materiality. Any uncertainty is material.

Material by default:

- any requirement, outcome, bounded scope, sad path, edge case, acceptance, E2E, evidence
  expectation, dependency, risk, approval, security, secret reference, or policy change;
- requirement ID deletion/split/merge or changed selector meaning;
- Review/Release gate profile, reviewer/tool/model, environment, evidence, approval, or irreversible
  boundary change;
- type/path identity or approver-policy change; and
- archive/supersession/redaction that makes exact relied content unavailable or incomplete.

### Atomic approval and fan-out

Finalizing a material successor locks, in canonical order, the document, approved/working revisions,
approval/policy, relation/reliance set, every current active reliance identity and relying-owner
version snapshot, current invalidation generation, mirror intent namespace, and actor authorization.
It atomically:

1. appends the approval and materiality decision;
2. swaps `approvedHeadRevisionId`, clears the working head, and appends predecessor supersession;
3. marks every affected exact reliance `stale_pending_fanout`;
4. creates one `DocumentInvalidationGeneration` with a canonical target-set hash and target rows;
5. makes all consuming admission queries fail closed from those stale rows immediately;
6. appends one lifecycle/activity fact, activates the existing revision publication's current-head
   leg, and creates the new monotonic head generation; and
7. queues idempotent internal fan-out and notifications.

All commit or none commit. The new immutable document mirror is never blocked by its own stale
dependents. Dependent GitHub Issue/status/Plan/Review/Release projections wait for their owning
command result so they cannot display partly valid authority.

A zero-target generation is created and completed in the same transaction so its audited
classification remains explicit without leaving a phantom pending worker.

V1 serializes authority changes per document: while a generation is nonterminal, another
material/non-semantic finalization, archive, or restore rejects. A generation permits
`open -> running`, `running -> blocked | completed`, and `blocked -> running`; the retry transition
occurs only when an authorized command makes at least one blocked target pending under fresh
expected versions. It is never silently superseded. Each target progresses
`pending -> claimed -> owner_applied | owner_blocked | terminal_history`. Only `owner_applied` and
`terminal_history` are terminal. `owner_blocked -> pending` requires authorized
`RetryDocumentInvalidation` after recording the new current owner versions and resolved condition;
late workers are fenced by generation ID, target-set hash, claim token, and current-generation CAS.

Each target owns a `DocumentRelianceInvalidationRequest` containing generation/target ID, exact old
reliance set/document/revision/hash, discriminated cause `material_successor | archive | redaction`,
owner kind `ordinary_dev_ticket | sprint | sprint_member | review | release`, optional replacement
revision/materiality/approval, every relying aggregate and expected version, current Ready/Sprint/
Review/Release binding snapshots, policy and authorization versions, intended effect, idempotency
key, and canonical request hash. `material_successor` requires all replacement fields; `archive`
forbids them and binds the archive decision/version; `redaction` binds the #235 request and optional
sanitized successor/tombstone refs. Target construction groups all reliances that require one
cross-owner atomic result: a Draft/Approved/Queued/Active nonterminal Sprint member produces one
`sprint_member` target rather than independent Sprint and DevTicket targets. A worker reauthorizes
and locks the exact current owner versions, invokes that owner's named compatibility port, and
stores the immutable owner receipt. It does not replay a human DevTicket Revision decision:

- An ordinary non-Sprint DevTicket/Ready consumes `ApplyDocumentRelianceInvalidation`: it
  invalidates authority previously granted against that exact reliance. The idle Backlog/Todo path
  atomically invalidates the Ready Approval, retires the old reliance, and applies WF-230's
  dependency/lane rules. A provisioning/start/In Progress/Blocked path instead creates one
  `RelianceInvalidationInterruption` and uses the prepare/finalize commands below. Neither path
  edits Ready Contract bytes or accepts a human Revision; changed content is a separate governed
  `ProposeRevision` path.
- A Sprint-only Plan reliance consumes `ApplySprintDocumentRelianceInvalidation`. Draft uses its
  coordinated Draft Plan/reliance revision and remains Draft with no approval to invalidate.
  Approved/Queued/Active stops new selection/activation and marks the exact Plan approval Needs
  Re-approval under the current Sprint version. Completed/Cancelled/Aborted records
  `terminal_history`. The command never fabricates Sprint Human Owner approval.
- A Draft/Approved/Queued/Active nonterminal Sprint member consumes
  `ApplySprintMemberDocumentRelianceInvalidation`. The Sprint coordination owner locks the Sprint,
  exact Plan/member/grant/selection/hold versions and the DevTicket Ready/lane/claim/lease/resource
  versions as one unit. Draft atomically creates the coordinated Plan/member reliance revision,
  remains Draft, and invalidates affected DevTicket Ready/lane/reliances without inventing an
  approval. Approved/Queued/Active idle apply atomically marks the Plan Needs Re-approval/stops
  selection and invalidates DevTicket Ready/lane/reliances. Live apply first consumes the exact
  `RelianceInvalidationContainmentProof`, then makes those Sprint and DevTicket effects in one
  transaction and one composite owner receipt. Neither an independent DevTicket target nor a second
  Sprint target exists for that member.
- Review consumes the final #229 compatibility port and command without this memo inventing its
  name. The target stays blocked until that owner returns its exact authenticated containment/
  evidence receipt.
- Release consumes `ApplyReleaseDocumentRelianceInvalidation`: it applies the exact WF-236 phase,
  approval, evidence, containment, and forward-fix rules without Docs mutating Release state.

Creating the original `DocumentReliance` is the consuming owner's consent for later automatic
invalidation of that exact authority; it is not consent to new content. Therefore these commands may
revoke or contain obsolete authority but cannot choose replacement wording, approve a Plan, accept a
DevTicket Revision, or fabricate a human decision.

`RelianceInvalidationInterruption` is deliberately distinct from WF-230's
`MaterialRevisionInterruption`: it has no `AcceptedPendingApplication` and cannot enter that
record's apply path. Prepare CAS-locks the invalidation request, exact reliance, DevTicket/Ready
Approval, lane, assignment, Claim Attempt, Execution Lease/fence, capacity/worktree, current Blocked
Episode, credential/tunnel grants, process/checkpoint, Sprint bindings, and any existing
interruption. It atomically fences activation/ordinary execution, records the intended
Ready/lane/reliance effect, and issues idempotent checkpoint/stop/quarantine and revocation requests
through WF-230's existing owners. Finalize reauthorizes the same snapshots and requires no-process
or authenticated stopped/quarantined proof plus every grant/tunnel/artifact-writer confirmation; it
emits one single-use `RelianceInvalidationContainmentProof` and performs no Ready/lane/Sprint
mutation. The ordinary DevTicket or composite Sprint-member apply command consumes that proof
atomically with its owner effects and resource release. `prepared -> containing -> contained` is
monotonic; conflict with a material Revision, Absolute Stop, or Blocked finalizer is decided by the
shared exact locks, and the loser attaches to the winning compatible containment or remains
`owner_blocked`. #237 must project this explicit DevTicket/Sprint coordination amendment alongside
WF-230; Docs never owns or finalizes it.

A worker then follows exact recovery rules:

- if the consuming contract must change, it creates/links the governed proposed Revision and blocks
  admission pending its authorized decision;
- if the existing owner already records the same invalidation, it attaches that receipt;
- if Done/Released is immutable history, it records `terminal_history` and requests a follow-up
  rather than changing history; and
- if the owner moved concurrently, it records the fresh conflict/blocked reason and retries only
  under a new expected-version snapshot within the same generation.

For gate races, both the consumer gate and invalidation command lock/read the exact reliance row and
owner version. If the consumer commits first, the approval transaction snapshots the new owner state
(including terminal history) and creates the corresponding target. If stale marking commits first,
the consumer rejects before crossing its gate and the owner command applies. No timing gap permits
use of known-stale authority.

Crash or partial fan-out remains visible as `Invalidation pending`; no consumer whose reliance is
stale may claim/start/admit Review/Done/approve Sprint/promote Release merely because its individual
worker has not run. Old reliance stays `stale_pending_fanout` for `pending`, `claimed`, or
`owner_blocked`; it becomes `replaced` after a new exact reliance binds, `retired` when the owner no
longer relies or is terminal history, or `carried_forward` only through the proven non-semantic
protocol. A generation becomes `completed` only when every target is terminal and every old reliance
has one of those final states. Any `owner_blocked` target makes the generation `blocked`, never
green. Same generation/target/hash retries replay; a changed intended target set waits until this
generation completes and then belongs to a new authority change.

### State matrix

| Relied target/state                                                         | Material approved successor or relied-head archive/redaction                                                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backlog DevTicket                                                           | keep Backlog; mark shaping/Ready inputs stale; require governed contract update before Ready approval                                                                                                |
| Todo, idle                                                                  | immediately unclaimable; WF-230 owner invalidates Ready Approval and moves to Backlog through its exact Revision/Sprint rules                                                                        |
| Todo provisioning or start pending                                          | immediately blocks activation; DevTicket owner prepares/finalizes one Reliance Invalidation Interruption for fencing, revocation, containment, confirmation, then Backlog apply                      |
| In Progress                                                                 | immediately blocks further ordinary authority; DevTicket owner prepares/finalizes the Reliance Invalidation Interruption; no Docs-owned fence/release                                                |
| Blocked                                                                     | preserve current Blocked/containment owner; the Reliance Invalidation Interruption shares exact locks, attaches to winning containment, and never duplicates a finalizer                             |
| Review before Done                                                          | block new verdict/Done; exact pre-Done evidence and profile binding become stale; final #229/#230 seam contains/exits/re-runs without Docs inventing Reviewer commands                               |
| Done                                                                        | preserve contract, evidence, verdict, merge, and history; create a follow-up DevTicket or exceptional governed correction under WF-230                                                               |
| Draft Sprint                                                                | update exact Plan/member reliance only through the coordinated Draft command; remain Draft, no approval carry-forward                                                                                |
| Approved/Queued/Active Sprint                                               | stop new selection/activation; mark exact Plan approval Needs Re-approval; use Sprint Plan Revision Grant or exact non-semantic carry-forward; contain active member through its owner               |
| Completed/Cancelled/Aborted Sprint                                          | preserve final Plan/Report snapshot; corrective report is a new version and never changes outcome                                                                                                    |
| Review Gate RFC profile                                                     | new Review admission stops until the exact approved successor is installed; every not-Done result/evidence using the old material version is stale; #229 owns containment/re-run, not carry-forward  |
| Release Draft / Candidate before staging                                    | block next gate; invalidate affected policy/evidence and Staging/Production approvals; update only through a WF-236-permitted successor/re-evaluation                                                |
| Staging / StagingApproved / ProductionReady before irreversible request     | keep attempt/provider truth; block the next gate, invalidate affected approvals/evidence, and use only WF-236-permitted cancellation/supersession/successor/containment—never infer rollback success |
| `ProtectedMainPromotionRequested` or `StableTagCreationRequested` committed | no cancel, reseal, stable-version/RC reuse, or history rewrite; reconcile the same immutable Release, safety containment, or governed forward fix only                                               |
| production live with publication pending                                    | preserve observed production/request identities; reconcile the same publication without redeploy; changed contract permits only safety containment or an authorized forward fix                      |
| Released                                                                    | preserve Release, manifest, approvals, evidence, tags, and production history; new policy applies to a future Release/follow-up only                                                                 |

### Other invalidation and recovery cases

| Trigger                                   | Exact behavior                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Planning log append/correction            | no gate effect; only a later approved governed revision may change authority                                                             |
| Research Note Draft/additional evidence   | old exact reliance remains; a material approved successor that explicitly supersedes the relied head uses the normal invalidation path   |
| Relation add/remove                       | navigation projection only; no reliance or approval change                                                                               |
| Requirement display reorder               | no effect when stable IDs/content are equivalent; changed ID/meaning is material                                                         |
| Non-semantic approved successor           | CAS new head; append classification and all required document/Ready/Sprint/Execution carry-forward receipts atomically or reject         |
| GitHub current-head human edit            | Secret-Safe Draft proposal only; approved head/reliances unchanged until normal approval                                                 |
| Immutable GitHub version edit/delete/move | integrity conflict; block mirror-required gates and repair/tombstone; never import or LWW                                                |
| Mirror response lost/unknown              | retain same intent, reconcile provider facts, no blind retry or shadow advance                                                           |
| GitHub unhealthy/unverifiable             | cached read with freshness; unbypassable affected gate stop per WF-230/WF-236; mirror recovery does not grant approval                   |
| Invalidation fan-out crash/partial result | all stale gates stay closed; resume same generation; no duplicate owner mutation or falsely complete projection                          |
| Archive with active reliance              | reject or run material invalidation atomically; never orphan a current consumer                                                          |
| Restore                                   | append restoration fact and new Draft; no old approval/reliance revival                                                                  |
| Secret suspicion/exposure                 | no raw persistence; Absolute Stop, access/mirror containment, #235 coordinated redaction/tombstone, new sanitized revision where allowed |

## Ledgers and attribution

- **Planning decision ledger:** Planning Session entries/corrections, synthesis provenance, document
  Draft/revision/approval/equivalence/invalidation rationale, rejected alternatives, and unresolved
  items.
- **Dev Board activity/history:** accepted lifecycle, approval, archive/restore, reliance,
  carry-forward, invalidation-owner receipt, and affected workflow facts.
- **Runner execution/checkpoint:** only signed process/worktree/lease/checkpoint/containment facts
  created by its owner; Docs stores refs, never copies or fabricates them.
- **Synchronization/outbox/conflict:** document/log mirror intents, provider observations, shadows,
  conflicts, retries, unknown outcomes, and confirmations.

Stable IDs cross-link ledgers without a fictional global order. The actor chain distinguishes human
decision maker, assistant/agent author, Lead Orchestrator relay, source surface, Runner where
applicable, and system worker. The expected App can confirm delivery but cannot become the human or
agent author. GitHub names/body text never establish attribution.

Raw secret values, unredacted payloads, hidden reasoning, raw tool output, and noisy telemetry enter
none of these ledgers, Markdown mirrors, notifications, exports, screenshots, comments, or error
messages.

## Observable behavioral contract

The feature is correct only when all of the following are observable:

1. An authenticated authorized Admin can record a planning session, synthesize a Draft governed
   document, satisfy every distinct type/profile approval slot, finalize it, observe its ordered
   immutable-version then navigation-head publication in GitHub, and bind exact requirements to a
   DevTicket without leaving Opzava.
2. Creating a successor Draft leaves the prior approved head readable and every existing reliance
   valid. No consumer follows the Draft or `current.md` by accident.
3. Approving a proven non-semantic successor succeeds only with complete immutable carry-forward
   receipts; otherwise it follows the material path.
4. Finalizing a material successor makes all exact consumers visibly stale in the same transaction,
   blocks their next gates immediately, mirrors the new version, and eventually shows each exact
   owner request/receipt and reliance terminal state through a resumable generation.
5. A concurrent claim/start, Sprint activation, Review verdict/Done, Release promotion, approval,
   archive, mirror worker, or second successor sees complete expected-version locks: one outcome
   wins and the other returns an exact replay/conflict/stale result with no partial authority.
6. GitHub loss, ambiguity, tamper, or conflict never edits Opzava approval or history by timestamp.
   Cached data is labelled with freshness and affected gates fail closed.
7. Done and Released history remains identical after a later relied-document change; remediation is
   a follow-up, forward fix, or future policy application.
8. Unauthorized tenants/roles, agents claiming human authority, unsafe Markdown, path traversal,
   secret-bearing content, stale nonces, and mismatched idempotency hashes produce no leaked data or
   partial domain/outbox writes.

## Validation contract

### Real authenticated user-level flow

Drive one Admin flow through the real local Docker stack with normal login, real tenant/workspace
RLS, real Postgres, the real Docs UI/BFF/application boundary, and a dedicated real GitHub scratch
repository/branch installed through the test GitHub App:

1. start a Planning Session; append question, recommendation, human decision, rejected alternative,
   and unresolved item; append a correction and verify the original remains;
2. synthesize an RFC/Design Spec profile with stable requirements and exact log provenance; observe
   its immutable Draft version path while no Approved `current.md` head exists;
3. submit it, record every required human/profile slot, reject one review round, resubmit with fresh
   nonces, and finalize only after every current authorization is revalidated;
4. observe `current.md` dispatch only after the existing exact version confirms, then observe
   `complete` only after independently fetched blob/tree/commit/ref/App facts confirm the latest
   head generation too;
5. create a navigation relation and prove it changes no gate; bind exact reliance to a DevTicket and
   trace requirements to Ready acceptance/sad-path/E2E/evidence IDs;
6. create a successor Draft and prove the approved head/reliance stays active;
7. approve a material successor while a dependent claim or gate races; observe atomic stale state,
   blocked gate, new version mirror, and owner-specific fan-out completion; and
8. inspect light/dark themes, keyboard-equivalent actions, accessible status/decision text, and
   narrow viewport without hiding identity, approval, conflict, or stale state.

Model output may help draft prose but is never the oracle for approval, hashing, mirror
confirmation, materiality, trace completeness, invalidation, or gate behavior.

### Deterministic contract and regression checks

Use real Postgres application-command transactions and deterministic provider/owner seams to cover:

- dual-head uniqueness, lifecycle legality, monotonic versions, canonical UTF-8/LF hashing,
  type/path immutability, owner transfer, abandon, exact archive pointer clearing, and restore that
  creates one Draft without reviving Approved authority;
- tenant/RLS denial, role/profile denial, partial/multiple slot approval, reject/resubmit, expiry,
  revocation, owner transfer, every type-specific finalization envelope/receipt, type/source
  mismatch, receipt reuse, stale nonce, replay, same-key/different-hash, concurrent finalization,
  and stale expected versions;
- Secret-Safe pre-persistence rejection across database, receipt, log, outbox, Slack, GitHub,
  export, rendered HTML, serialized page data, and screenshot/search output;
- active HTML, unsafe schemes, malformed front matter, Unicode/case collisions, path traversal, and
  root escape;
- log sequence/idempotency/correction/close and exceptional tombstone behavior;
- every Draft/abandoned version publication; ordered approved version/head confirmation and combined
  health; App actor/correlation mismatch; timeout/lost response; late success; immutable-path
  tamper/delete/move; the complete B/O/G matrix; exact-base/non-force CAS failure; late archive/
  restore/relation generation fencing; conflict decision pending provider confirmation; partial
  snapshot; rate limit; health loss/recovery; and dead-letter replay;
- exact relation-versus-reliance behavior and requirement graph completeness;
- non-semantic carry-forward success and every hash/policy/requirement/owner-version mismatch;
- material invalidation racing Todo claim, provisioning, start, In Progress, Blocked, Review, Done,
  Sprint approval/activation, every WF-236 phase, archive, and a second successor; live DevTicket
  cases prove the distinct Reliance Invalidation Interruption and no AcceptedPendingApplication;
  nonterminal Sprint members prove one composite target/transaction and no split state;
- partial fan-out crash after zero, one, or many owner receipts; each owner command/request payload;
  consumer-gate races; worker reclaim/fencing; duplicate delivery; stale finalizer; retry from
  owner_blocked; visible generation/reliance state; and exact completion only after terminal
  receipts;
- Review RFC replacement fail-closing new admission and stale pre-Done evidence through the final
  #229 compatibility seam; and
- Release RFC replacement before an irreversible request (including each applicable lifecycle
  state), after protected-main/stable-tag request commit, while production is live/publication is
  pending, and after Released, with no forbidden cancel/reseal/reuse/redeploy.

Every scenario asserts database rows, immutable ledger facts, outbox identity, owner receipts,
browser-visible truth, and absence of raw secrets. A provider API `2xx`, mocked React state, model
statement, or successful background job exit is not sufficient proof.

## Sad paths and edge cases

- Two authors create a successor against the same working-head version: one wins; the other receives
  a stale/conflict result and no orphan revision/path.
- Approval role is revoked between review and commit: approval rejects under current authorization;
  no head swap, stale reliance, head activation/generation, approval, or invalidation write exists;
  the already-authorized immutable Draft version publication remains.
- Required profile approval is missing: the RFC remains In Review even if Document Owner approval is
  present; Slack/GitHub cannot fill the missing role by assertion.
- Sanitization changes the rendered bytes: canonical and render hashes remain distinct and visible;
  the provider must confirm the render hash, never the author-content hash by coincidence.
- A mapped human edits `current.md` while Opzava approves another successor: three-way conflict;
  neither side overwrites, and the provider edit grants no approval.
- The App writes the version but response is lost: the original intent reconciles/confirm; no
  duplicate version path or second commit is authorized blindly.
- A version path exists with the right bytes but wrong repository/ref/actor/correlation: do not
  confirm; open conflict/unknown state.
- Fan-out loses power after marking stale but before the first owner command: all affected gates are
  already closed and the same generation resumes.
- One owner reaches Done before the material approval transaction: the lock winner determines the
  result. If Done wins, record immutable terminal history/follow-up; never reopen it.
- Review or Release owner is unavailable: reliance remains stale and visible; no timeout turns it
  valid or cancels an irreversible Release.
- A Planning Session correction contradicts an approved PRD: no automatic authority change; a new
  governed revision and approval is required.
- A Research Note is withdrawn or corrected: exact consumers retain the cited old revision unless an
  authorized material replacement invalidates their reliance.
- Exceptional redaction removes relied text: affected reliance fails closed; safe tombstone/hash and
  owner-specific recovery remain, without pretending the historical event did not occur.

## Rejected alternatives

- **Use Git files as canonical document state.** Rejected because Git commits cannot enforce
  tenant/RLS, role/profile approval, exact reliance, cross-aggregate invalidation, or Secret-Safe
  admission and can be rewritten/deleted externally.
- **Add Review Contract, Release Contract, or Planning Log document types.** Rejected because the
  first two are RFC profiles and the last is an append-only ledger with different lifecycle and
  correction semantics.
- **Mutate an Approved document in place.** Rejected because every Ready/Sprint/Review/Release proof
  would silently change beneath its hash.
- **Make links follow current.** Rejected because navigation cannot be gate authority and would
  create unbounded implicit invalidation.
- **Bulk-call `AcceptRevision` during document approval.** Rejected because it fabricates dependent
  human decisions, crosses owners in one unbounded transaction, and cannot recover partial failure.
- **Delay stale marking until fan-out completes.** Rejected because a claim/Review/Release race
  could pass on known-obsolete authority.
- **Block the new document mirror while dependents are stale.** Rejected because it deadlocks the
  durable history needed to inspect and resolve the change.
- **Last-write-wins by GitHub or Opzava timestamp.** Rejected because clocks/delivery order are not
  authority and same-field divergence requires an explicit decision.
- **Reopen Done or Released after a policy revision.** Rejected because it rewrites successful
  historical gates; use follow-up work, forward fix, or future applicability.

## Implementation handoff and remaining ownership

Implementation decomposition must provide separate tracer bullets for the Docs aggregate and
planning ledger, trace/reliance graph, dedicated Git mirror adapter/reconciliation, invalidation
coordinator/owner adapters, Docs UI, migration/import, and real E2E harness. #237 owns that graph
and must consume the final #229 Review contract before naming its Review adapter commands.

#235 still owns retention durations, legal/secret exceptional removal orchestration, provider
redaction capabilities, and final tombstone/export policy. Until it lands, this contract fails
closed and requires only the safe tombstone/ref behavior stated above; it does not invent deletion
guarantees.

No implementation may treat this memo, a mirrored Markdown file, or a planning log as proof the
described aggregate, workers, provider permissions, UI, or tests already exist.
