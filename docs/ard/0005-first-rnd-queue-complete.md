# ARD 0005: First R&D Queue Complete — Seeding the Next Queue

## Status
Accepted (2026-06-18).

## Context
The First R&D Queue was the bootstrapping research list defined alongside the 13-layer build plan for Opzava. That layered build has since shipped under a strict TDD case-study cadence (130+ slices) with a green suite (247 vitest test files / 1783 unit tests + governance `node:test` checks, production build compiling). All 12 research items have been delivered against concrete layers and contracts. Current counts are captured in `docs/benchmarks/0002-current-state-snapshot.md`.

## Decision
Declare the First R&D Queue complete. Open a Next R&D Queue focused on expanding the virtual-company / agent-team product surface.

## First R&D Queue — Delivered

1. **Audit Mission Control + map keep/replace/isolate/remove** — done (upstream fork audit, Layer 1).
2. **Measure the base app locally before custom changes** — done (Layer 3 benchmark baseline).
3. **Inventory settings, provider credentials, demo keys, hard-coded values, secret handling** — done (Layer 8 admin settings + SecretReference).
4. **Durable runner strategy** — done (Layer 5 durable runner: jobs / attempts / leases / dead-letters / operational-events in SQLite).
5. **DB schema + migration approach, SQLite-first** — done (opzava_runner_* tables + migrations; record_json pattern).
6. **State machines for runs / steps / jobs / attempts / approvals / admin-config / secret-refs / external-actions** — done (Layer 4 contracts + runner; approval + campaign + agent-status state machines).
7. **Artifact schemas (SEO brief, outline, draft, fact-check, brand, anti-slop, provenance, WordPress draft request)** — done (content contracts, Layer 6).
8. **Provider contract + mock adapters** — done (Layer 7 ProviderAdapter + mock / live adapters).
9. **Admin settings schema, secret-reference model, redaction, permission model** — done (Layer 8; write-only secrets, `[secret-reference]` redaction, admin-gated routes).
10. **Complexity + entropy tooling** — done (architecture entropy guard [no import cycles + layering] and the eslint complexity ratchet on `src/opzava`).
11. **Mocked content workflow + benchmark restart / replay** — done (Layer 6 `runContentWorkflow` on mocks; runner recovery / replay tests).
12. **Live WordPress draft only after approval / config / redaction / duplicate-action tests** — done (live WordPress + Resend adapters, draft-only, approval-gated, exactly-once).

## Next R&D Queue

1. **Social Media department workflow + Social Media Manager agent** — flesh out the department (currently a 'planned' persona with no steps).
2. **General VA department** — cross-cutting / ad-hoc task handling for the virtual company.
3. **Per-agent KPIs + cost attribution** — go beyond artifact counts to time-to-complete, approval rates, and spend per agent.
4. **Agent persona depth** — display names / avatars, a "soul" / system-prompt per role, and per-agent provider / model selection.
5. **Postgres-compatible storage path** — the schema is SQLite-first but designed Postgres-compatible; validate and add a migration / adapter.
6. **Long-running worker daemon** — productionize the launcher wired to saved Resend settings (daemon library exists).
7. **Multi-tenant / multiple "companies"** — departments as projects scoped per workspace.
8. **Richer department 'project' views** — run history + pipeline status per department, not just the static step pipeline.

## Consequences
The bootstrapping research phase is closed. All future work is product expansion of the agent-team model. Each Next-queue item should be scouted and PoC'd per the established engineering methodology before a build slice is committed or a dedicated ARD is opened.
