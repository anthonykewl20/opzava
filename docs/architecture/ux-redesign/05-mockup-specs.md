# Opzava UX Redesign — Mockup Build Specs (05)

**Series**: `docs/architecture/ux-redesign/`  
**Mockup root**: `docs/architecture/ux-redesign/mockups/`  
**Shared assets**: every mockup links `../shared/tokens.css` then `../shared/app.css`

---

## Shared Asset Contract

All 8 mockups must import exactly these two files before any inline styles:

```html
<link rel="stylesheet" href="../shared/tokens.css">
<link rel="stylesheet" href="../shared/app.css">
```

### tokens.css — required variables

```css
/* Typography — floor 15px body, 13px tertiary */
--text-display:   2.25rem;  /* 36px — KPI numbers */
--text-h1:        1.5rem;   /* 24px — page titles */
--text-h2:        1.125rem; /* 18px — section headers */
--text-body:      0.9375rem;/* 15px — primary body */
--text-sm:        0.875rem; /* 14px — secondary labels */
--text-xs:        0.8125rem;/* 13px — tertiary metadata floor */
--text-badge:     0.8125rem;/* 13px — badge text minimum */

/* Spacing — 4px base grid */
--space-1: 0.25rem;  /* 4px  */
--space-2: 0.5rem;   /* 8px  */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10:2.5rem;   /* 40px */
--space-12:3rem;     /* 48px */

/* Radii */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;

/* Void palette (dark default) */
--bg:            hsl(215 27% 4%);
--surface-0:     hsl(216 28% 6%);
--surface-1:     hsl(217 27% 9%);
--surface-2:     hsl(218 25% 13%);
--surface-3:     hsl(219 22% 17%);
--border:        hsl(220 18% 22%);
--border-subtle: hsl(220 18% 16%);

/* Foreground — compliant ratios on --bg */
--fg:            hsl(210 20% 96%);      /* 18:1 */
--fg-muted:      hsl(213 15% 62%);      /* 5.8:1 — raised from 50% */
--fg-subtle:     hsl(213 12% 50%);      /* 4.6:1 — 13px+ only */

/* Semantic status */
--status-ok:     hsl(142 72% 50%);      /* 4.7:1 on --surface-1 */
--status-warn:   hsl(38 96% 54%);       /* 4.8:1 */
--status-err:    hsl(0 86% 60%);        /* 5.1:1 */
--status-info:   hsl(213 94% 62%);      /* 4.9:1 */
--status-ok-bg:  hsl(142 72% 50% / 12%);
--status-warn-bg:hsl(38 96% 54% / 12%);
--status-err-bg: hsl(0 86% 60% / 12%);
--status-info-bg:hsl(213 94% 62% / 12%);

/* Primary accent */
--accent:        hsl(199 98% 56%);
--accent-bg:     hsl(199 98% 56% / 10%);

/* Touch target minimum */
--target-min:    2.75rem; /* 44px */
```

### app.css — required base rules

```css
/* Zoom — WCAG 1.4.4: remove maximumScale block from layout.tsx before building */
*, *::before, *::after { box-sizing: border-box; }
html { font-size: 100%; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: var(--text-body);
  line-height: 1.6;
  color: var(--fg);
  background: var(--bg);
  margin: 0;
  -webkit-font-smoothing: antialiased;
}
/* Reduced-motion reset — placed OUTSIDE @layer so it wins the cascade (Finding #29) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* Touch targets — all interactive elements */
button, a, [role="button"], [role="tab"], [role="switch"],
input[type="checkbox"], input[type="radio"] {
  min-height: var(--target-min);
  min-width: var(--target-min);
}
/* Exception: icon buttons inside tables may use 32px with extra padding */
.icon-btn-compact { min-height: 2rem; min-width: 2rem; padding: var(--space-2); }
/* Tabular nums for all data tables */
table, .tabular { font-variant-numeric: tabular-nums; }
/* SR-only utility */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
```

---

## Screen 1 — `index.html`

### Purpose
Gallery landing page linking all 7 content mockups. Doubles as a reference card for the principle set applied throughout the redesign.

### Layout — named grid regions

```
┌──────────────────────────────────────────────────┐
│  HERO (full width) — title + one-line mission    │
├──────────────────────────────────────────────────┤
│  PRINCIPLES TABLE (full width, 2-col on mobile) │
├────────┬────────┬────────┬────────┬──────────────┤
│ CARD   │ CARD   │ CARD   │ CARD   │  CARD        │
│ card01 │ card02 │ card03 │ card04 │  card05      │
├────────┴────────┴────────┴────────┴──────────────┤
│ CARD   │ CARD   │ CARD                           │
│ card06 │ card07 │ card08                         │
└────────┴────────┴────────────────────────────────┘
```

CSS grid: `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))` for the card row; max-width 1280px centered; `gap: var(--space-6)`.

### Components used
- Hero `<h1>` at `--text-h1` — "Opzava Redesign Mockups"
- Single-paragraph subtitle at `--text-body`
- Principles legend table (see below)
- 7 `<a>` cards with thumbnail screenshot placeholder (gray shimmer box 16:9), title at `--text-h2`, one-line description at `--text-sm`

### Realistic sample content
Hero title: `"Opzava UX Redesign — Interactive Mockups"`. Subtitle: `"Eight standalone specs demonstrating the redesign principles. All text ≥15px; void dark; WCAG AA."`.

Principles legend — a 2-column table:

| Principle | Rule applied |
|---|---|
| Miller's Law | ≤7 nav items per group; ≤5 KPI cards per row |
| Hick's Law | Progressive disclosure; one primary CTA per surface |
| Fitts's Law | ≥44px touch targets; primary actions end-of-eye-path |
| Doherty Threshold | Skeleton screens; realtime connection state |
| Tesler's Law | Complexity absorbed by system (BannerManager, smart defaults) |
| WCAG 1.4.3 | All text ≥4.5:1; `--fg-muted` ≥5.8:1; no opacity tricks |
| WCAG 1.4.4 | No `maximumScale:1`; no `overflow-hidden` root trap |
| WCAG 4.1.3 | `aria-live` regions for notifications and status messages |
| Aesthetic-Usability | Consistent tokens; 4 type sizes per view; 8px grid |

Cards link: `02-style-guide.html`, `03-shell-overview.html`, `04-monitoring-health.html`, `05-task-board.html`, `06-agent-detail.html`, `07-notifications-alerts.html`, `08-settings.html`.

### Async state demonstrated
**Loaded** — static gallery; no data fetching required.

### Findings/laws resolved
- Serves as onboarding for the principle set (Tesler's Law — system explains itself).
- Gestalt proximity: cards are equal-sized containers; the legend table uses common-region (border) to separate it from the cards.

---

## Screen 2 — `style-guide.html`

### Purpose
Living design system reference: every token, every component, every state. Built first so screens 3–8 are assembled from its inventory.

### Layout — named grid regions

```
┌─────────────────┬────────────────────────────────┐
│  LEFT NAV       │  CONTENT AREA                  │
│  (position:     │  (scroll; single column,       │
│   sticky; 220px)│   max-width 800px)             │
│                 │                                │
│  • Typography   │  ## Typography                 │
│  • Color Tokens │  ## Color Tokens               │
│  • Spacing      │  ## Spacing                    │
│  • Components   │  ## Components                 │
│  • States       │  ## States                     │
└─────────────────┴────────────────────────────────┘
```

Left nav: `<nav>` with `role="navigation" aria-label="Style guide sections"`. Each link `<a href="#section-id">` at `--text-sm`, 44px tall. Active state: left border 2px `--accent`, background `--surface-2`.

### Components used (inventory)

Every component below must render its **default + hover + focus + disabled + loading states** side by side under a `--text-h2` section heading.

| Component | Variants / states shown |
|---|---|
| **Button** | primary / secondary / ghost / destructive; sizes md(44px) sm(36px) icon(44×44px); disabled; loading(spinner) |
| **Badge** | status-ok / warn / err / info / neutral; at 13px text-badge min |
| **Card** | default (`p-4`) / compact (`p-3`) / interactive hover |
| **Stat Card** | KPI number at `--text-display`; label at `--text-sm`; delta indicator; sparkline placeholder |
| **Input** | default / focused / error / disabled; with visible `<label>` + `htmlFor` |
| **Select** | same 4 states; with `<label>` |
| **Toggle / Switch** | `role="switch" aria-checked` on/off states; `h-8` (32px) minimum height |
| **Modal** | title, body, footer with primary+cancel; focus trap noted in comment |
| **Toast** | info / warn / err / success; auto-dismiss bar visible; action button |
| **Skeleton** | text-block (3 lines varying width); card-shape; stat-card-shape |
| **FetchError** | `role="alert"`; message text; retry button |
| **Loader** | `role="status" aria-label="Loading"` inline + panel variants |
| **Nav Rail item** | default / active / hover; group label at 13px `--fg-muted` |
| **Health Pill** | connected(green dot + text "Connected") / warn / err / dead + "Reconnect" CTA |
| **BannerManager slot** | one banner at a time; severity order display; "1 more" chip |

### Typography section content

Display the full scale as specimen text:

```
36px / display  — "42 agents running"       font-weight: 700
24px / h1       — "Overview"                font-weight: 600
18px / h2       — "Agent Health"            font-weight: 600
15px / body     — "Primary body text …"     font-weight: 400
14px / sm       — "Secondary label"         font-weight: 400
13px / xs       — "Timestamp · metadata"    font-weight: 400
```

Show Inter (sans) and JetBrains Mono (mono) at body size. Show `font-variant-numeric: tabular-nums` specimen: `"1,111.11  vs  999.99"`.

### Color token section

Render each token as a swatch (48×48px square) + hex/hsl + contrast ratio against `--bg` and `--surface-1`. Flag any token with ratio < 4.5:1 in red.

Show all 10 theme names; note 6 failing themes (void is the only mockup theme used; other themes need the token fix from the findings).

### Spacing section

Render all `--space-*` tokens as filled bars of proportional width, labeled with px value. Show the 8px grid baseline.

### States section — four universal async states

Render a representative "panel" at 320×200px in each state:

1. **Loading** — skeleton (card-shape shimmer, 3 text-line shimmers)
2. **Loaded** — real content
3. **Empty** — zero-state illustration (text + icon; no data yet message; CTA if actionable)
4. **Error** — `<FetchError>` component; message + retry button; `role="alert"`

### Async state demonstrated
**Loaded** + all four states explicitly shown in the States section.

### Findings/laws resolved
- Finding Typography #1, #2, #3, #4, #5, #6 (establishes compliant scale and muted-foreground token)
- Finding tokens-css #1, #2, #3, #4 (cascade layer contract, badge tokens)
- Finding components-std #1 (Card component), #2 (Modal), #3 (Button sizes)
- Finding states-motion #4 (Loader ARIA)
- Aesthetic-Usability Effect: consistent tokens reduce per-panel decision entropy

---

## Screen 3 — `shell-overview.html`

### Purpose
The default landing screen. Demonstrates: restructured nav rail (≤7 items per group), header with global health pill + Cmd-K placeholder + active section title, and the Overview dashboard (3-tier layout).

### Layout — named grid regions

```
┌──────────┬─────────────────────────────────────────────┐
│ NAV RAIL │ HEADER (56px)                               │
│ (220px   ├─────────────────────────────────────────────┤
│  or 56px │ BANNER SLOT (0 or 1 banner max)             │
│  collapsed│────────────────────────────────────────────┤
│          │ KPI ROW (5 stat cards)                      │
│ Groups:  ├──────────────┬──────────────────────────────┤
│ CORE     │ AGENT HEALTH │ LIVE ACTIVITY FEED           │
│ OPS      │ (left, 35%)  │ (right, 65%; role="log")     │
│ OBSERVE  │              │                              │
│ ADMIN    ├──────────────┴──────────────────────────────┤
│          │ COST SUMMARY (full width, compact row)      │
└──────────┴─────────────────────────────────────────────┘
```

### Nav Rail specification

**Desktop** (220px wide, collapsible to 56px icon-only):

4 groups — each ≤7 items. Source: finding ia-nav #1 (split OBSERVE):

```
CORE (4 items)
  • Overview          [home icon]
  • Agents            [bot icon]
  • Tasks             [check icon]
  • Connections       [plug icon]

OPS (5 items)
  • Campaigns         [megaphone icon]
  • Content Runs      [play icon]
  • Approvals         [shield icon]   ← merged finding ia-nav #2
  • Team              [users icon]
  • Artifacts         [box icon]

OBSERVE (5 items)
  • Activity          [pulse icon]
  • Logs              [list icon]
  • Monitor           [chart icon]
  • Notifications     [bell icon]    ← finding ia-nav #5: add to nav
  • Failures          [alert icon]

ADMIN (4 items)
  • Settings          [gear icon]
  • Usage & Costs     [coin icon]    ← merged finding ia-nav #2
  • Super Admin       [lock icon]    ← finding ia-nav #5: admin-gated
  • Gateways          [server icon]
```

Group label style: `font-size: var(--text-xs); color: var(--fg-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: var(--space-2) var(--space-4);` — no opacity modifier. Resolves finding Typography #5.

Sidebar footer: **persistent pill** `[Essential | Full]` — always visible, no popover. Resolves finding ia-nav #4. Text: `var(--text-xs)`. Height: 44px.

Active item: left border 2px `--accent`, bg `--surface-2`, text `--fg`.

**Icon-only mode** (56px): show only icons + active highlight. No group labels rendered.

### Header specification

Left slot (in order, separated by `/` divider):
1. `<h1 aria-live="polite" id="section-heading">Overview</h1>` at `var(--text-sm)` font-weight 600 — resolves finding ia-nav #3.
2. Workspace badge (pill, `var(--text-xs)`).

Center slot:
- Cmd-K search trigger button: `⌘K` text at `var(--text-sm)`; border `--border`; 44px height; min-width 200px; `aria-label="Open command palette"`.

Right slot (3 items only — resolves finding shell-chrome #4):
1. **Health Pill**: single compound badge. States: `● Connected` (status-ok color + text) / `● Degraded` (warn) / `● Reconnecting…` (warn + spinner) / `● Disconnected — Reconnect` (err + button). Text at `var(--text-xs)`. Full token name: `--status-ok` not hardcoded green. `aria-label="Connection status: Connected"`.
2. Bell icon button: 44×44px; `aria-label="Notifications, 3 unread"`; badge count `<span aria-hidden="true">3</span>` + `<span class="sr-only">3 unread notifications</span>`.
3. Theme selector: 44×44px icon button.

Remove from header: sessions ratio, navigation latency stat, SSE badge, digital clock — all moved to a debug panel or health drill-down. Resolves finding shell-chrome #4.

### Banner Slot (BannerManager)

Renders at most **one banner at a time**. Priority order: `error > warn > info`. When multiple are queued: show active banner + `<button class="more-chip">1 more</button>` right-aligned at `var(--text-xs)`.

Each banner: full-width, `var(--text-sm)`, `padding: var(--space-2) var(--space-4)`. One primary CTA button (44px height) + one dismiss icon button (44×44px, `aria-label="Dismiss"`). No secondary actions visible by default.

Sample banner: `⚠ Opzava update available — v2.1.4`. CTA: `"Update Now"`. Dismiss: `✕`.

Resolves finding shell-chrome #1 (4-banner stack), #2 (5 CTA buttons), #3 (28px dismiss buttons).

### KPI Row — 5 stat cards

Each card: `Card` component (p-4), `min-width: 0`, `flex: 1`. Content:

```
[LABEL at --text-xs fg-muted]    [delta at --text-xs status-ok/err]
[NUMBER at --text-display]
[COMPARISON at --text-xs fg-muted]
```

Sample cards:

| Label | Number | Delta | Comparison |
|---|---|---|---|
| Active Agents | 42 | ▲ +3 | vs 39 yesterday |
| Tasks In Progress | 17 | — 0 | stable |
| Approval Queue | 3 | ▲ +3 | needs attention |
| Cost Today | $12.40 | ▼ -8% | vs $13.50 avg |
| System Health | 98.2% | ▲ +0.4% | last 24h |

Approval Queue card: `--status-warn-bg` background, `--status-warn` number color — visual hierarchy cue.

### Agent Health panel (35% width)

`<section aria-labelledby="agent-health-heading">`. Heading at `var(--text-h2)`.

List of 5 agent rows (representative):
```
[avatar] Atlas-7        ● Running    2 tasks  →
[avatar] Iris           ● Idle       0 tasks  →
[avatar] Nexus-3        ⚠ Degraded  1 task   →
[avatar] Echo           ✕ Offline            →
[avatar] Cipher         ● Running    4 tasks  →
```

Each row: height 56px, padding `var(--space-3) var(--space-4)`. Status dot + text label (not color-only — resolves finding a11y-forms #5). Name at `var(--text-body)`. Meta at `var(--text-xs) var(--fg-muted)`.

"View all agents →" link below list. Height 44px.

### Live Activity Feed (65% width, role="log")

```html
<section aria-labelledby="live-feed-heading">
  <div class="feed-header">
    <h2 id="live-feed-heading">Live Activity</h2>
    <span aria-hidden="true" class="live-dot">●</span>
    <span>Live</span>   <!-- text always present, not just animation -->
  </div>
  <div role="log" aria-label="Live system feed" aria-live="polite">
    <!-- feed items -->
  </div>
</section>
```

Resolves finding shell-chrome #5 (ARIA live region for live feed).

8 feed items at `var(--text-sm)`. Format: `[HH:MM:SS] [agent-name] — [event description]`. Font: JetBrains Mono for the timestamp; Inter for the description. Alternating `--surface-0` / `--surface-1` rows. Item height: 44px.

Sample items (newest first):

```
10:42:07  Atlas-7       — Task "Summarize Q2 report" completed ✓
10:41:55  Iris          — Heartbeat OK
10:41:50  Nexus-3       — Tool call: web_search("AI market 2025")
10:41:44  System        — SSE reconnected after 3s gap
10:41:30  Cipher        — Task "Draft email" assigned
10:41:20  Echo          — Went offline (gateway timeout)
10:40:58  Atlas-7       — Approval requested: run deploy script
10:40:44  System        — Cost checkpoint: $12.40 / $50.00 budget
```

Echo's offline event: `--status-err` left border 2px on its row.

### Cost Summary (full width, compact)

Single row: `Total today: $12.40 · Budget: $50.00 · 24.8% used · [View breakdown →]`.

Text: `var(--text-sm)`. Progress bar: `height: 6px`, filled `--accent`. `aria-label` on the bar: `"Budget used: 24.8%"`.

### Async state demonstrated
**Loaded + Realtime (SSE live)**. Live feed has a `data-loading="true"` skeleton state (3 shimmer rows) toggled by a JS class for demonstration.

### Findings/laws resolved
- ia-nav #1 (nav groups ≤7), #2 (merged duplicates), #3 (section heading in header), #4 (Essential/Full pill), #5 (Notifications + Super Admin added)
- shell-chrome #1 (BannerManager), #2 (banner CTAs), #3 (dismiss targets), #4 (header signals), #5 (live-feed ARIA)
- Typography #5 (nav group labels ≥13px, no opacity)
- Miller's Law: 4 nav groups, 5 KPI cards, 3 header items
- Jakob's Law: sidebar-left, bell top-right, health pill top-right

---

## Screen 4 — `monitoring-health.html`

### Purpose
Dedicated system health and realtime metric surface. Shows connection state (all 4 states), realtime metric cards, alert surfacing, and the health endpoint summary.

### Layout — named grid regions

```
┌────────────────────────────────────────────────────┐
│ HEADER (inherits from shell spec; h1="Monitor")    │
├──────────────────────────┬─────────────────────────┤
│ CONNECTION STATE PANEL   │ ALERT STRIP              │
│ (left, 40%)              │ (right, 60%)             │
├──────────────────────────┴─────────────────────────┤
│ METRIC CARDS ROW (4 cards, equal width)            │
├────────────────────────────────────────────────────┤
│ HEALTH ENDPOINTS TABLE (full width)                │
├────────────────────────────────────────────────────┤
│ SYSTEM LOG (collapsible; role="log")               │
└────────────────────────────────────────────────────┘
```

### Connection State Panel

Four distinct states are shown as a **tabbed demo switcher** (for mockup purposes — in production only the active state renders):

**Tab 1 — Connected**
```
● Connected
WebSocket · SSE
Last event: 0.3s ago
```
Color: `--status-ok`. Background: `--status-ok-bg`. All text labels alongside dots (not color-only).

**Tab 2 — Degraded**
```
⚠ Degraded
WebSocket OK · SSE reconnecting (attempt 3/20)
Last event: 8s ago
[Manual reconnect →]  (44px button)
```
Color: `--status-warn`.

**Tab 3 — Disconnected (exhausted retries)**
```
✕ Disconnected
WebSocket failed after 10 attempts · SSE failed after 20 attempts
Last successful event: 2m 14s ago
[Reconnect Now]  (primary button, 44px)
```
Color: `--status-err`. `role="alert"` on the container — this state demands immediate user attention. Resolves finding realtime-net #1 (SSE silent death), #2 (WS misleading "reconnecting (10)" state).

**Tab 4 — Stale / Paused**
```
⏸ Feed Paused
Click "Resume" to restore live updates.
[Resume Feed]
```
Color: `--fg-muted`.

Connection state label uses `aria-live="polite"` on the status text span so AT announces transitions.

### Alert Strip

`<section aria-labelledby="alerts-heading" aria-live="polite">`.

3 alert items. Each: `Card` (compact p-3), left border 4px severity color, severity badge (icon + text label, never color-only — resolves finding notifications-alerts #3). Height 64px.

```
[✕ Critical]  Echo went offline — Gateway timeout at 10:41:20   [View Agent →]
[⚠ Warning]   Budget at 80% — $40.20 of $50.00 used             [View Costs →]
[ℹ Info]       Opzava v2.1.4 available                          [Update →]
```

Badge sizes: `var(--text-badge)` (13px), `padding: var(--space-1) var(--space-2)`.

CTA links: 44px height, `var(--text-sm)`.

### Metric Cards Row

4 cards. Each card: `Card` (p-4), `role="region"`, `aria-label="[metric name]"`.

```
CPU Usage        Memory          Disk I/O         Active Conns
  34%             1.2 GB           12 MB/s           847
  ▼ -4%           ▲ +80MB          —                 ▲ +12
  [sparkline]     [sparkline]      [sparkline]        [sparkline]
  Last sync: now  Last sync: now   Last sync: now     Last sync: now
```

Sparkline: `<canvas>` element (or SVG path), 100% width, 32px height. Numbers: `var(--text-display)` (36px), `font-variant-numeric: tabular-nums`. Delta arrows: semantic `aria-label` on the delta span (`aria-label="down 4 percent"`). "Last sync" timestamp: `var(--text-xs) --fg-muted`.

### Health Endpoints Table

`<table>` with `<caption class="sr-only">Health endpoint status</caption>`. `font-variant-numeric: tabular-nums`.

Column headers (`<th scope="col">`): Endpoint, Status, Latency (ms), Last checked.

```
/api/health          ● OK       42ms    10:42:08
/api/gateways/health ● OK       38ms    10:42:07
/api/memory/health   ⚠ Slow    380ms   10:42:06
/api/status          ● OK       55ms    10:42:08
```

Row height: 48px (regular density). Status: badge component (icon + text). Latency column: right-aligned, `font-variant-numeric: tabular-nums`. Rows with warn/err status: `--status-warn-bg` row background. Resolves research:r4 (tabular-nums, contrast tested on cell background).

### System Log (collapsible)

`<details>` / `<summary>` pattern: `"System Log (last 50 events)"`. Expands to show a `<div role="log" aria-label="System log" aria-live="off">` (off = polite announcement not needed for historical log).

Log lines: `font-family: 'JetBrains Mono', monospace; font-size: var(--text-xs); line-height: 1.5;` (13px mono — tertiary metadata exemption applies). 5 sample lines visible; scrollable container `max-height: 200px; overflow-y: auto`.

### Async state demonstrated
**All 4 async states** — tabs 1-4 in the connection panel show Loading (tab 4 / paused), Loaded (tab 1), Error/Disconnected (tab 3), and Degraded/transitional (tab 2). Metric cards show skeleton shimmer when `data-loading` class is applied.

### Findings/laws resolved
- realtime-net #1 (SSE silent death → sseFailed state + banner)
- realtime-net #2 (WS "reconnecting (10)" → distinct Disconnected state)
- notifications-alerts #1 (aria-live on alert strip)
- a11y-forms #5 (color + text for connection dots)
- Doherty Threshold: "Last sync: now" timestamps on every metric card
- WCAG 1.4.1: all status indicators use icon + text, never color alone

---

## Screen 5 — `task-board.html`

### Purpose
Kanban board reworked for cognitive clarity: 5 visible columns (down from 9), card hierarchy enforced, column headers unambiguous, no overwhelm. Demonstrates progressive disclosure for advanced column states and card metadata.

### Layout — named grid regions

```
┌────────────────────────────────────────────────────┐
│ HEADER (h1="Task Board")                           │
├──────────────┬─────────────────────────────────────┤
│ TOOLBAR      │ COLUMN VISIBILITY (secondary)       │
│ (filters,    │ "+ Add column" — hidden by default  │
│  search,     │                                     │
│  view mode)  │                                     │
├──────┬───────┴────┬────────────┬──────────┬────────┤
│ TODO │ ASSIGNED   │ IN PROGRESS│ REVIEW   │ DONE   │
│      │            │            │          │        │
│      │            │            │          │        │
└──────┴────────────┴────────────┴──────────┴────────┘
```

5 columns: **Todo** (backlog+inbox merged), **Assigned**, **In Progress**, **Review** (review+quality_review merged), **Done** (done+failed merged with sub-tab). Resolves finding dense-panels #2 (9→5 columns).

Columns with `awaiting_owner` tasks: the card itself surfaces an "Awaiting Owner" badge — the column is not added unless toggled.

### Toolbar

Single row, 44px height. Left: `[Search tasks…]` input (44px height, `<label class="sr-only">Search tasks</label>`); `[Assignee ▾]` select (44px); `[Status ▾]` select (44px). Right: `[Compact | Comfortable]` density toggle, `[+ New Task]` primary button (44px).

Max 3 filter controls visible by default — resolves Hick's Law. Additional filters behind `[More filters +]` toggle.

### Column header

Each column: `<div role="columnheader">`. Height: 48px. Content:

```
[STATUS LABEL at --text-sm font-weight:600]  [COUNT badge]
```

Count badge: `Card` compact, `var(--text-xs)`, `--fg-muted`. No color on neutral columns. Review column gets `--status-warn` count badge if any task has been in review > 48h.

### Task Card

`Card` component (p-3). Height: auto (min 80px). Accessible: `<article aria-label="Task: [title]">`.

```
[PRIORITY DOT — shape+color] [TAG badge]
[TITLE at --text-body font-weight:500]
[ASSIGNEE avatar 24px + name at --text-xs --fg-muted]
[METADATA ROW at --text-xs --fg-muted]
```

**Priority dot**: filled circle (ok) vs diamond (warn) vs triangle (err) — shape + color, not color alone. Resolves WCAG 1.4.1.

**Title**: `var(--text-body)` (15px) — resolves finding dense-panels #3 (was 10px).

**Metadata row** (2 items max visible; rest behind `…` expand): ticket ref, due date. At `var(--text-xs)` (13px) — tertiary metadata floor. No `text-[10px]` — resolves finding dense-panels #3.

Expand link: `[+ 3 more details]` at `var(--text-xs)`. Expands inline (no modal) to show: spawned-from, PR link (as full text link not icon), tags. Resolves finding dense-panels #3 (42 badges at 10px → progressive disclosure at 13px+).

Sample card (In Progress):
```
◆ High   [content]
Summarize Q2 earnings report for board deck
● Atlas-7  ·  Due Jun 25
#TASK-441  [+ 2 more]
```

### Column scroll

Each column: `height: calc(100vh - 180px); overflow-y: auto`. Column width: equal flex, `min-width: 220px`. Board: `overflow-x: auto` on the outer container.

Drag-and-drop drop zones: visible border on hover (`--accent` border 2px dashed). Drop zone height matches the card. `aria-dropeffect` on columns.

### Async state demonstrated
**Loading**: each column shows 3 skeleton card-shapes (shimmer). **Loaded**: normal state shown. **Empty column**: "No tasks" centered message at `var(--text-sm) --fg-muted` with icon, 80px height.

### Findings/laws resolved
- dense-panels #2 (9 columns → 5; Miller's Law)
- dense-panels #3 (42 × 10px badges → 13px+ with progressive disclosure)
- a11y-forms #5 (priority uses shape + color)
- Miller's Law: 5 columns, ≤5 metadata items per card before expansion
- Hick's Law: 3 toolbar filters by default; expand for more

---

## Screen 6 — `agent-detail.html`

### Purpose
Restructured agent detail view — was the densest panel at 2992 lines. Demonstrates summary-first header, ≤5 tabs (down from 11), advanced sections collapsed by default, and correct tab ARIA.

### Layout — named grid regions

```
┌────────────────────────────────────────────────────┐
│ AGENT HEADER (full width; summary-first)           │
├───────────┬────────────────────────────────────────┤
│ TAB BAR   │ (role="tablist")                       │
│ Overview  │ Config   Activity   Identity           │
├───────────┴────────────────────────────────────────┤
│ ACTIVE TAB PANEL (role="tabpanel")                 │
│   [content varies by tab]                         │
└────────────────────────────────────────────────────┘
```

### Agent Header

Height: 88px. 3 columns: avatar + name/status (flex-grow); key stats row; primary actions.

**Avatar + name/status** (left):
```
[32px avatar]  Atlas-7
               ● Running  ·  Content dept
```
Status: read-only badge (`--status-ok-bg`, icon + text). Not clickable by default. Resolves finding dense-panels #4 (status pills were interactive without explanation).

**Key stats** (center, 3 items):
```
Tasks: 2 running · Model: claude-opus-4   ·  Cost today: $1.42
```
Text: `var(--text-sm)`. All readable. No `text-[10px]`.

**Actions dropdown** (right): `[Actions ▾]` button (44px height). Dropdown contains: Wake (if offline only — conditional disclosure), Send Heartbeat, Edit Config, View Logs, Pause, Offline. Resolves finding dense-panels #4 (5 inline action controls → one Actions dropdown; Tesler's Law). Each dropdown item: 44px height.

`[Wake]` button rendered **only** when agent status is `offline` — conditional disclosure.

### Tab Bar

```html
<div role="tablist" aria-label="Agent sections">
  <button role="tab" id="tab-overview"  aria-selected="true"  aria-controls="panel-overview">Overview</button>
  <button role="tab" id="tab-config"    aria-selected="false" aria-controls="panel-config">Config</button>
  <button role="tab" id="tab-activity"  aria-selected="false" aria-controls="panel-activity">Activity</button>
  <button role="tab" id="tab-identity"  aria-selected="false" aria-controls="panel-identity">Identity</button>
</div>
```

4 tabs (down from 11). Resolves finding dense-panels #1 (Miller's Law; ARIA roles). Arrow-key navigation implemented in JS.

Tab button: `height: 44px; padding: 0 var(--space-4); font-size: var(--text-sm);`. Active: bottom border 2px `--accent`, `--fg` color. Inactive: `--fg-muted`.

### Overview tab panel

```html
<div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
```

3 sub-sections:

**Status + Last Activity** (stat row, 3 cards):
```
Current Status: Running    Last Seen: 10:42:01    Session: 2h 14m
```
Cards: `Card` compact. Values: `var(--text-body)` font-weight 600. Labels: `var(--text-xs) --fg-muted`.

**Active Tasks** (list):
Heading `<h3>` at `var(--text-h2)`. List of active tasks with status badges, at `var(--text-sm)`. "View all in Task Board →" link (44px).

**Recent Cost** (compact row):
```
Today: $1.42  ·  This week: $9.80  ·  [View breakdown →]
```
`var(--text-sm)`. Link 44px.

### Config tab panel

Progressive disclosure via `<details>` / `<summary>` accordion — resolves finding dense-panels #1 (config sub-tabs collapsed by default):

```
▶ Model & Inference   (collapsed by default)
▶ Tools & Permissions (collapsed by default)
▶ Channels            (collapsed by default)
▶ Schedule / Cron     (collapsed by default)
▶ Files               (collapsed by default)
▶ Advanced            (collapsed by default)
```

Each `<summary>`: `var(--text-sm)` font-weight 600, 44px height, `cursor: pointer`. When expanded: form fields at `var(--text-body)` with proper `<label htmlFor>` pairs. Resolves finding a11y-forms #1.

### Activity tab panel

2-column layout: **Tasks** table (left, 55%) + **Event Log** (right, 45%, `role="log"`).

Tasks table: `<table>` with `<caption class="sr-only">Agent task history</caption>`. Columns: Task, Status, Duration, Cost. Row height 48px. `font-variant-numeric: tabular-nums` on Duration and Cost columns.

Event log: `role="log" aria-label="Agent event log" aria-live="off"`. Lines at `var(--text-xs)` mono (13px — tertiary metadata).

### Identity tab panel

2 sections: **Persona** (name, role, department, description — all `var(--text-body)`) and **Memory** (list of memory keys, values at `var(--text-sm)`).

No sub-tabs. Content is flat; advanced memory config behind a `<details>` accordion.

### Async state demonstrated
**Loading**: skeleton for the agent header (avatar placeholder 32px circle + 2 text shimmer lines), skeleton stat cards, skeleton task list. **Loaded**: full content. **Error**: `<FetchError role="alert">` with retry button replaces the tab panel content.

### Findings/laws resolved
- dense-panels #1 (11→4 tabs; ARIA tablist/tab/tabpanel; Miller's Law)
- dense-panels #4 (5 inline action controls → Actions dropdown)
- a11y-forms #1 (Config forms have `<label htmlFor>`)
- Hick's Law: 4 tabs; Actions dropdown hides complexity
- Tesler's Law: system defaults, advanced behind accordion
- WCAG 4.1.2: role/aria-selected/aria-controls on all tabs

---

## Screen 7 — `notifications-alerts.html`

### Purpose
Notification center + toast stack (severity tiered) + alert rule list with clear copy. Demonstrates ARIA live regions, severity differentiation with non-color cues, and accessible interactive controls.

### Layout — named grid regions

```
┌────────────────────────────────────────────────────┐
│ HEADER (h1="Notifications")                        │
├─────────────────────────┬──────────────────────────┤
│ NOTIFICATION LIST       │ ALERT RULES              │
│ (left, 55%)             │ (right, 45%)             │
│                         │                          │
│ [severity filter tabs]  │ [Add Rule]               │
│ [notification items]    │ [rule rows]              │
└─────────────────────────┴──────────────────────────┘
                    TOAST STACK
             (fixed bottom-right, z-50)
```

### App-level ARIA live region (in `<body>`)

```html
<!-- Resolves finding notifications-alerts #1 -->
<div role="status" aria-live="polite" aria-atomic="false" class="sr-only" id="notification-announcer"></div>
<div role="alert"  aria-live="assertive" class="sr-only" id="critical-announcer"></div>
```

JS updates `#notification-announcer` text on each new non-critical notification. Updates `#critical-announcer` for critical severity. Resolves finding notifications-alerts #1 (WCAG 4.1.3 total failure).

### Notification List

**Bell badge** in header (from shell spec): `aria-label="Notifications, 5 unread"`. Resolves finding notifications-alerts #4.

**Severity filter tabs** (above list):
```
[All (12)] [Critical (1)] [Error (2)] [Warning (4)] [Info (5)]
```
`role="tablist"`. Each tab: 44px height, `var(--text-sm)`. Active: `--accent` underline. Resolves finding notifications-alerts #3 (severity differentiation).

**Notification items** (newest first). Each item: `Card` compact (p-3), 72px height, `role="listitem"`.

```
[SEVERITY ICON + BADGE]  [TITLE at --text-body font-weight:500]  [TIME]
                         [DESCRIPTION at --text-sm --fg-muted]
```

Severity badge: icon (filled circle=info, triangle=warning, diamond=error, octagon=critical) + text label. Never color alone. Resolves WCAG 1.4.1.

Sample items:
```
◆ Critical   Echo went offline — Gateway timeout          10:41:20
             Agent Echo (Content dept) lost gateway connection.  [View →]

▲ Warning    Budget at 80% — $40.20 of $50.00 used        10:38:00
             Review your campaign spend.                  [View →]

● Info       Task #441 completed by Atlas-7               10:35:44
             "Summarize Q2 report" finished successfully. [Dismiss]

● Info       Opzava v2.1.4 available                      10:20:00
             New features: improved cost tracking.        [Update]
```

Unread items: `--surface-2` background. Read items: `--surface-1`.

CTA links: `var(--text-sm)`, 44px height.

**Pre-populate recipient from auth** — no freetext input field visible. Resolves finding notifications-alerts #2. If admin, show `[Filter by user ▾]` select (44px).

### Alert Rules Panel

`<section aria-labelledby="alert-rules-heading">`. Heading `<h2>` at `var(--text-h2)`. `[+ Add Rule]` button (44px, primary) top-right.

Each rule row: `Card` compact (p-3), 64px height.

```
[RULE NAME at --text-body]           [ENABLED TOGGLE]  [DELETE]
[CONDITION at --text-xs --fg-muted]
```

**Toggle** (enabled/disabled): `role="switch" aria-checked={true/false} aria-label="Enable: Agent Offline Alert"`. Height: 32px (`h-8`). Width: 48px. Background: `--status-ok` when checked, `--surface-3` when unchecked. Thumb: white 24×24px circle. Resolves finding notifications-alerts #5 (20px toggle → 32px) and finding a11y-forms #2.

**Delete button**: `icon-btn-compact` (32×32px) with padding, `aria-label="Delete rule: Agent Offline Alert"`. Shows **inline confirmation** on first click: button text changes to `"Confirm delete"`, reverts after 3s. Single click does NOT delete. Resolves finding notifications-alerts #6.

Sample rules:
```
Agent Offline Alert                          [●] On   [🗑]
Trigger: agent.status = offline

Budget Threshold Warning                     [●] On   [🗑]
Trigger: cost.daily > 80% of budget

Task Failure Spike                           [○] Off  [🗑]
Trigger: tasks.failed > 5 in 10min
```

### Toast Stack (fixed bottom-right)

`position: fixed; bottom: var(--space-6); right: var(--space-6); z-index: 50; display: flex; flex-direction: column; gap: var(--space-2); max-width: 380px;`

Each toast: `Card` (p-4), `min-height: 64px`, `width: 100%`, `role="status"` (or `role="alert"` for err/critical). Auto-dismiss bar (progress bar at bottom, 5s animation, pauses on hover). Primary icon + severity badge + message + optional action button. Dismiss button 44×44px with `aria-label="Dismiss notification"`.

4 toasts shown (stacked, newest on top):

```
✓ Success    Task "Draft email" completed         [Dismiss ✕]
⚠ Warning    Budget at 80%                        [View →]  [✕]
✕ Error      Atlas-7 failed tool call             [Retry]   [✕]
● Info        v2.1.4 update available             [Update]  [✕]
```

All toast text: `var(--text-sm)`. Toast title: `font-weight: 600`.

Deduplication note: if 3 agents fail simultaneously, one toast reads `"3 agents errored — [View details →]"`, not 3 separate toasts. Resolves research:r5 (deduplication rule).

### Async state demonstrated
**Loading**: skeleton (3 notification rows shimmer). **Loaded**: full list. **Empty**: "No notifications" zero-state (`var(--text-sm) --fg-muted`, centered, 120px height). **Error**: `<FetchError>` with retry.

### Findings/laws resolved
- notifications-alerts #1 (aria-live total failure → two live regions)
- notifications-alerts #2 (panel reads Zustand store, recipient from auth)
- notifications-alerts #3 (severity differentiation with icon+text+color)
- notifications-alerts #4 (bell aria-label with count)
- notifications-alerts #5 (toggle 20px → 32px; role="switch" aria-checked)
- notifications-alerts #6 (delete confirmation step)
- a11y-forms #2 (toggle ARIA)
- WCAG 1.4.1: all status = icon + text, never color alone

---

## Screen 8 — `settings.html`

### Purpose
Large settings surface made navigable via left section-nav, inline search, and progressive disclosure. Demonstrates 15px+ form typography, accessible labels, proper toggle semantics, and error prevention for destructive actions.

### Layout — named grid regions

```
┌────────────────────────────────────────────────────┐
│ HEADER (h1="Settings")                             │
├──────────────┬─────────────────────────────────────┤
│ SECTION NAV  │ CONTENT AREA                        │
│ (200px fixed)│ (single column, max-width 640px,    │
│              │  centered in remaining space)        │
│ [Search…]    │ [Section heading]                   │
│              │ [Field groups]                      │
│ • General    │ [Disclosure accordions]             │
│ • Security   │                                     │
│ • Appearance │                                     │
│ • AI Models  │                                     │
│ • Billing    │                                     │
│ • Advanced   │                                     │
└──────────────┴─────────────────────────────────────┘
```

### Section Nav

`<nav aria-label="Settings sections">`. Search input at top: `<label for="settings-search" class="sr-only">Search settings</label><input id="settings-search" type="search" placeholder="Search settings…">`. Height 44px.

Nav links: each `<a>` 44px height, `var(--text-sm)`. Active: left border 2px `--accent`, bg `--surface-2`. Resolves Fitts's Law for settings navigation.

6 top-level sections — stays within Miller's 7±2. Sub-sections within each are progressive disclosure.

### Content Area — General section (active/shown)

`<section aria-labelledby="general-heading">`. `<h2 id="general-heading">General</h2>` at `var(--text-h2)`.

**Form field pattern** (applied to every field in the screen):

```html
<div class="field-group">
  <label for="field-id" class="field-label">Workspace Name</label>
  <p class="field-hint" id="field-id-hint">Shown in the header and exports.</p>
  <input id="field-id" type="text" aria-describedby="field-id-hint"
         value="Opzava Internal">
</div>
```

`field-label`: `var(--text-sm)` font-weight 600, display block, `margin-bottom: var(--space-1)`.
`field-hint`: `var(--text-xs)` `--fg-muted`, `margin-bottom: var(--space-2)`.
Input: `var(--text-body)` (15px — prevents iOS auto-zoom), `height: 44px`, border `--border`, border-radius `--radius-md`, `padding: 0 var(--space-3)`.

Resolves finding a11y-forms #1 (all inputs have programmatic `<label htmlFor>` + id pairs).

Sample General fields:

| Field | Type | Value |
|---|---|---|
| Workspace Name | text | "Opzava Internal" |
| Default Language | select | "English (US)" |
| Timezone | select | "UTC-5 (Eastern)" |
| Date Format | select | "YYYY-MM-DD" |

Save button: `[Save changes]` primary (44px) + `[Discard]` ghost (44px). Placed at the bottom of each section — after all fields, Fitts's Law end-of-eye-path.

### Content Area — Security section (collapsed, shown for reference)

`<details>` / `<summary>` at `var(--text-h2)`: "Security". Expands to:

**Interface Mode Toggle**:
```html
<label class="field-label" id="interface-label">Interface Mode</label>
<div role="radiogroup" aria-labelledby="interface-label">
  <label class="radio-option">
    <input type="radio" name="interface" value="essential"> Essential — 7 core panels
  </label>
  <label class="radio-option">
    <input type="radio" name="interface" value="full" checked> Full — all panels
  </label>
</div>
```

Resolves finding ia-nav #4 (Essential/Full buried 3 clicks deep). This surface gives a second, discoverable entry point. Radio buttons: 44×44px touch target via padding.

**Boolean Toggle (e.g., Enable Two-Factor Auth)**:
```html
<div class="field-group toggle-row">
  <span class="field-label" id="2fa-label">Two-Factor Authentication</span>
  <button role="switch" aria-checked="false" aria-labelledby="2fa-label"
          class="toggle-switch h-8">
    <span class="sr-only">off</span>
  </button>
</div>
```
Toggle: `height: 32px; width: 52px`. Thumb: `24×24px` circle. `aria-checked` updates on click. Resolves finding a11y-forms #2.

### Content Area — Appearance section

Theme selector: grid of 10 theme swatches (48×48px color circle + name at `var(--text-xs)` below). Selected swatch: 2px `--accent` ring. `role="radiogroup"`, each swatch `role="radio" aria-checked`.

Density preset: `role="radiogroup"`, 3 options (Comfortable / Regular / Compact) as labeled radio buttons.

### Content Area — Advanced section

`<details>` collapsed by default. `<summary>` text: "Advanced — danger zone". Background `--status-err-bg` on the expanded area.

**Destructive actions**: each has a modal confirmation flow, not `window.prompt()`. Resolves finding dense-panels #5 (super-admin window.prompt).

Example:
```
[Reset all agent configurations]   → Opens Modal with:
  Title: "Reset all agent configurations?"
  Body: "This cannot be undone. 42 agents will be reset to defaults."
  Footer: [Cancel] (ghost, 44px)   [Reset All] (destructive variant, 44px)
```

Modal: `role="dialog" aria-modal="true" aria-labelledby="modal-title"`. Focus trapped to modal on open. Escape closes. Focus returns to trigger on close. Resolves finding components-std #2 (14 modals without dialog ARIA), finding dense-panels #5.

### Field validation pattern

Inline error state (shown on one field for demonstration):
```html
<div class="field-group field-error">
  <label for="api-key">API Key</label>
  <input id="api-key" type="text" aria-invalid="true" aria-describedby="api-key-err"
         value="invalid-key-format">
  <span id="api-key-err" role="alert" class="field-error-msg">
    ✕ Invalid format — API keys must begin with "sk-"
  </span>
</div>
```

Error message: `var(--text-xs)` `--status-err` — both icon and text (WCAG 1.4.1). `role="alert"` announces to AT immediately. Input: red border `--status-err`.

### Async state demonstrated
**Loading**: skeleton for the section content (3 field-group skeletons per section). **Loaded**: full form. **Save pending**: `[Save changes]` button shows spinner + disabled state. **Save error**: `<FetchError role="alert">` inline above the save button.

### Findings/laws resolved
- a11y-forms #1 (all inputs have `<label htmlFor>` + `id` pairs)
- a11y-forms #2 (toggles have `role="switch" aria-checked`)
- dense-panels #5 (window.prompt → modal with confirmation)
- ia-nav #4 (Essential/Full accessible here as radio group)
- Typography #1 (inputs at 15px → no iOS zoom)
- Hick's Law: 6 nav sections, one action per field row, advanced collapsed
- Tesler's Law: reasonable defaults shown; Advanced section collapsed
- WCAG 4.1.2: all form controls have name/role/value
- Fitts's Law: Save button at end of form, 44px height

---

## Cross-Cutting Build Constraints

These rules apply to all 8 files without exception:

| Constraint | Enforcement |
|---|---|
| All text ≥15px, tertiary metadata ≥13px | `var(--text-body)` default; `var(--text-xs)` (13px) minimum for any visible text |
| No `text-[10px]`, `text-[9px]`, `text-2xs` | Not defined in `tokens.css`; any usage is a build error |
| All touch targets ≥44px | `app.css` rule; icon buttons use `.icon-btn-compact` 32px minimum with padding compensation |
| All status indicators: icon + text + color | No color-only badges |
| All interactive elements have accessible names | `aria-label` on icon buttons; `<label htmlFor>` on all inputs |
| `prefers-reduced-motion` reset outside `@layer` | Applied in `app.css` at root (not inside any `@layer` block) |
| Dark void theme; no hardcoded hex | All colors via `var(--*)` tokens only |
| Font sizes via CSS custom props | No hardcoded `px` in component styles |
| Loading/empty/error states per panel | All 4 states covered in screens 2, 3, 4, 6, 7, 8 |
| No `window.prompt()` | Replaced by `<dialog>` modal pattern |
| Semantic HTML | `<main>`, `<nav>`, `<section aria-labelledby>`, `<table>` with `<caption>` |
