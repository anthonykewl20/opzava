# 0053: Content Source Capture Step Service

Date: 2026-06-17
Status: Draft
Thread: Slice 0052 established the derived-step pattern with `keyword-research` — mock provider draft → schema validation → `Artifact` envelope with lineage → runner output verification. This slice applies that pattern to `source-capture`, the provenance step: it consumes the idea, calls a mock source provider, validates a `SourceCapture` payload (whose source ids must be unique within a capture), and wraps it as a `source-capture` `Artifact` envelope traced to the originating idea — verified through the durable runner against `{ kind: 'artifact', artifactType: 'source-capture' }`.

## Hook

Provenance is the claim that separates source-backed content from AI slop. If the system cannot point at *which* captured sources back a draft, every downstream "fact-checked" or "source-backed" label is decoration. `source-capture` is the step that produces that provenance: a set of captured sources, each with a unique id, an origin, and an extraction summary, traceable to the idea that prompted them. A source-capture artifact with duplicate source ids, or with no lineage to its idea, is provenance that cannot be trusted — and the downstream fact-check and article-draft steps, which cite sources by id, would silently reference the wrong thing. This slice makes the captured-source set a validated, unique-keyed, lineage-bearing artifact at the producing boundary.

## Product Stakes

Opzava's content quality language defines `Source-backed` as "claims trace to captured sources." That definition is only enforceable if captured sources are themselves structured, uniquely identified, and tied to their idea. `source-capture` is where that structure is created. The mock source provider stands in for a future retrieval tool; the step service does not trust its raw output — it shapes it into a `SourceCapture` payload, validates it against the contract (which rejects duplicate source ids), and wraps it as an `Artifact` with `validation.status: 'valid'` and lineage to the idea. Later steps (seo-brief, article-draft, fact-check) consume these sources by id, so the uniqueness and provenance guaranteed here are load-bearing for the whole pipeline's source-backed claim.

## Industry Counterfactual

The common shortcut is to dump retrieved sources into a list and reference them positionally or by URL — no stable id, no uniqueness guarantee, no enforced link to the idea. Two retrieved pages with the same URL collapse, or a later step cites "source 3" after the list reorders, and the provenance trail quietly breaks. The failure is invisible until an article cites a source that does not say what the draft claims, and the audit cannot reconstruct which capture backed which sentence.

Opzava refuses the positional list. Each captured source carries a unique `sourceId`, the contract rejects a capture with duplicate ids, and the artifact's lineage points back to the originating idea. The provider's output is a *draft* until `parseSourceCapture` enforces the uniqueness invariant and `createContentArtifact` enforces non-empty lineage — only then is it a trusted, traceable source-capture artifact, verified by the runner as the right output kind.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `source-capture-provider.ts`:
  - `SourceCaptureDraft` — `Readonly<{ sources: readonly CapturedSource[] }>`, the provider's untrusted output
  - `SourceCaptureProvider` — `(idea: IdeaIntake) => SourceCaptureDraft`, the provider port
  - `createMockSourceCaptureProvider()` — a pure deterministic mock returning two sources with ids derived from the idea (`src_<ideaId>_1`, `src_<ideaId>_2`), unique by construction, each with an origin and extraction summary
- `source-capture-service.ts`:
  - `SourceCaptureStepInput` — `Readonly<{ idea: IdeaIntake; sourceStepRunId: string }>`
  - `parseSourceCaptureStepInput(payload)` — structural parse, then `parseIdeaIntake` for the idea
  - `createSourceCaptureStepService({ provider, newId, now })` — a `ContentStepService<SourceCaptureStepInput, Artifact>` whose `run` calls the provider, validates the draft into a `SourceCapture` via `parseSourceCapture` (enforcing unique source ids), wraps it with `createContentArtifact` (artifactType `source-capture`, lineage `[idea.ideaId]`), and binds the result to `getContentStepOutput('source-capture')`

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged — the second derived step the 0051/0052 pattern absorbed without modification.

## What We Refused To Fake

We did not call a live retrieval tool; `createMockSourceCaptureProvider` is a pure deterministic stand-in behind a provider port, and live adapters remain disabled.

We did not trust the provider's sources; the draft must pass `parseSourceCapture` — including the unique-source-id rule — before it can become an artifact, so a provider that returned colliding ids would fail at the step boundary.

We did not fake provenance; the artifact's lineage is `[idea.ideaId]`, a real reference to the originating idea, satisfying the envelope's non-empty-lineage invariant and making the capture traceable.

We did not weaken the output contract; the step emits an `artifact` output and the runner verifies it deep-equals `getContentStepOutput('source-capture')`.

We did not hand-author the implementation; the provider and service were generated by the local fleet (MiniMax-M3), transcribed, reviewed by MiMo and Gemma, and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/source-capture-provider.ts`
- `src/opzava/modules/content/steps/source-capture-service.ts`
- `src/opzava/modules/content/steps/source-capture-service.test.ts`
- `src/opzava/modules/content/steps/source-capture-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces a `source-capture` `Artifact` whose `validation.status` is `valid`, whose `lineage.inputArtifactIds` contains the idea id, whose content carries the originating `ideaId`, and which holds two captured sources
- `parseSourceCaptureStepInput` accepts a valid `{ idea, sourceStepRunId }` and rejects malformed input
- INTEGRATION through the durable runner: a queued job carrying `{ idea, sourceStepRunId }` is leased, executed, recorded `succeeded`, and the captured artifact's `artifactType` is `source-capture`
- INTEGRATION failure path: a job with a malformed `idea` drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 14/14 across 6 files (idea-intake + keyword-research + source-capture step services and their runner integrations)
node_modules/.bin/vitest run src/opzava: passed 342/342 across 59 files (+5 over the 337 baseline)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/check-plan.test.mjs: passed
```

The provenance step now executes end-to-end through the durable runner, turning an untrusted mock-provider draft into a validated, unique-keyed, lineage-bearing `source-capture` artifact whose output kind the runner verifies.

## The Automation Lesson

Two derived steps now share one pattern with zero changes to the bridge, which is the signal that the abstraction is right: provider draft → contract validation (each step contributing its own invariant — primary-in-candidates for keyword research, unique ids for source capture) → artifact envelope with lineage → runner output verification. The per-step invariant is the part that varies and matters; the surrounding machinery is fixed. The remaining steps — seo-brief, outline, article-draft — will diverge in that they consume *multiple* upstream artifacts (an SEO brief draws on the idea, keyword research, and sources), so the next escalation is a step whose input is more than one prior artifact and whose lineage therefore carries more than one id. The discipline to preserve is that each upstream reference in that lineage is real and validated, not assumed.

## Next Case Study Thread

This adds the provenance step, the second derived step to reuse the bridge unchanged.

The next build thread should:

- add the fourth content **step service** — `seo-brief` — executed through the durable runner as the first **multi-input** derived step: it consumes the idea, the keyword-research artifact, and the source-capture artifact, and emits an `seo-brief` `Artifact` whose lineage carries all three upstream ids, the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'seo-brief' }`.
