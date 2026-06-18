# ARD 0003: Content Workflow Artifact Modeling

Status: Accepted
Date: 2026-06-16

## Context

The content workflow (Layer 6) produces a sequence of artifacts: `IdeaIntake`, `KeywordResearch`, `SourceCapture`, `SeoBrief`, `Outline`, `ArticleDraft`, `FactCheckReport`, `BrandReview`, `AntiSlopReview`, and a terminal `WordpressDraftRequest`. Step outputs need to be persisted in a queryable, lineage-bearing way.

The existing generic artifact contract (`src/opzava/core/artifacts/contracts.ts`) models a derived artifact: `artifactType`, `sourceStepRunId`, `content`, `validation`, and `lineage.inputArtifactIds`. A `superRefine` REQUIRES `lineage.inputArtifactIds` to be non-empty ("derived artifacts require lineage inputs"), and forbids secret references in `content`.

This creates a tension: the first content step, `idea-intake` (kind `manual-input`), is the ROOT of the workflow and has no input artifacts. Wrapping it as a generic `Artifact` would fail the non-empty-lineage rule. Every later step does have inputs and fits the generic artifact cleanly.

## Decision

Model the workflow INPUT and the workflow OUTPUTS differently:

1. `idea-intake` is a distinct root intake record, captured by the `IdeaIntake` contract (`src/opzava/modules/content/contracts/idea-intake.ts`). It is NOT wrapped as a generic derived `Artifact`.
2. Every subsequent step output (`KeywordResearch` onward) is persisted as a generic `Artifact` whose `content` is the validated content payload, `artifactType` names the content type, and `lineage.inputArtifactIds` references the prior records it derives from (including the intake record id for `keyword-research`).
3. The generic `Artifact` contract is left unchanged. We do not relax the non-empty-lineage rule, because every derived artifact genuinely has inputs; only the root is special, and the root is already its own typed record.

A three-model fleet consensus (GPT-5.5, GLM-5.2, MiniMax-M3) unanimously recommended this option over relaxing the artifact contract or changing lineage semantics.

## Consequences

- No change to the shipped generic `Artifact` contract or its tests; the non-empty-lineage invariant stays strict and meaningful.
- The content module gains a small envelope layer that wraps a validated content payload as a generic `Artifact` for the derived steps.
- The first content step service produces an `IdeaIntake` intake record; the second (`keyword-research`) consumes it and produces the first derived `Artifact`, with the intake record id in its lineage.
- `lineage.inputArtifactIds` holds opaque record ids; it does not itself enforce that those ids resolve to generic `Artifact` rows (the intake record is not a generic artifact). Referential resolution is a step-service / runtime concern, consistent with the boundary noted for the WordPress draft request gate references.

## Alternatives Rejected

- Relax the artifact contract to allow empty lineage for a root step kind: weakens a useful invariant for every artifact to accommodate one special case.
- Reframe `lineage.inputArtifactIds` as a union of artifact ids and a workflow-run id: changes lineage semantics repo-wide for marginal benefit.
