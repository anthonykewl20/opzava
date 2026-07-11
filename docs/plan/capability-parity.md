# Opzava Capability-Parity Map

Source of truth: `docs/plan/grilling-decisions.md` locked architecture (this map classifies the Q1-Q12 plus Q4b/Q4c decision set and is itself the Q13 deliverable; Q14/Q15 landed later and do not change classifications), mockup feature surface in `ux-redesign/mockups/*.html`, and OpenClaw docs under `docs/openclaw`.

> **Q18 note (2026-07-04):** for ADMIN gateway-ops screens this map is now superseded by the authoritative port
> program `docs/plan/consensus/port-openclaw-control-ui-program.md` (OpenClaw Control-UI views 1–14, re-implemented
> through the ACL). Classifications below still govern user-side/product surfaces. CRM is NEVER an admin-dashboard
> surface (user directive 2026-07-04); its permanent home is the user-side dashboard.

## Classification legend

| Classification | Meaning |
| --- | --- |
| OpenClaw-native (harness) | OpenClaw already owns the runtime capability. Opzava should harness it through the backend-only `gateway-broker` ACL. |
| Opzava-owned (build in Postgres) | Opzava is the system of record and must build the product data model, RBAC, workflows, and UI persistence in Postgres. |
| Hybrid | Opzava owns the business/product record, while OpenClaw owns agent runtime, channel runtime, memory indexes, automation, logs, tasks, usage, or approvals. |

## Auth

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `essential-login.html` - email/password, Google/GitHub OAuth, login error states, 2FA step-up | Opzava-owned (build in Postgres) | None. Better Auth behind `AuthPort`; no OpenClaw user identities. | Identity&Access | M |
| `essential-forgot-password.html`, `essential-reset-password.html` - password reset lifecycle | Opzava-owned (build in Postgres) | None. Session revocation is Opzava/Better Auth. | Identity&Access | M |
| `essential-2fa-setup.html` - TOTP enrollment and recovery codes | Opzava-owned (build in Postgres) | None. TOTP/recovery/passkeys belong behind `AuthPort`. | Identity&Access | M |
| `essential-accept-invite.html` - invitation acceptance and scoped join | Opzava-owned (build in Postgres) | None. Invitation row must be revalidated in-tx before membership grant. | Identity&Access | M |
| `essential-profile.html` - profile, notification prefs, appearance, connected tools, security/account | Opzava-owned (build in Postgres) | Optional linked-tool status projections; identity/session/security settings are Opzava/Better Auth. | Identity&Access | M |
| `essential-signout.html` - signed-out confirmation and logout-all-devices hooks | Opzava-owned (build in Postgres) | None. Revocable DB sessions and push binding cleanup. | Identity&Access | S |

## App Shell / Nav

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `shell-overview.html` - main rail, global search, health pill, live state, KPI dashboard | Hybrid | `health`, `system-presence`, `tasks.list`, `sessions.list`, `usage.cost`, `diagnostics.stability`; broker WS events projected to Postgres. | Notifications/Admin-Observability | L |
| `essential-home.html`, `essential-projects.html` - Basecamp-style home and project cards | Opzava-owned (build in Postgres) | None for project records; agent/project snippets come from projections. | Project Mgmt | M |
| `essential-my-stuff.html` - personal work rollup, needs-input, following, schedule | Opzava-owned (build in Postgres) | Optional projected `tasks.list`/`cron.runs` for agent-owned work. | Project Mgmt | M |
| `essential-find.html`, `nav-project-switcher.html` - command palette, project switcher, search states | Opzava-owned (build in Postgres) | Optional `sessions.list`, `artifacts.list`, `tools.catalog` results indexed into Opzava search. | Project Mgmt | M |
| `essential-blank-slates.html`, `style-guide.html`, `index.html` - empty/loading/error states, design system, mockup index | Opzava-owned (build in Postgres) | None. Product UI standard, not runtime data. | Tenant Provisioning/Platform-Ops | S |

## Projects & PM Boards / Cards / Goals

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `essential-project.html` - project workspace tiles, project goal banner, latest activity | Hybrid | Agent snippets from `sessions.*`, `tasks.*`, `artifacts.*`; durable project state in Opzava. | Project Mgmt | L |
| `essential-new-project.html` - create project | Opzava-owned (build in Postgres) | Optional provisioning event to seed project corpus/agents later. | Project Mgmt | M |
| `project-status-table.html` - projects status table | Opzava-owned (build in Postgres) | Projected agent/run health can enrich status, but project truth is Opzava. | Project Mgmt | M |
| `essential-boards.html` - board rollup cards | Opzava-owned (build in Postgres) | Optional Workboard lifecycle projection only for agent-work badges. | Project Mgmt | M |
| `essential-card-table.html`, `task-board.html` - Kanban boards and task status columns | Hybrid | Opzava `pm.Card` is SoT; bridge agent execution through `AgentDispatch`, `workboard_*`, `tasks.list/get/cancel`, `agent.wait`. | Project Mgmt | L |
| `essential-add-card.html` - add card type picker | Opzava-owned (build in Postgres) | None unless selected card dispatches an agent run. | Project Mgmt | M |
| `essential-card.html` - card detail, steps, comments, AI run, evidence/files, quality review | Hybrid | `sessions.messages.subscribe`, `sessions.preview/get`, `artifacts.list/get/download`, `tasks.get`, `agent.wait`; comments/files/checks in Opzava. | Project Mgmt | L |
| `essential-todos.html`, `essential-todo-new.html` - to-do lists, due dates, assigned humans/AI | Opzava-owned (build in Postgres) | Optional assignment dispatch to `sessions.send`/`tasks.*` for AI assignees. | Project Mgmt | M |
| `essential-goals.html`, `essential-goal-create.html` - SMART goals and AI goal draft assist | Hybrid | Goal truth in Opzava; AI suggestions via `sessions.send` with project corpus overlay. | Project Mgmt | M |
| `essential-schedule.html`, `essential-my-schedule.html` - project and personal schedules | Hybrid | Opzava calendar/tasks are SoT; scheduled agent updates use `cron.*`, `wake`, `cron.runs`. | Project Mgmt | M |
| `essential-updates.html` - project updates and scheduled daily summaries | Hybrid | Update records in Opzava; scheduled summaries and proactive posts use `cron.*`, `wake`, `sessions.send`, Webhooks plugin. | Project Mgmt | M |
| `essential-docs.html`, `essential-upload.html` - docs/files and uploads | Hybrid | Source docs/files in Opzava object store; derived runtime indexes via OKF import, `wiki_search`, `memory_search`, `artifacts.*`. | Knowledge Mgmt | L |
| `essential-discovery.html`, `essential-idea.html`, `essential-idea-new.html` - discovery board, ideas, AI consensus | Hybrid | Idea records in Opzava; research/consensus via `sessions.send`, `sessions_spawn`, `artifacts.*`, `memory_search`. | Project Mgmt | L |

## Internal Chat / Messages / Mentions

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `essential-messages.html` - essential human-only team messages | Opzava-owned (build in Postgres) | None for message SoT. WS hub + outbox own delivery. | Internal Collaboration | L |
| `messages-slack.html` - Slack-grade channels, DMs, threads, reactions, pins, search | Opzava-owned (build in Postgres) | AI app posts can bridge through `sessions.send`/streaming, but channel/message records stay Opzava. | Internal Collaboration | L |
| `essential-team-room.html` - per-project human room | Opzava-owned (build in Postgres) | None for human messages; project assistant links bridge separately. | Internal Collaboration | M |
| `essential-compose.html` - new message composer | Opzava-owned (build in Postgres) | None. | Internal Collaboration | S |
| `mention-inbox.html`, `activity.html` - mention inbox, project activity feed | Hybrid | Opzava `Mention`/activity SoT; agent runtime events projected from `session.*`, `tasks.*`, `cron`, approvals, Workboard notifications. | Internal Collaboration | M |
| `essential-notifications.html`, `notifications-alerts.html` - notification center and alert rules | Hybrid | In-app/Web Push owned by Opzava; runtime alert inputs from `health`, `diagnostics.stability`, `logs.tail`, `tasks.*`, `usage.cost`. | Notifications/Admin-Observability | L |

## AI Agents / Orchestrator

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `orchestrator-chat.html` - Ask Admin Opzava with approvals and downstream coordination | Hybrid | `sessions.create/send/steer/abort`, `sessions.messages.subscribe`, `tools.effective`, `exec.approval.*`, `plugin.approval.*`, `logs.tail`, `diagnostics.stability`. | AI Workforce | L |
| `essential-ask-opzava.html` - Ask Opzava tenant assistant | Hybrid | Same session/streaming RPCs as above, scoped to runtime-control token and project/org corpus overlays. | AI Workforce | L |
| `project-assistant.html` - per-project assistant facade | Hybrid | `sessions.send`, `sessions_spawn`/subagent lanes, `tasks.*`, `agent.wait`, `artifacts.*`; Opzava owns Assignment/AgentDispatch. | AI Workforce | L |
| `agents.html` - AI assistant roster by department | Hybrid | `agents.list`, `agent.identity.get`, `tasks.list`, `usage.cost`, `sessions.usage`; Opzava owns `AgentEmployee`, Department, Persona. | AI Workforce | L |
| `agent-detail.html` - assistant detail, pause/assign, tasks, stats, memory/settings tabs | Hybrid | `agents.update`, `tasks.list/get/cancel`, `sessions.usage*`, `usage.cost`, `tools.effective`, `skills.status`, `doctor.memory.status`. | AI Workforce | L |
| `automation.html` - schedules, webhooks/triggers, recent runs | Hybrid | `cron.list/get/add/update/remove/run/runs`, `wake`, TaskFlow, Webhooks plugin, `tasks.list`. | AI Workforce | L |

## Knowledge / Memory / Skills

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `memory-skills.html` - memory entries, skills catalog, recent artifacts | Hybrid | `memory_search`, `wiki_search`, `wiki_get`, OKF import, `skills.status/search/detail/install`, `artifacts.list/get`; Opzava KB and skill catalog are SoT. | Knowledge Mgmt | L |
| Knowledge add/search from project docs, discovery, card evidence, marketing assets | Hybrid | OpenClaw `memory-wiki` + `memory-lancedb` are rebuildable derived indexes; source docs remain Opzava/object-store. | Knowledge Mgmt | L |
| Admin-only curated skill governance | Hybrid | `skills.install`/upload requires `operator.admin` via provisioning path; runtime reads `skills.status` and `tools.catalog/effective`. | Knowledge Mgmt | M |

## Marketing

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `essential-marketing.html` - marketing project dashboard and report tiles | Hybrid | Agent/report summaries from `sessions.*`, `artifacts.*`, `usage.cost`; campaigns and approvals in Opzava. | Marketing/Dept-Workflows | L |
| `essential-mkt-campaigns.html`, `essential-campaign-new.html` - campaign lifecycle Plan/Create/Approve/Publish/Measure | Hybrid | Workflow publish provisions `cron.*`, standing-orders, TaskFlow; `sessions.send` for drafts; Opzava Campaign is SoT. | Marketing/Dept-Workflows | L |
| `essential-content-pipeline.html` - article pipeline Ideas/Drafting/Needs you/Ready/Published | Hybrid | TaskFlow/cron/standing-orders execute; `artifacts.*` stores derived draft artifacts; Opzava ContentItem/Approval gates publish. | Marketing/Dept-Workflows | L |
| `essential-mkt-calendar.html`, `essential-event-new.html` - content calendar and scheduling | Hybrid | Schedule truth in Opzava; runtime jobs via `cron.add/update/remove/run/runs`. | Marketing/Dept-Workflows | L |
| `essential-mkt-approvals.html`, `essential-send-review.html` - business approval queue and send-for-review | Hybrid | Business Approval is Opzava SoT; exec/plugin approvals mirrored through `exec.approval.*`, `plugin.approval.*`. | Marketing/Dept-Workflows | M |
| `essential-mkt-assets.html`, `essential-upload.html` - asset library, approved files, review state | Opzava-owned (build in Postgres) | Optional artifact projection from `artifacts.*`; actual asset source in Opzava object store. | Marketing/Dept-Workflows | M |
| `essential-mkt-performance.html`, `essential-mkt-email-report.html`, `essential-mkt-blog-report.html`, `essential-mkt-ads-report.html` - reports/performance | Hybrid | Report jobs via `cron.*`/TaskFlow, agent analysis via `sessions.*`, report artifacts via `artifacts.*`; metric data stored/projected in Opzava. | Marketing/Dept-Workflows | L |

## CRM / Customer Mgmt

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| Customer Support project/card surfaces (`essential-project.html`, `essential-card-table.html`, `essential-card.html`) | Hybrid | External conversation refs from channel ACL; support agent work via `sessions.*`, `tasks.*`, `send`, `channels.status`; Contact/Ticket are Opzava SoT. | CRM | L |
| Customer-facing card evidence, ticket links, reply draft, approve-send | Hybrid | OpenClaw external channels own provider connection/transcript runtime; Opzava owns resolved Contact, Ticket, Activity, Consent, approval. | CRM | L |
| Unknown sender/contact resolution and external identities (implied by support/customer flows) | Hybrid | Channel plugins emit sender/conversation events through ACL; Opzava resolves `ChannelIdentity(channel, externalId)` to Contact or shell. | CRM | L |

## Finance

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `costs.html` - expense bookkeeping, chart of accounts, transaction ledger | Hybrid | AI/provider usage from `usage.cost`, `usage.status`, `sessions.usage*`; non-AI expense ledger is Opzava Finance. | Finance | L |
| Finance approvals and money-risk agent actions | Hybrid | Business approvals in Opzava; exec/plugin approvals through `exec.approval.*`/`plugin.approval.*`; tool policy blocks money actions without approval. | Finance | M |

## Admin / Ops

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `monitoring-health.html` - live metrics, service health, alerts, nodes, endpoints | Hybrid | `health`, `diagnostics.stability`, `system-presence`, `node.list/describe`, `node.pair.*`, `logs.tail`; Opzava incident read models. | Notifications/Admin-Observability | L |
| `logs.html` - log explorer/live tail | OpenClaw-native (harness) | `logs.tail` with cursor/limit/max-byte controls, redacted and projected as needed. | Notifications/Admin-Observability | M |
| `issues.html` - issue/error cards | Hybrid | Inputs from `logs.tail`, `diagnostics.stability`, `tasks.list`, Workboard diagnostics, app errors; Opzava `ErrorGroup` and ADMIN card projection. | Notifications/Admin-Observability | L |
| `security-audit.html` - pending approvals, users/roles, audit trail | Hybrid | Runtime gates from `exec.approval.*`, `plugin.approval.*`, `device.pair.*`; Opzava RBAC/audit is SoT. | Identity&Access | L |
| `debug.html` - diagnostics, feature flags, orchestrator state, raw config | Hybrid | `diagnostics.stability`, `config.get/schema/lookup`, `tools.effective`, `sessions.describe`, `status`; write actions admin-only. | Tenant Provisioning/Platform-Ops | M |
| Admin remediation loop (Ask Admin Opzava, watchdog, deadletter, redaction) | Hybrid | Admin assistant uses `logs.tail`, `diagnostics.stability`, `health`, `tasks.*`; Opzava owns incident lifecycle and approvals. | Notifications/Admin-Observability | L |

## Settings / Connections

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `settings.html` - workspace, agents, connections, security, notifications, billing, advanced, config, deployment | Hybrid | `config.get/schema/lookup`, `models.list`, `agents.list/update`, `channels.status`, `tools.catalog/effective`, `usage.status`; sensitive mutations via admin worker. | Tenant Provisioning/Platform-Ops | L |
| `connections.html` - gateway/models, provider auth, main-orchestrator selection, agent tools/MCP, channels/services | Hybrid | `health`, `models.list`, `models.authStatus`, `models status`, `config.patch`, `usage.status`, `channels.status`, `web.login.start/wait`, `tools.catalog/effective`, `skills.status`, `config.schema`; sensitive writes stay behind the provisioning worker. | External Channels via ACL | L |
| `essential-tools.html`, `essential-tools-empty.html` - user-visible linked tools health | Hybrid | Tool health projections from `tools.catalog/effective`, MCP inventory, `channels.status`, device/node presence. | External Channels via ACL | M |
| `essential-connect-wizard.html` - connect Claude Code/OpenCode/Codex/Desktop via MCP or live agent | Hybrid | Opzava issues its own MCP/API credential; OpenClaw side can expose `tools.catalog`, `device.pair.*`, `node.pair.*`, `sessions.*` for live-agent mode. No hardcoded secrets. | External Channels via ACL | L |

## Billing / Onboarding

| Mockup screen / feature area | Classification | OpenClaw capability / RPC harnessed | Owning Opzava bounded context | Effort |
| --- | --- | --- | --- | --- |
| `essential-setup.html` - initial owner/workspace/team setup | Hybrid | Opzava onboarding saga provisions tenant Gateway through `GatewayRuntimePort`; OpenClaw health/pairing/token bootstrap after container start. | Tenant Provisioning/Platform-Ops | L |
| Billing tabs/settings and plan enforcement (`settings.html`) | Hybrid | Usage input from `usage.cost`; billing/subscription/Stripe and plan limits are Opzava SoT. | Billing | L |
| Tenant lifecycle: Provisioning -> Active -> Suspended -> Deprovisioning -> Deleted | Hybrid | `health`, pairing/device token bootstrap, `config.apply`, `agents.*`, `channels.status`; all admin-token work in provisioning worker. | Tenant Provisioning/Platform-Ops | L |
| Project onboarding after workspace setup (`essential-new-project.html`, invite/auth screens) | Opzava-owned (build in Postgres) | Optional later Gateway provisioning for project corpus/agent assignments. | Tenant Provisioning/Platform-Ops | M |
