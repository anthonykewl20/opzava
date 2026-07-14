# CRM removal inventory (wayfinder ticket #201)

Asset for [Inventory every CRM touchpoint in the repo (#201)](https://github.com/anthonykewl20/opzava/issues/201), child of wayfinder map [#200](https://github.com/anthonykewl20/opzava/issues/200) — full CRM removal from the admin panel plus docs sweep.

Produced 2026-07-15 by a read-only Codex scout (gpt-5.6-terra) over the `development` working tree; independently verified against a 123-file grep baseline (0 gaps) with spot-checks on the Dockerfile, module-doc, PRD-010, and consensus-artifact claims.

---


**Method and coverage.** Read-only sweep of `/home/soultransit/devtony/opzava` on `development`. I ran the required grep immediately before this inventory: it currently returns **181 paths**, not the stated 123. `.claude/worktrees/`, `node_modules/`, `.git/`, and `mainframe/` were excluded by command/scope. `mainframe/` has no reported Opzava dependency from this sweep. Line numbers below point to the first or principal CRM reference unless a range is more useful. Every path from the 181-path output is below; generated and sensitive paths are explicitly excluded.

Disposition key: **DELETE** = CRM-only artifact; **EDIT** = retained artifact with CRM content/dependency to remove; **DECISION-NEEDED** = behaviour/history/data outcome must be chosen before removal.

## 1. Admin web UI

- **DELETE** `apps/web/app/(app)/crm/_components/crm-page-styles.tsx:1` — CRM-only shared styles.
- **DELETE** `apps/web/app/(app)/crm/accounts/[id]/page.tsx:1`, `accounts/actions.ts:3`, `accounts/page.tsx:3` — account detail, mutations, and list UI.
- **DELETE** `apps/web/app/(app)/crm/contacts/[id]/page.tsx:1`, `contacts/actions.ts:6`, `contacts/page.tsx:3` — contact detail/timeline, mutations, and list UI.
- **DELETE** `apps/web/app/(app)/crm/deals/_components/deal-create-dialog.tsx:3`, `deals/actions.ts:3`, `deals/page.tsx:3` — deal creation/mutations and pipeline UI.
- **DELETE** `apps/web/app/(app)/crm/tickets/[id]/page.tsx:1`, `tickets/actions.ts:5`, `tickets/page.tsx:4` — ticket detail, mutations, and queue UI.
- **DELETE** `apps/web/app/(app)/crm/error.tsx:3`, `forbidden.tsx:1`, `loading.tsx:1` — CRM route boundary states.
- **DELETE** `apps/web/lib/crm-pages.ts:1-292` — CRM DTO helpers, errors, labels, website normalization, and aggregate helpers.
- **EDIT** `apps/web/components/shell/admin-nav.tsx:52-56,422` — `crmItems` (Contacts/Accounts/Deals/Tickets) and its CRM nav section.
- **EDIT** `apps/web/lib/shell-state.ts:84-96` — command-palette destinations for all four CRM routes.
- **EDIT** `apps/web/package.json:20` — direct `@opzava/crm` workspace dependency.
- **DELETE** `apps/web/test/crm-pages.test.ts:3-179` — tests only `crm-pages` and verifies CRM route files/actions.
- **EDIT** `apps/web/test/ask-admin-route.test.ts:144,220,288,354` — route test fixtures/assertions exercise CRM tool calls; preserve task-chat coverage after removing those cases.

## 2. Backend bounded context (`packages/crm`)

This is a CRM-only workspace package (`packages/crm/package.json:2`, name `@opzava/crm`), so the source/package files below are **DELETE** as a bounded context; its public imports require the dependent edits documented in later sections.

- **DELETE** `packages/crm/src/domain/crm.ts:4-212` and `domain/index.ts:1` — lifecycle/status/kind value sets, entities, parsing/validation.
- **DELETE** `packages/crm/src/application/accounts.ts:7-594`, `contacts.ts:8-628`, `deals.ts:9-1124`, `tickets.ts:9-662` — account/contact/deal/ticket command/query services and SQL.
- **DELETE** `packages/crm/src/application/activities.ts:11-173`, `authorization.ts:13-103`, `shared.ts:14-660`, `index.ts:2-71` — activity writes, authorization port, shared database/DTO helpers, exports.
- **DELETE** `packages/crm/src/adapters/postgres/schema/crm.ts:1-489`, `schema/index.ts:1` — Drizzle declarations for all CRM enums/tables/RLS; comments at `:1` identify hand-written migrations 0012+ as authoritative DDL.
- **DELETE** `packages/crm/src/__tests__/authorization-contract.test.ts:4-8` and `slice3-crm.integration.test.ts:29-792` — authorization and live CRM/RLS/idempotency integration coverage.
- **DELETE** `packages/crm/package.json:1-31` — package manifest.
- **DELETE (generated)** `packages/crm/dist/adapters/postgres/schema/{crm,index}.d.ts`; `packages/crm/dist/application/{accounts,activities,authorization,contacts,deals,index,shared,tickets}.d.ts`; `packages/crm/dist/domain/{crm,index}.d.ts` — all 12 grep-matched declarations mirror the deleted package source.

## 3. Database schema and migrations

- **DECISION-NEEDED** `packages/identity-access/drizzle/0012_slice3_crm_core.sql:16-804` — **the migration is owned/run by `packages/identity-access`** (not `packages/crm`); it creates six enums at `16,34,51,71,89,112`, tables `crm_accounts:120`, `crm_contacts:175`, `crm_pipelines:234`, `crm_pipeline_stages:260`, `crm_deals:303`, `crm_tickets:416`, `crm_activities:490`, then ownership/grants/RLS/policies. Choose how existing production data and already-applied migration history are handled; do not simply delete an applied migration.
- **DECISION-NEEDED** `packages/identity-access/drizzle/0014_slice3_deal_stage_coherence.sql:9-40` — validates existing CRM deal/stage coherence and adds the composite stage/pipeline FK. Same applied-history/data decision.
- **EDIT** `packages/identity-access/drizzle/manifest.json:53` — includes migration metadata/name `0012_slice3_crm_core`; it confirms identity-access is the migration owner, but must remain internally consistent with the chosen forward migration/history treatment.
- **EDIT** `packages/identity-access/drizzle/meta/_journal.json:93` — migration journal records CRM migration; update only in accordance with the migration-history decision.

## 4. Agent tooling and wiring

- **DELETE** `packages/runtime-control/src/application/crm-tools.ts:1-922` — imports CRM services and defines five read-only tools: `opzava_crm_list_accounts`, `...list_contacts`, `...list_deals`, `...list_tickets`, and `...get_contact_timeline` (`:31-77`); parses args, authorizes, invokes services, records outcomes, and shapes summaries.
- **EDIT** `packages/runtime-control/src/application/index.ts:33-51` and `packages/runtime-control/src/index.ts:16-28,43-50` — re-export CRM tool APIs/types; remove exports while retaining runtime-control/task APIs.
- **EDIT** `packages/runtime-control/package.json:25` — direct `@opzava/crm` dependency.
- **DELETE (generated)** `packages/runtime-control/dist/application/crm-tools.d.ts`; **EDIT (generated)** `dist/application/index.d.ts`, `dist/index.d.ts` — generated declaration exports/declarations, regenerated after source removal.
- **EDIT / DECISION-NEEDED** `apps/workers/src/provisioning/ask-admin-agent.ts:11-12,47-51,154-226,292` — Ask Admin provisioning version/artifacts/tool allow-list explicitly promise CRM reads and list all five tools. Decide replacement assistant behaviour for CRM questions (refusal, task-only fallback, or another product flow), then remove tools from policy/templates/version.
- **EDIT / DECISION-NEEDED** `apps/web/app/api/tasks/ask-admin/turn/route.ts:10-22,51-72,292-293,398-402` — streamed Ask Admin route recognizes CRM tool names and dispatches them to runtime-control. Remove CRM union/dispatch; the required fallback for an already-configured model that emits one of these tool names is a behavioural decision.
- **EDIT** `apps/workers/src/provisioning/__tests__/ask-admin-agent.test.ts:276-710,829` — snapshots/contract tests encode agent CRM prompt, policy, tool names, and version.
- **EDIT** `apps/workers/src/provisioning/__tests__/connections.test.ts:1368` — delegation-policy assertion describes preservation of task/CRM allow-list.
- **EDIT** `packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts:15-1191` — integration suite imports/exercises every CRM tool, authorization, malformed args, outcomes, and receipts; retain only non-CRM assistant coverage.

## 5. Seeds and workers

- **EDIT** `apps/workers/src/seed/roadmap.ts:77-79,112-114` — local roadmap seed creates “Slice 3 - CRM core (thin)” and “P4 - CRM” task records.
- **EDIT** `apps/workers/src/seed/__tests__/roadmap.integration.test.ts:154-159` — expected seed title list contains those two records.
- `apps/workers/src/provisioning/ask-admin-agent.ts` and its tests are covered in section 4: provisioning is the other worker-side CRM coupling.

## 6. Tests outside the package/UI groups

- **EDIT** `apps/gateway-broker/src/acl/openclaw/fake-gateway.ts:219-223` — fake gateway advertises the five CRM tool names.
- **EDIT** `apps/gateway-broker/src/__tests__/connection-manager.routing.fake-gateway.test.ts:83-87` — routing fake-gateway expected tool list includes them.
- **EDIT** `apps/gateway-broker/src/__tests__/operator-client.fake-gateway.test.ts:605-623` — operator-client contract asserts the same five tool definitions/calls.
- Other non-package test paths are `apps/web/test/ask-admin-route.test.ts`, worker provisioning/seed tests, and runtime-control integration test, covered above.

## 7. E2E gate and tooling

- **EDIT** `tests/e2e/gate/real-world-validate.mjs:42` — real-world gate’s required route list includes `/crm/accounts`, `/crm/contacts`, `/crm/deals`, `/crm/tickets`; remove/redefine this gate requirement.
- **DELETE / generated evidence** `real-validate-artifacts/2026-07-11T14-14-54.246Z/report.json`; `2026-07-12T14-36-30.909Z/report.json`; `2026-07-12T14-46-14.190Z/report.json`; `2026-07-13T08-37-43.132Z/report.json`; `2026-07-13T08-38-57.956Z/report.json`; `2026-07-13T11-14-48.146Z/report.json`; `2026-07-13T14-09-56.231Z/report.json`; `2026-07-13T16-45-27.686Z/report.json`; `2026-07-13T18-12-57.660Z/report.json`; `2026-07-14T08-11-01.180Z/report.json`; `2026-07-14T08-26-01.983Z/report.json` — historical validation output matching CRM; generated artifacts, not source/tooling.

## 8. Docs and skills

### Top-level, ADRs, and architecture docs

- **EDIT** `CONTEXT.md:16-20` — describes CRM’s dashboard placement/status.
- **EDIT** `ARCHITECTURE.md:5-9,66-67,109,156` — CRM is in architecture/context/dependency descriptions.
- **EDIT** `.claude/skills/opzava-conventions/SKILL.md` — grep match; conventions skill contains CRM guidance (not executed/changed in this read-only inventory).
- **EDIT** `docs/adr/ADR-001-stack-ddd-structure.md:9-176`, `ADR-003-gateway-broker-acl-two-token.md:17-91`, `ADR-004-data-boundary-cqrs.md:11-86`, `ADR-005-tool-policy-security.md:109`, `ADR-006-auth-better-auth.md:11-100`, `ADR-007-rbac-rls.md:11-111`, `ADR-008-ai-workforce.md:11-131`, `ADR-010-knowledge-okf.md:60`, `ADR-012-dept-workflow-engine.md:5-117`, `ADR-016-mainframe-tracked-fork.md:32` — retained ADRs with CRM examples, boundaries, or dependencies; remove/reframe their references.
- **DECISION-NEEDED** `docs/adr/ADR-011-crm-channel-identity.md:1-91` — CRM-specific ADR. Decide whether to retain as an explicitly superseded historical ADR or delete/archive it; do not silently rewrite architectural decision history.
- **EDIT** `docs/architecture/DEEPENING-OPPORTUNITIES.md:83-92`, `SEAM-MAP.md:28-137`, `adr-seam-constraints.md:80-84`, `bounded-contexts.md:13-137`, `mainframe-seam.md:39`, `modules/config.md:117,135`, `modules/ports.md:45`, `modules/runtime-control.md:6-166`, `modules/web.md:75-125`, `ubiquitous-language-bridge.md:33-48` — architecture/module maps name CRM package/schema/tools/UI; update retained maps.
- **DELETE** `docs/architecture/modules/crm.md:1-120` — CRM-only module document.

### Plans, audits, consensus, and research

- **EDIT** `docs/plan/EXECUTION.md:33-567`, `backlog.md:25-91`, `capability-parity.md:11-109`, `connections-overview-health.md:172`, `grilling-decisions.md:6-708`, `roadmap.md:78-279`, `audits/2026-07-02-docs-audit.md:7-189`, `research/slice2-ask-admin-opzava.md:378,495` — retained plan/history documents with CRM scope, dependencies, or agent-tool statements.
- **EDIT** `docs/plan/consensus/README.md:32-33`, `frontend-standardization-and-docs-slice.md:52-57`, `port-openclaw-control-ui-program.md:50`, `q11-dept-workflows.codex.md:3-11`, `q13-backlog.mmx.md:16-37`, `q15-mvp-roadmap.mmx.md:12-20`, `q3-rpc-broker-auth.codex.md:5`, `q4-data-boundary-contexts.codex.md:12-25`, `q4-data-boundary-contexts.mmx.md:2`, `q8-ai-workforce.codex.md:9-11`, `slice3-rereview.codex.md:18-126`, `slice3-review-data.codex.md:1-116`, `slice3-review-tools.codex.md:3-79`, `slice3-review-web.codex.md:3-85`, `slice4-marketing-design.md:4-152`, `tasks-ai-workforce-design.md:13-574` — cross-topic consensus records with CRM assumptions; preserve history only if that is desired, otherwise edit/archive explicitly.
- **DECISION-NEEDED** `docs/plan/consensus/q10-crm.codex.md:1-15`, `q10-crm.mmx.md:16-28` — CRM-specific consensus artifacts; choose historical retention/archive versus deletion.

### PRDs

- **EDIT** `docs/prd/PRD-004-internal-chat.md:34,253`, `PRD-005-assistants-chat.md:94-179`, `PRD-006-agent-roster-automation.md:50-369`, `PRD-007-knowledge-skills.md:164-210`, `PRD-008-marketing-campaigns.md:49-392`, `PRD-009-marketing-approvals-reports.md:47-402`, `PRD-013-connections-tools.md:48-455`, `PRD-014-billing-settings.md:89`, `PRD-015-guest-portal.md:9-322`, `PRD-017-design-system.md:38-255` — non-CRM PRDs that depend on/reference CRM, CRM staff, tools, contacts, tickets, or UI examples.
- **DECISION-NEEDED** `docs/prd/PRD-010-crm-support.md:1-364` — CRM/support product specification is CRM-specific. Choose whether the removal eliminates it (delete/archive) or whether support requirements survive under a new bounded context.

## 9. Mockups and UX

- **EDIT** `ux-redesign/mockups/connections-degraded.html:62-66`, `connections-system.html:48-52`, `connections-unreachable.html:64-68`, `connections.html:48-52` — CRM mentions are shared navigation chrome (Contacts/Accounts/Deals/Tickets), **not CRM screen mockups**; remove those nav items while preserving connection screens.

## 10. Other sweep findings, build inputs, and explicit exclusions

- **EDIT** `apps/gateway-broker/Dockerfile:13`, `apps/web/Dockerfile:13`, `apps/workers/Dockerfile:13` — Docker build contexts copy `packages/crm/package.json` for workspace installation; remove/adjust after package deletion.
- **EDIT (generated lockfile)** `pnpm-lock.yaml:100-102,263,341` — workspace importer/package entries for `@opzava/crm`; regenerate lockfile.
- **EXCLUDED — sensitive, not read** `.dev-secrets/openclaw-secrets.json`; `apps/workers/.dev-secrets/openclaw-secrets.json` — grep-matched filenames under secrets scope; no contents inspected, and their CRM relevance cannot be asserted.
- **EXCLUDED — generated cache** `.turbo/cache/01aa80338331261e-manifest.json`, `073a973ca3d31402-manifest.json`, `14d9e7498d34b64a-manifest.json`, `189537592924044c-manifest.json`, `1f633a7e58e732a7-manifest.json`, `258000d9d501e04f-manifest.json`, `27a9bf8422738c0f-manifest.json`, `301338351a4cea46-manifest.json`, `4ac05e0850a72a08-manifest.json`, `4bc51606fdef2297-manifest.json`, `55f61fcc62eda373-manifest.json`, `6017149bb63c0413-manifest.json`, `6513a4eb6e764d48-manifest.json`, `6d0eac8a0ec57716-manifest.json`, `7341e0bfcdbc9cee-manifest.json`, `85b9332f3d001e64-manifest.json`, `b489cd9dabb46543-manifest.json`, `b67eccd529296f2b-manifest.json`, `c59f8b4655b94cfa-manifest.json`, `c7f1cc0613ac8cf8-manifest.json`, `cbb4d899fbbb3b2c-manifest.json`, `cd364c6250549041-manifest.json`, `ce0ec99cc8b88bbc-manifest.json`, `d4d8aa9885b532df-manifest.json`, `d5671eeb23f9e58f-manifest.json`, `e76fdb1c4d7ac353-manifest.json`, `eea6c8bc0a497fdc-manifest.json`, `ef48f9e141899cbf-manifest.json` — Turbo cache manifests, neither source nor durable configuration; clean/regenerate rather than edit.
- **EXCLUDED — non-Opzava vendored/tool metadata** `codex/codex-rs/models-manager/models.json` — grep hit in the local Codex model manager catalog; no Opzava code dependency identified.

## Hidden couplings / surprises

1. Deleting `/crm/*` alone leaves a live **Ask Admin conversation path**: provisioning gives the agent five CRM read tools, the gateway fake advertises them, and `apps/web/app/api/tasks/ask-admin/turn/route.ts:398-402` dispatches streamed tool calls. A model that still asks for a CRM tool needs an explicit fallback decision.
2. The database DDL is **not owned by `packages/crm`**: `packages/identity-access/drizzle/0012_slice3_crm_core.sql` owns applied tables/enums/RLS and `0014` adds integrity. Package deletion does not remove data, policies, grants, or migration history.
3. The fake-gateway tests are a contract surface, not dead UI testing: broker routing/operator-client expectations enumerate all five tool names.
4. Shared shell state has two independent UI entry points—admin nav and command palette—and connection mockups duplicate that chrome.
5. Three Dockerfiles and `pnpm-lock.yaml` reference the workspace package even though the verification grep (limited extensions) does not list them; build/install will fail if they are missed.
6. The “123 files” expectation is stale for this working tree: current verification output is 181, including 28 Turbo cache manifests, 11 real-validation reports, 12 CRM declarations, and two unread secret files. All are accounted for above.
