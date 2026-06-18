# 0005: Runner Repository Migrations Through App Startup

Date: 2026-06-15
Status: Draft
Thread: Making durable storage part of normal startup, not a test-only trick.

## Hook

A repository that only creates tables in its own unit test is not integrated. It is isolated.

The runner storage layer now registers its schema with the project migration runner, so the same SQLite tables used by the repository are created through the normal application startup path.

## Product Stakes

Opzava cannot rely on a worker remembering to lazily create its tables at the moment it needs them.

Durable execution needs predictable startup behavior: migrations run, `schema_migrations` records the version, and the database is structurally ready before runner code starts writing jobs, attempts, dead letters, and operational events.

This reduces the chance that recovery code starts against a partially initialized database after a restart.

## Industry Counterfactual

The common shortcut is to let every repository create whatever tables it needs on first use.

That works until startup order changes, a worker starts before a web process, or a production database has only half the expected shape. Then “durable” code fails at exactly the moment it is supposed to recover.

Opzava now takes the stricter path: the runner repository schema is a named migration, tracked by the existing migration table.

## What We Built

We added `src/opzava/platform/runner/migrations.ts`.

It exports:

- `registerOpzavaRunnerMigrations()`: idempotently registers runner migrations with the inherited migration runner.
- `getOpzavaRunnerMigrations()`: exposes the migration list for tests and future integration points.
- `applyOpzavaRunnerRepositorySchema()`: the shared DDL helper used by both migrations and repository fallback setup.

We also wired `registerOpzavaRunnerMigrations()` into `src/lib/db.ts` before `runMigrations(db)`, so normal database initialization can apply the runner schema.

## What We Refused To Fake

We did not start workers.

We did not lease jobs.

We did not mutate expired leases during recovery.

We did not add provider calls.

We did not claim multi-process concurrency behavior is finished.

This slice only ensures the repository schema is part of startup migration flow.

## Evidence

Files changed:

- `src/opzava/platform/runner/migrations.ts`
- `src/opzava/platform/runner/migrations.test.ts`
- `src/opzava/platform/runner/repository.ts`
- `src/lib/db.ts`

The migration test proves:

- `registerOpzavaRunnerMigrations()` is idempotent.
- `runMigrations(db)` creates all four runner tables.
- `schema_migrations` records `opzava_runner_001_repository`.

## Validation

Focused validation completed locally:

```text
pnpm vitest run src/opzava/platform/runner/migrations.test.ts: passed 1/1
pnpm vitest run src/opzava/platform/runner/repository.test.ts src/opzava/platform/runner/repository-contracts.test.ts: passed 10/10
```

Red-first evidence was observed:

- The migration integration test failed first because `src/opzava/platform/runner/migrations.ts` did not exist.
- The module was added, repository DDL was centralized, and database startup was wired to register the migration before `runMigrations(db)`.

## The Automation Lesson

Startup is part of reliability.

If recovery depends on tables existing, table creation belongs to the migration path, not just the code path that happens to write first.

## Next Case Study Thread

The next build thread should move from passive storage into active runner behavior:

- lease acquisition
- attempt creation
- successful completion
- retry scheduling
- dead-letter creation
- recovery execution after restart

That is where Opzava starts proving that durable storage can drive durable work.
