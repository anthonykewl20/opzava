# ADR seam constraints

> **Migration note (2026-07-15):** This document records current constraints, not a built Dev Board
> design. Apply PRD-019, ADR-017, and `docs/plan/dev-board-migration-manifest.md` to future
> Task/Issue work; historical #147–#157 planning is no longer implementation authority.

This is the seam backbone extracted from the seam-defining ADRs. Each entry fixes where a Module
Interface lives, what Implementation sits behind it, the invariant that must not be re-litigated,
and the repo location it governs. Vocabulary is fixed: Module, Interface, Implementation, Depth
(deep = lots of behavior behind a small Interface; shallow = Interface nearly as complex as
Implementation), Seam, Adapter, Leverage, Locality. Two standing tests apply to every entry: the
deletion test (delete the Module and the rest collapses = load-bearing Seam), and "the interface is
the test surface". The adapter-count test grades each Seam: one Adapter = hypothetical Seam, two
Adapters = real Seam.

## The six seam-defining ADRs

### ADR-001: monorepo DDD package boundary

- (a) Seam fixed: one bounded-context Module per package under `packages/`, where domain packages
  depend on `packages/ports` Interfaces and never on concrete Adapters
  (`docs/adr/ADR-001-stack-ddd-structure.md:23-26`).
- (b) Behind the Seam: each Module owns its own domain model, application services, events,
  repository Interfaces, and Drizzle schema; `apps/web` is a BFF and UI composition layer, not the
  domain; OpenClaw types stop at the `gateway-broker` anti-corruption layer
  (`docs/adr/ADR-001-stack-ddd-structure.md:19-26`).
- (c) Invariant: bounded contexts export only application commands, queries, domain events, and
  stable DTOs, never tables, Drizzle builders, OpenClaw DTOs, or provider SDK objects; Drizzle (not
  Prisma) is locked as the Postgres toolkit (`docs/adr/ADR-001-stack-ddd-structure.md:28`, `:117`).
- (d) Repo location: `apps/web`, `apps/gateway-broker`, `apps/workers`, `packages/ports/src/`,
  `packages/shared-kernel/src/`, and the per-context folders under `packages/`
  (`docs/adr/ADR-001-stack-ddd-structure.md:30-115`).

### ADR-003: gateway-broker ACL and two-token Seam

- (a) Seam fixed: `gateway-broker` is the only production path from any Opzava caller to OpenClaw;
  the browser, route handlers, server actions, domain packages, and workers all call broker-facing
  ports, never OpenClaw directly (`docs/adr/ADR-003-gateway-broker-acl-two-token.md:21`).
- (b) Behind the Seam: OpenClaw protocol drift, method and frame translation, tenant-to-Gateway
  routing, WS-first operator client lifecycle, lazy connect, per-tenant circuit breakers,
  idempotency, opaque-ref mapping, and scope negotiation are concentrated in this one deep Module
  and exposed through `OpenClawGatewayPort` (`packages/ports/src/openclaw-gateway.ts`,
  `docs/adr/ADR-003-gateway-broker-acl-two-token.md:23-55`).
- (c) Invariant: routing is tenant-derived not caller-supplied; one broker connection maps to
  exactly one tenant Gateway; and the hot-path device token carries only `operator.write` +
  `operator.approvals`, while the short-lived JIT `operator.admin` credential is reserved for the
  provisioning worker (`docs/adr/ADR-003-gateway-broker-acl-two-token.md:44`, `:59-61`).
- (d) Repo location: `apps/gateway-broker/src/` (`acl/openclaw`, `routing`, `realtime`, `rpc`) and
  `packages/adapters/src/openclaw-gateway-broker-client/`
  (`docs/adr/ADR-001-stack-ddd-structure.md:39-43`, `:82`).

### ADR-004: data boundary and hybrid-CQRS Seam

- (a) Seam fixed: the ownership Seam between Opzava truth and OpenClaw truth; Opzava Postgres is the
  system of record for all Opzava domain data, and OpenClaw is the system of record for runtime
  execution data reachable only through the ADR-003 ACL (`docs/adr/ADR-004-data-boundary-cqrs.md:5`,
  `:19`).
- (b) Behind the Seam: durable UI read models are projected into Postgres from domain events, broker
  WS events, and OpenClaw RPC snapshots; heavy or ephemeral runtime views are read through the
  broker on demand (`docs/adr/ADR-004-data-boundary-cqrs.md:44-70`).
- (c) Invariant: Postgres projections are rebuildable caches not runtime truth, OpenClaw RPC
  snapshots are truth for runtime state, OpenClaw WS events are hints, and `pm.Card` and
  `workboard.Card` stay separate with `AgentDispatch` as the bridge
  (`docs/adr/ADR-004-data-boundary-cqrs.md:73-78`, `:82`).
- (d) Repo location: per-context write models and read models inside each `packages/<context>/src/`
  Module, with the outbox behind `EventBusPort` (`docs/adr/ADR-004-data-boundary-cqrs.md:19`,
  `:80`). **Not yet built:** the port was deleted in #160 (zero adapters, zero consumers — the
  optional dependency made the missing adapter a silent no-op); ADR-004 stands, and any replacement
  must land with the outbox and its first real consumer under the PRD-019/ADR-017 migration plan.

### ADR-005: tool-policy-first security Seam

- (a) Seam fixed: the governance Seam between persona text and enforceable controls; Gateway tool
  policy and Opzava `Approval` rows are the primary authority for AI agent side effects, and
  `SOUL.md`/`AGENTS.md`/standing orders are behavior descriptions, not enforcement
  (`docs/adr/ADR-005-tool-policy-security.md:5`, `:36-43`).
- (b) Behind the Seam: standard agents run with `sandbox.mode: off` and a deny list of
  `group:runtime`, `write`, `edit`, `apply_patch`; business approvals are the Q11 `Approval`
  aggregate; runtime exec/plugin approvals remain OpenClaw `operator.approvals` reached through the
  ADR-003 hot path (`docs/adr/ADR-005-tool-policy-security.md:21-34`, `:67-81`).
- (c) Invariant: `deny` wins and cannot be reintroduced by `/exec`, elevated mode, plugins, or
  workflow provisioning; there is no per-project Docker sandbox for standard agents, so runtime cost
  stays O(tenants) not O(tenants x projects) (`docs/adr/ADR-005-tool-policy-security.md:11`, `:45`).
- (d) Repo location: admission logic in the Runtime-Control Module at
  `packages/runtime-control/src/` and broker admission in `apps/gateway-broker/`, reconciled through
  `Approval` aggregates in the department-workflows context
  (`docs/adr/ADR-005-tool-policy-security.md:34`, `:93`).

### ADR-007: authorization and RLS Seam

- (a) Seam fixed: `AuthorizationPort` is the single fine-grained authorization Seam, exposing one
  `can(user, action, resource)` evaluator that every privileged command, query, handler, worker,
  broker runtime command, and admin Incident/remediation operation must pass through
  (`docs/adr/ADR-007-rbac-rls.md:47`).
- (b) Behind the Seam: resource-scoped RBAC with roles-as-data (rows owned by Identity and Access),
  the Organization-Project-Member hierarchy, and roles seeded as `Owner`, `Admin`, `Manager`,
  `Member`, and `Guest-Client`; the first Adapter is Opzava policy evaluation over Postgres tables,
  with ReBAC or narrow ABAC deferrable behind the same port (`docs/adr/ADR-007-rbac-rls.md:37-60`).
- (c) Invariant: tenant-scoped repositories carry `orgId` and Postgres RLS fails closed through the
  `withTenant(orgId, fn)` wrapper so a missing or mismatched `app.current_org` is a hard 403, never
  a 200 with an empty list (`docs/adr/ADR-007-rbac-rls.md:64-83`).
- (d) Repo location: `packages/ports/src/authorization.ts`, the Identity and Access Module at
  `packages/identity-access/src/{domain,application,adapters/postgres}`, and the `withTenant`
  wrapper applied wherever tenant tables are touched (`docs/adr/ADR-007-rbac-rls.md:66-72`, `:97`).

### ADR-016: Mainframe tracked-fork Seam

- (a) Seam fixed: the only integration point between Opzava and its OpenClaw fork is the Docker
  image boundary; `mainframe/` is its own pnpm workspace excluded from the Opzava workspace, and
  owning the source grants no bypass of the broker ACL or two-token model
  (`docs/adr/ADR-016-mainframe-tracked-fork.md:34-35`, `:58-61`).
- (b) Behind the Seam: the upstream working tree is squash-imported into `mainframe/` at a pinned
  tag (recorded in `mainframe/UPSTREAM.md`), and the Platform Gateway image is built from that
  source instead of pulled from `ghcr.io/openclaw/openclaw`
  (`docs/adr/ADR-016-mainframe-tracked-fork.md:5-8`, `:21-22`).
- (c) Invariant: every change lands on the lowest rung of the customization ladder that can express
  it (Rung 0 config, Rung 1 extension points, Rung 2 additive `extensions/opzava-*` modules, Rung 3
  logged source patches in `mainframe/PATCHES.md`), keeping the upstream merge path alive
  (`docs/adr/ADR-016-mainframe-tracked-fork.md:27-33`).
- (d) Repo location: `mainframe/` (`UPSTREAM.md`, `PATCHES.md`), the `build: ./mainframe` directive
  on the `openclaw-platform-gateway` Compose service, and the parity contract in ADR-015
  **Decision** (`docs/adr/ADR-016-mainframe-tracked-fork.md:5-6`, `:62-63`).

## Seam constraints from the remaining ADRs

These ADRs do not define the primary seams but each locks a decision a future deepening proposal
must respect.

### ADR-002: provisioning Seam and GatewayRuntimePort

The Seam is `GatewayRuntimePort` as the only path to create, start, stop, suspend, resume, and
deprovision per-tenant Gateway runtimes, owned by the tenant-provisioning `ProvisioningJob` saga and
never by the web request path or the hot broker. Today's Adapter is
`packages/ports/src/connections-provisioning.ts` plus the docker Adapter in `worker-provisioning`,
with rootless Docker as the first Adapter and K8s or Nomad as later Adapters behind the same port
(two Adapters declared = real Seam). The invariant is pure-per-tenant tenancy (one tenant, one
Gateway, no shared pool) plus the anti-orphan rule that no container runs without active
entitlement, `Active` lifecycle, a valid `GatewayInstance`, and a live lease
(`docs/adr/ADR-002-tenancy-provisioning.md:24`, `:97-105`).

### ADR-006: AuthPort authentication Seam

The Seam splits authentication from authorization: Better Auth sits behind `AuthPort` owning
sign-in, sessions, MFA, passkeys, and coarse org membership, while fine-grained authority stays with
ADR-007 `AuthorizationPort` (`docs/adr/ADR-006-auth-better-auth.md:25-30`). The two-adapter test
makes this a real Seam: Better Auth is primary and Auth.js v5 plus the Postgres adapter is the
planned fallback behind the same port (`docs/adr/ADR-006-auth-better-auth.md:21-23`). The invariant
is DB-backed revocable sessions (not stateless JWT), `session.cookieCache` disabled, and
authority-changing events revoking sessions in the same transaction that changes membership or role
(`docs/adr/ADR-006-auth-better-auth.md:32-44`, `:65`). Repo location: `packages/ports/src/auth.ts`
and the Identity and Access Adapter at `packages/identity-access/src/adapters/`.

### ADR-008: workforce identity vs runtime agent Seam

The Seam keeps Opzava workforce identity (the `AgentEmployee`, `Persona`, `Department`,
`AutonomyTier`, `Assignment` aggregates) separate from OpenClaw runtime agent objects (the delegate
agent, workspace, `agentDir`, memory-lancedb, sessions) (`docs/adr/ADR-008-ai-workforce.md:29-33`).
`AgentDispatch` is the bridge aggregate that cross-references `pm.Card` with opaque OpenClaw
Workboard, task, run, session, and approval refs as value objects, never foreign keys, so `pm.Card`
and `workboard.Card` never merge (`docs/adr/ADR-008-ai-workforce.md:78`,
`docs/adr/ADR-004-data-boundary-cqrs.md:82`). The invariant is that governance lives at Gateway tool
policy, broker admission, Opzava `Approval` rows, allowlists, and audit, and an inbound hostile
message alone can never trigger an autonomous external send
(`docs/adr/ADR-008-ai-workforce.md:55-63`). Repo location: the AI Workforce Module
`packages/ai-workforce/src/` and the bridge aggregate referenced from
`packages/project-management/src/`.

### ADR-009: realtime transport Seam

The Seam is `RealtimeTransportPort`: a self-hosted WebSocket hub inside `gateway-broker` backed by
Redis for online fan-out, with managed providers (Ably, Pusher, Supabase Realtime) deferred as later
Adapters behind the same port (two Adapters declared = real Seam)
(`docs/adr/ADR-009-realtime-chat-pwa.md:21`). The invariant is the durability split: Postgres outbox
is the durable event source and the correctness boundary, Redis is only a latency backplane, and
presence and typing are Redis TTL projections that must never drive authorization, audit, billing,
or delivery (`docs/adr/ADR-009-realtime-chat-pwa.md:23`, `:80`). Durable chat ordering is a
per-channel Postgres `channelSeq`, with backfill-before-live-attach so reconnect gaps and duplicate
delivery are harmless (`docs/adr/ADR-009-realtime-chat-pwa.md:33-35`). Repo location:
`packages/ports/src/realtime-transport.ts`, the broker hub in `apps/gateway-broker/src/realtime/`,
and the Internal Collaboration write model in `packages/internal-collaboration/src/`.

### ADR-010: knowledge source vs derived index Seam

The Seam splits `KnowledgeSourcePort` (Opzava-owned KB documents, metadata, corpus revisions in
Postgres plus object storage) from `KnowledgeIndexPort` (OpenClaw `memory-wiki` and `memory-lancedb`
as derived indexes) (`docs/adr/ADR-010-knowledge-okf.md:24-30`). OKF bundles plus `wiki okf import`
are the portable ingestion contract between the two, so swapping LanceDB, the embedding model, or
the storage engine changes Adapters and rebuild jobs, not the source model
(`docs/adr/ADR-010-knowledge-okf.md:40-42`). The invariant is rebuild-from-source-of-truth: a
Gateway, workspace, wiki, or vector index can be deleted or reprovisioned without losing knowledge
because Opzava Postgres plus object storage is the only authority
(`docs/adr/ADR-010-knowledge-okf.md:52`). Repo location: the Knowledge Management Module
`packages/knowledge-management/src/`, `packages/ports/src/object-store.ts`, and skill installation
routed through the audited provisioning path only (`docs/adr/ADR-010-knowledge-okf.md:48`).

### ADR-011: Deferred CRM identity vs channel runtime Seam

CRM implementation and schema were removed on 2026-07-15 (GitHub issue #200); ADR-011 is retained
for the future user-side-dashboard rebuild. Its future Seam keeps CRM truth separate from OpenClaw
channel runtime state, with conservative `ChannelIdentity` resolution as specified in
`docs/adr/ADR-011-crm-channel-identity.md`. There is no current CRM module, schema, or External
Channels package location.

### ADR-012: workflow definition vs execution Seam

The Seam is the principle "Opzava defines, OpenClaw executes": `Workflow` (definition, policy,
budget, concurrency, approval policy) is the Opzava source of truth, while standing orders, cron,
TaskFlow, task-ledger state, sessions, and runtime approvals are OpenClaw execution reached through
the ADR-003 hot path (`docs/adr/ADR-012-dept-workflow-engine.md:21-31`). The invariant is two
approval sources of truth: Opzava `Approval` decides business actions, OpenClaw `operator.approvals`
decides exec/plugin gates, and disagreement fails closed to Opzava
(`docs/adr/ADR-012-dept-workflow-engine.md:35-37`). No `ContentItem` reaches `Published` without an
`Approved` business approval for the matching content hash, enforced at both the gateway command
path and the UI (`docs/adr/ADR-012-dept-workflow-engine.md:41`). Repo location: the Department
Workflow Module `packages/department-workflows/src/` and the admin provisioning path in
`apps/workers/src/provisioning/`.

### ADR-013: incident capture Seam

The Seam is `ErrorCapturePort`: app reporters, broker and ACL errors, OpenClaw signals read through
the ACL, and customer reports all flow through one normalized capture path, with self-hosted
GlitchTip or Sentry deferred as a later Adapter behind the same port (two Adapters declared = real
Seam) (ADR-013 **Decision**). The invariant is that `ErrorGroup` owns Incident identity, event
grouping, visibility, and remediation state; the Dev Board Incidents row is a read projection, never
a `pm.Card` or DevTicket. Redaction happens at the ingest boundary before storage, dead-letter,
outbox, or projection. Permanent fixes are separately linked Bug or Technical Task DevTickets
(`docs/adr/ADR-013-error-admin-card.md`, ADR-017). Platform and tenant visibility stay separate:
platform Incidents have `tenantId = NULL`, and RLS plus query guards forbid tenant reads of platform
or other-tenant rows (`docs/adr/ADR-013-error-admin-card.md`). Repo location:
`packages/ports/src/error-capture.ts` and the Notifications/Admin-Observability Module
`packages/notifications-admin-observability/src/`.

### ADR-014: billing Seam

The Seam is `BillingPort`: today it ships as a null Adapter with local entitlements only, and Stripe
is the planned first Adapter behind the same port when external monetization starts (two Adapters
declared = real Seam) (`docs/adr/ADR-014-billing-metering.md:3`, `:21`). The invariant is metering
idempotency: one canonical `(tenant_id, agent_id, window, raw usage.cost payload)` produces one
`MeterEvent`, one usage-meter contribution, and at most one provider metered usage record, with
corrections additive (`docs/adr/ADR-014-billing-metering.md:32`, `:57-59`). Billing couples to
provisioning by outbox events, not ownership: Finance and Billing requests `Active` to `Suspended`
and `Deprovisioning` transitions, but ADR-002 owns the lifecycle state machine, the saga,
`GatewayRuntimePort`, and deprovisioning mechanics (`docs/adr/ADR-014-billing-metering.md:49`,
`:67`). Repo location: the Finance and Billing Module `packages/billing/src/` and plan enforcement
in BFF quota middleware.

### ADR-015: deployment parity and Docker-control Seam

The Seam is the Docker-control boundary: the mutation-scoped `tecnativa/docker-socket-proxy` is the
only Docker mutation surface, reachable only by `worker-provisioning`, and the `gateway-broker`
never mounts Docker, never receives a Docker endpoint, and never provisions containers on the hot
path (ADR-015 **Decision** and **Consequences**). The invariant is one canonical
`docker-compose.yml` as the deployment contract for both local and Dokploy, exactly one public
WebSocket surface (browser to app and broker via Traefik plus Let's Encrypt), and the gateway
keeping zero public listeners (ADR-015 **Status** and **Decision**). The Releases amendment adds an
artifact-identity Seam: the trusted pipeline builds each candidate image once, the immutable Release
Manifest pins source/tree and per-service OCI digests plus
provenance/signatures/SBOM/deployment-contract evidence, and staging and production deploy those
same digests without provider rebuild. Local Review images never cross this Seam as Release
artifacts. Dokploy/runtime observations, not desired state or API acceptance, own effective
per-service digest/routing/health facts. Environment mutation crosses a fenced Release attempt;
mixed or unknown observations hold admission until reconciliation, and Current Environment
Deployment remains separate from Last Known Good. The anti-orphan invariant extends to routing: no
tenant Gateway may remain both running and routable unless entitlement, `Active` lifecycle, a valid
`GatewayInstance`, a live lease, and matching container labels all hold (ADR-015 **Consequences**).
Repo location: `docker-compose.yml`, `apps/workers/src/provisioning/` (the `GatewayRuntimePort`
docker Adapter), and the `dokploy-network` shared external network.

## Do not re-litigate

Any future deepening proposal must respect these locked decisions.

1. The `gateway-broker` is the only hot-path ACL to OpenClaw; no browser, route handler, server
   action, domain package, or worker calls OpenClaw directly, and OpenClaw Gateway types, DTOs,
   frames, and provider secrets never cross that Seam
   (`docs/adr/ADR-003-gateway-broker-acl-two-token.md:21`, `:28`).
2. The two-token model is fixed: the hot-path device token carries only `operator.write` +
   `operator.approvals`, and the short-lived JIT `operator.admin` credential is reserved for the
   audited provisioning worker; owning Mainframe grants no bypass
   (`docs/adr/ADR-003-gateway-broker-acl-two-token.md:59-61`,
   `docs/adr/ADR-016-mainframe-tracked-fork.md:58-61`).
3. Opzava Postgres is the system of record; projections are rebuildable caches; OpenClaw RPC
   snapshots are truth and OpenClaw WS events are hints; do not make OpenClaw a query backend or
   copy runtime state into normalized Opzava tables (`docs/adr/ADR-004-data-boundary-cqrs.md:73-78`,
   `:106`).
4. `pm.Card` and `workboard.Card` stay separate; `AgentDispatch` is the bridge and OpenClaw refs are
   value objects, never foreign keys and never PM identity
   (`docs/adr/ADR-004-data-boundary-cqrs.md:82`, `:108`).
5. Tool policy and Opzava `Approval` rows are the enforcement boundary; SOUL, persona text, and
   prompt instructions are context, not authority; `deny` wins and cannot be reintroduced by
   `/exec`, elevated mode, plugins, or provisioning (`docs/adr/ADR-005-tool-policy-security.md:11`,
   `:32`).
6. There is no per-project Docker sandbox for standard agents; runtime cost stays O(tenants), and
   code execution is a named exception with its own profile
   (`docs/adr/ADR-005-tool-policy-security.md:45-52`).
7. `AuthorizationPort` `can(user, action, resource)` is the only fine-grained authority; Better Auth
   and provider roles feed membership, they do not decide access (`docs/adr/ADR-007-rbac-rls.md:47`,
   `docs/adr/ADR-006-auth-better-auth.md:25-30`).
8. Tenant access goes through `withTenant(orgId, fn)`; a missing or mismatched `app.current_org` is
   a hard 403, never a 200 with an empty list, and PgBouncer runs in transaction pooling
   (`docs/adr/ADR-007-rbac-rls.md:66-83`, `:103`).
9. `GatewayRuntimePort` is the only Docker mutation surface and only `worker-provisioning` reaches
   the socket proxy; the broker, web app, and other workers never touch Docker (ADR-015 **Decision**
   and **Consequences**).
10. Tenancy is pure-per-tenant (one tenant, one Gateway, no shared pool); the anti-orphan invariant
    binds entitlement, `Active` lifecycle, a valid `GatewayInstance`, a live lease, and matching
    labels together (`docs/adr/ADR-002-tenancy-provisioning.md:24`, `:97-105`; ADR-015
    **Consequences**).
11. Sessions are DB-backed and revocable, `session.cookieCache` stays disabled, and
    authority-changing events revoke sessions in the same transaction
    (`docs/adr/ADR-006-auth-better-auth.md:32-44`, `:65`).
12. Opzava defines workflows and OpenClaw executes them; business `Approval` and OpenClaw
    `operator.approvals` are two sources of truth and disagreement fails closed
    (`docs/adr/ADR-012-dept-workflow-engine.md:21`, `:35-37`).
13. Opzava KB sources are the knowledge authority; `memory-wiki` and `memory-lancedb` are derived
    and rebuildable, and skills install only through the audited admin provisioning path
    (`docs/adr/ADR-010-knowledge-okf.md:30`, `:48`).
14. One canonical `docker-compose.yml` governs local and Dokploy parity; exactly one public
    WebSocket surface exists and the gateway keeps zero public listeners (ADR-015 **Status** and
    **Decision**).
15. Mainframe is a tracked fork, not a hard fork; every change lands on the lowest rung of the
    customization ladder, and the only Opzava-to-fork integration point is the Docker image boundary
    (`docs/adr/ADR-016-mainframe-tracked-fork.md:5`, `:27-35`).
16. DevTicket Done ends at reviewed merge to `development`; Release is separate. Build once, promote
    the same immutable digest bundle, require distinct human Staging/Production Approvals, preserve
    provider unknown/mixed truth, and never let rollback rewrite `main`, tags, GitHub Releases,
    manifests, or Incident lifecycle (`docs/plan/research/wf236-releases-gate-contract.md`).
