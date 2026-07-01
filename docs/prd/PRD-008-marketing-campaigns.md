# PRD-008: Marketing campaign suite and content production loop

## Problem

Opzava needs a coherent Marketing workspace where humans and AI employees can plan campaigns, keep a content pipeline moving, review AI-drafted content, schedule approved work, publish through connected channels, and measure results without turning OpenClaw runtime objects into the product source of truth.

Without this PRD, the marketing slice can drift into unsafe or confusing product shapes:

- Campaigns could become loose project cards instead of Marketing-owned records with objectives, channels, budgets, owners, windows, reporting periods, and linked content.
- Content could move from AI draft to external publication without the ADR-012 invariant that a versioned `ContentItem` has an approved Opzava `Approval` for the matching content hash.
- The content calendar could become a separate scheduler instead of a view over Opzava calendar slots provisioned into OpenClaw cron where runtime work is needed.
- Atlas or another Marketing `AgentEmployee` could appear to publish autonomously when the actual policy is T2 AI drafting/send-on-behalf only inside approved channel bindings and human approval gates.
- Campaign board stages, content pipeline lanes, calendar event states, approvals, and report tiles could use inconsistent lifecycle vocabulary.
- Standing orders, cron, and TaskFlow could be authored directly in Gateway config, bypassing Opzava workflow policy, budgets, concurrency, idempotency, approvals, and provisioning receipts.
- Report and performance tiles could become ephemeral chat summaries instead of versioned artifacts with period, source cursors, freshness, provenance, and runtime refs.

The solution is an Opzava-owned Marketing campaign suite and content production loop. Opzava owns `Campaign`, `ContentItem`, `ContentCalendar`, `Approval`, `Workflow`, `WorkflowRun`, `RunStep`, reporting artifacts, product lifecycle, authorization, audit, and user-visible read models. OpenClaw is harnessed through the `gateway-broker` for Marketing employee sessions, standing-order execution, cron firings, TaskFlow runs, channel sends, runtime approvals, artifacts, usage, and status projections.

This PRD applies ADR-008, ADR-010, and ADR-012. It defines product behavior, UX mapping, data/API touchpoints, OpenClaw-parity boundaries, acceptance criteria, and testing decisions. It does not restate the architecture.

## Goals and Non-goals

### Goals

- Ship the Essential Marketing project dashboard shown in `essential-marketing.html`.
- Ship Campaigns as the campaign lifecycle board/list shown in `essential-mkt-campaigns.html`.
- Ship New campaign creation with optional Atlas brief drafting as shown in `essential-campaign-new.html`.
- Ship the Content Pipeline for article/content production shown in `essential-content-pipeline.html`.
- Ship the Content Calendar shown in `essential-mkt-calendar.html`.
- Ship Schedule content / Add event behavior shown in `essential-event-new.html`.
- Model campaigns as Marketing/Department Workflow product records, not raw OpenClaw runtime artifacts.
- Model content as versioned `ContentItem` records with lifecycle `Idea -> Draft -> InReview -> Approved -> Scheduled -> Published -> Archived`.
- Allow a Marketing `AgentEmployee` such as Atlas to draft at T2 only inside approved Marketing policy, channel bindings, spend limits, and workflow scope.
- Require human review and Opzava business approval before scheduling or publishing externally.
- Make calendar events and publish slots first-class `ContentCalendar` records with schedule conflict, channel timing, and linked content state.
- Map workflow execution to OpenClaw standing orders, cron, and TaskFlow through ADR-012 `Workflow` mechanisms and provisioning receipts.
- Surface workflow state, approvals, and runtime status in marketing screens without exposing raw Gateway config, secrets, provider payloads, or hidden reasoning.
- Support channel-specific report tiles and campaign performance summaries from versioned `ReportArtifact` records.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity notes for native harnessed capabilities versus Opzava-owned product authority.
- Define acceptance and testing decisions at the highest user-visible seams.

### Non-goals

- Build OpenClaw standing orders, cron, TaskFlow, channels, task-ledger, runtime approvals, sessions, artifacts, or Gateway internals.
- Redesign ADR-008 AI Workforce, ADR-010 Knowledge Management, or ADR-012 Department Workflow architecture.
- Build Project Management boards, generic cards, goals, docs/files, team rooms, project schedule, or project assistant chat beyond Marketing entry points and refs.
- Build the full Marketing assets library, approval queue, performance report detail pages, or channel integration setup unless needed as links and touchpoints for this PRD.
- Build CRM segment authoring or consent policy internals, except where campaigns reference segment refs and send-time consent checks.
- Build billing, pricing, invoice, or plan packaging, except to consume tenant/employee/workflow budget and plan ceilings.
- Allow AI employees, browser clients, or normal route handlers to publish, schedule, install skills, write OpenClaw config, or mutate channel credentials without the owning Opzava command and approval policy.
- Expose raw secrets, API keys, provider tokens, channel credentials, raw Gateway DTOs, raw OpenClaw config, raw tool output, hidden model reasoning, or unredacted customer/PII data.

## User Stories

1. As a project member, I want a Marketing dashboard for a campaign project, so that campaign work has one everyday home.
2. As a project member, I want the dashboard header to show project name, description, people, AI employees, active count, and update time, so that I understand the workspace quickly.
3. As a project member, I want a New campaign action from the dashboard, so that campaign creation starts from the marketing context.
4. As a project member, I want Ask Atlas from the dashboard, so that project-scoped marketing assistance is one click away.
5. As a project member, I want a waiting-on-you band for overdue approvals, so that blocked marketing work is visible before I scan tiles.
6. As a reviewer, I want the waiting-on-you band to deep-link to the exact approval target, so that I can clear the bottleneck quickly.
7. As a project member, I want marketing tiles for Campaigns, Content Calendar, Approvals, Assets, Performance, Ask your assistant, and Team, so that core workflows are scannable.
8. As a project member, I want Campaigns to show active campaign count and AI drafting state, so that I can see whether Atlas is working.
9. As a project member, I want Content Calendar to show upcoming scheduled work, so that I know what is going out next.
10. As a project member, I want Approvals to show awaiting review, changes requested, and overdue count, so that human gates are visible.
11. As a project member, I want Assets to summarize approved and in-review files, so that creative readiness is obvious.
12. As a project member, I want Performance to show live campaign health, so that measurement stays connected to planning.
13. As a project member, I want Reports & analysis tiles for ads, email, and blog, so that channel-specific results are reachable.
14. As a project member, I want Latest activity to include human and AI actions distinctly, so that authorship and accountability are clear.
15. As a Marketing lead, I want Campaigns as a board with Plan, Create, Approve, Publish, and Measure stages, so that the campaign lifecycle matches how the team works.
16. As a Marketing lead, I want Campaigns to also have a list view, so that larger campaign portfolios remain scannable.
17. As a Marketing lead, I want each campaign card to show campaign name, stage, channel labels, owner, due date, comments, files, live/ended status, and AI working badges, so that I can triage without opening each item.
18. As a Marketing lead, I want campaign cards to move by menu as well as pointer interactions, so that stage changes are accessible.
19. As a Marketing lead, I want moving a campaign stage to run through Opzava commands, so that policy, audit, and read models stay consistent.
20. As a Marketing lead, I want campaign stage counts to update after moves, so that the board remains accurate.
21. As a Marketing lead, I want Add campaign in each stage, so that a new campaign can enter at the right lifecycle point.
22. As a Marketing lead, I want Draft a brief from Campaigns, so that Atlas can propose campaign structure without making final decisions.
23. As a Marketing lead, I want New campaign to collect campaign name, channels, description, linked goal hint, owner, launch date, and stage, so that basic campaign data is complete.
24. As a Marketing lead, I want Atlas to draft a campaign brief only after I ask, so that AI output is not presented as already accepted.
25. As a Marketing lead, I want Atlas brief drafting to show a working state, so that I can distinguish generation from stored campaign data.
26. As a Marketing lead, I want to accept or tweak Atlas's proposed brief, so that AI output becomes campaign input only by my choice.
27. As a Marketing lead, I want campaign channels to include email, social, paid, and blog, so that multi-channel planning is explicit.
28. As a Marketing lead, I want campaign channel selection to respect connected channel bindings, so that unavailable channels cannot be scheduled silently.
29. As a Marketing lead, I want campaign owners to include humans and eligible Marketing AI employees, so that responsibility is explicit.
30. As a Marketing lead, I want assigning Atlas as owner to show AI identity and tier, so that AI ownership is not confused with human ownership.
31. As a Marketing lead, I want campaign creation to be idempotent, so that retries or double-clicks do not create duplicate campaigns.
32. As a Marketing lead, I want campaigns to link to objectives, budget, segment refs, channels, window, and reporting period, so that campaign plans are measurable.
33. As a Marketing lead, I want campaigns to reference goals instead of duplicating measurable targets, so that project goal truth stays in one place.
34. As a Marketing lead, I want campaigns to show blocked states such as missing binding, approval required, rate limited, stale segment, and Gateway unavailable, so that failure modes are actionable.
35. As a content marketer, I want a Content Pipeline for a niche, so that article production has a repeatable loop.
36. As a content marketer, I want the pipeline to show Atlas can research, draft, check, and bring work to me for review, so that expectations are clear.
37. As a content marketer, I want a status line for ready-for-review count and publishing queue runway, so that I know where attention is needed.
38. As a content marketer, I want a WordPress connection status note, so that channel readiness is visible.
39. As a content marketer, I want Ideas to show Atlas-suggested topics with topic group and why-worth-writing rationale, so that suggestions are useful without fabricated metrics.
40. As a content marketer, I want to add an idea to the pipeline, so that only accepted topics become drafted content.
41. As a content marketer, I want Research topics as an AI offer, so that Atlas can top up the idea pool when I ask.
42. As a content marketer, I want Atlas standing orders to top up the publishing queue when runway drops below policy, so that the pipeline stays healthy.
43. As a content marketer, I want topic research to respect niche, knowledge scope, source policy, spend limit, and channel strategy, so that suggestions remain governed.
44. As a content marketer, I want Drafting to show research, write, and check sub-steps, so that AI progress is understandable.
45. As a content marketer, I want Drafting cards to show source counts and AI employee attribution, so that provenance is visible.
46. As a content marketer, I want Atlas auto-started work labeled and cancellable, so that bounded automation is transparent and reversible.
47. As a content marketer, I want cancel draft to stop the durable workflow run where possible and return the topic to an idea/proposal state, so that runtime work and product state stay consistent.
48. As a content marketer, I want Needs you to be the human review gate, so that drafts cannot continue to publish without review.
49. As a reviewer, I want Needs you cards to show draft-ready state, word count, source coverage, comments, and blockers, so that I know what to inspect.
50. As a reviewer, I want a draft with an unsourced claim to stay blocked from publish, so that content quality issues are not hidden.
51. As a reviewer, I want to approve, reject, or request changes on a content item version, so that the decision applies to exact content.
52. As a reviewer, I want approval to record content hash and version, so that edits after approval require re-review when material.
53. As a reviewer, I want Request changes to route revision instructions back to Atlas under the same content item, so that review loops are traceable.
54. As a reviewer, I want an approval card in chat and the pipeline to represent the same Opzava `Approval`, so that decisions do not fork.
55. As a reviewer, I want stale approval actions to disable after edits, supersession, expiry, or another decision, so that obsolete drafts cannot be published.
56. As a content marketer, I want Ready to publish to contain approved and queued/scheduled items, so that the publish runway is clear.
57. As a content marketer, I want Ready to publish to distinguish approved-publishes-next from scheduled-date items, so that queue order and timing are explicit.
58. As a content marketer, I want Published to show live content and publish dates, so that evergreen assets remain findable.
59. As a content marketer, I want published content to retain channel refs and public URLs where available, so that reporting can link outcomes back to content.
60. As a content marketer, I want the UI lane labels to map cleanly to the domain lifecycle, so that product language stays friendly without corrupting state.
61. As a system operator, I want Ideas to map to `Idea`, Drafting to map to `Draft`, Needs you to map to `InReview`, Ready to publish to map to `Approved` or `Scheduled`, and Published to map to `Published`, so that automation and audit use canonical states.
62. As a content marketer, I want New article/manual add to create a `ContentItem` without AI execution unless I explicitly ask for AI drafting, so that human-authored content is supported.
63. As a content marketer, I want content items to support channel targets, body/assets, source refs, review comments, schedule refs, publish refs, and provenance, so that content is complete enough to execute.
64. As a Marketing lead, I want the Content Calendar to show what goes out and when across every channel, so that timing is planned in one place.
65. As a Marketing lead, I want calendar filters for channel and campaign, so that I can focus on the relevant slice.
66. As a Marketing lead, I want week and month views, so that I can plan both near-term and campaign-wide timing.
67. As a Marketing lead, I want month cells to show content title, channel, campaign, and status, so that calendar entries are useful at a glance.
68. As a Marketing lead, I want statuses Draft, Scheduled, and Published to use glyph plus label, so that meaning is not color-only.
69. As a Marketing lead, I want an add-event control on each calendar day, so that keyboard and pointer users can schedule from the date context.
70. As a Marketing lead, I want the mobile calendar to become a full agenda list, so that every event remains reachable on narrow screens.
71. As a Marketing lead, I want Coming up to show the next seven days, so that near-term publishing is visible without scanning the whole month.
72. As a Marketing lead, I want a day detail view, so that all content landing on one date can be inspected together.
73. As a Marketing lead, I want Add event to collect content name, channel, campaign, date, time, and status, so that scheduled content has the required fields.
74. As a Marketing lead, I want Add event validation for content name, date, and time, so that broken slots are not created.
75. As a Marketing lead, I want Schedule content to show Atlas can draft and schedule copy, with review before it goes out, so that AI help stays governed.
76. As a Marketing lead, I want setting an event status to Scheduled to require content approval or schedule it as a draft-only placeholder, so that unapproved content cannot become publishable by calendar edit.
77. As a Marketing lead, I want setting an event status to Published manually to require permission and an existing publish ref or audited manual publish reason, so that history is honest.
78. As a Marketing lead, I want calendar conflicts to be detected by channel, campaign, time window, and policy, so that collisions are visible before publish.
79. As a Marketing lead, I want scheduling changes to update `ContentCalendar`, linked `ContentItem`, campaign counts, Activity, and cron provisioning where applicable, so that screens remain consistent.
80. As a Marketing lead, I want schedule retries to preserve idempotency keys, so that external publishes are not duplicated.
81. As a reviewer, I want no schedule/publish action to be offered for unapproved or materially changed content, so that the UI reinforces the approval invariant.
82. As a reviewer, I want gateway publish commands to reject unapproved content even if the UI is stale, so that policy enforcement is server-side.
83. As a reviewer, I want the exact approval decision to be auditable with requester, requesterAgentId, approver, policy, payload, content hash, target refs, expiry, and decision metadata, so that external sends are explainable.
84. As a Marketing lead, I want campaign publication to respect channel binding, consent, segment membership, and send-time suppression, so that campaigns do not violate contact policy.
85. As a Marketing lead, I want AI-drafted email, social, paid, and blog content to include source/provenance refs where appropriate, so that review has evidence.
86. As a Marketing lead, I want assets used by content to stay linked by Opzava refs, so that approved creative is traceable without exposing object-store paths.
87. As a Marketing lead, I want campaign report tiles to use versioned report artifacts, so that results are reproducible and not just chat summaries.
88. As a Marketing lead, I want reports to show freshness and stale-input state, so that I do not trust outdated performance data.
89. As a Marketing lead, I want channel reports to link back to campaigns and content items, so that measurement closes the production loop.
90. As a Marketing lead, I want scheduled report generation to run through workflow mechanisms, so that periodic analysis is governed like other department work.
91. As an operator, I want Marketing workflows to publish to OpenClaw standing-order blocks, cron specs, and TaskFlow specs only through provisioning jobs, so that direct Gateway edits are drift.
92. As an operator, I want every Marketing workflow mechanism to carry cost budget, max concurrent runs, approval policy, idempotency key shape, timeout, retry cap, failure destination, and freshness SLA, so that runaway fan-out is prevented.
93. As an operator, I want duplicate cron trigger keys to collapse, so that retries do not create duplicate drafts, approvals, or publishes.
94. As an operator, I want approval backlog to escalate at more than 50 percent of SLA consumption, so that review queues do not silently block publishing.
95. As an operator, I want WorkflowRun and RunStep projections for content research, draft, review, approval, schedule, publish, and report steps, so that traces are inspectable.
96. As an operator, I want OpenClaw runtime approvals for exec/plugin gates mirrored into the same inbox without becoming business approval truth, so that approval authority stays clear.
97. As an operator, I want drift, Gateway unavailable, circuit open, rate limited, stale corpus, stale segment, missing channel binding, and policy blocked states to render as normal states, so that async realities are operable.
98. As a security reviewer, I want no raw credentials or channel tokens stored in campaign, calendar, or content rows, so that integrations use SecretReference-style mechanisms.
99. As a security reviewer, I want external sends attributed to the Marketing employee and acting-on-behalf-of human/workflow, so that outbound audit is complete.
100. As a security reviewer, I want role revocation to remove access to campaigns, content, approvals, calendar entries, reports, and live runtime status on reload/reconnect, so that stale clients fail closed.
101. As a screen-reader user, I want marketing boards, content lanes, calendar grid/agenda, dialogs, status badges, approval cards, and report tiles to expose semantic labels, so that they are usable without visual scanning.
102. As a keyboard user, I want stage menus, view toggles, filters, day controls, add-event controls, dialogs, approval actions, and cancel draft actions to work without a mouse, so that the workflows are efficient.
103. As a mobile user, I want marketing boards to stack, calendar to become an agenda, and dialogs to remain usable, so that I can review and schedule from a phone.
104. As a product operator, I want every Marketing screen to render loading, empty, no-match, forbidden, stale projection, offline/reconnecting, Gateway unavailable, validation error, and retry states, so that failures are understandable.
105. As a developer, I want the feature tested through application ports, route/server-action behavior, projection read models, and UI composition, so that behavior is protected without coupling to OpenClaw internals.

## UX walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `essential-marketing.html` | Essential Marketing project dashboard for `Q3 Launch Campaign` with top bar, project switcher, humans and Atlas in the header, New campaign, Ask Atlas, waiting-on-you approval band, marketing tiles for Campaigns, Content Calendar, Approvals, Assets, Performance, Ask your assistant, Team, Add a card, Reports & analysis tiles for Ads/Email/Blog, and Latest activity with distinct human/AI attribution. The dashboard composes Marketing, Project Management, approvals, reports, assets, collaboration, and assistant projections. |
| `essential-mkt-campaigns.html` | Campaigns board/list with lifecycle columns Plan, Create, Approve, Publish, and Measure; campaign cards with channel labels, owner, due date, comments/files, Atlas drafting, review, live, and ended states; keyboard-accessible Move to stage menu; stage counts; add-campaign affordances per stage; Draft a brief; New campaign; quick nav to calendar, approvals, assets, performance, reports, Ask Atlas, and Team. Campaign stages are product lifecycle labels on Opzava `Campaign`, not OpenClaw Workboard columns. |
| `essential-campaign-new.html` | New campaign dialog over a dimmed campaigns board with optional Atlas draft offer, AI working state, AI proposal revealed only after user action, Use this draft/Tweak actions, campaign name, channel multi-select, description, linked goal hint, owner picker including humans and Atlas, launch date, initial stage, Cancel, and Create campaign. Accepting AI output fills fields but does not auto-create or auto-approve the campaign. |
| `essential-content-pipeline.html` | Content Pipeline board for a niche with Research topics, New article, ready-for-review count, publishing queue runway, WordPress connection status, Ideas, Drafting, Needs you, Ready to publish, and Published lanes. UI lanes map to canonical `ContentItem` lifecycle: Ideas = `Idea`, Drafting = `Draft`, Needs you = `InReview`, Ready to publish = `Approved` or `Scheduled`, Published = `Published`. Atlas can research and draft at T2 under workflow policy, but Needs you is the human approval gate and Atlas never publishes on its own. |
| `essential-mkt-calendar.html` | Content Calendar with breadcrumb, Add event, channel/campaign filters, week/month toggle, month navigation, grid calendar, accessible day buttons, per-day add-event controls, content chips with title/channel/campaign/status, mobile agenda replacement, status legend, empty state, day detail, and Coming up rail. Calendar entries are `ContentCalendar` slots linked to campaigns/content and may provision OpenClaw cron only after approval and schedule policy pass. |
| `essential-event-new.html` | Schedule content dialog over a dimmed calendar with content name validation, channel, campaign, date, time, status radiogroup for Draft/Scheduled/Published, Atlas offer line, Cancel, and Schedule content. The dialog creates or updates a calendar slot and linked `ContentItem`; Scheduled/Published choices must re-check approval, content hash, channel binding, schedule conflicts, and authorization before any runtime publish is provisioned or executed. |

Net-new screens to design:

- Marketing content item detail/review screen for reading the draft, sources, assets, comments, review checks, approval decision, request changes, schedule, publish, and version history.
- Marketing approval queue/detail screen if `essential-mkt-approvals.html` is not part of the implementation slice, because dashboard and pipeline both deep-link to approvals.
- Campaign detail screen for brief, objective, budget, segments, linked content, assets, approvals, calendar slots, workflow runs, and reports if the generic `essential-card.html` is not reused.
- Calendar event detail/edit drawer for schedule conflicts, linked content version, approval state, publish refs, retries, and audit.
- Workflow/standing-order settings surface for Marketing low-watermark content top-up, recurring reports, and scheduled publish policies if not covered by PRD-006 Automation.

## Functional requirements

### Campaigns

- Marketing/Department Workflows must own `Campaign` as the product aggregate for objective, budget, segment refs, channels, owner, window, status, reporting policy, linked content refs, linked calendar refs, and lifecycle/audit metadata.
- Campaigns must be tenant-scoped and project-linked where launched from a marketing project.
- Campaign statuses must support Plan, Create, Approve, Publish, Measure, Paused, Archived, BlockedByPolicy, GatewayUnavailable, RateLimited, and Failed where applicable.
- Board/list views must be read models over `Campaign`, linked content, approvals, assets, calendar slots, reports, and runtime projections.
- Campaign creation must validate actor authorization, project access, owner eligibility, channel selection, launch date, stage, and idempotency key.
- Campaign channel choices must be checked against External Channels/AI Workforce channel-binding summaries before campaign work can schedule or publish.
- Campaign owners may be humans or eligible Marketing `AgentEmployee` records, but AI ownership must remain attributed to the employee persona and policy tier.
- Atlas brief drafting must create an AI Workforce assignment or workflow run only after explicit user action.
- AI brief proposals must remain suggestions until accepted into campaign fields or stored as an artifact/candidate.
- Moving a campaign stage must run through Marketing commands and emit events for activity, notifications, campaign read models, and workflow projections.
- Moving to Publish must not imply external publish; actual content publication is governed by linked `ContentItem` approval and schedule/publish commands.
- Moving to Measure must require either ended campaign state, live/published content refs, or an audited manual measurement basis.
- Campaigns must support linked goals without duplicating Project Management goal truth.
- Campaigns must support linked segment refs without copying CRM segment membership into Marketing.
- Campaign read models must expose stale segment, stale report, stale corpus, missing binding, approval blocked, and runtime degraded states.

### Content pipeline and `ContentItem`

- Marketing/Department Workflows must own `ContentItem` as the content root for title, campaign refs, channel targets, body/assets, versions, content hash, approval ref, schedule ref, publish refs, source refs, provenance, and lifecycle/audit metadata.
- `ContentItem` lifecycle must be canonical: `Idea`, `Draft`, `InReview`, `Approved`, `Scheduled`, `Published`, and `Archived`.
- UI lane labels may be friendlier than domain state, but commands and audit must use the canonical lifecycle.
- Ideas may be human-created, AI-suggested, campaign-derived, report-derived, or workflow-derived.
- AI-suggested ideas must remain proposals until accepted by a human or policy-approved standing order.
- Drafting must use a Marketing `AgentEmployee` such as Atlas at T2 only when Marketing policy, knowledge scope, channel target, and budget allow it.
- Drafting workflow steps must include research, write, check, and report-to-review states where applicable.
- Research must read authorized project/org corpus overlays and approved external sources through allowed tools; browser-supplied corpus refs are hints only.
- Draft artifacts must include employee attribution, source refs, content version, generated-by workflow/run refs, and provenance.
- A content item enters `InReview` when a draft version is ready for human review and an Opzava `Approval` is requested or review state is opened.
- A content item enters `Approved` only after the matching content version/hash has an Opzava `Approval` in `Approved` state.
- A content item enters `Scheduled` only after approval, schedule policy, channel binding, consent/suppression checks where applicable, and calendar conflict checks pass.
- A content item enters `Published` only after an approved scheduled/manual publish command succeeds or an authorized manual publish ref is recorded.
- Editing approved content must invalidate approval unless policy explicitly records a non-material edit with matching approved content hash.
- Request changes must preserve the rejected/superseded draft version and create a new draft/revision path for Atlas or a human editor.
- Cancel draft must attempt to cancel the running WorkflowRun/TaskFlow/task through the broker where possible and must update Opzava content state idempotently.
- Published content must preserve channel refs, external publish refs, public URLs where available, campaign refs, report refs, and audit metadata.
- Archived content must remain auditable and removable from active pipeline/calendar/report views according to retention policy.

### Approvals

- Business approvals must use Opzava `Approval` rows as defined by ADR-012.
- Approval states must support Pending, Approved, Rejected, and Expired.
- Content approvals must record requester, optional `requesterAgentId`, approver policy, `policyRef`, `payloadRef`, target aggregate refs, content hash, expiry/SLA, decision metadata, mirrored OpenClaw refs where applicable, and audit.
- No `ContentItem` may reach `Published` without an Opzava `Approval` in `Approved` state for the exact item version or matching content hash.
- Schedule and publish commands must re-check approval server-side even when the UI has already hidden or disabled actions.
- The UI must not offer schedule/publish actions for unapproved, rejected, expired, superseded, or materially edited content.
- Approval prompts may appear in Marketing screens, Activity, assistant chat, and notifications, but all actions must update the same approval row.
- Runtime exec/plugin approvals from OpenClaw may be mirrored into the same inbox but must not approve a business content decision.
- If a business approval and runtime approval disagree, business conflict resolves to Opzava and execution fails closed.
- Approval backlog must be visible on the dashboard and must auto-escalate when more than 50 percent of the review SLA is consumed.

### Content calendar and scheduling

- Marketing/Department Workflows must own `ContentCalendar` for slots, channel timing, campaign refs, content refs, schedule conflicts, publishing windows, and lifecycle/audit metadata.
- Calendar slots must support Draft, Scheduled, Published, Canceled, Failed, Skipped, BlockedByApproval, BlockedByPolicy, and Conflict states.
- Calendar list/grid/agenda views must be read models over `ContentCalendar`, `ContentItem`, `Campaign`, channel refs, and runtime projections.
- Add event must validate content name, channel, campaign, date, time, status, actor authorization, campaign access, channel binding, and idempotency.
- Draft calendar slots may exist without approved content as planning placeholders.
- Scheduled slots that imply external publish must require approved content and matching content hash.
- Published slots must require a publish ref, external URL/ref, or authorized manual-publish reason.
- Calendar conflicts must check at least channel, campaign, time window, status, and per-channel schedule policy.
- Rescheduling must update the calendar slot, linked content schedule ref, campaign read model, and OpenClaw cron provisioning where runtime execution is needed.
- Duplicate schedule trigger keys must collapse to one slot/run and must not create duplicate external sends.
- Failed or skipped publish attempts must preserve slot state, runtime refs, failure reason, retry eligibility, and audit.
- Week, month, mobile agenda, day detail, filters, and Coming up rail must all read from the same authorized calendar read model.

### Workflow mapping to standing orders, cron, and TaskFlow

- Marketing campaign and content automation must use ADR-012 `Workflow`/`Playbook` definitions owned by Opzava.
- Workflow mechanisms must be `StandingOrderBlock`, `CronSpec`, and `TaskFlowSpec` children on the workflow definition.
- Publishing a Marketing workflow must run through `WorkflowProvisioner` in the admin/provisioning context and produce `ProvisionReceipt` records.
- Direct Gateway edits to standing orders, cron, or TaskFlow are drift and must be surfaced for repair/import/overwrite according to ADR-012.
- Standing orders must be used for persistent Marketing employee authority such as "top up content ideas when publish runway falls below threshold", "prepare recurring performance reads", or "watch approval SLA and escalate".
- Cron must be used for timed triggers such as scheduled publish, recurring report generation, reminder/escalation checks, and low-watermark pipeline checks.
- TaskFlow must be used for durable multi-step work such as research -> draft -> source check -> request approval -> wait -> revise/approve -> schedule -> publish -> report.
- Each mechanism must carry `costBudgetPerHour`, `maxConcurrentRuns`, `requiresApprovalPolicy`, idempotency key shape, timeout, retry cap, failure destination, and freshness SLA where applicable.
- `WorkflowProvisioner` must reject publish when a Marketing workflow would breach tenant, department, employee, plan, budget, concurrency, or mechanism ceilings.
- `RunLimiter` must enforce tenant and employee concurrency, fan-out, retry, and cost limits before dispatch and during retries.
- `WorkflowRun` and `RunStep` projections must show product lifecycle, runtime refs, approvals, artifacts, channel sends, errors, retries, and final status.
- Runtime refs must remain opaque; Opzava must not make OpenClaw rows or Gateway-local config identities into product identity.

### AI drafting and Marketing AgentEmployee behavior

- Marketing AI drafting must be performed by a Marketing `AgentEmployee` provisioned under ADR-008.
- Default Marketing autonomy is T2 send-on-behalf only where company-handle posting, channel binding, and approval policy are approved.
- For this PRD, Atlas may research, draft, check, suggest, schedule placeholders, and prepare publish jobs, but may not externally publish unapproved content.
- Atlas output must be attributed to Atlas and include acting-on-behalf-of metadata when initiated by a human, workflow, standing order, or approval.
- Atlas must use authorized project corpus and org corpus overlays from ADR-010, not browser-supplied corpus refs.
- Atlas must write draft artifacts and review summaries through Opzava refs, not only OpenClaw runtime artifacts.
- Atlas must not access PII, financial, credential, legal, tenant-admin, or unrelated project data unless the selected workflow/tool policy explicitly allows it.
- AI-generated claims, citations, source checks, and unresolved source warnings must be visible enough for human review.
- AI actions must write audit rows for request, assignment, tool policy decision, source read summary, draft artifact, approval request, revision, schedule preparation, publish attempt, and report generation.

### Reports and performance loop

- Marketing reports must be generated as workflow-triggered `ReportJob` records and versioned `ReportArtifact` outputs as defined by ADR-012.
- Report artifacts must record tenant, report type, period, period hash, `asOf`, source cursors, freshness SLA, metrics, narrative, generated-by run refs, provenance, and artifact storage refs.
- Dashboard report tiles must read report summaries and stale/fresh state from Opzava report projections.
- Ads, Email, Blog, and Performance report tiles must link to detailed report surfaces where implemented.
- Reports must not fabricate freshness; stale inputs must produce visible stale report state.
- Regenerating a report must create a new artifact version rather than mutating historical output.
- Report inputs may include campaign, content, calendar, channel metrics, CRM segments, usage/cost, workflow runs, and runtime projections through the owning ports.

### Access, security, and audit

- Every read must be authorized against active tenant, organization membership, project access, shell mode, role grants, and target refs.
- Every mutation must re-check authorization at action time and carry an idempotency key.
- Browser-supplied tenant ids, project ids, campaign ids, content ids, corpus refs, channel refs, Gateway refs, runtime refs, and approval refs must be treated as hints.
- Channel credentials and provider tokens must live only in Gateway/vault/secrets mechanisms; Opzava product rows store metadata and refs, not raw secrets.
- Send-time consent, suppression, and segment policy must be enforced by the owning CRM/External Channels paths before external sends.
- Marketing screens must sanitize user content, campaign names, content titles, AI output summaries, source labels, asset names, channel labels, report narratives, and external URLs.
- Audit rows must cover campaign creation/edit/stage move/archive, content lifecycle changes, approval requests/decisions, schedule changes, workflow publish/provisioning, runtime dispatch, channel sends, report generation, and policy denials.
- Access revocation must remove campaign, content, calendar, approval, report, and runtime-detail access on reload and realtime reconnect.

### Accessibility and responsive behavior

- Campaign boards, content pipeline lanes, calendar grids, mobile agendas, dialogs, filters, menus, tabs, status labels, and approval cards must use semantic controls and labels.
- Status and progress must be represented by text/glyph labels and not color alone.
- Stage movement, content cancellation, approval actions, calendar day controls, add-event controls, and dialog fields must work by keyboard.
- Focus must return to invoking controls when dialogs, menus, day details, and confirmation surfaces close.
- Mobile/narrow layouts must preserve primary actions, current context, review state, status labels, and schedule details without text overlap.
- Loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, and retry states must be defined for every screen in this PRD.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Marketing dashboard | Marketing/Dept-Workflows with Project Management | Campaign summaries, approval backlog, content/calendar counts, report summaries, latest activity, project member/AI employee projections | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Campaign board/list | Marketing/Dept-Workflows | `Campaign` stage, channels, owners, budget/window, due dates, linked content/assets/reports, status projections | `AuthorizationPort`, `EventBusPort` |
| Campaign creation/edit | Marketing/Dept-Workflows with Project Management and AI Workforce | Campaign command, owner eligibility, channel selection, linked project/goal refs, Atlas brief assignment | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Atlas campaign brief drafting | AI Workforce with Marketing | `AgentEmployee`, `Assignment`, optional `AgentDispatch`, project/org corpus overlays, draft artifact refs | `OpenClawGatewayPort`, `KnowledgeSourcePort`, `KnowledgeIndexPort`, `AuthorizationPort`, `EventBusPort` |
| Content pipeline board | Marketing/Dept-Workflows | `ContentItem` lifecycle, versions, source refs, review state, approval refs, schedule refs, publish refs, provenance | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Content research/drafting/checking | Marketing/Dept-Workflows with AI Workforce and Knowledge Management | WorkflowRun/RunStep, Atlas session/run refs, source reads, draft artifacts, source check results | `OpenClawGatewayPort`, `KnowledgeSourcePort`, `KnowledgeIndexPort`, `EventBusPort` |
| Content approval | Marketing/Dept-Workflows | Opzava `Approval`, content hash/version, approver policy, decision, expiry/SLA, mirrored runtime refs | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `OpenClawGatewayPort` |
| Content calendar | Marketing/Dept-Workflows | `ContentCalendar` slots, content/campaign refs, filters, conflict/read models, schedule/publish status | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Schedule content dialog | Marketing/Dept-Workflows with External Channels | Calendar slot command, linked content item, channel/campaign/date/time/status validation, approval/schedule checks | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Scheduled publish execution | Marketing/Dept-Workflows with Gateway Broker/External Channels | `Workflow`, `CronSpec`, `TaskFlowSpec`, approved content hash, channel send/publish refs, retries | `OpenClawGatewayPort`, `EventBusPort` |
| Standing orders and workflow provisioning | Department Workflows with Tenant Provisioning/Platform-Ops | `Workflow`, `Mechanism`, `ProvisionReceipt`, drift state, budget/concurrency/policy limits | `OpenClawGatewayPort`, `SecretsVaultPort`, `EventBusPort` |
| Channel binding and publish readiness | AI Workforce with External Channels | `ChannelBinding`, channel status, account refs, direction, scope filter, approval policy, health | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort` |
| CRM segment and consent checks | CRM/Customer Management | Segment refs, materialized members, consent, suppression, send-time eligibility | `AuthorizationPort`, `EventBusPort` |
| Assets and source refs | Knowledge Management with Marketing | Asset metadata, source blobs, approved/review state, artifact promotion, corpus refs where applicable | `KnowledgeSourcePort`, `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |
| Reports and performance tiles | Marketing/Dept-Workflows with Reports | `ReportJob`, `ReportArtifact`, period hash, metrics, narrative, freshness, provenance, artifact refs | `OpenClawGatewayPort`, `EventBusPort`, `ObjectStorePort` |
| Activity/notifications | Internal Collaboration and Notifications | Approval prompts, campaign changes, content lifecycle events, scheduled publish results, report ready events | `RealtimeTransportPort`, `EventBusPort`, `PushNotificationPort` |

## OpenClaw-parity notes

| Capability | Classification | Harnessed OpenClaw capability | Opzava-owned authority |
| --- | --- | --- | --- |
| Marketing AI drafting | Hybrid | Delegate-agent sessions, runs, tools, artifacts, task-ledger state, runtime approvals | `AgentEmployee`, assignment admission, content item, draft artifact refs, approval policy, audit |
| Campaign lifecycle | Opzava-owned | Optional runtime projections for AI work and reports | `Campaign` aggregate, stages, objectives, owners, channels, budgets, windows, read models |
| Content lifecycle | Hybrid | TaskFlow execution, sessions, artifacts, channel publish attempts | `ContentItem`, versions, content hash, review state, schedule/publish invariant |
| Business approvals | Opzava-owned with mirrored runtime prompts | `operator.approvals` only for exec/plugin gates | Opzava `Approval` is source of truth for content approval and external publish permission |
| Content calendar | Hybrid | `cron.add/update/remove/run/runs`, wake, TaskFlow waits, runtime events | `ContentCalendar` slots, conflicts, channel timing, schedule policy, UI state |
| Standing orders | Hybrid | `AGENTS.md` standing-order blocks rendered into employee workspace | Workflow definition, policy, budget, approval, provisioning receipts, drift decisions |
| Recurring reports | Hybrid | Cron, TaskFlow, sessions, artifacts, usage/runtime reads | `ReportJob`, `ReportArtifact`, freshness, period identity, source cursors, report read models |
| Channel publishing | Hybrid | External channel runtime and provider-specific send/publish tools behind Gateway | Channel binding metadata, consent/suppression decision, approval, content hash, audit |
| Knowledge for drafting | Hybrid | OpenClaw `memory-wiki`, `memory-lancedb`, OKF-derived indexes | Opzava knowledge sources, corpus revisions, authorized overlays, source refs |
| Runtime traces | Hybrid | Task-ledger, runs, tool calls, logs, runtime refs | `WorkflowRun`, `RunStep`, user-visible trace projections, redaction, audit |
| Runtime config mutation | OpenClaw-native harnessed through provisioning | Gateway config, cron, TaskFlow, agent workspace files | Opzava workflow/employee source of truth and admin/provisioning job control |

## Acceptance criteria

- Marketing dashboard renders the required tiles, waiting-on-you band, report tiles, latest activity, human/AI attribution, loading/empty/forbidden/offline/error states, and links to the named Marketing surfaces.
- Campaigns board/list renders Plan, Create, Approve, Publish, and Measure stages with correct counts, card metadata, accessible stage movement, add-campaign actions, AI drafting badges, and degraded states.
- New campaign creates one `Campaign` command with validated fields and idempotency, and Atlas draft assistance remains opt-in suggestion state until accepted.
- Campaign stage moves update Opzava campaign state and audit, not raw OpenClaw board state.
- Content Pipeline renders Ideas, Drafting, Needs you, Ready to publish, and Published lanes while commands persist canonical `ContentItem` lifecycle states.
- Atlas can research/draft/check content only through admitted Marketing workflow/assignment paths with budget, concurrency, knowledge scope, and tool policy enforced.
- No content item can be scheduled for external publish unless an Opzava `Approval` is approved for the exact content version/hash.
- No content item can be published unless the gateway command path also verifies approval, channel binding, content hash, schedule policy, and idempotency.
- Editing approved content invalidates approval unless a policy-approved non-material edit preserves the approved hash.
- Request changes and cancel draft are idempotent, preserve audit, and reconcile workflow/runtime state.
- Content Calendar renders month, week, mobile agenda, filters, day add controls, day detail, Coming up, status legend, empty/no-match/loading/error/offline states, and authorized event chips.
- Schedule content validates required fields and applies approval, conflict, channel binding, authorization, and idempotency checks before creating scheduled publish work.
- Scheduled publishes are provisioned/executed through ADR-012 workflow mechanisms and OpenClaw cron/TaskFlow where runtime work is needed.
- Duplicate cron trigger keys collapse and do not create duplicate drafts, approvals, sends, publishes, or reports.
- Workflow publish rejects definitions that breach tenant, department, employee, plan, budget, concurrency, approval policy, or mechanism limits.
- WorkflowRun/RunStep projections make content research, drafting, review, approval, schedule, publish, and report states visible without leaking raw Gateway internals.
- Business approvals and mirrored runtime approvals appear in one user-facing inbox where applicable, while authority remains split as ADR-012 requires.
- Report tiles and performance summaries come from versioned `ReportArtifact` projections with freshness/stale state.
- Channel credentials and provider secrets are never stored in Marketing source rows or rendered in UI.
- Role revocation removes access to campaigns, content, approvals, calendar entries, reports, and live runtime details on reload/reconnect.
- Keyboard, screen-reader, and mobile flows satisfy the behavior described in the UX walkthrough.

## Testing decisions

- Tests should cover external behavior through application services, route/server actions, projection read models, and UI composition; they should not assert raw OpenClaw DTO shapes or Gateway config files.
- The highest-value seam is the Marketing/Department Workflow application service that admits campaign/content/calendar commands and enforces approval, policy, idempotency, and lifecycle transitions.
- Campaign tests should cover create, Atlas draft suggestion acceptance, stage movement, forbidden moves, owner eligibility, channel validation, idempotent retries, and degraded read model states.
- Content tests should cover Idea -> Draft -> InReview -> Approved -> Scheduled -> Published, request changes, edit-after-approval invalidation, non-material hash-preserving edit, cancel draft, and archive.
- Approval tests should assert that schedule/publish commands fail closed without approved matching content hash and that stale approvals cannot decide superseded content.
- Calendar tests should cover add event validation, draft placeholder creation, schedule conflict detection, approved scheduled slot creation, reschedule idempotency, status filtering, and mobile agenda/read model parity.
- Workflow mapping tests should cover mechanism validation, workflow publish rejection on budget/concurrency/approval-policy breaches, provisioning receipt creation, drift state projection, duplicate trigger collapse, and RunLimiter enforcement.
- AI drafting tests should fake `OpenClawGatewayPort` and knowledge ports to assert assignment admission, authorized corpus overlays, artifact/provenance capture, and user-visible runtime states.
- Report tests should cover scheduled report job creation, artifact versioning, freshness/stale input state, period hash caching, and dashboard tile projection.
- UI tests should cover Campaigns board/list, New campaign dialog, Content Pipeline lane mapping, Needs you approval affordances, Content Calendar filters/views, Schedule content validation, keyboard menus/radiogroups, and loading/empty/forbidden/offline/error states.
- Security tests should cover authorization re-checks, role revocation, browser-supplied ref rejection, secret redaction, channel credential absence from product rows, send-time consent/suppression handoff, and audit emission.
- Accessibility tests should assert semantic labels and keyboard paths for stage menus, calendar day controls, add-event controls, status radiogroups, approval actions, and responsive calendar agenda.
- Existing prior-art seams to follow are the PRD-003 project workflow tests, PRD-005 assistant/approval tests, PRD-006 automation/run trace tests, and PRD-007 knowledge/corpus tests.

## Dependencies

- ADR-008 AI Workforce for `AgentEmployee`, Marketing department defaults, T2 policy, channel bindings, assignments, persona attribution, and OpenClaw delegate-agent provisioning.
- ADR-010 Knowledge Management for project/org corpus overlays, OKF-derived indexes, source refs, artifacts, and approved asset/source handling.
- ADR-012 Department Workflow Engine for `Workflow`, `Mechanism`, `WorkflowRun`, `RunStep`, `Approval`, `Campaign`, `ContentCalendar`, `ContentItem`, `ContentPipeline`, `ReportJob`, and `ReportArtifact`.
- Project Management for marketing project shell, project membership, linked goals, project activity, project schedule integration, and reusable project/card/detail surfaces.
- Internal Collaboration and Notifications for Activity, approval prompts, assistant hand-offs, realtime updates, and push notifications.
- AI Workforce/External Channels for channel binding metadata, channel health, send-on-behalf policy, and Gateway-owned channel credentials.
- CRM/Customer Management for segment refs, materialized segment freshness, consent, suppression, and send-time eligibility checks.
- Knowledge Management/Object Store for assets, approved files, source blobs, generated artifacts, and content provenance.
- Tenant Provisioning/Platform-Ops for workflow/employee provisioning jobs, admin-token usage, drift detection, repair, and provision receipts.
- Billing/Plan limits for tenant, department, employee, workflow, budget, concurrency, and usage ceilings.
- Net-new design dependencies listed in the UX walkthrough for content review/detail, approval queue/detail, campaign detail, calendar event detail, and Marketing workflow settings.
