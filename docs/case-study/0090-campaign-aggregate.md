# 0090: Campaign Aggregate

## Problem

The email-campaign workflow had per-run inputs but no persistable, validated entity the operator UI could create, list, and approve. Without an explicit state machine, an unapproved campaign could theoretically jump straight to sending — a dangerous gap.

## Approach

Introduce a `Campaign` aggregate with a frozen, validated shape and a strict status state machine. Reuse the existing `campaignAudienceSchema` and step shape (DRY — no redefinition). All validation runs through a single `parseCampaign` entry point; all transitions go through `transitionCampaign`, which enforces legal moves before returning a new frozen copy.

## Contract

`parseCampaign(input)` validates and returns a frozen `Campaign`:

```
Campaign {
  schemaVersion, campaignId, name, status,
  startAt, steps[], audience,
  createdAt, updatedAt
}
```

Steps carry unique ids. Audience reuses `campaignAudienceSchema`.

**Statuses:** `draft | approved | sending | sent | failed`

**Transitions (`CAMPAIGN_TRANSITIONS`):**
- `draft → approved`
- `approved → sending` or `approved → draft` (revoke)
- `sending → sent` or `sending → failed`
- `sent` — terminal
- `failed → sending` (retry)

`canTransitionCampaign(from, to)` checks the map. `transitionCampaign(campaign, to, updatedAt)` throws on illegal moves, else re-validates and returns a new frozen campaign.

## Validation

Six core tests:

1. `parseCampaign` accepts a valid draft — result is frozen.
2. Rejects duplicate step ids.
3. Rejects unknown status and empty steps.
4. `canTransitionCampaign` truth table: `draft→approved` ✓, `draft→sending` ✗, `approved→sending` ✓, `sent→*` ✗, `failed→sending` ✓.
5. `transitionCampaign` `draft→approved` updates `status` + `updatedAt`; original is unchanged.
6. Illegal move (`draft→sending`) throws.

## Security & Audit

No secret values, private credentials, tokens live on the campaign aggregate — recipient addresses and HTML only; the email provider secret stays behind the connection's `SecretReference`, resolved at send time. The state machine makes "approve" a mandatory, auditable edge: sending is unreachable from draft, so approval can never be skipped.

## Next Case Study Thread

A campaign repository (SQLite CRUD: create draft, get, list, save transitions) keyed by `campaignId`, then API routes (`GET/POST /api/campaigns`, `POST approve`), and finally the campaign compose/approve UI (designed by the UI owner).
