# 0054: Content SEO Brief Step Service

Date: 2026-06-17
Status: Draft
Thread: Slices 0052 and 0053 established the derived-step pattern with single-input steps (`keyword-research`, `source-capture`), each consuming the idea and emitting one artifact with a one-link lineage. This slice adds `seo-brief`, the first **multi-input** derived step: it consumes the idea *and two upstream artifacts* (the keyword-research artifact and the source-capture artifact), validates each upstream artifact before use, calls a mock brief provider, and emits an `seo-brief` `Artifact` whose lineage carries all three upstream ids — verified through the durable runner against `{ kind: 'artifact', artifactType: 'seo-brief' }`.

## Hook

Every derived step so far drew from a single source. Real content composition does not: an SEO brief is a synthesis of the idea, the keyword research, and the captured sources, and its value depends on every one of those inputs being present, valid, and correctly referenced. The new failure mode is composition: a brief built from a stale or wrong-typed upstream artifact, or one whose lineage silently drops a link, produces a brief that *looks* complete but cannot be traced back to the research and sources it claims to rest on. This slice makes multi-input composition explicit and checked — each upstream artifact is re-validated and type-checked at the step boundary, and the brief's lineage carries all three ids it was composed from.

## Product Stakes

`seo-brief` is the first step where Opzava's lineage model earns its keep. The brief references its keyword research by the keyword-research *artifact* id and its sources by the source-capture *artifact* id, and its envelope lineage lists the idea, the keyword-research artifact, and the source-capture artifact. That means a later audit can walk from a published article back to its brief, from the brief to the exact research and source-capture artifacts it composed, and from those to the idea — an unbroken provenance chain. If the step accepted upstream inputs without validating their type and shape, a mismatched artifact (a source-capture passed where keyword-research was expected) would corrupt that chain. The step refuses that: it parses each upstream artifact, asserts its `artifactType`, and parses its content against the upstream contract before composing the brief.

## Industry Counterfactual

The common shortcut for a multi-input step is to take whatever upstream objects the orchestrator hands over and read fields off them directly — trusting that the right artifacts were wired to the right inputs. When a pipeline is rewired, or a step is reordered, the brief silently composes from the wrong artifact: it reads a "primary keyword" off an object that happens to have that field, and nobody notices until the draft targets the wrong term. Lineage, if recorded at all, lists whatever ids were convenient, so the provenance chain has links that do not correspond to what was actually used.

Opzava treats every upstream input as untrusted until validated. `parseSeoBriefStepInput` parses each upstream artifact with `parseArtifact`, asserts it is the expected `artifactType`, and parses its content against the upstream contract (`parseKeywordResearch`, `parseSourceCapture`) — so a wrong-typed or malformed upstream artifact fails at the step boundary, not three steps later. The brief's lineage is then built from the real upstream artifact ids it composed, making the provenance chain accurate by construction.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `seo-brief-provider.ts`:
  - `SeoBriefProviderInput` — `Readonly<{ idea; keywordResearch; sourceCapture }>`, the composed upstream context
  - `SeoBriefDraft` — `Readonly<{ targetAudience; searchIntent; recommendedHeadings; wordCountTarget; secondaryKeywords? }>`, the provider's untrusted output
  - `SeoBriefProvider` and `createMockSeoBriefProvider()` — a pure deterministic mock that derives headings from the idea topic, defaults audience and word-count target, and proposes secondary keywords from the keyword-research candidates
- `seo-brief-service.ts`:
  - `SeoBriefStepInput` — the idea plus both upstream artifacts and their parsed contents plus `sourceStepRunId`
  - `parseSeoBriefStepInput(payload)` — parses and type-asserts both upstream artifacts, parses their contents, and parses the idea
  - `createSeoBriefStepService({ provider, newId, now })` — a `ContentStepService<SeoBriefStepInput, Artifact>` whose `run` calls the provider, validates the draft into an `SeoBrief` via `parseSeoBrief` (referencing the upstream *artifact* ids for `keywordResearchId` and `sourceCaptureId`), wraps it with `createContentArtifact` (artifactType `seo-brief`, lineage `[ideaId, keywordResearchArtifactId, sourceCaptureArtifactId]`), and binds the result to `getContentStepOutput('seo-brief')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged — the bridge absorbed a multi-input step with no modification; only the step's `parseInput` grew to validate multiple upstream artifacts.

## What We Refused To Fake

We did not trust the upstream inputs; each upstream artifact is parsed, type-asserted, and its content re-validated against its contract before the brief composes from it. A source-capture artifact passed where keyword-research was expected fails the step.

We did not fabricate lineage; the brief's envelope lineage is `[ideaId, keywordResearchArtifactId, sourceCaptureArtifactId]` — the real ids of everything it composed from — and the brief's own `keywordResearchId`/`sourceCaptureId` fields reference the upstream artifact ids, so the provenance chain is accurate, not decorative.

We did not call a live model; `createMockSeoBriefProvider` is a pure deterministic stand-in behind a provider port, and live adapters remain disabled.

We did not weaken the output contract; the step emits an `artifact` output and the runner verifies it deep-equals `getContentStepOutput('seo-brief')`.

We did not hand-author the implementation; it was generated by the local fleet (MiniMax-M3), transcribed, reviewed by MiMo and Gemma, and verified against the real test suite — including an integration test that chains the real keyword-research and source-capture step services to produce genuine upstream artifacts before running the brief step through the durable runner.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/seo-brief-provider.ts`
- `src/opzava/modules/content/steps/seo-brief-service.ts`
- `src/opzava/modules/content/steps/seo-brief-service.test.ts`
- `src/opzava/modules/content/steps/seo-brief-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces an `seo-brief` `Artifact` whose lineage contains the idea id and both upstream artifact ids, and whose content's `keywordResearchId` is the keyword-research artifact id
- `parseSeoBriefStepInput` accepts a valid multi-artifact payload and rejects a wrong upstream artifact type (a source-capture artifact in the keyword-research slot)
- INTEGRATION through the durable runner: upstream artifacts are produced by chaining the real keyword-research and source-capture step services, then a queued job carrying them is leased, executed, and recorded `succeeded` with an `seo-brief` artifact
- INTEGRATION failure path: a job with malformed upstream artifacts drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 19/19 across 8 files (idea-intake + keyword-research + source-capture + seo-brief step services and their runner integrations)
node_modules/.bin/vitest run src/opzava: passed 347/347 across 61 files (+5 over the 342 baseline)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/check-plan.test.mjs: passed
```

The first multi-input content step now executes end-to-end through the durable runner, composing an idea and two validated upstream artifacts into a lineage-complete `seo-brief` artifact whose output kind the runner verifies.

## The Automation Lesson

The bridge did not change to absorb a multi-input step — only the step's `parseInput` grew, which is exactly where the new complexity belongs. The lesson is that the per-step input parser is the right home for upstream validation: it is where untrusted prior artifacts become trusted typed inputs, and keeping that responsibility there means the executor stays generic no matter how many inputs a step composes. The escalation continues toward `article-draft`, which composes the brief and the sources into prose where every section must cite a captured source — there the validation moves from "are the upstream artifacts the right type" to "does the produced content honor a cross-artifact constraint." The discipline established here — re-validate every upstream input, build lineage from real ids — is the foundation that makes those richer constraints checkable.

## Next Case Study Thread

This adds the first multi-input step, composing three upstream lineage links.

The next build thread should:

- add the fifth content **step service** — `outline` — executed through the durable runner as a derived step that consumes the idea and the `seo-brief` artifact and emits an `outline` `Artifact` whose sections derive from the brief's recommended headings, with lineage to the brief, the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'outline' }`.
