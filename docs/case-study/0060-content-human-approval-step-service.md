# 0060: Content Human Approval Step Service

Date: 2026-06-17
Status: Draft
Thread: Slices 0051–0059 built nine content steps that each emit a content artifact. This slice adds `human-approval`, the workflow's accountable human gate — and the first content step whose declared output is not an artifact. Its step output is `{ kind: 'approval' }`: the step records an `Approval` decision over the drafted content, gating the external publishing action that follows. The runner verifies completion against the `approval` step output rather than an `artifact` output, exercising the step-service bridge against a non-artifact record for the first time.

## Hook

Every step so far produced a content artifact; this one produces a *decision*. Opzava's core principle is that external, irreversible actions require an accountable human — and an approval is only accountable if it records who decided, what they decided, why, and over what. This step makes that record a validated `Approval`: a decision that names the approver, carries a reason, is stamped with a decision time, and targets the specific artifact being approved. A "human-approved" claim with no named approver, or an approval that targets nothing in particular, is not accountability — it is a checkbox. This step turns the gate into a structured, validated decision record.

## Product Stakes

`human-approval` consumes the article-draft artifact and produces an `Approval` (from `src/opzava/core/approvals/contracts.ts`) targeting that artifact, with `requestedAction: 'publish-wordpress-draft'`. The mock human-approval provider stands in for the accountable human, returning an `approved` decision with an approver id and reason; the approval contract enforces that an `approved` decision carries a non-null `approverId`, `decisionReason`, and `decidedAt` (a `requested` approval, by contrast, must have those empty). The step's output is `{ kind: 'approval' }` — verified by the runner against the declared step output, exactly as artifact-producing steps are verified against their artifact output. The resulting approval id will be a required input to the terminal `wordpress-draft` step, so publishing cannot proceed without a granted approval over the exact draft.

This is the first time the step-service bridge built in 0051 carries a record that is not a content `Artifact`. It needed no change: the bridge verifies the produced output against `getContentStepOutput(stepId)` and hands the typed record to its sink, agnostic to whether that record is an artifact or an approval. The generic `ContentStepService<TInput, TRecord>` simply instantiates `TRecord` as `Approval`.

## Industry Counterfactual

The common shortcut is an implicit approval — a status flag flipped to "approved" with no record of who flipped it, when, or over what. Or the approval is a free-text comment with no structural link to the content it approves. When something is later published in error, the audit cannot answer "who approved this, and what exactly did they approve" — the gate left no accountable trace.

Opzava makes the approval a first-class validated record. The `Approval` schema requires a target (the artifact or external action being approved), a requester, and — once decided — an approver, a reason, and a decision time; its refinement forbids a decided approval from omitting those fields and forbids a still-requested approval from carrying them. So a granted approval structurally names its approver and its target. The step re-validates the upstream draft before recording the decision, so the approval always targets a real, validated article-draft artifact.

## What We Built

We added to `src/opzava/modules/content/steps/`:

- `human-approval-provider.ts`:
  - `HumanApprovalProviderInput` — `Readonly<{ articleDraft }>`
  - `HumanApprovalDecision` — `Readonly<{ status: 'approved' | 'rejected'; approverId; decisionReason }>`
  - `HumanApprovalProvider` and `createMockHumanApprovalProvider()` — a pure deterministic stand-in for the accountable human, returning an `approved` decision with an approver id and reason
- `human-approval-service.ts`:
  - `HumanApprovalStepInput` — the article-draft artifact and its parsed content, a `requesterId`, and `sourceStepRunId`
  - `parseHumanApprovalStepInput(payload)` — parses and type-asserts the article-draft artifact and parses its content
  - `createHumanApprovalStepService({ provider, newId, now })` — a `ContentStepService<HumanApprovalStepInput, Approval>` whose `run` takes the provider's decision and builds an `Approval` via `parseApproval` (targeting the article-draft artifact, with the decided fields populated), then returns it bound to `getContentStepOutput('human-approval')` — `{ kind: 'approval' }`. No `createContentArtifact`; the record is the `Approval` itself.

The module index re-exports the provider and service symbols. The step runs through the existing `createContentStepExecutor` bridge unchanged — its first non-artifact record.

## What We Refused To Fake

We did not force an approval into the artifact mold; the step's output is `{ kind: 'approval' }` and its record is an `Approval`, not a content artifact, matching the step-output map's declaration. The bridge handled it without modification.

We did not record an anonymous approval; the granted `Approval` carries a named `approverId`, a `decisionReason`, and a `decidedAt`, enforced by the approval contract for any decided status.

We did not let the approval target nothing; its `target` references the real article-draft artifact id, so the decision is bound to the exact content approved.

We did not trust the upstream input; the article-draft artifact is parsed, type-asserted, and its content re-validated before the decision is recorded.

We did not hand-author the implementation; it was generated by the local fleet (MiMo), transcribed, reviewed (MiMo, APPROVE), and verified against the real test suite.

## Evidence

Files changed:

- `src/opzava/modules/content/steps/human-approval-provider.ts`
- `src/opzava/modules/content/steps/human-approval-service.ts`
- `src/opzava/modules/content/steps/human-approval-service.test.ts`
- `src/opzava/modules/content/steps/human-approval-runner.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan-content-steps.test.mjs`

The tests cover:

- `service.run` produces an `approved` `Approval` targeting `{ kind: 'artifact', id: <article-draft artifact id> }`, with `isApprovalGranted` true and the approver id populated, and an output of `{ kind: 'approval' }`
- `parseHumanApprovalStepInput` accepts a valid payload and rejects a non-article-draft upstream artifact
- INTEGRATION through the durable runner: the upstream chain produces a real article-draft, then a queued human-approval job is leased, executed, and recorded `succeeded` with an `approved` approval
- INTEGRATION failure path: a job with a malformed upstream artifact drives the worker to `failed-retry` and leaves the job `queued`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/steps: passed 49/49 across 20 files (nine prior step services + human-approval, unit and runner integration each)
node_modules/.bin/vitest run (full repo suite): passed 1455/1455 across 171 files
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava: passed with 0 errors
node --test test/*.test.mjs: passed
```

The human approval gate now executes end-to-end through the durable runner, recording an accountable `Approval` decision over the drafted content, verified as an `approval` step output.

## The Automation Lesson

The bridge built nine slices ago for the first artifact-producing step absorbed a non-artifact, approval-producing step with zero changes — the strongest evidence that the `ContentStepService` abstraction was drawn at the right altitude. It verifies a step's declared output and routes its typed record, indifferent to whether that record is an artifact, an approval, or (next) an external-action request. The one remaining step, `wordpress-draft`, will exercise the third and final output kind — `external-action` — and must encode the strongest invariant of all: that publishing is structurally impossible, that the step can only ever produce a draft-creation request, and only when a granted approval and all three quality-gate artifacts are present. The gate recorded here is one of the inputs that step will demand.

## Next Case Study Thread

This adds the accountable human gate, the first step whose output is an approval rather than an artifact.

The next build thread should:

- add the eleventh and final content **step service** — `wordpress-draft` — executed through the durable runner as the terminal step, whose declared output is `{ kind: 'external-action', requestType: 'wordpress-draft-request' }`. It consumes the granted approval and the four quality-gate artifacts (fact-check-report, brand-review, anti-slop-review — and the article-draft) and produces a `wordpress-draft-request` that is structurally draft-only: publishing must be impossible by construction, and the request must require the approval id and all required quality-gate ids. The runner verifies completion against the `external-action` step output.
