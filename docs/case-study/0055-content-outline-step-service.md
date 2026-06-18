# 0055: Content Outline Step Service

Date: 2026-06-17
Status: Draft
Thread: Slice 0054 added the first multi-input step, `seo-brief`. This slice adds `outline`, a derived step that consumes the idea and the `seo-brief` artifact and turns the brief's recommended headings into a structured outline — sections with unique headings, each carrying key points — before any prose is drafted. It emits an `outline` `Artifact` with lineage to the idea and the brief, verified through the durable runner against `{ kind: 'artifact', artifactType: 'outline' }`.

## Hook

Structure precedes prose. An outline is where a content pipeline commits to *what the article will say and in what order* before a single sentence is generated — and an outline with duplicate or empty sections is a structure that produces a rambling or contradictory draft. The contract enforces that every section heading is unique and every section carries at least one key point; this step is where the brief's recommended headings become that validated structure, traceable back to the brief that proposed them. An outline that silently duplicated a heading, or that lost its link to the brief, would let a structurally broken plan flow into drafting unnoticed.

## Product Stakes

`outline` derives its sections from the `seo-brief` artifact's `recommendedHeadings`, so the structure the brief recommended is the structure the article will follow — and the lineage proves it. The outline artifact references its brief by the brief *artifact* id, and its envelope lineage lists the idea and the brief. The contract's uniqueness rule on section headings is load-bearing: the next step, `article-draft`, will produce a section per outline section, so duplicate headings would mean ambiguous or colliding draft sections. By validating the outline at this boundary, the pipeline guarantees the draft step receives a clean, navigable structure.

## Industry Counterfactual

The common shortcut is to treat an outline as a freeform list of strings — headings with no uniqueness guarantee, no required substance, no enforced link to the brief that informed them. A duplicate heading slips in, the drafter writes two sections with the same title, and the published article reads as if it lost its place. Or the outline is generated directly from a prompt with no validation, so an empty or single-heading outline passes straight to drafting.

Opzava validates the outline against its contract before it becomes an artifact: headings must be unique, each section must carry at least one key point, and the lineage must reference the idea and the brief. If the upstream brief somehow carried duplicate headings, `parseOutline` would reject the result and the step would fail loudly through the runner — the pipeline does not silently de-duplicate or paper over a malformed structure, it refuses it. Structure is validated where it is produced, not assumed downstream.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `outline-provider.ts`:
  - `OutlineProviderInput` — `Readonly<{ idea; seoBrief }>`
  - `OutlineDraft` — `Readonly<{ title; sections: readonly OutlineSection[] }>`, the provider's untrusted output
  - `OutlineProvider` and `createMockOutlineProvider()` — a pure deterministic mock that titles the outline from the idea and maps each of the brief's `recommendedHeadings` to a section with a key point
- `outline-service.ts`:
  - `OutlineStepInput` — the idea plus the seo-brief artifact and its parsed content plus `sourceStepRunId`
  - `parseOutlineStepInput(payload)` — parses and type-asserts the seo-brief artifact, parses its content, and parses the idea
  - `createOutlineStepService({ provider, newId, now })` — a `ContentStepService<OutlineStepInput, Artifact>` whose `run` calls the provider, validates the draft into an `Outline` via `parseOutline` (referencing the brief *artifact* id as `briefId`), wraps it with `createContentArtifact` (artifactType `outline`, lineage `[ideaId, seoBriefArtifactId]`), and binds the result to `getContentStepOutput('outline')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged.

## What We Refused To Fake

We did not trust the upstream brief; its artifact is parsed, type-asserted, and its content re-validated before the outline derives from it.

We did not silently repair a malformed structure; if the outline would violate its contract (duplicate headings, empty sections), `parseOutline` rejects it and the step fails through the runner rather than de-duplicating behind the operator's back — fail-loud over silent fix.

We did not fake lineage; the outline's envelope lineage is `[ideaId, seoBriefArtifactId]` and its `briefId` references the real brief artifact id.

We did not ship review slop. The first generated draft of the service carried dead "counter guard" machinery — mutable counters compared against themselves (`snapshot !== counter`, a check that can never fire) that added state and false confidence with no protective value. The adversarial review (MiMo) flagged it; we removed it so the service matches the clean shape of the other derived steps. The full test suite passed both before and after, because the dead checks never executed — only review caught it.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/outline-provider.ts`
- `src/opzava/modules/content/steps/outline-service.ts`
- `src/opzava/modules/content/steps/outline-service.test.ts`
- `src/opzava/modules/content/steps/outline-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces an `outline` `Artifact` whose lineage contains the idea id and the brief artifact id, whose `briefId` is the brief artifact id, and which holds at least one section
- `parseOutlineStepInput` accepts a valid payload and rejects a non-seo-brief upstream artifact (a source-capture artifact in the brief slot)
- INTEGRATION through the durable runner: the upstream brief is produced by chaining the real keyword-research, source-capture, and seo-brief step services, then a queued job carrying it is leased, executed, and recorded `succeeded` with an `outline` artifact
- INTEGRATION failure path: a job with a malformed upstream artifact drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 24/24 across 10 files (idea-intake + keyword-research + source-capture + seo-brief + outline step services and their runner integrations)
node_modules/.bin/vitest run src/opzava: passed 352/352 across 63 files (+5 over the 347 baseline)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/check-plan.test.mjs: passed
```

The outline step now executes end-to-end through the durable runner, turning the brief's recommended headings into a validated, unique-headed `outline` artifact whose output kind the runner verifies.

## The Automation Lesson

This slice exercised both halves of the verification discipline. The integration test caught a generated runner harness that imported the runner repository from a path that does not exist — a hallucinated import that no amount of reading the prose would have surfaced, but that failed instantly when run. The adversarial review caught the opposite kind of defect: code that *ran fine* but carried dead, self-satisfying guard logic the tests could never exercise. Tests catch what executes wrongly; review catches what executes harmlessly but should not exist. A pipeline that relied on only one would have shipped either a broken import or a slop-laden service. Both gates, every slice.

## Next Case Study Thread

This adds the outline step, structure before prose.

The next build thread should:

- add the sixth content **step service** — `article-draft` — executed through the durable runner as a multi-input derived step that consumes the idea, the outline artifact, and the source-capture artifact, and emits an `article-draft` `Artifact` in which every drafted section cites at least one captured source by id (the contract bakes provenance into the schema), the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'article-draft' }`.
