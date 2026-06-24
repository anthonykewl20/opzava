# ARD 0012 — Device Authorization & Persistent Reliable Connection

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0008](0008-secret-storage-and-resolution.md) (SecretReference / hashes-at-rest), [ARD 0009](0009-realtime-user-chat-transport-and-fanout.md) (SSE cursor reuse), [ARD 0011](0011-single-orchestrator-execution-model.md) (fused auth cascade + single-active-writer), [MASTER-PLAN](../architecture/orchestration-hardening/MASTER-PLAN.md) Track D + B1b
- **RFCs:** 8628 (device grant), 6749 §6/§10.4/§2.1 (refresh, reuse detection, client confidentiality), 7009 (revocation), 9700 (best current practice); MCP authorization spec 2025-06-18

## Context

A user's **local** agent tool (Claude Code/Desktop, Codex CLI/Desktop, opencode, hermes, openclaw — the seven clients) must authenticate to Opzava running on a **cloud Dokploy** instance. Today the only options are a static global `API_KEY` (`auth.ts:487-502`, unconditional `role:'admin'` at `:495`) or a profile-file/cookie copied by hand — no per-device identity, no rotation, no revocation, and the credentials persist as cleartext at default file mode (0644). This does not meet "real-world reliability hardening" for the local-agent ↔ cloud link.

The verified design (`/deep-research` + design-it-twice + hardening, distilled in MASTER-PLAN Track D) selects RFC 8628 device authorization: the local tool triggers a device code, the user approves it in the Opzava web UI (browser on the public HTTPS Dokploy origin), the tool receives a token. It deliberately **diverges from `gh`'s never-expiring token model** because Opzava controls both the client and the authorization server and can do rotation.

The whole design hangs on **one deep module behind one ~15-line branch** in the existing `getUserFromRequest` cascade (`auth.ts:435`), inserted between the `agent_api_keys` block (`auth.ts:505-554`) and the plugin hook (`:557-560`). Device tokens and agent-scoped keys share one authz path from day one (the **fused** principal-binding + `resolveDeviceToken` change — see MASTER-PLAN B1a/B1b).

## Decision (FINAL — per resolved decisions, no re-litigation)

1. **Opzava acts as its own OAuth authorization server + resource server** on its existing Dokploy origin, issuing **RFC 8628 device-authorization grants** to public-client agent tools. Access tokens are **8h**; refresh tokens are **30d** with **rotation** and RFC 6749 §10.4 reuse→family-revocation.

2. **Local token store: `0o600` plaintext file, no passphrase, no keychain dep.** A stdio MCP shim is spawned by Claude Code/Desktop as a subprocess with **no TTY** — it cannot prompt for a passphrase, so any fail-closed encrypted file silently breaks every cold-start-after-reboot. `keytar`/`libsecret` is rejected (deprecated since 2022; native rebuild breaks Docker parity + the `node .next/standalone/server.js` contract). Control set: `0o600` + 8h TTL + refresh rotation + dashboard revoke + stolen-token detection, with **OPTIONAL** `OPZAVA_TOKEN_ENC_KEY` envelope encryption (fallback `AUTH_SECRET`) and an explicit `OPZAVA_INSECURE_STORAGE=1` opt-in gate. (D-2.)

3. **stdio transport now; HTTP-MCP deferred.** The MCP 2025-06-18 spec states stdio servers SHOULD NOT follow the auth spec. HTTP-MCP (RFC 9728+8414+7591+PKCE+8707) is **additive** — the token endpoint is grant-type-agnostic from day one and `device_tokens.audience` is reserved, so retrofitting `authorization_code+PKCE` is not a rewrite. (D-1.)

4. **One deep module, two adapters.** `src/opzava/core/auth/` (contracts + token-service + device-code + crypto) exposes `resolveDeviceToken(bearer): User|null`, `issueForDevice`, `rotate`, `revoke`. Two adapters at the surface (modeling RFC 6749 §2.1 client confidentiality): **DeviceFlowProvider** (human/public client) and the **existing StaticApiKeyProvider** (CI). The factory bifurcates by presence of `MC_API_KEY`; everything else is hidden. `issueForDevice` REQUIRES explicit `workspace_id` (no default — closes the cross-tenant trap) and REJECTS/DOWNGRADES any scope mapping to admin — **device tokens are never admin** (default viewer/operator), regardless of approver.

5. **SERVER-SAFE three-layer rotation guard (the highest-value correctness property).** The refresh path's conditional UPDATE (`WHERE rotation_chain_id=? AND refresh_token_hash=? AND revoked_at IS NULL AND rotated_at IS NULL`) is the cross-instance lock (Traefik sticky sessions are a performance hint, not a correctness guarantee). On `changes()===0`, disambiguate by `rotation_seq`: `revoked_at IS NOT NULL` → 401 idempotent; `rotation_seq == max(seq in chain)` → legitimate concurrent loser → 409 `already_rotated` (NOT a revoke); `rotation_seq < max(seq)` → genuine reuse → family-wide revocation + `security.event` severity=critical. **Chain-level** revocation is the default: any access token whose `rotation_chain_id` has any row with `revoked_at IS NOT NULL` is rejected (defeats the stolen-refresh-refreshed-before-revoke attack).

6. **DB-backed device-flow rate limits (replica-consistent), critical:true.** In-memory Maps split brute-force across N replicas; the `userCodeVerifyLimiter` (keyed by IP **and** attempted user_code, 5/600s) and the refresh limiter use a DB-backed counter mirroring the guarded-counter pattern. `user_code` is 8 chars from the base-20 confusable-free set (`BCDFGHJKLMNPQRSTVWXZ`); `device_code` is `randomBytes(32).base64url` (≥128 bits, never displayed); both `expires_in=900s`.

7. **Reliable persistent connection.** One shared resilient-http module (`scripts/lib/mc-client.cjs`) owns retry/backoff/**full**-jitter/per-class-timeout/refresh-on-401-single-flight/circuit-break, used by BOTH the stdio shim and the CLI. SSE resume rides the **existing** `realtime_events.id` cursor (`realtime-events.ts:165` `readServerEventsAfter`, `:202` `parseLastEventId`) — server-side unchanged; the one genuinely-new client work is the `sseStream` `Last-Event-ID` rewrite (`mc-cli.cjs:207` parses only `data:` today). Exactly-once mutation retry is **honestly scoped** to routes with an existing idempotency index (chat via `054` at `migrations.ts:1493`, task capture via `client_request_id`); non-indexed routes fall back to single-attempt-no-retry.

8. **One migration: `058_device_tokens_oauth_sessions_denylist`** creates **three** tables in one migration — `device_tokens` (mirrors `agent_api_keys`/040; `workspace_id INTEGER NOT NULL` schema-enforced), `oauth_device_sessions` (clones the access-requests approval template), and `revoked_access_tokens` (the optional `MC_DEVICE_INSTANT_REVOKE=1` denylist, folded in to avoid a redundant 059 id). `device_tokens.workspace_id` is `NOT NULL` (schema-enforced, not just application-checked).

9. **Fused auth task split to kill the circular dependency.** Principal-binding (B1a, no device dep) + the `resolveDeviceToken` cascade branch (B1b, `depends_on: D2`) are split so neither blocks the other; both land in the same `getUserFromRequest` cascade.

## Consequences

- **Positive:** per-device identity, rotation, and revocation; a reliable, persistent, cold-start-safe connection; one deep auth seam with two real adapters; near-real-time `security.event` revocation broadcast (the `EventType` already exists at `event-bus.ts:34`); no new heavy dependencies; HTTP-MCP is a non-breaking future addition.
- **Negative:** the **8h revoked-but-unexpired window** — stdio revocation is lazy (next-call 401), so a stolen valid access token is honored up to 8h minus 60s skew after an operator clicks revoke. Mitigated by the 8h bound + the broadcast + the optional `MC_DEVICE_INSTANT_REVOKE=1` denylist (O(1) per-request DB hit). During a redeploy, dispatch-event SSE can go quiet up to lock TTL (only the elected leader emits `task.status_changed`) — documented in ops-cheatsheet.
- **Neutral:** `mc auth device` replaces manual key-copying; the static `API_KEY` path remains for CI/automation as the second adapter.

## Alternatives considered

- **D1 — OS keyring (`keytar`).** Rejected: deprecated since 2022; native rebuild breaks Docker parity + the standalone binary; the headless stdio spawn has no TTY anyway.
- **D3 — passphrase-encrypted CLI credentials file.** Rejected: a no-TTY stdio shim cannot prompt on cold start; fail-closed breaks every reboot. The `0o600` + rotation + revoke + stolen-token-detection control set is proportionate for a public client whose token is OS-permission-guarded and bounded to 8h.
- **`gh`-style never-expiring token.** Rejected: GitHub's OAuth-App platform forbids refresh tokens; Opzava controls both ends and can (and must) rotate with stolen-token detection.
- **HTTP-MCP over Streamable HTTP on the public origin now.** Deferred: the largest build and a deployment change; stdio satisfies the device-flow requirement and the token endpoint is grant-type-agnostic so HTTP-MCP is additive.

## Open questions (safe defaults ship; NOT blockers)

1. **8h revoke-window tolerance** — the engineering default (8h + near-real-time broadcast) ships; operators who demand instant kill set `MC_DEVICE_INSTANT_REVOKE=1`. *The one tolerance benefiting from human sign-off.*
2. **`OPZAVA_TOKEN_ENC_KEY` default** — optional envelope now (simplest, matches the cold-start invariant); making it REQUIRED is a future tightening if disk-theft threat rises.

## References

- `auth.ts:435` (`getUserFromRequest`), `:505-554` (agent_api_keys block), `:557-560` (plugin hook insertion point), `:487-502`/`:495` (global admin key), `:634-640` (hashApiKey/hashSessionToken), `:652` (deriveRoleFromScopes), `:668` (requireRole)
- `migrations.ts:1224` (agent_api_keys/040 pattern), `:1493` (054 `idx_messages_client_message_id` idempotency precedent)
- `realtime-events.ts:165`/`:202` (SSE cursor), `event-bus.ts:34` (security.event EventType)
- `mc-cli.cjs:207` (sseStream id-gap), `mc-mcp-server.cjs:82` (collapsed error)
- `docker-compose.dokploy.yml:101-103`/`:20` (sticky cookie + forwardedHeaders), `session-cookie.ts:11-14` (isRequestSecure)
- RFC 8628, 6749 §6/§10.4/§2.1, 7009, 9700; MCP authorization spec 2025-06-18; ARD 0008, ARD 0009, ARD 0011; MASTER-PLAN Track D + B1b
