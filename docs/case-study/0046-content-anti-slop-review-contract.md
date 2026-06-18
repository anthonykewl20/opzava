# 0046: Content Module: Anti-Slop Review Contract

Date: 2026-06-16
Status: Draft
Thread: The ninth content artifact — the anti-slop review — judges a fact-checked, brand-reviewed draft for AI slop (generic, unsupported, formulaic, repetitive, or low-information output), carrying lineage to the draft and the idea, with consistency rules baked into the schema: a "passed" review must list zero detected patterns, and a rejection must name each pattern and its required fix.

## Hook

A draft can be accurate and on-brand and still read like slop — generic framings, unsupported claims, formulaic openers, padded repetition, low-information sentences that say nothing. This slice makes the anti-slop review a versioned artifact where "passed" structurally means the reviewer detected nothing, and every rejection is forced to name the pattern, quote the excerpt, and state the fix — so a draft cannot be quietly waved through and a veto cannot hide behind a bare label.

## Product Stakes

Slice 0045 turned the brand/style review into a versioned artifact with per-dimension verdicts. The next step is a separate gate that asks a different question: regardless of accuracy and brand fit, does this draft still read like AI-generated filler? The anti-slop review is the last review before a draft can be considered publishable.

This artifact carries a review id, lineage references to the draft and the originating idea, a `status` of `passed` or `rejected`, a `detectedPatterns` list, and a `reviewedAt` timestamp. Each finding carries a `pattern` (`generic`, `unsupported`, `formulaic`, `repetitive`, `low-information`), a `severity` (`low`, `medium`, `high`), the offending `excerpt`, and the `requiredFix`. The load-bearing rules are consistency rules: a `passed` status requires an empty `detectedPatterns` list, and a `rejected` status requires at least one finding. A draft is only marked passed when the reviewer found no slop.

## Industry Counterfactual

The common shortcut is to run an anti-slop (or "quality") check as an LLM step and store a single label — "good" or "needs work" — next to the draft, with the specific findings left inside the model's context and discarded.

That detaches the verdict from its evidence. When a reviewer wants to know *what* was slop, there is no per-pattern record to inspect; when an editor disputes a call, there is no structured finding to overturn. Worse, nothing stops a "passed" label from sitting on top of a draft the model still flagged with patterns in passing — the verdict and the findings are not connected at the data level, so "passed" does not actually mean clean.

Opzava encodes the review as a versioned value object where the two consistency rules are parse-time invariants: a `passed` status over a non-empty `detectedPatterns` list does not parse, and a `rejected` status with no findings does not parse. The verdict is forced to mean what it says, and every rejection carries its named pattern, its excerpt, and the fix that would resolve it.

## What We Built

We added `AntiSlopReview` to the content module.

The contract:

- is a versioned, strict zod schema (`ANTI_SLOP_REVIEW_SCHEMA_VERSION`)
- references its draft by `draftId` and its idea by `ideaId` for lineage — the review stays tied to the draft it judged and the idea behind it
- carries a `status` of `passed` or `rejected`, a `detectedPatterns` list, and a `reviewedAt` timestamp
- requires each finding to name a fixed `pattern` (`generic`, `unsupported`, `formulaic`, `repetitive`, `low-information`) with a `severity` from a fixed enum, the offending `excerpt`, and a non-empty `requiredFix`
- enforces the passed rule through a `superRefine`: a `passed` status requires `detectedPatterns` to be empty
- enforces the rejection rule through a `superRefine`: a `rejected` status requires at least one detected pattern
- exposes `parseAntiSlopReview`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow a `passed` status when patterns are listed; "passed" must mean the reviewer found zero slop, not "mostly fine".

We did not allow a `rejected` status with no findings; a rejection with no cited pattern is a veto without an explanation.

We did not allow a finding with no `requiredFix`; flagging slop without stating the remedy gives the drafter nothing to act on.

We did not allow an out-of-enum pattern or severity; `generic`, `unsupported`, `formulaic`, `repetitive`, and `low-information` are the only honest slop shapes, and `low`/`medium`/`high` are the only honest severities. A free-text pattern would let the model invent a category to pad the list.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/anti-slop-review.ts`
- `src/opzava/modules/content/contracts/anti-slop-review.test.ts`
- `src/opzava/modules/content/index.ts`

The tests cover:

- a valid passed review with no detected patterns parses
- a valid rejected review citing at least one slop finding parses
- a passed review that lists detected patterns is rejected (the passed rule)
- a rejected review with no detected patterns is rejected (the rejection rule)
- an invalid pattern enum and an invalid severity enum are rejected
- an unknown field and a wrong schema version are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/contracts/anti-slop-review.test.ts: passed 9/9 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 79/79 (idea-intake + keyword-research + source-capture + seo-brief + outline + article-draft + fact-check-report + brand-review unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
```

This is a pure contract mirroring the brand-review style with two consistency superRefines (passed and rejection), so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

The schema makes the verdict mean something. An anti-slop review whose `status` is `passed` cannot exist unless `detectedPatterns` is empty, and a `rejected` status cannot exist unless it lists at least one finding — both are parse-time rules, not hopes. By connecting the verdict to the findings at the data level, the artifact forces a rejection to be actionable: every flagged pattern comes with its excerpt and the specific fix that would resolve it, and a "passed" draft is one the reviewer could find nothing generic, unsupported, formulaic, repetitive, or low-information to flag.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- a WordPress draft request artifact — the draft-only external action payload that carries a fact-checked, brand-reviewed, anti-slop-passed draft to the publish boundary
- the request artifact must reference the approval and all the review artifacts (fact-check report, brand review, anti-slop review), so a draft cannot be requested to publish unless the full review chain passed
- the artifact stays mock-shaped, validated, and versioned, with no live calls until approvals are wired
