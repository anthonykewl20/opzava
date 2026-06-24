<!-- agent-context: read this before editing the module -->

# modules/general-va

## Purpose
Step library for the "general VA" (virtual assistant) department pipeline. Defines the artifact types and three step services (`va-task-draft`, `va-task-review`, `va-approval`) plus a `va-task-intake` artifact type, intended for an `intake -> draft -> review` flow gated by approval. It is the smallest Opzava feature module and is currently **dead-wired** — scaffolding with no runtime callers (see Harmony rules and Editor guardrails).

## Public surface
The barrel `index.ts` is truth (8 exported values + 9 exported types = **17 exports**; the hint's "~8" counts the value/function exports). Re-exported by group:

- **Artifacts** (from `./artifacts/general-va-artifact`): `GENERAL_VA_ARTIFACT_TYPES`, `createGeneralVaArtifact`, type `GeneralVaArtifactType`, type `CreateGeneralVaArtifactInput`.
- **va-task-draft** (from `./steps/va-task-draft-service`): `createVaTaskDraftStepService`, `createMockVaTaskDraftProvider`, `parseVaTaskDraftInput`, type `VaTaskDraftInput`, type `VaTaskDraft`, type `VaTaskDraftProvider`.
- **va-task-review** (from `./steps/va-task-review-service`): `createVaTaskReviewStepService`, `createMockVaTaskReviewProvider`, `parseVaTaskReviewInput`, `assertVaTaskReviewVerdict`, type `VaTaskReviewInput`, type `VaTaskReviewDraft`, type `VaTaskReviewProvider`.
- **va-approval** (from `./steps/va-approval-service`): `createVaApprovalStepService`, `createMockVaApprovalProvider`, `parseVaApprovalStepInput`, type `VaApprovalDecision`, type `VaApprovalProvider`, type `VaApprovalStepInput`.

Anything not listed (e.g. `VaTaskReviewIssue`, `VaTaskDraftStepDeps`, the `*StepDeps` types) is internal.

## Dependencies
- **Outbound** (what this imports): `@/opzava/core` only — `core/artifacts/contracts` (`Artifact`, `parseArtifact`, `ARTIFACT_CONTRACT_SCHEMA_VERSION`) and `core/approvals/contracts` (`parseApproval`, `Approval`). No platform imports, no sibling-module imports. Layering rule: modules depend inward on `core` only (Dependency Rule; `dependency-graph.md` shows `gva --> core{artifacts,approvals}`).
- **Inbound** (who imports this): **no production callers.** No route or service imports the step factories (`src/app` has zero imports of `@/opzava/modules/general-va`). The only coupling is string-based: `src/opzava/modules/team/department-pipeline.ts:21` (`GENERAL_VA_PIPELINE_ORDER = ['va-task-intake','va-task-draft','va-task-review']`), `src/opzava/modules/team/agent-role.ts:150-154` (`agentId: 'general-va'`, `ownedStepIds`), and `src/opzava/modules/team/agent-profile.ts:111` (`agentId: 'general-va'`). This string coupling is enforced by `test/stepid-coupling.test.mjs`.

## Invariants
1. **Artifact type allow-list is closed.** `GENERAL_VA_ARTIFACT_TYPES` enumerates exactly `['va-task-intake','va-task-draft','va-task-review']`. `createGeneralVaArtifact` throws `unknown general VA artifact type` for anything else (`general-va-artifact.ts:17`). Every artifact produced is passed through `parseArtifact` (`core/artifacts`) with `validation.status:'valid'` and explicit `lineage.inputArtifactIds`.
2. **`va-task-intake` has no service — it is a manual-input entry artifact type only.** There is no `va-task-intake-service.ts`. Intake artifacts must be created directly via `createGeneralVaArtifact`; it is the head of the pipeline and carries no upstream lineage input.
3. **`va-approval` is an approval GATE, not a pipeline step and not an artifact.** `createVaApprovalStepService` returns an `Approval` (`core/approvals`), not an `Artifact`, and `va-approval` is absent from `GENERAL_VA_PIPELINE_ORDER`. It targets `{kind:'artifact', id: taskDraftArtifactId}` — it gates the task-draft artifact via `parseApproval`, which enforces the core approval-state superRefine.
4. **Review verdict is self-consistent before persistence.** `assertVaTaskReviewVerdict` rejects contradictions: `status:'passed'` MUST have zero issues; `status:'rejected'` MUST have ≥1 issue, each with non-empty `code` and `reason`. The review service runs the provider output through this assertion before emitting the artifact (`va-task-review-service.ts:48-63,81`).
5. **Inputs are parsed and frozen at the boundary.** Each `parseVa*Input` validates every field is a non-empty string then `Object.freeze`s the result; all step services take `{provider, newId, now}` deps and return frozen `{run}` factories — pure, deterministic, side-effect-free aside from injected `newId`/`now`.

## Harmony rules
- **Which engine:** opzava canonical `src/opzava` (ENGINE B). Imports only `@/opzava/core`; never touches inherited `src/lib` or the `agents`/`audit_log`/`token_usage` tables. Per ARD 0007 / `test/engine-boundary.test.mjs`.
- **Dead-wired warning (copy of the applicable stale finding):** this module is a step library with **no SQLite tables and no production callers** — referenced only as plain string step-ids in `team/department-pipeline.ts` and `team/agent-role.ts`. No route or service imports the step services at runtime. Do not assume a caller exists; renaming/adding a step-id MUST keep `department-pipeline.ts` in sync (enforced by `test/stepid-coupling.test.mjs`).
- The mock providers (`createMock*Provider`) are the only providers shipped — there is no live provider implementation in this module, consistent with it being scaffolding.

## Editor guardrails
Verbatim from `docs/architecture/system-map/92-stale-findings.md` — the entry that applies to this module:

> ## ✅ CONFIRMED — `social` and `general-va` are dead-wired
>
> Both are step libraries with **no SQLite tables and no production callers** — referenced only as
> plain string step-ids in `src/opzava/modules/team/department-pipeline.ts`. No route or service
> imports their step services at runtime.
>
> **Guardrail (social / general-va MODULE.md):** these modules are scaffolding, not a live pipeline.
> Do not assume a caller exists. Renaming or adding a step-id must keep `department-pipeline.ts` in
> sync (enforced by `test/stepid-coupling.test.mjs`).

(Status: ✅ CONFIRMED — verified against the real source 2026-06-24: zero `src/app` imports of `@/opzava/modules/general-va`; sole non-self references are the step-id strings at `team/department-pipeline.ts:21` and `team/agent-role.ts:150-154`, plus the `agentId:'general-va'` string at `team/agent-profile.ts:111`.)
