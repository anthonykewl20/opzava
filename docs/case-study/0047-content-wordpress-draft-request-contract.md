# 0047: Content Module: WordPress Draft Request Contract

Date: 2026-06-16
Status: Draft
Thread: The terminal content artifact — a draft-only WordPress request payload that may only exist after human approval and every quality gate. The `status` literal `'draft'` makes publishing structurally impossible, and an `approvalId` plus all four quality-gate artifact ids (source capture, fact-check report, brand review, anti-slop review) are required fields, so the milestone's "no auto-publish, all gates required" rule is encoded as a type, not a hope.

## Hook

An automation that drafts posts for a CMS has one job it must never do on its own: publish. The single most damaging failure in a content pipeline is a half-reviewed draft reaching a live audience because a flag was mis-set or a step was skipped in code. This slice makes the WordPress request a terminal, draft-only artifact whose `status` is the literal `'draft'` — there is no field value through which a draft becomes a published post — and which cannot even be constructed unless an approval already happened and every quality gate already produced its artifact id.

## Product Stakes

Slice 0046 turned the anti-slop review into a versioned artifact where "passed" structurally means zero detected slop. With the idea, keyword research, source capture, SEO brief, outline, article draft, fact-check report, brand review, and anti-slop review all in place, the only remaining artifact is the external action: handing the approved draft to the publish boundary.

This artifact carries a `requestId`, lineage to the `ideaId` and the `draftId`, a required `approvalId` (the prior human go-ahead), the `title` and `bodyMarkdown` to send, a `gateArtifacts` object referencing all four upstream gates (`sourceCaptureId`, `factCheckReportId`, `brandReviewId`, `antiSlopReviewId`), a `createdAt` timestamp — and a `status` fixed to `'draft'`. The load-bearing rules are structural: `status` is a single literal so no draft can carry a publish intent, and the approval plus every gate id are non-optional fields so a request cannot exist unless the whole review chain already passed.

## Industry Counterfactual

The common shortcut is to model a "create post" action as a generic payload with a mutable `status` field that defaults to `draft` but accepts `publish`, and to let the caller decide which gate artifacts to attach (if any) at call time.

That detaches the safety guarantee from the data. A misrouted call, a reused payload, or a future caller can flip `status` to `publish` — the type permits it — and nothing in the artifact's shape proves the reviews ran. When a draft ships early, the post-mortem finds a status flag that was *allowed* to be wrong and a chain of gates that were *optional* to skip.

Opzava encodes the request as a versioned value object where publishing is not "discouraged" but impossible: `status` is the single literal `'draft'`, so a `publish` value does not parse. And because `approvalId` and all four gate ids are required, strict, non-empty fields, a draft request cannot be constructed until an approval exists and every gate has produced its artifact. The milestone rule lives in the schema, not in the caller's discipline.

## What We Built

We added `WordpressDraftRequest` to the content module.

The contract:

- is a versioned, strict zod schema (`WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION`)
- references its draft by `draftId` and its idea by `ideaId` for lineage
- requires a non-empty `approvalId` — the request exists only after a prior approval
- carries the `title` and `bodyMarkdown` to send, plus a `requestId` and `createdAt`
- fixes `status` to the single literal `'draft'` — there is no value that publishes
- requires a strict `gateArtifacts` object naming all four upstream gates (`sourceCaptureId`, `factCheckReportId`, `brandReviewId`, `antiSlopReviewId`), each non-empty
- rejects unknown fields (strict)
- exposes `parseWordpressDraftRequest`, which returns a frozen value
- has no providers, runner, network, or side effects

## What We Refused To Fake

We did not allow a mutable or enum `status`; a literal `'draft'` is the only value, so publishing cannot be expressed in this artifact.

We did not make `approvalId` optional; a request that precedes approval is exactly the failure this artifact exists to prevent.

We did not make any gate id optional; a draft cannot be requested to publish unless the source-capture, fact-check, brand, and anti-slop artifacts all exist and are referenced.

We did not add a `publishedAt`, `liveUrl`, or any publish-shaped field; the artifact models only the draft request, never the published outcome.

We did not add step logic, providers, or live calls; this slice is contract-only and mock-shaped.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/wordpress-draft-request.ts`
- `src/opzava/modules/content/contracts/wordpress-draft-request.test.ts`
- `src/opzava/modules/content/index.ts`

The tests cover:

- a valid draft request parses
- a `status` of `'publish'` and `'published'` are both rejected (publishing is structurally impossible)
- a missing `approvalId` is rejected
- a missing `gateArtifacts` object is rejected
- a `gateArtifacts` missing any one of the four ids (`sourceCaptureId` / `factCheckReportId` / `brandReviewId` / `antiSlopReviewId`) is rejected
- an unknown field and a wrong schema version are rejected
- an empty `bodyMarkdown` is rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/contracts/wordpress-draft-request.test.ts: passed 12/12 (failed before implementation: module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 91/91 (10 artifact contracts unchanged + wordpress-draft-request added)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
```

This is a pure contract with structural rules enforced by a literal `status` and required fields, so a council pass was not run; accept and reject behavior is fully covered by tests.

## The Automation Lesson

The schema makes the safety guarantee a property of the type, not the caller. A WordPress request whose `status` is `'draft'` is the only kind that can exist, because `'draft'` is the only legal value — publishing cannot be expressed, let alone executed, through this artifact. And because `approvalId` and every quality-gate id are required, a draft request cannot come into being until a human approved it and the source-capture, fact-check, brand, and anti-slop artifacts all exist. The milestone's "no auto-publish, all gates required" rule is not a comment or a convention; it is a parse-time invariant.

## Next Case Study Thread

This completes the content artifact contracts — the full chain from `idea intake` through `keyword research`, `source capture`, `SEO brief`, `outline`, `article draft`, `fact-check report`, `brand review`, `anti-slop review`, and now the terminal `wordpress draft request`.

The next build thread should:

- add the content `WorkflowDefinition` — the step graph that wires these artifacts together, so each artifact is produced by a named step in a declared order with the right lineage dependencies
- then run the step services through the durable runner on mock providers, exercising the chain end-to-end before any live publish path is ever considered
