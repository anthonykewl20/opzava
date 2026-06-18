# Opzava Production-Grade Complexity Gate

No MVP-grade implementation.

Opzava is allowed to start with a narrow first workflow, but every shipped slice must be full-spec, production-grade, observable, testable, and maintainable. Narrow scope is acceptable. MVP-grade shortcuts are not.

## Production-Grade Slice

Production-grade slice is the canonical term for a narrow but complete implementation unit.

A production-grade slice is the smallest complete version of a capability that includes its real foundations:

- Typed contracts and schema validation.
- Explicit state transitions.
- Persistence where the system depends on state.
- Audit events for state-changing actions.
- AdminConfig and SecretReference handling when operator settings or credentials are involved.
- Structured errors and retry decisions where failures are expected.
- Tests for success, failure, authorization, validation, and regression behavior.
- Observability hooks: logs, events, cost events, or dead letters where relevant.
- No fake TODO path that pretends the feature is done.

Small does not mean partial. Simple does not mean shallow. A slice can defer a feature, but it cannot fake the foundation for the feature it claims to implement.

## Context Guardrails

Agents must not read the whole codebase and mimic entropy by default.

- Start from `CONTEXT.md`, `docs/golden-principles.md`, `docs/architecture/folder-structure.md`, `docs/architecture/code-simplicity.md`, and this gate.
- Read only the modules, contracts, tests, and routes needed for the current atomic task.
- Do not copy broad patterns from inherited Mission Control code without a discovery note proving the pattern still fits Opzava.
- Do not infer dependencies from filenames. Verify imports, package manifest, and existing module boundaries.
- Use curated discovery notes and architecture contracts before broad source scanning.

## Task Scoping

Agent tasks must be atomic and single-responsibility.

Good task shape:

- Add one contract.
- Add one state transition.
- Add one provider adapter behind an existing contract.
- Add one route adapter for an existing application service.
- Add one failure/replay test.

Bad task shape:

- Build the whole content workflow.
- Wire all providers.
- Make the dashboard production ready.
- Refactor the runner and improve UI.

Broad goals must be split into small production-grade slices with their own tests and acceptance criteria.

## Tiered Change Model

The gate must not turn simple changes into bureaucracy. Apply the smallest review path that still protects production quality.

## Simple Change Track

Use the Simple Change Track only when all of these are true:

- The change touches one module or one documentation contract.
- The change does not alter persistence, state machines, provider calls, AdminConfig, SecretReference, approvals, audit, costs, provenance, auth, or public module APIs.
- The change does not add a dependency.
- The change has a focused failing test or validation check first.
- The change can be explained in one sentence.

Simple Change Track required gates:

- Red-green-refactor.
- Relevant focused tests.
- Typecheck/lint/static checks when app source exists and the touched file is part of that stack.
- Simplicity review against `docs/architecture/code-simplicity.md`.

Simple changes do not require a new ARD, benchmark, reviewer-agent loop, or full-spec anchor unless they touch one of the high-risk areas above.

## Gate Applicability

Use this applicability model:

- Tier 1 simple fixes and docs clarifications: focused red-green validation, simplicity check, no new architecture unless the contract changes.
- Tier 2 feature slices: full-spec anchor, contracts, tests, complexity budgets, static analysis, and reviewer-agent loop when non-trivial.
- Tier 3 platform and safety-critical changes: all Tier 2 gates plus discovery note, benchmark when measurable, ARD when architecture changes, dependency review, and failure-injection tests.

Safety-critical areas always use Tier 3: durable runner, persistence, migrations, AdminConfig, SecretReference, provider adapters, approvals, external side effects, audit, costs, provenance, auth, rate limiting, and dead-letter replay.

## Automated Complexity Budgets

Budgets must be calibrated after the Mission Control base is imported and measured locally. Until tooling is selected, these are the target gates:

- Function length budget: prefer 20 lines or less; review required above 30 lines.
- File length budget: prefer 250 lines or less; review required above 400 lines.
- Cyclomatic complexity budget: prefer 5 or less per function; review required above 8.
- Nesting budget: prefer no more than 2 levels of nested control flow.
- Parameter budget: prefer no more than 3 parameters; use a named input object for cohesive data.
- Dependency budget: no new runtime dependency without discovery note, justification, and approval.

Budgets are not a license to fragment code into shallow modules. If a split makes the system harder to understand, simplify the design instead.

## Static Analysis Gate

After the application stack exists, the implementation must add enforceable checks for the selected toolchain:

- ESLint complexity and max-depth rules for TypeScript.
- File and function size checks.
- Dependency cycle checks.
- TypeScript strict checks.
- Secret scanning and hard-coded config checks.
- Import-boundary checks for module internals.
- Test coverage for state machines, contracts, provider adapters, admin config, redaction, and runner failure behavior.

No complexity claim is accepted without a runnable check or a documented reason the check is not available yet.

## Dependency Whitelist

New packages increase supply-chain risk and conceptual surface area.

- Prefer platform, Node.js, Next.js, React, TypeScript, and existing dependencies.
- Do not add a package for a helper that can be written simply in a few clear lines.
- Do not add UI, validation, state, queue, date, logging, or HTTP libraries without a discovery note and approval.
- Do not add packages with install scripts, broad transitive trees, or unclear maintenance without explicit review.
- Every accepted dependency needs an owner, purpose, alternatives considered, and removal trigger if it is experimental.

## Negative Prompts For Agents

Generated code must obey these prohibitions:

- Do not generate demo-only, MVP-only, placeholder, stub, fake, temporary, or TODO-driven implementations for claimed behavior.
- Do not use nested loops or nested conditionals when a simpler named step or early return is clearer.
- Do not optimize prematurely.
- Do not introduce design patterns unless the current tested requirement demands them.
- Do not create generic services, managers, processors, helpers, or registries without a proven seam.
- Do not swallow errors.
- Do not hide side effects behind vague names.
- Do not bypass AdminConfig, SecretReference, approvals, audit, costs, provenance, or idempotency to get a feature working faster.

## Reviewer Agent Loop

Non-trivial generated code requires a second-pass review focused only on simplification and production-grade completeness.

The reviewer must check:

- Can this be simpler?
- Is this a complete production-grade slice or an MVP shortcut?
- Are contracts, validation, tests, and failure paths present?
- Are any abstractions speculative?
- Are module boundaries respected?
- Are secrets, admin settings, approvals, audit, provenance, costs, and idempotency handled when relevant?

Findings become code changes, tests, golden-principle updates, or garbage-collection tasks.

## Full-Spec Anchor

Before coding a feature slice, define the full-spec anchor:

- What exact production behavior is being implemented now?
- What is explicitly deferred?
- What cannot be faked even in the first slice?
- What tests prove this is production-grade for its scope?
- What metrics, logs, or artifacts prove it behaves correctly locally?

The full-spec anchor prevents agents from shipping an MVP scaffold while still allowing a narrow first implementation.

## Rejection Criteria

Reject generated code when it:

- Uses placeholders for behavior the slice claims to implement.
- Stores important state only in memory.
- Omits validation at a boundary.
- Omits failure-path tests.
- Omits audit or cost records for relevant state changes or provider usage.
- Hard-codes operator settings or secrets.
- Creates broad abstractions before real use cases prove them.
- Adds dependencies without approval.
- Makes future change harder to understand.
