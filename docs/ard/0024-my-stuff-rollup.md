# ARD 0024 — My-stuff (cross-project Needs-you + Schedule)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity; 90 §A2/§C4), [ARD 0007](0007-engine-separation-and-surface-unification.md) (engines/composition reader), [ARD 0020](0020-user-profile-overlay.md) (timezone), [ARD 0023](0023-find-command-palette.md) (Find — sibling doc-25 surface), [CONTEXT.md](../../CONTEXT.md) `NeedsYouRollup`/`ProjectHealth`, [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 28–74 (+ open-q #19).

## Context

`essential-my-stuff.html` is the calm cross-project personal rollup: a **Needs-your-input** section (heterogeneous approval/review/pick/confirm rows + a cleared-today band), a **Following** section (read-only watched work), and a **Your-schedule** strip. Grounding:

- **Needs-you substrates EXIST:** `opzava_approvals` (`approval-repository.ts:17` + `/api/ops/approvals/[id]/decide`) + `tasks` + `opzava_campaigns`. `readNeedsYouRollup`/`projectNeedsYou` are **not built** (CONTEXT.md defines them as planned vocabulary) — the composition reader is the net-new core, and it's buildable now.
- **Following has NO substrate** (no subscription model exists).
- **Schedule** projection sources exist (`tasks.due_date`, `opzava_campaigns` schedule, cron next-runs); only the explicit-meeting `opzava_calendar_event` is net-new.

Grilled → ship Needs-you + Schedule-projection; defer Following.

## Decision

1. **Scope:** build Needs-you (the core) + Schedule as a projection; defer Following (no substrate).
2. **Needs-you = `readNeedsYouRollup`**, a composition-layer reader (90 §A2) merging: open `opzava_approvals` (status=requested, addressed to me) + `tasks` awaiting_owner/review assigned to me + quality-review-pending (the "Needs review" sub-case) + at-risk goals (once `opzava_goal` exists). `count = rows.length`. Thin `GET /api/rollup/needs-you`. RATIFY CONTEXT.md: `needs_you` and `blocked` are **disjoint** (needs_you = waiting on your action; blocked = an external impediment you can't directly fix); v1 workspace-singleton (100 T1).
3. **Cleared-today band = derived, never a stored ledger and never a view:** cleared = count(approval decisions + task transitions timestamped today), total = cleared + remaining, at-risk = count(due today). NEVER persist a view as a decision ("Reviewed" must gate on a real decide response, not an optimistic DOM clear).
4. **Row actions reuse the live paths:** Review/approve → `POST /api/ops/approvals/[id]/decide` (existing state machine, 409 on illegal); each row routes by kind (approval-decide / artifact-view / task-review). Optimistic per §6 (apply <16ms, async, inline `role=alert` on failure — never silent revert). AI-authored rows labelled ✦ (provenance), human-approved before any send (D5).
5. **Heterogeneous row contract:** a normalized union (`approval | task-review | headline-pick | readiness-confirm`); choose-1-of-N (headline pick) maps to an artifact/approval selection-decision (`opzava_approvals` is binary today — model the pick as a selection extension or task/artifact update, not a new decision type now).
6. **Schedule = `readScheduleProjection`** (90 §C4): PROJECT entries from `tasks.due_date` + `opzava_campaigns` schedule (`send_at`) + cron next-runs (scheduler) into calendar rows (kind: `task_due | content_publish | ai_run`). Thin `GET /api/schedule?range`, tz-aware (uses `opzava_user_profile.timezone`, ARD 0020). DEFER the explicit-meeting `opzava_calendar_event` table — the projection covers the mockup's rows (newsletter send, weekly report cron, data-room deadline). "AI run window" maps to a **real cron next-run**, never a predicted slot (F-VAGUE if taken literally).
7. **Following = DEFERRED** (no substrate). Render an honest empty/coming state; do NOT fabricate followed rows. The future path is a generalized `opzava_subscription` (follow any entity) + a following-reader — its own slice.
8. **Engine boundary:** `readNeedsYouRollup` + `readScheduleProjection` are composition-layer readers merging Engine-B (`opzava_approvals`, `opzava_campaigns`) + Engine-A (`tasks`, cron/scheduler) **by value** — pure readers importing neither engine's internals (no cross-import; §1.1). Live data behind individual rows is real.
9. **Realtime:** `rollup.updated` (recompute on `approval.requested`/`decided`, `task.updated`, `quality_review.*`, `goal.updated`) → add/remove rows + decrement the band; schedule on `calendar.event_changed`/`task.updated`/`run.scheduled`. SSE via `/api/events`; degraded fallback `useSmartPoll` (pauseWhenSseConnected).
10. **Loading/empty/error (Completion Standard):** skeleton on load, inline `role=alert` + retry on fetch error, all-caught-up empty state from the **real** empty read-model (count=0), aria-live band announcing real decremented counts (not mock DOM math).

## Consequences

- **Positive:** the core "what needs me" ships now (substrates exist) as a deterministic composition reader; Schedule is real via projection (no new entity); honest deferral of Following + explicit-meetings; row actions reuse the live approval/decide path.
- **Negative:** Following is absent until a subscription model lands; "cleared today" + needs-you membership are derivations that must be defined precisely (done here) to avoid conflating view with action; the heterogeneous row union needs a normalized contract; choose-1-of-N has no native decision type (modelled as a selection extension).
- **Neutral:** `readScheduleProjection` mixes derived rows from three sources via a merge contract; tz from `opzava_user_profile` (ARD 0020); at-risk goals join once `opzava_goal` exists.

## Alternatives considered

- **Build a generalized subscription model now (full Following).** Deferred (grilling): no substrate exists; a per-entity follow model is its own slice — Needs-you + Schedule carry the surface's value.
- **Persist a needs-you/cleared ledger.** Rejected: prefer derivation from approval decisions + task transitions (timestamps) over a stored count that drifts; never persist a view as a decision.
- **Build `opzava_calendar_event` now (explicit meetings).** Deferred: the projection over tasks/campaigns/cron covers the mockup's rows; the explicit-event table waits until human meetings are entered.
- **"Where you left off" / Following as a behaviour-ranked feed.** Rejected / F-VAGUE: undefined semantics (open-q #19); deterministic rollup only, no affinity ranking.

## References

- Parity: `wiring/25-personal-account.md` rows 28–74; open-q #19 ("where you left off"); 90 §A2 (needs-you), §C4 (schedule).
- Code: `src/opzava/core/approvals/approval-repository.ts` (`opzava_approvals`) + `/api/ops/approvals/[id]/decide`; `tasks` (status); `opzava_campaigns` (schedule); `/api/scheduler` (cron); `opzava_user_profile.timezone` (ARD 0020).
- Domain: CONTEXT.md `NeedsYouRollup`, `ProjectHealth` (needs_you/blocked disjoint, 100 T1), `AssistiveAI` (✦ provenance).
- Relates: ARD 0007 (engines/composition reader), ARD 0013 (parity), ARD 0020 (timezone), ARD 0023 (Find sibling).

## Deep-module design (codebase-design — design-it-twice winner)

Deeper grilling (choose-1-of-N = artifact-with-variants + select) + 3-way design-it-twice → this build-ready shape (D2-structural welding + D3 render-ready row/reconcile + the converged core).

**Files:** `src/opzava/platform/needs-you/` — `needs-you-row.ts` (discriminated `NeedsYouRow` union + per-kind action contracts + `parseNeedsYouRow` zod + `assertNever`), `project-needs-you.ts` (PURE: `classify` + `deriveClearedToday` + `projectNeedsYou`), `needs-you-reader.ts` (`readNeedsYouRollup` — composition). + route `api/rollup/needs-you/route.ts`. + `MODULE.md`.

**Placement (RATIFIED by precedent):** `platform/needs-you/` is the `unified-cost-reader.ts` slot — `engine-boundary.test.mjs` scans only `modules/team` + `src/lib`, so `platform/` may read both engines BY VALUE (Engine-B `opzava_approvals`/`opzava_content_artifacts` + Engine-A `tasks`/`quality_reviews`), importing neither engine's internals. Reader = thin composition shell; the pure projector is the deep core.

**Row-union is type-safe per kind (the key deepening):** a render-uniform head (`title · projectChip · ✦author · dueBadge`) + a tail discriminated by `kind`, where each `*Row` member declares ONLY its own action type — so `{kind:'approval', action:{op:'select'}}` is **unconstructible**. `SelectAction.variantIds: readonly [string, string, ...string[]]` makes a pick with <2 variants a `tsc` error; `assertNever(x: never)` in every `switch` default makes a new kind break compilation at every call site (the LinkedTool ceiling); `parseNeedsYouRow` (zod discriminated-union + `superRefine`) welds payload↔action at the SQL→type boundary (`action.approvalId === approvalId`, variant ids match) so bad SQL-derived rows are rejected at runtime too.

**Render-ready row + reconcile descriptor (caller-optimized):** each `NeedsYouRow` is precomputed — `projectChip{name, dotColor-token}`, `author{name, isAi}` (→ ✦), `dueBadge{label, urgent}` tz-aware (ARD 0020), `actionLabel`, `actionKind` — so the panel switches on `actionKind` once and renders, zero client derivation. Each row carries `reconcile{endpoint, method, entityKind, entityId}` (the live mutation path + the entity the optimistic-clear decrement reconciles on, so my-own-decide echo and an out-of-band decide both converge without double-count). Route body: `return NextResponse.json(readNeedsYouRollup(db, userId))`.

**Disjoint classification BY CONSTRUCTION:** each per-source reader queries the "mine to action" predicate, so only `needs_you` rows enter the union; `blocked` (external impediment) and `exclude` (awaiting others) never enter — the read predicate IS the partition (no tri-state field to drift); `blockedCount` is a disjoint tally.

**Cleared-today = pure derivation, never persisted:** `cleared = count(approval.decided_at today + task transitions today)`, `total = cleared + rows.length`, `atRisk = count(due today)` — from an injected clock/window (clockless projector, testable); the optimistic band decrement is display-only and reconciles against the real `rollup.updated` re-read; "Reviewed" gates on a real decide response. `count = rows.length`, never a stored column.

**Honest correctness yields:** `task-review → open` navigates (does NOT auto-clear — clearing a review must be a real task transition; the band reconciles on the `task.updated` echo); `opzava_content_artifacts`/`opzava_goal` are graceful-absent additive readers (zero rows until they land — the cost-reader degradation pattern); headline-pick = artifact-with-variants select (`opzava_approvals` stays binary).

**Test seam:** `classify`/`deriveClearedToday`/`projectNeedsYou`/`parseNeedsYouRow` tested DIRECTLY with literal rows (the bulk — every render-ready claim asserted as data; `@ts-expect-error` that approval-with-select / pick-without-variants / unhandled-kind fail to compile); the composition reader via in-memory SQLite seeding both engines + the graceful-absence path. **Deletion test:** removing `platform/needs-you/` redistributes four-source irregularity + classification + tz day-math + provenance + the reconcile contract back into the panel — high depth, narrow interface, earns its place.
