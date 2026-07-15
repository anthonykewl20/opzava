# PRD-006: Agent roster, automation, run trace, and tool catalog

> **Dev Board amendment (2026-07-15):** The separate AI task-board target is superseded by PRD-019. PRD-006 continues to own `AgentEmployee`, automation, `Assignment`/`AgentDispatch` projections, roster/detail views, and execution traces. An agent may view its Dev Board assignments and deep-link to the owning DevTicket, but it does not own or maintain an independent task lifecycle.

## Problem

Opzava needs a coherent operating surface for managing AI employees after the assistant conversation layer exists. Users can ask Opzava for help, but admins and operators also need to see who is on the AI team, what each employee is allowed to do, which automations keep them working, where their current tasks are, how a run unfolded, and which local/runtime tools are connected.

Without a PRD-level contract, this slice can drift into unsafe or confusing product shapes:

- The agent roster could become a thin OpenClaw `agents list` view instead of the Opzava `AgentEmployee` system of record from ADR-008.
- Agent detail could expose raw Gateway config, session transcripts, provider payloads, secrets, or hidden reasoning instead of safe persona, policy, memory, tool, binding, task, and run projections.
- Standing orders and cron could be configured as ad hoc Gateway jobs without Opzava workflow policy, budget, approval, idempotency, and provisioning receipts from ADR-012.
- Agent assignment views could confuse Dev Board `DevTicket`, Project Management `pm.Card`, AI Workforce `Assignment`, Department Workflow `WorkflowRun`, and OpenClaw task-ledger records.
- Run traces could become raw runtime logs rather than redacted, user-facing evidence of status, tools, approvals, artifacts, and errors.
- Tool catalog UX could invite users to connect or repair tools without applying ADR-005 tool policy, scoped authorization, and secret handling.

The solution is an Opzava-owned AI operations product surface for roster, employee detail, employee creation/configuration, standing-order and cron automation UX, assignment projections, run trace, and tool catalog. OpenClaw remains harnessed for native delegate agents, workspaces, cron, TaskFlow, task ledger, tools, memory, skills, bindings, sessions, and runtime logs. Opzava owns product identity, policy, user-visible lifecycle, authorization, approvals, provisioning jobs, audit, and read models.

## Goals and Non-goals

### Goals

- Ship the AI employee roster grouped by department, with current status, role, model, current task, spend, and fleet summary.
- Ship agent detail for persona, department, autonomy tier, tool policy, channel bindings, memory/skills summary, current work, recent runs, activity, and advanced configuration.
- Support creating, editing, pausing, assigning, and deprovisioning AI employees through Opzava commands backed by ADR-008 provisioning.
- Make standing orders, cron schedules, webhooks/triggers, and recent automation runs visible and configurable through the Department Workflow model from ADR-012.
- Show each agent's current and historical assignments, including Dev Board links, without creating a second lifecycle or board.
- Ship run trace detail as a safe, redacted, inspectable view over assignments, workflow runs, steps, tool calls, approvals, artifacts, and runtime refs.
- Ship the Essential tool catalog for linked local tools and runtime harnesses, including connected, active, degraded, disconnected, reconnect, and empty states.
- Define data/API touchpoints by bounded context and port without restating ADR architecture.
- Define OpenClaw-parity boundaries so native runtime capabilities are harnessed while product authority stays Opzava-owned.
- Define acceptance and testing decisions at the user-visible operations seams.

### Non-goals

- Build Ask Opzava, project assistant, or Ask Admin Opzava chat UX. Those are PRD-005; this PRD links to their assignments, runs, and approvals.
- Build project boards, project cards, goals, to-dos, schedules, docs, discovery, or issue intake. Those belong to the Project Management surface (`pm.Card`, deferred); this PRD shows AI task projections and may deep-link to project work.
- Build internal chat, DMs, Activity, notifications, mentions, or Web Push. Those are PRD-004; this PRD emits and consumes their projected hand-offs.
- Build OpenClaw itself, its Gateway scheduler, task ledger, tool runtime, memory engine, plugin system, or CLI.
- Build tenant provisioning internals beyond the user-visible employee/workflow provisioning states, receipts, drift warnings, and repair actions.
- Build Knowledge Management ingestion, OKF import, embedding, memory promotion, or skill catalog internals beyond showing employee memory/skills status and source refs.
- Build billing plans, invoices, cost allocation, or spend enforcement beyond the roster/detail/task spend summaries and budget states consumed from other contexts.
- Expose raw secrets, API keys, channel credentials, Gateway-local config files, raw provider payloads, raw tool output, hidden reasoning, or unredacted admin logs to browser clients.
- Allow browser clients or normal route handlers to write OpenClaw agent config, cron config, bindings, tools, or workspace files directly.

## User Stories

1. As an admin/full-shell user, I want an Agents page in the full rail, so that I can inspect the AI team from the operations shell.
2. As an admin/full-shell user, I want the roster header to show total assistants and department count, so that I understand fleet size quickly.
3. As an admin/full-shell user, I want roster KPI cards for active employees, idle employees, spend today, and health, so that I can see whether the team is working normally.
4. As an admin/full-shell user, I want agents grouped by department, so that Marketing, Support, Finance, CRM, General-VA, and lead orchestration responsibilities are scannable.
5. As an admin/full-shell user, I want each department group to show its assistant count and active/idle/offline summary, so that uneven capacity is visible.
6. As an admin/full-shell user, I want each roster row to show assistant, role, model, status, current task, and spend today, so that I can triage without opening every employee.
7. As an admin/full-shell user, I want the lead orchestrator separated from worker departments, so that coordinator behavior is not confused with specialist work.
8. As an admin/full-shell user, I want active, idle, offline, provisioning, paused, degraded, and policy-blocked statuses, so that runtime and policy states are explicit.
9. As an admin/full-shell user, I want roster search by name, role, department, model, skill, and task, so that I can find the right employee quickly.
10. As an admin/full-shell user, I want filters for department, autonomy tier, status, model, tool policy, and binding state, so that large teams stay manageable.
11. As an admin/full-shell user, I want to open an agent detail from a roster row, so that I can inspect the employee before changing policy or assigning work.
12. As a department lead, I want the roster to show department mandates and default tiers, so that employees are understood inside their governance context.
13. As a department lead, I want Finance and CRM employees labeled T1 by default, so that sensitive work is visibly approval-first.
14. As a department lead, I want Marketing and Support employees to show when T2 send-on-behalf is enabled, so that external communication authority is clear.
15. As a department lead, I want T3 proactive authority to be visibly tied to standing orders, so that broad autonomous behavior is not implied.
16. As an operator, I want roster rows to show missing provisioning, Gateway unavailable, and circuit-open states, so that runtime issues are visible before task assignment.
17. As an operator, I want spend and token summaries by employee, so that abnormal use can be investigated from the same surface.
18. As an operator, I want Add assistant from the roster, so that creating an AI employee starts from the fleet context.
19. As an operator, I want the Add assistant flow to require department, persona, autonomy tier, tool policy, model policy, and channel binding choices, so that policy is not an afterthought.
20. As an operator, I want Add assistant to preview the provisioning impact, so that I know which OpenClaw agent, workspace, `agentDir`, persona files, tools, skills, bindings, and standing orders will be touched.
21. As an operator, I want creating an employee to produce a provisioning job and receipt, so that config writes are audited and not performed by the browser.
22. As an operator, I want edit employee to create a new persona/policy version when behavior or authority changes, so that historical runs remain explainable.
23. As an operator, I want pause employee to stop new assignments while preserving history and existing audit, so that I can respond to risk without deleting the employee.
24. As an operator, I want deprovision employee to require confirmation and show retained history, so that destructive lifecycle changes are deliberate.
25. As an operator, I want drift warnings when Gateway config differs from Opzava employee state, so that runtime repairs are visible.
26. As an operator, I want repair/reprovision actions gated by authorization and policy, so that only allowed users can reconcile employee runtime config.
27. As an admin/full-shell user, I want agent detail to show the employee name, avatar/initials, status, department, role, model, and concise mandate, so that identity is clear.
28. As an admin/full-shell user, I want agent detail stats for running tasks, cost today, uptime, and last seen, so that I can assess health quickly.
29. As an admin/full-shell user, I want Pause and Assign task actions on agent detail, so that common operations are directly available.
30. As an admin/full-shell user, I want Overview, Activity, Tasks, Memory, and Settings tabs, so that employee detail is organized by workflow.
31. As an admin/full-shell user, I want the Overview tab to show current assignments with progress, due date, step, and deep links to their source work, so that active work is inspectable.
32. As an admin/full-shell user, I want Today's stats on agent detail, so that completed tasks, tool calls, cost, and tokens are visible without opening cost reports.
33. As an admin/full-shell user, I want recent runs on agent detail with task, status, model, duration, cost, and finished time, so that I can inspect execution history.
34. As an admin/full-shell user, I want recent run statuses such as running, completed, approval needed, failed, canceled, timed out, and lost, so that run outcome is understandable.
35. As an admin/full-shell user, I want an empty recent-runs state, so that newly created employees are not mistaken for broken employees.
36. As an admin/full-shell user, I want advanced configuration to show model/inference, tools/permissions, channels, schedule/cron, files, and prompts, so that policy is visible without exposing secrets.
37. As an admin/full-shell user, I want sensitive config values represented as labels, refs, or SecretReference-style handles, so that credentials are never displayed.
38. As an admin/full-shell user, I want tool permissions to show enabled, disabled, approval-needed, and policy-denied states, so that ADR-005 enforcement is visible.
39. As an admin/full-shell user, I want file write and code execution to default to disabled or approval-needed for standard employees, so that ordinary agents cannot mutate files or execute runtime code.
40. As an admin/full-shell user, I want channel bindings to show output channel, direction, target scope, approval policy, and health, so that send-on-behalf boundaries are clear.
41. As an admin/full-shell user, I want memory and skills to show safe summaries, corpus overlays, skill visibility, and freshness, so that I can diagnose capability without reading raw vector state.
42. As an admin/full-shell user, I want the Activity tab to show employee lifecycle events, assignment events, policy denials, tool summaries, approvals, and provisioning receipts, so that the employee timeline is auditable.
43. As an admin/full-shell user, I want the Tasks tab to show all assignments for the employee with filters and bulk-safe actions, so that workload can be managed.
44. As an admin/full-shell user, I want the Settings tab to validate all editable fields before submission, so that invalid policy cannot be provisioned.
45. As a department lead, I want Assign task to check employee availability, department policy, tier, tools, bindings, project access, and workload before dispatch, so that assigning work cannot bypass governance.
46. As a department lead, I want assignment failures to show normal states such as approval required, missing binding, rate limited, provisioning required, and Gateway unavailable, so that I know what to fix.
47. As an admin/full-shell user, I want an Automation page in the full rail, so that schedules, webhooks, and triggers have one home.
48. As an admin/full-shell user, I want automation KPI cards for active automations, runs today, failures, and schedules, so that automation health is visible.
49. As an admin/full-shell user, I want scheduled cron automations listed with name, cadence, next run, last run, and enabled status, so that recurring work is scannable.
50. As an admin/full-shell user, I want cron cadence shown in both cron expression and human-readable form, so that technical and non-technical users can verify timing.
51. As an admin/full-shell user, I want pause, enable, run now, edit, and view run log actions where policy allows, so that schedules can be operated safely.
52. As an admin/full-shell user, I want webhooks and triggers listed as event-to-action rows, so that event-driven automation is understandable.
53. As an admin/full-shell user, I want each trigger to show last fired, runs in the last 24 hours, status, and retry action, so that broken event flows are visible.
54. As an admin/full-shell user, I want Recent runs on Automation to show time, automation, outcome, and duration, so that failures can be followed quickly.
55. As an admin/full-shell user, I want New automation to require Workflow/Playbook ownership, target department/employee, trigger, action, approval policy, budget, concurrency, timeout, retry cap, and failure destination, so that ADR-012 requirements are captured.
56. As an admin/full-shell user, I want standing orders to be authored as bounded programs with scope, trigger, approval gates, escalation rules, and execute-verify-report expectations, so that permanent authority is explicit.
57. As an admin/full-shell user, I want publishing a standing order or cron schedule to create a provisioning job and receipt, so that OpenClaw artifacts are not edited directly.
58. As an admin/full-shell user, I want duplicate trigger keys to collapse and show idempotent state, so that retries do not fan out into duplicate work.
59. As an admin/full-shell user, I want failed automation runs to link to a run trace, so that investigation starts from the failed row.
60. As a reviewer, I want automations that require business approval to create Opzava approval rows, so that approval decisions are durable and shared with Activity.
61. As a reviewer, I want runtime exec/plugin prompts mirrored safely where applicable, so that I can decide runtime gates without confusing them with business approvals.
62. As an admin/full-shell user, I want roster and agent detail to show each employee's current assignments, so that workload is visible without a second task board.
63. As an admin/full-shell user, I want assignment projections filtered by source, employee, status, approval state, and degraded reason, so that I can inspect workload efficiently.
64. As an admin/full-shell user, I want Dev Board assignments to display the owning DevTicket lane and link, so that lifecycle remains visible at its source of truth.
65. As an admin/full-shell user, I want each assignment row to show title, employee, source, status, age/start time, progress, and project/department hints, so that triage is fast.
66. As an admin/full-shell user, I want queued, running, degraded, review, and completed runtime projections distinguished from the source work lifecycle, so that the two are not conflated.
67. As an admin/full-shell user, I want assignment filters by project, department, employee, source, approval, and failed/degraded state, so that large workloads remain usable.
68. As an admin/full-shell user, I want to open the source work or run trace from an assignment, so that I can inspect both intent and execution.
69. As an admin/full-shell user, I want review assignments to link to the owning DevTicket, approval, draft, project card, workflow step, or Activity item, so that review happens in the source of truth.
70. As an admin/full-shell user, I want degraded assignments to explain policy, binding, corpus, Gateway, runner, circuit, runtime-ref, timeout, or provider failures, so that intervention is concrete.
71. As an operator, I want assignment cancellation where the owning workflow allows it, so that runaway or obsolete work can be stopped.
72. As an operator, I want cancellation to update Assignment, WorkflowRun/RunStep, source work, audit, and runtime state where available, so that state stays consistent.
73. As an operator, I want retry to preserve idempotency, source-work gates, and policy checks, so that retrying failed work does not duplicate external sends or approvals.
74. As an operator, I want run trace to show requested actor, employee, department, autonomy tier, source trigger, project/work target, and idempotency key, so that provenance is clear.
75. As an operator, I want run trace to show chronological steps such as admitted, assigned, session started, tool checked, approval requested, artifact produced, message sent, completed, failed, or canceled, so that execution is understandable.
76. As an operator, I want each run trace step to show safe summaries, timestamps, status, duration, cost where available, and linked artifacts, so that evidence is useful without exposing internals.
77. As an operator, I want tool calls in run trace to show tool name, policy decision, target class, approval ref, redacted result summary, and audit ref, so that ADR-005 enforcement can be reviewed.
78. As an operator, I want run trace to hide raw chain-of-thought, secrets, credentials, raw provider payloads, raw Gateway DTOs, and unredacted tool output, so that inspection is safe.
79. As an operator, I want run trace to survive OpenClaw task pruning by preserving Opzava projections and opaque refs, so that audit remains readable.
80. As an operator, I want run trace to show when runtime detail has been purged or is no longer available, so that missing detail is not treated as data loss in Opzava.
81. As an Essential user, I want Your tools to show linked local tools such as Claude Code, OpenCode, Codex CLI, Codex Desktop, and Claude Desktop, so that I know which tools Opzava can use.
82. As an Essential user, I want each tool row to show tool name, location, connection method, status, and current activity, so that tool health is obvious.
83. As an Essential user, I want tool statuses Active, Connected, Degraded, Disconnected, and Not linked to use glyph plus label, so that meaning is not color-only.
84. As an Essential user, I want a degraded tool row to explain the problem in plain language, so that I can decide whether to reconnect.
85. As an Essential user, I want a disconnected tool to offer Reconnect where allowed, so that repair is one action away.
86. As an Essential user, I want technical details for reconnect commands only when I expand them, so that the default tool catalog stays calm.
87. As an Essential user, I want the tool catalog empty state to explain why linking a first tool matters and how long it takes, so that setup feels approachable.
88. As an Essential user, I want Connect a tool to route through the existing connector/provisioning flow, so that secrets are never pasted into the PRD surface or browser state.
89. As a security reviewer, I want tool catalog actions to re-check authorization, session validity, and connector ownership, so that stale browsers cannot reconnect privileged tools.
90. As a security reviewer, I want all employee, automation, task, run trace, and tool catalog actions to write audit rows, so that operational authority is explainable.
91. As a screen-reader user, I want roster tables, tabs, assignment lists, automation tables, run traces, tool rows, status badges, and dialogs to expose semantic labels, so that operations are accessible.
92. As a keyboard user, I want roster filters, tabs, assignment rows, action menus, run trace disclosures, automation actions, and connect/reconnect flows to work without a mouse, so that admin work is efficient.
93. As a mobile or narrow-screen user, I want tables and assignment lists to collapse into usable list/detail flows, so that status, actions, and filters remain reachable.
94. As a product operator, I want every screen to render loading, empty, no-match, forbidden, stale, offline/reconnecting, error, and retry states, so that async runtime realities are normal product states.
95. As a developer, I want the feature tested through application ports, route/server-action behavior, projection read models, and UI composition, so that tests protect external behavior without coupling to OpenClaw internals.

## UX walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `agents.html` | Full/admin Agents roster with full rail, top search, health/live indicator, notification and avatar controls, "Assistants" page title, "Your AI team" subtitle, Org chart and Add assistant actions, KPI cards for active/idle/spend, department sections, lead orchestrator row, department tables, assistant/role/model/status/current task/spend columns, AI attribution, active/idle/offline statuses, department summaries, roster totals, search/filter/no-match/loading/error/offline states, and deep links to agent detail. |
| `agent-detail.html` | Agent detail for one `AgentEmployee` with breadcrumb back to Agents, status, department, role, model, MCP/tool posture, Pause and Assign task actions, stats for running tasks/cost/uptime/last seen, stable agent id, tabs for Overview/Activity/Tasks/Memory/Settings, current task progress, today's stats, weekly spend, recent runs, no-runs empty state, advanced configuration disclosures for model/inference/tools/channels/schedule/files/prompts, safe Export JSON behavior, toast/completion notifications, keyboard tab behavior, and no raw secret display. |
| `task-board.html` | **Superseded target.** This historical AI task-board mockup is a migration reference only. PRD-019 owns Dev Board; agent roster/detail surfaces show assignment projections and deep links without defining another board lifecycle. |
| `automation.html` | Full/admin Automation page with schedules, webhooks, triggers, run log entry points, New automation action, KPI cards for active automations/runs/failures/schedules, cron schedule table with name/cadence/next run/last run/status, webhook/trigger table with event-to-action, last fired, runs in 24h, status and retry action, recent runs table, footer summary, loading/empty/no-match/error/offline states, and links to standing-order/workflow/run trace detail. |
| `essential-tools.html` | Essential "Your tools" surface with Essential top bar, Home breadcrumb, Connect another action, explanatory copy, linked local tools list, status summary, rows for Claude Code/OpenCode/Codex CLI/Codex Desktop/Claude Desktop, Active/Connected/Degraded/Disconnected statuses, current activity, reconnect action, per-row menu, technical details disclosure with copy command, status legend, optimistic connect/reconnect working state, and accessible announcements. |
| `essential-tools-empty.html` | Essential empty tool catalog with same shell, "Connect your first tool" empty state, explanation for Claude Code/Codex/OpenCode/other tools, primary Connect a tool action, one-minute setup hint, ghost preview rows, loading/error/forbidden states, and no requirement that the user know OpenClaw or MCP terminology before choosing a tool. |

## Functional requirements

### Agent roster and department grouping

- AI Workforce must own the roster read model for `AgentEmployee` identity, department, persona, autonomy tier, model policy, tool policy, channel binding summary, status, active assignment count, spend summary, and runtime health projection.
- The roster must group employees by Department and keep the lead coordinator/orchestrator visually separate from specialist departments.
- Roster visibility must be filtered by active tenant, organization membership, full/admin shell authorization, and any future department-level grants.
- Roster rows must show only Opzava-owned product identity and safe runtime projections; OpenClaw agent ids may appear only as opaque technical refs in detail/debug areas where authorized.
- Roster search must cover employee name, role, department, model, status, tool policy, binding labels, skills, and current task summary.
- Department sections must support loading, empty, no-match, stale projection, Gateway unavailable, and forbidden states.
- Spend and active-task summaries must be clearly labeled as projected values, not billing truth.
- The Add assistant action must route to the employee creation flow and must be hidden or disabled when the actor lacks permission.

### Employee creation, editing, and lifecycle

- Creating an employee must require name, Department, Persona or persona template, AutonomyTier, model policy, tool policy, initial skills visibility, optional channel bindings, optional standing orders, and provisioning target.
- Employee creation and edit commands must run through AI Workforce application services and create provisioning jobs for OpenClaw runtime artifacts.
- Browser clients must never write OpenClaw agent config, workspace files, `agentDir`, bindings, cron, or tool policy directly.
- Provisioning jobs must write immutable receipts with employee version, persona version, rendered artifact hashes/refs, target Gateway, result, drift status, and actor/job refs.
- Editing persona, tier, tool policy, bindings, skills, or standing orders must create a new version or receipt sufficient to explain later runs.
- Pausing an employee must stop new assignments and standing-order dispatch while preserving history and allowing in-flight work to complete, cancel, or move to review according to policy.
- Deprovisioning must require confirmation, preserve product history/audit, and use an admin/provisioning job for runtime cleanup.
- Drift detection must compare Opzava employee state with runtime availability/config snapshots and surface drift without making Gateway config the product source of truth.
- Reprovision/repair actions must be idempotent, permission-gated, audited, and surfaced as normal provisioning states.

### Agent detail

- Agent detail must render employee identity, status, department, role/mandate, model, tier, current health, current task count, cost today, uptime, last seen, and stable product/ref ids.
- The Overview tab must show active tasks, progress, due dates, run step summaries, recent runs, daily stats, and spend summary.
- The Activity tab must show a chronological employee timeline from AI Workforce, Department Workflows, Runtime Control, approvals, provisioning, and audit projections.
- The Tasks tab must show employee assignments with filters for state, project, source, approval, and trigger.
- The Memory tab must show safe employee memory, skills, project/org corpus overlays, freshness, and source refs; it must not expose raw embeddings/vector internals.
- The Settings tab must expose editable employee configuration according to authorization and must validate fields before commands are submitted.
- Advanced configuration disclosures must show model/inference, tools/permissions, channels, schedule/cron, files, prompts, and policy refs as safe product summaries.
- Export JSON, if implemented, must export a redacted Opzava product summary and must not include secrets, raw Gateway config, provider credentials, or hidden runtime payloads.
- Assign task from agent detail must perform the same admission checks as assignment from project cards, Ask Opzava, workflows, or Dev Board.

### Standing orders, cron, and automation UX

- Department Workflows must own the automation definition surface for Workflow/Playbook, StandingOrderBlock, CronSpec, TaskFlowSpec, trigger policy, approval policy, budget, concurrency, timeout, retry cap, failure destination, and freshness SLA.
- Automation lists must show schedules and triggers as Opzava definitions/projections, not as raw Gateway scheduler rows.
- Schedule rows must show name, cadence, human timing, next run, last run, enabled/paused/provisioning/drift/failed status, and allowed actions.
- Trigger rows must show event, action, target workflow/employee, last fired, 24-hour run count, status, and retry/repair action where allowed.
- New automation must require explicit owner context, target department/employee, trigger/schedule, action, approval policy, budget, concurrency, timeout, retry, failure destination, and idempotency key shape before publish.
- Standing orders must be expressed as bounded programs with scope, triggers, approval gates, escalation rules, and execute-verify-report requirements.
- Publishing, pausing, editing, deleting, or repairing automation must create admin/provisioning jobs and receipts for OpenClaw artifacts where runtime config changes are needed.
- Duplicate trigger keys must collapse into one run/projection rather than creating duplicate assignments or external sends.
- Failed, retrying, skipped, rate-limited, approval-blocked, stale-input, Gateway unavailable, circuit-open, and drift-detected automation states must render as normal states.
- Recent automation runs must deep-link to run traces and owning workflows.

### Agent assignment projections

- AI Workforce may compose `Assignment`, optional `AgentDispatch`, `WorkflowRun`, `RunStep`, approval, runner, and runtime-task projections for roster/detail workload views.
- A Dev Board assignment must deep-link to the owning DevTicket and display its authoritative lane/gate state. AI Workforce must not map it into a second Backlog/In Progress/Review/Done lifecycle.
- Assignment controls such as pause, cancel, retry, and handoff must call the owning workflow command and preserve Dev Board lease, review, and audit rules where the target is a DevTicket.
- Runtime-derived progress remains projected state and must be reconciled with the owning aggregate rather than treated as workflow authority.

### Run traces

- Run trace detail must provide a chronological user-facing trace for one assignment, workflow run, automation run, or source work item.
- Run trace header must show source request, actor, employee/persona, department, autonomy tier, project/work target, trigger source, status, started/completed time, duration, cost where available, and idempotency key/audit refs where authorized.
- Trace steps must include admitted, queued, assigned, provisioned, session started, tool checked, approval requested, approval decided, artifact produced, message sent, report projected, completed, failed, canceled, timed out, lost, and repaired where applicable.
- Tool step rows must show tool category/name, target class, policy decision, approval ref, redacted request/result summary, timestamp, duration, and audit ref.
- Approval steps must distinguish Opzava business approvals from mirrored OpenClaw runtime approvals.
- Trace artifacts must link to authorized Opzava outputs, project evidence, docs candidates, reports, messages, or owning work records rather than raw Gateway files.
- Run traces must preserve Opzava projections after runtime session/task details are pruned, and must label unavailable runtime details clearly.
- Run traces must never expose hidden reasoning, raw provider payloads, secrets, channel credentials, raw Gateway DTOs, or unredacted tool output.

### Tool catalog

- The Essential tool catalog must show user-linked and tenant-linked local/runtime tools through Opzava-owned connection projections.
- Tool rows must show name, location, connection method, status, current activity, last seen/problem summary, and actions allowed for the current actor.
- Supported status labels must include Active, Connected, Degraded, Disconnected, and Not linked; each must include glyph plus text and not rely on color alone.
- Connect and reconnect flows must route through existing connector/provisioning mechanisms and must never ask users to paste secrets into persistent product content.
- Technical reconnect commands may be shown only as generated setup instructions and must not contain credentials or long-lived secrets.
- Copy command actions must be user-initiated and must announce success/failure accessibly.
- Tool health must distinguish local client unavailable, MCP handshake failed, Gateway unavailable, auth expired, policy denied, version incompatible, and degraded latency where available.
- Empty state must explain the first-tool setup path, show a ghost preview, and link to Connect a tool.
- Tool catalog rows must be filtered by authorization and current organization/tenant context.

### Access, security, and audit

- Every roster, detail, automation, task, run trace, and tool catalog read must be authorized against active tenant, organization membership, shell mode, role grants, and target refs.
- Every mutation must re-check authorization at action time and carry idempotency keys.
- Standard employee tool policy must follow ADR-005: runtime execution and filesystem mutation are denied unless an explicit code-capable exception profile and approvals apply.
- Business approvals must use Opzava approval rows; OpenClaw runtime approvals remain mirrored runtime gates where needed.
- Tool and channel credentials must be stored only through the repo/product's secrets/config mechanism and represented in UI as refs, health states, or redacted labels.
- Audit rows must cover employee creation/edit/pause/deprovision, provisioning receipts, assignment commands, automation publish/pause/run/retry, tool policy decisions, approvals, tool calls, run trace events, and connect/reconnect actions.
- Access revocation must remove access to roster rows, employee detail, tasks, traces, automation detail, tool details, and live streams on fetch/reconnect.
- UI rendering must sanitize user content, generated titles, tool labels, channel names, file names, source refs, and trace summaries.

### Accessibility and responsive behavior

- Roster and automation tables must support keyboard navigation, sortable/filterable controls, visible focus, and semantic table/list structure.
- Agent detail tabs must implement accessible tab semantics and preserve focus on tab changes.
- Assignment lists must have keyboard alternatives for opening source work, filtering, canceling, retrying, and reviewing permitted actions.
- Run trace disclosures and step details must be keyboard accessible and announce state changes politely.
- Status badges, progress, approval state, failure state, and tool health must use text labels in addition to visual styling.
- Mobile/narrow layouts must preserve page context, filters, primary actions, row/card status, and detail links without text overlap.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Agents roster | AI Workforce | `AgentEmployee` directory, Department grouping, status projection, active assignment count, spend summary, runtime health, provision state | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Employee create/edit lifecycle | AI Workforce with Tenant Provisioning | Employee command, Persona version, AutonomyTier, tool policy ref, binding refs, standing order refs, provisioning job, provision receipt, drift state | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Persona and prompt files | AI Workforce | Persona metadata, rendered file refs, version/provenance, safe prompt summaries, hard blocks, active employee version | `AuthorizationPort`, `EventBusPort` |
| Department and tier policy | AI Workforce | Department mandate, default tier, routing rules, escalation queue, policy refs, tier override history | `AuthorizationPort`, `EventBusPort` |
| Tool policy summary | Runtime Control / Gateway Broker with AI Workforce | Tool allow/deny summary, approval-needed flags, standard-agent deny posture, code-capable exception state, policy decision audit | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Channel bindings | AI Workforce with External Channels/CRM where applicable | Binding metadata, direction, scope filter, target allowlist, approval policy, SecretReference/credential refs, health projection | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Memory and skills summary | Knowledge Management with AI Workforce | Employee memory refs, skill visibility, project/org corpus overlays, corpus revisions, freshness, candidate memory/promote refs | `AuthorizationPort`, `KnowledgeSourcePort`, `KnowledgeIndexPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Agent detail current work | AI Workforce | `Assignment`, optional `AgentDispatch`, current task progress, employee workload, recent run summary, report refs | `AuthorizationPort`, `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort` |
| Agent activity timeline | AI Workforce with Audit/Notifications inputs | Lifecycle events, provisioning receipts, assignment events, policy denials, approval refs, trace summaries, audit refs | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Automation definitions | Department Workflows | Workflow/Playbook, StandingOrderBlock, CronSpec, TaskFlowSpec, trigger policy, schedule policy, budget/concurrency, approval policy | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Automation provisioning | Department Workflows with Tenant Provisioning | Publish/pause/edit/delete commands, rendered artifact refs, OpenClaw cron/TaskFlow refs, provision receipts, drift repair | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Automation runs | Department Workflows | `WorkflowRun`, `RunStep`, trigger key, runtime refs, outcome, retry state, stale inputs, failure destination, report/artifact refs | `AuthorizationPort`, `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort` |
| Agent assignment projections | AI Workforce with the owning work context | Assignment/workflow/runtime state plus opaque `DevTicket` or `pm.Card` target refs; source lifecycle remains authoritative | `AuthorizationPort`, `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort` |
| Project work links | Project Management | Optional `pm.Card`, to-do, schedule, external-work, output/evidence refs, `AgentDispatch`, review state, project authorization | `AuthorizationPort`, `EventBusPort` |
| Run trace detail | AI Workforce or Department Workflows by source | Trace header, step timeline, tool summaries, policy decisions, approvals, artifacts, messages, reports, runtime refs, audit refs | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Approval prompts and decisions | Department Workflows with contributing contexts | Opzava approval rows, mirrored runtime approval refs, decision commands, stale/superseded state, audit projection | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Tool catalog | Runtime Control / Gateway Broker with Identity & Access | Linked tool directory, client type, MCP/CLI/Gateway connection projection, health/last seen, connect/reconnect command state, safe setup instructions | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Notifications and hand-offs | Internal Collaboration and Notifications/Admin-Observability | Activity rows, notification rows, completion hand-offs, approval prompts, failure alerts, unread counts, deep links | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Audit | Audit/Security with contributing contexts | Immutable audit rows for employee lifecycle, provisioning, assignment, automation, policy, approval, tools, connect/reconnect, trace visibility | `AuthorizationPort`, `EventBusPort` |

## Implementation decisions

- Model roster, employee detail, assignment projections, and run traces from Opzava read models; do not expose OpenClaw runtime rows as browser DTOs.
- Keep `AgentEmployee`, Persona, Department, AutonomyTier, StandingOrder, ChannelBinding, Assignment, and `AgentDispatch` aligned with ADR-008 names and meanings.
- Use Department Workflows for standing orders, cron schedules, webhooks/triggers, WorkflowRun, RunStep, and business approvals according to ADR-012.
- Treat OpenClaw cron, TaskFlow, task-ledger, agents, workspaces, tools, memory, skills, and bindings as provisioned/runtime artifacts accessed through ports.
- Use admin/provisioning jobs for employee and automation config writes; the normal browser/BFF path submits Opzava commands only.
- Represent secrets and credentials only as redacted labels, health states, credential refs, or SecretReference-style metadata.
- Treat live runtime status as projected/ephemeral until reconciled into Opzava-owned state through events, polling, or provisioning receipts.
- Define run trace payloads as safe summaries with source refs, policy decisions, audit refs, and artifacts; exclude hidden reasoning and raw payloads.
- Share approval commands and stale-card behavior with PRD-005/PRD-004 approval surfaces rather than adding task-board-only approval logic.
- Keep the Essential tool catalog calmer and user-focused than the full/admin automation pages; it shows linked tools and repair paths, not raw runtime config.

## OpenClaw-parity notes

| Feature area | Classification | Native harnessed vs Opzava-owned decision |
| --- | --- | --- |
| AI employee roster identity | Opzava-owned | `AgentEmployee`, Persona, Department, AutonomyTier, status, policy refs, lifecycle, and audit are Opzava state. OpenClaw agent ids are opaque runtime refs. |
| Delegate agent runtime | Native harnessed | OpenClaw owns delegate agents, workspaces, `agentDir`, sessions, runs, task ledger, memory-lancedb, skills, and runtime execution. Opzava provisions and projects them. |
| Employee creation/configuration | Opzava-owned with native provisioning | Opzava owns the command, versioning, policy, and receipt. OpenClaw receives rendered config through audited admin/provisioning jobs. |
| Persona files | Hybrid | Opzava owns Persona version/provenance and renders safe summaries. OpenClaw consumes provisioned `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, and related workspace files. |
| Tool policy | Opzava-governed native harness | ADR-005 policy decisions are surfaced and audited by Opzava while Gateway tool policy enforces callable tools. Deny wins. |
| Channel bindings | Opzava-owned metadata with native channel runtime | Opzava owns binding policy, scope, approval, and credential refs. OpenClaw owns channel adapter runtime and delivery refs. |
| Standing orders | Opzava-owned definition with native execution | Department Workflows own standing-order authority and approvals. OpenClaw executes the rendered standing-order blocks in agent workspaces. |
| Cron schedules | Opzava-owned definition with native scheduler | Workflow/CronSpec and lifecycle are Opzava-owned. OpenClaw Gateway cron persists and executes the provisioned jobs. |
| Assignment views | Opzava-owned projection | Roster/detail views compose Assignment, AgentDispatch, WorkflowRun, RunStep, approvals, and runtime task projections. Dev Board remains the only platform-development board and OpenClaw task ledger remains runtime truth. |
| OpenClaw task ledger | Native harnessed | OpenClaw task records are runtime activity for cron/subagent/ACP/CLI work. Opzava stores opaque refs and projected status. |
| Run trace | Opzava-owned presentation with native inputs | Trace UI is a safe Opzava projection over assignments, workflow steps, approvals, tool summaries, and runtime refs. Raw logs remain behind the broker. |
| Tool catalog | Hybrid | Opzava owns user-visible tool connection rows, status, repair actions, and authorization. OpenClaw/MCP/CLI clients provide health and capability signals. |
| Memory and skills | Hybrid | Knowledge Management owns corpus/source refs and authorization. OpenClaw owns employee runtime memory/skills execution. Detail pages show safe summaries only. |

## Acceptance criteria

- Agents roster renders in the full/admin shell with department grouping, lead orchestrator section, roster KPIs, Add assistant action, search/filter, row status, current task, spend summary, and async states.
- Roster rows and department sections show only employees the actor is authorized to see.
- Opening a roster row renders agent detail with identity, status, department, role, model, stats, Pause, Assign task, tabs, active work, recent runs, and advanced configuration disclosures.
- Agent detail never renders raw secrets, raw Gateway config, raw provider payloads, hidden reasoning, or unredacted tool output.
- Add/edit employee validates required fields and creates an Opzava provisioning job instead of directly writing runtime config.
- Employee pause prevents new assignments and records audit without deleting history.
- Employee provisioning, drift, repair, and deprovisioning states are visible and idempotent.
- Agent detail recent runs can open a run trace for running, completed, approval-needed, failed, timed-out, canceled, and lost runs.
- Automation renders schedules, webhooks/triggers, KPI cards, recent runs, New automation, run log entry, retry action, and loading/empty/error/offline states.
- New automation captures required ADR-012 policy fields before publish and creates provisioning receipts for runtime artifacts.
- Pausing/enabling/editing automation updates Opzava workflow state and projects the correct runtime/provisioning status.
- Duplicate automation trigger keys do not create duplicate assignments, approvals, external sends, or run rows.
- Agent detail renders current/historical assignments with source links, projected progress, employee attribution, and degraded-state reasons without duplicating the Dev Board lifecycle.
- Assignment cancel/retry/handoff actions re-check authorization, preserve idempotency, and update the owning work context.
- Review tasks deep-link to owning approval, draft, project work, Activity row, or assistant conversation.
- Run trace renders source actor, employee, department, tier, source trigger, project/work target, timeline steps, tool summaries, approval refs, artifacts, cost/duration where available, and audit refs where authorized.
- Run trace redacts secrets and raw runtime payloads and labels purged/unavailable runtime detail explicitly.
- Tool catalog renders linked tool rows, active/connected/degraded/disconnected/not-linked labels, current activity, reconnect action, technical details disclosure, status legend, and accessible working announcements.
- Tool catalog empty state renders "Connect your first tool", setup hint, primary connect action, and ghost preview.
- Connect/reconnect flows route through authorized connector/provisioning actions and do not persist credentials in UI content.
- Role revocation removes access to roster/detail/automation/task/run trace/tool detail on reload or realtime reconnect.
- All user-visible statuses are available through labels/glyphs and not color alone.
- Roster tables, tabs, assignment rows, automation tables, run trace disclosures, and tool catalog rows are keyboard and screen-reader accessible.
- Mobile/narrow layouts preserve context, status, filters, actions, and detail links without overlap.

## Testing decisions

- Test at the highest product seams: AI Workforce commands/queries, Department Workflow commands/queries, authorization-gated routes/server actions, projection read models, realtime status updates, and UI composition for the named screens.
- Tests should assert external behavior: visible roster groups, authorized filtering, employee detail content, provisioning states, automation definitions, source-work links, run trace redaction, tool catalog repair flows, and audit/event emissions.
- Do not test OpenClaw protocol internals in product UI/domain tests. Use broker port fakes, provisioning receipts, and projected runtime fixtures.
- Roster tests must cover department grouping, lead orchestrator separation, search/filter, active/idle/offline/provisioning/degraded states, spend summary labels, and forbidden/no-match states.
- Employee lifecycle tests must cover create, edit, pause, deprovision, provisioning job creation, provision receipt projection, drift detection, repair, duplicate submit idempotency, and unauthorized mutation.
- Agent detail tests must cover tabs, current tasks, recent runs, empty runs, advanced configuration redaction, tool policy states, channel binding summaries, memory/skills summaries, and Assign task admission failures.
- Automation tests must cover schedules, triggers, recent runs, New automation validation, publish/pause/edit/delete, duplicate trigger collapse, retry, failed/run-log links, and drift/provisioning states.
- Standing-order tests must cover scope, trigger, approval gate, escalation rule, budget, concurrency, timeout, retry cap, failure destination, and execute-verify-report requirements at the command boundary.
- Assignment-projection tests must cover source links, filters, search, employee attribution, progress, degraded reason display, review links, cancel, retry, handoff, and stale runtime refs without creating a second workflow lifecycle.
- Run trace tests must cover timeline ordering, tool summary redaction, Opzava vs runtime approval distinction, artifact links, purged runtime detail, authorization filtering, and audit refs.
- Tool catalog tests must cover linked rows, empty state, active/connected/degraded/disconnected/not-linked statuses, reconnect technical details, optimistic working state, copy action, and forbidden/revoked access.
- Security tests must cover no raw secrets in DTOs, no raw Gateway config, no provider payload leakage, tool policy deny display, credential ref rendering, stale session mutation denial, and acting-on-behalf-of audit metadata.
- Accessibility tests must cover semantic tables/lists, tab behavior, keyboard task-card actions, run trace disclosures, live announcements, non-color status labels, focus return, and mobile text containment.
- Realtime/projection tests must cover reconnect backfill, duplicate runtime events, out-of-order provisioning receipts, stale task updates, and one user-visible task/run state per idempotency key.

## Dependencies

- ADR-008: AI Workforce, `AgentEmployee`, Persona, Department, AutonomyTier, StandingOrder, ChannelBinding, Assignment, `AgentDispatch`, employee provisioning, and delegate-agent identity.
- ADR-012: Department workflow engine, Workflow/Playbook, standing orders, cron, TaskFlow, WorkflowRun, RunStep, Approval, provisioning receipts, idempotency, budget, concurrency, and run limiter.
- ADR-005: Tool-policy-first security, standard-agent deny posture, approval gates, sandbox/code-capable exception posture, and data-flow audit.
- ADR-003: Gateway broker ACL, two-token model, hot-path runtime authority, admin/provisioning credential, tenant routing, and opaque OpenClaw refs.
- ADR-004: Data boundary, hybrid CQRS, outbox, projection reconciliation, snapshots, and opaque runtime refs.
- ADR-007: Resource-scoped RBAC, roles-as-data, RLS, and fail-closed tenant/project/employee access.
- ADR-009: Realtime transport, reconnect/backfill, assistants-in-chat bridge, Activity/notification fan-out, and Web Push consumers.
- ADR-010: Knowledge Management source of truth, project/org corpus overlays, memory/wiki/vector indexes, source refs, and skill catalog.
- ADR-011: CRM/channel identity and consent-sensitive customer records where channel bindings or CRM automations target customers.
- PRD-002: App shell, Essential top bar, full/admin rail, command search, notification bell, Home/My stuff, and shell async states.
- Project Management surface (`pm.Card`, deferred): Projects, `pm.Card`, project tools, project schedules, project Updates, linked-work refs, and `AgentDispatch` from project work.
- PRD-019: Dev Board, `DevTicket`, assignment/runner/reviewer roles, execution leases, Sprints, GitHub synchronization, and review gates.
- ADR-017: Dev Board authority, deterministic GitHub sync, and local/cloud execution boundaries.
- PRD-004: Internal collaboration, Activity, notifications, assistant hand-offs, approvals surfaced to users, and Web Push delivery.
- PRD-005: Ask Opzava, project assistant, Ask Admin Opzava, assistant conversations, inline approvals, delegation, and assistant run/projection consumers.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
