# 0067: Content Fact Check Provider Integration
Date: 2026-06-17
Status: Draft
Thread: This slice integrates the final of four content provider-call steps to Layer 7's platform provider boundary. With fact-checking wired in, all content generation phases now run through the `ProviderAdapter` contract and emit external-call, cost, and audit operational events.

## Hook
Content verification is the final blind spot. You cannot trust AI-generated drafts if the system cannot trace the operational footprint of the fact-checker itself.

## Product Stakes
Fact-checking evaluates a generated draft against captured sources. If this executes inside a domain black box, the platform loses operational visibility into provider latency, execution state, and cost. By moving this to the boundary, we guarantee the system enforces strict payload validation and emits standardized telemetry for every external call.

## Industry Counterfactual
Most platforms treat content verification as a hardcoded utility function. They execute a check and log a single success or failure. They do not emit standardized `ExternalCallRecord`s or structured cost and audit events. When the LLM provider inevitably changes its response shape, they lack the instrumentation required to diagnose payload mismatches or execution anomalies.

## What We Built
Added `src/opzava/modules/content/providers/fact-check-adapter.ts` and `fact-check-execution.ts` (with corresponding `.test.ts` files). Updated `src/opzava/modules/content/index.ts` and `test/check-plan-content-steps.test.mjs`.

**Adapter Implementation (`fact-check-adapter.ts`):**

- Exports `FACT_CHECK_OPERATION='fact-check'`.
- `createMockFactCheckProviderProfile()` returns a validated mock `ProviderProfile`.
- Profile configured as kind `'llm'`, mode `'mock'`, `allowedOperations:['fact-check']`.
- `createMockFactCheckProviderAdapter({now})` returns a platform `ProviderAdapter`.
- The adapter parses `request.input` as a strict 2-part payload: `{ articleDraft, sourceCapture }`.
- Parsing strictly delegates to `parseArticleDraft` and `parseSourceCapture`.
- It runs the existing `createMockFactCheckProvider` domain producer.
- It returns a validated, succeeded `ProviderAdapterResult`.
- The output shape `{ status, checks:[{claim,verdict,sourceIds,note}] }` is guaranteed JSON-safe.
- `sourceIds` are spread to a plain array.
- `note` is coerced to `null`.
- It does not invoke `createContentArtifact`, as it operates strictly as a provider adapter.

**Execution Implementation (`fact-check-execution.ts`):**

- Exports `runFactCheckProviderCall(deps,input)`.
- Builds a `ProviderAdapterRequest` with the 2-part input payload.
- Calls the platform's `executeProviderAdapterWithEvents`.
- The platform emits the `external-call` operational event and returns `{result, externalCallRecord}`.
- Appends a cost operational event via `createProviderExecutionCostOperationalEvent`.
- Mock cost units are strictly `{requests:1}` for `0` cents.
- Appends an audit operational event via `createProviderExecutionAuditOperationalEvent`.
- Audit `status` is derived directly from `result.status`.
- Reuses the platform boundary perfectly; zero duplication of event emission logic.

## What We Refused To Fake
- Did not invent a new integration shape. We applied the exact same adapter and execution template established in 0063-0066.
- Did not relax validation for the 2-part input. The adapter strictly enforces the `articleDraft` and `sourceCapture` schemas.
- Did not skip the cost or audit operational events.
- Did not leak non-JSON-safe data into the `ProviderAdapterResult`.
- Did not change the underlying domain producer.
- Did not hand-author the logic. This slice was fleet MiMo-generated, MiMo-reviewed (status: APPROVE), and verified against the real test suite.

## Evidence
Targeted execution: `vitest run src/opzava/modules/content/providers` = 21/21 passing across 8 files.

Test coverage strictly validates:

1. The adapter executes a fact-check from a 2-part input and returns a succeeded result.
2. The result contains structured `checks` and a valid `ExternalCallRecord` (`providerId 'mock-fact-check'`).
3. The provider profile is correctly scoped as `llm-kind` restricted to `fact-check`.
4. `runFactCheckProviderCall` routes through the platform path, emitting exactly 3 operational events: external-call, cost, and audit.

## Validation
- Full repository test suite: `vitest run` = 1485/1485 passing across 182 files.
- Static type checking: `tsc --noEmit` passed.
- Linting: `eslint src/opzava` completed with 0 errors.
- Node integration tests: `node --test test/*.test.mjs` passed.

## The Automation Lesson
Consistency is the ultimate automation multiplier. Because the fact-check step relied on the exact same `ProviderAdapter` contract as the previous three steps, the generation logic required zero architectural exploration. The only domain-specific wrinkle was handling a 2-part input payload, which the existing parser infrastructure absorbed seamlessly.

## Next Case Study Thread
The next thread should rewire the content workflow executor so its provider-call steps (`keyword-research`, `source-capture`, `article-draft`, `fact-check`) run through the recording adapters built in 0063-0067. This will allow a full content `WorkflowRun` to emit a complete external-call, cost, and audit operational trail on mock providers.
