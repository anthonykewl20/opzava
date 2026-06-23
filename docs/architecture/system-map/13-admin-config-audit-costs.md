# 13 — Admin Config · Secrets · Audit · Costs (deep)

> Zone: `src/opzava/platform/admin-config/` (+ `audit/`, `costs/`). The typed, validation-first backbone
> for operator config, secret indirection, audit trail, and cost accounting. Marks: ✅✅ = both passes
> (the F4/F6 fresh agents independently verified the load-bearing claims); 🔎→✅ = single-pass detail
> (schema/table) **re-checked & confirmed in the second pass** (all 🔎 claims held); ⚠️ = correction.
> See [`99-verification-register.md`](./99-verification-register.md).

## Admin config — `OpzavaAdminSettings`

A single versioned `.strict()` settings singleton (`admin-config/settings.ts`, `schemaVersion:1`). Groups
(✅ line-cited by the F6 agent):
- **`runner`** (`settings.ts:14-18`): `idleDelayMs`, `errorDelayMs` (1e3..8.64e7), `shutdownGraceMs` (100..3e4).
- **`retry`** (`:20-29`): `initialDelayMs`, `multiplier` (1.000001..10), `maxDelayMs`, `maxAttempts` (1..20);
  refine `maxDelayMs ≥ initialDelayMs`.
- **`providers`** (`:31-41`): `requestTimeoutMs`, `requestsPerMinute`, `burst`, `usdPerHourLimit`,
  `usdPerDayLimit`; refine `burst ≥ requestsPerMinute`.
- **`providerSelection`** (`:63`): `Record<key,value>` model/endpoint *choice* (no secrets).
- **`providerCredentials`** (`:43-56`): `Record<providerId, SecretReference>` — schema `superRefine`s every
  value through `isSecretReference` and transforms via `secretReferenceSchema.parse`, so credentials can
  **only** be references, never cleartext.

Defaults (`defaultOpzavaAdminSettings()`, `:76-100` ✅): 1s/5s/10s runner; 60s/×2/10min/3-attempt retry;
30s timeout; 60 rpm burst 60; $100/hr $1000/day; empty selection/credentials.

**Storage** (`admin-config/repository.ts` ✅): table `opzava_admin_settings` (singleton row id
`'singleton'`; `version`, `updated_at`, `updated_by`, `record_json`). `saveSettings` runs in a transaction:
reads previous → `versionAfter = prev+1` → diffs via `diffOpzavaAdminSettings` → writes an `AuditEvent`
(`admin.settings.updated`, summary = changed *paths* only, never values) into
`opzava_admin_settings_audit_events` → upserts the row. Monotonic version; settings + audit can't diverge.

**Runtime loader + projection** ✅✅ (F6-verified): `createRuntimeSettingsLoader` → `loadRuntimeSettings()`
returns `{ok:false, error:'not_persisted'}` when no row exists, else projects via `projectRuntimeOptions`
(`runtime-options.ts:46`) into three narrow shapes: **runner** (idle/error delays), **retry**
(initial/multiplier/maxDelay), **provider** (timeout + retry.maxAttempts).

> ⚠️ **F6 (✅✅): `OpzavaAdminSettings` is unwired.** `createAdminSettingsRepository` and
> `createRuntimeSettingsLoader` have **zero non-test callers**; no HTTP route reads/writes the singleton
> (the inherited `/api/settings` route operates on a *different* key/value `settings` table). Operators
> have no product-UI path to set runner/retry/provider config — the runner falls back to defaults. And
> the rate/cost limits (`requestsPerMinute`, `burst`, `usdPerHourLimit`, `usdPerDayLimit`) are **not even
> projected** into runtime options (`runtime-options.ts:46` emits only runner/retry/provider-timeout) — so
> no consumer could enforce a budget/rate cutoff even if the loader were wired. The limits are inert config.

## Secret references & redaction

**`SecretReference`** (`admin-config/contracts.ts:6-13` ✅): `.strict()` `{kind:'SecretReference', id,
scope ∈ {provider-credential, webhook-secret, gateway-credential, operator-secret}, purpose}`. A pointer —
no value. `isSecretReference` (`:80-82`) is the guard used everywhere ("credentials must be references").
`AdminConfigRecord` (`:42-66`) carries a `superRefine`: `sensitivity==='secret'` ⇒ `value` must be a
`SecretReference`. (✅ This generic record type has **no table/repository** — a contract for a future
generic store, unused at runtime.)

**Secret-resolution boundary** ✅✅ (F4-verified): `resolveProviderCredentialForRequest`
(`providers/credentials-runtime.ts:39-77`) is the single place a cleartext `secretValue` materializes:
mock → `null`; live → requires `credentialRef`, calls `resolver.resolveSecret(reference)`. `SecretResolver`
(`:16-18`) is an **interface with only test doubles — no production implementation exists**. ⚠️ On the
actual live path, secrets are read **cleartext** from the inherited `settings` table by
`modules/content/providers/connection-settings-resolver.ts`; `resolveProviderCredentialForRequest` is never
called on any wired path. The `credentialRef` on a live profile is a dead literal (e.g.
`createLiveResendProviderProfile('resend_api_key')`). → See [F4](./90-parity-findings.md).

**Redaction** ✅: a `redact*ForAudit` family collapses secret fields to `` `[secret-reference:<scope>]` ``
(`redactAdminConfigRecordForAudit`, `redactOpzavaAdminSettingsForAudit` — defined but currently test-only;
`redactSecretResolutionFailureForAudit` is the one used live, in `providers/preflight-events.ts:80`). There
are no separate connection-config redactors.
Belt-and-braces: `auditEventSchema.superRefine` (`audit/contracts.ts:34-38`) **rejects at parse time** any
audit event whose summaries contain a `SecretReference` — so even an un-redacted summary can't be persisted.

## Audit — `AuditEvent`

`audit/contracts.ts:21-38` (✅), `.strict()`, `schemaVersion:1`: `{auditEventId, actorId, action, target:
{kind,id}, beforeSummary, afterSummary, correlationId, occurredAt}`. Summaries are nullable JSON guarded by
the no-secret-reference refine. Writers: admin-settings mutations (`admin.settings.updated`); provider
executions (`provider.execution.recorded`, allow-listed summary); provider preflight failures (redacted
cause); runner-internal audits (`runner/repository.ts`, deterministic content-derived id).

⚠️ **Two parallel audit systems** (✅): opzava `AuditEvent` (operational events + the admin-settings audit
table) vs the **inherited** `audit_log` table written by `logAuditEvent` (`src/lib/db.ts`) and surfaced by
the Audit Trail panel via `/api/audit`. They share **no** storage; opzava admin-settings audits do not
appear in the product Audit Trail panel today.

## Costs — `CostEvent`

`costs/contracts.ts:6-19` (✅), `.strict()`, `schemaVersion:1`: `{costEventId, workflowRunId,
stepRunId|null, externalCallId|null, providerId, operation, units:Record<string,int≥0>,
estimatedCostCents:int≥0, actualCostCents:int≥0|null, currency:len3, recordedAt}`. Writer:
`providers/cost-events.ts` wraps a `CostEvent` into a `kind:'cost'` operational event (caller-driven — see
[12](./12-providers-infra.md), F1). **Read-model:** `runner/cost-queries.ts` →
`listRecentCostEvents` (`SELECT … WHERE kind='cost' ORDER BY occurred_at DESC LIMIT ≤200`) +
`summarizeCostEvents` (sums estimated + actual). Surfaced via `GET /api/ops/costs` → `ops-costs-panel`.

⚠️ `summarizeCostEvents` silently skips null `actualCostCents` (✅): an estimate-only run reports
`actualCostCents:0`, which can mislead a dashboard if not labelled "estimated only."

## Persistence (this zone)

| table | columns | created by |
|-------|---------|-----------|
| `opzava_admin_settings` | `settings_id` PK (`'singleton'`) · `version` · `updated_at` · `updated_by` · `record_json` | `admin-config/repository.ts` (lazy) ✅ |
| `opzava_admin_settings_audit_events` | `audit_event_id` PK · `occurred_at` · `record_json` (idx is composite `(occurred_at, audit_event_id)`) | same ✅ |

Audit + cost events **at runtime** are NOT in this zone's tables — they're persisted into the shared
`opzava_runner_operational_events` (`kind: 'audit' | 'cost'`). There is **no** secret-value table; secret
values live entirely outside, behind the (unimplemented) `SecretResolver` interface.

## Findings carried to the audit checklist

- **F4** ✅✅ — no production `SecretResolver`; live secrets cleartext from `settings`; `credentialRef` decorative.
- **F6** ✅✅ — `OpzavaAdminSettings` unwired; rate/cost limits not projected → inert.
- Two parallel audit systems (opzava `AuditEvent` vs inherited `audit_log`) with no shared storage — ✅.
- `AdminConfigRecord` generic config-cell type has no table/repository — dead-code-adjacent contract — ✅.

## Subtleties for parity comparison

1. Config-as-source-of-truth is *designed* (strict schema, secret references, monotonic versioned audit) but
   *unreachable* — no UI/route persists it. Capability ≠ wired.
2. Secrets are references in the *schema* but cleartext on the *live path* — the guarantee holds on paper,
   not at runtime.
3. Two audit trails and (see [50](./50-inherited-agent-task.md)) two cost surfaces — reconciliation is a
   product decision, not a code detail.
