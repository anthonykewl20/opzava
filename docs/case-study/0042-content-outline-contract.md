# 0042: Content Module: Outline Contract

Date: 2026-06-16
Status: Draft
Thread: The fifth content artifact — the outline — turns structure into a first-class artifact before any prose is written, carrying lineage to the SEO brief and the originating idea.

## Hook

An outline that is a bullet list in a prompt is an outline that disappears the moment drafting starts. This slice makes the outline a versioned artifact: uniquely-headed sections, each with its own key points, linked back to the brief that recommended the headings and the idea that started it.

## Product Stakes

Slice 0041 composed idea, keyword research, and sources into a structured SEO brief with recommended headings. The next step is to turn those headings into a real outline that a drafting step can trust — not a free-text plan, but a typed value object that pins structure down before a single sentence of prose is generated.

This artifact carries a title, a non-empty list of sections, and requires that every section have at least one key point and that no two sections share a heading. It carries lineage references to the idea and the SEO brief.

## Industry Counterfactual

The common shortcut is to write the outline as part of the drafting prompt — "here are some headings, write the article" — and let the model fill in both structure and prose at once.

That conflates two distinct decisions. The structure (which sections, in what order, each standing for one idea, each backed by concrete points) is a separate, reviewable artifact from the prose itself. When structure and prose are generated together, a duplicated section or an empty heading is invisible until the draft is already written, and there is no artifact to revise without regenerating everything.

Opzava encodes the outline as a versioned value object with a non-empty sections list, a `min(1)` key-points rule per section, and a uniqueness constraint on headings — so the structure must be coherent before any drafting begins.

## What We Built

We added `Outline` to the content module.

The contract:

- is a versioned, strict zod schema (`OUTLINE_SCHEMA_VERSION`)
- references its idea by `ideaId` and its SEO brief by `briefId` for lineage — structure stays tied to the brief that recommended the headings
- carries a `title` and a non-empty `sections` list
- requires each section to have a non-empty `heading` and a non-empty `keyPoints` list
- enforces unique section headings through a `superRefine` rule
- exposes `parseOutline`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow an empty sections list; an outline must commit to at least one section.

We did not allow a section with an empty key-points list; a heading with nothing to say is not a section, it is a placeholder.

We did not allow duplicate section headings; an outline where two sections share a heading has no navigable structure.

We did not accept empty required strings such as a blank `title`; lineage and structure must be real, not placeholders.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/outline.ts`
- `src/opzava/modules/content/contracts/outline.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid outline with multiple sections and key points parses
- an empty sections list, a section with an empty key-points list, duplicate section headings, an unknown field, a wrong schema version, and an empty required string are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/contracts/outline.test.ts: passed 8/8 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 41/41 (idea-intake + keyword-research + source-capture + seo-brief unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
node --test test/check-plan.test.mjs: passed 52/52
```

This is a pure contract mirroring the seo-brief and source-capture style with a uniqueness superRefine, so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

Structure is a separate decision from prose. An outline that is a typed artifact — uniquely-headed sections, each with real key points — cannot quietly collapse two ideas into one heading or present an empty section as a plan. By pinning structure down before drafting, the artifact makes the draft cheaper to revise: fix the outline, not the whole article.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- an article draft artifact that references the outline via lineage and turns the structured sections into drafted prose
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
