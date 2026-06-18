# 0063: Content Keyword Research Provider Adapter

Date: 2026-06-17
Status: Draft
Thread: Layer 6 completed the content workflow on simple injected providers — plain `(input) => draft` functions with no external-call semantics. This slice opens Layer 7 (Integration Provider Layer) by binding the first content provider-call step, `keyword-research`, to the existing platform `ProviderAdapter` contract (built in slices 0012–0037). The content keyword-research draft producer is now wrapped as a `ProviderAdapter` whose `execute(request)` returns a validated `ProviderAdapterResult`, from which the platform's `createExternalCallRecordFromProviderAdapterResult` produces a real `ExternalCallRecord`. Provider calls become recordable external calls without a live network call.

## Hook

The content workflow's providers were a convenient fiction — functions that returned a draft with no notion of a request, a result, a timeout, an idempotency key, or an external-call record. That fiction was right for proving the workflow shape, but it is exactly the complexity Layer 7 exists to contain: external systems must not leak their semantics into workflow code, and every external call must be recordable as an `ExternalCall` (and later a `CostEvent` and `AuditEvent`). This slice makes the keyword-research provider speak the platform's adapter contract, so a provider call is now a structured request that yields a structured result and a provenance record — on a mock, with no network, but in the exact shape a live adapter will use.

## Product Stakes

The platform already defines the provider boundary: a `ProviderAdapter` is `execute(request, signal) => Promise<ProviderAdapterResult>`; a `ProviderProfile` declares the provider's id, kind, mode (mock/live), and allowed operations; and `createExternalCallRecordFromProviderAdapterResult` turns a request/result pair into an `ExternalCallRecord` carrying the operation, workflow run, idempotency key, timeout, retry, and redacted summaries. This slice binds content's keyword-research to that boundary: a mock adapter parses the idea from the request input, runs the existing draft producer, and returns a `succeeded` result whose output is plain, secret-free JSON. The result validates against the platform schema, and the external-call record it yields is the same record a live keyword/search provider would produce.

This is the integration pattern for every content provider-call step (source-capture, article-draft, fact-check): wrap the domain producer as a platform adapter, keep the domain logic unchanged, and gain external-call provenance for free. Crucially it reuses the platform provider layer rather than inventing a parallel one — the content module depends on `@/opzava/platform/providers/contracts`, not a content-specific copy.

## Industry Counterfactual

The common shortcut is to let each workflow step call its provider however it likes — a bare function here, an SDK call there — and bolt on logging or cost tracking per step, inconsistently. There is no single shape for "an external call," so external-call records, cost events, and audit events are partial and per-author, and switching a provider from mock to live means rewriting the step.

Opzava routes the provider through one contract. The keyword-research adapter conforms to the platform `ProviderAdapter`, so its call produces a `ProviderAdapterResult` that validates against the same schema every provider uses, and an `ExternalCallRecord` with the same fields every external call records. The provider's mode (`mock` vs `live`) is a profile attribute, not a code path in the step, so enabling a live provider later is a profile-and-adapter swap, not a step rewrite. The boundary holds the complexity; the workflow stays clean.

## What We Built

We added `src/opzava/modules/content/providers/`:

- `keyword-research-adapter.ts`:
  - `KEYWORD_RESEARCH_OPERATION` — the operation name `'keyword-research'`
  - `createMockKeywordResearchProviderProfile()` — a validated mock `ProviderProfile` (kind `search`, mode `mock`) whose `config.allowedOperations` scopes it to the keyword-research operation
  - `createMockKeywordResearchProviderAdapter({ now })` — a platform `ProviderAdapter` whose `execute(request)` parses the idea from `request.input`, runs the existing `createMockKeywordResearchProvider()` draft producer, and returns a validated `succeeded` `ProviderAdapterResult` with a JSON-safe output (optional numeric fields coerced to `null`) and a compact output summary

The content module index re-exports the operation, profile, and adapter factory. The domain draft producer is unchanged — the adapter wraps it.

## What We Refused To Fake

We did not duplicate the provider contract; the adapter conforms to the existing platform `ProviderAdapter`/`ProviderProfile`/`ProviderAdapterResult` from slices 0012–0037, so content gains external-call provenance from the same boundary the rest of the system uses.

We did not leak non-JSON or secrets into the result; the adapter's output is plain `JsonValue` (optional numbers become `null`), and `parseProviderAdapterResult` enforces the no-secret-reference and succeeded-has-no-error invariants.

We did not change the domain logic; the keyword-research draft producer is reused unchanged — the adapter is a boundary, not a rewrite.

We did not make a live call; the profile is mode `mock`, and the adapter is deterministic — but the request, result, and external-call record are the exact shapes a live adapter will use.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/providers/keyword-research-adapter.ts`
- `src/opzava/modules/content/providers/keyword-research-adapter.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan-content-steps.test.mjs`

The tests cover:

- `adapter.execute(request)` returns a `succeeded` `ProviderAdapterResult` with the matching `requestId`, a null error, a keyword-research output, and a candidate-count summary
- `createExternalCallRecordFromProviderAdapterResult` produces a valid `ExternalCallRecord` from the request/result pair, carrying the provider id, operation, workflow run id, and idempotency key
- the profile is mode `mock` and scopes `allowedOperations` to the keyword-research operation only

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/providers: passed 3/3
node_modules/.bin/vitest run (full repo suite): passed 1467/1467 across 175 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

The keyword-research provider call now conforms to the platform provider-adapter boundary and yields a real external-call record, on a mock, in the live-ready shape — opening Layer 7.

## The Automation Lesson

Layer 7's purpose is containment: keep external systems from leaking complexity into workflow code. The first slice honors that by reusing the boundary the platform already built rather than minting a content-specific one — the content module now depends on the platform provider contract, and the domain producer it wraps did not change. The pattern generalizes: each remaining provider-call step gets an adapter that wraps its existing producer, and the executor will route those steps through the platform execution path so every call writes an `ExternalCall`, a `CostEvent` where relevant, and an `AuditEvent`. The discipline is to let mode (mock vs live) be a profile attribute, never a branch in a step — so the live cutover, when it comes, touches profiles and adapters, not the workflow.

## Next Case Study Thread

This binds the first content provider-call step to the platform provider-adapter contract on a mock.

The next build thread should:

- route the content provider-call steps through the platform **execution path** (`src/opzava/platform/providers/execution.ts` and the mock execution runtime) so that running a keyword-research provider call emits an `ExternalCall` record plus a `CostEvent` and an `AuditEvent` through the existing operational-event sinks — wiring the adapter from this slice into the platform's preflight/execute/record pipeline, still mock-only and with live profiles refused.
