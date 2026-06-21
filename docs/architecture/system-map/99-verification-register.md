# Verification Register

Living record of (a) agent-research claims that re-verification **corrected**, and (b) **open
questions** that still need a decision or a deeper read. This is the accuracy backbone: the
SYSTEM-MAP is only trustworthy because every claim that failed verification is logged here
instead of silently propagating.

Legend mirrors the README: ✅ verified · 🔎 unverified research · ⚠️ corrected · ❓ open.

---

## Corrections (agent claim was wrong or misleading)

| # | Claim as reported by agent | Reality (verified) | Evidence |
|---|----------------------------|--------------------|----------|
| C1 | Integrations zone: "`initWebhookListener()` is defined but I found no boot-time call in src — the live event→webhook bridge may be inert." | **Wrong.** It IS called at startup, lazily, inside `initializeSchema()` which runs on first DB access. The webhook event→delivery bridge is live. | ✅ `src/lib/db.ts:74-80` (`import('./webhooks').then(({ initWebhookListener }) => initWebhookListener())`) |
| C2 | Frontend: "5 `page.tsx` exist." | **Wrong.** 4 `page.tsx` + 1 `layout.tsx` (a layout, not a page). | ✅ `src/app/{[[...panel]],login,setup,docs}/page.tsx` + `src/app/layout.tsx` |
| C3 | Frontend: "~12 `mc-*` persisted keys." | **High.** 10 distinct keys. | ✅ `src/store/index.ts` (active-project/tenant, dashboard-layout, doctor-dismissed-at, header-density, livefeed-open, openclaw-update-dismissed, sidebar-expanded/groups, update-dismissed-version) |
| C4 | Frontend: `nav-rail` listed among "largest panels." | **Misleading.** `nav-rail` (72KB) is in `layout/`, not `panels/`; the largest *panel* after the top 4 is `agent-squad-panel-phase3` (~52KB). | ✅ `src/components/layout/nav-rail.tsx` |
| C5 | Frontend raw-`fetch` list omits `approval-queue-panel`. | **Incomplete.** It also uses raw `fetch` (no global 401 handling). | ✅ apiFetch=0 / raw fetch=2 in `approval-queue-panel` |
| C6 | API: public (no-`requireRole`) routes = 9. | **Incomplete.** **10** — pass-1 omitted `auth/logout`, `auth/google/disconnect`. | ✅ both are session/credential teardown, public by design |
| C7 | API: implies Zod is the opzava validation norm. | **Misleading.** Only `POST /api/ops/runs` uses Zod; other opzava mutations validate via domain `parse*/transition*` or allow-list checks. | ✅ `ops/runs/route.ts:36-41` |
| C8 | "`campaigns/[id]/run` is the only opzava route doing live external I/O." | **Narrowed.** `connections/test` also makes a live *outbound* call, but read-only; F1's "only live **side effect**" stands. | ✅ `connection-verifier.ts:14,38` |
| C9 | DB: self-init at `db.ts:600`; api_key override at `auth.ts:567`. | **Off by lines.** Self-init `db.ts:602`; override **read** `auth.ts:571` (567 = `resolveActiveApiKey()` head). | ✅ `db.ts:602`, `auth.ts:571` |
| C10 | Integrations: gateway RPC "protocol 3/4 handshake." | **Wrong server-side.** Server RPC is **v3-only** (`min=max=3`); 3/4 is the browser path only. | ✅ `openclaw-gateway.ts:7,143-144` |
| C11 | Integrations: `callOpenClawGateway` callers include `status`, `gateways`, `agent-runtimes`, `super-admin`. | **Wrong.** Those four don't import it. Real callers: `task-dispatch` + `sessions`, `sessions/transcript/gateway`, `sessions/[id]/control`, `spawn`, `channels`, `nodes`, `chat`. | ✅ grep of importers |
| C12 | Integrations: adapters "driven by `/api/agents/register`." | **Wrong.** Driven by **`/api/adapters`** (`getAdapter`/`listAdapters`); `/api/agents/register` uses no adapter. | ✅ `app/api/adapters/route.ts:53,67` |
| C13 | Inherited: `classifyDirectModel()` at `task-dispatch.ts:500-522`. | **Off by lines.** Spans `479-523` (the hardcoded model ids themselves are correct). | ✅ `task-dispatch.ts:479-523` |

> ⚠️ **Re-confirmed (do NOT "fix"):** doc 50's "**6** frameworks × 6 archetypes" is **correct** — an intermediate
> read miscounted as 5; `FRAMEWORK_REGISTRY` has 6 entries incl. `claude-sdk` (`framework-templates.ts:42-246`).

> **Second pass complete.** C2–C13 were found by five independent verification agents (one per 🔎 zone) that
> re-checked each previously-unverified claim against source. **No F-finding (F1–F8) was refuted**; the four
> watchlist observations were all confirmed and promoted to F9–F12 (see [`90`](./90-parity-findings.md)).

---

## Double-verified findings (pass 1 + independent pass 2 both agree → ✅✅)

A second, context-free agent adversarially re-derived each of these (told to try to refute).
All confirmed. Full write-up in [`90-parity-findings.md`](./90-parity-findings.md).

| # | Finding | Both passes |
|---|---------|-------------|
| F1 | Live-provider guard (approval/reservation/exactly-once) has zero non-test callers; campaign Resend send bypasses it; no provider cost/external-call event on the live path. | ✅✅ |
| F2 | Two unreconciled agent models (`agents` vs `opzava_agent_roles`); no bridge. | ✅✅ |
| F3 | Content review gates (fact-check/brand/anti-slop) recorded but not enforced; only human-approval halts. | ✅✅ |
| F4 | No production `SecretResolver`; live secrets read cleartext from `settings`; `credentialRef` is a dead literal. | ✅✅ |
| F5 | **Engine B's durable runner daemon is never booted** — no background loop; runs only synchronously in request handlers. (Stronger than pass 1.) | ✅✅ |
| F6 | `OpzavaAdminSettings` unwired (no HTTP route); rate/cost limits not even projected into runtime options. | ✅✅ |
| F7 | Inherited `src/lib` hardcodes model IDs + pricing (4 sites); violates own golden principle; opzava complies. | ✅✅ |
| F8 | Governance `test/*.test.mjs` gates not run by vitest, no `node --test` script, absent from CI. | ✅✅ |
| F9 | Orphaned `va-task-review` step — in `GENERAL_VA_PIPELINE_ORDER` but no role owns it (`agentId:null`). | ✅ (2nd pass) |
| F10 | Two divergent content orchestrators (sync-mock vs recording) duplicate the 11-step sequence. | ✅ (2nd pass) |
| F11 | `isCronDue` parses only 3/5 cron fields (drops day-of-month + month) → over-fires. | ✅ (2nd pass) |
| F12 | Inherited-brand residue in `scripts/` is ungated (branding gate scans only `src/`+`messages/`). | ✅ (2nd pass) |

> F9–F12 were the four watchlist observations; an independent second pass confirmed each with file:line
> evidence and they are now written up in [`90-parity-findings.md`](./90-parity-findings.md).

### Deterministic cross-check (pass 3 — non-LLM grep, the structural layer)

Reproducible `grep` corroboration of the structural findings (no LLM judgement involved):
- **F2/F5** — `grep @/opzava src/lib/{scheduler,task-dispatch}.ts` → none; `grep lib/{task-dispatch,scheduler} src/opzava` (non-test) → none. The two engines do not reference each other.
- **F5** — `runCampaignDaemon` / `createRunnerDaemon` / `createRuntimeRunnerDaemon` have no non-test caller; the only hit is a barrel re-export (`modules/content/index.ts:409`). The daemon is never started.
- **F1** — `guardLiveProviderExecutionAfterPreflight`, `createExternalCallReservation`, `createExternalCallIdempotencyLookup` → no non-test callers; `executeApprovedLiveProviderActionOnce` → called only by the guard (`live-approval-runtime.ts:141`), which itself has none.

→ **F1, F2, F5 are now triple-verified** (pass 1 research + pass 2 adversarial agent + pass 3 deterministic grep).

### Tooling note — Understand-Anything (Egonex-AI)

Installer (`install.sh`, 318 lines) inspected: clean (`set -euo pipefail`, `git clone` + symlinks,
no `sudo`/nested-pipe/obfuscation). **But its platform table has no Claude Code target** (gemini,
codex, opencode, openclaw, vscode, kiro, …). For Claude Code the install is the native
`/plugin marketplace add Egonex-AI/Understand-Anything` + `/plugin install understand-anything`,
and analysis is triggered by the user typing `/understand` — all interactive CLI actions the agent
cannot perform. **Deferred to the user.** Once `.understand-anything/knowledge-graph.json` exists,
it can be consumed as an additional deterministic structural source. Meanwhile the deterministic
grep cross-check above already delivers the structural-corroboration value.

## Open questions (need a decision or deeper read)

| # | Question | Why it matters | Status |
|---|----------|----------------|--------|
| Q1 | Are the two orchestration engines (inherited `tasks` board vs opzava `WorkflowRun`/`Job`) meant to converge, or stay as "operator board" vs "worker pipeline"? | Determines whether the duplicate agent/task/cost/audit models are debt or intentional separation. Drives the whole parity story. | ✅ **resolved → [ARD 0007](../../ard/0007-engine-separation-and-surface-unification.md)** — *separate engines, unified surfaces*: opzava engine is canonical + single source of truth; inherited board is the operator console; cost/audit/dashboard unified via projection; agent models **bridged, not merged**. The duplication is now intentional. |
| Q2 | Should the live provider path be approval/receipt-gated? | Mechanics confirmed as finding **F1**; the *decision* is yours. | ✅ verified → F1 |
| Q3 | Do the governance gates run in CI? | Confirmed NOT on merge → **F8**. | ✅ verified → F8 |
| Q4 | Is there a production `SecretResolver`? | Confirmed none; cleartext from `settings` → **F4**. | ✅ verified → F4 |
| Q5 | Inherited migration ids `030`/`031` absent; `035` drops/recreates `api_keys`? | Confirmed: ids 001–050, only 030/031 absent; `035_api_keys_v2` drops/recreates (`migrations.ts:1048-1082`). | ✅ verified |

---

## Verification coverage tracker

| Zone | Re-verified? | Notes |
|------|--------------|-------|
| opzava runner schema | ✅ | `runner/migrations.ts` read in full — tables/columns/indexes confirmed |
| DB connection/pragmas | ✅ | `db.ts:28-52` |
| Webhook bootstrap | ✅ | corrected (C1) |
| Inherited schema.sql base tables | ✅ | 2nd pass — 8 base tables + enums confirmed (`schema.sql`) |
| Inherited numbered migrations | ✅ | 2nd pass — 48 migrations, ids 001–050, 030/031 gaps, 035 drop/recreate (`migrations.ts`) |
| opzava module-table columns (00) | ✅ | 2nd pass — all 6 column sets confirmed against the repos |
| Inherited API layer (60) | ✅ | 2nd pass — 165 routes, auth floors (91 viewer/78 operator/90 admin), v1/openapi; C6/C7 |
| Frontend (61) | ✅ | 2nd pass — shell/router/store/SSE/WS confirmed; C2–C5 |
| Inherited integrations (51) | ✅ | 2nd pass — webhook/poller/CLI confirmed; C10–C12 corrections |
| Inherited agent/task/memory/cron/tokens/skills (50) | ✅ | 2nd pass — scheduler 12 jobs, 6-framework registry re-confirmed; C13 |
| Admin-config/audit/costs detail (13) | ✅ | 2nd pass — all 🔎 detail held |
| Content + team/social/va module detail (20/21) | ✅ | 2nd pass — pipeline/contracts/dead-wiring confirmed |
| Tooling/build/governance (62) | ✅ | 2nd pass — CLI/MCP/Docker/CI confirmed |
| Understand-Anything tree-sitter cross-check | ⏸ | deferred to operator — needs interactive `/understand` |
