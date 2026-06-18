# 0062: Content Workflow Executor

Date: 2026-06-17
Status: Draft
Thread: Slices 0051–0061 built eleven content step services, each verified in isolation through the durable runner. This slice wires them together: `runContentWorkflow` executes all eleven in graph order on mock providers, threading each step's record into the next step's input, and enforces the approval gate so a rejected approval halts the run before the external action. It completes Layer 6 — one content workflow now runs end-to-end locally in draft-only mode, and content cannot reach a WordPress draft request without source capture, fact-check, brand review, anti-slop review, and a granted human approval.

## Hook

Eleven steps that each work in isolation are not a workflow until something runs them in order, hands each the outputs of the ones before it, and stops the whole thing cold when a gate says no. This slice is that something. It is also where Layer 6's central safety claim is finally exercised as a single fact: from a raw idea, the system produces a draft-only WordPress request — and only if every quality gate produced its artifact and a human granted approval. If approval is withheld, the run throws before the external action is ever constructed. The guarantee is no longer distributed across eleven contracts; it is one executable path that either ends in a draft request with full provenance, or stops at the gate.

## Product Stakes

`runContentWorkflow` takes a raw idea and a set of providers, and runs the pipeline: idea-intake → keyword-research → source-capture → seo-brief → outline → article-draft → fact-check → brand-review → anti-slop-review → human-approval → wordpress-draft. Each step's output record becomes a named input to the steps that depend on it — the keyword-research and source-capture artifacts feed the SEO brief; the brief feeds the outline; the outline and sources feed the draft; the draft feeds the three quality gates and the approval; and the draft, the four gate artifacts, and the granted approval feed the terminal WordPress request. Between the approval and the external action sits the gate: `if (!isApprovalGranted(approval)) throw` — so the external action is unreachable without a granted approval, enforced in the orchestrator, not merely in the terminal step's input parser.

The executor returns a structured result holding every record produced, so a complete run is queryable end to end: the WordPress request's `draftId`, `approvalId`, and four gate-artifact ids all resolve to real records in the same result. The providers are injected, so the same executor will run on live adapters later by swapping the provider set — no change to the orchestration.

## Industry Counterfactual

The common shortcut is to let the orchestration live implicitly in whatever calls the steps — a script, a queue consumer, a UI handler — with the gate enforced "somewhere," often only in the UI or as a status check that a later code path forgets. The workflow runs, but whether a rejected approval can still reach publishing depends on every caller remembering to check. The safety property is a convention, not a guarantee.

Opzava makes the run an explicit, tested function with the gate inside it. The approval check sits on the one path between the approval step and the external action, so there is no caller-dependent way to reach the WordPress request with a non-granted approval. The rejection path is a test: a providers set whose human-approval returns `rejected` makes `runContentWorkflow` throw, and no request is produced. The happy path is a test: the full chain yields a draft-only request whose gate-artifact ids and approval id resolve to the records the run actually produced.

## What We Built

We added to `src/opzava/modules/content/workflow/`:

- `content-workflow-executor.ts`:
  - `ContentWorkflowProviders` — the ten injected step providers (idea-intake takes manual input and needs none)
  - `createMockContentWorkflowProviders()` — the all-mock provider set
  - `ContentWorkflowRunResult` — every record produced by a run (idea intake, the nine artifacts, the approval, and the WordPress draft request)
  - `ContentWorkflowDeps` — `{ providers, newId, now, requesterId }`
  - `runContentWorkflow(deps, rawIdea)` — runs idea-intake then each step in graph order, threading records into inputs, enforcing `isApprovalGranted` before the external action, and returning the full result

The module index re-exports `runContentWorkflow`, `createMockContentWorkflowProviders`, and the run types.

## What We Refused To Fake

We did not let the gate be optional or external; the `isApprovalGranted` check sits on the single path between the approval step and the external action inside the executor, so a non-granted approval cannot reach the WordPress request through any caller.

We did not fake the chain; each step receives the actual records produced by its upstream steps, re-parsed from artifact content where the downstream step needs the typed value, so the run exercises the real lineage rather than stubbed inputs.

We did not hardcode mock-only behavior into the executor; providers are injected, so the same orchestration runs on live adapters later by swapping the provider set.

We did not skip the rejection path; a dedicated test proves a rejected approval halts the run before the external action and produces no request.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/workflow/content-workflow-executor.ts`
- `src/opzava/modules/content/workflow/content-workflow-executor.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan-content-steps.test.mjs`

The tests cover:

- a full run from a raw idea yields each artifact with the correct `artifactType`, an `approved` approval, and a `draft` WordPress request whose `approvalId` and gate-artifact ids resolve to the records produced
- lineage chains from the WordPress request's `draftId` back to the article-draft artifact and the originating idea
- a rejected approval makes `runContentWorkflow` throw `approval not granted`, halting before the external action

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/workflow/content-workflow-executor.test.ts: passed 3/3
node_modules/.bin/vitest run src/opzava/modules/content: passed 173/173 across 36 files
node_modules/.bin/vitest run (full repo suite): passed 1464/1464 across 174 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

One content workflow now completes locally in draft-only mode, with the human approval gate structurally blocking the external action on rejection — Layer 6's exit criteria met.

## The Automation Lesson

Layer 6 is complete: the contracts (0038–0050), the step services (0051–0061), and now the executor that runs them as one workflow. The executor is deliberately thin — it threads records and enforces one gate — because the guarantees it depends on were already encoded upstream: each step validated its own output, each artifact carried its lineage, each gate's verdict was bound to its findings, and the terminal request made publishing unrepresentable. The orchestrator did not have to re-assert any of that; it only had to run the steps in order and refuse to cross the approval gate uninvited. That is the payoff of pushing invariants down into contracts: the top-level run is short, readable, and safe by composition. The next layer makes the providers real — replacing the mock provider set with the integration-provider contract (mock and live adapters, external-call records, cost and audit events) — without changing this orchestration or weakening any invariant it relies on.

## Next Case Study Thread

This completes Layer 6: one content workflow runs end-to-end locally in draft-only mode, gated by human approval.

The next build thread should:

- open Layer 7 (Integration Provider Layer) with the **provider adapter contract** — a typed description of a provider operation (name, operation, input/output schema, required admin-setting keys and secret references, timeout, retry policy, idempotency key, cost extraction, redacted log summary) plus a **mock LLM provider adapter** conforming to it, so workflow steps depend on the provider contract rather than concrete providers, and every external call can later write an `ExternalCall`, `CostEvent`, and `AuditEvent` without a live call.
