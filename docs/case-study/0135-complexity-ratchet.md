# 0135: Complexity Ratchet

## Problem

Opzava's core (`src/opzava`) is growing. Without structural guardrails, cyclomatic complexity, nesting depth, and callback sprawl can creep in silently across dozens of incremental PRs. Layer 10 of the implementation plan calls for controls that prevent this decay — not by forcing a refactor today, but by locking in the quality the code already exhibits.

## Approach

A **ratchet, not a cleanup**. We measured the current worst case across the core, set the ESLint bar at or above it, and let CI hold the line going forward.

Three rules were selected: `complexity` (max 20), `max-depth` (4), and `max-nested-callbacks` (5). All pass cleanly today.

`max-lines-per-function` was **intentionally omitted**. The durable-runner repository uses a factory-of-closures idiom — `createRunnerRepository` is a single 729-line factory that returns many small closures. The rule miscounts this as one huge function, producing a false positive, not real complexity. The guiding principle: drop or loosen any rule that only trips on a legitimate idiom rather than refactoring working code under a new rule.

## Contract

- **Scope:** `src/opzava/**/*.ts`, tests exempt.
- **Rules:** `complexity: ["error", { max: 20 }]`, `max-depth: ["error", 4]`, `max-nested-callbacks: ["error", 5]`.
- **Config:** Flat-config override block; no shared presets touched.
- **Invariant:** `eslint src/opzava` must exit 0. Any future commit that increases nesting or cyclomatic complexity beyond these thresholds fails CI.

## Validation

1. `node_modules/.bin/eslint src/opzava` exits 0 with the ratchet in place.
2. The ESLint config file itself lints clean.
3. The full unit suite stays green — a config change touches no runtime code.
4. A check-plan assertion verifies the ESLint config carries the `src/opzava` complexity override (both `complexity` and `max-depth` present).

## Security & Audit

No secret values, private credentials, tokens are involved — this is a lint-config quality gate. Keeping the core acyclic (0097 entropy guard) **and** bounded in per-function complexity preserves the boundaries that keep secret resolution and approval logic small and reviewable. Complexity limits are a defense-in-depth measure for auditability.

## Next Case Study Thread

**Layer-13 R&D queue.** Pick the first R&D-queue item from the implementation-layers plan, scout or PoC it, record the finding in `docs/discovery`, and ship either a bounded slice or an Architecture Decision Record. This moves the project from defensive hardening into exploratory capability.
