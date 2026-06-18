# 0059: Content Anti Slop Review Step Service

Date: 2026-06-17
Status: Draft
Thread: Slices 0057 and 0058 added the fact-check and brand-review quality gates. This slice adds `anti-slop-review`, the third and final content quality gate before human approval. It consumes the article-draft artifact and judges it for AI slop — generic, unsupported, formulaic, repetitive, or low-information output — emitting an `anti-slop-review` `Artifact` whose `passed` status structurally requires zero detected patterns, and whose `rejected` status structurally requires at least one named finding with a required fix. The runner verifies completion against `{ kind: 'artifact', artifactType: 'anti-slop-review' }`.

## Hook

AI slop is the failure mode an AI content pipeline is most likely to produce and least likely to notice — generic filler, confident-but-unsupported assertions, formulaic structure, repetition, low-information padding. A pipeline that generates content with AI and does not explicitly screen for slop will ship exactly the output it was built to avoid. This step is the dedicated screen, and its contract makes its verdict honest in both directions: a `passed` review cannot list any detected pattern, and a `rejected` review cannot be empty — every rejection must name the pattern, its severity, the offending excerpt, and the specific fix required. The gate cannot pass slop, and it cannot reject without a remedy.

## Product Stakes

`anti-slop-review` is where Opzava's `AI slop` definition — "generic, unsupported, low-information, repetitive, or formulaic generated output that should not be published or stored as final content" — becomes an enforced gate rather than a principle. The mock provider returns a clean review (no detected patterns, `passed`); the contract enforces that a `passed` status is only valid with zero findings, and that a `rejected` status carries at least one finding, each with a required fix. The review references its draft by the article-draft *artifact* id and its idea by the idea id from the draft, and its envelope lineage lists the idea and the article-draft artifact. Its review id will join the fact-check and brand-review ids as a required quality-gate input to the `wordpress-draft` step — so all three gates must have produced passing artifacts before content can reach publishing.

## Industry Counterfactual

The common shortcut is to skip slop detection entirely — trust that the drafting model produced good prose — or to bolt on a vague "quality score" with no itemized findings and no required remediation. Slop ships because nothing was tasked with finding it, or a low score blocks publication with no actionable explanation of what to fix. The screen is either absent or unaccountable.

Opzava makes slop detection a first-class, schema-bound step. A `passed` review with any detected pattern fails validation; a `rejected` review with no findings fails validation; and every finding must name its pattern (from a fixed vocabulary), severity, excerpt, and required fix. So a passing anti-slop review structurally means zero slop patterns were detected, and a rejection is always a specific, actionable list — not a vague veto. The step re-validates the upstream draft before reviewing.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `anti-slop-review-provider.ts`:
  - `AntiSlopReviewProviderInput` — `Readonly<{ articleDraft }>`
  - `AntiSlopReviewDraft` — `Readonly<{ status: 'passed' | 'rejected'; detectedPatterns: readonly SlopFinding[] }>`
  - `AntiSlopReviewProvider` and `createMockAntiSlopReviewProvider()` — a pure deterministic mock returning a clean review (`passed`, zero detected patterns)
- `anti-slop-review-service.ts`:
  - `AntiSlopReviewStepInput` — the article-draft artifact and its parsed content plus `sourceStepRunId`
  - `parseAntiSlopReviewStepInput(payload)` — parses and type-asserts the article-draft artifact and parses its content
  - `createAntiSlopReviewStepService({ provider, newId, now })` — a `ContentStepService<AntiSlopReviewStepInput, Artifact>` whose `run` calls the provider, validates the review into an `AntiSlopReview` via `parseAntiSlopReview` (enforcing the passed-means-empty and rejected-means-findings invariants), wraps it with `createContentArtifact` (artifactType `anti-slop-review`, lineage `[ideaId, articleDraftArtifactId]`), and binds the result to `getContentStepOutput('anti-slop-review')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged.

## What We Refused To Fake

We did not let slop pass silently; a `passed` review with any detected pattern fails validation, so passing structurally means zero slop was found.

We did not let a rejection be a vague veto; a `rejected` review must carry at least one finding, and every finding names its pattern, severity, excerpt, and required fix — a rejection is always actionable.

We did not trust the upstream input; the article-draft artifact is parsed, type-asserted, and its content re-validated before review.

We did not fake lineage; the review's envelope lineage references the idea and the article-draft artifact, and its `draftId` is the real article-draft artifact id.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/anti-slop-review-provider.ts`
- `src/opzava/modules/content/steps/anti-slop-review-service.ts`
- `src/opzava/modules/content/steps/anti-slop-review-service.test.ts`
- `src/opzava/modules/content/steps/anti-slop-review-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan-content-steps.test.mjs` (new — the content-step-service assertions, split out of `check-plan.test.mjs` to keep each test file within the complexity budget)

The tests cover:

- `service.run` produces a `passed` `anti-slop-review` `Artifact` with zero detected patterns, whose `draftId` is the article-draft artifact id, and whose lineage contains the article-draft artifact id
- `parseAntiSlopReviewStepInput` accepts a valid payload and rejects a non-article-draft upstream artifact
- INTEGRATION through the durable runner: the upstream chain is run to produce a real article-draft, then a queued anti-slop-review job is leased, executed, and recorded `succeeded`
- INTEGRATION failure path: a job with a malformed upstream artifact drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 44/44 across 18 files (eight prior step services + anti-slop-review, unit and runner integration each)
node_modules/.bin/vitest run (full repo suite): passed 1450/1450 across 169 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed (check-plan split into check-plan.test.mjs + check-plan-content-steps.test.mjs)
```

The third and final quality-gate step now executes end-to-end through the durable runner, producing an `anti-slop-review` whose `passed` verdict structurally guarantees zero detected slop patterns, verified as an `artifact` output.

## The Automation Lesson

This slice completed the three-gate quality wall — fact-check, brand-review, anti-slop-review — each a verdict bound to its findings by a schema that makes passing and rejecting both mean something precise. It also forced a structural refactor for a non-product reason: the growing `check-plan.test.mjs` crossed its complexity budget, and the governance rule that flagged it is the same kind of mechanical taste-preserving rule the project builds for its own code. The right response was not to suppress the rule but to do what it asked — split the content-step assertions into their own cohesive module — leaving both files within budget. The codebase enforces its own anti-entropy discipline on the very tests that verify it. With the quality wall complete, only the human gate and the publishing action remain.

## Next Case Study Thread

This completes the three content quality gates, each with a structurally honest verdict.

The next build thread should:

- add the tenth content **step service** — `human-approval` — executed through the durable runner as the workflow's approval gate. Unlike every prior content step, its declared output is `{ kind: 'approval' }`, not an artifact: the step records an `Approval` decision (per `src/opzava/core/approvals/contracts.ts`) gating the external publishing action, the step whose completion the runner verifies against the `approval` step output rather than an `artifact` output.
