# Opzava Capability-Parity Map

Current Admin placement authority is [PRD-020](../prd/PRD-020-admin-control-center.md) plus
[`admin-control-center-foundation-decisions.md`](admin-control-center-foundation-decisions.md).
This map mirrors their composition boundary and maps it to current code and upstream capabilities.
The frozen grilling, Control-UI port program, and `ux-redesign/mockups/*.html` remain historical or
parity evidence, not current placement authority. OpenClaw capability facts remain grounded in
`docs/openclaw`.

> **Current versus target (2026-07-16):** the current shell still exposes the root Overview, Tasks,
> Issues, Ask Admin, and Connections routes. The target Admin Control Center, sidebar, Variant A
> Overview, dedicated setup pages, and taxonomy below are not built merely because they are mapped
> here. CRM, Marketing, and Finance are not Admin destinations. Usage & Costs is operational
> consumption, quota, capacity, and spend visibility—not billing, invoices, or Finance authority.

> **Dev Board pivot (2026-07-15):** PRD-019/ADR-017 supersede separate Tasks and Issues product surfaces with one **Dev Board**: Summary, List, Board, Sprints, Docs, Development, and Releases. Current `/tasks` and `/issues` modules remain truthful legacy implementation inventory until migrated. OpenClaw Workboard is still deliberately not ported. See `docs/plan/dev-board-migration-manifest.md`; historical issue numbers #147–#157 are not the future implementation source.

## Admin Control Center target (not built)

The selected Admin Overview is **Variant A — Priority Command Center**. Its durable visual evidence
is commit `0dd1bff305e4049d506b997330c5039485107798`, branch `prototype/admin-shell-v1`, file
`apps/web/public/prototypes/admin-shell-v1.html`, query `?variant=A`. Fixture data is non-normative.
The reading order is **Needs Your Attention**, **Active Delivery**, **Development Readiness**, then
**Recent Activity**. Sprint progress may appear only as source-owned Active Delivery content, not a
fifth Overview section. Admin Overview is distinct from Dev Board Summary and owns no business
mutation. Navigation, refresh, and owner-command launch are allowed; the owning context reauthorizes
every command.

Admission is capability-backed. The shell is stable; the Overview is a request-scoped, sectioned
composition of source-owned projections. `AuthorizationPort` and tenant admission run before each
source query, with Postgres RLS where applicable and broker ACL for OpenClaw. Denied sources are not
queried. Root or deep-link denial is a hard 403. Restricted presentation discloses no source
existence, IDs, counts, last-known-good data, raw Gateway/OpenClaw references, credentials, or
secrets. An unexpected downstream 403 is a security/contract failure. Only owner-classified
browser-safe Opzava projection IDs and deep links may cross the browser boundary.

Each section reports its owner, provenance, `asOf`, checkpoint/version, freshness threshold, and
`fresh | stale | unavailable | unknown` state; partial failures remain section-local and cannot be
summed or reported healthy. Platform health/readiness means a capability can safely operate now
with current evidence. Attention is a separate actor-authorized queue of human actions or decisions;
degraded health may create attention, but the two are not interchangeable.

| Group | Destinations in order |
| --- | --- |
| Pinned | Ask Admin Opzava |
| DEVELOP | Overview; Dev Board; Runners; Environments |
| AI RUNTIME | Gateway; Models & Providers; Agents; Runtime Skills; Sessions & Runs; Automations |
| OPERATE | Health; Incidents; Logs; Usage & Costs |
| CONFIGURE | Integrations; Engineering Skills; MCP Servers; Secrets; Security & Audit; Settings |

Engineering Skills are the Opzava-governed upstream-tracked/fork-derived engineering catalog;
Runtime Skills are OpenClaw-native; the Ask Admin skill subset is an effective allowlist, not a third
catalog; MCP Servers are policy-governed endpoints and projected tools, not skills. An upstream
OpenClaw capability does not imply current Opzava adapter, BFF, or UI coverage: the Admin pages in
this section, including Runtime Skills and MCP Servers, are target-only until their ports and
projections ship. OpenClaw Nodes, OpenClaw Devices, and ADR-017 Dev Board Runners are three distinct
identities and trust domains: Node pairing and Device pairing are distinct, and neither grants
Runner admission, leases, worktrees, checkpoints, or Review access; Runner enrollment never grants
Gateway operator/device scope; co-location on one machine does not merge identity, health,
revocation, or authority. V1 Integrations and Automations are limited to platform-development and
runtime administration; customer-channel, campaign, CRM/support, publishing, and Finance workflows
do not re-enter through those destinations.

## Classification legend

| Classification                   | Meaning                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenClaw-native (harness)        | OpenClaw already owns the runtime capability. Opzava should harness it through the backend-only `gateway-broker` ACL.                                      |
| Opzava-owned (build in Postgres) | Opzava is the system of record and must build the product data model, RBAC, workflows, and UI persistence in Postgres.                                     |
| Hybrid                           | Opzava owns the business/product record, while OpenClaw owns agent runtime, channel runtime, memory indexes, automation, logs, tasks, usage, or approvals. |
| Composition                      | The surface assembles authorized read projections while every source retains truth, workflow, and mutation authority.                                      |

## Auth

| Mockup screen / feature area                                                                          | Classification                   | OpenClaw capability / RPC harnessed                                                                 | Owning Opzava bounded context | Effort |
| ----------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| `essential-login.html` - email/password, Google/GitHub OAuth, login error states, 2FA step-up         | Opzava-owned (build in Postgres) | None. Better Auth behind `AuthPort`; no OpenClaw user identities.                                   | Identity&Access               | M      |
| `essential-forgot-password.html`, `essential-reset-password.html` - password reset lifecycle          | Opzava-owned (build in Postgres) | None. Session revocation is Opzava/Better Auth.                                                     | Identity&Access               | M      |
| `essential-2fa-setup.html` - TOTP enrollment and recovery codes                                       | Opzava-owned (build in Postgres) | None. TOTP/recovery/passkeys belong behind `AuthPort`.                                              | Identity&Access               | M      |
| `essential-accept-invite.html` - invitation acceptance and scoped join                                | Opzava-owned (build in Postgres) | None. Invitation row must be revalidated in-tx before membership grant.                             | Identity&Access               | M      |
| `essential-profile.html` - profile, notification prefs, appearance, connected tools, security/account | Opzava-owned (build in Postgres) | Optional linked-tool status projections; identity/session/security settings are Opzava/Better Auth. | Identity&Access               | M      |
| `essential-signout.html` - signed-out confirmation and logout-all-devices hooks                       | Opzava-owned (build in Postgres) | None. Revocable DB sessions and push binding cleanup.                                               | Identity&Access               | S      |

## App Shell / Nav

| Mockup screen / feature area                                                                                              | Classification                   | OpenClaw capability / RPC harnessed                                                                                                        | Owning Opzava bounded context     | Effort |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------ |
| Admin Control Center shell + Admin Overview (Variant A Priority Command Center; target not built)                        | Composition                      | Sectioned projections from Dev Board, runtime, Connections/Platform-Ops, Observability, and Security; each source retains authority.       | Composition only; no owning bounded context | L |
| Current root Overview and `shell-overview.html` evidence                                                                  | Current as-built / historical evidence | Current root page/navigation remain until an approved PRD-020 slice replaces them; the mockup does not define target placement.       | web / Notifications/Admin-Observability | S |
| `essential-home.html`, `essential-projects.html` - Basecamp-style home and project cards                                  | Opzava-owned (build in Postgres) | None for project records; agent/project snippets come from projections.                                                                    | Project Mgmt                      | M      |
| `essential-my-stuff.html` - personal work rollup, needs-input, following, schedule                                        | Opzava-owned (build in Postgres) | Optional projected `tasks.list`/`cron.runs` for agent-owned work.                                                                          | Project Mgmt                      | M      |
| `essential-find.html`, `nav-project-switcher.html` - command palette, project switcher, search states                     | Opzava-owned (build in Postgres) | Optional `sessions.list`, `artifacts.list`, `tools.catalog` results indexed into Opzava search.                                            | Project Mgmt                      | M      |
| `essential-blank-slates.html`, `style-guide.html`, `index.html` - empty/loading/error states, design system, mockup index | Opzava-owned (build in Postgres) | None. Product UI standard, not runtime data.                                                                                               | Tenant Provisioning/Platform-Ops  | S      |

## Projects & PM Boards / Cards / Goals

| Mockup screen / feature area                                                                                        | Classification                   | OpenClaw capability / RPC harnessed                                                                                                               | Owning Opzava bounded context | Effort |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| `essential-project.html` - project workspace tiles, project goal banner, latest activity                            | Hybrid                           | Agent snippets from `sessions.*`, `tasks.*`, `artifacts.*`; durable project state in Opzava.                                                      | Project Mgmt                  | L      |
| `essential-new-project.html` - create project                                                                       | Opzava-owned (build in Postgres) | Optional provisioning event to seed project corpus/agents later.                                                                                  | Project Mgmt                  | M      |
| `project-status-table.html` - projects status table                                                                 | Opzava-owned (build in Postgres) | Projected agent/run health can enrich status, but project truth is Opzava.                                                                        | Project Mgmt                  | M      |
| `essential-boards.html` - board rollup cards                                                                        | Opzava-owned (build in Postgres) | Optional Workboard lifecycle projection only for agent-work badges.                                                                               | Project Mgmt                  | M      |
| `essential-card-table.html` - generic Project Management boards                                                    | Hybrid                           | Opzava `pm.Card` is SoT; optional agent execution bridges through `AgentDispatch`. This is not Dev Board.                                         | Project Mgmt                  | L      |
| `essential-add-card.html` - add card type picker                                                                    | Opzava-owned (build in Postgres) | None unless selected card dispatches an agent run.                                                                                                | Project Mgmt                  | M      |
| `essential-card.html` - card detail, steps, comments, AI run, evidence/files, quality review                        | Hybrid                           | `sessions.messages.subscribe`, `sessions.preview/get`, `artifacts.list/get/download`, `tasks.get`, `agent.wait`; comments/files/checks in Opzava. | Project Mgmt                  | L      |
| `essential-todos.html`, `essential-todo-new.html` - to-do lists, due dates, assigned humans/AI                      | Opzava-owned (build in Postgres) | Optional assignment dispatch to `sessions.send`/`tasks.*` for AI assignees.                                                                       | Project Mgmt                  | M      |
| `essential-goals.html`, `essential-goal-create.html` - SMART goals and AI goal draft assist                         | Hybrid                           | Goal truth in Opzava; AI suggestions via `sessions.send` with project corpus overlay.                                                             | Project Mgmt                  | M      |
| `essential-schedule.html`, `essential-my-schedule.html` - project and personal schedules                            | Hybrid                           | Opzava calendar/tasks are SoT; scheduled agent updates use `cron.*`, `wake`, `cron.runs`.                                                         | Project Mgmt                  | M      |
| `essential-updates.html` - project updates and scheduled daily summaries                                            | Hybrid                           | Update records in Opzava; scheduled summaries and proactive posts use `cron.*`, `wake`, `sessions.send`, Webhooks plugin.                         | Project Mgmt                  | M      |
| `essential-docs.html`, `essential-upload.html` - docs/files and uploads                                             | Hybrid                           | Source docs/files in Opzava object store; derived runtime indexes via OKF import, `wiki_search`, `memory_search`, `artifacts.*`.                  | Knowledge Mgmt                | L      |
| `essential-discovery.html`, `essential-idea.html`, `essential-idea-new.html` - discovery board, ideas, AI consensus | Hybrid                           | Idea records in Opzava; research/consensus via `sessions.send`, `sessions_spawn`, `artifacts.*`, `memory_search`.                                 | Project Mgmt                  | L      |

## Dev Board (target; replaces standalone Tasks and Issues)

| Target surface | Classification | Runtime / GitHub boundary | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| Summary, List, Board, Sprints, Docs, Development, Releases | Hybrid | Opzava owns DevTicket workflow, gates, Sprints, approvals, docs, execution policy, and projections. GitHub owns issue number/URL plus PR/commit/check/merge facts; shared content syncs deterministically. OpenClaw/local tools supply execution telemetry only. | Dev Board | XL |
| Incidents view | Hybrid projection | Notifications/Admin-Observability owns Incident/ErrorGroup lifecycle; Dev Board displays a projection and linked Bug/Technical Task remediation. Incidents are not Sprint-eligible DevTickets. | Notifications/Admin-Observability | M |

## Internal Chat / Messages / Mentions

| Mockup screen / feature area                                                                      | Classification                   | OpenClaw capability / RPC harnessed                                                                                                    | Owning Opzava bounded context     | Effort |
| ------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------ |
| `essential-messages.html` - essential human-only team messages                                    | Opzava-owned (build in Postgres) | None for message SoT. WS hub + outbox own delivery.                                                                                    | Internal Collaboration            | L      |
| `messages-slack.html` - Slack-grade channels, DMs, threads, reactions, pins, search               | Opzava-owned (build in Postgres) | AI app posts can bridge through `sessions.send`/streaming, but channel/message records stay Opzava.                                    | Internal Collaboration            | L      |
| `essential-team-room.html` - per-project human room                                               | Opzava-owned (build in Postgres) | None for human messages; project assistant links bridge separately.                                                                    | Internal Collaboration            | M      |
| `essential-compose.html` - new message composer                                                   | Opzava-owned (build in Postgres) | None.                                                                                                                                  | Internal Collaboration            | S      |
| `mention-inbox.html`, `activity.html` - mention inbox, project activity feed                      | Hybrid                           | Opzava `Mention`/activity SoT; agent runtime events projected from `session.*`, `tasks.*`, `cron`, approvals, Workboard notifications. | Internal Collaboration            | M      |
| `essential-notifications.html`, `notifications-alerts.html` - notification center and alert rules | Hybrid                           | In-app/Web Push owned by Opzava; runtime alert inputs from `health`, `diagnostics.stability`, `logs.tail`, `tasks.*`, `usage.cost`.    | Notifications/Admin-Observability | L      |

## AI Agents / Orchestrator

| Mockup screen / feature area                                                             | Classification | OpenClaw capability / RPC harnessed                                                                                                                                 | Owning Opzava bounded context | Effort |
| ---------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| `orchestrator-chat.html` - Ask Admin Opzava with approvals and downstream coordination   | Hybrid         | `sessions.create/send/steer/abort`, `sessions.messages.subscribe`, `tools.effective`, `exec.approval.*`, `plugin.approval.*`, `logs.tail`, `diagnostics.stability`. | AI Workforce                  | L      |
| `essential-ask-opzava.html` - Ask Opzava tenant assistant                                | Hybrid         | Same session/streaming RPCs as above, scoped to runtime-control token and project/org corpus overlays.                                                              | AI Workforce                  | L      |
| `project-assistant.html` - per-project assistant facade                                  | Hybrid         | `sessions.send`, `sessions_spawn`/subagent lanes, `tasks.*`, `agent.wait`, `artifacts.*`; Opzava owns Assignment/AgentDispatch.                                     | AI Workforce                  | L      |
| `agents.html` - AI assistant roster by department                                        | Hybrid         | `agents.list`, `agent.identity.get`, `tasks.list`, `usage.cost`, `sessions.usage`; Opzava owns `AgentEmployee`, Department, Persona.                                | AI Workforce                  | L      |
| `agent-detail.html` - assistant detail, pause/assign, tasks, stats, memory/settings tabs | Hybrid         | `agents.update`, `tasks.list/get/cancel`, `sessions.usage*`, `usage.cost`, `tools.effective`, `skills.status`, `doctor.memory.status`.                              | AI Workforce                  | L      |
| `automation.html` - schedules, webhooks/triggers, recent runs                            | Hybrid         | `cron.list/get/add/update/remove/run/runs`, `wake`, TaskFlow, Webhooks plugin, `tasks.list`.                                                                        | AI Workforce                  | L      |

## Knowledge / Memory / Skills

| Mockup screen / feature area                                                       | Classification | OpenClaw capability / RPC harnessed                                                                                                                       | Owning Opzava bounded context | Effort |
| ---------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| `memory-skills.html` - memory entries, skills catalog, recent artifacts            | Hybrid         | `memory_search`, `wiki_search`, `wiki_get`, OKF import, `skills.status/search/detail/install`, `artifacts.list/get`; Opzava KB and skill catalog are SoT. | Knowledge Mgmt                | L      |
| Knowledge add/search from project docs, discovery, card evidence, marketing assets | Hybrid         | OpenClaw `memory-wiki` + `memory-lancedb` are rebuildable derived indexes; source docs remain Opzava/object-store.                                        | Knowledge Mgmt                | L      |
| Engineering Skills governance (target; not built)                                  | Opzava-owned (build in Postgres) | Upstream-tracked/fork-derived engineering workflow catalog, provenance, compatibility, and allowed orchestrator/local-harness policy. | Knowledge Mgmt / Runtime-Control | L |
| Runtime Skills governance (target; not built)                                      | Hybrid         | OpenClaw-native `skills.status/search/detail/install`; dedicated Opzava port/BFF/page coverage is not built.                                              | Knowledge Mgmt / Gateway Runtime | M |
| Ask Admin skill subset (target; current `skills: []`)                              | Opzava-owned (build in Postgres) | Policy-approved subset; selecting a skill never grants tools and deny-wins effective tool policy remains authoritative.                                  | Runtime-Control / AI Workforce | M |

## Admin / Ops

| Mockup screen / feature area                                                      | Classification            | OpenClaw capability / RPC harnessed                                                                                                               | Owning Opzava bounded context     | Effort |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------ |
| `monitoring-health.html` - live metrics, service health, alerts, nodes, endpoints | Hybrid                    | `health`, `diagnostics.stability`, `system-presence`, `node.list/describe`, `node.pair.*`, `logs.tail`; OpenClaw Node/Device trust never grants Dev Board Runner authority. | Notifications/Admin-Observability | L |
| `logs.html` - log explorer/live tail                                              | OpenClaw-native (harness) | `logs.tail` with cursor/limit/max-byte controls, redacted and projected as needed.                                                                | Notifications/Admin-Observability | M      |
| `issues.html` - historical standalone issue/error page                            | Superseded target         | Current code remains a migration input. Incident/ErrorGroup projects into Dev Board Incidents; GitHub-backed development work lives in Dev Board. | Notifications/Admin-Observability / Dev Board | M |
| `security-audit.html` - pending approvals, users/roles, audit trail               | Hybrid                    | Runtime gates from `exec.approval.*`, `plugin.approval.*`, `device.pair.*`; Opzava RBAC/audit is SoT.                                             | Identity&Access                   | L      |
| `debug.html` - diagnostics, feature flags, orchestrator state, raw config         | Hybrid                    | `diagnostics.stability`, `config.get/schema/lookup`, `tools.effective`, `sessions.describe`, `status`; write actions admin-only.                  | Tenant Provisioning/Platform-Ops  | M      |
| Admin remediation loop (Ask Admin Opzava, watchdog, deadletter, redaction)        | Hybrid                    | Admin assistant uses `logs.tail`, `diagnostics.stability`, `health`, `tasks.*`; Opzava owns incident lifecycle and approvals.                     | Notifications/Admin-Observability | L      |

## Settings / Connections

| Mockup screen / feature area                                                                                        | Classification | OpenClaw capability / RPC harnessed                                                                                                                                                                                                                                                       | Owning Opzava bounded context    | Effort |
| ------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| `settings.html` - workspace, agents, connections, security, notifications, advanced, config, deployment    | Hybrid         | `config.get/schema/lookup`, `models.list`, `agents.list/update`, `channels.status`, `tools.catalog/effective`, `usage.status`; sensitive mutations via admin worker.                                                                                                                      | Tenant Provisioning/Platform-Ops | L      |
| `connections.html` - current setup/health surface and migration input                                                | Current as-built / migration input | Existing Gateway/model/provider/channel/device setup; PRD-020 redistributes target placement without claiming it is built.                              | External Channels via ACL | L |
| Integrations target page (not built)                                                                               | Hybrid         | Development/platform GitHub, Admin Slack, provider, and approved external-service enrollment/health; sensitive writes remain behind secure admin paths. | Connections/Platform-Ops / Security | L |
| MCP Servers target page (not built)                                                                                | Hybrid         | Policy-governed endpoints and projected tools for explicitly allowed orchestrator/local-harness consumers; dedicated inventory coverage is not built.    | Connections/Platform-Ops / Runtime-Control | M |
| `essential-tools.html`, `essential-tools-empty.html` - historical linked-tools evidence                             | Hybrid         | Historical `tools.catalog/effective`, MCP, channel, and Node/Device evidence only; not target placement authority.                                       | External Channels via ACL | M |
| `essential-connect-wizard.html` - connect Claude Code/OpenCode/Codex/Desktop via MCP or live agent                  | Hybrid         | Opzava issues its own MCP/API credential; OpenClaw side can expose `tools.catalog`, `device.pair.*`, `node.pair.*`, `sessions.*` for live-agent mode. No hardcoded secrets.                                                                                                               | External Channels via ACL        | L      |

## Onboarding

| Mockup screen / feature area                                                                 | Classification                   | OpenClaw capability / RPC harnessed                                                                                                           | Owning Opzava bounded context    | Effort |
| -------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| `essential-setup.html` - initial owner/workspace/team setup                                  | Hybrid                           | Opzava onboarding saga provisions tenant Gateway through `GatewayRuntimePort`; OpenClaw health/pairing/token bootstrap after container start. | Tenant Provisioning/Platform-Ops | L      |
| Tenant lifecycle: Provisioning -> Active -> Suspended -> Deprovisioning -> Deleted           | Hybrid                           | `health`, pairing/device token bootstrap, `config.apply`, `agents.*`, `channels.status`; all admin-token work in provisioning worker.         | Tenant Provisioning/Platform-Ops | L      |
| Project onboarding after workspace setup (`essential-new-project.html`, invite/auth screens) | Opzava-owned (build in Postgres) | Optional later Gateway provisioning for project corpus/agent assignments.                                                                     | Tenant Provisioning/Platform-Ops | M      |
