# 0044: Content Module: Fact-Check Report Contract

Date: 2026-06-16
Status: Draft
Thread: The seventh content artifact — the fact-check report — verifies a draft's claims against its cited sources, carrying lineage to the draft and the idea, with consistency rules baked into the schema: a "passed" report requires every claim supported, and every supported claim must cite at least one source.

## Hook

A draft that cites sources is not yet a draft that survives scrutiny — a citation is a promise, not a verdict. This slice makes the fact-check a versioned artifact where "passed" structurally means every claim is supported and every supported claim names its source, so the verdict cannot be asserted without the evidence.

## Product Stakes

Slice 0043 turned the outline into drafted prose, with provenance baked in: every section cites at least one captured source. The next step is to check those claims against the sources and to record the verdict as a value object a reviewer (or a later publish gate) can trust without re-reading the draft.

This artifact carries a report id, lineage references to the draft and the originating idea, a non-empty list of per-claim checks, and an overall status of `passed` or `failed`. Each check carries a claim, a verdict (`supported`, `unsupported`, `contradicted`, `needs-review`), and the source ids it relied on. The load-bearing rules are consistency rules: a `supported` verdict must cite at least one source, and a `passed` status requires every check to be `supported`. A draft can only be marked passed when the evidence backs every claim.

## Industry Counterfactual

The common shortcut is to run a fact-check as an LLM step and store a boolean — "the draft checked out" — next to the draft, with the per-claim reasoning left inside the model's context and discarded.

That detaches the verdict from its evidence. When a reviewer wants to know *why* a draft passed, there is no per-claim record to inspect; when a claim is later disputed, there is no structured verdict to overturn. Worse, nothing stops a "passed" label from sitting on top of claims that were never actually supported — the verdict and the evidence are not connected at the data level.

Opzava encodes the report as a versioned value object where the two consistency rules are parse-time invariants: a `supported` check with no sources does not parse, and a `passed` status over a non-`supported` check does not parse. The verdict is forced to mean what it says.

## What We Built

We added `FactCheckReport` to the content module.

The contract:

- is a versioned, strict zod schema (`FACT_CHECK_REPORT_SCHEMA_VERSION`)
- references its draft by `draftId` and its idea by `ideaId` for lineage — the verdict stays tied to the draft it judged and the idea behind it
- carries a `status` of `passed` or `failed`, a non-empty `checks` list, and a `checkedAt` timestamp
- requires each check to have a non-empty `claim`, a `verdict` from a fixed enum, and a `sourceIds` list
- enforces the sourcing rule through a `superRefine`: a `supported` verdict must cite at least one source
- enforces the passed rule through a `superRefine`: a `passed` status requires every check to be `supported`
- exposes `parseFactCheckReport`, which returns a frozen value
- has no providers, runner, or side effects

## What We Refused To Fake

We did not allow a `supported` verdict with an empty `sourceIds` list; a supported claim that cites no source is an assertion, not a check.

We did not allow a `passed` status when any check is not `supported`; "passed" must mean every claim was supported, not "mostly supported".

We did not allow an empty checks list; a report that checks nothing is not a fact-check.

We did not allow an out-of-enum verdict; `supported`, `unsupported`, `contradicted`, and `needs-review` are the only honest outcomes, and a free-text verdict would let the model invent a category to dodge the rules.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/fact-check-report.ts`
- `src/opzava/modules/content/contracts/fact-check-report.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a valid passed report where every claim is supported and sourced parses
- a valid failed report containing an unsupported claim parses
- a passed report containing a non-supported claim is rejected (the passed rule)
- a supported claim with empty `sourceIds` is rejected (the sourcing rule)
- an empty checks list, an invalid verdict, an unknown field, and a wrong schema version are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/contracts/fact-check-report.test.ts: passed 9/9 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 60/60 (idea-intake + keyword-research + source-capture + seo-brief + outline + article-draft unchanged)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
node --test test/check-plan.test.mjs: passed 54/54
```

This is a pure contract mirroring the article-draft style with two consistency superRefines (sourcing and passed), so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

The schema makes the verdict mean something. A fact-check report whose `status` is `passed` cannot exist unless every check is `supported`, and a `supported` check cannot exist unless it cites at least one source — both are parse-time rules, not hopes. By connecting the verdict to the evidence at the data level, the artifact forces the fact-check to be checkable: a reviewer (or a later publish gate) can trust the label because the label cannot be present without its proof.

## Next Case Study Thread

The next build thread should add the next artifact in the Layer 6 build order:

- a brand/style review artifact that checks the fact-checked draft against brand voice and style rules, carrying lineage to the draft
- the artifact stays mock-shaped, validated, and versioned, with no live calls
- step logic still follows the contracts, per the feature-module discipline
