# 08 — Basecamp Teardown → the Essential View Blueprint

> **Scope.** This document is the single reference for adapting Basecamp's calm, project-centric design into the **Essential** everyday-user view of Opzava. It is structured as: philosophy (Getting Real), product anatomy, visual language, work model, the concrete adaptation mapping, and deliberate omissions. Mockup specs follow in the `essential-*` files.

---

## Part A · The Philosophy (Getting Real)

### A.1 Interface First (ch. 09.1)

**Principle.** Design the interface before writing a line of code. The screen *is* the spec. Programming-first forces you to retrofit UX onto decisions that have already hardened.

> "The interface is your product. What people see is what you're selling."

> "Design is relatively light. A paper sketch is cheap and easy to change."

**What Opzava Essential does.** Every Essential screen starts as a layout sketch (or an HTML mockup in `mockups/essential-*.html`) before any route or component is wired. The mockup is the contract the developer implements, not a later cosmetic pass. Technical Full-view panels are out of scope for Essential design; they are never sketched alongside it.

---

### A.2 Epicenter Design (ch. 09.2)

**Principle.** Start from the single element the page absolutely cannot live without — the epicenter — and build outward in strict priority order. Never start with the chrome (nav, sidebars, headers).

> "Whatever the page absolutely can't live without is the epicenter."

> "Essentials first, extras second. The result is a more friendly, focused, usable screen for customers."

**What Opzava Essential does.** On the Essential Home the epicenter is the project grid — the list of AI workspaces the user cares about. Everything else (header, search, nav rail) is secondary scaffolding and gets designed after the cards are right. On an individual project screen the epicenter is the current task list (what work is in motion). The assistant roster, schedule, and outputs come after.

---

### A.3 The Three-State Solution (ch. 09.3)

**Principle.** Every screen exists in three states: regular (data present, everything fine), blank (first use, no data yet), and error (something went wrong). Most teams only design the regular state. The other two are required deliverables.

> "The screen people see when everything's working fine and your app is flush with data."

> "The screen people see when using the app for the first time, before data is entered."

> "The screen people see when something goes wrong."

> "Don't forget to invest time on the other states too."

**What Opzava Essential does.** Each Essential screen spec lists all three states explicitly. The blank state is the first one designed (it is where real users land). Error states use plain human copy, a single retry action, and never expose exit codes, stack traces, or file paths (see doc `07`).

---

### A.4 The Blank Slate (ch. 09.4)

**Principle.** The empty state is the most important screen in the product. New users see it first. Designers never see it (their dev environments are full of test data), so it goes systematically undesigned. It must answer: What is this? What do I do first? What will it look like when it's filled in?

> "The customer decides if an application is worthy at this blank slate stage — the stage when there's the least amount of information, design, and content on which to judge the overall usefulness of the application."

> "First impressions are crucial. If you fail to design a thoughtful blank slate, you'll create a negative (and false) impression of your application or service."

**What Opzava Essential does.** The `essential-home` blank state shows a friendly illustration, a one-sentence explainer ("Your AI assistants do the work — organize it into projects"), and a single call to action: "Create your first project." It shows a ghost preview of what a populated project card looks like so the user knows what they are building toward.

---

### A.5 Get Defensive (ch. 09.5)

**Principle.** Design for failure as a first-class activity. Abandoning a user at the moment something breaks destroys trust permanently. Problems are a *when*, not an *if*.

> "Defensive design is like defensive driving."

> "If you abandon customers in their time of need, they're unlikely to forget it."

> "Pay special attention to error screens and other moments when customers encounter problems."

**What Opzava Essential does.** Every error in Essential carries: a plain-English sentence saying what happened, a specific next action ("Try again" / "Contact your admin"), and optionally a "Show technical details" disclosure visible only to admin-role users. No raw API errors, no HTTP status codes, no assistant runtime strings surface in Essential.

---

### A.6 Context Over Consistency (ch. 09.6)

**Principle.** It is better to be right for the moment than consistent with a global pattern. Navigation, layout, and available actions should vary by what the user needs at that step, not by a rigid template.

> "It's better to be right than to be consistent."

**What Opzava Essential does.** The project workspace hides the rail's secondary navigation items that are irrelevant mid-task. The Card Table drops the page header toolbar entirely — the full-width column layout is the page. A focused task-creation flow suppresses the rail and shows only the form plus a cancel action. Structural consistency (tokens, spacing grid, type scale) is maintained; navigational consistency is selectively relaxed where context demands it.

---

### A.7 Copywriting is Interface Design (ch. 09.7)

**Principle.** Words are not annotations on the interface; they are the interface. Every button label, instruction, and error message is a design decision.

> "Good writing is good design."

> "Just because you're writing a web app doesn't mean you can get away with technical jargon."

> "Keep it short and sweet. Say what you need and no more."

**What Opzava Essential does.** Copy is written at the same time as layout, not filled in later. Labels are task verbs in plain English: "Add a task", "Start a project", "Ask your assistant". Status copy uses human observations: "Everything's running" / "One task needs your attention" / "Your assistant is working on this." The word "agent" never appears in Essential; assistants do work.

---

### A.8 One Interface (ch. 09.8)

**Principle.** Separate admin screens are a maintenance trap. The fewer screens to maintain, the better each one gets. Admin functions belong inline, permission-gated, not in a parallel universe.

> "If you have to maintain two separate interfaces (i.e. one for regular folks and one for admins), both will suffer."

> "The fewer screens you have to worry about, the better they'll turn out."

**What Opzava Essential does.** Essential is *not* a separate app — it is the same Next.js application, same routes, same components, rendered in `[data-theme="calm"]` with a subset of navigation items and role-gated surfaces. Admins can switch to Full mode via a single toggle in the user menu. No duplication of components; the design system tokens handle the visual shift.

---

### A.9 Less Software / Less Mass (ch. 10.1 / 03.1)

**Principle.** Every feature added increases complexity exponentially, not linearly. Agility is a function of how little you are carrying. The leaner the product, the faster you can change direction.

> "The leaner you are, the easier it is to change."

> "Each time you increase the amount of code, your software grows exponentially more complicated."

**What Opzava Essential does.** The Essential IA has four top-level destinations (Home, My Stuff, Activity, Search) plus per-project tools. That is the complete surface. Nothing is added because it would "round out" the product. New Essential surfaces must pass the same "no" default as any feature request (see A.11).

---

### A.10 Half, Not Half-Assed (ch. 05.1)

**Principle.** Build a complete, polished half rather than a sprawling, broken whole. Identify the irreducible core and build that first, excellently.

> "Build half a product, not a half-ass product."

> "Take whatever you think your product should be and cut it in half."

**What Opzava Essential does.** The first Essential release ships exactly four screens (Home, Project workspace, To-dos, Card Table). No shortcuts, no stubs, no "coming soon" placeholders. Each screen is complete: all three states, plain-language copy, responsive layout, accessible. Features are added only after these four are right.

---

### A.11 Start With No (ch. 05.3)

**Principle.** The default answer to every feature request is "no." Features must earn implementation through repeated demand from multiple sources.

> "Innovation is not about saying yes to everything. It's about saying NO to all but the most crucial features." — Steve Jobs

**What Opzava Essential does.** The Essential product definition is locked at this document. Any addition to the Essential IA requires a written case referencing at least two user-reported friction points. "It would be nice" is not sufficient.

---

## Part B · Product Teardown (Anatomy)

### B.1 The Project as Self-Contained Workspace

In Basecamp, the **project** is the fundamental unit. Every project is an independent container with its own message board, to-dos, schedule, files, chat room, and check-ins. Members are added per project. Client visibility is toggled per project. There is no global backlog — all work is contained within a project.

This design decision has a profound UX consequence: users never lose their place. "Where does this belong?" always has an answer: in a project. Onboarding is reduced to "create a project, add people, start working."

The fixed tool set — same tools in every project, no configuration — means new team members orient in minutes regardless of how the previous team lead set things up.

---

### B.2 Message Board

Long-form structured posts. Announcements, decisions, design reviews, weekly updates. Titled, threaded. Not chat.

- Each post has a title, body (rich text), and subscriber list.
- Subscribers are notified when a new post is published.
- Posts are searchable and persist indefinitely.
- Distinct from Campfire (chat): Message Board = async, structured, permanent decisions. Campfire = quick, casual, ephemeral.

UI elements: post list with title + author + timestamp + reply count; full post view with reply thread below.

---

### B.3 To-dos (Deep)

The richest structural tool in Basecamp.

**Lists.** "It isn't possible to create a to-do without a to-do list." A project can have many lists, each with a name and optional description. Lists are reorderable via drag-and-drop.

**Items.** Each to-do has:
- Title
- Notes field (rich text, supports file attachments, @mentions)
- Single assignee (name picker with typeahead; assigned person is notified; item surfaces on their Assignments page)
- Due date (single date or range; surfaces on Calendar and triggers "Due soon" reminders)
- Subtasks (each subtask has its own independent assignee and due date; completing a subtask does not change the parent to-do's status)
- Comment thread (subscribers notified on each comment or completion)

**Progress.** Each list shows a pie-chart progress indicator (% of items complete). Lists can optionally be tracked on a Hill Chart.

**Bulk actions.** Select multiple items to bulk-assign, bulk-set due date, or move/copy between lists.

**Drag-and-drop.** Items reorder within a list and across lists. Entire lists reorder within the project.

**Hill Chart integration.** Any list can be pinned to the project Hill Chart via "Track this on the Hill Chart" in the list options menu.

---

### B.4 Card Table / Swim Lanes (Deep)

The Kanban-adjacent view. The most structured workflow surface in Basecamp. Introduced in Basecamp 5.

**Default columns.** Triage → Figuring It Out → In Progress → Done.

**Triage column.** The intake zone. Anything not yet committed lands here: ideas, bugs, requests, questions. "Drag it from Triage to a column below" when it becomes a yes. Triage also connects to a **Not Now** zone for deprioritized cards the team wants to keep without committing.

**Protected columns.** Triage, Not Now, and Done cannot be archived, deleted, collapsed, or put on hold. Not Now and Done cannot be renamed. These three columns are structural invariants — they enforce the workflow contract.

**Cards.** Each card has:
- Title
- Assignee (single person; card surfaces in their Assignments page)
- Due date (surfaces in Schedule and Calendar)
- Details (rich text)
- Subtasks (each independently assignable and dateable)
- Full comment thread (subscribers notified on all activity including subtask completion)

Moving a card between columns = changing the card's workflow status. This is the core interaction: drag left or right to change state.

**On Hold.** Any column except the three protected ones can be toggled to "On Hold" — work pauses without cards being moved or deleted.

**Column customization.** Columns can be renamed, color-coded, collapsed/expanded (saved per-user preference), and added via the "+" button. Protected columns are fixed.

**Notifications.** "Watch this column" subscribes you to notifications when any card lands in that column. Assigned cards surface in the assignee's My Assignments. Due dates surface in Schedule.

---

### B.5 Schedule

Date-based surface. Deadlines, milestones, events, meetings. Items can be one-time or recurring. Due dates from To-dos and Card Table cards roll up automatically. Displayed as a timeline or list; toggling between views is instant.

UI elements: monthly/list toggle, date headers, event rows with project color dot, quick-add form inline.

---

### B.6 Docs & Files

Central file store for the project. Accepts image uploads, document uploads, PDFs. Embeds cloud documents (Google Docs, Figma, Dropbox Paper links) inline as previews. Files are browseable per project and aggregated across all projects in the "Everything" view.

UI elements: grid or list toggle; folder-less flat list sorted by recency; upload button; embed button.

---

### B.7 Campfire (Chat)

Per-project real-time group chat. "Quick, casual conversations." Unthreaded. No reply chains. Every message is visible to all project members. Distinct in purpose from Message Board: Campfire is for today's chatter; Message Board is for lasting decisions.

UI elements: infinite-scroll message list; composer at the bottom; emoji reactions; @mention autocomplete.

---

### B.8 Automatic Check-ins

Scheduled recurring questions sent to project members: "What did you work on today?" / "What are you working on this week?" / "Any blockers?" Answers land on the project's Check-ins surface and aggregate across all projects in the "All Check-In Answers" view. The cadence (daily, weekly, custom) is set per question.

UI elements: question card with cadence label; answer thread; "See all answers" link to cross-project aggregate.

---

### B.9 The Lineup (Home)

Visual timeline showing every active project plotted against the calendar. Start date → end date as a horizontal bar. Provides a fleet-level view of what is running, what is upcoming, and what is wrapping.

UI elements: horizontal scroll timeline; project name + color bar; "today" marker; click → project workspace.

---

### B.10 My Stuff / My Assignments

Personal aggregation layer:
- **My Assignments**: every to-do and card table card assigned to you, across all projects, sorted by due date.
- **My Schedule**: your due-dated items and calendar events in one unified timeline view.
- **My Bar** (Bookmarks): personal bookmarks, private to-dos, personal notes — visible only to you.

The critical design property: *My Assignments aggregates cross-project*. You never have to visit each project to find your work.

---

### B.11 Hey! (Activity Inbox)

Pull-based notification inbox. All @mentions, direct assignments, replies to threads you are subscribed to, card/column watch events, and check-in notifications land here. You "clear" Hey! by reading and acknowledging each item. Each item offers explicit "Notify me" / "Stop notifying me" controls. No algorithmic sorting — pure chronological feed.

This is the deliberate anti-pattern to Slack: you check Hey! when you choose to, not because a badge number is manufacturing urgency.

---

### B.12 Hill Charts

Attached to To-do Lists. A visual S-curve with a vertical midpoint line. Left slope = **uphill** (unknowns, figuring out what to do). Inflection point = transition from discovery to execution. Right slope = **downhill** (known path, pure implementation).

Teams drag colored dots (one per tracked to-do list, labeled with the list name) to their current position. Every drag creates a timestamped snapshot — a history of progress judgments visible as small ghost dots trailing behind the current position.

Key design properties:
- "The status is *human* generated, not computer generated." — Basecamp
- It is a qualitative signal, not a percentage bar.
- A dot that has not moved between sessions is a visible signal that a scope is stuck — without requiring anyone to self-report.
- Managers read the chart instead of running status meetings.

---

## Part C · Visual & Interaction Language

### C.1 Typography

Basecamp uses large, readable body type as a primary UX decision — not a stylistic flourish. The body is set at a size that does not require zooming. Marketing surfaces use even larger type with short line lengths (60–70ch). The typeface is system/sans-serif in the product (Helvetica Neue / system-ui territory); content is never competing with a decorative typeface.

**Concrete values for Opzava Essential (calm theme):**
- Body floor: `var(--text-sm)` = 15px (already enforced by `tokens.css`)
- Section titles: `var(--text-lg)` = 20px
- Page titles: `var(--text-xl)` = 24px
- Increase card title to `var(--text-md)` (17px) in calm theme for legibility
- Line height: `var(--lh-normal)` = 1.55 (generous, not cramped)
- Maximum prose width: 68ch
- Tabular numerals (`font-variant-numeric: tabular-nums`) for counts and dates

---

### C.2 Color

Basecamp's product palette: deep near-black (`#1d2d35`), light sky-blue accent (`#b3dcff`), greens (`#5ecc62`, `#00ad45`) for completion states. Day-to-day UI is near-white with soft neutral surfaces — warm, not clinical. Per-project colors are user-assigned (a picker on hover) — color organizes, it does not signal urgency.

**Key behavioral rule:** no metric dashboards, no progress percentage bars, no burndown charts on everyday project surfaces.

**Concrete values for Opzava Essential — `[data-theme="calm"]` (already defined in `tokens.css`):**

| Token | Value | Role |
|---|---|---|
| `--bg` | `hsl(40 33% 96%)` | Warm cream page background |
| `--surface` | `hsl(42 40% 99%)` | Card / panel fill |
| `--surface-2` | `hsl(40 30% 93.5%)` | Input background, secondary surface |
| `--border` | `hsl(40 22% 86%)` | Default dividers |
| `--fg` | `hsl(28 16% 15%)` | Near-black warm ink |
| `--fg-muted` | `hsl(32 11% 38%)` | Secondary text |
| `--accent` | `hsl(162 54% 33%)` | Friendly trustworthy green (primary actions) |
| `--success` | `hsl(150 58% 32%)` | Completion / running |
| `--warning` | `hsl(33 84% 42%)` | Needs attention |
| `--danger` | `hsl(4 66% 48%)` | Failure / error |

Per-project accent colors map to `--chart-1` through `--chart-6` in the calm theme. Each project card in the Home grid renders its dot in one of these six swatches.

---

### C.3 Spacing and Shape

Basecamp's "wide open spaces" idiom translates directly:

- **Page padding**: `var(--space-8)` (32px) left/right; `var(--space-6)` (24px) top/bottom minimum — more generous than the Full dark view.
- **Card gap**: `var(--space-6)` (24px) between project cards in the grid.
- **Card internal padding**: `var(--space-6)` (24px) body; `var(--space-5)` (20px) header.
- **Radius**: `var(--radius-xl)` (12px) on project cards in the Home grid; `var(--radius-lg)` (8px) on task cards in the Card Table. Rounder than the Full view to signal friendliness.
- **Max content width**: 1100px (narrower than Full's 1240px — fewer items per row, more breathing room).
- **Column count for project grid**: 2 columns at ≥900px; 1 column below. Never 3 — cards must be large and readable.

---

### C.4 Interaction Philosophy

- **Page-stacking / side drawer model:** clicking into a task or card opens a side panel or overlay rather than full navigation, preserving context.
- **Single primary action per region:** one `.btn-primary` per card, one per section. All secondary actions are ghost buttons or overflow menus.
- **Keyboard shortcuts**: `n` = new task, `p` = new project, `/` = search, `?` = shortcuts help. Available throughout; never required.
- **Plain labels**: "Add a task", "Start a project", "Ask your assistant", "Mark done". Never "Create entity", "Submit", "Invoke", "Execute".
- **No loading spinners on primary content**: use skeleton placeholders that match the layout of the loaded state. The user sees structure immediately.
- **Toasts**: bottom-right, 4s auto-dismiss. Success = green, warning = amber, error = red. One toast at a time.
- **Mobile**: the Essential layout collapses to a single-column bottom-tab navigation (Home, Work, Activity, Me) at ≤640px. The calm theme's generous spacing makes this natural — no content truncation.

---

### C.5 What Is Deliberately Absent from the Everyday Surface

- No icon library icons (raw text, emoji, and SVG inline icons only — per CLAUDE.md)
- No progress percentage bars
- No burndown / velocity charts
- No per-person workload heatmaps
- No raw technical strings (exit codes, file paths, gateway names, SSE stream IDs)
- No red-badge urgency engineering — notification count shows but does not animate or pulse

---

## Part D · The Work Model (Shape Up Basics)

Shape Up is the methodology 37signals uses to build Basecamp. Its core ideas are relevant to how Opzava Essential presents AI work to normal users, not as a development process to adopt wholesale, but as a mental model for the product surface.

### D.1 Fixed Appetite, Variable Scope

> "The amount of time we want to spend on a project, as opposed to an estimate."

Work in Opzava Essential is organized into projects with a defined scope. Users do not estimate how long AI tasks will take — they define what they want done (the appetite) and the assistant figures out the path. This inverts the usual "how long will this take?" anxiety.

**Adaptation:** when creating a project, users set a rough "goal by" date (optional). The assistant surfaces a Hill Chart-style progress view (left = figuring it out, right = getting it done) rather than a percentage bar.

### D.2 Scopes as Named To-do Lists

Shape Up breaks projects into **scopes** — self-contained, deliverable slices. Each scope becomes a named to-do list. The Hill Chart dot tracks the scope, not individual tasks.

**Adaptation:** in Opzava Essential, a project's to-do lists are the scopes. Each list can have a name like "Research the brief", "Draft the article", "Review and publish". The Hill Chart (simplified: a two-position toggle — "Still figuring it out" / "On track to finish") tracks the list.

### D.3 The Circuit Breaker (Appetite Discipline)

Work that does not finish in its appetite cycle is cancelled by default, not extended. The discipline is: if it matters, reshape and re-start it.

**Adaptation:** Opzava Essential marks tasks that have been "in progress" beyond their target date with a gentle amber flag ("This is taking longer than expected — want to check in?"). No alarm, no overdue red — a prompt to inspect, not a failure state.

### D.4 Hill Charts as Progress Language

The Hill Chart replaces status meetings. A stuck dot (no movement) is a visible signal without anyone having to report failure.

**Adaptation:** in Essential, the Hill Chart is simplified to a two-position indicator per project: "Still working it out" (left of center) / "On the way to done" (right of center). Toggled manually by the user or prompted by the assistant. Renders as a small visual arc on the project card in the Home grid.

---

## Part E · Adaptation — The Opzava Essential View

### E.1 Element Mapping Table

| Basecamp | Opzava Essential Equivalent | Notes |
|---|---|---|
| **Lineup / Home** | **Your projects** — a grid of project cards | Each card = one AI-work workspace; color dot = project accent |
| **Project workspace** | **Project workspace** | Same container concept; tools are the project's tools |
| **To-dos** | **Tasks** — things your assistants do | Assignee = an assistant (or you); same list/item/subtask model |
| **Card Table** | **Work board** — swim lanes | Triage → In Progress → Review → Done |
| **Message Board** | **Updates** | Announcements, decisions, assistant reports |
| **Schedule** | **Schedule** | When tasks run, when outputs are due |
| **Docs & Files** | **Outputs** | Files and artifacts the assistants produce |
| **Campfire** | **Chat with your assistant** | Per-project direct line to the assigned assistant |
| **Automatic Check-ins** | **Daily summaries** | Assistant's "here's what I did today / here's what's next" |
| **My Stuff / My Assignments** | **My tasks** | Cross-project view of everything assigned to you |
| **Hey! inbox** | **Activity** | @mentions, task completions, assistant updates |
| **Hill Charts** | **Progress arc** | Simplified two-position indicator on project card |

---

### E.2 Essential Information Architecture

```
Essential (top-level)
├── Home                    ← project grid (Lineup equivalent)
├── My stuff                ← cross-project task + schedule view
├── Activity                ← Hey! equivalent, pull-based
└── Search                  ← Cmd/Ctrl-K; also a dedicated page

Per-project tools (inside a project workspace)
├── Tasks                   ← To-dos equivalent
├── Work board              ← Card Table equivalent
├── Updates                 ← Message Board equivalent
├── Schedule                ← Schedule equivalent
├── Outputs                 ← Docs & Files equivalent
├── Chat                    ← Campfire equivalent
└── Summaries               ← Check-ins equivalent
```

Navigation rules:
- Top-level nav: 4 items in the rail + search icon in header. No more.
- Per-project tools: shown as tabs or a secondary nav when inside a project.
- "Full mode" toggle lives in the user menu at the rail footer — visible but unobtrusive.
- Admin-only surfaces (Connections, Cron, Webhooks, Logs, Monitoring) are absent from the Essential rail entirely.

---

### E.3 Screen List to Build as Mockups

#### Screen 1 — `essential-home` (Projects Lineup)

**Epicenter:** the project card grid.

**Layout:**
```
┌─ rail (232px) ──────────────────────────────────────────────────────────┐
│ [Logo] Opzava                                                           │
│                                                                         │
│  ● Home          ← active                                               │
│  ○ My stuff                                                             │
│  ○ Activity      [3]                                                    │
│  ○ Search                                                               │
│                                          ─── footer ───                 │
│  [Avatar] You                ⚙ Settings ↗ Full mode                    │
└─────────────────────────────────────────────────────────────────────────┘
┌─ main column ───────────────────────────────────────────────────────────┐
│  header: [search bar]                          [+ New project] btn-primary│
│  ──────────────────────────────────────────────────────────────────────  │
│  page: "Your projects"  (h1, text-xl)                                   │
│                                                                         │
│  ┌── project card (.card, radius-xl, calm surface) ─────────────────┐  │
│  │  [color dot]  Content team     badge: "3 tasks running"           │  │
│  │  Last update: 2 hours ago                                         │  │
│  │  [progress arc — "On the way to done"]                            │  │
│  │  ─────────────────────────────────────────────────────────────── │  │
│  │  [Avatar] Maya  [Avatar] Leo  +2 more                             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  (grid: 2 columns, gap-6)                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Content:**
- Page title: "Your projects"
- Primary action: "+ New project" (`.btn-primary`)
- Each card: project name (`.card-title`), assistant status badge (`.badge-success` / `.badge-warning`), last activity timestamp (`.u-subtle`), progress arc (two-state), assistant avatars
- Blank state: friendly illustration + "You don't have any projects yet. Start by creating one." + "+ Create your first project" button
- Error state: "We couldn't load your projects. Check your connection and try again." + "Retry" button

**Component classes used:** `.card`, `.badge`, `.badge-success`, `.badge-warning`, `.btn`, `.btn-primary`, `.btn-ghost`, `.u-row`, `.u-between`, `.u-subtle`

---

#### Screen 2 — `essential-project` (Project Workspace)

**Epicenter:** the current-status summary + quick actions for the project.

**Layout:**
```
┌─ rail ─────┐  ┌─ main column ──────────────────────────────────────────┐
│ (same)     │  │  header: [← Back]  Content team  [color dot]  [⋯ menu] │
│            │  │  ─────────────────────────────────────────────────────  │
│            │  │  ┌─ project tools (secondary nav tabs) ──────────────┐ │
│            │  │  │ Tasks  Work board  Updates  Outputs  Chat  More ▾ │ │
│            │  │  └────────────────────────────────────────────────────┘ │
│            │  │                                                          │
│            │  │  [Active tab content — Tasks by default]                │
│            │  │                                                          │
│            │  │  "What's in motion"  (section label)                    │
│            │  │  ┌── task list ──────────────────────────────────────┐  │
│            │  │  │ ○  Write the product newsletter    [Maya] [Fri]   │  │
│            │  │  │ ○  Research competitor pricing      [Leo]  [Mon]  │  │
│            │  │  │ ✓  Draft social posts               [Maya] done   │  │
│            │  │  └───────────────────────────────────────────────────┘  │
│            │  │  [+ Add a task]  (ghost button)                         │
└────────────┘  └──────────────────────────────────────────────────────────┘
```

**Content:**
- Project name as page heading; color dot as visual accent
- Secondary nav tabs for project tools (Tasks active by default)
- Task list rows: completion checkbox, task title, assistant avatar chip, due date
- Blank state (no tasks yet): "Nothing here yet. Add your first task or ask your assistant to get started." + two equal-weight buttons: "Add a task" / "Ask your assistant"
- Error state: "We had trouble loading this project. Try refreshing the page."

**Component classes used:** `.card`, `.badge`, `.btn-ghost`, `.btn-primary`, `.u-row`, `.u-between`, `.u-truncate`

---

#### Screen 3 — `essential-todos` (Task List)

**Epicenter:** the to-do list with its items and assignee (assistant) chips.

**Layout:**
```
┌─ page (max-width 800px centered for focus) ────────────────────────────┐
│  "Write the product newsletter"  (list name, text-xl)                  │
│  Assigned to Maya  ·  Due Friday  ·  badge: "In progress"              │
│  ─────────────────────────────────────────────────────────────────────  │
│  ┌── subtasks ───────────────────────────────────────────────────────┐  │
│  │ ○  Choose top story angle                   [Maya]  [Wed]        │  │
│  │ ○  Write draft (500–700 words)              [Maya]  [Thu]        │  │
│  │ ○  Add subject line options                 [Maya]  [Thu]        │  │
│  │ ✓  Gather source links                      [Maya]  done         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  [+ Add a step]  (ghost button)                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  "Notes"  (section label)                                               │
│  [Notes area — read/edit toggle]                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  "Updates"  (section label)                                             │
│  [Comment / update thread]                                              │
└────────────────────────────────────────────────────────────────────────┘
```

**Content:**
- Task name as large heading; assistant chip + due date inline
- Status badge: "Not started" / "In progress" / "Needs review" / "Done"
- Subtask list with per-subtask assignee (assistant avatar) and due date
- Notes field (markdown-rendered; click to edit)
- Update thread (assistant activity log + human comments)
- Blank subtask state: "Break this into steps to make it easier to track." + "+ Add a step"

**Component classes used:** `.badge`, `.badge-success`, `.badge-warning`, `.badge-accent`, `.btn-ghost`, `.btn-primary`, `.textarea`, `.u-col-4`

---

#### Screen 4 — `essential-card-table` (Work Swim Lanes)

**Epicenter:** the column board — the visual representation of all work in motion.

**Layout:**
```
┌─ full-width board (no max-width constraint) ───────────────────────────┐
│  header: "Work board"  ·  Content team  [⋯]                           │
│  ─────────────────────────────────────────────────────────────────────  │
│  ┌── Triage ─────┐  ┌── In progress ──┐  ┌── Review ───┐  ┌── Done ──┐│
│  │ [+ Add]       │  │                  │  │              │  │ (locked) ││
│  │               │  │  ┌── card ─────┐ │  │ ┌── card ──┐│  │          ││
│  │ ┌── card ───┐ │  │  │ Newsletter  │ │  │ │ Social   ││  │          ││
│  │ │ Idea: pod-│ │  │  │ [Maya] Fri  │ │  │ │ posts    ││  │          ││
│  │ │ cast clip │ │  │  └─────────────┘ │  │ │ [Leo]    ││  │          ││
│  │ └───────────┘ │  │  ┌── card ─────┐ │  │ └──────────┘│  │          ││
│  │               │  │  │ Research    │ │  │              │  │          ││
│  │               │  │  │ pricing     │ │  │              │  │          ││
│  │               │  │  │ [Leo] Mon   │ │  │              │  │          ││
│  │               │  │  └─────────────┘ │  │              │  │          ││
│  └───────────────┘  └──────────────────┘  └──────────────┘  └──────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

**Content:**
- Columns: Triage (intake), In Progress, Review, Done (protected/locked)
- Each card: task title, assistant avatar chip, due date (compact)
- Triage column has "+ Add" at the top (always visible)
- Done column shows completed cards with muted text; no primary actions
- Dragging a card = changing its status (the core gesture)
- Column headers: name, card count badge
- Blank state for a column: "Nothing here yet" in muted text — no illustration needed
- Board blank state (no cards anywhere): "Add your first task to Triage to get started." + "+ Add a task" in Triage column

**Component classes used:** `.card`, `.badge`, `.badge-accent`, `.badge-success`, `.btn-ghost`, `.dot`, `.u-row`, `.u-muted`, `.u-truncate`

---

## Part F · What We Deliberately Do Not Copy (and Why)

| Basecamp feature | Decision | Reason |
|---|---|---|
| **Flat per-project Campfire chat as the primary communication channel** | Keep it minimal in Essential | Opzava's assistant interaction is the primary "chat" surface. Human-to-human Campfire would add noise for a team using AI assistants as the primary workers. Essential Chat is scoped to "talk to your assistant" — a focused, single-purpose interface. |
| **Per-project color picker (user-assigned wheel)** | Simplify to a preset swatch palette | Consistent with keeping Essential low-decision. Users pick one of six calm-theme accent swatches (`--chart-1` through `--chart-6`) from a fixed palette when creating a project. No freeform color wheel. |
| **Hill Chart full implementation (all scopes, full S-curve)** | Simplified two-position progress arc | The full Hill Chart requires teams to name scopes and update positions manually. For Essential's normal user, a simpler "Still figuring it out / On the way to done" toggle achieves the same qualitative signal without training. Power users who want the full Hill Chart switch to Full mode. |
| **Automatic Check-ins as team-facing recurring questions** | Reframe as assistant daily summaries | In Opzava, the "team" is largely AI assistants. Check-ins become the assistant's outbound summary ("here's what I completed today; here's what I'm starting tomorrow") rather than questions sent to humans. |
| **Separate admin/preferences screens (parallel universe)** | Collapsed into Essential via permission-gating | Per Getting Real ch. 09.8: "If you have to maintain two separate interfaces, both will suffer." Settings in Essential are a simplified subset of the same settings UI, shown in context. No separate admin domain. |
| **The dark technical Full view** | Kept entirely separate | The Full dark view (existing panels: Logs, Monitoring, Connections, Cron, Webhooks, etc.) is preserved exactly. The separation is enforced by role-based nav, not by forking components. This is the one case where maintaining two nav surfaces is justified — the audiences are genuinely distinct and the technical surfaces would irreparably pollute the calm Essential experience. |
| **Shape Up betting table and pitch format** | Not a product surface | Shape Up is an internal product-development methodology. It informs the Essential work model's vocabulary (scopes, appetite, Hill Chart) but is not exposed as a workflow surface to everyday users. |
| **No-backlog rule (pitches discarded if not bet)** | Not enforced in Essential | Opzava Essential keeps a Triage column (intake zone) as a visible backlog within each project. The "Start With No" discipline applies to product features, not to user task management. Users can park ideas indefinitely in Triage. |
| **Flat task lists (no subtasks in original Basecamp To-dos)** | We keep subtasks | Basecamp has evolved to include subtasks (Basecamp 5). Opzava's assistant model benefits from breaking a task into "steps" the assistant executes sequentially. Subtasks are kept but renamed "steps" in Essential copy. |

---

## Next

The four screens specified in E.3 are the next build targets:

1. `mockups/essential-home.html` — projects Lineup in `[data-theme="calm"]`
2. `mockups/essential-project.html` — project workspace with tool tabs
3. `mockups/essential-todos.html` — single task detail with steps + updates
4. `mockups/essential-card-table.html` — swim-lane work board

All four should import `tokens.css` and `app.css`, render with `data-theme="calm"` on `<html>`, use only the component classes documented in `02-design-system.md`, and satisfy all three states (regular, blank, error) per ch. 09.3 and ch. 09.4.
