# ARD 0002: Require Local R&D And Measurement Gates

Status: Accepted
Date: 2026-06-15

## Context

The `opzava` plan depends on durable workflows, structured artifacts, approval gates, external integrations, failure replay, audit trails, content provenance, anti-slop review, admin-managed configuration, and future workflow expansion beyond content generation.

These parts carry high risk if implementation relies on assumptions. They also create code entropy if state, side effects, provider behavior, generated content, configuration, and workflow policy become scattered across the codebase.

## Decision

Every risky implementation area must pass through a local R&D and measurement gate before it becomes core architecture.

The required gates are:

- Discovery notes in `docs/discovery/` for local audits, blocker investigations, and experiments.
- Benchmarks in `docs/benchmarks/` for measured local baselines and before and after comparisons.
- ARDs in `docs/ard/` for accepted decisions affecting architecture, data, integrations, deployment, configuration, secrets, or long-term maintenance.
- Shared language in `CONTEXT.md` so agents and humans use the same product and architecture terms.
- Golden principles in `docs/golden-principles.md` so repeated human taste becomes mechanical repo policy.
- Tests for state transitions, contracts, restart and replay behavior, approval blocking, source provenance, anti-slop review, idempotency, admin config validation, secret redaction, and dead-letter handling.
- Complexity, entropy, and garbage-collection checks once the base stack is present and tool selection is verified locally.

## Consequences

- Implementation can pause when a blocker needs discovery instead of being patched around.
- The team must capture measurements before claiming performance, reliability, maintainability, configuration safety, or content-quality improvements.
- Live integrations are delayed until mocked adapters pass approval and idempotency tests.
- Generated content is delayed until source provenance, fact-check, brand review, anti-slop review, and human approval gates pass.
- Provider credentials and operator-controlled variables must be controlled through admin settings and safe secret references, not hard-coded source values.
- Shortcuts require documentation, ownership, and a removal trigger.
- Code organization must keep runner, contracts, providers, approvals, audit, costs, workflow steps, provenance, quality review, admin configuration, and UI concerns separated.
