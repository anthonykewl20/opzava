<!-- agent-context: read this before editing the module -->

# platform/admin-config

## Purpose
Owns the operator-tunable admin settings model (`OpzavaAdminSettings`), its SQLite persistence + in-transaction audit, the read-only projections of those settings into runtime options for the provider/runner execution layers, and the connection-config schemas (Resend, WordPress) that bind provider credentials to secret references. One capability: the audited source of truth for everything an operator can tune at runtime.

## Public surface
This is a **platform module — there is NO `index.ts` barrel.** `contracts.ts` is the public surface; the other files export their own public types/functions (the code is truth, import by file path). Counted exports below.

**`contracts.ts` (the public contract surface):**
- Constants: `ADMIN_CONFIG_SCHEMA_VERSION`, `DEFAULT_RUNTIME_SETTINGS_UPDATED_AT`, `DEFAULT_RUNTIME_SETTINGS_UPDATED_BY` (latter two live in `runtime-loader.ts`).
- Re-export from `core/secrets/contracts` (kept resolving for existing importers per ARD 0010): `SECRET_REFERENCE_KIND`, `secretReferenceSchema`, `SecretReference` (type), `createSecretReference`, `isSecretReference`.
- Schemas/types: `secretResolutionFailureSchema`, `SecretResolutionFailure`, `AuditSafeSecretResolutionFailure`, `AdminConfigValue`, `adminConfigRecordSchema`, `AdminConfigRecord`, `AuditSafeAdminConfigRecord`.
- Functions: `parseAdminConfigRecord`, `parseSecretResolutionFailure`, `redactAdminConfigRecordForAudit`, `redactSecretResolutionFailureForAudit`.

**`settings.ts` (the operator-tunable settings model):** `OPZAVA_ADMIN_SETTINGS_SCHEMA_VERSION`, `OpzavaAdminSettings`, `AuditSafeOpzavaAdminSettings`, `OpzavaAdminSettingsDiff`, `defaultOpzavaAdminSettings`, `parseOpzavaAdminSettings`, `redactOpzavaAdminSettingsForAudit`, `diffOpzavaAdminSettings`.

**`repository.ts` (persistence + in-tx audit):** types `AdminSettingsStorageRecord`, `SaveAdminSettingsInput`, `SaveAdminSettingsResult`, `AdminSettingsRepository`; factory `createAdminSettingsRepository(db)`.

**`runtime-options.ts` (read-only projections):** projection types `RunnerDaemonSettingsProjection`, `ProviderAdapterDefaultsProjection`, `ProviderLimitsProjection`, `OpzavaRuntimeOptionsProjection`; projectors `projectRunnerDaemonOptions`, `projectRetryPolicyOptions`, `projectProviderAdapterDefaults`, `projectProviderLimits`, `projectRuntimeOptions`.

**`runtime-loader.ts` (two loader variants):** types `RuntimeSettings`, `RuntimeSettingsUnavailable`, `RuntimeSettingsLoadResult`, `RuntimeSettingsLoader`, `RuntimeSettingsLoaderOptions`; factories `createStrictRuntimeSettingsLoader` (fail-fast) and `createLiveRuntimeSettingsLoader` (production send path, falls back to defaults at version 0).

**`resend-connection.ts` / `wordpress-connection.ts`:** `RESEND_CONNECTION_SCHEMA_VERSION`, `resendConnectionConfigSchema`, `ResendConnectionConfig`, `AuditSafeResendConnectionConfig`, `parseResendConnectionConfig`, `redactResendConnectionConfigForAudit`; `WORDPRESS_CONNECTION_SCHEMA_VERSION`, `wordpressConnectionConfigSchema`, `WordpressConnectionConfig`, `AuditSafeWordpressConnectionConfig`, `parseWordpressConnectionConfig`, `redactWordpressConnectionConfigForAudit`.

Total: ~17 exports from `contracts.ts`, ~8 from `settings.ts`, ~5 from `repository.ts`, ~10 from `runtime-options.ts`, ~7 from `runtime-loader.ts`, ~5 from each connection file. Anything not listed here is internal (`parseStorageRecord`, `flattenSettings`, the `assert*` helpers).

## Dependencies
- **Outbound** (what this imports):
  - `core/secrets/contracts` — `SecretReference` model (the root primitive; re-exported here for importer continuity). Sanctioned `platform → core/secrets` edge.
  - `platform/audit/contracts` — `parseAuditEvent`, `AuditEvent` (in `repository.ts`).
  - `platform/runner/retry-policy` — `ExponentialRetryPolicyOptions` type only (in `runtime-options.ts`).
  - `better-sqlite3` (type only, in `repository.ts`), `zod`.
  - Layering rule: platform may import core (via sanctioned interfaces) and sibling platform modules; never feature modules. This module obeys it — all outbound edges are core/secrets or platform siblings.
- **Inbound** (who imports this — do not silently break):
  - Feature module **content**: `modules/content/campaign/guarded-campaign-send-runtime.ts`, `modules/content/workflow/guarded-campaign-send-executor.ts`, and the provider live adapters / connection resolvers — `content/providers/resend-live-adapter.ts`, `resolve-resend-campaign-connection.ts`, `wordpress-live-adapter.ts`, `resolve-wordpress-draft-connection.ts`.
  - Thin routes in `src/app/api`: `api/ops/admin-settings/route.ts` (read/write), `api/settings/route.ts`. (The `providerSelection` / `providerCredentials` maps and the runtime loader feed the guarded live send path — see the live-execution guardrail below.)

## Invariants
1. **Secret sensitivity ⇒ SecretReference value.** `adminConfigRecordSchema` `.superRefine` rejects any record where `sensitivity === 'secret'` but `value` is not a `SecretReference` (`contracts.ts:64-72`). Every `providerCredentials` entry must also be a `SecretReference` (`settings.ts:43-52`).
2. **Provider credentials and connection keys carry the `provider-credential` scope.** `resendConnectionConfigSchema` enforces `apiKeyRef.scope === 'provider-credential'` (`resend-connection.ts:11-19`); `wordpressConnectionConfigSchema` enforces the same on `credentialRef` (`wordpress-connection.ts:15-23`). A wrong-scope secret reference is a parse failure, not a silent accept.
3. **Retry/backoff ordering.** `retrySettingsSchema` requires `maxDelayMs >= initialDelayMs` (`settings.ts:25-29`); `providerSettingsSchema` requires `burst >= requestsPerMinute` (`settings.ts:37-41`).
4. **Save writes the audit event in the same DB transaction as the settings upsert.** `repository.ts:72-123` — `saveSettings` wraps the version bump (`versionAfter = (previous ?? 0) + 1`), the UPSERT into `opzava_admin_settings`, and the INSERT into `opzava_admin_settings_audit_events` in a single `db.transaction(...)`. The settings table is a singleton keyed by `settings_id = 'singleton'`. An editor must not split the audit write out of the transaction.
5. **Two loader strategies, deliberately split.** `createStrictRuntimeSettingsLoader` returns `{ ok: false, error: { kind: 'unavailable', reason: 'not_persisted' } }` when nothing is persisted (`runtime-loader.ts:34-63`). `createLiveRuntimeSettingsLoader` is the **production live-send path** — it synthesizes `defaultOpzavaAdminSettings()` at **version 0** with `updatedAt = 1970-01-01T00:00:00.000Z` / `updatedBy = 'system:default'` so a fresh deploy can run provider sends before an operator persists anything (`runtime-loader.ts:71-101`). Both loaders still `assertPositiveInteger`/`assertValidDateString` on persisted metadata — corrupt persisted metadata throws, even in the live loader.
6. **All parsed records are frozen.** Every `parse*` and the audit `redact*ForAudit` helpers return `Object.freeze(...)`; treat all exported records as readonly.

## Harmony rules
- **Engine: opzava canonical (`src/opzava`).** This module lives entirely under `src/opzava/platform/admin-config` and obeys ARD 0007's engine separation. The one cross-engine note: `core/secrets` owns the pure `SecretReference` model; this module **re-exports** it from `contracts.ts` purely for importer continuity (per ARD 0010 realignment) — do not move the primitive back here. `repository.ts` persists only to opzava-owned tables (`opzava_admin_settings`, `opzava_admin_settings_audit_events`); it does not write across the engine boundary into `src/lib`.
- **Dead-surface / dead-wired:** none in this module. The SecretReference re-export is intentional surface, not dead code.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`. The applicable entries:

**Layering leaks (corrected in the realignment):**

- **❌→✅ core→platform leak:** `src/opzava/core/artifacts/contracts.ts` imported `isSecretReference` from `platform/admin-config/contracts` — an upward domain→infrastructure edge violating the Dependency Rule. Fixed by relocating the pure `SecretReference` model to `core/secrets` (see the realignment ARD).

> Editor note: this is why `contracts.ts` *re-exports* `SecretReference`/`isSecretReference` from `core/secrets` rather than owning them. The re-export is the migration seam — do not "simplify" it away or move the primitive back into this module; that would reintroduce the core→platform leak that ARD 0010 fixed.

(The "REFUTED — provider live-execution guard is bypassed" entry also bears on this module indirectly: `createLiveRuntimeSettingsLoader` is the loader the guarded production send path consumes. Do not add a second, parallel live-execution or settings-loading route — the live boundary stays the single production send path.)
