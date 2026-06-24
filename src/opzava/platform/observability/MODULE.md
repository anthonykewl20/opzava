<!-- agent-context: read this before editing the module -->

# platform/observability

## Purpose
Centralized log shipping (aggregation). Decides whether a parsed pino log record should ALSO be shipped to an external aggregator and builds the structured envelope + buffered IO transport to send it. The endpoint is operator-configured (env), never hard-coded. This module owns the policy core and the IO half; it owns no network of its own.

## Public surface
This platform module has **neither `index.ts` nor `contracts.ts`** — its public functions are listed directly from the four source files (the files are truth). 4 files, 11 exported symbols grouped by file:

- **`log-shipping.ts`** (pure policy core — no IO, no ambient `process.env`):
  - `resolveLogShippingConfig(readEnv: EnvReader): LogShippingConfig`
  - `shouldShipLogRecord(config, levelValue): boolean`
  - `buildLogShipEnvelope(record, source): LogShipEnvelope`
  - types: `LogLevelName`, `LogShippingConfig`, `EnvReader`, `LogShipEnvelope`
  - const: `LOG_LEVEL_VALUES` (frozen pino numeric scale: trace=10…fatal=60)
- **`log-shipper.ts`** (IO half — buffers + flushes to an injected transport):
  - `createLogShipper(deps: LogShipperDeps): LogShipper` — returns `{ offer, flush, buffered }`
  - types: `LogShipTransport`, `LogShipperDeps`, `LogShipper`
- **`log-ship-transport.ts`** (concrete HTTP transport + env assembler):
  - `createHttpLogShipTransport(endpoint, fetchImpl): LogShipTransport`
  - `createLogShipperFromConfig(config, source, fetchImpl, onError?): LogShipper | null`
  - type: `FetchLike`
- **`log-ship-destination.ts`** (pino destination stream adapter):
  - `createLogShipDestination(shipper: LogShipper): Writable`

Anything not listed here is internal. The `.test.ts` siblings are not public surface.

## Dependencies
- **Outbound**: self-contained. The four source files import only each other (`./log-shipping`, `./log-shipper`) and `node:stream` (`Writable`). **No `src/opzava/core`, no sibling platform module, no `@/lib`** — declared in `docs/architecture/dependency-graph.md:97` ("observability ──> (self-contained; consumed by src/lib/logger)").
- **Inbound**: the **only** consumer is `src/lib/logger.ts` (`dependency-graph.md:101`), which imports `resolveLogShippingConfig`, `createLogShipperFromConfig` (+ `FetchLike`), and `createLogShipDestination`. Verified: no other importer exists under `src/`, `scripts/`, or `test/`. An editor must not silently break the logger's shipping composition (`logger.ts:26-37`).

## Invariants
1. **Fail closed on misconfiguration.** `resolveLogShippingConfig` sets `enabled` only when `isTruthyFlag(LOG_SHIP_ENABLED)` is truthy **AND** `LOG_SHIP_ENDPOINT` is non-empty (`log-shipping.ts:54-63`). A misconfigured deploy ships nothing — it never crashes. Do not relax this conjunction.
2. **No ambient `process.env`.** The policy core takes an injected `EnvReader`; the single `process.env` touch lives in the caller (`src/lib/logger.ts:26`, `(name) => process.env[name]`). Do not introduce `process.env` inside this module — it would break determinism/testing.
3. **Fail-open IO contract.** Shipping is observability, not correctness. In `flush()`, the buffer is drained (`splice`) **before** `await transport`, so records offered mid-flight land in a fresh batch (never shipped twice, never lost from the current batch); a transport throw is swallowed and surfaced only via `onError` (`log-shipper.ts:46-58`). A flaky aggregator must never break the logging app.
4. **Disabled ⇒ null, cheap skip.** `createLogShipperFromConfig` returns `null` when `!config.enabled || endpoint === null` so the logger can skip wiring (`log-ship-transport.ts:42-44`). A non-2xx HTTP response throws so the fail-open catch records it (`log-ship-transport.ts:27`).
5. **Malformed lines never break logging.** `createLogShipDestination` parses each pino line and swallows non-JSON/unparseable lines silently (`log-ship-destination.ts:13-22`); flush is fire-and-forget.

## Harmony rules
- **Which engine**: opzava canonical (`src/opzava`), but it is consumed across the engine boundary by the inherited `src/lib/logger.ts` (a read/injection seam, not a structural merge — ARD 0007). The `EnvReader` injection keeps the policy core engine-agnostic.
- **Dead-surface / dead-wired**: none. This module is fully live — its sole importer (`src/lib/logger.ts`) wires all three public functions into the central pino logger. No scaffolding here.

## Editor guardrails
The module has no CONFIRMED/PARTIAL/REFUTED trap of its own in `docs/architecture/system-map/92-stale-findings.md`. The one applicable entry is the folder-contract correction (the canonical contract once failed to acknowledge this module exists):

> **Folder-contract drift (corrected in P1)** — `docs/architecture/folder-structure.md` previously mandated folders that do not exist … **omitted `platform/observability/`**, and named a non-existent `outreach` module as an initial feature module. Corrected to match the real tree under code-is-truth. (`92-stale-findings.md`, "Folder-contract drift (corrected in P1)")

Guardrail: `platform/observability/` is a real, live module — keep it in the folder contract; do not let the documented structure drift away from it again.
