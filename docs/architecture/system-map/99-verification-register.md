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

> More corrections will be appended as each zone doc is verified. The existence of C1 on the
> very first verification is the reason the whole map is being re-checked rather than trusted.

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
| Q1 | Are the two orchestration engines (inherited `tasks` board vs opzava `WorkflowRun`/`Job`) meant to converge, or stay as "operator board" vs "worker pipeline"? | Determines whether the duplicate agent/task/cost/audit models are debt or intentional separation. Drives the whole parity story. | ❓ **open — needs a product decision from you** |
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
| Inherited schema.sql base tables | 🔎 | in progress |
| Inherited numbered migrations | 🔎 | pending |
| Everything else | 🔎 | pending per-zone passes |
