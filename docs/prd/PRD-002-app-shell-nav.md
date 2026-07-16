# PRD-002: App shell, navigation, command palette, search, and project switcher

> **Admin Control Center ownership amendment (2026-07-16):** PRD-002 continues to own the shared
> authenticated shell infrastructure, route admission and authorization plumbing, responsive shell
> behavior, global search/command-palette behavior, notification plumbing, and the Essential/user
> shell. PRD-020, **Admin Control Center — shell, navigation, and overview composition**, owns the
> Admin-only navigation hierarchy, Admin Overview, Admin topbar composition, and exact Admin route
> placement. The former Admin target built around Operate/Projects/Observe/Automate/Govern groups, a
> project rail, and the `shell-overview.html` dashboard is superseded target IA and remains only
> historical/migration evidence. This amendment does not change Essential/user-shell semantics. In
> the target Admin topbar, platform/readiness health and the attention count/feed are separate
> concerns; OpenClaw health is one contributing detail source, not the global health meaning.

## Problem

Opzava needs one dependable way for people to enter the product, understand what needs attention, switch between projects, search across their work, and receive realtime notifications without exposing OpenClaw as a client-facing product surface.

The current mockups define two related experiences:

- Essential: the calm everyday PWA experience for normal users, centered on Home, My stuff, Messages, Activity, Ask Opzava, Find, projects, and notification needs.
- Admin shell: the operator experience composed from this PRD's shared shell infrastructure and the Admin-only hierarchy, Overview, and topbar contract owned by PRD-020.

Without a PRD-level contract, navigation, search, project visibility, notification counts, and empty/error states can drift across screens. That would make the product feel inconsistent, create security risk around project-scoped visibility, and make the shell depend too heavily on live OpenClaw availability.

The solution is a responsive PWA app shell with Opzava-owned navigation, project switching, dashboards, search/read models, notifications, and empty states. OpenClaw runtime signals are harnessed only through the broker and projected where needed, per ADR-004, ADR-007, and ADR-009.

> **Dev Board navigation amendment (2026-07-15, ownership clarified 2026-07-16):** The target Admin shell has one **Dev Board** entry, replacing the separate Tasks and Issues product entries. Inside Dev Board, the canonical views are **Summary, List, Board, Sprints, Docs, Development, and Releases**. PRD-019 and ADR-017 own that surface and its workflow; PRD-020 owns its Admin placement; this PRD owns shared route-admission, global-search, command-palette, and deep-link plumbing. Current `/tasks` and `/issues` routes are migration inputs, not the target information architecture; see `docs/plan/dev-board-migration-manifest.md`.

## Goals and Non-goals

### Goals

- Ship a responsive PWA app shell that works across desktop, tablet, and mobile with stable navigation, loading, empty, offline, and error states.
- Give Essential users a calm top-bar navigation model: Home, My stuff, Messages, Activity, Ask Opzava, Find, New project, notifications, and account.
- Provide the shared responsive, authorization-aware shell primitives consumed by the Admin Control Center without defining its route hierarchy or Overview composition, and do not leak Admin navigation into the Essential experience.
- Make shared search, command-palette, route-admission, and deep-link plumbing recognize the one Dev Board destination and its PRD-019-owned subviews rather than separate Tasks and Issues.
- Make Project the primary child scope for navigation, search, dashboard rollups, and authorization.
- Provide a project switcher that is visible, keyboard-accessible, RBAC-filtered, and safe when cached state points at a stale or revoked project.
- Provide global Find and command palette behavior for projects, tasks/to-dos, people, assistants, files/docs, actions, and recent items.
- Provide Home, All projects, My stuff, Discovery, Notifications, and alert/notification center requirements matching the named mockups.
- Keep notification counts, unread counts, activity badges, project badges, and live indicators backed by durable read models plus realtime fan-out.
- Define explicit data/API touchpoints by bounded context and port.
- Define acceptance and testing decisions at the shell/composition seam.

### Non-goals

- Build full project workspace behavior, boards, cards, goals, schedules, docs, and idea detail workflows beyond shell/list/search entry points. Those belong primarily to the Project Management surface (`pm.Card`, deferred).
- Build full internal chat, DMs, project team rooms, mentions, and Activity inbox behavior beyond shell counts and notification pointers. Those belong primarily to PRD-004.
- Build Ask Opzava conversation orchestration beyond shell entry points, command palette actions, and search affordances. That belongs primarily to PRD-005.
- Build admin monitoring/logs/incidents/security/debug surfaces beyond shell navigation, alert center entry, and notification requirements. Those belong primarily to PRD-012.
- Build Dev Board behavior, local view navigation, workflow counts, or card deep links beyond the shared search/command/route plumbing. Those belong to PRD-019, with Admin placement in PRD-020.
- Build connected tool linking and connect wizard flows beyond Home/tool-status summary and notification entry points. Those belong primarily to PRD-013.
- Build push preference management and service-worker offline policy beyond shell-level PWA and notification delivery hooks. Those belong primarily to PRD-016.
- Introduce a permanent per-user pinning model for projects in this slice. Ship recent projects first; true pins require a user-scoped preferences model.

## User Stories

1. As an everyday member, I want one calm top bar on every Essential screen, so that I always know where Home, My stuff, Messages, Activity, Ask Opzava, and Find live.
2. As an everyday member, I want the app shell to work as an installable PWA, so that I can use Opzava from desktop and mobile without losing the familiar shell.
3. As an everyday member, I want Home to show my projects and what needs me, so that I can start the day from one useful place.
4. As an everyday member, I want Home to show a plain-language summary failure state, so that I know my work is safe even when the summary cannot load.
5. As an everyday member with no projects, I want a first-project blank slate, so that I understand what to do next.
6. As an everyday member, I want project cards to show tool tiles and status snippets, so that I can choose the right next place without opening every project.
7. As an everyday member, I want project cards to show AI-assistant work snippets when available, so that agent work is visible without making OpenClaw the UI source of truth.
8. As an everyday member, I want All projects to support search, filters, sorting, and archived projects, so that I can find older or less active projects quickly.
9. As an everyday member, I want project search results to include only projects I can access, so that private projects never leak through navigation.
10. As an everyday member, I want the project switcher beside a project title, so that I can jump between project workspaces without a permanent sidebar.
11. As an admin/full-shell user, I want authorized Admin routes to share stable navigation, search, notification, and responsive-shell infrastructure, so that Admin composition can evolve under PRD-020 without weakening route admission or accessibility.
12. As an admin/full-shell user, I want the Admin route hierarchy to come from PRD-020 rather than a duplicated list in the shared-shell contract, so that one product contract owns placement.
13. As a mobile user, I want breadcrumb scope to remain visible at every breakpoint, so that I can see whether I am in all-project or project scope.
14. As a returning user, I want the shell to validate my cached active project, so that revoked or deleted project state does not produce a misleading empty screen.
15. As a keyboard user, I want Cmd+K or Ctrl+K to open the command palette, so that I can navigate without reaching for the mouse.
16. As a keyboard user, I want arrow keys, Enter, and Escape to work in Find and the command palette, so that search feels predictable.
17. As an everyday member, I want Find to show recent items, suggested actions, projects, to-dos, people, assistants, files, docs, and actions, so that I can jump directly to work.
18. As an everyday member, I want Find to offer Ask Opzava as an alternate path, so that I can ask a cross-project question when search is not enough.
19. As an everyday member, I want command palette results ranked with project jumps first when relevant, so that navigation actions are fast.
20. As an everyday member, I want search to include docs/files that I can access, so that project knowledge is discoverable from one place.
21. As an everyday member, I want search to include people and assistant identities, so that I can locate teammates and AI assistants consistently.
22. As an everyday member, I want actions such as New project, New campaign, Add a goal, and Add a card to appear in command results when allowed, so that creation flows are easy to start.
23. As a manager, I want My stuff to roll up needs-input items, followed items, and schedule entries across projects, so that I can clear my personal queue.
24. As a manager, I want My stuff to show due dates and project names, so that I can prioritize without opening every project.
25. As a manager, I want My stuff to distinguish review requests from followed work, so that I can separate required action from awareness.
26. As a user following agent work, I want My stuff to show which assistant is working or scheduled, so that AI-owned work still feels accountable.
27. As a project contributor, I want Discovery to show ideas grouped by status or theme, so that shaping new work stays lightweight.
28. As a project contributor, I want Discovery cards to show votes, comments, authors, assistant suggestions, and status, so that convergence is visible.
29. As a project contributor, I want Discovery to connect a decided idea to project work, so that ideas can become executable project items.
30. As a project contributor, I want Discovery research links and notes to be visible, so that decisions have context.
31. As a project contributor, I want Ask Atlas or the project assistant surfaced inside Discovery, so that AI help is available without changing screens.
32. As an everyday member, I want the notification bell to show unread count, so that important system/tool/project updates are not missed.
33. As an everyday member, I want Notifications to separate Needs you from Updates, so that actionable items are not buried in informational events.
34. As an everyday member, I want Notifications to point mentions and hand-offs to Activity, so that the product has one clear inbox for @mentions.
35. As an everyday member, I want notification rows to carry project context and clear actions, so that I know where a notification came from and what to do.
36. As an admin, I want the alert center to show severity tiers, rule actions, and delivery-channel labels, so that operational notifications are triaged separately from everyday updates.
37. As an admin, I want alert rules listed by condition, severity, channel, and enabled state, so that alert behavior is auditable.
38. As an offline or reconnecting user, I want cached shell navigation and cached project lists to be labeled clearly, so that I can distinguish stale display from live state.
39. As a user on a slow connection, I want skeleton/loading states for projects, search, notifications, and dashboards, so that the shell does not jump or look broken.
40. As a user hitting an error, I want plain-language error states with retry actions, so that I can recover without seeing raw system codes.
41. As an admin viewing technical details, I want error states to expose extra diagnostic details behind disclosure, so that support can troubleshoot without overwhelming everyday users.
42. As a Guest-Client, I want only the project-scoped navigation and search results I am allowed to see, so that internal Opzava surfaces stay hidden.
43. As an organization owner, I want role changes to immediately affect shell navigation and search visibility, so that revoked access does not linger in the UI.
44. As a product operator, I want shell counts and search data to be derived from read models, so that dashboards remain usable when a tenant Gateway is unavailable.
45. As a developer, I want shell behavior tested at the user-visible composition seam, so that navigation, RBAC filtering, realtime updates, and empty states do not regress.

## UX Walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `shell-overview.html` | **Superseded Admin composition reference.** It remains evidence for shared shell mechanics such as search, notification plumbing, account affordances, and responsive navigation. PRD-020 owns the target Admin sidebar, topbar, Overview hierarchy, and route placement; this mockup no longer defines those targets. |
| `index.html` | Product split between Essential and full/admin experiences. Essential uses a calm top bar and never inherits the dark sidebar. Activity collects @mentions and call-outs. Project switching is via the project title dropdown plus Find. Admin/full view remains reserved for users with admin/full access. |
| `essential-home.html` | Essential Home with top bar, New project, notification bell, account avatar, greeting, summary error state, needs-you rollup, linked-tool health summary, Ask Opzava entry, project lineup, project-card empty/error states, and project cards with tool tiles, badges, assistant snippets, and status text. |
| `essential-projects.html` | All projects page with breadcrumb, page title, New project, load error/retry, project search, filters, sort menu, project cards, no-match empty state, and archived project rows with reopen actions for authorized users. |
| `nav-project-switcher.html` | **Shared behavior and migration reference.** Project-list loading, authorization, recents, active state, attention counts, async/offline behavior, stale-project clearing, and Cmd+K jumps remain valid. Its full-shell project-rail placement is superseded by PRD-020 and does not add a Projects section to target Admin navigation. |
| `essential-find.html` | Full-page Find surface with greeting context, scoped suggestions, recent items, projects, to-dos, people, assistants, files/docs, actions, keyboard hints, and Ask Opzava alternate path. |
| `essential-discovery.html` | Project Discovery board with project back link, assistant entry, status/theme grouping, idea cards, votes, comments, AI suggestions, research notes, add idea, decided/connect actions, and assistant side panel. Discovery behavior that creates durable project work is handed to the Project Management surface (`pm.Card`, deferred), but shell/search/list entry points are in this PRD. |
| `essential-my-stuff.html` | Cross-project personal dashboard with Needs your input, Following, schedule, review actions, assistant attribution, due dates, empty-done state, and links into calendar/project work. |
| `essential-blank-slates.html` | First-class blank, empty, and error states for Home, to-do lists, card tables, and assistant reachability. Everyday copy is plain-language; admin-only technical details are disclosed separately. |
| `notifications-alerts.html` | Full/admin notification center with unread counts, severity filters, mark-all-read, critical/warning/info notification rows, action buttons, empty/error states, alert rules table, rule delivery notes, and toast-style examples. |
| `essential-notifications.html` | Essential Notifications page with breadcrumb, mark-all-read, plain explanation that mentions/hand-offs live in Activity, load error/retry, all-caught-up state, Needs you group, Updates group, project context, action links, and settings/admin alert-rule pointer. |

## Functional Requirements

### App shell and responsive PWA

- The web app must provide a stable shell layout for authenticated Opzava sessions before rendering feature-specific content.
- Essential navigation must use the calm top bar from the Essential mockups on every everyday screen.
- Admin navigation must use the shared authorization and responsive-shell infrastructure defined here, while PRD-020 defines the exact sidebar primitive, hierarchy, labels, and composition.
- The shell must preserve active organization and active project context in URLs and/or server-validated state; client cache may speed startup but must not be trusted.
- The shell must render usable navigation on desktop, tablet, and mobile. Scope breadcrumbs must remain visible at all breakpoints.
- PWA installability must not bypass server-session gates. Offline shell display is allowed, but privileged data refresh must require normal server authorization.
- The shell must include consistent loading, empty, retry, offline cached, and forbidden states for each shell-owned surface.
- Shell text must use everyday language for Essential users and reserve technical diagnostics for admin disclosures.

### Navigation and project switcher

- Essential top bar entries: Home, My stuff, Messages, Activity, Ask Opzava, Find, New project, notification bell, and account/avatar.
- The former Operate/project-list/Observe/Automate/Govern rail grouping is superseded. PRD-020 is the sole target contract for Admin groups and destinations; this PRD retains global search, account, authorization, notification, and responsive-shell behavior.
- The Admin hierarchy owned by PRD-020 must expose one **Dev Board** entry. It must not retain separate target entries named Tasks and Issues.
- Shared shell/search plumbing must preserve the PRD-019-owned active Dev Board view in a routable URL and authorized search/deep-link results.
- Project list queries must be available to all authorized project viewers, not admin-only users.
- Project switcher results must be filtered by `AuthorizationPort` and tenant context.
- Active project state must be validated against the latest authorized project list on load, route transitions, role changes, and reconnect.
- If active project is missing, deleted, archived beyond the user's permission, or no longer authorized, the shell must clear project scope and route to an all-project view or 403 as appropriate.
- Recent projects are in scope. User-pinned projects are out of scope until a user-scoped preferences table exists.
- Project badges may include task/open-count and overdue/needs-attention signals only when those signals are backed by owned or projected data available to the shell.
- Archived projects must appear only where the user has permission to view archived state; reopen actions must be authorization-gated.

### Command palette and Find

- Cmd+K on macOS and Ctrl+K elsewhere must open the command palette from any authenticated shell route.
- Escape must close the palette; arrow keys move selection; Enter activates the selected result.
- Command palette and Find must share result categories and authorization behavior where possible.
- Empty command palette state must rank project jumps and core navigation above lower-frequency panels.
- Find must support recent items, suggested actions, projects, to-dos, people, assistants, files/docs, and allowed actions.
- Search and command results must never reveal unauthorized project names, file names, people, assistant identities, notification text, or action availability.
- Search must include labels that identify result type and project/source context.
- Actions must execute only through the owning bounded context's command path and must re-check authorization.
- Ask Opzava may be offered as an alternate action from Find; the conversation implementation is out of scope.

### Home and All projects dashboards

- Home must show a needs-you rollup, linked-tool status summary, Ask Opzava entry, and project lineup.
- Project cards must show project name, type/description, relevant tool tiles, unread/attention counts, collaborators or assistants, and a short status line.
- Home must distinguish summary load failure from project-list load failure and provide retry actions.
- All projects must provide search, filters for all/needs-you/active, sort by recent/name/needs-you-first, and archived project visibility for authorized users.
- No-project and no-match states must use the copy and intent from the blank slate mockups.
- Project card content must degrade cleanly when runtime-derived snippets are stale or unavailable.

### My stuff

- My stuff must aggregate items across authorized projects that need the current user's input.
- My stuff must separately show followed work and schedule entries.
- Needs-input items must include project name, source actor or assistant, due date/age, and a clear review/open action.
- Following items must include status labels such as In progress, Due, Scheduled, or equivalent domain terms.
- My stuff must end with a positive empty state when there is nothing on the user's plate.
- My stuff must not include mentions and hand-offs that belong in Activity except as explicit cross-links.

### Discovery entry points

- Discovery must be available as a project-scoped surface when the user can access the project.
- Discovery board list state must support grouping by status and theme.
- Idea cards must show idea title, theme, status, author or assistant attribution, vote count, comment count, and allowed actions.
- Decided ideas must expose Connect to a project or Turn into a to-do only when the user has permission to create the target work.
- Research links and notes must be searchable and visible only inside authorized project scope.
- AI suggestion side-panel affordances must call into the project assistant/Ask Atlas flow by reference; full AI conversation behavior is owned by PRD-005.

### Notifications and alerts

- The shell notification bell must show unread notification count scoped to the active organization and current user.
- Essential Notifications must group Needs you separately from Updates.
- Essential Notifications must explicitly point mentions and hand-offs to Activity.
- Notification rows must include source, project context when applicable, age/time, and a clear primary action.
- Mark-all-read must be available when the user can update notification state.
- The full/admin notification center must support severity filters, action buttons, empty states, error retry, and alert-rule listing.
- Alert rules are admin/full-shell surfaces and must not be exposed to ordinary Essential users except through a settings/admin pointer.
- Notification updates must arrive over the realtime path when online and backfill from durable notification state after reconnect.

### Blank, empty, error, and offline states

- Every shell-owned list must define loading, empty, no-match, error/retry, offline cached, and forbidden states.
- Everyday errors must not expose raw codes by default.
- Admin diagnostics may be disclosed behind a Technical details control.
- A missing tenant context or authorization denial must render a hard forbidden state, not an empty list.
- Offline cached project/search/notification data must be visibly labeled as cached when the app cannot verify freshness.

### Accessibility and interaction

- All navigation, switcher, search, command palette, notification, and action controls must be keyboard accessible.
- The command palette and switcher must manage focus on open/close and return focus to the invoking control.
- Result lists must expose names, result types, and positions to assistive technologies.
- Notification counts must be announced without relying on color alone.
- Status and severity must use labels/glyphs, not hue as the only signal.
- The shell must avoid layout shift for counters, badges, and loading states.

## Data and API Touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Authenticated shell context | Identity & Access | Current user, active organization, membership version, role grants, account/avatar basics | `AuthPort`, `AuthorizationPort` |
| Project visibility and switcher | Project Management with Identity & Access authorization | Authorized project directory, recent projects, archived visibility, active-project validation, project-card summaries | `AuthorizationPort`, `EventBusPort` |
| Home and All projects | Project Management | Home dashboard read model, project lineup read model, needs-you project rollup, project type/tool tile metadata | `EventBusPort`, `AuthorizationPort` |
| My stuff | Project Management, Department Workflows, Internal Collaboration where events originate | Personal needs-input read model, followed-work read model, schedule rollup, review actions | `EventBusPort`, `AuthorizationPort`, optionally `RealtimeTransportPort` for live updates |
| Find and command palette | Project Management as shell search coordinator, with contributing contexts | Search index/read model entries for projects, to-dos/cards, people, assistants, docs/files, actions, recent items | `AuthorizationPort`, `KnowledgeIndexPort`, `EventBusPort` |
| People and assistant search entries | Identity & Access, AI Workforce | Member/person result DTOs, `AgentEmployee` result DTOs, persona labels, availability/status projection | `AuthorizationPort`, `EventBusPort` |
| Docs/files search entries | Knowledge Management | Project document/file metadata, source refs, index status, authorized search snippets | `KnowledgeSourcePort`, `KnowledgeIndexPort`, `ObjectStorePort`, `AuthorizationPort` |
| Discovery list/search entry | Project Management with optional AI Workforce support | Idea board read model, research/note metadata, decided/connect actions, assistant suggestion affordance | `EventBusPort`, `AuthorizationPort`, optionally `OpenClawGatewayPort` via PRD-005 flows |
| Notification bell and Essential Notifications | Notifications/Admin-Observability | Notification inbox read model, unread counts, mark-read state, notification action targets | `RealtimeTransportPort`, `PushNotificationPort`, `EventBusPort`, `AuthorizationPort` |
| Full/admin alert center | Notifications/Admin-Observability | Alert notification read model, severity filters, alert-rule list, admin actions | `RealtimeTransportPort`, `PushNotificationPort`, `EventBusPort`, `AuthorizationPort` |
| Runtime health snippets in full shell | Notifications/Admin-Observability | Projected health, diagnostics, task, session, usage/cost, and activity summaries | `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort` |
| PWA shell/offline gates | Identity & Access, Notifications/Admin-Observability | Session probe, push binding references, cached shell metadata, redacted offline placeholders | `AuthPort`, `PushNotificationPort` |

## Implementation Decisions

- Build the shell in the web app as a composition layer that calls bounded-context application queries/commands; do not put domain rules in React components.
- Treat Essential and full/admin as two shell modes behind the same authenticated product app, with authorization deciding route and navigation availability.
- Use server-validated active organization/project context as the source of truth; local storage or client cache may only seed optimistic startup.
- Use Project Management as the owner of the project directory, Home, All projects, My stuff rollups, and shell-level project search coordination.
- Use Notifications/Admin-Observability as the owner of notification rows, unread counts, alert-center rows, alert rules, and runtime health projections.
- Use Identity & Access and `AuthorizationPort` on every shell query that returns tenant or project-scoped navigation/search data.
- Use ADR-004 read models for shell lists and summaries. The shell must not live-query OpenClaw for project cards, search results, notification history, or dashboard counts.
- Use ADR-009 realtime fan-out only as the live update path. Reconnect must backfill from durable read models and notification state.
- Model command palette actions as typed command descriptors owned by the context that executes the action; descriptors are hidden when the user lacks permission.
- Store recents as user-scoped shell preference/history if that persistence already exists in the implementation slice; otherwise derive recent projects from durable access/activity. Do not use a shared admin settings key for per-user pins.
- Defer true pinned projects until user-scoped preferences are available.
- Keep OpenClaw identifiers opaque in any runtime-derived shell projections.
- When projection state is stale, show stale/degraded labels rather than blocking core shell navigation.
- Keep notification payload display server-rendered or server-fetched after authorization; push payloads must not contain sensitive details.

## OpenClaw-Parity Notes

| Feature area | Classification | Native harnessed vs Opzava-owned decision |
| --- | --- | --- |
| Full-shell health, live activity, spend, agent/task/session summary | Hybrid | Harness OpenClaw `health`, diagnostics, tasks, sessions, usage/cost, and server-push events through the broker. Opzava owns the sanitized read models and UI summaries. |
| Essential Home and All projects | Opzava-owned | Project records, project cards, project filters, and project navigation are Opzava Postgres truth. Runtime snippets may enrich cards only through projections. |
| My stuff | Mostly Opzava-owned | Needs-input, following, and schedule rollups are Opzava read models. Agent-owned work can appear only through task/cron/session projections. |
| Project switcher and recents | Opzava-owned | Project visibility and active state are Opzava/RBAC concerns. OpenClaw does not decide project access. |
| Command palette and Find | Opzava-owned with optional hybrid entries | Search index/read models are Opzava-owned. Optional runtime artifacts, sessions, tools, or assistant entries are indexed/projected, not queried live from Gateway storage. |
| Discovery board | Hybrid but Opzava-led | Idea records, votes, comments, and decided/connect state are Opzava-owned. AI research/suggestions harness OpenClaw sessions/artifacts through later assistant flows. |
| Notification bell and Essential Notifications | Hybrid | Notification rows, unread counts, and preferences are Opzava-owned. Runtime alert inputs are projected from OpenClaw signals through the broker. |
| Full/admin alert center | Hybrid | Alert rules and notification lifecycle are Opzava-owned. Runtime health/log/task/usage inputs are harnessed through the ACL and projected. |
| Blank/error states and shell UX standards | Opzava-owned | Product UX behavior is not an OpenClaw capability. |

## Acceptance Criteria

- Essential users see the top-bar shell on Home, All projects, My stuff, Find, Discovery, and Notifications; they do not see Admin navigation.
- Admin users can access admitted routes through the shared shell, including global search, notification plumbing, account controls, and responsive navigation. PRD-020 supplies the target groups, Overview composition, platform/readiness health presentation, and separate attention presentation.
- Project list and switcher results are filtered by active organization, project grants, tenant lifecycle, and current membership state.
- A revoked or stale active project is cleared or forbidden on reload/reconnect; it never appears as an unexplained empty project.
- Home renders needs-you, tools summary, Ask Opzava entry, and project lineup with loading, empty, error, and retry states.
- All projects supports search, filters, sort, no-match state, archived rows, and authorized reopen actions.
- Cmd+K/Ctrl+K opens a keyboard-operable command palette from shell routes.
- Find shows recent, suggested, project, to-do, people, assistant, file/doc, and action categories while respecting authorization.
- Search and command palette do not return unauthorized names, counts, snippets, or actions.
- My stuff shows Needs your input, Following, schedule entries, clear review/open actions, and a done state.
- Discovery list state supports status/theme grouping, idea cards, votes/comments, research notes, assistant affordance, and connect actions where authorized.
- Notification bell unread count updates live and reconciles after reconnect.
- Essential Notifications separates Needs you and Updates and routes mentions/hand-offs to Activity.
- Full/admin alert center shows severity filters, notification actions, empty/error states, and alert rules only to authorized admin/full users.
- Every shell-owned list has loading, empty, no-match where relevant, error/retry, offline cached, and forbidden states.
- Missing tenant context and authorization denials render a hard forbidden state, not a successful empty list.
- PWA offline shell never exposes sensitive cached notification/search details without server authorization.
- Status, severity, and attention signals are understandable without color alone.
- Keyboard and screen-reader behavior meets the interaction requirements for nav, switcher, command palette, Find, and notification actions.

## Testing Decisions

- Test at the highest user-visible seam: shell route rendering plus mocked application query/command ports. Avoid tests that assert component internals or CSS implementation details.
- Add integration coverage for Essential shell navigation, full/admin rail visibility, route admission, and responsive breadcrumb presence.
- Add authorization-focused tests proving unauthorized projects, actions, files, assistants, and notification rows are absent from switcher/search results.
- Add missing-tenant and revoked-project tests that assert forbidden or cleared-scope behavior, never `200` with an empty list.
- Add command palette interaction tests for open shortcut, focus management, keyboard navigation, activation, and close behavior.
- Add Find tests for category grouping, result labels, empty/no-match state, Ask Opzava alternate action, and action visibility.
- Add Home/All projects tests for loading, project load failure, summary load failure, no projects, no matches, archived rows, filters, and sorting.
- Add My stuff tests for Needs your input, Following, schedule rollups, due dates, review actions, and all-clear state.
- Add Discovery list tests for status/theme grouping, authorized connect action visibility, assistant affordance, and research-note visibility.
- Add notification tests for unread count, mark all read, Needs you vs Updates grouping, Activity pointer, realtime update, reconnect backfill, empty state, and load error.
- Add admin alert-center tests for severity filters, alert-rule visibility, rule action gating, and admin-only route behavior.
- Add accessibility tests for keyboard-only operation, focus return, semantic labels, count announcements, and status/severity labels.
- Add regression tests for cached active-project validation and offline cached-list labeling.
- Do not test OpenClaw RPC protocol behavior in shell tests. Use projected read-model fixtures and cover broker/ACL behavior in the owning integration suites.

## Dependencies

- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-007: Resource-scoped RBAC, roles-as-data, and Postgres RLS.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, and PWA/Web Push.
- ADR-001: Monorepo, DDD module structure, locked stack, and port vocabulary.
- PRD-001: Auth, invitation, profile security, and first workspace setup for authenticated shell/session prerequisites.
- Project Management surface (`pm.Card`, deferred): Projects, boards, cards, goals, to-dos, schedules, docs, and Discovery durable workflows.
- PRD-004: Internal chat, DMs, project team rooms, mentions, Activity, and notification-producing collaboration events.
- PRD-005: Ask Opzava and Ask Admin Opzava conversations.
- PRD-012: Admin monitoring, logs, Incidents, security/audit, alerts, and debug surfaces.
- PRD-019: Dev Board local navigation, routable views, and workflow-owned attention counts.
- PRD-020: Admin Control Center — shell, navigation, and overview composition; authoritative for Admin-only route hierarchy, exact sidebar/topbar composition, Admin Overview, and placement.
- ADR-017: Dev Board authority, GitHub synchronization, and execution boundaries.
- PRD-013: Connections, providers, channels, tools, MCP, and connect wizard for linked-tool details.
- PRD-016: PWA install/offline behavior and Web Push preferences for push preference management and offline gates.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
