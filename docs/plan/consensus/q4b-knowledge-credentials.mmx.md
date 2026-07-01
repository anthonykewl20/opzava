**1) Mapping: dedicated agent-workspace per project, lazy-provisioned.**
One orchestrator agent with namespaced memory creates unavoidable cross-tenant leakage risk and breaks per-tenant skills allowlists. A dedicated workspace per project (one Gateway already isolates per tenant) gives hard isolation, project-scoped skills, and clean teardown. Per-project context reaches the main orchestrator via the ACL: every user message carries `projectId`; the broker routes context assembly through that workspace's `memory.recall` + `wiki.query` and injects results into the orchestrator prompt. No cross-project state in the hot path.

**2) SoT: Opzava owns source documents; memory/wiki are derived, rebuildable indexes.**
Postgres rows + object-store blobs are canonical. OpenClaw holds only embeddings + compiled wiki state. On Gateway reprovision the broker re-runs the OKF ingestion job from Opzava's source tables. Idempotent, replayable, tenant-safe.

**3) Ingestion seam: OKF bundles + s3-backed lancedb. Agree.**
OKF is the portable, vendor-agnostic contract; `wiki okf import` is the standard ingest verb. S3-backed lancedb gives durable vector storage without coupling to local disk. Add a content-hash in OKF for dedup and provenance.

**4) Credentials: two-token model, non-negotiable.**
Hot-path = `operator.write + operator.approvals`. Separate audited `operator.admin` lives only in the broker's provisioning capability, used by an out-of-band job (CLI/event), never by request handlers. Single admin token is a blast-radius and audit nightmare.

**Biggest risk (sad path):** operator admin token exfiltration in the broker provisioning path wipes an entire tenant Gateway, including the lancedb vault and wiki — and the rebuild job silently re-ingests stale source docs if Opzava's source-of-truth is also dirty. Mitigate with token scoping per gateway, short-lived issuance, and a pre-rebuild dry-run diff.

Scale-ready + agnostic: every per-project artifact is keyed by `(tenantId, projectId)`, sharded Gateway fan-out, OKF as the interop contract.
