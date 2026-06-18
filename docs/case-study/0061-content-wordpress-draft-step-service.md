# 0061: Content WordPress Draft Step Service

Date: 2026-06-17
Status: Draft
Thread: Slices 0051–0060 built ten content steps; this slice adds `wordpress-draft`, the eleventh and final step, completing the content workflow (Layer 6). It is the terminal external-action: it consumes the article-draft artifact, the four quality-gate artifacts (source-capture, fact-check-report, brand-review, anti-slop-review), and a granted `Approval`, and produces a `wordpress-draft-request` that is structurally draft-only — publishing is impossible by construction, and the request cannot exist without a granted approval and all required quality-gate ids. Its declared output is `{ kind: 'external-action', requestType: 'wordpress-draft-request' }`, the third and last step-output kind, verified by the runner.

## Hook

This is the step where everything the pipeline built must be present and accounted for, and where the one thing that must never happen — auto-publishing — is made structurally impossible. The request carries a `status` of the literal `'draft'`: there is no field, no codepath, through which it can become a published post. And it cannot be constructed at all without a granted approval id and the ids of all four quality-gate artifacts. The milestone's governing rule — "no auto-publish, all gates required, human approval mandatory" — is not a runtime check that could be bypassed; it is encoded in the type, enforced at the step's input boundary, and the only output it can produce is a draft.

## Product Stakes

`wordpress-draft` is the convergence point of the entire content workflow. Its input parser validates all five upstream artifacts by type (article-draft, source-capture, fact-check-report, brand-review, anti-slop-review) and requires the `Approval` to be granted — `isApprovalGranted` must be true, or the step throws. Only then does it build a `WordpressDraftRequest` wiring the approval id, all four gate artifact ids, the idea and draft ids, the title, and the rendered body markdown, with `status: 'draft'`. The step's output is `{ kind: 'external-action', requestType: 'wordpress-draft-request' }` — the runner verifies it exactly as it verified artifact and approval outputs, completing the three-kind step-output model. The produced request is what a future live WordPress adapter would consume to create a draft post — never to publish one.

## Industry Counterfactual

The common shortcut is a publish step that takes content and a boolean — "draft or live" — and trusts the caller to set it correctly, or that auto-publishes once some checks pass. Auto-publish is one misconfigured flag away; gates are advisory; the approval is a column that may or may not be set. The system can, under the wrong conditions, send content live with no human accountable and no guarantee the quality gates ran.

Opzava makes the unsafe state unrepresentable. The request type has no "publish" status — only `'draft'` — so live publishing cannot be expressed by this artifact at all. The request cannot be constructed without an `approvalId` and all four gate ids, and the step refuses to build it unless the approval is actually granted. So reaching a WordPress draft request structurally proves that a human approved, and that source capture, fact-check, brand review, and anti-slop review all produced artifacts. The safety property is a consequence of the types, not the diligence of the caller.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `wordpress-draft-provider.ts`:
  - `WordpressDraftProviderInput` — `Readonly<{ articleDraft }>`
  - `WordpressDraftRender` — `Readonly<{ bodyMarkdown }>`
  - `WordpressDraftProvider` and `createMockWordpressDraftProvider()` — a pure deterministic mock rendering the draft's title and sections into body markdown
- `wordpress-draft-service.ts`:
  - `WordpressDraftStepInput` — the article-draft artifact and its parsed content, the four quality-gate artifacts, the granted `Approval`, and `sourceStepRunId` (carried for uniform step-input shape across all eleven steps)
  - `parseWordpressDraftStepInput(payload)` — type-asserts all five artifacts, parses the approval and requires `isApprovalGranted`, and parses the draft content
  - `createWordpressDraftStepService({ provider, newId, now })` — a `ContentStepService<WordpressDraftStepInput, WordpressDraftRequest>` whose `run` builds a draft-only `WordpressDraftRequest` via `parseWordpressDraftRequest` (status literal `'draft'`, approval id, all four gate ids), and returns it bound to `getContentStepOutput('wordpress-draft')` — `{ kind: 'external-action', requestType: 'wordpress-draft-request' }`. No `createContentArtifact`; the record is the request itself.

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged — its first external-action record, completing the three output kinds (artifact, approval, external-action) the bridge handles without modification.

## What We Refused To Fake

We did not make publishing possible; the request's `status` is the literal `'draft'`, with no field through which it could become published. Live publishing is unrepresentable by this artifact.

We did not let the gates be optional; the request cannot be constructed without all four quality-gate artifact ids, and the step type-asserts each upstream artifact, so a missing or wrong-typed gate fails at the boundary.

We did not let approval be a formality; the step requires `isApprovalGranted` to be true and throws otherwise, so a draft request structurally proves a human approved.

We did not special-case the bridge; the terminal external-action step runs through the same executor as every prior step, its output verified against the declared step output like any other.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite — including an integration test that runs the *entire* nine-step upstream pipeline to produce genuine inputs before the draft request is built through the durable runner.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/wordpress-draft-provider.ts`
- `src/opzava/modules/content/steps/wordpress-draft-service.ts`
- `src/opzava/modules/content/steps/wordpress-draft-service.test.ts`
- `src/opzava/modules/content/steps/wordpress-draft-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan-content-steps.test.mjs`

The tests cover:

- `service.run` produces a `WordpressDraftRequest` with `status: 'draft'`, the granted approval id, the article-draft id, and all four gate artifact ids wired from the real upstream artifacts; output `{ kind: 'external-action', requestType: 'wordpress-draft-request' }`
- `parseWordpressDraftStepInput` accepts a valid full payload, rejects when the approval is not granted (`/granted approval/`), and rejects a wrong gate artifact type
- INTEGRATION through the durable runner: the entire nine-step pipeline (keyword-research → source-capture → seo-brief → outline → article-draft → fact-check → brand-review → anti-slop-review → human-approval) is run to produce real inputs, then a queued wordpress-draft job is leased, executed, and recorded `succeeded` with a draft-only request
- INTEGRATION failure path: a job whose approval is not granted drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 55/55 across 22 files (all eleven step services, unit and runner integration each)
node_modules/.bin/vitest run (full repo suite): passed 1461/1461 across 173 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

The terminal publishing step now executes end-to-end through the durable runner, producing a structurally draft-only WordPress request gated by a granted approval and all four quality artifacts — completing the content workflow.

## The Automation Lesson

The content workflow is complete: eleven step services, from idea intake to a draft-only WordPress request, every one executed and verified through the same durable-runner bridge built in slice 0051. That bridge was written for the first artifact-producing step and never changed — it absorbed single-input and multi-input derived steps, three quality gates whose verdicts the schema makes honest, a non-artifact approval gate, and now a terminal external-action — because it was drawn at the altitude of "verify a step's declared output and route its typed record," indifferent to what that record is. The safety guarantees that matter most live in the contracts, not the steps: provenance as a required field, verdicts bound to their findings, publishing made unrepresentable. The steps are thin; the types are load-bearing. That is the shape of a workflow where the system, not the agent, owns sequence, validation, and the irreversible action — and where a future live provider can be enabled one injected function at a time without weakening a single invariant.

## Next Case Study Thread

This completes the eleven-step content workflow on mock providers; live adapters remain intentionally disabled.

The next build thread should:

- wire the eleven content step services into the durable runner's step dispatch so a single `WorkflowRun` of the content workflow definition executes them in graph order end-to-end (idea-intake through wordpress-draft) on mock providers, persisting each step's output record and verifying it against `getContentStepOutput(stepId)` at the runner boundary — the transition from per-step services to an orchestrated content `WorkflowRun`.
