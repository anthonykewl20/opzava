# Opzava Implementation Layers

This document turns the product plan into a local development, R&D, testing, benchmark, garbage-collection, and complexity-control system.

The goal is to build `opzava` without guessing through hard decisions, without hiding risk behind vague abstractions, without amplifying AI slop, without hard-coding secrets or operator settings, and without letting code entropy accumulate while the product is still young.

## Non-Negotiable Rules

- Do not build risky core behavior from assumptions. Investigate locally, measure, document, then decide.
- Do not use agent memory, prompts, or transient logs as source of truth. Persist structured data.
- Do not connect live external side effects until the mocked path passes state, replay, idempotency, approval, and secret-redaction tests.
- Do not accept vague success criteria. Each layer needs observable outputs and repeatable checks.
- Do not add architecture because it feels flexible. Add architecture only when discovery proves the need.
- Do not let the upstream Mission Control generic task model become the Opzava artifact model.
- Do not let generated content bypass source provenance, fact-check, brand review, anti-slop review, or human approval.
- Do not hard-code secrets, API keys, provider credentials, model choices, endpoint URLs, workflow limits, or operator-tunable variables in source code.
- Do not rely on Friday cleanup. Entropy must be collected continuously in small targeted passes.

## Layer 0: Shared Context And Golden Principles

Purpose: capture human taste once so future agent runs use consistent language and constraints.

Required setup:

- Maintain `CONTEXT.md` as the shared language for product terms, architecture terms, configuration terms, and forbidden ambiguity.
- Maintain `docs/golden-principles.md` as the mechanical rulebook for code quality, content quality, testing, secrets, configuration, and entropy control.
- Maintain `docs/architecture/branding.md` as the Opzava-only product branding gate.
- Maintain `docs/architecture/folder-structure.md` as the file-placement gate for allowed roots and source folders.
- Maintain `docs/architecture/code-simplicity.md` as the generated-code simplicity gate.
- Maintain `docs/architecture/production-grade-complexity.md` as the Production-grade complexity gate.
- Treat `src/opzava/modules/<feature>/` as the default unit for product capability growth.
- Convert recurring review comments into golden principles, tests, lint rules, or garbage-collection tasks.
- Keep generated code and generated content accountable to the same quality system.

Deliverables:

- `CONTEXT.md`
- `docs/golden-principles.md`
- `docs/architecture/folder-structure.md`
- First recurring garbage-collection checklist in this document

Exit criteria:

- Future implementation work has shared vocabulary before broad code generation starts.
- The repo contains rules for rejecting AI slop, shallow modules, guessed data shapes, hard-coded secrets, and hidden side effects.
- Product capabilities have feature-module boundaries before implementation starts.
- Generated code is accepted only when it is simple, singular in purpose, readable, tested, and free of speculative abstractions.
- Generated code must implement a production-grade slice, not an MVP scaffold or shortcut.
- Product-facing surfaces use `Opzava`; upstream `Mission Control` naming is retained only for historical attribution or migration evidence.

## Layer 1: Base Acquisition And Upstream Audit

Purpose: know what Mission Control actually provides before changing it.

Required discovery:

- Pin the upstream base commit used as the starting base.
- Record install, dev, build, test, lint, typecheck, migration, and seed commands.
- Map routes, data models, job or scheduler code, external integrations, auth, logging, settings, and cost panels.
- Identify OpenClaw-first assumptions to keep, replace, isolate, or remove.
- Identify existing tests and coverage gaps.
- Identify current package manager and lockfile behavior. This project uses `pnpm` only.
- Identify any existing hard-coded secrets, demo keys, provider URLs, defaults, or operator settings that must move to admin settings or safe environment bootstrap config.

Deliverables:

- `docs/discovery/0001-mission-control-audit.md`
- Accepted or amended base decision in `docs/ard/0001-use-mission-control-as-base.md`
- Initial command inventory for local development
- Initial settings and secret-handling inventory

Exit criteria:

- A developer can explain what the upstream Mission Control base gives us and what must be custom Opzava code.
- No core rewrite starts before the base code paths are mapped.
- No live provider credential path is accepted without admin settings, safe storage, typed validation, and redaction behavior.

## Layer 2: Local Development Harness

Purpose: make implementation reproducible on a local machine before debating production architecture.

Required discovery:

- Confirm local startup from a clean checkout.
- Confirm database setup, reset, migration, and seed flow.
- Confirm how local credentials are represented without committing secrets.
- Confirm test fixtures for workflows, artifacts, approvals, admin config, secret references, and integrations.
- Confirm how local logs and failure records are inspected without exposing secrets.

Deliverables:

- Local setup notes in `docs/discovery/`
- Minimal seed data for one content workflow run
- Mock adapters for LLM, search, WordPress, and any future email provider before live adapters
- Local admin settings fixture using fake values and secret references only

Exit criteria:

- The app can run locally with mock providers.
- The workflow can execute without real external side effects.
- Local development never requires committing API keys or secret-bearing environment files.

## Layer 3: Measurement And Benchmark Baseline

Purpose: avoid fake performance claims and make regressions visible.

Benchmark policy:

- Measure first, then set budgets. Do not invent performance budgets before the base app runs locally.
- Store local benchmark runs in `docs/benchmarks/` with date, machine notes, command, dataset, result, and interpretation.
- Compare future results against the recorded local baseline, not against memory.
- Treat large regressions as blockers unless the tradeoff is documented in an ARD.
- Never store cleartext secrets in benchmark commands, logs, datasets, or outputs.

Initial metrics to capture:

- Install time with `pnpm install` after dependencies exist.
- Dev server cold start time.
- Production build time.
- Test suite duration.
- Typecheck duration.
- Lint duration.
- Database migration and seed duration.
- Admin config validation duration.
- Mock content workflow duration from intake to approval-blocked WordPress draft step.
- Runner recovery time after simulated process restart.
- Duplicate external-action prevention under retry.
- Anti-slop review duration and rejection rate for a fixture set.

Deliverables:

- `docs/benchmarks/0001-local-baseline.md`
- Benchmark commands that can be rerun by another developer
- Clear note when a metric is not available yet and what must exist before measuring it

Exit criteria:

- No optimization work is accepted without before and after measurements.
- No benchmark result is treated as reliable unless the command, dataset, and environment are recorded.

## Layer 4: Contract And Data Model Layer

Purpose: prevent semantic decay by defining what the system stores before workflow code starts depending on it.

Required contracts:

- `WorkflowDefinition`: stable workflow identity, version, step graph, and allowed inputs.
- `WorkflowRun`: run identity, workflow version, status, start and end times, actor, and current step pointer.
- `StepRun`: step identity, status, input artifact IDs, output artifact IDs, attempt count, and failure reason.
- `Artifact`: type, schema version, source step, content payload, validation status, and lineage.
- `Approval`: requested action, target artifact or external action, approver, decision, reason, timestamps, and expiry.
- `Job`: durable unit of work, idempotency key, lock metadata, priority, and scheduled time.
- `Attempt`: job attempt number, started and finished timestamps, result, error class, and retry decision.
- `DeadLetter`: failed job snapshot, final error, replay eligibility, and replay source.
- `ExternalCall`: provider, operation, idempotency key, request summary, response summary, timeout, and retry metadata.
- `CostEvent`: provider, model or operation, units, estimated cost, actual cost when available, and related run.
- `AuditEvent`: actor, action, target, before and after summary, timestamp, and correlation ID.
- `AdminConfig`: operator-controlled settings, schema version, validation status, actor, and audit metadata.
- `SecretReference`: reference to a secret value stored outside source code and never serialized as cleartext.
- `SourceProvenance`: source URL or origin, capture timestamp, extraction summary, claim linkage, and trust notes.
- `AntiSlopReview`: reviewed artifact, detected slop patterns, required fixes, reviewer, and pass or fail decision.

Required state machines:

- Workflow run states.
- Step run states.
- Job states.
- Attempt states.
- Approval states.
- External action states.
- Admin config states.
- Secret reference states.
- Content quality review states.

Testing requirements:

- Schema validation tests for every artifact type.
- Migration tests for the database schema.
- State transition tests that reject invalid transitions.
- Admin config validation tests for missing, invalid, unsafe, or redacted values.
- Secret redaction tests proving logs, artifacts, and provider call records never expose cleartext secrets.
- Lineage tests proving derived artifacts reference their inputs.
- Source-provenance tests proving claims cannot pass without captured evidence.

Exit criteria:

- Runner code cannot compile or pass tests without using explicit contracts.
- Artifact contracts are versioned before the first generated article draft exists.
- Provider code cannot access cleartext credentials except through the approved secret-resolution boundary.

## Layer 5: Durable Runner Layer

Purpose: make workflow execution reliable before building broad product features.

Required behavior:

- Persist every scheduled job before execution.
- Persist every state transition.
- Use idempotency keys for every job and external action.
- Lock work so a step cannot be executed by two workers at the same time.
- Retry only when the error class says retry is safe.
- Move exhausted failures to dead letters with enough context to inspect and replay.
- Replay from the failed step using existing successful artifacts, not by rerunning the whole workflow blindly.
- Resolve provider settings from validated `AdminConfig` and `SecretReference` records.
- Recover after process restart without losing or duplicating work.

Testing requirements:

- Unit tests for transition rules.
- Integration tests with a real local database.
- Failure injection tests for thrown errors, timeouts, malformed provider responses, invalid admin settings, and process restart.
- Idempotency tests proving duplicate retries do not create duplicate external drafts.
- Dead-letter replay tests from the failed step.

Exit criteria:

- The mocked content workflow survives failed steps and restarts locally.
- Failure visibility is available before live provider adapters are used.

## Layer 6: Content Workflow And Provenance Layer

Purpose: prove the first department workflow without making content generation the whole product and without generating AI slop.

Build order:

- Idea intake.
- Topic and keyword research using mock provider output first.
- SERP and competitor research using mock provider output first.
- Source capture with structured source artifacts.
- SEO brief artifact.
- Outline artifact.
- Article draft artifact.
- Fact-check report artifact.
- Brand and style review artifact.
- Anti-slop review artifact.
- Human approval.
- WordPress draft external action after approval only.

Testing requirements:

- Golden sample artifacts for one complete mocked workflow.
- Contract tests for each step input and output.
- Source-provenance tests for claims in the SEO brief and draft.
- Anti-slop fixture tests that reject generic, unsupported, formulaic, or low-information output.
- Approval-blocking tests before WordPress draft creation.
- Rejection-path tests proving rejected approvals do not continue to external side effects.

Exit criteria:

- One content workflow completes locally in draft-only mode.
- Every important output is structured and queryable.
- Generated content cannot reach WordPress draft creation without source, fact-check, brand, anti-slop, and human approval artifacts.

## Layer 7: Integration Provider Layer

Purpose: keep external systems from leaking complexity into workflow code.

Required provider contract:

- Provider name.
- Operation name.
- Input schema.
- Output schema.
- Admin setting keys required by the provider.
- Secret references required by the provider.
- Timeout.
- Retry policy.
- Idempotency key.
- Cost extraction.
- Structured log summary.
- Secret redaction rules.
- Mock adapter.
- Live adapter.

First adapters:

- Mock LLM provider.
- Mock search or SEO research provider.
- Mock WordPress provider.
- Live WordPress draft provider only after approval, admin config, secret redaction, and idempotency tests pass.

Exit criteria:

- No workflow step calls a live provider directly.
- Every external call writes an `ExternalCall`, `CostEvent` when relevant, and `AuditEvent`.
- Every live provider uses validated admin settings and secret references.

## Layer 8: Admin Settings And Secret Management Layer

Purpose: make operator-controlled variables configurable without putting secrets or deployment-specific values in code.

Admin settings own:

- Provider enablement and selected provider per workflow step.
- Provider endpoint URLs when operators need control.
- Model names and generation limits.
- Timeout, retry, and rate-limit values within safe bounds.
- WordPress site configuration through secret references.
- Future email provider configuration through secret references.
- Cost warning thresholds.
- Feature flags that are safe for operator control.

Secret rules:

- No hard-coded secrets in source code, tests, docs, logs, artifacts, benchmarks, or discovery notes.
- Store cleartext secret values only in the approved secret store or environment secret provider.
- Store only `SecretReference` values in the database when a field points to a secret.
- Redact secrets before writing logs, external-call records, artifacts, audit events, or test output.
- Audit every admin setting change without recording cleartext secret values.

Testing requirements:

- Admin settings schema validation tests.
- Missing secret reference tests.
- Invalid secret reference tests.
- Redaction tests for logs, audit events, external-call records, and artifacts.
- Permission tests proving only authorized admin users can change provider settings.

Exit criteria:

- Operators can configure providers from the app without code changes.
- Live provider adapters cannot start unless required settings are valid and required secret references resolve.

## Layer 9: UI And Operations Layer

Purpose: expose the system state without turning the UI into the workflow brain.

Required panels for the first implementation:

- Team Dashboard.
- Content Runs.
- Artifact detail views for SEO briefs, drafts, fact checks, brand reviews, anti-slop reviews, and source provenance.
- Approval Queue.
- Failures and Dead Letters.
- Costs.
- Settings and Integrations.

Deferred panels:

- Outreach Runs.
- Leads.
- Email Drafts.

Exit criteria:

- Operators can inspect run state, artifact lineage, approval state, failure state, content quality state, admin settings state, and cost state from one dashboard.
- UI actions call application services that enforce state transitions; UI code does not bypass the runner, admin config validation, or approval gate.

## Layer 10: Complexity And Entropy Controls

Purpose: prevent structural, semantic, and behavioral decay while the system grows.

Complexity controls:

- Track cyclomatic complexity for implemented TypeScript code once the base stack is present.
- Track cognitive complexity if the selected tooling supports it in the stack.
- Fail or review code with deep nesting, long functions, broad switch statements, unclear branching, or repeated conditional policy logic.
- Keep workflow policy in explicit state machines rather than scattered `if` statements.
- Keep provider-specific behavior in adapters, not workflow steps.
- Keep settings validation in the admin config layer, not scattered across provider calls.

Entropy controls:

- No god modules. Runner, contracts, providers, workflow steps, approvals, audit, costs, UI, provenance, quality reviews, and admin settings must remain separate concerns.
- No misleading names. A function name must disclose if it mutates state, schedules work, calls an external provider, reads admin settings, resolves a secret, creates an audit event, or creates content.
- No hidden side effects. External calls, writes, approvals, config changes, secret resolution, and cost events must be explicit in function names or service boundaries.
- No untracked shortcuts. A temporary shortcut needs a documented reason, owner, and removal trigger.
- No dependency cycles across core layers.
- No broad abstractions before two real use cases prove the seam.

Measurement candidates after the stack exists:

- ESLint complexity and max-depth rules.
- Dependency cycle checks.
- TypeScript strictness checks.
- Test coverage for state transitions and integration adapters.
- Secret-scanning and hard-coded-config checks.
- SonarQube or SonarJS only if local discovery proves it fits the stack and workflow.

Exit criteria:

- Complexity checks exist before major workflow expansion.
- Any accepted complexity exception has an ARD or discovery note with a removal plan.

## Layer 11: TDD And Feedback Loop

Purpose: keep agents from flying blind.

Required loop:

1. Write the failing test or executable discovery check.
2. Confirm it fails for the expected reason.
3. Implement the smallest correct change.
4. Confirm the test passes.
5. Refactor to reduce complexity without changing behavior.
6. Run the relevant suite, typecheck, lint, and benchmark when the change touches performance-sensitive code.

Required feedback types:

- Unit tests for pure contracts and state transitions.
- Integration tests with the local database.
- Admin config and secret-redaction tests.
- Provider contract tests against mock adapters.
- Failure injection tests for runner behavior.
- End-to-end local workflow tests using mock providers.
- Benchmark checks for measured areas.
- Garbage-collection scans for entropy drift.

Exit criteria:

- No major behavior is merged without a failing test or discovery check that justified the implementation.
- Refactoring is part of the loop, not a separate someday task.

## Layer 12: Garbage Collection Process

Purpose: pay down debt continuously instead of scheduling large cleanup bursts.

Recurring scan checklist:

- New shallow modules with complex interfaces.
- Duplicated helpers that should be shared contract or utility code.
- Guessed data shapes instead of schema validation or typed SDK usage.
- Hard-coded secrets, provider URLs, model names, limits, or operator-tunable settings.
- Provider calls outside adapters.
- Admin setting reads outside approved application services.
- Secret resolution outside approved provider boundaries.
- Workflow policy outside state machines.
- Missing idempotency keys.
- Missing source provenance for generated content.
- Generic or formulaic content accepted as final output.
- Functions with misleading names or hidden side effects.
- Modules with rising complexity or dependency fan-in.
- TODOs or shortcuts without owner and removal trigger.

Outputs:

- Quality grade updates for core areas after the implementation exists.
- Targeted refactor tasks that can be reviewed quickly.
- Tests, lint rules, or golden-principle updates for repeated drift.

Exit criteria:

- Repeated bad patterns become automated checks or documented cleanup work.
- Cleanup happens in small increments before entropy compounds.

## Layer 13: R&D Decision Loop

Every blocker or risky decision follows this loop:

1. State the question.
2. List options.
3. Define the local experiment.
4. Run the experiment.
5. Record measurements and observations.
6. Choose a decision.
7. Capture the decision in `docs/ard/` when it affects architecture, data, external integrations, deployment, admin settings, secrets, or long-term maintenance.
8. Add tests or benchmarks that would catch regression.

Stop conditions:

- The local environment cannot reproduce the behavior being discussed.
- The team cannot measure the claimed improvement or risk.
- The proposed solution bypasses artifacts, approvals, audit, cost logging, admin config validation, secret redaction, source provenance, anti-slop review, or idempotency.
- The proposed solution increases module coupling without a documented reason.
- The implementation depends on live external side effects before a mock adapter passes.

## First R&D Queue

1. Audit Mission Control and map what to keep, replace, isolate, or remove.
2. Measure the base app locally before custom architecture changes.
3. Inventory settings, provider credentials, demo keys, hard-coded values, and secret handling in the base app.
4. Decide the durable runner strategy after inspecting existing scheduler or job code.
5. Define the database schema and migration approach for SQLite-first, Postgres-compatible storage.
6. Define state machines for runs, steps, jobs, attempts, approvals, admin config, secret references, and external actions.
7. Define artifact schemas for SEO brief, outline, article draft, fact-check report, brand review, anti-slop review, source provenance, and WordPress draft request.
8. Define the provider contract and mock adapters.
9. Define admin settings schema, secret-reference model, redaction behavior, and permission model.
10. Choose complexity and entropy tooling after the stack is present.
11. Build mocked content workflow and benchmark restart/replay behavior.
12. Add live WordPress draft creation only after approval, admin config, secret redaction, and duplicate-action tests pass.
