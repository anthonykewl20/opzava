---
source:
  - https://uxplanet.org/7-alternatives-to-dark-ux-patterns-9db1b6d4fe2c
  - https://uxplanet.org/dark-patterns-in-ux-design-what-they-are-and-why-we-should-avoid-them-5481d7769bb5
  - https://uxplanet.org/ux-manipulation-how-to-prevent-the-long-term-mistrust-of-your-brand-7e66434324b4
publisher: UX Planet (Medium)
author: Dhananjay Mukerji (primary), Matthaios Mantzios (secondary); catalog synthesized from deceptive.design / Brignull-Gray canon
published: 2025-09-11
accessed: 2026-06-24
---

# Dark Patterns (to avoid)

> **TL;DR** — Dark patterns are interfaces deliberately built to manipulate users into choices they wouldn't make with full information (named by Harry Brignull, 2010). This is a **DO-NOT-BUILD** list. Every one of these erodes trust, may break the law, and has an honest equivalent.

## The catalog (name + what it is + the ethical fix)

- **Confirmshaming** — The opt-out path guilts or embarrasses the user. *Example:* "No thanks, I hate saving money." *Fix:* a neutral, equal-weight decline label ("No thanks") — both buttons styled identically.
- **Forced Continuity** — Free trial that takes a card up front and silently bills when it ends, with no clear reminder. *Fix:* explicit pre-expiry notice; let the user cancel in one click before any charge.
- **Sneaking** — Hiding an item, charge, or opt-in inside a flow so the user doesn't notice it (items added to cart, a checked box below the fold). *Fix:* show every addition and every cost in plain sight, in-place, before commitment.
- **Misdirection** — Visual weight (color, size, motion) steers the user toward the option that benefits the business, not them. *Fix:* the visually dominant action should be the one in the *user's* interest; equal options get equal styling.
- **Roach Motel** — Easy to get in, hard or impossible to get out (one-click subscribe, multi-screen labyrinth to cancel). *Fix:* cancellation must be the same number of steps and the same difficulty as sign-up.
- **Privacy Zuckering** — Tricking the user into sharing more data than they realize. *Fix:* opt-IN for any data beyond what the feature strictly needs; explain each collection in plain language at the moment of collection.
- **Bait and Switch** — The user intends one action and is routed into another (the "X" on a modal actually starts a flow). *Fix:* controls do exactly what their label and visual position promise; nothing hijacks a close button.
- **Hidden Costs** — The advertised price balloons at the final step with fees, taxes, or shipping the user couldn't foresee. *Fix:* show the full, final price (all-in) as early as possible — ideally on the product screen.
- **Trick Questions** — Double negatives, ambiguous phrasing, or inverted controls so the "yes" and "no" meanings are unclear. *Fix:* one clear positive phrasing; the checked/unchecked state maps to an obvious outcome.
- **Preselected marketing/email checkboxes** — The opt-in is checked by default. *Fix:* all marketing and secondary email boxes start unchecked; consent must be affirmative.

## Why they're a liability

They are not just unethical — they are increasingly **illegal**. GDPR (Art. 4(11), Art. 7) requires freely-given, specific, informed consent; the FTC has brought enforcement against "hard-to-cancel" subscriptions; the **EU Digital Services Act** (effective 2024) explicitly bans dark patterns on online platforms; and **California's Automatic Renewal Law** mandates clear disclosure and easy cancellation (the "click-to-cancel" rule). A 2019 Princeton study found ~11% of surveyed shopping sites used potentially unlawful tactics. Beyond regulation: dark patterns produce churn, public call-outs, and lasting brand damage. For an **internal B2B tool**, the cost is different but steeper — they destroy team goodwill and the operator's trust in their own control plane. They are the unethical mirror of legitimate behavioral-economics friction (see `nngroup/10-behavioral-economics.md`) — same psychology, opposite intent.

## The ethical design rules

- Make **cancellation as easy as sign-up** — same click count, same place.
- Offer **one clearly preferred path**, and that path must be in the **user's** interest, not the business's.
- **Honest defaults**: no pre-checked marketing, email, or data-sharing opt-ins. Ever.
- **Transparent pricing** before any commitment — full, all-in price up front.
- **Opt-IN, not opt-OUT**, for anything beyond the strictly necessary — data, email, renewal.
- **Plain-language consent**: state what happens, not what's technically possible.
- Periodically **renew consent** for long-running subscriptions and data storage.

## Anti-patterns to avoid

Confirmshaming · Forced Continuity · Sneaking · Misdirection · Roach Motel · Privacy Zuckering · Bait and Switch · Hidden Costs · Trick Questions · Preselected opt-in checkboxes.

## Quick checklist

- [ ] Does the decline/opt-out path use **neutral language** and equal visual weight?
- [ ] Is **cancellation** achievable in the same number of steps as sign-up?
- [ ] Are all **marketing and email checkboxes unchecked by default**?
- [ ] Is the **full price** (with all fees) shown before commitment?
- [ ] Does the visually dominant action serve the **user's** interest, not ours?
- [ ] Is every data collection **opt-in** and explained in plain words at the moment of collection?
- [ ] If I were the user here, would I feel **honestly treated**?

## Source(s)

- https://uxplanet.org/7-alternatives-to-dark-ux-patterns-9db1b6d4fe2c (Dhananjay Mukerji, 2025-09-11; accessed 2026-06-24)
- https://uxplanet.org/dark-patterns-in-ux-design-what-they-are-and-why-we-should-avoid-them-5481d7769bb5 (Matthaios Mantzios, 2023-10-07; accessed 2026-06-24)
- https://uxplanet.org/ux-manipulation-how-to-prevent-the-long-term-mistrust-of-your-brand-7e66434324b4 (accessed 2026-06-24)
- Catalog taxonomy: deceptive.design / Harry Brignull (darkpatterns.org, 2010) and Colin Gray et al.
