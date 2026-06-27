# 12 — Linked Tools Health & the Connect Wizard ("Your tools")

> **⚠ AMENDED — OpenClaw / Hermes are SERVER-ONLY.** This doc originally framed all **7** tools as
> laptop-linked. Per the two-plane split (`gateway-setup.md` / CONTEXT.md / ARD 0012 amendment): the
> **connect wizard** and the laptop "Your tools" surface cover only the **5 local-plane clients**
> connected from the operator's own machine — **Claude Code, OpenCode, Codex CLI, Codex Desktop,
> Claude Desktop**. **OpenClaw and Hermes run server-side only** (the deploy-host fleet, by-file auth);
> they are **not** connected via this laptop wizard and surface separately as **server fleet / gateway
> status** (admin-config). The 7-tile picker, the "Run a fleet" group, the "5 of 7" count, and the
> mockups (`essential-tools.html`, `essential-connect-wizard.html`) below still reflect the old
> 7-tool model and need a resync pass to drop OpenClaw/Hermes from the laptop wizard.

> **Scope.** This document designs **one new Essential surface** — **"Your tools"** — a calm health-check for the user's linked terminal/agent tools (Claude Code, OpenCode, Codex CLI, Codex Desktop, Claude Desktop, OpenClaw, Hermes), plus the **modern, calm connect wizard** that links the first (and every subsequent) tool. The user must SEE at a glance that their linked tools are connected and healthy; if **none** are linked yet, a wizard guides them to connect their first one.
>
> The surface is a calm Basecamp adaptation built **entirely** on the existing contract (`tokens.css` + `app.css` + `shadcn.css`) and the established mockups. It is the **calm inversion** of the admin `monitoring-health.html`, which is the Full/admin view and uses exactly the traffic-light pattern (`dot-success`/`dot-warning`/`dot-danger` + colour-coded latency) that the Essential design law forbids. We reuse that page's *structure* (card + rows + collapsible log) and replace its *colour-only status* with **label + glyph**.
>
> This document is the design spec; the mockups (`§9`) are the contract a developer implements (`08 §A.1` — *Interface First*).

---

## 1. Goal & verdict

**Goal.** A calm place to answer one question — *"are my tools connected and working, and if not, what do I do?"* — without a dashboard, a KPI wall, or a traffic light. And, when nothing is linked, a **modern wizard** that gets a semi-technical user from zero to a verified connection in roughly *two clicks and one paste*.

**Verdict — the four headline decisions:**

1. **One surface, named "Your tools"** (not "Connections", not "Integrations") — a single calm page rendered in the Essential shell (`data-theme="calm"`). It is reached two ways: a **glance line on Home** and a durable **"Your tools" item in the avatar/account menu**. It is **NOT** a topbar pill and **NOT** a primary-nav item.
2. **A five-state, glyph-led status vocabulary** — `✦ Active · ● Connected · ◐ Degraded · ○ Disconnected · ＋ Not linked` — where the **glyph carries the meaning, the word confirms it, and `--accent` (indigo) marks only the ONE tool that needs you.** No red/amber/green health.
3. **A per-tool row** built on the proven Tailscale/1Password device-row anatomy: `[glyph avatar] [name + how-it-connects] [status badge] [last-seen, only when stale] [⋯ menu]`. Connected tools are visually **quiet**; the one tool needing a hand is the only accent on the page (Von Restorff).
4. **A 4-step connect wizard in an `sb-dialog`** — *Pick a tool → Pick a method (auto-skipped when there's only one) → Copy the real command → Live-verify* — reused **verbatim** for both the empty-state hero and "Connect another". Verify **auto-detects** the first heartbeat for live-agent/gateway tools and uses an **honest manual `claude mcp list` confirm** for MCP (which has no server-side health endpoint).

**The single most important discipline:** the chrome stays navigation-only and the *page* carries the news — exactly the Basecamp move already proven in `essential-home.html`. Holding that line (no second status pill next to the bell) is the load-bearing IA decision.

---

## 2. Reference teardown — what the best products do, translated to "sb-*"

Every row traces to a named precedent and lands on an existing class. The dominant, repeated pattern across all of them: **glyph + label row · presence-implied heartbeat · relative last-seen · one-click reconnect · catalog → connect → auto-verify modal wizard.**

| Pattern | Best-in-class precedent | What we borrow | Maps onto |
|---|---|---|---|
| **Per-tool row** | Tailscale device list · 1Password "Devices & sessions" · Stripe connected accounts | `[glyph] [name + identity sub-line] [state word] [last-seen ONLY when stale] [⋯]`; presence *implies* the heartbeat so connected rows show no timestamp | `.service-row` + `.service-name` + `.service-latency` (de-coloured) |
| **Status = glyph + word** | Tailscale (filled/hollow dot **always** paired with a word) | The dot is never alone; the word always present | `.sb-badge` (secondary/outline/accent), never bare `.dot-*` |
| **One "is it on" glance** | Docker Desktop bottom-left "Engine running" chip · Tailscale menubar tick | ONE plain-language summary line, no grid of coloured tiles | `.health-pill` (restyled to label+glyph) + Home glance line |
| **Last-seen heartbeat** | Tailscale "Last seen" · 1Password "Last used" · ngrok/cloudflared uptime | Relative muted mono; **absolute on hover**; shown only for stale items | `.u-subtle .u-mono` `--text-xs` + `.sb-hovercard` |
| **One-click reconnect** | Docker "Restart" · Tailscale "Reconnect" · cloudflared "run this command" | Fix is one click from the unhealthy row; raw diagnostic hidden until asked | `.btn-ghost.btn-sm` + `<details>` (the `.error-details` block) |
| **The exact re-link command** | cloudflared/ngrok offline tunnel → verbatim re-run line | Since tools connect via MCP/CLI/REST, the fix is literally a shell line — show it | the new `.sb-copy` block + `.sb-alert` (neutral) |
| **Connect catalog** | Vercel/GitHub integrations marketplace (grouped) | A grid of tool cards grouped by connect method | `.type-grid` + `.type-card` radiogroup (from `essential-new-project.html`) |
| **Connect = paste a token/command** | Linear/Slack "Add integration" · GitHub "install the app" | Copy the exact command with `MC_URL`/`MC_API_KEY` pre-filled | `.sb-copy` (built on the `.sb-term` dark surface) |
| **Auto-detect verify** | Tailscale/Docker/ngrok onboarding | Wizard **waits** and flips `spinner → ✓ Connected` on first heartbeat | `.sb-spinner` → `.sb-alert--success` (momentary) |
| **Empty-state-first** | Basecamp ("the empty state is the most important screen") · Vercel empty integrations | `.empty` block + ghost preview → single primary CTA launches the wizard | `.empty` + `.ghost-preview` |
| **Per-row ⋯ menu** | 1Password device menu | Reconnect / Rename / Disconnect / Copy command on demand | `.sb-menu` + `.sb-menu-item` |

**Do NOT clone** `monitoring-health.html`: its `dot-success`/`dot-warning`/`dot-danger` rows and colour-coded latency text are the traffic light the law forbids. Reuse the *skeleton*, drop the *colour*.

---

## 3. Information architecture & the glanceable indicator

### 3.1 The decision matrix

| Option | Verdict | Why |
|---|---|---|
| **(a) Persistent topbar status pill** | ❌ **REJECT** | Would be the **first STATUS element** in the Essential chrome; the 60px topbar already carries ~12 targets (logo + 6 nav + theme + New project + bell + avatar). Tool health is low-frequency (connect once, forget). Duplicates the bell's needs-you role and sets a precedent for more pills (costs, agents, gateway). |
| **(b) Home "Your tools" glance line** | ✅ **RECOMMEND (primary glance)** | `essential-home.html` already ships this exact shape — the cross-project rollup `2 projects need you · 1 blocked` (dot + label + "Show me"). Tool health is the same shape of information; it belongs in the same Home column, just below that rollup, reusing the identical component so it reads as one calm family. |
| **(c) Dedicated "Tools" topnav item** | ❌ **REJECT** | The 5–6-item topnav is for **daily** destinations; tool health is consulted rarely (setup, or when something breaks). Jakob's Law cuts the other way — users expect "connected tools" in **account/settings**, not primary product nav. |
| **(d) Avatar / account-menu "Your tools"** | ✅ **RECOMMEND (durable doorway)** | The avatar is already an account-menu target. Add a `.sb-menu-item` "Your tools" — where users instinctively look for "what's connected to my account", and **always reachable** even from pages with no Home glance. Carries a trailing `.dot.dot-accent` only when something needs you. |
| **(e) Combination of (b) + (d)** | ✅ **THE ACTUAL RECOMMENDATION** | One glance surface (Home), one durable entry (avatar menu), one detail page. Explicitly **NOT** (a) or (c). Chrome stays at its current weight; the user can both SEE health (Home) and FIND it on demand (avatar). |

**Reserved escalation (the one allowed chrome touch):** if a tool goes unreachable while the user is *not* on Home, route the needs-you signal through the **existing bell** (`essential-home.html` line 53) — *"Codex CLI lost its connection — reconnect"* — never a new tools pill. One inbox for all needs-you concerns.

### 3.2 Why the name is "Your tools"

| Candidate | Verdict |
|---|---|
| **"Your tools"** | ✅ Calmest, most human, possessive Basecamp phrasing (sits with "My stuff" / "Your projects"). Scopes to the user, covers the mixed bag (CLIs, desktop apps, gateway runtimes) without naming the transport. |
| "Connections" | ❌ Already taken by the admin/Full settings sub-nav (`settings.html`) for provider plumbing (WordPress, Resend, gateways). Reusing it in Essential collides and leaks jargon. |
| "Integrations" | ❌ Developer jargon; fails the jargon-free Essential directive. |
| "Workspaces" | ❌ Means projects in Basecamp/Opzava. |
| "Linked tools" | ❌ Accurate but stiff. |

### 3.3 The glance line — exact content per state

The Home glance reuses the `.card` + flex-row from `essential-home.html` lines 63–67. **Neutral** border for healthy; `var(--accent)` left-border only for needs-you.

- **Healthy** (all linked, all reachable) — neutral, no accent:
  `[🔗] Your tools — 5 connected, all reachable` · right-aligned ghost **Manage** button. Count chip = plain `.badge` (no colour).
- **Needs you** (one or more unreachable / auth expired) — the single accent moment, mirrors the projects rollup:
  card with `border-left:3px solid var(--accent)` + `.dot.dot-accent` + `Your tools — 1 needs you` · muted detail *"Codex CLI lost its connection — reconnect to keep its tasks running."* · **Show me** button (deep-links to that tool's row anchor). The count flips `5 connected → 1 needs you` so the delta itself is the signal.
- **Empty** (zero linked) — the wizard entry point, a calm blank-slate row in the same slot:
  *"Connect a tool to get started"* + one sentence + ONE primary **Connect a tool** button that opens the wizard. **No 7-logo grid on Home** — the wizard owns the choice.

---

## 4. Status convention — the five health states

Every state is a **GLYPH + LABEL** pair carried in a **neutral** `.sb-badge`; `--accent` is reserved for the SINGLE "needs you" meaning. Discrimination lives in the **glyph shape** (`✦ ● ◐ ○ ＋`) — legible in greyscale, to colour-blind users, and at small sizes — so the convention works with **zero colour**. There is **no red-bad / green-good axis**: a closed CLI (`○`) and a busy CLI (`✦`) are equally calm.

| # | Glyph | Label | When | Badge | Accent? | `.live` pulse? |
|---|---|---|---|---|---|---|
| 1 | **✦** | **Active** ("Working now") | Connected **and** an in-flight session/run/heartbeat in the last ~30s (Claude Code mid-task, Hermes executing) | `.sb-badge--secondary` | only if *this* tool currently holds your attention | ✅ **the only state allowed the pulse** (`.live`, reduced-motion-safe) |
| 2 | **●** | **Connected** | Linked, healthy handshake, no in-flight work, heartbeat fresh (< ~2 min CLI / ~5 min desktop). The **resting** state — must be visually quietest. | `.sb-badge--secondary` (glyph in `--fg-subtle`) | no | no |
| 3 | **◐** | **Degraded** ("Slow"/"Limited") | Reachable but unhealthy: p95 over threshold, partial capability, repeated retry-then-success, version mismatch. Informational, not a call to action. | `.sb-badge--secondary`; optional thin `.banner-warning` left-border on the *detail* callout only | no | no |
| 4 | **○** | **Disconnected** | Heartbeat missed past threshold / transport dropped / process exited. An intentionally-closed CLI is **not** an error. Always shows relative *last seen* + a **Reconnect** affordance. | `.sb-badge--outline` | only if it crossed into **blocking** an in-progress user task — then the **label** becomes *"Needs you · reconnect"*, not the colour | no |
| 5 | **＋** | **Not linked** ("Connect") | A known-supported tool the user hasn't connected, or setup started but unconfirmed. | `.sb-badge--accent` (or a `.btn-primary` "Connect") | ✅ **the only inherently-accent state** — it is a needs-you / primary affordance. Mid-setup → swap glyph for `.sb-spinner` "Finishing setup…" | no |

**Why this is not a traffic light** (state it explicitly in the build): the neutral chip is the **same** for Active/Connected/Degraded/Disconnected — only the glyph + word differ; `--accent` appears on at most the rows that want a human hand. This directly inverts `monitoring-health.html`'s colour-coded status text.

**Rollup logic (N tools → 1 header label), worst-needs-you wins but stays calm:**
- any **Not-linked-blocking** or **Disconnected-blocking** → `{name} needs you` in `--accent` (the single accent moment).
- else **zero linked** → empty-state CTA (`§6`).
- else **all Connected/Active, none degraded** → `{n} tools · all connected` with one neutral `●`.
- else (some degraded / quietly disconnected, nothing blocking) → factual split `{a} connected · {b} need attention`, neutral, list one click away.
Count is `tabular-nums` (`.u-tnum`) so the number reads instantly.

**Accessibility:** glyphs are `aria-hidden`; the human label is the accessible name (`aria-label="Claude Code: Connected, seen 3 minutes ago"`). State changes announce through a `role=status aria-live=polite` region; only a tool crossing into **blocking** may use `aria-live=assertive`. Human-read labels stay at the **15px floor** (`--text-sm`); only metadata (version, last-seen, transport tag) may use `--text-xs` (13px).

---

## 5. The per-tool catalog (the seven)

The seven tools group by **how they connect**, which doubles as the wizard's Step-1 grouping. AI-runtime vs desktop-app is shown by **avatar shape** (`.sb-avatar--ai` rounded-square + `✦` vs plain circle), never by colour.

| Tool | Glyph | Group / connects via | Wizard method(s) | Avatar | Illustrative state |
|---|---|---|---|---|---|
| **Claude Code** | ▮ | On your computer · MCP (default) or Live agent | MCP · Live agent | `--ai` | **✦ Active** — running a deploy step |
| **OpenCode** | ▮ | On your computer · Live agent (generic adapter); MCP optional | Live agent · MCP | `--ai` | **● Connected** — seen 3m ago |
| **Codex CLI** | ▮ | On your computer · MCP or Live agent | MCP · Live agent | `--ai` | **◐ Degraded** — slow (p95 1.8s) |
| **Codex Desktop** | ▢ | Desktop app · MCP (`mcp_servers` config) | MCP *(single → Step 2 skipped)* | plain circle | **○ Disconnected** — last seen 2h ago · Reconnect |
| **Claude Desktop** | ▢ | Desktop app · MCP (config JSON) | MCP *(single → skipped)* | plain circle | **● Connected** — seen just now |
| **OpenClaw** | ◇ | Run a fleet · Gateway (WebSocket / adapter) | Gateway *(single → skipped)* | `--ai` | **＋ Not linked** — Connect |
| **Hermes** | ◇ | Run a fleet · Gateway runtime | Gateway *(single → skipped)* | `--ai` | **✦ Active** — fleet executing |

**Row anatomy (the canonical Essential surface)** — reuse `.service-row` geometry (44px, `gap:--space-3`), de-coloured, left→right:
`[.sb-avatar glyph] · [.service-name = tool name + .u-subtle .text-xs "via MCP"/"via CLI"/"via Gateway"] · [status .sb-badge = glyph+label] · [.u-grow spacer] · [.u-subtle .u-mono --text-xs "v1.8.2 · seen 3m ago", shown only when stale] · [one contextual action: Reconnect / Connect / Open] · [⋯ .sb-menu]`. Capability detail ("Can: run tasks, edit files, read repo") lives behind an `.sb-hovercard` or the detail drawer — progressive disclosure, available-not-present.

**Reconnect / troubleshoot** is two-tier: (1) inline `.btn-ghost.btn-sm` **Reconnect** on the row; (2) admin-gated `<details>` "Technical details" (the `.error-details` block) revealing the **verbatim re-link command** — `claude mcp add opzava -- node /abs/path/scripts/mc-mcp-server.cjs` or `pnpm mc …` — in a `.sb-copy` block with a copy button, framed by a neutral `.sb-alert` (never `--destructive`).

---

## 6. The empty state (zero linked) → the wizard hand-off

The most important screen (Basecamp doctrine). Reuse `.empty`:

- `.empty-icon` = `🔌` (raw emoji, no icon lib)
- `.empty-title` = **"Connect your first tool"**
- `.empty-desc` = *"Link Claude Code, Codex, OpenCode, or another tool so Opzava can run tasks and keep an eye on them for you."* (jargon-free, outcome-framed — never "No MCP clients registered")
- `.empty-cta` = a single `.btn.btn-primary` **"Connect a tool →"**

Below the CTA, the `.ghost-preview` (opacity .45, `pointer-events:none`) shows 2–3 faux connected rows captioned *"— Your linked tools will look like this —"*, selling the payoff without a KPI wall. **One** primary action; the catalog lives one click deeper, inside the wizard.

---

## 7. The connect wizard (step-by-step)

A **4-step linear wizard inside one `sb-dialog`** (width override 560px, `max-height:88vh`, inner body scrolls), reused **verbatim** for the empty-state hero CTA and the quiet `＋ Connect another` on the populated list. A modal keeps the user in place (Jakob's Law, calm-first) — never a multi-route flow. Focus is trapped, Esc closes, focus restores to the launching button, `role=dialog` + `aria-labelledby` → step title, and an `aria-live=polite` region announces step changes and the verify result.

**Step chrome:** a thin 4-dot stepper (`.dot`, 10px) — active = `.dot-accent` + label; complete = `✓` glyph; upcoming = plain `.dot`. The step label sits beside the dots at `--text-xs` ("Step 2 of 4 · Choose how to connect"). Footer = `.sb-dialog-footer`: left **Back** (`.btn-ghost`, hidden on step 1), right **one** `.btn-primary` whose label changes per step. **Exactly one `btn-primary` per step.**

| # | Step | What it shows | Components |
|---|---|---|---|
| **1** | **Pick a tool** | The 7 tools as a radiogroup grid, grouped under two soft headings — **"On your computer"** (Claude Code, OpenCode, Codex CLI, Codex Desktop, Claude Desktop) and **"Run a fleet"** (OpenClaw, Hermes). Each tile = glyph + name + one-line desc + method chips. Selection shown by **border + corner ✓**, never a colour fill. No search box — seven fit on one calm screen. | `.type-grid` + `.type-card` radiogroup + `.type-check` ✓ (verbatim from `essential-new-project.html`); `.np-section-label` group headers |
| **2** | **Pick a method** *(conditional — auto-skipped when a tool has one method)* | Per-tool methods as stacked radio rows, each with a plain-language gloss: **MCP** ("Give the tool Opzava's abilities"), **Live agent** ("Show it here and let it pick up work"), **Gateway** ("Manage a fleet of agents"). A *"Not sure? Most people want X"* hint points at the recommended default. Single-method tools (Codex Desktop, Claude Desktop, OpenClaw, Hermes) skip this step but the stepper still reads 4 dots. | `.sb-tabs`/`.sb-tab` or stacked radio rows |
| **3** | **Copy the command** | (a) a one-sentence plain gloss of what it does; (b) the **`.sb-copy`** block — the verbatim command in the dark `.sb-term` surface with a pinned **⧉ Copy** button (`→ ✓ Copied` for ~1.6s, `aria-live` announce); (c) a collapsed `<details>` "What this command does, line by line". **Real** commands, `MC_URL` pre-filled from the live origin, a "paste your API key" field injecting the real key (no hardcoded secrets). Placeholders (`<abs-path>`, `<pick-a-name>`) render dimmer with a "Replace <…>" note. A third tab *"Let the assistant wire itself"* copies the ready-made LLM install prompt — the lowest-friction path. Desktop apps swap the command block for a neutral `.sb-alert` with plain steps + an **Open app** button. | `.sb-copy` (new) + `.btn-ghost.btn-sm` + `<details>` + `.sb-tabs` for command variants |
| **4** | **Live-verify** | A single status line, glyph + label + subtext. **Waiting** → `◌` + `.sb-spinner` *"Waiting for handshake… this updates the moment your tool checks in."* **Connected** → `✓ Connected` headline (a **momentary** `.sb-alert--success` is the *one* allowed celebratory green) + *"Claude Code is linked and showing in your tools."* + **Done**. **Still quiet after ~60s** → `◑ Still waiting` + a calm **non-destructive** `.sb-alert` with two un-blamey checks + a "Show troubleshooting" `<details>`. **Honest verification per method:** Live agent → poll `GET /api/connect` (or `GET /api/status?action=health`, 120s staleness); Gateway → poll `POST /api/gateways/health`; **MCP → does NOT auto-poll** (stdio subprocess, no health endpoint) — it shows *"Once it's added, run `claude mcp list` to confirm Opzava is connected"* + a manual **"I've confirmed it"** button. **Never fake an MCP handshake.** | `.sb-spinner` + `.sb-alert` / `.sb-alert--success` |

On success the dialog auto-advances to a single confirmation line; **Done** closes and drops the user back to the now-populated list where the new tool shows the neutral **`● Connected`** badge (the green is *not* persistent). Default path is opinionated — recommended method pre-selected, `MC_URL` pre-filled, the "let the assistant wire itself" shortcut — so a semi-technical user finishes in two clicks + one paste. Everything advanced lives behind `<details>`.

---

## 8. shadcn / sb-* component map

| Surface element | Existing class (reuse) | New? |
|---|---|---|
| Glance line (Home) | `.card` + flex row from `essential-home.html` 63–67; `.dot`/`.dot-accent`; `.badge` (healthy) / `.sb-badge--accent` (needs-you) | — |
| Header glance pill | `.health-pill`, restyled to label+glyph (`✓ 5 of 6 connected` / `◎ 1 tool needs you`) — **drop** the coloured `.dot`; no `.live` here | — |
| Avatar-menu entry | `.sb-menu` + `.sb-menu-item` (+ trailing `.dot.dot-accent` when needs-you) | — |
| Per-tool row | `.service-row` + `.service-name` + `.service-latency` (de-coloured) | — |
| Tool avatar | `.sb-avatar` / `.sb-avatar--ai` (✦), shape = runtime vs desktop-app | — |
| Status badge | `.sb-badge--secondary` / `--outline` / `--accent` — **never** `--success`/`--warning`/`--destructive` for persistent status | — |
| Status atom (glyph+label+meta) | — | **`.sb-statusline`** (`inline-flex; gap:6px; align-items:baseline`) — one consistent atom for rows & cards |
| Last-seen / hovercard detail | `.u-subtle .u-mono` `--text-xs` + `.sb-hovercard` / `.sb-hc` | — |
| Verifying affordance | `.sb-spinner` / `--sm`; first-load `.skeleton` / `.sk-line` | — |
| Empty state | `.empty` / `.empty-icon` / `.empty-title` / `.empty-desc` / `.empty-cta` + `.ghost-preview` | — |
| Wizard frame | `.sb-overlay` / `.sb-dialog` (→560px) / `.sb-dialog-footer` | — |
| Wizard stepper | `.dot` / `.dot-accent` rail | **`.sb-steps`** (optional richer vertical rail: done-circle + current ring) |
| Step-1 tool picker | `.type-grid` / `.type-card` / `.type-check` + `select()` JS | — |
| Step-2 method choice | `.sb-tabs` / `.sb-tab` or stacked radio rows | — |
| Step-3 command block | `.sb-term` surface + `.btn-ghost.btn-sm` copy | **`.sb-copy`** (mono command block + copy button) |
| Step-4 verify | `.sb-alert` (default) / `.sb-alert--success` (momentary) + `.sb-spinner` | — |
| Reconnect / troubleshoot | `.btn-ghost.btn-sm` + `<details>` `.error-details` + neutral `.sb-alert` | — |
| Per-row ⋯ menu | `.sb-menu` / `.sb-menu-item` (Reconnect / Rename / Disconnect / Copy command) | — |
| Breadcrumb / page frame | `.sb-breadcrumb` ("Home › Your tools") + `.page-header` | — |
| Admin Full-view table + log | `.table` + collapsible `<details>` / `.log-area` (de-coloured, gated) | — |

**Exactly three new small components** (sb-prefixed, ~50 lines total): **`.sb-steps`**, **`.sb-copy`**, **`.sb-statusline`**. Everything else maps onto existing classes — resist inventing parallels.

**Glyph legend (raw only, no icon lib):** `✦` Active / AI-runtime · `●` Connected · `◐` Degraded · `○` Disconnected · `＋` Not linked · `◎` needs-you (accent rollup) · `◌` waiting · `◑` quiet · `⧉` copy · `🔌` empty-state · `🔗` glance-line.

---

## 9. Build plan

### 9.1 Mockup files (Essential, `data-theme="calm"`)

| File | Purpose |
|---|---|
| `mockups/essential-tools.html` | The **populated** "Your tools" surface: `.health-pill` glance + the 7 tools as `.service-row`s across the five states (Active/Connected/Degraded/Disconnected/Not-linked), each with status badge, stale-only last-seen, Reconnect/⋯, and one admin `<details>` re-link command. Includes the `＋ Connect another` header button that opens the wizard. |
| `mockups/essential-tools-empty.html` | The **zero-linked** empty state: `.empty` (🔌 + "Connect your first tool" + one sentence + primary CTA) + `.ghost-preview` of faux connected rows. CTA opens the wizard. |
| `mockups/essential-connect-wizard.html` | The **4-step wizard** in an open `.sb-dialog`, shown across its steps: (1) tool picker grid grouped "On your computer" / "Run a fleet"; (2) method choice; (3) `.sb-copy` command block + "wire itself" tab; (4) live-verify (waiting / connected / still-quiet variants). Demonstrate the MCP manual-confirm vs live/gateway auto-poll honesty. |

### 9.2 What to reuse (no new primitives beyond the three)

- **Shell:** copy the `.bc` / `.topbar` / `.topnav` / `.bc-wrap` calm shell verbatim from `essential-home.html` (`data-theme="calm"`, all three stylesheets linked, `theme-toggle.js`).
- **Rows:** `.service-row` skeleton from `monitoring-health.html`, **de-coloured** (drop `dot-success`/`dot-warning`, drop coloured latency).
- **Wizard Step 1:** `.type-grid` / `.type-card` radiogroup + `select()` JS from `essential-new-project.html`.
- **Empty + ghost:** `.empty` + `.ghost-preview` from `essential-blank-slates.html`.
- **Dialog / spinner / alert / badge / avatar / menu / breadcrumb:** straight from `shadcn.css`.

### 9.3 New CSS to add (to `shadcn.css`, ~50 lines)

```
.sb-steps / .sb-step / .sb-step[aria-current=step]   — vertical wizard rail (accent done-circle + current ring)
.sb-copy                                             — mono command block on the .sb-term surface + pinned copy btn
.sb-statusline                                       — inline-flex glyph+label+meta atom, reused in rows & cards
```

### 9.4 Wiring (when this leaves mockup → product)

- **Glance line + avatar entry:** render the Home glance from the same rollup endpoint that backs the projects rollup; add the `.sb-menu-item` "Your tools" to the existing account menu.
- **Status source:** bind each tool's `{ok, message, last_heartbeat}` (live agent → `GET /api/connect` / `GET /api/status?action=health`, 120s staleness in `connectivity-health.ts`; gateway → `POST /api/gateways/health`; MCP → no server health, manual). `ok` → `●`/`○` glyph; `message` → the hovercard / meta line.
- **Wizard verify:** auto-poll live/gateway; manual `claude mcp list` confirm for MCP. Prefill `MC_URL` from the live origin; inject the real API key from Settings (no hardcoded secrets).
- **Escalation:** off-Home needs-you events route through the existing bell/notifications, not a new pill.

### 9.5 Gallery

Add the three pages to `mockups/index.html` under a new **"Your tools"** group, and capture `thumbs/` for each (matching the existing thumbnail convention).

---

## 10. Rejected for calm (and exactly why)

| Rejected | Why it breaks the contract |
|---|---|
| **Persistent topbar tools pill** | First STATUS in the chrome; crowds the 60px bar; duplicates the bell; sets a pill precedent. Chrome = navigation only. |
| **A "Tools" primary-nav item** | Over-weights a rarely-visited maintenance surface in the calm daily nav. |
| **Traffic-light health** (`dot-success`/`-warning`/`-danger`, colour-coded latency) | The exact `monitoring-health.html` pattern the law forbids. Status = label + glyph; `--accent` only for needs-you. |
| **`warning-soft` full-row tints / KPI stat-grid / sparklines** | The dashboard wall — `monitoring-health.html`'s stat-grid belongs to Full-view only. Essential is calm at-a-glance status. |
| **`--success`/`--warning`/`--destructive` badges for persistent status** | Manufactures a red/amber/green wall. Success-green allowed **only momentarily** at the wizard's terminal "Connected". |
| **Mapping offline → red** | An intentionally-closed CLI is not an error; red breaks the one-accent rule. |
| **Per-row spinners flickering on every poll** | Show one "last checked Ns ago" beside the summary instead. |
| **Overusing the `.live` pulse** | Reserved for genuinely streaming (Active) connections — heartbeat, not per-second pulse — or it stops meaning anything. |
| **Jargon empty state** ("No MCP clients registered") | Fails jargon-free Essential. Outcome-framed plain language only. |
| **A 7-logo grid on Home / a full-page multi-route wizard** | Choice paralysis + breaks calm-first. One sentence + one CTA on Home; one modal stepper owns the choice. |
| **Auto-revealed raw error logs / endpoints inline** | Gate behind the admin `<details>` `.error-details` disclosure. |
| **Faking an MCP handshake in verify** | MCP is a stdio subprocess with no health endpoint — honest manual `claude mcp list` confirm; auto-poll only live/gateway. |
| **Icon library / SVG status icons** | Raw Unicode glyphs/emoji only (no-icon-lib rule). |
| **Naming it "Connections" / "Integrations" / "Workspaces"** | Collides with admin settings / leaks jargon / means projects. "Your tools" only. |
| **More than three new components** | `.sb-steps`, `.sb-copy`, `.sb-statusline` only — everything else maps to existing classes. |
| **Any human-read label below the 15px floor** | Only metadata (version, last-seen, transport tag, step counter) may use `--text-xs` (13px). |

---

## 11. Addendum — the persistent status bar (user-requested, 2026-06-24)

§3.1 deliberately kept the chrome **navigation-only** and rejected a persistent topbar pill. After review the user asked for an **always-on, glanceable** indicator on *every* page — "see what's connected/healthy without opening Your tools." Resolved without breaking the calm by choosing a placement the original matrix didn't consider: a **slim bottom status bar (IDE / terminal style)** — chosen by the user over a top sub-bar and an in-topbar pill.

- **Why bottom wins:** it keeps the calm Basecamp **top** untouched (no second top bar, no crowded chrome), it is the proven ambient-status convention (VS Code / terminals / Linear), and it is thematically apt — these *are* terminal tools.
- **Anatomy (`tools-bar.js`, injected on all 37 app pages like `theme-toggle.js`; excluded from `index.html`, `style-guide.html`, and `essential-tools-empty.html`):** a fixed 40px bar — `🔗 5/7 connected` rollup · a `tb-sep` · the **seven tool chips** (`glyph + name`, the status glyph leading) · spacer · `Your tools →`. Everything links to `essential-tools.html`. The script adds `padding-bottom` to `body` so content always clears it; theme-adaptive via tokens.
- **Same law, no new exceptions:** status is the **glyph** (`✦ ● ◐ ○ ＋`), quiet greyscale; the single `--accent` marks **only** the needs-you chip (OpenClaw `＋ Not linked`). No traffic light, no per-tool colour. On narrow screens chip names hide (glyph-only) then the chip strip collapses, leaving the rollup.
- **Relationship to §3:** this is **additive**, not a replacement — the Home glance line and the avatar-menu doorway remain; the bar is the *ambient* third surface. The earlier "no persistent chrome" stance is now scoped to "**no persistent chrome at the top**".

---

## 12. Bottom-bar popover + animated health dots — consensus (2026-06-24)

After §11 shipped the slim bottom status bar, the user raised two refinements: **(1)** put a **shadcn/radix Popover** on the bar so clicking the `🔗 5/7 connected` rollup (and each chip) opens a quick-look / quick-setup list **in place** instead of navigating to `essential-tools.html`, with **Connect** on a not-linked tool — and only then — opening the wizard; **(2)** add **clear, animated health dots** because "right now I am only seeing gray and no animated dots" — the all-greyscale glyphs don't read healthy-vs-not at a glance.

**VERDICT: GO-WITH-CHANGES.** Both asks are correct and on-pattern. The Popover is the universal always-on-indicator convention (VS Code status-bar quick-picks, Tailscale/Docker-Desktop tray menus, Linear sync popover, GitHub/Vercel deploy dropdowns) and removes a full page-load for the 90% case (a glance, or a one-click reconnect). The animated dot is the real fix for "I only see grey." The **changes** are three: (a) **one shared popover**, not eight — the rollup opens the full list, a chip opens that *same* popover anchored/highlighted to its row (honours the user's "same model per chip" without the duplicate-doorway cost of eight radix instances and two-open-at-once races); (b) **reconnect resolves in-place** — only first-time `＋ Connect` escalates to the wizard, re-link ≠ first-link; (c) the dot uses a **calm breathe**, not the existing `.live` radar-ping (§10 already warns against overusing `.live`; the `ping` keyframe scales `0.6→2.4` as an expanding halo — a strobe, not a heartbeat).

### 12.1 Popover interaction spec

- **Trigger.** The `.tb-roll` (`🔗 5/7 connected`) becomes a real `<button>` (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`) — today it is an `<a href>`. Each `.tb-chip` is *also* a trigger for the **same** popover, opened with that tool's row scrolled into view + `data-highlight`. Open on **click/focus only** (never hover — a 40px bar + hover = flicker; the chips already expose status via `title`/`aria-label`).
- **One popover, one mental model.** A single `.sb-popover` element is appended once to the bar and repositioned/repopulated per trigger. The rollup shows all seven rows; a chip shows the same list scrolled to (and highlighting) its row. Chips never spawn a second popover. The chip `href="essential-tools.html"` stays as the no-JS fallback; JS intercepts the click to open the popover.
- **Open direction & layering.** Opens **upward** (radix `side="top" align="start" sideOffset=8 collisionPadding=12`) with a `Popover.Arrow` pointing down at the trigger (load-bearing — a floating card with no tail reads as detached from the bar). `max-height: min(60vh, 520px)`, inner list scrolls (7 rows + header + footer ≈ 430px). **z-index must be set explicitly above the bar's `9998`** (e.g. `9999`) — the default `--z-dropdown:100` is *below* the bar and would render behind it. On phones (`<560px`, where the chip strip is already hidden) the rollup is the only trigger and the popover opens as a near-full-width sheet (`max-width: calc(100vw - 24px)`).
- **Dismissal & focus.** Click-outside closes, Esc closes, focus returns to the trigger (radix-default; mirrors the wizard's focus contract, §7). Non-modal popover (`aria-haspopup`), so the bar stays visible. Keyboard-navigable top-to-bottom; every row action + `⋯` is a real `<button>`. A `role="status" aria-live="polite"` line announces `Reconnecting… / Reconnected`.
- **Row anatomy (popover-scale mirror of the full page, §5).** Each of the seven rows reuses the **`.sb-statusline`** atom: `[.sb-hdot] · [tool name @15px] · [glyph+label] · [.sl-meta last-seen @13px] · [right: ONE contextual action] · [⋯ .sb-menu]`. Header line restates the rollup (`5 of 7 connected · 1 needs you`, `tabular-nums`). Footer = a single `Your tools →` link to `essential-tools.html` (the **only** thing that navigates to the full page; the full surface keeps admin `<details>`, re-link commands, and the log).
- **Per-row action = state-driven, exactly one (calm).** `✦ Active` / `● Connected` → **no inline button** (quiet) — at most a ghost `Open`; `◐ Degraded` → `Reconnect` lives in the `⋯`; `○ Disconnected` → `.btn-ghost.btn-sm` **Reconnect** that resolves **in the popover** (spinner → ✓, never leaves); `＋ Not linked` → `.btn-primary.btn-sm` **Connect** — the **single accent affordance** and the **only** control that opens `essential-connect-wizard.html`. The `⋯` (`.sb-menu`) carries the rest on demand (Reconnect / Rename / Disconnect / Copy command — the 1Password device-menu pattern).
- **Escalation (two distinct doors).** **(1)** Inline `Connect` on a `＋` tool → close the popover, then open the wizard `sb-dialog` pre-seeded to that tool (don't stack a modal dialog over the non-modal popover; restore focus to the bar on wizard close). **(2)** Footer `Your tools →` → navigates to `essential-tools.html`. **Reconnect of a known tool never opens the wizard** — it is the in-place case (optimistic `Reconnecting…` spinner on the row). The wizard is for the genuine multi-step *first* link only.

> **Rejected sub-idea (honest):** eight independent popovers (one per chip + the rollup). It doubles radix instances, risks two-open-at-once, and forces "which click gives what." The better realisation of "same model per chip" is **one** popover that chips shortcut *into*.

### 12.2 Animated health dots — the system

A small **8px dot** sits **under the glyph** (`display:inline-grid; place-items:center` wrapper; dot is a `::before` at `z-index:0`, glyph a `<span>` at `z-index:1`) so one atom carries **shape (glyph) + colour (dot) + motion (breathe)** and they can never desync. The dot is **decorative reinforcement** (`aria-hidden`); the glyph + the chip's `aria-label` remain the accessible carriers. This new dot is named **`.sb-hdot`** ("health dot") — *not* `.sb-dot` — to flag it as the scoped exception and avoid collision with `app.css .dot/.dot-success` (the old traffic-light semantics this inverts).

| State | Glyph + label | Dot colour (token) | Motion |
|---|---|---|---|
| **Active** | `✦` Active | `--success` | **breathe** (`tb-beat`, ~2.4s, reduced-motion-safe) — the *only* animated state |
| **Connected** | `●` Connected | `--success` | static |
| **Degraded** | `◐` Degraded | `--warning` (amber) | static |
| **Disconnected** | `○` Disconnected | `--fg-subtle` (neutral grey, **never red**) | static |
| **Not linked** | `＋` Not linked | `--accent` (indigo calm / cyan dark) | static |

Net palette on the bar: **green · amber · grey · accent. No red anywhere** — `--danger`/`--destructive` never touch the Essential bar. Motion is reserved for **Active only**: a *living* breathe means "this tool is working right now"; a *static* green means "connected but idle." That single motion distinction (orthogonal to good-vs-bad — it encodes alive-vs-idle, not healthy-vs-broken) is what lets `✦ Active` read differently from `● Connected` at a glance.

**The breathe keyframe (calm, not a strobe — do NOT reuse `.live`/`ping`):**
```
@keyframes tb-beat { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.55; transform:scale(.86) } }
.sb-hdot--live { animation: tb-beat 2.4s var(--ease-standard) infinite; }
```
This breathes the dot in place (gentle opacity+scale), unlike `app.css:82` which fires an expanding `0.6→2.4` halo via `ping` (a radar strobe §10 already cautions against). The fix for "I only see grey" is **two changes**: (i) remove the `#tools-bar .tb-chip .g{color:var(--fg-subtle)}` greyscale-everything rule (the literal cause of all-grey), and (ii) add the coloured `.sb-hdot`.

### 12.3 Law reconciliation — why this is NOT the traffic light §4/§10 forbid

The enforced law bans colour as the **sole** status carrier ("status = LABEL + GLYPH, never traffic-light colour; `--accent` only for needs-you; **no colour-ONLY dots**"). The exception here is fenced by four properties — **state these verbatim in the build comment so a future edit doesn't "fix" it back to grey or, worse, cite it to colour row badges:**

1. **Dot-only, fire-walled to the ambient bar.** Colour touches the 8px `.sb-hdot` (bar chip + the matching dot in the popover rows) and **nothing else**: not chip names, not the `5/7` rollup digits, not the `.sb-badge` (rows stay neutral glyph+label per §4), not last-seen/latency text, not row backgrounds/borders. The "wall" §10 rejects (`monitoring-health.html`) was colour-coded **badges + latency text + row tints** across a KPI grid — colour *was* the message and it was *everywhere*. Four 8px dots on a 40px bar is the Tailscale/Docker/GitHub convention, not a wall.
2. **No red-bad pole.** Disconnected is **neutral grey**, not red — an intentionally-closed CLI is *not* an error (§4/§10). With no green-good/red-bad axis the scale reads as **liveness** (alive / limited / quiet / connect), not **alarm**. `--accent` appears only when a tool actually *blocks* you (needs-you) — the one-accent rule is preserved.
3. **Colour is the redundant THIRD channel.** Behind glyph (shape) and label (word). Remove all colour and the system still works fully — that is the literal test the law cares about ("never colour ALONE"). WCAG 1.4.1 satisfied by construction.
4. **Capped, meaning-mapped, zero expansion path.** Exactly four **pre-existing, already-WCAG-tuned** tokens (`--success`/`--warning`/`--fg-subtle`/`--accent`), five states collapsed to four dot treatments — no new colour vocabulary, no per-tool colours, so it cannot creep.

### 12.4 Accessibility

- **Colour-blind safety.** Never colour-alone: every dot keeps its distinct glyph (`✦●◐○＋`, differentiable in greyscale, §4) and, in the popover, the word. The riskiest pair (green/amber) is *also* `✦`/`●` vs `◐` (filled vs half) AND "Active/Connected" vs "Degraded" — three redundancies. Keep dots `≥8px` with a `box-shadow: 0 0 0 1px var(--surface)` ring so green and amber differ at the luminance edge and a light dot stays visible on a white surface (3:1 non-text contrast).
- **prefers-reduced-motion.** The global guard (`tokens.css:203-208`) already neutralises every animation, so the breathe auto-freezes — and because health is *also* glyph+colour+label, a frozen Active still reads (green dot + `✦` + "Active"). Add a belt-and-suspenders `@media (prefers-reduced-motion: reduce){ .sb-hdot--live{ animation:none } }` in the injected style so the intent is legible. The `✦` glyph (not the pulse) is what distinguishes Active when motion is off — never let motion be the sole carrier.
- **Announcements.** Glyph + dot are `aria-hidden`; the human label is the accessible name (`aria-label="Codex CLI: Degraded, slow p95 1.8s"`, already in `tools-bar.js:68`). A `role="status" aria-live="polite"` region announces reconnect state; a tool crossing into blocking may use `assertive`.
- **15px floor.** Popover tool names + status labels stay at `--text-sm` (the `.sb-statusline` default); only last-seen / version / transport metadata drop to `--text-xs` (13px). The dot is a `::before`, not text, so the floor doesn't apply to it.

### 12.5 Build plan

- **New CSS (~24 lines).** Add **one** component, `.sb-hdot`, to `shadcn.css` after `.sb-statusline` (so the status atoms sit together): base `{position:relative;width:8px;height:8px;border-radius:50%;flex:none;background:var(--fg-subtle);box-shadow:0 0 0 1px var(--surface)}` + modifiers `--ok{background:var(--success)} --warn{background:var(--warning)} --accent{background:var(--accent)}` + `--live{animation:tb-beat 2.4s var(--ease-standard) infinite}` + the `@keyframes tb-beat` + the reduced-motion guard. This is the fourth small component beyond §8's three (`.sb-steps`/`.sb-copy`/`.sb-statusline`); update §8's "exactly three new" note to four. **Do NOT add a red/`--danger` modifier** (build comment).
- **`tools-bar.js`.** (1) Add a state→class map `{Active:'ok',Connected:'ok',Degraded:'warn',Disconnected:'',Disconnected→hollow:'', 'Not linked':'accent'}` and a `--live` flag for `Active`; the existing `needs` flag collapses into `accent`. (2) Chip markup: prepend `<span class="sb-hdot …" aria-hidden="true">` and **remove** the `.tb-chip .g{color:var(--fg-subtle)}` grey rule. (3) Convert `.tb-roll` from `<a>` to `<button>`; build one `.sb-popover` (positioned `bottom:48px`, `z-index:9999`) toggled by the rollup and by each chip-click (chip → highlight its row); outside-click + Esc close. Footer `Your tools →` → `essential-tools.html`. (4) Inline `Connect` (`.btn.btn-primary.btn-sm` → wizard) only on `＋`; `Reconnect` (`.btn.btn-ghost.btn-sm`) resolves in-place — both reuse the verbatim classes from `essential-tools.html:156/193`.
- **Screenshot-ready open state.** The bar is injected at runtime and the popover defaults closed. Gate an open state behind a URL flag — if `location.hash==='#tools-open'` (or `?toolsbar=open`), render the popover `display:block` at build time so Playwright can capture it (`essential-tools.html#tools-open`). Default stays **closed** so production pages are calm.
- **shadcn/radix fidelity (when this leaves the mockup).** Map to shadcn's `Popover` (radix `Root/Trigger/Content/Arrow`, `side="top" align="start"`); **strip any lucide icon it ships** (no-icon-lib rule — raw `🔗`/`→`/glyphs only); hand-map to `sb-*` tokens via the shadcn MCP, don't let `init` overwrite `components.json`. The rows are a plain list (not a Command/Combobox). `.sb-hdot` is pure CSS, no JS component.
- **Ratify the exception.** This §12 *is* the ratification: colour permitted **only** on the `≤8px` ambient bar `.sb-hdot`, **only** the four token hues, **only** as redundant reinforcement behind glyph+label, **never** red, **never** on row badges or chrome. Add `monitoring-health.html`-style traffic-light to `§10 Rejected` remains in force for everything except this fenced dot.

### 12.6 Update (user follow-up, 2026-06-24) — "I don't see the blink"

After §12 shipped, the user reported the green dots didn't visibly blink (a static screenshot can't show motion, and the original `tb-beat` breathe was deliberately gentle). Two directed changes, both **scoped to the bottom bar only** (re-confirmed: `.sb-hdot` colour appears on no other surface; the Your-tools page stays glyph+label):

1. **Motion now marks every HEALTHY GREEN tool**, not Active-only. "Green is a go" — the user wants the standardized live signal on all healthy tools, so **Connected also gets `--live`** (Active vs Connected is still distinguished by the `✦`/`●` glyph + the popover label). This intentionally relaxes §12.2's "Active-only" motion rule per the user's explicit standardized-signal directive.
2. **The blink is now clearly visible** — `tb-beat` deepened to `opacity 1→.35 · scale 1→.78` (was `1→.55 · .86`) at `1.5s`, **plus** a gentle expanding pulse halo (`tb-beat` + a `::after` `tb-ping` `scale 1→2.6` fade). This is the calm-but-visible "alive" pulse the user asked for — still reduced-motion-safe (both animations drop under `prefers-reduced-motion`, and the green + glyph + label still read when frozen). Amber (Degraded) and grey (Disconnected) stay **static** — only green pulses, so motion cleanly means "healthy / go".

Net standardized bar signal: **pulsing green = healthy/go · amber = degraded · grey = disconnected (never red) · accent = not-linked.**

### 12.7 Update — bright glyph colour + a distinct motion per status (user, 2026-06-24)

§12.6 still hid the colour on a dot **behind** the glyph; the user reported it still read **grey** (the grey glyph occluded the dot, and the blink dipped opacity so low it greyed out) plus **mis-alignment** and "**colours not bright enough**". Resolved by moving the signal **onto the glyph itself** and giving **each status its own motion** so it's legible by hue *or* by animation. The `.sb-hdot` behind-dot is **removed** (was dead/occluding); the signal CSS now lives in the injected `tools-bar.js` style as `#tools-bar .gl-*`:

| Status | Glyph | Colour (bright) | Motion |
|---|---|---|---|
| Active / Connected | `✦` / `●` | green `#16c060` | **slow steady** pulse — `tb-steady 2.6s` (opacity 1→.5) |
| Degraded | `◐` | amber `#f5a30b` | **fast blink** — `tb-fast .8s` (opacity 1→.18) |
| Disconnected | `○` | grey `var(--fg-subtle)` | **static** (no animation) |
| Not linked | `＋` | blue `var(--accent)` | **intermittent glow** — `tb-iglow 2.6s` (a brief `text-shadow` flash, calm between) |

Why this fixes it: colour is on the glyph (never occluded), the glyphs are bigger (`--text-md`/`--text-lg`) and **vertically centred** in a grid cell (fixes the mis-alignment), and the colours are vivid. Motion now also **encodes** status (slow vs fast vs static vs glow) — a second, non-colour channel for colour-blind users, on top of the glyph shape + the popover label. Still **no red**, still **reduced-motion-safe** (`@media (prefers-reduced-motion:reduce)` drops all four), still **scoped to the bar only** (the Your-tools page and all other surfaces remain glyph+label, verified). This supersedes §12.6's behind-dot.

### 12.8 Update — per-tool popovers (user, 2026-06-24)

§12.1 chose ONE shared popover (a chip highlighted its row in the all-tools list). The user wanted **each tool to have its OWN popover** with that tool's status, connection, details and actions. Done — and it stays clean by keeping **one popover element**, repositioned + repopulated per trigger (no eight DOM instances, no two-open races):

- **Rollup `🔗 5/7 connected` → the OVERVIEW** (the all-tools list, 340px). Each row is now a **button** with a `›` chevron that **drills into that tool's card**.
- **Each chip → THAT tool's DETAIL card** (300px), anchored to the chip with the **arrow pointing at it** (`place()` sets `pop.style.left` + `arrow.style.left` from the trigger's `getBoundingClientRect()`, clamped to the viewport). The chip shows `aria-expanded`.
- **Card anatomy:** `[bright glyph] name · status label` · `where · via` (e.g. "On your computer · via MCP") · a body of label→value lines (**Status/Last seen · Can do · Version + seen**) · **state-driven actions**: Active/Connected → *Open · Settings* · Degraded → *Open · ↻ Reconnect* · Disconnected → *↻ Reconnect (primary) · Technical details* · Not-linked → *＋ Connect (primary → wizard) · Learn more*.
- **Escalation unchanged:** only `＋ Connect` opens `essential-connect-wizard.html`; `↻ Reconnect` resolves in place (`aria-live`); everything else stays inline or links to `essential-tools.html`. Dismissal: click-outside / Esc, focus returns to the trigger. Screenshot gates: `#tools-open` (overview), `#tool=<Name>` (a tool's card).

This supersedes §12.1's single-shared-popover decision; the per-tool card is the better UX for "what is THIS tool doing and what can I do about it."

---

*This spec is the contract; `mockups/essential-tools.html`, `essential-tools-empty.html`, `essential-connect-wizard.html`, and the persistent `tools-bar.js` realize it.*
