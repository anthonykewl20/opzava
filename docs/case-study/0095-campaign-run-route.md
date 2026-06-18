# 0095: Campaign Run Route

## Problem
Opzava's campaign feature could create and approve campaigns, but had no way to actually *run* one. The durable runner existed, but no admin-facing HTTP endpoint triggered it. We needed a tightly-gated route that resolves a saved Resend connection into a live email sender and fires an approved campaign — the first path that produces real outbound email.

## Approach
A single `POST /api/campaigns/[id]/run` route, admin-only and rate-limited. It reads the settings table to resolve the operator's Resend connection; absent config returns 400. On success it builds a fetch-based `ResendHttpClient`, wraps it in a `ProviderAdapter` + `ProviderProfile`, and passes the resulting sender to `runApprovedCampaign`. Service-level guards map to HTTP: not-found → 404, not-approved → 409, else 500. The response is `{ status, sent, total }`.

## Contract
| Field | Detail |
|---|---|
| Method / Path | `POST /api/campaigns/:id/run` |
| Auth | `requireRole('admin')` + rate-limit |
| 400 | Resend connection not configured |
| 404 | Campaign ID unknown |
| 409 | Campaign exists but is not approved |
| 200 | `{ status: 'sent' \| 'failed', sent: number, total: number }` |

## Validation
Four tests against a real in-memory `better-sqlite3` database with a **stubbed `global.fetch`** (no real email leaves the test suite):

1. **400** — no Resend row in settings → `Resend is not configured`.
2. **404** — unknown campaign ID.
3. **409** — campaign exists but status is `draft`.
4. **200** — seeded approved campaign with `start_time <= now`; fetch stub returns ok; assert `global.fetch` was called; response carries `status: 'sent'`.

The route uses the real wall clock as the worker clock, so a campaign's `start_time` must be at or before now for its sends to be due.

## Security & Audit
No secret values, private credentials, tokens are returned or logged by the route. The Resend API key is read from the settings store only to construct the sender and never echoed. The response carries only `sent`/`total` counts and the campaign's status. The route is admin-gated, sends only an already-approved campaign, and inherits the runner's exactly-once + retry/dead-letter guarantees — a double-click cannot double-send.

## Next Case Study Thread
A **Run** button on approved campaigns in the Opzava campaigns panel: POST to this route, optimistic "sending…" state, refresh on result. Then ops panels for content runs, failures/dead-letters, and costs, followed by a worker daemon loop for scheduled campaign execution.
