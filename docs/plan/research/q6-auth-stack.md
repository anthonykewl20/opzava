# Q6 — Auth stack deep-research (2026), cited

Source: `/deep-research` workflow (104 agents, adversarially verified). Raw: `q6-auth-stack.deepresearch.json`.

## Verdict
**Better Auth** is the primary recommendation for a self-hosted, multi-tenant B2B SaaS on Next.js App Router + TS + Postgres.

- **Lucia** — EOL: v3 deprecated by March 2025; now a "build auth from scratch" learning resource; npm package flagged deprecated. ❌
- **Auth.js / NextAuth v5** — security-only maintenance (now under the Better Auth team); passkeys **experimental** on a perpetually-beta v5; maintainers steer new projects to Better Auth. Viable **fallback** only.
- **Better Auth** — the only lib with first-party **multi-tenant Organizations/teams + RBAC** (owner/admin/member, 48h invite flows), **DB-backed revocable sessions** (`revokeSession`/`revokeOtherSessions`/`revokeSessions` = true "log out all devices"; optional stateless mode too), **TOTP + single-use recovery codes**, **SimpleWebAuthn passkeys**, built-in **anti-user-enumeration** on sign-up.

## Recommended config
Better Auth + **database-backed (revocable) sessions**; **TOTP + recovery codes** baseline MFA + **passkeys** as step-up/passwordless; pin to current patched releases; enable `revokeSessionsOnPasswordReset`; avoid the `session.cookieCache` premature-cache 2FA-bypass class.

## Caveat (security maturity — real)
Better Auth carries **31 advisories, 21 in 2026**, incl. a **critical** premature-cookie-cache **2FA bypass** and a **high-severity org-invitation** flaw — i.e., bugs in **exactly the org + invitation features this stack uses**. → version-pin, track the advisory feed, add our own hardening/tests around invites. **Fallback:** Auth.js v5 + Postgres adapter (gains revocable DB sessions; loses built-in orgs/RBAC; passkeys experimental).

## Hard PWA/web-platform constraint
A **service worker cannot read httpOnly cookies.** So auth-state visibility, offline UX, and **Web-Push-subscription ↔ session binding** must be designed around **server endpoints** (e.g. a `/api/auth/session` probe; server-side push-token↔session mapping). The popular **"two-cookie split"** mitigation is **NOT** supported by the cited spec discussion — do not rely on it.
