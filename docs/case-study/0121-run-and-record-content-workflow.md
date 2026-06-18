# 0121: Run And Record Content Workflow

## Problem

Opzava's content workflow produced artifacts but persisted none. The operator Artifacts panel only showed seeded data. A scout (read-only, verify-dont-assume) CONFIRMED there is no HTTP/service call site that runs the workflow yet — only tests call it. The loop was open: artifacts existed transiently but were never recorded.

## Approach

The R&D loop began with a scout of all call sites. Status: **CONFIRMED** — no service trigger existed. Rather than editing the executor or inventing a route prematurely, this slice chose a thin run+record orchestrator. It closes the loop by composing two existing primitives: `runContentWorkflowWithRecording` and `recordContentWorkflowArtifacts`. The executor is untouched.

## Contract

```
runAndRecordContentWorkflow(deps, rawIdea): { result, recordedArtifactIds }
```

- **deps**: recording deps plus an injected `ArtifactRepository`
- Derives `workflowRunId = content-workflow:${ideaId}`
- Runs the workflow, then records all 8 produced artifacts via `saveArtifact` with `{workflowRunId, createdAt: deps.now()}`
- Returns the unchanged `result` alongside the `recordedArtifactIds`

## Validation

Three tests using a real in-memory `better-sqlite3` `ArtifactRepository` and the full mock provider harness:

1. **Full run persists all 8 artifacts** — each `getArtifactById` returns non-null; `listArtifacts` length is 8.
2. **Artifacts are associated with the derived run id** — `listArtifacts({workflowRunId: 'content-workflow:idea_001'})` length is 8.
3. **Workflow result is returned unchanged** alongside the recorded ids — no mutation, no loss.

## Security & Audit

No secret values, private credentials, tokens are persisted by this step. The repository's `parseArtifact` rejects any secret-bearing content on save. The orchestrator only forwards already-validated artifacts. It adds no behavior to the executor, so the approval gate and draft-only WordPress output are unchanged.

## Next Case Study Thread

An operator **Team Dashboard** (Opus UI) summarizing recent runs, pending approvals, failures, and cost from the existing `/api/ops` routes. Followed optionally by eslint complexity rules to keep orchestrator functions flat.
