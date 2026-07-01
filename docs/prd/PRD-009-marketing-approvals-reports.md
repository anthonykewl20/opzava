# PRD-009: Marketing approvals, assets, send-review, reports, and performance

## Problem

PRD-008 defines the Marketing campaign suite, content production loop, and the hard invariant that no `ContentItem` reaches `Published` without an approved Opzava `Approval` for the exact version or matching content hash. Opzava now needs the supporting product surfaces that make that invariant usable day to day: a unified Marketing approval inbox, a campaign assets library, upload and send-for-review flows, and performance/report screens backed by versioned `ReportArtifact` records.

Without this PRD, the PRD-008 loop can drift into unsafe or incomplete behavior:

- Marketing approvals could split across assets, content, chat, runtime prompts, and notifications, making it unclear which decision unlocks schedule or publish.
- Assets could become loose object-store files or OpenClaw artifacts instead of Opzava-owned, versioned, reviewable Marketing records.
- Upload could bypass review by marking files final without policy, content hash, reviewer, and audit data.
- Send for review could create notifications without creating a durable `Approval`, leaving the approval inbox and content lifecycle out of sync.
- Atlas could flag, draft, tag, analyze, or recommend changes without product-owned provenance, freshness, and action boundaries.
- Performance, ads, email, and blog report pages could read live provider metrics directly or present ephemeral chat summaries instead of reproducible `ReportArtifact` versions.
- Report freshness, stale inputs, source cursors, and period identity could be hidden, causing users to trust outdated or partial analysis.

The solution is to ship the Marketing review and measurement slice as Opzava-owned product state with OpenClaw harnessed only for runtime execution. Marketing/Department Workflows owns `Approval`, `MarketingAsset`, `AssetVersion`, `ReportJob`, `ReportArtifact`, read models, workflow/run refs, and audit. OpenClaw remains harnessed through the `gateway-broker` for Atlas runs, TaskFlow, cron, artifacts, runtime approvals, channel/provider metric reads, and status projections.

This PRD depends on PRD-008 and applies ADR-005 and ADR-012. It references those decisions without restating the architecture.

## Goals and Non-goals

### Goals

- Ship the unified Marketing Approval inbox shown in `essential-mkt-approvals.html`.
- Ship Send for review as the durable review-request flow shown in `essential-send-review.html`.
- Ship the Marketing Assets library shown in `essential-mkt-assets.html`.
- Ship Upload to Assets as the asset intake flow shown in `essential-upload.html`.
- Ship Performance summary shown in `essential-mkt-performance.html`.
- Ship Ads Report, Email Report, and Blog Report shown in `essential-mkt-ads-report.html`, `essential-mkt-email-report.html`, and `essential-mkt-blog-report.html`.
- Ensure every approval action updates one Opzava `Approval` row and one audit trail, no matter whether the prompt appears in inbox, asset, content, activity, notification, or chat.
- Ensure no `ContentItem` reaches `Published` unless the exact version/hash has an Opzava `Approval` in `Approved` state.
- Treat Marketing assets as Opzava-owned versioned records with campaign refs, content refs, asset blobs, review state, approved/final state, provenance, and audit.
- Support human-uploaded and Atlas-created assets without confusing AI suggestions with approved final assets.
- Make send-for-review create reviewable target refs, reviewers, due/SLA data, status preview, notifications, and an `Approval` or approval-request record through Marketing commands.
- Generate performance, ads, email, and blog reports through ADR-012 report workflow: trigger -> `ReportJob` -> Atlas run -> ACL reads -> versioned `ReportArtifact`.
- Show report period, freshness, stale-input state, Atlas analysis provenance, source cursors, and artifact version in product state.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity notes for native harnessed capabilities versus Opzava-owned authority.
- Define acceptance and testing decisions at the highest user-visible seams.

### Non-goals

- Redesign PRD-008 campaign, content pipeline, content calendar, schedule, or publish flows.
- Build OpenClaw standing orders, cron, TaskFlow, channel runtime, artifacts store, sessions, provider integrations, runtime approvals, or Gateway internals.
- Build generic Project Management files/docs, card detail, or knowledge corpus management beyond Marketing asset refs and upload reuse.
- Build CRM segment authoring, consent administration, or email provider setup, except where report inputs and send-time checks reference owning contexts.
- Build billing, package limits, or usage pricing beyond consuming plan/budget ceilings supplied by owning contexts.
- Let browser clients, route handlers, normal users, Atlas, or hot-path broker commands mutate Gateway config, channel credentials, or raw provider secrets.
- Treat OpenClaw `operator.approvals` as business approval truth. Runtime approvals may be mirrored into the same inbox, but Opzava `Approval` remains the business decision source of truth per ADR-012.
- Expose raw secrets, provider tokens, raw Gateway DTOs, raw OpenClaw config, raw provider payloads, hidden model reasoning, or unredacted customer/PII data.

## User Stories

1. As a Marketing reviewer, I want one Approvals page for marketing sign-offs, so that I do not hunt across assets, chat, content, and notifications.
2. As a Marketing reviewer, I want approvals grouped by Needs review, Changes requested, and Approved, so that I understand the queue state quickly.
3. As a Marketing reviewer, I want the queue sorted oldest first inside active review groups, so that stale approvals do not disappear.
4. As a Marketing reviewer, I want each row to show asset/content name, version, campaign, reviewer, age, and status, so that I can triage without opening every item.
5. As a Marketing reviewer, I want Atlas-flagged items to show Atlas attribution and the assigned human reviewer, so that AI checks are transparent.
6. As a Marketing reviewer, I want flagged approval actions to ask for confirmation before approving anyway, so that compliance flags are deliberate decisions.
7. As a Marketing reviewer, I want Approve to provide fast pending feedback and then move the item to Approved, so that the action feels reliable.
8. As a Marketing reviewer, I want Request changes to require a note, so that the owner or Atlas knows what to revise.
9. As a Marketing reviewer, I want request-change notes preserved on the approval and target asset/content version, so that review history is auditable.
10. As a Marketing reviewer, I want approved rows collapsed by default but still reachable, so that the active queue stays focused.
11. As a Marketing reviewer, I want undo immediately after approval where policy allows, so that accidental clicks can be corrected before publish proceeds.
12. As a Marketing reviewer, I want undo to fail closed after a publish job starts or the approval is consumed by policy, so that reversibility is honest.
13. As a Marketing reviewer, I want filters by approval status and campaign, so that I can focus on my slice of work.
14. As a Marketing reviewer, I want empty, loading, no-match, forbidden, stale, offline, and retry states, so that queue state is understandable.
15. As a Marketing reviewer, I want every approval decision to record actor, reviewer, target refs, content hash/version, policy, timestamp, note, and audit metadata, so that decisions can be explained later.
16. As a Marketing reviewer, I want stale approval actions disabled after edits, supersession, expiry, or another decision, so that obsolete content cannot be approved.
17. As a Marketing reviewer, I want approval prompts from chat and notifications to resolve to the same approval row, so that decisions do not fork.
18. As a Marketing reviewer, I want runtime exec/plugin prompts mirrored separately from business approvals, so that I can distinguish a tool gate from content sign-off.
19. As a Marketing lead, I want the approval inbox to show SLA age and overdue state, so that review bottlenecks can be escalated.
20. As a Marketing lead, I want approval backlog counts to feed the Marketing dashboard from PRD-008, so that waiting-on-you remains visible.
21. As a content owner, I want Send for review to choose the target asset or content version, so that the request applies to exact material.
22. As a content owner, I want Send for review to allow multiple reviewers, so that required stakeholders can be routed at once.
23. As a content owner, I want Send for review to require at least one reviewer, so that review requests are never ownerless.
24. As a content owner, I want reviewer chips to support pointer and keyboard selection, so that the dialog is accessible.
25. As a content owner, I want a due/needed-by date with lead-time guidance, so that reviewers understand urgency.
26. As a content owner, I want an optional note for reviewers, so that context travels with the review request.
27. As a content owner, I want a status preview before sending, so that I know the target will appear as Needs review.
28. As a content owner, I want Send for review to return to the approval queue after success, so that the new request is visible.
29. As a content owner, I want Send for review to be idempotent, so that retries do not create duplicate approval rows.
30. As a content owner, I want Send for review to notify reviewers and update activity, so that review work is discoverable.
31. As an uploader, I want Upload to Assets to accept drag, browse, staged files, remove, and true file counts, so that I can correct the upload set before submitting.
32. As an uploader, I want upload limits and allowed types shown in the dialog, so that I know what files are accepted.
33. As an uploader, I want no-file submit validation with focus returned to the drop zone, so that empty uploads are prevented.
34. As an uploader, I want each staged file to show file name, size, type glyph, ready state, and remove action, so that staged work is clear.
35. As an uploader, I want upload to collect campaign and type metadata, so that assets land in the right Marketing context.
36. As an uploader, I want Type to default to Atlas can detect, so that routine classification can be suggested without requiring me to decide immediately.
37. As an uploader, I want Upload to offer Send for review or Mark approved, so that review intent is explicit at intake.
38. As an uploader, I want Mark approved to require approval permission, so that upload cannot bypass review policy.
39. As an uploader, I want Send for review uploads to create reviewable asset versions and approval requests, so that new files enter the queue.
40. As an uploader, I want upload progress and pending state, so that I do not double-submit large files.
41. As an uploader, I want Atlas tag-and-check to be optional, so that AI work starts only when requested or policy-admitted.
42. As an uploader, I want Atlas tag-and-check results to be suggestions until accepted or reviewed, so that AI classification is not silently final.
43. As an uploader, I want uploads to preserve original blob refs and content hashes, so that versions and approvals are reproducible.
44. As a Marketing member, I want Assets to show every approved file and draft in one place, so that campaign creative is findable.
45. As a Marketing member, I want Assets to show filters for Campaign and Type, so that large libraries remain scannable.
46. As a Marketing member, I want filtered counts for total, approved, and in-review assets, so that readiness is visible.
47. As a Marketing member, I want recently approved assets displayed as a strip, so that final creative is quick to reuse.
48. As a Marketing member, I want asset cards to show file type, name, size/metadata, campaign label, and review state, so that each card is useful at a glance.
49. As a Marketing member, I want Atlas-drafted assets labeled distinctly, so that AI authorship is visible.
50. As a Marketing member, I want cross-campaign assets such as brand voice or logo packs to be reusable without duplicating files, so that shared creative stays consistent.
51. As a Marketing member, I want no-match and empty states with upload actions, so that I can recover from filters or an empty library.
52. As a Marketing member, I want recent asset activity with human/AI attribution, so that upload, review, approval, and revision history is visible.
53. As a Marketing member, I want asset links to open an asset detail or reusable card/detail surface, so that I can inspect versions, review history, and linked content.
54. As a Marketing member, I want approved assets locked to a version/hash, so that downstream content can cite the exact creative approved for use.
55. As a Marketing member, I want asset replacement to create a new version, so that past approvals remain tied to the old version.
56. As a Marketing member, I want deleting or archiving assets to respect linked content, approvals, and published history, so that active campaigns are not broken.
57. As a Marketing lead, I want Performance to show goal vs actual for live and recent campaigns, so that campaign health is comparable.
58. As a Marketing lead, I want Performance to filter by date range with visible updating state, so that I know the data is refetching.
59. As a Marketing lead, I want each performance row to show campaign, goal, target, actual, progress, and trend, so that one meaningful metric per campaign is clear.
60. As a Marketing lead, I want ended campaigns muted but still visible, so that historical performance can be compared without looking current.
61. As a Marketing lead, I want a Needs attention line for under-target campaigns, so that weak performance becomes actionable.
62. As a Marketing lead, I want Performance to link back to Campaigns, Calendar, Approvals, Assets, reports, assistant, and Team, so that measurement stays in the Marketing workspace.
63. As a Marketing analyst, I want Ads Report to show spend, ROAS, conversions, click-through, channel breakdown, and period filter, so that paid performance can be reviewed.
64. As a Marketing analyst, I want Ads Report to separate cost metrics from result metrics, so that spend increases are not treated as automatically good.
65. As a Marketing analyst, I want Ads Report to show Atlas analysis with evidence-based findings, so that recommendations are tied to measured data.
66. As a Marketing analyst, I want Ads Report recommendations to become explicit actions such as budget-shift proposals, so that analysis can turn into governed work.
67. As a Marketing analyst, I want applying an ads recommendation to create a governed command or proposal, so that Atlas does not mutate budgets without policy.
68. As a Marketing analyst, I want Email Report to show sent, open rate, click rate, conversions, unsubscribe rate, and send breakdown, so that email health is measured per send.
69. As a Marketing analyst, I want Email Report trend meaning to account for inverted metrics such as unsubscribe rate, so that arrows do not mislead.
70. As a Marketing analyst, I want Email Report recommendations to reference segment, send time, subject, and consent-safe next steps, so that email actions stay grounded.
71. As a Marketing analyst, I want Blog Report to show pageviews, average time, signups, organic share, and post breakdown, so that content performance is measurable.
72. As a Marketing analyst, I want Blog Report recommendations to turn into draft actions like "Have Atlas draft the CTA", so that analysis can feed content production.
73. As a Marketing analyst, I want Atlas draft actions from reports to create draft artifacts or content tasks, so that report suggestions do not vanish in chat.
74. As a Marketing analyst, I want Ask Atlas about this to include report period, source cursors, artifact ref, and selected row context, so that follow-up analysis uses the same evidence.
75. As a Marketing analyst, I want Re-run analysis to create a new report artifact version, so that history is preserved.
76. As a Marketing analyst, I want report freshness stamps, so that I know whether I am reading current or stale analysis.
77. As a Marketing analyst, I want stale inputs called out visibly, so that Atlas does not fabricate freshness.
78. As a Marketing analyst, I want report tables and summaries to come from `ReportArtifact` projections, so that reloads and audits reproduce the same numbers.
79. As a Marketing analyst, I want report periods cached by tenant, report type, and period hash, so that repeated reads are consistent and efficient.
80. As a Marketing analyst, I want regenerating a report to create a new artifact version, so that prior analysis remains available.
81. As an operator, I want report generation to run through ADR-012 `Workflow`, `ReportJob`, `WorkflowRun`, and `RunStep`, so that it follows budget, concurrency, idempotency, and approval policy.
82. As an operator, I want report jobs to read source data through ACL-mediated ports only, so that provider/channel/runtime data stays behind owning contexts.
83. As an operator, I want report jobs to record source cursors and `asOf`, so that stale or partial data can be explained.
84. As an operator, I want duplicate report trigger keys to collapse, so that cron retries do not create report storms.
85. As an operator, I want report failures to preserve failed state, retry eligibility, source failure reason, and audit, so that recovery is operable.
86. As an operator, I want report actions to respect tenant, department, employee, plan, budget, cost, and concurrency ceilings, so that analysis jobs cannot fan out unchecked.
87. As a security reviewer, I want Marketing asset rows to store object refs and secret refs only, so that object paths, channel credentials, and provider tokens are not exposed.
88. As a security reviewer, I want all asset upload, approval, report, and recommendation actions authorized server-side, so that browser-supplied refs are hints only.
89. As a security reviewer, I want tool policy and approval gates from ADR-005 enforced on Atlas tag/check/report runs, so that persona text is not the enforcement layer.
90. As a security reviewer, I want report narratives sanitized before rendering, so that provider data or AI output cannot inject unsafe UI.
91. As a security reviewer, I want role revocation to remove access to approvals, assets, report artifacts, and live runtime status on reload/reconnect, so that stale clients fail closed.
92. As a screen-reader user, I want approval rows, reviewer chips, upload dialogs, asset filters, report tables, trend meanings, and action feedback to expose semantic labels, so that the workflows are usable without visual scanning.
93. As a keyboard user, I want filters, menus, approve/request-change actions, reviewer chips, upload remove buttons, radiogroups, date filters, report actions, and dialogs to work without a mouse, so that review and reporting are efficient.
94. As a mobile user, I want approval rows, asset cards, upload dialog, and report tables to collapse without hiding primary actions or status labels, so that I can review on narrow screens.
95. As a product operator, I want every screen to render loading, empty, no-match, forbidden, stale, offline/reconnecting, validation error, Gateway unavailable, and retry states, so that async workflow reality is normal product behavior.
96. As a developer, I want tests through application ports, route/server-action behavior, projection read models, and UI composition, so that behavior is protected without coupling to OpenClaw internals.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `essential-mkt-approvals.html` | Unified Marketing Approvals surface for `Q3 Launch Campaign` with breadcrumb back to Marketing, page title `Approvals`, status/campaign filter menu, Send for review action, summary text, loading and empty states, sections for Needs review, Changes requested, and Approved, row metadata for name/version/campaign/reviewer/age, Atlas-flagged row treatment, Approve and Request changes actions, inline request-change note composer, collapsed Approved group, confirmation dialog for approving despite Atlas compliance flag, toast confirmation with Undo where policy allows, and live recounts. Every row maps to an Opzava `Approval` tied to an exact `MarketingAsset`, `ContentItem`, or related review target version/hash. |
| `essential-send-review.html` | Send for review dialog over a dimmed approval queue. It selects an Asset target, supports multi-select reviewer chips, validates at least one reviewer, captures due/needed-by and optional reviewer note, previews the resulting `Needs review` status, and returns to Approvals after submit. The dialog must create or update a durable Opzava approval request with reviewers, due/SLA, target refs, content hash/version, campaign ref, notifications, and activity. |
| `essential-mkt-assets.html` | Assets library for `Q3 Launch Campaign` with breadcrumb, title `Assets`, subtitle `Every approved file and draft, in one place.`, Campaign and Type filters, live counts, Upload action, recently approved strip, asset cards for images/html/docs/video/zip, campaign labels including All campaigns, states Approved and In review, Atlas drafted badge, empty and no-match states, and Recent asset activity with human and AI attribution. Cards are read models over Opzava-owned asset records and versions, not raw object-store listings or raw OpenClaw artifacts. |
| `essential-upload.html` | Upload to Assets dialog over a dimmed assets shelf. It includes drag/browse drop zone, allowed type/size guidance, staged file rows with remove buttons and true submit count, no-file validation, Campaign and Type fields, Atlas can detect type option, Send for review vs Mark approved radiogroup, optional Atlas Tag & check offer, pending upload feedback, Cancel, and Upload N files. Submit creates versioned asset records with blob refs and content hashes; Send for review creates approval requests; Mark approved requires permission and records approval metadata. |
| `essential-mkt-performance.html` | Performance summary for campaigns with breadcrumb, title `Performance`, date-range select, updating/aria-busy feedback, count line, table for campaign/goal/target/actual/progress/trend, live and ended campaign distinction, Needs attention line, and footer nav to Marketing surfaces. The table reads from report/performance projections backed by `ReportArtifact` versions and campaign goals, not directly from live provider APIs. |
| `essential-mkt-ads-report.html` | Ads Report with period filter, stat cards for Spend, ROAS, Conversions, Click-through, Atlas analysis, recommendation, actionable `Apply: shift $600 to Meta`, Ask Atlas, Re-run analysis, freshness stamp, and By channel table for spend, impressions, clicks, CTR, conversions, ROAS, and trend. The apply action is a governed proposal/command; report numbers and narrative come from an Ads `ReportArtifact` with source cursors and period hash. |
| `essential-mkt-email-report.html` | Email Report with period filter and update status, stat cards for Sent, Open rate, Click rate, Conversions, Atlas analysis and recommendation, Ask Atlas, Re-run analysis, and By send table including unsubscribe rate with inverted-metric meaning. It consumes email send metrics through CRM/External Channels ACL reads and stores the result in a versioned Email `ReportArtifact`. |
| `essential-mkt-blog-report.html` | Blog Report with period filter, stat cards for Pageviews, Avg. time, Signups, Organic, Atlas analysis, recommendation, `Have Atlas draft the CTA`, Ask Atlas, Re-run analysis, and By post table with views, average time, source, signups, and trend meaning. The draft CTA action creates an Atlas draft artifact or content work item tied back to the Blog `ReportArtifact`, not a hidden chat-only draft. |

Net-new screens to design:

- Marketing asset detail/review screen for asset preview, versions, content hash, linked campaign/content refs, comments, review decisions, approved/final lock, replacement, archive, and audit. The mockups link asset names to generic card/detail surfaces, but a Marketing-specific detail contract is needed.
- Marketing report artifact history/detail screen for period, artifact version, source cursors, `asOf`, freshness, stale inputs, generated-by refs, narrative, metrics, and re-run history. The report mockups show the current report only.
- Report action confirmation/proposal screen for governed actions such as shifting ad budget, expanding email segments, or drafting blog CTAs when the action crosses approval, budget, consent, or workflow policy.

## Functional requirements

### Approval inbox and business approval invariant

- Marketing/Department Workflows must own business `Approval` rows for Marketing content and asset review decisions.
- Approval states must support `Pending`, `Approved`, `Rejected`, and `Expired` per ADR-012, with product read-model groupings `Needs review`, `Changes requested`, and `Approved`.
- Approval targets must include at least `ContentItem` version/hash, `MarketingAsset` version/hash, campaign refs, content refs, optional calendar refs, and optional report/action refs.
- No `ContentItem` may reach `Published` without an Opzava `Approval` in `Approved` state for the exact item version or matching content hash.
- Publish and schedule command paths must re-check the approval invariant server-side even if the approval was already visible in the UI.
- Approval rows must record requester, optional `requesterAgentId`, reviewer/approver policy, `policyRef`, `payloadRef`, target aggregate refs, version/hash, expiry/SLA, decision metadata, mirrored OpenClaw refs where applicable, and audit.
- Approval inbox rows must be read models over approvals, targets, campaigns, reviewers, activity, and runtime projections.
- Approval inbox filtering must use structured status/campaign fields, not rendered text matching.
- Approve must be idempotent and must fail closed when the approval is already decided, expired, superseded, or no longer matches the target hash.
- Request changes must require a note, set the approval/target review state to changes-requested, preserve the current version, and route revision work to the owner or Atlas where applicable.
- Atlas compliance/source/brand flags must be stored as review evidence or check results and must be visible before approval.
- Approving despite an Atlas flag must require a consequential confirmation and record the flag override reason/actor in audit.
- Undo approval may be offered only while the approval has not been consumed by schedule/publish or superseded by another decision; after consumption it must become an explicit revoke/re-review flow.
- Approval backlog must surface SLA age, overdue state, and dashboard counts from PRD-008.
- Approval prompts may appear in Marketing inbox, activity, notifications, chat, assets, or content detail, but all decisions must mutate the same `Approval`.
- OpenClaw `operator.approvals` for exec/plugin gates may be mirrored into the same inbox, but they must remain distinct from Opzava business approvals per ADR-012.
- If a mirrored runtime approval and business approval conflict, the business conflict resolves to Opzava and execution fails closed.

### Send for review

- Send for review must be a Marketing command, not a client-side notification shortcut.
- The selected target must resolve to an authorized, current asset/content version with stable target refs and version/hash.
- Reviewer selection must support one or more human reviewers and must validate at least one reviewer before submit.
- Reviewer eligibility must be checked server-side against tenant membership, project/campaign access, role grants, and reviewer policy.
- Due/needed-by must be captured as approval SLA metadata and must support reminder/escalation logic.
- Optional reviewer notes must be persisted on the approval request and activity feed.
- The status preview must reflect the actual post-submit state: `Needs review`.
- Send for review must be idempotent by target version, requester, reviewer set, due date, and command idempotency key.
- Duplicate send-for-review retries must collapse to the existing pending approval where policy says the same reviewer set is still valid.
- Sending for review must emit events for approval projections, notifications, activity, dashboard counts, and realtime updates.
- If the target changed while the dialog was open, submit must reject with a stale-target state and require the user to review the current version.
- Send for review from assets, content detail, upload, or chat must route to the same command and projections.

### Assets library and asset versions

- Marketing/Department Workflows must own `MarketingAsset` as the product record for campaign creative and reviewable marketing files.
- `MarketingAsset` must be tenant-scoped and optionally project/campaign/content scoped.
- `MarketingAsset` must support multiple `AssetVersion` records with blob refs, normalized metadata, content hash, size, MIME/type, title/name, source actor, provenance, review state, approval refs, linked content refs, and audit.
- Asset source blobs must be stored through object storage refs; product rows must not store raw object-store paths or credentials.
- Asset types must support image, HTML/email, doc, video, zip/brand kit, template, and unknown/needs-detection.
- Asset states must support Draft, InReview, ChangesRequested, Approved, Rejected, Archived, Deleted, Superseded, Uploading, Failed, and VirusOrPolicyBlocked where applicable.
- Approved assets must be locked to a version/hash; replacing an approved file creates a new version and must not mutate historical approval truth.
- Assets may be scoped to one campaign or reusable across all campaigns.
- Asset cards must expose file type, name, size/metadata, campaign label, state, and AI attribution where applicable.
- Recently approved assets must be projected from approval decisions and asset versions.
- Recent asset activity must be projected from upload, version, approval, request-change, Atlas tag/check, archive, and link/unlink events.
- Asset filters must be driven by campaign and type fields and must include cross-campaign matching for All campaigns assets.
- Asset links must open a detail/review surface or reusable card surface with enough data to inspect version, approval, preview, and audit.
- Asset archive/delete must check linked content, scheduled/published usage, approval state, and retention policy before hiding or removing active references.
- Assets used by `ContentItem` publishing must be referenced by Opzava asset/version refs, not raw URLs or runtime artifact ids.

### Upload to assets

- Upload must validate tenant, project/campaign access, file count, file type, size limit, content hash, MIME sniffing, malware/content policy where available, and object-store destination server-side.
- Upload must support multiple staged files with idempotent submit semantics.
- Remove-from-stage must update the true client-side file count and cannot imply server deletion before submit.
- Submitting with zero staged files must block with inline validation and focus recovery.
- Upload must create one `MarketingAsset`/`AssetVersion` per file unless a content hash/idempotency policy collapses exact duplicates.
- Campaign metadata must be validated against authorized Marketing campaign refs.
- Type metadata may be user-provided or set to Atlas can detect; AI-detected values remain suggestions until accepted or policy-approved.
- Send for review on upload must create pending approval requests for the uploaded versions.
- Mark approved on upload must require approval permission and must create an approved approval/decision record tied to the uploaded version/hash.
- Atlas Tag & check must dispatch an admitted Marketing/AI Workforce assignment or workflow step only after explicit user action or policy-approved workflow admission.
- Atlas tag/check outputs must include suggested type/tags, brand/source/compliance findings, confidence, generated-by refs, and provenance.
- Upload must emit events for assets read model, approvals read model, activity, notifications, and dashboard asset counts.
- Upload failure must preserve per-file failure reason and retry eligibility without creating half-approved assets.

### Atlas behavior in approvals, assets, and reports

- Atlas must act as a Marketing `AgentEmployee` under ADR-008/ADR-012 policy and ADR-005 tool-policy controls.
- Atlas may draft, tag, check, analyze, recommend, and prepare governed proposals where admitted by workflow policy.
- Atlas must not approve business decisions, mark content/assets final, publish externally, mutate provider budgets, expand CRM segments, or send messages outside approved channel bindings without required business approval.
- Atlas output must carry `requesterAgentId` or generated-by refs where Atlas initiated or performed the work.
- Atlas analysis and recommendations must distinguish evidence, inference, and suggested next action.
- Atlas report actions must create product-owned artifacts, proposals, content tasks, workflow runs, or approval requests; they must not remain only as ephemeral chat text.
- Atlas must read only authorized project/org corpus overlays and ACL-mediated metrics supplied by owning contexts.
- Atlas must not access PII, financial, credential, legal, tenant-admin, or unrelated project data unless an explicit workflow/tool policy allows it.

### Performance and report artifacts

- Marketing reports must be generated as `ReportJob` records and versioned `ReportArtifact` outputs per ADR-012.
- Report types for this PRD must include Performance, Ads, Email, and Blog.
- Report artifacts must record tenant, report type, campaign/project refs, period, period hash, `asOf`, source cursors, freshness SLA, metrics, narrative, generated-by run refs, provenance, artifact storage refs, stale/fresh state, and version.
- Reports must be cached by `(tenant, reportType, periodHash)` and must return the latest authorized artifact version by default.
- Re-running analysis must create a new artifact version rather than mutating historical output.
- Report jobs must run through ADR-012 workflow mechanisms where scheduled or long-running: `CronSpec` for periodic generation and `TaskFlowSpec` for multi-step reads, analysis, artifact write, and notification.
- Report jobs must record `WorkflowRun` and `RunStep` projections for trigger, source reads, Atlas analysis, artifact write, recommendation generation, failures, retries, and completion.
- Report inputs may include campaign goals, content items, calendar slots, asset usage, approval decisions, channel metrics, CRM segments/consent summaries, usage/cost, workflow runs, and runtime projections through owning ports.
- Report jobs must not read provider APIs directly from browser clients.
- Report jobs must use ACL-mediated reads through the `gateway-broker` or owning Opzava contexts and must store only summarized/source-cursor data allowed by policy.
- Stale inputs must produce visible stale report state; Atlas must not fabricate freshness.
- Partial reports must show partial/stale state and source failure reason instead of presenting as current truth.
- Duplicate trigger keys for report jobs must collapse to avoid report storms.
- Report tables must derive trend meaning from metric polarity; rising spend or unsubscribe rate must not be treated as automatically good.
- Performance summary must use campaign goal/target/actual projections and report artifact data, with date range changes reflected in busy and count states.
- Ads Report must include spend, ROAS, conversions, click-through, channel breakdown, Atlas analysis, freshness, and governed recommendation action.
- Email Report must include sent, open, click, conversion, unsubscribe metrics, by-send breakdown, Atlas analysis, and consent-safe recommendation context.
- Blog Report must include pageviews, average time, signups, organic share, by-post breakdown, Atlas analysis, and draft-action handoff into content work.
- Report artifact access must be authorized against tenant, project/campaign access, role grants, report target refs, and shell mode.

### Governed report actions

- Applying an Ads recommendation that shifts budget must create a governed Marketing action/proposal and must not directly mutate provider budgets unless a workflow policy, approval, and channel/provider binding allow it.
- Email recommendations that expand a segment or schedule a send must route through CRM/External Channels consent, suppression, and send-time checks before execution.
- Blog recommendations that draft CTAs or new posts must create draft artifacts or `ContentItem`/asset work under PRD-008 lifecycle.
- Ask Atlas about this from any report must pass artifact ref, period, selected row/context, source cursor summary, and freshness state.
- Re-run analysis must be rate-limited, idempotent per request, and subject to tenant/employee/report budgets.
- Recommendation actions must preserve audit: actor, artifact version, selected recommendation, policy decision, approval refs if any, generated target refs, and result.

### Access, security, and audit

- Every read must be authorized against tenant, organization membership, project/campaign access, shell mode, role grants, and target refs.
- Every mutation must re-check authorization at action time and carry an idempotency key.
- Browser-supplied tenant ids, project ids, campaign ids, asset ids, content ids, approval ids, reviewer ids, report ids, runtime refs, channel refs, and corpus refs must be treated as hints.
- Channel credentials, provider tokens, object-store credentials, and Gateway tokens must live only in Gateway/vault/secrets mechanisms; Marketing rows store refs and safe metadata.
- Tool policy from ADR-005 must deny runtime execution and filesystem mutation for standard Marketing agents and must enforce narrow allowlists for web, memory, messaging, sessions, and curated plugin tools.
- Report and asset narratives, file names, campaign names, reviewer notes, source labels, external URLs, and AI output must be sanitized before rendering.
- Audit rows must cover upload, version creation, asset metadata changes, tag/check dispatch, approval request, approval decision, request changes, undo/revoke, report job trigger, source reads, artifact creation, recommendation action, policy denial, and access denial.
- Access revocation must remove approvals, assets, report artifacts, recommendation actions, and live runtime status on reload and realtime reconnect.

### Accessibility and responsive behavior

- Approval rows, section toggles, filters, action buttons, note composers, confirmation dialogs, and toast/undo controls must use semantic controls and labels.
- Reviewer chips must expose checkbox semantics and keyboard toggle behavior.
- Upload review-state choices must expose radiogroup semantics and keyboard selection.
- Report tables must provide metric labels, trend meanings, and non-color-only status.
- Status and progress must use text/glyph labels and not rely on color alone.
- Focus must return to invoking controls when dialogs, menus, and confirmations close.
- Mobile layouts must preserve primary actions, target names, version/state, reviewer, due/SLA, file metadata, and report metrics without text overlap.
- Loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, and retry states must be defined for every screen in this PRD.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Marketing Approval inbox | Marketing/Dept-Workflows | Opzava `Approval`, target refs, asset/content versions, campaign refs, reviewer assignments, SLA, Atlas flags, decision state, activity projections | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Approval decision commands | Marketing/Dept-Workflows | Approve, request changes, expire, undo/revoke where allowed, stale-target checks, content hash/version validation, audit | `AuthorizationPort`, `EventBusPort`, `OpenClawGatewayPort` |
| Mirrored runtime approvals | Runtime-Control/Gateway Broker with Marketing projection | OpenClaw exec/plugin approval refs, runtime prompt status, mirrored inbox rows, reconciliation events | `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Send for review | Marketing/Dept-Workflows | Target version lookup, reviewer eligibility, due/SLA, note, approval request creation, notification/activity events | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Assets library | Marketing/Dept-Workflows | `MarketingAsset`, `AssetVersion`, campaign/content refs, review state, approved version/hash, counts, recent approved, activity | `AuthorizationPort`, `ObjectStorePort`, `EventBusPort` |
| Upload to Assets | Marketing/Dept-Workflows with Object Store | File validation, blob refs, content hash, metadata, asset/version creation, review intent, per-file failure state | `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |
| Atlas tag and check | AI Workforce with Marketing and Knowledge Management | `AgentEmployee`, assignment/workflow run, source refs, brand/corpus checks, suggestions, check findings, artifact/provenance refs | `OpenClawGatewayPort`, `KnowledgeSourcePort`, `KnowledgeIndexPort`, `AuthorizationPort`, `EventBusPort` |
| Asset preview/detail | Marketing/Dept-Workflows with Knowledge Management | Asset blob refs, derived previews/thumbnails, versions, comments, approvals, linked content/campaign refs, audit | `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |
| Performance report | Marketing/Dept-Workflows | Campaign goal/target/actual projections, period filter, under-target state, report artifact summary | `AuthorizationPort`, `EventBusPort` |
| Ads report | Marketing/Dept-Workflows with External Channels | `ReportJob`, Ads `ReportArtifact`, paid channel metric cursors, spend/ROAS/conversion metrics, Atlas analysis, recommendation action | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort`, `ObjectStorePort` |
| Email report | Marketing/Dept-Workflows with CRM/External Channels | Email send metrics, segment/consent summaries, unsubscribe metrics, send breakdown, Atlas analysis, recommendation refs | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort`, `ObjectStorePort` |
| Blog report | Marketing/Dept-Workflows with Knowledge/External Channels | Blog/content metrics, content refs, source/channel attribution, CTA draft action, Atlas analysis, generated artifact refs | `OpenClawGatewayPort`, `KnowledgeSourcePort`, `AuthorizationPort`, `EventBusPort`, `ObjectStorePort` |
| Report generation workflow | Department Workflows | `Workflow`, `ReportJob`, `WorkflowRun`, `RunStep`, duplicate trigger keys, retries, stale/partial state, `ReportArtifact` versioning | `OpenClawGatewayPort`, `EventBusPort`, `ObjectStorePort` |
| Report source reads | Owning source contexts | Campaign/content/calendar read models, channel/provider metrics, CRM segment/consent summaries, usage/cost, runtime projections | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Report recommendation actions | Marketing/Dept-Workflows with CRM/External Channels/AI Workforce | Budget-shift proposal, email segment/send proposal, blog CTA/content draft, approvals, policy decisions, audit | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Notifications/activity | Internal Collaboration and Notifications | Approval requests, approval decisions, request changes, upload complete, report ready, recommendation applied/proposed | `RealtimeTransportPort`, `EventBusPort`, `PushNotificationPort` |

## OpenClaw-parity notes

| Capability | Classification | Native OpenClaw capability harnessed | Opzava-owned authority |
| --- | --- | --- | --- |
| Business approvals | Opzava-owned with mirrored runtime prompts | `operator.approvals` only for exec/plugin gates | Opzava `Approval`, business decision state, target refs, content hash/version, reviewer policy, audit |
| Unified approval inbox | Hybrid | Runtime approval prompts/events can be mirrored via broker | Inbox grouping/read models, reviewer queue, SLA, decision commands, dashboard counts |
| Send for review | Opzava-owned | Optional notifications/runtime prompts after command events | Approval request command, reviewer eligibility, due/SLA, target version/hash, activity |
| Asset library | Opzava-owned | Optional OpenClaw artifact refs for AI-generated outputs | `MarketingAsset`, `AssetVersion`, blob refs, review state, approved/final version, audit |
| Upload | Opzava-owned | None required for file persistence; optional Atlas check run | File validation, object refs, metadata, review intent, approval creation |
| Atlas tag/check | Hybrid | Delegate-agent sessions, tools, artifacts, runtime state | Assignment admission, source scope, asset suggestions, check findings, policy/audit |
| Performance report | Hybrid | Optional agent analysis and runtime/source projections | Campaign/report read model, report artifact summary, goal/target/actual display |
| Ads report | Hybrid | Channel/provider metric reads through Gateway, sessions for Atlas analysis, artifacts | `ReportJob`, Ads `ReportArtifact`, period hash, metrics, narrative, recommendations, freshness |
| Email report | Hybrid | Email channel/provider metric reads through Gateway | Email `ReportArtifact`, consent/suppression summaries, metric polarity, send breakdown |
| Blog report | Hybrid | Blog/channel metric reads and Atlas draft generation | Blog `ReportArtifact`, content refs, generated CTA/content artifact refs |
| Report scheduling | Hybrid | Cron, TaskFlow, sessions, artifacts, task-ledger/runtime events | Workflow definition, report policy, trigger idempotency, budget/concurrency, report artifacts |
| Recommendation actions | Hybrid | Atlas run/proposal, provider/channel tools where admitted | Product command/proposal, approval checks, CRM/consent handoff, audit |
| Runtime traces | Hybrid | Runs, tasks, logs, tool calls, artifact refs | `WorkflowRun`, `RunStep`, redacted projections, user-visible status |
| Runtime config mutation | OpenClaw-native harnessed through provisioning | Gateway config, cron, TaskFlow, agent files | Opzava workflow/report source of truth, provisioning receipts, drift policy |

## Acceptance criteria

- Approvals renders Needs review, Changes requested, and Approved groups with correct counts, status/campaign filters, oldest-first active queue ordering, Send for review action, loading/empty/no-match/forbidden/offline/error states, and accessible row labels.
- Approval rows show target name, version, campaign, reviewer, age/SLA, Atlas flag state where applicable, and current action affordances.
- Approve is idempotent, provides pending feedback, moves the target to Approved, writes one Opzava `Approval` decision, emits audit/activity/events, and disables stale duplicate decisions.
- Request changes requires a note, writes the note to the approval and target review history, updates read models, and routes revision work to the owner or Atlas where applicable.
- Approving despite an Atlas compliance/source/brand flag requires confirmation and records the override in audit.
- Undo is offered only while policy says the decision is reversible and fails closed after schedule/publish consumption.
- Business approvals and mirrored runtime approvals can appear in one inbox while preserving the ADR-012 split of authority.
- No `ContentItem` can be scheduled/published without a matching approved Opzava approval for the exact version/hash, enforced at UI and command path.
- Send for review validates target version, reviewer selection, reviewer eligibility, due date, stale target state, and idempotency before creating an approval request.
- Send for review creates notifications/activity and returns the request to the approval queue with `Needs review` state.
- Assets renders campaign/type filters, filtered counts, recently approved strip, cards with file metadata and review state, Atlas-drafted labels, empty/no-match/loading/forbidden/offline/error states, and recent activity.
- Upload validates file presence, type, size, content hash, campaign, type metadata, review intent, authorization, and idempotency.
- Upload creates versioned asset records with object refs and hashes, never raw credentials or object-store secrets.
- Upload Send for review creates pending approval requests; Mark approved requires permission and records an approved decision for each uploaded version/hash.
- Atlas Tag & check is optional, admitted through policy, produces suggestions/findings/provenance, and never silently marks assets final.
- Asset replacement creates a new version and does not mutate prior approval history.
- Performance reads from authorized campaign/report projections and renders date-range updating state, count line, goal/target/actual/progress/trend, ended campaign distinction, and Needs attention state.
- Ads, Email, and Blog report pages render their stat cards, Atlas analysis, recommendation actions, breakdown tables, period filters, freshness/stale state, and footer navigation.
- Report numbers and narratives come from versioned `ReportArtifact` projections, not direct browser provider reads or ephemeral chat summaries.
- Re-run analysis creates a new `ReportArtifact` version and preserves historical versions.
- Report jobs record period hash, `asOf`, source cursors, freshness SLA, generated-by refs, provenance, artifact refs, and stale/partial state.
- Duplicate report trigger keys collapse and do not create report storms.
- Ads budget-shift, email segment/send, and blog CTA/content draft actions become governed product commands/proposals with audit and approvals where required.
- Metric trend meaning accounts for metric polarity, including inverted metrics such as spend and unsubscribe rate.
- Role revocation removes access to approvals, assets, report artifacts, and runtime/report detail on reload and realtime reconnect.
- Keyboard, screen-reader, and mobile behavior satisfy the UX walkthrough for dialogs, filters, chips, rows, uploads, reports, and actions.

## Testing decisions

- Tests should cover external behavior through application services, route/server actions, projection read models, and UI composition; they should not assert raw OpenClaw DTO shapes, provider payloads, or Gateway config files.
- The highest-value seam is the Marketing/Department Workflow application service that admits approval, send-review, upload, asset-version, report-job, report-action, and report-rerun commands.
- Approval tests should cover approve, request changes, required notes, flagged approval confirmation, stale approvals, expired approvals, superseded target versions, undo allowed/blocked, mirrored runtime prompt separation, and exact content hash enforcement before publish.
- Send-for-review tests should cover reviewer validation, reviewer eligibility, due/SLA metadata, idempotent duplicate requests, stale target rejection, notification/activity emission, and read-model projection.
- Asset tests should cover upload-created versions, Mark approved permission checks, Send for review intake, replacement creating new versions, cross-campaign assets, filters/counts, recent approved, activity feed, archive/delete linked-reference protection, and object-ref-only storage.
- Upload tests should cover no-file validation, file type/size/hash validation, duplicate file idempotency, per-file failure, campaign/type metadata, Atlas can detect suggestions, and pending-state behavior.
- Atlas tag/check tests should fake `OpenClawGatewayPort` and knowledge ports to assert assignment admission, allowed corpus scope, generated suggestions/findings, provenance capture, and no automatic approval.
- Report workflow tests should cover scheduled and manual report job creation, duplicate trigger collapse, ACL source reads through owning ports, stale/partial input state, failure/retry state, artifact write, artifact versioning, and latest-version projection.
- Ads report tests should cover metric mapping, spend polarity, ROAS/conversion calculations from fixtures, Atlas recommendation artifact refs, governed budget-shift proposal, rerun version creation, and stale source display.
- Email report tests should cover send metrics, unsubscribe inverted polarity, consent/suppression summary handoff, date filter busy state, Atlas recommendation refs, and rerun behavior.
- Blog report tests should cover post metrics, source attribution, CTA draft action creating a draft artifact/content work item, trend polarity, and rerun behavior.
- UI tests should cover Approvals grouping/filtering/actions, Send for review reviewer chips and validation, Assets filters/no-match/upload link, Upload staged file removal/radiogroup/validation, Performance date filter, and report action pending/done states.
- Accessibility tests should cover semantic groups/tables/dialogs, checkbox/radiogroup keyboard behavior, focus return, live regions, toast undo, trend labels, non-color status, and mobile layout containment.
- Security tests should cover authorization re-checks, role revocation, browser-supplied ref rejection, secret absence from rows/rendering, report narrative sanitization, provider payload redaction, tool-policy enforcement, and audit emission.
- Existing prior-art seams to follow are PRD-005 assistant/approval tests, PRD-006 automation/run trace tests, PRD-007 knowledge/upload/artifact tests, and PRD-008 Marketing campaign/content/calendar tests.

## Dependencies

- PRD-008 for Marketing dashboard, Campaign, Content Pipeline, Content Calendar, scheduling/publishing, and the `ContentItem` lifecycle/invariant this PRD operationalizes.
- ADR-005 for tool-policy-first security, Opzava approval rows as business gates, runtime approval separation, and standard-agent authority limits.
- ADR-012 for Department Workflow, `Workflow`, `Mechanism`, `WorkflowRun`, `RunStep`, `Approval`, `Campaign`, `ContentCalendar`, `ContentItem`, `ContentPipeline`, `ReportJob`, and `ReportArtifact`.
- ADR-008 AI Workforce for Atlas as a Marketing `AgentEmployee`, T2 behavior, assignment admission, channel bindings, persona attribution, and OpenClaw delegate-agent provisioning.
- ADR-010 Knowledge Management for authorized corpus overlays, source refs, generated artifacts, and optional asset/source promotion behavior.
- Project Management for marketing project shell, project membership, linked goals, project activity, and reusable card/detail surfaces where applicable.
- Internal Collaboration and Notifications for approval prompts, activity rows, realtime updates, inbox notifications, and push notifications.
- CRM/Customer Management for segment refs, materialized segment freshness, consent, suppression, unsubscribe metrics, and send-time eligibility checks.
- External Channels/Gateway Broker for provider/channel status, ACL-mediated metric reads, send/publish refs, and Gateway-owned channel credentials.
- Object Store/Knowledge Management for asset blob storage, previews/thumbnails where implemented, artifact refs, and content hashes.
- Tenant Provisioning/Platform-Ops for workflow/report provisioning jobs, admin-token usage, drift detection, and provision receipts.
- Billing/Plan limits for tenant, department, employee, workflow, report, budget, concurrency, and usage ceilings.
- Net-new design dependencies listed in the UX walkthrough for asset detail/review, report artifact history/detail, and governed report action confirmation/proposal screens.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
