# 0056: Content Article Draft Step Service

Date: 2026-06-17
Status: Draft
Thread: Slices 0052–0055 built the research and structure steps; `outline` (0055) fixed the article's structure. This slice adds `article-draft`, the step that turns structure into prose — and the first step where Opzava's source-backed principle becomes a schema invariant. It consumes the idea, the outline artifact, and the source-capture artifact, calls a mock draft provider, and emits an `article-draft` `Artifact` in which *every drafted section cites at least one captured source by id*. The runner verifies its completion against `{ kind: 'artifact', artifactType: 'article-draft' }`.

## Hook

This is where "source-backed" stops being a label and becomes a constraint the schema enforces. The article-draft contract requires every section to carry at least one supporting source id — a section with prose but no cited source is, by construction, not a valid draft. That single rule is what separates a content pipeline that *can prove* its claims trace to captured sources from one that merely asserts it did. This slice produces the first artifact where provenance is not metadata bolted on afterward but a precondition of the artifact existing at all: if a section cannot cite a source, `parseArticleDraft` rejects the whole draft and the step fails through the runner.

## Product Stakes

`article-draft` composes three inputs: the idea (topic and intent), the outline artifact (the fixed structure — which headings, in what order), and the source-capture artifact (the pool of captured sources its sections may cite). The mock draft provider writes a body for each outline section and attaches supporting source ids drawn from the captured sources. The contract then enforces the provenance rule. The draft references its outline by the outline *artifact* id and its brief by the brief id carried forward in the outline, and its envelope lineage lists the idea, the outline artifact, and the source-capture artifact — so an audit can trace any drafted section back through its outline and brief to the idea, and to the captured sources it cites. This is the artifact the later fact-check and brand-review steps will scrutinize; its provenance has to be real before they run.

## Industry Counterfactual

The common shortcut is to generate the article prose in one shot and treat citations as an afterthought — ask the model for an article, maybe ask it to "add sources," and store whatever comes back. Nothing structurally guarantees that every section is actually supported; a section drafts cleanly with no citation, or cites a source that was never captured, and the gap surfaces only if a human notices. The provenance chain is aspirational.

Opzava bakes the provenance into the schema: `articleSectionSchema` requires `supportingSourceIds` to be non-empty, so a draft with an unsupported section cannot validate. The step also re-validates both upstream artifacts (the outline and the source-capture) before drafting, so a wrong-typed or malformed input fails at the boundary. The source pool the provider draws from is the *validated* source-capture content, which the source-capture contract already guarantees holds at least one source — so the "every section cites a source" rule is satisfiable by construction, not by hope.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `article-draft-provider.ts`:
  - `ArticleDraftProviderInput` — `Readonly<{ idea; outline; sourceCapture }>`
  - `ArticleDraftDraft` — `Readonly<{ title; sections: readonly ArticleSection[]; wordCount }>`
  - `ArticleDraftProvider` and `createMockArticleDraftProvider()` — a pure deterministic mock that drafts a body per outline section and cites a captured source id in each section's `supportingSourceIds`, computing a real word count
- `article-draft-service.ts`:
  - `ArticleDraftStepInput` — the idea plus both upstream artifacts and their parsed contents plus `sourceStepRunId`
  - `parseArticleDraftStepInput(payload)` — parses and type-asserts the outline and source-capture artifacts, parses their contents, and parses the idea
  - `createArticleDraftStepService({ provider, newId, now })` — a `ContentStepService<ArticleDraftStepInput, Artifact>` whose `run` calls the provider, validates the draft into an `ArticleDraft` via `parseArticleDraft` (every section's `supportingSourceIds` enforced non-empty), wraps it with `createContentArtifact` (artifactType `article-draft`, lineage `[ideaId, outlineArtifactId, sourceCaptureArtifactId]`), and binds the result to `getContentStepOutput('article-draft')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged.

## What We Refused To Fake

We did not let provenance be optional; the schema requires every section to cite at least one source, so an unsupported section cannot become part of a valid draft.

We did not trust the upstream inputs; both the outline and source-capture artifacts are parsed, type-asserted, and their contents re-validated before drafting.

We did not add defensive theater for an impossible state. The adversarial review raised that the mock cites `sources[0]`, which would be undefined if the capture had no sources — but the source-capture contract requires at least one source, and `parseSourceCapture` enforces it in this step's input parser, so an empty-source capture cannot reach the provider. We reasoned about the invariant rather than guarding against a state the type system already precludes (the same discipline that removed the dead counter-guards in 0055).

We did not fake lineage; the draft's envelope lineage is `[ideaId, outlineArtifactId, sourceCaptureArtifactId]`, and its `outlineId` references the real outline artifact id.

We did not hand-author the implementation; it was generated by the local fleet (MiMo, after MiniMax's draft truncated at the token limit), transcribed, reviewed (MiMo), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/article-draft-provider.ts`
- `src/opzava/modules/content/steps/article-draft-service.ts`
- `src/opzava/modules/content/steps/article-draft-service.test.ts`
- `src/opzava/modules/content/steps/article-draft-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces an `article-draft` `Artifact` whose lineage contains the idea, outline, and source-capture artifact ids, whose `outlineId` is the outline artifact id, and in which every section's `supportingSourceIds` is non-empty
- `parseArticleDraftStepInput` accepts a valid multi-artifact payload and rejects a wrong upstream artifact type
- INTEGRATION through the durable runner: upstream artifacts are produced by chaining the real keyword-research, source-capture, seo-brief, and outline step services, then a queued job carrying the outline and source-capture artifacts is leased, executed, and recorded `succeeded`
- INTEGRATION failure path: a job with malformed upstream artifacts drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 29/29 across 12 files (the five prior step services + article-draft, with unit and runner integration each)
node_modules/.bin/vitest run (full repo suite): passed 1435/1435 across 163 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

The drafting step now executes end-to-end through the durable runner, producing an `article-draft` artifact in which provenance is a schema invariant — every section cites a captured source — verified as an `artifact` output.

## The Automation Lesson

Two judgments defined this slice, both about *not* doing something. When MiniMax's generation truncated mid-file at the token limit, the marker check (four file-starts, three file-ends) caught it before it could be written — a structural integrity check on generated output, not its content. And when the review flagged a possible undefined-source-id, the right move was to trace the invariant — the source-capture contract guarantees at least one source, enforced upstream — and decline to add a guard for a state that cannot occur. The pattern across this run holds: tests catch what executes wrongly, review catches what executes harmlessly but shouldn't exist, and the orchestrator's job is to adjudicate the review against the actual contracts rather than reflexively apply every suggested change. Provenance is enforced by the schema; impossible states are not worth guarding.

## Next Case Study Thread

This adds the drafting step, where provenance becomes a schema invariant.

The next build thread should:

- add the seventh content **step service** — `fact-check` — executed through the durable runner as a derived step that consumes the article-draft artifact and the source-capture artifact and emits a `fact-check-report` `Artifact`, where a `passed` verdict structurally requires every checked claim to be supported and sourced, the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'fact-check-report' }`.
