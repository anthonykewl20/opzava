# 0057: Content Fact Check Step Service

Date: 2026-06-17
Status: Draft
Thread: Slice 0056 produced the `article-draft` artifact, where every section cites a source. This slice adds `fact-check`, the first of the three quality-gate steps. It consumes the article-draft artifact and the source-capture artifact, checks each drafted claim against its cited sources, and emits a `fact-check-report` `Artifact` whose `passed` status structurally requires every claim to be supported and every supported claim to cite a source. The runner verifies its completion against `{ kind: 'artifact', artifactType: 'fact-check-report' }`.

## Hook

A "fact-checked" label is worthless if a report can be marked `passed` while a claim sits unsupported. This step exists to make the verdict mean something: the fact-check-report contract refuses to let `status: 'passed'` coexist with any non-supported check, and refuses to let a `supported` check cite zero sources. So a passing report is not an assertion that the content was checked — it is a structural guarantee that every claim in it was found supported by at least one cited source. This is the first quality gate, and it is the one that turns "source-backed" from a property of the draft into a verified verdict.

## Product Stakes

`fact-check` consumes the article-draft artifact (the claims, as drafted sections, each already carrying the source ids it relies on) and the source-capture artifact (the captured sources those ids refer to). The mock fact-check provider produces one check per drafted section, marking it `supported` and citing the section's source ids; the report's status is `passed` only when every check is supported. The report references its draft by the article-draft *artifact* id and its idea by the idea id carried in the draft, and its envelope lineage lists the idea, the article-draft artifact, and the source-capture artifact. The later `wordpress-draft` step will require this report's id among its quality-gate inputs, so a report that passed without every claim supported would let unverified content reach the publishing gate — which the schema makes impossible.

## Industry Counterfactual

The common shortcut is to run a fact-check as a side annotation — produce a report, set a "passed/failed" flag by some heuristic, and store it next to the draft. Nothing structurally couples the flag to the checks: a report can say `passed` while listing a contradicted claim, or mark a claim `supported` with no source behind it. The verdict is a label a reviewer trusts without the schema enforcing what it means.

Opzava encodes the meaning in the contract. The fact-check-report schema's refinement rejects a `supported` check with empty `sourceIds`, and rejects a `passed` status when any check is not `supported`. The step re-validates both upstream artifacts before checking. So the only way to produce a `passed` report is for every claim to be genuinely supported and sourced — the verdict cannot lie, because a lying verdict fails validation and the step fails through the runner.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `fact-check-provider.ts`:
  - `FactCheckProviderInput` — `Readonly<{ articleDraft; sourceCapture }>`
  - `FactCheckDraft` — `Readonly<{ status: 'passed' | 'failed'; checks: readonly FactCheck[] }>`
  - `FactCheckProvider` and `createMockFactCheckProvider()` — a pure deterministic mock that produces one `supported` check per drafted section, citing that section's source ids, yielding a `passed` status
- `fact-check-service.ts`:
  - `FactCheckStepInput` — both upstream artifacts and their parsed contents plus `sourceStepRunId`
  - `parseFactCheckStepInput(payload)` — parses and type-asserts the article-draft and source-capture artifacts, parses their contents
  - `createFactCheckStepService({ provider, newId, now })` — a `ContentStepService<FactCheckStepInput, Artifact>` whose `run` calls the provider, validates the report into a `FactCheckReport` via `parseFactCheckReport` (enforcing the supported/sourced/passed invariants), wraps it with `createContentArtifact` (artifactType `fact-check-report`, lineage `[ideaId, articleDraftArtifactId, sourceCaptureArtifactId]`), and binds the result to `getContentStepOutput('fact-check')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged.

## What We Refused To Fake

We did not let the verdict float free of the checks; `status: 'passed'` is only valid when every check is `supported`, enforced by the contract, so a passing report cannot hide an unsupported claim.

We did not let a `supported` claim cite nothing; the contract requires at least one source id behind every supported check, so "supported" always means "supported by a named source."

We did not trust the upstream inputs; both the article-draft and source-capture artifacts are parsed, type-asserted, and re-validated before checking.

We did not fake lineage; the report's envelope lineage references the idea, the article-draft artifact, and the source-capture artifact, and its `draftId` is the real article-draft artifact id.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/fact-check-provider.ts`
- `src/opzava/modules/content/steps/fact-check-service.ts`
- `src/opzava/modules/content/steps/fact-check-service.test.ts`
- `src/opzava/modules/content/steps/fact-check-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces a `passed` `fact-check-report` `Artifact` in which every check is `supported` and cites at least one source, whose `draftId` is the article-draft artifact id, and whose lineage contains the article-draft and source-capture artifact ids
- `parseFactCheckStepInput` accepts a valid multi-artifact payload and rejects a wrong upstream artifact type
- INTEGRATION through the durable runner: the upstream chain (keyword-research → source-capture → seo-brief → outline → article-draft) is run to produce real inputs, then a queued fact-check job is leased, executed, and recorded `succeeded`
- INTEGRATION failure path: a job with malformed upstream artifacts drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 34/34 across 14 files (six prior step services + fact-check, unit and runner integration each)
node_modules/.bin/vitest run (full repo suite): passed 1440/1440 across 165 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

The first quality-gate step now executes end-to-end through the durable runner, producing a `fact-check-report` whose `passed` verdict is a structural guarantee — every claim supported, every supported claim sourced — verified as an `artifact` output.

## The Automation Lesson

This slice landed clean on the first generation that produced four well-formed files — the value of the marker-integrity check is that it lets the orchestrator reject a truncated generation (MiniMax's again cut off at three of four end-markers) and take the intact one (MiMo's) without reading either in full. The verdict-meaning discipline here is the template for the two quality gates that follow: `brand-review` and `anti-slop-review` will likewise encode their pass condition in the schema so a passing review cannot coexist with a failing check. A gate whose verdict is enforced by structure, not convention, is a gate the publishing step can actually trust.

## Next Case Study Thread

This adds the fact-check gate, where a passing verdict structurally means every claim is supported and sourced.

The next build thread should:

- add the eighth content **step service** — `brand-review` — executed through the durable runner as a derived step that consumes the article-draft artifact and emits a `brand-review` `Artifact` across explicit brand/style dimensions, where a passed review cannot hide a failing dimension check, the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'brand-review' }`.
