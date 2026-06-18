# 0052: Content Keyword Research Step Service

Date: 2026-06-17
Status: Draft
Thread: Slice 0051 ran the first step service — `idea-intake` — through the durable runner, but it produced a root *record*, not a derived *artifact*, and it called no provider. This slice adds the second step service, `keyword-research`: the first **derived** step. It consumes the idea-intake record, calls a **mock keyword provider**, validates a `KeywordResearch` payload, and wraps it as a lineage-bearing generic `Artifact` envelope (per 0049) — the first step whose completion the runner verifies against an `{ kind: 'artifact', artifactType: 'keyword-research' }` output rather than an intake record. It executes end-to-end through the same `createContentStepExecutor` bridge built in 0051.

## Hook

The first step service proved a record could flow through the runner. It did not prove the harder, more common case: a step that *derives* an artifact from a previous step's output, through a provider, and emits it as a typed, lineage-bearing `Artifact` the rest of the pipeline can trust. That is where the real invariants live — the derived payload must be schema-valid, it must trace its lineage back to the idea it came from, and its declared output kind must be an `artifact`, not a record. A derived step that emits an artifact with empty lineage, or whose content fails its own schema, or that quietly returns the wrong output kind, is the defect that ships generic content downstream with no provenance. This slice makes the derived path concrete and checked.

## Product Stakes

Opzava's core principle is that the *system* owns validation and provenance, not the agent. `keyword-research` is the first step where that principle meets a provider call. The mock provider stands in for a future live keyword tool; the step service does not trust its raw output — it shapes it into a `KeywordResearch` payload, validates it against the versioned contract (which requires the chosen `primaryKeyword` to be one of the returned candidates), and only then wraps it as an `Artifact` with `validation.status: 'valid'` and lineage pointing back to the originating idea. The runner then verifies the step emitted the declared `artifact` output before recording success.

This is the pattern every remaining derived step (source-capture, seo-brief, outline, article-draft, fact-check, brand-review, anti-slop-review) will follow: provider draft → schema validation → artifact envelope with lineage → runner output verification. Establishing it correctly once, on a mock provider with no live credentials, is the point.

## Industry Counterfactual

The common shortcut is to let a step call the provider and pass the raw response straight downstream — the keyword tool returns some JSON, the orchestrator stores it, and the next step consumes it. Provenance is whatever the response happened to include; validation is whatever the next step happens to check; the link back to the originating idea lives only in a variable name or a foreign key nobody enforces. When a provider changes its response shape, or returns a `primaryKeyword` that is not among the candidates it offered, the defect is discovered three steps later in a draft that cites a keyword the research never actually ranked.

Opzava refuses the raw passthrough. The provider's output is a *draft*, not an artifact; it becomes an artifact only after `parseKeywordResearch` enforces the contract (including the primary-keyword-in-candidates rule) and `createContentArtifact` enforces non-empty lineage and the no-secret-reference invariant. The step service is the boundary where an untrusted provider response becomes a trusted, traceable artifact — and the runner verifies even that the step emitted the right *kind* of output.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `keyword-research-provider.ts`:
  - `KeywordResearchDraft` — `Readonly<{ primaryKeyword; candidates: readonly KeywordCandidate[] }>`, the provider's untrusted output shape
  - `KeywordResearchProvider` — `(idea: IdeaIntake) => KeywordResearchDraft`, the provider port
  - `createMockKeywordResearchProvider()` — a pure, deterministic mock that derives `primaryKeyword` from `idea.targetKeyword ?? idea.topic` and returns it as the first candidate term (so the contract's primary-in-candidates rule holds), plus two topic-derived candidates
- `keyword-research-service.ts`:
  - `KeywordResearchStepInput` — `Readonly<{ idea: IdeaIntake; sourceStepRunId: string }>`
  - `parseKeywordResearchStepInput(payload)` — structural parse (`sourceStepRunId` + an `idea` field), then `parseIdeaIntake` for the idea's semantic validation
  - `createKeywordResearchStepService({ provider, newId, now })` — a `ContentStepService<KeywordResearchStepInput, Artifact>` whose `run` calls the provider, validates the draft into a `KeywordResearch` via `parseKeywordResearch`, wraps it with `createContentArtifact` (artifactType `keyword-research`, lineage `[idea.ideaId]`), and binds the result to the declared `getContentStepOutput('keyword-research')` output

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged — the 0051 pattern absorbed a derived, provider-backed step with no modification.

## What We Refused To Fake

We did not call a live provider; `createMockKeywordResearchProvider` is a pure deterministic stand-in, and live adapters remain disabled. The provider port exists so a live tool can later replace the mock without touching the step service.

We did not trust the provider's output; its result is typed as a *draft* and must pass `parseKeywordResearch` — including the rule that `primaryKeyword` is one of the candidates — before it can become an artifact. A provider that returned an inconsistent draft would fail at the step boundary, not downstream.

We did not fake lineage; the artifact's `inputArtifactIds` is `[idea.ideaId]`, satisfying the envelope's non-empty-lineage invariant with a real reference to the originating idea, so the keyword research is traceable to its source.

We did not weaken the output contract; the step emits an `artifact` output and the runner verifies it deep-equals `getContentStepOutput('keyword-research')`, so a derived step that emitted the wrong kind would fail rather than ship.

We did not hand-author the implementation; the provider and service were generated by the local fleet (Qwen3-Coder and MiniMax-M3 independently, agreeing on the core logic), transcribed, then reviewed by MiMo and Gemma (both APPROVE, no bugs found) and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/keyword-research-provider.ts`
- `src/opzava/modules/content/steps/keyword-research-service.ts`
- `src/opzava/modules/content/steps/keyword-research-service.test.ts`
- `src/opzava/modules/content/steps/keyword-research-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- `service.run` produces a `keyword-research` `Artifact` whose `validation.status` is `valid`, whose `lineage.inputArtifactIds` contains the idea id, and whose content carries the originating `ideaId`
- `parseKeywordResearchStepInput` accepts a valid `{ idea, sourceStepRunId }` and rejects malformed input (missing `sourceStepRunId`, or an `idea` that fails `parseIdeaIntake`)
- INTEGRATION through the durable runner: a queued job carrying `{ idea, sourceStepRunId }` is leased, executed via `createContentStepExecutor`, recorded `succeeded`, and the captured artifact's `artifactType` is `keyword-research`
- INTEGRATION failure path: a job with a malformed `idea` drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 9/9 across 4 files (the 0051 step service + the new keyword-research provider, service, and runner integration)
node_modules/.bin/vitest run src/opzava: passed 337/337 across 57 files (+5 over the 332 baseline)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/check-plan.test.mjs: passed
```

The first derived content step now executes end-to-end through the durable runner, turning an untrusted mock-provider draft into a validated, lineage-bearing `keyword-research` artifact whose output kind the runner verifies.

## The Automation Lesson

The provider port is the seam that keeps the live/mock distinction out of the step's logic: the service validates and wraps identically whether the draft came from a mock or a live tool, so enabling a real provider later changes one injected function, not the verification path. The deeper lesson for the remaining derived steps is that the provider's output is never the artifact — it is a draft that must survive schema validation and lineage enforcement before the system will call it an artifact. Every step from here to the WordPress draft repeats this shape, so the discipline encoded once here — draft, validate, wrap with lineage, verify output kind — is what keeps unverified provider output from masquerading as trusted content.

## Next Case Study Thread

This adds the first derived, provider-backed step that emits a validated artifact with lineage.

The next build thread should:

- add the third content **step service** — `source-capture` — executed through the durable runner as a derived step that consumes the idea (and is positioned after keyword-research in the graph), calls a mock source provider, and emits a `source-capture` `Artifact` envelope whose captured sources carry unique ids and trace to the originating idea, the step whose completion the runner verifies against `{ kind: 'artifact', artifactType: 'source-capture' }`.
