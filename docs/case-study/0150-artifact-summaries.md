# 0150: Artifact Summaries

## Problem
Opzava attributes per-agent activity from persisted artifacts. The artifact repository stored a `created_at` column but `listArtifacts` returned the full `Artifact` (which has no timestamp), so there was no way to compute an agent's last-active time without parsing every record.

## Approach
A scout (read-only) confirmed `created_at` is stored but unexposed. The cheapest fix is a column-only read rather than threading `createdAt` through the parsed `Artifact` type.

## Contract
`listArtifactSummaries` returns lightweight `{artifactId, artifactType, workflowRunId, createdAt}` rows newest-first, never parsing `record_json`. It is a surgical addition to the existing repository (new type method + four prepared statements + a column mapper), mirroring the `listArtifacts` filter shape.

## Validation
Tests against a real in-memory better-sqlite3 db — `listArtifactSummaries` returns column summaries newest-first with `createdAt` and no content field; filters by type and by run. The existing artifact repository and artifact route tests stay green; tsc + eslint (complexity ratchet) clean.

## Security & Audit
No secret values, private credentials, tokens are read by the summary query — it selects only ids, type, run, and a timestamp, never `record_json`, so it cannot surface artifact content (which the parse layer already screens for secrets anyway).

## Next Case Study Thread
Extend `summarizeAgentActivity` to compute a `lastActiveAt` per agent from these summaries, then surface 'last active' on each Team Dashboard agent card.
