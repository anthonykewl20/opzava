# 0058: Content Brand Review Step Service

Date: 2026-06-17
Status: Draft
Thread: Slice 0057 added `fact-check`, the first quality gate, whose `passed` verdict structurally requires every claim supported. This slice adds `brand-review`, the second quality gate. It consumes the article-draft artifact and judges it across five explicit brand dimensions — voice, structure, positioning, clarity, tone — emitting a `brand-review` `Artifact` whose `passed` status cannot coexist with any failing dimension, and whose every failing dimension must carry a note. The runner verifies completion against `{ kind: 'artifact', artifactType: 'brand-review' }`.

## Hook

Brand voice is the part of content quality that resists checklists — which is exactly why it needs explicit, named dimensions rather than a single subjective thumbs-up. This step judges the draft across five fixed dimensions and makes the verdict honest: a review cannot be marked `passed` while any dimension failed, and a failed dimension cannot be a silent veto — it must say why. A brand gate that could pass while hiding a tone failure, or fail without explaining which dimension and why, is a gate that teaches the team nothing and blocks nothing reliably. This slice makes the dimensions explicit and the verdict structural.

## Product Stakes

`brand-review` consumes the article-draft artifact and produces a review with one check per brand dimension. The mock brand provider passes all five; the contract enforces that `status: 'passed'` is only valid when no check failed, and that any `fail` check carries a note explaining the veto. The review references its draft by the article-draft *artifact* id and its idea by the idea id carried in the draft, and its envelope lineage lists the idea and the article-draft artifact. Like the fact-check report, this review's id will be required among the `wordpress-draft` step's quality-gate inputs — so a brand review that passed while a dimension failed would let off-brand content reach publishing, which the schema forbids.

## Industry Counterfactual

The common shortcut is a single freeform "brand check" — a reviewer or model emits a paragraph and a pass/fail, with no fixed dimensions and no structural link between the verdict and the findings. A draft passes with a weak-voice section nobody itemized, or fails with a terse "needs work" that names no dimension and no reason. The review is advisory prose, not an accountable gate.

Opzava fixes the dimensions in the schema (`voice`, `structure`, `positioning`, `clarity`, `tone`) and binds the verdict to them: a `passed` status with any failing dimension fails validation, and a failing dimension with no note fails validation. So a passing brand review structurally means every named dimension passed, and a failing one structurally names the dimension and explains the veto. The step re-validates the upstream draft before reviewing, so a wrong-typed input fails at the boundary.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `brand-review-provider.ts`:
  - `BrandReviewProviderInput` — `Readonly<{ articleDraft }>`
  - `BrandReviewDraft` — `Readonly<{ status: 'passed' | 'changes-requested'; checks: readonly BrandCheck[] }>`
  - `BrandReviewProvider` and `createMockBrandReviewProvider()` — a pure deterministic mock that emits a `pass` check for each of the five brand dimensions, yielding a `passed` status
- `brand-review-service.ts`:
  - `BrandReviewStepInput` — the article-draft artifact and its parsed content plus `sourceStepRunId`
  - `parseBrandReviewStepInput(payload)` — parses and type-asserts the article-draft artifact and parses its content
  - `createBrandReviewStepService({ provider, newId, now })` — a `ContentStepService<BrandReviewStepInput, Artifact>` whose `run` calls the provider, validates the review into a `BrandReview` via `parseBrandReview` (enforcing the no-failed-check-when-passed and note-on-fail invariants), wraps it with `createContentArtifact` (artifactType `brand-review`, lineage `[ideaId, articleDraftArtifactId]`), and binds the result to `getContentStepOutput('brand-review')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged.

## What We Refused To Fake

We did not let the brand verdict be a single opaque flag; the review is broken into five explicit, named dimensions, each independently pass/fail.

We did not let a passing review hide a failure; `status: 'passed'` is invalid if any dimension check failed, enforced by the contract.

We did not let a failure be unexplained; a `fail` check without a note fails validation, so a veto always carries its reason.

We did not trust the upstream input; the article-draft artifact is parsed, type-asserted, and its content re-validated before review.

We did not fake lineage; the review's envelope lineage references the idea and the article-draft artifact, and its `draftId` is the real article-draft artifact id.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/brand-review-provider.ts`
- `src/opzava/modules/content/steps/brand-review-service.ts`
- `src/opzava/modules/content/steps/brand-review-service.test.ts`
- `src/opzava/modules/content/steps/brand-review-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces a `passed` `brand-review` `Artifact` with all five dimension checks passing, whose `draftId` is the article-draft artifact id, and whose lineage contains the article-draft artifact id
- `parseBrandReviewStepInput` accepts a valid payload and rejects a non-article-draft upstream artifact
- INTEGRATION through the durable runner: the upstream chain is run to produce a real article-draft, then a queued brand-review job is leased, executed, and recorded `succeeded`
- INTEGRATION failure path: a job with a malformed upstream artifact drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 39/39 across 16 files (seven prior step services + brand-review, unit and runner integration each)
node_modules/.bin/vitest run (full repo suite): passed 1445/1445 across 167 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

The second quality-gate step now executes end-to-end through the durable runner, producing a `brand-review` whose `passed` verdict structurally guarantees every named dimension passed, verified as an `artifact` output.

## The Automation Lesson

Two quality gates now share one shape — a verdict bound to a set of itemized checks, where passing forbids any failure and every failure is explained. The fact-check gate enforces "supported and sourced"; this one enforces "every dimension passed, every failure noted." Encoding the verdict's meaning in the schema is what lets the publishing step trust a one-line status without re-deriving it. The third gate, `anti-slop-review`, completes the trio with the inverse framing: a passing review means zero detected slop patterns, and a rejection must name each pattern and its fix. Three gates, three schemas that make their verdicts mean something — that is the substrate the human approval and publishing steps will stand on.

## Next Case Study Thread

This adds the brand-review gate, where a passing verdict structurally means every named dimension passed.

The next build thread should:

- add the ninth content **step service** — `anti-slop-review` — executed through the durable runner as a derived step that consumes the article-draft artifact and emits an `anti-slop-review` `Artifact` where a `passed` status means zero detected slop patterns and any rejection must name each detected pattern and its fix, the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'anti-slop-review' }`.
