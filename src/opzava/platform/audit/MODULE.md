<!-- agent-context: read this before editing the module -->

# platform/audit

## Purpose
Owns the `AuditEvent` contract (the opzava-canononical shape every runner operational audit event must satisfy) and the unified audit READ surface that merges opzava runner audit events with the inherited Engine A `audit_log` table for one summary count. It is the audit half of the unified-surfaces split (ARD 0007), symmetric to the unified cost surface.

## Public surface
Platform modules have **no `index.ts`** — `contracts.ts` is the public surface for the contract and `unified-audit.ts` is the public surface for the read projections (both are imported directly by callers; the code is truth). **9 exports** across the two files.

From `contracts.ts` (contract — 4 exports):
- `AUDIT_EVENT_SCHEMA_VERSION` — `1 as const` literal.
- `auditEventSchema` — `z.object(...).strict().superRefine(...)`; the canonical parser.
- `AuditEvent` — `Readonly<z.infer<typeof auditEventSchema>>`.
- `parseAuditEvent(input: unknown): AuditEvent` — `Object.freeze`-sealed result of `auditEventSchema.parse`.

From `unified-audit.ts` (unified READ surface — 5 exports):
- `UnifiedAuditSummary` — `Readonly<{ opzavaCount; inheritedCount; totalCount }>` type.
- `projectUnifiedAuditSummary(opzavaCount, inheritedCount)` — pure merge into a frozen summary (`totalCount = opzavaCount + inheritedCount`).
- `readOpzavaAuditCount(db)` — count of `opzava_runner_operational_events` rows `WHERE kind = 'audit'`; **0 when the table is absent**.
- `readInheritedAuditCount(db)` — count of inherited `audit_log` rows; **0 when the table is absent**.
- `readUnifiedAuditSummary(db)` — reads both stores and projects the unified summary.

Anything else (e.g. the internal `containsSecretReference`, `tableExists`) is internal.

## Dependencies
- **Outbound** (what this imports): core/platform only — `isSecretReference` from `platform/admin-config/contracts` (for the secret-leak guard), and the `better-sqlite3` `Database` type from the read half. No module imports, no core-domain imports. Layering rule: platform may import sibling platform + core; this module holds the contract plus a read-seam — it must not import feature modules (`src/opzava/architecture.test.ts`).
- **Inbound** (who imports this — do not silently break):
  - `platform/admin-config/repository.ts` — `parseAuditEvent`, `AuditEvent` (writes audit events into the opzava store).
  - `platform/runner/repository-contracts.ts` — `auditEventSchema`, `AuditEvent` (parses `opzava_runner_operational_events` rows back into the contract).
  - `platform/providers/{approval-events,audit-events,preflight-events,mock-execution-runtime}.ts` — `AUDIT_EVENT_SCHEMA_VERSION`, `parseAuditEvent` (construct audit events at every operational seam).
  - `src/app/api/audit/route.ts` — `readUnifiedAuditSummary` (the HTTP unified-audit read).

## Invariants
- **No secret reference may appear in a summary.** `auditEventSchema.superRefine` recursively scans `beforeSummary`/`afterSummary` (arrays + nested objects via `containsSecretReference`, delegating to `isSecretReference`) and rejects with `message: 'audit summaries must not contain secret references'`. An editor adding a new summary field inherits this guard only if it flows through these two keys — do not bypass `parseAuditEvent` to construct an `AuditEvent`.
- **`AuditEvent` is frozen + readonly.** `parseAuditEvent` returns `Object.freeze(...)`; the type is `Readonly<...>`. Event objects must be treated as immutable by consumers.
- **`target` and the top-level object are `.strict()`.** Unknown keys are rejected — adding a field to the wire shape requires extending the schema, not just the call sites.
- **The read-seam never writes across the engine boundary.** `readInheritedAuditCount` only `SELECT`s `audit_log`; there is no `INSERT`/`UPDATE` into the inherited table anywhere in this module (ARD 0007). The opzava count and inherited count are merged purely (`projectUnifiedAuditSummary`); neither store imports the other.
- **Table-existence guarded, degrades to 0.** Both `readOpzavaAuditCount` and `readInheritedAuditCount` probe `sqlite_master` before querying; a missing table yields `0`, never a throw. The unified summary therefore never errors on a fresh or partially-migrated DB.

## Harmony rules
- **Which engine:** opzava canonical (`src/opzava`). The contract and the opzava half of the read live here; the inherited half is a sanctioned **read-seam** into Engine A (`src/lib`'s `audit_log`) per ARD 0007 and `test/engine-boundary.test.mjs`. The read is `==>` dotted (read-only), never a write across the boundary — see `docs/architecture/dependency-graph.md`.
- **Dead-surface / dead-wired:** none reported for this module in `docs/architecture/system-map/92-stale-findings.md`. The contract IS live (consumed by runner, admin-config, providers) and the unified read IS wired (`src/app/api/audit/route.ts`). Do not assume the runner's `Job`/`Attempt` is the only audit source — Engine A's `audit_log` is the other half and must stay merged in the unified count.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`. No module-specific CONFIRMED/PARTIAL/REFUTED entry targets `platform/audit`; the two adjacent ledger rules an editor of this module must respect:

- **✅ CONFIRMED — `expired`/`cancelled` approvals leave decision fields unconstrained** (`src/opzava/core/approvals/contracts.ts:32-41`): the approvals superRefine constrains only `requested`/`approved`/`rejected`; `expired` and `cancelled` fire neither branch, so `approverId`/`decisionReason`/`decidedAt` are unconstrained for them. **Guardrail:** known debt. Do not silently rely on or "tighten" these fields without a deliberate decision. (Relevant here because approval lifecycle audits flow through `parseAuditEvent`; the audit summaries mirror whatever the approvals layer produced.)

- **Read-seam rule (from `docs/architecture/dependency-graph.md`, Notes):** `audit`/`costs` read the inherited `audit_log`/`token_usage` tables for unified summaries but **never write across the boundary** (ARD 0007). Do not add a write path from this module into `audit_log`.
