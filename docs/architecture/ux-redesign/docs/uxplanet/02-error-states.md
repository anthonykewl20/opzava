---
source:
  - https://uxplanet.org/how-to-write-the-perfect-error-message-ffc132fda06a
  - https://uxplanet.org/on-writing-error-messages-84cf9e2ce879
  - https://uxplanet.org/quick-guide-to-error-handling-40f86e9d1962
publisher: UX Planet (Medium)
author: James Scott, Nick Babich, Carlota Antón (distilled)
published: 2019-02-20
accessed: 2026-06-24
---

# Error States & Error Messages

> **TL;DR** — A good error message states the problem in plain language, then tells the user how to fix it; show it in context, never as a bare "Error" or a stack trace, and never blame the user.

## The anatomy of a good error message
The Microsoft/Apple gold standard distilled across the sources: a useful error message **informs** (a problem occurred), **explains** (why), and **resolves** (what to do next — change input, retry, or contact support). The user must be able to either **perform an action** or **change their behavior** as a result. Scott frames the non-negotiables as: be specific, be human, be clear and unambiguous, be concise (aim for 15–20 words per sentence; comprehension drops below 10% past 43 words). Babich adds the tight rule: *"describe the problem + offer a solution."* Tone is positive and neutral — never accusatory, never all-caps shouting.

## Where errors live (by type)
Choose the container by the failure's scope and recoverability — matching the wrong container to the error is itself a usability bug.

- **Inline field errors** — validation failures tied to one input. Show on blur or submit, **right next to the field** (never in a banner the user has to hunt for). Mark with `aria-invalid="true"` and a `role="alert"` region so screen readers announce it; focus the first invalid field on submit. Use an icon (`!` / `x`) in addition to red, since color alone fails color-blind users.
- **Form-level error summary** — when a submit fails multiple fields, a short summary block at the top with anchor links to each invalid field. Pair with the inline errors, don't replace them.
- **Toast / snackbar** — transient operation failures (save failed, network blip) that don't block the view. `aria-live="polite"`, auto-dismiss with a manual close, and an action (Retry) when recoverable. Reserve `aria-live="assertive"` for destructive/blocking cases only.
- **Section inline error state** — when one panel's data call fails mid-page (Antón's pattern): show the error in place inside that section, keep the rest of the page usable.
- **Full-view screens (404 / 500 / offline)** — illustration + one-line plain explanation + recovery actions (Retry / Go home / Contact support). These replace the route, not overlay it.
- **Boundary errors** — a React Error Boundary catches a render crash in one widget so a single broken panel can't blank the whole app; show a small inline "This part failed to load — Retry" instead of a white screen.

## Frontend-actionable rules
- **Name the problem AND the fix** in every message. "Email is invalid — use name@example.com" beats "Error."
- **Show the field error next to the field.** Contextless error banners force a visual hunt.
- **Don't disable submit as your only validation.** A greyed button with no explanation hides the constraint; validate on blur/submit and tell the user what's wrong.
- **Preserve user input on error.** Never clear the form — re-populate valid fields and only flag the invalid ones.
- **Offer a Retry button on network failures** and wire it to actually re-fire the request, not a page reload.
- **Never leak internals:** no stack traces, HTTP status codes, raw error codes (`0xC00000EA`), request IDs, or SQL to end users. Log them server-side; show a human message client-side.
- **Distinguish recoverable from non-recoverable.** Recoverable → Retry / undo / fix input. Non-recoverable → tell them it's logged and give a contact path. Match the container to the answer.
- **Keep it to one or two short sentences.** Comprehension is ~100% at ≤8 words and collapses past 43.
- **Speak the user's language, not the developer's.** "Password needs an uppercase letter and a symbol," not "Regex validation failed on field `pwd`."

## Anti-patterns to avoid
- **Generic cop-outs:** "Something went wrong," "Error. Please try again later," "An error has occurred" — the Windows 10 "Something happened" meme. No problem named, no fix offered.
- **Blame-the-user wording:** "You entered an invalid email," "Invalid credentials" — reframe as the system's need ("That email doesn't match our records").
- **Errors that clear the form** — forces the user to retype everything; a punishment for failing.
- **Error conveyed by color alone** — invisible to ~8% of color-blind men. Always pair red with an icon and text.
- **All-caps or exclamation shouting** — reads as yelling; raises anxiety without adding information.
- **`alert()` / `confirm()` dialogs** — blocking, ugly, unfocusable, non-stylable; use a proper toast or inline component.
- **Developer jargon & raw codes** in the UI (keep them in Sentry/logs).
- **Apology-only messages** ("Sorry!" / "Oops!") with no explanation or next step — polite but useless.
- **Anthropomorphizing** the system as if it thinks/feels (unless it's an actual assistant persona).

## Quick checklist
- [ ] Every error names the **problem** and the **fix** — never "Error" alone.
- [ ] Field errors render **inline, next to the field**, with `role="alert"` + `aria-invalid`.
- [ ] On failed submit, the **first invalid field is focused** and input is preserved.
- [ ] Network/operation failures offer a **Retry** action.
- [ ] **No stack traces, HTTP codes, or request IDs** reach the end user.
- [ ] Color is never the only signal — an icon + text accompany red.
- [ ] Recoverable vs non-recoverable failures route to the right container (toast vs full-view vs boundary).
- [ ] A React **Error Boundary** wraps any panel whose render crash shouldn't blank the app.

## Source(s)
- James Scott, "How to write the perfect error message," UX Planet (2019-02-20) — https://uxplanet.org/how-to-write-the-perfect-error-message-ffc132fda06a (accessed 2026-06-24)
- Nick Babich, "On writing error messages," UX Planet (2020-09-25) — https://uxplanet.org/on-writing-error-messages-84cf9e2ce879 (accessed 2026-06-24)
- Carlota Antón, "A quick guide to error handling — for mobile apps," UX Planet (2022-09-09) — https://uxplanet.org/quick-guide-to-error-handling-40f86e9d1962 (accessed 2026-06-24)
