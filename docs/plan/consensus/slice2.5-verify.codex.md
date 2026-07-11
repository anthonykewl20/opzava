# Slice 2.5 final verification — SHIP

Adversarial verify of `git diff development...HEAD`. The multi-agent deep-verification fan-out and
the consolidated codex review both exceeded the background-task timeout (repeated kills on
long runs), so the high-risk lanes were verified by DIRECT inspection + the full forced gate
chain. Honest about that below.

## Gates (Claude, forced, whole workspace)
typecheck 0 · tests 0 failures · lint 0 · build 0. MinIO healthy in compose; migrations
0004-0007 applied. The `next build` passing is itself proof no server-only module (pg/adapters/
S3) leaks into a client bundle (a defect the verify-loop caught and fixed mid-slice).

## High-risk lanes (direct inspection — all CLEAN)
1. **Link-token authority** — stored as sha256 `token_hash` only (insert + lookup by hash; no
   plaintext persisted); verify enforces expiry/revocation/membership_version. `link-tokens.ts`.
2. **MCP scope gating** — `server.ts:66-112` `hasScope(principal, 'tasks:read'|'tasks:write')`
   gates tool exposure; a read token cannot reach mutating tools. Principal is built only from the
   verified token's user; client-supplied ids are ignored.
3. **Connections boundary** — the web layer holds NO `operator.admin` and never execs the gateway
   (only match is UI copy); all connects go through the provisioning worker over an internal-token
   endpoint. Keys/tokens never reach the browser.
4. **RLS parity (0004/0005/0006/0007)** — every new table has FORCE RLS + tenant-isolation
   (symmetric USING+WITH CHECK) + RESTRICTIVE no-context + composite (workspace_id, organization_id)
   FKs. Confirmed counts per migration.
5. **Active-close idempotency** — close outbox keyed by a dedupe key (`...#N:close`) + projection
   `on conflict (workspace_id, repository, number)`; already-closed = success; close failure never
   blocks task completion; external reopen = shown divergence.
6. **RLS error mapping** — the verify-loop caught the 7 evidence/quality services returning raw DB
   errors; fixed to wrap via `taskError(..., mapDatabaseError(error))` (proven by the RLS
   integration test now passing).

## Defects the verify-loop caught + fixed (evidence it earned its keep)
server/client pg-in-bundle leak · inconsistent RLS error mapping · Traefik router-name collision
(real Dokploy parity bug) · broker/workers dev-script NodeNext crash.

## Honest couldn't-fully-verify
- The dedicated multi-agent L4-QA / L6-deep-security lanes did not run as separate agents (session
  limits + background-task kills); the targeted inspections above are the proportionate substitute.
- Provider device-flow BROWSER polling is implemented + fake-lane tested but not runtime-proven
  against every real provider; only GPT-Pro/Codex is proven live end-to-end (Slice 2). API-key
  provider connects are non-interactive and lower-risk.

## Verdict: 🟢 SHIP
No CONFIRMED blocker. Recommend `/code-review ultra` on the PR for the deep cloud lanes that
couldn't run locally, and a live device-flow smoke against one API-key provider (e.g. OpenRouter)
before relying on multi-provider in anger.

## Heavy deep-verification — 4 parallel adversarial lanes (2026-07-03)

Ran L6-security, S3-idempotency, S1-races, L3-correctness as parallel subagents against the full
diff. They CONVERGE (independent lanes flagging the same defect = high confidence) and the
security/integrity core is confirmed HELD by all four: MCP authority is strictly token-principal
(read tokens can't register mutation tools), link-token forgery infeasible (hash-lookup + re-checked
claims + RLS backstop), close-never-blocks-completion, provider keys never reach the browser / web
never holds operator.admin (constant-time internal bearer), RLS forced+WITH-CHECK on all 11 new
tables, no server/client leak, no unguarded Result narrowing.

### Must-fix before merge (adjudicated)
- H1 [high] transient card activity-poll error wipes the AI-Run trace + latches false "assistant run
  failed" with no reconnect (task-card-activity-source.ts:142 / activity/route.ts:67 /
  task-card-detail.tsx:517).
- M1 [med, DATA LOSS] card-detail edit omits assigneeUserId -> updateTask clears the assignee
  (task-card-detail.ts:639 + tasks.ts:1510). Board action + MCP handler preserve it — the card path
  regressed.
- M2 [med] device-flow poller never clearInterval on expired/failed -> unbounded provider polling
  (device-flow-poller.tsx:60).
- M3 [med] connection mutations authenticated but not role-gated (any org member can provision)
  (connections/actions.ts:17).
- M4 [med] Ask Opzava double-renders the final assistant message (draft not reset to idle)
  (ask-opzava-chat.tsx:238 / ask-opzava-page-state.ts:137).
- M5 [med] issue "You" hardcodes "anthony" (issues-state.ts:140).
- Outbox robustness (S1+S3+M6/L1 converge): add FOR UPDATE SKIP LOCKED to the claim, a processing-
  timeout reclaim/reaper for crash-orphaned rows, and a max-attempts/dead-letter cap
  (issues.ts:704-790).
- "New issue" double-submit creates two real GitHub issues — add an in-flight/idempotency guard
  (issues/actions.ts:44 / issues.ts:565).

### Tracked follow-up (contained / single-worker-tolerable / recoverable)
duplicate board `position` on concurrent create (S1-1b); duplicate issue projection rows on
multi-link (L3-L3); UTC off-by-one due-label (L5); comment button blocked during assistant stream
(L6); MCP update fails on other-user assignee (L2, latent); and — the broad one — client
idempotency keys on the mutating card MCP tools + UI creates (createTask/step/comment/check are
blind inserts; a retried at-least-once MCP call duplicates rows). Low-impact in the internal
single-user phase (RLS-safe, recoverable), but the MCP path deserves idempotency keys as scale-ready
hardening.

## Iterated re-review of the fixes (2026-07-03) — CLEAN

Ran an adversarial re-review of the 8 must-fix commits (slice2.5-fixes-review.spark.md,
verdict SOUND-WITH-FIXES). 7 of 8 confirmed correct on re-read (M1 preserves via session
context; M2 bounded + expiry-aware; M3 gates every mutation from session roleKeys; new-issue
race-safe via DB unique ON CONFLICT; 0008 RLS parity; no regressions). It caught ONE [high]
introduced BY the outbox hardening itself — a fencing race where a stale finalizer could
overwrite a newer `closed`. Fixed with a claim-token (uuid) fence (0009); a first claimed_at-
timestamp fence was rejected for microsecond round-trip fragility (caught by the reclaim test),
which is exactly why the fix diff was itself re-verified. All gates green after the fence.

## Final verdict: 🟢 SHIP (merge-ready)
4 adversarial lanes + an iterated fix re-review. Security/integrity core independently confirmed
across all passes; 8 deep-verification must-fixes + 1 fix-introduced fencing race all resolved and
regression-tested. Tracked follow-ups (non-blocking, recorded): duplicate board position on
concurrent create; duplicate issue rows on multi-link; UTC due-label off-by-one; comment button
blocked during assistant stream; MCP card-mutation idempotency keys (highest-priority follow-up —
local-agent at-least-once path). Recommend `/code-review ultra` on PR #124 for the deep cloud
lanes and a live device-flow smoke against one API-key provider.

## Correctness follow-ups + 2nd iterated re-review (2026-07-03) — CONVERGED CLEAN

After the SHIP verdict, closed the correctness tracked-follow-ups on-branch (they complete the
slice's at-least-once sad-path contract): MCP card-mutation idempotency keys (createTask/step/
comment/quality — the MCP tools bypass the assistant path's outcome-first receipts), multi-link
issue dedup, and the position race. The position "fix" first shipped a UNIQUE(workspace,status,
position) index that BROKE reorder (moveTask sets absolute positions, no make-room shift → 23505 on
a move to an occupied slot) — caught by reading moveTask, not the green tests; reverted (0011),
position accepted as best-effort ordering, guarded by a reorder-to-occupied test.

A 2nd adversarial re-review of the follow-up fixes: 4 PASS (MCP wiring + scope gate, deterministic
multi-link dedup, position revert + schema alignment, migration hygiene) + 1 [HIGH] — addQualityCheck
enforced the approved-is-terminal gate before the idempotency path, failing an at-least-once replay of
an already-recorded check once the review was approved. Fixed: idempotent replay returns the existing
review unconditionally; new-check gate unchanged. Regression test added.

Findings converged to zero across the iterations (8 → 1 → 1, each on progressively smaller surface).
Final state: typecheck 0, tests 0 failures, lint 0, build 0 (forced); migrations 0004-0011 applied.
Merge-ready.
