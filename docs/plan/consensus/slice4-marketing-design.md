# Slice 4 — Marketing content pipeline (thin): design contract

Status: authoritative build spec for `slice/4-marketing-content-pipeline`. Codegen (codex-exec) implements THIS
verbatim. Where this is silent, MIRROR `packages/crm` (Slice 3) exactly. Non-negotiables: `opzava-conventions`
(withTenant RLS, hard-403, ports, projections-are-cache), ADR-004/007/012.

## 0. Prime directive — the ADR-012 exact-version approval invariant
> No `ContentItem` reaches `Published` without a `marketing_approvals` row in `approved` state whose
> `target_version` AND `target_content_hash` EQUAL the item's CURRENT `version` and `content_hash`.
Enforced server-side in the single `publishContentItem` command path (re-checked under a row lock — never
trust a UI pre-check), AND the UI never offers publish/approve actions for ineligible items. This is a
**versioned content fact, not a status flag** (ADR-012:41,85,103). Editing approved content invalidates the
approval. Fail CLOSED on every ambiguity (hard error, never silent success/empty).

## 1. Content hash + version (ARCHITECT DECISION — specs leave the algo open)
- `content_hash`: lowercase hex SHA-256 (Node `crypto.createHash('sha256')`, deterministic, no external dep)
  over a CANONICAL JSON serialization of ONLY the material content fields:
  `{ title, body, format, channelTargets: [...sorted], assetRefs: [...sorted] }` — each string `.trim()`ed,
  object keys in the fixed order above, arrays sorted ascending, then `JSON.stringify`. Volatile fields
  (ids, status, timestamps, version, campaign link, provenance) are EXCLUDED. A helper
  `computeContentHash(material): string` lives in the domain layer and is pure + unit-tested against a frozen
  golden vector.
- `version`: monotonic integer starting at `1`. On any edit: recompute the canonical hash; if it differs from
  the stored `content_hash`, this is a MATERIAL edit → `version += 1`, store the new hash, and INVALIDATE
  approval (see §4 edit rule). If the hash is unchanged, it is a non-material edit → version/hash untouched,
  approval NOT invalidated.

## 2. Package `@opzava/marketing` (mirror `packages/crm` scaffold EXACTLY)
Path `packages/marketing/`. Layout, package.json (`@opzava/marketing`, type module, deps
`@opzava/adapters`/`@opzava/ports`/`@opzava/shared-kernel`/`drizzle-orm@0.45.2`, dev `@opzava/config`),
tsconfig(.build).json, vitest.config.ts — all copied from `packages/crm` with names swapped. Barrel
`src/index.ts` re-exports domain + application. Register the package in the root workspace + `apps/web`
tsconfig path map wherever `@opzava/crm` is registered.

## 3. Aggregates (Drizzle schema = typing only; truth = the hand-written migrations)
All tables: `id uuid pk`, `organization_id`, `workspace_id`, `idempotency_key`, `created_at`, `updated_at`;
`.enableRLS()`; the CRM RLS trio (`_tenant_isolation` permissive `organization_id = app.current_org_id()`,
`_tenant_context_required` restrictive `app.current_org_id() is not null`, `_owner_admin` to owner role);
composite tenant FK to `organizations(id)` + `workspaces(id, organization_id)`; `uniqueIndex(id, org_id)`;
per-org idempotency unique `(organization_id, idempotency_key)`; non-empty `check()`s.

### 3.1 `marketing_campaigns`
- `number int` — per-workspace human-readable (`CMP-<n>`); MIRROR the pm/CRM per-workspace numbering
  mechanism from migration `0013` (per-(workspace) counter, allocated under lock). Unique `(workspace_id, number)`.
- `name text`, `objective text null`, `status marketing_campaign_status` enum
  `['plan','create','approve','publish','measure','archived']` default `plan`,
  `window_start timestamptz null`, `window_end timestamptz null`,
  `owner_user_id null`, `owner_agent_id text null` (opaque agent ref, NOT an FK — ADR-004),
  `project_id null` (opaque link to pm workspace-scoped; nullable; no cross-context hard FK — keep opaque ref).
- Stage moves go through a command, emit an Activity, and DO NOT imply any external publish.

### 3.2 `marketing_content_items`
- `number int` — per-workspace (`CNT-<n>`), same mechanism. Unique `(workspace_id, number)`.
- `campaign_id uuid null` — composite tenant FK to `marketing_campaigns(id, organization_id)` when present.
- Material content: `title text`, `body text`, `format marketing_content_format` enum
  `['post','email','blog','page','other']` default `post`, `channel_targets text[]` default `{}`,
  `asset_refs text[]` default `{}` (opaque refs; no asset library in thin).
- `state marketing_content_state` enum `['idea','draft','in_review','approved','published','archived']` default `draft`.
- `version int not null default 1`, `content_hash text not null` (computed on insert/edit).
- `approved_approval_id uuid null` — composite tenant FK to `marketing_approvals(id, organization_id)`
  (coherence: the gating approval always belongs to the same tenant). Set on approve, cleared on invalidation.
- Provenance: `source marketing_actor_kind` enum `['human','assistant']`, `source_agent_id text null`.
- `published_at timestamptz null`, `published_by_user_id null`, `published_reason text null` (manual-publish audit note).
- Integrity: partial unique index — at most ONE `approved`-state approval per `(content_item_id, version)` (see §4).

### 3.3 `marketing_approvals` (thin subset of the ADR-012 unified Approval)
- `content_item_id uuid` — composite tenant FK to `marketing_content_items(id, organization_id)` (on delete restrict).
- `target_version int`, `target_content_hash text` — the EXACT version+hash this decision binds to.
- `state marketing_approval_state` enum `['pending','approved','rejected','expired']` default `pending`.
- `requester_user_id null`, `requester_agent_id text null`, `approver_user_id null` (set on decide),
  `decided_at timestamptz null`, `note text null` (REQUIRED when `rejected`), `policy_ref text null` (thin: null).
- Partial unique index: at most one `pending` approval per `content_item_id` (one open request at a time).

### 3.4 `marketing_activities` (append-only audit — mirror `crm_activities`)
- `actor_kind marketing_actor_kind`, `actor_user_id null`, `actor_agent_id text null`,
  subject refs `campaign_id null` / `content_item_id null` / `approval_id null` with a check `>= 1` non-null,
  `action text` (verb e.g. `content.drafted`,`content.submitted`,`approval.approved`,`approval.rejected`,
  `content.published`,`content.invalidated`,`campaign.stage_moved`), `metadata jsonb default '{}'`. INSERT-ONLY.

### 3.5 Migrations
`packages/identity-access/drizzle/`, continue the sequence after `0014`:
- `0015_slice4_marketing_core.sql` — all four tables, enums, RLS trio, grants, FKs, indexes (mirror
  `0012_slice3_crm_core.sql` structure: lock/statement timeouts, idempotent `do $$` enum guards,
  `create table if not exists`, composite FKs, `enable`+`force row level security`, drop/create policies).
- `0016_slice4_marketing_coherence.sql` — the cross-row coherence: `approved_approval_id` composite FK,
  the `(content_item_id, version)` partial unique for approved approvals, the one-pending-per-item partial
  unique, and the per-workspace number allocation (mirror `0013` + `0014` guarded-alter style).

## 4. Application services (mirror `packages/crm/src/application` — every service:
`assertKnownIds → normalize/validate (Result) → authorize(...) → withTenant(orgId, tx => …)` with idempotent
replay-before-insert; Result return; hard-403 via AuthorizationPort). Context `{orgId, workspaceId, actor:{userId, roleKeys}}`.

- `createCampaign`, `updateCampaign`, `moveCampaignStage` (guarded transition, appends activity).
- `createContentItem` (source human|assistant; computes hash; version=1; state draft (or idea if requested);
  appends `content.drafted`). Assistant path uses source=assistant + source_agent_id.
- `updateContentItem` (material vs non-material per §1; on material edit → version++, new hash, and if an
  `approved` approval existed → set it `expired`, clear `approved_approval_id`, drop item state
  approved→draft; append `content.invalidated`). LOCK the item row `for update` first (TOCTOU-safe).
- `submitContentForReview` (draft→in_review; creates/opens one `pending` approval bound to CURRENT
  version+hash for `requester`; if a `pending` already exists it is a replay/no-op-idempotent).
- `approveContentItem` (idempotent; **fail closed** when: no matching pending approval; approval already
  `rejected`/`expired`; `approval.target_version != item.version` OR `target_hash != item.content_hash`
  (stale-target); item not in `in_review`). On success: approval→approved (records approver+decided_at),
  item state in_review→approved, set `approved_approval_id`, append `approval.approved`. Re-approving the
  SAME already-approved matching version = idempotent success.
- `rejectContentItem` / requestChanges (note REQUIRED else Result error; approval→rejected; item
  in_review→draft; version PRESERVED; append `approval.rejected`).
- `publishContentItem` — THE INVARIANT GATE. In `withTenant`: `select … for update` the item; if already
  `published` and hash unchanged → idempotent success; else require item.state=`approved` AND a
  `marketing_approvals` row `state='approved' AND target_version=item.version AND target_content_hash=item.content_hash`
  (locked read). Missing → hard error `marketing.approvalInvariantViolated` (NOT silent). On success:
  item→published, `published_at/by`, optional `published_reason` audit; append `content.published`.
  "Publish" is Opzava-internal mark-published only (no external channel send — that's P5/P8).
- Query services: `listCampaigns`, `getCampaign`, `listContentItems` (by lane/state, SQL-paginated —
  no in-memory slicing, mirror the Slice-3 pagination fix), `getContentItem` (+ its approvals + activity),
  `listCalendarEntries` (content items with a schedule/window in a date range), read-side lane mapping:
  Ideas=idea, Drafting=draft, Needs you=in_review, Ready=approved, Published=published.
- Authorization: `packages/marketing/src/application/authorization.ts` mirroring `defaultCrmAuthorizationPort`
  with actions `create|read|update|move|approve|publish`. Approve/publish are human-only (T1/T2 posture;
  the assistant tool in §5 only drafts).

## 5. Assistant DRAFT-CREATE tool (write; mirror `task-tools.ts`, NOT the read-only crm-tools)
- `packages/runtime-control/src/application/marketing-tools.ts`: `opzava_marketing_create_content_draft`
  (inputShape: title, body, optional format/campaignNumber/channelTargets). Executor calls `createContentItem`
  with source=assistant + source_agent_id, records outcome via `recordStartedToolOutcome`/`recordToolOutcome`
  (idempotent by toolCallId, replay-safe — same pattern as `opzava_tasks_create`). Returns
  `{kind:"marketing.content.draft", contentNumber, id, ...}`. Export names/registry/types via
  `runtime-control/src/application/index.ts` mirroring the task/crm export blocks.
- Web dispatch `apps/web/app/api/tasks/ask-admin/turn/route.ts`: extend `RuntimeControlServices` +
  `AskAdminToolExecution` union + add `isMarketingToolName()` guard + a dispatch branch; call
  `deps.revalidateMarketing()` after a successful write (add the revalidator).
- Tool inventory: add `{name:"opzava_marketing_create_content_draft", source:"core"}` to the fake gateway
  advertised list AND the expected-inventory list the broker cross-checks (avoid `toolInventoryMismatch`).
  Add a `scripted-marketing-tool-call` fake mode that emits the toolCall so route/agent tests drive the
  write end-to-end.
- HARD LIMIT: assistant gets NO approve/publish tool. "SOUL can lie; tool policy cannot" — drafting only.

## 6. Web surfaces (mockup-BOUND — 100% visual parity, port DOM + `tokens/app/shadcn.css`)
Route group `apps/web/app/(app)/marketing/`:
- `campaigns/page.tsx` (board/list ← `essential-mkt-campaigns.html`) + `campaigns/[id]/page.tsx` (detail, net-new
  design honoring tokens) + `_components/` (new-campaign dialog ← `essential-campaign-new.html`).
- `content/page.tsx` (pipeline lanes ← `essential-content-pipeline.html`) + `content/[id]/page.tsx`
  (content detail/review screen — net-new: shows version, content_hash short, approval state, the
  submit/approve/request-changes/publish actions GATED by eligibility) + `_components/`.
- `calendar/page.tsx` (← `essential-mkt-calendar.html`; schedule dialog ← `essential-event-new.html`).
- Server actions for every command in §4; the UI MUST hide/disable publish & approve when ineligible AND the
  server re-checks (defense in depth). Errors surface as structured field/action errors (no silent failure).
- Nav: `apps/web/components/shell/admin-nav.tsx` — add `marketingItems` const + `<RailSection label="Marketing">`
  + `IconName`/`NavIcon` cases (mirror the CRM nav block). Live counts via `AdminNavState` from the layout.
- Session via `getAppSessionContext`/`@/lib/session` (orgId, workspaceId, user.id, roleKeys) as CRM pages do.

## 7. Tests (tdd red→green; mirror `packages/crm/src/__tests__` shape, run as non-owner `opzava_app`)
- `computeContentHash` golden-vector unit test (stability + field-order/whitespace/array-order invariance).
- RLS integration: create as tenant A, invisible/403 to tenant B (campaigns, content, approvals).
- INVARIANT integration (the crux, all as `opzava_app`):
  1. publish blocked when no approval → hard error.
  2. draft→submit→approve→publish happy path persists.
  3. edit after approve bumps version, expires approval, blocks publish until re-approve.
  4. approve with stale target (version moved) fails closed.
  5. reject requires note; item returns to draft; version preserved.
  6. approve idempotent replay; publish idempotent replay.
  7. concurrent edit+publish serialize under row lock (publish fails closed if edit won).
- Assistant tool: `scripted-marketing-tool-call` drives `opzava_marketing_create_content_draft` →
  a Draft ContentItem appears with source=assistant; outcome idempotent on toolCallId replay.

## 8. Out of scope (Deferred to P5 remainder — EXECUTION.md:264) — DO NOT build
Department Workflow engine, cron/TaskFlow publish runs, external channel sends, Automation page, Marketing
dashboard, assets library, approval-inbox screen, performance/report artifacts, ads/email/blog reports.
