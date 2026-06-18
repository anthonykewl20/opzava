# 0003: Operational Observability Contracts Before Live Providers

Date: 2026-06-15
Status: Draft
Thread: Making provider work visible before making provider work real.

## Hook

The second-most dangerous automation demo is the one that calls a live provider and gives you no receipt.

If an agent spends money, retries a provider, mutates an external system, or fails halfway through a workflow, Opzava needs more than a console log. It needs a structured record that can answer what happened, who or what caused it, how much it cost, and whether the action is safe to replay.

So before adding live provider adapters, Opzava added operational observability contracts.

## Product Stakes

Opzava is meant to coordinate real AI operations, not just fire prompts into the dark.

For a content workflow, that means every model call, search call, publishing call, or email operation must leave an operator-safe trail. The trail cannot contain secret references or cleartext credentials. It must connect back to the workflow run and step run. It must support later cost review, audit review, replay decisions, and incident debugging.

This is the difference between “the agent did something” and “the system can explain exactly what the agent did.”

## Industry Counterfactual

A common automation shortcut is to bolt live integrations onto a happy-path runner first.

That looks productive until the first timeout, double-send, unexpected bill, or customer-facing side effect. Then the team discovers the system cannot answer basic questions:

- Which workflow step made the call?
- Was the call retried?
- What idempotency key protected it?
- What did it cost?
- Did the audit trail leak sensitive configuration?
- Can a failed step be replayed without repeating a side effect?

Opzava is taking the opposite path: make the receipts mandatory before external side effects exist.

## What We Built

We added operational contract types under `src/opzava/platform/`:

- `ExternalCallRecord`: provider, operation, workflow run, step run, status, idempotency key, timeout, retry metadata, request summary, response summary, and timestamps.
- `CostEvent`: workflow/step/provider/operation cost attribution with bounded non-negative units and cost-cent values.
- `AuditEvent`: actor, action, target, correlation ID, before/after summaries, and event timestamp.

The contracts reject secret references inside external-call summaries and audit summaries, so operational records can be stored and reviewed without turning logs into a secret sink.

## What We Refused To Fake

We did not call live LLMs.

We did not add WordPress publishing.

We did not add a cost dashboard.

We did not pretend audit search exists before persistence exists.

We did not store secrets in operational records to make tests easy.

This slice creates the rules that live integrations must obey later.

## Evidence

Operational contract files:

- `src/opzava/platform/providers/contracts.ts`
- `src/opzava/platform/providers/contracts.test.ts`
- `src/opzava/platform/costs/contracts.ts`
- `src/opzava/platform/costs/contracts.test.ts`
- `src/opzava/platform/audit/contracts.ts`
- `src/opzava/platform/audit/contracts.test.ts`

The tests cover:

- live provider profiles requiring `SecretReference` credentials
- credential redaction before audit serialization
- external-call idempotency, retry, timeout, and safe summaries
- cost events with bounded non-negative units and cents
- audit events with secret-safe before/after summaries

## Validation

Validation completed locally after the operational observability slice:

```text
pnpm vitest run src/opzava/platform/providers/contracts.test.ts src/opzava/platform/costs/contracts.test.ts src/opzava/platform/audit/contracts.test.ts: passed 11/11
pnpm run typecheck: passed
pnpm test: passed 106 files, 1110 tests
pnpm run lint: passed with 0 errors and existing warnings
node --test test/*.test.mjs: passed 22/22
```

Red-first evidence was observed in the operational-contract implementation pass:

- Focused tests failed before the operational contract implementations existed.
- The implementations were narrowed until the focused tests passed.
- Full typecheck, test, lint, and governance checks passed afterward.

## The Automation Lesson

Observability is not a dashboard.

Observability is a contract that every external action must satisfy before dashboards, alerts, replay tools, and cost views can be trusted.

Opzava now has that contract shape: external work must be correlated, bounded, idempotency-aware, cost-attributed, audit-safe, and secret-redacted.

## Next Case Study Thread

The next build thread should turn contracts into storage boundaries:

- job storage records
- attempt storage records
- dead-letter storage records
- operational event storage records
- replay queries
- restart recovery plans

That is where Opzava starts connecting durable execution with durable evidence.
