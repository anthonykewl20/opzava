# 0049: Content Artifact Envelope

Date: 2026-06-16
Status: Draft
Thread: The ten content artifact contracts (0038-0047) and their validated step graph (0048) name *what* a derived step may produce, but each payload type was an island: a `KeywordResearch`, a `SeoBrief`, an `ArticleDraft`, each with its own schema and its own line of provenance. Nothing yet made them first-class, queryable, lineage-bearing records the way the generic `Artifact` contract already models a derived artifact. This slice adds the single typed bridge — `createContentArtifact` — that wraps an already-validated derived content payload as a generic `Artifact`, stamped `validation.status === 'valid'`, with its source step run and upstream lineage attached. Per ARD 0003, `idea-intake` is deliberately excluded from the envelope's type list: it is the root intake record, not a derived artifact, and it must never be wrapped.

## Hook

A content pipeline with ten distinct output schemas and no shared envelope has two failure modes that look benign until production. First, downstream code that wants to ask "which artifacts does this run own, and which produced which?" has no common shape to query — it must know every content type by name. Second, the lineage that makes a pipeline auditable lives inside each payload's own `ideaId` / `researchId` / `briefId` fields, duplicated per contract and inconsistent in shape. The generic `Artifact` contract already solves both: one queryable record, one `lineage.inputArtifactIds` list, one `validation` stamp. The risk is not building the bridge — it is wrapping the root intake by mistake and breaking the invariant that every generic artifact has a real ancestor. This slice builds the bridge and, by typing the allowed `artifactType` list without `idea-intake`, makes that mistake unconstructable.

## Product Stakes

Slices 0038-0047 closed the content vocabulary; slice 0048 wired the steps into a validated DAG. Both left every step output as its own typed value object, owned by the content module, invisible to anything that reasons over generic artifacts. As long as that gap lasts, the content workflow cannot hand its outputs to any consumer that operates on a generic `Artifact` — a lineage store, a replay query, an audit projection — without bespoke per-type glue for all nine derived types.

This slice adds `createContentArtifact` under `src/opzava/modules/content/artifacts/`. It takes an already-validated derived payload (the contract `parse*` functions already ran), the producing step run id, the upstream `inputArtifactIds`, and the validation timestamp, and returns a frozen generic `Artifact` with `artifactType` drawn from a closed list. The list carries exactly the nine derived content types (`keyword-research` through `wordpress-draft-request`); `idea-intake` is absent by ARD 0003. The generic `parseArtifact` still enforces the two load-bearing invariants — `lineage.inputArtifactIds` is non-empty, and `content` carries no secret reference — so the envelope adds a type boundary without weakening a single existing rule.

## Industry Counterfactual

The common shortcut is to treat "envelope" as a runtime concern and leave it out of the types: persist each content payload in its own table, reconstruct lineage with a join across nine differently-shaped foreign keys, and rely on each step service to remember to record its inputs somewhere. The validation stamp becomes a column a step "usually" sets; the lineage becomes a graph an operator re-derives from logs.

That detaches the auditability from any checkable artifact. A step service that forgets to record an input ancestor — or records an empty one for a root-ish step — produces a derived artifact with no lineage, and nothing fails loudly. The post-mortem, tracing why a published draft had no keyword-research ancestor, finds a convention that was *understood* but never *declared*.

Opzava declares the envelope as a typed function over a closed `artifactType` list, and routes every derived payload through `parseArtifact`, whose `superRefine` rejects empty lineage and secret-laced content at parse time. The root-vs-derived split is expressed in the type list itself: `idea-intake` is not a member, so wrapping it is a type error at compile time and a thrown error at runtime. Lineage is not optional metadata a step records later; it is a constructor argument the artifact cannot exist without.

## What We Built

We added `src/opzava/modules/content/artifacts/content-artifact.ts`:

- exports `CONTENT_ARTIFACT_TYPES`, a closed `as const` tuple of the nine derived content types (`idea-intake` deliberately excluded per ARD 0003)
- exports `ContentArtifactType` (the union of those nine) and `CreateContentArtifactInput` (a `Readonly` parameter object)
- exports `createContentArtifact`, which guards the `artifactType` against the closed list, then delegates to `parseArtifact` with `validation: { status: 'valid', checkedAt }` and `lineage: { inputArtifactIds: [...input] }`
- returns whatever `parseArtifact` returns — a frozen generic `Artifact`
- is pure: no runner, no providers, no I/O, no side effects

The module index re-exports `CONTENT_ARTIFACT_TYPES`, `createContentArtifact`, `ContentArtifactType`, and `CreateContentArtifactInput` so the envelope is part of the content module's public API.

## What We Refused To Fake

We did not relax the generic `Artifact` contract or its non-empty-lineage `superRefine`; the existing invariant stays strict and the existing tests stay green.

We did not include `idea-intake` in the envelope's type list, because ARD 0003 establishes it as a root intake record with no input artifacts — wrapping it would either fail the lineage rule or force us to weaken it, and we refused both.

We did not duplicate the validation or secret-reference checks inside the envelope; `parseArtifact` already owns them, and re-implementing them here would be the shallow-wrapper / reinvented-rule pattern the codebase rejects. The envelope's single job is the typed type-boundary guard; the invariants stay exactly where they already live.

We did not add a runner, step services, or provider calls; this slice is the bridge, not the execution.

## Evidence

Files changed:

- `src/opzava/modules/content/artifacts/content-artifact.test.ts`
- `src/opzava/modules/content/artifacts/content-artifact.ts`
- `src/opzava/modules/content/index.ts`

The tests cover:

- wrapping a sample `keyword-research` payload returns an `Artifact` with `artifactType === 'keyword-research'`, deep-equal `content`, `validation.status === 'valid'`, `validation.checkedAt` equal to the input timestamp, and matching `lineage.inputArtifactIds`
- rejecting `idea-intake` (the root intake record is not a derived artifact) with a thrown error
- rejecting an unknown `artifactType` (e.g. `nonsense`) with a thrown error naming the type
- rejecting empty `inputArtifactIds` (parseArtifact's derived-lineage rule throws)
- rejecting `content` that smuggles a secret-reference-shaped object
- the returned `Artifact` is frozen
- the result is deterministic for identical input

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/artifacts/content-artifact.test.ts: passed 7/7 (failed before implementation: import "./content-artifact" unresolvable — module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 108/108 (9 derived content contracts + idea-intake + content-workflow graph + content-artifact envelope)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
```

This slice wraps every derived content payload as a first-class, lineage-bearing generic `Artifact`; the root intake record stays its own typed record by the closed type list.

## The Automation Lesson

The boundary this slice draws is deliberate. The envelope makes a derived content output a generic `Artifact`, but it does not yet *produce* one: it assumes the payload has already been validated by the matching content `parse*` contract, and it assumes the `inputArtifactIds` it is handed actually resolve to real upstream records. A later step-service slice must guarantee both — that the content passed in is genuinely schema-valid (not `unknown` dressed as validated), and that the lineage ids reference real rows (the intake record is not itself a generic artifact, so resolution is a runtime concern, as ARD 0003 notes). Shipping the envelope without the step services would let a caller hand it an unvalidated payload and an invented lineage, so the next slice must close that loop at the producing boundary, not assume it.

## Next Case Study Thread

This builds the typed bridge that turns each derived content payload into a first-class, queryable, lineage-linked generic `Artifact`.

The next build thread should:

- add the first content **step service**: `idea-intake` executed as an application service that produces a validated `IdeaIntake` root record (no envelope — it is the root per ARD 0003), run through the durable runner on mock providers, and then `keyword-research` as the first derived step, which consumes the intake record id and emits its first derived `Artifact` through `createContentArtifact` — the envelope wired into a real producing step.
