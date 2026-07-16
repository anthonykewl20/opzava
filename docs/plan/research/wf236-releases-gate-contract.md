# WF-236: Releases Gate contract

## Status and decision provenance

This memo is the canonical resolution asset for Wayfinder ticket #236. It specifies target behavior;
it does not claim that the Releases view, Release aggregate, build pipeline, Dokploy adapter, or
promotion workflow is implemented.

The human administrator explicitly approved the remaining recommended Releases Gate decisions as a
group on **2026-07-17**. That approval completed the grilling that began with the following already
locked decisions:

- DevTicket `Done` ends at reviewed merge into `development`.
- Releases is a separate Dev Board view; staging and live production are separate environments.
- V1 governs one repository, the Opzava repository.
- GitHub Actions may request a policy exception, surfaced as `Needs Human Approval`; Actions do not
  grant approval or bypass Opzava gates.
- Suspected secret exposure and unhealthy or unverifiable GitHub integration are absolute stops.
- Slack is a bounded notification and approval relay, never workflow authority.
- DevTicket Cards remain `Done` while their changes move through a Release.
- Live production is associated with the protected `main` branch.

This record reports the approved answer and recommendation; it does not invent verbatim quotations
from the human or preserve hidden model reasoning.

| Decision group                        | Recommendation and approved answer                                                                                                                                                                                                                                                                     | Rejected alternatives                                                                                                                   | Implementation validation still required                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Release identity and composition   | Use a separate Opzava `Release` aggregate. A mutable Draft becomes an immutable Release Candidate with a sealed Release Manifest. Build once and promote the same digest bundle. Derive included work from the exact Git DAG/range and require source or behavioral changes to map to Done DevTickets. | A lane on the Board; mutable manifests after staging; hand-maintained ticket lists; treating GitHub Releases as workflow truth.         | Validate Git graph edge cases against the GitHub App and real repository; prove stable-version reservation concurrency.         |
| 2. Staging and production saga        | Use distinct staging and production attempts, distinct human approvals, protected-main promotion, provider confirmation, digest equality, smoke/stabilization evidence, and GitHub publication.                                                                                                        | One approval for both environments; deploy-before-source promotion; provider HTTP success as deployment success; rebuild in production. | Confirm Dokploy API behavior, cancellation limits, observed digest/health seams, and protected-branch policy in the live setup. |
| 3. Approval and absolute stops        | Bind approvals to exact actor, role, Release, candidate, manifest, environment, evidence, action, nonce, expiry, policy, and reason. Keep ordinary exception approval separate. Never bypass secret-exposure or GitHub-trust stops.                                                                    | Durable blanket approvals; approvals by label/comment/Action; a generic bypass flag; approvals that survive material change.            | Validate current Admin roles, Slack identity binding, expiry defaults, and revocation propagation.                              |
| 4. Evidence and health                | Seal an immutable, source-versioned Release Evidence Package and revalidate time-bounded observations at execution. Display truthful partial, mixed, unknown, and publication-pending conditions.                                                                                                      | A green summary without source receipts; copying secrets into evidence; assuming the last desired state is current state.               | Pin registry, signing, SBOM, vulnerability, backup/restore, DNS/TLS, smoke, and soak adapters and policies.                     |
| 5. Failure, rollback, and forward fix | Keep source/tag history immutable. Roll back by a new deployment attempt to a previously verified manifest; use a new DevTicket and new version for forward fixes. Preserve Released history during later degradation.                                                                                 | Moving/deleting tags; resetting `main`; rewriting a Released record; automatically treating Incident resolution as Release success.     | Validate migration compatibility/restore proofs and immediate safety-containment policy.                                        |
| 6. History and external mirrors       | Keep Opzava command/lifecycle authority, durable outboxes, provider fact ledgers, cross-linked evidence, safe GitHub secondary history, and Slack notifications. No global event order is assumed.                                                                                                     | GitHub or Slack as primary history; synchronous best-effort notifications; one blended activity timeline with implied global order.     | Define retention, redaction/tombstone policy, GitHub Release formatting, and operator reconciliation UI.                        |

**Participants:** the Opzava Owner/human administrator and the assistant. **Decision date:**
2026-07-17. The approval source is the parent planning conversation, not a GitHub issue comment.
Issue #236 is resolved and closed; this memo remains current input for #237 while parent map #228 is
open.

## Planning Session Log

The human administrator approved the six recommended decisions together on 2026-07-17; the exact
wall-clock time was not captured. Each entry below records the question resolved by that approval.

### 1. Release identity and composition

- **Question:** Should Releases be a separate aggregate, and how is exact included work/artifact
  identity established?
- **Recommendation:** Use mutable Drafts, immutable candidates/manifests, full Git DAG validation,
  Done DevTicket mapping, and build-once digest promotion.
- **Human decision:** Approved through the 2026-07-17 group approval in the parent conversation.
- **Timestamp:** 2026-07-17 (group approval; exact wall-clock time was not captured).
- **Rejected:** Board lane ownership, mutable sealed manifests, hand-maintained membership, and
  GitHub Release as workflow authority.
- **Unresolved validation:** GitHub graph edge cases, protected-ref observations, and reservation
  concurrency.

### 2. Staging and production saga

- **Question:** Which distinct gates and confirmations move one artifact through staging and
  production?
- **Recommendation:** Use fenced attempts, deterministic provider verification, separate human
  Staging/Production Approvals, protected-main/tag confirmation, same-digest deploy, and
  publication.
- **Human decision:** Approved through the 2026-07-17 group approval in the parent conversation.
- **Timestamp:** 2026-07-17 (group approval; exact wall-clock time was not captured).
- **Rejected:** One approval, deploy-before-source promotion, provider HTTP success as completion,
  and production rebuild.
- **Unresolved validation:** Dokploy cancellation, digest/health observation, and protected-branch
  behavior.

### 3. Approval and absolute stops

- **Question:** What exact authority may approve a Release and which conditions are unbypassable?
- **Recommendation:** Bind human decisions to exact current inputs; keep exception approval
  separate; never bypass suspected secret exposure or unhealthy/unverifiable GitHub.
- **Human decision:** Approved through the 2026-07-17 group approval in the parent conversation.
- **Timestamp:** 2026-07-17 (group approval; exact wall-clock time was not captured).
- **Rejected:** Blanket approval, GitHub/Slack authority, generic bypass flags, and stale approval
  reuse.
- **Unresolved validation:** Admin roles, Slack identity binding, expiry defaults, and revocation
  propagation.

### 4. Evidence and health

- **Question:** What proof must be immutable and how must partial, unknown, or contaminated evidence
  behave?
- **Recommendation:** Use immutable source-versioned evidence packages, execution-time freshness,
  truthful mixed/unknown projections, and sanitized replacement after quarantine.
- **Human decision:** Approved through the 2026-07-17 group approval in the parent conversation.
- **Timestamp:** 2026-07-17 (group approval; exact wall-clock time was not captured).
- **Rejected:** Unreceipted green summaries, secret-bearing evidence, mutation in place, and desired
  state presented as observed state.
- **Unresolved validation:** Registry/signing/SBOM/vulnerability, backup/restore, DNS/TLS, smoke,
  and soak adapters/policies.

### 5. Failure, rollback, and forward fix

- **Question:** What remains immutable after failure and how may production recover?
- **Recommendation:** Preserve source/tag/Release history, rollback by a new fenced attempt to a
  verified manifest, and use a new governed DevTicket/candidate/version for forward fixes.
- **Human decision:** Approved through the 2026-07-17 group approval in the parent conversation.
- **Timestamp:** 2026-07-17 (group approval; exact wall-clock time was not captured).
- **Rejected:** Tag movement/deletion, `main` reset, Released-history rewrite, and Incident-driven
  implicit Release success.
- **Unresolved validation:** Migration compatibility, restore proof, and immediate containment
  policy.

### 6. History and external mirrors

- **Question:** Which ledgers and external surfaces preserve Release history without becoming
  workflow authority?
- **Recommendation:** Keep separate Opzava command/activity and provider sync ledgers, durable
  outboxes, safe GitHub history, bounded Slack notifications, and no fictional global order.
- **Human decision:** Approved through the 2026-07-17 group approval in the parent conversation.
- **Timestamp:** 2026-07-17 (group approval; exact wall-clock time was not captured).
- **Rejected:** GitHub/Slack as primary workflow, best-effort notification, and one blended ordered
  timeline.
- **Unresolved validation:** Retention, redaction/tombstones, GitHub Release rendering, and operator
  reconciliation UI.

## Scope and invariants

The Releases Gate begins after a DevTicket reaches `Done` and ends when an immutable Release is
published and its exact artifact bundle is observed healthy in production. It never reopens or moves
the DevTicket. A Release may contain many Done DevTickets, and replacement candidates may contain
the same Done DevTickets.

The invariant is **build once, promote the same immutable artifact bundle**. Local Docker Review may
build a candidate locally to verify a locked SHA, but that local image is not a Release artifact.
The trusted build pipeline creates every Release image once. Staging and production deploy the exact
same OCI digests without rebuilding.

The workflow fails closed when authority or observations are stale, unknown, inconsistent, or
untrusted. Safety-reducing containment remains available during a stop; ordinary promotion does not.

## Authority matrix

| Concern                                                                                                                | Authoritative owner                            | External input or projection                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Desired Release lifecycle, Release Manifest, gates, approvals, attempts, supersession, cancellation, rollback decision | Opzava Dev Board / Releases                    | UI, Slack, GitHub Actions, agent, and provider messages are command requests or observations only        |
| Commit, branch, protected `main`, tag, and GitHub Release facts                                                        | GitHub                                         | Opzava commands through the GitHub App and confirms observed repository truth                            |
| Build subject, OCI digest, provenance, signature/attestation, SBOM                                                     | Trusted build system and OCI registry          | Opzava validates and pins immutable facts into the Release Manifest                                      |
| Deployment, routing, effective per-service digest, provider health                                                     | Dokploy and the target runtime                 | Opzava stores source-versioned observations and derives Release attention/current-deployment projections |
| Operational Incident lifecycle                                                                                         | Notifications/Admin-Observability Incident     | Release links attempts, rollback, evidence, and failures; it never resolves the Incident                 |
| Notifications and bounded approval requests                                                                            | Slack                                          | Delivery and user actions are relayed through authenticated, expiring Opzava commands                    |
| Workflow-exception request                                                                                             | GitHub Actions or another authorized requester | Opzava alone evaluates and records `Needs Human Approval` and its decision                               |

External callbacks, webhooks, provider responses, Slack actions, and GitHub Actions never directly
advance a Release. They append deduplicated observations or request an Opzava command, whose handler
re-reads current authority, aggregate version, lease fence, and provider facts.

## Domain model

### Release aggregate and immutable records

| Record                         | Mutability and purpose                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Release`                      | Aggregate root for desired lifecycle, lineage, version reservation, current candidate, approvals, and attempt references. Mutated only by accepted Release commands with optimistic concurrency.                                                                                                                                                           |
| `ReleaseDraft`                 | Revisioned target version, candidate source, intended composition, checks, migrations, configuration contract, and notes. A revision freezes when its RC-tag request or Trusted Build Request is committed. A failed frozen revision is never mutated: an explicit abandonment command closes it and atomically creates its successor revision/RC lineage. |
| `ReleaseCandidate`             | Immutable identity created by sealing a Draft. It binds the RC SemVer/tag, candidate SHA/tree, and Release Manifest hash. Supersession points to a replacement; it does not mutate identity.                                                                                                                                                               |
| `ReleaseManifest`              | Immutable, canonical-serialized manifest sealed after trusted-build verification. Its hash is the candidate identity input and approval boundary.                                                                                                                                                                                                          |
| `TrustedBuildRequest`          | Immutable canonical build identity bound to exact Draft revision, RC identity, source SHA/tree, full composition hash, deployment/config fingerprint, builder, and idempotency input. At most one is active for that frozen revision.                                                                                                                      |
| `ReleaseApproval`              | Immutable decision for exactly one action and environment, including identity, policy, evidence, nonce, expiry, and invalidation facts.                                                                                                                                                                                                                    |
| `DeploymentAttempt`            | Append-only attempt record with kind, environment, manifest, requested desired state, fenced lease, provider operation refs, observations, and terminal/unknown outcome.                                                                                                                                                                                   |
| `DeploymentLease`              | Environment-scoped exclusive lease with monotonically increasing fencing token. It authorizes only the bound attempt. Expiry revokes worker authority but never frees the fence or admits a replacement attempt without trusted reconciliation.                                                                                                            |
| `StagingOccupancy`             | CAS-versioned, monotonically fenced exclusive record retained by the successfully staged lineage/candidate/manifest after its attempt lease ends. Only an authorized command using trusted observations may transfer it; callbacks never can.                                                                                                              |
| `CurrentEnvironmentDeployment` | Truthful observed projection of the environment: manifest/ref if known, each service's effective digest and health, observation source/version/time, and whether state is exact, mixed, or unknown. It is not copied from desired state.                                                                                                                   |
| `LastKnownGood`                | Separate environment pointer to a previously verified immutable manifest/digest bundle plus verification evidence. Unknown or mixed current state never overwrites it.                                                                                                                                                                                     |
| `ReleaseEvidencePackage`       | Immutable, sanitized, content-addressed evidence index and receipts bound to Release, candidate, manifest, environment/attempt, policy, observations, and checks. Later evidence creates a new package; no package is amended in place.                                                                                                                    |
| `MaintenanceRecord`            | Immutable, human-authorized record for non-behavioral Release metadata only. It cannot cover source/executable behavior, migrations, dependency/security changes, or skipped DevTicket/Review.                                                                                                                                                             |
| `InitialBaselineAdoption`      | Globally unique, nonrepeatable cutover record that establishes only the observed current production source/tree/manifest and starting range for pre-cutover history. It never claims retroactive Review/Done or authorizes a deployment.                                                                                                                   |

### Lifecycle

The desired Release lifecycle is:

```text
Draft -> Candidate -> Staging -> StagingApproved -> ProductionReady -> Released
  |          |           |             |
  +----------+-----------+-------------+-> Cancelled
             +-----------+-------------+-> Superseded
ProductionReady --(only before source promotion/tag creation begins)--> Cancelled | Superseded
```

The lifecycle values are exactly:

- `Draft`
- `Candidate`
- `Staging`
- `StagingApproved`
- `ProductionReady`
- `Released`
- `Superseded`
- `Cancelled`

`Released` remains historical truth even when the live environment later degrades or rolls back.
`Superseded` points to the replacement candidate/Release lineage. `Cancelled` records a deliberate
end before completion; it does not delete reservations, attempts, approvals, or evidence. Once the
atomic domain event and outbox intent `ProtectedMainPromotionRequested` or
`StableTagCreationRequested` is committed, neither cancellation nor supersession is allowed. This
freeze begins before any external side effect and remains permanent when the provider outcome is
failed or unknown. The Release remains `ProductionReady` until exact-manifest recovery and
publication, while rollback/containment or a forward fix at a new version addresses failure.

### Derived attention set

Attention is a derived **set**, never a competing lifecycle state. It may contain zero or several of
these exact values:

- `NeedsHumanApproval`
- `AbsoluteStop`
- `HealthUnavailable`
- `DeploymentUnknown`
- `PublicationPending`
- `RollbackRequired`
- `IncidentActive`

Attention is recomputed from current authoritative records and source-versioned observations. A
cleared condition removes only its derived attention value and never rewrites lifecycle history.

### Deployment Attempt

Attempt kinds are exactly `Staging`, `Production`, `Rollback`, and `RestoreStaging`. Attempt states
are exactly `Queued`, `Deploying`, `Verifying`, `Succeeded`, `Failed`, `Unknown`, and `Cancelled`.

Only one fenced attempt may be active for the shared staging environment and only one for the
production environment. The active lease and its fencing token prevent a newer candidate, replay, or
late callback from silently overtaking an attempt. An `Unknown` attempt retains its fence and blocks
mutation admission until trusted effective-state reconciliation or confirmed provider cancellation
terminalizes it. Policy lease expiry revokes worker authority but never releases the environment
fence or admits a competing mutation by itself.

## Identity, lineage, and version reservation

Many mutable Drafts and many immutable candidates may coexist. Stable SemVer reservation is globally
unique per repository plus stable version. A Release lineage has at most one active stable
reservation; a replacement inherits or consumes that lineage instead of opening a competing
reservation. The stable version becomes permanently bound when `ProtectedMainPromotionRequested` or
`StableTagCreationRequested` is atomically committed, before the external side effect, even if that
external outcome later fails or remains unknown.

Release identities and tags are immutable:

- release candidate: `vX.Y.Z-rc.N`
- stable release: `vX.Y.Z`

An RC or stable identity/tag is never moved, deleted, or reused by the workflow. A superseded
candidate points to its replacement. Tag collision, moved tag, deleted tag, or a repository rewrite
is an inconsistency that blocks and enters reconciliation; Opzava never repairs it by silently
rewriting history.

## Release composition

A Draft binds one repository and records:

- repository identity;
- the protected `development` ref and expected observed ref version;
- base SHA/tree derived from the immediately preceding governed Released stable candidate/tree, or
  from the one-time Initial Baseline Adoption when no governed predecessor exists;
- candidate SHA/tree observed by GitHub as reachable from that expected protected `development` ref;
- verified ancestry and the full exact Git DAG delta from derived base to candidate;
- ordered commits and pull requests, including merge/squash/revert/cherry-pick relationships;
- included Done DevTickets and their exact Review/merge evidence;
- permitted Maintenance Records;
- previous released/baseline manifest and compatibility boundary.

The caller never selects a convenient late base that omits reachable changes. GitHub observations
must confirm the protected `development` ref/version, candidate reachability, derived predecessor,
and full DAG delta. A missing predecessor/baseline, non-ancestor candidate, force rewrite, missing
commit, or ref/version drift fails closed until reconciliation; it never shrinks the range.

Every source or behavioral change in the candidate range must map to one or more Done DevTickets
with accepted Review and confirmed merge evidence. A Maintenance Record is deliberately narrow: it
may explain release notes, typo-only release metadata, or equivalent non-behavioral administrative
facts, but it cannot conceal source/executable behavior, a migration, a dependency/security change,
or a skipped DevTicket/Review gate.

The composition validator handles:

| Git condition                      | Required behavior                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First governed release             | Consume the one-time `InitialBaselineAdoption`, then derive new work from its observed starting source/tree. The current investigation found no tags or GitHub Releases and found `origin/main` an ancestor approximately 320 commits behind; this is evidence to revalidate, not permanent configuration. |
| Merge commit                       | Traverse the exact DAG and associate all new reachable source changes and PR facts.                                                                                                                                                                                                                        |
| Squash merge                       | Bind the resulting candidate commit/tree to its PR and DevTicket evidence; do not assume original commit reachability.                                                                                                                                                                                     |
| Revert                             | Include the revert as governed work and preserve both the introduced and reversed history.                                                                                                                                                                                                                 |
| Cherry-pick                        | Detect patch/source relationships without pretending commit identity is shared; require governed mapping for the new commit.                                                                                                                                                                               |
| Already released commit            | Do not duplicate it as new included work merely because it is reachable. Preserve its prior manifest membership.                                                                                                                                                                                           |
| Non-ancestor candidate             | Reject tag/build/seal and fail closed; reconciliation must restore GitHub-observed ancestry from the governed predecessor/baseline, never choose a later base.                                                                                                                                             |
| Force rewrite or missing commit    | Enter an absolute GitHub trust/unverifiable stop until reconciled; never infer the lost range.                                                                                                                                                                                                             |
| `development` advances after Draft | An unfrozen Draft may create an explicit new revision. After RC-tag or build request commit, that revision never changes; abandon/supersede it immutably and create a new Draft revision, RC number, and build request.                                                                                    |

## Immutable Release Manifest and build-once contract

The trusted pipeline builds every Release service image once from the candidate source.
`SealCandidate` accepts only a complete, verified manifest whose canonical serialization pins:

- repository, candidate SHA and tree;
- trusted build identity and build-provenance subject;
- each service/image name and immutable OCI digest;
- signatures and attestations;
- SBOM digest and vulnerability-policy result;
- Compose/deployment-contract version and content hash;
- configuration schema and non-secret configuration hashes;
- named secret references and versions, never secret values;
- migration set, order, compatibility window, expand/contract phase, backup and restore
  requirements;
- required checks and their source-versioned results;
- included DevTickets, Review evidence, commits, PRs, and permitted Maintenance Records;
- manifest schema version, canonical-serialization version, creation time, and content hash.

Staging and production deploy these exact digests. They do not ask Dokploy to build from a branch or
mutable source. Local Review can prove behavior against an exact SHA and local Compose topology, but
its image is not substituted for the trusted Release artifact.

Parity remains semantic, not value-identical: local and live keep the same Compose topology, service
names, labels, readiness/health checks, route assumptions, secret **keys**, and deployment contract
while legitimate environment values, endpoints, capacity, certificates, and secret values differ.
Drift in any pinned deployment-contract input invalidates the affected approval or blocks deployment
until a new candidate is sealed.

### RC-tag request, trusted build identity, and frozen Draft revision

`TrustedBuildRequest` is the one canonical build identity for a frozen Draft revision. Its canonical
input binds Release/Draft revision, RC number, candidate SHA/tree, derived base and full composition
hash, deployment-contract/config fingerprint, required checks, builder/registry identity, and
idempotency key. Committing either `ReleaseCandidateTagCreationRequested` or `TrustedBuildRequested`
freezes that Draft revision before external work. Any later source, composition, migration,
configuration, or check-input change requires immutable abandonment or supersession plus a new Draft
revision, RC number, and Trusted Build Request.

An RC-tag request has one immutable request identity for the frozen revision. Timeout or unknown
GitHub state reconciles that same request and never opens another RC or request. A terminal request
failure does not itself prove that GitHub performed no side effect. Only trusted GitHub
reconciliation that accounts for the operation and proves the requested ref was never created may
make the revision eligible for abandonment. If the tag exists, may exist, was moved, or GitHub is
unverifiable, the request and revision remain frozen for reconciliation; no successor RC may be
reserved.

At most one build request may be active for the frozen revision. Exact idempotent replay returns the
same request; reuse with different canonical input is rejected. Timeout or unknown builder/registry
state reconciles the same request and never queues a parallel rebuild. A trusted terminal failure
with confirmed absence of published artifacts does not unfreeze or implicitly replace anything.
`AbandonFailedFrozenDraftRevision` must atomically record every applicable terminal request
disposition, abandon the exact frozen revision, reserve a new unique RC identity, and create a
successor Draft revision under the same stable-version lineage before another tag or build may be
requested. It accepts either the reconciled terminal no-tag-created case before a build exists, or
the trusted terminal failed/no-artifact build case after RC confirmation. If tag creation or
artifact publication is partial or unknown, that command rejects: quarantine and reconcile the same
request until every external effect is accounted for; do not open a parallel request or reuse its
revision or RC. Only trusted observations bound to the request may satisfy `SealCandidate`.

## Command protocol

Every Release mutation crosses an application command handler. Dragging, clicking, Slack, an agent,
an Action, a worker, or a provider callback cannot skip this envelope.

Release commands inherit #230's **Secret-Safe Ingress** ordering. After transport authentication,
the server first performs non-persisting tenant admission and target/command-family authorization.
An unauthorized caller receives 403 before content scanning and cannot probe the scanner or persist
a Release rejection record. For an admitted target/family, every content-bearing field—including
Draft and Maintenance notes, approval/denial/exception reasons, evidence text, publication notes,
comments, and worklogs—passes Secret-Safe Ingress before receipt reservation, replay lookup,
aggregate/audit persistence, outbox creation, provider payload, or raw-body logging. Suspected
secret content stores only the #230-authorized safe hash/ref and non-sensitive detection metadata,
opens the Absolute Stop, and queues a safe notification; it never persists the raw command or
ordinary rejection audit. Only safe admitted content reaches the command envelope below.

### Required command envelope

Every command carries and validates:

- command ID, command kind, idempotency key, correlation ID, and causation ID;
- authenticated actor identity, current role/authority version, source surface, and acting
  worker/service identity when delegated;
- Release ID, repository identity, candidate/manifest refs when applicable;
- expected Release aggregate version/CAS;
- target environment and expected environment-observation version when applicable;
- expected Deployment Lease ID and fencing token for attempt mutations;
- expected policy version and the exact evidence/approval refs used for the decision;
- for observed-fact commands, the source actor/service identity, provider operation or delivery
  receipt, source-observed time, evaluation time, and bound evidence ref;
- request time and expiry/nonce for a human approval action.

An accepted idempotency key returns the prior command result only when its canonical command input
matches. Reuse with different input is rejected. Aggregate CAS failure, stale observation, stale
policy, a missing/revoked role, wrong fence, expired nonce, changed manifest, changed evidence, or
supersession rejects before side effects. The handler appends the accepted domain event and outbox
intent atomically; workers re-authorize before performing external work.

Callbacks only request an observed-fact command. They never append a confirming event or advance
lifecycle without authorized reconciliation of the bound receipt, time, actor, and evidence.

### Command and transition catalog

The `Actor / authorization` column defines who may request the command. It does not remove the
required server-side authorization, CAS, idempotency, policy, evidence, and fence checks above.

| Command                                | Actor / authorization                                                        | Preconditions and external confirmation                                                                                                                                                                                                                                                                                                                             | Accepted event / lifecycle result                                                                                                                                                                                                                                                                     | Representative rejection reasons                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateReleaseDraft`                   | Release Manager or authorized Admin                                          | Unique repository+stable-version reservation; base derived from governed predecessor/baseline; candidate observed reachable from expected protected `development`; no competing lineage                                                                                                                                                                             | `ReleaseDraftCreated`; lifecycle `Draft`                                                                                                                                                                                                                                                              | reservation conflict, caller-selected base, non-ancestor/ref drift, invalid SemVer, unauthorized                                                                                                                                                                                                          |
| `ReviseReleaseDraft`                   | Release Manager or authorized Admin/assistant under bounded delegation       | `Draft`; expected aggregate version; revision not frozen by RC-tag/build request; no seal or promotion started                                                                                                                                                                                                                                                      | `ReleaseDraftRevised`; remains `Draft`                                                                                                                                                                                                                                                                | frozen revision, sealed, stale CAS, changed role/policy, invalid composition                                                                                                                                                                                                                              |
| `AdoptInitialBaseline`                 | Human Release Manager with one-time baseline authority                       | No prior baseline adoption; independently observed current production source/tree/manifest; no deployment requested                                                                                                                                                                                                                                                 | `InitialBaselineAdopted`; establishes only starting range                                                                                                                                                                                                                                             | already adopted, untrusted/unknown production, attempts to assert Review/Done or deploy                                                                                                                                                                                                                   |
| `QueueTrustedBuild`                    | Release Manager, authorized automation, or build coordinator                 | Exact current Draft revision/source/tree/composition/config fingerprint; matching `ReleaseCandidateTagConfirmed`; one RC/build identity; no active different request; no absolute stop                                                                                                                                                                              | Atomically commits immutable `TrustedBuildRequested` plus outbox and freezes the Draft revision if not already frozen; remains `Draft`                                                                                                                                                                | different idempotency input, active/unknown request, unconfirmed/mismatched RC, GitHub unhealthy, secret suspicion, incomplete composition                                                                                                                                                                |
| `RecordBuildObservation`               | Trusted build/registry adapter worker                                        | Matching Trusted Build Request, builder/registry identity and receipt; delivery dedupe; bound source subject, observed/evaluated times, and evidence                                                                                                                                                                                                                | Appends immutable `TrustedBuildObservationRecorded`; no lifecycle or seal transition                                                                                                                                                                                                                  | unknown/mismatched request, untrusted issuer, subject mismatch, mutable/missing digest, stale delivery                                                                                                                                                                                                    |
| `ReconcileTrustedBuildRequest`         | Authorized build/registry reconciliation worker                              | Same requested builder/registry operation; matching request identity; trusted artifact inventory and source-versioned receipts                                                                                                                                                                                                                                      | Appends observed Running/Failed/Unknown/Confirmed facts for the same request; never queues a rebuild                                                                                                                                                                                                  | parallel/different request, incomplete or untrusted inventory, subject/config mismatch                                                                                                                                                                                                                    |
| `AbandonFailedFrozenDraftRevision`     | Human Release Manager/Admin                                                  | Current frozen Draft revision; either RC-tag request is terminal `Failed`, trusted GitHub reconciliation proves the requested ref was never created, and no build exists, or its Trusted Build Request is terminal `Failed` with trusted proof no artifact was published; all applicable observations complete; no seal/deploy/promotion; successor input/RC unique | Atomically appends the applicable `ReleaseCandidateTagRequestAbandoned` and/or `TrustedBuildRequestAbandoned`, appends `ReleaseDraftRevisionAbandoned`, then creates the next Draft revision and reserves its new RC under the same stable-version lineage; old revision/requests/RC remain immutable | RC-failure branch: request Running/Unknown/Confirmed, tag exists/may exist, or any build exists; build-failure branch: build Running/Unknown/Confirmed or partial/unknown artifacts. Both: incomplete observation, reused RC, competing successor, seal/deploy/promotion started, stale aggregate version |
| `CreateReleaseCandidateTag`            | Authorized GitHub promotion worker                                           | Exact Draft revision/RC/source; GitHub-observed candidate reachable from expected protected `development`; unique tag; no absolute stop                                                                                                                                                                                                                             | Atomically commits `ReleaseCandidateTagCreationRequested` plus outbox and freezes the Draft revision; remains `Draft`                                                                                                                                                                                 | tag collision/move/reuse, non-ancestor/ref drift, different frozen input, secret suspicion, GitHub unavailable                                                                                                                                                                                            |
| `RecordReleaseCandidateTagObservation` | Trusted GitHub adapter/reconciliation worker                                 | Matching committed RC-tag request; exact ref/target/tree; delivery or operation receipt, observed/evaluated times and evidence                                                                                                                                                                                                                                      | Appends immutable native RC-tag fact; never confirms identity or advances lifecycle                                                                                                                                                                                                                   | missing/mismatched request or receipt, wrong ref/target/tree, stale or untrusted fact, GitHub unavailable                                                                                                                                                                                                 |
| `ReconcileReleaseCandidateTagRequest`  | Authorized GitHub reconciliation worker                                      | Same committed RC-tag operation; matching request identity; trusted operation/ref inventory, receipt, observed/evaluated times, and GitHub health                                                                                                                                                                                                                   | Appends immutable request state `Pending`, `Unknown`, or terminal `Failed`; a matching created tag routes through observation/confirmation and never becomes `Failed`                                                                                                                                 | different request, incomplete/untrusted inventory, tag exists or may exist, ref/target mismatch, GitHub unverifiable                                                                                                                                                                                      |
| `ConfirmReleaseCandidateTag`           | Authorized deterministic Release reconciler                                  | Matching request and recorded fact; exact immutable RC ref/target/tree, receipt, times and evidence; candidate reachable from expected protected `development`; GitHub healthy                                                                                                                                                                                      | `ReleaseCandidateTagConfirmed`; remains `Draft`; enables sealing                                                                                                                                                                                                                                      | callback/manual-tag-only request, stale/mismatched/untrusted fact, moved/reused tag, source/ref drift, absolute stop                                                                                                                                                                                      |
| `SealCandidate`                        | Release Manager or authorized deterministic coordinator                      | `ReleaseCandidateTagConfirmed`; exact Trusted Build Request confirmed; manifest facts, full DAG composition, GitHub/registry/build health and checks verified; no absolute stop                                                                                                                                                                                     | `ReleaseCandidateSealed`; lifecycle `Candidate`; immutable RC and manifest                                                                                                                                                                                                                            | absolute stop, unconfirmed/source/tag/build drift, unknown build, missing signature/SBOM/provenance, composition or manifest-hash gap                                                                                                                                                                     |
| `RequestStagingDeployment`             | Release Manager or authorized automation after deterministic preflight       | `Candidate`; valid staging preflight; exact manifest; no incompatible Staging Occupancy; acquire staging lease/fence; no active attempt                                                                                                                                                                                                                             | `DeploymentAttemptQueued(kind=Staging)`                                                                                                                                                                                                                                                               | stale preflight, occupancy conflict, busy/unknown environment, absolute stop, migration incompatibility                                                                                                                                                                                                   |
| `RecordDeploymentObservation`          | Dokploy/runtime adapter worker                                               | Trusted provider operation and environment identity; matching attempt/fence; deduplicated observation                                                                                                                                                                                                                                                               | Attempt advances `Queued -> Deploying -> Verifying` or becomes `Failed`/`Unknown`; lifecycle does not advance from callback alone                                                                                                                                                                     | wrong fence/attempt, stale/out-of-order fact, untrusted environment, incomplete per-service state                                                                                                                                                                                                         |
| `AcceptStagingDeployment`              | Authorized deterministic verifier under Release policy                       | Staging attempt `Verifying`; exact effective digest/check evidence; matching attempt fence; Staging Occupancy CAS unowned or pre-transferred to this candidate                                                                                                                                                                                                      | Attempt `Succeeded`; lifecycle `Staging`; installs/retains fenced Staging Occupancy for lineage/candidate/manifest                                                                                                                                                                                    | occupancy/fence conflict, digest/health mismatch, stale evidence, unknown/mixed state, absolute stop, untrusted verifier                                                                                                                                                                                  |
| `TransferStagingOccupancy`             | Authorized Release coordinator                                               | Next candidate sealed; occupancy CAS/fence current; no active/Unknown attempt; prior occupant Released with current staging observed, Cancelled/Superseded plus accepted Restore/non-current proof, or irreversibly bound ProductionReady plus an authorized linked forward-fix and exact current staging observation                                               | `StagingOccupancyTransferred` atomically moves the reservation to the next lineage/candidate with a higher fence; no environment or Release transition                                                                                                                                                | callback request, stale CAS/fence, active/Unknown attempt, missing forward-fix link/decision, prior lifecycle/evidence condition missing, provider state unknown                                                                                                                                          |
| `GrantStagingApproval`                 | **Human** Release Manager/Admin                                              | Lifecycle `Staging`; exact manifest/environment/evidence; approval nonce/expiry/policy current                                                                                                                                                                                                                                                                      | `ReleaseApprovalGranted(action=StagingApproval)`; lifecycle `StagingApproved`                                                                                                                                                                                                                         | missing role, replay/expiry, stale evidence, changed manifest, superseded candidate, exception approval substituted                                                                                                                                                                                       |
| `GrantProductionApproval`              | **Human** Release Manager/Admin                                              | Lifecycle `StagingApproved`; distinct production preflight/evidence; production rollback readiness; exact expected protected-main base                                                                                                                                                                                                                              | `ReleaseApprovalGranted(action=ProductionApproval)`; lifecycle `ProductionReady`                                                                                                                                                                                                                      | reused staging approval, stale base/evidence, no rollback readiness, role revoked, absolute stop                                                                                                                                                                                                          |
| `RequestPolicyException`               | Authorized Action, agent, assistant, or human                                | Exception class is approvable; exact action/manifest/evidence/policy bound                                                                                                                                                                                                                                                                                          | `PolicyExceptionRequested`; derives `NeedsHumanApproval`; no lifecycle advance                                                                                                                                                                                                                        | secret/GitHub absolute stop, hard technical prerequisite, vague/wildcard request                                                                                                                                                                                                                          |
| `DecidePolicyException`                | Human Admin with required role                                               | Current exact request; one-time nonce; bounded action/reason/expiry                                                                                                                                                                                                                                                                                                 | `PolicyExceptionApproved` or `PolicyExceptionRejected`; attention recomputed                                                                                                                                                                                                                          | stale/replayed/revoked role, material change, forbidden absolute stop                                                                                                                                                                                                                                     |
| `PromoteProtectedMain`                 | Authorized GitHub promotion worker after production approval                 | `ProductionReady`; approval current; expected protected-main base rechecked; candidate reachable; GitHub healthy; no absolute stop                                                                                                                                                                                                                                  | Atomically commits `ProtectedMainPromotionRequested` plus outbox; freezes Cancel/Supersede and version reuse before side effect                                                                                                                                                                       | absolute stop, base drift, non-ancestor, branch protection mismatch, stale approval, GitHub unavailable                                                                                                                                                                                                   |
| `ConfirmProtectedMainPromotion`        | Authorized GitHub projection/reconciliation worker                           | Matching request; GitHub-observed protected-main ref, commit, and tree; bound actor/service, receipt, observed/evaluated times, and evidence; candidate-tree equality for a policy merge                                                                                                                                                                            | `ProtectedMainPromotionConfirmed` records exact main commit/tree and `mainPromotionCommitSha`; enables stable-tag request                                                                                                                                                                             | missing/mismatched request or receipt, stale/untrusted fact, wrong ref/commit, tree mismatch, GitHub unavailable                                                                                                                                                                                          |
| `CreateStableTag`                      | Authorized GitHub promotion worker                                           | `ProtectedMainPromotionConfirmed`; unique stable version; expected promotion commit; GitHub healthy; no absolute stop                                                                                                                                                                                                                                               | Atomically commits `StableTagCreationRequested` plus outbox; freeze remains permanent before side effect                                                                                                                                                                                              | absolute stop, tag collision/move/reuse, wrong commit, stale main fact, GitHub unavailable                                                                                                                                                                                                                |
| `ConfirmStableTag`                     | Authorized GitHub projection/reconciliation worker                           | Matching request; observed immutable tag/target; bound actor/service, receipt, observed/evaluated times, and evidence; candidate-tree equality where merge used                                                                                                                                                                                                     | `StableTagConfirmed`; remains `ProductionReady`                                                                                                                                                                                                                                                       | missing/mismatched request or receipt, moved/reused/deleted tag, wrong target/tree, stale/untrusted fact                                                                                                                                                                                                  |
| `RequestProductionDeployment`          | Release Manager or authorized coordinator                                    | `ProductionReady`; distinct approval current; main/tag confirmed; exact manifest; acquire production fence; current environment known enough for safe mutation                                                                                                                                                                                                      | `DeploymentAttemptQueued(kind=Production)`                                                                                                                                                                                                                                                            | stale approval, busy/unknown environment, main/tag inconsistency, hard prerequisite/absolute stop                                                                                                                                                                                                         |
| `AcceptProductionDeployment`           | Authorized deterministic verifier under Release policy                       | Production attempt `Verifying`; exact per-service digests, health, smoke and stabilization pass; provider facts reconciled                                                                                                                                                                                                                                          | Attempt `Succeeded`; `ProductionDeploymentAccepted`; current deployment and LKG updated                                                                                                                                                                                                               | API 2xx alone, mixed/unknown state, failed stabilization, stale fence/evidence                                                                                                                                                                                                                            |
| `PublishGitHubRelease`                 | Authorized GitHub publication worker                                         | Production accepted; immutable stable tag confirmed; one canonical publication identity; safe notes/manifest/evidence refs; no absolute stop                                                                                                                                                                                                                        | Atomically commits `GitHubReleasePublicationRequested` plus outbox; remains `ProductionReady`                                                                                                                                                                                                         | absolute stop, different request input, untrusted/unavailable GitHub, wrong tag, unsanitized content                                                                                                                                                                                                      |
| `RecordGitHubReleaseObservation`       | Trusted GitHub adapter/reconciliation worker                                 | Matching publication request; exact tag/release/manifest refs; delivery/operation receipt, observed/evaluated times and evidence                                                                                                                                                                                                                                    | Appends immutable native GitHub Release fact; never advances lifecycle                                                                                                                                                                                                                                | missing/mismatched request or receipt, wrong tag/manifest, stale/untrusted fact                                                                                                                                                                                                                           |
| `ConfirmGitHubReleasePublished`        | Authorized deterministic Release reconciler                                  | Matching request and recorded GitHub fact; exact immutable tag, native Release identity, manifest, receipt, times and evidence; GitHub healthy                                                                                                                                                                                                                      | `GitHubReleasePublished`; lifecycle `Released`                                                                                                                                                                                                                                                        | callback-only request, stale/mismatched/untrusted fact, absolute stop, wrong tag/release/manifest                                                                                                                                                                                                         |
| `SupersedeCandidate`                   | Human Release Manager/Admin                                                  | Before `ProtectedMainPromotionRequested` or `StableTagCreationRequested` is committed; replacement uses the lineage reservation; restoration/non-current staging proof satisfied                                                                                                                                                                                    | `ReleaseSuperseded`; lifecycle `Superseded`; link replacement                                                                                                                                                                                                                                         | irreversible request committed, competing version, active attempt not contained, staging left apparently on old target                                                                                                                                                                                    |
| `CancelRelease`                        | Human Release Manager/Admin                                                  | Before `ProtectedMainPromotionRequested` or `StableTagCreationRequested` is committed; active attempts safely cancelled/reconciled; restoration/non-current staging proof satisfied                                                                                                                                                                                 | `ReleaseCancelled`; lifecycle `Cancelled`                                                                                                                                                                                                                                                             | irreversible request committed, provider state unknown, active production mutation, abandoned apparent staging target                                                                                                                                                                                     |
| `CancelDeploymentAttempt`              | Human Release Manager/Admin or policy-authorized safety coordinator          | Attempt is `Queued`, trusted observation proves provider deployment has not begun, matching environment fence, and no abandoned staged target                                                                                                                                                                                                                       | `DeploymentAttemptCancelled`; attempt `Cancelled`; Release lifecycle changes only through a separate command                                                                                                                                                                                          | deploying/verifying cancellation unsupported, wrong fence, provider mutation already effective/unknown, staging restore required                                                                                                                                                                          |
| `RequestRollback`                      | Human Production Approver, or authorized immediate safety-containment policy | Previously verified immutable manifest; compatibility/restore proof; current facts reconciled enough to act; acquire environment fence                                                                                                                                                                                                                              | `DeploymentAttemptQueued(kind=Rollback)`; Release lifecycle history unchanged                                                                                                                                                                                                                         | unknown target, missing artifact, incompatible migration, no restore proof, stale authorization                                                                                                                                                                                                           |
| `AcceptRollback`                       | Authorized deterministic verifier; human decision remains bound to request   | Exact rollback digests/health/smoke observed                                                                                                                                                                                                                                                                                                                        | Attempt `Succeeded`; current pointer changes; `RollbackCompleted`; affected Release derives appropriate attention                                                                                                                                                                                     | mixed/unknown state, verification failure, wrong digest/fence                                                                                                                                                                                                                                             |
| `RestoreStaging`                       | Human Release Manager/Admin or policy-authorized containment coordinator     | Prior known-good staging manifest or explicit observed non-current target; acquire staging fence                                                                                                                                                                                                                                                                    | `DeploymentAttemptQueued(kind=RestoreStaging)`                                                                                                                                                                                                                                                        | no trustworthy target, active Unknown attempt, occupancy/fence conflict, compatibility failure                                                                                                                                                                                                            |
| `AcceptStagingRestore`                 | Authorized deterministic verifier under Release policy                       | Restore attempt `Verifying`; exact target/non-current observation, compatibility and health evidence; matching attempt and occupancy fences                                                                                                                                                                                                                         | Attempt `Succeeded`; current staging pointer and Staging Occupancy update through CAS/fence                                                                                                                                                                                                           | wrong target/fence, stale or mixed/unknown state, failed compatibility/health verification                                                                                                                                                                                                                |
| `ReconcileDeploymentAttempt`           | Authorized reconciliation worker                                             | Attempt `Unknown`; trusted effective-state/provider-cancellation proof; matching attempt identity and fence                                                                                                                                                                                                                                                         | Appends reconciliation; may return to `Verifying` or terminalize `Failed`/`Cancelled`; never accepts success or lifecycle                                                                                                                                                                             | elapsed time only, provider still unavailable, identity/fence mismatch, incomplete per-service facts                                                                                                                                                                                                      |

## Approval contract

Staging verification, Staging Approval, and Production Approval are separate gates. The staging
deployment request and deterministic acceptance of exact observed staging evidence may be automated
after preflight. `GrantStagingApproval` and `GrantProductionApproval` are distinct explicit human
decisions. A `Needs Human Approval` exception never substitutes for either approval.

Every `ReleaseApproval` binds:

- decision ID, one-time nonce, decision and expiry timestamps;
- human actor identity and current required role;
- Release, candidate, manifest hash, stable version, action, and target environment;
- exact evidence-package hash and named observations/checks;
- policy ID/version and explicit reason;
- source surface and authenticated session/Slack identity mapping;
- aggregate version and expected current lifecycle.

An approval becomes unusable after expiry, nonce replay, role revocation, candidate supersession,
manifest/evidence/environment change, policy change, protected-main-base drift, or any other
material input change. The immutable historical record remains; a new decision is required.

## Exact promotion saga

1. **Draft and reserve.** `CreateReleaseDraft` reserves the stable version/lineage, derives base
   from the preceding governed Released candidate/tree or one-time baseline, and records the
   GitHub-observed protected `development` ref/version, reachable candidate, full DAG delta, work,
   migrations, and deployment contract.
2. **Request, observe, and confirm immutable RC source identity.** Atomically commit
   `ReleaseCandidateTagCreationRequested` and its outbox, freezing the exact Draft revision before
   GitHub work. `RecordReleaseCandidateTagObservation` appends only the matching native tag fact
   with exact ref/target/tree, receipt, times, and evidence. An authorized deterministic
   `ConfirmReleaseCandidateTag` reconciles that fact, expected protected-`development` reachability,
   and GitHub health into `ReleaseCandidateTagConfirmed`; callbacks or manually created matching
   tags never confirm themselves. Timeout/unknown reconciles the same request. A terminal failed
   request can continue only after trusted reconciliation proves the tag was never created, through
   `AbandonFailedFrozenDraftRevision`, which atomically opens a successor revision and new RC.
3. **Build once.** Atomically commit the one canonical `TrustedBuildRequested`, also freezing the
   exact Draft revision. The trusted pipeline builds from its bound source/tree/composition/config
   fingerprint and publishes immutable digests, provenance, signatures/attestations, SBOMs, and
   check facts. Timeout/unknown reconciles that request; it never starts a parallel build. A
   terminal Failed request can continue only through `AbandonFailedFrozenDraftRevision`, after
   trusted no-artifact confirmation, which closes the old request/revision and atomically opens a
   successor revision with a new RC reservation.
4. **Seal.** `SealCandidate` verifies the source tag, composition, build facts, policies, and
   canonical manifest hash. It produces immutable `ReleaseCandidate`, `ReleaseManifest`, and initial
   `ReleaseEvidencePackage` records; lifecycle becomes `Candidate`.
5. **Preflight staging.** Revalidate GitHub, registry, Dokploy staging identity/current state,
   Compose/config, migrations/backup/restore, required Review/check facts, and environment capacity.
6. **Deploy staging.** Acquire the shared staging lease and queue `Staging`. Provider request
   success is only an operation receipt. Poll/reconcile per-service effective digests, routing,
   health, migrations, smoke, E2E, and soak. Unknown holds the lease.
7. **Verify and occupy staging.** The authorized deterministic verifier accepts only exact manifest
   digest equality and current evidence. The attempt becomes `Succeeded`, lifecycle becomes
   `Staging`, and a CAS-versioned/fenced Staging Occupancy remains with the
   lineage/candidate/manifest after the attempt lease ends.
8. **Approve staging.** A separate explicit human `GrantStagingApproval` produces lifecycle
   `StagingApproved`.
9. **Approve production.** Revalidate production preflight, exact expected protected-main base,
   rollback readiness, compatibility, and evidence. A distinct human `GrantProductionApproval`
   produces `ProductionReady`.
10. **Request and confirm source promotion.** Atomically commit `ProtectedMainPromotionRequested`
    and its outbox before the GitHub side effect; that commit permanently freezes cancellation,
    supersession, and version reuse even if GitHub later reports failure or remains unknown. Prefer
    an exact fast-forward of protected `main` to the candidate SHA. If branch policy requires a
    promotion merge, do not treat the request/callback as success. An authorized reconciliation
    command binds actor/service, provider receipt, observed/evaluated times, and evidence; it
    records `ProtectedMainPromotionConfirmed`, exact protected-main ref, `mainPromotionCommitSha`,
    and GitHub-observed **tree equality** with the candidate tree. The merge commit is never claimed
    as the build-provenance subject.
11. **Request and confirm stable tag.** Only after `ProtectedMainPromotionConfirmed`, atomically
    commit `StableTagCreationRequested` and its outbox, then independently reconcile the observed
    immutable `vX.Y.Z` target into `StableTagConfirmed`. The Release Manifest and build provenance
    remain bound to the candidate SHA/tree. A callback alone never confirms the tag.
12. **Deploy production.** Acquire the production lease and deploy the same manifest digest bundle,
    without rebuild. Observe exact per-service digests, routing, health, production smoke, and the
    stabilization window; update `CurrentEnvironmentDeployment` truthfully and advance
    `LastKnownGood` only after verified success.
13. **Request, observe, and confirm publication.** `PublishGitHubRelease` atomically commits one
    canonical `GitHubReleasePublicationRequested` plus outbox. A matching
    `RecordGitHubReleaseObservation` appends the native fact without advancing lifecycle. Only
    `ConfirmGitHubReleasePublished`, authorized and bound to the exact tag, native Release,
    manifest, receipt, observed/evaluated times, and evidence, produces `Released`.

If production is live but GitHub publication is pending, lifecycle remains `ProductionReady`,
`PublicationPending` is present, and `CurrentEnvironmentDeployment` truthfully shows the live
manifest. Retry/reconcile the same publication request only; never open a different request or
redeploy merely to repair publication.

## Supersession, cancellation, and shared staging

A successful staging attempt ends its Deployment Lease but retains exclusive `StagingOccupancy` for
that lineage/candidate/manifest. A newer candidate cannot stage until an authorized
`TransferStagingOccupancy` succeeds with occupancy CAS and a higher fence. Transfer requires one of:

1. the prior occupant is `Released`, the next candidate is sealed, and a current trusted staging
   observation makes the reservation transfer safe; or
2. the prior occupant is `Cancelled` or `Superseded` and a deterministic verifier has accepted
   `RestoreStaging`, or trusted observation proves staging is no longer on that candidate; or
3. the prior occupant is irreversibly bound in `ProductionReady`, every staging attempt is terminal
   and known, the next sealed candidate/version is explicitly authorized and linked as its forward
   fix, and current trusted observation proves the exact staging state before the atomic
   higher-fence reservation transfer. The prior Release remains unchanged and auditable.

Attempt lease expiry, lifecycle change, provider callback, or elapsed time never releases or
transfers Staging Occupancy. A late callback is deduplicated and rejected by the occupancy/attempt
fences; it remains an observed fact for reconciliation.

## Failure, partial, and unknown behavior

### Main/tag and publication failure

After `ProtectedMainPromotionRequested` or `StableTagCreationRequested` is atomically committed, a
failed or unknown external outcome keeps lifecycle `ProductionReady` and permanently consumes the
version. The only continuations are:

- retry the same idempotent operation or deploy the exact sealed manifest after reconciliation; or
- create a forward-fix DevTicket, pass Ready/Review/Done, and cut a new candidate and stable
  version.

The workflow never rewinds `main`, moves/deletes the stable tag, or reuses the SemVer.
Protected-main drift, tree mismatch, tag collision, missing commit, or unknown GitHub facts block
further mutation and require reconciliation.

An unknown GitHub Release publication retries and reconciles the same
`GitHubReleasePublicationRequested` identity. It never creates a competing publication request and
never redeploys production. Only `ConfirmGitHubReleasePublished` may produce `Released`.

### Provider partial and unknown results

Outbox delivery, provider requests, callbacks, polling, and reconciliation use stable idempotency
keys and attempt/fence refs. Duplicate or out-of-order callbacks append no duplicate transition. A
timeout or ambiguous provider response makes the attempt `Unknown`, retains the environment lease,
and blocks retry/new mutation until trusted observation determines effective state.

Policy lease expiry revokes the worker's authority but never automatically releases the environment
fence, terminalizes the attempt, or admits a new mutation. Scheduled backoff reconciliation,
operator alerting, and Incident/escalation continue while state is Unknown. Elapsed time alone
cannot resolve it. Only trusted observed effective state or confirmed provider cancellation may
permit a terminal outcome and issuance of a new fence. This deliberate fail-closed liveness loss is
not an automatic fallback or failover path.

Any deployment attempt that becomes `Failed` must create or link an appropriate Incident. An
`Unknown` attempt that exceeds its policy threshold must also create or link one while
reconciliation continues; the Incident is escalation, not authority to free the fence. Any rollback
failure must create or link an Incident, and a failed production rollback must create or update a
critical Incident.

`CurrentEnvironmentDeployment` reports every service separately. If some services run target digests
while others run previous or unknown digests, the projection is mixed; it never collapses to
success. `LastKnownGood` remains unchanged. A provider API `2xx`, a completed build log, or an
accepted queue operation is never deployment success by itself.

### Absolute stops and hard prerequisites

The two absolute stops are:

1. suspected secret exposure; and
2. unhealthy or unverifiable GitHub integration.

Either rejects RC-tag request/creation and every ordinary build, seal, stage/production approval,
protected-main promotion, stable-tag request/creation, deployment, publication, and Release
completion operation. No human, Slack action, GitHub Action, label, comment, model, or generic
policy exception may bypass it.

Safety-reducing actions remain allowed under explicit containment authorization: abort/quarantine,
revoke, rotate credentials, redact, reconcile, and roll back to a known-good immutable artifact.
During suspected secret exposure, ordinary logs, bundles, exports, evidence regeneration, and
notifications must not copy suspect values. Only sanitized containment metadata and a non-sensitive
tombstone may be recorded until rotation/redaction completes.

Some failures are hard technical prerequisites rather than policy exceptions: missing or untrusted
digests/signatures/provenance, an unavailable or unidentifiable target environment, an impossible
rollback/restore, incompatible migrations, missing backup proof, and unknown effective provider
state. They cannot be converted into `NeedsHumanApproval`.

## Preflight, evidence, and freshness

Every externally observed fact records source type, source identity, source
version/operation/delivery ref, observed value/hash, `observedAt`, `evaluatedAt`, and `validUntil`.
`observedAt` cannot be after `evaluatedAt` beyond the permitted clock-skew policy. Execution
revalidates every expiring fact; a fresh UI read does not extend evidence validity.

The immutable Release Evidence Package indexes sanitized receipts for:

| Area                | Required observations                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub              | App installation identity; repository access; required permissions; protected-branch and expected-main facts; immutable RC/stable tag facts; webhook freshness; outbox and reconciliation health; rate-limit state; PR/commit/check/Review/merge mappings |
| Build and registry  | Trusted builder identity; candidate subject; immutable per-service OCI digests; registry availability; signatures/attestations; provenance; SBOM; vulnerability-policy result; artifact retention/access                                                  |
| Dokploy and routing | API authentication; exact environment/project/compose identity; capacity; deployment operation; observed effective per-service digests; Traefik routes; TLS; DNS; health/readiness; current and desired state; drift                                      |
| Deployment contract | Compose version/hash; service names; labels; networks; health checks; configuration schema and non-secret hashes; named secret refs/versions only                                                                                                         |
| Work and Review     | Included Done DevTickets; exact approved contract and reviewed SHA/tree; PR/commit/check/repository-review/merge facts; required policy checks                                                                                                            |
| Data compatibility  | Migration set/order; expand-contract phase; backward/forward compatibility window; backup receipt; restore rehearsal/proof; irreversible-step policy                                                                                                      |
| Staging             | Exact digest equality; migrations; user-level E2E; smoke; soak; route/TLS behavior; evidence validity                                                                                                                                                     |
| Production          | Preflight; exact digest equality; migrations; smoke; stabilization; routing/health; rollback target and compatibility/readiness                                                                                                                           |

Evidence contains only named secret references, versions, resolution health, and safe hashes. It
never contains secret values, credentials, provider tokens, environment-file contents, raw suspect
logs, or unsanitized customer/runtime payloads.

### Contaminated immutable evidence

An immutable evidence blob is never edited or overwritten. On suspected contamination, Opzava
immediately quarantines the blob, revokes access and outward references, invalidates every approval
bound to its hash, and records only a sanitized attributable tombstone and safe hash. It rotates or
revokes the exposed secret/credential, then creates a new sanitized immutable Evidence Package/hash
that links the quarantined predecessor without copying its raw payload. Raw contaminated content is
never replicated to Slack, GitHub, notification, export, regenerated bundle, or ordinary logs.
Retention defaults may be chosen during implementation, but this containment/replacement protocol
may not be deferred or weakened.

## Rollback and forward fix

Rollback is a new `DeploymentAttempt(kind=Rollback)` targeting a previously verified immutable
Release Manifest and exact digest bundle. It changes only the target environment pointer and
observed runtime state. It never changes `main`, an RC/stable tag, GitHub Release, old Release
lifecycle, manifest, or evidence.

Production rollback normally requires a distinct human production authorization bound to the target,
current state, compatibility/restore proof, evidence, and fence. A narrowly configured immediate
safety-reducing containment policy may request/execute rollback without waiting for an ordinary
approval only where policy explicitly authorizes that action and target; it remains audited, fenced,
and verified.

Rollback is rejected if the artifact is unavailable/untrusted, compatibility is unproved, a data
restore is required but unavailable/unverified, or provider state is too unknown to mutate safely.
Any rollback failure creates or links an Incident; a failed production rollback creates or updates a
critical Incident. A rollback that remains Unknown beyond its policy threshold also creates or links
the appropriate Incident while retaining its fence. `RollbackRequired`/`IncidentActive` derive as
applicable.

A forward fix is never an edit to a sealed Release. It is a new Bug or Technical Task DevTicket
through Ready, implementation, independent Review, and Done, followed by a new candidate and stable
version.

Later production degradation or rollback never rewrites a prior `Released` fact. The current
deployment/health projections and authoritative Incident tell the current operational truth.

## Release and Incident boundary

Release owns deployment and rollback **commands**, attempts, artifact intent, and Release evidence.
Notifications/Admin-Observability owns the authoritative Incident lifecycle
`Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem`.

- A deployment `Failed`, a deployment `Unknown` beyond its policy threshold, or any rollback failure
  must create or link an appropriate Incident through the Incident command boundary.
- A failed production rollback must create or update a critical Incident.
- Incident identity and lifecycle are linked from Release attempts/evidence; they are not copied
  into the Release lifecycle.
- Resolving an Incident does not mutate Release history or mark a deployment successful.
- A Release transition, successful rollback, or healthy observation does not resolve an Incident;
  the Incident owner evaluates its own resolution criteria.
- Permanent repair remains a separately linked DevTicket with independent Ready/Review/Done gates.

## Activity, synchronization, and external history

There is no global order across Opzava, GitHub, the build system/registry, Dokploy, Slack, and
runners. Each authoritative stream preserves its own ordering and cross-links stable refs.

### Dev Board activity/history

Record accepted Release commands, human approvals/denials, lifecycle transitions,
supersession/cancellation, production authorization, and rollback decisions in immutable Dev Board
activity/history. After target/family admission and Secret-Safe Ingress, also append sanitized
immutable records for rejected commands, in-transaction reauthorization failures, absolute-stop
bypass attempts, and containment denials. Pre-admission unauthorized callers and suspected-secret
content follow #230's non-persisting admission/Secret-Safe Ingress path instead of creating a
Release receipt or rejection record. Safe post-ingress rejection records preserve actor/source,
target, command/idempotency/correlation refs, policy/stop class, time, and safe reason without
copying secrets or contaminated payloads.

### Synchronization/outbox/conflict ledger

Record GitHub, build, registry, and Dokploy requests/attempts, delivery dedupe, provider receipts,
polling, reconciliation, conflicts, and unknown outcomes in the synchronization/outbox/conflict
ledger. Evidence-package refs and source receipts cross-link both ledgers without pretending they
are one timeline.

Every durable record includes actor identity/role, source surface, acting worker/service identity,
command/event/idempotency/correlation/causation IDs, Release/candidate/manifest/attempt/environment
refs, provider operation/delivery refs, timestamps, source version, and sanitized outcome.

### Slack durable outbox

Send safe, deep-linked notifications for:

- staging approval required;
- production approval required;
- absolute stop;
- deployment start, success, failure, or unknown;
- rollback required, start, success, or failure;
- linked critical Incident; and
- Released confirmation.

Slack delivery is durable, deduplicated, retried with backoff, and independently observable.
Delivery failure changes only notification state. It never changes Release lifecycle, attempt state,
approval state, or authority, and it never fabricates approval. Slack messages are summaries and
Opzava deep links with no secrets or unsafe evidence payloads.

### GitHub secondary history

GitHub exposes human-readable secondary history through immutable RC/stable tags, draft/prerelease
or final GitHub Releases as native facts, included DevTicket links, safe Release notes, manifest
hash/safe evidence refs, and rollback/supersession notes. GitHub remains authoritative for those
native facts but never for Opzava Release lifecycle or approvals.

## DevTicket behavior

Release membership is immutable after manifest seal. The same Done DevTicket may appear in a
replacement candidate when the exact source range requires it. Release badges, inclusion, failure,
rollback, evidence, and publication never change the DevTicket lane: Cards remain `Done`.

## Observable behavior and test matrix

Tests use deterministic command/application seams and real provider adapters or controlled fakes for
facts. No model output is a correctness oracle.

| Area                      | Required observable tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity and lifecycle    | Create/revise Draft; RC/build-request commit freezes exact revision; RC tag request/observation/deterministic confirmation binds matching ref/target/tree/receipt/times/evidence and rejects callback/manual-tag bypass; RC timeout/unknown reconciles the same request; terminal failed plus trusted no-tag-created proof permits only atomic frozen-revision abandonment and successor revision/new RC, while existing/possible tag rejects; immutable seal; exact lifecycle; terminal cancel/supersede; Released history unchanged after degradation; attention set not lifecycle |
| Reservation and tags      | Concurrent stable reservation conflict; one active lineage reservation; replacement consumes lineage; immutable unique RC/stable tags; no move/delete/reuse; request commit permanently consumes/fences identity even when provider outcome fails or is unknown                                                                                                                                                                                                                                                                                                                      |
| Composition               | Candidate GitHub-observed reachable from expected protected `development`; base only preceding governed Released candidate/tree or one-time baseline; full DAG delta; merge/squash/revert/cherry-pick/already-released cases; late-base/non-ancestor/rewrite rejection; every behavior/source change maps Done+Review; Maintenance limits                                                                                                                                                                                                                                            |
| Manifest/build once       | One canonical Trusted Build Request bound to revision/source/tree/composition/config; different idempotency input rejected; unknown reconciles same request/no parallel build; terminal Failed plus trusted no-artifact proof permits only explicit atomic abandonment and successor revision/new RC/request; old lineage remains immutable; partial/unknown artifacts reject abandonment and quarantine; canonical manifest/provenance/digest/signature/SBOM/check; same bundle/no rebuild                                                                                          |
| Command safety            | #230 ordering: non-persisting tenant/target-family admission, then Secret-Safe Ingress for every content-bearing field before receipt/replay/persistence/outbox; suspected content creates only safe stop metadata/no Release rejection record; then actor/role auth, aggregate CAS, idempotency, policy/evidence freshness, lease/fence, callbacks request only, outbox atomicity and reauthorization; sanitized post-ingress accepted/rejected/security audit                                                                                                                      |
| Staging                   | Deterministic preflight/acceptance and human Staging Approval; one active lease; successful attempt retains CAS/fenced Staging Occupancy after lease; no callback transfer; newer sealed candidate requires atomic CAS reservation transfer after Released+current observation, Cancelled/Superseded+accepted restore/non-current proof, or irreversibly bound ProductionReady+authorized linked forward fix+terminal known attempts+exact current observation; Restore has separate deterministic Accept                                                                            |
| Production                | Distinct Production Approval; atomic promotion request freezes cancellation/version before side effect; callback cannot confirm; authorized reconciliation binds actor/time/receipt/evidence and observed main ref/commit/tree; policy-merge tree equality; separately requested/confirmed stable tag; same digests; smoke/stabilization; LKG advances only on verified success                                                                                                                                                                                                      |
| Publication               | Publish commits one request/outbox only; observation appends fact only; deterministic confirmation binds exact tag/release/manifest/receipt/times/evidence and alone produces `Released`; unknown reconciles same request; live production plus pending publication remains `ProductionReady + PublicationPending`; no competing request/redeploy                                                                                                                                                                                                                                    |
| Approval                  | Exact binding, role revocation, nonce replay, expiry, evidence/manifest/environment/policy drift, supersession invalidation; exception approval cannot substitute stage/prod approval; Actions only request                                                                                                                                                                                                                                                                                                                                                                          |
| Absolute stops            | Secret suspicion and unhealthy/unverifiable GitHub block RC tag/build/seal/approval/main/tag/deploy/publish through UI, Slack, Actions, agents, API, callbacks; containment only; contaminated immutable blob quarantine/access-ref revocation, approval invalidation, rotation, sanitized tombstone/new package; no raw replication                                                                                                                                                                                                                                                 |
| Hard prerequisites        | Missing digest/signature/provenance, unknown target, impossible rollback/restore, incompatible migration, or missing backup cannot become exception approval                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Partial/unknown           | Duplicate/out-of-order callback dedupe; timeout -> Unknown; expiry revokes worker not fence; scheduled reconciliation/alert/Incident; elapsed time no resolution; trusted effective state/confirmed cancellation only; reconcile returns Verifying/Failed/Cancelled, never Succeeded/lifecycle; exact Accept required; mixed projection; no fallback; API 2xx not success; LKG separate                                                                                                                                                                                              |
| Rollback                  | New immutable-manifest attempt; authorization/containment policy; compatibility/restore proof; deterministic Accept; no history rewrite; any rollback failure links Incident, failed production rollback is critical, threshold Unknown links Incident and stays fenced; forward fix uses new DevTicket/candidate/version                                                                                                                                                                                                                                                            |
| Incident boundary         | Deployment Failed and threshold Unknown must link appropriate Incident; any rollback failure links Incident and failed production rollback is critical; escalation never frees fence; Incident resolution never mutates Release and Release recovery never resolves Incident; Released history remains                                                                                                                                                                                                                                                                               |
| Ledgers and notifications | Actor chain/stable refs; accepted and rejected/security-denial audit; separate activity/sync ledgers; no global order; Slack retry never mutates Release/attempt/approval; GitHub secondary history only                                                                                                                                                                                                                                                                                                                                                                             |
| DevTicket                 | Included Cards remain Done through staging, failure, rollback, supersession, publication, and Release; membership immutable; replacement may include the same Done ticket                                                                                                                                                                                                                                                                                                                                                                                                            |
| Real UI                   | Authenticated Admin uses Releases view against the real local Docker stack and deterministic GitHub/build/registry/Dokploy test seams; sees lifecycle, simultaneous attention, approvals, per-service digest/health, current vs LKG, evidence, Incident link, publication pending, and safe degraded/forbidden states                                                                                                                                                                                                                                                                |
| Accessibility             | Keyboard and screen-reader operation for Draft, approval, cancellation, reconciliation, rollback, evidence, and provider-degraded states; status is not color-only; narrow layout preserves identity/target/risk                                                                                                                                                                                                                                                                                                                                                                     |
| Secret regression         | Search all Release, evidence, audit, outbox, log, Slack, GitHub, bundle/export, and UI outputs for raw secret values/tokens/env contents; only named refs/versions, safe hashes, containment metadata, and tombstones may appear                                                                                                                                                                                                                                                                                                                                                     |

The end-to-end user-level gate must prove at least one successful build-once flow from a Draft based
on Done DevTickets through requested/observed/confirmed RC, staging, both human approvals,
protected-main promotion, stable tag, same-digest production deployment, GitHub publication, and
`Released`. Separate sad-path drives must prove Secret-Safe Ingress ordering/no raw or pre-admission
Release rejection persistence, RC callback/manual-tag bypass rejection, RC request
freeze/unknown/terminal-no-tag-created abandonment and rejection when a tag exists or may exist,
build-request freeze/unknown/failure, explicit failed/no-artifact frozen-revision abandonment and
rejection for partial/unknown artifacts, staging occupancy transfer/restore including the linked
forward-fix path, deployment Unknown reconciliation through the exact Accept command, publication
request/observation/confirmation, absolute-stop containment and contaminated-evidence replacement,
post-ingress rejected-command audit, and rollback/Incident linkage.

## Rejected alternatives

- **Make Done equal production.** Rejected because code completion and environmental promotion have
  different authorities, evidence, failure modes, and rollback semantics.
- **Let GitHub Actions or GitHub Releases own the workflow.** Rejected because they cannot enforce
  Opzava Ready/Review/approval/secret/GitHub-health policy or provide the primary in-product
  surface.
- **Rebuild per environment.** Rejected because source-equivalent builds are not artifact identity;
  staging evidence would not prove the production artifact.
- **One approval for staging and production.** Rejected because the evidence, blast radius, target,
  and time boundary differ.
- **Move tags or reset `main` after failure.** Rejected because it destroys the durable history the
  design is meant to protect.
- **Encode failures as extra lifecycle states.** Rejected because independent attention conditions
  can coexist and operational truth belongs in attempts/current deployment/Incident.
- **Treat rollback as undoing a Release.** Rejected because rollback changes environment state, not
  source or historical Release truth.
- **Use Maintenance Records for unplanned code.** Rejected because it is a bypass around DevTicket
  readiness, Review, and Done.

## Implementation validation backlog

The contract is complete, but implementation must validate and pin:

1. real GitHub protected-branch policy and whether exact fast-forward is permitted;
2. GitHub App permission, tag, Release, webhook, rate-limit, and reconciliation behavior;
3. Dokploy API authentication, compose/environment identity, queue/deploy/query/log/cancel behavior,
   observed effective image-digest and per-service-health availability, and idempotency support;
4. trusted builder, registry, signing/attestation, provenance, SBOM, vulnerability, and retention
   products and their source-versioned APIs;
5. Compose canonicalization and non-secret config-hash scheme;
6. migration compatibility, backup/restore provider, and immediate containment policy;
7. Admin release roles, approval expiries, Slack identity/session binding, and revocation latency;
8. Release Evidence Package retention, redaction/tombstone, and export policy; and
9. real authenticated Releases UI and local-Docker/provider test-harness seams.

Unknown provider behavior remains fail-closed; implementation may not fill these gaps by assertion.

## Official sources consulted

Accessed 2026-07-17:

- [Dokploy Docker Compose](https://docs.dokploy.com/docs/core/docker-compose) — deployment
  records/logs, configuration/environment behavior, and cancellation limited to queued rather than
  in-progress deployments are implementation-validation inputs.
- [Dokploy Compose API](https://docs.dokploy.com/docs/api/compose) — API-key compose query and
  operation seams to validate.
- [Dokploy Deployment API](https://docs.dokploy.com/docs/api/deployment) — deployment query/log
  seams to validate.
- [Dokploy application rollbacks](https://docs.dokploy.com/docs/core/applications/rollbacks) —
  registry-based rollback patterns; the Opzava Compose release adapter still needs validation.

These sources inform adapter investigation only. This memo does not overclaim that a provider API
guarantees the aggregate, fencing, digest-verification, approval, or rollback semantics above.
