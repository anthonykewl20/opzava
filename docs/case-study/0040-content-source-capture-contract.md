# 0040: Content Module: Source Capture Contract

Date: 2026-06-16
Status: Draft
Thread: The third content artifact — captured sources with traceable provenance — linked by lineage to the idea it came from.

## Hook

A claim in generated content is only as trustworthy as the source behind it. This slice makes captured sources a versioned artifact that points at its originating idea and refuses to lose its provenance.

## Product Stakes

Slice 0039 gave the content workflow keyword research. The next step is the evidence those keywords and claims rest on: the sources captured during research.

This artifact carries each source's origin, capture timestamp, extraction summary, and optional trust notes and claim linkage, with a lineage reference to the idea, so a later step can prove where a claim came from rather than asserting it.

## Industry Counterfactual

The common shortcut is to keep sources as a pile of URLs next to the brief, or to drop them entirely once the content is drafted.

That loses provenance: nothing ties a claim to the page that supports it, and nothing stops two different sources from being silently merged under one id.

Opzava encodes the source-provenance requirement (origin, capture timestamp, extraction summary, claim linkage, trust notes) into the schema and makes source ids unique within a capture.

## What We Built

We added `SourceCapture` to the content module.

The contract:

- is a versioned, strict zod schema (`SOURCE_CAPTURE_SCHEMA_VERSION`)
- references the originating idea by `ideaId` for lineage
- carries a non-empty list of captured sources, each with `sourceId`, `origin`, `capturedAt`, and `extractionSummary`
- allows optional `trustNotes` and `supportsClaims` on each source for claim linkage and trust
- enforces that source ids are unique within a capture via a `superRefine` rule
- exposes `parseSourceCapture`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow an empty sources list; a capture must trace at least one source.

We did not allow duplicate source ids within a capture; the schema rejects that collision so claims cannot be ambiguous.

We did not accept empty required strings such as a blank `extractionSummary`; provenance must be real, not a placeholder.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/source-capture.ts`
- `src/opzava/modules/content/contracts/source-capture.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid source capture artifact parses, including optional trust notes and claim linkage
- a single minimal source carrying only the required provenance fields parses
- an empty sources list, a duplicate source id, an unknown field, a wrong schema version, and an empty required string are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run source-capture.test.ts: passed 8/8 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 23/23 (idea-intake + keyword-research unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
node --test test/check-plan.test.mjs: passed 50/50
```

This is a pure contract mirroring the keyword-research contract style with one added uniqueness rule, so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

Source provenance belongs in the schema, not in a researcher's notes. An artifact that records where each source came from, when it was captured, and what it supports cannot quietly substitute an untraceable claim for a real one.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- an SEO brief artifact whose content references the idea, the keyword research, and the sources via lineage
- the brief composes the upstream artifacts into a structured outline before any drafting begins
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
