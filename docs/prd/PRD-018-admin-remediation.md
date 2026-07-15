# PRD-018: Admin remediation actions and one-tenant blast-radius controls

> **Dev Board amendment (2026-07-15):** This PRD describes target behavior. The current implementation and ADR-013-era documents may still expose an Incident/ErrorGroup through an ADMIN Project Management `pm.Card`; that is legacy projection behavior, not the target domain model. Under PRD-019 and ADR-017, Incident/ErrorGroup is a Notifications/Admin-Observability aggregate with lifecycle `Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem`. Dev Board may display a read-only Incident projection, but Incident is not a DevTicket Type and is never Sprint-eligible. Permanent code or configuration remediation is a linked Bug or Technical Task DevTicket that independently passes Ready, execution, Review, and Done.

## Problem

Opzava has locked ADRs for the error-to-incident pipeline, pure-per-tenant Gateway tenancy, billing entitlement, and Docker/Dokploy deployment parity, but the product contract for executing remediation is still implicit.

Without this PRD, the Ask Admin Opzava loop can drift into unsafe product behavior:

- An Incident detail surface could become a broad admin console instead of a bounded triage surface backed by ADR-013 `ErrorGroup` and `RemediationAction`.
- Ask Admin Opzava could execute a runtime fix without a blast-radius class, dry-run evidence, approval state, idempotency key, or immutable admin-token audit.
- Medium-risk operations such as Gateway restart, task redispatch, projector replay, route repair, or re-provisioning could happen from a browser handler or hot broker path instead of the audited platform-ops job path.
- Destructive operations could be hidden behind one button instead of a two-step confirmation with a target-specific phrase and before/after evidence.
- A remediation action could affect multiple tenants, multiple Gateways, or a stale target if the one-tenant blast-radius invariant is not enforced in the domain.
- Orphaned Gateway remediation could be an ops script, leaving routable or running containers after suspension, dunning, deprovisioning, label drift, stale leases, or provisioning crashes.
- The reaper could stop the wrong Gateway, or fail silently, if it is not productized with findings, dry-run evidence, idempotency, compensating state, audit, and incident projection.

The solution is a focused Admin remediation product slice. Ask Admin Opzava triages an ADR-013 Incident/ErrorGroup, gathers evidence through approved ports, proposes a `RemediationAction` with a blast-radius class, runs dry-run-first, gates medium or higher actions through Opzava approvals, requires two-step confirmation for destructive work, executes through audited admin/provisioning jobs, and records immutable admin-token audit. The reaper for orphaned Gateways is treated as a first-class platform safety workflow owned by Tenant Provisioning/Platform-Ops, surfaced in Monitoring, Security & Audit, Debug, and operational Incidents, and constrained to one tenant or one Gateway at a time. A lasting code or configuration fix is tracked separately as a linked Dev Board Bug or Technical Task, never by turning the Incident itself into planned work.

This PRD applies ADR-002, ADR-013, ADR-014, and ADR-015. It depends on the locked Q4, Q9, Q12, and Q14 decisions in `docs/plan/grilling-decisions.md` and the Admin mockups without restating architecture.

## Goals and Non-goals

### Goals

- Ship the Ask Admin Opzava remediation surface for triaging an Incident/ErrorGroup and proposing a `RemediationAction`.
- Require every remediation proposal to carry kind, target scope, blast-radius class, dry-run result, idempotency key, approval state, and audit refs.
- Make the default Ask Admin Opzava autonomy low: notify, label, summarize, request more data, and draft remediation only.
- Require approval for every medium or higher blast-radius remediation before execution.
- Require two-step human confirmation for destructive actions, including re-provisioning, Gateway restart when it drops active work, token/config changes, queue drains, data erasure, and orphan-Gateway removal.
- Enforce one-tenant blast radius: one remediation action can target one tenant, one Gateway, one route, one task/run, one projector cursor, one node, or one explicit operational target.
- Reject cross-tenant remediation as a single action.
- Execute runtime mutations only through the audited Tenant Provisioning/Platform-Ops job path and ADR-003 admin/provisioning credential boundaries.
- Make dry-run-first mandatory wherever the target operation supports it.
- Make idempotency mandatory for proposal creation, dry-run, approval decision, execution, retry, and reaper compensation.
- Record immutable admin-token audit for acting human, Ask Admin Opzava actor, system/reaper actor, admin-token job ref, target scope, before/after state, approval refs, OpenClaw opaque refs, and result.
- Productize the reaper for orphaned Gateways with scheduled scans, dry-run findings, action classification, compensating execution, Incident correlation/projection, and audit.
- Preserve the Incident lifecycle `Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem` independently of remediation-action and DevTicket lifecycles.
- Link permanent code or configuration remediation to a distinct Bug or Technical Task DevTicket with its own Ready, Review, and Done gates.
- Surface remediation and reaper state across `security-audit.html`, `monitoring-health.html`, and `debug.html`.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw parity boundaries for what Opzava owns versus what is harnessed through the broker ACL.
- Define acceptance and testing decisions for remediation safety, one-tenant blast radius, orphan reaping, audit, and UI states.

### Non-goals

- Redesign ADR-002 tenant lifecycle, ADR-013 incident grouping, ADR-014 billing entitlement, or ADR-015 deployment parity.
- Persist Incident as a DevTicket Type, put Incident directly in a Sprint, or let a DevTicket lane transition mutate Incident status.
- Treat creation or completion of a linked remediation DevTicket as automatic Incident mitigation, resolution, or postmortem completion.
- Build a general-purpose runbook engine, shell console, or arbitrary admin command runner.
- Let Ask Admin Opzava execute cross-tenant repairs, bulk migrations, broad queue drains, broad route repairs, or shared-infrastructure mutations as one action.
- Let browser clients, the hot `gateway-broker`, tenant users, or ordinary assistant sessions hold or invoke `operator.admin` authority.
- Bypass `AuthorizationPort`, Opzava approval policy, RLS, tenant lifecycle checks, entitlement checks, or immutable audit.
- Store raw secrets, Gateway tokens, provider credentials, channel payloads, request bodies, customer messages, Docker socket details, or unredacted Gateway-local config in remediation records, debug bundles, notifications, or exports.
- Replace OpenClaw health, logs, task/session state, diagnostics, Workboard diagnostics, or usage/cost internals.
- Make OpenClaw Workboard, raw logs, Docker labels, Traefik labels, or an external issue tracker the source of truth for remediation state.
- Build K8s or Nomad adapters. The PRD must keep `GatewayRuntimePort` adapter-agnostic, with Docker as the first adapter from ADR-002 and ADR-015.
- Publish this PRD, create issue-tracker records, call GitHub, or run build/test/lint commands.

## User Stories

1. As a platform operator, I want an Incident detail surface to show a remediation panel, so that triage and safe action live next to the operational context.
2. As a platform operator, I want Ask Admin Opzava to summarize the `ErrorGroup`, recent `ErrorEvent`s, affected tenant, affected Gateway, source, severity, count, and last seen time, so that I can understand the problem before considering action.
3. As a platform operator, I want Ask Admin Opzava to cite evidence from logs, diagnostics, health, task snapshots, Workboard diagnostics, usage/cost projections, Activity, and audit, so that proposed remediation is explainable.
4. As a platform operator, I want evidence reads to happen through approved ports and the broker ACL, so that investigation does not bypass ADR-003 and ADR-004 boundaries.
5. As a platform operator, I want Ask Admin Opzava to default to notify, label, summarize, request more data, and draft comments, so that low-risk help is useful without runtime mutation.
6. As a platform operator, I want every proposed fix to become a `RemediationAction`, so that remediation has a durable lifecycle and audit trail.
7. As a platform operator, I want a remediation proposal to show action kind, target scope, blast-radius class, dry-run state, approval requirement, current status, and owner, so that the risk is visible before execution.
8. As a platform operator, I want blast-radius classes to be explicit, so that notify-only work, one-target runtime work, high-risk runtime work, and destructive work are not treated the same.
9. As a platform operator, I want low blast-radius actions to draft or notify by default, so that Ask Admin Opzava does not mutate runtime unless a policy permits it.
10. As a platform operator, I want medium and higher blast-radius actions to require approval, so that Gateway restarts, task redispatch, projector replay, route repair, and re-provisioning are deliberate.
11. As an approver, I want remediation approval requests to show blast radius, affected tenant, affected Gateway, dry-run output, before/after preview, idempotency key, and evidence links, so that I can make an informed decision.
12. As an approver, I want stale dry-runs or changed targets to block approval, so that I cannot approve an obsolete operation.
13. As an approver, I want destructive remediation to require a second confirmation after approval, so that irreversible or service-disrupting actions are not one-click.
14. As an approver, I want the second confirmation to name the exact tenant and target, so that I cannot confirm the wrong Gateway or tenant by mistake.
15. As a platform operator, I want destructive confirmations to expire, so that old decisions cannot execute after the context changes.
16. As a platform operator, I want every supported remediation to run dry-run-first, so that expected changes and blocked preconditions are visible.
17. As a platform operator, I want dry-run failures to be captured as action state, so that failed repair attempts do not disappear into logs.
18. As a platform operator, I want an action that cannot support dry-run to say so and require higher approval policy, so that no dry-run is an explicit risk.
19. As a platform operator, I want retries to use the same idempotency key, so that network or worker retries do not duplicate runtime changes.
20. As a platform operator, I want duplicate proposal requests for the same incident, kind, target, and evidence window to resolve to the same open action, so that Ask Admin Opzava does not create action storms.
21. As a platform operator, I want an action to re-check tenant lifecycle, entitlement, GatewayInstance, lease, target version, approval state, and authorization at execution time, so that stale state cannot execute.
22. As a platform operator, I want cross-tenant remediation proposals rejected before dry-run, so that one incident cannot become broad admin authority.
23. As a platform operator, I want a remediation action to affect only one tenant, Gateway, route, task, run, projector cursor, node, or operational target, so that blast radius is bounded.
24. As a platform operator, I want bulk-looking repairs to be split into per-tenant actions, so that each target has its own dry-run, approval, execution, and audit.
25. As a platform operator, I want successful remediation to update the `ErrorGroup` timeline and projections, Activity, notifications, and audit, so that the operational history is complete without creating a second incident identity.
26. As a platform operator, I want failed remediation to preserve execution result and safe failure reason, so that follow-up work has evidence.
27. As an auditor, I want immutable audit rows for proposal, dry-run, approval, confirmation, execution, cancellation, expiry, and retry, so that the actor chain is reconstructable.
28. As an auditor, I want audit rows to include acting human, Ask Admin Opzava actor, system/reaper actor where applicable, admin-token job ref, target scope, before/after metadata, approval refs, opaque OpenClaw refs, payload hash, and result, so that evidence is complete without storing secrets.
29. As a security reviewer, I want remediation records to store secret refs and redacted summaries only, so that admin workflows do not become a credential sink.
30. As a platform operator, I want supported low actions such as add label, set owner, post draft summary, request diagnostics, notify route, and propose a linked remediation DevTicket, so that triage can move without risky mutation.
31. As a platform operator, I want supported medium actions such as restart one idle Gateway, cancel one stuck task, redispatch one failed task, replay one projector window, refresh one route, and rerun one health check, so that common repair is approval-gated but efficient.
32. As a platform operator, I want supported high actions such as restart one busy Gateway, repair one Gateway route, rotate one broker runtime token, resume one provisioning job, or stop one orphan candidate, so that risky runtime repair has stronger review.
33. As a platform operator, I want destructive actions such as re-provision one tenant Gateway, remove one orphaned Gateway container, purge one deprovisioned Gateway state path, drain one queue partition, or perform data erasure to require two-step confirmation, so that irreversible work is treated differently.
34. As a platform operator, I want Ask Admin Opzava to explain why an action is not allowed, so that policy failures are clear rather than silent.
35. As a tenant admin, I want tenant-visible incident state to show that platform remediation is underway only when disclosure policy permits it, so that tenants receive safe status without platform internals.
36. As a platform operator, I want a remediation action to show "approval required" rather than a disabled mystery button, so that next action is obvious.
37. As a platform operator, I want a cancelled or rejected action to remain visible on the incident timeline, so that decision history is preserved.
38. As a platform operator, I want action expiry when incident status, target state, or dry-run evidence changes, so that approvals are tied to current reality.
39. As a platform operator, I want remediation notifications to avoid sensitive details, so that external alert channels do not leak payloads.
40. As a platform operator, I want a reaper dashboard summary in Monitoring, so that orphaned Gateway findings are visible before they become spend or routing risk.
41. As a platform operator, I want the reaper to scan running `opzava.gateway=true` containers, Traefik-routable Gateway labels, tenant lifecycle, entitlement, `GatewayInstance`, expected labels, expected mounts, expected network, expected ports, and provisioner lease, so that orphan detection matches ADR-002 and ADR-015 invariants.
42. As a platform operator, I want the reaper to classify findings such as stale lease, suspended tenant still running, deleted tenant still running, missing entitlement, missing GatewayInstance, duplicate container, route-only orphan, label drift, mount drift, port drift, network drift, and unknown owner, so that the repair path is precise.
43. As a platform operator, I want every reaper finding to be tenant/Gateway scoped where possible, so that one finding cannot affect multiple tenants.
44. As a platform operator, I want the reaper's dry-run to show observed state, expected state, invariant failures, proposed action, and evidence age, so that automated and manual repairs are reviewable.
45. As a platform operator, I want unambiguous anti-orphan violations to produce compensating actions through `GatewayRuntimePort`, so that the platform does not leave unentitled Gateways running.
46. As a platform operator, I want ambiguous reaper findings to create or update an operational Incident and remediation proposal rather than execute, so that uncertain state gets human review.
47. As a platform operator, I want the reaper to stop routability and runtime authority together when policy requires it, so that no routable orphan Gateway remains.
48. As a platform operator, I want reaper actions to be idempotent and resumable, so that crashes after stop, route removal, quarantine, or audit do not require shell cleanup as the normal path.
49. As a platform operator, I want a stopped or quarantined orphan to produce Activity, notification, audit, and incident correlation, so that the repair is visible.
50. As a platform operator, I want the reaper to preserve forensic metadata without copying secrets or raw Gateway config, so that investigation is possible without leakage.
51. As a billing operator, I want a tenant in `Suspended` or without active runtime entitlement to block Gateway starts and be reaper-eligible if a container is still running, so that ADR-014 dunning cannot burn spend.
52. As a provisioning operator, I want duplicate containers or port collisions to be handled one Gateway at a time, so that a repair cannot take down a healthy tenant.
53. As a provisioning operator, I want route drift to be detected even when the container is stopped, so that stale Traefik routing cannot keep an orphan reachable.
54. As a platform operator, I want a reaper finding to link to the related `GatewayInstance`, tenant lifecycle state, entitlement state, provisioner lease, and Docker/route refs where authorized, so that evidence is inspectable.
55. As a platform operator, I want reaper scan failures to create an incident when the reaper itself may be blind, so that the safety loop is observable.
56. As a platform operator, I want Monitoring to show reaper freshness and last successful scan age, so that stale safety checks are visible.
57. As a platform operator, I want Debug to run a bounded reaper diagnostic dry-run, so that I can inspect current orphan risk without changing runtime.
58. As a platform operator, I want Debug bundles to include reaper summaries and remediation ids, so that support can investigate without raw Docker credentials or secrets.
59. As an approver, I want Security & Audit to show remediation approvals beside business and runtime approvals, so that platform fixes are governed in the same review surface.
60. As an auditor, I want Security & Audit to show reaper system actions and admin-token jobs in the audit trail, so that automated safety actions are not invisible.
61. As a platform operator, I want role and policy checks to distinguish platform operator, tenant owner, tenant admin, Ask Admin Opzava, and system reaper actors, so that authority is not conflated.
62. As a platform operator, I want remediation and reaper actions to render loading, dry-run running, approval required, awaiting confirmation, executing, succeeded, failed, cancelled, expired, stale, forbidden, conflict, retrying, and Gateway unavailable states, so that async operation is explicit.
63. As a screen-reader user, I want remediation risk, approval state, destructive confirmation, and reaper findings exposed as text and semantic labels, so that the workflow is not color-only.
64. As a keyboard user, I want remediation proposal review, approval, confirmation, cancellation, and reaper finding navigation to work without a mouse, so that high-risk operations remain accessible.
65. As a mobile operator, I want the primary risk, target, approval state, and action buttons to remain readable on narrow screens, so that emergency triage does not require a desktop.
66. As a developer, I want remediation behavior tested through application services, command handlers, ports, projection writers, route/server-action authorization seams, and UI composition, so that tests protect policy rather than implementation details.
67. As a developer, I want fake broker ACL and fake `GatewayRuntimePort` adapters in tests, so that remediation and reaper behavior is not coupled to OpenClaw or Docker internals.
68. As a developer, I want regression tests proving no cross-tenant action can execute, so that one-tenant blast radius remains enforced.
69. As a developer, I want regression tests proving no secret or raw config appears in remediation, reaper, audit, notification, or debug artifacts, so that security posture is preserved.
70. As a product reviewer, I want any needed screen absent from the mockups marked net-new, so that design debt is visible before implementation.
71. As an incident responder, I want Incident status to follow `Detected`, `Triaged`, `Mitigating`, `Monitoring`, `Resolved`, and `Postmortem`, so that operational response is not confused with development workflow.
72. As an incident responder, I want a permanent code or configuration fix represented by a linked Bug or Technical Task DevTicket, so that it must satisfy Dev Board Ready, execution, Review, and Done gates.
73. As a Sprint planner, I want Incidents excluded from Sprint membership even when Dev Board displays their projections, so that an operational event cannot masquerade as planned implementation work.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `security-audit.html` | Use the existing `Security & Audit` page as the governance surface for remediation approvals and immutable audit. Add remediation approval rows to Pending approvals with action, requester, risk/blast-radius class, affected tenant/Gateway, age, dry-run summary, and Approve/Deny. Destructive actions must not execute from the table directly after approval; approval moves the action to an awaiting second-confirm state. Audit trail rows must include proposal, dry-run, approval, confirmation, execution, reaper finding, reaper compensation, cancellation, expiry, and retry events. Users & roles remains the place to review who can approve platform remediation. |
| `monitoring-health.html` | Use Monitoring for operational health plus reaper status. Service health and Recent alerts must include Gateway orphan risk, reaper freshness, last scan, scan failures, routable orphan findings, lease drift, and entitlement/lifecycle mismatch alerts. The Nodes table continues to handle paired hosts and approved commands; reaper findings that involve a host or route link to the relevant node/Gateway detail where authorized. Export report includes redacted reaper and remediation summaries. If the reaper itself is stale or blind, Monitoring must show a warning and link to the operational Incident. |
| `debug.html` | Use Debug for advanced diagnostics, not direct mutation. Run diagnostics may include a bounded reaper dry-run and remediation preflight check. Copy debug bundle may include redacted remediation ids, dry-run summaries, reaper scan summaries, target opaque refs, build/version, diagnostics, and incident refs, but no secrets or raw Gateway config. Feature flag changes, raw config reveals, Gateway diagnostics, and reaper diagnostics must be authorized and audited. Any actual remediation execution must route to the remediation action flow, not run directly from Debug. |

Net-new screens to design:

- Ask Admin Opzava incident triage panel for evidence summary, safe citations, proposed `RemediationAction`, blast-radius class, and draft response.
- Remediation action detail drawer/page for target scope, evidence, dry-run output, approval state, confirmation state, idempotency key, execution status, before/after, audit refs, related Incident, and any separately linked remediation DevTicket.
- Destructive action confirmation dialog that requires a target-specific confirmation phrase, shows the exact tenant/Gateway/target, and expires with target changes.
- Reaper findings queue for orphaned Gateway findings, classification, evidence age, proposed compensating action, severity, auto/manual policy, and links to incident/audit.
- Gateway orphan detail screen for observed container/route/label/mount/network/port state versus expected `GatewayInstance`, tenant lifecycle, entitlement, and lease state.
- Admin-token job detail screen for platform-ops job status, credential boundary, target scope, retries, idempotency, redacted before/after metadata, and immutable audit.
- Remediation policy settings screen for blast-radius catalog, action kinds, dry-run support, approval thresholds, destructive confirmation policy, expiry windows, and reaper automation policy.

## Functional requirements

### Remediation lifecycle

- Notifications/Admin-Observability must own `RemediationAction` records and their proposal, dry-run, approval, confirmation, execution, cancellation, expiry, and audit lifecycle.
- `RemediationAction` must include Incident/ErrorGroup ref where applicable, action kind, target scope, blast-radius class, status, requested actor, Ask Admin Opzava actor where applicable, dry-run result, approval refs, confirmation refs, idempotency key, admin-token job ref, before/after metadata, opaque runtime refs, execution result, audit refs, and an optional linked-remediation-DevTicket ref.
- Supported statuses must cover at least Proposed, Drafted, DryRunPending, DryRunSucceeded, DryRunFailed, ApprovalRequired, AwaitingApproval, Rejected, Approved, AwaitingSecondConfirm, Confirmed, Executing, Succeeded, Failed, Cancelled, Expired, StaleTarget, and BlockedByPolicy.
- One open action must be idempotently resolved by the tuple of incident, action kind, target scope, target version/evidence window, and requester idempotency key.
- Proposal creation must reload the backing `ErrorGroup`, tenant, `GatewayInstance`, target refs, and authorization state from authoritative stores. Browser-supplied ids and Dev Board projection refs are hints only.
- Ask Admin Opzava must be able to draft proposal text and recommended action kind, but the server-side application service assigns the final blast-radius class and required gates.
- Action status changes must emit outbox events for the authoritative Incident timeline, derived Incident projections, Activity feed, notifications, approval inbox, and audit.
- Action comments and summaries must be redacted and visibility-scoped before storage or fan-out.

### Incident and Dev Board boundary

- Notifications/Admin-Observability must own Incident/ErrorGroup identity, evidence, visibility, and lifecycle.
- Incident lifecycle must be `Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem`; remediation-action status and DevTicket lane state must not substitute for, infer, or directly mutate these states.
- Dev Board may display an Incident projection in Summary, List, or attention UI, but the projection must preserve the Notifications/Admin-Observability identity and link back to the authoritative Incident.
- Incident must not be persisted as a DevTicket Type and must not be admitted to Draft, Queued, or Active Sprint membership.
- When permanent code or configuration change is needed, the authorized flow must create or link a separate Dev Board DevTicket whose Type is Bug or Technical Task.
- The linked remediation DevTicket must independently satisfy Human Owner, Ready contract, dependency, assignment/claim, local execution, independent Review, and Done requirements from PRD-019 and ADR-017.
- Incident and DevTicket links are many-to-many references with explicit relation semantics; neither aggregate owns or rewrites the other's lifecycle.
- A DevTicket reaching Done may contribute evidence to Incident mitigation or resolution, but an authorized Incident transition is still required. Incident resolution likewise does not mark an unfinished DevTicket Done.
- Current ADMIN `pm.Card` projections are migration inputs only. Until cutover they may dual-read the Incident, but new writes must target the authoritative Incident lifecycle and must not deepen Project Management ownership.

### Blast-radius classes and gates

- Blast-radius class must be a domain field with values at least `low`, `medium`, `high`, and `destructive`.
- `low` covers non-mutating or product-only triage actions: summarize, label, set owner, draft comment, request data, notify, create follow-up work, or run read-only diagnostics.
- `medium` covers one-target runtime or projection actions with reversible or bounded impact: restart one idle Gateway, cancel one stuck task, redispatch one failed task, replay one projector window, refresh one route, rerun one health check, or repair one non-destructive route/projection.
- `high` covers one-target operations with service disruption, credential adjacency, or material runtime risk: restart one busy Gateway, rotate one broker runtime token, stop/quarantine one orphan candidate, resume one provisioning job, repair one Gateway route, or force reconcile one GatewayInstance.
- `destructive` covers irreversible, data-affecting, or state-purging operations: re-provision one tenant Gateway, remove one orphaned Gateway container, purge one deprovisioned Gateway state/config/workspace path, drain one queue partition, revoke admin pairing material, perform GDPR erasure, or mutate secrets/config.
- Medium, high, and destructive actions must require Opzava approval before execution.
- Destructive actions must require a second human confirmation after approval and before execution.
- Approval and confirmation must be invalidated when target version, tenant lifecycle, entitlement, GatewayInstance, lease, dry-run output, or evidence window changes.
- Cross-tenant actions must be rejected and must not be downgraded into medium/high/destructive single actions.
- Bulk remediation must be represented as multiple one-target child actions, each with its own dry-run, approval/confirmation, idempotency, execution, and audit.
- Policy must fail closed: unknown action kind, unknown target, unsupported dry-run, missing target ownership, missing entitlement context, missing tenant context, stale target, or missing authorization blocks execution.

### Dry-run-first and execution

- Every supported mutating action must implement dry-run through an application service or port before execution.
- Dry-run output must include target identity, observed state, expected state, planned change, blocked preconditions, risk summary, estimated disruption, and redacted before/after metadata.
- If a target adapter cannot support dry-run, the action must be marked no-dry-run-supported, require high or destructive policy according to action kind, and explain the missing preflight in approval.
- Execution must re-run or validate dry-run freshness according to policy before mutating the target.
- Execution must re-check `AuthorizationPort`, approval state, confirmation state where required, tenant lifecycle, entitlement, `GatewayInstance`, provisioner lease, target version, idempotency state, and blast-radius policy.
- Runtime mutations must execute only through the audited Tenant Provisioning/Platform-Ops job path.
- The hot `gateway-broker` may read and relay through ADR-003 runtime surfaces but must not execute admin/provisioning mutations or receive broad runtime/Docker authority.
- Admin/provisioning credential use must be JIT, target-scoped, and captured by immutable audit. It must not be exposed to the browser, Ask Admin chat payloads, ordinary logs, debug bundles, or notifications.
- Execution retries must use the same idempotency key and must be safe after worker crash, timeout, duplicate delivery, or outbox replay.
- Success and failure must update the authoritative Incident timeline and derived projections, remediation status, Activity, notifications, and audit.

### One-tenant blast-radius controls

- Target scope must be normalized before proposal, dry-run, approval, and execution.
- A target scope must include tenant id unless the action is platform-only and non-runtime; runtime actions must include tenant id and one bounded target ref.
- Gateway actions must include exactly one `GatewayInstance` or one observed orphan candidate ref.
- Task/run actions must include exactly one task/run/session opaque ref and the tenant/Gateway that owns it.
- Projector replay actions must include exactly one projector, tenant, cursor/window, and idempotency key.
- Route repair actions must include exactly one tenant Gateway route and expected `GatewayInstance` route metadata.
- Node actions must include exactly one node/device ref and approved command scope.
- Platform-only shared service actions are out of scope for Ask Admin Opzava remediation unless modeled as read-only diagnostics or escalated to a separate incident/runbook outside this PRD.
- Query-layer guards and RLS must prevent tenant users from reading platform remediation rows, other-tenant remediation rows, or unredacted platform detail.
- Missing or mismatched tenant context must return 403, not an empty success result.

### Ask Admin Opzava triage

- Ask Admin Opzava must use the platform-ops Admin assistant identity and operate through approved application services.
- Ask Admin Opzava may inspect Incidents/ErrorGroups, derived Incident projections, redacted events, logs.tail, diagnostics.stability, health, task/session snapshots, Workboard diagnostics, usage/cost projections, Activity, audit, `GatewayInstance` status, reaper findings, and provisioning job summaries where authorized.
- Ask Admin Opzava must not read Gateway storage directly, Docker socket state directly, raw secrets, raw channel payloads, raw provider credentials, or unredacted Gateway-local config.
- Ask Admin Opzava may create low-risk drafts and proposals but cannot self-approve, self-confirm, or bypass approval policy.
- Ask Admin Opzava recommendations must include confidence/rationale, evidence citations, target scope, blast-radius class, dry-run requirement, and fallback if execution is blocked.
- If the incident is tenant-visible, Ask Admin Opzava must produce tenant-safe status language separately from platform-only operator notes.

### Reaper for orphaned Gateways

- Tenant Provisioning/Platform-Ops must own the scheduled reaper, reaper findings, compensating jobs, and `GatewayRuntimePort` interaction.
- The reaper must compare observed runtime and routing state against tenant lifecycle, active runtime entitlement, non-deleted `GatewayInstance`, expected labels, expected mounts, expected network, expected ports, expected route, and live provisioner lease.
- The reaper must inspect running `opzava.gateway=true` containers and Traefik-routable Gateway labels through the approved Docker adapter/socket-proxy path from ADR-015, not through raw browser/debug access.
- The reaper must classify findings at least as StaleLease, SuspendedTenantRunning, DeprovisioningTenantRunning, DeletedTenantRunning, MissingEntitlement, MissingGatewayInstance, DuplicateGatewayContainer, DuplicatePort, LabelDrift, MountDrift, NetworkDrift, RouteOnlyOrphan, ContainerOnlyOrphan, UnknownOwner, and ReaperBlind.
- Each finding must include observed state, expected state, invariant failures, tenant/Gateway scope if resolvable, evidence timestamp, proposed action, auto/manual policy, idempotency key, and redacted metadata.
- A reaper dry-run mode must be available to the scheduled job, Debug diagnostics, and remediation approval view.
- Unambiguous anti-orphan violations may execute a pre-approved compensating job through `GatewayRuntimePort` according to ADR-002, ADR-014, and ADR-015 policy, but each operation must still produce a `RemediationAction` or reaper action record, immutable audit, idempotency key, before/after metadata, and incident/activity projection.
- Ambiguous findings, Active-tenant findings, route/mount drift with uncertain owner, and any purge/destructive cleanup must create or update an operational Incident and require approval/confirmation according to blast-radius class.
- Reaper compensation must stop or remove routability and runtime authority together where required by ADR-015. It must not leave a route pointing to a stopped or unauthorized Gateway.
- Reaper compensation must be one target at a time. Multiple orphans are multiple findings/actions.
- Reaper jobs must be resumable after a crash between route removal, container stop, quarantine, audit write, outbox emission, or status update.
- Reaper failures, stale scans, Docker adapter failures, route-inspection failures, and scan deadletters must create or update platform operational Incidents when the safety loop may be blind.
- Reaper scan summaries must be available to Monitoring and Debug and must be exportable only as redacted, authorized artifacts.

### UX, accessibility, and states

- Remediation controls must show risk and state in words, not color alone.
- Approval and destructive confirmation controls must be keyboard-operable and screen-reader labeled with action kind and exact target.
- Destructive confirmation must require deliberate input, such as typing the tenant slug or Gateway short ref, and must display irreversible consequences.
- The UI must prevent accidental double-click execution through pending states and server-side idempotency, not client state alone.
- Remediation and reaper surfaces must include loading, empty, no-match, forbidden, stale, Gateway unavailable, dry-run running, approval required, awaiting confirmation, executing, succeeded, failed, conflict, expired, cancelled, blocked by policy, and retry states where applicable.
- Mobile layouts must preserve target scope, blast-radius class, dry-run status, approval requirement, and primary next action without overlap.

## Data and API touchpoints

| Touchpoint | Owning bounded context | Product data / behavior | Ports |
| --- | --- | --- | --- |
| Incident triage entry | Notifications/Admin-Observability | `ErrorGroup`, `ErrorEvent`, lifecycle, timeline, visibility, and safe summaries; any Dev Board Incident view is a derived projection | `ErrorCapturePort`, incident command/query services, `AuthorizationPort` |
| Ask Admin Opzava evidence gathering | AI Workforce plus Notifications/Admin-Observability | Admin assistant investigation, evidence citations, proposal draft | AI Workforce application service, broker ACL / `OpenClawGatewayPort`, incident query service, `AuthorizationPort` |
| Remediation action lifecycle | Notifications/Admin-Observability | `RemediationAction`, blast-radius class, status, dry-run, approval, confirmation, execution result | Remediation application service, `EventBusPort`, `AuthorizationPort` |
| Remediation approvals | Department Workflows/Approvals plus Notifications/Admin-Observability | Approval request, Approve/Deny, stale payload checks, expiry | Approval application service, `AuthorizationPort`, `EventBusPort` |
| Destructive confirmation | Notifications/Admin-Observability plus Identity & Access | Second human confirm, target phrase, expiry, actor/session step-up where required | Remediation application service, `AuthPort`, `AuthorizationPort` |
| Admin/provisioning execution job | Tenant Provisioning/Platform-Ops | Target-scoped platform job, admin-token credential use, retries, before/after metadata | Platform job service, `GatewayRuntimePort`, `SecretsVaultPort`, `EventBusPort` |
| Gateway runtime mutation | Tenant Provisioning/Platform-Ops | Start, stop, restart, suspend, resume, re-provision, route repair, quarantine/remove | `GatewayRuntimePort`, Docker adapter/socket-proxy path, `AuthorizationPort` |
| Broker/runtime reads | Runtime-Control through broker ACL | `logs.tail`, `diagnostics.stability`, `health`, task/session snapshots, Workboard diagnostics | Broker ACL / `OpenClawGatewayPort`, `RealtimeTransportPort` |
| Reaper scan | Tenant Provisioning/Platform-Ops | Observed containers/routes/labels/mounts/network/ports versus expected `GatewayInstance` and leases | Reaper service, `GatewayRuntimePort`, Docker adapter/socket-proxy path |
| Reaper finding projection | Tenant Provisioning/Platform-Ops plus Notifications/Admin-Observability | Orphan classifications, dry-run evidence, Incident creation/correlation, alerts | Reaper service, `ErrorCapturePort`, incident/remediation services, `EventBusPort` |
| Permanent remediation work | Dev Board, linked from Notifications/Admin-Observability | Separate Bug or Technical Task DevTicket; Ready contract, dependency state, assignment, Review, Done; never Incident identity or lifecycle | Dev Board application service, incident-link service, `AuthorizationPort`, `EventBusPort` |
| Billing entitlement check | Finance and Billing plus Tenant Provisioning | Active runtime entitlement, dunning/suspension state, grace state | Entitlement decision service, `BillingPort`, `EventBusPort` |
| Tenant lifecycle check | Tenant Provisioning/Platform-Ops | `tenant.lifecycle_state`, `GatewayInstance`, `ProvisioningJob`, lease state | Tenant lifecycle service, `GatewayRuntimePort`, `AuthorizationPort` |
| Immutable audit | Identity & Access plus Notifications/Admin-Observability | Actor chain, admin-token job ref, payload hash, target scope, result | Audit log service, `AuthorizationPort`, `EventBusPort` |
| Monitoring reaper status | Notifications/Admin-Observability plus Tenant Provisioning | Reaper freshness, orphan count, recent findings, scan failures | Monitoring query service, reaper query service, `RealtimeTransportPort` |
| Debug diagnostics and bundle | Tenant Provisioning/Platform-Ops | Bounded dry-run diagnostics, redacted remediation/reaper summaries, debug bundle | Diagnostics service, `ObjectStorePort`, `SecretsVaultPort`, `AuthorizationPort` |
| Notifications and Activity | Notifications/Admin-Observability plus Internal Collaboration/Activity | Safe notifications, Activity events, approval prompts, execution updates | Notification service, Activity projection service, `PushNotificationPort`, `RealtimeTransportPort` |

## OpenClaw-parity notes

| Surface / capability | Classification | Native harnessed through OpenClaw | Opzava-owned product authority |
| --- | --- | --- | --- |
| Incident source and projection | Opzava-owned | OpenClaw logs, diagnostics, health, task failures, and Workboard flags are inputs only | `ErrorGroup`, `ErrorEvent`, authoritative Incident lifecycle and visibility; optional derived Dev Board projection |
| Ask Admin investigation | Hybrid | `logs.tail`, `diagnostics.stability`, `health`, task/session snapshots, Workboard diagnostics through broker ACL | Evidence selection, redaction, authorization, proposal creation, incident comments |
| Remediation action state | Opzava-owned | Runtime refs are opaque evidence and execution targets | `RemediationAction`, blast radius, dry-run, approval, confirmation, idempotency, audit |
| Runtime mutation execution | Hybrid | Gateway/task/runtime mutations use OpenClaw/Gateway surfaces through approved admin/provisioning paths | Target scope, admin-token job policy, approval gates, one-tenant blast radius, audit |
| Gateway lifecycle | Hybrid | OpenClaw Gateway runtime health/readiness and admin pairing are harnessed | ADR-002 lifecycle state, `GatewayInstance`, `ProvisioningJob`, leases, compensating saga |
| Orphan detection | Opzava-owned with runtime adapter | Runtime container/route observations are adapter inputs | Reaper findings, invariant checks, compensating actions, incident projection, audit |
| Billing suspension | Opzava-owned | OpenClaw runtime is stopped/blocked through Gateway lifecycle controls | Entitlement, dunning, `Suspended`, fail-closed runtime admission, reaper eligibility |
| Deployment/routing parity | Hybrid | Tenant Gateway HTTP/WS route is runtime reachability | Expected Docker labels, Traefik route policy, route removal, no routable orphan invariant |
| Debug diagnostics | Hybrid | Runtime diagnostics/config summaries are read through ports | Redacted bundle composition, dry-run diagnostics, export auth, retention, audit |
| Workboard | OpenClaw-native as source observation | Workboard diagnostics/failure flags | Not remediation source of truth; Opzava Incident/ErrorGroup and `RemediationAction` own operational triage |
| Dev Board remediation work | Opzava-owned | No OpenClaw workboard identity or lifecycle is imported | A linked Bug or Technical Task DevTicket owns planned permanent work and its Ready/Review/Done workflow; Incident remains separate and is never Sprint-eligible |

## Acceptance criteria

- `docs/prd/PRD-018-admin-remediation.md` references ADR-002, ADR-013, ADR-014, and ADR-015 and covers the named mockups.
- An Incident/ErrorGroup detail surface can show an Ask Admin Opzava remediation proposal with evidence, target scope, blast-radius class, dry-run requirement, and approval requirement.
- Incident/ErrorGroup remains a Notifications/Admin-Observability aggregate with lifecycle `Detected -> Triaged -> Mitigating -> Monitoring -> Resolved -> Postmortem`.
- A Dev Board Incident projection preserves and links to the authoritative Incident identity; it does not create a `pm.Card` or DevTicket identity.
- Incident is not a DevTicket Type and cannot be added to a Sprint.
- Permanent code or configuration remediation is represented by a separately linked Bug or Technical Task DevTicket that must independently pass Ready, execution, Review, and Done.
- Completing a linked remediation DevTicket does not implicitly resolve its Incident, and resolving an Incident does not implicitly complete its DevTicket.
- Low-risk Ask Admin Opzava work defaults to notify/label/summarize/request-data/draft and does not mutate runtime.
- A medium or high remediation cannot execute until an authorized Opzava approval exists and is current.
- A destructive remediation cannot execute until approval plus a second target-specific human confirmation exist and are current.
- A stale dry-run, stale target version, changed tenant lifecycle, changed entitlement, changed `GatewayInstance`, or changed lease invalidates approval/confirmation.
- Runtime remediation executes only through the audited Tenant Provisioning/Platform-Ops job path and never through browser handlers or the hot broker path.
- Every remediation proposal, dry-run, approval, confirmation, execution, retry, cancellation, expiry, and failure writes immutable audit with actor chain and admin-token job refs where applicable.
- No remediation action can target more than one tenant, Gateway, route, task/run, projector window, node, or operational target.
- A cross-tenant remediation request is rejected before dry-run.
- Bulk remediation is represented as multiple one-target actions with independent dry-runs, approvals, executions, and audit.
- Idempotent retries do not duplicate task redispatch, Gateway restart, route repair, re-provision, quarantine, or reaper compensation.
- Tenant admins cannot read platform remediation rows, other-tenant remediation rows, platform-only audit, or unredacted incident details.
- Missing or mismatched tenant context returns 403 rather than `200` with an empty result.
- Raw secrets, provider credentials, Gateway tokens, channel payloads, request bodies, customer messages, Docker socket details, and raw Gateway-local config do not appear in remediation records, audit rows, notifications, debug bundles, or exports.
- The reaper scans observed Gateway containers and routes against tenant lifecycle, entitlement, `GatewayInstance`, expected labels/mounts/network/ports/routes, and provisioner lease.
- The reaper classifies orphan findings and produces redacted dry-run evidence with observed state, expected state, invariant failures, target scope, proposed action, and idempotency key.
- Unambiguous anti-orphan violations are compensated one target at a time through `GatewayRuntimePort` and are recorded with immutable audit and incident/activity projection.
- Ambiguous reaper findings, Active-tenant findings, and destructive cleanup create or update an operational Incident and require approval/confirmation according to blast-radius class.
- Reaper actions remove routability and runtime authority together where ADR-015 requires it.
- A reaper crash or retry resumes from durable idempotent state rather than requiring manual shell cleanup as the normal path.
- Reaper stale/blind state creates or updates a platform operational Incident and appears in Monitoring.
- `security-audit.html` remediation approvals and audit trail can distinguish business approvals, runtime approval mirrors, remediation approvals, and reaper/system actions.
- `monitoring-health.html` can show reaper freshness, orphan findings, recent reaper alerts, and export a redacted report.
- `debug.html` can run bounded dry-run diagnostics and produce redacted debug bundles without executing remediation directly.
- Remediation and reaper UI states are keyboard-operable, screen-reader labeled, not color-only, and responsive without hiding target/risk/approval context.

## Testing decisions

- Test external behavior and policy outcomes, not storage implementation, Docker internals, or OpenClaw DTO shapes.
- Prefer the highest stable seam: Incident and remediation application services, reaper service, approval command handlers, platform job handlers, projection writers, Dev Board link commands, route/server-action authorization seams, and UI composition.
- Use fake broker ACL ports for logs, diagnostics, health, task/session snapshots, Workboard diagnostics, and runtime read failures.
- Use fake `GatewayRuntimePort` adapters for dry-run, restart, stop, quarantine, route repair, re-provision, and adapter failure cases.
- Remediation lifecycle tests must cover proposal idempotency, dry-run required, dry-run unsupported policy, approval required, stale approval invalidation, second confirmation, execution, retry, cancellation, expiry, and failure.
- Blast-radius tests must cover low, medium, high, and destructive classes, server-side class assignment, unknown action fail-closed, and inability for Ask Admin Opzava to self-approve or self-confirm.
- One-tenant tests must cover rejection of cross-tenant targets, bulk split into child actions, tenant mismatch, Gateway mismatch, route mismatch, task/run mismatch, projector window mismatch, node mismatch, and platform-only read-only exception.
- Authorization/RLS tests must cover platform operator access, tenant owner denied from platform-only rows, tenant A denied from tenant B rows, missing tenant context returning 403, and role revocation blocking pending execution.
- Audit tests must cover actor chain, Ask Admin actor, system/reaper actor, admin-token job ref, approval refs, before/after metadata, payload hash, immutable append-only behavior, and no secret leakage.
- Reaper tests must cover clean scan, stale lease, suspended tenant running, deleted tenant running, missing entitlement, missing GatewayInstance, duplicate container, duplicate port, label drift, mount drift, network drift, route-only orphan, container-only orphan, unknown owner, and reaper blind state.
- Reaper compensation tests must cover idempotent stop/quarantine/remove-route, crash between steps, outbox replay, one-target execution, ambiguous finding requiring approval, destructive purge requiring two-step confirmation, and no routable orphan after compensation.
- Incident-boundary tests must cover the ordered operational lifecycle, rejection of invalid transitions, Dev Board projection identity, no Incident-as-DevTicket-Type write, no Incident Sprint membership, and no Project Management `pm.Card` creation on new Incident writes.
- Linked-remediation tests must cover Bug/Technical Task creation and linking, independent Ready/Review/Done gates, many-to-many relation semantics, DevTicket completion without implicit Incident resolution, and Incident resolution without implicit DevTicket completion.
- Billing/lifecycle integration tests must cover dunning to `Suspended`, runtime start blocked, running Gateway reaper eligibility, payment repair/resume no longer reaper-eligible, and deprovisioning cleanup.
- UI composition tests must cover Security & Audit remediation approvals, Monitoring reaper status, Debug dry-run diagnostics, destructive confirmation, target/risk labels, loading/empty/forbidden/stale/conflict/Gateway unavailable states, keyboard operation, screen-reader names, and mobile layout.
- Regression tests must assert no raw secret, token, provider credential, channel payload, request body, customer message, Docker socket detail, or raw Gateway config value is persisted or displayed in remediation, reaper, audit, notification, or debug artifacts.

## Dependencies

- ADR-013 for `ErrorGroup`, `ErrorEvent`, `RemediationAction`, `AlertRoute`, Ask Admin Opzava remediation loop, blast-radius classification, dry-run-first, one-tenant blast radius, and immutable admin-token audit, as amended by ADR-017 and PRD-019 to remove Project Management `pm.Card` authority.
- ADR-017 and PRD-019 for the separate Dev Board bounded context, Incident projection boundary, DevTicket Types, Sprint exclusion, and linked permanent-remediation workflow.
- ADR-002 for pure-per-tenant Gateway tenancy, `GatewayRuntimePort`, `GatewayInstance`, `ProvisioningJob`, tenant lifecycle, provisioner lease, anti-orphan invariant, and reaper responsibility.
- ADR-014 for billing entitlement, `Suspended` fail-closed behavior, dunning, runtime entitlement checks, and the rule that unentitled Gateways must not keep running.
- ADR-015 for canonical Compose/Dokploy parity, Docker socket-proxy boundary, Traefik label/routing contract, no routable orphan invariant, and local/live reaper parity.
- Q4 data boundary decisions: Opzava Postgres is product source of truth; OpenClaw runtime surfaces are reached only through the broker ACL; snapshots are truth and events are hints.
- Q9 error pipeline decisions for watchdog, dead-letter, redaction-at-ingest, and Ask Admin Opzava default low autonomy. Its former ADMIN card projection is legacy migration context rather than target ownership.
- Q12 billing/provisioning decisions for admin/provisioning credential boundaries, idempotent provisioning, lifecycle transitions, and orphaned Gateway invariant.
- Q14 deployment parity decisions for reaper scan inputs, Docker provider labels, route removal, and socket-proxy constraints.
- PRD-012 Admin Observability for Monitoring, Security & Audit, Debug, incidents, alerts, Activity, notifications, and broad admin screen conventions.
- The deferred Billing settings surface for entitlement, suspension, dunning, and runtime-start blocking surfaces.
- Mockup implementation conventions from `security-audit.html`, `monitoring-health.html`, and `debug.html`.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
