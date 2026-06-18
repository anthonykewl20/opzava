# Opzava Start Plan

## Product Frame

Full brand name: `Opzava`

Machine slug: `opzava`

Local directory name: `anito-opzava`

Project repository: `https://github.com/anthonykewl20/opzava`

Opzava is a self-hosted AI operations control plane for building our own internal team.

Content generation is the first department workflow, not the whole product.

The product should eventually coordinate SEO research, writing, editing, lead research, cold outreach, campaign operations, reporting, and human approvals from one dashboard.

## Product Equation

```text
Mission Control base
+ Opzava-specific AI team engine
+ durable workflows
+ structured artifacts
+ approval gates
+ external integrations
= Opzava
```

## Starting Doctrine

- Fork and customize Mission Control. Do not merely configure it.
- Keep one dashboard, one source of truth, one workflow model, one audit trail, and one deployment path.
- Agents are workers, not the brain. The system decides sequence, validation, retries, approvals, and external actions.
- Agent memory is never the source of truth. Structured database artifacts are the source of truth.
- Start narrow but design broad.
- Build the durable runner first.
- No auto-publish and no auto-send in the first milestone.
- No hand-waved engineering decisions. Unknowns require local R&D, measured results, and an accepted ARD before implementation proceeds.
- Complexity and entropy are product risks. The build must keep module boundaries small, state transitions explicit, and quality gates measurable.
- Golden principles live in the repo and are enforced continuously, not remembered informally.
- Generated content must have provenance, source validation, and human review so the system does not produce or amplify AI slop.
- No hard-coded secrets, API keys, provider credentials, model choices, endpoints, workflow limits, or operator-tunable variables in source code.
- Provider credentials and operator-controlled variables belong in admin settings with typed config validation, audit events, safe secret references, and secret redaction.
- No upstream brand remnants in product-facing surfaces. The full brand name is `Opzava`.

## Required Implementation Layers

The strategic plan is not enough by itself. Implementation must follow the detailed R&D and engineering layers in `docs/plans/opzava-implementation-layers.md`.

- Product and decision layer: accepted decisions live in `docs/ard/`.
- Shared language layer: product terms, architecture terms, configuration terms, and forbidden ambiguous language live in `CONTEXT.md`.
- Branding layer: product-facing surfaces use `Opzava` and follow `docs/architecture/branding.md`.
- Folder-structure layer: allowed roots, source placement rules, and exception rules live in `docs/architecture/folder-structure.md`.
- Feature-module layer: new product capabilities live under `src/opzava/modules/<feature>/` with contracts, application services, workflows, steps, UI, tests, fixtures, and a public `index.ts`.
- Code-simplicity layer: generated code must satisfy `docs/architecture/code-simplicity.md` before it is accepted.
- Production-grade complexity layer: narrow slices are allowed, but MVP-grade implementation shortcuts are rejected by `docs/architecture/production-grade-complexity.md`.
- Local discovery layer: local codebase audits, blocker investigations, and experiments live in `docs/discovery/`.
- Measurement layer: reproducible local benchmarks and baseline measurements live in `docs/benchmarks/`.
- Contract layer: domain schemas, artifact contracts, state machines, admin config schemas, secret references, and integration interfaces are defined before runner code depends on them.
- Runtime layer: the durable runner, retry rules, replay rules, dead letters, admin settings, secret resolution, and approval gates are built against explicit contracts.
- Verification layer: tests, failure simulations, restart tests, idempotency tests, admin config validation tests, secret redaction tests, and complexity gates must pass before a workflow is called done.
- Entropy-control layer: new abstractions, shortcuts, large modules, dependency cycles, hard-coded settings, and unclear names require review before they become structural debt.
- Garbage-collection layer: recurring cleanup scans detect drift, update quality grades, and produce targeted refactor tasks.

## AI Team Roles

- SEO Researcher
- Content Writer
- Editor and Fact Checker
- Outreach Researcher
- Cold Email Writer
- Lead Qualifier
- Campaign Operator
- Analytics and Reporting Agent
- Human Approver

## Core System Pieces

- Operator dashboard inherited from the upstream Mission Control base
- Team and agent registry
- Workflow registry
- Workflow run history
- Step-level run events
- Structured artifact store
- Durable job runner
- Approval queue
- Admin settings and secret-reference store
- Integration provider layer
- Cost, audit, and failure panels

## First Milestone

1. Clone `https://github.com/anthonykewl20/opzava` into local directory `anito-opzava`.
2. Bring in the upstream agent-orchestration base as the base codebase.
3. Rebrand the app to `Opzava`.
4. Strip, hide, or isolate nonessential OpenClaw-first UI and assumptions.
5. Complete local Mission Control discovery, dependency mapping, hard-coded setting inventory, secret-handling inventory, and baseline measurements before changing core architecture.
6. Establish `CONTEXT.md`, golden principles, and the first garbage-collection checklist before broad code generation starts.
7. Establish the folder-structure and feature-module gates from the actual Mission Control layout before adding app source files.
8. Add the minimal opzava domain model for workflows, runs, steps, artifacts, approvals, jobs, attempts, dead letters, external calls, cost events, audit events, admin config, and secret references.
9. Define workflow, step, artifact, approval, integration, admin config, secret reference, module boundary, and runner state machines before building the runner.
10. Build the durable runner first using mocked internal steps before connecting live integrations.
11. Implement admin settings for provider selection, provider credentials through secret references, model choices, endpoints, workflow limits, timeouts, retries, rate limits, and cost thresholds.
12. Implement one content workflow end to end in draft-only mode.
13. Store every important output as a structured artifact.
14. Add approval gates before WordPress draft creation and before any future publish action.
15. Add source provenance, fact-check, anti-slop, and human review gates before WordPress draft creation.
16. Add failure visibility through dead letters and replay from failed step.
17. Run locally and prove the workflow can survive failed steps and restarts.

## Workflow One: Content Department

```text
Idea intake
-> topic and keyword research
-> SERP and competitor research
-> source capture
-> SEO brief
-> outline
-> article draft
-> fact check
-> brand and style review
-> human approval
-> WordPress draft
```

The first workflow ends at a WordPress draft. It does not publish live content automatically.

## Workflow Two: Outreach Department

```text
Lead source intake
-> prospect research
-> lead qualification
-> enrichment
-> cold email draft
-> compliance and tone review
-> human approval
-> send or schedule
-> reply tracking
```

Outreach starts only after the content workflow proves the durable runner, artifact model, approvals, and audit trail.

## Guardrails

- Product-facing surfaces must use `Opzava`, not `Mission Control`.
- `Mission Control` references are allowed only for historical upstream attribution in ARDs, discovery notes, migration comments, license-required attribution, or tests that assert brand removal.
- Publishing requires explicit approval.
- Email sending requires explicit approval.
- External calls need timeouts, retries, idempotency keys, structured logs, cost tracking, and secret redaction.
- Failed jobs must be visible and replayable.
- The generic upstream Mission Control task model must not become the Opzava artifact model.
- SQLite is acceptable for a single-instance first deployment, but the design must not block a later Postgres migration.
- No hard-coded secrets, API keys, tokens, passwords, provider credentials, provider endpoints, model choices, workflow limits, retry settings, or operator-tunable values in source code.
- API keys and provider credentials must be controlled through admin settings using safe secret references, not stored as cleartext in code, logs, artifacts, discovery notes, benchmarks, or tests.
- Operator-controlled variables must live in admin settings with typed config validation, bounded values, audit events, and secret redaction.
- Live provider adapters cannot run unless required admin settings are valid and required secret references resolve.
- Generated content must cite captured sources and preserve source provenance.
- Content that cannot pass source validation, fact check, brand review, and human approval cannot create a WordPress draft.
- Repeated AI slop patterns must become golden-principle checks or recurring cleanup tasks, not one-off manual reminders.

## Initial UI Panels

- Team Dashboard
- Content Runs
- SEO Briefs
- Drafts
- Outreach Runs
- Leads
- Email Drafts
- Approval Queue
- Failures and Dead Letters
- Costs
- Settings and Integrations

## Not Now

- No live auto-publishing.
- No live auto-sending cold email.
- No full multi-tenant system.
- No separate n8n, Dify, Flowise, Hatchet, or VoltAgent control plane.
- No broad agent marketplace work before the first workflow is proven.

## Definition Of First Done

- Opzava-branded fork runs locally.
- Product-facing Mission Control brand remnants have been removed or classified as allowed historical references.
- Mission Control audit is documented in `docs/discovery/` with what to keep, replace, isolate, or remove.
- `CONTEXT.md` defines the shared product language, architecture language, configuration language, and forbidden vague terms.
- Golden principles are documented in `docs/golden-principles.md`.
- Folder placement is governed by `docs/architecture/folder-structure.md` before app source files are added.
- Feature modules use the `src/opzava/modules/<feature>/` contract before product capabilities are added.
- Generated code passes the code simplicity gate in `docs/architecture/code-simplicity.md`.
- Generated code passes the production-grade complexity gate in `docs/architecture/production-grade-complexity.md`.
- Local benchmark baseline is documented in `docs/benchmarks/` before optimization claims are made.
- Domain contracts and state machines exist before durable-runner behavior depends on them.
- Admin settings, typed config validation, safe secret references, secret redaction, and audit events exist before live provider adapters are used.
- Admin can start one content workflow run.
- Each workflow step writes a structured artifact or run event.
- Failed steps are visible and replayable.
- Approval queue blocks external side effects.
- Generated content has source provenance, fact-check output, brand-review output, and anti-slop review output.
- WordPress draft creation is possible only after approval.
- Restart, retry, replay, approval-blocking, and duplicate external-action tests pass.
- Admin config validation and secret redaction tests pass.
- Complexity, entropy, TDD, and garbage-collection checks are in place for the implemented stack.
- Tests and validation checks pass.
