# 0039: Content Module: Keyword Research Contract

Date: 2026-06-16
Status: Draft
Thread: The second content artifact — topic and keyword research — linked by lineage to the idea it came from.

## Hook

Research that cannot be traced back to the idea it serves is just trivia. This slice makes keyword research a versioned artifact that points at its originating idea.

## Product Stakes

Slice 0038 gave the content workflow a validated input. The next step in the build order is topic and keyword research, and like the idea, it needs to be a contract before it is a behavior.

This artifact carries the research output and a lineage reference to the idea, so a later step can prove the research belongs to the right idea rather than assuming it.

## Industry Counterfactual

The common shortcut is to keep keyword research as a loose list of strings attached to a request.

That loses provenance and makes consistency unverifiable: nothing stops a primary keyword that is not even in the candidate set.

Opzava encodes both the lineage and the consistency rule into the schema.

## What We Built

We added `KeywordResearch` to the content module.

The contract:

- is a versioned, strict zod schema (`KEYWORD_RESEARCH_SCHEMA_VERSION`)
- references the originating idea by `ideaId` for lineage
- carries a non-empty list of keyword candidates, each with a term and optional finite `searchVolume` and `difficulty`
- names a `primaryKeyword` and enforces that it is one of the candidate terms
- exposes `parseKeywordResearch`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow an empty candidate list; research must have at least one keyword.

We did not allow a primary keyword that is absent from the candidates; the schema rejects that inconsistency.

We did not accept non-finite numbers for volume or difficulty.

We did not add step logic or providers; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/keyword-research.ts`
- `src/opzava/modules/content/contracts/keyword-research.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid keyword research artifact parses, including optional candidate metrics
- candidates that carry only a term parse
- an empty candidate list, a primary keyword absent from candidates, a non-finite volume, an unknown field, and a wrong schema version are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run keyword-research.test.ts: passed 8/8 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 15/15 (idea-intake unchanged)
node --test test/check-plan.test.mjs: passed 49/49
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint src/opzava/modules/content: passed with 0 errors
node --test test/*.test.mjs: passed 59/59
vitest run (full suite): passed 140 files / 1306 tests
```

This is a pure contract mirroring the idea-intake contract style with one added consistency rule, so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

Lineage and consistency belong in the schema, not in a reviewer's memory. An artifact that references its source and validates its own internal coherence cannot quietly drift away from the work it was meant to support.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- a source-capture or SERP/competitor-research artifact whose content references the idea and keyword research via lineage
- captured sources carry provenance fields (origin, capture timestamp) so later claims can be traced, per the source-provenance requirement
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
