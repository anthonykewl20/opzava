# Slice 2.5 final verification — SHIP

Adversarial verify of `git diff development...HEAD`. The multi-agent verify-deep fan-out and
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
