# 0100: Ops Failures Panel

## Problem

Opzava operators had no visibility into durable-runner jobs that exhausted their retry budgets. Dead-letter inspection required direct database queries or log spelunking, slowing incident response and obscuring failure patterns across workflows.

## Approach

A read-only React panel (`src/components/panels/ops-failures-panel.tsx`) calls `GET /api/ops/dead-letters` and renders each dead letter with: job id, final-error class pill (amber/red), error message, workflow run + step, replay source/reason, and timestamp. Subcomponents `ErrorPill` and `DeadLetterRow` keep individual function complexity under budget. The panel handles empty, loading, error, and refresh states using existing skeleton and toast conventions.

Wiring: a `failures` nav item with `FailuresIcon` in the `OBSERVE` group of `nav-rail.tsx`; a `case 'failures'` branch in the `ContentRouter` of `src/app/[[...panel]]/page.tsx` renders `OpsFailuresPanel`. Styling follows established tokens — `surface-1` backgrounds, `void-cyan` accents, `border/30` dividers.

## Contract

| Aspect | Detail |
|---|---|
| Endpoint | `GET /api/ops/dead-letters` (admin-gated, read-only) |
| Response | `DeadLetter[]` — `{ jobId, errorClass, message, runId, stepId, replaySource, replayReason, failedAt }` |
| Mutations | None. Panel is strictly read-only; no POST/PUT/PATCH calls. |

## Validation

- `tsc --noEmit` — clean, zero type errors.
- `eslint .` — 0 errors, 0 warnings on touched files.
- Production build (`next build`) compiles the panel without warnings.
- Check-plan assertion verifies: nav rail contains item with `id: 'failures'` in the `OBSERVE` group, and `ContentRouter` maps `case 'failures'` to `OpsFailuresPanel`.

## Security & Audit

No secret values, private credentials, tokens are shown by the panel — it renders only job/run identifiers, error classes/messages, and replay metadata from an admin-gated read route; dead-letter snapshots forbid secret payloads. The UI offers no replay or mutation action, so an operator cannot bypass the runner from the browser. All data flows through a single read endpoint behind existing admin-session middleware.

## Next Case Study Thread

Next slices: a **Costs panel** (operational cost events per workflow/run) and an **Approval Queue panel** (pending human-in-the-loop gates), both following the same fleet-read-route + Opus-panel pattern. Later: a guarded replay action wired through a dedicated server endpoint with audit logging and idempotency keys, extending the failures panel with a controlled mutation path.
