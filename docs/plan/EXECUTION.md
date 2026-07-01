# Opzava Execution Control

This is the single living control doc for building Opzava. An active or autonomous agent reads this first, executes the first unchecked slice only, and updates this file as reality changes.

This doc supersedes the generic walking-skeleton MVP in `docs/plan/roadmap.md`. The MVP is now the admin-side Tasks board: dogfood Opzava to build Opzava.

## How To Use This Doc

### Agent Operating Protocol

1. Read this document top-to-bottom at the start of every session.
2. Read `ARCHITECTURE.md` and `CLAUDE.md` before touching code.
3. Find the first unchecked slice under Current State and The Build. Never skip ahead.
4. Load that slice's listed Skills before implementation.
5. If a listed Skill is in Skills To Build and is not yet created, author it first with the `writing-great-skills` skill, then use it for the slice.
6. Validate APIs against official docs before coding: `docs/plan/official-docs.md`, `docs/openclaw`, and current framework/library docs.
7. Implement only that slice. Keep changes inside the slice's bounded contexts and deliverables.
8. Use `tdd` while implementing and `verify-deep` before marking the slice done.
9. Run the slice Acceptance / usable-signal exactly as written.
10. Tick deliverable checkboxes only after they match reality.
11. Set the slice Status, update Current State, append a dated Worklog entry, and keep this doc in sync.
12. Commit with `commit-style` after the doc and code match reality.
13. Stop or continue from the next unchecked slice. Use `handoff` for clean start/stop/resume.

Do not let this document become aspirational. If implementation changes the plan, update this document in the same slice.

## Current State

| Field | Value |
| --- | --- |
| Active slice | Slice 1 - Admin Tasks MVP |
| Status | in-progress |
| Next concrete action | Slice 1c: Better Auth admin sign-up/login behind `AuthPort` with revocable DB sessions; map Better Auth org tables as subordinate mirrors to canonical `organizations`. Resolve the `@better-auth/drizzle-adapter` import path from the installed manifest. |
| Blockers | None |

## Operating Mode

Opzava runs single-tenant internally first to market and promote Opzava itself. The scale-ready multi-tenant architecture is retained and runs one tenant now; Opzava is not a public multi-tenant SaaS yet. The first business-value build after the admin-Tasks MVP is Marketing + CRM.

## Reference Map

| Reference | Use |
| --- | --- |
| `ARCHITECTURE.md` | System overview: bounded contexts, ports, invariants, deployment topology, ADR index. |
| `docs/plan/roadmap.md` | Phase detail after the admin Tasks MVP; this doc controls execution order. |
| `docs/plan/grilling-decisions.md` | Locked design record and sad-path invariants from Q1-Q14. |
| `docs/plan/official-docs.md` | Official documentation registry; validate every API against it before coding. |
| `docs/adr/` | Accepted architecture decisions ADR-001 through ADR-015. |
| `docs/prd/` | Product contracts PRD-001 through PRD-018. |
| `docs/plan/capability-parity.md` | OpenClaw-native vs Opzava-owned vs hybrid capability map. |
| `docs/openclaw/` | Vendored OpenClaw docs; harness native capabilities, do not reinvent them. |

## Skills

### Available Skills

| Area | Skills |
| --- | --- |
| Frontend | `nextjs`, `senior-frontend`, `frontend` |
| Backend | `nodejs`, `postgres`, `redis`, `bullmq`, `socketio` |
| Infra | `docker`, `dokploy` |
| Design | `codebase-design`, `domain-modeling`, `architecture` |
| Quality | `tdd`, `verify-deep`, `verify-dont-assume`, `code-review`, `review` |
| Process | `implement`, `handoff`, `prototype`, `commit-style`, `setup-pre-commit`, `to-issues` |

### Skills To Build

Author each skill with `writing-great-skills` before the first slice that needs it.

| Skill | Why | When needed | Status |
| --- | --- | --- | --- |
| `openclaw-broker` | Captures the WS operator protocol client, two-token model, stream relay, tenant routing, idempotency, and broker ACL rules. | Slice 0, Slice 2 | [x] created — `.claude/skills/openclaw-broker/` |
| `openclaw-gateway-provisioning` | Captures docker-socket-proxy usage, `GatewayRuntimePort`, dynamic Gateway containers, Traefik labels, leases, and reaper constraints. | Slice 0 | [x] created — `.claude/skills/openclaw-gateway-provisioning/` |
| `better-auth` | Captures Better Auth behind `AuthPort`, revocable DB sessions, TOTP/passkeys, disabled cookie cache, and in-transaction invitation re-validation. | Slice 1 | [x] created — `.claude/skills/better-auth/` |
| `opzava-conventions` | Project skill for `withTenant` RLS wrapper, two-token split, projections-are-cache, tool-policy-first, and other local invariants. | Slice 1 | [x] created — `.claude/skills/opzava-conventions/` |

## The Build

Execute slices in order. Slice 1 is the dogfood MVP. From Slice 1 onward, all phase work is tracked inside the admin Tasks board.

### Slice 0 - De-risk spike (throwaway)

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [x] done

Goal: Prove the riskiest local runtime path before product code: provisioning worker -> Docker socket proxy -> dynamic Gateway -> Traefik -> broker WS -> first streamed token.

Deliverables:

- [x] Throwaway local Compose spike with Traefik, `docker-socket-proxy`, and `dokploy-network` assumptions.
- [x] `spike-provisioner` starts exactly one OpenClaw Gateway or fake Gateway container through a `GatewayRuntimePort`-shaped adapter.
- [x] Gateway container receives generated Traefik labels, `opzava.gateway=true`, tenant/Gateway labels, and attaches to `dokploy-network`.
- [x] `spike-broker` dials the Gateway over WS and performs the two-token auth shape.
- [x] Local script triggers provisioning and prints a final streamed token round-trip receipt with tenant id, route, idempotency key, and policy decision.

Skills: `docker`, `dokploy`, `nodejs`, `socketio`, `openclaw-broker`*, `openclaw-gateway-provisioning`*

Acceptance / usable-signal: A script triggers provisioning locally; Traefik routes to the dynamically created Gateway container; the broker receives and relays a streamed response token end-to-end through Traefik.

ADR refs: ADR-002, ADR-003, ADR-005, ADR-015

PRD refs: none directly; architecture proof only

Bounded contexts: Tenant Provisioning, Platform-Ops, Runtime-Control, Gateway Runtime

Real-implementation de-risk follow-ups:

- [ ] Real OpenClaw operator WS handshake: `connect.challenge` nonce signing, device-token pairing, protocol v4, `operator.write` + `operator.approvals` scopes.
- [ ] Wildcard TLS issuance/renewal plus `*.localhost` / `*.opzava.app` DNS lifecycle and SNI.
- [ ] Readiness/health gating plus reconnect/backoff/circuit-breaker behavior under sustained load and idle WS death.
- [ ] Reaper concurrency with leases/fencing to avoid double-kill and orphan Gateway containers.
- [ ] Lazy-start/idle-stop cold-start latency versus idle cost.
- [ ] Secrets lifecycle for device tokens, TLS certs, Gateway keys, rotation, and per-tenant scoping.
- [ ] Mapping onto Dokploy's Compose deployer while attaching to Dokploy's existing Traefik.

### Slice 1 - Admin Tasks MVP (dogfoodable)

Status: [ ] not-started | [x] in-progress | [ ] blocked | [ ] done

Foundation validated: `docs/plan/research/slice1-foundation-stack.md` (codex official-docs research + mmx adversarial consensus). Sub-slices: 1a foundation + parity Compose; 1b Postgres/Drizzle/`withTenant` RLS + migrations; 1c Better Auth admin login behind `AuthPort`; 1d app shell + admin nav; 1e Task aggregate + admin Tasks list/kanban; 1f seed build slices as Tasks + `verify-deep` + commit.

Goal: Ship the smallest real Opzava surface: admins log in and track Opzava's own build slices in an admin Tasks board.

Deliverables:

- [x] `docker-compose up` starts the local parity stack with Traefik and Postgres.
- [ ] Better Auth admin sign-up/login runs behind `AuthPort` with DB-backed revocable sessions.
- [ ] App shell renders admin navigation and tenant/workspace context.
- [ ] Task aggregate persists `title`, `description`, `status`, `priority`, `assignee`, and `labels` in Postgres.
- [ ] Admin Tasks supports list and kanban views, create/edit/move flows, reload persistence, and tenant/workspace RLS through `withTenant`.
- [ ] Seed or create this build's slices as Tasks so Opzava tracks its own execution from here forward.

Skills: `docker`, `dokploy`, `postgres`, `nextjs`, `senior-frontend`, `domain-modeling`, `codebase-design`, `tdd`, `verify-deep`, `better-auth`*, `opzava-conventions`*

Acceptance / usable-signal: An admin logs in, creates tasks for the build's own slices, moves them across statuses, reloads, and sees state persist. The build is now tracked inside Opzava.

ADR refs: ADR-001, ADR-002, ADR-004, ADR-006, ADR-007, ADR-015

PRD refs: PRD-001, PRD-002, PRD-012

Bounded contexts: Identity & Access, Project Management, Tenant Provisioning, Platform-Ops, Notifications/Admin-Observability

### Slice 2 - Ask Admin Opzava on Tasks

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Add the first admin assistant loop so Ask Admin Opzava can read, create, and update admin Tasks through streaming chat.

Deliverables:

- [ ] Provision one platform OpenClaw agent reachable only through the broker.
- [ ] Add a streaming Ask Admin Opzava chat panel on the admin Tasks board.
- [ ] Expose task read/create/update operations through admitted server-side tools or application commands.
- [ ] Persist assistant turns and tool outcomes with tenant/workspace authorization and idempotency.
- [ ] Show task updates created by the assistant immediately in list and kanban views.

Skills: `socketio`, `nodejs`, `nextjs`, `openclaw-broker`*

Acceptance / usable-signal: Telling Ask Admin Opzava to add a task creates it, and it can list and update existing tasks. The build is now dogfooding the AI loop too.

ADR refs: ADR-003, ADR-008, ADR-009, ADR-013

PRD refs: PRD-005, PRD-018

Bounded contexts: Runtime-Control, AI Workforce, Project Management, Internal Collaboration, Notifications/Admin-Observability

### P1 - AI Workforce

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Turn the one Ask Opzava agent into an operable AI workforce with departments, assignments, policy, automation entry points, and run evidence. See `docs/plan/roadmap.md` P1 for deliverable detail.

Deliverables:

- [ ] Implement the AI Workforce domain model and opaque OpenClaw refs.
- [ ] Ship Agents roster and agent detail admin surfaces.
- [ ] Implement create/edit/pause/deprovision through audited provisioning jobs.
- [ ] Add delegate/assign flow from Ask Opzava and PM cards.
- [ ] Add AI task board and run trace projections.

Skills: `nodejs`, `socketio`, `openclaw-broker`*, `bullmq`, `tdd`

Acceptance / usable-signal: An admin creates a Marketing or Support AI employee, assigns a PM card from Ask Opzava, watches the AI task board update, opens run trace evidence, and sees the employee-attributed report linked back to the card.

ADR refs: ADR-008

PRD refs: PRD-005, PRD-006

Bounded contexts: AI Workforce, Runtime-Control, Project Management, Internal Collaboration, Tenant Provisioning, Platform-Ops, Notifications/Admin-Observability

### P2 - Realtime + PWA

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Make collaboration durable and live, then installable, without making Web Push or Redis an auth or durability boundary. See `docs/plan/roadmap.md` P2 for deliverable detail.

Deliverables:

- [ ] Promote stream relay into the broker-hosted WS hub with Redis fan-out and reconnect backfill.
- [ ] Ship Internal Collaboration chat, rooms, DMs, threads, mentions, reactions, and read cursors.
- [ ] Add presence and typing as Redis TTL hints only.
- [ ] Treat AI assistants as first-class chat participants.
- [ ] Ship PWA manifest, service worker, offline shell, and Web Push preferences.

Skills: `socketio`, `redis`, `senior-frontend`, `nextjs`

Acceptance / usable-signal: Two users chat live, recover missed messages after reconnect, install the PWA, see only the safe offline shell while offline, and open a safe Web Push mention after session authorization.

ADR refs: ADR-009

PRD refs: PRD-004, PRD-016, PRD-017

Bounded contexts: Internal Collaboration, Notifications/Admin-Observability, Identity & Access, AI Workforce, Runtime-Control, Project Management

### P3 - Knowledge

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Give people and AI employees governed project/org knowledge while keeping OpenClaw memory/wiki/vector state derived. See `docs/plan/roadmap.md` P3 for deliverable detail.

Deliverables:

- [ ] Ship Docs & Files in the Essential project shell.
- [ ] Implement Knowledge Management source records, revisions, provenance, and promotion state.
- [ ] Implement OKF export/import ingestion through `KnowledgeIndexPort`.
- [ ] Enforce employee workspace plus project/org corpus overlay scoping.
- [ ] Add assistant citations and stale/degraded knowledge states.

Skills: `postgres` (pgvector), `nodejs`

Acceptance / usable-signal: A member uploads a document, promotes it to project knowledge, receives an OKF ingestion receipt, asks the assistant a question with a citation, then revokes the source and sees retrieval become stale or scrubbed.

ADR refs: ADR-010

PRD refs: PRD-007

Bounded contexts: Knowledge Management, AI Workforce, Runtime-Control, Project Management, Tenant Provisioning, Platform-Ops, Object Storage adapters

### P4 - CRM

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Own customer truth in Opzava while projecting external channel observations through the Gateway ACL. See `docs/plan/roadmap.md` P4 for deliverable detail.

Deliverables:

- [ ] Ship Contacts, Accounts, Deals, Activities, Tickets, Segments, Consent, and `ChannelIdentity` views.
- [ ] Implement conservative sender projection and UnknownContact shells.
- [ ] Ship support ticket queue/board.
- [ ] Implement governed ticket reply workflow.
- [ ] Add Contact merge and GDPR erasure skeleton.

Skills: `postgres`, `senior-frontend`, `domain-modeling`

Acceptance / usable-signal: An inbound channel observation creates an UnknownContact and Ticket, a human resolves it to a Contact, Support drafts an approved reply, and the Contact timeline remains readable when Gateway transcript detail is unavailable.

ADR refs: ADR-011

PRD refs: PRD-010

Bounded contexts: CRM, External Channels, AI Workforce, Runtime-Control, Knowledge Management, Project Management, Internal Collaboration

### P5 - Dept-Workflows + Marketing

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Let Opzava define department work while OpenClaw executes native standing orders, cron, TaskFlow, sessions, and channels. See `docs/plan/roadmap.md` P5 for deliverable detail.

Deliverables:

- [ ] Implement Department Workflow engine records and run lifecycle.
- [ ] Ship Automation page and recent run controls.
- [ ] Ship Marketing dashboard, Campaigns, Content Pipeline, and Content Calendar.
- [ ] Enforce exact-version business approvals before scheduling or publishing.
- [ ] Ship Marketing approvals, assets, review, and report artifacts.

Skills: `bullmq`, `nodejs`

Acceptance / usable-signal: A Marketing user creates a campaign, asks Atlas to draft content, sends the exact version for review, approves it, schedules it, sees the cron/TaskFlow publish run execute once, and opens a report artifact with provenance.

ADR refs: ADR-012

PRD refs: PRD-008, PRD-009

Bounded contexts: Department Workflows, Marketing, AI Workforce, Knowledge Management, Runtime-Control, Internal Collaboration, Project Management, External Channels

### P6 - Finance + Billing

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Add money visibility, money-risk approvals, usage metering, plan limits, and dunning while keeping billing provider state behind a port. See `docs/plan/roadmap.md` P6 for deliverable detail.

Deliverables:

- [ ] Ship Finance Costs page, ledger, budget meter, artifacts, and exports.
- [ ] Implement Finance money-risk policy and approvals.
- [ ] Implement Billing domain records and `BillingPort`.
- [ ] Add `worker-metering` usage polling through broker ACL.
- [ ] Enforce plan limits and dunning/suspension integration with tenant lifecycle.

Skills: `nodejs`, `postgres`

Acceptance / usable-signal: An owner sets an active local billing entitlement, sees Gateway cost usage update, hits a configured budget cap that blocks new agent work, approves one Finance money action, and simulates failed payment suspension while safe billing repair pages remain reachable.

ADR refs: ADR-014

PRD refs: PRD-011, PRD-014

Bounded contexts: Finance, Billing, Tenant Provisioning, Platform-Ops, Runtime-Control, Department Workflows, Notifications/Admin-Observability, Identity & Access

### P7 - Notifications + Admin + Error Pipeline

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Make operational truth visible and repairable with one-tenant blast radius, redaction, and governed Ask Admin Opzava remediation. See `docs/plan/roadmap.md` P7 for deliverable detail.

Deliverables:

- [ ] Implement ADR-013 incident pipeline with redaction, grouping, deadletter, and watchdog.
- [ ] Ship Admin observability screens and tenant-visible incident center.
- [ ] Implement alert routes and notification fan-out.
- [ ] Ship Ask Admin Opzava investigation and remediation proposal path.
- [ ] Implement dry-run-first remediation lifecycle and reaper dashboard.

Skills: `bullmq`, `redis`, `socketio`

Acceptance / usable-signal: A simulated Gateway-down or broker error creates or reopens one ADMIN card with redacted evidence, triggers an alert, Ask Admin Opzava proposes one-tenant dry-run remediation, an authorized user approves it, and the resulting audit trail exposes no secrets or cross-tenant data.

ADR refs: ADR-013

PRD refs: PRD-012, PRD-018

Bounded contexts: Notifications/Admin-Observability, Platform-Ops, Tenant Provisioning, Runtime-Control, Internal Collaboration, Billing, Identity & Access

### P8 - External Channels + Guest + Polish

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Finish customer-facing and integration edges: governed channels, guest portal access, local tool links, and production polish. See `docs/plan/roadmap.md` P8 for deliverable detail.

Deliverables:

- [ ] Ship Connections and settings touchpoints for Gateway, providers, channels, tools, health, config, deployment, security, and billing.
- [ ] Implement Slack, WhatsApp, Gmail, and email channel connect/reconnect/pause/remove flows through Gateway/provisioning paths.
- [ ] Enforce external channel send policy across bindings, consent, autonomy tier, approvals, rate caps, plan limits, and audit.
- [ ] Ship user tool connect wizard without copied long-lived secrets.
- [ ] Ship Guest-Client magic links and scoped portal.
- [ ] Complete PRD-017 polish across all screens.

Skills: `nodejs`, `senior-frontend`

Acceptance / usable-signal: A tenant admin connects Gmail or Slack, an external message creates CRM support work, Support sends an approved reply, a project manager creates a Guest-Client link, the customer comments in a scoped portal, and a local operator links Codex CLI without long-lived secrets appearing in UI or source.

ADR refs: ADR-003 external

PRD refs: PRD-013, PRD-015

Bounded contexts: External Channels, CRM, Identity & Access, Project Management, Runtime-Control, Tenant Provisioning, Platform-Ops, Knowledge Management, Billing, Notifications/Admin-Observability

## Definition Of Done

Per slice:

- [ ] Deliverables are checked and match implemented behavior.
- [ ] Acceptance / usable-signal passed exactly as written.
- [ ] `tdd` tests are present for meaningful behavior.
- [ ] Lint, typecheck, and relevant test suites are green under `verify-deep`.
- [ ] Local and Dokploy parity remain intact: single Compose contract, Traefik labels, stable service names, and parity CI/checks.
- [ ] This document is updated: Current State, slice Status, deliverable boxes, and Worklog.
- [ ] Changes are committed with `commit-style`.

## Worklog

- 2026-07-02 - Slice 1b tenant-isolation data layer GREEN. `@opzava/identity-access` (canonical organizations/workspaces + hand-written RLS migration) + `@opzava/adapters` (pg client, `withTenant`, sanitized errors, one-shot migrate runner, SHA-256 migration gate). Design: codex memo + mmx RLS red-team (`docs/plan/consensus/slice1b-rls-redteam.mmx.md`); codex-spark review returned SOUND (`docs/plan/consensus/slice1b-review.spark.md`). RLS integration test passes 3/3 as non-owner `opzava_app`: cross-tenant read invisible, cross-tenant write 403, missing-context 403. Hardenings: RESTRICTIVE no-context policy, `set_config()` instead of interpolated SET LOCAL, explicit per-table grants (no blanket default privileges), error-mapper walks Drizzle's `cause` chain for SQLSTATE, test asserts it runs as `opzava_app`. Fixes en route: pnpm `allowBuilds` esbuild, `tsx` migrate runner, `TenantTransaction` type extraction. Pins: drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg 8.22.0.
- 2026-07-02 - Slice 1a foundation GREEN. Monorepo scaffolded (codex-exec gpt-5.5 codegen) + adversarially reviewed (codex-spark, `docs/plan/consensus/slice1a-review.spark.md`) + fixed. `pnpm install` clean, typecheck 5/5, test 6/6, `next build` production build passes; `docker compose up` brings up Traefik (18088/18448) + Postgres 18.4 (healthy). Key fixes: `turbo@^2.10.2` (no v3 exists), pnpm 11.9 build gate is `allowBuilds: {sharp: true}` (not `onlyBuiltDependencies`), Traefik host ports remapped 18088/18448/18089 off the local-Dokploy collision, Vitest 4 oxc needs relative tsconfig `extends` (not the `@opzava/config` package specifier), `NODE_ENV` is read-only under @types/node 24, Traefik dashboard moved to a local-only `docker-compose.override.yml`, `DATABASE_URL` deferred to 1b.
- 2026-07-02 - Slice 1 foundation validated: codex-exec deep-researched official docs -> `docs/plan/research/slice1-foundation-stack.md` (Node 24.18, pnpm 11.9, Next 16.2.9, React 19.2.7, Drizzle 0.45.2 stable, Postgres 18.4, Better Auth 1.6 org/2FA/passkey, Tailwind v4.3, Traefik v3.6.1). mmx adversarial consensus locked TS 5.9.x over 6.0.3, a PgBouncer-transaction RLS client with prepared statements off, boundaries lint, Vitest, migration gating, and env-schema fail-fast. Next: scaffold sub-slice 1a.
- 2026-07-02 - Slice 0 spike PASS: validated Traefik routing to dynamic Gateway containers, broker WS route, worker-only Docker mutation through socket-proxy, Docker API pinning need, and denied endpoint behavior; findings recorded in ADR-015 and the provisioning skill.
- 2026-07-02 - codex+mmx review confirmed genuine infra proof, not a fake pass; real OpenClaw handshake, wildcard TLS/DNS, readiness/backoff, reaper concurrency, lazy-start cost, secrets lifecycle, and Dokploy mapping gaps captured as follow-ups.
- 2026-07-02 - Governance updated: official-docs validation rule and registry added; BillingPort deferred as a null adapter until external monetization; operating mode clarified as internal single-tenant first, then Marketing + CRM after the admin-Tasks MVP.
- 2026-07-02 - Authored the 4 build skills (openclaw-broker, openclaw-gateway-provisioning, better-auth, opzava-conventions) in `.claude/skills/`; Slice 0 ready to implement.
- 2026-07-02 - EXECUTION.md created; design complete (15 ADRs + 18 PRDs verified); next action = Slice 0 de-risk spike.
