# 0092: Campaign API Routes

## Problem
The operator UI needs to list, create, and approve campaigns, but the Campaign aggregate's state machine (draft → approved → sent) lives server-side. Without HTTP routes that enforce transitions through `transitionCampaign`, the browser could craft requests that skip edges or jump states, breaking auditability.

## Approach
TDD slice adding three admin-only routes backed by the existing Campaign aggregate and SQLite repository. Each route calls `requireRole(request, 'admin')` before touching the domain. Approval always flows through `transitionCampaign(c, 'approved', now)`, so the draft→approved edge—and its illegality from other states—is enforced by the aggregate, not the client.

## Contract

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/campaigns` | — | `200 { campaigns: listCampaigns() }` |
| POST | `/api/campaigns` | `{ name, recipients, subject, html, scheduledAt? }` | `201 { campaign }` — `parseCampaign` assigns a new `campaignId`, timestamps, status `'draft'`; `saveCampaign` persists |
| POST | `/api/campaigns/[id]/approve` | — | `200 { campaign }` — `getCampaignById` (404 if missing) → `transitionCampaign(c, 'approved', now)` (409 on illegal transition) → `saveCampaign` |

Rate limiting applies to both POST endpoints.

## Validation
Six tests against a real in-memory `better-sqlite3` db via `getDatabase`:

1. **POST creates a draft** — 201, status `'draft'`, non-empty `campaignId`.
2. **GET lists it** — response contains the newly created campaign.
3. **POST missing field** — 400, campaign not persisted.
4. **Approve draft** — 200, status `'approved'`.
5. **Approve unknown id** — 404.
6. **Re-approve approved** — 409 (illegal transition).

## Security & Audit
No secret values, private credentials, tokens pass through these routes — only campaign names, recipients, subjects, HTML, and scheduling metadata. The email provider secret stays behind the connection's `SecretReference`. Every route is admin-gated via `requireRole`, and approval is server-enforced through the aggregate's state machine so a crafted request cannot skip the approved edge or jump a sent campaign back to sending.

## Next Case Study Thread
The campaign compose/approve UI — the operator drafts steps and audience, lists campaigns, and clicks approve — calling these routes, designed by the UI owner. Later, a run endpoint that constructs `createCampaignRunnerWorker` from saved Resend settings to actually send an approved campaign.
