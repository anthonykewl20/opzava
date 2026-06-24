# 14 · Calendar & Schedule

> Essential view · per-project **Schedule** + a noted cross-project **My Schedule**. The one timeline where the AI team's autonomous tempo and the humans' commitments meet — read at a glance, drill one click at a time, never decode a colour.

## Why this surface is different

A normal work calendar carries two things: meetings and due dates. An AI-operations control plane carries four, and two of them have no precedent in Basecamp:

1. **Human meetings** — a person's timed slot (Team sync, Customer call).
2. **Due dates** — a to-do / report / asset that comes due (no clock).
3. **Goal deadlines & check-ins** — the end-date of a SMART goal (doc 13) and its recurring progress review, fed *onto* the calendar from the Goals page.
4. **AI work windows & scheduled runs** — *the headline net-new concept.* When an agent (Atlas, Echo, Iris) will run, for how long (a time **window**, not a single clock tick), what it will produce, and whether it ran. This is the AI team's heartbeat made visible on the timeline instead of buried in a feed.

The Schedule's unique job is to make that autonomous tempo **legible and steerable**: "5 AI runs this week · 2 deadlines · 1 needs you." Everything that follows serves that job under the calm-Basecamp design law — status is **label + glyph, never hue**; AI is shown by **✦ + `.sb-avatar--ai`**, never by colour; the single indigo `--accent` is reserved for the at-most-one item that needs a human now.

## Research synthesis — four lenses, one design

The four research perspectives converged tightly. Where they differed, the decision is recorded here:

- **Basecamp mechanics (lens 1)** contributed the *two-tier subscription model* (People involved ▸ full notifications vs Notify ▸ comment-only), automatic derived reminders, the event-as-discussable-object (comments + inline change-log), the "what should this schedule include" setting (events-only vs events + dated to-dos), one-way iCal subscribe, and the read-only cross-project **My Schedule / Upcoming Dates** aggregations. **Adopted**: subscription rings, derived-reminder line, change-log, include-setting, subscribe affordance, and a noted cross-project page.
- **IA / interaction (lens 2)** contributed the *4-level drill hierarchy* — Month → Week → **Day-detail (new keystone)** → **single-event drawer (new)** — plus the busy-day `+N more` overflow control, filter-by-removal (never recolour), and stable chrome across levels. **Adopted wholesale.** Decision: day-detail is an **in-page panel below the grid**; single-event detail is the **440px right `.drawer`** — two distinct surfaces so the levels never blur.
- **Visual systems (lens 3)** contributed the *type-glyph + kind-label + status-line* anatomy, the agent-run lifecycle glyphs, the goal-status reuse, the two-row legend, and the day-cell stacking/sort/cap rules. **Adopted.** Decision: lens 3 proposed `◷` as the *meeting* type-prefix, but `◷` is already the repo's goal/deadline-countdown glyph and lens 3 itself flagged the overload. **Resolved to `🗓` for meeting** so the four *type* glyphs (`🗓 ✓ 🎯 ✦`) never collide with the *status* set.
- **AI-ops value (lens 4)** contributed the *✦ Atlas "here's your week" brief*, the recurring `↻` affordance, goal-deadlines-feed-the-schedule, the deadline-risk computed-and-narrated accent item, the by-kind count card, and the Opzava-specific empty state. **Adopted**, with the Atlas brief as a *collapsible* top card (calm-first: it narrates, it doesn't dominate).

**Build decision (unanimous across lenses): EDIT `essential-schedule.html` in place** — it already has the three-pane shell, `.cal-grid`/`.cal-cell`/`.cal-chip` skeleton, Week/Month toggle, and legend. We extend that vocabulary; we do not fork a parallel system. One small new page (`essential-my-schedule.html`) is warranted for the read-only cross-project aggregation.

## Item-type vocabulary

Every chip is the existing 3-row `<div>`: `.cal-chip-title` (with a **leading TYPE glyph**) · `.cal-chip-meta > .cal-chip-kind` (the **kind label**) · `.cal-chip-status` (**status glyph + word**). The type glyph answers *what is this*; the kind label confirms it in words; the status line answers *where is it*. No chip is ever tinted by type — the four types are four **glyphs**, not four colours.

| Type | TYPE glyph (title prefix) | Kind label examples | Owner avatar | Status set (glyph + word) |
|---|---|---|---|---|
| **Meeting** (human) | `🗓` | `meeting · 10:00 am` | circular `.sb-avatar` (M / D / AG) | `● scheduled` · `✓ done` |
| **To-do / report due** | `✓` | `to-do due` · `report due` · `asset due` | circular (assignee) or none | `◦ upcoming` · `✓ done` |
| **Goal deadline / check-in** | `🎯` | `goal deadline` · `goal check-in · monthly` | per goal owner (often ✦ Atlas) | reuse doc-13 goal set: `◴ on track` · `◑ at risk` · `◓ off track` · `⏸ paused` · `✓ achieved` · `✕ missed` |
| **AI work window / run** (AI) | `✦` | `agent run · 9:00–9:40` · `daily summary · ↻ 8am` | **square `.sb-avatar--ai`** (A / E / I) | `◷ window` (planned) · `◦ queued` · `◐ running now` · `✓ done · 2 drafts` · `⏸ skipped` |

**The AI marker, three ways, zero hue:** (1) a leading `✦` on the title, (2) a *square* `.sb-avatar--ai` (radius-md, not a circle) with its `::after` ✦ badge, (3) the kind word `agent run`. A glance separates "Atlas drafts the newsletter (AI run)" from "Team sync (human meeting)" with no colour at all. The `✦` accent badge on `.sb-avatar--ai` is the **one** sanctioned place `--accent` rides an AI item — it is identity, not status.

**Window vs clock:** an AI run shows a **start–end span** (`agent run · 9:00–9:40`); a human meeting shows a **single clock time** (`meeting · 10:00 am`). Span-vs-tick is itself a legibility cue.

**Recurring:** a quiet `↻` glyph + plain cadence in the meta (`↻ daily 9am`, `↻ every Tue`) — never cron syntax (Essential rule; raw cron stays Admin/Full-view per doc 07). Recurring *events* render on every occurrence; a recurring *to-do* shows only its **next** due instance (Basecamp rule).

**Glyph collision guard:** `◷` means three things by *position* — title-prefix never uses it (we use `🗓`), so on a chip `◷` only appears in the **status** line meaning "scheduled window / deadline countdown." `◐` (running) is separated from goal `◑`/`◓` (at-risk/off-track) by the kind label `agent run`. The legend enumerates every glyph so the reuse is documented, not accidental.

## View hierarchy & drill-down

Four drill levels plus one persistent parallel rail. Chrome (topbar + project mini-nav + breadcrumb) **never changes** between levels; only the time window narrows and the per-item detail widens.

- **Level 0 · Month grid** (default, the hero). 7-col `.cal-grid`. All four types co-resident. Today = the accent day-num pill. Weekends = the lighter `.cal-cell--empty` band so the work-week reads as a clear block. Empty weekdays stay bare — whitespace *is* the calm signal.
- **Level 1 · Week** (the existing `Week|Month` `.view-pill`). Swaps the grid region only; rail + toolbar persist. A 7-day timed-ish column, same chip anatomy, with at least one AI window interleaved.
- **Level 2 · Day-detail** *(new keystone)* — opening a day-number, or the `+N more` overflow, reveals an **in-page panel below the grid**: a day header (`Wednesday · June 24 · today` + item count), then a time-ordered list — timed items first (meetings, AI windows with their span), then an "All day / due today" group (to-do dues, goal check-ins, agent runs without a clock). Each row is the chip widened to full bleed with owner avatar (✦ for AI) and an `.sb-statusline`. An opened-but-empty day shows the calm `.empty` block (`📅 Nothing scheduled for Jun 21` + a quiet `＋ Add event`), never a blank panel.
- **Level 3 · Single-event detail** *(new)* — the chip **title** is the `<a>` that opens the **440px right `.drawer`** (already in app.css) so the calendar stays visible behind it. Anatomy top-to-bottom: kind eyebrow · title (`<h2>`) · `.sb-statusline` · a `.kv` meta block (When · Owner · Project · Linked-to) · a short notes/agenda line · **People involved** row (full notifications) visually separated from a quieter **Also notified** row (comment-only) · a derived-reminder line ("We'll remind everyone involved 1 day and 1 hour before") · an optional **Join** button for a meeting link · a comment composer · 2–3 inline change-log entries ("Maria moved this from Jun 10 to Jun 11") + `View all changes`. Exactly **one** `.btn-primary`, and only in the needs-you variant ("Review the draft" / "Approve run"); every other action is `.btn-ghost`.
- **Parallel · Coming up · 7 days rail** — the persistent list view (Basecamp + Sunsama both keep grid + list side by side). Reordered to **lead with needs-you**, then today's AI runs (with windows), then meetings, then due dates. Each row leads with the TYPE glyph and carries an inline ✦ square avatar for AI. This rail *is* the canonical mobile / zoomed-out view (the grid collapses away below 860px).

Transitions: a **chip click** opens the single-event drawer; a **day-number / `+N more` click** opens the day-detail panel; the **Week tab** swaps the grid only; **Today + ‹ ›** re-window the *current* level (`Today` is `.btn-ghost`, not accent — it is navigation, not a primary action). The breadcrumb gains the date only at day level (`… › Schedule › Jun 24`).

## Opzava AI-calendar features

- **✦ Atlas "Here's your week" brief** — a *collapsible* card directly under the page header, above the month-nav, reusing the Ask-Opzava digest pattern (`.sb-avatar--ai ✦` + chat-bubble + 3–4 narrated rows): *"Here's your week, Anthony. 5 AI runs scheduled · 2 deadlines · 1 needs you."* Each row is plain language with one inline action (`[OK / Reschedule]`). At most one row carries the warning-soft background (the needs-you item). It narrates the grid below; it is not a separate page.
- **Goals feed the calendar** — a goal's end-date appears as a `🎯 goal deadline · ◷ Dec 31 · 18 days left` chip; its next review appears as `🎯 goal check-in · monthly`. Both link back to `essential-goals.html`, closing the loop doc 13 opened. The goal-status glyphs are reused **letter-for-letter** from doc 13 so Goals and Schedule never disagree.
- **Deadline-risk, computed and narrated** — this is where the single `--accent` earns its keep. At most **one** item per view flips to `.sb-statusline--accent` with `◑ at risk · needs you`, an accent left-border, and a one-line *computed reason*: "June newsletter due Fri — Atlas's draft window is full; needs you to move it or drop scope." Risk is a sentence, never a red dot. Everything healthy stays neutral surface-2, so the one accent item pops (Von Restorff).
- **By-kind count card** in the rail (replacing the old scheduled/upcoming/done stat): `AI runs 5 · Meetings 2 · Deadlines 2 · Needs you 1`.
- **Type filter (escape valve)** — a `.cal-toolbar` with a `Show ▾` `.sb-menu` (Meetings · To-dos · Goals · Agent runs, all on by default) so a user drowning in agent runs can mute the ✦ layer without losing meetings. Filtering **removes** glyph-classed chips; it never recolours. An active filter shows a removable `.sb-badge--secondary` pill ("Agent runs ✕"). Empty-after-filter shows the `.cal-empty` state.
- **De-jargoned scheduling** — the New-event flow gains an event-type pick; choosing **AI run** asks for agent + what + a window in plain words ("every weekday morning, 9–10am") with a `↻ Repeats` toggle. No cron, no UTC, no heartbeat in Essential.
- **One-way subscribe** — a quiet ghost "Subscribe / Add to your calendar" link above the grid (Basecamp → external only).

## Concrete component spec

**Anatomy guardrails (state each as a code comment, matching sibling files):** cards are `<div>`; the only `<a>` is the chip/drawer **title**; never nest `<a>` in `<a>`; the `+N more` is a `<button>` (not a chip, not a link); grids use `align-items:start`. Every chip carries a full-sentence `aria-label` ("Refresh FAQ, agent run, 9 to 9:40 am, running, by Atlas, AI") so the screen-reader experience never depends on a glyph.

**Day-cell stacking:** sort chips meeting → agent run → goal → to-do; cap at **3** visible, then a neutral `+N more` button (`var(--fg-muted)`, 13px) that opens the day-detail; **at most one** accent (needs-you) chip per day.

**Two-row legend** (bottom of grid, 13px metadata):
- *Types:* `🗓 meeting · ✓ to-do due · 🎯 goal · ✦ agent run (AI)`
- *Status:* `● scheduled · ◦ upcoming/queued · ◷ window · ◐ running · ✓ done · ◴ on track · ◑ at risk · ⏸ paused/skipped`
- Note: *"(type + status by glyph + label, never colour · ✦ = AI work · plain = human)"*

**Colour discipline:** all chips on neutral `var(--surface-2)`. `--accent` appears in exactly three places — the today day-num pill, the single needs-you status line/border, and the sanctioned `✦ .sb-avatar--ai` badge. Agent identity tints (Atlas = chart-2, Echo = chart-5, Iris = chart-3) are *identity*, never status. Text floor 15px for all chrome/titles; 13px allowed only for chip metadata, times, windows, "N days left", cadence, and the legend.

**States to mock:** populated Month (all four kinds, one busy day with `+3 more`, exactly one accent item) · Week · Day-detail panel · single-event drawer (human-meeting variant **and** ✦ agent-run-window variant, the latter with `View run →` + a needs-you `.btn-primary` approval state) · filter active with removable pill · empty-after-filter · Opzava-specific empty Schedule (`✦ Schedule an AI run` ghost button beside `＋ Add event`) · loading skeleton · the two-row legend.

**Reuse, don't reinvent:** `.cal-toolbar` / `.sb-menu` / `.cal-loading` / `.cal-empty` ported from `essential-mkt-calendar.html`; `.sb-avatar--ai` + `.sb-statusline` + `.sb-statusline--accent` + goal glyphs from `essential-goals.html` / shadcn.css; `.drawer` from app.css.

**New page warranted:** `essential-my-schedule.html` — the read-only cross-project aggregation reached from the top **Activity** / My-stuff nav (not inside a project). Same grid + agenda rail, every chip/row tagged with a small **project colour-dot** (`var(--chart-1..6)`, identity only — never status) + project name, a `Project ▾` filter, a date-range hint ("Next 3 months"), and **no Add button** (copy: "Add events from a project's Schedule"). The per-project Schedule stays the hero.
