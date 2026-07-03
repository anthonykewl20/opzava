# Slice 3 Runtime Tools + Provisioning + Docker Review - Codex

Adversarial review of `git diff development...HEAD`, focused on the runtime-control CRM tools, Ask
Admin tool dispatch and fake-Gateway inventory, Ask Admin provisioning policy/artifact changes, and
the web Docker image build path.

## Verdict

**UNSOUND**

The provisioning allowlist is narrow and the Docker image now builds from a clean context, but the
runtime tool lane violates its own central guarantee: a CRM "read" tool can write CRM pipeline rows.
The CRM tool outputs are also only cosmetically capped; large tenants can still make the tool
runtime load huge result sets, and contact timelines can push hundreds of kilobytes of free text
into the assistant turn.

## Findings

1. **[HIGH] `opzava_crm_list_deals` is not read-only; it can create the default pipeline and
   stages.** `apps/web/app/api/tasks/ask-admin/turn/route.ts:404` dispatches CRM tool calls to
   `executeRuntimeControlCrmTool`, `packages/runtime-control/src/application/crm-tools.ts:940`
   executes `services.listDeals`, and `packages/crm/src/application/deals.ts:1039` calls
   `ensureDefaultPipelineInTx` before reading deals. That helper writes at
   `packages/crm/src/application/deals.ts:301` and `packages/crm/src/application/deals.ts:322`.
   Concrete failure: a user with CRM read authorization but no create intent asks Ask Admin to list
   deals in a workspace with no pipeline yet; the supposedly read-only tool inserts `crm_pipelines`
   and `crm_pipeline_stages` rows and records a successful read tool outcome. Fix: split a pure
   `listDealsReadOnly` path that selects an existing default pipeline and returns an empty/degraded
   board if it is absent. Only explicit create/setup flows should call `ensureDefaultPipelineInTx`,
   and tests should assert every admitted CRM tool leaves the CRM table row counts unchanged.

2. **[MEDIUM] The list caps are applied after unbounded CRM reads, so a large CRM can exhaust the
   tool turn before it returns a bounded result.** The registry advertises `limit?: 1..50` at
   `packages/runtime-control/src/application/crm-tools.ts:46`,
   `packages/runtime-control/src/application/crm-tools.ts:50`,
   `packages/runtime-control/src/application/crm-tools.ts:54`, and
   `packages/runtime-control/src/application/crm-tools.ts:59`, but the runtime slices only after the
   service returns full arrays at `packages/runtime-control/src/application/crm-tools.ts:916`,
   `packages/runtime-control/src/application/crm-tools.ts:931`,
   `packages/runtime-control/src/application/crm-tools.ts:946`, and
   `packages/runtime-control/src/application/crm-tools.ts:966`. The backing queries have no SQL
   limit, for example `packages/crm/src/application/accounts.ts:581`,
   `packages/crm/src/application/contacts.ts:545`, `packages/crm/src/application/deals.ts:1044`, and
   `packages/crm/src/application/tickets.ts:585`. Concrete failure: a tenant with hundreds of
   thousands of contacts asks for `{ limit: 10 }`; the tool still selects, maps, and counts the full
   contact table before returning ten rows, leaving the assistant turn slow, memory-heavy, or stuck
   with a started receipt. Fix: add limit/offset or cursor inputs to the CRM list application
   services, push `limit + 1` into SQL, and return `hasMore`/coarse counts without materializing the
   whole workspace.

3. **[MEDIUM] Contact timeline output can dump up to 200k characters of activity body into one tool
   result.** The timeline schema allows `limit?: 1..50` at
   `packages/runtime-control/src/application/crm-tools.ts:63`, and `activitySummary` copies the full
   body into `summary` at `packages/runtime-control/src/application/crm-tools.ts:711` through
   `packages/runtime-control/src/application/crm-tools.ts:718`. User-authored activity bodies are
   allowed up to 4000 characters at `packages/crm/src/application/activities.ts:85`, backed by the
   database check at `packages/identity-access/drizzle/0012_slice3_crm_core.sql:508`. Concrete
   failure: 50 long notes on a contact produce roughly 200k characters of body text in the SSE
   `tool.succeeded` event and assistant tool outcome, before counting JSON overhead. That is enough
   to blow or crowd out the model context even though the row count is capped. Fix: cap per-activity
   summaries in runtime-control, include a `truncated` flag and original character count, and
   require the model to ask for a narrower timeline/page if it needs more.

## Clean Checks

- Authority: CRM tool args cannot carry tenant scope. The web route builds `ToolExecutionContext`
  from `getAppSessionContext()` at `apps/web/app/api/tasks/ask-admin/turn/route.ts:560`, and the CRM
  tool service context uses only `context.orgId`, `context.workspaceId`, and `context.actor` at
  `packages/runtime-control/src/application/crm-tools.ts:606`.
- Forbidden versus absent records: runtime-control maps `crm.forbidden`/403 to `forbidden` and
  `crm.notFound` to `not_found` at `packages/runtime-control/src/application/crm-tools.ts:571`.
  Cross-tenant timeline probes are therefore hidden as not found after the workspace-scoped CRM
  read.
- Registry coherence: the five CRM tool names match across `runtimeControlCrmToolNames`,
  `runtimeControlCrmToolRegistry`, web dispatch, Ask Admin provisioning, and fake-Gateway
  `tools.effective`. I did not find a CRM tool present in one of those surfaces and absent from
  another.
- Provisioning: `apps/workers/src/provisioning/ask-admin-agent.ts:36` adds only the five
  `opzava_crm_*` read tools to the prior task-tool allowlist. The deny-wins policy still denies
  `group:runtime`, `write`, `edit`, `apply_patch`, and `group:fs` at
  `apps/workers/src/provisioning/ask-admin-agent.ts:28`.
- Provisioning receipts: the rendered artifact snapshots, agent config hash, tool-policy hash, and
  device-token receipt version were updated together in
  `apps/workers/src/provisioning/__tests__/ask-admin-agent.test.ts:245`. Grep found no stale
  `2026-07-02.slice2e`, `2026-07-03.slice2-live`, or old receipt hash constants.
- Docker: every pnpm-lock importer under `apps/*` and `packages/*` has its `package.json` copied in
  the deps stage at `apps/web/Dockerfile:11` through `apps/web/Dockerfile:22`; this matches the
  `pnpm-workspace.yaml` globs. A real `docker build -f apps/web/Dockerfile .` completed, and the
  final runner image contains `/app/apps/web/server.js`, `.next/static`, and `public`.
- Docker secrets: `.dockerignore` excludes `.env`, `.env.*`, `secrets/*`, and `.dev-secrets/`.
  Inspecting the built runner image found no `.env*`, `secrets`, or `.dev-secrets` paths under
  `/app`.
