<!-- agent-context: read this before editing the module -->

# modules/social

## Purpose
Owns the social-media pipeline step library: brief → post draft → review → schedule request, plus the
social-approval gate. Each step is a small, provider-injectable service that produces a typed
`Artifact` (or, for approval, an `Approval`). The module is currently **dead-wired** — a step library
referenced only as step-id strings; no SQLite tables and no runtime callers (see Harmony rules).

## Public surface
`index.ts` is the barrel and the truth — **~12 exports** (4 values/functions + 8 types). Platform/core
modules have no `index.ts`; this is a feature module, so it does. Groups, copied verbatim from
`index.ts`:

- **`artifacts/social-artifact`** — `SOCIAL_ARTIFACT_TYPES` (value), `createSocialArtifact` (fn),
  `type SocialArtifactType`, `type CreateSocialArtifactInput`.
- **`steps/social-post-draft-service`** — `createSocialPostDraftStepService`,
  `createMockSocialPostDraftProvider`, `parseSocialPostDraftInput`, `type SocialPostDraftInput`,
  `type SocialPostDraft`, `type SocialPostDraftProvider`.
- **`steps/social-review-service`** — `createSocialReviewStepService`,
  `createMockSocialReviewProvider`, `parseSocialReviewInput`, `assertSocialReviewVerdict`,
  `type SocialReviewInput`, `type SocialReviewDraft`, `type SocialReviewProvider`.
- **`steps/social-approval-service`** — `createSocialApprovalStepService`,
  `createMockSocialApprovalProvider`, `parseSocialApprovalStepInput`, `type SocialApprovalDecision`,
  `type SocialApprovalProvider`, `type SocialApprovalStepInput`.
- **`steps/social-schedule-request-service`** — `createSocialScheduleRequestStepService`,
  `parseSocialScheduleRequestInput`, `type SocialScheduleStatus`, `type SocialScheduleRequestInput`,
  `type SocialScheduleRequest`.

Anything not listed (e.g. the internal `SocialPostDraftStepDeps` / `SocialReviewStepDeps` /
`SocialApprovalStepDeps` / `SocialScheduleStepDeps` dep types, the per-file `SocialReviewIssue` type)
is internal.

## Dependencies
- **Outbound** (what this imports): **core only** — `@/opzava/core/artifacts/contracts`
  (`Artifact`, `parseArtifact`, `ARTIFACT_CONTRACT_SCHEMA_VERSION`) and
  `@/opzava/core/approvals/contracts` (`Approval`, `parseApproval`). No platform imports, no sibling
  modules, no `src/lib`. This is the cleanest dependency style of any feature module — matches the
  `social --> artifacts & approvals` edge in `docs/architecture/dependency-graph.md` (the Dependency
  Rule: modules import core inward only).
- **Inbound** (who imports this): **zero production importers.** The `@/opzava/modules/social` barrel
  has no static importers anywhere in `src/`. The only coupling is a **string/value coupling
  (non-import)**: `SOCIAL_PIPELINE_ORDER` in `src/opzava/modules/team/department-pipeline.ts:19`
  references the four pipeline step-ids as plain strings. Renaming/adding a step-id must keep that file
  in sync (enforced by `test/stepid-coupling.test.mjs`).

## Invariants
1. **Four pipeline artifacts, one approval gate.** `SOCIAL_ARTIFACT_TYPES` is exactly
   `['social-brief', 'social-post-draft', 'social-review', 'social-schedule-request']`
   (`artifacts/social-artifact.ts:3-8`). `social-approval` is **not** an artifact —
   `createSocialApprovalStepService` returns an `Approval` with `target: { kind: 'artifact', id:
   postDraftArtifactId }` and `requestedAction: 'social-publish'` (`social-approval-service.ts:56-68`).
   It is an approval **gate**, not a pipeline step, and is absent from `SOCIAL_PIPELINE_ORDER`.
2. **`social-brief` is a manual-input entry step with no service.** There is no
   `social-brief-service.ts`; the four step services that exist are post-draft, review, approval, and
   schedule-request. `social-brief` exists only as a declared artifact type and step-id string — its
   artifact is supplied to `social-post-draft` via `briefArtifactId`.
3. **Review verdict is total and self-checking.** `assertSocialReviewVerdict`
   (`social-review-service.ts:48-69`) rejects `status:'passed'` with any issues, `status:'rejected'`
   with zero issues or any issue missing a non-empty `code`/`reason`, and any other status. Every review
   service `run` pipes the provider output through it before emitting the artifact.
4. **Scheduling requires a granted approval and declares full lineage.** `createSocialScheduleRequestStepService`
   throws `'social scheduling requires a granted approval'` unless `approvalGranted === true`
   (`social-schedule-request-service.ts:75-77`), and the emitted `social-schedule-request` artifact
   carries lineage `[postDraftArtifactId, reviewArtifactId, approvalId]`
   (`social-schedule-request-service.ts:89-93`). Default `status` is `'scheduled'` when
   `desiredStatus` is omitted.
5. **Unknown artifact type is a hard throw, not a coerce.** `createSocialArtifact`
   (`artifacts/social-artifact.ts:22-24`) throws for any `artifactType` not in `SOCIAL_ARTIFACT_TYPES`;
   all emitted artifacts are validated through `parseArtifact` with `validation.status:'valid'` and a
   copied lineage array.

## Harmony rules
- **Which engine:** opzava canonical `src/opzava`. Every import is `@/opzava/core/*`; nothing crosses
  into inherited `src/lib`. Engine separation per ARD 0007 / `test/engine-boundary.test.mjs` holds.
- **Dead-surface / dead-wired warning:** this module is **dead-wired scaffolding, not a live pipeline.**
  It has **no SQLite tables and no production callers** — referenced only as plain step-id strings in
  `src/opzava/modules/team/department-pipeline.ts`. Do not assume a route, repository, or runtime
  service imports these step services. Renaming or adding a step-id must keep `department-pipeline.ts`
  in sync (`test/stepid-coupling.test.mjs`). No mock is the "real" implementation — every provider is
  injected via the step service's deps.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md`:

> ## ✅ CONFIRMED — `social` and `general-va` are dead-wired
>
> Both are step libraries with **no SQLite tables and no production callers** — referenced only as
> plain string step-ids in `src/opzava/modules/team/department-pipeline.ts`. No route or service
> imports their step services at runtime.
>
> **Guardrail (social / general-va MODULE.md):** these modules are scaffolding, not a live pipeline.
> Do not assume a caller exists. Renaming or adding a step-id must keep `department-pipeline.ts` in
> sync (enforced by `test/stepid-coupling.test.mjs`).

Also relevant (cross-cuts via the approval gate this module emits):

> ## ✅ CONFIRMED — approval-runtime narrows `target.kind` to `external-action`
>
> `src/opzava/platform/providers/approval-runtime.ts:67` rejects any `target.kind !== 'external-action'`,
> while `src/opzava/core/approvals/contracts.ts:15-16` allows both `'artifact'` and `'external-action'`.
>
> **Guardrail (core/approvals + providers MODULE.md):** the provider layer intentionally narrows the
> core contract. An `artifact`-targeted approval is core-valid but cannot gate an external provider
> call. Accepted narrowing, not a bug — flag it, do not "fix" by widening the provider path.

(The social-approval gate produces exactly such an `artifact`-targeted approval — `social-approval-service.ts:60`
— which is core-valid today; do not repoint it at a live provider call without revisiting this narrowing.)
