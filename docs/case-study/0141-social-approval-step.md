# 0141: Social Approval Step

## Problem
The Social Media department drafts and reviews posts, but lacks a formal human approval gate before publishing. Unlike artifact-producing steps, this slice must record a human decision — an `Approval` — without generating a content artifact. The system needs to ensure every social publish request passes through explicit human authorization.

## Approach
Mirror the existing content human-approval pattern. The provider supplies the raw human decision; the system constructs a validated `Approval` via `parseApproval`. This enforces the invariant that approved/rejected approvals carry approver, reason, and decided-at. The step targets the post-draft artifact with `requestedAction: 'social-publish'`.

## Contract
```
parseSocialApprovalStepInput({postDraftArtifactId, requesterId, requestedAt})
createMockSocialApprovalProvider() → deterministic approved decision
createSocialApprovalStepService({provider, newId, now}).run(payload) → Approval
```
The service builds an `Approval` linking to the post-draft artifact, embedding the provider's decision and a `decidedAt` timestamp.

## Validation
Five tests establish correctness:

1. **Approved Approval** — produces an Approval with status `approved`, correct target artifact id, `requestedAction: 'social-publish'`, approver id, `decidedAt`, and generated id.
2. **Rejected Approval** — carries the decision reason from the provider.
3. **Frozen Approval** — result has no `artifactType` field; includes `approvalId`.
4. **Input validation** — `parseSocialApprovalStepInput` rejects missing `postDraftArtifactId`, `requesterId`, or `requestedAt`.
5. **Mock determinism** — `createMockSocialApprovalProvider` returns a stable approved decision for test reproducibility.

## Security & Audit
No secret values, private credentials, tokens live on a social approval — only the decision, approver id, reason, and target artifact id. The approval is the mandatory human gate before scheduling; the system enforces (via `parseApproval`) that an approved/rejected decision cannot be recorded without an approver and reason. This creates an auditable trail of human intent.

## Next Case Study Thread
The terminal **social-schedule-request** step — schedule/draft-only, never auto-publishes. It requires the granted approval id in its lineage, ensuring no post reaches scheduling without passing through this human gate.
