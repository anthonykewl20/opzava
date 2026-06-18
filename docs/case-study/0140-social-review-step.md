# 0140: Social Review Step

## Problem
The Social Media department drafts posts, but lacks a formal quality gate before content moves downstream. Without a structured review step, there is no programmatic way to enforce that a post has been vetted or to capture specific issues when it hasn't. We need a deterministic, auditable checkpoint that produces a clear pass/reject verdict.

## Approach
We introduce a `social-review` step that consumes a post draft and produces a `social-review` Artifact. The step itself is a dumb worker; the **system** owns the structural invariant governing the verdict. This follows the same pattern as existing content quality gates: a passed verdict must have zero issues, and a rejected verdict must list at least one issue with a non-empty `code` and `reason`.

## Contract
The slice exposes three core functions:
- `parseSocialReviewInput`: Validates the payload `{postDraftArtifactId, text, platform, sourceStepRunId}`.
- `assertSocialReviewVerdict`: Enforces the pass/reject invariant on the provider's output.
- `createSocialReviewStepService({provider, newId, now}).run(payload)`: Orchestrates parsing, assertion, and wraps the result into a `social-review` Artifact with lineage `[postDraftArtifactId]`.

A `createMockSocialReviewProvider` returns a clean pass by default for testing.

## Validation
Six tests enforce the contract:
1. Default provider produces a passed review (status `passed`, issues empty, lineage correct).
2. A custom provider can produce a rejected review carrying issues.
3. `assertSocialReviewVerdict` rejects a `passed` verdict that carries issues.
4. It rejects a `rejected` verdict with no issues.
5. It rejects a rejected issue missing a `reason`.
6. `parseSocialReviewInput` rejects a missing field.

## Security & Audit
No secret values, private credentials, tokens enter a social review — it is wrapped through `createSocialArtifact` -> `parseArtifact`, which rejects secret-bearing content and requires lineage. The structural pass/reject invariant means a `passed` verdict cannot silently hide issues; any problem must be explicitly listed, ensuring full auditability.

## Next Case Study Thread
The next slice should introduce a human social-approval gate (modeled as an `Approval`, not an artifact) that requires explicit sign-off. Following that, a terminal `social-schedule-request` step will be schedule/draft-only, ensuring the system never auto-publishes content.
