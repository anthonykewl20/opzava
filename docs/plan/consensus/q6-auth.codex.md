# Q6 Authentication Stack

**Recommendation: Better Auth primary, Auth.js v5 Postgres fallback, all behind `AuthPort`.**

1) **Library.** Pick Better Auth despite immaturity because it deletes the most bespoke, high-risk code for this product: org/team membership, revocable DB sessions, TOTP+recovery, passkeys, and anti-enumeration. The advisory count is real and lands on our exact features, so run it pinned, patched, cookie-cache disabled, with GHSA monitoring and invite/2FA regression tests. Lucia is out; Auth.js v5 is fallback only.

2) **AuthN/AuthZ split.** Better Auth authenticates users and proves coarse org membership. Q5 `AuthorizationPort` remains the only fine-grained authZ authority for projects, roles-as-data, Guest-Clients, agents, knowledge, and admin actions. Membership/invite changes enter Opzava through an `AuthPort` use case, are mirrored to `Membership` plus a `membershipVersion`, and issue/revoke Opzava role grants in one transaction; domain services never read Better Auth roles directly. If fallback to Auth.js happens, these same app tables keep org membership real.

3) **Sessions.** Use DB-backed, revocable sessions, not JWT auth. Store session id/token hash, user, org context, device, MFA level, membershipVersion, expiry, and `revokedAt`. Logout-all, password reset, org removal, and role/membership changes revoke or invalidate affected sessions and push bindings.

4) **MFA.** Baseline is TOTP with hashed single-use recovery codes. Passkeys are allowed as passwordless/sign-in and required as step-up for high-risk org-admin operations once stable. Orgs can enforce MFA for members; platform/admin actions require fresh MFA.

5) **PWA/Web Push.** The service worker never reads auth cookies. Window code calls `/api/auth/session` and `/api/push/subscriptions` with httpOnly SameSite cookies; the server binds subscription hash to `(sessionId,userId,orgId,deviceId)` and checks it again at enqueue. Push payloads contain no sensitive data and prompt fetch-on-open. Offline mode is cached shell plus last-known redacted state; privileged screens show an auth-required gate until `/session` succeeds. Unsafe HTTP commands require SameSite=Lax/Strict, Origin checks, and a server-issued CSRF nonce; no "two-cookie split."

6) **Guests.** External Guest-Clients use a separate project-scoped magic-link flow: token hash, project id, intended email, TTL, single-use, audit, and narrow portal permissions. Accepting a guest link never creates org membership.

7) **Sad path.** A forged/replayed org invite exploits provider bugs to add an attacker as admin or to the wrong tenant. Invariant: no provider callback grants access by itself. Invite acceptance must revalidate an Opzava `Invitation` row in the same transaction: token hash, email/user binding, org id, role ceiling, inviter authority, TTL, single-use, tenant status, and RLS context; then audit, bump `membershipVersion`, and revoke stale sessions/push bindings.

**Lean ops + agnostic.** One Postgres-backed auth stack, one `AuthPort` contract, no managed IdP requirement. Better Auth can fail out to Auth.js v5 because the app depends on Opzava principals, sessions, membership mirrors, and `AuthorizationPort`, not provider schemas.
