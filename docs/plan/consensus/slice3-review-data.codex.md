# Slice 3 CRM Data Layer Review - Codex

Adversarial review of `git diff development...HEAD`, focused only on `packages/crm/src/**`,
`packages/identity-access/drizzle/0012_slice3_crm_core.sql`,
`packages/identity-access/drizzle/0013_slice3_per_workspace_card_numbers.sql`, and the card-number
allocation path in `packages/project-management/src/application/tasks.ts`.

## Verdict

**UNSOUND**

The RLS/migration skeleton is mostly in shape, but the current data layer still has confirmed
lost-update races, a stage/pipeline TOCTOU hole, and an idempotency ordering violation. These are
not style issues; they can return false success, write misleading activity, or leave CRM data in a
state the application says it rejects.

## Findings

1. **[HIGH] Deal/ticket transition updates are stale-read/stale-write and can append false
   activity.** `packages/crm/src/application/deals.ts:653` loads the deal,
   `packages/crm/src/application/deals.ts:663` updates it without `status = 'open'`, and
   `packages/crm/src/application/deals.ts:673` appends activity from the stale read. `reopenDeal`
   repeats the pattern at `packages/crm/src/application/deals.ts:709`,
   `packages/crm/src/application/deals.ts:719`, and `packages/crm/src/application/deals.ts:729`;
   `updateTicketStatus` does the same at `packages/crm/src/application/tickets.ts:363`,
   `packages/crm/src/application/tickets.ts:374`, and `packages/crm/src/application/tickets.ts:382`.
   Concrete failure: two concurrent `closeDeal` calls can both read `open`; one writes `won`, the
   other writes `lost`, both return success, and both append `open -> ...` activities. The final row
   contains only the last writer's status, while the timeline records an impossible pair of
   successful closes. Ticket status changes have the same lost-update and false-activity shape. Fix:
   make each transition a guarded row mutation in the same transaction, either by selecting the row
   `for update` before checking status or by using a single CTE/update with an expected status
   predicate. Append activity only from the successfully updated row, and return `crm.conflict` or a
   no-op when the guarded update affects zero rows.

2. **[HIGH] `moveDealStage` validates stage membership before the write, but the database does not
   enforce that the deal's stage belongs to its pipeline.**
   `packages/crm/src/application/deals.ts:577` reads the deal,
   `packages/crm/src/application/deals.ts:582` separately validates the target stage, and
   `packages/crm/src/application/deals.ts:596` updates only by deal id/workspace. The migration FK
   at `packages/identity-access/drizzle/0012_slice3_crm_core.sql:409` protects only
   `(stage_id, organization_id)`, not `(stage_id, pipeline_id, organization_id)`. Concrete failure:
   if the stage row is deleted or moved to another pipeline between validation and update, the
   operation either leaks a raw database error shape through `crm.databaseError` or can persist a
   deal whose `pipeline_id` and `stage_id` disagree. The application then builds the board from a
   state it claims is impossible. Fix: collapse validation and update into one statement, for
   example
   `update crm_deals d set stage_id = s.id from crm_pipeline_stages s where d.id = ... and s.id = ... and s.pipeline_id = d.pipeline_id and s.workspace_id = d.workspace_id returning ...`,
   then append activity from the returned old/new data. Add a database-level composite guard as
   well: a unique key on stage `(id, pipeline_id, organization_id)` plus a deal FK on
   `(stage_id, pipeline_id, organization_id)`.

3. **[MEDIUM] Create idempotency replay happens after local validation, so malformed replays can
   fail instead of returning the existing row.** `createAccount` validates create fields at
   `packages/crm/src/application/accounts.ts:274` before checking the existing idempotency row at
   `packages/crm/src/application/accounts.ts:290`. `createContact`, `createDeal`, and `createTicket`
   repeat this order at `packages/crm/src/application/contacts.ts:247`,
   `packages/crm/src/application/deals.ts:421`, and `packages/crm/src/application/tickets.ts:245`.
   Concrete failure: after a deal has been created with idempotency key `K`, a replay with the same
   key but a malformed account id, invalid currency, or blank title returns `crm.validation` before
   it ever checks for `K`. The tests cover changed-but-well-formed foreign keys, not malformed retry
   payloads, so this violates the requested "return existing row before validation gate" contract.
   Fix: after context/idempotency-key normalization and authorization, enter the tenant transaction
   and return the existing idempotency row before validating mutable create payload fields or
   account/contact/deal/ticket preconditions. Only a genuinely new create should run the full
   validation/precondition path.

4. **[MEDIUM] Parent-account cycle prevention is bounded and org-scoped, but not atomic.** The
   bounded walk in `packages/crm/src/application/accounts.ts:228` to
   `packages/crm/src/application/accounts.ts:260` runs before the update at
   `packages/crm/src/application/accounts.ts:461`. No row lock, serializable transaction, trigger,
   or recursive update predicate prevents two concurrent updates from validating against the old
   graph and then committing a cycle. Concrete failure: transaction A sets account A's parent to B
   while transaction B sets B's parent to A. Each walk can pass before seeing the other's
   uncommitted change, and both updates can commit a cycle despite the application-level check. Fix:
   lock the affected account chain before validation, use a serializable transaction with retry, or
   move the acyclicity check into a single recursive CTE/trigger that rejects cycles at write time.

5. **[MEDIUM] The per-workspace card-number allocator still fails under a normal burst of concurrent
   creates.** `packages/project-management/src/application/tasks.ts:1426` retries only once after
   detecting `tasks_workspace_card_number_unique`, while
   `packages/project-management/src/application/tasks.ts:1472` still allocates with
   `max(card_number) + 1`. The unique index is created at
   `packages/identity-access/drizzle/0013_slice3_per_workspace_card_numbers.sql:40`. Concrete
   failure: with three simultaneous task creates in one workspace, all can read the same max. One
   succeeds, two collide. On the single retry, both can read the next max; one succeeds and the
   other returns a database error. The retry does re-run the idempotency check at
   `packages/project-management/src/application/tasks.ts:1462`, so duplicate-key replays are
   protected, but no-key concurrent creates still fail under modest contention. Fix: replace
   `max + 1` with a per-workspace counter row, transaction-scoped advisory lock, or a bounded retry
   loop with backoff that keeps re-checking idempotency before each insert attempt.

6. **[LOW] The CRM Drizzle schema and hand migration are already drifting.** The Drizzle schema
   declares bare `organizationId`/`workspaceId` columns starting at
   `packages/crm/src/adapters/postgres/schema/crm.ts:44`, while the migration adds column FKs,
   composite workspace FKs, and many length/idempotency checks, for example
   `packages/identity-access/drizzle/0012_slice3_crm_core.sql:122` through
   `packages/identity-access/drizzle/0012_slice3_crm_core.sql:147`. The same drift repeats across
   contacts, pipelines, stages, deals, tickets, and activities. Concrete failure: future
   schema-generated diffs will not faithfully describe the live database. A maintainer can
   accidentally omit, duplicate, or try to drop constraints because the TypeScript schema is not the
   same contract as the SQL migration. Fix: either declare the SQL constraints in
   `packages/crm/src/adapters/postgres/schema/crm.ts` or document that these CRM tables are
   hand-migration authoritative and exclude them from schema-diff generation.

## Clean Checks

- RLS is present on all seven CRM tables in `0012`: each table has `enable row level security`,
  `force row level security`, a permissive tenant policy with symmetric `USING`/`WITH CHECK`, a
  restrictive no-context policy with symmetric `USING`/`WITH CHECK`, and an owner policy.
- Grants match the Slice 1e pattern: one `grant select, insert, update, delete` block to
  `opzava_app`, with table ownership transferred to `opzava_owner`.
- The CRM idempotency indexes are non-partial unique indexes on
  `(organization_id, idempotency_key)`. PostgreSQL keeps NULL values distinct, and
  account/contact/deal/ticket keys do not dedupe across tables.
- Cross-tenant CRM FKs are composite with `organization_id`; application lookups for account,
  contact, pipeline, and stage ids filter by the current workspace under tenant RLS.
- `ensureDefaultPipeline` is safe for the ordinary two-call concurrent insert race because the
  unique conflict waits for the inserting transaction, which inserts stages in the same transaction
  before commit. It does not repair a pre-existing incomplete pipeline.
- Activities have no exported update/delete application path; automatic activities are inserted in
  the same `withTenant` transaction as their associated mutation. Findings 1 and 2 are about stale
  mutation predicates, not separate activity transactions.
- `0013` renumbering is deterministic (`created_at`, then `id`) and rerunnable; the manifest hashes
  for `0012` and `0013` match `sha256sum`, journal indexes 12 and 13 are correct, and no earlier
  migration file is touched in this diff.
