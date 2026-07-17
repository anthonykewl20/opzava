# PRD-012: Admin monitoring, logs, incidents, security audit, alerts, and debug

> **Incident/Dev Board amendment (2026-07-15):** The standalone Issues page is no longer a target product surface. `ErrorGroup`/Incident remains a separate Notifications/Admin-Observability aggregate with lifecycle **Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem**. It may project into the Dev Board **Incidents** view for operator convenience, but it is not a persisted DevTicket Type and is never Sprint-eligible. A permanent code fix is a separately linked DevTicket of Type Bug or Technical Task under PRD-019. Current `/issues` code is a legacy migration input; see `docs/plan/dev-board-migration-manifest.md`.

> **WF-233 coordination amendment:** An Incident may send Dev Board a Secret-Safe, versioned,
> explicitly scoped coordination request. Incident `S0`–`S3`, requested `P0`/`P1`, or model text is
> not pause/preemption authority. Dev Board owns holds and commands, live execution reuses WF-230/
> WF-232 containment, and Resume is separately authorized; Incident resolution never resumes Sprint
> automation. See `docs/plan/research/wf233-incident-sprint-coordination.md`.

## Problem

Opzava has locked decisions for tenant isolation, gateway access, error capture, Incident projection, RBAC/RLS, metering, approvals, and workflow limits, but the admin observability product surface is not yet specified end to end.

Without this PRD, the Ask Admin Opzava surface can drift into unsafe or incomplete behavior:

- Error groups could become raw log rows or development tickets instead of ADR-013 `ErrorGroup` Incidents projected to Dev Board Incidents.
- The protected platform Incidents view could leak tenant detail if `tenantId = NULL` platform rows and tenant-scoped redacted views are not kept separate.
- Gateway logs could be fetched directly or stored unredacted instead of read through the ADR-003 broker ACL and redacted at ingest/read-through boundaries.
- Monitoring, alerts, Activity, Incidents, Security & Audit, Costs, and Debug could show disconnected slices of runtime state without shared incident, audit, notification, and approval semantics.
- Runtime exec/plugin approvals could be confused with Opzava business approvals, even though the Q11 split says Opzava `Approval` wins business conflicts.
- Usage/cost and budget warnings could bypass ADR-014 billing/metering truth and become a debug-only overlay.
- Debug controls could accidentally mutate flags, runtime config, node pairing, or remediation scope without `AuthorizationPort`, approval gates, redaction, and audit.
- Ask Admin Opzava could investigate and remediate too broadly, turning an Incident into cross-tenant admin authority.

The solution is to ship a cohesive Admin Observability product slice for platform operators and authorized tenant admins. Opzava owns Incidents and their lifecycle/projections, notifications, alert rules, audit rows, tenant-visible redacted observability views, and debug bundle records in Postgres. OpenClaw remains harnessed for runtime health, logs, diagnostics, task/session snapshots, node/device signals, usage/cost observations, and exec/plugin approval surfaces through the broker ACL. Ask Admin Opzava uses these surfaces to investigate, summarize, propose remediation, and route permanent fixes into linked DevTickets, but approval, redaction, authorization, and one-target blast-radius limits stay Opzava-owned.

This PRD applies ADR-013, ADR-007, and ADR-014. It also depends on the locked Q4, Q7, Q8, Q9, Q11, and Q12 decisions in `docs/plan/grilling-decisions.md` without restating their architecture.

## Goals and Non-goals

### Goals

- Ship the Ask Admin Opzava observability surface across monitoring, logs, Dev Board Incidents projection, Activity, security audit, alerts, costs, and debug.
- Implement ADR-013 incident projections: normalized `ErrorGroup` incidents create or update one Incident identity and Dev Board Incidents projection per fingerprint lifetime.
- Keep platform Incidents at `tenantId = NULL`, distinct from tenant-visible redacted incident views.
- Provide tenant-visible incident, health, log, alert, and audit views only where `ErrorGroup.visibility` is `tenant_visible` or `tenant_redacted` and the query is tenant-scoped.
- Read OpenClaw logs, health, diagnostics, task/session state, Workboard diagnostics, usage/cost, and exec/plugin approvals only through the broker ACL.
- Normalize app, broker, Gateway, Workboard, task, health, usage/cost, and customer/admin-report sources into Opzava incidents, Activity, notifications, and audit.
- Preserve the Incident lifecycle Detected, Triaged, Mitigating, Monitoring, Resolved, and Postmortem independently of Dev Board lanes.
- Support monitoring metrics, service health, endpoint checks, node pairing state, recent alerts, and exportable health reports.
- Support live gateway/system log tailing with level/source filters, cursor controls, redaction, download/export policy, and incident correlation.
- Support the canonical Incident lifecycle Detected, Triaged, Mitigating, Monitoring, Resolved, and Postmortem, with lifecycle-appropriate filters and actions.
- Support Security & Audit approval summaries, pending approval decisions, users/roles visibility, role/session controls, and immutable audit export.
- Support Alerts & notifications with severity tabs, unread/read state, alert rules, delivery channels, push-safe payloads, and mark/read/dismiss flows.
- Support Costs as the admin cost/usage view tied to ADR-014 usage/metering and the deferred Finance ledger surface.
- Support Debug as a redacted, advanced diagnostics surface with run diagnostics, copy debug bundle, feature flags, orchestrator state, diagnostics, and raw effective config.
- Provide Ask Admin Opzava investigation and remediation proposal flows with dry-run-first, approval-gated, one-tenant/one-Gateway/one-operational-target blast radius.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw parity boundaries: what Opzava harnesses natively versus what Opzava owns.
- Define acceptance and testing decisions at user-visible and application-port seams.
- Flag net-new screens not covered by the named mockups.

### Non-goals

- Build or replace OpenClaw logging, diagnostics, health, node/device pairing, sessions, tasks, Workboard, usage, or exec/plugin approval internals.
- Read OpenClaw Gateway storage directly, store OpenClaw DTOs as Opzava domain rows, or bypass the ADR-003 broker ACL.
- Make GitHub, OpenClaw Workboard, raw logs, or an external tracker the source of truth for Opzava incidents.
- Make Incident a DevTicket Type, place Incidents in Sprints, or allow a Dev Board lane change to mutate Incident lifecycle.
- Build a full third-party observability suite, APM product, traces product, or source-map symbolication system in this PRD.
- Expose raw stack traces, request bodies, provider payloads, customer messages, secrets, cookies, tokens, channel content, Gateway-local config, or cross-tenant correlations in tenant-visible views.
- Let tenant users read platform Incident rows, other tenants' observability rows, or unredacted platform diagnostics.
- Let Ask Admin Opzava perform cross-tenant remediation, destructive operations, config/secret changes, queue drains, bulk repairs, or re-provisioning without the approval and confirmation rules from ADR-013.
- Let browser clients mutate feature flags, alert rules, node pairing, debug settings, remediation actions, role grants, or audit state without server-side authorization and audit.
- Replace ADR-014 billing, subscription, Stripe posting, invoice, dunning, entitlement, or plan-enforcement behavior.
- Publish this PRD, create GitHub work, or call GitHub.

## User Stories

1. As a platform operator, I want one Admin Observability area, so that monitoring, logs, incidents, alerts, audit, costs, and debug are not scattered across unrelated tools.
2. As a platform operator, I want Ask Admin Opzava to see the same admin context I see, so that it can summarize incidents and propose next steps with shared evidence.
3. As a platform operator, I want app, broker, Gateway, Workboard, task, health, usage, and customer-reported failures normalized into `ErrorGroup` incidents, so that every failure has one product lifecycle.
4. As a platform operator, I want each incident fingerprint to create or reopen one Incident record and projection, so that repeated errors do not create Incident storms.
5. As a platform operator, I want platform Incidents to use `tenantId = NULL`, so that cross-tenant operational incidents are clearly platform-owned.
6. As a tenant admin, I want tenant-visible error views to show only my tenant's redacted incidents, so that I can understand impact without seeing platform or other-tenant detail.
7. As a platform operator, I want `platform_only`, `tenant_visible`, and `tenant_redacted` visibility states, so that disclosure policy is explicit and auditable.
8. As a platform operator, I want redaction to happen before incident payload storage and forwarding, so that raw sensitive data is not recoverable through future views.
9. As a tenant admin, I want a tenant-redacted incident to explain customer impact and safe status, so that I do not need raw stack traces to act.
10. As a platform operator, I want a heartbeat watchdog Incident when error ingest goes quiet, so that the pipeline going blind is itself visible.
11. As a platform operator, I want unnormalizable observations to land in a dead-letter sink, so that bad telemetry is counted without corrupting ordinary incident flow.
12. As a platform operator, I want incident thresholds, cooldowns, per-tenant caps, per-gateway caps, and platform caps, so that one noisy source cannot flood the Incidents view.
13. As a platform operator, I want Incident projections to show severity, lifecycle state, count, first seen, last seen, affected service, tenant/Gateway where allowed, owner, SLA, and customer impact, so that triage is fast.
14. As a platform operator, I want recurrence after resolution to reopen the same Incident, so that historical context is preserved.
15. As a platform operator, I want Ask Admin Opzava to read logs, diagnostics, health, task snapshots, usage/cost, Workboard diagnostics, audit, and Activity through approved ports, so that investigation stays within policy.
16. As a platform operator, I want Ask Admin Opzava to propose `RemediationAction` records, so that fixes are reviewed before execution.
17. As a platform operator, I want low-risk remediation limited to notify, label, summarize, request data, and draft, so that Ask Admin Opzava does not mutate runtime casually.
18. As a platform operator, I want medium and higher remediation to require approval, so that restarts, redispatch, route repair, and projector replay are deliberate.
19. As a platform operator, I want destructive remediation to require two-step human confirmation, so that data-affecting changes cannot happen accidentally.
20. As a platform operator, I want every remediation to be dry-run-first where supported, so that the expected effect is visible before execution.
21. As a platform operator, I want remediation blast radius limited to one tenant, one Gateway, or one operational target, so that a bad action cannot cross tenants.
22. As an auditor, I want every remediation to record acting human, Ask Admin Opzava actor, admin-token job ref, before/after state, approval refs, runtime refs, and result, so that platform action is reconstructable.
23. As a platform operator, I want Monitoring to show live connection state and last update age, so that stale telemetry is obvious.
24. As a platform operator, I want Monitoring metrics for CPU usage, memory, events/sec, and p95 latency, so that the fleet's health is scannable.
25. As a platform operator, I want metric cards to show loading, stale, and last-sync states, so that async collection failures do not look healthy.
26. As a platform operator, I want service health rows for API server, Gateway, Database, Memory store, and Event queue, so that core dependencies are visible.
27. As a platform operator, I want health status labels such as Operational, Slow, Degraded, Offline, Unknown, and Stale, so that health is not color-only.
28. As a platform operator, I want endpoint checks for `/api/health`, `/api/gateways/health`, `/api/memory/health`, `/api/status`, and `/api/agents/health`, so that user-visible checks map to concrete probes.
29. As a platform operator, I want health endpoints polled on a visible cadence, so that I understand freshness and latency.
30. As a platform operator, I want recent alerts on Monitoring to link to agent, gateway, costs, Incident, or linked remediation DevTicket detail, so that investigation starts from the alert.
31. As a platform operator, I want node pairing and node health on Monitoring, so that approved hosts and awaiting-pairing devices are visible.
32. As an owner, I want node pairing and command-scope changes to require approval, so that new runtime surfaces cannot self-authorize.
33. As a platform operator, I want a system log section on Monitoring, so that the last health events can be read without opening the full Logs page.
34. As a platform operator, I want health report export, so that operational snapshots can be attached to incidents or audits.
35. As a platform operator, I want Logs to tail live fleet, Gateway, and system logs, so that current runtime behavior is visible.
36. As a platform operator, I want Logs filters for text, level, and source, so that I can isolate a failure quickly.
37. As a platform operator, I want log levels All, Info, Warn, and Error, so that severity filtering matches the mockup.
38. As a platform operator, I want log sources All sources, Agents, Gateway, and System, so that runtime and app logs can be separated.
39. As a platform operator, I want log rows to include timestamp, level, source, message, cursor, runtime ref, tenant ref where allowed, and redaction metadata, so that log evidence can be correlated safely.
40. As a platform operator, I want live tailing to be toggleable, so that I can pause a stream while investigating.
41. As a platform operator, I want log download/export to be authorization-gated and redacted, so that support bundles do not leak secrets.
42. As a platform operator, I want log rows to link to related Incident groups when available, so that logs and Incidents stay connected.
43. As a platform operator, I want ACL log failures to render as GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, RateLimited, StaleCursor, and RedactionFailed states, so that failure modes are actionable.
44. As a tenant admin, I want tenant log views to show only tenant-scoped safe log excerpts, so that runtime state is debuggable without platform leakage.
45. As a platform operator, I want Dev Board Incidents to show Detected, Triaged, Mitigating, Monitoring, Resolved, and Postmortem state with mitigation progress, so that operational failures are easy to route without becoming Sprint work.
46. As a platform operator, I want Incident filters for lifecycle state, severity, owner, source, affected tenant/service, and remediation linkage, so that I can focus investigation without inventing a development-work funnel.
47. As a platform operator, I want each lifecycle transition to expose only valid next actions and require a reason/evidence where policy demands it, so that Incident history is coherent.
48. As a platform operator, I want Incident projections to appear in Dev Board with number, title, severity, owner, updated age, lifecycle state, and mitigation status, so that operational incidents are visible beside development work without becoming DevTickets.
49. As a platform operator, I want Incident projections to carry severity, source/bounded-context, visibility, and lifecycle labels, so that handoff is explicit without reusing DevTicket readiness labels.
50. As a platform operator, I want a permanent code/configuration fix to create or link a Bug or Technical Task DevTicket, so that remediation follows normal Ready, dependency, Review, and merge gates.
51. As a platform operator, I want the Incident to show linked remediation DevTicket status without allowing DevTicket changes to mutate Incident lifecycle automatically, so that both sources remain authoritative for their own facts.
52. As a platform operator, I want Incident ownership assigned to humans, AI employees, or unassigned, so that Ask Admin Opzava can investigate safe work and humans can see needs-you work.
53. As a platform operator, I want Incident detail to show the backing `ErrorGroup`, lifecycle timeline, events, logs, alerts, mitigation, remediation proposals, linked DevTickets, comments, Activity, and audit, so that investigation has full context.
54. As a platform operator, I want Security & Audit to summarize pending approvals, approved today, and denied today, so that the control plane state is visible.
55. As an approver, I want pending approvals to show action, requester, risk, age, and Approve/Deny, so that decisions are fast but informed.
56. As an approver, I want money approvals such as "Spend $200 on Meta Ads" to remain Opzava business approvals, so that runtime gates cannot override Finance policy.
57. As an approver, I want platform remediation approvals to show blast radius, dry-run result, affected tenant/Gateway, before/after preview, and audit refs, so that I can assess risk.
58. As an approver, I want stale or changed approval payloads to disable decision buttons, so that I cannot approve an obsolete action.
59. As an approver, I want runtime exec/plugin approvals clearly labeled as runtime gates, so that I do not confuse them with business approvals.
60. As an owner, I want Users & roles to show person, role, access scope, two-factor status, last active, and pending invites, so that admin access can be reviewed.
61. As an owner, I want role matrix and manage sessions entry points, so that RBAC and session revocation controls are discoverable.
62. As an owner, I want every role/session/security setting command to run through `AuthorizationPort`, so that stale UI state cannot grant access.
63. As an auditor, I want Audit trail rows to include time, actor, action, target, result, source, tenant, runtime refs where allowed, and payload hash, so that control-plane events are reconstructable.
64. As an auditor, I want audit exports to be authorized, redacted, and retained by policy, so that reviews do not leak sensitive payloads.
65. As a platform operator, I want Activity to show a live human-readable feed across the fleet, so that business-level events are visible without raw logs.
66. As a platform operator, I want Activity filters All activity, Agents, Approvals, and System, so that the feed can focus on relevant event types.
67. As a platform operator, I want Activity to distinguish human, AI employee, and system actors with text and accessible labels, so that accountability is clear.
68. As a platform operator, I want Activity events for task completion, approvals, drafts, schedules, reports, usage sync, incident creation, alert routing, remediation proposals, and debug bundle generation, so that operational history is easy to scan.
69. As a platform operator, I want Alerts & notifications to show unread counts and severity tabs, so that urgent events rise above routine updates.
70. As a platform operator, I want notification severities Critical, Warning, Info, Done, and read/unread states, so that delivery urgency is explicit.
71. As a platform operator, I want notification actions such as View agent, Check gateway, Review spend, View task, Dismiss, and Update now, so that alerts point to next steps.
72. As a platform operator, I want alert rules with rule name, condition, severity, delivery channel, enabled state, owner, cooldown, and escalation, so that routing is governed.
73. As a platform operator, I want alert rules for Agent offline, Budget threshold, Agent budget exceeded, Task failure spike, ErrorGroup severity, Gateway down, pipeline heartbeat missing, and approval backlog, so that common admin risks are covered.
74. As a platform operator, I want alert delivery through configured Slack, Email, in-app, and Web Push channels, so that notifications reach the right operator without storing ad hoc recipient secrets.
75. As a privacy reviewer, I want push and external alert payloads to avoid sensitive data and fetch details on open, so that background notifications do not leak.
76. As a platform operator, I want Costs to show period, budget, remaining, transaction count, chart of accounts, transactions, and budget meter, so that usage/cost warnings link to an understandable cost surface.
77. As a platform operator, I want Costs to distinguish ADR-014 `UsageMeter`/`MeterEvent`/`Invoice` billing truth from the deferred Finance ledger surface's expense-ledger truth, so that platform spend and tenant bookkeeping are not conflated.
78. As a platform operator, I want budget alerts to derive from metering and plan policy, so that budget threshold notifications are enforceable.
79. As a platform operator, I want Debug to warn that it is advanced internal state, so that users understand the risk of changes.
80. As a platform operator, I want Debug sections for System, Feature flags, Orchestrator state, Diagnostics, and Raw config, so that common diagnostic state is one page.
81. As a platform operator, I want Raw config to be redacted by default, so that copied debug bundles cannot expose secrets.
82. As a platform operator, I want Copy debug bundle to include build, environment, health, feature flag state, orchestrator state, diagnostics, redacted config, related incident refs, and correlation ids, so that support has enough evidence.
83. As a platform operator, I want Run diagnostics to create a durable diagnostics run, so that debug checks are auditable and repeatable.
84. As an owner, I want feature flag changes, raw config reveals, node pairing, and diagnostics commands to require authorization and audit, so that debug does not become a back door.
85. As a platform operator, I want Debug to show `Gateway reachable`, provider auth, database, disk, and memory checks, so that runtime prerequisites are clear.
86. As a platform operator, I want Debug orchestrator state to show queue depth, in-flight tasks, account capacity, model-tier seed, last decomposition, and lead session, so that Ask Admin Opzava can explain orchestration bottlenecks.
87. As a platform operator, I want tenant suspension or entitlement loss to block runtime starts and show in monitoring/debug, so that ADR-014 dunning state is visible operationally.
88. As a tenant admin, I want forbidden observability views to return 403 rather than empty results, so that missing tenant context is not mistaken for healthy state.
89. As a screen-reader user, I want logs, monitoring, alerts, approvals, incidents, costs, and debug tables to expose captions and semantic labels, so that admin workflows are usable without visual scanning.
90. As a keyboard user, I want filters, tabs, switches, approval buttons, Incident rows/actions, alert rules, debug disclosures, and exports to work without a mouse, so that admin workflows are accessible.
91. As a product operator, I want every admin screen to render loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, approval required, and retry states, so that async reality is normal UX.
92. As a developer, I want observability behavior tested through application ports, command handlers, projection writers, route/server-action seams, and UI composition, so that the product contract is protected without coupling tests to OpenClaw internals.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `activity.html` | Live business-level fleet feed titled `Activity` with subtitle `Everything happening across the fleet`, filters for All activity/Agents/Approvals/System, live status, grouped Today/Yesterday events, human/AI/system actor treatment, and footer count. Activity is an Opzava projection fed by incidents, approvals, workflow runs, task/session summaries, usage sync, alerts, debug runs, and remediation events. It is not a raw log stream. |
| `logs.html` | Live log explorer titled `Logs` with subtitle `Live fleet, gateway, and system logs`, OpenClaw logging reference, Download action, text filter, level tabs All/Info/Warn/Error, source filter All sources/Agents/Gateway/System, live tail switch, newest-first log rows, and footer cursor/count hint. Gateway/runtime logs are read via the broker ACL, redacted, cursored, source-scoped, and correlated to `ErrorGroup` where possible. |
| `monitoring-health.html` | Monitoring page titled `Monitoring` with live/updated state, Reconnect affordance, Export report, metric cards for CPU Usage, Memory, Events/sec, p95 Latency, Service health, Recent alerts, Health endpoints, Nodes, and collapsible System log. Metrics combine Opzava app/projection health with OpenClaw `health`, `diagnostics.stability`, node/device, task/session, and usage/cost observations through ports. Node pairing and command scope changes require owner approval. |
| `security-audit.html` | Governance page titled `Security & Audit` with subtitle `Approvals & audit trail`, Export audit log, Security settings, approval summary cards, Pending approvals table, Users & roles table, Role matrix, Manage sessions, and Audit trail. It must merge Opzava business approvals, platform remediation approvals, node pairing approvals, and mirrored runtime approval state while preserving the split: Opzava business approval wins conflicts, OpenClaw exec/plugin approvals are runtime gates. |
| `costs.html` | Costs page titled `Costs` with subtitle `Expense bookkeeping - all service costs`, accounting period controls, Export, Add cost source, period summary, budget meter, By account chart, and Transactions ledger. For this PRD, Costs is the admin entry point for budget/usage alert context and ADR-014 metering state; Finance ledger authority and expense bookkeeping details remain in the deferred Finance ledger surface. Usage/cost observations from OpenClaw enrich the view but are not direct raw Gateway state. |
| `debug.html` | Debug page titled `Debug` with subtitle `Advanced internal diagnostics`, Run diagnostics, Copy debug bundle, advanced warning, disclosures for System, Feature flags, Orchestrator state, Diagnostics, and Raw config. Raw config must be redacted, debug bundles must omit secrets, and every mutating debug action must be owner/admin authorized, approval-gated where risky, and audited. |
| `notifications-alerts.html` | Alerts & notifications page titled `Alerts & notifications` with subtitle `Severity-tiered notifications and configurable alert rules`, Add alert rule, Notification center with unread counts and severity tabs, notification actions, empty/loading/error states, Alert rules table, enabled switches, and delivery-channel hint. It is the user-facing projection of ADR-013 alert routes plus Q7 notification/push delivery, with safe payloads and fetch-on-open detail. |
| `issues.html` | **Superseded target.** The historical standalone Issues mockup informs migration only. Its incident data moves to the Dev Board Incidents view, whose rows deep-link to the separate `ErrorGroup`/Incident detail and lifecycle. GitHub-backed development work is governed by PRD-019 instead. |

Net-new screens to design:

- Ask Admin Opzava admin chat/investigation detail for incident context, evidence citations, proposed remediation, dry-run output, approval state, and audit refs.
- Incident/ErrorGroup detail for group summary, lifecycle timeline, events, fingerprints, visibility, redacted payload samples, related logs, alerts, tenant impact, linked DevTickets, and remediation actions.
- Dev Board Incidents view for platform-ops `tenantId = NULL` Incidents, with filters by severity, lifecycle state, source, tenant impact, owner, SLA, and recurrence.
- Tenant-visible incident center for redacted per-tenant incidents, health impact, safe timeline, support links, and disclosure state.
- Remediation action detail/approval screen for blast radius, dry-run, before/after, idempotency key, runtime refs, approval requirement, execution status, and rollback notes.
- Alert rule builder for condition selection, severity, route, delivery channels, cooldown, escalation, tenant/platform scope, and test notification.
- Log detail/correlation drawer for redacted payload metadata, source cursor, tenant/source scope, related ErrorGroup, related task/session, and copy-safe excerpt.
- Debug bundle history for generated bundles, redaction result, included sections, requester, download auth, expiry, and audit.
- Node pairing/detail screen for device identity, approved commands, last heartbeat, command scope changes, owner approval, and audit.
- Audit event detail screen for payload hash, actor chain, authorization decision, runtime refs, redaction, and retention/export status.
- Observability settings screen for retention, redaction policy, alert defaults, notification routes, incident thresholds, cooldowns, caps, and platform-only controls.

## Functional requirements

### Incident pipeline and Dev Board projection

- Notifications/Admin-Observability must own incident/error groups, error events, alert routes, notifications, remediation actions, Dev Board Incident projections, dead-letter records, and tenant-visible redacted observability views.
- Incident capture must enter through `ErrorCapturePort` or approved projector/application-service paths.
- Incident sources must include app reporters, broker/ACL errors, OpenClaw runtime observations through the ACL, Workboard diagnostics through the ACL, usage/cost spikes, health degradation, and manual customer/admin reports.
- `ErrorGroup` must include fingerprint, severity, count, firstSeen, lastSeen, status, optional tenant/project/agent/gateway refs, visibility, cooldown/cap metadata, and lifecycle/audit metadata.
- `ErrorEvent` must include group ref, source, occurred timestamp, redacted payload, optional opaque OpenClaw refs, ingest metadata, source idempotency key, and redaction version.
- `ErrorGroup.visibility` must support `platform_only`, `tenant_visible`, and `tenant_redacted`.
- Platform Incident projections must use `tenantId = NULL` and must not be readable by tenant-scoped users.
- Tenant-visible incident projections must be tenant-scoped and must include only safe details for `tenant_visible` or `tenant_redacted` groups.
- One fingerprint must create one Incident identity for its lifetime; recurrence after resolution reopens the same Incident.
- The Dev Board Incident projection must preserve Incident lifecycle state, severity, owner, SLA, customer impact, related tenant/Gateway refs where allowed, comments, Activity, and links back to the `ErrorGroup`.
- Incident creation must apply ADR-013 anti-storm controls: severity-critical immediate creation, configurable threshold for lower severity, per-fingerprint cooldown, per-tenant cap, per-Gateway cap, and platform cap.
- Suppressed events must increment counts, update lastSeen, and contribute to digests/alerts without creating new Incidents.
- A heartbeat watchdog must create or reopen a non-suppressible platform Incident if the error pipeline receives no `ErrorEvent` within the configured blind-window.
- Unnormalizable observations must write minimal redacted dead-letter records and emit count/audit signals without creating ordinary Incidents directly.
- Fingerprints must normalize service, route, exception type, message, runtime source, and safe Gateway/task/tool class data while stripping high-cardinality and sensitive values.
- Redaction must happen before storage, dead-letter write, outbox emission, notification, Incident projection, export, debug bundle inclusion, or adapter forwarding.

### Ask Admin Opzava investigation and remediation

- Ask Admin Opzava must use the platform-ops Admin assistant identity and must operate only through approved application services and ports.
- Ask Admin Opzava may inspect incident summaries, redacted events, logs.tail, diagnostics.stability, health, task/session snapshots, Workboard diagnostics, usage/cost projections, Activity, audit, and Incident context where authorized.
- Ask Admin Opzava may summarize, label, request more data, draft comments, suggest owners, draft linked remediation DevTickets, and propose remediation without approval when the action is low risk. Promoting a draft remediation DevTicket follows PRD-019 authorization and readiness rules.
- Mutating remediation must create a `RemediationAction` before execution.
- `RemediationAction` must include group ref, kind, blast-radius class, target scope, status, dry-run result, approval refs, idempotency key, actor/admin-token audit refs, before/after metadata, runtime refs, and execution result.
- Medium or higher blast-radius remediation must require an Opzava approval before execution.
- Destructive remediation must require two-step human confirmation in addition to any required approval.
- Cross-tenant remediation as one action must be rejected.
- Remediation targets must be scoped to one tenant, one Gateway, one route, one projector, one task/run, one node, or one explicit operational target.
- Runtime mutations must use the audited platform-ops job path with the admin/provisioning credential where needed; browser handlers and broker hot paths must not hold admin mutation authority.
- Every remediation execution must re-check authorization, approval state, target currentness, tenant lifecycle, entitlement, idempotency, and blast-radius constraints.
- Remediation success/failure must update the Incident, Dev Board projection, Activity, notifications, and audit.

### Monitoring and health

- Monitoring must show live connection state, last update age, reconnect affordance, and stale/offline states.
- Monitoring metric cards must show CPU Usage, Memory, Events/sec, and p95 Latency with value, trend, last sync, loading state, stale state, and accessible labels.
- Service health must track API server, Gateway, Database, Memory store, Event queue, and future service categories through configured health probes.
- Health statuses must include Operational, Slow, Degraded, Offline, Unknown, Stale, and Forbidden.
- Health endpoint rows must include endpoint, status, latency, last checked, probe source, and safe failure reason.
- Endpoint checks must include at least `/api/health`, `/api/gateways/health`, `/api/memory/health`, `/api/status`, and `/api/agents/health`.
- Recent alerts must show severity, title, safe summary, time, related target, and action link.
- Node monitoring must show node name, kind, approved commands, health, last seen, pairing state, and actions.
- Pairing approval and command-scope changes must write approval/audit rows and must not be performed by raw Debug state.
- Health report export must generate an authorized, redacted artifact with metric snapshot, probe statuses, alert summaries, node status, incident refs, and generated-by audit.

### Logs

- Logs must support live tail, pause/resume, text filter, level filter, source filter, cursor/window controls, and newest-first rendering.
- Log sources must include app/system, broker, Gateway, agent/session, task/run, Workboard diagnostics, provider adapter, and metering worker categories where available.
- OpenClaw logs must be accessed only through broker ACL read-through or approved projection workers.
- Log rows must include timestamp, level, source, safe message, cursor/ref, tenant scope where allowed, runtime refs where allowed, redaction state, and incident correlation.
- Tenant-visible logs must be tenant-scoped, redacted, and subject to `AuthorizationPort` and RLS.
- Log download must be authorized, redacted, bounded by time/size/source limits, and audited.
- Logs must degrade with GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, RateLimited, StaleCursor, SourceUnavailable, RedactionFailed, and RetryExhausted states.
- Raw provider payloads, secrets, tokens, request bodies, customer messages, channel payloads, and Gateway-local config values must never be exposed in ordinary log rows.

### Incidents projection and remediation links

- Dev Board Incidents must project Incident identity, severity, lifecycle state, owner, customer impact, last occurrence, mitigation state, and linked remediation DevTickets without copying Incident workflow into Dev Board lanes.
- Incident commands must use Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem and remain owned by Notifications/Admin-Observability.
- Incidents are never Sprint members. A permanent fix creates or links a normal DevTicket of Type Bug or Technical Task, which must pass the ordinary Ready, dependency, review, and merge gates.
- An incident projection may expose an optional GitHub reference, but GitHub is not Incident authority. GitHub development facts for linked remediation work follow ADR-017.
- Incident detail must show backing `ErrorGroup`, source events, related logs, alerts, remediation actions, Activity, comments, assignments, audit, and linked DevTickets.
- Ask Admin Opzava may investigate or propose remediation only within its authorized low-risk or approval-gated scope; it cannot convert an incident into broad admin authority.
- An authorized Incident coordination request must be redacted and bind exact Incident version,
  affected refs, requested action/priority, evidence ref, source audit, idempotency, and expiry. Dev
  Board may accept it as a selection hold or approval-gated pause request only; it must not import
  Incident lifecycle, infer approval, or represent the Incident as Sprint work.
- Incident Resolved/reopened and linked remediation DevTicket Done are correlation facts only. They
  may prompt Dev Board reevaluation, but only the current proof-gated `ResumeSprint` command may
  restart selection.

### Security audit, approvals, users, and roles

- Security & Audit must summarize pending approvals, approved today, and denied today.
- Pending approvals must show action, requested by, risk, age, and decision actions.
- Approval rows must include business approvals, remediation approvals, node pairing approvals, role/session/security approvals where configured, and mirrored runtime approvals with explicit type labeling.
- Opzava `Approval` remains source of truth for business approvals; OpenClaw exec/plugin approvals are runtime gates mirrored by ref.
- Business conflict must resolve in favor of Opzava; a runtime approval cannot override an Opzava denial or missing business approval.
- Approve/Deny must re-check authorization, current state, payload hash, target currentness, expiry, policy, and idempotency.
- Approval decisions must write immutable audit and update Activity/notifications where applicable.
- Users & roles must show people, role, access scope, two-factor status, last active, pending invite state, and management actions.
- Role matrix and session management actions must run through `AuthorizationPort`, use active tenant context, and fail closed with 403 on missing/mismatched tenant.
- Audit trail rows must include time, actor, actor type, action, target, result, source, target refs, tenant, payload hash, and runtime refs where allowed.
- Audit export must be authorized, redacted, retained by policy, and audited.
- Role/membership/session changes must revoke stale access according to ADR-007 and auth decisions in the grilling log.

### Activity, notifications, and alert rules

- Activity must be an Opzava-owned product feed projection, not a raw log table.
- Activity must include human, AI employee, and system actors with accessible labels and actor refs.
- Activity event classes must include task/session lifecycle, workflow runs, approvals, Incident changes, alerts, usage sync, cost warnings, debug runs, node pairing, remediation, security changes, and exports.
- Notifications must support unread/read state, severity, safe summary, timestamp, action links, mark all read, dismiss, loading, empty, and error states.
- Notification severities must support Critical, Warning, Info, Success/Done, and future route-specific severities.
- Alert rules must include name, condition, severity, delivery channel, enabled state, owner, scope, cooldown, escalation, and audit.
- Alert conditions must support agent offline, budget threshold, agent budget exceeded, task failure spike, incident severity/count, Gateway down, health slow/degraded, pipeline heartbeat missing, approval backlog, metering failure, and source-specific predicates admitted by policy.
- Alert delivery must use configured integration channels and user notification preferences; manual destination secrets must not be stored in alert rows.
- Push and external notifications must use safe payloads and fetch details on open.
- Alert routing must respect tenant/platform scope, visibility, role grants, quiet hours/preferences where configured, cooldowns, and escalation policy.

### Costs and usage/cost touchpoints

- Costs must show period navigation, period totals, budget, remaining, transaction count, budget meter, chart of accounts, and transactions as defined in the deferred Finance ledger surface.
- For Admin Observability, budget threshold and budget-exceeded alerts must derive from ADR-014 `UsageMeter`, `MeterEvent`, plan limits, workflow budgets, and Finance/ledger projections where applicable.
- OpenClaw `usage.cost`, `usage.status`, and `sessions.usage*` observations must be ingested through the broker ACL and metering/projector paths.
- Usage/cost spikes may create incidents, alerts, Activity rows, and Costs links.
- Costs must not expose raw OpenClaw usage payloads or Stripe internals in ordinary admin UI.
- Tenant suspension, delinquency, quota overage, and entitlement blocks must appear as operational states in Monitoring, Alerts, Debug, Activity, and Audit where relevant.

### Debug and diagnostics

- Debug must render an advanced warning before diagnostic controls.
- Debug must include System, Feature flags, Orchestrator state, Diagnostics, and Raw config sections.
- System diagnostics must show version/build, runtime, database adapter/status, uptime, environment, data dir/path class where safe, and generated-at time.
- Feature flags must show flag id, enabled state, behavior, scope, source, and last-changed metadata.
- Mutating feature flags must require authorization, policy, audit, and approval when the flag affects runtime safety, tenant isolation, billing, secrets, or admin access.
- Orchestrator state must show queue depth, in-flight tasks, account capacity, model-tier seed, last decomposition, lead session, and degraded state.
- Diagnostics must include Gateway reachable, provider auth, database, disk, memory, broker, metering, projection lag, outbox, redis/realtime, and error-pipeline heartbeat checks where implemented.
- Raw config must always be redacted; secrets must appear only as redaction markers or secret refs.
- Copy debug bundle must create a durable, authorized, redacted bundle with included sections, correlation ids, incident refs, requester, expiry, and audit.
- Run diagnostics must create a diagnostics run record, execute bounded checks through ports, update Activity/notifications when relevant, and audit results.
- Debug must not allow browser clients to call OpenClaw admin config, Docker/runtime, provider secrets, or raw Gateway config directly.

### Authorization, redaction, and retention

- Every admin observability read and command must run through tenant/platform authorization and resource checks.
- Tenant-table reads and writes must use the ADR-007 tenant-context/RLS posture and must fail closed as 403 when context is missing or mismatched.
- Platform-only Incident and debug rows must require platform-ops authorization and must not be returned to tenant-scoped queries.
- Browser-supplied tenant ids, gateway ids, runtime refs, Incident ids, approval refs, DevTicket refs, cursor refs, and source filters are hints only; server code must reload authoritative state.
- Redaction must be centralized and versioned for errors, logs, notifications, debug bundles, exports, activity, and audit display.
- Retention must be configurable by event class and visibility, with immutable audit retained according to policy.
- Export actions must be authorized, redacted, bounded, and audited.

### Accessibility and responsive behavior

- Monitoring metrics, health rows, log streams, incident tables, approval tables, user/role tables, audit rows, notification lists, alert rules, costs tables, and debug disclosures must have semantic labels or captions.
- Color must not be the only indicator for severity, health, approval risk, Incident lifecycle state, budget state, or debug warning state.
- Keyboard users must be able to operate filters, tabs, switches, disclosures, approvals, exports, Incident transitions/actions, linked DevTicket actions, notification actions, and debug controls.
- Mobile layouts must preserve severity, target, age/freshness, status, action, and authorization state without hiding the primary decision/action context.

## Data and API touchpoints

| Touchpoint | Owning bounded context | Product data / behavior | Ports |
| --- | --- | --- | --- |
| Error capture | Notifications/Admin-Observability | `ErrorGroup`, `ErrorEvent`, fingerprinting, visibility, redaction, dead-letter, watchdog | `ErrorCapturePort`, `EventBusPort`, `AuthorizationPort` |
| Dev Board Incident projection | Notifications/Admin-Observability with Dev Board consumer | Read-only projection of `ErrorGroup` identity, lifecycle, severity, owner, SLA, recurrence, mitigation, and linked remediation DevTickets | Incident query/application port, `EventBusPort`, `AuthorizationPort` |
| Tenant-visible incident views | Notifications/Admin-Observability | Redacted tenant incident projections, safe impact summaries, disclosure state | Incident query port, `AuthorizationPort` |
| Ask Admin Opzava investigation | AI Workforce plus Platform-Ops | Admin assistant sessions, incident summaries, evidence, proposals | AI Workforce application service, broker ACL port, `AuthorizationPort` |
| Remediation actions | Notifications/Admin-Observability plus Tenant Provisioning/Platform-Ops | `RemediationAction`, dry-run, approval, execution, admin-token audit | Remediation application service, `GatewayRuntimePort` where runtime mutation is needed, broker ACL port, `AuthorizationPort` |
| OpenClaw health | Notifications/Admin-Observability | Gateway health, diagnostics stability, service status projections | Broker ACL / `OpenClawGatewayPort`, `RealtimeTransportPort` |
| App/service health | Tenant Provisioning/Platform-Ops | API, database, event queue, broker, projection, metering, runtime health probes | Health check application service, `EventBusPort` |
| Node pairing and health | Tenant Provisioning/Platform-Ops | Node/device pairing, approved commands, heartbeat, command scope | Node/device application service, broker ACL/admin job path, `AuthorizationPort` |
| Live logs | Notifications/Admin-Observability | Cursor-based redacted log tail, level/source filters, correlation | Broker ACL / `OpenClawGatewayPort`, log read service, `AuthorizationPort` |
| Log exports | Notifications/Admin-Observability | Bounded redacted log bundle artifacts and audit | `ObjectStorePort`, log export service, `AuthorizationPort` |
| Incidents view | Notifications/Admin-Observability with Dev Board consumer | Incident projections, lifecycle state, owner, mitigation, sync/health state, linked remediation DevTickets | Incident query port, `AuthorizationPort` |
| Business and remediation approvals | Department Workflows/Approvals plus Notifications/Admin-Observability | `Approval` lifecycle, pending approval rows, decision audit | Approval application service, `AuthorizationPort`, `EventBusPort` |
| Runtime approval mirrors | AI Workforce through broker ACL | Exec/plugin approval observations and mirrored refs | Broker ACL / OpenClaw approval RPCs, approval mirror projector |
| Users and roles | Identity & Access | `Membership`, `RoleGrant`, invitations, session management, role matrix | `AuthPort`, `AuthorizationPort` |
| Audit trail | Identity & Access plus Notifications/Admin-Observability | Immutable control-plane audit rows and export projections | Audit log application service, `ObjectStorePort`, `AuthorizationPort` |
| Activity feed | Internal Collaboration/Activity plus Notifications/Admin-Observability | Product-level fleet feed events and actor attribution | Activity projection service, `RealtimeTransportPort`, `EventBusPort` |
| Notifications | Notifications/Admin-Observability | Notification center rows, unread state, safe payloads, delivery state | Notification application service, `PushNotificationPort`, `RealtimeTransportPort` |
| Alert rules | Notifications/Admin-Observability | `AlertRoute`/alert rule conditions, routing, cooldown, escalation | Alerting application service, `PushNotificationPort`, `EventBusPort`, integration delivery ports |
| Usage/cost alerts | Finance and Billing plus Notifications/Admin-Observability | `MeterEvent`, `UsageMeter`, cost thresholds, budget alerts, overage signals | Metering service, `BillingPort`, broker ACL usage/cost reader |
| Costs page data | Finance plus Finance and Billing | Finance ledger read models, chart accounts, usage/cost evidence, budget context | Finance ledger service, metering service, `BillingPort`, `AuthorizationPort` |
| Debug system state | Tenant Provisioning/Platform-Ops | System diagnostics, feature flags, orchestrator state, redacted config | Diagnostics service, feature flag service, `SecretsVaultPort`, `AuthorizationPort` |
| Debug bundle | Tenant Provisioning/Platform-Ops plus Notifications/Admin-Observability | Redacted support bundle artifact, expiry, included sections, audit | `ObjectStorePort`, diagnostics service, `SecretsVaultPort`, `AuthorizationPort` |
| Realtime updates | Realtime/Notifications | Live monitoring, logs, Activity, approvals, notifications, Incident lifecycle/mitigation updates, linked DevTicket summaries | `RealtimeTransportPort`, `EventBusPort` |

## OpenClaw-parity notes

| Surface / capability | Classification | Native harnessed through OpenClaw | Opzava-owned product authority |
| --- | --- | --- | --- |
| Runtime logs | OpenClaw-native (harness) | `logs.tail` with cursor, limit, source, byte controls through broker ACL | Redaction, tenant/platform visibility, downloads, correlation, incident links |
| Runtime health | Hybrid | `health`, `diagnostics.stability`, task/session health, Gateway status | Monitoring read models, service health, alerts, Activity, exports |
| Task/session snapshots | Hybrid | `tasks.list/get`, session summaries, task-ledger failed/timed_out/cancelled/lost | Incident projection, Activity, Dev Board Incidents, remediation proposal context |
| Workboard diagnostics | Hybrid | Workboard failure flags and task/work diagnostics as source observations | Opzava Incident projection and remediation workflow; Workboard is not source of truth |
| Exec/plugin approvals | Hybrid | OpenClaw `exec.approval.*` and `plugin.approval.*` runtime gates | Opzava business `Approval`, conflict resolution, Security & Audit rows, audit |
| Usage/cost observations | Hybrid | `usage.cost`, `usage.status`, `sessions.usage*` | ADR-014 metering, quotas, alerts, Finance ledger touchpoints, Costs UI |
| Node/device signals | Hybrid | Node/device presence, pairing/runtime command surfaces where available | Pairing approval, command scope policy, node table, audit |
| Error grouping | Opzava-owned | OpenClaw errors/logs/diagnostics are inputs only | `ErrorGroup`, `ErrorEvent`, visibility, dedupe, anti-storm, Incident projection |
| Alert rules | Opzava-owned | Runtime observations can trigger rules | `AlertRoute`, notification rows, delivery policy, cooldowns, escalation |
| Notifications and Activity | Opzava-owned | Runtime events may be projected as hints | Durable notification center, Activity feed, push-safe payloads |
| Debug bundles | Opzava-owned | Runtime diagnostics/config summaries are read through ports | Redacted bundle composition, export auth, retention, audit |
| Remediation execution | Hybrid | Gateway/task/runtime mutations through approved runtime/admin paths | `RemediationAction`, approval, dry-run, blast-radius policy, audit |
| Dev Board Incidents projection | Opzava-owned projection | OpenClaw Workboard may be diagnostic source only | `tenantId = NULL` Incident projection; Incident lifecycle remains Notifications/Admin-Observability-owned |

## Acceptance criteria

- `docs/prd/PRD-012-admin-observability.md` references ADR-013, ADR-007, and ADR-014 and covers the named mockup screens.
- A captured critical app/broker/Gateway error creates or reopens one Incident with `tenantId = NULL`, a backing `ErrorGroup`, redacted payload, and Dev Board Incident projection.
- A repeated non-critical error below threshold increments `ErrorGroup.count` without creating a new Incident identity.
- A post-resolution recurrence reopens the existing Incident rather than creating a new identity.
- Incident transitions permit only Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem (plus explicitly governed reopen), preserve actor/reason/evidence, and never map through Dev Board work lanes.
- An Incident is never Sprint-eligible and never persisted as a DevTicket Type; permanent remediation creates or links a Bug or Technical Task DevTicket whose lifecycle remains independent.
- A tenant admin cannot read platform Incident rows or other-tenant incident/log/debug data.
- A tenant-visible incident view contains only tenant-scoped, redacted details and safe impact/status.
- Missing or mismatched tenant context returns 403, not `200` with an empty list.
- Raw secrets, tokens, cookies, provider keys, request bodies, customer messages, channel payloads, and Gateway-local config never appear in stored error payloads, log exports, notifications, debug bundles, or ordinary UI.
- Logs tail through the broker ACL with level/source/text filters and render GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, RateLimited, StaleCursor, and retry states.
- Monitoring renders live/stale/offline states, metrics, service health, recent alerts, endpoint checks, nodes, and system log with accessible labels.
- Node pairing and command-scope changes require owner/admin authorization, approval where policy requires it, and audit.
- Security & Audit displays business approvals, remediation approvals, and runtime approval mirrors without conflating Opzava business approval with OpenClaw runtime approval.
- Approval decisions re-check payload hash, current state, authorization, expiry, and target currentness before succeeding.
- Dev Board Incident rows show severity, lifecycle state, owner, updated age, mitigation status, backing `ErrorGroup`, and linked remediation DevTicket refs.
- Alerts & notifications can create, enable/disable, and route alert rules without storing manual destination secrets in rule rows.
- Push/external notifications contain safe payloads and fetch sensitive details only after authorized open.
- Costs budget alerts link to cost/usage context derived from ADR-014 metering and the boundaries of the deferred Finance ledger surface.
- Debug Raw config and Copy debug bundle are redacted by default and audited.
- Ask Admin Opzava can summarize and propose remediation but cannot execute medium-or-higher or destructive remediation without the required approval/confirmation path.
- Remediation execution is dry-run-first where supported, idempotent, single-target, audited, and reflected back to the Incident, Dev Board Incident projection, Activity, notifications, and audit.
- Every screen has loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, approval required, and retry states where applicable.
- Keyboard and screen-reader users can operate filters, tabs, switches, approvals, exports, Incident transitions/actions, linked DevTicket actions, notifications, and debug disclosures.

## Testing decisions

- Test external behavior and policy outcomes, not storage implementation or OpenClaw DTO shapes.
- Prefer the highest stable seam: application services/command handlers, projection writers, ports, route/server-action authorization seams, and UI composition.
- Incident pipeline tests must cover capture, fingerprint dedupe, threshold creation, cooldown suppression, recurrence reopen, dead-letter, watchdog, and redaction-before-storage.
- Authorization/RLS tests must cover tenant user denied from platform rows, tenant A denied from tenant B rows, missing tenant context returning 403, and role revocation removing access on reload/reconnect.
- Log tests must use a fake broker ACL port to cover cursoring, filters, redaction, GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, RateLimited, stale cursor, and export bounds.
- Monitoring tests must cover service health aggregation, stale metrics, endpoint probe failures, node pairing state, export report authorization, and live/offline UI states.
- Approval tests must cover business approval versus runtime approval mirror distinction, stale payload denial, expired approvals, idempotent Approve/Deny, remediation approval, and node-pairing approval.
- Incident projection tests must cover `ErrorGroup` to Dev Board Incidents projection, lifecycle changes, recurrence update, linked remediation DevTickets, non-Sprint eligibility, and Ask Admin Opzava investigation eligibility.
- Alert/notification tests must cover rule condition evaluation, cooldown, severity, delivery routing, unread/read/dismiss, push-safe payloads, fetch-on-open detail authorization, and escalation.
- Activity tests must cover projection from incidents, approvals, workflows, usage sync, remediation, debug bundle generation, and actor attribution for human/AI/system.
- Costs touchpoint tests must cover ADR-014 usage/cost alert inputs, budget threshold/overage notifications, and separation from Finance ledger truth.
- Debug tests must cover redacted config rendering, debug bundle redaction, diagnostics run audit, feature flag authorization, forbidden mutation, and no secret leakage.
- UI composition tests should assert visible labels, table captions/accessible names, keyboard-operable controls, loading/empty/error/forbidden/stale states, and mobile-preserved decision context.
- Contract tests for OpenClaw harness adapters should assert normalized port outputs and protocol-drift handling while avoiding direct dependencies on Gateway storage.
- Regression tests must assert no raw provider payload, token, cookie, secret, request body, customer message, or Gateway config value is persisted or displayed in observability artifacts.

## Dependencies

- ADR-013 for error capture, `ErrorGroup`, `ErrorEvent`, `RemediationAction`, `AlertRoute`, Dev Board Incident projection, redaction, anti-storm controls, dead-letter, watchdog, and Ask Admin Opzava remediation limits.
- ADR-007 for `AuthorizationPort`, resource-scoped RBAC, tenant-scoped repositories, Postgres RLS, `withTenant`, hard 403 on missing tenant context, and role/session revocation posture.
- ADR-014 for `UsageMeter`, `MeterEvent`, `Invoice`, plan limits, quota/entitlement decisions, dunning/suspension states, and usage/cost polling.
- Q4 data boundary decisions: Opzava Postgres is product source of truth; OpenClaw runtime surfaces are accessed only through the broker ACL; snapshots are truth and events are hints.
- Q7 realtime/notifications decisions for WS hub, outbox delivery, push privacy, deduplication, and fetch-on-open notification detail.
- Q8 AI Workforce decisions for Ask Admin Opzava identity, tool-policy-first safety, audit, spend/rate caps, and approval rows for money/PII/credential/legal/admin actions.
- Q11 workflow/approval decisions for unified Opzava `Approval`, runtime approval mirrors, run limiting, and approval backlog escalation.
- Q12 billing/provisioning decisions for tenant lifecycle, Gateway entitlement, suspension blocking runtime starts, and admin/provisioning credential boundaries.
- The deferred Finance ledger surface for Costs ledger semantics, chart of accounts, expense exports, and separation between tenant expense ledger and ADR-014 billing/metering.
- Mockup implementation conventions from `activity.html`, `logs.html`, `monitoring-health.html`, `security-audit.html`, `costs.html`, `debug.html`, and `notifications-alerts.html`. The `issues.html` mockup is retained only as a frozen historical visual reference; its funnel vocabulary is not a target requirement.
- Historical discovery found issue-triage vocabulary in `issues.html`; the 2026-07-15 amendment supersedes that vocabulary with the canonical Incident lifecycle and PRD-019 linked-remediation model.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
