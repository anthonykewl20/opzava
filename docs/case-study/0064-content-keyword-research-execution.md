# 0064: Content Keyword Research Execution

Date: 2026-06-17
Status: Draft
Thread: Slice 0063 bound the content keyword-research provider to the platform `ProviderAdapter` contract. This slice routes a keyword-research provider call through the platform's execution path so the call emits the three operational events Layer 7 requires — an `external-call`, a `cost`, and an `audit` — to an injected event sink, and returns the typed result and external-call record. A content provider call is now observable end to end as durable operational events, on a mock, in the exact shape a live call will produce.

## Hook

Binding a provider to the adapter contract (0063) made a call *shaped* like an external call. This slice makes it *recorded* like one. Layer 7's exit criterion is explicit: every external call writes an `ExternalCall`, a `CostEvent` when relevant, and an `AuditEvent`. A provider call that runs but leaves no durable trace is invisible to cost tracking, to the audit log, and to any operator asking "what did this run actually do externally?" This slice closes that gap for keyword-research: one function call runs the adapter through the platform's timeout-and-record pipeline and appends all three operational events, so the call's existence, its cost, and its accountable record are all persisted by construction.

## Product Stakes

`runKeywordResearchProviderCall` composes the platform primitives rather than reimplementing them. It builds a validated `ProviderAdapterRequest` (mock keyword-research profile, the idea as input, a deterministic idempotency key), calls the platform's `executeProviderAdapterWithEvents` — which runs the adapter under a timeout, builds the `ExternalCallRecord`, and appends the `external-call` operational event — and then appends a `cost` operational event (`createProviderExecutionCostOperationalEvent`) and an `audit` operational event (`createProviderExecutionAuditOperationalEvent`) to the same sink, the audit status mirroring the execution result. It returns the platform's `ProviderExecutionResult` (the typed adapter result plus the external-call record).

The result: a single content provider call yields three durable operational records — external-call, cost, audit — keyed to the same request and external-call ids, through the same sinks the platform already uses for every provider. Cost is mock-zero here (one request unit, zero cents), but the shape is the live shape; a live adapter's cost extraction will populate the same event. The call stays mock-only — the profile is mode `mock` — while producing the full operational footprint.

## Industry Counterfactual

The common shortcut is to log provider calls ad hoc — a line here, a metric there — with no uniform record, so cost and audit coverage is partial and per-author. When finance asks what a run cost, or security asks who triggered an external action, the answer is reconstructed from logs that may or may not exist. The provider call and its accounting are separate concerns wired by hand each time.

Opzava makes the three records a single composed operation. The external-call, cost, and audit events are emitted together, referencing the same ids, through the platform's validated event builders — which enforce no-secret-reference and allow-listed summaries. So a keyword-research call cannot run without leaving an external-call record, a cost record, and an audit receipt, and those records are structurally consistent with each other. Coverage is a property of the call path, not of the author remembering to log.

## What We Built

We added to `src/opzava/modules/content/providers/`:

- `keyword-research-execution.ts`:
  - `KeywordResearchProviderCallInput` — `Readonly<{ idea; workflowRunId; stepRunId }>`
  - `KeywordResearchProviderCallDeps` — the adapter, the event sink, id/clock generators, and an actor id
  - `runKeywordResearchProviderCall(deps, input)` — builds the validated request, runs `executeProviderAdapterWithEvents` (emitting the external-call event), then appends a cost and an audit operational event to the sink, and returns the `ProviderExecutionResult`

The content module index re-exports the call function and its types. No platform code was added or changed — this composes `executeProviderAdapterWithEvents`, `createProviderExecutionCostOperationalEvent`, and `createProviderExecutionAuditOperationalEvent`.

## What We Refused To Fake

We did not reimplement the execution pipeline; the call routes through the platform's `executeProviderAdapterWithEvents`, inheriting its timeout, abort handling, and external-call recording unchanged.

We did not skip cost or audit; the call appends both a `cost` and an `audit` operational event alongside the external-call event, satisfying Layer 7's "ExternalCall, CostEvent, AuditEvent" requirement, keyed to the same request and external-call ids.

We did not leak secrets or payloads; the cost and audit builders produce allow-listed, secret-free summaries, and the request input and summaries are validated against the no-secret-reference invariant.

We did not make a live call; the profile is mode `mock` and cost is mock-zero, but the request, result, and all three operational events are the exact shapes a live call will produce.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/providers/keyword-research-execution.ts`
- `src/opzava/modules/content/providers/keyword-research-execution.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan-content-steps.test.mjs`

The tests cover:

- the call routes through the platform execution path and returns a `succeeded` `ProviderExecutionResult` whose output carries the keyword research and whose external-call record carries the provider id and workflow run id
- the sink receives exactly three operational events with kinds `external-call`, `cost`, and `audit`
- the audit event is emitted carrying the execution status

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/providers: passed 6/6
node_modules/.bin/vitest run (full repo suite): passed 1470/1470 across 176 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

A content keyword-research provider call now runs through the platform execution path and emits an external-call, a cost, and an audit operational event — Layer 7's per-call recording requirement met for the first provider.

## The Automation Lesson

The slice is a composition, not a construction: it wires three platform functions that already existed (execute-with-events, cost-event builder, audit-event builder) into one content-provider call. That is the intended shape of Layer 7 — the platform owns the provider boundary and the operational-event vocabulary; the content module composes them for its providers. The remaining provider-call steps (source-capture, article-draft, fact-check) follow the same two-slice pattern: an adapter that wraps the existing producer (like 0063), then an execution call that routes it through the platform path emitting the three events (like 0064). The discipline that keeps this honest is that the content module never reaches around the platform to talk to external systems or to invent its own event types — it always goes through the contract, so cost and audit coverage are uniform across every provider the system will ever add.

## Next Case Study Thread

This routes the first content provider call through the platform execution path with full operational-event recording.

The next build thread should:

- generalize the adapter-and-execution pattern to the remaining content provider-call steps — add a mock provider adapter and an execution call for `source-capture` (a search/research provider operation), following the 0063/0064 shape, so a second content provider call also emits external-call, cost, and audit operational events through the platform path on a mock profile.
