<!-- agent-context: read this before editing the module -->

# platform/runner

## Purpose
A durable, at-least-once job queue: `Job` → `Attempt` → `DeadLetter` with lease-based concurrency, retry policy, crash recovery, retention, and an operational-event store. This is the **real durable-execution model** for campaign sends (see guardrails); it is not yet a general per-step runner across the whole content workflow.

## Public surface
This is a **platform module**: it has **no `index.ts`**. `contracts.ts` is the public surface (the contracts/types truth); the store lives in `repository.ts` / `repository-contracts.ts` and the executor/worker in `worker.ts`. Anything not listed here is internal.

From `contracts.ts` (schema-versioned, frozen, immutable types):
- `RUNNER_CONTRACT_SCHEMA_VERSION` (const `1`)
- Schemas: `jobStatusSchema`, `jobSchema`, `retryDecisionSchema`, `attemptSchema`, `deadLetterSchema`
- Types: `JobStatus`, `Job`, `Attempt`, `DeadLetter`, `JobTransition`
- Parsers: `parseJob`, `parseAttempt`, `parseDeadLetter` (each `Object.freeze`s the result)
- State machine: `transitionJobStatus(job, transition)`

From `worker.ts` (execution model):
- Class `RunnerExecutionError` (carries `errorClass: 'timeout'|'provider-error'|'validation-error'|'permission-error'|'unknown'`)
- Types `RunnerExecutor`, `RunnerWorkerOptions`, `RunnerWorkerResult`, `RunnerWorker`
- Factory `createRunnerWorker(options)`

From `repository.ts` (the store): `RunnerRepository` (interface), `createRunnerRepository(db)`.
From `repository-contracts.ts`: storage-record schemas/types/parsers — `JobStorageRecord`, `AttemptStorageRecord`, `DeadLetterStorageRecord`, `OperationalEventStorageRecord`, `ReplayQuery`, `RunnerRecoveryPlan`, `RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION`, and their `parse*` functions. (Central store — pulls `audit`/`costs`/`providers` event schemas via the `operationalEventSchema` union.)
From `retry-policy.ts`: `RetryPolicy`, `createExponentialRetryPolicy(options)`.
From `daemon.ts`: `createRunnerWorker`'s polling driver `createRunnerDaemon(options)`.
From `maintenance-daemon.ts` / `retention.ts`: `runRunnerMaintenanceOnce`, `createRunnerMaintenanceDaemon`, `pruneRunnerData`.
From `migrations.ts`: `registerOpzavaRunnerMigrations`, `getOpzavaRunnerMigrations`, `applyOpzavaRunnerRepositorySchema`, `applyOpzavaRunnerJobPrioritySchema`, `applyOpzavaExternalCallReservationSchema`.

## Dependencies
- **Outbound** (what this imports): platform siblings via public API only — `platform/admin-config/contracts` (`isSecretReference`, for the secret-free payload guard), `platform/audit/contracts`, `platform/costs/contracts`, `platform/providers/contracts` (the operational-event union). Crosses the engine boundary **only** via the inherited migration registry: `migrations.ts` registers into `@/lib/migrations` (`registerMigrations`/`Migration`) — this is the sanctioned registration seam for `opzava_runner_001/002/003`, not a logic dependency. Layering rule: platform imports only core/platform siblings; the storage schemas deliberately re-import the sibling event contracts so the operational-event store is the single persistence point for audit+costs+external-call records.
- **Inbound** (who imports this — do not silently break):
  - `modules/content` (the only executing caller): `content/campaign/guarded-campaign-send-runtime.ts` (`createRunnerRepository` + `RunnerExecutor`), `content/campaign/run-approved-campaign.ts` (`createRunnerWorker`, `RunnerExecutor`), `content/workflow/campaign-runner-worker.ts`, `content/workflow/campaign-send-executor.ts`, `content/workflow/guarded-campaign-send-executor.ts`, `content/workflow/run-campaign-send-with-repository.ts`, `content/workflow/job-kind-executor.ts`, `content/steps/step-service.ts`.
  - `platform/providers`: `providers/provider-limit-executor.ts` (`RunnerExecutionError`, `RunnerExecutor`, `Job`, `Attempt`), and `providers/{approval,audit,cost,mock-execution,preflight}-events.ts` + `providers/execution.ts` reuse the `repository-contracts` operational-event storage records.

## Invariants
1. **Lease/status coupling is enforced by `superRefine`** (`contracts.ts:49-65`): `status === 'leased'` ⇒ `lease !== null`; any non-leased status ⇒ `lease === null`. The `lease` field is the *only* carrier of "this job is currently being executed." `attemptCount` may never exceed `maxAttempts` (`max(1..20)`).
2. **Job payloads and dead-letter snapshots must be secret-free.** `containsSecretReference` recursively walks the JSON payload and rejects any `SecretReference`-shaped value (`contracts.ts:62-64`, `121-128`). Secrets live in `admin-config`; never inline a secret reference into a queued payload.
3. **The job state machine is closed and throws on illegal transitions** (`contracts.ts:139-168`): allowed edges are `queued→{leased,cancelled}`, `leased→{queued,succeeded,failed,dead-lettered}`, `failed→{queued,dead-lettered}`, and `succeeded`/`dead-lettered`/`cancelled` are terminal (empty). `transitionJobStatus` re-parses through `parseJob`, so any transition also re-runs every `superRefine` above.
4. **Execution timeout must not exceed lease duration** (`worker.ts:48-50`): `createRunnerWorker` throws unless `executionTimeoutMs <= leaseDurationMs`, so a timed-out attempt always releases its lease before expiry. The retry-vs-dead-letter decision in `runNext` compares `attemptCount < maxAttempts`; at/over the cap the failure routes straight to a dead letter and `recordAttemptFailure` is called with `retryScheduledAt: null` + a `deadLetterId`.
5. **Recovery requeues expired leases; only `executeExpiredLeaseRecovery` can dead-letter** (`repository.ts`): `planExpiredLeaseRecovery` only ever returns `jobsToRequeue` (dead-letter list is empty). Requeue skips jobs already at `attemptCount >= maxAttempts` (`repository.ts:212`); the execute variant is what materializes dead letters. An expired lease = the process crashed mid-attempt; recovery must not silently drop it.
6. **Index columns must mirror the stored record** (`repository-contracts.ts`): every storage record's denormalized index (`statusIndex`, `workflowRunId`, `stepRunId`, `idempotencyKey`, `replayEligible`, `kind`, `occurredAt`) is `superRefine`-checked to equal the embedded record's value — SQLite indexes are query-only mirrors, never independent truth.

## Harmony rules
- **Engine:** opzava canonical (`src/opzava`). Tables are `opzava_runner_*` and owned here. The **only** crossing into the inherited engine is the **read/write registration seam** in `migrations.ts` → `@/lib/migrations` (`registerMigrations`); the runner does not call inherited `src/lib` logic at runtime. Per ARD 0007 the runner's maintenance daemon coexists with the inherited scheduler as two separate timers — engines are not merged (`maintenance-daemon.ts:9-12`).
- **Dead-surface / dead-wired warning (⚠️ PARTIAL):** the runner is **not** a general per-step runner. Job execution (draining the queue) is wired **only** through the campaign-send subsystem. Broader content-workflow steps do **not** run through it — do not assume every workflow step is durable. (See the guardrail below.)

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`:

> ## ⚠️ PARTIAL — "the durable runner was built but is unused"
>
> The durable runner IS used — but only by the **campaign-send subsystem**, not as a general
> per-step runner across the whole content workflow.
>
> - `createRunnerRepository` → `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`
> - `createRunnerWorker` → `src/opzava/modules/content/campaign/run-approved-campaign.ts`
>
> **Guardrail (runner MODULE.md):** `Job`/`Attempt` is the real durable-execution model for campaign
> sends; the broader workflow steps do not yet run through it. Do not assume every workflow step is
> durable.

> ## ✅ CONFIRMED — core `WorkflowRun`/`StepRun` machinery is dead surface
>
> `parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` in
> `src/opzava/core/workflows/contracts.ts` have **zero production consumers** (only their own
> `.test.ts`). `parseWorkflowDefinition` is the only wired export — used solely by
> `src/opzava/modules/content/workflow/content-workflow.ts:7,117`.
>
> **Guardrail (core/workflows MODULE.md):** do not "fix" or extend the run/step-run transition
> machinery assuming it drives execution — it does not. The runner's `Job`/`Attempt` is the execution
> model.
