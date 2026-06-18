# 0118: Ops Artifact Detail Route

## Problem

The `/api/ops/artifacts` list route returns lightweight summaries — id, type, status, and timestamp. Operators investigating a specific artifact (e.g., a failed validation or unexpected lineage) need the **full persisted content** without querying the database directly. There is currently no admin-facing read endpoint for a single artifact.

## Approach

Add a TDD-driven Next.js App Router slice at `GET /api/ops/artifacts/[id]`. The handler is admin-gated, read-only, and delegates entirely to the existing artifact repository. No new persistence logic — just a thin route wrapping `getArtifactById`.

## Contract

```
GET /api/ops/artifacts/:id

Middleware: requireRole("admin")

Params:
  id — string, artifact UUID

Response 200:
  { artifact: { id, type, content, lineage, validation, createdAt } }

Response 404:
  { error: "Artifact not found" }
```

Implementation sketch:

```ts
const { id } = await context.params;
const repo = createArtifactRepository(getDatabase());
const artifact = repo.getArtifactById(id);
if (!artifact) {
  return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
}
return NextResponse.json({ artifact });
```

## Validation

Three integration tests backed by a real in-memory `better-sqlite3` database via `getDatabase()`:

1. **Happy path** — seed an artifact, request its id → 200 with `content`, `lineage.inputArtifactIds`, and `validation.status` all present and correct.
2. **Unknown id** — request a UUID that was never seeded → 404 with `"Artifact not found"`.
3. **Empty table** — no rows exist at all → 404 with `"Artifact not found"`.

## Security & Audit

No secret values, private credentials, tokens pass through this route — the artifact is re-validated by the repository's `parseArtifact` on read, which rejects any content containing a `SecretReference`, so the detail view can never surface a credential. The route is admin-gated and read-only; it performs no mutations and exposes no write surface.

## Next Case Study Thread

**0119: Operator Artifacts Panel (Opus UI).** Build a two-pane admin view that lists summaries from `/api/ops/artifacts` and drills into one via this detail route, rendering artifact type, validation status, lineage graph, and raw content. Follow-up: wire the workflow recording executor to persist artifacts so the panel surfaces real produced data instead of seed fixtures.
