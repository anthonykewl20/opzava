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

**Mockup functional parity (user directive, 2026-07-03):** every visible element on a mockup screen a slice implements MUST function live - real data, real interactions; no dead buttons, no decorative chrome, no fake/placeholder data. If an element's backing capability is not yet built, the slice either builds it or the element is explicitly descoped IN THIS DOC with its arrival phase. Silent non-functionality is a bug.

## Current State

| Field | Value |
| --- | --- |
| Active slice | Slice 2 - Ask Admin Opzava on Tasks |
| Status | in-progress |
| Next concrete action | Slice 2 sub-slices 2a-2f implemented + committed on `slice/2-ask-admin-opzava`; 4/5 deliverables done; live real-Gateway proof complete. Remaining per Q16: install ask-admin agent config (model `openai/gpt-5.5`, native Codex runtime) into the platform Gateway, operator runs the per-environment Codex subscription OAuth sign-in (in-container runbook step) + configures `auth.order.openai` API-key fallback, real-agent acceptance run, then verify-deep + PR. Then Slice 2.5 (Q16): local Claude Code on Tasks via the Opzava MCP server. |
| Blockers | None |

## Operating Mode

Opzava runs single-tenant internally first to market and promote Opzava itself. The scale-ready multi-tenant architecture is retained and runs one tenant now; Opzava is not a public multi-tenant SaaS yet. The first business-value build after the admin-Tasks MVP is Marketing + CRM.

## Reference Map

| Reference | Use |
| --- | --- |
| `ARCHITECTURE.md` | System overview: bounded contexts, ports, invariants, deployment topology, ADR index. |
| `docs/plan/roadmap.md` | Phase detail after the admin Tasks MVP; this doc controls execution order. |
| `docs/plan/grilling-decisions.md` | Locked design record and sad-path invariants from Q1-Q16. |
| `docs/plan/official-docs.md` | Official documentation registry; validate every API against it before coding. |
| `docs/adr/` | Accepted architecture decisions ADR-001 through ADR-015. |
| `docs/prd/` | Product contracts PRD-001 through PRD-018. |
| `docs/plan/capability-parity.md` | OpenClaw-native vs Opzava-owned vs hybrid capability map. |
| `docs/openclaw/` | Vendored OpenClaw docs; harness native capabilities, do not reinvent them. |
| `docs/plan/backlog.md` | Initial ADR/PRD dependency backlog; planning input only — this doc controls order. |
| `docs/plan/consensus/` | Frozen consensus memos (evidence trail; see its README — never current truth). |
| `docs/plan/research/` | Frozen research memos incl. locked version pins (see its README). |
| `docs/plan/audits/` | Dated docs-audit reports. |
| `docs/runbooks/` | Operational runbooks (platform Gateway bring-up, pairing, model auth). |
| `docs/ux-law/` | Curated UX reference library for frontend/design work (PRD-017). |
| `ux-redesign/mockups/` | Canonical screen mockups; UI slices design to these with tokens from `style-guide.html` (PRD-017 contract). |

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
| `opzava-task-authoring` | How agents (Ask Admin, local Claude Code via MCP) write task cards humans understand: imperative titles, context/impact/evidence descriptions, verifiable steps with owners, status-forward comments, label/priority semantics. | Slice 2.5 | [ ] to build |

## The Build

Execute slices in order. Slice 1 is the dogfood MVP. From Slice 1 onward, all phase work is tracked inside the admin Tasks board.

Decided order (2026-07-02, operationalizes the Operating Mode; Slice 2.5 added 2026-07-03 per Q16): Slice 0 -> Slice 1 -> Slice 2 -> Slice 2.5 (local Claude Code on Tasks via MCP) -> Slice 3 (CRM core, thin) -> Slice 4 (Marketing content pipeline, thin) -> P1..P8 remainders. Slice 2 stays first because the broker/AI loop is the keystone both Marketing (agent-drafted content) and CRM (assistant/support drafts) depend on.

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

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [x] done

Foundation validated: `docs/plan/research/slice1-foundation-stack.md` (codex official-docs research + mmx adversarial consensus). Sub-slices: 1a foundation + parity Compose; 1b Postgres/Drizzle/`withTenant` RLS + migrations; 1c Better Auth admin login behind `AuthPort`; 1d app shell + admin nav; 1e Task aggregate + admin Tasks list/kanban; 1f seed build slices as Tasks + `verify-deep` + commit.

Goal: Ship the smallest real Opzava surface: admins log in and track Opzava's own build slices in an admin Tasks board.

Deliverables:

- [x] `docker-compose up` starts the local parity stack with Traefik and Postgres.
- [x] Better Auth admin sign-up/login runs behind `AuthPort` with DB-backed revocable sessions.
- [x] App shell renders admin navigation and tenant/workspace context.
- [x] Task aggregate persists `title`, `description`, `status`, `priority`, `assignee`, and `labels` in Postgres.
- [x] Admin Tasks supports list and kanban views, create/edit/move flows, reload persistence, and tenant/workspace RLS through `withTenant`.
- [x] Seed or create this build's slices as Tasks so Opzava tracks its own execution from here forward.

Skills: `docker`, `dokploy`, `postgres`, `nextjs`, `senior-frontend`, `domain-modeling`, `codebase-design`, `tdd`, `verify-deep`, `better-auth`*, `opzava-conventions`*

Acceptance / usable-signal: An admin logs in, creates tasks for the build's own slices, moves them across statuses, reloads, and sees state persist. The build is now tracked inside Opzava.

ADR refs: ADR-001, ADR-002, ADR-004, ADR-006, ADR-007, ADR-015

PRD refs: PRD-001, PRD-002, PRD-012

Bounded contexts: Identity & Access, Project Management, Tenant Provisioning, Platform-Ops, Notifications/Admin-Observability

### Slice 2 - Ask Admin Opzava on Tasks

Status: [ ] not-started | [x] in-progress | [ ] blocked | [ ] done

Goal: Add the first admin assistant loop so Ask Admin Opzava can read, create, and update admin Tasks through streaming chat.

Deliverables:

- [ ] Provision one platform OpenClaw agent reachable only through the broker. (Gateway provisioned + paired + live handshake validated, protocol 4 with exact hot-path scopes; REMAINING: install the ask-admin agent config into the Gateway, model-provider credential, real-agent acceptance run.)
- [x] Add a streaming Ask Admin Opzava chat panel on the admin Tasks board.
- [x] Expose task read/create/update operations through admitted server-side tools or application commands.
- [x] Persist assistant turns and tool outcomes with tenant/workspace authorization and idempotency.
- [x] Show task updates created by the assistant immediately in list and kanban views.

Skills: `socketio`, `nodejs`, `nextjs`, `openclaw-broker`*

Acceptance / usable-signal: Telling Ask Admin Opzava to add a task creates it, and it can list and update existing tasks. The build is now dogfooding the AI loop too.

ADR refs: ADR-003, ADR-008, ADR-009, ADR-013

PRD refs: PRD-005, PRD-018

Bounded contexts: Runtime-Control, AI Workforce, Project Management, Internal Collaboration, Notifications/Admin-Observability

### Slice 2.5 - Local Claude Code on Tasks via MCP + live Task Card (Q16)

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: The developer's local Claude Code session controls the admin Tasks board through Opzava's own MCP server (Q16 hybrid on-behalf-of authority), and the Task card detail matches `ux-redesign/mockups/essential-card.html` with every card feature working and live. Agent-written cards read like a human wrote them (task-authoring skill).

Deliverables:

- [ ] Task model extension: human-readable card id (per-workspace sequence + copy chip), due date, provenance ("added ... from ..."), watchers, Steps checklist (per-step assignee, done state, counter), Comments (human + AI-attributed, timestamps).
- [ ] Card detail page per the mockup - EVERY element functional live: id chip + copy + "What's this ID?" popover, title, status/label/due chips, assigned-to with AI badge, watching avatars, Mark done, overflow menu actions, Overview tab. AI Run tab: live plain-language run steps from assistant turns/tool receipts (target refs) incl. the live elapsed ticker while streaming. Evidence & Files tab: REAL attachments - upload/list/open via a new `ObjectStorePort` (MinIO added to compose parity stack), files with provenance ("Drafted by <assistant>" / "Attached from ..."), links section, live count badge. Quality Review tab: REAL review mechanism - check items (assistant pre-checks recorded from tool outcomes + human checks), reviewer states (pre-check passed / changes requested), approve action, all audited.
- [ ] AI liveness WITHOUT the P2 hub (derived from runtime-control stream/receipt state over the 2c SSE pattern): "assistant working..." on a step, "assistant is replying..." in comments, "Read by <assistant>" when the agent session consumed a comment; task-activity SSE feed (outbox/task events) so board + card update live on MCP/assistant mutations.
- [ ] Human read receipts + typing indicators, interim-live (per mockup functional parity): comment read markers (per-user read rows -> "Read by X" / "Sent - not read yet") and a lightweight per-card typing hint over the existing SSE feed (in-memory TTL, single web instance). P2 replaces the TRANSPORT with the WS hub + Redis presence; the UI contract ships now and works live across two sessions.
- [ ] @-mention popover in the comment composer; mentioning the assistant creates an assistant reply turn through the existing Slice 2 loop.
- [ ] Opzava-hosted MCP server exposing the governed task tool registry EXTENDED to the card surface (steps/comments/due/watchers CRUD alongside list/create/update) - same validation, outcome-first receipts, forbidden vs not_found; consumer-agnostic so P1 gateway `mcp.servers` registration is pure config.
- [ ] Scoped revocable link token (admin-UI issuance, shown once, hashed, `tasks:read`/`tasks:write`, expiry, dies with membership/session-version) + on-behalf-of `ToolExecutionContext` from the credential (client ids never authority) + `.mcp.json` connect recipe.
- [ ] GitHub issue linkage behind an agnostic `IssueTrackerPort` (GitHub adapter; credential via vault ref, never committed): a Task can link to a repo issue (opaque external ref on the card with the `#NN` chip). Issues admin page per `ux-redesign/mockups/issues.html` - EVERY element functional live against the real repo: "Synced with GitHub" header + repo link + real last-sync timestamp, "Sync now" (manual idempotent sync), "New issue" (creates a real GitHub issue through the port), triage-pipeline summary strip with REAL counts (Needs triage -> Ready for agent -> Ready for human -> In progress -> Done this week), working filter tabs (All/Needs triage/Ready for agent/Ready for human/In progress/Closed), issue table with number, title + real triage/area labels, assignee (incl. AI-agent mapping, "You", Unassigned), relative updated time, status, and the "Showing N of M open" footer. Issue rows are a REBUILDABLE PROJECTION - GitHub is the source of truth for issues; divergence (issue closed vs task open) is SHOWN, never auto-mutated. Internal phase: this repo's issues.
- [ ] `opzava-task-authoring` skill (authored via `writing-great-skills`): how agents write cards humans understand - imperative titles, context/impact/evidence descriptions, verifiable steps with owners, status-forward comments, label/priority semantics. Referenced by the Ask Admin AGENTS.md, the MCP tool descriptions, and local Claude Code.
- [ ] Task activity/audit shows actor-via-client attribution in the admin UI.

Skills: `nodejs`, `nextjs`, `senior-frontend`, `domain-modeling`, `better-auth`*, `opzava-conventions`*, `tdd`, `opzava-task-authoring`* (to build)

Acceptance / usable-signal: From a local Claude Code session: create a task with steps via MCP - the card appears live on the board and reads like a human wrote it; open the card and EVERY visible element on `essential-card.html` works (steps tick with strikethrough + counter + working indicator, comments post with read receipts and typing hints across two sessions, mention the assistant and watch it reply live, attach/open evidence files with provenance, complete a quality-review check + approve, due/labels/watchers edit, Mark done, id copy + popover, menu actions); on `issues.html` every element works against the real repo (sync now, new issue, triage counts, filters, table, footer); revoke the link token and the next MCP call fails clean; activity shows actor-via-claude-code.

ADR refs: ADR-004, ADR-005 (on-behalf-of), ADR-007, ADR-009 (degraded one-way path); Q16

PRD refs: PRD-003 (tasks/card), PRD-005 (assistant in threads), PRD-012 (issues page), PRD-013 (local tool link + connections, anticipated), PRD-017 (empty states)

Bounded contexts: Runtime-Control, Project Management, Identity & Access, Internal Collaboration (comments only)

Deferred: presence/read-receipt TRANSPORT upgrade (Redis + WS hub; UI contract ships live in this slice) -> P2; OpenClaw Workboard/AgentDispatch run-trace projections + gateway `mcp.servers` registration + autonomous-agent principal -> P1 (ADR-008). Nothing visible on the two mockup screens is deferred.

### Slice 3 - CRM core (thin, pulled forward from P4)

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Own customer truth in Postgres with manually managed CRM records so Opzava can track real prospects while promoting itself. No channel ingest yet.

Deliverables:

- [ ] Contact, Account, Deal (pipeline/stage), and Ticket aggregates with tenant/workspace RLS through `withTenant` (same pattern as the Task aggregate).
- [ ] Contacts and Accounts list + detail admin surfaces with manual create/edit.
- [ ] Deal pipeline board and a simple ticket queue (manual creation only; no `SenderSeen`/UnknownContact projection yet).
- [ ] Contact timeline skeleton fed by Opzava-owned activities only.
- [ ] Assistant read access via the Slice 2 loop: list/summarize CRM records through admitted server-side tools.

Skills: `postgres`, `domain-modeling`, `senior-frontend`, `tdd`, `opzava-conventions`*

Acceptance / usable-signal: An admin creates an Account and Contact, opens a Deal, moves it across stages, files a Ticket, reloads, and all state persists under RLS.

ADR refs: ADR-004, ADR-007, ADR-011

PRD refs: PRD-010 (thin subset)

Bounded contexts: CRM, Project Management, Identity & Access

Deferred to P4 remainder: `SenderSeen` projection, UnknownContact shells, channel ingest, governed ticket replies, Contact merge, GDPR erasure.

### Slice 4 - Marketing content pipeline (thin, pulled forward from P5)

Status: [ ] not-started | [ ] in-progress | [ ] blocked | [ ] done

Goal: Run Opzava's own marketing inside Opzava: campaigns and a content pipeline with the exact-version approval invariant, using the Slice 2 agent for drafting. Manual publish; no workflow engine yet.

Deliverables:

- [ ] Campaign and ContentItem aggregates (draft -> review -> approved -> published states) with RLS.
- [ ] Campaigns board plus Content Pipeline and Content Calendar views.
- [ ] Exact-version business approval invariant: no ContentItem reaches Published without an `Approval` matching the exact content version/hash (ADR-012 invariant, enforced from day one).
- [ ] Assistant drafting flow through the Slice 2 loop: drafts land in the pipeline as ContentItems.
- [ ] Manual publish/mark-published with audit trail; scheduling via cron/TaskFlow deferred to P5 remainder.

Skills: `nextjs`, `senior-frontend`, `domain-modeling`, `tdd`, `opzava-conventions`*, `openclaw-broker`*

Acceptance / usable-signal: A campaign is created, the assistant drafts a ContentItem, it goes through review and is approved at an exact version, then published manually with an audit trail; an unapproved or stale-version item cannot publish.

ADR refs: ADR-004, ADR-007, ADR-012 (approval invariant)

PRD refs: PRD-008, PRD-009 (thin subsets)

Bounded contexts: Marketing, Department Workflows (approval records only), AI Workforce, Project Management

Deferred to P5 remainder: Department Workflow engine, cron/TaskFlow publish runs, external channels, Automation page, report artifacts.

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

Goal: Own customer truth in Opzava while projecting external channel observations through the Gateway ACL. See `docs/plan/roadmap.md` P4 for deliverable detail. Note: the CRM core (records + admin surfaces) was pulled forward as Slice 3 (2026-07-02); this phase covers the remainder (channel ingest, projections, governed replies, merge/erasure).

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

Goal: Let Opzava define department work while OpenClaw executes native standing orders, cron, TaskFlow, sessions, and channels. See `docs/plan/roadmap.md` P5 for deliverable detail. Note: the Marketing content pipeline (campaigns, content states, exact-version approvals, manual publish) was pulled forward as Slice 4 (2026-07-02); this phase covers the remainder (workflow engine, cron/TaskFlow runs, Automation page, reports).

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

- 2026-07-03 - Q16 GRILLED + LOCKED (orchestrator runtime + local coding harness): ChatGPT/Codex subscription OAuth drives `openai/gpt-5.5` via OpenClaw's native Codex runtime on the platform Gateway (shared personal GPT Pro accepted for the internal phase; `auth.order.openai` API-key fallback + auth-monitoring; tripwire to dedicated account before external users/P5 automation); per-environment interactive sign-in (OAuth non-portable); broker streaming verified runtime-agnostic; local Claude Code connects via an Opzava-hosted MCP server exposing the 2d task-tool registry (NOT ACP - that spawns the harness on the gateway host; ACP revisited in P1); hybrid on-behalf-of authority (human's RBAC/RLS + client attribution); scoped revocable link token now, device-authorization flow at the multi-user tripwire. New Slice 2.5 inserted before Slice 3. Slice 2's remaining credential step is now the Codex OAuth sign-in, not an API key.
- 2026-07-03 - Slice 2 sub-slices 2a-2f GREEN + committed; live real-Gateway proof COMPLETE. 2a `@opzava/runtime-control` (turn state machine, outcome-first receipts, 0003 RLS with composite tenant FKs, withTenant role assert) after a spark red-team of the design memo (UNSOUND -> 9 findings resolved). 2b broker operator client + adversarial fake Gateway (found: ws success callback passes null not undefined). 2c internal-token SSE endpoint + OpenClawGatewayPort adapter + chat panel (broker env lazy; stream-state logic pure-TS for vitest). 2d governed task tools through PM services (UUID-shaped taskId rule; forbidden vs not_found split). 2e agent artifacts + provisioning receipts + compose profile `openclaw`; real image pinned 2026.6.11 and brought up healthy. 2f seed reorder (18 tasks, decided order) + protocol alignment to the LIVE gateway (client id/mode enums, sha256-raw device id, v2 signature payload, auth.deviceToken vs auth.token, metadata-bound approvals, implied operator.read) — vendored docs were stale on several of these; every fact verified in the running container and the fake tightened to match. Live loop proven: pairing request -> devices approve -> fresh device token vaulted by ref -> validation handshake protocol 4, scopes exactly write+approvals+read. Test-infra hardenings en route: slice1c suite parks/restores the first_owner_setup singleton; roadmap seed test self-heals leftovers; run-unique identifiers across suites. Remaining for slice-done: agent config install into the Gateway, model-provider credential (user), real-agent acceptance, verify-deep, PR.
- 2026-07-02 - Execution order DECIDED (user; resolves audit S1-2): Slice 2 stays next (the broker/AI loop is the keystone Marketing and CRM both need), then business value pulls forward — new Slice 3 (CRM core, thin P4 subset) and Slice 4 (Marketing content pipeline, thin P5 subset) inserted before P1-P3; P4/P5 sections now carry the remainders. Follow-up owned by Slice 2: re-order the dogfood Tasks board seed to the new slice order.
- 2026-07-02 - Docs deep-audit + sync fixes (codex-exec audit -> `docs/plan/audits/2026-07-02-docs-audit.md`, 21 findings, all applied except S1-2 which is a user decision). Fixed: roadmap.md superseded banner + historical P0/P0.5 markers; grilling-decisions.md Q13/Q15 recorded, Drizzle locked (was `Prisma|Drizzle TBD`), stale "Next Q13" queue removed, status now Q1-Q15; ADR-014/PRD-014 billing language recast as deferred null-adapter now / Stripe future design; official-docs.md gained missing registry rows + a "Current locked pins" section; new `docs/plan/consensus/README.md` + `docs/plan/research/README.md` frozen-evidence indexes; HISTORICAL banners on q13/q15 memos; TS 6.0.3 raw pin marked superseded; backlog.md marked planning-input with partial-chain note; CLAUDE.md doc map + this doc's Reference Map now cover backlog/consensus/research/audits/ux-law. Open decision (audit S1-2): operationalize "Marketing + CRM first" vs current Slice 2 -> P1..P8 order.
- 2026-07-02 - Slice 1f dogfood seed + verify-deep GREEN; **Slice 1 (Admin Tasks MVP) COMPLETE**. `apps/workers` `seed:roadmap` idempotently populates the admin Tasks board with the 16 remaining roadmap items (Slice 2, P1-P8, 7 de-risk follow-ups) via the PM services; smoke test proves idempotency as `opzava_app`. verify-deep across the workspace: typecheck 8/8, build 8/8, lint 9/9, all tests 13/13, seed 16 tasks, e2e loop pass. Fixes: workers `vitest.config` include src-only (the compiled `dist/**/*.test.js` double-ran and raced the `first_owner_setup` singleton), workers `tsconfig.build` excludes tests, `eslint.config.mjs` imports `@opzava/config` by relative path (repo root is not a workspace package), empty interface -> type alias. Note: `pnpm lint` can OOM/segfault at full parallelism on a constrained host; use `turbo run lint --concurrency=1`. Slice 1 = 1a..1f, all green + committed on `slice/1-admin-tasks-mvp`.
- 2026-07-02 - Slice 1e admin Tasks board GREEN. New `@opzava/project-management` bounded context: Task aggregate (title/description/status/priority/assignee/labels/position) + `0002` migration copying the 1b RLS pattern (FORCE RLS, current_org isolation, restrictive no-context, explicit grants, a composite `(workspace_id, organization_id)` FK preventing cross-org workspace assignment); application command/query services through `withTenant` + `AuthorizationPort`; admin Tasks board (list + kanban, create/edit/move) in the `(app)` shell reading via the 1d session context. Tasks RLS integration test 2/2 as `opzava_app` (create + cross-tenant isolation); board e2e passes. codex-spark PASS; the authz subject is session-grounded (documented contract) with RLS as the DB backstop. Fix en route: Drizzle spread `${array}::text[]` into a row expression -> use `sql.param()` for single-array binding. Build + typecheck 8/8.
- 2026-07-02 - Slice 1d admin app shell + auth UI GREEN. First-owner setup / login / signout pages (server actions -> FirstOwnerSetupService + AuthPort), the protected app shell + nav matched to the Essential mockups (design tokens from style-guide.html), Next 16 `proxy.ts` + `(app)` layout fail-closed guards, and the session->tenant resolver. Playwright e2e passes the full loop: first-owner setup signs in -> shell resolves tenant context -> signout revokes -> login restores. codex-spark fixes applied: fail-closed session context (removed the raw-cookie fallback that bypassed membership_version revocation), domain password policy (12+ chars + 3 classes), `sql` re-exported from `@opzava/adapters` (keeps web off a direct drizzle dep). Build + typecheck 7/7; 1c regression green.
- 2026-07-02 - Slice 1c auth boundary GREEN. Better Auth core (1.6.23) behind `AuthPort` with DB-backed revocable sessions (cookie cache disabled), a custom scrypt hasher shared with an ATOMIC first-owner setup (advisory lock + singleton guard, all writes in one `opzava_app` tx), the `app.current_user` identity read-path for pre-tenant membership discovery, and the 0001 migration (global auth tables + membership/role_grants RLS). Design: codex memo + mmx auth/RLS red-team (`docs/plan/consensus/slice1c-auth-redteam.mmx.md`, 6 hardenings folded in); codex-spark review SOUND (0 findings). Acceptance test passes (40 assertions: atomic setup + forced-rollback, DB session + revoke, run-once guard, identity-path isolation, tenant denial) as non-owner `opzava_app`. Build + typecheck 7/7. Fixes en route: scrypt promisify overload, drizzle `_journal` 0001 entry, flat `dist` (`rootDir: src`) so packages resolve by name, lazy pg client (no import side-effects), `BETTER_AUTH_URL` turbo passthrough. Pins: better-auth 1.6.23, @better-auth/drizzle-adapter 1.6.23.
- 2026-07-02 - Slice 1b tenant-isolation data layer GREEN. `@opzava/identity-access` (canonical organizations/workspaces + hand-written RLS migration) + `@opzava/adapters` (pg client, `withTenant`, sanitized errors, one-shot migrate runner, SHA-256 migration gate). Design: codex memo + mmx RLS red-team (`docs/plan/consensus/slice1b-rls-redteam.mmx.md`); codex-spark review returned SOUND (`docs/plan/consensus/slice1b-review.spark.md`). RLS integration test passes 3/3 as non-owner `opzava_app`: cross-tenant read invisible, cross-tenant write 403, missing-context 403. Hardenings: RESTRICTIVE no-context policy, `set_config()` instead of interpolated SET LOCAL, explicit per-table grants (no blanket default privileges), error-mapper walks Drizzle's `cause` chain for SQLSTATE, test asserts it runs as `opzava_app`. Fixes en route: pnpm `allowBuilds` esbuild, `tsx` migrate runner, `TenantTransaction` type extraction. Pins: drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg 8.22.0.
- 2026-07-02 - Slice 1a foundation GREEN. Monorepo scaffolded (codex-exec gpt-5.5 codegen) + adversarially reviewed (codex-spark, `docs/plan/consensus/slice1a-review.spark.md`) + fixed. `pnpm install` clean, typecheck 5/5, test 6/6, `next build` production build passes; `docker compose up` brings up Traefik (18088/18448) + Postgres 18.4 (healthy). Key fixes: `turbo@^2.10.2` (no v3 exists), pnpm 11.9 build gate is `allowBuilds: {sharp: true}` (not `onlyBuiltDependencies`), Traefik host ports remapped 18088/18448/18089 off the local-Dokploy collision, Vitest 4 oxc needs relative tsconfig `extends` (not the `@opzava/config` package specifier), `NODE_ENV` is read-only under @types/node 24, Traefik dashboard moved to a local-only `docker-compose.override.yml`, `DATABASE_URL` deferred to 1b.
- 2026-07-02 - Slice 1 foundation validated: codex-exec deep-researched official docs -> `docs/plan/research/slice1-foundation-stack.md` (Node 24.18, pnpm 11.9, Next 16.2.9, React 19.2.7, Drizzle 0.45.2 stable, Postgres 18.4, Better Auth 1.6 org/2FA/passkey, Tailwind v4.3, Traefik v3.6.1). mmx adversarial consensus locked TS 5.9.x over 6.0.3, a PgBouncer-transaction RLS client with prepared statements off, boundaries lint, Vitest, migration gating, and env-schema fail-fast. Next: scaffold sub-slice 1a.
- 2026-07-02 - Slice 0 spike PASS: validated Traefik routing to dynamic Gateway containers, broker WS route, worker-only Docker mutation through socket-proxy, Docker API pinning need, and denied endpoint behavior; findings recorded in ADR-015 and the provisioning skill.
- 2026-07-02 - codex+mmx review confirmed genuine infra proof, not a fake pass; real OpenClaw handshake, wildcard TLS/DNS, readiness/backoff, reaper concurrency, lazy-start cost, secrets lifecycle, and Dokploy mapping gaps captured as follow-ups.
- 2026-07-02 - Governance updated: official-docs validation rule and registry added; BillingPort deferred as a null adapter until external monetization; operating mode clarified as internal single-tenant first, then Marketing + CRM after the admin-Tasks MVP.
- 2026-07-02 - Authored the 4 build skills (openclaw-broker, openclaw-gateway-provisioning, better-auth, opzava-conventions) in `.claude/skills/`; Slice 0 ready to implement.
- 2026-07-02 - EXECUTION.md created; design complete (15 ADRs + 18 PRDs verified); next action = Slice 0 de-risk spike.
