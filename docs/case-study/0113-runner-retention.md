# 0113: Runner Retention

## Problem

Opzava's durable runner appends rows to `opzava_runner_operational_events`, `opzava_runner_dead_letters`, and `opzava_runner_jobs` without bound. Over time this degrades query performance and inflates storage costs. We need a conservative garbage-collection slice that prunes only old, terminal data while preserving all in-flight or failed work.

## Approach

Layer 12 introduces a single function, `pruneRunnerData`, that deletes old terminal rows inside one transaction. The design is deliberately conservative: only succeeded jobs are candidates for pruning; queued, leased, and failed jobs are never touched. Operational events are pruned by `occurred_at`, dead letters by `stored_at`, and jobs by `updated_at` where `status = 'succeeded'`. The function is idempotent — running it twice with the same cutoff yields zero deletes on the second pass.

## Contract

```ts
pruneRunnerData(
  db: Database,
  params: { olderThan: Date }
): {
  operationalEvents: number;
  deadLetters: number;
  succeededJobs: number;
}
```

- **Throws** if `olderThan` is missing or not a `Date`.
- Ensures all three tables exist before deleting.
- Returns per-table delete counts after committing the transaction.

## Validation

Six tests run against a real in-memory `better-sqlite3` database:

1. Returns all zeros on a fresh, empty database.
2. Throws when `olderThan` is omitted.
3. Prunes operational events older than the cutoff; keeps newer ones.
4. Prunes dead letters older than the cutoff.
5. Prunes only old succeeded jobs — job count goes from 4 → 3 while queued, failed, and recent succeeded rows survive.
6. Idempotent — a second prune with the same cutoff deletes nothing.

## Security & Audit

No secret values, private credentials, tokens are read or exposed by the prune — it compares only timestamp and status columns and deletes whole rows; it never inspects `record_json`. Keeping failed and dead-lettered work until an explicit cutoff means GC cannot silently erase evidence needed for audit or replay.

## Next Case Study Thread

An admin-only maintenance route or scheduled task that calls `pruneRunnerData` with a configured retention window (e.g. 90 days), plus a small reporting surface so operators can see what GC removed.
