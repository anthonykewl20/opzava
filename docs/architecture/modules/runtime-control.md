# packages/runtime-control - Runtime-Control / AI loop
> Part of the Opzava architecture (see ../README.md). Vocabulary: codebase-design.

## Overview
Runtime-Control is the application layer that owns the assistant conversation loop: conversation creation, user and assistant turns, delta streaming, finalization, failure, and tool-call outcome recording.
It sits above the project-management bounded context and the Postgres adapter stack, and it owns the one `AuthorizationPort` adapter in this package plus the Drizzle schema that binds the domain vocabulary to tenant-isolated tables. CRM tools were removed on 2026-07-15 and are deferred to the future user-side dashboard (GitHub issue #200).
The load-bearing invariants are single-writer turn transitions, idempotency-key replay with stable-content comparison, receipt-first tool outcomes, and RLS-enforced tenant isolation where the database row is truth and every returned object is a projection reloaded after each mutation.

## Modules

### Package root - `packages/runtime-control/src/index.ts`
- **Interface (the seam):** re-exports the application and domain surfaces as a single entry (`packages/runtime-control/src/index.ts:1`).
  Callers get the turn commands (`createConversation`, `appendUserTurn`, `startAssistantTurn`, `appendAssistantDelta`, `finalizeAssistantTurn`, `failAssistantTurn`, `recordToolOutcome`, `recordStartedToolOutcome`), the task tool executor and registry, the authorization adapter (`RoleKeyRuntimeControlAuthorizationPort`, `defaultRuntimeControlAuthorizationPort`), and all domain types and predicates. The five CRM tools were removed on 2026-07-15 (GitHub issue #200).
- **Behind the seam (implementation):** nothing; the file is pure `export` forwarding to `./application/index.js` and `./domain/index.js` (`packages/runtime-control/src/index.ts:36`, `:64`).
- **Adapters:** re-exports the `AuthorizationPort` adapter from `./application/authorization.ts`; the authoritative map counts 2 current adapters repo-wide (project-management and runtime-control), so this is a REAL seam, and the complexity is policy evaluation, not transport. CRM is deferred to the future user-side dashboard.
- **Depth:** shallow.
  Deletion test: removing this file only forces callers to import from `application/index.js` and `domain/index.js` directly; no complexity concentrates.
  The inventory frames it as "moderate" because it fronts deep modules, but the file itself hides nothing.
- **Seams:** external seam is the package boundary; internal seam is the application/domain split below it.
- **Testing through the interface:** exercised end-to-end through `packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts`; the entry itself adds no behavior to test.
- **Deepening opportunity:** none - already a minimal re-export; the real seams live in the application services.

### Application index - `packages/runtime-control/src/application/index.ts`
- **Interface (the seam):** re-export surface for the current application module set: `./assistant-conversations.js`, `./authorization.js`, and `./task-tools.js`. `./crm-tools.js` was removed on 2026-07-15 and is deferred to the future user-side dashboard (GitHub issue #200).
- **Behind the seam (implementation):** no logic; the inventory itself notes "pure seam re-export and hides no extra logic."
- **Adapters:** exposes the `RoleKeyRuntimeControlAuthorizationPort` adapter, one of the 2 current `AuthorizationPort` adapters in the authoritative map.
- **Depth:** shallow.
  Deletion test: removing the file pushes callers straight to the three current application modules with no loss of behavior.
- **Seams:** internal seam between the composition entry and the three current application services it fronts.
- **Testing through the interface:** covered by the integration test; no behavior of its own.
- **Deepening opportunity:** none - already a pure re-export.

### Assistant conversation application - `packages/runtime-control/src/application/assistant-conversations.ts`
- **Interface (the seam):** the context and command surface that callers must know.
  Types: `RuntimeControlApplicationContext`, `RuntimeControlActor`, `SessionDerivedPrincipal`, `ToolExecutionContext` (+ `ToolExecutionContextInput`), `RuntimeControlDependencies`, `StartedToolOutcomeReceipt`, and the per-command input types (`packages/runtime-control/src/application/assistant-conversations.ts:32`).
  Commands: `toolExecutionContextFromSessionPrincipal`, `createConversation`, `appendUserTurn`, `startAssistantTurn`, `appendAssistantDelta`, `finalizeAssistantTurn`, `failAssistantTurn`, `recordToolOutcome`, `recordStartedToolOutcome` (`packages/runtime-control/src/application/assistant-conversations.ts:527`, `:565`, `:628`, `:713`, `:806`, `:872`, `:955`, `:1167`, `:1231`).
  Ordering invariants a caller must honor: assistant delta/finalize/fail require a turn in a non-terminal state; tool outcomes must be recorded receipt-first (`started` before `succeeded`/`failed`).
  Error modes are typed `DomainError` codes prefixed `runtimeControl.*` (for example `runtimeControl.conversationNotFound`, `runtimeControl.idempotencyConflict`, `runtimeControl.invalidTurnTransition`, `runtimeControl.toolOutcomeConflict`).
- **Behind the seam (implementation):** this is where the complexity concentrates.
  Every command runs inside `withTenant(input.orgId, ...)` which sets the tenant GUC for the transaction (`packages/runtime-control/src/application/assistant-conversations.ts:584`, `:643`, `:734`, `:816`, `:882`, `:965`, `:1201`, `:1217`, `:1261`), and every mutation is followed by a re-read of the row through `RETURNING` or an explicit `select`, so the returned object is always a projection of the committed truth.
  Single-writer concurrency is enforced by conditional `update ... where status in (...)` statements, not advisory locks: `finalizeAssistantTurn` runs a two-phase claim (`queued|streaming` to `finalizing`, then `finalizing` to `final`) so a racing finalizer sees no row and falls back to returning the existing `final` turn (`packages/runtime-control/src/application/assistant-conversations.ts:883`, `:915`).
  `appendAssistantDelta` combines a `select ... for update` with a conditional update gated on `status in ('queued','streaming')` (`packages/runtime-control/src/application/assistant-conversations.ts:817`, `:835`).
  Idempotency uses `on conflict (organization_id, conversation_id, idempotency_key) do nothing` for turns (`packages/runtime-control/src/application/assistant-conversations.ts:672`, `:765`) and `on conflict (turn_id, tool_call_id) do nothing` for started outcomes (`:1060`), then re-reads and compares payloads with `sameJson`, a stable canonical-form JSON comparison that sorts object keys (`packages/runtime-control/src/application/assistant-conversations.ts:185`, `:470`).
  The started-outcome path returns `inserted: boolean` so the tool runners can detect a replay and short-circuit without re-executing the side effect.
  Authorization is folded into every command via `validateCommonInput`, which falls back to `defaultRuntimeControlAuthorizationPort` when no port is injected (`packages/runtime-control/src/application/assistant-conversations.ts:391`, `:404`).
- **Adapters:** satisfies `AuthorizationPort` indirectly by consuming it (`packages/runtime-control/src/application/assistant-conversations.ts:7`, `:64`); the adapter itself lives in `authorization.ts`.
  The real seam here is Postgres via `@opzava/adapters` - `withTenant` and `mapDatabaseError` hide tenant GUC management and SQLSTATE translation (`packages/runtime-control/src/application/assistant-conversations.ts:1`).
- **Depth:** deep.
  Deletion test: removing this file collapses single-writer semantics, replay protection, the turn state machine, and the receipt-first tool contract into callers; the complexity has nowhere else to live.
  The inventory flags it as large enough that each exported command should be treated as its own sub-seam.
- **Seams:** external seam is the exported command set; internal seams are the domain predicates (`canAppendAssistantDelta`), the Drizzle `sql` helper, and the `@opzava/adapters` Postgres helpers.
  Coupling: hard dependency on the table and column names in `adapters/postgres/schema/runtime-control.ts` via hand-written SQL strings.
- **Testing through the interface:** the integration test exercises the conversation/turn lifecycle, idempotency conflicts, tool-outcome replay, and cross-tenant RLS hiding (`packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:417`, `:513`, `:1203`, `:1230`).
  Gaps: no isolated unit tests for the row mappers, the `stableJson`/`sameJson` comparator, or the `finalizeAssistantTurn` racing-finalizer path; these are covered only transitively through the integration run.
- **Deepening opportunity:** split the 1273-line file along its exported commands (conversation, turn lifecycle, tool outcomes) into three modules behind the same interface, so each sub-seam can be tested and reasoned about independently.
  `recordToolOutcome` and `recordStartedToolOutcome` share the started-outcome insertion path and could collapse into one entrypoint with a discriminated result.

### Authorization adapter - `packages/runtime-control/src/application/authorization.ts`
- **Interface (the seam):** `RoleKeyRuntimeControlAuthorizationPort implements AuthorizationPort` and the singleton `defaultRuntimeControlAuthorizationPort` (`packages/runtime-control/src/application/authorization.ts:39`, `:106`).
  Callers must know three invariants: resources are restricted to `agent` or `workspace` (everything else returns `unsupported-resource`); the subject's `tenantId`, `orgId`, and `workspaceIds` must match the resource or the decision is `false` with a mismatch reason; and the four admitted actions are `read`, `create`, `update`, `execute` (`packages/runtime-control/src/application/authorization.ts:45`, `:49`, `:53`, `:57`, `:64`).
  Error mode is always a successful `Result<AuthorizationDecision>` with `allowed: false` plus a reason string, never a thrown error.
- **Behind the seam (implementation):** role-key policy evaluation.
  `roleAllows` maps a required `TenantGrant` onto the subject's `roleKeys`: `guest` requires the `guest` key, `member` requires any of `owner|admin|member`, `admin` requires `owner` or `admin`, and the default requires `owner` (`packages/runtime-control/src/application/authorization.ts:15`).
  For runtime-control, `can` reduces every admitted action to a `member` grant check, so any non-guest tenant member is admitted and guests are excluded (`packages/runtime-control/src/application/authorization.ts:73`).
  `hasTenantGrant` and `hasProjectGrant` honor the requested grant level and the tenant-match guard (`packages/runtime-control/src/application/authorization.ts:79`, `:92`).
- **Adapters:** this is one of the 2 current `AuthorizationPort` adapters in the authoritative map (packages/project-management and packages/runtime-control), making it a REAL seam shared across 2 bounded contexts; CRM is deferred to the future user-side dashboard (GitHub issue #200).
  The complexity it hides is policy selection and grant mapping, not transport.
- **Depth:** moderate.
  Deletion test: removing it would force every command in `assistant-conversations.ts` to inline the role-key matrix and the mismatch checks, so the policy concentrates; the implementation is thin but the semantics are load-bearing.
- **Seams:** external seam is `AuthorizationPort` from `@opzava/ports`; no internal seams.
- **Testing through the interface:** no dedicated tests exist for this module (inventory confirms "Tests: none found"); the can-allow matrix across role keys, resource types, and tenant mismatches is exercised only indirectly through the integration test's denial cases (`packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:788`, `:1124`).
- **Deepening opportunity:** add a focused unit test for the decision matrix (unsupported resource, tenant/org/workspace mismatch, guest denial, owner override); the interface is the test surface and the matrix is currently unverified in isolation.

### Deferred CRM tool runner (removed 2026-07-15)
> **Superseded implementation detail:** `packages/runtime-control/src/application/crm-tools.ts` and the five `opzava_crm_*` tools were removed under GitHub issue #200. The retained details below describe the former runner solely to preserve this module map's historical analysis; CRM returns only with the future user-side dashboard.
- **Interface (the seam):** the tool registry, summary types, and executor.
  `runtimeControlCrmToolNames` and `runtimeControlCrmToolRegistry` declare the five admitted tools and their input shapes (`packages/runtime-control/src/application/crm-tools.ts:28`, `:44`).
  `RuntimeControlCrmToolOutput` is a discriminated union by `kind` (`crm.accounts.list`, `crm.contacts.list`, `crm.deals.list`, `crm.tickets.list`, `crm.contact_timeline.get`) and `RuntimeControlCrmToolExecution` is `succeeded` or `failed` (`packages/runtime-control/src/application/crm-tools.ts:139`, `:176`).
  `executeRuntimeControlCrmTool` takes a `ToolExecutionContext`, tool name, tool call id, and unknown `args`, and returns the execution result (`packages/runtime-control/src/application/crm-tools.ts:1014`).
  Ordering invariant: the executor records a `started` outcome first, then performs the tool, then records `succeeded` or `failed`; a replayed tool call id short-circuits with the stored result.
  Error modes: `runtimeControl.unknownTool`, `runtimeControl.invalidToolCallId`, `runtimeControl.toolMalformedArgs`, `runtimeControl.toolOutcomeInProgress`, `runtimeControl.toolOutcomeInvalidReplay`.
- **Behind the seam (implementation):** argument parsing, summary compaction, replay reconstruction, and failure mapping.
  Parsers reject unknown keys (`rejectUnknownKeys`), enforce integer limit/offset ranges, and validate `contactId` as a UUID (`packages/runtime-control/src/application/crm-tools.ts:279`, `:317`, `:352`, `:369`).
  DTOs are flattened and labeled into compact summaries: `humanize` turns snake_case into labels, `formatMoney` formats deal value, and `activitySummary` truncates body text to 280 characters with a `truncated`/`originalLength` marker (`packages/runtime-control/src/application/crm-tools.ts:617`, `:625`, `:709`, `:711`).
  Malformed args are sanitized to a depth-3, 20-key bound shape before being written into the request summary so the stored row never echoes unbounded model input (`packages/runtime-control/src/application/crm-tools.ts:515`).
  On replay, `outputFromOutcome` rebuilds the typed output from the stored `resultSummary` JSONB, and `failureFromOutcome` rebuilds a failure (`packages/runtime-control/src/application/crm-tools.ts:746`, `:822`).
  Service errors are mapped to tool failures via `failureFromError`, which inspects error codes and walks the `cause` chain for an HTTP 403 (`packages/runtime-control/src/application/crm-tools.ts:558`, `:569`).
  The whole flow is orchestrated in `executeRuntimeControlCrmTool`: record-started, short-circuit on replay, parse-and-fail-on-malformed, perform, then record-success-or-failure (`packages/runtime-control/src/application/crm-tools.ts:1036`, `:1052`, `:1056`, `:1069`, `:1084`).
- **Adapters:** consumes an optional `crmAuthorizationPort` (falls back to `dependencies.authorizationPort`), one of the 3 `AuthorizationPort` adapters from the authoritative map; the real seam is the injected `RuntimeControlCrmServices` plus the outcome recording in `assistant-conversations.ts` (`packages/runtime-control/src/application/crm-tools.ts:200`, `:208`, `:612`).
- **Depth:** deep.
  Deletion test: removing this file would push DTO shaping, list pagination, activity truncation, replay reconstruction, and failure mapping onto every CRM tool caller; the complexity concentrates here.
- **Seams:** external seam is the executor and registry; internal seams are `ToolExecutionContext` (branded opaque) and the `recordStartedToolOutcome`/`recordToolOutcome` commands it calls.
- **Testing through the interface:** the integration test exercises the CRM read tools, compact summaries, non-member denial, and cross-tenant invisibility (`packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:858`, `:1059`, `:1124`, `:1152`).
  Gaps: argument parsers, the depth-3 sanitizer, and `outputFromOutcome` reconstruction have no isolated unit tests.
- **Deepening opportunity:** the file shares its executor skeleton (record-started, replay short-circuit, parse, perform, record-result) and several helpers (`sanitizeValue`, `errorStatus`, `failureFromMalformedArgs`, `malformedRequestSummary`) verbatim with `task-tools.ts`; extracting a shared `runTooledExecution` harness would remove the duplication and make the tool-policy seam explicit (two near-identical implementations = a real seam candidate).

### Task tool runner - `packages/runtime-control/src/application/task-tools.ts`
- **Interface (the seam):** the task tool registry and executor.
  `runtimeControlTaskToolNames` declares `opzava_tasks_list`, `opzava_tasks_create`, `opzava_tasks_update` with their input shapes (`packages/runtime-control/src/application/task-tools.ts:25`, `:38`).
  `RuntimeControlTaskToolOutput` is discriminated by `kind` (`tasks.list`, `tasks.create`, `tasks.update`) and `RuntimeControlTaskToolExecution` uses `succeeded`/`failed` results (`packages/runtime-control/src/application/task-tools.ts:55`, `:69`).
  `executeRuntimeControlTaskTool` takes the same `ToolExecutionContext` plus tool name, tool call id, and unknown args (`packages/runtime-control/src/application/task-tools.ts:841`).
  Ordering and replay invariants are receipt-first outcomes and replay short-circuit on a known tool call id.
  Error modes include `runtimeControl.toolMalformedArgs` for empty updates and non-UUID task ids.
- **Behind the seam (implementation):** stricter-than-service validation, mutation fan-out, and replay.
  `rejectUnknownKeys` admits only the documented fields per tool (`packages/runtime-control/src/application/task-tools.ts:166`).
  `requiredTaskId` validates the id as a UUID before any SQL runs; the inline comment states a non-UUID model id is a malformed argument, not a database probe (`packages/runtime-control/src/application/task-tools.ts:236`).
  `parseUpdateArgs` rejects empty updates with "Task update tool requires at least one field to change," making the no-op case explicit (`packages/runtime-control/src/application/task-tools.ts:467`).
  `performTool` splits an update into a field update (`updateTask`) and a status move (`moveTask`) using the current task as the base for unspecified fields and the persisted `position` for the move (`packages/runtime-control/src/application/task-tools.ts:796`, `:819`).
  Service errors are mapped to tool failures via `failureFromError`, with `projectManagement.taskNotFound` mapping to `not_found` and `projectManagement.forbidden` or a 403 in the cause chain mapping to `forbidden` (`packages/runtime-control/src/application/task-tools.ts:567`).
  Replay reconstruction (`outputFromOutcome`, `failureFromOutcome`) and the sanitizer preserve task-tool outcomes (`packages/runtime-control/src/application/task-tools.ts:513`, `:627`, `:651`).
- **Adapters:** consumes an optional `taskAuthorizationPort` (falls back to `dependencies.authorizationPort`), one of the 2 current `AuthorizationPort` adapters; the real seam is the injected `RuntimeControlTaskServices` plus outcome recording (`packages/runtime-control/src/application/task-tools.ts:93`, `:101`, `:610`).
- **Depth:** deep.
  Deletion test: removing this file pushes argument parsing, UUID gating, update/move fan-out, and replay protection onto callers; the complexity concentrates.
- **Seams:** external seam is the executor and registry; internal seams are `ToolExecutionContext` and the outcome commands in `assistant-conversations.ts`.
- **Testing through the interface:** the integration test covers list/create/update through project-management services, malformed-args/auth-denial/row-absence failures, and outcome-first idempotency (`packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:640`, `:788`).
  Gaps: the update/move split, UUID gating, and empty-update rejection have no isolated unit tests.
- **Deepening opportunity:** the update/move fan-out (`performTool` at `packages/runtime-control/src/application/task-tools.ts:742`) is a candidate for its own sub-seam so the two-phase mutation can be tested independently.

### Runtime-Control domain model - `packages/runtime-control/src/domain/assistant.ts`
- **Interface (the seam):** the status vocabularies, entity shapes, and pure predicates.
  `assistantConversationStatuses` (`open`, `archived`), `assistantTurnRoles` (`user`, `assistant`, `tool`, `system`), `assistantTurnStatuses` (`queued`, `streaming`, `finalizing`, `final`, `failed`), and `assistantToolOutcomeStatuses` (`started`, `succeeded`, `failed`) are exported `as const` arrays and derived types (`packages/runtime-control/src/domain/assistant.ts:4`, `:7`, `:10`, `:19`).
  The entity interfaces `AssistantConversation`, `AssistantTurn`, `AssistantToolOutcome` are the shared row shapes (`packages/runtime-control/src/domain/assistant.ts:22`, `:34`, `:52`).
  Parsers `parseAssistantConversationStatus`, `parseAssistantTurnRole`, `parseAssistantTurnStatus`, `parseAssistantToolOutcomeStatus` return `Result<T>` and never throw (`packages/runtime-control/src/domain/assistant.ts:91`, `:102`, `:111`, `:120`).
  `normalizeRuntimeKey` trims and rejects empty or over-180-character keys (`packages/runtime-control/src/domain/assistant.ts:131`).
  Predicates `canAppendAssistantDelta`, `canFinalizeAssistantTurn`, `isTerminalAssistantTurnStatus` encode the turn state machine (`packages/runtime-control/src/domain/assistant.ts:155`, `:159`, `:163`).
- **Behind the seam (implementation):** the enum sets and a single generic `parseEnum` helper that backs all four parsers (`packages/runtime-control/src/domain/assistant.ts:69`, `:78`).
  Note: `canAppendAssistantDelta` and `canFinalizeAssistantTurn` have identical bodies (both accept only `queued` or `streaming`), which is a minor smell worth noting.
- **Adapters:** none; this is pure domain logic with no port involvement.
- **Depth:** moderate.
  Deletion test: removing it forces the status vocabulary and the key-length rules into the schema and application layers, where they would drift apart; the file is compact but it is the single source of the vocabulary.
- **Seams:** external seam is the exported vocabulary and predicates; no internal seams, no outbound dependencies beyond `@opzava/shared-kernel`.
- **Testing through the interface:** `packages/runtime-control/src/domain/assistant.test.ts` covers the state-machine predicates and rejection of an unknown turn status (`assistant.test.ts:12`, `:30`).
  Gaps: `normalizeRuntimeKey` empty/over-length edges and the conversation/outcome status parsers have no isolated tests.
- **Deepening opportunity:** none - already deep for its scope; optionally collapse the two identical predicates into one named `canMutateAssistantTurn` if their semantics are meant to stay coupled.

### Runtime-Control Postgres schema - `packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts`
- **Interface (the seam):** exported Drizzle table and enum declarations: `assistantConversations`, `assistantTurns`, `assistantToolOutcomes`, the four `pgEnum`s, and the `appRole`/`ownerRole` role bindings (`packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts:22`, `:25`, `:36`, `:79`, `:134`).
  The invariant a caller must know is that RLS is enabled on all three tables and every query is scoped by `app.current_org_id()`.
- **Behind the seam (implementation):** the schema binds the domain vocabulary to the database shape by importing the `as const` status arrays directly from the domain model, so the domain is the single source and the schema is its projection (`packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts:15`).
  Each table carries the same three-policy pattern: a permissive `tenant_isolation` policy (`organization_id = app.current_org_id()`), a restrictive `context_required` policy (`app.current_org_id() is not null`), and an owner/admin bypass policy; all three tables call `.enableRLS()` (`packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts:58`, `:64`, `:70`, `:77`, `:113`, `:119`, `:125`, `:132`, `:161`, `:167`, `:173`, `:180`).
  Uniqueness is load-bearing: turns have `uniqueIndex` on `(organization_id, conversation_id, idempotency_key)` (the physical backing for `on conflict do nothing` in the application) and outcomes have `uniqueIndex` on `(turn_id, tool_call_id)` (`packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts:103`, `:153`).
  Supporting indexes cover the `(organization_id, workspace_id)` and `(organization_id, conversation_id, created_at)` access paths (`packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts:54`, `:108`, `:157`).
- **Adapters:** none from the authoritative port map; this is schema infrastructure, not a port adapter.
- **Depth:** deep.
  Deletion test: removing it removes the physical tenant boundary, the idempotency uniqueness that the application relies on, and the enum binding; the RLS policies are the critical deletion test for tenant leaks.
- **Seams:** external seam is the Drizzle table API consumed by the application's hand-written SQL; internal seam is the imported domain vocabulary.
- **Testing through the interface:** the integration test proves RLS hides and rejects cross-tenant access through the runtime-control commands (`packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:1230`).
  Gaps: the owner/admin bypass policy and the restrictive context-required policy are not asserted in isolation; only the permissive isolation path is exercised.
- **Deepening opportunity:** none - already deep; the schema is the truth layer and its depth is structural.

## Cross-cutting notes
- Depth heat: three current deep modules (`assistant-conversations.ts`, `task-tools.ts`, the schema), two moderate (`authorization.ts`, the domain model), and two shallow re-export entries (`index.ts`, `application/index.ts`). `crm-tools.ts` is removed and deferred to the future user-side dashboard (GitHub issue #200).
- Shared coupling and blast radius: the application commands are hard-coupled to the schema's table and column names through hand-written SQL strings, so a column rename in the schema breaks the application with no compile-time signal; the domain vocabulary is shared upward by both the schema and the application, making it the highest-blast-radius small module.
- Patterns observed.
  - RLS/withTenant: every command wraps its work in `withTenant(input.orgId, ...)` and the schema enforces `app.current_org_id()` matching, so tenant denial is structural, not a filter (`packages/runtime-control/src/application/assistant-conversations.ts:584`; `packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts:58`).
  - Projections-are-cache: every mutation re-reads via `RETURNING` or `select`, and task-tool outputs are reconstructed from stored `resultSummary` JSONB on replay, so the database row is truth and in-memory objects are cache (`packages/runtime-control/src/application/assistant-conversations.ts:848`, `:931`; `packages/runtime-control/src/application/task-tools.ts:513`).
  - Tool-policy-first: the task runner defines admitted tool names, accepted argument shapes, parse failure codes, summary truncation, and unknown-key rejection at the seam, stricter than underlying project-management services (`packages/runtime-control/src/application/task-tools.ts:467`). CRM tools were removed on 2026-07-15 (GitHub issue #200).
  - Agnostic-ports: `RuntimeControlDependencies` and `RuntimeControlTaskToolDependencies` take optional injected ports and services, with domain defaults wired in (`packages/runtime-control/src/application/assistant-conversations.ts:64`; `packages/runtime-control/src/application/task-tools.ts:101`).
  - Two-token boundary: not implemented in this package; runtime-control trusts the `RuntimeControlApplicationContext` handed to it and does not itself touch gateway or admin tokens, so the two-token boundary is owned upstream by the broker and identity-access layers.
- Friction clusters: `assistant-conversations.ts` at 1273 lines mixes three concerns (conversation, turn lifecycle, tool outcomes) that the inventory flags as separable sub-seams; `authorization.ts` carries load-bearing policy with no isolated test. The former CRM/task duplication was removed on 2026-07-15 (GitHub issue #200).

## File map
- `packages/runtime-control/src/index.ts` - package entry; re-exports the application and domain surfaces.
- `packages/runtime-control/src/application/index.ts` - re-export surface for the four application modules.
- `packages/runtime-control/src/application/assistant-conversations.ts` - conversation and turn commands, single-writer state machine, idempotency, and tool-outcome recording.
- `packages/runtime-control/src/application/authorization.ts` - `AuthorizationPort` adapter with role-key policy for agent and workspace resources.
- `packages/runtime-control/src/application/crm-tools.ts` - removed on 2026-07-15; its deferred replacement belongs with the future user-side CRM dashboard (GitHub issue #200).
- `packages/runtime-control/src/application/task-tools.ts` - task tool registry, argument parsing, update/move fan-out, and the task executor.
- `packages/runtime-control/src/domain/assistant.ts` - status vocabularies, entity shapes, enum parsers, and turn state-machine predicates.
- `packages/runtime-control/src/domain/index.ts` - re-export of the domain surface.
- `packages/runtime-control/src/adapters/postgres/schema/runtime-control.ts` - Drizzle tables, enums, indexes, and RLS policies for conversations, turns, and tool outcomes.
- `packages/runtime-control/src/adapters/postgres/schema/index.ts` - re-export of the schema module.
- `packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts` - integration coverage of the lifecycle, tool executors, idempotency, and RLS.
- `packages/runtime-control/src/domain/assistant.test.ts` - unit coverage of the turn state-machine predicates.
