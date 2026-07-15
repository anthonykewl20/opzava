# Opzava MVP Roadmap

> **Status (2026-07-15): planning reference, not execution control.** The P0.5 walking-skeleton and
> admin Tasks MVP below are historical delivered/superseded milestones. Current developer-operations
> direction is the Dev Board pivot in PRD-019 and ADR-017. Migration order comes only from
> `docs/plan/dev-board-migration-manifest.md` plus explicitly approved replacement issues;
> `docs/plan/EXECUTION.md` is a historical ledger.

This roadmap describes the phased build order for Opzava. It starts with the risky runtime loop before product code, then ships the thinnest usable app, then adds one bounded capability at a time. Every phase must leave the product shippable and usable.

Source spine: `docs/plan/consensus/q15-mvp-roadmap.mmx.md` (historical), `docs/plan/backlog.md`,
`docs/plan/grilling-decisions.md`, `docs/plan/dev-board-foundation-decisions.md`,
`docs/plan/dev-board-migration-manifest.md`, `ARCHITECTURE.md`, ADR-001 through ADR-017, and PRD-001
through PRD-019.

## Build Rules

- [ ] Keep the stack from ADR-001: Next.js App Router, TypeScript, pnpm/turborepo, Drizzle/Postgres, shadcn/ui, Tailwind, `apps/web`, `apps/gateway-broker`, `apps/workers`, bounded-context packages, and agnostic ports.
- [ ] Build feature slices through owning bounded contexts. The web app composes use cases and UI; it does not become the domain model.
- [ ] Keep OpenClaw behind `gateway-broker`. Browser code never calls OpenClaw, reads Gateway state, sees Gateway DTOs, or receives raw provider/channel secrets.
- [ ] Make every tenant-scoped repository run through tenant context plus Postgres RLS. Missing tenant context is a hard 403, not an empty successful list.
- [ ] Treat Postgres projections as rebuildable caches. OpenClaw snapshots are runtime truth; OpenClaw WS events are hints.
- [ ] Preserve one deploy contract. Local and Dokploy use one Compose topology, one service naming scheme, one Traefik label contract, and the same env key names.

## Current Dev Board migration

Goal: replace the separate legacy admin `/tasks` and `/issues` product surfaces with one Dev Board
without falsifying or deleting the completed Task/issue-projection history.

- [ ] Treat [PRD-019](../prd/PRD-019-dev-board.md),
  [ADR-017](../adr/ADR-017-dev-board-authority-sync-execution.md), and the detailed Dev Board
  decision ledger as the target contract.
- [ ] Keep Q17 and issues #147–#157 quarantined. Publish replacement implementation tickets only
  after explicit human approval and map every superseded issue to its replacement or deliberate
  retirement.
- [ ] Introduce the dedicated Dev Board bounded context and DevTicket aggregate before redirecting
  callers; do not rename the legacy Task aggregate in place or turn `pm.Card` into DevTicket.
- [ ] Establish one GitHub App seam for installation health, webhooks, deterministic bidirectional
  Issue-mirror synchronization, managed labels, PR/check/merge facts, durable retry, and visible
  conflicts.
- [ ] Add enrolled local Runner, lease/checkpoint/reconciliation, Slack Personal Assistant controls,
  independent local Reviewer, local Docker evidence, Sprints, Docs, Development, and Releases only
  through their approved migration slices.
- [ ] Backfill and reconcile legacy Task/issue links, preserve audit/worklog history, cut reads and
  writes over once, then retire `/tasks`, `/issues`, direct legacy status mutation, and split
  credential paths only after acceptance evidence proves parity.

The exact slice graph, data-disposition rules, and route/tool retirement gates live in
`docs/plan/dev-board-migration-manifest.md`; this summary does not authorize execution.

## P0 - Week-0 De-risk Spike (historical — delivered as EXECUTION.md Slice 0)

Throw this away after it proves the runtime path. Do this before building the real app shell, auth, database schema, or product UI. The spike validates the highest-risk loop in ADR-002, ADR-003, ADR-005, and ADR-015.

### Scope

- [ ] Create a temporary Compose spike with Traefik, `docker-socket-proxy`, and the shared `dokploy-network` label/network assumptions from ADR-015.
- [ ] Add throwaway service 1: `spike-provisioner`, a tiny Node worker that calls the socket proxy through a minimal `GatewayRuntimePort`-shaped adapter and starts exactly one fake or real OpenClaw Gateway container with tenant labels.
- [ ] Add throwaway service 2: `spike-broker`, a tiny Node WS client/server that keeps one tenant Gateway connection, performs the two-token handshake shape, applies an ADR-005 deny-wins policy stub, and relays a token stream.
- [ ] Add throwaway service 3 only if needed: `spike-gateway`, a fake Gateway that exposes HTTP/WS readiness, validates paired Gateway API key plus signed user context, and streams tokens back. Prefer a real local OpenClaw Gateway if available.
- [ ] Generate Traefik Docker-provider labels through the provisioner, not by hand-editing static Compose services.
- [ ] Store only local throwaway secrets outside source or in ignored local env files; do not commit keys, tokens, cert private keys, or paired device credentials.

### Exact Pass Signal

- [ ] From a clean local run, `spike-provisioner` creates one tenant Gateway container through `docker-socket-proxy`, attaches it to `dokploy-network`, and labels it as `opzava.gateway=true`.
- [ ] Traefik resolves the tenant route, for example `https://t-spike.localhost`, to the dynamic Gateway container without adding the Gateway as a static Compose service.
- [ ] `spike-broker` dials the Gateway over WS, sends a request carrying a user-session token shape plus per-Gateway API key shape, receives a streaming response, relays at least three token chunks to a local client, and writes a final round-trip receipt with tenant id, route, idempotency key, and policy decision.

### Out of Scope

- [ ] No Next.js app.
- [ ] No Better Auth.
- [ ] No persistent product schema beyond optional scratch receipts.
- [ ] No production provisioning worker reuse unless the code is intentionally rewritten after the spike.

### ADR / PRD / Contexts

- ADRs: ADR-002, ADR-003, ADR-005, ADR-015.
- PRDs: none directly; this is an architecture proof.
- Bounded contexts touched as throwaway shapes: Tenant Provisioning, Platform-Ops, Runtime-Control, Gateway Runtime.

## P0.5 - Walking-Skeleton MVP (historical — superseded by the admin-Tasks MVP, EXECUTION.md Slice 1)

Goal: the thinnest real Opzava slice that a user can run locally, sign up for, use end-to-end, and reload without losing work.

### IN

- [ ] Canonical root `docker-compose.yml` with local Traefik profile, Postgres, PgBouncer if needed by the selected pooler setup, Redis, MinIO/S3-compatible storage, `next`, `gateway-broker`, `worker-provisioning`, `worker-projection`, `worker-metering` as a no-op shell, and `dockerproxy`.
- [ ] Dynamic one-tenant Gateway provisioning through `GatewayRuntimePort` docker adapter, Traefik labels, `dokploy-network`, provisioner lease, and reaper dry-run check.
- [ ] Better Auth sign-up and login behind `AuthPort`, DB-backed revocable sessions, `session.cookieCache` disabled, basic email confirm or local mailcatcher flow, and no stateless JWT web sessions.
- [ ] First workspace setup creates User, Organization, Owner membership, Owner role grant, default workspace settings, audit/outbox rows, Tenant Provisioning job, one `GatewayInstance`, and default tenant lifecycle transition to `Active` only after Gateway readiness.
- [ ] Resource RBAC behind `AuthorizationPort` with seeded Owner/Admin/Manager/Member roles, tenant-scoped repositories, `withTenant(orgId, fn)`, and RLS fail-closed behavior.
- [ ] App shell with Essential navigation, tenant/org context, Home, All projects, project switcher/list, empty/loading/error/forbidden states, and live connection status.
- [ ] Project Management minimum: create project, list projects, open project, create a default board, create/update a `pm.Card` with title, description, status, and assignee.
- [ ] `gateway-broker` minimum: tenant route resolver, one active Gateway WS connection, scoped runtime command path, idempotency key, two-token admission shape, stream relay, and degraded states for Gateway unavailable/circuit open/scope denied.
- [ ] Ask Opzava minimum: one default coordinator OpenClaw agent, one project-aware chat entry, streamed tokens over WS, final assistant message persisted to Opzava message/projection tables, and safe retry/reconnect dedupe.
- [ ] Runtime-Control minimum: standard-agent tool-policy profile denies runtime execution and filesystem mutation, records policy decision/audit metadata, and blocks disallowed command shapes.
- [ ] Hybrid CQRS minimum: outbox table, worker poller, one projection path for assistant message/card/project activity, and idempotent replay keys.
- [ ] ADR-015 parity minimum: local route labels and service names match Dokploy expectations; CI/parity checks exist as scripts or documented commands, but full CI wiring can land after skeleton.

### OUT / Stubbed

- [ ] MFA, passkeys, password reset, org invitations, external Guest-Client magic links, and profile security beyond current-session logout are stubbed behind `AuthPort` contracts.
- [ ] Knowledge/RAG, OKF ingestion, citations from uploaded docs, skill catalog, and governed skill install are out.
- [ ] Full AI Workforce roster, multiple employees, departments, standing orders, automation, task board, and run trace are out.
- [ ] Internal team chat, DMs, threads, reactions, presence, typing, Web Push, and PWA offline behavior are out except the stream transport needed for Ask Opzava.
- [ ] CRM is deferred to the future user-side dashboard (admin implementation removed 2026-07-15, GitHub issue #200); external channels, marketing, finance, billing checkout, notifications fan-out, admin observability, full error pipeline, and remediation are out.
- [ ] Stripe/provider billing is stubbed as a local active entitlement record; no provider integration yet.
- [ ] Dokploy live deployment is not required, but the Compose and Traefik contract must be Dokploy-compatible from day one.

### Usable Acceptance Signal

- [ ] On a clean machine, an engineer runs local Compose with Traefik.
- [ ] A new owner signs up, confirms email through local mailcatcher or local dev flow, and first workspace setup starts one tenant Gateway.
- [ ] The tenant URL resolves through Traefik and the user can log in with Better Auth.
- [ ] The user sees the app shell, creates one project, opens it, asks Ask Opzava a question, watches at least three streamed token chunks, receives one finalized persisted assistant response, creates one PM card, reloads the browser, and sees the project, chat turn, and card still present.

### ADR / PRD / Contexts

- ADRs: ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008 thin, ADR-009 thin, ADR-015.
- PRDs: PRD-001 thin, PRD-002 thin, PRD-003 thin, PRD-005 thin, PRD-017 baseline async/accessibility rules.
- Bounded contexts: Identity & Access, Tenant Provisioning, Platform-Ops, Runtime-Control, Project Management, Internal Collaboration thin, AI Workforce thin, Notifications/Admin-Observability audit stubs, Gateway Runtime.

## P1 - AI Workforce

Goal: turn the one Ask Opzava agent into an operable AI workforce with departments, assignments, policy, automation entry points, and run evidence.

### Deliverables

- [ ] Add AI Workforce domain model: `AgentEmployee`, `Persona`, `Department`, `AutonomyTier`, `StandingOrder`, `ChannelBinding`, `Assignment`, and `AgentDispatch` with opaque OpenClaw refs only.
- [ ] Ship Agents roster and agent detail in the full/admin shell, including department grouping, orchestrator section, status, current assignment, spend summary, provisioning/drift/repair states, and safe advanced disclosures.
- [ ] Implement employee create/edit/pause/deprovision through audited provisioning jobs; browser code never writes OpenClaw config, persona files, bindings, or tool policy directly.
- [ ] Implement delegate/assign flow from Ask Opzava and PM cards to one specialist employee, with admission checks for RBAC, lifecycle, tier, tool policy, project access, idempotency, Gateway state, and rate/spend caps.
- [ ] Add AI assignment/workload and run-evidence projections for queued/running/review/degraded/completed/failed/timed-out/canceled/lost states, including tool-policy decisions and redacted runtime summaries. Each row deep-links to its owning `pm.Card` or DevTicket instead of creating a second task board or workflow source of truth.
- [ ] Add basic scheduled/background task support through ADR-012-shaped stubs only where needed for standing-order smoke tests; full department workflow engine ships in P5.

### Now-Usable Acceptance Signal

- [ ] An admin creates a Marketing or Support AI employee, assigns a PM card from Ask Opzava to that employee, watches its assignment/workload projection update, opens the linked run evidence with policy and stream receipts, and sees the final employee-attributed report linked back to the original `pm.Card`.

### ADR / PRD / Contexts

- ADRs: ADR-008, ADR-005, ADR-003, ADR-004, ADR-007.
- PRDs: PRD-005, PRD-006.
- Bounded contexts: AI Workforce, Runtime-Control, Project Management, Internal Collaboration, Tenant Provisioning/Platform-Ops, Notifications/Admin-Observability audit projections.

## P2 - Realtime Plus PWA

Goal: make collaboration durable and live, then installable, without turning Web Push or Redis into an auth or durability boundary.

### Deliverables

- [ ] Promote the skeleton stream relay into the ADR-009 broker-hosted WS hub with authenticated browser sockets, topic authorization, Redis fan-out, deploy drain behavior, reconnect backfill, and per-channel sequence dedupe.
- [ ] Ship Internal Collaboration: project rooms, DMs, threads, mentions, reactions, read cursors, Activity, Project Updates, notification rows, and durable message history.
- [ ] Add presence and typing as Redis TTL hints only, never as authorization, audit, workflow, billing, or delivery truth.
- [ ] Treat AI assistants as first-class chat participants: inbound mentions start admitted sessions, streamed output finalizes into one durable assistant message, proactive/webhook completion dedupes against stream completion.
- [ ] Ship PWA manifest, service worker, install flow, offline shell, server-mediated `/api/auth/session` reconnect gate, and no sensitive authenticated response caching.
- [ ] Ship Web Push subscription binding, preferences, safe payloads, notification center counts, push-open fetch-on-open behavior, dead subscription pruning, and revocation on role/session changes.

### Now-Usable Acceptance Signal

- [ ] Two users in one tenant chat in a project room, see mentions/reactions/read state update live, disconnect one browser and recover missed messages on reconnect, install the PWA, go offline and see only the cached shell/auth gate, then receive a safe Web Push for a mention that opens only after session authorization.

### ADR / PRD / Contexts

- ADRs: ADR-009, ADR-006, ADR-007, ADR-004, ADR-008.
- PRDs: PRD-004, PRD-016, PRD-017.
- Bounded contexts: Internal Collaboration, Notifications/Admin-Observability, Identity & Access, AI Workforce, Runtime-Control, Project Management.

## P3 - Knowledge

Goal: give people and AI employees governed project/org knowledge without making OpenClaw memory/wiki/vector state the source of truth.

### Deliverables

- [ ] Ship Docs & Files in the Essential project shell with upload, new doc/note, pinned docs, filters, source status, activity, Draft/Final labels, object-store refs, and project authorization.
- [ ] Implement Knowledge Management source model: documents, notes, uploads, links, artifacts, candidate KB entries, corpus revisions, provenance, sanitizer/hash metadata, and review/promotion state.
- [ ] Implement OKF export/import ingestion jobs through `KnowledgeIndexPort`, with dry-run diff, content-addressed idempotency, index receipts, stale/rebuild/drift states, and delete/scrub jobs.
- [ ] Enforce ADR-008 scoping: employee workspace memory plus server-resolved project/org corpus overlays on assignments; browser-supplied corpus refs are hints only.
- [ ] Add assistant citations against authorized project/org corpus sources and clear degraded states for missing corpus, stale index, drift, or Gateway unavailable.
- [ ] Ship Memory & Skills governance view with admin-only curated skill catalog reads and install/update/repair jobs through audited provisioning; no hot-path `skills.install`.

### Now-Usable Acceptance Signal

- [ ] A project member uploads a document, promotes it to project knowledge, sees an OKF ingestion receipt, asks the project assistant a question, receives an answer citing the uploaded source, then revokes/deletes the source and sees retrieval become stale or scrubbed instead of silently using revoked knowledge.

### ADR / PRD / Contexts

- ADRs: ADR-010, ADR-008, ADR-005, ADR-003, ADR-007.
- PRDs: PRD-007.
- Bounded contexts: Knowledge Management, AI Workforce, Runtime-Control, Project Management, Tenant Provisioning/Platform-Ops, Object Storage adapters.

## P4 - CRM (future user-side dashboard rebuild)

Goal: rebuild customer truth with the future user-side dashboard while projecting external channel observations through the Gateway ACL. The former admin implementation was removed on 2026-07-15 (GitHub issue #200).

### Deliverables

- [ ] Ship Contacts and Accounts list/detail with Contact, Account, Deal, Pipeline/Stage, Activity, Ticket, Segment, Consent, and `ChannelIdentity` read/write models.
- [ ] Implement conservative `SenderSeen` projection: exact verified identity auto-links, unknown senders create stable UnknownContact shells, cross-channel matches become suggestions only.
- [ ] Ship support ticket queue/board with Contact/Account/channel/SLA/priority/assignee/UnknownContact/reply-ready/Gateway-degraded states.
- [ ] Implement ticket reply workflow with consent, channel binding, approval, tier, lifecycle, rate/spend, and idempotency checks before Gateway send.
- [ ] Implement Contact merge and GDPR erasure workflow skeleton: audit, tombstone, Opzava scrub/anonymize, Gateway scrub request, Knowledge memory scrub/rebuild trigger, and receipt states.
- [ ] Add deal pipeline views and CRM timeline projections that stay usable when live transcript detail is unavailable.

### Now-Usable Acceptance Signal

- [ ] An inbound channel observation creates an UnknownContact shell and support Ticket, a human resolves it to a Contact, the Support employee drafts a reply, the approved send writes Ticket Activity, and the Contact timeline remains readable after the Gateway transcript panel is forced unavailable.

### ADR / PRD / Contexts

- ADRs: ADR-011, ADR-003, ADR-004, ADR-008, ADR-010, ADR-007.
- PRDs: PRD-010.
- Bounded contexts: deferred CRM (future user-side dashboard), External Channels, AI Workforce, Runtime-Control, Knowledge Management, Project Management, Internal Collaboration.

## P5 - Department Workflows Plus Marketing

Goal: make Opzava define department work while OpenClaw executes native standing orders, cron, TaskFlow, sessions, and channels.

### Deliverables

- [ ] Implement Department Workflow engine: `Workflow`/`Playbook`, `StandingOrderBlock`, `CronSpec`, `TaskFlowSpec`, `WorkflowRun`, `RunStep`, `Approval`, budgets, concurrency, retry, timeout, failure destination, and versioned publish receipts.
- [ ] Ship Automation page with schedules, triggers/webhooks, recent runs, run logs, run-now/retry/pause/edit actions, and duplicate trigger-key collapse.
- [ ] Ship Marketing dashboard, Campaigns board/list, New campaign, Content Pipeline, Content Calendar, and schedule content flow.
- [ ] Enforce business approval invariant: no Marketing `ContentItem` schedules or publishes unless an Opzava `Approval` matches the exact content version/hash; runtime approvals remain separate mirrors only.
- [ ] Ship Marketing Approvals, Send for review, Assets library/upload, Atlas tag/check suggestions, and request-changes/override audit.
- [ ] Ship Performance, Ads, Email, and Blog report artifacts with freshness, source cursors, trend polarity, re-run analysis, and governed follow-up actions.

### Now-Usable Acceptance Signal

- [ ] A Marketing user creates a campaign, asks Atlas to draft content, sends the exact version for review, approves it, schedules it, sees the cron/TaskFlow publish run execute once, and later opens a report artifact with provenance and no duplicate trigger storm.

### ADR / PRD / Contexts

- ADRs: ADR-012, ADR-008, ADR-009, ADR-010, ADR-005, ADR-003, ADR-007.
- PRDs: PRD-008, PRD-009, PRD-006 automation surfaces.
- Bounded contexts: Department Workflows, Marketing, AI Workforce, Knowledge Management, Runtime-Control, Internal Collaboration, Project Management, External Channels.

## P6 - Finance Plus Billing

Goal: add money visibility, money-risk approvals, usage metering, plan limits, and dunning without letting billing provider state become product entitlement truth.

Backlog note: ADR-014 depends on ADR-013. To keep the requested phase order, P6 includes only the minimal incident/deadletter/error-emission substrate needed for metering, dunning, and quota safety. Full admin observability, remediation, and reaper UI ship in P7.

### Deliverables

- [ ] Ship Finance Costs page with period controls, chart of accounts, budget meter, transaction ledger, receipt/invoice artifact refs, exports, and provider/manual/OpenClaw usage import states.
- [ ] Implement Finance money-risk policy: Finance employee defaults to T1, money actions require matching Opzava business approvals bound to amount, currency, vendor/recipient, target, payload hash, policy ref, and expiry.
- [ ] Implement Billing domain: Plan, Subscription, Entitlement, Invoice, UsageMeter, MeterEvent, dunning state, budget caps, seat limits, runtime limits, and provider portal through `BillingPort`.
- [ ] Add `worker-metering` usage polling through broker ACL for `usage.cost`, with idempotent receipts, correction events for changed payloads, and no double-counting.
- [ ] Enforce plan limits server-side for invites/seat activation, agent creation, autonomy upgrade, channel connection, workflow publish, runtime start, scheduled runs, retries, and channel-triggered work.
- [ ] Implement dunning/suspension integration with ADR-002: failed payment requests `Suspended`, blocks Gateway starts and runtime dispatch, repair resumes, grace expiry requests deprovisioning.

### Now-Usable Acceptance Signal

- [ ] An owner upgrades or sets an active local billing entitlement, sees usage meters update from a Gateway cost observation, hits a configured budget cap that blocks new agent work, approves one Finance money action through Security/Audit-compatible approval rows, and then a simulated failed payment suspends runtime starts while leaving safe billing repair pages reachable.

### ADR / PRD / Contexts

- ADRs: ADR-014, ADR-012, ADR-005, ADR-004, ADR-002, ADR-013 minimal substrate.
- PRDs: PRD-011, PRD-014.
- Bounded contexts: Finance, Billing, Tenant Provisioning, Platform-Ops, Runtime-Control, Department Workflows, Notifications/Admin-Observability minimal, Identity & Access.

## P7 - Notifications Plus Admin Plus Error Pipeline

Goal: make operational truth visible and repairable with one-tenant blast radius, full redaction, and governed Ask Admin Opzava remediation.

### Deliverables

- [ ] Implement ADR-013 incident pipeline: `ErrorGroup`, `ErrorEvent`, redaction at ingest, fingerprinting, anti-storm thresholds, cooldown/caps, deadletter, heartbeat watchdog, visibility states, the Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem lifecycle, and separate Incidents projections.
- [ ] Ship Admin observability screens: Monitoring, Logs, the separate Incident projection/remediation center, Security & Audit, Alerts & notifications, Activity, Costs context links, Debug, and tenant-visible incident center. Operational Incidents link to Dev Board remediation DevTickets; they are not a second Issues workboard.
- [ ] Implement alert routes, in-app/email/push fan-out, notification actions, alert rules, safe payloads, and fetch-on-open detail.
- [ ] Ship Ask Admin Opzava investigation path for incident summary, redacted evidence citations, remediation proposal drafts, target scope, blast-radius class, dry-run state, and tenant-safe status language.
- [ ] Implement remediation lifecycle: dry-run-first, approvals for medium/high/destructive, second confirmation for destructive, idempotent audited Platform-Ops jobs, and status projection back to Incident/Activity/audit. Permanent fixes create or link a Bug or Technical Task DevTicket that follows normal Dev Board gates.
- [ ] Implement reaper dashboard and action flow for orphaned Gateway findings against tenant lifecycle, entitlement, `GatewayInstance`, labels, mounts, network, route, ports, and provisioner lease.

### Now-Usable Acceptance Signal

- [ ] A simulated Gateway-down or broker error creates or reopens one Incident with redacted evidence, triggers an alert, Ask Admin Opzava proposes a one-tenant remediation with dry-run output, an authorized user approves it, the Platform-Ops job executes, and the Incident/Activity/audit trail shows the result without exposing secrets or cross-tenant data. When a permanent code fix is needed, the Incident links to a separately gated DevTicket.

### ADR / PRD / Contexts

- ADRs: ADR-013, ADR-003, ADR-004, ADR-009, ADR-014, ADR-015, ADR-007.
- PRDs: PRD-012, PRD-018, PRD-016 notification delivery surfaces.
- Bounded contexts: Notifications/Admin-Observability, Platform-Ops, Tenant Provisioning, Runtime-Control, Internal Collaboration, Billing, Identity & Access.

## P8 - External Channels Plus Guest Plus Polish

Goal: finish the customer-facing and integration edges: governed channel connections, guest portal access, local tool links, and production polish.

### Deliverables

- [ ] Ship Connections page and settings touchpoints for Gateway status, providers/models, channels/services, MCP/tool policy, skill status, health checks, config/schema validation, and deployment/security/billing links.
- [ ] Implement Slack, WhatsApp, Gmail, and email channel connect/reconnect/pause/remove flows through scoped Gateway/provisioning paths; Opzava stores metadata, opaque refs, health, policy, and audit only.
- [ ] Enforce external channel send policy across channel bindings, consent, autonomy tier, standing orders, approval gates, rate caps, plan limits, and audit.
- [ ] Ship Your tools and connect wizard for Claude Code, OpenCode, Codex CLI, Codex Desktop, Claude Desktop, MCP/Live modes, short-lived setup tokens, verification, revoke, and no copied long-lived secrets.
- [ ] Ship Guest-Client magic links and portal: one project, 24h single-use token hash, no Organization membership, external identity binding, client-visible project overview, file access, support tickets, comments, attachments, and revocation.
- [ ] Complete PRD-017 polish across all screens: shared tokens/components, async/blank states, accessibility gates, mobile fit, no color-only status, no overlapping text, and no raw technical detail in Essential surfaces.

### Now-Usable Acceptance Signal

- [ ] A tenant admin connects Gmail or Slack through the Gateway path, a future user-side CRM rebuild turns an external message into support work, a Support employee sends an approved reply through the connected channel, the project manager creates a Guest-Client link for that customer, the customer opens a scoped portal and comments on the ticket, and a local operator links Codex CLI without any long-lived secret appearing in UI or source.

### ADR / PRD / Contexts

- ADRs: ADR-003 external channel path, ADR-005, ADR-006, ADR-007, ADR-010, ADR-011, ADR-014, ADR-015.
- PRDs: PRD-013, PRD-015, PRD-017, plus PRD-010 channel-consuming flows.
- Bounded contexts: External Channels, deferred CRM (future user-side dashboard), Identity & Access, Project Management, Runtime-Control, Tenant Provisioning/Platform-Ops, Knowledge Management, Billing, Notifications/Admin-Observability.

## Definition of Done Per Phase

- [ ] The phase has one named happy path that a real user can complete in the browser without manual database edits, shell cleanup, or hidden admin setup beyond documented local secrets/config.
- [ ] Every deliverable is implemented through the owning bounded context, application service, port, and adapter. No provider SDKs, Gateway DTOs, Stripe DTOs, or Docker calls leak into browser/UI/domain packages.
- [ ] Tenant isolation is enforced in command and query paths with `AuthorizationPort`, tenant-scoped transactions, RLS, and hard 403 behavior for missing/mismatched tenant context.
- [ ] Commands are idempotent at user retry, worker retry, webhook retry, reconnect, duplicate WS event, and outbox replay boundaries.
- [ ] User-visible lists and detail screens include loading, empty, no-match where relevant, forbidden, stale/offline/reconnecting, validation error, conflict, degraded/runtime-unavailable, and retry states.
- [ ] The phase preserves secrets posture: no raw secrets, tokens, provider payloads, channel credentials, Gateway config, Docker socket details, hidden reasoning, or unredacted payloads in source, UI DTOs, audit rows, notifications, logs, exports, or debug bundles.
- [ ] Activity/audit/outbox records exist for authority-changing commands, provisioning jobs, runtime dispatch, approvals, sends, billing events, incident/remediation actions, and security-sensitive reads where the relevant PRD requires them.
- [ ] Rebuild/reconcile paths exist for every projection added in the phase, including checkpoint/idempotency keys and clear user-facing stale/degraded states.
- [ ] Accessibility and responsive behavior meet PRD-017 for changed screens: keyboard access, screen-reader names, semantic forms/tables/dialogs, WCAG AA contrast, reduced motion, and no text/action overlap at mobile widths or 200 percent zoom.
- [ ] Local Compose can still start the stack, route through Traefik, and complete the skeleton happy path plus the new phase's happy path.

## Local-to-Dokploy Parity

- [ ] Maintain one canonical root `docker-compose.yml`. Use profiles for local-only infrastructure such as local Traefik; do not create a second Dokploy-only Compose contract.
- [ ] Keep service names stable: `postgres`, `pgbouncer` where used, `redis`, `minio`, `next`, `gateway-broker`, `worker-provisioning`, `worker-projection`, `worker-metering`, `dockerproxy`, and local-profile `traefik`.
- [ ] Keep the shared network name `dokploy-network` locally and live.
- [ ] Keep Traefik v3 label shape identical for app, broker, optional MinIO exposure, and runtime tenant Gateway routes.
- [ ] Per-tenant Gateways are dynamic runtime Docker containers created by `worker-provisioning`, never static Compose services.
- [ ] Gateway containers must carry `traefik.enable=true`, `traefik.docker.network=dokploy-network`, `opzava.gateway=true`, tenant/Gateway/lease/lifecycle/expected-state labels, and route rules generated from current `GatewayInstance`.
- [ ] Use `tecnativa/docker-socket-proxy` as the only raw Docker socket mount. Only `worker-provisioning` can reach it. Broker, web, projection, metering, and tenant Gateway containers never receive Docker access.
- [ ] Local secrets and live Dokploy secrets use the same keys but different values and sources. Commit neither raw secret values nor generated private keys/tokens.
- [ ] Add parity CI/check scripts early and keep them green before every phase is accepted: Compose config validates, only dockerproxy mounts `/var/run/docker.sock`, Traefik labels exist on routable services, tenant Gateway label generator matches the documented contract, service env key names match local/live templates, and no static Compose service is created for a tenant Gateway.
- [ ] If Dokploy Traefik cannot discover plain Docker-provider containers on `dokploy-network` with `exposedByDefault=false`, deploy a dedicated Opzava Traefik for tenant Gateway routing instead of changing the app or bypassing parity.
- [ ] Reaper behavior is part of parity: the same code locally and live scans `opzava.gateway=true` containers/routes against tenant lifecycle, entitlement, `GatewayInstance`, expected labels, expected mounts, expected network, expected ports, expected route, and live lease.
