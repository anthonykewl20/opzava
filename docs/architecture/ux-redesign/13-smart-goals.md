# 13 — SMART Goals in a Project ("Set a clear target")

> **Scope.** This document designs **one new Essential capability** — a **SMART Goal card** that a user can add inside a project's page. SMART = **S**pecific · **M**easurable · **A**chievable · **R**elevant · **T**ime-bound (Asana's goal framework). It answers one calm question per project — *"what does success look like, are we hitting it, and what work moves it?"* — without a dashboard, a KPI wall, or a traffic light.
>
> Built **entirely** on the existing contract (`tokens.css` + `app.css` + `shadcn.css`) and the established mockups. It is the **calm Basecamp inversion** of Asana Goals: Asana carries goal health in **green / amber / red** on-track/at-risk/off-track chips — the exact traffic-light pattern the Essential design law **forbids**. We reuse the *structure* (target+current → %, owner, time period, connected work, periodic check-ins) and replace its *colour-only status* with **label + glyph**, the single `--accent`, and the `✦` AI marker.
>
> This document is the design spec; the mockups (`§9`) are the contract a developer implements (`08 §A.1` — *Interface First*).

---

## 1. Goal & verdict

**Goal.** Let a project hold a small number of clear, measurable goals — shared upfront, connected to the work, checked in on regularly — rendered so calm that an **Off-track** goal reads as quietly as an **On-track** one. The per-project AI **Atlas (✦)** can turn a rough wish ("we want more signups") into a genuine SMART goal in one click.

**Verdict — the five headline decisions:**

1. **Two surfaces, strict division of labour — NOT a peer tile-as-home.** (a) A calm **primary-goal banner** pinned directly under the project header band (the one thing Asana says to *share upfront*); (b) a **🎯 Goals tile** in the existing tool-grid (AI-assisted, `border-top:2px solid var(--accent-border)`) that opens a dedicated **Goals list page** (`essential-goals.html`) holding the full card anatomy, every goal, check-ins, and connected work. The banner is the **glance**; the list is the **detail** — the same tile→detail rhythm Discovery and Performance already use. The tile is the *doorway*, never the goal's only home; the banner is the *north-star*.
2. **MANY goals per project, ONE primary.** A project holds 0..n goals; exactly one is flagged primary and rendered in the banner. The rest live on the Goals page (objective + supporting goals). Progressive disclosure, not an OKR wall on the project home.
3. **An eight-state, glyph-led status vocabulary** — four in-flight (`◴ On track · ◑ At risk · ◓ Off track · ⏸ Paused`) and four terminal (`✓ Achieved · ◗ Partial · ✕ Missed · ⊘ Dropped`) — where the **glyph carries the meaning, the word confirms it, and `--accent` (indigo) marks only the ONE goal that currently needs you** (e.g. *"◓ Off track · needs you"*). No red/amber/green health. Filled-fraction glyphs (`◴◑◓`) ramp with severity so the scale is legible in greyscale.
4. **The number is the health signal, not the bar.** The only progress visual is the single-accent `.perf-bar` lifted verbatim from `essential-mkt-performance.html` — `current → target (NN%)`; the fill is **always** `--accent`, never recoloured by health. Status is read from the **number + the word**, never a bar hue.
5. **Atlas "Make it SMART" is the value-add, on the proven Discovery rail.** Create/edit is **one calm 3-step dialog** (Write · Measure · Own & schedule — NOT a literal 5-step S→M→A→R→T form), with Atlas's *"✦ Make it SMART"* drafting an entire goal from one rough sentence using the verbatim Discovery `propose → Use this draft / Tweak it` interaction.

**The single most important discipline:** status discrimination lives entirely in the **glyph + word + number** — remove every colour and the system still works fully. The one accent on the page is reserved for the single goal that wants a human hand (Von Restorff).

---

## 2. Reference teardown — what the best products do, translated to "sb-*"

Every row traces to a named precedent and lands on an existing class. The dominant, repeated pattern: **one well-defined outcome · a target+current metric → % · an owner · a time period · connected work · periodic check-ins** — and Asana's thesis that *goals must be connected to the work and checked-in regularly, not stranded in a spreadsheet.*

| Pattern | Best-in-class precedent | What we borrow | Maps onto |
|---|---|---|---|
| **Goal = target+current → %** | Asana Goals · Mooncamp · Perdoo (number / % / currency metric) | `current / target unit · NN%` with a single thin bar; cap at 100% visually, true % in label | `.perf-bar` / `.perf-bar-track` / `.perf-bar-fill` / `.perf-pct` (verbatim, `essential-mkt-performance.html`) |
| **Status = on/at-risk/off** | Asana Goals (green/amber/red) — **the anti-pattern** | The *states*, NOT the colour: carry by glyph + word in a neutral chip | `.sb-statusline` (`.sl-glyph`+`.sl-label`+`.sl-meta`), `--accent` only for needs-you |
| **Trend vs last check-in** | Asana progress sparkline · Perdoo confidence | Direction glyph `↑/↓/→` "since last check-in", **never** colour | `.trend-up` (`--fg`) / `.trend-down` (`--fg-muted`) from the performance page |
| **Owner** | Asana goal owner · Lattice goal lead | One named owner; AI vs human by shape+✦, never colour | `.sb-avatar` / `.sb-avatar--ai` (rounded-square + ✦) |
| **Time period** | Asana (quarter/half/annual/custom) · Workboard cycle | A quiet period chip + a calm "by Dec 31 · 18 days left" line | `.sb-badge` chip + `.u-mono` `.u-subtle` `--text-xs` |
| **Connected work** | Asana "connect work to goals" · Mooncamp linked KRs | List the to-dos / board cards / campaign that move the metric, each with `N of M done` | `.list-progress` "N of M done" (`essential-todos.html`) + `.sb-check` |
| **Periodic check-ins** | Asana status updates · Perigon weekly check-in | Reverse-chron feed of "what changed + new status", AI can draft | `.feed` / `.feed-item` (`essential-project.html`) + `.comment.ai` (✦ draft-then-approve) |
| **AI drafts the goal** | Asana "AI goals" beta · linear AI | Rough phrase → drafted SMART goal + weak-letter flags → accept/tweak | `.ai-card` + `.sb-badge--accent` "✦ Atlas" (`essential-discovery.html`) |
| **Guided create** | Asana SMART goal builder · 15Five | A short guided dialog, each step asks Asana's guiding question | `.sb-overlay`+`sb-dialog` + `.sb-steps` rail (`essential-connect-wizard.html`) |
| **Share upfront** | Basecamp "what success looks like" pinned · Asana goal banner | One north-star sentence pinned above the tools, not buried | a new `.proj-goal` banner = `.card` between header band and `.tool-grid` |
| **SMART rubric** | Asana 5-facet builder · Atlassian SMART checklist | A read-only "is this goal SMART?" tick strip — **create/edit only** | `.sb-check` (derived, not user-toggled) |

**Do NOT clone** Asana Goals' colour status (green/amber/red badges), its goal dashboard / progress-chart mosaic, or its KPI roll-up grid — those are the traffic light + the wall the law forbids. Reuse the *model*, drop the *colour and the dashboard.*

---

## 3. The SMART → card mapping (each letter → what's on the card)

The five letters are **captured at create-time**; the resting card foregrounds only the signal-bearing three (Measurable + Time-bound + Status). Achievable and Relevant are prose behind progressive disclosure, never labelled metric fields.

| Letter | Asana's guiding question | On the card |
|---|---|---|
| **S — Specific** | One well-defined outcome tied to a project/result. | **The goal statement IS the card title** — one plain sentence. No "Specific:" label; the sentence is the specificity. |
| **M — Measurable** | An objective metric (number / % / currency) so success is unambiguous. | The **measurable row**: `current → target unit` + the single-accent `.perf-bar` + computed `NN% there` + a trend glyph. The **number is the health signal.** |
| **A — Achievable** | Do the skills + resources exist? (not too easy / not impossible) | A quiet feasibility **sentence** behind the disclosure ("Team & templates in place; realistic within the quarter."). Never an "Achievable: yes" field. |
| **R — Relevant** | Realistic within real constraints, aligned to a bigger objective (no burnout). | A "**Why this matters / Aligned to**" prose line behind the disclosure ("Aligned to Customer Experience H2 — keeps support quality up as volume grows, without overtime."). |
| **T — Time-bound** | An end date that creates urgency and stops scope creep. | A calm `◷ by Dec 31 · 18 days left` line (mono, `--fg-muted`) — **never a red countdown**; the period (Q4 · Oct 1–Dec 31) sits in disclosure. Tightness bumps the *status word*, not the date colour. |

**On the resting card, "SMART" is implied by the eyebrow label only.** The five-facet rubric appears as a read-only `.sb-check` tick strip **only in the create/edit dialog** (a quality gate that teaches the rubric without putting five live checkboxes on the calm card).

---

## 4. The calm card anatomy (with mock copy)

A single `.card` (`.card-header` + `.card-body` + `.card-footer`), generous `--space-5` padding, four resting tiers + one disclosed tier. Nothing competes with the **sentence** and the **number**.

**Resting state, top → bottom:**

- **Row 0 — header.** `.u-caps` eyebrow `SMART GOAL` (13px, `--fg-subtle`) on the left; on the right the `.sb-statusline` status atom + a `⋯` `.btn-ghost.btn-icon` overflow.
- **Row 1 — the goal statement (hero, S + T).** `<h3 class="card-title">` at `--text-md` (17px) / `lh-snug`, max ~2 lines. The `from 82% to 90%` and `by Dec 31` may take slight `<strong>` emphasis — still `--fg`, **never accent colour.**
- **Row 2 — measurable (M).** Left mono value pair `82% → 90%` (`.u-mono .u-tnum`; current at `--text-lg`/`--fg`, target at `--text-sm`/`--fg-muted`) · the `.perf-bar` (`.perf-bar-track` rail + single-`--accent` `.perf-bar-fill`, width = progress, capped at 100%) · `.perf-pct` "76% there" · a delta `.sb-badge--secondary` with a direction glyph "↑ +3 pts this period".
- **Row 3 — time-bound + owner (`.u-between`).** Left: `◷ by Dec 31 · 18 days left` (mono, `--fg-muted`, `--text-xs` on the relative part). Right: owner via `.sb-avatar` — `✦ Atlas` (`.sb-avatar--ai`) or a person (`Maria`, circle).
- **Row 4 — footer.** The `<details>`/`<summary>` disclosure toggle *"Why it matters · 3 linked · last check-in 4d ago ▾"* + a single `.btn-primary` **Check in**.

**Behind the disclosure (available-not-present):** the **A + R** prose lines ("Why this matters / Aligned to"); the **connected work** list (`✓` to-do, `▦` board card, `▣` campaign, each `name — N of M done`); the **check-in history** feed; the **time period** ("Q4 2026 · Oct 1 – Dec 31"). An `＋ Link work` `.btn-ghost` attaches more.

### 4.1 Realistic mock copy (Asana's example goals, calm-law-obedient)

**Card A — percent (primary, banner-pinned).**
- Eyebrow `SMART GOAL`; title *"Increase support response-time satisfaction from **82% to 90%** by **Dec 31** — by revising triage and response templates."*
- Measurable `82% → 90% · 76% there`, bar 76%, chip `↑ +3 pts this period`.
- Time `◷ by Dec 31 · 18 days left`; owner `✦ Atlas`; status `◴ On track`.
- Footer *"Why it matters · 3 linked · last check-in 4d ago ▾"* + **Check in**.

**Card B — number.**
- Title *"Produce at least **3 large-scale marketing assets** per month through Q1."*
- Measurable `2 → 3 assets this month · 67%`; status `◑ At risk · 6 days left`; owner `✦ Iris`.

**Card C — currency / hours.**
- Title *"Provide **100 hours** of free tutoring during **February**."*
- Measurable `64h → 100h · 64%`; time `◷ ends Feb 28 · 9 days left`; status `◴ On track`; owner `Dan` (human).

---

## 5. Status convention — eight states as LABEL + GLYPH (the load-bearing piece)

Every state is a **GLYPH + LABEL** pair in a **neutral** `.sb-badge--secondary` via the `.sb-statusline` atom; `--accent` (`.sb-statusline--accent`) is reserved for the SINGLE "needs you" meaning, and **then the label changes to carry the ask** (`◓ Off track · needs you`). Discrimination lives in the **glyph shape** — filled-fraction `◴◑◓` ramps with severity, `✓✕⊘◗` are categorical — legible in greyscale and to colour-blind users. **There is no red-bad / green-good axis: an Achieved goal and a Missed goal are equally calm.**

| # | Glyph | Label | Phase | When | Accent? |
|---|---|---|---|---|---|
| 1 | **◴** | **On track** | in-flight | Progress keeping pace with time elapsed. Resting — quietest. | no |
| 2 | **◑** | **At risk** | in-flight | Slipping but recoverable; pace behind, time remaining tight. | only if it now **blocks a human** → label becomes *"At risk · decision needed"* |
| 3 | **◓** | **Off track** | in-flight | Behind with no current path; or past-due with progress incomplete. | only when **blocking** → *"Off track · needs you"* |
| 4 | **⏸** | **Paused** | in-flight | Deliberately on hold; clock not pressing. | no |
| 5 | **✓** | **Achieved** | terminal | Met or exceeded target at close. A win is a **calm neutral ✓**, never accent. | no |
| 6 | **◗** | **Partial** | terminal | Real progress, target missed at close. | no |
| 7 | **✕** | **Missed** | terminal | No meaningful progress at close. | no |
| 8 | **⊘** | **Dropped** | terminal | Deliberately abandoned, no blame. | no |

**Why this is not a traffic light** (state it verbatim in the build): the neutral chip is the **same** across all eight states — only the glyph + word differ; `--accent` appears on at most the one goal that wants a human, and *the word changes* ("needs you") when it does. **Status changes ONLY via a check-in** (`§7`), so there is always a "why". At most ONE goal per project ever wears the accent (Von Restorff). The trend arrow is **direction not colour**; the bar fill is **always** `--accent`.

**Rollup (N goals → 1 line), worst-needs-you wins but stays calm:** any goal **blocking** → `◓ {name} needs you` in the one accent; else all on track → `◴ On track` neutral; else a factual split `2 on track · 1 at risk`, neutral, `tabular-nums`. **Correction to `essential-marketing.html`:** its Performance tile currently uses `badge-success "On track"` — replace with a **neutral** `.sb-badge--secondary` + `◴` glyph.

**Accessibility:** glyphs are `aria-hidden`; the word is the accessible name (`aria-label="Goal: On track, updated 4 days ago"`). Human-read labels stay at the **15px floor** (`--text-sm`); only timestamps, units, %-meta, "days left", milestone due dates may drop to `--text-xs` (13px).

---

## 6. Information architecture & placement

### 6.1 The decision matrix

| Option | Verdict | Why |
|---|---|---|
| **(a) A 🎯 Goals tile as the goal's only home** | ❌ as primary | A tile reads "one tool among eight" and buries the *share-upfront* intent the feature exists to serve. Fine only as a **doorway** to the list. |
| **(b) A primary-goal banner under the project header** | ✅ **the glance** | The calmest spot to make the goal visible without a dashboard: inherits the 1040px column, sits in the natural reading path right after the project description, zero new chrome. This is the north-star. |
| **(c) A dedicated Goals list page (`essential-goals.html`)** | ✅ **the detail** | Full card anatomy, every goal, check-ins, connected work, the create dialog. Banner → "Check in →" / tile → here. |
| **(d) A goals dashboard / KPI wall on the project page** | ❌ **REJECT** | Violates calm-first. The banner is one sentence + one bar; the wall is Full/admin only. |
| **(e) Banner + tile-doorway + list page** | ✅ **THE ACTUAL RECOMMENDATION** | One north-star glance (banner), one doorway (tile), one detail surface (list). Marketing projects point the 🎯 tile at the existing `essential-mkt-performance.html` (already a multi-goal tracker) instead of a second page. |

**Banner placement:** insert a `.proj-goal` band between `.proj-band` (header) and `.tool-grid`. Neutral `.card`; a left accent (`border-left:3px solid var(--accent)`) **only** when status = needs-you (mirrors Home's rollup card + the `.attention-line` pattern), neutral otherwise. **When no goal exists**, the slot collapses to a single dashed *"🎯 Set a goal for this project"* add-row (reuse Discovery's `.add-idea`), not an empty card (available-not-present).

### 6.2 Don't conflate goal status with activity status

The project header's existing `badge "2 active"` answers *"is work happening?"*; goal status answers *"are we hitting the target?"*. Keep them separate — never merge.

### 6.3 Connect to the work (Asana's thesis)

A "Driven by: `▦` Board · `✓` 3 to-dos · `▣` June Launch campaign" line links the goal to the tiles that move it, so it is never stranded. **Auto-roll vs manual** is decided by metric type: when the metric **is a count of work** ("Produce 3 assets/month", "Provide 100 hours"), current auto-computes from connected to-dos/cards done — show a quiet `↻ Auto · from linked work` tag, no manual entry; when the metric is **external/measured** (leads, %, $), the connected work is context but the number is a **manual check-in entry** — show `✎ Update number`.

### 6.4 Home rollup (light, no dashboard)

Extend the **existing** Home rollup, don't add a goals dashboard. On each project card add ONE goal chip to the existing `.tool-row` — `🎯 90% by Q4 · 86%`. The top "N projects need you" line may fold in an at-risk goal ("1 goal at risk") using the same `border-left:3px solid var(--accent)` treatment. No cross-project goals page in this scope.

---

## 7. Create / edit flow + the ✦ Atlas "Make it SMART" assist

**Create = ONE calm 3-step dialog** (NOT a literal 5-step S→M→A→R→T form — that is the long enterprise form Asana itself warns against). Reuse `essential-connect-wizard.html`'s chrome 1:1: `.sb-overlay` + ~560px `sb-dialog`, `.wiz-head` ("New goal" + ✕), `.wiz-steps` with the `.sb-steps` rail, `.wiz-body`, `.wiz-foot` (`← Back` ghost left, **one** `.btn-primary` right). **Exactly one `.btn-primary` per step.**

**The rail reads: `1 Write · 2 Measure · 3 Own & schedule`.** The five letters map: **S** lives in step 1 (title + outcome); **M** is step 2; **T** is step 3; **A + R** collapse into two optional one-line fields behind a `▸ Sanity-check (optional)` disclosure on step 1 — the key calm move that keeps the flow to three screens.

| Step | Title | What it shows | Asana guiding question (as `.wiz-lead`) |
|---|---|---|---|
| **1** | **Write your goal** (S) | Atlas assist is the **hero, above** the manual fields: a one-line `.input` "In a sentence, what do you want to achieve?" + a `✦ Make it SMART` button (**accent-soft, not primary** — an offer). Below: `Goal title` `.input` + `The outcome you want` `.textarea`. A `▸ Sanity-check (optional)` disclosure reveals **A** ("Do we have the skills & resources?") and **R** ("Why does this matter — what bigger goal does it serve?"). A `▸ Start from a template` disclosure offers the three seeded examples. | *"A SMART goal names ONE clear outcome — what does done look like?"* |
| **2** | **Make it measurable** (M) | A segmented `.wiz-tabs` metric type `Number · % · Currency`; three `.field`s `Start / current`, `Target`, unit. A **live single-accent `.perf-bar`** preview updates as you type ("120 → 200 · 60% of the way"). A small toggle `Update manually` vs `Roll up from connected work`. | *"Pick one objective metric so progress is unambiguous — a number, a percentage, or an amount."* |
| **3** | **Own it & set a deadline** (T + owner + work) | (a) **Owner** avatar-picker (default current user; Atlas = `.sb-avatar--ai`+✦, humans = circle). (b) **Time period** `.wiz-tabs` `This quarter · Half · Year · Custom` (Custom reveals an end-date `.input`). (c) **Connect the work**: a compact multi-select chip list of this project's To-dos / Board cards / Campaigns + a quiet `✦ Atlas can suggest which work moves this metric` link. Footer button → `.btn-primary` **Create goal**. | *"An end date creates urgency and stops scope creep."* |

### 7.1 The Atlas "Make it SMART" assist (the value-add)

Clicking `✦ Make it SMART` on a rough phrase ("get more signups") renders an `.ai-card` proposal **inline in step 1** — the verbatim Discovery markup (`.ai-card` + `.sb-badge--accent "✦ Atlas"` + `.ai-card-row` primary/ghost buttons). Three parts:

1. **A drafted SMART rewrite** — *"Increase weekly signups from 120 to 200 by 30 Sep by launching the referral flow and a landing-page test."*
2. **A weak-letters line** built from `.sb-statusline` atoms — for each S/M/A/R/T a glyph+label, `✓` for present and a quiet `▸ needs a number` / `▸ needs a deadline` (accent **only** on the actionable bits, per the status law; **never red**). Example: *"M ▸ no number yet · T ▸ no deadline yet"*.
3. **A suggested target from project context** — Atlas reads the current signup count + the project's Q-end date and proposes target + start + deadline.

Two buttons (the Discovery `Add / Dismiss`, repurposed): `.btn-primary` **Use this draft** (fills every field across all 3 steps; advances nothing — user still reviews) and `.btn-ghost` **Tweak it** (drops the draft into the editable fields). The assist is an **inline, dismissible offer** that fills the same fields the user could fill by hand — never a mandatory gate or a chat takeover.

### 7.2 Templates (seeded from Asana's real examples)

Behind `▸ Start from a template` on step 1, so the blank slate is never intimidating:
1. **Support** — "Increase customer-support response-time satisfaction from 82% to 90% by end of Q4…" → metric %, start 82, target 90, This quarter.
2. **Content** — "Produce at least 3 large-scale marketing assets per month this quarter" → Number, start 0, target 3, unit "assets", recurring monthly.
3. **Volunteering / Ops** — "Provide 100 hours of free tutoring during February" → Number, target 100, unit "hours", custom date range.

### 7.3 Edit flow

Re-opening an existing goal opens the **same dialog without the `.sb-steps` rail** (single scrollable `sb-dialog` — the SMART scaffolding has finished teaching). All fields pre-filled; `✦ Make it SMART` stays available as "Ask Atlas to refine". Adds lifecycle controls absent at create: a final-state select (`Achieved / Partial / Missed / Dropped`), a manual `current value` update (for non-rolled-up goals), and `Archive goal` in an `.sb-menu--danger`.

### 7.4 After create

Dialog closes, a `.toast` confirms *"Goal added — On track"*, the goal card appears on the Goals page, and (if marked primary) in the project banner.

---

## 8. Tracking, check-ins & connected work

Four progressively-disclosed bands inside the card.

- **Measure band.** `.perf-bar` + `current / target unit (NN%)` + trend glyph `↑ +4% since last check-in`. Percent is computed `current/target` for "increase to" goals and `(start−current)/(start−target)` for "reduce" goals (e.g. response time down). `tabular-nums` throughout. Over-target caps the bar at 100% with the true % in the label (the `is-over` precedent).
- **Status band.** The `.sb-statusline` chip (`§5`) + muted *"updated 1 week ago by ✦ Atlas"*. **The most recent check-in's status IS this band** — single source of truth.
- **Connected-work band** ("What's moving this"). Rows reusing the `N of M done` + mini-bar pattern: *"✓ June newsletter — 3 of 5 to-dos done"* (bar 60%), *"▦ Board: Partner spotlight — in progress"*, *"▣ June Launch — Measure stage, 86% of lead goal"*. Auto/manual per `§6.3`. Zero links → calm empty prompt *"Link the to-dos or campaign that move this →"*.
- **Milestones (optional, collapsed).** Named thresholds as `.sb-check` rows: *"✓ 60% beta cohort onboarded · ○ 80% triage workflow live (Aug 15) · ○ 100% 90% satisfaction (Q4 end)"*. Not separate goals; collapsed by default (available-not-present). Done = checked accent ✓; upcoming = hollow + muted due date `--text-xs`.
- **Check-ins band** (the heartbeat). Reverse-chron `.feed`/`.feed-item`: each = avatar + "what changed + new status" + the resulting status chip + timestamp — *"✦ Atlas · On track · 'Templates 7/10 done, satisfaction ticked to 85%' · 4d ago"*. **Atlas can draft** a check-in (`.comment.ai` left-border + `.sb-badge--accent "✦ AI"`, human edits/approves before posting — same draft-then-approve contract as AI card comments). Human check-ins use a plain circle avatar. Band head: `＋ Add check-in` / `✦ Draft check-in`. The footer surfaces freshness as `.sl-meta` ("last check-in 4d ago"); the primary footer action **Check in** opens a tiny form (pick status, enter new current value, add a note). **Auto-progress is supported but a manual check-in always wins** (Asana's auto-or-manual model).

---

## 9. Build plan

### 9.1 Mockup files (Essential, `data-theme="calm"`)

| File | Purpose |
|---|---|
| `mockups/essential-goals.html` | **NEW.** The Goals list/detail page: the primary goal expanded (full SMART anatomy — statement, single-accent `.perf-bar`, label+glyph status, owner, time period, the `<details>` disclosure with A/R prose + connected work + check-in feed + milestones) and supporting goals below as compact cards. Includes `＋ Add a goal` (opens the dialog), the empty state, and a footer tile-nav back to the project. |
| `mockups/essential-goal-create.html` | **NEW.** The 3-step create dialog open in an `.sb-overlay`, shown across steps: (1) Write + the `✦ Make it SMART` `.ai-card` proposal with weak-letter flags + the Sanity-check/Template disclosures + the read-only SMART rubric tick strip; (2) Measure with the live `.perf-bar` preview + metric-type tabs; (3) Own & schedule (owner picker, period tabs, connect-work chips). Demonstrate the manual path and the Atlas fast-path side by side. |
| `mockups/essential-project.html` | **EDIT.** Add the `.proj-goal` **primary-goal banner** (Card A copy) between `.proj-band` and `.tool-grid`, plus a `🎯 Goals` tile (AI-assisted `border-top:2px solid var(--accent-border)`, foot `◴ On track · 2 goals`) → `essential-goals.html`. |
| `mockups/essential-marketing.html` | **EDIT.** Same banner; the `🎯 Goals` link points at the existing `essential-mkt-performance.html`. Correct the Performance tile's `badge-success "On track"` to a neutral `.sb-badge--secondary` + `◴` glyph. |
| `mockups/essential-home.html` | **EDIT.** Add the `🎯` goal chip to project cards' `.tool-row`; fold an at-risk goal into the "needs you" rollup line. |

### 9.2 What to reuse (near-zero new CSS)

- **Shell:** copy the `.bc` / `.topbar` / `.topnav` / `.bc-wrap` calm shell verbatim from `essential-project.html` (all three stylesheets, `theme-toggle.js`, `tools-bar.js`).
- **Card:** `.card` / `.card-header` / `.card-title` / `.card-body` / `.card-footer` (app.css).
- **Measurable bar:** `.perf-bar` / `.perf-bar-track` / `.perf-bar-fill` / `.perf-pct` + `.trend-up`/`.trend-down` — **promote these from page-local into `app.css`** so the goal card and the performance page share one definition.
- **Status:** `.sb-statusline` (+ `--accent` only for needs-you).
- **Owner:** `.sb-avatar` / `.sb-avatar--ai` / `.sb-avatar-group`.
- **Connected work / milestones:** the `N of M done` mini-bar pattern + `.sb-check`.
- **Check-in feed:** `.feed` / `.feed-item` + `.comment.ai` (✦ draft-then-approve).
- **Dialog:** `.sb-overlay` + `sb-dialog` + `.wiz-head`/`.wiz-body`/`.wiz-foot`/`.wiz-lead`/`.wiz-tabs`/`.wiz-disc` + `.sb-steps`/`.sb-step`/`.sb-step-bar`.
- **Atlas assist:** `.ai-card` + `.ai-card-row` + `.sb-badge--accent` (from Discovery).
- **Forms:** `.field`/`.label`/`.input`/`.textarea`/`.select` + `.toast` + `.sb-menu--danger`.

### 9.3 New CSS to add (~30 lines, to `app.css` / `shadcn.css`)

```
.goal-card               — the measurable-row spacing + the <details>/<summary> footer toggle styling
.proj-goal               — the primary-goal banner band wrapper (a .card with optional --accent left-border)
(promote) .perf-bar*, .trend-*  — move from essential-mkt-performance.html page-local into app.css
```

No new status, avatar, badge, dialog, or step components — every signal-bearing atom already exists.

### 9.4 Wiring (when this leaves mockup → product)

- **Model:** a goal = `{ statement, metric_type, start, current, target, unit, owner, period, status, linked_work[], check_ins[] }`; `primary` flag pins it to the banner.
- **Progress:** auto-roll from connected to-dos/cards when the metric is a work-count; manual check-in value otherwise (manual always wins).
- **Status:** computed from progress-vs-time-elapsed, but **set/changed only by a check-in** so there's always a note; `--accent` only when blocking a human.
- **Atlas:** "Make it SMART" and "Draft check-in" call the per-project assistant; AI output is **drafted, human-approved** before it posts (✦ marks AI, never colour).
- **Home/banner rollup:** render from the same project-rollup endpoint that backs the existing "projects need you" line.

### 9.5 Gallery

Add `essential-goals.html` and `essential-goal-create.html` to `mockups/index.html` under a **"Goals"** group, and capture `thumbs/` for each (matching the existing thumbnail convention).

---

## 10. Rejected for calm (and exactly why)

| Rejected | Why it breaks the contract |
|---|---|
| **Traffic-light status** (green On-track / amber At-risk / red Off-track — Asana Goals' own pattern) | The exact pattern the law forbids. Status = glyph + word in a neutral chip; `--accent` only when a goal needs you, and then the *label* says "needs you". |
| **A progress bar that changes hue by health** (green→red) | The bar fill is **always** `--accent`; over/under-target is read from the % label + the status word. |
| **A red countdown clock on the deadline** | Time-bound is a calm "by Dec 31 · 18 days left" in `--fg-muted`; urgency surfaces as the status *word* ("At risk"), never red date text. |
| **Five live, user-toggled S/M/A/R/T checkboxes on the resting card** | Turns a goal into a checklist and breaks progressive disclosure. The rubric ticks are read-only and appear only in create/edit. |
| **A literal 5-step S→M→A→R→T wizard** | The long enterprise form Asana itself warns against. Fold S into Write, demote A+R to optional inline prompts, keep it to 3 screens. |
| **A goals dashboard / KPI wall / chart mosaic / sparklines / stat-grid** | The dashboard wall — Full/admin only. Essential is a banner (one sentence + one bar) + a calm list. |
| **A 🎯 Goals tile as the goal's only home** | Demotes the north-star to "one tool of eight" and kills the share-upfront intent. The tile is a doorway; the banner is the home. |
| **Surfacing Achievable / Relevant / linked-work / check-in history on the resting card** | Violates available-not-present. Keep the resting card to statement + measurable + deadline + owner + status. |
| **`--success`/`--warning`/`--destructive` badges for persistent status** | Manufactures a red/amber/green wall (note: correct `essential-marketing.html`'s `badge-success "On track"`). |
| **`--accent` on more than one goal, or on Achieved** | Accent is the single needs-you signal (Von Restorff); a win is a calm neutral `✓`. |
| **Auto-rolling progress for externally-measured metrics** (leads, %, $) | Those are manual check-in entries; only work-count metrics auto-roll. |
| **Letting status change without a check-in note** | Status must always have a "why"; the latest check-in IS the status source of truth. |
| **Posting Atlas's draft without human approval** | AI drafts, human approves — same contract as AI card comments; AI vs human is the `✦` glyph, never colour. |
| **Conflating goal status with the project's "2 active" activity badge** | They answer different questions; keep separate. |
| **A separate cross-project Goals dashboard** | Out of scope; the rollup is a chip on the Home project card + the existing "needs you" line. |
| **Icon library / SVG status icons** | Raw Unicode glyphs/emoji only — `◴ ◑ ◓ ⏸ ✓ ◗ ✕ ⊘ ✦ ↑ ↓ → ◷ 🎯 ＋`. |
| **Any human-read label below the 15px floor** | Only timestamps, units, %-meta, "days left", milestone due dates may use `--text-xs` (13px). |

---

## 11. The "Add a card" entry point — consensus (2026-06-24)

A 4-perspective consensus (all four converged, so this is decisive not a compromise) on where the **"add a card to a project"** affordance lives, after it was found inconsistent (present on the generic project, missing on Marketing — the user saw only "＋ New campaign" and was unsure how to add a card).

**Decision — ONE universal pattern:** a persistent, always-visible **dashed `＋ Add a card` tile** as the **FINAL child of every project workspace's primary `.tool-grid`**, opening `essential-add-card.html`. No header button, no section "+", no "Customize"/edit-mode gate.

**Why it's calm + unambiguous:**
- **Discoverability** — the add affordance lives *among the cards*, in natural scan order, where the next card would appear (the canonical "add to this collection" pattern: Trello "Add a list", Jira column "+", Notion gallery, Basecamp tools). A header button sits far from the grid it changes.
- **The two-`＋` distinction is by ALTITUDE + FORM, not by hiding one.** Header `＋` = a **solid accent pill** (`.btn-primary`) with a type-specific verb-noun (`＋ New campaign` / `＋ New to-do`) = *create a work ITEM inside a card's spine*. Grid `＋` = a **dashed ghost TILE** (no fill, `--fg-muted`) with the generic `＋ Add a card` = *add a whole CARD/feature to the workspace*. Different region, fill, shape, and label grammar — a user never conflates a dashed grey rectangle in the grid with a solid blue pill in the header. **Rule:** `＋ New {item-noun}` = create inside; `＋ Add a card` = add a card to the workspace — never swap them.
- **Always-available, never gated** — adding is the most common, additive, reversible customization; a "Customize" mode would re-create the exact undiscoverability reported. Reorder/remove live *inside the picker* (which already says "rearrange or remove any time") and an optional quiet per-tile `⋯` overflow — both neutral (no second accent). The resting surface shows no drag-handles or ✕.
- **Label `Add a card` verbatim** (not "Add a tool" = upstream jargon clashing with the picker's own "Add a card to <Project>" title; not "Customize" = a rejected mode). Glyph `＋` (fullwidth, matching every other `＋` in the shell), `aria-hidden`; the text carries the accessible name.

**Root-cause + the fix:** the inconsistency happened because the entry was a **hand-copied inline-style blob** on one template and forgotten on the other. Promoted to a shared **`.tile--add`** class in `app.css` (`align-self:stretch` so it matches sibling card height under `.tool-grid{align-items:start}`); both `essential-project.html` and `essential-marketing.html` now use `<a class="card tile--add" href="essential-add-card.html">＋ Add a card</a>`.

**FUTURE-TYPE INVARIANT (do not re-litigate per type):** every project-type workspace renders its type-specific tiles in a primary `.tool-grid` whose **final child is the shared dashed `＋ Add a card` tile** → `essential-add-card.html`. New types (Sales / Support / Events) inherit the entry point for free by adding one class. `essential-add-card.html` needs no change — its title is type-aware and its picker is type-agnostic.

---

*This spec is the contract; `mockups/essential-goals.html`, `essential-goal-create.html`, the `.proj-goal` banner + `🎯 Goals` tile + the shared `.tile--add` entry in `essential-project.html` / `essential-marketing.html` realize it.*
