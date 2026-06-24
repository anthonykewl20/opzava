---
source: https://www.nngroup.com/articles/ui-elements-glossary/
publisher: Nielsen Norman Group
author: Nielsen Norman Group (corporate glossary, no individual byline)
published: 2025-02-28
accessed: 2026-06-24
---

# UI Elements Glossary (for frontend)

> **TL;DR** — Pick the native HTML element whose semantics already match the control; reach for ARIA roles only when no native element fits, and never build an interactive control out of bare `<div>`s.

## Input controls

**Button** — triggers an action (submit, start process, confirm). Use when the user is *doing* something, not *choosing* a value. React: `<button type="button|submit">`. Common mistake: `<div onClick>` — loses keyboard, focus, and role; always use `<button>`.

**Checkbox** — two-state (checked/unchecked) or a list where each item is independent. Use for multi-select and opt-ins; for mutually-exclusive use radio buttons. React: `<input type="checkbox">`. Mistake: building a "check" out of a styled span without `role="checkbox"` + `aria-checked` + Space toggling.

**Radio button** — pick exactly one from a mutually-exclusive set of 2–n options that should all be visible. Use when the options are few enough to show in full (≤ ~5–6); otherwise use a select/listbox. React: `<input type="radio" name="group">` sharing one `name`. Mistake: omitting the shared `name`, or hiding options behind a dropdown when the user benefits from seeing all choices.

**Toggle / Switch** — flips between two mutually-exclusive *states* of a setting (on/off, muted/unmuted), not a one-shot action. Use for instant-apply settings; prefer a button (`aria-pressed`) for momentary actions. React: `<button role="switch" aria-checked={on}>` (APG Switch pattern) — `role="switch"` carries `aria-checked`, **not** `aria-pressed` (that is the toggle-*button* pattern). Label the current state explicitly; never rely on color alone.

**Dropdown / Select (Dropdown list)** — choose one from a list that's hidden until opened. Use when there are too many options to show as radios and a single choice is needed; for multi-select or always-visible options use a listbox. React: native `<select>` / `<option>` for the common case; combobox (`<input>` + listbox + `role="combobox"`) when free text is allowed. Mistake: a custom div-menu missing keyboard arrow/Type-ahead handling that `<select>` gives free.

**Textbox / Text field** — type free text, single- or multi-line. The form primitive. React: `<input type="text|email|password|number|...">` or `<textarea>`; pick the most specific `type` for the input. Always pair with a `<label>` (or `aria-label`/`aria-labelledby`); placeholder is not a label.

**Slider** — pick a value along a continuous or stepped range where the exact number is secondary (volume, thresholds). Use when exploration/relative change matters; use a number input when precise entry matters. React: `<input type="range" min max step>`; expose the value with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` if custom. Mistake: no keyboard support — native `range` handles arrows; a custom div-handle usually doesn't.

**Date picker** — select a date, often via a calendar grid. Prefer a calendar picker (visual) for familiar dates and an editable text field for known dates like birthdays. React: native `<input type="date|datetime-local">` is the floor; custom calendar must implement grid navigation (arrow keys, `role="grid"`/`role="application"`) — high cost, prefer a vetted lib.

**Input stepper** — nudge a number by fixed steps. Use for small, bounded increments around a default. React: `<input type="number">` (browsers render steppers) or `+`/`-` `<button>`s + a labelled field. Avoid when the user may want large jumps — a number field is better.

## Navigational elements

**Breadcrumb** — shows the path from root to the current page in the IA. Use on deep hierarchies to orient and allow stepping up. React: `<nav aria-label="Breadcrumb"><ol>` of `<a>` links. Anti-pattern: rendering the current page as a link (it should be `aria-current="page"`, non-link).

**Pagination** — split a long list across pages and let users move through them. Use over infinite scroll when users need to locate/revisit a position. React: `<nav aria-label="Pagination">` with links/buttons; mark current page with `aria-current="page"`. Anti-pattern: pagination as `<div>`s with no keyboard focus or `aria-current`.

**Tabs (Tab bar)** — switch between a few views of the same content without leaving the page. Use for peer panels; use an accordion when users may want to scan multiple sections at once. React: `<div role="tablist">` + `role="tab"` (with `aria-selected`, `aria-controls`) + `role="tabpanel"` (with `aria-labelledby`); roving `tabindex`, arrow keys move between tabs. Anti-pattern: tabs as plain links with JS hide/show and no ARIA wiring.

**Navigation menu / Nav bar** — persistent entry points to the site/app's main areas. React: `<nav>` of `<a>`s (or a `<button>`-triggered disclosure menu for expandable variants). Anti-pattern: menu built of `<div onClick>`; use `<a>` for navigation and `<button>` for actions.

**Search field** — a textbox (often + submit) for free-text query entry. React: `<input type="search">` inside a `<form role="search">`; pair with `<label>`. Anti-pattern: search as an icon-only input with no accessible label.

**Tags / Badges** — badges flag counts/notifications on an icon; tags/labels classify items. Use sparingly to direct attention. React: badge = `<span>` with `aria-label` if it carries meaning; tag = `<li>` in a list, or `<a>`/`<button>` if interactive. Anti-pattern: relying on color alone — a red badge must also say "3 unread".

**Carousel** — rotate through a set of items (images/cards) to save space. High misuse risk; many users skip auto-rotating content. React: a region with `aria-roledescription="carousel"`, each slide a group with `aria-label="N of M"`, pause control required if auto-advancing. Anti-pattern: auto-advance with no pause, or controls keyboard-inaccessible.

## Informational components

**Tooltip** — brief helper text on hover/focus over a target. Use to clarify an icon or label, never to carry essential info (touch users and keyboard users often miss it). React: show on **both** `:hover` and `:focus`, dismiss with `Esc`, link with `aria-describedby` to the tooltip element. a11y: must be discoverable by mouse, keyboard, and (ideally) touch — if the info is required, put it inline, not in a tooltip.

**Icon** — small graphic communicating an object/action/idea. Use to reinforce text; most icons need a text label. React: `<svg aria-hidden="true">` when decorative (label on the adjacent text/button), or `<svg role="img" aria-label="...">`/`<img alt="...">` when meaningful alone. a11y: never the sole carrier of meaning; pair with text.

**Progress bar** — shows determinate progress toward completion (percentage filled). Use for tasks > ~10s; use a spinner for < ~3s. React: `<progress>` (native) or `<div role="progressbar" aria-valuenow aria-valuemin="0" aria-valuemax="100">`. a11y: announce start and completion; bind `aria-valuenow` so it updates live.

**Notification / Snackbar / Toast** — transient nonmodal status message that auto-dismisses. Use to confirm an action or surface system status; can include an action (Undo). React: render into a live region (`role="status"` / `aria-live="polite"`; `assertive` only for urgent). a11y: must be announced to AT, dismissible, and not block interaction; don't stack so many they compete.

**Modal / Dialog** — overlay forcing a decision before returning to the app; modal blocks the background, nonmodal doesn't. Use only when the user *must* act before proceeding. React: `<dialog>` (native, with `showModal()`) or `<div role="dialog" aria-modal="true" aria-labelledby>`. a11y: trap focus inside, restore focus on close, close on `Esc`, keep a visible focus ring; label the dialog.

**Message box / Popup tip** — a small overlay carrying an informative message; the popup tip is the touch/no-hover equivalent of a tooltip (triggered by tapping an "i"/"?"). React: disclosure `<button aria-haspopup aria-expanded>` + an overlay with `role="tooltip"` or a labelled region. a11y: same keyboard/touch reachability rules as tooltips.

## Containers

**Accordion** — expands in place to reveal hidden content; compresses long pages. Use when users need only one section at a time. React: `<button aria-expanded aria-controls="panel-id">` header + a panel region; the pair is the core contract (optionally `aria-disabled` if disabled). a11y: `aria-expanded` must reflect state; one-or-many-open is a design choice, not an a11y one.

**Card** — a container for a few related pieces of info (a conceptual unit). Use to group a record's summary; treat as a whole. React: usually `<article>` or `<section>` (a `<li>` if in a list/grid); make the card's primary action a real `<a>`/`<button>`, not a click on the whole card. a11y: clickable-card anti-pattern — wrap a single `<a>` over the title rather than `onClick` on the `<div>` (loses semantics + keyboard).

**Carousel** *(see Navigational)* — also acts as a rotating container; same a11y rules: labelled slides, pause control, keyboard-operable.

## Frontend-actionable rules

- **Match the native element first.** `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`, `<progress>`, `<details>` cover most controls with correct semantics + keyboard for free; ARIA is the override, not the default ("No ARIA is better than bad ARIA").
- **Radio vs select vs segmented control:** radio buttons when ≤ ~5–6 mutually-exclusive options should be visible; `<select>` when the list is long or space is tight; segmented control (tabs-like) when switching a *view/filter* rather than a form value.
- **Toggle vs button vs checkbox:** `role="switch"` + `aria-checked` for an on/off *setting* (instant apply); `<button aria-pressed>` for a momentary toggle (mute, pin); `<input type="checkbox">` for a yes/no *form* choice that's submitted.
- **Label everything.** Every input, switch, select, and combobox has a programmatic label (`<label>`, `aria-label`, or `aria-labelledby`); placeholder is never a label.
- **Never build a control from a `<div>`.** If you must, add the role, the state attribute, keyboard handlers, focus management, and `tabindex` — but first ask why a native element won't do.
- **Wire the state attribute.** `aria-expanded` (accordion/disclosure/menu), `aria-selected` (tabs/listbox), `aria-checked` (checkbox/switch/radio), `aria-pressed` (toggle button), `aria-current="page"` (nav/breadcrumb/pagination) — these are the contract between your component and assistive tech.
- **Progress feedback scales with duration:** spinner (< ~3s) → progress bar (> ~10s) → skeleton screen (full-page load).

## Anti-patterns to avoid

- `<div onClick>` as a button/link/tab — no role, no keyboard, no focus ring.
- Tooltip or icon as the *only* carrier of essential information.
- Placeholder text standing in for a label.
- Auto-advancing carousel with no pause control, or competing simultaneous toasts.
- Modal that doesn't trap/restore focus or close on `Esc`.
- A "switch" built with `aria-pressed` (that's a toggle button) — switches use `aria-checked`.
- Hiding mutually-exclusive options behind a select when there are few enough to show as radios.
- A whole card clickable via `onClick` instead of a real `<a>`/`<button>` inside it.
- Color-only badges/states (e.g., "unread") with no text or `aria-label`.

## Quick checklist

- [ ] Did I use the native element that already matches this control (`<button>`, `<input>`, `<select>`, `<a>`, `<progress>`)?
- [ ] Does every input/switch/menu have a programmatic label?
- [ ] Is each state attribute wired correctly (`aria-expanded` / `aria-selected` / `aria-checked` / `aria-pressed` / `aria-current`)?
- [ ] Is the control fully operable by keyboard (Tab/arrow/Enter/Esc) with a visible focus ring?
- [ ] Are overlays (tooltip/dialog/toast) discoverable by hover **and** focus, dismissable, and focus-managed?
- [ ] Is the right "pick-one" control chosen (radio ≤ ~5–6 visible, else select; segmented for view-switching)?
- [ ] Do progress indicators match duration (spinner/progress bar/skeleton) and announce to AT?
- [ ] Is essential info never hidden behind an icon, tooltip, or color alone?

## Source

- "User-Interface Elements: Glossary", Nielsen Norman Group — https://www.nngroup.com/articles/ui-elements-glossary/ (published 2025-02-28, accessed 2026-06-24). ARIA roles verified against the W3C ARIA Authoring Practices Guide (Switch pattern: `role="switch"` + `aria-checked`) and MDN.
