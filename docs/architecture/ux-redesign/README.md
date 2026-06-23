# Opzava — UX/UI Redesign

A deep, evidence-based audit of Opzava's user experience and a concrete redesign plan toward a **minimalist, low-cognitive-load, productivity-first** control plane — plus **interactive HTML mockups** of the proposed system.

**Start here:** [`00-executive-summary.md`](00-executive-summary.md) · **See the mockups:** open [`mockups/index.html`](mockups/index.html) in a browser.

## Why this exists

The product is feature-complete but the UI overwhelms: stacked banners, sub-15px text, competing accent colors, a 32-item sidebar, 1k–3k-line panels, polling-based staleness, and no shared component vocabulary. This initiative defines the principles, the design system, and the realtime/IA architecture to fix that — and proves it visually.

## How it was produced (evidence, not opinion)

| Stream | Method | Output |
|--------|--------|--------|
| Code audit | 10-dimension agent fleet read the real source | 80 findings (16 P0 / 35 P1) → `01` |
| **Visual proof** | Launched the app; Playwright captured **all 38 panels**; a vision fleet analyzed the pixels | `06` + `screenshots/before/` |
| Research | Web best-practices + an independent MiniMax design brief | folded into `02`–`04` |

Every recommendation traces to a named UX law or a WCAG 2.2 AA criterion.

## Contents

```
00-executive-summary.md   Read first — verdict, top P0s, the plan, roadmap
01-audit-findings.md      Prioritized register of all 80 findings + appendix
02-design-system.md       Normative spec: tokens, 15px type scale, components, @layer
03-ia-navigation.md       32 items → ≤9 destinations + ⌘K; panel→nav mapping
04-realtime-networking.md SSE vs WebSocket vs polling; health pill; notifications UX
05-mockup-specs.md        Per-screen build specs
06-visual-audit.md        Screenshot-grounded visual evidence
07-essential-vs-admin.md  Essential (everyday, jargon-free) vs Full/Admin audience model
08-basecamp-teardown.md   Basecamp teardown → the Essential-view blueprint
mockups/                  15 interactive HTML mockups + tokens.css + app.css
screenshots/before/       Real renders — Essential/local mode (38 panels)
screenshots/before-full/  Real renders — Full/admin mode, un-gated (34 panels)
```

**Two audiences.** The **Essential** view (everyday, non-technical users) is a calm **adaptation of Basecamp** — open `mockups/essential-home.html` (projects Lineup), `essential-project.html`, `essential-todos.html`, `essential-card-table.html`, `essential-card.html` (a card opened), `essential-my-stuff.html`, and `essential-blank-slates.html` (empty/error states). The **Full/admin** control plane is `mockups/shell-overview.html` (dark). See `07-essential-vs-admin.md` + `08-basecamp-teardown.md`.

## Viewing the mockups

The mockups are dependency-free static HTML. Open `mockups/index.html` directly, or serve the folder:

```bash
cd docs/architecture/ux-redesign/mockups && python3 -m http.server 8080   # then open http://localhost:8080
```

`tokens.css` (design tokens, themes) and `app.css` (component library) are the **working contract** — the canonical, runnable expression of `02-design-system.md`. Every mockup links both; edit a token and all mockups update.

## Token naming bridge

The mockups use a **self-contained, clean token set** for clarity. The implementation plan (`02-design-system.md`) keeps the **existing app token names** to minimize churn in the live codebase. They map 1:1:

| Mockup token (`tokens.css`) | Existing app token (`globals.css`) |
|---|---|
| `--bg` | `--background` |
| `--surface`, `--surface-2/3` | `--card`, `--surface-1/2/3` |
| `--fg` | `--foreground` |
| `--fg-muted` / `--fg-subtle` | `--muted-foreground` (+ compliant subtle value) |
| `--accent` | `--primary` |
| `--danger` | `--destructive` |
| `--border`, `--border-strong` | `--border`, `--input` |
| `--text-sm` = 15px (body) | `--text-body` = 15px |
| `--text-xs` = 13px (tertiary) | `--text-xs` (raise 12→13; retire `text-2xs` 10px) |

When implementing in the app, apply `02`'s names; the mockups prove the visual target.

## Status & next step

This is the **initial plan**. With sign-off, Phase 0 (token contract + 15px floor + banner consolidation + accessibility fixes) is mostly mechanical and can start immediately — see the roadmap in `00-executive-summary.md`.
