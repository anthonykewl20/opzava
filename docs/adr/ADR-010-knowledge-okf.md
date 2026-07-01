# ADR-010: Knowledge Management, OKF ingestion, and admin skill catalog

Status: Accepted

Opzava will own project and organization knowledge as source documents in Postgres plus object storage, while OpenClaw `memory-wiki` and `memory-lancedb` are rebuildable derived indexes. Knowledge is ingested through versioned OKF bundles and `wiki okf import`, scoped as employee workspaces with project and org corpus overlays, and governed through an admin-only curated skill catalog.

## Context

ADR-003 puts all OpenClaw runtime access behind the `gateway-broker`, splits the hot-path `operator.write` + `operator.approvals` token from short-lived provisioning `operator.admin`, and requires OpenClaw refs and protocol details to stay behind the ACL. ADR-005 makes tool policy, approval gates, install policy, and audit the enforcement boundary for agent authority. ADR-008 makes AI employees OpenClaw delegate agents and revises knowledge scoping to: employee = workspace, project = shared corpus, org = corpus.

Q4b originally considered one OpenClaw workspace per project because memory, wiki, and skills are workspace-shaped in OpenClaw. Q8 supersedes that mapping. An employee workspace carries persona files, personal memory-lancedb, skills, sessions, and agent-specific state across all work. A project contributes an authorized read-only shared corpus overlay to an assignment. An organization contributes an org corpus overlay. Project knowledge is not employee identity, and employee memory is not project knowledge.

OpenClaw owns runtime memory/wiki/vector mechanics, but Opzava owns the business knowledge that users upload, edit, approve, scope, revoke, and audit. If OpenClaw `memory-wiki` or LanceDB state becomes the only copy, Gateway reprovisioning, vector corruption, embedding-model drift, accidental auto-capture, or tenant teardown can permanently change the product knowledgebase outside Opzava's domain controls.

The product also needs a vendor-agnostic ingestion boundary. OpenClaw's OKF import path is useful because it can carry documents, wiki pages, metadata, hashes, provenance, and corpus shape without making the Knowledge Management domain depend on LanceDB internals, local Gateway files, or one embedding provider. Replacing OpenClaw indexing, LanceDB storage, or an embedding model should change adapters and rebuild jobs, not the project knowledge source model.

Skills are a related but higher-risk knowledge surface. Skills are executable code and `skills.install` requires `operator.admin`. Letting tenants, projects, or employees self-install arbitrary ClawHub skills would bypass the ADR-003 token split and weaken ADR-005's tool-policy-first posture. Opzava needs a curated catalog and audited provisioning flow instead of treating skill installation as ordinary runtime chat behavior.

## Decision

Create a Project Knowledge Management bounded context. It owns Opzava knowledge sources, document versions, corpus revisions, ingestion jobs, source blob refs, provenance, promotion state, index status, retrieval policy, and skill catalog selection policy in Opzava Postgres and object storage. OpenClaw memory/wiki/vector state remains a runtime projection reached only through the broker and provisioning paths.

Use these ports:

- `KnowledgeSourcePort` for Opzava-owned knowledge documents, metadata, source blobs, candidate entries, revisions, corpus membership, promotion state, and published KB revisions.
- `KnowledgeIndexPort` for derived-index operations such as OKF import, rebuild, health, drift detection, delete/scrub, and index-status reads against OpenClaw `memory-wiki` and `memory-lancedb`.
- `EmbeddingProviderPort` for embedding generation, model metadata, batch re-embedding, drift policy, and provider replacement.
- `SkillCatalogPort` for Opzava's curated admin-only skill catalog, approved skill versions, verification receipts, install policy, and tenant/project selection rules.

Opzava owns the KB source of truth. Source files, normalized document records, metadata, ACL scope, review state, and published corpus revisions live in Postgres plus object storage. OpenClaw `memory-wiki`, OKF-imported wiki pages, compiled digests, embeddings, and LanceDB vector rows are derived indexes. They are never the only copy and never the authority for project or org knowledge.

Use the ADR-008 scoping model:

- employee = workspace
- project = shared corpus
- org = corpus

An `Assignment` starts or resumes an employee's OpenClaw session with the employee workspace as the base and with authorized `projectCorpusRef` and `orgCorpusRef` overlays. Memory writes from the session land in the employee workspace or in Opzava's candidate-KB flow. They do not directly mutate the project corpus. Promoting a fact into project or org knowledge requires an Opzava candidate entry, review/policy checks where required, a new corpus revision, and a rebuild or incremental import of the derived indexes.

Use OKF bundles plus `wiki okf import` as the portable ingestion contract. A published KB revision exports a content-addressed OKF bundle containing source refs, normalized content, metadata, provenance, tenant/project/org scope, sanitizer version, content hashes, and corpus revision ids. The OpenClaw adapter imports that OKF bundle into `memory-wiki` and builds or updates `memory-lancedb` through `KnowledgeIndexPort`. OKF is the boundary artifact; wiki pages, compiled summaries, and vector rows are projections.

Use s3-backed LanceDB for durable vector indexes. LanceDB storage paths are scoped by tenant, corpus kind, corpus id, index version, and embedding model version. Storage credentials are supplied through the existing secrets/config mechanism, never hardcoded in source or stored as raw secrets in Opzava tables. The LanceDB path is vector-index storage only; it is not the document store and not a knowledge source of truth.

Make ingestion idempotent and content-addressed. Re-ingestion keys include the tenant, corpus scope, source document id, source version, sanitizer version, content hash, embedding model version, and target index revision. Gateway reprovisioning rebuilds derived knowledge from a consistent published KB revision in Opzava. Before applying a rebuild, the worker performs a dry-run diff that reports additions, updates, deletions, embedding-model changes, missing source blobs, stale index rows, and scope changes. Apply is idempotent and records an index receipt.

Disable OpenClaw automatic memory capture for project/org corpora. `autoCapture` is off for shared project and org knowledge. Auto-captured chat facts, if produced by employee memory or runtime observation, become candidate KB entries in Opzava with source conversation refs, provenance, classification, and review state. Only promoted candidates become part of a published KB revision. This preserves the rebuild-from-source guarantee and keeps hidden Gateway-local memory from becoming unreviewed project truth.

Install skills only through an admin-only curated catalog. `SkillCatalogPort` exposes approved skills and versions to tenants/projects/employees as selectable product capabilities, but installation and updates run through the audited provisioning/platform-ops path with the short-lived ADR-003 `operator.admin` credential. The provisioner enforces `security.installPolicy`, fails closed when policy is missing or incompatible, verifies skill source/version/checksum/signature or approved provenance, records a provision receipt, and updates runtime tool policy as required by ADR-005. Request handlers, ordinary chat, employee sessions, and the hot-path broker token cannot call `skills.install`, `skills.update`, or `skills.upload`.

## Consequences

The rebuild-from-source-of-truth invariant is load-bearing. A tenant Gateway, workspace, `memory-wiki`, or LanceDB index can be deleted, corrupted, moved to a new host, or reprovisioned without losing project/org knowledge because the source is Opzava Postgres plus object storage. Rebuilds must use only published KB revisions and source blobs, not Gateway-local wiki/vector state.

Embedding-model drift is routine instead of exceptional. Changing model, provider, dimensions, sanitizer version, chunking policy, or retrieval metadata creates a new index revision and triggers batch re-embedding through `EmbeddingProviderPort`. Old and new index revisions can coexist during rollout. Retrieval must know which corpus revision and embedding model version it queried, and stale embeddings must be detectable and rebuildable.

The cross-project leakage guard is the corpus overlay contract. Runtime dispatch must resolve authorized project/org corpus refs server-side from the assignment, RBAC, tenant, employee, and corpus revision. It must never trust a browser-supplied corpus id, project id, workspace path, LanceDB path, or OpenClaw ref as routing authority. If the employee, project, org, corpus revision, or Gateway route cannot be proven, dispatch fails closed.

Knowledge deletion and scrubbing are asynchronous but mandatory. Removing a source document, revoking a project member, applying GDPR erasure, or changing corpus scope creates a new KB revision and an index job that deletes or supersedes affected wiki/vector rows. Product surfaces must tolerate `IndexStale`, `RebuildPending`, `CorpusUnavailable`, and `EmbeddingDriftDetected` states.

The Knowledge Management context becomes responsible for provenance and promotion. User uploads, notes, docs, imported web pages, CRM-derived facts, and auto-captured chat candidates all need source refs, content hashes, sanitizer versions, reviewer/policy state, and revision membership before they can influence project or org retrieval.

Skill governance stays out of the hot path. This reduces self-service flexibility but preserves the ADR-003 two-token split and the ADR-005 principle that executable capabilities require policy, verification, admin provisioning, and audit. A compromised runtime token can use already-approved runtime tools within policy, but it cannot install new skills or mutate the skill catalog.

## Alternatives

Use one OpenClaw workspace per project. Rejected because ADR-008 supersedes Q4b's earlier mapping: employee identity, persona files, personal memory, skills, sessions, and agent state belong to the employee workspace. Project knowledge is a shared corpus overlay. Per-project workspaces would duplicate employee state, make cross-project specialists awkward, and confuse project knowledge with employee identity.

Let OpenClaw `memory-wiki` and `memory-lancedb` be the knowledge source of truth. Rejected because Gateway reprovisioning, retention, vector corruption, local disk loss, embedding-model drift, and auto-capture would be able to mutate or erase business knowledge outside Opzava's review, audit, RBAC, and source-document controls.

Write directly to LanceDB and skip OKF. Rejected because direct vector writes would couple the Knowledge Management domain to one storage engine, one embedding layout, and Gateway-local index details. OKF bundles keep ingestion portable and make wiki pages, summaries, and vectors rebuildable projections.

Enable automatic capture directly into project corpora. Rejected because chat-derived facts are noisy, adversarially influenceable, and hard to audit after the fact. Auto-captured facts may be useful, but they must enter Opzava as candidate KB entries and be promoted through the same source, revision, and policy path as other knowledge.

Allow tenant or project self-install of arbitrary skills. Rejected because skills are executable code and OpenClaw requires `operator.admin` for installation. Self-install would put admin authority into ordinary product workflows, bypass curated verification, and undermine tool-policy-first security.

Keep a single broad admin token in the broker for both knowledge and runtime work. Rejected because every chat, assignment, workflow, or retrieval path would inherit skill install, config mutation, and other admin-only authority. Knowledge indexing and skill installation use audited provisioning jobs; runtime retrieval and sessions use the scoped hot-path credential from ADR-003.

## Related ADRs

- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-005: Tool-policy-first security, approval gates, and sandbox posture.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
