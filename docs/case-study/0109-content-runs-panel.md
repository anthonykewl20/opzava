# 0109: Content Runs Panel

## Problem

Operators needed a quick, read-only view into recent workflow activity — run identifiers, event volume by kind, and recency — without leaving the control plane. The UI must surface aggregated state without becoming the workflow brain.

## Approach

A single React panel (`src/components/panels/content-runs-panel.tsx`) calls `GET /api/ops/runs` and renders one row per run. To stay under the complexity budget the component was split into two subcomponents: `CountChip` (colored badge per event kind) and `RunRow` (id, chips, last-activity timestamp). Four states are handled explicitly: loading skeleton, empty message, error banner, and populated table with a manual refresh button. A nav item `content-runs` with a `ContentRunsIcon` was added to the OBSERVE group in `nav-rail.tsx`, and a matching `case 'content-runs' -> ContentRunsPanel` was wired into `ContentRouter`. Run orchestration remains entirely server-side; the panel only reflects aggregated activity.

## Contract

| Aspect | Detail |
|---|---|
| Endpoint | `GET /api/ops/runs` — admin-gated, read-only |
| Response shape | `Array<{ runId: string; counts: Record<EventKind, number>; lastActivity: ISO-8601 }>` |
| Event kinds surfaced | `external_call`, `cost`, `audit` |
| UI actions | Refresh (re-fetch). No run-control actions. |

## Validation

- `tsc --noEmit` — clean.
- `eslint src/components/panels/content-runs-panel.tsx` — 0 errors.
- `vite build` — production build compiles.
- Check-plan assertion verifies the panel exists and is wired into both the nav rail (`id: 'content-runs'`) and the `ContentRouter` (`case 'content-runs' -> ContentRunsPanel`).

## Security & Audit

No secret values, private credentials, tokens are shown by the panel — only run ids, event counts, and timestamps from an admin-gated read route that aggregates columns and never reads event payloads. The UI offers no run-control action.

## Next Case Study Thread

1. **Approval decide endpoint + UI** — a guarded `POST /api/ops/runs/:id/approve` and `reject` flowing through a server-side approval state machine, with a corresponding decision panel.
2. **Legacy complexity cleanup** — decompose the oversized `settings` and `setup` files into focused modules.
3. **Daemon entrypoint** — a long-lived process wrapper for background scheduling and health pings.
