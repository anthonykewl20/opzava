---
source:
  - https://uxplanet.org/best-practices-for-modal-window-design-627f7aba57f1
  - https://uxplanet.org/modal-vs-page-a-decision-making-framework-34453e911129
publisher: UX Planet (Medium)
author: Nick Babich (best practices) + Ryan Neufeld (modal vs page framework)
published: 2021-04-27
accessed: 2026-06-24
---

# Modals, Dialogs & Overlays

> **TL;DR** — A modal creates a mode that disables the parent screen but keeps it visible, forcing the user to resolve one focused task before returning. Use them sparingly: only for a single, contextual, interrupt-driven action (confirm, quick edit, irreversible warning). Reach for a page, route, or side drawer for anything multi-step, long, or navigational — and never build one without focus trapping, scroll-lock, and a real escape hatch.

## When to use a modal (and when NOT)

A modal exists to convey important information **without losing the context of the current screen**. It is appropriate when blocking the background is the *point* — the user must answer before continuing. If that interruption isn't essential, the same content is almost always better delivered modelessly, inline on the page.

**Use a modal for:**
- A single focused task that interrupts the flow (confirm a destructive action, quick edit, login, irreversible-operation warning).
- A short answer the user must give before they can proceed.

**Do NOT use a modal for:**
- Multi-step / wizard flows, complex or long forms — use a dedicated page/route.
- Long content that needs a scrollbar — use a page or a side drawer/panel.
- Navigation between views — a modal that navigates away risks leaving the original task unfinished.
- Error, loading, or success states — show inline (errors next to input, loading in the trigger button, success in context or on a page).
- System-initiated promotion or non-urgent info (newsletter popups, announcements) — users find uninvited modals annoying and instinctively hunt for the dismiss button.

**Rule of thumb (Neufeld's decision question):** if your content requires scrolling, has more than two actions, or represents a distinct destination in the information architecture, it is a page, not a modal. A full-screen mobile dialog is the only case where size is acceptable.

## Modal best practices

- **One clear primary action.** A modal should not carry more than two actions; a third (e.g. "Learn more") tempts the user off-task.
- **Match the title to the primary button.** An explicit, outcome-stating label beats generic verbs: ask "Delete project?" with actions "Delete" / "Cancel", not "Are you sure?" with "Yes" / "No".
- **Destructive/irreversible actions need explicit confirmation** — this is one of the few legitimate uses of a system-initiated modal.
- **Always provide a dismiss path:** an explicit `X` (top-right) and/or a `Cancel` button, plus click/tap on the backdrop to close.
- **Keep content to a sentence or two.** If you are adding a scrollbar, stop — it's a page.
- **Size appropriately** — ideally ≤ ~25% of the viewport; never the full screen (mobile excepted). The overlay scrim should darken the background so the modal reads as "above" the parent.
- **Position in the line of sight** (centered, in-viewport on open). A modal the user must scroll to find reads as the app being frozen.
- **Maintain visual consistency** with the parent application — it must feel like part of the thing it is blocking.
- **Don't nest modals.** A modal that opens a modal is a sure way to create bad UX and visual complexity.
- **Prefer user-initiated over system-initiated.** Restrict system-initiated modals to genuinely urgent messages.

## Accessibility (non-negotiable)

- `role="dialog"` (use `role="alertdialog"` for destructive/confirms), `aria-modal="true"`, `aria-labelledby` pointing at the title, `aria-describedby` for the body.
- **Move focus INTO** the modal on open, and **trap it there** — Tab/Shift+Tab must cycle within the dialog, never reach the disabled background.
- **Restore focus to the triggering element** on close.
- **`Escape` closes** the modal; backdrop click closes (for non-destructive).
- **Lock background scrolling** (`overflow: hidden` on `<body>`, or mark the background `inert`) so the page behind doesn't move.
- Full keyboard operability: every control reachable and operable by keyboard.
- Visible focus ring; announce the dialog to screen readers on open.
- Respect `prefers-reduced-motion` on enter/exit transitions.

## Frontend-actionable rules

- **Prefer a primitive over hand-rolling.** `@radix-ui/react-dialog` (or Headless UI `Dialog`) handles focus trap, focus restore, ESC, scroll-lock, portal, and `aria-*` for free. Re-implementing these is where accessibility bugs live.
- **Render into a portal** at the top of the DOM tree (`document.body`) — escapes `overflow: hidden` / `transform` / `z-index` stacking contexts in parent components.
- **Manage open state at the nearest needed owner** — usually the component holding the trigger button, not global state, unless the modal is opened from many places.
- **Close on route change** so a stale modal doesn't outlive navigation (subscribe to route, or unmount via key).
- **Never open a modal on page load.** Modals should be user-initiated (or truly urgent system messages), never a surprise overlay on first paint.
- **Button copy = outcome.** `<button>Delete project</button>`, not `OK`.
- For confirm flows, use the `AlertDialog` variant (Radix exposes it) — it locks semantics to "you must respond."

## Anti-patterns to avoid

- Modals for everything — navigation, long forms, settings (it's a page).
- Nested modals (modal-on-modal).
- No escape — missing `X`, missing `Cancel`, backdrop click disabled, ESC not wired.
- No focus trap — Tab leaks into the greyed-out background.
- Content taller than the viewport with no internal scroll, or a modal the user must scroll to find.
- Modal on page load / system-initiated promo popups.
- Destructive confirm with a generic "OK" / "Yes" button.
- Using a modal for error/loading/success states instead of inline context.
- More than two actions inside one modal.

## Quick checklist

- [ ] One focused task; ≤ two actions; content fits without a scrollbar (mobile full-screen excepted).
- [ ] Descriptive title; primary button labeled by outcome ("Delete project").
- [ ] Dismiss path present: `X` + `Cancel` + backdrop click + `Escape`.
- [ ] `role="dialog"` / `aria-modal="true"` / `aria-labelledby` (+ `describedby`); `alertdialog` for destructive.
- [ ] Focus moves in on open, is trapped, and restores to trigger on close.
- [ ] Background scroll locked (`overflow:hidden` / `inert`); rendered via portal.
- [ ] Built on Radix/Headless UI, not hand-rolled; close-on-route-change wired.
- [ ] Not opened on page load; not nested; not used for error/loading/success.
- [ ] Respects `prefers-reduced-motion`; visible focus ring.

## Source(s)

- https://uxplanet.org/best-practices-for-modal-window-design-627f7aba57f1 (Nick Babich, 2021-04-27; accessed 2026-06-24)
- https://uxplanet.org/modal-vs-page-a-decision-making-framework-34453e911129 (Ryan Neufeld, 2020-03-02; accessed 2026-06-24)
