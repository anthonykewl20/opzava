---
source:
  - https://uxplanet.org/designing-more-efficient-forms-structure-inputs-labels-and-actions-e3a47007114f
  - https://uxplanet.org/designing-more-efficient-forms-assistance-and-validation-f26a5241199d
publisher: UX Planet (Medium)
author: Nick Babich
published: 2016-04-10 (Structure/Inputs/Labels/Actions); 2016-04-13 (Assistance/Validation)
accessed: 2026-06-24
---

# Form Design

> **TL;DR** — Treat a form as a conversation: one column, top labels, only the fields you truly need, validate inline on blur (never per keystroke), keep the Submit button enabled, and make the primary action obvious. Friction kills conversion faster than any single field.

## Label & input rules

- **Top-aligned labels are fastest to scan** (Penzo eye-tracking; straight-line read path). Reserve left-aligned labels for high-stakes data (SSN, license) where you *want* users to slow down.
- Every field needs a real `<label for="id">` that **persists after the field is filled**. A label that vanishes on focus forces users to re-check from memory and is hostile to review.
- **Placeholder is never a label.** It disappears on input, reads as pre-filled data, and fails contrast checks. Use a *floating label* if you want the compact look — it animates to top-aligned on focus.
- Mark required (or, for mostly-required forms, optional) **consistently** — `*` or the word "optional," pick one and apply everywhere.
- **Right input type per field**: `type="email|tel|number|url|date"` triggers the correct mobile keyboard and native picker. Pair with `inputMode` for fine control.
- **Appropriate width** — a ZIP/postal box should look like 5–6 chars, not `width:100%`. Field width is a silent affordance for expected length.
- **Autofill via `autocomplete` attributes** (`given-name`, `email`, `street-address`, `postal-code`) so browsers and password managers fill correctly.
- **One column, not multi-column.** Multi-column triggers Z-pattern scanning and ambiguous field grouping; single column is a straight line to completion.

## Validation & errors

- **Validate inline on blur / after the field loses focus**, not on every keystroke (you can't judge validity mid-typing — `a@` is not yet wrong). Also confirm success, not just failure — positive feedback builds confidence.
- **Never disable Submit as the *only* feedback.** A disabled button forces users to hunt for the problem; an enabled button + targeted error is kinder. Disable only to prevent double-submits *during* the request.
- **Right place**: show the message **next to the field** (proximity = context), never in a banner alone.
- **Right color**: red = error, yellow = warning, green = success — but **never color-only** (accessibility: pair with icon + text).
- **Clear language**: state *what* went wrong and *how to fix it*. "Invalid email" is bad; "Enter an email like name@example.com" is good. No jargon.
- **Preserve input on error** — never wipe the form on a failed submit. Surface an **error summary** at the top that links/anchors to each broken field for screen-reader and keyboard users.
- **Tell password rules up front**; don't make users guess and fail. Show a live strength meter as they type.
- **Don't force a fixed input format** (e.g., `(123) 456-7890` phone masks that block paste/type-ahead). Accept what the user enters, format it on display/storage.

## Reducing friction

- **Ask only for what you need** — every extra field cuts conversion. Cut fields, then cut again.
- **Sensible/smart defaults** — pre-select country from geo-IP, etc. But avoid static defaults unless ~90% of users would pick them (pre-filled required fields get skipped, introducing errors).
- **Autofill known values** (Postel's Law: be liberal in what you accept).
- **Group related fields** into labeled sections (Contact / Shipping / Payment) — Miller's Law: chunked sets are comprehensible.
- **Inline formatting for phone/card** — format as the user types, don't gate on a mask.
- **Single-column flow** with a prominent **primary action** labeled with a verb+object ("Create account," "Send weekly offers"), never the generic "Submit."
- **Reduce secondary actions** to a maximum of one (e.g., Back), visually de-emphasized and placed out of the primary click zone.
- **Keyboard-friendly**: full Tab navigation, autofocus the first field with a visible focus ring, follow W3C ARIA Authoring Practices for custom controls (datepicker, combobox).

## Frontend-actionable rules

- **Controlled inputs with live validation** via React 19 `useActionState` / `useFormStatus`; keep validation pure and side-effect-free so it runs on blur.
- **Accessibility wiring on every errored field**: `aria-invalid="true"` + `aria-describedby` pointing at the error message `id`; the `<label>` stays associated via `htmlFor`.
- **Server actions**: `<form action={fn}>` for progressive-enhancement submissions that work without JS; return a serializable `errors` map keyed by field name.
- **Sensible `inputMode`** (`numeric`, `decimal`, `search`) and `autocomplete` tokens on every identity/payment field.
- **Focus management on submit failure**: after a server action returns errors, move focus to the error summary (or the first errored field) and scroll it into view — don't leave the user stranded at the bottom.
- **No `type="reset"` buttons.** Reset nukes user data; it is almost always pure evil.
- **Primary vs secondary visual weight**: primary action = filled/high-contrast; secondary = ghost/text style. Lukew's classic ratio — don't give them equal weight.

## Anti-patterns to avoid

- Placeholder-as-label (vanishes, fails a11y, looks pre-filled).
- Inline labels that disappear on focus with no persistent substitute.
- `Reset` / `Clear form` buttons that destroy entered data.
- Input masks that block paste or backspace-through-separators.
- ALL-CAPS labels or placeholders (kills word-shape recognition, fails scan).
- Multi-column forms (ambiguous grouping, Z-scan).
- Surprise required fields with no marker until submit.
- Fixed-format phone/date fields that reject valid input.
- Disabled-submit-as-only-validation (users can't see *why*).
- Generic "Submit" / "OK" button labels.

## Quick checklist

- [ ] One column; top-aligned persistent `<label>` per field, wired with `htmlFor`/`id`.
- [ ] Right `type` + `inputMode` + `autocomplete` on every field; width hints expected length.
- [ ] Required/optional marked consistently; password rules shown up front.
- [ ] Validation on blur (not per keystroke); success + failure feedback; red/yellow/green paired with icon+text.
- [ ] Submit stays enabled; errors shown next to field **and** in a linked summary.
- [ ] Input preserved on error; first error receives focus and scrolls into view.
- [ ] Primary action is verb+object and visually dominant; no Reset button; ≤1 secondary action.
- [ ] Full keyboard nav, visible focus ring, W3C ARIA patterns for custom controls.
- [ ] No masks that block paste; accept-then-format for phone/card/date.

## Source(s)

- https://uxplanet.org/designing-more-efficient-forms-structure-inputs-labels-and-actions-e3a47007114f (accessed 2026-06-24)
- https://uxplanet.org/designing-more-efficient-forms-assistance-and-validation-f26a5241199d (accessed 2026-06-24)
