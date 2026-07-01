**Opzava Auth Architecture — Final Call**

1) **Better Auth (primary)** behind AuthPort. Feature-fit wins: built-in multi-tenant orgs/RBAC, revocable DB sessions, TOTP+recovery, passkeys, anti-enumeration shrink our custom code surface = fewer of OUR bugs. Pin to a vetted minor, subscribe GHSA on `better-auth`, audit cookie/cache/2FA paths. Fallback (Auth.js v5) reserved only if Better Auth breaks orgs or hits an unpatched critical on our pinned version. Both routes behind the AuthPort so the swap costs us days, not months.

2) **Split confirmed.** Better Auth = AuthN + coarse org membership only. Opzava Q5 AuthorizationPort stays SoT for resource-scoped authz (project/guest/asset). Three Better Auth roles are coarse membership; fine-grained checks never call Better Auth.

3) **DB-backed revocable sessions.** `session.token` stored, `expiresAt` honored, `revokedAt` for logout-all, password reset, role change, org removal. No JWTs. Cache disabled (`session.cookieCache.disabled = true`) — advisory-driven, not negotiable.

4) **TOTP + single-use recovery + passkey step-up baseline; admin-enforceable MFA per-org** via `requireMfa` policy on sensitive orgs/admin actions.

5) **PWA design:** `/api/auth/session` (httpOnly) is the only session read; SW posts `?endpoint=&keys=` for Web Push; push payloads carry a **one-time binding token** (HMAC(sessionId)) so the SW can validate without cookies; offline UI = cached public surfaces + explicit "auth required" gate, never assumes identity.

6) **Per-project scoped magic-link** for Guest-Clients: project key in token claims, server-binds to `guest_clients(project_id, …)`, TTL ≤ 24h, single-use, audit-logged.

7) **Biggest sad path + invariant:** an attacker flips a user's org role *between* session creation and use, then exfiltrates an org-scoped secret. **Invariant:** every privileged resource access re-checks membership + role inside the same DB tx that authorizes; `revokeSessionsOnRoleChange` runs in-tx, and push-binding tokens are re-validated server-side every wake.

**Lean-ops + agnostic:** one Postgres, one auth lib pinned, one AuthPort boundary — swap libs, not rewrite apps.
