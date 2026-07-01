---
name: better-auth
description: Implement Opzava authentication with Better Auth behind an AuthPort — revocable DB sessions, TOTP/passkeys, PWA session+push binding, scoped guest magic-links, and in-transaction invitation re-validation. Use for any auth/session/MFA/invite work.
---

# better-auth (Opzava)

Authoritative: **ADR-006** (grounded in `docs/plan/research/q6-auth-stack.md`). Better Auth is primary behind an **`AuthPort`**;
Auth.js v5 + Postgres adapter is the real fallback. **Pin releases; watch the `better-auth` GHSA feed.**

## When to use
Building login/signup, sessions, MFA/passkeys, invitations, password reset, guest access, or the PWA auth + Web-Push binding.

## Rules (non-negotiable)
- **Better Auth owns authentication + coarse org membership ONLY.** Fine-grained authz lives in the `AuthorizationPort` (RBAC — ADR-007 / `opzava-conventions`). Org membership **syncs INTO** our RBAC, not the reverse.
- **DB-backed, REVOCABLE sessions** (no JWT). Revoke on logout-all-devices, **password reset, org removal, role/membership change**. **`session.cookieCache` DISABLED** (a known 2FA-bypass advisory class — non-negotiable).
- **MFA:** TOTP + single-use recovery codes + **passkeys (SimpleWebAuthn)** step-up; **org-admin-enforceable** MFA.
- **PWA:** a service worker **cannot read httpOnly cookies** → the only session read is a server `/api/auth/session`; bind the **Web Push subscription ↔ session server-side** (validate at enqueue, **not** in the SW — a SW can't hold the HMAC key). **No "two-cookie split."**
- **Guest-Clients:** per-project scoped **magic-link** (TTL ≤ 24h, single-use, audited), and **never** org membership.
- **INVARIANT:** a provider invite-callback grants **nothing** without re-validating the Opzava `Invitation` row **in the same DB transaction**; `revokeSessionsOnRoleChange` runs in-tx.

## References
ADR-006, ADR-007, ADR-009 · `docs/plan/research/q6-auth-stack.md` · skills `nextjs`, `postgres`, `opzava-conventions`.
