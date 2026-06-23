# 10 — The Research / Brainstorm-with-AI Board (per-project "Research" tab)

> **Scope.** This document designs **one new per-project surface**: a calm place where a user and the project's AI assistant *ideate, gather research, capture and organize ideas, vote, and converge on a decision* — then hand the winner off to a To-do or Board card. It is built as a **calm adaptation of Basecamp's Card Table + Message Board**, never an infinite-canvas whiteboard. Evidence is drawn from a 7-product survey (Basecamp, Trello, Asana, Jira Product Discovery, Confluence, GitHub Discussions, and the Miro/FigJam/MURAL/Notion AI-ideation family). Every design call below traces to a **named product precedent** or a **UX law**, per the house contract (`07 §"Jakob's Law"`, `08`). The screen is realized as `mockups/essential-research.html` (already linked from `essential-project.html` line 210).

This document is the design spec; the mockup is the contract a developer implements (`08 §A.1` — *Interface First*).

---

## 1. Goal & verdict

A "research / brainstorm with AI" board for Opzava is **a single calm column-board where ideas are captured as cards (by a human *or* the project assistant), parked in a four-stage lifecycle, lightly voted on to converge, and promoted to real work** — with the AI surfaced as a *side composer you ask to brainstorm*, not as the primary surface. It must answer one question for a non-technical user: *"What are we thinking about on this project, and what did we decide?"* The **verdict is to reject the infinite-canvas whiteboard entirely for the Essential view** (it fails the Basecamp-calm contract — spatial-memory load, no reading order, poor accessibility) and instead compose three already-proven, already-built Opzava primitives: **idea-cards-in-status-columns** (the Card Table look), **a threaded discussion + AI brainstorm composer** (the project-assistant chat), and **a lightweight 👍 convergence count** (GitHub Discussions' upvote). This is the simplest combination that satisfies the goal, and **every part of it already exists in the mockup component library** — so the new surface adds *zero new interaction vocabulary*.

---

## 2. Cross-product consensus — the proven-simple primitives

Rows are the primitives that recurred across the survey; columns name **which products ship it**, **how**, and **why it stays simple**. A primitive is "adopted" only when ≥3 independent products converge on it *and* it maps to an existing Opzava component. Citations are the research `sources` arrays.

| # | Primitive | Who ships it (and how) | Why it's simple | Adopt? |
|---|---|---|---|---|
| **P1** | **Idea card = one idea, compact front, detail behind a click** | Basecamp Card Table (title + 1 assignee + date); Trello (front shows title + badges only, body hidden); Asana (title + 1 visible field, right slide-in for detail); JPD (one-line title + pinned fields, tabbed drawer); Confluence/Miro/FigJam (sticky = one idea) | One-idea-per-card is a culturally-ingrained physical-Post-it model (**Jakob's Law**); compression keeps the board scannable; depth is opt-in. | ✅ reuse `.ct-card` |
| **P2** | **Status columns: a short discovery lifecycle (New → Exploring → Decided → Parked)** | Basecamp (Triage / Not-Now / Done, protected); JPD (Status chips New→Exploring→Decided→**Parked**; Now/Next/Later board); Asana (themed columns "To explore / Promising / Archived"); Trello (Raw Ideas → Promising → Parked → Decided) | 3–4 named buckets = the whole mental model; movement is **explicit human drag**, never automated; **"Parked" is the deliberate non-delete rest state** so ideas are never lost or clogging. | ✅ reuse `.ct-col` |
| **P3** | **Lightweight convergence signal (👍 count / dot-vote), sortable** | GitHub Discussions (single-click upvote arrow + integer, sort by Top); Trello Voting Power-Up (vote badge on front) & spacebar dot-vote; JPD (Vote field as a column); Confluence/Miro/FigJam (dot-voting, stamp counts) | One click, reversible, **no modal, no scoring rubric**; the count is inline so the winner is obvious by scan; convergence without a meeting. | ✅ new `.idea-vote` (👍 + count) |
| **P4** | **Threaded discussion co-located on the idea — flat / one level deep, with "mark as the decision"** | Basecamp Message Board (flat comments, no sub-threads); GitHub Discussions (**one** level of nesting + **mark-as-answer** badge that floats the decision to top & badges the row); Trello/Asana/JPD/Miro (comments on the card, not a global channel) | Discussion stays *with* the idea (context co-located); **flat or one-level** avoids unreadable reply trees; **mark-as-answer** makes convergence explicit and permanent. | ✅ reuse card comment thread + new "This is the decision" mark |
| **P5** | **AI brainstorm partner = a side composer invoked on demand, dropping ✦-marked editable cards; can cluster / summarize** | Confluence Rovo (bottom-right panel: "Explore ideas" → ≤3 idea cards onto canvas, all editable); FigJam Jambot / MURAL Converse / Miro Sidekick (chat widget → new stickies); JPD inline `/Rovo` (Brainstorm/Summarize, **accept-before-commit**); Asana inline AI; Notion `/` + Space | AI is a **secondary helper** triggered by one action, **never the primary surface**; output lands as ordinary editable cards (non-destructive); **accept/discard gate** preserves trust; clustering/summarizing does the tedious sort, the human decides. | ✅ reuse project-assistant composer pattern |
| **P6** | **A research-sources / notes capture (paste a URL → a small evidence tile; pinned notes/brief)** | JPD Insights (paste URL → favicon + domain + excerpt tile; evidence linked to an idea); Confluence/Asana "Key Resources" (pinned links + embeds); Basecamp Docs & Files (cloud links as first-class entries); Notion Research Mode | Keeps research **traceable to the idea** without a separate repository; the tile is scannable (one glance = how much evidence backs an idea); **paste, don't import**. | ✅ new `.src-tile` (favicon + domain + note) |
| **P7** | **Pre-named columns / blank-slate-with-purpose (template, never an empty canvas)** | Basecamp (calm text-only blank slate explaining the surface); Asana (always renders with pre-named columns + sample cards); Trello (template boards w/ pre-named lists); Confluence (7-step Brainstorming template); FigJam ("Generate" scaffold) | Defeats blank-page paralysis (**Doherty / Postel**); the column order *is* the method; user replaces sample content rather than designing structure. | ✅ board ships pre-seeded |
| **P8** | **One-click promotion: a decided idea becomes a real work item, same object, no re-entry** | Asana (idea card *is* a task; move to execution project, keeps comments/history); GitHub (Ideas → Issues); JPD (idea → linked delivery ticket); Confluence Whiteboard (sticky → Jira work item) | Zero friction between ideation and execution; **no copy-paste, no lost context** at the highest-value transition moment. | ✅ "Turn into a to-do" → `essential-card.html` |

**Convergence read-out.** Six of eight primitives are unanimous across the calm/structured products (Basecamp, Asana, JPD, GitHub) *and* the canvas products (Miro/FigJam/MURAL/Confluence). The two that differ — **how AI is surfaced** (P5) and **how research is captured** (P6) — both resolve toward the *structured* side: AI as an opt-in side composer (Notion/JPD/Confluence-Rovo), research as paste-a-URL tiles (JPD Insights). Nothing in the consensus requires an infinite canvas.

---

## 3. What to AVOID — the complexity traps (and why they break Basecamp-calm)

Each trap below was flagged in **multiple** product `avoid` lists; the "why" ties it to the Essential contract (`07`, `08`).

| Trap | Flagged by | Why it breaks Basecamp-calm |
|---|---|---|
| **Infinite freeform canvas / sticky-note whiteboard as the primary surface** | Basecamp (explicitly excluded), JPD (explicitly avoided), GitHub, **all** of Miro/FigJam/MURAL/Notion's own `avoid` notes | Imposes **spatial-memory load** ("where did I put that?"), has **no persistent reading order**, degrades on mobile, and is poor for keyboard/AT users. Violates `08 §"proven patterns, not novelty"` and the 15px-floor/scan-first ethos. *This is the single most important rejection.* |
| **Too many statuses / custom-field setup before the surface works** | JPD (custom-field prerequisite = its biggest calm-killer), Asana (custom-field config overhead), Trello (card-back bloat) | A non-technical user must never configure field types or mapping to get value. **Hick's Law** — 3–4 fixed buckets, pre-decided and invisible. The board arrives working (`07 §4 no dead-ends`, P7). |
| **Mode-switching / AI as a separate tool or a second competing panel** | Asana ("two panels competing for attention"), Miro (multiple Sidekick personas = decision fatigue), Trello (Power-Up/Butler separate interface), GitHub (Copilot not context-aware) | Forces the user to leave the board to think *with* the project, fragmenting context. AI must be an **inline/side assist on the existing board**, accept-before-commit (P5), never a destination. |
| **Novel voting/interaction gestures** (drag-to-rank, swipe, emoji-vote sequences, connector-line-to-AI-widget) | GitHub ("single-click upvote is the proved minimum"), Miro/FigJam (connector-to-Jambot = learned metaphor) | Every novel gesture is friction without proportional signal. **Jakob's Law** — reuse the one-click 👍 users already know (P3). |
| **Threaded sub-reply trees & reaction/upvote *gamification* on every item** | Basecamp (no sub-threads, no reactions, no upvotes on messages — deliberate), GitHub (caps nesting at one level) | Deep trees are unreadable; social-pressure scoring distorts *which* ideas rise, not which are *best*. Keep discussion **flat/one-level** and voting a **quiet convergence aid**, not a leaderboard (P4). |
| **Automatic state transitions / hidden automation** (auto-advance on subtasks, Confluence Smart Sections, AI that silently re-clusters) | Basecamp (movement always explicit), Confluence (Smart Sections surprise users), GitHub/Miro ("AI that auto-reorganises breaks 'my idea is still here' trust") | Invisible side-effects undermine the explicitness Basecamp values and erode trust. **Every AI action is user-triggered and reversible.** |
| **Bundling too many primitives onto one surface** (notes + voting + timers + stamps + connectors + AI + embeds) | Confluence (its named biggest trap), Miro (facilitator controls disorient solo/async users) | Each primitive is simple alone; the *cumulative* toolbar becomes a tool the user must learn. **Tesler's Law / `08 §A.9 Less Software`** — ship the minimum (P1–P8), nothing "to round it out." No timers, no stamps, no facilitator/presenter mode in Essential. |

---

## 4. The recommended archetype for Opzava

**Archetype: "Calm Idea Board" = idea-cards-in-status-columns (P1+P2) + a co-located threaded-discussion/notes lane with mark-as-decision (P4+P6) + an AI brainstorm partner as a side composer (P5), with a one-click 👍 to converge (P3) and one-click promotion to a To-do/Board card (P8). The board ships pre-seeded (P7).**

### Why this combination wins against the consensus

- **It is the intersection of every product's *calm* half.** Basecamp's Card Table gives the column/card spine and the "explicit movement, no automation" discipline. JPD contributes the **New→Exploring→Decided→Parked** lifecycle and the **Insights** research-tile and the **accept-before-commit** AI gate. GitHub contributes the **one-click 👍** and **mark-as-the-decision** convergence. Asana contributes **one-click promotion** (the idea *is* the future task). Confluence/Notion/FigJam confirm the **AI-as-side-helper, output-as-editable-cards** pattern. No single product is copied; the *agreed-upon simple core* is.
- **It reuses 100% of the existing Opzava component vocabulary.** The board is the `essential-card-table.html` look (`.ct-board`, `.ct-col`, `.ct-card`); the AI composer is the `project-assistant.html` composer + `✦ AI` badge; cards, comment threads, and promotion link to `essential-card.html`. **Zero new mental models** (`07` Jakob's Law acceptance criterion).
- **It honors the tab cap and the audience model.** It is a *per-project tab*, not a new top-level destination — so it never touches the Essential 4–5-item top-nav cap (`08 §A.9`, `09 §2`). It is jargon-free: "Research / Ideas", not "Discovery", "RICE", or "matrix".

### Explicit rejection: the infinite-canvas whiteboard

The FigJam/Miro/Confluence-Whiteboard infinite canvas is **rejected for the Essential view**, on the unanimous evidence of §3 row 1. Spatial freeform breaks reading order, accessibility, mobile, and the "proven patterns, not novelty" rule that *defines* Essential (`07`, `08`). **When, if ever, could it appear?** Only as a **Full/admin-only optional "Canvas" mode** for a power user who explicitly wants affinity-mapping on a large screen — never the default, never in Essential, and never the surface a decision is recorded on. Even then it would be a *secondary view toggle* on this same board (cards ↔ canvas), with the column-board remaining the source of truth. It is **out of scope for this redesign** and listed only to close the question.

### Rejected alternatives (for the record)

- **Impact-vs-Effort matrix scatter plot (JPD).** Powerful but it presumes two numeric fields the user must define and score — custom-field overhead (§3 row 2) and a chart a non-technical user must learn to read. *Rejected for Essential; a candidate for a Full/admin view only.*
- **Dot-voting *sessions* with timers / anonymous mode (Confluence/Miro).** Facilitator machinery that disorients solo & async researchers (§3 last row). Replaced by the always-on, friction-free 👍 count (P3).
- **A pure long-form doc (Basecamp Message Board / Asana Brief only).** Great for the *record*, but it doesn't *organize* divergent ideas or converge them. We keep a lightweight **pinned brief + notes** (P6) but the board is the spine.

---

## 5. The design — a concrete Essential/calm "Research" tab

### 5.1 Where it lives

A **per-project tab named "Research"** (the project-workspace tile already reads **"Research & Ideas"**, glyph 💡, in `essential-project.html`). It sits alongside To-dos · Board · Ask your assistant · Team · Docs · Schedule · Updates. It is **not** a top-level nav item (preserves the `08 §A.9` cap). Proposed label: **Research** (tile keeps the fuller "Research & Ideas"). Route precedent: `essential-research.html`.

> One-line scope note at the top, mirroring `essential-ask-opzava.html`'s `.scope-note`: *"✦ This is where you and Atlas think out loud on this project — capture ideas, gather research, and decide. Ask Atlas to brainstorm anytime."*

### 5.2 ASCII wireframe (Essential, calm — ≥960px)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Opzava   Home   My stuff   Messages ③   Activity ②   ✦ Ask Opzava   Find…      ＋  🔔  AG │  ← canonical calm topbar
└──────────────────────────────────────────────────────────────────────────────────────────┘
  ← Q2 Content Push                                                          (breadcrumb, like card-table)

  💡 Research                                          [ Cards ▾ ]   [ ＋ Add an idea ]   [✦ Brainstorm]
  Think out loud with Atlas — capture ideas, gather research, vote, decide.        ↑ board│↑primary│↑opens drawer

  ┌─ scope-note ────────────────────────────────────────────────────────────────────────────┐
  │ ✦ This is where you and Atlas think on this project. Ask Atlas to brainstorm anytime.     │
  └──────────────────────────────────────────────────────────────────────────────────────────┘

  ┌── BOARD (reuses .ct-board / .ct-col / .ct-card) ──────────────┐   ┌─ ✦ Brainstorm drawer ─────────┐
  │  New ②          Exploring ②       Decided ①      Parked ①      │   │ ✦ Atlas        [✦ AI]   ✕      │
  │ ┌──────────┐   ┌──────────┐     ┌──────────┐   ┌──────────┐    │   │ ─────────────────────────────  │
  │ │💡 Idea    │   │💡 Idea    │     │✓ Idea     │   │💤 Idea    │    │   │ You: give me 5 angles for the  │
  │ │Add a      │   │Weekly     │     │Launch a   │   │A printed  │    │   │      Q2 newsletter             │
  │ │"founder   │   │founder    │     │referral   │   │zine (cost)│    │   │                                │
  │ │voice" memo│   │AMA series │     │program ✦  │   │           │    │   │ ✦ Atlas: here are 5 — keep the │
  │ │           │   │           │     │           │   │           │    │   │   ones you like:               │
  │ │👍 4   🙋 At│   │👍 6  🙋 You│     │👍 9  ✓ kept│   │👍 1       │    │   │  ┌─────────────────────────┐   │
  │ │💬 2  🔗 1  │   │💬 5  🔗 3  │     │💬 8 →to-do │   │💬 0       │    │   │  │✦ "Behind the build" diary│   │
  │ └──────────┘   └──────────┘     └──────────┘   └──────────┘    │   │  │  [Add to board] [Dismiss]│   │
  │ ┌──────────┐   ┌──────────┐                                     │   │  └─────────────────────────┘   │
  │ │✦ Idea     │   │💡 Idea    │                                     │   │  ┌─────────────────────────┐   │
  │ │AI-drafted │   │Partner    │                                     │   │  │✦ "5-minute reads" series │   │
  │ │"reader    │   │spotlight  │                                     │   │  │  [Add to board] [Dismiss]│   │
  │ │poll" idea │   │swap       │                                     │   │  └─────────────────────────┘   │
  │ │👍 2  ✦ AI │   │👍 3  🙋 Ir │                                     │   │   …3 more  [Add all] [Dismiss] │
  │ └──────────┘   └──────────┘                                     │   │ ─────────────────────────────  │
  │ ＋ Add an idea  ＋ Add an idea                                    │   │ [ Cluster these ] [ Summarize ]│
  └───────────────────────────────────────────────────────────────┘   │ ┌────────────────────────────┐ │
                                                                        │ │ Ask Atlas to brainstorm…   │ │
  ┌── 🔗 Research & notes  (P6, collapsible) ─────────────────────┐    │ │                      [Send]│ │
  │ ◧ stripe.com — "Referral program benchmarks"  added by You    │    │ └────────────────────────────┘ │
  │ ◧ figma.com — newsletter layout explorations   ✦ added by Atlas│    │ Atlas works on this project.   │
  │ ＋ Paste a link or write a note                                │    └────────────────────────────────┘
  └───────────────────────────────────────────────────────────────┘
```

**Reading order is top→bottom, left→right** — a single scan answers "what are we thinking about / what did we decide" with no spatial hunting.

### 5.3 Component spec — mapping to the existing system

Everything maps to `tokens.css` (calm/indigo) + `app.css` + `shadcn.css`. **AI-vs-human is glyph + label, never colour** (the contract): AI = `✦` + `.sb-badge sb-badge--accent "✦ AI"` + the `.sb-avatar--ai` rounded-square; humans = a plain round `.sb-avatar` with initials. The same `--chart-*` palette is used for *person identity*, never to mean "AI".

| Region | Built from (reuse) | Spec |
|---|---|---|
| **Topbar + breadcrumb** | `essential-card-table.html` topbar + `← Project` breadcrumb | Identical canonical calm topbar; breadcrumb back to the project workspace. |
| **Page header** | `.u-between` header pattern | `💡 Research` title; subtitle one line; right cluster = **view toggle `[Cards ▾]`** (Cards is the only Essential view; the ▾ is where a Full/admin "Canvas" could later appear), **`＋ Add an idea`** (primary), **`✦ Brainstorm`** (ghost, opens drawer). One primary action per region (`07 §3`). |
| **Scope note** | `.scope-note` from `essential-ask-opzava.html` | `✦` glyph + plain sentence; distinguishes "think with the assistant" from doing the work. |
| **Board** | `.ct-board` (horizontal flex, `overflow-x:auto`) | Same swim-lane spine as the Card Table. **Four columns** (P2): **New · Exploring · Decided · Parked**. `Decided` cards get `opacity:.85` + a `✓` like `.ct-col--done`; `Parked` reads muted like `.ct-col--hold`. Movement is **explicit drag**, never automated (§3). |
| **Idea card** | `.ct-card` (no schema change) | Card front (P1): a **kind glyph** (`💡` human idea / `✦` AI-suggested / `✓` decided / `💤` parked) + **title** (`.ct-card-title`) + a **foot row** with: `👍 count` (P3), an **author chip** (round `.sb-avatar--sm` = human, or `.sb-avatar--ai` + `✦ AI` = assistant), `💬 comment count`, `🔗 source count`. No status dropdowns, no priority badges, no label clouds (§3, Basecamp minimal-anatomy). Click → opens the idea (reuse the `essential-card.html` detail pattern). |
| **Vote (converge)** | new `.idea-vote` button | A single **`👍` + integer** on the card front; one click toggles your vote, reversible, no modal (P3, GitHub). A column-header **`Sort by 👍`** affordance re-ranks within a column (fixes Trello's "no auto-sort" friction). Quiet convergence aid, **not** a leaderboard — no avatars-stacked gamification. |
| **Idea detail + discussion** | `essential-card.html` comment thread | **Flat / one-level** thread co-located on the idea (P4). A **"⭐ This is the decision"** action (owner-only) marks the converging answer — it floats to the top of the detail and the card moves to **Decided** with a `✓ kept` badge (GitHub mark-as-answer, made explicit & reversible). |
| **✦ Brainstorm drawer** | `project-assistant.html` composer + `✦ AI` badge | A **right-side drawer** (not a separate page, not the primary surface — P5). Open via `✦ Brainstorm`. Contains: a short transcript; **AI-suggested idea cards each with `[Add to board]` / `[Dismiss]`** (accept-before-commit — JPD/Confluence-Rovo); footer actions **`[Cluster these]`** (groups existing board cards into named themes, *non-destructive copy*) and **`[Summarize]`** (drops a notes tile summarizing the board); a sticky composer (`.composer` / `.composer-input`) "Ask Atlas to brainstorm…"; the project-scope hint. Added cards land in **New** with a `✦` glyph + `✦ AI` badge — clearly AI-authored, fully editable. |
| **Research & notes** | new `.src-tile` (modeled on `essential-card-table.html` mini-rows + JPD Insights) | A **collapsible** lane under the board (P6): each row = a small tile `◧ domain — note · added by <author>` (paste a URL → favicon + domain + your note; or a plain text note). `＋ Paste a link or write a note`. Pinned notes/brief live here too. Keeps research traceable; **paste, don't import**. |
| **Promotion (hand-off)** | links to `essential-card.html` / `essential-todos.html` | On a **Decided** idea: a **`→ Turn into a to-do`** button creates a Board/To-do card carrying the idea's title, discussion, and sources (P8, Asana same-object). The Research card stays as the *record of the decision* (and shows `→ to-do` on its foot), so context is never lost. |

### 5.4 How each goal verb is satisfied (traceability)

- **Capture (human):** `＋ Add an idea` at a column foot (Trello single-click add) → a `💡` card in **New**.
- **Capture (✦ AI-suggested):** `✦ Brainstorm` drawer → AI cards with `[Add to board]` → `✦` cards in **New** (P5).
- **Organize:** drag between **New → Exploring → Decided → Parked** (P2); `[Cluster these]` for AI affinity-grouping into named themes (P5, non-destructive).
- **Research:** paste-a-URL tiles in the **Research & notes** lane (P6).
- **Vote / converge:** one-click `👍` count + `Sort by 👍` (P3); `⭐ This is the decision` mark (P4).
- **Decide & hand off:** decided idea → `→ Turn into a to-do` (P8), same object travels to the Board.

---

## 6. Async states + mobile

Per `08 §A.3` (three-state solution) and the index "all four async states" acceptance criterion — every state is a required deliverable, blank designed first (`08 §A.4`).

- **Loading.** Skeleton columns: 3–4 grey `.ct-col` headers with 2 shimmer `.ct-card` placeholders each; the Research-notes lane shows 2 skeleton rows. No spinner-only blank.
- **Empty (designed first).** Pre-seeded, purpose-explaining blank slate (P7, Basecamp/Asana): the four columns render *named but empty*, **New** shows one ghost card *"Your first idea goes here — or ask Atlas to brainstorm,"* a single primary `✦ Brainstorm` CTA, and a one-line explainer of what the board is for. Never a bare empty canvas.
- **Error.** Plain `role="alert"` copy + one retry, no jargon (`07 §5`): *"We couldn't load your ideas. Retry."* — never a stack trace, path, or code. If the **assistant** is unreachable, the board still works for human capture/voting; the drawer shows *"Atlas is offline — your ideas are saved; brainstorming will resume when it's back"* (graceful degradation, mirrors `09` offline copy). Technical detail is admin-only behind a "Technical details" disclosure.

**Mobile (≤640px collapse), per `08 §C.4`:**

- Topnav hides (logo + `＋` + 🔔 + avatar remain), matching every other Essential screen's `@media (max-width:640px)` rule.
- The board **stops being a side-scroll of columns** and becomes a **vertical stack of collapsible status sections** (New / Exploring / Decided / Parked as accordion headers with counts) — avoids the horizontal-scroll sprawl §3 warns about (Trello). Each open section lists its idea cards full-width.
- `✦ Brainstorm` becomes a **full-screen sheet** (the drawer can't sit side-by-side); the composer stays sticky-bottom full-width (reuse the project-assistant mobile composer).
- The **Research & notes** lane collapses to a single "🔗 Research (n)" expander.
- Card foot wraps; `Sort by 👍` stays as the one convergence affordance.

---

## 7. Build plan

### 7.1 Mockup file

**`mockups/essential-research.html`** — already referenced by `essential-project.html` (line 210) and intended to be reachable from the project tile (`Research & Ideas`, 💡). Build it dependency-free, linking `tokens.css` + `app.css` + `shadcn.css`, `data-theme="calm"`, copying the canonical topbar + `bc-wrap` shell from `essential-card-table.html`.

### 7.2 The 2–3 highest-value variations to show

1. **Populated board + open ✦ Brainstorm drawer** (the hero) — proves capture (human + AI), the four-column lifecycle, 👍 convergence, AI cards with `[Add to board]`/`[Dismiss]`, and `[Cluster]/[Summarize]`. This is the canonical screenshot for the gallery thumb.
2. **A decided idea handing off to a To-do** — the idea detail (reusing `essential-card.html`) with the `⭐ This is the decision` mark and the `→ Turn into a to-do` promotion (P8) — proves the brainstorm→execution loop, the surface's whole reason to exist.
3. **States strip** (secondary, below the fold like `essential-ask-opzava.html`'s `.states` block) — the **blank slate** (pre-seeded columns + ghost first-idea card) and the **assistant-offline** degraded drawer, side by side. Satisfies the three-state deliverable.

### 7.3 Wiring it in (edits)

- **`essential-project.html`** — *already done*: the **Research & Ideas** tile (line ~208–217) links to `essential-research.html` with the `💡` glyph and `✦ Atlas` badge. Verify the link resolves once the file exists; no further edit needed.
- **`index.html` (gallery)** — add a 14th Essential card (step 14, after "Blank slates & states") linking `essential-research.html` with a `thumbs/essential-research.png` thumbnail and copy: *"Research · brainstorm with AI — idea cards in New → Exploring → Decided → Parked, a 👍 to converge, a ✦ Brainstorm drawer, and one-click hand-off to a to-do."* Generate the thumbnail into `thumbs/` like the others.
- **Nav / breadcrumb** — the new page's only nav obligations: the canonical calm **topbar** (copy verbatim from `essential-card-table.html`) and a `← Q2 Content Push` **breadcrumb** back to the project workspace. **No new top-level destination** is added (preserves the `08 §A.9` cap and the `09 §2` model). The Research surface is reached *only* from inside a project, exactly like To-dos and Board.
- **Cross-reference** — add `10-research-brainstorm-board.md` to `README.md`'s Contents list and link it from `08`'s "Mockup specs follow" line so the doc set stays navigable.

---

> **Net:** the Research tab adds a genuinely new *capability* (think-with-AI ideation → decision) using **zero new interaction vocabulary** — it is the Card Table spine + the project-assistant composer + a one-click 👍, composed from the agreed-simple core of seven products and kept strictly inside the Basecamp-calm contract. The infinite canvas is rejected on unanimous evidence; AI stays a side helper that drops editable, accept-first cards; and every idea can become real work in one click.

---

## 8. Calm redesign — final consensus (added 2026-06-24)

The first build put all four jobs (idea board · AI brainstorm · research notes · async-state showcase) on one screen at equal weight — overwhelming, scattered, un-Basecamp. A consensus across an **MMX vision review** of the rendered screen, **UX-law web research**, and the **psychology of creativity** converges on one move: *put the right things one level back.*

**UX laws (the "why").** **Tesler's Law** — the irreducible complexity must be absorbed by the system, not pushed onto the user (sort chips, parked lane, the AI panel, and the states block were all on-surface). **Hick's / Miller's** — ~8 equal entry points and 6+ data points per card overflow working memory; cut to one focal point and one meta line. **Progressive disclosure (NN/G)** — show only what matters now; AI, research, parked, full card detail, and the async states all move behind one click. **Calm technology / one accent** — the AI was the loudest element on every card; AI must be *available, not present.*

**Psychology of creativity (what to protect).** Ideation needs **divergent thinking** — generate freely, *defer judgment* ("judging ideas as they emerge is the easiest way to snuff out creativity") — kept separate from **convergent thinking** (vote, decide). So: AI *generation* (divergent) is an **invoked** mode, never always-on; **voting** (convergent) is a **quiet** aid, never front-and-centre; and the board's left→right flow (New → Exploring → Decided) *is* the divergent→convergent arc.

**The changes (what ships in the calm rebuild):**
1. **AI = a button, not a rail.** The docked brainstorm drawer is removed from the surface; one `✦ Ask Atlas` opens it as an on-demand slide-over. The board is now full-width and unambiguously *the* page. *(the single biggest calm-down)*
2. **Board full-width, 3 columns** (New · Exploring · Decided); **Parked** becomes a `💤 Parked · 1 ▸` chip that opens its lane.
3. **Research & notes → a collapsed footer bar** `🔗 Research · 3 notes ▾`.
4. **Remove the on-surface "States" reference block and the dev loading note** — design-doc material (§6), never shipped to a user.
5. **One banner**, not two — the descriptive paragraph merges into the single scope line.
6. **Trim cards to title + one quiet meta line** (`💬 2 · 👍 4`); the `✦` mark appears *only* on AI-suggested cards, muted; per-card avatar clusters and the global AI corner-badge are removed; "✓ Kept" is static.
7. **One add + one AI affordance**; per-column Sort folds into a board-level Sort; `＋ New project` leaves the board (it is a *project* action, not a board action).
8. **One accent** (indigo) for actions + AI; status stays desaturated-semantic; whitespace becomes a primary element.

**Net:** on the surface — *the board, one banner, one AI entry, one research entry*; one click away — *the chat, full research, the parked lane, full card detail, all async states*; never shown — *reference/loading copy*. Same capability, Basecamp-calm. The `→ Connect to a project` hand-off on a Decided idea **stays** (it is the board's reason to exist).
