# WF-235 — archive, retention, exceptional redaction, tombstone, and revocation contract

**Ticket:**
[#235 — Lock archive, retention, exceptional redaction, tombstone, and revocation behavior](https://github.com/anthonykewl20/opzava/issues/235)
· map [#228](https://github.com/anthonykewl20/opzava/issues/228)<br> **Date:** 2026-07-17<br>
**Status:** resolution candidate for planning review; no product code, schema, policy values, or
provider operation is implemented by this memo

## Decision summary

1. **`DevBoard.RetentionPolicy` is one deep coordinating module, not a fifth ledger or global
   order.** It owns versioned classification, immutable per-generation ingestion bindings,
   prospective reclassification, holds, expiry manifests and per-store dispositions, exceptional
   redaction cases and one-use authorizations, content suppression, target actions, tombstones, and
   requests for owner-consumed evidence-reliance revocation.
2. **Archive is a reversible owner-controlled overlay.** It is never deletion, expiry acceleration,
   or evidence erasure. WF-230 owns Proposal and DevTicket archive/restore, #233 owns Sprint, and
   #234 owns Docs. Retention coordinates facts but cannot archive or restore them.
3. **Retention binds at ingestion.** Each admitted content generation receives one immutable
   `RecordRetentionBinding`. A later policy change does not backdate, shorten, or silently
   reclassify prior generations; only an append-only prospective reclassification applies from its
   trusted effective time.
4. **Durable relied-on facts have no routine TTL.** Contracts, decisions, comments/worklogs,
   approvals, gate facts, semantic receipts/checkpoints/containment, reconciliation decisions,
   provider identities, manifests, and tombstones remain. Only named high-volume or transient
   payloads may expire after a complete safety predicate proves they are not relied upon.
5. **Raw webhook/retry bodies, credential values, secrets, unredacted provider payloads, and
   suspected-secret content never become ordinary durable records.** The raw GitHub mirror is
   provider-owned history, not an Opzava TTL target. Secret-Safe Ingress rejects before persistence.
6. **Expiry is manifest-driven and fail closed.** One immutable `ExpiryManifest` binds policy,
   content generation, trusted times, reliance graph/watermarks,
   replay/gap/dedupe/ACK/key/audit/gate versions, hold set, and exact targets. Missing or
   unverifiable input makes the object ineligible.
7. **`PayloadSuppressionBarrier` is content-only authority.** Every read, rebuild, webhook,
   reconciliation, mirror/outbox, search, cache, export, object fetch, backup, and replay path
   checks it. It blocks new reliance and propagation of an exact content generation but cannot fence
   a process, change a lane, command Review, mutate a provider, or resolve an Absolute Stop.
8. **Secret containment precedes broader erasure.** Revoke or rotate the credential first.
   Reversible suppression is automatic. If current exposure can be stopped only by editing or
   deleting provider content, the exact minimum secret-value replacement/removal is automatic,
   unbypassable Absolute Stop containment. It is never delayed for Admin approval.
9. **Broader, legal, scope-expanding, or destructive removal requires exact step-up authority.** V1
   permits one Admin to request and separately confirm, but a distinct system executor performs
   effects and reauthorizes before each one. The authorization is short-lived, single-use, and
   exact-case/target/action/policy/session/nonce bound.
10. **Provider outcomes stay scoped and truthful.** A changed GitHub current body or deleted comment
    proves only that surface. Comment revision history, Git history, PR refs, forks, clones, caches,
    and Support-only removal remain separate `manual_required`, `unsupported`, or
    `residual_exposure` legs. Ordinary exact-ref publication never force-rewrites history.
11. **A tombstone proves governed disposition without retaining the removed payload.** It contains
    stable non-sensitive identities, classifications, authority/actor chain, legal basis, outcomes,
    successor refs, and a domain-separated keyed commitment. It contains no locator, excerpt,
    raw/plain hash, secret, or vault-key reference and has no routine TTL.
12. **Evidence invalidation is owner-executed.** `EvidenceRelianceRevoked` requests cause owning
    modules to invalidate active Ready, Sprint, Review, merge, or Release bindings while preserving
    historical Done/Released/lane facts and marking assurance compromised. The retention module does
    not invent their lifecycle transitions.
13. **Revocation facts never collapse.** Runner enrollment epoch/key, WF-230 lease fence and
    containment, local grant disposal, upstream credential rotation/revocation, preview/tunnel
    closure, object access, artifact publication, and GitHub disconnect are independently proven.
14. **Backup restore cannot resurrect removed content.** Restore is isolated and non-serving until a
    newer independently replicated erasure/tombstone stream is verified and replayed before any
    projection, index, cache, artifact, download, mirror, or cutover. Missing/inconsistent stream
    blocks restore.
15. Numeric TTL values are downstream Admin-configurable policy, but the safety model is fully
    settled. A trusted server clock owns eligibility and expiry; clients and provider timestamps do
    not.

## Consumed authority and non-goals

This contract consumes, and does not reopen:

- [WF-230](wf230-devticket-command-model.md): trusted command envelope, Secret-Safe Ingress,
  Absolute Stop lifecycle, Proposal/DevTicket archive and restore, Ready/dependency/lane/lease/
  containment authority, and four-ledger routing;
- [WF-231](wf231-github-mirror-contract.md): GitHub App identity, verified webhook ingress, mirror
  shadows, outbox/inbox/conflicts, provider observations, health, disconnect, and exact-ref
  transport;
- [WF-232](wf232-runner-control-protocol.md): Runner enrollment/key epochs, signed facts, Lease
  Enforcer, process/worktree containment, grant delivery/disposal, artifact ingress, preview
  transport, and local-versus-upstream revocation distinctions;
- #229 for Reviewer, Review evidence, shared Docker, preview, exit/containment proof, merge, and
  Done;
- #233 for Sprint archive/restore, scheduling, interruption, and Incident coordination;
- #234 for Docs archive/restore and document-version authority;
- #236 for Release evidence, artifact, promotion, rollback, and environment lifecycles; and
- Notifications/Admin-Observability for Incident identity/lifecycle and remediation tracking.

`DevBoard.RetentionPolicy` owns no Proposal, DevTicket, Sprint, Docs, lane, Ready, Blocked, Absolute
Stop, Execution Lease, Runner, Review, GitHub disconnect, Release, credential, grant, tunnel,
preview, provider, or Incident lifecycle. It inventories required legs, emits typed requests, and
waits for independently authenticated owner facts. `ResolveAbsoluteStop` remains the only stop
resolver. A retention/redaction worker can never infer resolution from its own target outcomes.

## Official GitHub evidence checked

Checked against current official GitHub documentation on 2026-07-17:

- [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
  establishes rotate/revoke-first guidance; history rewriting changes commit identities, can break
  PR diffs/signatures/automation, requires force updates and collaborator coordination, cannot clean
  other clones/forks, and may require GitHub Support for cached views and PR refs. It does not grant
  Opzava automatic force-rewrite or universal-erasure capability.
- [Tracking changes in a comment](https://docs.github.com/en/communities/moderating-comments-and-conversations/tracking-changes-in-a-comment)
  establishes that readable edit history can retain prior comment content and that deleting a
  sensitive revision is a separate authorized UI action. The author/time remain visible. It does not
  prove a REST comment update/delete cleared revision history.
- [Administering issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues)
  establishes that repository Admins can permanently delete an Issue through GitHub's product
  surface. It does not document a corresponding Issue-delete REST operation for the App adapter.
- [Editing an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/editing-an-issue)
  establishes that Issue description edit history can remain available unless an authorized user
  removes the sensitive revision separately. A current-body REST update does not prove that edit
  history was removed.
- [REST issue comments](https://docs.github.com/en/rest/issues/comments) documents App-token update
  and delete operations for the current comment resource, including Issues/Pull requests write
  permissions and `204` deletion. It does not promise deletion of comment revision history, caches,
  exports, notifications, or external copies.
- [REST issues](https://docs.github.com/en/rest/issues/issues) documents App-token mutation of the
  current Issue resource and permission requirements. It does not provide general provider CAS,
  automatic history erasure, or a documented Issue-delete REST operation.

Provider capabilities are probed and version-pinned at implementation time. Lack of an explicit,
verified capability is `unsupported`, never presumed success.

## Deep module and durable records

All records are tenant/workspace/repository scoped, RLS-protected, append-only or immutable where
stated, and cross-linked to the existing four ledgers. RLS authorization runs before idempotency or
receipt lookup; a denied/cross-tenant request is a hard `403` and cannot discover whether a key or
case exists.

### `RetentionPolicyVersion`

Immutable identity: `(tenantId, policyId, policyVersion)`. It contains `policyHash`, trusted
`createdAt`/`activatedAt`, author and authorization refs, predecessor/supersession refs, class
rules, target rules, safety-predicate schema version, trusted-clock policy, hold precedence,
tombstone-key policy, default numeric TTL configuration or explicit `none`, and state
`draft|active|superseded|withdrawn`. One active version per tenant/policy family is enforced by CAS;
activation never rewrites bindings created under older versions.

### `RecordRetentionBinding`

Immutable identity: `(tenantId, ownerKind, ownerId, contentGeneration)`. It binds exact owner record
version, content digest/size/media classification, retention class, policy ID/version/hash,
classification rule/version, Secret-Safe admission receipt, source authority, trusted `ingestedAt`,
initial `eligibleAt` or `none`, storage target set, legal/security flags, reliance subject ID, and
binding hash. `contentGeneration` changes whenever payload bytes or semantic content changes; a
mutable row never carries an old generation's expiry authority.

### `RetentionReclassification`

Append-only identity: `reclassificationId`; idempotency identity:
`(bindingId, requestKey, canonicalRequestHash)`. It binds old/new class and policy, actor/authority,
reason code, decision time, trusted `effectiveAt`, predecessor, and status
`proposed|accepted|rejected|superseded`. Acceptance applies prospectively to a new generation or
future eligibility evaluation. It cannot backdate, shorten a previously committed minimum window, or
mutate a dispatched manifest. Same key/hash returns the original; same key/different hash is a
collision.

### `RetentionHold`

Identity: `(tenantId, holdId, holdVersion)`; active uniqueness by exact scope and purpose. It binds
kind `legal|security|investigation|operational`, scope selectors without raw content, reason/legal
basis code, requester and authority, placed and trusted effective time, review time, release actor/
authorization, successor ref, and state `active|released|expired|superseded`. Legal and security
holds never auto-expire and may be released only by a current authorized actor through secure UI
under the exact hold version. An operational hold may have one explicit trusted expiry; an
investigation hold also requires explicit current authorized release through secure UI. Holds win
ordinary expiry. No hold retains rejected raw secret content or delays automatic containment/
suppression.

### `ExpiryManifest` and `ExpiryDisposition`

An `ExpiryManifest` is immutable after `preparing`. Identity:
`(tenantId, manifestId, manifestGeneration)`; preparation idempotency:
`(bindingId, contentGeneration, policyVersion, evaluationKey, canonicalInputHash)`. It binds:

- binding, object/content generation, policy/classification versions and hashes;
- trusted `eligibleAt`, `evaluatedAt`, evaluator clock/epoch, and a sanitized durable summary;
- reliance graph version, watermark, and exact active reliance/pin results;
- replay, gap, dedupe, semantic-ACK, key-trust, audit, workflow-gate, archive, and hold versions;
- exact target set with target generation/version/capability observation;
- barrier generation, batch ID/digest, evaluator/authorization refs, and manifest hash.

Lifecycle is `preparing -> executing -> reconciling -> complete|partial|unknown|blocked`, with
`superseded` allowed only before any target dispatch. The transaction that creates the immutable
manifest in `preparing` atomically makes the payload unavailable for new reliance. Pin-first
evaluation blocks preparation; manifest-first makes a later reliance attempt fail. Every dispatch
rechecks barrier, hold, policy, binding/content generation, target/capability version, actor
authority, and case/manifest generation.

Each exact target has one immutable/corrected `ExpiryDisposition` chain with identity
`(manifestId, targetKind, targetId, targetGeneration, attemptSequence)`, effect reservation token,
provider/object request ref, observed outcome, independently verified time, safe reason, and state
`pending|dispatch_reserved|deleted_confirmed|confirmed_absent|unknown|manual_required|unsupported|failed|superseded|residual_exposure`.
`deleted_confirmed` requires independently verified deletion of the exact generation;
`confirmed_absent` proves only that the exact target is absent under the documented observation
seam. Possible effect with lost response is `unknown`; it is never blind-redispatched. `partial` is
derived from target states, never asserted by a worker. The independently durable batch manifest and
digest survive deletion of eligible payload bytes.

### `ExceptionalRedactionCase`

Identity: `(tenantId, caseId, caseGeneration)`. It binds purpose
`secret_containment|legal_redaction|privacy_erasure|scope_expansion|destructive_cleanup`, safe
subject/classification, exact content generations and targets, detector/requester and authority,
legal/policy basis, minimum-necessary plan, owner dependency legs, current barrier version,
credential/grant/tunnel/artifact/GitHub refs, risk preview, successor case, and state
`draft|active|containing|awaiting_authorization|executing|reconciling|complete|partial|unknown|cancelled|superseded`.
The case is coordination state, not a workflow lane or Absolute Stop. A suspected-secret case binds
the existing Absolute Stop and cannot complete while its required residual legs keep that stop
unresolved.

### `RedactionActionAuthorization`

Short-lived one-use identity: `(caseId, authorizationId, nonce)` with exact case generation,
targets, actions, actor/current role, secure session and step-up ceremony, authorization/policy
versions, consequence preview digest, issued/expires times, and state
`pending|authorized|consumed|expired|revoked|superseded`. The same Admin may request and perform a
separate step-up confirmation in v1, but the system executor is a distinct principal. The worker
reauthorizes role, session, policy, case/target generation, barrier, and nonce before **each**
effect. Authorization does not cover automatic minimum secret containment, cannot resolve an
Absolute Stop, and cannot be widened after issue.

### `PayloadSuppressionBarrier`

Identity: `(tenantId, ownerKind, ownerId, contentGeneration, barrierGeneration)`. It contains a safe
classification/reason, exact blocked operations, opened actor/source or automatic detector,
policy/case/Absolute Stop refs, trusted open time, successor/sanitized replacement ref, and state
`active|replaced|released`. Release requires the exact owner policy and safe replacement/reliance
state; secret containment cannot be released merely because one provider target changed.

Every application read, projection rebuild, webhook normalization, reconciler, mirror/outbox
renderer, search/index/cache builder, export/download, object fetch, backup, replay, and migration
path checks the barrier before bytes or derived text leave the protected adapter. An active barrier
rejects new evidence reliance, re-ingestion, restoration, model context, provider emission, and
derived caches for that exact generation. It owns no lane/process/lease/Review/provider-command/
Absolute Stop authority.

### `RedactionTargetAction`

Identity: `(caseId, targetKind, targetStableId, targetGeneration)` with one active owner/version.
Same-purpose scopes coalesce; conflicting scopes serialize. Same idempotency key/hash returns the
original action; changed hash conflicts. It binds required authorization kind, exact operation,
minimum-necessary replacement digest/ref, adapter capability version, reservation/attempt,
provider/object observation, independent verifier, and one of:

`pending_authorization`, `authorized`, `dispatch_reserved`, `provider_pending`, `confirmed`,
`unknown`, `manual_required`, `unsupported`, `failed`, `superseded`, or `residual_exposure`.

Cancellation is permitted only before irreversible dispatch. A newly active hold or reliance pin
wins against an undispatched ordinary manifest/authorization. Mandatory secret suppression and
minimum exposure containment are not cancelled by a hold. After dispatch, reconciliation owns the
same action identity; no new nonce or target can conceal an unknown outcome.

### `AuditTombstone`

Immutable identity: `(tenantId, tombstoneId, tombstoneVersion)`. It contains stable non-sensitive
owner/case/target IDs, classification, actor/authority chain, policy/legal basis codes, requested
and observed outcomes, trusted times, successor/sanitized replacement refs, residual status, and a
domain-separated keyed commitment:

```text
commitment = HMAC-SHA-256(
  commitmentKey,
  UTF8("opzava.retention.audit-tombstone.v1\0") || canonicalRemovedSubject
)
```

Only the commitment, algorithm/domain version, and dedicated durable commitment-key ID/version are
stored. The key is separate from vault/credential secrets and retains an auditable rotation/history
chain. The tombstone stores no raw locator, filename/path, URL, excerpt, plain hash, secret, vault
ref/key, provider body, or reconstructable value. Verification resolves the exact historical key;
key loss or unverifiable history fails closed rather than inventing a match. Tombstones are durable
and never routinely expire.

### `EvidenceRelianceRevoked`

Immutable request/fact identity:
`(tenantId, relianceSubjectId, evidenceGeneration, revocationGeneration, ownerKind)`. It binds safe
reason/classification, source case/barrier/tombstone, exact active binding refs to invalidate,
replacement evidence or `none`, requestedAt, owner acknowledgement/decision ref, and state
`requested|accepted|rejected_stale|applied|unknown`. The retention module requests; the owning
Ready/Sprint/Review/GitHub-merge/Release modules atomically invalidate current bindings and emit
their own authenticated facts.

Historical Done, Released, lane, Review, and deployment facts remain. Projections mark their
assurance `compromised|revoked`, link the Incident and governed follow-up/re-review/sanitized
replacement where applicable, and never rewrite history. #229 and final #237 must define the exact
Review lifecycle reaction; this memo does not invent it.

## Archive and restore contract

Archive remains an owner command:

| Record                 | Archive/restore owner | Required result                                                                                                                                                                                                                               |
| ---------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal and DevTicket | WF-230                | Archive preserves last active state and immutable history. A non-Done restore returns Backlog, unassigned, with no Ready Approval, claim, lease, grant, or preview. Done restores only to historical Done when WF-230 evidence remains valid. |
| Sprint                 | #233                  | Archive/restore preserves Goal, Plan, membership/order, approval, interruption, and run history under #233's invariants.                                                                                                                      |
| Docs                   | #234                  | Archive/restore preserves every governed version, decision, approval, link, and invalidation chain.                                                                                                                                           |

Archive never changes retention class, shortens an eligibility window, removes a hold, suppresses
content, or implies deletion. Restore cannot recover expired/redacted payload bytes. It restores the
owner record only with a safe missing-content marker, tombstone/successor refs, and owner gate
behavior.

GitHub archive projection is exact for v1 and is a compatible #235 refinement for #237 to consume:

- archiving a non-Done DevTicket keeps a safe managed body archive marker, removes the active
  managed `status:` lane projection, and closes the Issue with provider `state_reason=not_planned`
  only through the WF-231 outbox; it never writes `status:done`, merge, Review, or completion;
- archiving a Done DevTicket keeps `status:done` and the completed fact, adds the safe managed body
  archive marker, and preserves the provider's closed-completed disposition;
- restoring a non-Done DevTicket removes the archive marker, reopens through the WF-231 outbox, and
  writes `status:backlog` only after normal reconciliation; the Opzava owner state is Backlog,
  unassigned, and unapproved as above; and
- restoring Done removes only the archive marker while preserving Done and closed-completed truth.

Local archive may commit while the mirror remains pending, unknown, or unavailable. Ready,
provider-backed restoration, and every gate requiring synchronized provider history wait for WF-231
reconciliation. This refinement changes no WF-230 archive authority or WF-231 transport/
provider-truth authority.

## Fact-level retention matrix

### Durable with no routine TTL

- planning decisions, rejected alternatives, contract/Docs/Sprint Goal and Plan versions, and
  decision rationale;
- accepted and rejected lifecycle commands, comments, worklogs, append-only corrections,
  dependencies, assignments, approvals, policy versions, and authorization outcomes;
- denied/security receipts admitted after Secret-Safe Ingress; Ready, Review, Done, Release,
  deployment, rollback, and Incident-link facts;
- signed semantic receipts, ACKs, checkpoints, containment and reconciliation facts that any gate,
  owner decision, or historical assurance relied on;
- webhook/provider normalized identities and observations relied on for Issue/PR/check/review/merge,
  GitHub disconnect, release, or conflict decisions;
- sync dedupe/idempotency/collision receipts, final provider outcomes, outbox unknown-resolution,
  Mirror Shadow/conflict decisions, and relied normalized observations;
- immutable `RecordRetentionBinding`, accepted reclassification, hold history, manifests, per-target
  dispositions, cases, authorizations, barriers, target actions, evidence-revocation facts, and
  tombstones.

Archiving does not alter this class. GitHub's raw mirror/history remains provider-owned and is not
an ordinary Opzava TTL candidate.

### Bounded only after the exact safety predicate

- stdout/stderr and high-volume tool telemetry;
- non-authoritative diagnostics and duplicate transport detail not needed for signature/dedupe/
  collision proof;
- preview payloads and expired preview render artifacts;
- temporary upload/object bundles after provider publication is conclusively reconciled;
- large non-relied evidence candidates and raw local adjunct artifacts.

Expiry requires: immutable binding; trusted `eligibleAt`; no active hold; complete reliance graph
and watermark; no Ready/Sprint/Review/merge/Release/audit/provider/dedupe/containment reliance; no
pending/unknown publication or object fetch; complete gap/ACK/key history; current policy and target
capability; exact barrier/generation match; and an immutable manifest. A sanitized durable summary
and necessary identities/digests remain. Pending or unknown object-bundle publication pins bytes. If
secret exposure is suspected, mandatory suppression cancels/fences/reconciles publication and takes
precedence over the pin.

### Never persisted raw

- webhook and retry request bodies after verified minimal normalization;
- credential, token, secret, cookie, private key, broker capability, or one-time grant values;
- unredacted provider bodies, comments, logs, stack traces, request/response bodies, or channel
  payloads;
- suspected-secret payload, excerpt, raw hash, locator, diff, artifact, evidence, notification,
  export, search entry, or model context.

## Four-ledger routing

One owner writes each authoritative fact once and every other ledger stores only stable safe refs.
There is no copied decision, fifth retention ledger, or fictional cross-ledger global order.

| Record or fact                                                                                                                                                                                                                                                                                                                                           | Authoritative location                                       | Cross-ledger rule                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy proposal rationale, classification rationale, reclassification rationale, hold request/release rationale, broader/legal redaction request and consequence decision                                                                                                                                                                                | Planning decision ledger                                     | Safe refs to policy/reclassification/hold/case/authorization IDs only; no payload or duplicated lifecycle fact                                                                      |
| `RetentionPolicyVersion` activation/supersession, accepted `RetentionReclassification`, `RetentionHold` lifecycle, `ExpiryManifest` and per-target disposition, `ExceptionalRedactionCase`, `RedactionActionAuthorization`, `PayloadSuppressionBarrier`, `RedactionTargetAction`, `AuditTombstone`, `EvidenceRelianceRevoked`, and owner acknowledgement | Dev Board activity/history ledger as coordinator/audit facts | Each record names its owning module and owner-fact refs; the coordinator never manufactures Runner/provider/lane/Review/Release truth                                               |
| Original signed Runner observations and safe receipt/checkpoint/containment/grant-disposition refs used by classification, reliance, revocation, or reconciliation                                                                                                                                                                                       | Runner execution/checkpoint ledger                           | Retention stores only admitted stable fact IDs/digests and reliance decisions; it never copies signed payloads or owns enrollment, lease, process, grant, or containment lifecycle  |
| GitHub/provider outbox intent/attempt, verified observation, unknown outcome, mirror conflict, reconciliation, and provider-scoped redaction/archive result                                                                                                                                                                                              | Synchronization/outbox/conflict ledger                       | Activity records reference the exact provider action/observation IDs; a provider result proves only its target and never directly completes a case, workflow gate, or Absolute Stop |

Archive/restore, Ready/Sprint/Review/Release invalidation, Runner revocation, credential rotation,
and Incident lifecycle facts stay with their named owners. The activity coordinator records the
accepted request and later owner acknowledgement by stable ref; it does not duplicate or reorder the
owner fact.

## Secret-Safe Ingress

Where possible, an adapter owns a narrow bounded byte buffer from read through verification,
classification, safe normalization, and rejection. Raw input never becomes a durable/domain DTO,
generic error, serialized object, queue item, mirror/outbox body, export, evidence, search/cache
entry, log, trace, Slack/GitHub message, browser DTO, or model prompt/context. Rejected bytes are
best-effort overwritten/released when the language/runtime permits.

The enforceable claim is limited and testable: suspected-secret content is rejected before any
Opzava-owned persistence or observable copy and only safe classification/receipt metadata crosses
the adapter. Opzava does **not** claim impossible universal zeroization across managed runtime,
kernel, device, provider, network, crash dump, or pre-existing external copies. Pre-existing GitHub
or other external content is suppressed/mutated at its source through a typed target action without
copying it into Opzava.

## Expiry, reclassification, hold, and race rules

1. The trusted server clock evaluates the immutable binding. Missing, legacy, unclassified, or
   incomplete reliance watermark means `ineligible`, never an inferred default.
2. Preparation locks binding/generation, policy, barrier, active holds, reliance pins/watermark,
   owner gate versions, and exact targets in canonical order and writes the manifest plus
   `preparing` barrier atomically.
3. A pin committed first blocks preparation. A manifest committed first blocks every later attempt
   to create new reliance on that generation. Neither ordering allows a disappearing dependency.
4. Before each effect, the executor reauthorizes and rechecks hold, barrier, policy/binding/
   generation, target version/capability, reliance watermark, and manifest. A new hold/pin defeats
   an undispatched effect. A dispatched effect remains reconciled, not rolled back by fiction.
5. Per-store success is recorded independently. A failed database delete cannot be hidden by object
   success; provider `2xx`/`204` proves only the documented current surface; response loss is
   `unknown`. A blind retry is forbidden.
6. Reclassification applies prospectively and never changes an already dispatched manifest. A
   superseding policy creates a new evaluation identity and preserves the old decision chain.
7. Holds override ordinary expiry, but not raw-secret rejection, active suppression, credential
   rotation/revocation, or other safety-reducing containment.

## Exceptional redaction and provider precedence

### Automatic secret containment

On suspected exposure, the owning security command opens/reuses the Absolute Stop and barrier,
revokes or rotates the affected credential first, revokes derived lease grants and preview/tunnel
authority through their owners, fences/contains affected execution, and cancels or quarantines
publication. Reversible local/provider suppression is automatic.

If active exposure can only be stopped by editing the exact current provider field or deleting the
exact current comment/object, the smallest operation that replaces/removes the **secret value only**
is automatic unbypassable containment. It is not `Needs Human Approval`, and no Admin may delay or
bypass it. The operation preserves all safe surrounding content where the adapter can do so without
copying the secret. It never expands into Issue deletion, broad comment deletion, history rewrite,
fork cleanup, or unrelated content erasure.

### Broader/legal removal

Legal redaction, privacy erasure, Issue/comment deletion beyond the minimum secret span, scope
expansion, provider Support requests, and destructive cleanup use the exact
`RedactionActionAuthorization`. The UI shows scope, irreversible effects, provider limitations,
residual copies, historical assurance impact, replacements, and rollback impossibility before
step-up. A stale role/session/policy/case/target, expired nonce, changed preview, replay, or target
drift rejects before dispatch.

### GitHub capability and limitation matrix

| Surface                                                  | Automatic minimum secret containment                                                                                                              | Broader/legal path                                                                                                                                             | Truthful completion limit                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Current managed Issue body                               | Exact secret-value replacement through serialized WF-231 update when App capability is current                                                    | Exact step-up action for broader rewrite; permanent Issue deletion remains Admin product-surface/manual unless a documented adapter capability is later proven | Current body observation only; edit/provider history, notifications, exports, caches, and copies remain separate                |
| Current Issue/PR comment                                 | Exact secret-value replacement or exact comment deletion when replacement cannot stop exposure                                                    | Step-up for broader deletion                                                                                                                                   | REST `200`/`204` plus refetch proves current resource only; revision history may require separate authorized GitHub UI action   |
| Comment revision history                                 | No automatic claim from comment update/delete                                                                                                     | Authorized human/manual action where GitHub exposes it                                                                                                         | Author/time can remain; unavailable automation is `manual_required`/`unsupported`                                               |
| Git history/commit/blob/ref                              | Rotate/revoke credential, suppress all Opzava access/publication, contain Runner and exact refs; never force-rewrite through ordinary publication | Separate destructive, coordinated, human-authorized incident/remediation plan outside the exact-ref port                                                       | Rewriting changes SHAs/signatures/PRs, needs force updates, may require Support, and cannot clean clones/forks                  |
| PR refs, forks, clones, caches, Support-controlled views | Suppress Opzava propagation and record required manual legs                                                                                       | Human/provider coordination                                                                                                                                    | Each remains `manual_required`, `unsupported`, or `residual_exposure`; one cleaned repository surface proves none of the others |

`ResolveAbsoluteStop` requires every owner-specific confirmation and honest residual disposition. An
Admin acknowledgement of residual risk records that acknowledgement only; it can never fabricate
provider confirmation, revoke another authority, or resolve the stop.

## Capability and authorization matrix

| Capability                           | Allowed principal and scope                                          | Step-up / idempotency                                                                     | Forbidden authority                                     |
| ------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Create policy draft                  | Current Admin with `retention.policy.manage`, tenant/workspace scope | secure session; key/hash replay rules                                                     | activate, backdate, mutate bindings                     |
| Activate/supersede policy            | Current Admin policy approver                                        | step-up for class weakening; exact policy version/hash/CAS                                | shorten prior binding, dispatch expiry                  |
| Place hold                           | Authorized Admin/legal/security owner for exact safe scope           | exact hold key/hash; current role/policy                                                  | preserve raw secret or resolve containment              |
| Release hold                         | Current authorized holder/releaser under policy                      | step-up when legal/security; exact hold version                                           | delete content or release a barrier                     |
| Prepare expiry                       | System evaluator                                                     | deterministic binding/generation/evaluation key                                           | infer missing classification/reliance                   |
| Execute/reconcile expiry             | Distinct system executor                                             | reauthorize/recheck each target; same manifest/action identity                            | blind retry, broaden targets, claim unknown success     |
| Request exceptional case             | Human Owner/Admin, security detector, or authorized owner module     | exact case key/hash and safe metadata                                                     | dispatch effect, store raw payload                      |
| Automatic secret containment         | Security/Absolute Stop executor with verified detector evidence      | no human step-up; deterministic case/target identity                                      | broader erasure, bypass, stop resolution                |
| Authorize irreversible target action | Current Admin in secure UI                                           | separate step-up, one-use nonce, exact case/targets/actions/session/policy/preview/expiry | automatic containment delay; blanket/future authority   |
| Execute target action                | Distinct system executor/provider adapter                            | reauthorize before each effect; one reservation per target generation                     | change scope, choose new action, infer provider success |
| Record manual/provider proof         | Mapped Admin or verified provider observer                           | exact target/proof type/version; append-only                                              | self-verify, claim other surfaces                       |
| Independently verify target          | Separate verifier/provider reconciliation worker                     | current capability and fresh observation                                                  | reuse dispatch response as independent proof            |
| Acknowledge residual risk            | Current Admin/security owner                                         | step-up, exact residual target/version/reason                                             | provider confirmation or `ResolveAbsoluteStop`          |
| Read/audit tombstone                 | Authorized auditor/Admin for tenant                                  | RLS before lookup; audited purpose                                                        | reveal commitment input/key/raw locator                 |
| Admit backup restore                 | Platform Admin plus restore controller                               | separate step-up; exact backup/stream/digest/cutover                                      | serving before replay; waive missing stream             |

Role/version drift is checked both before receipt disclosure and before effect. Cross-tenant,
unauthorized, stale, expired, replayed-with-change, or forbidden-family requests return hard denial
without target mutation. Exact same-key/hash authorized replay returns the original safe result.

## Evidence and owner-specific revocation

`EvidenceRelianceRevoked` fans out only typed requests. Each owner locks its current binding and
returns an authenticated applied/stale/unknown fact:

- WF-230 invalidates current Ready Approval/claim admission and fences or blocks through its
  existing lifecycle where active authority relied on removed evidence;
- #233 invalidates current Sprint Goal/Plan/member approval or pauses through its own contract;
- #229 invalidates current Review/merge evidence authority, opens governed re-review or sanitized
  replacement, and supplies exact Review containment/exit behavior;
- #236 invalidates current Release approval/evidence/candidate operation while preserving historical
  Released facts and current-environment truth;
- WF-231 suppresses/reconciles mirror/outbox/provider observations without claiming workflow effect;
  and
- Incident/remediation owners open/link the operational record and permanent-fix DevTicket when
  assurance or exposure warrants it.

Owner-specific revocation legs are deliberately separate. Every named action has an explicit
requester/trigger, executor, approval or automatic policy, independently required confirmation, and
auditor/projection:

| Leg                                    | Requester / trigger                                                                                                   | Owner / executor                                                                        | Approval or automatic policy                                                                                                                       | Independently required confirmation                                                                                                                                               | Auditor / projection                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Runner enrollment epoch/key            | Verified key compromise, Admin secure-UI request, or owning security policy                                           | WF-232 Runner Registry/Protocol                                                         | Automatic for verified compromise/Absolute Stop; otherwise current secure-UI Runner-admin authority                                                | Epoch/key revoked, connection disposition, and affected fact cutoff under WF-232; none proves process containment                                                                 | Dev Board activity ref plus Admin Runner/Security projection                                               |
| Execution lease/fence/process/worktree | Absolute Stop, evidence-revocation owner, disconnect/loss detector, or governed owner command                         | WF-230 Execution Admission and containment finalizer using WF-232 facts                 | Automatic containment for safety/loss; governed WF-230 authority for other interruption                                                            | Lease fence **and** exact no-process/stopped-or-quarantined process/worktree containment finalization                                                                             | Dev Board activity/Blocked/containment projection; Runner ledger retains original signed observations only |
| Local lease credential grant           | Lease fence/expiry, Absolute Stop, case target, or owner cleanup request                                              | WF-232 Lease Secret Broker/local grant Adapter                                          | Automatic under lease/containment policy; never broader secret authority                                                                           | Exact local grant disposal for every derived grant                                                                                                                                | Dev Board activity safe ref plus Runner/grant health projection                                            |
| Upstream credential                    | Suspected exposure, provider compromise, Admin rotation/revoke request, or case target                                | Owning vault/provider credential Adapter, separate from Runner                          | Automatic rotate/revoke first for suspected exposure; secure-UI step-up for broader/destructive cleanup                                            | Provider-scoped rotate/revoke/expiry observation for exact credential generation; local disposal is insufficient                                                                  | Security audit/Secrets projection and Absolute Stop required-leg view                                      |
| Preview/tunnel                         | Barrier/Absolute Stop, Review/lease loss, expiry, or explicit close                                                   | #229 preview authority with WF-232 transport/tunnel Adapter                             | Automatic on stop/loss/expiry; exact #229 authority for ordinary close                                                                             | Exact authorization closure and independently observed tunnel disposition                                                                                                         | Card Review evidence/preview plus Security projection                                                      |
| Object/artifact access and publication | Barrier/case, suspected secret, expiry manifest, publisher cancellation, or evidence revocation                       | Object-store owner and WF-231/WF-232 publication owners                                 | Automatic access suppression for barrier/secret; broader deletion uses exact expiry or redaction authority                                         | Access revoked, writer/fetch closure, publication cancelled or reconciled, and per-target object disposition; pending/unknown stays pinned                                        | Card/evidence, sync health, and retention manifest projections                                             |
| GitHub current field/comment/ref       | Barrier/case, automatic minimum secret containment, broader authorized redaction, archive/restore, or sync correction | WF-231 GitHubIntegration/provider Adapter                                               | Automatic exact minimum for secret; `RedactionActionAuthorization` for broader/legal; archive/restore uses WF-230 owner command plus WF-231 outbox | Fresh exact-target provider observation: `deleted_confirmed`, `confirmed_absent`, `unknown`, `manual_required`, `unsupported`, or `residual_exposure`; one target proves no other | Sync/outbox/conflict ledger and Card Development/retention projection                                      |
| GitHub disconnect                      | Admin secure-UI request, App compromise, or integration Absolute Stop policy                                          | WF-231 disconnect saga                                                                  | Automatic outbound fence for compromise; secure-UI current Admin authority for ordinary disconnect                                                 | Provider uninstall/revoke/expiry and local cleanup terminal facts under WF-231; content mutation/secret rotation are separate                                                     | Connections/GitHub health and Security audit projection                                                    |
| Evidence reliance                      | Active binding intersects an expired/redacted/suppressed generation                                                   | Retention emits `EvidenceRelianceRevoked`; WF-230/#229/#233/#236 owning modules execute | Automatic fail-closed invalidation request; each owner applies its current gate policy                                                             | Owner-specific applied/stale/unknown fact for every exact Ready/Sprint/Review/merge/Release binding                                                                               | Card/history/Release assurance projection and linked Incident/follow-up                                    |

Offline or unknown retains the owning lock/containment. Local grant disposal never proves upstream
revocation. GitHub disconnect never proves secret cleanup, and secret rotation never proves a Runner
stopped. A pending or outcome-unknown object-bundle publication pins its bytes until WF-231
reconciles it, except mandatory secret suppression immediately fences/cancels access/publication and
records the unknown provider leg.

## Backup and restore anti-resurrection

Backup restore runs in an isolated, non-serving network/database/object namespace. Before any
projection, search, cache, artifact, download, mirror, export, job, or browser route is enabled:

1. verify backup identity, signatures/digests, schema, tenant scope, and restore authorization;
2. fetch an independently replicated append-only erasure/tombstone stream whose trusted high-water
   mark is newer than the backup snapshot;
3. verify stream continuity, signer/key history, ordering, digest, tenant coverage, and absence of
   gaps; missing or unverifiable stream blocks restore;
4. replay barriers, target dispositions, tombstones, evidence-revocation requests, and sanitized
   successors before building any derived view or permitting bytes to leave isolation;
5. scan restored payloads and prove removed generations cannot be read, indexed, exported, mirrored,
   or re-emitted; then authorize cutover against the exact replay watermark.

An immutable backup that still contains removed bytes remains isolated as `residual_backup_pending`
until its ordinary expiry or cryptographic erasure is independently confirmed. The product never
claims deletion from immutable media it cannot mutate, and never serves that residual copy.

## Sad paths and race outcomes

| Scenario                                             | Required outcome                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy/missing binding or reliance watermark         | Ineligible; classify/migrate safely first; no default TTL                                                                             |
| Policy changes after ingestion                       | Existing binding/window stands; prospective reclassification only                                                                     |
| Pin races manifest                                   | Pin-first blocks; manifest-first blocks new reliance; one serializable winner                                                         |
| Hold races dispatch                                  | Undispatched action blocks; dispatched action reconciles; no rollback fiction                                                         |
| Same key, changed hash                               | Conflict/audit; no second manifest/case/action/effect                                                                                 |
| Two redaction cases overlap                          | Same purpose coalesces; conflicting scopes serialize under one active target/generation owner                                         |
| Cancel races provider dispatch                       | Cancel only wins before `dispatch_reserved`; otherwise reconcile same action                                                          |
| Provider response lost                               | `unknown`; no blind redispatch or fresh nonce                                                                                         |
| Provider current body clean but history/fork unknown | Current target `confirmed`; other targets remain residual/manual/unsupported; case partial                                            |
| Secret found under active legal hold                 | Reject raw persistence, rotate/revoke and suppress/contain; hold does not preserve the secret                                         |
| Archive races retention                              | Archive owner and retention binding versions serialize; archive never changes class or accelerates TTL                                |
| Restore requests expired/redacted bytes              | Restore owner record with missing/tombstone/successor state; never resurrect bytes or prior Ready authority                           |
| Evidence removed while Ready/Review/Release active   | Barrier blocks new use; owner receives revocation request and invalidates current binding; historical facts remain marked compromised |
| Runner offline during revocation                     | Fence and barrier persist; execution/process/grant facts remain unknown; no release or stop resolution                                |
| Object publication pending when expiry evaluates     | Pin bytes and block ordinary expiry; suspected secret instead suppresses/cancels/fences and reconciles provider uncertainty           |
| Commitment key unavailable after rotation            | Verification fails closed; tombstone remains, no guessed match                                                                        |
| Backup lacks complete erasure stream                 | Restore remains isolated/non-serving; no override by approval                                                                         |
| RLS-denied lookup with guessed idempotency key       | Hard `403` before receipt/case existence lookup                                                                                       |

## Migration and legacy handling

1. Inventory each payload-bearing row/object/provider reference across the four ledgers, legacy
   Task/ Issue tables, Runner artifacts, exports, caches, previews, and backups. Assign exactly one
   owner, content generation, retention class, and migration disposition.
2. Durable legacy facts remain durable. Missing classification, Secret-Safe admission proof, or
   reliance watermark is `legacy_unclassified` and ineligible for automated expiry.
3. Add policy, binding, hold, barrier, manifest, case/action, tombstone, and evidence-revocation
   storage through expand-contract with tenant RLS and a durable outbox. Do not rewrite historical
   migrations or raw payloads to manufacture compliance.
4. Backfill safe metadata only. Never read and copy a suspected external secret merely to create a
   domain record. Open a barrier/case against the provider identity and operate at source.
5. Build complete reliance edges from Ready/Sprint/Review/merge/Release/provider/audit/containment
   facts. Anything incomplete remains pinned.
6. Run shadow expiry that writes manifests/dispositions without deleting. Compare every store and
   owner projection before enabling effect execution.
7. Enable automatic secret containment before broad/legal erasure. Provider capability gaps must
   render manual/unsupported/residual states and actionable secure-UI steps.
8. Complete an isolated backup restore/replay drill before automated expiry can reach production
   data. Rollback disables new execution; it never restores expired/redacted generations.

## Deterministic validation and real user evidence

No model output is a retention, redaction, provider, or secret-absence oracle.

### Deterministic no-model seams

- **Postgres/RLS:** real application role, two tenants, hard `403` before receipt lookup; race
  policy activation, binding, reclassification, hold, reliance pin, manifest preparation,
  case/target ownership, authorization consume, dispatch reservation, and evidence-revocation
  acknowledgement.
- **Object/log/search/export:** seed a unique non-production canary and prove automatic expiry only
  after the full safety predicate; prove an active barrier prevents reads, rebuild, re-ingestion,
  cache/search/export, backup inclusion, and replay for the exact generation.
- **Provider adapter:** use one fixed GitHub scratch repository and current pinned App. Exercise
  Issue-body replacement, comment update/delete, comment-history manual limitation, ambiguous/lost
  response, permission drift, rate limits, missing target, and current-body-versus-residual scope.
- **Runner/artifact:** use deterministic fake Harness plus real worktree/process/object fixture to
  distinguish enrollment/key, lease fence, containment, local grant disposal, upstream revoke,
  preview closure, object access, and GitHub disconnect. One fact must never satisfy another.
- **Backup drill:** restore a pre-redaction snapshot into a non-serving stack, replay a newer signed
  erasure stream, rebuild all projections/indexes, and prove no removed generation is reachable
  before cutover. Corrupt/missing stream must block.
- **Tombstone:** verify commitment across key rotation and historical key selection; wrong purpose,
  input, tenant, key version, or lost key fails closed; inspect stored tombstone for forbidden
  locators/snippets/plain hashes/secrets.

### Authenticated local-Docker user-level E2E

Against `http://web.opzava.localhost:18088`, with ordinary Admin login, real tenant RLS, the shared
local Docker stack, and the fixed GitHub scratch repository:

1. configure numeric TTL defaults and activate a versioned policy in secure UI; inspect exact scope,
   policy version, and effect preview without raw payload;
2. archive and restore a non-Done Card, observing GitHub mirror pending/confirmed separately and
   restore to Backlog unassigned with no Ready/claim/lease/grant/preview;
3. hold a bounded eligible artifact, see expiry blocked, release under exact authority, run expiry,
   and inspect an immutable manifest plus truthful per-store outcomes;
4. inject a unique fake secret into every test ingress. Prove it is absent from Postgres, logs,
   outbox/inbox, GitHub mirror copies, Slack/notifications, export/download, evidence, search/cache,
   preview/browser DTO, and model context while safe rejection/containment metadata remains;
5. expose that canary only in a controlled scratch GitHub current body/comment, observe automatic
   rotate/revoke-first minimum containment without Needs Human Approval, and see comment history/
   forks/caches/support limitations remain manual/residual rather than falsely complete;
6. request a broader/legal removal, review consequence preview, complete separate step-up, refresh
   after role/nonce/target drift, and prove only the exact authorized action can dispatch once;
7. remove evidence currently bound to a gate, see owner-specific assurance invalidation and linked
   Incident/follow-up without rewriting historical Done/Released/lane facts;
8. disconnect the Runner during revocation and prove locks/barriers remain, local disposal is not
   upstream revocation, Slack is safe, and no stop/lane/resource resolution is inferred; and
9. perform the isolated restore drill and prove serving/cutover remains disabled until the complete
   newer erasure stream replays.

Evidence includes authenticated browser screenshots/traces, HTTP status/response shapes, exact DB
rows under application role, provider IDs/observations from the scratch repo, object/search/export
absence assertions, signed owner facts, manifest/tombstone digests, and restore watermarks. No other
tab is needed to understand status or provide an Opzava-owned action; genuinely provider-manual
steps are rendered as in-product instructions and remain visibly incomplete until independently
verified.

## #237 implementation handoff

Final synthesis [#237](https://github.com/anthonykewl20/opzava/issues/237) must decompose vertical
tracer bullets that preserve:

1. RetentionPolicy/Binding/Reclassification/Hold plus RLS and trusted-clock behavior;
2. barrier-first Secret-Safe ingress and read/rebuild/export/backup enforcement;
3. manifest/per-store expiry with reliance graph, unknown reconciliation, and no blind retry;
4. WF-230/#233/#234 archive-owner adapters and explicit GitHub archived projection;
5. automatic secret containment plus owner-specific credential/grant/tunnel/process/artifact/GitHub
   legs without human bypass;
6. exact broader/legal step-up authorization, target execution, independent verification, and
   residual/manual/provider limitation UX;
7. tombstone/commitment-key rotation and evidence-reliance revocation into #229/#233/#236 owners;
8. isolated backup anti-resurrection and the real local-Docker/GitHub scratch acceptance story; and
9. expand-contract migration of legacy unclassified records with shadow expiry and rollback.

Every implementation issue must name the exact outcome and bounded scope, owner dependencies,
classification, sad paths/races, actor/source/capability, idempotency and expected versions, human
input and step-up state, secret refs or `none`, approval gates, final behavioral contract,
migration/ rollback, objective acceptance criteria, and real user-level pass/fail evidence. Missing
any item keeps it out of Todo.

## Rejected alternatives

| Alternative                                       | Why rejected                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| One mutable retention flag on every table         | Cannot bind generations, policy, reliance, stores, races, or historical decisions |
| A fifth global audit ledger                       | Falsely orders independent authorities and duplicates the four-ledger contract    |
| Archive means delete/close/Done                   | Erases reversible workflow/history and fabricates completion                      |
| Current policy retroactively changes old rows     | Backdates/shortens committed handling without an auditable decision               |
| Delete after `eligibleAt` alone                   | Ignores holds, reliance, gaps, unknown effects, and owner gates                   |
| Keep raw payload for audit or tombstone hash      | Retains the exposure and makes the tombstone a recovery oracle                    |
| UI redaction only                                 | Leaves DB, logs, outbox, exports, search, provider, and backups exposed           |
| Require Admin before minimum secret containment   | Delays an unbypassable safety-reducing action                                     |
| Treat provider `2xx`/`204` as universal erasure   | Overclaims history, forks, clones, caches, refs, and Support-controlled surfaces  |
| Let one revocation fact prove every leg           | Confuses local authority with external/process/provider truth                     |
| Restore backup, then apply erasures after serving | Creates a resurrection window in projections, exports, mirrors, and caches        |

## Resolution boundary

This candidate resolves the planning question with a generation-bound RetentionPolicy deep module;
reversible owner-controlled archive; exhaustive durable/bounded/never-raw classification;
manifest-driven fail-closed expiry; content-only suppression; automatic minimum secret containment;
exact step-up broader/legal redaction; truthful provider residuals; safe durable tombstones;
owner-executed evidence and authority revocation; and backup anti-resurrection. It creates no
product implementation or lifecycle authority. After review, landing, and tracker/map designation,
#237 may consume it into the final implementation graph.
