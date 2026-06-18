# 0023: Preflight Failure Operational Events Before Adapter Execution

Date: 2026-06-16
Status: Draft
Thread: Recording blocked provider preflight failures as redacted operational audit events.

## Hook

Blocked provider calls should leave evidence without leaking secrets.

Opzava now turns preflight failures into operational audit records before any provider adapter can run.

## Product Stakes

Opzava can build provider requests, resolve credentials through an injected boundary, and compose both into preflight. The next operational risk is silent blocking: a provider call is prevented, but operators have no durable event explaining why.

This slice gives blocked preflight failures a redacted audit trail using the existing runner operational-event store.

## Industry Counterfactual

The common shortcut is to log preflight failures as raw errors.

That often leaks provider credential references, resolver messages, or user payloads. It also disappears when logs rotate.

Opzava now emits parseable operational audit records with safe failure summaries.

## What We Built

We added `createProviderPreflightFailureOperationalEvent`.

The factory:

- creates an `audit` operational event accepted by the runner repository contract
- records `provider.preflight.blocked`
- correlates the event to the provider request id
- stores runtime-settings unavailable failures as safe reason codes
- stores secret-resolution failures as safe codes plus redacted reference markers
- excludes raw resolver messages, secret reference ids, and secret reference purposes

## What We Refused To Fake

We did not execute preflight.

We did not resolve credentials.

We did not call provider adapters.

We did not call live providers.

We did not add a new repository event kind or schema migration.

We did not log, serialize, or store secret values.

## Evidence

Files changed:

- `src/opzava/platform/providers/preflight-events.ts`
- `src/opzava/platform/providers/preflight-events.test.ts`

The tests cover:

- runtime-settings unavailable failures become parseable audit operational events
- event action, target, correlation id, workflow id, step id, and occurred time are preserved
- secret-resolution failures redact secret reference id and purpose
- raw resolver failure messages are excluded from audit records
- repeated calls with the same input are deterministic and do not mutate the input
- the module source does not import preflight execution, credential resolution, provider execution, filesystem reads, env reads, logging, or ID generation

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/providers/preflight-events.test.ts: failed before implementation because ./preflight-events did not exist
pnpm vitest run src/opzava/platform/providers/preflight-events.test.ts: passed 4/4 after implementation
pnpm run typecheck: passed
node --test test/check-plan.test.mjs: passed 33/33
pnpm run lint: passed with 0 errors and inherited warnings
node --test test/*.test.mjs: passed 43/43
pnpm test: passed 127 files / 1220 tests
```

MiniMax-M3 reviewed the slice before implementation and flagged must-fix coverage for explicit safe cause projection, parseable audit operational records, secret redaction assertions, deterministic output, and avoiding side-effect imports.

## The Automation Lesson

Safety gates need durable receipts.

A blocked provider call should be visible to operators, but the event must explain the class of failure without storing the sensitive values that caused the block.

## Next Case Study Thread

The next build thread should connect successful preflight to mock-only provider execution:

- successful preflight can call mock adapters only
- live provider profiles remain blocked until explicit approval is proven
- preflight failure events are appended before returning blocked outcomes
- no external provider side effects until approvals are implemented
