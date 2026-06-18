# 0082: Campaign Run Plan

Date: 2026-06-17
Status: Draft
Thread: Capstone of the email-campaign arc — composes scheduler (0080) and audience (0081) into a deterministic, approval-gated `CampaignRunPlan` that Opzava owns end-to-end. Closes the loop from workflow intent (0078) to a typed artifact the durable runner can execute without a second orchestration engine.

## Hook

A campaign is not a list of emails you remember to send. It is a plan: N steps, M recipients, one send per (step × recipient), each at a deterministic time, each tagged so it cannot fire twice. `planCampaignRun` turns a campaign brief into that artifact, or it throws.

## Product Stakes

The whole point of the email-campaign arc is that Opzava owns the orchestration. If the "run plan" is a script in someone else's UI, or a cron job in a second provider, Opzava has outsourced its brain. A campaign that sends the wrong email, twice, to the wrong segment, at the wrong time is not a campaign — it is a liability. The run plan has to be reviewable, approvable, and replayable from a typed object, not reconstructed from logs.

## Industry Counterfactual

The default SaaS answer is "schedule in the ESP." Plunk, Mailchimp, Resend's own dashboard — all of them want to own the schedule, the audience expansion, and the dedupe key. You push a campaign into their UI, their worker fires it, their store of truth is their database. Opzava's ARD 0004 says no: the provider is a thin sender, the platform owns the plan. This case study is the artifact that makes that policy concrete.

## What We Built

`src/opzava/modules/content/workflow/campaign-run-plan.ts` (+`.test.ts`):

- `planCampaignRun({ approvalGranted }, { campaignId, startAt, steps: [{ stepId, subject, html, offsetHours }], audience })`
- Throws if `approvalGranted` is false — no plan without approval, full stop.
- On approval: computes each step's `sendAt` via `computeCampaignSchedule` (0080), then expands to one `PlannedCampaignSend` per (step × audience recipient), shaped `{ stepId, to, subject, html, sendAt, idempotencyKey }` where `idempotencyKey = \`campaign:{campaignId}:{stepId}:{to.lowercased}\``.
- Determinism: `startAt` is injected, no `Date.now` reads inside the planner. Same inputs, same plan, every time.

The durable runner enqueues each planned send at its `sendAt`. The per-send key guarantees exactly-once through the platform's idempotency boundary before the live Resend adapter (0079) ever sees the call.

This is the full email automation stack, all on Opzava's own orchestration:
workflow (0078) → live sender (0079) → scheduler (0080) → audience (0081) → run plan (0082).

## What We Refused To Fake

- No plan without approval. The gate throws; it does not warn, does not default, does not soft-skip.
- Per-send exactly-once key, not per-campaign. A campaign key would let duplicates slip through on retries; the key has to include the recipient.
- Determinism. No clock reads inside the planner. `startAt` is the only source of time, so replays and tests converge.
- Opzava owns the plan as a typed artifact. The provider is a thin sender. The plan is reviewable before a single email leaves the building.

## Evidence

- 3/3 targeted files touched (`campaign-run-plan.ts`, `campaign-run-plan.test.ts`, plus the type export re-home).
- Full vitest: ~1549 tests passing across ~199 files.
- `tsc` clean.
- `eslint` 0.

Targeted tests:
- One `PlannedCampaignSend` per (step × recipient) with the correct `sendAt` derived from `startAt + offsetHours`.
- Unique per-recipient idempotency keys: a 2-step campaign to 2 recipients yields 4 sends, 4 distinct keys of the form `campaign:{campaignId}:{stepId}:{to.lowercased}`.
- Refuses to plan without approval — `approvalGranted: false` throws, no partial plan emitted.

## Validation

The test that matters is the duplicate-key test. If two recipients share a key, retries will silently drop mail to one of them; that is a data-loss bug wearing a success message. Pinning the shape — `{campaignId}:{stepId}:{to.lowercased}` — and asserting uniqueness in the suite makes the bug un-reintroducible.

The second is the approval-gate test. It is one line — `expect(() => planCampaignRun({ approvalGranted: false }, …)).toThrow()` — but it encodes the whole policy: there is no path in this codebase from "campaign brief" to "planned send" that bypasses human review.

## The Automation Lesson

A run plan is the artifact that separates "we sent email" from "we ran a campaign." Email sent is a side effect; a campaign run is an auditable, reproducible, approvable object. Build the artifact first, let the runner be a dumb enqueuer, let the provider be a thin sender. The moment you let the ESP own the schedule, you have given it your brain and your blast radius.

## Next Case Study Thread

Wire the plan into the durable runner: enqueue one job per `PlannedCampaignSend` at its `sendAt`, executed via the live Resend adapter (0079) through the platform's exactly-once boundary keyed by `idempotencyKey`. Then a UI (Opus) to compose a campaign, preview each step's audience slice, and approve — the gate flips from "always false in tests" to "human in the loop in production."
