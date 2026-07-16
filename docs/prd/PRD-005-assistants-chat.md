# PRD-005: Ask Opzava and Ask Admin Opzava conversations

> **Admin placement amendment (2026-07-16):** This PRD remains authoritative for Ask Admin Opzava's
> persona, conversation lifecycle, authorization, projections, remediation behavior, approvals, and
> internal chat composition. PRD-020, **Admin Control Center — shell, navigation, and overview
> composition**, owns its pinned Admin placement, containing shell, route, and topbar context. The
> existing Ask Admin design is not being redesigned here; old rail and surrounding shell details are
> migration evidence only.

## Problem

Opzava needs two assistant conversation surfaces that feel like part of the product instead of a
thin wrapper around OpenClaw sessions.

Everyday users need Ask Opzava to explain project status, answer cross-project questions, delegate
work to the right AI employee, stream progress while the work is happening, and surface approvals
inline. Project members also need a project-scoped assistant conversation that uses the selected
project's knowledge and reports back into project work. Platform operators need Ask Admin Opzava to
triage incidents, inspect projected runtime state, propose safe remediation, and execute approved
remediation through the ADR-003 admin-token job path.

Without a PRD-level contract, these surfaces can drift into unsafe or confusing shapes:

- Ask Opzava could become one generic omniscient chat that leaks project context across
  authorization boundaries.
- Project assistants could bypass `AgentDispatch`, assignments, approval policy, project knowledge
  scope, or Activity hand-offs.
- Live token streaming could be mistaken for durable chat history before an assistant turn is
  finalized.
- Ask Admin Opzava could turn an Incident into broad tenant-admin authority instead of a constrained
  remediation surface.
- Inline approvals could be scattered across chat, notifications, Activity, and project screens
  without one accountable decision record.

The solution is an Opzava-owned assistant conversation product surface backed by ADR-008, ADR-009,
ADR-003, and ADR-013. Opzava owns assistant conversation rows, admission, authorization, context
scoping, approvals, activity projections, and durable final messages. OpenClaw is harnessed for
delegate-agent sessions, live token streams, runtime approvals, tools, logs, and remediation
operations through the broker.

## Goals and Non-goals

### Goals

- Ship Ask Opzava as the everyday tenant personal assistant for authorized users, using the hot-path
  broker token and explicit project-scoped context.
- Ship project assistant conversations such as Atlas for one project at a time, with project corpus
  overlays, project tools, and project-scoped approvals.
- Ship Ask Admin Opzava as the platform-ops assistant for admin/full users, centered on the ADR-013
  Incident lifecycle, redacted evidence, and constrained remediation actions.
- Make assistant responses stream live tokens with clear "working", "delegating", "tool check",
  "approval needed", "completed", and "failed/degraded" states.
- Route work to department AI employees when a specialist is appropriate, while preserving Ask
  Opzava as the coordinator facade.
- Surface approvals inline in assistant chats, with the same approval rows, policy gates, and audit
  trail used by project/workflow surfaces.
- Keep project-scoped knowledge explicit: each delegated turn must resolve authorized project/org
  corpus overlays server-side.
- Preserve final assistant messages, summaries, approvals, hand-offs, reports, and remediation
  outcomes as Opzava-owned durable records/projections.
- Give Ask Admin Opzava a remediation surface that can investigate, draft fixes, run dry-runs,
  request approvals, and execute approved one-scope actions.
- Define data/API touchpoints by bounded context and port without re-stating the ADR architecture.
- Define OpenClaw-parity boundaries so native runtime sessions and streams are harnessed while
  Opzava owns product state.
- Define acceptance and testing decisions at user-visible assistant conversation seams.

### Non-goals

- Build Internal Collaboration rooms, DMs, threads, reactions, mention inbox, Web Push, or project
  Team rooms. Those are PRD-004, though this PRD emits messages, hand-offs, and Activity rows
  consumed there.
- Build the app shell, command palette, global Find, Home, notification bell, or project switcher.
  Those are PRD-002.
- Build Project Management boards, cards, goals, to-dos, docs, schedules, discovery, or project
  Updates beyond assistant entry points and projected assistant output. Those belong to the Project
  Management surface (`pm.Card`, deferred).
- Build AI employee provisioning, persona editing, department management, standing orders, or
  autonomy-tier administration beyond using the ADR-008 model.
- Build Knowledge Management ingestion, corpus rebuild, OKF import, embedding, or memory internals
  beyond resolving authorized context overlays.
- Build the full Incident pipeline, error grouping, Incidents view/projection, alert routing, or
  remediation aggregate internals. Those are ADR-013 and later observability PRDs.
- Expose OpenClaw session transcripts, raw Gateway DTOs, raw tool output, provider secrets, channel
  credentials, or Gateway-local config to browser clients.
- Allow Ask Admin Opzava to perform unapproved destructive, cross-tenant, bulk, secret-changing, or
  tenant-admin remediation.

## User Stories

1. As an everyday member, I want Ask Opzava in the Essential top bar, so that I can ask for help
   without choosing a project first.
2. As an everyday member, I want Ask Opzava to explain that it works across every project, so that I
   understand when to use it instead of a project assistant.
3. As an everyday member, I want Ask Opzava to show a morning cross-project digest, so that I can
   see what is on track, blocked, and waiting on me.
4. As an everyday member, I want each digest row to link to the relevant project, so that I can
   inspect the source work quickly.
5. As an everyday member, I want digest rows to use plain status labels such as on track, needs you,
   ready, and blocked, so that I do not need runtime vocabulary.
6. As an everyday member, I want Ask Opzava to answer "How's everything today?", so that I can get a
   short cross-project status without visiting every project.
7. As an everyday member, I want Ask Opzava to distinguish all-project coordination from
   project-scoped work, so that private project knowledge is not blended casually.
8. As an everyday member, I want Ask Opzava to show when it is coordinating across projects, so that
   I know work is still in progress.
9. As an everyday member, I want expandable "what was checked" trace cards, so that I can inspect
   the high-level sources behind an answer.
10. As an everyday member, I want trace cards to hide sensitive tool detail by default, so that the
    chat stays readable and safe.
11. As an everyday member, I want Ask Opzava to identify the project that needs my approval, so that
    I can act from the chat without losing context.
12. As an everyday member, I want an inline approval card with Approve & send, Request changes, and
    View draft actions, so that I can clear review work from the conversation.
13. As an everyday member, I want inline approval decisions to confirm in the same chat, so that I
    know the decision was recorded.
14. As an everyday member, I want approval confirmations to mention downstream delivery such as
    Activity updates, so that I know where to look next.
15. As an everyday member, I want Ask Opzava to delegate specialist work to AI employees such as
    Cipher or Atlas, so that the right employee performs the work.
16. As an everyday member, I want delegated work to show the employee persona that handled it, so
    that assistant output is accountable.
17. As an everyday member, I want Ask Opzava to stay the coordinator instead of pretending to be
    every specialist, so that work ownership is clear.
18. As an everyday member, I want Ask Opzava to refuse or route work when I lack project access, so
    that unauthorized project names and snippets do not leak.
19. As an everyday member, I want Ask Opzava to handle project ambiguity by asking for a project or
    offering authorized choices, so that the assistant does not guess unsafe context.
20. As an everyday member, I want Ask Opzava to continue an existing conversation thread, so that
    follow-up questions keep the relevant authorized context.
21. As an everyday member, I want old Ask Opzava conversations to remain readable after a runtime
    session is purged, so that decisions and reports remain auditable.
22. As an everyday member, I want live streamed assistant text to become one final durable message
    when complete, so that the transcript does not duplicate partial tokens.
23. As an everyday member, I want failed streams to show retry or degraded state, so that I
    understand whether work was saved.
24. As an everyday member, I want Ask Opzava to show policy-denied actions in plain language, so
    that I know when approval, connection, or permission is required.
25. As an everyday member, I want Ask Opzava to create Activity hand-offs when a delegated task
    needs me, so that work does not disappear in chat history.
26. As a mobile user, I want Ask Opzava chat to preserve digest actions, inline approvals, and
    composer access on a small screen, so that I can use it from a phone.
27. As a keyboard user, I want message compose, trace toggles, approval actions, and project links
    to work with keyboard focus, so that chat is accessible.
28. As a screen-reader user, I want streamed assistant output and approval cards announced politely,
    so that updates are understandable without visual scanning.
29. As a project member, I want each project to expose Ask your assistant when the tool is enabled,
    so that I can ask for project-specific help.
30. As a project member, I want the project assistant header to show the project name and assistant
    persona, so that I know which project and employee I am talking to.
31. As a project member, I want project AI employees labeled as AI, so that they are not confused
    with human teammates.
32. As a project member, I want the project assistant to link back to Ask Opzava, so that I can move
    from project scope to cross-project coordination.
33. As a project member, I want project assistant prompts to stay scoped to one project, so that the
    assistant uses the correct project corpus and tools.
34. As a project member, I want project assistant answers to reference cards, to-dos, docs,
    schedules, outputs, and updates in that project, so that I can verify work.
35. As a project member, I want project assistant trace cards to show high-level project checks, so
    that I can see which project data informed the answer.
36. As a project member, I want project assistant output previews to open safely, so that I can
    review generated drafts before approving them.
37. As a project member, I want the project assistant to surface partner outreach or content
    approvals inline, so that project review happens in context.
38. As a project member, I want Approve & send from the project assistant to update the owning
    approval row, so that the same decision appears in Activity, project Updates, and workflow
    state.
39. As a project member, I want Request changes to return the assistant to revision mode, so that a
    rejected draft becomes actionable work.
40. As a project member, I want project assistant work to create or reuse `AgentDispatch` and
    `Assignment` records when it performs project work, so that project work is auditable.
41. As a project member, I want assistant-created summaries, outputs, and reports to appear in the
    project's Outputs or Updates where appropriate, so that useful results do not live only in chat.
42. As a project member, I want an empty state when no assistant is assigned to the project, so that
    I know to ask Ask Opzava or project settings to add one.
43. As a project member, I want project assistant errors to show retry without exposing raw Gateway
    errors, so that the failure is recoverable.
44. As a Guest-Client, I want project assistant visibility filtered to the project areas I can
    access, so that internal assistant work remains private.
45. As an organization owner, I want role revocation to stop assistant context access, streaming
    subscriptions, approval detail, and conversation detail on reload/reconnect, so that stale
    access fails closed.
46. As a department lead, I want Ask Opzava to route marketing work to Marketing employees, support
    work to Support employees, finance work to Finance employees, and CRM work to Customer
    Management/CRM employees, so that autonomy policy follows the domain.
47. As a department lead, I want high-risk finance and CRM requests to default to
    draft-and-approval, so that sensitive actions are governed.
48. As a department lead, I want ordinary approved marketing/support sends to use the employee's
    channel bindings, so that external communication is attributed correctly.
49. As a reviewer, I want approvals from assistant chats to show source project, assistant, draft,
    risk level, and action target, so that I can make a safe decision.
50. As a reviewer, I want approval actions to be idempotent, so that double-clicks or reconnect
    retries do not send twice.
51. As a reviewer, I want stale approval cards to disable after someone else decides, so that I do
    not act on obsolete work.
52. As an admin/full-shell user, I want the pinned Ask Admin Opzava destination owned by PRD-020 to
    open the authorized conversation behavior owned here, so that placement and assistant semantics
    have one owner each.
53. As an admin/full-shell user, I want Ask Admin Opzava to summarize projects, agents,
    integrations, approvals, and admin decisions, so that I can triage operations from one
    conversation.
54. As an admin/full-shell user, I want Ask Admin Opzava to identify blocked approvals and runtime
    issues, so that I can focus on work that needs intervention.
55. As an admin/full-shell user, I want Ask Admin Opzava trace cards to disclose admin-level checks
    only to authorized users, so that operations data is not exposed to ordinary users.
56. As a platform operator, I want Ask Admin Opzava to open and explain Incidents, so that triage
    happens from the same surface as remediation.
57. As a platform operator, I want Ask Admin Opzava to inspect redacted app, broker, Gateway,
    Workboard, task-ledger, health, usage, and audit projections, so that it can diagnose likely
    causes.
58. As a platform operator, I want Ask Admin Opzava to propose remediation actions with blast-radius
    labels, so that I know what scope the fix affects.
59. As a platform operator, I want Ask Admin Opzava to run dry-run-first where possible, so that I
    can see the expected change before approving execution.
60. As a platform operator, I want medium-risk remediation to require explicit approval, so that
    restarts, replays, and route repairs do not happen silently.
61. As a platform operator, I want destructive or tenant-admin remediation to require two-step human
    confirmation, so that high-risk changes are deliberate.
62. As a platform operator, I want approved remediation to execute through the audited admin-token
    job path, so that the browser and hot-path chat token never hold admin authority.
63. As a platform operator, I want Ask Admin Opzava to constrain remediation to one tenant, Gateway,
    job, route, or bounded operational target at a time, so that one action cannot create
    cross-tenant blast radius.
64. As a platform operator, I want remediation results to write back to the Incident, so that its
    lifecycle and evidence show what changed and what remains.
65. As a platform operator, I want failed remediation to produce a clear next action or escalation,
    so that an attempted fix does not end as a silent failure.
66. As a security reviewer, I want all assistant turns to record human actor, assistant persona,
    acting-on-behalf-of metadata, project/tenant scope, approval refs, and opaque runtime refs, so
    that audits can explain who requested and who acted.
67. As a security reviewer, I want browser-supplied project ids, tenant ids, Gateway refs, agent
    ids, and corpus refs treated as hints only, so that routing authority stays server-side.
68. As a product operator, I want assistant conversations to degrade gracefully when a tenant
    Gateway is down, circuit-open, provisioning-required, or protocol-incompatible, so that users
    see recoverable states.
69. As a developer, I want assistant conversation behavior tested through application ports and UI
    composition, so that tests protect user-visible behavior without coupling to OpenClaw internals.
70. As a developer, I want live stream, webhook completion, and retry paths deduplicated by turn
    idempotency, so that one assistant answer creates one final message and one set of side effects.

## UX walkthrough

| Mockup                      | Required UX mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `essential-ask-opzava.html` | Essential Ask Opzava is the everyday cross-project assistant. It uses the Essential top bar with Ask Opzava active, a page header that says the assistant works across every project, a note that project-scoped work belongs in "Ask your assistant", a chat log with proactive digest, project rows, project links, "Yes/No" follow-up actions, user messages, live coordination status, expandable checked-project trace, inline approval card, Approve & send, Request changes, View draft, inline confirmation, composer, keyboard send hint, loading/error/offline states, and mobile-preserved approval actions. |
| `project-assistant.html`    | Project assistant is the project-scoped conversation. It renders project breadcrumb, project header, AI employee badges, project tabs with Ask your assistant active, assistant persona header such as Atlas, backlink to Ask Opzava, chat log scoped to one project, project-output references, expandable trace, inline approval hand-off, preview modal, Approve & send, Request changes, approved toast/confirmation, no-assistant empty state, retry error state, composer copy that says the assistant works on this project only, and links back to cross-project Ask Opzava for all-project coordination.       |
| `orchestrator-chat.html`    | Ask Admin Opzava is the Admin platform-ops assistant. Its chat title strip, digest, Review actions, question/answer flow, trace/tool card, downstream-agent state, inline approval card, suggestions, and composer remain behavioral evidence for this PRD. Its old rail, project/admin rail context, and topbar are superseded shell evidence; PRD-020 owns the pinned placement and container.                                                                                                                                                                                                                        |

## Functional requirements

### Assistant personas and scope

- Ask Opzava must be the everyday tenant personal assistant and coordinator facade for authorized
  organization users.
- Ask Opzava must use the ADR-003 hot-path broker authority only for normal runtime work: sessions,
  delegated agent chat, approval APIs, status reads, and projected runtime interactions.
- Ask Opzava must not use the ADR-003 `operator.admin` credential from browser, BFF, normal route
  handler, or ordinary chat execution paths.
- Ask Opzava may coordinate across projects only by resolving each project's authorization and
  context server-side.
- Ask Opzava must attach an explicit context scope to each turn: all-project summary, selected
  project, selected work item, selected approval, or selected incident reference.
- A cross-project answer may summarize multiple authorized projects, but delegated execution must
  resolve one project/work target or a policy-approved fan-out plan.
- Project assistant conversations must be scoped to exactly one project and one active organization.
- Project assistant prompts must resolve project access, project lifecycle, enabled assistant tool,
  AI employee assignment, and corpus revision before runtime dispatch.
- Project assistants must label the selected `AgentEmployee` persona and avoid presenting the
  assistant as a human user.
- Ask Admin Opzava must be available only to admin/full-shell users admitted to platform-ops
  surfaces.
- Ask Admin Opzava may inspect admin-observability projections and broker/ACL runtime snapshots only
  through approved application ports.
- Ask Admin Opzava remediation must use ADR-013 `RemediationAction` policy and the ADR-003
  admin/provisioning credential only through audited platform-ops jobs.

### Conversation lifecycle and transcript

- Assistant conversation history must be Opzava-owned durable product state, not OpenClaw session
  storage.
- Conversation records must capture tenant, organization, user-visible surface, optional project,
  assistant persona, actor, title/summary, lifecycle state, and audit metadata.
- Each user turn must carry actor, idempotency key, scope, requested intent, source route, optional
  target refs, and authorization decision metadata.
- Each assistant turn must carry assistant persona, author type, optional `AgentEmployeeId`,
  optional `Assignment`/`AgentDispatch` refs, optional approval/remediation refs, final content
  blocks, stream status, and opaque OpenClaw refs.
- Token deltas are live runtime data until finalization; they must not create multiple durable
  assistant messages.
- Finalization must produce one durable assistant turn/message for one logical runtime turn,
  deduplicated across stream completion, webhook completion, retries, and reconnect.
- Failed or interrupted streams must preserve user-visible status and allow retry where policy
  permits.
- Conversation history must remain readable when runtime sessions, logs, or Gateway-local refs are
  purged.
- Raw chain-of-thought, hidden model reasoning, provider payloads, tool secrets, channel
  credentials, and raw Gateway DTOs must never be stored or rendered in assistant transcript
  content.
- Trace/tool cards may expose high-level checks, safe command labels, summarized tool output, and
  source refs appropriate to the user's role.
- Admin trace/tool cards may include more diagnostics but must still redact secrets, tenant-crossing
  data, raw payloads, and unsafe configuration detail.

### Live streaming and realtime behavior

- Assistant token streaming must use the ADR-009 realtime path through `RealtimeTransportPort`.
- The UI must render streaming states for queued, working, coordinating, delegating, waiting for
  approval, finalizing, completed, failed, canceled, gateway unavailable, and policy denied.
- Stream attach must backfill conversation events or turn state before the client treats the live
  stream as current.
- Duplicate stream frames, reconnect replay, webhook completion, and browser retry must not
  duplicate text, approvals, messages, Activity rows, or remediation actions.
- The composer must disable or clearly queue submissions when the conversation cannot accept new
  turns.
- Users must be able to send a follow-up only when the current turn state allows it or the product
  explicitly supports parallel turns.
- Live status pills must distinguish human-readable progress from durable completion.
- Streamed output must be announced through accessible live regions without overwhelming assistive
  technologies.
- Mobile layouts must keep the latest streamed content, inline approval, and composer reachable
  without hiding required actions.

### Delegation to department employees

- Ask Opzava must route work to specialist `AgentEmployee` records when ADR-008 routing policy finds
  a better employee than the coordinator.
- Delegation admission must check tenant lifecycle, RBAC, project access, department policy,
  autonomy tier, tool policy, approval requirements, rate/spend/concurrency caps, idempotency, and
  knowledge scope.
- Delegated project work must create or reuse `AgentDispatch` when it originates from a project
  card, to-do, workflow step, approval, or assistant-created project task.
- AI Workforce must create `Assignment` records for selected employees and report assignment status
  back to the assistant conversation.
- The conversation must show selected employee persona attribution for delegated output, reports,
  approvals, and hand-offs.
- Multi-specialist work must appear as one coordinated user request with multiple employee statuses,
  not as anonymous parallel assistant messages.
- Department default autonomy must follow ADR-008: Finance and Customer Management/CRM default to T1
  draft/approval; Marketing and Support may use T2 only where channel binding and policy allow; T3
  remains narrow and non-mutating unless explicitly pre-approved.
- Policy denial, provisioning required, unavailable employee, missing channel binding, missing
  corpus, gateway unavailable, circuit open, and approval required must be normal user-visible
  states.
- Proactive assistant work may enter conversations only through authenticated webhook/projection
  paths and must pass the same admission and idempotency checks.

### Approvals surfaced inline

- Inline approval cards must be projections of Opzava approval rows, not chat-only buttons.
- Approval cards must show source project/work item, assistant/employee, draft or action summary,
  risk/approval reason, current status, primary action, secondary action, and deep link to full
  review.
- Approve & send, Request changes, Preview/View draft, and View full draft must re-check
  authorization at action time.
- Approval decisions must be idempotent and must tolerate duplicate button clicks, reconnect
  retries, and stale client state.
- Stale approval cards must update to decided, expired, superseded, or no longer authorized when
  another actor or workflow changes the approval.
- Approval decisions must write audit rows with actor, assistant, acting-on-behalf-of metadata,
  target, before/after state, policy reason, and runtime approval refs where applicable.
- Approvals resolved from assistant chat must update Activity, project Updates, notifications,
  workflow state, and the owning work item through the existing bounded-context events.
- Request changes must route revision instructions to the owning assistant/employee and preserve the
  rejected draft decision.
- Approval prompts must not expose draft content after access revocation; deep links must fetch
  current authorized detail from the owning context.

### Project context and knowledge

- Project-scoped assistant turns must resolve project corpus overlays through Knowledge Management
  server-side.
- Browser-supplied project, corpus, file, document, or runtime refs must be treated as hints and
  never as routing authority.
- Cross-project Ask Opzava summaries must use authorized project read models and safe summaries
  rather than merging raw project corpora into one broad prompt by default.
- When a cross-project request needs project-specific knowledge, Ask Opzava must either ask the user
  to pick a project or delegate separate project-scoped turns with authorized overlays.
- Project assistant answers may cite project cards, to-dos, docs/files, outputs, schedules, updates,
  and approvals only when the actor can access those records.
- Assistant-generated artifacts must attach to the owning project/work item or candidate output
  surface through Opzava refs, not only runtime artifacts.
- Project assistant empty state must appear when no eligible assistant is assigned, the project
  assistant tool is disabled, the employee is suspended, or provisioning is required.
- Project assistant stale context state must be visible when corpus revision, project projection, or
  runtime availability is behind current state.

### Ask Admin Opzava remediation surface

- Ask Admin Opzava must be centered on platform-ops/admin use cases: Incident triage, Incident
  summary, blocked approvals, agent status, integration health, Gateway health, projection failures,
  and remediation proposals.
- Ask Admin Opzava must read `ErrorGroup`/Incident data through Notifications/Admin-Observability
  projections. Neither `pm.Card`, DevTicket, nor the Dev Board projection is the Incident source of
  truth; permanent fixes are separately linked Bug or Technical Task DevTickets.
- Ask Admin Opzava may inspect OpenClaw logs, diagnostics, task snapshots, Workboard diagnostics,
  health, usage, and approval/runtime refs only through `OpenClawGatewayPort` and authorized
  projectors.
- Ask Admin Opzava may translate one authenticated conversation/turn/tool-call intent into the same
  server-owned Dev Board command used by UI, Slack, or MCP. The Dev Board Adapter must reauthorize
  the original human principal, source/session, target/version, and exact action; the assistant,
  model, broker body, and transcript never supply actor, tenant, approval, Runner, lease, or secret
  authority. Turn/tool-call identity provides idempotency and provenance only.
- Machine enrollment, raw secret entry, Runner/integration trust changes, and unbounded approvals
  stay in the secure Opzava UI. Ask Admin may explain or deep-link to them but may not obtain
  `operator.admin`, a Runner key, or a lease-grant value through the chat path.
- Ask Admin Opzava must show remediation proposals as inline action cards with incident, cause
  hypothesis, blast-radius class, dry-run availability, required approval level, and execution
  target.
- Low-risk actions may be limited to summarize, label, notify, request data, or draft remediation.
- Medium or higher blast-radius actions must require explicit human approval before execution.
- Destructive, secret-changing, re-provisioning, data-erasure, queue-drain, config mutation, and
  tenant-admin actions must require two-step confirmation.
- Cross-tenant remediation must not be one action. Each remediation action must target one tenant,
  one Gateway, one route, one job, one projector, one task, or one bounded operational target.
- Approved remediation must execute through a platform-ops job that obtains the short-lived ADR-003
  admin credential out of band from the chat hot path.
- Every remediation action must run dry-run-first where supported, carry an idempotency key, write
  immutable audit, and project results back to the Incident lifecycle and evidence.
- Ask Admin Opzava must surface failed, partial, skipped, approval denied, dry-run failed,
  admin-token unavailable, and policy-denied remediation outcomes.
- Tenant-visible incident summaries must respect ADR-013 visibility and redaction; platform-only
  detail must not leak into tenant chat surfaces.

### Notifications, Activity, and hand-offs

- Assistant conversation events that require the user's attention must create Activity or
  notification rows according to PRD-004/PRD-002 ownership.
- Mentions, assistant hand-offs, approval prompts, and thread replies belong in Activity.
- System/tool/project alerts, Incident alerts, assistant completions, and operational updates may
  create notification rows where background delivery is useful.
- Ask Opzava and project assistant conversations must deep-link from Activity, project Updates, My
  stuff, and project work where appropriate.
- Assistant completions must be attributable to the employee persona and source context in
  Activity/Updates/Notifications.
- Web Push delivery for assistant completions or approvals must use safe payloads only and fetch
  details through normal server authorization.
- Revoked access must remove conversation details, snippets, approval detail, and push eligibility
  on server fetch, reload, or reconnect.

### Access, security, and audit

- Every assistant turn must be authorized against active organization, tenant lifecycle, actor role,
  project grants, target refs, assistant availability, and action policy.
- Missing tenant, missing project, missing membership, suspended tenant, disabled assistant, revoked
  employee, or stale role version must fail closed.
- Assistant surfaces must never embed secrets, API keys, tokens, channel credentials, raw provider
  payloads, or Gateway-local config values.
- Acting-on-behalf-of metadata must distinguish human actor, assistant persona, broker credential,
  admin job actor, and external channel identity.
- Audit rows must be immutable for user requests, assistant delegation, approval decisions, policy
  denials, remediation proposals, remediation execution, and high-risk tool attempts.
- Assistant content rendering must sanitize user content, tool summaries, source labels, links, file
  names, and generated output.
- Assistant conversations must support retention and deletion policies without deleting required
  audit, approval, incident, or admin-token job records.

### Accessibility and responsive behavior

- Assistant chat logs must use appropriate log/feed semantics and polite live regions.
- Approval cards, trace cards, status pills, error states, and remediation cards must expose labels
  that do not rely on color alone.
- Composer, Send, trace toggle, approval actions, preview modal, remediation actions, project links,
  and retry controls must be keyboard accessible.
- Focus must return to the invoking control when trace cards, preview modals, or confirmation
  dialogs close.
- Compact mobile layouts must preserve source context, assistant identity, approval status, streamed
  state, and composer access.
- Text in assistant cards, buttons, badges, and status pills must not overlap or require hover-only
  actions.

## Data and API touchpoints

| Surface                                      | Owning bounded context                                              | Primary data/API touchpoints                                                                                                                              | Ports                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ask Opzava conversation list/detail          | AI Workforce with Internal Collaboration-style conversation storage | Conversation metadata, turns, actor refs, assistant persona refs, scope, final assistant messages, stream status, unread/attention state                  | `AuthorizationPort`, `RealtimeTransportPort`, `EventBusPort`                         |
| Ask Opzava turn admission                    | AI Workforce                                                        | Tenant lifecycle, actor permission, intent classification, project/work target resolution, autonomy tier, policy admission, idempotency                   | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`                           |
| Project assistant conversation               | AI Workforce with Project Management                                | Project-scoped assistant availability, `AgentEmployee` assignment, project tool enabled state, project work refs, scoped transcript                       | `AuthorizationPort`, `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort`  |
| Project context and corpus overlays          | Knowledge Management with Project Management authorization          | Project corpus refs, org corpus refs, corpus revision, source/document refs, authorized snippets and citations                                            | `KnowledgeSourcePort`, `KnowledgeIndexPort`, `AuthorizationPort`, `EventBusPort`     |
| Delegation and assignment                    | AI Workforce                                                        | Routing to department employees, `Assignment`, optional `AgentDispatch`, employee status, selected persona, runtime refs                                  | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`                           |
| Project work dispatch                        | Project Management with AI Workforce                                | Card/to-do/workflow target refs, `AgentDispatch`, status projections, evidence/output refs, review state                                                  | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`                           |
| Live token streaming                         | Gateway Broker through AI Workforce                                 | Runtime session start/continue, token deltas, turn completion, cancellation, retry, stream deduplication                                                  | `OpenClawGatewayPort`, `RealtimeTransportPort`                                       |
| Inline approvals                             | Department Workflows with contributing contexts                     | Approval row, draft/action summary, decision command, request-changes command, approval refs, audit projection                                            | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort`  |
| Activity hand-offs and assistant completions | Internal Collaboration and Notifications/Admin-Observability        | Activity rows, mention/hand-off refs, unread state, notification rows, push eligibility, deep links                                                       | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Project Updates and Outputs                  | Project Management with AI Workforce inputs                         | Assistant summaries, generated output refs, approval outcomes, status events, evidence links, waiting-on-you bands                                        | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`                         |
| Ask Admin Opzava conversation                | Notifications/Admin-Observability with AI Workforce                 | Admin assistant transcript, Incident refs, admin trace summaries, remediation cards, approval prompts                                                     | `AuthorizationPort`, `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort`  |
| Incident investigation                       | Notifications/Admin-Observability                                   | `ErrorGroup`, `ErrorEvent`, Incident lifecycle/projection, redacted diagnostics, broker/Gateway/task/usage snapshots, linked permanent-fix DevTicket refs | `ErrorCapturePort`, `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`       |
| Remediation action                           | Notifications/Admin-Observability with Platform-Ops job runner      | `RemediationAction`, blast-radius class, dry-run result, approval refs, admin-token job ref, execution result, audit                                      | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`                           |
| Admin-token execution                        | Platform-Ops/Tenant Provisioning                                    | Short-lived `operator.admin` job credential, one-scope runtime/admin operation, provision/repair receipt                                                  | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort`                           |
| Search/Find assistant entries                | Project Management shell search coordinator with AI Workforce       | Assistant result DTOs, project assistant entry points, recent conversations, authorized action results                                                    | `AuthorizationPort`, `KnowledgeIndexPort`, `EventBusPort`                            |

## Implementation decisions

- Model assistant conversation product state in Opzava-owned application services and read models;
  do not expose OpenClaw session rows as the UI transcript.
- Keep Ask Opzava, project assistant, and Ask Admin Opzava as distinct surfaces with shared
  conversation primitives and separate admission policies.
- Treat live tokens as ephemeral stream events until the assistant turn is finalized into one
  durable message/turn.
- Route browser actions through Opzava application commands; browser clients never call OpenClaw,
  never provide trusted Gateway routes, and never hold operator credentials.
- Use ADR-008 `AgentEmployee`, `Assignment`, and `AgentDispatch` for delegated work instead of
  adding assistant-specific parallel workflow concepts.
- Use existing approval rows and workflow/project approval commands for inline approval actions;
  chat cards are projections and command launchers.
- Resolve project/org corpus overlays server-side through Knowledge Management for each delegated
  turn.
- Use Notifications/Admin-Observability as the owner of Ask Admin Opzava Incident
  lifecycle/projections and remediation action cards.
- Use platform-ops jobs for admin-token remediation; Ask Admin Opzava may propose and request
  approval but does not execute admin operations inside the chat request path.
- Route Dev Board intents through its canonical command Adapter with the authenticated on-behalf-of
  chain; keep conversation history as rationale/provenance and the accepted Dev Board
  activity/approval row as product truth. The Runner protocol remains a separate machine-fact seam.
- Emit outbox events for finalized messages, assistant completions, approvals, Activity rows,
  project Updates, notification rows, remediation changes, and audit projections.
- Define assistant DTOs around Opzava names: conversation, turn, stream event, trace summary,
  approval card, delegation status, remediation card, and source ref.
- Keep trace/tool-card payloads as safe summaries with source refs and role-specific disclosure
  levels, not raw tool transcripts.

## OpenClaw-parity notes

| Feature area                                    | Classification                                       | Native harnessed vs Opzava-owned decision                                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask Opzava conversation identity and transcript | Opzava-owned                                         | Opzava owns conversation rows, turns, scopes, durable final messages, unread/attention state, and links to project work. OpenClaw session refs are opaque values.                                                                                   |
| Project assistant conversation                  | Opzava-owned with native runtime harness             | Opzava owns project scope, assistant entry point, transcript, project links, approval cards, and output projections. OpenClaw owns the delegate-agent session and runtime execution.                                                                |
| Ask Admin Opzava conversation                   | Opzava-owned with native runtime harness             | Opzava owns admin transcript, incident refs, remediation proposals, approvals, and audit. OpenClaw diagnostics/remediation are accessed only through the broker.                                                                                    |
| Live token streaming                            | Native harnessed                                     | Token chunks are streamed from OpenClaw through ADR-009. They become durable Opzava state only on finalized assistant turns, summaries, reports, approvals, or projections.                                                                         |
| Delegate employee execution                     | Native harnessed                                     | OpenClaw delegate agents, workspaces, `agentDir`, sessions, tools, and runs are native. Opzava owns `AgentEmployee`, routing policy, `Assignment`, `AgentDispatch`, audit, and product projections.                                                 |
| Hot-path assistant authority                    | Native harnessed with Opzava admission               | Ask Opzava uses the ADR-003 hot-path broker token for normal runtime work after Opzava authorization and policy checks.                                                                                                                             |
| Admin remediation authority                     | Native harnessed through jobs                        | `operator.admin` is used only by short-lived audited platform-ops jobs. Ask Admin Opzava never turns a chat turn into direct broad admin authority.                                                                                                 |
| Inline approvals                                | Opzava-owned with runtime refs                       | Opzava approval rows and audit are the source of truth. OpenClaw approval refs may be reconciled where runtime exec/plugin gates are involved.                                                                                                      |
| Project knowledge context                       | Opzava-owned retrieval policy with native corpus use | Knowledge Management owns source/corpus refs and authorization. OpenClaw receives authorized corpus overlays for the session but does not decide project access.                                                                                    |
| Trace/tool cards                                | Opzava-owned presentation                            | OpenClaw tool/runtime detail may inform trace summaries, but Opzava owns what is redacted, disclosed, stored, and rendered.                                                                                                                         |
| Activity/Notifications/Project Updates          | Opzava-owned projections                             | Assistant completions, hand-offs, approvals, and remediation outcomes project into Opzava read models. Runtime events are inputs, not the source of product truth.                                                                                  |
| Incident remediation                            | Opzava-owned Incident domain with native diagnostics | ADR-013 `ErrorGroup`/`RemediationAction` and Incident lifecycle are Opzava-owned. OpenClaw logs, health, Workboard, task-ledger, and remediation operations are harnessed through `OpenClawGatewayPort`; permanent fixes link to normal DevTickets. |

## Acceptance criteria

- Ask Opzava renders in the Essential shell with cross-project positioning, conversation log, digest
  card, project links, composer, and async states.
- Ask Opzava digest rows show only authorized projects and authorized snippets.
- Ask Opzava can answer a cross-project status question with live coordination status and final
  durable assistant response.
- Ask Opzava can show an expandable checked-project trace with safe summarized sources.
- Ask Opzava can surface an inline approval card with Approve & send, Request changes, and View
  draft actions.
- Approving from Ask Opzava records one approval decision, updates the card state, emits the
  expected events, and shows inline confirmation.
- Request changes from Ask Opzava records the decision and routes revision work to the owning
  assistant/employee.
- Project assistant renders inside the project workspace with project breadcrumb, active Ask your
  assistant tab, assistant persona, project-only composer, backlink to Ask Opzava, and async states.
- Project assistant answers use only the selected project's authorized context and cite/link only
  authorized project records.
- Project assistant handles no-assistant-assigned and assistant-unavailable states with the mockup's
  empty/retry affordances.
- Project assistant inline approval preview, Approve & send, Request changes, and confirmation
  behavior work without duplicating approval decisions.
- Live token streaming shows progressive assistant output/status and finalizes into one durable
  assistant turn.
- Stream retry, reconnect, webhook completion, and duplicate events do not duplicate assistant
  messages, approvals, Activity rows, project Updates, or remediation actions.
- Delegated work shows the selected AI employee persona and creates/reuses the appropriate
  `Assignment` and `AgentDispatch` records.
- Policy denied, approval required, provisioning required, gateway unavailable, circuit open, and
  missing corpus states render as normal assistant states.
- Ask Admin Opzava renders inside the pinned Admin container owned by PRD-020 with the platform-ops
  digest, trace/tool card, inline action card, suggestions, and composer behavior owned by this PRD.
- Ask Admin Opzava can summarize Incident context from Notifications/Admin-Observability
  projections.
- Ask Admin Opzava remediation proposals show incident, hypothesis, target scope, blast-radius
  class, dry-run status, required approval, and primary/secondary actions.
- Medium-risk remediation requires explicit approval before execution.
- Destructive or tenant-admin remediation requires two-step confirmation.
- Approved remediation executes through an audited platform-ops admin-token job, not the hot-path
  chat request.
- Ask Admin Dev Board actions preserve the original human/session/turn/tool-call provenance, are
  reauthorized against the current target/version, and cannot become Runner, lease, or secret facts.
- Remediation outcomes update the Incident lifecycle/evidence and assistant conversation with
  success, partial, failed, skipped, or policy-denied state.
- Tenant-visible incident and assistant summaries respect ADR-013 visibility/redaction rules.
- Role revocation removes access to assistant conversations, project snippets, approval details,
  streams, and admin remediation detail on fetch/reconnect.
- Assistant trace cards, approvals, streaming updates, preview modals, remediation cards, and
  composer controls are keyboard and screen-reader accessible.
- Mobile Ask Opzava and project assistant layouts preserve context, streamed answer, inline
  approval/remediation actions, and composer access.
- No assistant surface renders raw secrets, raw Gateway DTOs, raw provider payloads, channel
  credentials, hidden reasoning, or unredacted admin payloads.

## Testing decisions

- Test at the highest product seams: assistant application commands/queries, authorization-gated
  routes/server actions, realtime stream contract, approval/remediation command behavior,
  projection/read-model behavior, and UI composition for the named workflows.
- Tests should assert external behavior: visible conversations, streamed status, final assistant
  messages, inline approval state, delegation attribution, Activity/notification/project-update
  projections, remediation cards, forbidden states, and audit/event emissions.
- Do not test OpenClaw protocol internals in assistant UI/domain tests. Use broker port fakes or
  projected runtime fixtures and leave protocol conformance to the broker integration suites.
- Ask Opzava tests must cover cross-project digest authorization, project ambiguity, all-project
  summary, project links, checked-project trace disclosure, inline approvals, and revoked access.
- Project assistant tests must cover project scoping, corpus revision selection, no-assistant empty
  state, unavailable employee, project output refs, preview modal, approval decisions, and
  Guest-Client filtering.
- Streaming tests must cover queued/working/delegating/finalizing/completed/failed states, reconnect
  backfill, duplicate frames, webhook completion race, retry, cancellation, and one-final-message
  idempotency.
- Delegation tests must cover department routing, autonomy-tier defaults, `Assignment` creation,
  `AgentDispatch` reuse, specialist persona attribution, policy denial, missing channel binding,
  rate/spend/concurrency denial, and gateway unavailable states.
- Approval tests must cover approve, request changes, stale/superseded approval, expired approval,
  unauthorized approval, duplicate clicks, runtime approval-ref reconciliation, audit rows, and
  downstream Activity/Updates state.
- Knowledge-scope tests must cover server-side project corpus resolution, browser-supplied corpus
  rejection, cross-project summary redaction, revoked project access, stale corpus labels, and
  authorized citation/source links.
- Ask Admin Opzava tests must cover incident summary, redacted diagnostics, admin trace disclosure,
  remediation proposal rendering, dry-run result, approval required, two-step confirmation, job
  submission, and result projection.
- Ask Admin Dev Board tests must cover original-principal/on-behalf-of attribution, turn/tool-call
  idempotency, target/version drift, role/session revocation, caller-supplied tenant/actor/Runner
  fields ignored as authority, no `operator.admin`, no approval inferred from transcript text, and
  no raw secret or Runner-key material in request, transcript, trace, or result.
- Remediation tests must cover one-scope targeting, idempotency, admin-token unavailable, dry-run
  unsupported, policy denied, partial failure, audit fields, Incident update, and creation/linking
  of a permanent-fix DevTicket without changing Incident lifecycle ownership.
- Security tests must cover missing tenant, role revocation, suspended tenant, disabled assistant,
  stale membership version, no raw secrets in trace/transcript, no raw Gateway DTO leakage, and
  acting-on-behalf-of audit metadata.
- Accessibility tests must cover role=log/feed semantics, live stream announcements, focus
  management, keyboard operation for trace/approval/remediation/preview controls, and non-color
  status labels.
- Responsive tests must cover Essential Ask Opzava, project assistant, and Ask Admin Opzava at
  mobile and desktop widths with inline actions visible and text contained.

## Dependencies

- ADR-003: `gateway-broker` ACL, two-token model, hot-path runtime authority, admin/provisioning
  credential, tenant routing, and opaque OpenClaw refs.
- ADR-008: AI Workforce, delegate agents, personas, departments, autonomy tiers, `AgentEmployee`,
  `Assignment`, `AgentDispatch`, and coordinator/delegation behavior.
- ADR-009: Realtime WS hub, assistants-in-chat bridge, live token streaming, durable final assistant
  messages, Activity/notification fan-out, reconnect, and idempotency.
- ADR-013: Error-to-Incident pipeline, Ask Admin Opzava remediation loop, `RemediationAction`,
  separate Incident projection, linked permanent-fix DevTickets, dry-run/approval gates, and
  admin-token audit.
- ADR-004: Data boundary, hybrid CQRS, outbox, projections, snapshot reconciliation, and opaque
  runtime refs.
- ADR-005: Tool-policy-first security, approval gates, sandbox posture, and policy denial behavior.
- ADR-006: Better Auth, revocable sessions, role/session invalidation, PWA auth constraints, and
  push fetch-on-open behavior.
- ADR-007: Resource-scoped RBAC, roles-as-data, RLS, and fail-closed project/tenant access.
- ADR-010: Knowledge Management source of truth, project/org corpus overlays, source refs, and
  authorized retrieval/index behavior.
- ADR-012: Department workflow engine, approval prompts, generated-content lifecycle, department
  workflow hand-offs, and reports.
- PRD-002: Shared authenticated shell infrastructure, Essential top bar, command palette, Find,
  notification plumbing, Home/My stuff entry points, route admission, and shell async states.
- PRD-020: Admin Control Center — shell, navigation, and overview composition; pinned Ask Admin
  Opzava placement and its Admin container, without changing this PRD's assistant behavior.
- Project Management surface (`pm.Card`, deferred): Projects, project assistant entry, project
  cards/to-dos/docs/schedules/outputs/updates, `pm.Card`, project approvals, and project activity
  projections.
- PRD-004: Internal chat, Activity inbox, assistant hand-offs, mentions, notifications, Web Push,
  project Team rooms, and assistant participant attribution in collaboration surfaces.

---

> **Validate against official docs before implementing.** Training knowledge is a starting point,
> not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor
> docs. See `CLAUDE.md` (Official-docs rule).
