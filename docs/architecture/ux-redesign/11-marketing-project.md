# 11 — The "Marketing & Promotion" Project Type (a focused, marketing-native tile set)

> **Scope.** This document designs **one new *project type***: a focused **"Marketing & Promotion"** workspace that replaces the generic project tile grid (`essential-project.html`) with a **marketing-native** set. The generic project is a calm Basecamp adaptation (To-dos · Board · ✦ Ask your assistant · Team · Docs & Files · Schedule · Updates · 💡 Discovery); a *focused project type* keeps the same calm shell and the same component vocabulary but **specialises the tiles to the marketer's actual job** — running campaigns through the **Plan → Create → Approve → Publish → Measure** lifecycle. Evidence is a 6-stream web survey of the marketing-PM market (Asana, Monday, Wrike, CoSchedule, Opal, ClickUp, HubSpot, Filestage, Marq, Ziflow, Sprout, Improvado). Every tile below traces to a **named product precedent** or a **lifecycle stage**, per the house contract (`07 §"Jakob's Law"`, `08 §A.9 Less Software`, `10 §1` calm-first). The screen is realized as `mockups/essential-marketing.html`.
>
> This document is the design spec; the mockup is the contract a developer implements (`08 §A.1` — *Interface First*).

---

## 1. Goal & verdict

A focused **"Marketing & Promotion"** project is a calm workspace whose spine is the **Campaign** — a named initiative with a brief, an owner, dates, channels, and a single goal — moving through five stages: **Plan → Create → Approve → Publish → Measure**. It answers the one question a marketer opens the workspace to ask: *"What is in flight, what is blocked on me, and what goes out next?"* — never *"here are 40 KPIs."* The **verdict** is a **7-tile calm set**: four marketing-native tiles (**Campaigns · Content Calendar · Approvals · Performance**), one specialised file shelf (**Assets**, the marketing rename of Docs & Files), and two kept-generic tiles (**✦ Ask your assistant · Team**). Everything else the market sells — a leads/pipeline CRM, a budget ledger, an audience-segment builder, a per-channel analytics wall — is **rejected from the home grid** as KPI noise or scope-creep and folded into a campaign's detail record where it belongs.

**The top priorities a marketer must see first** (the consensus across all six research streams, in order):
1. **Campaigns** — the spine; every other tile links back to a campaign. A marketer must always know *stage · owner · goal · next-due* for every active campaign at a glance.
2. **Content Calendar** — the daily anchor; *"what goes out this week, on which channel."* Unanimously the #1 recurring view (CoSchedule, Opal, Sprout, Loomly all lead with it).
3. **Approvals** — the #1 marketing bottleneck; a **distinct** sign-off queue so a blocked asset is never buried inside a task list (Filestage/Marq/Ziflow/Wrike-proofing).
4. **Performance** — closes the loop; *goal vs. actual* per campaign, calm — **not** a chart mosaic.
5. **Assets** — the single source of truth for creative, so nobody hunts Dropbox/Slack links.

---

## 2. Consensus table — every candidate card × who ships it × must/should/nice × lifecycle

Rows are every candidate card surfaced across the six research streams; a card is "consensus must" only when **≥4 of 6 streams** mark it `must`. Columns: **who ships it** (named precedents), the **pooled priority**, the **lifecycle stage**, and the **decision** for this project type. Sources are the per-stream `sources` arrays (Asana, Monday, Wrike, CoSchedule, Opal, ClickUp, HubSpot, Filestage, Marq, Ziflow, Sprout, Improvado, Adobe — full URLs in `§7`).

| Candidate card | Who ships it (precedent) | Streams `must` | Pooled priority | Lifecycle | Decision |
|---|---|---|---|---|---|
| **Campaigns** | Asana campaign mgmt · Monday · Wrike · ClickUp · HubSpot Campaigns | **6 / 6** | **must** | cross-cutting (Plan→Measure) | ✅ **ADD** — the spine. Replaces generic **Board**. |
| **Content Calendar** | CoSchedule Marketing Calendar · Opal Global Calendar · Sprout Publishing · Loomly · Asana · Wrike | **6 / 6** | **must** | Publish (anchors Plan→Publish) | ✅ **ADD** — specialises generic **Schedule**. |
| **Approvals** | Filestage · Marq · Wrike proofing · Ziflow · Asana approval stages | **6 / 6** | **must** | Approve | ✅ **ADD** — distinct queue. New tile. |
| **Performance** | CoSchedule Insights · Asana dashboards · Monday analytics · Improvado | **6 / 6** | **must** | Measure | ✅ **ADD** — one calm results page. New tile. |
| **Assets / Creative** | CoSchedule DAM · ClickUp creative assets · Asana assets · Brandfolder/Bynder | 4 / 6 (`must`), 2 `should` | **must–should** | Create | ✅ **SPECIALISE** generic **Docs & Files** → **Assets**. |
| **Channels** | Ziflow · Sprout · Hootsuite · Opal | 2 / 6 (`must`), 2 `should` | **should** | Publish | ❌ **FOLD** into Calendar (channel filter) + campaign detail. |
| **Budget** | Wrike · Monday · ClickUp templates | 0 `must`, 4 `should`, 2 `nice` | **should** | Plan | ❌ **FOLD** — one summary line on the campaign record. |
| **Intake / Requests** | Wrike dynamic forms · CoSchedule request forms · Asana Forms | 1 `should`, others fold | **should** | Plan | ❌ **FOLD** into the ✦ Campaign-Brief action inside Campaigns. |
| **Brief** | ClickUp brief template · Asana kickoff · HubSpot | 1 `must`, 2 `should/nice` | **should** | Plan | ❌ **FOLD** — a sub-page of each Campaign, not a tile. |
| **Audience / Segments** | every stream lists it | 0 `must`, 4 `nice` | **nice** | Plan | ❌ **REJECT** from grid — a field on the campaign record. |
| **Leads / Pipeline** | HubSpot/Salesforce (CRM layer) | 0 `must`, "exclude" | **nice** | Measure | ❌ **REJECT** — CRM layer; one MQL column in Performance at most. |
| **✦ Ask your assistant** | inherited generic (Opzava `project-assistant.html`) | n/a (generic) | **keep** | cross-cutting | ✅ **KEEP** generic — AI is the contextual ✦ helper. |
| **Team** | inherited generic (Opzava `essential-team-room.html`) | 2/6 keep, 1 reject | **keep** | cross-cutting | ✅ **KEEP** generic — humans-only room; roles shown here. |
| **Updates / Discovery** | inherited generic | optional | **keep (off-grid)** | cross-cutting | ◻ **KEEP available** but not on the focused 7 (one click from the project menu). |

**Convergence read-out.** Four cards are **unanimous (6/6)** — Campaigns, Content Calendar, Approvals, Performance — and map **one-to-one** onto four of the five lifecycle stages (Approve, Publish, Measure, and the cross-cutting spine). The fifth stage, **Create**, is covered by **Assets** (4/6 must). The contested cards (Channels, Budget, Intake, Brief, Audience, Leads) **all resolve the same way in every stream's `avoid` list**: they are real needs but belong *inside a campaign record*, not as equal-weight tiles on a calm home grid. That is the whole design move.

---

## 3. The RIGHT tile set — the headline decision

> **The focused "Marketing & Promotion" project ships 7 tiles. No more.** The market sells 12–15 surfaces; every research stream's #1 *"don't"* is **KPI noise / surface overload at first glance**. Calm > complete (`10 §1`, `08 §A.9`).

```
  KEPT generic (Jakob's Law — same as every project):   ✦ Ask your assistant    Team
  SPECIALISED (renamed/repurposed generic tile):         Schedule → Content Calendar      Docs & Files → Assets
  ADDED marketing-native (replaces Board + 3 new):       Campaigns   Approvals   Performance
```

### 3.1 The seven, and why each is a "must"

| # | Tile | Glyph | Origin | Lifecycle | Why it earns a tile (one line, evidenced) |
|---|---|---|---|---|---|
| 1 | **Campaigns** | ▣ | **ADD** (replaces Board) | spine | The central object every marketer opens first; without it the calendar and approvals have no context. **6/6 streams.** |
| 2 | **Content Calendar** | 📅 | **SPECIALISE** Schedule | Publish | *"What goes out this week"* — the unanimous daily anchor across every tool surveyed. **6/6.** |
| 3 | **Approvals** | ✓◷ | **ADD** | Approve | The #1 bottleneck; a *distinct* queue keeps blocked sign-offs from getting lost in task lists. **6/6.** |
| 4 | **Assets** | 📎 | **SPECIALISE** Docs & Files | Create | Single source of truth for creative; ends the Slack-link/Dropbox hunt. **4/6 must.** |
| 5 | **Performance** | 📈 | **ADD** | Measure | Closes the loop; goal-vs-actual must live *in* the project, calm — not in a separate analytics app. **6/6.** |
| 6 | **✦ Ask your assistant** | ✦ | **KEEP** generic | cross-cutting | AI stays a contextual ✦ helper (draft a brief, summarise results), **never a tile of its own KPIs** — the existing Opzava pattern. |
| 7 | **Team** | 💬 | **KEEP** generic | cross-cutting | The humans-only room; marketing roles (Copywriter, Designer, Approver) are visible here. Jakob's Law — keep the familiar generic. |

### 3.2 Which generic tiles are KEPT, SPECIALISED, ADDED, DROPPED

- **KEPT verbatim (Jakob's Law):** **✦ Ask your assistant** and **Team**. They behave identically to the generic project so a user who knows one project knows this one. **Updates** and **💡 Discovery** stay *available* (reachable from the project's "More" menu / project switcher) but are **off the focused 7-grid** — a marketing project's heartbeat is the Calendar + Updates-style feed, which we satisfy with the **Latest activity** strip already on the project page (`essential-project.html` lines 221-278), so a separate Updates tile would be redundant noise here.
- **SPECIALISED (same mechanic, marketing skin):**
  - **Schedule → Content Calendar.** The generic Schedule is a list of upcoming due dates; the marketing calendar is a *multi-channel month/week grid of publish events* (CoSchedule/Opal). Same calendar primitive, marketing payload.
  - **Docs & Files → Assets.** Same file-shelf mechanic, retagged for creative (images, copy, video, templates), filtered **by campaign and type**, with an *Approved / In review* status that links to the Approvals queue.
- **ADDED (marketing-native, no generic equivalent):** **Campaigns** (replaces the generic **Board** — a campaign *is* the board's organising object here), **Approvals**, **Performance**.
- **DROPPED for calm** — see `§3.3`.

### 3.3 REJECTED for calm (and exactly why)

Each rejection is flagged in **multiple** streams' `avoid` lists; the "why" ties to the Essential contract.

| Rejected from the grid | Flagged by | Where it goes instead | Why it breaks calm |
|---|---|---|---|
| **A full analytics dashboard / KPI wall** (10+ charts, 40 metrics, auto-playing) | **all 6 streams** ("the #1 don't"; Improvado: *"if a metric can go up while the business fails, delete it"*) | One calm **Performance** page: ≤5 outcome numbers per campaign, no charts on the tile | Metric noise at first glance violates the 5-second scan + Basecamp-calm (`10 §1`, `08`). |
| **Leads / pipeline CRM** | streams 1,5,6 ("sales layer, not marketing PM") | At most one *"MQLs generated"* column inside **Performance** | Duplicates HubSpot/Salesforce, creates scope confusion, bloats the grid. |
| **Budget ledger** (POs, GL codes, forecasting) | streams 4,5,6 ("not a CFO dashboard") | One **budget summary line** on each campaign record (allocated · spent · remaining) | A finance tool masquerading as a marketing tile; over-pacing is shown where the campaign lives. |
| **Audience / Segments builder** | streams 1,2,3,5,6 ("planning artifact, not a daily surface") | A **field on the campaign brief** (segment name + size) | A CRM sub-feature; not something a marketer touches daily. |
| **A separate Channels / Social tile** | streams 1,3 ("collapses into Calendar") | A **channel filter** on the Content Calendar + a status line in campaign detail | Channel-specific tiles fragment the cross-channel calm view. |
| **A standalone Intake/Requests *and* a Brief tile** | streams 1,2 ("merge to stay in budget") | One **✦ Campaign Brief** action *inside* Campaigns (AI drafts the brief, human confirms before a campaign is created) | Two planning tiles for one job blows the 7-tile budget; the ✦ action is the Opzava-native intake. |
| **Traffic-light red/amber/green campaign health** | stream 6 (Opzava AI-vs-human convention) | **Stage labels** (Plan/Create/Approve/Publish/Measure) + a quiet status badge | Colour is reserved; status is a *label*, never a hue (`02`, `app.css §149`). |
| **An Updates tile (on this grid)** | n/a (Opzava-specific) | The **Latest activity** strip already on the project page | Redundant with the activity feed; a second feed tile is noise. |

---

## 4. Per-card spec

Every page reuses `tokens.css` (calm/indigo) + `app.css` + `shadcn.css`, the canonical calm **topbar** + `← project` breadcrumb (copy verbatim from `essential-card-table.html`), and one calm rule: **title + one focal thing + progressive disclosure**. **AI-vs-human is glyph + label, never colour** — AI = `✦` + `.sb-badge sb-badge--accent "✦ Atlas"` + `.sb-avatar--ai`; humans = a plain round `.sb-avatar` (`app.css §149`). The `--chart-*` palette is person-identity only.

---

### 4.1 ▣ Campaigns — the spine

**What it is.** A calm board/list of every campaign in this project, each a row showing **name · stage pill (Plan/Create/Approve/Publish/Measure) · owner · channel chips · date range · next-due**. Clicking opens a campaign **detail** (brief, budget summary line, linked assets, approval status, tasks, activity) — this is where Budget, Audience, Channels, and Brief live, off the grid. Replaces the generic **Board**: the campaign *is* the organising object.

**At-a-glance tile copy / badge.** Glyph `▣` · name **Campaigns** · preview *"4 active — 1 in Approve, 2 in Create. June Launch is due Friday."* · foot `.sb-badge sb-badge--accent "✦ Atlas drafting"` + `u-subtle "4 active"`.

**CALM page spec.** Reuse the `.ct-board` swim-lane spine (from `essential-card-table.html`) with **five columns = the five lifecycle stages** — the board's left→right flow *is* the campaign lifecycle. One primary action (`＋ New campaign`) and one ✦ action (`✦ Draft a brief`). No charts. Card = title + stage-implied column + owner `.sb-avatar--sm` + channel `.ct-label` chips + `next due` + a quiet `💬/📎` count. The `✦` glyph marks a campaign Atlas is actively drafting.

```
  ← Q3 Launch Campaign                                                         (breadcrumb)

  ▣ Campaigns                                  [ Board ▾ ]   [ ✦ Draft a brief ]   [ ＋ New campaign ]
  Every campaign and what stage it's in. Click one to open its brief, assets, and results.

  ┌── BOARD  (reuses .ct-board / .ct-col / .ct-card) ─────────────────────────────────────────────┐
  │  Plan ②        Create ②        Approve ①        Publish ①        Measure ①                       │
  │ ┌──────────┐  ┌──────────┐   ┌──────────┐    ┌──────────┐    ┌──────────┐                        │
  │ │▣ Fall     │  │▣ June      │  │▣ Webinar  │   │▣ Product  │    │▣ Spring   │                        │
  │ │ Newsletter│  │ Launch ✦   │  │ promo     │   │ Hunt push │    │ teaser    │                        │
  │ │ email·social│ │ email·paid │  │ social    │   │ blog·email│    │ social    │                        │
  │ │ ◷ next wk │  │ ◷ due Fri  │  │ ⏳ 2 in    │   │ ▸ live    │    │ ✓ ended   │                        │
  │ │ At  💬2   │  │ At  📎5    │  │ review    │   │ Ir  💬8   │    │ goal 86%  │                        │
  │ └──────────┘  └──────────┘   └──────────┘    └──────────┘    └──────────┘                        │
  │ ＋ New campaign                                                                                   │
  └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.2 📅 Content Calendar — the daily anchor

**What it is.** A month/week grid of **every scheduled publish event** (email send, social post, blog, ad flight) across all campaigns, filterable **by channel and by campaign**. The single answer to *"what goes out when."* Specialises the generic **Schedule**.

**At-a-glance tile copy / badge.** Glyph `📅` · name **Content Calendar** · preview *"This week: 6 posts, 2 emails. Next up — June newsletter, Friday 9 am."* · foot `.badge badge-warning "Due Fri"` + `u-subtle "8 scheduled"`.

**CALM page spec.** Default **month** view (week toggle). Each entry = a calm chip: `title · channel-label (text glyph, no icon lib) · campaign tag · status dot (draft/scheduled/published)`. A filter bar (**Channel ▾ · Campaign ▾**) replaces a separate Channels tile. A right rail **"Coming up · 7 days"** for the quick scan (mirrors `10`'s collapsible-lane pattern). No analytics on the calendar — scheduling only. Click an entry → the asset or campaign.

```
  📅 Content Calendar                          [ Channel ▾ ]  [ Campaign ▾ ]   [ Week | Month ]   [ ＋ ]
  What goes out, and when — across every channel.

  ┌─ June 2026 ─────────────────────────────────────────────────────┐   ┌─ Coming up · 7 days ──────┐
  │ Mon    Tue    Wed    Thu    Fri    Sat   Sun                      │   │ Fri  ● June newsletter     │
  │  1      2      3      4      5 ●●●  6     7                        │   │       email · June Launch  │
  │              · blog  · IG    · email                              │   │ Mon  ● LinkedIn thread     │
  │  8 ●    9     10 ●●  11     12 ●   13    14                       │   │       social · Webinar     │
  │ ·IG          ·IG·LI  ●scheduled  ●draft                          │   │ Tue  ● Paid: launch set    │
  │ 15     16 ●  17     18 ●●  19 ●   20    21                        │   │       paid · June Launch   │
  └──────────────────────────────────────────────────────────────────┘   └────────────────────────────┘
       ● scheduled   ○ draft   ✓ published        (status by glyph + label, never colour)
```

---

### 4.3 ✓◷ Approvals — the bottleneck queue

**What it is.** A dedicated creative-review queue: every asset awaiting sign-off, its **status (Needs Review / Changes Requested / Approved)**, version/round, reviewer, campaign, and how long it has sat. A *distinct surface*, not a task checkbox (Filestage/Marq/Ziflow). The page is a **calm triage list**, not an inline proofing tool — it links out to the asset for annotation.

**At-a-glance tile copy / badge.** Glyph `✓◷` · name **Approvals** · preview *"3 awaiting review · 1 changes requested. Webinar banner has sat 2 days."* · foot `.badge badge-warning "3 to review"` + `u-subtle "1 overdue"`.

**CALM page spec.** A list grouped by status (**Needs Review · Changes Requested · Approved**). Each row: asset name + `.sb-badge` status + `vN` round + campaign tag + reviewer `.sb-avatar--sm` + a quiet **age** ("2 days") — *aged items rise to the top with a calm age indicator, not a red alert* (`10 §8` calm-semantic). One-click **Approve / Request changes**. Atlas-flagged compliance items carry the `✦` glyph.

```
  ✓◷ Approvals                                                       [ All ▾ ]      [ ＋ Send for review ]
  Everything waiting on a sign-off. Oldest first.

  ┌── Needs review · 3 ───────────────────────────────────────────────────────────────────────────┐
  │ Webinar banner          v2   June Launch    👤 Maria    ◷ 2 days     [ Approve ] [ Request… ]   │
  │ Launch email — hero     v1   June Launch    👤 You      ◷ 4 hrs      [ Approve ] [ Request… ]   │
  │ ✦ Paid ad copy set      v1   June Launch    ✦ Atlas→👤  ◷ 1 hr       [ Approve ] [ Request… ]   │
  ├── Changes requested · 1 ──────────────────────────────────────────────────────────────────────┤
  │ Social carousel         v2   Webinar promo  👤 Maria    "tighten CTA"          [ Open asset → ] │
  ├── Approved · 2  ▸ (collapsed) ────────────────────────────────────────────────────────────────┤
  └────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.4 📎 Assets — the creative shelf

**What it is.** The project-scoped creative library: images, copy docs, video, templates, brand guidelines — tagged **by campaign and type**, each with an **Approved / In review** status that links to the Approvals queue. Specialises **Docs & Files**. *Not a full DAM* — a calm shelf so nobody hunts Dropbox links.

**At-a-glance tile copy / badge.** Glyph `📎` · name **Assets** · preview *"24 files — 18 approved, 6 in review. Brand kit + June Launch creative."* · foot `.badge "Up to date"` + `u-subtle "24 files"`.

**CALM page spec.** A grid of file cards (`.card`): name + type label (text, no icon lib) + campaign `.ct-label` + status `.sb-badge` (`Approved` / `In review`). A filter bar (**Campaign ▾ · Type ▾**) and a **"Recently approved"** strip up top. Click → opens the file or its approval thread. No folder hierarchy, no preview panel.

```
  📎 Assets                                     [ Campaign ▾ ]  [ Type ▾ ]   [ ＋ Upload ]
  Every approved file and draft, in one place.

  Recently approved ▸  [hero-launch.png ✓]  [june-email.html ✓]  [logo-pack.zip ✓]

  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
  │ hero-launch   │ │ webinar-banner│ │ june-email     │ │ brand-voice.md │
  │ image · 1.2 MB│ │ image · 800 KB│ │ html · email   │ │ doc · guideline│
  │ June Launch   │ │ Webinar promo │ │ June Launch    │ │ (all campaigns)│
  │ [✓ Approved]  │ │ [◷ In review] │ │ [✓ Approved]   │ │ [✓ Approved]   │
  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

---

### 4.5 📈 Performance — the calm loop-closer

**What it is.** Post-publish results: **one primary outcome KPI per campaign vs. its target**, plus reach / conversions / cost-per-result — pulled from connected channels. **Calm by design**: ≤5 numbers per campaign, **no charts on the page**, stage-matched (early campaigns show only top-funnel numbers). The explicit antithesis of the rejected KPI wall (`§3.3`).

**At-a-glance tile copy / badge.** Glyph `📈` · name **Performance** · preview *"2 live campaigns tracked. June Launch at 86% of its lead goal."* · foot `.badge badge-success "On track"` + `u-subtle "2 tracked"`.

**CALM page spec.** A `.table` (reuse `app.css .table`), one **row per campaign**: `name · goal label · target · actual · a single thin progress bar · trend arrow (↑/↓ vs. prior period)`. A date-range filter. A quiet **"needs attention"** line flags any campaign >20% below benchmark — *a label, never a red wall*. Drill-down (channel breakdown) lives in the campaign detail, not here.

```
  📈 Performance                                                      [ This quarter ▾ ]
  Goal vs. actual for live and recent campaigns. One number that matters each.

  ┌─ Campaign ──────────┬─ Goal ──────────┬ Target ┬ Actual ┬ Progress ──────────┬ Trend ┐
  │ June Launch         │ Leads           │  500   │  430   │ ████████████░░  86% │  ↑    │
  │ Webinar promo       │ Registrations   │  300   │  312   │ ██████████████ 104% │  ↑    │
  │ Spring teaser (end) │ Reach           │ 50 000 │ 41 200 │ ██████████░░░░  82% │  ↓    │
  └─────────────────────┴─────────────────┴────────┴────────┴─────────────────────┴───────┘
   ▸ Needs attention: Spring teaser reach 18% below target.        (a calm label, not an alert wall)
```

---

### 4.6 ✦ Ask your assistant — kept generic

**What it is.** Unchanged from the generic project (`project-assistant.html`). The per-project AI (Atlas) that drafts briefs, schedules posts, summarises results, and proposes approvals — surfaced as the **contextual ✦ helper**, never as its own KPI tile. The marketing-specific ✦ actions (`✦ Draft a brief`, `✦ Summarise results`) live *inside* the four marketing tiles, exactly as `10 §8` keeps AI "available, not present."

**At-a-glance tile copy / badge.** Glyph `✦` (accent) · name **Ask your assistant** · `.sb-badge sb-badge--accent "✦ Atlas"` + `u-subtle "working now"`. Tile carries `border-top:2px solid var(--accent-border)` like the generic. **Reuses `project-assistant.html` verbatim.**

---

### 4.7 💬 Team — kept generic

**What it is.** Unchanged from the generic project (`essential-team-room.html`). The humans-only room; marketing roles (Campaign Manager, Copywriter, Designer, Approver) and per-person workload are visible here. Jakob's Law — the familiar generic tile.

**At-a-glance tile copy / badge.** Glyph `💬` · name **Team** · preview *"Maria, Dan, and you. Maria left a note on the social calendar — 2 new."* · `.badge badge-accent "2 new"` + `u-subtle "3 people"`. **Reuses `essential-team-room.html` verbatim.**

---

## 5. The workspace — ASCII wireframe of the Marketing project tile grid

The shell is identical to `essential-project.html` (calm topbar, project header band with the `▾` switcher, the `.tool-grid`, and the **Latest activity** strip that serves as the in-page Updates feed). Only the **tiles** change. Project header example: **"Q3 Launch Campaign"** with the AI + human avatars (Atlas ✦, plus Maria & Dan).

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Opzava   Home  My stuff  Messages ③  Activity ②  ✦ Ask Opzava  Find…      ＋  🔔  AG      │  ← canonical calm topbar
└──────────────────────────────────────────────────────────────────────────────────────────┘
  ● Q3 Launch Campaign  ▾                                        [ ＋ New campaign ]  [ ✦ Ask Atlas ]
    Multi-channel launch push for Q3 — email, social, and paid. Atlas is drafting briefs.
    👤Maria  👤Dan  ✦Atlas      ● 4 active      Updated 2 hours ago
  ──────────────────────────────────────────────────────────────────────────────────────────

  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ ▣                 │  │ 📅                │  │ ✓◷               │
  │ Campaigns         │  │ Content Calendar  │  │ Approvals         │
  │ 4 active — 1 in   │  │ This week: 6 posts│  │ 3 awaiting review │
  │ Approve, 2 Create │  │ 2 emails. Fri 9am │  │ Webinar banner    │
  │ ─────────────────│  │ ─────────────────│  │ sat 2 days        │
  │ ✦ Atlas drafting  │  │ [Due Fri]    8 sch│  │ ───────────────── │
  │            4 active│  │                   │  │ [3 to review] 1 od│
  └──────────────────┘  └──────────────────┘  └──────────────────┘

  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────────────────┐
  │ 📎                │  │ 📈                │  │ ✦  (accent top-border)                │
  │ Assets            │  │ Performance       │  │ Ask your assistant                    │
  │ 24 files — 18 app │  │ 2 live tracked    │  │ Atlas drafts briefs, schedules posts, │
  │ -roved, 6 review  │  │ June Launch 86%   │  │ and summarises results — approve work │
  │ ─────────────────│  │ of its lead goal  │  │ inline.                               │
  │ [Up to date]   24 │  │ ─────────────────│  │ ───────────────────────────────────── │
  └──────────────────┘  │ [On track]   2 trk│  │ ✦ Atlas              working now      │
                        └──────────────────┘  └──────────────────────────────────────┘
  ┌──────────────────┐
  │ 💬                │
  │ Team              │       (Updates is satisfied by the Latest-activity strip below — no separate tile)
  │ Maria, Dan + you  │
  │ Maria noted the   │
  │ social calendar   │
  │ ─────────────────│
  │ [2 new]   3 people│
  └──────────────────┘

  ┌─ Latest activity  (reused from essential-project.html — the in-page "Updates" feed) ──────┐
  │ ✦ Atlas drafted the June Launch email brief and moved it to Approve.            2h ago     │
  │ 👤 Maria requested changes on the social carousel (v2).                          3h ago     │
  │ 👤 Dan scheduled 3 LinkedIn posts for the Webinar promo.                         4h ago     │
  └────────────────────────────────────────────────────────────────────────────────────────────┘
```

Reading order is the marketer's lifecycle: **Campaigns → Calendar → Approvals** (top row = *plan, schedule, unblock*), **Assets → Performance** (create, measure), then the two kept-generic tiles (**Ask your assistant · Team**). Seven tiles, one screen, calm.

---

## 6. Build plan

### 6.1 Files to build

| File | What it is | Build from (reuse) |
|---|---|---|
| **`mockups/essential-marketing.html`** | **The workspace** — the Marketing project tile grid (§5). The hero/gallery thumb. | Copy `essential-project.html` shell + `.tool-grid` + Latest-activity strip; swap the 8 generic tiles for the 7 marketing tiles. |
| **`mockups/essential-mkt-campaigns.html`** | **Campaigns** board (§4.1) — five lifecycle columns. | `.ct-board` / `.ct-col` / `.ct-card` from `essential-card-table.html`; `.sb-avatar--sm`, `.ct-label`. |
| **`mockups/essential-mkt-calendar.html`** | **Content Calendar** (§4.2) — month/week grid + channel/campaign filters + "Coming up" rail. | A new `.cal-grid` (7-col CSS grid, inline like `.ct-board`); `.badge`, `.sb-menu` for filters. |
| **`mockups/essential-mkt-approvals.html`** | **Approvals** queue (§4.3) — status-grouped triage list. | `.table` + `.sb-badge` status + `.sb-avatar--sm` + age label; `.btn` actions. |
| **`mockups/essential-mkt-assets.html`** | **Assets** shelf (§4.4) — file-card grid + filters + "Recently approved" strip. | `.card` grid (like `.tool-grid`); `.sb-badge`, `.ct-label`. |
| **`mockups/essential-mkt-performance.html`** | **Performance** (§4.5) — one-row-per-campaign results table, no charts. | `app.css .table` + a thin CSS progress bar (reuse `.ct-steps-bar`) + trend arrow glyph. |

### 6.2 Pages REUSED (no new file)

- **✦ Ask your assistant** → existing **`project-assistant.html`** (verbatim).
- **Team** → existing **`essential-team-room.html`** (verbatim).
- **A campaign opened** (brief · budget line · assets · approval status · tasks) → reuse the **`essential-card.html`** detail pattern; the Brief is a structured sub-section, Budget/Audience/Channels are fields there.
- **An asset opened / annotated** → links out from Approvals to the asset (the proofing tool), per `§4.3`.

### 6.3 Wiring it in

- **Project type plumbing.** A project carries a **type** (`generic` | `marketing`). When `type === 'marketing'`, the project workspace renders `essential-marketing.html`'s tile grid instead of the generic `essential-project.html` grid — same shell, swapped `.tool-grid`. The project header `▾` switcher and **Latest activity** strip are unchanged. (Future types — Sales, Support, Events — follow the same pattern; this doc establishes the precedent.)
- **No new top-level destination.** All five marketing tiles are reached **only from inside a Marketing project** (exactly like To-dos/Board today), preserving the `08 §A.9` top-nav cap and the `09 §2` model. The canonical calm **topbar** + a `← Q3 Launch Campaign` **breadcrumb** are the only nav obligations on each new page.
- **Gallery (`mockups/index.html`).** Add an Essential card (step 16, after "Blank slates & states"): link `essential-marketing.html`, `thumbs/essential-marketing.png`, copy: *"A **Marketing & Promotion** project type — a focused, marketing-native tile set: ▣ Campaigns · 📅 Content Calendar · ✓◷ Approvals · 📎 Assets · 📈 Performance, plus the kept-generic ✦ Ask your assistant + Team. The campaign lifecycle (Plan→Create→Approve→Publish→Measure) as a calm workspace — KPI wall rejected."* Generate the thumbnail into `thumbs/` like the others.
- **Cross-reference.** Add `11-marketing-project.md` to `README.md`'s Contents list; link it from `08`'s "Mockup specs follow" line and from `10`'s project-type note so the doc set stays navigable.

---

> **Net:** the Marketing & Promotion project type adds a genuinely focused *capability* (run campaigns through Plan→Create→Approve→Publish→Measure) using **zero new interaction vocabulary** — it is the Card Table spine (Campaigns), a calendar grid (Content Calendar), a triage list (Approvals), a file grid (Assets), and a results table (Performance), composed from the unanimous core of six product surveys and kept strictly inside the Basecamp-calm contract. The KPI wall, leads CRM, budget ledger, and audience builder are **rejected from the grid** on unanimous evidence and folded into the campaign record; AI stays the contextual ✦ helper; and a marketer sees *what is in flight, what is blocked, and what goes out next* in one calm scan of seven tiles.

---

## 7. Sources

Pooled across the six research streams (deduped):

- Asana — https://asana.com/teams/marketing · https://asana.com/uses/campaign-management
- CoSchedule — https://coschedule.com/marketing-suite · https://coschedule.com/marketing-calendar · https://coschedule.com/content-calendar
- Wrike — https://www.wrike.com/templates/marketing-campaign-management/ · https://www.wrike.com/blog/marketing-campaign-management/ · https://www.wrike.com/blog/marketing-campaign-management-software/
- Opal — https://workwithopal.com/ · https://workwithopal.com/about/blog/content-calendar-best-practices/
- Filestage — https://filestage.io/blog/creative-approval-workflow/ · https://filestage.io/blog/content-approval-workflow/ · https://filestage.io/blog/campaign-management-tools/ · https://filestage.io/marketing-approval-software/
- Marq — https://www.marq.com/blog/marketing-approval-workflow/ · https://help.marq.com/approval-process
- Ziflow — https://www.ziflow.com/blog/best-review-and-approval-software · https://www.ziflow.com/product
- ClickUp — https://clickup.com/templates/marketing-campaign-management-t-200523911
- Monday — https://monday.com/templates/category/marketing · https://monday.com/blog/marketing/marketing-dashboard/ · https://monday.com/blog/marketing/marketing-calendar/
- HubSpot — https://knowledge.hubspot.com/campaigns/understand-campaigns · https://knowledge.hubspot.com/campaigns/campaign-details-page
- Sprout Social — https://sproutsocial.com/features/social-media-calendar/ · https://sproutsocial.com/insights/content-calendar/
- Improvado — https://improvado.io/blog/12-best-marketing-dashboard-examples-and-templates
- Adobe — https://business.adobe.com/blog/content-planning-and-publishing
- Brandfolder/Bynder/Frontify (DAM) — https://www.frontify.com/en/guide/digital-asset-management-software · https://www.uplifted.ai/blog/post/creative-assets-management-what-it-is-why-it-matters-and-how-to-get-it-right
- KPI-calm authorities — https://www.axonn.co.uk/seo/kpi-dashboards-for-marketing-teams-how-to-build-dashboards-people-actually-use · https://www.dataslayer.ai/blog/marketing-dashboard-best-practices-2025
</content>
</invoke>
