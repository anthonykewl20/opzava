# 0138: Social Post Draft Step

## Problem
The Social Media department at Opzava has an artifact envelope but no step services to produce artifacts. We need a first step that transforms a social brief into a `social-post-draft` artifact, following the established content step-service pattern so the draft flows through existing repository, panel, and activity systems.

## Approach
Mirror the content pipeline: inject a provider (dumb worker), keep sequence and validation in the system layer. The step service parses input, calls the provider, wraps the output as a typed artifact with lineage. This keeps providers simple and the system in control of envelope integrity.

## Contract
- `parseSocialPostDraftInput` validates `{briefArtifactId, topic, platform, sourceStepRunId}` — all non-empty strings.
- `createMockSocialPostDraftProvider` returns deterministic `{text, platform, hashtags}`.
- `createSocialPostDraftStepService({provider, newId, now}).run(payload)` parses input, calls provider, wraps result as a `social-post-draft` Artifact with lineage `[briefArtifactId]`.

## Validation
Five tests cover the happy path and guard rails:

1. **Produces artifact** — run yields a `social-post-draft` with correct type, id, step, and lineage.
2. **Carries provider draft** — artifact content includes platform, topic text, and hashtags from the provider.
3. **Rejects missing field** — `parseSocialPostDraftInput` throws on any absent or empty required string.
4. **Deterministic provider** — mock provider returns identical output for identical input across runs.
5. **Frozen artifact** — the run output is immutable; mutations throw in strict mode.

## Security & Audit
No secret values, private credentials, tokens enter a social post draft — it is wrapped through `createSocialArtifact` → `parseArtifact`, which rejects secret-bearing content and requires lineage. The provider is a dumb worker; the system owns input validation and the artifact envelope. Every draft carries a `sourceStepRunId` for full audit traceability.

## Next Case Study Thread
Activate the **social-media-manager agent** to own social steps and register the Social Media pipeline on the dashboard. Then layer in review, approval gate, and a schedule-only terminal step that never auto-publishes — giving the department a complete, auditable workflow from brief to scheduled post.
