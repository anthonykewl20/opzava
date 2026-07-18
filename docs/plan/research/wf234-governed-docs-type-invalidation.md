# WF-234 — Governed Docs type, planning-log, and invalidation matrix

**Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #237.**

**Status:** research memo for Wayfinder RESEARCH ticket
[#234 — Complete the governed Docs type, planning-log, and invalidation matrix](https://github.com/anthonykewl20/opzava/issues/234),
part of parent map
[#228 — Wayfinder: Dev Board implementation delivery graph](https://github.com/anthonykewl20/opzava/issues/228).
Read-only spec-grade synthesis. No git, no GitHub writes. Consumes locked #230/#231/#232/#236 decisions; it does not reopen them. Not implementation authority or product code. It becomes current #228 input only after the parent map records verified #234 closure and designates it for #237 synthesis; until then it is a target contract candidate and does not claim that the Docs view, governed-document aggregate, Git repository mirror, traceability graph, or invalidation workers are implemented.

**Authoritative inputs read:** `docs/plan/dev-board-foundation-decisions.md` (DBF ledger, governed Docs),
`docs/plan/research/wf230-devticket-command-model.md` (DevTicket revision/invalidation model, authenticated command envelope, Secret-Safe Ingress, Ready Contract revisions, lane-specific invalidation, Sprint coordination, execution containment, idempotency, ledger ownership),
`docs/plan/research/wf231-github-mirror-contract.md` (mirror/copy/conflict, actor attribution, GitHub App identity, provider observations, dimensional health, durable outbox, unknown-effect reconciliation, no-last-write-wins principles),
`docs/plan/research/wf232-runner-control-protocol.md` (authoritative runner/lane controls),
`docs/plan/research/wf236-releases-gate-contract.md` (Release approvals, evidence bindings, irreversible promotion boundaries, containment, immutable Released history),
`docs/adr/ADR-017-dev-board-authority-sync-execution.md`,
`docs/prd/PRD-019-dev-board.md`, plus #228 and #234 body/comments. The final Review mechanics remain owned by Wayfinder ticket #229; retention durations, legal/secret exceptional removal, and tombstone/export policy remain owned by #235. This memo defines the exact document-version compatibility seam that #237 must join to the approved Review contract; it does not invent Reviewer commands or containment proof types before #229 lands.

---

## 0. Scope and reading order

#234 asks four things: (a) the governed Docs **TYPE taxonomy** with canonical status set and retention per type; (b) whether the **planning-log / session record** is append-only or immutable; (c) the **invalidation matrix** (append-only logs vs revisioned fields vs dependent-lane invalidators); and (d) **mirroring rules** to GitHub comment/worklog history. It also requires an audit-gap decision for Review and Release evidence treatment without inventing new document types (`IC_kwDOS7Gw788AAAABKqONzw`, "Claims to fix").

The decisive finding is that the foundation docs already settle the contract surface. #234's novel contribution is narrow: (1) classify Review/Release evidence as owned domain aggregates, not Docs types; (2) close the remaining approval-class and retention gaps across three types; (3) make the append-only/revisioned/invalidating matrix executable; and (4) explicitly tie readiness invalidation to the Ready→doc-version pin. The cross-check confirms this is synthesis-only and not a competing redesign.

### Operating principles (consumed from the locked foundation)

These principles run through every decision below and are not re-argued per section:

1. **Opzava is authoritative.** The Dev Board Docs module owns governed content, lifecycle, approval, relations, exact reliance, traceability, archive overlay, and invalidation decisions. GitHub owns only native blob/tree/commit/ref facts for the human-readable secondary mirror (`docs/plan/dev-board-foundation-decisions.md:165-166` DBF-165/166; `docs/prd/PRD-019-dev-board.md:390-391`).
2. **Identity, bytes, and state are separate.** A stable `GovernedDocument` points at immutable, content-addressed `DocumentRevision` records. Append-only lifecycle decisions derive the current approved and working heads; no approved bytes are edited in place (`docs/plan/dev-board-foundation-decisions.md:170` DBF-170; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:165-170`).
3. **A link is not a gate.** `DocumentRelation` is navigation metadata; `DocumentReliance` is an exact, version-bound contract used by Ready/Sprint/Review/Release gates and never follows a mutable "current" pointer (`docs/plan/research/wf230-devticket-command-model.md:739`; `docs/plan/dev-board-foundation-decisions.md:167,79` DBF-167/043).
4. **Material replacement fail-closes atomically.** Approval of a material successor swaps the approved head, marks all exact active reliances stale, and opens one durable invalidation generation in the same transaction; every dependent gate reads that stale fact immediately; idempotent fan-out then routes each affected aggregate through its own governed commands (`docs/plan/research/wf230-devticket-command-model.md:816-821`; `docs/plan/dev-board-foundation-decisions.md:43,47,79` DBF-043..047).
5. **Invalidation never erases history.** Done DevTickets and Released Releases remain immutable; the new document's immutable Markdown mirror always proceeds; only stale dependent commands and workflow projections block (`docs/plan/research/wf230-devticket-command-model.md:845`; `docs/plan/dev-board-foundation-decisions.md:307` DBF-186).
6. **GitHub is not approval.** Provider edits may propose a Draft only after authenticated, Secret-Safe, three-way reconciliation; a commit, `2xx`, filename, author string, or copied marker never approves, supersedes, archives, or carries a reliance forward (`docs/plan/dev-board-foundation-decisions.md:85,96` DBF-085/096; `docs/plan/research/wf231-github-mirror-contract.md:704-735`).

### Authority and module boundary

| Concern | Authoritative owner | Accepted external input or projection |
| --- | --- | --- |
| Stable document identity, type, heads, archive overlay | Dev Board Docs | UI, assistant, GitHub, or import may request a command |
| Revision canonical bytes, hash, predecessor, attribution | Dev Board Docs | Secret-Safe author input or admitted provider-backed Draft proposal |
| Approval, supersession, equivalence, reliance, invalidation | Dev Board Docs plus the named consuming owner | Slack may relay one bounded human decision; GitHub cannot approve |
| Planning Session Log entries and corrections | Planning decision ledger | UI/assistant session appends through authenticated commands |
| Goal, Plan, membership, order, Sprint approval | Sprint boundary | Docs stores an exact governed representation and refs only |
| Ready Contract, lane, claim, execution containment | DevTicket/Dev Board command boundary from WF-230 | Document invalidation requests one governed owner command; Docs never changes a lane directly |
| Review admission, run, verdict, evidence, containment | Review boundary from final #229 | Exact approved RFC profile and Document Reliance are policy inputs |
| Release lifecycle, manifest, approvals, attempts | Releases boundary from WF-236 | Exact approved RFC profile and Document Reliance are policy inputs |
| Git blob, tree, commit, ref, author/provider observations | GitHub | Dedicated Docs integration stores normalized observations and confirmations |
| Document mirror desired state, outbox, shadow, conflict | Dev Board GitHub integration / Docs mirror module | GitHub native facts remain provider truth |
| Incident lifecycle and Postmortem ownership | Incident context | Docs links the governed Postmortem without copying Incident state |

The Docs application boundary exposes a dedicated `GovernedDocumentMirrorPort`. It must not reuse WF-231's Issue-specific `WorkItemMirrorPort`, and it must not borrow the Runner-only authorized Git ref-update authority. The adapter may share the same platform GitHub App, secret isolation, health, provider observation, and outbox infrastructure while retaining a distinct command family, permission policy, path policy, shadow, and conflict identity (`docs/plan/research/wf231-github-mirror-contract.md`; `docs/plan/dev-board-foundation-decisions.md:165-166` DBF-165/166).

---

## 1. Crisp decisions (one per question)

### Decision A — Docs TYPE taxonomy, status set, and retention per type

**A.1 Canonical types (exactly nine, closed set).** Governing Docs are exactly: **PRD, Planning Brief, RFC/Design Spec, Research Note, ADR, Runbook, Postmortem, Sprint Plan, Sprint Report** (`docs/prd/PRD-019-dev-board.md:392-394` US151; `docs/plan/dev-board-foundation-decisions.md:270` DBF-164). Review Gate and Releases Gate contracts are modeled as profiles of `RFC/Design Spec` (where a full governed gate-contract document is required), not new document types; a Planning Session Log is an authoritative append-only planning-ledger stream, not a tenth type. Where only the governance decision is needed, ADR-017 already records the Releases Gate governance update in ADR space — see A.5.

**A.2 Canonical status set (exactly five, closed enum).** Every governed document lifecycle is
**Draft → In Review → Approved → Superseded → Archived** (`docs/prd/PRD-019-dev-board.md:402-403` US155; `docs/plan/dev-board-foundation-decisions.md:276` DBF-170). The canonical enum name is **In Review**, not Review. `docs/plan/dev-board-foundation-decisions.md:49` DBF-018; `docs/prd/PRD-019-dev-board.md:402-403`.

**A.3 Approval class by type (locked for six, open for three).** PRD, RFC/Design Spec, ADR, Sprint Plan, and Runbook require Human Owner approval to enter Approved; Research Note and Planning Session Log may publish without it but remain versioned. `docs/plan/dev-board-foundation-decisions.md:277` DBF-171; `docs/prd/PRD-019-dev-board.md:406-407`.

**A.4 Review and Release contracts are not Docs types.** Review evidence and Release Evidence are
owned by their own domains as immutable, content-addressed aggregates (`docs/plan/dev-board-foundation-decisions.md:155` DBF-089, `:372` DBF-236; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:91`), and are projected into Docs-facing history as read-only summaries/proofs, not as native Docs records.

**A.5 Governing gate spec stays in existing types.** Review/Release gate governance is modeled through process contracts and can be represented as Research Note → ADR where appropriate; ADR-017 already records the Releases Gate governance update in ADR space (`docs/plan/research/wf236-releases-gate-contract.md`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:5-6,162-163`; DBF-134). Where a full governed gate-contract *document* is required (full profile-policy approval slots, revision trail), it is modeled as an `RFC/Design Spec` profile (see A.1); the high-level *governance decision* to adopt it remains an ADR.

**A.6 Retention per type.** Governed Docs are durable versioned contracts with no routine TTL (`docs/adr/ADR-017-dev-board-authority-sync-execution.md:546-547`; `docs/plan/dev-board-foundation-decisions.md:295-297` DBF-179..180; `docs/prd/PRD-019-dev-board.md:406-418`). The DBF/PRD evidence set is reversible archival with tombstoned redaction; DBF-195 reinforces that only transient channels are retention-managed. Final retention durations, legal/secret exceptional removal orchestration, provider redaction capabilities, and tombstone/export policy remain owned by #235; until it lands, this contract fails closed and requires only the safe tombstone/ref behavior stated here.

#### A.7 Canonical taxonomy and approval matrix (executable detail)

| Type | Purpose and allowed authority | Approval/finalization | Important boundary |
| --- | --- | --- | --- |
| `PRD` | Product outcomes, users, behavioral requirements, acceptance and exclusions | current Document Owner slot | Does not specify detailed module shape where an RFC is required |
| `Planning Brief` | Synthesized, bounded answer from grilling/planning, with unresolved items and recommended next step | current Document Owner slot before it becomes an authoritative work input | A session log is source evidence, not the brief itself |
| `RFC/Design Spec` | Cross-module behavior, interfaces, state, failure, security, and verification contract | current Document Owner slot plus every slot declared by the versioned profile policy | Review Gate and Releases Gate contracts are profiles of this type |
| `Research Note` | Sourced findings, uncertainty, experiments, and recommendations | Author may finalize under policy without a Document Owner approval slot | Evidence only; it cannot change policy or invalidate work by itself |
| `ADR` | Durable architecture decision, context, alternatives, and consequences | current Document Owner slot | Does not replace executable acceptance or a runbook |
| `Runbook` | Bounded operating/recovery procedure, prerequisites, verification, rollback, and escalation | current Document Owner slot | Cannot grant secrets, bypass a gate, or redefine desired workflow |
| `Postmortem` | Incident timeline, impact, contributing factors, response, learning, and follow-ups | Accountable Incident owner or other policy-authorized verified human | It never resolves the Incident or changes policy; changes require a separate governed document |
| `Sprint Plan` | Exact Goal, ordered membership, contract/dependency bindings, policy, approval, and revision | Sprint Human Owner through the authoritative Sprint command | Sprint owns Goal/Plan/membership/order; Docs is the exact governed representation |
| `Sprint Report` | Terminal outcome, final Plan, dates, interruptions, unfinished scope, metrics, refs, and evidence | system-finalized by the authorized terminal Sprint command; correction is a new Sprint Human Owner-approved revision | Completed/Cancelled/Aborted history is not rewritten |

The `review-gate` and `releases-gate` RFC profiles require the Document Owner slot **and** their exact profile-policy slots. In v1 the same Opzava Owner identity may satisfy more than one slot only when each slot's versioned separation policy permits it; each requirement, authorization check, decision, and nonce remains distinct. An agent may draft or submit any type allowed by policy; it cannot fabricate a required human approval, an Incident owner decision, a Sprint terminal fact, or a profile approval (`docs/plan/dev-board-foundation-decisions.md:49,277` DBF-018/171; `docs/prd/PRD-019-dev-board.md:406-407`).

#### A.8 Domain model — `GovernedDocument` and `DocumentRevision`

`GovernedDocument` is the stable aggregate root. It owns: immutable `documentId`, tenant/workspace/repository binding, canonical `typeKey`, normalized immutable path slug, and path-policy/canonicalization versions; monotonic aggregate version; one current `documentOwnerBindingId` plus owner-binding version (the binding names an authenticated verified human accountable for shaping, conflict/archive decisions, and routing the type/profile approval slots — it grants no consuming-workflow or unspecified approval role); optional `approvedHeadRevisionId` and at most one `workingHeadRevisionId` in Draft or In Review; archive overlay, optional `archivedApprovedHeadRevisionId`, archive reason/actor/time, and optional restoration predecessor; current relation-set version, reliance-set version, and invalidation generation; and exact current mirror health/conflict refs without treating them as lifecycle state. The document type and storage coordinates never change — a type correction creates a new document, links it as a replacement, and archives/supersedes the old document through the normal governed path, so a type or title edit never moves an immutable version to a different path.

V1 permits **one working head** so two competing Drafts cannot both claim to be the successor; the approved head remains readable and reliance-eligible while its successor is Draft or In Review, and creating/reviewing a successor never silently supersedes current authority. `TransferDocumentOwnership` compares-and-swaps the exact current owner binding and authorization version and appends the old/new accountable identities and reason; it never transfers specialized type/profile approval, Incident/Sprint/Release ownership, or consuming-workflow authority. Pending approval decisions whose policy or role binding no longer match become `revoked`; the revision remains In Review until the newly current requirement set is satisfied, and a former owner cannot approve, archive, restore, or resolve a conflict after the transfer commits.

Every `DocumentRevision` owns immutable: `revisionId`, `documentId`, monotonic revision number, predecessor revision ID/hash, and creation reason; canonical UTF-8 Markdown bytes normalized to LF and one terminal newline under an explicit `canonicalizationVersion`; SHA-256 of those exact canonical bytes; verified author/participant attribution, source surface, actor chain, command ID, and created time; and stable revision-scoped requirement identifiers plus safe structural metadata for traceability. The canonical content hash excludes mutable navigation relations, mirror state, Git provider facts, lifecycle decisions, and display metadata. A sanitized GitHub render has its own `renderPolicyVersion` and `renderHash` and can never be substituted for the canonical content hash; if unsafe active HTML or URL schemes are removed/escaped, Opzava retains only the already Secret-Safe canonical author content and records that the mirror is a sanitized projection (`docs/adr/ADR-017-dev-board-authority-sync-execution.md:165-170`; `docs/plan/dev-board-foundation-decisions.md:170` DBF-170).

The per-revision lifecycle is derived from append-only decision facts, not by changing revision bytes:

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

Request-changes and withdrawal append distinct decisions, revoke every collected approval for that review round, close the round, and return the same immutable content snapshot to Draft. Rejection does the same while recording the rejecting slot and safe reason. Subsequent content changes atomically supersede the prior working snapshot and create one new Draft revision. `AbandonDocumentRevision` closes/revokes any open review round, is the explicit Draft/In Review terminal path, and clears the working head without changing the Approved head; finalizing a successor and superseding the prior Approved head are one compare-and-swap transaction. Archive is exact rather than a loose toggle: it rejects while a Draft/In Review working head exists (caller must first finish or abandon), moves the active Approved pointer (when present) to `archivedApprovedHeadRevisionId`, clears both active heads, and sets the archive overlay atomically — with active reliance it performs the same pointer move and material stale-generation transaction defined in Decision C, or rejects without change. Restore compares the exact archive and aggregate versions, requires both active heads absent and no nonterminal invalidation generation, clears the overlay, and creates exactly one new Draft whose predecessor is the archived Approved revision when one exists (otherwise whose provenance cites the archive decision for the never-approved document); it does not restore the old Approved pointer, approvals, or reliances, and a stale/concurrent restore cannot create a second working head. There is no "archive and repair dependents later" window (`docs/plan/dev-board-foundation-decisions.md:170,172,173` DBF-170/172/173; `docs/plan/research/wf230-devticket-command-model.md:791-796,860-863`).

#### A.9 Finalization authority envelope (exhaustive kinds)

`FinalizeDocumentApproval` is the sole transition to Approved. Under one compare-and-swap it proves every required slot has a current unexpired `approved` decision, validates and consumes exactly one discriminated `DocumentFinalizationAuthorityEnvelope`, then performs the head/mirror/invalidation transaction. A missing, expired, revoked, role-lost, stale-policy, mismatched envelope/owner receipt, or rejected slot leaves the revision outside Approved. The allowed envelope kinds are exhaustive:

| Kind | Applicable type | Required authority |
| --- | --- | --- |
| `document_policy` | PRD, Planning Brief, RFC/Design Spec, ADR, Runbook | every current Document Owner/type/profile requirement decision |
| `research_author_policy` | Research Note | exact verified author, author-policy/version and any policy-required decisions; no Document Owner approval slot |
| `incident_owner_receipt` | Postmortem | single-use Incident-owner receipt binding Incident/version, owner/authorization version, document revision/hash, policy and nonce |
| `sprint_plan_receipt` | Sprint Plan | single-use authoritative Sprint command receipt binding Sprint/Plan/member/order/version, Sprint Human Owner approval and document revision/hash |
| `sprint_terminal_receipt` | first Sprint Report | single-use terminal Sprint command receipt binding final lifecycle/Plan/report facts and document revision/hash |
| `sprint_report_correction` | corrected Sprint Report | immutable predecessor/terminal receipt plus current Sprint Human Owner approval bound to the correction revision/hash |

Any type/kind mismatch rejects. Incident/Sprint commands own their decisions and emit the receipt; Docs consumes it once and cannot recreate, reinterpret, or bypass it. Finalization always CAS-checks the current `documentOwnerBindingId/version` as aggregate-concurrency state, but that binding is an approval gate only when the applicable requirement set says so — it reauthorizes only the envelope's actual actors/owner receipt and every applicable requirement, never a generic Document Owner in place of an author, Incident owner, Sprint owner, or terminal command (`docs/plan/dev-board-foundation-decisions.md:277` DBF-171; `docs/prd/PRD-019-dev-board.md:406-407`). A finalized Research Note may be linked or cited; it becomes an invalidating dependency only when a consuming governed contract explicitly creates an exact `DocumentReliance` (see Decision C), and later changes to the note never silently change that reliance.

#### A.10 Supporting records

| Record | Owns | Does not own |
| --- | --- | --- |
| `DocumentLifecycleDecision` | immutable transition, exact versions, actor/source, approval policy/result, reason | document bytes or consuming workflow state |
| `DocumentApprovalRequirement` | one stable slot in the exact type/profile policy, required role/binding class, policy version, status and satisfaction rule | an approval decision or blanket owner authority |
| `DocumentApprovalDecision` | exact requirement/revision/hash/policy/role/authorization versions, approver, nonce, decision, expiry/revocation and reason | reuse for another revision, round, slot, or authorization |
| `DocumentFinalizationAuthorityEnvelope` | exhaustive type/source authority kind, exact revision/round/policy/owner versions, required decisions or cross-owner receipt, nonce and consumption | generic Docs authority or duplicated Incident/Sprint decision |
| `DocumentRelation` | navigational target kind/ID, label, relation type, actor/time, active/retired state | gate authority, requirement satisfaction, current target state |
| `DocumentReliance` | relying owner/aggregate/version, exact document/revision/version/hash, requirement selectors, purpose, policy version, state | a mutable "current" pointer or copied document bytes |
| `DocumentRelianceCarryForward` | old/new revisions, old/new reliance versions, equivalence policy/hash, approver, consuming-owner receipts | broad reuse or mutation of the original reliance |
| `DocumentInvalidationGeneration` | approved-head transition, materiality, complete reliance snapshot, stale marks, fan-out cursor/results, terminal/blocked state | direct lane, Sprint, Review, or Release mutation |
| `DocumentRelianceInvalidationRequest` | generation/target/owner kind, exact old reliance set, replacement/cause, owner/gate snapshots, intended effect, idempotency/hash and receipt | duplicate targets, invented content, or direct Docs mutation |
| `RelianceInvalidationInterruption` | DevTicket-owned live-authority fence, cause/request/reliance, claim/lease/grant/tunnel/process snapshots and containment phases | an AcceptedPendingApplication, content Revision, or Docs state |
| `RelianceInvalidationContainmentProof` | exact interruption/request, stopped-or-quarantined process and every grant/tunnel/artifact-writer confirmation, producer/nonce/version | Ready/lane/Sprint mutation or a generic Review proof |
| `DocumentMirrorPublication` | one revision publication, ordered immutable-version/current-head legs, combined health and completion | provider confirmation or lifecycle approval |
| `DocumentHeadPublication` | one monotonic desired-head generation for approval/archive/restore/relation rendering, desired intent, shadow and supersession | immutable revision bytes, provider base, or document authority |
| `DocumentMirrorIntent` | operation, exact path/ref/bytes/render hash, desired head generation, immutable request identity, dispatch/unknown state | provider success by assertion or a force update |
| `DocumentMirrorAttempt` | one intent attempt, freshly reserved base ref/tree/path facts, exact commit parent, claim/fence, provider request and observations | permission to overwrite a changed base or alter desired bytes |
| `DocumentMirrorShadow` | last mutually confirmed canonical render/path plus Opzava and provider versions | lifecycle authority or last-write-wins timestamp |
| `DocumentMirrorConflict` | exact base/Opzava/provider facts, field/path scope, blocking class, version, decision/result | permission to overwrite either side silently |

---

### Decision B — Planning Session Log: append-only, not Approved-immutable

**B.1 Two distinct artifacts from each grilling.** A grilling creates a **Planning Session Log** and a synthesized governed planning artifact (Planning Brief / PRD). They have separate mutability contracts (`docs/plan/dev-board-foundation-decisions.md:274` DBF-168; `docs/prd/PRD-019-dev-board.md:397-398`).

**B.2 Planning Session Log is append-only and versioned.** Entries are written once with metadata (question, recommendation, decision, rejected alternative, unresolved item, participant, timestamp), never edited; corrections append a new entry that names what was superseded. `docs/plan/dev-board-foundation-decisions.md:275,275` DBF-169; `docs/prd/PRD-019-dev-board.md:399-401`; `docs/prd/PRD-019-dev-board.md:234-235` and `docs/plan/research/wf230-devticket-command-model.md:806-811`.

**B.3 Session log is versioned but not governed-content immutable.** It is not the governed lifecycle for Approved-content; revisions are logged as history entries and retain the relied-upon record shape without rewriting (`docs/plan/dev-board-foundation-decisions.md:157,169,277` DBF-091/169/171).

**B.4 Synthesized planning brief/PRD is governed mutable-then-immutable content.** The synthesized artifact follows Draft→In Review→Approved→immutable with new Draft on change (`docs/plan/dev-board-foundation-decisions.md:276`; `docs/prd/PRD-019-dev-board.md:402-405`; `docs/plan/dev-board-foundation-decisions.md:288` DBF-177).

#### B.5 Planning Session Log contract (executable detail)

A Planning Session Log is an authoritative append-only stream in the planning decision ledger — neither a governed document nor a rebuildable projection. Each entry contains: session ID, monotonic session sequence, command ID, scoped idempotency key and request hash; exact verified participant/actor/source and authorization version; source event time plus recorded time, with uncertainty stated when only a date is known; one entry kind — `question`, `recommendation`, `human_decision`, `rejected_alternative`, `unresolved_item`, `scope_note`, or `correction`; Secret-Safe canonical content, content hash, and policy/scanner version; and optional `correctsEntryId`, related document/revision/DevTicket/Goal refs, and safe provenance. Entries never contain hidden model reasoning, chain-of-thought, raw tool output, raw prompts, secrets, tokens, noisy execution telemetry, or invented quotations/timestamps; assistant summaries are attributed as syntheses, human decisions only to authenticated human actions (`docs/plan/dev-board-foundation-decisions.md:169` DBF-169; `docs/prd/PRD-019-dev-board.md:399-401`).

`CorrectPlanningSessionEntry` appends a correction and never changes or deletes the original. Exceptional legal/security removal follows #235: replace exposed readable material with a safe tombstone and integrity hash while preserving sequence, actor, reason category, and cross-links. The Docs UI and deterministic GitHub Markdown log are projections of this authoritative stream; a content-addressed snapshot records an exact sequence range and entry-set hash but does not gain a Docs lifecycle or approval. A synthesized Planning Brief or PRD is a separate `DocumentRevision` whose provenance lists exact session IDs, entry ranges/IDs, and snapshot hash; the synthesis may exclude noise but must preserve decided requirements, rejected alternatives that affect the answer, and unresolved items.

---

### Decision C — Invalidation matrix (append-only / revisioned / invalidating)

Three classes are active in implementation:

| Class | What is in it | Mutability rule | Invalidates dependent lanes? | Evidence |
| --- | --- | --- | --- | --- |
| Append-only log | Worklogs, comments, Planning Session Log entries, activity/history records, display-only metadata | immutable entries; superseding corrections append with references | **No** | `docs/plan/dev-board-foundation-decisions.md:154,157,169` DBF-088/091/169; `docs/plan/research/wf230-devticket-command-model.md:806-811` |
| Revisioned governed content | PRD, Planning Brief, RFC/Design Spec, ADR, Runbook, Postmortem, Sprint Plan, Sprint Report (and equivalent governed body fields) | Approved immutable; edits create new Draft revision | **Conditional** | `docs/plan/dev-board-foundation-decisions.md:170,172,173` DBF-170/172/173; `docs/plan/research/wf230-devticket-command-model.md:791-796,860-863` |
| Material invalidator | Material revision/field edit to Approved referenced document and execution contract fields (outcome/scope/safety/acceptance behavior) | forces new revision version and reapproval path | **Yes** | `docs/plan/dev-board-foundation-decisions.md:43,47,78,79,88,89,170,172` DBF-043..047; `docs/prd/PRD-019-dev-board.md:404-405`; `docs/plan/research/wf230-devticket-command-model.md:739,816-821` |

**C.1 Invalidation hinge.** A Ready Contract Version pins approved document IDs/versions/hashes. If any pinned Approved document changes materially, pin mismatch invalidates readiness (`docs/plan/research/wf230-devticket-command-model.md:739`; `docs/plan/dev-board-foundation-decisions.md:79` DBF-043).

**C.2 Downstream effects.** Invalidated material revisions cascade to ready/sprint gates and review context per lane state (Backlog / Needs re-approval) (`docs/plan/dev-board-foundation-decisions.md:75,77,88,140` DBF-039/041/040/140; `docs/plan/research/wf230-devticket-command-model.md:837,845`).

**C.3 Non-semantic edits do not invalidate.** Whitespace/typography-only edits and non-behavioral metadata changes are excluded from materiality (`docs/plan/dev-board-foundation-decisions.md:42,78` DBF-042/043; `docs/plan/research/wf230-devticket-command-model.md:823-827,860-863`).

**C.4 No retroactive un-Done.** Post-Done material edits do not flip historical Done state; they require follow-up remediation work under Review policy (`docs/plan/research/wf230-devticket-command-model.md:845`; `docs/plan/dev-board-foundation-decisions.md:307` DBF-186).

#### C.5 Exact reliance and traceability (executable detail)

`DocumentReliance` is created only by an authorized command at the consuming owner's boundary. It binds: relying owner namespace, aggregate ID, and exact owner version; document ID, revision ID, monotonic revision, canonical hash, and approval/profile-policy refs; stable requirement selectors and their revision-scoped IDs; reliance purpose such as `ready_input`, `sprint_policy`, `review_gate`, `release_gate`, `runbook_prerequisite`, or `evidence_source`; materiality/equivalence policy version, created actor/source/time, and state `active`, `stale_pending_fanout`, `carried_forward`, `replaced`, or `retired`; and current mirror-integrity requirement where GitHub history is a gate prerequisite. It never follows `approvedHeadRevisionId` or `current.md` — a newer approved revision changes no consumer until the exact old reliance is carried forward, replaced through its owner command, or marked stale by material invalidation (`docs/plan/research/wf230-devticket-command-model.md:739`; `docs/plan/dev-board-foundation-decisions.md:79` DBF-043).

Every approved PRD, Planning Brief, or RFC requirement has a stable ID unique inside that immutable revision; renumbering display order does not change the ID, and a selector removed/split/merged/meaningfully changed is material unless a versioned equivalence policy proves otherwise. The trace graph records exact edges:

```text
Document requirement ID
  -> Ready Contract sad-path / edge-case / acceptance / E2E / evidence-expectation IDs
  -> Ready Contract Version + Ready Approval
  -> Sprint Plan membership/order binding where present
  -> locked candidate SHA + Review run/evidence/result under exact Review RFC profile
  -> Done merge fact
  -> Release Manifest / Release Evidence requirement under exact Release RFC profile where present
```

A missing edge is visible and blocks only the gate that requires it. A link, copied requirement text, GitHub checkbox, green check, or model assertion is never an edge. Review evidence names the exact contract/reliance lineage and locked SHA; Release evidence names the exact immutable manifest, environment/attempt, and relied RFC revision. Non-semantic carry-forward appends `DocumentRelianceCarryForward` plus every required WF-230 Ready, Sprint Plan, and Execution Binding Carry-Forward; it never updates the old row in place, and any protected-field, requirement-set, hash, policy, owner-version, or profile mismatch rejects the carry-forward and routes to material invalidation (`docs/plan/research/wf230-devticket-command-model.md:791-811,813-814,860-863`).

#### C.6 Materiality classification

**No invalidation:** creating/editing/submitting/returning/withdrawing a Draft or In Review successor; appending/correcting/closing a Planning Session Log; adding/removing `DocumentRelation` navigation metadata; finalizing a Research Note that no current aggregate relies on; or a mirror retry/confirmation that proves the same bytes and authority.

**Non-semantic replacement** requires a versioned policy to prove unchanged meaning, requirement set, profile inputs, safety, and behavior; it always creates a new immutable approved revision and exact carry-forward receipts. Whitespace normalization or a typo may qualify; a caller or model cannot downgrade materiality, and any uncertainty is material.

**Material by default:** any requirement, outcome, bounded scope, sad path, edge case, acceptance, E2E, evidence expectation, dependency, risk, approval, security, secret reference, or policy change; requirement ID deletion/split/merge or changed selector meaning; Review/Release gate profile, reviewer/tool/model, environment, evidence, approval, or irreversible boundary change; type/path identity or approver-policy change; and archive/supersession/redaction that makes exact relied content unavailable or incomplete (`docs/plan/dev-board-foundation-decisions.md:42-47,78,79` DBF-042..047; `docs/prd/PRD-019-dev-board.md:404-405`; `docs/plan/research/wf230-devticket-command-model.md:816-827`).

#### C.7 Atomic approval and fan-out

Finalizing a material successor locks, in canonical order, the document, approved/working revisions, approval/policy, relation/reliance set, every current active reliance identity and relying-owner version snapshot, current invalidation generation, mirror intent namespace, and actor authorization. It atomically: (1) appends the approval and materiality decision; (2) swaps `approvedHeadRevisionId`, clears the working head, and appends predecessor supersession; (3) marks every affected exact reliance `stale_pending_fanout`; (4) creates one `DocumentInvalidationGeneration` with a canonical target-set hash and target rows; (5) makes all consuming admission queries fail closed from those stale rows immediately; (6) appends one lifecycle/activity fact, activates the existing revision publication's current-head leg, and creates the new monotonic head generation; and (7) queues idempotent internal fan-out and notifications. All commit or none commit; the new immutable document mirror is never blocked by its own stale dependents, and dependent GitHub Issue/status/Plan/Review/Release projections wait for their owning command result so they cannot display partly valid authority. A zero-target generation is created and completed in the same transaction so its audited classification remains explicit without leaving a phantom pending worker (`docs/plan/research/wf230-devticket-command-model.md:816-821`; `docs/plan/dev-board-foundation-decisions.md:43,47,88,89` DBF-043..047/088/089).

V1 serializes authority changes per document: while a generation is nonterminal, another material/non-semantic finalization, archive, or restore rejects. A generation permits `open -> running`, `running -> blocked | completed`, and `blocked -> running`; the retry transition occurs only when an authorized command makes at least one blocked target pending under fresh expected versions and is never silently superseded. Each target progresses `pending -> claimed -> owner_applied | owner_blocked | terminal_history`; only `owner_applied` and `terminal_history` are terminal. `owner_blocked -> pending` requires authorized `RetryDocumentInvalidation` after recording the new current owner versions and resolved condition; late workers are fenced by generation ID, target-set hash, claim token, and current-generation CAS. Crash or partial fan-out remains visible as `Invalidation pending`; no consumer whose reliance is stale may claim/start/admit Review/Done/approve Sprint/promote Release merely because its individual worker has not run. A generation becomes `completed` only when every target is terminal and every old reliance has one of those final states; any `owner_blocked` target makes the generation `blocked`, never green (`docs/plan/research/wf230-devticket-command-model.md:834-845`; `docs/plan/dev-board-foundation-decisions.md:75,77,140` DBF-039/041/140).

#### C.8 Owner-kind fan-out targets

Each target owns a `DocumentRelianceInvalidationRequest` with generation/target ID, exact old reliance set/document/revision/hash, discriminated cause `material_successor | archive | redaction`, owner kind `ordinary_dev_ticket | sprint | sprint_member | review | release`, optional replacement revision/materiality/approval, every relying aggregate and expected version, current Ready/Sprint/Review/Release binding snapshots, policy and authorization versions, intended effect, idempotency key, and canonical request hash. `material_successor` requires all replacement fields; `archive` forbids them and binds the archive decision/version; `redaction` binds the #235 request and optional sanitized successor/tombstone refs. Target construction groups all reliances that require one cross-owner atomic result: a Draft/Approved/Queued/Active nonterminal Sprint member produces one `sprint_member` target rather than independent Sprint and DevTicket targets. A worker reauthorizes and locks the exact current owner versions, invokes that owner's named compatibility port, and stores the immutable owner receipt — it does not replay a human DevTicket Revision decision (`docs/plan/research/wf230-devticket-command-model.md:816-845`; `docs/plan/dev-board-foundation-decisions.md:88,91` DBF-088/091):

- **Ordinary non-Sprint DevTicket/Ready** consumes `ApplyDocumentRelianceInvalidation`: the idle Backlog/Todo path atomically invalidates the Ready Approval, retires the old reliance, and applies WF-230's dependency/lane rules; a provisioning/start/In Progress/Blocked path instead creates one `RelianceInvalidationInterruption` (below). Neither edits Ready Contract bytes or accepts a human Revision; changed content is a separate governed `ProposeRevision` path.
- **Sprint-only Plan reliance** consumes `ApplySprintDocumentRelianceInvalidation`: Draft uses its coordinated Draft Plan/reliance revision and remains Draft with no approval to invalidate; Approved/Queued/Active stops new selection/activation and marks the exact Plan approval Needs Re-approval under the current Sprint version; Completed/Cancelled/Aborted records `terminal_history`. The command never fabricates Sprint Human Owner approval.
- **Draft/Approved/Queued/Active nonterminal Sprint member** consumes `ApplySprintMemberDocumentRelianceInvalidation`: the Sprint coordination owner locks the Sprint, exact Plan/member/grant/selection/hold versions and the DevTicket Ready/lane/claim/lease/resource versions as one unit; Draft atomically creates the coordinated Plan/member reliance revision and invalidates affected DevTicket Ready/lane/reliances without inventing an approval; Approved/Queued/Active idle apply marks the Plan Needs Re-approval/stops selection and invalidates DevTicket Ready/lane/reliances; live apply first consumes the exact `RelianceInvalidationContainmentProof`, then makes those Sprint and DevTicket effects in one transaction and one composite owner receipt. Neither an independent DevTicket target nor a second Sprint target exists for that member.
- **Review** consumes the final #229 compatibility port and command without this memo inventing its name; the target stays blocked until that owner returns its exact authenticated containment/evidence receipt.
- **Release** consumes `ApplyReleaseDocumentRelianceInvalidation`: it applies the exact WF-236 phase, approval, evidence, containment, and forward-fix rules without Docs mutating Release state.

Creating the original `DocumentReliance` is the consuming owner's consent for later automatic invalidation of that exact authority; it is not consent to new content. Therefore these commands may revoke or contain obsolete authority but cannot choose replacement wording, approve a Plan, accept a DevTicket Revision, or fabricate a human decision.

`RelianceInvalidationInterruption` is deliberately distinct from WF-230's `MaterialRevisionInterruption`: it has no `AcceptedPendingApplication` and cannot enter that record's apply path. Prepare CAS-locks the invalidation request, exact reliance, DevTicket/Ready Approval, lane, assignment, Claim Attempt, Execution Lease/fence, capacity/worktree, current Blocked Episode, credential/tunnel grants, process/checkpoint, Sprint bindings, and any existing interruption; it atomically fences activation/ordinary execution, records the intended Ready/lane/reliance effect, and issues idempotent checkpoint/stop/quarantine and revocation requests through WF-230's existing owners. Finalize reauthorizes the same snapshots and requires no-process or authenticated stopped/quarantined proof plus every grant/tunnel/artifact-writer confirmation; it emits one single-use `RelianceInvalidationContainmentProof` and performs no Ready/lane/Sprint mutation. The ordinary DevTicket or composite Sprint-member apply command consumes that proof atomically with its owner effects and resource release. `prepared -> containing -> contained` is monotonic; conflict with a material Revision, Absolute Stop, or Blocked finalizer is decided by the shared exact locks, and the loser attaches to the winning compatible containment or remains `owner_blocked`. #237 must project this explicit DevTicket/Sprint coordination amendment alongside WF-230; Docs never owns or finalizes it (`docs/plan/research/wf230-devticket-command-model.md`; `docs/plan/research/wf232-runner-control-protocol.md`).

#### C.9 Relied-target state matrix

| Relied target/state | Material approved successor or relied-head archive/redaction |
| --- | --- |
| Backlog DevTicket | keep Backlog; mark shaping/Ready inputs stale; require governed contract update before Ready approval |
| Todo, idle | immediately unclaimable; WF-230 owner invalidates Ready Approval and moves to Backlog through its exact Revision/Sprint rules |
| Todo provisioning or start pending | immediately blocks activation; DevTicket owner prepares/finalizes one Reliance Invalidation Interruption for fencing, revocation, containment, confirmation, then Backlog apply |
| In Progress | immediately blocks further ordinary authority; DevTicket owner prepares/finalizes the Reliance Invalidation Interruption; no Docs-owned fence/release |
| Blocked | preserve current Blocked/containment owner; the Reliance Invalidation Interruption shares exact locks, attaches to winning containment, and never duplicates a finalizer |
| Review before Done | block new verdict/Done; exact pre-Done evidence and profile binding become stale; final #229/#230 seam contains/exits/re-runs without Docs inventing Reviewer commands |
| Done | preserve contract, evidence, verdict, merge, and history; create a follow-up DevTicket or exceptional governed correction under WF-230 |
| Draft Sprint | update exact Plan/member reliance only through the coordinated Draft command; remain Draft, no approval carry-forward |
| Approved/Queued/Active Sprint | stop new selection/activation; mark exact Plan approval Needs Re-approval; use Sprint Plan Revision Grant or exact non-semantic carry-forward; contain active member through its owner |
| Completed/Cancelled/Aborted Sprint | preserve final Plan/Report snapshot; corrective report is a new version and never changes outcome |
| Review Gate RFC profile | new Review admission stops until the exact approved successor is installed; every not-Done result/evidence using the old material version is stale; #229 owns containment/re-run, not carry-forward |
| Release Draft / Candidate before staging | block next gate; invalidate affected policy/evidence and Staging/Production approvals; update only through a WF-236-permitted successor/re-evaluation |
| Staging / StagingApproved / ProductionReady before irreversible request | keep attempt/provider truth; block the next gate, invalidate affected approvals/evidence, and use only WF-236-permitted cancellation/supersession/successor/containment—never infer rollback success |
| `ProtectedMainPromotionRequested` or `StableTagCreationRequested` committed | no cancel, reseal, stable-version/RC reuse, or history rewrite; reconcile the same immutable Release, safety containment, or governed forward fix only |
| production live with publication pending | preserve observed production/request identities; reconcile the same publication without redeploy; changed contract permits only safety containment or an authorized forward fix |
| Released | preserve Release, manifest, approvals, evidence, tags, and production history; new policy applies to a future Release/follow-up only |

A worker then follows exact recovery rules: if the consuming contract must change, it creates/links the governed proposed Revision and blocks admission pending its authorized decision; if the existing owner already records the same invalidation, it attaches that receipt; if Done/Released is immutable history, it records `terminal_history` and requests a follow-up rather than changing history; and if the owner moved concurrently, it records the fresh conflict/blocked reason and retries only under a new expected-version snapshot within the same generation. For gate races, both the consumer gate and invalidation command lock/read the exact reliance row and owner version: if the consumer commits first, the approval transaction snapshots the new owner state (including terminal history) and creates the corresponding target; if stale marking commits first, the consumer rejects before crossing its gate and the owner command applies — no timing gap permits use of known-stale authority (`docs/plan/research/wf230-devticket-command-model.md:834-845`; `docs/plan/research/wf236-releases-gate-contract.md`).

#### C.10 Other invalidation and recovery cases

| Trigger | Exact behavior |
| --- | --- |
| Planning log append/correction | no gate effect; only a later approved governed revision may change authority |
| Research Note Draft/additional evidence | old exact reliance remains; a material approved successor that explicitly supersedes the relied head uses the normal invalidation path |
| Relation add/remove | navigation projection only; no reliance or approval change |
| Requirement display reorder | no effect when stable IDs/content are equivalent; changed ID/meaning is material |
| Non-semantic approved successor | CAS new head; append classification and all required document/Ready/Sprint/Execution carry-forward receipts atomically or reject |
| GitHub current-head human edit | Secret-Safe Draft proposal only; approved head/reliances unchanged until normal approval |
| Immutable GitHub version edit/delete/move | integrity conflict; block mirror-required gates and repair/tombstone; never import or LWW |
| Mirror response lost/unknown | retain same intent, reconcile provider facts, no blind retry or shadow advance |
| GitHub unhealthy/unverifiable | cached read with freshness; unbypassable affected gate stop per WF-230/WF-236; mirror recovery does not grant approval |
| Invalidation fan-out crash/partial result | all stale gates stay closed; resume same generation; no duplicate owner mutation or falsely complete projection |
| Archive with active reliance | reject or run material invalidation atomically; never orphan a current consumer |
| Restore | append restoration fact and new Draft; no old approval/reliance revival |
| Secret suspicion/exposure | no raw persistence; Absolute Stop, access/mirror containment, #235 coordinated redaction/tombstone, new sanitized revision where allowed |

#### C.11 Command boundary (Docs command family, inheriting WF-230 admission)

Docs revisions have a governed lifecycle (Draft→In Review→Approved with multi-slot/profile approval) distinct from DevTicket revisions, so they use a dedicated Docs command family that inherits WF-230's server-constructed envelope, verified source/principal, complete expected-version set, scoped idempotency key and canonical request hash, RLS tenant admission, authorization versions, correlation/causation IDs, and accepted/rejected receipt behavior — see open decision O-4 for the relationship to the wf230 trusted revision envelope.

| Command | Required authority and effect |
| --- | --- |
| `CreateGovernedDocument` | authorized author; reserves stable ID/type/path coordinates, first immutable Draft and its version publication |
| `CreateDocumentRevision` | exact document/working/approved versions; creates one immutable Draft successor and its version publication |
| `TransferDocumentOwnership` | current Document Owner or policy administrator; CAS exact owner/authorization versions, revokes stale pending decisions, transfers no other authority |
| `SubmitDocumentRevisionForReview` | authorized author; Draft → In Review under exact policy |
| `ReturnDocumentRevisionToDraft` | authorized reviewer/approver; appends changes-requested decision, In Review → Draft |
| `WithdrawDocumentRevisionReview` | authenticated submitter or current Document Owner under policy; In Review → Draft |
| `ApproveDocumentRequirement` | exact requirement/round/revision/policy/role/authorization and nonce; records one slot decision but does not swap heads |
| `RejectDocumentRevision` | authorized required slot; records rejection, revokes collected round decisions, returns In Review → Draft |
| `ExpireDocumentApproval` / `RevokeDocumentApproval` | policy/system or current authorization owner; appends terminal decision state and prevents finalization |
| `FinalizeDocumentApproval` | consumes exact type-specific authority envelope, proves every current slot, approves/supersedes, classifies materiality, activates head publication/invalidation atomically |
| `AbandonDocumentRevision` | authorized author/Document Owner; Draft/In Review → Superseded and clears the sole working head |
| `ArchiveGovernedDocument` | requires no working head; rejects active reliance or uses exact invalidation, clears active Approved head and advances archived-marker head generation |
| `RestoreGovernedDocument` | authorized owner; CAS archived/no-active-head/no-generation state, creates one new Draft/version and advances restoration-marker head generation |
| `AddDocumentRelation` / `RemoveDocumentRelation` | navigation-only relation CAS; advances head generation only when an Approved/archive/restoration head exists, otherwise defers rendering |
| `BindDocumentReliance` / `ReplaceDocumentReliance` | consuming owner validates exact revision/requirements/policy and current gates |
| `CarryForwardDocumentReliance` | consumes exact equivalence decision and appends immutable carry-forward receipts |
| `StartPlanningSession` / `AppendPlanningSessionEntry` / `CorrectPlanningSessionEntry` / `ClosePlanningSession` | planning-ledger append only; closing prevents ordinary append but permits correction/tombstone |
| `AdvanceDocumentInvalidation` | internal worker advances one generation/target under claim token and current owner versions |
| `RetryDocumentInvalidation` | authorized bounded retry of the same generation/target; cannot change intended effect |
| `ApplyDocumentRelianceInvalidation` | WF-230 DevTicket owner invalidates exact relied authority and applies lane/claim/containment policy without accepting content |
| `PrepareRelianceInvalidationInterruption` / `FinalizeRelianceInvalidationInterruption` | DevTicket owner fences live authority and emits exact containment proof without an AcceptedPendingApplication or workflow mutation |
| `ApplySprintDocumentRelianceInvalidation` | Sprint owner coordinates Draft Plan/reliance revision, active approval invalidation, or terminal history according to exact phase |
| `ApplySprintMemberDocumentRelianceInvalidation` | Sprint coordination owner atomically invalidates exact member/Plan approval plus DevTicket Ready/lane/reliances, consuming containment proof |
| final #229 Review invalidation command | Review owner applies its final named compatibility/containment behavior; this memo fixes the request/receipt seam, not the command name |
| `ApplyReleaseDocumentRelianceInvalidation` | WF-236 Release owner applies exact phase/evidence/approval/containment behavior without Docs mutation |
| `ReconcileUnknownDocumentMirrorEffect` | compares exact provider facts with the existing unknown intent; no new write identity |
| `ResolveDocumentMirrorConflict` | current Document Owner decision bound to exact conflict/base/provider/Opzava versions |
| `RequestDocumentMirrorReplay` | replays the same authorized intent/hash after health and state revalidation |

`FinalizeDocumentApproval` does **not** call `AcceptRevision` for every DevTicket, rewrite Sprint Plans, cancel Review, or mutate Release aggregates inside the Docs transaction. It commits the new document authority, exact stale reliance facts, and one resumable invalidation generation; each owner later consumes an idempotent internal invalidation request and applies its already-governed behavior without manufacturing a human content decision.

---

### Decision D — Mirroring rules to GitHub work history

**D.1 Docs bodies mirror deterministically to GitHub Markdown paths, not Issue body authority.** Mirroring is human-readable deterministic Markdown; Opzava is source-of-truth for content and state (`docs/plan/dev-board-foundation-decisions.md:165-166` DBF-165/166; `docs/prd/PRD-019-dev-board.md:390-391`).

**D.2 Human comment sync is one-to-one; bot/provider comments preserve provider attribution.** Mapped humans map as human actors; unknown/App/bot actors preserve external names, and no hidden model identity is inserted (`docs/plan/dev-board-foundation-decisions.md:87,92` DBF-087/092; `docs/plan/research/wf231-github-mirror-contract.md:567-576,719-730`).

**D.3 Worklogs mirror one immutable comment per milestone with append-only correction semantics.** Meaningful milestones, failures, pauses, handoffs, completion are mirrored as immutable comments; corrections append with pointers; raw noise remains local execution ledger (`docs/plan/dev-board-foundation-decisions.md:88,91,90` DBF-088/091/090; `docs/prd/PRD-019-dev-board.md:78-82`; `docs/plan/research/wf231-github-mirror-contract.md:704-735`).

**D.4 Review summary projection.** Review evidence summaries project contract version/locked SHA/verdict/artifact refs; they are a projection of #229-owned evidence, not Docs documents (`docs/plan/dev-board-foundation-decisions.md:89` DBF-089; `docs/prd/PRD-019-dev-board.md:230-231`).

**D.5 Conflict and sync control.** Same-field conflict (Docs Markdown or mirrored history regions) is resolved through conflict workflow; no blind last-write-wins (`docs/plan/dev-board-foundation-decisions.md:169-171,98` DBF-169/171/098; `docs/plan/research/wf231-github-mirror-contract.md:836-889`).

**D.6 GitHub as proof, not authority.** GitHub comments/events enrich human-visible history and cannot authorize transitions by themselves (`docs/plan/dev-board-foundation-decisions.md:85,96` DBF-085/096; `docs/plan/research/wf231-github-mirror-contract.md:704-735`).

#### D.7 Deterministic paths and render (executable detail)

Each immutable revision renders to `docs/dev-board/<type-key>/<immutable-slug>--<document-id>/versions/v000001-<sha256>.md`; the same document has one navigation-only head `docs/dev-board/<type-key>/<immutable-slug>--<document-id>/current.md`. `type-key`, slug, and document ID are path-safe immutable coordinates; the slug is normalized once with a versioned algorithm and title edits change front matter/display only. Reject `..`, separators, device names, control/bidi tricks, invalid Unicode, case-fold collisions, duplicate normalized paths, and any path outside the managed root. The version file contains deterministic safe front matter and sanitized Markdown naming the document/revision/type/version/canonical hash, immutable creation facts, safe attribution/provenance, requirement IDs, and immutable correlation marker; it does not embed a mutable lifecycle snapshot, and mutable approval/lifecycle, relations, current mirror health, and provider timestamps do not enter its canonical content hash. `current.md` points/readably renders the optional Approved head or exact archived/restoration marker plus current navigation metadata and has a separate render/shadow hash; it is never a reliance target or proof that approval exists. Planning Session Log snapshots use exact separate paths `docs/dev-board/planning-sessions/<session-id>/snapshots/e000001-e000123-<entry-set-sha256>.md` and `.../<session-id>/current.md`; their navigation head is a ledger projection, not a mutable entry or governed-document head, and provider edits are conflict/evidence only and can never import or attribute a planning decision.

#### D.8 Ordered publication, provider confirmation, and unknown effects

Creating every immutable `DocumentRevision` (including a Draft) creates one `DocumentMirrorPublication` whose immutable-version leg starts `pending` and whose current-head leg is `not_applicable`, preserving draft/abandoned history without claiming approval. Finalization CAS-activates that same revision's head leg as `waiting_version`; it cannot dispatch until the exact version intent is independently confirmed and it never creates a duplicate version intent. Publication state is derived as `version_pending`, `head_pending`, `complete`, `degraded`, or `conflict`; confirmation of the immutable version followed by an unknown or conflicting head leaves the publication `degraded` or `conflict`, never green. A gate requiring a confirmed Docs mirror accepts only `complete` for its exact publication; the immutable version leg continues despite stale dependents or a head conflict because durable history must remain inspectable.

Each leg has one exact ref/path/bytes/render hash/request identity. Only when a leg is dispatchable does a worker atomically create `DocumentMirrorAttempt`, claim the intent, and reserve a complete fresh provider base ref SHA, tree, and affected-path blob/absence observations. For an ordered head leg, dispatchability requires its version confirmation and a base that contains that exact version blob; the base may be a verified descendant containing other confirmed disjoint App writes. The worker re-fetches and compares the reservation immediately before send, constructs the commit with that exact base as its sole parent, and requests a non-force ref advance. If the ref changes before send, the attempt sends nothing; if it changes during send, the non-fast-forward advance fails. Reconciliation may reserve a new attempt base under the same desired intent only after complete B/O/G classification proves all intervening writes are confirmed, authorized, and disjoint from its managed path/fields. The one same-path exception is an exact correlated expected-App write from a superseded lower `headGeneration` of the same aggregate: the latest desired generation may use that observed commit as base and repair it, while the older generation never advances the current shadow; any other same-path/field or unverifiable change opens conflict. Provider `2xx`, a commit message, or a returned SHA is an attempt, not success. The version leg confirms before the same publication's head leg is admitted; retries never combine the two paths into one ambiguous write.

Every desired `current.md` change — approval, archive, restore, a relation-set change on an existing Approved/archive/restoration head, or planning-log head — atomically increments a monotonic `headGeneration` and creates one `DocumentHeadPublication` bound to document/log aggregate version, relation-set version, and desired render hash. Any head generation referencing an Approved revision waits for that exact version confirmation; before dispatch and before finalization a worker CAS-checks that it is still the latest desired generation, and a late intent becomes `superseded` and cannot write while a provider-base CAS failure opens conflict — so archive followed by restore, or a relation edit racing approval, cannot let an older worker overwrite the newer head. Confirmation requires a fresh authenticated observation of the expected repository and protected mirror ref, exact path, blob bytes/hash, containing tree, commit, App/installation actor, and correlation/request facts; only then may the intent confirm and its `DocumentMirrorShadow` advance. Timeout, disconnect, ambiguous response, worker crash after send, or uncertain ref state marks the attempt `outcome_unknown` and blocks its stable intent; complete fetch/reconciliation yields exactly one of: expected correlation (confirm the original intent), previous shadow unchanged with provider identity/ordering still ambiguous (keep waiting until bounded escalation requires Document Owner reconciliation, never infer absence), or different/multiple facts (open/reuse a versioned conflict).

#### D.9 Inbound edits and three-way conflict (B/O/G)

An immutable version-path modification, move, or deletion is an integrity/tamper conflict: never imported as a revision and never rewrites history; recovery re-establishes the exact immutable bytes through an authorized intent or records exceptional #235 removal/tombstone, never blessing provider content by timestamp. For `current.md`, compare per managed field/render region using `B` (last confirmed mirror shadow), `O` (current Opzava approved/navigation render), and `G` (fresh complete provider render/observation):

| Comparison | Classification and allowed next action |
| --- | --- |
| `O == B` and `G == B` | converged; no write and no proposal |
| `O != B` and `G == B` | Opzava-only change; queue/reconcile the exact current-head intent after its version leg confirms |
| `O == B` and `G != B` | provider-only change; a verified mapped-human edit may propose a Draft after all admission checks, otherwise conflict/evidence only |
| `O == G` and both differ from `B` | validate exact App/correlation or authorized provider proposal, then CAS the shadow; equality alone grants no authority |
| disjoint managed fields changed on `O` and `G` | open conflict and permit an owner-validated deterministic merge proposal; never silently merge |
| same managed field changed differently, path changed, or snapshot incomplete | open/retain conflict or degraded unknown; no write, import, or timestamp winner |

The `O == B, G != B` proposal path requires a complete fresh provider snapshot, a verified mapped human, Secret-Safe Ingress, exact parser/path/front matter, and current authorization; it grants no approval. Expected App echo confirms only the correlated intent. Third-party App/bot, unknown/deleted actor, copied marker, malformed front matter, or unmanaged region is external evidence/conflict with zero actor authority; a missing path is not deletion proof until a complete stable provider traversal and health evidence distinguish first creation, expected absence, or tamper. The proposal also CAS-checks the one-working-head invariant — if a Draft/In Review head already exists, it opens/reuses a conflict and never creates a competing Draft. `DocumentMirrorConflict` progresses `open -> decision_required -> resolution_pending_mirror -> resolved`; the current Document Owner binds one decision (Keep Opzava / Propose provider Draft / Merge disjoint changes / Immutable version recovery) to exact B/O/G, conflict, owner, policy, and provider-observation versions, and a partial or unverifiable observation leaves the conflict and publication degraded — the decision fact alone never advances a shadow or reports resolution. GitHub unhealthy or unverifiable keeps last-confirmed documents readable with explicit freshness but blocks gates whose policy requires confirmed mirror integrity; it never changes Approved to Draft/Superseded, and suspected secret exposure opens the unbypassable Absolute Stop and #235 redaction/revocation path (`docs/plan/research/wf231-github-mirror-contract.md:597-625,704-735,800-889`; `docs/plan/dev-board-foundation-decisions.md:98,100,166` DBF-098/100/166).

#### D.10 Universal admission and security ordering

For content-bearing commands the order is: (1) verify transport authenticity and coarse tenant/target-family admission without revealing a guessed document or idempotency result; (2) run Secret-Safe Ingress on every title, body, reason, relation label, source excerpt, Markdown attribute/URL, and attachment metadata **before** command receipt reservation, replay, persistence, logging, notification, outbox, or error echo; (3) on suspected secret content, persist only safe Absolute Stop/containment metadata permitted by WF-230 — never raw input or an ordinary document rejection containing it; (4) reauthorize exact role/type/profile/target, lock rows in canonical order, validate expected versions and policy, reserve/replay the idempotency receipt, then commit domain facts and outbox; and (5) render GitHub Markdown with active HTML escaped/removed, unsafe schemes rejected, link targets normalized, and no path traversal, Unicode/case collision, or repository-root escape. Same authorized key plus same canonical request hash returns the original result; same key with a different actor/source/target/hash is a conflict or authorization denial without disclosing the other result; unauthenticated or pre-admission requests create no command/document/planning record (`docs/plan/research/wf230-devticket-command-model.md:153-156`; `docs/plan/dev-board-foundation-decisions.md:125,161,169,181`).

---

## 2. Decision tensions (cross-check synthesis)

1. Foundation documents define the target contract and authority split; WF-230 and WF-231 provide command-concurrency and mirror mechanics that must be composed without redesigning the model. `docs/plan/dev-board-foundation-decisions.md`; `docs/plan/research/wf230-devticket-command-model.md`; `docs/plan/research/wf231-github-mirror-contract.md`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md`.

2. #234 remains synthesis-only in map #228 and should not pre-empt final closure work in #237. Open owner decisions are carried forward for freeze/implementation boundaries. `issues/234`; `docs/plan/research/wf236-releases-gate-contract.md`.

3. WF-230 clarifies execution contract materiality and lane behavior, while DBF/PRD clarifies docs projection and ledger boundaries; #234 must reconcile them for a single invalidation matrix. `docs/plan/research/wf230-devticket-command-model.md`; `docs/plan/dev-board-foundation-decisions.md:42-47,79` DBF-042..047; `docs/prd/PRD-019-dev-board.md:404-405`.

4. WF-231 introduces stricter actor-class and correction semantics than generic claims and therefore #234 must retain those finer mappings for comments, provider edits, and conflict resolution.

5. `wf232-runner-control-protocol.md` confirms lane freeze/resume semantics must align with Ready/Sprint state transitions and does not introduce alternate authority for Docs revisions.

6. The Docs application boundary needs a dedicated `GovernedDocumentMirrorPort` distinct from WF-231's Issue `WorkItemMirrorPort` and the Runner-only Git ref authority; it may share infrastructure but must keep a distinct command family, permission/path policy, shadow, and conflict identity. `docs/plan/research/wf231-github-mirror-contract.md`; `docs/plan/dev-board-foundation-decisions.md:165-166` DBF-165/166.

7. `RelianceInvalidationInterruption` must stay distinct from WF-230's `MaterialRevisionInterruption` (no `AcceptedPendingApplication`) and #237 must project the DevTicket/Sprint coordination amendment alongside WF-230 without Docs owning or finalizing it. `docs/plan/research/wf230-devticket-command-model.md`; `docs/plan/research/wf232-runner-control-protocol.md`.

---

## 3. RESOLVED BY EXISTING DECISIONS

These are inherited directly from locked sources and remain unchanged:

1. Closed nine-type taxonomy + five-state lifecycle (`docs/plan/dev-board-foundation-decisions.md:164,170` DBF-164/170; `docs/prd/PRD-019-dev-board.md:392-394,402-407`).
2. Approved immutability and new-Draft revision on change (`docs/plan/dev-board-foundation-decisions.md:170`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:165-170`).
3. Planning Session Log exclusion of model reasoning/secrets/telemetry (`docs/plan/dev-board-foundation-decisions.md:169`; `docs/prd/PRD-019-dev-board.md:399-401`).
4. Append-only corrections and no rewrite of relied-upon history (`docs/plan/dev-board-foundation-decisions.md:88,91` DBF-088/091).
5. Relations stored by metadata and not content duplication (`docs/plan/dev-board-foundation-decisions.md:167`; `docs/prd/PRD-019-dev-board.md:395-396`).
6. Material revision invalidation for dependent Ready/Sprint approvals (`docs/plan/dev-board-foundation-decisions.md:79`; `docs/prd/PRD-019-dev-board.md:404-405`), anchored by `wf230` readiness pin (`docs/plan/research/wf230-devticket-command-model.md:739`).
7. Review and Release evidence ownership split from Docs docs (`docs/plan/dev-board-foundation-decisions.md:89,155,179,212,236` DBF-089/155/179/212/236; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:91`).
8. Retention split: governed contracts durable/reversible, raw logs/telemetry retention-managed with tombstones (`docs/plan/dev-board-foundation-decisions.md:180,181,178,179`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:546-562`, PRD-019 US162-163).
9. Four-ledger separation between planning versions, approvals/effects, activity, and execution (`docs/plan/dev-board-foundation-decisions.md:173-177`; `docs/plan/research/wf230-devticket-command-model.md:782-785`). Concretely: **Planning decision ledger** (Planning Session entries/corrections, synthesis provenance, document Draft/revision/approval/equivalence/invalidation rationale, rejected alternatives, unresolved items); **Dev Board activity/history** (accepted lifecycle, approval, archive/restore, reliance, carry-forward, invalidation-owner receipt, affected workflow facts); **Runner execution/checkpoint** (only signed process/worktree/lease/checkpoint/containment facts created by its owner — Docs stores refs, never copies or fabricates them); **Synchronization/outbox/conflict** (document/log mirror intents, provider observations, shadows, conflicts, retries, unknown outcomes, confirmations). Stable IDs cross-link ledgers without a fictional global order; the actor chain distinguishes human decision maker, assistant/agent author, Lead Orchestrator relay, source surface, Runner where applicable, and system worker; the expected App can confirm delivery but cannot become the human or agent author, and GitHub names/body text never establish attribution. Raw secret values, unredacted payloads, hidden reasoning, raw tool output, and noisy telemetry enter none of these ledgers, Markdown mirrors, notifications, exports, screenshots, comments, or error messages.

---

## Open decisions for owner

Each decision below carries a default and is a **recommendation carried to synthesis #237 (not an owner-lock)**.

**O-1 Approval class for Planning Brief, Postmortem, Sprint Report.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Planning Brief requires Human Owner approval; Postmortem should require Human Owner approval (Accountable Incident owner or policy-authorized verified human); Sprint Report stays auto-finalized immutable snapshot without separate in-Review-ready semantics (`docs/plan/dev-board-foundation-decisions.md:167,172,177,168`).

**O-2 Use of unapproved Research Notes / Planning Session Logs in Ready dependency pins.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Treat only Approved docs as dependency pins for invalidation; unapproved references are visible links but do not trigger readiness invalidation. A finalized Research Note becomes an invalidating dependency only when a consuming governed contract explicitly creates an exact `DocumentReliance`; later changes never silently change that reliance (`docs/plan/dev-board-foundation-decisions.md:171`; `docs/plan/research/wf230-devticket-command-model.md:739`).

**O-3 Canonical state name lock and shorthand policy.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Keep the enum as `{Draft, In Review, Approved, Superseded, Archived}` and forbid freeform `Review` in state storage and UI (`docs/plan/dev-board-foundation-decisions.md:170`; `docs/prd/PRD-019-dev-board.md:402-403`).

**O-4 Docs revision authority and command names.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Reuse the wf230 trusted revision envelope (`Propose/Accept/RejectRevision` + expected-version/correctness guard) for Docs revisions, with Human Owner as decision authority and #218/#232 command seam, no parallel authority lane. Refinement (from the converged contract): because Docs revisions carry a governed Draft→In Review→Approved lifecycle with multi-slot/profile approval distinct from DevTicket revisions, #237 may adopt a dedicated Docs command family (`CreateDocumentRevision`, `SubmitDocumentRevisionForReview`, `FinalizeDocumentApproval`, etc.) that inherits the wf230 envelope and admission without inventing a parallel authority lane (`docs/plan/research/wf230-devticket-command-model.md:791-811,860-863`; `docs/plan/dev-board-foundation-decisions.md:49,49` DBF-018; `docs/plan/research/wf232-runner-control-protocol.md`).

**O-5 Docs Markdown mirror conflict handling.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Extend wf231 `ResolveSyncConflict` / three-way field-level model to Docs Markdown regions and carry same no-wholesale-merge limitation. Concretely, use the B/O/G matrix over managed field/render regions with the one-working-head invariant checked on any provider Draft proposal (`docs/plan/dev-board-foundation-decisions.md:166`; `docs/plan/research/wf231-github-mirror-contract.md:597-625,836-889`; `docs/plan/research/wf230-devticket-command-model.md:813-814`).

**O-6 Retention for generated planning artifacts attached to session records.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Keep sanitized Planning Session Log durable; apply configurable TTL only to large raw/transient generation outputs and raw telemetry, with durable summaries and non-sensitive tombstones preserved. Final retention durations, legal/secret exceptional removal, and tombstone/export policy remain owned by #235; until it lands the contract fails closed to safe tombstone/ref behavior only (`docs/plan/dev-board-foundation-decisions.md:169,180,181` DBF-169/180/181; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:552-562`; `docs/plan/dev-board-foundation-decisions.md:195`).

**O-7 Owner transfer and profile-slot separation.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** `TransferDocumentOwnership` CAS-swaps only the accountable owner binding and authorization version; it never transfers specialized type/profile approval, Incident/Sprint/Release ownership, or consuming-workflow authority, and pending approval decisions whose policy/role no longer match become `revoked` while the revision stays In Review. In v1 a single Opzava Owner identity may satisfy more than one profile slot only when each slot's versioned separation policy permits it (`docs/plan/dev-board-foundation-decisions.md:49,277` DBF-018/171; `docs/prd/PRD-019-dev-board.md:406-407`).

---

## 4. Sad paths and edge cases

1. **Material doc revision after dependent Done ticket:** do not retroactively un-Done; open follow-up remediation route (`docs/plan/research/wf230-devticket-command-model.md:845`).
2. **Secret in Planning Log or document body:** stop, apply redaction/tombstone, and reconcile mirror-side visibility (`docs/plan/dev-board-foundation-decisions.md:125,161,169,181`; `docs/prd/PRD-019-dev-board.md:419-421`).
3. **Concurrent Opzava + GitHub edit of same Docs Markdown region:** same-field divergence opens sync conflict resolved by owner; no last-write-wins (`docs/plan/dev-board-foundation-decisions.md:98,100,166`; `docs/plan/research/wf231-github-mirror-contract.md:836-889`).
4. **Approval pending while GitHub mirror outcome unknown:** Opzava state remains canonical until confirmation; dependent gates wait for confirmed mirror where required (`docs/plan/dev-board-foundation-decisions.md:102,173`; `docs/plan/research/wf231-github-mirror-contract.md:800-832`).
5. **Archive of relied-upon document:** archive is reversible and historical evidence cannot be erased; owner should reject archive when live unexpired pins still reference it unless override path is implemented (`docs/plan/dev-board-foundation-decisions.md:178-181,307`; `docs/prd/PRD-019-dev-board.md:419-421`).
6. **Postmortem dependency to Incident lifecycle:** Postmortem is a Docs artifact related to Incident metadata, not incident type itself (`docs/plan/dev-board-foundation-decisions.md:67,124,167`).
7. **Sprint Report for canceled sprint:** preserve immutable snapshot with full context, with any corrections as new versions (`docs/plan/dev-board-foundation-decisions.md:150,172`).
8. **Worklog memo pointer stale after revision:** worklog stays historically truthful by stored memo pointer; invalidation is enforced by pinned Ready/Sprint contracts (`docs/plan/dev-board-foundation-decisions.md:7,295`; `docs/plan/research/wf230-devticket-command-model.md:739`).
9. **Research Note cited before approval:** treat as non-authoritative; no dependency lock/invalidation until Approved (`docs/plan/dev-board-foundation-decisions.md:171`).
10. **Release/Review gate spec change:** revised governing spec is material doc revision; it invalidates dependent readiness as a governed doc would (`docs/plan/dev-board-foundation-decisions.md:43,47,89,170,236`; `docs/plan/research/wf236-releases-gate-contract.md`).
11. **GitHub actor deletes mirrored comment/review:** record provider deletion and tombstone; never rewrite Opzava source history (`docs/plan/dev-board-foundation-decisions.md:91`; `docs/plan/research/wf231-github-mirror-contract.md:716-717`).
12. **Collision with #218/#232/#246 authority graph:** Docs authority must stay in existing command seam and schema contracts (`{kind,state,version,contentHash,relations}` from A.1/A.2, plus issue graph node shape) to avoid parallel authority (`docs/plan/dev-board-foundation-decisions.md:164,166,168`; `docs/plan/dev-board-foundation-decisions.md:236`; `issues/234`).
13. **Two authors create a successor against the same working-head version:** one wins; the other receives a stale/conflict result and no orphan revision/path (V1 one-working-head invariant).
14. **Approval role revoked between review and commit:** approval rejects under current authorization; no head swap, stale reliance, head activation/generation, approval, or invalidation write exists; the already-authorized immutable Draft version publication remains.
15. **Required profile approval missing:** the RFC remains In Review even if Document Owner approval is present; Slack/GitHub cannot fill the missing role by assertion.
16. **Sanitization changes the rendered bytes:** canonical and render hashes remain distinct and visible; the provider must confirm the render hash, never the author-content hash by coincidence.
17. **A mapped human edits `current.md` while Opzava approves another successor:** three-way conflict; neither side overwrites, and the provider edit grants no approval.
18. **The App writes the version but response is lost:** the original intent reconciles/confirms; no duplicate version path or second commit is authorized blindly.
19. **A version path exists with the right bytes but wrong repository/ref/actor/correlation:** do not confirm; open conflict/unknown state.
20. **Fan-out loses power after marking stale but before the first owner command:** all affected gates are already closed and the same generation resumes.
21. **One owner reaches Done before the material approval transaction:** the lock winner determines the result; if Done wins, record immutable terminal history/follow-up — never reopen it.
22. **Review or Release owner is unavailable:** reliance remains stale and visible; no timeout turns it valid or cancels an irreversible Release.
23. **A Planning Session correction contradicts an approved PRD:** no automatic authority change; a new governed revision and approval is required.
24. **A Research Note is withdrawn or corrected:** exact consumers retain the cited old revision unless an authorized material replacement invalidates their reliance.
25. **Exceptional redaction removes relied text:** affected reliance fails closed; safe tombstone/hash and owner-specific recovery remain, without pretending the historical event did not occur.

---

## 5. What #234 hands to final synthesis #237

1. Closed-type and state contract with explicit approval-class gaps and retention baseline, plus owner locks for those gaps.
2. Audit-gap resolution that Review/Release Evidence remain non-Docs aggregates with Docs only holding relations and projection summaries.
3. Execution matrix across append-only logs, revisioned governed content, and material invalidators with Ready→Doc pin as the cross-lane invalidation hinge.
4. Clean separation of Planning Session Log append-only rationale from revisioned governed planning outputs.
5. Mirroring invariants for Docs Markdown, comments, worklogs, and review summaries, including conflict and no-last-write-wins controls.
6. Forward-only invalidation behavior (never retroactive un-Done).
7. Explicitly carried open decisions for owner/defaults to be locked in #237.

### 5.1 Observable behavioral contract

The feature is correct only when all of the following are observable: (1) an authenticated authorized Admin can record a planning session, synthesize a Draft governed document, satisfy every distinct type/profile approval slot, finalize it, observe its ordered immutable-version then navigation-head publication in GitHub, and bind exact requirements to a DevTicket without leaving Opzava; (2) creating a successor Draft leaves the prior approved head readable and every existing reliance valid, and no consumer follows the Draft or `current.md` by accident; (3) approving a proven non-semantic successor succeeds only with complete immutable carry-forward receipts, otherwise it follows the material path; (4) finalizing a material successor makes all exact consumers visibly stale in the same transaction, blocks their next gates immediately, mirrors the new version, and eventually shows each exact owner request/receipt and reliance terminal state through a resumable generation; (5) a concurrent claim/start, Sprint activation, Review verdict/Done, Release promotion, approval, archive, mirror worker, or second successor sees complete expected-version locks — one outcome wins and the other returns an exact replay/conflict/stale result with no partial authority; (6) GitHub loss, ambiguity, tamper, or conflict never edits Opzava approval or history by timestamp, and cached data is labelled with freshness and affected gates fail closed; (7) Done and Released history remains identical after a later relied-document change — remediation is a follow-up, forward fix, or future policy application; (8) unauthorized tenants/roles, agents claiming human authority, unsafe Markdown, path traversal, secret-bearing content, stale nonces, and mismatched idempotency hashes produce no leaked data or partial domain/outbox writes. Model output may help draft prose but is never the oracle for approval, hashing, mirror confirmation, materiality, trace completeness, invalidation, or gate behavior.

### 5.2 Validation contract

**Real authenticated user-level flow:** drive one Admin flow through the real local Docker stack with normal login, real tenant/workspace RLS, real Postgres, the real Docs UI/BFF/application boundary, and a dedicated real GitHub scratch repository/branch installed through the test GitHub App — (a) start a Planning Session; append question, recommendation, human decision, rejected alternative, and unresolved item; append a correction and verify the original remains; (b) synthesize an RFC/Design Spec profile with stable requirements and exact log provenance; observe its immutable Draft version path while no Approved `current.md` head exists; (c) submit it, record every required human/profile slot, reject one review round, resubmit with fresh nonces, and finalize only after every current authorization is revalidated; (d) observe `current.md` dispatch only after the existing exact version confirms, then observe `complete` only after independently fetched blob/tree/commit/ref/App facts confirm the latest head generation too; (e) create a navigation relation and prove it changes no gate; bind exact reliance to a DevTicket and trace requirements to Ready acceptance/sad-path/E2E/evidence IDs; (f) create a successor Draft and prove the approved head/reliance stays active; (g) approve a material successor while a dependent claim or gate races; observe atomic stale state, blocked gate, new version mirror, and owner-specific fan-out completion; (h) inspect light/dark themes, keyboard-equivalent actions, accessible status/decision text, and narrow viewport without hiding identity, approval, conflict, or stale state.

**Deterministic contract and regression checks:** use real Postgres application-command transactions and deterministic provider/owner seams to cover — dual-head uniqueness, lifecycle legality, monotonic versions, canonical UTF-8/LF hashing, type/path immutability, owner transfer, abandon, exact archive pointer clearing, and restore that creates one Draft without reviving Approved authority; tenant/RLS denial, role/profile denial, partial/multiple slot approval, reject/resubmit, expiry, revocation, owner transfer, every type-specific finalization envelope/receipt, type/source mismatch, receipt reuse, stale nonce, replay, same-key/different-hash, concurrent finalization, and stale expected versions; Secret-Safe pre-persistence rejection across database, receipt, log, outbox, Slack, GitHub, export, rendered HTML, serialized page data, and screenshot/search output; active HTML, unsafe schemes, malformed front matter, Unicode/case collisions, path traversal, and root escape; log sequence/idempotency/correction/close and exceptional tombstone behavior; every Draft/abandoned version publication; ordered approved version/head confirmation and combined health; App actor/correlation mismatch; timeout/lost response; late success; immutable-path tamper/delete/move; the complete B/O/G matrix; exact-base/non-force CAS failure; late archive/restore/relation generation fencing; conflict decision pending provider confirmation; partial snapshot; rate limit; health loss/recovery; and dead-letter replay; exact relation-versus-reliance behavior and requirement graph completeness; non-semantic carry-forward success and every hash/policy/requirement/owner-version mismatch; material invalidation racing Todo claim, provisioning, start, In Progress, Blocked, Review, Done, Sprint approval/activation, every WF-236 phase, archive, and a second successor — live DevTicket cases prove the distinct Reliance Invalidation Interruption and no AcceptedPendingApplication, and nonterminal Sprint members prove one composite target/transaction and no split state; partial fan-out crash after zero, one, or many owner receipts; each owner command/request payload; consumer-gate races; worker reclaim/fencing; duplicate delivery; stale finalizer; retry from owner_blocked; visible generation/reliance state; and exact completion only after terminal receipts; Review RFC replacement fail-closing new admission and stale pre-Done evidence through the final #229 compatibility seam; and Release RFC replacement before an irreversible request (including each applicable lifecycle state), after protected-main/stable-tag request commit, while production is live/publication is pending, and after Released, with no forbidden cancel/reseal/reuse/redeploy. Every scenario asserts database rows, immutable ledger facts, outbox identity, owner receipts, browser-visible truth, and absence of raw secrets — a provider API `2xx`, mocked React state, model statement, or successful background job exit is not sufficient proof.

### 5.3 Rejected alternatives

- **Use Git files as canonical document state** — rejected because Git commits cannot enforce tenant/RLS, role/profile approval, exact reliance, cross-aggregate invalidation, or Secret-Safe admission and can be rewritten/deleted externally.
- **Add Review Contract, Release Contract, or Planning Log document types** — rejected because the first two are RFC profiles (or ADR-recorded governance) and the last is an append-only ledger with different lifecycle and correction semantics.
- **Mutate an Approved document in place** — rejected because every Ready/Sprint/Review/Release proof would silently change beneath its hash.
- **Make links follow current** — rejected because navigation cannot be gate authority and would create unbounded implicit invalidation.
- **Bulk-call `AcceptRevision` during document approval** — rejected because it fabricates dependent human decisions, crosses owners in one unbounded transaction, and cannot recover partial failure.
- **Delay stale marking until fan-out completes** — rejected because a claim/Review/Release race could pass on known-obsolete authority.
- **Block the new document mirror while dependents are stale** — rejected because it deadlocks the durable history needed to inspect and resolve the change.
- **Last-write-wins by GitHub or Opzava timestamp** — rejected because clocks/delivery order are not authority and same-field divergence requires an explicit decision.
- **Reopen Done or Released after a policy revision** — rejected because it rewrites successful historical gates; use follow-up work, forward fix, or future applicability.
- **Reuse WF-231's Issue `WorkItemMirrorPort` or the Runner Git ref authority for Docs** — rejected because Docs mirror needs a distinct command family, permission/path policy, shadow, and conflict identity even when sharing the GitHub App and outbox infrastructure.

### 5.4 Implementation handoff and remaining ownership

Implementation decomposition must provide separate tracer bullets for the Docs aggregate and planning ledger, trace/reliance graph, dedicated Git mirror adapter/reconciliation, invalidation coordinator/owner adapters, Docs UI, migration/import, and real E2E harness. #237 owns that graph and must consume the final #229 Review contract before naming its Review adapter commands. #235 still owns retention durations, legal/secret exceptional removal orchestration, provider redaction capabilities, and final tombstone/export policy; until it lands, this contract fails closed and requires only the safe tombstone/ref behavior stated above. No implementation may treat this memo, a mirrored Markdown file, or a planning log as proof the described aggregate, workers, provider permissions, UI, or tests already exist.

---

## Citation index (every claim above traces to one of these)

- `issues/234` body and comments including `IC_kwDOS7Gw788AAAABKqONzw` and `IC_kwDOS7Gw788AAAABKd747g`.
- `issues/228` parent Wayfinder map (Dev Board implementation delivery graph).
- `issues/229` owns final Review mechanics (Review admission/run/verdict/evidence/containment); this memo fixes only the document-version compatibility seam and does not name its commands.
- `issues/235` owns retention durations, legal/secret exceptional removal orchestration, provider redaction capabilities, and final tombstone/export policy.
- `issues/237` final Dev Board synthesis (consumes #233/#234/#235); open decisions here are recommendations carried to it, not owner-locks.
- `docs/plan/research/wf236-releases-gate-contract.md` (resolved canonical Releases Gate contract; current #228 input until #237).
- `docs/plan/dev-board-foundation-decisions.md`: DBF-018 `:49`, DBF-033 `:33`, DBF-038 `:38`, DBF-039 `:75`, DBF-040 `:79`, DBF-041 `:81`, DBF-042 `:78`, DBF-043 `:79`, DBF-047 `:88`, DBF-049 `:95`, DBF-055 `:101`, DBF-067 `:123`, DBF-068 `:124`, DBF-082 `:148`, DBF-085 `:85`, DBF-087 `:87`, DBF-088 `:88`, DBF-089 `:89`, DBF-090 `:90`, DBF-091 `:91`, DBF-092 `:158`, DBF-094 `:96`, DBF-095 `:97`, DBF-096 `:96`, DBF-098 `:98`, DBF-100 `:100`, DBF-102 `:102`, DBF-125 `:211`, DBF-134 (Releases Gate governance), DBF-140 `:236`, DBF-150 `:246`, DBF-155 `:155`, DBF-164 `:270`, DBF-165 `:271`, DBF-166 `:272`, DBF-167 `:273`, DBF-168 `:274`, DBF-169 `:275`, DBF-170 `:276`, DBF-171 `:277`, DBF-172 `:278`, DBF-173 `:284`, DBF-174 `:285`, DBF-177 `:288`, DBF-178 `:294`, DBF-179 `:295`, DBF-180 `:296`, DBF-181 `:297`, DBF-186 `:307`, DBF-195 `:180`, DBF-208 `:208`, DBF-209 `:209`, DBF-210 `:210`, DBF-212 `:348`, DBF-233 `:369`, DBF-236 `:372`.
- `docs/prd/PRD-019-dev-board.md`: US42 `:150-151`, US72-82 `:213-235` (US78 `:225-227`, US79 `:228-229`, US80 `:230-231`, US81 `:232-233`, US82 `:234-235`), US143 `:373`, US148 `:385-387`, US150 `:390-391`, US151 `:392-394`, US152 `:395-396`, US153 `:397-398`, US154 `:399-401`, US155 `:402-403`, US156 `:404-405`, US157 `:406-407`, US160 `:412-414`, US161 `:415-416`, US162 `:417-418`, US163 `:419-421`.
- `docs/adr/ADR-017-dev-board-authority-sync-execution.md`: `:5-6,17-27,82-96,91,95-121,162-163,165-170,243-247,533-565,546-562`.
- `docs/plan/research/wf230-devticket-command-model.md`: `:153-156,739,782-785,791-796,806-811,813-814,816-827,834-845,860-863`.
- `docs/plan/research/wf231-github-mirror-contract.md`: `:567-576,597-625,669,704-735,716-717,719-730,800-832,836-889`.
- `docs/plan/research/wf232-runner-control-protocol.md`.
