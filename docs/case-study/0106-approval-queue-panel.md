# 0106: Approval Queue Panel

## Problem

Operators needed a single, read-only view of all pending and resolved approvals within the Opzava control plane. Without this, tracking requested actions—such as artifact promotions or external integrations—required direct database queries or API calls, creating friction and obscuring the operational state.

## Approach

A dedicated React panel, `ApprovalQueuePanel`, was built as a Layer 9 UI slice. It fetches data from `GET /api/ops/approvals` (defaulting to `?status=requested`) and renders a filterable list. To manage complexity, the panel was split into `StatusPill` and `ApprovalRow` subcomponents. The panel is integrated into the navigation rail under the OBSERVE group with a distinct ID (`approval-queue`) and routed via the `ContentRouter`.

## Contract

- **Endpoint:** `GET /api/ops/approvals`
- **Query Params:** `status` (requested, approved, rejected, all)
- **Response:** Array of persisted approval objects.
- **UI Fields:** Requested action, target (artifact/external-action + ID), requester, status, timestamp, decision reason.
- **Interaction:** Read-only. No approve/reject actions are exposed in the UI.

## Validation

- TypeScript type-check passes cleanly.
- ESLint reports zero errors.
- Production build compiles successfully.
- A check-plan assertion verifies the panel exists and is correctly wired into the nav rail (ID: `approval-queue`) and the `ContentRouter` (case: `approval-queue` -> `ApprovalQueuePanel`).

## Security & Audit

The panel displays only operational metadata: IDs, action names, target references, status, requester/approver identifiers, and decision reasons sourced from an admin-gated read route. **No secret values, private credentials, tokens** are shown. The UI offers no decide/grant action, so an operator cannot approve an action from the browser; the approval gate stays server-enforced.

## Next Case Study Thread

The logical next slice is a **Content Runs list panel** to display `WorkflowRun` status. This would be followed by implementing a **guarded decide endpoint and corresponding UI** for approvals, finally concluding with **legacy complexity cleanup** of the oversized settings and setup files.
