# ARD 0006: Postgres Compatibility of the SQLite-First Schema

## Status

Accepted — research/decision record, 2026-06-18.

## Context

Opzava is built SQLite-first but designed to be Postgres-compatible. Before investing in a Postgres adapter, we needed to confirm that the existing schema — across all core tables — uses only portable column types and DDL constructs that translate cleanly to PostgreSQL. This ADR documents the findings of a read-only scout of all table definitions and the resulting decision.

## Decision

Keep SQLite-first. The schema is Postgres-ready. A future Postgres adapter is a driver-swap behind the existing repository interfaces plus optional JSONB/BOOLEAN refinements — no schema redesign required.

## Findings

A read-only scout of all opzava table definitions (`opzava_runner_jobs`, `opzava_runner_attempts`, `opzava_runner_dead_letters`, `opzava_runner_operational_events`, `opzava_runner_external_call_reservations`, `opzava_campaigns`, `opzava_approvals`, `opzava_content_artifacts`, `opzava_agent_roles`) **CONFIRMED** the following:

- **Only portable column types are used** — TEXT (56 columns) and INTEGER (4 columns: `priority`, `attempt_number`, `replay_eligible` as 0/1 boolean, `jobs.priority`).
- **Booleans stored as INTEGER 0/1** — e.g. `replay_eligible` uses 0/1, not a SQLite-specific boolean.
- **ISO-8601 datetimes stored as TEXT** — sortable lexicographically, no platform-specific TIMESTAMP type required.
- **Primary keys are explicit TEXT ids** — UUID or kebab-case strings, not AUTOINCREMENT integers.
- **No SQLite-specific DDL** — no `AUTOINCREMENT`, no `WITHOUT ROWID`, no `PRAGMA`-dependent statements.
- **Upserts use `ON CONFLICT(target) DO UPDATE SET ...`** — identical syntax supported by PostgreSQL 9.5+.
- **`record_json` stored as TEXT** — holds validated JSON blobs.

## Migration Deltas for Postgres

The changes a Postgres adapter would require are small and mechanical:

1. **`CREATE TABLE IF NOT EXISTS`** — works identically on PostgreSQL.
2. **TEXT/INTEGER map 1:1** — no type rewriting needed. Optionally model `replay_eligible` as native `BOOLEAN` (or keep INTEGER 0/1 for parity).
3. **`record_json` TEXT → JSONB** — optional upgrade for indexing and queryability; staying TEXT also works.
4. **Driver swap** — better-sqlite3's synchronous prepared statements replaced with `pg` (node-postgres) behind the same repository interface. The repositories already hide SQL behind factory closures, so only the driver layer changes.
5. **Datetime stays ISO TEXT** — no `TIMESTAMP` column migration needed; already lexicographically sortable.
6. **Verify `ON CONFLICT` targets** — the conflict target columns must have matching `UNIQUE` or `PRIMARY KEY` constraints. Confirmed: `agent_id`, `approval_id`, `campaign_id`, `artifact_id` are PKs; `idempotency_key` is `UNIQUE`.

## Consequences

- **Low migration risk.** No schema redesign, no data transformation, no domain-code changes.
- **The `record_json` pattern + portable types + closure-hidden SQL** keep the door open to Postgres without touching domain logic.
- **This honors the plan's "SQLite-first, Postgres-compatible storage" goal** — Layer 5 / First R&D Queue item 5 — validating that the architectural bet placed at project inception holds up under scrutiny.
- A Postgres adapter can be delivered as a focused driver-layer effort when scaling demands it, with optional JSONB/BOOLEAN refinements as incremental improvements.
