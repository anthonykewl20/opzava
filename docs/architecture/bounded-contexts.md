# Opzava bounded-context ownership backbone

This doc is the ownership spine for Opzava's bounded contexts.
It maps each context to its owning package or app, system of record, governing ADR, and current build status.
It then names the cross-context seams and classifies each context as OpenClaw-native, Opzava-owned, or hybrid.
Vocabulary is the codebase-design set: Module (interface plus implementation), Interface (signature plus invariants plus ordering plus error modes), Implementation, Depth (deep is much behavior behind a small interface), Seam (where an interface lives), Adapter (a concrete thing satisfying an interface at a seam), Leverage, Locality.
Primary sources are `ARCHITECTURE.md` (bounded-context map, agnostic ports catalog, cross-cutting invariants, request and data flow), `docs/plan/capability-parity.md`, and `docs/plan/EXECUTION.md`.

> **Current-to-target note (2026-07-15):** Current Task/Issue modules remain part of the truthful build inventory below. PRD-019/ADR-017 introduce a target Dev Board context that will absorb Opzava platform-development workflow without absorbing generic Project Management `pm.Card` or Notifications/Admin-Observability Incident. See `docs/plan/dev-board-migration-manifest.md`; the target context is not built yet.

## The ownership table

The context list and the system of record per context come from `ARCHITECTURE.md:54-72` (bounded-context map).
The owning ADRs come from the same map and are confirmed against `docs/adr/`; ADR-011 and ADR-014 were removed.
The owning package or app comes from the on-disk monorepo layout: packages are `adapters`, `config`, `identity-access`, `ports`, `project-management`, `runtime-control`, `shared-kernel`; apps are `gateway-broker`, `mcp-server`, `web`, `workers`. CRM is deferred to the future user-side dashboard (GitHub issue #200).
Build status is grounded in `docs/plan/EXECUTION.md` Current State (line 41) and each slice's Status and Bounded contexts line.

| Bounded context | Owning package(s) / app(s) | System of record | Owning ADR(s) | Current build status |
| --- | --- | --- | --- | --- |
| Identity and Access | `packages/identity-access` (`@opzava/identity-access`); AuthPort and AuthorizationPort in `packages/ports` (`auth.ts`, `authorization.ts`) | Opzava Postgres: users, organizations, memberships, invitations, sessions, role grants, external identities, RBAC mirrors (`ARCHITECTURE.md:58`) | ADR-006, ADR-007 | Built: Slice 1b/1c/1d, hardened in 2.5 (`EXECUTION.md:142` Slice 1 done, `:193` 2.5 done) |
| Tenant Provisioning | `apps/workers` (provisioning-worker); `packages/ports` (`connections-provisioning.ts`, `openclaw-gateway.ts` for `GatewayRuntimePort`) | Opzava Postgres: tenant lifecycle, provisioning jobs, `GatewayInstance`, runtime leases, port or state reservations, compensating saga state (`ARCHITECTURE.md:59`) | ADR-002 | Partially built: Slice 0 spike done, live bring-up in Slice 3.5; dynamic per-tenant provisioning deferred (Q18 ADR-002 amendment, `EXECUTION.md:108`, `:41`) |
| Platform-Ops | `apps/workers` and `apps/web` (admin ops surfaces, `debug.html` and `settings.html` touchpoints) | Opzava Postgres: host placement, route health, repair or deprovisioning state, operational-health projections, and remediation audit; Notifications/Admin-Observability owns Incident identity and lifecycle (`ARCHITECTURE.md:64`, ADR-013) | ADR-002, ADR-013, ADR-015 | Partially built: Connections and settings surfaces in Slice 3.7; debug and full ops are P8 (`EXECUTION.md:41`, `:466` P8 ADR refs) |
| Runtime-Control | `packages/runtime-control` (`@opzava/runtime-control`) | Opzava Postgres policy plus broker-mediated OpenClaw refs: command admission, approvals, steering, aborts, command outcomes (`ARCHITECTURE.md:61`) | ADR-003, ADR-004, ADR-005 | Built: Slice 2 and 2.5 turn state machine, outcome-first receipts, governed task tools (`EXECUTION.md:169` Slice 2 done) |
| Project Management | `packages/project-management` (`@opzava/project-management`) | Opzava Postgres: projects, boards, `pm.Card`, comments, assignments, approvals, SLA and customer impact, PM and admin read models (`ARCHITECTURE.md:62`) | ADR-004 | Built: Slice 1e Task aggregate and board, extended in 2.5 card detail (`EXECUTION.md:142`, `:193`) |
| Dev Board (target) | No dedicated package/app yet; current migration inputs live in `packages/project-management`, `apps/web` `/tasks` and `/issues`, workers, and the GitHub adapter | Opzava: DevTicket contracts, workflow/gates, Sprint plans, docs, leases, approvals, review evidence, and release projections. GitHub: issue ID/URL and PR/commit/check/merge facts. Shared content syncs deterministically. | ADR-017 | Planned under PRD-019; not built. Current Task/Issue behavior remains legacy until migrated. |
| Internal Collaboration | No dedicated package yet; degraded SSE path lives in `apps/web` over Runtime-Control outbox | Opzava Postgres: internal channels, DMs, threads, messages, mentions, reactions, read cursors; Redis for presence and typing TTL only (`ARCHITECTURE.md:63`) | ADR-009 | Partially built: comments, read receipts, and typing hints over SSE in Slice 2.5; durable WS hub deferred to P2 (`EXECUTION.md:202`, `:223` deferred, `:305` P2 not started) |
| AI Workforce | No dedicated package yet; one Ask Opzava agent runs through Runtime-Control and `apps/gateway-broker` | Opzava Postgres: `AgentEmployee`, personas, departments, autonomy tiers, standing orders, channel bindings, assignments, dispatch policy; OpenClaw owns delegate runtime artifacts (`ARCHITECTURE.md:64`) | ADR-008 | Partially built: one platform agent live in Slice 2; full workforce, roster, AgentDispatch deferred to P1 (`EXECUTION.md:175`, `:281` P1 not started) |
| Knowledge Management | No dedicated package yet; ports `packages/ports` reserves `KnowledgeIndexPort` and `KnowledgeSourcePort` (catalog rows, `ARCHITECTURE.md:86-87`) | Opzava Postgres plus object store: source documents, revisions, provenance, candidate KB entries, corpus refs, ingestion jobs, skill catalog policy; OpenClaw indexes are derived (`ARCHITECTURE.md:65`) | ADR-010 | Not started: P3 (`EXECUTION.md:329` P3 not started) |
| CRM | No current package or surface | **Removed:** former schema dropped by forward migration `0015_crm_removal`; the data model returns with the future user-side dashboard. | ADR-011 (removed) | Removed 2026-07-15 under GitHub issue #200; the future rebuild belongs to the user-side dashboard. |
| External Channels | `apps/gateway-broker` ACL adapter to OpenClaw; no Opzava domain package | Opzava Postgres for future channel correlation and projections; OpenClaw Gateway for provider connectivity, credentials, external conversation runtime, sends and receives. | ADR-011 (removed), ADR-003 | Partially built: provider connect and Connections surface; future channel flows may integrate with the deferred user-side CRM rebuild. |
| Department Workflows | No dedicated package yet | Opzava Postgres: `Workflow` and `Playbook`, mechanisms, approvals, workflow runs, run steps, campaigns, content pipeline, reports, run limits; OpenClaw executes provisioned mechanisms (`ARCHITECTURE.md:68`) | ADR-012 | Not started: Slice 4 (Marketing content pipeline) deferred by user; engine and automation deferred to P5 (`EXECUTION.md:253` Slice 4 deferred, `:377` P5 not started) |
| Finance and Billing | No current package or port | Opzava Postgres: plans, subscriptions, invoices, usage meters, meter events, entitlement state, quota policy, dunning; billing is out of scope. | ADR-014 (removed) | Removed 2026-07-15 under GitHub issue #200; no `BillingPort` exists in code. |
| Notifications and Admin-Observability | No dedicated package yet; `ErrorCapturePort` declared in `packages/ports` (`error-capture.ts`) | Opzava Postgres: notifications, error groups, error events, alert routes, remediation actions, and platform/tenant Incident projections (`ARCHITECTURE.md:75`) | ADR-013 | Partially built: the legacy Issues projection and health pill shipped in Slices 2.5 and 3.5; the separate Incident lifecycle/projection, alert routes, and remediation loop remain deferred to P7 (`EXECUTION.md:208`, `:423` P7 not started) |
| Gateway Runtime | `mainframe/` (OpenClaw tracked fork, ADR-016) reached only through `apps/gateway-broker` | OpenClaw Gateway per tenant: sessions, runs, task ledger, streaming, Workboard, logs, diagnostics, health, usage and cost snapshots (`ARCHITECTURE.md:71`) | ADR-003, ADR-004 | Live: static `openclaw-platform-gateway` built from `./mainframe`, mainframe-move slice done; dynamic per-tenant containers deferred (`ARCHITECTURE.md:133`, `EXECUTION.md:41`) |
| Channel, Automation, Skills, Memory Runtime | `mainframe/` reached only through `apps/gateway-broker` | OpenClaw Gateway per tenant: channel runtime and secrets, cron, TaskFlow, standing-order execution, skills, memory-wiki, memory-lancedb, Gateway-local config (`ARCHITECTURE.md:72`) | ADR-003, ADR-010, ADR-012 | Live where harnessed (sessions, tasks, models, logs, skills via broker); Opzava-native admin port of Control-UI views is in flight as Slice 3.7 (`EXECUTION.md:41-43`) |

## Context dependencies

Dependencies are grounded in the cross-cutting invariants (`ARCHITECTURE.md:94-107`), the command and event paths (`ARCHITECTURE.md:109-127`), the agnostic ports catalog (`ARCHITECTURE.md:74-92`), and the Bounded contexts line under each slice in `EXECUTION.md`.
A dependency means one context calls another context's Interface or reads its projection; the seam is the port name and file in `packages/ports`.

Every command-side context depends on Identity and Access first.
The command path validates a Better Auth session, tenant lifecycle, RBAC through `AuthorizationPort`, quota, CSRF or origin, and use-case policy before any domain write (`ARCHITECTURE.md:113-114`).
That makes Identity and Access (`packages/identity-access`) and `AuthorizationPort` (`packages/ports/authorization.ts`) the entry dependency for every other context.
RLS denial is a hard 403 and never an empty result, so a tenant-context failure is fatal for every caller (`ARCHITECTURE.md:103`).

Tenant Provisioning depends on Gateway Runtime.
It provisions, starts, stops, and deprovisions per-tenant Gateway instances through `GatewayRuntimePort` (`packages/ports/openclaw-gateway.ts`, `ARCHITECTURE.md:80`), so it owns the Gateway lifecycle and the docker-socket-proxy mutation surface (`ARCHITECTURE.md:46`, `:133`).

Runtime-Control depends on Tenant Provisioning and Gateway Runtime, mediated by the broker.
Runtime commands call `OpenClawGatewayPort`; the broker resolves tenant from Opzava context, not caller input, and routes to exactly one tenant Gateway (`ARCHITECTURE.md:116-117`).
The broker is the only ACL to OpenClaw, the single anti-corruption seam (`CLAUDE.md` Non-Negotiables, `ARCHITECTURE.md:78`).

Project Management depends on Runtime-Control.
The card surface bridges agent execution through `AgentDispatch`, `workboard_*`, `tasks.*`, and `agent.wait` over `OpenClawGatewayPort` (`docs/plan/capability-parity.md:47`, `EXECUTION.md:189` Slice 2 bounded contexts).
The Slice 2 Ask Admin loop reads, creates, and updates PM Cards through admitted server-side tools (`EXECUTION.md:177-179`).

Dev Board will depend on Identity and Access, AI Workforce, Runtime-Control, Notifications/Admin-Observability, Knowledge Management, Tenant Provisioning/Platform-Ops, and the GitHub integration seam. It owns platform-development workflow and gates, while AI Workforce owns agent identities/dispatch, Runtime-Control owns command admission, Admin-Observability owns Incidents, and GitHub owns repository-native facts. DevTicket is never `pm.Card` or `workboard.Card`; Incident projects into the Incidents view but is not Sprint-eligible.

AI Workforce will depend on Runtime-Control, Project Management, Internal Collaboration, Tenant Provisioning, Platform-Ops, and Notifications/Admin-Observability.
That dependency set is the P1 bounded-contexts line: AI Workforce, Runtime-Control, Project Management, Internal Collaboration, Tenant Provisioning, Platform-Ops, Notifications/Admin-Observability (`EXECUTION.md:301`).
Opzava owns workforce identity, policy, assignments, and `AgentDispatch`, while OpenClaw owns the delegate runtime artifacts (`ARCHITECTURE.md:64`, ADR-008).

CRM was removed on 2026-07-15 (GitHub issue #200); it returns only with the future user-side dashboard.

External Channels depends on Gateway Runtime for provider connectivity. Future channel flows may integrate with the CRM rebuild when it returns with the user-side dashboard.

Department Workflows will depend on AI Workforce and Gateway Runtime.
Opzava defines workflows, playbooks, and approvals; OpenClaw executes provisioned standing orders, cron, TaskFlow, sessions, and channels (`ARCHITECTURE.md:68`, ADR-012, `EXECUTION.md:397` P5 bounded contexts).

Knowledge Management will depend on Gateway Runtime and Project Management.
Opzava owns source documents in Postgres and the object store; derived OpenClaw memory-wiki and memory-lancedb indexes are rebuilt from OKF over `KnowledgeIndexPort` (`ARCHITECTURE.md:65`, `:86`, `EXECUTION.md:349` P3 bounded contexts).

Finance and Billing will depend on Runtime-Control, Tenant Provisioning, and Department Workflows.
Usage input comes from `usage.cost` over the broker; plan limits and dunning integrate with tenant lifecycle (`ARCHITECTURE.md:69`, `docs/plan/capability-parity.md:111`, `EXECUTION.md:421` P6 bounded contexts).

Notifications and Admin-Observability depends on every context that emits errors, logs, or runtime events.
Incident inputs come from `logs.tail`, `diagnostics.stability`, `tasks.list`, Workboard diagnostics, and app errors. Notifications/Admin-Observability normalizes them into `ErrorGroup`/Incident lifecycle and projects the result into the Dev Board Incidents view; any permanent code or configuration fix is a separately linked Bug or Technical Task DevTicket (ADR-013, ADR-017).
The P7 bounded-contexts line lists Notifications/Admin-Observability, Platform-Ops, Tenant Provisioning, Runtime-Control, Internal Collaboration, Billing, and Identity and Access (`EXECUTION.md:445`).

Internal Collaboration depends on Identity and Access, AI Workforce, Runtime-Control, Project Management, and Notifications/Admin-Observability.
That dependency set is the P2 bounded-contexts line (`EXECUTION.md:325`).
AI assistants are first-class chat participants routed through the broker WS hub (`ARCHITECTURE.md:151`).

The dependency graph is acyclic at the runtime seam: every cross-context call goes through a port in `packages/ports`, and every OpenClaw-bound call funnels through `OpenClawGatewayPort` and `apps/gateway-broker`.

## OpenClaw-native vs Opzava-owned vs hybrid

The classification legend is `docs/plan/capability-parity.md:12-16`.
OpenClaw-native (harness) means OpenClaw already owns the runtime capability and Opzava harnesses it through the backend-only `gateway-broker` ACL.
Opzava-owned (build in Postgres) means Opzava is the system of record and builds the product data model, RBAC, workflows, and UI persistence in Postgres.
Hybrid means Opzava owns the business or product record while OpenClaw owns agent runtime, channel runtime, memory indexes, automation, logs, tasks, usage, or approvals.

OpenClaw-native contexts are the two OpenClaw-owned runtime rows in the bounded-context map plus the `logs.html` log explorer.
Gateway Runtime and Channel, Automation, Skills, Memory Runtime are OpenClaw-native by ownership: OpenClaw is the system of record and Opzava only reaches them through the broker ACL (`ARCHITECTURE.md:71-72`).
The log explorer is the one product surface explicitly tagged OpenClaw-native, harnessing `logs.tail` with cursor, limit, and max-byte controls (`docs/plan/capability-parity.md:119`).

Opzava-owned contexts are Identity and Access, the human-only parts of Internal Collaboration, and the Project Management record of truth.
Every Auth screen is Opzava-owned with no OpenClaw user identities: login, forgot and reset password, 2FA setup, accept-invite, profile, and signout all sit behind `AuthPort` (`docs/plan/capability-parity.md:22-27`).
Human-only team messages, Slack-grade channels, team rooms, and the composer are Opzava-owned for message truth, with the WS hub and outbox owning delivery (`docs/plan/capability-parity.md:61-64`).
Home, project cards, the project status table, board rollups, add-card, to-dos, and blank-slate and style-guide screens are Opzava-owned (`docs/plan/capability-parity.md:34-37`, `:43-48`).

Hybrid is the dominant classification across product surfaces.
Project workspaces, card detail, card tables, goals, schedules, updates, discovery, docs and files, mention inbox, notifications, every AI Agents screen, memory and skills, all Marketing surfaces, all CRM customer surfaces, Finance, every Admin or Ops screen, and every Settings or Connections screen are hybrid (`docs/plan/capability-parity.md:43-55`, `:65-66`, `:72-77`, `:83-85`, `:91-97`, `:103-105`, `:111-112`, `:118-123`, `:129-132`, `:138-141`).
The pattern is consistent: Opzava Postgres holds the business record and the approval, and OpenClaw holds the runtime artifact that the broker projects back.

By context, the hybrid split is as follows.
Identity and Access is Opzava-owned, except security-audit inputs that read runtime approval and device-pairing gates (`docs/plan/capability-parity.md:121`).
Project Management is hybrid wherever agent snippets, Workboard lifecycle, or `tasks.*` and `sessions.*` enrich Opzava cards (`docs/plan/capability-parity.md:43-55`).
Internal Collaboration is hybrid for mention inbox and activity feeds, which project agent runtime events onto Opzava `Mention` and activity records (`docs/plan/capability-parity.md:65`).
AI Workforce is hybrid throughout: Opzava owns `AgentEmployee`, Department, and Persona; OpenClaw owns the session, task, usage, and skill runtime (`docs/plan/capability-parity.md:72-77`).
Knowledge Management is hybrid: Opzava KB and skill catalog are source of truth; OpenClaw memory-wiki and memory-lancedb are rebuildable derived indexes (`docs/plan/capability-parity.md:83-85`).
CRM was removed on 2026-07-15 (GitHub issue #200); its future user-side-dashboard rebuild will own customer truth while external conversation runtime remains behind the ACL.
External Channels is hybrid by design: Opzava Postgres holds channel correlation and projections; OpenClaw Gateway holds provider connectivity and runtime (`ARCHITECTURE.md:67`).
Department Workflows and Marketing are hybrid: Opzava defines and approves; OpenClaw executes cron, TaskFlow, standing orders, and sessions (`docs/plan/capability-parity.md:91-97`).
Finance and Billing is hybrid: usage comes from `usage.cost`; ledger, billing, and plan limits are Opzava-owned (`docs/plan/capability-parity.md:111-112`).
Notifications and Admin-Observability is hybrid: incident lifecycle, redaction, and alerting are Opzava-owned; runtime inputs are OpenClaw-owned (`docs/plan/capability-parity.md:118-123`).

## Depth and seam notes

The seam catalog is the agnostic ports table in `ARCHITECTURE.md:74-92`, implemented as files in `packages/ports`.
Each port file is one Seam: an Interface that core domain code depends on instead of a vendor SDK, Gateway DTO, payment DTO, or framework type (`ARCHITECTURE.md:18`).

`OpenClawGatewayPort` is the deepest Module in the system.
Its Interface hides the entire OpenClaw runtime surface (sessions, streams, tasks, channels, logs, diagnostics, usage, cron, approvals, skills, memory, Workboard projections) behind one seam (`ARCHITECTURE.md:78`).
The single Adapter is the `gateway-broker` OpenClaw client in `apps/gateway-broker`.
That is high Leverage (one interface, many capabilities) and high Depth (lots of behavior behind a small interface), and it is the only permitted ACL to OpenClaw (`CLAUDE.md` Non-Negotiables).

Most other ports currently have exactly one Adapter, so by the codebase-design rule they are hypothetical seams preserved for swap, not yet real seams.
`EventBusPort` claimed the Postgres outbox as its one adapter, but it had **zero** — the adapter was never built, and its only consumer took it as an optional dependency, so the "published" domain event silently went nowhere (#160). The port is deleted from code; ADR-004 stands, and any replacement must land with the outbox and its first real consumer under PRD-019/ADR-017 rather than historical #152. An uninhabited port is not a seam, hypothetical or otherwise: it is a dead feature wearing a seam's clothes.
`GatewayRuntimePort` has rootless Docker as its one adapter (`ARCHITECTURE.md:80`).
`PushNotificationPort`, `RealtimeTransportPort`, `AuthPort`, `AuthorizationPort`, `ObjectStorePort`, `ErrorCapturePort`, `EmbeddingProviderPort`, `KnowledgeIndexPort`, `KnowledgeSourcePort`, `SkillCatalogPort`, `SecretsVaultPort`, and `IssueTrackerPort` each list one initial adapter (`ARCHITECTURE.md:82-92`).
A second adapter at any of these is what would convert the hypothetical seam into a real seam.

`BillingPort` was removed on 2026-07-15 (GitHub issue #200); no BillingPort module, schema, or port exists in code.

Locality is enforced by the package layout.
Each Opzava-owned context that has been started gets one bounded-context package with its own Drizzle and Postgres ownership (`ARCHITECTURE.md:15`): `@opzava/identity-access`, `@opzava/project-management`, `@opzava/runtime-control`. The CRM package was removed and is deferred to the future user-side dashboard (GitHub issue #200).
Contexts without a package (Internal Collaboration, AI Workforce, Knowledge Management, Department Workflows, Finance and Billing, Notifications and Admin-Observability) have not yet been started or live temporarily in `apps/web` or `apps/workers` until their slice opens.
The OpenClaw-owned runtime contexts have no Opzava package by design: their Locality is `mainframe/`, reached only through the broker Adapter at the `OpenClawGatewayPort` seam.
