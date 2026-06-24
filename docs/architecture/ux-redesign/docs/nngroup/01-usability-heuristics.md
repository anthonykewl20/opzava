---
source: https://www.nngroup.com/articles/ten-usability-heuristics/
publisher: Nielsen Norman Group
author: Jakob Nielsen (updated 2020 by Kate Moran, Feifei Liu; visuals by Kelley Gordon)
published: 1994-04-24 (originally); article revised 2020
accessed: 2026-06-24
---

# 10 Usability Heuristics (Nielsen)

> **TL;DR** — Ten broad interaction-design rules of thumb (not specific guidelines). Apply them as a checklist during design review: every screen should tell the user what's happening, speak their language, let them back out, stay consistent, prevent errors, show rather than demand recall, flex to skill level, stay minimal, recover gracefully from errors, and offer help when needed.

## The 10 heuristics, translated for frontend work

1. **Visibility of system status** — keep users informed with timely feedback.
   - Show `aria-live` toasts for async outcomes; set `aria-busy` on regions loading data; surface optimistic UI then reconcile.
   - Any work taking >400ms needs a progress indicator (spinner / skeleton / determinate bar); >2s needs a "this is taking a while" state.
   - Disabled vs. actionable states must be visually distinct; never leave a button looking clickable when the action is in flight.

2. **Match between the system and the real world** — use the user's language, not internal jargon; follow real-world conventions.
   - Label buttons with the verb/outcome ("Approve campaign"), never the system noun ("Execute Workflow Step").
   - Order steps the way the user thinks about the task, not the order your API calls happen; default dates/times to the user's locale and timezone.
   - Icons must match widely-learned conventions (trash = delete, magnifier = search); avoid invented glyphs that require a legend.

3. **User control and freedom** — provide a clearly marked emergency exit; support undo.
   - Destructive actions get a confirm dialog; reversible actions get a short undo window (toast with "Undo") instead of blocking confirms.
   - Multi-step flows (wizards, drawers, modals) must be closable/dismissible without data loss, or persist draft state on close.
   - Never trap focus or block the back button; modals must restore focus to the trigger on close.

4. **Consistency and standards** — users shouldn't wonder if two words/actions mean the same thing; follow platform and industry conventions (Jakob's Law).
   - Use one component library / design token set across the app; never hand-roll a second button or input style.
   - Pick one term per concept ("Run" vs "Execute" vs "Dispatch") and enforce it in a glossary; reuse the same icon for the same action everywhere.
   - Follow platform conventions: `Cmd/Ctrl+S` saves, `Esc` closes overlays, `Enter` submits the focused form.

5. **Error prevention** — eliminate error-prone conditions, or check and confirm before committing. Two failure modes: slips (inattention) and mistakes (wrong mental model).
   - Disable submit until the form is valid; validate on blur, not only on submit; show inline constraint hints ("3–20 chars") before entry.
   - For destructive/irreversible actions, require confirmation with the consequence stated ("This permanently deletes 42 cards").
   - Constrain inputs at the type level (date pickers not free text for dates, number inputs for quantities) to remove slip opportunities.

6. **Recognition rather than recall** — make elements, actions, and options visible; minimize memory load.
   - Show recently used / suggested options in dropdowns and command palettes rather than forcing the user to remember names.
   - Keep field labels and required-affordances visible (not hidden behind hover); persist context (selected filters, current view) across navigation.
   - Breadcrumbs and clear page titles let users recognize where they are without reconstructing the path.

7. **Flexibility and efficiency of use** — cater to novice and expert; offer shortcuts and tailorability.
   - Provide accelerators hidden from novices: keyboard shortcuts, a command palette (`Cmd+K`), bulk actions for power users.
   - Let users customize high-frequency flows (default columns, saved views, pinned items); remember their last-used state.
   - Sensible defaults that serve the 80% case, with an advanced path for the rest.

8. **Aesthetic and minimalist design** — every extra unit of information competes with the relevant ones; keep content and visual design focused on essentials.
   - One primary CTA per view; secondary actions demoted visually. Whitespace is a feature, not wasted space.
   - Cut anything irrelevant to the task on that screen; move rarely-used controls into a disclosure or settings panel.
   - Visual hierarchy (size, weight, color) must match task priority — the most important element should be the most prominent.

9. **Help users recognize, diagnose, and recover from errors** — plain-language messages, precise problem, constructive solution.
   - Never show raw stack traces or codes as the primary message; lead with what went wrong and the next step in human terms.
   - Inline field errors point at the offending field with a fix suggestion ("Email needs an @"), not a generic banner at the top.
   - Error states are visually distinct (red + icon) and accessible (`role="alert"`); offer a recovery action (retry, contact, undo) in the message.

10. **Help and documentation** — best if unnecessary, but when needed: searchable, task-focused, concise, concrete steps.
    - Surface help in context (tooltips, "?" affordances, empty-state coaching) rather than only in a separate docs site.
    - Link deep into docs from specific UI (e.g., a "Learn how approvals work" link on the approvals panel), not a generic homepage.
    - Keep docs step-by-step and current with the UI; stale screenshots violate heuristic 4 and 10 simultaneously.

## How to use this doc

Pull this out when: building a new panel or route (run the checklist before opening a PR); reviewing a teammate's UI diff; triaging a UX bug report (map the complaint to a heuristic to find the systemic fix); or pushing back on a design that "feels off" — name the heuristic rather than arguing taste. The heuristics are deliberately broad; use them to frame decisions, not to replace user testing.

## Anti-patterns to avoid

- Silent async actions: user clicks, nothing changes, result appears (or doesn't) with no signal.
- Internal jargon leaked into UI: "Artifact", "Workflow", "Step ID" shown where a plain verb would do.
- Confirm-everything modal fatigue; conversely, no confirm on irreversible deletes.
- Inconsistent components: a third button style "just for this one screen."
- Generic "Something went wrong" errors with no path to recover.
- Hidden state: the user must remember a filter they set two screens ago.
- Optimizing for the first-time user only, so power users can't move fast.

## Quick checklist

- [ ] Does every async action show status within ~400ms (loading state, then outcome)?
- [ ] Is every label in the user's language (verb + outcome), free of internal jargon?
- [ ] Can the user leave/undo any non-trivial action without a dead end?
- [ ] Does the screen reuse the shared component library and design tokens — no one-off styles?
- [ ] Are destructive or error-prone actions guarded (confirm / undo / disabled-until-valid)?
- [ ] Is the current location and key context visible without scrolling or recalling?
- [ ] Is there a primary CTA and is it visually dominant? Is clutter cut to essentials?
- [ ] Do error messages name the problem in plain words and suggest a fix?
- [ ] Is in-context help linked where a user is likely to get stuck?

## Source

- "10 Usability Heuristics for User Interface Design", Nielsen Norman Group — https://www.nngroup.com/articles/ten-usability-heuristics/ (originally published 1994-04-24, revised 2020; accessed 2026-06-24)
