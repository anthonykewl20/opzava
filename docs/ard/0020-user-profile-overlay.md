# ARD 0020 — User Profile overlay (Profile / Notification-prefs / Appearance)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity; D2 Engine-B overlays keyed by value), [ARD 0007](0007-engine-separation-and-surface-unification.md) (engine separation), [ARD 0016](0016-active-sessions.md) (`timezone` consumer — relative dates), [CONTEXT.md](../../CONTEXT.md) `UserProfile`, [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 136–164 + [91-wiring-plan.md](../architecture/ux-redesign/wiring/91-wiring-plan.md) Phase-4 slice 13.

## Context

The non-security half of `essential-profile.html` (Profile fields, Notifications matrix, Appearance, Connected-tools doorway) maps to one Engine-B overlay `opzava_user_profile` + a doorway. Grounding produced the **third and largest stale-doc correction**: `users` already has **19 columns** including `display_name`, `email`, `avatar_url`, `provider`, `workspace_id` (migrations 014/021/029) — the wiring doc's "users has only username/role/password_hash" (rows 142/144) and its plan to store full_name/display_name/email/avatar **in the overlay** (line 204) are stale. Identity is already Engine-A-wired (`GET`/`PATCH /api/auth/me`). Consumers for several mockup controls don't exist (notification dispatcher, density, i18n, avatar file-store); only `timezone` has a live consumer (ARD 0016's deferred date formatting). Grilled → foundation + persist-now-consume-later, with dead-config controls cut.

## Decision

Build the `opzava_user_profile` Engine-B overlay; reuse Engine-A for identity; persist honestly. Ten provisions:

1. **Overlay = product-profile fields ONLY.** `opzava_user_profile` (`src/opzava/modules/account/`) keyed to `users.id` by value: `timezone` (column — IANA, consumed by ARD-0016 date formatting), `bio`, `job_title`, `notif_prefs` (json), `appearance` (json), `record_json` (extensible — full_name if distinct from display_name, pronouns), `updated_at`. It does **not** store `display_name`/`email`/`avatar_url` — those are inherited Engine-A `users` columns (stale-doc corrected).
2. **Repository (convention-exact).** `createUserProfileRepository(db)` with lazy `ensureSchema()` + `record_json`, following the canonical Engine-B pattern (`agent-role-repository.ts`). Engine-B-pure: it **never** imports `src/lib` and never references inherited tables (`engine-boundary.test.mjs`).
3. **Composition read-seam at the ROUTE, not the repository.** `GET /api/me/profile` composes Engine-A identity (`getUserFromRequest` → display_name/email/avatar_url) + the Engine-B overlay (`repo.get(userId)`) into one response. The route is the composition layer (allowed to touch both engines); the boundary forbids the *repository* crossing, not the route.
4. **Writes.** `PUT /api/me/profile` writes identity via `updateUser` (Engine A: display_name, email) **and** overlay fields via the repo (Engine B: job_title, timezone, bio, appearance.theme) — one Save for the Profile + Appearance cards. `PUT /api/me/notification-prefs` writes `notif_prefs` (Engine B). Idempotent by `user_id`.
5. **Notifications: persist now, dispatch later.** Store `notif_prefs` (`pref_type × {in_app,email}` + `quiet_hours` + `paused`) now; the DISPATCHER/fan-out is deferred (none exists — table + CRUD only). Honest: the UI must **not** claim email is sent (per 100 T8 telemetry-consent-only); prefs round-trip and take effect once the dispatcher lands (a future, larger ARD incl. Resend transactional email).
6. **Appearance.** `theme` persists server-side in the `appearance` json — but localStorage stays the **live** source (next-themes instant toggle); the server value is the cross-device **default** applied on a fresh load when no localStorage exists (resolves open-q #5: localStorage wins once set). `density` + `language` are **cut** from Essential (no consumer — density unimplemented, no i18n; rendering them is dead config / fabricated function). Revisit when their infra ships.
7. **Avatar.** `avatar_url` stays Engine-A; the profile shows initials or the stored URL. "Change photo" **upload** is deferred (no file-storage seam — D7.2 F-INTEGRATION, shared with Docs/Assets).
8. **Connected-tools doorway.** A thin link to `essential-tools` (surface 24). The "5 of 7" count needs `LinkedTool`/`ToolHealth` (F-INTEGRATION, no per-tool probe) — defer the substance; the doorway shows an honest state, not a fabricated count, until surface 24 lands.
9. **`timezone` is real now.** It unblocks ARD-0016's deferred "Signed in {tz-relative}" + the schedule/calendar date formatting. Store canonical IANA ids (not GMT-offset labels).
10. **Engine boundary verified.** `opzava_user_profile` is an `opzava_*` table in `src/opzava` (NOT `src/lib`); the repo imports neither Engine-A nor inherited tables; composition is route-level. Satisfies `engine-boundary.test.mjs` + `architecture.test.ts` by construction.

## Consequences

- **Positive:** a durable Engine-B foundation serving three views from one overlay; identity **not duplicated** (stale-doc corrected → no two-source-of-truth conflict on email/name/avatar); `timezone` unblocks ARD 0016; honest persist-now-consume-later boundaries (no fabricated controls/consumers); convention-exact repository (no new pattern invented).
- **Negative:** `notif_prefs` persisted-but-inert until a dispatcher exists (a future, larger slice incl. Resend transactional email); `theme` gains a localStorage-vs-server precedence rule to honor; the Profile Save spans both engines at the route (acceptable — composition is the route's job).
- **Neutral:** density / language / avatar-upload / connected-tools-substance explicitly deferred (tracked); CONTEXT.md gains `UserProfile` + a Forbidden-Ambiguity entry (overlay ≠ identity).

## Alternatives considered

- **Store identity (display_name/email/avatar) in the overlay** (wiring line 204). Rejected: stale-doc — those are inherited Engine-A `users` columns; duplicating them creates a two-source-of-truth conflict. The overlay holds product-profile fields only.
- **Build the notification dispatcher now.** Rejected this slice: the fan-out engine + Resend transactional path is a larger net-new effort the wiring doc itself defers; persist prefs now, consume later.
- **Persist density/language inert, or build i18n/density consumers now.** Rejected (grilling): a control with no consumer is dead config / fabricated function (Essential no-fabrication directive); cut until the infra exists.
- **Repository reads `users` directly (cross-engine).** Rejected: violates the engine boundary; composition happens at the route/reader layer, the repo stays Engine-B-pure.
- **One mega-route for all writes.** Rejected: keep `PUT /api/me/profile` (profile + appearance) and `PUT /api/me/notification-prefs` separate, per the card structure + wiring lines 215–216.

## References

- Stale-doc: true `users` columns (`migrations.ts:391–401` [014: email/avatar_url/provider], `:596` [021: workspace_id]) vs wiring 142/144/204; `GET /api/auth/me` shape (`auth/me/route.ts:19–31`).
- Convention: `src/opzava/modules/team/agent-role-repository.ts:22–152` (createXRepository + ensureSchema + record_json) + its `MODULE.md`; `engine-boundary.test.mjs:94–99` (sanctioned importers); `dependency-graph.md:103–111` (read-seam).
- Theme: next-themes via `src/components/ui/theme-selector.tsx`; `themes.ts` (11 themes). Density: unimplemented (no control, no consumer).
- Notifications: `schema.sql:63–74` (table) + `api/notifications/route.ts` (CRUD); no dispatcher, no prefs today.
- Parity: `wiring/25-personal-account.md` rows 136–164; `91-wiring-plan.md` Phase-4 slice 13; open-q #4 (language), #5 (theme precedence).
- Relates: ARD 0007 (engines), ARD 0013 (D2 overlays-by-value), ARD 0016 (timezone consumer).

## Deep-module design (codebase-design)

Deeper grilling resolved the crux (the two-engine write) to a **single atomic PUT**; the rest is determined by the conventions established across ARDs 0016/0018/0021/0024 (Engine-B repo + route-level composition), so this is a direct synthesis rather than a fresh design-it-twice.

**Files:** `src/opzava/modules/account/` (Engine-B-pure) — `user-profile.ts` (`UserProfileOverlay` type + `notifPrefsSchema` zod + `parseUserProfile`), `user-profile-repository.ts` (`createUserProfileRepository`). + routes `api/me/profile/route.ts` (GET compose / PUT atomic) + `api/me/notification-prefs/route.ts`. + `MODULE.md`.

**Repository (convention-exact, `agent-role-repository` shape):** `createUserProfileRepository(db)` → `{ ensureSchema, get(userId), save(userId, patch), getNotifPrefs(userId), saveNotifPrefs(userId, prefs) }`. Table `opzava_user_profile(user_id TEXT PK [by value], timezone TEXT, bio TEXT, job_title TEXT, notif_prefs TEXT json, appearance TEXT json, record_json TEXT, updated_at TEXT)` — `timezone` is a column (date-formatting consumer, ARD 0016); the rest json / record_json (full_name/pronouns in record_json). **Engine-B-pure: imports neither `src/lib` nor `users`.**

**Composition read-seam (GET, route-level):** `getUserFromRequest` (Engine-A identity: display_name/email/avatar) + `repo.get` (Engine-B overlay) → merged `ProfileView`. Route-level (not a `platform/` reader) because identity is request-scoped auth; the repo never reads `users`.

**Atomic two-engine write (PUT — the resolved crux):** `getDatabase()` is a singleton (db.ts:17,67), so `updateUser` (Engine A) and `repo.save` (Engine B) share one connection; the route wraps both in `db.transaction(() => { if (patch.identity) updateUser(user.id, patch.identity); repo.save(user.id, patch.overlay) })()` — the established `db.transaction` idiom (`runner/repository.ts`, `retention.ts`). Half-save is impossible; the repo stays Engine-B-pure (the transaction is route-owned — the route legitimately touches both engines, like the GET compose). Idempotent by user_id; re-reads + returns the merged view.

**`notif_prefs` zod (forward-compatible):** `{ prefs: Record<PrefType, {in_app, email}>, quiet_hours: {start,end}|null, paused: bool }.strict()`, `PrefType ∈ {mention, approval, ai_handoff, daily_summary, project_activity}` (wiring 151); a new pref-type extends the enum, missing keys default `{in_app:true, email:false}` at read. The dispatcher is deferred (ARD 0020 §5) → the UI must NOT claim email is sent (100 T8).

**Invariants:** the overlay **never** stores identity (no display_name/email/avatar columns; `.strict()` parse rejects them — CONTEXT.md Forbidden-Ambiguity) · repo Engine-B-pure (boundary green) · atomic two-engine write (transaction, shared connection) · `notif_prefs` zod-validated · `timezone` canonical IANA (not GMT-offset) · idempotent by user_id.

**Test seam:** `parseUserProfile`/`notifPrefsSchema` tested DIRECTLY (pure zod; `@ts-expect-error` an identity field on the overlay); repo via in-memory SQLite (the `agent-role-repository.test` idiom — get/save upsert, notif-prefs round-trip, the column-vs-json split); **the key test — atomicity: inject a `repo.save` throw and assert the `updateUser` rolls back**; GET asserts the identity⊕overlay merge. **Deletion test:** removing `modules/account` loses the overlay; Engine-A identity (`users`) is untouched.
