---
source: https://www.nngroup.com/articles/card-sorting-definition/
publisher: Nielsen Norman Group
author: Nielsen Norman Group (editorial)
published: 2024-02-02
accessed: 2026-06-24
---

# Card Sorting & Information Architecture

> **TL;DR** — Card sorting is a UX research method where users group labeled cards into categories that make sense to them; the resulting patterns reveal their mental models so you can structure navigation, menus, and URLs around their expectations rather than your internal org chart.

## What card sorting is & what it answers

Card sorting is a research method in which participants place individually labeled cards (pages, links, features, concepts) into groups according to criteria that make sense to *them*, then label each group. The output is not a single user's taxonomy but an aggregate pattern of how a population naturally categorizes your content.

It answers one question: **how do users mentally organize the things our product offers?** That answer is the raw material of information architecture (IA). Per Jakob's Law, users spend most of their time on *other* sites, so their expectations are shaped elsewhere; a card sort surfaces those shared expectations so your nav labels, groupings, and hierarchy match the model already in their head. Good IA improves findability and discoverability; bad IA — organized around internal teams, database tables, or jargon — forces users to learn a model they didn't bring.

## The three flavors

- **Open** — no categories predefined; users invent their own groups and labels. The default and most informative: you get a holistic view of mental models and may discover categorizations you hadn't considered. Use when you don't yet know the structure.
- **Closed** — all categories predefined; users place cards into your existing groups. Use only to validate a candidate IA. NN/g's caveat: for validation, **tree testing is usually better** than closed sorting.
- **Hybrid** — a few categories predefined, the rest user-created. Use sparingly and only when you're confident about 1–2 anchor categories; predefined buckets bias users toward similarly-shaped names.

## How to run one

1. **Define the goal.** Decide whether you're generating a new IA (open) or validating one (closed). This drives everything downstream.
2. **Pick ~30–50 cards.** Fewer than ~30 and patterns won't emerge; more than ~50 and users fatigue, dumping strays into a meaningless "Miscellaneous" pile. Cards can be page names, features, or short descriptions.
3. **Write clean labels.** Avoid repeating a word across cards (e.g., three "Toyota X" labels) — participants will group on the shared token and ignore the real signal (size, capacity). Pilot-test the labels with a few people first.
4. **Recruit the right N.** Qualitative (why) → at least **15** participants; quantitative (statistical validity of groupings) → **30–50**. Recruit representative users, not colleagues.
5. **Run the sort.** Tell participants group sizes can vary, there's no target count, they may rearrange, and unknown cards go to the side (not a random pile). Have them group *before* they label.
6. **Ask follow-ups.** Which cards were easy/hard? Which felt like they belonged to two groups? Why?
7. **Analyze.** Use a tool (OptimalSort, etc.) to produce a **similarity matrix** (which cards travel together) and a **dendrogram** (cluster tree of groupings). Even in a quant run, hold a few moderated sessions to learn *why*.
8. **Triangulate with tree testing.** Card sort *generates* the IA; tree testing *evaluates* it. Run the latter on your proposed structure before and after any major nav restructure.

## Frontend-actionable rules (IA for engineers)

- **Nav labels, URLs, breadcrumbs, and menu groupings are all IA decisions** — they should be derived from how users group tasks, not from your route file or your team structure.
- **Don't organize the nav by your internal org chart or database tables.** Users don't care that "Campaigns" and "Social" are owned by different modules — they care about the job they're trying to do. Map nav to *tasks*, not to *components*.
- **URLs should echo the IA a user understands**: `/campaigns/social/new` beats `/modules/social/campaigns/create` even if the latter matches your folder structure. Route files can redirect; user mental models are sticky.
- **One level of categorization per sort** — card sorting reveals flat groupings, not deep hierarchies. Build sub-navigation deliberately afterward; don't infer a 3-level menu from a single sort.
- **Validate any menu restructure with tree testing before and after.** "Before" proves the old IA was actually broken; "after" proves the new one fixes it. Shipping a restructure without measurement is a guess.
- **Watch for "Miscellaneous" / "Other" dumping grounds** in results and in your own nav — a catch-all nav group is usually a sign the primary categories don't match the user's model.
- **Cross-reference with analytics.** A card sort tells you *expected* groupings; click-path and search-log data tells you *actual* behavior. Where they diverge, the IA is leaking.

## When NOT to card sort

- **Already-validated IA** — if tree-testing scores are high and task success is strong, don't re-sort. You'll manufacture churn.
- **Fewer than ~10 items** — the structure is obvious; sorting adds ceremony, not insight.
- **Brand-new domain with no user mental model yet** — if users have nothing to compare against, they'll produce arbitrary groupings. Wait until a baseline exists.
- **You need hierarchy, not flat categories** — card sorting yields one level; reach for it only when flat groupings are the question.
- **Time- or budget-constrained and the decision is low-stakes** — for a throwaway internal tool, ship the obvious structure and let usage inform iteration.

## Anti-patterns to avoid

- **Predefining categories in an "open" sort** — even one suggested group biases the whole result. If you must, call it a hybrid sort and acknowledge the bias.
- **Labeling groups before sorting** — participants will contort placements to fit the label. Always sort, then name.
- **Repeating tokens across card labels** — shared words become the grouping criterion and bury the real signal.
- **Treating user-generated category labels as final copy** — they're signals, not strings. Your nav label still needs design context the card sort can't provide.
- **Over 50 cards** — fatigue inflates "Miscellaneous" and you can't tell genuine ambiguity from exhaustion.
- **Skipping moderation entirely** — quant-only sorts tell you *that* two cards group; you never learn *why*, so you can't generalize.
- **Inferring multi-level navigation from a flat sort** — card sorting doesn't produce subcategories; don't fabricate a deep tree from one level of data.
- **Ignoring the broader page context** — card sorts strip away information scent (images, links, layout). What groups well on an index card may not behave the same on a real page.

## Quick checklist

- [ ] IA decision is on the table (nav/menu/URLs), not just visual styling.
- [ ] 30–50 cards, each with a distinct, pilot-tested label.
- [ ] Open sort for generation; closed/tree-test for validation.
- [ ] Recruited ≥15 (qual) or 30–50 (quant) representative users — not teammates.
- [ ] Participants sort before labeling; unknown cards set aside, not force-placed.
- [ ] Analyzed with a similarity matrix + dendrogram, plus a few moderated "why" sessions.
- [ ] Proposed structure validated with tree testing before shipping any nav restructure.

## Source

- "Card Sorting: Uncover Users' Mental Models for Better Information Architecture", Nielsen Norman Group — https://www.nngroup.com/articles/card-sorting-definition/ (published 2024-02-02, accessed 2026-06-24)
