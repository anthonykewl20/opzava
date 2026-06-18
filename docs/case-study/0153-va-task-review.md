# 0153: VA Task Review

## Problem
The General VA department's intake-to-draft pipeline lacked a formal quality gate. Unlike other departments, there was no structured review step to validate task drafts before they progressed. This created a risk of incomplete or flawed tasks advancing through the workflow without documented assessment.

## Approach
We implemented a `va-task-review` step that transforms a task draft into a review artifact carrying a definitive pass or reject verdict. This mirrors the existing `social-review` pattern, using the General VA envelope structure. The design enforces a strict invariant: passed reviews must have zero issues, rejected reviews must list at least one issue with a code and reason. This work also confirmed ARD 0006, validating that the SQLite-first schema remains Postgres-compatible.

## Contract
The module exposes four core functions:

- `parseVaTaskReviewInput` validates the incoming payload: `{taskDraftArtifactId, summary, sourceStepRunId}`
- `assertVaTaskReviewVerdict` enforces the pass/reject invariant on verdict objects
- `createMockVaTaskReviewProvider` returns a clean pass verdict for testing
- `createVaTaskReviewStepService({provider, newId, now}).run(payload)` wraps the verdict as a `va-task-review` Artifact with lineage `[taskDraftArtifactId]`

## Validation
Six tests cover the critical paths:

1. Passed review defaults to correct status, empty issues, and proper lineage
2. Rejected review includes populated issues array
3. `assertVaTaskReviewVerdict` rejects a passed verdict containing issues
4. `assertVaTaskReviewVerdict` rejects a rejected verdict with no issues
5. `assertVaTaskReviewVerdict` rejects a rejected issue missing a reason field
6. `parseVaTaskReviewInput` rejects payloads with missing required fields

## Security & Audit
No secret values, private credentials, tokens enter a VA task review — wrapped through `createGeneralVaArtifact` then `parseArtifact`, which rejects secret-bearing content and requires lineage. The structural pass/reject invariant means a passed verdict cannot hide issues.

## Next Case Study Thread
The natural next slice is an optional VA human-approval gate to complete the General VA workflow, alongside granting agents ownership of the review step on the dashboard pipeline.
