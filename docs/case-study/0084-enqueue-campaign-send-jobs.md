# 0084: Enqueue Campaign Send Jobs

## Problem

Opzava's durable runner executes campaign sends as `Job[]`. Slice 0083 produced those jobs from an approval-gated plan, but nothing persisted them. Without persistence, a retried or replayed campaign run would double-send every email. Exactly-once semantics must be a system guarantee, not delegated to the email provider.

## Approach

A single pure function, `enqueueCampaignSendJobs`, iterates the incoming job list. For each job it checks the store by `idempotencyKey`. If a record already exists the job is skipped; otherwise a `JobStorageRecord` is built (with `schemaVersion`, `recordId`, timestamps, status index, workflow/step run IDs, and the original job payload) and saved. The function returns two lists — `enqueued` and `skipped` — preserving input order. All side-effects are confined to `store.saveJob`.

## Contract

```ts
function enqueueCampaignSendJobs(
  jobs: readonly Job[],
  deps: { store: CampaignSendJobStore; newId: () => string; now: () => Date }
): { enqueued: string[]; skipped: string[] }
```

`CampaignSendJobStore` is a narrow port exposing only `getJobByIdempotencyKey(key: string) → Promise<JobStorageRecord | null>` and `saveJob(record: JobStorageRecord) → Promise<void>`. The service never touches the full `RunnerRepository`.

## Validation

1. **Fresh enqueue** — given an empty store, a single job is saved; the returned `JobStorageRecord` mirrors every field from the input job (status, workflowRunId, stepRunId, idempotencyKey, payload).
2. **Dedup on existing key** — when `getJobByIdempotencyKey` returns a record, `saveJob` is *never* called and the jobId appears only in `skipped`.
3. **Mixed batch, order preserved** — a batch of three jobs where the second already exists yields `enqueued: [id1, id3]`, `skipped: [id2]`; `saveJob` is called exactly twice, in order.

## Security & Audit

No secret values, private credentials, tokens are stored in the job payload — only recipient addresses, subject, HTML body, and scheduling metadata. The email provider's API key stays behind a `SecretReference` resolved at execution time by the runner. The narrow store port means this service can never read or log credentials. Every persisted record carries `storedAt`/`updatedAt` timestamps and a monotonic `schemaVersion` for forward-compatible migrations and audit trails.

## Next Case Study Thread

A campaign-run orchestrator that wires `planCampaignRun → buildCampaignSendJobs → enqueueCampaignSendJobs` against the real `RunnerRepository` inside a single transactional entry point. That slice closes the loop from plan to durable execution. A campaign compose/approve UI follows as a separately designed thread.
