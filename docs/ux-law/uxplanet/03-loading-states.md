---
source:
  - https://uxplanet.org/progress-indicators-4-common-styles-91a12b86060c
  - https://uxplanet.org/progress-bar-design-best-practices-526f4d0a3c30
publisher: UX Planet (Medium)
author: Nick Babich; uxplanet.org (progress-bar best practices)
published: 2022-09-27 (4-common-styles); 2024-12-17 (best-practices)
accessed: 2026-06-24
---

# Loading & Progress States

> **TL;DR** — Pick the indicator from the *expected duration*, not habit. Show skeletons instantly for page loads, spinners only for short indeterminate waits (<~2s or in-flight button actions), and determinate bars whenever you know (or can estimate) duration. Never freeze near completion, never use indeterminate when duration is known, and never let the skeleton shape diverge from the real content shape (that is CLS + broken trust).

## The loading-state toolkit (when to use each)

| Indicator | Use when | Duration band |
|---|---|---|
| **Nothing** | Round-trip is perceivably instant | < ~100 ms — render directly, a flash of a loader is worse than no loader |
| **Inline / button spinner** | Action is in flight, duration unknown, tied to a control | ~100 ms – 2 s (submit, save, debounce) |
| **Loading spinner** (looping) | Short, indeterminate, no layout to preserve | ~2 – 10 s (attention limit for a single task) |
| **Skeleton screen** | Page/section load, real content has a known shape | > ~1 s, ideal for web pages that should load in < 3 s |
| **Determinate progress bar** | Duration is known or estimable (upload/download/install) | ≥ ~10 s; *always prefer determinate over indeterminate when you can* |
| **Percentage / step tracker** | Multi-step flow with discrete phases | "Step 2 of 4", wizard, long batch ops |

Rules of thumb from the sources: use *some* progress indicator for any action > 1 s; avoid progress bars for tasks < 5 s (skeleton or spinner instead); 10 s is the ceiling for keeping a user's attention on one task — beyond it, switch to a keep-working signal and let them leave.

## Perceived performance

- **Show something instantly.** A skeleton renders on the first paint so the user never sees a blank void; the bare fact of motion ("the system is working") is perceived as faster than a static "Loading…" string.
- **Skeletons preserve layout.** Match placeholder dimensions to real content to eliminate Cumulative Layout Shift (CLS) between skeleton and rendered state — mismatched skeletons are the #1 skeleton bug.
- **Animate subtly (shimmer), honor `prefers-reduced-motion`.** A shimmer/pulse reads as "working"; a static gray block reads as "broken." Disable the animation under reduced-motion and fall back to a flat tone.
- **Optimistic UI for predictable mutations.** Instantly render the expected result (e.g., the new card appears), then reconcile with the server response — revert + surface an error on failure. This is the strongest perceived-perf lever for writes.
- **Perception tricks on long bars.** Start the fill slower and accelerate toward the end (ease-in curve) so the operation *feels* faster; the bar should never visibly decelerate or freeze.
- **Mark the region.** Set `aria-busy="true"` on the loading container so assistive tech announces the in-flight state.

## Frontend-actionable rules

- Map query state to indicator by flag, not by hand:
  - `isLoading` / `isPending` (no cached data) → **skeleton** matching layout.
  - `isFetching` (background revalidation with cached data on screen) → **subtle stale indicator** (faint spinner in a corner, opacity dim), *never* a full-page spinner that throws away good data.
  - `isError` → error state; do not leave the skeleton spinning.
- Use **React Suspense boundaries** for route-level streaming — wrap route segments, not individual leaf components, so skeletons stream in at the right granularity.
- **Debounced search** shows a small inline spinner next to the input, not a full-page takeover; cancel in-flight requests on new keystrokes.
- **Button submits** swap label → inline spinner + `disabled` while the mutation is in flight; wire to `isPending` from the mutation hook (TanStack Query / SWR / Zustand async).
- **Long ops (≥ ~10 s):** show ETA ("~20 min remaining") and "Step 2 of 4"; never let the bar stall at 99%.
- **Indeterminate → determinate handoff:** if you need a moment to compute ETA, start indeterminate and transition to determinate once you know — but never swap *style* (ring → bar) mid-flight, it disorients.

## Anti-patterns to avoid

- **Full-page spinner for everything.** Erases layout context and wastes the strongest perceived-perf tool (skeletons).
- **Indeterminate indicator when duration is known.** If you can compute or estimate, show a determinate bar — indeterminate only communicates "something is happening."
- **Freezing at 99%.** The single most trust-destroying progress-bar failure; users assume the app is hung. If work may stall near the end, slow the bar earlier or keep it moving truthfully.
- **CLS from mismatched skeletons.** Placeholder shape ≠ real content shape = content jumps on resolve.
- **Flashing a skeleton for sub-100 ms loads.** A loader that appears and vanishes in one frame looks like a glitch — gate loaders behind a small delay (e.g., 200 ms) before showing.
- **Ignoring `prefers-reduced-motion`.** Animated shimmer/spin for motion-sensitive users is an accessibility failure.
- **Blocking a disabled button with no feedback.** A greyed button alone doesn't say "working"; pair it with an inline spinner.
- **Excessive "creative" loaders** that delight the first time and annoy the thousandth — keep it simple for repeat-use surfaces.

## Quick checklist

- [ ] Indicator chosen by expected duration (skeleton / spinner / determinate bar / step tracker).
- [ ] Skeleton dimensions match real content — zero CLS on resolve.
- [ ] Background refetch (`isFetching`) uses a subtle stale indicator, not a full spinner.
- [ ] Submit buttons show inline spinner + `disabled`, tied to mutation `isPending`.
- [ ] Long ops show ETA or step count; bar never stalls at 99%.
- [ ] `aria-busy="true"` on loading regions.
- [ ] Shimmer/spin animations disabled under `prefers-reduced-motion`.
- [ ] Optimistic updates revert cleanly on failure with a surfaced error.

## Source(s)

- https://uxplanet.org/progress-indicators-4-common-styles-91a12b86060c — Nick Babich, "Progress Indicators: 4 Common Styles" (accessed 2026-06-24)
- https://uxplanet.org/progress-bar-design-best-practices-526f4d0a3c30 — uxplanet.org, "Progress Bar Design Best Practices" (accessed 2026-06-24)
