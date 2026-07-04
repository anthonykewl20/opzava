# Slice 3 Fix Pack Re-Review - Codex

Convergence re-review of the last three fix commits:

- `a4c757a` lane-1 data fixes
- `9d3e386` lane-2 web fixes
- `2da6988` lane-3 tools fixes

Scope was the three fix diffs plus enough surrounding code to trace the affected application and
web call paths. Source was reviewed read-only.

## Verdict

**FAIL**

Most original data-layer and runtime-tool issues are closed, but the web fix pack still leaves one
task form path throwing validation/domain failures, and the lane-3 list pagination change introduced
silent truncation in CRM web pages that render first-page data as if it were complete.

## Requested Item Results

### Lane 1 - Data

1. **PASS** - `closeDeal`, `reopenDeal`, and `updateTicketStatus` now use guarded in-transaction
   mutations instead of stale read-then-write transitions. `closeDeal` guards the update on
   `status = 'open'` at `packages/crm/src/application/deals.ts:724`; `reopenDeal` and
   `updateTicketStatus` lock candidates and re-check old status in the update at
   `packages/crm/src/application/deals.ts:833` and `packages/crm/src/application/tickets.ts:368`.
   Zero-row disambiguation happens after the guarded mutation attempt in the same transaction, so it
   does not append false activity.
2. **PASS** - `moveDealStage` is a single update-join guarded on stage/pipeline/workspace/org at
   `packages/crm/src/application/deals.ts:595`. Migration `0014` adds the unique index on
   `(id, pipeline_id, organization_id)` and FK from `(stage_id, pipeline_id, organization_id)` to the
   same ordered columns at `packages/identity-access/drizzle/0014_slice3_deal_stage_coherence.sql:26`
   and `packages/identity-access/drizzle/0014_slice3_deal_stage_coherence.sql:37`. The migration is
   rerunnable, manifest hash matches, and journal idx 14 is present.
3. **PASS** - Replay-before-validation is now before mutable payload validation and enum parses in
   all four create paths: accounts at `packages/crm/src/application/accounts.ts:289`, contacts at
   `packages/crm/src/application/contacts.ts:258`, deals at
   `packages/crm/src/application/deals.ts:452`, and tickets at
   `packages/crm/src/application/tickets.ts:259`.
4. **PASS** - Advisory locks are transaction-scoped and inside the transaction: account graph uses
   `crm_account_graph:<orgId>` at `packages/crm/src/application/accounts.ts:453`, and task card
   numbers use `task_card:<workspaceId>` at `packages/project-management/src/application/tasks.ts:1469`.
   I did not find an opposing lock acquisition order. `hashtext` collisions can over-serialize
   unrelated orgs/workspaces, but do not break correctness.
5. **PASS** - The burst test is real for the reviewed failure mode: three no-key creates run through
   `Promise.all` in the same workspace and assert all succeed with distinct card numbers at
   `packages/project-management/src/__tests__/slice1e-tasks.integration.test.ts:331`.

### Lane 2 - Web

1. **PASS** - Task create idempotency is required by schema at
   `apps/web/app/(app)/tasks/actions.ts:22`, and the create modal mints one key per form mount/render
   with `useState` at `apps/web/components/tasks/tasks-board.tsx:243`.
2. **PASS** - The project filter is honest now: `apps/web/app/(app)/tasks/page.tsx:68` narrows
   workspaces to the current workspace with a DESCOPE note, and the select is disabled at
   `apps/web/components/tasks/tasks-board.tsx:626`.
3. **FAIL** - `useActionState`-backed forms render returned messages, but not every changed task
   form uses that path. See finding 1.
4. **PASS** - The account menu no longer ships fake profile/settings/tool-count rows, and Appearance
   now toggles a real theme preference at `apps/web/components/shell/account-menu.tsx:206`.
5. **PASS** - The quality CTA now says `Approve review` and carries a customer-send DESCOPE at
   `apps/web/components/tasks/task-card-detail.tsx:2007`.
6. **PASS** - Website rendering no longer uses raw stored strings as anchors. Create/update actions
   normalize to http/https at `apps/web/app/(app)/crm/accounts/actions.ts:78` and
   `apps/web/app/(app)/crm/accounts/actions.ts:123`; detail rendering re-sanitizes with
   `accountWebsiteHref` at `apps/web/app/(app)/crm/accounts/[id]/page.tsx:95`. `data:`,
   `vbscript:`, uppercase schemes, and whitespace-broken schemes are rejected by URL protocol checks;
   protocol-relative `//host` input is normalized to `https://host/`.

### Lane 3 - Tools

1. **PASS** - The admitted runtime CRM tool lane now calls only list/timeline CRM services from
   `packages/runtime-control/src/application/crm-tools.ts:922`. The `listDeals` service no longer
   calls `ensureDefaultPipelineInTx`; it only selects an existing default pipeline at
   `packages/crm/src/application/deals.ts:1058`. The added row-count test covers all five tools at
   `packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:1059`.
2. **FAIL** - SQL list pagination is real in the CRM services and `hasMore` is computed from
   `limit + 1`, but the web pages consuming the new page shape are not correct. See finding 2.
3. **PASS** - Timeline truncation is applied in runtime-control at
   `packages/runtime-control/src/application/crm-tools.ts:709`, with `truncated` and
   `originalLength` flags included for long summaries.

## Findings

1. **[MEDIUM] Task status-chip mutations still throw form/domain errors instead of returning
   structured form state.** `apps/web/components/tasks/tasks-board.tsx:405` submits the status-chip
   form directly to `moveTaskAction`. That action still throws a generic error for malformed hidden
   fields at `apps/web/app/(app)/tasks/actions.ts:209` and throws domain failures through
   `throwTaskActionError` at `apps/web/app/(app)/tasks/actions.ts:222`. Concrete failure: a stale
   board card, tampered hidden `status`, invalid `position`, or concurrently deleted task still
   lands on a generic action failure/error boundary instead of a visible form message, even though
   create/update task forms now use `ActionStateForm`. Fix: convert the status-chip form to an
   `ActionStateForm`-compatible action or redirect back to `/tasks` with a safe server-side error
   token; map validation/domain errors to a rendered message while preserving `forbidden()` for 403.

2. **[MEDIUM] CRM web pages silently render only the first 200 CRM rows as complete data.**
   The lane-3 services now return pages, but web pages call those services with `limit: 200` and then
   ignore `hasMore`/`totalCount`: accounts at `apps/web/app/(app)/crm/accounts/page.tsx:30`, contacts
   at `apps/web/app/(app)/crm/contacts/page.tsx:29`, deals at
   `apps/web/app/(app)/crm/deals/page.tsx:52`, tickets at
   `apps/web/app/(app)/crm/tickets/page.tsx:53`, and account detail relationship loads at
   `apps/web/app/(app)/crm/accounts/[id]/page.tsx:36`. Concrete failure: a workspace with 201
   accounts, contacts, deals, or tickets drops row 201 from the table, relationship sections, and
   create/edit dropdowns without any pagination or "more results" state. Deal page counts are
   computed from returned rows at `apps/web/app/(app)/crm/deals/page.tsx:101`, so the header can say
   all work is shown while data is missing. Fix: add web pagination/load-more using service offsets
   or cursors, or render an explicit first-page-only state using `hasMore` and `totalCount`; for
   account/contact detail pages, use filtered server queries instead of first-page client filtering.

## Verification

- `pnpm --filter @opzava/web test -- test/crm-pages.test.ts test/tasks-board-view.test.ts`:
  blocked before tests by pnpm/Corepack `[ERR_SQLITE_ERROR] unable to open database file`.
- Retried pnpm with `XDG_CACHE_HOME=/tmp/codex-xdg-cache npm_config_store_dir=/tmp/codex-pnpm-store`;
  blocked by the same pnpm/Corepack SQLite error.
- `./node_modules/.bin/tsc --noEmit -p packages/crm/tsconfig.json`: passed.
- `./node_modules/.bin/tsc --noEmit -p packages/runtime-control/tsconfig.json`: passed.
- `./node_modules/.bin/tsc --noEmit -p packages/project-management/tsconfig.json`: passed.
- From `apps/web`, `../../node_modules/.bin/tsc --noEmit -p tsconfig.json`: passed.
- From `apps/web`,
  `../../node_modules/.bin/vitest run test/crm-pages.test.ts test/tasks-board-view.test.ts`: passed,
  2 files / 8 tests.
- Direct DB integration attempt
  `./node_modules/.bin/vitest run packages/crm/src/__tests__/slice3-crm.integration.test.ts packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts packages/project-management/src/__tests__/slice1e-tasks.integration.test.ts`:
  blocked because `DATABASE_MIGRATION_URL` is not set.
