# ADR-022: Postgres-backed durable worker scheduler

## Status

Proposed — owner-approved 2026-08-13 contingent on implementation
**Acceptance gate:** flip to Accepted when the scheduler PR merges. This is the same implementation-
contingent lifecycle used by ADR-019, ADR-020, and ADR-021.

## Context

ADR-021 requires a dedicated worker job every five minutes for the OpenClaw doctor scan and
explicitly forbids both process-local `setInterval` and scheduling in the `gateway-broker`
(`docs/adr/ADR-021-durable-redacted-doctor-scan.md:180-194`). It assigns that scheduled job to its
security-complete capability slice (`docs/adr/ADR-021-durable-redacted-doctor-scan.md:233-240`) but
does not select the durable scheduling mechanism.

No scheduler or cron facility exists in the worker today. Its entrypoint performs startup
reconciliation, starts the internal HTTP server, and handles shutdown; it has no periodic job loop
(`apps/workers/src/main.ts:46-109`). The worker package has one-shot command scripts but no BullMQ,
Graphile Worker, pg-boss, or node-cron dependency (`apps/workers/package.json:9-36`). Those scripts
are commands, not a multi-instance periodic scheduler.

Postgres is already Opzava's system of record, with hybrid CQRS, transactional outbox, polling, and
rebuildable projections established by ADR-004
(`docs/adr/ADR-004-data-boundary-cqrs.md:21-23,77-94`). The runtime database role is the constrained,
non-superuser, non-owner, non-`BYPASSRLS` `opzava_app` role (`db/init/00-roles.sql:27-45`), and tenant
queries run through a transaction-local, validated `withTenant` context
(`packages/adapters/src/postgres/tenant-context.ts:85-108`). Lean VPS operations are a
Non-Negotiable. Redis is not in the as-built Compose stack; it remains planned until a phase needs
it (`ARCHITECTURE.md:292-301`). Adding Redis only for scheduler durability would therefore create a
new operational dependency where Postgres already provides the required correctness boundary.

Current topology is one static `openclaw-platform-gateway`. Dynamic per-tenant Gateway provisioning
is deferred until the multi-tenant phase without changing ADR-002's eventual one-Gateway-per-tenant
model (`docs/adr/ADR-002-tenancy-provisioning.md:3-10`). The first scheduler consumer is the worker's
`OpenClawDoctorScanPort.tick()` / `ensureFresh` path from issue #280 PR B2a and issue #309. The
doctor repository already claims scans with a random fenced lease and publishes only when the same
unexpired token still owns the scope
(`packages/adapters/src/postgres/doctor-scan-repository.ts:133-199,201-244`). That scan lease prevents
cross-instance duplicate execution and stale publication. The scheduler needs only to deliver a
periodic `ensureFresh({ organizationId, scope })` invocation.

## Decision

### Store schedules in one tenant-protected Postgres table

Add `platform_scheduled_job` through the existing migration ledger. Its minimum schema is:

```text
job_key text not null, organization_id uuid not null, scope text not null,
cadence_seconds integer not null, next_run_at timestamptz not null,
dispatch_lease_token uuid null, dispatch_lease_expires_at timestamptz null,
consecutive_failures integer not null default 0, last_started_at timestamptz null,
last_completed_at timestamptz null, last_failure_code text null, updated_at timestamptz not null default now()
primary key (job_key, organization_id, scope); index (next_run_at, dispatch_lease_expires_at)
```

The implementation must add bounded checks for keys, scopes, cadence, failure codes, and coherent
lease fields. Enable and force RLS. Ownership, grants, tenant-isolation policy, restrictive
tenant-context-required policy, and owner-administration policy follow
`0018_platform_doctor_scan.sql` exactly
(`packages/identity-access/drizzle/0018_platform_doctor_scan.sql:93-131`). Every runtime operation
uses `withTenant(organizationId, ...)`; no scheduler query may bypass tenant context.

### Dispatch only typed, code-owned handlers

Use a closed, code-only handler registry. For example:

```text
"openclaw.doctor-scan" => doctorScanPort.ensureFresh({ organizationId, scope })
```

`job_key` selects only a statically registered handler. It is never an import path, SQL fragment,
shell command, URL, or other dynamic dispatch input. Persist only bounded Opzava-owned failure
codes. Raw exceptions, stack traces, upstream messages, stdout, and stderr never enter the schedule
row.

At-least-once delivery is the scheduler contract. Therefore **every admitted handler must be
idempotent or independently fenced**. A handler without that property cannot be registered.

### Claim briefly, dispatch outside the transaction, and acknowledge with a fence

Run a wake loop approximately every 30-60 seconds. On each wake, for the explicitly configured
organization:

1. In one short tenant transaction, select a bounded batch of due, unleased or expired rows with
   `FOR UPDATE SKIP LOCKED`.
2. Set a cryptographically random `dispatch_lease_token`, a short
   `dispatch_lease_expires_at`, and `last_started_at`, then commit.
3. Invoke each typed handler outside the database transaction. Never retain a row lock or open
   transaction across handler work.
4. On success, acknowledge only where the matching token is still unexpired: set
   `next_run_at = now() + cadence`, clear the dispatch lease, reset `consecutive_failures`, and set
   `last_completed_at`.
5. On failure, update only where the matching token is still unexpired: clear the dispatch lease,
   increment `consecutive_failures`, record a bounded failure code, and set `next_run_at` using a
   bounded retry backoff.

PostgreSQL documents `FOR UPDATE` row locking and `SKIP LOCKED` as suitable for avoiding contention
among multiple consumers of queue-like tables
([SELECT](https://www.postgresql.org/docs/current/sql-select.html),
[Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)). A crash after
delivery but before acknowledgement leaves the dispatch lease to expire; another worker then
redelivers the job. This is safe only because the admission contract requires idempotent or fenced
handlers.

### Keep delivery coordination separate from scan execution coordination

The two leases have different owners and meanings:

- `platform_scheduled_job` dispatch lease coordinates delivery of one handler invocation.
- `platform_doctor_scan_lease` coordinates execution and publication of one doctor scan
  (`packages/identity-access/drizzle/0018_platform_doctor_scan.sql:77-91`).

Do not merge them. Delivery may be retried after an ambiguous scheduler crash while the doctor-scan
lease correctly rejects duplicate scan execution or stale publication.

### Drain cleanly on shutdown

On `SIGTERM` or `SIGINT`, stop claiming new schedule rows, await the active handler, and only then
close scheduler and worker resources. Shutdown does not revoke a persisted lease early unless the
matching fenced acknowledgement completes; an interrupted handler is recovered through lease
expiry and redelivery.

## Owner decisions and open items

### P1 — bind worker bootstrap to one explicit tenant

Require and validate `OPZAVA_PLATFORM_ORGANIZATION_ID` at worker bootstrap. Scheduled work runs
under that organization's forced-RLS context because the doctor repository's `claim` requires an
`organizationId` and routes through `withTenant`
(`packages/adapters/src/postgres/doctor-scan-repository.ts:45-53,133-144`). Do not bypass RLS and do
not reuse a broker tenant setting; the broker is neither the scheduler nor the authority for this
worker's database tenant context.

### P2 — defer future per-Gateway schedule discovery

When dynamic multi-tenant Gateways resume, per-Gateway schedule-scope discovery requires a bounded,
authorized `ScheduleScopeSource`. This ADR does not authorize owner credentials, unscoped tenant
enumeration, an RLS bypass, or cross-tenant schedule claims. Define that discovery and authorization
model in a future ADR before enabling fleet-wide schedules.

## Consequences

- Opzava gains a small in-house scheduler whose mandatory test surface includes concurrent claims,
  claim expiry, crash/redelivery, token-fenced acknowledgement, bounded retry, database-clock
  behavior, tenant RLS, and graceful shutdown.
- A 30-60 second wake interval adds equivalent trigger jitter. The doctor scan's five-minute cadence
  does not require second-level precision.
- Delivery is intentionally at least once. Idempotency or independent fencing is mandatory for every
  handler and must be proved before registration.
- Postgres remains the durable coordination boundary, and the as-built stack gains no Redis or
  standalone scheduler service.
- The doctor scan keeps its existing execution fence; scheduler retries cannot authorize stale scan
  publication.

## Alternatives

- **Graphile Worker.** Mature, Postgres-native cron and queue processing supports distributed
  recurring schedules, backfill, retries, polling, and graceful stop. Rejected as the primary choice
  because it adds a dependency, owns and migrates a private schema, and expects the database-owner
  role by default. That conflicts with Opzava's constrained `opzava_app` runtime and forced-RLS
  posture. It remains the preferred second choice if Opzava later needs a general durable queue whose
  broader feature set justifies that integration. Verified against Graphile Worker's official
  [cron](https://worker.graphile.org/docs/cron),
  [library run](https://worker.graphile.org/docs/library/run),
  [configuration](https://worker.graphile.org/docs/config),
  [requirements](https://worker.graphile.org/docs/requirements), and
  [schema](https://worker.graphile.org/docs/schema) documentation.
- **pg-boss.** Also a mature Node/Postgres queue with cron, retries, multi-instance processing, and
  `SKIP LOCKED`. Rejected for this narrow first consumer because it similarly adds dependency and
  queue-schema ownership cost. It is the third choice behind Graphile Worker if a general queue is
  later required. Node and PostgreSQL compatibility were checked against the upstream
  [pg-boss README](https://github.com/timgit/pg-boss/blob/master/README.md) and package metadata.
- **OS-level cron invoking one-shot worker scripts.** Durable across application restarts, but
  rejected because it adds an in-container operations surface, separates scheduling state from the
  application's tenant and fencing model, and is not ready for multiple worker instances.
- **Process-local `setInterval`.** Rejected because it loses cadence state across restarts, permits
  duplicate triggers across instances, and is explicitly forbidden by ADR-021
  (`docs/adr/ADR-021-durable-redacted-doctor-scan.md:180-194`).

## Residual risk

The scheduler is intentionally narrower than a general queue. New requirements such as arbitrary
payloads, priorities, dependencies, high throughput, dead-letter workflows, or broad cron syntax
must trigger a fresh buy-versus-build review rather than accumulating ad hoc features here.

Database time owns due checks, lease expiry, acknowledgement fences, and retry scheduling. Tests
that substitute only a process clock cannot prove production behavior. Real-Postgres concurrency
and RLS tests are required when this decision is implemented.

## Validation

This decision was independently architecture-reviewed by `consensus-terra` and owner-approved on
2026-08-13. Upstream verification covered PostgreSQL `FOR UPDATE SKIP LOCKED` and row-lock lifetime
in the current PostgreSQL documentation linked above; Graphile Worker cron, library lifecycle,
configuration, schema ownership, database-role expectation, and Node/Postgres requirements; and
pg-boss Node/Postgres compatibility and `SKIP LOCKED` queue design.

## Related decisions and issues

- ADR-002: static platform Gateway now; dynamic one-Gateway-per-tenant provisioning deferred.
- ADR-004: Postgres system of record, transactional outbox, polling, and hybrid CQRS.
- ADR-021: durable redacted doctor scan, five-minute scheduled job, and scan-execution fence.
- Issues #280 and #309: first scheduler consumer and durable scheduler follow-up.

---

> **Validate against official docs before implementing.** Training knowledge is a starting point,
> not the source of truth. Re-check PostgreSQL locking behavior and any selected scheduler library
> against its then-current official documentation.
