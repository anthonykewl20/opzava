# 0101: Cost Read Model

## Problem

Opzava's durable runner emits `COST` operational events, but there is no focused read path for an operator to inspect recent spend or see a running total. Querying the raw events table directly couples the UI to storage internals and offers no validation or clamping.

## Approach

A new, self-contained module exposes two pure functions over a `better-sqlite3` handle:

1. `listRecentCostEvents(db, { limit? })` — ensures the table exists, selects only `kind='cost'` rows newest-first, clamps limit to 1–200, and re-parses each row through `parseOperationalEventStorageRecord`.
2. `summarizeCostEvents(records)` — folds the list into `{ count, estimatedCostCents, actualCostCents }`, summing `actualCostCents` only for non-null values.

No changes to the large repository file.

## Contract

```ts
listRecentCostEvents(db: Database, opts?: { limit?: number }): OperationalEvent[]
summarizeCostEvents(records: OperationalEvent[]): { count: number; estimatedCostCents: number; actualCostCents: number }
```

- `limit` defaults to 50; values outside 1–200 are clamped.
- `summarizeCostEvents([])` returns `{ count: 0, estimatedCostCents: 0, actualCostCents: 0 }`.

## Validation

Five tests against a real in-memory `better-sqlite3` database:

1. **Empty db** → `listRecentCostEvents` returns `[]`.
2. **Filters by kind** — a junk `audit` row is excluded by the `WHERE kind='cost'` clause before any parse attempt.
3. **Newest-first ordering** — two cost events inserted at different timestamps come back reversed.
4. **Explicit limit** — inserting 3 events and passing `{ limit: 2 }` returns exactly 2.
5. **Summarize** — two records (one with `actualCostCents: null`) yield `{ count: 2, estimatedCostCents: 30, actualCostCents: 12 }`.

## Security & Audit

No secret values, private credentials, tokens appear in cost events — they carry provider id, operation name, integer unit counts, and cents only; no credential. Re-parsing every row on read through `parseOperationalEventStorageRecord` means a malformed or tampered row fails closed rather than feeding the operator panel bad data.

## Next Case Study Thread

An admin-only `GET /api/ops/costs` route that calls both functions and returns `{ events, summary }`, followed by an operator **Costs** panel in Opus UI showing the running total and a per-event breakdown table.
