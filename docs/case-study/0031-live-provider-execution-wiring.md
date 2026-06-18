# 0031: Wiring Approval To Live Execution Through The Idempotent Boundary

Date: 2026-06-16
Status: Draft
Thread: Connecting the approval guard's granted path to the idempotent execution boundary — the first slice where an approval can actually cause a live action.

## Hook

For thirty slices Opzava refused to let an approval do anything. This is the slice where a granted approval finally reaches the execution boundary — and it had to be the most careful one.

## Product Stakes

Slice 0027 made the guard stop at `live-execution-disabled` even on a granted approval. Slice 0028 built an idempotent boundary that executes an approved action exactly once. This slice connects them.

The risk is the whole reason the project exists: a control plane that lets an approval trigger a real, possibly irreversible action must never do so without a matching grant, and must never do it twice on a retry. So the wiring is deliberately additive and fail-closed.

## Industry Counterfactual

The common shortcut is to call the provider directly from the approval handler once the UI says "approved."

That fuses the decision and the side effect, removes the idempotency seam, and makes every retry a gamble.

Opzava keeps the decision (guard) and the action (boundary) as separate, individually tested units, and wires them with an optional dependency so the prior behavior stays provable.

## What We Built

We extended `guardLiveProviderExecutionAfterPreflight` with an optional `liveExecution` handoff (adapter, idempotency lookup, external-call id, signal, clock).

- When `liveExecution` is absent, the guard is unchanged: a granted approval still returns `live-execution-disabled`. The 0027 test suite passes untouched.
- When `liveExecution` is present, a granted approval hands off to `executeApprovedLiveProviderActionOnce`, which re-verifies the grant against the request and consults the idempotency lookup before running the adapter.
- A prior external call short-circuits to `already-executed` without running the adapter.
- A genuine execution returns `executed` with the external-call record and provider result.
- The unreachable grant/request mismatch fails closed as `live-execution-grant-mismatch`, never as a silent success.

Denied, preflight-failed, and mock-profile paths still return before the boundary is ever reached.

## What We Refused To Fake

We did not enable a real provider; the adapter under test is a fake.

We did not rewrite or weaken the 0027 guard tests; the wiring is additive and backward-compatible.

We did not implement the idempotency store; it remains an injected port.

We did not claim atomic duplicate-prevention. The current check-then-act idempotency is safe under the existing atomic job lease (slice 0006), which prevents concurrent execution of the same step, so retries here are sequential. True concurrent-safe deduplication is an explicit requirement deferred to the idempotency-store slice (see Next Thread).

We did not generate ids, timestamps, or read env/files in the wiring.

## Evidence

Files changed:

- `src/opzava/platform/providers/live-approval-runtime.ts`
- `src/opzava/platform/providers/live-approval-runtime.execution.test.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a granted approval with live-execution dependencies runs the adapter exactly once and appends both an approval audit event and an external-call event
- a prior external call for the idempotency key returns `already-executed` and runs the adapter zero times
- without live-execution dependencies a granted approval still returns `live-execution-disabled` (backward compatible)
- a denied approval never runs the adapter even when dependencies are supplied

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.execution.test.ts: failed before the wiring (granted path returned live-execution-disabled)
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.execution.test.ts: passed 4/4 after the wiring
node_modules/.bin/vitest run src/opzava/platform/providers/live-approval-runtime.test.ts: passed 6/6 (0027 suite unchanged)
node --test test/check-plan.test.mjs: passed 41/41
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint (changed files): passed with 0 errors
node --test test/*.test.mjs: passed 51/51
vitest run (full suite): passed 135 files / 1274 tests
```

A three-model council (GPT-5.5, GLM-5.2, MiniMax-M3) reviewed the wiring against four invariants: no execution without a granted matching approval, no duplicate live action on retry, backward compatibility, and no secret leakage. GLM-5.2 and MiniMax-M3 returned SOUND on all four. GPT-5.5 confirmed all four but flagged that check-then-act idempotency is not atomic under concurrency. That finding is accepted and deferred by design: the idempotency lookup is an injected port, concurrent same-step execution is already prevented by the atomic job lease, and atomic reservation is now a stated requirement of the idempotency-store slice.

## The Automation Lesson

The safest way to connect a decision to an irreversible action is to keep them as separate proven units and join them with a seam you can turn off. Backward-compatible wiring let us add real execution without invalidating a single guarantee the guard already made.

## Next Case Study Thread

The next build thread should emit the cost and audit events for an executed action and then back the idempotency lookup with real, atomic storage:

- an executed action appends the cost event (0029) and the `provider.execution.recorded` audit event (0030) alongside the external-call event
- the idempotency lookup is backed by a query over stored external-call records
- that store MUST reserve the idempotency key atomically (e.g. a unique constraint) so concurrent retries cannot both execute, closing the check-then-act window the council flagged
- live execution stays gated behind validated admin settings and resolved secret references
