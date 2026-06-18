# 0119: Artifacts Panel

## Problem

Opzava’s UI exposes operational state but lacked a way to inspect persisted content artifacts. Operators had no visibility into what artifacts a workflow produced, their validation status, or their lineage — forcing them to query the API manually. This was the last Layer-9 gap: the control plane could run workflows but not surface their outputs.

## Approach

Built a master/detail artifact browser as a single panel component, split into three subcomponents to stay under the complexity budget:

- **`ValidationPill`** — colored status badge (valid / invalid / unknown).
- **`ArtifactRow`** — summary row rendered in the list; fetches no content.
- **`ArtifactDetailView`** — full view fetched on click via `/api/ops/artifacts/[id]`.

The list endpoint (`/api/ops/artifacts`) returns summaries only; the full artifact payload is fetched lazily on drill-in. Type filter chips are derived client-side from the returned data. A nav item `artifacts` with `ArtifactsIcon` was added to the **OBSERVE** group in `nav-rail.tsx`, and a `case 'artifacts' -> ArtifactsPanel` entry was added to `ContentRouter`.

## Contract

| Endpoint | Returns |
|---|---|
| `GET /api/ops/artifacts?type=` | `ArtifactSummary[]` — id, type, validation status, lineage input ids |
| `GET /api/ops/artifacts/[id]` | Full `Artifact` — adds rendered content (pretty JSON) |

Both routes are admin-gated. The detail route re-validates through `parseArtifact`, which rejects secret-bearing content before it reaches the UI.

## Validation

- `tsc --noEmit` — clean.
- `eslint` — 0 errors.
- Production build compiles.
- Check-plan assertion verifies the panel exists and is wired into both the nav rail (`id: 'artifacts'`) and the `ContentRouter` (`case 'artifacts'`).
- Panel is entirely read-only; no mutation endpoints are called.

## Security & Audit

No secret values, private credentials, tokens are shown by the panel — it renders only artifact ids, types, validation status, lineage ids, and content from admin-gated read routes that re-validate via `parseArtifact` (which rejects secret-bearing content). The UI offers no mutation.

## Next Case Study Thread

Wire the workflow recording executor to persist produced artifacts via the artifact repository so this panel surfaces real run output — scout `content-workflow-recording-executor.ts` first. Then build a Team Dashboard aggregating artifact health across projects, and optionally add eslint complexity rules to enforce the subcomponent split pattern.
