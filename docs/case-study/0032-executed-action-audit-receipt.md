# 0032: Executed Live Actions Emit Their Audit Receipt

Date: 2026-06-16
Status: Draft
Thread: Emitting the durable audit receipt when a live action actually executes — and refusing to emit a cost event we cannot yet measure honestly.

## Hook

An executed action that leaves no receipt is indistinguishable from one that never happened. This slice gives every freshly executed live action a durable, redacted audit line.

## Product Stakes

Slice 0031 wired a granted approval to the idempotent execution boundary. The execution already wrote an external-call event, but the control-plane receipt from slice 0030 — `provider.execution.recorded` — was not yet emitted at the moment of execution.

This slice connects that receipt to the executed path so operators can see, durably, that a live action ran for a run, with an outcome, without the payload.

## Industry Counterfactual

The common shortcut is to emit "success" telemetry for every action and reconcile cost later from a provider invoice.

Opzava emits the audit receipt at the exact execution point, and deliberately does NOT emit a cost number it cannot yet source.

## What We Built

We extended the guard's `liveExecution` handoff with an optional `recordedAudit` identity (record id, audit event id, actor, timestamp).

- On a freshly executed action, the guard appends `createProviderExecutionAuditOperationalEvent` with the request ids, external-call id, and the provider result status.
- On an already-executed action, no new audit receipt is minted — the receipt was created when the action first ran.
- When `recordedAudit` is absent, behavior is unchanged, so the 0031 wiring tests pass untouched.

## What We Refused To Fake

We did not emit a cost event. The cost factory from slice 0029 records caller-supplied units and cents, and the system does not yet model provider usage extraction or operator pricing. Emitting a cost event now would mean inventing figures or threading placeholder numbers, which the golden principles forbid. Cost emission is deferred to a slice that first models real usage and pricing inputs.

We did not emit the audit receipt twice (already-executed actions are skipped).

We did not rewrite or weaken the 0027, 0028, or 0031 tests.

We did not store payloads, prompts, credentials, or secret references.

We did not generate ids or timestamps in the wiring.

## Evidence

Files changed:

- `src/opzava/platform/providers/live-approval-runtime.ts`
- `src/opzava/platform/providers/live-approval-runtime.execution.test.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a freshly executed action with `recordedAudit` appends three events in order: approval audit, external-call, and the `provider.execution.recorded` audit receipt carrying the result status
- an already-executed action with `recordedAudit` appends no execution audit receipt
- the prior 0031 executed/already-executed/backward-compat/denied behaviors still hold

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.execution.test.ts: failed before the wiring (executed action emitted no audit receipt)
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.execution.test.ts: passed 6/6 after the wiring
node_modules/.bin/vitest run live-approval-runtime.test.ts + live-execution-runtime.test.ts: passed 12/12 (0027 and 0028 unchanged)
node --test test/check-plan.test.mjs: passed 42/42
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (changed files): passed with 0 errors
node --test test/*.test.mjs: passed 52/52
vitest run (full suite): passed 135 files / 1276 tests
```

This is a thin additive emission reusing the already-reviewed audit factory, so a separate council pass was not run; the redaction and determinism guarantees are inherited from slice 0030, and the event ordering and count are pinned by tests.

## The Automation Lesson

Emit what you can prove, withhold what you cannot. A receipt of "this ran, with this outcome" is honest at the moment of execution. A cost number without a measured source is not — so it waits until the measurement exists.

## Next Case Study Thread

The next build thread should back the idempotency lookup with real, atomic storage:

- the injected `findExistingExternalCall` lookup is implemented as a query over stored external-call records
- the store reserves the idempotency key atomically (for example a unique constraint) so concurrent retries cannot both execute — closing the check-then-act window the 0031 council flagged
- once provider usage and operator pricing are modeled, the cost event from slice 0029 is emitted on the executed path alongside this audit receipt
