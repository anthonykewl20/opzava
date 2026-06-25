# ARD 0023 — Find (⌘K command palette)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity), [ARD 0007](0007-engine-separation-and-surface-unification.md) (engines), [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 76–125 (+ open-q #14, #15), [CONTEXT.md](../../CONTEXT.md).

## Context

`essential-find.html` is a modal command palette (⌘K) over a faded Home backdrop: a debounced search input, a zero-state **Recent**, grouped results (Projects, To-dos, People, Files & docs, Actions, Suggested), and an "Ask Opzava instead" escalation. Grounding: `GET /api/search` **exists but is LIKE-based fan-out** (`route.ts:46,68,90` — tasks/agents/activities/audit_log/messages/webhooks, workspace-scoped) — **not** an FTS virtual table (the doc's "FTS" framing is stale). Projects are not searched today. The To-dos/Files/Goals groups need entities that don't exist (`opzava_todo_list`/`opzava_document`/`opzava_goal`). "Recent" (recently-opened) has no store. Grilled → server search over what exists + derive Recent.

## Decision

1. **Scope:** wire the palette to the existing `/api/search` + cover the kinds that exist now; defer the kinds whose entities don't.
2. **Palette = net-new frontend** (command-palette panel): a debounced (~200ms) query to `GET /api/search?q=`, grouped results, roving keyboard selection (ARIA listbox), focus-trap — client-only a11y. Replaces the mockup's static client-row DOM-filter with a real server query.
3. **Search backend = LIKE fan-out (corrected from "FTS"):** ADD a `projects` LIKE-block to `/api/search` (projects table exists, workspace-scoped) so Projects bind. Covering more kinds = adding a LIKE block per kind, NOT extending an FTS index. (An FTS virtual table is a later optimization if scale demands — not needed now.)
4. **People** = reuse `GET /api/mentions` (already autocompletes users + agent roles); AI rows marked ✦ (glyph, not colour). **Actions** = a static client command-registry (create-flows), filtered by label — app config, not data.
5. **Recent = derive from `activities`** (composition reader: actor=me, recent, distinct entities) — the honest interim; **no net-new `opzava_recent_views`** (activities exist; recent-acted ≈ recent is imperfect but honest, and avoids open-instrumentation across every surface). Revisit a dedicated recent-views table only if accuracy demands.
6. **Deferred (honest empty/omitted groups, never fabricated):** To-dos (`opzava_todo_list` over tasks, 90 §B1), Files & docs (`opzava_document`, 90 §C3), Goals (`opzava_goal`, 90 §C1) — separate net-new surfaces; the palette shows a group only once its kind is searchable. "Ask Opzava instead" → surface 19 (F-AI-LIMIT, single-model, confirm-before-act); link only here.
7. **Engine boundary:** `/api/search` is Engine A (inherited, `src/lib`); projects/people bind Engine A. When the deferred Engine-B kinds (todos/docs/goals) land, the palette aggregates via a composition reader (merge `/api/search` + per-kind reads), NEVER a cross-engine import. "Suggested" = the deterministic `readSuggestedRollup` (per 100 T8: recent-acted + open-needs-you + pinned; no affinity ranking).
8. **Async states (Completion Standard):** in-flight skeleton on debounce, inline `role=alert` + retry on error (`apiFetch`, 401→redirect), live empty-state from the real zero-result response (not client-row filtering).

## Consequences

- **Positive:** ships on the existing search route + existing `/api/mentions`; Projects/People/Recent real now; honest deferral of unbuilt kinds; no net-new table (Recent derived).
- **Negative:** LIKE fan-out is O(tables) per query (fine at current scale; FTS is a later optimization); derived-Recent is imperfect (recent-acted ≠ recently-viewed) — acceptable interim; deferred groups don't appear until their entities ship.
- **Neutral:** Projects-in-search is a one-block addition to `/api/search`; the command-registry is static app config.

## Alternatives considered

- **net-new `opzava_recent_views`** (accurate Recent). Deferred: requires open-instrumentation across every surface for marginal accuracy; derive-from-activities is the honest interim.
- **Build all result-group entities now** (todos/docs/goals). Rejected this slice: three separate net-new surfaces.
- **Client-filter a pre-fetched set** (vs server query). Rejected: doesn't scale + can't cover server-side kinds; debounced server query is correct (the route exists).
- **Treat `/api/search` as FTS.** Corrected: it's LIKE fan-out; "extend FTS" is the wrong mental model — add LIKE blocks.

## References

- Parity: `wiring/25-personal-account.md` rows 76–125; open-q #14 (Recent source), #15 (search architecture).
- Code: `src/app/api/search/route.ts` (LIKE fan-out: tasks/agents/activities/audit_log/messages/webhooks); `GET /api/mentions` (users+agents); `projects` table; `activities` (actor) for Recent.
- Domain: CONTEXT.md (Board/Card/TodoList = views over tasks; Document; Goal; AssistiveAI). Deferred kinds: 90 §B1/§C1/§C3.
- Relates: ARD 0007 (engines), ARD 0013 (parity).
