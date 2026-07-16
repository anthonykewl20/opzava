# Opzava Architecture

## What Opzava is

Opzava is an AI-workforce PM SaaS over OpenClaw: persona'd delegate agents act as human-like teammates across Marketing, Support, and Finance, collaborating with humans in a Slack-grade internal chat hub on an installable PWA. Opzava owns the multi-tenant product system of record, policy, billing, approvals, audit, and user experience; OpenClaw owns runtime execution capabilities such as sessions, channels, skills, memory/wiki, Workboard, cron, logs, diagnostics, and usage behind the `gateway-broker` anti-corruption layer. CRM is deferred pending the future user-side dashboard.

Current operating mode: Opzava runs single-tenant internally first to market and promote Opzava itself. The scale-ready multi-tenant architecture is retained and runs one tenant now; Opzava is not a public multi-tenant SaaS yet. The completed admin Tasks MVP is historical as-built substrate. The current developer-operations target is the **Dev Board** defined by [PRD-019](docs/prd/PRD-019-dev-board.md) and [ADR-017](docs/adr/ADR-017-dev-board-authority-sync-execution.md). Its admin shell, navigation, and Overview composition are governed by [PRD-020](docs/prd/PRD-020-admin-control-center.md) and the [Admin Control Center foundation ledger](docs/plan/admin-control-center-foundation-decisions.md); CRM remains deferred to the future user-side dashboard.

Q18 (2026-07-04, `docs/plan/grilling-decisions.md`): Opzava OWNS OpenClaw as a tracked fork at `mainframe/` ([ADR-016](docs/adr/ADR-016-mainframe-tracked-fork.md)); the Platform Gateway is built from that source, runs as a static Compose service, and dynamic per-tenant provisioning is deferred-not-deleted (ADR-002 amendment). Production home is the Dokploy VPS; local compose remains the dev/verify environment. PRD-020 now owns Admin Control Center placement; the frozen Control-UI port program remains historical/parity evidence for the OpenClaw capabilities to harness. The still-implemented `/tasks` and `/issues` routes are legacy migration inputs, not separate future products. CRM is NEVER an Admin Control Center surface (user directive 2026-07-04): `/crm/*` routes were removed on 2026-07-15 (GitHub issue #200), and the deferred CRM rebuild returns with the user-side dashboard.

## Governing principles

| Principle | What it means here |
| --- | --- |
| Scale-ready modular DDD | One pnpm/turborepo monorepo, one bounded-context package per domain, Drizzle/Postgres ownership per context, and no "MVP now, rewrite later" shortcut. See [ADR-001](docs/adr/ADR-001-stack-ddd-structure.md). |
| OpenClaw capability parity | Harness OpenClaw's native runtime grain instead of cloning it: delegate agents, sessions, channels, Workboard, memory/wiki, skills, cron, TaskFlow, tool policy, approvals, logs, and usage. |
| Official docs before APIs | Validate OpenClaw against `docs/openclaw` and every framework, language, and library against current official docs in [official-docs.md](docs/plan/official-docs.md) before coding. Training knowledge is a starting point, never the source of truth. |
| Agnostic ports | Core domain code depends on capability ports, not vendors, provider SDKs, Gateway DTOs, payment-provider DTOs, or framework types. |
| Sad-path-first | Design around tenant leaks, orphan Gateways, missed events, duplicate delivery, stale projections, prompt injection, dunning, bad provider callbacks, and remediation blast radius. |
| Lean VPS ops | Keep normal runtime cost O(tenants), not O(tenants x projects). Start with rootless Docker, self-hosted WS, Postgres outbox, Redis fan-out, MinIO/S3-compatible storage, and Dokploy parity. |

## System context

```mermaid
flowchart LR
  Browser["Browser / installed PWA"] --> Traefik["Traefik\nlocal or Dokploy"]
  External["External customer channels\nSlack / Gmail / WhatsApp / mail"] --> Broker["gateway-broker\nOpenClaw ACL + WS hub"]
  GitHub["GitHub App (target)\nIssue mirror + native delivery facts"] <--> DevSync["Dev Board sync worker (target)\nwebhook / outbox / reconcile"]
  SlackAdmin["Admin Slack (target)\nPersonal Assistant approvals + notifications"] <--> Broker
  LocalRunner["Enrolled local Runner (target)\nagent tool + worktree + Docker"] <--> Next
  CloudRunner["Admitted orchestrator/cloud Runner (target)\nservice identity + worktree"] <--> Next

  Traefik --> Next["Next.js App Router BFF\napps/web"]
  Traefik --> Broker

  Next --> Postgres[(Postgres\nOpzava system of record)]
  Next --> Broker
  Next --> Redis[(Redis\nonline fan-out / coordination)]
  Next --> MinIO[(MinIO / S3 object store)]

  Broker --> Postgres
  Broker --> Redis
  Broker --> Gateways["OpenClaw Platform Gateway\nstatic service built from mainframe/ (Q18);\nper-tenant dynamic containers deferred"]

  Workers["workers\nprojection / metering / jobs"] --> Postgres
  Workers --> Redis
  Workers --> MinIO
  Workers --> Broker
  DevSync --> Postgres

  Provisioner["worker-provisioning\nGatewayRuntimePort docker adapter"] --> DockerProxy["docker-socket-proxy\nnarrow mutation API"]
  DockerProxy --> Gateways
  Provisioner --> Postgres
  Provisioner --> Gateways

  Gateways --> GatewayState[(Tenant Gateway config / state / workspace)]
```

## Bounded-context map

| Context | System of record | Owning ADR |
| --- | --- | --- |
| Identity & Access | Opzava Postgres: users, organizations, memberships, invitations, sessions, role grants, external identities, auth/RBAC mirrors. | [ADR-006](docs/adr/ADR-006-auth-better-auth.md), [ADR-007](docs/adr/ADR-007-rbac-rls.md) |
| Tenant Provisioning | Opzava Postgres: tenant lifecycle, provisioning jobs, `GatewayInstance`, runtime leases, port/state reservations, compensating saga state. | [ADR-002](docs/adr/ADR-002-tenancy-provisioning.md) |
| Platform-Ops | Opzava Postgres: host placement, route health, repair/deprovisioning state, operational-health projections, remediation audit. Notifications/Admin-Observability owns Incident identity and lifecycle. | [ADR-002](docs/adr/ADR-002-tenancy-provisioning.md), [ADR-013](docs/adr/ADR-013-error-admin-card.md), [ADR-015](docs/adr/ADR-015-deployment-parity.md) |
| Runtime-Control | Opzava Postgres policy plus broker-mediated OpenClaw refs: runtime command admission, approvals, steering, aborts, command outcomes. | [ADR-003](docs/adr/ADR-003-gateway-broker-acl-two-token.md), [ADR-004](docs/adr/ADR-004-data-boundary-cqrs.md), [ADR-005](docs/adr/ADR-005-tool-policy-security.md) |
| Dev Board (target) | Opzava Postgres: `DevTicket`, Ready Contract versions, workflow/gates, dependencies, Sprints, Proposals, assignments, execution leases/checkpoints, review evidence refs, Docs refs, GitHub synchronization/conflicts, and audit. GitHub remains authoritative only for native issue number/URL and PR/commit/check/merge facts. | [ADR-017](docs/adr/ADR-017-dev-board-authority-sync-execution.md), [PRD-019](docs/prd/PRD-019-dev-board.md) |
| Project Management | Opzava Postgres: projects, boards, `pm.Card`, comments, assignments, approvals, SLA/customer impact, PM/admin read models. | [ADR-004](docs/adr/ADR-004-data-boundary-cqrs.md) |
| Internal Collaboration | Opzava Postgres: internal channels, DMs, threads, messages, mentions, reactions, read cursors; Redis only for presence/typing TTL. | [ADR-009](docs/adr/ADR-009-realtime-chat-pwa.md) |
| AI Workforce | Opzava Postgres: `AgentEmployee`, personas, departments, autonomy tiers, standing orders, channel bindings, assignments, dispatch policy. OpenClaw owns delegate runtime artifacts. | [ADR-008](docs/adr/ADR-008-ai-workforce.md) |
| Knowledge Management | Opzava Postgres + object store: source documents, revisions, provenance, candidate KB entries, corpus refs, ingestion jobs, skill catalog policy. OpenClaw indexes are derived. | [ADR-010](docs/adr/ADR-010-knowledge-okf.md) |
| CRM | **Deferred/removed 2026-07-15:** the previous schema was dropped by forward migration `0015_crm_removal`; its data model returns with the future user-side dashboard. | [ADR-011](docs/adr/ADR-011-crm-channel-identity.md) (Deferred) |
| External Channels | Opzava Postgres for future channel correlation/projections; OpenClaw Gateway for provider connectivity, credentials, external conversation runtime, sends/receives. The deferred CRM rebuild will consume `ChannelIdentity` resolution. | [ADR-011](docs/adr/ADR-011-crm-channel-identity.md), [ADR-003](docs/adr/ADR-003-gateway-broker-acl-two-token.md) |
| Department Workflows | Opzava Postgres: `Workflow`/`Playbook`, mechanisms, approvals, workflow runs, run steps, campaigns, content pipeline, reports, run limits. OpenClaw executes provisioned mechanisms. | [ADR-012](docs/adr/ADR-012-dept-workflow-engine.md) |
| Finance & Billing | Opzava Postgres: plans, subscriptions, invoices, usage meters, meter events, entitlement state, quota policy, dunning. Billing is deferred; `BillingPort` is a null-adapter seam until external monetization. | [ADR-014](docs/adr/ADR-014-billing-metering.md) |
| Notifications/Admin-Observability | Opzava Postgres: notifications, `ErrorGroup`/Incident identity and lifecycle, error events, alert routes, remediation actions, and platform/tenant Incident projections. | [ADR-013](docs/adr/ADR-013-error-admin-card.md) |
| Gateway Runtime | OpenClaw Gateway per tenant: sessions, runs, task ledger, streaming, Workboard, logs, diagnostics, health, usage/cost snapshots. | [ADR-003](docs/adr/ADR-003-gateway-broker-acl-two-token.md), [ADR-004](docs/adr/ADR-004-data-boundary-cqrs.md) |
| Channel / Automation / Skills / Memory Runtime | OpenClaw Gateway per tenant: channel runtime and secrets, cron, TaskFlow, standing-order execution, skills, memory-wiki, memory-lancedb, Gateway-local config. | [ADR-003](docs/adr/ADR-003-gateway-broker-acl-two-token.md), [ADR-010](docs/adr/ADR-010-knowledge-okf.md), [ADR-012](docs/adr/ADR-012-dept-workflow-engine.md) |

### Admin Control Center composition boundary

The **Admin Control Center** is an admin-only shell and composition surface, not a bounded context
and not another system of record. [PRD-020](docs/prd/PRD-020-admin-control-center.md), its
[foundation ledger](docs/plan/admin-control-center-foundation-decisions.md), and the
[capability-parity map](docs/plan/capability-parity.md) define current placement. The selected
**Admin Overview** is Variant A, **Priority Command Center**, and is distinct from Dev Board Summary.
It composes read-only projections from Dev Board, Notifications/Admin-Observability,
Runtime-Control, Connections/Platform-Ops, and Identity & Access/Security; OpenClaw Overview facts
feed those source projections rather than creating a competing route.

Access is capability-backed, with Owner/Admin compatibility only for migration. The BFF resolves a
stable shell context, then produces a request-scoped sectioned snapshot under every source's own
ACL/RLS. Sections carry provenance and freshness, fail independently, and expose no raw secrets,
credentials, or Gateway/OpenClaw references. Global health/readiness is a platform-wide signal;
actionable attention is a separate actor-scoped queue. The shell never contains CRM, Marketing, or
Finance destinations, while operational Usage & Costs remains valid only as consumption, quota,
capacity, and spend projection, not billing, invoices, or Finance authority. This is an Admin
navigation boundary, not deletion of the deferred/system-wide business contexts. None of this
target composition is implemented merely by being documented or represented in the non-normative
prototype fixtures.

### Dev Board authority and external boundaries

The Dev Board is a dedicated bounded context, not a renamed `pm.Card` and not a composition of the
legacy Task and GitHub-Issue projections. A **DevTicket** is the aggregate; a **Card** is its visual
projection. An agent discovery begins as an Opzava-only Proposal. Once accepted into Backlog, the
DevTicket receives a durable GitHub Issue mirror. Incidents remain separate operational aggregates;
their permanent remediation is a linked Bug or Technical Task DevTicket.

Authority is deliberately split:

- **Opzava owns** the Ready Contract and its versions, lanes and transition gates, dependencies,
  Sprint goal/plan/order, Human Owner, Execution Assignee, Lead Orchestrator, Reviewer selection,
  runner lease/checkpoints, approval decisions, review verdict, and conflict resolution.
- **GitHub owns** its native issue number and URL and the observed PR, branch, commit, check, and
  merge facts. The GitHub Issue is a durable synchronized mirror and history surface, not a second
  workflow engine. Webhooks and an outbox synchronize managed content deterministically without an
  AI/model call; same-field governed conflicts become visible `SyncConflict` records.
- **The explicitly admitted Runner owns execution presence**, an isolated branch/worktree, and
  process state. Only an enrolled local Runner owns access to the required local Docker Review
  stack. A fenced lease, signed receipts, heartbeats, persisted checkpoints, and reconnect
  reconciliation prevent stale or duplicate execution. V1 has no automatic cloud failover when
  the local machine disappears.
- **Slack is a remote control/notification boundary**, not a secret store or alternate database.
  The Personal Assistant may deliver version-bound, expiring approval actions for the enrolled
  Admin; secret enrollment and security/integration changes return the user to an Opzava secure UI.
- **Review runs locally against the local Docker stack** with a separately configured fresh Reviewer
  and a locked commit/evidence package. Done means the mandatory review gate passed and the change
  merged into `development`; staging and production remain the separate Releases flow.

Do not collapse audit into one overloaded activity stream. The target keeps four cross-linked
ledgers with stable IDs and independent ordering/retention: (1) planning questions, recommendations,
decisions, rejected alternatives, and document/contract/Plan revisions; (2) accepted Dev Board
commands, comments, lane/assignment/dependency/approval changes, Review verdicts, and Done facts;
(3) Runner leases, fences, signed execution receipts, heartbeats, checkpoints, worktree/branch/SHA,
Docker, and reconnect reconciliation; and (4) GitHub webhooks, outbox attempts/confirmations,
deduplication, health/replay/reconciliation, Sync Conflicts, and their resolutions. Raw execution
telemetry may expire under policy; relied-upon contracts, approvals, review evidence, and durable
history may not disappear with it.

The current `/tasks` and `/issues` routes, existing Task aggregate, manual issue projection, MCP task
tools, and environment-token adapter remain legacy as-built behavior until the migration manifest
replaces them. They must not be extended from Q17 or implementation issues #147–#157.

For the deep, module-level documentation behind this map, see [docs/architecture/](docs/architecture/README.md).
It documents every Module, Seam, and port-to-Adapter count, grades each seam real or hypothetical, and lists prioritized deepening opportunities; start at the [seam map](docs/architecture/SEAM-MAP.md).

## Agnostic ports catalog

| Port | Purpose | Initial adapter |
| --- | --- | --- |
| `OpenClawGatewayPort` | Runtime RPC to OpenClaw capabilities through the ACL, including sessions, streams, tasks, channels, logs, diagnostics, usage, cron, approvals, skills, memory, and Workboard projections. | `gateway-broker` OpenClaw client |
| `IssueTrackerPort` **(legacy — as built)** | Current list/get/create/close-only issue seam used by `/issues` and the close outbox. It neither supplies the target Dev Board authority split nor consumes the credential enrolled by Connect GitHub. Retire/adapt it through the migration manifest; do not extend it as the Dev Board contract. | Environment-token GitHub REST adapter |
| `DevBoardMirrorPort` **(target — not in code)** | Deterministic managed Issue/body/label/comment/worklog/milestone synchronization plus authoritative reads of native issue/PR/commit/check/review/merge/tag/release facts, webhook verification, health, reconciliation, and conflict inputs. | Single-repository GitHub App adapter |
| `RunnerControlPort` **(target — not in code)** | Command delivery to an explicitly admitted local or orchestrator/cloud Runner, fenced leases, heartbeats, signed/ordered receipts, checkpoints, interruption, preview-tunnel revocation, and reconnect reconciliation without coupling DevTicket policy to Codex or Claude clients. | Local agent tool adapters for Codex Desktop, Codex CLI, or Claude Code, plus an admitted cloud runner adapter |
| `HumanApprovalChannelPort` **(target — not in code)** | Deliver notifications and accept actor/action/version/nonce/expiry-bound decisions while keeping enrollment, secrets, and security/integration trust changes in the secure Opzava UI. | Slack Personal Assistant adapter |
| `ReviewEnvironmentPort` **(target — not in code)** | Admit a configured independent Reviewer against an exact contract/SHA, run the local Docker verification environment, and return evidence/preview health without exposing raw secrets. | Enrolled Runner's local Docker/reviewer adapter |
| `EventBusPort` **(planned — not in code)** | Domain events, outbox dispatch, projection notifications, and future broker swaps without changing domain code. Deleted from `packages/ports` in #160 because it had neither implementor nor consumer and the optional dependency silently discarded events. ADR-004 still holds; reintroduce the port only with the first approved Dev Board migration slice that ships both a durable outbox and a real consumer. Q17 S6/#152 is quarantined and is not implementation authority. | Postgres outbox + `LISTEN/NOTIFY` (to be built with its first consumer) |
| `GatewayRuntimePort` | Provision, start, stop, health-check, suspend, resume, and deprovision per-tenant Gateway instances. | Rootless Docker runtime |
| `BillingPort` | Subscription, plan, metered usage, invoice, dunning, and entitlement integration. | Deferred null adapter; payment provider added only when external monetization starts |
| `PushNotificationPort` | Background notifications for mentions, approvals, assignments, assistant completions, and alerts. | Web Push with VAPID |
| `RealtimeTransportPort` | Online fan-out for chat, activity, agent streaming, presence, typing, and notifications. | WebSocket hub + Redis backplane |
| `AuthPort` | Authentication, sessions, MFA/passkeys, invitations, password reset, and session revocation. | Better Auth |
| `AuthorizationPort` | Fine-grained resource authorization, roles-as-data, tenant/project grants, and external guest checks. | Opzava policy evaluator + Postgres |
| `KnowledgeIndexPort` | Search and retrieval against derived project/org/employee knowledge indexes. | OpenClaw wiki + memory-lancedb over OKF |
| `KnowledgeSourcePort` | Opzava-owned source of truth for KB documents, notes, and uploads that derived indexes are rebuilt from. | Postgres + `ObjectStorePort` |
| `SkillCatalogPort` | Admin-curated catalog of installable OpenClaw skills, provisioned only via admin/provisioning. | Opzava catalog + provisioning worker |
| `SecretsVaultPort` | Storage and retrieval of broker device tokens, provider references, and other secret handles without exposing raw secrets to domain code. | Environment/vault-backed secret references |
| `ObjectStorePort` | Durable source files, KB documents, report artifacts, uploads, and generated assets. | S3-compatible object store |
| `ErrorCapturePort` | Application, broker, worker, and ACL error capture with grouping hooks. | Built-in incident ingestion, GlitchTip-compatible later |
| `EmbeddingProviderPort` | Embeddings for knowledge ingestion and search without coupling to a model provider. | OpenClaw/provider adapter |

## Cross-cutting invariants

| Invariant | Consequence |
| --- | --- |
| Pure per-tenant Gateway | Every tenant has exactly one OpenClaw Gateway route and no production shared pool. `GatewayInstance.tenant_id` is unique. Q18: at the current N=1, that one Gateway is the static mainframe-built `openclaw-platform-gateway` service; dynamic provisioning resumes at multi-tenant. |
| Two-token model | Hot path uses a per-Gateway paired device token with `operator.write` + `operator.approvals`; admin/provisioning uses short-lived, audited, job-scoped `operator.admin`. |
| Projections are cache | Postgres projections are rebuildable caches; OpenClaw RPC snapshots are truth for OpenClaw-owned runtime state; WS events are hints that trigger updates and reconciliation. |
| Command path is write-through | User-visible commands apply the synchronous broker response immediately where read-your-writes matters; async projectors later replay idempotently. |
| Tool policy first | `SOUL.md`, personas, and standing orders describe behavior, but Gateway tool policy, Opzava approvals, RBAC, egress/channel allowlists, and audit enforce authority. SOUL can lie; tool policy cannot. |
| RLS denial is hard 403 | Missing or mismatched `app.current_org`, authorization denial, or tenant-context failure returns 403, never `200` with an empty list. |
| No routable orphan Gateway | A Gateway may run and be Traefik-routable only with active entitlement, `tenant.lifecycle_state = Active`, valid `GatewayInstance`, live lease, expected labels/mounts/network, and current route. |
| OpenClaw refs stay opaque | Session refs, task refs, run refs, Workboard refs, channel refs, approval refs, and Gateway refs are value objects, not Opzava foreign keys or identity. |
| Opzava owns business truth | Users, RBAC, PM cards, approvals, workflows, incidents, billing, audit, and source knowledge live in Opzava Postgres, not Gateway-local state. Deferred CRM customer truth returns with the user-side dashboard. |
| Dev Board gates are Opzava-owned | GitHub writes can request transitions but cannot bypass Ready, dependency, lease, Review, approval, secret-exposure, or integration-health gates. GitHub remains authoritative for its native delivery facts, which Opzava observes before advancing. |
| Secrets do not duplicate | Channel/provider credentials stay in the tenant Gateway or secret store; Opzava stores secret references, reachability metadata, and broker/provisioning token refs only. |

## Request and data flow

### Command path: write-through

1. Browser/PWA reaches `apps/web` through Traefik with a Better Auth-backed, DB-revocable session.
2. The BFF validates session, tenant lifecycle, RBAC through `AuthorizationPort`, quota/entitlement, CSRF/origin, and use-case policy.
3. Domain commands write Opzava state in a tenant-scoped transaction through `withTenant(orgId, fn)`, using Postgres RLS as a fail-closed backstop.
4. Runtime commands call `OpenClawGatewayPort`; the broker resolves tenant from Opzava context, not caller input, and routes to exactly one tenant Gateway.
5. The broker sends WS-first request/response commands with tenant-scoped idempotency keys, maps OpenClaw responses to Opzava DTOs/errors, and applies immediate read-model updates when the UI needs confirmed state.
6. Business approvals block product actions until Opzava `Approval = Approved`; OpenClaw `operator.approvals` gates only runtime exec/plugin prompts and is mirrored into the same chat/inbox surface.

### Event/projection path: durable outbox to online fan-out

1. Any transaction that changes domain state and needs downstream work writes an outbox row in the same Postgres transaction.
2. `LISTEN/NOTIFY` wakes workers, but workers also poll the outbox; missed notifications delay delivery but do not lose events.
3. Projection workers update read models with idempotent checkpoints and reconcile OpenClaw-owned state from broker RPC snapshots after gaps, reconnects, missed events, or unknown event families.
4. Online fan-out publishes accepted events through Redis to the broker WS hub; clients receive at-least-once delivery and deduplicate by event id, message id, idempotency key, or per-channel sequence.
5. Durable chat orders by per-channel Postgres `channelSeq`; presence and typing are Redis TTL hints only.
6. Web Push sends only safe hints; sensitive notification details are fetched after server session validation.

## Deployment topology

One canonical root `docker-compose.yml` is the deployment contract for local and Dokploy. AS BUILT today the compose file has NO `profiles:` key: local Traefik starts unconditionally and serves the web router plain-HTTP on `:18088`; mkcert wildcard TLS on `*.localhost` and the environment-profile split are PLANNED (they land with the Dokploy bring-up slice, which must deliver Traefik+Let's Encrypt on `*.opzava.app` live and the equivalent TLS path locally). Both environments share local secret files vs Dokploy-managed secrets under the same keys, the shared external `dokploy-network`, and the same service names, health checks, and labels.

Compose-managed services AS BUILT today (`docker compose config --services`) are `traefik` (local profile), `postgres`, `minio` + `minio-bucket-init` (one-shot), `web`, `gateway-broker`, `provisioning-worker`, `docker-socket-proxy`, and `openclaw-platform-gateway` — the static Platform Gateway, built from `./mainframe` per [ADR-016](docs/adr/ADR-016-mainframe-tracked-fork.md) (Q18; previously the pulled upstream image). Planned-but-not-yet-composed services from the original design (`pgbouncer`, `redis`, `worker-projection`, `worker-metering`) arrive with the phases that need them — do not assume they exist. Dynamic per-tenant Gateway containers (created by the provisioning worker through `GatewayRuntimePort`, Traefik-labeled, reaper-reconciled) are deferred to the multi-tenant phase per the ADR-002 amendment; the machinery is retained and already serves onboard-exec and operator bootstrap.

Production home (Q18): the Dokploy VPS (6 vCPU / 12GB / 100GB NVMe). Dokploy builds all images from this repo with the same `build:` directives local uses. Public traffic terminates at Traefik + Let's Encrypt on `*.opzava.app` (domain purchased at first live-dev push); exactly ONE public WebSocket surface exists (browser ↔ app/broker); the gateway has zero public listeners and its built-in Control UI is reachable only by SSH tunnel (break-glass).

Docker host control is isolated: Traefik may read `/var/run/docker.sock` directly only for Docker-provider discovery, `tecnativa/docker-socket-proxy` is the only mutation surface, only `worker-provisioning` can reach the scoped mutation API, and the broker/web/projection/metering services never receive Docker access. If Dokploy Traefik cannot discover plain Docker-provider containers on `dokploy-network` with `exposedByDefault=false`, Opzava must run a dedicated Traefik for tenant Gateway routing rather than relying on partial Swarm-provider behavior.

## ADR index

| ID | Title | One-line decision | Status |
| --- | --- | --- | --- |
| [ADR-001](docs/adr/ADR-001-stack-ddd-structure.md) | Monorepo, DDD module structure, and locked stack | Use a pnpm/turborepo TypeScript monorepo with Next.js BFF, separate broker, workers, Drizzle/Postgres, bounded-context packages, and agnostic ports. | Accepted |
| [ADR-002](docs/adr/ADR-002-tenancy-provisioning.md) | Pure-per-tenant tenancy, GatewayRuntimePort, and provisioning saga | Run exactly one OpenClaw Gateway per tenant from day one, managed by an idempotent provisioning saga behind `GatewayRuntimePort`. | Accepted / dynamic provisioning deferred (Q18) |
| [ADR-003](docs/adr/ADR-003-gateway-broker-acl-two-token.md) | gateway-broker ACL, two-token model, and WS protocol client | Put all OpenClaw runtime access behind a long-lived broker ACL with WS-first per-tenant clients and split hot-path/admin credentials. | Accepted |
| [ADR-004](docs/adr/ADR-004-data-boundary-cqrs.md) | Data model boundary, hybrid CQRS, outbox, and projections | Keep Opzava Postgres as product truth and OpenClaw as runtime truth, connected through hybrid CQRS, outbox, and broker snapshots/events. | Accepted |
| [ADR-005](docs/adr/ADR-005-tool-policy-security.md) | Tool-policy-first security, approval gates, and sandbox posture | Make tool policy and Opzava approvals the hard authority boundary; avoid per-project sandboxes for standard agents. | Accepted |
| [ADR-006](docs/adr/ADR-006-auth-better-auth.md) | Better Auth, revocable sessions, MFA/passkeys, and PWA auth | Use Better Auth behind `AuthPort`, DB-revocable sessions, MFA/passkeys, and server-mediated PWA/Web Push auth. | Accepted |
| [ADR-007](docs/adr/ADR-007-rbac-rls.md) | Resource-scoped RBAC, roles-as-data, and Postgres RLS | Use org/project-scoped RBAC behind `AuthorizationPort`, with tenant-scoped repositories and fail-closed Postgres RLS. | Accepted |
| [ADR-008](docs/adr/ADR-008-ai-workforce.md) | AI Workforce, delegate agents, personas, and AgentDispatch | Model each AI employee as an OpenClaw delegate agent while Opzava owns workforce identity, policy, assignments, and `AgentDispatch`. | Accepted |
| [ADR-009](docs/adr/ADR-009-realtime-chat-pwa.md) | Realtime WS hub, internal chat, assistants-in-chat, and PWA/Web Push | Run a broker-hosted WS hub with Redis fan-out and Postgres durability; treat AI assistants as first-class chat participants. | Accepted |
| [ADR-010](docs/adr/ADR-010-knowledge-okf.md) | Knowledge Management, OKF ingestion, and admin skill catalog | Own KB sources in Postgres/object storage, rebuild OpenClaw memory/wiki/vector indexes from OKF, and install skills only through curated admin provisioning. | Accepted |
| [ADR-011](docs/adr/ADR-011-crm-channel-identity.md) | CRM, external channel identity, and Contact resolution | Deferred: retained for the future user-side CRM rebuild; prior schema was dropped by `0015_crm_removal` on 2026-07-15 (GitHub issue #200). | Deferred |
| [ADR-012](docs/adr/ADR-012-dept-workflow-engine.md) | Department workflow engine, approvals, and content pipeline | Let Opzava define workflows/playbooks and approvals while OpenClaw executes provisioned standing orders, cron, TaskFlow, sessions, and channels. | Accepted |
| [ADR-013](docs/adr/ADR-013-error-admin-card.md) | Error-to-Incident pipeline and remediation loop | Own Incident/ErrorGroup identity and lifecycle, redaction, alerting, and constrained remediation in Opzava Postgres; project permanent fixes as linked Bug or Technical Task DevTickets. | Accepted (amended by Dev Board pivot) |
| [ADR-014](docs/adr/ADR-014-billing-metering.md) | Billing, usage metering, and plan enforcement | Deferred: retain billing, metering, quotas, invoices, entitlement, and dunning design in Opzava; keep `BillingPort` as a null adapter until external monetization. | Accepted / Deferred |
| [ADR-015](docs/adr/ADR-015-deployment-parity.md) | Deployment and environment parity | Use one canonical Compose stack for local and Dokploy, with Traefik parity and runtime per-tenant Gateway containers created by provisioning. | Accepted / amended (Q18: static mainframe-built gateway, VPS home, one public WS surface) |
| [ADR-016](docs/adr/ADR-016-mainframe-tracked-fork.md) | Own OpenClaw as a tracked fork (`mainframe/`) | Squash-import upstream at a pinned version, build the Platform Gateway from that source, and customize only via the rung 0–3 ladder so the upstream merge path survives. | Accepted (Q18) |
| [ADR-017](docs/adr/ADR-017-dev-board-authority-sync-execution.md) | Dev Board authority, GitHub synchronization, and local execution | Make the DevTicket an Opzava-owned aggregate; use GitHub as its durable synchronized issue/delivery mirror; fence local execution and independent local review behind explicit ports and gates. | Accepted (Dev Board pivot) |
| [ADR-018](docs/adr/ADR-018-web-broker-principal-trust.md) | web→broker principal trust | Decision brief for #194: the broker shape-checks a body-asserted principal, which ADR-003:46 already forbids — the accepted "derive, never accept" routing mechanism is not what is built. Recommends deleting the four fields nothing reads (`orgId`/`workspaceId`/`userId`/`roleKeys`) rather than verifying them, plus a per-tenant scoped internal token before ADR-002's broker fleet exists, since one shared secret makes per-instance tenant pinning no boundary at all. Signed assertions deferred to the first real consumer. | **Proposed** — awaiting owner decision; ADR-003 needs amending or conforming either way |
