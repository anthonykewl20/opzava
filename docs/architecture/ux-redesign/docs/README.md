# UX Research & Frontend-UX Reference Library

A curated, distilled set of **20 frontend-actionable UX references** scraped from two sources and
rewritten for engineers — not researchers. Every doc is tight, imperative, and tied to concrete
component/markup/React decisions so it's directly useful while building.

- **Scraped from:** [Nielsen Norman Group](https://www.nngroup.com/articles/) (authoritative,
  research-backed) and [UX Planet](https://uxplanet.org/) (practitioner patterns).
- **Produced:** 2026-06-24. Each doc carries its own frontmatter (`source`/`publisher`/`published`/
  `accessed`). Where a single doc blends two articles it uses a `sources:` list instead.
- **Method:** fetch the live article → distill to principle + "frontend-actionable rules" +
  anti-patterns + checklist → cite. No verbatim copying; no images.
- **Caveat / how to trust it:** numbers and thresholds (WCAG contrast, CWV, the "5 users" curve,
  the 400ms rule) are pinned in-doc. The underlying sources are authoritative (NN/g) or
  practitioner-grade (UX Planet). Before citing a specific figure externally, re-check it against
  the linked source — articles get revised. **Code wins; sources ground claims.**

## How to use this

- **Before a PR** for a new panel/flow → run `nngroup/01-usability-heuristics.md` (the 10
  heuristics) and `nngroup/02-heuristic-evaluation.md` (the cheap self-review method).
- **Building any data surface** (list/table/chart/dashboard) → read `uxplanet/01` → `03`
  (empty / error / loading) and design all states up front.
- **Building a form** → `uxplanet/04-form-design.md`.
- **Choosing a control or overlay** → `nngroup/06-ui-elements-glossary.md` + `uxplanet/09-modals-dialogs.md`.
- **Restructuring nav / IA** → `nngroup/07-card-sorting-ia.md` + `uxplanet/05-navigation-patterns.md`.
- **Writing button/error/empty copy** → `nngroup/09-ux-copy-microcopy.md`.
- **Designing flow + persuasion** → `uxplanet/07-laws-of-ux.md` + `nngroup/10-behavioral-economics.md`,
  and stay on the right side of `uxplanet/08-dark-patterns.md`.
- **Planning validation/research** → `nngroup/03` + `04` + `05` (method choice → cheat sheet → test
  with 5 users).

The highest-leverage rules from all 20 docs are condensed into the frontend skill's UX extension:
`~/.claude/skills/frontend/ux-reference.md`.

## By source

### Nielsen Norman Group — `nngroup/`

| # | Doc | One-liner |
|---|-----|-----------|
| 01 | [Usability Heuristics](nngroup/01-usability-heuristics.md) | Jakob's 10 heuristics, each translated to concrete UI/React rules. |
| 02 | [Heuristic Evaluation](nngroup/02-heuristic-evaluation.md) | The cheap pre-PR UX self-review method + 0–4 severity scale. |
| 03 | [Which UX Research Method](nngroup/03-ux-research-methods.md) | The 20 methods on 3 axes; pick by the question, not familiarity. |
| 04 | [UX Research Cheat Sheet](nngroup/04-ux-research-cheat-sheet.md) | Methods mapped to Discover/Explore/Test/Listen phases. |
| 05 | [Usability Testing (5 Users)](nngroup/05-usability-testing.md) | Why 5 users ≈ 85% of problems + how to run a discount test. |
| 06 | [UI Elements Glossary](nngroup/06-ui-elements-glossary.md) | Every control mapped to the right native/ARIA React element. |
| 07 | [Card Sorting / IA](nngroup/07-card-sorting-ia.md) | Structure nav from users' mental models, not your DB tables. |
| 08 | [Mapping the User](nngroup/08-mapping-the-user.md) | Empathy maps + journey maps → their "opportunities" are your backlog. |
| 09 | [UX Copy / Microcopy](nngroup/09-ux-copy-microcopy.md) | Long/short/microcopy + the verb+object rule for buttons/errors. |
| 10 | [Behavioral Economics](nngroup/10-behavioral-economics.md) | Friction as a dial: add to protect, remove to enable; ethical line. |

### UX Planet — `uxplanet/`

| # | Doc | One-liner |
|---|-----|-----------|
| 01 | [Empty States](uxplanet/01-empty-states.md) | 5 empty-state types; never ship a blank screen. |
| 02 | [Error States](uxplanet/02-error-states.md) | Problem + fix; inline/summary/toast/full-view/boundary by scope. |
| 03 | [Loading States](uxplanet/03-loading-states.md) | Skeleton vs spinner vs progress by duration; `isFetching ≠ isLoading`. |
| 04 | [Form Design](uxplanet/04-form-design.md) | Top labels, validate-on-blur, never disable-only, right input types. |
| 05 | [Navigation Patterns](uxplanet/05-navigation-patterns.md) | Sidebar for deep apps, tabs for peers, `aria-current`, group don't flatten. |
| 06 | [Microinteractions](uxplanet/06-microinteractions.md) | Saffer's 4 parts; <400ms feedback; animate transform/opacity only. |
| 07 | [Laws of UX (deep)](uxplanet/07-laws-of-ux.md) | 16 laws with per-law React application; companion to the skill table. |
| 08 | [Dark Patterns (avoid)](uxplanet/08-dark-patterns.md) | The do-not-build catalog + honest-design rules + regulatory risk. |
| 09 | [Modals & Dialogs](uxplanet/09-modals-dialogs.md) | When a modal vs a page/drawer; the full a11y contract. |
| 10 | [Typography & Color](uxplanet/10-typography-color.md) | WCAG contrast at the token level; never meaning by color alone. |

## By frontend concern (cross-reference)

| You're working on… | Read these |
|---|---|
| **Async data surfaces** (loading/empty/error) | `uxplanet/01`, `02`, `03` + `nngroup/01` (heuristics 1 & 9) |
| **Forms & validation** | `uxplanet/04` + `nngroup/06` (controls) + `nngroup/09` (copy) |
| **Navigation & IA** | `nngroup/07` + `uxplanet/05` + `nngroup/03` (tree testing) |
| **Overlays (modal/drawer/popover)** | `uxplanet/09` + `nngroup/06` |
| **Buttons, copy, error messages** | `nngroup/09` + `uxplanet/02` + `nngroup/01` (heur. 4, 5, 9) |
| **Visual system (type/color/tokens)** | `uxplanet/10` + `uxplanet/07` (Von Restorff, Prägnanz) |
| **Motion & feedback** | `uxplanet/06` + `uxplanet/03` (perceived perf) |
| **Persuasion, defaults, friction** | `nngroup/10` + `uxplanet/07` + `uxplanet/08` (ethical line) |
| **Research & validation** | `nngroup/03` → `04` → `05` + `nngroup/08` (journey maps) |
| **Design review / PR self-check** | `nngroup/01` → `02` |

## Maintenance

- These are **distillations**, not mirrors — they will not auto-update. Re-verify a claim against its
  `source:` link before relying on a specific number externally.
- If a source URL 404s (NN/g occasionally revises), search the title on the publisher site and update
  the frontmatter.
- Add a new doc by copying any existing file's structure (frontmatter → TL;DR → principles →
  frontend-actionable rules → anti-patterns → checklist → source) so the library stays uniform.
