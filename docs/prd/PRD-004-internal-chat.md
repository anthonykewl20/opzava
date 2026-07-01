# PRD-004: Internal chat, DMs, project team rooms, mentions, activity, and notifications

## Problem

Opzava needs a dependable collaboration layer where people can talk inside project team rooms, send direct messages, follow threaded decisions, react quickly, see who has read what, and never miss a mention or hand-off. The mockups show Messages, project Team rooms, Activity, project Updates, and notification entry points as first-class everyday surfaces, but the product boundary must stay clear: Opzava owns internal collaboration history, while OpenClaw runtime sessions remain behind the broker.

Without a PRD-level contract, chat can drift into several risky shapes:

- Project rooms, DMs, mentions, approvals, updates, and system notifications could become separate inboxes with inconsistent counts.
- Live WebSocket behavior could be treated as the source of truth instead of a latency path over durable Opzava state.
- AI assistant output could either disappear into Ask Opzava or leak into human rooms without clear participant attribution.
- Push notifications could expose sensitive content or outlive revoked sessions.

The solution is an Opzava-owned Internal Collaboration product surface for Slack-grade channels, DMs, project team rooms, threads, mentions, reactions, read cursors, presence/typing hints, Activity, notification rows, and Web Push delivery. It depends on ADR-009 for realtime, Internal Collaboration aggregates, per-channel sequence, assistant participants, and PWA/Web Push. AI assistants may appear as participants, hand-off actors, or daily-summary authors, but the dedicated assistant conversation UX is specified in PRD-005.

## Goals and Non-goals

### Goals

- Ship Slack-grade internal channels, project team rooms, direct messages, threads, reactions, message search entry points, read cursors, typing, and presence hints.
- Make each Project eligible for one default Team room, surfaced from Messages and the project Team tab.
- Provide DMs between authorized people and, where admitted by policy, assistant participants with clear AI identity.
- Create a single cross-project Activity inbox for mentions, thread replies, assistant hand-offs, approval prompts, and directed collaboration items.
- Keep system/tool/runtime notifications separate from Activity while still sharing shell counts and notification delivery infrastructure.
- Support notification bell counts, in-app notification rows, mark-read state, and Web Push for useful background delivery.
- Make channel ordering, reconnect, optimistic sends, duplicate delivery, and offline queued sends predictable under ADR-009.
- Define data/API touchpoints by bounded context and port without re-stating ADR-009 architecture.
- Define OpenClaw-parity boundaries so OpenClaw channels/sessions are harnessed where useful but never become internal chat storage.
- Define acceptance and testing decisions at user-visible collaboration seams.

### Non-goals

- Build Ask Opzava, project assistant, or assistant conversation orchestration. Those are PRD-005, though this PRD defines how admitted assistant messages appear in chat/activity.
- Build external customer-channel inboxes for Slack, Gmail, WhatsApp, mail, or support conversations. Those belong to External Channels/CRM PRDs.
- Build full project-management comments, card review, board, goal, docs, schedule, or Discovery behavior except for collaboration pointers and events consumed here.
- Build admin alert-rule authoring beyond notification/alert rows and delivery hooks already covered by PRD-002 and later admin PRDs.
- Make presence, typing, or Web Push a correctness, authorization, audit, billing, or workflow-state source.
- Store OpenClaw Agent Session transcripts as the internal chat write model.
- Send sensitive message content in push payloads.

## User Stories

1. As an organization member, I want a Messages hub, so that I can find project rooms and DMs from one place.
2. As an organization member, I want unread counts on Messages, so that I know when team conversation needs attention.
3. As an organization member, I want conversations grouped into Projects and Direct messages, so that project rooms and private conversations are easy to scan.
4. As an organization member, I want to search conversations by name, so that I can jump to the right room or DM quickly.
5. As a project member, I want one Team room for each project, so that project discussion has a default home.
6. As a project member, I want the Team tab inside the project workspace, so that I can talk without leaving project context.
7. As a project member, I want the Team room to show project breadcrumb and member count, so that I know exactly which project room I am in.
8. As a project member, I want a room header action for search, so that I can find earlier decisions in the room.
9. As a project member, I want messages grouped by date, so that the conversation history is readable.
10. As a project member, I want unread dividers, so that I can resume where I left off.
11. As a project member, I want highlighted messages that mention me, so that direct call-outs are visible in the room.
12. As a project member, I want an Activity link from the room, so that I can see every mention across projects.
13. As a project member, I want a sticky composer, so that sending a message is always available at the bottom of the room.
14. As a project member, I want optimistic send status, so that I know whether a message is sending, sent, queued, or failed.
15. As an offline user, I want messages I type to be queued or clearly blocked according to product policy, so that I understand what will happen on reconnect.
16. As a reconnecting user, I want missed room messages backfilled before live updates attach, so that I do not lose messages during browser sleep or network changes.
17. As a project member, I want one-click reactions, so that I can acknowledge a message without adding noise.
18. As a project member, I want reactions to show count and my own selected state, so that lightweight agreement is visible.
19. As a project member, I want message threads, so that side discussions do not overwhelm the main room.
20. As a project member, I want a thread drawer or thread view, so that I can read the parent message and replies together.
21. As a project member, I want thread reply counts, so that I know when a side conversation has activity.
22. As a project member, I want replies to my threads to appear in Activity, so that follow-up work is not missed.
23. As an organization member, I want DMs with people, so that private coordination does not require a project room.
24. As an organization member, I want multi-person DM creation when allowed, so that small private groups can coordinate.
25. As an organization member, I want a New message dialog, so that I can start a DM or post into a project room from one entry point.
26. As an organization member, I want recipient search with people and project rooms, so that compose works without memorizing names.
27. As an organization member, I want selected recipients shown as removable chips, so that I can verify who will receive the message.
28. As an organization member, I want project-room posting as a destination option, so that I can broadcast to a project from compose.
29. As an organization member, I want validation when recipient or body is missing, so that empty or misaddressed messages are not sent.
30. As a keyboard user, I want compose recipient search and mention pickers to support arrow keys, Enter, and Escape, so that I can write without using a mouse.
31. As a project member, I want @mention autocomplete for people, assistants, and room-wide targets, so that call-outs resolve to real participants.
32. As a project member, I want @team or @channel mentions to be permission-gated, so that broad notifications are controlled.
33. As a mentioned user, I want every mention to create an Activity item, so that mentions across rooms and DMs collect in one place.
34. As a mentioned user, I want Activity to show the actor, source room/project, snippet, time, and action, so that I can decide what to open.
35. As a mentioned user, I want Activity filters for All, For you, Approvals, and Following, so that I can focus on the right directed work.
36. As a mentioned user, I want unread dots and mark-read state in Activity, so that I know what I have already handled.
37. As a mentioned user, I want Mark all read with an undo affordance, so that bulk clearing is safe.
38. As a user following work, I want followed project/thread/to-do updates in Activity, so that awareness updates are separate from direct mentions.
39. As a user with no Activity items, I want an all-caught-up empty state, so that I know nothing needs attention.
40. As a first-time Activity user, I want a distinct Following empty state, so that I understand how followed updates appear.
41. As a reviewer, I want AI hand-offs and approval prompts in Activity, so that assistant-completed work reaches the right human.
42. As a reviewer, I want AI hand-offs labeled with assistant identity, so that I know whether a person or assistant needs me.
43. As a project member, I want AI assistants to appear as participants when policy admits them into chat, so that assistant-authored collaboration is attributed.
44. As a project member, I want assistant messages to carry assistant persona attribution, so that AI output is not confused with human messages.
45. As a project member, I want dedicated assistant conversation links to point to PRD-005 surfaces, so that team rooms do not become the primary Ask assistant UX.
46. As a project member, I want assistant daily summaries to appear in Updates or room callouts with clear AI labeling, so that catch-up content is visible but not mistaken for human chat.
47. As a project member, I want Project Updates to show chronological work events, so that I can understand what happened without reading every message.
48. As a project member, I want a pinned daily summary in Updates, so that I can catch up quickly.
49. As a project member, I want Updates to show human, assistant, and system actors with clear glyphs/labels, so that source is understandable without relying on color.
50. As a project member, I want Updates to show waiting-on-you bands, so that overdue approvals or reviews are easy to clear.
51. As an admin/full-shell user, I want a live Activity feed across the fleet, so that operational work remains observable.
52. As an admin/full-shell user, I want Activity filters for agents, approvals, and system events, so that runtime and business events are separable.
53. As an organization member, I want notification bell counts to update live, so that unread notifications are visible from the shell.
54. As an organization member, I want Notifications for system/tool/project updates, so that non-conversation alerts do not bury mentions.
55. As an organization member, I want mentions and hand-offs routed to Activity instead of Notifications, so that directed collaboration has one inbox.
56. As an organization member, I want notification rows to deep-link to the source work, so that alerts are actionable.
57. As an organization member, I want mark-read state for notifications, so that the bell count reflects real attention.
58. As an offline or backgrounded user, I want Web Push for DMs, mentions, assistant completions, approvals, and important alerts when allowed, so that I can return to time-sensitive work.
59. As a privacy-conscious user, I want push payloads to be safe hints only, so that sensitive message content is fetched only after normal session validation.
60. As an organization owner, I want push delivery suppressed after session revocation, role changes, tenant suspension, device disablement, or preference changes, so that stale devices do not receive private work.
61. As a user, I want per-channel notification preferences and mute state, so that busy rooms do not overwhelm me.
62. As a user, I want DMs and direct mentions to bypass ordinary room mute according to preference, so that important call-outs still arrive.
63. As a user, I want presence dots in DM lists for humans, so that I have a lightweight signal before starting a private conversation.
64. As a user, I want typing indicators in rooms and DMs, so that live conversation feels responsive.
65. As a user, I want presence and typing to expire naturally, so that stale live hints do not imply durable facts.
66. As a mobile user, I want the Messages hub and Team room to collapse into usable list/detail views, so that chat works on small screens.
67. As a screen-reader user, I want message logs, activity rows, unread counts, and live updates announced semantically, so that collaboration is accessible.
68. As a project Guest-Client, I want only permitted project rooms and participants visible, so that internal rooms, DMs, and assistant activity stay private.
69. As an organization owner, I want role changes to immediately affect channel membership, message reads, search, Activity, notifications, and push delivery, so that revoked access fails closed.
70. As a product operator, I want internal chat history, mentions, reactions, read cursors, Activity, and notifications to survive Gateway downtime, so that collaboration is available when runtime is degraded.
71. As a developer, I want per-channel sequence and cursor semantics tested, so that duplicate live events and reconnect gaps do not corrupt chat state.
72. As a developer, I want collaboration tested through application ports and UI composition, so that tests protect behavior without coupling to component internals.

## UX Walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `essential-messages.html` | Essential Messages hub with top bar, unread Messages and Activity counts, conversation search, project-room list, Direct messages list, human presence dots in DMs, New message entry, selected room pane, unread dividers, mention highlight, reaction, composer, offline queued-message banner, loading/empty states, and link to Activity mentions. The implementation must update the mockup's "humans only" note: project rooms stay human-centered, but admitted assistant participants and assistant-originated collaboration events may appear with explicit AI attribution. |
| `messages-slack.html` | Full/admin Slack-grade 3-pane layout with channel/DM sidebar, unread counts, channel header, Find in messages action, hover actions, reactions, thread drawer, composer, realtime connection banner, mobile collapse, and grouped message history. This informs dense/admin collaboration behavior while Essential remains calmer. |
| `essential-team-room.html` | Project Team tab with breadcrumb, project header, project tabs, room metadata, Activity mention pointer, assistant daily-summary callout, explicit link to Ask your assistant, loading/error/offline/empty states, message log, typing indicator, mention picker, reactions, and sticky composer. The Team room is the default project-scoped internal room. |
| `mention-inbox.html` | Essential Activity inbox for directed work: For you, Approvals, Following filters; human mentions, thread replies, AI hand-offs, approval prompts, read/unread rows, project/source context, action buttons, mark-all-read with undo, loading/error/offline/empty states, and clear separation from Notifications and Ask Opzava. |
| `essential-compose.html` | New message dialog over Messages with destination toggle for Direct message vs Post in a project room, recipient chips, live people/project-room suggestions, project-room picker, message body, attachment affordance, AI/help note, validation, keyboard combobox behavior, Cancel, and Send. |
| `essential-updates.html` | Project Updates feed with breadcrumb, filter, waiting-on-you band, loading/empty/error states, pinned assistant daily summary, chronological human/assistant/system events, project work links, and daily close note. This is an activity projection for project history, not the chat write model. |
| `activity.html` | Full/admin Activity feed across the fleet with admin rail, live indicator, notification count, filters, role=log stream, human/AI/system actor glyphs, timestamps, approvals, task/runtime/project events, and no primary CTA. This consumes durable activity projections plus live fan-out. |

## Functional Requirements

### Channels, rooms, and DMs

- Internal Collaboration must own internal channels, project rooms, DMs, memberships, messages, threads, mentions, reactions, read cursors, and durable chat ordering.
- Supported channel kinds must include public/internal rooms, private rooms, project rooms, and DMs.
- Each active Project must be able to expose one default Team room when the actor can access that project and the Team tool is enabled.
- Project-room membership must derive from project access plus channel membership policy; private rooms and DMs must use explicit membership.
- Channel and DM lists must be filtered by active organization, tenant lifecycle, membership state, project grants, and channel visibility.
- DMs must support one-to-one human DMs first and may support small group DMs where membership policy allows.
- Assistant participants may appear in channels, DMs, Activity, and Updates only when admitted by ADR-008 policy and PRD-005 assistant flow rules.
- Channel list rows must expose title/name, kind, unread count, last-message preview when allowed, project context where applicable, and mute/notification state where needed.
- Messages, Activity, and project Team routes must render loading, empty, error/retry, forbidden, offline/reconnecting, and stale/cached states.
- Missing tenant context or revoked channel/project access must render forbidden or remove the conversation, not a misleading empty chat.

### Messages, ordering, and send lifecycle

- Every durable message must receive a monotonically increasing sequence scoped to its channel, per ADR-009.
- Message send commands must accept an idempotency key and reconcile optimistic client rows to the final message id and sequence.
- The UI must show clear send states for sending, sent, queued/offline, and failed with retry.
- Reconnect must backfill missed durable events by channel sequence or appropriate inbox cursor before the client treats the subscription as live.
- Clients must deduplicate live and backfilled events by event id, message id, and send idempotency key.
- Message rows must show actor identity, author type, timestamp, body/content blocks, edit/delete state where supported, and any linked target refs.
- Message deletion and edit behavior must preserve audit needs and must not remove mention/read/reaction correctness; product policy may decide whether deleted content remains visible to admins.
- Message body rendering must sanitize user content, links, mentions, and attachment labels.
- Message search entry points are required; actual global Find behavior remains aligned with PRD-002.

### Threads and reactions

- Threads must be rooted in one channel message and preserve the parent message, replies, reply count, last reply timestamp, and unread state.
- Thread replies must be ordered and backfilled with the same per-channel correctness guarantees as main-channel messages.
- Replies to a user-owned or followed thread must create Activity entries according to notification/follow preferences.
- Reactions must be durable child records keyed by message, actor, and reaction kind.
- The first implementation should support the reaction set represented by the mockups, with the domain model able to support additional reaction kinds later.
- Reaction toggles must be idempotent, fan out live, and reconcile after reconnect.
- Reaction display must show aggregate count and whether the current user reacted.

### Mentions and Activity inbox

- Mentions must be created transactionally with the source message, assistant hand-off, approval prompt, or workflow notification.
- Mentions may target a user, an assistant participant where policy allows, or a room-wide target such as team/channel where the actor has permission.
- Activity must collect directed collaboration items: mentions, AI hand-offs, approval prompts, thread replies, and followed-work updates.
- Activity must not be the generic system/tool notification inbox; those rows belong to Notifications.
- Activity rows must include actor, actor type, source room/project/work item, snippet or safe summary, time, read state, and primary action.
- Activity filters must include All, For you, Approvals, and Following.
- Mark individual Activity row read must happen when the user opens or explicitly clears the row.
- Mark all read must be supported with a short undo affordance where feasible.
- Activity unread counts must update the Essential top bar and reconcile from durable state after reconnect.
- Activity snippets must be authorization-filtered and must not leak content from revoked rooms/projects.

### Presence, typing, and live state

- Presence and typing are ephemeral hints under ADR-009 and must not be persisted as domain facts.
- Human presence may appear in DM lists and participant pickers; ordinary message rows should avoid noisy presence indicators.
- Assistant availability may be shown as workforce/projection status, not as human presence.
- Typing indicators may appear in open rooms, DMs, and threads with TTL expiry.
- Presence and typing must expire cleanly on browser sleep, mobile backgrounding, disconnect, deploy drain, or missing heartbeat.
- Live/reconnecting banners must explain when messages or Activity may be delayed.

### Project Updates and activity feed

- Project Updates must be a durable project activity projection assembled from Project Management, Internal Collaboration, AI Workforce, Department Workflows, Knowledge Management, and Notifications/Admin-Observability events.
- Updates must show human, assistant, and system actors with clear labels/glyphs, project-work links, grouped dates, loading/empty/error states, and filters where supported.
- Assistant daily summaries may appear as pinned update cards when produced through admitted assistant flows; summary generation UX belongs to PRD-005.
- Waiting-on-you bands in Updates must link to the owning review, approval, card, or My stuff action.
- Full/admin Activity must show a cross-fleet feed for authorized admin/full users and must not expose tenant or project events beyond their grants.
- Runtime-derived events in admin Activity must be projected or broker-read according to ADR-004/ADR-009; internal collaboration history remains Opzava-owned.

### Notifications and Web Push

- Notification bell counts must include notification unread count and must remain separate from Activity mention counts where the shell displays both.
- Notifications must cover system/tool/project updates, assistant completions, approval-needed prompts, task assignments, incident/admin-card alerts, and other non-chat events where appropriate.
- Mentions, AI hand-offs, approval prompts, and thread replies that are directed collaboration items must appear in Activity; notification rows may deep-link or mirror only when product policy requires background delivery.
- Notification rows must include type, source, project context when applicable, time, read state, and primary action.
- Mark-read and mark-all-read must update durable notification state and shell counts.
- Web Push must be available for DMs, mentions, assistant completions, approvals, task assignments, and important alerts when user/device/session/preferences allow.
- Push subscription binding, rotation, revocation, and enqueue checks must follow ADR-006 and ADR-009.
- Push payloads must carry safe hints only: notification id, coarse type, tenant/org hint, collapse/dedup key, and fetch-on-open instruction.
- Opening a push notification must fetch details through normal authenticated server paths and re-check authorization.
- Push delivery must be suppressed for revoked/expired sessions, disabled devices, removed memberships, changed role versions, suspended tenants, muted channels, and disabled notification preferences.

### Accessibility and responsive behavior

- Message logs and Activity/admin feed streams must use appropriate log/feed semantics and polite live regions.
- Counts, unread state, actor type, source, status, and severity must be understandable without color alone.
- Composer, recipient search, mention picker, reaction buttons, thread controls, filters, and mark-read actions must be keyboard accessible.
- Focus must return to the invoking control when dialogs, thread drawers, and pickers close.
- Mobile Messages must support a usable list/detail flow or stacked equivalent without hiding unread/action state.
- Text in compact buttons, badges, and rows must not overlap or rely on hover-only access.

## Data and API Touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Channel directory and memberships | Internal Collaboration with Identity & Access authorization | Channel list, DM list, project room membership, mute/notification preference, archived state, participant directory visibility | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Project Team room | Internal Collaboration with Project Management | Project-room lookup/provisioning, project member visibility, Team tab unread count, room metadata, project-context links | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Message send/history | Internal Collaboration | Message command, idempotency key, channel sequence, message history page/backfill, edit/delete metadata, optimistic reconciliation | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Threads | Internal Collaboration | Thread root, replies, reply counts, thread read cursor, followed-thread activity entries | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Reactions | Internal Collaboration | Reaction toggle command, message reaction aggregates, current-user reaction state, live fan-out | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Mentions and Activity inbox | Internal Collaboration with Notifications/Admin-Observability | Mention rows, directed activity rows, read/clear state, filters, source snippets, mark-all-read undo window | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Presence and typing | Internal Collaboration through broker | Heartbeats, typing frames, participant TTL hints, reconnect/expiry behavior | `RealtimeTransportPort`, `AuthorizationPort` |
| Assistant participants in chat | AI Workforce with Internal Collaboration | `AgentEmployee` participant refs, persona attribution, admitted assistant message refs, assignment/dispatch refs, safe activity hand-offs | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Assistant conversation handoff | AI Workforce and PRD-005 surfaces | Links from team rooms/messages to Ask Opzava or project assistant, not the dedicated assistant chat UX itself | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Project Updates | Project Management as project activity consumer, with contributing contexts | Project activity read model, daily summary refs, waiting-on-you bands, chronological events, filters | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Full/admin Activity | Notifications/Admin-Observability with contributing contexts | Cross-fleet activity read model, runtime/project/workflow/system events, filters, live indicator, admin route gating | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `OpenClawGatewayPort` for harnessed runtime projections |
| Notifications inbox and bell | Notifications/Admin-Observability | Notification rows, unread count, mark-read, action targets, shell count updates, reconnect reconciliation | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Web Push devices and delivery | Notifications/Admin-Observability with Identity & Access | Push subscription metadata, server-side session binding, device state, preference checks, enqueue/suppress/dedup/collapse | `AuthPort`, `AuthorizationPort`, `PushNotificationPort`, `EventBusPort` |
| Attachments in compose/messages | Internal Collaboration with Knowledge Management/Object Storage | Attachment metadata, safe file refs, upload refs, authorization checks, source links | `ObjectStorePort`, `KnowledgeSourcePort`, `AuthorizationPort`, `EventBusPort` |
| Search entry points | Internal Collaboration with PRD-002 Find | Conversation search, message search, participant search, project room search, authorized snippets | `AuthorizationPort`, `KnowledgeIndexPort`, `EventBusPort` |

## OpenClaw-parity Notes

| Feature area | Classification | Native harnessed vs Opzava-owned decision |
| --- | --- | --- |
| Internal channels and project team rooms | Opzava-owned | Channel identity, membership, message history, room lifecycle, project-room mapping, and authorization are Internal Collaboration state in Opzava Postgres. |
| Direct messages | Opzava-owned | DMs are Opzava internal channels with explicit membership and durable history. They do not use OpenClaw channel storage. |
| Message sequence, read cursors, mentions, reactions, and threads | Opzava-owned | These are Internal Collaboration aggregates/read models and must remain correct without a tenant Gateway. |
| Realtime fan-out | Hybrid | ADR-009 broker WS/Redis/outbox path is harnessed for live delivery. Durable Opzava rows and cursors are the correctness source. |
| Presence and typing | Hybrid ephemeral | Broker/Redis TTL hints are harnessed for live feel. Opzava does not persist presence or typing as domain truth. |
| Assistant participants in chat | Hybrid | AI Workforce owns `AgentEmployee` identity and policy. OpenClaw sessions/runs are harnessed through the broker. Internal Collaboration owns final admitted messages, mentions, and activity refs. |
| Dedicated assistant conversation UX | Out of scope here | PRD-005 owns Ask Opzava and project assistant conversation surfaces. This PRD only defines how their admitted outputs, hand-offs, and participant attribution appear in collaboration surfaces. |
| Agent token streaming | Native harnessed | Live tokens are OpenClaw runtime data through the broker. They become durable chat/activity only when an admitted assistant message, summary, hand-off, or projection is finalized. |
| Project Updates | Opzava-owned projection with hybrid inputs | Project activity and daily-summary refs are Opzava read models. Runtime events may enrich them only through ADR-004 projections. |
| Notifications and Activity | Opzava-owned with hybrid inputs | Notification rows, mention rows, unread counts, and preferences are Opzava-owned. Runtime alert/completion inputs are projected from OpenClaw signals through the broker. |
| Web Push | Opzava-owned adapter | Push bindings, preferences, enqueue checks, and payload policy are Opzava-owned behind `PushNotificationPort`; browser/platform push is only the delivery adapter. |
| External customer channels | Out of scope/hybrid elsewhere | Slack/Gmail/WhatsApp/customer conversations are External Channels/CRM concerns. Internal chat may link to them but does not own provider connectivity or credentials. |

## Acceptance Criteria

- Essential Messages shows project rooms and DMs with unread counts, conversation search, New message entry, loading/empty/error/offline states, and authorized visibility only.
- Each accessible Project can open its Team room from the project Team tab and from Messages.
- Project Team room renders breadcrumb, project header, tabs, room metadata, Activity mention pointer, messages, unread divider, composer, reaction, mention picker, typing state, and async states.
- Full/admin Messages can render the Slack-grade 3-pane layout with channel/DM sidebar, message pane, thread drawer, hover actions, composer, and reconnect banner.
- New message dialog supports Direct message and Post in a project room destinations, recipient search/chips, room picker, body validation, attachment affordance, Cancel, and Send.
- Sending a message is idempotent and reconciles optimistic UI state to one durable message id and one channel sequence.
- Reconnect backfills missed channel messages, thread replies, Activity rows, and notification rows before live attach is treated as current.
- Duplicate live/backfill events do not duplicate messages, reactions, mentions, Activity rows, or notification rows.
- Threads preserve parent message, replies, reply counts, and thread unread/read state.
- Reactions can be toggled, display count/current-user state, fan out live, and reconcile after reconnect.
- Mention autocomplete resolves only authorized people, assistants, and room-wide targets; forbidden targets are not shown or accepted.
- A direct @mention creates one Activity item with source context, snippet, unread state, and an Open action.
- AI hand-offs and approval prompts appear in Activity with assistant attribution and Review actions.
- Activity filters All, For you, Approvals, and Following behave as named and support empty states.
- Activity mark-all-read updates unread state and provides an undo affordance where the UI can safely restore prior state.
- Project Updates shows waiting-on-you band, pinned assistant daily summary, chronological events, actor labels, loading/empty/error states, and links to source work.
- Full/admin Activity shows authorized fleet events with live indicator, filters, actor labels, and no unauthorized tenant/project data.
- Notification bell count updates live and reconciles from durable notification state after reconnect.
- Notifications remain separate from Activity for system/tool/project alerts, while mentions and hand-offs route to Activity.
- Web Push is delivered only after session, device, membership, tenant lifecycle, preference, and authorization checks.
- Push payloads contain no sensitive message, project, file, or customer content.
- Revoked access removes conversations, snippets, Activity rows, notification detail, and push delivery on reload/reconnect and server fetch.
- Presence and typing expire naturally and are never used for authorization, audit, workflow state, billing, or delivery guarantees.
- Keyboard and screen-reader behavior works for compose, filters, message logs, reactions, threads, mention picker, recipient picker, mark-read actions, and counts.
- Mobile layouts preserve list/detail navigation, unread state, source context, composer access, and action buttons.

## Testing Decisions

- Test at the highest product seams: Internal Collaboration application commands/queries, authorization-gated routes/server actions, read-model/projector behavior, realtime reconnect contract, and UI composition for the named workflows.
- Tests should assert external behavior: visible rooms, messages, unread counts, Activity rows, notification rows, send states, forbidden states, emitted events, and read-model updates. Do not assert component internals or CSS details.
- Channel and membership tests must cover project-room derivation, explicit DM membership, private/public visibility, archived rooms, Guest-Client restrictions, missing tenant context, and role revocation.
- Message tests must cover send validation, idempotency, optimistic reconciliation, per-channel sequence, pagination/backfill, edit/delete policy, forbidden sends, offline queued/failed states, and sanitized rendering.
- Reconnect tests must cover missed live events, duplicate delivery, out-of-order live delivery, sequence gap backfill, and attach-after-backfill behavior.
- Thread tests must cover parent/reply rendering, reply counts, thread read cursor, Activity row creation for replies, and authorization on source snippets.
- Reaction tests must cover toggle idempotency, aggregate counts, current-user state, duplicate event handling, and forbidden reaction attempts.
- Mention tests must cover people, assistants, broad-room targets, permission gating, transactional Activity creation, snippet redaction after revocation, and mark-read behavior.
- Activity tests must cover filters, unread/read rows, mark all read with undo, all-caught-up empty state, Following first-use empty state, loading/error/offline states, and shell count updates.
- Assistant participant tests must cover attribution, policy denial, assignment/dispatch refs, finalized assistant message creation, hand-off Activity rows, and PRD-005 deep-link behavior without testing PRD-005 conversation internals.
- Project Updates tests must cover projected human/assistant/system events, pinned daily summary refs, waiting-on-you links, stale projection labels, and empty/error states.
- Notification/Web Push tests must cover unread counts, mark-read, preference/mute behavior, push enqueue suppression, safe payload shape, fetch-on-open authorization, dead subscription handling, and revoked session/device behavior.
- Presence/typing tests must cover heartbeat, TTL expiry, browser sleep/reconnect, multi-device state, and absence of durable writes.
- Accessibility tests must cover role=log/feed semantics, live announcements, focus management, keyboard operation, count announcements, and labels/glyphs not relying on color alone.
- Do not test OpenClaw RPC protocol behavior in Internal Collaboration tests. Use projected assistant/runtime fixtures and cover broker/ACL protocol behavior in the owning integration suites.

## Dependencies

- ADR-009: Realtime WS hub, internal chat aggregates, per-channel sequence, assistant participants in chat, Activity/mention fan-out, PWA, and Web Push.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections for durable chat/activity/notification read models and runtime projections.
- ADR-006: Better Auth, revocable sessions, and PWA auth constraints for push subscription binding and fetch-on-open behavior.
- ADR-007: Resource-scoped RBAC and Postgres RLS for organization/project/channel visibility, Guest-Client behavior, and fail-closed access.
- ADR-008: AI Workforce, personas, `AgentEmployee`, `AgentDispatch`, and assistant attribution/admission policy.
- ADR-010: Knowledge Management only where message attachments, docs links, and searchable project-update/source refs cross into knowledge surfaces.
- PRD-002: App shell, navigation, global Find, notification bell, Essential Notifications, project switcher, and shell count placement.
- PRD-003: Projects, Team tab entry, project Updates source events, project comments/activity pointers, cards, approvals, docs, schedules, and My stuff links.
- PRD-005: Ask Opzava and project assistant conversation UX; required for dedicated assistant chat flows linked from Messages and Team rooms.
- Notifications/Admin-Observability bounded context for notification rows, admin/fleet Activity, alert/admin-card inputs, and push delivery policy.
- Department Workflows bounded context for approval prompts, generated-content lifecycle, workflow hand-offs, and assistant completion events that appear in Activity or Notifications.
