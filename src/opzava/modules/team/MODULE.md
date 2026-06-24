<!-- agent-context: read this before editing the module -->

# modules/team

## Purpose
Owns the opzava agent roster: roles, statuses, profiles, per-agent activity, and the cross-department pipeline ordering that maps each workflow step to the role that owns it. It is the **only** feature module with its own SQLite table (`opzava_agent_roles`) plus a REST surface, and the only module that couples to other feature modules.

## Public surface
The barrel `src/opzava/modules/team/index.ts` is truth — **25 exports** (13 values/consts, 9 types, 7 functions across 6 sub-modules, re-exported from their source files).

- **agent-role** (7): `AGENT_ROLE_SCHEMA_VERSION`, `AGENT_STATUSES`, `agentRoleSchema`, `parseAgentRole`, `DEFAULT_AGENT_ROLES`, `groupAgentRolesByDepartment`, type `AgentStatus`, type `AgentRole`
- **agent-role-repository** (3): `createAgentRoleRepository`, type `AgentRoleRepository`, type `AgentRoleListFilter`
- **agent-activity** (3): `STEP_TO_ARTIFACT_TYPE`, `stepToArtifactType`, `summarizeAgentActivity`, type `AgentActivity`
- **agent-status** (3): `AGENT_STATUS_TRANSITIONS`, `canTransitionAgentStatus`, `transitionAgentStatus`
- **department-pipeline** (6): `CONTENT_PIPELINE_ORDER`, `EMAIL_PIPELINE_ORDER`, `SOCIAL_PIPELINE_ORDER`, `GENERAL_VA_PIPELINE_ORDER`, `DEPARTMENT_PIPELINE_ORDER`, `buildDepartmentPipeline`, type `PipelineStep`
- **agent-profile** (7): `AGENT_PROFILE_SCHEMA_VERSION`, `AGENT_MODELS`, `agentProfileSchema`, `parseAgentProfile`, `DEFAULT_AGENT_PROFILES`, `getAgentProfile`, type `AgentModel`, type `AgentProfile`

Anything not listed here (the per-file `.test.ts`, the internal `SEED`/`RAW_DEFAULT_AGENT_PROFILES` arrays) is internal.

## Dependencies
- **Outbound** (what this imports):
  - `core` only within `src/opzava`: none directly — `agent-activity.ts` imports `createArtifactRepository` from `@/opzava/modules/content` (the public barrel), and `agent-role-repository.ts` / `agent-activity.ts` import the `better-sqlite3` `Database` type. This is the **only cross-module static import edge** in `src/opzava` (team → content), routed through the content public barrel per ARD 0010.
  - Layering rule: feature modules may depend on `core` and on a sibling module's **public API only** (no internal paths — enforced by `src/opzava/architecture.test.ts`).
- **Inbound** (who imports this — do not silently break): the thin REST routes `src/app/api/team/agents/route.ts` and `src/app/api/team/agents/[id]/route.ts` (plus `route.test.ts`).

## Invariants
1. **Active roles must own steps.** `agent-role.ts:19-26` `superRefine` rejects `status === 'active'` with an empty `ownedStepIds` (`"active agents must own at least one workflow step"`). `planned`/`paused` may own zero steps. Any status change must round-trip through `parseAgentRole`, which re-runs this and the uniqueness check.
2. **ownedStepIds are unique.** `agent-role.ts:27-37` adds an issue per duplicate step id within a role.
3. **AgentRole is frozen + strict.** `parseAgentRole` (`agent-role.ts:42-44`) `Object.freeze`s the parsed record; the schema is `.strict()` — unknown keys are rejected. Roles are immutable values; edits produce a new frozen role.
4. **Status machine is closed and asymmetric.** `agent-status.ts:3-7`: `active → [paused]`, `paused → [active]`, `planned → []` (terminal). `transitionAgentStatus` throws `"illegal agent status transition: <from> -> <to>"` for any other move and re-parses through `parseAgentRole`.
5. **Pipeline step-ids are the cross-module contract, not imports.** `department-pipeline.ts` defines the canonical ordered step-id arrays (`CONTENT_PIPELINE_ORDER`, etc.) as plain strings — these are the single source of truth that content/social/general-va step libraries are referenced by. `buildDepartmentPipeline` (`department-pipeline.ts:36-60`) resolves the first role (per insertion order of `roles`) owning each step in a department; an unowned step yields `agentId/agentName: null`.
6. **Repository upserts by agent_id and is idempotent on seed.** `agent-role-repository.ts:51-59` `INSERT … ON CONFLICT(agent_id) DO UPDATE`; `seedDefaults` (`:135-143`) is a no-op if the table is non-empty (`count > 0 ⇒ return 0`).
7. **Default profiles must cover default roles at import time.** `agent-profile.ts:129-138` runs an import-time check: every `DEFAULT_AGENT_PROFILES[].agentId` must exist in `DEFAULT_AGENT_ROLES` or the module throws on load. Adding a profile without a matching role is a load-time crash.

## Harmony rules
- **Which engine:** opzava canonical `src/opzava`. The `opzava_agent_roles` table is **separate from and unreconciled with** the inherited `src/lib` `agents` table (driven by `src/lib/migrations.ts`, surfaced at `src/app/api/agents/`). Inherited "agents" ≠ opzava "roles" — they share no id or lifecycle. See ARD 0007 (engine separation) and `test/engine-boundary.test.mjs`.
- **Dead-surface / cross-module warnings:**
  - `social` and `general-va` are dead-wired — referenced **only** as plain string step-ids in `department-pipeline.ts`; no route or service imports their step services at runtime. Renaming or adding a step-id must keep `department-pipeline.ts` in sync (enforced by `test/stepid-coupling.test.mjs`).
  - The team → content import edge (`agent-activity.ts`) must stay on the **public barrel** `@/opzava/modules/content`, never content's internals (the prior cross-module-internal leak was corrected; see ARD 0010 and `src/opzava/architecture.test.ts`).
  - Two unreconciled agent models (F2) are **known debt, not a bug** — do not assume a bridge exists.

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

> ## ✅ CONFIRMED — two unreconciled agent models
>
> The inherited `agents` table (driven by `src/lib/migrations.ts`, surfaced at `src/app/api/agents/`)
> and the opzava `opzava_agent_roles` table (`src/opzava/modules/team/agent-role-repository.ts`) are
> separate, with no bridge or reconciliation code.
>
> **Guardrail (team MODULE.md, engine-boundary):** inherited "agents" ≠ opzava "roles". Do not assume
> they share an id or lifecycle. See ARD 0007 (engine separation) and `test/engine-boundary.test.mjs`.

> ## Layering leaks (corrected in the realignment)
>
> - **❌→✅ core→platform leak:** `src/opzava/core/artifacts/contracts.ts` imported `isSecretReference`
>   from `platform/admin-config/contracts` — an upward domain→infrastructure edge violating the
>   Dependency Rule. Fixed by relocating the pure `SecretReference` model to `core/secrets` (see the
>   realignment ARD).
> - **❌→✅ cross-module internal import:** `src/opzava/modules/team/agent-activity.ts` imported
>   `createArtifactRepository` from `content`'s internals. Fixed by routing through the `content`
>   public barrel (`@/opzava/modules/content`).
