<!-- agent-context: read this before editing the module -->

# core/auth — Device Authorization (RFC 8628)

## Purpose
The framework-independent core of Opzava's device-authorization grant: the contracts,
crypto, device-code issuance, and the token service (issue / resolve / rotate / revoke)
for local agent tools authenticating to a cloud Opzava. Pure `core/` — DB, clock, and
role-derivation are dependency-injected by the wiring (B1b in `src/lib/auth.ts`), so this
module imports no `platform/*`, no `modules/*`, and no `src/lib` (layering-guarded).

## Public surface
- `contracts.ts` — TTLs (8h access / 30d refresh), `ACCESS_SKEW_SEC`, `ROTATION_GRACE_SEC`,
  `USER_CODE_CHARSET` (base-20), `capRole`, `IssuedTokenPair`, `DevicePrincipal`.
- `crypto.ts` — `hashToken` (sha256), `newOpaqueToken`, `maskToken`.
- `device-code.ts` — `issueDeviceCode`, `randomUserCode`, `canonicalizeUserCode`.
- `token-service.ts` — `issueForDevice`, `resolveDeviceToken`, `rotate`, `revokeChain`,
  `revokeDevice`, `DeviceTokenDeps`.

## Invariants
1. **Hash-only at rest.** Raw access/refresh tokens are generated once, returned to the
   caller, and never persisted — only `hashToken(raw)` (sha256) is stored/compared.
2. **Device tokens are never admin.** `resolveDeviceToken`/`issueForDevice` cap the role at
   operator via `capRole`, regardless of approved scopes.
3. **Explicit workspace required.** `issueForDevice` throws without a workspaceId (the
   `device_tokens.workspace_id` column is NOT NULL with no default) — closes the
   cross-tenant trap at the schema.
4. **Server-safe rotation.** `rotate` uses a conditional UPDATE as the lock + a
   **grace-window** disambiguation (`ROTATION_GRACE_SEC`, NOT rotation_seq) so a legitimate
   concurrent loser is `already_rotated` (not revoked) while a stale replay is `reuse_detected`
   → family revoke. Cross-replica races are bounded by the G1 single-active-writer lock.
5. **`core/` purity.** No `platform/*`, `modules/*`, or `src/lib` imports (architecture test).

## Editor guardrails
- Do NOT add a `src/lib` or `platform/*` import — it breaks the layering guard + the
  engine boundary. Inject the dependency instead.
- The rotation disambiguation is grace-based by design; do not "simplify" it to rotation_seq
  (that false-revokes legitimate concurrent losers — see the token-service header comment).
- Schema lives in migration `058_device_tokens_oauth_sessions_denylist`; `workspace_id` has
  NO default by design — do not add one.
