---
source: https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
publisher: Nielsen Norman Group
author: Nielsen Norman Group (NN/g)
published: 2023-06-25
accessed: 2026-06-24
---

# How to Conduct a Heuristic Evaluation

> **TL;DR** — A cheap, no-participants method where 3–5 evaluators independently walk an interface checking it against a fixed set of usability heuristics, then consolidate findings. It surfaces *likely* problems fast but never replaces testing with real users.

## What it is & why a frontend dev cares

A heuristic evaluation is a structured self-review: evaluators judge a UI against a set of high-level guidelines (the de-facto set is Jakob Nielsen's 10 usability heuristics) and log every place the design violates one. It costs hours, not weeks, and needs zero recruited users.

For a frontend engineer, this is the cheapest available quality gate between "I just shipped this" and "real users hit it." It catches the obvious stuff — hidden navigation, cluttered surfaces, missing feedback, jargon — before it burns a usability-test budget or a support ticket. It also trains the eye: repeated evaluations build the instinct to *not* ship the violation in the first place.

The hard limit to remember: heuristic evaluation finds **likely** problems, not confirmed ones. A heuristic violation is a hypothesis, not a verdict (a hamburger menu violates "recognition rather than recall" but may still be the right mobile tradeoff). Always pair it with real-user testing for anything that matters.

## The step-by-step process

1. **Choose the heuristic set.** Default to Nielsen's 10 usability heuristics; add domain-specific ones (e.g., voice, VR, games) only when the interface demands it.
2. **Assemble and train the team.** 3–5 evaluators is the sweet spot — any single evaluator misses issues. First-time teams should read the heuristics and run one practice round together (e.g., on a weather app) to calibrate.
3. **Decide documentation up front.** Spreadsheet (one finding per row + heuristic), a printed workbook, or a digital whiteboard with sticky notes on screenshots. **Critical rule:** evaluators must NOT see each other's findings until their own evaluation is complete — independence is the whole point of having multiple evaluators.
4. **Narrow the scope.** Smaller scope = deeper eval. Pick one task, one section, one user group, or one device. Don't boil the ocean on a complex product.
5. **Evaluate independently (1–2 hours, timeboxed).** First pass: walk the task once just to *learn* the system, no judging. Second pass: go back through and log every design decision that violates a heuristic, one finding per item, with a recommendation if one comes to mind.
6. **Consolidate as a group.** Use affinity diagramming (cluster similar findings) on a whiteboard. Discuss: where do we agree/disagree? Which issues are most damaging? Which hit business goals? Which need more data from a real usability test? Short- vs long-term fixes.

## Severity rating scale

NN/g's standard 0–4 severity scale (used to prioritize consolidated findings):

- **0** — Not a usability problem at all.
- **1** — Cosmetic problem only; fix if time permits.
- **2** — Minor usability problem; low priority to fix.
- **3** — Major usability problem; important to fix, high priority.
- **4** — Usability catastrophe; mandatory to fix before release.

Severity blends *impact on the user* (frequency + persistence + how blocking) with *business consequence*. Aggregate severity across evaluators: a finding flagged by 4 of 5 evaluators at severity 3 is your top priority.

## Frontend-actionable rules

- **Self-review before you open a PR.** Walk your just-shipped surface twice against the 10 heuristics; log findings as `(heuristic #, severity, one-line fix)`. Takes 30–45 minutes and catches the obvious regressions.
- **Pair with one teammate (minimum viable multi-evaluator).** Two independent passes beat one. Don't look at each other's list until both are done.
- **Log findings as rows, not prose.** Columns: `view | heuristic | observation | severity (0-4) | recommendation`. Sortable, dedup-able, attachable to tickets.
- **Prioritize severity ≥ 2.** Severity 0–1 is noise unless it clusters. Fix 2+ before merge; route 3–4 as blocking.
- **Scope to one task or one screen.** "The whole settings panel" is too big. "Creating a SMART goal on a project card" is the right granularity.
- **Use the empty/error/loading states as evaluation targets.** These are where heuristic violations cluster (missing feedback, no recognition, no error recovery) and where frontend most often under-builds.
- **Treat every finding as a hypothesis.** A heuristic violation ≠ a bug to fix blindly. If the tradeoff seems justified (e.g., mobile hamburger), flag it for user testing rather than auto-fixing.

## Anti-patterns to avoid

- **One-evaluator evaluations.** A solo pass misses too much; the method's value comes from independent overlap.
- **Evaluators seeing each other's notes early.** Anchoring destroys the independence that surfaces different findings.
- **Treating heuristic violations as laws.** Heuristics are guidelines — context decides. Don't reflexively "fix" a justified tradeoff.
- **Skipping the learn-the-system pass.** Evaluating a UI you don't yet understand produces noise, not signal.
- **Broad scope ("review the whole app").** Produces shallow, exhausting evaluations. Narrow to one task/screen.
- **Using it to replace user testing.** Heuristic eval stretches a thin research budget; it doesn't substitute for observing real users.
- **No documentation format.** Findings in scattered chat messages can't be consolidated, prioritized, or tracked to resolution.

## Quick checklist

- [ ] Scope narrowed to one task / screen / user group / device.
- [ ] At least 2 (ideally 3–5) independent evaluators; notes hidden until each is done.
- [ ] Evaluators read Nielsen's 10 heuristics before starting.
- [ ] Two passes: learn the system, then judge — timeboxed to 1–2 hours.
- [ ] Findings logged as rows: `heuristic # | observation | severity 0–4 | recommendation`.
- [ ] Consolidated via affinity clustering; severity ≥ 2 prioritized for fix.
- [ ] Findings that look like justified tradeoffs flagged for user testing, not auto-fixed.

## Source

- "How to Conduct a Heuristic Evaluation", Nielsen Norman Group — https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/ (published 2023-06-25, accessed 2026-06-24)
