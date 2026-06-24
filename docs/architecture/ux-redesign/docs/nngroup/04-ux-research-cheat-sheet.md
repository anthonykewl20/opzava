---
source: https://www.nngroup.com/articles/ux-research-cheat-sheet/
publisher: Nielsen Norman Group
author: Sarah Gibbons
published: 2017-02-12
accessed: 2026-06-24
---

# UX Research Cheat Sheet

> **TL;DR** — UX research can happen at any point in the cycle; NN/g organizes methods into four phases — **Discover, Explore, Test, Listen** — and recommends doing some research at every stage, weighted toward the earliest moment that has the most impact. If you can run only one method on an existing system, do qualitative (think-aloud) usability testing.

## Research across the product cycle

NN/g frames research not as a one-shot gate but as a menu of methods spread across four phases of the design cycle. The phases are not rigid compartments; the end of one cycle is the start of the next, and you should alternate methods each cycle because each targets different goals.

- **Discover** — Illuminate what you don't know and understand real needs *before* committing build effort. The goal is to validate and discard assumptions so the team doesn't build the wrong thing for the wrong people. Most impactful early; also used to get an existing product back on track.
- **Explore** — Understand the problem space and design scope, and address user needs appropriately. The goal is to define *what* to build: compare against competitors, build personas, analyze tasks, map the journey, and iterate on prototypes (paper → interactive) until designs help people complete tasks with few errors.
- **Test** — Check that designs work for real people during development and beyond. The goal is validation: qualitative usability testing, accessibility evaluation, and benchmark testing (time-on-task, completion rate, error rate) to prove improvement over time.
- **Listen** — Runs continuously across the whole cycle. The goal is to detect problems and emerging issues from gathered data: surveys, analytics, search-query logs, FAQ patterns, and inbound feedback. Data tells you *what*; pair it with testing to learn *why*.

## Method-by-phase table

| Phase | Method | What it's for |
| --- | --- | --- |
| Discover | Field study | Observe users in context using the system or solving the target problem |
| Discover | Diary study | Understand users' information needs and behaviors over time |
| Discover | User interview | Hear needs, pain points, and mental models directly |
| Discover | Stakeholder interview | Gather business requirements and constraints |
| Discover | Sales/support call review | Surface the most frequent and worst problems users report |
| Discover | Requirements & constraints gathering | Define what the project must satisfy before building |
| Explore | Competitive analysis | Find strengths/weaknesses in rival products; benchmark features |
| Explore | Design review | Critique the current design against heuristics and guidelines |
| Explore | Persona building | Synthesize research into shared user archetypes |
| Explore | Task analysis | Find ways to save users time and effort per task |
| Explore | Journey mapping | Show the user journey and locate drop-off risk points |
| Explore | Prototype feedback & testing (paper → clickable) | Learn which design components help task completion; iterate |
| Explore | Write user stories | Translate needs into buildable, scoped units |
| Explore | Card sorting | Learn how users group information — informs nav and IA |
| Test | Qualitative usability testing (think-aloud) | The single most effective method to improve an existing system |
| Test | Benchmark testing | Measure time-on-task, completion, error rates to gauge progress |
| Test | Accessibility evaluation | Ensure universal access; not bolted on in QA |
| Test | Instructions/help testing | Verify training and help content actually resolve confusion |
| Listen | Survey | Quantify attitudes and behaviors across a population |
| Listen | Analytics review | Discover trends, anomalies, and progress against metrics |
| Listen | Search-log analysis | See what people look for and what they call it |
| Listen | Usability-bug review | Mine inbound bug reports for top trouble areas |
| Listen | FAQ review | Cluster frequent questions and solve the underlying problems |

## Frontend-actionable rules

- **Default to the 5-user qualitative usability test before shipping anything non-trivial.** Think-aloud is the highest-leverage single method; small-n catches the majority of usability flaws.
- **Treat analytics + session replay as your "Listen" loop.** Wire them in once and read them every cycle — they surface the *what*; a follow-up test supplies the *why*.
- **Run a first-click / card-sort test whenever you restructure navigation, IA, or labeling.** Don't guess the mental model — measure it before the redesign ships.
- **Bring prototype feedback into the component-build step, not after.** Paper or low-fi clickable tests in Explore are far cheaper than rewriting a finished React tree in Test.
- **Pair every benchmark redesign with a baseline measurement.** Before a big redesign, capture time-on-task, completion rate, and error rate so improvement is provable, not anecdotal.
- **Keep a running usability-bug channel.** If usability bugs don't fit the engineering bug tracker, start a dedicated log — otherwise they evaporate.
- **Embed accessibility evaluation in Test, not as a QA afterthought.** NN/g is explicit: access can't be tacked on or tested in late; it must be designed in from Explore onward.
- **Use search logs and support transcripts as free discovery.** Vocabulary mismatches between users and the UI show up here first — feed them back into labels and copy.

## Anti-patterns to avoid

- **Treating research as a one-time pre-build gate.** It's a menu across all four phases; skipping Listen means you stop learning the moment you ship.
- **Gathering opinions instead of observing behavior.** In prototype tests, note whether people *complete the task and avoid errors* — don't tally what they say they like.
- **Substituting analytics for users.** Data tells you *what* happened, rarely *why*; use it to find questions, then test to answer them.
- **Usability testing only with people like you.** Personas are not enough; include diverse cultural, physical, and ability backgrounds or serious problems hide.
- **Bolting on accessibility in QA.** By then it's a retrofit; design for universal access from Explore onward.
- **Rigid sequential execution of the whole list.** Start somewhere, alternate methods each cycle, learn as you go.
- **Surprising users with changes.** Consult before announcing major changes; surprise redesigns break workflows people already depend on.

## Quick checklist

- [ ] Defined which phase (Discover/Explore/Test/Listen) the current work is in
- [ ] Ran ≥1 qualitative think-aloud usability test (5 users) before shipping
- [ ] Analytics + a feedback channel are wired in for the Listen loop
- [ ] Navigation/IA changes validated with a card-sort or first-click test
- [ ] Baseline benchmark metrics captured before any major redesign
- [ ] Accessibility evaluated during Test (designed in from Explore)
- [ ] Usability bugs have a tracked home (engineering tracker or dedicated log)
- [ ] Search logs and support transcripts reviewed for vocabulary mismatches this cycle

## Source

- "UX Research Cheat Sheet", Nielsen Norman Group — https://www.nngroup.com/articles/ux-research-cheat-sheet/ (published 2017-02-12, accessed 2026-06-24)
