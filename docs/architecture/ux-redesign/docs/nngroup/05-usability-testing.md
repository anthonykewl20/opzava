---
sources:
  - https://www.nngroup.com/articles/how-many-test-users/
  - https://www.nngroup.com/articles/usability-testing-101/
publisher: Nielsen Norman Group
authors:
  - Jakob Nielsen
  - Kara Pernice
  - Amanda Stockwell
accessed: 2026-06-24
---

# Usability Testing for Engineers: Test with 5 Users

> **TL;DR** — For qualitative usability testing, 5 representative users uncover ~85% of interface problems; bigger tests waste budget. Run many small, task-based, think-aloud tests against a staging build and fix the top findings before re-testing.

## The math: why 5 users find ~85% of problems

Nielsen's curve models how many *unique* usability problems surface as you add testers. Most problems are shared, so each new user repeats findings already known:

| Users tested | Problems found |
|---|---|
| 1 | ~30% |
| 5 | ~85% |
| 15 | ~100% |

**The caveat is load-bearing**: this curve holds *only* for **qualitative problem-finding** with a **homogeneous audience**. It fails when:

- You want **statistics**, not insights — quantitative studies need **20+** users for significance, card-sort needs **15/group**, eyetracking needs **39** for stable heatmaps.
- You have **distinct user types** who behave differently — each type needs its own group of ~5. A site for doctors + patients = two groups; novice/intermediate/expert investors = 3 groups of ~3-4. More types = more groups of 5, *not* one bigger study.

The argument is pure ROI: cost scales linearly with users; new findings plateau fast. NN/g's scatterplot of 83 consulting studies shows almost no correlation between user count and finding count past ~5.

## How to run a usability test (Usability Testing 101)

1. **Define realistic tasks** from user goals, not feature tours.
2. **Write a script** — instructions, task scenarios, follow-up questions; hand each task on its own sheet.
3. **Recruit representative users** — real users, or people with the same background/needs.
4. **Think-aloud** — ask participants to narrate actions and thoughts to surface goals and motivations.
5. **Observe, don't lead** — the facilitator probes without priming; balancing data quality against influence requires practice.
6. **Record findings** — behavioral + verbal feedback per task; tag and prioritize.

A discount study fits in 3 days: plan → test 5 users → analyze + redesign.

## Writing good tasks

- **Task-based, not step-based**: "Your goal is to find where Tyler Smith sits" — never "Click the directory, then search."
- **Avoid leading language**: naming a button or feature primes the user (the *priming* effect). Don't use words from the UI in the task.
- **Realistic scenario framing**: give the context a real user would have ("Your printer shows Error 5200 — resolve it").
- **One success criterion per task** so "done vs. failed" is unambiguous.
- **Hand tasks one at a time**, written on sheets; ask the participant to read each aloud.
- **Keep a handful of tasks per user** — more fatigues them without adding signal.

## Frontend-actionable rules

- **Grab 5 real users per audience.** For an internal AI-ops tool, teammates from a different squad qualify; for end-users, recruit from the target persona. Don't test your own design with only other designers.
- **30-45 min per session**, think-aloud over a staging build (or a high-fi prototype / paper mock for pre-code). Record screen + audio.
- **Log problems by severity** (blocks task / slows / minor nit), then fix the top few — iterative design beats one perfect pass.
- **Re-test after fixing** — the value is in iterations, not N. Anything left unfixed now gets caught next round.
- **Unmoderated (Maze, UserTesting, the app's own unmoderated harness)** when tasks are self-explanatory, you need geographic spread, or overhead must approach zero (down to **2 users/study** for very low-overhead agile loops).
- **Moderated (in-person or screen-share)** when you need to probe, the task is nuanced, or it's the first test of a new flow.

## Anti-patterns to avoid

- **Leading questions / leading tasks** — "Is the button easy to find?" or "Click the Search button" both prime the user.
- **Testing only with designers** on a designer-built UI — confirms your assumptions, finds nothing.
- **One giant study instead of many small ones** — spend a big budget on *more studies*, not more users per study.
- **Treating a survey or poll as a usability test** — surveys capture opinion, not behavior; usability testing watches behavior.
- **Chasing statistical N for a qualitative goal** — 11 users "for credibility" is >2x the recommended size and mostly repeats known findings.
- **Skipping re-test** — fixing without re-validating leaves regressions invisible.

## Quick checklist

- [ ] Defined 4-6 realistic, task-based scenarios (no UI words, no leading phrasing).
- [ ] Recruited 5 users from *each* distinct audience (3-4 if audiences overlap).
- [ ] 30-45 min per session; think-aloud; screen + audio recorded.
- [ ] Facilitator probes without priming; tasks read aloud, handed one at a time.
- [ ] Findings logged with severity + a single success criterion per task.
- [ ] Top problems fixed, then re-tested in the next iteration.
- [ ] Quantitative goal? Switched to 20+ users and metrics (task success, time-on-task), not 5.

## Sources

- "How Many Test Users in a Usability Study?" (a.k.a. Why You Only Need to Test with 5 Users), NN/g — https://www.nngroup.com/articles/how-many-test-users/
- "Usability (User) Testing 101", NN/g — https://www.nngroup.com/articles/usability-testing-101/
