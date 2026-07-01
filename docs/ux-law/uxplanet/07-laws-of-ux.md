---
source:
  - https://uxplanet.org/10-laws-of-ux-every-designer-should-know-24daaeb42af9
  - https://uxplanet.org/7-important-ux-laws-with-examples-c1ff02a05488
  - https://lawsofux.com
publisher: UX Planet (Medium)
author: synthesized reference (Andrew Tipp, Rahul Garhwal, Jon Yablonski canon)
published: 2024-01-29
accessed: 2026-06-24
---

# Laws of UX (deep companion)

> **TL;DR** — Cognitive science baked into the build: constrain choice, enlarge and place targets deliberately, chunk to 4±1, reuse conventions, and let visual hierarchy (proximity, region, isolation) do the remembering for the user. Companion to the frontend SKILL.md laws table — this expands each law with concrete React/Next.js application and adds the laws the table omits.

## The laws, applied to frontend

| Law | One-line statement | Concrete frontend application |
|---|---|---|
| **Hick's** | Decision time grows with number & complexity of choices. | Cap primary nav at 5–7 top items; collapse secondary actions behind an overflow `…` menu. In a filter panel, show 3 active facets and tuck the rest under "More filters". Never render a 20-field form flat — split into a 3-step wizard. Default-select the most common option so the user often decides nothing. |
| **Fitts's** | Time to hit a target = f(distance, size); bigger & closer is faster. | Make the whole card clickable (`<button>` wrapper), not just an inner link. Primary CTA is a 44–48px-tall block pinned to the viewport edge/corner so the cursor is already near it. Put destructive ("Delete") far from confirmatory ("Save") actions. On mobile, keep the primary action in the thumb-reach bottom bar. |
| **Miller's** | Working memory holds 7±2 items; chunk beyond that. | Group settings into named sections of ≤5 fields. Render a long list as grouped `<optgroup>` or paginated chunks of 5–9, not a 200-row scroll. Phone/credit-card inputs auto-format into `4-4-4` chunks. Never dump a raw API array of 50 tags as one flat cloud — paginate or cluster. |
| **Jakob's** | Users expect your UI to work like the other sites they already know. | Logo top-left → home; magnifier icon = search; gear = settings; top nav, left sidebar, bottom action bar. Don't invent a novel menu metaphor. Keep the primary CTA color consistent with the convention (one accent color) across every screen. |
| **Tesler's** (conservation of complexity) | Every system has irreducible complexity; move it to the system, not the user. | Auto-derive what you can: timezone from the browser, currency from locale, name from the session. The engine does the heavy lifting (validation, defaults, retries); the UI stays thin. Push irreducible config into an admin/`SecretReference` layer, never onto the end-user form. |
| **Doherty Threshold** | Response < 400ms feels instantaneous; the user stays in flow. | Optimistic UI on every mutation (update local Zustand state before the server round-trip). Skeleton placeholders within 100ms; real data swaps in under 400ms. Anything slower shows a non-blocking progress indicator, not a frozen screen. |
| **Serial Position** | First & last items in a series are remembered best (primacy + recency). | In a nav or card list, put the highest-value item first and the persistent action (e.g. "New campaign") last. In a feature comparison table, lead with the flagship feature and end with the differentiator; bury the parity items in the middle. The bottom of a long page is prime real estate — put the next-step CTA there, not a footer legal link. |
| **Von Restorff** (isolation) | The visually distinct item in a group is the one remembered/chosen. | The primary CTA is the only solid-filled button on screen; secondary actions are ghost/outline. In a pricing or plan card grid, the recommended plan gets a distinct accent border + "Recommended" badge — but signal distinctness with shape/weight too, never color alone (accessibility). |
| **Prägnanz** (good figure) | We reduce complex images to their simplest form; simple figures process & remember better. | Use one icon style (line or solid, not mixed). Prefer a 2–3-step geometric logo over an intricate mark. Keep dashboard charts to one or two series; strip gridlines and legends when redundant. Negative space is structure — don't fill it. |
| **Law of Proximity** | Objects near each other are perceived as related. | Label sits flush above its input with tight `gap-1`; the gap to the *next* field is `gap-6`. Group a field's help text, error, and label in one `<div>` so they read as a unit. Tighten intra-group spacing, loosen inter-group. |
| **Law of Common Region** | Elements sharing a bordered/contained area are seen as one group. | Wrap each logical form section in a `rounded border` or tinted panel: "Contact details" in one card, "Access" in another. A single full-width card with all fields reads as undifferentiated mass; split into stacked regions. Background tint alone (no border) also works. |
| **Parkinson's** | Work expands to fill the time available for it. | Constrain open-ended tasks: add a visible estimate ("~2 min") and a countdown on uploads/processing. Time-box a session token expiry to force completion. Progress that looks bounded ("3 of 4 fields left") finishes faster than unbounded. |
| **Aesthetic-Usability** | Users perceive attractive designs as more usable and tolerate minor flaws longer. | Invest in visual polish on the surfaces users hit first (login, dashboard, empty states) — it raises perceived competence for the whole product. But never substitute gloss for real affordance: a pretty broken button still loses users. |
| **Goal-Gradient** | Motivation rises as users near a goal. | Multi-step flows (connect wizard, campaign create) show a step indicator: `2 of 4`. Pre-fill fields so the bar starts > 0% — "you're already 1/4 done." Make early steps disproportionately wide on the progress bar to accelerate the sense of momentum. |
| **Zeigarnik** | Unfinished tasks are remembered better than finished ones. | Surface in-progress work explicitly: "3 campaigns awaiting your approval" badges, draft auto-save with "Resume" entry points, a "Pick up where you left off" rail. Incomplete checklists persist visually — they pull the user back to finish. |
| **Postel's Law** (robustness) | Be liberal in what you accept, conservative in what you send. | Accept dates as `2024-01-29`, `29/01/2024`, `Jan 29`. Normalize on the client, send ISO to the API. Don't surface rigid format validation errors to the user — forgive, then format. |

## Laws the skill table doesn't cover (highest leverage)

- **Serial Position** — put key items **first and last** in any list/menu/comparison. The middle is where eyes skip. In a sidebar, the most-used destination goes to the top; the "New" action often goes to the bottom (thumb-reach on mobile, recency in memory).
- **Von Restorff (Isolation)** — the **single visually distinct** element is the one remembered and clicked. Reserve solid-fill for the one primary action per screen; everything else is ghost. This is the law that justifies a strict CTA hierarchy.
- **Goal-Gradient** — motivation spikes near the finish. Always show a step/progress indicator in multi-step flows, and **start it > 0%** by pre-filling known data. A bar that begins at 0% discourages; one that begins at 25% (because we auto-filled) accelerates.
- **Zeigarnik** — unfinished work **sticks in memory**. Make in-progress state persistent and visible (drafts, pending approvals, half-completed onboarding) so users return to finish rather than abandon.
- **Parkinson's** — work expands to fill allotted time. **Bound it**: estimates, countdowns, session limits, and visible "N steps left" counters make tasks complete faster and reduce wandering.
- **Prägnanz** — the brain reaches for the **simplest interpretation**. Strip charts, icons, and layouts to their simplest legible form; every extra line is cognitive tax.

## Frontend-actionable rules

- Render **one** primary CTA per screen; make all others ghost/outline. (Von Restorff)
- Cap top-level nav at **5–7** items; overflow the rest. (Hick + Miller)
- Make targets **≥ 44px** and extend click area to the whole card/row. (Fitts)
- Chunk any list **> 9** into groups or pages of 5–7. (Miller)
- Group related fields in a **bounded region**; tighten intra-group, loosen inter-group spacing. (Common Region + Proximity)
- Put the highest-value nav item **first**, persistent action **last**. (Serial Position)
- Show a **step indicator** in every multi-step flow; start it **> 0%** by pre-filling. (Goal-Gradient)
- Persist **in-progress** state (drafts, pending approvals) with re-entry points. (Zeigarnik)
- Use **optimistic UI + skeleton** to keep perceived response **< 400ms**. (Doherty)
- **Auto-derive** timezone/locale/defaults; push irreducible config to admin. (Tesler)
- **Accept input flexibly**, normalize before sending to the API. (Postel)
- Reuse **established conventions** (logo→home, magnifier=search); innovate only with justification. (Jakob)
- Bound open-ended tasks with **estimates & visible remaining counts**. (Parkinson)

## Anti-patterns to avoid

- A screen with two solid-filled buttons of equal weight — cancels Von Restorff; user can't tell what to do.
- Flat 20-field forms with no grouping — Hick + Miller + Common Region all violated.
- Tiny text-only "click here" links inside cards — Fitts violation; users miss the affordance.
- Confirm and Delete adjacent and identically styled — high mis-click risk (Fitts + isolation).
- Progress bar that starts at 0% in a pre-fillable flow — kills Goal-Gradient momentum.
- Frozen screens with no feedback > 400ms — breaks the Doherty flow; users assume it crashed.
- Brand-new navigation metaphor ("drag the orbit to navigate") — Jakob violation; forces relearning.
- A pretty empty state with no path to the next action — Aesthetic-Usability without substance.
- Color-only distinction for the recommended plan — inaccessible; pair with shape/weight (Von Restorff done right).
- Destructive action with no estimate or "this takes ~30s" bound — Parkinson lets it drift.

## Quick checklist

- [ ] Exactly one solid-fill primary CTA per screen; rest are ghost.
- [ ] Top-level nav ≤ 7 items; secondary actions in overflow.
- [ ] All interactive targets ≥ 44px; whole cards/rows clickable.
- [ ] Lists > 9 items chunked/grouped/paginated.
- [ ] Related fields share a bordered/tinted region; spacing tightens intra-group.
- [ ] Multi-step flows show a progress indicator that starts > 0%.
- [ ] In-progress work (drafts, approvals) is surfaced with re-entry points.
- [ ] Mutations use optimistic UI; perceived response < 400ms.
- [ ] Destructive actions visually & spatially separated from confirmatory ones.

## Source(s)

- https://uxplanet.org/10-laws-of-ux-every-designer-should-know-24daaeb42af9 (Andrew Tipp, UX Planet, 2024-01-29; accessed 2026-06-24)
- https://uxplanet.org/7-important-ux-laws-with-examples-c1ff02a05488 (Rahul Garhwal, UX Planet, 2021-10-18; accessed 2026-06-24)
- https://lawsofux.com (Jon Yablonski, canonical reference; accessed 2026-06-24)
