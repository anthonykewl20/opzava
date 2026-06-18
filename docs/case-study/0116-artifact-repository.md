# 0116: Artifact Repository

## Problem

Opzava's content pipeline produces validated artifacts—SEO briefs, drafts, fact-checks, brand reviews, source captures—as step outputs, but these artifacts were never persisted anywhere queryable. Operators had no way to browse or drill into a specific artifact after a workflow completed.

## Approach

TDD slice adding a SQLite repository for content artifacts, mirroring the existing campaign/approval repository idiom. A factory function accepts a `better-sqlite3` Database and returns frozen closures. Schema creation uses `CREATE TABLE IF NOT EXISTS` with a `record_json` column. Every read and write passes through `parseArtifact` validation. Because the artifact contract carries no run ID or timestamp, `saveArtifact` accepts a small context object `{ workflowRunId, createdAt }` for indexing and newest-first ordering.

## Contract

```
createArtifactRepository(db): {
  ensureSchema(),
  saveArtifact(artifact, { workflowRunId, createdAt }),  // upsert by artifactId, validates first
  getArtifactById(id),
  listArtifacts({ artifactType?, workflowRunId? })        // newest-first
}
```

## Validation

Six tests against a real in-memory `better-sqlite3` database:

1. **Save + get round-trips** — unknown ID returns `null`.
2. **Upsert by artifactId** — pending then valid → one row, validation passes.
3. **listArtifacts newest-first** — correct ordering by `createdAt`.
4. **Filter by artifactType** — only matching types returned.
5. **Filter by workflowRunId** — only matching runs returned.
6. **Invalid artifact throws** — saving an artifact with empty lineage rejects.

Prepared statements are created only after `ensureSchema`, so a fresh database never hits "no such table."

## Security & Audit

No secret values, private credentials, tokens can be stored — `parseArtifact` rejects any artifact whose content contains a `SecretReference` and requires non-empty lineage. This validation runs on both write and read, so a tampered or secret-bearing row fails closed.

## Next Case Study Thread

An admin-only `GET /api/ops/artifacts` list route (optional `?type` / `?run` query filters) and `GET /api/ops/artifacts/[id]` detail route backed by this repository, followed by an operator Artifacts panel in Opus UI listing artifacts and drilling into one with its lineage and content.
