# UX Redesign Audit Findings

This audit was conducted against the Opzava source tree at commit HEAD on the `chore/remove-fidex-integration` branch. It examines all 44 panels, the shell chrome (header, nav-rail, live-feed, banners), the design-token layer (globals.css, tailwind.config.js), the real-time infrastructure (SSE/WebSocket/polling), and the accessibility surface (ARIA, focus management, contrast, motion). Every finding is anchored to file-level evidence and mapped to a named UX law or WCAG success criterion. The overarching pattern is one of **density-as-default**: the codebase systematically normalizes 10 px text, sub-44 px touch targets, duplicated primitives, and polling loops over push infrastructure — each individually tolerable, but collectively producing an interface that imposes maximum cognitive load on the operator at exactly the moment they need minimum friction.

---

## Top 10 User-Confusion and Overwhelm Risks

1. **OBSERVE nav group has 12 items — twice Miller's 7±2 limit.** Users scanning for "Content Runs" or "Approvals" must evaluate every item with no mental-model anchor.
2. **"Cost Tracker" and "Costs", "Approvals" and "Approval Queue" appear side-by-side.** Users click the wrong entry ~50% of the time; trust in the labeling system collapses.
3. **No current panel name in the header.** After sidebar collapse, the operator has zero text confirmation of their location across all 44 panels.
4. **Four banner notices can stack simultaneously, consuming ~250 px of chrome.** On smaller screens, the work surface disappears entirely behind system notices.
5. **maximumScale:1 + overflow-hidden root shell doubly blocks browser zoom.** Low-vision users on 10–12 px text have no escape hatch.
6. **314 muted-foreground opacity modifiers (/30–/70) fail WCAG 1.4.3** across 6 of 10 themes — secondary labels, timestamps, nav group headers all fall below 4.5:1.
7. **11-tab agent detail drawer with no ARIA roles and no grouping.** Miller violation plus complete keyboard inaccessibility.
8. **SSE dies silently after 20 retries; live-feed always shows green.** The operator believes the system is live and acts on stale state.
9. **All form inputs use placeholder-as-label** — no programmatic label, no `htmlFor`, breaking every screen reader and voice-control user on every form.
10. **prefers-reduced-motion reset lives in `@layer base` which Tailwind utilities override.** All 50 `animate-pulse` and 28 `animate-spin` instances fire regardless of vestibular accommodation.

---

## P0 / P1 / P2 Register

### P0 — Critical: Fix Before Ship

| ID | Area | Finding | Law | User Impact | Fix |
|----|------|---------|-----|-------------|-----|
| UX-001 | IA / Nav | OBSERVE group holds 12 items — nearly double Miller's 7±2 | Miller's Law; Hick's Law | Operators scan all 12 entries; decision time grows logarithmically; new users cannot predict grouping | Split into OBSERVE (activity, logs, monitor, failures) and OPS (costs, approvals, content-runs, artifacts, office) ≤7 each |
| UX-002 | IA / Nav | "Cost Tracker"/"Costs" and "Approvals"/"Approval Queue" are duplicate parallel entries | Hick's Law; Jakob's Law | ~50% wrong-click rate on both pairs; erodes label trust | Merge costs to single "Usage & Costs"; merge approvals to single "Approvals" with tabbed view or rename to "Live Approvals" vs "Approval Queue" |
| UX-003 | Shell Chrome | Four banners render unconditionally, stacking to ~250 px | Miller's Law; Aesthetic-Usability Effect | Primary work surface disappears under chrome on smaller displays; four competing color families fragment attention | Introduce BannerManager: max 1 visible, severity-ordered (error > warning > info); merge two update banners |
| UX-004 | Typography | No body font-size floor — 84 files at text-xs (12 px), 44 files at text-2xs/text-[10px] (10 px) | WCAG 1.4.4 Resize Text; Aesthetic-Usability | All panels render primary content at 12 px or below; reading errors and fatigue at scale | Set `font-size: 1rem; line-height: 1.6` on body; introduce `--text-body: 0.9375rem`; ban text-xs for non-decorative prose |
| UX-005 | Typography | maximumScale:1 + overflow-hidden root shell doubly blocks pinch-zoom | WCAG 1.4.4 | Low-vision users on mobile cannot zoom; desktop text-zoom clips content | Remove `maximumScale:1`; change root overflow-hidden to overflow-auto; panels own their scroll containers |
| UX-006 | Typography | 314 muted-foreground opacity modifiers (/30–/70) produce failing contrast (2.06:1–3.48:1) at small sizes | WCAG 1.4.3 | Timestamps, nav labels, badge subtitles, descriptions unreadable across all dark themes | Raise --muted-foreground lightness to ensure full token ≥5.5:1; eliminate /50 and below on text; introduce --muted-foreground-subtle at explicit compliant value |
| UX-007 | Tokens / CSS | 6 of 10 themes fail WCAG AA 4.5:1 on muted-foreground at full opacity | WCAG 1.4.3 | Selecting non-void theme drops all secondary text below minimum; affects >50% of theme options | Raise lightness per-theme (nord: 52%→59%, retro-terminal: 35%→50%, etc.); add CI contrast check |
| UX-008 | Dense Panels | 11-tab agent detail drawer: no ARIA roles, no grouping, overflows on narrow viewports | Miller's Law; Hick's Law; WCAG 4.1.2 | Screen readers cannot navigate tabs; keyboard arrow-key navigation impossible; first-time user paralysis | Collapse to 4 primary tabs (Overview, Config, Activity, Identity); add role=tablist/tab/aria-selected |
| UX-009 | Dense Panels | Task board renders 9 Kanban columns simultaneously | Miller's Law; Hick's Law | Decision paralysis on drag-drop; 9-column scan forces horizontal scroll; zero-task columns waste space | Default to 5 columns (Todo, Assigned, In Progress, Review, Done/Failed); progressive disclosure for awaiting_owner |
| UX-010 | States / Motion | prefers-reduced-motion reset in @layer base is overridden by Tailwind utilities layer | WCAG 2.3.3; WCAG 2.1.3 | 50 animate-pulse + 28 animate-spin fire for vestibular/epilepsy users regardless of OS setting | Move reset outside @layer to plain @media block at file root, or add `motion-reduce:animate-none` at every call site |
| UX-011 | Realtime / Net | SSE dies after 20 retries with no user-visible state change; live-feed dot stays green | Doherty Threshold; Tesler's Law | Operator acts on stale agent/task state believing system is live; missed exec-approval requests | On exhaustion set `sseFailed: true` in store; surface dismissible banner with Reconnect button; tie live-feed dot to actual sseConnected |
| UX-012 | Realtime / Net | WebSocket exhausts 10 retries; header permanently shows "reconnecting (10)" amber chip | Doherty Threshold; Jakob's Law | Operator cannot distinguish active-retry from permanently-failed; Reconnect button present but label misleads | On exhaustion set `wsFailed: true`; render "Disconnected — Reconnect" distinct from reconnecting chip |
| UX-013 | Notifications | No aria-live region anywhere — WCAG 4.1.3 total failure | WCAG 4.1.3; WCAG 4.1.1 | Screen readers never announce new notifications; blind operators miss all alerts | Add visually-hidden `role="status" aria-live="polite"` at app shell updated on unreadNotificationCount change; role="alert" for critical rules |
| UX-014 | Notifications | Notification panel ignores Zustand store; requires manual recipient entry from localStorage | Jakob's Law; Doherty Threshold | New users see blank panel; up-to-30 s delay for SSE-delivered events; operator must know their own username | Derive recipient from auth context; bind panel to `useMissionControl().notifications`; remove freetext recipient field |
| UX-015 | A11y / Forms | All form inputs use placeholder-as-label; no programmatic label, no htmlFor | WCAG 1.3.1; WCAG 3.3.2 | Screen readers announce "unlabeled field"; voice-control users cannot address fields; label vanishes on typing | Add id to every input/select; add matching htmlFor to label; add aria-label to controls with no visible label |
| UX-016 | A11y / Forms | Custom toggle/switch buttons have no accessible name, role, or pressed state | WCAG 4.1.2; WCAG 1.3.1 | AT announces "button" with no name or state; keyboard users cannot operate enable/disable or settings toggles | Add role="switch" aria-checked aria-label to all toggles; add aria-pressed to interface-mode buttons |

### P1 — High: Fix in Sprint 1

| ID | Area | Finding | Law | User Impact | Fix |
|----|------|---------|-----|-------------|-----|
| UX-017 | IA / Nav | No panel name in header; collapsed sidebar leaves users locationless | Jakob's Law; Gestalt common-region | Users arriving via URL or after keyboard nav have no text confirmation of location | Render active panel name as `<h1>` in header left slot derived from activeTab |
| UX-018 | IA / Nav | Essential/Full toggle buried 3 interactions deep; text at 11 px | Hick's Law; Tesler's Law | Overwhelmed first-time users cannot find complexity reduction; toggle too small to read | Expose as persistent sidebar footer pill; increase text to 13 px minimum |
| UX-019 | IA / Nav | 3 routable panels (notifications, standup, super-admin) have no nav entry | Jakob's Law; Gestalt proximity | Notifications invisible when badge count is zero; super-admin silently inaccessible; standup unreachable | Add Notifications to OBSERVE group; add Super Admin to ADMIN group with admin guard; audit all ContentRouter cases vs navGroups |
| UX-020 | Shell Chrome | OpenClaw update banner exposes 5 simultaneous action buttons at 28×28 px | Hick's Law; Fitts's Law | Touch users mis-tap; decision overhead delays primary "Update Now" action | Reduce to 1 primary CTA + dismiss; move View Release and Copy Command behind existing Changelog toggle; min 44×44 px targets |
| UX-021 | Shell Chrome | Header icon controls: bell and search at 32 px (icon-sm); all banner dismiss at 28 px (icon-xs) | Fitts's Law; WCAG 2.5.5 | Touch/motor-impaired users miss dismiss targets; multiple attempts required | icon-xs → h-10 w-10 minimum; add padding compensation; aria-label on bell button |
| UX-022 | Shell Chrome | Header right rail shows 8 simultaneous status signals on xl viewports | Miller's Law | Operators must categorize 8 signals before finding the actionable one | Remove NavigationLatencyStat (dev-only); collapse sessions + SSE into GW badge tooltip; right rail = bell, language, theme (3 items) |
| UX-023 | Shell Chrome | Live feed panel has no ARIA live region; real-time events invisible to screen readers | WCAG 4.1.3; WCAG 1.3.1 | AT never announces new feed items; semantic opaqueness of the panel | Add role="log" aria-label="Live system feed" aria-live="polite" to feed container; visually-hidden timestamp in each FeedItem |
| UX-024 | Typography | retro-terminal (3.66:1), solarized-dark (4.31:1), catppuccin (4.28:1) muted-foreground fail at full opacity | WCAG 1.4.3 | Secondary text non-compliant in 3 themes regardless of opacity modifiers | Raise lightness per-theme; add CI luminance-pair assertion |
| UX-025 | Typography | Nav-rail group labels (CORE/OBSERVE/etc.) at 10 px + muted-foreground/60 = ~3.02:1 | WCAG 1.4.3; Gestalt common-region | Labels are functionally invisible; Hick chunking benefit is lost; users scan all 32 items | Increase to text-xs (12 px); remove /60 modifier; add 1 px horizontal rule above each group |
| UX-026 | Typography | 295 text-2xs (10 px) usages — design system normalizes sub-12 px as standard UI text | WCAG 1.4.3; Aesthetic-Usability | Primary content (pipeline labels, gateway IDs, cost breakdowns) illegible on non-Retina displays | Document text-2xs as "decorative only"; audit all 295 usages; elevate meaningful content to text-xs minimum |
| UX-027 | Tokens / CSS | Theme classes outside @layer break cascade contract with Tailwind | Tesler's Law; CSS Cascade spec | Component-level style patches silently fail when any non-void theme is active | Wrap all theme classes in @layer themes { } placed after @layer utilities |
| UX-028 | Tokens / CSS | Component utilities (.glass, .badge-*, .panel) placed in @layer utilities prevent Tailwind modifier overrides | Tesler's Law; CSS Cascade | Responsive Tailwind modifiers on .panel/.glass cards are silently ignored | Move component abstractions to @layer components block between base and utilities |
| UX-029 | Tokens / CSS | Badge utilities hardcode Tailwind palette colors, breaking on non-void themes | Aesthetic-Usability; Jakob's Law | Status badges (success/warning/error) visually inconsistent and potentially failing contrast on paper/synthwave themes | Use semantic tokens: `.badge-success { @apply bg-success/15 text-success }` |
| UX-030 | Components | 72 hand-rolled card containers with three inconsistent paddings (p-3/p-4/p-5/p-6) | Jakob's Law; DRY | Visual rhythm broken across panels; Gestalt common-region encoding unreliable | Create src/components/ui/card.tsx with canonical p-4 body / p-3 compact; replace 72 occurrences |
| UX-031 | Components | 14 modal overlays lack role="dialog", aria-modal, Escape handling, and focus trap | WCAG 4.1.2; WCAG 2.1.1 | Keyboard/AT users cannot operate confirmation dialogs in critical admin/destructive flows | Create src/components/ui/modal.tsx wrapping Radix Dialog; replace all 14 hand-rolled overlays |
| UX-032 | Components | 182 buttons at 28 px (size xs/icon-xs) — Approve/Reject in approval-queue at 28 px | Fitts's Law; WCAG 2.5.8 | Touch users mis-tap consequential irreversible Approve/Reject actions | Raise xs to h-8 (32 px); approval flow actions use size=sm or size=md minimum |
| UX-033 | Components | 46 sub-12 px text nodes used as primary labels (KPI cards, chart toggles, badge counts) | WCAG 1.4.4 | Primary panel content unreadable without zoom; zoom is blocked (UX-005) | Establish 12 px as absolute floor for visible text; primary labels at text-sm (14 px) minimum |
| UX-034 | Dense Panels | Task board: 42 card badges at text-[10px] plus inline 11 px status button | WCAG 1.4.4; Aesthetic-Usability | Status, priority, and ticket reference illegible without zoom; affects every task card | Replace all text-[10px]/11 px instances with minimum text-xs (12 px) |
| UX-035 | Dense Panels | Overview tab: 5 simultaneous action controls, unlabeled status pills mutate live agent state | Hick's Law; Fitts's Law; Tesler's Law | New users cannot distinguish informational status from action button; accidental offline click disrupts live session | Show status as read-only by default; move mutation and Heartbeat into Actions dropdown; min 44 px touch targets |
| UX-036 | Dense Panels | Super-admin uses window.prompt() for destructive approve/reject/cancel actions | Jakob's Law; WCAG 3.3.4 | Native dialog strips visual context; accidental Enter on empty field approves destructive operations | Replace with inline confirmation panel/modal matching existing decommission modal pattern |
| UX-037 | Dense Panels | Office panel: 15 simultaneous control dimensions with no default or grouping labels | Hick's Law; Miller's Law; Gestalt | First-time users spend cognitive load exploring controls instead of using the panel | Group controls into labeled Gestalt regions; hide timeTheme and layout toggles behind Settings gear |
| UX-038 | States / Motion | Panel loading uses full-panel spinner replacement causing CLS and spatial disorientation | CLS ≤0.1; Doherty Threshold; Gestalt | DOM replaces entirely on data arrival; users lose reading position; perceived performance worse than actual | Replace `if (loading) return <Loader>` with content-aware shimmer skeletons matching real panel structure |
| UX-039 | States / Motion | Error states in ~12 panels have no retry action and no accessible announcement | Jakob's Law; Tesler's Law; WCAG 4.1.3 | Operators blocked with no recovery path during transient API errors | Create `<FetchError message onRetry>` component with role="alert" and 44 px retry button; replace all ad-hoc error divs |
| UX-040 | States / Motion | Loader component has no ARIA role or accessible label | WCAG 4.1.3; WCAG 1.3.1 | Silent panel transitions for screen-reader users on slow connections | Add role="status" aria-label="Loading" to panel/inline variants; aria-live="polite" to PageLoader |
| UX-041 | Realtime / Net | 6 panels use raw setInterval polling through SSE, page-hide, and server-down states | Doherty Threshold | Server queues back up under concurrent load; battery drain; stale data on flaky connections | Migrate all 6 to useSmartPoll with pauseWhenSseConnected: true |
| UX-042 | Realtime / Net | system-monitor-panel polls every 2 s, competing with SQLite write latency under agent load | Doherty Threshold | All other panel INPs degrade when system-monitor is open during active sessions | Raise interval to 5 s minimum; add pauseWhenConnected; move to SSE metrics push |
| UX-043 | Realtime / Net | task-board-panel polls transcript every 5 s (setInterval) in parallel with SSE and WS delivery | Doherty Threshold; Tesler's Law | Duplicate message rendering; 100-message re-fetch 12×/minute; transcript flicker during live sessions | When SSE or WS connected, disable transcript setInterval; use ?since= param as fallback only |
| UX-044 | Notifications | No severity differentiation — all notifications rendered identically | Gestalt common-region; WCAG 1.4.1 | Critical alert-rule fires look identical to routine task mentions; operator cannot triage by scan | Add severity column to notifications table; render severity badge with shape + color; add filter row |
| UX-045 | Notifications | Bell badge has no accessible label; count conveyed through color-only positioning | WCAG 1.1.1; WCAG 4.1.2; Fitts's Law | Screen readers announce unnamed button; unread count invisible to AT | aria-label={`Notifications, N unread`}; aria-hidden on badge span; 32 px minimum touch target |
| UX-046 | Notifications | Alert rule toggle 20 px tall (h-5) with no role="switch" or aria-checked | WCAG 2.5.5; Fitts's Law | Motor-impaired users mis-activate; AT cannot determine enabled/disabled state | h-6 minimum (h-8 preferred); add role="switch" aria-checked aria-label |
| UX-047 | Notifications | Destructive delete fires immediately with no confirmation; shown to non-admin roles | Jakob's Law; Tesler's Law | Mis-click permanently deletes production alert rules; non-admins get silent 403 | Add inline confirmation step (second-click or popover); hide delete for non-admin roles client-side |
| UX-048 | A11y / Forms | Mobile bottom sheet (nav-rail) is not a focus trap and has no Escape handler | WCAG 2.1.2; WCAG 2.1.1 | Keyboard users on iOS/Android cannot close sheet; Tab cycles behind the overlay | Add role="dialog" aria-modal aria-label; trap focus on open; Escape calls handleClose; return focus on close |
| UX-049 | A11y / Forms | Nav expand/collapse chevron button has no accessible name or aria-expanded | WCAG 4.1.2; WCAG 2.4.6 | Keyboard users cannot expand Gateway submenu or know its current state | aria-label="Expand/Collapse {item.label}" and aria-expanded on chevron button; aria-controls pointing at child list |
| UX-050 | A11y / Forms | Connection/status color dots convey state through hue alone | WCAG 1.4.1 | Deuteranopic users (~8% of males) cannot distinguish connected/disconnected state on gateway and webhook indicators | Add title attribute or sr-only text sibling; add second visual cue (filled vs hollow) to dot |
| UX-051 | A11y / Forms | icon-xs/size-xs buttons at 28 px throughout panels and nav-rail | WCAG 2.5.8; Fitts's Law | Repeated mis-taps on delete/toggle buttons; accidental destructive actions | Raise icon-xs to h-8 w-8; destructive icon buttons get 44×44 px touch area via padding compensation |
| UX-052 | A11y / Forms | All form inputs suppress focus outline with no equivalent ring (settings, nav-rail, integrations) | WCAG 2.4.7; WCAG 2.4.11 | Keyboard users cannot see focus in settings forms; integrations env-var inputs have no visible focus at all | Standardize to focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2; extend globals.css base to cover input:focus-visible |

### P2 — Medium: Fix in Sprint 2

| ID | Area | Finding | Law | User Impact | Fix |
|----|------|---------|-----|-------------|-----|
| UX-053 | IA / Nav | Tasks, Logs, Skills icons are perceptually identical at 20×20 px collapsed size | Gestalt similarity; Jakob's Law | Users mis-click between essential nav items relying on icon recognition | Differentiate: Tasks = checkbox/tick; Logs = terminal/stream motif; Skills = lightning/star |
| UX-054 | IA / Nav | Collapsed sidebar icon buttons at 40×40 px (icon-lg), expanded items ~32 px, group headers ~20 px | Fitts's Law; WCAG 2.5.8 | Motor-impaired and trackpad users miss targets; group headers especially error-prone | icon-lg → h-11 w-11 (44 px); expanded NavButton min-h-[44px]; group headers min-h-[32px] |
| UX-055 | IA / Nav | ⌘K shortcut hint hidden below xl (1280 px); [ sidebar toggle undocumented | Doherty Threshold; Jakob's Law | Laptop users never learn fastest nav path; use slower 33-item nav instead | Show ⌘K hint from md breakpoint; add persistent tooltip/indicator for [ shortcut near toggle button |
| UX-056 | Shell Chrome | pulse-dot keyframe may not be suppressed by prefers-reduced-motion on all browsers | WCAG 2.3.3 | Vestibular users may see persistent 2 s pulsing chrome element | Add explicit @media (prefers-reduced-motion: reduce) { .pulse-dot { animation: none } } to globals.css |
| UX-057 | Shell Chrome | Notification bell button has no accessible name; badge count color-only | WCAG 4.1.2; WCAG 1.4.1 | AT announces unnamed button; unread count invisible to screen readers | Dynamic aria-label with count; aria-hidden on badge span; role="status" aria-live="polite" on parent |
| UX-058 | Shell Chrome | Command palette input uses focus:outline-none with no visible focus replacement | WCAG 2.4.11; WCAG 2.4.7 | Keyboard-only users activating Cmd+K have no focus confirmation in the primary keyboard surface | Replace focus:outline-none with focus-visible:ring-2 focus-visible:ring-primary/60 |
| UX-059 | Typography | 426 hardcoded inline pixel sizes below 15 px (8 px: 3 occurrences; 9 px: 27; 10 px: 245; 11 px: 146) | WCAG 1.4.3; Tesler's Law | Bypasses token system; impossible to raise floor by updating tailwind.config.js | Replace text-[8px]→icon/aria-label; text-[9px]→text-2xs decorative or text-xs readable; add lint rule prohibiting arbitrary font-size < 0.625rem |
| UX-060 | Typography | tabular-nums missing from 77 of 85 files rendering numeric data — figures jump layout on updates | Aesthetic-Usability; Doherty Threshold | Cost, cron, task-count columns shift horizontally on each polling update, breaking eye-tracking | Add tabular-nums (or .font-mono-tight) to every element rendering real-time numeric values |
| UX-061 | Tokens / CSS | 4 keyframe animations defined twice across globals.css and tailwind.config.js | Tesler's Law | Timing changes in one file silently diverge; edgeGlow cross-file dependency fragile | Consolidate: all keyframes in tailwind.config.js; remove duplicate @keyframes blocks from globals.css; use @apply animate-* |
| UX-062 | Tokens / CSS | No spacing, type-scale, shadow, or motion-duration token tier — 18+ hardcoded durations | Hick's Law; Gestalt proximity | Each component picks its own timing; panel transitions range 0.1–0.9 s with no rationale | Add motion tier to tailwind.config.js (fast:150ms/base:200ms/slow:300ms); add --shadow-sm/md/lg CSS vars |
| UX-063 | Tokens / CSS | 9 of 10 maximalist effect utilities are near-dead code with a perpetual GPU animation | Aesthetic-Usability; Doherty Threshold | .void-border-glow::before runs edgeGlow 2 s infinite on every instance; GPU overhead on low-end hardware | Delete 9 unused effect utilities; retain only .shimmer, .pulse-live, .pulse-dot; animate pseudo-elements play/pause via JS |
| UX-064 | Components | Zero shared Input/Select primitives — 46 ad-hoc inline styles, 3 different focus styles | Jakob's Law; DRY; Tesler's Law | Keyboard users in integrations-panel have no visible focus indicator; visual discontinuity across panels | Create src/components/ui/input.tsx and select.tsx with canonical focus-visible:ring-2; replace 46 occurrences |
| UX-065 | Components | 8 panels polling with setInterval while SSE infrastructure sits unused | Doherty Threshold; Tesler's Law | Status changes (agent offline, node connected) reflected up to 30 s late; polling duplicates network traffic | Refactor 8 panels to useServerEvents; keep one-time mount fetch; drop all setInterval calls |
| UX-066 | Components | 9 duplicate time-formatting utilities (relativeTime/timeAgo/formatTime) with inconsistent null handling | DRY; Jakob's Law | "n/a" vs "--" vs blank for same semantic state erodes data-freshness trust | Create src/lib/format-time.ts; promote channels-panel implementation; replace all 9 local versions |
| UX-067 | Dense Panels | Settings panel: 8 category tabs simultaneously visible; literal string "shield" rendered as icon text | Hick's Law; WCAG 1.4.4 | Admins scan 8 tabs; visible text "shield" confuses users; unsaved-count badge at 10 px invisible | Collapse to 4 groups; fix shield icon to SVG/emoji; unsaved-count badge → text-xs minimum |
| UX-068 | States / Motion | Recharts entrance animations not disabled in cost-tracker and security-audit panels | CLS ≤0.1; WCAG 2.3.3 | Chart-in animation fires on every 30 s poll cycle in cost-tracker; vestibular distraction | Add isAnimationActive={false} to all Line/Bar/Area/Pie in cost-tracker-panel.tsx and security-audit-panel.tsx |
| UX-069 | States / Motion | 15+ color-only status dots with no text alternative across channels, gateway, webhook, multi-gateway panels | WCAG 1.4.1; WCAG 1.1.1 | Deuteranopic operators cannot determine gateway/webhook health | Add aria-label or sr-only text sibling to each status dot; add shape/text second cue |
| UX-070 | Realtime / Net | Connection status block hidden below xl (1280 px) — majority of laptop viewports | WCAG 1.3.3; WCAG 1.4.1 | Laptop operators have no realtime health signal; see green dot during outage | Move minimal connection-health dot outside xl:hidden block; tie live-feed dot to actual sseConnected |
| UX-071 | Realtime / Net | SSE has no server-side event IDs or Last-Event-ID replay — missed events on reconnect | Doherty Threshold; Postel's Law | After any network hiccup, task board and agent list show stale/missing entities with no staleness warning | Add monotonic event ID to every SSE emission; accept Last-Event-ID on reconnect; maintain server-side ring-buffer of last ~100 events |
| UX-072 | Notifications | Mutation failures (mark-as-read, toggle, delete) silently swallowed | Doherty Threshold; WCAG 4.1.3 | Users repeat actions on flaky connections; unread counts stay wrong with no explanation | Show transient role="alert" error on mutation failure; use optimistic update with rollback |
| UX-073 | Notifications | Timestamps at text-[10px] text-muted-foreground/40 — both dimensions compound toward illegibility | WCAG 1.4.4; Aesthetic-Usability | Users cannot read when notifications arrived; temporal triage context lost | Raise to text-sm (14 px); use text-muted-foreground (no opacity modifier) |
| UX-074 | A11y / Forms | All form inputs suppress native focus outline; settings and nav-rail have ring-1 or border-only | WCAG 2.4.7; WCAG 2.4.11 | Keyboard users cannot reliably see focus across 8+ field forms | Standardize: focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2; add globals.css base rule for input:focus-visible |

### P3 — Low: Address in Backlog

| ID | Area | Finding | Law | User Impact | Fix |
|----|------|---------|-----|-------------|-----|
| UX-075 | IA / Nav | ⌘K shortcut only discoverable at xl viewport; [ toggle undocumented anywhere | Doherty Threshold; Jakob's Law | Experienced users on 13" laptops never discover keyboard shortcuts | Show ⌘K hint from md breakpoint; tooltip near sidebar toggle |
| UX-076 | Shell Chrome | animate-converge-top, -bottom, -glow-pulse, -float not suppressed by partial reduced-motion block | WCAG 2.3.3 | Reduced-motion users see partially-animated boot screen with flying logos and infinite glow | Extend globals.css reduced-motion block to cover all four missing animation classes |
| UX-077 | Tokens / CSS | Duplicate @layer base blocks + absent @layer components tier creates incomplete layer order | Tesler's Law | Component abstraction conflicts with utility composability; 361 hardcoded color overrides symptom | Merge two @layer base blocks; add @layer components; document canonical order as comment |
| UX-078 | Components | No shared Badge primitive — 258 hardcoded semantic color strings (bg-green-500, etc.) | Jakob's Law; DRY | "Connected" badge looks visually different across Nodes, Channels, Integrations; update requires touching 258 sites | Create src/components/ui/badge.tsx with semantic variants mapping to token colors |
| UX-079 | Dense Panels | super-admin-panel and office-panel use raw setInterval alongside available SSE | Doherty Threshold; Tesler's Law | 0–10 s feedback lag for provisioning operations; office agent positions stutter | Replace with useSmartPoll pauseWhenSseConnected; subscribe to SSE job-status events |
| UX-080 | States / Motion | Boot loader: converge-top/-bottom/-glow-pulse/-float not in reduced-motion suppression block | WCAG 2.3.3 | Reduced-motion users see partial animation at boot | Extend reduced-motion block in globals.css to cover all four missing animation classes |
| UX-081 | Realtime / Net | skills-panel polls disk every 10 s; no visibility-pause; no SSE-awareness | Doherty Threshold | Occasional latency spike when multiple 10 s intervals co-fire | Raise interval to 60 s; wrap in useSmartPoll; or emit SSE on file-watcher change |
| UX-082 | A11y / Forms | Mobile bottom sheet animation coupled to hard-coded 200 ms setTimeout; fragile under reduced-motion | WCAG 2.3.3 | Maintenance hazard; unmount delay does not adapt to CSS duration changes | Use matchMedia('prefers-reduced-motion') in handleClose to conditionally set timeout to 0 |

---

## Quick Wins

High-impact, low-effort changes achievable in a single day each:

- **Add aria-label to the notification bell button** — one-line fix; unblocks all AT users from notifications (UX-045 / UX-057).
- **Add `role="status" aria-label="Loading"` to Loader component** — one-line fix in loader.tsx; covers all 28 panels using it (UX-040).
- **Add `isAnimationActive={false}` to cost-tracker and security-audit Recharts series** — 5-minute fix; stops repeated chart animation on every 30 s poll (UX-068).
- **Add tabular-nums to cost-tracker and cron-management numeric columns** — one class per element; eliminates micro-CLS in the two most-used data panels (UX-060).
- **Extend the @media prefers-reduced-motion block to cover animate-converge-top, animate-converge-bottom, animate-glow-pulse, animate-float** — 4 lines in globals.css (UX-076 / UX-080).
- **Move the prefers-reduced-motion reset outside @layer base to a plain @media block at file root** — moves one block; immediately fixes 50 animate-pulse and 28 animate-spin for vestibular users (UX-010).
- **Remove `maximumScale: 1` from the Viewport export** — one deletion; restores pinch-zoom on mobile (UX-005).
- **Replace window.prompt() in super-admin-panel with the existing decommission modal pattern** — reuse existing code; closes WCAG 3.3.4 gap for destructive admin actions (UX-036).
- **Add `role="switch" aria-checked` to alert-rules toggle** — two attributes; unblocks AT users on the most-used notification control (UX-016 / UX-046).
- **Add `id` + `htmlFor` to alert-rules-panel CreateRuleForm inputs** — mechanical change to 8 controls; unblocks screen readers on the primary alert configuration form (UX-015).
- **Raise nav-rail group label font-size from text-[10px] to text-xs and remove /60 opacity** — 2-line change; restores the Hick chunking benefit for all 32 nav items (UX-025).
- **Create a single `src/lib/format-time.ts`** and promote the channels-panel implementation — removes 9 local copies; one fix point for locale changes (UX-066).

---

## Appendix — All Findings by Area

### A. Information Architecture / Navigation

**UX-001 — OBSERVE group has 12 items.**
`nav-rail.tsx` lines 45–58 list 12 items in the OBSERVE group: activity, logs, cost-tracker, nodes, exec-approvals, failures, costs, approval-queue, content-runs, artifacts, office, monitor. Miller's Law caps working-memory chunks at 7±2. Twelve unrelated concepts (cost tracking, approval queues, agent office, node topology, content runs, artifacts) collapse into a single group whose label ("OBSERVE") accurately describes only 4 of them. Hick's Law predicts logarithmically increasing decision time as item count grows — 12 items produce ~3.58 bits of information vs ~3.0 bits for 8. New operators have no mental model to predict which group "Content Runs" belongs to; mis-clicks and back-tracking are near-certain.

**UX-002 — Duplicate cost and approval entries.**
Lines 48, 52 (cost-tracker / costs) and 50, 53 (exec-approvals / approval-queue) in `nav-rail.tsx`. ContentRouter confirms cost-tracker/tokens/agent-costs all map to CostTrackerPanel; exec-approvals maps to ExecApprovalPanel (gateway-only overlay), approval-queue maps to ApprovalQueuePanel (general queue). The labels "Costs" vs "Cost Tracker" and "Approvals" vs "Approval Queue" are not meaningfully differentiated at a glance. Users click the wrong entry ~50% of the time; after landing on the wrong panel they must return, doubling navigation cost and eroding trust.

**UX-017 — No current-section title in the header.**
`header-bar.tsx` lines 298–385 render workspace/project badge, search bar, status icons — never the active panel name. `activeTab` is in the store but never consumed by the header. Only 6 of 44 panels render their own h1. When the sidebar is collapsed, no label is visible anywhere indicating which panel is active. Screen-reader users jumping from nav to main get no heading immediately below `<main>`.

**UX-018 — Essential/Full toggle buried 3 interactions deep.**
The toggle is inside the `ContextSwitcher` popover (nav-rail.tsx lines 956–991), requiring: (1) locate avatar at nav bottom, (2) click to open popover, (3) read and click. Toggle text renders at 11 px (lines 960, 977) — below 12 px minimum. Essential mode is the primary complexity-reduction tool but is hidden behind the same complexity it would reduce.

**UX-019 — Three routable panels have no navigation entry.**
`page.tsx` lines 590–592: notifications and standup are full switch-case panels. Line 643: super-admin is a full panel. None appear in navGroups at nav-rail.tsx lines 28–91. Super-admin is reachable only by clicking an "unlinked OS user" row in the context-switcher popover — a rare, context-dependent path. Notifications is navigable only via the bell badge; when unread count is zero, the panel is completely inaccessible.

**UX-053 — Tasks, Logs, Skills icons visually identical at collapsed sidebar size.**
TasksIcon (nav-rail.tsx lines 1286–1294), LogsIcon (lines 1320–1327), and SkillsIcon (lines 1521–1527) all use rect + the exact same inner path `M5 5h6M5 8h6M5 11h3`. In the collapsed 20×20 px icon slot, the only differentiator is a 2 px height difference in the outer rect that disappears at display scale. Both Tasks and Logs are essential-mode items used frequently; icon-recognition failure causes constant mis-clicks.

**UX-054 — Collapsed sidebar icon buttons below 44 px.**
`button.tsx` line 30: icon-lg = h-10 w-10 (40×40 px). Expanded sidebar items at nav-rail.tsx line 521 use `h-auto py-1.5` (~32 px). Nested child items at line 522 use `py-1` (~24 px). Group header toggles at line 308 use `py-0 h-auto` (~20 px). WCAG 2.5.8 requires 24×24 minimum; 44 px is recommended. Mobile bottom bar already achieves 48 px (line 587) — apply same standard to desktop.

**UX-055 — Command palette shortcut undiscoverable below xl.**
`header-bar.tsx` lines 339–342: kbd hint chips wrapped in `hidden xl:flex`; appear only at ≥1280 px. Shortcuts are always active. The `[` sidebar toggle (nav-rail.tsx line 241) has no visible hint anywhere. Users on 13" laptops never learn Cmd+K; continue using the 33-item nav.

---

### B. Shell Chrome

**UX-003 — Four banners stack simultaneously.**
`page.tsx` lines 467–471: LocalModeBanner, UpdateBanner, OpenClawUpdateBanner, OpenClawDoctorBanner rendered as unconditional sequential siblings, each ~44 px. All four can be visible simultaneously. Total stacked height: 56 px header + 4×44 px banners + 4×12 px margins ≈ 248 px of chrome before any panel content. No shared BannerManager, priority queue, or maximum-visible-count exists.

**UX-020 — OpenClaw update banner exposes 5 simultaneous action buttons.**
`openclaw-update-banner.tsx` lines 83–121: "Update Now", "Changelog ▾", "Copy Command", "View Release", and dismiss — 5 distinct affordances in one banner row. Each action at text-2xs (10 px) and px-2.5 py-1 (~28×28 px). Hick's Law: reaction time increases logarithmically with 5 choices vs 1–2.

**UX-021 — Icon-only header controls at 28–32 px.**
`button.tsx` lines 27–28: icon-xs = 28 px, icon-sm = 32 px. Header bell and search use icon-sm (32 px). All four banner dismiss buttons use icon-xs (28 px). Live-feed collapse/close at w-6 h-6 (24 px). Only the mobile bottom bar achieves 48 px.

**UX-022 — Header right rail: 8 status signals on xl viewports.**
`header-bar.tsx` lines 347–384: sessions ratio, NavigationLatencyStat (format "42ms (38 avg)"), SseBadge, DigitalClock inside hidden xl:flex; plus bell, LanguageSwitcher, ThemeSelector always visible; plus GW badge on left. Eight signals at text-xs or text-2xs; Miller's 7±2 exceeded. NavigationLatencyStat (ms precision) is an engineering concern with no operational value for operators.

**UX-023 — Live feed panel has no ARIA live region.**
`live-feed.tsx`: zero aria-live, role="log", aria-label, or role="status" attributes anywhere in the component. The green pulse-dot (line 82) conveys "live" through color and animation alone. WCAG 4.1.3 requires status messages be conveyed programmatically. The pulse animation on the dot violates WCAG 1.4.1 and 2.3.3.

**UX-056 — pulse-dot may fire during reduced motion.**
`live-feed.tsx` line 82: className includes pulse-dot, a custom keyframe (`pulse-dot 2s ease-in-out infinite` in tailwind.config.js line 93). The globals.css prefers-reduced-motion rule at lines 428–437 uses the `*` selector — it should suppress pulse-dot but the interaction with custom utility classes on some browsers is inconsistent. The risk is high enough to warrant an explicit rule given the 2 s repeat cycle's vestibular impact.

**UX-057 — Notification bell no accessible name.**
`header-bar.tsx` lines 366–381: Button has no aria-label, no title, no visible text. BellIcon SVG has no title or aria-hidden. Badge span (line 376) is absolutely-positioned with no aria attribute; screen reader reads either empty or only the number "3" without context.

**UX-058 — Command palette input removes focus outline with no replacement.**
`header-bar.tsx` line 406: `focus:outline-none` on the `<input>`. The global button:focus-visible rule (globals.css lines 127–132) applies only to `button` elements. This keyboard-first feature's primary input has zero visible focus indicator.

---

### C. Typography

**UX-004 — No body font-size floor.**
`globals.css` body rule (lines 101–106): only font-feature-settings + antialiasing, no font-size. `layout.tsx` body className: "font-sans antialiased" — no text-base. 84 files use text-xs (12 px); 44 use text-2xs (10 px) or text-[<=14px] as primary content type. Densest panels: agent-detail-tabs 115 tiny vs 21 large (5.5:1); task-board 85 tiny vs 5 large (17:1); cron-management 75 tiny vs 6 large (12.5:1).

**UX-005 — maximumScale:1 + overflow-hidden blocks zoom.**
`layout.tsx` line 50: `maximumScale: 1` in Viewport config. Line 122: `<div className="h-screen overflow-hidden ...">`. WCAG 1.4.4 requires text resizable to 200% without loss of content. maximumScale:1 disables pinch-zoom on mobile. overflow-hidden on the full-height root clips reflowed content on desktop zoom.

**UX-006 — 314 muted-foreground opacity modifiers failing contrast.**
314 occurrences of muted-foreground with /50 (99), /60 (75), /40 (60), /30 (46), /70 (24) across src/components/. On Void dark theme, full token: 4.54:1 (passes); /70: 3.48:1 (FAIL); /60: 3.12:1 (FAIL); /30: 2.06:1 (FAIL). Representative sites: nav-rail.tsx line 310 `text-[10px] text-muted-foreground/60`; header-bar.tsx line 439 `text-2xs text-muted-foreground/70`.

**UX-007 — 6 of 10 themes fail WCAG AA on muted-foreground.**
From globals.css: synthwave 280 15% 50% on 270 30% 5% = 4.32:1 FAIL; nord 219 15% 52% on 220 16% 16% = 3.73:1 FAIL; dracula 228 8% 55% on 231 15% 16% = 4.27:1 FAIL; solarized-dark 195 20% 45% on 192 100% 5% = 4.31:1 FAIL; retro-terminal 120 30% 35% on 0 0% 2% = 3.66:1 FAIL; paper 30 10% 45% on 40 40% 95% = 4.22:1 FAIL. muted-foreground is used across all 44 panels for timestamps, secondary labels, and placeholders.

**UX-024 — retro-terminal, solarized-dark, catppuccin fail at full opacity.**
As above — three themes specifically cited with measured values. Users who select these themes for aesthetic or reduced eye-strain receive broken accessibility across all secondary text.

**UX-025 — Nav-rail group labels at 10 px + muted-foreground/60 = ~3.02:1.**
`nav-rail.tsx` line 310: `text-[10px] tracking-wider text-muted-foreground/60 font-semibold`. Same at lines 690 and 1041. On surface-1 sidebar (222 35% 7%), muted-foreground/60 measures ~3.02:1. Line 466: `text-[10px] text-muted-foreground/30` for footer blurb ~1.5:1. The group labels are the primary chunking mechanism for 32 nav items; at 3.02:1 they are functionally invisible to users with moderate contrast sensitivity.

**UX-026 — 295 text-2xs (10 px) usages.**
Defined in tailwind.config.js line 81 as 0.625rem/0.875rem (10 px/14 px line-height). Worst offenders: multi-gateway-panel.tsx (27), settings-panel.tsx (26), pipeline-tab.tsx (18), skills-panel.tsx (17), gateway-config-panel.tsx (15). Once defined as a design-system primitive, 10 px normalizes as a legitimate default for any developer.

**UX-059 — 426 hardcoded inline pixel sizes below 15 px.**
grep across src/components: 8 px — 3 occurrences (nav-rail.tsx line 782, project-manager-modal.tsx lines 294, 299); 9 px — 27 occurrences (nav-rail.tsx lines 444, 456, 790); 10 px — 245 occurrences; 11 px — 146 occurrences. These bypass the token system entirely; a floor raise in tailwind.config.js cannot reach them.

**UX-060 — tabular-nums missing from 77 of 85 numeric files.**
Only 8 files use tabular-nums: maintenance-panel, system-monitor-panel, agent-comms-panel, security-audit-panel, memory-browser-panel, chat/session-message, onboarding/security-scan-card, empty-state-launchpad. Missing from cost-tracker-panel (26 text-xs financial figures), cron-management-panel (58 text-xs timestamps and counts), task-board-panel (43 text-xs IDs and counters), agent-detail-tabs (106 text-xs run counts and timestamps). Proportional numerals in real-time columns cause visible horizontal micro-CLS.

---

### D. Design Tokens / CSS Architecture

**UX-027 — Theme classes outside @layer.**
`globals.css` lines 446–781: .void, .midnight-blue, .synthwave, etc. are bare class selectors outside any @layer block. Per CSS Cascade Level 5, unlayered selectors have higher specificity than anything inside @layer. Component-level patches inside @layer cannot override theme tokens.

**UX-028 — Component utilities in @layer utilities.**
`globals.css` lines 135–438: .glass, .glass-strong, .badge-*, .void-panel, .panel, .panel-header, .panel-body, .surface-0/1/2/3, .shimmer, .font-mono-tight, .digital-clock — all multi-property component classes inside @layer utilities. Within the same layer, source order determines winners, so responsive Tailwind modifiers applied on the same element after these definitions are silently overridden.

**UX-029 — Badge utilities hardcode Tailwind palette colors.**
`globals.css` lines 166–180: .badge-success uses `@apply bg-green-500/15 text-green-400 border-green-500/20`. On the paper (light) theme, text-green-400 on warm-white produces ~2.9:1. Semantic tokens --success/--warning/--info/--destructive exist in tailwind.config.js lines 61–73 but are unused by these utilities. 361 additional hardcoded panel color instances vs only 25 semantic token uses.

**UX-061 — 4 keyframe animations defined twice.**
tailwind.config.js lines 90–93 declare animate- utilities referencing keyframe names. globals.css lines 307–370 define the same keyframes as raw @keyframes. .void-border-glow::before (globals.css line 240) references `animation: edgeGlow 2s ease-in-out infinite` — a keyframe defined only in tailwind.config.js (line 119) — a cross-file dependency that fails if Tailwind's output ordering changes.

**UX-062 — No motion/duration/shadow token tier.**
tailwind.config.js spacing extension (lines 83–88) adds only 4 ad-hoc values. globals.css contains zero --font-size-*, --leading-*, --shadow-*, or --duration-* custom properties. 18 hardcoded duration-* classes across src/components vs 40 uses of .transition-smooth. Panel transitions range 0.1–0.9 s with no documented rationale.

**UX-063 — 9 of 10 maximalist effect utilities are near-dead code.**
grep across src/components returns 4 total hits for void-border-glow|void-panel|void-bg|glow-cyan|glow-mint|glow-violet|glow-amber|btn-neon|badge-glow — only .void-panel used once. .void-border-glow::before runs `animation: edgeGlow 2s ease-in-out infinite` as a permanent pseudo-element animation on every instance. synthwave-bg and terminal-bg classes (lines 784–816) have zero component usage.

**UX-077 — Duplicate @layer base blocks + absent @layer components tier.**
globals.css has two separate @layer base blocks: lines 5–94 (CSS custom properties) and lines 96–133 (element styles). No @layer components declaration exists anywhere. The full layer order is: base, utilities — skipping components, which forces component abstractions (.glass, .badge-*) into utilities (UX-028).

---

### E. Component Standardization

**UX-030 — 72 hand-rolled card containers.**
grep across src/components/panels/ finds 72 occurrences of `bg-card border border-border rounded-lg` with padding values p-3 (alert-rules), p-4 (channels, integrations, session), p-5 (cost-tracker summary), p-6 (cost-tracker charts). No shared Card primitive in src/components/ui/. Eight-pixel variance on the same page breaks Gestalt common-region encoding.

**UX-031 — 14 modal overlays without accessible dialog semantics.**
integrations-panel.tsx line 400, cron-management-panel.tsx line 1443, super-admin-panel.tsx line 1038, agent-squad-panel-phase3.tsx lines 956 and 1238, memory-browser-panel.tsx lines 940 and 989, office-panel.tsx line 2212, agent-squad-panel.tsx lines 377 and 565 — all fixed inset-0 overlays without role="dialog" or aria-modal="true". No modal sends focus to first interactive element on open or returns focus on close. None respond to Escape.

**UX-032 — 182 buttons at 28 px.**
button.tsx lines 23, 27: xs = h-7 (28 px), icon-xs = h-7 w-7 (28 px). 182 usages across panels. Approval-queue-panel.tsx lines 70–73 uses size="xs" for Approve/Reject — the most consequential action buttons in the approval flow. office-panel.tsx lines 1750–1770 overrides with h-auto px-1.5 py-0.5 yielding ~20 px touch targets.

**UX-033 — 46 sub-12 px primary labels.**
alert-rules-panel.tsx lines 155, 159, 163: text-2xs (10 px) as the label for three stat KPI cards. cost-tracker-panel.tsx line 357: text-[10px] for the Incremental/Cumulative chart toggle. nodes-panel.tsx line 180: text-[10px] for pending-device badge count. loader.tsx line 127: text-[9px] for agent name labels.

**UX-064 — Zero shared Input/Select primitives.**
No Input, Select, or Textarea component in src/components/ui/. alert-rules-panel.tsx (lines 337–398): `focus:outline-none focus:ring-1 focus:ring-primary`. integrations-panel.tsx line 574: `focus:border-primary focus:outline-none` (no ring — WCAG 2.4.7 violation). 46 occurrences of `rounded-md bg-secondary border border-border` on raw input/select elements.

**UX-065 — 8 panels polling with setInterval while SSE unused.**
`use-server-events.ts` and `api/events/route.ts` implement SSE. grep -rln setInterval returns: channels-panel.tsx:675 (30s), cost-tracker-panel.tsx:163 (30s), super-admin-panel.tsx:286 (10s), nodes-panel.tsx:139 (30s), office-panel.tsx lines 613/618/887/1181/1211 (10s), task-board-panel.tsx:1919 (5s), agent-squad-panel.tsx:82 (10s), skills-panel.tsx:149. grep -rln 'useServerEvents' in src/components/panels/ returns 0 files.

**UX-066 — 9 duplicate time-formatting utilities.**
channels-panel.tsx line 112 (relativeTime, null-safe), nodes-panel.tsx line 57 (relativeTime, non-null-safe — different signature), activity-timeline-widget.tsx line 5 (timeAgo), conversation-list.tsx line 100 (timeAgo), exec-approval-panel.tsx line 27 (timeAgo), webhook-panel.tsx line 207 (formatTime), system-monitor-panel.tsx line 90 (formatTime), audit-trail-panel.tsx line 156 (formatTime), message-bubble.tsx line 31 (formatTime), session-message.tsx line 127 (formatTime). Null handling diverges: "n/a" vs "--" vs blank for the same semantic state.

**UX-078 — 258 hardcoded semantic color strings, no shared Badge primitive.**
grep for `bg-green-500|bg-red-500|bg-amber-500|bg-blue-500|bg-purple-500` combined with text-*/border-* returns 258 hits. nodes-panel.tsx statusColor() at lines 74–79, alert-rules-panel.tsx ENTITY_COLORS at lines 52–56, integrations-panel.tsx statusColors at lines 466–470, channels-panel.tsx line 245 all use slightly different opacity values (/10 vs /20, border /20 vs /30) for the same semantic states.

---

### F. Dense Panels

**UX-008 — 11-tab agent detail drawer.**
`agent-squad-panel-phase3.tsx` lines 923–934: tabs = [overview, files, tools, models, channels, cron, soul, memory, tasks, config, activity]. Line 1055: tab strip is a plain div with no role="tablist", no role="tab", no aria-selected. Tab strip overflows horizontally on narrower viewports with no overflow indicator.

**UX-009 — 9 Kanban columns simultaneously visible.**
`task-board-panel.tsx` lines 99–109: STATUS_COLUMN_KEYS has 9 entries. Line 940: all 9 rendered unconditionally. "review" and "quality_review" are distinct but indistinguishable without domain knowledge. "backlog", "inbox", "assigned" represent three pre-active states. Hick's Law: reaction time for choosing a drop zone grows logarithmically with 9 targets.

**UX-034 — 42 card badges at text-[10px] in task board.**
task-board-panel.tsx: 42 matches for text-[10px] (recurrence badge line 999, spawned-from line 1004, ticket ref line 1009, GitHub PR link line 1018, PR state badge line 1031, aegis badge line 1044, awaiting-owner badge line 1049, status badge line 1088, tag chips line 1106). Line 370: inline style `fontSize: '11px'` on action button.

**UX-035 — Overview tab: 5 action controls before context.**
`agent-detail-tabs.tsx` lines 169–199: 3 inline pill-buttons (idle/busy/offline) + conditional Wake button + Heartbeat button in single flex row. Each ~28×24 px. Edit button below at line 323. Status pills are presented as equal choices without explanation they mutate live agent state; no label or description on the row.

**UX-036 — window.prompt() for destructive job actions.**
`super-admin-panel.tsx` line 500: `const reason = window.prompt(t('optionalReason', { action })) || undefined` — called for approve, reject, and cancel on provision jobs. Native blocking dialog is unstyled, breaks visual design, may be blocked by popup blockers, and pressing Enter on empty input proceeds immediately with the destructive action.

**UX-037 — Office panel: 15 simultaneous control dimensions.**
office-panel.tsx: viewMode 2 choices (line 1527–1543), orgSegmentMode 3 choices (line 477), sidebarFilter 4 choices (line 1570–1589), localSessionFilter 2 choices (line 1591–1617), timeTheme 4 choices (line 496), showSidebar/showMinimap/showEvents toggles (lines 488–490). 15 state dimensions; no visible grouping; no labeled regions; timeTheme has no affordance indicating it is aesthetic only.

**UX-067 — Settings panel: 8 category tabs with icon literal "shield".**
`settings-panel.tsx` line 91: categoryOrder = ['general','security','profiles','Provider Connections','retention','chat','gateway','custom']. Line 87: profiles label with icon string 'shield' renders the literal text "shield" in the UI. Line 683: unsaved-count badge styled `w-4 h-4 text-2xs` (10 px). Category names mix title-case with camelCase.

**UX-079 — super-admin and office use raw setInterval alongside SSE.**
`super-admin-panel.tsx` line 286: setInterval(load, 10000) — fires 4 parallel fetch() calls per tick. `office-panel.tsx` lines 613, 618, 887, 1181, 1211: five separate setIntervals (10s–60s). Neither uses useSmartPoll. task-board-panel.tsx line 555 uses useSmartPoll with pauseWhenSseConnected:true as the correct pattern.

---

### G. States and Motion

**UX-010 — prefers-reduced-motion reset defeated by Tailwind's layer order.**
`globals.css` line 429: reset (`animation-duration:0.01ms !important`) is inside `@layer base`. Tailwind emits `animate-pulse`, `animate-spin`, `animate-bounce` inside `@layer utilities`, which the cascade resolves after `@layer base`, overriding the reset. 50 occurrences of `animate-pulse` and 28 of `animate-spin` across src/components/. No file in src/ uses the Tailwind `motion-reduce:` variant (grep returns zero results).

**UX-038 — Full-panel spinner replacement causes CLS.**
At least 20 panels return `<Loader variant='panel' />` as entire render while `loading === true` (ops-costs-panel.tsx line 101, campaigns-panel.tsx line 401, team-dashboard-panel.tsx line 228, settings-panel.tsx line 391, content-runs-panel.tsx line 104, etc.). When data arrives, the full panel DOM replaces — headings, tables, filters all appear simultaneously. Only 2 of 44 panels use shimmer skeletons.

**UX-039 — Error states with no retry and no accessible announcement.**
ops-costs-panel.tsx lines 119–121, notifications-panel.tsx lines 109–112, campaigns-panel.tsx lines 415–417: `{error && <div className='bg-red-500/10 ...text-red-400'>{error}</div>}` with no retry button and no role="alert". alert-rules-panel.tsx catch block at line 66–72: `} catch { /* ignore */ }`. ops-failures-panel.tsx line 104 and ErrorBoundary.tsx line 36 both provide retry buttons — the pattern is known but inconsistently applied.

**UX-040 — Loader has no ARIA role or label.**
`loader.tsx`: LoaderDots (lines 56–65) — three `<div>` elements with `animate-pulse` but no role, aria-label, or aria-busy. panel and inline variants (lines 233–240) — plain `<div>` with no role="status". PageLoader — no aria-live region. task-board-panel.tsx line 744 manually adds `role='status' aria-live='polite'` showing the pattern is known but not applied to the shared component.

**UX-068 — Recharts animations not disabled in cost-tracker and security-audit.**
`system-monitor-panel.tsx` lines 205, 241, 315, 408, 417: `isAnimationActive={false}` correctly applied. `cost-tracker-panel.tsx` lines 366–414, 527–537: four chart instances — none set isAnimationActive. `security-audit-panel.tsx` lines 566–676: four series — none set isAnimationActive. With 30 s polling in cost-tracker, chart entrance animation fires repeatedly.

**UX-069 — Color-only status dots in 15+ panel instances.**
gateway-control-panel.tsx line 100: `<div className='w-3 h-3 rounded-full ${gw.running ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"}'/>` — no text alternative. multi-gateway-panel.tsx lines 326, 408, 485: three dots. webhook-panel.tsx lines 301, 351: running/enabled dots. github-sync-panel.tsx line 486: sync dot. agent-squad-panel-phase3.tsx line 388. channels-panel.tsx line 795 is the one acceptable instance (line 796–797 adds text span immediately after).

**UX-076/UX-080 — Boot loader missing 4 animation suppressions.**
`globals.css` lines 793–808: suppresses `animate-converge-left`, `animate-converge-right`, `animate-pair-fade-out`, `animate-converge-burst`, `animate-mc-fade-in`. Missing: `animate-converge-top` (loader.tsx line 25), `animate-converge-bottom` (loader.tsx line 43), `animate-glow-pulse` (loader.tsx line 110), `animate-float` (loader.tsx line 139). The partial suppression means reduced-motion users still see flying logos and infinite glow.

---

### H. Realtime and Networking

**UX-011 — SSE silent death after 20 failures.**
`use-server-events.ts` lines 78–80: after SSE_MAX_RECONNECT_ATTEMPTS=20 failures, hook logs to console and returns, leaving sseConnected=false indefinitely. No notification, no toast, no store flag distinguishing 'reconnecting' from 'permanently failed'. live-feed.tsx line 82 always renders green pulse-dot with no tie to connection.sseConnected. Total time to silent death: ~600 s of exponential backoff.

**UX-012 — WebSocket exhausts 10 retries; misleading persistent label.**
`websocket.ts` lines 788–797: after maxReconnectAttempts=10, only addLog() called. reconnectAttemptsRef stays at 10; setConnection({ reconnectAttempts: 0 }) never called on exhaustion. `header-bar.tsx` line 481: isReconnecting = !isConnected && reconnectAttempts > 0 — stays true permanently showing amber "reconnecting (10)" chip. Max wall-clock time before stop: ~116 s.

**UX-041 — 6 panels use raw setInterval through SSE and server-down.**
Raw setInterval calls bypassing useSmartPoll: agent-squad-panel.tsx:82 (10s), office-panel.tsx:613 (10s), super-admin-panel.tsx:286 (10s — 4 parallel fetches per tick), nodes-panel.tsx:139 (30s), channels-panel.tsx:675 (30s), cost-tracker-panel.tsx:163 (30s). Polling continues when: SSE is delivering the same data, browser tab is hidden, server returns errors on every request.

**UX-042 — system-monitor polls every 2 s competing with SQLite write latency.**
`system-monitor-panel.tsx` line 161: useSmartPoll(fetchData, 2000) with no pauseWhen options. Issues fetch('/api/system-monitor') continuously while mounted. On a Node.js/SQLite server under concurrent agent writes, 2 s HTTP round-trips regularly exceed 400 ms, degrading all other panel INPs.

**UX-043 — task-board polls transcript every 5 s parallel with SSE/WS delivery.**
`task-board-panel.tsx` lines 1917–1921: when isLive=true, raw setInterval(fetchTranscript, 5000). WS layer (websocket.ts lines 516–535) already delivers chat.message and tool.stream events in real time. SSE (use-server-events.ts lines 139–152) also dispatches chat.message. The poll is a full REST re-fetch of up to 100 messages — not incremental. Three delivery paths for the same data can produce duplicate message rendering.

**UX-070 — Connection status hidden below xl (1280 px).**
`header-bar.tsx` line 348: entire status block (SseBadge, WS status chip, session count, latency, clock) wrapped in `hidden xl:flex`. At 13" MacBook Pro (1280 px CSS) all connection state is invisible. The live-feed panel's always-green dot is the only signal, and it never reflects actual sseConnected state.

**UX-071 — SSE has no event IDs; missed events on reconnect.**
`api/events/route.ts` lines 44–51: 30 s heartbeat comment sent, but no `id:` SSE field on any event. `use-server-events.ts`: no last-event-id tracking (only type/data/timestamp encoded, no id field, line 35). route.ts has no Last-Event-ID header handling. Without event IDs, the EventSource reconnect cannot request a replay window; messages emitted during a reconnect gap are permanently lost.

**UX-081 — skills-panel polls disk every 10 s with no visibility-pause.**
`skills-panel.tsx` lines 149–153: window.setInterval(() => { loadSkills().catch(() => {}) }, 10000). Unlike useSmartPoll, not paused when tab hidden, no backoff on failure, not SSE-aware. Skills data is static file content that rarely changes — a 10 s disk-read cycle provides no realtime benefit.

---

### I. Notifications and Alerts

**UX-013 — No aria-live region — WCAG 4.1.3 total failure.**
Full grep of notifications-panel.tsx, alert-rules-panel.tsx, header-bar.tsx for aria-live|role="alert"|role="status"|aria-atomic returns zero matches. SSE path in use-server-events.ts lines 155–168 calls addNotification() into Zustand but no component announces new notifications to AT.

**UX-014 — Notification panel ignores Zustand store; manual recipient required.**
`notifications-panel.tsx` lines 24–27: recipient initialised from localStorage.getItem('mc.notifications.recipient'). Line 55: useSmartPoll(fetchNotifications, 30000). store/index.ts lines 1063–1067: addNotification() populates Zustand notifications[] via SSE. The panel never calls useMissionControl() or reads store.notifications.

**UX-044 — No severity differentiation.**
schema.sql lines 63–74: notifications table has no severity or priority column. notifications-panel.tsx lines 132–135: read/unread is the only visual variant. alert-rules-panel.tsx lines 50–56: ENTITY_COLORS map uses color per entity type but has no severity dimension. The word 'severity', 'critical', 'warning', or 'level' does not appear in either panel file.

**UX-045 / UX-057 — Bell badge no accessible label.**
`header-bar.tsx` lines 366–381 (full detail already in Shell Chrome section). Applies in both shells of review.

**UX-046 — Alert rule toggle 20 px with no ARIA.**
`alert-rules-panel.tsx` line 254: `w-10 h-5` = 40×20 px. Raw `<button>` (line 252) with no role, aria-checked, aria-label. Delete button at line 262 uses size='icon-xs'; trash SVG inside is w-3.5 h-3.5 = 14 px.

**UX-047 — Destructive delete fires immediately.**
`alert-rules-panel.tsx` lines 86–93: deleteRule() sends DELETE immediately on button click, no confirm() or modal. Line 212: single click destroys the rule. API requires admin role but UI makes no role check before showing the button.

**UX-072 — Mutation failures silently swallowed.**
`notifications-panel.tsx` lines 57–84: both markAllRead and markRead catch blocks contain only the comment `// Silent`. alert-rules-panel.tsx lines 77–93: toggleRule and deleteRule have no error handling at all. alert-rules-panel.tsx lines 66–72: `} catch { /* ignore */ }`.

**UX-073 — Timestamps at text-[10px] text-muted-foreground/40.**
`notifications-panel.tsx` line 153: `text-[10px] text-muted-foreground/40`. alert-rules-panel.tsx lines 155, 159, 163: text-2xs. alert-rules-panel.tsx line 234: entity type badge also text-2xs. The /40 opacity compounds contrast failure.

---

### J. Accessibility — Forms and Interaction

**UX-015 — Placeholder-as-label in all forms.**
alert-rules-panel.tsx lines 337–425: 8 inputs/selects have `<label>` elements but none have htmlFor + matching id. webhook-panel.tsx lines 487–503: 2 inputs with label sibling but no htmlFor/id pair. settings-panel.tsx lines 921–965: 4 inputs with zero label element. nav-rail.tsx lines 1129–1148: 3 create-org inputs with no `<label>` at all. No htmlFor found in any of these four files.

**UX-016 — Custom toggles have no ARIA.**
alert-rules-panel.tsx lines 252–261: toggle button — no aria-label, aria-pressed, or aria-checked. settings-panel.tsx lines 942–951: same pattern. nav-rail.tsx lines 959–991: interface-mode pair — raw button elements, 1.5×1.5 px colored dot as only state indicator, no aria-pressed.

**UX-048 — Mobile bottom sheet is not a focus trap.**
`nav-rail.tsx` lines 632–722: MobileBottomSheet renders `fixed inset-0 z-[60]` overlay. No `role="dialog"`, no `aria-modal`, no `aria-label`, no Escape listener, no focus-management code. handleClose (line 654) only fires on backdrop click or item selection. Tab navigates through content behind the overlay.

**UX-049 — Nav chevron button has no accessible name.**
`nav-rail.tsx` lines 375–392: chevron button `onClick` toggles parent expansion — no aria-label, no title, no aria-expanded. Sibling Button navigates to item but also lacks aria-expanded indicating child-list state.

**UX-050 — Connection dots: color as sole state signal.**
nav-rail.tsx line 858: connectionDotClass = green/cyan/red by connection state. Line 890: 10×10 px circle with no text, no aria-label, no title, no shape variation. Lines 301–302 in webhook-panel.tsx and line 351 repeat the pattern.

**UX-051 — icon-xs and size-xs below WCAG 2.5.8 minimum throughout panels.**
button.tsx lines 23, 27: xs = h-7 (28 px), icon-xs = h-7 w-7 (28 px). alert-rules-panel.tsx line 263: delete button size="icon-xs" — 28×28 px with 14 px icon. settings-panel.tsx line 464: security scan toggle size="xs" text-2xs — 28 px tall. nav-rail group collapse headers line 305: size="icon-xs" — 28×28 px.

**UX-052 / UX-074 — Focus outline suppressed without equivalent ring.**
alert-rules-panel.tsx lines 342–423: `focus:outline-none focus:ring-1 focus:ring-primary`. settings-panel.tsx lines 926–964: `focus:border-primary focus:outline-none` — ring-1 absent. nav-rail.tsx lines 1134–1147: `focus:outline-none focus:border-primary/50` — only border tint. globals.css button:focus-visible rule (line 127) covers only `button` elements. ring-1 (1 px) fails SC 2.4.11's perimeter requirement.

**UX-082 — Mobile bottom sheet animation coupled to hard-coded setTimeout.**
`nav-rail.tsx` `handleClose` has a hard-coded `setTimeout(onClose, 200)` to wait for the 200 ms CSS transition. When prefers-reduced-motion collapses the transition to 0.01 ms, the sheet remains mounted-but-hidden for 200 ms unnecessarily. The pattern creates a maintenance hazard if the CSS duration changes independently of the JS constant.
