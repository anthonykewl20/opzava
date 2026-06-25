# ARD 0016 — Active Sessions (UserSession web-login management)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0012](0012-device-authorization.md) (`DeviceAuthorization` — the *other* "session", explicitly NOT this), [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (UX-redesign parity; `essential-profile.html` Security section), [ARD 0006](0006-postgres-compatibility.md) (DB seam), [ARD 0007](0007-engine-separation-and-surface-unification.md) (Engine A vs B), [CONTEXT.md](../../CONTEXT.md) Identity & sessions terms, [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) (parity rows 169–174, 193).

## Context

`essential-profile.html`'s Security section shows an **Active sessions** list — the operator's web logins by device ("Mac · Chrome · This device", "iPhone · Safari", …), each with **Sign out**, plus **Sign out everywhere**. The parity inventory (doc 25) marks all six rows 🟡 PARTIAL / F-NOW and names net-new routes, but there is no dedicated PRD or ARD for it. A `/grilling` → `/domain-modeling` → `/codebase-design` (design-it-twice) pass resolved it to shared understanding before any wiring.

Three facts reframed the work — the parity doc was **stale**, and per repo policy code wins:

1. `user_sessions` **already has** `ip_address`, `user_agent`, `created_at` (migrations.ts:105–106) and **every** login path already populates them (`login`/`google`/`setup`/password-change). Device labels need **no migration and no login change** — the doc's "no device/UA columns" gap (rows 169/170/193) is wrong.
2. `validateSession` already returns `sessionId` (auth.ts:222) → "This device" is derivable today.
3. Logout is **already** device-scoped (`logout/route.ts` → `destroySession(token)`); the signout-page "this device only" copy is accurate. Doc open-question #1 is answered.

A naming trap also had to be closed: **`session` is overloaded** across a `UserSession` (web-login — this ARD), an `OpenClawAgent` session (execution observation), and a `DeviceAuthorization` grant (ARD 0012 — the adjacent "Connected tools" card on the *same* mockup). CONTEXT.md "Identity & sessions" now pins these and forbids the conflation.

## Decision

Wire Active sessions as a single **Engine-A** TDD slice — the read+manage half of the `UserSession` lifecycle. Ten provisions:

1. **Scope = F-NOW core only.** Ship: list `UserSession`s, `SessionLabel` (device·browser), the `CurrentSession` ("This device") marker, "Signed in {`created_at` relative}", per-session `Revoke`, and revoke-others. **Defer** geo-IP **location** (F-INTEGRATION — external connector + IP-privacy decision) and **`last_seen_at`/"active N ago"** (a write on the auth hot-path — write-amplification on SQLite's single writer). Rows render "Signed in …", never a fabricated "active 2 hours ago".
2. **"Sign out everywhere" = revoke all EXCEPT current.** Keep the calling device logged in (GitHub/Google norm); `destroyAllUserSessions` gains an optional `exceptSessionId`. Not "kill everything + force re-login".
3. **`SessionLabel` via `ua-parser-js`** — one new dependency, isolated in a pure `src/lib/session-label.ts`. Display-only and coarse: a UA yields "Mac", never the mockup's invented "MacBook Pro"; null/garbage → "Unknown device".
4. **Engine-A boundary.** All logic in `src/lib`; touches only `user_sessions`; **never** an `opzava_*` table; no Engine-B import. Identity/auth is inherited Engine A (CONTEXT.md; ARD 0007).
5. **Module shape (design-it-twice winner — "D4 spine").** New `src/lib/sessions.ts` of **bare functions** calling `getDatabase()` internally (the established auth convention — no DI, no repository factory): `UserSessionView`, `listUserSessions(userId, currentSessionId)`, `revokeUserSession(userId, sessionId): boolean`, `revokeOtherUserSessions(userId, exceptSessionId): number`, and the keystone `getSessionContextFromRequest(request) → {user, currentSessionId|null}`. Plus the pure `session-label.ts`. Only inherited churn: widen `destroyAllUserSessions(userId, exceptSessionId?): number` (source-compatible — existing callers ignore the return).
6. **The keystone resolves the `sessionId` wart once.** `getUserFromRequest` returns a `User` whose `sessionId` is present-but-untyped on the cookie path and absent for API-key/proxy auth. `getSessionContextFromRequest` reuses `validateSession(token)?.sessionId` to expose `currentSessionId: number | null` in **one** place — so "CurrentSession is cookie-only" is structural, not folklore, and **no `hashSessionToken` export is needed**.
7. **Four invariants enforced structurally, not by vigilance.** *No-token-leak*: `UserSessionView` has no token field (a secret with no field cannot be serialized). *IDOR*: every revoke is `WHERE id=? AND user_id=?` — a wrong-owner id matches zero rows. *Idempotency*: revokes return `boolean`/`count`; a no-op is success (200/204), never 404. *CurrentSession cookie-only*: the keystone is the sole writer of `currentSessionId`.
8. **Self-revoke is a route policy, not a module rule.** `revokeUserSession` is a clean permissive primitive (it can delete any owned row). The `DELETE /api/me/sessions/[id]` route refuses `id === currentSessionId` with 400 → "use logout" (the mockup disables that button); revoking your own device is what `POST /api/auth/logout` is for.
9. **Relative time stays at the render layer.** The module returns `createdAt` as a raw epoch; "Signed in {relative}" is formatted client-side (no re-render drift, no humanize dependency in Engine A). Timezone-aware formatting waits on the separate `opzava_user_profile.timezone` slice; the relative form is tz-agnostic.
10. **Three thin route adapters** under `src/app/api/me/sessions/`: `GET` (list), `DELETE /[id]` (revoke one + self-revoke refusal + audit), `POST /revoke-all` (revoke others + audit). Routes own auth-guard, policy, audit log, and JSON shaping; the module owns mechanism. Built test-first (`/tdd`), with no-token-leak + IDOR + idempotency written as failing tests first.

## Consequences

- **Positive:** a complete, honest feature in one slice with **zero new external connectors** and a **migration-free** data path (UA/IP already captured); four security-sensitive invariants hold by construction at one site (deletion test: removing `sessions.ts` scatters IDOR + token-omission across three routes); convention-exact, so **no new test infrastructure** (the temp-DB seam reuses the existing auth-test pattern); `revokeOtherUserSessions` reuses (not duplicates) `destroyAllUserSessions`.
- **Negative:** one new dependency (`ua-parser-js`) — supply-chain surface for display-only labels (accepted over hand-rolled parsing per grilling Q3); the no-DI convention caps test isolation to a process-global `getDatabase()` (the existing suite's tax, paid at harness level, not per-test); device labels are heuristic/coarse and "location" is absent until a geo connector lands — the UI must not imply more than that.
- **Neutral:** deferred extensions slot in additively when needed — `last_seen_at`/`location` as optional `UserSessionView` fields, password-change-revoke-others reuses `revokeOtherUserSessions`, admin-views-another-user reuses the `userId`-keyed functions behind a route-level authz check (none built now — YAGNI). CONTEXT.md "Identity & sessions" terms + four Forbidden-Ambiguity entries are the durable vocabulary.

## Alternatives considered

- **`SessionScope {userId, currentTokenHash}` abstraction with named extension slots (design D2).** Rejected for v1: most future-proof, but the most interface surface, declared-but-unproduced fields, and it needs `hashSessionToken` exported. The grilling deferred every extension it optimizes for — building it now is YAGNI. Its *extension thinking* is preserved in the Consequences "Neutral" note.
- **All functions inline in `auth.ts` (design D4 literal).** Rejected narrowly: maximal locality with the session primitives, but swells an already-large file; session-administration is a distinct concern from the auth hot-path, so a cohesive `sessions.ts` (still bare, still convention-fit) wins on cohesion at negligible locality cost.
- **Injected-`db` repository (`createSessionStore(db)`, Engine-B style).** Rejected: would be the only DI module among a dozen bare auth functions — local inconsistency for testability the temp-DB seam already provides. "Accept dependencies, don't create them" yields here to convention + the local-substitutable DB category (no port needed; Postgres per ARD 0006 is handled below this module at the repo `db` layer).
- **Hand-rolled UA parser (no dependency).** Rejected by the operator (grilling Q3) in favour of `ua-parser-js`'s accuracy on messy UA strings.
- **"Sign out everywhere" kills the current session too.** Rejected (grilling Q2): logs the operator out of the tab they clicked from; keep-current is the industry norm.
- **Add `last_seen_at` now for "active N ago".** Rejected this slice: a write on every authenticated request (write-amplification/contention on SQLite's single writer). "Signed in {`created_at`}" is the honest, zero-cost form.

## References

- Mockup: `docs/architecture/ux-redesign/mockups/essential-profile.html` (Security section, Active sessions).
- Parity: `docs/architecture/ux-redesign/wiring/25-personal-account.md` rows 169–174 + 193; open-questions #1 (logout scope — answered), #7 (geo-IP / IP-privacy — deferred), #21 (sign-out-all scope — resolved: keep current).
- Code (verified this session): `src/lib/auth.ts` (`createSession`:160; `validateSession`:188 returns `sessionId`; `destroySession`:226; `destroyAllUserSessions`:232; `getUserFromRequest`:436); `src/lib/migrations.ts` (`user_sessions`:99–113 — `ip_address`/`user_agent` present); `src/app/api/auth/login/route.ts`:19–41 (UA/IP captured at login); `src/app/api/auth/logout/route.ts` (device-scoped).
- Domain: `CONTEXT.md` Identity & sessions (`UserSession`, `CurrentSession`, `Revoke`, `SessionLabel`, `DeviceAuthorization`) + the four Forbidden-Ambiguity entries.
- Method: `/grilling` (scope + Q1–Q3) → `/domain-modeling` (vocabulary) → `/codebase-design` design-it-twice (four parallel interface designs; D4-spine hybrid selected).
