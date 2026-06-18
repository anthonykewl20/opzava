# 0120: Record Workflow Artifacts

## Problem

Opzava's Artifacts panel displayed only seeded data. The `runContentWorkflowWithRecording` executor already returned every produced artifact as a named field on `ContentWorkflowRunResult`, but nothing persisted them to the repository. The panel was a read-only shell.

## Approach

A scout (read-only, verify-don't-assume) **CONFIRMED** the executor's return shape. Eight artifact fields (`keywordResearch`, `sourceCapture`, `seoBrief`, `outline`, `articleDraft`, `factCheckReport`, `brandReview`, `antiSlopReview`) plus three non-artifact fields (`ideaIntake`, `approval`, `wordpressDraftRequest`) were present. The safe seam was a **pure additive extractor** — no invasive executor edit, no change to its outputs or approval gate. This followed the R&D loop: scout → tracer-bullet read → minimal slice.

## Contract

```ts
function recordContentWorkflowArtifacts(
  result: ContentWorkflowRunResult,
  sink: (artifact: Artifact, ctx: { workflowRunId: string; createdAt: Date }) => string,
  context: { workflowRunId: string; createdAt: Date }
): readonly string[]
```

Walks known artifact field names in workflow order. Calls `sink` for each present, well-formed `Artifact`. Skips non-artifact fields and missing fields. Returns recorded artifact IDs. Pure aside from the injected sink.

## Validation

Three tests with a fake run result and a `vi.fn` sink:

1. **Records all produced artifacts** — 8 IDs returned, first is `kw`, last is `as`; sink called 8 times in workflow order.
2. **Ignores non-artifact fields** — no `ideaIntake`/`approval`/`wordpressDraftRequest` IDs reach the sink; exactly 8 calls.
3. **Skips a missing artifact field** — 7 IDs returned, 7 sink calls.

## Security & Audit

No secret values, private credentials, tokens are introduced. The extractor only forwards already-validated `Artifact` envelopes — the repository's `parseArtifact` still rejects secret-bearing content on save. It adds no side effect beyond the injected sink, so it cannot leak or mutate run state.

## Next Case Study Thread

Wire `recordContentWorkflowArtifacts` at the real call site with `sink = (a, ctx) => createArtifactRepository(getDatabase()).saveArtifact(a, ctx)` so a finished run populates the Artifacts panel. Then build a Team Dashboard that queries persisted artifacts across runs.
