# 0091: Campaign Repository

## Problem

The Campaign aggregate (slice 0090) defines a status state machine but has no persistence. The operator UI needs to create, list, approve, and delete campaigns. Without a repository, campaigns vanish on restart and there's no guard against storing malformed data.

## Approach

Mirror the runner-repository idiom already established in Opzava: a factory function over a `better-sqlite3` Database that returns a frozen object of closures. A single `CREATE TABLE IF NOT EXISTS opzava_campaigns` with a `record_json` column stores the full aggregate. Every read **and** write passes through `parseCampaign` — the store is a validation boundary, not a dumb bucket.

## Contract

```ts
createCampaignRepository(db: Database): {
  ensureSchema(): void
  saveCampaign(campaign: Campaign): void          // upsert by campaignId, validates first
  getCampaignById(id: string): Campaign | null
  listCampaigns(filter?: { status?: string }): Campaign[]  // newest-first (createdAt DESC)
  deleteCampaign(id: string): void
}
```

`saveCampaign` upserts on `campaignId` — a draft followed by an approved save yields one row with status `approved`, not two.

## Validation

Six tests against a real in-memory `better-sqlite3` database:

| # | Test |
|---|------|
| 1 | `saveCampaign` + `getCampaignById` round-trips; unknown id returns `null` |
| 2 | Upsert: save draft then approved → one row, status `approved` |
| 3 | `listCampaigns` returns newest-first by `createdAt DESC` |
| 4 | `listCampaigns({ status: 'approved' })` filters correctly |
| 5 | `deleteCampaign` removes the row; subsequent get returns `null` |
| 6 | Reads round-trip through the schema — a manually inserted malformed JSON fails `parseCampaign` on read, returning nothing rather than corrupt data |

## Security & Audit

No secret values, private credentials, tokens are stored in the campaign rows — only names, recipient addresses, subjects, HTML, scheduling, and status. The email provider secret stays behind the connection's `SecretReference` resolved at send time. Validating on read as well as write means a tampered or schema-drifted row fails closed rather than silently feeding bad data to the UI.

## Next Case Study Thread

API routes backed by this repository: `GET/POST /api/campaigns` for list and create-draft, `POST /api/campaigns/[id]/approve` to transition draft→approved via `transitionCampaign` (admin-only). Followed by the campaign compose/approve UI (designed by the UI owner) that consumes those routes.
