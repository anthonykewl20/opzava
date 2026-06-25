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

### Orchestration engine (see `docs/ard/0014-workflow-engine.md`)

- `Step`: one typed unit of work in a `WorkflowDefinition`, with declared inputs and outputs; an execution of a Step is a `StepRun`. The graph position of a Step within a `WorkflowGraph` is its identity — do not call it a "node".
- `WorkflowGraph`: the directed graph of `Step`s + `Edge`s that a `WorkflowDefinition` compiles to — the single shape both the inherited scheduler-dispatch and the durable runner execute against (the unification surface).
- `Edge`: a directed connection from one `Step` to another, carrying an `EdgeHandle` (`source | approved | rejected | error | …`) that selects which downstream Step runs for a given outcome. Branching is data on the Edge, not a control-flow Step.
- `RunContext`: the data a `StepRun` reads from prior StepRuns and writes for later ones — the inter-step data flow of a `WorkflowRun`. Not a property of any single Step.
- `ReviewStrategy`: a reusable quality-judge that evaluates a StepRun's output and returns a verdict (valid / invalid + feedback, optionally modified params). `Aegis` and the content-quality rule-gates (`AntiSlopReview`, fact-check, brand) are ReviewStrategies — the automated counterpart to a human `Approval`.
- `ModelInvocation`: the result of a provider LLM call (text + token usage + cost) returned at the provider seam; a specialization of `ExternalCall`. The seam through which Steps call models without knowing the provider (the `ProviderAdapter` runtime).

### Essential product surfaces (UX-redesign; see `docs/architecture/ux-redesign/wiring/`, ARD 0013)

- `ProjectProfile`: the Engine-B product overlay on an inherited `project` — its `type` (`blank | marketing | …`) and `enabled_tiles`. The inherited `projects` table is never mutated for product concerns.
- `Board` / `Card`: a **presentation view** over inherited `tasks` (columns ≈ task status groupings) — **not** new tables. A "card" IS a `task`.
- `TodoList` / `TodoItem`: an Engine-B **grouping** over `tasks` (references task ids by value, joined at the composition layer) — **not** a new work-item type.
- `Goal`: a SMART objective (statement, measurable + current + unit, deadline, label status, owner, connected work) with computed progress; never traffic-light coloured.
- `Idea`: a Discovery-board item (`column`: New | Exploring | Decided | Parked; votes, research sources, single-model AI opinion) that may `connect` to a project.
- `Document`: a Docs-&-Files entry (doc or uploaded file) with a storage abstraction; distinct from repo/OpenAPI docs.
- `MarketingCampaign`: a multi-channel campaign umbrella (`stage`: Plan→Create→Approve→Publish→Measure) — distinct from the email-send `Campaign`, which it reuses as its email channel executor.
- `Asset`: a marketing asset (file + type + status) reviewed via `Approval`.
- `MetricEvent`: an ingested external metric (email/web/social/ads) — the only honest source of report numbers; absent until its `Connector` exists.
- `Connector`: a uniform external integration (`AdminConfig` connection + `SecretReference` + guarded `ProviderAdapter` + ingestion to `MetricEvent`).
- `LinkedTool` / `ToolHealth`: a connected agent tool and its state (`active | connected | degraded | disconnected | not_linked`), shown by glyph+label.
- `Conversation`: a typed thread (`orchestrator | assistant | team | dm`) layered over inherited `messages`; AI turns carry inline step/artifact/`Approval` cards.
- `NeedsYouRollup`: the deterministic cross-project aggregation ("N projects need you · M blocked") computed from approvals, at-risk goals, tool health, and tasks awaiting owner.
- `AssistiveAI`: any AI-authored block (analysis, recommendation, "make it SMART", consensus, draft, digest) that shows provenance and routes through human `Approval` before any action — never autonomous.

## Forbidden Ambiguity

- Do not say `task` when the correct term is `WorkflowRun`, `StepRun`, or `Job`. A `task` (the kanban Card) is the human-facing work item; a `StepRun` is a workflow execution unit — a task may be progressed by a WorkflowRun, but they are distinct.
- Do not say `node` when the correct term is `Step` (the definition) or `StepRun` (an execution). "Node" is a foreign term from other frameworks; Opzava's graph units are Steps.
- Do not say `content` when the correct term is `SEOBrief`, `Outline`, `ArticleDraft`, `FactCheckReport`, or `BrandReview`.
- Do not say `config` when the correct term is `AdminConfig`, environment bootstrap config, or `SecretReference`.
- Do not say `done` unless the acceptance tests and required artifacts exist.
- Do not say `probably`, `should`, or `likely` for a build-critical fact without a discovery note.
- Do not say `AI output` without naming its artifact type, source provenance, validation status, and approval state.
- Do not say `Campaign` when you mean `MarketingCampaign` (the multi-channel umbrella) — the email-send `Campaign` is only its email channel executor.
- Do not say `Card` or `Todo` as if it were a new stored entity — both are views/groupings over inherited `tasks`; do not create `opzava_card`/`opzava_todo` tables (ARD 0013, D1).
- Do not present a report number (opens, clicks, spend, traffic) as real without a live `Connector` and `MetricEvent` data; until then the surface shows a "connect &lt;platform&gt;" state.
- Do not say the AI "publishes", "decides", or "acts" autonomously — it is `AssistiveAI`: it drafts, a human `Approval` gates, a guarded `ProviderAdapter` acts.

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
