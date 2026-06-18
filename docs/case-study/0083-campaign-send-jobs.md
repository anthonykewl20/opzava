# 0083: Campaign Send Jobs

## Problem

Opzava's campaign orchestrator produces an approval-gated `CampaignRunPlan`: one plan per campaign-run, containing N per-recipient sends, each already stamped with `sendAt` and a deterministic `idempotencyKey`. The system owns sequence, validation, retries, approvals, and exactly-once semantics; agent/provider workers do not. We need to translate that plan into durable-runner `Job` objects the runner can lease, schedule, retry, and audit — without leaking plan-shape concerns into the runner, and without the caller reinventing job envelopes.

## Approach

`buildCampaignSendJobs` is a pure mapping function. Input: an approved `CampaignRunPlan` plus minimal deps (`workflowRunId`, `newId`, optional `maxAttempts`, optional `priority`). Output: a `readonly Job[]`, one job per `plan.sends` entry, in plan order. The function does not touch the clock, the DB, or the runner — it only constructs the envelope. All plan-derived fields (`stepRunId`, `idempotencyKey`, `sendAt`) flow through unchanged so the runner and downstream audit can correlate a job back to its plan source. New identity is minted only for `jobId`. Jobs begin life `status: "queued"`, `attemptCount: 0`, `lease: null` — unowned, waiting for the runner's scheduler.

## Contract

```
buildCampaignSendJobs(
  plan: CampaignRunPlan,
  deps: {
    workflowRunId: WorkflowRunId;
    newId: () => JobId;
    maxAttempts?: number;   // default 3
    priority?: number;      // default 50
  }
): readonly Job[]
```

For each `send` in `plan.sends`, emit:

```ts
parseJob({
  schemaVersion: 1,
  jobId: newId(),
  workflowRunId,
  stepRunId: send.stepId,
  status: "queued",
  idempotencyKey: send.idempotencyKey, // campaign:{campaignId}:{stepId}:{recipient-lowercased}
  payload: { to, subject, html, sendAt },
  priority: priority ?? 50,
  scheduledAt: send.sendAt,
  lease: null,
  attemptCount: 0,
  maxAttempts: maxAttempts ?? 3,
});
```

The function is total over an approved plan; it never reads, mutates, or persists. Callers own the enqueue side-effect.

## Validation

TDD — three tests pin the slice:

1. **Fan-out at scheduled time.** Given a plan with three sends at distinct `sendAt`s, the output is exactly three jobs, `jobs.length === plan.sends.length`, each `scheduledAt === send.sendAt`, order preserved.
2. **Idempotency + payload fidelity.** For each `send`, the resulting job's `idempotencyKey` equals `send.idempotencyKey` byte-for-byte, and `payload` deep-equals `{ to, subject, html, sendAt }` (recipient lowercased as in the plan).
3. **Initial lifecycle state.** Every emitted job has `status === "queued"`, `attemptCount === 0`, `lease === null`. All three fields are asserted collectively so no test lets a "ready to run" job leak out of the mapper.

## Security & Audit

Recipient payload is intentionally narrow: `{ to, subject, html, sendAt }` only. **No secret values, private credentials, tokens** appear in the recipient payload — only addresses/subject/html/scheduling. Provider credentials (SMTP passwords, OAuth refresh tokens, webhook secrets) stay behind `SecretReference` resolved at execution time by the sender adapter, never serialized into the job envelope. `idempotencyKey` and `stepRunId` are preserved so audit can reconstruct: campaign → plan → step → job → attempt → outcome, without inspecting payload.

## Next Case Study Thread

Next slice: a **campaign-run service/repository** that takes these jobs and persists them through the durable-runner job repository — `enqueue` with `ON CONFLICT (idempotencyKey) DO NOTHING` so retries of `buildCampaignSendJobs` are safe. The service owns transactional consistency between `CampaignRunPlan` (approval record) and `Job` rows, and surfaces a `dispatchCampaignRun(planId)` entrypoint. After that, a **campaign compose/approve UI** that lets operators review the plan, see projected job count / earliest sendAt, and flip approval — closing the loop from authoring to enqueued jobs without skipping the approval gate.
