# 0085: Run Campaign Send

## Problem

Opzava's campaign pipeline had three isolated pure functions — `planCampaignRun`, `buildCampaignSendJobs`, and `enqueueCampaignSendJobs` — but no single entry point that composed them transactionally. Callers had to orchestrate the sequence manually, risking partial execution (e.g., jobs built but never enqueued) or duplicate enqueues on retries. The system needed one function that plans, materializes, and enqueues an entire approved campaign exactly-once in a single call.

## Approach

`runCampaignSend` composes the three existing functions in strict order, threading their outputs forward. The function is itself a pure composition over injected dependencies — `store`, `newId`, `now`, and configuration like `workflowRunId`, `approvalGranted`, `maxAttempts`, and `priority`. Approval refusal from `planCampaignRun` propagates immediately (never caught), so the gate is enforced on every invocation including re-runs. The `CampaignSendJobStore` port is intentionally narrow: `getJobByIdempotencyKey` and `saveJob` — just enough for the durable runner repository to deduplicate.

## Contract

```ts
runCampaignSend(
  deps: {
    store: CampaignSendJobStore;
    newId: () => string;
    now: () => Date;
    workflowRunId: string;
    approvalGranted: boolean;
    maxAttempts?: number;
    priority?: number;
  },
  input: PlanCampaignRunInput
): {
  plan: CampaignRunPlan;
  jobs: CampaignSendJob[];
  enqueued: number;
  skipped: number;
}
```

Steps: `planCampaignRun({approvalGranted}, input)` → `buildCampaignSendJobs(plan, {workflowRunId, newId, maxAttempts, priority})` → `enqueueCampaignSendJobs(jobs, {store, newId, now})`. Returns a frozen result object. Re-running with the same inputs yields `enqueued: 0, skipped: N` because idempotency keys already exist in the store.

## Validation

Three TDD tests drive this slice:

1. **Plans, builds, and enqueues every send once.** Input: 2 steps × 2 recipients. Assert: 4 jobs returned, `enqueued === 4`, `skipped === 0`, store holds exactly 4 jobs.
2. **Refuses to run without granted approval.** `approvalGranted: false`. Assert: throws, `saveJob` never called, store remains empty.
3. **Exactly-once across re-runs.** Run the same campaign twice. Assert: second call returns `enqueued === 0, skipped === 4`, store still holds exactly 4 jobs — no duplicates.

## Security & Audit

No secret values, private credentials, tokens cross this boundary — only recipient addresses, subject, html, and scheduling metadata reach the job payload. The email provider secret stays behind a `SecretReference` resolved at execution time by the runner, never materialized during planning or enqueueing. The approval gate is non-bypassable because `runCampaignSend` re-runs `planCampaignRun`'s check on every call — there is no cached or pre-approved state to exploit.

## Next Case Study Thread

Bind `runCampaignSend` to the real `RunnerRepository` (via `createRunnerRepository`) inside a single DB transaction — the store port already matches `getJobByIdempotencyKey` + `saveJob`, so the adapter is thin. Then build a campaign compose/approve UI (designed separately by the UI owner) that calls `runCampaignSend` after human approval.
