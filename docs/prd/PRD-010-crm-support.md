# PRD-010: CRM and customer support workflows

## Problem

Opzava has the core project, collaboration, AI workforce, and marketing surfaces defined, but customer-management work still lacks a product contract for durable CRM records, external customer conversations, support tickets, deals, consent, and erasure.

Without this PRD, the CRM/support slice can drift into unsafe or incomplete behavior:

- Customer Slack, Gmail, WhatsApp, email, and support-channel senders could be treated as Contacts directly, even though ADR-011 says provider sender ids and conversation ids are not CRM identity.
- Support work could live only as project cards or OpenClaw channel threads, leaving no durable Ticket with SLA, assignment, queue, priority, Contact, Account, consent, and audit state.
- AI support employees could draft or send replies without a stable support `AgentEmployee`, channel binding, approval policy, and clear customer-facing attribution under ADR-008.
- Contact timelines could omit OpenClaw channel history or duplicate it as raw transcript storage instead of surfacing safe `Activity` projections through the ACL.
- Unknown sender resolution could silently auto-merge people across channels, contaminating support history, deals, segments, consent, legal exports, and AI memory.
- Deals and pipeline tracking could become loose board cards instead of CRM-owned `Deal`, `Pipeline`, and `Stage` records connected to Accounts, Contacts, Activities, and support context.
- Consent and GDPR erasure could be bolted on after marketing/support sends, making opt-outs, erasure receipts, and memory/channel scrubs unreliable.
- The existing mockups cover internal messages and support-flavored project cards, but they are thin on true CRM screens. Required Contact, Account, Ticket, Deal, Consent, and erasure screens must be called out as net-new design work.

The solution is to ship an Opzava-owned CRM and support workflow product slice that uses ADR-011 for Contact resolution and CRM truth, ADR-008 for support `AgentEmployee` assignment, and the existing project/chat/card mockup language for support work handoffs. OpenClaw remains harnessed for external channel runtime, transcripts, sends, delivery state, and channel observations through the `gateway-broker` ACL; Opzava owns CRM records, support workflow truth, contact identity mapping, timeline projections, tickets, deals, consent, audit, and erasure workflow state.

## Goals and Non-goals

### Goals

- Ship Contact records for customer people, including PII, lifecycle, owner, account links, consent summary, channel identity summary, open tickets, deals, activity, and merge/resolution state.
- Ship Account records for companies/organizations, including profile, hierarchy, account owner, contacts, deals, tickets, activity summary, and support/commercial health.
- Surface a customer conversation timeline from OpenClaw external channels through the ACL as CRM `Activity` projections.
- Enforce ADR-011 channel-identity resolution: exact verified `ChannelIdentity` match auto-links to a Contact; every other sender creates or reuses an `UnknownContact` shell and resolution suggestions.
- Ship support Tickets assigned to a Support `AgentEmployee`, with SLA, queue, priority, status, Contact, Account, opaque external conversation ref, reply draft/review/send state, and audit.
- Support customer-facing project/card workflows from `essential-card-table.html` and `essential-card.html` while keeping Ticket truth in CRM.
- Ship Deal and Pipeline workflows for opportunities tied to Accounts, primary Contacts, stage, value, close metadata, activity, and support risk signals.
- Ship Consent records per Contact, channel, and purpose, with send-time eligibility checks, opt-out/revocation, proof/source metadata, and suppression states.
- Ship GDPR right-to-erasure workflow state, receipts, terminal states, and admin UX requirements across Opzava CRM, per-tenant Gateway channel history, and derived Knowledge/agent memory indexes.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity boundaries: native harnessed runtime capabilities versus Opzava-owned product authority.
- Define acceptance and testing decisions at the highest behavior seams.
- Flag every CRM screen that is net-new to design because the named mockups do not provide a full CRM interface.

### Non-goals

- Build OpenClaw channel providers, transcripts, channel credentials, Gateway config, provider directory lookup internals, or send runtime.
- Store raw provider sender ids, raw provider payloads, raw transcripts, channel secrets, Gateway-local config, or OpenClaw DTOs in ordinary Opzava CRM domain tables.
- Replace Internal Collaboration messages, project Team rooms, DMs, Activity, or notification infrastructure from PRD-004.
- Replace Project Management cards or OpenClaw Workboard. Support tickets may link to project `pm.Card` records, but they remain different aggregates.
- Build Marketing campaign authoring, segment builder UX, or send campaign execution beyond consent/segment touchpoints required by CRM.
- Build Knowledge Management ingestion, vector storage, or OKF internals beyond erasure scrub/rebuild handoffs and safe CRM-derived knowledge candidates.
- Build billing, plan limits, or cost reporting beyond consuming tenant/employee/workflow ceilings supplied by owning contexts.
- Allow browser clients or normal route handlers to call OpenClaw channels directly, mutate Gateway config, provide channel identity proof, or bypass the ACL.
- Auto-merge Contacts across channels using display name, phone, email, AI similarity, or directory hints.
- Perform hard deletes that violate audit, retention, support, legal hold, or FK skeleton requirements.

## User Stories

1. As a support lead, I want a CRM area in Opzava, so that customer records are not scattered across project cards, chat, and external channels.
2. As a support lead, I want Contact records for customer people, so that every ticket and conversation has a stable customer identity.
3. As a support lead, I want Account records for companies, so that support and sales can understand the customer organization.
4. As a support agent, I want a Contact detail page with profile, channel identities, consent, timeline, tickets, deals, and account links, so that I can respond with context.
5. As a support agent, I want an Account detail page with contacts, open tickets, deals, timeline, owner, and health summary, so that company-level context is visible.
6. As a support agent, I want Contact and Account search by name, email, company, ticket id, account owner, and safe channel display metadata, so that I can find the right record quickly.
7. As a support agent, I want Contact duplicate suggestions separated from confirmed identity, so that I do not mistake hints for truth.
8. As a support agent, I want UnknownContact shells to appear as real customer records with limited metadata, so that unresolved senders can still have tickets and audit.
9. As a support agent, I want UnknownContact shells to be visually distinct, so that uncertainty is clear before a reply or merge.
10. As a support agent, I want to resolve an UnknownContact into an existing Contact only after reviewing evidence, so that ambiguous senders do not poison customer history.
11. As a support agent, I want exact verified `ChannelIdentity` matches to auto-link, so that known customers do not create duplicate shells.
12. As a support agent, I want partial matches, unverified matches, display-name matches, phone/email matches, and AI suggestions to require confirmation, so that auto-merge stays conservative.
13. As a support manager, I want every Contact merge to record actor, evidence, conflicting fields, source/target contacts, snapshots/tombstone refs, and audit, so that identity changes are reviewable.
14. As a support manager, I want Contact merges to never cross tenants, so that two organizations' customer histories cannot be mixed.
15. As a support agent, I want inbound external conversations to create timeline Activity on a Contact or UnknownContact shell, so that channel history is visible in CRM.
16. As a support agent, I want the Contact timeline to show inbound messages, outbound replies, ticket updates, notes, calls, deal changes, consent changes, campaign touches, and erasure/scrub state where allowed, so that history is chronological.
17. As a support agent, I want timeline rows to show channel, source, time, direction, safe snippet, linked Ticket, and live/transcript availability, so that I can understand context without raw provider data.
18. As a support agent, I want timeline rows to degrade when Gateway transcript detail is unavailable, so that CRM remains usable during channel downtime.
19. As a support agent, I want to open live channel transcript detail through the ACL where authorized, so that I can inspect the customer thread without CRM owning raw transcript storage.
20. As a support agent, I want outbound replies to respect Consent and support channel binding before send, so that replies do not violate customer preferences or policy.
21. As a support agent, I want a Ticket created when support intent is detected or a human opens one, so that customer issues have durable workflow state.
22. As a support agent, I want each Ticket to reference Contact, Account where available, opaque external conversation ref, queue, priority, status, SLA, and assigned Support `AgentEmployee`, so that ownership and urgency are explicit.
23. As a support agent, I want tickets assigned to Echo or another Support `AgentEmployee`, so that AI work is attributed to a real employee persona.
24. As a support lead, I want SLA timers on Tickets, so that overdue first response, next response, and resolution work is visible.
25. As a support lead, I want SLA breach and warning states to feed task board, Activity, notifications, and dashboards, so that time-sensitive support work is not missed.
26. As a support agent, I want ticket status values such as New, Triage, Waiting on AI, Waiting on customer, Needs human review, Open, On hold, Resolved, Closed, and Erasure restricted, so that workflow states are precise.
27. As a support agent, I want ticket queues such as Support, Billing Support, Technical Support, Escalations, and Unknown sender review, so that work routes to the right owner.
28. As a support agent, I want AI-drafted replies to pause for review when policy requires it, so that sensitive customer messages are checked before send.
29. As a support agent, I want ordinary Support T2 send-on-behalf replies to send under the Support `AgentEmployee` identity when channel binding permits, so that common support work is efficient and attributed.
30. As a support agent, I want refunds, account changes, PII export, legal language, Contact merges, and consent changes to require approval, so that high-risk actions remain T1.
31. As a support agent, I want the ticket reply composer to show Contact, consent, channel, SLA, assigned employee, and approval requirement, so that send risk is visible.
32. As a support agent, I want failed sends, GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, and missing channel binding to render as normal ticket states, so that I know what blocked the reply.
33. As a support agent, I want duplicate inbound events to dedupe by ACL idempotency key, so that the timeline and tickets do not double-post.
34. As a support agent, I want out-of-order channel observations to reconcile into the correct timeline order, so that history is readable.
35. As a support lead, I want support tickets to optionally link to `pm.Card` records, so that deeper engineering or project work can be tracked without turning tickets into project cards.
36. As a project member, I want support cards on the board to show customer-facing status, assigned AI employee, due/SLA hints, comments, files, and reply-ready state, so that project-style triage remains useful.
37. As a project member, I want the card detail to show linked Ticket and Contact context, so that the project card explains the customer issue.
38. As a project member, I want Evidence & Files on a support card to include safe refs to customer attachments and ticket artifacts, so that review has context without leaking raw channel payloads.
39. As a reviewer, I want Quality Review on a support card to include AI pre-checks, human checks, approval/send action, and unresolved risk, so that customer replies are governed.
40. As a support agent, I want ticket comments and internal collaboration to stay separate from customer conversation, so that internal notes are not accidentally sent externally.
41. As a support agent, I want an internal Team room or Messages thread to link to a Ticket without becoming the customer channel, so that colleagues can discuss the issue safely.
42. As a support agent, I want Activity to collect mentions, SLA nudges, review requests, and AI handoffs for support work, so that directed work reaches me.
43. As a support lead, I want a Ticket inbox/queue view with filters by queue, SLA, priority, assignee, status, Contact resolution, channel, and Account, so that support workload is manageable.
44. As a support lead, I want a Ticket board/table view to reuse task-board status language where appropriate, so that support and AI operations stay familiar.
45. As a support lead, I want task-board cards for support AI work to link back to the owning Ticket, Contact, and approval, so that operational triage does not fork workflow truth.
46. As a customer-management user, I want Deals tied to Accounts and primary Contacts, so that commercial opportunities live in CRM.
47. As a customer-management user, I want Pipeline and Stage reference data versioned, so that historical deal stage meaning is stable.
48. As a customer-management user, I want deal cards or a pipeline board with stage, value, owner, close date, account, primary contact, next activity, and risk, so that sales work is scannable.
49. As a customer-management user, I want support ticket risk to appear on Account and Deal summaries, so that active support problems inform customer management.
50. As a customer-management user, I want deal stage changes to append Activity, so that account history includes commercial events.
51. As a customer-management user, I want deal notes and next steps to be distinct from customer support ticket replies, so that support and sales workflows do not mix.
52. As a marketing user, I want CRM Segments to use Contact and Account fields plus materialized member ids, so that targeting can be planned.
53. As a marketing user, I want every outbound send to re-check current Consent at send time, so that stale segment membership cannot override opt-out.
54. As a compliance user, I want Consent records per Contact, channel, and purpose, so that eligibility is explainable.
55. As a compliance user, I want Consent to capture status, timestamp, source, proof ref, revocation metadata, and suppression reason, so that audit has enough evidence.
56. As a compliance user, I want opt-out, bounce, spam complaint, manual suppression, legal hold, and admin changes to update Consent, so that future sends stop correctly.
57. As a support agent, I want missing required consent or deny consent to block non-support outbound sends, so that customer preferences are honored.
58. As a support agent, I want support replies to follow tenant policy for transactional/customer-support purposes, so that legitimate support can continue where policy allows.
59. As a compliance user, I want a Consent admin screen on Contact detail, so that reviewers can inspect and change consent with approvals where required.
60. As a compliance user, I want consent changes by AI employees to require approval by default, so that high-risk CRM mutation remains T1.
61. As a data protection admin, I want to start GDPR erasure for a Contact from an authorized admin surface, so that right-to-erasure work is deliberate.
62. As a data protection admin, I want erasure to show scope before execution: Contact PII, channel identities, consent proof payloads, segment membership, activity bodies, ticket bodies, projections, Gateway channel history, and agent memory, so that the operator understands impact.
63. As a data protection admin, I want erasure to be idempotent with a stable request id, so that retries do not corrupt state.
64. As a data protection admin, I want erasure to preserve PII-free audit tombstones and FK skeletons where retention requires, so that legal/audit reporting remains possible.
65. As a data protection admin, I want erasure terminal states such as Erased, RetainedByPolicy, GatewayScrubPending, MemoryScrubPending, ScrubFailedNeedsReview, and FailedNeedsReview, so that async work is operable.
66. As a data protection admin, I want erasure receipts from Opzava, Gateway scrub, and Knowledge memory scrub, so that completion can be proven.
67. As a support agent, I want erased Contact records to hide or anonymize PII in tickets, timelines, and cards, so that ordinary users do not see erased data.
68. As a support lead, I want active Tickets to enter a restricted/review state when their Contact is erased or retained by policy, so that replies do not use scrubbed identity.
69. As an AI Workforce operator, I want Support `AgentEmployee` channel bindings to declare allowed customer channels, direction, queue scope, target allowlist, approval policy, and health, so that support sends are bounded.
70. As an AI Workforce operator, I want customer-channel prompt-injection risk to be mitigated by tool policy, approval rows, and audit, so that customer messages cannot grant new authority.
71. As a product operator, I want CRM screens to work when a tenant Gateway is unavailable, so that Contacts, Accounts, Tickets, Deals, Consent, and historical Activity remain queryable.
72. As a product operator, I want live transcript detail and sends to degrade through broker error states, so that unavailable runtime is clear.
73. As a product operator, I want every CRM command to carry tenant scope and idempotency, so that retries and multi-tenant isolation are safe.
74. As a security reviewer, I want browser-supplied external ids, channel ids, room ids, thread ids, session ids, and conversation ids treated only as hints, so that a client cannot prove Contact identity.
75. As a security reviewer, I want raw external sender ids to stay inside `ChannelIdentity` resolution, so that ordinary domain rows store ContactId and opaque conversation refs only.
76. As a security reviewer, I want Contact, Account, Ticket, Deal, Consent, merge, send, approval, and erasure actions authorized server-side, so that stale clients fail closed.
77. As a security reviewer, I want role revocation to remove CRM, support, timeline, transcript, and consent access on reload and realtime reconnect, so that old sessions do not leak customer data.
78. As a screen-reader user, I want CRM tables, timelines, ticket queues, pipeline stages, identity suggestions, consent states, and erasure workflow rows to expose semantic labels, so that workflows are usable without visual scanning.
79. As a keyboard user, I want filters, tabs, queues, cards, merge dialogs, reply review, consent changes, and erasure confirmations to work without a mouse, so that support work is efficient.
80. As a mobile user, I want Contact, Ticket, and Account summaries to collapse without hiding SLA, consent, reply action, owner, or resolution state, so that urgent support can be handled on narrow screens.
81. As a product operator, I want every CRM/support screen to render loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, and retry states, so that async reality is normal UX.
82. As a developer, I want tests at application-service, port, projection, route/server-action, and UI composition seams, so that CRM behavior is protected without coupling to OpenClaw internals.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `messages-slack.html` | Full/admin Slack-grade internal collaboration remains Internal Collaboration, not CRM. For CRM/support, this mockup informs dense conversation affordances only: channel/DM sidebar, unread counts, message feed, thread drawer, reactions, pins, search, live/reconnecting banner, and AI app-label treatment. Customer conversations must not be stored in these internal channel rows; external customer thread detail is a CRM projection/read-through surface reached from Ticket/Contact through the ACL. Net-new design needed for an External Conversation panel that borrows the density but clearly labels customer channel, Contact resolution state, consent, Ticket, and send authority. |
| `essential-messages.html` | Essential Messages remains people/project-room centered. For CRM/support, it provides the calmer two-pane conversation pattern, unread treatment, search, offline queued-message language, mention highlight, reaction simplicity, and Activity pointer. Customer Support project rooms may discuss tickets internally and link to Tickets, Contacts, and Accounts, but they must not become the customer conversation timeline. Net-new design needed for customer conversation inbox/queue and Contact timeline, because this mockup explicitly frames Messages as team chat. |
| `essential-team-room.html` | Project Team room maps to internal support coordination. It should show links to support tickets, SLA handoffs, and AI daily summaries about support work, while keeping the human room separate from customer replies. The adjacent `Ask your assistant` tab and AI summary card inform how Support `AgentEmployee` updates appear internally. Net-new design needed for Ticket detail and customer reply review/send because this mockup does not cover external-channel send controls, consent, Contact resolution, or SLA. |
| `task-board.html` | Full/admin Tasks board informs cross-agent support operations: Backlog, In progress, Review, Done columns; queued/running/degraded/review statuses; progress; assignee avatars; project filter; degraded runtime state; and empty Done state. CRM must use this language for AI support assignments and SLA nudges, but Ticket remains the CRM source of truth. Net-new design needed for a Support Ticket Queue/Board that adds Contact, Account, channel, SLA, priority, consent, UnknownContact, and reply-ready fields. |
| `essential-card.html` | Support-flavored `CS-1042` card is the closest existing CRM mockup. It maps to linked support work: stable card id, customer-facing label, assigned Support AI employee, due state, steps, comments, AI Run trace, Evidence & Files, Quality Review, and Approve & send to customer. CRM must add a linked Ticket and Contact/Account panel, SLA, external conversation ref, consent status, reply draft/version, approval requirement, and Contact resolution state. Net-new design needed for canonical Ticket detail and Contact detail; project card detail remains a linked project/work surface. |
| `essential-card-table.html` | Customer Support board maps to support triage language: Triage/In progress/On hold/Done, card ids, Customer-facing/Billing/Bug labels, due hints, AI working, reply ready for you, waiting on customer, resolved, comments, files, and keyboard-accessible move menu. CRM must back these cards from Ticket projections or linked `pm.Card` refs, not make board position the only ticket state. Net-new design needed for Ticket queue filters, SLA sorting, Contact resolution inbox, and Account/Deal summaries. |

Net-new screens to design:

- CRM home/dashboard with support queue health, SLA risk, UnknownContact count, recent customer activity, pipeline value, and consent/erasure alerts.
- Contacts list with search, filters, lifecycle, owner, account, open tickets, consent summary, channel identity summary, and UnknownContact state.
- Contact detail with profile, `ChannelIdentity` list, resolution suggestions, consent, timeline, tickets, deals, account links, merge audit, and erasure state.
- Accounts list and Account detail with company profile, hierarchy, contacts, deals, tickets, owner, account timeline, health/risk, and support/commercial summary.
- UnknownContact resolution inbox with exact/partial/unverified suggestions, evidence comparison, create Contact, link Contact, reject suggestion, and audited merge flow.
- Ticket queue/board/table with queue, SLA, priority, assignee Support `AgentEmployee`, status, Contact/Account, channel, consent, reply-ready, and Gateway state filters.
- Ticket detail with external conversation timeline, reply composer, AI draft/review/send, approval gates, Contact resolution banner, SLA, queue, priority, audit, and linked project card.
- External conversation detail/read-through panel for OpenClaw channel transcript snippets, delivery status, opaque conversation refs, retry/degraded states, and safe transcript access.
- Deal pipeline board/list and Deal detail for Account, primary Contact, stage, value, owner, close date, activity, support risk, and next action.
- Consent admin panel on Contact detail with per-channel/purpose records, proof/source, revocation, suppression, legal hold, and audited change flow.
- GDPR erasure admin workflow with scope preview, approval/confirmation, idempotency key, progress, Gateway/memory scrub receipts, terminal states, and retained-by-policy explanation.

## Functional requirements

### Contact, Account, and identity resolution

- CRM/External Channels must own tenant-scoped `Contact`, `Account`, `ChannelIdentity`, `Activity`, `Ticket`, `Deal`, `Pipeline`, `Stage`, `Segment`, `Consent`, merge audit, and erasure workflow records.
- Contact records must store customer PII, lifecycle, owner, dedupe fingerprints, consent refs, account links, open support state, and `ChannelIdentity` value objects.
- Account records must store company profile, hierarchy, account owner, contact relationships, lifecycle, deals, tickets, and account activity summaries.
- `ChannelIdentity` must identify an external sender, not a conversation, thread, room, session, transcript, or OpenClaw conversation id.
- `ChannelIdentity` uniqueness must be tenant-scoped by `(tenantId, channel, channelAccountRef?, externalId)`.
- The ACL resolver's canonical external sender identity must be the only external id accepted into `ChannelIdentity`.
- Ordinary CRM domain rows must store `ContactId`, optional `ChannelIdentityId` only where resolution requires it, and opaque conversation/runtime refs; they must not grow provider-specific fields such as Slack user id, Gmail sender, phone sender, or WhatsApp id.
- The ADR-003 ACL must emit normalized sender/conversation events such as `SenderSeen` and conversation observations with tenant, channel, channel account scope, sender kind, canonical sender id, verification evidence, display enrichment, opaque conversation refs, idempotency key, and source timestamp.
- If a sender event matches exactly one verified `ChannelIdentity`, CRM must auto-link the event to that Contact.
- If there is no exact verified match, CRM must create or reuse an `UnknownContact` shell with a real tenant-scoped `ContactId`, minimal non-sensitive display metadata, and resolution status.
- Multiple candidates, partial matches, unverified matches, normalized phone/email matches, directory-display-name matches, dedupe fingerprints, and AI similarity must become suggestions only.
- Cross-channel dedupe must be suggest-and-confirm only and must require an audited merge command.
- Contact merges must record actor, source contacts, target contact, evidence, conflicting fields, pre-merge snapshots or tombstone refs, idempotency key, and rollback/review metadata where retention permits.
- Dedupe and merge must never cross tenants.
- Contact and Account reads/mutations must be authorized against tenant, org membership, role grants, project/customer access where applicable, and PII policy.

### Customer conversation timeline and Activity

- External channel observations from OpenClaw must project into CRM `Activity`, not become CRM identity.
- No external conversation, activity, or ticket write may persist without tenant scope plus a resolved-or-shell `ContactId`.
- Timeline projection writers must use the tenant bound to the broker connection or outbox envelope, not tenant-looking values in OpenClaw payloads.
- Activity rows must be append-only and support calls, notes, inbound messages, outbound messages, campaign touches, deal changes, ticket changes, support summaries, consent changes, merge/resolution events, and erasure/scrub states.
- Activity rows for external messages must include safe metadata: ContactId, optional TicketId, channel, direction, source timestamp, safe snippet/summary, opaque conversation ref, delivery state where available, and projection freshness.
- CRM may read through the ACL for authorized live transcript detail, but durable CRM timeline rows must remain safe projections.
- Gateway downtime must not prevent viewing Contacts, Accounts, Tickets, Deals, Consent, and historical Activity.
- Live transcript detail and sends must degrade through explicit broker/runtime states such as GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, MissingRuntimeRef, and GatewayScrubPending.
- Duplicate, retried, and out-of-order channel observations must be idempotently projected and reconciled by idempotency key, source timestamp, and opaque conversation ref.
- Timeline rendering must clearly distinguish customer-visible messages, internal notes, AI summaries, campaign touches, deal events, consent events, and legal/erasure events.

### Support Tickets and AI support workflow

- Ticket must be the durable CRM support aggregate for customer issues.
- A Ticket must reference tenant, Contact, optional Account, opaque external conversation ref, support status, priority, queue, SLA, assigned Support `AgentEmployee`, channel, source, and audit.
- Ticket creation must happen when support intent is detected on an eligible external channel, an explicit human action opens one, or a workflow rule admits support work.
- Ticket creation and update must be idempotent for duplicate conversation observations and repeated user actions.
- Ticket assignment must target a Support `AgentEmployee` whose channel binding and tool policy allow the customer channel and support scope.
- Support `AgentEmployee` output must be attributed to the employee persona with acting-on-behalf-of audit metadata where applicable.
- Support default autonomy follows ADR-008: ordinary replies may be T2 send-on-behalf only when binding and policy permit; refunds, account changes, PII export, legal language, Contact merge, consent changes, and escalations require T1 approval.
- Ticket SLA must support first response, next response, and resolution policies, including warning, breached, paused, and retained/restricted states.
- Ticket queues must support routing by channel, Account, priority, intent, UnknownContact state, plan tier where supplied, and escalation rules.
- Ticket reply drafts must record generated-by actor/employee, source conversation refs, draft version, review state, approval refs where needed, and send result.
- Outbound support sends must re-check Contact resolution state, channel binding, Consent/purpose policy, tenant lifecycle, ticket status, approval requirements, rate/spend caps, and idempotency before calling the ACL.
- Failed or blocked sends must preserve the draft and write a ticket activity/audit event with a safe failure reason.
- Tickets may link to `pm.Card` records for engineering/project work, but Ticket status, SLA, Contact, conversation, and support assignment remain CRM-owned.
- Project cards may display Ticket projections such as Contact, SLA, reply-ready, waiting-on-customer, and support AI status.

### Deals, Pipeline, and customer management

- Deal must be the durable CRM aggregate for commercial opportunities.
- Deals must reference tenant, Account, optional primary Contact, Pipeline version, Stage, value, currency, owner, status, close metadata, activity refs, support risk refs, and audit.
- Pipeline and Stage must be versioned reference data so historical deals keep stable stage meaning.
- Deal stage changes, value changes, owner changes, close/reopen, notes, and next actions must append Activity.
- Deals must not store provider/channel sender ids or raw conversation refs except safe links through Contact/Activity where authorized.
- Account and Contact summaries must show linked deals and support risk without mixing support Ticket workflow with Deal stage workflow.
- Deal pipeline UI is net-new design and should borrow board/table conventions from existing card/table mockups while using CRM Deal fields.

### Consent, segments, and send eligibility

- Consent must be per Contact, channel, purpose, and tenant policy.
- Consent records must include status, timestamp, source, proof ref, revocation metadata, suppression reason, legal hold state where applicable, and audit refs.
- Consent states must support at least Unknown, OptedIn, OptedOut, Suppressed, Bounced, SpamComplaint, Revoked, LegalHold, and RetainedByPolicy where applicable.
- Segment must be a saved CRM query/specification plus materialized member ids for planning, reporting, and workflow targeting.
- Segment materialization may be nightly for day-one operations, but every outbound send must re-check current Consent at send time.
- Segment membership, stale campaign plans, AI suggestions, and cached projections must not override a current deny or missing required opt-in.
- Opt-out webhooks, bounce, spam complaint, manual suppression, legal hold, and admin changes must update Consent and emit events to suppress future sends.
- Support replies must evaluate consent by purpose and tenant policy, distinguishing support/transactional replies from marketing sends.
- Consent changes by AI employees or workflows must require approval where policy classifies them as high-risk CRM mutations.

### GDPR erasure and retention

- `EraseContact(tenantId, contactId)` must be an idempotent admin/provisioning workflow with a stable request id and PII-free audit tombstone.
- Erasure must scrub or anonymize Opzava Contact PII, `ChannelIdentity`, consent proof payloads, segment membership, activity bodies, ticket bodies, denormalized CRM projections, and customer-facing card projections according to retention policy.
- Erasure must preserve required FK skeletons, legal/audit facts, idempotency records, and retained-by-policy explanations.
- Erasure must call the tenant Gateway through the ADR-003 ACL/admin context to delete or scrub channel history for known sender identities where policy permits.
- Erasure must trigger Knowledge Management scrub/rebuild work for agent memory, `memory-wiki`, and `memory-lancedb` references under the ADR-010 derived-index model.
- Erasure must reconcile until Opzava state, Gateway channel history, and agent memory scrub receipts reach a terminal state.
- Terminal states must include Erased, RetainedByPolicy, GatewayScrubPending, MemoryScrubPending, ScrubFailedNeedsReview, and FailedNeedsReview.
- Ticket, Contact, Account, Activity, Deal, and project-card projections must render erased/anonymized data consistently after erasure.
- Active Tickets connected to erased Contacts must move to restricted/review state before any further customer send.

### UX, access, and audit

- CRM/support screens must use existing Opzava visual language for top bars, breadcrumbs, filters, boards, cards, tabs, activity rows, evidence lists, quality review, status badges, and degraded states.
- CRM-specific surfaces listed as net-new design dependencies must be designed before implementation proceeds beyond linked project/card flows.
- Every read must be authorized against tenant, organization membership, role grants, project/customer scope where applicable, shell mode, PII policy, and legal/retention state.
- Every mutation must re-check authorization at action time and carry an idempotency key.
- Browser-supplied tenant ids, Contact ids, Account ids, Ticket ids, Deal ids, channel refs, external ids, conversation refs, consent refs, approval ids, and runtime refs must be treated as hints.
- Audit rows must cover Contact create/update, Account create/update, identity resolution, UnknownContact shell creation, merge suggestion, merge decision, Ticket create/update/assignment/SLA, reply draft/review/send, Deal changes, Consent changes, segment materialization, erasure request/progress/terminal state, policy denial, and access denial.
- Customer content, AI output, snippets, file names, channel labels, notes, and report/summary text must be sanitized before rendering.
- Loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, partial projection, and retry states must be defined for every CRM/support screen.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Contacts list/detail | CRM/External Channels | `Contact`, lifecycle, owner, PII policy, account links, open tickets, deals, consent summary, activity summary, erasure state | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Accounts list/detail | CRM/External Channels | `Account`, hierarchy, account owner, contact relationships, deals, tickets, activity summaries, support/commercial health | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Channel identity resolution | CRM/External Channels with Gateway Broker | `ChannelIdentity`, `SenderSeen`, verification evidence, UnknownContact shell, resolution suggestions, merge audit | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort` |
| External conversation projection | CRM/External Channels with Gateway Broker | Conversation observations, opaque conversation refs, safe snippets, delivery status, timeline `Activity`, idempotency keys | `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Live transcript read-through | Gateway Broker / External Channels | Authorized read-through of OpenClaw channel transcript detail, runtime/degraded states, redacted display data | `OpenClawGatewayPort`, `AuthorizationPort` |
| UnknownContact resolution inbox | CRM/External Channels | Shell Contacts, candidate suggestions, evidence display, link/create/reject/merge commands, audit | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Contact merge | CRM/External Channels | Source/target Contacts, evidence, conflicts, snapshots/tombstone refs, idempotency, audit | `AuthorizationPort`, `EventBusPort` |
| Ticket queue/board | CRM/External Channels with AI Workforce | `Ticket`, queue, status, priority, SLA, Contact, Account, channel, assigned Support `AgentEmployee`, reply-ready state | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Ticket detail and reply workflow | CRM/External Channels with AI Workforce | Ticket timeline, AI draft versions, approval refs, send checks, consent/purpose policy, channel binding, send result | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Support AI assignment | AI Workforce with CRM | Support `AgentEmployee`, `Assignment`, channel binding, tool policy, autonomy tier, support queue scope, run/report refs | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort` |
| Linked project support cards | Project Management with CRM projections | `pm.Card` links, Ticket refs, Contact/Account snippets, SLA/reply-ready projection, evidence refs, quality review handoff | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Internal support collaboration | Internal Collaboration with CRM links | Team room/messages/activity rows linking to Tickets, Contacts, Accounts, approvals, and SLA nudges | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Deal pipeline and detail | CRM/External Channels | `Deal`, `Pipeline`, `Stage`, Account, primary Contact, value/currency, owner, close metadata, support risk, activity | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Segments | CRM/External Channels with Marketing | Saved CRM specification, materialized member ids, freshness, campaign/report refs, eligibility context | `AuthorizationPort`, `EventBusPort` |
| Consent admin and send eligibility | CRM/External Channels | `Consent`, channel/purpose status, proof refs, revocation, suppression, legal hold, send-time eligibility | `AuthorizationPort`, `EventBusPort` |
| Opt-out and provider webhooks | CRM/External Channels with Gateway Broker | Bounce, complaint, unsubscribe, opt-out, provider delivery state, consent updates, suppression events | `OpenClawGatewayPort`, `EventBusPort` |
| GDPR erasure workflow | CRM/External Channels with Tenant Provisioning/Platform-Ops | `EraseContact`, scrub plan, PII-free tombstone, Opzava scrub, Gateway scrub, terminal states, receipts | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Agent memory scrub | Knowledge Management with CRM erasure | CRM-derived knowledge candidates, memory/wiki/vector scrub requests, rebuild receipts, retained-by-policy state | `KnowledgeSourcePort`, `KnowledgeIndexPort`, `EventBusPort` |
| Notifications and Activity | Notifications/Admin-Observability and Internal Collaboration | SLA warnings/breaches, UnknownContact review, reply review, approval prompts, erasure failures, assignment handoffs | `RealtimeTransportPort`, `PushNotificationPort`, `EventBusPort` |
| Audit and access denial | Identity & Access with CRM | Authorization checks, role revocation, policy denials, PII/legal access gates, immutable audit rows | `AuthorizationPort`, `EventBusPort` |

## OpenClaw-parity notes

| Capability | Classification | Native OpenClaw capability harnessed | Opzava-owned authority |
| --- | --- | --- | --- |
| External channel connectivity | OpenClaw-native harnessed | Channel providers, credentials, sends, receives, delivery status, directory lookup, transcripts, channel history | CRM stores opaque refs, safe projections, ContactId links, send policy decisions, audit |
| Sender observations | Hybrid | ACL-normalized sender/conversation events from Gateway runtime | `ChannelIdentity`, exact verified auto-link, UnknownContact shell, suggestions, merge audit |
| Contact and Account records | Opzava-owned | None required | Contact/Account truth, PII lifecycle, account links, summaries, authorization, audit |
| Customer timeline | Hybrid | Runtime channel observations and read-through transcript detail | `Activity` projections, safe snippets, Contact/Ticket links, retention and erasure behavior |
| Support Ticket workflow | Hybrid | Channel send/read, agent sessions/tasks, channel health | Ticket truth, SLA, queue, priority, assignment, reply review, approval, audit |
| Support `AgentEmployee` work | Hybrid | Delegate agents, sessions, tools, channel bindings, task ledger, runtime refs | Employee identity/policy, assignment admission, support queue scope, approval rows, attribution |
| Project support cards | Hybrid | Optional runtime task/session/artifact projections | `pm.Card` and Ticket links/projections, evidence metadata, review gates, user-facing board state |
| Deals and Pipeline | Opzava-owned | None required | `Deal`, `Pipeline`, `Stage`, Account/Contact refs, activity, audit |
| Consent | Opzava-owned with channel webhook inputs | Provider opt-out/bounce/complaint observations through ACL | Consent truth, send-time eligibility, suppression, proof refs, audit |
| Segments | Opzava-owned | None required for materialized membership | Saved CRM specs, materialized member ids, freshness, send-time consent handoff |
| Outbound support send | Hybrid | OpenClaw channel send APIs through broker | Contact resolution check, consent/purpose check, Ticket state, approval policy, idempotency, audit |
| GDPR Gateway scrub | Hybrid | Gateway admin/ACL scrub/delete channel history for known sender identities | Erasure request, Opzava scrub, receipts, terminal state, retained-by-policy decisions |
| Knowledge/memory scrub | Hybrid | OpenClaw memory/wiki/vector derived indexes via Knowledge adapters | CRM erasure trigger, source-of-truth scrub, rebuild receipts, audit |
| Runtime errors/degraded states | Hybrid | Gateway errors, channel status, circuit breaker, protocol mismatch | User-visible CRM/Ticket states, retry policy, incidents, support workflow continuity |

## Acceptance criteria

- Contacts list/detail renders authorized Contact records with profile, lifecycle, owner, account links, consent summary, channel identity summary, open tickets, deals, timeline, merge/resolution state, erasure state, and loading/empty/no-match/forbidden/offline/error states.
- Accounts list/detail renders company profile, hierarchy, owner, contacts, deals, tickets, account activity summary, health/risk, and authorized actions.
- `SenderSeen` with exactly one verified tenant-scoped `ChannelIdentity` auto-links to that Contact and appends Activity idempotently.
- `SenderSeen` without an exact verified match creates or reuses an UnknownContact shell with a stable ContactId and visible unresolved state.
- Partial, duplicate, unverified, display-name, phone/email, dedupe-fingerprint, and AI-similar candidates never auto-merge and appear only as suggestions.
- Contact merge requires confirmation, evidence, conflict review, authorization, idempotency, and audit, and never crosses tenants.
- No external conversation, Activity, or Ticket write persists without tenant scope and a resolved-or-shell ContactId.
- CRM domain rows outside `ChannelIdentity` do not store raw provider sender ids or provider-specific identity fields.
- Contact timeline shows safe projected Activities from external channel observations, support updates, notes, calls, deal changes, consent changes, merge/resolution events, and erasure/scrub states.
- Live transcript detail is fetched through the ACL where authorized and degrades clearly when Gateway or runtime detail is unavailable.
- Ticket queue/board renders status, queue, priority, SLA, Contact, Account, channel, assignee Support `AgentEmployee`, reply-ready state, UnknownContact state, and Gateway/degraded state.
- Ticket creation from support intent or human action is idempotent and links Contact/shell, conversation ref, queue, SLA, and assigned Support `AgentEmployee`.
- Ticket reply workflow re-checks Contact resolution, consent/purpose policy, channel binding, approval requirements, tenant lifecycle, rate/spend caps, and idempotency before send.
- Ordinary Support T2 sends are attributed to the Support `AgentEmployee`; refunds, account changes, PII export, legal language, Contact merges, consent changes, and escalations require approval.
- Failed or blocked support sends preserve drafts and write safe Ticket activity/audit events.
- Linked `pm.Card` support surfaces display Ticket and Contact projections without making project card status the Ticket source of truth.
- `essential-card.html`-style Quality Review can approve/send customer replies only through CRM Ticket commands and required approval checks.
- Deals render pipeline/stage, value, owner, close metadata, Account, primary Contact, next activity, support risk, and audit history.
- Pipeline/Stage versioning preserves historical stage meaning after stage label/order changes.
- Consent admin displays per-channel/purpose status, source/proof, revocation, suppression, legal hold, and audited change history.
- Every outbound marketing/campaign send re-checks current Consent at send time, even when Segment membership is stale.
- Opt-out, bounce, spam complaint, manual suppression, legal hold, and admin changes update Consent and suppress future sends according to purpose policy.
- GDPR erasure creates an idempotent request, records a PII-free tombstone, scrubs/anonymizes Opzava CRM data according to retention, calls Gateway scrub where allowed, triggers Knowledge memory scrub/rebuild, and exposes terminal receipt state.
- Erased Contacts render anonymized/restricted data consistently in Contact, Account, Ticket, Activity, Deal, and linked project-card projections.
- Role revocation removes access to CRM/support/timeline/transcript/consent/erasure detail on reload and realtime reconnect.
- All CRM/support screens provide loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, partial projection, and retry states.
- Keyboard, screen-reader, and mobile behavior satisfy the UX walkthrough and net-new CRM screen requirements.

## Testing decisions

- Tests should cover external behavior through CRM/External Channels application services, route/server actions, projection read models, ACL port fakes, and UI composition; they should not assert raw OpenClaw DTOs, raw provider payloads, or Gateway storage.
- The highest-value seam is the CRM application service that admits sender observations, Contact resolution, UnknownContact shell creation, Ticket creation/update, reply send, Contact merge, Consent mutation, Deal mutation, and erasure workflow commands.
- Sender resolution tests should cover exact verified auto-link, no-match shell creation, shell reuse, partial/unverified candidate suggestions, duplicate event idempotency, cross-tenant isolation, browser-supplied external id rejection, and no provider-id leakage into domain rows.
- Timeline projection tests should cover inbound/outbound Activity creation, duplicate/out-of-order events, safe snippet rendering, transcript read-through degraded states, GatewayUnavailable/CircuitOpen/ScopeDenied/ProtocolMismatch handling, and erasure/anonymized projections.
- Ticket tests should cover support-intent creation, human-created tickets, SLA timers, queue routing, Support `AgentEmployee` assignment, UnknownContact ticket creation, status transitions, linked `pm.Card` projection, reply draft versions, review/approve/send, and failed send preservation.
- Support AI tests should fake `OpenClawGatewayPort` and AI Workforce ports to assert channel binding checks, autonomy tier behavior, approval requirements for high-risk actions, attribution, assignment audit, and no impersonation.
- Consent tests should cover per-channel/purpose records, opt-in/opt-out, bounce, spam complaint, manual suppression, legal hold, admin mutation approval, send-time eligibility, stale Segment membership denial, and audit.
- Deal/Pipeline tests should cover stage version refs, deal stage changes, Account/Contact links, activity append, support-risk projections, close/reopen, and authorization.
- Merge tests should cover evidence capture, conflict fields, snapshots/tombstone refs, idempotency, rollback metadata where available, rejection of cross-tenant merge, and post-merge timeline/ticket/deal projection behavior.
- Erasure tests should cover idempotent request creation, Opzava PII scrub/anonymization, FK skeleton retention, Gateway scrub request/receipt, Knowledge memory scrub request/receipt, terminal states, retained-by-policy state, failed-needs-review state, and active Ticket restriction.
- UI tests should cover Contacts, Accounts, UnknownContact resolution, Ticket queue, Ticket detail, reply review/send, Deal pipeline, Consent panel, and erasure workflow once net-new designs exist.
- Existing mockup-derived UI tests should cover support projection behavior in `essential-card-table.html`, `essential-card.html`, `task-board.html`, internal support links from `essential-team-room.html`, and conversation separation from `messages-slack.html`/`essential-messages.html`.
- Accessibility tests should cover semantic tables/lists/timelines/boards/dialogs, focus return, keyboard move menus, merge confirmation, consent radiogroups or controls, erasure alert dialogs, live SLA/status announcements, non-color-only status, and mobile layout containment.
- Security tests should cover authorization re-checks, RLS tenant context behavior where available, role revocation, PII policy, browser-supplied ref rejection, raw provider payload redaction, secret absence, audit emission, and sanitized rendering of customer/AI text.
- Prior-art seams to follow are PRD-003 project/card tests, PRD-004 collaboration/activity tests, PRD-006 AI Workforce/task/run tests, PRD-007 Knowledge scrub/rebuild tests, and PRD-009 consent/report handoff patterns.

## Dependencies

- ADR-011 for CRM truth, `ChannelIdentity`, UnknownContact shell behavior, conservative Contact resolution, support Ticket aggregate, Consent, segments, and GDPR erasure.
- ADR-008 for Support `AgentEmployee`, autonomy defaults, channel bindings, assignment, persona attribution, and tool-policy-backed AI workforce behavior.
- ADR-003 for the `gateway-broker` ACL, tenant-bound OpenClaw access, operator credentials, normalized channel events, and admin/provisioning scrub calls.
- ADR-004 for Opzava Postgres as system of record, projections, outbox, and hybrid CQRS boundaries.
- ADR-005 for tool-policy-first security, approval gates, and high-risk action controls.
- ADR-007 for tenant-scoped authorization and RLS expectations.
- ADR-009 and PRD-004 for internal collaboration, project Team rooms, Activity, notifications, realtime delivery, and separation from external channels.
- ADR-010 and PRD-007 for CRM-derived knowledge candidates, derived memory/wiki/vector indexes, scrub/rebuild behavior, and object/source refs.
- ADR-012 and Marketing PRDs for Approval rows, Department Workflow handoffs, Segment consumers, campaign/report touchpoints, and send-time consent use.
- PRD-003 for `pm.Card`, board/card/evidence/quality-review behavior, and the `pm.Card` versus OpenClaw Workboard boundary.
- PRD-006 for AI task board, run trace, Support employee operations, tool/catalog health, and assignment/run projection language.
- Tenant Provisioning/Platform-Ops for Gateway lifecycle, admin-token usage, channel scrub jobs, drift/receipt handling, and deprovisioning interactions.
- Identity & Access for org membership, role grants, PII/legal action authorization, session revocation, and audit actor identity.
- Notifications/Admin-Observability for SLA alerts, scrub failures, policy denials, incident surfacing, and push delivery.
- Net-new design work for CRM home, Contacts, Accounts, UnknownContact resolution, Ticket queue/detail, external conversation panel, Deal pipeline/detail, Consent admin, and GDPR erasure workflow.
