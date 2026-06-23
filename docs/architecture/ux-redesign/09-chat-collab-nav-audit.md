# 09 — Conversational Surfaces, Slack-Grade Messages, Navigation & Glanceable Status

**Status**: Proposal — not yet implemented
**Depends on**: `02-design-system.md`, `03-ia-navigation.md`, `07-essential-vs-admin.md`, `08-basecamp-teardown.md`
**Governs**: nav-rail IA, the chat/messaging surfaces, the Overview/Home glance, and `mockups/app.css` (three new components)
**Produced by**: a 6-theme audit (T1–T6) cross-checked against the live source (`src/app/api/chat/messages/route.ts`, `src/lib/migrations.ts`, `src/opzava/core/...`, the panels) — every backend claim below was verified in code, and the over-optimistic feasibility calls from the first pass have been corrected against the verdicts.

---

## 1. Verdict

**The current redesign does NOT cover the owner's three conversational surfaces, does not cover Slack-grade human Messages, and only partially covers easy navigation and glanceable status.** All three "chat" needs collapse into a single, undifferentiated `chat`/`sessions` → `ChatPagePanel` nav item labelled "Chat" in `03` and "Messages" in `07` — so the product cannot tell a user whether they are talking to the whole-company AI, a single project's AI, or their human teammates. The biggest holes:

- **T1 Global Orchestrator Chat** — a fully-wired coordinator thread (`coord:` conversation routing, status + `tool_call` bubbles, `agent.wait` progress) exists in the backend but has **no entry point** and **no rendering component**; it is unreachable except by constructing the `conversation_id` by hand.
- **T2 Project Agent Chat** — named once in `08` ("Chat with your assistant"), **designed nowhere**, and the built `essential-project.html` dropped even the named tile. The only conversational-plus-agent-work UI that exists is **card-scoped** (`essential-card.html`), not project-scoped.
- **T3 Human Messages** — the **least-supported theme**: no channels / threads / reactions / presence backend exists, and `08 §F` deliberately argues *against* a Slack clone. This needs both new backend **and** a product decision.
- **T4 Navigation** — a real project switcher exists but is **buried in the profile popover**, projects are **absent from ⌘K**, and `fetchProjects()` is **admin-gated** so the everyday Essential audience cannot even populate it.
- **T5 Glanceable status** — the home cards' status pills are **hand-written copy** with no data source; there is **no AI-written status line** and **no cross-project "is everything OK?" rollup** beyond one authored banner.
- **T6 Missed capabilities** — approvals, the standup digest, artifacts/outputs, campaigns, and costs are all real, working backends rendered as jargon dead-ends or KPI numbers; and the **SSE bus has zero consumers** so every "live" surface above is wired to nothing.

The good news: most of T1, T2, T4, T5 and T6 are **UX-surface gaps over real backends**. The expensive parts are isolated and named in §4.

---

## 2. The Unifying Model — three conversations that never confuse the user

The owner wants three conversational surfaces. The failure mode is collapsing them into one "Messages" slot (Jakob's Law: one word must not carry three meanings). The model below keeps them **spatially and navigationally distinct**, each with its own purpose, entry point, and hand-off.

| | (a) **Ask Opzava** — Global Orchestrator | (b) **Project Assistant** — Project Agent Chat | (c) **Messages** — Human Team |
|---|---|---|---|
| **Theme** | T1 | T2 | T3 |
| **Who you talk to** | ONE company-wide AI with oversight of every project | ONE AI assigned to ONE project | Your human teammates |
| **Purpose** | "Is everything OK across all projects? Act across them." | "Do/understand the work on *this* project." | "Talk to people." |
| **Scope** | All projects | One project | Channels + DMs |
| **Entry point** | A persistent, pinned **top-level** anchor (`✦ Ask Opzava`) — first in the nav, never inside a project | A **tab inside the project workspace** (`Ask your assistant`) — never a global nav item | A **top-level `Messages`** item (Full) / a per-project **`Team` tab** (Essential) |
| **Thread storage** | `coord:<user>:<COORDINATOR_AGENT>` (exists) | `project:<id>:agent:<name>` (new convention) | new `channels` + `channel_members` tables (new) |
| **Glyph** | `✦` (AI) | `✦` on the project assistant avatar | `@`/`#` (human) |
| **Proven pattern** | ChatGPT/Linear single always-present assistant | Basecamp Campfire "chat with your assistant" | Slack channel + DM |

### How a user knows "am I talking to the AI or my teammates?"

Three rules, enforced everywhere the surfaces could co-occur:

1. **Different homes.** AI lives at the *top* of the shell (Ask Opzava) and *inside* a project (Project Assistant). Humans live under the distinct top-level word **Messages** (Full) or the project **Team** tab (Essential). The orchestrator is **never** inside a project; the human channels are **never** an AI thread.
2. **Glyph + label, never color** (one-accent rule). AI senders carry a `✦` corner glyph + the muted suffix `assistant`; human senders are plain initials chips. `--accent` is reserved for unread/active/primary-action only — human-vs-AI is *never* a second hue. (This convention is **already shipped** in `essential-card.html` — the `sb-avatar--ai` class, the `✦ AI` badge, and separate human/AI typing indicators — and should be lifted as the canonical reference rather than re-invented.)
3. **One-way hand-offs down, links back up.** The orchestrator (T1) is the cross-project hub: every project it names deep-links *into* that project's assistant (T2). The project assistant header carries a small back-link up to Ask Opzava. The human Messages surface links *into* projects but is never confused with either AI.

### App-shell wireframe (Full/Admin, dark)

```
┌──────────────┬─────────────────────────────────────────────────────────────┐
│ ◆ Opzava     │  Q2 Content Push  ›  Ask your assistant         [ ● live ]   │  ← header: workspace › project › panel + SSE dot
│              ├─────────────────────────────────────────────────────────────┤
│ ✦ Ask Opzava●│                                                             │   T1 lives HERE (pinned top, attention dot)
│ ── CORE ──   │   ┌─ project workspace ───────────────────────────────────┐ │
│ ▸ Overview   │   │ To-dos │ Board │ Ask your assistant★ │ Outputs │ Team │ │   T2 = a TAB inside the project
│ ▸ Agents   6 │   │────────────────────────────────────────────────────────│ │
│ ▸ Tasks    3 │   │ ✦ Atlas · your assistant on this project    ↑ Ask Opzava│ │   ↑ back-link to T1
│ ▸ Messages 2 │   │  (A) Atlas 9:14  Drafted the June newsletter.   [card] │ │
│ ── PROJECTS ─│   │            9:20  You: schedule it Friday 9am            │ │
│ ● Q2 Content●│   │  ⚙ ran draft.report ✓  ▸ (tool_call card)              │ │
│ ● Series B   │   │  [ Ask Atlas to do something…                ] [Send]  │ │
│ ● Website    │   └────────────────────────────────────────────────────────┘ │
│ ── OBSERVE ──│                                                             │
│ ▸ Activity   │   Messages (T3) is its own top-level destination —          │
│ …            │   #general + one channel per project + DMs (Full only).     │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

### App-shell wireframe (Essential, calm) — honoring the `08 §A.9` 4-destination cap

```
┌───────────────────────────────────────────────────────────────────────┐
│ Opzava   Home   My stuff   Activity   ✦ Ask Opzava   Find…             │  ← 5th item = the ONE written-case exception (§A.11)
└───────────────────────────────────────────────────────────────────────┘
   Inside a project:  [ To-dos │ Board │ Ask your assistant │ Team │ … ]
                                   └ T2 (AI)                  └ T3 (humans, Campfire-lite)
```

Essential adds **exactly one** new top-level node — `✦ Ask Opzava` — which is the §A.11 "written case" exception (two friction points: *no cross-project status answer* + *unreachable coordinator*). Human messaging in Essential is **never** a 5th rail item; it is the per-project **Team** tab only (Campfire-lite), keeping the cap intact and honoring `08 §F`'s anti-noise stance.

> **Mobile note (cross-cutting, applies to all three):** `08 §C.4` collapses Essential to a 4-tab bottom nav (`Home/Work/Activity/Me`) at ≤640px — there is **no slot for a 5th `Ask Opzava` tab**. Decision required: fold Ask Opzava into the `Home` tab as a pinned card on mobile, or into a header action. The 3-pane Slack layout (T3) and the project chat composer both also need an explicit mobile collapse — none exists in any mockup today.

---

## 3. Per-theme findings

Severities: **P0** = blocks the owner's stated goal; **P1** = significant gap; **P2** = polish/scale. Each recommendation cites a UX law or a named proven pattern, plus a feasibility note.

---

### T1 — Global Orchestrator Chat (cross-project AI oversight)

**Current state.** A coordinator conversation is fully wired server-side: `route.ts` resolves a `COORDINATOR_AGENT` and routes `conversation_id` with the `coord:` prefix through `lib/coordinator-routing.ts`, injecting an `accepted` status bubble, per-tool `tool_call` bubbles (`toolName/input/output/status/runId`), a final `text` reply, and graceful offline/failed/processing/error status bubbles; it calls gateway `agent.wait` on the `runId` and surfaces completion/timeout inline. **None of this is reachable from the UI** — `conversation-list.tsx` has only Active/Recent/Agents sections, and every mockup's "Chat" rail item is `href="#"`.

#### Gaps

- **P0 — No first-class orchestrator entry point.** *(confirmed)* "orchestrator" appears in zero nav mappings; the only chat item maps to a generic `ChatPagePanel`. The working `coord:` thread is unreachable by design. **Law:** Jakob's Law + Recognition over recall (Nielsen #6) — a capability with no visible affordance cannot be used.
- **P0 — T1/T2/T3 conflated under one "Chat"/"Messages" label.** *(confirmed)* `07` labels the single `chat` panel "Messages" for all tiers; `08 §E.1/§E.2` scopes Essential "Chat" to a *per-project* assistant, directly colliding with a cross-project orchestrator. **Law:** Mental-model clarity / Law of Common Region.
- **P0 — Cross-project status is never reported conversationally.** *(confirmed)* The orchestrator cannot answer "is everything OK across projects?" inline; `shell-overview` KPIs are read-only aggregate. **Law:** Doherty Threshold + the owner's 3-second glance rule.
- **P1 — `tool_call`/`status` bubbles have no renderer.** *(confirmed)* The backend emits `messageType 'text'|'status'|'tool_call'`; `02-design-system.md` has **no** ChatBubble/MessageList/MessageComposer, and **zero** panels consume `useServerEvents`. **Law:** Visibility of system status (Nielsen #1).
- **P1 — No cross-project ACT affordance.** *(confirmed)* `POST /api/campaigns/[id]/run`, `/api/ops/approvals` and `agent.wait`-returned `runId` exist, but there is no inline approve/trigger button in a reply. **Pattern:** Slack interactive message buttons / Linear inline actions.
- **P1 — Offline/degraded states have no Essential-friendly UX.** *(confirmed)* Backend emits raw admin-grade copy ("restore the coordinator session", "coordinator runtime"); `07` tenet #2 forbids that jargon. **Law:** Graceful degradation / plain-language recovery (Nielsen #9).
- **P2 — No T1↔T2↔Overview relationship defined.** *(confirmed, IA decision)* Overview is a KPI page not linked to any conversational orchestrator.

#### Recommendations

**R-T1.1 (P0) — Persistent `✦ Ask Opzava` anchor.** Pin one always-visible orchestrator entry: Essential = the 5th top-nav item; Full = first item in CORE, above Overview, with an attention dot. Clicking opens the `coord:<user>:<COORDINATOR_AGENT>` thread via the existing `/api/chat/messages` path.

```
Full rail (reuse .rail-item):              Essential top bar:
┌──────────────┐                           ┌──────────────────────────────────────┐
│ ✦ Ask Opzava●│  ← .rail-item, ✦ in       │ … Activity   ✦ Ask Opzava   Find…    │
│ ▸ Overview   │     --accent, 8px dot      └──────────────────────────────────────┘
└──────────────┘     --warning when needs-you        └ accent dot when needs-you
```
*Spec:* label 15px (`--text-sm` floor); `✦` in `--accent` (the ONE accent); attention dot = 8px `--warning-soft` fill / `--warning` ring, shown **only** when an open approval or blocked run exists. **CORRECTION (verdict):** the dot's data source is **NOT** `/api/status?action=overview` (that returns uptime/memory/disk only). The correct source for "an approval is pending" is **`/api/ops/approvals?status=requested`**. Essential copy `Ask Opzava`; Full tooltip "Cross-project orchestrator". Never label this "Messages". **Feasibility: reuses existing** — `/api/chat/messages` (`coord:` prefix) + `ChatWorkspace` direct-agent path; no new backend for the anchor itself.

**R-T1.2 (P0) — Orchestrator chat screen with rendered status + `tool_call` + text bubbles.** Build `mockups/09-orchestrator-chat.html` and the **three missing components** (`MessageList`, `ChatBubble`, `MessageComposer`). Render user text (right), coordinator text (left), inline `status` pills, and collapsible `tool_call` action cards. This is the **first `useServerEvents` consumer**.

```
┌─ Ask Opzava ───────────────────────────────── ✦ online ─┐
│  You · 9:02                  ┌────────────────────────┐  │
│                              │ How's everything today?│  │
│                              └────────────────────────┘  │
│  ✦ Opzava · 9:02                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 4 projects active, 1 needs you. Series B is BLOCKED │ │
│  │ on your approval.                                   │ │
│  └────────────────────────────────────────────────────┘ │
│  ▸ ⚙ ran standup.report  ✓ done        (tool_call card) │
│  ◔ coordinating downstream agents…       (status pill)  │
├──────────────────────────────────────────────────────────┤
│ Message Opzava…                                    [↵]   │
└──────────────────────────────────────────────────────────┘
```
*Spec:* `MessageList` = vertical scroll, `role="log" aria-live="polite"`. `ChatBubble`: `--radius-lg`, `--space-3` padding, body 15px; user bubble `--accent-soft`, agent bubble `--surface-2`; timestamp 13px `--text-xs` `--fg-subtle`. `tool_call` card collapses to `⚙ {toolName} {status}`, expands to input/output in `--font-mono` 13px; status glyph uses `--success/--warning/--danger` (semantic, accent stays cyan/indigo). Composer = `.textarea`, Enter-to-send. **DEDUP HAZARD (verdict missed-by-analyst):** `task-board` polls the transcript every 5s while SSE+WS also deliver `chat.message` (three paths) — the new screen must dedupe by message id against any poll fallback. **Feasibility: reuses existing** (backend emits all three messageTypes) + new FE components.

**R-T1.3 (P0) — Open on a proactive cross-project digest, not a blank thread.** First message is an auto status digest: one row per project with a status pill (On track / Needs you / Blocked) + one-sentence summary; rows deep-link (Needs you → approval, project name → T2).

```
┌─ ✦ Opzava · today 8:00 ─────────────────────────────────┐
│ ● On track   Q2 Content Push   — 3 tasks running        │
│ ▲ Needs you  Series B outreach — approve Cipher's email │ [Review]
│ ✕ Blocked    Weekly Ops digest — waiting on connection  │ [Fix]
│ Want me to chase the blocker on Weekly Ops? [Yes] [No]  │
└─────────────────────────────────────────────────────────┘
```
*Spec:* `.card`, one row per project, status pill = dot+word (`07` proven-patterns). **DEFERRED — needs product + schema decision (verdict: needs-product-decision):** this is *not* "just compose existing data." There is **no join** between the Basecamp `projects` table and the `Campaign`/`WorkflowRun` entities — `campaigns` and `workflow_runs` carry **no `project_id`**, and `projects.status` is only `active|archived`. So "derive a per-project status pill from the latest WorkflowRun" is infeasible today. **v1 ships from `tasks` only** (`tasks.project_id` is real); the run-derived enrichment waits on the FK decision in T5/§4. **Pattern:** Linear "Ask" / Basecamp automatic check-ins.

**R-T1.4 (P1) — Inline cross-project actions (approve / trigger / chase).** Action buttons inside the relevant status/digest bubble; result reflected inline. **Feasibility: needs new backend** — attach action descriptors to the message payload and wire approve/reject/run; routes exist (`campaigns/[id]/run`, `ops/approvals/[id]/decide`). **Open product call:** does the orchestrator ACT autonomously or only PROPOSE (human-confirm)? Inline buttons assume human-confirm. **Pattern:** Slack interactive buttons.

**R-T1.5 (P1) — Plain-language offline/degraded states.** Map the backend's `offline|delivery_failed|processing|error` status to Essential-safe copy + a non-alarming banner with one Retry; keep raw reason/`runId` behind a Full-only disclosure.

```
┌─ ✦ Opzava ──────────────────────────────────────────────┐
│  ⏾ Opzava is offline right now.                          │
│     I'll pick up where we left off when it's back.       │
│     [ Try again ]        (Full: ▸ technical details)     │
└──────────────────────────────────────────────────────────┘
```
*Spec:* `.banner` variant, `--warning-soft` bg, 15px, `[Try again]` secondary `.btn`. **Feasibility: reuses existing** — pure FE copy-mapping + a retry that re-POSTs the last message. **EMPTY/COLD-START (verdict missed):** there is also no design for the orchestrator thread when the coordinator has **never** run (no history, no projects) — add a cold-start empty slate.

**R-T1.6 (P2, IA) — Define T1↔T2↔Overview hand-offs.** Orchestrator replies deep-link into each project's assistant; the project assistant header carries an "Ask Opzava ↑" back-link. **Feasibility: T1 side reuses existing; T2 deep-link target depends on the new `project:<id>:agent:<name>` scoping** (the `messages` table has no `project_id` — verified).

> **Verdict corrections folded in:** the claim that the coordinator is "fully wired / turnkey" is **overstated** — real cross-agent execution only happens if a live coordinator **gateway session** exists; otherwise the path posts an "offline" bubble and does nothing. Also a config inconsistency: `config.ts` defaults `coordinatorAgent` to **empty string** (auto-routing off by default) while the chat route defaults the coordinator *name* to `'coordinator'` — so on a fresh install Ask Opzava may land on a perpetual "offline" state. **`agent-comms-panel.tsx`** (with its `coordinator 🧭` identity map and a live chat/tools/trace feed) is the closest *existing* renderer of coordinator events and should be promoted/reused rather than building `MessageList` from scratch. The existing `essential-home.html` "Needs you" banner is a non-conversational orchestrator-lite seed the digest should **converge with** (avoid two competing needs-you surfaces).

---

### T2 — Per-Project AI Agent Chat

**Current state.** Named once in `08` ("Chat with your assistant"), designed nowhere, and `essential-project.html` ships tiles `To-dos / Board / Messages / Docs & Files / Schedule / Updates` with **no** assistant tile. The only conversational-plus-agent-work UI is **card-scoped** (`essential-card.html`: a human↔Echo comment thread + an "AI Run" terminal trace + an "Evidence & Files" artifact browser + a "Quality Review" approval surface). `message-bubble.tsx` **already** renders `tool_call`/`handoff`/`command`/`system` bubbles with status icons. The `messages` table has **no `project_id`**; `conversation_id` is free-form (`agent_NAME`/`coord:`/`session:`).

#### Gaps

- **P0 — Project assistant chat named in IA, zero screen spec; built mockup dropped the tile.** *(confirmed)* **Law:** Jakob's Law — naming without designing leaves a dead affordance.
- **P0 — No conversational UI binds a thread to a PROJECT.** *(confirmed)* The only agent-chat is card-scoped; reaching an assistant requires Home → project → a specific card. **Pattern:** Basecamp project-room / Slack channel-per-project.
- **P0 — The agent's WORK is not surfaced inside a project conversation.** *(confirmed)* `message-bubble.tsx` renders `tool_call`; `/api/ops/runs` and `/api/ops/artifacts` exist but aren't project-scoped. **Pattern:** Linear/Notion-AI "show your work."
- **P0 — No chat→approval hand-off at project altitude.** *(overstated → narrowed)* `essential-card.html` **already** ships a card-level "Quality Review" tab with "Approve & send to customer" + a review-comment loop — so an inline approval handoff exists at *card* altitude. The real gap is **project**-altitude handoff. **Pattern:** Slack interactive message / GitHub PR review.
- **P1 — Essential conflates human Messages with agent chat.** *(confirmed)* `essential-project.html` has a "Messages" tile + "Message the team" button but **no** assistant tile.
- **P1 — Admin `agent-detail` has no conversation tab; `ChatPagePanel` is per-agent not per-project, broken empty state.** *(confirmed)* `before/chat.png` right pane is a permanent "Select a conversation" with no New-Conversation CTA + mid-word truncation.
- **P2 — Realtime reply/typing unwired.** *(overstated mechanism, conclusion holds)* SSE `chat.message` exists but no panel consumes `useServerEvents`; the mockup's typing indicators are **static HTML**, not a JS timer as first claimed — but the conclusion (needs SSE wiring) stands.

#### Recommendations

**R-T2.1 (P0) — `Ask your assistant` tab/tile = the canonical T2 surface.** Essential: a tool tile + tab on `essential-project.html`; Full: a 6th tab on `agent-detail.html` / a project-scoped thread in `ChatPagePanel`. Default-bind to the project's lead assistant from `project_agent_assignments`. Persist via `conversation_id` `project:<id>:agent:<name>`.

```
PROJECT WORKSPACE (Essential)
┌──────────────────────────────────────────────────────────────┐
│ Q2 Content Push        [On track]   Atlas, Iris, Echo  •••    │
│ To-dos │ Board │ Ask your assistant★ │ Outputs │ Team │ More  │
├──────────────────────────────────────────────────────────────┤
│ ✦ Atlas — your assistant on this project          ↑ Ask Opzava│
│  (A) Atlas 9:14  I finished the June newsletter draft. Schedule│
│                  it for Friday?                   [card: draft]│
│                         9:20  You: yes, send it Friday 9am     │
│  (A) Atlas is working…  ◦◦◦   (live, SSE-driven)               │
│  [ Ask Atlas to do something…                       ] [ Send ]│
└──────────────────────────────────────────────────────────────┘
```
*Spec:* reuse `ChatWorkspace` + `message-list.tsx` + `message-bubble.tsx` + `chat-input.tsx` + the R-T1.2 components. One-accent: only the active tab `★` and Send use `--accent`; status pill uses `--success` desaturated. Body 15px floor; timestamps 13px. **Feasibility: reuses existing** for the thread; scoping needs the `conversation_id` convention (zero schema change) **OR** a new `messages.project_id` column — **prefer the column** (T4 unread + T5 status both need a queryable `project_id`). **Pattern:** Basecamp Campfire / Slack app DM.

**R-T2.2 (P0) — Render the assistant's work as inline action/artifact cards.** Post `tool_call`/`handoff` bubbles (already rendered) + an artifact card (preview + Open). Essential humanizes step labels; Full discloses the raw AI-Run trace.

```
│  (A) Atlas 9:14  Drafted the June newsletter.                  │
│  ┌──────────────────────────────────────────────┐            │
│  │ ✓ Wrote draft → ✓ Checked tone → ✓ Saved     │  (steps)   │
│  └──────────────────────────────────────────────┘            │
│  ┌──────────────────────────────────────────────┐            │
│  │ 📄 newsletter-june.md   138 words   [Open]    │  artifact  │
│  └──────────────────────────────────────────────┘            │
│  ‹ See how Atlas worked ›   (Full: raw AI Run trace)         │
```
*Spec:* cards = `.card` + `--border`; mono only inside the Full trace; `[Open]` is a `.btn-ghost` link (keep the thread calm). **Feasibility: rendering reuses existing; needs new backend** to project-scope runs/artifacts (tag `WorkflowRun`/artifact with `project_id`, or filter by the project's assigned agents). **LIFT, don't invent (verdict):** `essential-card.html`'s "Evidence & Files" tab is a built artifact browser and "Quality Review" is a built approval surface — lift these proven card-level components to project altitude. **Pattern:** Linear/Notion-AI "show your work."

**R-T2.3 (P0) — Inline approval hand-off card in the project chat.**

```
│  (A) Atlas 9:21  This is ready for your OK before it goes out.│
│  ┌──────────────────────────────────────────────┐            │
│  │ Needs you: Approve the partner outreach email │            │
│  │ 📄 outreach-seriesb.md          [Preview]     │            │
│  │ [ ✓ Approve & send ]   [ Request changes ]    │            │
│  └──────────────────────────────────────────────┘            │
```
*Spec:* `--warning-soft` bg (semantic, not a second accent); `Approve & send` = the ONE accented action; `Request changes` = `.btn-ghost`; Preview opens a `.drawer`. **Feasibility: backend EXISTS** — `POST /api/ops/approvals/[id]/decide` accepts `decision 'approved'|'rejected'` + `decisionReason` (this is **already covered**, contrary to the first pass which said "needs new route"). **BLOCKER — needs product decision (verdict missed-by-analyst):** `/api/ops/approvals` and `.../decide` both `requireRole('admin')`, so an Essential non-admin owner **cannot read or act** on approvals today — this needs an auth-policy change or a new project-scoped non-admin endpoint. **Target resolved:** use `/api/ops/approvals` (artifact sign-off), **not** `exec-approvals` (which gates gateway command execution — a different domain). **Pattern:** Slack interactive bot message.

**R-T2.4 (P1) — Split human Messages from agent chat in the project.** Two distinct tiles: `💬 Ask your assistant` (T2, live now) and `✉ Team updates` (T3 track, defer until human-messaging backend lands). Remove the ambiguous "Message the team" button. **Feasibility: assistant tile reuses existing; Team tile needs new backend** (T3). **Pattern:** Slack channels vs app DMs; Basecamp Message Board vs Campfire.

**R-T2.5 (P1) — Full/Admin project-scoped "Conversation" tab with a runs side-rail.** Same thread as Essential but technical layer visible (model id, run ids, raw trace); fix the broken `ChatPagePanel` empty state (add a "Start conversation" CTA, stop mid-word truncation).

```
┌──────────────────────┬───────────────────────────────────────┐
│ Runs (this project)  │  Atlas · claude-opus · project:Q2     │
│ ▸ run CS-1042 ✓      │  $ opzava run CS-1042 · attempt 1     │
│ ▸ run CS-1041 ⚠ appr │  tool reproduce_login → ✗ invalid_tok │
│ [+ New conversation] │  [ Message Atlas…             ][Send] │
└──────────────────────┴───────────────────────────────────────┘
```
*Spec:* left rail reads `/api/ops/runs` filtered to the project's agents (admin-only — correct audience). Empty-state/truncation fixes are pure FE. **Feasibility: reuses existing**; runs side-rail depends on the R-T2.2 project linkage.

**R-T2.6 (P2) — Wire realtime replies/typing via SSE.** Subscribe the project thread to `chat.message` filtered to its `conversation_id`; keep poll only as fallback. **Feasibility: real but unwired** — first `useServerEvents` consumer + per-conversation filter.

> **Verdict corrections folded in:** **AUTH WALL** — `/api/ops/runs`, `/api/ops/artifacts`, `/api/ops/approvals` and `.../decide` are **all `requireRole('admin')`**; every Essential-mode T2 rec that shows runs/artifacts inline or posts an approval card needs an auth-policy decision first. **Reusing `ChatWorkspace` verbatim for Essential risks leaking session/model jargon** (`claude-code/codex-cli/gateway` session kinds) — Essential needs a jargon-free variant, not raw reuse. There is **no `lead` role** in `project_agent_assignments` (POST defaults to `member`) — picking the project's primary assistant deterministically is a new convention (product decision). **Empty/offline/zero-agent states are unspecified** (what does "Ask your assistant" show when the project has no assigned agents, or the gateway session is offline?). **Unread depends on `messages.project_id`** — this makes the column (not the `conversation_id` convention) the only viable storage choice for T4/T5.

---

### T3 — Human Messages (Slack-grade team collaboration)

**Current state — the least-supported theme.** No human channel/thread/reaction/presence backend exists. The `messages` table has `conversation_id, from_agent, to_agent, content, message_type, metadata, read_at, created_at` — **no `project_id`, no `parent_message_id`**, no reactions/channels tables. `users` has only `last_login_at` (no presence). **Jargon trap:** the app's `/api/channels` + `channels-panel.tsx` are **outbound delivery integrations** (Slack/Email/WordPress via gateway), NOT human chat — building a "Channels" UI off that panel wires the wrong thing. And `08 §F` **deliberately omits** human-to-human chat ("would add noise for a team using AI assistants as the primary workers"). So T3 needs **new backend AND a product decision**.

#### Gaps

- **P0 — No human-messaging surface exists; the only "Chat" is AI sessions, the only "channels" is delivery integrations.** *(confirmed)* **Law:** Jakob's Law — "Messages" today points at an AI-session picker.
- **P0 — Three surfaces conflated under one "Messages" label.** *(confirmed)* **Law:** Recognition over recall + Information Scent.
- **P0 — Backend has no channels/threads/reactions/presence — Slack-grade is unbuildable on the current schema.** *(confirmed)* The largest backend gap of the five themes.
- **P1 — Product thesis (`08 §F`) argues against a human Slack clone — unresolved conflict with the owner's ask.** *(needs product decision)* **Law:** Hick's Law / less-is-more.
- **P1 — @mentions exist as autocomplete but have no inbox destination.** *(overstated → narrowed)* `/api/mentions` is autocomplete-only, BUT the message POST path **already** calls `createNotification` for the single `to` recipient — the destination (`/api/notifications`, recipient + `read_at` + unread count) exists; what's missing is **parsing @mentions to fan-out** to multiple recipients. **Law:** Closure / feedback loop.
- **P1 — No presence/unread/read-state for humans; the "Messages 2" badge has no data source.** *(confirmed)*
- **P1 — Human messaging and the two AI chats have no defined coexistence.** *(confirmed)*
- **P2 — Essential has no room for human messaging without breaking the 4-destination cap.** *(confirmed)*
- **P2 — No message search/pins/saved.** *(confirmed)* The only FTS5 table is `memory_fts`, not messages.

#### Recommendations

**R-T3.1 (P0, no backend) — Split the one "Chat" slot into three labeled surfaces; reserve "Messages" for humans.** Full nav: "Orchestrator" (T1) + per-project agent chat (T2, inside the project) + a top-level **Messages** (T3, humans only). Essential: human messages = a per-project **Team** tab + an Activity `@ You` filter — **no 5th rail item**.

```
FULL/ADMIN rail:                        ESSENTIAL (4-item cap held):
  CORE                                    Home | My stuff | Activity | Find…
   ✦ Ask Opzava   ← T1                     - human messages = project 'Team' tab
   ▸ Overview                              - mentions = 'Activity ▸ @ You'
   ▸ Tasks
   ▸ Messages (2) ← T3 humans, # glyph
  (per-project agent chat = a TAB, never a rail item)
```
*Spec:* reuse `.rail-item`, `.section-label`, `.badge`. One-accent: only unread + active use `--accent`; AI-vs-human is by **glyph + label** (`✦ AI` / `@ #` human), never a second hue. **Feasibility: reuses existing** — the three threads already coexist in `messages` via `conversation_id` prefixes; pure IA/label change. **Maps to Slack:** left-rail grouping (Channels / DMs / Apps as separate sections).

**R-T3.2 (P1, needs backend + product decision) — Full/Admin Messages = faithful Slack 3-pane.** Channel/DM list · message pane · composer; threads in a right `.drawer`; channels seed 1:1 from `/api/projects`.

```
+----------------+-----------------------------------------------------+
| CHANNELS  +    |  # q2-content-push            3 ppl  ⟲ pin  ☰      |   ← Slack: channel header + pin
|  # general  (2)|  ──────────────  Tue, Jun 23  ──────────────       |   ← Slack: day divider
|  # q2-content(2)|  AG Anthony   10:02                                |   ← Slack: author-grouped
|  # series-b    |     can we ship the partner email today?            |
| DIRECT MSGS    |  IR Iris      10:04           reply 2   👍1         |   ← Slack: thread count + reaction
|  ● Maria       |     yes — draft is in Approvals, needs your ok      |
|  ○ Dev         |                                                     |   ← Slack: presence ●online ○away
+----------------+-----------------------------------------------------+
|                |  [ Message #q2-content-push…          @  😀  Send ] |   ← Slack: composer + @mention + emoji
+----------------+-----------------------------------------------------+
```
**Slack-pattern map:** 3-col flex = Slack sidebar/messages/composer; right `.drawer` = Slack thread pane; day-divider + author-grouping = Slack/Discord; presence dots = Slack `●/○`; per-channel `.badge` = Slack unread; hover react/reply/pin = Slack hover actions; `⌘K` "Find in messages" = Slack quick-switcher. *Spec:* row = 28px initials chip + author + `.u-mono` time (13px) + body 15px; one-accent: active channel + Send + unread use `--accent`, presence/reactions use `--success`/`--fg-subtle`. **Feasibility: needs new backend** — `channels` (id, project_id nullable, name, kind=channel|dm), `channel_members`, `message.channel_id` + `message.parent_message_id`, `message_reactions`, presence heartbeat (`users.last_seen` via SSE ping). Reuses `messages` base, `/api/mentions`, `/api/auth/users`, SSE `chat.message`. **Gate behind the `08 §A.11` written case + the `§F` conflict resolution.** **EMPTY/ERROR (verdict missed):** specify empty (no messages), loading skeleton, error (can't reach DB/gateway), SSE-dropped — `08 §A.10` requires all three. **Workspace-scope (verdict missed):** rooms must be `workspace_id`-scoped (the existing multi-tenant boundary) — channels seed per workspace, not globally.

**R-T3.3 (P1, needs backend) — Essential per-project "Team" room (Campfire-lite, not a global Slack).** One chronological human thread per project — no channel-switcher, no DMs, no presence in Essential. Sits beside the project's `Ask your assistant` tab so the human/AI boundary is spatial.

```
│ Q2 Content Push   [Tasks][Board][Team (2)][Assistant][More]  │
│  Team room                             3 people · 2 new       │
│   AG Anthony 10:02  Can we ship the partner email today?      │
│   IR Iris    10:04  Draft's waiting for your ok in Approvals →│  👍 1
│  [ Write to the team…                        @   Send ]       │
```
*Spec:* `--accent` (indigo) calm theme; no presence dots (reduce noise); single 👍 reaction, no picker. **Feasibility: needs new backend** (subset of R-T3.2: `channels` rows `kind='project-room'` + `message.channel_id`). **Maps to Slack/Basecamp:** Campfire (one casual room per project, chronological). **Hick's Law:** one room, no switcher.

**R-T3.4 (P1, mostly reuse) — Give @mentions a real home: a global `@ You` inbox.** Make the Essential **Activity** destination (and a Full bell-menu tab) an inbox with an `@ You` filter where human mentions, AI "needs you" hand-offs, and approvals all land.

```
Activity ▸ [ All ] [ @ You (2) ] [ Approvals (1) ] [ Following ]
│  ● Anthony mentioned you in #q2-content-push    2m  [Open]   │   ← Slack 'Mentions & reactions'
│  ● Iris (assistant) needs your ok on email     10m  [Review] │   ← Basecamp 'Hey!'
│  ○ Dev replied to your thread in #series-b      1h  [Open]   │
```
*Spec:* unread = leading `.dot` accent; source-type as a leading glyph (`@`/`✦`/`✓`), no color fork. Essential copy: "mentioned you", "needs your ok" — never "@mention"/"exec-approval". **Feasibility: mostly reuses existing** — `/api/notifications` (recipient + `read_at`), `/api/mentions`, `/api/activities`, `/api/ops/approvals` all exist; the message POST path already writes a notification + activity. New backend is small: **parse @mentions to fan-out notification rows** + a unified read-state rollup. **CAVEAT (verdict missed):** the chosen host **Activity** surface currently renders 0 items / empty-state mismatch (a real audit defect) — its `/api/activities` GET + notifications join must be fixed first. **Strongest, lowest-risk T3 rec; independent of the Slack-vs-no-Slack product call.** **Maps to:** Slack mentions inbox + Basecamp "Hey!" + GitHub notifications.

**R-T3.5 (P2, no backend — already partly shipped) — Human/AI distinction by badge + glyph, never a second accent.** **ALREADY COVERED in `essential-card.html`** (the `sb-avatar--ai` class, `✦ AI` badge, "AI assistant" suffix, separate typing indicators). Lift that convention to any shared list; `isAgent(from)` drives the glyph via `from_agent` + `/api/team/agents` vs `/api/auth/users`. **CONSTRAINT (verdict missed):** if AI agents post into human rooms, `from_agent` must be enforced at **write** time, not just read time. **Maps to:** Slack APP badge on bot messages.

**R-T3.6 (P2, needs backend + product decision) — Message search + pins (Full only, FTS5).** `⌘K` "Find in messages" + per-channel pins. **Feasibility: needs new backend** — SQLite FTS5 over `messages.content` (none exists today) + `message_pins` + `GET /api/messages/search`. Strictly gated behind R-T3.2. **Maps to:** Slack message search + channel pins.

> **Verdict corrections folded in:** the human-vs-AI badge (R-T3.5) and notifications-write (R-T3.4) reuse **more** existing infra than the first pass credited. **`/api/standup`** (per-agent narrative reports, POST generate + GET history) could power an in-room "daily summary" card without new AI infra — the `essential-project.html` "Updates" tile already hints at a 5pm digest. **Mobile** (3-pane has no defined ≤640px collapse) and **async/empty/error states** are unspecified and required by `§C.4`/`§A.10`.

---

### T4 — Navigation between projects & workspaces (Slack-easy switching)

**Current state.** `workspaces` and `projects` are real first-class entities (GET/POST routes; `projects` returns name/slug/color/status/ticket_prefix/task_count/deadline/assigned_agents). A real project switcher **already exists** — `ContextSwitcher`/`OrgRow` at the **bottom of `nav-rail.tsx`**, nesting Org→Projects with color chip + ticket_prefix + task_count + overdue dot — but it is **buried inside the profile popover** that also holds logout, interface-mode, and org provisioning. `activeProject`/`setActiveProject` persists to `localStorage` and scopes the whole app. A real `⌘K` palette works (`QUICK_NAV_COMMANDS` + `/api/search`), but **projects are absent** from it. `fetchProjects()` runs **only for admins**.

#### Gaps

- **P0 — Project switcher buried in a profile popover, not a first-class sidebar list.** *(confirmed)* **Law:** Jakob's Law + Fitts's Law. **Maps to Slack:** the channel/DM list is *always-visible* primary nav, never behind the avatar menu.
- **P0 — Projects/workspaces absent from ⌘K — the fastest switch path can't switch projects.** *(confirmed)* `/api/search` has no project branch. **Maps to Slack/Linear:** ⌘K quick-switcher jumps to *any* entity, projects first.
- **P1 — No per-project unread/"needs you" indicator in nav.** *(overstated → narrowed)* The gap is real (OrgRow shows only task_count + overdue), but the rich "needs you" sources are **not joinable**: `opzava_approvals` and `workflowRunSchema` have **no `project_id`**. Only **task_count + `project.deadline`** are derivable today. **Maps to Slack:** per-channel unread dot + mention count.
- **P1 — Essential has zero fast project switching (must go Home and click a card).** *(confirmed)* **Maps to Basecamp:** "Jump to…" project picker.
- **P1 — Non-admin Essential users can't even populate a switcher (`fetchProjects` admin-gated).** *(confirmed)* `/api/projects` GET allows `viewer` — this is a **UI-only gate / regression** for the primary audience.
- **P1 — Current location ambiguous when scoped; no project-aware breadcrumb.** *(confirmed)* The project chip is `hidden lg:flex` — invisible below 1024px. **Maps to:** Workspace › Project › Page breadcrumbs (universal IA).
- **P2 — No project recents / pinned projects.** *(confirmed)* Recents is panel-only. **Maps to Slack:** starred channels + recents.
- **P2 — Workspace and project switching conflated in one popover.** *(confirmed)* **Maps to Slack:** two-tier workspace rail + channel list.

#### Recommendations

**R-T4.1 (P0) — Promote the project switcher to a persistent, always-visible sidebar `PROJECTS` section.** Lift `ContextSwitcher`'s project list out of the popover into a dedicated section between CORE and OBSERVE; keep the avatar popover for identity + logout + mode only. Essential gets a left sidebar with projects.

```
┌──────────────────────────┐
│ ── PROJECTS ──────  + ◯ │  ← header + New (+) + 'All' (◯)
│ ● Q2 Content Push   ·3  ●│  ← color dot · task_count · attention dot
│ ● Series B Outreach ·1   │
│ ▾ Show all (9)           │  ← collapse beyond 6 (Miller)
└──────────────────────────┘
```
*Spec:* reuse the `OrgRow` project markup hoisted to a top-level `<ProjectNavList>`; active project uses the `03 §Active State` triple signal (3px `--color-primary` left border + bg + `font-medium`). One-accent: attention dot + active border use the single accent; project color chips are decorative identity only. Project name at 15px (honor the floor). Collapsed rail = color-chip initials + tooltip. **SPACE BUDGET (verdict missed):** CORE already has 8 items (overview/agents/team/tasks/chat/channels/skills/memory); a persistent PROJECTS section competes for the same Miller's-Law vertical budget — collapse beyond 6 and consider whether CORE must shed items first. **Feasibility: reuses existing** — only change is ungating `fetchProjects` (R-T4.4). **Maps to:** Slack/Linear persistent channel-list.

**R-T4.2 (P0) — Add Projects (and Workspaces) to ⌘K as top-ranked jump targets.** Typing a project name jumps to it (sets `activeProject` + lands on its Tasks/Overview); seed the empty palette with recent/pinned projects above panel commands.

```
┌─ Search or jump…  ⌘K ─────────────┐
│ PROJECTS                          │
│  ◆ Q2 Content Push      3 tasks  ↵│  ← projects first (recents)
│  ◆ Series B Outreach    1 task    │
│ JUMP TO                           │
│  › Overview   › Agents   › Tasks  │
└───────────────────────────────────┘
```
*Spec:* map `projectResults` from `store.projects` (instant, no fetch) + `/api/search` hits; `handleResultClick` gains a `type==='project'` branch → `setActiveProject` then `navigateToPanel('tasks')`. Title at 15px (bump from `text-xs`). **DISAMBIGUATION (verdict missed):** `QUICK_NAV_COMMANDS` already aliases `chat`/`channels` → "messages" — a project-jump UX must disambiguate against the proposed per-project messaging. **Feasibility: client fully supported; needs ~12-line `project` SQL branch in `/api/search`.** **Maps to:** Linear/Slack ⌘K quick-switcher.

**R-T4.3 (P1) — Per-project attention indicator.** A dot when a project has something needing the user; a count for countable items. **DOWNGRADED — needs schema work (verdict: overstated):** the only signals genuinely derivable today are **task_count and overdue** (`tasks.project_id` is real). A trustworthy approval/blocked dot requires **adding `project_id` to `opzava_approvals` / `workflow_runs`** (a migration, not "light wiring"). Ship the task/overdue dot first; gate the approval/blocked dot behind the FK. **Maps to:** Slack unread/mention dot.

**R-T4.4 (P1) — Fetch projects for ALL roles + a persistent project-scope breadcrumb.** Remove the `if (isAdmin)` gate on `fetchProjects`/the switcher; render the active workspace/project scope as a breadcrumb at **all** breakpoints with a one-click clear.

```
[ Default ⌄ ] › [ Q2 Content Push ✕ ] › Tasks
  workspace      active project (✕ clears)   panel <h1>
```
*Spec:* drop `hidden lg:flex`; `✕` calls `setActiveProject(null)`; the `+ New project` affordance still role-gates (POST requires `operator`). **COUPLED EDIT (verdict missed):** the tenant-change effect (`setActiveProject(null)+fetchProjects` on `activeTenant` change) is **also** admin-gated — ungating projects without ungating this leaves non-admin multi-tenant users with a stale list. **STALE-SCOPE RISK (verdict missed):** `activeProject` is read raw from `localStorage` and never validated against the fetched list — a deleted/cross-tenant project could scope the app to a non-existent project; the breadcrumb would surface this visibly, so validate on load. **Feasibility: reuses existing** — `/api/projects` + `/api/workspaces` both allow `viewer`; pure UI change. **Maps to:** Notion/Linear top-bar scope chip.

**R-T4.5 (P2) — Project recents + pinned section.** Order: Pinned → Recent → All. **CORRECTION — pin persistence infeasible as written (verdict: infeasible):** recents are client-only (fine), but the proposed `PUT /api/settings { 'general.pinned_projects' }` fails twice — `/api/settings` PUT `requireRole('admin')` (the everyday audience can't write) **and** `settings` is a **global** key-value table, so a pins key would be shared across all users, not per-user. **Per-user pins need a new user-scoped table or mechanism — there is NO per-user UI-preferences store today** (a cross-cutting infra gap, verdict missed). Ship **recents only** until that store exists. **Maps to:** Slack starred channels.

**R-T4.6 (P2, needs product decision) — Two-tier workspace + project nav for multi-tenant admins.** A thin far-left workspace rail (icons) + the projects list beside it; hidden entirely when `workspaces.length === 1`. **Feasibility: reuses existing** (workspaces routes + `activeTenant` wiring). **Decision:** is multi-workspace a real deployment shape, or is single-tenant the 95% case? **MOBILE (verdict missed):** `NavItems` carry a `priority` flag for the mobile bottom bar — project switching on mobile is unaddressed by every rec. **Maps to:** Slack two-tier workspace rail + channel list; Discord server rail.

---

### T5 — Glanceable project progress & status (AI-assisted)

**Current state.** `essential-home.html` is the best T5 artifact: a 6-card grid with colored top border, description, tool-chips, agent avatar stack, a one-line state phrase, and a status pill (`badge-success "3 running"`, `badge-warning "Needs review"`, plain "Idle", `badge-info "Scheduled"`). Above it, ONE authored attention banner ("1 thing needs you — Approve the partner outreach email…"). But the pills are **hand-written copy** — `projects.status` is only `active|archived`, and `workflow_runs`/`campaigns` carry **no `project_id`**. `/api/standup` produces a real persisted report but is **per-agent** (keyed on `tasks.assigned_to`), has no Essential trigger, and is **structured JSON via deterministic SQL — not LLM prose**.

#### Gaps

- **P0 — Per-project status pills are decorative copy, not backed by any project status field.** *(confirmed)* **Law:** Jakob's Law + truthful-status convention.
- **P0 — No AI-generated one-line status, despite a report engine sitting unused.** *(confirmed; but "AI" is product framing over a template — see below)* **Pattern:** BLUF (bottom-line-up-front) / progressive disclosure.
- **P0 — No single "is everything OK across ALL projects?" rollup — only one authored banner.** *(confirmed)* **Law:** Hick's Law / Miller's Law.
- **P1 — "What needs me?" is not prioritized or sorted across the grid.** *(confirmed)* **Law:** Von Restorff (isolation) + Slack unread-first.
- **P1 — Degraded/partial states (one blocked, others running) have no design.** *(confirmed)* **Law:** Visibility of system status.
- **P1 — Full/Admin has no project-granularity status view; status is agent/system-only.** *(confirmed)* **Law:** Jakob's Law (Datadog/Linear per-entity table).
- **P2 — Status freshness is never shown.** *(confirmed)*

#### Recommendations

**R-T5.1 (P0) — Data-driven per-project status pill from real task states.** Replace authored pills with a computed 3-state pill — **Needs you / Working / On track** (plus Idle, Scheduled) — derived from `tasks` already linked by `tasks.project_id`: any `review`/`quality_review` or `priority='urgent'`/blocked-metadata task ⇒ Needs you; any `in_progress` ⇒ Working; else On track/Idle.

```
│ Series B Outreach        ●chart2 │
│ (C)  1 waiting for you  ⟨Needs you⟩│  ← .badge-warning + .dot-warning
```
*Spec:* one pill max per card; pill word ≤2 tokens, `--text-xs` (13px metadata exception). **Feasibility: reuses existing** — `GET /api/projects` already joins `tasks` via `tasks.project_id`; extend with `COUNT(CASE status…)`, no new table. **STATE-MODEL CAVEAT (verdict missed):** `tasks.status` has **no `blocked` value** (`inbox/assigned/in_progress/review/quality_review/done`) — "blocked" is a `priority='urgent'` OR `metadata LIKE '%blocked%'` string-match, so a single task can never be both `in_progress` AND `blocked`; the partial/degraded rec works only across *different* tasks. **Maps to:** Linear/Basecamp project status pill.

**R-T5.2 (P0) — Status line per project, written by the standup engine (cached).** A single sentence under each project name: "On track — 3 drafts done, 1 in review." **DEFERRED — needs product + schema decision (verdict: needs-product-decision):** (1) **It is NOT LLM-written** — `/api/standup` is deterministic SQL counts, so v1 is a **template** ("On track — N done, M in review"), upgradeable to model-written later. (2) The engine is keyed by **`tasks.assigned_to` (agent), not `project_id`** — per-project grouping is a different WHERE axis, a deeper rewrite than "add a param." (3) **`standup_reports` PK is `date` only** — storing a per-project summary needs the PK changed to `(date, projectId)` or a new table. Never call an LLM on render — read the persisted summary; regenerate on cron + on-demand. **Maps to:** Basecamp automatic check-ins / Linear project updates.

**R-T5.3 (P0) — Cross-project "Everything OK?" strip at top of Home.** Promote the authored banner into a computed rollup: "✅ All 9 projects on track" OR "⚠ 2 projects need you · 1 blocked", count links to a filtered view.

```
┌──────────────────────────────────────────────┐
│ ⚠  2 projects need you · 1 blocked   [Show me]│  ← warning left-border card
└──────────────────────────────────────────────┘
All-green: green border, '✅ All 9 projects on track', NO button (calm).
```
*Spec:* `.card` + semantic left border; single line, `tabular-nums`; `[Show me]` sorts the grid by severity. **Feasibility: reuses existing** — pure FE composition over the R-T5.1 counts. **EMPTY STATE (verdict missed):** specify what the strip says with 0 active projects / when standup has never run. **Maps to:** Slack "All caught up" / Linear inbox-zero.

**R-T5.4 (P1) — Severity-first grid ordering + a quiet "Needs you" lane.** Float Needs-you/Blocked cards to top-left with a `--warning` left border; hide the "NEEDS YOU" header when empty. **Feasibility: reuses existing** — FE sort (note: `GET /api/projects` hard-sorts by name, so reorder client-side). **Maps to:** Slack unread-first / Gmail Priority Inbox.

**R-T5.5 (P1) — Full/Admin per-project status table.** Columns: Project · Status · In-prog/Review/Blocked counts · Last run result · Owner agents · Cost today. **SPLIT (verdict: needs-product-decision):** task-derived columns are real now; the **Last-run-result column is infeasible today** (`opzava_runner_jobs` keyed by `workflow_run_id`, `opzava_campaigns` by `campaign_id` — **neither carries `project_id`**, and they live in **separate migration systems**). Ship task columns first; gate the run column behind the FK. **Maps to:** Linear project table / Datadog service list.

**R-T5.6 (P1) — Partial/degraded card state.** Dominant pill + a small inline blocker chip ("Working" + "1 blocked") instead of all-or-nothing. **Feasibility: reuses existing** — same per-project task counts. **Maps to:** GitHub checks "some checks failing" / PagerDuty.

**R-T5.7 (P2) — Status freshness cue.** *(overstated → split)* Freshness **text** ("updated 14m ago") is real now (`standup_reports.created_at`). The **live SSE pulse** is **net-new plumbing** — zero panels consume `useServerEvents` and events carry no `project_id` tag. Ship the static age cue; treat the live pulse as a larger effort. **Maps to:** Slack "active 14m ago".

> **Verdict corrections folded in (concrete migration mechanics):** `standup_reports` PK is `date` only; the standup queries join by `assigned_to` (agent) not `project_id`; `tasks.status` has no `blocked` value (string-match heuristic); `workflow_runs` (`opzava_runner_jobs`) and `campaigns` (`opzava_campaigns`) are in **separate** migration systems so a `project_id` FK touches two. **Also missed:** cost-overrun is arguably a top reason a project "needs you" but is omitted from the Essential rollup; the status ramp relies on color (a11y) — the leading word helps but the compound chip + live pulse need explicit non-color / `aria-live` cues; mobile/empty/loading states for the strip + table are unspecified.

---

### T6 — Missed capabilities the redesign hides as jargon dead-ends

**Current state.** The redesign systematically under-surfaces working backends: approvals appear only as a count KPI + a banner; the standup digest is URL-only/gated; artifacts have no browser; campaigns appear only as a notification line; costs appear as a bare number; and the SSE bus has **zero consumers** so every "live" surface is wired to nothing.

#### Gaps + recommendations (deduped against the verdicts)

- **P0 — Approvals action surface missing despite full backend.** *(gap confirmed)* **R-T6.1 — Inline Approval Card** ("Needs you" → preview + Approve/Request changes/Decline) on the Home banner, in My stuff / Approvals, and inline in T1/T2 chat. **ALREADY COVERED:** the transition route **exists** — `POST /api/ops/approvals/[id]/decide` (`{decision, decisionReason}`). **BLOCKER (needs product decision):** `/api/ops/approvals` + `.../decide` are `requireRole('admin')` — Essential owners can't act; relax role or add a project-scoped non-admin endpoint. **EXPIRED/CANCELLED states** (both real statuses) need a non-actionable rendering. **Pattern:** Linear/GitHub PR review.
- **P0 — Daily AI standup digest orphaned (URL-only, gated).** *(gap confirmed)* **R-T6.2 — "Today" digest card** pinned to Overview/Home (3-line summary + per-project status chips; feeds T1). **CORRECTION:** standup is **deterministic SQL counts, no LLM** — the "calm sentence" needs new generation logic (template v1). Reuses `/api/standup` data; per-project grouping = the rewrite from R-T5.2. **Pattern:** Basecamp check-ins / Linear weekly summary.
- **P1 — Artifacts/Outputs have no browse-and-preview surface.** *(gap confirmed)* **R-T6.3 — Outputs gallery** (human type labels + click-to-preview `.drawer`; Essential "Outputs", Full "Artifacts" with `validationStatus`/lineage). **ALREADY COVERED:** the content fetch route **exists** — `GET /api/ops/artifacts/[id]` returns the full `content` (inline JSON), so no new preview endpoint is needed. **BLOCKER:** `/api/ops/artifacts` + `[id]` are `requireRole('admin')` — Essential can't read. **`validation.status='invalid'`** needs a distinct "failed check" rendering. **Pattern:** Basecamp Docs & Files / Notion gallery.
- **P1 — Campaigns surfaced only as a notification line.** *(gap confirmed)* **R-T6.4 — Campaign status strip** on the project page (stage indicator + Run/Approve). **INFEASIBLE AS DRAWN (verdict: infeasible):** there is **no `project_id` on campaigns or workflow_runs** and `projects` links only to `tasks` — "project → latest WorkflowRun status" has **no data path**; needs a new FK / naming convention first. **Pattern:** Linear project progress / CI stage indicator.
- **P1 — Costs exist as a raw number only.** *(gap confirmed)* **R-T6.5 — Plain-language Spend card** ("You've used $X of your $Y budget" + bar + top spender). **Feasibility:** reuses `GET /api/ops/costs` (unified opzava+inherited summary) BUT (a) `/api/ops/costs` is `requireRole('admin')` — Essential can't read; (b) **no weekly-budget config exists** (the "budget" references found are provider rate limits) — needs a new AdminConfig key. **Pattern:** Linear/Vercel usage meters.
- **P0 — SSE bus carries `chat.message`/status but no surface consumes it.** *(gap confirmed — foundational)* **R-T6.6 — Wire the SSE bus** (one shared `useServerEvents` powering live status dots, digest freshness, approval badges, both chat surfaces; a single header connection dot `● live / ◐ reconnecting / ● offline`). Replace `setInterval` polling. **Feasibility: pure wiring** — `use-server-events.ts` + `event-bus.ts` exist, ~25 event types broadcast, **zero** consumers. Add `id:` on emitted events + `Last-Event-ID` handling so reconnect gaps don't drop events. **Pattern:** Slack/Linear realtime presence (push, not poll).
- **P1 — Coordinator routing never composed into an orchestrator surface.** *(gap confirmed; "UI-only" overstated)* This is R-T1.1/R-T1.2. **CORRECTION:** `coordinator-routing.ts` resolves a **single** delivery session per message and has **no** cross-project awareness — a true cross-project orchestrator needs backend context/prompt work, not just a UI surface.
- **P2 — Notifications/mentions infra exists but the surface is unreachable at count 0.** *(gap confirmed)* **R-T6.7 — Reachable Inbox** (always-reachable "My stuff" Essential / "Inbox" Full binding `/api/notifications` + `/api/ops/approvals` + `/api/mentions`; distinct from T1 chat and T3 channels). **ALREADY COVERED:** mark-read **exists** — `PUT /api/notifications`. **This is the ONE ops-adjacent surface Essential can actually read** (`GET /api/notifications` is `viewer`-accessible). **Pattern:** Linear Inbox + Basecamp "Hey!".

> **Verdict corrections folded in — the SYSTEMIC PERMISSIONS WALL (biggest miss):** `requireRole('admin')` blocks `GET /api/ops/artifacts` + `[id]`, `/api/campaigns` + run + approve, `GET /api/ops/costs`, **and** `/api/ops/approvals` + decide. With hierarchy `viewer(0)<operator(1)<admin(2)`, an Essential everyday owner (operator/viewer) **cannot read approvals, artifacts, campaigns, OR costs**. **Four of these recs are audience:both but hard-blocked at the API layer for Essential** — resolve this as **one cross-cutting product decision**, not per-rec footnotes. **Also:** `/api/exec-approvals` (gateway command gating) ≠ `/api/ops/approvals` (artifact sign-off) — the inline card targets the latter; don't conflate. `agent-comms-panel.tsx` (16-role identity map + live tool/trace/safety feed) is a built rich live-status surface with no Essential equivalent — the single richest live capability left unexploited for T5.

---

## 4. Feasibility & dependencies

### Reuses existing capability (name the route/component/entity)

| Rec | Reuses |
|---|---|
| R-T1.1 Ask Opzava anchor | `/api/chat/messages` (`coord:` prefix), `ChatWorkspace` direct-agent path; attention dot ← **`/api/ops/approvals?status=requested`** |
| R-T1.2 Orchestrator screen (rendering) | backend emits `messageType 'text'|'status'|'tool_call'`; SSE `chat.message`; reuse `agent-comms-panel.tsx` event rendering |
| R-T1.5 Offline copy | backend `status` bubbles (offline/failed/processing/error) — FE copy-mapping only |
| R-T2.1 Project assistant thread | `ChatWorkspace` + `message-list/bubble/input.tsx` + `/api/chat/messages` + `/api/projects/[id]/agents` |
| R-T2.3 Approval card (action) | **`POST /api/ops/approvals/[id]/decide`** already exists |
| R-T2.5 Empty-state/truncation fixes | `conversation-list.tsx` / `chat-workspace.tsx` (pure FE) |
| R-T3.1 Three-surface split | `messages` table `conversation_id` prefixes — IA/label change only |
| R-T3.4 `@ You` inbox (most of it) | `/api/notifications`, `/api/mentions`, `/api/activities`, `/api/ops/approvals`; POST path already writes notification + activity |
| R-T3.5 Human/AI badge | **already shipped in `essential-card.html`**; `from_agent` + `/api/team/agents` vs `/api/auth/users` |
| R-T4.1 Persistent PROJECTS section | `ContextSwitcher`/`OrgRow` markup, `activeProject`/`setActiveProject`, `GET /api/projects` |
| R-T4.2 Projects in ⌘K (client) | `store.projects`, `setActiveProject`, `navigateToPanel`, `handleResultClick` |
| R-T4.4 Ungate + breadcrumb | `/api/projects` + `/api/workspaces` allow `viewer`; `activeProject`/`activeTenant` in store |
| R-T5.1 Task-derived pill | `GET /api/projects` (already joins `tasks.project_id`) |
| R-T5.3/5.4/5.6 Rollup/sort/partial | FE composition over R-T5.1 counts |
| R-T6.1 Approval decide | `POST /api/ops/approvals/[id]/decide` |
| R-T6.3 Artifact preview | `GET /api/ops/artifacts/[id]` (inline `content`) |
| R-T6.5 Spend reader | `GET /api/ops/costs` (unified summary) |
| R-T6.6 SSE wiring | `use-server-events.ts` + `event-bus.ts` (zero consumers today) |
| R-T6.7 Reachable Inbox | `GET/PUT /api/notifications` (mark-read exists) |

### Needs new backend / schema / product decision

| Rec | Needs |
|---|---|
| R-T1.3 / R-T5.2 / R-T6.2 digest | **`project_id` link** projects↔Campaign/WorkflowRun (none exists); `standup_reports` PK `date` → `(date, projectId)`; standup WHERE axis `assigned_to` → `project_id`; deterministic template (no LLM in path) |
| R-T1.4 inline actions | action descriptors on the message payload; approve/reject/run wiring; **product call: act autonomously vs propose** |
| R-T2.1 chat scoping | **`messages.project_id` column** (preferred over `conversation_id` convention; T4/T5 need it queryable) |
| R-T2.2 runs/artifacts inline | tag `WorkflowRun`/artifact with `project_id` (or filter by assigned agents) |
| R-T2.3 / R-T6.1 / R-T6.3 / R-T6.4 / R-T6.5 Essential ops | **AUTH WALL — `requireRole('admin')`** on approvals/artifacts/campaigns/costs blocks Essential; one cross-cutting auth-policy decision |
| R-T2.* lead-assistant pick | a `lead` role convention in `project_agent_assignments` (today defaults `member`) |
| R-T3.2 / R-T3.3 human channels | `channels`, `channel_members`, `message.channel_id`, `message.parent_message_id`, `message_reactions`, presence heartbeat; **gated behind `08 §A.11` written case + `§F` conflict resolution** |
| R-T3.4 mention fan-out | parse @mentions → multi-recipient notification rows |
| R-T3.6 search/pins | FTS5 over `messages.content` + `message_pins` + `GET /api/messages/search` |
| R-T4.2 ⌘K backend | ~12-line `project` SQL branch in `/api/search` |
| R-T4.3 attention dot | `project_id` FK on `opzava_approvals` / `workflow_runs` (none today) |
| R-T4.5 per-user pins | a **per-user UI-preferences store** (none exists; `/api/settings` is admin-only + global) |
| R-T4.6 workspace tier | product decision: is multi-workspace a real deployment shape? |
| R-T5.5 / R-T6.4 run column | `project_id` FK across **two** migration systems (`opzava_runner_jobs`, `opzava_campaigns`) |
| R-T5.7 live pulse / R-T6.6 hardening | `project_id` tag on SSE events; `id:` + `Last-Event-ID` |
| R-T6.5 budget | new AdminConfig `weekly_budget` key |

---

## 5. Changes required to existing docs/mockups + proposed new mockups

### Edits to existing docs

| Doc | Change |
|---|---|
| `03-ia-navigation.md` | Split the single `chat`/`sessions` → "Chat" mapping into **three**: `✦ Ask Opzava` (T1, pinned top of CORE), per-project "Ask your assistant" (T2, a project tab — **not** a rail item), and **Messages** (T3, humans only). Add the persistent **PROJECTS** rail section (R-T4.1) and projects-in-⌘K (R-T4.2). Note the CORE Miller's-budget pressure. |
| `07-essential-vs-admin.md` | Replace the one "Messages (`chat`)" row with the three distinct surfaces; add the AUTH-WALL note (approvals/artifacts/campaigns/costs are admin-only — Essential needs a relaxed policy or non-admin endpoints); add the `✦ Ask Opzava` 5th-node §A.11 exception. |
| `08-basecamp-teardown.md` | Resolve the `§F` human-Campfire omission vs the owner's Slack-grade ask (R-T3.2/R-T3.3 gated on this); add `Ask your assistant` (T2) + `Team` (T3) as the two project conversation tabs; define the mobile `§C.4` collapse for the 5th node + 3-pane Messages. |
| `05-mockup-specs.md` | Add specs for the new screens below; add the three new components (MessageList/ChatBubble/MessageComposer) to the inventory. |
| `02-design-system.md` | Add `MessageList`, `ChatBubble`, `MessageComposer` to the component inventory; add `.chat-bubble`, `.chat-bubble--user`, `.chat-tool-card`, `.chat-status-pill`, `.presence-dot` to `app.css`. |
| `04-realtime-networking.md` | Mark these as the **first** `useServerEvents` consumers; add the triple-delivery dedup hazard (poll + SSE + WS) + `id:`/`Last-Event-ID`. |

### Proposed new mockups (`mockups/` naming)

| Filename | Purpose |
|---|---|
| `09-orchestrator-chat.html` | **(P0)** T1 Ask Opzava — coordinator thread with status + `tool_call` bubbles, the proactive cross-project digest, inline actions, and the offline/cold-start states. |
| `10-project-assistant.html` | **(P0)** T2 per-project agent chat — `Ask your assistant` tab with inline action/artifact cards, the project-altitude approval hand-off, and the back-link to Ask Opzava (Essential + Full variants). |
| `11-messages-slack.html` | **(P1, gated)** T3 Full/Admin 3-pane human Messages — channel/DM list · pane · composer · thread drawer (mark clearly as backend-gated). |
| `12-essential-team-room.html` | **(P1, gated)** T3 Essential per-project Campfire-lite "Team" room beside the Assistant tab. |
| `13-mention-inbox.html` | **(P1)** The `@ You` / Inbox surface unifying mentions, AI "needs you" hand-offs, and approvals (Essential "My stuff" + Full "Inbox"). |
| `14-glance-home.html` | **(P0)** T5 redesigned Home — data-driven status pills, the cross-project "Everything OK?" strip, severity-first ordering, the "Today" digest card, and the partial/degraded card state. |
| `15-project-status-table.html` | **(P1)** T5 Full/Admin per-project status table (task-derived columns now; run/cost columns gated on the `project_id` FK). |
| `16-nav-project-switcher.html` | **(P0)** T4 persistent PROJECTS rail section + projects-in-⌘K + the always-visible workspace › project › panel breadcrumb. |

---

## 6. Prioritized roadmap

### Phase A — P0 surfaces over existing backends (no schema, ship first)

1. **R-T3.1** — split the one "Chat" slot into three labeled surfaces (IA/label only). *Unblocks everything.*
2. **R-T4.1 + R-T4.4 + R-T4.2 (client) + ⌘K SQL branch** — persistent PROJECTS rail, ungate `fetchProjects` (+ the coupled tenant effect, + stale-scope validation), projects in ⌘K, the breadcrumb at all breakpoints.
3. **R-T1.1 + R-T1.2** — `✦ Ask Opzava` anchor + the orchestrator screen with the three new components (MessageList/ChatBubble/MessageComposer); attention dot from `/api/ops/approvals?status=requested`.
4. **R-T6.6** — wire the SSE bus (first `useServerEvents` consumers; dedup; header connection dot). *Makes everything above live.*
5. **R-T5.1 + R-T5.3 + R-T5.4** — task-derived status pills, the "Everything OK?" strip, severity-first ordering.
6. **R-T6.7** — the reachable Inbox (the one ops surface Essential can read today).

### Phase B — P0/P1 needing schema or one product decision

7. **Cross-cutting auth decision** — relax `requireRole('admin')` (or add project-scoped non-admin endpoints) for approvals/artifacts/campaigns/costs so Essential can read/act. *Gates R-T2.3, R-T6.1, R-T6.3, R-T6.5.*
8. **`messages.project_id` column** — then R-T2.1 (project assistant chat), R-T2.6 (realtime), per-project unread (T4/T5).
9. **R-T2.2 + R-T2.3 + R-T2.5** — inline work/artifact/approval cards + the Full Conversation tab (after #7/#8).
10. **R-T3.4** — @mention fan-out + the `@ You` inbox (fix the Activity surface first).
11. **R-T1.5** — plain-language orchestrator offline/cold-start states.

### Phase C — P1/P2 needing the `project_id ↔ run/campaign` link + new tables

12. **`project_id` FK on `opzava_runner_jobs` + `opzava_campaigns`** (two migration systems) + `standup_reports` PK `(date, projectId)` + standup project-axis rewrite — then **R-T1.3 / R-T5.2 / R-T6.2** (proactive digest + AI status line + Today card) and **R-T5.5 / R-T5.6 / R-T6.4** (run-aware status table, partial/degraded, campaign strip), and **R-T4.3** (approval/blocked attention dot).
13. **R-T1.4** — inline cross-project actions (after the act-vs-propose product call).
14. **Per-user UI-preferences store** — then **R-T4.5** pinned projects (recents-only ship in Phase A).
15. **Human-messaging product decision (`08 §F`/§A.11)** — if confirmed: `channels`/`channel_members`/`message.channel_id`/`parent_message_id`/`message_reactions`/presence → **R-T3.2 / R-T3.3**, then **R-T3.6** (FTS5 search + pins), **R-T4.6** (workspace tier).
16. **R-T5.7** — live status pulse (after SSE events carry `project_id`).

> **Cross-cutting, every phase:** specify mobile (`§C.4` collapse) and the four async states (`§A.10`: loading / empty / error / offline) for each new surface; keep the one-accent rule and the 15px floor; AI-vs-human is glyph + label, never color.
