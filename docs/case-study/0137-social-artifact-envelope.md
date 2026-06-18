# 0137: Social Artifact Envelope

## Problem
The Social Media department is a planned but empty shell. To integrate it with the existing Opzava ecosystem—specifically the artifact repository, the Artifacts panel, and per-agent activity attribution—it needs to produce artifacts. However, the content module's artifact logic is tightly coupled to its own step-registry and `CONTENT_ARTIFACT_TYPES`. We need a way for social agents to create artifacts that flow through the same core infrastructure without modifying or entangling the content module.

## Approach
A read-only scout confirmed the core `Artifact` envelope is generic; it accepts any `artifactType` string. The coupling exists only in the content module's *step-bridge*, which maps content steps to a content-specific allow-list. Therefore, the social department can reuse the core envelope directly. We create a new, isolated module (`src/opzava/modules/social`) that defines its own artifact types and a `createSocialArtifact` function. This function validates the type against a social-specific allow-list and delegates to the core `parseArtifact` builder. The result is a standard `Artifact` that automatically flows through all existing systems.

## Contract
The social module exports a strict contract for artifact creation.

**Allowed Types:**
```typescript
export const SOCIAL_ARTIFACT_TYPES = [
  'social-brief',
  'social-post-draft',
  'social-review',
  'social-schedule-request'
] as const;
```

**Factory Function:**
```typescript
export function createSocialArtifact({
  artifactId,
  artifactType,
  sourceStepRunId,
  content,
  inputArtifactIds,
  validatedAt
}: CreateSocialArtifactInput): Artifact {
  // 1. Validate artifactType against SOCIAL_ARTIFACT_TYPES
  // 2. Delegate to core parseArtifact({ ... })
}
```

## Validation
The module is verified by a focused test suite (~5 tests):
1.  **Happy Path:** Wraps a valid `social-post-draft` into a frozen `Artifact`. Asserts correct `type`, `validation`, `lineage`, and `content`.
2.  **Type Rejection:** Rejects an unknown artifact type (e.g., `'social-unknown'`).
3.  **Lineage Enforcement:** Rejects empty `inputArtifactIds` (via `parseArtifact`).
4.  **Contract Completeness:** `SOCIAL_ARTIFACT_TYPES` lists exactly the four defined social steps.
5.  **Type Coverage:** Both `social-brief` and `social-schedule-request` build successfully.

## Security & Audit
No secret values, private credentials, tokens can enter a social artifact. The `createSocialArtifact` function builds through the core `parseArtifact`, which performs two critical checks: it rejects any `content` containing a `SecretReference`, and it requires non-empty lineage (`inputArtifactIds`). A malformed or secret-bearing social artifact fails closed.

## Next Case Study Thread
The next slice should implement the first social step service and its mock provider (e.g., a `social-post-draft` step that generates a draft from a `social-brief`). This enables activating the `social-media-manager` agent to own the social steps and adding a Social Media pipeline to the dashboard.
