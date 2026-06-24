---
source:
  - https://uxplanet.org/micro-interactions-a-complete-beginners-guide-b446d90215ec
  - https://uxplanet.org/best-practices-for-microinteractions-9456211aeed0
publisher: UX Planet (Medium)
author: Justinmind (beginner's guide) + Nick Babich (best practices)
published: 2018-01-04
accessed: 2026-06-24
---

# Microinteractions

> **TL;DR** — A microinteraction is a contained moment built around one task (a like, a toggle, a pull-to-refresh). Done right it confirms the action, teaches affordance, and adds delight; done wrong it is animation for its own sake. Build them from four parts: Trigger, Rules, Feedback, Loops & Modes — and keep every one functional, fast, and on-brand.

## What a microinteraction is & the 4 parts (Saffer)

A microinteraction is a moment that relates to a single-use action — every time a user engages something with one function (a heart, a switch, a refresh), that is a microinteraction. Dan Saffer's framework decomposes each one into four parts: the **Trigger** initiates it (a user control, or a system event like data arriving); the **Rules** define what happens, in what order and state, and must be logically predictable to the user; **Feedback** is what the user perceives — a color change, a movement, a haptic — that signals the system received and is acting on the trigger; **Loops & Modes** govern how the interaction repeats or changes over time and any special (e.g. error) states.

## Why they matter

Feedback under ~400ms keeps the user in flow (the Doherty threshold); the whole interaction should resolve in well under 400ms or users no longer connect it to the action. Microinteractions make the UI feel less machine and more human — they confirm the system received the action, make learnability cheap by reinforcing affordance, communicate state changes (loading, saved, errored), and inject personality without distracting from the real function. They map directly onto Nielsen heuristics: visibility of system status, user control/freedom (undo), and error prevention.

## Frontend-actionable rules

- Every clickable element exposes `hover`, `active`, `focus-visible`, and `disabled` states — no naked buttons.
- Animate state changes with `transform` and `opacity` only; **never** animate `width`/`height`/`top`/`left`/`margin` (they trigger layout/paint and jank).
- Keep durations to 200-300ms with `ease-out` (or `cubic-bezier` ease curves); anything over 400ms severs the cause-effect link.
- Reflect state to assistive tech: `aria-pressed` for toggles, `aria-expanded` for disclosure, `aria-busy`/`role="status"` for in-flight actions. Never communicate state by color/animation alone.
- Use optimistic UI — flip the toggle, show "saved" — then revert cleanly on server failure with a clear message.
- Keep it functional, not decorative: each microinteraction must *signal something* (received, in-progress, success, error, limit reached). If you can't name what it communicates, delete it.
- Honor `@media (prefers-reduced-motion: reduce)` — collapse animations to instant state swaps.
- Drive animation with `requestAnimationFrame` (or CSS transitions), cancel timers/listeners on unmount; prefer the Web Animations API for one-shots.
- Stay consistent and on-brand: one motion vocabulary across the app so users learn it once (learnability).

## Anti-patterns to avoid

- Animation for its own sake ("your UI isn't a Disney movie") — motion that doesn't communicate state or causality.
- Animating layout properties (`width`/`height`/`top`/`left`) — causes reflow and dropped frames.
- Transitions over 3s (or even 400ms) that delay or block the user.
- Ignoring `prefers-reduced-motion` — motion sickness and accessibility failures.
- Microinteractions that mask or hide errors (e.g. a spinning success check on a failed request).
- Fancy elements that aren't actually operable controls (decorative "buttons" with no role/handler).
- Habit-loop baiting — dark-pattern nudges (endless red badges) that exploit rather than assist.
- Overloading the viewport: too many simultaneous moving things reads as clutter, not polish.

## Quick checklist

- [ ] Every control has hover/active/focus-visible/disabled states wired.
- [ ] Animations use only `transform`/`opacity`, ≤ 300ms, `ease-out`.
- [ ] State is mirrored to ARIA (`aria-pressed`/`aria-expanded`/`aria-busy`), never color-only.
- [ ] Optimistic update + clean revert + clear error message on failure.
- [ ] Each animation can name what it communicates — or it's removed.
- [ ] `prefers-reduced-motion: reduce` collapses motion to instant swaps.
- [ ] Listeners/timers/animation frames cleaned up on unmount.
- [ ] One consistent motion vocabulary across the whole app (on-brand).

## Source(s)

- https://uxplanet.org/micro-interactions-a-complete-beginners-guide-b446d90215ec (accessed 2026-06-24)
- https://uxplanet.org/best-practices-for-microinteractions-9456211aeed0 (accessed 2026-06-24)
