---
source: https://www.nngroup.com/articles/which-ux-research-methods/
publisher: Nielsen Norman Group
author: Christian Rohrer
published: 2022-07-17
accessed: 2026-06-24
---

# When to Use Which UX Research Methods

> **TL;DR** — Pick the research method from the question you're asking: **why/how to fix** wants qualitative (think-aloud usability test); **how many/how much** wants quantitative (A/B test, survey, analytics). Match the method to the phase — generative (strategize), formative (design), summative (launch/assess) — not to whichever method your team already knows.

## The 3 dimensions

NN/g classifies every method across three axes. Knowing the axes lets you reason about *any* method, not just the famous twenty.

1. **Attitudinal vs. behavioral** — *what people say* vs. *what people do.* They very often diverge. Attitudinal methods (surveys, interviews, focus groups, card sorts) surface stated beliefs and mental models. Behavioral methods (A/B testing, eyetracking, analytics) observe actual conduct. Usability testing and field studies sit in the middle and lean behavioral — lean that way.

2. **Qualitative vs. quantitative** — not "open vs. closed question." Qualitative = data gathered *directly* by observing/hearing behavior (can probe, adjust protocol, answer **why**). Quantitative = data gathered *indirectly* through an instrument that pre-codes it numerically (analytics, surveys; answer **how many/how much**, lets you prioritize by impact).

3. **Context of product use** — four levels, decreasing naturalness:
   - **Natural** use (ethnographic field study, intercept survey, analytics) — max external validity, min control over what you learn.
   - **Scripted** use (usability test, benchmarking) — focus insight on a target flow; degree of scripting varies.
   - **Limited** use of an abstraction (card sort, tree test, concept test, participatory design) — study *one aspect* of the experience, often the IA or the value proposition.
   - **Not used** (desirability study, brand study) — broader than usability.

A second, orthogonal "time" axis maps methods to the development phase: **Strategize → Design → Launch & Assess**, i.e. generative → formative → summative.

## The method landscape

| Method | Type | When to use | What it answers |
|---|---|---|---|
| **Usability testing** (lab) | Qual · behavioral · scripted | About to ship/redesign a flow | Can users complete the task? Where do they fail and why? |
| **Remote moderated testing** | Qual · behavioral · scripted | Same as lab, but distributed users | Same, with a broader/recruited-anywhere panel |
| **Unmoderated testing** | Qual **or** quant · behavioral · scripted | Need many sessions fast/cheap; track task metrics | Success rate, task time, perceived ease; also qualitative clips |
| **Usability benchmarking** | Quant · behavioral · scripted | Compare to a past version or competitor over time | Numeric SUS/task-score baseline and deltas |
| **A/B testing** (multivariate) | Quant · behavioral · natural | Two live variants, large traffic, a measurable metric | Which variant moves the target KPI |
| **First-click / tree testing** | Quant · behavioral · limited | Naming/structuring nav, menus, categories | Is the IA findable before you build it? |
| **Card sorting** | Qual **or** quant · attitudinal · limited | Designing or fixing IA from scratch | How do users mentally group this content? |
| **Eyetracking** | Qual/quant · behavioral · scripted/natural | Polish visual hierarchy, ad blindness | What gets looked at, in what order, for how long |
| **Field studies / ethnography** | Qual · behavioral+attitudinal · natural | Understand real context, unmet needs pre-build | How does work *actually* happen in the wild? |
| **Contextual inquiry** | Qual · mixed · natural | Complex/B2B workflows needing depth | The deep "current process" model |
| **Diary study** | Qual/quant · attitudinal · natural | Intermittent/longitudinal behavior over days–weeks | What happens in moments we can't observe live? |
| **Interviews** (1:1) | Qual · attitudinal · not-used | Explore motivations, "why" behind known issues | What do users believe, want, fear? |
| **Focus groups** | Qual · attitudinal · not-used | Brand/concept reaction, group dynamics | Top-of-mind sentiment (weak for usability) |
| **Surveys** | Quant · attitudinal · natural or not-used | Measure attitudes at scale; track a metric over time | How many hold view X? (never: is it usable?) |
| **Intercept survey** | Quant · attitudinal · natural | In-context sentiment right after an action | In-the-moment reaction to a specific flow |
| **Customer feedback** (form/link) | Qual/quant · attitudinal · natural | Always-on signal; catch edge issues | What's broken or annoying for self-selected users |
| **Concept testing** | Qual/quant · attitudinal · limited | Validate a value proposition before building | Would anyone want this at all? |
| **Desirability studies** | Qual **or** quant · attitudinal · not-used | Pick between visual-design directions | Which aesthetic conveys the intended brand attributes? |
| **Participatory design** | Qual · attitudinal · limited | Co-create with users; surface unstated priorities | What would *they* build if they could? |
| **Analytics / clickstream** | Quant · behavioral · natural | Instrumented live product; "what is happening" | Where do users drop off, what paths do they take? |

## How a frontend dev chooses a method

Map the *question* to the method, not the other way around.

- **"About to ship a new/redesigned flow"** → moderated think-aloud usability test with **5 users**. Catches the catastrophic issues before launch. Cheap, fast, highest ROI move a frontend dev can make.
- **"Renaming nav labels / restructuring menus"** → **tree test** to validate the proposed IA, **card sort** first if you don't yet have one. Do this *before* you build the components.
- **"Did this change actually improve the metric?"** → **A/B test** (you need traffic + a pre-registered metric). One design = no causal claim.
- **"WHY is this confusing?"** → **think-aloud usability test** (qualitative). Analytics tells you *that* they drop off; only a moderated test tells you *why*.
- **"How many users hit this problem?"** → **analytics / clickstream**, or a **survey** to size an attitude. Use the number to prioritize the qualitative findings.
- **"What should we even build?"** (pre-design) → **field study / contextual inquiry / interviews** — generative, not formative.
- **"Which of these two visual directions?"** → **desirability study** (attribute-rating), not a "which do you like better" poll.
- **"Is the whole product usable vs. last release?"** → **usability benchmarking** — tightly scripted, larger N, repeatable metrics.

Default heuristic: **start qualitative (why), then quantitative (how many/how much)**. And test early + often rather than once + big.

## Anti-patterns to avoid

- **Using a survey to judge usability.** Self-report ≠ behavior; people are bad at predicting their own performance. Use a usability test.
- **One big test instead of many small ones.** A single 20-user study at launch is worth far less than four 5-user studies spread across the build.
- **A/B testing without a hypothesis or enough traffic.** You'll chase noise and call it optimization.
- **Card sort *after* you've already built the IA.** It's a generative/formative tool — run it before nav is wired.
- **Treating analytics as the whole answer.** It shows *where*; it never shows *why*. Pair it with a qualitative method.
- **Reaching for a focus group for usability questions.** Group dynamics distort; opinions about a concept ≠ ability to use a UI.
- **Picking the method your team already knows.** Method should follow the question and the phase, not familiarity.
- **Skimming qualitative findings as a to-do list.** They're about understanding the problem space; quantifying impact needs the second (quantitative) pass.

## Quick checklist

- [ ] Stated the question as **why/how-much** before picking a method?
- [ ] Matched the method to the **phase** (strategize / design / launch)?
- [ ] For a flow about to ship: scheduled a **5-user think-aloud** test?
- [ ] For IA/nav changes: ran a **tree test** (and **card sort** if no IA yet)?
- [ ] For "did it improve?": A/B test with a **pre-registered metric + adequate traffic**?
- [ ] Pairing **qualitative (why)** with **quantitative (how much)** rather than relying on one?
- [ ] Checking **analytics** to size the issue before prioritizing fixes?
- [ ] Planning **many small tests**, not one big launch-day test?

## Source

- "When to Use Which User-Experience Research Methods", Nielsen Norman Group — https://www.nngroup.com/articles/which-ux-research-methods/ (published 2022-07-17, accessed 2026-06-24)
