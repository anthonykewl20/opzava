# 0043: Content Module: Article Draft Contract

Date: 2026-06-16
Status: Draft
Thread: The sixth content artifact — the article draft — turns structure into cited prose, carrying lineage to the outline, the SEO brief, and the originating idea, with provenance baked into the schema: every section must cite at least one captured source.

## Hook

A draft that is a wall of generated text is a draft nobody can check. This slice makes the draft a versioned artifact where every section names the captured source it leans on — so prose and provenance ship together, not as an afterthought.

## Product Stakes

Slice 0042 turned structure into a first-class artifact: an outline with uniquely-headed sections and real key points, before any prose was written. The next step is to draft the prose against that structure and to make every claim traceable to a captured source.

This artifact carries a title, a non-empty list of sections (each a heading plus real prose), a positive integer word count, and lineage references to the outline, the SEO brief, and the originating idea. The load-bearing rule is provenance: a section whose `supportingSourceIds` is empty does not parse — a draft section cannot exist without citing at least one captured source.

## Industry Counterfactual

The common shortcut is to generate the whole draft in one prompt — "here is the outline, write the article" — and treat the sources as context the model may or may not have actually used.

That detaches the prose from its evidence. When a reader or a reviewer wants to verify a claim, there is no per-section citation to follow; when a later fact-check step runs, there is no structured provenance to check against. The draft reads confidently whether or not any source backs a given paragraph.

Opzava encodes the draft as a versioned value object where each section carries a non-empty `supportingSourceIds` list — so provenance is a parse-time rule, not a hope. A section that cites nothing is rejected before it can become a draft.

## What We Built

We added `ArticleDraft` to the content module.

The contract:

- is a versioned, strict zod schema (`ARTICLE_DRAFT_SCHEMA_VERSION`)
- references its outline by `outlineId`, its SEO brief by `briefId`, and its idea by `ideaId` for lineage — prose stays tied to the structure that produced it
- carries a `title`, a non-empty `sections` list, and a positive integer `wordCount`
- requires each section to have a non-empty `heading`, a non-empty `body`, and a non-empty `supportingSourceIds` list (the provenance rule)
- enforces unique section headings through a `superRefine` rule
- exposes `parseArticleDraft`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow a section with an empty `supportingSourceIds` list; a draft section that cites no captured source is an unsupported claim, not provenance.

We did not allow an empty body; a heading with no prose is not a drafted section.

We did not allow duplicate section headings; a draft where two sections share a heading has no navigable structure to cite against.

We did not allow a non-positive or non-integer word count; the count is a measured value, not a placeholder.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/article-draft.ts`
- `src/opzava/modules/content/contracts/article-draft.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid draft with multiple sections, each citing at least one source, parses
- an empty sections list, a section with empty `supportingSourceIds` (the provenance rule), an empty body, duplicate section headings, an unknown field, a wrong schema version, a non-positive word count, and a non-integer word count are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/contracts/article-draft.test.ts: passed 10/10 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 51/51 (idea-intake + keyword-research + source-capture + seo-brief + outline unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
node --test test/check-plan.test.mjs: passed 53/53
```

This is a pure contract mirroring the outline and source-capture style with a uniqueness superRefine and a per-section provenance rule, so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

Provenance is a property of the artifact, not of the prompt. A draft whose sections must each cite at least one captured source cannot quietly present an uncited paragraph as fact. By making the empty `supportingSourceIds` list a parse-time failure, the artifact forces every claim to carry its evidence forward — so a later fact-check step has something structured to verify against.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- a fact-check report artifact that verifies the draft's claims against its cited sources, carrying lineage to the draft
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
