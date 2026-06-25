# ARD 0017 — Change Password (reuse the existing credential route)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity; `essential-profile.html` Security), [ARD 0016](0016-active-sessions.md) (session rotation vs revoke-others), [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 165–166, [CONTEXT.md](../../CONTEXT.md) Identity & sessions.

## Context

`essential-profile.html`'s Security card shows Change-password (current / new / confirm, "At least 12 characters", "Password last changed 3 months ago"). Parity doc row 165 marks it 🟡 PARTIAL and proposes a net-new `POST /api/me/password`. Code review shows the feature is **already fully wired** at `PATCH /api/auth/me` (`src/app/api/auth/me/route.ts`): verifies `current_password` (`verifyPassword`, 403 on mismatch), enforces `new_password` ≥ 12, rate-limits (`passwordChangeLimiter` 5/min, separate from login), blocks API-key users (id=0), performs **full session rotation** (`destroyAllUserSessions` then a fresh cookie), and audit-logs `password_change`. The doc is stale; code wins.

## Decision

1. **Reuse `PATCH /api/auth/me`.** Do **not** build the parity doc's `POST /api/me/password` — it would duplicate complete, tested, rate-limited credential logic (dead-code/duplication, rejected by the engineering constraints). The namespace split is intentional and recorded: `/api/auth/*` = credential/identity operations (login, logout, me, password); `/api/me/*` = the net-new profile/session surfaces (e.g. `/api/me/sessions`).
2. **Add `users.password_changed_at INTEGER`** (Engine-A migration). Set it in `updateUser` **only when `updates.password` is present** (single home, beside the hash write). Surface it in `GET /api/auth/me`. The "Password last changed {relative}" stamp formats client-side (like Active Sessions' "Signed in {relative}", ARD 0016 §9); NULL (pre-migration users) falls back to `created_at`.
3. **Keep full session rotation on password change.** Revoke ALL sessions incl. current, then mint a fresh current cookie — the secure norm (rotates a possibly-compromised current token). Explicitly do **not** switch this to the keep-current revoke (`revokeOtherUserSessions`, ARD 0016): that primitive is for the Active-sessions "Sign out everywhere", not for a credential change, where rotating the current token too is *more* secure.
4. **Frontend only** otherwise: bind the mockup card to `PATCH /api/auth/me`; render the stamp. "Confirm new password" is a client-side match check (no server field).

## Consequences

- **Positive:** ships as a one-column migration + a stamp + a frontend binding — near-zero backend; no duplicate route; the security posture (rotation, rate-limit, audit, API-key block) is already in place and proven.
- **Negative:** namespace inconsistency — password lives at `/api/auth/me` while sessions live at `/api/me/sessions`. Accepted as a credential-vs-profile split and documented here so it is not "fixed" into duplication later.
- **Neutral:** `password_changed_at` is the only schema add; existing callers of `updateUser` / `PATCH /api/auth/me` are unaffected.

## References

- Code: `src/app/api/auth/me/route.ts` (PATCH — full flow); `src/lib/auth.ts` `updateUser`:347; `src/lib/password.ts` `verifyPassword`; `src/lib/rate-limit.ts` `passwordChangeLimiter`; users DDL `src/lib/migrations.ts` (no `password_changed_at`).
- Parity: `wiring/25-personal-account.md` rows 165–166 (the superseded `POST /api/me/password` proposal).
- Relates: ARD 0016 (why rotation ≠ revoke-others here); CONTEXT.md Identity & sessions.
