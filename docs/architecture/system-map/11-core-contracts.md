# 11 — Core Contracts (deep)

> Zone: `src/opzava/core/` — `workflows/`, `artifacts/`, `approvals/`. The framework-independent
> domain primitives every module builds on. **Double-verified** (pass 1 + fresh adversarial
> deep-dive). ✅✅ = both passes agree; ⚠️ = pass 2 corrected pass 1.

## Files

| file | purpose | LOC |
|------|---------|-----|
| `workflows/contracts.ts` | Workflow DAG definition + run/step-run state machines | 175 |
| `artifacts/contracts.ts` | Artifact base contract; no-secret + lineage validation | 63 |
| `approvals/contracts.ts` | Approval contract + decision/transition rules | 94 |
| `approvals/approval-repository.ts` | SQLite-backed approval persistence | 83 |

## Workflow model ✅✅

**Status enums** (`workflows/contracts.ts:5-21`):
- `WorkflowRunStatus`: `queued · running · blocked · succeeded · failed · cancelled`
- `StepRunStatus`: `pending · running · blocked · succeeded · failed · skipped`

**`WorkflowStep`** (`:26-31`, `.strict()`): `stepId(1..100)`, `displayName(1..120)`,
`kind ∈ {manual-input, artifact-transform, provider-call, approval-gate, external-action}`,
`nextStepIds: str(1..100)[]`.

**`WorkflowDefinition`** (`:33-67`): `schemaVersion:1`, `workflowId`, `version:int>0`, `displayName`,
`entryStepId`, `steps[≥1]`, `allowedInputArtifactTypes[≥1]`. **`WorkflowRun`** (`:71-81`): adds
`runId`, `workflowVersion` (pinned to the definition version the run started against), `status`,
`actorId`, `currentStepId|null`, `startedAt|null`, `finishedAt|null`. **`StepRun`** (`:83-93`):
`stepRunId`, `runId`, `stepId`, `status`, `inputArtifactIds[]`, `outputArtifactIds[]`,
`attemptCount≥0`, `failureReason|null`.

Transition tables (`:99-115`):
```ts
workflowRunTransitions = { queued:['running','cancelled'], running:['blocked','succeeded','failed','cancelled'],
                           blocked:['running','failed','cancelled'], succeeded:[], failed:[], cancelled:[] }
stepRunTransitions = { pending:['running','skipped'], running:['blocked','succeeded','failed'],
                       blocked:['running','failed'], succeeded:[], failed:[], skipped:[] }
```
```
WorkflowRun: queued ⇄ running ⇄ blocked ; running/blocked → failed ; any → cancelled ; succeeded/failed/cancelled terminal
StepRun:     pending → running ⇄ blocked ; running → succeeded/failed ; pending → skipped ; terminals: succeeded/failed/skipped
```

**DAG validation** ✅✅ (`:41-67`): the definition `superRefine` hard-rejects (a) duplicate `stepId`,
(b) `entryStepId` pointing at an unknown step, (c) dangling `nextStepIds` edges, (d) cycles via a
DFS back-edge detector (`hasCycle`, `:149-175`, gray/black sets = standard 3-state scheme).

⚠️ **`transition*Status` only mutates `status` — and does NOT re-validate** (corrected by pass 2).
`transitionWorkflowRunStatus`/`transitionStepRunStatus` (`:129-147`) return
`Object.freeze({ ...run, status: next })` — `currentStepId`/`startedAt`/`finishedAt`/`attemptCount`
are spread through untouched, and there is **no `parse` re-run**. So a run carrying out-of-schema
sibling fields would *not* be caught at transition time. (Only `transitionApprovalStatus` re-parses.)
Callers own all side-field bookkeeping.

⚠️ **The core `WorkflowRun`/`StepRun` machinery is dead surface area** ✅✅ (grep-verified):
`parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` have
**zero production consumers** — they're referenced only in `workflows/contracts.test.ts`. The runtime
does **not** persist or transition core `WorkflowRun`/`StepRun`; it uses the separate
`platform/runner/repository.ts` `Job`/`Attempt` model. Only `parseWorkflowDefinition` (1 consumer:
`content-workflow.ts:9`) is actually wired. → Another "built but not wired" instance (theme of
[F5](./90-parity-findings.md)); flagged in the register.

## Artifact model ✅✅

Base shape (`artifacts/contracts.ts:19-41`, `.strict()`): `schemaVersion:1`, `artifactId`,
`artifactType`, `sourceStepRunId`, `content: JsonValue`, `validation:{status: pending|valid|invalid,
checkedAt|null, message?}`, `lineage:{inputArtifactIds[]}`.

`JsonValue` (`:7-17`) is a recursive `z.lazy` union; numbers are `z.number().finite()` — **NaN/±Infinity
rejected** (easy to miss).

Two `superRefine` gates (`:33-41`):
```ts
if (artifact.lineage.inputArtifactIds.length === 0) ctx.addIssue('derived artifacts require lineage inputs')
if (containsSecretReference(artifact.content))      ctx.addIssue('artifact content must not contain secret references')
```
→ **Artifacts cannot be roots** (empty lineage rejected), and `content` is recursively scanned
(`containsSecretReference`, `:49-63`) to reject any embedded `SecretReference`.

## Approval model ✅✅

Shape (`approvals/contracts.ts:20-41`, `.strict()`): `approvalId`, `requestedAction`,
`target:{kind: artifact|external-action, id}`, `status`, `requesterId`, `approverId|null`,
`decisionReason|null`, `requestedAt`, `decidedAt|null`, `expiresAt|null`.

Status enum (`:5-11`): `requested · approved · rejected · expired · cancelled`. Transition table
(`:53-59`): `requested → {approved,rejected,expired,cancelled}`; **all four terminal — no reopen** ✅✅.

Decision-field consistency `superRefine` (`:32-41`):
- `requested` ⇒ `approverId`/`decisionReason`/`decidedAt` must all be **null** (`requireNoDecisionFields`).
- `approved`/`rejected` ⇒ all three must be **non-null** (`requireDecisionFields`).
- ⚠️ **`expired`/`cancelled` are UNCHECKED** — neither helper fires, so their decision fields may be
  null *or* populated. (Subtle gap.)

```ts
export function isApprovalGranted(approval) { return approval.status === 'approved' }   // :65-67
```
⚠️ **`isApprovalGranted` checks ONLY `status==='approved'`** ✅✅ — expiry, target-kind, target-id, and
action matching live **downstream** in `platform/providers/approval-runtime.ts`
(`evaluateProviderExecutionApproval:34-125`), not in core. Also: `target.kind:'artifact'` is a
core-valid shape, but the provider path only accepts `external-action` (`approval-runtime.ts:67`) —
so an artifact-target approval is constructible in core but rejected at the provider boundary.

## Approval repository ✅✅

Table `opzava_approvals` (`approval-repository.ts:16-28`):
```
approval_id TEXT PK · status · requested_action · requester_id · record_json · requested_at · decided_at
INDEX status · requested_at
```
The full `Approval` is JSON in `record_json`; the scalar columns are denormalized index/query
projections (never the source of truth). **Upsert** `ON CONFLICT(approval_id) DO UPDATE` (`:34-47`).
`saveApproval` re-parses before write (`:55`); `getApprovalById`/`listApprovals` re-`parseApproval`
on every read (`:71,79`) — schema drift surfaces as a read-time throw. `listApprovals` orders
`requested_at DESC`, optional `status` filter.

## Dependencies — the layering leak ✅✅

**Outbound (every non-stdlib import core makes):**
- `workflows/contracts.ts` → `zod` only.
- `approvals/contracts.ts` → `zod` only.
- `approvals/approval-repository.ts` → `better-sqlite3` + `./contracts`.
- ⚠️ `artifacts/contracts.ts:3` → **`import { isSecretReference } from '../../platform/admin-config/contracts'`** —
  the **only** upward `core → platform` dependency. It inverts the intended layering (core is supposed
  to depend on nothing). Functionally a pure predicate, but it means core is not standalone. Cleanest
  fix: relocate `secretReferenceSchema`/`isSecretReference` into core (or a shared kernel) so platform
  depends down, not core up.

⚠️ **Inconsistent repository placement** ✅✅: the *approvals* repo lives under `core/` and binds core to
`better-sqlite3`; the *artifact* repo lives in a module (`modules/content/artifacts/`); there is **no**
workflow-run repository at all. Only approvals puts persistence in `core/`.

**Inbound (who imports core):** `parseArtifact`/`Artifact` → 12 consumers across content/social/general-va;
`parseApproval`/`isApprovalGranted`/`transitionApprovalStatus`/`createApprovalRepository` → the ops
approvals routes, the provider approval runtimes, and the module approval/workflow services;
`parseWorkflowDefinition` → `content-workflow.ts` only.

## Subtleties for parity comparison

1. Core `WorkflowRun`/`StepRun` contracts exist and are tested but **unused at runtime** — the durable
   runner's `Job`/`Attempt` is the real execution model. Don't assume core drives execution.
2. Workflow/step transitions **do not re-validate**; only approval transitions do.
3. `expired`/`cancelled` approvals have unconstrained decision fields.
4. Core is **not** dependency-free — the `isSecretReference` import breaks the "core depends on nothing"
   ideal (would be flagged by a strict acyclic-layering check).
5. `isApprovalGranted` is necessary-but-not-sufficient: granted ≠ usable; expiry/target checks are in the
   provider layer.
