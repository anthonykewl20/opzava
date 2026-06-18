# 0154: VA Approval Step

## Problem
The General VA department's workflow (intake → draft → review) lacked a formal human approval gate. This inconsistency prevented it from matching the established discipline of the Content, Email, and Social departments, where a human decision record (an Approval) is required before a task is considered complete.

## Approach
This TDD slice introduces the missing approval step. It mirrors the social-approval pattern: the step produces an **Approval** (a decision record), not an artifact. The provider supplies the raw decision; the system's `parseApproval` function validates and constructs the immutable Approval record, enforcing the invariant that a decision requires an approver, reason, and timestamp.

## Contract
The service is built via `createVaApprovalStepService({provider, newId, now})`. Its `run(payload)` method accepts input validated by `parseVaApprovalStepInput`, which requires `{taskDraftArtifactId, requesterId, requestedAt}`. The mock provider, `createMockVaApprovalProvider`, returns a deterministic approved decision. The service builds an Approval with `requestedAction: 'va-task-complete'` targeting the specified task-draft artifact.

## Validation
Five core tests ensure correctness:
1.  **Approved Approval**: Produces an Approval with status `approved`, correct target, `requestedAction`, approver, `decidedAt`, and a generated `id`.
2.  **Rejected Approval**: Produces an Approval with status `rejected` and includes the decision reason.
3.  **Frozen Record**: The result is a frozen Approval object (no `artifactType`, has `approvalId`).
4.  **Input Validation**: `parseVaApprovalStepInput` rejects a payload with a missing field.
5.  **Mock Provider**: The mock provider returns a deterministic approved decision.

## Security & Audit
No secret values, private credentials, tokens live on a VA approval — only the decision, approver id, reason, and target artifact id. The system enforces (via `parseApproval`) that a decision cannot be recorded without an approver and reason. With this gate, all four departments share the same approval-before-completion discipline.

## Next Case Study Thread
The agent-team product is now complete across all four departments. The next work is product-owner-directed, such as implementing a per-department run-history view, adding multi-tenant support, or planning the commit and release strategy.
