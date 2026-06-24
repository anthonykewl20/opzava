# ARD 0010 — Opzava layering realignment (seal core↔platform and cross-module leaks)

- **Status:** Accepted
- **Date:** 2026-06-24
- **Relates to:** ARD 0007 (engine separation), ARD 0008 (secret storage & resolution)

## Context

The declared architecture (`docs/architecture/folder-structure.md`; the Clean/Hexagonal Dependency
Rule) requires dependencies to point inward: `core` is framework-independent and must not depend on
`platform` or on feature modules; feature modules depend on `core` and approved `platform`
interfaces; a module must not import another module's internals.

Two edges violated this:

1. **core → platform (upward).** `src/opzava/core/artifacts/contracts.ts` imported `isSecretReference`
   from `src/opzava/platform/admin-config/contracts`. `core` therefore depended on `platform`,
   breaking the Dependency Rule and the "framework-independent core" guarantee.
2. **cross-module internal.** `src/opzava/modules/team/agent-activity.ts` imported
   `createArtifactRepository` from `content`'s internals
   (`../content/artifacts/artifact-repository`), bypassing `content`'s public `index.ts` barrel.

## Decision

1. Relocate the pure `SecretReference` model (`SECRET_REFERENCE_KIND`, `secretReferenceSchema`,
   `SecretReference`, `createSecretReference`, `isSecretReference`) — a zod-only domain primitive —
   from `platform/admin-config/contracts.ts` into a new `src/opzava/core/secrets/contracts.ts`.
   `admin-config` re-exports them (preserving ~40 importers) and imports them for its own
   resolution/redaction surface (`secretResolutionFailureSchema`, `redact*`,
   `adminConfigRecordSchema` stay in `admin-config`). `core` no longer imports `platform`.
2. Route `team`'s repository use through `content`'s public barrel (`@/opzava/modules/content`)
   instead of its internals.
3. Lock both invariants in governance tests: `src/opzava/architecture.test.ts` gains "core does not
   import platform" and "no module imports another module's internals except its `index.ts`".

## Rationale

- **Acyclic Dependencies (ADP) + Dependency Rule.** A shared domain concept depended on by every
  layer must live at the most central, stable point — `core`. Extracting it there is the prescribed
  way to remove an upward edge, not a lazy-import workaround.
- **Stable Abstractions (SAP).** `core/secrets` is the stable, abstract home; `admin-config` is the
  volatile adapter that consumes it.
- **Deep modules / one interface per module.** The relocation makes the `SecretReference` contract a
  single, addressable module — mirroring the declared-contract philosophy — which improves
  AI-navigability.
- **Re-export preserves the public surface.** No external importer changes; the blast radius is two
  repointed `core` files.

## Consequences

- `core` is once again framework-independent and acyclic with respect to `platform`.
- Importers may use either `@/opzava/core/secrets/contracts` (canonical, preferred for new code) or
  `@/opzava/platform/admin-config/contracts` (still re-exports).
- The `architecture.test.ts` graph stays cycle-free; the new edge `admin-config → core/secrets`
  points inward (allowed).

## Alternatives considered

- **Leave the leak, document as an exception.** Rejected: `SecretReference` is a load-bearing domain
  primitive; leaving `core` dependent on `platform` undermines the layering the governance tests
  enforce and misleads editing agents.
- **Lazy-import inside `core` to hide the edge.** Rejected: there was no cycle, only a wrong
  direction. Lazy imports hide the defect; they do not fix it.

## References

- `docs/architecture/folder-structure.md` (Module dependency rules, Path Alias Policy)
- `docs/architecture/system-map/92-stale-findings.md` (layering-leak entries)
- ARD 0007 (engine separation), ARD 0008 (secret storage & resolution)
- `src/opzava/architecture.test.ts` (dependency-graph guard)
