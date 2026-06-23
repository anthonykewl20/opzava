# Opzava UX/UI Redesign — Executive Summary

> **Status:** Initial plan (audit + design system + interactive mockups).
> **Scope:** All user-facing surfaces — the app shell and 44 panels.
> **Goal:** A minimalist, low-cognitive-load, productivity-first control plane: clear and unambiguous, never overwhelming, with a **15px text floor**, standardized tokens/components, and proper realtime/health/notification UX.

---

## How this audit was produced

This is **not** a code-only review. Three independent evidence streams were combined:

1. **Code audit** — a fleet of 10 specialist agents read the actual source across 10 UX dimensions (IA/nav, shell, typography, tokens/CSS, component consistency, dense panels, states/motion, realtime/networking, notifications/alerts, accessibility) and produced **80 findings (16 P0, 35 P1)**. → [`01-audit-findings.md`](01-audit-findings.md)
2. **Real visual proof** — the app was launched and **every panel screenshotted** with Playwright in both the everyday **Essential** mode ([`screenshots/before/`](screenshots/before/), 38 panels) and the un-gated **Full/admin** mode ([`screenshots/before-full/`](screenshots/before-full/), 34 panels); a vision fleet then *looked at* every render. This surfaced what code cannot — e.g. ~25 panels are blank "Full mode" dead-ends, and raw file paths/CLI errors leak into the everyday UI. → [`06-visual-audit.md`](06-visual-audit.md)
3. **Best-practice research** — web research on dashboard design, UX laws, minimalism, typography, realtime UX, and design tokens, **cross-validated with an independent MiniMax brief**. → folded into [`02-design-system.md`](02-design-system.md) / [`03-ia-navigation.md`](03-ia-navigation.md) / [`04-realtime-networking.md`](04-realtime-networking.md)

Every recommendation is traced to a named law (Hick, Fitts, Miller, Jakob, Doherty, Tesler, Aesthetic-Usability, Gestalt) or a WCAG 2.2 AA success criterion.

---

## The verdict

Opzava is feature-complete and capable, but the interface makes the user carry complexity the system should absorb (Tesler's Law). The screenshots make this concrete:

- **The top of every screen is noise before content.** Two dismissible banners (OpenClaw *update* + *doctor warnings*), each with 3–4 buttons, stack above the page on **every** panel — the user reads ~150px of chrome before any task content.
- **Color has no meaning.** Cyan, amber, green, and violet all act as "primary" at once (e.g. the Task Board's four empty columns use four different header colors). Nothing tells the eye where to go.
- **Text is systematically too small.** `text-xs` (12px) appears in 84 files, `text-sm` (14px) in 86, and a `text-2xs` **10px** token exists — version strings, timestamps, and descriptions routinely render at 10–12px, low-contrast. This violates the explicit 15px requirement and WCAG 1.4.4.
- **Density without hierarchy.** The heaviest panels are 1,000–3,000 lines (`agent-detail-tabs` 2,992, `task-board` 2,604, `office` 2,411); they present everything at once with no progressive disclosure.
- **No shared vocabulary.** `src/components/ui/` ships only `button` + `loader` — so 44 panels re-implement cards, badges, inputs, and tables ad hoc, producing inconsistent padding, radius, and color.
- **Stale by design.** ~15 panels poll on `setInterval` even though SSE (`use-server-events`) and WebSocket infra already exist; connection state and health are never surfaced to the user.

---

## Top problems to fix first (P0)

| # | Problem | Evidence | Law / SC | Fix |
|---|---------|----------|----------|-----|
| 1 | Sub-15px type everywhere; a 10px token in the design system | 84× `text-xs`, 86× `text-sm`, `text-2xs:10px` | WCAG 1.4.4, Aesthetic-Usability | 15px body floor; retire 10px; 13px only for tertiary metadata |
| 2 | Banner stacking — 2+ full-width notices on every screen | `overview/tasks/settings` screenshots | Miller, signal-over-noise | One consolidated `.banner`; move the rest into a notifications inbox |
| 3 | Competing accent colors; no single primary | Task Board 4-color columns; multi-color CTAs | Aesthetic-Usability, Gestalt | One accent (cyan); semantics desaturated; one primary action per region |
| 4 | 32-item sidebar with redundant entries | `Cost Tracker`/`Costs`, `Approvals`/`Approval Queue` | Hick, Miller | Collapse to ≤9 destinations in 3 groups + ⌘K palette |
| 5 | No component standardization | `ui/` has only button+loader; 44 panels reinvent | Jakob consistency, Tesler | Build the primitive set (Card, Input, Badge, Table, Tabs, Toast, …) |
| 6 | Polling instead of push; no connection/health state | `setInterval` in ~15 panels | Doherty | Single multiplexed SSE stream + global health pill |
| 7 | `maximum-scale=1` blocks pinch-zoom | `src/app/layout.tsx` viewport | WCAG 1.4.4 | Remove `maximumScale` |
| 8 | `prefers-reduced-motion` reset defeated by Tailwind layers | `globals.css` layering | WCAG 2.3.3 | Move the reduced-motion override outside all `@layer` blocks |
| 9 | Technical jargon & raw strings (file paths, CLI errors) in the everyday UI; ~25 panels are jargon "Full mode" dead-ends | `06` visual audit | Jakob, Tesler | **Essential** view = jargon-free for normal users; technical depth behind Full/admin → [`07`](07-essential-vs-admin.md) |

Full prioritized register (P0/P1/P2) with evidence: [`01-audit-findings.md`](01-audit-findings.md).

---

## The proposed system

A **minimalist evolution of the existing "void" identity** — same cyan-on-navy product feel, far less noise:

- **One accent, neutral everything else.** Cyan is the only saturated chrome color; status uses desaturated semantic tokens; data gets a colorblind-aware categorical palette.
- **15px floor, real scale.** A rem-based type scale where body = 15px and only tertiary metadata may drop to 13px. The 10px token is deleted.
- **Standardized tokens + components.** A single token contract (`mockups/tokens.css`) and a minimalist component library (`mockups/app.css`) on cascade layers (`@layer reset, tokens, base, components, utilities`) so themes swap values and components never fork.
- **Simplified IA.** ≤9 destinations in 3 groups (Operate / Observe / Govern) + a ⌘K command palette; redundant nav items merged. → [`03-ia-navigation.md`](03-ia-navigation.md)
- **Realtime, not polling.** One multiplexed SSE stream for server→client events, WebSocket reserved for the terminal, a global health pill aggregating the health endpoints, and clear connection state. → [`04-realtime-networking.md`](04-realtime-networking.md)
- **Two audiences; a jargon-free Essential view.** A normal-user **Essential** experience (plain language, ≤7 friendly destinations, zero technical strings) is the default; technical depth (logs, gateways, debug, super-admin) lives in **Full/admin** and **super-admin** — one switch away, never a dead-end. Built entirely from proven, conventional patterns (Jakob's Law), not novel interactions. The Essential view is realized as a **calm adaptation of Basecamp** (projects, to-dos, a Card Table). → [`07-essential-vs-admin.md`](07-essential-vs-admin.md) · [`08-basecamp-teardown.md`](08-basecamp-teardown.md)
- **Every async state designed.** Loading skeletons, empty states with next actions, error states with retry, optimistic updates (<400ms, Doherty).

The full normative spec is [`02-design-system.md`](02-design-system.md); the working contract is `mockups/tokens.css` + `mockups/app.css`.

---

## See it: interactive mockups

Open **[`mockups/index.html`](mockups/index.html)** in a browser — a visual gallery of every screen. The **Essential** view (everyday users) is a calm **Basecamp adaptation**; the **Full/admin** views keep the dark control plane:

- **Essential (Basecamp-style):** `essential-home` (projects Lineup) · `essential-project` (workspace) · `essential-todos` · `essential-card-table` (swim lanes) · `essential-card` (a card opened) · `essential-my-stuff` (cross-project) · `essential-blank-slates` (empty/error states).
- **Full / admin:** `style-guide` · `shell-overview` · `monitoring-health` · `task-board` · `agent-detail` · `notifications-alerts` · `settings`.

---

## Phased roadmap

| Phase | Theme | Key work | Outcome |
|-------|-------|----------|---------|
| **0 — Foundation** | Stop the bleeding | Token contract + 15px floor; delete 10px token; remove `maximum-scale`; fix reduced-motion layer; consolidate banners to one | Legible, calm, accessible baseline — mostly find/replace + CSS |
| **1 — System** | Standardize | Ship the component library (Card/Input/Badge/Table/Tabs/Toast/Skeleton/EmptyState/…); migrate panels to it; collapse IA to ≤9 + ⌘K | One visual vocabulary; far less per-panel code |
| **2 — Realtime & states** | Live & trustworthy | Single SSE stream replacing per-panel polling; global health pill + connection state; loading/empty/error everywhere | Fresh data, clear system status, no dead screens |
| **3 — Tame the giants** | Reduce overload | Restructure the 1k–3k-line panels with progressive disclosure (tabs, summary-first, collapsed advanced) | No screen overwhelms; complexity is opt-in |

Sequencing detail and quick wins are in [`01-audit-findings.md`](01-audit-findings.md) (§ Quick wins).

---

## Document map

| File | What it is |
|------|-----------|
| [`00-executive-summary.md`](00-executive-summary.md) | This document |
| [`01-audit-findings.md`](01-audit-findings.md) | Prioritized findings register (80 findings) + appendix |
| [`02-design-system.md`](02-design-system.md) | Normative design-system spec (tokens, type, components, layers) |
| [`03-ia-navigation.md`](03-ia-navigation.md) | Information architecture & navigation redesign |
| [`04-realtime-networking.md`](04-realtime-networking.md) | SSE/WebSocket/health/notifications architecture |
| [`05-mockup-specs.md`](05-mockup-specs.md) | Per-screen build specs for the mockups |
| [`06-visual-audit.md`](06-visual-audit.md) | Screenshot-grounded visual evidence |
| [`07-essential-vs-admin.md`](07-essential-vs-admin.md) | Essential (everyday, jargon-free) vs Full/Admin audience model |
| [`08-basecamp-teardown.md`](08-basecamp-teardown.md) | Basecamp teardown → the Essential-view blueprint |
| [`mockups/`](mockups/) | 9 interactive HTML mockups + `tokens.css` + `app.css` |
| [`screenshots/before/`](screenshots/before/) | Real renders — Essential/local mode (38 panels) |
| [`screenshots/before-full/`](screenshots/before-full/) | Real renders — Full/admin, un-gated (34 panels) |
