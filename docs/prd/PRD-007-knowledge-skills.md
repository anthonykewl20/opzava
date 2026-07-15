# PRD-007: Knowledge, skills, docs/files, artifacts, and governed skill install

## Problem

Opzava needs one coherent product contract for the knowledge that people and AI employees rely on: project docs, notes, uploads, research links, ideas, AI-produced artifacts, published knowledge revisions, derived search/vector indexes, employee memory summaries, and executable skills.

Without this PRD, this slice can drift into unsafe or confusing product shapes:

- Docs, notes, uploads, and artifacts could be treated as loose attachments instead of Opzava-owned knowledge sources with provenance, authorization, review state, and corpus membership.
- OpenClaw `memory-wiki`, LanceDB, employee memory, or Gateway-local files could become the only copy of project or org knowledge, violating ADR-010's source-of-truth invariant.
- Project, employee, and org knowledge could blur, causing cross-project leakage or turning employee workspace memory into shared project facts without review.
- Uploads and AI artifacts could enter retrieval before sanitizer, source hashing, promotion, and corpus revision checks run.
- Discovery ideas could be mistaken for tasks or approved project decisions, bypassing the lightweight "ideas are for thinking" workflow.
- The Memory & Skills admin page could expose runtime internals, raw embeddings, raw Gateway config, hidden reasoning, or skill install authority that belongs behind admin provisioning.
- Skill install could become a tenant self-service or chat-driven action, bypassing `security.installPolicy`, verification, ADR-003 admin credential separation, ADR-005 tool policy, and audit.

The solution is an Opzava-owned Knowledge Management product surface and source model. Opzava owns source documents, notes, uploads, links, candidate entries, corpus revisions, artifact refs, idea records, skill catalog approvals, install policy decisions, verification receipts, and user-visible projections. OpenClaw remains harnessed for OKF import, `memory-wiki`, `memory-lancedb`, employee runtime memory, skill execution, and native runtime mechanisms. ADR-010 and ADR-008 are authoritative for architecture and scoping; this PRD defines the user-visible behavior, requirements, acceptance criteria, and testing decisions.

## Goals and Non-goals

### Goals

- Ship project Docs & Files as the everyday source-of-truth surface for documents, notes, uploads, files, links, drafts, and final knowledge candidates.
- Support upload and new-doc flows that stage files, collect review/promotion intent, preserve metadata, and optionally ask an AI employee to tag/check content.
- Support ideas capture in Discovery, including new idea, idea detail, tags, statuses, votes, discussion, research links, AI expansion, AI consensus, and connect-to-work decisions.
- Support admin Memory & Skills as a governance view for what the team knows, can do, and has made.
- Treat docs, notes, uploads, links, artifacts, and promoted candidates as Opzava source-of-truth records backed by Postgres plus object storage.
- Ingest published corpus revisions into rebuildable derived indexes through OKF and `KnowledgeIndexPort`.
- Preserve ADR-008 scoping: employee = workspace, project = shared corpus, org = corpus.
- Make project and org corpora read-only overlays resolved server-side for employee assignments and assistant turns.
- Keep employee memory distinct from project/org knowledge, with candidate promotion before shared corpus membership.
- Support artifact retention and traceability for AI-made outputs without automatically promoting every artifact into knowledge.
- Provide an admin-only curated skill catalog through `SkillCatalogPort`.
- Govern skill install/update with `security.installPolicy`, verification, provisioning receipts, tool-policy updates, and audit.
- Define data/API touchpoints by bounded context and ports without restating ADR architecture.
- Define OpenClaw-parity boundaries for native harnessed capabilities versus Opzava-owned product authority.
- Define acceptance and testing decisions at user-visible knowledge, ingestion, artifact, idea, and skill-governance seams.

### Non-goals

- Build OpenClaw `memory-wiki`, `memory-lancedb`, OKF importer, embedding engine, skill runtime, or Gateway internals.
- Redesign ADR-010 knowledge architecture or ADR-008 workforce scoping.
- Build the full Project Management experience, project boards, cards, goals, to-dos, schedules, updates, or Discovery board shell beyond the knowledge/idea flows in this PRD.
- Build Ask Opzava or project assistant chat. PRD-005 consumes corpus overlays, citations, artifacts, and candidate memory from this PRD.
- Build AI employee roster, employee detail, assignment/workload projections, automation, or run-evidence surfaces. PRD-006 consumes memory/skills/artifact summaries from this PRD and deep-links projections to their owning `pm.Card` or DevTicket.
- Build Department Workflow publishing, approval, campaign, content calendar, or report lifecycle beyond artifact and source refs used by knowledge surfaces.
- Build billing, storage quotas, embedding cost enforcement, or plan packaging beyond showing quota/policy states if supplied by owning contexts.
- Allow ordinary users, browser route handlers, assistant chats, or hot-path runtime tokens to call `skills.install`, `skills.update`, `skills.upload`, or direct Gateway config writes.
- Expose raw secrets, API keys, provider payloads, raw Gateway files, raw embeddings, hidden reasoning, unredacted tool output, or LanceDB internals in product screens.

## User Stories

1. As a project member, I want Docs & Files in the Essential project shell, so that project knowledge has a simple everyday home.
2. As a project member, I want Docs & Files to show every doc and file for the project, so that I do not have to search cards or chat for source material.
3. As a project member, I want Docs & Files to show type, title, size or metadata, author, updated time, and status, so that I can understand each item quickly.
4. As a project member, I want Docs & Files to distinguish Doc, File, Image, Link, Note, Draft, and Final, so that source material and working material are not confused.
5. As a project member, I want pinned docs to appear above the grid, so that important project knowledge is easy to find.
6. As a project member, I want filters for Type and Sort, so that I can narrow a large project library.
7. As a project member, I want recently updated sorting, so that current working material stays visible.
8. As a project member, I want Docs & Files to show item counts by type, so that I understand the project library shape.
9. As a project member, I want AI-drafted documents labeled with the employee who drafted them, so that authorship is accountable.
10. As a project member, I want human-edited and human-uploaded files labeled with the human actor, so that source provenance is clear.
11. As a project member, I want file cards to show Final or Draft status with text and glyph, so that status is not color-only.
12. As a project member, I want Recent activity for docs and files, so that I can see who uploaded, edited, drafted, or marked something final.
13. As a project member, I want docs/files visibility filtered by project authorization, so that private project knowledge does not leak.
14. As a project member, I want deleted or revoked docs to disappear from retrieval after the next corpus revision/index job, so that access changes are enforced.
15. As a project member, I want to upload files from Docs & Files, so that source material enters the project from the right context.
16. As a project member, I want upload to support drag, browse, staged files, remove, and upload count, so that I can review before submitting.
17. As a project member, I want upload validation when no files are staged, so that empty submissions do not create broken records.
18. As a project member, I want upload file limits and allowed types shown before submit, so that I know what will be accepted.
19. As a project member, I want each staged file to show name, size, readiness, and remove action, so that upload state is understandable.
20. As a project member, I want upload metadata such as campaign/context and type, so that files are useful after they land.
21. As a project member, I want "Atlas can detect" or equivalent AI tagging as an option, so that routine metadata can be suggested without blocking upload.
22. As a project member, I want to choose Send for review or Mark approved when files land, so that promotion intent is explicit.
23. As a reviewer, I want Mark approved to require permission, so that ordinary upload does not bypass review.
24. As a reviewer, I want Send for review uploads to create reviewable knowledge candidates, so that final knowledge is deliberate.
25. As a project member, I want Atlas or another eligible employee to tag and check uploads against project guidance only when I ask, so that AI work is user-triggered and auditable.
26. As a project member, I want AI tagging/checking results to become suggestions, not silent final metadata changes, so that humans can correct them.
27. As a project member, I want a new doc action, so that notes and written source material can be created without file upload.
28. As a project member, I want notes and docs to have source versions, author refs, and status, so that edits are traceable.
29. As a project member, I want docs/notes/uploads to become project corpus sources only after promotion or policy-approved finalization, so that drafts do not pollute retrieval.
30. As a project member, I want source docs to retain original blobs and normalized text, so that ingestion can be rebuilt.
31. As a project member, I want docs/files to show stale-index or rebuild-pending state, so that I know when AI search might lag the source.
32. As a project member, I want project assistant answers to cite authorized docs/files, so that I can verify the source.
33. As a project member, I want generated artifacts to appear as artifacts or docs candidates before promotion, so that useful output is preserved but not over-trusted.
34. As a project member, I want artifacts to link back to the run, employee, workflow, project item, or approval that produced them, so that provenance is reviewable.
35. As a project member, I want artifact versions to remain readable after OpenClaw runtime detail is pruned, so that useful deliverables do not disappear.
36. As a project member, I want evidence attachments and project knowledge to remain separate, so that temporary proof does not become long-term retrieval context automatically.
37. As a project member, I want Discovery to capture ideas before they become tasks, so that early thinking stays lightweight.
38. As a project member, I want New idea to ask "What's the idea?", so that capture is fast and sticky-note-like.
39. As a project member, I want an idea tag that groups related ideas, so that themes such as growth, onboarding, retention, and format are visible.
40. As a project member, I want suggested tag chips, so that tagging is quick but still controlled by me.
41. As a project member, I want Add to status choices such as New, Exploring, Decided, and Parked, so that idea maturity is explicit.
42. As a project member, I want the New idea dialog to say ideas are for thinking and have no owners or due dates, so that I do not confuse ideas with tasks.
43. As a project member, I want Atlas to offer idea expansion only after I press Expand, so that AI output is not presented as already done.
44. As a project member, I want idea expansion to show a working state before results, so that AI assistance feels honest.
45. As a project member, I want AI idea suggestions to support Add and Dismiss, so that I choose what becomes part of the idea.
46. As a project member, I want idea detail to show title, tag, status, source project, suggested-by actor, created time, and contributors, so that context is clear.
47. As a project member, I want idea contributors to include people and AI assistants distinctly, so that collaboration roles are visible.
48. As a project member, I want to vote on an idea, so that lightweight preference is captured.
49. As a project member, I want to build on an idea with flat comments, so that people can add thinking without nested task discussion.
50. As a project member, I want Research & notes on an idea, so that links and notes supporting the idea stay attached.
51. As a project member, I want to paste a link or write a note on an idea, so that research becomes source material.
52. As a project member, I want AI consensus to show each assistant's stance and a synthesized recommendation, so that multi-assistant input is transparent.
53. As a project member, I want to ask the AI panel again, so that stale recommendations can be refreshed.
54. As a project member, I want Make this the decision to require confirmation, so that changing status to Decided is deliberate.
55. As a project member, I want the confirmation to name the exact state change, so that I understand what will happen.
56. As a project member, I want Decided ideas to connect to a project, to-do, card, goal, doc, event, or new project where permitted, so that decisions become durable work.
57. As a project member, I want deciding an idea not to start AI execution automatically, so that research and work remain separate.
58. As an admin/full-shell user, I want Memory & Skills in the Govern rail, so that knowledge and skills governance has one admin home.
59. As an admin/full-shell user, I want Memory & Skills to summarize Memory entries, Skills, and Artifacts, so that team capability is scannable.
60. As an admin/full-shell user, I want Search knowledge, so that I can find a fact, source, artifact, skill, project, or employee quickly.
61. As an admin/full-shell user, I want Add knowledge, so that authorized admins can add or start source records from the governance surface.
62. As an admin/full-shell user, I want Memory rows to show Knowledge, Scope, Source, and Updated, so that each remembered fact has provenance.
63. As an admin/full-shell user, I want memory scope labels such as Global, project, employee, and organization, so that access and retrieval impact are clear.
64. As an admin/full-shell user, I want AI-added memory labeled with the employee source, so that agent contributions are accountable.
65. As an admin/full-shell user, I want employee memory to remain separate from project/org corpus truth, so that a session observation cannot silently become shared knowledge.
66. As an admin/full-shell user, I want candidate memory entries to show review and promotion state, so that I can decide whether they enter a corpus.
67. As an admin/full-shell user, I want corpus health to show current revision, index status, stale state, rebuild pending, and embedding drift, so that retrieval health is understandable.
68. As an admin/full-shell user, I want to see which project and org corpora are available to an employee assignment, so that knowledge scoping can be diagnosed.
69. As an admin/full-shell user, I want Skills rows to show skill name, used-by employee or local CLI, and status, so that executable capability is visible.
70. As an admin/full-shell user, I want enabled, disabled, update available, verification failed, policy denied, pending install, and drift statuses for skills, so that operational states are explicit.
71. As an admin/full-shell user, I want skills to come from a curated catalog, so that tenants and employees choose approved capabilities rather than arbitrary code.
72. As an admin/full-shell user, I want skill detail to show approved version, source/provenance, verification result, install policy, tool-policy impact, and provision receipt, so that risk is reviewable.
73. As an admin/full-shell user, I want to select catalog skills for tenant, project, department, or employee availability, so that capability can be scoped.
74. As an admin/full-shell user, I want install/update to run through an admin provisioning job, so that the browser and hot-path token never get install authority.
75. As an admin/full-shell user, I want skill installation to fail closed when `security.installPolicy` is missing or incompatible, so that ungoverned skills cannot run.
76. As an admin/full-shell user, I want skill verification to check approved provenance, version, checksum, signature where available, and manifest policy, so that executable code is not trusted blindly.
77. As a security reviewer, I want every skill install/update/uninstall attempt to record actor, target, policy decision, verification decision, rendered refs, Gateway refs, and receipt, so that audit can explain capability changes.
78. As a security reviewer, I want ordinary chat, employee sessions, and request handlers to be unable to call skill install/update/upload, so that runtime compromise cannot add new executable capability.
79. As a security reviewer, I want skill install to update or validate ADR-005 tool policy before use, so that new skills do not bypass allow/deny posture.
80. As a security reviewer, I want skill catalog reads and install actions to be admin-only and tenant-scoped, so that catalog visibility does not leak another tenant's approved capability set.
81. As an operator, I want OKF ingestion jobs to show pending, running, succeeded, failed, stale, drifted, scrub pending, and rebuild pending states, so that indexing is operable.
82. As an operator, I want ingestion dry-run diffs before apply, so that additions, updates, deletions, scope changes, sanitizer changes, and embedding-model changes are visible.
83. As an operator, I want OKF bundles to be content-addressed and tied to published corpus revisions, so that rebuilds are deterministic.
84. As an operator, I want delete/scrub jobs to supersede or remove derived wiki/vector rows, so that revocation and erasure are honored.
85. As an operator, I want index receipts to record corpus revision, embedding model version, sanitizer version, OKF hash, target index revision, and result, so that retrieval can be audited.
86. As an operator, I want assignment dispatch to resolve corpus overlays server-side, so that browser-supplied corpus refs are treated only as hints.
87. As an operator, I want project/org corpus unavailable states to block or degrade AI work clearly, so that employees do not fabricate context.
88. As an operator, I want role revocation to remove docs/files, idea, artifact, memory, skill, and corpus access on reload and realtime reconnect, so that stale clients fail closed.
89. As a screen-reader user, I want Docs & Files grids, upload dialog, idea dialog, idea detail, Memory tables, Skill tables, and artifact tables to expose semantic labels, so that the surfaces are usable without visual scanning.
90. As a keyboard user, I want filters, dialogs, staged file removal, tag chips, AI expansion, idea decision confirmation, tables, menus, and install actions to work without a mouse, so that knowledge governance is efficient.
91. As a mobile user, I want Docs & Files, upload, idea capture, idea detail, and Memory & Skills to collapse without hiding status or primary actions, so that the workflows remain usable on narrow screens.
92. As a product operator, I want every screen to render loading, empty, no-match, forbidden, stale, offline/reconnecting, validation error, and retry states, so that async knowledge/index/runtime states are normal product states.
93. As a developer, I want tests through application ports, routes/server actions, projectors, and UI composition, so that behavior is protected without coupling to OpenClaw internals.

## UX walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `memory-skills.html` | Full/admin Govern rail surface titled "Memory & Skills" with subtitle "What the team knows, can do & has made", Search knowledge and Add knowledge actions, summary stats for Memory entries, Skills, and Artifacts, Memory table with Knowledge/Scope/Source/Updated, scoped rows such as Global and project knowledge, human and AI source attribution, Skills table with skill name/Used by/Status, enabled status using glyph plus label, local CLI skills, Recent artifacts table with name/type/by/created, retained-artifact summary, loading/empty/no-match/forbidden/stale-index/error/offline states, and no raw embedding/Gateway/config/secret display. |
| `essential-docs.html` | Essential project Docs & Files surface with topbar, project breadcrumb, title "Docs & Files", copy "Every doc and file for this project, in one place.", Upload and New doc actions, Type and Sort menus, item counts, pinned docs strip, grid cards for docs/files/images with title, metadata, author, updated time, Draft/Final status, AI-drafted labels such as "Atlas drafted", recent activity feed, authorized project scope, and loading/empty/no-match/forbidden/stale-index/error/offline states. |
| `essential-upload.html` | Upload dialog over the project asset/docs context with "Upload to Assets" title, close/cancel, drag-or-browse drop zone, type and size guidance, staged file rows with name/size/ready/remove, campaign/context and type fields, "Atlas can detect" option, Send for review versus Mark approved radiogroup, optional Atlas tag-and-check offer, validation when no file is staged, pending upload state, and post-upload routing back to the project asset/docs surface. |
| `essential-idea.html` | Idea detail for one Discovery record with project breadcrumb, tag, Exploring/Decided status, title, suggested-by actor, contributor group with people and AI assistants, votes, Make this the decision, Move to, idea description, AI consensus panel with assistant stances and synthesized recommendation, Ask the panel again, Build on it comments, reply composer, Research & notes, paste-link/write-note action, decision hand-off note, confirmation dialog that names the Exploring to Decided state change, and connect-to-work behavior after decision. |
| `essential-idea-new.html` | New idea dialog over the Discovery board with "New idea" title, sticky-note idea textarea, tag field and suggested tag chips, Add to status select with New/Exploring/Decided/Parked, Atlas offer that generates only after Expand this idea is pressed, working state before AI results, Add/Dismiss suggestion actions, footer note "Ideas are for thinking - no owners or due dates here.", Cancel, Add idea, validation/error states, and no automatic task/workflow/agent execution on create. |

## Functional requirements

### Source-of-truth knowledge

- Knowledge Management must own Opzava knowledge sources, document versions, note versions, upload metadata, source blob refs, normalized content refs, candidate entries, published corpus revisions, ingestion jobs, index status, retrieval policy, and skill catalog selection policy.
- Opzava source records must live in Postgres plus object storage. OpenClaw `memory-wiki`, OKF-imported wiki pages, compiled summaries, embeddings, and LanceDB rows are derived indexes.
- Source records must store tenant, organization, optional project, source kind, title, MIME/type, size where applicable, content hash, sanitizer version, author/source actor, provenance, review state, status, corpus membership, and lifecycle/audit metadata.
- Source kinds must include docs, notes, uploads, links, imported web pages, CRM/channel-derived facts where allowed, AI artifacts, and candidate memory entries.
- Draft, Final, ReviewRequested, Approved, Rejected, Archived, Deleted, Promoted, Superseded, RebuildPending, IndexStale, and CorpusUnavailable states must be representable where applicable.
- Final or approved status must not automatically mean corpus membership unless product policy explicitly treats that status as promotion for the target surface.
- Promotion into project or org knowledge must create or update corpus membership and publish a new corpus revision.
- Removing a source, revoking access, changing scope, applying erasure, or invalidating content must create a new corpus revision and derived-index delete/scrub work.
- Browser-supplied project ids, source ids, corpus refs, file refs, or runtime refs must be treated as hints and re-authorized server-side.
- Search and retrieval must return only source records, snippets, artifacts, and corpus refs authorized for the current actor and target context.
- Knowledge surfaces must show stale, rebuilding, drift, unavailable, forbidden, and deleted/superseded states without treating them as UI failures.

### Docs, notes, uploads, and project files

- Docs & Files must list authorized project source records and attachment-like records through Knowledge Management queries with Project Management authorization.
- Docs & Files must support type filtering, sorting, pinned docs, item counts, Recent activity, and status labels.
- Upload must create staged source records only after server-side validation of actor, project, file type, size, content hash, and storage destination.
- Upload must store original blob refs and normalized text/extraction refs separately where extraction is supported.
- Upload must support multiple files with idempotent submit semantics so retries do not create duplicate source records.
- Upload metadata fields must become source metadata and must be editable only by authorized actors.
- AI type detection, tagging, and brand/project checks must run as optional assignments or workflow actions and must return suggestions, confidence, and source refs.
- "Send for review" must create reviewable source/candidate state and notify or route to the owning review surface where configured.
- "Mark approved" must require an authorization check and must record actor, time, version/content hash, and policy basis.
- New doc/note creation must produce a versioned source record with author, project, content hash, status, and corpus-promotion eligibility.
- Docs/files activity must be projected from source events, upload events, review decisions, artifact promotion, and AI drafting/checking events.
- Docs/files must preserve enough metadata for project assistants to cite source records without exposing raw object-store paths.

### Ideas and Discovery knowledge

- Project Management must own Discovery idea records, status, tags, votes, comments metadata, research refs, AI suggestion refs, decision state, and connect-to-work commands.
- Knowledge Management must own research notes/links/files attached to ideas when those records become source material or promotion candidates.
- Idea creation must require project authorization and must not create owners, due dates, assignments, workflows, approvals, or runtime work by default.
- Idea statuses must include New, Exploring, Decided, and Parked.
- Idea tags must be scoped to the project and searchable within authorized project context.
- AI idea expansion must run only after explicit user action and must create suggestions that can be accepted or dismissed.
- AI consensus must show contributing employee/persona, stance, caveats, generated summary, source refs where available, and freshness.
- AI suggestions and consensus summaries must be artifacts or suggestion records, not direct edits to source truth unless accepted.
- Make-this-the-decision must require confirmation, be idempotent, and record the old state, new state, actor, and time.
- Decided ideas may connect to a project, to-do, `pm.Card`, goal, doc, event, or new project only through the owning context command and authorization.
- Research links or notes attached to an idea may become knowledge candidates but must not enter project corpus retrieval until promoted through Knowledge Management policy.

### Corpus scoping and retrieval

- Knowledge scoping must follow ADR-008: employee = workspace, project = shared corpus, org = corpus.
- Employee workspace memory must remain distinct from project and org corpus source records.
- An employee assignment or assistant turn must resolve authorized `projectCorpusRef` and `orgCorpusRef` overlays server-side from tenant, actor, employee, project, assignment, and corpus revision.
- A project corpus overlay must be read-only to the employee runtime.
- An org corpus overlay must be read-only to the employee runtime.
- Runtime memory writes may land in employee workspace memory or in Opzava candidate-KB flow, but must not directly mutate project or org corpora.
- Candidate KB entries from chats, runs, documents, tools, CRM/channel inputs, or employee observations must carry source refs, classification, content hash, sanitizer version, author/source actor, and review state.
- Promoting a candidate into project or org knowledge must create a new source version or corpus membership update and publish a new corpus revision.
- Retrieval must record which corpus revision, source revision, sanitizer version, index revision, and embedding model version informed a response where citation/audit is needed.
- Cross-project requests must either use safe authorized project summaries or resolve separate project-scoped overlays; they must not merge raw corpora into one broad prompt by default.
- Missing, stale, drifted, or unauthorized corpus overlays must block or degrade assistant/employee work with user-visible reason codes.

### OKF ingestion and derived indexes

- Published corpus revisions must export versioned, content-addressed OKF bundles for derived index ingestion.
- OKF bundles must include tenant, corpus kind, corpus id, source refs, source versions, normalized content, metadata, provenance, sanitizer version, content hashes, corpus revision ids, and retrieval metadata.
- `KnowledgeIndexPort` must own OKF import, rebuild, health, drift detection, delete/scrub, and index-status reads against OpenClaw `memory-wiki` and `memory-lancedb`.
- Ingestion jobs must be idempotent by tenant, corpus scope, source id, source version, sanitizer version, content hash, embedding model version, and target index revision.
- Ingestion must support dry-run diff before apply for additions, updates, deletions, missing source blobs, stale index rows, scope changes, sanitizer changes, and embedding-model changes.
- Apply must write an index receipt with corpus revision, OKF hash, index revision, embedding model metadata, target Gateway/index refs, result, and actor/job refs.
- Rebuilds must be able to recreate derived indexes from Opzava source truth without reading Gateway-local wiki/vector state as authority.
- Embedding model, chunking, sanitizer, retrieval metadata, or provider changes must create a new index revision and mark older indexes as stale or superseded.
- Delete/scrub jobs must remove or supersede derived wiki/vector rows after source deletion, access revocation, scope change, or erasure.
- Index health must be visible to user-facing surfaces as fresh, stale, rebuild pending, rebuilding, drift detected, failed, or unavailable.

### Artifacts

- Artifacts must represent outputs produced by AI employees, workflows, assistants, uploads, report jobs, or approved user actions.
- Artifact records must include tenant, optional project/work target, source aggregate refs, producing actor or employee, artifact type, title, version, content/storage refs, status, created time, provenance, and authorization scope.
- Artifact types must include doc, blog draft, report, image, email, spreadsheet, file, summary, extract, suggestion, and evidence where applicable.
- Artifacts must not automatically become project or org knowledge.
- Promotion from artifact to project/org knowledge must create a Knowledge Management source/candidate flow and corpus revision update.
- Artifacts attached to cards, workflows, reports, approvals, ideas, or assistant turns must remain readable through Opzava refs after runtime pruning, subject to retention policy.
- Artifact lists must show type, by, created, status, source refs, and provenance without exposing raw provider payloads, hidden reasoning, raw tool output, or Gateway-local file paths.
- Artifact deletion, archiving, promotion, supersession, and access revocation must update search/retrieval projections and audit.

### Memory & Skills admin surface

- Memory & Skills must be available only to authorized full/admin shell actors.
- Memory summary must compose Opzava source/candidate/corpus projections and safe employee memory summaries without exposing raw vector or runtime memory internals.
- Memory rows must show knowledge text/summary, scope, source actor/employee, updated time, review/promotion state where applicable, and freshness/index status where useful.
- Memory search must cover source text/summary, project, org, employee, source actor, source kind, status, artifact, and corpus revision within authorization.
- Skills summary must show curated skills, enabled/disabled state, target employees or local clients, status, version, and verification/install health.
- Recent artifacts must show retained artifacts with type, producer, created time, source/workflow/run refs, and promotion status.
- Add knowledge from admin must create a source/candidate through Knowledge Management commands and must not write OpenClaw wiki/vector state directly.
- Memory & Skills must not expose raw embeddings, LanceDB paths, raw OKF payloads, raw Gateway config, skill source code by default, raw secrets, or hidden reasoning.

### Curated skill catalog and governed install

- `SkillCatalogPort` must expose only Opzava-approved catalog entries, approved versions, verification metadata, install policy requirements, selection rules, and tenant/project/employee availability.
- Catalog reads and selection changes must be admin-only and tenant-scoped.
- Skill install, update, uninstall, repair, or upload must run only through audited admin/provisioning jobs with the ADR-003 admin credential.
- Ordinary request handlers, assistant chats, employee sessions, hot-path broker runtime work, and normal users must not call `skills.install`, `skills.update`, `skills.upload`, or direct Gateway skill mutation.
- Every install/update must evaluate `security.installPolicy` before provisioning.
- Missing, incompatible, expired, or policy-denied `security.installPolicy` must fail closed.
- Verification must check approved provenance, package/source identity, version, checksum, signature where available, manifest shape, declared permissions, dependency policy, and tool-policy impact.
- Provisioning must record a receipt with actor, tenant, target, skill id/version, verification result, policy result, rendered refs, Gateway refs, checksum/signature/provenance evidence, result, and drift metadata.
- Installing a skill must validate or update the effective ADR-005 tool policy before the skill becomes callable.
- Skills must be selectable for tenant, project, department, employee, or local CLI visibility only where the catalog entry allows that scope.
- Skill update must show changed permissions, changed source/provenance, changed checksum, changed install policy, and required reprovisioning before apply.
- Skill drift detection must compare Opzava catalog/selection state with runtime installed state and surface drift without making runtime state the source of truth.
- Skill verification failure, policy denial, runtime unavailable, Gateway unavailable, and provision failed must render as normal states with retry/repair paths where authorized.

### Access, security, and audit

- Every read must be authorized against active tenant, organization membership, shell mode, project membership, role grants, source scope, artifact scope, idea scope, employee scope, and admin-only status where applicable.
- Every mutation must re-check authorization at action time and carry an idempotency key.
- Source uploads must not persist secrets in source content metadata, generated setup instructions, logs, or UI state.
- Object storage credentials, LanceDB credentials, provider credentials, channel credentials, and install credentials must use the existing secrets/config mechanism and be represented only by refs or health labels.
- Tool and skill policy decisions must follow ADR-005, with deny winning over persona or workflow intent.
- Content rendering must sanitize user content, file names, links, notes, AI suggestions, artifact titles, skill names, source labels, and generated summaries.
- Audit rows must cover source create/edit/delete, upload, review, approval, promotion, corpus revision publish, OKF export/import, index rebuild, delete/scrub, idea create/update/decision, artifact create/promote/delete, catalog selection, skill verification, skill install/update/uninstall/repair, policy denial, and access revocation.
- Access revocation must remove docs/files, idea, artifact, Memory & Skills, corpus, skill, and live ingestion/install status access on fetch and realtime reconnect.

### Accessibility and responsive behavior

- Docs & Files grids must expose item names, type, status, author, and actions semantically.
- Upload dialogs must trap focus, label file inputs/drop zone, expose staged files, announce validation errors, and preserve focus after remove/submit.
- Idea dialogs and decision confirmations must use dialog/alertdialog semantics and return focus to the invoking control.
- AI expansion and upload/install pending states must use polite live regions.
- Memory, Skills, and Artifacts tables must use captions, headers, keyboard navigation, and status labels that do not rely on color alone.
- Mobile/narrow layouts must preserve project context, filters, primary actions, status labels, staged files, AI suggestions, and table/list detail without text overlap.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Docs & Files listing | Knowledge Management with Project Management authorization | Project source records, document metadata, upload metadata, source blob refs, status, pinned refs, activity projection, corpus membership/index status | `KnowledgeSourcePort`, `AuthorizationPort`, `ObjectStorePort`, `EventBusPort` |
| New doc/note | Knowledge Management | Source create command, versioned content, author, project scope, content hash, status, candidate/promotion state | `KnowledgeSourcePort`, `AuthorizationPort`, `ObjectStorePort`, `EventBusPort` |
| Upload dialog | Knowledge Management with Object Storage | File validation, staged upload refs, source metadata, campaign/context labels, type detection option, review intent, idempotent submit | `ObjectStorePort`, `KnowledgeSourcePort`, `AuthorizationPort`, `EventBusPort` |
| AI tag/check for uploads | AI Workforce with Knowledge Management | Optional assignment, selected employee, source refs, suggested metadata, brand/project check results, candidate updates | `AuthorizationPort`, `OpenClawGatewayPort`, `KnowledgeSourcePort`, `EventBusPort` |
| Review/promotion | Knowledge Management with Department Workflows where approval is required | Candidate entries, review decisions, approval refs, published corpus revision, promotion audit | `KnowledgeSourcePort`, `AuthorizationPort`, `EventBusPort` |
| Corpus revisions | Knowledge Management | Project corpus, org corpus, source membership, revision ids, source hashes, policy state, publish lifecycle | `KnowledgeSourcePort`, `AuthorizationPort`, `EventBusPort` |
| OKF export/import | Knowledge Management with OpenClaw runtime adapter | OKF bundle, import job, dry-run diff, rebuild, delete/scrub, index receipt, health/drift status | `KnowledgeIndexPort`, `KnowledgeSourcePort`, `EmbeddingProviderPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Embeddings and vector indexes | Knowledge Management | Embedding model metadata, batch embedding, index revision, drift policy, provider replacement | `EmbeddingProviderPort`, `KnowledgeIndexPort`, `EventBusPort` |
| Assignment corpus overlays | AI Workforce with Knowledge Management | Employee workspace, authorized project corpus ref, org corpus ref, corpus revision, retrieval policy, assignment refs | `AuthorizationPort`, `KnowledgeSourcePort`, `KnowledgeIndexPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Candidate employee memory | Knowledge Management with AI Workforce | Runtime observation refs, employee memory refs, candidate KB entries, review state, promotion source refs | `KnowledgeSourcePort`, `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Discovery idea create/detail | Project Management | Idea records, status, tags, votes, comments metadata, contributors, decision state | `AuthorizationPort`, `EventBusPort`, optionally `KnowledgeSourcePort` for research refs |
| Idea research links/notes | Project Management with Knowledge Management | Link/note refs, source candidates, provenance, authorized snippets, promotion eligibility | `KnowledgeSourcePort`, `AuthorizationPort`, `EventBusPort` |
| AI idea expansion/consensus | AI Workforce with Project Management | Explicit user trigger, assignment refs, suggestion artifacts, panel stances, source refs, accepted/dismissed state | `AuthorizationPort`, `OpenClawGatewayPort`, `KnowledgeSourcePort`, `EventBusPort`, `RealtimeTransportPort` |
| Connect decided idea to work | Project Management | Connect command, target project/to-do/card/goal/doc/event/new-project refs, old/new idea state, audit | `AuthorizationPort`, `EventBusPort` |
| Artifact catalog | Knowledge Management with contributing contexts | Artifact refs, type, source aggregate refs, producing actor/employee, storage refs, promotion status, retention state | `KnowledgeSourcePort`, `AuthorizationPort`, `ObjectStorePort`, `EventBusPort` |
| Memory & Skills admin summary | Knowledge Management with AI Workforce and Runtime Control inputs | Memory/source summaries, corpus health, skill summary, artifact summary, safe employee memory refs | `KnowledgeSourcePort`, `KnowledgeIndexPort`, `SkillCatalogPort`, `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Skill catalog | Knowledge Management | Curated entries, approved versions, provenance, verification metadata, allowed scopes, install policy requirements | `SkillCatalogPort`, `AuthorizationPort`, `EventBusPort` |
| Skill install/update/uninstall | Knowledge Management with Tenant Provisioning and Runtime Control | Admin provisioning job, `security.installPolicy`, verification result, provision receipt, runtime refs, tool-policy impact, drift state | `SkillCatalogPort`, `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Skill tool-policy impact | Runtime Control with Knowledge Management | Effective tool policy, approval-needed flags, skill permissions, callable state, policy decision audit | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Notifications/activity | Internal Collaboration and Notifications/Admin-Observability | Review requests, upload completions, corpus/index status changes, idea decisions, artifact promotions, skill install results | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Audit | Audit/Security with contributing contexts | Immutable audit rows for knowledge, corpus, index, idea, artifact, catalog, install, policy, verification, and access decisions | `AuthorizationPort`, `EventBusPort` |

## Implementation decisions

- Model docs, notes, uploads, links, candidate entries, corpus revisions, index jobs, artifacts, and skill catalog state from Opzava read/write models; do not expose OpenClaw memory/wiki/vector rows as browser DTOs.
- Keep Project Management responsible for Discovery ideas, statuses, votes, comments metadata, and connect-to-work commands; Knowledge Management owns research/source refs when idea material becomes source knowledge or a promotion candidate.
- Use Knowledge Management as the source-of-truth boundary for docs/files/uploads and artifact promotion, even when a project card, workflow run, assistant turn, or report produced the material.
- Treat object storage refs, OKF bundle refs, index refs, OpenClaw refs, and Gateway refs as opaque value objects in product DTOs.
- Publish project and org corpus revisions from Opzava source records before derived-index ingestion; runtime index state must never be the source of corpus truth.
- Use OKF as the ingestion boundary artifact and `KnowledgeIndexPort` as the only product-facing derived-index interface.
- Make every ingestion/rebuild/delete/scrub job idempotent and content-addressed by source version, sanitizer version, content hash, corpus revision, embedding model version, and target index revision.
- Resolve project and org corpus overlays server-side during assistant/assignment admission; browser-provided corpus or source refs are hints only.
- Keep employee workspace memory in the employee/runtime lane and route shared-knowledge changes through candidate KB review and promotion.
- Represent artifacts as durable Opzava refs with provenance and retention state; require explicit promotion before an artifact becomes project or org retrieval knowledge.
- Keep AI tagging, AI idea expansion, and AI consensus as explicit user-triggered suggestions or artifacts until the user accepts or promotes them.
- Expose Memory & Skills as a safe governance projection: show scope, source, status, verification, receipts, and health rather than raw embeddings, Gateway config, skill source, or runtime internals.
- Gate skill catalog selection and skill install/update/uninstall behind admin authorization and admin/provisioning jobs.
- Enforce `security.installPolicy` and verification before skill provisioning; missing or incompatible policy fails closed.
- Validate or update the effective ADR-005 tool policy before a newly installed or updated skill becomes callable.
- Emit audit and activity/notification events from knowledge, corpus, index, idea, artifact, and skill mutations through the existing outbox/event paths.

## OpenClaw-parity notes

| Feature area | Classification | Native harnessed vs Opzava-owned decision |
| --- | --- | --- |
| Docs, notes, uploads, and links | Opzava-owned | Source metadata, source blobs, normalized text refs, versions, review state, corpus membership, authorization, and audit are Opzava truth. |
| Object storage | Opzava-owned adapter | Object storage holds source blobs/artifacts behind Opzava refs and authorization. Raw storage paths and credentials are not product identity. |
| Project corpus | Opzava-owned source, native harnessed index | Project corpus revisions are Knowledge Management truth. OpenClaw wiki/vector state is a rebuildable projection. |
| Org corpus | Opzava-owned source, native harnessed index | Organization corpus revisions are Opzava truth and may overlay employee sessions only after server-side authorization. |
| Employee workspace memory | Native harnessed with Opzava candidate flow | OpenClaw owns employee workspace memory runtime. Shared project/org knowledge requires Opzava candidate review and promotion. |
| OKF bundles | Hybrid boundary artifact | Opzava exports content-addressed OKF bundles from published corpus revisions. OpenClaw imports OKF through harnessed adapters. |
| `memory-wiki` | Native harnessed | OpenClaw owns wiki/index mechanics. Opzava owns source records, corpus revisions, import receipts, and index health projections. |
| `memory-lancedb` | Native harnessed | LanceDB/vector rows are derived index storage. Opzava owns source truth, embedding metadata, drift policy, and rebuild/delete jobs. |
| Retrieval citations | Opzava-owned presentation with native inputs | Product surfaces cite Opzava source refs and corpus/index revisions, not raw Gateway paths or vector row ids. |
| Discovery ideas | Opzava-owned | Idea records, votes, comments metadata, statuses, decision state, and connect-to-work commands are Project Management state. |
| AI idea expansion/consensus | Hybrid | AI Workforce/OpenClaw can produce suggestions through assignments. Accepted/dismissed suggestions and idea edits are Opzava-owned. |
| Artifacts | Opzava-owned refs with native inputs | Runtime may produce files/results, but Opzava owns user-visible artifact refs, provenance, retention, promotion, and authorization. |
| Skill catalog | Opzava-owned | Curated skills, approved versions, allowed scopes, verification metadata, and install policy live behind `SkillCatalogPort`. |
| Skill runtime | Native harnessed | OpenClaw owns installed skill execution. Opzava provisions verified skills and projects installed/drift status. |
| Skill install/update | Opzava-governed native provisioning | Install uses admin/provisioning jobs and `operator.admin`; ordinary runtime/chat cannot install or update skills. |
| `security.installPolicy` | Opzava-governed enforcement input | Policy is evaluated before install/update and fail-closed when missing or incompatible; receipts and audit are Opzava-owned. |
| Tool policy impact | Opzava-governed native harness | ADR-005 policy remains enforceable at Gateway/runtime while Opzava displays decisions and audits skill/tool capability changes. |

## Acceptance criteria

- Docs & Files renders in the Essential project shell with breadcrumb, title, Upload, New doc, filters, item counts, pinned docs, card grid, Draft/Final labels, AI attribution, Recent activity, and async states.
- Docs & Files shows only source records the actor can access for the selected project.
- Upload supports drag/browse, staged files, remove, file count, metadata fields, type detection option, review/approved intent, validation error for empty submit, pending state, and idempotent submit.
- Upload creates Opzava source records and object-store refs without direct OpenClaw wiki/vector writes.
- Send for review creates reviewable candidates; Mark approved requires permission and records actor/version/hash.
- Optional AI tag/check runs only after explicit user action and returns suggestions without silently changing final metadata.
- New doc/note creates a versioned source record with project scope, author, status, content hash, and promotion eligibility.
- Drafts, evidence, and artifacts do not enter project/org corpus retrieval unless promoted by policy or review.
- Promoting a source creates a new corpus revision and an ingestion/index job.
- Deleting, revoking, or changing source scope creates a corpus revision and delete/scrub index work.
- OKF export/import jobs are idempotent, content-addressed, and tied to published corpus revisions.
- Ingestion dry-run shows additions, updates, deletions, scope changes, sanitizer changes, embedding model changes, missing source blobs, and stale index rows.
- Index receipts record corpus revision, OKF hash, embedding model metadata, target index revision, result, and job refs.
- Docs/files and assistant citations show stale/rebuild/drift/unavailable states where corpus/index projections lag source truth.
- Assignment dispatch resolves project/org corpus overlays server-side and fails closed for unauthorized or missing corpus refs.
- Employee memory observations become employee memory or candidate KB entries, not direct project/org corpus writes.
- Candidate KB promotion records source refs, review state, corpus membership, revision, and audit.
- New idea dialog captures idea text, tag, status, optional AI expansion, working state, Add/Dismiss suggestions, Cancel, Add idea, and validation states.
- New idea does not create assignments, owners, due dates, workflows, approvals, or runtime work by default.
- Idea detail renders tag, status, suggested-by actor, contributors, votes, description, AI consensus, comments, research/notes, decision note, and confirmation dialog.
- AI idea expansion/consensus requires explicit trigger, shows assistant attribution, and stores suggestions/artifacts with accept/dismiss state.
- Make-this-the-decision is confirmed, idempotent, audited, and does not start work automatically.
- Decided ideas can connect to authorized project work through Project Management commands.
- Artifacts list with type, producer, created time, source refs, retention state, and promotion state.
- Artifacts remain readable through Opzava refs after runtime pruning, subject to authorization and retention.
- Artifact promotion creates a Knowledge Management source/candidate flow before corpus membership.
- Memory & Skills renders in the full/admin shell with summary stats, Search knowledge, Add knowledge, Memory table, Skills table, Recent artifacts table, and async states.
- Memory rows show knowledge summary, scope, source actor/employee, updated time, promotion/review state where applicable, and no raw embeddings.
- Skills rows show skill name, used-by targets, status, version/verification where available, and no raw secrets or Gateway config.
- Skill catalog reads are admin-only and tenant-scoped.
- Skill install/update/uninstall/repair creates an admin provisioning job and never runs from ordinary chat, employee sessions, browser route handlers, or hot-path runtime tokens.
- Skill install/update fails closed when `security.installPolicy` is missing, incompatible, expired, or denied.
- Skill verification checks approved provenance, source/package identity, version, checksum, signature where available, manifest shape, declared permissions, dependencies, and tool-policy impact.
- Skill provisioning writes immutable receipts with actor, target, policy result, verification result, Gateway refs, rendered refs, and result state.
- Skill install/update validates or updates effective ADR-005 tool policy before the skill becomes callable.
- Skill drift, verification failure, policy denial, Gateway unavailable, provision failed, and repair states render as normal product states.
- No product screen renders raw secrets, raw provider payloads, raw Gateway config, raw vector rows, raw LanceDB paths, hidden reasoning, or unredacted tool output.
- Role revocation removes access to docs/files, ideas, artifacts, Memory & Skills, corpus/index status, and skill details on reload or realtime reconnect.
- Statuses use text labels or glyph plus label and do not rely on color alone.
- Upload dialog, idea dialog, decision confirmation, filters, tag chips, staged file rows, tables, and install actions are keyboard and screen-reader accessible.
- Mobile layouts preserve context, source status, primary actions, staged files, AI suggestions, and details without overlap.

## Testing decisions

- Test at the highest product seams: Knowledge Management commands/queries, Project Management idea commands, AI Workforce suggestion hand-offs, authorization-gated routes/server actions, projector/read-model behavior, and UI composition for the named mockups.
- Tests should assert external behavior: visible docs/files, authorized filtering, upload validation, source records, promotion state, corpus revision publish, ingestion status, idea states, artifact refs, catalog policy decisions, skill install receipts, and audit/event emissions.
- Do not test OpenClaw protocol internals, LanceDB internals, OKF parser internals, or skill runtime implementation in product UI/domain tests. Use port fakes, receipts, and projected runtime/index fixtures.
- Docs & Files tests must cover type filtering, sorting, pinned docs, item cards, Draft/Final labels, AI attribution, Recent activity, empty/no-match/forbidden/stale-index states, and authorization filtering.
- Upload tests must cover staged files, remove, empty submit validation, file type/size validation, idempotent submit, Send for review, Mark approved permission checks, optional AI tag/check trigger, and no direct index writes.
- Source/promotion tests must cover create/edit/delete, versioning, content hash, sanitizer version, review state, corpus membership, corpus revision publish, access revocation, delete/scrub scheduling, and stale projection labels.
- OKF/index tests must cover content-addressed bundle identity, dry-run diff, idempotent apply, index receipt projection, embedding model drift, sanitizer change, rebuild pending, delete/scrub, failed import, and Gateway unavailable.
- Corpus-scope tests must cover employee workspace versus project corpus versus org corpus, server-side overlay resolution, unauthorized browser-supplied refs, cross-project leakage prevention, stale/unavailable corpus degradation, and candidate memory promotion.
- Idea tests must cover create, tag chips, status selection, AI expansion working state, Add/Dismiss suggestions, votes, comments, research links, AI consensus, decision confirmation, idempotent Decided transition, and connect-to-work authorization.
- Artifact tests must cover artifact creation from assistant/workflow/upload/report, provenance refs, retention after runtime pruning, listing, authorization filtering, promotion to source candidate, deletion/archive, and raw payload redaction.
- Memory & Skills tests must cover summary stats, memory table scope/source/updated columns, search, corpus/index health labels, skill rows, status labels, recent artifacts, admin-only access, no raw embeddings, and no raw Gateway config.
- Skill catalog tests must cover admin-only reads, approved versions, allowed scopes, selection changes, install policy requirements, verification metadata, and tenant scoping.
- Skill install/update tests must cover provisioning job creation, `security.installPolicy` fail-closed behavior, provenance/checksum/signature/manifest verification, tool-policy impact, provision receipts, drift detection, repair, duplicate submit idempotency, and unauthorized mutation denial.
- Security tests must cover no secrets in DTOs, no raw provider payloads, no raw Gateway config, no raw vector internals, credential refs only, stale session mutation denial, role revocation, sanitized rendering, and immutable audit rows.
- Realtime/projection tests must cover reconnect backfill, duplicate events, out-of-order ingestion receipts, stale source/index updates, upload pending completion, skill install status updates, and one user-visible state per idempotency key.
- Accessibility tests must cover semantic grids/tables, dialog focus trap/return, upload validation announcement, AI working live region, tag chip keyboard behavior, decision confirmation, non-color status labels, and mobile text containment.

## Dependencies

- ADR-010: Knowledge Management source of truth, OKF ingestion, derived indexes, `KnowledgeSourcePort`, `KnowledgeIndexPort`, `EmbeddingProviderPort`, and `SkillCatalogPort`.
- ADR-008: AI Workforce scoping model, employee workspace, project corpus overlay, org corpus overlay, `AgentEmployee`, `Assignment`, and candidate memory behavior.
- ADR-005: Tool-policy-first security, approval gates, install policy posture, deny-wins behavior, and tool-invocation audit.
- ADR-003: Gateway broker ACL, two-token model, admin/provisioning credential, hot-path runtime token, opaque OpenClaw refs, and no direct Gateway access.
- ADR-004: Data boundary, hybrid CQRS, outbox, projection reconciliation, snapshots, and Opzava Postgres as product system of record.
- ADR-007: Resource-scoped RBAC, roles-as-data, Postgres RLS, fail-closed tenant/project/source access, and revocation behavior.
- ADR-009: Realtime transport, reconnect/backfill, Activity/notification fan-out, and Web Push consumers for knowledge/index/install status.
- ADR-012: Department Workflow approvals, reports, generated content lifecycle, workflow artifacts, provisioning receipts, and run limiter where knowledge flows intersect workflows.
- PRD-002: App shell, Essential top bar, full/admin rail, command search, notifications, shell async states, and responsive navigation.
- PRD-003: Projects, Docs & Files entry point, Discovery, project source refs, card evidence, project authorization, and connect-to-work commands.
- PRD-004: Internal Collaboration, Activity, notifications, review prompts, assistant hand-offs, and Web Push delivery.
- PRD-005: Ask Opzava and project assistant conversations that consume authorized corpus overlays, citations, artifacts, and candidate memory.
- PRD-006: Agent roster/detail Memory tab, assignment/workload and run-evidence artifact refs that deep-link to their owning `pm.Card` or DevTicket, tool catalog adjacency, and employee memory/skills summaries.
- Object storage adapter and secrets/config mechanism for source blobs, artifacts, LanceDB/index storage credentials, and no hardcoded credentials.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
