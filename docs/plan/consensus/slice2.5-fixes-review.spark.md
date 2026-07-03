# Slice 2.5 Fixes Adversarial Review (`77b0da4..HEAD`)

Scope: `packages/project-management/src/application/issues.ts`, `packages/identity-access/drizzle/0008_slice25_issue_outbox_hardening.sql`, `apps/web/lib/task-card-detail.ts`, `apps/web/components/connections/device-flow-poller.tsx`, `apps/web/lib/connections-state.ts`, `apps/web/lib/connections.ts`, `apps/web/lib/issues.ts`, `apps/web/app/(app)/issues/actions.ts`, and related tests.

Verdict: **SOUND-WITH-FIXES**

## Findings

1. **[high] Outbox reclaim race can overwrite newer state and lose close success**
   - **file:line:** `packages/project-management/src/application/issues.ts:1007-1019`
   - **failure:** A reclaimed row is protected during claim (`FOR UPDATE SKIP LOCKED`) and stale `processing` detection, but the final per-entry updater does **not** re-check claim ownership. A worker that originally claimed a row can continue after another worker reclaimed the same stale row, and then overwrite `state`/`attempts`/`last_error`/`closed_at` from the old claim. In concrete terms, a row can be set back to `failed` after a second worker already marked it `closed`, which breaks “success should stay closed/never auto-reopen” assumptions.
   - **fix:** Persist a claim token (`claimed_at` snapshot or explicit claim id) on claim and include it in the final update `WHERE` (`and claimed_at = <snapshot>` plus optional `state='processing'`). Reject updates that are no longer the active owner, then optionally resurface a warning telemetry event for stale finalizers.

## Confirmed-correct implementations (brief)

2. **M1 assignee preservation is wired through session context and preserves current value**
   - `apps/web/lib/task-card-detail.ts:640-658` loads current card detail via `requireContext` + `getCardDetail` and passes `current.value.task.assigneeUserId` into `updateTask`, so no explicit clear/drop occurs.

3. **M2 polling lifecycle is bounded and terminal/expiry-aware**
   - `apps/web/components/connections/device-flow-poller.tsx:33-135` and `apps/web/lib/connections-state.ts:246-299` stop timer scheduling on terminal statuses and expiry (`stop: true`) and reset scheduling with `nextDeviceFlowPollDelayMs` for `intervalSeconds` hints (bounded to `>=2_000ms` and `<=60_000ms`).

4. **M3 role-gating covers all connection mutations**
   - `apps/web/lib/connections.ts:70-81` defines one role gate (`owner|admin`).
   - Every mutating helper calls it before provisioning calls: `connectModelProviderApiKeyForContext`, `startModelProviderDeviceFlowForContext`, `pollConnectionDeviceFlowForContext`, `disconnectModelProviderForContext`, `applyOrchestratorRolesForContext`, `startGitHubDeviceFlowForContext`, `disconnectGitHubForContext` (lines `382-503`).
   - `apps/web/app/(app)/connections/actions.ts:31-116` enforces the same check for UI action entry points.

5. **New issue idempotency is race-safe at DB level**
   - `packages/project-management/src/application/issues.ts:464-483` uses `INSERT ... ON CONFLICT (workspace_id, idempotency_key) DO NOTHING` with unique index in schema.
   - `packages/project-management/src/application/issues.ts:729-733` claims intent before the GitHub call, and returns the existing succeeded projection when present (`721-746`).
   - End-to-end wiring exists in the UI (`apps/web/app/(app)/issues/actions.ts:62-74`, `apps/web/app/(app)/issues/page.tsx:140`).

6. **Migration/RLS parity in 0008 appears consistent**
   - `packages/identity-access/drizzle/0008_slice25_issue_outbox_hardening.sql:73-98` adds `issue_close_outbox` lease columns and indexes, and keeps tenant context + force/owner/admin policies.
   - `...:26-63` creates `issue_create_intent` with composite workspace/org FK and unique key index.
   - This is also reflected in updated schema types in `packages/project-management/src/adapters/postgres/schema/issues.ts:69-171`.

7. **No direct regression signals observed for this range**
   - M1 coverage: `apps/web/test/task-card-detail.test.ts:647-673` now asserts assignee retention.
   - M2/M3 coverage: `apps/web/test/connections-page.test.ts:358-403`, `431-473` validates terminal behavior, slow-down scheduling, and mutation gating for non-admin callers.
   - Idempotency coverage: `apps/web/test/issues-page.test.ts:127-173` and `packages/project-management/src/__tests__/slice25e-issues.integration.test.ts:456-501`.
