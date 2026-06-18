# 0041: Content Module: SEO Brief Contract

Date: 2026-06-16
Status: Draft
Thread: The fourth content artifact — the SEO brief — the first to carry three lineage links (idea + keyword research + sources) composed into a structured brief before drafting.

## Hook

An SEO brief that names its keyword and audience but forgets where the idea, the research, and the sources came from is a brief that drifts. This slice makes the brief the first artifact that refuses to drop any of its three upstream lineages.

## Product Stakes

Slice 0040 gave the content workflow traceable sources. The next step is composition: take the idea, the keyword research, and the captured sources and fold them into one structured brief that a later drafting step can trust.

This artifact carries the primary keyword, optional secondary keywords, the target audience, a fixed search-intent vocabulary, a non-empty list of recommended headings, and a positive integer word-count target — with lineage references to the idea, the keyword research, and the source capture.

## Industry Counterfactual

The common shortcut is to write the brief as a free-form prompt that mentions a keyword and a word count, then start drafting immediately.

That loses lineage: nothing ties the brief back to the idea it came from, the research that picked the keyword, or the sources that back the claims. A later step cannot prove why a heading is there or which research the keyword came from.

Opzava encodes the brief as a versioned value object with three explicit lineage ids (idea + keyword research + source capture), a closed search-intent enum, a non-empty headings list, and a positive-integer word-count target.

## What We Built

We added `SeoBrief` to the content module.

The contract:

- is a versioned, strict zod schema (`SEO_BRIEF_SCHEMA_VERSION`)
- references its idea by `ideaId`, its keyword research by `keywordResearchId`, and its sources by `sourceCaptureId` for lineage — the first content artifact to carry three lineage links
- carries a `primaryKeyword`, optional `secondaryKeywords`, a `targetAudience`, a closed `searchIntent` enum, a non-empty `recommendedHeadings` list, and a positive-integer `wordCountTarget`
- exposes `parseSeoBrief`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow an empty recommended headings list; a brief must propose at least one structural heading.

We did not allow a free-text search intent; intent must be one of the four documented values.

We did not allow a non-integer or non-positive word-count target; a target is a count, not a guess.

We did not accept empty required strings such as a blank `primaryKeyword`; lineage and intent must be real, not placeholders.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/seo-brief.ts`
- `src/opzava/modules/content/contracts/seo-brief.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid brief parses, including optional secondary keywords
- a brief without optional secondary keywords parses
- an empty recommended headings list, an invalid search intent, a non-integer word count, a non-positive word count, an unknown field, a wrong schema version, and an empty required string are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run seo-brief.test.ts: passed 10/10 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 33/33 (idea-intake + keyword-research + source-capture unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
node --test test/check-plan.test.mjs: passed 51/51
```

This is a pure contract mirroring the keyword-research and source-capture style with a closed enum and a positive-integer target, so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

The brief is where composition becomes lineage. An artifact that records which idea, which research, and which sources it was built from cannot quietly substitute an unsupported keyword or an invented heading for a researched one.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- an outline artifact that references the SEO brief via lineage and turns the recommended headings into a structured outline before any drafting begins
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
