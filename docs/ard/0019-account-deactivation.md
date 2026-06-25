# ARD 0019 — Delete Account → reversible Account Deactivation (Engine-A)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity; `essential-profile.html` Security), [ARD 0015](0015-team-execution-and-surfaces-architecture.md) (single-operator — bricking risk), [ARD 0016](0016-active-sessions.md) (session revocation reuse + Engine-A convention), [CONTEXT.md](../../CONTEXT.md) Identity & sessions, [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 176–178.

## Context

`essential-profile.html`'s danger zone shows "Delete account — permanently removes your profile, preferences and personal history. Projects you share stay with your team. This can't be undone." Parity row 176 marks it 🔴 F-MISFIT. Grounding confirms three reasons a self-service **hard delete** is wrong:

1. **The system already forbids self-deletion.** The admin-only `DELETE /api/auth/users` explicitly refuses **"Cannot delete your own account"** (`auth/users/route.ts:164`); `deleteUser(id)` (auth.ts:369) exists to remove *other* users.
2. **Single-operator bricking** (ARD 0015): the sole admin self-deleting locks out / bricks the instance.
3. **Dangling authorship:** only `user_sessions` (CASCADE) + `approvals.approved_user_id` (SET NULL) FK `users(id)` (migrations.ts:107, :425); tasks/comments/messages reference the user *by value*, so a hard delete orphans authored content rather than cascading.

`users` has no `disabled_at`. Grilled → re-scope to a reversible, single-operator-safe self-service deactivation.

## Decision

Re-scope "Delete account" to a reversible **`AccountDeactivation`** (soft-disable), Engine-A, security-reviewed. Eight provisions:

1. **Mechanism:** net-new `users.disabled_at INTEGER NULL`. Self-service `DELETE /api/me` sets `disabled_at = now`, revokes ALL the caller's sessions (reuse `destroyAllUserSessions`, ARD 0016), clears the session cookie, and — when `opzava_user_profile` lands — nulls personal profile/preferences. Authored work is **retained**; attribution preserved. NOT a row delete.
2. **Re-auth gate:** requires the current password (`verifyPassword`) AND a server-verified typed confirmation matching the user's email (or username when no email). Stricter than the mockup's email-only field, because it changes account state; the client typed-match is a UX guard, the **server re-verifies** (never trusts the client gate, per parity row 177).
3. **Last-admin guard:** `DELETE /api/me` REFUSES if the caller is the only active admin — `COUNT(*) FROM users WHERE role='admin' AND disabled_at IS NULL AND id != ?` = 0 → "you are the last admin; promote another admin first." Prevents bricking the single-operator instance.
4. **Login rejection:** `authenticateUser` rejects users with `disabled_at IS NOT NULL` ("account deactivated — contact your admin"); `validateSession` rejects them too (defense-in-depth, so any stray session dies even if revocation was missed).
5. **Admin-reversible:** an admin clears `disabled_at` via the existing admin user-management surface (`updateUser` gains a reactivate field; `PATCH /api/auth/users` exposes it). Reactivation restores login; the user re-establishes sessions by logging in.
6. **Existing admin hard-delete unchanged:** `DELETE /api/auth/users` (admin, *other* users, refuses self) stays the genuine removal path; this ARD does not touch it.
7. **Honest copy:** the danger-zone copy changes from "permanently removes… can't be undone" to "deactivates your account; an admin can restore it." The frontend binds the typed-confirm to the real email from `GET /api/auth/me`, never a hardcoded value.
8. **Module shape (Engine-A convention, ARD 0016):** `auth.ts` gains `deactivateUser(userId)`, `reactivateUser(userId)`, `countOtherActiveAdmins(excludeUserId)`; `authenticateUser`/`validateSession` gain the `disabled_at` check; a thin `DELETE /api/me` route owns re-auth + last-admin guard + audit + cookie-clear.

## Consequences

- **Positive:** honest, reversible, single-operator-safe; reuses `destroyAllUserSessions` (ARD 0016) + `verifyPassword`; authored content stays intact (no orphaning); the existing admin-delete + self-delete-refusal stance is preserved and extended, not contradicted.
- **Negative:** net-new `users.disabled_at` + a login-path check (every login/validate now reads it — negligible, indexed by id already); `/security-review` for the self-service account-state change + the last-admin guard; the mockup copy + flow must change (no hard delete).
- **Neutral:** "null personal profile" is a deferred hook until `opzava_user_profile` exists — deactivation today = `disabled_at` + session revoke + login bar. CONTEXT.md gains `AccountDeactivation` + a Forbidden-Ambiguity entry.

## Alternatives considered

- **Self-service HARD delete (as drawn).** Rejected: contradicts the existing self-delete guard, bricks single-operator, orphans by-value authored content, irreversible.
- **Admin-only (drop the self-service danger-zone).** Viable and simpler (matches the existing code stance + "Full-view = admin-only"), but discards the mockup's self-service intent; re-scoped deactivation keeps that intent while making it safe and forward-compatible with a multi-user team.
- **Defer with a placeholder.** Rejected for now: the operator chose to wire it, and deactivation is honestly buildable today.
- **Email-only confirmation (mockup).** Hardened to password + server-verified typed-email for an account-state change.

## References

- Parity: `wiring/25-personal-account.md` rows 176–178 (F-MISFIT; `/security-review`); open-question #2.
- Code: `src/app/api/auth/users/route.ts:144–180` (admin delete; self-delete refusal :164); `src/lib/auth.ts` `deleteUser`:369, `updateUser`:347, `authenticateUser`, `validateSession`; users DDL (no `disabled_at`); FKs `migrations.ts:107` (user_sessions CASCADE), `:425` (approvals SET NULL).
- Domain: CONTEXT.md Identity & sessions (`AccountDeactivation`).
- Gate: `/security-review` (self-service account-state change + last-admin guard).
- Relates: ARD 0015 (single-operator bricking), ARD 0016 (session revocation reuse).
