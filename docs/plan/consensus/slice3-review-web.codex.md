# Slice 3 Web Surfaces + Security Review - Codex

Adversarial review of `git diff development...HEAD`, focused on `apps/web/**` changes: CRM
pages/actions, ported shell/tasks/card/ask/issues/connections surfaces, command palette, health
pill, and login changes.

## Verdict

**UNSOUND**

The web slice keeps the core tenant authority path mostly session-derived, and the changed client
components do not obviously import server-only database/adapters into a browser bundle. The slice is
still not ship-safe: the new Tasks create surface is not replay-safe, several ported chrome/actions
render fake or misleading controls, validation failures collapse into exceptions instead of
actionable form state, and CRM renders an untrusted URL directly into an anchor attribute.

## Findings

1. **[HIGH] The new task-create modal has no per-render idempotency key, so double-submit creates
   duplicate tasks.** `apps/web/components/tasks/tasks-board.tsx:257` posts the create form without
   any hidden `idempotencyKey`; `apps/web/app/(app)/tasks/actions.ts:21` makes the field optional,
   and `apps/web/app/(app)/tasks/actions.ts:144` only forwards it when present. Concrete failure: a
   user double-clicks Enter/Create, the browser or React sends two `createTaskAction` requests, and
   both reach `createTask` as fresh blind inserts. The replay guard that Slice 2.5 added elsewhere
   is bypassed at the primary web creation surface. Fix: mint `web.task.create:${randomUUID()}` per
   form render/open, include it as a hidden field, require it in `createTaskSchema`, and keep the
   same key stable for retries of that rendered form.

2. **[MEDIUM] The Tasks workspace filter renders all-project chrome without all-project data.**
   `apps/web/app/(app)/tasks/page.tsx:47` loads only `context.workspaceId`, but
   `apps/web/app/(app)/tasks/page.tsx:68` passes every session workspace to the board and
   `apps/web/components/tasks/tasks-board.tsx:618` renders an `All projects` option when more than
   one workspace exists. Concrete failure: selecting another project or `All projects` filters the
   already-loaded current-workspace array, so the UI can show a false empty board and a false
   all-project view. Fix: either load tasks for every workspace the session authorizes via a
   tenant-safe server seam, or remove the project picker and add an explicit DESCOPE note until real
   workspace switching/all-project data exists.

3. **[MEDIUM] CRM and issue/task server actions turn validation failures into exceptions, not
   user-actionable form state.** `apps/web/app/(app)/crm/accounts/actions.ts:69`,
   `apps/web/app/(app)/crm/contacts/actions.ts:87`, `apps/web/app/(app)/crm/deals/actions.ts:93`,
   and `apps/web/app/(app)/crm/tickets/actions.ts:89` throw generic `Error`s for invalid forms;
   `apps/web/app/(app)/issues/actions.ts:76` and `apps/web/app/(app)/tasks/actions.ts:130` do the
   same for domain/parse failures. Concrete failure: a tampered or stale form with an overlong
   field, bad enum, or blank required field lands on an error boundary/generic failure instead of a
   visible validation message tied to the submitted form. Fix: make these actions return structured
   action state (`useActionState` where client-side, or redirect with a safe server-side error token
   where server-only) and map validation/domain errors to inline/global messages while keeping
   `forbidden()` for 403s.

4. **[MEDIUM] The account menu ships fake routes, fake counts, and no-op actions with no DESCOPE
   marker.** `apps/web/components/shell/account-menu.tsx:181` labels `/crm/contacts` as "View
   profile", `apps/web/components/shell/account-menu.tsx:192` hardcodes "5 / 7" tools,
   `apps/web/components/shell/account-menu.tsx:194` labels `/crm/accounts` as "Settings", and
   `apps/web/components/shell/account-menu.tsx:200` makes "Appearance" only close the menu. Concrete
   failure: users can click shell overflow actions that either go to the wrong product surface or do
   nothing, while the hardcoded count implies tenant-specific tool state that was never loaded. Fix:
   remove these rows, wire them to real profile/settings/theme surfaces and live counts, or wrap the
   omitted menu sections in explicit DESCOPE comments.

5. **[MEDIUM] "Approve & send to customer" does not send anything.**
   `apps/web/components/tasks/task-card-detail.tsx:2007` renders the primary quality CTA as "Approve
   & send to customer", but `apps/web/lib/task-card-detail.ts:968` through
   `apps/web/lib/task-card-detail.ts:987` only ensures and approves the local quality review.
   Concrete failure: an operator can believe an external/customer reply was sent when the only
   persisted change is local approval state. Fix: rename the control to "Approve review" for this
   slice, or wire a real customer-send command with authorization, idempotency, and error handling
   before using send language.

6. **[MEDIUM] CRM account websites are rendered as untrusted anchor URLs.**
   `apps/web/app/(app)/crm/accounts/actions.ts:21` and
   `apps/web/app/(app)/crm/accounts/actions.ts:33` accept `website` as any trimmed string up to 500
   characters, and `apps/web/app/(app)/crm/accounts/[id]/page.tsx:132` renders it directly as
   `href={account.website}`. Concrete failure: a stored `data:`, `vbscript:`, browser-extension, or
   other non-HTTP scheme becomes a clickable external link on the account detail page; React blocks
   `javascript:` specifically, but it does not make this attribute safe. Fix: validate and normalize
   CRM websites to `http:`/`https:` in the action/domain layer, reject unsupported schemes, and
   render only the sanitized URL.

## Clean Checks

- Server/client boundary: changed `"use client"` files import server actions and type-only DTOs, but
  I did not find a live import of `@opzava/adapters`, `pg`, `withTenant`, S3/object-store adapters,
  broker env readers, or `next/headers` into a client component.
- Authority: changed CRM pages/actions, task pages, issue actions, shell state, and Ask Opzava route
  derive `orgId`, `workspaceId`, and actor identity from `getAppSessionContext()` rather than hidden
  form fields, route params, or headers.
- Command palette + health: palette task/issue items are built from session-scoped `listTasks` and
  `listIssueProjections`; gateway health uses `BROKER_INTERNAL_URL` from env, wraps fetch with a
  short timeout, and renders only coarse healthy/degraded/unknown text.
- XSS text rendering: user-controlled titles, names, labels, comments, and activity bodies are
  rendered through React text nodes. The only changed `dangerouslySetInnerHTML` is the static theme
  bootstrap script in `apps/web/app/layout.tsx`.
