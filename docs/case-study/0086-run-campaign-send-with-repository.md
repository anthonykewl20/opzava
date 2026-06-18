# 0086: Run Campaign Send With Repository

## Problem

`runCampaignSend` is a pure function that plans, builds, and enqueues campaign send jobs against a narrow `CampaignSendJobStore` port. It needs a real binding to a durable SQLite repository so that a campaign either fully persists all its send jobs or — on refusal or error — rolls back entirely. Re-runs must be exactly-once against real storage.

## Approach

`runCampaignSendWithRepository` wraps the pure function with real infrastructure:

1. Accepts a `better-sqlite3` `Database`, the subset of deps excluding `store`, and the campaign plan input.
2. Calls `createRunnerRepository(db)` to get the repository and ensures the schema exists.
3. Adapts `getJobByIdempotencyKey` and `saveJob` into the `CampaignSendJobStore` port interface.
4. Executes `runCampaignSend` inside `db.transaction(...)`, so plan → build → enqueue is atomic.
5. If approval is refused, the error propagates and the transaction rolls back — zero rows persisted.

## Contract

```ts
function runCampaignSendWithRepository(
  db: Database,
  deps: Omit<RunCampaignSendDeps, 'store'>,
  input: PlanCampaignRunInput
): RunCampaignSendResult
```

Returns the same result shape as `runCampaignSend`. Throws on approval refusal or transient failure; caller observes either a fully-persisted campaign or nothing.

## Validation

Three tests run against a real in-memory `better-sqlite3` database:

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | Approved campaign with 4 recipients | 4 jobs persisted; each idempotency key retrievable via `getJobByIdempotencyKey` |
| 2 | Approval not granted | Throws; `SELECT COUNT(*) FROM opzava_runner_jobs` === 0 |
| 3 | Same input run twice on the same db | Second run enqueues 0 new jobs, skips 4 — idempotency keys dedupe |

## Security & Audit

No secret values, private credentials, tokens are persisted in the job rows — only recipient addresses, subject, html, and scheduling metadata. The email provider secret stays behind a `SecretReference` resolved at execution time by the runner. Atomicity guarantees that a partially-approved or failing campaign leaves no half-written send state to leak or double-fire.

## Next Case Study Thread

A thin campaign-run API or service entry point that loads a persisted campaign and its granted approval, then drives `runCampaignSendWithRepository`. Separately, a campaign compose/approve UI (owned by the UI team) that feeds that entry point.
