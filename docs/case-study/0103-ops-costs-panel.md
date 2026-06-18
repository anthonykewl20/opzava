# 0103: Ops Costs Panel

## Problem

Opzava operators lacked a consolidated view of operational costs. Cost data existed in the backend but was inaccessible from the UI, forcing admins to query the database directly or rely on external billing tools. The control plane needed a read-only panel to surface event counts, estimated totals, and actual totals with per-event breakdowns — without exposing sensitive credentials or enabling mutations.

## Approach

Built a single React panel (`src/components/panels/ops-costs-panel.tsx`) that calls `GET /api/ops/costs` and renders four states: empty, loading, error, and refresh. The component was split into `SummaryCard` and `CostRow` subcomponents, with `cents()` and `unitsLabel()` helpers to stay under the per-file complexity budget. Cents are formatted to dollars at the UI edge; the server keeps integer cents as the source of truth.

Wiring: a `costs` nav item with a `CostsIcon` was added to the OBSERVE group in `nav-rail.tsx`, and a `case 'costs' -> OpsCostsPanel` entry was added to the `ContentRouter` in `src/app/[[...panel]]/page.tsx`.

## Contract

| Field | Type | Notes |
|---|---|---|
| `eventCount` | `number` | Total cost events |
| `estimatedTotal` | `number` | Integer cents |
| `actualTotal` | `number` | Integer cents |
| `events[].provider` | `string` | Provider identifier |
| `events[].operation` | `string` | Operation name |
| `events[].units` | `number` | Integer unit count |
| `events[].cents` | `number` | Actual if known, else estimated |
| `events[].currency` | `string` | ISO 4217 code |
| `events[].timestamp` | `string` | ISO 8601 |

## Validation

TypeScript typecheck clean. ESLint zero errors. Production build compiles the panel without warnings. A check-plan assertion verifies the panel exists and is wired into both the nav rail (`id: 'costs'`) and the `ContentRouter` (`case 'costs' -> OpsCostsPanel`). The panel is strictly read-only — no form inputs, no mutation hooks, no write endpoints called.

## Security & Audit

No secret values, private credentials, tokens are shown by the panel — only provider id, operation, integer unit counts, cents, and currency from an admin-gated read route. The UI offers no mutation; cost reconciliation stays a server concern. All data flows through a single authenticated `GET` endpoint with admin-level authorization enforced server-side.

## Next Case Study Thread

The next slice follows the same fleet-read-route + Opus-panel pattern: an **Approval Queue** panel (pending approvals with approve/reject status) and a **Content Runs** list (execution history with provider, status, duration). After those two panels land, a dedicated cleanup pass should address the oversized settings and setup files that have accumulated legacy complexity.
