# ADR-020: Tenant bounded-context stores

## Status

Proposed — awaiting owner approval. No implementation in the issue #162 migration may begin until
the owner approves this decision and the RLS error contract below.

## Context

ADR-019 sets the high-level direction for issue #162: bounded-context stores replace application
SQL, adapters become the only SQL owners, and real-Postgres tests continue to prove RLS
(`docs/adr/ADR-019-provisioning-service-modularization.md:157-168`). Its prerequisite, issue #161,
is merged. This ADR defines the store boundaries, transaction semantics, denial contract, structural
enforcement, reference implementation, and migration order needed to execute that direction.

Today every bounded context constructs SQL in its application layer. Runtime-Control imports
`mapDatabaseError`, `sql`, `withTenant`, and `TenantTransaction` directly from `@opzava/adapters`
(`packages/runtime-control/src/application/assistant-conversation-lifecycle.ts:1-6`), and its tool
outcome flow repeats the same dependency
(`packages/runtime-control/src/application/assistant-conversation-outcomes.ts:1-6`). Identity &
Access goes further: first-owner setup imports the adapter database directly and imports Drizzle's
`sql` itself (`packages/identity-access/src/application/first-owner-setup.ts:1-5`). Project
Management's task application is 3,330 lines and combines board, card, quality, confirmation, and
terminal-transition persistence (`packages/project-management/src/application/tasks.ts:2993-3158`).

The exposed transaction is not a domain abstraction. `TenantTransaction` is derived directly from
the transaction callback type of the installed Drizzle client, and `TenantQueryable.execute` accepts
a Drizzle `SQL` value (`packages/adapters/src/postgres/tenant-context.ts:13-21`). Application code
therefore depends on an adapter implementation while retaining unrestricted query power. Even the
mechanical result normalization leaks and is redefined in approximately 24 files; examples include
Runtime-Control (`assistant-conversation-lifecycle.ts:108-129`), the tenant runner
(`packages/adapters/src/postgres/tenant-context.ts:29-40`), and the RLS integration suite
(`packages/adapters/src/postgres/__tests__/tenant-rls.integration.test.ts:25-36`).

This is also an isolation problem, not only a code-organization problem. ADR-007 establishes that
Organization is the tenant and that missing or mismatched tenant context is a hard 403, never a
silent empty state (`docs/adr/ADR-007-rbac-rls.md:7,68-85`). The current centralized runner has the
right mechanics: it validates the organization UUID, checks that the runtime role is the non-owner
`opzava_app` role, sets the transaction-local `app.current_org` GUC, round-trip verifies that value,
and maps database errors (`packages/adapters/src/postgres/tenant-context.ts:85-108`). The
architecture must make that runner unavoidable without exposing its Drizzle transaction callback to
applications.

## Decision

### Put store contracts inside their bounded contexts

Define store interfaces in the bounded context that owns their language and types, for example
`packages/runtime-control/src/ports/runtime-conversation-store.ts`. Do **not** put these interfaces
in `packages/ports`: that shared package may not depend on bounded-context types, and moving domain
types outward to satisfy it would reverse the dependency direction.

Every tenant operation takes one explicit branded scope:

```ts
interface TenantScope {
  readonly organizationId: OrganizationId;
}

interface WorkspaceScope extends TenantScope {
  readonly workspaceId: WorkspaceId;
}
```

`organizationId` is the tenant, as fixed by ADR-007 (`docs/adr/ADR-007-rbac-rls.md:21-27`). Scope is
required even when a command or result contains an organization or workspace identifier; duplicated
identifiers must agree or the operation fails closed. A store contract may expose only domain-typed
commands, results, and complete operations. It must not expose generic `query()`, `execute()`, SQL
fragments, a transaction callback, a transaction handle, or any equivalent escape hatch.

### Split stores by aggregate and complete operation

Do not create one store per package. Use cohesive aggregate and workflow boundaries:

- Project Management: `TaskBoardStore`, `TaskCardStore`, and `TaskQualityStore`, plus
  `IssueProjectionStore` and `IssueCloseOutboxStore`.
- Identity & Access: `LinkTokenStore`, `AuthorizationVersionStore`, and `FirstOwnerBootstrapStore`.
- Runtime-Control: `RuntimeConversationStore` as the first reference implementation.

`FirstOwnerBootstrapStore` is the **one intentional unscoped exception**. It creates the first
organization before a tenant scope exists. Its narrow bootstrap contract must not become a general
unscoped database capability; the present flow's direct root-database dependency shows why the
exception must be named and contained
(`packages/identity-access/src/application/first-owner-setup.ts:1-11`).

Store methods represent complete domain operations, including all locking, idempotency, compare and
set, outbox, and rollback behavior required for one invariant. For example,
`consumeConfirmationAndMarkTaskDone` atomically validates and consumes the confirmation and performs
the terminal transition. It must never become one method to consume a nonce followed by another to
mark the task done. The current implementation deliberately performs both writes in one tenant
transaction and throws to roll back nonce consumption if the task transition fails
(`packages/project-management/src/application/tasks.ts:3080-3149`). Multi-statement atomicity is a
property of the store operation, not an application-composed transaction.

### Use `RuntimeConversationStore` as the reference implementation

Runtime-Control is cohesive and does not carry the bootstrap or authorization-version exceptions, so
it is the first store and the pattern later stores follow. Its complete contract is:

```ts
interface RuntimeConversationStore {
  createConversation(
    scope: WorkspaceScope,
    command: CreateConversationCommand,
  ): Promise<Result<AssistantConversation>>;
  appendUserTurn(
    scope: WorkspaceScope,
    command: AppendUserTurnCommand,
  ): Promise<Result<AssistantTurn>>;
  startAssistantTurn(
    scope: WorkspaceScope,
    command: StartAssistantTurnCommand,
  ): Promise<Result<AssistantTurn>>;
  appendAssistantDelta(
    scope: WorkspaceScope,
    command: AppendAssistantDeltaCommand,
  ): Promise<Result<AssistantTurn>>;
  finalizeAssistantTurn(
    scope: WorkspaceScope,
    command: FinalizeAssistantTurnCommand,
  ): Promise<Result<AssistantTurn>>;
  failAssistantTurn(
    scope: WorkspaceScope,
    command: FailAssistantTurnCommand,
  ): Promise<Result<AssistantTurn>>;
  startToolOutcome(
    scope: WorkspaceScope,
    command: StartToolOutcomeCommand,
  ): Promise<Result<StartedToolOutcomeReceipt>>;
  finishToolOutcome(
    scope: WorkspaceScope,
    command: FinishToolOutcomeCommand,
  ): Promise<Result<AssistantToolOutcome>>;
  findOpenConversation(
    scope: WorkspaceScope,
    query: FindOpenConversationQuery,
  ): Promise<Result<AssistantConversation | null>>;
  listTurns(
    scope: WorkspaceScope,
    query: ListConversationTurnsQuery,
  ): Promise<Result<readonly AssistantTurn[]>>;
  listTaskAssistantRuns(
    scope: WorkspaceScope,
    query: ListTaskAssistantRunsQuery,
  ): Promise<Result<readonly TaskAssistantRun[]>>;
}
```

These methods absorb all related SQL and mapping, not merely the obvious write statement:

- `createConversation` owns the insert and returned-row mapping currently at
  `assistant-conversation-lifecycle.ts:541-601`.
- `appendUserTurn` and `startAssistantTurn` each own conversation-scope validation, idempotent
  insert, replay lookup, and replay validation currently at
  `assistant-conversation-lifecycle.ts:604-779`.
- `appendAssistantDelta` owns the locked read, state validation, compare-and-set update, and mapping
  currently at `assistant-conversation-lifecycle.ts:782-845`.
- `finalizeAssistantTurn` owns the single-writer claim and final update as one operation; failure
  between those statements rolls back the claim (`assistant-conversation-lifecycle.ts:848-928`).
- `failAssistantTurn` owns its idempotent terminal transition and fallback read
  (`assistant-conversation-lifecycle.ts:931-992`).
- `startToolOutcome` owns turn validation, idempotent insert, replay lookup, and replay validation
  (`packages/runtime-control/src/application/assistant-conversation-outcomes.ts:50-120`), while
  `finishToolOutcome` owns the locked receipt read, replay/conflict rules, and single-writer update
  (`assistant-conversation-outcomes.ts:122-196`).
- `findOpenConversation` and `listTurns` absorb the web read-path SQL currently in
  `apps/web/lib/ask-admin-history.ts:136-153,168-190`.
- `listTaskAssistantRuns` absorbs the joined turn/tool-outcome read and row aggregation currently in
  `apps/web/lib/task-card-ai-run.ts:110-179`.

Applications continue to own authorization, input validation, orchestration, and presentation
mapping. They inject and call this contract; they neither know that Postgres is used nor receive a
database transaction.

### Make the Postgres adapter the only SQL owner

Implement Postgres stores under `packages/adapters/src/postgres/stores/`. The adapter accepts only
domain-typed scope and commands. It alone owns:

- Drizzle imports and SQL construction;
- `rowsFromExecuteResult` and other driver-result normalization;
- database row to domain record mapping and the inverse command mapping;
- locking, compare-and-set, and multi-statement transactions internal to one store operation; and
- database-error classification and mapping.

Every tenant store operation runs all of its SQL inside `withTenant(scope.organizationId, ...)`. The
runner's UUID and runtime-role validation, transaction-local GUC, round-trip verification, and
centralized mapping remain mandatory (`packages/adapters/src/postgres/tenant-context.ts:85-108`).
`withTenant`, its transaction type, and raw SQL are adapter internals after migration; making a base
class available to callers is not an acceptable substitute for making bypass impossible.

### Preserve tenant denial as a domain error

Introduce `TenantAccessDeniedError extends DomainError` with `status = 403`. The Postgres adapter
converts a mapped `ForbiddenError` into `TenantAccessDeniedError` at its boundary. Applications
return that error unchanged. They must **never** catch it and convert it to `notFound`, `[]`,
`null`, or success.

Use this RLS error contract:

- Missing tenant context and SQLSTATE `42501` RLS denial become a hard 403
  `TenantAccessDeniedError`.
- Targeted opaque-resource access — a read for a specific ID that the caller cannot see — becomes a
  hard 403, **not** `notFound`.
- A valid list query may legitimately return an empty collection because PostgreSQL RLS filters rows
  silently. That is normal list semantics, not a denial.
- SQLSTATE `23503` is a foreign-key violation and must be classified separately from RLS denial. The
  current mapper groups both `42501` and `23503` as forbidden and maps either to 403
  (`packages/adapters/src/postgres/errors.ts:1-2,88-106`); this can misclassify a legitimate
  referential-integrity failure and must be narrowed.

The real-Postgres baseline demonstrates both relevant native behaviors: a tenant-scoped list sees
zero rows owned by another tenant, while a cross-tenant write is rejected as forbidden
(`packages/adapters/src/postgres/__tests__/tenant-rls.integration.test.ts:123-157`). Because a
filtered targeted `SELECT` cannot tell an inaccessible foreign identifier from a nonexistent one,
the store operation must define and test the targeted-read 403 policy explicitly rather than infer
it from row count alone.

### Keep contract suites local and run them against fake and Postgres adapters

Each bounded context owns one portable store contract module. Do not create `packages/testing` yet:
there is no second cross-package consumer to justify it. This follows the existing contract-test
precedent that exercises multiple object-store implementations in one suite
(`packages/adapters/src/object-store/__tests__/object-store-contract.test.ts:1-5`).

Run every context contract against both:

1. an in-memory fake, proving operation logic, idempotency, transitions, and application behavior;
2. the real Postgres adapter, proving SQL mapping, transaction atomicity, runtime-role enforcement,
   RLS isolation, and the hard-403 contract.

Real-Postgres RLS tests are mandatory. A fake cannot prove PostgreSQL policy behavior, SQLSTATE
mapping, transaction-local GUC handling, or the runtime role. The existing integration guard already
fails loudly unless tests use non-owner, non-superuser, non-`BYPASSRLS` `opzava_app`
(`packages/adapters/src/postgres/__tests__/tenant-rls.integration.test.ts:82-101`).

### Enforce RLS structurally in four layers

The guarantee is the conjunction of four layers:

1. **Type boundary:** store contracts expose only branded scope, domain commands, complete domain
   operations, and domain results.
2. **Package/import boundary:** bounded-context `domain`, `application`, and `ports` paths cannot
   import `@opzava/adapters` or `drizzle-orm`. Enforce this with a path-specific ESLint rule.
3. **Adapter runner:** every SQL statement for tenant data is adapter-owned and routed through
   `withTenant`; no public callback or SQL escape hatch exists.
4. **Contract and integration tests:** fakes prove logic, while real Postgres proves RLS isolation,
   runtime-role enforcement, atomicity, and 403 mapping.

A linter alone cannot prove runtime RLS or atomicity. A base class alone can be bypassed and cannot
prevent SQL imports. Tests without restrictive types and imports permit new bypasses. All four
layers are required.

### Deliver one bounded context at a time

Use nine sequential PRs, never a big-bang rewrite:

0. **Foundation:** ADR-020, `TenantAccessDeniedError`, the adapter row-result helper, and the ESLint
   import rule. No behavior change.
1. **Runtime store:** add `RuntimeConversationStore`, its in-memory fake, Postgres adapter, portable
   contracts, and mandatory real-Postgres RLS tests as the reference implementation.
2. **Runtime switch:** migrate Runtime-Control applications and the web read paths to the proven
   store, then delete their inline SQL.
3. **Identity bootstrap:** introduce `FirstOwnerBootstrapStore` as the sole intentional unscoped
   exception and migrate first-owner setup.
4. **Identity tenant stores:** migrate link tokens, authorization version, and session reads.
5. **Task board:** introduce and migrate `TaskBoardStore`.
6. **Task card and quality:** introduce and migrate `TaskCardStore` and `TaskQualityStore`,
   preserving operation-level atomicity.
7. **Issues:** introduce and migrate `IssueProjectionStore` and `IssueCloseOutboxStore`.
8. **Closure:** remove public `sql`, `withTenant`, and `TenantTransaction` exports from the adapter
   barrel; make the import rule blocking; migrate any remaining outliers; and prove no application
   SQL remains.

In each slice, leave existing inline SQL intact while the new store and both contract targets are
being proven. Delete the replaced SQL in that same PR or the immediately following application
switch PR. Do not maintain two active persistence paths beyond that bounded transition.

## Owner decisions required before acceptance

### Approve ADR-020

**Recommended: approve this ADR-020.** This ratifies bounded-context-local store placement,
operation-level transaction semantics, the prohibition on generic query and transaction escape
hatches, and the four-layer RLS guarantee.

### Approve the RLS error contract

**Recommended: approve targeted = 403, list = may be empty, and separate `23503` from RLS.** Missing
tenant context and SQLSTATE `42501` remain hard 403; targeted opaque-resource access is hard 403,
not `notFound`; valid list queries may legitimately be empty; and foreign-key violations receive a
separate referential-integrity classification rather than the RLS denial classification.

## Consequences

- SQL becomes reviewable by bounded context, aggregate, and complete domain operation.
- Adapters are the only SQL owners; application and domain code no longer know Drizzle or receive a
  database transaction.
- RLS-is-403 becomes structural rather than a convention dependent on each catch block.
- Atomic operations retain one transaction owner even as the application layer becomes persistence
  agnostic.
- Every store requires a portable fake/Postgres contract and mandatory RLS integration coverage.
- Delivery takes approximately nine deliberately sequential PRs, with short-lived duplication while
  each store is proved before its old SQL is removed.

## Alternatives

- **Create a universal `TenantStore`.** Rejected: generic query or transaction methods recreate
  `TenantTransaction` under a different name, erase bounded-context vocabulary, and make complete
  operation boundaries optional.
- **Put bounded-context stores in `packages/ports`.** Rejected: the shared package cannot depend on
  bounded-context types without reversing dependencies or moving domain language into the wrong
  owner.
- **Create `packages/testing` now.** Rejected: there is no second consumer for a cross-package store
  contract framework. Context-local contract modules are sufficient and easier to delete or evolve.
- **Replace all database tests with in-memory fakes.** Rejected: fakes cannot prove PostgreSQL RLS,
  SQLSTATE mapping, runtime-role enforcement, or transaction-local tenant context.
- **Use one `TaskStore`.** Rejected: wrapping the current 3,330-line task application in one store
  would recreate the monolith and mix board, card, quality, confirmation, and transition concerns
  (`packages/project-management/src/application/tasks.ts:1-3330`).
- **Rely only on a linter or only on a store base class.** Rejected: neither independently proves
  runtime isolation, prevents every bypass, or preserves operation-level atomicity.

## Residual risk

PostgreSQL RLS filters a targeted `SELECT` in the same way for an inaccessible foreign opaque ID and
a nonexistent ID. The database cannot distinguish those cases for the caller. The targeted-read 403
policy must therefore be explicit in each relevant store contract and verified against real
Postgres; an accidental row-count-to-`notFound` mapping would regress the decision.

Multi-store workflows can also regress atomicity if applications compose independent methods that
must succeed or fail together. Reviews and contract tests must require a complete domain-atomic
store operation whenever an invariant crosses multiple statements or records. A generic unit-of-work
callback is not the remedy because it would re-expose the persistence mechanism this ADR removes.

Until PR8 removes the adapter barrel exports and makes the path-specific import rule blocking,
legacy application SQL remains an available bypass. Migration slices must keep that exposure
shrinking and must not add new inline SQL.

## Related decisions and issues

- ADR-007: Organization is the tenant; Postgres RLS and hard-403 denial semantics.
- ADR-019: high-level issue #162 direction and separation from provisioning modularization.
- Issues #161 and #162.
