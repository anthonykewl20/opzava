# ARD 0022 — Signed-out screen (essential-signout)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0016](0016-active-sessions.md) (logout is device-scoped; active-sessions), [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity), [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 182–198 (+ open-q #20).

## Context

`essential-signout.html` is the post-logout terminal card. Per wiring doc 25 (rows 182–198) it carries almost no live data: the logout mutation that produced it is already **wired** (`POST /api/auth/logout` → device-scoped `destroySession`, confirmed in ARD 0016), and "Sign back in" → `/login` is wired. Two items need resolution — a hardcoded "Back to opzava.com" link (🔴 F-MISFIT: a self-hosted fork has no public marketing site, and hardcoding a domain violates golden principle §1.2) and an implicit auth-state guard.

## Decision

1. **"Back to opzava.com" → app root `/`** (which bounces to `/login` when unauthenticated). A self-hosted control plane has no public site by default; never hardcode an external domain. If a marketing site is ever configured, it becomes an admin-config value, not source.
2. **Auth-state guard:** on mount, render the card optimistically (the only entry path is post-logout), but if `GET /api/auth/me` still resolves (a valid session) redirect into the app rather than asserting "signed out" — avoids a stale terminal assertion + a flash.
3. **Logout stays device-scoped** (single-token `destroySession`) — the footer "Signed out of this device only" is accurate (verified, ARD 0016); active-sessions management lives under Security (ARD 0016).
4. **"Sign back in" preserves a return-to/`next` param** to the pre-logout location when present (open-q #20 — a low-cost enhancement).
5. **Reassurance copy** ("Your AI team keeps working") stays copy-only — never data-bound to agent-runtime state on an unauthenticated page (the page must not query agent/runner state).

## Consequences

- **Positive:** the screen is honest and mostly already wired; no external-domain hardcode; no stale "signed out" assertion.
- **Negative:** none material (a tiny client auth-guard + a param round-trip).
- **Neutral:** the "where you left off" My-stuff rollup it references is F-VAGUE and handled in the My-stuff ARD, not here.

## References

- Parity: `wiring/25-personal-account.md` rows 182–198; open-q #20 (return-to).
- Code: `src/app/api/auth/logout/route.ts` (device-scoped, ARD 0016); `GET /api/auth/me`; `/login`.
- Relates: ARD 0016 (logout/sessions), ARD 0013 (parity).
