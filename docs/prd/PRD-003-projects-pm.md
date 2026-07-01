# PRD-003: Projects, boards, cards, goals, to-dos, schedules, docs, discovery, and issues

## Problem

Opzava needs a coherent project-management surface where people can create projects, shape work, track progress, collaborate with AI employees, and review outcomes without treating OpenClaw Workboard as the product UI.

The mockups show a broad project workspace: projects have tools, boards, cards, to-dos, goals, schedules, docs/files, discovery, and issue-style triage. A card can be ordinary human work, AI-assisted work, customer-facing work, or a bridge into agent execution. Users need the same work to be understandable as a project card, a board row, a calendar item, a personal to-do, an issue, a goal contributor, and an AI run summary.

Without a PRD-level contract, three things will drift:

- `pm.Card` could become confused with OpenClaw `workboard.Card`, leaking runtime identity into Opzava's project model.
- Project tools could behave like separate mini-products instead of one project workspace with shared activity, docs, comments, RBAC, and schedule semantics.
- AI work could disappear into runtime tasks instead of projecting back into the human card, goal, to-do, schedule, notification, issue, or doc where the user expects to review it.

The solution is an Opzava-owned Project Management experience that uses ADR-004 read/write boundaries, ADR-007 authorization, ADR-008 `AgentDispatch`, and ADR-010 project knowledge corpora. OpenClaw runtime work is harnessed through the broker and projected back, but project identity, `pm.Card`, boards, goals, to-dos, events, docs metadata, discovery records, and issue triage state remain Opzava-owned.

## Goals and Non-goals

### Goals

- Ship project CRUD for authorized users, including project type selection, project tool defaults, archive/reopen, and RBAC-filtered project visibility.
- Make Project the main child scope for boards, cards, goals, to-dos, schedules, docs/files, discovery, issues, comments, activity, and project knowledge.
- Provide kanban and table board views for `pm.Card` with consistent columns, counts, filters, summaries, and empty/error/offline states.
- Define the `pm.Card` lifecycle from creation through assignment, movement, AI dispatch, review, hold, completion, archive, and audit.
- Clarify that `pm.Card` is Opzava-owned and distinct from OpenClaw Workboard `workboard.Card`.
- Allow a `pm.Card` to dispatch AI work through ADR-008 `AgentDispatch`, with lifecycle, evidence, files, comments, review state, and runtime failures projected back to the card.
- Support goals as SMART targets with owners, measurement mode, connected work, check-ins, status, and schedule/deadline visibility.
- Support to-dos as lightweight project work that can be assigned to humans or AI employees, grouped into lists, linked to cards/goals, and surfaced in My stuff and calendars.
- Support project schedules and My schedule across meetings, deadlines, goals, to-dos, content events, and AI scheduled runs.
- Support docs/files as project-scoped knowledge sources and attachments, integrated with ADR-010 corpus behavior and card evidence.
- Support Discovery as a project-scoped idea/research board that can turn decided ideas into durable project work.
- Support issues as a triage/work intake surface that can sync external issue metadata while keeping Opzava ownership of project work links and agent dispatch.
- Define concrete bounded-context data/API touchpoints and ports for this slice.
- Define acceptance and testing decisions at user-visible project-management seams.

### Non-goals

- Build the app shell, global navigation, command palette, global Find, Home, My stuff shell rollups, and notifications foundation. Those are covered by PRD-002 and are consumed here.
- Build full internal chat, DMs, Activity inbox, mentions, and project team room behavior beyond card/project comments and links into those surfaces.
- Build Ask Opzava conversation orchestration beyond project/card entry points and AI dispatch handoff.
- Build AI employee/persona/provisioning management beyond selecting eligible employees and showing projected status.
- Build Knowledge Management ingestion internals, OKF import, embedding, skill catalog, or corpus rebuild tooling beyond project docs touchpoints.
- Build external channel integrations, GitHub configuration, WordPress publishing, customer support ticketing, or calendar provider sync setup beyond product-facing refs and sync states.
- Recreate OpenClaw Workboard as an Opzava database model. Opzava stores opaque refs and projections only.
- Build billing, cost accounting, quota enforcement, or runtime observability pages beyond project/card status projections needed for user review.

## User Stories

1. As an organization member, I want to create a project from a simple form, so that I can start a workspace without configuring every tool manually.
2. As an organization member, I want to choose a project type such as blank or marketing and promotion, so that the project starts with useful default cards/tools.
3. As a project manager, I want project type defaults to include tools such as to-dos, board, assistant, team, docs, schedule, updates, and discovery, so that each project has the expected workspace shape.
4. As a project manager, I want to rename, describe, archive, reopen, and delete projects according to my permissions, so that the project lifecycle stays controlled.
5. As a project manager, I want project archive to preserve history and block normal work changes, so that old work remains auditable.
6. As a project member, I want the project header to show the current project, people, AI employees, active tools, status, and latest activity, so that I understand the workspace at a glance.
7. As a Guest-Client, I want only the projects and project tools I am allowed to see, so that internal project operations stay private.
8. As an admin, I want project visibility and actions to be enforced through RBAC, so that missing tenant or project context fails closed.
9. As a project member, I want to add a project card/tool such as SMART Goal, To-do list, Note, Board, Content Pipeline, Schedule, Docs & Files, Discovery, or Updates, so that the workspace can grow as the project changes.
10. As a project member, I want Atlas or another assistant to suggest relevant cards/tools for a project, so that setup can be faster while still requiring my confirmation.
11. As a project member, I want to open the project board from the project home, so that I can see work by status.
12. As a project member, I want a kanban board with columns such as Triage, In progress, On hold, and Done, so that work movement is visible.
13. As a project member, I want each board column to show counts, so that I can see workload distribution quickly.
14. As a project member, I want to drag a card between columns or use a menu to move it, so that keyboard and pointer users can both update status.
15. As a project member, I want each board card to show global ID, age, due date, labels, progress, assignee, comments, files, and status snippet, so that I can triage without opening every card.
16. As a project member, I want to add a card from a column, so that new work enters the right board state.
17. As a project member, I want a table view of cards, so that I can scan large boards by project, status, review, blocked count, owner, update age, and other sortable fields.
18. As a project manager, I want an all-boards summary, so that I can see which projects are on track, need review, or are blocked.
19. As a project manager, I want the board summary to show cards waiting for review, blocked/paused states, and open-board actions, so that I can focus on projects that need me.
20. As a project member, I want every card to have a stable global ID such as `CS-1042`, so that people and agents can refer to the same work in chat, API, CLI, and comments.
21. As a project member, I want to copy a card ID and card link, so that I can reference the work elsewhere.
22. As a project member, I want a card detail page with overview, AI run, evidence/files, and quality review tabs, so that the card explains both the work and how it was done.
23. As a project member, I want to assign or reassign a card to a human or AI employee, so that ownership is explicit.
24. As a project member, I want to mark a card done only after reviewing unresolved AI drafts or quality gates, so that completion does not hide pending risk.
25. As a project member, I want to put a card on hold with a reason, so that blocked work is not confused with neglected work.
26. As a project member, I want to archive a card without deleting its audit trail, so that old work can be recovered or inspected.
27. As a project member, I want card comments with typing/read states and AI mentions, so that conversation stays attached to the work.
28. As a project member, I want card steps/subtasks with progress, so that partial completion is visible.
29. As a project member, I want card files, links, screenshots, videos, JSON, PDFs, and drafts to be grouped as evidence, so that review has context.
30. As a project member, I want card quality checks and reviewers, so that AI-generated work can be approved, changed, or rejected.
31. As a project member, I want AI employee work on a card to show a step-by-step run summary, so that I can audit what happened without opening runtime logs.
32. As a project member, I want AI run status such as queued, running, degraded, review, paused, blocked, completed, failed, missing runtime ref, or purged runtime ref, so that runtime reality is clear.
33. As a project manager, I want a card assigned to an AI employee to create or reuse an `AgentDispatch`, so that human intent is captured before runtime work starts.
34. As a project manager, I want an `AgentDispatch` to carry idempotency, actor, target card, selected employee, dispatch policy, knowledge scope, and opaque runtime refs, so that repeated clicks do not create duplicate work.
35. As a project member, I want OpenClaw Workboard status to project back onto my Opzava card, so that I can review the work where I asked for it.
36. As a project member, I want runtime failures to appear as card states and actionable review items, so that Gateway downtime or policy blocks are not silent.
37. As a project member, I want AI artifacts to attach to the card as evidence or docs candidates, so that useful outputs are preserved under Opzava access rules.
38. As a project member, I want a to-do list for lightweight work, so that not every task requires a board card.
39. As a project member, I want to add a to-do with title, assignee, due date, list, and sub-steps, so that small tasks can be tracked cleanly.
40. As a project member, I want assigning a to-do to an AI employee to make the dispatch behavior clear, so that I know the assistant starts right away and I approve the result.
41. As a project member, I want to-dos to show due dates, comments, assignees, done state, and draft-ready state, so that I can clear work quickly.
42. As a project member, I want to-dos to roll up into goals, schedules, My stuff, and project activity, so that small work does not disappear.
43. As a project manager, I want SMART goals with start/current value, target value, unit, deadline, owner, and connected work, so that progress is measurable.
44. As a project manager, I want Atlas or another assistant to draft a SMART version from rough text, so that goal creation is faster but still reviewed by me.
45. As a project manager, I want goal measurement to be manual or rolled up from connected work, so that metrics can match the project maturity.
46. As a project manager, I want goal status labels such as on track, at risk, off track, achieved, and needs you, so that the project can act before deadlines.
47. As a project manager, I want check-ins on goals with author, period, status, and explanation, so that progress history is auditable.
48. As a project manager, I want a primary goal pinned in the project header, so that the most important target stays visible.
49. As a project member, I want to link to-dos, boards, cards, docs, and events to goals, so that the work moving the metric is explicit.
50. As a project member, I want a project schedule with meetings, deadlines, goals, to-dos, content events, and AI runs, so that project time is visible in one timeline.
51. As a project member, I want week and month schedule views with filters by item type, so that I can inspect the timeline at the right level.
52. As a project member, I want schedule items to use glyph plus label for type and status, so that meaning is not color-only.
53. As a project member, I want AI scheduled runs to show window, queued, running, done, skipped, or paused state, so that agent work can be planned like other project work.
54. As a project member, I want schedule risk callouts with reschedule actions, so that overloaded AI windows or at-risk deadlines can be fixed.
55. As an organization member, I want My schedule to aggregate authorized projects, so that my meetings, deadlines, goals, and AI runs are visible across workspaces.
56. As an organization member, I want My schedule to filter by project, so that I can focus on selected work.
57. As a project member, I want to add content or event schedule entries with channel, campaign, date, time, and status, so that publishing plans are tracked.
58. As a project member, I want Atlas to draft and schedule content only with review before it goes out, so that AI publishing stays governed.
59. As a project member, I want Docs & Files to store project assets, briefs, templates, links, drafts, and evidence, so that shared knowledge has one project home.
60. As a project member, I want docs/files to become authorized project corpus sources when promoted, so that AI employees use current project knowledge under ADR-010.
61. As a project member, I want card evidence and project docs to remain separate when appropriate, so that temporary artifacts do not automatically become project knowledge.
62. As a project member, I want Discovery to collect ideas, research, comments, votes, and AI suggestions before they become work, so that shaping stays lightweight.
63. As a project member, I want Discovery ideas to connect to to-dos, goals, board cards, docs, or new projects, so that decided ideas become durable work.
64. As a project member, I want discovery records to preserve source notes and research links, so that later work has context.
65. As a project manager, I want issue triage stages such as needs triage, ready for agent, ready for human, in progress, and closed, so that external or internal issue intake is actionable.
66. As a project manager, I want synced issue rows to show issue number, title, labels, assignee, agent assignment, updated time, and status, so that I can decide next action quickly.
67. As a project manager, I want an issue to create or link a `pm.Card`, so that issue tracking and project execution do not diverge.
68. As a project manager, I want ready-for-agent issues to dispatch AI work through the same `AgentDispatch` bridge as cards, so that issue automation is auditable.
69. As a project member, I want project updates and latest activity to show completed drafts, uploaded files, comments, card moves, daily summaries, and check-ins, so that I can understand what changed.
70. As a project member, I want loading, empty, no-match, offline cached, forbidden, and retry states on every project tool, so that failures are understandable.
71. As a project member, I want unauthorized cards, docs, issues, and schedule items to be hidden or forbidden consistently, so that private work does not leak.
72. As a product operator, I want project screens backed by Opzava read models, so that project management remains usable when a tenant Gateway is unavailable.
73. As a developer, I want the highest test seam to cover project workflows through application ports and UI composition, so that behavior is protected without coupling tests to implementation details.

## UX walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `essential-project.html` | Project home with Essential top bar, project switcher, recent projects, project summary, active AI employees, New to-do, primary goal, tiles for Goals, To-dos, Board, Content Pipeline, Ask your assistant, Team, Docs & Files, Schedule, Updates, Discovery, Add a card, and latest activity. Project cards/tools are Opzava-owned surfaces; AI snippets are projected status. |
| `essential-new-project.html` | Project creation flow with breadcrumb, one-step project name, validation, type picker, blank project defaults, marketing and promotion defaults, future types, Create project and Cancel. The selected type seeds project tools but does not bypass RBAC or later configuration. |
| `essential-boards.html` | Cross-project board summary with total board counts, on-track/needs-you/blocked rollups, project board cards, column counts, review/fix actions, owner/assistant avatars, and Open board links. This is a Project Management read model, not a live OpenClaw Workboard query. |
| `task-board.html` | Full/admin Tasks surface with runtime-flavored Backlog/In progress/Review/Done columns, agent names, queued/running/degraded/review statuses, progress percentages, and filters. This informs projected runtime status language but remains distinct from Essential `pm.Card` boards. |
| `essential-add-card.html` | Add-card modal for project tools/cards: SMART Goal, To-do list, Note, Board, Content Pipeline, Schedule, Docs & Files, Discovery, Updates, assistant suggestion, Cancel, and typed create action. Adding a tool creates Opzava project configuration and seed records where applicable. |
| `essential-card.html` | Card detail for stable global ID, copy link/ID, menu actions, title, status, labels, due date, assignment to AI employee, watchers, tabs, overview, steps, comments, AI run timeline, evidence/files/links, quality review, checks, reviewers, approval/send action, and done confirmation. This is the canonical `pm.Card` detail. |
| `essential-card-table.html` | Project kanban board with project board switcher, all-boards summary link, Add a card, explanatory copy, columns, cards with IDs, labels, due dates, progress, assignees, comments/files, and per-column add actions. This sets the everyday board behavior and card row compact fields. |
| `project-status-table.html` | Full/admin cross-project health table with export, New project, needs-you/blocked banners, sortable project rows, status, in-progress/review/blocked counts, last run/cost placeholders, owner agents, cached/offline/error/empty states, and note that runtime run/cost linkage is planned. This PRD owns the project/count columns and degraded states; runtime cost/run linkage remains projected. |
| `essential-goals.html` | Project Goals page with Add goal, waiting-on-you banner, primary goal, SMART goal cards, progress, owner, deadline, why it matters, connected work, link work, check-ins, and other goals. Goals connect work and schedule but remain Project Management aggregates. |
| `essential-goal-create.html` | Add-goal modal as three steps: Write, Measure, Own & schedule. Includes assistant SMART draft, sanity check, templates, metric type, start/current value, target value, unit, manual vs rollup measurement, owner, time period, connected work, and create behavior. |
| `essential-schedule.html` | Project Schedule with Add event, Schedule an AI run, assistant weekly summary, risk callout, project tool links, subscribe/add-to-calendar affordance, month/week views, filters by type, meetings, to-do due dates, goal check-ins/deadlines, agent runs, status legend, empty filtered state, and reschedule actions. |
| `essential-my-schedule.html` | Cross-project My schedule with next-three-months summary, needs-you action, subscribe/add-to-calendar, month/week views, project filter, project labels on items, item drawer, empty filtered state, type/status legend, and upcoming details. This consumes project schedule read models across authorized projects. |
| `essential-todos.html` | Project To-dos page with Add a to-do, open/due/review/done summary, grouped lists, item progress, assignees, due dates, comments, working/draft-ready state, done items, and per-list add actions. |
| `essential-todo-new.html` | Add-to-do modal with title validation, assignment to human or AI employee, due date, list selection, details/sub-steps, AI-starts-right-away copy, Cancel, and Add to-do. AI assignment creates or schedules dispatch according to policy. |
| `essential-event-new.html` | Schedule content/event modal with content name validation, channel, campaign, date, time, status, AI draft/schedule note, Cancel, and Schedule content. This is a project schedule event and may later connect to campaign/content pipeline flows. |
| `issues.html` | Full/admin Issues surface synced with GitHub, showing sync state, New issue, triage pipeline, filters, issue table, labels, assignees, AI agent assignment, updated time, open/in-review/closed status, and counts. Opzava can link issues to `pm.Card` and `AgentDispatch`; external tracker metadata remains synced input. |

## Functional requirements

### Project CRUD and project tools

- Project Management must own Project write models for create, update, archive, reopen, and delete/retire operations.
- Project creation must require active organization context and `AuthorizationPort` permission for project creation.
- Project names must be required and unique enough within the active organization to avoid confusing duplicate navigation; exact uniqueness policy may be tenant-configurable but must be deterministic.
- Project types must seed default project tools, labels, card prefixes, and assistant affordances through Project Management configuration.
- Blank project defaults must include the everyday tools shown in the mockup: to-dos, board, assistant, team, docs, schedule, updates, and discovery.
- Marketing and promotion defaults must seed campaign/content-oriented tools without making marketing a role or tenant hierarchy.
- Project archive must preserve cards, goals, to-dos, schedules, docs metadata, discovery records, issue links, activity, and dispatch history.
- Archived projects must block normal work mutations unless the user performs an authorized reopen or archival maintenance action.
- Project delete/retire behavior must fail closed when cards, docs, dispatches, or audit records require retention; destructive hard delete is not part of this PRD.
- Project tools/cards added through the Add a card modal must be idempotent where the tool is singleton per project, such as Schedule or Docs & Files.
- Project tool visibility must be filtered by RBAC, project configuration, and project lifecycle state.

### Boards and `pm.Card`

- Project Management must own `pm.Card` as the human-work aggregate for board semantics, customer impact, assignments, due dates, labels, comments, steps, approvals, evidence refs, watchers, and lifecycle state.
- A `pm.Card` must have a stable tenant/project-scoped global handle in the form configured for the project, such as `CS-1042`.
- Card handles must be immutable after assignment and must resolve to the card through authorized lookup.
- Card creation must support title, description, source, labels, due date, assignee, column/status, steps, linked goal/to-do/docs, and optional external issue ref.
- Card statuses must support at least triage/not started, in progress, review, on hold, done, archived, and blocked/degraded sub-states where applicable.
- Board columns must be configurable per board but must support the default Triage, In progress, On hold, and Done flow.
- Kanban movement must update card status through Project Management commands and emit events for read models, activity, notifications, and realtime fan-out.
- Table view must use the same card read model as kanban view with sortable/filterable columns appropriate to large boards.
- Cross-project board summaries must be read models derived from authorized project/card data and must not query OpenClaw Workboard directly.
- Cards must support watchers, comments, comment read/typing indicators where collaboration infrastructure is available, and AI/human attribution.
- Card evidence must store metadata and refs to files, links, artifacts, screenshots, videos, drafts, and external records without exposing raw provider secrets.
- Quality review must support reviewer state, automated pre-checks, human decisions, changes requested, approve/send, and unresolved review gates.
- Mark done must warn when unresolved review gates, unsent AI drafts, blocked steps, or pending approvals remain.
- Archive card must preserve audit, comments, evidence metadata, dispatch refs, and linked issue refs.

### AI dispatch from cards

- Assigning or asking an AI employee to work a `pm.Card` must create or reuse an ADR-008 `AgentDispatch`.
- `AgentDispatch` must be the bridge from `pm.Card` to OpenClaw runtime work; it must not replace `pm.Card` identity.
- The dispatch command must pass through authorization, tenant lifecycle checks, AI employee availability, policy admission, spend/rate/concurrency caps, tool policy, knowledge scope resolution, and idempotency.
- `AgentDispatch` must record target card, actor, requested intent, selected employee or routing decision, dispatch policy, idempotency key, assignment ids, knowledge corpus refs, and opaque OpenClaw refs.
- Runtime refs such as Workboard card ref, task ref, run ref, session key, approval ref, artifact ref, and channel/thread ref must be value objects, not foreign keys into PM identity.
- OpenClaw `workboard.Card` remains OpenClaw-owned. Opzava may store opaque refs and projected lifecycle state only.
- Dispatch lifecycle changes must project back into `pm.Card` read models as agent-work status, step progress, review items, evidence, comments/activity, notifications, and schedule updates.
- Duplicate, out-of-order, stale, or missing runtime events must be deduplicated and reconciled according to ADR-004 projection rules.
- If runtime refs disappear, the card must show degraded terminal state such as missing runtime ref, purged runtime ref, gateway deleted, or repair needed; the card itself must not be deleted or rewritten.
- Gateway unavailable, circuit open, policy denied, approval required, approval rejected, and provisioning required must appear as normal card/dispatch states with clear user actions.

### Goals

- Project Management must own goal write models and goal read models.
- Goals must support SMART fields: specific title/outcome, start/current value, target value, unit, owner, deadline/time period, why it matters, and connected work.
- Goal creation must support assistant-drafted SMART text, but human review is required before create.
- Measurement must support manual check-ins and rollup from connected work.
- Connected work may include to-dos, cards, boards, docs, schedule events, discovery records, and issue links where authorized.
- Goal status must be computed or manually set according to a documented Project Management policy and must include on track, at risk, off track, achieved, and needs-you states.
- Goals must emit schedule items for check-ins and deadlines.
- A project may designate one primary goal for project-header display.
- Goal check-ins must record author, timestamp, period, current value, status, explanation, and whether AI drafted and human approved the check-in.

### To-dos

- Project Management must own to-do lists and to-do items as lightweight project work.
- To-dos must support title, details, sub-steps, list, assignee, due date, comments count, done state, linked card/goal/docs, and AI/human attribution.
- To-dos assigned to AI employees must use the same dispatch admission path as card AI work when the to-do requires runtime execution.
- AI to-do completion must produce reviewable output before any external send or governed mutation.
- To-do due dates must project to project Schedule and My schedule.
- To-dos must roll up into project activity, My stuff, goal connected work, and search/read models.
- Completing a to-do must be an Opzava command and must not depend on OpenClaw Workboard identity.

### Schedules, calendars, and events

- Project Management must own project event metadata for meetings, content events, deadlines, goal check-ins, to-do due dates, and project-created schedule items.
- AI Workforce must own standing orders and scheduled AI assignments, with Project Management consuming projected schedule/run summaries for project calendars.
- Project Schedule must support month and week views, type filters, project-local timezone display, legends, empty filtered states, and reschedule actions where allowed.
- My schedule must aggregate authorized project schedule items across projects and expose project filters.
- Schedule items must include type, status, title, project, time/date, source, linked record, and action target.
- Status and type must be represented by labels/glyphs and not color alone.
- Schedule subscription/add-to-calendar must expose only authorized items and must not embed secrets in URLs or payloads.
- Content/event creation must support name, channel, campaign/project association, date, time, status, and AI draft/schedule affordance.
- Rescheduling AI runs must go through AI Workforce scheduling policy and must project the new state back to schedules.

### Docs, files, and project knowledge

- Knowledge Management must own project knowledge sources, document metadata, source blob refs, corpus revisions, ingestion jobs, and index status per ADR-010.
- Project Management may attach docs/files/evidence refs to projects, cards, to-dos, goals, discovery records, and issues.
- Uploads, links, AI artifacts, customer-ticket attachments, and external files must store metadata and source refs without hardcoded credentials or raw provider secrets.
- Promotion from evidence or draft artifact into project knowledge must go through Knowledge Management source and corpus revision policy.
- Project docs/files must be authorized by project scope and must not be made visible through search, card evidence, or AI retrieval without `AuthorizationPort` checks.
- AI assignments from cards, to-dos, goals, and discovery must resolve authorized project corpus overlays server-side; browser-supplied corpus ids are not routing authority.

### Discovery

- Project Management must own discovery ideas, statuses, votes, comments metadata, research links, assistant suggestions, and decided/connect state.
- Discovery must support grouping by status and theme.
- Idea records must support title, description, author or assistant attribution, status, theme, votes, comments count, research refs, and linked work.
- Decided ideas may create or link to `pm.Card`, to-do, goal, doc, event, or new project when the actor has permission.
- Assistant suggestions and research may use AI Workforce/Knowledge Management flows but must project durable decisions back into Project Management records.
- Discovery records must remain project-scoped and searchable only within authorized scope.

### Issues

- Issues may sync external issue metadata such as issue number, title, labels, assignee, updated time, and external status through an integration adapter.
- External issue tracker metadata remains external-source data; Opzava owns links from an issue to project, `pm.Card`, `AgentDispatch`, comments/activity refs, and triage decisions made in Opzava.
- Issue triage stages must support needs triage, ready for agent, ready for human, in progress, and closed/in review mappings.
- Creating a new issue from Opzava must use the configured integration path and must not call provider CLIs from the product runtime.
- Ready-for-agent issue action must create or link a `pm.Card` before dispatching AI work, so the human-work record remains durable.
- Issue sync failures must show last successful sync, retry action, and cached-state labels without blocking core project data.
- Issue labels such as `ready-for-agent`, `ready-for-human`, `needs-triage`, and `needs-info` may be displayed from the integration, but this PRD does not publish issues or change tracker conventions.

### Activity, updates, realtime, and states

- Project Management must emit events for project, card, goal, to-do, schedule, discovery, docs-link, and issue-link changes.
- Read models must feed project home, board summaries, table views, goals, to-dos, schedules, My schedule, latest activity, and search entry points.
- Realtime updates may update visible cards, counts, comments, AI run status, schedule state, and review state, but durable read models remain the reconnect source.
- Every list/detail surface must define loading, empty, no-match, forbidden, offline cached, stale projection, retry, and degraded Gateway states.
- Missing tenant or authorization context must render hard forbidden behavior, not an empty project, per ADR-007.
- Essential copy must stay plain-language; admin/full diagnostics may reveal technical detail behind an explicit disclosure.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Project CRUD and directory | Project Management with Identity & Access authorization | Project aggregate, project type defaults, project lifecycle, project members visibility, archive/reopen, project read models | `AuthorizationPort`, `EventBusPort` |
| Project tool configuration | Project Management | Enabled tools/cards, project home tile order, singleton tool state, add-card/tool commands, project activity events | `AuthorizationPort`, `EventBusPort` |
| Boards and `pm.Card` | Project Management | Board aggregate/config, `pm.Card` aggregate, columns, labels, steps, comments metadata, watchers, evidence refs, lifecycle events, board/table read models | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Card comments and activity pointers | Project Management with Internal Collaboration | Card comment thread refs, typing/read projections where available, activity feed entries, mentions pointers | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Card evidence and attachments | Project Management with Knowledge Management/Object Storage | Evidence metadata, file refs, artifact refs, external links, promotion candidates, source blob refs | `KnowledgeSourcePort`, `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |
| Card AI dispatch | AI Workforce owns `AgentDispatch` and `Assignment`; Project Management owns target `pm.Card` | Dispatch command, idempotency key, selected employee, assignment refs, opaque runtime refs, projected status, card review items | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| OpenClaw runtime projection | AI Workforce and Notifications/Admin-Observability with Project Management consumers | Workboard/task/run/session snapshots, status projections, missing-ref repair states, incident/error cards where needed | `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Goals | Project Management | Goal aggregate, SMART fields, measurement mode, connected work refs, check-ins, primary goal, goal read models, schedule projections | `AuthorizationPort`, `EventBusPort`, optionally `RealtimeTransportPort` |
| To-dos | Project Management with AI Workforce for AI-assigned work | To-do lists/items, sub-steps, assignment, due dates, completion, AI dispatch refs, reviewable outputs | `AuthorizationPort`, `EventBusPort`, `OpenClawGatewayPort` through dispatch |
| Project Schedule | Project Management with AI Workforce schedule projections | Meetings, due dates, goal check-ins/deadlines, content events, AI run windows/status, reschedule commands, calendar read models | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| My schedule | Project Management as read-model coordinator | Cross-project authorized schedule read model, project filters, needs-you schedule actions, subscription feed refs | `AuthorizationPort`, `EventBusPort` |
| Docs & Files | Knowledge Management with Project Management links | Document metadata, source blob refs, published corpus revisions, ingestion/index status, project doc listing, card evidence promotion | `KnowledgeSourcePort`, `KnowledgeIndexPort`, `ObjectStorePort`, `AuthorizationPort` |
| Discovery | Project Management with optional AI Workforce support | Idea records, statuses/themes, votes, comments metadata, research refs, assistant suggestions, connect-to-work commands | `AuthorizationPort`, `EventBusPort`, `KnowledgeSourcePort`, optionally `OpenClawGatewayPort` via dispatch |
| Issues | Project Management with integration adapter and optional AI Workforce dispatch | External issue refs, synced metadata, triage stage, issue-to-card link, ready-for-agent dispatch, sync status, cached/error states | `AuthorizationPort`, `EventBusPort`, integration provider port, `OpenClawGatewayPort` through dispatch |
| Project activity and updates | Project Management with contributing contexts | Activity entries for project/card/goal/to-do/schedule/docs/discovery/issue/dispatch events, latest activity read models | `EventBusPort`, `AuthorizationPort`, `RealtimeTransportPort` |
| Notifications and My stuff pointers | Notifications/Admin-Observability and Project Management | Needs-you review items, due/blocked cards, AI draft-ready items, goal check-ins, schedule risk, notification action targets | `EventBusPort`, `AuthorizationPort`, `RealtimeTransportPort` |

## OpenClaw-parity notes

| Feature area | Classification | Native harnessed vs Opzava-owned decision |
| --- | --- | --- |
| Projects | Opzava-owned | Projects are Opzava Project Management records. OpenClaw does not own project identity, project access, project lifecycle, or project type. |
| Project tools/cards | Opzava-owned | Goals, to-dos, board, schedule, docs links, discovery, updates, and issue links are Opzava project configuration and aggregates. |
| `pm.Card` | Opzava-owned | `pm.Card` is the human-work aggregate for boards, assignment, review, comments, evidence, lifecycle, and stable global ID. |
| OpenClaw Workboard `workboard.Card` | Native harnessed | Workboard cards remain Gateway-local runtime objects. Opzava stores opaque refs and projected lifecycle only through `AgentDispatch`. |
| `AgentDispatch` bridge | Hybrid | AI Workforce owns the Opzava bridge and assignments. It harnesses OpenClaw sessions/tasks/runs/Workboard through the broker and projects status back to cards. |
| Kanban and table boards | Opzava-owned | Board columns, counts, filters, card rows, table views, and cross-project summaries are Opzava read models. Runtime snippets may enrich rows only as projections. |
| Full/admin Tasks board | Native harnessed with Opzava projection | The admin runtime Tasks surface can mirror OpenClaw task/workboard state. It must not become the source for Essential project boards. |
| Goals | Opzava-owned | SMART goals, measurement, connected work, check-ins, and primary goal state belong to Project Management. AI can draft/check in through dispatch and projections. |
| To-dos | Opzava-owned with hybrid execution | To-do identity and completion are Opzava-owned. AI-assigned to-dos dispatch runtime work and project reviewable results back. |
| Schedules and events | Mostly Opzava-owned | Meetings, deadlines, content events, due dates, and goal check-ins are Opzava-owned. AI scheduled runs are AI Workforce/OpenClaw runtime projections. |
| Docs & Files | Opzava-owned source, native harnessed index | Project docs metadata/source blobs/corpus revisions are Knowledge Management truth. OpenClaw memory/wiki/vector indexes are rebuildable projections. |
| Discovery | Opzava-owned with optional AI assistance | Idea records, votes, comments metadata, and connect decisions are Opzava-owned. AI research/suggestions are harnessed through dispatch and knowledge flows. |
| Issues | Hybrid | External issue metadata may sync from GitHub or another tracker. Opzava owns project links, triage decisions, card creation/linking, and agent dispatch. |
| Runtime lifecycle states | Hybrid | OpenClaw is truth for runtime execution. Opzava owns the sanitized card/to-do/schedule/notification projections and user actions. |
| Authorization | Opzava-owned | ADR-007 `AuthorizationPort` decides visibility and actions. OpenClaw never decides project/card access. |

## Acceptance criteria

- Authorized users can create a project with a required name and selected type, then land on a project home seeded with the expected tools.
- Unauthorized users cannot create, view, update, archive, reopen, or delete projects outside their role grants; missing tenant context returns forbidden behavior.
- Project home renders the tiles and latest activity required by `essential-project.html`, with loading, empty, error, offline cached, and forbidden states.
- Project add-card/tool flow supports every option shown in `essential-add-card.html` and respects singleton/project configuration rules.
- Kanban board renders columns, counts, cards, add-card actions, and card compact metadata from Opzava `pm.Card` read models.
- Card table view uses the same `pm.Card` records as kanban and supports scanning/sorting of large boards.
- Cross-project board summary shows on-track, needs-you, and blocked board states across authorized projects.
- Every card has a stable global handle that can be copied, searched, linked, and resolved through authorization.
- Card detail supports overview, AI run summary, evidence/files, quality review, comments, steps, watchers, menu actions, and done confirmation.
- `pm.Card` lifecycle changes emit events and update board, table, project home, schedule, notifications, activity, and My stuff read models where relevant.
- Assigning AI work from a card creates or reuses an `AgentDispatch` and never replaces the `pm.Card` id with an OpenClaw Workboard id.
- OpenClaw Workboard/task/run/session refs are stored only as opaque value refs attached to dispatch/projection state.
- Runtime states including queued, running, degraded, review, approval required, blocked by policy, failed, missing runtime ref, and completed project back to the card.
- Runtime projection loss or Gateway downtime degrades AI status without deleting or corrupting the owning card/to-do/goal/event/issue.
- Goals can be created through the three-step flow, optionally using AI-drafted SMART text reviewed by a human.
- Goals support manual and connected-work measurement, owners, deadlines, check-ins, status, primary goal display, and connected work.
- To-dos support lists, sub-steps, due dates, assignees, comments count, done state, AI assignment, and project schedule projection.
- Project Schedule renders meetings, to-do due dates, goal check-ins/deadlines, content events, and AI runs with month/week views and type filters.
- My schedule aggregates authorized projects and allows project filtering without leaking unauthorized item names.
- Event/content scheduling validates required fields and records channel, campaign, date, time, and status.
- Docs/files metadata can attach to projects/cards/to-dos/goals/discovery/issues and can be promoted into project knowledge only through ADR-010 flows.
- Discovery supports ideas, status/theme grouping, votes, comments metadata, research refs, assistant suggestions, and connect-to-work actions.
- Issue table displays synced external issue metadata, triage stages, labels, assignee/AI agent, update age, and status.
- Ready-for-agent issue flow creates or links a `pm.Card` before dispatching AI work.
- All project-management screens use durable Opzava read models for lists and summaries and reconcile realtime updates after reconnect.
- Essential screens do not expose OpenClaw identifiers, raw logs, provider secrets, or Gateway-local storage paths.
- Admin/full screens may show more operational status but still use the ADR-003 broker and ADR-004 projection boundary.

## Testing decisions

- Test at the highest product seams: project application commands/queries, authorization-gated route/server actions, read-model projectors, and UI composition for the named workflows.
- Tests should assert external behavior: visible cards, statuses, actions, forbidden states, read-model updates, and emitted events. They should not assert component internals or private aggregate fields.
- Project CRUD tests must cover create, validation, type defaults, archive/reopen, forbidden access, missing tenant context, and stale/revoked project access.
- Board/card tests must cover card creation, movement, table/kanban consistency, global handle resolution, due dates, labels, watchers, steps, comments metadata, evidence refs, done warning, hold, archive, and cross-project summaries.
- Dispatch tests must cover idempotent card AI dispatch, authorization denial, policy denial, approval-required state, Gateway unavailable, duplicate runtime event, out-of-order event, missing runtime ref, and projection back to card detail/board summaries.
- Goal tests must cover SMART draft acceptance, manual metric updates, connected-work rollup, primary goal, check-ins, status transitions, linked schedule entries, and forbidden linked-work access.
- To-do tests must cover create validation, human assignment, AI assignment, sub-steps, due date projection, completion, comments count, linked goal/card, and My stuff/schedule read-model updates.
- Schedule tests must cover project month/week views, type filters, My schedule project filters, event creation validation, AI run projection, reschedule authorization, offline/cached state, and calendar subscription authorization.
- Docs/files tests must cover attachment metadata, evidence vs project knowledge promotion, authorized doc listing, corpus overlay resolution, stale index state, and source ref visibility.
- Discovery tests must cover idea CRUD, grouping, votes, research refs, assistant suggestion projection, connect-to-work commands, and authorization on linked records.
- Issue tests must cover sync-state display, triage stage mapping, issue-to-card linking, ready-for-agent dispatch, sync failure cached state, and provider metadata not becoming PM identity.
- RBAC tests must cover Owner/Admin/Manager/Member/Guest-Client differences at project, card, docs, schedule, discovery, and issue actions.
- Realtime tests must treat live updates as latency improvements and assert reconnect backfill from durable read models.
- Accessibility tests must cover keyboard operation for add-card, card menus, board movement alternative controls, goal modal steps, schedule filters, table sorting, and status labels not relying on color alone.
- Existing PRD-002 shell/navigation tests should be reused for top-bar routing, project switcher entry, global Find entry, and notification/My stuff pointers rather than duplicated here.

## Dependencies

- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections. Required for Opzava Postgres truth, read models, projection behavior, and `pm.Card` vs OpenClaw Workboard separation.
- ADR-007: Resource-scoped RBAC, roles-as-data, and Postgres RLS. Required for project as child scope, `AuthorizationPort`, Guest-Client behavior, and fail-closed tenant access.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`. Required for AI employee assignment, dispatch lifecycle, opaque runtime refs, and card-to-agent bridge.
- ADR-010: Knowledge Management, OKF ingestion, and admin skill catalog. Required for project docs/files, corpus overlays, source-of-truth knowledge, and AI retrieval scope.
- PRD-002: App shell, navigation, command palette, search, and project switcher. Required for Essential shell, project switcher, Home/My stuff entry points, notifications, and global Find links into these project surfaces.
- Internal Collaboration bounded context for durable project/card comments, mentions, read cursors, and activity pointers where comments integrate with chat/activity.
- Notifications/Admin-Observability bounded context for needs-you notifications, dispatch/runtime incidents, alert/admin projections, and realtime notification fan-out.
- AI Workforce provisioning must provide eligible `AgentEmployee` records and assignment admission before AI assignment flows are enabled.
- Knowledge Management object storage and corpus indexing must exist before docs/files can become project knowledge sources.
- External issue/calendar/content integrations may be stubbed behind provider ports for first implementation, but the UI must show explicit sync/unavailable states when providers are not connected.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
