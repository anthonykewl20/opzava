# 0079: Resend Campaign Sender

Date: 2026-06-17
Status: Draft
Thread: This case study closes the email loop by bridging the live Resend ProviderAdapter into the CampaignEmailSender interface, enabling approved CampaignWorkflows to send real email through the platform's exactly-once boundary. It demonstrates how a thin, idempotent worker can own the sequence while respecting platform gates.

## Hook

Sending an email is easy. Sending an email exactly once, only when approved, through a live provider, without owning the provider — that's the problem. We had the adapter (0077). We had the interface (0078). We needed the bridge.

## Product Stakes

If a campaign sends twice to the same recipient, trust is broken. If it sends without approval, compliance is violated. If it fakes success, the user is misled. The sender had to be a faithful executor: thin, idempotent, and gated.

## Industry Counterfactual

Most platforms either own the entire email stack or delegate sending to a third-party service with opaque retry logic. The middle ground — owning the sequence while delegating delivery — is rare because it requires disciplined boundaries. We chose the middle ground.

## What We Built

`createResendCampaignSender({adapter, profile, workflowRunId, stepRunId?, newId, now})` returns a `CampaignEmailSender`. For each recipient, it:

1. Builds a `ProviderAdapterRequest` with operation `RESEND_LIVE_OPERATION` and input `{to, subject, html}`.
2. Generates a per-recipient idempotency key: `campaign:{runId}:{to}:resend-email-send`.
3. Calls `adapter.execute(request, signal)`.
4. Maps the result: `status === 'succeeded'` → `{ok: true, messageId}`, else `{ok: false, messageId: null}`.

Combined with `runEmailCampaign`, this produces an Opzava-owned campaign that sends via the live provider, exactly-once, only when approved.

## What We Refused To Fake

- **Per-recipient idempotency key**: Each recipient is sent at most once. No retries without explicit intent.
- **Approval gate**: The sender is a worker, not a trigger. `runEmailCampaign` enforces the approval boundary.
- **Platform boundary**: The sender does not bypass platform controls.
- **No real network in tests**: HTTP is injected through the adapter. Tests verify behavior, not connectivity.

## Evidence

- 3/3 targeted tests pass.
- Full vitest suite: ~1538 tests across ~196 files.
- `tsc` clean.
- `eslint` zero warnings.

## Validation

- Sends via the live adapter and returns `messageId`.
- Adapter failure returns `{ok: false, messageId: null}`.
- Usable as the sender in `runEmailCampaign` with end-to-end status `'sent'`.

## The Automation Lesson

A thin worker that respects boundaries is more valuable than a thick service that owns everything. The sender does one thing: it bridges an approved workflow to a live provider, exactly once. It does not schedule, approve, or compose. It executes.

## Next Case Study Thread

Campaign scheduling and triggers, plus audience management — Opzava owns the schedule. Then a UI to compose and approve campaigns — Opus designs the interface.
