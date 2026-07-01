# Q4b Knowledge Credentials

**Recommendation: project-scoped agent workspaces, Opzava-owned KB sources, rebuildable OpenClaw indexes, and two Gateway credentials.**

**1) Project-to-agent mapping.**

Use one dedicated OpenClaw agent workspace per Opzava project, lazily provisioned inside that tenant's dedicated Gateway. The "main orchestrator" in the Opzava UI is a product facade, not a tenant-global OpenClaw agent: every chat must resolve a `ProjectAgentBinding` from `{tenantId, projectId}` and send `agentId` plus session scope through the broker. If the binding is missing, stale, or ambiguous, fail closed and enqueue provisioning/rebuild.

This matches the OpenClaw boundary: memory, wiki, and workspace skills are per-agent-workspace scoped. A single tenant orchestrator with project-namespaced memory would rely on prompts and naming discipline for isolation; that is not a DDD boundary and it creates cross-project leakage on session reuse, auto-recall, skills snapshots, and wiki search.

**2) Knowledgebase source of truth.**

Opzava owns the project KB as source of truth in the new **Project Knowledge Management** bounded context. Its core aggregates are `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeBundleVersion`, `ProjectKnowledgeIndex`, and `ProjectAgentBinding`. OpenClaw memory/wiki/vector state is a rebuildable derived index, never the only copy.

Ports: `KnowledgeSourcePort` for Postgres metadata and document versioning, `ObjectStorePort` for source blobs and bundle artifacts, `OkfBundlePort` for vendor-neutral export, `OpenClawProvisioningPort` for admin-only agent/workspace/config/skill operations, and `KnowledgeIndexPort` for import, rebuild, health, and drift status.

Pure-B Gateway reprovision stays routine: create the project workspace, install/update the approved skill pack, apply config, import the latest OKF bundle into `memory-wiki`, and rebuild LanceDB vectors from Opzava-owned artifacts.

**3) Ingestion seam.**

Use versioned OKF bundles plus `memory-wiki` OKF import as the portable contract. OKF is the domain artifact; wiki pages, compiled digests, and vector rows are projections. Use `memory-lancedb` with an `s3://` `dbPath` for scale and fast reprovisioning, with tenant/project/index-version prefixes and storage credentials supplied through the existing secret/config mechanism. Do not let the LanceDB path become the source document store.

**4) Credential model.**

Keep two credentials. The hot-path broker socket uses the locked least-privilege token: `operator.write` + `operator.approvals`. A separate, vault-held, audited `operator.admin` provisioning credential is used only by a narrow broker provisioning capability for `config.*`, `agents.*` workspace wiring, and `skills.install/update/upload`. Do not broaden the hot-path token; that would make every chat/run path able to mutate Gateway config and project isolation.

**Biggest sad path:** a user switches projects, the UI reuses an old session or agent binding, and the orchestrator recalls another project's memory/wiki. Mitigation is server-side binding enforcement on every chat, ingest, and projection command; project-scoped sessions; idempotent rebuilds; bundle/index version checks; and fail-closed behavior when context cannot be proven.

**Scale-ready and agnostic:** Opzava owns durable knowledge and policy; OpenClaw owns runtime indexes behind ports. Workspaces shard naturally by tenant/project, indexes rebuild from object storage, and replacing OKF import, LanceDB, or OpenClaw only changes adapters, not the Project Knowledge domain.
