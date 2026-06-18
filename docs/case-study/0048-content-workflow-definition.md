# 0048: Content Workflow Definition

Date: 2026-06-16
Status: Draft
Thread: The content artifacts stop being a pile of contracts the moment they are wired into a single, validated step graph. This slice declares the content `WorkflowDefinition` — eleven steps from `idea-intake` to a terminal `wordpress-draft` — and validates it through the existing `parseWorkflowDefinition`, which proves the graph is acyclic, every edge resolves, and the entry step exists. The load-bearing structural rule: the single `approval-gate` (`human-approval`) sits immediately upstream of the only `external-action` (`wordpress-draft`), so reaching the WordPress request in the graph is impossible without first passing through human approval.

## Hook

Ten artifact contracts, in isolation, are a vocabulary. They become a pipeline only when someone declares the order in which they are produced and who hands off to whom. The risk in a content pipeline is not that the contracts are wrong — it is that the *ordering* lives nowhere enforceable: a comment in a runbook, a convention in a caller, a `// step 4` string. When the external action drifts ahead of the approval, the post-mortem finds an ordering that was *understood* but never *declared*. This slice makes the order a frozen, parse-time-validated value: a `WorkflowDefinition` whose step graph you cannot construct with a cycle, a dangling edge, or an unknown entry.

## Product Stakes

Slice 0047 closed the artifact chain with a terminal, draft-only WordPress request that can only exist after an approval and every quality gate. But the artifacts named *what* could exist; nothing yet named *in what order they are produced*, or that the approval is *upstream* of the external action rather than alongside it.

This slice adds the content `WorkflowDefinition` as declarative data: `schemaVersion`, `workflowId`, a positive `version`, an `entryStepId`, and eleven steps — `idea-intake` (manual input), `keyword-research`, `source-capture` (provider calls), `seo-brief`, `outline`, `article-draft`, `fact-check`, `brand-review`, `anti-slop-review` (transforms and provider calls), `human-approval` (the single approval gate), and `wordpress-draft` (the single external action, terminal). Each step names its successor by id; the graph is a straight line that the `parseWorkflowDefinition` validator has already proven is acyclic and fully connected.

## Industry Counterfactual

The common shortcut is to leave step ordering as orchestrator logic — a sequence of function calls in a runner, or a JSON config file that is never validated against a schema. The approval-then-action rule then survives only as the developer remembering to call `approve()` before `publish()`.

That detaches the safety ordering from any checkable artifact. A refactor, a new caller, or a config edit can swap two steps and nothing fails loudly — the validator does not exist, because the order was never a validated value. When a draft ships without an approval, the post-mortem finds an ordering that the type system and the config both *permitted* to be wrong.

Opzava declares the order as a `WorkflowDefinition` parsed by `parseWorkflowDefinition`, which enforces unique step ids, a resolvable entry step, that every `nextStepId` points at a real step, and — critically — that the step graph contains no cycle. The approval-precedes-action rule is expressed in the edges: `human-approval` points only at `wordpress-draft`, and nothing reaches `wordpress-draft` by any other edge.

## What We Built

We added the content `WorkflowDefinition` under `src/opzava/modules/content/workflow/`.

The definition:

- is declarative data validated by the existing `parseWorkflowDefinition` (no new validator, no runner, no side effects)
- carries `workflowId: 'content-workflow'`, `version: 1`, `schemaVersion: WORKFLOW_CONTRACT_SCHEMA_VERSION`
- enters at `idea-intake` and declares `idea-intake` as the only `allowedInputArtifactType`
- has exactly eleven steps, each naming its successor; `wordpress-draft` is terminal with `nextStepIds: []`
- places the single `approval-gate` (`human-approval`) as the sole predecessor of the single `external-action` (`wordpress-draft`)
- exposes `getContentWorkflowDefinition()`, which returns a frozen, deterministic `WorkflowDefinition`
- is re-exported (`CONTENT_WORKFLOW_ID`, `getContentWorkflowDefinition`) from the module index

## What We Refused To Fake

We did not add a runner, step services, or provider execution; this slice is the *graph*, not the *execution*.

We did not make ordering a comment or a convention; it is a parsed, validated step graph.

We did not add a second approval gate or a second external action; the graph declares exactly one of each, and the approval is upstream of the action by edge, not by intent.

We did not bypass the existing validator; `getContentWorkflowDefinition` calls `parseWorkflowDefinition`, so a future edit that introduces a cycle, a dangling edge, or a duplicate step id will fail at parse time, not silently ship.

## Evidence

Files changed:

- `src/opzava/modules/content/workflow/content-workflow.ts`
- `src/opzava/modules/content/workflow/content-workflow.test.ts`
- `src/opzava/modules/content/index.ts`

The tests cover:

- the definition parses through `parseWorkflowDefinition` without throwing
- it carries the content workflow id and the current contract schema version
- it has exactly eleven steps and enters at `idea-intake`
- `idea-intake` is the only allowed input artifact type
- `wordpress-draft` is terminal (empty `nextStepIds`)
- there is exactly one `approval-gate` (`human-approval`) and its sole successor is `wordpress-draft`
- there is exactly one `external-action` and it is `wordpress-draft`
- the parsed result is frozen and deterministic across calls

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/workflow/content-workflow.test.ts: passed 10/10 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 101/101 (10 artifact contracts + wordpress-draft-request + content-workflow graph)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
```

This slice declares the step graph and validates it through the existing contract parser; the graph is acyclic, every edge resolves, and the approval structurally precedes the external action.

## The Automation Lesson

The boundary this slice draws is deliberate. The graph declares *order*; it does not yet enforce *outcomes*. A later step-service slice must guarantee that the `wordpress-draft-request`'s referenced `approvalId` is actually **GRANTED** (not merely present), and that every gate artifact (`source-capture`, `fact-check-report`, `brand-review`, `anti-slop-review`) is in a **PASSED** state before the terminal step runs — the council's referential-integrity point. Wiring steps into a validated DAG is the first half of the guarantee; runtime enforcement of gate verdicts is the second. Shipping the graph without the verdict check would let a well-ordered pipeline carry a rejected approval downstream, so the next slice must close that loop, not assume it.

## Next Case Study Thread

This wires the ten content artifact contracts into one acyclic, validated step graph.

The next build thread should:

- add the first content **step service** — `idea-intake` executed as an application service that produces a validated `IdeaIntake` artifact from manual input — run through the durable runner on mock providers, before any downstream transform or provider-call step is implemented
