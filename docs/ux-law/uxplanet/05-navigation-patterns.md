---
sources:
  - https://uxplanet.org/navigation-design-almost-everything-you-need-to-know-6f107814e22b
  - https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2
  - https://uxplanet.org/basic-patterns-for-mobile-navigation-d12a87686efe
publisher: UX Planet (Medium)
authors:
  - Justinmind (general nav design)
  - Dmitry Sergushkin (sidebar patterns)
  - Nick Babich (mobile nav patterns)
published: 2018-06-07 / 2024-12-23 / 2017 (n/a)
accessed: 2026-06-24
---

# Navigation Patterns

> **TL;DR** — Pick the pattern by depth + screen: persistent left sidebar for deep desktop apps, top nav/tabs for shallow broad sites, bottom tab bar for 3-5 mobile destinations, hamburger only as a mobile last resort. Navigation must always show current location, group (not flatten) items, and stay keyboard-operable.

## Pattern catalog (when to use each)

- **Top navigation** — Primary destination bar at the page top. Best for marketing sites and broad apps with ≤ ~7 peer-level primary items. *Gotcha:* flat lists scale badly — once you pass ~7, switch to grouping or a sidebar.
- **Sidebar / left vertical nav** — Persistent column holding primary + secondary + tertiary levels. Ideal for apps with many sections and deep hierarchy — the right call for an ops control plane. Scales without crowding, keeps the workspace uncluttered (~15% width when expanded, collapsible). *Gotcha:* limit nesting depth or it becomes a wall of links.
- **Tabs** — Peer-level views within one area, max ~5-7. Used at top (Android convention) or bottom (iOS convention). *Gotcha:* tabs are for *switching views*, not drilling deeper — that's a hierarchy/breadcrumb job.
- **Breadcrumbs** — Secondary wayfinding that shows the path to the current location. Essential in deep hierarchies (e.g. `Settings > Team > Invitations`). *Gotcha:* breadcrumbs complement primary nav, never replace it.
- **Mega-menu** — Large, grouped fly-out panel revealed on hover/focus. Better than dropdowns for content-heavy sites: bigger, contextually grouped, all links visible at once, no scrolling. *Gotcha:* useless if not keyboard/focus-operable — see anti-patterns.
- **Bottom tab bar** — Mobile primary nav, 3-5 top-level destinations, thumb-reachable, always visible. Communicates current location at a glance. *Gotcha:* >5 items shrinks touch targets below comfortable size.
- **Hamburger / side drawer** — Mobile fallback that hides the whole menu behind one icon. Saves space but hides navigation = low discoverability, hides current location, adds a tap to every destination. *Gotcha:* avoid as primary; use only for secondary/overflow items, or when a "More" tab won't fit.

## Desktop app nav (most relevant to this project)

A control plane wants a **persistent left sidebar** with grouped sections, plus a top bar for global actions.

- **Persistent, collapsible sidebar**: width 240-300px expanded, 48-64px collapsed (icons + tooltips).
- **One clearly-active item** with a strong visual cue (filled background + bold/colored text + accent bar) — never color alone.
- **Grouped sections**, not a flat list: use labels/dividers for primary, secondary, and admin groupings.
- **Expandable sub-items** with chevrons to add depth without overwhelming — but limit nesting depth.
- **Global top bar** for the things that don't belong to any section: search (`Cmd+K` command palette for power users), notifications, account/settings.
- **Breadcrumbs** for nested routes so users always see the path back up.
- **Context switching** (e.g. settings): a contextual sub-panel is fine, but always provide a clear "Back to main menu".
- **Reserve sidebar bottom** for low-priority surfaces (updates, status) so they don't compete with primary nav.

## Frontend-actionable rules

- Limit primary nav items — Hick's Law / Miller's 7±2. If you're past ~7, group with labels, don't flatten.
- Mark current location accessibly: `aria-current="page"` + a non-color-only visual (background + weight + accent).
- Keep nav **persistent** across route changes — don't make it disappear or reorder between pages.
- Every navigable destination gets a **deep-linkable URL** (state lives in the route, not in component state).
- All menus/mega-menus must be **keyboard-operable**: open on focus/Enter, arrow-navigate, Escape to close, focus returns to trigger.
- Icons must carry **text labels** (the 5-second rule: if you can't name an icon in 5 seconds, it won't read to users). Collapsed sidebar → tooltip.
- Touch targets ≥ ~10mm / 44×44px for mobile; divide viewport width by action count for tab-bar sizing.
- Use **meaningful labels** ("Campaigns", "Team") not format labels ("Products", "Items") — better SEO and scannability.
- Prefer **mega-menus over dropdowns** for content-heavy nav; group links contextually and show them at once.
- Mobile nav must be **operable one-handed** — primary destinations reachable by thumb (bottom of screen).

## Anti-patterns to avoid

- **Hamburger menu on desktop** — hides nav, kills discoverability where space isn't constrained.
- **Mystery-meat icons** with no text labels (especially collapsed sidebars / icon-only tab bars).
- **Flat 30-item nav** — no grouping, overwhelming, unscannable.
- **Nav that disappears or reorders** between routes — breaks the user's spatial memory.
- **Mega-menus without keyboard support** — mouse-only hover reveals lock out keyboard/screen-reader users.
- **Active state conveyed by color alone** — fails for color-blind and low-vision users; pair with shape/weight.
- **Dropdowns as primary nav** on content-heavy sites — poor crawlability, users skip pages, hard to hit on mobile.
- **More than 5 items in a bottom tab bar** — touch targets shrink below usable size.

## Quick checklist

- [ ] Primary nav ≤ ~7 items, or grouped with labels (not a flat wall).
- [ ] One clearly-active item, marked with `aria-current="page"` + a non-color cue.
- [ ] Sidebar 240-300px expanded / 48-64px collapsed, collapsible, persistent.
- [ ] Every destination has a deep-linkable URL.
- [ ] All menus/mega-menus keyboard-operable (focus + arrow keys + Escape).
- [ ] Icons paired with text labels; collapsed mode uses tooltips.
- [ ] Mobile: bottom tab bar for 3-5 destinations; one-handed-reachable; ≥44px targets.
- [ ] Breadcrumbs on any route deeper than two levels.
- [ ] Global actions (search, settings, account) in a consistent place across all pages.

## Source(s)

- https://uxplanet.org/navigation-design-almost-everything-you-need-to-know-6f107814e22b (Justinmind, accessed 2026-06-24)
- https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2 (Dmitry Sergushkin, accessed 2026-06-24)
- https://uxplanet.org/basic-patterns-for-mobile-navigation-d12a87686efe (Nick Babich, accessed 2026-06-24)
