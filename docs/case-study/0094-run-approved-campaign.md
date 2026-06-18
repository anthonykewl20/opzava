# 0094: Run Approved Campaign

## Problem

Opzava's campaign feature had a persisted aggregate, a state machine, and a durable runner worker — but no way to actually *drive* an approved campaign to completion. The missing piece was a single, non-bypassable orchestration function that loads an approved campaign, enqueues all send jobs, drains them through the worker, and records the terminal state. Without it, campaigns sat in `approved` forever.

## Approach

TDD slice against a real in-memory better-sqlite3 database. The function `runApprovedCampaign` is the only entry point for sending; it enforces the `approved → sending → sent|failed` lifecycle by delegating all state transitions to `transitionCampaign`. The worker clock is injected so tests can control when jobs become due. A fake `CampaignEmailSender` stubs the provider while exercising the real repository, enqueue, and drain loop.

## Contract

```ts
runApprovedCampaign(
  deps: {
    db: Database;
    sender: CampaignEmailSender;
    newId: () => string;
    now: () => Date;
    workflowRunId: string;
    workerClock: Date;          // must be ≥ latest send time
    attemptId: () => string;
    deadLetterId: () => string;
  },
  input: { campaignId: string }
): Promise<{
  status: 'sent' | 'failed';
  campaign: Campaign;
  sent: number;
  total: number;
}>
```

**Throws** if campaign not found (`/not found/`). **Throws** if status is not `approved` (`/not approved/`).

## Validation

Four tests against a real in-memory better-sqlite3 database with a fake sender:

1. **Happy path** — an approved campaign drains to `sent` (total 2, sent 2, persisted status `sent`).
2. **Not approved** — a `draft` campaign rejects with `/not approved/` and stays `draft`.
3. **Sender failure** — a sender returning `ok: false` leaves the campaign `failed` (sent 0).
4. **Missing campaign** — a nonexistent `campaignId` throws `/not found/`.

## Security & Audit

No secret values, private credentials, tokens pass through this orchestration — only campaign content and recipient addresses move; the email provider secret stays behind the sender's resolved `SecretReference`. The `approved → sending → sent/failed` edges are enforced by `transitionCampaign`, so a campaign can never send without prior approval and its terminal state is auditable.

## Next Case Study Thread

A `POST /api/campaigns/[id]/run` route that resolves the saved Resend connection into a live sender (`createResendCampaignSender` via `resolveResendLiveConnection`) and calls `runApprovedCampaign`, plus a **Run** button on approved campaigns in the Opus campaigns panel. Later: a worker daemon loop for long-running campaigns and content-run/cost dashboard panels.
