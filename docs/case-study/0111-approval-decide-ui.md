# 0111: Approval Decide UI

## Problem
The Approval Queue panel in Opzava was read-only. Operators could view pending requests but had to leave the UI or use a CLI to approve or reject them. This created friction in the approval workflow and broke the "single pane of glass" promise of the control plane.

## Approach
This slice (Layer 9, Opus-written UI) adds interactive decision buttons directly to each approval row. The UI never owns state transitions — it merely requests them. The server-side approval state machine remains the sole authority.

`ApprovalRow` now renders **Approve** (success variant) and **Reject** (destructive variant) buttons only when the row's status is `requested`. The panel tracks a `busyId` to disable the active row during the POST. A `decide(id, decision)` handler prompts for an optional reason, sends the request, surfaces errors inline, and reloads the current filter on success.

## Contract
- **Route:** `POST /api/ops/approvals/[id]/decide`
- **Payload:** `{ decision: "approve" | "reject", reason?: string }`
- **Response:** `200` on success, `409` if the approval is no longer in `requested` status, `403` if the operator lacks permission.
- **UI behavior:** Buttons render only for `requested` rows. Row disables while `busyId === row.id`. Panel reloads filter after successful decision.

## Validation
- TypeScript: typecheck clean, zero errors.
- ESLint: 0 errors, 0 warnings.
- Production build: compiles without issues.
- Check-plan assertion: verifies the panel POSTs to the decide route and renders `onDecide`, `Approve`, and `Reject` handlers. Button visibility mirrors the server-side rule — only `requested` approvals are interactive.

## Security & Audit
No secret values, private credentials, tokens are handled by the panel — it sends only the decision and an optional reason to an admin-gated, rate-limited route. The browser cannot force an illegal transition: the server routes every decision through `transitionApprovalStatus`, so a stale UI clicking Approve twice gets a `409`, not a double-decision. All decisions are logged server-side with operator identity and timestamp.

## Next Case Study Thread
Two candidates for the next slice:
1. **Legacy complexity cleanup** — behavior-preserving split of the oversized `settings-panel/setup` files into focused modules.
2. **Daemon entrypoint** — construct the campaign worker daemon with a real timer and signal-based stop, replacing the current mock loop.
