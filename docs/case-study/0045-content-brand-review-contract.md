# 0045: Content Module: Brand Review Contract

Date: 2026-06-16
Status: Draft
Thread: The eighth content artifact — the brand/style review — judges a fact-checked draft across explicit brand dimensions (voice, structure, positioning, clarity, tone), carrying lineage to the draft and the idea, with consistency rules baked into the schema: a "passed" review cannot contain a failed check, and a failed check must say why.

## Hook

A fact-checked draft is not yet an on-brand draft — accurate claims can still drift in voice, bury the positioning, or strike the wrong tone. This slice makes the brand review a versioned artifact where "passed" structurally means every dimension check passed, and every failed dimension is forced to carry a note, so a veto cannot hide behind a bare verdict.

## Product Stakes

Slice 0044 turned the draft's claims into a fact-check report with sourcing baked into the schema. The next step is to review the same draft against brand and style rules and to record the verdict as a value object a reviewer (or a later publish gate) can trust without re-reading the draft.

This artifact carries a review id, lineage references to the draft and the originating idea, a non-empty list of per-dimension checks, and an overall status of `passed` or `changes-requested`. Each check carries a `dimension` (`voice`, `structure`, `positioning`, `clarity`, `tone`), a `verdict` (`pass`, `fail`), and an optional note. The load-bearing rules are consistency rules: a `fail` verdict must include a note, and a `passed` status requires every check to be `pass`. A draft can only be marked passed when every brand dimension passes.

## Industry Counterfactual

The common shortcut is to run a brand/style review as an LLM step and store a single label — "on brand" or "needs work" — next to the draft, with the per-dimension reasoning left inside the model's context and discarded.

That detaches the verdict from its evidence. When a reviewer wants to know *why* a draft needs work, there is no per-dimension record to inspect; when an editor disputes a tone call, there is no structured verdict to overturn. Worse, nothing stops a "passed" label from sitting on top of a draft that quietly failed the voice or positioning dimension — the verdict and the dimensions are not connected at the data level.

Opzava encodes the review as a versioned value object where the two consistency rules are parse-time invariants: a `fail` check with no note does not parse, and a `passed` status over a `fail` check does not parse. The verdict is forced to mean what it says.

## What We Built

We added `BrandReview` to the content module.

The contract:

- is a versioned, strict zod schema (`BRAND_REVIEW_SCHEMA_VERSION`)
- references its draft by `draftId` and its idea by `ideaId` for lineage — the review stays tied to the draft it judged and the idea behind it
- carries a `status` of `passed` or `changes-requested`, a non-empty `checks` list, and a `reviewedAt` timestamp
- requires each check to score a fixed `dimension` (`voice`, `structure`, `positioning`, `clarity`, `tone`) with a `verdict` from a fixed enum, plus an optional note
- enforces the note rule through a `superRefine`: a `fail` verdict must include a note
- enforces the passed rule through a `superRefine`: a `passed` status requires every check to be `pass`
- exposes `parseBrandReview`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow a `fail` verdict with no note; a failed dimension that gives no reason is a veto without an explanation, not a review.

We did not allow a `passed` status when any check is a `fail`; "passed" must mean every dimension passed, not "mostly on brand".

We did not allow an empty checks list; a review that checks nothing is not a brand review.

We did not allow an out-of-enum dimension or verdict; `voice`, `structure`, `positioning`, `clarity`, and `tone` are the only honest dimensions, and `pass`/`fail` are the only honest verdicts. A free-text dimension would let the model invent a category to dodge the rules.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/brand-review.ts`
- `src/opzava/modules/content/contracts/brand-review.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid passed review where every dimension check passes parses
- a valid changes-requested review containing a failed check with a note parses
- a passed review containing a failed check is rejected (the passed rule)
- a failed check with no note is rejected (the note rule)
- an empty checks list, an invalid dimension, an invalid verdict, an unknown field, and a wrong schema version are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/contracts/brand-review.test.ts: passed 10/10 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 70/70 (idea-intake + keyword-research + source-capture + seo-brief + outline + article-draft + fact-check-report unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
node --test test/check-plan.test.mjs: passed 55/55
```

This is a pure contract mirroring the fact-check-report style with two consistency superRefines (note and passed), so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

The schema makes the verdict mean something. A brand review whose `status` is `passed` cannot exist unless every dimension check is `pass`, and a `fail` check cannot exist unless it carries a note — both are parse-time rules, not hopes. By connecting the verdict to the dimensions at the data level, the artifact forces the review to be reviewable: a reviewer (or a later publish gate) can trust the label because the label cannot be present without its proof, and a rejected dimension always comes with its reason.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- an anti-slop review artifact that rejects generic, unsupported, or formulaic output, carrying lineage to the fact-checked and brand-reviewed draft
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
