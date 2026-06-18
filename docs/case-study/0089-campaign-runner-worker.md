# 0089: Campaign Runner Worker

## Problem

The email-campaign layer has durable persistence for send jobs, a lease-based runner, and a campaign-send executor — but assembling them requires knowing internal wiring details. Operators need a single factory that produces a ready-to-run worker, plus proof the full loop works against real infrastructure.

## Approach

`createCampaignRunnerWorker` is a convenience factory that assembles three components:

1. **Runner repository** — calls `ensureSchema` on the provided `db` (better-sqlite3).
2. **Job-kind dispatcher** — wraps the injected `CampaignEmailSender` in `createCampaignSendExecutor`, registers it under `CAMPAIGN_SEND_JOB_KIND`.
3. **Durable worker** — hands the dispatcher to `createRunnerWorker` with sensible lease/timeout/retry defaults.

The factory returns a `RunnerWorker` whose `runNext()` leases one due job, dispatches it, and marks it succeeded or dead-lettered.

## Contract

```
createCampaignRunnerWorker({
  db,            // better-sqlite3 Database (already opened)
  sender,        // CampaignEmailSender (Resend-style)
  workerId,      // string — unique per process
  clock,         // () => Date
  ids,           // () => string
  onSent?,       // (job, result) => void
  leaseDurationMs?,   // default 30_000
  executionTimeoutMs? // default 60_000
}): RunnerWorker
```

`RunnerWorker.runNext(): Promise<'dispatched' | 'idle'>` — leases one job or returns idle. Caller loops until drained.

## Validation

Two integration tests run against a real in-memory better-sqlite3 database — no mocks of the runner.

**Full drain.** `runCampaignSendWithRepository` persists 4 send jobs (2 campaign steps × 2 recipients). The worker clock is set *after* the latest `scheduled_at` so all jobs are due. Draining yields 4 `'succeeded'` results then `'idle'`. Each recipient receives 2 emails (one per step). The sender is called exactly 4 times.

**Empty queue.** No campaign enqueued. One `runNext()` returns `'idle'`; the sender is never called.

## Security & Audit

No secret values, private credentials, tokens appear anywhere in this wiring — the worker moves job payloads (addresses/subject/html) only; the provider secret stays inside the injected sender's resolved `SecretReference`. Exactly-once semantics plus the runner's lease/retry/dead-letter machinery mean a crash mid-drain resumes without double-sending.

## Next Case Study Thread

A campaign compose/approve UI — operator drafts steps + audience, grants the approval that `planCampaignRun` requires, then triggers the worker — designed separately by the UI owner. In parallel, a long-running worker daemon loop plus an API entry point that constructs `createCampaignRunnerWorker` from saved Resend settings.
