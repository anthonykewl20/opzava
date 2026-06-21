# 12 — Provider Infrastructure (deep)

> Zone: `src/opzava/platform/providers/` (15 source files, ~1679 LOC). The shared contract every
> provider adapter obeys + the live-execution safety boundary. **Double-verified** (pass 1 + fresh
> adversarial deep-dive); structural facts also triple-checked by grep (see register). ✅✅ both passes,
> ⚠️ pass-2 correction.
>
> **Headline:** the entire live-execution guard chain is **dormant** — it has no production caller.
> The only wired path is the *mock* path. This is the deep substantiation of [F1](./90-parity-findings.md).

## Files (15)

| file | purpose | LOC |
|------|---------|-----|
| `contracts.ts` | Zod schemas for ProviderProfile / AdapterRequest / AdapterResult / ExternalCallRecord; the `ProviderAdapter` interface; audit redaction | 276 |
| `execution.ts` | Execute-with-timeout boundary: races adapter vs timeout vs abort; builds the `external-call` event | 144 |
| `live-execution-runtime.ts` | Exactly-once live exec: grant → lookup → optional reserve → execute → release-on-failure | 133 |
| `live-approval-runtime.ts` | Full live guard: preflight → mock-block → approval (always recorded) → handoff → audit receipt | 200 |
| `mock-execution-runtime.ts` | Mock-only exec: preflight → live-profile-block → execute | 159 |
| `preflight-runtime.ts` | Build runtime request + resolve credential | 60 |
| `request-runtime.ts` | Assemble AdapterRequest from runtime settings (timeout/retry defaults) | 64 |
| `credentials-runtime.ts` | Resolve live `SecretReference` → secret value; mock → null | 94 |
| `approval-runtime.ts` | Pure approval evaluation → grant or typed error | 158 |
| `external-call-lookup.ts` | Idempotency LOOKUP port (json_extract over operational events) | 43 |
| `external-call-reservation.ts` | Atomic reserve-or-skip port (INSERT…ON CONFLICT) | 46 |
| `approval-events.ts` / `audit-events.ts` / `preflight-events.ts` / `cost-events.ts` | Operational-event builders | 91/63/87/61 |

## ProviderAdapter contract ✅✅

```ts
export type ProviderAdapter = Readonly<{
  execute: (request: ProviderAdapterRequest, signal: AbortSignal) => Promise<ProviderAdapterResult>
}>                                                                            // contracts.ts:173-175
```
The adapter never sees credentials, never persists, never enforces timeouts — it gets a fully-validated
request + an `AbortSignal` and returns a typed result. Everything else is the surrounding stages.

**`ProviderAdapterRequest`** (`contracts.ts:75-102`, `.strict()`): `requestId`, `providerProfile`,
`operation`, `workflowRunId`, `stepRunId|null`, `idempotencyKey`, `timeoutMs(1..3.6e6)`, `retry`,
`input`, `requestSummary`, `startedAt`. Refinements:
- ✅✅ rejects any `SecretReference` in `input`/`requestSummary` (`:88-91`).
- ✅✅ `operation` must be in `providerProfile.config.allowedOperations` (`:93-101`, via `getAllowedOperations`);
  a missing/empty/non-string list itself fails.

**`ProviderAdapterResult`** (`:104-127`): `status ∈ {succeeded, failed, timed-out}`, `output|null`,
`outputSummary|null`, `error:{class ∈ {timeout, provider-error, validation-error, permission-error,
unknown}, message}|null`, `finishedAt`. `succeeded ⇒ error null`; non-succeeded ⇒ error present;
no secret refs in outputs.

**`ProviderProfile`** (`:26-50`): `kind ∈ {llm,publishing,search,email,gateway}`, `mode ∈ {mock,live}`,
optional `credentialRef`. ✅✅ `mode:'live'` **requires** a `credentialRef` that satisfies `isSecretReference`;
any present `credentialRef` must be a valid `SecretReference`. ⚠️ **Mock profiles are not *forbidden*
a credentialRef** — the schema only requires any present one to be valid; "mock must not have one" is a
module convention, not a schema rule.

## Execution lifecycle — the full live path ✅✅

`guardLiveProviderExecutionAfterPreflight(options)` (`live-approval-runtime.ts:64`):
```
1. preflight        createProviderExecutionPreflight        :67   (request-runtime + credential resolve)
     fail → append provider.preflight.blocked → return preflight-failed   :69-86
2. credential       resolveProviderCredentialForRequest     preflight-runtime.ts:42
     mock → null ; live missing ref → THROW invariant ; else resolve secret   credentials-runtime.ts:43-76
3. mock-block       if mode==='mock' → return unexpected-mock-profile   :89-98   (NO event emitted)
4. approval         evaluateProviderExecutionApproval       :100
     ALWAYS append provider.execution.approval.allowed|denied  :108-116   ✅✅
     !decision.ok → return approval-denied   :118
5. live-exec gate   if liveExecution===undefined → return live-execution-disabled   :129-139
6. reserve+execute  executeApprovedLiveProviderActionOnce   :141-150
     grant provider/op match :45-66 → idempotency lookup (succeeded? → already-executed) :69-76
       → reserve (SKIPPED — see below) :81-101 → executeProviderAdapterWithEvents :105-112
         → release-on-failure :116-126
7. record           executeProviderAdapterWithEvents builds ExternalCallRecord + appends external-call event   execution.ts:41-51
8. audit receipt    only on fresh 'executed' + recordedAudit identity → provider.execution.recorded   :180-192
```
Key excerpt (approval always recorded before branching):
```ts
options.eventSink.appendOperationalEvent(createProviderExecutionApprovalOperationalEvent({ ...decision }))  // :108-116
if (!decision.ok) { return { kind: 'approval-denied', cause: decision.error } }
```

## Mock vs live selection ✅✅

No automatic dispatcher — the **caller** picks the entrypoint; each hard-blocks the wrong mode *after*
preflight. ⚠️ **Asymmetric telemetry:** the mock runtime emits `provider.execution.blocked.live-profile`
when handed a live profile (`mock-execution-runtime.ts:62-69`), but the live guard emits **no event** when
handed a mock profile (`live-approval-runtime.ts:89-98`) — only one direction is observable.

## Exactly-once & idempotency ✅✅ (and where it's NOT closed)

**Lookup** (`external-call-lookup.ts:23-32`) — only a **succeeded** call short-circuits; **no functional
index** (full scan filtered by `kind`):
```sql
SELECT record_json FROM opzava_runner_operational_events
 WHERE kind='external-call'
   AND json_extract(record_json,'$.event.idempotencyKey')=?
   AND json_extract(record_json,'$.event.status')='succeeded'
 ORDER BY occurred_at ASC LIMIT 1
```
(The only index on that table is `(workflow_run_id, occurred_at, record_id)` — not used by this query.)

**Reservation** (`external-call-reservation.ts:29-38`) — atomic via the `idempotency_key` PK:
```sql
INSERT INTO opzava_runner_external_call_reservations (idempotency_key, external_call_id, reserved_at)
 VALUES (?,?,?) ON CONFLICT(idempotency_key) DO NOTHING
```
`changes===1` → `reserved`; else `already-reserved` (then a second lookup catches a winner that finished
in the gap → `already-executed`, else `reserved-elsewhere`).

⚠️ **The guard never passes `reservation`** ✅✅ (`live-approval-runtime.ts:141-150`) — so reserve-before-execute
is **unreachable on the guarded path**; the code's own comment says *"Unreachable while the guard injects
no reservation"* (`:172-173`). The lookup alone is racy (two callers both read null before either writes,
documented `external-call-lookup.ts:13-15`). The runner's atomic job lease is the only real concurrency
mitigation today.

⚠️ **Reservation has no TTL / cleanup** ✅✅: the table is `idempotency_key` PK + `external_call_id` +
`reserved_at`, the latter two **never read back**; a crash between reserve and release-on-failure orphans
the key permanently (`external-call-reservation.ts` has only INSERT + DELETE).

## Timeout / abort ✅✅

`executeAdapterWithTimeout` (`execution.ts:87-120`) races `adapter.execute` vs a timeout vs the caller's
abort; both timeout and abort fire the internal `AbortController`. Mapping (`execution.ts:70-85`):
- timeout → status `timed-out`, errorClass `timeout`
- abort (`ProviderAdapterAbortedError` or native `AbortError`) → `failed`, errorClass ⚠️ **`unknown`**
- any other throw → `failed`, errorClass **`provider-error`** (not `unknown`)

✅✅ The adapter can **never throw past this boundary** — every throw is caught and converted into a parsed
`ProviderAdapterResult` (`createFailureResult`, `:122-140`).

## Operational events emitted

| event (action) | kind | when | builder |
|---|---|---|---|
| `external-call` record | `external-call` | every completed adapter execution (mock or live) | `execution.ts:41-51` |
| `provider.preflight.blocked` | `audit` | preflight settings/secret failure | `preflight-events.ts:33-60` |
| `provider.execution.approval.allowed`/`.denied` | `audit` | live path, ALWAYS after the decision | `approval-events.ts:21-53` |
| `provider.execution.blocked.live-profile` | `audit` | mock entrypoint gets a live profile | `mock-execution-runtime.ts:129-159` |
| `provider.execution.recorded` (receipt) | `audit` | live path, fresh `executed` only | `audit-events.ts:23-50` |
| cost event | `cost` | ⚠️ **NOT here** — caller-driven by module executors | `cost-events.ts:25-52` |

⚠️ **Cost events are caller-driven** ✅✅: nothing in this zone guarantees a cost event per external call.
The module `*-execution.ts` wrappers append it separately after the call. (The live campaign send path
appends *no* cost event at all — ties to F1.)

## Persistence

Reads/writes two runner tables: `opzava_runner_operational_events` (via the injected `eventSink`; read by
the lookup's `json_extract`) and `opzava_runner_external_call_reservations` (INSERT/DELETE only, no SELECT).

## The dormancy finding ✅✅✅ (triple-checked)

`guardLiveProviderExecutionAfterPreflight`, `executeApprovedLiveProviderActionOnce`,
`createExternalCallIdempotencyLookup`, and `createExternalCallReservation` are referenced **only by test
files** (pass-1 research + pass-2 deep-dive + deterministic grep all agree). The single **wired** path is
the *mock* path: content module executors call `executeProviderAdapterWithEvents` directly and emit cost +
audit themselves. So the entire approval/reservation/exactly-once boundary is **dormant infrastructure** —
see [F1](./90-parity-findings.md).

## Subtleties for parity comparison

1. The provider safety boundary is real, correct, and **unreachable** — capability ≠ call-path.
2. Exactly-once is *designed* (lookup + reservation) but only the lookup is wired into the guard, and even
   that is unreachable; the practical guarantee today is the runner job lease.
3. `unknown` errorClass means abort specifically; a generic adapter throw is `provider-error`.
4. Mock profiles *may* legally carry a (valid) `credentialRef`; the "no credentialRef on mock" rule is
   convention, not schema.
5. No functional index backs the idempotency lookup — a scaling concern as the event log grows.
