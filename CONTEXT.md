# Opzava Context

This file defines the shared language future agent runs must use when reasoning about `opzava`.

## Product Identity

- Full brand name: `Opzava`.
- Machine slug: `opzava`.
- Local directory: `anito-opzava`.
- Product: self-hosted AI operations control plane for building an internal AI team.
- Base project: an open-source agent-orchestration base (recorded in `docs/ard/0001-use-mission-control-as-base.md`).
- First department workflow: content generation ending at a WordPress draft.
- Broader scope: SEO research, writing, editing, lead research, cold outreach, campaign operations, reporting, and human approvals.

## Core Principle

Agents are workers, not the brain. The system owns sequence, validation, retries, approvals, external actions, source provenance, cost tracking, admin-managed configuration, and audit trails.

## Brand Rule

Product-facing surfaces use `Opzava`, never `Mission Control`. `Mission Control` is allowed only as a historical upstream reference in ARDs, discovery notes, migration comments, license-required attribution, or tests that assert brand removal.

## Source Of Truth

- Structured database artifacts are the source of truth.
- Admin settings are the source of truth for operator-controlled provider configuration.
- Agent memory is not source of truth.
- Prompt text is not source of truth.
- Logs are evidence, not source of truth.
- External provider responses must be captured as structured artifacts or external-call records before downstream steps depend on them.

## Ubiquitous Language

- `WorkflowDefinition`: versioned template for a workflow.
- `WorkflowRun`: one execution of a workflow definition.
- `StepRun`: one execution of a workflow step inside a workflow run.
- `Artifact`: structured output from a step, validated against a versioned schema.
- `Approval`: human decision gate for a requested side effect or content milestone.
- `Job`: durable unit of work scheduled for execution.
- `Attempt`: one try at executing a job.
- `DeadLetter`: exhausted failed job with replay metadata.
- `ExternalCall`: recorded interaction with a provider.
- `CostEvent`: recorded cost or usage event.
- `AuditEvent`: durable record of who or what changed system state.
- `ProviderAdapter`: mock or live adapter that enforces the provider contract.
- `AdminConfig`: operator-controlled configuration stored and validated by the app.
- `SecretReference`: reference to a secret value, never the cleartext value in logs, generated artifacts, or source code.
- `SourceProvenance`: captured evidence linking generated content to sources.
- `AntiSlopReview`: review artifact that rejects generic, unsupported, formulaic, or low-information output.

## Forbidden Ambiguity

- Do not say `task` when the correct term is `WorkflowRun`, `StepRun`, or `Job`.
- Do not say `content` when the correct term is `SEOBrief`, `Outline`, `ArticleDraft`, `FactCheckReport`, or `BrandReview`.
- Do not say `config` when the correct term is `AdminConfig`, environment bootstrap config, or `SecretReference`.
- Do not say `done` unless the acceptance tests and required artifacts exist.
- Do not say `probably`, `should`, or `likely` for a build-critical fact without a discovery note.
- Do not say `AI output` without naming its artifact type, source provenance, validation status, and approval state.

## Content Quality Language

- `Source-backed`: claims trace to captured sources.
- `Fact-checked`: claims were checked by a dedicated step and review artifact.
- `Brand-reviewed`: voice, structure, and positioning passed the brand review step.
- `Human-approved`: an accountable human approved the external action.
- `AI slop`: generic, unsupported, low-information, repetitive, or formulaic generated output that should not be published or stored as final content.

## Engineering Quality Language

- `Complexity`: current difficulty of understanding, testing, or changing code.
- `Entropy`: gradual structural, semantic, or behavioral decay over time.
- `Golden principle`: mechanical rule encoded in the repo so future agent runs preserve team taste.
- `Garbage collection`: recurring cleanup process that detects drift and opens targeted refactor tasks.
- `Red-green-refactor`: write a failing test, make it pass with the smallest correct change, then simplify.
