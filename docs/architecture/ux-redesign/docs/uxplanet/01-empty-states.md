---
source: https://uxplanet.org/empty-state-design-a-practical-guide-94ad0adbda45
publisher: UX Planet (Medium)
author: Zhiyang
published: 2025-06-17
accessed: 2026-06-24
---

# Empty States

> **TL;DR** — An empty state is never "blank." It always answers three questions: *what's happening, why it's happening, what the user can do next.* Build it as a skeleton-shaped conditional render with a headline, an explanation, and a clear next action.

## The 5 types of empty state

- **First-use / onboarding** — new user, no data exists yet. Purpose: teach the first action and motivate it; show what *will* live here and the benefit of populating it.
- **No-data (user-cleared / pending)** — list is empty because the user finished/deleted everything, OR the system is still collecting data (e.g. a chart that needs 24h). Purpose: congratulate ("You're all caught up!") or set the expectation ("data appears after 24h, come back later").
- **No-results** — a search or filter returned nothing. Purpose: acknowledge the miss and offer a recovery path (different keywords, clear filters, broaden range, see help docs).
- **Error-empty** — the load failed / feature unavailable. Purpose: explain what went wrong in plain language and offer a retry (or a fallback). Must never read like a normal "no data" state.
- **Success / completed** — a goal reached (inbox zero, all tasks done). Purpose: create emotional satisfaction; congratulate and point at the next meaningful action.

> A 6th "paywall" variant exists (content gated behind a tier) — explain *why* it's locked, show a teaser, CTA to upgrade.

## Frontend-actionable rules

- **Never ship a blank screen.** Every list/table/dashboard has an empty state, full stop. A bare `[]` render is a bug.
- **An empty state has 3 parts: illustration/icon (OPTIONAL) + headline + clear next action (CTA).** The visual is decorative; the headline + CTA carry the load. Skip the icon before you skip the CTA.
- **Explain WHY it's empty and the next step.** Headline states the status ("No saved cards"); explainer says what belongs here + what to do ("Add a card to start running campaigns →").
- **No-results offers recovery, not a dead end.** Always pair with a "Clear filters" / "Try different keywords" / "Reset search" action — ideally auto-suggesting broadened matches.
- **First-use teaches the first action.** Onboarding empties should introduce the section, state the benefit, and put the primary CTA front-and-center; consider starter content/templates (Notion, Mailchimp) to make the first step trivial.
- **Reuse the populated layout (skeleton-shaped).** Render inside the same container/grid as the filled state so there's no layout shift (CLS) between empty → loading → populated.
- **Keep copy human + on-brand.** Funny is allowed only if it helps; never let wit replace the explanation or the CTA.
- **React pattern:** branch on the query lifecycle, not on a guessed flag.
  ```tsx
  // loading → spinner; error → error-empty; success+empty → no-data/first-use
  if (isLoading) return <Skeleton />;
  if (isError)   return <ErrorEmpty onRetry={refetch} />;
  if (isSuccess && data.length === 0) return <NoDataEmpty cta={...} />;
  return <PopulatedList items={data} />;
  ```
- **Distinguish error-empty from no-data.** Same component shape, different copy + a retry button only on error. Don't make a failed fetch look like "you have nothing."

## Anti-patterns to avoid

- Shipping a blank/white screen where data *would* be.
- A dead-end "No data" or "No results found" with no CTA and no recovery.
- Witty copy that entertains but never tells the user what to do next.
- An empty state that visually reads as a loading error (red icon + "No data" → user assumes the app is broken).
- Auto-showing a skeleton forever on error (a stuck loader looks like a hang, not an empty state).
- A missing CTA on first-use (the user lands and has no idea how to start).

## Quick checklist

- [ ] Every list/table/chart has a dedicated empty state (no blank renders).
- [ ] It answers: what's happening, why, and what to do next.
- [ ] A single clear primary CTA is present (skip the visual before the CTA).
- [ ] No-results offers to clear filters / broaden / see help.
- [ ] Error-empty is visually distinct from no-data and has a retry.
- [ ] Rendered inside the populated layout to avoid CLS.
- [ ] Copy is on-brand; wit never replaces the explanation or action.
- [ ] Tested across the query lifecycle: loading → error → empty → populated.

## Source(s)

- https://uxplanet.org/empty-state-design-a-practical-guide-94ad0adbda45 (accessed 2026-06-24)
