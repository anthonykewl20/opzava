<!-- agent-context: read this before editing the module -->

# platform/providers

## Purpose
The external-call engine. Owns the single guarded path that takes a provider call from a validated request to a durable, idempotent `ExternalCallRecord`, enforcing preflight, credential resolution, approval, limits, and the adapter boundary along the way. The `ProviderAdapter` contract is the seam where live third-party I/O is plugged in.

## Public surface
This is a **platform module**, so it has **no `index.ts`**. `contracts.ts` is the public surface (the truth); anything else is internal. The remaining 18 non-test files are implementation runtimes/events the caller wires in by direct import.

`contracts.ts` exports (count: 20) — grouped:
- **Schema-version constants**: `PROVIDER_PROFILE_SCHEMA_VERSION`, `EXTERNAL_CALL_SCHEMA_VERSION`, `PROVIDER_ADAPTER_REQUEST_SCHEMA_VERSION`, `PROVIDER_ADAPTER_RESULT_SCHEMA_VERSION`.
- **Types (model)**: `ProviderProfile`, `AuditSafeProviderProfile`, `ProviderAdapterRequest`, `AuditSafeProviderAdapterRequest`, `ProviderAdapterResult`, `ProviderAdapter` (`execute: (request, signal: AbortSignal) => Promise<ProviderAdapterResult>`), `ExternalCallRecord`.
- **Schema**: `externalCallRecordSchema`.
- **Parsers / factories**: `parseProviderProfile`, `parseExternalCallRecord`, `parseProviderAdapterRequest`, `parseProviderAdapterResult`, `createExternalCallRecordFromProviderAdapterResult`.
- **Audit redaction**: `redactProviderAdapterRequestForAudit`, `redactProviderProfileForAudit`.

The runtime files (`live-approval-runtime.ts`, `live-execution-runtime.ts`, `execution.ts`, `preflight-runtime.ts`, `credentials-runtime.ts`, `request-runtime.ts`, `approval-runtime.ts`, `external-call-reservation.ts`, `external-call-lookup.ts`, `limit-enforcement.ts`, `provider-limit-executor.ts`, `provider-usage-reader.ts`, `env-secret-resolver.ts`, `mock-execution-runtime.ts`, plus the `*-events.ts` emitters) are the assembly this module wires together; their exported functions/types are the construction kit, not a stable second API.

## Dependencies
- **Outbound** (what this imports):
  - `core/approvals` (`approval-runtime.ts` imports `Approval`, `isApprovalGranted` from `@/opzava/core/approvals/contracts`) — **the ONE sanctioned `platform → core` edge** in the whole opzava graph; intentional (the approval gate). See `docs/architecture/dependency-graph.md`.
  - `platform/admin-config/contracts` (`contracts.ts`, `credentials-runtime.ts`, `preflight-runtime.ts`) for `SecretReference` / `secretReferenceSchema` / `isSecretReference` / `SecretResolutionFailure`; `platform/admin-config/runtime-loader` (`preflight-runtime.ts`) for `RuntimeSettingsUnavailable`.
  - `platform/runner/repository-contracts` (`execution.ts`) for `parseOperationalEventStorageRecord` / `OperationalEventStorageRecord` (the durable event envelope).
  - `better-sqlite3` (`external-call-reservation.ts`) for the atomic idempotency reservation.
  - Layering rule: platform → (core + sibling platform via public API) only. No `modules → providers` reverse edge; no `core → platform` edge except the sanctioned approval import.
- **Inbound** (who imports this): `content` — specifically the campaign-send subsystem (`src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts` → `src/opzava/modules/content/workflow/guarded-campaign-send-executor.ts` → `guardLiveProviderExecutionAfterPreflight`). That is the **only production caller** of the live path.

## Invariants
1. **The adapter never sees credentials.** The live lifecycle order is fixed in `live-approval-runtime.ts::guardLiveProviderExecutionAfterPreflight`: `preflight` (builds request + resolves credential) → `credentials` (inside preflight, via `credentials-runtime`) → `approval` (`evaluateProviderExecutionApproval`) → `live-execution` (only when `liveExecution` handoff is supplied) → adapter call → `external-call` event. The resolved `credential` is consumed by the caller/runner, not threaded into `ProviderAdapter.execute` — which receives only the validated `ProviderAdapterRequest` + an `AbortSignal`.
2. **Secret references are forbidden in payloads.** `contracts.ts` superRefines reject any `SecretReference`-shaped value inside `request.input`, `request.requestSummary`, and result `output`/`outputSummary` (`containsSecretReference` recurses). Live profiles additionally **require** a `SecretReference` `credentialRef`; mock profiles must not carry one that fails the reference check.
3. **Adapter results are status/error-coupled.** `succeeded` ⇒ `error === null`; any non-`succeeded` status ⇒ `error !== null` (enforced in `providerAdapterResultSchema` superRefine). `external-call-reservation`: `status === 'pending'` ⇒ `finishedAt === null`; completed ⇒ `finishedAt` set.
4. **Approval narrowing is intentional.** `approval-runtime.ts:67` accepts only `target.kind === 'external-action'` (core allows `'artifact'` too) and requires a non-null `expiresAt`; the approval must match both the target id and `requestedAction`. The grant bound to a request must match its exact `providerId` **and** `operation` (`live-execution-runtime.ts` returns `grant-provider-mismatch` / `grant-operation-mismatch` otherwise — "unreachable in practice" but surfaced, never coerced to success).
5. **Exactly-once is opt-in via the reservation port.** Without a `reservation`, the boundary relies on the caller's `ExistingExternalCallLookup` fast-path (at-least-once lookup). With a `reservation`, the SQLite `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING` (`changes === 1` wins) serializes two concurrent callers; a thrown execution **releases** the reservation so the key is not poisoned, and a non-`succeeded` result releases it so a retry can win again. A `succeeded` result keeps the reservation.

## Harmony rules
- **Engine: opzava canonical (`src/opzava`).** No imports from `src/lib`. The module lives entirely under `src/opzava/platform/providers`; the only cross-engine touchpoints are the `better-sqlite3` handle (injected, not a `src/lib` import) and the inherited table names the runner owns. See ARD 0007 and `test/engine-boundary.test.mjs`.
- **Guarded send IS the production path — do not add a second live route.** All live provider calls must go through `guardLiveProviderExecutionAfterPreflight` (→ `executeApprovedLiveProviderActionOnce` → `executeProviderAdapterWithEvents`). No mock-first-only, no parallel live-execution route.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md` (entries that apply to this module):

> ## ❌ REFUTED — "the provider live-execution guard is bypassed / mock-first only"
>
> An older system-map finding asserted the live send path bypasses the safety guard and only the mock
> path was wired. **No longer true.** The guarded send path is wired into production:
>
> - `src/app/api/campaigns/[id]/run/route.ts` → `createGuardedCampaignSendExecutorForCampaign`
> - → `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`
> - → `src/opzava/modules/content/workflow/guarded-campaign-send-executor.ts` → `guardLiveProviderExecutionAfterPreflight`
>
> **Guardrail (content / providers MODULE.md):** the live boundary *is* the production send path. Do
> not add a second, parallel live-execution route; all live provider calls go through the guarded
> executor.

> ## ✅ CONFIRMED — approval-runtime narrows `target.kind` to `external-action`
>
> `src/opzava/platform/providers/approval-runtime.ts:67` rejects any `target.kind !== 'external-action'`,
> while `src/opzava/core/approvals/contracts.ts:15-16` allows both `'artifact'` and `'external-action'`.
>
> **Guardrail (core/approvals + providers MODULE.md):** the provider layer intentionally narrows the
> core contract. An `artifact`-targeted approval is core-valid but cannot gate an external provider
> call. Accepted narrowing, not a bug — flag it, do not "fix" by widening the provider path.
