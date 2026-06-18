# 0098: Dead Letter Read Model

## Problem

Opzava's durable runner writes exhausted jobs to `opzava_runner_dead_letters`. The existing repository exposes dead letters only **per workflow run** (`listReplayableDeadLetters` requires a `workflowRunId`). An operator OPS panel needs a **global, newest-first** view across all runs without bloating the large repository file.

## Approach

A focused read-model module — not a change to the repository. The new function `listRecentDeadLetters` owns its own schema assertion, query, and parse logic, keeping the repository's complexity flat. TDD drives every contract point against a real in-memory `better-sqlite3` database.

## Contract

```ts
listRecentDeadLetters(
  db: Database,
  opts?: { limit?: number }
): DeadLetterStorageRecord[]
```

- Ensures the runner schema exists (idempotent — safe on a fresh database).
- Clamps `limit` to **1..200**, default **50**.
- Selects `record_json ORDER BY stored_at DESC`.
- Parses every row through `parseDeadLetterStorageRecord`; only valid records leave the store.

## Validation

Five tests against a real in-memory `better-sqlite3` database:

1. Returns `[]` on a fresh database without throwing (schema ensured first).
2. Returns seeded records — each re-validated through the parse function.
3. Orders newest-first by `storedAt DESC`.
4. Respects an explicit `limit` value.
5. Clamps a huge (`9999`) or tiny (`0`) limit without throwing.

## Security & Audit

No secret values, private credentials, tokens are exposed by widening the query — dead-letter snapshots already forbid `SecretReference` payloads, and the read model parses through the same schema, so a global listing cannot leak a credential a per-run query would have hidden. Adding a read model rather than a new repository write method keeps the mutation surface unchanged.

## Next Case Study Thread

An admin-only `GET /api/ops/dead-letters` route backed by this query, then an operator **Failures / Dead-Letters** panel (Opus UI) listing job id, workflow run, final-error reason, and time — with empty and loading states.
