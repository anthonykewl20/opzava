# 0117: Ops Artifacts Route

## Problem
Operators need a quick, lightweight view of persisted content artifacts within the Opzava control plane. Fetching full artifact payloads for a list view is expensive and unnecessary. We need a dedicated, admin-only summary endpoint to power an Artifacts panel.

## Approach
A new TDD slice implements `GET /api/ops/artifacts`. The route is admin-gated and read-only. It reads optional `?type` and `?run` query filters, queries the artifact repository, and maps results into lightweight summaries. The full content payload is deliberately omitted to keep the response cheap.

## Contract
- **Endpoint:** `GET /api/ops/artifacts`
- **Auth:** `requireRole('admin')`
- **Query Params:** `?type` (artifactType), `?run` (workflowRunId)
- **Response:** `{ artifacts: ArtifactSummary[] }` (newest-first)
- **ArtifactSummary:** `{ artifactId, artifactType, sourceStepRunId, validationStatus, inputArtifactIds }`
- **Omitted:** `content` payload is not included in the summary.

## Validation
Four tests using a real in-memory `better-sqlite3` database via `getDatabase()`:
1. Returns an empty list when no artifacts exist.
2. Returns summaries in newest-first order, **without** a `content` property, and **with** `validationStatus` and lineage (`inputArtifactIds`).
3. Correctly filters by `?type`.
4. Correctly filters by `?run`.

## Security & Audit
No secret values, private credentials, tokens leave through this endpoint — it returns only ids, type, step, validation status, and lineage ids; the full content payload is withheld from the list, and the repository already rejects secret-bearing artifacts. The route is admin-gated and read-only.

## Next Case Study Thread
The next slice will implement a `GET /api/ops/artifacts/[id]` detail route, returning the full artifact including its content, lineage, and validation status. This will be followed by the operator-facing Artifacts panel in Opus UI, which will list artifacts using this summary endpoint and drill into a single artifact using the detail route.
