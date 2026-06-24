---
source:
  - https://www.nngroup.com/videos/the-3-sizes-of-ux-copy/
  - https://www.nngroup.com/articles/ux-copy-sizes/
  - https://www.nngroup.com/articles/3-is-of-microcopy/
publisher: Nielsen Norman Group
author: Taylor Dykes (video + companion article); 3 I's article by Taylor Dykes
published: 2026-06-08 (video); companion article 2025-05-16; 3 I's article 2025-08-01
accessed: 2026-06-24
---

# UX Copy: Long-form, Short-form, Microcopy

> **TL;DR** — UI text comes in three sizes; pick the size by *what the user needs at that moment*, not by habit. Microcopy (<3 sentences) is the highest-leverage text you write — labels, errors, toasts, hints — and it must inform, influence, or guide an interaction. Never make the user guess what a button does or why a form failed.

## The 3 sizes

- **Long-form copy** — **3+ paragraphs** forming a coherent unit. Lives in onboarding tours, help/docs pages, policy pages, billing/legal, technical docs, case studies, "about" pages. Use it only when the user *wants* depth (a multi-step troubleshooting task, a commitment decision like a purchase or contract) — depth creates trust when stakes are high, but walls of text kill scanning. Rule: never ship long-form naked; always structure it with headings, subheadings, and scannable short-form/microcopy so users can jump to the part they need.
- **Short-form copy** — **2–3 paragraphs** conveying **one main idea**. Lives in page intros, section descriptions, empty-state bodies, accordion answers, onboarding step explanations, product descriptions, mission statements. It's the default size for "explain this quickly." Rule: one idea per block; if a block answers two questions, split it. Don't reflexively compress genuinely complex topics into short-form — that breeds distrust.
- **Microcopy** — **fewer than 3 sentences** (often 1–4 words). Lives in button labels, link labels, field labels/hints, input-control labels, page titles, meta descriptions, **error messages, tooltips, toasts, placeholders, breadcrumbs, tab names, push notifications**. It is the *most-read* copy in any interface because it's the most scannable, and it makes up the bulk of the words a user actually processes. Rule: every piece of microcopy has exactly one primary job — inform, influence, or guide interaction.

## Microcopy rules for engineers

- **Button labels = verb + object** ("Create campaign", not "Submit"; "Invite teammate", not "OK"). The label should describe the outcome of the click.
- **Error messages name the problem *and* the fix** — "Email is already in use. Sign in or use a different address." Not "An error occurred" and never a raw machine code (`ERR_409`) shown to a human.
- **A placeholder is NOT a label.** Placeholders vanish the moment the user types, leaving them with no memory of what the field was. Always render a persistent `<label>`; use placeholder only to show an *example* format ("e.g. jane@acme.com") or accepted input ("City or airport").
- **Destructive actions get a clear verb + the consequence.** "Delete project" not "Confirm"; pair it with the cost in the body ("This permanently removes 42 cards and 8 collaborators. This cannot be undone.").
- **Confirm vs Cancel buttons are labeled by outcome, not "Yes/No"** — "Delete project" / "Keep project". "Yes/No" forces the user to re-read the question to map which button is safe.
- **Loading copy stays short and human** — "Saving…" not "Processing your request, please wait…". For long ops, say what's happening ("Generating report…") so the wait feels explainable, not broken.
- **Tooltips define or clarify in context** — one line, and (per NN/g) **every icon should have a label**; don't hide a control's meaning behind an unlabeled glyph.
- **Empty states are microcopy opportunities, not voids** — "No campaigns yet. Create your first campaign to start scheduling posts." Always pair the void with a first action.

## Frontend-actionable rules

- **Externalize all copy from day one** — every string in a `messages.ts` / i18n dictionary, never inline JSX literals. Retrofitting i18n is 5× the cost and you'll miss system-generated strings (toasts, errors). Treat copy like a public API: stable keys, swap-able values.
- **Keep button labels to ~2 words.** If a label needs more, the action is probably ambiguous — redesign the flow, don't lengthen the button.
- **Ban inside-baseball jargon on user surfaces** — "Execute Workflow Step", "Provision Agent", "Flush Queue" are engineering terms. Say "Run", "Connect", "Clear" (or whatever the user calls it). The system noun and the user-facing verb can differ.
- **Write the empty-state copy when you build the empty state** — the zero-records view, the first-run view, the permission-denied view. These are not "later." A blank screen with no guidance is a bug.
- **Match the size to the user's moment, not the writer's habit** — a setting tooltip is microcopy, not a paragraph; a billing FAQ is short-form, not a single button. Defaulting everything to the middle size is how important detail gets lost.
- **One primary goal per microcopy unit** — if a tooltip tries to inform *and* influence, it does neither well. Classify each snippet (inform / influence / interact) and cut anything that doesn't serve that goal.
- **Test copy with 5 users** — bad copy fails fast in a usability test ("I didn't know what that button would do"). Copy is a usability variable, not a polish step.

## Anti-patterns to avoid

- **Placeholder-as-label** — field with no persistent label, relying on placeholder text that disappears on focus.
- **"Click here" / "Learn more" link text** — says nothing out of context (screen readers list links as a flat menu; "Click here" is useless there).
- **Generic "An error occurred"** — names no problem, offers no fix. Worse than no message.
- **Machine codes / stack traces shown to users** — `ERR_VALIDATION_409`, `TypeError: undefined`. These go to logs + Sentry, never the UI.
- **Confirm dialogs with "OK" / "Cancel"** — "OK" answers no question. Label by the outcome the button triggers.
- **Button labels that are nouns or the system's verb** — "Submit", "Execute", "Process" tell the user nothing about *what* happens next.
- **Hiding an icon's meaning behind no label** — users guess, guess wrong, and don't click.
- **Compressing a genuinely complex decision into short-form** — stripping nuance from a high-stakes choice (pricing, deletion, data sharing) erodes trust.
- **Defaulting everything to short-form** — when the user *wants* depth (docs, policy), bite-sized copy feels evasive.

## Quick checklist

- [ ] Every interactive element has a verb+object label (no "Submit", "OK", "Click here").
- [ ] Every form field has a persistent `<label>`; placeholder is example-only, never the label.
- [ ] Every error message names the problem + the fix; no machine codes, no generic "error occurred".
- [ ] Every destructive action names the consequence ("permanently deletes N items, cannot be undone").
- [ ] Every confirm dialog's buttons are labeled by outcome, not Yes/No.
- [ ] Every empty state / first-run / zero-records view has guidance + a first action.
- [ ] All copy lives in an i18n dictionary, not inline JSX literals.
- [ ] Every icon has an accessible label (tooltip or visible text); no unlabeled glyphs.

## Source

- "The 3 Sizes of UX Copy" (video), Taylor Dykes, Nielsen Norman Group — https://www.nngroup.com/videos/the-3-sizes-of-ux-copy/ (published 2026-06-08, accessed 2026-06-24)
- "UX Copy Sizes: Long, Short, and Micro" (companion article), Nielsen Norman Group — https://www.nngroup.com/articles/ux-copy-sizes/ (published 2025-05-16, accessed 2026-06-24)
- "The 3 I's of Microcopy: Inform, Influence, and Interact", Nielsen Norman Group — https://www.nngroup.com/articles/3-is-of-microcopy/ (published 2025-08-01, accessed 2026-06-24)
