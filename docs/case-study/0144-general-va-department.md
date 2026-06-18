# 0144: General VA Department

## Problem

Opzava's Content, Email, and Social Media departments were already wired into the artifact repository, Artifacts panel, and per-agent activity stream, but General VA work — the broad virtual-assistant surface (task intake, drafting, review) — had no home. Adding it ad hoc inside one of the named departments would conflate pipelines and pollute per-agent telemetry. The fourth department needed its own isolated module (`src/opzava/modules/general-va`) that fit the existing shape without disturbing the other three.

## Approach

The department pattern is now proven through Content and Social, so opening General VA is mostly mechanical.

- Mirror the social/content layout under a new module path so it stays isolated.
- Reuse the core `Artifact` envelope (`parseArtifact`). That choice is deliberate: a VA artifact automatically inherits the existing artifact repository, the Artifacts panel rendering, and per-agent activity tracking — no parallel pipeline, no UI drift.
- Define the VA artifact surface up front as an allow-list: `GENERAL_VA_ARTIFACT_TYPES = [va-task-intake, va-task-draft, va-task-review]`. Every step service emits one of these, nothing else.
- Build the first VA step — intake → draft — as a step service plus a mock provider, so the full intake→draft→review chain has a concrete head and a swappable worker seam.

## Contract

Slice 0144 — envelope:
- `createGeneralVaArtifact({ type, title, content, tags, lineage, agentId })` validates `type ∈ GENERAL_VA_ARTIFACT_TYPES` and returns a frozen core `Artifact` via `parseArtifact`.
- Lineage is required; the first VA artifact carries an empty lineage (seeded intake), later steps carry the upstream artifact id.

Slice 0145 — first step:
- `createVaTaskDraftStepService({ provider })` returns a step that consumes a `va-task-intake` artifact and emits a `va-task-draft` artifact with shape `{ summary, steps }` and `lineage: [taskIntakeArtifactId]`.
- `createMockVaTaskDraftProvider` is the dumb worker; it receives the intake and returns a draft body. It does not validate, does not envelope, does not choose lineage — the system owns those concerns.
- `parseVaTaskDraftInput` normalizes and validates the intake payload before the provider runs.

## Validation

- Envelope tests cover the happy path: a valid `va-task-draft` round-trips, is frozen, has correct lineage, and passes artifact validation.
- Envelope negative tests reject an unknown `type` and reject an empty `lineage` on a non-seed step.
- Envelope tests list exactly the three `GENERAL_VA_ARTIFACT_TYPES` so the surface cannot drift silently.
- Step tests produce a `va-task-draft` from a `va-task-intake`, carry the provider's draft body into `content`, and propagate `taskIntakeArtifactId` into lineage.
- Step negative tests reject a missing intake input.
- Step output is verified frozen.
- `tsc` and `eslint` (including the complexity ratchet) clean.

## Security & Audit

The envelope is the trust boundary. `createGeneralVaArtifact` builds through `parseArtifact`, which enforces the allow-list, requires lineage on non-seed steps, and rejects any payload carrying secrets. "No secret values, private credentials, tokens" can enter a VA artifact — the provider is a dumb worker that only shapes content, while validation, lineage, and envelope construction stay in the system layer where they can be audited. Every VA artifact is a first-class `Artifact`, so it shows up in the Artifacts panel and per-agent activity stream with full provenance.

## Next Case Study Thread

Activate the General VA agent to own the VA steps and register the General VA pipeline so all four named departments are live on the Team Dashboard. After that, layer per-agent KPIs and persona depth on the now-four-department surface.
