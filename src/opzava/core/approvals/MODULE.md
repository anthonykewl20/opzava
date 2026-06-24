<!-- agent-context: read this before editing the module -->

# core/approvals

## Purpose
Owns the human-approval domain contract: a versioned, immutable `Approval` record, its status state machine, and the single SQLite persistence layer for approvals inside `core`. Defines what "approved" means and how an approval transitions; it does not decide *when* an external action may fire — that narrowing lives in `platform/providers`.

## Public surface
This is a **core domain** — there is **no `index.ts` barrel**. `contracts.ts` is the public surface (truth); `approval-repository.ts` is the only persistence layer inside `core`. Total public exports: **9** (`contracts.ts` = 8, `approval-repository.ts` = 1).

From `contracts.ts`:
- **Constants** — `APPROVAL_CONTRACT_SCHEMA_VERSION` (`1`).
- **Schemas / types** — `approvalStatusSchema`, `ApprovalStatus`; `Approval` (frozen, `approvalSchema`); `ApprovalDecision` (`approvalDecisionSchema`).
- **Functions** — `parseApproval(input: unknown): Approval`; `isApprovalGranted(approval: Approval): boolean`; `transitionApprovalStatus(approval: Approval, input: ApprovalDecision): Approval`.

From `approval-repository.ts`:
- **Factory** — `createApprovalRepository(db: Database.Database): ApprovalRepository` (the ONLY persistence layer inside `core`; pulls `better-sqlite3` as a direct import — table `opzava_approvals`, record stored as `record_json`).

Anything else (`requireDecisionFields`, `requireNoDecisionFields`, `approvalTransitions`, `approvalTargetSchema`) is internal. `contracts.test.ts` and `approval-repository.test.ts` are not public surface.

## Dependencies
- **Outbound**: `zod` (schema engine) and `better-sqlite3` (`Database.Database` typing only in `approval-repository.ts`). No opzava-internal imports — this is a leaf core domain. Layering rule: **core must not import platform or modules** (enforced by `src/opzava/architecture.test.ts`). It is a pure contract + its own persistence; it is *not* a root (depends on `better-sqlite3`), unlike `core/secrets`.
- **Inbound** (callers an editor must not silently break):
  - **modules** — `content` (workflow executor + recording executor, campaign-send-approval, guarded-campaign-send-runtime, human-approval-service, wordpress-draft-service), `social` (social-approval-service), `general-va` (va-approval-service).
  - **platform/providers** — `approval-runtime.ts`, `live-approval-runtime.ts` (the single sanctioned `platform → core` edge).
  - **app routes** — `api/ops/approvals/route.ts`, `api/ops/approvals/[id]/decide/route.ts` (uses `transitionApprovalStatus`), `api/campaigns/[id]/approve/route.ts`, `api/campaigns/[id]/run/route.ts`.

## Invariants
1. **Immutability + freeze on parse.** `parseApproval` returns `Object.freeze(approvalSchema.parse(input))`; `Approval` is `Readonly<...>`. Every repository read re-parses through `parseApproval` (`getApprovalById`, `listApprovals`) and every write re-parses before persisting (`saveApproval`). Persisted rows are the JSON of the validated object (`record_json`), so a stored approval always round-trips valid.
2. **Status state machine is one-way.** `approvalTransitions` allows `requested → approved | rejected | expired | cancelled`; the four terminal states have `[]` transitions. `transitionApprovalStatus` validates the edge and throws `invalid approval transition: <from> -> <to>` on any illegal move, then re-parses the merged record — meaning the transition is only committed if the *result* also passes `superRefine`.
3. **`requested` ⇒ decision fields null; `approved`/`rejected` ⇒ decision fields required.** `superRefine` (`contracts.ts:32-41`) rejects `approverId`/`decisionReason`/`decidedAt` being set on `requested`, and requires all three (non-null) on `approved`/`rejected`. `decisionReason` has a `min(1)` floor even when nullable, so a non-null reason can't be empty.
4. **Target is strict** `{ kind: 'artifact' | 'external-action'; id }` (`.strict()`), so extra keys fail validation. Both kinds are core-valid (see guardrail below for the provider narrowing).
5. **`schemaVersion` is a pinned literal** (`z.literal(APPROVAL_CONTRACT_SCHEMA_VERSION)`); bumping it is a breaking contract change that will reject every previously-persisted record.

## Harmony rules
- **Which engine**: opzava canonical `src/opzava` (Engine B). Framework-independent domain contract + its own SQLite table. No inherited `src/lib` dependency. Governed by ARD 0007 (`docs/ard/0007-engine-separation-and-surface-unification.md`) and `test/engine-boundary.test.mjs`.
- **Dead-surface / dead-wired**: none here — `core/approvals` is fully wired (consumed by content/social/general-va/providers and 4+ app routes). The dead-surface warning in the ledger applies to `core/workflows` run/step-run machinery, not this module.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`:

### ✅ CONFIRMED — approval-runtime narrows `target.kind` to `external-action`
`src/opzava/platform/providers/approval-runtime.ts:67` rejects any `target.kind !== 'external-action'`,
while `src/opzava/core/approvals/contracts.ts:15-16` allows both `'artifact'` and `'external-action'`.

**Guardrail (core/approvals + providers MODULE.md):** the provider layer intentionally narrows the
core contract. An `artifact`-targeted approval is core-valid but cannot gate an external provider
call. Accepted narrowing, not a bug — flag it, do not "fix" by widening the provider path.

### ✅ CONFIRMED — `expired`/`cancelled` approvals leave decision fields unconstrained
`src/opzava/core/approvals/contracts.ts:32-41` superRefine constrains only `requested` (no decision
fields) and `approved`/`rejected` (decision fields required). `expired` and `cancelled` fire neither
branch, so `approverId`/`decisionReason`/`decidedAt` are unconstrained for them.

**Guardrail (core/approvals MODULE.md):** known debt. Do not silently rely on or "tighten" these
fields without a deliberate decision.

> Companion note (from the contract, not the ledger): only `transitionApprovalStatus` re-parses the merged record on transition; a caller that hand-builds an `Approval` and passes it straight to `saveApproval` still goes through `parseApproval` in `saveApproval`, so the `superRefine` rules are enforced at the persistence boundary regardless of how the record was constructed.
