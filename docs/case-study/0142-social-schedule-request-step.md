# 0142: Social Schedule Request Step

## Problem

The Social Media workflow needed a terminal step that mirrors the content department's WordPress draft pattern. Drafts, reviews, and approvals exist across social, but there was no final step that could be structurally prevented from publishing. We needed a slice that:

- Accepts an upstream post-draft, a review, and a granted approval as lineage.
- Lets the operator choose to *schedule* or hold as *draft*.
- Makes publishing impossible by construction — not by convention, not by a guard, but by absence of the value.
- Carries the same draft-only safety the content WordPress step already provides.

## Approach

Structural safety. The step's status is a literal union `'scheduled' | 'draft'`. There is no `'published'` member anywhere in the type, so there is no code path that can publish. The service:

1. Validates input via `parseSocialScheduleRequestInput`.
2. Throws unless `approvalGranted === true`.
3. Wraps `{ status, platform, scheduledAt }` into a `social-schedule-request` Artifact via `createSocialArtifact` and `parseArtifact`, with `lineage: [postDraftArtifactId, reviewArtifactId, approvalId]`.

The worst an operator or agent can do is schedule or hold a draft, and only after an approval is granted. Publishing is impossible by construction — completing the social workflow: brief → post-draft → review → approval → schedule.

## Contract

`parseSocialScheduleRequestInput(payload)` — validates that `postDraftArtifactId`, `reviewArtifactId`, `approvalId`, and `platform` are present; that `approvalGranted` is a boolean; and that any `desiredStatus` is `'scheduled'` or `'draft'`.

`createSocialScheduleRequestStepService({ newId, now }).run(payload)` — throws unless `approvalGranted` is `true`; otherwise returns a `social-schedule-request` Artifact with `status`, `platform`, `scheduledAt`, and lineage `[postDraftArtifactId, reviewArtifactId, approvalId]`.

```ts
type SocialScheduleRequestStatus = 'scheduled' | 'draft'; // no 'published' — by construction
```

## Validation

Six tests cover the contract:

1. **Produces a scheduled artifact** — given a granted approval and `desiredStatus: 'scheduled'`, returns an artifact whose `status === 'scheduled'`, `platform` matches, and `scheduledAt` is a valid future time.
2. **Records lineage** — the returned artifact's `lineage` equals `[postDraftArtifactId, reviewArtifactId, approvalId]` in order.
3. **Honors `desiredStatus: 'draft'`** — when the operator chooses draft, the artifact's status is `'draft'` and `scheduledAt` is null/absent; no scheduled time is recorded.
4. **No published path** — there is no test (and no code) that produces a `'published'` status; attempting `desiredStatus: 'published'` is rejected at parse time.
5. **Rejects an ungranted approval** — `approvalGranted: false` causes `run` to throw before any artifact is created.
6. **`parseSocialScheduleRequestInput` rejects bad input** — `desiredStatus: 'published'` and a missing required field both throw; non-boolean `approvalGranted` throws.

## Security & Audit

**No secret values, private credentials, tokens** enter a schedule request — only `status`, `platform`, and a `scheduledAt` time, wrapped through `createSocialArtifact` → `parseArtifact`. The artifact payload is intentionally minimal so nothing sensitive leaks into lineage or logs. Scheduling is impossible without a granted approval, and publishing is impossible by construction (no `'published'` status) — the same draft-only safety the content department applies to WordPress. Every schedule artifact carries the full upstream chain (`postDraftArtifactId`, `reviewArtifactId`, `approvalId`) for end-to-end auditability.

## Next Case Study Thread

Extend the Social Media Manager's owned steps so the dashboard pipeline shows owners for every social step (brief, post-draft, review, approval, schedule), or add a **Social Copywriter** and **Community Manager** persona so each step has a clear owner. Then move on to the **General VA department** and per-agent KPIs, so the dashboard can show throughput, approval rate, and schedule density per agent across departments.
