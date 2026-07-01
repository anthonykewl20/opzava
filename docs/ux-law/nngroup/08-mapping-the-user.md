---
sources:
  - https://www.nngroup.com/articles/empathy-mapping/
  - https://www.nngroup.com/articles/journey-mapping-101/
publisher: Nielsen Norman Group
authors: Sarah Gibbons (Empathy Mapping); Kara Pernice (Journey Mapping 101)
accessed: 2026-06-24
---

# Mapping the User: Empathy Maps & Journey Maps

> **TL;DR** — Empathy maps freeze-frame *who* the user is across four dimensions; journey maps lay out *what happens to them over time* and where their experience breaks. Both exist to align a team on evidence before any component is touched, and a journey map's "opportunities" line is the direct feed into your feature backlog.

## Empathy maps

A collaborative visualization that externalizes what the team knows about one user type, built around four quadrants with the persona in the center. It is **not** chronological — it is a snapshot.

- **Says** — verbatim quotes from interviews/usability tests ("I don't understand what to do from here").
- **Thinks** — what occupies the user's mind but they may not voice ("Am I dumb for not understanding this?"). Overlaps with Says; the unspoken part is the gold.
- **Does** — observable actions (refreshes the page several times, shops around to compare prices).
- **Feels** — emotional state as adjective + context (Impatient: pages load too slowly; Worried: doing something wrong).

Many teams add two extra fields — **Pains** (frustrations, obstacles, risks) and **Gains** (wants, needs, measures of success) — to make the map more decision-oriented.

**When to build one:** at the very start of the design process, before wireframes, to (1) force a shared mental model of the user, (2) surface gaps in your research (a sparse quadrant is a signal to go gather more data), and (3) seed personas. One map per persona/segment — never merge multiple users into one map and call it "the user." Aggregated maps can later synthesize a segment.

**Tension is the point:** contradictions between quadrants (positive actions + negative quotes) are treasure — they mark where a user's stated intent diverges from their behavior, which is exactly where design effort pays off.

## Journey maps

A visualization of the process a person goes through to accomplish a goal. Where an empathy map is a snapshot, a journey map is a narrative arc over time. Five mandatory components:

1. **Actor** — the single persona whose viewpoint the map takes. One POV per map; two user types means two maps.
2. **Scenario + Expectations** — the specific situation and the goal/need driving it, plus what the user expects to get out of it. Best for multi-step sequences, processes with transitions, or multi-channel flows.
3. **Journey Phases** — the high-level stages (e.g. discover → try → buy → use → seek support). These organize everything below.
4. **Actions, Mindsets, and Emotions** — per phase: the **actions** taken (narrative, not a click-log), the **mindsets** (thoughts, questions, motivations — ideally research verbatims), and the **emotions** plotted as a single line across phases showing the ups and downs of the experience.
5. **Opportunities** — the takeaways: what to fix, who owns it, how to measure it. This is the layer that turns a map into shipped work.

**The emotional line is the diagnostic.** It is literally a plotted curve across phases; the troughs — where emotion dips into frustration, confusion, or anxiety — are the phases that deserve disproportionate frontend care. A flat or ignored emotional line means the map is decorative.

## How these connect to frontend work

- **A journey map's Opportunities row is your backlog.** Each opportunity maps to a feature ticket with an owner and a metric. If a map produces no opportunities, it produced no value.
- **Emotional-low phases dictate where to spend design budget.** A trough at "seek support" means the empty/error states there get the most polish: loading skeletons, reassurance copy, clear recovery paths, no dead-ends. A trough at "try" means the onboarding/empty-state experience needs the care.
- **Empty and error states live at the troughs, not the peaks.** Users are already fragile there; a generic `throw new Error()` or a blank `<div/>` compounds the negative emotion the map predicted.
- **Empathy-map Feels quadrants become copy and tone guidance.** "Worried: doing something wrong" → inline validation, undo, reassurance microcopy, no destructive defaults.
- **Empathy maps keep a team aligned before components exist** — they are the artifact that prevents five engineers from building five different users. Revisit and revise them as research accumulates; they are living, not one-shot.
- **Journey maps reveal cross-channel and cross-phase fragmentation** — the places where the user is handed off (e.g. from a wizard to a dashboard to an email) and the experience breaks. Those seams are where frontend state-management and deep-linking work pays off.

## When each tool fits

- **Empathy map** — early, when you need to understand *who* you are building for and whether the team even agrees on that. Also when synthesizing a batch of user interviews.
- **Journey map** — when a flow is multi-step, spans time or channels, or has a measurable goal end-to-end. The right tool for "map the whole onboarding," not "redesign this one button."
- **Neither** — for single-screen tweaks, pixel polish, or performance work. Reaching for a map there is ceremony, not insight. A user-story map (Agile planning) is the closer cousin for implementation-level breakdown.

## Anti-patterns to avoid

- **Aspirational maps.** Maps built from the team's assumptions rather than research. If a quadrant is empty, fill it with research, not guessing — or label it as an unknown.
- **Merging users.** One persona per empathy map; one actor per journey map. A composite "average user" flattens exactly the contradictions that make the map useful.
- **Ignoring the emotional line.** A journey map with actions but no emotion curve is a flowchart — it tells you *what* happens, never *how it feels*, so it cannot prioritize.
- **Building the map, not acting on it.** A beautiful journey map with no Opportunities row, no owners, and no metrics is a poster. The map is a means; the shipped improvements are the end.
- **Treating the map as frozen.** Both artifacts decay as users and products change. Revision dates and version numbers matter; revisit on each new research cycle.
- **Granular action logs.** Journey-map actions are narrative steps, not a click-by-click trace. Over-granularity buries the arc.

## Quick checklist

- [ ] One persona/actor per map — no composites.
- [ ] Empathy map grounded in real research; every quadrant populated or explicitly marked as a research gap.
- [ ] Journey map has all five components: actor, scenario+expectations, phases, actions/mindsets/emotions, opportunities.
- [ ] Emotional line is plotted across phases, and the troughs are named as focus areas.
- [ ] Each opportunity has an owner and a metric — i.e. it is backlog-ready.
- [ ] Map is dated/versioned and scheduled for revision on the next research cycle.
- [ ] Before touching components, the team can point to the map as the shared source of truth for *who* and *what hurts*.

## Sources

- "Empathy Mapping: The First Step in Design Thinking", NN/g — https://www.nngroup.com/articles/empathy-mapping/
- "Journey Mapping 101", NN/g — https://www.nngroup.com/articles/journey-mapping-101/
