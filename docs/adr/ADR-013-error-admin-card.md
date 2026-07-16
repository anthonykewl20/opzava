# ADR-013: Error-to-Incident pipeline and remediation loop

> **Dev Board amendment (2026-07-15):** `ErrorGroup`/Incident remains a separate
> Notifications/Admin-Observability aggregate. Its canonical lifecycle is **Detected → Triaged →
> Mitigating → Monitoring → Resolved → Postmortem**. The former ADMIN-card/standalone-Issues
> presentation is superseded by a projection into the Dev Board **Incidents** view. Incident is not
> a persisted DevTicket Type and is never Sprint-eligible. Permanent remediation is a separately
> linked DevTicket of Type Bug or Technical Task under PRD-019/ADR-017.

> **Releases amendment (2026-07-17):** Release owns deployment and rollback commands, fenced
> attempts, artifact intent, and Release evidence. Incident remains authoritative for operational
> lifecycle. A deployment `Failed`, threshold-exceeded `Unknown`, or rollback failure must
> create/link an Incident; a failed production rollback must create/update a critical Incident.
> Later degradation may create/link an Incident, but neither lifecycle mutates or resolves the
> other.

Status: Accepted

Opzava will own a lean incident pipeline inside the Notifications/Admin-Observability bounded
context. Error groups, events, alert routing, remediation actions, and Incident projections live in
Opzava Postgres, while OpenClaw runtime signals are read only through the ADR-003 broker ACL and
projected according to the ADR-004 hybrid-CQRS contract.

## Context

ADR-003 puts every OpenClaw runtime read and command behind the `gateway-broker` ACL, with tenant
routing, opaque refs, scoped hot-path credentials, and a separate short-lived admin/provisioning
credential. ADR-004 makes Opzava Postgres the system of record for durable product state,
notifications, audit, PM cards, incident projections, and hybrid-CQRS read models. ADR-009 gives
incidents and admin alerts the same durable notification, realtime, inbox, and push delivery
surfaces as other user-visible events.

Q9 historically required Opzava to self-log errors and auto-create cards in an ADMIN board. The
2026-07-15 Dev Board amendment preserves the self-logging, deduplication, ownership, and remediation
intent but supersedes the PM-card presentation with a separate Incident plus Dev Board Incidents
projection. OpenClaw Workboard remains Gateway-local agent work and can only be a diagnostics
source.

The incident domain has two competing risks. If capture is too thin, the platform goes blind when
the broker, Gateway, or ingest path fails. If capture is too eager, noisy runtime failures create
Incident storms, leak tenant details into platform or tenant views, and pressure Ask Admin Opzava to
run unsafe remediation. The model must make redaction, deduplication, visibility, rate limits,
dead-letter handling, and remediation approvals part of the domain boundary rather than operational
afterthoughts.

Ask Admin Opzava is the platform-ops Admin assistant from the Q4b/Q9 two-token split. It can
investigate with ACL reads and propose remediation, but it must not turn an Incident into broad
tenant-admin authority. Runtime remediation needs blast-radius classification, approval gates, dry
runs, idempotency, one-tenant scope, and immutable admin-token audit.

## Decision

Create an Opzava-owned Notifications/Admin-Observability context in Postgres. This context owns
human-visible notifications, incident/error groups, error events, remediation actions, alert routes,
and the Dev Board Incidents projection. It exposes capture through `ErrorCapturePort`, so callers
and future adapters submit normalized error observations without depending on storage tables,
GlitchTip/Sentry APIs, or OpenClaw DTOs.

Use `ErrorGroup` as the aggregate root for a normalized incident. Its fields include `fingerprint`,
`severity`, `count`, `firstSeen`, `lastSeen`, `status`, optional `tenantId`, optional `projectId`,
optional `agentId`, optional `gatewayId`, `visibility`, cooldown/cap metadata, and lifecycle/audit
metadata. `visibility` is the single switch with values `platform_only`, `tenant_visible`, and
`tenant_redacted`.

`ErrorGroup` owns or coordinates these records:

- `ErrorEvent`: one captured occurrence with `groupId`, `source`, occurred timestamp, redacted JSONB
  payload, optional opaque OpenClaw refs, ingest metadata, and source idempotency key.
- `RemediationAction`: one proposed or executed response with `groupId`, kind, blast-radius class,
  status, approval refs, dry-run result, idempotency key, actor/admin-token audit refs, before/after
  metadata, and execution result.
- `AlertRoute`: routing policy with match expression, scope, severity threshold, destination
  channel, cooldown, and escalation metadata.

The Dev Board Incident row is a projection of `ErrorGroup`, not a DevTicket or the incident
aggregate. The first threshold-qualified active group creates or updates one Incident identity and
projection. The projection carries lifecycle state, severity, owner, SLA, customer impact,
mitigation, links, comments, and Activity, while `ErrorGroup` remains the source of truth for
grouping, counts, visibility, events, and remediation state. One fingerprint has one Incident
identity for its lifetime; recurrence after resolution reopens that Incident rather than creating a
new identity.

Incident lifecycle commands are Detected → Triaged → Mitigating → Monitoring → Resolved →
Postmortem. This state machine does not map to Dev Board Backlog/Todo/In Progress/Review/Done. When
permanent code or configuration remediation is needed, the operator creates or links a normal
DevTicket of Type Bug or Technical Task. That DevTicket follows the ordinary readiness, dependency,
Sprint, review, and merge gates; the Incident itself never joins a Sprint.

Release deployment and rollback remain commands of the separate Dev Board Release aggregate. A
deployment `Failed`, threshold-exceeded `Unknown`, or rollback failure must create or link this
Incident through the Incident command boundary; later degradation may do so. The link carries
Release, manifest, environment, attempt, sanitized evidence, and correlation refs. A failed
production rollback must create or update a critical Incident. Incident resolution never marks a
Release/attempt successful or rewrites Release history; successful deploy/rollback/health
observation never resolves the Incident. Each owner applies its own transition criteria and records
cross-links.

Use four incident sources that all flow into the same capture path:

- App reporters: Next.js `error.tsx`, route handlers, server actions, workers, browser reporters,
  and BFF exceptions submit through `ErrorCapturePort` with service, route, actor, request, release,
  and tenant context where available.
- Broker and ACL errors: the `gateway-broker` reports OpenClaw protocol errors, routing failures,
  scope denials, projection failures, reconnect/circuit events, webhook failures, and ACL
  translation errors.
- OpenClaw via the ACL: broker-owned projectors read `logs.tail`, `diagnostics.stability`,
  task-ledger `failed`, `timed_out`, `cancelled`, and `lost` entries, Workboard failure flags,
  `health`, and usage spikes. They follow ADR-004 hybrid CQRS: snapshots are truth, WS/events are
  hints, and projection writes are tenant-scoped, idempotent, and reconcilable.
- Customer reports: support/admin forms and customer-facing report flows create manually sourced
  `ErrorEvent` rows with tenant-redacted payloads and links to tickets, contacts, conversations, or
  PM cards where allowed.

Capture is a lean built-in incident domain on day one. Self-hosted GlitchTip or another
Sentry-compatible tracker may be added later as an `ErrorCapturePort` adapter for frontend
source-map symbolication, raw stack grouping, or developer ergonomics. It is not the source of truth
for incidents, Dev Board projection, tenant visibility, remediation policy, approvals, or admin
audit.

Deduplicate by fingerprint before Incident creation. The default fingerprint is SHA-256 of
normalized `service|route|exception-type|normalized-message`, with request ids, run ids, task ids,
session ids, URLs, emails, tokens, literal values, and other high-cardinality or sensitive values
stripped. Gateway/runtime sources may include normalized `gatewayId`, `agentId`, task kind,
tool/channel/plugin class, and top frame when those values improve grouping without leaking payload
detail.

Apply anti-storm controls before creating or reopening Incidents. Critical severity creates
immediately. Other severities suppress Incident creation until the group reaches the configured
threshold, defaulting to at least 3 events within 5 minutes. A 30-minute per-fingerprint cooldown
prevents repeated creation. Per-tenant and per-gateway hourly caps bound fan-out; excess events
increment counts, update `lastSeen`, emit digests, and route to alert summaries instead of creating
more Incidents. Platform-wide caps prevent a broken shared component from flooding the view.

Separate platform and tenant visibility. Platform Incidents have `tenantId = NULL` and span Opzava
app, infrastructure, broker, and all tenant Gateways. Tenant-visible error views are separate
redacted projections where `tenantId` is set and `visibility` is `tenant_visible` or
`tenant_redacted`. RLS plus query-layer guards forbid tenant reads of platform rows, other tenants'
rows, and unredacted cross-tenant detail. Cross-tenant payloads, stack frames, customer data,
secrets, channel content, and Gateway-local config never leave the protected platform view or ingest
boundary.

Ask Admin Opzava uses Incident detail as a triage surface and the ACL as its investigation surface.
It may read `logs.tail`, `diagnostics.stability`, task snapshots, Workboard diagnostics, `health`,
usage/cost projections, and related Opzava audit/activity rows through approved application ports.
It then proposes a `RemediationAction` with a blast-radius class.

Default Ask Admin Opzava autonomy is low: notify, label, summarize, request more data, and draft
remediation only. Medium or higher blast-radius actions require an approval gate before execution.
Restarting one Gateway, canceling or re-dispatching one task, replaying a projector, or repairing
one route is at least medium. Re-provisioning, config or secret changes, queue drains, bulk repairs,
data erasure, and any destructive operation require a two-step human confirm. Cross-tenant
remediation is not allowed as one action; the blast radius is one tenant, one Gateway, or one
bounded operational target at a time.

Every remediation action runs dry-run-first where the target operation supports it, records an
idempotency key, and writes immutable audit with acting human, Ask Admin Opzava actor, admin-token
job ref, tenant/Gateway scope, requested change, before/after state, approval refs, OpenClaw refs,
and result. Mutating runtime work uses the ADR-003 admin/provisioning credential only through the
audited platform-ops job path, never through browser handlers or the broker hot path.

## Consequences

Notifications/Admin-Observability becomes the Incident source of truth. Product screens, Dev Board
Incident projections, tenant-visible error views, notification fan-out, push alerts, Activity rows,
remediation proposals, and audit correlate through Opzava Postgres rather than through OpenClaw logs
or an external tracker.

OpenClaw remains the runtime owner of logs, diagnostics, health, task-ledger state, Workboard state,
and usage snapshots. The broker reads those surfaces through the ACL and writes sanitized
projections. Projection loss, duplicate observations, sequence gaps, or Gateway downtime are normal
paths; projectors must deduplicate, checkpoint, reconcile from snapshots, and never read Gateway
storage directly.

The protected platform Incidents view can see cross-tenant operational incidents, but tenant views
cannot. Visibility, redaction, RLS, and query guards are required invariants, not UI preferences. A
tenant-scoped user may see that their own Gateway, workflow, channel, or task is degraded, but never
raw payloads or correlations that reveal another tenant.

Redaction happens at the ingest boundary. One `redact(payload, visibility)` path runs before
storage, dead-letter, outbox, Incident projection, alert routing, or adapter forwarding. Payloads
are not stored first and redacted at read time. No unredacted error payload may cross tenant scope,
and stack traces, request bodies, customer messages, channel payloads, credentials, tokens, cookies,
provider keys, and Gateway-local config values must be stripped or replaced with safe hashes before
persistence.

The incident pipeline must be observable by itself. `errors_ingest_deadletter` is the absolute sink
for observations that cannot be normalized, grouped, redacted, or projected. Dead-letter writes are
best-effort minimal records with redacted metadata and failure reason. They do not create ordinary
Incidents directly, but they are counted and audited.

A heartbeat watchdog Incident is non-suppressible. If no `ErrorEvent` lands within five minutes, a
heartbeat-driven platform Incident is created or reopened, regardless of fingerprint cooldowns,
tenant caps, gateway caps, or ordinary suppression rules. It indicates that the pipeline may be
blind, not that the platform is healthy.

Incident storms become a modeled failure mode. Thresholds, cooldowns, per-tenant caps, per-gateway
caps, platform caps, digest comments, and alert routes protect Incident views and notification
channels from noise. The cost is that some lower-severity observations first appear as counts or
digests rather than individual Incidents.

Ask Admin Opzava is useful but constrained. It can accelerate triage and draft safe fixes, but
approval gates, dry runs, idempotency keys, one-tenant blast radius, two-step destructive confirms,
and immutable admin-token audit prevent Incidents from becoming broad automated admin authority.

Release failure linkage increases correlation work but prevents two dangerous shortcuts: deriving
Incident resolution from a recovered environment and rewriting a historical Released fact after
later degradation. Current deployment facts and Incident state remain independently truthful.

## Alternatives

Use a self-hosted tracker such as GlitchTip or Sentry as the incident source of truth. Rejected
because Opzava needs tenant visibility, Incident projection/lifecycle, remediation governance, RLS,
outbox fan-out, linked DevTicket policy, and admin-token audit as product-domain behavior. A tracker
can help with raw capture and symbolication behind `ErrorCapturePort`, but it must not own Incident
identity, lifecycle/routing, approvals, remediation links, or tenant disclosure policy.

Create separate incident models per source. Rejected because app errors, broker errors, Gateway
diagnostics, Workboard failures, health degradation, usage spikes, and customer reports all need one
grouping, visibility, alerting, and remediation lifecycle. Separate models would fragment
deduplication and make Ask Admin Opzava triage unreliable.

Make Dev Board rows or DevTickets the source of truth for incidents. Rejected because the Incidents
view is a human projection. Incident grouping, lifecycle, event history, redaction state,
thresholds, cooldowns, caps, and remediation actions need a domain aggregate that can project into
Dev Board, notifications, tenant views, and audit without making development-work storage own
observability semantics.

Read OpenClaw logs and Workboard state directly from Gateway storage. Rejected because ADR-003
requires all OpenClaw access through the broker ACL and ADR-004 treats snapshots through the
OpenClaw protocol as runtime truth. Direct storage reads would leak Gateway internals, bypass tenant
routing and scope checks, and break protocol drift isolation.

Let Ask Admin Opzava execute remediation automatically for any incident it can diagnose. Rejected
because incident diagnosis is probabilistic and remediation can restart Gateways, replay work,
mutate config, or affect customer data. The accepted model keeps low-risk actions at
notify-and-draft, requires approval for medium or higher blast radius, and requires two-step
confirmation for destructive work.

Redact at read time. Rejected because a single missed query, projection, webhook, push route,
Incident comment, dead-letter row, export, or future adapter could leak raw payloads. Redaction must
occur before storage and forwarding so no payload crosses tenant scope.

## Related ADRs

- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, and PWA/Web Push.
- ADR-017: Dev Board Release authority, fenced deployment/rollback attempts, and Release evidence.

---

> **Validate against official docs before implementing.** Training knowledge is a starting point,
> not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor
> docs. See `CLAUDE.md` (Official-docs rule).
