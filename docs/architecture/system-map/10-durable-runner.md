# 10 — Durable Runner (deep)

> Zone: `src/opzava/platform/runner/`. Engine B's crash-safe execution core. **Double-verified:**
> pass 1 (zone research) + pass 2 (fresh adversarial deep-dive). Schema verified directly against
> `migrations.ts`. Where a behavior is stated, the proving code is cited. Claims that survived an
> explicit refutation attempt are ✅✅; the one imprecision pass 2 caught is marked ⚠️.

## Files

| file | purpose | LOC |
|------|---------|-----|
| `contracts.ts` | `Job`/`Attempt`/`DeadLetter` Zod schemas, status enum, transition table, `transitionJobStatus` | 184 |
| `repository-contracts.ts` | Storage-record wrappers (denormalized index cols + nested record) + consistency `superRefine`s | 215 |
| `repository.ts` | The engine: lease, success, failure, recovery, replay-list, audit, immediate-tx wrapper | 940 |
| `migrations.ts` | DDL for 4 runner tables + reservations; migration registration | 106 |
| `retry-policy.ts` | Pure exponential backoff calculator (no baked-in defaults) | 80 |
| `worker.ts` | One-poll loop: lease → execute-with-timeout → success/failure | 145 |
| `daemon.ts` | Poll loop around a worker with idle/error backoff + abort | 97 |
| `daemon-runtime.ts` | Wires admin runtime settings into a daemon | 37 |
| `retention.ts` | `pruneRunnerData` — deletes old events/dead-letters/succeeded jobs | 47 |
| `run-queries.ts` / `cost-queries.ts` / `dead-letter-queries.ts` | Read-only rollups over operational events | 54/42/19 |

## Job state machine ✅✅

Status strings (`contracts.ts:19-26`): `queued · leased · succeeded · failed · dead-lettered · cancelled`.

Literal transition table (`contracts.ts:139-146`):
```ts
const jobTransitions = {
  queued: ['leased', 'cancelled'],
  leased: ['queued', 'succeeded', 'failed', 'dead-lettered'],
  succeeded: [],
  failed: ['queued', 'dead-lettered'],
  'dead-lettered': [],
  cancelled: [],
}
```
Enforced by `transitionJobStatus` (`contracts.ts:160-168`): throws `invalid job transition: ${from} -> ${to}`, then re-parses via `parseJob` so the lease-metadata invariant (`contracts.ts:50-56`: only a `leased` job may/must carry `lease`) re-validates.

```
            ┌───────────► cancelled (terminal, DEAD — no producer)
   queued ──┤
     ▲      └──► leased ──┬──► succeeded (terminal)
     │                    ├──► dead-lettered (terminal)
     │  (requeue)         ├──► queued (retry / recovery requeue)
     │                    └──► failed (DEAD — no producer)
     └──── failed ──┬──► queued
                    └──► dead-lettered
```

⚠️ **`failed` and `cancelled` are dead job-status branches** ✅✅ — present in the enum + table, but **no repository path ever transitions a job into them**. Every `transitionJobStatus` call targets only `leased`/`queued`/`succeeded`/`dead-lettered` (`repository.ts:214,277,341,394,582,635`). (Careful: `'failed'` *does* appear as the normal terminal **attempt** status, e.g. `repository.ts:347` — don't conflate the two.)

## Attempt state machine ✅✅

Statuses (`contracts.ts:86`): `running · succeeded · failed`. `errorClass` (`contracts.ts:89`):
`none · timeout · provider-error · validation-error · permission-error · unknown` (`none` only for
running/succeeded; retry-policy & dead-letter error classes drop `none`). Invariants
(`contracts.ts:91-99`): a `running` attempt must have `finishedAt===null`; a finished one must have
a non-null `finishedAt`. `attemptNumber >= 1`.

## Call-graph — one job lifecycle ✅✅

The runner does **not** generate jobs; a caller builds a `JobStorageRecord` and persists it.

```
caller
 └─ saveJob(record)                                   repository.ts:113
      ├─ parseJobStorageRecord                        :115
      ├─ getJobById → transitionJobStatus (validate-only, result discarded)  :116-124  ⚠️ see note
      └─ upsertJobRecord → runImmediateTransaction    :126-129   (ON CONFLICT(job_id) DO UPDATE)

worker.runNext()                                      worker.ts:52
 └─ leaseNextJobForAttempt(leasedAt, leaseExpiresAt)  repository.ts:199
      ├─ SELECT status='queued' AND scheduled_at<=now ORDER BY priority DESC, scheduled_at ASC, rowid ASC LIMIT 100  :203-208
      ├─ skip rows where attemptCount >= maxAttempts  :212
      ├─ transitionJobStatus(...'leased', lease)      :214
      ├─ attemptCount = transitioned.attemptCount + 1 :223-224   ← INCREMENT AT LEASE
      └─ insert running attempt numbered attemptCount :226-240
 └─ executeWithTimeout(executor, job, attempt, executionTimeoutMs)  worker.ts:64
      ├─ success → recordAttemptSuccess               repository.ts:268 (job leased→succeeded, audit runner.attempt.succeeded)
      └─ throw/timeout → recordAttemptFailure         repository.ts:324
           ├─ if attemptCount < maxAttempts → retry: job leased→queued, scheduledAt=retry, attempt failed, audit retry-scheduled  :333-387
           └─ else → dead-letter: job leased→dead-lettered, insert dead_letter(replayable), audit dead-lettered  :390-466
```

`recordAttemptSuccess` guards with `assertLeasedJobWithRunningAttempt` (`repository.ts:275`,
`899-907`) — if a recovery pass already moved the job out of `leased`, the late finish **throws**
rather than double-processing.

⚠️ **`saveJob`'s transition check is validation-only** ✅✅ (`repository.ts:119-124`): the
`transitionJobStatus` return is discarded; the persisted status is whatever the caller put in
`record.job.status`. The check only throws on an illegal transition before the upsert.

## Lease & timeout semantics ✅✅

`leaseDurationMs` and `executionTimeoutMs` are **worker options** (`worker.ts:24-25`), validated:
both positive integers, and `executionTimeoutMs <= leaseDurationMs` (`worker.ts:46-50`).
`leaseExpiresAt = leasedAt + leaseDurationMs` (`worker.ts:59`).

The execution timeout aborts the signal and rejects the race (`worker.ts:113-128`):
```ts
timeout = setTimeout(() => { controller.abort(); reject(new RunnerExecutionError('timeout', 'execution timed out')) }, timeoutMs)
await Promise.race([execution, timeoutPromise])
// finally: execution.catch(() => undefined)   ← orphaned executor swallowed
```
⚠️ **Subtle:** a timeout does **not** cancel the underlying work — the executor promise is
abandoned and may keep running detached. The lease window (outer) + an externally-triggered
recovery pass are the real safety net, not the abort.

## Retry & backoff ✅✅

**No defaults ship in the runner.** `maxAttempts` is a per-job field (`contracts.ts:48`, range
1–20). The backoff policy is injected; `createExponentialRetryPolicy` requires the caller to pass
`initialDelayMs`, `multiplier`, `maxDelayMs` and throws if `multiplier<=1` or
`maxDelayMs<initialDelayMs` (`retry-policy.ts:28-33`). Formula keyed on `retrySteps = attemptNumber-1`
(`retry-policy.ts:55-68`):
```ts
if (retrySteps === 0 || initialDelayMs >= maxDelayMs) return Math.min(initialDelayMs, maxDelayMs)
const stepsToCap = Math.ceil(Math.log(maxDelayMs/initialDelayMs) / Math.log(multiplier))
if (retrySteps >= stepsToCap) return maxDelayMs
return Math.min(Math.trunc(initialDelayMs * multiplier**retrySteps), maxDelayMs)
```
`scheduledAt = failedAt + delayMs`. Defaults that *do* exist come from admin runtime settings via
`daemon-runtime.ts:31-35` (consistent with the no-hardcoded-config principle).

## Recovery — `executeExpiredLeaseRecovery` ✅✅ (`repository.ts:546`)

Scans `status='leased' AND lease_expires_at <= cutoff` ORDER BY expiry LIMIT 1000. Per row, fetches
the latest `running` attempt (`getRunningAttemptForJob`, `repository.ts:882`). Three branches:

1. **Orphaned** (no running attempt, `:563-579`): audit `runner.recovery.orphaned-lease` then
   `continue` — **NO state change.** ⚠️ The job stays `leased` with unchanged `lease_expires_at`, so
   it **re-matches the scan forever and never progresses.** ✅✅ (Reachable only if the attempt row is
   missing/not-`running` — an inconsistent state the engine doesn't normally produce, but recovery
   doesn't repair it either.)
2. **Requeue** (`attemptCount < maxAttempts`, `:581-633`): job → `queued`, `scheduledAt=now`, attempt
   → `failed`/`timeout`, audit `runner.recovery.requeued`.
3. **Dead-letter** (else, `:635-711`): job → `dead-lettered`, dead-letter row (`replayEligible:true`,
   `source:'failed-step'`, deterministic id `dead_letter_<sha256(attemptId)[:32]>`), audit
   `runner.recovery.dead-lettered`.

`planExpiredLeaseRecovery` (`repository.ts:517`) is the **read-only** sibling: lists *all* expired
leases as requeue candidates with no attempt check and no mutation — so plan and execute can
**disagree** (plan says requeue; execute orphan-skips).

⚠️ **Recovery has no automatic timer** ✅✅ — nothing in the daemon/worker calls it; it has **no
non-test caller anywhere** in the repo. Recovery only runs if some external code invokes it. (Today
nothing does — ties to finding [F5](./90-parity-findings.md): the daemon itself is never booted.)

## Retention — `pruneRunnerData` ✅✅ (`retention.ts:12`)

One transaction deletes exactly three things (`retention.ts:22-40`):
```sql
DELETE FROM opzava_runner_operational_events WHERE occurred_at < ?
DELETE FROM opzava_runner_dead_letters        WHERE stored_at  < ?
DELETE FROM opzava_runner_jobs WHERE status='succeeded' AND updated_at < ?
```
⚠️ **Intentionally never deletes:** `opzava_runner_attempts` (attempts accumulate unbounded and
orphan after their job is gone), non-`succeeded` jobs (dead-lettered/leased/queued retained
regardless of age), and reservations. Only non-test caller:
`POST /api/ops/maintenance/prune` (`route.ts:34`).

⚠️ **`pruneRunnerData` is the ONE runner-zone write that does NOT use `BEGIN IMMEDIATE`** — it uses
a plain deferred `db.transaction` (`retention.ts:22`). This is the correction pass 2 made to the
pass-1 claim "*all* repository writes use IMMEDIATE": true for the `RunnerRepository` object's
methods, false for the zone's retention write.

## Persistence

5 tables (DDL `migrations.ts:33-96`, all ✅ verified directly). Each row stores the canonical object
in `record_json`; the other columns are **denormalized projections** used only as query indexes,
and `superRefine`s assert they never drift from `record_json`:

| table | PK / unique | projection-consistency superRefine |
|-------|-------------|-------------------------------------|
| `opzava_runner_jobs` | PK `job_id`; `idempotency_key UNIQUE` | status/workflowRunId/stepRunId/idempotencyKey must equal nested job (`repository-contracts.ts:32-48`) |
| `opzava_runner_attempts` | PK `attempt_id`; `UNIQUE(job_id,attempt_number)` | jobId/attemptNumber match (`:57-64`) |
| `opzava_runner_dead_letters` | PK `dead_letter_id` | workflow/step/replayEligible match (`:75-87`) |
| `opzava_runner_operational_events` | PK `record_id` | per-kind `occurredAt` rule: external-call → `finishedAt??startedAt`; cost → `recordedAt`; audit → `event.occurredAt` (`:103-143`) |
| `opzava_runner_external_call_reservations` | PK `idempotency_key` | **no storage schema, no RunnerRepository method touches it** (created by migration `_003` only) |

⚠️ **Audit `record_id` is content-derived** ✅✅ (`repository.ts:843`):
`operational_event_audit_<sha256(action:targetId:occurredAt)[:32]>`, inserted via a **plain INSERT,
not an upsert** (`repository.ts:828-840`). Two audits with identical `(action,targetId,occurredAt)`
collide on PK and **throw `SQLITE_CONSTRAINT`** — e.g. two recovery passes with the same `generatedAt`
re-auditing the same orphaned job.

## Concurrency & exactly-once ✅✅

`runImmediateTransaction` (`repository.ts:910-926`) runs `tx.immediate()` (`BEGIN IMMEDIATE`) and
retries **once** on `SQLITE_BUSY` (`IMMEDIATE_TRANSACTION_MAX_ATTEMPTS = 2`, `repository.ts:81`).
The author explicitly disclaims multi-worker safety (`repository.ts:80`: *"a local contention guard,
not proof of multi-worker safety"*). Five methods use it: `saveJob`, `leaseNextJobForAttempt`,
`recordAttemptSuccess`, `recordAttemptFailure`, `executeExpiredLeaseRecovery`. Exactly-once anchors:
- `idempotency_key … UNIQUE` (`migrations.ts:39`) — producer-side enqueue dedup.
- `UNIQUE(job_id, attempt_number)` (`migrations.ts:59`) — double-lease guard.
- `assertLeasedJobWithRunningAttempt` — rejects a late finish after recovery moved the job.

> Context (outside zone): the shared DB sets WAL + `busy_timeout=5000` (`db.ts:46-52`), so the real
> busy budget is larger than the 2-attempt loop alone implies. ✅

## `ensureSchema` vs the migration runner ✅✅

`ensureSchema` (`repository.ts:105-111`) applies only `_001` (`applyOpzavaRunnerRepositorySchema`)
and `_002` (`applyOpzavaRunnerJobPrioritySchema`) — **never `_003`** (reservations) and never touches
`schema_migrations`. So a repository-only consumer that skips `runMigrations` gets 4 tables, not 5.
**In the real app this is moot**: `db.ts:69-70` runs `registerOpzavaRunnerMigrations()` then
`runMigrations(db)`, which iterates all 3 runner migrations including `_003` before any repository
call — so a normally-booted app *does* have the reservations table.

## Subtleties a casual read gets wrong (carry these into any parity comparison)

1. `failed` = dead **job** status but normal **attempt** status — never conflate.
2. The retry/dead-letter decision is made twice (worker pre-decides from the leased snapshot
   `worker.ts:76,84`; repository re-decides from the current row `repository.ts:333`) and they agree
   only because `attemptCount` is incremented once at lease and never re-touched.
3. `planExpiredLeaseRecovery` ≠ `executeExpiredLeaseRecovery` (list-all vs orphan/requeue/dead-letter).
4. Timeout abandons but does not cancel the executor.
5. Retention leaves attempts + non-succeeded jobs forever.
6. No retry/lease/backoff defaults live in this zone — all injected.
7. `saveJob` persists the caller's status; its transition check is validation-only.
