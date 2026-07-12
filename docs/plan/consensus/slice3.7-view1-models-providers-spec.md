# Slice 3.7 view #1 — Models & Providers (implementation spec)

Authoritative build spec for the Connections "Model providers" surface, per
`docs/plan/consensus/port-openclaw-control-ui-program.md` (First slice section) and the Q18
mockup-revision-first contract. The mockup (`ux-redesign/mockups/connections.html` Section 3) has
already been reconciled to this design. Non-negotiables: `.claude/skills/opzava-conventions`
(two-token ACL, worker = JIT `operator.admin`, no OpenClaw types in web, agnostic ports).

## Goal (what changes)
Turn the current FLAT, single-`suggestedModel` provider list into a **curated, grouped** Models &
Providers surface that mirrors OpenClaw's real model/config/auth shape:
1. **Curated to canonical LLM providers** — non-LLM (speech/image/video) providers are hidden.
2. **Runtimes fold UNDER parent** — Codex→OpenAI, Claude CLI→Anthropic, Gemini CLI→Google are NOT
   standalone rows; they show as folded runtime labels on the parent row.
3. **Real current models per provider** from `models.list`.
4. **Real 5-state connection status** from the `models.authStatus` RPC (primary), `models status`
   CLI (degraded fallback) — with expiry/plan/usage where the provider reports them.
5. **Connect = real onboard-exec through the worker** (unchanged API-key path; device-flow stays
   honestly unsupported for model providers).

Providers still come from the LIVE gateway catalog — NO invented provider list. The new
classification lives in `@opzava/ports/model-provider-taxonomy` (`classifyModelProvider`) and is a
CLASSIFICATION overlay only.

## Already done (do not redo)
- Ports extended (`packages/ports/src/connections-provisioning.ts`): `ProviderAuthHealth`,
  `ProviderCategory`, `ModelSummary`; optional `category`/`parentId`/`runtimeLabel`/`models` on
  `ModelProviderCatalogEntry`; optional `authHealth`/`expiryLabel`/`planLabel` on
  `ProviderConnectionState`.
- New `packages/ports/src/model-provider-taxonomy.ts` (exported): `classifyModelProvider(id)` →
  `{category, parentId, runtimeLabel, canonicalLabel}`, `isTopLevelLlmProvider(id)`,
  `RUNTIME_PARENTS`, `PROVIDER_PARENT_ALIASES`, `NON_LLM_PROVIDER_IDS`, `CANONICAL_PROVIDER_LABELS`.
- Mockup Section 3 reconciled (grouped table; columns Provider/Auth/Models/Status/action).

## Current implementation amendment (2026-07-12)

Connected rows expose a single row-actions menu rather than inline Manage, Set as main orchestrator, and Disconnect buttons.
The menu contains Manage, Set as main orchestrator only for connected non-lead rows, a separator, and Disconnect.
The menu intentionally has no non-interactive `Actions` label because the trigger already names row actions for the provider.

## Reference truth (verified against mainframe v2026.6.11)
- `models.list {view:"all"}` → `{models: [{id,name,provider,alias?,contextWindow?,available?}]}`.
  (Worker already calls this at gateway-admin-connections.ts ~:1392,:1671.) `view:"all"` includes
  `available:boolean` per model.
- `models.authStatus {refresh?:boolean}` → `{ts, providers:[{provider, displayName,
  status:"ok"|"expiring"|"expired"|"missing"|"static", expiry?:{at,remainingMs,label},
  profiles:[{profileId,type:"oauth"|"token"|"api_key",status,expiry?}],
  usage?:{windows:[{label,usedPercent,resetAt?}], summary?, plan?}}]}`. This is the RPC OpenClaw's
  OWN Control UI uses for per-provider status. It is a READ. It may not be advertised on every
  gateway build → call defensively and fall back.
- There is NO onboarding RPC. API-key connect stays the CLI exec path already implemented
  (`onboard --non-interactive ... --auth-choice <id>`). Do not change the connect/disconnect writes.

## Work items

### A. Worker — `apps/workers/src/provisioning/gateway-admin-connections.ts`
1. **Populate real models per provider.** In the catalog builder (`providerCatalogFromModels`,
   ~:278-396), group the `models.list` payload by `provider` and set
   `entry.models = ModelSummary[]` (`{id: m.id, label: m.name ?? m.id}`), capped to a sane number
   (e.g. first 8 by name) — empty array allowed, never faked. Also set `entry.category`,
   `entry.parentId`, `entry.runtimeLabel` from `classifyModelProvider(entry.id)` (import from
   `@opzava/ports`). Prefer `classifyModelProvider(id).canonicalLabel ?? existingLabel` for `label`.
2. **authStatus primary, CLI fallback.** Add a private `modelAuthStatus()` that calls
   `client.request("models.authStatus", {refresh:false})` inside a try/catch. On success, build a
   `Map<providerId, {status, authHealth, expiryLabel, planLabel, usageLabel}>`:
   - map 5-state → ConnectionStatus: `ok|static → connected`, `expiring → connected` (but set
     `authHealth:"expiring"` + `expiryLabel`), `expired|missing → needs_attention`.
   - `expiryLabel = provider.expiry?.label ?? null` (drop "unknown").
   - `planLabel = provider.usage?.plan ?? null`.
   - `usageLabel`: from `usage.windows` lowest-remaining → e.g. `"68% window left"` (compute
     `100 - round(usedPercent)`), else `usage.summary ?? null`. Never a fake "$" amount.
   On ANY failure (method not advertised / throw), log a single warn line
   `connections.authStatus.fallback` and return null so the existing `models status` CLI path
   (`providerConnectionFromModelStatus`, ~:857-891) remains the source. In `getConnectionsSnapshot`
   (~:1398-1413): call authStatus once; when present, use it to build/override
   `providerConnections[].{status,authHealth,expiryLabel,planLabel,usageLabel}`; when null, keep
   the current CLI-derived connections unchanged. Connection rows must exist for every catalog
   provider that authStatus or CLI reports (do not drop providers).
3. Do NOT change: the two-token boundary, `config.patch requiredScope:"operator.admin"`,
   connect/disconnect/orchestrator writes, GitHub flows, the `deviceFlowRequiresInteractive`
   behavior. Secrets must never enter logs or results.

### B. Web projection — `apps/web/lib/connections-state.ts`
Add `projectModelProviders(snapshot)` returning grouped, curated parent rows. Extend
`ProviderConnectionView` with: `runtimeLabels: readonly string[]`, `models: readonly ModelSummary[]`,
`authHealth: ProviderAuthHealth | null`, `expiryLabel: string | null`, `planLabel: string | null`.
Algorithm:
1. For each catalog entry compute `cls = entry.category/parentId/runtimeLabel ?? classifyModelProvider(entry.id)`.
2. **Parents** = entries with `cls.category === "llm"` AND `cls.parentId == null`. **Drop** non-llm
   entries and fold **child** entries (`parentId != null`) into their parent:
   - child `runtimeLabel` (or `CANONICAL child label`) → parent's `runtimeLabels`.
   - child `authChoices` merge into the parent's auth method set (so a parent with only a folded
     runtime still shows the right auth badges).
   - child `models` merge into parent `models` (dedupe by id).
   - if a child's parent id is not itself in the catalog, PROMOTE the child to a parent row (so we
     never silently lose a provider) — label via `canonicalLabel ?? entry.label`.
3. Status/authHealth/expiry/plan/usage from the matching `providerConnections` row (pending
   device-flow → "pending" as today). `models` = parent.models (deduped, capped ~6 for display).
4. Sort connected-first, then label. Keep `roleLabel` (openai → "Lead orchestrator", else
   "Subagent") — that is real (orchestrator plan), keep it.
Keep the existing `projectProviderConnections`/`providerConnectionSummary` working (summary counts
should count PARENT rows now — update to use `projectModelProviders`). Update `connectionHealthSummary`
similarly so the health stat tiles count curated parents (+ gateway + github) not raw catalog.

### C. Web UI — `apps/web/components/connections/model-providers-panel.tsx`
Re-render as the reconciled mockup's **grouped table** (`table table-compact table-cards`), columns
**Provider | Auth | Models | Status | (action)**:
- Provider cell: parent label + role badge (✦ Orchestrator / Subagent) + a subtle sub-line listing
  `runtimeLabels` ("incl. Codex CLI runtime") + folded variant hint when present.
- Auth cell: method badges derived from the merged auth choices (OAuth / Device / API key / Setup
  token). Use existing `providerAuthLabel`-style logic but as discrete badges.
- Models cell: first N model ids as `u-mono`, "+K more"; honest "—"/"Routes many" when empty.
- Status cell: dot + `statusLabel`; append `expiryLabel`/`planLabel`/`usageLabel` as `u-subtle`
  when present. 5-state honest.
- Action: Connect (opens the existing `ProviderConnectDialog`) when not connected; connected rows use a row-actions menu with Manage, eligible Set as main orchestrator, a separator, and Disconnect.
  Keep the search box + Connect/Available split IF it survives grouping, else a single grouped table is fine (mockup is one table).
  Preserve the existing dialogs, forms, server actions, and `DeviceFlowPoller`.
  Keep the "Provider catalog unavailable" empty state.
- Keep a11y AA: table caption, `scope="col"`, `data-label` on cells, `u-sr-only` for icon-only.

### D. Tests (red→green; this is the tdd gate)
Update/extend `apps/web/test/connections-page.test.ts` and
`apps/workers/src/provisioning/__tests__/connections.test.ts` for the NEW contract. MUST assert
(acceptance snapshot booleans):
- Given a catalog containing `zai` and `openrouter` → projected parents include ids `zai` and
  `openrouter` (has-zai, has-openrouter true).
- Given catalog entries `claude-cli` (parent anthropic) and `codex` (parent openai) with an
  `anthropic`/`openai` parent present → NO top-level row for `claude-cli`/`codex`; their runtime
  labels appear folded on the parent (no-standalone-runtime-row).
- Given a non-LLM entry (e.g. `deepgram`, `elevenlabs`) → excluded from projected parents
  (no-non-llm).
- A provider with `models:[{id:"glm-4.7",...}]` → the projected parent exposes those models (real
  models rendered, not `suggestedModel` only).
- authStatus mapping: `status:"expiring"` → view status connected + authHealth "expiring" +
  expiryLabel present; `status:"missing"|"expired"` → needs_attention; usage.plan → planLabel.
- Worker: when `models.authStatus` throws / is unadvertised, snapshot still builds from the CLI
  path (fallback), providers not dropped, no secret in any call/result.
- Preserve the still-valid existing asserts (env boundary PROVISIONING_WORKER_URL/TOKEN, non-admin
  forbidden before any provisioning call, DESCOPE markers, secret-never-leaks, config.patch
  operator.admin-required-before-send, disconnect merge-patch, orchestrator plan).
Where an existing assert encodes the OLD flat contract (e.g. exact "connections-provider-list"
`<ul>` string, Connected/Available tab strings), UPDATE it to the new grouped-table contract — the
mockup-revision-first pivot intentionally changes it. Keep the DESCOPE(...) P8 markers.

### E. Real-world driver — `connections-drive.local.mjs` (repo root, sibling of acceptance-drive.local.mjs)
Playwright driver exercising the REAL flow on the live stack (`http://web.opzava.localhost:18088`)
using the same real-login helper the other `*-drive.local.mjs` use (NO minted sessions). Steps:
navigate to `/connections`; assert the Model providers table renders; assert has-zai + has-openrouter
rows; assert NO standalone `claude-cli`/`codex` row; assert at least one real model id is shown for a
connected provider; screenshot to `real-validate-artifacts/`. Exit non-zero on any failure. Mirror
the structure/helpers of the existing drivers exactly.

## Acceptance (the slice is Done only when all pass)
- `pnpm -w turbo run typecheck test lint build` green across touched packages (Claude runs, forced).
- Real-login browser test shows the grouped, curated table; snapshot booleans has-zai,
  has-openrouter, no standalone claude-cli/codex, no non-LLM all TRUE.
- Worker/gateway logs show the real RPCs firing (`models.list`, `models.authStatus` or the CLI
  fallback line).
- `node real-world-validate.local.mjs` (BARE, never piped) exits 0 with 2 consecutive clean passes.
