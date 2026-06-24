<!-- agent-context: read this before editing the module -->

# platform/costs

## Purpose
Owns the opzava `CostEvent` contract (integer **cents**, ISO-4217 currency) and the unified cost **READ surface** that merges the opzava runner's cost events with Engine A's (inherited) `token_usage` USD spend into one read model. Per ARD 0007 ("separate engines, unified surfaces"), neither engine imports the other; this module is the sanctioned read-only composition layer.

## Public surface
Platform module — **no `index.ts`**. `contracts.ts` is the public contract surface; the two `unified-cost-*` files complete the read surface. The files are truth (3 source files, **11 exports**).

**`contracts.ts`** (4 exports) — the contract:
- `COST_EVENT_SCHEMA_VERSION` (const `1`) — schema version literal.
- `costEventSchema` — `z.object(...).strict()` Zod schema. Costs are `safeNonNegativeIntegerSchema` (`z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)`), `currency` is `z.string().length(3)` (ISO-4217), `actualCostCents` is nullable, `units` is a record of non-negative safe ints.
- `type CostEvent` — `Readonly<z.infer<typeof costEventSchema>>`.
- `parseCostEvent(input: unknown): CostEvent` — validates and returns `Object.freeze(costEventSchema.parse(input))`.

**`unified-cost-summary.ts`** (5 exports) — pure projection (no DB):
- `type EngineACostContribution`, `type UnifiedCostSummary` (frozen read models).
- `usdToCents(usd)` — `Math.round(usd * 100)` (round-half-up).
- `engineACostFromUsd(count, totalUsd)` — builds a frozen `EngineACostContribution`.
- `projectUnifiedCostSummary(opzava: CostSummary, inherited)` — merges into one frozen summary; `totalCount` and `totalCostCents` are the cross-engine totals (cents).

**`unified-cost-reader.ts`** (2 exports) — DB read composition:
- `readEngineACostContribution(db)` — reads `SELECT COUNT(cost_usd), COALESCE(SUM(cost_usd),0)` from inherited `token_usage`; returns a zero contribution when the table is absent (graceful degrade).
- `readUnifiedCostSummary(db)` — reads both engines and projects the unified summary via `projectUnifiedCostSummary`.

Anything else is internal.

## Dependencies
- **Outbound**: `runner/cost-queries` — `unified-cost-summary.ts` is a **type-only** back-dependency (`import type { CostSummary }`); `unified-cost-reader.ts` imports `listRecentCostEvents` / `summarizeCostEvents` at runtime. This is the only `costs ──> runner` edge and it is **not a cycle**: `runner` consumes the `CostEvent` *contract* (`repository-contracts.ts` → `../costs/contracts`), while `costs` consumes the runner's *query results* — no runtime cycle. Layering rule: platform → platform via public surface only (see `docs/architecture/dependency-graph.md`).
- **Inbound** (do not silently break): `platform/runner/repository-contracts.ts` (`costEventSchema`, `type CostEvent` — used to validate stored `'cost'` records); `platform/providers/cost-events.ts` (`COST_EVENT_SCHEMA_VERSION`, `parseCostEvent` — builds cost events from provider execution); `src/app/api/ops/costs/route.ts` (`readUnifiedCostSummary` — the only production caller of the unified read; returns `{ events, summary, unified }`).
- **Cross-engine read-seam** (not an import): `unified-cost-reader.ts` issues a read-only SQL query against inherited `src/lib` `token_usage`. It never writes across the boundary (ARD 0007, enforced by `test/engine-boundary.test.mjs`).

## Invariants
1. **Costs are INTEGER cents, never floats and never USD.** `estimatedCostCents` is a non-negative safe integer (required); `actualCostCents` is a non-negative safe integer *or* `null` (estimated-first model). `units` values are non-negative safe integers. `currency` is a 3-char ISO-4217 code. `contracts.test.ts` asserts rejection of negative costs, negative unit counts, and `> MAX_SAFE_INTEGER`.
2. **`.strict()` on the schema** — unknown keys are rejected. `parseCostEvent` deep-freezes the result (`Object.freeze`), so callers must treat `CostEvent` as immutable.
3. **This is the only platform `contracts.ts` with NO secret guard.** Unlike `admin-config/contracts.ts` or `core/secrets`, there is no `SecretReference` / `superRefine` sensitivity check — cost events carry no secret material. Do not add a secret field here without introducing a guard elsewhere.
4. **Unit normalization is one-directional (USD → cents) and round-half-up.** `usdToCents` uses `Math.round(usd * 100)`; the unified total is expressed in cents. Engine A's native `token_usage` is USD; opzava's is already cents. Never sum them without normalizing through `engineACostFromUsd`.
5. **The unified read must degrade, not throw, when the inherited table is absent.** `readEngineACostContribution` short-circuits to a zero contribution if `token_usage` doesn't exist (e.g. opzava-only test DB). Preserve this — the API route relies on it.

## Harmony rules
- **Which engine**: opzava canonical (`src/opzava`). This module lives in ENGINE B and is the sanctioned read-only bridge to ENGINE A's `token_usage` (USD). Per ARD 0007 and `test/engine-boundary.test.mjs`: the cross-engine touch is **read-only**; the boundary gate (team ↔ `src/lib`, the `agents` table) is untouched by this module.
- **Dead-surface / dead-wired**: none reported for `platform/costs`. The hint's "dead" warning was about the broader `core/workflows` run/step-run machinery (CONFIRMED dead surface) — not this module. The unified read surface **is** wired: `readUnifiedCostSummary` is called by `src/app/api/ops/costs/route.ts:17`.

## Editor guardrails
`docs/architecture/system-map/92-stale-findings.md` has **no dedicated CONFIRMED / PARTIAL / REFUTED entry for `platform/costs`**. The two applicable cross-cutting guardrails (copied verbatim from that ledger's framing):

> **Read-seams are read-only.** `audit`/`costs` read the inherited `audit_log`/`token_usage` tables for unified summaries but never write across the boundary (ARD 0007). — `dependency-graph.md` Notes, referencing 92-stale-findings "Verified 2026-06-24".

> The boundary gate (team ↔ src/lib, the `agents` table) is untouched by the costs read. — `test/engine-boundary.test.mjs` / ARD 0007.

No CONFIRMED trap in this module's own code to "fix"; treat the read-only read-seam and the cents/USD unit split as the invariants to preserve.
