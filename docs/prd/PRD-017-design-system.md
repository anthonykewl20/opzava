# PRD-017: Design system, async and blank states, and accessibility acceptance rules

## Problem

Opzava now has PRDs for the major product areas, but the shared visual and interaction contract is still only implied by the mockups. Without a PRD-level design-system contract, the app can drift in several harmful ways:

- Essential and Full/admin screens could mix navigation models, density, theme, or tone.
- Teams could copy one-off CSS from mockups instead of using shadcn/ui, Tailwind, and Opzava tokens consistently.
- Loading, empty, no-match, error, stale, offline, and forbidden states could be handled differently per screen.
- Blank slates could become decorative dead ends instead of first-use guidance with one next action.
- Status, severity, live state, and AI attribution could become color-only signals, failing WCAG AA and confusing users.
- Accessibility could remain a best-effort checklist rather than an acceptance gate across every screen.
- Runtime and OpenClaw failures could leak technical detail into everyday surfaces instead of using the plain-language async conventions established in the mockups.

The solution is a shared Opzava design-system product contract for the web app: shadcn/ui plus Tailwind mapped to Opzava design tokens, a component inventory, universal async and blank-state conventions, and WCAG AA acceptance rules applied to every screen. This PRD depends on PRD-002 because the app shell, navigation split, command palette, notifications, and global state handling are the first consumers of these rules.

This PRD applies ADR-001 for the locked shadcn/ui and Tailwind stack, ADR-004 for projected versus live runtime state, ADR-007 for 403 versus empty-state behavior, ADR-009 for realtime/PWA/live-state behavior, and ADR-013 for admin-visible error detail and incident routing. It does not restate architecture.

## Goals and Non-goals

### Goals

- Establish shadcn/ui and Tailwind as the implementation base for shared Opzava UI components.
- Map shadcn/ui component styling to Opzava design tokens instead of ad hoc color, spacing, radius, typography, or shadow values.
- Preserve the two product worlds from PRD-002: Essential uses calm light top navigation; Full/admin uses the dark technical sidebar.
- Define the token contract for typography, color, spacing, radius, elevation, motion, z-index, density, and app-shell geometry.
- Define the component inventory and required states for buttons, forms, badges, avatars, tables, tabs, banners, toasts, stats, progress, dialogs, menus, command/search, status atoms, skeletons, empty states, error states, and live indicators.
- Make four universal async states mandatory for every data-fetching panel: Loading, Loaded, Empty, and Error.
- Extend that baseline across product screens with no-match, stale, offline/reconnecting, Gateway unavailable, forbidden, validation error, conflict, approval required, and retry states where relevant.
- Define blank-slate patterns for first use, empty collections, empty board lanes, no matches, and unavailable assistants.
- Apply WCAG AA acceptance rules to every screen, including contrast, keyboard access, focus management, semantics, responsive behavior, reduced motion, live regions, and no color-only meaning.
- Define data/API touchpoints by owning bounded context and ports, so UI state follows Opzava domain ownership.
- Define OpenClaw-parity boundaries: Opzava owns UI standards; OpenClaw runtime signals are harnessed only through existing ports and projections.
- Define acceptance and testing decisions for design-system implementation and per-screen adoption.

### Non-goals

- Replace the existing product PRDs for auth, app shell, project management, chat, AI assistants, marketing, CRM, finance, observability, tools, billing, guest portal, or PWA push.
- Build feature-specific domain workflows or schemas beyond the UI states and touchpoints needed for design-system adoption.
- Redesign ADR-001, ADR-004, ADR-007, ADR-009, or ADR-013.
- Introduce a second UI kit, CSS framework, component library, or one-off theme layer outside shadcn/ui, Tailwind, and Opzava tokens.
- Make OpenClaw or Workboard responsible for UI component state, accessibility, or blank-state copy.
- Store raw runtime errors, logs, secrets, provider credentials, or OpenClaw DTOs in UI component state.
- Let accessibility exceptions ship as "follow-up polish" after feature acceptance.
- Publish this PRD, create issues, call GitHub, or run build/test/lint commands.

## User Stories

1. As an everyday member, I want every Essential screen to use the same calm top navigation, so that I always know where Home, My stuff, Messages, Activity, Ask Opzava, Find, notifications, and account controls live.
2. As an admin user, I want every Full/admin screen to use the same dark sidebar, so that operating surfaces feel consistent and technical controls are not mixed into Essential.
3. As a user moving between Essential and Full/admin, I want each world to have one coherent theme and navigation model, so that I never wonder which mode I am in.
4. As a designer, I want one token source for typography, colors, spacing, radius, shadow, motion, z-index, density, and app-shell geometry, so that screens do not drift by hand.
5. As a frontend developer, I want shadcn/ui components styled through Opzava tokens, so that implementation matches the mockups without copying page CSS.
6. As a frontend developer, I want Tailwind theme values generated from or aligned to Opzava tokens, so that utility classes and component CSS produce the same visual result.
7. As a product reviewer, I want every component state visible in the design-system inventory, so that missing hover, focus, disabled, loading, selected, error, and destructive states are caught early.
8. As a user with low vision, I want body text to stay at least 15px, so that product screens remain readable.
9. As a user with low vision, I want tertiary 13px text used only for metadata, so that core content is never too small.
10. As a user with low vision, I want foreground, muted, subtle, accent, semantic, and chart tokens to meet their contrast rules, so that text and controls remain legible.
11. As a keyboard user, I want every button, link, tab, switch, command result, menu item, dialog, popover, card action, and board action to be reachable and operable by keyboard, so that I do not need a mouse.
12. As a keyboard user, I want focus to move into dialogs, command palettes, menus, and popovers and return to the invoking control, so that context is preserved.
13. As a screen-reader user, I want navigation landmarks, headings, table captions, form labels, tab roles, progress labels, live regions, and status names, so that screens are understandable without visual scanning.
14. As a screen-reader user, I want icon-only buttons to have accessible names, so that actions are not anonymous.
15. As a screen-reader user, I want status and severity to be announced with words and glyph labels, so that color is never the only signal.
16. As a motion-sensitive user, I want reduced-motion preferences honored, so that shimmer, heartbeat, typing, and notification motion do not cause discomfort.
17. As a mobile user, I want tables, forms, dialogs, cards, and blank states to fit without hidden actions or overlapping text, so that I can complete workflows on small screens.
18. As a user on a slow connection, I want skeleton loading states that match the final layout, so that pages feel stable and do not jump.
19. As a user waiting on live runtime data, I want stale and reconnecting labels, so that old projections do not look current.
20. As a user whose Gateway is unavailable, I want the UI to explain which live capability is unavailable and what I can still do, so that durable Opzava work is not confused with runtime downtime.
21. As a user with an empty workspace, I want a first-project blank slate with a clear next action, so that I know how to begin.
22. As a user with an empty to-do list, I want the list header to remain visible and the empty state to own the add action, so that structure and next step are both clear.
23. As a user viewing an empty board lane, I want lane-level copy that explains what normally lands there, so that empty columns do not look broken.
24. As a user with no search results, I want a no-match state that preserves my query and suggests a safe next action, so that I can recover without losing context.
25. As an everyday user, I want error states in plain language, so that I am not exposed to raw stack traces, OpenClaw refs, or provider codes.
26. As an admin user, I want technical details disclosed behind an admin-only control, so that troubleshooting detail exists without overwhelming ordinary users.
27. As a security reviewer, I want 403 and missing tenant context to render as forbidden, not as empty lists, so that authorization bugs are visible.
28. As a platform operator, I want admin error states to connect to incident and retry paths where applicable, so that failures are actionable.
29. As a product operator, I want every data-fetching panel to explicitly define Loading, Loaded, Empty, and Error, so that async behavior is not invented per screen.
30. As a product operator, I want every collection to distinguish first-use empty, filtered no-match, permission-forbidden, and load-error states, so that the UI does not lie about data absence.
31. As an everyday member, I want one primary action per region, so that I can identify the intended next step.
32. As an everyday member, I want destructive actions to use consistent danger styling, confirmation, and accessible labels, so that risk is obvious.
33. As an admin user, I want banners to show at most one active global message by priority, so that alert chrome does not stack into noise.
34. As a user receiving notifications, I want toasts to use appropriate `role="status"` or `role="alert"`, so that announcements match urgency.
35. As a user viewing progress, I want progress bars to expose `aria-valuenow`, label, min, and max, so that non-visual users receive the same progress meaning.
36. As a user viewing stats, I want KPI numbers to use tabular numerals and text deltas, so that trends are readable and not color-only.
37. As a user viewing badges, I want dots paired with text, so that status is understandable in monochrome and assistive contexts.
38. As a user viewing AI work, I want assistants marked by the Opzava assistant glyph and persona labels, so that AI and human actors are never confused.
39. As a user viewing humans and assistants together, I want human avatars and AI avatars to use consistent shapes and labels, so that attribution is clear.
40. As a user interacting with forms, I want labels, hints, validation errors, and invalid states to be connected semantically, so that form recovery is direct.
41. As a user editing settings, I want switches to use `role="switch"` and visible on/off labels, so that state is clear to everyone.
42. As a user opening a menu, I want menu items, separators, labels, shortcuts, and danger items to be consistent, so that operations feel predictable.
43. As a command-palette user, I want search and quick actions to follow the same focus, result grouping, empty, and no-match conventions everywhere, so that Cmd+K remains reliable.
44. As an admin user viewing tables, I want responsive table-card behavior on mobile with data labels, so that rows remain readable without horizontal traps.
45. As a user viewing live health, I want heartbeat or live motion to be subtle and backed by text labels, so that live state is readable and not decorative.
46. As a product reviewer, I want every screen listed in `index.html` to inherit the same token and accessibility rules, so that feature PRDs do not drift.
47. As a designer, I want screens not represented in mockups to be marked net-new, so that design debt is visible before implementation.
48. As a frontend developer, I want design-system acceptance criteria to be reusable by every feature PRD, so that component adoption is objective.
49. As a QA reviewer, I want accessibility tests and manual keyboard passes defined at the UI composition seam, so that acceptance covers real user behavior.
50. As a QA reviewer, I want async and blank-state tests to verify external behavior rather than implementation internals, so that components can evolve safely.
51. As an app-shell maintainer, I want PRD-002 surfaces to be the first adoption target, so that navigation, command, notifications, and shell states set the pattern.
52. As a feature owner, I want design-system gaps reported back as component inventory work instead of local feature hacks, so that reuse improves over time.
53. As a developer, I want every component to expose the states needed by product screens through typed props or composition contracts, so that screen authors cannot forget required states silently.
54. As a developer, I want no screen to hard-code secrets, raw provider payloads, or Gateway tokens in examples, so that UI demos do not create credential risk.
55. As a developer, I want OpenClaw runtime refs treated as opaque and admin-gated where shown, so that UI diagnostics do not leak implementation detail.
56. As a tenant admin, I want tenant-visible error states to hide cross-tenant and platform-only detail, so that observability remains scoped.
57. As a Guest-Client, I want project-scoped surfaces to use the same accessible components while hiding internal navigation, so that limited access is still usable.
58. As an owner, I want design-system violations to block acceptance for new screens, so that accessibility and async rules are not optional.
59. As a maintainer, I want the style guide to remain a living inventory, so that every new shared component and state has a documented home.
60. As a maintainer, I want Tailwind, shadcn/ui, and token changes to be reviewed as shared system changes, so that one feature cannot quietly break the product's visual contract.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `style-guide.html` | Living design-system inventory. It defines the rendered type scale, color tokens, spacing scale, radii, buttons, forms, badges, dots, tables, tabs, banners, toasts, KPI/stat cards, progress bars, async states, and live/motion states. It also establishes the 15px body floor, 13px metadata-only rule, one primary action per region, color paired with text, tab semantics, banner priority, toast roles, progress ARIA, four universal async states, reduced-motion handling, and live indicators that remain label-first. This screen becomes the acceptance reference for shared components. |
| `essential-blank-slates.html` | Product blank-state reference for first-use Home, empty to-do list, empty board lane, and assistant-unavailable error. Blank slates must use plain language, one primary CTA where a next action exists, optional ghost previews only when they clarify the payoff, and admin-only technical details behind disclosure. Empty states do not replace forbidden or error states. |
| `index.html` | Cross-product adoption map. Every listed Essential and Full/admin screen inherits the token, component, async, blank-state, and WCAG AA rules in this PRD. Essential remains calm, light, top-nav, and jargon-free. Full/admin remains dark, technical, sidebar-based, and operations-focused. The screen list is the product-level inventory for adoption coverage, not a separate component contract. |
| `tokens.css` | Token source for typography, themes, spacing, radius, elevation, motion, z-index, density, app-shell geometry, base styles, focus rings, scrollbars, selection, reduced-motion handling, and utility classes. Implementation must translate these values into the Tailwind theme and/or CSS variables consumed by shadcn/ui components. Components must not fork values per screen. |
| `shadcn.css` | shadcn/ui component mapping layer. `sb-` components are the reference for badges, avatars, breadcrumbs, alerts, checkboxes, spinners, popovers, hover cards, menus, tabs, responsive table cards, alert dialogs, terminal traces, status lines, wizard steps, and copy-command blocks. Production implementation should use shadcn primitives plus Opzava token classes rather than page-local replicas. |

Net-new screens or artifacts to design:

- Component inventory route or Storybook-equivalent for production components, if the static `style-guide.html` cannot remain the living implementation reference.
- Accessibility audit report surface for release review, including contrast, keyboard, screen-reader, reduced-motion, and responsive evidence.
- Async-state matrix for each major PRD surface, showing loading, empty, no-match, forbidden, error, stale, offline, Gateway unavailable, validation error, conflict, approval required, and retry where relevant.
- Blank-slate copy deck for net-new feature screens not shown in the current mockups, including CRM-native screens, guest portal screens, install/push screens from PRD-016, and future billing or settings subflows.
- Design-system contribution guide for adding or changing tokens, shared components, icons, status terms, and state copy.

## Functional requirements

### Design-system foundation

- The web app must implement shared UI with shadcn/ui primitives, Tailwind utilities, and Opzava design tokens.
- Opzava tokens must be the source for color, typography, spacing, radius, shadow, motion, z-index, density, and app-shell geometry.
- Production components must not hard-code one-off color, font-size, spacing, radius, shadow, or motion values when an approved token exists.
- Tailwind theme values must align with the token contract so utility classes and component styles do not diverge.
- Components must support the four product themes represented by tokens where applicable: dark, light, high-contrast, and calm.
- Essential screens must default to the calm theme and top-navigation language from PRD-002.
- Full/admin screens must default to the dark technical shell from PRD-002.
- Theme changes must swap token values and must not fork component markup or interaction behavior.
- Font families must use Inter for UI and JetBrains Mono for tabular or technical data where mono is appropriate.
- Body text must default to the 15px floor. 13px text is allowed only for tertiary metadata such as timestamps, units, captions, compact labels, and uppercase micro-labels.
- Letter spacing must be reserved for caps/micro-labels through the tokenized caps tracking, not used to compress body text.
- Layout spacing must use the 4px token grid.
- Radius must use the approved scale: small, medium, large, extra-large, and full.
- Elevation must be used only for floating UI such as menus, popovers, dialogs, drawers, toasts, and overlays.
- Motion must use the approved duration and easing tokens and must animate transform and opacity where possible.
- `prefers-reduced-motion` must reduce or remove non-essential motion including shimmer, heartbeat, typing, entrances, and status animations.
- Focus indicators must use the tokenized ring and be visible on every interactive control.

### Component inventory

- Buttons must support primary, default, ghost, danger/destructive, icon-only, small, disabled, loading, and pending states.
- Icon-only buttons must have accessible names and stable 36px minimum target dimensions unless a larger target is required on touch surfaces.
- Each region must have at most one primary action.
- Destructive actions must use danger styling, clear labels, and confirmation when the action is irreversible, high-risk, or cross-context.
- Form fields must support label, required/optional copy, hint, validation error, invalid state, disabled state, pending state, and success/changed feedback.
- Form validation errors must connect with `aria-describedby` and use `aria-invalid` where applicable.
- Switches must use `role="switch"`, `aria-checked`, keyboard operation, visible labels, and visible state text.
- Selects, comboboxes, menus, command palettes, tabs, dialogs, popovers, hover cards, and drawers must use shadcn/ui accessibility primitives or equivalent semantics.
- Badges must pair visual color with text. Status dots must be paired with visible labels in real use.
- Status terminology must be shared across screens where the domain meaning matches, including Running, Idle, Degraded, Offline, Queued, Active, Connected, Needs review, Needs attention, Done, Draft, Scheduled, Published, and Unknown.
- AI participants must use assistant glyph/persona treatment and must not rely on color alone to distinguish AI from humans.
- Human avatars and AI avatars must remain visually distinct and accessible by label.
- Tables must include semantic headers, captions or accessible names, numeric alignment for numeric data, tabular numerals for comparable numbers, and responsive table-card behavior where horizontal scroll would hide actions.
- Tabs must use `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, and `aria-controls`.
- Banners must show at most one global banner in a region at a time, selected by priority: danger, warning, info, accent.
- Danger banners and dangerous toasts must use `role="alert"`. Non-danger toasts should use `role="status"`.
- Toasts must be dismissible when persistent enough to obstruct work and must not steal focus unless user action is required.
- KPI/stat cards must use tabular numerals, text labels, and non-color-only deltas.
- Progress indicators must use `role="progressbar"` with label, `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` when determinate.
- Skeletons must reserve stable dimensions that match the final loaded layout.
- Spinners are allowed for small inline waits. Page and panel loading must use skeletons when the loaded shape is known.
- Dialogs and alert dialogs must trap focus, restore focus on close, and provide title/description associations.
- Terminal or trace panels must stay dark in every theme, use mono text, be horizontally scrollable where needed, and never expose secrets or raw tokens.
- Copy-command blocks must avoid raw long-lived credentials and must use short-lived, redacted, or generated setup material from the owning context.

### Async state conventions

- Every data-fetching panel must define Loading, Loaded, Empty, and Error states before implementation is accepted.
- Every collection surface must additionally define no-match state when filtering or search exists.
- Every tenant-scoped surface must define forbidden state and must not render 403 as an empty list.
- Every runtime-backed surface must define Gateway unavailable, circuit open, stale projection, and reconnecting states where live OpenClaw data can fail.
- Every offline-capable PWA surface must define offline cached, auth-required, and retry states according to PRD-016.
- Loading states must reserve stable dimensions and avoid layout shift for counters, badges, row heights, cards, and action bars.
- Loaded states must use real domain labels, accessible names, and visible status words.
- Empty states must explain why the area is empty and what the user can do next.
- Error states must explain what failed in user language and provide a retry action when retry is safe.
- Admin-only technical details may be shown behind a collapsed disclosure, gated by authorization.
- Validation errors must stay near the field or command that caused them and must preserve user input.
- Conflict states must explain that data changed and provide refresh, review, or retry choices.
- Approval-required states must show the approval owner, action, risk label, and link to the approval surface where allowed.
- Stale states must show last successful update age and avoid presenting stale data as live.
- Live indicators must be backed by actual realtime state and must be paired with text such as Live, Reconnecting, Offline, or Stale.

### Blank-state patterns

- First-use blank slates must be outcome-framed, jargon-free, and centered on one primary CTA.
- First-use blank slates may include a dimmed ghost preview when it clarifies what the user is building toward.
- Empty list states inside an existing surface must preserve the surrounding shell, header, filters, and context.
- Empty board lanes must be compact, lane-scoped, and explain what normally lands in that lane.
- No-match states must preserve the user's query/filter and offer clear recovery such as clearing filters, changing scope, or creating a new item when authorized.
- Empty states must not hide authorization denial, tenant-context failure, service failure, or runtime unavailability.
- Empty copy must use the domain terms from the relevant PRD and mockup, such as projects, to-dos, cards, assistants, approvals, updates, tools, tickets, incidents, campaigns, and goals.
- Blank states must have at most one primary action and may include secondary links only when they are genuinely useful.
- Technical copy and raw codes must be absent from Essential blank states.
- Admin diagnostics in blank/error states must be collapsed and redacted by default.

### Accessibility acceptance rules

- All product screens must meet WCAG 2.2 AA where applicable.
- Normal text and meaningful non-text UI indicators must meet at least 4.5:1 contrast against their backgrounds unless the WCAG large-text exception applies.
- Large text must meet at least 3:1 contrast.
- Focus indicators must meet contrast expectations and must be visible against adjacent colors.
- Color must never be the only way to communicate status, severity, category, trend, actor type, required action, or validation state.
- Every interactive control must be reachable and operable with keyboard alone.
- Keyboard focus order must follow visual and task order.
- Focus must not be trapped except inside active modal/dialog surfaces, and modal focus traps must have an accessible close/cancel path.
- Command palettes, menus, popovers, dialogs, drawers, and overlays must restore focus to the invoking control on close.
- Forms must expose labels programmatically, not only through placeholders.
- Required, invalid, disabled, read-only, pending, and success states must be programmatically or visibly clear.
- Pages must have a coherent heading hierarchy with one page-level heading per route or modal context.
- Landmarks must distinguish navigation, main content, complementary panels, search, and forms where applicable.
- Tables must use header cells, captions or accessible names, and data labels on responsive table-card variants.
- Live regions must be used for loading completion, toast messages, notification count changes, assistant typing/output updates, and retry results where users need announcement.
- Frequent live updates must be throttled or summarized to avoid overwhelming assistive technologies.
- Animated skeletons, heartbeat indicators, typing dots, toast entrances, and live-status motion must honor reduced-motion preferences.
- Touch targets on mobile must be large enough to operate reliably and must not overlap.
- Text must reflow at narrow widths without clipping, overlapping, or forcing hidden essential actions.
- Zoom to 200 percent must preserve content and functionality for core workflows.
- Any exception to a rule above must be explicitly documented and accepted by product/design/engineering before release.

## Data and API touchpoints

| Surface or rule area | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Design tokens, component inventory, theme, shell-level layout | App Shell/web composition, guided by PRD-002 | Token registry, Tailwind theme, shadcn/ui wrappers, route shell mode, user appearance preference | `AuthPort` for user preference reads where needed |
| Active shell mode and authorized navigation | Identity & Access, Project Management | Current user, organization, membership, role grants, active project validation, Essential versus Full/admin access | `AuthPort`, `AuthorizationPort` |
| Forbidden versus empty-state decisions | Identity & Access with every tenant-scoped context | Authorization denial, missing tenant context, resource visibility, Guest-Client scope | `AuthorizationPort` |
| Loading, stale, projection, and read-model freshness | Owning product context per screen | Read-model query state, projection checkpoint, last updated age, command result DTO | `EventBusPort`, context application queries |
| Realtime/live/reconnecting state | Notifications/Admin-Observability, Internal Collaboration, AI Workforce, Project Management as event sources | WS topic state, notification/activity/chat/assistant stream updates, reconnect cursor, live watermark | `RealtimeTransportPort`, `EventBusPort` |
| Gateway unavailable and OpenClaw runtime error states | AI Workforce, Runtime-Control, Notifications/Admin-Observability, owning workflow context | Broker errors such as GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, RateLimited, stale runtime refs | `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort` |
| Admin technical details and incident links | Notifications/Admin-Observability | Redacted error detail, incident/ErrorGroup refs, retry/correlation ids, admin-only disclosure content | `ErrorCapturePort`, `AuthorizationPort`, `EventBusPort` |
| Blank slates for projects and shell surfaces | Project Management, App Shell composition | No projects, empty project lists, empty to-dos/cards/boards, no-match filters, creation affordance admission | `AuthorizationPort`, `EventBusPort` |
| Blank slates for tools and connections | External Channels, Tenant Provisioning/Platform-Ops | Linked-tool empty state, connection status, setup intent, health projection | `OpenClawGatewayPort`, `GatewayRuntimePort`, `SecretsVaultPort`, `AuthorizationPort` |
| Notification and toast state | Notifications/Admin-Observability | Notification row, unread count, mark read, delivery result, alert severity, toast event | `RealtimeTransportPort`, `PushNotificationPort`, `EventBusPort` |
| Accessibility-related user settings | Identity & Access | Appearance preference, theme preference, motion/density preference where product-managed | `AuthPort`, `AuthorizationPort` |
| File, asset, and image alt text requirements | Knowledge Management, Marketing/Dept-Workflows, Project Management as owners | Document/file metadata, generated asset refs, descriptive labels, upload validation | `ObjectStorePort`, `KnowledgeSourcePort`, `AuthorizationPort` |

## OpenClaw-parity notes

- OpenClaw does not own Opzava's design system, tokens, component inventory, accessibility acceptance, blank-state copy, or shell mode.
- Opzava must harness OpenClaw runtime state only through the ADR-003 broker ACL and the existing ports, never by reading Gateway storage or leaking Gateway DTOs into components.
- Runtime truth such as sessions, tasks, logs, diagnostics, usage, channels, cron, memory, skills, and Workboard remains OpenClaw-owned per ADR-004. Opzava screens display projections, summaries, opaque refs, or live read-through state according to the owning PRD.
- OpenClaw WS events are hints. UI live badges and stale states must tolerate duplicate, missing, delayed, or out-of-order events and reconcile from durable read models or broker snapshots.
- Gateway downtime must not turn Opzava-owned data into an error page. Durable project, chat, CRM, finance, knowledge, incident, billing, and settings state should remain usable where authorized, with runtime panels degraded separately.
- OpenClaw error details shown to admins must be redacted and scoped by Notifications/Admin-Observability rules from ADR-013.
- Workboard state may appear only as projected agent-work or diagnostic status. It must not define Opzava PM card UI identity.
- OpenClaw approvals, tool policy, channel health, skills, memory status, and runtime traces may inform component states, but Opzava owns the visible status vocabulary and accessibility behavior.

## Acceptance criteria

- PRD-002 app-shell surfaces use the shared token and component contract for Essential and Full/admin modes.
- The production design-system inventory covers every component category listed in this PRD with default, hover, focus, active/selected, disabled, loading/pending, error, empty, and destructive states where applicable.
- Tailwind and shadcn/ui styling consume Opzava tokens rather than page-local values for shared visual decisions.
- No shared component uses body text below 15px except approved tertiary metadata at 13px.
- Every route and panel with data fetching defines Loading, Loaded, Empty, and Error behavior.
- Every list with filters or search defines no-match behavior.
- Every tenant-scoped list distinguishes forbidden from empty and returns a hard forbidden experience on missing tenant context or authorization denial.
- Runtime-backed panels define stale, reconnecting, Gateway unavailable, and retry/degraded behavior where live OpenClaw state can fail.
- Every first-use or empty blank slate has plain copy, one primary CTA when authorized, and no raw technical detail.
- Essential error states hide raw codes and provider details by default.
- Admin technical details are disclosed only to authorized users and are collapsed/redacted by default.
- Color is never the only status, severity, validation, actor, trend, or category signal.
- All icon-only controls have accessible names.
- Dialogs, menus, popovers, tabs, command palettes, and drawers pass keyboard and focus-management checks.
- Forms connect labels, hints, and validation errors semantically.
- Tables have semantic headers/captions or accessible names and usable mobile table-card behavior.
- Toasts and banners use appropriate live-region roles and do not create competing global alert stacks.
- Motion honors reduced-motion preferences.
- Text and actions do not overlap, clip, or become unreachable at mobile widths or 200 percent zoom.
- Contrast meets WCAG AA for text, meaningful icons, focus indicators, form borders where meaningful, and status indicators.
- Accessibility violations block acceptance unless explicitly documented and approved as exceptions.
- No design-system examples or copy-command components expose secrets, long-lived credentials, raw provider tokens, or Gateway operator tokens.

## Testing decisions

- Test at the highest UI composition seam practical: route/page behavior for screens, shared component behavior for reusable primitives, and application service/query seams for state classification.
- Do not test implementation details such as CSS class names where a behavior or accessible output can be tested instead.
- Use component tests for shared primitives: buttons, forms, switches, tabs, menus, dialogs, popovers, command palette, tables, badges, progress, skeletons, toasts, banners, empty states, and error states.
- Use accessibility assertions for accessible names, roles, labels, `aria-invalid`, `aria-describedby`, tab semantics, dialog focus, progressbar values, live-region roles, and icon-only controls.
- Use keyboard interaction tests for tab order, Enter/Space activation, Escape close, arrow-key navigation, focus trap, and focus restoration.
- Use screen-level tests for Loading, Loaded, Empty, No-match, Error, Forbidden, Stale, Offline/Reconnecting, Gateway unavailable, Validation error, Conflict, Approval required, and Retry where the screen supports those states.
- Use authorization tests at route/server-action/query seams to assert 403 behavior rather than 200-empty for missing tenant context or denied resources.
- Use visual regression or screenshot review for token/theme adoption, responsive wrapping, no overlap, no clipped text, and consistent blank-state layout.
- Use automated contrast checks against the token themes, with manual review for token combinations that automated tooling cannot infer.
- Use reduced-motion tests or snapshots to verify shimmer, heartbeat, typing, and entrance animations are disabled or reduced when requested.
- Use realtime/reconnect tests at the event boundary to verify stale labels, duplicate handling, backfill state, and live-watermark transitions rather than broker internals.
- Use admin-only error detail tests to verify everyday users cannot see technical disclosures while authorized admins can open redacted details.
- Prior art: follow the PRD-002 shell testing seam for navigation/search/notification state, PRD-012 observability testing seam for admin errors and alerts, and PRD-016 PWA/offline testing seam for offline gates and push-safe notifications.

## Dependencies

- Depends on PRD-002 for app shell, navigation, command palette, project switcher, notification count, and global shell state adoption.
- Informs all existing feature PRDs because token, component, async, blank-state, and accessibility rules apply across all screens.
- Depends on ADR-001 for Next.js App Router, TypeScript, shadcn/ui, Tailwind, and modular DDD.
- Depends on ADR-004 for hybrid CQRS, projection freshness, OpenClaw runtime ownership, and live read-through boundaries.
- Depends on ADR-007 for authorization, RLS, and hard 403 behavior on missing tenant context.
- Depends on ADR-009 for realtime/live state, PWA/offline behavior, notifications, and assistant stream conventions.
- Depends on ADR-013 for admin error disclosure, redaction, incident linkage, and retry/remediation context.
- Related to ADR-005 where tool-policy and approval state appear in UI, but this PRD does not change those controls.
- Related to ADR-006 and PRD-016 for PWA auth gates, service-worker constraints, and push-safe notification surfaces.
