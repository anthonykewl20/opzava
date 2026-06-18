# 0002: Current State Snapshot

Date: 2026-06-18
Machine notes: Linux local workspace, Node `v22.22.3` via nvm, pnpm `10.29.3` via Corepack. Same host as the 0001 baseline.
Source state: Opzava post-First-R&D-Queue (ARD 0005 accepted same day). Built on the inherited upstream agent-orchestration base plus the full `src/opzava/` product namespace.
Dataset or fixture: repository working tree; Vitest unit suite + governance `node:test` checks.

## Purpose

Refresh the status snapshot from `0001-local-baseline.md`. The 0001 baseline was recorded before the Opzava product layers existed (98 test files / 1078 tests). This note records the green suite at the point the First R&D Queue was declared complete so future work compares against an accurate current state instead of the pre-build baseline.

## Commands And Results

All commands run from the repo root with Node 22 active. Exit codes are the authoritative signal.

### Typecheck

Command: `pnpm typecheck`
Result: exit `0`. `tsc --noEmit` produced no diagnostics.

### Unit tests

Command: `pnpm test`
Result: exit `0`.

```text
Test Files  247 passed (247)
     Tests  1783 passed (1783)
```

### Lint

Command: `pnpm lint`
Result: exit `0`. `0 errors`, `124 warnings` (warnings only — no fixable blockers).

### Production build

Command: `pnpm build`
Result: exit `0`. Compiled successfully; static generation completed.

```text
✓ Compiled successfully in 21.4s
✓ Generating static pages using 15 workers (124/124) in 471.9ms
```

### Governance checks

Command: `node --test test/*.test.mjs`
Result: exit `0`. Branding, folder-structure, code-simplicity, production-grade-complexity, context, and opzava-ard checks pass.

## Size And Scope (current)

```text
src/ total                              143,231 lines (TS/TSX)
src/opzava/ total                        ~27,800 lines across 268 files
  ├─ source files (non-test)              132
  └─ test files                           136
src/components/panels                     44 panels
src/app/api route handlers                165
```

## What Is Built (against the 13-layer plan)

- Layer 0–3: shared language, golden principles, folder/branding/simplicity/complexity gates, local harness, and the measured baseline are all in place.
- Layer 4: domain contracts and state machines for workflows, steps, jobs, attempts, approvals, admin config, secret references, external actions, and content quality reviews.
- Layer 5: durable runner — jobs, attempts, leases, dead letters, operational events, recovery/replay, SQLite contention handling, retention.
- Layer 6: content workflow end to end (intake → research → SEO brief → outline → draft → fact check → brand review → anti-slop → approval → WordPress draft) plus campaign/email workflow.
- Layer 7: provider contract with mock + live adapters (WordPress live draft publisher, Resend live sender), approval-gated, exactly-once external calls.
- Layer 8: admin settings, secret references, redaction, audit, runtime loader, WordPress + Resend connection config.
- Layer 9: UI panels (team dashboard, content runs, artifacts, approval queue, ops failures/dead letters, ops costs, campaigns, maintenance) and the `src/app/api/{ops,campaigns,team,connections}` surfaces wired to `@/opzava`.
- Layer 10–12: architecture entropy guard (no import cycles, layering), eslint complexity ratchet on `src/opzava`, governance `node:test` checks, recurring GC discipline.
- ARD 0006: SQLite-first schema confirmed Postgres-compatible (portable types, `ON CONFLICT` upserts, closure-hidden SQL).

## Not Measured This Session

Wall-clock timings for typecheck / lint / test were not re-timed with `/usr/bin/time` in this snapshot. Use `0001-local-baseline.md` for the timed-measurement methodology; the values above are counts and exit codes captured from the live run logs.

## Interpretation

The project is functionally complete against its First-Done definition: the full gate (typecheck, unit tests, governance checks, lint, production build) is green, and every layer of the implementation plan is delivered and exercised by tests. The remaining open work is product expansion (the Next R&D Queue in ARD 0005), not foundational build-out.

## Follow-Ups

- Re-record timed wall-clock measurements when a performance-sensitive change lands, against this snapshot as the new current baseline.
- Update README/CHANGELOG branding to Opzava (the app-source rebrand is enforced green by `test/branding.test.mjs`; the public docs are not yet covered by that gate).
- The "Not Yet Measured" runner/workflow timing items in `0001` can now be measured end to end against real mocked-workflow execution.
