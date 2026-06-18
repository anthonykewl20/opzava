# 0115: Maintenance Panel

## Problem
Opzava's control plane lacked a UI for routine data hygiene. Operators had no way to trigger cleanup of stale operational data (old events, dead letters, succeeded jobs) without direct database access or CLI scripts, creating operational friction and potential data bloat.

## Approach
Implemented a dedicated admin panel (`src/components/panels/maintenance-panel.tsx`) that provides a simple interface for data retention management. The panel contains a numeric input for retention days and a "Run Cleanup" button. To prevent accidental data loss, a confirmation dialog is required before the destructive POST request is sent to `/api/ops/maintenance/prune`. The panel handles loading and error states, and renders the returned report showing counts of removed items and the cutoff timestamp.

The panel was integrated into the existing UI architecture:
- A `MaintenanceIcon` nav item was added to the `ADMIN` group in `nav-rail.tsx`.
- A `case 'maintenance'` was added to the `ContentRouter` to render the `MaintenancePanel`.

## Contract
- **UI Component**: `MaintenancePanel` with `ReportRow` subcomponent.
- **API Endpoint**: `POST /api/ops/maintenance/prune` (admin-gated, rate-limited).
- **Request Payload**: `{ retentionDays: number }`.
- **Response Payload**: `{ removed: { events: number, deadLetters: number, succeededJobs: number }, cutoff: string, timestamp: string }`.
- **Policy**: The server-side `pruneRunnerData` function exclusively determines what is safe to delete. The client cannot influence deletion criteria.

## Validation
- TypeScript type-checking passes cleanly.
- ESLint reports zero errors.
- Production build compiles successfully.
- A check-plan assertion verifies the panel exists and is correctly wired into both the nav rail (id `'maintenance'`) and the `ContentRouter` (case `'maintenance'`).
- The destructive action is guarded by a user confirmation dialog.

## Security & Audit
No secret values, private credentials, tokens are handled by the panel — it sends only a retention-days number to an admin-gated, rate-limited route and renders only counts and timestamps. The browser cannot choose what is safe to delete; the conservative server policy keeps in-flight work, failures, and dead letters until they age out.

## Next Case Study Thread
Artifact-detail operator views: drill into a single SEO brief, draft, fact-check, or provenance record to close the remaining Layer-9 exit criteria.
